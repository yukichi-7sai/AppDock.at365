const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path');
const { RegisteredSoundLibrary } = require('../out/main/main/core/registered-sound-library');
const { wave } = require('../scripts/sound-library-fixture.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.resolve('.artifacts/registered-library-sound-'));
  const library = new RegisteredSoundLibrary(path.join(root, 'sounds'));
  t.after(async () => {
    library.stop();
    await fs.rm(root, { recursive: true, force: true });
  });
  const source = path.join(root, 'source.wav');
  await fs.writeFile(source, wave(100));
  return { root, library, source };
}
test('shared library file copies reuse identical names and reject replacement without altering audio', async (t) => {
  const f = await fixture(t);
  const first = await f.library.addFile(f.source, 'ベル.wav');
  const again = await f.library.addFile(f.source, 'ベル.wav');
  assert.deepEqual(again.ref, first.ref);
  await fs.writeFile(f.source, wave(200));
  await assert.rejects(f.library.addFile(f.source, 'ベル.wav'), /同名の別音/);
  assert.deepEqual(await fs.readFile(f.library.file(first.ref.file)), wave(100));
  await fs.unlink(f.source);
  assert.deepEqual(await fs.readFile((await f.library.readFile(first.ref)).file), wave(100));
});
test('permanently removed sound is restored from its recovery copy after a settings failure', async (t) => {
  const f = await fixture(t);
  const saved = await f.library.addFile(f.source, 'restore.wav');
  const original = await fs.readFile(f.source);
  await assert.rejects(
    f.library.remove(saved.ref, f.library.entry(saved.ref).generation, {
      trash: (file) => fs.unlink(file),
      prepare: () => () => {
        throw Error('save failed');
      },
      failureMessage: 'permanent deletion failed',
    }),
    /save failed/,
  );
  assert.deepEqual(await fs.readFile(f.library.file(saved.ref.file)), original);
  assert.deepEqual(await fs.readdir(path.dirname(f.library.file(saved.ref.file))), ['restore.wav']);
});
test('shared sound names remain case-insensitive and reject reserved names and traversal while supporting folders', async (t) => {
  const f = await fixture(t);
  await f.library.addFile(f.source, 'Bell.WAV');
  assert.equal((await f.library.addFile(f.source, 'bell.wav')).ref.file, 'Bell.WAV');
  for (const name of ['CON.wav', '../bell.wav'])
    await assert.rejects(f.library.addFile(f.source, name));
  assert.equal((await f.library.addFile(f.source, 'folder/bell.wav')).ref.file, 'folder/bell.wav');
});
