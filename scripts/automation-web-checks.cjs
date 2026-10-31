const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async function ({
  page,
  browser,
  client,
  call,
  until,
  togglePermission,
  profile,
  fixtureId,
  fixtureRoot,
  webId,
  url,
}) {
  const read = () => call(client, 'appdock_get_settings', { appletId: webId });
  const execute = (name) => call(client, 'appdock_execute_command', { id: `${webId}.${name}` });
  const sdk = async (method, params = {}) => {
    fs.writeFileSync(
      path.join(fixtureRoot, 'api-request.json'),
      JSON.stringify({ method, params }),
    );
    await page.evaluate((id) => window.dock.executeCommand(id), `${fixtureId}.web-api-probe`);
    return JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'api-reply.json'), 'utf8'));
  };
  const original = await read();
  assert.deepEqual(Object.keys(original.values), ['name', 'display']);
  assert.deepEqual(
    Object.keys((await call(client, 'appdock_get_settings_schema', { appletId: webId })).fields),
    ['name', 'display'],
  );
  const catalog = await call(client, 'appdock_list_commands');
  for (const name of ['open', 'back', 'forward', 'reload', 'home'])
    assert.ok(catalog.commands.some((c) => c.id === `${webId}.${name}`));
  assert.deepEqual((await sdk('settings.get', { appletId: webId })).value.values, original.values);
  await execute('open');
  const web = await until(
    () =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url() === url),
    'web target',
  );
  await web.getByRole('link', { name: 'Next', exact: true }).click();
  await until(() => web.url() === url + 'second', 'second page');
  assert.equal((await sdk('commands.execute', { id: `${webId}.back` })).ok, true);
  await until(() => web.url() === url, 'SDK back');
  assert.equal((await sdk('commands.execute', { id: `${webId}.forward` })).ok, true);
  await until(() => web.url() === url + 'second', 'SDK forward');
  const visit = await web.locator('#visit').textContent();
  await execute('reload');
  await until(
    async () => (await web.locator('#visit').textContent()) !== visit,
    'MCP reload observed',
  );
  await execute('home');
  await until(() => web.url() === url, 'MCP home observed');
  assert.equal(
    await web.evaluate(() => typeof window.dock),
    'undefined',
    'remote page has no host API',
  );
  await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  const file = require('./test-settings.cjs').file(profile, 'settings.json'),
    bytes = fs.readFileSync(file, 'utf8');
  const update = async (changes, extra = {}) =>
    call(client, 'appdock_execute_command', {
      id: `${webId}.settings.update`,
      args: { changes, expectedRevision: (await read()).revision, ...extra },
    });
  assert.equal(
    (await update({ name: 'Changed Web fixture', display: 'window' }, { dryRun: true })).completion,
    'validated',
  );
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  const denied = await client.callTool({
    name: 'appdock_execute_command',
    arguments: {
      id: `${webId}.settings.update`,
      args: {
        changes: { name: 'Partial', url: 'https://not-allowed.example' },
        expectedRevision: original.revision,
      },
    },
  });
  assert.equal(denied.structuredContent.code, 'INVALID_ARGUMENT');
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  await update({ name: 'Changed Web fixture', display: 'window' });
  assert.deepEqual((await read()).values, { name: 'Changed Web fixture', display: 'window' });
  await until(
    async () =>
      (await page.evaluate(() => window.dock.snapshot())).extensions.some(
        (a) => a.id === webId && a.displayName === 'Changed Web fixture',
      ),
    'snapshot renamed',
  );
  assert.equal(web.url(), url, 'same document survives display change');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.extensions[webId], undefined);
  assert.equal(saved.webApplets.items.find((a) => a.id === webId).url, url);
  await togglePermission('Codexからの設定変更を許可する');
  const blocked = await client.callTool({
    name: 'appdock_execute_command',
    arguments: {
      id: `${webId}.settings.update`,
      args: { changes: original.values, expectedRevision: (await read()).revision },
    },
  });
  assert.equal(blocked.structuredContent.code, 'WRITE_DISABLED');
  const back = await sdk('commands.execute', {
    id: `${webId}.settings.update`,
    args: { changes: original.values, expectedRevision: (await read()).revision },
  });
  assert.equal(
    back.value.completion,
    'settingsSaved',
    'default Applet permission independent from MCP',
  );
  assert.deepEqual((await read()).values, original.values);
  const grants = (await page.evaluate(() => window.dock.snapshot())).appletApi.permissions;
  await page.evaluate(() => window.dock.setAppletApiPermissions({}));
  assert.equal((await sdk('settings.get', { appletId: webId })).code, 'API_DISABLED');
  await page.evaluate((p) => window.dock.setAppletApiPermissions(p), grants);
  await togglePermission('Codexからの設定変更を許可する');
};
