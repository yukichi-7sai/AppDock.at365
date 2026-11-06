const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { AiSecrets } = require('../out/main/main/core/ai-secrets');
const { generationSettings } = require('../out/main/main/core/generation-settings');
const { newAiConnection } = require('../out/main/shared/ai');
const { newTtsServer } = require('../out/main/shared/tts');
const { newImageAiConnection } = require('../out/main/shared/image-ai');
const { AiService } = require('../out/main/main/core/ai-service');
const { TtsService } = require('../out/main/main/core/tts-service');
const { ImageAiService } = require('../out/main/main/core/image-ai-service');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { initialDeviceSettings } = require('../out/main/main/core/device-settings');
const root = path.resolve('.artifacts/generation-device-unit');
fs.mkdirSync(root, { recursive: true });
const read = (p) => JSON.parse(fs.readFileSync(p));
const encryption = {
  encrypt: (key) => Buffer.from(key).toString('base64'),
  decrypt: (key) => Buffer.from(key, 'base64').toString('utf8'),
};
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
        ...newTtsServer('Voice'),
        name: 'Voice',
        baseUrl: 'http://fixture/v1',
        model: 'model',
        mcpEnabled: true,
      },
    ],
    defaultConnectionId: 'Voice',
  };
  next.imageAi = {
    connections: [
      {
        ...newImageAiConnection('image'),
        name: 'Image',
        baseUrl: 'http://fixture/v1',
        mcpEnabled: true,
      },
    ],
    defaultConnectionId: 'image',
  };
  next.notificationPreferences = {
    overrides: [],
    speech: { connectionId: 'Voice', instructions: 'calm' },
  };
  return next;
}
test('all generators and the notification server follow the device across saves, restart and page scope changes', (t) => {
  const { store, file, local } = fixture(t);
  store.saveOperationPermissions({ mcp: { allowUseTts: true } });
  store.save(populated(store), store.revision);
  const shared = read(file);
  const device = read(store.device.file);
  assert.equal(shared.generationAi, undefined);
  assert.equal(shared.operationPermissions, undefined);
  assert.deepEqual(device.operationPermissions, { mcp: { allowUseTts: true } });
  assert.equal(shared.notificationPreferences.speech.connectionId, undefined);
  assert.equal(shared.notificationPreferences.speech.instructions, 'calm');
  assert.equal(device.generationAi.notificationConnectionId, 'Voice');
  assert.equal(store.settingScope(['notificationPreferences', 'speech', 'connectionId']), 'device');
  assert(!fs.existsSync(path.join(local, 'generation-ai.json')));
  for (const key of ['ai', 'tts', 'imageAi']) {
    assert.equal(shared[key], undefined);
    assert.equal(device[key], undefined);
    assert.deepEqual(device.generationAi[key], store.value[key]);
    assert.equal(store.settingScope([key]), 'device');
  }
  store.setHostPageLocalSettings('notifications', true, store.revision);
  assert.equal(
    read(store.device.file).hostPages.notifications.configuration.notificationPreferences?.speech
      ?.connectionId,
    undefined,
  );
  assert.equal(store.value.notificationPreferences.speech.connectionId, 'Voice');
  store.setHostPageLocalSettings('notifications', false, store.revision, undefined, 'share');
  store.saveOperationPermissions({ mcp: { allowUseTts: false } });
  assert.deepEqual(read(store.device.file).generationAi, device.generationAi);
  assert.equal(read(file).notificationPreferences.speech.connectionId, undefined);
  const next = structuredClone(store.value);
  next.host.showHints = false;
  store.save(next, store.revision);
  const reopened = new DeviceSettingsStore(file, local, 'PC');
  t.after(() => reopened.close());
  reopened.load();
  assert.deepEqual(reopened.value.ai, store.value.ai);
  assert.equal(reopened.value.notificationPreferences.speech.connectionId, 'Voice');
  assert.deepEqual(reopened.operationPermissions(), { mcp: { allowUseTts: false } });
  const other = new DeviceSettingsStore(file, local, 'OTHER');
  t.after(() => other.close());
  other.load();
  assert.deepEqual(other.value.ai.connections, []);
  assert.deepEqual(other.value.tts.connections, []);
  assert.deepEqual(other.value.imageAi.connections, []);
  assert.deepEqual(other.operationPermissions(), {});
  assert.equal(other.value.notificationPreferences.speech?.connectionId, undefined);
  assert.equal(other.value.notificationPreferences.speech.instructions, 'calm');
});
test('retired LocalAppData, shared and device generation values are ignored without migration', (t) => {
  const { store, file, local } = fixture(t);
  const retired = path.join(local, 'generation-ai.json');
  const retiredBytes = JSON.stringify(generationSettings(populated(store)));
  fs.writeFileSync(retired, retiredBytes);
  const old = createDefaultSettings();
  old.ai = { malformed: true };
  old.tts = 42;
  old.imageAi = 'retired';
  old.generationAi = { invalidSharedSection: true };
  old.notificationPreferences = {
    overrides: [],
    speech: { connectionId: 'old', instructions: 'keep' },
  };
  fs.writeFileSync(file, JSON.stringify(old));
  const device = initialDeviceSettings('PC');
  device.ai = 'retired';
  device.tts = 'retired';
  device.imageAi = 'retired';
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
  assert.equal(store.storedValue().generationAi, undefined);
  store.save(populated(store), store.revision);
  assert.equal(fs.readFileSync(retired, 'utf8'), retiredBytes);
  assert.equal(read(store.device.file).generationAi.notificationConnectionId, 'Voice');
});
test('a device save failure rolls back shared changes and the actual encrypted key file', (t) => {
  const { store, file, local } = fixture(t);
  fs.writeFileSync(file, JSON.stringify({ ...read(file), ai: 'ignored legacy value' }));
  store.reload();
  const next = populated(store);
  next.host.showHints = false;
  const connection = next.ai.connections[0];
  const keyFile = path.join(local, 'ai-keys.json');
  const secrets = new AiSecrets(local, 'ai-keys', encryption);
  secrets.setKey(connection, 'old-key');
  const inputs = [file, store.device.file, keyFile];
  const before = inputs.map((input) => fs.readFileSync(input, 'utf8'));
  const save = store.device.save;
  store.device.save = () => {
    assert.equal(secrets.key(connection), 'new-key');
    throw Error('fixture write failure');
  };
  assert.throws(
    () => store.save(next, store.revision, secrets.prepareKey(connection, 'new-key')),
    /fixture write failure/,
  );
  store.device.save = save;
  assert.deepEqual(
    inputs.map((input) => fs.readFileSync(input, 'utf8')),
    before,
  );
  assert(!fs.existsSync(path.join(local, 'settings-transactions', 'settings.json')));
  assert.deepEqual(store.value.ai.connections, []);
});
test('device external edits conflict and corrupt generation values use device recovery', (t) => {
  const { store } = fixture(t);
  store.save(populated(store), store.revision);
  const revision = store.revision;
  const disk = read(store.device.file);
  disk.generationAi.ai.connections[0].name = 'Changed externally';
  fs.writeFileSync(store.device.file, JSON.stringify(disk));
  assert.throws(() => store.save(store.value, revision));
  assert.equal(store.value.ai.connections[0].name, 'Changed externally');
  disk.generationAi.ai.connections[0].apiKey = 'must-never-enter-the-device-file';
  fs.writeFileSync(store.device.file, JSON.stringify(disk));
  assert.throws(() => store.reload());
  assert.equal(store.diagnostics().find((v) => v.scope === 'device').recovered, true);
  const plan = store.prepareRecovery(undefined, 'device');
  store.restoreRecovery(plan);
  assert.equal(store.device.recovered, false);
  assert.equal(store.value.ai.connections[0].name, 'Changed externally');
});
test('a newer credential rejects a prepared device save and leaves the store writable', (t) => {
  const { store, local } = fixture(t);
  const next = populated(store);
  const connection = next.ai.connections[0];
  const secrets = new AiSecrets(local, 'ai-keys', encryption);
  const stale = secrets.prepareKey(connection, 'old-key');
  secrets.setKey(connection, 'newer-key');
  assert.throws(() => store.save(next, store.revision, stale));
  assert.equal(secrets.key(connection), 'newer-key');
  assert.deepEqual(store.value.ai.connections, []);
  store.save(next, store.revision);
  assert.equal(store.value.ai.defaultConnectionId, connection.id);
});
test('startup rolls back an interrupted device save and a newly written credential', (t) => {
  const { store, file, local } = fixture(t);
  const next = populated(store);
  const secrets = new AiSecrets(local, 'image-ai-keys', encryption);
  const connection = next.imageAi.connections[0];
  const asset = secrets.prepareKey(connection, 'fixture-key');
  const deviceBefore = fs.readFileSync(store.device.file);
  const deviceAfter = Buffer.from(
    store.device.serialize({ ...store.device.value, generationAi: generationSettings(next) }),
  );
  const journal = path.join(local, 'settings-transactions', 'settings.json');
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  fs.writeFileSync(
    journal,
    JSON.stringify({
      version: 1,
      machineName: 'PC',
      committed: false,
      files: [
        asset.recovery,
        {
          scope: 'device',
          before: deviceBefore.toString('base64'),
          after: deviceAfter.toString('base64'),
        },
      ],
    }),
  );
  asset.commit();
  fs.writeFileSync(store.device.file, deviceAfter);
  store.close();
  const reopened = new DeviceSettingsStore(file, local, 'PC');
  t.after(() => reopened.close());
  reopened.load();
  assert.deepEqual(reopened.value.imageAi.connections, []);
  assert.deepEqual(fs.readFileSync(reopened.device.file), deviceBefore);
  assert(!fs.existsSync(path.join(local, 'image-ai-keys.json')));
  assert(!fs.existsSync(journal));
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
test('image MCP presets are filtered while generation plus registration is published', (t) => {
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
  assert.equal(appDockOperations['ai.image.connections.list'].callers.includes('mcp'), true);
  assert.deepEqual(appDockOperations['ai.image.generateAndRegister'].callers, ['mcp', 'applet']);
  assert.equal(appDockOperations['ai.image.results.read'], undefined);
});
