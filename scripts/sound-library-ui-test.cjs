const { testHostPath } = require('./copy-host.cjs');
const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { wave } = require('./sound-library-fixture.cjs');
const root = path.resolve(__dirname, '..'),
  portable = process.argv[2] ? path.resolve(process.argv[2]) : null;
const profile = path.join(root, '.artifacts', 'sound-library-ui-' + Date.now()),
  directory = path.join(profile, 'data/assets/sounds');
fs.mkdirSync(path.join(directory, '通知'), { recursive: true });
fs.mkdirSync(path.join(directory, '移動先'), { recursive: true });
fs.writeFileSync(path.join(directory, '通知/long.wav'), wave(30000));
fs.writeFileSync(path.join(directory, 'root.wav'), wave(1000));
for (let i = 0; i < 140; i++)
  fs.writeFileSync(
    path.join(directory, '通知/sound-' + String(i).padStart(3, '0') + '.wav'),
    wave(1000),
  );
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.soundEnabled = true;
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
settings.soundLibrary = {
  groups: [
    { id: 'notice', name: '通知: 一般', files: [{ file: '通知/long.wav' }, { file: 'root.wav' }] },
    { id: 'extra', name: '通知: 追加', files: [{ file: 'root.wav' }] },
  ],
};
settings.imageLibrary = { groups: [{ id: 'keep', name: '画像専用', images: [] }] };
settings.extensions['test.sound-library'] = { enabled: true, settings: {} };
const resultFile = path.join(profile, 'picked.json'),
  fixture = path.join(profile, 'extensions/test.sound-library');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.sound-library',
    name: 'Sound selection fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: ['file-dialog', 'audio', 'web-accounts', 'pages'],
    webAccounts: {
      url: 'https://sound.fixture.test/',
      origins: ['https://sound.fixture.test'],
      observeOrigin: 'https://sound.fixture.test',
      ui: 'accounts.html',
      observer: 'observer.js',
    },
    pages: [
      {
        id: 'main',
        title: 'Notification fixture',
        source: 'web-accounts',
        openCommand: 'test.sound-library.accounts',
        defaultDisplay: 'page',
      },
    ],
    commands: [
      { id: 'test.sound-library.pick', title: 'Pick sound' },
      { id: 'test.sound-library.accounts', title: 'Sound accounts', activateOnExecute: true },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.cjs'),
  `exports.activate=async c=>{c.commands.register('test.sound-library.accounts','Sound accounts',()=>c.webAccounts.open());c.commands.register('test.sound-library.pick','Pick sound',()=>{void(async()=>{try{const file=await c.ui.pickFile('wav');require('node:fs').writeFileSync(${JSON.stringify(resultFile)},JSON.stringify({file}));}catch(e){require('node:fs').writeFileSync(${JSON.stringify(resultFile)},JSON.stringify({error:String(e)}));}})();});};`,
);
fs.writeFileSync(
  path.join(fixture, 'accounts.html'),
  '<!doctype html><meta charset="utf-8"><button id="pick">通知音を選ぶ</button><output id="sound"></output><script src="accounts.js"></script>',
);
fs.writeFileSync(
  path.join(fixture, 'accounts.js'),
  `async function refresh(){const s=await window.webAccounts.snapshot();document.querySelector('#sound').textContent=s.accounts[0]?.sound?.name||'';}document.querySelector('#pick').onclick=async()=>{let s=await window.webAccounts.snapshot();if(!s.accounts.length){await window.webAccounts.add();s=await window.webAccounts.snapshot();}await window.webAccounts.pickSound(s.accounts[0].id);await refresh();};window.webAccounts.onChanged(refresh);refresh();`,
);
fs.writeFileSync(path.join(fixture, 'observer.js'), '(()=>null)');
const settingsFile = require('./test-settings.cjs').file(profile, 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify(settings));
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const exe = portable ? testHostPath(profile) : require('electron');
if (portable) {
  require('./copy-host.cjs').copyHost(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
const checks = [],
  errors = [];
let app, host, child;
const until = async (fn, label, timeout = 30000) => {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error(label + (last ? ': ' + last : ''));
};
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!portable) {
    app = await electron.launch({
      executablePath: exe,
      args: [root, '--test-profile=' + profile],
      env,
    });
    for (const stream of [app.process().stdout, app.process().stderr])
      stream?.on('data', (data) => fs.appendFileSync(path.join(profile, 'electron.log'), data));
  } else {
    const port = await freePort(),
      inspector = await freePort();
    child = spawn(
      exe,
      [
        '--test-profile=' + profile,
        '--remote-debugging-port=' + port,
        '--inspect=127.0.0.1:' + inspector,
      ],
      { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
    );
    const browser = await until(
      () => chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }),
      'CDP',
    );
    app = {
      context: () => browser.contexts()[0],
      evaluate: (fn, arg) =>
        inspect(
          inspector,
          `(${fn.toString()})(${electronExpression},${JSON.stringify(arg) ?? 'undefined'})`,
        ),
      close: async () => {
        await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
        await until(() => child.exitCode !== null, 'shutdown');
        await browser.close();
      },
    };
  }
  app.context().on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
  host = await until(
    () =>
      app
        .context()
        .pages()
        .find((p) => p.url().startsWith('appdock://host/index.html')),
    'host',
  );
  host.on('pageerror', (e) => errors.push(String(e)));
  host.setDefaultTimeout(20000);
  await until(
    async () => (await host.evaluate(() => window.dock.snapshot())).startupReady,
    'startup',
  );
  await resize(1360, 950);
}
const model = () => host.evaluate(() => window.dock.pages.get());
const snapshot = () => host.evaluate(() => window.dock.snapshot());
const resize = (width, height) =>
  app.evaluate(
    ({ BrowserWindow }, { width, height }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      w.setMinimumSize(320, 480);
      w.setSize(width, height);
      w.show();
      w.focus();
    },
    { width, height },
  );
