const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { importSound, managedSound, pruneSounds } = require('../out/main/main/core/sound-assets');
test('managed notification sound survives source deletion, deduplicates bytes and prunes only unused owned assets', async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'appdock-sound-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'account'),
    source = path.join(base, 'source.wav');
  const bytes = Buffer.alloc(44);
  bytes.write('RIFF');
  bytes.write('WAVE', 8);
  await fs.writeFile(source, bytes);
  const local = await importSound(root, source);
  assert.equal(managedSound(root, local), true);
  assert.notEqual(local, source);
  assert.deepEqual(await fs.readFile(local), bytes);
  assert.equal(await importSound(root, source), local);
  await fs.unlink(source);
  assert.equal(await importSound(root, local), local);
  const arbitrary = path.join(root, 'sounds', 'keep-user-file.wav');
  await fs.writeFile(arbitrary, bytes);
  await pruneSounds(root, [local]);
  assert.deepEqual(await fs.readFile(local), bytes);
  await pruneSounds(root, []);
  await assert.rejects(fs.stat(local));
  assert.deepEqual(await fs.readFile(arbitrary), bytes);
  assert.equal(managedSound(root, source), false);
});
test('bad WAV cannot replace an imported notification sound', async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'appdock-sound-invalid-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const source = path.join(base, 'bad.wav');
  await fs.writeFile(source, 'not a wave');
  await assert.rejects(importSound(base, source), /WAV/);
  await assert.rejects(importSound(base, 'https://evil.test/remote.wav'), /音声ファイル/);
  await assert.rejects(fs.stat(path.join(base, 'sounds')));
});
