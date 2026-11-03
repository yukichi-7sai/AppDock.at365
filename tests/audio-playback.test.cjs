const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AudioPlaybackQueue } = require('../out/main/main/core/audio-playback');
const { TtsService } = require('../out/main/main/core/tts-service');
const { defaultTtsSettings } = require('../out/main/shared/tts');
const turn = () => new Promise((r) => setImmediate(r));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const request = (label, signal) => ({ bytes: Buffer.from(label), signal, playbackTimeoutMs: 1000 });
function controlled() {
  const events = [],
    releases = [];
  let active = 0,
    peak = 0;
  const queue = new AudioPlaybackQueue(async (r) => {
    r.beforePlay?.();
    if (r.signal.aborted) return;
    active++;
    peak = Math.max(peak, active);
    events.push('start:' + r.bytes.toString());
    await new Promise((resolve) => {
      releases.push(resolve);
      r.signal.addEventListener('abort', resolve, { once: true });
    });
    events.push('end:' + r.bytes.toString());
    active--;
  });
  return { queue, events, releases, peak: () => peak };
}
test('speech, notification and preview share FIFO; canceled waiting bytes never play', async () => {
  const f = controlled(),
    canceled = new AbortController();
  const first = f.queue.play(request('speech'));
  const skip = f.queue.play(request('canceled', canceled.signal));
  const second = f.queue.play(request('gmail'));
  const third = f.queue.play(request('preview'));
  await turn();
  canceled.abort();
  await skip;
  f.releases.shift()();
  await first;
  await turn();
  f.releases.shift()();
  await second;
  await turn();
  f.releases.shift()();
  await third;
  assert.deepEqual(f.events, [
    'start:speech',
    'end:speech',
    'start:gmail',
    'end:gmail',
    'start:preview',
    'end:preview',
  ]);
  assert.equal(f.peak(), 1);
  await f.queue.close();
});
test('active cancellation finishes cleanup before next playback; close cancels all and rejects new work', async () => {
  const f = controlled(),
    controller = new AbortController();
  const a = f.queue.play(request('a', controller.signal));
  const b = f.queue.play(request('b'));
  await turn();
  controller.abort();
  await a;
  await turn();
  assert.deepEqual(f.events, ['start:a', 'end:a', 'start:b']);
  const c = f.queue.play(request('c'));
  await f.queue.close();
  await Promise.all([b, c]);
  assert.deepEqual(f.events, ['start:a', 'end:a', 'start:b', 'end:b']);
  assert.equal(f.peak(), 1);
  await assert.rejects(f.queue.play(request('late')), /終了/);
});
test('failure releases the queue; capacity and wait deadlines are bounded', async () => {
  let release;
  const q = new AudioPlaybackQueue(
    async (r) => {
      if (r.bytes.toString() === 'bad') throw Error('bad audio');
      if (r.bytes.toString() === 'hold')
        await new Promise((resolve) => {
          release = resolve;
        });
    },
    2,
    20,
  );
  await assert.rejects(q.play(request('bad')), /bad audio/);
  const held = q.play(request('hold'));
  await turn();
  const timed = q.play(request('wait'));
  const timeout = assert.rejects(timed, /待ち時間/);
  await assert.rejects(q.play(request('overflow')), /多すぎ/);
  await timeout;
  release();
  await held;
  await q.play(request('good'));
  await q.close();
});
function wave() {
  const b = Buffer.alloc(204);
  b.write('RIFF');
  b.writeUInt32LE(196, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(160, 40);
  return b;
}
test('stop all cancels playing and waiting audio without muting future requests', async () => {
  const f = controlled();
  const first = f.queue.play(request('active'));
  const waiting = f.queue.play(request('waiting'));
  await turn();
  await f.queue.stopAll();
  await Promise.all([first, waiting]);
  assert.deepEqual(f.events, ['start:active', 'end:active']);
  const fresh = f.queue.play(request('fresh'));
  await turn();
  assert.equal(f.events.at(-1), 'start:fresh');
  f.releases.pop()();
  await fresh;
  await f.queue.close();
});
test('OFF stops active audio, drops waiting and new audio, and ON only plays fresh audio', async () => {
  const f = controlled();
  const first = f.queue.play(request('active'));
  const waiting = f.queue.play(request('waiting'));
  await turn();
  f.queue.setEnabled(false);
  await f.queue.play({ ...request('muted'), beforePlay: () => assert.fail('muted started') });
  f.queue.setEnabled(true);
  const fresh = f.queue.play(request('fresh'));
  await Promise.all([first, waiting]);
  await turn();
  assert.deepEqual(f.events, ['start:active', 'end:active', 'start:fresh']);
  // The first player's release is retained by the fixture after cancellation.
  f.releases.pop()();
  await fresh;
  assert.equal(f.peak(), 1);
  await f.queue.close();
});

test('OFF before the next microtask drops audio without constructing a player', async () => {
  const q = new AudioPlaybackQueue(async () => assert.fail('muted player'));
  const pending = q.play(request('pending'));
  q.setEnabled(false);
  await pending;
  for (let i = 0; i < 60; i++) await q.play(request('muted'));
  q.setEnabled(true);
  await q.close();
});

test('muted TTS still generates and completes without claiming playback or blocking the next job', async () => {
  const f = controlled();
  f.queue.setEnabled(false);
  let generated = 0;
  const tts = new TtsService({
    settings: () => ({
      ...defaultTtsSettings(),
      baseUrl: 'http://localhost/v1',
      model: 'fixture',
      defaultVoice: 'fixture',
    }),
    key: () => undefined,
    canUse: () => true,
    fetcher: async () => {
      generated++;
      return new Response(wave(), { headers: { 'Content-Type': 'audio/wav' } });
    },
    play: (bytes, seconds, signal, speed, beforePlay) =>
      f.queue.play({ bytes, signal, speed, beforePlay, playbackTimeoutMs: 1000 }),
  });
  const jobs = ['one', 'two'].map((requestId) => tts.speak('host', { text: 'fixture', requestId }));
  for (let i = 0; i < 20 && jobs.some((j) => tts.get('host', j.jobId).state !== 'completed'); i++)
    await turn();
  assert.equal(generated, 2);
  assert.deepEqual(
    jobs.map((j) => tts.get('host', j.jobId).state),
    ['completed', 'completed'],
  );
  assert.deepEqual(f.events, []);
  await tts.close();
  await f.queue.close();
});
test('TTS generation leaves audio free; waiting playback retains start deadline and is canceled without sound', async () => {
  const f = controlled();
  let downloaded;
  const tts = new TtsService({
    settings: () => ({
      ...defaultTtsSettings(),
      baseUrl: 'http://localhost/v1',
      model: 'fixture',
      defaultVoice: 'fixture',
    }),
    key: () => undefined,
    canUse: () => true,
    fetcher: async () => {
      await new Promise((r) => {
        downloaded = r;
      });
      return new Response(wave(), { headers: { 'Content-Type': 'audio/wav' } });
    },
    play: (bytes, seconds, signal, speed, beforePlay) =>
      f.queue.play({ bytes, signal, speed, beforePlay, playbackTimeoutMs: 1000 }),
  });
  const job = tts.speak(
    'host',
    { text: 'fixture', requestId: 'one' },
    { startBefore: Date.now() + 200 },
  );
  await turn();
  assert.equal(tts.get('host', job.jobId).state, 'generating');
  const notification = f.queue.play(request('gmail'));
  await turn();
  assert.deepEqual(f.events, ['start:gmail']);
  downloaded();
  await delay(15);
  assert.equal(tts.get('host', job.jobId).state, 'waitingPlayback');
  await delay(220);
  assert.equal(tts.get('host', job.jobId).state, 'canceled');
  f.releases.shift()();
  await notification;
  await turn();
  assert.deepEqual(f.events, ['start:gmail', 'end:gmail']);
  await tts.close();
  await f.queue.close();
});
