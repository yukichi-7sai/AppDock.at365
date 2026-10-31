const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { McpEvents } = require('../out/main/main/core/mcp-events');
const {
  publicWebhookAddress,
  postWebhook,
  webhookUrl,
  webhookKey,
  webhookSignature,
} = require('../out/main/main/core/mcp-event-webhook');
const { modernResponse, modernRequest } = require('../out/main/main/core/mcp-modern');
const { AutomationMcp } = require('../out/main/main/core/automation-mcp');
const version = '2026-07-28';
const secret = 'whsec_' + Buffer.alloc(32, 7).toString('base64');
const selected = { ownerKind: 'applet', ownerId: 'fixture.notice', typeId: 'message' };
const publication = {
  notificationId: 'notice-1',
  owner: { ownerKind: 'applet', ownerId: selected.ownerId },
  typeId: selected.typeId,
  title: 'Fixture title',
  body: 'Private notification body',
  createdAt: Date.parse('2026-10-16T00:00:00Z'),
};
const params = (overrides = {}) => ({
  name: 'appdock.notification.created',
  arguments: selected,
  delivery: { mode: 'webhook', url: 'https://callbacks.example.com/events', secret },
  ...overrides,
});
function fixture(t, overrides = {}) {
  const root =
    process.env.APPDOCK_EVENTS_TEST_ROOT ||
    path.resolve(__dirname, '../.artifacts/mcp-events-unit');
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'case-'));
  let enabled = true,
    clock = publication.createdAt,
    types = [{ ...selected, ownerTitle: 'Fixture', title: 'Message' }];
  let status = 200;
  const calls = [],
    audits = [];
  const options = {
    directory,
    encrypt: (s) => Buffer.from(s).toString('base64'),
    decrypt: (s) => Buffer.from(s, 'base64').toString(),
    enabled: () => enabled,
    principal: () => crypto.createHash('sha256').update('owner').digest('hex'),
    types: () => types,
    now: () => clock,
    audit: (code) => audits.push(code),
    post: async (url, body, headers, signal) => {
      signal.throwIfAborted();
      const value = JSON.parse(body);
      calls.push({ url, body, headers, value });
      const expected = crypto
        .createHmac('sha256', Buffer.alloc(32, 7))
        .update(`${headers['webhook-id']}.${headers['webhook-timestamp']}.${body}`)
        .digest('base64');
      if (value.type === 'verification')
        return { status: 200, body: JSON.stringify({ challenge: value.challenge }) };
      assert.equal(headers['webhook-signature'].split(' ')[0], 'v1,' + expected);
      return { status, body: '' };
    },
    ...overrides,
  };
  const events = new McpEvents(options);
  t.after(() => events.close());
  return {
    events,
    options,
    calls,
    audits,
    directory,
    setStatus: (v) => (status = v),
    advance: (v) => (clock += v),
    enable: (v) => (enabled = v),
    select: (v) => (types = v ? [{ ...selected, ownerTitle: 'Fixture', title: 'Message' }] : []),
  };
}
test('webhook URLs and DNS addresses reject local, special-use, aliases, redirects by design and invalid keys', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '100.64.0.1',
    '169.254.169.254',
    '172.31.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::ffff:8.8.8.8',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2002:0808:0808::1',
  ])
    assert.equal(publicWebhookAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])
    assert.equal(publicWebhookAddress(ip), true, ip);
  for (const url of [
    'http://example.com',
    'https://localhost/a',
    'https://127.1/a',
    'https://2130706433/a',
    'https://[::1]/a',
    'https://u:p@example.com/a',
    'https://example.com/a#fragment',
  ])
    assert.throws(() => webhookUrl(url));
  for (const key of [
    '',
    'whsec_AA==',
    secret + '!',
    'whsec_' + Buffer.alloc(65).toString('base64'),
  ])
    assert.throws(() => webhookKey(key));
  assert.equal(webhookKey(secret).length, 32);
  const body = '{"title":"日本語"}';
  assert.equal(
    webhookSignature(secret, 'evt', 123, body),
    'v1,' +
      crypto
        .createHmac('sha256', Buffer.alloc(32, 7))
        .update('evt.123.' + body)
        .digest('base64'),
  );
});
test('verification, canonical identity, selected publication, encrypted persistence, restart and unsubscribe', async (t) => {
  const f = fixture(t);
  assert.equal(f.events.list({}).events[0].name, 'appdock.notification.created');
  const a = await f.events.subscribe(params());
  const b = await f.events.subscribe(
    params({
      arguments: {
        typeId: selected.typeId,
        ownerId: selected.ownerId,
        ownerKind: selected.ownerKind,
      },
    }),
  );
  assert.equal(a.id, b.id);
  assert.equal(f.calls.length, 1);
  assert.equal(a.cursor, null);
  f.events.publish({ ...publication, typeId: 'other' });
  await f.events.flush();
  assert.equal(f.calls.length, 1);
  f.events.publish(publication);
  await f.events.flush();
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[1].value.data, {
    ...selected,
    notificationId: publication.notificationId,
    title: publication.title,
    body: publication.body,
  });
  assert.equal(f.calls[1].headers['X-MCP-Subscription-Id'], a.id);
  const disk = fs.readFileSync(path.join(f.directory, 'automation-events.json'), 'utf8');
  assert.ok(
    !disk.includes(secret) &&
      !disk.includes('callbacks.example.com') &&
      !disk.includes(publication.body),
  );
  await f.events.close();
  const restarted = new McpEvents(f.options);
  t.after(() => restarted.close());
  restarted.publish(publication);
  await restarted.flush();
  assert.equal(f.calls.length, 3);
  const stop = params();
  delete stop.delivery.secret;
  await restarted.unsubscribe(stop);
  await restarted.unsubscribe(stop);
  restarted.publish(publication);
  await restarted.flush();
  assert.equal(f.calls.length, 3);
});
test('transient retries preserve event ID and renew signature timestamp; 413 and 410 are terminal', async (t) => {
  const f = fixture(t);
  await f.events.subscribe(params());
  f.setStatus(503);
  f.events.publish(publication);
  await f.events.flush();
  const first = f.calls.at(-1);
  f.advance(3000);
  await f.events.flush();
  const retry = f.calls.at(-1);
  assert.equal(first.value.eventId, retry.value.eventId);
  assert.notEqual(first.headers['webhook-timestamp'], retry.headers['webhook-timestamp']);
  f.setStatus(413);
  f.advance(5000);
  await f.events.flush();
  const count = f.calls.length;
  f.advance(10000);
  await f.events.flush();
  assert.equal(f.calls.length, count);
  f.setStatus(410);
  f.events.publish(publication);
  await f.events.flush();
  const gone = f.calls.length;
  f.events.publish(publication);
  await f.events.flush();
  assert.equal(f.calls.length, gone);
});
test('selection removal, revocation and expiry prevent delivery; TTL null grants finite lifetime', async (t) => {
  const f = fixture(t);
  const a = await f.events.subscribe(params({ ttlMs: null }));
  assert.ok(Date.parse(a.refreshBefore) > publication.createdAt);
  f.select(false);
  f.events.reconcile();
  f.events.publish(publication);
  await f.events.flush();
  assert.equal(f.calls.length, 1);
  f.select(true);
  f.events.reconcile();
  await f.events.subscribe(params({ ttlMs: 60000 }));
  f.advance(61000);
  f.events.publish(publication);
  await f.events.flush();
  assert.equal(f.calls.length, 1);
  await f.events.subscribe(params());
  f.events.reconcile(true);
  await f.events.flush();
  f.events.publish(publication);
  await f.events.flush();
  assert.equal(f.calls.length, 1);
  f.enable(false);
  assert.deepEqual(f.events.list({}).events, []);
  await assert.rejects(f.events.subscribe(params()));
});
test('callback verification failure never activates or saves a subscription; unselected and malformed requests are rejected', async (t) => {
  const f = fixture(t, { post: async () => ({ status: 200, body: '{"challenge":"wrong"}' }) });
  await assert.rejects(f.events.subscribe(params()), (e) => e.code === -32015);
  assert.equal(fs.existsSync(path.join(f.directory, 'automation-events.json')), false);
  assert.throws(() => f.events.subscribe(params({ cursor: 'unsupported' })));
  assert.throws(() => f.events.subscribe(params({ ttlMs: -1 })));
  assert.throws(() => f.events.subscribe(params({ arguments: { ...selected, extra: true } })));
  f.select(false);
  await assert.rejects(f.events.subscribe(params()));
});
test('key rotation signs deliveries with both keys briefly', async (t) => {
  const calls = [];
  const f = fixture(t, {
    post: async (_, body, headers) => {
      const value = JSON.parse(body);
      calls.push({ value, headers });
      return { status: 200, body: JSON.stringify({ challenge: value.challenge }) };
    },
  });
  await f.events.subscribe(params());
  const replacement = 'whsec_' + Buffer.alloc(32, 8).toString('base64');
  await f.events.subscribe(params({ delivery: { ...params().delivery, secret: replacement } }));
  f.events.publish(publication);
  await f.events.flush();
  assert.equal(calls.at(-1).headers['webhook-signature'].split(' ').length, 2);
  f.advance(300001);
  f.events.publish(publication);
  await f.events.flush();
  assert.equal(calls.at(-1).headers['webhook-signature'].split(' ').length, 1);
});
test('corrupt encrypted storage is retained and fails closed', async (t) => {
  const f = fixture(t);
  const file = path.join(f.directory, 'automation-events.json');
  fs.writeFileSync(file, 'broken');
  const reopened = new McpEvents(f.options);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.list({}).events, []);
  await assert.rejects(reopened.subscribe(params()));
  assert.equal(fs.readFileSync(file, 'utf8'), 'broken');
});
test('webhook transport checks each DNS answer, pins the public address and does not follow redirects', async (t) => {
  const dns = require('node:dns/promises'),
    https = require('node:https');
  const { EventEmitter } = require('node:events');
  const { PassThrough } = require('node:stream');
  let answers = [{ address: '8.8.8.8', family: 4 }],
    requests = 0;
  t.mock.method(dns, 'lookup', async () => answers);
  t.mock.method(https, 'request', (url, options, receive) => {
    requests++;
    assert.equal(url.hostname, 'callbacks.example.com');
    assert.equal(options.agent, false);
    options.lookup(url.hostname, {}, (error, address, family) => {
      assert.equal(error, null);
      assert.equal(address, '8.8.8.8');
      assert.equal(family, 4);
    });
    const request = new EventEmitter();
    request.end = () => {
      const response = new PassThrough();
      response.statusCode = 302;
      response.headers = { location: 'https://127.0.0.1/secret' };
      receive(response);
      response.end('redirect');
    };
    return request;
  });
  assert.equal(
    (
      await postWebhook(
        'https://callbacks.example.com/events',
        '{}',
        {},
        new AbortController().signal,
      )
    ).status,
    302,
  );
  assert.equal(requests, 1);
  answers = [
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ];
  await assert.rejects(
    postWebhook('https://callbacks.example.com/events', '{}', {}, new AbortController().signal),
  );
  assert.equal(requests, 1);
});
test('DNS resolution is bounded by the request abort signal', async (t) => {
  t.mock.method(require('node:dns/promises'), 'lookup', () => new Promise(() => {}));
  const controller = new AbortController();
  const pending = postWebhook('https://callbacks.example.com/events', '{}', {}, controller.signal);
  controller.abort();
  await assert.rejects(pending);
});
test('expired subscription renewal drops pending old events, while a live queue survives restart', async (t) => {
  const f = fixture(t);
  await f.events.subscribe(params({ ttlMs: 60000 }));
  f.setStatus(503);
  f.events.publish(publication);
  await f.events.flush();
  const eventId = f.calls.at(-1).value.eventId;
  await f.events.close();
  const restarted = new McpEvents(f.options);
  t.after(() => restarted.close());
  f.advance(3000);
  await restarted.flush();
  assert.equal(f.calls.at(-1).value.eventId, eventId);
  f.advance(60000);
  await restarted.subscribe(params());
  const count = f.calls.length;
  f.setStatus(200);
  await restarted.flush();
  assert.equal(f.calls.length, count);
});
test('selection toggled during verification cannot activate an obsolete request', async (t) => {
  let finish, started;
  const ready = new Promise((resolve) => (started = resolve));
  const f = fixture(t, {
    post: async (_, body) => {
      started();
      return new Promise(
        (resolve) =>
          (finish = () =>
            resolve({
              status: 200,
              body: JSON.stringify({ challenge: JSON.parse(body).challenge }),
            })),
      );
    },
  });
  const pending = f.events.subscribe(params());
  await ready;
  f.select(false);
  f.events.reconcile();
  f.select(true);
  f.events.reconcile();
  finish();
  await assert.rejects(pending);
  assert.equal(fs.existsSync(path.join(f.directory, 'automation-events.json')), false);
});
test('a failed encrypted write preserves durable state and disables subsequent event delivery', async (t) => {
  const f = fixture(t);
  await f.events.subscribe(params());
  const file = path.join(f.directory, 'automation-events.json'),
    before = fs.readFileSync(file, 'utf8');
  f.options.encrypt = () => {
    throw Error('fixture encryption failure');
  };
  f.events.publish(publication);
  await f.events.flush();
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(f.events.list({}).events, []);
  assert.equal(f.calls.length, 1);
  assert.ok(f.audits.includes('EVENT_STORAGE_FAILED'));
});
test('notification event selection is opt-in and schema-validated', () => {
  const { parseNotificationPreferences } = require('../out/main/shared/notification-types');
  assert.equal(
    parseNotificationPreferences({ overrides: [{ ...selected }] }).overrides[0].mcpEvents,
    undefined,
  );
  assert.equal(
    parseNotificationPreferences({ overrides: [{ ...selected, mcpEvents: true }] }).overrides[0]
      .mcpEvents,
    true,
  );
  assert.throws(() =>
    parseNotificationPreferences({ overrides: [{ ...selected, mcpEvents: 'yes' }] }),
  );
});
test('rapid OFF/ON retains subscriptions but discards queued publications', async (t) => {
  const f = fixture(t);
  await f.events.subscribe(params());
  f.events.publish(publication);
  f.select(false);
  f.events.reconcile();
  f.select(true);
  f.events.reconcile();
  await f.events.flush();
  assert.equal(f.calls.length, 1);
  f.events.publish({ ...publication, notificationId: 'after-resume' });
  await f.events.flush();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls.at(-1).value.data.notificationId, 'after-resume');
});
test('OFF drops retries and new notifications, retains the subscription across restart and resumes without subscribing', async (t) => {
  const f = fixture(t);
  const registered = await f.events.subscribe(params());
  f.setStatus(503);
  f.events.publish(publication);
  await f.events.flush();
  const before = f.calls.length;
  f.select(false);
  f.events.reconcile();
  f.events.publish({ ...publication, notificationId: 'while-off' });
  await f.events.flush();
  await f.events.close();
  const restarted = new McpEvents(f.options);
  t.after(() => restarted.close());
  f.advance(10000);
  await restarted.flush();
  assert.deepEqual(restarted.list({}).events, []);
  assert.equal(f.calls.length, before);
  f.select(true);
  restarted.reconcile();
  f.setStatus(200);
  await restarted.flush();
  assert.equal(f.calls.length, before);
  restarted.publish({ ...publication, notificationId: 'after-restart' });
  await restarted.flush();
  assert.equal(f.calls.length, before + 1);
  assert.equal(f.calls.at(-1).headers['X-MCP-Subscription-Id'], registered.id);
  assert.equal(f.calls.at(-1).value.data.notificationId, 'after-restart');
});
test('OFF immediately followed by shutdown durably discards pending retries', async (t) => {
  const f = fixture(t);
  const registered = await f.events.subscribe(params());
  f.setStatus(503);
  f.events.publish(publication);
  await f.events.flush();
  const count = f.calls.length;
  f.select(false);
  f.events.reconcile();
  await f.events.close();
  f.select(true);
  const restarted = new McpEvents(f.options);
  t.after(() => restarted.close());
  f.advance(10000);
  await restarted.flush();
  assert.equal(f.calls.length, count);
  f.setStatus(200);
  restarted.publish({ ...publication, notificationId: 'after-immediate-shutdown' });
  await restarted.flush();
  assert.equal(f.calls.length, count + 1);
  assert.equal(f.calls.at(-1).headers['X-MCP-Subscription-Id'], registered.id);
});
test('startup while OFF discards persisted retries without removing the subscription', async (t) => {
  const f = fixture(t);
  const registered = await f.events.subscribe(params());
  f.setStatus(503);
  f.events.publish(publication);
  await f.events.flush();
  await f.events.close();
  f.select(false);
  const restarted = new McpEvents(f.options);
  t.after(() => restarted.close());
  f.advance(10000);
  await restarted.flush();
  const count = f.calls.length;
  f.select(true);
  restarted.reconcile();
  await restarted.flush();
  assert.equal(f.calls.length, count);
  f.setStatus(200);
  restarted.publish({ ...publication, notificationId: 'after-startup-off' });
  await restarted.flush();
  assert.equal(f.calls.length, count + 1);
  assert.equal(f.calls.at(-1).headers['X-MCP-Subscription-Id'], registered.id);
});
test('an existing OFF subscription can renew after restart; new callbacks and expired subscriptions cannot', async (t) => {
  const f = fixture(t);
  const registered = await f.events.subscribe(params({ ttlMs: 60000 }));
  f.select(false);
  f.events.reconcile();
  await f.events.close();
  const restarted = new McpEvents(f.options);
  t.after(() => restarted.close());
  f.advance(30000);
  const renewed = await restarted.subscribe(params({ ttlMs: 60000 }));
  assert.equal(renewed.id, registered.id);
  assert.equal(Date.parse(renewed.refreshBefore), Date.parse(registered.refreshBefore) + 30000);
  assert.equal(f.calls.at(-1).value.type, 'verification');
  await assert.rejects(
    restarted.subscribe(
      params({ delivery: { ...params().delivery, url: 'https://callbacks.example.com/other' } }),
    ),
    (e) => e.code === -32602,
  );
  const count = f.calls.length;
  restarted.publish(publication);
  await restarted.flush();
  assert.equal(f.calls.length, count);
  f.advance(60001);
  await assert.rejects(restarted.subscribe(params()), (e) => e.code === -32602);
  f.select(true);
  restarted.reconcile();
  restarted.publish(publication);
  await restarted.flush();
  assert.equal(f.calls.length, count);
  await restarted.subscribe(params());
  restarted.publish(publication);
  await restarted.flush();
  assert.equal(f.calls.at(-1).value.data.notificationId, publication.notificationId);
});
test('renewal of another selected type does not remove an OFF subscription', async (t) => {
  const f = fixture(t);
  const other = { ...selected, typeId: 'other' };
  let selectedTypes = [selected, other];
  f.options.types = () =>
    selectedTypes.map((v) => ({ ...v, ownerTitle: 'Fixture', title: v.typeId }));
  f.events.reconcile();
  const registered = await f.events.subscribe(params());
  await f.events.subscribe(params({ arguments: other }));
  selectedTypes = [other];
  f.events.reconcile();
  await f.events.subscribe(params({ arguments: other }));
  selectedTypes = [selected, other];
  f.events.reconcile();
  f.events.publish(publication);
  await f.events.flush();
  assert.equal(f.calls.at(-1).headers['X-MCP-Subscription-Id'], registered.id);
});
test('OFF subscriptions count towards the limit while their own renewal remains allowed', async (t) => {
  const f = fixture(t);
  const requests = Array.from({ length: 64 }, (_, i) =>
    params({
      delivery: { ...params().delivery, url: `https://callbacks.example.com/${i}` },
    }),
  );
  for (const request of requests) await f.events.subscribe(request);
  f.select(false);
  f.events.reconcile();
  await f.events.subscribe(requests[0]);
  const other = { ...selected, typeId: 'other' };
  f.options.types = () => [{ ...other, ownerTitle: 'Fixture', title: 'Other' }];
  f.events.reconcile();
  await assert.rejects(f.events.subscribe(params({ arguments: other })), (e) => e.code === -32000);
});
test('selection changes during transport startup retain valid subscriptions', async (t) => {
  const f = fixture(t);
  const registered = await f.events.subscribe(params());
  f.enable(false);
  f.select(false);
  f.events.reconcile();
  await f.events.flush();
  f.enable(true);
  f.select(true);
  f.events.reconcile();
  f.events.publish(publication);
  await f.events.flush();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls.at(-1).headers['X-MCP-Subscription-Id'], registered.id);
});
test('MCP disable, token rotation and unsubscribe still revoke an OFF subscription', async (t) => {
  for (const reason of ['disable', 'token', 'unsubscribe']) {
    const f = fixture(t);
    await f.events.subscribe(params());
    f.select(false);
    f.events.reconcile();
    await f.events.flush();
    if (reason === 'unsubscribe') {
      const stop = params();
      delete stop.delivery.secret;
      await f.events.unsubscribe(stop);
    } else {
      if (reason === 'disable') f.enable(false);
      else
        f.options.principal = () => crypto.createHash('sha256').update('new owner').digest('hex');
      f.events.reconcile(true);
      await f.events.flush();
    }
    f.enable(true);
    await assert.rejects(f.events.subscribe(params()));
    f.select(true);
    f.events.reconcile();
    f.events.publish(publication);
    await f.events.flush();
    assert.equal(f.calls.length, 1, reason);
  }
});
test('OFF aborts in-flight delivery without resurrecting its queue on resume', async (t) => {
  let started,
    finish,
    aborted = false;
  const ready = new Promise((resolve) => (started = resolve));
  const delivered = [];
  const f = fixture(t, {
    post: async (_, body, _headers, signal) => {
      const value = JSON.parse(body);
      if (value.type === 'verification')
        return { status: 200, body: JSON.stringify({ challenge: value.challenge }) };
      delivered.push(value.data.notificationId);
      if (delivered.length > 1) return { status: 200, body: '' };
      signal.addEventListener(
        'abort',
        () => {
          aborted = true;
        },
        { once: true },
      );
      started();
      return new Promise((resolve) => {
        finish = () => resolve({ status: 503, body: '' });
      });
    },
  });
  await f.events.subscribe(params());
  f.events.publish(publication);
  const flushing = f.events.flush();
  await ready;
  f.select(false);
  f.events.reconcile();
  f.select(true);
  f.events.reconcile();
  finish();
  await flushing;
  await f.events.flush();
  assert.equal(aborted, true);
  assert.deepEqual(delivered, [publication.notificationId]);
  f.events.publish({ ...publication, notificationId: 'after-abort' });
  await f.events.flush();
  assert.deepEqual(delivered, [publication.notificationId, 'after-abort']);
});
const settleEvents = async (events) => {
  await events.work;
  await Promise.resolve();
};
test('idle Events has no recurring work and expires a subscription only at its deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: publication.createdAt });
  const f = fixture(t, { now: () => Date.now() });
  const flush = t.mock.method(f.events, 'flush');
  f.events.start();
  t.mock.timers.tick(86400000);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 0);
  await f.events.subscribe(params({ ttlMs: 60000 }));
  t.mock.timers.tick(59999);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 0);
  t.mock.timers.tick(1);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 1);
  const saved = JSON.parse(fs.readFileSync(path.join(f.directory, 'automation-events.json')));
  const state = JSON.parse(f.options.decrypt(saved.sealed));
  assert.deepEqual(state.subscriptions, []);
  t.mock.timers.tick(86400000);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 1);
  assert.equal(f.calls.length, 1);
});

