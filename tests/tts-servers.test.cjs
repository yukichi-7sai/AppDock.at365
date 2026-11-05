const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { TtsSecrets } = require('../out/main/main/core/tts-secrets');
const { TtsSettingsController } = require('../out/main/main/core/tts-settings');
const {
  newTtsServer,
  parseTtsConfiguration,
  selectedTtsServer,
} = require('../out/main/shared/tts');
const { parseSettings } = require('../out/main/shared/settings-schema');
function fixture(t) {
  const dir = path.resolve('.artifacts/tts-servers-unit', randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  const file = path.join(dir, 'tts-keys.json');
  const keys = new TtsSecrets(file, {
    encrypt: (s) => Buffer.from(s).toString('base64'),
    decrypt: (s) => Buffer.from(s, 'base64').toString(),
  });
  const controller = new TtsSettingsController(store, keys, () => {});
  const server = (id) => ({
    ...newTtsServer(id),
    name: id,
    baseUrl: 'http://fixture/v1',
    model: id,
    defaultVoice: id,
  });
  return { store, keys, controller, file, server };
}
test('server settings validate stable identities, retain order and retire only former TTS settings', () => {
  const one = { ...newTtsServer('one'), name: 'One' };
  assert.throws(() => parseTtsConfiguration({ connections: [one, one] }));
  assert.throws(() =>
    parseTtsConfiguration({ connections: [one], defaultConnectionId: 'missing' }),
  );
  assert.throws(() => parseTtsConfiguration({ connections: [{ ...one, apiKey: 'secret' }] }));
  assert.deepEqual(parseTtsConfiguration({ model: 'old-sparse', defaultSpeed: 1.2 }), {
    connections: [],
  });
  const previous = parseSettings({
    schemaVersion: 1,
    host: { soundEnabled: false },
    tts: { baseUrl: 'http://old/v1', model: 'old' },
  });
  assert.deepEqual(previous.tts, { connections: [] });
  assert.equal(previous.host.soundEnabled, false);
  assert.equal(selectedTtsServer({ connections: [one] }), undefined);
});
test('retired speed preferences are discarded on reload and save without losing servers or credentials', (t) => {
  const f = fixture(t);
  f.controller.save(f.server('one'), null, 'first-secret');
  f.controller.save(f.server('two'), null, 'second-secret');
  const keys = fs.readFileSync(f.file);
  const saved = JSON.parse(fs.readFileSync(f.store.file, 'utf8'));
  saved.host = { ...saved.host, soundEnabled: false };
  saved.tts.connections[0].defaultSpeed = 1.8;
  saved.tts.connections[0].speedMode = 'playback';
  saved.tts.connections[1].defaultSpeed = 'retired-value';
  saved.tts.connections[1].speedMode = 'server';
  fs.writeFileSync(f.store.file, JSON.stringify(saved));
  f.store.load();
  assert.equal(f.store.value.host.soundEnabled, false);
  assert.equal(f.store.value.tts.defaultConnectionId, 'one');
  assert.deepEqual(f.store.value.tts.connections, [f.server('one'), f.server('two')]);
  assert.equal(f.controller.configuration('one').key, 'first-secret');
  assert.equal(f.controller.configuration('two').key, 'second-secret');
  const one = selectedTtsServer(f.store.value.tts);
  f.controller.save({ ...one, name: 'Renamed' }, one, undefined, f.keys.revision(one.id));
  f.store.load();
  const persisted = JSON.parse(fs.readFileSync(f.store.file, 'utf8'));
  assert.equal(persisted.tts.connections[0].name, 'Renamed');
  for (const server of persisted.tts.connections) {
    assert.equal(Object.hasOwn(server, 'defaultSpeed'), false);
    assert.equal(Object.hasOwn(server, 'speedMode'), false);
  }
  assert.equal(f.store.value.host.soundEnabled, false);
  assert.deepEqual(fs.readFileSync(f.file), keys);
});

test('two servers at the same URL keep separate keys and speech defaults across reload', (t) => {
  const f = fixture(t);
  f.controller.save(f.server('one'), null, 'first-secret');
  f.controller.save(f.server('two'), null, 'second-secret');
  assert.equal(f.store.value.tts.defaultConnectionId, 'one');
  assert.equal(f.controller.configuration('one').key, 'first-secret');
  assert.equal(f.controller.configuration('two').key, 'second-secret');
  assert.equal(f.controller.configuration('two').settings.defaultVoice, 'two');
  assert.equal(f.store.value.tts.defaultConnectionId, 'one');
  assert(!fs.readFileSync(f.file, 'utf8').includes('secret'));
  f.store.load();
  assert.equal(f.store.value.tts.connections.length, 2);
  assert.equal(f.controller.configuration().settings.model, 'one');
});
test('canceling a draft leaves settings and credentials untouched; changed URLs never reuse credentials', (t) => {
  const f = fixture(t),
    one = f.server('one');
  f.controller.save(one, null, 'first-secret');
  const settings = fs.readFileSync(f.store.file),
    keys = fs.readFileSync(f.file);
  assert.equal(
    f.controller.draftConfiguration({ ...one, baseUrl: 'http://other/v1' }, undefined).key,
    undefined,
  );
  assert.equal(f.controller.draftConfiguration(one, 'temporary').key, 'temporary');
  assert.deepEqual(fs.readFileSync(f.store.file), settings);
  assert.deepEqual(fs.readFileSync(f.file), keys);
  f.controller.save(
    { ...one, baseUrl: 'http://other/v1' },
    one,
    undefined,
    f.keys.revision(one.id),
  );
  assert.equal(f.controller.configuration().key, undefined);
  assert.equal(f.keys.key(one), undefined);
});
test('delete and reorder preserve chosen defaults and reject stale edits', (t) => {
  const f = fixture(t),
    one = f.server('one'),
    two = f.server('two');
  f.controller.save(one, null, 'first');
  f.controller.save(two, null, 'second');
  const oldKey = f.keys.revision(one.id);
  f.controller.reorder(['one', 'two'], ['two', 'one']);
  assert.equal(f.store.value.tts.defaultConnectionId, 'one');
  assert.throws(() => f.controller.reorder(['one', 'two'], ['two', 'one']));
  f.controller.save({ ...one, name: 'Renamed' }, one, undefined, oldKey);
  assert.throws(() => f.controller.save({ ...one, model: 'stale' }, one, undefined, oldKey));
  const current = selectedTtsServer(f.store.value.tts);
  assert.throws(() => f.controller.remove(current, oldKey, 'missing', 'one'));
  assert.equal(f.keys.key(current), 'first');
  f.controller.remove(current, oldKey, 'two', 'one');
  assert.equal(f.store.value.tts.defaultConnectionId, 'two');
  assert.equal(f.keys.key(current), undefined);
  assert.equal(f.controller.configuration().key, 'second');
});
test('a failed settings write rolls back the credential transaction', (t) => {
  const f = fixture(t),
    one = f.server('one');
  f.controller.save(one, null, 'first');
  const previousSettings = fs.readFileSync(f.store.file),
    previousKeys = fs.readFileSync(f.file);
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === f.store.file) throw Object.assign(Error('write denied'), { code: 'EACCES' });
    return rename(from, to);
  });
  assert.throws(() =>
    f.controller.save({ ...one, name: 'Changed' }, one, 'replacement', f.keys.revision(one.id)),
  );
  assert.deepEqual(fs.readFileSync(f.store.file), previousSettings);
  assert.deepEqual(fs.readFileSync(f.file), previousKeys);
  assert.equal(f.controller.configuration().key, 'first');
});
