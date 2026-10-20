const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { SettingsStore, defaults } = require('../out/main/main/core/settings.js');
const { JsonLinePeer } = require('../out/main/main/core/rpc.js');
const { readManifest } = require('../out/main/main/core/extensions.js');
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('Shell manifest uses trusted discovery origin, requires capability and confines its entry', (t) => {
  const dir = temporary(t);
  fs.writeFileSync(path.join(dir, 'worker.cjs'), 'exports.activate=async()=>{}');
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
  const manifest = {
    apiVersion: 1,
    id: 'appdock.default-shell',
    name: 'Default Shell',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['shell'],
    shell: { apiVersion: 1, ui: 'index.html' },
    sourceKind: 'builtin',
  };
  const write = () => fs.writeFileSync(path.join(dir, 'extension.json'), JSON.stringify(manifest));
  write();
  assert.throws(() => readManifest(dir), /Reserved/);
  assert.equal(readManifest(dir, 'builtin').sourceKind, 'builtin');
  manifest.id = 'fixture.shell';
  write();
  assert.equal(readManifest(dir).sourceKind, 'external');
  manifest.capabilities = [];
  write();
  assert.throws(() => readManifest(dir), /Invalid Shell/);
  manifest.capabilities = ['shell'];
  manifest.shell.apiVersion = 2;
  write();
  assert.throws(() => readManifest(dir), /Invalid Shell/);
  manifest.shell.apiVersion = 1;
  manifest.shell = { apiVersion: 1, views: { 'overlay.command-palette': 'index.html' } };
  manifest.commands = [{ id: 'fixture.shell.run', title: 'Run' }];
  write();
  assert.equal(readManifest(dir).commands[0].id, 'fixture.shell.run');
  assert.equal(readManifest(dir).shell.ui, undefined);
  manifest.shell.views['overlay.command-palette'] = '../outside.html';
  write();
  assert.throws(() => readManifest(dir));
  manifest.shell = { apiVersion: 1, views: {} };
  write();
  assert.throws(() => readManifest(dir), /Invalid Shell/);
  manifest.shell = { apiVersion: 1 };
  manifest.shell.ui = '../outside.html';
  write();
  assert.throws(() => readManifest(dir));
});
test('settings create beside selected executable directory, persist and reject stale revisions', (t) => {
  const file = path.join(temporary(t), 'settings.json');
  const store = new SettingsStore(file);
  const original = store.load();
  const next = defaults();
  next.host.theme = 'light';
  store.save(next, original.revision);
  assert.equal(JSON.parse(fs.readFileSync(file)).host.theme, 'light');
  assert.throws(() => store.save(defaults(), original.revision), /別の場所/);
  assert.equal(JSON.parse(fs.readFileSync(file)).host.theme, 'light');
});
test('invalid existing JSON is preserved', (t) => {
  const file = path.join(temporary(t), 'settings.json');
  fs.writeFileSync(file, '{broken');
  assert.throws(() => new SettingsStore(file).load());
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});

test('settings retain supported preferences and Applet data while dropping obsolete top-level fields', (t) => {
  const file = path.join(temporary(t), 'settings.json');
  const value = defaults();
  value.host.theme = 'light';
  value.host.trayDoubleClickCommand = 'appdock.commands.search';
  value.extensions['test.applet'] = {
    enabled: true,
    startupDelaySeconds: 5,
    settings: { customData: { x: 1 }, widgets: 'Applet-owned data' },
  };
  value.shortcuts['test.applet.run'] = ['Ctrl+Alt+9'];
  value.pinnedCommands = ['test.applet.run'];
  value.trayCommands = ['test.applet.run'];
  value.globalShortcutCommands = ['test.applet.run'];
  value.profile = { ...value.profile, name: 'Test profile' };
  fs.writeFileSync(file, JSON.stringify({ ...value, widgets: { obsolete: 'unused' } }));
  const store = new SettingsStore(file);
  const loaded = store.load();
  assert.deepEqual(loaded.value, value);
  store.save(loaded.value, loaded.revision);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), value);
});
test('invalid settings do not overwrite valid settings', (t) => {
  const file = path.join(temporary(t), 'settings.json');
  const store = new SettingsStore(file);
  store.load();
  const before = fs.readFileSync(file, 'utf8');
  const invalid = defaults();
  invalid.host.theme = 'unsupported';
  assert.throws(() => store.save(invalid, store.revision), /theme/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('manual changes before watcher notification are not overwritten', (t) => {
  const file = path.join(temporary(t), 'settings.json');
  const store = new SettingsStore(file);
  store.load();
  const revision = store.revision;
  const manual = defaults();
  manual.host.closeToTray = false;
  fs.writeFileSync(file, JSON.stringify(manual));
  assert.throws(() => store.save(defaults(), revision), /別の場所/);
  assert.equal(store.value.host.closeToTray, false);
});

test('failed JSON replacement rolls back the avatar and preserves saved settings', (t) => {
  const dir = temporary(t);
  const file = path.join(dir, 'settings.json');
  const avatar = path.join(dir, 'avatar.png');
  const store = new SettingsStore(file);
  store.load();
  fs.writeFileSync(avatar, 'previous image');
  const before = fs.readFileSync(file, 'utf8');
  const revision = store.revision;
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === file) throw new Error('simulated settings write failure');
    return rename(from, to);
  });
  const next = defaults();
  next.profile = { name: 'New profile', avatar: 'avatar.png' };
  assert.throws(
    () =>
      store.save(next, revision, {
        commit: () => fs.writeFileSync(avatar, 'new image'),
        rollback: () => fs.writeFileSync(avatar, 'previous image'),
      }),
    /simulated settings write failure/,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.readFileSync(avatar, 'utf8'), 'previous image');
  assert.equal(store.revision, revision);
  assert.equal(store.value.profile, undefined);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['avatar.png', 'settings.json']);
});