test('new notifications preempt a later retry and retries wake only at their own deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: publication.createdAt });
  const f = fixture(t, { now: () => Date.now() });
  const flush = t.mock.method(f.events, 'flush');
  await f.events.subscribe(params());
  f.setStatus(503);
  f.events.publish(publication);
  await settleEvents(f.events);
  t.mock.timers.tick(0);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 1);
  const first = f.calls.at(-1).value;
  t.mock.timers.tick(1000);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 1);

  f.setStatus(200);
  f.events.publish({ ...publication, notificationId: 'newer' });
  await settleEvents(f.events);
  t.mock.timers.tick(0);
  await settleEvents(f.events);
  assert.equal(f.calls.at(-1).value.data.notificationId, 'newer');
  t.mock.timers.tick(999);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 2);
  t.mock.timers.tick(1);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 3);
  assert.equal(f.calls.at(-1).value.eventId, first.eventId);
  t.mock.timers.tick(10000);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 3);
});

test('renewal replaces the expiration reservation and unsubscribe removes the last scheduled work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: publication.createdAt });
  const f = fixture(t, { now: () => Date.now() });
  const flush = t.mock.method(f.events, 'flush');
  await f.events.subscribe(params({ ttlMs: 60000 }));
  t.mock.timers.tick(30000);
  await f.events.subscribe(params({ ttlMs: 120000 }));
  t.mock.timers.tick(30000);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 0);
  await f.events.unsubscribe(params({ delivery: { mode: 'webhook', url: params().delivery.url } }));
  t.mock.timers.tick(7 * 86400000);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 0);
});