const choose = (container, file) =>
  container.getByRole('button', { name: file + 'を選択', exact: true }).click();
const picker = () => host.getByRole('dialog', { name: '音を選択', exact: true });
const result = () =>
  fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : null;
(async () => {
  try {
    await launch();
    await host.evaluate(() => window.dock.executeCommand('appdock.sound-library.open'));
    const page = host.locator('.library-page');
    await page.getByRole('heading', { name: '音ライブラリー', exact: true }).waitFor();
    await until(async () => (await model())?.content.total === 142, 'sound index');
    assert.equal(
      await page.getByRole('button', { name: 'アイコンセットを取り込む', exact: true }).count(),
      0,
    );
    await page.getByRole('button', { name: /^通知\s*2$/ }).click();
    await until(
      async () => (await model()).content.layout.collapsedGroups.includes('通知'),
      'prefix collapse',
    );
    await page.getByRole('button', { name: /^通知\s*2$/ }).click();
    await choose(page, '通知/long.wav');
    await until(async () => (await model()).content.selected === 1, 'selection');
    assert.equal((await model()).content.playback, undefined);
    await page.getByRole('button', { name: '試聴', exact: true }).click();
    await until(
      async () => (await model()).content.playback?.state === 'playing',
      'silent WAV actual playback',
    );
    await page.getByRole('button', { name: '選択を解除', exact: true }).click();
    await until(async () => (await model()).content.selected === 0, 'clear while playing');
    await until(
      () => page.getByRole('button', { name: '試聴', exact: true }).isDisabled(),
      'cleared selection rendered',
    );
    assert(await page.getByRole('button', { name: '停止', exact: true }).isEnabled());
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await until(async () => !(await model()).content.playback, 'preview stop');
    checks.push(
      'sound navigation, prefix collapse, selection without autoplay, explicit playback and stop after clearing selection',
    );
    const card = page.getByRole('button', { name: '通知/long.wavを選択', exact: true });
    await until(
      () => card.locator('img').evaluate((e) => e.complete && e.naturalWidth > 0),
      'sound card icon',
    );
    await card.click({ button: 'right' });
    await host.getByRole('menuitem', { name: 'ファイル名を変更', exact: true }).click();
    const rename = host.getByRole('dialog', { name: 'ファイル名を変更', exact: true });
    await rename.getByRole('textbox').fill('renamed');
    await rename.getByRole('button', { name: '適用', exact: true }).click();
    await rename.waitFor({ state: 'hidden' });
    await until(() => fs.existsSync(path.join(directory, '通知/renamed.wav')), 'rename');
    assert.equal(
      JSON.parse(fs.readFileSync(settingsFile)).soundLibrary.groups[0].files[0].file,
      '通知/renamed.wav',
    );
    await page.getByRole('button', { name: '移動', exact: true }).click();
    const move = host.getByRole('dialog').last();
    await move.getByRole('combobox').selectOption('移動先');
    await move.getByRole('button', { name: '適用', exact: true }).click();
    await move.waitFor({ state: 'hidden' });
    await until(() => fs.existsSync(path.join(directory, '移動先/renamed.wav')), 'move');
    assert.equal(
      JSON.parse(fs.readFileSync(settingsFile)).soundLibrary.groups[0].files[0].file,
      '移動先/renamed.wav',
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile)).imageLibrary, settings.imageLibrary);
    checks.push(
      'context rename and toolbar folder move update audio groups without touching image groups',
    );
    const slider = page.getByRole('slider', { name: 'カードサイズ', exact: true });
    await slider.focus();
    await slider.press('Home');
    await slider.press('Tab');
    await until(async () => (await model()).content.cardWidth === 40, 'smallest card');
    const splitter = page.getByRole('separator');
    await splitter.focus();
    await splitter.press('ArrowRight');
    await until(async () => (await model()).content.layout.sidebarWidth > 220, 'sidebar save');
    const width = (await model()).content.layout.sidebarWidth;
    await until(
      async () => (await model()).content.remaining === 0,
      'automatic loading while shrinking',
    );
    await host.screenshot({ path: path.join(profile, 'library-wide.png') });
    await resize(600, 820);
    await host.screenshot({ path: path.join(profile, 'library-narrow.png') });
    assert(await slider.isVisible());
    await resize(1360, 950);
    checks.push(
      '40px cards, independent sidebar persistence, automatic continuation and narrow layout',
    );
    await until(
      async () =>
        (await snapshot()).extensions.some(
          (e) => e.id === 'test.sound-library' && e.state === 'running',
        ),
      'fixture running',
    );
    await host.evaluate(() => window.dock.executeCommand('test.sound-library.pick'));
    await picker().waitFor();
    await choose(picker(), 'root.wav');
    await picker().getByRole('button', { name: 'キャンセル', exact: true }).click();
    await picker().waitFor({ state: 'hidden' });
    await until(() => result()?.file === null, 'public picker cancellation');
    fs.unlinkSync(resultFile);
    await host.evaluate(() => window.dock.executeCommand('test.sound-library.pick'));
    await picker().waitFor();
    await choose(picker(), 'root.wav');
    await picker().getByRole('button', { name: '音を使う', exact: true }).click();
    await picker().waitFor({ state: 'hidden' });
    const picked = await until(() => result()?.file, 'public picker selection');
    assert(path.isAbsolute(picked));
    assert.ok(picked.includes('assigned-sounds'));
    assert.deepEqual(fs.readFileSync(picked), wave(1000));
    fs.writeFileSync(path.join(directory, 'root.wav'), wave(2000));
    assert.deepEqual(fs.readFileSync(picked), wave(1000));
    checks.push(
      'real Node Applet opens common picker; cancel returns null; apply returns stable absolute retained WAV',
    );
    fs.unlinkSync(resultFile);
    await host.evaluate(() => window.dock.executeCommand('test.sound-library.pick'));
    await picker().waitFor();
    await choose(picker(), '移動先/renamed.wav');
    await picker().getByRole('button', { name: '試聴', exact: true }).click();
    await until(
      async () =>
        (await host.evaluate(() => window.dock.soundLibrary.snapshot())).playback?.state ===
        'playing',
      'picker preview',
    );
    await picker().getByRole('button', { name: 'キャンセル', exact: true }).click();
    await picker().waitFor({ state: 'hidden' });
    await until(
      async () => !(await host.evaluate(() => window.dock.soundLibrary.snapshot())).playback,
      'cancel stops preview',
    );
    fs.unlinkSync(resultFile);
    await host.evaluate(() => window.dock.executeCommand('test.sound-library.pick'));
    await picker().waitFor();
    await host.evaluate(() =>
      window.dock.executeCommand('appdock.applets.test.sound-library.restart'),
    );
    await picker().waitFor({ state: 'hidden' });
    checks.push(
      'picker cancel stops its preview and real Applet restart cancels its pending selection',
    );
    await app.evaluate(({ app }) => {
      app.on('session-created', (session) => {
        session.protocol.handle(
          'https',
          () =>
            new Response('<!doctype html><title>Offline sound fixture</title>', {
              headers: { 'content-type': 'text/html' },
            }),
        );
      });
    });
    await until(
      async () =>
        (await snapshot()).extensions.some(
          (e) => e.id === 'test.sound-library' && e.state === 'running',
        ),
      'restarted fixture',
    );
    await host.evaluate(() => window.dock.executeCommand('test.sound-library.accounts'));
    const accounts = await until(
      () =>
        app
          .context()
          .pages()
          .find((p) => p.url().includes('accounts.html')),
      'Web account UI',
    );
    await accounts.getByRole('button', { name: '通知音を選ぶ' }).click();
    await picker().waitFor();
    await choose(picker(), 'root.wav');
    await picker().getByRole('button', { name: '音を使う', exact: true }).click();
    await picker().waitFor({ state: 'hidden' });
    const sound = await until(async () => {
      const s = await accounts.evaluate(() => window.webAccounts.snapshot());
      return s.accounts[0]?.sound?.file?.startsWith('@library/') ? s.accounts[0].sound : null;
    }, 'Web account saved shared reference');
    assert.equal(sound.name, 'root.wav');
    assert.equal(sound.enabled, false);
    await accounts.getByRole('button', { name: '通知音を選ぶ' }).click();
    await picker().waitFor();
    await resize(600, 820);
    await until(() => picker().locator('.ad-gallery-card').count(), 'sound picker catalogue ready');
    await until(
      () =>
        picker()
          .locator('img')
          .evaluateAll((images) => images.some((image) => image.naturalWidth > 0)),
      'sound picker preview ready',
    );
    await host.screenshot({ path: path.join(profile, 'picker-narrow.png') });
    await picker().getByRole('button', { name: 'キャンセル', exact: true }).click();
    await picker().waitFor({ state: 'hidden' });
    await resize(1360, 950);
    assert.deepEqual(
      (await accounts.evaluate(() => window.webAccounts.snapshot())).accounts[0].sound,
      sound,
    );
    checks.push(
      'Web-account notification selector saves a shared retained reference and friendly name, preserves enable state, and cancel restores the embedded page',
    );
    await app.close();
    app = undefined;
    await launch();
    await host.evaluate(() => window.dock.executeCommand('appdock.sound-library.open'));
    await host.getByRole('heading', { name: '音ライブラリー', exact: true }).waitFor();
    await until(async () => (await model())?.kind === 'sound-library', 'reopened library');
    assert.equal((await model()).content.cardWidth, 40);
    assert.equal((await model()).content.layout.sidebarWidth, width);
    assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile)).imageLibrary, settings.imageLibrary);
    assert.deepEqual(fs.readFileSync(picked), wave(1000));
    assert.deepEqual(errors, []);
    checks.push('restart restores sound-specific display state, groups and retained selection');
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { ok: true, portable, sha256: portable ? hash(exe) : null, checks, errors },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ profile, checks }, null, 2));
  } catch (error) {
    if (host) {
      await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
      await host
        .evaluate(async () => ({
          model: await window.dock.pages.get(),
          text: document.body.innerText,
        }))
        .then((value) =>
          fs.writeFileSync(
            path.join(profile, 'failure-state.json'),
            JSON.stringify(value, null, 2),
          ),
        )
        .catch(() => {});
    }
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, checks, errors, error: String(error.stack || error) }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    await app?.close().catch(() => {});
  }
})();
