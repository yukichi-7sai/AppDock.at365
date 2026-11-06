// Fetch Chromium's short media test clips only for local decoder verification.
// No downloaded media is included in the product or committed to the repository.
const fs = require('node:fs/promises'),
  path = require('node:path');
const { createHash } = require('node:crypto');
const fixtures = [
  ['mp3', 'sfx.mp3', '46364ebce1b9b2f278b35a7dc05b10427a33c073cf085cfa1a4ab33f3d307565'],
  ['aac', 'sfx.adts', '37fbe1221a9da383f857b2ce9407892386be93da1f3101545917866476c93cad'],
  ['m4a', 'sfx.m4a', '55d22abaade1ba04cc7a5063c4d5ef008be82965b1a1ef6675c3bce6d30acb77'],
  ['flac', 'sfx.flac', '5f4d585500284beee09124fcc3fa2a45d5931f0241d089a817ae3940bbc90ad0'],
  ['ogg', 'sfx.ogg', 'd38a6edbd595aafa08cef3f1749acdeafb4f471cb4fc4b37679292936ca6d89c'],
  ['opus', 'sfx-opus.ogg', '97020fece49ef9176f4e0ad83ef8cda0a0415691080d2c41859ba2673c2f1834'],
  ['webm', 'sfx-opus-441.webm', '410b4d3cce27ca837706ea42e85ea1079211d5e5a70db8a6ffd43b7fc2254811'],
];
(async () => {
  const directory = path.resolve(__dirname, '../.artifacts/audio-codec-fixtures');
  await fs.mkdir(directory, { recursive: true });
  const manifest = [];
  for (const [ext, name, expected] of fixtures) {
    const file = 'sample.' + ext,
      destination = path.join(directory, file);
    const source = `https://chromium.googlesource.com/chromium/src/+/main/media/test/data/${name}?format=TEXT`;
    let bytes = await fs.readFile(destination).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (!bytes) {
      const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error(`Fixture download failed: ${response.status} ${name}`);
      bytes = Buffer.from(await response.text(), 'base64');
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== expected) throw Error(`Fixture SHA256 mismatch: ${name}`);
    await fs.writeFile(destination, bytes);
    manifest.push({ file, source, sha256, bytes: bytes.length });
  }
  await fs.writeFile(
    path.join(directory, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  console.log(JSON.stringify({ directory, verified: manifest.length }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
