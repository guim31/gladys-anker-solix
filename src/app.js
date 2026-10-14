// -----------------------------------------------------------------------------
// The integration: Anker cloud -> Gladys, and the few settings back.
//
// - Discovery: the systems of the account (get_site_list), then what each one
//   shows on the home screen of the app (get_scen_info) -> one Gladys device
//   per Solarbank, micro-inverter, smart meter and smart plug, plus one
//   "system" device per system (devices.js).
// - Refresh: the container polls by itself, on its own timer, at the interval
//   of the configuration (60 s at least: the cloud does not refresh faster).
//   The core cannot be trusted to call onPoll (GladysAssistant/Gladys#3198):
//   its onPoll is only a fallback, skipped when the timer has just read the
//   system. Only the systems with a device added to Gladys are read. Today's
//   production comes from the energy statistics, read every 5 minutes (the
//   cloud allows ~10 such requests per minute).
// - States: only the changes are published (publishChangedStates), with a
//   heartbeat every 6 hours so a stable value never looks stale.
// - Settings (usage mode, output power of the manual plan): refused unless
//   "Allow settings" is on, for Solarbank 2/3 systems and the owner account.
// - Scene triggers: the usage mode changed (not by Gladys), a device went
//   offline or came back.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { createAnkerClient, AnkerError } from './anker/client.js';
import { parseSite, siteDevices, SETTABLE_MODES } from './anker/model.js';
import {
  ScheduleError,
  currentPreset,
  presetLimits,
  setOutputPower,
  setUsageMode,
} from './anker/schedule.js';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from './config.js';
import { FEATURE, KIND, buildDevices, buildStates, deviceIds, siteIdOf } from './devices.js';
import { MESSAGES, MODE_LABELS, WIDGET_TEXT, all, t } from './i18n.js';
import { createIssueLog } from './issues.js';
import { Store } from './store.js';
import { WIDGET_ACTION, WIDGET_KEY, buildEnergyFlowContent, messageContent } from './widgets.js';

/** Scene trigger keys (manifest `scene_triggers`). */
export const TRIGGER = {
  MODE_CHANGED: 'usage_mode_changed',
  CONNECTION_CHANGED: 'connection_changed',
};

/** Manifest action keys (Configuration screen). */
export const ACTION = { TEST_CONNECTION: 'test_connection' };

/** Scene action keys (manifest `scene_actions`). */
export const SCENE_ACTION = {
  OUTPUT: 'set_output_power',
  MODE: 'set_usage_mode',
};

const MINUTE = 60_000;
const ENERGY_INTERVAL_MS = 5 * MINUTE;
const SITE_LIST_INTERVAL_MS = 30 * MINUTE;
const HEARTBEAT_MS = 6 * 60 * MINUTE;
// A mode change made by Gladys is not reported as a scene event when the
// cloud shows it within this delay (no loop through a scene).
const OWN_CHANGE_MS = 10 * MINUTE;
// A device is reported offline after this many reads in a row.
const OFFLINE_READS = 2;

/** A refusal with a message for the user, in the four languages. */
export class CommandError extends Error {
  /** @param {Record<string, string>} text multi-language */
  constructor(text) {
    super(text.en);
    this.name = 'CommandError';
    this.text = text;
  }
}

/**
 * Register every handler on the Gladys client.
 * @param {object} gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {object} [options]
 * @param {Store} [options.store] persistent state (/data by default)
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 * @param {boolean} [options.timers] run the refresh timer (tests may turn it off)
 * @param {object} [options.logger]
 * @param {object} [options.client] options passed to the Anker client
 */
