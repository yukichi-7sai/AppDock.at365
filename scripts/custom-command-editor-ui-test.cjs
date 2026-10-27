const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const { freePort } = require('./electron-main-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(
  root,
  '.artifacts',
  'custom-command-editor-' + (portable ? 'portable-' : 'source-') + Date.now(),
);
const local = path.join(profile, 'local');
fs.mkdirSync(local, { recursive: true });
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const checks = [],
  fixtures = [],
  errors = [];
let browser,
  host,
  child,
  page,
  success = false;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      last = error;
    }
    await wait(50);
  }
  throw Error(label + (last ? ': ' + last.message : ''));
}
async function fixture(name) {
  const state = { changed: false, fail: false, lists: 0, calls: 0, pause: null };
  const sessions = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      let session = sessions.get(req.headers['mcp-session-id']);
      if (!session) {
        const sdk = new Server({ name, version: '1' }, { capabilities: { tools: {} } });
        sdk.setRequestHandler(ListToolsRequestSchema, async ({ params }) => {
          state.lists++;
          if (state.pause) await state.pause;
          if (state.fail) throw Error('Discovery fixture failure');
          const offset = Number(params?.cursor || 0);
          const tools = Array.from({ length: 55 }, (_, index) => ({
            name: 'tool_' + index,
            title: name + ' ' + index,
            description:
              index === 0
                ? (name + ' 説明を全文表示します。\n').repeat(70)
                : name + ' tool ' + index,
            inputSchema: {
              type: 'object',
              properties: { message: { type: 'string' } },
              ...(state.changed ? { required: ['message'] } : {}),
              additionalProperties: false,
            },
          }));
          return {
            tools: tools.slice(offset, offset + 20),
            ...(offset + 20 < tools.length ? { nextCursor: String(offset + 20) } : {}),
          };
        });
        sdk.setRequestHandler(CallToolRequestSchema, async () => {
          state.calls++;
          return { content: [{ type: 'text', text: 'unexpected execution' }] };
        });
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          enableJsonResponse: true,
          onsessioninitialized: (id) => sessions.set(id, { sdk, transport }),
        });
        session = { sdk, transport };
        await sdk.connect(transport);
      }
      await session.transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const result = {
    id: randomUUID(),
    name,
    url: 'http://127.0.0.1:' + server.address().port + '/mcp',
    state,
    sessions,
    server,
  };
  fixtures.push(result);
  return result;
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
const definitions = async () => (await snapshot()).settings.value.customCommands.items;
const diskDefinitions = () =>
  JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8')).customCommands.items;
