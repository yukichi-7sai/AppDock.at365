const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { waitForHost } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'settings-scroll-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const initial = require('../out/main/shared/settings-schema.js').createDefaultSettings();
initial.updates.checkHostOnAboutOpen = false;
initial.host.hardwareAcceleration = false;
initial.keybindings = [];
initial.gestures.enabled = false;
initial.keybindingOptions.excludedProcesses = Array.from({ length: 300 }, (_, i) => 'fixture-' + i);
initial.customCommands = {
  version: 2,
  items: Array.from({ length: 300 }, (_, i) => ({
    id: randomUUID(),
    title: 'Capacity command ' + i,
    description: '',
    typeId: 'appdock.commands.stack',
    owner: { kind: 'host' },
    configVersion: 1,
    config: { executionMode: 'all', entries: [] },
    enabled: false,
    automation: false,
  })),
};
const fixture = path.join(profile, 'extensions', 'fixture.layout');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.layout',
    name: 'Layout fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.cjs',
    settings: [{ key: 'note', title: 'Layout note', type: 'string', default: '' }],
  }),
);
fs.writeFileSync(path.join(fixture, 'index.cjs'), 'exports.activate = async () => {};');
initial.extensions['fixture.layout'] = { enabled: false, settings: { note: 'layout' } };
require('../out/main/shared/settings-schema.js').parseSettings(initial);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
const source = process.argv[2];
const executablePath = source ? path.join(profile, 'AppDock.at365.exe') : require('electron');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (source) {
  require('./copy-host.cjs').copyHost(path.resolve(source), executablePath);
  assert.equal(hash(executablePath), hash(source));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const checks = [],
  errors = [];
let app, host;
const frame = () =>
  host.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
(async () => {
  try {
    app = await launchTestHost({
      executablePath,
      portable: true,
      args: [
        ...(source ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
      ],
      env,
    });
    await waitForHost(
      {
        evaluate: async (fn) => {
          host = app
            .context()
            .pages()
            .find((page) => page.url().startsWith('appdock://host/'));
          return host ? host.evaluate(fn) : false;
        },
      },
      async () => (await window.dock?.snapshot())?.startupReady,
      undefined,
      60000,
    );
    host.on('pageerror', (error) => errors.push(error.message));
    host.setDefaultTimeout(15000);
    const open = async (id) => {
      await host.evaluate(
        (id) => window.dock.executeCommand('appdock.settings.' + id + '.open'),
        id,
      );
      await host.getByTestId('settings-page:' + id).waitFor();
    };
    const body = host.locator('.settings-body');
    const toolbar = host.getByTestId('settings-page-tools');
    for (const theme of ['dark', 'light']) {
      await host.evaluate(async (theme) => {
        const snapshot = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...snapshot.settings.value, host: { ...snapshot.settings.value.host, theme } },
          snapshot.settings.revision,
        );
      }, theme);
      for (const width of [1280, 900, 760]) {
        await app.evaluate(({ BrowserWindow }, width) => {
          const window = BrowserWindow.getAllWindows().find((window) =>
            window.webContents.getURL().startsWith('appdock://host/'),
          );
          window.unmaximize();
          window.setMinimumSize(600, 320);
          window.setSize(width, 650);
        }, width);
        await waitForHost(
          host,
          (width) => window.innerWidth <= width + 2 && window.innerWidth >= width - 30,
          width,
        );
        await open('general');
        await frame();
        assert.equal(await body.evaluate((e) => getComputedStyle(e).paddingRight), '8px');
        assert.equal(await toolbar.locator('.settings-status-area').count(), 0);
        assert.equal(
          await toolbar.locator('.settings-storage-status, .settings-file-button').count(),
          0,
        );
        await body.evaluate((e) => {
          e.scrollTop = e.scrollHeight;
        });
        await frame();
        const position = await toolbar.boundingBox(),
          viewport = await body.boundingBox();
        assert(Math.abs(position.y - viewport.y) <= 1, 'toolbar sticks to the body top');
        assert(await body.evaluate((e) => e.scrollTop > 0));
        assert(await body.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
        await open('shortcuts');
        await host.getByRole('button', { name: 'JSON', exact: true }).click();
        const input = host.locator('.settings-panel-json > textarea');
        await input.waitFor();
        await frame();
        assert.equal(await toolbar.locator('.settings-file-button').count(), 1);
        assert.equal(
          await toolbar
            .locator(
              '.settings-page-view-tools > .settings-file-button, .settings-page-view-tools > .settings-file-menu',
            )
            .count(),
          1,
        );
        assert(
          await input.evaluate((e) => e.scrollHeight > e.clientHeight),
          'long JSON scrolls inside the editor',
        );
        assert(
          await body.evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
          'JSON has no outer vertical overflow',
        );
        assert.equal(
          await host
            .locator('.settings-panel-json')
            .evaluate((e) => getComputedStyle(e).paddingTop),
          '0px',
        );
        const savedText = await input.inputValue();
        await input.fill('{');
        await input.press('Enter');
        await toolbar.locator('.settings-status-area').waitFor();
        assert.equal(await input.inputValue(), '{');
        assert(
          await body.evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
          'error reduces editor height without a second scrollbar',
        );
        await input.fill(savedText);
        await input.press('Enter');
        await toolbar.locator('.settings-status-area').waitFor({ state: 'detached' });
        await settleSettings(host);
        await host.getByRole('button', { name: 'フォーム', exact: true }).click();
        await input.waitFor({ state: 'detached' });
        assert.equal(await toolbar.locator('.settings-file-button').count(), 0);
        checks.push(
          theme +
            '/' +
            width +
            ': padding, sticky toolbar, JSON-only scrolling, error appearance/recovery and file action',
        );
      }
    }
    await open('command-triggers');
    await body.evaluate((e) => {
      e.scrollTop = 500;
    });
    await frame();
    assert(
      await host.locator('.command-list-toolbar').evaluate((filter) => {
        const bounds = filter.getBoundingClientRect();
        const tools = document.querySelector('.settings-page-tools').getBoundingClientRect();
        const x = bounds.left + 12,
          y = Math.max(bounds.top, tools.top) + 10;
        return (
          y < Math.min(bounds.bottom, tools.bottom) &&
          !!document.elementFromPoint(x, y)?.closest('.command-list-toolbar')
        );
      }),
      'the sticky filter is in front of the settings toolbar',
    );
    const toolsLeft = (await toolbar.boundingBox()).x;
    await body.evaluate((e) => {
      e.scrollLeft = e.scrollWidth;
    });
    await frame();
    assert(
      Math.abs((await toolbar.boundingBox()).x - toolsLeft) < 1,
      'toolbar stays horizontally visible',
    );
    await body.evaluate((e) => {
      e.scrollTop = 0;
      e.scrollLeft = 0;
    });
    checks.push(
      'filters overlap in front of the sticky toolbar; horizontal table scrolling retains toolbar visibility',
    );
    const tabs = host.getByTestId('command-trigger-tabs');
    assert.equal(await toolbar.locator('[data-testid="command-trigger-tabs"]').count(), 1);
    assert.equal(await tabs.getByRole('button').count(), 5);
    assert.equal(await tabs.getByRole('button', { name: 'フォーム', exact: true }).count(), 0);
    await host.getByTestId('command-trigger-tab:gestures').click();
    await host.getByTestId('trigger-stack-table').waitFor();
    await tabs.getByRole('button', { name: 'JSON', exact: true }).click();
    assert.equal(await tabs.getByRole('button').count(), 5);
    await host.getByTestId('command-trigger-tab:gestures').click();
    await host.getByTestId('trigger-stack-table').waitFor();
    assert.equal(
      await host.getByTestId('command-trigger-tab:gestures').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await host.getByTestId('trigger-stack-table').count(), 1);
    checks.push('integrated trigger tabs remain available in JSON and return to the selected list');
    await host.screenshot({ path: path.join(profile, 'trigger-toolbar.png') });
    await open('custom-commands');
    assert.equal(await host.locator('.custom-commands-settings tbody tr').count(), 300);
    const addCustom = host
      .locator('.custom-commands-settings')
      .getByRole('button', { name: /追加/ })
      .first();
    assert.equal(await addCustom.isEnabled(), true);
    assert(!/300\s*\/\s*256/.test(await host.locator('.custom-commands-settings').innerText()));
    checks.push(
      '300 custom commands remain visible and the add action stays enabled beyond the former limit',
    );
    await host
      .locator('.settings-categories')
      .getByRole('button', { name: 'Layout fixture', exact: true })
      .click();
    await host.getByLabel('Layout note', { exact: true }).waitFor();
    assert.equal(await body.evaluate((e) => getComputedStyle(e).paddingRight), '8px');
    assert.equal(await toolbar.locator('.settings-status-area, .settings-file-button').count(), 0);
    await host.getByRole('button', { name: 'JSON', exact: true }).click();
    await host.locator('.settings-panel-json > textarea').waitFor();
    assert.equal(await toolbar.locator('.settings-file-button').count(), 1);
    assert(await body.evaluate((e) => e.scrollHeight <= e.clientHeight + 1));
    await host.screenshot({ path: path.join(profile, 'applet-json.png') });
    checks.push(
      'disabled Applet settings share the toolbar, padding and single JSON scroll layout',
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          success: true,
          checks,
          source: source ? path.resolve(source) : 'development',
          sha256: source ? hash(executablePath) : null,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ success: true, checks: checks.length, profile }));
  } catch (error) {
    if (app)
      console.error(
        'Startup phases:',
        JSON.stringify(
          await app
            .evaluate(({ app }) =>
              process
                .getBuiltinModule('module')
                .createRequire(app.getAppPath() + '/package.json')(
                  './out/main/main/core/host-startup-timing',
                )
                .hostStartupTiming.snapshot(),
            )
            .catch(String),
        ),
      );
    console.error(
      'Open pages:',
      app
        ?.context()
        .pages()
        .map((page) => page.url()),
    );
    if (app)
      console.error(
        'Host windows:',
        await app
          .evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().map((window) => ({
              url: window.webContents.getURL(),
              visible: window.isVisible(),
            })),
          )
          .catch(String),
      );
    if (host) await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
})();
