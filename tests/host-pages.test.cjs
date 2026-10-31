const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HostPages } = require('../out/main/main/core/host-pages');
const { LogPageSession } = require('../out/main/main/core/log-page');
function fixture() {
  let route = 'image-library',
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
const gallery = (id = 'gallery-1') => ({ id, kind: 'image-library', route: 'image-library' });
test('page content waits for startup readiness and publishes the pending connection once ready', () => {
  const f = fixture();
  f.ready(false);
  assert.equal(f.pages.open(gallery()), null);
  assert.equal(f.pages.get(), null);
  f.pages.refresh();
  assert.equal(f.events.length, 0);
  f.ready(true);
  f.pages.refresh();
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].id, 'gallery-1');
  assert.equal(f.pages.get().id, 'gallery-1');
  assert.equal(f.created.length, 1);
});
test('host pages reuse content, publish revisions, and do not bind a Shell provider', () => {
  const f = fixture();
  assert.equal(f.pages.open(gallery()).id, 'gallery-1');
  f.pages.open(gallery());
  assert.equal(f.created.length, 1);
  assert.deepEqual(f.created[0].updated, gallery());
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
  f.pages.open(gallery());
  f.pages.open(gallery('gallery-2'));
  f.pages.close('gallery-1');
  assert.equal(f.pages.get().id, 'gallery-2');
  await assert.rejects(
    f.pages.act({ id: 'gallery-1', type: 'gallery', command: 'select-all' }),
    /stale/,
  );
  f.route('logs');
  assert.equal(f.pages.get(), null);
  assert.throws(() => f.pages.get('gallery-2'), /stale/);
  f.pages.refresh();
  assert.deepEqual(f.disposed, ['gallery-1', 'gallery-2']);
  assert.equal(f.pages.open(gallery()), null);
});
test('modal operations are blocked while scoped image requests may finish', async () => {
  const f = fixture();
  f.pages.open(gallery());
  f.blocked(true);
  await assert.rejects(
    f.pages.act({ id: 'gallery-1', type: 'gallery', command: 'select-all' }),
    /dialog/,
  );
  await f.pages.act({ id: 'gallery-1', type: 'gallery', command: 'image' });
  f.ready(false);
  await assert.rejects(
    f.pages.act({ id: 'gallery-1', type: 'gallery', command: 'image' }),
    /stale/,
  );
  assert.throws(() => f.pages.open({ ...gallery(), kind: 'unknown' }), /Invalid/);
  assert.throws(() => f.pages.open({ id: 'retired', kind: 'home', route: 'home' }), /Invalid/);
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
    filters: { source: 'one', level: 'warn', category: 'audit', text: 'needle' },
  });
  page.update({ ...request, source: 'two' });
  assert.deepEqual(page.snapshot().content.filters, {
    source: 'two',
    level: 'warn',
    category: 'audit',
    text: 'needle',
  });
  assert.throws(() => page.update({ ...request, id: 'old' }), /Stale/);
});