test('stale or invalid settings cannot commit a staged avatar', (t) => {
  const store = new SettingsStore(path.join(temporary(t), 'settings.json'));
  const original = store.load();
  store.save(defaults(), original.revision);
  let commits = 0;
  const asset = { commit: () => commits++, rollback: () => commits-- };
  assert.throws(() => store.save(defaults(), original.revision, asset), /別の場所/);
  const invalid = defaults();
  invalid.host.theme = 'invalid-theme';
  assert.throws(() => store.save(invalid, store.revision, asset), /theme/);
  assert.equal(commits, 0);
});
test('watcher reloads external changes and retains last valid state on invalid edits', async (t) => {
  const file = path.join(temporary(t), 'settings.json');
  const store = new SettingsStore(file);
  store.load();
  t.after(() => store.close());
  let report;
  store.watch((e) => {
    report = e;
  });
  const changed = new Promise((resolve) => store.once('changed', resolve));
  const config = defaults();
  config.host.theme = 'dark';
  fs.writeFileSync(file, JSON.stringify(config));
  await changed;
  fs.writeFileSync(file, '{broken');
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(store.value.host.theme, 'dark');
  assert.ok(report);
});
test('RPC handles UTF-8, bidirectional requests and method errors', async () => {
  const aToB = new PassThrough();
  const bToA = new PassThrough();
  const a = new JsonLinePeer(bToA, aToB, async (method, p) => p.a + 1);
  const b = new JsonLinePeer(aToB, bToA, async (method, p) => {
    if (method === 'fail') throw new Error('failure');
    return { text: p.text, value: await b.request('callback', { a: 5 }) };
  });
  const result = await a.request('call', { text: 'ユキちゃん' });
  assert.deepEqual(result, { text: 'ユキちゃん', value: 6 });
  await assert.rejects(a.request('fail'), /failure/);
  a.close();
  b.close();
  aToB.destroy();
  bToA.destroy();
});
test('RPC times out and rejects outstanding requests on disconnect', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const peer = new JsonLinePeer(input, output, async () => null, 30);
  await assert.rejects(peer.request('missing'), /タイムアウト/);
  const promise = peer.request('pending');
  peer.close();
  await assert.rejects(promise, /終了/);
  input.destroy();
  output.destroy();
});
test('RPC rejects oversized input without attempting to parse it', () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const peer = new JsonLinePeer(input, output, async () => null);
  let error;
  peer.on('protocolError', (e) => {
    error = e;
  });
  input.write('x'.repeat(1024 * 1024 + 1));
  assert.ok(error);
  assert.equal(peer.closed, true);
  input.destroy();
  output.destroy();
});
test('manifest entry cannot escape its extension folder', (t) => {
  const dir = temporary(t);
  const folder = path.join(dir, 'extension');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(dir, 'outside.js'), '');
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'test.extension',
      name: 'Test',
      version: '1',
      runtime: 'node',
      entry: '../outside.js',
    }),
  );
  assert.throws(() => readManifest(folder), /フォルダ内/);
});
