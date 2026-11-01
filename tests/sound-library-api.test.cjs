const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path');
const Module = require('node:module'),
  original = Module._load,
  played = [];
let nativePicks = 0;
Module._load = function (name, ...args) {
  if (name === 'electron')
    return {
      dialog: {
        showOpenDialog: async () => {
          nativePicks++;
          return { canceled: false, filePaths: ['C:\\oauth.json'] };
        },
      },
    };
  if (name === './sounds')
    return {
      queueSound: (file, alive) => {
        if (alive()) played.push(file);
      },
    };
  return original.call(this, name, ...args);
};
const { createHostApi } = require('../out/main/main/core/host-api');
Module._load = original;
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const reference = '@library/@assigned/' + 'c'.repeat(64) + '.wav';
function fixture(sound) {
  const args = Array(20).fill(undefined);
  args[0] = { value: createDefaultSettings() };
  args[1] = path.resolve('.artifacts/sound-api');
  args[2] = () => {};
  args[3] = () => {};
  args[19] = sound;
  const e = {
    manifest: { id: 'test.sound-library', name: 'Sound', capabilities: ['file-dialog', 'audio'] },
    state: 'running',
    child: {},
    runtimeSession: 'one',
  };
  return { api: createHostApi(...args), e };
}
test('WAV pickFile delegates to shared selector, preserves absolute-path/null API and keeps JSON on native dialog', async () => {
  let selected = 'C:\\assigned-sounds\\notice.wav',
    count = 0;
  const f = fixture({
    pickFile: async () => {
      count++;
      return selected;
    },
  });
  assert.equal(await f.api(f.e, 'host.ui.pickFile', { kind: 'wav' }), selected);
  selected = null;
  assert.equal(await f.api(f.e, 'host.ui.pickFile', { kind: 'wav' }), null);
  assert.equal(count, 2);
  assert.equal(await f.api(f.e, 'host.ui.pickFile', { kind: 'json' }), 'C:\\oauth.json');
  assert.equal(nativePicks, 1);
  f.e.manifest.capabilities = [];
  await assert.rejects(f.api(f.e, 'host.ui.pickFile', { kind: 'wav' }));
  assert.equal(count, 2);
});
test('pending WAV selection expires when its caller stops or runtime generation changes', async () => {
  let live;
  const f = fixture({
    pickFile: async (fn) => {
      live = fn;
      return null;
    },
  });
  await f.api(f.e, 'host.ui.pickFile', { kind: 'wav' });
  assert.equal(live(), true);
  f.e.runtimeSession = 'two';
  assert.equal(live(), false);
  await f.api(f.e, 'host.ui.pickFile', { kind: 'wav' });
  assert.equal(live(), true);
  f.e.state = 'stopping';
  assert.equal(live(), false);
});
test('audio.play resolves retained shared refs and still accepts old absolute paths; missing assets never enqueue', async () => {
  const resolved = [];
  const f = fixture({
    resolve: async (file) => {
      resolved.push(file);
      return 'C:\\assigned-sounds\\sound.wav';
    },
  });
  played.length = 0;
  await f.api(f.e, 'host.audio.play', { file: reference });
  assert.deepEqual(resolved, [reference]);
  assert.deepEqual(played, ['C:\\assigned-sounds\\sound.wav']);
  await f.api(f.e, 'host.audio.play', { file: 'C:\\old.wav' });
  assert.equal(played.at(-1), 'C:\\old.wav');
  const bad = fixture({
    resolve: async () => {
      throw Error('missing');
    },
  });
  await assert.rejects(bad.api(bad.e, 'host.audio.play', { file: reference }));
  assert.equal(played.length, 2);
});
