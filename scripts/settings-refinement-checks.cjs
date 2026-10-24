const assert = require('node:assert/strict');
const path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');

module.exports = async function ({
  host,
  select,
  hints,
  snapshot,
  until,
  inspect,
  inspector,
  electronExpression,
  profile,
  checks,
  updateRequests,
  portable,
}) {
  const expected = [
    '表示',
    '一般',
    'Applet管理',
    '通知',
    'リボン',
    'タスクトレイ',
    'ショートカットキー',
    'マウスジェスチャー',
    'タッチパッドジェスチャー',
    'カスタムコマンド',
    'Webアカウント',
    '操作の許可',
    'TTS',
    'AI',
    'MCPサーバー',
    'MCPクライアント',
    'AppDockについて',
  ];
  assert.deepEqual(
    await host.locator('[aria-label="本体の設定"] > button').allTextContents(),
    expected,
  );
  checks.push('exact-index-order-and-names-without-image-library');
  const invoke = (name, args = []) =>
    host.evaluate(
      async ({ name, args }) => {
        const id = document.querySelector('.settings-surface').dataset.settingsConnection;
        const model = await window.dock.settingsPage.get(id);
        return window.dock.settingsPage.act(id, {
          id: model.id,
          type: 'settings',
          sessionId: model.content.editing.sessionId,
          editRevision: model.content.editing.editRevision,
          operationId: crypto.randomUUID(),
          operation: { kind: 'invoke', actionId: model.content.actions[name], args },
        });
      },
      { name, args },
    );
  for (const theme of ['light', 'dark']) {
    await select('表示');
    await host.getByLabel('テーマ', { exact: true }).selectOption(theme);
    await until(async () => (await snapshot()).settings.value.host.theme === theme, 'theme save');
    for (const width of [1280, 760]) {
      await inspect(
        inspector,
        `${electronExpression}.BrowserWindow.getAllWindows()[0].setSize(${width},1000)`,
      );
      for (const [title, label, dialogTitle, field] of [
        ['AI', 'AIサーバーを追加', 'AIサーバーの追加', 'AI接続の名前'],
        ['カスタムコマンド', 'コマンドを追加', 'カスタムコマンドの追加', '名前'],
        ['MCPクライアント', '接続先を追加', 'MCP接続先の追加', '名前'],
      ]) {
        await select(title);
        const add = host.getByRole('button', { name: label, exact: true });
        assert.equal(await add.count(), 1);
        assert.equal(await add.isEnabled(), true);
        const geometry = await add.evaluate((button) => {
          const heading = button.closest('th');
          const rect = button.getBoundingClientRect();
          return {
            inHeader: !!heading,
            text: heading?.textContent,
            width: rect.width,
            height: rect.height,
            visible: rect.width > 0 && rect.height > 0,
          };
        });
        assert(geometry.inHeader && geometry.visible);
        assert.equal(geometry.width, 30);
        assert.equal(geometry.height, 30);
        assert.match(geometry.text, title === 'AI' ? /サーバー/ : /名前/);
        const before = (await snapshot()).settings.value;
        await add.click();
        const dialog = host.getByRole('dialog');
        await dialog.waitFor();
        // Assert the actual add dialog opened, independent of whether it says server or connection.
        assert.match(
          await dialog.innerText(),
          title === 'AI' ? /AI.*追加/ : new RegExp(dialogTitle),
        );
        const name = dialog.getByLabel(field, { exact: true });
        await name.fill('Temporary draft');
        await name.press('Tab');
        await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
        await until(
          async () => (await host.locator('dialog[open]').count()) === 0,
          'dialog closed',
        );
        assert.deepEqual((await snapshot()).settings.value, before, 'cancel preserves settings');
        await until(
          () => add.evaluate((button) => button === document.activeElement),
          'add focus restored',
        );
        await host.screenshot({
          path: path.join(profile, `refinement-${title}-${theme}-${width}.png`),
        });
      }
      await select('操作の許可');
      assert.deepEqual(await host.locator('.permission-table thead th').allTextContents(), [
        '操作',
        'Applet',
        'MCP',
      ]);
      assert.equal(
        await host.locator('.permission-connection, .permission-save-status').count(),
        0,
      );
      assert.equal(
        await host.getByText('変更は保存ボタンを押さずに保存されます。', { exact: true }).count(),
        0,
      );
      assert.equal(await host.locator('.permission-warning-icon').count(), 6);
      assert.equal(await host.locator('.permission-fixed').getByRole('switch').isDisabled(), true);
      await host.screenshot({
        path: path.join(profile, `refinement-permissions-${theme}-${width}.png`),
      });
      for (const title of ['ショートカットキー', 'マウスジェスチャー']) {
        await select(title);
        assert.equal(await host.locator('.applet-shortcut-notice').count(), 0);
        assert.equal(
          await host.getByText(/と条件をクリックして編集・＋で割り当てを追加/).count(),
          0,
        );
        assert(
          await host
            .getByRole('button', { name: 'Hint actionに割り当てを追加', exact: true })
            .isEnabled(),
        );
      }
      checks.push(`header-add-cancel-focus-permissions-bindings-${theme}-${width}`);
    }
  }
  for (const title of ['TTS', 'MCPサーバー', 'MCPクライアント']) await select(title);
  await select('操作の許可');
  const appletRead = host
    .locator('.permission-table tbody tr')
    .first()
    .locator('td[data-caller="Applet"]')
    .getByRole('switch');
  const original = await appletRead.getAttribute('aria-checked');
  for (const enabled of [original !== 'true', original === 'true']) {
    await appletRead.click();
    await until(
      async () =>
        (await appletRead.getAttribute('aria-checked')) === String(enabled) &&
        !(await appletRead.isDisabled()),
      'permission save',
    );
  }
  for (const enabled of [false, true]) {
    await hints(enabled);
    assert.equal(await host.locator('.permission-connection, .permission-save-status').count(), 0);
  }
  checks.push('renamed-pages-and-permission-save-roundtrip-with-hints-on-off');
  await select('Applet管理');
  const check = host.getByRole('button', { name: 'すべてのAppletの更新を確認', exact: true });
  assert.equal(await check.count(), 1);
  assert.match(await check.locator('..').textContent(), /バージョン/);
  assert.equal(await host.locator('.applet-management tbody .applet-update-check').count(), 0);
  assert.match(
    await host
      .getByRole('button', { name: 'Hint fixtureを再起動', exact: true })
      .locator('svg path')
      .getAttribute('d'),
    /M12 2v10/,
  );
  await host.getByRole('searchbox', { name: 'Appletを検索', exact: true }).fill('Hint fixture');
  await host.getByRole('searchbox', { name: 'Appletを検索', exact: true }).press('Enter');
  assert.equal(await host.locator('[data-applet-id]').count(), 1);
  await check.click();
  await until(async () => {
    const state = (await snapshot()).updates;
    return (
      !state.busy &&
      ['fixture.hints', 'fixture.other'].every((id) =>
        state.results.some((r) => r.id === id && r.checkedAt),
      )
    );
  }, 'all Applets checked');
  assert.deepEqual(updateRequests, ['fixture.hints', 'fixture.other']);
  assert.equal(
    (await snapshot()).updates.results.some((r) => r.id === 'host'),
    false,
  );
  assert.equal(await host.locator('[data-applet-id="fixture.hints"] time').count(), 1);
  checks.push('single-header-check-includes-filtered-and-disabled-applets-excludes-host');
  if (portable) {
    const response = await invoke('installUpdates', ['applets']);
    assert(!response.result?.error, JSON.stringify(response.result));
    assert.equal((await snapshot()).updates.phase, '適用できる更新はありません。');
    assert.equal(await host.getByText('適用できる更新はありません。', { exact: true }).count(), 0);
    checks.push('no-applicable-update-message-omitted-from-management');
  }
  await settleSettings(host);
  await host.screenshot({ path: path.join(profile, 'refinement-management.png') });
};
