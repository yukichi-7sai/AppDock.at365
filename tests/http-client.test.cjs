const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  httpFetch,
  logHttpJsonError,
  logHttpErrorBody,
  setHttpErrorLog,
} = require('../out/main/main/core/http-client');
const { HostLog } = require('../out/main/main/core/log');

function capture(t) {
  const entries = [];
  setHttpErrorLog((source, message) => entries.push({ source, message }));
  t.after(() => setHttpErrorLog(undefined));
  return entries;
}

test('HTTP failure retains the complete unknown error JSON, original response and one request', async (t) => {
  const entries = capture(t);
  const error = {
    message: '失敗\n"quoted"\\path ' + '長い本文♡'.repeat(2000),
    futureField: { list: [null, false, 0, { unknown: 'unchanged' }] },
    futureCode: 'new-provider-code',
  };
  const payload = { error, unrelated: 'response-outside-error' };
  for (const status of [400, 401, 403, 429, 500]) {
    const response = Response.json(payload, { status, headers: { 'X-Fixture': 'retained' } });
    let calls = 0;
    const request = new Request('https://example.test/api?key=url-secret', {
      method: 'POST',
      headers: { Authorization: 'Bearer header-secret' },
      body: 'request-body-secret',
    });
    const result = await httpFetch(
      'future-provider',
      async (input) => {
        calls++;
        assert.equal(input, request);
        return response;
      },
      request,
    );
    assert.equal(calls, 1);
    assert.equal(result, response);
    assert.equal(result.bodyUsed, false);
    assert.equal(result.headers.get('x-fixture'), 'retained');
    assert.deepEqual(await result.json(), payload);
    assert.equal(entries.at(-1).message, `HTTP ${status}\nresponse.error=${JSON.stringify(error)}`);
  }
  assert.equal(entries.length, 5);
  const logged = JSON.stringify(entries);
  for (const value of [
    'header-secret',
    'url-secret',
    'request-body-secret',
    'response-outside-error',
  ])
    assert(!logged.includes(value));
});

test('error values retain arrays and scalar JSON without provider-specific field parsing', async (t) => {
  const entries = capture(t);
  for (const error of [[{ anything: ['a', 4] }], 'plain error', 123, false, {}]) {
    await httpFetch(
      'provider',
      async () => new Response(JSON.stringify({ error }), { status: 422 }),
    );
    assert.equal(entries.at(-1).message, `HTTP 422\nresponse.error=${JSON.stringify(error)}`);
  }
  assert.equal(entries.length, 5);
});

test('missing, null, non-JSON and unreadable failure bodies retain only the status', async (t) => {
  const entries = capture(t);
  for (const body of ['<html>private proxy body</html>', '{broken', '{}', '{"error":null}', '']) {
    const response = new Response(body, { status: 502 });
    await httpFetch('provider', async () => response);
    assert.equal(await response.text(), body);
  }
  const broken = new Response(
    new ReadableStream({
      start(controller) {
        controller.error(Error('private stream error'));
      },
    }),
    { status: 503 },
  );
  assert.equal(await httpFetch('provider', async () => broken), broken);
  assert.deepEqual(
    entries.map((e) => e.message),
    [...Array(5).fill('HTTP 502'), 'HTTP 503'],
  );
});

test('successful binary/streaming responses and redirects are not consumed or duplicated', async (t) => {
  const entries = capture(t);
  const bytes = Buffer.from([0, 255, 1, 2]);
  const response = new Response(bytes, { headers: { 'content-type': 'image/png' } });
  assert.equal(await httpFetch('image-ai', async () => response), response);
  assert.equal(response.bodyUsed, false);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  await httpFetch('avatar', async () => new Response(null, { status: 302 }));
  assert.deepEqual(entries, []);
});

test('transport cancellation and logging failure never change outcomes or retry requests', async (t) => {
  capture(t);
  const aborted = new DOMException('fixture canceled', 'AbortError');
  let calls = 0;
  await assert.rejects(
    httpFetch('provider', async () => {
      calls++;
      throw aborted;
    }),
    (e) => e === aborted,
  );
  assert.equal(calls, 1);
  setHttpErrorLog(() => {
    throw Error('log unavailable');
  });
  const response = Response.json({ error: { any: 'error' } }, { status: 400 });
  assert.equal(await httpFetch('provider', async () => response), response);
  assert.deepEqual(await response.json(), { error: { any: 'error' } });
});

