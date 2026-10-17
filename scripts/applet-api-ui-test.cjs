const { settleSettings } = require('./settings-immediate-helper.cjs');
// Real Node/.NET Applet processes, shared API, local permission UI and isolated MCP.
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process'),
  { createHash } = require('node:crypto'),
  { chromium } = require('playwright');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { parse } = require('smol-toml');
const root = path.resolve(__dirname, '..'),
  portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(
    root,
    '.artifacts',
    `applet-api-${portable ? 'portable' : 'source'}-${Date.now()}`,
  ),
  local = path.join(profile, 'local');
fs.mkdirSync(profile, { recursive: true });
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.closeToTray = true;
settings.keybindings = [];
settings.gestures.enabled = false;
const ids = ['test.api-node', 'test.api-dotnet'];
for (const id of ids) {
  const dir = path.join(profile, 'extensions', id);
  fs.mkdirSync(dir, { recursive: true });
  const dotnet = id.endsWith('dotnet');
  fs.writeFileSync(
    path.join(dir, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: id,
      displayName: id,
      version: '1.0.0',
      runtime: dotnet ? 'dotnet' : 'node',
      entry: dotnet ? 'AppDock.Extensions.ApiProbe.dll' : 'index.cjs',
      ...(dotnet ? { type: 'AppDock.Extensions.ApiProbe.ApiProbe' } : {}),
      capabilities: ['appdock-api', 'settings'],
      commands: ['read', 'write', 'legacy', 'self'].map((action) => ({
        id: `${id}.${action}`,
        title: action,
        automation: true,
      })),
      settings: [
        { key: 'flag', title: 'Flag', type: 'boolean', default: false, automation: true },
        { key: 'privateFlag', title: 'Private', type: 'boolean', default: false },
      ],
    }),
  );
  if (dotnet)
    fs.copyFileSync(
      path.join(
        root,
        'tests/fixtures/dotnet/AppDock.Extensions.ApiProbe/bin/Release/net10.0/AppDock.Extensions.ApiProbe.dll',
      ),
      path.join(dir, 'AppDock.Extensions.ApiProbe.dll'),
    );
  else
    fs.writeFileSync(
      path.join(dir, 'index.cjs'),
      `exports.activate=async context=>{
    await context.settings.set('privateFlag',true);
    for(const action of ['read','write','legacy','self'])context.commands.register('${id}.'+action,action,async()=>{
      let result;try{
        if(action==='read'){
          for(const method of ['system.getInfo','applets.list','settings.getSchema','settings.get','commands.list','shortcuts.get','gestures.get','ribbon.get','tray.get'])await context.appdock.call(method);
          await context.appdock.call('applets.get',{id:'${id}'});result={ok:true};
        }else if(action==='write'){
          const current=await context.appdock.call('settings.get');
          result=await context.appdock.call('commands.execute',{id:'appdock.settings.update',args:{changes:{closeToTray:false},expectedRevision:current.revision}});
        }else if(action==='self')result=await context.appdock.call('commands.execute',{id:'appdock.applets.${id}.restart'});
        else{await context.settings.set('flag',true);await context.settings.set('privateFlag',true);result={ok:true};}
      }catch(error){result={code:error.code||'FAILED'};}
      await context.log.info('probe:'+action+':'+JSON.stringify(result));
    });
  };`,
    );
  settings.extensions[id] = { enabled: true, settings: {} };
}
const legacyDll = process.env.APPDOCK_TEST_LEGACY_DEMO_DLL;
if (legacyDll) {
  const dir = path.join(profile, 'extensions', 'legacy-dotnet');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(
    path.join(root, 'tests/fixtures/extensions/dotnet-demo/extension.json'),
    path.join(dir, 'extension.json'),
  );
  fs.copyFileSync(legacyDll, path.join(dir, 'AppDock.Extensions.Demo.dll'));
  settings.extensions['appdock.dotnet-demo'] = { enabled: true, settings: {} };
}
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
if (portable) fs.copyFileSync(portable, path.join(profile, 'AppDock.at365.exe'));
const states = [],
  checks = [];
