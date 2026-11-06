const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { newAiConnection } = require('../out/main/shared/ai');
const { newTtsServer } = require('../out/main/shared/tts');
const { newImageAiConnection } = require('../out/main/shared/image-ai');
const { AiService } = require('../out/main/main/core/ai-service');
const { TtsService } = require('../out/main/main/core/tts-service');
const { ImageAiService } = require('../out/main/main/core/image-ai-service');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { initialDeviceSettings } = require('../out/main/main/core/device-settings');
const root = path.resolve('.artifacts/generation-local-unit');
fs.mkdirSync(root, { recursive: true });
const read = (p) => JSON.parse(fs.readFileSync(p));
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const file = path.join(dir, 'data/settings.json');
  const local = path.join(dir, 'local');
  const store = new DeviceSettingsStore(file, local, 'PC');
  store.load();
  t.after(() => store.close());
  return { dir, file, local, store };
}
function populated(store) {
  const next = structuredClone(store.value);
  next.ai = {
    connections: [
      {
        ...newAiConnection('text'),
        name: 'Text',
        baseUrl: 'http://fixture/v1',
        defaultModel: 'model',
        mcpEnabled: true,
      },
    ],
    defaultConnectionId: 'text',
  };
  next.tts = {
    connections: [
      {
        ...newTtsServer('voice'),
        name: 'Voice',
        baseUrl: 'http://fixture/v1',
        model: 'model',
        mcpEnabled: true,
      },
    ],
    defaultConnectionId: 'voice',
  };
  next.imageAi = {
    connections: [{ ...newImageAiConnection('image'), name: 'Image', mcpEnabled: true }],
    defaultConnectionId: 'image',
  };
  next.notificationPreferences = {
    overrides: [],
    speech: { connectionId: 'voice', instructions: 'calm' },
  };
  return next;
}
test('all generator settings and notification server stay local across saves, restart and page scope changes', (t) => {
  const { store, file, local } = fixture(t);
  store.save(populated(store), store.revision);
  for (const p of [file, store.device.file]) {
    const disk = read(p);
    for (const key of ['ai', 'tts', 'imageAi']) assert.equal(disk[key], undefined);
    assert.equal(disk.notificationPreferences?.speech?.connectionId, undefined);
    assert.equal(
      disk.hostPages?.notifications?.configuration?.notificationPreferences?.speech?.connectionId,
      undefined,
    );
  }
  assert.equal(read(file).notificationPreferences.speech.instructions, 'calm');
  assert.equal(read(store.local.file).notificationConnectionId, 'voice');
  for (const key of ['ai', 'tts', 'imageAi']) {
    assert.deepEqual(read(store.local.file)[key], store.value[key]);
    assert.equal(store.settingScope([key]), 'local');
  }
  const localBytes = fs.readFileSync(store.local.file, 'utf8');
  store.setHostPageLocalSettings('notifications', true, store.revision);
  store.setHostPageLocalSettings('notifications', false, store.revision, undefined, 'share');
  assert.equal(fs.readFileSync(store.local.file, 'utf8'), localBytes);
  const next = structuredClone(store.value);
  next.host.showHints = false;
  store.save(next, store.revision);
  const reopened = new DeviceSettingsStore(file, local, 'PC');
  t.after(() => reopened.close());
  reopened.load();
  assert.deepEqual(reopened.value.ai, store.value.ai);
  assert.equal(reopened.value.notificationPreferences.speech.connectionId, 'voice');
  const other = new DeviceSettingsStore(file, path.join(local, 'other'), 'OTHER');
  t.after(() => other.close());
  other.load();
  assert.deepEqual(other.value.ai.connections, []);
  assert.equal(other.value.notificationPreferences.speech?.connectionId, undefined);
  assert.equal(other.value.notificationPreferences.speech.instructions, 'calm');
});
test('legacy shared and device generator data and notification server are ignored without migration', (t) => {
  const { store, file } = fixture(t);
  const old = createDefaultSettings();
  old.ai = { malformed: true };
  old.tts = 42;
  old.imageAi = 'retired';
  old.notificationPreferences = {
    overrides: [],
    speech: { connectionId: 'old', instructions: 'keep' },
  };
  fs.writeFileSync(file, JSON.stringify(old));
  const device = initialDeviceSettings('PC');
  device.hostPages.notifications = {
    useLocalSettings: true,
    configuration: { notificationPreferences: old.notificationPreferences },
  };
  fs.writeFileSync(store.device.file, JSON.stringify(device));
  store.reload();
  assert.deepEqual(store.value.ai.connections, []);
  assert.deepEqual(store.value.tts.connections, []);
  assert.deepEqual(store.value.imageAi.connections, []);
  assert.equal(store.value.notificationPreferences.speech.connectionId, undefined);
  assert.equal(store.value.notificationPreferences.speech.instructions, 'keep');
});
test('a local save failure rolls back shared changes and associated credentials atomically', (t) => {
  const { store, file } = fixture(t);
  fs.writeFileSync(file, JSON.stringify({ ...read(file), ai: 'ignored legacy value' }));
  store.reload();
  const before = fs.readFileSync(file, 'utf8');
  const localBefore = fs.readFileSync(store.local.file, 'utf8');
  const next = populated(store);
  next.host.showHints = false;
  let committed = false;
  const save = store.local.save;
  store.local.save = () => {
    throw Error('fixture write failure');
  };
  assert.throws(
    () =>
      store.save(next, store.revision, {
        commit: () => {
          committed = true;
        },
        rollback: () => {
          committed = false;
        },
      }),
    /fixture write failure/,
  );
  store.local.save = save;
  assert.equal(committed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.readFileSync(store.local.file, 'utf8'), localBefore);
  assert.deepEqual(store.value.ai.connections, []);
});
test('local external edits conflict and corrupt local files use explicit local recovery', (t) => {
  const { store } = fixture(t);
  store.save(populated(store), store.revision);
  const revision = store.revision;
  const disk = read(store.local.file);
  disk.ai.connections[0].name = 'Changed externally';
  fs.writeFileSync(store.local.file, JSON.stringify(disk));
  assert.throws(() => store.save(store.value, revision));
  assert.equal(store.value.ai.connections[0].name, 'Changed externally');
  fs.writeFileSync(store.local.file, '{');
  assert.throws(() => store.reload());
  assert.equal(store.diagnostics().find((v) => v.scope === 'local').recovered, true);
  const plan = store.prepareRecovery(undefined, 'local');
  store.restoreRecovery(plan);
  assert.equal(store.local.recovered, false);
  assert.equal(store.value.ai.connections[0].name, 'Changed externally');
});
test('text MCP permission applies to explicit, default and indirect calls and revocation cancels pending jobs', (t) => {
  let config = {
    connections: [
      { ...newAiConnection('one'), name: 'One', baseUrl: 'http://fixture/v1', defaultModel: 'm' },
    ],
    defaultConnectionId: 'one',
  };
  let sends = 0;
  const s = new AiService({
    settings: () => config,
    key: () => undefined,
    canUse: () => true,
    fetcher: async () => {
      sends++;
      return new Promise(() => {});
    },
  });
  t.after(() => s.close());
  for (const owner of ['mcp:0', 'applet:fixture:1|mcp:0'])
    for (const connectionId of [undefined, 'one'])
      assert.throws(
        () => s.generate(owner, { requestId: owner + connectionId, connectionId, input: 'text' }),
        { code: 'API_DISABLED' },
      );
  assert.throws(() => s.models('mcp:0'), { code: 'API_DISABLED' });
  assert.equal(sends, 0);
  config.connections[0].mcpEnabled = true;
  const job = s.generate('mcp:0', { requestId: 'allowed', input: 'text' });
  const local = s.generate('host', { requestId: 'local', input: 'text' });
  config = structuredClone(config);
  config.connections[0].mcpEnabled = false;
  s.reconcile();
  assert.equal(s.get('mcp:0', job.jobId).state, 'canceled');
  assert.equal(s.get('host', local.jobId).state, 'queued');
  assert.throws(() => s.generate('mcp:0', { requestId: 'allowed', input: 'text' }), {
    code: 'API_DISABLED',
  });
});
test('speech MCP lists only permitted presets and denies default, indirect and replay after revocation', (t) => {
  let config = {
    connections: [
      { ...newTtsServer('one'), name: 'One', baseUrl: 'http://fixture/v1', model: 'm' },
    ],
    defaultConnectionId: 'one',
  };
  const s = new TtsService({
    settings: () => config,
    key: () => undefined,
    canUse: () => true,
    play: async () => {},
    fetcher: async () => {
      throw Error('unexpected request');
    },
  });
  t.after(() => s.close());
  assert.deepEqual(s.connections('mcp'), { connections: [] });
  assert.equal(s.connections('host').connections.length, 1);
  for (const owner of ['mcp', 'applet:fixture:1|mcp:0'])
    assert.throws(() => s.speak(owner, { requestId: owner, text: 'text' }), {
      code: 'API_DISABLED',
    });
  assert.throws(() => s.voices('mcp'), { code: 'API_DISABLED' });
  config.connections[0].mcpEnabled = true;
  const job = s.speak('mcp', { requestId: 'allowed', text: 'text' });
  const local = s.speak('host', { requestId: 'local', text: 'text' });
  config = structuredClone(config);
  config.connections[0].mcpEnabled = false;
  s.reconcile();
  assert.equal(s.get('mcp', job.jobId).state, 'canceled');
  assert.equal(s.get('host', local.jobId).state, 'queued');
  assert.throws(() => s.speak('mcp', { requestId: 'allowed', text: 'text' }), {
    code: 'API_DISABLED',
  });
});
test('future image MCP permission is saved and enforced internally without publishing a generation API', (t) => {
  const c = {
    ...newImageAiConnection('one'),
    name: 'One',
    authentication: 'none',
    defaultModel: 'm',
    defaultPrompt: 'image',
  };
  const config = { connections: [c], defaultConnectionId: 'one' };
  const s = new ImageAiService({
    settings: () => config,
    key: () => undefined,
    canUse: () => true,
  });
  t.after(() => s.close());
  assert.throws(() => s.generate('mcp:0', { requestId: 'denied' }), { code: 'API_DISABLED' });
  assert.equal(s.connections('mcp:0').connections.length, 0);
  c.mcpEnabled = true;
  assert.equal(s.connections('mcp:0').connections.length, 1);
  const { appDockOperations } = require('../out/main/shared/appdock-api');
  assert.equal(appDockOperations['ai.image.generate'], undefined);
  assert.equal(appDockOperations['ai.image.connections.list'].callers.includes('mcp'), false);
});