test('persisted retry reservations resume after restart and MCP pause leaves no periodic wakeup', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: publication.createdAt });
  const f = fixture(t, { now: () => Date.now() });
  await f.events.subscribe(params());
  f.setStatus(503);
  f.events.publish(publication);
  await f.events.flush();
  await f.events.close();
  const restarted = new McpEvents(f.options);
  t.after(() => restarted.close());
  const flush = t.mock.method(restarted, 'flush');
  restarted.start();
  t.mock.timers.tick(1999);
  await settleEvents(restarted);
  assert.equal(flush.mock.callCount(), 0);
  f.setStatus(200);
  t.mock.timers.tick(1);
  await settleEvents(restarted);
  assert.equal(flush.mock.callCount(), 1);
  restarted.pause();
  f.enable(false);
  t.mock.timers.tick(2 * 86400000);
  await settleEvents(restarted);
  assert.equal(flush.mock.callCount(), 1);
  f.enable(true);
  restarted.start();
  t.mock.timers.tick(0);
  await settleEvents(restarted);
  assert.equal(flush.mock.callCount(), 2);
  t.mock.timers.tick(86400000);
  await settleEvents(restarted);
  assert.equal(flush.mock.callCount(), 2);
});

test('resume reconciliation rechecks deadlines after a wall-clock advance without periodic polling', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  const flush = t.mock.method(f.events, 'flush');
  await f.events.subscribe(params({ ttlMs: 60000 }));
  f.events.publish(publication);
  await settleEvents(f.events);
  f.advance(120000);
  f.events.reconcile();
  t.mock.timers.tick(0);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 1);
  assert.equal(f.calls.length, 1);
  t.mock.timers.tick(3600000);
  await settleEvents(f.events);
  assert.equal(flush.mock.callCount(), 1);
});

