const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WebAccountGroup } = require('../out/main/main/core/web-account-groups');

function fixture() {
  const root = fs.mkdtempSync(path.resolve('.artifacts/file-watch-rosters-'));
  const jobs = new Map();
  const assistance = {
    register(id, check) {
      assert(!jobs.has(id), 'duplicate roster registration');
      jobs.set(id, check);
      return () => jobs.delete(id);
    },
  };
  return { root, jobs, assistance };
}
const listener = () => ({ changed() {}, removing() {}, failed() {} });

test('shared account subscribers own one assistance registration until the last subscriber leaves', (t) => {
  const f = fixture();
  const group = new WebAccountGroup(
    'fixture.shared',
    path.join(f.root, 'data'),
    path.join(f.root, 'local'),
    (sound) => sound,
    f.assistance,
  );
  const first = group.subscribe(listener());
  const second = group.subscribe(listener());
  t.after(() => {
    first();
    second();
  });
  assert.equal(f.jobs.size, 1);
  assert.equal(fs.existsSync(group.file), false, 'watching does not create an empty roster');
  first();
  assert.equal(f.jobs.size, 1);
  second();
  assert.equal(f.jobs.size, 0);
  const later = group.subscribe(listener());
  assert.equal(f.jobs.size, 1);
  later();
  assert.equal(f.jobs.size, 0);
});
