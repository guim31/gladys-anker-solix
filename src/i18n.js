// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface: feature names, usage modes, messages, widget texts. German says
// "du", Spanish "usted". The words follow the Gladys interface
// (front/src/config/i18n); brand and model names are never translated.
//
// A device integration does not receive the language of the user: the
// `language` field of the configuration picks it (French by default). The
// widgets receive it with each request.
// -----------------------------------------------------------------------------

/** Feature names, fixed when the user adds the device to Gladys. */
export const NAMES = {
  en: {
    usage_mode: 'Usage mode',
    home_load: 'Home consumption',
    production_total: 'Total solar production',
    production_today: 'Solar production today',
    battery_level: 'Battery level',
    battery_energy: 'Stored energy',
    charge_power: 'Charge power',
    discharge_power: 'Discharge power',
    solar_power: 'Solar power',
    solar_input: 'Solar input {n}',
    output_power: 'Output to home',
    grid_import: 'Grid import',
    grid_export: 'Grid export',
    plug_power: 'Power',
  },
  fr: {
    usage_mode: "Mode d'utilisation",
    home_load: 'Consommation de la maison',
    production_total: 'Production solaire totale',
    production_today: 'Production solaire du jour',
    battery_level: 'Niveau de batterie',
    battery_energy: 'Énergie stockée',
    charge_power: 'Puissance de charge',
    discharge_power: 'Puissance de décharge',
    solar_power: 'Puissance solaire',
    solar_input: 'Entrée solaire {n}',
    output_power: 'Puissance vers la maison',
    grid_import: 'Soutirage réseau',
    grid_export: 'Injection réseau',
    plug_power: 'Puissance consommée',
  },
  de: {
    usage_mode: 'Betriebsmodus',
    home_load: 'Hausverbrauch',
    production_total: 'Solarertrag gesamt',
    production_today: 'Solarertrag heute',
    battery_level: 'Batteriestand',
    battery_energy: 'Gespeicherte Energie',
    charge_power: 'Ladeleistung',
    discharge_power: 'Entladeleistung',
    solar_power: 'Solarleistung',
    solar_input: 'Solareingang {n}',
    output_power: 'Leistung zum Haus',
    grid_import: 'Netzbezug',
    grid_export: 'Netzeinspeisung',
    plug_power: 'Leistungsverbrauch',
  },
  es: {
    usage_mode: 'Modo de uso',
    home_load: 'Consumo de la casa',
    production_total: 'Producción solar total',
    production_today: 'Producción solar de hoy',
    battery_level: 'Nivel de batería',
    battery_energy: 'Energía almacenada',
    charge_power: 'Potencia de carga',
    discharge_power: 'Potencia de descarga',
    solar_power: 'Potencia solar',
    solar_input: 'Entrada solar {n}',
    output_power: 'Potencia hacia la casa',
    grid_import: 'Importación de la red',
    grid_export: 'Exportación a la red',
    plug_power: 'Consumo eléctrico',
  },
};

/** Labels of the usage modes (keys of model.js USAGE_MODES). */
export const MODE_LABELS = {
  smartmeter: {
    en: 'Smart meter',
    fr: 'Compteur intelligent',
    de: 'Smart Meter',
    es: 'Medidor inteligente',
  },
  smartplugs: {
    en: 'Smart plugs',
    fr: 'Prises connectées',
    de: 'Smarte Steckdosen',
    es: 'Enchufes inteligentes',
  },
  manual: { en: 'Manual plan', fr: 'Planning manuel', de: 'Manueller Plan', es: 'Plan manual' },
  backup: {
    en: 'Emergency charge',
    fr: 'Charge de secours',
    de: 'Notladung',
    es: 'Carga de emergencia',
  },
  use_time: {
    en: 'Time of use',
    fr: 'Plages tarifaires',
    de: 'Tarifzeiten',
    es: 'Franjas horarias',
  },
  smart: { en: 'AI mode', fr: 'Mode IA', de: 'KI-Modus', es: 'Modo IA' },
  time_slot: {
    en: 'Dynamic tariff',
    fr: 'Tarif dynamique',
    de: 'Dynamischer Tarif',
    es: 'Tarifa dinámica',
  },
};

