const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  webAvatarURL,
  readWebAvatar,
  fetchWebAvatar,
  webAvatarResponse,
} = require('../out/main/main/core/web-account-avatar');
test('Native image requests expose redirects, preserve complete responses and abort outstanding work', async () => {
  const { EventEmitter } = require('node:events');
  const fake = (action) => {
    const req = new EventEmitter();
    req.abort = () => {
      req.aborted = true;
    };
    req.end = () => setImmediate(() => action(req));
    return req;
  };
  let req = fake((r) => r.emit('redirect', 302, 'GET', 'https://lh3.googleusercontent.com/a'));
  let result = await webAvatarResponse(new AbortController().signal, () => req);
  assert.equal(result.status, 302);
  assert.equal(req.aborted, true);
  assert.equal(result.headers.get('location'), 'https://lh3.googleusercontent.com/a');
  req = fake((r) => {
    const incoming = new EventEmitter();
    incoming.statusCode = 200;
    incoming.headers = { 'content-type': ['image/png'] };
    r.emit('response', incoming);
    incoming.emit('data', Buffer.from([1, 2]));
    incoming.emit('end');
  });
  result = await webAvatarResponse(new AbortController().signal, () => req);
  assert.deepEqual(await readWebAvatar(result), Buffer.from([1, 2]));
  req = fake((r) => {
    const incoming = new EventEmitter();
    incoming.statusCode = 200;
    incoming.headers = { 'content-type': 'image/png' };
    r.emit('response', incoming);
    incoming.emit('data', Buffer.alloc(65537));
    incoming.emit('end');
  });
  const large = await webAvatarResponse(new AbortController().signal, () => req);
  assert.equal((await readWebAvatar(large)).length, 65537);
  assert.equal(req.aborted, true);
  const abort = new AbortController();
  req = fake(() => {});
  const waiting = webAvatarResponse(abort.signal, () => req);
  abort.abort();
  await assert.rejects(waiting, /aborted/);
  assert.equal(req.aborted, true);
});
test('Avatar redirects are bounded and revalidated, using only the owning account session', async () => {
  const origins = ['https://lh3.google.com', 'https://lh3.googleusercontent.com'];
  const start = origins[0] + '/a/fixture',
    final = origins[1] + '/a/fixture';
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push(url);
    assert.equal(init.credentials, 'include');
    assert.equal(init.redirect, 'manual');
    return url === start
      ? new Response('', { status: 302, headers: { location: final } })
      : new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } });
  };
  assert.deepEqual(
    await fetchWebAvatar(start, origins, fetcher, new AbortController().signal),
    Buffer.from([1]),
  );
  assert.deepEqual(requests, [start, final]);
  let calls = 0;
  await assert.rejects(
    fetchWebAvatar(
      start,
      origins,
      async () => {
        calls++;
        return new Response('', {
          status: 302,
          headers: { location: 'https://evil.test/private' },
        });
      },
      new AbortController().signal,
    ),
    /origin/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    fetchWebAvatar(
      start,
      origins,
      async () => {
        calls++;
        return new Response('', { status: 302, headers: { location: start } });
      },
      new AbortController().signal,
    ),
    /redirects/,
  );
  assert.equal(calls, 4);
});
test('Avatar URLs require exact declared HTTPS origins; images are raster-only and bounded while streaming', async () => {
  const origins = ['https://lh3.googleusercontent.com'];
  const allowed = 'https://lh3.googleusercontent.com/a/fixture=s64-c';
  assert.equal(webAvatarURL(allowed, origins), allowed);
  for (const value of [
    null,
    'https://lh3.googleusercontent.com.evil.test/a',
    'http://lh3.googleusercontent.com/a',
    'https://u:p@lh3.googleusercontent.com/a',
    'https://lh3.googleusercontent.com:8443/a',
    'https://lh3.googleusercontent.com/a#hash',
    'file:///C:/secret',
    'data:image/png;base64,AAAA',
    'https://lh3.googleusercontent.com/a\n',
  ])
    assert.equal(webAvatarURL(value, origins), '');
  const response = (body, mime = 'image/png', headers = {}) =>
    new Response(body, { headers: { 'content-type': mime, ...headers } });
  assert.deepEqual(
    await readWebAvatar(response(new Uint8Array([1, 2, 3]))),
    Buffer.from([1, 2, 3]),
  );
  await assert.rejects(readWebAvatar(response('svg', 'image/svg+xml')), /Invalid/);
  await assert.rejects(readWebAvatar(response('')), /Empty/);
});
