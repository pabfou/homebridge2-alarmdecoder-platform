export class AlarmZone {
    constructor(zoneID, name, description) {
        this.zoneID = zoneID;
        this.name = name;
        this.description = description;
        this.faulted = false;
    }
}

export class AlarmBase {
    constructor(log) {
        this.state = null;
        /* HomeKit-valid arm/disarm intent (0=stay, 1=away, 2=night, 3=disarmed),
           computed from the armed flags only so it never becomes 4 (alarm). Used to
           drive SecuritySystemTargetState. */
        this.targetState = 3;
        this.log = log;
        this.alarmZones = [];
    }

    async getAlarmState() {
        throw 'must implement function updating alarm system state and state of all zones';
    }

    async setAlarmState(state) {
        this.state = state;
        throw 'must implement function updating alarm system state';
    }

    async initZones() {
        throw 'must implement functions to populate Zones with AlarmDecoderZone(s)';
    }
}
