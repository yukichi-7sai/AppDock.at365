const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { RemotePageService } = require('../out/main/main/core/remote-pages');

function fixture(t) {
  const directory = path.resolve('.artifacts/remote-pages-accounts-unit', randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'accounts.json');
  const accounts = ['Target', 'Keep'].map((name) => ({ id: `account.${randomUUID()}`, name }));
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, accounts }));
  const items = [];
  const service = new RemotePageService(
    () => items,
    path.join(directory, 'local'),
    () => {},
    file,
  );
  const calls = [];
  const session = Object.fromEntries(
    ['clearStorageData', 'clearCache', 'clearAuthCache', 'closeAllConnections'].map((method) => [
      method,
      async () => calls.push(method),
    ]),
  );
  session.cookies = { flushStore: async () => calls.push('flushStore') };
  service.account = () => session;
  t.after(() => service.close());
  return { service, accounts, items, calls, file, session };
}

test('confirmed clear erases only session data, while confirmed deletion preserves the other account', async (t) => {
  const f = fixture(t);
  const [target, keep] = f.accounts;
  assert.equal(await f.service.clearAccount(target.id, target), true);
  assert.deepEqual(f.calls, [
    'clearStorageData',
    'clearCache',
    'clearAuthCache',
    'closeAllConnections',
    'flushStore',
  ]);
  assert.deepEqual(f.service.accounts(), f.accounts);
  assert.equal(await f.service.deleteAccount(target.id, target), 'deleted');
  assert.deepEqual(f.service.accounts(), [keep]);
});

test('stale names, mismatched IDs and externally changed roster refuse before erasing data', async (t) => {
  const f = fixture(t);
  const [target] = f.accounts;
  for (const method of ['clearAccount', 'deleteAccount']) {
    await assert.rejects(f.service[method](target.id, { ...target, name: 'Stale' }), /変更/);
    await assert.rejects(f.service[method](target.id, { ...target, id: f.accounts[1].id }), /変更/);
  }
  fs.writeFileSync(
    f.file,
    JSON.stringify({
      schemaVersion: 1,
      accounts: [{ ...target, name: 'External' }, f.accounts[1]],
    }),
  );
  await assert.rejects(f.service.clearAccount(target.id, target), /変更/);
  assert.deepEqual(f.calls, []);
});

test('new references and concurrent work block deletion; failure releases the operation lock for retry', async (t) => {
  const f = fixture(t);
  const [target] = f.accounts;
  f.items.push({ accountId: target.id });
  await assert.rejects(f.service.deleteAccount(target.id, target), /使用中/);
  f.items.length = 0;
  let release;
  f.session.clearStorageData = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = f.service.clearAccount(target.id, target);
  await assert.rejects(f.service.deleteAccount(target.id, target), /処理中/);
  release();
  await pending;
  f.session.clearStorageData = async () => {
    throw Error('Fixture erase failed');
  };
  await assert.rejects(f.service.clearAccount(target.id, target), /Fixture erase failed/);
  assert.deepEqual(f.service.accounts(), f.accounts);
  f.session.clearStorageData = async () => {};
  assert.equal(await f.service.clearAccount(target.id, target), true);
});
