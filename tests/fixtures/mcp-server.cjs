const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('node:fs');
function fixtureServer(state = { count: 0, changed: false }) {
  const server = new Server(
    { name: state.serverName ?? 'MCP fixture', version: '1.0' },
    { capabilities: { tools: { listChanged: true } } },
  );
  const input = {
    type: 'object',
    properties: {
      message: { type: 'string' },
      seconds: { type: 'integer', minimum: 0 },
      delay: { type: 'integer', minimum: 0, maximum: 10000 },
    },
    additionalProperties: false,
  };
  server.setRequestHandler(ListToolsRequestSchema, async ({ params }) => {
    await state.beforeList?.();
    const tools = [
      'echo',
      'fail',
      'delay',
      'image',
      'schedule_off',
      'change_catalog',
      'unsupported',
      'annotated',
      'invalid_output',
      'oversized',
      ...(state.changed ? ['added'] : []),
      ...(state.longTool ? [state.longTool] : []),
    ].map((name) => ({
      name,
      description: 'Fixture ' + name,
      ...(['annotated', 'invalid_output'].includes(name)
        ? {
            outputSchema: {
              type: 'object',
              properties: { result: { type: 'string' } },
              required: ['result'],
              'x-fastmcp-wrap-result': true,
            },
          }
        : {}),
      inputSchema:
        name === 'unsupported'
          ? { type: 'object', patternProperties: { '.*': { type: 'string' } } }
          : name === 'echo' && state.changed
            ? { ...input, required: ['message'] }
            : input,
    }));
    const offset = Number(params?.cursor ?? 0);
    return {
      tools: tools.slice(offset, offset + 3),
      ...(offset + 3 < tools.length ? { nextCursor: String(offset + 3) } : {}),
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
    state.count++;
    if (params.name === 'annotated' || params.name === 'invalid_output')
      return {
        content: [{ type: 'text', text: 'wrapped' }],
        structuredContent: { result: params.name === 'annotated' ? 'wrapped' : 42 },
      };
    if (params.name === 'oversized')
      return { content: [{ type: 'text', text: 'x'.repeat(1100000) }] };
    if (params.name === 'change_catalog') {
      state.changed = true;
      void server.notification({ method: 'notifications/tools/list_changed' }).catch(() => {});
    }
    if (params.name === 'delay') {
      if (process.env.MCP_FIXTURE_STARTED_FILE)
        fs.writeFileSync(process.env.MCP_FIXTURE_STARTED_FILE, 'started');
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, params.arguments?.delay ?? 2000);
        extra.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            if (process.env.MCP_FIXTURE_CANCEL_FILE)
              fs.writeFileSync(process.env.MCP_FIXTURE_CANCEL_FILE, 'cancelled');
            reject(Error('cancelled'));
          },
          { once: true },
        );
      });
    }
    if (params.name === 'image')
      return {
        content: [
          {
            type: 'image',
            mimeType: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2i0AAAAASUVORK5CYII=',
          },
        ],
        structuredContent: { count: state.count },
      };
    const result = {
      count: state.count,
      ...(params.name === 'schedule_off' ? { scheduledSeconds: params.arguments?.seconds } : {}),
      message: params.arguments?.message ?? '',
      environment: !!process.env.MCP_FIXTURE_SECRET,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
      ...(params.name === 'fail' ? { isError: true } : {}),
    };
  });
  return server;
}
module.exports = { fixtureServer };
if (require.main === module) void fixtureServer().connect(new StdioServerTransport());
