const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Module = require('node:module');
const original = Module._load;
Module._load = function (name, ...args) {
  return name === 'electron'
    ? { shell: { trashItem: (file) => fs.unlink(file) }, clipboard: {}, dialog: {} }
    : original.call(this, name, ...args);
};
const { SoundLibraryService } = require('../out/main/main/core/sound-library-service');
Module._load = original;
const { SoundGeneration } = require('../out/main/main/core/sound-generation');
const { TtsService } = require('../out/main/main/core/tts-service');
const { newTtsServer } = require('../out/main/shared/tts');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { wave } = require('../scripts/sound-library-fixture.cjs');
const wait = async (fn) => {
  for (let i = 0; i < 400; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('Timed out');
};
async function fixture(t, fetcher) {
  const directory = path.resolve('.artifacts/sound-generation-unit', randomUUID());
  await fs.mkdir(path.join(directory, '通知'), { recursive: true });
  let writable = true,
    savesFail = false,
    failures = 0,
    played = 0;
  const settings = {
    value: createDefaultSettings(),
    revision: 0,
    save(value, revision) {
      assert.equal(revision, this.revision);
      if (savesFail) throw Error('fixture settings failure');
      this.value = value;
      this.revision++;
    },
  };
  settings.value.soundLibrary = { groups: [{ id: 'notice', name: '通知', files: [] }] };
  const library = new SoundLibraryService(
    directory,
    {
      settings,
      window: () => null,
      show() {},
      writable() {
        if (!writable) throw Error('fixture write failure');
      },
    },
    () => {},
    () => {
      failures++;
    },
  );
  await library.files.refresh();
  const config = {
    connections: [
      {
        ...newTtsServer('one'),
        name: '通知用',
        baseUrl: 'http://fixture.test/v1',
        model: 'model-one',
        defaultVoice: 'voice-one',
        instructionsMode: 'json',
        instructionsParameter: 'instructions',
        defaultInstructions: 'やさしく',
        alwaysInstructions: '日本語',
        extraBody: { language: 'Japanese' },
      },
    ],
    defaultConnectionId: 'one',
  };
  const requests = [];
  const tts = new TtsService({
    settings: () => config,
    key: () => undefined,
    canUse: () => true,
    play: async () => {
      played++;
    },
    fetcher: async (url, init) => {
      requests.push(JSON.parse(init.body));
      return fetcher
        ? fetcher(url, init)
        : new Response(wave(1000), { headers: { 'Content-Type': 'audio/wav' } });
    },
  });
  const generation = new SoundGeneration({
    library,
    tts,
    configuration: () => config,
    send() {},
    changed() {},
    failed() {
      failures++;
    },
  });
  t.after(async () => {
    generation.cancel();
    await tts.close();
    library.close();
  });
  const closed = generation.open('page', '通知', 'notice');
  const id = generation.current().id;
  const generate = () =>
    generation.act(id, {
      kind: 'generate',
      folder: '通知',
      connectionId: 'one',
      text: '完了しました。',
    });
  return {
    directory,
    settings,
    library,
    tts,
    generation,
    config,
    requests,
    id,
    generate,
    closed,
    write: (value) => (writable = value),
    failSettings: (value) => (savesFail = value),
    failures: () => failures,
    played: () => played,
  };
}
test('generated WAVs are distinct saved assets, inherit the chosen server and survive dialog closure', async (t) => {
  const f = await fixture(t);
  await f.generate();
  await f.generate();
  const model = f.generation.current();
  assert.equal(model.items.length, 2);
  assert(model.items.every((x) => x.state === 'saved'));
  assert.notEqual(model.items[0].file, model.items[1].file);
  for (const item of model.items)
    assert.deepEqual(await fs.readFile(path.join(f.directory, item.file)), wave(1000));
  assert.equal(f.played(), 0);
  assert.equal(f.requests[0].model, 'model-one');
  assert.equal(f.requests[0].voice, 'voice-one');
  assert.equal(f.requests[0].instructions, '日本語\nやさしく');
  assert.equal(f.requests[0].language, 'Japanese');
  assert.equal(f.settings.value.soundLibrary.groups[0].files.length, 2);
  await f.generation.act(f.id, { kind: 'close' });
  await f.closed;
  assert.equal(f.generation.current(), null);
  assert.equal((await fs.readdir(path.join(f.directory, '通知'))).length, 2);
  assert.equal(f.config.defaultConnectionId, 'one');
});
test('failed persistence retains the exact WAV and retries without another generation', async (t) => {
  const f = await fixture(t);
  const add = f.library.files.addVerified.bind(f.library.files);
  let fail = true;
  f.library.files.addVerified = async (...args) => {
    if (fail) throw Error('fixture disk failure');
    return add(...args);
  };
  await f.generate();
  const item = f.generation.current().items[0];
  assert.equal(item.state, 'unsaved');
  assert.equal(item.canRetry, true);
  await assert.rejects(f.generation.act(f.id, { kind: 'close' }));
  fail = false;
  await f.generation.act(f.id, { kind: 'retry', itemId: item.id });
  const saved = f.generation.current().items[0];
  assert.equal(saved.state, 'saved');
  assert.equal(f.requests.length, 1);
  assert.deepEqual(await fs.readFile(path.join(f.directory, saved.file)), wave(1000));
});
test('classification failures preserve the committed file and retry only classification', async (t) => {
  const f = await fixture(t);
  f.failSettings(true);
  await f.generate();
  let item = f.generation.current().items[0];
  assert.equal(item.state, 'saved');
  assert.equal(item.canRetry, true);
  assert(item.error);
  f.failSettings(false);
  await f.generation.act(f.id, { kind: 'retry', itemId: item.id });
  item = f.generation.current().items[0];
  assert.equal(item.canRetry, false);
  assert.equal(item.error, undefined);
  assert.equal(f.requests.length, 1);
  assert.equal((await fs.readdir(path.join(f.directory, '通知'))).length, 1);
});
test('write access lost during generation retains audio for a later save retry', async (t) => {
  const f = await fixture(t, async () => {
    f.write(false);
    return new Response(wave(1000), { headers: { 'Content-Type': 'audio/wav' } });
  });
  await f.generate();
  const item = f.generation.current().items[0];
  assert.equal(item.state, 'unsaved');
  assert.equal(item.canRetry, true);
  f.write(true);
  await f.generation.act(f.id, { kind: 'retry', itemId: item.id });
  assert.equal(f.generation.current().items[0].state, 'saved');
  assert.equal(f.requests.length, 1);
});
test('rename and recycle update real library membership and reject stale file mutations', async (t) => {
  const f = await fixture(t);
  await f.generate();
  const item = f.generation.current().items[0];
  await f.generation.act(f.id, { kind: 'rename', itemId: item.id, name: '完了.wav' });
  assert.equal(f.generation.current().items[0].file, '通知/完了.wav');
  assert.equal(f.settings.value.soundLibrary.groups[0].files[0].file, '通知/完了.wav');
  await fs.writeFile(path.join(f.directory, '通知/完了.wav'), wave(2000));
  await f.library.files.refresh(true);
  assert.equal(f.generation.current().items[0].state, 'changed');
  await assert.rejects(f.generation.act(f.id, { kind: 'delete', itemId: item.id }));
  assert.deepEqual(await fs.readFile(path.join(f.directory, '通知/完了.wav')), wave(2000));
  await f.generate();
  const latest = f.generation.current().items[0];
  await f.generation.act(f.id, { kind: 'delete', itemId: latest.id });
  assert.equal(f.generation.current().items.length, 1);
  assert.equal(f.settings.value.soundLibrary.groups[0].files.length, 1);
  await f.generation.act(f.id, { kind: 'close' });
});
test('cancelling generation or leaving the page creates no asset and reports no failure', async (t) => {
  const f = await fixture(
    t,
    (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener(
          'abort',
          () => reject(new DOMException('Cancelled', 'AbortError')),
          { once: true },
        ),
      ),
  );
  let task = f.generate();
  await wait(() => f.requests.length === 1);
  await f.generation.act(f.id, { kind: 'cancel' });
  await task;
  assert.equal(f.generation.current().phase, 'idle');
  assert.equal(f.generation.current().items.length, 0);
  assert.equal(f.failures(), 0);
  task = f.generate();
  await wait(() => f.requests.length === 2);
  f.generation.cancel('page');
  await task;
  await f.closed;
  assert.equal((await fs.readdir(path.join(f.directory, '通知'))).length, 0);
  assert.equal(f.failures(), 0);
});
test('invalid WAVs, invalid targets and stale session requests do not register files', async (t) => {
  const f = await fixture(
    t,
    async () => new Response('not a wav', { headers: { 'Content-Type': 'audio/wav' } }),
  );
  await f.generate();
  assert.equal(f.generation.current().items.length, 0);
  assert(f.generation.current().error);
  await assert.rejects(
    f.generation.act(f.id, {
      kind: 'generate',
      folder: '../outside',
      connectionId: 'one',
      text: 'text',
    }),
  );
  await assert.rejects(f.generation.act('stale', { kind: 'close' }));
  assert.equal((await fs.readdir(path.join(f.directory, '通知'))).length, 0);
});
test('the generation-only path enforces the library byte limit and settings cancellation', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.tts.generate(
      'host',
      { requestId: randomUUID(), text: 'text' },
      new AbortController().signal,
      50,
    ),
    (error) => error.code === 'TTS_AUDIO_TOO_LARGE',
  );
  assert.equal(f.played(), 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    f.tts.generate('host', { requestId: randomUUID(), text: 'text' }, controller.signal, 10000),
    { name: 'AbortError' },
  );
});
test('unique registration never reuses identical existing sounds and checks write access before commit', async (t) => {
  const f = await fixture(t);
  const a = await f.library.files.addVerified(wave(1000), '通知/音声.wav', { unique: true });
  const b = await f.library.files.addVerified(wave(1000), '通知/音声.wav', { unique: true });
  assert.notEqual(a.ref.file, b.ref.file);
  assert.equal(a.reused, false);
  assert.equal(b.reused, false);
  await assert.rejects(
    f.library.files.addVerified(wave(1000), '通知/音声.wav', {
      unique: true,
      writable() {
        throw Error('denied');
      },
    }),
    /denied/,
  );
  assert.equal((await fs.readdir(path.join(f.directory, '通知'))).length, 2);
});
test('each internal generation returns fresh audio even when the input request ID is repeated', async (t) => {
  const f = await fixture(t);
  const input = { requestId: 'repeated', text: 'text' };
  for (let i = 0; i < 2; i++) {
    const result = await f.tts.generate('host', input, new AbortController().signal, 100000);
    assert.deepEqual(result.bytes, wave(1000));
  }
  assert.equal(f.requests.length, 2);
  assert.equal(f.played(), 0);
});
