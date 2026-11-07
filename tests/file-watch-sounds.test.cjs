const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path');
const { RegisteredSoundLibrary } = require('../out/main/main/core/registered-sound-library');
const { wave } = require('../scripts/sound-library-fixture.cjs');
async function until(check) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    assert(Date.now() < deadline, 'shared sound index did not settle');
    await new Promise((r) => setTimeout(r, 10));
  }
}
test('shared sound library receives native file arrival and removal and stop preserves user files', async (t) => {
  const root = await fs.mkdtemp(path.resolve('.artifacts/file-watch-sounds-'));
  let changed = 0;
  const library = new RegisteredSoundLibrary(root, () => changed++);
  t.after(async () => {
    library.stop();
    await fs.rm(root, { recursive: true, force: true });
  });
  await library.watch();
  await fs.writeFile(path.join(root, 'arrived.wav'), wave(100));
  await until(() => library.list().some((e) => e.ref.file === 'arrived.wav'));
  assert(changed > 0);
  await fs.unlink(path.join(root, 'arrived.wav'));
  await until(() => !library.list().some((e) => e.ref.file === 'arrived.wav'));
  await fs.writeFile(path.join(root, 'preserved.wav'), wave(200));
  await until(() => library.list().some((e) => e.ref.file === 'preserved.wav'));
  library.stop();
  assert.deepEqual(await fs.readFile(path.join(root, 'preserved.wav')), wave(200));
});
