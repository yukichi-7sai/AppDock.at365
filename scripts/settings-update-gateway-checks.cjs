const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  { randomUUID } = require('node:crypto');
module.exports = async ({
  page,
  client,
  profile,
  local,
  fixtureId,
  checks,
  tool,
  value,
  until,
}) => {
  const requests = [],
    tools = JSON.stringify((await client.listTools()).tools),
    version = require('../package.json').version;
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'host',
        id: 'host',
        version,
        payload: { file: 'AppDock.at365.exe', format: 'exe', sha256: 'a'.repeat(64), size: 20 },
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const source = `http://127.0.0.1:${server.address().port}/host.json`,
      targetId = 'service.updates',
      read = (id = targetId) => value('appdock_settings_get_values', { targetId: id });
    const request = async (id, operations, dryRun = false) => {
      const current = await read(id);
      return {
        targetId: id,
        operations,
        dryRun,
        expectedRevision: current.revision,
        expectedSchemaRevision: current.schemaRevision,
        requestId: randomUUID(),
      };
    };
    const apply = async (id, operations, dryRun = false) =>
      value('appdock_settings_apply', await request(id, operations, dryRun));
    const saved = () => JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
    const sharedBefore = fs.readFileSync(path.join(profile, 'settings.json')),
      aiBytes = fs.readFileSync(path.join(local, 'ai-keys.json')),
      ttsBytes = fs.readFileSync(path.join(local, 'tts-key.json'));
    const changes = {
      hostSource: source,
      checkHostOnAboutOpen: false,
      checkHostOnStartup: true,
      checkAppletsOnStartup: true,
      startupDelaySeconds: 45,
      notifyOnStartup: false,
      allowSameVersion: true,
    };
    const preview = await apply(targetId, [{ kind: 'set', changes }], true);
    assert.equal(preview.completion, 'validated');
    assert.equal(preview.applies.startupDelaySeconds, 'nextStart');
    assert.deepEqual(fs.readFileSync(path.join(profile, 'settings.json')), sharedBefore);
    await apply(targetId, [{ kind: 'set', changes }]);
    await page.evaluate(() => window.dock.navigate('settings'));
    await page.getByTestId('settings-nav:about').click();
    const section = page.getByTestId('update-settings');
    if ((await section.getAttribute('open')) === null) await section.locator('summary').click();
    const sourceField = page.getByTestId('update-setting-hostSource').getByRole('textbox'),
      delay = page.getByTestId('update-setting-startupDelaySeconds').getByRole('spinbutton');
    await until(
      async () =>
        (await sourceField.inputValue()) === source && (await delay.inputValue()) === '45',
      'update settings UI received MCP save',
    );
    await delay.fill('77');
    await delay.press('Tab');
    await until(
      async () =>
        (await read()).fields.find((field) => field.key === 'startupDelaySeconds').value === 77,
      'update delay UI save reached MCP',
    );
    assert.deepEqual(requests, []);
    await apply(targetId, [{ kind: 'set', changes: { checkHostOnAboutOpen: true } }]);
    await until(
      () => page.getByTestId('update-setting-checkHostOnAboutOpen').getByRole('switch').isChecked(),
      'about check preference enabled',
    );
    assert.deepEqual(requests, []);
    for (const command of ['appdock.updates.check', 'appdock.updates.installAll'])
      assert.equal(
        (await tool('appdock_execute_command', { id: command })).structuredContent.code,
        'EXECUTION_DISABLED',
      );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.deepEqual(requests, []);
    checks.push(
      'update settings real MCP dryRun/save and UI agree; enabling About or startup checks while open makes no request and keeps update execution separately denied',
    );

    await page.getByTestId('settings-nav:tts').click();
    await page.getByTestId('settings-nav:about').click();
    await until(async () => {
      const snapshot = await page.evaluate(() => window.dock.snapshot());
      return (
        requests.length === 1 &&
        !snapshot.updates.busy &&
        snapshot.updates.results.some((result) => result.id === 'host')
      );
    }, 'next About entry performs one normal metadata check');
    assert.deepEqual(requests, ['/host.json']);
    if ((await section.getAttribute('open')) === null) await section.locator('summary').click();
    await apply(targetId, [
      {
        kind: 'set',
        changes: {
          checkHostOnAboutOpen: false,
          checkHostOnStartup: false,
          checkAppletsOnStartup: false,
        },
      },
    ]);
    await sourceField.fill(source + '?from=ui');
    await sourceField.press('Tab');
    await until(
      async () =>
        (await read()).fields.find((field) => field.key === 'hostSource').value ===
        source + '?from=ui',
      'update source UI save reached MCP',
    );
    assert.deepEqual(requests, ['/host.json']);
    await apply(targetId, [
      {
        kind: 'reset',
        keys: ['hostSource', 'startupDelaySeconds', 'allowSameVersion', 'notifyOnStartup'],
      },
    ]);
    assert.equal((await read()).fields.find((field) => field.key === 'hostSource').inherited, true);
    const beforeBad = fs.readFileSync(path.join(profile, 'settings.json'));
    assert.equal(
      (
        await tool(
          'appdock_settings_apply',
          await request(targetId, [
            { kind: 'set', changes: { hostSource: 'https://user:secret@example.test/feed' } },
          ]),
        )
      ).structuredContent.code,
      'INVALID_ARGUMENT',
    );
    assert.deepEqual(fs.readFileSync(path.join(profile, 'settings.json')), beforeBad);
    assert.deepEqual(requests, ['/host.json']);
    checks.push(
      'About auto-check runs only on the next page entry; later source edits/reset do not fetch or install, and malformed sources are rejected before save',
    );

    const targets = (await value('appdock_settings_list_targets', { limit: 100 })).items,
      applet = targets.find(
        (target) => target.category === 'updates' && target.ownerId === fixtureId,
      );
    assert(applet);
    const inherited = await read(applet.targetId),
      defaultSource = inherited.fields[0].default;
    assert.equal(defaultSource, 'github:fixture-owner/settings-fixture');
    await apply(applet.targetId, [
      { kind: 'set', changes: { updateSource: source + '?applet=1' } },
    ]);
    await page.getByTestId('settings-nav:applet:' + fixtureId).click();
    const common = page.getByTestId('applet-common-settings');
    if ((await common.getAttribute('open')) === null) await common.locator('summary').click();
    const appletField = page.getByTestId('applet-update-source-' + fixtureId),
      input = appletField.getByRole('textbox');
    await until(
      async () => (await input.inputValue()) === source + '?applet=1',
      'Applet update source UI received MCP save',
    );
    await input.fill('');
    await input.press('Tab');
    await until(
      async () => (await read(applet.targetId)).fields[0].value === '',
      'Applet empty UI source persists explicit disable',
    );
    assert.equal(saved().extensions[fixtureId].updateSource, '');
    const stale = await request(applet.targetId, [
      { kind: 'set', changes: { updateSource: source } },
    ]);
    await apply(applet.targetId, [{ kind: 'reset', keys: ['updateSource'] }]);
    await until(
      async () => (await input.inputValue()) === defaultSource,
      'Applet source reset restores manifest inheritance',
    );
    assert.equal(Object.hasOwn(saved().extensions[fixtureId], 'updateSource'), false);
    assert.equal(
      (await tool('appdock_settings_apply', stale)).structuredContent.code,
      'REVISION_CONFLICT',
    );
    assert.equal((await value('appdock_get_applet', { id: fixtureId })).applet.state, 'running');
    assert.deepEqual(requests, ['/host.json']);
    assert.deepEqual(fs.readFileSync(path.join(local, 'ai-keys.json')), aiBytes);
    assert.deepEqual(fs.readFileSync(path.join(local, 'tts-key.json')), ttsBytes);
    assert.equal(JSON.stringify((await client.listTools()).tools), tools);
    checks.push(
      'Applet update source MCP/UI editing preserves explicit disable, manifest reset, running state and ciphertext; stale edits fail and tool definitions remain fixed',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};
