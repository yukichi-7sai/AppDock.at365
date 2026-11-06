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
      await select('通知');
      const delivery = host.getByTestId('notification-delivery');
      if ((await delivery.getAttribute('open')) === null)
        await delivery.locator(':scope > summary').click();
      const speech = host.getByTestId('notification-speech');
      if ((await speech.getAttribute('open')) === null)
        await speech.locator(':scope > summary').click();
      assert.equal(await field('音声生成AI').count(), 1);
      assert.equal(await field('読み上げ設定').count(), 0);
      for (const title of ['使用する音声サーバー', '通知用の話し方'])
        assert.equal(await field(title).locator('.settings-field-control > p').count(), 0);
      assert.equal(await description('MCP連携設定').innerText(), mcpDescription);
      await hints(false);
      assert.equal(
        await host.getByLabel('使用する音声サーバー', { exact: true }).isVisible(),
        true,
      );
      assert.equal(await host.getByLabel('通知用の話し方', { exact: true }).isVisible(), true);
      assert.equal(await description('MCP連携設定').isVisible(), true);
      await host.screenshot({
        path: path.join(profile, `speech-descriptions-${theme}-${width}.png`),
      });
      await field('MCP連携設定').scrollIntoViewIfNeeded();
      await host.screenshot({ path: path.join(profile, `mcp-description-${theme}-${width}.png`) });
      await hints(true);
      checks.push(`notification-server-instructions-hints-and-descriptions-${theme}-${width}`);
    }
  }
  const connection = host.getByLabel('使用する音声サーバー', { exact: true });
  const instructions = host.getByLabel('通知用の話し方', { exact: true });
  await connection.selectOption('default');
  await instructions.fill('通知向けに落ち着いて');
  await instructions.press('Enter');
  await settleSettings(host);
  assert.deepEqual((await snapshot()).settings.value.notificationPreferences.speech, {
    connectionId: 'default',
    instructions: '通知向けに落ち着いて',
  });
  await connection.selectOption('');
  await instructions.fill('');
  await instructions.press('Enter');
  await settleSettings(host);
  assert.equal(
    (await snapshot()).settings.value.notificationPreferences?.speech?.connectionId,
    undefined,
  );
  assert.equal(
    (await snapshot()).settings.value.notificationPreferences?.speech?.instructions,
    undefined,
  );
  assert.equal(await host.getByLabel('通知用のボイスID', { exact: true }).count(), 0);
  checks.push('notification-server-and-instructions-save-and-reset-independently');
  await field('音声生成AI').getByRole('button', { name: '設定を開く', exact: true }).click();
  await host.getByRole('heading', { name: '音声生成AI', exact: true, level: 1 }).waitFor();
  await select('通知');
  const delivery = host.getByTestId('notification-delivery');
  if ((await delivery.getAttribute('open')) === null)
    await delivery.locator(':scope > summary').click();
  await field('MCP連携設定').getByRole('button', { name: '設定を開く', exact: true }).click();
  await host.getByRole('heading', { name: 'MCPサーバー', exact: true, level: 1 }).waitFor();
  checks.push('notification-TTS-and-MCP-settings-links-retain-destinations');
};