export function createApp(gladys, options = {}) {
  const {
    store = new Store(process.env.ANKER_DATA_DIR || '/data'),
    fetch: fetchImpl,
    now = () => Date.now(),
    timers = true,
    logger = createLogger({ name: 'anker-solix' }),
    client: clientOptions = {},
  } = options;

  let config = normalizeConfig(DEFAULT_CONFIG);
  const cloudIssues = createIssueLog(logger);
  const client = createAnkerClient({
    getConfig: () => config,
    store,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    now,
    logger: logger.child ? logger.child('cloud') : logger,
    ...clientOptions,
  });

  /** Site list entries, by id, and when they were read. */
  let siteList = [];
  let siteListAt = 0;
  /** What is known of each system, by site id. */
  const sites = new Map();
  let timer = null;
  let running = false;
  let stopped = false;
  /** Why the cloud cannot be used without a new configuration, if it cannot. */
  let blocked = null;
  let cycleInFlight = null;
  /** Whether the account was read once since the start (devices published). */
  let discovered = false;

  const intervalMs = () => config.refresh_interval * 1000;
  const lang = () => config.language;

  // --- Reading the cloud -----------------------------------------------------

  /**
   * Read the site list, at most every 30 minutes unless forced.
   * @returns {Promise<boolean>} whether it was read now
   */
  async function refreshSiteList({ force = false } = {}) {
    if (!force && siteList.length > 0 && now() - siteListAt < SITE_LIST_INTERVAL_MS) {
      return false;
    }
    siteList = await client.getSiteList();
    siteListAt = now();
    return true;
  }

  function entryOf(siteId) {
    let entry = sites.get(siteId);
    if (!entry) {
      entry = {
        site: null,
        readAt: 0,
        energyAt: 0,
        productionTodayKwh: undefined,
        productionDay: undefined,
        ownModeChange: null,
        connection: new Map(),
        reading: null,
      };
      sites.set(siteId, entry);
    }
    return entry;
  }

  /** Read one system (one request at a time per system). */
  async function readSite(siteId) {
    const entry = entryOf(siteId);
    if (entry.reading) {
      return entry.reading;
    }
    entry.reading = (async () => {
      const info = siteList.find((site) => String(site.site_id) === siteId) ?? { site_id: siteId };
      const scene = await client.getSceneInfo(siteId);
      const previous = entry.site;
      entry.site = parseSite(info, scene);
      entry.readAt = now();
      await readProductionToday(siteId, entry);
      return { previous, site: entry.site };
    })();
    try {
      return await entry.reading;
    } finally {
      entry.reading = null;
    }
  }

  /** Today's solar production, every 5 minutes; a refusal is not an error. */
  async function readProductionToday(siteId, entry) {
    const site = entry.site;
    if (site.solarbanks.length === 0 && site.inverters.length === 0) {
      return;
    }
    const day = localDay(new Date(now()));
    if (entry.productionDay === day && now() - entry.energyAt < ENERGY_INTERVAL_MS) {
      return;
    }
    entry.energyAt = now();
    try {
      const data = await client.getEnergyDay(siteId, day);
      const value = Number(data.solar_total);
      entry.productionTodayKwh = data.solar_total === '' || !Number.isFinite(value) ? 0 : value;
      entry.productionDay = day;
      cloudIssues.ok(`energy:${siteId}`, `Energy statistics of "${site.name}" available again`);
    } catch (err) {
      if (err.kind === 'network' || err.kind === 'server') {
        // The scene was read a moment ago: a hiccup, tried again in 5 minutes.
        logger.debug(`Energy statistics of "${site.name}": ${err.message}`);
        return;
      }
      cloudIssues.fail(
        `energy:${siteId}`,
        `Energy statistics of "${site.name}" unavailable (${err.message})`,
      );
    }
  }

  // --- Publishing ------------------------------------------------------------

  /** The ids of the devices the user added to Gladys. */
  const createdIds = () => new Set((gladys.devices ?? []).map((device) => device.external_id));

  /** The sites with at least one device added to Gladys. */
  function createdSiteIds() {
    const created = createdIds();
    const ids = new Set();
    for (const device of gladys.devices ?? []) {
      const siteId = siteIdOf(device);
      if (siteId && created.has(device.external_id)) {
        ids.add(siteId);
      }
    }
    return [...ids];
  }

  async function publishSiteStates(siteId) {
    const entry = sites.get(siteId);
    if (!entry?.site) {
      return;
    }
    const states = buildStates(gladys, entry.site, {
      productionTodayKwh: entry.productionTodayKwh,
    });
    const result = await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    if (result?.count > 0) {
      logger.debug(`${entry.site.name}: ${result.count} state(s) published`);
      gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async function publishDevices() {
    const parsed = [...sites.values()].map((entry) => entry.site).filter(Boolean);
    await gladys.publishDiscoveredDevices(buildDevices(gladys, parsed, lang()));
    return parsed;
  }

  // --- Scene events ----------------------------------------------------------

  async function fireEvents(siteId, previous, site) {
    const entry = entryOf(siteId);
    const events = [];
    if (previous && site.usageMode && previous.usageMode && site.usageMode !== previous.usageMode) {
      const own = entry.ownModeChange;
      if (own && own.mode === site.usageMode && now() - own.at < OWN_CHANGE_MS) {
        logger.debug(`${site.name}: usage mode ${site.usageMode} set by Gladys, no event`);
      } else {
        events.push([
          TRIGGER.MODE_CHANGED,
          {
            system: deviceIds(gladys, KIND.SYSTEM, siteId).device,
            mode: site.usageMode,
            previous_mode: previous.usageMode,
            mode_label: t(MODE_LABELS[site.usageMode], lang()),
          },
        ]);
        logger.info(`${site.name}: usage mode changed to ${site.usageMode}`);
      }
      entry.ownModeChange = null;
    }

    for (const { kind, device } of siteDevices(site)) {
      if (device.online === undefined) {
        continue;
      }
      const state = entry.connection.get(device.sn) ?? { online: true, offlineReads: 0 };
      const externalId = deviceIds(gladys, kind, device.sn).device;
      if (device.online) {
        state.offlineReads = 0;
        if (!state.online) {
          state.online = true;
          logger.info(`${device.name}: back online`);
          events.push([
            TRIGGER.CONNECTION_CHANGED,
            { device: externalId, state: 'online', device_name: device.name },
          ]);
        }
      } else if (state.online) {
        state.offlineReads += 1;
        if (state.offlineReads >= OFFLINE_READS) {
          state.online = false;
          logger.info(`${device.name}: offline for the Anker cloud`);
          events.push([
            TRIGGER.CONNECTION_CHANGED,
            { device: externalId, state: 'offline', device_name: device.name },
          ]);
        }
      }
      entry.connection.set(device.sn, state);
    }

    for (const [key, data] of events) {
      try {
        await gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.warn(`Scene event ${key} refused (${err.message})`);
      }
    }
  }

  // --- Cycle -----------------------------------------------------------------

  /** Read one system, publish its states, fire its events. */
  async function refreshSite(siteId) {
    const { previous, site } = await readSite(siteId);
    await fireEvents(siteId, previous, site);
    await publishSiteStates(siteId);
  }

  /** One refresh of every system with a device in Gladys. Never throws. */
  async function cycle() {
    if (cycleInFlight) {
      return cycleInFlight;
    }
    cycleInFlight = (async () => {
      if (gladys.connected === false || blocked || !isConfigured(config)) {
        return;
      }
      try {
        if (!discovered) {
          // The start could not read the account (cloud down): try again.
          await discover();
          await publishCreated();
          cloudReachable();
          return;
        }
        const ids = createdSiteIds();
        if (ids.length === 0) {
          logger.debug('No Anker device added to Gladys yet: nothing to read');
          return;
        }
        const listRead = await refreshSiteList();
        for (const siteId of ids) {
          await refreshSite(siteId);
        }
        if (listRead) {
          // Every 30 minutes: a system or a device added in the Anker app
          // shows up in the Discovery tab.
          for (const site of siteList) {
            if (!sites.get(String(site.site_id))?.site) {
              await readSite(String(site.site_id));
            }
          }
          await publishDevices();
        }
        cloudReachable();
      } catch (err) {
        await cloudFailed(err);
      }
    })();
    try {
      await cycleInFlight;
    } finally {
      cycleInFlight = null;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      await cycle();
      schedule();
    }, intervalMs());
    timer.unref?.();
  }

  function cloudReachable() {
    if (cloudIssues.isFailing('cloud')) {
      cloudIssues.ok('cloud', 'Anker cloud reachable again');
      gladys.setConnectionStatus(true).catch(() => {});
    }
  }

  /** A failed read: blocking (credentials) or transient (network, quota). */
  async function cloudFailed(err) {
    if (!(err instanceof AnkerError)) {
      logger.error('Refresh failed', err);
      return;
    }
    if (err.kind === 'credentials' || err.kind === 'verification') {
      blocked = err.kind;
      logger.error(`${err.message}: waiting for a new configuration`);
      await gladys
        .setConnectionStatus(
          false,
          err.kind === 'credentials' ? MESSAGES.credentials : MESSAGES.verification,
        )
        .catch(() => {});
      return;
    }
    if (!cloudIssues.isFailing('cloud')) {
      await gladys
        .setConnectionStatus(false, all(MESSAGES.unreachable, { reason: err.message }))
        .catch(() => {});
    }
    cloudIssues.fail('cloud', `Anker cloud: ${err.message}`);
  }

  // --- Start -----------------------------------------------------------------

  /**
   * (Re)start: read the account, publish the devices, then refresh on the
   * timer. Called on connection and on a new configuration.
   */
  async function start() {
    stopped = false;
    blocked = null;
    discovered = false;
    clearTimeout(timer);
    timer = null;
    if (!isConfigured(config)) {
      logger.info('Not configured yet: waiting for the Anker account');
      await gladys.setConnectionStatus(false, MESSAGES.notConfigured);
      return;
    }
    try {
      await discover();
      const parsed = [...sites.values()].map((entry) => entry.site).filter(Boolean);
      const devices = parsed.reduce((count, site) => count + siteDevices(site).length, 0);
      logger.info(`Connected to the Anker cloud: ${parsed.length} system(s), ${devices} device(s)`);
      cloudIssues.ok('cloud', 'Anker cloud reachable again');
      await gladys.setConnectionStatus(
        parsed.length > 0,
        parsed.length > 0 ? undefined : MESSAGES.noSystem,
      );
      await publishCreated();
      gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      await cloudFailed(err);
    }
    schedule();
  }

  /** The states of the devices already in Gladys, from the last read. */
  async function publishCreated() {
    for (const siteId of createdSiteIds()) {
      if (sites.get(siteId)?.site) {
        await fireEvents(siteId, null, sites.get(siteId).site);
        await publishSiteStates(siteId);
      }
    }
  }

  /** Read every system of the account and publish the devices. */
  async function discover() {
    await refreshSiteList({ force: true });
    const ids = new Set(siteList.map((site) => String(site.site_id)));
    for (const siteId of [...sites.keys()]) {
      if (!ids.has(siteId)) {
        sites.delete(siteId);
      }
    }
    for (const siteId of ids) {
      await readSite(siteId);
    }
    const parsed = await publishDevices();
    discovered = true;
    return parsed;
  }

  // --- Settings --------------------------------------------------------------

  /** The system a device (any device of the integration) belongs to. */
  function siteOfDevice(externalId) {
    const device = (gladys.devices ?? []).find((d) => d.external_id === externalId);
    const siteId = siteIdOf(device);
    if (siteId && sites.get(siteId)?.site) {
      return siteId;
    }
    // A device published before this start: find it in the systems read.
    for (const [id, entry] of sites) {
      if (!entry.site) {
        continue;
      }
      if (deviceIds(gladys, KIND.SYSTEM, id).device === externalId) {
        return id;
      }
      for (const { kind, device: d } of siteDevices(entry.site)) {
        if (deviceIds(gladys, kind, d.sn).device === externalId) {
          return id;
        }
      }
    }
    return undefined;
  }

  /** The checks every setting goes through. */
  async function settingsSite(siteId) {
    if (!config.allow_settings) {
      throw new CommandError(MESSAGES.settingsDisabled);
    }
    const site = siteId ? sites.get(siteId)?.site : undefined;
    if (!site) {
      throw new CommandError(MESSAGES.unknownSystem);
    }
    if (!site.scheduleCapable) {
      throw new CommandError(MESSAGES.notSupported);
    }
    if (!site.owner) {
      throw new CommandError(MESSAGES.ownerRequired);
    }
    return site;
  }

  async function withCloud(task) {
    try {
      return await task();
    } catch (err) {
      if (err instanceof CommandError) {
        throw err;
      }
      if (err instanceof ScheduleError) {
        throw new CommandError(MESSAGES[err.reason]);
      }
      if (err instanceof AnkerError && err.kind === 'permission') {
        throw new CommandError(MESSAGES.ownerRequired);
      }
      throw new CommandError(all(MESSAGES.cloudError, { reason: err.message }));
    }
  }

  /**
   * Set the usage mode of a system.
   * @returns {Promise<{ mode: string, message: Record<string, string> }>}
   */
  async function applyUsageMode(siteId, mode) {
    const site = await settingsSite(siteId);
    if (!SETTABLE_MODES.includes(mode) || !site.modes.includes(mode)) {
      throw new CommandError(MESSAGES.mode_unavailable);
    }
    await withCloud(async () => {
      const current = await client.getSchedule(siteId);
      await client.setSchedule(siteId, setUsageMode(current, mode));
    });
    const entry = entryOf(siteId);
    entry.ownModeChange = { mode, at: now() };
    entry.site = { ...site, usageMode: mode };
    logger.info(`${site.name}: usage mode set to ${mode}`);
    await publishSiteStates(siteId);
    gladys.requestWidgetRefresh(WIDGET_KEY);
    return { mode, message: all(MESSAGES.modeSet, { mode: MODE_LABELS[mode] }) };
  }

  /**
   * Set the output power of the current slot of the manual plan.
   * @returns {Promise<{ applied: number, message: Record<string, string> }>}
   */
  async function applyOutputPower(siteId, watts) {
    const site = await settingsSite(siteId);
    const requested = Number(watts);
    if (!Number.isFinite(requested) || requested < 0) {
      throw new CommandError(MESSAGES.invalidPower);
    }
    const applied = await withCloud(async () => {
      const current = await client.getSchedule(siteId);
      const change = setOutputPower(current, requested, new Date(now()));
      await client.setSchedule(siteId, change.payload);
      return change.applied;
    });
    const entry = entryOf(siteId);
    entry.site = { ...site, outputPreset: applied };
    entry.output = undefined;
    logger.info(`${site.name}: output power set to ${applied} W`);
    gladys.requestWidgetRefresh(WIDGET_KEY);
    return { applied, message: all(MESSAGES.outputSet, { watts: applied }) };
  }

  /** Output limits and current preset of the manual plan, read when needed. */
  async function outputInfo(siteId) {
    const entry = entryOf(siteId);
    if (entry.output && now() - entry.output.at < intervalMs()) {
      return entry.output.value;
    }
    try {
      const schedule = await client.getSchedule(siteId);
      const { min, max } = presetLimits(schedule);
      entry.output = {
        at: now(),
        value: { min, max, preset: currentPreset(schedule, new Date(now())) },
      };
      return entry.output.value;
    } catch (err) {
      logger.debug(`Schedule of ${siteId} unavailable (${err.message})`);
      return undefined;
    }
  }

  // --- Handlers --------------------------------------------------------------

  gladys.onScanRequest(async () => {
    logger.info('Scan requested: reading the Anker account');
    if (!isConfigured(config)) {
      await gladys.publishDiscoveredDevices([]);
      return;
    }
    blocked = null;
    try {
      await discover();
      cloudReachable();
    } catch (err) {
      await cloudFailed(err);
      throw err;
    }
  });

  gladys.onPoll(async (device) => {
    // Fallback of the container's own timer: skipped when it just read the system.
    const siteId = siteIdOf(device) ?? siteOfDevice(device.external_id);
    const entry = siteId ? sites.get(siteId) : undefined;
    if (!siteId || blocked || !isConfigured(config)) {
      return;
    }
    if (entry && now() - entry.readAt < intervalMs() * 0.9) {
      logger.debug(`onPoll: ${siteId} read ${now() - entry.readAt} ms ago, skipped`);
      return;
    }
    try {
      await refreshSite(siteId);
      cloudReachable();
    } catch (err) {
      await cloudFailed(err);
    }
  });

  gladys.onDeviceCreated(async (device) => {
    // Gladys dropped the states sent before the device existed: send them
    // again now, from the last read when it is recent.
    const siteId = siteIdOf(device) ?? siteOfDevice(device.external_id);
    if (!siteId) {
      return;
    }
    try {
      if (!sites.get(siteId)?.site || now() - sites.get(siteId).readAt >= intervalMs()) {
        await refreshSite(siteId);
      } else {
        await publishSiteStates(siteId);
      }
    } catch (err) {
      await cloudFailed(err);
    }
    gladys.requestWidgetRefresh(WIDGET_KEY);
  });

  gladys.onDeviceUpdated(async (device) => {
    const siteId = siteIdOf(device) ?? siteOfDevice(device.external_id);
    if (siteId) {
      await publishSiteStates(siteId);
    }
  });

  gladys.onSetValue(async (device, feature, value) => {
    if (!feature.external_id.endsWith(`:${FEATURE.USAGE_MODE}`)) {
      throw new Error(`No command for ${feature.external_id}`);
    }
    const siteId = siteIdOf(device) ?? siteOfDevice(device.external_id);
    try {
      await applyUsageMode(siteId, String(value));
    } catch (err) {
      if (err instanceof CommandError) {
        // The core shows the error: say it in the configured language, and
        // put the real mode back on the buttons.
        await publishSiteStatesAgain(siteId);
        throw new Error(t(err.text, lang()), { cause: err });
      }
      throw err;
    }
  });

  async function publishSiteStatesAgain(siteId) {
    if (siteId && sites.get(siteId)?.site) {
      gladys.forgetPublishedStates(
        deviceIds(gladys, KIND.SYSTEM, siteId).feature(FEATURE.USAGE_MODE),
      );
      await publishSiteStates(siteId).catch(() => {});
    }
  }

  gladys.onAction(ACTION.TEST_CONNECTION, async () => {
    logger.info('Action: test the connection');
    if (!isConfigured(config)) {
      return MESSAGES.notConfigured;
    }
    try {
      blocked = null;
      await client.login();
      const parsed = await discover();
      const devices = parsed.reduce((count, site) => count + siteDevices(site).length, 0);
      cloudReachable();
      await gladys.setConnectionStatus(
        parsed.length > 0,
        parsed.length > 0 ? undefined : MESSAGES.noSystem,
      );
      schedule();
      return parsed.length > 0
        ? all(MESSAGES.connected, { systems: parsed.length, devices })
        : MESSAGES.noSystem;
    } catch (err) {
      await cloudFailed(err);
      if (err instanceof AnkerError && err.kind === 'credentials') {
        return MESSAGES.credentials;
      }
      if (err instanceof AnkerError && err.kind === 'verification') {
        return MESSAGES.verification;
      }
      return all(MESSAGES.unreachable, { reason: err.message });
    }
  });

  gladys.onSceneAction(SCENE_ACTION.OUTPUT, async (fields) => {
    logger.info(`Scene action: output power ${fields.power} W`);
    try {
      const { applied } = await applyOutputPower(siteOfDevice(fields.system), fields.power);
      return { applied_power: applied };
    } catch (err) {
      throw err instanceof CommandError ? new Error(t(err.text, lang())) : err;
    }
  });

  gladys.onSceneAction(SCENE_ACTION.MODE, async (fields) => {
    logger.info(`Scene action: usage mode ${fields.mode}`);
    try {
      const { mode } = await applyUsageMode(siteOfDevice(fields.system), String(fields.mode));
      return { mode };
    } catch (err) {
      throw err instanceof CommandError ? new Error(t(err.text, lang())) : err;
    }
  });

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings = {}, language = 'en' }) => {
    const language4 = ['en', 'fr', 'de', 'es'].includes(language) ? language : 'en';
    if (!isConfigured(config)) {
      return messageContent(WIDGET_TEXT.notConfigured, language4);
    }
    const siteId =
      (settings.system && siteOfDevice(settings.system)) ??
      [...sites.keys()].find((id) => sites.get(id).site);
    const entry = siteId ? sites.get(siteId) : undefined;
    if (!entry?.site) {
      return messageContent(WIDGET_TEXT.noData, language4);
    }
    if (now() - entry.readAt >= intervalMs() && !blocked) {
      // No device of this system in Gladys: nothing else reads it.
      try {
        await refreshSite(siteId);
      } catch (err) {
        logger.debug(`Widget: ${err.message}`);
      }
    }
    const site = entry.site;
    const output =
      config.allow_settings && site.scheduleCapable && site.owner && site.usageMode === 'manual'
        ? await outputInfo(siteId)
        : undefined;
    return buildEnergyFlowContent({
      site,
      language: language4,
      ttlSeconds: config.refresh_interval,
      productionTodayKwh: entry.productionTodayKwh,
      allowSettings: config.allow_settings,
      output,
    });
  });

  gladys.onWidgetAction(WIDGET_KEY, async (actionKey, params = {}, { values } = {}) => {
    logger.info(`Widget action: ${actionKey}`);
    try {
      if (actionKey === WIDGET_ACTION.OUTPUT) {
        if (values?.watts === undefined) {
          // An older core drops the form: never act without the typed value.
          throw new CommandError(MESSAGES.invalidPower);
        }
        return (await applyOutputPower(params.site, values.watts)).message;
      }
      if (actionKey === WIDGET_ACTION.MODE) {
        if (!values?.mode) {
          throw new CommandError(MESSAGES.mode_unavailable);
        }
        return (await applyUsageMode(params.site, String(values.mode))).message;
      }
      return undefined;
    } catch (err) {
      if (err instanceof CommandError) {
        return err.text;
      }
      throw err;
    }
  });

  gladys.onConfigUpdated(async (raw) => {
    logger.info('Configuration updated');
    const previous = config;
    config = normalizeConfig(raw);
    if (
      previous.email !== config.email ||
      previous.password !== config.password ||
      previous.country !== config.country
    ) {
      await client.reset();
      sites.clear();
      siteList = [];
      siteListAt = 0;
    }
    await start();
  });

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      if (!running) {
        running = true;
        await start();
      } else {
        // A reconnection to Gladys: the cloud side did not change.
        schedule();
        await cycle();
      }
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
    }
  });

  return {
    /** One refresh cycle, as the timer runs it. */
    cycle,
    start,
    /** Stop the timer (shutdown, tests). */
    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
    /** For the tests. */
    get sites() {
      return sites;
    },
    get config() {
      return config;
    },
  };
}

/** YYYY-MM-DD in the local time of the container (Gladys sets TZ). */
export function localDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
