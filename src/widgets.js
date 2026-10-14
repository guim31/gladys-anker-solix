// -----------------------------------------------------------------------------
// PURE: the "Anker SOLIX" dashboard widget. No I/O.
//
// The energy flow of one system, solar -> battery -> home / grid, read in the
// order of the tiles, and the battery level as a gauge. Then a status list
// (usage mode, output preset, stored energy, today's production, offline
// devices) and, when the settings are allowed, two buttons that open a form:
// the output power (manual plan only) and the usage mode (Gladys 5.2.0+).
//
// Core budget: 8 components, 6 tiles, 1 status, 4 buttons, 2 texts. The
// content is localized from the language Gladys sends, and cached by the
// core per language: the labels are built here, never in English only.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { MODE_LABELS, WIDGET_TEXT, t } from './i18n.js';
import { SETTABLE_MODES, siteDevices } from './anker/model.js';

export const WIDGET_KEY = 'energy_flow';

/** Keys of the widget buttons (an action key is used once per content). */
export const WIDGET_ACTION = {
  OUTPUT: 'set_output_power',
  MODE: 'set_usage_mode',
};

const sum = (values) => {
  const defined = values.filter((value) => typeof value === 'number');
  return defined.length > 0 ? defined.reduce((a, b) => a + b, 0) : undefined;
};

const fmt = (value, decimals = 0) =>
  Number(value.toFixed(decimals)).toLocaleString('en-US', { maximumFractionDigits: decimals });

function batteryColor(level) {
  if (level < 20) {
    return WIDGET_COLORS.DANGER;
  }
  if (level < 50) {
    return WIDGET_COLORS.WARNING;
  }
  return WIDGET_COLORS.SUCCESS;
}

/** One sentence instead of the energy flow (not configured, no data yet). */
export function messageContent(text, language) {
  return {
    ttl_seconds: 60,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/**
 * @param {object} options
 * @param {object} options.site parsed system (model.js parseSite)
 * @param {string} options.language
 * @param {number} options.ttlSeconds
 * @param {number} [options.productionTodayKwh]
 * @param {boolean} [options.allowSettings]
 * @param {{ min: number, max: number, preset?: number }} [options.output] output
 *   limits and current preset of the manual plan, when known
 */
export function buildEnergyFlowContent({
  site,
  language,
  ttlSeconds,
  productionTodayKwh,
  allowSettings = false,
  output,
}) {
  const text = (key) => t(WIDGET_TEXT[key], language);
  const components = [];

  if (site.batteryLevel !== undefined) {
    components.push({
      type: 'gauge',
      label: text('battery'),
      value: site.batteryLevel,
      min: 0,
      max: 100,
      unit: '%',
      color: batteryColor(site.batteryLevel),
    });
  }

  const solar = sum([
    ...site.solarbanks.map((sb) => sb.solarPower),
    ...site.inverters.map((inverter) => inverter.solarPower),
  ]);
  if (solar !== undefined) {
    components.push({
      type: 'value',
      label: text('solar'),
      value: Math.round(solar),
      unit: 'W',
      icon: 'sun',
      color: solar > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    });
  }

  const charge = sum(site.solarbanks.map((sb) => sb.chargePower)) ?? 0;
  const discharge = sum(site.solarbanks.map((sb) => sb.dischargePower)) ?? 0;
  if (site.solarbanks.length > 0) {
    const charging = charge >= discharge;
    components.push({
      type: 'value',
      label: text(charge === discharge ? 'battery' : charging ? 'charging' : 'discharging'),
      value: Math.round(charging ? charge : discharge),
      unit: 'W',
      icon: charging ? 'battery-charging' : 'battery',
      color:
        charge === discharge
          ? WIDGET_COLORS.NEUTRAL
          : charging
            ? WIDGET_COLORS.SUCCESS
            : WIDGET_COLORS.INFO,
    });
  }

  const home = sum(site.solarbanks.map((sb) => sb.outputPower));
  if (home !== undefined) {
    components.push({
      type: 'value',
      label: text('home'),
      value: Math.round(home),
      unit: 'W',
      icon: 'home',
      color: WIDGET_COLORS.PRIMARY,
    });
  }

  const meter = site.meters[0];
  if (meter && (meter.gridImport !== undefined || meter.gridExport !== undefined)) {
    const exporting = (meter.gridExport ?? 0) > 0 && (meter.gridImport ?? 0) === 0;
    components.push({
      type: 'value',
      label: text(exporting ? 'gridExport' : 'gridImport'),
      value: Math.round(exporting ? meter.gridExport : (meter.gridImport ?? 0)),
      unit: 'W',
      icon: exporting ? 'upload' : 'download',
      color: exporting ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
    });
  }

  const items = [];
  if (site.scheduleCapable && site.usageMode) {
    items.push({
      label: text('mode'),
      value: t(MODE_LABELS[site.usageMode], language),
      icon: 'sliders',
    });
  }
  const preset = output?.preset ?? site.outputPreset;
  if (preset !== undefined) {
    items.push({ label: text('preset'), value: `${fmt(preset)} W`, icon: 'target' });
  }
  const stored = sum(site.solarbanks.map((sb) => sb.energyKwh));
  if (stored !== undefined) {
    items.push({ label: text('stored'), value: `${fmt(stored, 2)} kWh`, icon: 'battery' });
  }
  if (productionTodayKwh !== undefined) {
    items.push({ label: text('today'), value: `${fmt(productionTodayKwh, 2)} kWh`, icon: 'sun' });
  }
  const offline = siteDevices(site).filter(({ device }) => device.online === false);
  if (offline.length > 0) {
    items.push({
      label: text('offline'),
      value: offline
        .map(({ device }) => device.name)
        .join(', ')
        .slice(0, 40),
      icon: 'wifi-off',
      color: WIDGET_COLORS.DANGER,
    });
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }

  if (allowSettings && site.scheduleCapable && site.owner) {
    if (site.usageMode === 'manual' && output) {
      components.push({
        type: 'button',
        label: text('setOutput'),
        icon: 'zap',
        style: 'secondary',
        action: {
          key: WIDGET_ACTION.OUTPUT,
          params: { site: site.id },
          fields: [
            {
              key: 'watts',
              type: 'number',
              // Form texts are multi-language objects for the core.
              label: WIDGET_TEXT.watts,
              required: true,
              min: output.min,
              max: output.max,
              default: Math.min(output.max, Math.max(output.min, Math.round(preset ?? output.min))),
            },
          ],
        },
      });
    }
    const modes = site.modes.filter((mode) => SETTABLE_MODES.includes(mode));
    if (modes.length > 1) {
      components.push({
        type: 'button',
        label: text('setMode'),
        icon: 'sliders',
        style: 'secondary',
        action: {
          key: WIDGET_ACTION.MODE,
          params: { site: site.id },
          fields: [
            {
              key: 'mode',
              type: 'select',
              label: WIDGET_TEXT.mode,
              required: true,
              options: modes.map((mode) => ({ value: mode, label: MODE_LABELS[mode] })),
              ...(modes.includes(site.usageMode) ? { default: site.usageMode } : {}),
            },
          ],
        },
      });
    }
  }

  return { ttl_seconds: ttlSeconds, components };
}
