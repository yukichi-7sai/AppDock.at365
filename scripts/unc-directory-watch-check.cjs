const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  NativeDirectoryWatchService,
  useDirectoryWatchService,
} = require('../out/main/main/core/directory-watch');
const { observeFile } = require('../out/main/main/core/file-observer');
const { safeDirectoryAsync } = require('../out/main/main/core/library-files');
const share = path.resolve(process.argv[2]);
const executable = path.resolve(
  process.argv[3] || '.artifacts/dotnet-host/file-watch/AppDock.FileWatchHost.exe',
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 10000; // Test observation bound only.
  while (!(await check())) {
    assert(Date.now() < deadline, 'UNC change did not arrive');
    await delay(20);
  }
}
(async () => {
  const evidence = await fs.mkdtemp(path.resolve('.artifacts/unc-directory-watch-'));
  const fixture = await fs.mkdtemp(path.join(share, 'appdock-native-watch-'));
  const events = [],
    accepted = [],
    errors = [];
  const service = new NativeDirectoryWatchService(executable, (error) =>
    errors.push(String(error)),
  );
  useDirectoryWatchService(service);
  let observer, watcher;
  try {
    assert.equal(await safeDirectoryAsync(share, ''), share);
    watcher = service.watch(share, true, (kind, name) => {
      if (name?.startsWith(path.basename(fixture) + path.sep)) events.push({ kind, name });
    });
    watcher.on('error', (error) => errors.push(String(error)));
    await watcher.ready;
    await fs.writeFile(path.join(fixture, 'settings.json'), '{"value":1}', { flag: 'wx' });
    observer = observeFile(
      path.join(fixture, 'settings.json'),
      (text) => accepted.push(text),
      (error) => errors.push(String(error)),
    );
    await until(() => accepted.includes('{"value":1}'));
    await fs.writeFile(path.join(fixture, 'settings.json'), '{"value":2}');
    await until(() => accepted.includes('{"value":2}'));
    await fs.writeFile(path.join(fixture, 'one.txt'), 'one', { flag: 'wx' });
    await until(() => events.some((e) => e.name.endsWith('one.txt')));
    await fs.rename(path.join(fixture, 'one.txt'), path.join(fixture, 'two.txt'));
    await until(() => events.some((e) => e.name.endsWith('two.txt')));
    events.length = 0;
    await fs.unlink(path.join(fixture, 'two.txt'));
    await until(() => events.some((e) => e.kind === 'rename' && e.name.endsWith('two.txt')));
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(evidence, 'result.json'),
      JSON.stringify(
        {
          ok: true,
          executable,
          share,
          accepted,
          checks: [
            'UNC share root canonical path',
            'recursive share-root create/rename/delete',
            'UNC settings reception with assistance OFF',
          ],
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ ok: true, evidence }));
  } catch (error) {
    await fs.writeFile(
      path.join(evidence, 'failure.json'),
      JSON.stringify({ error: String(error.stack), errors, accepted, events }, null, 2),
    );
    throw error;
  } finally {
    observer?.close();
    watcher?.close();
    service.close();
    useDirectoryWatchService(undefined);
    for (const name of ['settings.json', 'one.txt', 'two.txt'])
      await fs.unlink(path.join(fixture, name)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    await fs.rmdir(fixture);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
