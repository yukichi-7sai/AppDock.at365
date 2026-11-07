const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PassThrough } = require('node:stream');
const resources = require('../resources/translations/host.json');
const artifacts = path.resolve('.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const profile = fs.mkdtempSync(path.join(artifacts, 'native-localization-unit-'));
fs.mkdirSync(path.join(profile, 'translations'));
fs.writeFileSync(
  path.join(profile, 'translations/host_en.json'),
  JSON.stringify({
    'native.input.failed': 'Input was not completed.',
    'native.touchpad.notOwner': 'Another host owns this connection.',
    'native.updater.extractDestination': 'The extraction folder already exists.',
    'native.hostPackage.runtimeBundled': 'Runtime cannot be bundled: {{path}}',
  }),
);
process.argv.push(`--test-profile=${profile}`);
const { configureHostLanguage } = require('../out/main/main/core/host-translation-source');
const native = require('../out/main/main/core/native-messages');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
let language = 'ja';
configureHostLanguage(() => language);
after(() => fs.rmSync(profile, { recursive: true, force: true }));
const message = (hostTextKey, values = {}) => ({ hostTextKey, values });

test('native replies translate at receipt, preserve codes, variables and external text', async () => {
  const incoming = new PassThrough(),
    outgoing = new PassThrough();
  const peer = new JsonLinePeer(
    incoming,
    outgoing,
    async () => {},
    undefined,
    native.nativeRpcMessage,
  );
  const reply = async (result, error) => {
    const pending = peer.request('fixture', {});
    if (!outgoing.readableLength)
      await new Promise((resolve) => outgoing.once('readable', resolve));
    const request = JSON.parse(outgoing.read().toString());
    incoming.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result, error }) + '\n');
    return pending;
  };
  try {
    language = 'ja';
    const payload = { ok: false, code: 'INPUT_FAILED', message: message('native.input.failed') };
    assert.equal(
      (await reply(payload)).message,
      '入力操作が完了しませんでした。送信先・キーの押下状態・権限を確認してください。',
    );
    language = 'en';
    assert.deepEqual(await reply(payload), {
      ok: false,
      code: 'INPUT_FAILED',
      message: 'Input was not completed.',
    });
    assert.equal(
      native.nativeMessage(message('native.input.cancelled')),
      resources['native.input.cancelled'],
    );
    await assert.rejects(
      reply(undefined, {
        code: -32000,
        message: 'native.touchpad.notOwner',
        data: message('native.touchpad.notOwner'),
      }),
      /Another host owns this connection/,
    );
    const value = '日本語 {{path}} $t(language.label)';
    assert.equal(
      native.nativeMessage(message('native.hostPackage.runtimeBundled', { path: value })),
      'Runtime cannot be bundled: ' + value,
    );
    for (const external of [value, 'native.input.failed', resources['native.input.failed']]) {
      assert.equal((await reply({ message: external })).message, external);
      assert.equal(native.nativeLogLine(external), external);
    }
    assert.equal(
      native.nativeLogLine(JSON.stringify(message('native.input.failed'))),
      'Input was not completed.',
    );
    assert.equal(native.nativeMessage(message('unknown.key')), undefined);
    assert.equal(native.nativeMessage(message('native.input.failed', { value: {} })), undefined);
  } finally {
    peer.close();
  }
});

test('Applet RPC does not interpret native-looking objects', async () => {
  const incoming = new PassThrough(),
    outgoing = new PassThrough();
  const peer = new JsonLinePeer(incoming, outgoing, async () => {});
  try {
    const pending = peer.request('fixture', {});
    if (!outgoing.readableLength)
      await new Promise((resolve) => outgoing.once('readable', resolve));
    const request = JSON.parse(outgoing.read().toString());
    const result = message('native.input.failed');
    incoming.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
    assert.deepEqual(await pending, result);
  } finally {
    peer.close();
  }
});

test('real updater rejects existing destinations in the selected language and keeps their data', async () => {
  const helper = path.resolve('.artifacts/updater/AppDock.Updater.exe');
  const destination = path.join(profile, 'existing');
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination, 'keep.txt'), 'preserved');
  const args = ['--extract', 'unused.zip', destination];
  language = 'en';
  await assert.rejects(native.executeNativeHelper(helper, args, { windowsHide: true }), {
    message: 'The extraction folder already exists.',
  });
  language = 'ja';
  await assert.rejects(native.executeNativeHelper(helper, args, { windowsHide: true }), {
    message: '展開先は空の新規フォルダーにしてください。',
  });
  const cli = spawnSync(helper, args, { encoding: 'utf8', windowsHide: true });
  assert.equal(cli.status, 1);
  assert.equal(cli.stderr.trim(), '展開先は空の新規フォルダーにしてください。');
  assert.equal(fs.readFileSync(path.join(destination, 'keep.txt'), 'utf8'), 'preserved');
});

test('every native message uses a known key, with no Japanese fixed text in migrated helpers', () => {
  const used = new Set();
  for (const folder of ['AppDock.InputHost', 'AppDock.Updater']) {
    for (const name of fs
      .readdirSync(path.join('dotnet', folder))
      .filter((name) => name.endsWith('.cs'))) {
      const source = fs.readFileSync(path.join('dotnet', folder, name), 'utf8');
      for (const match of source.matchAll(
        /NativeMessages\.(?:Text|Error|Message|Log)\("([^"]+)"/g,
      )) {
        assert.equal(typeof resources[match[1]], 'string', `${name}: ${match[1]}`);
        used.add(match[1]);
      }
      assert.doesNotMatch(source, /"[^"\r\n]*[ぁ-んァ-ヶ一-龠][^"\r\n]*"/, name);
    }
  }
  for (const key of Object.keys(resources).filter((key) => key.startsWith('native.')))
    assert.ok(used.has(key), key);
});
