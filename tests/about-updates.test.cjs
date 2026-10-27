const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { PortableUpdates } = require('../out/main/main/core/portable-updates.js');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema.js');
const { settingsProjection, applySettingsJson } = require('../out/main/shared/settings-catalog.js');

function fixture(automatic = true) {
  const settings = createDefaultSettings().updates;
  settings.checkHostOnAboutOpen = automatic;
  const requests = [],
    notices = [];
  let latest = '1.0.0',
    failure = false,
    hold;
  const host = {
    id: 'host',
    name: 'AppDock',
    kind: 'host',
    version: '1.0.0',
    source: 'http://localhost/host.json',
    destination: 'unused',
  };
  const updater = new PortableUpdates({
    targets: () => [
      host,
      { ...host, id: 'applet', kind: 'applet', source: 'http://localhost/applet.json' },
    ],
    settings: () => settings,
    hostVersion: host.version,
    helper: 'unused',
    executable: path.join(os.tmpdir(), 'appdock-fixture-never-launched.exe'),
    baseDirectory: os.tmpdir(),
    restartArgs: [],
    processIds: () => [],
    changed() {},
    log() {},
    confirm: async () => {
      throw Error('unexpected installation confirmation');
    },
    shutdown() {
      throw Error('unexpected shutdown');
    },
    notified: (notice) => notices.push(notice),
    fetcher: async (url) => {
      requests.push(url);
      if (hold) await hold;
      if (failure) throw Error('fixture unavailable');
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          kind: url.endsWith('/applet.json') ? 'applet' : 'host',
          id: url.endsWith('/applet.json') ? 'applet' : 'host',
          version: latest,
          payload: { file: 'update.zip', format: 'zip', sha256: 'a'.repeat(64), size: 20 },
        }),
        { status: 200 },
      );
    },
  });
  return {
    settings,
    host,
    requests,
    notices,
    updater,
    setLatest: (v) => (latest = v),
    setFailure: (v) => (failure = v),
    setHold: (v) => (hold = v),
  };
}

test('fresh startup and About do not request updates; an explicit check reads only version metadata', async () => {
  const f = fixture(false);
  await f.updater.checkHostOnAboutOpen();
  assert.equal(
    f.updater.scheduleStartup(false, () => assert.fail('unexpected startup notification')),
    undefined,
  );
  assert.deepEqual(f.requests, []);
  f.setLatest('2.0.0');
  await f.updater.check();
  assert.deepEqual(f.requests, ['http://localhost/host.json', 'http://localhost/applet.json']);
  assert(f.updater.state.results.every((result) => result.status === 'available'));
});

test('About auto-check defaults off, preserves explicit values and validates its saved setting', () => {
  assert.equal(createDefaultSettings().updates.checkHostOnAboutOpen, false);
  const saved = createDefaultSettings();
  saved.updates.checkHostOnAboutOpen = false;
  assert.equal(parseSettings(saved).updates.checkHostOnAboutOpen, false);
  const page = { id: 'about', kind: 'host', json: true };
  const projected = settingsProjection(saved, page, []);
  assert.equal(projected.updates.checkHostOnAboutOpen, false);
  projected.updates.checkHostOnAboutOpen = true;
  assert.equal(
    applySettingsJson(saved, page, [], JSON.stringify(projected)).updates.checkHostOnAboutOpen,
    true,
  );
  saved.updates.checkHostOnAboutOpen = 'yes';
  assert.throws(() => parseSettings(saved), /checkHostOnAboutOpen/);
});

test('About checks only the host once per hour, and manual checks refresh that interval', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-25T00:00:00Z') });
  const f = fixture();
  await f.updater.checkHostOnAboutOpen();
  assert.deepEqual(f.requests, ['http://localhost/host.json']);
  assert.deepEqual(f.notices, []);
  t.mock.timers.tick(60 * 60 * 1000 - 1);
  await f.updater.checkHostOnAboutOpen();
  assert.equal(f.requests.length, 1);
  t.mock.timers.tick(1);
  await f.updater.checkHostOnAboutOpen();
  assert.equal(f.requests.length, 2);
  t.mock.timers.tick(30 * 60 * 1000);
  await f.updater.check(['host']);
  assert.equal(f.requests.length, 3);
  t.mock.timers.tick(30 * 60 * 1000);
  await f.updater.checkHostOnAboutOpen();
  assert.equal(f.requests.length, 3);
  f.host.source = 'http://localhost/other.json';
  await f.updater.checkHostOnAboutOpen();
  assert.equal(f.requests.at(-1), f.host.source);
});

test('disabled or blank automatic sources do not check; concurrent entries share one running check', async () => {
  const f = fixture();
  f.settings.checkHostOnAboutOpen = false;
  await f.updater.checkHostOnAboutOpen();
  assert.equal(f.requests.length, 0);
  f.settings.checkHostOnAboutOpen = true;
  f.host.source = '';
  await f.updater.checkHostOnAboutOpen();
  assert.equal(f.requests.length, 0);
  f.host.source = 'http://localhost/host.json';
  let release;
  f.setHold(new Promise((r) => (release = r)));
  const first = f.updater.checkHostOnAboutOpen();
  await f.updater.checkHostOnAboutOpen();
  assert.equal(f.requests.length, 1);
  release();
  await first;
  f.updater.state.results = [];
  f.updater.packagePlans.set('fixture', {});
  await f.updater.checkHostOnAboutOpen();
  assert.equal(f.requests.length, 1);
});

test('check-only current/unconfigured results stay quiet; available and failed checks still notify', async () => {
  const f = fixture();
  await f.updater.check(['host']);
  assert.deepEqual(f.notices, []);
  f.host.source = '';
  await f.updater.check(['host']);
  assert.deepEqual(f.notices, []);
  f.host.source = 'http://localhost/host.json';
  f.setLatest('2.0.0');
  await f.updater.check(['host']);
  assert.deepEqual(
    f.notices.map((n) => n.kind),
    ['available'],
  );
  f.setFailure(true);
  await f.updater.check(['host']);
  assert.deepEqual(
    f.notices.map((n) => n.kind),
    ['available', 'error'],
  );
  await f.updater.checkHostOnAboutOpen();
  assert.equal(f.notices.length, 2);
});

test('executing an update with no newer version retains its completion notification', async () => {
  const f = fixture();
  await f.updater.install('host');
  assert.equal(f.updater.state.results[0].status, 'current');
  assert.equal(f.notices.length, 1);
  assert.equal(f.notices[0].kind, 'info');
  assert.match(f.notices[0].message, /更新はありません/);
});
