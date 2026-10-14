// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, the simulated Anker cloud, a
// temporary /data, a recording logger, and the integration wired on top.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { ACCOUNT, createFakeAnker } from './fakeAnker.js';

export const CONFIG = { ...ACCOUNT, country: 'FR', language: 'fr' };

/** A logger that keeps every line, for the tests on the logs. */
export function createRecordingLogger() {
  const lines = [];
  const make = (name) => {
    const write =
      (level) =>
      (...args) =>
        lines.push({
          level,
          name,
          text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
        });
    return {
      debug: write('debug'),
      info: write('info'),
      warn: write('warn'),
      error: write('error'),
      child: (child) => make(`${name}:${child}`),
    };
  };
  const logger = make('anker-solix');
  logger.lines = lines;
  logger.at = (level) => lines.filter((line) => line.level === level);
  logger.clear = () => lines.splice(0, lines.length);
  return logger;
}

/**
 * @param {object} [options]
 * @param {string[]} [options.fixtures]
 * @param {object} [options.config] merged into CONFIG
 * @param {boolean} [options.connect]
 * @param {boolean} [options.addDevices] create every discovered device in Gladys
 * @param {boolean} [options.timers]
 * @param {number} [options.msType]
 * @param {() => number} [options.now]
 * @param {string} [options.dataDir]
 */
export async function createWorld({
  fixtures,
  config = {},
  connect = true,
  addDevices = false,
  timers = false,
  msType,
  now,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-anker-')),
} = {}) {
  const anker = createFakeAnker({ fixtures, msType, now });
  const gladys = createFakeGladys({ config: { ...CONFIG, ...config } });
  const logger = createRecordingLogger();
  const app = createApp(gladys, {
    store: new Store(dataDir),
    fetch: anker.fetch,
    timers,
    logger,
    ...(now ? { now } : {}),
    client: { serverPublicKey: anker.serverPublicKey, minGapMs: 0, sleep: async () => {} },
  });
  const world = { gladys, anker, app, logger, dataDir };
  if (connect) {
    await gladys.connect();
  }
  if (addDevices) {
    await addAll(world);
  }
  return world;
}

/** Add every discovered device to Gladys, as the user would. */
export async function addAll(world) {
  for (const device of world.gladys.fake.discoveredDevices) {
    await world.gladys.fake.deviceCreated(device);
  }
}

/** External id of a device of the world. */
export const idOf = (gladys, kind, platformId) => gladys.externalIds(kind, platformId);
