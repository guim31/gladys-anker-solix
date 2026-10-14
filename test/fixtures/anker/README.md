# Anker cloud fixtures

Real answers of the Anker power cloud, taken from the `examples/` folder of
[thomluther/anker-solix-api](https://github.com/thomluther/anker-solix-api)
(exports of `export_system.py`, already anonymized by its author), and
anonymized again here: serial numbers, site ids, system names and image URLs
replaced.

Each file is one system: `site` (entry of `get_site_list`), `scene` (`data`
of `get_scen_info`), and when the export had them `schedule` (parsed
`param_data` of `get_site_device_param` type 6) and `energy_today` (part of
`energy_analysis` for today).

| File                        | System                                                            |
| --------------------------- | ----------------------------------------------------------------- |
| `sb1-single.json`           | Solarbank E1600                                                   |
| `sb1-dual-mi80.json`        | two Solarbank E1600 and an MI80 micro-inverter                    |
| `sb2-pro-meter-manual.json` | Solarbank 2 Pro, Anker smart meter, manual plan                   |
| `sb2-pro-plugs.json`        | Solarbank 2 Pro, two smart plugs, smart plug mode                 |
| `sb2-sb1-cascaded.json`     | Solarbank 2 Pro cascaded with two Solarbank E1600, Shelly Pro 3EM |
| `sb2-ac-use-time.json`      | Solarbank 2 AC, Shelly Pro 3EM, time-of-use mode                  |
| `sb3-smart-meter.json`      | Solarbank 3, Shelly Pro 3EM, AI mode                              |
| `sb3-plugs.json`            | Solarbank 3, four smart plugs                                     |
| `sb3-multisystem.json`      | three Solarbank 3, smart meter                                    |

The source data is under the MIT license:

```
MIT License

Copyright (c) 2024 thomluther

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
