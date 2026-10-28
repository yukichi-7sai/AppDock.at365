const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { AiSettingsController } = require('../out/main/main/core/ai-settings');
const { AiSecrets } = require('../out/main/main/core/ai-secrets');
const { SettingsStore } = require('../out/main/main/core/settings');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { newAiConnection } = require('../out/main/shared/ai');
const root = path.join(__dirname, '../.artifacts/ai-settings-unit');
fs.mkdirSync(root, { recursive: true });
function fixture(adapter) {
  const dir = fs.mkdtempSync(path.join(root, 'case-')),
    file = path.join(dir, 'settings.json'),
    keys = path.join(dir, 'keys.json');
  fs.writeFileSync(file, JSON.stringify(createDefaultSettings()));
  const settings = new SettingsStore(file);
  settings.load();
  const secrets = new AiSecrets(keys, {
    encrypt: (v) => Buffer.from(v).toString('base64'),
    decrypt: (v) => Buffer.from(v, 'base64').toString(),
  });
  const controller = new AiSettingsController(settings, secrets, () => {}, adapter);
  const c = { ...newAiConnection('one'), baseUrl: 'http://local/v1', authentication: 'bearer' };
  return { controller, settings, secrets, c, file, keys, dir };
}
test('draft discovery uses the supplied endpoint/key without creating settings or secrets', async () => {
  const calls = [];
  const f = fixture({
    models: async (c, key) => {
      calls.push([c.baseUrl, key]);
      return { models: [{ id: 'm', name: 'm' }] };
    },
  });
  const before = fs.readFileSync(f.file, 'utf8');
  await f.controller.models({ ...f.c, baseUrl: 'http://other/v1/' }, 'temporary-key');
  assert.deepEqual(calls, [['http://other/v1', 'temporary-key']]);
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  assert(!fs.existsSync(f.keys));
  f.controller.save(f.c, null, 'saved-key');
  const original = structuredClone(f.settings.value.ai.connections[0]);
  await f.controller.models(f.c, undefined);
  assert.equal(calls.at(-1)[1], 'saved-key');
  await assert.rejects(
    f.controller.models({ ...f.c, baseUrl: 'http://changed/v1' }, undefined),
    /再入力/,
  );
  assert.deepEqual(f.settings.value.ai.connections, [original]);
});
test('OK saves a whole connection once and preserves unrelated settings', () => {
  const f = fixture();
  let changed = 0;
  f.settings.on('changed', () => changed++);
  f.controller.save(f.c, null, 'saved-key');
  assert.equal(changed, 1);
  assert.equal(f.settings.value.ai.defaultConnectionId, f.c.id);
  assert.equal(f.secrets.key(f.c), 'saved-key');
  assert(!fs.readFileSync(f.file, 'utf8').includes('saved-key'));
  const original = structuredClone(f.settings.value.ai.connections[0]);
  f.settings.save(
    { ...f.settings.value, ai: { ...f.settings.value.ai, commonPrompt: 'external' } },
    f.settings.revision,
  );
  f.controller.save(
    {
      ...original,
      name: 'edited',
      defaultModel: 'm',
      defaultMaxOutputTokens: 100000,
      defaultTimeoutSeconds: 120,
    },
    original,
    undefined,
    f.secrets.revision(f.c.id),
  );
  assert.equal(f.settings.value.ai.commonPrompt, 'external');
  assert.equal(f.settings.value.ai.connections[0].name, 'edited');
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8')).ai.connections[0];
  assert.equal(saved.defaultMaxOutputTokens, 100000);
  assert.equal(saved.defaultTimeoutSeconds, 120);
});
test('conflicting connection or key edits cannot overwrite the current values', () => {
  const f = fixture();
  f.controller.save(f.c, null, 'saved-key');
  const original = structuredClone(f.settings.value.ai.connections[0]),
    revision = f.secrets.revision(f.c.id);
  f.secrets.setKey(f.c, 'changed-key');
  assert.throws(
    () => f.controller.save({ ...original, name: 'stale' }, original, 'wrong-key', revision),
    /別の場所/,
  );
  assert.equal(f.secrets.key(f.c), 'changed-key');
  f.controller.save(
    { ...original, name: 'current' },
    original,
    undefined,
    f.secrets.revision(f.c.id),
  );
  assert.throws(() => f.controller.remove(original, f.secrets.revision(f.c.id)), /別の場所/);
  assert.equal(f.settings.value.ai.connections[0].name, 'current');
});
test('failed settings write rolls back the encrypted key transaction', () => {
  const f = fixture();
  f.controller.save(f.c, null, 'saved-key');
  const original = structuredClone(f.settings.value.ai.connections[0]),
    saved = fs.readFileSync(f.keys, 'utf8');
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (to === f.file) throw Error('fixture write failure');
    return rename(from, to);
  };
  try {
    assert.throws(
      () =>
        f.controller.save(
          { ...original, name: 'failed' },
          original,
          'wrong-key',
          f.secrets.revision(f.c.id),
        ),
      /fixture write failure/,
    );
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(f.keys, 'utf8'), saved);
  assert.equal(f.settings.value.ai.connections[0].name, original.name);
});
test('ordering validates membership and current order, while preserving later name edits', () => {
  const f = fixture();
  f.controller.save({ ...f.c, authentication: 'none' }, null);
  f.controller.save({ ...f.c, id: 'two', authentication: 'none' }, null);
  const original = structuredClone(f.settings.value.ai.connections[0]);
  f.controller.save(
    { ...original, name: 'latest' },
    original,
    undefined,
    f.secrets.revision(original.id),
  );
  f.controller.reorder(['one', 'two'], ['two', 'one']);
  assert.deepEqual(
    f.settings.value.ai.connections.map((c) => c.name),
    ['新しい接続', 'latest'],
  );
  assert.throws(() => f.controller.reorder(['one', 'two'], ['two', 'one']), /一覧が変更/);
  assert.throws(() => f.controller.reorder(['two', 'one'], ['two', 'two']), /一覧が変更/);
  f.controller.remove(f.settings.value.ai.connections[1], f.secrets.revision('one'));
  assert.equal(f.settings.value.ai.defaultConnectionId, undefined);
  assert.equal(f.secrets.key(f.c), undefined);
});
test('connections beyond the former limit retain encrypted keys; discovery cancellation releases transport', async () => {
  const f = fixture({
    models: async (_c, _key, signal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }),
      ),
  });
  for (let i = 0; i < 8; i++)
    f.controller.save({ ...f.c, id: 'c' + i, authentication: 'none' }, null);
  const before = fs.readFileSync(f.keys, 'utf8');
  f.controller.save(f.c, null, 'ninth-key');
  assert.equal(f.settings.value.ai.connections.length, 9);
  assert.notEqual(fs.readFileSync(f.keys, 'utf8'), before);
  const request = f.controller.models(f.c, 'transient-key');
  const check = assert.rejects(request, /aborted/);
  f.controller.cancelModels();
  await check;
});
test('a closed dialog cannot cancel discovery started by a newer dialog', async () => {
  const signals = [];
  const f = fixture({
    models: async (_c, _key, signal) => {
      signals.push(signal);
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }),
      );
    },
  });
  const old = assert.rejects(f.controller.models(f.c, 'temporary', 'old'), /aborted/);
  const next = assert.rejects(f.controller.models(f.c, 'temporary', 'next'), /aborted/);
  await old;
  f.controller.cancelModels('old');
  assert.equal(signals[1].aborted, false);
  f.controller.cancelModels('next');
  await next;
});
test('an undecryptable saved key can be replaced through the dialog transaction', () => {
  const f = fixture();
  f.controller.save(f.c, null, 'old-key');
  const secrets = new AiSecrets(f.keys, {
    encrypt: (value) => 'repaired-' + value,
    decrypt: (value) => {
      if (!value.startsWith('repaired-')) throw Error('cannot decrypt');
      return value.slice(9);
    },
  });
  const status = secrets.status(f.c);
  assert(status.error);
  assert(status.keyRevision);
  const controller = new AiSettingsController(f.settings, secrets, () => {});
  controller.save(f.c, f.settings.value.ai.connections[0], 'new-key', status.keyRevision);
  assert.equal(secrets.key(f.c), 'new-key');
});