const meta = () => ({
  'io.modelcontextprotocol/protocolVersion': version,
  'io.modelcontextprotocol/clientCapabilities': {},
});
function request(method, args = {}, headers = {}) {
  const body = { jsonrpc: '2.0', id: 1, method, params: { _meta: meta(), ...args } };
  const all = {
    'mcp-protocol-version': version,
    'mcp-method': method,
    accept: 'application/json, text/event-stream',
    ...(method === 'tools/call' ? { 'mcp-name': args.name } : {}),
    ...headers,
  };
  return { body, req: { headers: all, rawHeaders: Object.entries(all).flat() } };
}
test('modern transport validates per-request metadata, headers and dispatches through the existing tool path', async () => {
  let called = 0;
  const opts = {
    version: 'test',
    tools: () => [],
    callTool: async () => {
      called++;
      return { content: [] };
    },
  };
  for (const method of ['server/discover', 'tools/list', 'tools/call']) {
    const r = request(method, method === 'tools/call' ? { name: 'read' } : {});
    const reply = await modernResponse(r.body, r.req, opts);
    assert.equal(reply.body.result.resultType, 'complete');
  }
  assert.equal(called, 1);
  const mismatch = request('tools/call', { name: 'read' }, { 'mcp-name': 'write' });
  assert.equal((await modernResponse(mismatch.body, mismatch.req, opts)).body.error.code, -32020);
  assert.equal(called, 1);
  const missing = request('tools/list');
  delete missing.body.params._meta['io.modelcontextprotocol/clientCapabilities'];
  assert.equal((await modernResponse(missing.body, missing.req, opts)).status, 400);
  const unknown = request('unsupported');
  assert.equal((await modernResponse(unknown.body, unknown.req, opts)).status, 404);
  assert.equal(modernRequest({ method: 5 }, { headers: {} }), false);
});
test('authenticated HTTP serves modern events and retains legacy initialization', async (t) => {
  const f = fixture(t);
  const mcp = new AutomationMcp(
    { auditTarget: () => '', call: async () => ({ ok: true }) },
    () => 'token',
    () => {},
    'test',
    () => {},
    f.events,
  );
  await mcp.start(0);
  t.after(() => mcp.close());
  const url = `http://127.0.0.1:${mcp.port}/mcp`;
  const post = (body, headers = {}) =>
    fetch(url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const discover = request('server/discover');
  const modern = await post(discover.body, discover.req.headers);
  assert.equal((await modern.json()).result.capabilities.events instanceof Object, true);
  const denied = await post(discover.body, {
    ...discover.req.headers,
    authorization: 'Bearer wrong',
  });
  assert.equal(denied.status, 401);
  const listed = request('events/list');
  assert.equal(
    (await (await post(listed.body, listed.req.headers)).json()).result.events.length,
    1,
  );
  const legacy = await post({
    jsonrpc: '2.0',
    id: 2,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'fixture', version: '1' },
    },
  });
  assert.equal((await legacy.json()).result.serverInfo.name, 'AppDock');
});
