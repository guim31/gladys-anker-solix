# Anker SOLIX for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for the **Anker
SOLIX** balcony solar batteries: Solarbank E1600, Solarbank 2 (Pro, Plus, AC)
and Solarbank 3, with the Anker smart meter, the Anker smart plugs and the
MI80 micro-inverter, through the Anker cloud (the API of the Anker app).

> **Developed without the hardware: feedback welcome.** The integration is
> built and tested against real answers of the Anker cloud published by
> [anker-solix-api](https://github.com/thomluther/anker-solix-api), not on a
> real installation.

This project is not affiliated with, endorsed by or sponsored by Anker
Innovations. Anker, SOLIX and Solarbank are trademarks of their owners.

## Features

- **One device per Solarbank, micro-inverter, smart meter and smart plug** of
  each Anker system, plus one **system** device:
  - Solarbank: battery level (%), stored energy (kWh), charge and discharge
    power, solar power in total and per input (Solarbank 2/3), output to the
    home (W);
  - system: usage mode, home consumption, total solar production (kWh index,
    for the energy monitoring of Gladys 5.2), today's production;
  - smart meter (Anker, Shelly 3EM / Pro 3EM): grid import and export (W);
  - smart plug: power (W); MI80: solar power (W).
- **Settings, off by default** ("Allow settings", owner account, Solarbank 2
  and 3 only): the usage mode (smart meter, smart plugs, manual plan, AI mode)
  and the output power of the current slot of the manual plan. Nothing else
  is ever written.
- **Scene triggers**: usage mode changed outside Gladys; device offline or
  back. **Scene actions**: set the output power, set the usage mode.
- **Dashboard widget**: solar → battery → home / grid, battery gauge, usage
  mode, output preset, today's production, setting forms (Gladys 5.2).
- Four languages (English, French, German, Spanish) for the configuration, the
  feature names, the messages and the [documentation](docs/en.md).

## Requirements

- Gladys **5.2.0** or later.
- An Anker account with a system set up in the Anker app. A second account
  with which the system is shared is recommended (read-only); the settings
  need the owner account. See the [documentation](docs/en.md#requirements).

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-anker-solix` (or install it from the store
   once published).
2. In **Configuration**, enter the e-mail, the password and the country of the
   Anker account, then **Test the connection**.
3. Add the devices from the **Discovery** tab.

## How it works

- Login: `passport/login` with the password encrypted by an ECDH (P-256) key
  exchange with the Anker server and AES-256-CBC, as the Anker app does. The
  session token is kept in `/data`, never the password.
- Refresh: the container reads `get_scen_info` for each system with a device
  in Gladys, on its own timer (1, 2 or 5 minutes: the cloud does not refresh
  faster), and today's production (`energy_analysis`) every 5 minutes. One
  request at a time, at least 0.5 s apart: the cloud limits each endpoint to
  about ten requests per minute. The core's `onPoll` is only a fallback
  (GladysAssistant/Gladys#3198).
- Settings: read-modify-write of the Solarbank 2/3 schedule (device parameter
  type 6), sending back the plans of the Anker app untouched except the
  current slot.

## Limitations

- Developed without the hardware (see above).
- Cloud only, with 1 to 5 minutes of delay; an Anker API change breaks it.
- Settings for the Solarbank 2 and 3 only; the Solarbank 1 is read-only.
- Portable power stations, Power Panels and X1 systems are not supported (the
  cloud gives their values over MQTT only). Solarbank 4 and Max: basic values
  when listed in a system, untested.
- Smart plugs are read, not switched.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test              # node --test: unit tests, fake Gladys, simulated Anker cloud
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
node scripts/probe.mjs                           # real cloud, fake account: clean refusal expected
ANKER_EMAIL=... ANKER_PASSWORD=... ANKER_COUNTRY=FR node scripts/probe.mjs   # read-only
```

```
index.js                SDK wiring (src/app.js registers the handlers)
src/app.js              discovery, refresh timer, states, settings, triggers
src/anker/client.js     Anker cloud client (login, session, quotas, errors)
src/anker/crypto.js     ECDH + AES password encryption of the login
src/anker/model.js      reading get_scen_info (pure)
src/anker/schedule.js   Solarbank 2/3 schedule changes (pure)
src/devices.js          systems -> Gladys devices and states (pure)
src/widgets.js          "Anker SOLIX" dashboard widget (pure)
src/i18n.js             texts in English, French, German and Spanish
test/fixtures/anker/    real cloud answers (anker-solix-api), anonymized
```

`test/gladys-rules.test.js` checks every discovered device against the
category/type table extracted from the Gladys core.

Releases are made by the **Release** workflow (Actions → Release); never edit
the versions by hand. A hand-pushed `vX.Y.Z` tag also builds the image and the
GitHub Release, but then `version` in `package.json` and in the manifest (with
the `docker_image` tag) must be bumped and committed before tagging. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [anker-solix-api](https://github.com/thomluther/anker-solix-api) by
  thomluther and contributors (MIT): the login and its encryption, the
  endpoints, the meaning of the fields, the quotas, and the example answers
  used as test fixtures (`test/fixtures/anker/`, anonymized again).
- [ha-anker-solix](https://github.com/thomluther/ha-anker-solix) (MIT), the
  Home Assistant integration built on it: the account and settings caveats.
- [Gladys Assistant](https://github.com/GladysAssistant/Gladys) and its
  integration template and SDK (Apache-2.0).

## License

[Apache-2.0](LICENSE).
