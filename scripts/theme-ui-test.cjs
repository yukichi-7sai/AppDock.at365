const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const root = path.resolve(__dirname, '..');
const source = process.argv[2] && path.resolve(process.argv[2]);
const defaults = require('../resources/configs/theme.json');
const profile = fs.mkdtempSync(path.join(root, '.artifacts/theme-ui-'));
const file = path.join(profile, 'configs/theme.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
const edited = structuredClone(defaults);
Object.assign(edited.light, {
  background: '#f4f5f8',
  panel: '#f8f7f2',
  border: '#a1a7b3',
  rail: '#e5e8ef',
});
Object.assign(edited.dark, {
  background: '#12151b',
  panel: '#222631',
  border: '#778092',
  rail: '#171b24',
});
edited.light.muted = 'invalid';
fs.writeFileSync(file, JSON.stringify(edited));
const fixture = path.join(profile, 'extensions/fixture.theme');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.theme',
    name: 'Theme fixture',
    version: '1.0.0',
    minimumHostVersion: '0.139.0',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: ['pages'],
    commands: [{ id: 'fixture.theme.open', title: 'Theme fixture', activateOnExecute: true }],
    pages: [
      {
        id: 'main',
        title: 'Theme fixture',
        source: 'local',
        ui: 'main.html',
        openCommand: 'fixture.theme.open',
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.cjs'),
  "exports.activate=c=>c.commands.register('fixture.theme.open','Theme fixture',()=>c.pages.open('main'));",
);
fs.writeFileSync(
  path.join(fixture, 'main.html'),
  `<!doctype html><meta charset="utf-8"><style>
body { --panel:#ffffff; --text:#000000; background:var(--panel); color:var(--text); }
button { background:var(--raised); color:var(--text); border:1px solid var(--border); }
</style><p>共有テーマの文字と背景</p><button>テーマを確認</button>`,
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, {
  theme: 'light',
  startMinimized: false,
  closeToTray: false,
  soundEnabled: false,
  hardwareAcceleration: false,
});
settings.updates.checkHostOnStartup = false;
settings.updates.checkAppletsOnStartup = false;
settings.gestures.enabled = false;
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.extensions['fixture.theme'] = { enabled: true, settings: {} };
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
const rgb = (hex) =>
  `rgb(${hex
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16))
    .join(', ')})`;
let host;
const checks = [];
async function start() {
  host = await launch(profile, source);
}
async function stop() {
  if (host) {
    await host.close();
    host = undefined;
  }
}
async function assertHost(mode, expected) {
  await host.main.waitForFunction((mode) => document.documentElement.dataset.theme === mode, mode);
  const actual = await host.main.evaluate(() => ({
    background: getComputedStyle(document.documentElement).backgroundColor,
    text: getComputedStyle(document.documentElement).color,
  }));
  assert.equal(actual.background, rgb(expected.background));
  assert.equal(actual.text, rgb(expected.text));
  const rail = await host.page('/default/index.html');
  await rail.waitForFunction((mode) => document.documentElement.dataset.theme === mode, mode);
  assert.equal(
    await rail.locator('.activity-rail').evaluate((el) => getComputedStyle(el).backgroundColor),
    rgb(expected.rail),
  );
  return rail;
}
async function run() {
  try {
    await start();
    for (const mode of ['light', 'dark']) {
      await host.save({ host: { theme: mode } });
      const expected = { ...edited[mode], muted: defaults[mode].muted };
      const rail = await assertHost(mode, expected);
      await host.main.evaluate(() => window.dock.executeCommand('fixture.theme.open'));
      const local = await host.page('/fixture.theme/main.html');
      await local.waitForFunction(() => innerWidth > 0 && innerHeight > 0);
      await local.waitForFunction((mode) => document.documentElement.dataset.theme === mode, mode);
      const actual = await local.locator('button').evaluate((el) => ({
        border: getComputedStyle(el).borderTopColor,
        text: getComputedStyle(el).color,
        body: getComputedStyle(document.body).backgroundColor,
      }));
      assert.deepEqual(actual, {
        border: rgb(expected.border),
        text: rgb(expected.text),
        body: rgb(expected.panel),
      });
      await local.screenshot({ path: path.join(profile, `local-${mode}.png`) });
      await rail.screenshot({ path: path.join(profile, `ribbon-${mode}.png`) });
      await host.main.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
      await host.main.getByRole('button', { name: '表示', exact: true }).click();
      await host.main.getByLabel('テーマ', { exact: true }).waitFor();
      await host.main.screenshot({ path: path.join(profile, `settings-${mode}.png`) });
      checks.push(
        `${mode}: external theme on host, Shell and local Applet; invalid field fallback`,
      );
    }
    await host.save({ host: { theme: 'system' } });
    const dark = await host.app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors);
    await assertHost(dark ? 'dark' : 'light', edited[dark ? 'dark' : 'light']);
    checks.push('system theme resolves the OS mode using the same colors');
    await host.save({ host: { theme: 'light' } });
    edited.light.background = '#e8edf2';
    fs.writeFileSync(file, JSON.stringify(edited));
    await host.main.reload();
    await until(
      async () => (await host.main.evaluate(() => window.dock.snapshot())).startupReady,
      'reload',
    );
    assert.equal(
      await host.main.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
      rgb('#f4f5f8'),
    );
    await stop();
    await start();
    await assertHost('light', edited.light);
    checks.push('editing takes effect on process restart, not document reload');
    await stop();
    fs.writeFileSync(file, '{malformed');
    await start();
    await assertHost('light', defaults.light);
    assert.equal(fs.readFileSync(file, 'utf8'), '{malformed');
    checks.push('malformed theme opens with distributed defaults and keeps original file');
    await stop();
    fs.unlinkSync(file);
    await start();
    await assertHost('light', defaults.light);
    assert.equal(fs.existsSync(file), false);
    checks.push('missing theme opens with distributed defaults without creating a file');
  } finally {
    await stop();
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ source, checks }, null, 2),
    );
  }
  console.log(JSON.stringify({ profile, checks, success: true }, null, 2));
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
