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
initial.keybindings = Array.from({ length: 60 }, (_, index) => ({
  id: 'scroll-key-' + index,
  command: 'appdock.open',
  key:
    ['Ctrl+Alt+', 'Ctrl+Shift+', 'Alt+Shift+'][Math.floor(index / 26)] +
    String.fromCharCode(65 + (index % 26)),
  enabled: false,
  when: { scope: 'app', appletIds: [] },
}));
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
        (id) =>
          window.dock.executeCommand(
            id === 'about' ? 'appdock.updates.open' : 'appdock.settings.' + id + '.open',
          ),
        id,
      );
      await host.getByTestId('settings-page:' + id).waitFor();
    };
    const body = host.locator('.settings-body');
    const toolbar = host.getByTestId('settings-page-tools');
    const coveredTop = async (selector) => {
      await frame();
      const covered = await host.locator(selector).evaluate((element) => {
        const body = element.closest('.settings-body');
        const viewport = body.getBoundingClientRect();
        return [
          viewport.left + 1,
          viewport.left + body.clientWidth / 2,
          viewport.left + body.clientWidth - 1,
        ].every((x) => element.contains(document.elementFromPoint(x, viewport.top + 1)));
      });
      assert(covered, 'the sticky panel covers the viewport top without exposing table text');
    };
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
        const leftEdge = await body.boundingBox();
        await host.mouse.move(leftEdge.x + 2, leftEdge.y + leftEdge.height / 2);
        await host.mouse.wheel(0, 400);
        await waitForHost(host, () => document.querySelector('.settings-body').scrollTop > 0);
        await body.evaluate((e) => {
          e.scrollTop = 0;
        });
        const clientWidth = await body.evaluate((e) => e.clientWidth);
        await host.mouse.move(leftEdge.x + clientWidth - 2, leftEdge.y + leftEdge.height / 2);
        await host.mouse.wheel(0, 400);
        await waitForHost(host, () => document.querySelector('.settings-body').scrollTop > 0);
        await body.evaluate((e) => {
          e.scrollTop = 0;
        });
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
        assert(
          position.y >= viewport.y && position.y + position.height <= viewport.y + viewport.height,
          'sticky toolbar remains reachable inside the padded scroll viewport',
        );
        assert(await body.evaluate((e) => e.scrollTop > 0));
        await coveredTop('.settings-page-tools');
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
    await coveredTop('.command-list-toolbar');
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
    await host.getByTestId('command-trigger-tab:shortcuts').click();
    await host.getByTestId('trigger-stack-table').waitFor();
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await coveredTop('.command-list-toolbar');
    checks.push('settings toolbar and both command/trigger list filters cover the scrollport top');
    checks.push('integrated trigger tabs remain available in JSON and return to the selected list');
    await host.screenshot({ path: path.join(profile, 'trigger-toolbar.png') });
    await open('custom-commands');
    assert.equal(await host.locator('.custom-commands-settings tbody tr').count(), 300);
    const addCustom = host
      .locator('.custom-commands-settings')
      .getByRole('button', { name: /追加/ })
      .first();
    assert.equal(await addCustom.isEnabled(), true);
    await addCustom.focus();
    await addCustom.press('Shift+Tab');
    await host.keyboard.press('Tab');
    assert(await addCustom.evaluate((element) => element === document.activeElement));
    await host.screenshot({ path: path.join(profile, 'left-button-focus.png') });
    assert(!/300\s*\/\s*256/.test(await host.locator('.custom-commands-settings').innerText()));
    checks.push(
      '300 custom commands remain visible and the add action stays enabled beyond the former limit',
    );
    await host
      .locator('.settings-categories')
      .getByRole('button', { name: 'Layout fixture', exact: true })
      .click();
    await host.getByLabel('Layout note', { exact: true }).waitFor();
    assert.equal(await toolbar.locator('.settings-status-area, .settings-file-button').count(), 0);
    await host.getByRole('button', { name: 'JSON', exact: true }).click();
    await host.locator('.settings-panel-json > textarea').waitFor();
    assert.equal(await toolbar.locator('.settings-file-button').count(), 1);
    assert(await body.evaluate((e) => e.scrollHeight <= e.clientHeight + 1));
    await host.screenshot({ path: path.join(profile, 'applet-json.png') });
    checks.push(
      'disabled Applet settings share the toolbar, padding and single JSON scroll layout',
    );
    assert.equal(
      await host.getByTestId('settings-host-pages').getByTestId('settings-nav:applets').count(),
      0,
    );
    const navigation = await host
      .getByTestId('settings-applet-pages')
      .locator('[data-testid^="settings-nav:"]')
      .evaluateAll((buttons) => buttons.map((button) => button.dataset.testid));
    assert.equal(navigation[0], 'settings-nav:applets');
    assert(navigation.length > 1);
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().startsWith('appdock://host/'),
      );
      window.setSize(1280, 820);
    });
    await open('about');
    await host.getByTestId('about-overview').waitFor();
    for (const theme of ['dark', 'light']) {
      await host.evaluate(async (theme) => {
        const snapshot = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...snapshot.settings.value, host: { ...snapshot.settings.value.host, theme } },
          snapshot.settings.revision,
        );
      }, theme);
      await host.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      const mark = host.getByTestId('settings-nav:about').locator('.brand-mark');
      assert.equal(await mark.locator('span').count(), 3);
      assert(
        await mark.evaluate((element) => {
          const style = getComputedStyle(element);
          const bar = getComputedStyle(element.children[1]);
          const expected = document.createElement('span');
          expected.style.color = 'var(--accent)';
          element.append(expected);
          const accent = getComputedStyle(expected).color;
          expected.remove();
          return style.backgroundColor === 'rgba(0, 0, 0, 0)' && bar.backgroundColor === accent;
        }),
      );
      await host.screenshot({ path: path.join(profile, `about-overview-${theme}.png`) });
    }
    await host.screenshot({ path: path.join(profile, 'about-overview.png') });
    checks.push(
      'Applet management leads the APPLET group; About uses transparent accent bars in both themes',
    );
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().startsWith('appdock://host/'),
      );
      window.setMinimumSize(600, 200);
      window.setSize(760, 320);
    });
    await open('general');
    await host.locator('.settings-page-layout').evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await frame();
    assert(
      await toolbar.evaluate((element) => {
        const viewport = element.closest('.settings-page-layout').getBoundingClientRect();
        const button = element.querySelector('button').getBoundingClientRect();
        return button.top >= viewport.top && button.bottom <= viewport.bottom;
      }),
      'short window layout keeps sticky toolbar buttons fully reachable',
    );
    await host.screenshot({ path: path.join(profile, 'short-settings-toolbar.png') });
    checks.push('short window scroll owner keeps the settings toolbar buttons fully reachable');
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
