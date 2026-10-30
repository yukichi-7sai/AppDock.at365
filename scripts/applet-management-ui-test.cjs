const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium, _electron: electron } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { waitForHost } = require('./settings-host-helper.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', `applet-management-ui-${Date.now()}`);
const profile = path.join(output, 'profile'),
  local = path.join(profile, 'local');
fs.mkdirSync(path.join(profile, 'extensions'), { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, {
  soundEnabled: false,
  notifications: false,
  hardwareAcceleration: false,
  closeToTray: false,
});
settings.gestures.enabled = false;
settings.keybindings = [];
settings.globalShortcutCommands = [];
const siteId = 'at365.web-applet.items.site';
settings.appletOrder = ['test.a', siteId, 'missing', 'test.b', 'at365.web-applet'];
function fixture(id, enabled = true) {
  const folder = path.join(profile, 'extensions', id);
  fs.mkdirSync(folder, { recursive: true });
  const commands = ['run', 'other'].map((suffix) => ({
    id: `${id}.${suffix}`,
    title: `${id} ${suffix}`,
  }));
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: id,
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.js',
      commands,
      settings: [{ key: 'text', type: 'string', title: '保持する入力', default: '' }],
    }),
  );
  fs.writeFileSync(
    path.join(folder, 'index.js'),
    `exports.activate = c => { ${commands.map((command) => `c.commands.register('${command.id}', '${command.title}', async () => {});`).join(' ')} };`,
  );
  settings.extensions[id] = { enabled, settings: { text: 'preserved' } };
}
fixture('test.a');
fixture('test.b', false);
fs.mkdirSync(path.join(profile, 'extensions/broken'));
fs.writeFileSync(path.join(profile, 'extensions/broken/extension.json'), '{');
const webFolder = path.join(profile, 'extensions/at365.web-applet');
fs.mkdirSync(webFolder);
const webFields = [
  ...['id', 'name', 'url', 'accountId', 'icon'].map((key) => ({
    key,
    title: key,
    type: 'string',
    default: '',
  })),
  { key: 'enabled', title: '有効', type: 'boolean', default: true },
  {
    key: 'display',
    title: '表示先',
    type: 'select',
    default: 'page',
    options: [
      { value: 'page', label: '本体' },
      { value: 'window', label: '別窓' },
    ],
  },
  {
    key: 'navigation',
    title: '遷移',
    type: 'select',
    default: 'none',
    options: ['none', 'same-origin', 'any'].map((value) => ({ value, label: value })),
  },
  { key: 'allowedOrigins', title: '追加origin', type: 'string-list', default: [] },
];
const web = {
  apiVersion: 1,
  id: 'at365.web-applet',
  name: 'WebApplet',
  version: '1.0.0',
  minimumHostVersion: '0.45.0',
  runtime: 'node',
  entry: 'index.js',
  capabilities: ['pages', 'dynamic-pages', 'web-profiles'],
  settings: [
    {
      key: 'items',
      title: 'サイト',
      type: 'object-list',
      default: [],
      fields: webFields,
      list: { columns: ['name'], titleKey: 'name', idKey: 'id' },
    },
  ],
  pageCollections: [{ key: 'items', source: 'remote', fields: [] }],
  commands: [],
};
fs.writeFileSync(path.join(webFolder, 'extension.json'), JSON.stringify(web));
fs.writeFileSync(path.join(webFolder, 'index.js'), 'exports.activate = () => {};');
require('../out/main/main/core/extensions').readManifest(webFolder);
settings.extensions[web.id] = {
  enabled: false,
  settings: {
    items: [
      {
        id: 'site',
        name: '除外するWebサイト',
        url: 'https://example.invalid/',
        accountId: 'account.11111111-1111-1111-1111-111111111111',
        enabled: false,
        display: 'page',
        navigation: 'none',
        allowedOrigins: [],
        icon: '',
      },
    ],
  },
};
settings.extensions['fixture.install'] = {
  enabled: false,
  settings: { text: 'retained after reinstall' },
};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
fs.mkdirSync(path.join(profile, 'data'));
fs.writeFileSync(path.join(profile, 'data/keep.txt'), 'retained');
const packageFolder = path.join(output, 'package');
fs.mkdirSync(packageFolder);
fs.writeFileSync(
  path.join(packageFolder, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.install',
    name: '導入テスト',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    settings: [{ key: 'text', title: '保持する入力', type: 'string', default: '' }],
  }),
);
fs.writeFileSync(path.join(packageFolder, 'index.js'), 'exports.activate = () => {};');
const packed = path.join(output, 'feed');
const pack = spawnSync(
  path.join(root, '.artifacts/updater/AppDock.Updater.exe'),
  ['--pack', 'applet', packageFolder, '1.0.0', packed],
  { windowsHide: true, encoding: 'utf8' },
);
assert.equal(pack.status, 0, pack.stderr);
const checks = [],
  errors = [];
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executable = process.argv[2] ? path.join(profile, 'AppDock.at365.exe') : undefined;
const managementOnly = process.argv.includes('--management-only');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (executable) {
  require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
  assert.equal(hash(executable), hash(process.argv[2]));
}
async function until(fn, name) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(name);
}
(async () => {
  let app, browser, page, port, inspectPort;
  let rejectFeed = false,
    stallFeed = false;
  const waitingResponses = new Set();
  const served = [];
  const renderer = (expression) =>
    inspect(
      inspectPort,
      `${electronExpression}.BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/')).webContents.executeJavaScript(${JSON.stringify(expression)})`,
    );
  const server = http.createServer((req, res) => {
    const name = path.basename(new URL(req.url, 'http://localhost').pathname);
    served.push({ name, rejected: rejectFeed });
    if (stallFeed && name === 'update.json') {
      waitingResponses.add(res);
      res.on('close', () => waitingResponses.delete(res));
      return;
    }
    if (rejectFeed && name === 'update.json') {
      res.writeHead(503);
      res.end('fixture unavailable');
      return;
    }
    if (!['update.json', 'update.zip'].includes(name)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.end(fs.readFileSync(path.join(packed, name)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const feedUrl = `http://127.0.0.1:${server.address().port}/update.json`;
  const attach = async () => {
    browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
      'CDP connection',
    );
    page = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/')),
      'host renderer',
    );
    page.on('pageerror', (error) => errors.push(error.message));
    await waitForHost(
      page,
      async () => (await window.dock.snapshot()).startupReady,
      undefined,
      60000,
    );
  };
  const open = async () => {
    await page.evaluate(() => window.dock.executeCommand('appdock.applets.open'));
    await page.getByRole('heading', { name: 'Applet管理', exact: true }).waitFor();
  };
  const row = (id) => page.locator(`[data-applet-id="${id}"]`);
  const move = async (id, name) => {
    await row(id).getByTitle(name, { exact: true }).click();
  };
  const ids = () =>
    page.locator('[data-applet-id]').evaluateAll((rows) => rows.map((r) => r.dataset.appletId));
  const restartApply = async (click, requireManagement = true) => {
    const previousPid = await inspect(inspectPort, 'process.pid');
    // Release renderer CDP before shutdown; use the existing main-inspector bridge across restarts.
    if (browser) {
      await browser.close();
      browser = undefined;
    }
    await click().catch((error) => {
      if (!/closed|destroyed/.test(String(error))) throw error;
    });
    return until(async () => {
      if ((await inspect(inspectPort, 'process.pid')) === previousPid) return false;
      const snapshot = await renderer('window.dock.snapshot()');
      if (!snapshot.startupReady) return false;
      if (!requireManagement) return snapshot;
      const restored = await renderer(
        "document.querySelector('.settings-page-heading h1')?.textContent === 'Applet管理'",
      );
      return restored && snapshot;
    }, 'new host process and restored management page');
  };
  try {
    if (executable) {
      port = await freePort();
      inspectPort = await freePort();
      fs.writeFileSync(path.join(output, 'ports.json'), JSON.stringify({ port, inspectPort }));
      app = spawn(
        executable,
        [
          `--test-profile=${profile}`,
          `--test-local-state=${local}`,
          `--remote-debugging-port=${port}`,
          `--inspect=${inspectPort}`,
        ],
        { env, windowsHide: true, stdio: 'ignore' },
      );
      app.on('error', (error) => errors.push(error.message));
      await attach();
    } else {
      app = await electron.launch({
        executablePath: require('electron'),
        args: [root, `--test-profile=${profile}`, `--test-local-state=${local}`],
        env,
      });
      page = await until(
        () =>
          app
            .context()
            .pages()
            .find((p) => p.url().startsWith('appdock://host/')),
        'host',
      );
      page.on('pageerror', (error) => errors.push(error.message));
      await waitForHost(page, async () => (await window.dock.snapshot()).startupReady);
    }
    page.setDefaultTimeout(20000);
    await open();
    const separator = page.locator('.settings-surface .sidebar-resizer');
    const widthBefore = Number(await separator.getAttribute('aria-valuenow'));
    await separator.focus();
    await separator.press('ArrowLeft');
    await until(
      async () => Number(await separator.getAttribute('aria-valuenow')) === widthBefore - 10,
      'settings sidebar resize',
    );
    await separator.press('ArrowRight');
    checks.push('settings-sidebar-keyboard-resize');
    assert.deepEqual(await ids(), ['test.a', 'test.b', 'at365.web-applet']);
    assert.equal(await page.getByText('導入状況', { exact: true }).count(), 0);
    assert.equal(
      await page.getByText('インストール済みAppletを管理できます。', { exact: true }).count(),
      0,
    );
    const search = page.getByRole('searchbox', { name: 'Appletを検索', exact: true });
    await search.fill('WebApplet');
    await until(
      async () => JSON.stringify(await ids()) === JSON.stringify(['at365.web-applet']),
      'search while focused',
    );
    assert(await search.evaluate((element) => document.activeElement === element));
    await search.fill('');
    await until(async () => (await ids()).length === 3, 'clear search while focused');
    checks.push('search-filters-and-clears-while-focused');
    const presentation = await row('test.a').evaluate((element) => {
      const cells = element.querySelectorAll('td');
      const name = element.querySelector('.applet-management-name');
      const version = element.querySelector('.version-display').getBoundingClientRect();
      const check = document.querySelector('.applet-management thead .applet-update-check');
      const time = element.querySelector('time').getBoundingClientRect();
      const links = [...element.querySelectorAll('.applet-management-links button')];
      return {
        nameSize: parseFloat(getComputedStyle(name).fontSize),
        idSize: parseFloat(getComputedStyle(cells[0].querySelector('small')).fontSize),
        nameWeight: Number(getComputedStyle(name.querySelector('strong')).fontWeight),
        checkInVersionHeader: check.closest('th').textContent.includes('バージョン'),
        timeBelowVersion: time.y >= version.bottom,
        links: links.map((button) => ({
          title: button.title,
          icon: !!button.querySelector('svg'),
          text: button.textContent.trim(),
        })),
        oneLine: new Set(links.map((button) => button.getBoundingClientRect().y)).size === 1,
        actions: [...element.querySelectorAll('.applet-management-actions button')].map(
          (button) => ({
            title: button.title,
            icon: !!button.querySelector('svg'),
            text: button.textContent.trim(),
          }),
        ),
      };
    });
    assert(presentation.nameSize > presentation.idSize && presentation.nameWeight >= 600);
    assert(presentation.checkInVersionHeader && presentation.timeBelowVersion);
    assert.deepEqual(
      presentation.links.map((button) => button.title),
      ['設定', 'ログ', 'コマンドトリガー'],
    );
    assert(
      presentation.oneLine && presentation.links.every((button) => button.icon && !button.text),
    );
    assert.deepEqual(
      presentation.actions.map((button) => button.title),
      ['再起動', 'アンインストール'],
    );
    assert(presentation.actions.every((button) => button.icon && !button.text));
    assert.equal(
      await page.locator('.applet-management thead .applet-shortcut-add').getAttribute('title'),
      'Appletをインストール',
    );
    const searchStyle = await page
      .locator('.applet-management .command-shortcut-search')
      .evaluate((element) => {
        const s = getComputedStyle(element);
        return [s.borderRadius, s.borderColor, s.backgroundColor, s.padding];
      });
    const orderStyle = await page
      .getByRole('button', { name: 'Appletを並べ替え', exact: true })
      .evaluate((element) => {
        const s = getComputedStyle(element);
        return [s.width, s.height, s.borderRadius, s.backgroundColor];
      });
    checks.push('compact-icon-columns-name-and-version-layout');
    await page.getByRole('button', { name: 'すべてのAppletの更新を確認', exact: true }).click();
    await waitForHost(
      page,
      async () =>
        !!(await window.dock.snapshot()).updates.results.find((result) => result.id === 'test.a')
          ?.checkedAt,
    );
    await row('test.a').locator('time[datetime]').waitFor();
    assert.equal(await page.locator('.applet-management tbody .applet-update-check').count(), 0);
    checks.push('global-update-check-header-and-last-check-time');
    const previewFailure = await page.evaluate(async () => {
      const id = document.querySelector('.settings-surface').dataset.settingsConnection;
      const model = await window.dock.settingsPage.get(id);
      const response = await window.dock.settingsPage.act(id, {
        id: model.id,
        type: 'settings',
        sessionId: model.content.editing.sessionId,
        editRevision: model.content.editing.editRevision,
        operationId: crypto.randomUUID(),
        operation: {
          kind: 'invoke',
          actionId: model.content.actions.prepareAppletInstall,
          args: [''],
        },
      });
      return { result: response.result, pageError: response.model.content.editing.error };
    });
    assert.equal(typeof previewFailure.result.error, 'string');
    assert.equal(previewFailure.pageError, '');
    checks.push('preview-failures-return-to-dialog-without-page-error');
    assert.equal(await page.getByRole('tablist', { name: 'Applet詳細の切り替え' }).count(), 0);
    const snapshot = await page.evaluate(() => window.dock.snapshot());
    assert(
      snapshot.extensions.some((a) => a.collection),
      'Web site fixture exists outside package rows',
    );
    checks.push('provider-included-sites-excluded-and-old-details-removed');
    await move('test.b', 'コマンドトリガー');
    await page.locator('.command-provider-filter').waitFor();
    await page.getByRole('searchbox', { name: 'トリガーのコマンドを検索', exact: true }).focus();
    assert.deepEqual(
      await page.locator('.command-shortcut-search').evaluate((element) => {
        const s = getComputedStyle(element);
        return [s.borderRadius, s.borderColor, s.backgroundColor, s.padding];
      }),
      searchStyle,
    );
    assert.equal(await page.locator('.command-list-toolbar .shortcut-order-open').count(), 0);
    assert.deepEqual(orderStyle.slice(0, 2), ['32px', '32px']);
    checks.push(
      'toolbar search matches command settings; Applet header order stays 32px and shortcut filter has no order action',
    );
    assert.deepEqual(
      await page
        .locator('[data-shortcut-command]')
        .evaluateAll((rows) => rows.map((r) => r.dataset.shortcutCommand)),
      ['test.b.run', 'test.b.other'],
    );
    await open();
    await row('test.b').getByRole('switch').click();
    await waitForHost(
      page,
      async () =>
        (await window.dock.snapshot()).extensions.find((a) => a.id === 'test.b')?.state ===
        'running',
    );
    await row('test.b').getByRole('button', { name: 'test.bを再起動', exact: true }).click();
    await waitForHost(
      page,
      async () =>
        (await window.dock.snapshot()).extensions.find((a) => a.id === 'test.b')?.state ===
        'running',
    );
    checks.push('enable-and-inline-restart');
    for (const name of ['コマンドトリガー']) {
      await move('test.a', name);
      await page.locator('.command-provider-filter').waitFor();
      assert.match(await page.locator('.command-provider-filter').innerText(), /test.a/);
      const clear = page.locator('.command-provider-filter').getByRole('button');
      assert.equal((await clear.innerText()).trim(), '');
      assert.equal(await clear.locator('svg').count(), 1);
      assert.equal(await clear.getAttribute('title'), '絞り込みを解除');
      assert.deepEqual(
        await page
          .locator('[data-shortcut-command]')
          .evaluateAll((rows) => rows.map((r) => r.dataset.shortcutCommand)),
        ['test.a.run', 'test.a.other'],
      );
      await page.locator('.command-provider-filter').getByRole('button').click();
      await until(
        async () => (await page.locator('[data-shortcut-command]').count()) > 2,
        'clear provider',
      );
      await open();
    }
    checks.push('command-triggers-include-unassigned-and-clear');
    await move('test.a', '設定');
    await page.getByLabel('保持する入力', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('保持する入力', { exact: true }).inputValue(), 'preserved');
    await page.getByLabel('保持する入力', { exact: true }).fill('saved through management');
    await page.getByLabel('保持する入力', { exact: true }).press('Enter');
    await waitForHost(
      page,
      async () =>
        (await window.dock.snapshot()).settings.value.extensions['test.a'].settings.text ===
        'saved through management',
    );
    await open();
    await move('test.a', 'ログ');
    await waitForHost(page, async () => (await window.dock.snapshot()).navigation.route === 'logs');
    const logs = await require('./shell-overlay-helper.cjs').logsPage(page, { type: 'all' });
    const logModel = await logs.evaluate(async () => await window.dock.pages.get());
    assert.equal(logModel.content.filters.source, 'test.a');
    assert.equal(logModel.content.scope.type, 'all');
    await logs.getByRole('button', { name: 'Appletの絞り込みを解除', exact: true }).click();
    await until(async () => {
      const model = await logs.evaluate(async () => await window.dock.pages.get());
      return model.content.filters.source === '' && model.content.filters.level === 'all';
    }, 'clear log source with adjacent close icon');
    checks.push('log-source-clear-icon');
    checks.push('individual-settings-and-source-filtered-common-log');
    await open();
    assert.match(
      await page.locator('.applet-management').innerText(),
      /読み込めなかったApplet.*1件/s,
    );
    await page.getByRole('button', { name: '検出ログを開く', exact: true }).click();
    await waitForHost(page, async () => (await window.dock.snapshot()).navigation.route === 'logs');
    const discoveryLogs = await require('./shell-overlay-helper.cjs').logsPage(page, {
      type: 'all',
    });
    await until(async () => {
      const model = await discoveryLogs.evaluate(async () => await window.dock.pages.get());
      return model.content.scope.type === 'all' && model.content.filters.source === '';
    }, 'unfiltered discovery logs');
    checks.push('discovery-warning-and-unfiltered-log');
    await open();
    await page.getByRole('button', { name: 'Appletを並べ替え', exact: true }).click();
    const orderDialog = page.getByRole('dialog');
    await orderDialog
      .getByRole('button', { name: 'test.bの順番を変更', exact: true })
      .press('ArrowUp');
    await orderDialog.getByRole('button', { name: 'OK', exact: true }).click();
    await until(async () => (await ids())[0] === 'test.b', 'saved order');
    const order = (await page.evaluate(() => window.dock.snapshot())).settings.value.appletOrder;
    assert.equal(order[1], siteId);
    assert.equal(order[2], 'missing');
    checks.push('order-preserves-site-and-missing-slots');
    for (const width of [1280, 760]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: path.join(output, `management-${width}.png`) });
    }
    await page.evaluate(async () => {
      const { settings } = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...settings.value, host: { ...settings.value.host, theme: 'dark' } },
        settings.revision,
      );
    });
    await waitForHost(page, async () => (await window.dock.snapshot()).dark);
    await page.screenshot({ path: path.join(output, 'management-dark.png') });
    checks.push('themes-and-widths');
    if (executable && !managementOnly) {
      const initialPid = await inspect(inspectPort, 'process.pid');
      await page.getByRole('button', { name: 'Appletをインストール', exact: true }).click();
      let dialog = page.getByRole('dialog');
      const primary = () =>
        dialog.getByRole('button', { name: 'インストールして再起動', exact: true });
      const source = () => dialog.getByLabel('Appletの配布元');
      const geometry = () =>
        dialog.evaluate((element) =>
          Object.fromEntries(
            ['input', 'footer', '.primary', '.settings-error']
              .map((selector) => [
                selector,
                element.querySelector(selector).getBoundingClientRect().toJSON(),
              ])
              .concat([['dialog', element.getBoundingClientRect().toJSON()]]),
          ),
        );
      const before = await geometry();
      const unchanged = async () => {
        const after = await geometry();
        for (const selector of Object.keys(before))
          for (const key of ['x', 'y', 'width', 'height'])
            assert(
              Math.abs(before[selector][key] - after[selector][key]) < 0.6,
              `${selector} ${key} moved`,
            );
      };
      const noBackgroundError = async () => {
        const outside = await page
          .locator('.settings-surface')
          .evaluate(
            (element) =>
              [...element.querySelectorAll('[role="alert"]')].filter(
                (alert) => !alert.closest('dialog'),
              ).length,
          );
        assert.equal(outside, 0);
        assert.equal(await inspect(inspectPort, 'process.pid'), initialPid);
        assert(!fs.existsSync(path.join(profile, 'extensions/fixture.install')));
      };
      assert.equal(
        await dialog.getByRole('button', { name: '内容を確認', exact: true }).count(),
        0,
      );
      await primary().click();
      await dialog.getByRole('alert').filter({ hasText: '配布元' }).waitFor();
      await unchanged();
      await noBackgroundError();
      assert(!/Error invoking|^Error:/.test(await dialog.getByRole('alert').innerText()));
      const callsBeforeTyping = served.length;
      await source().fill(feedUrl.replace('update.json', 'missing.json'));
      await source().press('Enter');
      assert.equal(served.length, callsBeforeTyping);
      await unchanged();
      await primary().click();
      await dialog.getByRole('alert').filter({ hasText: '404' }).waitFor();
      await unchanged();
      await noBackgroundError();
      await dialog.getByRole('button', { name: 'エラーの詳細', exact: true }).click();
      await dialog.getByRole('tooltip').waitFor();
      await unchanged();
      await page.screenshot({ path: path.join(output, 'install-error-details.png') });
      await page.keyboard.press('Escape');
      assert(await dialog.isVisible());
      assert(await dialog.getByRole('tooltip').isHidden());
      await unchanged();
      await page.screenshot({ path: path.join(output, 'install-validation-error.png') });
      checks.push('one-install-action-keeps-validation-errors-local-and-geometry-stable');
      rejectFeed = true;
      await source().fill(feedUrl);
      await primary().click();
      await dialog.getByRole('alert').filter({ hasText: '503' }).waitFor();
      await unchanged();
      await noBackgroundError();
      assert.equal(await source().inputValue(), feedUrl);
      rejectFeed = false;
      checks.push('fetch-failure-stops-before-install-and-preserves-the-source');
      await inspect(
        inspectPort,
        `${electronExpression}.dialog.showOpenDialog = (globalThis.__installPicker = ${electronExpression}.dialog.showOpenDialog, async () => ({canceled:false,filePaths:[${JSON.stringify(packed)}]})); true`,
      );
      await dialog.getByRole('button', { name: '配布フォルダーを選ぶ' }).click();
      await until(
        async () => (await source().inputValue()) === packed,
        'selected local distribution folder',
      );
      await inspect(
        inspectPort,
        `${electronExpression}.dialog.showOpenDialog=globalThis.__installPicker;delete globalThis.__installPicker;true`,
      );
      checks.push('folder-picker-populates-the-source-through-the-settings-action');
      stallFeed = true;
      await source().fill(feedUrl);
      const requestsBeforeCancel = served.length;
      await primary().click();
      await until(() => served.length > requestsBeforeCancel, 'fetch begins before cancellation');
      assert(await primary().isDisabled());
      assert(await source().isDisabled());
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await waitForHost(page, async () => !(await window.dock.snapshot()).updates.busy);
      stallFeed = false;
      assert(!fs.existsSync(path.join(profile, 'extensions/fixture.install')));
      assert.equal(await inspect(inspectPort, 'process.pid'), initialPid);
      checks.push('validation-can-be-cancelled-without-install-or-restart');
      for (const [kind, location] of [
        ['URL', feedUrl],
        ['distribution-folder', packed],
        ['unpacked-folder', packageFolder],
      ]) {
        if (browser) {
          await page.getByRole('button', { name: 'Appletをインストール', exact: true }).click();
          dialog = page.getByRole('dialog');
          await source().fill(location);
          await page.screenshot({ path: path.join(output, `install-${kind}.png`) });
        } else {
          await renderer(
            'document.querySelector(\'button[aria-label="Appletをインストール"]\').click()',
          );
          await until(
            () => renderer("!!document.querySelector('dialog[open] input')"),
            'install dialog after restart',
          );
          await renderer(
            `(() => {const field=document.querySelector('dialog[open] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(location)}); field.dispatchEvent(new Event('input',{bubbles:true}));})()`,
          );
          const image = await inspect(
            inspectPort,
            `(async()=>{const image=await ${electronExpression}.BrowserWindow.getAllWindows()[0].webContents.capturePage();return image.toPNG().toString('base64');})()`,
          );
          fs.writeFileSync(path.join(output, `install-${kind}.png`), Buffer.from(image, 'base64'));
        }
        await until(
          () => renderer("!!document.querySelector('dialog[open] button.primary:not([disabled])')"),
          'ready to install',
        );
        const afterInstall = await restartApply(() =>
          renderer("document.querySelector('dialog[open] button.primary').click()"),
        );
        assert(afterInstall.extensions.some((a) => a.id === 'fixture.install'));
        assert.equal(afterInstall.settings.value.extensions['fixture.install'].enabled, false);
        assert.equal(
          afterInstall.settings.value.extensions['fixture.install'].settings.text,
          'retained after reinstall',
        );
        checks.push(`${kind}-one-click-install-real-helper-restart-and-preserved-OFF`);
        if (kind === 'unpacked-folder') {
          await renderer(
            'document.querySelector(\'[data-testid="settings-nav:applet:fixture.install"]\').click()',
          );
          await until(
            () => renderer('!!document.querySelector(\'[data-testid="applet-information"]\')'),
            'installed Applet information',
          );
          await renderer(
            'document.querySelector(\'[data-testid="applet-information"] .applet-information-uninstall\').click()',
          );
        } else {
          await renderer(
            'document.querySelector(\'[data-applet-id="fixture.install"] button[aria-label="導入テストをアンインストール"]\').click()',
          );
        }
        await until(
          () => renderer("!!document.querySelector('dialog[open]')"),
          'uninstall confirmation',
        );
        await until(
          () => renderer("!!document.querySelector('dialog[open] button.primary:not([disabled])')"),
          'ready to uninstall',
        );
        const afterUninstall = await restartApply(
          () =>
            renderer(
              "[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent.trim()==='アンインストールして再起動').click()",
            ),
          kind !== 'unpacked-folder',
        );
        assert(!fs.existsSync(path.join(profile, 'extensions/fixture.install')));
        assert(!afterUninstall.extensions.some((a) => a.id === 'fixture.install'));
        assert.equal(
          afterUninstall.settings.value.extensions['fixture.install'].settings.text,
          'retained after reinstall',
        );
        assert.equal(fs.readFileSync(path.join(profile, 'data/keep.txt'), 'utf8'), 'retained');
        checks.push(
          `${kind}-${kind === 'unpacked-folder' ? 'information-panel' : 'management-list'}-uninstall-real-helper-restart-and-data-retention`,
        );
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, 'result.json'),
      JSON.stringify(
        {
          mode: managementOnly ? 'management-only' : 'full',
          checks,
          profile,
          executableSha256: executable ? hash(executable) : null,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify(
        { output, mode: managementOnly ? 'management-only' : 'full', checks },
        null,
        2,
      ),
    );
  } catch (error) {
    let diagnostic;
    if (browser) {
      diagnostic = await page
        .evaluate(() => ({
          dialog: document.querySelector('dialog[open]')?.innerText,
          trace: window.appletInstallTrace,
          alerts: [...document.querySelectorAll('[role="alert"]')].map(
            (element) => element.textContent,
          ),
        }))
        .catch(() => undefined);
      await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    } else if (executable) {
      diagnostic = await renderer(
        "({dialog:document.querySelector('dialog[open]')?.innerText,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent)})",
      ).catch(() => undefined);
    }
    fs.writeFileSync(
      path.join(output, 'failure.json'),
      JSON.stringify({ checks, served, diagnostic, error: String(error) }, null, 2),
    );
    console.error(JSON.stringify({ served, diagnostic }));
    throw error;
  } finally {
    if (!executable) {
      await app?.close().catch(() => {});
    } else {
      await renderer("void window.dock.executeCommand('appdock.quit')").catch(() => {});
      await browser?.close().catch(() => {});
    }
    for (const response of waitingResponses) response.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
