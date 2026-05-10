import { AlarmBase, AlarmZone } from './base.js';
import createDebug from 'debug';
import axios from 'axios';

const debug = createDebug('alarmdecoder');

export class HoneywellDSC extends AlarmBase {
    constructor(log, config) {
        super(log);
        this.lastlogmsg = '';
        this.key = config.key;
        this.stateURL = config.stateURL;
        this.zoneURL = config.zoneURL;
        this.setURL = config.setURL;
        this.setPIN = config.setPIN;
        this.panicKey = config.panicKey;
        this.chimeKey = config.chimeKey;
        this.offKey = config.offKey || '1';
        let rePlatformType = new RegExp('dsc', 'i');
        if (rePlatformType.exec(config.DSCorHoneywell)) {
            this.isDSC = true;
            this.DSCAway = config.DSCAway;
            this.DSCStay = config.DSCStay;
            this.DSCReset = config.DSCReset;
            this.DSCExit = config.DSCExit;
        }
        this.axiosHeaderConfig = {
            headers: {
                'Authorization': this.key,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        };
    }

    async initZones() {
        try {
            this.log('init zones');
            const response = await axios.get(this.zoneURL, this.axiosHeaderConfig);
            if (response.status !== 200 || !response.data)
                throw 'initZones failed or generated null data with response status of ' + response.status;
            for (let zone in response.data['zones']) {
                zone = response.data['zones'][zone];
                this.alarmZones.push(new AlarmZone(zone.zone_id, zone.name, zone.description));
            }
            return true;
        } catch (e) {
            this.log(e);
            return false;
        }
    }

    async getAlarmState() {
        try {
            const response = await axios.get(this.stateURL, this.axiosHeaderConfig);
            if ((response.status === 200 || response.status === 204) && response.data) {
                let stateObj = response.data;
                if (stateObj.last_message_received &&
                    (stateObj.last_message_received.includes('NIGHT') ||
                     stateObj.last_message_received.includes('INSTANT')))
                    stateObj.panel_armed_night = true;

                /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
                const astate = JSON.stringify(stateObj);
                if (this.lastlogmsg !== astate) {
                    this.log(astate);
                    this.lastlogmsg = astate;
                }
                if (stateObj.panel_alarming || stateObj.panel_panicked || stateObj.panel_fire_detected)
                    this.state = 4;
                else if (stateObj.panel_armed_night)
                    this.state = 2;
                else if (stateObj.panel_armed_stay)
                    this.state = 0;
                else if (stateObj.panel_armed)
                    this.state = 1;
                else
                    this.state = 3;

                for (let alarmZone in this.alarmZones) {
                    alarmZone = this.alarmZones[alarmZone];
                    alarmZone.faulted = stateObj.panel_zones_faulted.indexOf(alarmZone.zoneID) !== -1;
                }
                return true;
            } else {
                throw 'getAlarmState failed with response status of ' + response.status;
            }
        } catch (e) {
            this.log(e);
            return false;
        }
    }

    /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
    async setAlarmState(state) {
        let codeToSend = null;
        switch (state) {
        case 0:
            codeToSend = this.isDSC ? this.DSCStay : this.setPIN + '3';
            break;
        case 1:
            codeToSend = this.isDSC ? this.DSCAway : this.setPIN + '2';
            break;
        case 2:
            codeToSend = this.setPIN + '33';
            break;
        case 3:
            codeToSend = this.setPIN + '1';
            break;
        case 4:
            codeToSend = this.panicKey;
            state = true;
            break;
        case 'chime':
            codeToSend = this.setPIN + this.chimeKey;
            state = true;
            break;
        case 'clear':
            codeToSend = this.setPIN + this.offKey + this.setPIN + this.offKey;
            state = true;
            break;
        }
        const body = JSON.stringify({ keys: codeToSend });
        try {
            if (this.isDSC && state === 3 && this.state === 3) {
                debug('disarm request for DSC panel but system is already disarmed, ignoring');
                return true;
            }
            const response = await axios.post(this.setURL, body, this.axiosHeaderConfig);
            if (response.status === 200 || response.status === 204)
                return true;
            else
                throw 'setAlarmState failed with response status of ' + response.status;
        } catch (err) {
            this.log(err);
            return false;
        }
    }
}
