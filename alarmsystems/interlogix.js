import { AlarmBase, AlarmZone } from './base.js';
import axios from 'axios';

export class Interlogix extends AlarmBase {
    constructor(log, config) {
        super(log);
        this.axiosConfig = {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        };
        this.stateURL = config.stateURL;
        this.zoneURL = config.zoneURL;
        this.setURL = config.setURL;
        this.setPIN = config.setPIN;
    }

    async getAlarmState() {
        let response = null;
        try {
            response = await axios.get(this.zoneURL, this.axiosConfig);
            if ((response.status === 200 || response.status === 204) && response.data && response.data.zones.length > 0) {
                response.data['zones'].forEach((element) => {
                    this.alarmZones.find(v => v.zoneID === element.number).faulted = element.state;
                });
            } else {
                throw 'getAlarmState failed or generated null data at zone query with response status of ' +
                    response.status + ' and data of: ' + JSON.stringify(response.data);
            }

            response = await axios.get(this.stateURL, this.axiosConfig);
            if ((response.status === 200 || response.status === 204) && response.data) {
                const mainPartition = response.data['partitions'][0];
                const stayArmed = mainPartition.condition_flags.includes('Entryguard (stay mode)');
                if (!(mainPartition.armed || mainPartition.condition_flags.includes('Instant')))
                    this.state = 3;
                else {
                    const alarmingConditions = ['Siren on', 'Steady siren on', 'Fire'];
                    if (alarmingConditions.some(element => mainPartition.condition_flags.includes(element)))
                        this.state = 4;
                    else if (stayArmed)
                        this.state = 0;
                    else if (mainPartition.condition_flags.includes('Instant'))
                        this.state = 2;
                    else
                        this.state = 1;
                }
            } else {
                throw 'getAlarmState failed at partition query with response status of ' + response.status;
            }

            return true;
        } catch (e) {
            this.log(e);
            return false;
        }
    }

    /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
    async setAlarmState(state) {
        this.state = state;
        try {
            switch (state) {
            case 0:
                this.axiosConfig.params = { 'cmd': 'arm', 'type': 'stay' };
                break;
            case 1:
                this.axiosConfig.params = { 'cmd': 'arm', 'type': 'exit' };
                break;
            case 2:
                this.axiosConfig.params = { 'cmd': 'arm', 'type': 'auto' };
                break;
            case 3:
                this.axiosConfig.params = { 'cmd': 'disarm', 'type': 'stay', 'master_pin': this.setPIN };
                break;
            case 4:
                throw 'panic button not supported';
            case 'chime':
                throw 'chime button not supported';
            }
            const response = await axios.get(this.setURL, this.axiosConfig);
            if (response.status === 200 || response.status === 204)
                return true;
            else
                throw 'setAlarmState failed with response status of ' + response.status;
        } catch (e) {
            this.log(e);
            return false;
        }
    }

    async initZones() {
        try {
            const response = await axios.get(this.zoneURL, this.axiosConfig);
            if ((response.status === 200 || response.status === 204) && response.data && response.data.zones.length > 0) {
                response.data['zones'].forEach(element =>
                    this.alarmZones.push(new AlarmZone(element.number, element.name, JSON.stringify(element.type_flags)))
                );
            } else {
                throw 'initZones failed or generated null data with response status of ' +
                    response.status + ' with data of ' + JSON.stringify(response.data);
            }
            return true;
        } catch (e) {
            this.log(e);
            return false;
        }
    }
}
