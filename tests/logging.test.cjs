const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHostApi } = require('../out/main/main/core/host-api');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { HostLog } = require('../out/main/main/core/log');
const { LogPageSession } = require('../out/main/main/core/log-page');
const { callAppletApi } = require('../out/main/main/core/applet-api-access');
const { logDirectories } = require('../out/main/main/core/data-paths');

function storageFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-log-storage-'));
  t.after(() => {
    assert.equal(path.dirname(root), os.tmpdir());
    fs.rmSync(root, { recursive: true, force: true });
  });
  const paths = logDirectories(path.join(root, 'data'), path.join(root, 'local'), 'PC-A');
  let changes = 0;
  const log = new HostLog(paths.shared, () => changes++, paths.fallback);
  const read = (directory) =>
    fs.readFileSync(path.join(directory, 'host.log'), 'utf8').trim().split('\n').map(JSON.parse);
  return { root, paths, log, read, changes: () => changes };
}

test('new logs are separated by computer under shared data; existing local logs are neither read nor moved', (t) => {
  const { root, paths, log, read } = storageFixture(t);
  fs.mkdirSync(paths.fallback, { recursive: true });
  const previous = path.join(paths.fallback, 'host.log');
  fs.writeFileSync(previous, 'existing-local-log\n');
  const otherPaths = logDirectories(path.join(root, 'data'), path.join(root, 'local-b'), 'PC-B');
  const other = new HostLog(otherPaths.shared, () => {}, otherPaths.fallback);
  log.write('debug', 'one', 'new A');
  other.audit('info', 'two', 'new B');
  assert.equal(paths.shared, path.join(root, 'data/logs/PC-A'));
  assert.equal(read(paths.shared)[0].message, 'new A');
  assert.equal(read(otherPaths.shared)[0].message, 'new B');
  assert.equal(fs.readFileSync(previous, 'utf8'), 'existing-local-log\n');
  assert(!fs.existsSync(otherPaths.fallback));
  assert.deepEqual(log.storage(), { mode: 'shared', directory: paths.shared });
  for (const name of ['../escape', '..', 'bad\\name', 'bad/name', ''])
    assert.throws(() => logDirectories(path.join(root, 'data'), path.join(root, 'local'), name));
});

test('unavailable shared directory falls back without failing startup; recovery writes only new entries to shared data', (t) => {
  const { paths, log, read, changes } = storageFixture(t);
  fs.mkdirSync(path.dirname(paths.shared), { recursive: true });
  fs.writeFileSync(paths.shared, 'blocked directory');
  assert.doesNotThrow(() => log.write('warn', 'one', 'fallback entry'));
  assert.deepEqual(log.storage(), { mode: 'local', directory: paths.fallback });
  assert.deepEqual(read(paths.fallback), log.entries);
  const fallbackBefore = fs.readFileSync(path.join(paths.fallback, 'host.log'));
  fs.unlinkSync(paths.shared);
  log.write('info', 'one', 'recovered entry');
  assert.deepEqual(log.storage(), { mode: 'shared', directory: paths.shared });
  assert.equal(read(paths.shared).length, 1);
  assert.equal(read(paths.shared)[0].message, 'recovered entry');
  assert.deepEqual(fs.readFileSync(path.join(paths.fallback, 'host.log')), fallbackBefore);
  assert.equal(changes(), 2);
});

test('append and rotation failures fall back; both destinations failing keeps the live log without recursive error records', (t) => {
  const { paths, log, read, changes } = storageFixture(t);
  fs.mkdirSync(path.join(paths.shared, 'host.log'), { recursive: true });
  log.audit('warn', 'one', 'append failed');
  assert.equal(read(paths.fallback)[0].category, 'audit');
  fs.mkdirSync(path.join(paths.fallback, 'host.log.1'));
  fs.writeFileSync(path.join(paths.fallback, 'host.log'), 'x'.repeat(1024 * 1024 + 1));
  assert.doesNotThrow(() => log.write('error', 'one', 'both failed'));
  assert.equal(log.storage().mode, 'memory');
  assert.equal(log.entries.length, 2);
  assert.equal(changes(), 2);
  fs.rmdirSync(path.join(paths.shared, 'host.log'));
  fs.writeFileSync(path.join(paths.shared, 'host.log'), 'old rotation bytes'.repeat(70000));
  fs.mkdirSync(path.join(paths.shared, 'host.log.1'));
  fs.rmdirSync(path.join(paths.fallback, 'host.log.1'));
  log.write('info', 'one', 'shared rotation failed');
  assert.equal(log.storage().mode, 'local');
  assert.equal(read(paths.fallback).length, 1);
  assert.equal(read(paths.fallback)[0].message, 'shared rotation failed');
  fs.rmdirSync(path.join(paths.shared, 'host.log.1'));
  const oldShared = fs.readFileSync(path.join(paths.shared, 'host.log'));
  log.write('info', 'one', 'rotation recovered');
  assert.equal(log.storage().mode, 'shared');
  assert.deepEqual(fs.readFileSync(path.join(paths.shared, 'host.log.1')), oldShared);
  assert.equal(read(paths.shared).length, 1);
  assert.equal(read(paths.shared)[0].message, 'rotation recovered');
});

