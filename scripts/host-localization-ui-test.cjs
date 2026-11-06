const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const { barPage } = require('./shell-bars-helper.cjs');
const { ribbonPage, overlayPage, closingAction } = require('./shell-overlay-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(root, '.artifacts/host-localization-ui-'));
const portable = process.argv[2] && path.resolve(process.argv[2]);
const name = '日本語 {{name}} $t(language.ja)';
const imageName = name + '.png';
const pack = {
  'settings.mcpCommands.title': 'MCP tool commands',
  'commands.basic.open': 'Open AppDock',
  'commands.updates.installHost': 'Update AppDock',
  'commands.palette.search': 'Search commands',
  'workspace.ribbon': 'Ribbon',
  'workspace.bars.minimize': 'Minimize',
  'workspace.bars.runningApplets': '{{count}} Applets running',
  'workspace.notifications.info': 'Information',
  'workspace.notifications.more': 'Show {{count}} more',
  'workspace.notifications.collapse': 'Collapse',
  'logs.title': 'Logs',
  'logs.search': 'Search logs',
  'logs.normal': 'Normal',
  'logs.count': '{{count}} entries',
  'gallery.select': 'Select {{title}}',
  'gallery.size': 'Image size',
  'gallery.small': 'Small',
  'gallery.large': 'Large',
  'gallery.sizeDefault': '{{value}} default',
  'gallery.sizeSmaller': '{{value}} smaller',
  'gallery.sizeLarger': '{{value}} larger',
  'gallery.readFailed': 'Cannot load image',
  'libraryDialog.groupName': 'Group name',
  'images.groupName': 'Image group name',
  'common.add': 'Add',
};
fs.mkdirSync(path.join(profile, 'translations'));
fs.writeFileSync(path.join(profile, 'translations/host_en.json'), JSON.stringify(pack));
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, {
  closeToTray: false,
  hardwareAcceleration: false,
  soundEnabled: false,
  notifications: true,
});
settings.globalShortcutCommands = [];
settings.gestures.enabled = settings.touchpadGestures.enabled = false;
settings.updates.checkHostOnStartup =
  settings.updates.checkAppletsOnStartup =
  settings.updates.checkHostOnAboutOpen =
    false;
