const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppletCatalog, readAppletRoster } = require('../out/main/main/core/applet-catalog');

function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'AppDock-catalog-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fixture(options = {}) {
  const repo = 'owner/Clock';
  const sha = 'a'.repeat(40);
  const github = `https://api.github.com/repos/${repo}`;
  const raw = `https://raw.githubusercontent.com/${repo}/`;
  const feed = 'https://github.com/owner/Clock/releases/download/v1.2.0/update.json';
  const published = '2026-10-12T10:00:00Z';
  const committed = '2026-10-25T15:30:00Z';
  const manifest = {
    id: 'fixture.clock',
    name: 'Applet.Clock',
    version: '1.2.0',
    description: 'Stable description',
  };
  const releaseUrl = github + '/releases/latest';
  const headUrl = github + '/commits?per_page=1';
  const responses = new Map([
    [
      releaseUrl,
      {
        tag_name: 'v1.2.0',
        published_at: published,
        assets: [
          { name: 'update.json', browser_download_url: feed },
          { name: 'update.zip', browser_download_url: feed.replace('.json', '.zip') },
        ],
      },
    ],
    [raw + 'v1.2.0/extension.json', manifest],
    [
      feed,
      {
        schemaVersion: 1,
        kind: 'applet',
        id: manifest.id,
        version: manifest.version,
        payload: { file: 'update.zip', format: 'zip', size: 10, sha256: 'a'.repeat(64) },
      },
    ],
    [headUrl, [{ sha, commit: { committer: { date: committed } } }]],
    [
      raw + sha + '/extension.json',
      { ...manifest, version: '1.3.4', description: 'Development description' },
    ],
  ]);
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    assert(responses.has(url), url);
    const result = responses.get(url);
    if (result instanceof Response) return result.clone();
    return typeof result === 'number'
      ? new Response(null, { status: result })
      : Response.json(result);
  };
  return {
    catalog: new AppletCatalog('1.0.0', {
      fetcher,
      repositories: () => [repo],
      ...options,
    }),
    responses,
    calls,
    releaseUrl,
    headUrl,
    feed,
    published,
    committed,
  };
}

test('catalog reads the release tag and default HEAD independently and shares in-flight and completed requests', async () => {
  const f = fixture();
  const pending = f.catalog.list();
  const concurrent = f.catalog.list();
  const [entry] = await pending;
  assert.deepEqual(await concurrent, [entry]);
  assert.deepEqual(
    [
      entry.release.displayName,
      entry.release.version,
      entry.release.date,
      entry.release.description,
    ],
    ['Clock', '1.2.0', f.published, 'Stable description'],
  );
  assert.deepEqual(
    [entry.development.version, entry.development.date, entry.development.description],
    ['1.3.4', f.committed, 'Development description'],
  );
  assert.equal(entry.release.source, 'https://github.com/owner/Clock/releases/tag/v1.2.0');
  assert.equal(entry.release.unavailable, undefined);
  assert.deepEqual(await f.catalog.list(), [entry]);
  assert.equal(f.calls.length, 5);
});

test('an unpublished release is cached and a failed development lookup can recover independently', async () => {
  const f = fixture();
  const head = f.responses.get(f.headUrl);
  f.responses.set(f.releaseUrl, 404);
  f.responses.set(f.headUrl, 403);
  const [first] = await f.catalog.list();
  assert.equal(first.release, 'unpublished');
  assert.equal(first.development, 'error');
  f.responses.set(f.headUrl, head);
  assert.equal((await f.catalog.list())[0].development.version, '1.3.4');
  assert.equal(f.calls.filter((url) => url === f.releaseUrl).length, 1);
  assert.equal(f.calls.filter((url) => url === f.headUrl).length, 2);
});

test('missing assets, feed mismatch and host requirements cannot enable installation', async () => {
  const f = fixture();
  const release = f.responses.get(f.releaseUrl);
  const zip = release.assets.pop();
  assert.equal((await f.catalog.list())[0].release.unavailable, 'package');
  release.assets.push(zip);
  const feed = f.responses.get(f.feed);
  feed.id = 'fixture.other';
  assert.equal((await f.catalog.list())[0].release.unavailable, 'package');
  feed.id = 'fixture.clock';
  feed.minimumHostVersion = '2.0.0';
  assert.equal((await f.catalog.list())[0].release.unavailable, 'host');
  assert.equal(f.calls.filter((url) => url === f.headUrl).length, 1);
});

test('a release transport failure keeps the development edition and retries only the release', async () => {
  const f = fixture();
  const release = f.responses.get(f.releaseUrl);
  f.responses.set(f.releaseUrl, 503);
  const [entry] = await f.catalog.list();
  assert.equal(entry.release, 'error');
  assert.equal(entry.development.version, '1.3.4');
  f.responses.set(f.releaseUrl, release);
  assert.equal((await f.catalog.list())[0].release.version, '1.2.0');
  assert.equal(f.calls.filter((url) => url === f.headUrl).length, 1);
});

test('only uninstalled IDs can initiate a lookup, including on a cold cache and concurrent page views', async (t) => {
  const file = path.join(directory(t), 'cache.json');
  const f = fixture({ file, repositories: () => ['owner/Clock', 'owner/Installed'] });
  const installed = { id: 'fixture.installed', updateRepository: 'OWNER/INSTALLED' };
  const both = [{ id: 'fixture.clock', updateRepository: 'owner/Clock' }, installed];
  assert.deepEqual(f.catalog.snapshot(both), { entries: [], needsRefresh: false });
  assert.deepEqual(await f.catalog.list(both), []);
  assert.equal(f.calls.length, 0);
  assert.equal(fs.existsSync(file), false);
  const pending = f.catalog.list([installed]);
  assert.deepEqual(await f.catalog.list(both), []);
  assert.deepEqual(
    (await pending).map((entry) => entry.repository),
    ['owner/Clock'],
  );
  assert(f.calls.every((url) => !url.includes('owner/Installed')));
  assert.deepEqual(f.catalog.snapshot(both).entries, []);
  const previousCalls = f.calls.length;
  assert.deepEqual(await f.catalog.list([{ id: 'fixture.clock' }, installed]), []);
  assert.equal(f.calls.length, previousCalls);
});

