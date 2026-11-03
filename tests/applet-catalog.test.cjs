const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AppletCatalog } = require('../out/main/main/core/applet-catalog');

function fixture() {
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
    return typeof result === 'number'
      ? new Response(null, { status: result })
      : Response.json(result);
  };
  return {
    catalog: new AppletCatalog('1.0.0', fetcher, [repo]),
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
  assert.equal(f.catalog.list(), pending);
  const [entry] = await pending;
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
