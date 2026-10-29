const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const {
  allowedWebNavigation,
  validateWebAccounts,
  parseWebViewport,
  serializeWebReport,
  serializeWebItemKey,
  parseWebAccountSound,
} = require('../out/main/main/core/web-accounts');
const { readManifest } = require('../out/main/main/core/extensions');
const { createHostApi } = require('../out/main/main/core/host-api');

test('Worker read excludes UI reports so multi-account history cannot overflow JSON-RPC', async () => {
  const { WebAccountController } = require('../out/main/main/core/web-accounts');
  const accounts = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    name: 'Account ' + i,
    sound: { enabled: false, file: 'C:\\' + 'あ'.repeat(4000) + '.wav' },
  }));
  const fake = {
    state: { accounts, selected: '0' },
    definition: { url: 'https://mail.google.com' },
    views: new Map(),
    deleting: new Set(),
    soundFailures: new Map(),
    acknowledgements: new Set(['0']),
    monitoringResets: new Set(),
    statuses: new Map(
      accounts.map((a) => [
        a.id,
        { observation: 'x'.repeat(59000), data: JSON.stringify('y'.repeat(49000)) },
      ]),
    ),
    start() {},
    snapshot: WebAccountController.prototype.snapshot,
  };
  assert.ok(Buffer.byteLength(JSON.stringify(fake.snapshot())) > 1024 * 1024);
  const read = await WebAccountController.prototype.read.call(fake);
  assert.ok(Buffer.byteLength(JSON.stringify(read)) < 1024 * 1024);
  assert.ok(read.accounts.every((a) => a.data === null && a.observation.length === 59000));
  assert.deepEqual(read.acknowledged, ['0']);
  assert.equal(fake.acknowledgements.size, 0);
});
test('Web account navigation requires exact declared HTTPS origins and excludes credentials', () => {
  const origins = ['https://mail.google.com'];
  assert.equal(allowedWebNavigation('https://mail.google.com/mail/u/0/#inbox', origins), true);
  for (const url of [
    'http://mail.google.com',
    'https://mail.google.com.evil.test',
    'https://mail.google.com:8443',
    'https://u:p@mail.google.com',
    'file:///C:/',
  ])
    assert.equal(allowedWebNavigation(url, origins), false);
});
test('Web item keys cannot inject source, and sound settings accept only local WAV files', () => {
  const key = 'x"); globalThis.injection = true; //';
  const argument = serializeWebItemKey(key);
  assert.equal(require('node:vm').runInNewContext(`((value) => value)(${argument})`), key);
  for (const value of [null, {}, '', 'x'.repeat(201), 'line\nend'])
    assert.throws(() => serializeWebItemKey(value), /key/);
  assert.deepEqual(parseWebAccountSound({ enabled: false, file: '' }), {
    enabled: false,
    file: '',
  });
  assert.deepEqual(parseWebAccountSound({ enabled: true, file: 'C:\\fixture\\sound.WAV' }), {
    enabled: true,
    file: 'C:\\fixture\\sound.WAV',
  });
  for (const sound of [
    null,
    {},
    { enabled: 1, file: '' },
    { enabled: true, file: 'nested/relative.wav' },
    { enabled: true, file: 'https://evil.test/a.wav' },
    { enabled: true, file: 'C:\\fixture\\sound.exe' },
    { enabled: true, file: 'C:\\' + 'x'.repeat(4096) + '.wav' },
    { enabled: true, file: 'C:\\fixture\\bad\u0000.wav' },
  ])
    assert.throws(() => parseWebAccountSound(sound), /WAV/);
  assert.deepEqual(parseWebAccountSound({ enabled: true, file: 'ベル.wav' }), {
    enabled: true,
    file: 'ベル.wav',
  });
});
test('Web account cycle wraps, preserves one account and rejects invalid directions', async () => {
  const { WebAccountController } = require('../out/main/main/core/web-accounts');
  const fake = {
    state: { accounts: [{ id: 'a' }, { id: 'b' }], selected: 'a' },
    deleting: new Set(),
    viewport: { x: 0, y: 0, width: 800, height: 600 },
    save(next) {
      this.state = next;
    },
    show(id) {
      this.shown = id;
    },
    async open() {
      throw Error('Cycling must not open or activate a window');
    },
    attached: {
      webContents: {
        focus() {
          throw Error('Cycling must not move keyboard focus');
        },
      },
    },
  };
  const cycle = (direction) => WebAccountController.prototype.cycle.call(fake, direction);
  await cycle(1);
  assert.equal(fake.state.selected, 'b');
  await cycle(1);
  assert.equal(fake.state.selected, 'a');
  await cycle(-1);
  assert.equal(fake.state.selected, 'b');
  fake.deleting.add('a');
  await cycle(1);
  assert.equal(fake.state.selected, 'b');
  await assert.rejects(cycle(0), /direction/);
  fake.disposed = true;
  await assert.rejects(cycle(1), /closed/);
});