test('disk cache survives restart, expires at exactly 24 hours and retains each last success on failure', async (t) => {
  const file = path.join(directory(t), 'cache.json');
  let now = Date.UTC(2026, 0, 1);
  const options = { file, now: () => now };
  await fixture(options).catalog.list();
  const saved = fs.readFileSync(file, 'utf8');
  const f = fixture(options);
  now += 86400000 - 1;
  assert.equal(f.catalog.snapshot([]).needsRefresh, false);
  assert.equal((await f.catalog.list())[0].release.version, '1.2.0');
  assert.equal(f.calls.length, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  now++;
  const cached = f.catalog.snapshot([]);
  assert(cached.needsRefresh);
  assert.equal(cached.entries[0].development.version, '1.3.4');
  assert.equal(f.calls.length, 0);
  f.responses.set(f.releaseUrl, 503);
  const [partial] = await f.catalog.list();
  assert(partial.refreshFailed);
  assert.equal(partial.release.version, '1.2.0');
  const data = JSON.parse(fs.readFileSync(file)).repositories['owner/clock'];
  assert.equal(data.release.fetchedAt, now - 86400000);
  assert.equal(data.development.fetchedAt, now);
  const retry = fixture(options);
  assert.equal((await retry.catalog.list())[0].refreshFailed, false);
  assert(!retry.calls.includes(retry.headUrl));
});

test('cache rejects a corrupted document, an invalid id and an untrusted saved install source', async (t) => {
  const file = path.join(directory(t), 'cache.json');
  fs.writeFileSync(file, '{');
  const f = fixture({ file });
  assert.deepEqual(f.catalog.snapshot([]), { entries: [], needsRefresh: true });
  await f.catalog.list();
  const data = JSON.parse(fs.readFileSync(file));
  data.repositories['owner/clock'].release.value.source =
    'https://github.com/other/Clock/releases/tag/v1.2.0';
  data.repositories['owner/clock'].development.value.id = '../invalid';
  fs.writeFileSync(file, JSON.stringify(data));
  assert.equal(fixture({ file }).catalog.snapshot([]).entries.length, 0);
  const changed = fixture({ file });
  changed.responses.get('https://raw.githubusercontent.com/owner/Clock/v1.2.0/extension.json').id =
    '../invalid';
  assert.equal((await changed.catalog.list())[0].release, 'error');
});

test('unpublished and rate-limit reset survive restart without consuming more requests', async (t) => {
  const file = path.join(directory(t), 'cache.json');
  let now = Date.UTC(2026, 0, 1);
  const options = { file, now: () => now };
  const f = fixture(options);
  f.responses.set(f.releaseUrl, 404);
  const reset = now + 3600000;
  f.responses.set(
    f.headUrl,
    new Response(null, {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset / 1000) },
    }),
  );
  const [first] = await f.catalog.list();
  assert.equal(first.release, 'unpublished');
  const retry = fixture(options);
  assert.equal((await retry.catalog.list())[0].development, 'error');
  assert.equal(retry.calls.length, 0);
  now = reset;
  assert.equal((await retry.catalog.list())[0].development.version, '1.3.4');
  assert(!retry.calls.includes(retry.releaseUrl));
});

test('editable external roster is seeded only when absent and reread without a build', async (t) => {
  const base = directory(t),
    file = path.join(base, 'applets.json'),
    seed = path.join(base, 'seed.json');
  fs.writeFileSync(seed, JSON.stringify({ applets: ['owner/Clock'] }));
  const f = fixture({ repositories: () => readAppletRoster(file, seed) });
  assert.equal((await f.catalog.list())[0].repository, 'owner/Clock');
  assert.equal(fs.readFileSync(file, 'utf8'), fs.readFileSync(seed, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ applets: [] }));
  assert.deepEqual(f.catalog.snapshot([]), { entries: [], needsRefresh: false });
  fs.writeFileSync(file, '{"applets":["../../escape"]}');
  assert.throws(() => f.catalog.snapshot([]), /Invalid applets.json/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"applets":["../../escape"]}');
});

test('legacy installed metadata needs at most one lookup and cached host compatibility follows the current host', async (t) => {
  const file = path.join(directory(t), 'cache.json');
  const f = fixture({ file });
  f.responses.get(f.feed).minimumHostVersion = '2.0.0';
  assert.deepEqual(await f.catalog.list([{ id: 'fixture.clock' }]), []);
  assert.equal(f.calls.length, 5);
  const next = fixture({ file });
  assert.deepEqual(next.catalog.snapshot([{ id: 'fixture.clock' }]), {
    entries: [],
    needsRefresh: false,
  });
  assert.equal((await next.catalog.list())[0].release.unavailable, 'host');
  const upgraded = new AppletCatalog('2.0.0', {
    file,
    repositories: () => ['OWNER/CLOCK'],
    fetcher: async () => {
      throw Error('Unexpected request');
    },
  });
  assert.equal(upgraded.snapshot([]).needsRefresh, false);
  assert.equal((await upgraded.list())[0].release.unavailable, undefined);
  assert.equal(next.calls.length, 0);
});
