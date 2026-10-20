const { settleSettings } = require('./settings-immediate-helper.cjs');
// Two isolated placements simulate file-sync delivery. No live accounts or real sync service.
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] && path.resolve(process.argv[2]);
const productionPath = process.argv.includes('--production-path');
if (productionPath && !portable) throw Error('--production-path requires a portable EXE');
const output = path.join(root, '.artifacts', `settings-sync-ui-${Date.now()}`);
const checks = [],
  states = [];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await wait(100);
  }
  throw Error(label);
}
async function port() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
function profile(name) {
  const base = path.join(output, name),
    localAppData = path.join(base, 'LocalAppData'),
    local = productionPath
      ? path.join(
          localAppData,
          'at365',
          'AppDock',
          'profiles',
          createHash('sha256').update(base.toLowerCase()).digest('hex'),
        )
      : path.join(base, 'local-state');
  fs.mkdirSync(base, { recursive: true });
  const value = require('../out/main/shared/settings-schema').createDefaultSettings();
  require('./profile-settings-fixture.cjs').installProfileSettings(base, value);
  value.host.hardwareAcceleration = false;
  value.host.notifications = false;
  value.keybindings = [];
  value.globalShortcutCommands = [];
  value.gestures.enabled = false;
  value.extensions['at365.gmail'] = {
    enabled: false,
    settings: { monitoring: false, notifications: false },
  };
  fs.writeFileSync(path.join(base, 'settings.json'), JSON.stringify(value));
  const gmail = path.join(base, 'extensions', 'Applet.Gmail.at365');
  fs.cpSync(path.join(root, '../../40.ARTIFACT/Applet.Gmail.at365/Applet.Gmail.at365'), gmail, {
    recursive: true,
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(gmail, 'extension.json'), 'utf8'));
  manifest.webAccounts.url = 'https://gmail-sync.test/';
  manifest.webAccounts.origins = ['https://gmail-sync.test'];
  manifest.webAccounts.observeOrigin = 'https://gmail-sync.test';
  manifest.webAccounts.avatarOrigins = [];
  fs.writeFileSync(path.join(gmail, 'extension.json'), JSON.stringify(manifest));
  const account = { id: randomUUID(), name: `${name}専用` },
    accountFile = path.join(local, 'web-accounts', 'at365.gmail', 'accounts.json');
  fs.mkdirSync(path.dirname(accountFile), { recursive: true });
  fs.writeFileSync(
    accountFile,
    JSON.stringify({ version: 1, selected: account.id, accounts: [account] }),
  );
  if (portable) {
    fs.copyFileSync(portable, path.join(base, 'AppDock.at365.exe'));
    assert.equal(hash(portable), hash(path.join(base, 'AppDock.at365.exe')));
  }
  return { base, local, localAppData, account, accountFile };
}
async function start(p) {
  const debug = await port(),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (productionPath) env.LOCALAPPDATA = p.localAppData;
  const exe = portable ? path.join(p.base, 'AppDock.at365.exe') : require('electron');
  const child = spawn(
    exe,
    [
      ...(portable ? [] : [root]),
      ...(!productionPath ? [`--test-profile=${p.base}`, `--test-local-state=${p.local}`] : []),
      `--remote-debugging-port=${debug}`,
    ],
    { cwd: p.base, env, windowsHide: true, stdio: 'ignore' },
  );
  const state = { ...p, child };
  states.push(state);
  state.browser = await until(
    () => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1000 }),
    'CDP',
  );
  state.dock = await until(
    () =>
      state.browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('appdock://host/')),
    'host',
  );
  state.dock = require('./settings-aware-page.cjs').settingsAwarePage(state.dock);
  state.dock.setDefaultTimeout(15000);
  state.snapshot = () => state.dock.evaluate(() => window.dock.snapshot());
  await until(async () => (await state.snapshot()).startupReady, 'startup');
  await state.browser.contexts()[0].route('https://gmail-sync.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><main role="main"><table class="TB"><tr class="TD"><td class="TC">受信トレイは空です</td></tr></table></main>',
    }),
  );
  return state;
}
async function stop(s) {
  if (!s.browser) return;
  await s.dock.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  await until(() => s.child.exitCode !== null, 'shutdown');
  await s.browser.close().catch(() => {});
  s.browser = undefined;
}
function deliverFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to + '.incoming');
  fs.renameSync(to + '.incoming', to);
}
function deliverShared(a, b) {
  deliverFile(path.join(a.base, 'settings.json'), path.join(b.base, 'settings.json'));
  const shared = path.join(a.base, 'data');
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const from = path.join(dir, e.name);
      if (e.isDirectory()) walk(from);
      else deliverFile(from, path.join(b.base, 'data', path.relative(shared, from)));
    }
  }
  if (fs.existsSync(shared)) walk(shared);
}
async function update(s, change) {
  const v = (await s.snapshot()).settings;
  change(v.value);
  await s.dock.evaluate((v) => window.dock.saveSettings(v.value, v.revision), v);
}
async function gmail(s) {
  await s.dock.evaluate(() => window.dock.toggleExtension('at365.gmail', true));
  await until(
    async () =>
      (await s.snapshot()).extensions.find((e) => e.id === 'at365.gmail')?.state === 'running',
    'Gmail start',
  );
  await s.dock.evaluate(() => window.dock.executeCommand('at365.gmail.open'));
  const ui = await until(
    () =>
      s.browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().includes('/web/index.html')),
    'Gmail UI',
  );
  await ui.getByRole('button', { name: 'アカウント設定', exact: true }).click();
  return ui;
}
(async () => {
  const pa = profile('PC-A'),
    pb = profile('PC-B');
  const oldMarker = path.join(pb.base, '.appdock', 'storage', 'preserved.json');
  fs.mkdirSync(path.dirname(oldMarker), { recursive: true });
  fs.writeFileSync(oldMarker, 'old data must stay untouched');
  let a = await start(pa),
    b = await start(pb);
  assert.equal((await a.snapshot()).dataDirectory, pa.local);
  assert.equal((await b.snapshot()).dataDirectory, pb.local);
  assert.equal((await a.snapshot()).sharedDirectory, path.join(pa.base, 'data'));
  assert.equal((await b.snapshot()).sharedDirectory, path.join(pb.base, 'data'));
  assert.equal((await b.snapshot()).legacyLocalData, true);
  assert.equal(fs.existsSync(path.join(pa.base, '.appdock')), false);
  assert.equal(fs.existsSync(path.join(pa.base, 'data', 'chromium')), false);
  checks.push('Chromium and Gmail state stay in separate local roots');
  await update(a, (v) => (v.host.theme = 'light'));
  deliverShared(a, b);
  await until(async () => !(await b.snapshot()).dark, 'theme received');
  checks.push('rename-delivered settings apply while running');
  await b.dock.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await b.dock.getByRole('button', { name: 'プロフィール', exact: true }).click();
  await b.dock.getByLabel('ユーザー名').fill('即時保存');
  await b.dock.getByLabel('ユーザー名').press('Enter');
  await settleSettings(b.dock);
  assert.equal(
    (await b.snapshot()).settings.value.extensions['fixture.profile'].settings.name,
    '即時保存',
  );
  await update(a, (v) => (v.extensions['fixture.profile'].settings.name = '相手の名前'));
  deliverShared(a, b);
  await until(
    async () =>
      (await b.snapshot()).settings.value.extensions['fixture.profile'].settings.name ===
      '相手の名前',
    'remote name',
  );
  await until(
    async () => (await b.dock.getByLabel('ユーザー名').inputValue()) === '相手の名前',
    'external value shown',
  );
  checks.push(
    'immediate local setting persists and received external setting replaces the canonical value',
  );
  const broken = '{broken';
  fs.writeFileSync(path.join(pb.base, 'settings.json'), broken);
  await until(async () => (await b.snapshot()).settings.recovered, 'invalid receipt');
  assert.equal(
    (await b.snapshot()).settings.value.extensions['fixture.profile'].settings.name,
    '相手の名前',
  );
  await stop(b);
  b = await start(pb);
  assert.equal((await b.snapshot()).settings.recovered, true);
  assert.equal(fs.readFileSync(path.join(pb.base, 'settings.json'), 'utf8'), broken);
  checks.push('restart uses local backup without rewriting corrupted shared file');
  deliverShared(a, b);
  await until(async () => !(await b.snapshot()).settings.recovered, 'healthy receipt');
  checks.push('valid incoming settings clear the recovery state');
  const uiA = await gmail(a),
    uiB = await gmail(b);
  const accountSnapshot = (ui) => ui.evaluate(() => window.webAccounts.snapshot());
  assert.equal((await accountSnapshot(uiA)).accounts[0].id, pa.account.id);
  assert.equal((await accountSnapshot(uiB)).accounts[0].id, pb.account.id);
  checks.push(
    'each PC imports its original Gmail identity before receiving the shared group roster',
  );
  const wave = Buffer.alloc(44);
  wave.write('RIFF');
  wave.write('WAVE', 8);
  const soundPath = path.join(
    pa.base,
    'data',
    'assets',
    'applets',
    'at365.gmail',
    'sounds',
    'ベル.wav',
  );
  fs.mkdirSync(path.dirname(soundPath), { recursive: true });
  fs.writeFileSync(soundPath, wave);
  deliverShared(a, b);
  await until(
    async () => (await accountSnapshot(uiB)).accounts[0]?.id === pa.account.id,
    'Gmail group roster receipt',
  );
  assert.equal((await accountSnapshot(uiB)).accounts.length, 1);
  checks.push('Gmail group identities synchronize; account-specific sound settings remain local');
  await until(
    async () =>
      (await accountSnapshot(uiA)).registeredSounds.includes('ベル.wav') &&
      (await accountSnapshot(uiB)).registeredSounds.includes('ベル.wav'),
    'registered list',
  );
  await uiA.getByLabel('登録済みの通知音').selectOption('ベル.wav');
  await until(
    async () => (await accountSnapshot(uiA)).accounts[0].sound.file === 'ベル.wav',
    'select existing',
  );
  assert.equal((await accountSnapshot(uiB)).accounts[0].sound.file, '');
  await uiB.getByLabel('登録済みの通知音').selectOption('ベル.wav');
  await until(
    async () => (await accountSnapshot(uiB)).accounts[0].sound.file === 'ベル.wav',
    'select other PC',
  );
  checks.push('registered filenames are listed live and selected independently per Gmail account');
  const imageFile = path.join(pa.base, 'data/assets/images/fixture.png');
  fs.mkdirSync(path.dirname(imageFile), { recursive: true });
  fs.copyFileSync(path.join(root, 'assets/icon.png'), imageFile);
  await update(a, (v) => {
    v.extensions['fixture.profile'].settings.avatar = { file: 'fixture.png' };
    v.imageLibrary = {
      groups: [{ id: 'photos', name: '写真', images: [{ file: 'fixture.png' }] }],
    };
  });
  deliverShared(a, b);
  await until(
    async () =>
      (await b.snapshot()).settings.value.extensions['fixture.profile'].settings.avatar?.file ===
      'fixture.png',
    'image ref',
  );
  const imageSnapshot = () => b.dock.evaluate(() => window.dock.imageLibrary.snapshot());
  await until(
    async () =>
      (await imageSnapshot()).images.some((i) => i.ref.file === 'fixture.png' && i.available),
    'image receipt',
  );
  const before = (await imageSnapshot()).images.find((i) => i.ref.file === 'fixture.png').thumbnail;
  // A second valid PNG changes pixels without changing the logical reference.
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
    'base64',
  );
  fs.writeFileSync(imageFile, pixel);
  deliverFile(imageFile, path.join(pb.base, 'data/assets/images/fixture.png'));
  await until(
    async () =>
      (await imageSnapshot()).images.find((i) => i.ref.file === 'fixture.png')?.thumbnail !==
      before,
    'image-only update',
  );
  assert.equal((await imageSnapshot()).groups[0].images[0].file, 'fixture.png');
  checks.push('common image refs/groups synchronize and image-only receipt refreshes the preview');
  await uiA.locator('.sound-file').scrollIntoViewIfNeeded();
  await uiA.screenshot({ path: path.join(output, 'gmail-light.png') });
  await update(a, (v) => (v.host.theme = 'dark'));
  await until(async () => (await accountSnapshot(uiA)).dark, 'dark');
  await uiA.locator('.sound-file').scrollIntoViewIfNeeded();
  await uiA.screenshot({ path: path.join(output, 'gmail-dark.png') });
  await stop(b);
  b = await start(pb);
  const again = await gmail(b);
  assert.equal((await accountSnapshot(again)).accounts[0].sound.file, 'ベル.wav');
  checks.push('restart retains the shared Gmail roster and local notification sound selection');
  for (const s of states) await stop(s);
  assert.equal(fs.existsSync(path.join(pa.base, '.appdock')), false);
  assert.equal(fs.readFileSync(oldMarker, 'utf8'), 'old data must stay untouched');
  checks.push('shared roster and assets use data; old .appdock remains untouched');
  const result = {
    ok: true,
    mode: productionPath ? 'portable-production-path' : portable ? 'portable' : 'source',
    checks,
    portableHash: portable && hash(portable),
    output,
  };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
})()
  .catch((error) => {
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      path.join(output, 'result.json'),
      JSON.stringify({ ok: false, error: error.stack, checks }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const s of states) {
      if (s.browser)
        await stop(s).catch(() => {
          s.child.kill();
        });
    }
  });
