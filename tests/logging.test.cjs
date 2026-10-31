const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHostApi } = require('../out/main/main/core/host-api');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { HostLog } = require('../out/main/main/core/log');
const { LogPageSession } = require('../out/main/main/core/log-page');
const { callAppletApi } = require('../out/main/main/core/applet-api-access');

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