/** Messages shown in Gladys: connection status, actions, scene actions. */
export const MESSAGES = {
  notConfigured: {
    en: 'Enter the e-mail and the password of the Anker account.',
    fr: 'Saisissez l’e-mail et le mot de passe du compte Anker.',
    de: 'Gib die E-Mail-Adresse und das Passwort des Anker-Kontos ein.',
    es: 'Introduzca el correo electrónico y la contraseña de la cuenta Anker.',
  },
  credentials: {
    en: 'The Anker cloud refused the e-mail or the password.',
    fr: 'Le cloud Anker a refusé l’e-mail ou le mot de passe.',
    de: 'Die Anker-Cloud hat die E-Mail-Adresse oder das Passwort abgelehnt.',
    es: 'La nube de Anker rechazó el correo electrónico o la contraseña.',
  },
  verification: {
    en: 'The Anker account asks for a verification code: log in once in the Anker app, then save the configuration again.',
    fr: 'Le compte Anker demande un code de vérification : connectez-vous une fois dans l’appli Anker, puis enregistrez de nouveau la configuration.',
    de: 'Das Anker-Konto verlangt einen Bestätigungscode: Melde dich einmal in der Anker-App an und speichere dann die Konfiguration erneut.',
    es: 'La cuenta Anker pide un código de verificación: inicie sesión una vez en la aplicación Anker y vuelva a guardar la configuración.',
  },
  unreachable: {
    en: 'The Anker cloud does not answer ({reason}). Retrying at the next refresh.',
    fr: 'Le cloud Anker ne répond pas ({reason}). Nouvel essai au prochain rafraîchissement.',
    de: 'Die Anker-Cloud antwortet nicht ({reason}). Neuer Versuch bei der nächsten Aktualisierung.',
    es: 'La nube de Anker no responde ({reason}). Nuevo intento en la próxima actualización.',
  },
  noSystem: {
    en: 'Connected, but the account sees no system: create one in the Anker app, or share yours with this account.',
    fr: 'Connecté, mais le compte ne voit aucun système : créez-en un dans l’appli Anker, ou partagez le vôtre avec ce compte.',
    de: 'Verbunden, aber das Konto sieht kein System: Lege eins in der Anker-App an oder teile deins mit diesem Konto.',
    es: 'Conectado, pero la cuenta no ve ningún sistema: cree uno en la aplicación Anker o comparta el suyo con esta cuenta.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: 'L’initialisation a échoué, consultez les journaux de l’intégration.',
    de: 'Die Initialisierung ist fehlgeschlagen, sieh in den Protokollen der Integration nach.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  connected: {
    en: 'Connected: {systems} system(s), {devices} device(s).',
    fr: 'Connecté : {systems} système(s), {devices} appareil(s).',
    de: 'Verbunden: {systems} System(e), {devices} Gerät(e).',
    es: 'Conectado: {systems} sistema(s), {devices} dispositivo(s).',
  },
  settingsDisabled: {
    en: 'Settings are disabled: turn on “Allow settings” in the integration configuration.',
    fr: 'Les réglages sont désactivés : cochez « Autoriser les réglages » dans la configuration de l’intégration.',
    de: 'Einstellungen sind deaktiviert: Aktiviere „Einstellungen erlauben“ in der Konfiguration der Integration.',
    es: 'Los ajustes están desactivados: active «Permitir los ajustes» en la configuración de la integración.',
  },
  ownerRequired: {
    en: 'Only the owner account of the system can change its settings.',
    fr: 'Seul le compte propriétaire du système peut modifier ses réglages.',
    de: 'Nur das Besitzerkonto des Systems kann seine Einstellungen ändern.',
    es: 'Solo la cuenta propietaria del sistema puede cambiar sus ajustes.',
  },
  notSupported: {
    en: 'This system has no Solarbank 2 or 3: its settings cannot be changed from Gladys.',
    fr: 'Ce système n’a pas de Solarbank 2 ou 3 : ses réglages ne se changent pas depuis Gladys.',
    de: 'Dieses System hat keine Solarbank 2 oder 3: Seine Einstellungen lassen sich nicht in Gladys ändern.',
    es: 'Este sistema no tiene Solarbank 2 o 3: sus ajustes no se pueden cambiar desde Gladys.',
  },
  unknownSystem: {
    en: 'Unknown system: pick a device of the Anker SOLIX integration.',
    fr: 'Système inconnu : choisissez un appareil de l’intégration Anker SOLIX.',
    de: 'Unbekanntes System: Wähle ein Gerät der Anker-SOLIX-Integration.',
    es: 'Sistema desconocido: elija un dispositivo de la integración Anker SOLIX.',
  },
  not_manual: {
    en: 'The output power can only be set in the “Manual plan” mode.',
    fr: 'La puissance de sortie ne se règle qu’en mode « Planning manuel ».',
    de: 'Die Ausgangsleistung lässt sich nur im Modus „Manueller Plan“ einstellen.',
    es: 'La potencia de salida solo se puede ajustar en el modo «Plan manual».',
  },
  no_slot: {
    en: 'The manual plan has no time slot for now: complete it in the Anker app.',
    fr: 'Le planning manuel n’a pas de plage pour l’heure actuelle : complétez-le dans l’appli Anker.',
    de: 'Der manuelle Plan hat für jetzt keinen Zeitraum: Ergänze ihn in der Anker-App.',
    es: 'El plan manual no tiene franja para la hora actual: complételo en la aplicación Anker.',
  },
  mode_unavailable: {
    en: 'This usage mode is not available on this system.',
    fr: 'Ce mode d’utilisation n’est pas disponible sur ce système.',
    de: 'Dieser Betriebsmodus ist auf diesem System nicht verfügbar.',
    es: 'Este modo de uso no está disponible en este sistema.',
  },
  invalidPower: {
    en: 'Give the output power in watts, 0 or more.',
    fr: 'Indiquez la puissance de sortie en watts, 0 ou plus.',
    de: 'Gib die Ausgangsleistung in Watt an, 0 oder mehr.',
    es: 'Indique la potencia de salida en vatios, 0 o más.',
  },
  outputSet: {
    en: 'Output power set to {watts} W.',
    fr: 'Puissance de sortie réglée sur {watts} W.',
    de: 'Ausgangsleistung auf {watts} W gestellt.',
    es: 'Potencia de salida ajustada a {watts} W.',
  },
  modeSet: {
    en: 'Usage mode: {mode}.',
    fr: 'Mode d’utilisation : {mode}.',
    de: 'Betriebsmodus: {mode}.',
    es: 'Modo de uso: {mode}.',
  },
  cloudError: {
    en: 'The Anker cloud refused the change ({reason}).',
    fr: 'Le cloud Anker a refusé le changement ({reason}).',
    de: 'Die Anker-Cloud hat die Änderung abgelehnt ({reason}).',
    es: 'La nube de Anker rechazó el cambio ({reason}).',
  },
};

