const { testHostPath } = require('./copy-host.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { settingsPage, waitForHost } = require('./settings-host-helper.cjs');
const { selectionDialog, chooseCommand } = require('./command-selection-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'command-selection-ui-' + Date.now());
const fixture = path.join(profile, 'extensions', 'fixture.selection');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.selection',
    name: 'Selection fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    commands: [
      {
        id: 'fixture.selection.stopped',
        title: '停止中の長いコマンド名を選んで内容を確認する',
        description:
          '選択しても実行しないコマンドです。 [command:appdock.settings.open] の説明も確認できます。\n' +
          '長い説明を最後までスクロールして確認できます。\n'.repeat(12),
      },
      {
        id: 'fixture.selection.other',
        title: '別の候補',
        description: '日本語の説明を検索できます。',
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'worker.cjs'),
  'exports.activate=async()=>{throw Error("Selection must not start this Applet");};',
);
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const settings = createDefaultSettings();
Object.assign(settings.host, {
  hardwareAcceleration: false,
  soundEnabled: false,
  closeToTray: false,
  checkUpdatesOnStartup: false,
  theme: 'dark',
  trayClickCommand: 'appdock.settings.open',
});
settings.updates.checkHostOnAboutOpen = false;
settings.keybindingOptions.enabled = false;
settings.gestures.enabled = false;
settings.touchpadGestures.enabled = false;
settings.extensions['fixture.selection'] = { enabled: false, settings: {} };
settings.pinnedCommands = ['appdock.settings.open', 'fixture.selection.stopped'];
const customId = '8ec42e88-c808-469b-88a3-63b9ed57837b';
settings.customCommands = {
  version: 2,
  items: [
    {
      id: customId,
      typeId: 'appdock.commands.stack',
      owner: { kind: 'host' },
      title: 'Selection stack',
      description: '',
      configVersion: 1,
      config: {
        executionMode: 'first',
        entries: [
          {
            id: 'entry-one',
            command: 'appdock.noop',
            enabled: true,
            when: { scope: 'global', appletIds: [] },
          },
        ],
      },
      enabled: true,
      automation: false,
    },
  ],
};
parseSettings(settings);
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const portable = !!process.argv[2];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let executable = require('electron');
if (portable) {
  executable = testHostPath(profile);
  require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
  assert.equal(hash(executable), hash(path.resolve(process.argv[2])));
}
let app, host;
const layouts = [];
const checks = [],
  errors = [];
async function launch() {
  app = await launchTestHost({
    executablePath: executable,
    portable,
    args: [...(portable ? [] : [root]), '--test-profile=' + profile],
    env,
  });
  const until = Date.now() + 30000;
  while (!host && Date.now() < until) {
    host = app
      .context()
      .pages()
      .find((page) => page.url() === 'appdock://host/index.html');
    if (!host) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(host);
  host.setDefaultTimeout(15000);
  host.on('pageerror', (error) => errors.push(error.message));
  await waitForHost(host, async () => (await window.dock.snapshot()).startupReady);
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.getURL() === 'appdock://host/index.html',
    );
    w.setSize(1250, 1100);
    w.show();
  });
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await settingsPage(host);
}
async function nav(id) {
  await host.getByTestId('settings-nav:' + id).click();
  await host.getByTestId('settings-page:' + id).waitFor();
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
const saved = async () => (await snapshot()).settings.value;
const cancel = async () => {
  const dialog = selectionDialog(host);
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
};
const confirm = async () => {
  const dialog = selectionDialog(host);
  await dialog.getByTestId('command-selection-confirm').click();
  await dialog.waitFor({ state: 'hidden' });
};
const openTray = async () => {
  await host.getByRole('button', { name: 'トレイクリックのコマンドを選択', exact: true }).click();
  await selectionDialog(host).waitFor();
  return selectionDialog(host);
};
async function resize(width, height) {
  await app.evaluate(
    ({ BrowserWindow }, { width, height }) => {
      const w = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getURL() === 'appdock://host/index.html',
      );
      w.setMinimumSize(400, 500);
      w.setSize(width, height);
    },
    { width, height },
  );
}
async function inspectLayout(dialog, name) {
  const detail = dialog.getByRole('region', { name: '選択中のコマンドの詳細' });
  await detail.hover();
  await host.mouse.wheel(0, 2000);
  await host.waitForFunction(
    () => document.querySelector('.command-selection-detail').scrollTop > 0,
  );
  const measured = await dialog.evaluate((element) => {
    const detail = element.querySelector('.command-selection-detail');
    const list = element.querySelector('.command-selection-results');
    return {
      dialogHeight: element.getBoundingClientRect().height,
      dialogWidth: element.getBoundingClientRect().width,
      providerWidth: element.querySelector('.command-selection-providers').getBoundingClientRect()
        .width,
      listHeight: list.clientHeight,
      detailHeight: detail.clientHeight,
      detailScroll: detail.scrollTop,
      detailScrollHeight: detail.scrollHeight,
      footerBottom: element.querySelector('footer').getBoundingClientRect().bottom,
      viewportHeight: innerHeight,
      horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
    };
  });
  assert(measured.detailScroll > 0);
  assert(measured.listHeight > measured.detailHeight);
  assert(measured.footerBottom <= measured.viewportHeight);
  assert.equal(measured.horizontalOverflow, false);
  layouts.push({ name, ...measured });
  await detail.evaluate((element) => {
    element.scrollTop = 0;
  });
}
(async () => {
  try {
    await launch();
    await nav('tray');
    const baseline = await saved();
    let dialog = await openTray();
    assert.equal(await dialog.getByRole('combobox', { name: 'コマンドを検索' }).inputValue(), '');
    assert.equal(
      await dialog.locator('[role=option][aria-selected=true]').getAttribute('data-command-id'),
      'appdock.settings.open',
    );
    assert.equal((await snapshot()).overlay.active, false);
    const divider = dialog.getByRole('separator', { name: '提供元一覧の幅を変更' });
    const width = async () => Number(await divider.getAttribute('aria-valuenow'));
    assert.equal(await width(), 170);
    await divider.press('ArrowRight');
    assert.equal(await width(), 180);
    const handle = await divider.boundingBox();
    await host.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await host.mouse.down();
    await host.mouse.move(handle.x + handle.width / 2 + 100, handle.y + handle.height / 2);
    await host.mouse.up();
    assert.equal(await width(), 280);
    await divider.press('Home');
    assert.equal(await width(), Number(await divider.getAttribute('aria-valuemin')));
    await divider.press('End');
    assert.equal(await width(), Number(await divider.getAttribute('aria-valuemax')));
    await resize(900, 640);
    assert(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
    assert((await dialog.getByRole('listbox').boundingBox()).width > 0);
    await resize(1250, 1100);
    await divider.dblclick();
    assert.equal(await width(), 170);
    const size = await dialog.boundingBox();
    await dialog.getByRole('combobox', { name: 'コマンドを検索' }).fill('存在しないコマンド');
    assert.equal(await dialog.getByRole('option').count(), 0);
    assert(await dialog.getByTestId('command-selection-confirm').isDisabled());
    await dialog.getByRole('combobox', { name: 'コマンドを検索' }).press('Control+Enter');
    assert(await dialog.isVisible());
    await dialog.getByRole('combobox', { name: 'コマンドを検索' }).press('Enter');
    assert(await dialog.isVisible());
    assert(Math.abs((await dialog.boundingBox()).height - size.height) < 2);
    await cancel();
    assert.deepEqual(await saved(), baseline);
    await host.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'トレイクリックのコマンドを選択',
    );
    checks.push(
      'current selection, empty query, zero results, stable size, cancellation and focus',
    );

    dialog = await openTray();
    assert.equal(Number(await dialog.getByRole('separator').getAttribute('aria-valuenow')), 170);
    await dialog.getByRole('button', { name: /^お気に入り/ }).click();
    assert.equal(await dialog.getByRole('option').count(), 2);
    await dialog.getByRole('button', { name: /^Selection fixture/ }).click();
    await dialog.getByRole('combobox', { name: 'コマンドを検索' }).fill('日本語 説明');
    assert.equal(await dialog.getByRole('option').count(), 1);
    await dialog.getByRole('button', { name: '絞り込みを解除' }).click();
    await dialog
      .getByRole('combobox', { name: 'コマンドを検索' })
      .fill('fixture.selection.stopped');
    await dialog.getByRole('option').click();
    assert.equal((await saved()).host.trayClickCommand, 'appdock.settings.open');
    assert.match(
      await dialog.getByRole('region', { name: '選択中のコマンドの詳細' }).innerText(),
      /設定を開く/,
    );
    await dialog
      .getByRole('combobox', { name: 'コマンドを検索' })
      .evaluate((input) =>
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
        ),
      );
    assert(await dialog.isVisible());
    await dialog.getByRole('combobox', { name: 'コマンドを検索' }).focus();
    for (let i = 0; i < 14; i++) {
      await host.keyboard.press('Tab');
      assert(await dialog.evaluate((e) => e.contains(document.activeElement)));
    }
    await inspectLayout(dialog, 'dark-wide');
    await dialog.screenshot({ path: path.join(profile, 'dark-wide.png') });
    await resize(680, 760);
    await dialog.getByRole('combobox', { name: '提供元で絞り込み' }).waitFor();
    assert.equal(await dialog.getByRole('separator').count(), 0);
    assert(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = 'light';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await host.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await inspectLayout(dialog, 'light-narrow');
    await dialog.screenshot({ path: path.join(profile, 'light-narrow.png') });
    await resize(900, 640);
    await inspectLayout(dialog, 'light-compact');
    await dialog.screenshot({ path: path.join(profile, 'light-compact.png') });
    await confirm();
    await waitForHost(
      host,
      async () =>
        (await window.dock.snapshot()).settings.value.host.trayClickCommand ===
        'fixture.selection.stopped',
    );
    assert.equal(
      (await snapshot()).extensions.find((e) => e.id === 'fixture.selection').enabled,
      false,
    );
    assert.equal((await snapshot()).navigation.route, 'settings');
    assert.deepEqual((await saved()).pinnedCommands, baseline.pinnedCommands);
    checks.push(
      'favorites, provider+search, detail links as text, IME, Tab, narrow/light and stopped selection without execution',
    );

    await resize(1250, 900);
    await nav('ribbon');
    const ribbonBefore = (await saved()).ribbon;
    const addRibbon = () =>
      host
        .getByRole('region', { name: '上寄せのリボン設定', exact: true })
        .getByRole('button', { name: '＋ コマンド', exact: true });
    await addRibbon().click();
    const parent = host.getByRole('dialog', { name: 'コマンドボタンを追加', exact: true });
    await parent.getByLabel('ボタン名', { exact: true }).fill('Selection ribbon');
    const opener = parent.getByRole('button', { name: '実行コマンドを選択', exact: true });
    await opener.click();
    await cancel();
    assert.equal(
      await parent.getByLabel('ボタン名', { exact: true }).inputValue(),
      'Selection ribbon',
    );
    assert(await opener.evaluate((e) => e === document.activeElement));
    await opener.click();
    const child = selectionDialog(host);
    const search = child.getByRole('combobox', { name: 'コマンドを検索' });
    await search.fill('appdock.notifications.open');
    await child.locator('[role="option"][aria-selected="true"][data-command-id="appdock.notifications.open"]').waitFor();
    await search.press('Control+Enter');
    await child.waitFor({ state: 'hidden' });
    assert.equal(
      await parent.getByLabel('ボタン名', { exact: true }).inputValue(),
      'Selection ribbon',
    );
    assert.deepEqual((await saved()).ribbon, ribbonBefore);
    await parent.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.deepEqual((await saved()).ribbon, ribbonBefore);
    await addRibbon().click();
    await parent.getByLabel('ボタン名', { exact: true }).fill('Selection ribbon');
    await opener.click();
    await chooseCommand(host, 'appdock.notifications.open');
    await parent.getByTestId('settings-dialog-confirm').click();
    await parent.waitFor({ state: 'hidden' });
    await waitForHost(host, async () =>
      (await window.dock.snapshot()).settings.value.ribbon.buttons.some(
        (b) => b.title === 'Selection ribbon' && b.commandId === 'appdock.notifications.open',
      ),
    );
    checks.push(
      'nested ribbon cancellation restores opener and draft; selection stays local until parent confirmation',
    );

    await nav('custom-commands');
    await host.getByRole('button', { name: 'Selection stackを編集', exact: true }).click();
    const stack = host.getByRole('dialog', { name: 'カスタムコマンドの編集', exact: true });
    await stack.getByTestId('stack-add-command').click();
    dialog = selectionDialog(host);
    await dialog
      .getByRole('combobox', { name: 'コマンドを検索' })
      .fill('appdock.custom.' + customId);
    assert.equal(await dialog.getByRole('option').count(), 0);
    await dialog.getByRole('button', { name: '絞り込みを解除' }).click();
    await dialog.getByRole('button', { name: /^お気に入り/ }).click();
    assert.equal(await dialog.getByRole('option').count(), 2);
    await cancel();
    assert(
      await stack.getByTestId('stack-add-command').evaluate((e) => e === document.activeElement),
    );
    await stack.getByTestId('stack-add-command').click();
    await chooseCommand(host, 'fixture.selection.stopped');
    assert.equal(await stack.getByTestId('stack-entry').count(), 2);
    assert.equal((await saved()).customCommands.items[0].config.entries.length, 1);
    await stack.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal((await saved()).customCommands.items[0].config.entries.length, 1);
    checks.push(
      'stack shares favorites and caller exclusions; nested cancel and parent cancel preserve saved entries',
    );

    await nav('tray');
    dialog = await openTray();
    await dialog
      .getByRole('combobox', { name: 'コマンドを検索' })
      .fill('appdock.custom.' + customId);
    assert.equal(await dialog.getByRole('option').count(), 1);
    await dialog.getByRole('combobox', { name: 'コマンドを検索' }).fill('Selection');
    await dialog
      .locator('[role=option][data-command-id="appdock.custom.' + customId + '"]')
      .click();
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.customCommands.items = [];
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await dialog
      .locator('[role=option][data-command-id="appdock.custom.' + customId + '"]')
      .waitFor({ state: 'hidden' });
    assert((await dialog.getByRole('option').count()) > 0);
    assert(await dialog.getByTestId('command-selection-confirm').isDisabled());
    await dialog.getByRole('combobox', { name: 'コマンドを検索' }).press('Enter');
    assert(await dialog.isVisible());
    await cancel();
    const rejected = await host.evaluate(async () => {
      try {
        await window.dock.openCommandPalette({ requestId: 'removed-picker', mode: 'select' });
        return false;
      } catch {
        return true;
      }
    });
    assert(rejected);
    checks.push('live removed candidate cannot be confirmed; removed palette API is rejected');

    await app.close();
    app = null;
    host = null;
    await launch();
    assert.equal((await saved()).host.trayClickCommand, 'fixture.selection.stopped');
    assert((await saved()).ribbon.buttons.some((b) => b.title === 'Selection ribbon'));
    assert.deepEqual(errors, []);
    checks.push('saved choices survive restart; no renderer errors');
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { ok: true, portable, executable, hash: hash(executable), checks, layouts, errors },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ ok: true, profile, checks }, null, 2));
  } catch (error) {
    if (host) {
      await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
      fs.writeFileSync(
        path.join(profile, 'failure-dom.txt'),
        await host
          .locator('body')
          .innerText()
          .catch(() => ''),
      );
    }
    fs.writeFileSync(
      path.join(profile, 'failure.json'),
      JSON.stringify({ error: String(error), stack: error.stack, checks, errors }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    await app?.close().catch(() => {});
  }
})();
