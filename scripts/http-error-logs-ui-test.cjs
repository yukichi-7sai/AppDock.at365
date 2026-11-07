const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { launch, until } = require('./page-test-host.cjs');
const { newImageAiConnection } = require('../out/main/shared/image-ai');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'http-error-logs-ui-' + Date.now());
const id = 'fixture.http-error-logs';
const error = {
  message: 'fixture failure ' + '長いJSON♡'.repeat(1800),
  future: { nested: [{ arbitrary: true }, null, ['kept', 42]] },
  tail: 'complete-error-tail',
};
const appletMessage = 'applet-log:' + '長いログ♡'.repeat(1800) + ':complete-applet-tail';
const stderrMessage = 'stderr-log:' + '長い標準エラー♡'.repeat(700) + ':complete-stderr-tail';
const checks = [];
let host,
  server,
  calls = 0;
const check = (text) => {
  checks.push(text);
  console.log('PASS ' + text);
};

(async () => {
  try {
    fs.mkdirSync(profile, { recursive: true });
    server = http.createServer(async (request, response) => {
      assert.equal(request.url, '/v1/images/generations');
      for await (const _part of request) {
        /* Drain the fixture request. */
      }
      calls++;
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error, outside: 'outside-error-not-logged' }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
    settings.globalShortcutCommands = [];
    settings.gestures.enabled = settings.touchpadGestures.enabled = false;
    settings.updates.checkHostOnStartup =
      settings.updates.checkAppletsOnStartup =
      settings.updates.checkHostOnAboutOpen =
        false;
    settings.operationPermissions = {
      applet: { read: true, write: true, execute: true, useImageAi: true },
      mcp: {},
    };
    settings.imageAi = {
      connections: [
        {
          ...newImageAiConnection('fixture'),
          name: 'Fixture',
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
          authentication: 'none',
          defaultModel: 'fixture-model',
        },
      ],
      defaultConnectionId: 'fixture',
    };
    settings.extensions[id] = { enabled: true, settings: {} };
    const directory = path.join(profile, 'extensions', id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id,
        name: 'HTTP error log fixture',
        version: '1.0.0',
        minimumHostVersion: '0.178.0',
        runtime: 'node',
        entry: 'index.cjs',
        capabilities: ['appdock-api'],
        commands: [{ id: id + '.run', title: 'Run error log fixture' }],
      }),
    );
    fs.writeFileSync(
      path.join(directory, 'index.cjs'),
      `exports.activate = async c => {
      c.commands.register('${id}.run', 'Run error log fixture', async () => {
        const job = await c.appdock.call('ai.image.generateAndRegister', {
          requestId: 'fixture-error-request', input: 'fixture-request-not-logged',
          destination: { folder: '' }
        });
        let state;
        do {
          state = await c.appdock.call('ai.image.jobs.get', { jobId: job.jobId });
          if (state.state !== 'failed') await new Promise(r => setTimeout(r, 25));
        } while (state.state !== 'failed');
        for (let i = 0; i < 3; i++) await c.appdock.call('ai.image.jobs.get', { jobId: job.jobId });
        await c.log.error(${JSON.stringify(appletMessage)});
        console.error(${JSON.stringify(stderrMessage)});
        await c.log.info('job-result:' + JSON.stringify(state.error));
      });
    };`,
    );
    require('./test-settings.cjs').write(profile, settings);
    host = await launch(profile, process.argv[2]);
    const page = host.main;
    await until(
      async () =>
        (await page.evaluate(() => window.dock.snapshot())).extensions.some(
          (extension) => extension.id === id && extension.state === 'running',
        ),
      'fixture running',
    );
    await page.evaluate((command) => window.dock.executeCommand(command), id + '.run');
    const logs = await until(async () => {
      const value = (await page.evaluate(() => window.dock.snapshot())).logs;
      return value.some((entry) => entry.message.includes('complete-stderr-tail')) && value;
    }, 'full stderr log');
    const diagnostic = logs.filter(
      (entry) => entry.source === 'image-ai' && entry.message.startsWith('HTTP 400'),
    );
    assert.equal(diagnostic.length, 1);
    assert.equal(diagnostic[0].message, `HTTP 400\nresponse.error=${JSON.stringify(error)}`);
    assert.equal(calls, 1);
    assert(!JSON.stringify(logs).includes('outside-error-not-logged'));
    assert(!JSON.stringify(logs).includes('fixture-request-not-logged'));
    const result = logs.find((entry) => entry.message.startsWith('job-result:'));
    assert(result.message.includes('IMAGE_AI_SERVER_ERROR'));
    assert(!result.message.includes('complete-error-tail'));
    check('image API response.error retains the full JSON once; public result stays safe');
    assert(logs.some((entry) => entry.source === id && entry.message === appletMessage));
    assert(logs.some((entry) => entry.source === id && entry.message === stderrMessage));
    const stored = fs
      .readFileSync(path.join(profile, 'data/logs', os.hostname(), 'host.log'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    for (const message of [diagnostic[0].message, appletMessage, stderrMessage])
      assert(stored.some((entry) => entry.message === message));
    check('HTTP, Applet and stderr messages over 4000 characters are stored in full');
    await page.evaluate(() => window.dock.executeCommand('appdock.logs.open'));
    const logsPage = page.locator('.logs-page');
    await logsPage.waitFor();
    const search = logsPage.locator('input[type=search]');
    const longSearch = JSON.stringify(error);
    await search.fill(longSearch);
    await until(
      async () =>
        (await logsPage.locator('.log-row p').allTextContents()).some(
          (text) => text === diagnostic[0].message,
        ),
      'full JSON search result',
    );
    assert.equal(await search.inputValue(), longSearch);
    assert.equal(await search.getAttribute('maxlength'), null);
    await page.screenshot({ path: path.join(profile, 'long-json-search.png') });
    check('log screen accepts searches over 4000 characters and displays the complete JSON');
    await search.fill('complete-applet-tail');
    await until(
      async () => (await logsPage.locator('.log-row p').allTextContents()).includes(appletMessage),
      'Applet tail search',
    );
    check('text beyond the former cutoff can be searched and displayed');
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          ok: true,
          checks,
          calls,
          executableHash: host.hash,
          errorCharacters: diagnostic[0].message.length,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ ok: true, profile, checks }, null, 2));
  } catch (error) {
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, checks, error: String(error.stack) }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    await host?.close();
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
})();
