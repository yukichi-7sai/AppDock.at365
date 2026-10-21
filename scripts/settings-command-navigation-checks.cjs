const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');
module.exports = async ({ host, select, snapshot, until, profile, checks }) => {
  const id = 'appdock.custom.00000000-0000-0000-0000-000000000002';
  const row = (command) => host.locator(`[data-shortcut-command="${command}"]`);
  const customRow = (title) =>
    host
      .locator('.custom-commands-settings tbody tr')
      .filter({ has: host.getByText(title, { exact: true }) });
  const move = async (from, title, page) => {
    await from.getByRole('button', { name: `${title}の${page}を開く`, exact: true }).click();
    await host.getByRole('heading', { level: 1, name: page, exact: true }).waitFor();
    await until(
      async () =>
        (await host.locator('.command-provider-filter').filter({ hasText: title }).count()) === 1,
      'command target filter',
    );
  };
  const samples = [];
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 760]) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await host.setViewportSize({ width, height: 1000 });
      await select('タスクトレイ');
      const tray = await host.locator('.tray-tree').evaluate((e) => ({
        border: getComputedStyle(e).borderWidth,
        padding: getComputedStyle(e).padding,
        fixed: e.querySelectorAll('.tray-fixed').length,
        text: e.textContent,
      }));
      assert.equal(tray.border, '0px');
      assert.equal(tray.padding, '0px');
      assert.equal(tray.fixed, 0);
      await host.screenshot({ path: path.join(profile, `tray-edit-${theme}-${width}.png`) });
      assert(!tray.text.includes('設定…'));
      assert(!tray.text.includes('終了'));
      const preview = host.locator('.tray-preview');
      assert(await preview.getByText('設定…', { exact: true }).count());
      assert(await preview.getByText('終了', { exact: true }).count());
      await select('Applet管理');
      assert.deepEqual(await host.locator('.applet-management thead th').allTextContents(), [
        'Applet名＋',
        'バージョン',
        '有効',
        '状態',
        '操作',
        '移動',
      ]);
      const applet = host.locator('[data-applet-id="fixture.hints"]');
      assert.equal(
        await applet.locator('td').last().locator('.applet-management-links').count(),
        1,
      );
      const icons = {};
      for (const title of ['ショートカット', 'マウスジェスチャー'])
        icons[title] = await applet
          .getByRole('button', { name: `Hint fixtureの${title}を開く`, exact: true })
          .locator('svg')
          .innerHTML();
      await select('ショートカット');
      for (const title of ['ショートカット', 'マウスジェスチャー', 'カスタムコマンド']) {
        const index = host
          .locator('.settings-categories')
          .getByRole('button', { name: title, exact: true });
        const geometry = await index.evaluate((e) => {
          const r = e.getBoundingClientRect(),
            s = e.querySelector('.settings-index-icon').getBoundingClientRect();
          return { gap: r.right - s.right, padding: parseFloat(getComputedStyle(e).paddingRight) };
        });
        assert(Math.abs(geometry.gap - geometry.padding) < 1);
        if (icons[title]) assert.equal(await index.locator('svg').innerHTML(), icons[title]);
      }
      assert.deepEqual(await host.locator('.applet-shortcut-overview th').allTextContents(), [
        'コマンド',
        '割り当て',
        '移動',
      ]);
      assert.equal(
        await row('fixture.hints.run').getByRole('img', { name: '外部公開コマンド' }).count(),
        1,
      );
      assert.equal(
        await row('appdock.quit').getByRole('img', { name: '外部公開コマンド' }).count(),
        0,
      );
      assert(
        await row('fixture.hints.run')
          .getByRole('button', { name: 'Hint actionのカスタムコマンドを開く', exact: true })
          .isDisabled(),
      );
      const geometry = await row('fixture.hints.run')
        .locator('.applet-shortcut-pair')
        .evaluateAll((elements) =>
          elements.map((e) => {
            const a = e.querySelector('.applet-shortcut-edit').getBoundingClientRect(),
              b = e.querySelector('.gesture-menu-trigger svg').getBoundingClientRect();
            return { delta: Math.abs(a.top + a.height / 2 - b.top - b.height / 2) };
          }),
        );
      assert.equal(geometry.length, 2);
      assert(geometry.every((g) => g.delta < 1));
      await row('fixture.hints.run').scrollIntoViewIfNeeded();
      await host.screenshot({ path: path.join(profile, `bindings-center-${theme}-${width}.png`) });
      await row('fixture.hints.run').locator('.gesture-menu-trigger').first().click();
      await host.getByRole('menu').waitFor();
      await host.keyboard.press('Escape');
      await move(row('fixture.hints.run'), 'Hint action', 'マウスジェスチャー');
      assert.equal(await host.locator('[data-shortcut-command]').count(), 1);
      assert.equal(
        await row('fixture.hints.run').getByText('未割り当て', { exact: true }).count(),
        1,
      );
      await host.getByRole('button', { name: 'Hint actionの絞り込みを解除', exact: true }).click();
      assert((await host.locator('[data-shortcut-command]').count()) > 1);
      await select('カスタムコマンド');
      assert.deepEqual(await host.locator('.custom-commands-settings thead th').allTextContents(), [
        '名前＋',
        '種類',
        '提供元',
        '有効',
        '操作',
        '移動',
      ]);
      assert.equal(
        await customRow('Custom 1').getByRole('img', { name: '外部公開コマンド' }).count(),
        0,
      );
      assert.equal(
        await customRow('Custom 2').getByRole('img', { name: '外部公開コマンド' }).count(),
        1,
      );
      assert.equal(
        await host
          .locator('.custom-commands-settings .settings-list-actions-heading')
          .evaluate((e) => getComputedStyle(e).textAlign),
        'left',
      );
      await move(customRow('Custom 2'), 'Custom 2', 'ショートカット');
      assert.equal(await host.locator('[data-shortcut-command]').count(), 1);
      assert.equal(await row(id).count(), 1);
      await move(row(id), 'Custom 2', 'マウスジェスチャー');
      assert.equal(await host.locator('[data-shortcut-command]').count(), 1);
      assert.equal(await row(id).count(), 1);
      await move(row(id), 'Custom 2', 'カスタムコマンド');
      assert.equal(await host.locator('.custom-commands-settings tbody tr').count(), 1);
      await host.getByRole('switch', { name: 'Custom 2を有効にする' }).click();
      await settleSettings(host);
      let saved = (await snapshot()).settings.value.customCommands.items;
      assert.equal(saved[0].enabled, true);
      assert.equal(saved[1].enabled, false);
      await host.getByRole('switch', { name: 'Custom 2を有効にする' }).click();
      await settleSettings(host);
      await host.getByRole('button', { name: 'Custom 2を編集', exact: true }).click();
      const dialog = host.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(
        await dialog.getByRole('textbox', { name: '名前', exact: true }).inputValue(),
        'Custom 2',
      );
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      await host.getByRole('button', { name: 'Custom 2の絞り込みを解除', exact: true }).click();
      assert.equal(await host.locator('.custom-commands-settings tbody tr').count(), 2);
      await host.screenshot({
        path: path.join(profile, `command-navigation-${theme}-${width}.png`),
      });
      samples.push({ theme, width, tray, geometry });
      checks.push(
        `tray-index-publication-command-navigation-center-filtered-toggle-${theme}-${width}`,
      );
    }
  await select('ショートカット');
  await move(row(id), 'Custom 2', 'マウスジェスチャー');
  await select('マウスジェスチャー');
  assert(
    (await host.locator('[data-shortcut-command]').count()) > 1,
    'normal index selection clears command target',
  );
  checks.push('index-navigation-clears-command-target-without-saving-or-executing');
  fs.writeFileSync(path.join(profile, 'command-navigation.json'), JSON.stringify(samples, null, 2));
};
