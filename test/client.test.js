// -----------------------------------------------------------------------------
// The Anker cloud client: login encryption, headers, session kept in /data,
// new login on a refused token, error kinds, server by country, spacing.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ANKER_SERVER_PUBLIC_KEY,
  createKeyExchange,
  encryptWithSecret,
} from '../src/anker/crypto.js';
import {
  API_SERVERS,
  AnkerError,
  createAnkerClient,
  serverFor,
  timezoneHeader,
} from '../src/anker/client.js';
import { normalizeConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { ACCOUNT, createFakeAnker } from './helpers/fakeAnker.js';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function setup({
  config = {},
  dataDir = mkdtempSync(join(tmpdir(), 'anker-client-')),
  ...rest
} = {}) {
  const anker = createFakeAnker(rest);
  const cfg = normalizeConfig({ ...ACCOUNT, country: 'FR', ...config });
  const client = createAnkerClient({
    getConfig: () => cfg,
    store: new Store(dataDir),
    fetch: anker.fetch,
    serverPublicKey: anker.serverPublicKey,
    minGapMs: 0,
    sleep: async () => {},
    logger: silent,
  });
  return { anker, client, dataDir, cfg };
}

test('the password is encrypted with the secret shared with the server (ECDH P-256, AES-256-CBC)', () => {
  const server = createECDH('prime256v1');
  server.generateKeys();
  const { publicKey, sharedSecret } = createKeyExchange(server.getPublicKey('hex', 'uncompressed'));
  assert.match(publicKey, /^04[0-9a-f]{128}$/, 'uncompressed point, hex');
  assert.equal(sharedSecret.length, 32);

  const encrypted = encryptWithSecret('Mot de passe é€', sharedSecret);
  const serverSecret = server.computeSecret(Buffer.from(publicKey, 'hex'));
  const decipher = createDecipheriv('aes-256-cbc', serverSecret, serverSecret.subarray(0, 16));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]);
  assert.equal(clear.toString('utf8'), 'Mot de passe é€');
});

test('the Anker server key is a valid P-256 point', () => {
  assert.doesNotThrow(() => createKeyExchange(ANKER_SERVER_PUBLIC_KEY));
});

test('login: e-mail, country, encrypted password; the token goes in the next headers', async () => {
  const { anker, client } = setup();
  const sites = await client.getSiteList();
  assert.equal(sites.length, 1);

  const [login, list] = anker.calls;
  assert.equal(login.endpoint, 'passport/login');
  assert.equal(login.body.email, ACCOUNT.email);
  assert.equal(login.body.ab, 'FR');
  assert.equal(login.body.enc, 0);
  assert.notEqual(login.body.password, ACCOUNT.password, 'never in clear');
  assert.deepEqual(anker.passwords, [ACCOUNT.password], 'the server decrypts the right password');
  assert.equal(login.headers['x-auth-token'], undefined);
  assert.equal(login.headers['app-name'], 'anker_power');
  assert.equal(login.headers.country, 'FR');
  assert.match(login.headers.timezone, /^GMT[+-]\d{2}:\d{2}$/);

  assert.equal(list.endpoint, 'power_service/v1/site/get_site_list');
  assert.equal(list.headers['x-auth-token'], 'token-1');
  assert.equal(
    list.headers.gtoken,
    createHash('md5').update('a1b2c3d4e5f60718293a4b5c6d7e8f90').digest('hex'),
  );
});

test('the session is kept in /data, without the e-mail nor the password, and reused', async () => {
  const { anker, client, dataDir } = setup();
  await client.getSiteList();
  const file = join(dataDir, 'anker-session.json');
  const stored = readFileSync(file, 'utf8');
  assert.ok(!stored.includes(ACCOUNT.email));
  assert.ok(!stored.includes(ACCOUNT.password));
  assert.equal(statSync(file).mode & 0o777, 0o600, 'readable by the container user only');

  // A restart: same /data, a new client, no new login.
  const second = setup({ dataDir });
  second.anker.token = anker.token;
  second.anker.tokenCount = anker.tokenCount;
  await second.client.getSiteList();
  assert.deepEqual(second.anker.endpoints(), ['power_service/v1/site/get_site_list']);
});

