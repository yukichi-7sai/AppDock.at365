const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const { barPage } = require('./shell-bars-helper.cjs');
const { ribbonPage, overlayPage, closingAction } = require('./shell-overlay-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `workspace-ui-${Date.now()}`);
const portable = process.argv[2] && path.resolve(process.argv[2]);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, {
  hardwareAcceleration: false,
  closeToTray: false,
  soundEnabled: false,
  shellProvider: 'fixture.legacy',
  shellProviders: {
    ribbon: 'fixture.legacy',
    titlebar: 'missing',
    'notification.banner': 'missing',
  },
});
settings.updates.checkHostOnStartup =
  settings.updates.checkAppletsOnStartup =
  settings.updates.checkHostOnAboutOpen =
    false;
settings.globalShortcutCommands = [];
settings.gestures.enabled = settings.touchpadGestures.enabled = false;
settings.extensions['fixture.legacy'] = { enabled: true, settings: { retained: 'value' } };
const folder = path.join(profile, 'extensions', 'fixture.legacy');
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(
  path.join(folder, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.legacy',
    name: 'Legacy fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['shell', 'storage'],
    shell: { apiVersion: 1, views: { ribbon: 'missing.html' } },
    commands: [
      { id: 'fixture.legacy.normal', title: 'Normal command' },
      {
        id: 'fixture.legacy.retired',
        title: 'Retired command',
        aliases: ['fixture.legacy.alias'],
        shellRequirement: { region: 'ribbon', state: 'ready' },
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(folder, 'worker.cjs'),
  `exports.activate=async c=>{
  c.commands.register('fixture.legacy.normal','Normal',()=>c.storage.set('normal',true));
  c.commands.register('fixture.legacy.retired','Retired',()=>c.storage.set('retired',true));
};`,
);
fs.writeFileSync(
  require('./test-settings.cjs').file(profile, 'settings.json'),
  JSON.stringify(settings),
);
let instance;
const checks = [];
const result = { profile, success: false, checks };
(async () => {
  try {
    instance = await launch(profile, portable);
    const host = instance.main;
    const snapshot = () => host.evaluate(() => window.dock.snapshot());
    const command = (id) => host.evaluate((id) => window.dock.executeCommand(id), id);
    await until(
      async () =>
        (await snapshot()).extensions.find((e) => e.id === 'fixture.legacy')?.state === 'running',
      'ordinary legacy Applet starts',
    );
    await command('fixture.legacy.normal');
    await assert.rejects(command('fixture.legacy.retired'), /Shell/);
    await assert.rejects(command('fixture.legacy.alias'), /Shell/);
    assert.equal(
      fs.existsSync(require('./test-storage.cjs').file(profile, 'fixture.legacy', 'retired')),
      false,
    );
    checks.push(
      'legacy settings allow normal Applet commands; retired commands and aliases are rejected without execution',
    );
    await command('appdock.settings.appearance.open');
    await host.getByTestId('settings-page:appearance').waitFor();
    const title = await barPage(host, 'titlebar');
    const ribbon = await ribbonPage(host);
    assert.equal(await title.evaluate(() => typeof window.appdockBar.getSettings), 'undefined');
    const session = await title.evaluate(() => window.appdockBar.connect());
    await assert.rejects(
      title.evaluate(
        (c) =>
          window.appdockBar.invoke({
            sessionId: 'stale',
            actionId: c.snapshot.actions.close,
            requestId: crypto.randomUUID(),
          }),
        session,
      ),
    );
    await title.getByRole('button', { name: 'コマンドを検索' }).click();
    const palette = await overlayPage(host);
    await closingAction(palette.keyboard.press('Escape'));
    await ribbon.getByRole('button', { name: 'ログ', exact: true }).click();
    await until(async () => (await snapshot()).navigation.route === 'logs', 'ribbon navigation');
    checks.push('private bridges reject stale sessions; title palette and ribbon navigation work');
    for (const theme of ['light', 'dark']) {
      await instance.save({ host: { theme } });
      await title.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      await ribbon.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      await host.screenshot({ path: path.join(profile, theme + '.png') });
    }
    await instance.save({ host: { showStatusBar: false } });
    await instance.close();
    instance = undefined;
    instance = await launch(profile, portable);
    const state = await instance.main.evaluate(() => window.dock.snapshot());
    assert.equal(state.settings.value.host.showStatusBar, false);
    assert.equal(state.settings.value.host.theme, 'dark');
    assert.equal(state.settings.value.extensions['fixture.legacy'].settings.retained, 'value');
    assert.deepEqual(state.settings.value.ribbon, settings.ribbon);
    checks.push(
      'both themes render; restart preserves bar visibility, ribbon configuration and unrelated Applet settings',
    );
    result.version = state.version;
    result.executableSha256 = instance.hash;
    result.payload = await instance.app.evaluate(({ app }) => {
      const fs = process.getBuiltinModule('fs'),
        path = process.getBuiltinModule('path');
      const root = app.getAppPath();
      return {
        workspace: fs.existsSync(path.join(root, 'out/renderer/workspace/index.html')),
      };
    });
    assert.equal(result.payload.workspace, true);
    result.success = true;
  } catch (error) {
    result.error = String(error.stack || error);
    process.exitCode = 1;
  } finally {
    if (instance) await instance.close();
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})();
