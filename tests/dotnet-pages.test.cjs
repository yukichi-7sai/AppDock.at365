const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const root = path.resolve(__dirname, '..');
for (const mode of ['native', 'dotnet']) test(`.NET pages ${mode}: JSON, typed services, serialized reentry, limits and cancellation`, { timeout: 20000 }, async (t) => {
  const folder = fs.mkdtempSync(path.join(root, '.artifacts/page-runtime-'));
  t.after(() => { assert.equal(path.dirname(folder), path.join(root, '.artifacts')); fs.rmSync(folder, { recursive: true, force: true }); });
  const dll = path.join(root, 'tests/fixtures/dotnet/AppDock.PageProbe/bin/Release/net10.0/AppDock.PageProbe.dll');
  const args = mode === 'native'
    ? [path.join(root, 'tests/fixtures/dotnet/AppDock.PageProbe.Native/bin/Release/net10.0/AppDock.PageProbe.Native.dll')]
    : [path.join(root, 'dotnet/AppDock.ExtensionHost/bin/Release/net10.0/AppDock.ExtensionHost.dll'), dll, 'AppDock.Tests.PageProbe'];
  const child = spawn('dotnet', args, { cwd: root, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let stderr = ''; child.stderr.on('data', (b) => stderr += b);
  t.after(() => { if (stderr) t.diagnostic(stderr); });
  const calls = []; let openedEcho, waitStarted;
  const waiting = new Promise((resolve) => waitStarted = resolve);
  const peer = new JsonLinePeer(child.stdout, child.stdin, async (method, input) => {
    calls.push({ method, input });
    switch (method) {
      case 'host.pages.list': return { revision: 3, pages: [] };
      case 'host.pages.replace': assert.equal(input.expectedRevision, 3); assert.equal(input.pages[0].source, 'local'); assert.ok(!('openCommand' in input.pages[0])); return { revision: 4 };
      case 'host.pages.open': openedEcho = peer.request('page.action', { id: 'echo', input: { opened: true }, pageId: 'main' }); return null;
      case 'host.ui.imageDirectory': return folder;
      case 'host.pages.images.register': assert.equal(input.id, 'main'); assert.ok(fs.existsSync(input.files[0].file)); return { images: [{ key: 'probe', id: 'opaque', url: 'appdock://page-images/opaque' }] };
      case 'host.pages.changed': return { accepted: true, delivered: true };
      case 'host.log': if (input.message === 'PAGE_WAIT_STARTED') waitStarted(); return null;
      default: return null;
    }
  });
  t.after(() => peer.close());
  const activated = await peer.request('activate', { id: 'test.pages', settings: {} });
  assert.equal(activated.commands.length, 2);
  const action = (id, input = {}) => peer.request('page.action', { id, input, pageId: 'main' });
  assert.deepEqual(await action('echo', { value: '画像', enabled: true, number: 12 }), { value: '画像', enabled: true, number: 12 });
  assert.equal(await action('null'), null);
  assert.deepEqual(await action('pages'), { revision: 4 });
  assert.deepEqual(calls.filter((call) => call.method.startsWith('host.pages.')).map((call) => call.method), ['host.pages.list','host.pages.replace','host.pages.hide','host.pages.dispose']);
  assert.match((await action('images')).images[0].url, /^appdock:/);
  await peer.request('command.execute', { id: 'test.pages.details' });
  assert.ok(calls.some((call) => call.method === 'host.ui.openDetails'));
  await peer.request('command.execute', { id: 'test.pages.open' });
  assert.deepEqual(await openedEcho, { opened: true });
  await assert.rejects(action('large'), /大きすぎ/);
  await assert.rejects(action('fail'), /Expected page failure/);
  assert.deepEqual(await action('echo', { alive: true }), { alive: true });
  const pending = action('wait').catch((error) => error);
  await waiting;
  await peer.request('deactivate');
  assert.ok((await pending) instanceof Error);
  child.stdin.end();
  const [exitCode] = await once(child, 'exit');
  assert.equal(exitCode, 0, stderr);
});
