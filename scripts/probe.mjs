#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real Anker cloud, read-only, from a machine with Internet.
//
//   node scripts/probe.mjs
//       Logs in with a fake account: the cloud must refuse it cleanly
//       (wrong e-mail or password), which proves the server, the headers and
//       the ECDH password encryption are accepted.
//
//   ANKER_EMAIL=... ANKER_PASSWORD=... ANKER_COUNTRY=FR node scripts/probe.mjs
//       Logs in with a real account and reads, for each system: the site list,
//       get_scen_info and today's production, then prints what the
//       integration would publish. Nothing is ever written to the account.
//
// Never printed: the e-mail, the password, the token, the serial numbers, the
// site ids. The session is kept in a temporary directory, deleted at the end.
// -----------------------------------------------------------------------------

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAnkerClient } from '../src/anker/client.js';
import { parseSite, siteDevices } from '../src/anker/model.js';
import { localDay } from '../src/app.js';
import { normalizeConfig } from '../src/config.js';
import { Store } from '../src/store.js';

const real = Boolean(process.env.ANKER_EMAIL && process.env.ANKER_PASSWORD);
const config = normalizeConfig({
  email: process.env.ANKER_EMAIL ?? 'probe-gladys-anker@example.invalid',
  password: process.env.ANKER_PASSWORD ?? 'not-a-real-password-0',
  country: process.env.ANKER_COUNTRY ?? 'FR',
});
const dataDir = mkdtempSync(join(tmpdir(), 'anker-probe-'));
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const client = createAnkerClient({
  getConfig: () => config,
  store: new Store(dataDir),
  minGapMs: 1000,
  logger: quiet,
});

const show = (label, value) => console.log(`${label.padEnd(28)} ${value}`);

/** @returns {Promise<number>} the exit code */
async function probe() {
  console.log(
    `Anker cloud probe (${real ? 'real account' : 'fake account'}, country ${config.country})`,
  );
  try {
    await client.login();
  } catch (err) {
    show('login', `${err.kind ?? 'error'}: ${err.message} (code ${err.code ?? '-'})`);
    if (!real && err.kind === 'credentials') {
      console.log('OK: the cloud refused the fake account cleanly.');
      return 0;
    }
    return 1;
  }
  if (!real) {
    console.log('UNEXPECTED: the fake account was accepted.');
    return 1;
  }
  show('login', 'ok');

  const sites = await client.getSiteList();
  show('systems', sites.length);
  for (const [index, entry] of sites.entries()) {
    const scene = await client.getSceneInfo(String(entry.site_id));
    const site = parseSite(entry, scene);
    console.log(
      `\nSystem ${index + 1}: power_site_type ${entry.power_site_type}, ${site.owner ? 'owner' : 'member'}`,
    );
    show('  usage mode', site.usageMode ?? '-');
    show('  modes offered', site.modes.join(', ') || '-');
    show('  output preset (W)', site.outputPreset ?? '-');
    show('  home consumption (W)', site.homeLoad ?? '-');
    show('  production total (kWh)', site.productionTotalKwh ?? '-');
    try {
      const energy = await client.getEnergyDay(String(entry.site_id), localDay(new Date()));
      show('  production today (kWh)', energy.solar_total || '0');
    } catch (err) {
      show('  production today', `${err.kind}: ${err.message}`);
    }
    for (const { kind, device } of siteDevices(site)) {
      const values = Object.entries(device)
        .filter(([key, value]) => !['sn', 'name'].includes(key) && value !== undefined)
        .map(([key, value]) => `${key}=${Array.isArray(value) ? `[${value.join(',')}]` : value}`)
        .join(' ');
      show(`  ${kind}`, values);
    }
  }
  return 0;
}

try {
  process.exitCode = await probe();
} catch (err) {
  console.error(`Probe failed: ${err.kind ?? ''} ${err.message}`);
  process.exitCode = 1;
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