(async () => {
  let release;
  try {
    const a = await fixture('Catalog A'),
      b = await fixture('Catalog B');
    const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
    settings.host.closeToTray = false;
    settings.host.hardwareAcceleration = false;
    settings.host.showHints = false;
    settings.keybindings = [];
    settings.gestures.enabled = false;
    settings.updates.checkHostOnStartup = false;
    settings.updates.checkAppletsOnStartup = false;
    settings.mcpServers = {
      version: 1,
      items: fixtures.map(({ id, name }) => ({ id, name, description: '' })),
    };
    settings.customCommands = { version: 2, items: [] };
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
    const defaultConnection = require('../out/main/shared/mcp-client').defaultMcpConnection;
    fs.writeFileSync(
      path.join(local, 'mcp-client.json'),
      JSON.stringify({
        version: 1,
        entries: Object.fromEntries(
          fixtures.map(({ id, url }) => [
            id,
            { connection: { ...defaultConnection(), enabled: true, url } },
          ]),
        ),
      }),
    );
    let exe = require('electron');
    if (portable) {
      exe = path.join(profile, 'AppDock.at365.exe');
      require('./copy-host.cjs').copyHost(portable, exe);
      assert.equal(hash(exe), hash(portable));
    }
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const port = await freePort();
    child = spawn(
      exe,
      [
        ...(portable ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + local,
        '--remote-debugging-port=' + port,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (data) => fs.appendFileSync(path.join(profile, 'process.log'), data));
    browser = await until(
      () => chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }),
      'CDP',
    );
    host = await until(
      () =>
        browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((p) => p.url().startsWith('appdock://host/')),
      'host',
    );
    host.on('pageerror', (error) => errors.push(error.message));
    await until(async () => (await snapshot()).startupReady, 'startup');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    page = await settingsPage(host);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ width: 1200, height: 850 });
    await page.getByRole('button', { name: 'カスタムコマンド', exact: true }).click();
    const dialog = page.getByTestId('settings-dialog');
    const add = async (kind) => {
      await page.getByRole('button', { name: 'コマンドを追加', exact: true }).click();
      await dialog.getByTestId('custom-command-kind').selectOption(kind);
    };
    const cancel = async () => {
      await dialog.getByTestId('settings-dialog-cancel').click();
      await dialog.waitFor({ state: 'hidden' });
    };
    const save = async () => {
      await until(() => dialog.getByTestId('settings-dialog-confirm').isEnabled(), 'save ready');
      await dialog.getByTestId('settings-dialog-confirm').click();
      await dialog.waitFor({ state: 'hidden' });
    };
    const edit = async (title) => {
      await page.getByRole('button', { name: title + 'を編集', exact: true }).click();
    };
    const options = async () => {
      const details = dialog.getByTestId('custom-command-options');
      if (!(await details.evaluate((el) => el.open)))
        await details.locator(':scope > summary').click();
    };
    await add('appdock.mcp.call');
    await dialog.getByLabel('名前', { exact: true }).fill('Saved MCP');
    await dialog.getByLabel('説明', { exact: true }).fill('Metadata preserved');
    assert.equal(
      await dialog.getByRole('button', { name: 'ツールを取得', exact: true }).count(),
      0,
    );
    assert.equal(
      await dialog.getByRole('button', { name: '詳細を再取得', exact: true }).count(),
      0,
    );
    await dialog.getByTestId('custom-command-kind-info').hover();
    await page.locator('.settings-hint-tooltip:popover-open').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.settings-hint-tooltip:popover-open').count(), 0);
    assert(await dialog.isVisible());
    await dialog.getByTestId('custom-command-kind-info').focus();
    await page.locator('.settings-hint-tooltip:popover-open').waitFor();
    await dialog.getByLabel('名前', { exact: true }).focus();
    await dialog.getByTestId('custom-command-mcp-server').selectOption(a.id);
    await until(
      async () =>
        (await dialog.getByTestId('custom-command-mcp-tool').locator('option').count()) === 56,
      'all pages',
    );
    await dialog.getByTestId('custom-command-mcp-tool').selectOption('tool_0');
    await dialog.getByTestId('custom-command-tool-description').waitFor();
    const rect = await dialog.boundingBox();
    await dialog.locator('.settings-description-button').click();
    await page.locator('.settings-description-popover:popover-open').waitFor();
    assert(
      (await page.locator('.settings-description-popover:popover-open').innerText()).length > 1000,
    );
    assert.equal(Math.round((await dialog.boundingBox()).height), Math.round(rect.height));
    await page
      .locator('.settings-description-popover:popover-open .settings-description-close')
      .click();
    assert(
      await dialog
        .locator('.settings-description-button')
        .evaluate((el) => el === document.activeElement),
    );
    await dialog.locator('.settings-description-button').click();
    await page
      .locator('.settings-description-popover:popover-open .settings-description-close')
      .focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.settings-description-popover:popover-open').count(), 0);
    assert(await dialog.isVisible());
    assert(
      await dialog
        .locator('.settings-description-button')
        .evaluate((el) => el === document.activeElement),
    );
    await dialog.getByTestId('custom-command-mcp-arguments').fill('{bad');
    await until(
      async () => !(await dialog.getByTestId('settings-dialog-confirm').isEnabled()),
      'invalid args blocked',
    );
    await dialog.getByTestId('custom-command-mcp-arguments').fill('{"message":"original"}');
    await options();
    await dialog.getByLabel('待ち時間（ミリ秒）', { exact: true }).fill('90000');
    await save();
    const original = structuredClone(
      (await definitions()).find((item) => item.title === 'Saved MCP'),
    );
    assert.equal(original.config.timeoutMs, 90000);
    checks.push(
      'automatic complete catalog, selection details, independent info icons, long description, invalid JSON, save',
    );
    await edit('Saved MCP');
    await until(
      async () => await dialog.getByTestId('custom-command-mcp-tool').isEnabled(),
      'edit auto discovery',
    );
    assert.equal(await dialog.getByTestId('custom-command-mcp-tool').inputValue(), 'tool_0');
    assert.equal(await dialog.getByTestId('custom-command-tool-review').count(), 0);
    await dialog.getByTestId('custom-command-mcp-arguments').fill('{"message":"draft"}');
    await dialog.getByTestId('custom-command-mcp-server').selectOption(b.id);
    await until(
      async () => await dialog.getByTestId('custom-command-mcp-tool').isEnabled(),
      'B catalog',
    );
    a.state.pause = new Promise((resolve) => {
      release = resolve;
    });
    const beforeLists = a.state.lists;
    await dialog.getByTestId('custom-command-mcp-server').selectOption(a.id);
    await until(() => a.state.lists > beforeLists, 'slow A begins');
    await dialog.getByTestId('custom-command-mcp-arguments').fill('{"message":"during discovery"}');
    await dialog.getByTestId('custom-command-mcp-server').selectOption(b.id);
    await until(
      async () => await dialog.getByTestId('custom-command-mcp-tool').isEnabled(),
      'new B wins',
    );
    release();
    release = null;
    a.state.pause = null;
    await wait(150);
    assert.equal(await dialog.getByTestId('custom-command-mcp-server').inputValue(), b.id);
    assert(
      (await dialog.getByTestId('custom-command-mcp-tool').innerText()).includes('Catalog B 54'),
    );
    assert.equal(
      await dialog.getByTestId('custom-command-mcp-arguments').inputValue(),
      '{"message":"during discovery"}',
    );
    await cancel();
    assert.deepEqual(
      (await definitions()).find((item) => item.id === original.id),
      original,
    );
    checks.push(
      'edit discovery, latest connection wins, pending argument drafts retained, cancel is unchanged',
    );
    a.state.fail = true;
    await edit('Saved MCP');
    await dialog.getByRole('button', { name: '再試行', exact: true }).waitFor();
    await dialog.getByLabel('名前', { exact: true }).fill('Offline rename');
    await save();
    assert.deepEqual(
      (await definitions()).find((item) => item.id === original.id).config,
      original.config,
    );
    await edit('Offline rename');
    await dialog.getByRole('button', { name: '再試行', exact: true }).waitFor();
    a.state.fail = false;
    await dialog.getByRole('button', { name: '再試行', exact: true }).click();
    await until(
      async () => await dialog.getByTestId('custom-command-mcp-tool').isEnabled(),
      'retry',
    );
    await dialog.getByLabel('名前', { exact: true }).fill('Saved MCP');
    await save();
    checks.push('failed discovery retries; offline metadata editing preserves the saved tool');
    a.state.changed = true;
    await edit('Saved MCP');
    await dialog.getByTestId('custom-command-tool-review').waitFor();
    assert.equal(
      (await definitions()).find((item) => item.id === original.id).config.toolRevision,
      original.config.toolRevision,
    );
    assert.equal(await dialog.getByTestId('settings-dialog-confirm').isEnabled(), false);
    await cancel();
    assert.deepEqual(
      (await definitions()).find((item) => item.id === original.id).config,
      original.config,
    );
    await edit('Saved MCP');
    await dialog.getByTestId('custom-command-accept-tool').click();
    await save();
    const adopted = (await definitions()).find((item) => item.id === original.id);
    assert.notEqual(adopted.config.toolRevision, original.config.toolRevision);
    assert.deepEqual(adopted.config.arguments, original.config.arguments);
    assert.equal(adopted.description, original.description);
    checks.push(
      'schema change requires explicit adoption, cancellation preserves the previous revision and arguments',
    );
    await edit('Saved MCP');
    await until(
      async () => await dialog.getByTestId('custom-command-mcp-tool').isEnabled(),
      'ready',
    );
    await options();
    await dialog.getByLabel('設定をJSONで編集', { exact: true }).check();
    const json = dialog.getByLabel('固定設定（JSON）', { exact: true });
    const config = JSON.parse(await json.inputValue());
    config.arguments.message = 'JSON edit';
    config.toolRevision = 'stale';
    await json.fill(JSON.stringify(config));
    await dialog.getByTestId('settings-dialog-confirm').click();
    await dialog.getByTestId('custom-command-accept-tool').waitFor();
    assert.equal(
      JSON.parse(await dialog.getByTestId('custom-command-mcp-arguments').inputValue()).message,
      'JSON edit',
    );
    await dialog.getByTestId('custom-command-accept-tool').click();
    await save();
    checks.push('JSON edits with an obsolete revision return to review without losing arguments');
    await edit('Saved MCP');
    await until(
      async () => await dialog.getByTestId('custom-command-mcp-tool').isEnabled(),
      'layout ready',
    );
    await page.screenshot({ path: path.join(profile, 'editor-wide.png') });
    for (const width of [520, 360]) {
      await page.setViewportSize({ width, height: 650 });
      const bounds = await dialog.evaluate((el) => ({
        right: el.getBoundingClientRect().right,
        width: window.innerWidth,
        footer: el.querySelector('footer').getBoundingClientRect().bottom,
        height: window.innerHeight,
        overflow: el.scrollWidth > el.clientWidth + 1,
      }));
      assert(
        bounds.right <= bounds.width && bounds.footer <= bounds.height && !bounds.overflow,
        JSON.stringify(bounds),
      );
    }
    await page.screenshot({ path: path.join(profile, 'editor-narrow.png') });
    await cancel();
    await page.setViewportSize({ width: 1200, height: 850 });
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = 'dark';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await add('appdock.process.start');
    await dialog.getByLabel('名前', { exact: true }).fill('Saved process');
    await dialog.getByTestId('custom-command-process-info').focus();
    await page.locator('.settings-hint-tooltip:popover-open').waitFor();
    await dialog
      .getByLabel('実行ファイル', { exact: true })
      .fill(path.join(process.env.WINDIR, 'System32', 'notepad.exe'));
    await dialog.getByLabel('引数', { exact: true }).fill('{bad');
    await until(
      async () => !(await dialog.getByTestId('settings-dialog-confirm').isEnabled()),
      'bad process args',
    );
    await dialog.getByLabel('引数', { exact: true }).fill('["example.txt"]');
    await options();
    await dialog.getByLabel('作業フォルダー', { exact: true }).fill(profile);
    await dialog.getByLabel('コンソールを表示する', { exact: true }).check();
    await page.screenshot({ path: path.join(profile, 'process-dark.png') });
    await save();
    const processItem = (await definitions()).find((item) => item.title === 'Saved process');
    assert.equal(processItem.config.workingDirectory, profile);
    await edit('Saved process');
    await dialog.getByTestId('custom-command-process-mode').selectOption('powershell');
    await dialog.getByLabel('スクリプト', { exact: true }).fill('Write-Output "fixture"');
    await save();
    const processUpdated = (await definitions()).find((item) => item.id === processItem.id);
    assert.equal(processUpdated.config.mode, 'powershell');
    assert.equal(processUpdated.config.workingDirectory, profile);
    assert.equal(processUpdated.config.showConsole, true);
    checks.push(
      'wide/narrow reachable actions, process modes and optional fields saved, dark theme',
    );
    await add('appdock.input.sendKeys');
    await dialog.getByLabel('名前', { exact: true }).fill('Saved keys');
    const capture = dialog.getByRole('button', { name: '送信キーを入力', exact: true });
    await capture.dispatchEvent('keydown', {
      key: 't',
      code: 'KeyT',
      ctrlKey: true,
      shiftKey: true,
    });
    assert.deepEqual(await capture.locator('kbd').allTextContents(), ['Ctrl', 'Shift', 'T']);
    assert.equal(
      await capture.locator('..').locator('..').locator('.settings-field-label > p').count(),
      0,
    );
    await save();
    assert.equal(
      (await definitions()).find((item) => item.title === 'Saved keys').config.keys,
      'Ctrl+Shift+T',
    );
    assert.equal(a.state.calls + b.state.calls, 0, 'editing never executes downstream tools');
    assert.deepEqual(diskDefinitions(), await definitions());
    assert.deepEqual(errors, []);
    checks.push(
      'send-key description removed, DOM-only recording and persistence; no downstream execution',
    );
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'error.txt'), error.stack);
    await page?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    release?.();
    if (host && child?.exitCode === null)
      await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child)
      await until(() => child.exitCode !== null, 'exit', 10000).catch(() => {
        child.kill();
        success = false;
      });
    await browser?.close().catch(() => {});
    for (const entry of fixtures) {
      await Promise.allSettled([...entry.sessions.values()].map((session) => session.sdk.close()));
      entry.server.closeAllConnections();
      await new Promise((resolve) => entry.server.close(resolve));
    }
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          success,
          checks,
          errors,
          portable,
          sha256: portable ? hash(portable) : null,
          childExitCode: child?.exitCode,
          completedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ success, checks: checks.length, profile }));
    if (!success) process.exitCode = 1;
  }
})();