let client, page;
const settingsSurface = require('./settings-host-helper.cjs').deferred(() =>
  require('./settings-host-helper.cjs').settingsPage(page),
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await wait(100);
  }
  throw Error(label);
}
async function start() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    portable ? path.join(profile, 'AppDock.at365.exe') : require('electron'),
    [
      ...(portable ? [] : [root]),
      `--test-profile=${profile}`,
      `--test-local-state=${local}`,
      `--remote-debugging-port=${port}`,
    ],
    { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
  );
  const s = { child };
  states.push(s);
  s.browser = await until(
    () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
    'CDP',
  );
  s.page = await until(
    () =>
      s.browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('appdock://host/')),
    'host',
  );
  s.page.setDefaultTimeout(10000);
  await s.page.waitForFunction(async () => (await window.dock?.snapshot())?.startupReady);
  await until(async () => {
    const snap = await s.page.evaluate(() => window.dock.snapshot());
    return ids.every((id) => snap.extensions.some((e) => e.id === id && e.state === 'running'));
  }, 'Applet startup');
  page = s.page;
  return s;
}
async function stop(s) {
  if (!s.browser) return;
  await s.page.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  await until(() => s.child.exitCode !== null, 'quit');
  await s.browser.close();
  s.browser = null;
}
const snapshot = () => page.evaluate(() => window.dock.snapshot());
async function probe(id, action, mcp = false) {
  const prefix = `probe:${action}:`;
  const before = (await snapshot()).logs.filter(
    (l) => l.source === id && l.message.startsWith(prefix),
  ).length;
  if (mcp) {
    const r = await client.callTool({
      name: 'appdock_execute_command',
      arguments: { id: `${id}.${action}` },
    });
    assert.ok(!r.isError, JSON.stringify(r));
  } else await page.evaluate((id) => window.dock.executeCommand(id), `${id}.${action}`);
  return until(async () => {
    const entries = (await snapshot()).logs.filter(
      (l) => l.source === id && l.message.startsWith(prefix),
    );
    return entries.length > before && JSON.parse(entries.at(-1).message.slice(prefix.length));
  }, 'probe ' + action);
}
async function grant(id, permissions) {
  await page.evaluate(({ id, permissions }) => window.dock.setAppletApiPermissions(permissions), {
    id,
    permissions,
  });
}
(async () => {
  try {
    let s = await start();
    if (legacyDll) {
      await until(
        async () =>
          (await snapshot()).extensions.some(
            (e) => e.id === 'appdock.dotnet-demo' && e.state === 'running',
          ),
        'legacy startup',
      );
      await page.evaluate(() => window.dock.executeCommand('appdock.dotnet-demo.refresh'));
      assert.ok((await snapshot()).extensions.find((e) => e.id === 'appdock.dotnet-demo').panel);
      checks.push('pre-change .NET DLL loads and executes with unchanged assembly identity');
    }
    assert.equal(
      (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state.enabled,
      false,
    );
    for (const id of ids) {
      assert.equal((await snapshot()).settings.value.extensions[id].settings.privateFlag, true);
      assert.equal((await probe(id, 'read')).ok, true);
      assert.equal((await probe(id, 'legacy')).ok, true);
    }
    checks.push(
      'MCP off, default-allowed Node/.NET SDK; legacy self-setting during activation and commands needs no new permission',
    );
    assert.equal(Object.keys((await snapshot()).appletApi.permissions).length, 11);
    assert.equal((await snapshot()).appletApi.permissions.useTts, false);
    assert.equal((await snapshot()).appletApi.permissions.useAi, false);
    assert.ok(
      Object.entries((await snapshot()).appletApi.permissions)
        .filter(([k]) => !['useTts', 'useAi'].includes(k))
        .every(([, v]) => v === true),
    );
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await settingsSurface.getByRole('button', { name: /^一般/ }).click();
    assert.equal(await settingsSurface.getByRole('switch', { name: /^Applet：/ }).count(), 0);
    await settingsSurface.getByRole('button', { name: 'MCP・Codex連携', exact: true }).click();
    assert.equal(await settingsSurface.getByRole('switch', { name: /^Codexからの/ }).count(), 0);
    await settingsSurface.getByRole('button', { name: '操作の許可を開く', exact: true }).click();
    const panel = settingsSurface.getByRole('region', { name: '操作の許可', exact: true });
    await panel.getByRole('switch', { name: 'Applet：公開情報の取得', exact: true }).waitFor();
    assert.equal(await panel.getByRole('switch', { name: /^Applet：/ }).count(), 11);
    assert.equal(await panel.getByRole('switch', { name: /^Codexからの/ }).count(), 9);
    for (const control of await panel.getByRole('switch', { name: /^Applet：/ }).all())
      assert.equal(
        await control.isChecked(),
        !/TTS|AI/.test(await control.getAttribute('aria-label')),
      );
    const mcpDefaults = (await page.evaluate(() => window.dock.automation({ kind: 'status' })))
      .state;
    assert.ok(
      Object.entries(mcpDefaults)
        .filter(([key]) => key.startsWith('allow'))
        .every(([, v]) => v === false),
    );
    await grant(ids[0], {});
    await until(
      async () =>
        await panel
          .getByRole('switch', { name: /^Applet：/ })
          .evaluateAll((nodes) => nodes.every((n) => n.getAttribute('aria-checked') === 'false')),
      'all grants revoked',
    );
    await panel.getByText('直接公開なし', { exact: true }).waitFor();
    await panel.getByText('連携中は許可', { exact: true }).waitFor();
    const mcpWrite = panel.getByRole('switch', {
      name: 'Codexからの設定変更を許可する',
      exact: true,
    });
    await mcpWrite.click();
    await until(
      async () =>
        (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state.allowWrite,
      'prepare permission while MCP off',
    );
    assert.equal((await snapshot()).appletApi.permissions.write, undefined);
    assert.equal(
      (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state.enabled,
      false,
    );
    await until(() => mcpWrite.isEnabled(), 'save complete');
    await mcpWrite.click();
    await until(
      async () =>
        !(await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state.allowWrite &&
        (await mcpWrite.isEnabled()),
      'revoke while MCP off',
    );
    // A PC-local permission save must preserve an unrelated immediate settings.json write.
    await settingsSurface.getByRole('button', { name: /^一般/ }).click();
    await settingsSurface.getByRole('button', { name: 'JSON', exact: true }).click();
    const originalJson = await settingsSurface
      .getByRole('textbox', { name: '設定JSON' })
      .inputValue();
    const draft = JSON.parse(originalJson);
    draft.host.startMinimized = true;
    const draftText = JSON.stringify(draft, null, 2);
    await settingsSurface.getByRole('textbox', { name: '設定JSON' }).fill(draftText);
    await settingsSurface.getByRole('button', { name: '操作の許可', exact: true }).click();
    await settleSettings(page);
    const childGrant = panel.getByRole('switch', { name: 'Applet：リボンの編集', exact: true });
    await childGrant.click();
    await panel.getByText(/未有効：公開情報の取得・公開コマンドの実行・公開設定の変更/).waitFor();
    assert.equal((await snapshot()).appletApi.permissions.read, undefined);
    await until(() => childGrant.isEnabled(), 'save child grant');
    await childGrant.click();
    await until(
      async () => !(await childGrant.isChecked()) && (await childGrant.isEnabled()),
      'revoke child grant',
    );
    await settingsSurface.getByRole('button', { name: /^一般/ }).click();
    await settingsSurface.getByRole('button', { name: 'JSON', exact: true }).click();
    assert.deepEqual(
      JSON.parse(await settingsSurface.getByRole('textbox', { name: '設定JSON' }).inputValue()),
      draft,
    );
    assert.equal((await snapshot()).settings.value.host.startMinimized, true);
    await settingsSurface.getByRole('textbox', { name: '設定JSON' }).fill(originalJson);
    await settingsSurface.getByRole('button', { name: '操作の許可', exact: true }).click();
    checks.push(
      'one permissions page; independent Applet/MCP settings, MCP-off preparation, unmet prerequisites and revocation, fixed read/input exposure, immediate shared settings preserved',
    );
    for (const label of ['公開情報の取得', '公開コマンドの実行', '公開設定の変更']) {
      await panel.getByRole('switch', { name: 'Applet：' + label, exact: true }).click();
      await until(
        async () =>
          (await panel
            .getByRole('switch', { name: 'Applet：' + label, exact: true })
            .isChecked()) &&
          !(await panel
            .getByRole('switch', { name: 'Applet：' + label, exact: true })
            .isDisabled()),
        'permission save',
      );
    }
    await grant(ids[1], { read: true, execute: true, write: true, manageApplets: true });
    assert.equal((await probe(ids[0], 'read')).ok, true);
    assert.equal((await probe(ids[1], 'read')).ok, true);
    for (const id of ids) {
      assert.equal((await probe(id, 'write')).completion, 'settingsSaved');
      assert.equal((await snapshot()).settings.value.host.closeToTray, false);
    }
    assert.equal((await probe(ids[1], 'self')).code, 'SELF_CALL');
    checks.push(
      'shared public methods through both SDKs; GUI grant, shared mutation and own-lifecycle rejection',
    );
    const configFile = path.join(profile, 'codex', 'config.toml');
    await page.evaluate(async (configFile) => {
      await window.dock.automation({ kind: 'selectConfig', file: configFile });
      await window.dock.automation({
        kind: 'configure',
        enabled: true,
        allowWrite: false,
        port: 0,
      });
      await window.dock.automation({ kind: 'setExecution', allowed: true });
      await window.dock.automation({ kind: 'register' });
    }, configFile);
    const state = (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state;
    client = new Client({ name: 'Applet API regression', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(state.endpoint), {
        requestInit: {
          headers: parse(fs.readFileSync(configFile, 'utf8')).mcp_servers[state.serverId]
            .http_headers,
        },
      }),
    );
    const denied = await client.callTool({
      name: 'appdock_execute_command',
      arguments: { id: 'appdock.settings.closeToTray.off' },
    });
    assert.equal(denied.structuredContent.code, 'WRITE_DISABLED');
    for (const id of ids) {
      assert.equal((await probe(id, 'write', true)).completion, 'settingsSaved');
      const read = await client.callTool({
        name: 'appdock_get_settings',
        arguments: { appletId: id },
      });
      assert.deepEqual(read.structuredContent.values, { flag: true });
    }
    await grant(ids[0], { read: true, execute: true });
    assert.equal((await probe(ids[0], 'write', true)).code, 'WRITE_DISABLED');
    assert.equal((await probe(ids[1], 'write', true)).code, 'WRITE_DISABLED');
    await grant(ids[0], {});
    assert.equal((await probe(ids[0], 'read')).code, 'API_DISABLED');
    assert.ok(
      (await snapshot()).logs.some(
        (l) =>
          l.source === ids[0] &&
          l.message.includes('[Applet API]') &&
          l.message.includes('result=failed'),
      ),
    );
    checks.push(
      'MCP -> Node/.NET -> shared API reentry, shared Applet grants/revocation, public-only readback and audit',
    );
    await grant(ids[0], { read: true, execute: true, write: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        s.settings.value.host.theme = theme;
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      }, theme);
      for (const width of [1280, 960, 700]) {
        await page.setViewportSize({ width, height: 860 });
        await wait(150);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          'horizontal overflow',
        );
        await (
          await require('./settings-host-helper.cjs').settingsPage(page)
        ).screenshot({ path: path.join(profile, `permissions-${theme}-${width}.png`) });
        if (width === 700) {
          await panel.getByText('直接公開なし', { exact: true }).scrollIntoViewIfNeeded();
          await (
            await require('./settings-host-helper.cjs').settingsPage(page)
          ).screenshot({
            path: path.join(profile, `permissions-${theme}-${width}-input.png`),
          });
          await settingsSurface
            .getByRole('heading', { name: '操作の許可', level: 1, exact: true })
            .scrollIntoViewIfNeeded();
        }
      }
    }
    await client.close();
    client = null;
    await page.evaluate(() =>
      window.dock.automation({ kind: 'configure', enabled: false, allowWrite: false, port: 0 }),
    );
    await stop(s);
    s = await start();
    assert.equal((await probe(ids[0], 'read')).ok, true);
    assert.equal((await probe(ids[1], 'write')).completion, 'settingsSaved');
    assert.equal(
      (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state.running,
      false,
    );
    checks.push('both themes at three widths; permissions survive restart with MCP disabled');
    await stop(s);
    const result = {
      ok: true,
      profile,
      portable: !!portable,
      sha256: portable ? hash(portable) : null,
      legacySha256: legacyDll ? hash(legacyDll) : null,
      fixtureSha256: hash(
        path.join(profile, 'extensions', ids[1], 'AppDock.Extensions.ApiProbe.dll'),
      ),
      checks,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error);
    try {
      if (page)
        await (
          await require('./settings-host-helper.cjs').settingsPage(page)
        ).screenshot({
          path: path.join(profile, 'failure.png'),
        });
    } catch {}
    process.exitCode = 1;
  } finally {
    await client?.close().catch(() => {});
    for (const s of states) await stop(s).catch(() => {});
  }
})();
