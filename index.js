import http from 'http';
import createDebug from 'debug';
import * as alarms from './alarmsystems/index.js';

const debug = createDebug('alarmdecoder');

const PLATFORM_NAME = 'AlarmDecoderPlatform';
const PLUGIN_NAME = 'homebridge-alarmdecoder-platform-v2';

let Accessory, Service, Characteristic, UUIDGen;

export default (api) => {
    Accessory = api.platformAccessory;
    Service = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    UUIDGen = api.hap.uuid;
    api.registerPlatform(PLATFORM_NAME, AlarmdecoderPlatform);
};

class AlarmdecoderPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.port = config.port;
        this.name = config.name;
        this.switchAccessories = [];
        this.alarmSystem = null;
        this.createSwitch = config.useSwitches || [];
        this.enableNightMode = config.enableNightMode !== undefined ? config.enableNightMode : true;
        this.zoneAccessories = [];
        this.api = api;

        const platformType = config.DSCorHoneywell || config.platformType;

        let rePlatformType = new RegExp('dsc|honeywell', 'i');
        if (rePlatformType.exec(platformType))
            this.alarmSystem = new alarms.HoneywellDSC(log, config);
        rePlatformType = new RegExp('interlogix|ge|caddx', 'i');
        if (rePlatformType.exec(platformType))
            this.alarmSystem = new alarms.Interlogix(log, config);
        if (!this.alarmSystem) {
            this.log('no system specified, assuming Honeywell, please add DSCorHoneywell to your config.json');
            this.alarmSystem = new alarms.HoneywellDSC(log, config);
        }
        debug('platform class in use: ' + this.alarmSystem.constructor.name);

        this.api.on('didFinishLaunching', () => {
            this.log('Cached Accessories Loaded');
            this.initPlatform();
            this.listener = http.createServer((req, res) => this.httpListener(req, res));
            this.listener.on('error', (err) => {
                this.log('ERROR: unable to start push-notification listener on port ' + this.port +
                    ' (' + err.message + '). Accessories will still update by polling, but push ' +
                    'notifications from the AlarmDecoder WebApp will not work until the port is freed.');
            });
            this.listener.on('listening', () => {
                this.log('listening on port ' + this.port);
            });
            this.listener.listen(this.port);
        });
    }

    configureAccessory(accessory) {
        this.log(accessory.displayName, 'Configuring Accessory from Cache');
        this.addAccessory(accessory, false);
    }

    addAccessory(accessory, publish) {
        this.log('adding accessory ' + accessory.displayName);

        accessory.on('identify', () => {
            this.log(accessory.displayName, 'Identify!!!');
        });

        if (accessory.getService(Service.ContactSensor)) {
            accessory.getService(Service.ContactSensor)
                .getCharacteristic(Characteristic.ContactSensorState)
                .onGet(() => this.getZoneState(accessory.displayName));
            this.zoneAccessories.push(accessory);
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder contact sensor');
        } else if (accessory.getService(Service.MotionSensor)) {
            accessory.getService(Service.MotionSensor)
                .getCharacteristic(Characteristic.MotionDetected)
                .onGet(() => this.getZoneState(accessory.displayName));
            this.zoneAccessories.push(accessory);
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder motion sensor');
        } else if (accessory.getService(Service.CarbonMonoxideSensor)) {
            accessory.getService(Service.CarbonMonoxideSensor)
                .getCharacteristic(Characteristic.CarbonMonoxideDetected)
                .onGet(() => this.getZoneState(accessory.displayName));
            this.zoneAccessories.push(accessory);
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder carbon monoxide sensor');
        } else if (accessory.getService(Service.SmokeSensor)) {
            accessory.getService(Service.SmokeSensor)
                .getCharacteristic(Characteristic.SmokeDetected)
                .onGet(() => this.getZoneState(accessory.displayName));
            this.zoneAccessories.push(accessory);
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder smoke sensor');
        } else if (accessory.getService(Service.SecuritySystem)) {
            accessory.getService(Service.SecuritySystem)
                .getCharacteristic(Characteristic.SecuritySystemCurrentState)
                .setProps({ validValues: this.enableNightMode ? [0, 1, 2, 3, 4] : [0, 1, 3, 4] })
                .onGet(() => this.getAlarmState());
            accessory.getService(Service.SecuritySystem)
                .getCharacteristic(Characteristic.SecuritySystemTargetState)
                .setProps({ validValues: this.enableNightMode ? [0, 1, 2, 3] : [0, 1, 3] })
                .onGet(() => this.getAlarmState())
                .onSet(async (state) => {
                    await this.setAlarmtoState(state);
                    accessory.getService(Service.SecuritySystem)
                        .updateCharacteristic(Characteristic.SecuritySystemCurrentState, state);
                });
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder alarm system');
            this.alarmSystem.accessory = accessory;
        } else if (accessory.getService(Service.Switch)) {
            accessory.getService(Service.Switch)
                .getCharacteristic(Characteristic.On)
                .onGet(() => this.getSwitchState(accessory.displayName))
                .onSet((state) => this.setSwitchState(state, accessory.displayName));
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder state switch');
            this.switchAccessories.push(accessory);
        }

        accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, accessory.displayName)
            .setCharacteristic(Characteristic.Manufacturer, 'honeywell/dsc/interlogix');

        if (publish) {
            this.log('publishing platform accessory ' + accessory.displayName);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
        return accessory;
    }

    async initPlatform() {
        this.log('initializing platform');

        if (!this.alarmSystem.accessory) {
            this.log('adding security system accessory');
            const uuid = UUIDGen.generate(this.name);
            const newAccessory = new Accessory(this.name, uuid);
            newAccessory.addService(Service.SecuritySystem, this.name);
            this.addAccessory(newAccessory, true);
        } else {
            this.log('found security system from cache, skipping');
        }

        if (await this.alarmSystem.initZones()) {
            for (let zone in this.zoneAccessories) {
                const cachedZone = this.zoneAccessories[zone];
                for (let adZone in this.alarmSystem.alarmZones) {
                    const tempZone = this.alarmSystem.alarmZones[adZone];
                    if (cachedZone.displayName === tempZone.zoneID + ' ' + tempZone.name) {
                        this.alarmSystem.alarmZones[adZone].accessory = cachedZone;
                        break;
                    }
                }
            }

            for (let zone in this.alarmSystem.alarmZones) {
                if (!this.alarmSystem.alarmZones[zone].accessory) {
                    const tempZone = this.alarmSystem.alarmZones[zone];
                    const uuid = UUIDGen.generate(tempZone.zoneID + ' ' + tempZone.name);
                    const newAccessory = new Accessory(tempZone.zoneID + ' ' + tempZone.name, uuid);
                    const reMotion = new RegExp('motion', 'i');
                    const reSmoke = new RegExp('smoke', 'i');
                    const reCarbon = new RegExp('carbon', 'i');
                    const zoneName = tempZone.zoneID + ' ' + tempZone.name;
                    if (reMotion.exec(zoneName))
                        newAccessory.addService(Service.MotionSensor, zoneName);
                    else if (reSmoke.exec(zoneName))
                        newAccessory.addService(Service.SmokeSensor, zoneName);
                    else if (reCarbon.exec(zoneName))
                        newAccessory.addService(Service.CarbonMonoxideSensor, zoneName);
                    else
                        newAccessory.addService(Service.ContactSensor, zoneName);
                    this.log(newAccessory);
                    this.alarmSystem.alarmZones[zone].accessory = newAccessory;
                    this.addAccessory(newAccessory, true);
                } else {
                    this.log('found ' + this.alarmSystem.alarmZones[zone].accessory.displayName + ', from cache, skipping');
                }
            }
        }

        for (let foundSwitch in this.switchAccessories) {
            this.log('found switch ' + this.switchAccessories[foundSwitch].displayName + ' from cache, skipping');
            const idx = this.createSwitch.indexOf(this.switchAccessories[foundSwitch].displayName);
            if (idx !== -1)
                this.createSwitch.splice(idx, 1);
        }

        for (let switchType in this.createSwitch) {
            debug('adding switch accessory ' + this.createSwitch[switchType]);
            const uuid = UUIDGen.generate(this.createSwitch[switchType]);
            const newAccessory = new Accessory(this.createSwitch[switchType], uuid);
            newAccessory.addService(Service.Switch, this.createSwitch[switchType]);
            this.addAccessory(newAccessory, true);
            this.switchAccessories.push(newAccessory);
        }

        this._getStateFromAlarm(true);
    }

    httpListener(req, res) {
        let data = '';
        if (req.method === 'POST') {
            req.on('data', (chunk) => { data += chunk; });
            req.on('end', () => {
                debug('Received notification and body data:');
                debug(data.toString());
            });
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end();
        debug('Getting current state since ping received');
        this._getStateFromAlarm(true);
    }

    async _getStateFromAlarm(report = false) {
        try {
            await this.alarmSystem.getAlarmState();
        } catch (e) {
            this.log(e);
            return false;
        }

        if (report) {
            this.alarmSystem.accessory.getService(Service.SecuritySystem)
                .updateCharacteristic(Characteristic.SecuritySystemCurrentState, this.alarmSystem.state);
            if (this.alarmSystem.state <= 3)
                this.alarmSystem.accessory.getService(Service.SecuritySystem)
                    .updateCharacteristic(Characteristic.SecuritySystemTargetState, this.alarmSystem.state);

            let switchToSet = null;
            switch (this.alarmSystem.state) {
            case 0: switchToSet = 'stay'; break;
            case 1: switchToSet = 'away'; break;
            case 2: switchToSet = 'night'; break;
            case 4: switchToSet = 'panic'; break;
            }
            for (let toggle in this.switchAccessories)
                this.switchAccessories[toggle].getService(Service.Switch)
                    .updateCharacteristic(Characteristic.On,
                        this.switchAccessories[toggle].displayName === switchToSet);

            for (let alarmZone in this.alarmSystem.alarmZones) {
                alarmZone = this.alarmSystem.alarmZones[alarmZone];
                if (alarmZone.accessory.getService(Service.MotionSensor)) {
                    alarmZone.accessory.getService(Service.MotionSensor)
                        .updateCharacteristic(Characteristic.MotionDetected, alarmZone.faulted);
                } else if (alarmZone.accessory.getService(Service.ContactSensor)) {
                    alarmZone.accessory.getService(Service.ContactSensor)
                        .updateCharacteristic(Characteristic.ContactSensorState, alarmZone.faulted ? 1 : 0);
                } else if (alarmZone.accessory.getService(Service.CarbonMonoxideSensor)) {
                    alarmZone.accessory.getService(Service.CarbonMonoxideSensor)
                        .updateCharacteristic(Characteristic.CarbonMonoxideDetected, alarmZone.faulted ? 1 : 0);
                } else if (alarmZone.accessory.getService(Service.SmokeSensor)) {
                    alarmZone.accessory.getService(Service.SmokeSensor)
                        .updateCharacteristic(Characteristic.SmokeDetected, alarmZone.faulted ? 1 : 0);
                }
            }
        }

        return true;
    }

    async getZoneState(displayName) {
        debug('getting state for Zone: ' + displayName);
        await this._getStateFromAlarm(false);
        for (let alarmZone in this.alarmSystem.alarmZones) {
            alarmZone = this.alarmSystem.alarmZones[alarmZone];
            if ((alarmZone.zoneID + ' ' + alarmZone.name) === displayName) {
                if (alarmZone.accessory.getService(Service.MotionSensor))
                    return alarmZone.faulted;
                return alarmZone.faulted ? 1 : 0;
            }
        }
        debug('zone ' + displayName + ' not found');
        throw new Error('no zone found: ' + displayName);
    }

    async getAlarmState() {
        debug('getting state for Alarm: ' + this.name);
        if (await this._getStateFromAlarm(false) && this.alarmSystem.state >= 0)
            return this.alarmSystem.state;
        throw new Error('get state failed or null');
    }

    async getSwitchState(switchType) {
        debug('getting state for Switch: ' + switchType);
        await this._getStateFromAlarm(false);
        /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
        if (switchType === 'panic' && this.alarmSystem.state === 4) return true;
        if (switchType === 'stay' && this.alarmSystem.state === 0) return true;
        if (switchType === 'away' && this.alarmSystem.state === 1) return true;
        if (switchType === 'night' && this.alarmSystem.state === 2) return true;
        return false;
    }

    async setSwitchState(state, switchType) {
        debug('setting switch ' + switchType + ' to ' + state);
        if (!state) {
            if (switchType === 'chime' || switchType === 'clear') return;
            await this.setAlarmtoState(Characteristic.SecuritySystemTargetState.DISARM);
        } else {
            if (switchType === 'panic')
                await this.setAlarmtoState(4);
            else if (switchType === 'away')
                await this.setAlarmtoState(Characteristic.SecuritySystemTargetState.AWAY_ARM);
            else if (switchType === 'night')
                await this.setAlarmtoState(Characteristic.SecuritySystemTargetState.NIGHT_ARM);
            else if (switchType === 'stay')
                await this.setAlarmtoState(Characteristic.SecuritySystemTargetState.STAY_ARM);
            else if (switchType === 'chime')
                await this.setAlarmtoState('chime');
            else if (switchType === 'clear') {
                await this.setAlarmtoState('clear');
                setTimeout(() => {
                    const clearSwitch = this.switchAccessories.find(s => s.displayName === 'clear');
                    if (clearSwitch)
                        clearSwitch.getService(Service.Switch)
                            .updateCharacteristic(Characteristic.On, false);
                }, 1000);
            } else {
                throw new Error('invalid switch type: ' + switchType);
            }
        }
    }

    async setAlarmtoState(state) {
        debug('setting alarm state to ' + state);
        if (!await this.alarmSystem.setAlarmState(state))
            throw new Error('set alarm state failed');
    }
}
