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
}) {
  const hint = '＋で割り当てを追加します。';
  const card = (title) =>
    host.locator('.settings-section').filter({
      has: host.getByRole('heading', { name: title, exact: true, level: 2 }),
    });
  const field = (title) =>
    host.locator('.settings-field').filter({
      has: host
        .locator('.settings-field-label > .settings-title-with-hint > strong')
        .getByText(title, { exact: true }),
    });
  const description = (title) => field(title).locator('.settings-field-label > p');
  const mcpDescription =
    'MCP EventはChatGPT Work/Dotsのイベントトリガーとして使用します。MCPサーバーの設定と、Secure MCP Tunnel等によるChatGPTとの連携が必要です。';
  for (const theme of ['light', 'dark']) {
    await select('表示');
    await host.getByLabel('テーマ', { exact: true }).selectOption(theme);
    await until(async () => (await snapshot()).settings.value.host.theme === theme, 'theme save');
    for (const width of [1280, 760]) {
      await inspect(
        inspector,
        `${electronExpression}.BrowserWindow.getAllWindows()[0].setSize(${width},1000)`,
      );
      const spacing = [];
      for (const [page, title] of [
        ['ショートカットキー', 'ショートカットキー割り当て'],
        ['マウスジェスチャー', 'マウスジェスチャー割り当て'],
      ]) {
        await select(page);
        await hints(true);
        const section = card(title);
        assert.equal(await section.count(), 1);
        const trigger = section.getByRole('button', { name: title + 'のヒント', exact: true });
        await trigger.focus();
        const tooltip = host.locator('.settings-hint-tooltip:popover-open');
        await tooltip.waitFor();
        assert.equal(await tooltip.innerText(), hint);
        await host.keyboard.press('Escape');
        spacing.push(
          await section.evaluate((e) => {
            const content = e.querySelector(':scope > .settings-section-content');
            const style = getComputedStyle(content);
            const header = e.querySelector(':scope > header');
            const first = content.querySelector('.command-shortcut-tools').getBoundingClientRect();
            const rect = content.getBoundingClientRect();
            return {
              padding: [
                style.paddingTop,
                style.paddingRight,
                style.paddingBottom,
                style.paddingLeft,
              ],
              left: first.left - rect.left,
              right: rect.right - first.right,
              top: first.top - header.getBoundingClientRect().bottom,
            };
          }),
        );
        const before = (await snapshot()).settings.value;
        await section
          .getByRole('button', { name: 'Hint actionに割り当てを追加', exact: true })
          .click();
        const dialog = host.getByRole('dialog');
        await dialog.waitFor();
        await host.keyboard.press('Escape');
        await until(
          async () => (await host.locator('dialog[open]').count()) === 0,
          'assignment cancel',
        );
        assert.deepEqual((await snapshot()).settings.value, before);
        await hints(false);
        assert.equal(
          await section.getByRole('button', { name: title + 'のヒント', exact: true }).count(),
          0,
        );
        assert.equal(await section.getByRole('heading', { name: title, exact: true }).count(), 1);
        await hints(true);
        await trigger.waitFor();
        await host.locator('.settings-body').evaluate((e) => {
          e.scrollTop = 0;
        });
        await host.screenshot({
          path: path.join(profile, `assignment-${page}-${theme}-${width}.png`),
        });
      }
      assert.deepEqual(spacing[0].padding, spacing[1].padding);
      for (const side of ['left', 'right', 'top']) {
        assert(
          Math.abs(spacing[0][side] - spacing[1][side]) < 0.1,
          `both assignment cards use identical ${side} spacing`,
        );
      }
      await select('通知');
      await host.getByTestId('notification-delivery').locator(':scope > summary').click();
      const speech = host.getByTestId('notification-speech');
      await speech.locator(':scope > summary').click();
      assert.equal(await field('TTS設定').count(), 1);
      assert.equal(await field('読み上げ設定').count(), 0);
      assert.equal(await description('声').innerText(), '現在の声: fixture-voice');
      assert.equal(await description('速度').innerText(), '現在の速度: 1.25');
      for (const title of ['声', '速度'])
        assert.equal(await field(title).locator('.settings-field-control > p').count(), 0);
      assert.equal(await description('MCP連携設定').innerText(), mcpDescription);
      await hints(false);
      assert.equal(await description('声').isVisible(), true);
      assert.equal(await description('速度').isVisible(), true);
      assert.equal(await description('MCP連携設定').isVisible(), true);
      await host.screenshot({
        path: path.join(profile, `speech-descriptions-${theme}-${width}.png`),
      });
      await field('MCP連携設定').scrollIntoViewIfNeeded();
      await host.screenshot({ path: path.join(profile, `mcp-description-${theme}-${width}.png`) });
      await hints(true);
      checks.push(
        `assignment-titles-hints-spacing-and-notification-descriptions-${theme}-${width}`,
      );
    }
  }
  const voice = host.getByRole('switch', { name: '通知の声に共通設定を使う', exact: true });
  const speed = host.getByRole('switch', { name: '通知の速度に共通設定を使う', exact: true });
  await voice.click();
  const voiceInput = host.getByRole('combobox', { name: '通知用のボイスID', exact: true });
  await voiceInput.fill('notice-voice');
  await voiceInput.press('Enter');
  await speed.click();
  const speedInput = host.getByLabel('通知用の読み上げ速度', { exact: true });
  await speedInput.fill('1.75');
  await speedInput.press('Enter');
  await settleSettings(host);
  assert.equal(await description('声').innerText(), '現在の声: notice-voice');
  assert.equal(await description('速度').innerText(), '現在の速度: 1.75');
  assert.equal(
    (await snapshot()).settings.value.notificationPreferences.speech.voice,
    'notice-voice',
  );
  assert.equal((await snapshot()).settings.value.notificationPreferences.speech.speed, 1.75);
  await voice.click();
  await speed.click();
  await settleSettings(host);
  assert.equal(await description('声').innerText(), '現在の声: fixture-voice');
  assert.equal(await description('速度').innerText(), '現在の速度: 1.25');
  assert.equal(await host.getByLabel('通知用のボイスID', { exact: true }).count(), 0);
  assert.equal(await host.getByLabel('通知用の読み上げ速度', { exact: true }).count(), 0);
  checks.push(
    'notification-voice-speed-overrides-save-and-inheritance-restores-effective-descriptions',
  );
  await field('TTS設定').getByRole('button', { name: '設定を開く', exact: true }).click();
  await host.getByRole('heading', { name: 'TTS', exact: true, level: 1 }).waitFor();
  await select('通知');
  await card('通知の受け取り方').locator(':scope > summary').click();
  await field('MCP連携設定').getByRole('button', { name: '設定を開く', exact: true }).click();
  await host.getByRole('heading', { name: 'MCPサーバー', exact: true, level: 1 }).waitFor();
  checks.push('notification-TTS-and-MCP-settings-links-retain-destinations');
  for (const [page, title] of [
    ['ショートカットキー', 'ショートカットキー割り当て'],
    ['マウスジェスチャー', 'マウスジェスチャー割り当て'],
  ]) {
    const search = host.getByRole('combobox', { name: '設定を検索', exact: true });
    await search.fill(title);
    await host.getByRole('option').filter({ hasText: title }).first().click();
    await card(title).waitFor();
    await host.getByRole('heading', { name: page, exact: true, level: 1 }).waitFor();
    await search.fill('');
  }
  checks.push('renamed-assignment-search-items-reveal-existing-anchors');
};
