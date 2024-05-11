/* eslint-disable no-undef */
// @ts-nocheck
'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
// @ts-ignore
const helper = require(`${__dirname}/lib/utils`);
const axios = require(`axios`);
const { parseString } = require('xml2js');

let ip;
let apiClient;

// Load your modules here, e.g.:
// const fs = require("fs");

class Bluesound extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'bluesound',
        });
        this.apiClient = null;
        this.on('ready', this.onReady.bind(this));
        // @ts-ignore
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        // @ts-ignore
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // Reset the connection indicator during startup
        this.setState('info.connection', false, true);
        ip = this.config.IP;
        // @ts-ignore
        const promises = [];

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        if (ip) {
            this.log.info('[Start] Starting adapter bluesound with: ' + ip);
        } else {
            this.log.warn('[Start] No IP Address set');
        }

        const pollingTime = parseFloat(this.config.PollingTime) || 30000;
        this.log.info('[Start] PollingTime: ' + pollingTime);

        /*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/

        apiClient = axios.create({
            baseURL: `http://${ip}:11000/`,
            timeout: 1000,
            resonseType: 'xml',
            resonseEncoding: 'utf8',
        });
        /*        this.apiClient = axios.create({
            baseURL: `http://${ip}:11000/`,
            timeout: 1000,
            resonseType: 'xml',
            resonseEncoding: 'utf8',
        });
        */
        // set Info

        let sNameTag = this.namespace + '.info.name';
        this.subscribeStates(sNameTag);
        const sModelNameTag = this.namespace + '.info.modelname';
        this.subscribeStates(sModelNameTag);
        try {
            const response = await apiClient.get('/SyncStatus');
            if (response.status === 200) {
                const data = response.data;
                const parser = new RegExp('name="(.+)(?=" etag)');
                const sName = parser.exec(data)[1];
                this.setState(sNameTag, sName, true);
                const parser1 = new RegExp('modelName="(.+)(?=" model)');
                const sModelName = parser1.exec(data)[1];
                this.setState(sModelNameTag, sModelName, true);
            } else {
                this.log.error('Could not retrieve data, Status code ' + response.status);
            }
        } catch (e) {
            console.error('Could not retrieve data: ' + e);
        }

        // Initialize Control

        // stop = false
        sNameTag = this.namespace + '.control.stop';
        this.subscribeStates(sNameTag);
        this.setState(sNameTag, false, true);
        // pause = false
        sNameTag = this.namespace + '.control.pause';
        this.subscribeStates(sNameTag);
        this.setState(sNameTag, false, true);
        // play = false
        sNameTag = this.namespace + '.control.play';
        this.subscribeStates(sNameTag);
        this.setState(sNameTag, false, true);
        // state = ""
        sNameTag = this.namespace + '.control.state';
        this.subscribeStates(sNameTag);
        this.setState(sNameTag, '', true);

        // volume from player

        try {
            const response = await apiClient.get('/Volume');
            if (response.status === 200) {
                const data = response.data;
                const parser1 = RegExp('>(.+)(?=<)');

                sNameTag = this.namespace + '.control.volume';
                this.subscribeStates(sNameTag);
                this.setState(sNameTag, parseInt(parser1.exec(data)[1]), true);

                sNameTag = this.namespace + '.info.volume';
                this.subscribeStates(sNameTag);
                this.setState(sNameTag, parseInt(parser1.exec(data)[1]), true);
            } else {
                this.log.error('Could not retrieve data, Status code ' + response.status);
            }
        } catch (e) {
            this.log.error('Could not retrieve data: ' + e);
        }

        // Presets

        try {
            const response = await apiClient.get('/Presets');
            if (response.status == 200) {
                const result = response.data;
                // eslint-disable-next-line no-control-regex
                const parser = RegExp('preset(.+)\n', 'g');
                // @ts-ignore
                let data = [];
                // @ts-ignore
                let i = 1;
                while ((data = parser.exec(result)) != null) {
                    if (data[1].substring(0, 4) == ' url') {
                        let parser1 = RegExp('id="(.+)(?=" name)');
                        // @ts-ignore
                        const sPresetID = parser1.exec(data[1])[1];
                        parser1 = RegExp('name="(.+)(?=" image)');
                        // @ts-ignore
                        const sPresetName = parser1.exec(data[1])[1];
                        parser1 = RegExp('image="(.+)(?="/)');
                        // @ts-ignore
                        const sPresetImage = parser1.exec(data[1])[1];
                        // @ts-ignore
                        const data1 = {
                            id: sPresetID,
                            name: sPresetName,
                            image: sPresetImage,
                            start: false,
                        };
                        const objs = helper.getPresets(i);

                        for (const obj of objs) {
                            const id = obj._id;
                            delete obj._id;
                            promises.push(this.setObjectNotExistsAsync(id, obj));
                            if (obj.type != 'channel') {
                                const sTag = this.namespace + `.presets.preset${i}.${obj.common.name}`;
                                for (const x in data1) {
                                    if (x == obj.common.name) {
                                        this.subscribeStates(sTag);
                                        if (obj.common.type == 'number') {
                                            this.setState(sTag, parseInt(data1[x]), true);
                                        } else {
                                            this.setState(sTag, data1[x], true);
                                        }
                                    }
                                }
                            }
                        }
                        i = i + 1;
                    }
                }
                await Promise.all(promises);
            } else {
                this.log.error('Could not retrieve data, Status code ' + response.status);
            }
        } catch (e) {
            this.log.error('Could not retrieve data: ' + e);
        }

        // Status

        this.readPlayerStatus();

        // Polling

        this.startPolling(pollingTime);

        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        // this.subscribeStates('testVariable');
        // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
        // this.subscribeStates('lights.*');
        // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
        // this.subscribeStates('*');

        /*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
        // the variable testVariable is set to true as command (ack=false)
        // await this.setStateAsync('testVariable', true);

        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
        // await this.setStateAsync('testVariable', { val: true, ack: true });

        // same thing, but the state is deleted after 30s (getState will return null afterwards)
        // await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });

        // examples for the checkPassword/checkGroup functions
        let result = await this.checkPasswordAsync('admin', 'iobroker');
        this.log.info('check user admin pw iobroker: ' + result);

        result = await this.checkGroupAsync('admin', 'admin');
        this.log.info('check group user admin group admin: ' + result);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    // @ts-ignore
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            // @ts-ignore
            callback();
        } catch (e) {
            // @ts-ignore
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    // @ts-ignore
    onStateChange(id, state) {
        // @ts-ignore
        if (state) {
            // The state was changed
            // @ts-ignore
            if (state.val) {
                const pos = id.lastIndexOf('.');
                switch (id.substring(pos + 1)) {
                    case 'start':
                        this.getState(id.substring(0, pos) + '.id', (err, status) => {
                            if (status || status.val) {
                                const preset = status.val;
                                apiClient
                                    .get(`/Preset?id=${preset}`)
                                    .then((response) => {
                                        // Handle response
                                        const result = response.data;
                                        const parser1 = RegExp('<state>(.+)(?=<)');
                                        const sStateTag = this.namespace + '.control.state';
                                        this.subscribeStates(sStateTag);
                                        this.setState(sStateTag, parser1.exec(result)[1], true);
                                        this.log.info(`${this.namespace} Preset${preset} Start`);
                                    })
                                    .catch((err) => {
                                        // Handle errors
                                        //									adapter.log.error("Could not start preset, Status code " + response.status);
                                        this.log.error('Could not start preset, Status code ' + err);
                                    });
                                this.readPlayerStatus();
                            }
                        });
                        break;
                    case 'pause':
                        apiClient
                            .get('/Pause?toggle=1')
                            .then((response) => {
                                // Handle response
                                const result = response.data;
                                const parser1 = RegExp('<state>(.+)(?=<)');
                                const sStateTag = this.namespace + '.control.state';
                                this.subscribeStates(sStateTag);
                                this.setState(sStateTag, parser1.exec(result)[1], true);
                                this.log.info(`${this.namespace} Pause`);
                            })
                            .catch((err) => {
                                // Handle errors
                                this.log.error('Could not retrieve data, Status code ' + err);
                            });
                        this.readPlayerStatus();
                        break;
                    case 'stop':
                        apiClient
                            .get('/Stop')
                            .then((response) => {
                                // Handle response
                                const result = response.data;
                                const parser1 = RegExp('<state>(.+)(?=<)');
                                const sStateTag = this.namespace + '.control.state';
                                this.subscribeStates(sStateTag);
                                this.setState(sStateTag, parser1.exec(result)[1], true);
                                this.log.info(`${this.namespace} Stop`);
                            })
                            .catch((err) => {
                                // Handle errors
                                this.log.error('Could not retrieve data, Status code ' + err);
                            });
                        this.clearPlayerStatus();
                        break;
                    case 'stream':
                    case 'play':
                        apiClient
                            .get('/Play')
                            .then((response) => {
                                // Handle response
                                const result = response.data;
                                const parser1 = RegExp('<state>(.+)(?=<)');
                                const sStateTag = this.namespace + '.control.state';
                                this.subscribeStates(sStateTag);
                                this.setState(sStateTag, parser1.exec(result)[1], true);
                                this.log.info(`${this.namespace} Play`);
                            })
                            .catch((err) => {
                                // Handle errors
                                this.log.error('Could not retrieve data, Status code ' + err);
                            });
                        this.readPlayerStatus();
                        break;
                    case 'volume':
                        apiClient
                            .get(`/Volume?level=${state.val}`)
                            .then()
                            .catch((err) => {
                                // Handle errors
                                this.log.error('Could not retrieve data, Status code ' + err);
                            });
                        break;
                    default:
                        this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                }
            }
        } else {
            // The state was deleted
            // @ts-ignore
            this.log.info(`state ${id} deleted`);
        }
    }

    stripHTML(str) {
        const strneu = str.replace('&amp;', '&');
        return strneu;
    }

    convertSecs(secs) {
        const date = new Date(null);
        date.setSeconds(secs);

        let res = '';

        if (secs >= 3600) {
            res = date.toISOString().slice(11, 19);
        } else {
            res = date.toISOString().slice(14, 19);
        }

        return res;
    }

    startPolling(pTime) {
        let polling;
        if (!polling) {
            polling = this.setInterval(() => {
                this.readPlayerStatus();
            }, pTime);
        }
    }

    async clearPlayerStatus() {
        let i;
        this.subscribeStates(this.namespace + '.info.title*');
        for (i = 1; i < 4; i++) {
            const sStateTag = this.namespace + `.info.title${i}`;
            await this.setStateAsync(sStateTag, { val: '', ack: true });
        }
    }

    async readPlayerStatus() {
        const promises = [];
        const title = [];
        let i;
        let varSecs;
        let strSecs;

        for (i = 1; i < 4; i++) {
            title[i] = '';
        }
        try {
            const response = await apiClient.get('/Status');
            if (response.status === 200) {
                const result = response.data;
                parseString(response.data, (err, result) => {
                    if (err) {
                        this.log.error('Error parsing XML:' + err);
                        return;
                    }
                    title[1] = result.status.title1[0];
                    title[2] = result.status.title2[0];
                    title[3] = result.status.title3[0];
                    varSecs = result.status.secs[0];
                    strSecs = this.convertSecs(varSecs);
                });
                /*                let parser = RegExp('title(.+)(?=<)', 'g');
                let data = [];
                while ((data = await parser.exec(result)) != null) {
                    i = data[1].substring(0, 1);
                    title[i] = this.stripHTML(data[1].substring(2));
                }

                let parser = RegExp('<secs>(.+)(?=<)');
                const varSecs = parser.exec(result)[1];
                const strSecs = this.convertSecs(varSecs);
*/
                let parser = RegExp('<totlen>(.+)(?=<)');

                let varTotLen = 28800;
                if (parser.test(result)) {
                    varTotLen = parser.exec(result)[1];
                }
                const strTotLen = this.convertSecs(varTotLen);

                parser = RegExp('<image>(.+)(?=<)');
                let imageUrl = parser.exec(result)[1];

                if (imageUrl.substring(0, 4) != 'http') {
                    imageUrl = `http://${ip}:11000` + imageUrl;
                }

                parser = RegExp('<volume>(.+)(?=<)');
                const varVolume = parser.exec(result)[1];

                await Promise.all(promises);

                parser = RegExp('<state>(.+)(?=<)', 'g');
                const pState = await parser.exec(result)[1];
                const pStateOld = await this.getStateAsync(this.namespace + '.control.state');

                //			adapter.log.info(`Old: ${pStateOld.val}, New: ${pState}`);

                if (pState != pStateOld.val) {
                    const sStateTag = this.namespace + '.control.state';
                    this.subscribeStates(sStateTag);
                    await this.setStateAsync(sStateTag, { val: pState, ack: true });
                }

                if (pState == 'stream' || pState == 'play') {
                    this.subscribeStates(this.namespace + '.info.title*');

                    for (i = 1; i < 4; i++) {
                        const sStateTag = this.namespace + `.info.title${i}`;
                        await this.setStateAsync(sStateTag, { val: title[i], ack: true });
                    }

                    let sStateTag = this.namespace + '.info.secs';
                    this.subscribeStates(sStateTag);
                    await this.setStateAsync(sStateTag, { val: parseInt(varSecs), ack: true });

                    sStateTag = this.namespace + '.info.totlen';
                    this.subscribeStates(sStateTag);
                    await this.setStateAsync(sStateTag, { val: parseInt(varTotLen), ack: true });

                    sStateTag = this.namespace + '.info.str_secs';
                    this.subscribeStates(sStateTag);
                    await this.setStateAsync(sStateTag, { val: strSecs, ack: true });

                    sStateTag = this.namespace + '.info.str_totlen';
                    this.subscribeStates(sStateTag);
                    await this.setStateAsync(sStateTag, { val: strTotLen, ack: true });

                    sStateTag = this.namespace + '.info.image';
                    this.subscribeStates(sStateTag);
                    await this.setStateAsync(sStateTag, { val: imageUrl, ack: true });

                    sStateTag = this.namespace + '.info.volume';
                    this.subscribeStates(sStateTag);
                    await this.setStateAsync(sStateTag, { val: parseInt(varVolume), ack: true });
                } else {
                    for (i = 1; i < 4; i++) {
                        const sStateTag = this.namespace + `.info.title${i}`;
                        await this.setStateAsync(sStateTag, { val: '', ack: true });
                    }

                    let sStateTag = this.namespace + '.info.secs';
                    this.subscribeStates(sStateTag);
                    await this.setStateAsync(sStateTag, { val: 0, ack: true });

                    sStateTag = this.namespace + '.info.totlen';
                    this.subscribeStates(sStateTag);
                    await this.setStateAsync(sStateTag, { val: 0, ack: true });

                    sStateTag = this.namespace + '.info.image';
                    this.subscribeStates(sStateTag);
                    await this.setStateAsync(sStateTag, { val: '', ack: true });
                }
            } else {
                this.log.error('Could not retrieve data, Status code ' + response.status);
            }
        } catch (e) {
            this.log.error('Could not retrieve data: ' + e);
        }
        return true;
    }
}

// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
// /**
//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
//  * @param {ioBroker.Message} obj
//  */
// onMessage(obj) {
//     if (typeof obj === 'object' && obj.message) {
//         if (obj.command === 'send') {
//             // e.g. send email or pushover or whatever
//             this.log.info('send command');

//             // Send response in callback if required
//             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
//         }
//     }
// }

// @ts-ignore
if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Bluesound(options);
    // @ts-ignore
} else {
    // otherwise start the instance directly
    new Bluesound();
}
