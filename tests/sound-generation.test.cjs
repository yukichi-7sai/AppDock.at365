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
const { GenerationStore } = require('../out/main/main/core/generation-store');
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
  const generationOptions = {
    store: new GenerationStore(path.resolve(directory, '../store-' + path.basename(directory))),
    library,
    tts,
    configuration: () => config,
    send() {},
    changed() {},
    failed() {
      failures++;
    },
  };
  const generation = new SoundGeneration(generationOptions);
  t.after(async () => {
    generation.cancel();
    await generation.close();
    await tts.close();
    library.close();
  });
  const closed = generation.open('page', '通知', 'notice');
  const id = generation.current().id;
  const enqueue = async (change = {}) => {
    await generation.act(id, {
      kind: 'generate',
      folder: '通知',
      connectionId: 'one',
      text: '完了しました。',
      ...change,
    });
    return generation.current().items[0].id;
  };
  const item = (itemId) => generation.current()?.items.find((value) => value.id === itemId);
  const settle = (itemId) => wait(() => !item(itemId)?.busy);
  const generate = async (change) => {
    const itemId = await enqueue(change);
    await settle(itemId);
    return itemId;
  };
  return {
    directory,
    settings,
    library,
    tts,
    generation,
    generationOptions,
    config,
    requests,
    id,
    generate,
    enqueue,
    item,
    settle,
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
  await f.generation.act(f.id, { kind: 'close' });
  void f.generation.open('page-reopened', '通知');
  const reopened = f.generation.current().id;
  fail = false;
  await f.generation.act(reopened, { kind: 'retry', itemId: item.id });
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
  assert.equal(item.state, 'unsaved');
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
  assert.equal(f.item(latest.id).resultDeleted, true);
  assert.equal(f.generation.current().items.length, 2);
  await f.generation.act(f.id, { kind: 'dismiss', itemId: latest.id });
  assert.equal(f.generation.current().items.length, 1);
  assert.equal(f.settings.value.soundLibrary.groups[0].files.length, 1);
  await f.generation.act(f.id, { kind: 'close' });
});
test('saved sound job removal keeps the WAV and does not return after restart', async (t) => {
  const f = await fixture(t);
  const id = await f.generate();
  const file = path.join(f.directory, f.item(id).file);
  const bytes = await fs.readFile(file);
  await f.generation.act(f.id, { kind: 'dismiss', itemId: id });
  assert.equal(f.item(id), undefined);
  assert.deepEqual(await fs.readFile(file), bytes);
  const restored = new SoundGeneration(f.generationOptions);
  assert.equal(restored.backgroundSnapshot().length, 0);
  await restored.close();
});

test('sound result deletion preserves its job across restart until explicitly dismissed', async (t) => {
  const f = await fixture(t);
  const id = await f.generate();
  const file = path.join(f.directory, f.item(id).file);
  await f.generation.act(f.id, { kind: 'deleteResults', itemId: id });
  assert.equal(f.item(id).resultDeleted, true);
  await assert.rejects(fs.readFile(file), { code: 'ENOENT' });
  f.generation.cancel();
  await f.generation.close();
  const restored = new SoundGeneration(f.generationOptions);
  void restored.open('restart', '通知');
  assert.equal(restored.current().items[0].resultDeleted, true);
  assert.equal(restored.current().items[0].id, id);
  await restored.act(restored.current().id, { kind: 'dismiss', itemId: id });
  assert.equal(restored.backgroundSnapshot().length, 0);
  restored.cancel();
  await restored.close();
});