test('Account ordering preserves selected IDs, sessions and settings; monitoring transitions reset worker state', async () => {
  const { WebAccountController: Controller } = require('../out/main/main/core/web-accounts');
  const fake = {
    state: {
      accounts: [
        { id: 'a', name: 'A', sound: { enabled: true, file: '' } },
        { id: 'b', name: 'B' },
      ],
      selected: 'a',
    },
    deleting: new Set(),
    monitoringResets: new Set(),
    statuses: new Map([['a', { attention: true, data: '{"pending":3}' }]]),
    views: new Map([['a', { session: 'preserved' }]]),
    changed() {},
    save(next) {
      this.state = next;
    },
    account: Controller.prototype.account,
  };
  const invoke = (method, ...args) => Controller.prototype.invoke.call(fake, method, args);
  await invoke('move', 'a', 1);
  assert.deepEqual(
    fake.state.accounts.map((a) => a.id),
    ['b', 'a'],
  );
  assert.equal(fake.state.selected, 'a');
  assert.equal(fake.views.get('a').session, 'preserved');
  assert.equal(fake.state.accounts[1].sound.enabled, true);
  await invoke('move', 'a', 1); // End of list is a no-op.
  assert.deepEqual(
    fake.state.accounts.map((a) => a.id),
    ['b', 'a'],
  );
  await assert.rejects(invoke('move', 'missing', -1), /ありません/);
  await assert.rejects(invoke('move', 'a', 0), /direction/);
  await assert.rejects(invoke('setMonitoring', 'a', 'false'), /monitoring/);
  await invoke('setMonitoring', 'a', false);
  assert.equal(fake.state.accounts[1].monitoring, false);
  assert.equal(fake.statuses.get('a').attention, false);
  assert.equal(fake.statuses.get('a').data, 'null');
  assert.ok(fake.monitoringResets.has('a'));
  // A stale report from an in-flight worker must not resurrect a paused badge.
  Controller.prototype.report.call(fake, 'a', 'new', true, { pending: 1 });
  assert.equal(fake.statuses.get('a').attention, false);
  assert.equal(fake.statuses.get('a').data, 'null');
  await invoke('setMonitoring', 'a', true);
  assert.equal(fake.state.accounts[1].monitoring, true);
  assert.ok(fake.monitoringResets.has('a'));
});

test('Cycle transfers focused Gmail input but preserves local UI and other windows', async () => {
  const { WebAccountController: Controller } = require('../out/main/main/core/web-accounts');
  let windowFocused = true,
    pageFocused = true,
    transfers = 0;
  const nextView = {
    webContents: {
      focus() {
        transfers++;
      },
    },
  };
  const fake = {
    state: { accounts: [{ id: 'a' }, { id: 'b' }], selected: 'a' },
    deleting: new Set(),
    window: {
      isFocused: () => windowFocused,
      isVisible: () => true,
      isMinimized: () => false,
      contentView: { children: [nextView] },
    },
    surface: { visible: true },
    attached: { webContents: { isFocused: () => pageFocused } },
    save(next) {
      this.state = next;
    },
    show() {
      this.attached = nextView;
    },
  };
  const cycle = async () => {
    fake.contentView = fake.window.contentView;
    fake.attached = { webContents: { isFocused: () => pageFocused } };
    await Controller.prototype.cycle.call(fake, 1);
  };
  await cycle();
  assert.equal(transfers, 1);
  // Home can be focused while Gmail is parked; that must not transfer input.
  fake.surface.visible = false;
  await cycle();
  assert.equal(transfers, 1);
  fake.surface.visible = true;
  windowFocused = false;
  await cycle();
  assert.equal(transfers, 1);
  windowFocused = true;
  pageFocused = false;
  await cycle();
  assert.equal(transfers, 1);
});

