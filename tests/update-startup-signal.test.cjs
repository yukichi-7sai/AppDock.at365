const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { takeUpdateStartupSignal } = require('../out/main/main/core/update-startup-signal');
const { StartupUiBarrier } = require('../out/main/main/core/startup');

test('ordinary startup and invalid update endpoints have no pending acknowledgment; environment is consumed', () => {
  for (const pipe of [undefined, '', 'other-pipe', 'AppDock.UpdateReady...\\external']) {
    const env = { APPDOCK_UPDATE_READY_PIPE: pipe, PRESERVED: 'value' };
    const signal = takeUpdateStartupSignal(env);
    assert.deepEqual(env, { PRESERVED: 'value' });
    assert.equal(signal.pending, false);
    signal.notify(true);
  }
});

test('update launch acknowledges a displayed ready window once and removes the capability before children start', async (t) => {
  const pipe = 'AppDock.UpdateReady.' + randomUUID().replaceAll('-', '');
  const server = net.createServer();
  let connections = 0;
  const received = new Promise((resolve) =>
    server.on('connection', (socket) => {
      connections++;
      let message = '';
      socket.on('data', (chunk) => {
        message += chunk;
      });
      socket.on('end', () => {
        socket.end();
        resolve(message);
      });
    }),
  );
  server.listen('\\\\.\\pipe\\' + pipe);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const env = { APPDOCK_UPDATE_READY_PIPE: pipe };
  const signal = takeUpdateStartupSignal(env);
  assert.deepEqual(env, {});
  signal.notify(false);
  assert.equal(signal.pending, true);
  assert.equal(connections, 0);
  signal.notify(true);
  signal.notify(true);
  assert.equal(signal.pending, false);
  assert.equal(await received, 'shown\n');
  assert.equal(connections, 1);
});

test('an absent updater does not turn an optional startup acknowledgment into an uncaught error', async () => {
  const signal = takeUpdateStartupSignal({
    APPDOCK_UPDATE_READY_PIPE: 'AppDock.UpdateReady.' + randomUUID().replaceAll('-', ''),
  });
  signal.notify(true);
  assert.equal(signal.pending, false);
  await new Promise((resolve) => setImmediate(resolve));
});

test('a delayed renderer can become ready after the initial presentation timeout; cancellation never acknowledges readiness', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ui = new StartupUiBarrier(() => true);
  const waiting = ui.wait(30000);
  t.mock.timers.tick(30000);
  assert.equal(await waiting, false);
  assert.equal(ui.ready, false);
  ui.rendererReady();
  assert.equal(ui.ready, true);
  ui.resetRenderer();
  assert.equal(ui.ready, false);
  ui.cancel();
  ui.rendererReady();
  assert.equal(ui.ready, false);
});
