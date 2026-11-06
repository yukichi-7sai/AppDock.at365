const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

module.exports = async ({
  page,
  section,
  client,
  configFile,
  profile,
  checks,
  until,
  authorization,
}) => {
  const status = async () =>
    (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state;
  const before = await status(),
    toml = fs.readFileSync(configFile);
  const headers = { Authorization: authorization };
  const tools = (await client.listTools()).tools;
  const settings = (await client.callTool({ name: 'appdock_get_settings', arguments: {} }))
    .structuredContent;
  const select = section.getByRole('combobox', { name: '接続範囲', exact: true });
  assert.equal(await select.inputValue(), 'local');
  await select.selectOption('network');
  await until(
    async () => (await status()).activeConnectionScope === 'network' && (await select.isEnabled()),
    'network scope applied',
  );
  const active = await status();
  assert.equal(active.endpoint, before.endpoint);
  assert.equal(active.codex.endpoint, before.codex.endpoint);
  assert.equal(active.codex.running, true);
  assert.equal(active.canCopyToken, true);
  assert.equal(
    await section.getByRole('button', { name: '接続トークンをコピー', exact: true }).isEnabled(),
    true,
  );
  assert.deepEqual(fs.readFileSync(configFile), toml);
  const connect = async (url) => {
    const result = new Client({ name: 'network-gui-regression', version: '1' });
    await result.connect(
      new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }),
    );
    return result;
  };
  const local = await connect(active.endpoint);
  try {
    const value = (await local.callTool({ name: 'appdock_get_settings', arguments: {} }))
      .structuredContent;
    assert.equal(value.revision, settings.revision);
    assert.equal(value.writable, settings.writable);
    assert((await status()).lastLocalClientAt);
  } finally {
    await local.close();
  }
  if (active.networkEndpoints.length) {
    const network = await connect(active.networkEndpoints[0]);
    try {
      assert.deepEqual((await network.listTools()).tools, tools);
      const value = (await network.callTool({ name: 'appdock_get_settings', arguments: {} }))
        .structuredContent;
      assert.equal(value.revision, settings.revision);
      assert((await status()).lastNetworkClientAt);
    } finally {
      await network.close();
    }
  }
  const names = section.getByRole('textbox', { name: '追加の接続先ホスト名', exact: true });
  await names.fill('https://invalid.example');
  await names.press('Tab');
  await until(
    async () =>
      (await names.isEnabled()) &&
      (await page.getByRole('alert').allTextContents()).some((text) => text.includes('DNS名だけ')),
    'hostname validation',
  );
  assert.equal((await status()).networkHostnames.length, 0);
  assert.equal(await names.inputValue(), 'https://invalid.example');
  await names.fill('DOCK.EXAMPLE.');
  await names.press('Tab');
  await until(
    async () =>
      (await status()).networkHostnames[0] === 'dock.example' && (await names.isEnabled()),
    'hostname saved',
  );
  assert.equal(await names.inputValue(), 'dock.example');
  const port = new URL(active.endpoint).port;
  const response = await fetch(active.endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      Host: `dock.example:${port}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });
  assert.equal(response.status, 200);
  await response.text();
  await section.getByRole('button', { name: 'このPC内の接続テスト', exact: true }).click();
  await until(async () => await select.isEnabled(), 'self test finished');
  const surface = page
    .context()
    .pages()
    .find((item) => item.url().startsWith('appdock://host/'));
  assert(surface, 'settings surface');
  await select.scrollIntoViewIfNeeded();
  await surface.screenshot({ path: path.join(profile, 'mcp-network.png') });
  await section
    .getByRole('button', { name: '接続トークンをコピー', exact: true })
    .scrollIntoViewIfNeeded();
  await surface.screenshot({ path: path.join(profile, 'mcp-network-endpoints.png') });
  const guidance = section.getByText('認証の設定例', { exact: true });
  await guidance.scrollIntoViewIfNeeded();
  assert((await section.innerText()).includes('MCP_BEARER_TOKEN'));
  assert((await section.innerText()).includes('Authorization'));
  assert((await section.innerText()).includes('Bearer <コピーしたトークン>'));
  await surface.screenshot({ path: path.join(profile, 'mcp-network-auth.png') });
  await select.selectOption('local');
  await until(
    async () => (await status()).activeConnectionScope === 'local' && (await select.isEnabled()),
    'local scope restored',
  );
  assert.deepEqual(fs.readFileSync(configFile), toml);
  assert.equal((await status()).endpoint, before.endpoint);
  assert.equal((await status()).networkEndpoints.length, 0);
  assert.deepEqual((await status()).networkHostnames, ['dock.example']);
  const restored = await connect(before.endpoint);
  try {
    assert.deepEqual((await restored.listTools()).tools, tools);
  } finally {
    await restored.close();
  }
  assert.equal((await status()).codex.endpoint, before.codex.endpoint);
  assert.deepEqual((await client.listTools()).tools, tools);
  checks.push(
    'network scope GUI, separate live Codex receiver and TOML, SDK loopback/NIC access, shared revision and host validation',
  );
};