test('debug and audited API outcomes persist once with independent categories; Applets cannot spoof audits', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-log-categories-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const log = new HostLog(directory, () => {});
  const extension = {
    state: 'running',
    manifest: { id: 'test.log', capabilities: ['appdock-api'] },
  };
  const api = createHostApi({}, '', log.write, () => {});
  await api(extension, 'host.log', {
    level: 'debug',
    category: 'audit',
    source: 'host',
    message: 'diagnostic',
  });
  assert.equal(log.entries[0].level, 'debug');
  assert.equal(log.entries[0].category, 'normal');
  assert.equal(log.entries[0].source, 'test.log');
  const request = { method: 'system.getInfo', params: { privateValue: 'must-not-be-logged' } };
  await callAppletApi({ call: async () => ({}) }, extension, request, log.audit);
  await callAppletApi(
    {
      call: async () => {
        throw Error('must-not-be-logged');
      },
    },
    extension,
    request,
    log.audit,
  );
  assert.deepEqual(
    log.entries.slice(1).map((entry) => [entry.category, entry.level]),
    [
      ['audit', 'info'],
      ['audit', 'info'],
      ['audit', 'info'],
      ['audit', 'warn'],
    ],
  );
  assert(log.entries.every((entry) => !entry.message.includes('must-not-be-logged')));
  const saved = fs
    .readFileSync(path.join(directory, 'host.log'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.deepEqual(saved, log.entries);
});

test('log defaults hide debug and successful audits, retaining audit warnings; filters are independent', async () => {
  const entries = [
    {
      time: '2026-10-31T00:00:00Z',
      source: 'one',
      level: 'debug',
      category: 'normal',
      message: 'detail',
    },
    { time: '2026-10-31T00:00:01Z', source: 'one', level: 'info', message: 'legacy normal' },
    {
      time: '2026-10-31T00:00:02Z',
      source: 'one',
      level: 'info',
      category: 'audit',
      message: 'operation',
    },
    {
      time: '2026-10-31T00:00:03Z',
      source: 'one',
      level: 'warn',
      category: 'audit',
      message: 'refused',
    },
    {
      time: '2026-10-31T00:00:04Z',
      source: 'two',
      level: 'error',
      category: 'audit',
      message: 'failed',
    },
  ];
  const request = {
    id: 'test-logs',
    kind: 'logs',
    route: 'logs',
    scope: { type: 'all' },
    source: '',
  };
  const page = new LogPageSession(request, {
    entries: () => entries,
    sources: () => [],
    dark: () => false,
    openDirectory: async () => {},
    sourceChanged: () => {},
    changed: () => {},
  });
  const messages = () => page.snapshot().content.entries.map((entry) => entry.message);
  assert.deepEqual(messages(), ['legacy normal', 'refused', 'failed']);
  const filters = { source: '', level: 'all', category: 'audit', text: '' };
  await page.act({ id: request.id, type: 'filters', filters });
  assert.deepEqual(messages(), ['operation', 'refused', 'failed']);
  await page.act({
    id: request.id,
    type: 'filters',
    filters: { ...filters, source: 'one', text: 'operation', level: 'info' },
  });
  assert.deepEqual(messages(), ['operation']);
  await page.act({
    id: request.id,
    type: 'filters',
    filters: { ...filters, category: 'normal', level: 'debug' },
  });
  assert.deepEqual(messages(), ['detail']);
  await assert.rejects(
    page.act({ id: request.id, type: 'filters', filters: { ...filters, category: 'spoof' } }),
    /Invalid/,
  );
  await page.act({ id: request.id, type: 'filters', filters: { ...filters, category: 'all' } });
  assert.equal(messages().length, entries.length);
  const scoped = new LogPageSession(
    { ...request, route: 'extensions', scope: { type: 'applet', id: 'one' } },
    {
      entries: () => entries,
      sources: () => [],
      dark: () => false,
      openDirectory: async () => {},
      sourceChanged: () => {},
      changed: () => {},
    },
  );
  await assert.rejects(
    scoped.act({ id: request.id, type: 'filters', filters: { ...filters, source: 'two' } }),
    /fixed/,
  );
});

test('common logging remains available during deactivation; other APIs and inactive processes stay rejected', async () => {
  const entries = [];
  const api = createHostApi(
    {},
    '',
    (...entry) => entries.push(entry),
    () => {},
  );
  const extension = {
    state: 'starting',
    manifest: { id: 'test.cleanup', capabilities: ['settings', 'ui'] },
  };
  for (const state of ['starting', 'running', 'stopping']) {
    extension.state = state;
    await api(extension, 'host.log', {
      level: 'error',
      source: 'another.applet',
      message: 'cleanup: ' + state,
    });
  }
  assert.deepEqual(
    entries,
    ['starting', 'running', 'stopping'].map((state) => [
      'error',
      'test.cleanup',
      'cleanup: ' + state,
    ]),
  );
  for (const method of ['host.settings.set', 'host.ui.panel', 'host.notifications.show'])
    await assert.rejects(api(extension, method, {}), /停止/);
  for (const state of ['stopped', 'error']) {
    extension.state = state;
    await assert.rejects(
      api(extension, 'host.log', { level: 'error', message: 'too late' }),
      /停止/,
    );
  }
  assert.equal(entries.length, 3);
});