test('JSON error envelopes returned with HTTP success use the same complete diagnostic', (t) => {
  const entries = capture(t);
  const error = { future: { nested: ['everything'] }, message: 'HTTP 200 failure' };
  logHttpJsonError('future-provider', 200, { error, ignored: 'not logged' });
  logHttpErrorBody('webhook', 202, JSON.stringify({ error }));
  for (const value of [null, [], {}, { error: null }])
    assert.equal(logHttpJsonError('provider', 200, value), false);
  assert.deepEqual(
    entries,
    ['future-provider', 'webhook'].map((source) => ({
      source,
      message: `HTTP ${source === 'webhook' ? 202 : 200}\nresponse.error=${JSON.stringify(error)}`,
    })),
  );
});

test('MCP JSON and SSE errors with HTTP 200 preserve complete streams and diagnostics', async (t) => {
  const entries = capture(t);
  const { McpClientService } = require('../out/main/main/core/mcp-client');
  const error = { code: -32603, data: { detail: '未知♡'.repeat(2000) } };
  for (const sse of [false, true]) {
    const text = sse
      ? `: keepalive\r\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, error })}\r\n\r\n`
      : JSON.stringify({ error });
    const bytes = Buffer.from(text);
    const transport = McpClientService.prototype.fetcher.call(
      {
        options: {
          fetcher: async () =>
            new Response(
              new ReadableStream({
                start(controller) {
                  for (let i = 0; i < bytes.length; i += 71)
                    controller.enqueue(bytes.subarray(i, i + 71));
                  controller.close();
                },
              }),
              { headers: { 'content-type': sse ? 'text/event-stream' : 'application/json' } },
            ),
        },
      },
      'https://example.test/mcp',
    );
    const response = await transport('https://example.test/mcp');
    assert.equal(await response.text(), text);
    assert.equal(entries.at(-1).message, `HTTP 200\nresponse.error=${JSON.stringify(error)}`);
  }
  assert.equal(entries.length, 2);
  const large = McpClientService.prototype.fetcher.call(
    {
      options: {
        fetcher: async () =>
          new Response(JSON.stringify({ error: { detail: 'x'.repeat(2 * 1024 * 1024) } }), {
            headers: { 'content-type': 'application/json' },
          }),
      },
    },
    'https://example.test/mcp',
  );
  const complete = await (await large('https://example.test/mcp')).json();
  assert.equal(complete.error.detail.length, 2 * 1024 * 1024);
  assert.equal(entries.length, 3);
});

test('HTTP-success AI and image error envelopes and injected webhook transports retain their JSON', async (t) => {
  const entries = capture(t);
  const { AiOpenAiChat } = require('../out/main/main/core/ai-openai-chat');
  const { OpenAiImageAdapter } = require('../out/main/main/core/image-ai-adapter');
  const { McpEvents } = require('../out/main/main/core/mcp-events');
  const { newAiConnection } = require('../out/main/shared/ai');
  const { newImageAiConnection } = require('../out/main/shared/image-ai');
  const error = { unknown: { complete: ['preserved', true] } };
  const reply = async () => Response.json({ error });
  const signal = new AbortController().signal;
  await assert.rejects(
    new AiOpenAiChat(reply).generate(newAiConnection('one'), undefined, '{}', signal),
    { code: 'AI_INVALID_RESPONSE' },
  );
  await assert.rejects(
    new OpenAiImageAdapter(reply).generate(
      newImageAiConnection('one'),
      undefined,
      {
        model: 'fixture',
        prompt: 'fixture',
        options: { count: 1, format: 'png', providerOptions: {} },
      },
      signal,
    ),
    { code: 'IMAGE_AI_INVALID_RESPONSE' },
  );
  const response = { status: 400, body: JSON.stringify({ error }) };
  const sent = await McpEvents.prototype.send.call(
    {
      options: { post: async () => response },
      now: () => Date.now(),
      controller: new AbortController(),
    },
    {
      url: 'https://example.test/webhook',
      secret: 'whsec_' + Buffer.alloc(32, 1).toString('base64'),
      id: 'fixture',
    },
    'fixture-event',
    '{}',
  );
  assert.equal(sent, response);
  assert.deepEqual(
    entries.map((entry) => entry.source),
    ['ai', 'image-ai', 'mcp-events'],
  );
  assert(
    entries.every((entry) => entry.message.endsWith('response.error=' + JSON.stringify(error))),
  );
});

