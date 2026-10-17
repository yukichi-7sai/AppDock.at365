const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const { WindowsLaunch } = require('../out/main/main/core/windows-launch');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const root = path.resolve(__dirname, '../.artifacts', `launch-recovery-${Date.now()}`);
fs.mkdirSync(root, { recursive: true });
let sequence = 0;
function fixture(saved = false) {
  const file = path.join(root, String(sequence++), 'launch.json');
  const before = {
    administratorAccount: true,
    elevated: false,
    sid: 'S-1-5-21-123',
    xml: null,
    registered: false,
    taskElevated: false,
  };
  const after = { ...before, xml: '<new-task/>', registered: true };
  let actual = structuredClone(before),
    mutations = 0;
  const launch = new WindowsLaunch(
    'C:\\AppDock\\AppDock.at365.exe',
    'C:\\AppDock',
    [],
    true,
    async () => '',
    undefined,
    { file, desiredSaved: () => saved },
  );
  launch.read = async () => structuredClone(actual);
  launch.mutate = async () => {
    mutations++;
    actual = mutations === 1 ? structuredClone(after) : structuredClone(before);
  };
  const record = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        before,
        next: { startAtLogon: true, runAsAdministrator: false },
        afterXml: after.xml,
      }),
    );
  };
  return {
    launch,
    file,
    before,
    after,
    record,
    actual: (value) => {
      if (value) actual = value;
      return actual;
    },
    mutations: () => mutations,
  };
}
test('Windows task intent is durable before mutation and JSON failure restores the task', async () => {
  const f = fixture();
  let calls = 0;
  f.launch.mutate = async () => {
    assert.equal(fs.existsSync(f.file), true);
    f.actual(++calls === 1 ? f.after : f.before);
  };
  const previous = createDefaultSettings().host,
    next = { ...previous, startAtLogon: true };
  await assert.rejects(
    () =>
      f.launch.save(
        next,
        previous,
        () => {},
        () => {
          throw Error('disk failure');
        },
      ),
    /disk failure/,
  );
  assert.equal(fs.existsSync(f.file), false);
  assert.deepEqual(f.actual(), f.before);
});
test('startup detects an interrupted task without replaying Windows changes or UAC', async () => {
  const f = fixture();
  f.record();
  f.actual(f.after);
  await f.launch.checkRecovery();
  assert.equal(f.launch.recoveryPending, true);
  assert.equal(f.mutations(), 0);
  f.launch.mutate = async () => f.actual(f.before);
  await f.launch.recoverSavedTask();
  assert.equal(f.launch.recoveryPending, false);
  assert.equal(fs.existsSync(f.file), false);
});
test('already committed desired registration only clears the receipt', async () => {
  const f = fixture(true);
  f.record();
  f.actual(f.after);
  await f.launch.checkRecovery();
  assert.equal(f.mutations(), 0);
  assert.equal(fs.existsSync(f.file), false);
});
test('external task XML is preserved during explicit recovery', async () => {
  const f = fixture();
  f.record();
  f.actual({ ...f.after, xml: '<externally-changed/>' });
  await f.launch.checkRecovery();
  await assert.rejects(() => f.launch.recoverSavedTask(), /外部/);
  assert.equal(f.mutations(), 0);
  assert.equal(fs.existsSync(f.file), true);
});
