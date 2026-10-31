const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LogPageSession, parseLogPageRequest } = require('../out/main/main/core/log-page');
const entry = (source, level = 'info', message = 'message') => ({
  time: '2026-10-11T00:00:00.000Z',
  source,
  level,
  message,
});
function fixture(scope = { type: 'all' }) {
  const state = {
    entries: [entry('a'), entry('b', 'error', 'Failure'), entry('web.one'), entry('web-applets')],
    dark: true,
    changed: 0,
    opened: 0,
    source: '',
  };
  const session = new LogPageSession(
    {
      id: 'session',
      route: scope.type === 'all' ? 'logs' : 'extensions',
      kind: 'logs',
      scope,
      source: '',
    },
    {
      entries: () => state.entries,
      sources: () => [{ id: 'a', title: 'Applet A' }],
      dark: () => state.dark,
      openDirectory: async () => {
        state.opened++;
      },
      sourceChanged: (source) => {
        state.source = source;
      },
      changed: () => {
        state.changed++;
      },
    },
  );
  const filter = (filters) =>
    session.act({
      id: 'session',
      type: 'filters',
      filters: { source: '', level: 'all', category: 'all', text: '', ...filters },
    });
  return { state, session, filter };
}
test('log page keeps existing filters, names, unknown sources and bounded live history', async () => {
  const { state, session, filter } = fixture();
  assert.equal(session.snapshot().content.sources.find((s) => s.id === 'a').title, 'Applet A');
  assert.equal(session.snapshot().content.sources.find((s) => s.id === 'b').title, 'b');
  await filter({ source: 'b', level: 'error', text: 'FAIL' });
  assert.deepEqual(session.snapshot().content.entries, [entry('b', 'error', 'Failure')]);
  assert.equal(state.source, 'b');
  state.entries = [];
  assert(session.snapshot().content.sources.some((s) => s.id === 'b'));
  state.entries = Array.from({ length: 600 }, (_, i) => entry('a', 'info', String(i)));
  await filter({});
  assert.equal(session.snapshot().content.entries.length, 500);
  assert.equal(session.snapshot().content.entries[0].message, '100');
});
test('detail and web scopes cannot be broadened by a Shell', async () => {
  const a = fixture({ type: 'applet', id: 'a' });
  assert.deepEqual(a.session.snapshot().content.entries, [entry('a')]);
  await assert.rejects(a.filter({ source: 'b' }), /fixed/);
  await a.filter({ source: 'a', text: 'no match' });
  assert.equal(a.session.snapshot().content.entries.length, 0);
  const w = fixture({ type: 'web' });
  assert.deepEqual(
    w.session.snapshot().content.entries.map((e) => e.source),
    ['web.one', 'web-applets'],
  );
  await assert.rejects(w.filter({ source: 'b' }), /fixed/);
});
test('revision changes only with content; filters survive provider reconnect and stale actions fail', async () => {
  const { session, state, filter } = fixture();
  const first = session.snapshot();
  assert.equal(session.snapshot().revision, first.revision);
  state.dark = false;
  assert.equal(session.snapshot().revision, first.revision + 1);
  await filter({ text: 'Failure' });
  assert.equal(session.snapshot().content.filters.text, 'Failure');
  await assert.rejects(session.act({ id: 'old', type: 'open-directory' }), /Stale/);
  await session.act({ id: 'session', type: 'open-directory' });
  assert.equal(state.opened, 1);
  await assert.rejects(filter({ level: 'invalid' }), /Invalid/);
  await assert.rejects(filter({ text: 'x'.repeat(4001) }), /Invalid/);
  await assert.rejects(session.act({ id: 'session', type: 'delete' }), /Unknown/);
});
test('page request validates route and scope before creating a controller', () => {
  for (const request of [
    null,
    {},
    { id: 'x', kind: 'logs', source: '', route: 'logs', scope: { type: 'web' } },
    { id: 'x', kind: 'logs', source: '', route: 'extensions', scope: { type: 'applet' } },
  ])
    assert.throws(() => parseLogPageRequest(request), /Invalid/);
});