test('host and Applet log messages above 4000 characters survive storage and page search', async (t) => {
  const { createHostApi } = require('../out/main/main/core/host-api');
  const { LogPageSession } = require('../out/main/main/core/log-page');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-full-log-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const log = new HostLog(directory, () => {});
  const message = JSON.stringify({
    error: { detail: '本文♡'.repeat(5000), tail: 'retained-tail' },
  });
  log.write('error', 'host', message);
  const api = createHostApi({}, directory, log.write, () => {});
  await api(
    { manifest: { id: 'fixture.long-log', capabilities: [] }, state: 'running' },
    'host.log',
    { level: 'error', message },
  );
  const saved = fs
    .readFileSync(path.join(directory, 'host.log'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.deepEqual(
    saved.map((entry) => entry.message),
    [message, message],
  );
  const session = new LogPageSession(
    { id: 's', route: 'logs', kind: 'logs', scope: { type: 'all' }, source: '' },
    {
      entries: () => log.entries,
      sources: () => [],
      dark: () => false,
      changed: () => {},
      sourceChanged: () => {},
      openDirectory: async () => {},
    },
  );
  await session.act({
    id: 's',
    type: 'filters',
    filters: { source: '', level: 'all', category: 'all', text: message },
  });
  assert.equal(session.snapshot().content.entries.length, 2);
  assert.equal(session.snapshot().content.entries[0].message, message);
});

test('AI, image generation, TTS, update, avatar and MCP transports use common HTTP diagnostics', async (t) => {
  const entries = capture(t);
  const { AiOpenAiChat } = require('../out/main/main/core/ai-openai-chat');
  const { OpenAiImageAdapter } = require('../out/main/main/core/image-ai-adapter');
  const { TtsService } = require('../out/main/main/core/tts-service');
  const { checkUpdate } = require('../out/main/main/core/updates');
  const { readUpdateJson } = require('../out/main/main/core/portable-updates');
  const { fetchWebAvatar } = require('../out/main/main/core/web-account-avatar');
  const { McpClientService } = require('../out/main/main/core/mcp-client');
  const { newImageAiConnection } = require('../out/main/shared/image-ai');
  const { newAiConnection } = require('../out/main/shared/ai');
  const error = { vendorUnknown: { details: ['whole error'], suffix: 'preserved' } };
  const reply = async () => Response.json({ error }, { status: 400 });
  const signal = new AbortController().signal;
  const ai = new AiOpenAiChat(reply);
  await assert.rejects(ai.generate(newAiConnection('one'), undefined, '{}', signal), {
    code: 'AI_SERVER_ERROR',
  });
  const image = new OpenAiImageAdapter(reply);
  await assert.rejects(
    image.generate(
      newImageAiConnection('one'),
      undefined,
      {
        model: 'fixture',
        prompt: 'fixture',
        options: { count: 1, format: 'png', providerOptions: {} },
      },
      signal,
    ),
    { code: 'IMAGE_AI_SERVER_ERROR' },
  );
  const tts = new TtsService({
    settings: () => ({ connections: [] }),
    key: () => undefined,
    canUse: () => true,
    fetcher: reply,
  });
  t.after(() => tts.close());
  await assert.rejects(tts.download('http://localhost/audio', { signal }, 1024, false), {
    code: 'TTS_SERVER_ERROR',
  });
  await assert.rejects(checkUpdate('0.1.0', 'fixture/repository', reply));
  await assert.rejects(readUpdateJson('https://example.test/update.json', reply, signal));
  await assert.rejects(
    fetchWebAvatar('https://example.test/avatar', ['https://example.test'], reply, signal),
  );
  const transport = McpClientService.prototype.fetcher.call(
    { options: { fetcher: reply } },
    'https://example.test/mcp',
  );
  const response = await transport('https://example.test/mcp', { signal });
  await response.body.cancel();
  assert.deepEqual(
    entries.map((entry) => entry.source),
    ['ai', 'image-ai', 'tts', 'updates', 'updates', 'web-site-accounts', 'mcp-client'],
  );
  assert(
    entries.every((entry) => entry.message === `HTTP 400\nresponse.error=${JSON.stringify(error)}`),
  );
});
