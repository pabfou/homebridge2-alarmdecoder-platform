# homebridge2-alarmdecoder-platform

Homebridge 2.0 dynamic platform plugin for the [AlarmDecoder](https://alarmdecoder.com) interface to Honeywell/DSC and Interlogix (GE Security / Caddx / NetworX) alarm panels.

This plugin is a Homebridge 2.0–compatible fork of [homebridge-alarmdecoder-platform](https://github.com/aficustree/homebridge-alarmdecoder-platform) by aficustree, updated for modern Homebridge APIs and extended with additional features.

**Requirements:**

- **Node.js ≥ 22**
- **Homebridge ≥ 1.8.0** (fully compatible with Homebridge 2.0)
- For DSC/Honeywell: a running [AlarmDecoder WebApp](https://www.alarmdecoder.com/wiki/index.php/AlarmDecoder_WebApp) with REST API enabled
- For Interlogix/GE: the [NX584 Interface Library](https://github.com/kk7ds/pynx584) by kk7ds

## What's New vs. the Original

- **Homebridge 2.0 compatible** — ESM module, Promise-based characteristic handlers, updated `registerPlatform` API
- **`enableNightMode` config option** — hide Night arm mode from HomeKit if your panel doesn't support it
- **"clear" switch** — momentary switch that sends the clear/off sequence and auto-resets after 1 second
- **Updated dependencies** — axios 1.x (security fixes over 0.21.x), debug 4.x

## Installation

```bash
npm install -g homebridge2-alarmdecoder-platform
```

Or via Homebridge UI: search for `homebridge2-alarmdecoder-platform`.

## Zone Naming Convention

Zones are named automatically from the AlarmDecoder WebApp (or `config.ini` for Interlogix). The zone name determines the HomeKit accessory type:

| Keyword in name | HomeKit type |
|---|---|
| `motion` | Motion Sensor |
| `smoke` | Smoke Sensor |
| `carbon` | Carbon Monoxide Sensor |
| *(anything else)* | Contact Sensor (default) |

Set zone names in the AlarmDecoder WebApp under **Settings → Zones**.

## Configuration

Use the Homebridge UI (config-ui-x) for a guided setup, or edit `config.json` directly.

Platform alias: `"AlarmDecoderPlatform"`

### Honeywell Example

```json
{
  "platforms": [
    {
      "platform": "AlarmDecoderPlatform",
      "name": "My Alarm",
      "DSCorHoneywell": "Honeywell",
      "port": 8888,
      "key": "YOUR_API_KEY",
      "stateURL": "http://YOURIP:YOURPORT/api/v1/alarmdecoder",
      "zoneURL": "http://YOURIP:YOURPORT/api/v1/zones",
      "setURL": "http://YOURIP:YOURPORT/api/v1/alarmdecoder/send",
      "setPIN": "1234",
      "panicKey": "<S1>",
      "chimeKey": "9",
      "enableNightMode": true,
      "useSwitches": ["panic", "chime", "clear"]
    }
  ]
}
```

See also: [sample-dsc-config.json](./sample-dsc-config.json), [sample-interlogix-config.json](./sample-interlogix-config.json)

### Key Options

| Option | Required | Description |
|---|---|---|
| `name` | Yes | Display name for the security system in HomeKit |
| `DSCorHoneywell` | Yes | Panel type: `"Honeywell"`, `"DSC"`, or `"Interlogix"` |
| `port` | Yes | Port Homebridge listens on for push notifications from AlarmDecoder |
| `stateURL` | Yes | URL for alarm state (AlarmDecoder REST API) |
| `zoneURL` | Yes | URL for zone list |
| `setURL` | Yes | URL for sending keypad commands |
| `setPIN` | Yes | Alarm PIN (base digits only, e.g. `"1234"`) |
| `key` | Honeywell/DSC | API key from AlarmDecoder WebApp |
| `enableNightMode` | No | Show Night arm mode (default: `true`) |
| `useSwitches` | No | Array of switches to create: `"panic"`, `"chime"`, `"away"`, `"stay"`, `"night"`, `"clear"` |
| `panicKey` | No | Key sequence for panic (Honeywell/DSC only) |
| `chimeKey` | No | Key for chime toggle (Honeywell/DSC only) |
| `offKey` | No | Key appended to PIN for clear command (default: `"1"`) |
| `DSCStay` | DSC only | Stay arm sequence (e.g. `"<F4>"`) |
| `DSCAway` | DSC only | Away arm sequence (e.g. `"<S5>"`) |
| `DSCReset` | DSC only | Reset sequence (e.g. `"<S7>"`) |
| `DSCExit` | DSC only | Exit sequence (e.g. `"<S8>"`) |

### Security Note on `useSwitches`

Using `away`, `stay`, or `night` switches lets Siri arm/disarm the system **without the HomeKit security prompt** (i.e., without unlocking your device first). `panic`, `chime`, and `clear` are safe. Only enable arm/disarm switches if you're using them for automations where you accept this trade-off.

## AlarmDecoder WebApp Notification Setup (Honeywell/DSC)

1. Open the AlarmDecoder WebApp → Settings → Notifications → New Notification
2. Notification Type: **Custom**
3. Under **Notification Events**, tick:
   - Alarm system is triggered / stops signaling
   - A panic has been detected
   - A fire is detected
   - Alarm system is armed / disarmed
   - A zone has faulted / been restored
4. Under **Custom Settings**:
   - URL: `http://HOMEBRIDGE_IP:PORT` (matches `port` in config)
   - Path: `/`
   - Method: **POST**

## Extending to Other Panels

An [abstract base class](./alarmsystems/base.js) is provided. Implement `getAlarmState()`, `setAlarmState(state)`, and `initZones()`, then add a detection branch in `index.js`.

## License

Copyright 2018 [aficustree](https://github.com/aficustree). Modifications copyright 2025 pabfou.

Licensed under the [Apache License, Version 2.0](./LICENSE).
