const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { WebAccountController } = require('../out/main/main/core/web-accounts');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const { WebAccountReadChannel } = require('../out/main/main/core/web-account-read');

// Run the shipped Node worker on its real stdio protocol. Only the remote page is simulated.
function fixture(t, count, observe) {
  const root = fs.mkdtempSync(path.resolve('.artifacts/web-account-wire-'));
  const entry = path.join(root, 'reader.cjs');
  fs.writeFileSync(
    entry,
    `exports.activate = async c => {
    const read = async () => {
      const r = await c.webAccounts.read();
      return { ids:r.accounts.map(a=>a.id), sizes:r.accounts.map(a=>a.observation?.text.length || 0),
        acknowledged:r.acknowledged, resets:r.monitoringResets };
    };
    c.commands.register('test.reader.read','read',read);
    await c.log.info(JSON.stringify(await read()));
  };`,
  );
  const controller = Object.create(WebAccountController.prototype);
  const accounts = Array.from({ length: count }, (_, i) => ({
    id: String(i),
    name: 'account ' + i,
  }));
  const url = 'https://example.invalid/';
  const versions = () => new Map([['0', 1]]);
  Object.assign(controller, {
    state: { accounts, selected: '0' },
    definition: { url, observeOrigin: new URL(url).origin },
    start: async () => {},
    deleting: new Set(),
    generation: new Map(),
    reads: new Map(),
    source: '',
    views: new Map(
      accounts.map((a) => [
        a.id,
        {
          webContents: {
            isDestroyed: () => false,
            isLoadingMainFrame: () => false,
            isLoading: () => false,
            getURL: () => url,
            navigationHistory: { canGoBack: () => false, canGoForward: () => false },
            executeJavaScriptInIsolatedWorld: () => observe(a.id),
          },
        },
      ]),
    ),
    statuses: new Map(
      accounts.map((a) => [a.id, { error: '', status: '', data: 'null', attention: false }]),
    ),
    soundFailures: new Map(),
    updateAccountName() {},
    updateAvatar() {},
    acknowledgements: versions(),
    monitoringResets: versions(),
    readChannel: new WebAccountReadChannel(),
  });
  const child = spawn(process.execPath, [path.resolve('out/main/main/node-worker.js'), entry], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let log,
    loseNextFinal = false;
  const peer = new JsonLinePeer(child.stdout, child.stdin, async (method, p) => {
    if (method === 'host.webAccounts.read') return controller.read();
    if (method === 'host.webAccounts.readPart') {
      const response = await controller.readPart(p);
      if (loseNextFinal && response.next === null) {
        loseNextFinal = false;
        throw Error('lost final page');
      }
      return response;
    }
    if (method === 'host.log') {
      log = JSON.parse(p.message);
      return null;
    }
    throw Error('Unexpected ' + method);
  });
  t.after(async () => {
    peer.close();
    controller.readChannel?.close();
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    fs.unlinkSync(entry);
    fs.rmdirSync(root);
  });
  return {
    controller,
    peer,
    accounts,
    loseFinal: () => {
      loseNextFinal = true;
    },
    async activate() {
      await peer.request('activate', { id: 'test.reader', settings: {} });
      return log;
    },
    read: () => peer.request('command.execute', { id: 'test.reader.read' }),
  };
}

test('worker receives every large observation and only confirms the event generation it received', async (t) => {
  const value = { text: 'あ'.repeat(19665) };
  const f = fixture(t, 18, async () => value);
  const first = await f.activate();
  assert.deepEqual(
    first.ids,
    f.accounts.map((a) => a.id),
  );
  assert.deepEqual(first.sizes, Array(18).fill(value.text.length));
  assert.deepEqual(first.acknowledged, ['0']);
  assert.deepEqual(first.resets, ['0']);
  f.controller.monitoringResets.set('0', 2);
  f.loseFinal();
  await assert.rejects(f.read(), /lost final page/);
  const again = await f.read();
  assert.deepEqual(again.resets, ['0']);
  assert.deepEqual(again.acknowledged, []);
  assert.deepEqual((await f.read()).resets, []);
});

test('an Applet can activate while 19 observers are unresponsive and a healthy account follows them', async (t) => {
  const f = fixture(t, 20, (id) =>
    id === '19' ? Promise.resolve({ text: 'ready' }) : new Promise(() => {}),
  );
  const first = await f.activate();
  assert.deepEqual(
    first.ids,
    f.accounts.map((a) => a.id),
  );
  assert.equal(first.sizes.at(-1), 5);
  assert.deepEqual(first.resets, ['0']);
});

test('late observations are delivered once and a navigated account discards stale results', async (t) => {
  let calls = 0;
  let release;
  const f = fixture(t, 1, () => {
    calls++;
    return calls < 3
      ? new Promise((resolve) => {
          release = resolve;
        })
      : Promise.resolve({ text: 'new page' });
  });
  assert.deepEqual((await f.activate()).sizes, [0]);
  assert.deepEqual((await f.read()).sizes, [0]);
  assert.equal(calls, 1);
  release({ text: 'late' });
  assert.deepEqual((await f.read()).sizes, [4]);
  assert.equal(calls, 1);
  assert.deepEqual((await f.read()).sizes, [0]);
  f.controller.generation.set('0', 2);
  release({ text: 'stale' });
  assert.deepEqual((await f.read()).sizes, [8]);
  assert.equal(calls, 3);
});
