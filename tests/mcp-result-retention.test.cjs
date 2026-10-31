const { test } = require('node:test');
const assert = require('node:assert/strict');
const { McpClientService } = require('../out/main/main/core/mcp-client');

function fixture(t, now = 1000) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now });
  const service = new McpClientService({ settings: {}, authorized: () => true, ttlMs: 100 });
  const expire = service.expire.bind(service);
  let checks = 0;
  service.expire = () => {
    checks++;
    expire();
  };
  t.after(() => service.shutdown());
  const job = (id) => {
    const record = {
      job: { jobId: id, state: 'running', createdAt: Date.now() },
      controller: new AbortController(),
      dispose() {},
    };
    service.jobs.set(id, record);
    return record;
  };
  return { service, job, checks: () => checks };
}

test('MCP result cleanup does not wake while idle or while only unfinished jobs exist', (t) => {
  const f = fixture(t);
  t.mock.timers.tick(600000);
  assert.equal(f.checks(), 0);
  f.job('running');
  t.mock.timers.tick(600000);
  assert.equal(f.checks(), 0);
  assert.equal(f.service.jobs.size, 1);
});

test('a completed MCP result survives the TTL boundary, expires once, and leaves no recurring cleanup', (t) => {
  const f = fixture(t, 0);
  f.service.finish(f.job('done'), 'succeeded');
  t.mock.timers.tick(100);
  assert.equal(f.service.jobs.has('done'), true);
  assert.equal(f.checks(), 0);
  t.mock.timers.tick(1);
  assert.equal(f.service.jobs.has('done'), false);
  assert.equal(f.checks(), 1);
  t.mock.timers.tick(600000);
  assert.equal(f.checks(), 1);
});

test('MCP result deadlines preserve earlier results and schedule the next remaining expiry', (t) => {
  const f = fixture(t);
  f.service.finish(f.job('first'), 'succeeded');
  t.mock.timers.tick(50);
  f.service.finish(f.job('second'), 'failed');
  const running = f.job('still-running');
  t.mock.timers.tick(51);
  assert.equal(f.service.jobs.has('first'), false);
  assert.equal(f.service.jobs.has('second'), true);
  assert.equal(f.checks(), 1);
  t.mock.timers.tick(50);
  assert.deepEqual([...f.service.jobs.keys()], ['still-running']);
  assert.equal(running.job.state, 'running');
  assert.equal(f.checks(), 2);
});

test('MCP reads remove results after a wall-clock jump and shutdown cancels pending cleanup', async (t) => {
  const f = fixture(t);
  f.service.finish(f.job('done'), 'succeeded');
  t.mock.timers.setTime(2000);
  assert.deepEqual(f.service.summaries(), []);
  f.service.finish(f.job('another'), 'succeeded');
  f.job('running');
  await f.service.shutdown();
  assert.equal(f.service.jobs.size, 0);
  const checks = f.checks();
  t.mock.timers.tick(600000);
  assert.equal(f.checks(), checks);
});

test('a completion after the wall clock moves backward preempts the existing result reservation', (t) => {
  const f = fixture(t);
  f.service.finish(f.job('earlier-completion'), 'succeeded');
  t.mock.timers.setTime(500);
  f.service.finish(f.job('earlier-deadline'), 'succeeded');
  t.mock.timers.tick(101);
  assert.equal(f.service.jobs.has('earlier-deadline'), false);
  assert.equal(f.service.jobs.has('earlier-completion'), true);
  assert.equal(f.checks(), 1);
  t.mock.timers.setTime(1101);
  assert.deepEqual(f.service.summaries(), []);
});
