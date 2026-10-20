const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'settings-hints-ui-' + Date.now());
const source = process.argv[2] ? path.resolve(process.argv[2]) : null;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const checks = [],
  errors = [];
let host,
  browser,
  child,
  server,
  inspector,
  modelResponse,
  modelStatus = 200,
  success = false;
let output = '';
async function until(fn, label) {
  const deadline = Date.now() + 60000;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw Error(label + (last ? ': ' + last : ''));
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
async function launch() {
  const port = await freePort();
  inspector = await freePort();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(
    source ? path.join(profile, 'AppDock.at365.exe') : require('electron'),
    [
      ...(source ? [] : [root]),
      `--test-profile=${profile}`,
      `--test-local-state=${path.join(profile, 'local')}`,
      `--remote-debugging-port=${port}`,
      `--inspect=127.0.0.1:${inspector}`,
    ],
    { cwd: root, env, windowsHide: true, stdio: 'pipe' },
  );
  child.stdout.on('data', (data) => (output += data));
  child.stderr.on('data', (data) => (output += data));
  browser = await until(
    () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
    'CDP',
  );
  host = await until(
    () =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('appdock://host/')),
    'host',
  );
  host.setDefaultTimeout(15000);
  host.on('pageerror', (error) => errors.push(error.message));
  await until(async () => (await snapshot()).startupReady, 'startup');
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await settingsPage(host);
}
async function stop() {
  if (host) await host.evaluate(() => window.dock.executeCommand('appdock.quit'));
  else if (child && child.exitCode === null) child.kill();
  if (child) await until(() => child.exitCode !== null, 'shutdown');
  if (browser) await browser.close();
  host = browser = child = null;
}
async function select(title) {
  await host
    .locator('.settings-categories')
    .getByRole('button', { name: title, exact: true })
    .click();
  await host.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
  await settleSettings(host);
}
async function hints(enabled) {
  await settleSettings(host);
  await host.evaluate(
    (action) => window.dock.executeCommand('appdock.settings.showHints.' + action),
    enabled ? 'on' : 'off',
  );
  await until(
    async () => (await snapshot()).settings.value.host.showHints === enabled,
    'saved hint preference',
  );
  await until(async () => {
    const model = await host.evaluate(async () => {
      const connection = document.querySelector('.settings-surface').dataset.settingsConnection;
      return window.dock.settingsPage.get(connection);
    });
    return (
      model.content.showHints === enabled &&
      (model.content.page.id === 'appearance'
        ? (await host
            .getByRole('switch', { name: 'ヒントの表示', exact: true })
            .getAttribute('aria-checked')) === String(enabled)
        : enabled || (await host.locator('.settings-hint, .settings-hint-icon').count()) === 0)
    );
  }, 'hint rendering');
  assert.equal(await host.locator('.settings-page-error').count(), 0, 'no unexpected page errors');
}
async function appearance() {
  await select('表示');
  assert.equal(
    await host
      .getByText('文字・数値はEnterかフォーカスを外して確定、Escapeで入力を取消。', { exact: true })
      .count(),
    0,
  );
  assert.deepEqual(await host.locator('.settings-section h2').allTextContents(), [
    '共通',
    'Shellの変更',
  ]);
  const common = host.getByRole('region', { name: '共通', exact: true });
  const visible = (await snapshot()).settings.value.host.showHints;
  assert.equal(
    await common.getByText('ワークスペースの配色を選びます。', { exact: true }).count(),
    visible ? 1 : 0,
  );
  assert.equal(
    await common.getByText('設定画面にヒントを表示します。', { exact: true }).count(),
    visible ? 1 : 0,
  );
  assert.equal(await common.locator('.settings-hint-trigger').count(), visible ? 2 : 0);
  assert.equal(
    await host
      .getByRole('region', { name: 'Shellの変更', exact: true })
      .locator('.settings-field-label p')
      .count(),
    0,
  );
  assert.equal(
    await host
      .getByRole('region', { name: 'Shellの変更', exact: true })
      .locator('.settings-hint-trigger')
      .count(),
    0,
    'empty catalog hints do not produce icons',
  );
  return common;
}
(async () => {
  try {
    fs.mkdirSync(profile, { recursive: true });
    server = http.createServer((request, response) => {
      modelResponse = () => {
        response.writeHead(modelStatus, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: [] }));
        modelResponse = null;
      };
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
    delete initial.host.showHints; // Existing settings must default to visible hints.
    initial.host.hardwareAcceleration = false;
    initial.host.closeToTray = false;
    initial.host.soundEnabled = false;
    initial.updates.checkHostOnStartup = false;
    initial.updates.checkAppletsOnStartup = false;
    initial.globalShortcutCommands = [];
    initial.keybindings = [];
    initial.gestures.enabled = false;
    initial.host.trayClickCommand = 'fixture.hints.run';
    initial.host.trayDoubleClickCommand = null;
    initial.tts.baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
    initial.extensions['fixture.hints'] = { enabled: true, settings: {} };
    const fixture = path.join(profile, 'extensions', 'hints');
    fs.mkdirSync(fixture, { recursive: true });
    fs.writeFileSync(
      path.join(fixture, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id: 'fixture.hints',
        name: 'Hint fixture',
        version: '1.0.0',
        runtime: 'node',
        entry: 'worker.cjs',
        commands: [{ id: 'fixture.hints.run', title: 'Hint action' }],
        settings: [
          {
            key: 'text',
            title: 'Fixture text',
            type: 'string',
            default: '',
            description: 'Card description stays visible.',
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(fixture, 'worker.cjs'),
      "exports.activate=async c=>{c.commands.register('fixture.hints.run','Hint action',()=>{});};",
    );
    require('../out/main/shared/settings-schema').parseSettings(initial);
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
    if (source) {
      fs.copyFileSync(source, path.join(profile, 'AppDock.at365.exe'));
      assert.equal(hash(source), hash(path.join(profile, 'AppDock.at365.exe')));
    }
    await launch();
    assert.equal((await snapshot()).settings.value.host.showHints, true);
    let common = await appearance();
    const titleTooltip = host.locator('.settings-hint-tooltip:popover-open');
    const themeHint = common.getByRole('button', { name: 'テーマのヒント', exact: true });
    await themeHint.hover();
    await titleTooltip.waitFor();
    assert.equal(await titleTooltip.innerText(), 'ワークスペースの配色を選びます。');
    await titleTooltip.hover();
    await host.screenshot({ path: path.join(profile, 'title-tooltip-hover.png') });
    assert.equal(await titleTooltip.isVisible(), true, 'tooltip remains hoverable');
    await host.keyboard.press('Escape');
    await until(async () => (await titleTooltip.count()) === 0, 'hover tooltip dismissal');
    await themeHint.focus();
    await titleTooltip.waitFor();
    const describedBy = await themeHint.getAttribute('aria-describedby');
    assert.equal(await titleTooltip.getAttribute('id'), describedBy);
    await hints(false);
    assert.equal(await common.locator('.settings-hint-trigger').count(), 0);
    assert.equal(await host.locator('.settings-hint-tooltip').count(), 0);
    await hints(true);
    await common.getByRole('switch', { name: 'ヒントの表示', exact: true }).click();
    await until(
      async () =>
        (await snapshot()).settings.value.host.showHints === false &&
        (await common
          .getByRole('switch', { name: 'ヒントの表示', exact: true })
          .getAttribute('aria-checked')) === 'false',
      'toggle off',
    );
    assert.equal(
      await common.getByText('設定画面にヒントを表示します。', { exact: true }).count(),
      0,
    );
    await common.getByRole('switch', { name: 'ヒントの表示', exact: true }).click();
    await until(
      async () =>
        (await snapshot()).settings.value.host.showHints &&
        (await common
          .getByRole('switch', { name: 'ヒントの表示', exact: true })
          .getAttribute('aria-checked')) === 'true',
      'toggle on',
    );
    checks.push(
      'existing settings default ON; title hints support hover/focus/Escape and disappear immediately with preference OFF',
    );

    await select('一般');
    await hints(false);
    await host
      .getByText(
        /通常権限で動作中|管理者権限で動作中|起動設定はWindowsの発行版AppDockで使用できます。/,
      )
      .waitFor();
    await host.locator('.settings-field-label p').filter({ hasText: 'UAC確認' }).waitFor();
    await select('通知');
    await hints(true);
    const notificationGuides = [
      [
        'エラー通知',
        'AI文章生成、設定の読み込み・保存・反映・復旧、更新処理、接続テストの失敗を通知します。バナーで必ず通知し、本体ログにも記録します。',
      ],
      [
        '警告通知',
        '旧PC専用データなど、確認や対処が必要な状態を通知します。バナーで必ず通知し、本体ログでも確認できます。',
      ],
    ];
    for (const [title, description] of notificationGuides) {
      const card = host.locator('.notification-setting-card').filter({
        has: host.getByRole('heading', { name: title, exact: true }),
      });
      const originalOpen = await card.getAttribute('open');
      await card.getByRole('button', { name: `${title}のヒント`, exact: true }).hover();
      await titleTooltip.waitFor();
      assert.equal(await titleTooltip.innerText(), description);
      assert.equal(await card.getAttribute('open'), originalOpen);
      assert.equal(
        await card
          .locator('.settings-section-content > p')
          .filter({ hasText: description })
          .count(),
        0,
      );
      await host.keyboard.press('Escape');
    }
    await hints(false);
    assert.equal(
      await host.locator('.notification-setting-card .settings-hint-trigger').count(),
      0,
    );
    for (const [title, description] of notificationGuides) {
      const card = host.locator('.notification-setting-card').filter({
        has: host.getByRole('heading', { name: title, exact: true }),
      });
      assert.equal(await card.getByText(description, { exact: true }).count(), 0);
      await card.locator('summary > p').waitFor();
      assert.match(await card.locator('summary > p').innerText(), /バナー.*読み上げ:.*MCP Events:/);
    }
    const errorCard = host.locator('.notification-setting-card').filter({
      has: host.getByRole('heading', { name: 'エラー通知', exact: true }),
    });
    await errorCard.locator('summary').click();
    assert.equal(
      await errorCard.getByLabel('エラー通知のバナー', { exact: true }).isDisabled(),
      true,
    );
    assert.ok((await errorCard.getByText('この通知では必須', { exact: true }).count()) > 0);
    await errorCard.locator('summary').click();
    checks.push(
      'notification type explanations use title hints; OFF removes explanations while current summaries and required targets remain',
    );
    const speechState = host
      .locator('.notification-settings > .settings-section')
      .filter({ has: host.getByRole('heading', { name: '読み上げ', exact: true }) })
      .locator('summary > p');
    await speechState.waitFor();
    assert.match(await speechState.innerText(), /現在の声:.*速度:/);
    await select('タスクトレイ');
    await host
      .locator('.tray-click-id.command-id')
      .getByText('fixture.hints.run', { exact: true })
      .waitFor();
    await select('MCP接続先');
    await host
      .getByText('名前は共有し、接続設定・認証情報・許可はこのPCだけに保存します。', {
        exact: true,
      })
      .waitFor();
    await hints(true);
    await host.getByRole('button', { name: '登録した接続先のヒント', exact: true }).hover();
    await titleTooltip.waitFor();
    assert.equal(await titleTooltip.innerText(), '登録したツールをAppDockから利用できます。');
    await host.keyboard.press('Escape');
    checks.push(
      'current launch/speech state, command IDs and security descriptions survive OFF; hint and description coexist',
    );

    for (const title of ['リボン', 'Webアカウント', 'ショートカット', 'マウスジェスチャー']) {
      await select(title);
      await hints(true);
      await until(
        async () => (await host.locator('.settings-hint').count()) > 0,
        title + ' hints rendered',
      );
      assert.ok((await host.locator('.settings-hint').count()) > 0, title);
      await hints(false);
      assert.equal(await host.locator('.settings-hint').count(), 0, title);
      assert.equal(
        await host.getByRole('heading', { name: title, level: 1, exact: true }).count(),
        1,
      );
    }
    checks.push('explicit hints toggle across ribbon, accounts, shortcuts and gestures');

    await select('マウスジェスチャー');
    await hints(true);
    const gestureOptions = host
      .locator('details.settings-section')
      .filter({ has: host.getByRole('heading', { name: '動作設定', exact: true }) });
    assert.equal(await gestureOptions.getAttribute('open'), null);
    const optionsHint = gestureOptions.getByRole('button', {
      name: '動作設定のヒント',
      exact: true,
    });
    await optionsHint.waitFor();
    await gestureOptions.locator('summary').focus();
    const focusBeforeTab = await host.evaluate(() => document.activeElement?.outerHTML);
    await host.keyboard.press('Tab');
    const focusAfterTab = await host.evaluate(() => document.activeElement?.outerHTML);
    fs.writeFileSync(
      path.join(profile, 'summary-focus.json'),
      JSON.stringify({ focusBeforeTab, focusAfterTab }, null, 2),
    );
    assert.equal(
      await optionsHint.evaluate((node) => document.activeElement === node),
      true,
      focusAfterTab,
    );
    await titleTooltip.waitFor();
    for (const key of ['Enter', 'Space']) {
      await host.keyboard.press(key);
      assert.equal(await gestureOptions.getAttribute('open'), null, `${key} must not toggle card`);
    }
    await optionsHint.click();
    assert.equal(
      await gestureOptions.getAttribute('open'),
      null,
      'hint click must not toggle card',
    );
    await host.keyboard.press('Escape');
    await until(async () => (await titleTooltip.count()) === 0, 'summary tooltip dismissal');
    checks.push(
      'Tab/Enter/Space/click on a collapsed section hint preserve its open state and heading name',
    );
    await gestureOptions.locator('summary').click();
    const rightClickHint = '何も操作せず右ボタンを離すと、通常の右クリックになります。';
    await gestureOptions.getByText(rightClickHint, { exact: true }).waitFor();
    await hints(false);
    assert.equal(await gestureOptions.getByText(rightClickHint, { exact: true }).count(), 0);

    await select('Webアカウント');
    const accountHint =
      '使用中の枠は削除できません。WebAppletの設定で別のアカウントを選択してください。削除は枠と保存データをまとめて消し、クリアは枠を残してログイン情報とサイトデータを消します。どちらも警告画面で確認します。';
    await hints(true);
    await host.getByText(accountHint, { exact: true }).waitFor();
    await hints(false);
    assert.equal(await host.getByText(accountHint, { exact: true }).count(), 0);

    await select('操作の許可');
    await hints(true);
    const permissionHint =
      '必要な許可が不足している操作は、ONでも有効になりません。連携がOFFの間も、MCPの許可を設定できます。';
    const saveHint = '変更は保存ボタンを押さずに保存されます。';
    const permissionHelp = host.locator('.permission-help');
    assert.equal(await host.getByText('このPCに自動保存', { exact: true }).count(), 0);
    assert.equal(
      await host
        .getByText('文字・数値はEnterかフォーカスを外して確定、Escapeで入力を取消。', {
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(await permissionHelp.getAttribute('open'), null);
    assert.equal(await permissionHelp.getByText(permissionHint, { exact: true }).count(), 1);
    assert.equal(
      await permissionHelp.getByText(permissionHint, { exact: true }).isVisible(),
      false,
    );
    await host.getByText(saveHint, { exact: true }).waitFor();
    await permissionHelp.locator('summary').click();
    await permissionHelp.getByText(permissionHint, { exact: true }).waitFor();
    await hints(false);
    assert.notEqual(await permissionHelp.getAttribute('open'), null);
    assert.equal(await host.getByText(permissionHint, { exact: true }).count(), 0);
    assert.equal(await host.getByText(saveHint, { exact: true }).count(), 0);
    assert.equal(await host.locator('.permission-warning-icon').count(), 6);
    assert.equal(await host.locator('.permission-fixed').getByRole('switch').isDisabled(), true);
    assert.ok((await host.locator('.permission-table tbody th p').count()) > 0);
    await hints(true);
    const appletRead = host
      .locator('.permission-table tbody tr')
      .first()
      .locator('td[data-caller="Applet"]')
      .getByRole('switch');
    const initialRead = await appletRead.getAttribute('aria-checked');
    for (const expected of [String(initialRead !== 'true'), initialRead]) {
      await appletRead.click();
      await until(
        async () =>
          (await appletRead.getAttribute('aria-checked')) === expected &&
          !(await appletRead.isDisabled()),
        'permission save',
      );
      assert.equal(await host.locator('.permission-save-status').innerText(), saveHint);
      assert.equal(await host.locator('.settings-page-error').count(), 0);
    }
    await host.screenshot({ path: path.join(profile, 'permission-hints-on.png') });
    await hints(false);
    await host.screenshot({ path: path.join(profile, 'permission-hints-off.png') });
    checks.push(
      'added gesture/account/permission hints toggle; prerequisite stays in help; removed guides stay absent; permission saves and six warnings remain',
    );

    for (const title of ['ショートカット', 'マウスジェスチャー']) {
      await select(title);
      await hints(true);
      await host.getByRole('button', { name: 'Hint actionに割り当てを追加', exact: true }).click();
      const dialog = host.locator('dialog[open]');
      await dialog.waitFor();
      await until(
        async () => (await dialog.locator('.settings-hint').count()) >= 2,
        'portal hints',
      );
      await hints(false);
      assert.equal(await dialog.locator('.settings-hint').count(), 0);
      assert.equal(
        await dialog.getByRole('button', { name: 'キャンセル', exact: true }).count(),
        1,
      );
      if (title === 'ショートカット')
        assert.equal(
          await dialog.locator('.shortcut-capture').getAttribute('aria-describedby'),
          null,
        );
      await hints(true);
      await until(
        async () => (await dialog.locator('.settings-hint').count()) >= 2,
        'portal hints restored',
      );
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    }
    checks.push(
      'open shortcut/gesture portals react to commands without remounting; hidden hint references are removed',
    );

    await select('カスタムコマンド');
    await hints(true);
    await host.getByRole('button', { name: 'コマンドを追加', exact: true }).click();
    const processDialog = host.locator('dialog[open]');
    await processDialog.getByLabel('種類', { exact: true }).selectOption('appdock.process.start');
    await processDialog
      .getByText('アプリやコマンドを起動します。起動受付を返し、終了や出力は待ちません。', {
        exact: true,
      })
      .waitFor();
    await processDialog
      .getByText('起動受付を返します。終了待ち・標準出力の取得は行いません。', { exact: true })
      .waitFor();
    const argumentsHint = processDialog.getByRole('button', { name: '引数のヒント', exact: true });
    await argumentsHint.scrollIntoViewIfNeeded();
    await argumentsHint.focus();
    await titleTooltip.waitFor();
    assert.match(await titleTooltip.innerText(), /文字列のJSON配列/);
    const tooltipBounds = await titleTooltip.boundingBox();
    const viewport = await host.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.ok(tooltipBounds.x >= 0 && tooltipBounds.y >= 0);
    assert.ok(tooltipBounds.x + tooltipBounds.width <= viewport.width);
    assert.ok(tooltipBounds.y + tooltipBounds.height <= viewport.height);
    assert.equal(
      await titleTooltip.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
      true,
      'tooltip is above the modal scrolling surface',
    );
    await host.screenshot({ path: path.join(profile, 'dialog-title-tooltip.png') });
    await host.keyboard.press('Escape');
    await until(async () => (await titleTooltip.count()) === 0, 'dialog tooltip dismissal');
    assert.equal(await processDialog.isVisible(), true, 'first Escape only dismisses tooltip');
    await argumentsHint.blur();
    await argumentsHint.focus();
    await titleTooltip.waitFor();
    await hints(false);
    assert.equal(await processDialog.locator('.settings-hint').count(), 0);
    assert.equal(await processDialog.locator('.settings-hint-trigger').count(), 0);
    assert.equal(await host.locator('.settings-hint-tooltip').count(), 0);
    assert.equal(
      await processDialog
        .getByText('文字列のJSON配列で指定します。例: ["ファイル名.txt", "--option"]', {
          exact: true,
        })
        .count(),
      0,
    );
    await processDialog.getByLabel('引数', { exact: true }).fill('{');
    await processDialog.getByLabel('引数', { exact: true }).press('Enter');
    await processDialog
      .getByRole('alert')
      .filter({ hasText: '文字列のJSON配列を指定してください。' })
      .waitFor();
    await processDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    checks.push(
      'modal title hints stay in the top layer and viewport, Escape preserves dialog; OFF removes hints but retains validation errors',
    );

    await hints(false);
    await select('Hint fixture');
    await host.getByText('Card description stays visible.', { exact: true }).waitFor();
    assert.equal(await host.locator('.settings-hint').count(), 0);
    await host.evaluate(() => window.dock.navigate('extensions'));
    await host
      .getByRole('complementary', { name: 'Applet一覧' })
      .getByRole('button', { name: /^Hint fixture/ })
      .click();
    await host.getByRole('tab', { name: '設定', exact: true }).click();
    await settingsPage(host);
    await host.getByText('Card description stays visible.', { exact: true }).waitFor();
    assert.equal(await host.locator('.settings-hint').count(), 0);
    await hints(true);
    await until(
      async () => (await host.locator('.settings-hint').count()) > 0,
      'detail hints restored',
    );
    checks.push('Applet settings and detail share the preference and retain card descriptions');

    await host.evaluate(() => window.dock.navigate('settings'));
    await settingsPage(host);
    await select('読み上げ');
    await hints(false);
    const models = host.getByRole('button', { name: 'モデル一覧を更新', exact: true });
    const preview = host.getByRole('heading', { name: '試聴', exact: true });
    // Empty choices isolate feedback from changes to the model selector itself.
    // Compare content coordinates so click-to-scroll does not count as a layout change.
    const position = () =>
      preview.evaluate((node) => {
        let top = node.getBoundingClientRect().top;
        for (let parent = node.parentElement; parent; parent = parent.parentElement)
          top += parent.scrollTop;
        return top;
      });
    const before = await position();
    await models.click();
    await until(() => modelResponse, 'model request');
    assert.equal(await models.isDisabled(), true);
    const during = await position();
    fs.writeFileSync(
      path.join(profile, 'feedback-layout.json'),
      JSON.stringify({ before, during }),
    );
    assert.ok(Math.abs(before - during) < 1, 'pending feedback must not move layout');
    assert.equal(await host.locator('.settings-feedback p:not(.sr-only)').count(), 0);
    modelResponse();
    await until(async () => !(await models.isDisabled()), 'model success');
    const after = await position();
    fs.writeFileSync(
      path.join(profile, 'feedback-layout.json'),
      JSON.stringify({ before, during, after }),
    );
    assert.ok(Math.abs(before - after) < 1, 'success feedback must not move layout');
    assert.equal(await host.locator('.settings-feedback p:not(.sr-only)').count(), 0);
    modelStatus = 404;
    await models.click();
    await until(() => modelResponse, 'failing model request');
    modelResponse();
    await host.locator('.tts-settings').getByRole('alert').waitFor();
    checks.push(
      'pending and success feedback do not shift layout; busy controls and failure errors remain',
    );

    for (const theme of ['light', 'dark']) {
      common = await appearance();
      await common.getByLabel('テーマ', { exact: true }).selectOption(theme);
      await settleSettings(host);
      assert.equal((await snapshot()).settings.value.host.theme, theme);
      for (const width of [1280, 760]) {
        await inspect(
          inspector,
          `(${(e, width) =>
            e.BrowserWindow.getAllWindows()
              .find((w) => !w.isDestroyed())
              .setSize(width, 900)})(${electronExpression},${width})`,
        );
        await until(
          () =>
            host.evaluate(async () => {
              const connection =
                document.querySelector('.settings-surface').dataset.settingsConnection;
              return (
                (await window.dock.settingsPage.get(connection)).content.hostWidth ===
                window.innerWidth
              );
            }),
          'resized viewport model',
        );
        await settleSettings(host);
        for (const visible of [true, false]) {
          await hints(visible);
          if (visible) {
            await common.getByRole('button', { name: 'テーマのヒント', exact: true }).hover();
            await titleTooltip.waitFor();
          }
          await host.screenshot({
            path: path.join(profile, `${theme}-${width}-${visible ? 'on' : 'off'}.png`),
          });
          assert.equal(
            await common.getByText('設定画面にヒントを表示します。', { exact: true }).count(),
            visible ? 1 : 0,
          );
          assert.ok(
            await common.getByRole('switch', { name: 'ヒントの表示', exact: true }).isVisible(),
          );
        }
      }
    }
    checks.push('light/dark at 1280/760 with hints ON/OFF; preference remains accessible');
    await stop();
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(profile, `settings-${require('node:os').hostname()}.json`)),
      ).host.showHints,
      false,
    );
    assert.notEqual(
      JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).host.showHints,
      false,
    );
    await launch();
    await appearance();
    assert.equal((await snapshot()).settings.value.host.showHints, false);
    assert.equal(await host.locator('.settings-hint').count(), 0);
    assert.equal(await host.locator('.settings-hint-trigger').count(), 0);
    assert.deepEqual(errors, []);
    checks.push('OFF survives an actual process restart; no renderer errors');
    success = true;
  } catch (error) {
    console.error(error);
    fs.writeFileSync(path.join(profile, 'error.txt'), error.stack || String(error));
    if (host) await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    if (modelResponse) modelResponse();
    try {
      await stop();
    } catch (error) {
      errors.push(String(error));
      success = false;
      process.exitCode = 1;
      if (child) child.kill();
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    const result = {
      success,
      checks,
      errors,
      profile,
      version: require('../package.json').version,
      portable: source ? hash(source) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
