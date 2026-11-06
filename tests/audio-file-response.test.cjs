const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path');
const { audioFileResponse } = require('../out/main/main/core/audio-file-response');
const { inspectSoundFile } = require('../out/main/main/core/sound-file');
const { RegisteredSoundLibrary } = require('../out/main/main/core/registered-sound-library');
const { AssignedAssets } = require('../out/main/main/core/assigned-assets');
const { wave } = require('../scripts/sound-library-fixture.cjs');
const { audioExtensions } = require('../out/main/shared/audio-formats');
const { libraryPath, soundLibraryReference } = require('../out/main/shared/library-assets');

test('media requests stream exact full, bounded and suffix ranges; invalid ranges never expose data', async (t) => {
  const root = await fs.mkdtemp(path.resolve('.artifacts/audio-range-'));
  const file = path.join(root, 'sound.wav'),
    bytes = wave(20);
  await fs.writeFile(file, bytes);
  const handle = await fs.open(file, 'r'),
    streams = new Set();
  t.after(async () => {
    for (const s of streams) s.cancel();
    await Promise.allSettled([...streams].map((s) => s.pending));
    await handle.close();
  });
  for (const [range, start, end] of [
    [null, 0, bytes.length],
    ['bytes=10-19', 10, 20],
    ['bytes=-7', bytes.length - 7, bytes.length],
    ['bytes=10-', 10, bytes.length],
  ]) {
    const response = audioFileResponse(
      new Request('https://audio.test/file', { headers: range ? { Range: range } : {} }),
      handle,
      bytes.length,
      'audio/wav',
      streams,
    );
    assert.equal(response.status, range ? 206 : 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end));
  }
  for (const range of ['bytes=99999-', 'bytes=2-1', 'bytes=0-1,3-4', 'bytes=-0', 'bytes=-']) {
    const response = audioFileResponse(
      new Request('https://audio.test/file', { headers: { Range: range } }),
      handle,
      bytes.length,
      'audio/wav',
      streams,
    );
    assert.equal(response.status, 416);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
  const head = audioFileResponse(
    new Request('https://audio.test/file', { method: 'HEAD' }),
    handle,
    bytes.length,
    'audio/wav',
    streams,
  );
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test('audio references accept supported extensions without relaxing path and assigned-hash rules', () => {
  for (const ext of audioExtensions) {
    assert.ok(libraryPath('音/大きな音.' + ext.toUpperCase(), 'sound'));
    assert.ok(soundLibraryReference('@library/@assigned/' + 'a'.repeat(64) + '.' + ext));
    assert.equal(libraryPath('../file.' + ext, 'sound'), false);
  }
  assert.equal(libraryPath('file.wma', 'sound'), false);
});

test('changed files and cancelled media requests stop their streams and release pending reads', async (t) => {
  const root = await fs.mkdtemp(path.resolve('.artifacts/audio-stream-lifetime-'));
  const file = path.join(root, 'sound.wav');
  await fs.writeFile(file, wave(100));
  const handle = await fs.open(file, 'r'),
    streams = new Set();
  t.after(async () => {
    for (const stream of streams) stream.cancel();
    await Promise.allSettled([...streams].map((s) => s.pending));
    await handle.close();
  });
  const stat = await handle.stat();
  await fs.writeFile(file, wave(200));
  const changed = audioFileResponse(
    new Request('https://audio.test/file'),
    handle,
    stat.size,
    'audio/wav',
    streams,
    stat,
  );
  await assert.rejects(changed.arrayBuffer(), /changed/);
  const controller = new AbortController();
  const cancelled = audioFileResponse(
    new Request('https://audio.test/file', { signal: controller.signal }),
    handle,
    stat.size,
    'audio/wav',
    streams,
  );
  controller.abort();
  await assert.rejects(cancelled.arrayBuffer(), /cancelled/);
});

test('file-based WAV metadata preserves padded RIFF chunk support', async () => {
  const root = await fs.mkdtemp(path.resolve('.artifacts/audio-wave-chunks-'));
  const normal = wave(100),
    padded = Buffer.concat([normal.subarray(0, 36), Buffer.alloc(2), normal.subarray(36)]);
  padded.writeUInt32LE(padded.length - 8, 4);
  padded.writeUInt32LE(17, 16);
  const file = path.join(root, 'padded.wav');
  await fs.writeFile(file, padded);
  assert.equal(await inspectSoundFile(file), 100);
});

test('files larger than 16 MiB import, inspect and retain intact without Buffer reads; conflicts preserve existing files', async (t) => {
  const root = await fs.mkdtemp(path.resolve('.artifacts/audio-large-'));
  const source = path.join(root, 'large.wav'),
    bytes = wave(1100000);
  assert.ok(bytes.length > 16 * 1024 * 1024);
  await fs.writeFile(source, bytes);
  const library = new RegisteredSoundLibrary(path.join(root, 'sounds'));
  t.after(() => library.stop());
  const originalRead = fs.readFile;
  fs.readFile = async () => {
    throw Error('Whole-file Buffer reads are forbidden in this path');
  };
  t.after(() => {
    fs.readFile = originalRead;
  });
  const added = await library.addFile(source, 'large.wav');
  const read = await library.readFile(added.ref, added.generation);
  assert.equal(read.bytes, undefined);
  assert.equal(library.entry(added.ref).durationMs, 1100000);
  assert.equal((await library.addFile(source, 'LARGE.WAV')).reused, true);
  const retained = await new AssignedAssets(library.directory, 'sound').retainFile(
    added.ref,
    read.hash,
    () => {},
  );
  await library.refresh(false, [retained.file]);
  assert.equal((await library.readFile(retained)).hash, read.hash);
  await fs.writeFile(source, wave(20));
  await assert.rejects(library.addFile(source, 'large.wav'));
  assert.equal((await library.readFile(added.ref)).hash, read.hash);
  assert.equal(await inspectSoundFile(library.file(added.ref.file)), 1100000);
  await fs.writeFile(library.file(retained.file), wave(30));
  await assert.rejects(library.readFile(retained));
});