test('sound jobs with pending classification require save or a verified rescue before X removes them', async (t) => {
  const f = await fixture(t);
  f.failSettings(true);
  const id = await f.generate();
  assert.equal(f.item(id).state, 'unsaved');
  await assert.rejects(f.generation.act(f.id, { kind: 'dismiss', itemId: id }), /保存|save/);
  assert(f.item(id).hasResult);
  const file = path.join(f.directory, 'rescued.wav');
  f.generationOptions.export = async ([result]) => {
    await fs.writeFile(file, result.bytes);
    return [
      {
        id: result.id,
        file,
        hash: require('node:crypto').createHash('sha256').update(result.bytes).digest('hex'),
      },
    ];
  };
  await f.generation.act(f.id, { kind: 'export', itemId: id });
  await f.generation.act(f.id, { kind: 'dismiss', itemId: id });
  assert.equal(f.item(id), undefined);
  assert.deepEqual(await fs.readFile(file), wave(1000));
  assert.equal(f.requests.length, 1);
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
  let itemId = await f.enqueue();
  await wait(() => f.requests.length === 1);
  await f.generation.act(f.id, { kind: 'cancel', itemId });
  assert.equal(f.item(itemId).state, 'canceled');
  assert.equal(f.item(itemId).busy, false);
  assert.equal(f.failures(), 0);
  itemId = await f.enqueue();
  await wait(() => f.requests.length === 2);
  f.generation.cancel('page');
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
  assert.equal(f.generation.current().items.length, 1);
  assert.equal(f.generation.current().items[0].state, 'failed');
  assert(f.generation.current().items[0].error);
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
test('the generation-only path preserves settings cancellation', async (t) => {
  const f = await fixture(t);
  assert.equal(f.played(), 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    f.tts.generate('host', { requestId: randomUUID(), text: 'text' }, controller.signal),
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
    const result = await f.tts.generate('host', input, new AbortController().signal);
    assert.deepEqual(result.bytes, wave(1000));
  }
  assert.equal(f.requests.length, 2);
  assert.equal(f.played(), 0);
});

function delayedAudio() {
  const responses = [];
  return {
    responses,
    fetcher: (_url, init) =>
      new Promise((resolve, reject) => {
        responses.push(() =>
          resolve(new Response(wave(1000), { headers: { 'Content-Type': 'audio/wav' } })),
        );
        init.signal.addEventListener(
          'abort',
          () => reject(new DOMException('Cancelled', 'AbortError')),
          { once: true },
        );
      }),
  };
}
test('requests add cards immediately and preserve per-card inputs in the shared FIFO', async (t) => {
  const delayed = delayedAudio(),
    f = await fixture(t, delayed.fetcher);
  const first = await f.enqueue({ text: '一番目', instructions: '静かに' });
  await wait(() => delayed.responses.length === 1);
  const second = await f.enqueue({ text: '二番目', instructions: '明るく', folder: '' });
  const third = await f.enqueue({ text: '三番目' });
  assert.equal(f.item(first).state, 'generating');
  assert.equal(f.item(second).state, 'queued');
  assert.equal(f.item(third).state, 'queued');
  assert.equal(delayed.responses.length, 1);
  delayed.responses[0]();
  await wait(() => delayed.responses.length === 2);
  assert.equal(f.requests[1].input, '二番目');
  assert.equal(f.requests[1].instructions, '日本語\n明るく');
  delayed.responses[1]();
  await wait(() => delayed.responses.length === 3);
  delayed.responses[2]();
  await Promise.all([first, second, third].map(f.settle));
  assert.equal(f.item(second).file, '二番目-001.wav');
  assert.equal(f.item(first).file, '通知/一番目-001.wav');
  assert.deepEqual(
    f.requests.map((r) => r.input),
    ['一番目', '二番目', '三番目'],
  );
});
test('canceling one queued or generating card leaves other requests intact', async (t) => {
  const delayed = delayedAudio(),
    f = await fixture(t, delayed.fetcher);
  const first = await f.enqueue({ text: '一番目' });
  await wait(() => delayed.responses.length === 1);
  const second = await f.enqueue({ text: '二番目' });
  const third = await f.enqueue({ text: '三番目' });
  await f.generation.act(f.id, { kind: 'cancel', itemId: second });
  assert.equal(f.item(second).state, 'canceled');
  assert.equal(f.item(first).state, 'generating');
  await f.generation.act(f.id, { kind: 'cancel', itemId: first });
  await wait(() => delayed.responses.length === 2);
  assert.equal(f.requests[1].input, '三番目');
  delayed.responses[1]();
  await f.settle(third);
  assert.equal(f.item(third).state, 'saved');
  assert.equal(f.failures(), 0);
});
test('saved cards can be renamed and deleted while later generation is pending', async (t) => {
  let pending = false;
  const delayed = delayedAudio();
  const f = await fixture(t, (url, init) =>
    pending
      ? delayed.fetcher(url, init)
      : new Response(wave(1000), { headers: { 'Content-Type': 'audio/wav' } }),
  );
  const saved = await f.generate();
  pending = true;
  const next = await f.enqueue();
  await wait(() => delayed.responses.length === 1);
  await f.generation.act(f.id, { kind: 'rename', itemId: saved, name: '変更.wav' });
  assert.equal(f.item(saved).file, '通知/変更.wav');
  assert.equal(f.item(next).state, 'generating');
  await f.generation.act(f.id, { kind: 'delete', itemId: saved });
  assert.equal(f.item(saved).resultDeleted, true);
  delayed.responses[0]();
  await f.settle(next);
  assert.equal(f.item(next).state, 'saved');
});
test('a failed card does not stop the queue and regeneration reuses its captured input', async (t) => {
  let invalid = true;
  const f = await fixture(t, async () => {
    const bytes = invalid ? Buffer.from('bad') : wave(1000);
    invalid = false;
    return new Response(bytes, { headers: { 'Content-Type': 'audio/wav' } });
  });
  const first = await f.enqueue({ text: '再生成の本文' });
  const second = await f.enqueue({ text: '次の本文' });
  await Promise.all([first, second].map(f.settle));
  assert.equal(f.item(first).state, 'failed');
  assert.equal(f.item(second).state, 'saved');
  await f.generation.act(f.id, { kind: 'regenerate', itemId: first });
  const retry = f.generation.current().items[0].id;
  assert.notEqual(retry, first);
  await f.settle(retry);
  assert.equal(f.item(retry).state, 'saved');
  assert.equal(f.item(first).state, 'failed');
  assert.equal(f.requests[2].input, '再生成の本文');
  assert.equal(f.generation.current().items.length, 3);
});
test('closing keeps every generation and unrelated speech in the shared FIFO', async (t) => {
  const delayed = delayedAudio();
  let pending = false;
  const f = await fixture(t, (url, init) =>
    pending
      ? delayed.fetcher(url, init)
      : new Response(wave(1000), { headers: { 'Content-Type': 'audio/wav' } }),
  );
  const saved = await f.generate(),
    file = f.item(saved).file;
  pending = true;
  await f.enqueue();
  await wait(() => delayed.responses.length === 1);
  await f.enqueue();
  const foreign = f.tts.speak('other', { text: '別の読み上げ', requestId: randomUUID() });
  await f.generation.act(f.id, { kind: 'close' });
  await f.closed;
  assert.equal(delayed.responses.length, 1);
  delayed.responses[0]();
  await wait(() => delayed.responses.length === 2);
  delayed.responses[1]();
  await wait(() => delayed.responses.length === 3);
  assert.equal(f.requests.at(-1).input, '別の読み上げ');
  delayed.responses[2]();
  await wait(() => f.tts.get('other', foreign.jobId).state === 'completed');
  assert.deepEqual(await fs.readFile(path.join(f.directory, file)), wave(1000));
  void f.generation.open('returned', '通知');
  await wait(() => f.generation.current().items.every((item) => !item.busy));
  assert.equal(f.generation.current().items.filter((item) => item.state === 'saved').length, 3);
});
test('filenames use up to twenty complete characters with a safe, collision-free serial', async (t) => {
  const f = await fixture(t);
  const text = 'これは音声ファイル名に使う文章です。ここから先も続きます。';
  const first = await f.generate({ text }),
    second = await f.generate({ text });
  const prefix = Array.from(text).slice(0, 20).join('');
  assert.equal(f.item(first).file, `通知/${prefix}-001.wav`);
  assert.equal(f.item(second).file, `通知/${prefix}-002.wav`);
  for (const text of ['CON', 'a/b:c*?<>|"\nend', '...']) {
    const id = await f.generate({ text });
    assert.equal(f.item(id).state, 'saved');
    if (text === 'CON') assert.equal(path.basename(f.item(id).file), '_CON-001.wav');
    if (text === '...') assert.equal(path.basename(f.item(id).file), '音声-001.wav');
    assert(!/[\\:*?<>|"\r\n]/.test(path.basename(f.item(id).file)));
  }
  const emoji = '👨‍👩‍👧‍👦';
  const id = await f.generate({ text: emoji.repeat(25) });
  const stem = path.basename(f.item(id).file).replace(/-001\.wav$/, '');
  assert(stem.length <= 150);
  assert.equal(stem, emoji.repeat(stem.length / emoji.length));
});
test('page disposal prevents an accepted preview from starting after the session ends', async (t) => {
  const f = await fixture(t);
  const itemId = await f.generate();
  let previews = 0;
  f.library.preview.play = async () => {
    previews++;
  };
  const preview = f.generation.act(f.id, { kind: 'play', itemId });
  f.generation.cancel('page');
  await assert.rejects(preview, { name: 'AbortError' });
  assert.equal(previews, 0);
  assert.equal(f.failures(), 0);
});

test('unsaved WAVs and group-only failures recover after reconstruction without generating again', async (t) => {
  const f = await fixture(t);
  f.failSettings(true);
  const id = await f.generate();
  assert.equal(f.item(id).state, 'unsaved');
  const file = f.item(id).file;
  f.generation.cancel();
  await f.generation.close();
  f.failSettings(false);
  const restored = new SoundGeneration({
    ...f.generationOptions,
    store: new GenerationStore(f.generationOptions.store.directory),
  });
  t.after(() => restored.close());
  void restored.open('recovered', '通知');
  const session = restored.current().id;
  await wait(() => restored.current().items[0].canRetry);
  assert.equal(restored.current().items[0].id, id);
  await restored.act(session, { kind: 'retry', itemId: id });
  assert.equal(restored.current().items[0].state, 'saved');
  assert.equal(restored.current().items[0].file, file);
  assert.equal(f.requests.length, 1);
  assert.equal((await fs.readdir(path.join(f.directory, '通知'))).length, 1);
  assert.deepEqual(await fs.readFile(path.join(f.directory, file)), wave(1000));
  restored.cancel();
});

test('a completed WAV received during cancellation is retained until the transport settles', async (t) => {
  let release;
  const f = await fixture(
    t,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const id = await f.enqueue();
  await wait(() => release);
  const cancel = f.generation.act(f.id, { kind: 'cancel', itemId: id });
  release(new Response(wave(1000), { headers: { 'Content-Type': 'audio/wav' } }));
  await cancel;
  assert.equal(f.item(id).state, 'unsaved');
  const record = f.generationOptions.store.load('sound')[0];
  assert.deepEqual(f.generationOptions.store.read(record, id), wave(1000));
  await f.generation.act(f.id, { kind: 'retry', itemId: id });
  assert.equal(f.item(id).state, 'saved');
  assert.equal(f.requests.length, 1);
});
