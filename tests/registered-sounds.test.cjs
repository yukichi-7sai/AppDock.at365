const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { RegisteredSounds } = require('../out/main/main/core/registered-sounds');
function wav(value = 0) {
  const bytes = Buffer.alloc(44);
  bytes.write('RIFF');
  bytes.write('WAVE', 8);
  bytes[43] = value;
  return bytes;
}
test('filename is the asset ID; identical files reuse it and different same-name files are rejected without overwrite', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appdock-registered-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const assets = new RegisteredSounds(path.join(root, 'registered')),
    source = path.join(root, 'ベル.wav');
  await fs.writeFile(source, wav());
  assert.equal(await assets.add(source), 'ベル.wav');
  assert.deepEqual(await assets.list(), ['ベル.wav']);
  assert.equal(await assets.add(source), 'ベル.wav');
  await fs.writeFile(source, wav(1));
  await assert.rejects(assets.add(source), /同名の別ファイル/);
  assert.deepEqual(await fs.readFile(await assets.resolve('ベル.wav')), wav());
  const other = new RegisteredSounds(path.join(root, 'another-origin'));
  assert.equal(await other.add(source), 'ベル.wav');
  assert.deepEqual(await fs.readFile(await other.resolve('ベル.wav')), wav(1));
  await fs.unlink(source);
  assert.equal(path.basename(await assets.resolve('ベル.wav')), 'ベル.wav');
  await assert.rejects(assets.resolve('../ベル.wav'));
  assert.deepEqual(await fs.readdir(path.join(root, 'registered')), ['ベル.wav']);
});
test('case-insensitive duplicate names and Windows reserved names cannot create ambiguous assets', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appdock-registered-case-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source.wav'),
    assets = new RegisteredSounds(path.join(root, 'sounds'));
  await fs.writeFile(source, wav());
  await assets.add(source, 'Bell.WAV');
  assert.equal(await assets.add(source, 'bell.wav'), 'Bell.WAV');
  await fs.writeFile(source, wav(2));
  await assert.rejects(assets.add(source, 'BELL.wav'), /同名の別ファイル/);
  await assert.rejects(assets.add(source, 'CON.wav'));
  await assert.rejects(assets.add(source, 'nested/bell.wav'));
});