test('Only temporary account names are replaced and explicit renames win', async () => {
  const { WebAccountController: Controller } = require('../out/main/main/core/web-accounts');
  const { randomUUID } = require('node:crypto');
  const root = path.resolve('.artifacts/web-account-name-unit', randomUUID());
  fs.mkdirSync(root, { recursive: true });
  const ids = { new: randomUUID(), legacy: randomUUID(), custom: randomUUID() };
  const fake = {
    root,
    file: path.join(root, 'accounts.json'),
    definition: {},
    settingsRoster: Controller.prototype.settingsRoster,
    changed() {},
    state: {
      version: 1,
      accounts: [
        { id: ids.new, name: '新しいアカウント', temporaryName: true, monitoring: false },
        { id: ids.legacy, name: 'アカウント 2' },
        { id: ids.custom, name: '仕事用' },
      ],
      selected: ids.new,
    },
    deleting: new Set(),
    account: Controller.prototype.account,
    save(next) {
      this.state = next;
      fs.writeFileSync(this.file, JSON.stringify(next));
    },
  };
  fake.save(fake.state);
  const update = (id, value) => Controller.prototype.updateAccountName.call(fake, ids[id], value);
  for (const raw of [null, {}, '', 'x'.repeat(61), 'bad\nname']) update('new', raw);
  assert.equal(fake.state.accounts[0].name, '新しいアカウント');
  update('new', 'Gmail Name');
  assert.equal(fake.state.accounts[0].name, 'Gmail Name');
  assert.equal(fake.state.accounts[0].monitoring, false);
  update('new', 'Later Name');
  assert.equal(fake.state.accounts[0].name, 'Gmail Name');
  update('legacy', 'account@example.test');
  assert.equal(fake.state.accounts[1].name, 'account@example.test');
  update('custom', 'Ignored');
  assert.equal(fake.state.accounts[2].name, '仕事用');
  await Controller.prototype.invoke.call(fake, 'rename', [ids.new, '新しいアカウント']);
  update('new', 'Ignored after explicit rename');
  assert.equal(fake.state.accounts[0].name, '新しいアカウント');
});

