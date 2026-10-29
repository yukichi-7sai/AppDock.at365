const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
module.exports = async ({ page, client, local, checks, tool, value, until }) => {
  const tools = JSON.stringify((await client.listTools()).tools),
    targets = (await value('appdock_settings_list_targets', { limit: 100 })).items;
  const ai = targets.find(
    (target) => target.category === 'ai' && target.title === 'Service fixture',
  );
  assert(ai);
  const read = (targetId, keys) =>
    value('appdock_settings_get_values', { targetId, ...(keys ? { keys } : {}) });
  const vals = async (targetId) =>
    Object.fromEntries(
      (await read(targetId)).fields
        .filter((field) => field.hasValue)
        .map((field) => [field.key, field.value]),
    );
  const request = async (targetId, operations, dryRun = false) => {
    const before = await read(targetId);
    return {
      targetId,
      operations,
      dryRun,
      expectedRevision: before.revision,
      expectedSchemaRevision: before.schemaRevision,
      requestId: randomUUID(),
    };
  };
  const apply = async (targetId, operations) =>
    value('appdock_settings_apply', await request(targetId, operations));
  const snapshot = () => page.evaluate(() => window.dock.snapshot());
  const select = async (name) => {
    await page.evaluate(() => window.dock.navigate('settings'));
    await page.getByRole('button', { name, exact: true }).click();
  };
  const invoke = (name, args = []) =>
    page.evaluate(
      async ({ name, args }) => {
        const id = document.querySelector('.settings-surface').dataset.settingsConnection,
          model = await window.dock.settingsPage.get(id);
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
  const tts = 'service.tts',
    before = await read(tts),
    sharedFile = path.join(path.dirname(local), 'settings.json'),
    sharedBefore = fs.readFileSync(sharedFile, 'utf8');
  const preview = await value(
    'appdock_settings_apply',
    await request(tts, [{ kind: 'set', changes: { defaultSpeed: 1.5 } }], true),
  );
  assert.equal(preview.completion, 'validated');
  assert.equal((await read(tts)).revision, before.revision);
  assert.equal(fs.readFileSync(sharedFile, 'utf8'), sharedBefore);
  await apply(tts, [{ kind: 'set', changes: { defaultSpeed: 1.75, model: 'mcp-model' } }]);
  await select('TTS');
  await until(
    async () => (await page.getByLabel('読み上げ速度', { exact: true }).inputValue()) === '1.75',
    'TTS UI received MCP save',
  );
  await page.getByLabel('読み上げ速度', { exact: true }).fill('1.25');
  await page.getByLabel('読み上げ速度', { exact: true }).press('Tab');
  await until(async () => (await vals(tts)).defaultSpeed === 1.25, 'TTS UI save reached MCP');
  await invoke('ttsSetKey', ['PRIVATE_TTS_SERVICE_FIXTURE']);
  const ttsFile = path.join(local, 'tts-key.json'),
    ttsBytes = fs.readFileSync(ttsFile, 'utf8');
  assert(!ttsBytes.includes('PRIVATE_TTS_SERVICE_FIXTURE'));
  for (const dryRun of [true, false])
    assert.equal(
      (
        await tool(
          'appdock_settings_apply',
          await request(
            tts,
            [{ kind: 'set', changes: { baseUrl: 'http://127.0.0.1:8/v1' } }],
            dryRun,
          ),
        )
      ).structuredContent.code,
      'LOCAL_ACTION_REQUIRED',
    );
  await apply(tts, [{ kind: 'set', changes: { model: 'key-preserved-model' } }]);
  assert.equal(fs.readFileSync(ttsFile, 'utf8'), ttsBytes);
  assert.equal(JSON.stringify(await read(tts)).includes('PRIVATE_TTS'), false);
  checks.push(
    'service TTS dryRun/no-write, MCP and UI save agree, local encrypted key preserved and remote endpoint rebinding denied',
  );
  await apply('service.ai', [
    {
      kind: 'set',
      changes: { commonPrompt: 'MCP policy', defaultConnectionId: 'service-fixture' },
    },
  ]);
  await apply(ai.targetId, [
    { kind: 'set', changes: { defaultModel: 'MCP model', defaultMaxOutputTokens: 2048 } },
  ]);
  await select('AI');
  await until(
    async () =>
      (await page.getByLabel('共通プロンプト', { exact: true }).inputValue()) === 'MCP policy',
    'AI UI received MCP save',
  );
  await page.getByLabel('共通プロンプト', { exact: true }).fill('UI policy');
  await page.getByLabel('共通プロンプト', { exact: true }).press('Tab');
  await until(
    async () => (await vals('service.ai')).commonPrompt === 'UI policy',
    'AI UI save reached MCP',
  );
  const original = (await snapshot()).settings.value.ai.connections[0],
    status = await page.evaluate(async () => {
      const id = document.querySelector('.settings-surface').dataset.settingsConnection;
      return (await window.dock.settingsPage.get(id)).content.auxiliary.ai.connections[0];
    });
  await invoke('aiSaveConnection', [
    { ...original, authentication: 'bearer' },
    original,
    'PRIVATE_AI_SERVICE_FIXTURE',
    status.keyRevision,
  ]);
  const aiFile = path.join(local, 'ai-keys.json'),
    aiBytes = fs.readFileSync(aiFile, 'utf8');
  assert(!aiBytes.includes('PRIVATE_AI_SERVICE_FIXTURE'));
  for (const dryRun of [true, false])
    for (const changes of [{ baseUrl: 'http://127.0.0.1:8/v1' }, { authentication: 'none' }])
      assert.equal(
        (
          await tool(
            'appdock_settings_apply',
            await request(ai.targetId, [{ kind: 'set', changes }], dryRun),
          )
        ).structuredContent.code,
        'LOCAL_ACTION_REQUIRED',
      );
  await apply(ai.targetId, [
    {
      kind: 'set',
      changes: { defaultModel: 'cipher-preserved-model', 'compatibility.temperature': 0.4 },
    },
  ]);
  await apply(ai.targetId, [{ kind: 'reset', keys: ['compatibility.temperature'] }]);
  assert.equal((await read(ai.targetId, ['compatibility.temperature'])).fields[0].hasValue, false);
  assert.equal(fs.readFileSync(aiFile, 'utf8'), aiBytes);
  assert(!/PRIVATE_|keyRevision|fingerprint/.test(JSON.stringify(await read(ai.targetId))));
  checks.push(
    'service AI common/connection fields agree with UI, optional reset, local credentials retained and binding/auth edits refused',
  );
  const notification = targets.find((target) =>
      target.targetId.startsWith('service.notification.'),
    ),
    current = (await snapshot()).settings.value.notificationPreferences?.overrides ?? [];
  await apply(notification.targetId, [
    { kind: 'set', changes: { targets: ['banner'], durationSeconds: 7, mcpEvents: true } },
  ]);
  assert.equal((await vals(notification.targetId)).durationSeconds, 7);
  assert.equal(
    (await apply(notification.targetId, [{ kind: 'set', changes: { targets: [] } }])).completion,
    'settingsSaved',
  );
  assert.deepEqual((await vals(notification.targetId)).targets, []);
  await apply(notification.targetId, [
    { kind: 'reset', keys: ['targets', 'durationSeconds', 'mcpEvents'] },
  ]);
  assert.deepEqual(
    (await snapshot()).settings.value.notificationPreferences?.overrides ?? [],
    current,
  );
  const speech = 'service.notifications.speech';
  await apply(speech, [{ kind: 'set', changes: { voice: 'separate voice', speed: 2 } }]);
  await apply(speech, [{ kind: 'reset', keys: ['voice', 'speed'] }]);
  assert.equal((await vals(speech)).speed, 1.25);
  assert.equal((await read(speech, ['speed'])).fields[0].inherited, true);
  assert.equal(JSON.stringify((await client.listTools()).tools), tools);
  checks.push(
    'service notification partial/reset editing preserves rules and other rows; speech falls back to TTS and tool definitions remain fixed',
  );
};
