const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const root = path.resolve(__dirname, '..');
const en = {
  language: 'en',
  defaultLanguage: 'ja',
  messages: { title: 'English', named: '{{name}}: {{count}}' },
};
const ja = {
  language: 'ja',
  defaultLanguage: 'ja',
  messages: { title: '日本語', named: '{{name}} は {{count}} 件' },
};
for (const mode of ['node', 'dotnet', 'native'])
  test(
    `localized ${mode} receives initial language and updates without reactivation`,
    { timeout: 20000 },
    async (t) => {
      const folder = fs.mkdtempSync(path.join(root, '.artifacts/localization-runtime-'));
      const nodeEntry = path.join(folder, 'index.cjs');
      fs.writeFileSync(
        nodeEntry,
        `exports.activate = async (context) => {
    const show = () => context.ui.showPanel({ title: context.localization.t('title'),
      description: context.localization.t('named', {name: '{{count}} $t(title)', count: 3}),
      facts: [{label:'language', value:context.localization.language}] });
    context.commands.register('fixture.localized.show', context.localization.t('title'), show);
    context.localization.onChanged(show); await show();
  };`,
      );
      const probe = path.join(
        root,
        'tests/fixtures/dotnet/AppDock.LocalizationProbe/bin/Release/net10.0/AppDock.LocalizationProbe.dll',
      );
      const args =
        mode === 'node'
          ? [path.join(root, 'out/main/main/node-worker.js'), nodeEntry]
          : mode === 'native'
            ? [probe]
            : [
                path.join(root, '.artifacts/dotnet-host/AppDock.ExtensionHost.dll'),
                probe,
                'AppDock.Tests.LocalizationProbe',
              ];
      const child = spawn(mode === 'node' ? process.execPath : 'dotnet', args, {
        cwd: folder,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const exited = once(child, 'exit');
      let stderr = '';
      child.stderr.on('data', (data) => (stderr += data));
      const panels = [];
      const peer = new JsonLinePeer(child.stdout, child.stdin, async (method, params) => {
        if (method === 'host.ui.panel') panels.push(params);
        else throw Error('Unexpected request: ' + method);
        return null;
      });
      t.after(async () => {
        if (child.exitCode === null) child.kill();
        await exited;
        peer.close();
        assert.equal(path.dirname(folder), path.join(root, '.artifacts'));
        fs.rmSync(folder, { recursive: true, force: true });
      });
      const activated = await peer.request('activate', {
        id: 'fixture.localized',
        settings: {},
        localization: en,
      });
      assert.equal(activated.commands[0].title, 'English');
      assert.equal(panels.at(-1).title, 'English');
      assert.equal(panels.at(-1).description, '{{count}} $t(title): 3');
      await peer.request('localization.changed', ja);
      assert.equal(panels.at(-1).title, '日本語');
      assert.equal(panels.at(-1).description, '{{count}} $t(title) は 3 件');
      assert.equal(panels.at(-1).facts[0].value, 'ja');
      await peer.request('command.execute', { id: 'fixture.localized.show' });
      assert.equal(panels.at(-1).title, '日本語');
      await peer.request('deactivate');
      child.stdin.end();
      const [code] = await exited;
      assert.equal(code, 0, stderr);
    },
  );

test('local UI translation IPC is restricted to the registered owner and main frame', () => {
  const { EventEmitter } = require('node:events');
  const {
    configureAppearance,
    registerAppearance,
    refreshAppearance,
  } = require('../out/main/main/core/appearance-host');
  const { resolveAppearance } = require('../out/main/shared/appearance');
  const handlers = new Map();
  let language = 'en';
  configureAppearance(
    () => ({ ...resolveAppearance('mint', false), language }),
    { handle: (name, fn) => handlers.set(name, fn) },
    [],
    (id) => (id === 'fixture.localized' ? (language === 'en' ? en : ja) : undefined),
  );
  const contents = new EventEmitter();
  contents.mainFrame = { url: 'file:///local.html' };
  contents.getURL = () => contents.mainFrame.url;
  contents.isDestroyed = () => false;
  contents.insertCSS = async () => {};
  const sent = [];
  contents.send = (channel, value) => sent.push({ channel, value });
  registerAppearance(contents, contents.getURL(), 'fixture.localized');
  const event = { sender: contents, senderFrame: contents.mainFrame };
  const handle = handlers.get('appearance:localization');
  assert.equal(handle(event).language, 'en');
  assert.equal(handle(event, 'named', { name: '{{count}}', count: 3 }), '{{count}}: 3');
  assert.throws(() => handle({ ...event, senderFrame: { url: contents.getURL() } }));
  assert.throws(() => handle(event, 'named', { name: {} }));
  refreshAppearance();
  language = 'ja';
  refreshAppearance();
  assert.equal(
    sent.filter((entry) => entry.channel === 'applet-localization:changed').at(-1).value.language,
    'ja',
  );
  contents.mainFrame.url = 'https://remote.invalid/';
  assert.throws(() => handle(event));
  const count = sent.length;
  language = 'en';
  refreshAppearance();
  assert.equal(sent.length, count);
  contents.emit('destroyed');
  assert.throws(() => handle(event));
});