settings.imageLibrary = { groups: [{ id: 'sample', name, images: [{ file: imageName }] }] };
settings.extensions['fixture.localization'] = { enabled: true, settings: {} };
settings.notificationPreferences = {
  overrides: [
    {
      ownerKind: 'applet',
      ownerId: 'fixture.localization',
      typeId: 'message',
      targets: ['banner'],
      durationSeconds: null,
    },
  ],
};
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
const images = path.join(profile, 'data/assets/images');
fs.mkdirSync(images, { recursive: true });
fs.copyFileSync(path.join(root, 'assets/icon.png'), path.join(images, imageName));
const extension = path.join(profile, 'extensions/fixture.localization');
fs.mkdirSync(extension, { recursive: true });
fs.writeFileSync(
  path.join(extension, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.localization',
    name,
    version: '1.0.0',
    minimumHostVersion: '0.30.0',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: ['notifications'],
    commands: [{ id: 'fixture.localization.publish', title: 'Publish fixture' }],
    notificationTypes: [
      {
        typeId: 'message',
        title: name,
        description: 'Local fixture',
        levels: ['info'],
        defaultLevel: 'info',
        defaultEnabled: true,
        canDisable: true,
        disabledControlReason: '',
        allowedTargets: ['banner'],
        defaultTargets: ['banner'],
        requiredTargets: [],
        lifetimePolicy: 'userDuration',
        defaultDurationSeconds: 60,
        history: 'persistent',
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(extension, 'index.cjs'),
  `exports.activate=async c=>{c.commands.register('fixture.localization.publish','Publish fixture',async()=>{for(let i=0;i<4;i++)await c.notifications.publish({typeId:'message',title:${JSON.stringify(name)}+' '+i,body:${JSON.stringify(name)},historyText:{title:'Local fixture',body:'Local fixture'},dedupeKey:'item-'+i});});};`,
);
let instance;
const checks = [],
  errors = [];
const result = { profile, portable, success: false, checks, errors };
async function start() {
  instance = await launch(profile, portable);
  // Fixed-EXE launch hides the window; banners receive bounds only while it is shown.
  await instance.main.evaluate(() => window.dock.executeCommand('appdock.open'));
  for (const page of instance.app.context().pages())
    page.on('pageerror', (e) => errors.push(String(e)));
  instance.app.context().on('page', (page) => page.on('pageerror', (e) => errors.push(String(e))));
  await until(
    async () =>
      (await instance.main.evaluate(() => window.dock.snapshot())).extensions.find(
        (e) => e.id === 'fixture.localization',
      )?.state === 'running',
    'fixture starts',
  );
}
(async () => {
  try {
    await start();
    const host = instance.main;
    const command = (id) => host.evaluate((id) => window.dock.executeCommand(id), id);
    const language = (value) => instance.save({ host: { language: value } });
    const title = await barPage(host, 'titlebar'),
      status = await barPage(host, 'statusbar'),
      ribbon = await ribbonPage(host);
    await title.getByRole('button', { name: 'コマンドを検索' }).waitFor();
    await command('fixture.localization.publish');
    const banner = await until(
      () =>
        host
          .context()
          .pages()
          .find((p) => p.url().endsWith('/workspace/notifications.html')),
      'banner',
    );
    await banner.getByRole('button', { name: 'ほか1件を表示', exact: true }).waitFor();
    await language('en');
    await title.getByRole('button', { name: 'Search commands' }).waitFor();
    await title.getByRole('button', { name: 'Minimize', exact: true }).waitFor();
    await until(
      async () => /Applets running/.test(await status.locator('.statusbar-activity').innerText()),
      'status language',
    );
    assert.equal(await ribbon.locator('aside').getAttribute('aria-label'), 'Ribbon');
    result.bannerLayout = await banner.evaluate(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
      return {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        lane: rect('.notification-lane'),
        more: rect('.notification-more'),
      };
    });
    await banner.getByRole('button', { name: 'Show 1 more', exact: true }).click();
    assert.equal(await banner.locator('.notification-card').count(), 4);
    assert.equal(await banner.locator('.notification-copy p').first().innerText(), name);
    await banner.getByRole('button', { name: 'Collapse', exact: true }).waitFor();
    checks.push(
      'Live title/status/ribbon/banner translation keeps external notification text and expansion',
    );
    await title.getByRole('button', { name: 'Search commands' }).click();
    const palette = await overlayPage(host);
    assert.match(await palette.locator('body').innerText(), /Open AppDock/);
    await closingAction(palette.keyboard.press('Escape'));
    await command('appdock.settings.custom-commands.open');
    await host.getByTestId('settings-page:custom-commands').waitFor();
    const types = await host.evaluate(async () => {
      const element = document.querySelector('.settings-surface[data-settings-connection]');
      return (await window.dock.settingsPage.get(element.dataset.settingsConnection)).content
        .auxiliary.customCommands.types;
    });
    assert(!types.some((t) => t.id === 'appdock.mcp.call'));
    await command('appdock.settings.mcp-client.open');
    await host.getByRole('tab', { name: 'MCP tool commands', exact: true }).waitFor();
    checks.push(
      'Command palette and MCP command settings refresh after language changes; removed custom type stays absent',
    );
    await command('appdock.logs.open');
    await host.getByRole('heading', { name: 'Logs', exact: true }).waitFor();
    await host.getByRole('searchbox', { name: 'Search logs', exact: true }).fill(name);
    await until(
      async () =>
        (await host.evaluate(() => window.dock.pages.get())).content.filters.text === name,
      'log filter saved',
    );
    await language('ja');
    await host.getByRole('heading', { name: 'ログ', exact: true }).waitFor();
    assert.equal(
      await host.getByRole('searchbox', { name: 'ログを検索', exact: true }).inputValue(),
      name,
    );
    await banner.getByRole('button', { name: '折りたたむ', exact: true }).waitFor();
    checks.push('Log filter text and banner expansion survive returning to Japanese');
    await command('appdock.image-library.open');
    const card = host
      .locator('.ad-gallery-card')
      .filter({ has: host.getByRole('heading', { name: imageName, exact: true }) });
    await card.waitFor();
    await card.locator('.ad-gallery-image').click();
    await until(
      async () => (await host.evaluate(() => window.dock.pages.get())).content.selected === 1,
      'image selected',
    );
    await card.evaluate((element) => {
      window.localizationCard = element;
    });
    await language('en');
    await card.getByRole('button', { name: 'Select ' + imageName, exact: true }).waitFor();
    assert.equal(await card.evaluate((element) => window.localizationCard === element), true);
    assert.equal((await host.evaluate(() => window.dock.pages.get())).content.selected, 1);
    await host.getByRole('slider', { name: 'Image size', exact: true }).waitFor();
    assert.match(
      await host
        .getByRole('slider', { name: 'Image size', exact: true })
        .getAttribute('aria-valuetext'),
      /default|smaller|larger/,
    );
    const slider = host.getByRole('slider');
    await slider.focus();
    await host.keyboard.down('ArrowRight');
    const activeWidth = await slider.inputValue();
    await language('ja');
    assert.equal(await slider.inputValue(), activeWidth);
    assert.equal(await slider.getAttribute('aria-label'), '画像サイズ');
    assert.match(await slider.getAttribute('aria-valuetext'), /標準|小|大/);
    await language('en');
    assert.equal(await slider.inputValue(), activeWidth);
    assert.match(await slider.getAttribute('aria-valuetext'), /default|smaller|larger/);
    await host.keyboard.up('ArrowRight');
    await host.getByRole('button', { name: 'グループを追加', exact: true }).click();
    const dialog = host.getByRole('dialog', { name: '画像グループを追加', exact: true });
    await dialog.getByRole('textbox', { name: 'Image group name', exact: true }).fill(name);
    await language('ja');
    assert.equal(
      await dialog.getByRole('textbox', { name: '画像グループ名', exact: true }).inputValue(),
      name,
    );
    await dialog.getByRole('button', { name: '追加', exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal((await host.evaluate(() => window.dock.imageLibrary.snapshot())).groups.length, 1);
    checks.push(
      'Gallery selection/DOM and open group draft survive live switching; cancellation preserves saved groups',
    );
    await language('en');
    await instance.save({ host: { theme: 'dark' } });
    await instance.resize(900, 720);
    await host.screenshot({ path: path.join(profile, 'gallery-dark-en.png') });
    await title.screenshot({ path: path.join(profile, 'title-en.png') });
    await banner.screenshot({ path: path.join(profile, 'banner-en.png') });
    await instance.close();
    instance = undefined;
    await start();
    const restartedTitle = await barPage(instance.main, 'titlebar');
    await restartedTitle.getByRole('button', { name: 'Search commands' }).waitFor();
    assert.equal(
      (await instance.main.evaluate(() => window.dock.snapshot())).settings.value.host.language,
      'en',
    );
    await instance.save({ host: { language: 'ja', theme: 'light' } });
    await restartedTitle.getByRole('button', { name: 'コマンドを検索' }).waitFor();
    checks.push('Selected partial pack survives real process restart and returns to Japanese');
    assert.deepEqual(errors, []);
    result.success = true;
  } catch (error) {
    result.error = String(error.stack || error);
    process.exitCode = 1;
    for (const [index, page] of (instance?.app.context().pages() ?? []).entries())
      await page
        .screenshot({ path: path.join(profile, `failure-surface-${index}.png`), timeout: 3000 })
        .catch(() => {});
    await instance?.main.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    if (instance) await instance.close();
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})();
