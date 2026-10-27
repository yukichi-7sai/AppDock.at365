const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHostApi } = require('../out/main/main/core/host-api');
const { queueSound } = require('../out/main/main/core/sounds');
const { ExtensionManager } = require('../out/main/main/core/extensions');
test('attention and file/audio APIs require capability and validate parameters', async () => {
  let changes = 0;
  const api = createHostApi(
    {},
    '',
    () => {},
    () => {},
    () => changes++,
  );
  const e = { state: 'running', manifest: { id: 'test', capabilities: [] } };
  for (const [method, args] of [
    ['host.tray.attention', { active: true }],
    ['host.ui.pickFile', { kind: 'json' }],
    ['host.audio.play', { file: '' }],
  ])
    await assert.rejects(api(e, method, args), /capabilities/);
  e.manifest.capabilities = ['tray-attention', 'file-dialog', 'audio'];
  await api(e, 'host.tray.attention', { active: false });
  assert.equal(changes, 0);
  await assert.rejects(api(e, 'host.tray.attention', { active: 'true' }), /boolean/);
  await assert.rejects(api(e, 'host.ui.pickFile', { kind: 'exe' }), /JSON/);
  await assert.rejects(
    api(e, 'host.audio.play', { file: 'https://example.test/a.wav' }),
    /WAVファイル名/,
  );
  await api(e, 'host.tray.attention', { active: true });
  assert.equal(e.attention, true);
  assert.equal(changes, 1);
  await api(e, 'host.tray.attention', { active: true });
  assert.equal(changes, 1);
  await api(e, 'host.tray.attention', { active: false });
  assert.equal(e.attention, false);
  assert.equal(changes, 2);
  await api(e, 'host.tray.attention', { active: false });
  assert.equal(changes, 2);
});
test('stopped and crashed extensions cannot leave attention active', async () => {
  const manager = new ExtensionManager({
    roots: [],
    settings: { value: { extensions: {} } },
    log: () => {},
  });
  const e = { state: 'running', manifest: { id: 'test' }, attention: true, commands: [], tray: [] };
  manager.items.set('test', e);
  manager.crashed(e, 'fixture');
  assert.equal(e.attention, false);
  e.attention = true;
  await manager.stop(e);
  assert.equal(e.attention, false);
});
test('sound rejects non-WAV paths and drops work for inactive extensions', async () => {
  queueSound(
    '',
    () => true,
    () => assert.fail('empty sound must be silent'),
  );
  assert.throws(() =>
    queueSound(
      'relative.wav',
      () => true,
      () => {},
    ),
  );
  assert.throws(() =>
    queueSound(
      'C:\\fixture.mp3',
      () => true,
      () => {},
    ),
  );
  queueSound(
    'C:\\missing.wav',
    () => false,
    () => assert.fail('inactive work should be dropped'),
  );
  await new Promise((resolve) => setImmediate(resolve));
});

test('typed notifications validate silent and preserve it for Windows without changing speech policy', async () => {
  let captured;
  const e = {
    state: 'running',
    runtimeSession: 'run',
    commands: [],
    manifest: {
      id: 'fixture',
      capabilities: ['notifications'],
      notificationTypes: [{ typeId: 'new-mail', levels: ['info'], defaultLevel: 'info' }],
    },
  };
  const typed = {
    publish: (_owner, _type, input) => {
      captured = input;
      return { status: 'accepted', notificationId: 'one' };
    },
  };
  const api = createHostApi(
    {},
    '',
    () => {},
    () => {},
    () => {},
    async () => {},
    undefined,
    undefined,
    {},
    () => typed,
  );
  const input = { typeId: 'new-mail', title: 'T', body: 'B', silent: true };
  assert.equal((await api(e, 'host.notifications.publish', input)).status, 'accepted');
  assert.equal(captured.windowsSilent, true);
  await assert.rejects(api(e, 'host.notifications.publish', { ...input, silent: 'true' }), /引数/);
  await api(e, 'host.notifications.publish', { typeId: 'new-mail', title: 'T', body: 'B' });
  assert.equal(captured.windowsSilent, false);
});

test('legacy API uses declared generated kind while retaining null, silence, global-off and owned command guards', async () => {
  let value = require('../out/main/shared/settings-schema').createDefaultSettings(),
    captured,
    effects = 0;
  const e = {
    manifest: { id: 'fixture', capabilities: ['notifications'] },
    state: 'running',
    commands: [{ id: 'fixture.open' }],
    runtimeSession: 'run',
    child: {},
  };
  const typed = {
    policy: () => ({ enabled: true }),
    publish: (owner, type, input, generation) => {
      captured = { owner, type, input, generation };
    },
  };
  const api = createHostApi(
    {
      get value() {
        return value;
      },
    },
    '',
    () => {},
    () => {},
    () => {},
    async () => effects++,
    undefined,
    undefined,
    {},
    () => typed,
  );
  assert.equal(
    await api(e, 'host.notifications.show', {
      title: 'T'.repeat(200),
      body: 'B'.repeat(700),
      silent: true,
      command: 'fixture.open',
    }),
    null,
  );
  assert.equal(captured.type, 'appdock.legacy');
  assert.equal(captured.input.title.length, 100);
  assert.equal(captured.input.body.length, 500);
  assert.equal(captured.input.windowsSilent, true);
  assert.equal(captured.input.historyText.body, 'Appletから通知がありました。');
  await captured.input.actions[0].run();
  assert.equal(effects, 1);
  e.runtimeSession = 'next';
  await assert.rejects(captured.input.actions[0].run(), /変わりました/);
  captured = undefined;
  value.host.notifications = false;
  assert.equal(await api(e, 'host.notifications.show', { title: 'T', body: 'B' }), null);
  assert.equal(captured.type, 'appdock.legacy');
  await assert.rejects(
    api(e, 'host.notifications.show', { title: 'T', body: 'B', command: 'foreign.open' }),
    /登録済み/,
  );
  const p = require('../out/main/shared/notification-types');
  const kind = p
    .notificationCatalog([
      { id: 'fixture', displayName: 'Fixture', state: 'stopped', capabilities: ['notifications'] },
    ])
    .find((t) => t.typeId === 'appdock.legacy');
  assert.equal(kind.defaultTargets[0], 'windows');
  assert.equal(kind.defaultDurationSeconds, null);
  assert.throws(() => p.parseNotificationTypes([kind]), /通知/);
});
