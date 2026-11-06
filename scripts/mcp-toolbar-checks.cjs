const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { until } = require('./page-test-host.cjs');

/** Shared toolbar, JSON editing and reset boundaries in the recovery fixture. */
module.exports = async function checkToolbar({ host, profile, deviceFile, localFile, repair }) {
  const read = () => JSON.parse(fs.readFileSync(deviceFile)).mcpClient;
  const original = read();
  const cipher = fs.readFileSync(localFile);
  const toolbar = host.getByTestId('settings-page-tools');
  const tabs = toolbar.getByTestId('mcp-settings-tabs');
  assert.deepEqual(await tabs.getByRole('button').allTextContents(), [
    '接続先',
    'MCPツールコマンド',
    'ツール確認',
    'JSON',
  ]);
  const select = (name) => tabs.getByRole('button', { name, exact: true }).click();
  const reset = async (tab, cancel = false) => {
    await select(tab);
    await toolbar
      .getByRole('button', {
        name: tab === 'JSON' ? 'このページを既定値に戻す' : 'このタブの設定を既定値に戻す',
        exact: true,
      })
      .click();
    const dialog = host.getByRole('dialog');
    if (tab === 'MCPツールコマンド' || tab === 'ツール確認')
      assert(!(await dialog.innerText()).includes('mcp-client-secrets.json'));
    await dialog
      .getByRole('button', { name: cancel ? 'キャンセル' : '既定値に戻す', exact: true })
      .click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const json = host.getByRole('textbox', { name: '設定JSON', exact: true });
  const save = async (block) => {
    await select('JSON');
    await json.fill(JSON.stringify({ mcpClient: block }, null, 2));
    await json.press('Tab');
    await until(() => JSON.stringify(read()) === JSON.stringify(block), 'JSON saved');
  };
  const command = {
    id: randomUUID(),
    title: 'JSON draft',
    description: '',
    enabled: false,
    automation: false,
    serverId: original.servers[0].id,
    toolName: 'echo',
    arguments: {},
    timeoutMs: 60000,
    toolBinding: null,
  };
  const block = { ...structuredClone(original), commands: [command] };
  block.servers[0].description = 'Edited in JSON';
  await save(block);
  assert.deepEqual(fs.readFileSync(localFile), cipher);
  const deviceBefore = fs.readFileSync(deviceFile);
  await json.fill('{');
  await json.press('Tab');
  await until(
    async () => (await host.locator('.settings-surface').innerText()).includes('JSON'),
    'invalid draft shown',
  );
  assert.equal(await json.inputValue(), '{');
  assert.deepEqual(fs.readFileSync(deviceFile), deviceBefore);
  await save(block);
  await host.screenshot({ path: path.join(profile, 'mcp-json-light.png') });
  await reset('MCPツールコマンド', true);
  assert.deepEqual(fs.readFileSync(deviceFile), deviceBefore);
  await reset('MCPツールコマンド');
  assert.deepEqual(read(), { ...block, commands: [] });
  assert.deepEqual(fs.readFileSync(localFile), cipher);
  await save(block);
  await select('ツール確認');
  await host.getByLabel('確認するMCP接続先', { exact: true }).selectOption(original.servers[0].id);
  await until(() => host.getByLabel('MCPツール', { exact: true }).isEnabled(), 'tools ready');
  await host.getByLabel('MCPツール', { exact: true }).selectOption('echo');
  await host.getByLabel('MCPツールの引数', { exact: true }).fill('{"message":"reset draft"}');
  const beforeTools = fs.readFileSync(deviceFile);
  await reset('ツール確認');
  assert.equal(await host.getByLabel('確認するMCP接続先', { exact: true }).inputValue(), '');
  assert.equal(await host.getByLabel('MCPツールの引数', { exact: true }).count(), 0);
  assert.deepEqual(fs.readFileSync(deviceFile), beforeTools);
  assert.deepEqual(fs.readFileSync(localFile), cipher);
  await reset('接続先');
  assert.deepEqual(read(), { ...block, servers: [] });
  assert.deepEqual(JSON.parse(fs.readFileSync(localFile)).entries, {});
  await save(block);
  await reset('JSON');
  assert.deepEqual(read(), { version: 1, servers: [], commands: [] });
  assert.deepEqual(JSON.parse(await json.inputValue()), {});
  await save(original);
  await select('接続先');
  await repair();
  await host.screenshot({ path: path.join(profile, 'mcp-toolbar-light.png') });
};