/** Widget texts: tiles (24 characters at most), status rows, buttons, forms. */
export const WIDGET_TEXT = {
  solar: { en: 'Solar', fr: 'Solaire', de: 'Solar', es: 'Solar' },
  battery: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  charging: { en: 'Charging', fr: 'Charge', de: 'Laden', es: 'Carga' },
  discharging: { en: 'Discharging', fr: 'Décharge', de: 'Entladen', es: 'Descarga' },
  home: { en: 'To home', fr: 'Vers la maison', de: 'Zum Haus', es: 'Hacia la casa' },
  gridImport: { en: 'Grid import', fr: 'Soutirage', de: 'Netzbezug', es: 'Importación' },
  gridExport: { en: 'Grid export', fr: 'Injection', de: 'Einspeisung', es: 'Exportación' },
  mode: { en: 'Usage mode', fr: 'Mode', de: 'Betriebsmodus', es: 'Modo de uso' },
  preset: {
    en: 'Output preset',
    fr: 'Consigne de sortie',
    de: 'Ausgangsvorgabe',
    es: 'Consigna de salida',
  },
  stored: { en: 'Stored energy', fr: 'Énergie stockée', de: 'Gespeichert', es: 'Almacenada' },
  today: { en: 'Solar today', fr: 'Solaire du jour', de: 'Solar heute', es: 'Solar de hoy' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  setOutput: { en: 'Output power', fr: 'Puissance', de: 'Leistung', es: 'Potencia' },
  setMode: { en: 'Usage mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  watts: {
    en: 'Output power (W)',
    fr: 'Puissance de sortie (W)',
    de: 'Ausgangsleistung (W)',
    es: 'Potencia de salida (W)',
  },
  notConfigured: {
    en: 'Enter the Anker account in the integration configuration.',
    fr: 'Saisissez le compte Anker dans la configuration de l’intégration.',
    de: 'Gib das Anker-Konto in der Konfiguration der Integration ein.',
    es: 'Introduzca la cuenta Anker en la configuración de la integración.',
  },
  noData: {
    en: 'No data from the Anker cloud yet.',
    fr: 'Pas encore de données du cloud Anker.',
    de: 'Noch keine Daten aus der Anker-Cloud.',
    es: 'Todavía no hay datos de la nube de Anker.',
  },
};

/**
 * Pick a language of a multi-language text and fill its `{placeholders}`.
 * @param {Record<string, string>} text
 * @param {string} language
 * @param {Record<string, string | number>} [values]
 */
export function t(text, language, values = {}) {
  const template = text[language] ?? text.en;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    values[key] === undefined ? match : String(values[key]),
  );
}

/**
 * The four languages of a text, with its placeholders filled.
 * @param {Record<string, string>} text
 * @param {Record<string, string | number | Record<string, string>>} [values]
 *   a multi-language value is localized per language
 */
export function all(text, values = {}) {
  const result = {};
  for (const language of Object.keys(text)) {
    const localized = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        value && typeof value === 'object' ? (value[language] ?? value.en) : value,
      ]),
    );
    result[language] = t(text, language, localized);
  }
  return result;
}

/** The name of a feature in the configured language, `{n}` filled. */
export function featureName(key, language, values = {}) {
  const table = NAMES[language] ?? NAMES.fr;
  return table[key].replace(/\{(\w+)\}/g, (match, name) =>
    values[name] === undefined ? match : String(values[name]),
  );
}