test('a stored session of another account is not reused', async () => {
  const { dataDir } = setup();
  const first = setup({ dataDir });
  await first.client.getSiteList();
  const other = setup({ dataDir, config: { country: 'DE' } });
  other.anker.token = first.anker.token;
  await other.client.getSiteList();
  assert.equal(other.anker.endpoints()[0], 'passport/login');
});

test('a refused token logs in again once, then retries the request', async () => {
  const { anker, client } = setup();
  await client.getSiteList();
  anker.revokeToken();
  const sites = await client.getSiteList();
  assert.equal(sites.length, 1);
  assert.deepEqual(anker.endpoints().slice(2), [
    'power_service/v1/site/get_site_list',
    'passport/login',
    'power_service/v1/site/get_site_list',
  ]);
});

test('a wrong password is a credentials error, never retried', async () => {
  const { anker, client } = setup({ config: { password: 'not-the-password-42' } });
  await assert.rejects(client.getSiteList(), (err) => {
    assert.ok(err instanceof AnkerError);
    assert.equal(err.kind, 'credentials');
    assert.equal(err.code, 26108);
    assert.ok(!err.message.includes('not-the-password-42'));
    return true;
  });
  assert.deepEqual(anker.endpoints(), ['passport/login']);
});

test('error kinds: network, rate limit, verification code, member permission', async () => {
  const cases = [
    ['network', 'network'],
    [{ code: 429, status: 429 }, 'rate_limit'],
    [{ code: 26052 }, 'verification'],
    [{ code: 160003 }, 'permission'],
    [{ code: 500, status: 502 }, 'server'],
    [{ code: 10007 }, 'api'],
  ];
  for (const [failure, kind] of cases) {
    const { anker, client } = setup();
    await client.getSiteList();
    anker.failures['power_service/v1/site/get_scen_info'] = failure;
    await assert.rejects(client.getSceneInfo(anker.first.site.site_id), (err) => {
      assert.equal(err.kind, kind, JSON.stringify(failure));
      return true;
    });
  }
});

test('a busy cloud is retried once', async () => {
  const { anker, client } = setup();
  await client.getSiteList();
  let calls = 0;
  anker.failures['power_service/v1/site/get_scen_info'] = () =>
    (calls += 1) === 1 ? { code: 21105 } : undefined;
  const scene = await client.getSceneInfo(anker.first.site.site_id);
  assert.ok(scene.solarbank_info);
  assert.equal(calls, 2);
});

test('the server follows the country of the account', () => {
  assert.equal(serverFor('FR'), API_SERVERS.eu);
  assert.equal(serverFor('DE'), API_SERVERS.eu);
  assert.equal(serverFor('UK'), API_SERVERS.eu);
  assert.equal(serverFor('US'), API_SERVERS.com);
  assert.equal(serverFor('AU'), API_SERVERS.com);
});

test('the schedule is read parsed and written as a string, with the command 17', async () => {
  const { anker, client } = setup();
  const siteId = anker.first.site.site_id;
  const schedule = await client.getSchedule(siteId);
  assert.equal(schedule.mode_type, 3);
  await client.setSchedule(siteId, { mode_type: 1 });
  const call = anker.calls.at(-1);
  assert.equal(call.body.param_type, '6');
  assert.equal(call.body.cmd, 17);
  assert.equal(call.body.param_data, '{"mode_type":1}');
});

test('requests are spaced', async () => {
  const anker = createFakeAnker();
  let clock = 0;
  const waits = [];
  const cfg = normalizeConfig({ ...ACCOUNT });
  const client = createAnkerClient({
    getConfig: () => cfg,
    store: new Store(mkdtempSync(join(tmpdir(), 'anker-gap-'))),
    fetch: anker.fetch,
    serverPublicKey: anker.serverPublicKey,
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    minGapMs: 500,
    logger: silent,
  });
  await client.getSiteList();
  await client.getSiteList();
  assert.deepEqual(waits, [500, 500]);
});

test('the time zone header', () => {
  const date = new Date('2026-07-01T12:00:00Z');
  assert.match(timezoneHeader(date), /^GMT[+-]\d{2}:\d{2}$/);
});
