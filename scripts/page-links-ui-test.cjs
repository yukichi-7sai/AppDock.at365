const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, until, hash } = require('./page-test-host.cjs');
const { waitForHost, settingsPage } = require('./settings-host-helper.cjs');
const { overlayPage } = require('./shell-overlay-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(root, '.artifacts', 'page-links-ui-'));
const upgradeTranslations = process.argv.includes('--upgrade-translations');
if (upgradeTranslations) {
  assert(process.argv[2] && !process.argv[2].startsWith('--'), 'A fixed EXE is required');
  fs.mkdirSync(path.join(profile, 'translations'));
  fs.writeFileSync(
    path.join(profile, 'translations/host.json'),
    JSON.stringify({
      'settings.settingsPageLayout.customCommands':
        'よく使う操作をコマンドとして登録し、実行内容や外部への公開を設定します。',
      'obsolete.fixture': '旧版にしかない項目',
    }),
  );
  fs.writeFileSync(path.join(profile, 'translations/.appdock-version'), '0.131.0');
}
const owner = 'fixture.page-links';
const fixture = path.join(profile, 'extensions', owner);
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: owner,
    name: 'Page links fixture',
    version: '1.0.0',
    minimumHostVersion: '0.131.0',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['commands', 'pages', 'settings'],
    description:
      '混在 [page:text-library] [setting:command-triggers] [command:appdock.text-palette.open]、不明 [page:missing]、文字 \\[page:logs] <b>plain</b>。本文 [page:page:fixture.page-links:main]',
    pages: [
      {
        id: 'main',
        title: 'Fixture page',
        source: 'local',
        ui: 'page.html',
        defaultDisplay: 'page',
        openCommand: owner + '.open',
      },
    ],
    commands: [{ id: owner + '.open', title: 'Open fixture', activateOnExecute: true }],
    settings: [
      {
        key: 'text',
        title: 'テキスト値',
        type: 'string',
        default: 'initial',
        description: '[page:text-library]',
      },
      {
        key: 'json',
        title: 'JSON値',
        type: 'json',
        default: '{}',
        description: '[setting:command-triggers]',
      },
      {
        key: 'rows',
        title: '登録一覧',
        type: 'object-list',
        default: [],
        itemTitle: '登録項目',
        list: { columns: ['name'], titleKey: 'name' },
        fields: [
          {
            key: 'name',
            title: '登録名',
            type: 'string',
            default: '',
            description: '[page:text-library]',
          },
        ],
      },
    ],
    settingSections: [
      {
        id: 'links',
        title: 'リンクの設定',
        description: '[page:text-library]',
        settings: ['text', 'json', 'rows'],
        collapsible: true,
        defaultOpen: true,
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'page.html'),
  '<h1>Fixture page</h1><input aria-label="Retained value">',
);
fs.writeFileSync(
  path.join(fixture, 'worker.cjs'),
  `const fs=require('node:fs'),path=require('node:path');exports.activate=async c=>{c.commands.register('${owner}.open','Open',()=>fs.appendFileSync(path.join(__dirname,'executed.txt'),'run'));};`,
);
const settings = createDefaultSettings();
Object.assign(settings.host, {
  hardwareAcceleration: false,
  closeToTray: false,
  soundEnabled: false,
});
Object.assign(settings.updates, {
  checkHostOnStartup: false,
  checkAppletsOnStartup: false,
  checkHostOnAboutOpen: false,
});
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.gestures.enabled = settings.touchpadGestures.enabled = false;
settings.extensions[owner] = { enabled: true, settings: {} };
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
const checks = [];
const report = (name) => {
  checks.push(name);
  console.log(name);
};
let host, dock;
(async () => {
  try {
    host = await launch(profile, process.argv[2]);
    dock = host.main;
    if (upgradeTranslations) {
      assert.equal(
        hash(path.join(profile, 'translations/host.json')),
        hash(path.join(path.dirname(process.argv[2]), 'resources/translations/host.json')),
        'Existing translations must be replaced by the distributed version',
      );
      assert.equal(
        fs.readFileSync(path.join(profile, 'translations/.appdock-version'), 'utf8'),
        require('../package.json').version,
      );
      report(
        'Existing external translations are fully refreshed before the new host reads descriptions',
      );
    }
    await host.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/index.html'),
      );
      w.show();
      w.focus();
    });
    await settingsPage(dock);
    await waitForHost(
      dock,
      async (id) =>
        (await window.dock.snapshot()).extensions.some((e) => e.id === id && e.state === 'running'),
      owner,
    );
    const category = async (id) => {
      await dock.getByTestId('settings-nav:' + id).click();
      await dock.getByTestId('settings-page:' + id).waitFor();
    };
    const command = (id) => dock.evaluate((id) => window.dock.executeCommand(id), id);
    const at = (route) =>
      waitForHost(
        dock,
        async (route) => (await window.dock.snapshot()).navigation.route === route,
        route,
      );
    const link = (kind, id) => dock.getByTestId(`page-link:${kind}:${id}`);
    const back = async () => {
      await command('appdock.navigation.back');
      await settingsPage(dock);
    };
    await category('text-palette');
    assert.equal(await link('page', 'text-library').count(), 1);
    for (const title of ['定型文パレットを開く', 'クリップボード履歴パレットを開く']) {
      const control = dock.getByRole('button', {
        name: title + 'をコマンドパレットで表示',
        exact: true,
      });
      assert.equal(await control.count(), 1);
      await control.click();
      const palette = await overlayPage(dock);
      const expected = title.startsWith('定型文')
        ? 'appdock.text-palette.open'
        : 'appdock.clipboard-history.open';
      assert.equal(await palette.getByRole('combobox').inputValue(), expected);
      await palette.getByRole('combobox').press('Escape');
      await waitForHost(dock, async () => !(await window.dock.snapshot()).overlay.active);
    }
    await dock.screenshot({ path: path.join(profile, 'palette-wide.png') });
    await link('page', 'text-library').click();
    await at('text-library');
    await back();
    await dock.getByTestId('settings-page:text-palette').waitFor();
    await command('appdock.navigation.forward');
    await at('text-library');
    await back();
    report(
      'Both palette descriptions render targeted command links; page click and back/forward work',
    );
    await category('custom-commands');
    await dock.screenshot({ path: path.join(profile, 'custom-commands-wide.png') });
    await link('setting', 'command-triggers').press('Enter');
    await dock.getByTestId('settings-page:command-triggers').waitFor();
    await back();
    await dock.getByTestId('settings-page:custom-commands').waitFor();
    await link('setting', 'command-triggers').press('Space');
    await dock.getByTestId('settings-page:command-triggers').waitFor();
    report(
      'Custom command overview link supports Enter and Space and records the settings destination',
    );
    await category('applet:' + owner);
    const section = dock
      .locator('details')
      .filter({ has: dock.getByRole('heading', { name: 'リンクの設定', exact: true }) });
    const expand = async () => {
      if (!(await section.evaluate((el) => el.open))) await section.locator('summary').click();
    };
    await expand();
    const description = dock.getByTestId('applet-description');
    assert.match(await description.innerText(), /不明なページ（missing）/);
    assert.match(await description.innerText(), /\[page:logs\]/);
    assert.equal(await description.locator('b').count(), 0);
    await dock.getByLabel('テキスト値', { exact: true }).fill('[page:logs] saved literally');
    await link('page', 'text-library').first().click();
    await at('text-library');
    assert.equal(
      (await dock.evaluate(() => window.dock.snapshot())).settings.value.extensions[owner].settings
        .text,
      '[page:logs] saved literally',
    );
    await back();
    await dock.getByTestId('settings-page:applet:' + owner).waitFor();
    await expand();
    await section.evaluate((el) => {
      window.pageLinkToggleCount = 0;
      el.addEventListener('toggle', () => {
        if (!el.open) window.pageLinkToggleCount++;
      });
    });
    await section.locator('summary').getByTestId('page-link:page:text-library').click();
    await at('text-library');
    assert.equal(await dock.evaluate(() => window.pageLinkToggleCount), 0);
    await back();
    await expand();
    report(
      'Mixed Applet metadata, escaping, plain user input, saved blur and non-toggling section links',
    );
    await dock.getByLabel('JSON値', { exact: true }).fill('{');
    await link('setting', 'command-triggers').first().click();
    await dock
      .getByRole('alert')
      .filter({ hasText: /JSON|入力|反映/ })
      .first()
      .waitFor();
    assert(await dock.getByTestId('settings-page:applet:' + owner).isVisible());
    assert.equal(await dock.getByLabel('JSON値', { exact: true }).inputValue(), '{');
    await dock.getByLabel('JSON値', { exact: true }).press('Escape');
    await dock.getByLabel('JSON値', { exact: true }).fill('{}');
    await dock.getByLabel('JSON値', { exact: true }).press('Tab');
    report('Invalid input stays on its page and keeps the entered value');
    await dock.getByRole('button', { name: '登録項目を追加', exact: true }).click();
    const dialog = dock.getByRole('dialog');
    await dialog.getByLabel('登録名', { exact: true }).fill('dialog draft');
    await dialog.getByTestId('page-link:page:text-library').click();
    await dialog
      .getByRole('alert')
      .filter({ hasText: /ダイアログ/ })
      .first()
      .waitFor();
    assert.equal(await dialog.getByLabel('登録名', { exact: true }).inputValue(), 'dialog draft');
    assert.equal((await dock.evaluate(() => window.dock.snapshot())).navigation.route, 'settings');
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    report(
      'Page links in edit dialogs preserve their uncommitted draft and explain how to navigate',
    );
    const old = await dock.evaluate(() => {
      const id = document.querySelector('[data-settings-connection]').dataset.settingsConnection;
      return window.dock.settingsPage.get(id).then((model) => ({
        id,
        request: {
          sessionId: model.content.editing.sessionId,
          pageId: model.content.page.id,
          actionId: model.content.actions.openPageLink,
          target: { kind: 'page', id: 'text-library' },
        },
      }));
    });
    const denied = await dock.evaluate(async (old) => {
      for (const target of [
        { kind: 'page', id: 'logs' },
        { kind: 'page', id: 'missing' },
        { kind: 'page', id: 'https://example.com' },
      ]) {
        try {
          await window.dock.settingsPage.navigate(old.id, { ...old.request, target });
          return false;
        } catch {}
      }
      return true;
    }, old);
    assert(denied);
    await link('page', 'page:' + owner + ':main').click();
    await at('page:' + owner + ':main');
    assert.equal(fs.existsSync(path.join(fixture, 'executed.txt')), false);
    assert(
      await dock.evaluate(async (old) => {
        try {
          await window.dock.settingsPage.navigate(old.id, old.request);
          return false;
        } catch {
          return true;
        }
      }, old),
    );
    await back();
    report(
      'Unadvertised, missing and stale targets rejected; existing Applet page opens without executing its command',
    );
    await host.save({ extensionId: owner, pages: { main: { display: 'window' } } });
    await until(
      async () => (await link('page', 'page:' + owner + ':main').count()) === 0,
      'separate-window page becomes unavailable',
    );
    assert.match(await description.innerText(), /現在は本体内で表示できません/);
    await dock.evaluate(async (id) => {
      const snapshot = await window.dock.snapshot();
      const value = structuredClone(snapshot.settings.value);
      value.extensions[id].enabled = false;
      await window.dock.saveSettings(value, snapshot.settings.revision);
    }, owner);
    await waitForHost(
      dock,
      async (id) =>
        (await window.dock.snapshot()).extensions.some((e) => e.id === id && e.state === 'stopped'),
      owner,
    );
    assert.equal(await link('page', 'page:' + owner + ':main').count(), 0);
    await link('page', 'text-library').first().click();
    await at('text-library');
    await back();
    assert.equal(
      (await dock.evaluate(() => window.dock.snapshot())).extensions.find((e) => e.id === owner)
        .state,
      'stopped',
    );
    report(
      'Unavailable Applet pages are non-interactive; navigation never starts a stopped Applet',
    );
    await category('text-palette');
    // Simulate a small work area independently of the desktop monitor's minimum size.
    await host.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
        .setMinimumSize(400, 400),
    );
    await host.resize(620, 780);
    await until(() => dock.evaluate(() => window.innerWidth <= 620), 'narrow viewport applied');
    await dock.screenshot({ path: path.join(profile, 'palette-narrow.png') });
    const historyLink = dock.getByRole('button', {
      name: 'クリップボード履歴パレットを開くをコマンドパレットで表示',
      exact: true,
    });
    await historyLink.scrollIntoViewIfNeeded();
    const historyBounds = await historyLink.boundingBox();
    assert(
      historyBounds &&
        historyBounds.x >= 0 &&
        historyBounds.x + historyBounds.width <= (await dock.evaluate(() => window.innerWidth)),
    );
    await dock.screenshot({ path: path.join(profile, 'palette-history-narrow.png') });
    await link('page', 'text-library').press('Enter');
    await at('text-library');
    await back();
    await category('custom-commands');
    await dock.screenshot({ path: path.join(profile, 'custom-commands-narrow.png') });
    await host.save({ host: { theme: 'dark' } });
    await waitForHost(dock, async () => (await window.dock.snapshot()).dark);
    await dock.screenshot({ path: path.join(profile, 'custom-commands-dark-narrow.png') });
    await link('setting', 'command-triggers').click();
    await dock.getByTestId('settings-page:command-triggers').waitFor();
    report('Narrow layout preserves readable, operable description links');
    fs.writeFileSync(
      path.join(profile, 'checks.json'),
      JSON.stringify({ success: true, checks, hostHash: host.hash }, null, 2),
    );
    console.log(JSON.stringify({ profile, checks: checks.length }));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack);
    await dock?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    if (host) {
      await dock.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
      await host.close();
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
