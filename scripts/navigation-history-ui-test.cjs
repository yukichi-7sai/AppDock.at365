const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { prepareTestHost } = require('./copy-host.cjs');
const { barPage } = require('./shell-bars-helper.cjs');
const { overlayPage } = require('./shell-overlay-helper.cjs');
const { waitForHost, settingsPage } = require('./settings-host-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'navigation-history-ui-' + Date.now());
const owner = 'fixture.history';
const route = 'page:' + owner + ':main';
const fixture = path.join(profile, 'extensions', owner);
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: owner,
    name: 'History fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['pages'],
    pages: [
      {
        id: 'main',
        title: 'History page',
        source: 'local',
        ui: 'page.html',
        openCommand: owner + '.open',
        defaultDisplay: 'page',
      },
    ],
    commands: [{ id: owner + '.open', title: 'Open fixture', activateOnExecute: true }],
  }),
);
fs.writeFileSync(path.join(fixture, 'page.html'), '<input aria-label="Retained value">');
fs.writeFileSync(
  path.join(fixture, 'worker.cjs'),
  "exports.activate=async c=>{let calls=0; c.commands.register('fixture.history.open','Open',async()=>{if(++calls>1) throw Error('Unexpected command replay'); await c.pages.open('main')})};",
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
settings.extensions[owner] = { enabled: true, settings: {} };
settings.globalShortcutCommands = [];
settings.keybindings = [
  {
    id: 'history-forward',
    key: 'Ctrl+Alt+Right',
    command: 'appdock.navigation.forward',
    enabled: true,
    when: { scope: 'app', appletIds: [] },
  },
];
settings.gestures.enabled = settings.touchpadGestures.enabled = false;
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
const portable = process.argv[2];
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const checks = [];
const report = (name) => {
  checks.push(name);
  console.log(name);
};
(async () => {
  const executable = portable
    ? prepareTestHost(path.resolve(portable), profile, path.join(root, '.artifacts'))
    : require('electron');
  const launch = (restore = false) =>
    launchTestHost({
      executablePath: executable,
      portable: !!portable,
      args: [
        ...(portable ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
        ...(restore ? ['--restore-view'] : []),
      ],
      env,
    });
  let app = await launch(),
    host;
  async function mainPage() {
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      const page = app
        .context()
        .pages()
        .find((p) => p.url().split('?')[0] === 'appdock://host/index.html');
      if (page) return page;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error('Main page did not connect');
  }
  try {
    host = await mainPage();
    assert(host);
    await waitForHost(host, async () => (await window.dock.snapshot()).startupReady);
    await waitForHost(
      host,
      async (owner) =>
        (await window.dock.snapshot()).extensions.some(
          (e) => e.id === owner && e.state === 'running',
        ),
      owner,
    );
    await settingsPage(host);
    const title = await barPage(host, 'titlebar');
    const back = title.getByRole('button', { name: '戻る', exact: true });
    const forward = title.getByRole('button', { name: '進む', exact: true });
    const category = (id) => host.getByTestId('settings-page:' + id).waitFor();
    const command = (id) => host.evaluate((id) => window.dock.executeCommand(id), id);
    const at = (route) =>
      waitForHost(host, async (r) => (await window.dock.snapshot()).navigation.route === r, route);
    const history = (back, forward) =>
      waitForHost(
        host,
        async (expected) => {
          const state = (await window.dock.snapshot()).navigationHistory;
          return state.back === expected[0] && state.forward === expected[1];
        },
        [back, forward],
      );
    await category('about');
    await back.waitFor();
    assert(await back.isDisabled());
    assert(await forward.isDisabled());
    for (const button of [back, forward]) {
      assert(await button.locator('svg[aria-hidden="true"] path').isVisible());
      assert.equal((await button.innerText()).trim(), '');
    }
    const left = await back.boundingBox(),
      right = await forward.boundingBox(),
      brand = await title.locator('.brand-mark').boundingBox();
    assert(left.x + left.width <= right.x && right.x + right.width <= brand.x);
    report('Named SVG arrow buttons before the brand, both disabled at startup');
    await command('appdock.image-library.open');
    await at('image-library');
    await command('appdock.settings.general.open');
    await category('general');
    await host.getByTestId('settings-nav:notifications').click();
    await category('notifications');
    await back.click();
    await category('general');
    await title.waitForFunction(() =>
      [...document.querySelectorAll('.titlebar-navigation button')].every(
        (button) => !button.disabled,
      ),
    );
    const titleBrand = await title.locator('.title-brand').boundingBox();
    await title.screenshot({
      path: path.join(profile, 'navigation-icons.png'),
      clip: { x: 0, y: 0, width: Math.ceil(titleBrand.x + titleBrand.width + 8), height: 42 },
    });
    await back.click();
    await at('image-library');
    await host.locator('main').click({ position: { x: 4, y: 4 } });
    await host.keyboard.press('Control+Alt+ArrowRight');
    await category('general');
    await forward.click();
    await category('notifications');
    await history(true, false);
    report('Page and category traverse by title bar and assigned shortcut');
    const search = host.locator('.settings-search');
    async function choose(text) {
      await search.fill(text);
      const option = host.getByRole('option').filter({ hasText: text }).first();
      const expected = await option.evaluate(async (element) => {
        const connection = document.querySelector('.settings-surface').dataset.settingsConnection;
        const model = await window.dock.settingsPage.get(connection);
        return model.content.results.find(
          (r) =>
            r.title === element.querySelector('span').textContent &&
            r.pageTitle === element.querySelector('small').textContent,
        ).id;
      });
      await option.click();
      await item(expected);
      return expected;
    }
    const first = await choose('スタートページ');
    const second = await choose('ファイル監視の補助確認');
    assert.notEqual(first, second);
    async function item(id) {
      await settingsPage(host);
      await waitForHost(
        host,
        async (id) => {
          const connection =
            document.querySelector('.settings-surface')?.dataset.settingsConnection;
          if (!connection) return false;
          const model = await window.dock.settingsPage.get(connection);
          return model.content.move?.itemId === id && model.content.move.completed;
        },
        id,
      );
    }
    await back.click();
    await item(first);
    await forward.click();
    await item(second);
    await search.fill('');
    await back.click();
    await item(first);
    await command('appdock.notifications.open');
    await at('notifications');
    await history(true, false);
    await back.click();
    await item(first);
    report('Exact settings items in one category and branch truncation');
    await command('fixture.history.open');
    await at(route);
    const local = app
      .context()
      .pages()
      .find((p) => p.url().includes('/page.html'));
    assert(local);
    await local.getByLabel('Retained value').fill('preserved');
    await command('appdock.notifications.open');
    await at('notifications');
    await back.click();
    await at(route);
    assert.equal(await local.getByLabel('Retained value').inputValue(), 'preserved');
    await forward.click();
    await at('notifications');
    await host.evaluate((owner) => window.dock.toggleExtension(owner, false), owner);
    await waitForHost(
      host,
      async (owner) =>
        (await window.dock.snapshot()).extensions.some((e) => e.id === owner && !e.enabled),
      owner,
    );
    await back.click();
    await item(first);
    report('Applet surface preserved, stopped page skipped without replaying open command');
    await title.locator('.titlebar-search').click();
    const palette = await overlayPage(host);
    await palette.getByRole('combobox').fill('appdock.navigation.forward');
    await palette
      .locator('[data-command-id="appdock.navigation.forward"] .palette-command-text')
      .click();
    await at('notifications');
    report('Palette invokes the same forward history');
    const pages = [
      'general',
      'appearance',
      'notifications',
      'ribbon',
      'tray',
      'shortcuts',
      'gestures',
      'custom-commands',
      'web-accounts',
      'permissions',
      'tts',
      'ai',
    ];
    for (const id of pages) {
      await command(
        id === 'ribbon' ? 'appdock.ribbon.settings.open' : 'appdock.settings.' + id + '.open',
      );
      await category(id);
    }
    for (let i = pages.length - 2; i >= pages.length - 11; i--) {
      await back.click();
      await category(pages[i]);
    }
    await history(false, true);
    assert(await back.isDisabled());
    for (let i = pages.length - 10; i < pages.length; i++) {
      await forward.click();
      await category(pages[i]);
    }
    await history(true, false);
    assert(await forward.isDisabled());
    report('Ten real steps back and forward after twelve category changes');
    await title.screenshot({ path: path.join(profile, 'titlebar.png') });
    await waitForHost(host, () => localStorage.getItem('appdock.restart-view.category') === '"ai"');
    await app.close();
    app = undefined;
    app = await launch(true);
    host = await mainPage();
    await settingsPage(host);
    await category('ai');
    await history(false, false);
    const restoredBar = await barPage(host, 'titlebar');
    assert(await restoredBar.getByRole('button', { name: '戻る', exact: true }).isDisabled());
    assert(await restoredBar.getByRole('button', { name: '進む', exact: true }).isDisabled());
    report('Restored settings category seeds a fresh session with both directions disabled');
  } catch (error) {
    await host?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    await app?.close();
  }
  fs.writeFileSync(
    path.join(profile, 'result.json'),
    JSON.stringify({ ok: true, portable: !!portable, checks }, null, 2),
  );
})().catch((error) => {
  console.error(profile, error);
  process.exitCode = 1;
});
