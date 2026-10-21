const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HostPages } = require('../out/main/main/core/host-pages');
const { LogPageSession } = require('../out/main/main/core/log-page');
function fixture() {
  let route = 'home',
    ready = true,
    blocked = false,
    disposed = [],
    events = [],
    created = [];
  const pages = new HostPages({
    route: () => route,
    ready: () => ready,
    blocked: () => blocked,
    changed: (model) => events.push(model),
    create: (request) => {
      const page = {
        ...request,
        revision: 1,
        snapshot: () => ({ ...request, revision: page.revision }),
        act: async (action) => action,
        passive: (action) => action.type === 'gallery' && action.command === 'image',
        update: (next) => {
          page.updated = next;
        },
        dispose: () => disposed.push(request.id),
      };
      created.push(page);
      return page;
    },
  });
  return {
    pages,
    disposed,
    events,
    created,
    route: (v) => (route = v),
    ready: (v) => (ready = v),
    blocked: (v) => (blocked = v),
  };
}
const home = (id = 'home-1') => ({ id, kind: 'home', route: 'home', appletOrder: [] });
test('page content waits for startup readiness and publishes the pending connection once ready', () => {
  const f = fixture();
  f.ready(false);
  assert.equal(f.pages.open(home()), null);
  assert.equal(f.pages.get(), null);
  f.pages.refresh();
  assert.equal(f.events.length, 0);
  f.ready(true);
  f.pages.refresh();
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].id, 'home-1');
  assert.equal(f.pages.get().id, 'home-1');
  assert.equal(f.created.length, 1);
});
test('host pages reuse content, publish revisions, and do not bind a Shell provider', () => {
  const f = fixture();
  assert.equal(f.pages.open(home()).id, 'home-1');
  f.pages.open({ ...home(), appletOrder: ['one'] });
  assert.equal(f.created.length, 1);
  assert.deepEqual(f.created[0].updated.appletOrder, ['one']);
  f.pages.refresh();
  assert.equal(f.events.length, 0);
  f.created[0].revision++;
  f.pages.refresh();
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].revision, 2);
  assert.equal(f.events[0].providerAppletId, undefined);
});
test('stale pages cannot operate or close a newer page, and navigation disposes content', async () => {
  const f = fixture();
  f.pages.open(home());
  f.pages.open(home('home-2'));
  f.pages.close('home-1');
  assert.equal(f.pages.get().id, 'home-2');
  await assert.rejects(f.pages.act({ id: 'home-1', type: 'invoke' }), /stale/);
  f.route('logs');
  assert.equal(f.pages.get(), null);
  assert.throws(() => f.pages.get('home-2'), /stale/);
  f.pages.refresh();
  assert.deepEqual(f.disposed, ['home-1', 'home-2']);
  assert.equal(f.pages.open(home()), null);
});
test('modal operations are blocked while scoped image requests may finish', async () => {
  const f = fixture();
  f.pages.open(home());
  f.blocked(true);
  await assert.rejects(f.pages.act({ id: 'home-1', type: 'invoke' }), /dialog/);
  await f.pages.act({ id: 'home-1', type: 'gallery', command: 'image' });
  f.ready(false);
  await assert.rejects(f.pages.act({ id: 'home-1', type: 'gallery', command: 'image' }), /stale/);
  assert.throws(() => f.pages.open({ ...home(), kind: 'unknown' }), /Invalid/);
});
test('updating the log source preserves search and level filters', async () => {
  const request = {
    id: 'logs-1',
    kind: 'logs',
    route: 'logs',
    scope: { type: 'all' },
    source: 'one',
  };
  const page = new LogPageSession(request, {
    entries: () => [],
    sources: () => [],
    dark: () => false,
    openDirectory: async () => {},
    sourceChanged: () => {},
    changed: () => {},
  });
  await page.act({
    id: request.id,
    type: 'filters',
    filters: { source: 'one', level: 'warn', text: 'needle' },
  });
  page.update({ ...request, source: 'two' });
  assert.deepEqual(page.snapshot().content.filters, {
    source: 'two',
    level: 'warn',
    text: 'needle',
  });
  assert.throws(() => page.update({ ...request, id: 'old' }), /Stale/);
});
