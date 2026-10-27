const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readObservedFile } = require('../out/main/main/core/file-reader');
const { atomicWrite } = require('../out/main/main/core/settings');

function fixture() {
  const root = fs.mkdtempSync(path.resolve('.artifacts/file-reader-'));
  return { root, file: path.join(root, 'settings.json') };
}

test('reader handles simultaneous requests, UTF-8, empty files and errors without blocking later reads', async () => {
  const { root, file } = fixture();
  const other = path.join(root, 'other.json');
  const text = JSON.stringify({ label: '設定🌙', padding: 'x'.repeat(34 * 1024) });
  fs.writeFileSync(file, text);
  fs.writeFileSync(other, '');
  assert.deepEqual(await Promise.all([readObservedFile(file), readObservedFile(other)]), [
    text,
    '',
  ]);
  await assert.rejects(readObservedFile(path.join(root, 'missing.json')), { code: 'ENOENT' });
  fs.writeFileSync(other, Buffer.alloc(4 * 1024 * 1024 + 1));
  await assert.rejects(readObservedFile(other), { code: 'EFBIG' });
  fs.writeFileSync(other, Buffer.alloc(4 * 1024 * 1024, 120));
  assert.equal((await readObservedFile(other)).length, 4 * 1024 * 1024);
  assert.equal(await readObservedFile(file), text);
});

test('overlapping observer reads release their handles while the main thread saves repeatedly', async () => {
  const { file, root } = fixture();
  const text = JSON.stringify({ padding: 'x'.repeat(34 * 1024) });
  fs.writeFileSync(file, text);
  await readObservedFile(file); // Start the shared worker before exercising contention.
  for (let i = 0; i < 100; i++) {
    const pending = readObservedFile(file);
    await new Promise(setImmediate);
    const replacement = text + ' '.repeat(i % 2);
    atomicWrite(file, replacement);
    assert([text, text + ' '].includes(await pending));
    assert.equal(fs.readFileSync(file, 'utf8'), replacement);
  }
  assert.deepEqual(fs.readdirSync(root), ['settings.json']);
});