test('Web account viewport and transient UI report are bounded', () => {
  assert.equal(parseWebViewport(null), null);
  assert.deepEqual(parseWebViewport({ x: 20, y: 100, width: 800, height: 600, extra: 1 }), {
    x: 20,
    y: 100,
    width: 800,
    height: 600,
  });
  for (const v of [
    undefined,
    {},
    { x: -1, y: 1, width: 1, height: 1 },
    { x: 0, y: 0, width: NaN, height: 1 },
    { x: 0, y: 0, width: 1.5, height: 1 },
    { x: 0, y: 0, width: 100001, height: 1 },
  ])
    assert.throws(() => parseWebViewport(v), /viewport/);
  assert.equal(serializeWebReport(undefined), 'null');
  assert.deepEqual(JSON.parse(serializeWebReport({ count: 2 })), { count: 2 });
  assert.throws(() => serializeWebReport('あ'.repeat(20000)), /large/);
  const circular = {};
  circular.self = circular;
  assert.throws(() => serializeWebReport(circular));
});
test('Web assets cannot escape Applet; observer origin and capability must be declared', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-account-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'applet'));
  fs.writeFileSync(path.join(dir, 'outside.js'), '');
  const folder = path.join(dir, 'applet');
  for (const f of ['index.js', 'ui.html', 'observer.js'])
    fs.writeFileSync(path.join(folder, f), '');
  const web = {
    url: 'https://mail.google.com/mail/u/0/#inbox',
    origins: ['https://mail.google.com'],
    observeOrigin: 'https://mail.google.com',
    ui: 'ui.html',
    observer: 'observer.js',
  };
  assert.deepEqual(validateWebAccounts(folder, web), web);
  assert.equal(
    validateWebAccounts(folder, { ...web, accountGroup: { id: 'at365.google', title: 'Google' } })
      .accountGroup.id,
    'at365.google',
  );
  for (const accountGroup of [
    null,
    {},
    { id: '../google', title: 'Google' },
    { id: 'at365.google', title: '' },
    { id: 'at365.google', title: 'Google', path: 'C:\\outside' },
  ])
    assert.throws(() => validateWebAccounts(folder, { ...web, accountGroup }), /accountGroup/);
  for (const externalLinkSetting of [true, '', '../other', 'x'.repeat(81)])
    assert.throws(
      () => validateWebAccounts(folder, { ...web, externalLinkSetting }),
      /setting key/,
    );
  const declared = {
    apiVersion: 1,
    id: 'test.web',
    name: 'Test',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    capabilities: ['web-accounts', 'settings'],
    webAccounts: { ...web, externalLinkSetting: 'skipConfirmation' },
    settings: [{ key: 'skipConfirmation', title: 'Skip', type: 'boolean', default: false }],
  };
  const check = (value) => {
    fs.writeFileSync(path.join(folder, 'extension.json'), JSON.stringify(value));
    return readManifest(folder);
  };
  assert.equal(check(declared).webAccounts.externalLinkSetting, 'skipConfirmation');
  assert.throws(() => check({ ...declared, settings: [] }), /boolean/);
  assert.throws(
    () =>
      check({ ...declared, settings: [{ ...declared.settings[0], type: 'string', default: '' }] }),
    /boolean/,
  );
  assert.throws(
    () => check({ ...declared, capabilities: ['web-accounts'] }),
    /settings capability/,
  );
  assert.throws(() => validateWebAccounts(folder, { ...web, observer: '../outside.js' }), /inside/);
  assert.throws(
    () => validateWebAccounts(folder, { ...web, itemOpener: '../outside.js' }),
    /inside/,
  );
  fs.writeFileSync(path.join(folder, 'open.js'), 'x'.repeat(100001));
  assert.throws(() => validateWebAccounts(folder, { ...web, itemOpener: 'open.js' }), /large/);
  assert.throws(
    () => validateWebAccounts(folder, { ...web, observeOrigin: 'https://accounts.google.com' }),
    /origins/,
  );
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'test.web',
      name: 'Test',
      version: '0.1.0',
      runtime: 'node',
      entry: 'index.js',
      webAccounts: web,
    }),
  );
  assert.throws(() => readManifest(folder), /capability/);
});
test('Web account API is unavailable without capability and when extension is stopped', async () => {
  const api = createHostApi(
    {},
    '',
    () => {},
    () => {},
  );
  const e = { state: 'running', manifest: { id: 'test.web', capabilities: [] } };
  for (const method of ['start', 'read', 'open', 'cycle', 'report'])
    await assert.rejects(api(e, 'host.webAccounts.' + method, {}), /capabilities/);
  e.state = 'stopped';
  e.manifest.capabilities = ['web-accounts'];
  await assert.rejects(api(e, 'host.webAccounts.start', {}), /停止/);
  await assert.rejects(api(e, 'host.webAccounts.navigate', { action: 'reload' }), /停止/);
});

test('Web navigation commands reject invalid actions without creating a view; use the selected account and update UI revision', async () => {
  const { WebAccountController } = require('../out/main/main/core/web-accounts');
  const calls = [];
  const fake = {
    state: { selected: 'second' },
    definition: { url: 'https://mail.google.com/#inbox' },
    navigationRevision: 0,
    async start() {},
    view(id) {
      assert.equal(id, 'second');
      return {
        webContents: {
          navigationHistory: {
            canGoBack: () => true,
            canGoForward: () => false,
            goBack: () => calls.push('back'),
            goForward: () => calls.push('forward'),
          },
          reload: () => calls.push('reload'),
          async loadURL(url) {
            calls.push(url);
          },
        },
      };
    },
    changed() {
      calls.push('changed');
    },
  };
  await assert.rejects(WebAccountController.prototype.navigate.call(fake, 'arbitrary'), /Invalid/);
  assert.deepEqual(calls, []);
  for (const action of ['back', 'forward', 'reload', 'inbox'])
    await WebAccountController.prototype.navigate.call(fake, action);
  assert.equal(fake.navigationRevision, 4);
  assert.deepEqual(calls, [
    'back',
    'changed',
    'changed',
    'reload',
    'changed',
    'https://mail.google.com/#inbox',
    'changed',
  ]);
});
