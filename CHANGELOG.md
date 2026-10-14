# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Anker SOLIX systems in Gladys, through the Anker cloud (e-mail, password and
  country of the Anker account): one device per Solarbank (E1600, Solarbank 2
  Pro / Plus / AC, Solarbank 3), MI80 micro-inverter, smart meter (Anker,
  Shelly 3EM / Pro 3EM) and Anker smart plug, plus one device per system.
- Solarbank: battery level, stored energy, charge and discharge power, solar
  power in total and per input, output to the home.
- System: usage mode, home consumption, total solar production as an energy
  index (for the energy monitoring of Gladys 5.2) and today's production.
- Smart meter: grid import and export. Smart plug: power.
- Settings, off by default ("Allow settings", owner account, Solarbank 2 and
  3): usage mode (smart meter, smart plugs, manual plan, AI mode) from the
  device or a scene, output power of the current slot of the manual plan from
  a scene or the widget.
- Scene triggers: usage mode changed outside Gladys, device offline or back.
- "Anker SOLIX" dashboard widget: solar, battery, home and grid flows, battery
  level, usage mode, output preset, today's production, setting forms.
- "Test the connection" action, feature names and messages in English,
  French, German and Spanish, documentation in the four languages.
- The integration reads the cloud on its own timer (every 1, 2 or 5 minutes,
  never faster), publishes only the changes and keeps its logs quiet.

[Unreleased]: https://github.com/guim31/gladys-anker-solix/commits/main
