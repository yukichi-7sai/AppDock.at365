const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, '.artifacts');
const profile = fs.mkdtempSync(path.join(artifacts, 'applet-localization-ui-'));
const portable = process.argv[2] && path.resolve(process.argv[2]);
const id = 'fixture.applet-localization';
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, {
  language: 'en',
  theme: 'light',
  hardwareAcceleration: false,
  closeToTray: false,
  soundEnabled: false,
  notifications: false,
});
settings.gestures.enabled = settings.touchpadGestures.enabled = false;
settings.globalShortcutCommands = [];
settings.keybindings = [];
Object.assign(settings.updates, {
  checkHostOnStartup: false,
  checkAppletsOnStartup: false,
  checkHostOnAboutOpen: false,
});
settings.extensions[id] = { enabled: true, settings: { value: '%name% {{count}} $t(name)' } };
settings.extensions[id + '.stopped'] = { enabled: false, settings: {} };
write(require('./test-settings.cjs').file(profile), settings);
write(path.join(profile, 'translations/host_en.json'), { 'language.label': 'Display language' });
write(path.join(profile, 'configs/applets.json'), { applets: [] });
const folder = path.join(profile, 'extensions', id);
const manifest = {
  apiVersion: 1,
  id,
  name: 'Localization fixture',
  displayName: '%name%',
  version: '1.0.0',
  minimumHostVersion: '0.159.0',
  runtime: 'node',
  entry: 'index.cjs',
  localization: { defaultLanguage: 'ja' },
  capabilities: ['pages', 'settings', 'ui'],
  commands: [{ id: id + '.open', title: '%open%', activateOnExecute: true }],
  settings: [{ key: 'value', type: 'string', title: '%label%', default: '%name%' }],
  pages: [
    { id: 'main', title: '%page%', source: 'local', ui: 'page.html', openCommand: id + '.open' },
  ],
};
write(path.join(folder, 'extension.json'), manifest);
const ja = {
  name: '翻訳検証Applet',
  open: '検証ページを開く',
  label: '保存する文字列',
  page: '翻訳の検証',
  title: '同梱の日本語',
  fallback: '基本辞書から補完',
  named: '{{name}} は {{count}} 件',
};
const en = {
  name: 'Localization Applet',
  open: 'Open localization page',
  label: 'Saved text',
  page: 'Localization check',
  title: 'Bundled English',
  named: '{{name}}: {{count}}',
};
write(path.join(folder, 'resources/translations/applet.json'), ja);
write(path.join(folder, 'resources/translations/applet_en.json'), en);
write(path.join(folder, 'resources/translations/applet_fr.json'), {
  name: 'French only in Applet',
});
fs.writeFileSync(
  path.join(folder, 'index.cjs'),
  `exports.activate = async (context) => {
  const refresh = () => context.ui.showPanel({title: context.localization.t('title'), facts: [{label:'language', value:context.localization.language}]});
  context.commands.register('${id}.open', 'runtime literal', () => context.pages.open('main'));
  context.localization.onChanged(refresh); await refresh();
};`,
);
fs.writeFileSync(
  path.join(folder, 'page.html'),
  `<!doctype html><html lang="en"><meta charset="UTF-8"><title>Localization fixture</title>
<style>body{font:16px system-ui;background:var(--bg);color:var(--text);padding:32px}input{font:inherit;padding:10px;background:var(--panel);color:var(--text);border:1px solid var(--border);width:80%}p{line-height:1.6}</style>
<h1 id="title"></h1><p id="fallback"></p><p id="named"></p><label for="draft" id="label"></label><p><input id="draft"></p><p id="language"></p>
<script>window.nonce = Math.random(); async function render() {
 const snapshot = await appdockLocalization.snapshot();
 for (const key of ['title','fallback','label']) document.getElementById(key).textContent = await appdockLocalization.t(key);
 document.getElementById('named').textContent = await appdockLocalization.t('named', {name:'{{count}} $t(name)', count:3});
 document.getElementById('language').textContent = snapshot.language;
} appdockLocalization.onChanged(render); render();</script></html>`,
);
const stoppedFolder = path.join(profile, 'extensions', id + '.stopped');
fs.cpSync(folder, stoppedFolder, { recursive: true });
write(path.join(stoppedFolder, 'extension.json'), {
  ...manifest,
  id: id + '.stopped',
  commands: [],
  pages: [],
});
let instance;
const errors = [];
const result = { profile, portable, checks: [], success: false };
const state = () => instance.main.evaluate(() => window.dock.snapshot());
async function start() {
  instance = await launch(profile, portable);
  await instance.main.evaluate(() => window.dock.executeCommand('appdock.open'));
  for (const page of instance.app.context().pages())
    page.on('pageerror', (error) => errors.push(String(error)));
  instance.app
    .context()
    .on('page', (page) => page.on('pageerror', (error) => errors.push(String(error))));
  await until(
    async () => (await state()).extensions.find((entry) => entry.id === id)?.state === 'running',
    'localized Applet starts',
  );
}
(async () => {
  try {
    await start();
    const initial = (await state()).extensions.find((entry) => entry.id === id);
    assert.equal(initial.displayName, 'Localization Applet');
    assert.equal(initial.settings[0].title, 'Saved text');
    assert.equal(initial.commands[0].title, 'Open localization page');
    assert.equal(initial.panel.title, 'Bundled English');
    assert.equal(
      (await state()).extensions.find((entry) => entry.id === id + '.stopped').displayName,
      'Localization Applet',
    );
    assert.equal(fs.existsSync(path.join(profile, 'translations/applets')), false);
    await instance.main.evaluate((id) => window.dock.openAppletPage(id, 'main'), id);
    const page = await instance.page('/page.html');
    await page.getByRole('heading', { name: 'Bundled English' }).waitFor();
    assert.equal(await page.locator('#fallback').innerText(), '基本辞書から補完');
    assert.equal(await page.locator('#named').innerText(), '{{count}} $t(name): 3');
    const nonce = await page.evaluate(() => window.nonce);
    await page.locator('#draft').fill('draft {{count}} %name%');
    await instance.save({ host: { language: 'ja' } });
    await page.getByRole('heading', { name: '同梱の日本語' }).waitFor();
    await until(
      async () =>
        (await state()).extensions.find((entry) => entry.id === id).panel.title === '同梱の日本語',
      'Node language callback',
    );
    assert.equal(await page.locator('#draft').inputValue(), 'draft {{count}} %name%');
    assert.equal(await page.evaluate(() => window.nonce), nonce);
    await page.screenshot({ path: path.join(profile, 'manual-ja-light.png') });
    await instance.save({ host: { language: 'en', theme: 'dark' } });
    await page.getByRole('heading', { name: 'Bundled English' }).waitFor();
    await instance.resize(900, 680);
    await page.screenshot({ path: path.join(profile, 'manual-en-dark.png') });
    assert.equal(
      (await state()).settings.value.extensions[id].settings.value,
      '%name% {{count}} $t(name)',
    );
    // Valid unknown saved codes remain supported; effective language is owned by the host.
    await instance.save({ host: { language: 'fr' } });
    await page.getByRole('heading', { name: '同梱の日本語' }).waitFor();
    assert.equal((await page.evaluate(() => appdockLocalization.snapshot())).language, 'ja');
    await instance.save({ host: { language: 'en' } });
    await page.getByRole('heading', { name: 'Bundled English' }).waitFor();
    result.checks.push(
      'Manual placement uses the host-selected bundled language without copying dictionaries or adding Applet-only languages',
      'Manifest, stopped Applet and Node panel switch language while IDs, stored values and local page draft/identity remain unchanged',
    );
    await instance.close();
    instance = undefined;
    write(path.join(profile, 'translations/applets', id, 'applet_en.json'), {
      title: 'External English',
    });
    await start();
    assert.equal(
      (await state()).extensions.find((entry) => entry.id === id).panel.title,
      'External English',
    );
    await instance.main.evaluate((id) => window.dock.openAppletPage(id, 'main'), id);
    const externalPage = await instance.page('/page.html');
    await externalPage.getByRole('heading', { name: 'External English' }).waitFor();
    assert.equal(await externalPage.locator('#label').innerText(), 'Saved text');
    assert.equal(await externalPage.locator('#fallback').innerText(), '基本辞書から補完');
    result.checks.push(
      'Real process restart retains selected language and uses external then bundled translations per key',
    );
    assert.deepEqual(errors, []);
    result.success = true;
    result.exeSha256 = instance.hash;
  } catch (error) {
    result.error = String(error.stack || error);
    if (instance) result.state = await state().catch(() => undefined);
    process.exitCode = 1;
    for (const [index, page] of (instance?.app.context().pages() ?? []).entries())
      await page
        .screenshot({ path: path.join(profile, 'failure-' + index + '.png'), timeout: 3000 })
        .catch(() => {});
  } finally {
    if (instance) await instance.close();
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})();
