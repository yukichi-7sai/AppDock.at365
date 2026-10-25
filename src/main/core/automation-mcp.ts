import { hostText } from '../../shared/i18n';
import { operationsFor } from '../../shared/appdock-api';
import http, { type IncomingMessage } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { AutomationApi, AutomationError } from './automation-api';
import type { ConnectionScope } from '../../shared/automation';
import { isLocalClient, validMcpHeaders } from './automation-network';
import type { McpEvents } from './mcp-events';
import { modernRequest, modernResponse } from './mcp-modern';

const entries = operationsFor('mcp');
const definitions = entries.map(([, { callers, permissions, ...tool }]) => tool);
const methods = entries.map(([method]) => method);
const names: string[] = definitions.map((d) => d.name);
function tools() {
  return definitions.map((d) => structuredClone(d));
}
function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0,
      failed = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65536) {
        if (!failed) reject(Error('TOO_LARGE'));
        failed = true;
        chunks.length = 0;
      } else if (!failed) chunks.push(chunk);
    });
    req.on('end', () => {
      if (!failed) {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(Error('INVALID_JSON'));
        }
      }
    });
    req.on('error', reject);
    req.on('aborted', () => reject(Error('ABORTED')));
  });
}
export class AutomationMcp {
  private server?: http.Server;
  private requests = new Set<Server>();
  private accepting = false;
  private epoch = 0;
  private probe?: { id: string; seen: boolean };
  port = 0;
  constructor(
    private api: AutomationApi,
    private token: () => string,
    private connected: (local: boolean) => void,
    private version: string,
    private audit: (level: string, message: string) => void = () => {},
    private events?: McpEvents,
  ) {}
  activate() {
    if (this.server?.listening) this.accepting = true;
  }
  async verifyLoopback() {
    const probe = { id: randomUUID(), seen: false };
    this.probe = probe;
    try {
      await new Promise<void>((resolve, reject) => {
        const request = http.request(
          {
            hostname: '127.0.0.1',
            port: this.port,
            path: '/mcp',
            method: 'POST',
            agent: false,
            signal: AbortSignal.timeout(1500),
            headers: {
              Authorization: `Bearer ${this.token()}`,
              'x-appdock-startup-probe': probe.id,
            },
          },
          (response) => {
            response.resume();
            response.on('end', () =>
              response.statusCode === 204 && probe.seen
                ? resolve()
                : reject(Error('LOOPBACK_MISMATCH')),
            );
            response.on('error', reject);
          },
        );
        request.on('error', reject);
        request.setTimeout(1500, () => request.destroy(Error('LOOPBACK_TIMEOUT')));
        request.end();
      });
    } finally {
      this.probe = undefined;
    }
  }
  async start(
    port: number,
    scope: ConnectionScope = 'local',
    hostnames: () => string[] = () => [],
    deferred = false,
  ) {
    const epoch = ++this.epoch;
    const current = () => this.accepting && this.epoch === epoch;
    const server = http.createServer(async (req, res) => {
      const fail = (status: number) => {
        if (res.destroyed || res.writableEnded) return;
        if (!res.headersSent)
          res.writeHead(status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        res.end(http.STATUS_CODES[status]);
      };
      const probe = this.probe;
      const probing =
        !this.accepting &&
        this.epoch === epoch &&
        probe &&
        req.headers['x-appdock-startup-probe'] === probe.id &&
        isLocalClient(req.socket.remoteAddress) &&
        req.method === 'POST';
      if (!current() && !probing) return fail(503);
      if (req.url !== '/mcp') return fail(404);
      const validHeaders = () => validMcpHeaders(req, this.port, scope, hostnames());
      if (!validHeaders()) return fail(403);
      const authorization = Buffer.from(req.headers.authorization ?? '');
      const expected = Buffer.from(`Bearer ${this.token()}`);
      if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected))
        return fail(401);
      if (probing) {
        probe.seen = true;
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return fail(405);
      }
      if (!req.headers['content-type']?.startsWith('application/json')) return fail(415);
      if (this.requests.size >= 8) return fail(429);
      const sdk = new Server(
        { name: 'AppDock', version: this.version },
        {
          capabilities: { tools: {} },
          instructions:
            'Read settings and their revision before changing them. List public commands before executing an exact id. Setting edits require read and write independently of execute. Applet enable/disable requires write; restart requires execute; enable/disable persist the enabled setting, restart never enables a disabled Applet. Read shortcuts.get before editing shortcuts with appdock.shortcuts.update; read and write permissions are required. Use only assignableCommands for new assignments. Keep unrelated bindings; use stable binding IDs, expectedRevision and dryRun. A shared key selects matching commands in saved order using options.executionMode (first or all, default all). Configure public behavior options according to the current command inputSchema. Browser options are shared across keyboard, mouse and touchpad and use the same read/write settings permission. Conditions include desktop, browser and exe (when.processes), with excludeDesktop for global/exe; a condition mismatch passes the original key. OS registration is asynchronous and must be checked separately. Read ribbon.get before editing with appdock.ribbon.update; read and write permissions are required. Ribbon IDs are not command IDs; disabled Applet pages retain layout without activation. Reorder includes every item in the chosen placement, including hidden and disabled pages. Reset clears retained missing-page layout too. Use commands.execute with args following the listed inputSchema. A settingsSaved response confirms persistence, not completion of Applet settingsChanged. lifecycleApplied reports the current enabled/state; waiting means startup is scheduled. A command response is not proof of its external effect. Do not retry commands after errors or lost responses without checking their effect. Never overwrite settings.json directly. Account data is not exposed.',
        },
      );
      this.requests.add(sdk);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      let disposed = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        this.requests.delete(sdk);
        void sdk.close().catch(() => {});
      };
      res.on('close', dispose);
      sdk.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools() }));
      const callTool = async (request: {
        params: { name: string; arguments?: Record<string, unknown> };
      }) => {
        const index = names.indexOf(request.params.name);
        const method = index < 0 ? 'unknown' : methods[index];
        const requestId = randomUUID();
        const started = Date.now();
        const target = this.api.auditTarget(method, request.params.arguments ?? {});
        const context = `[MCP] API=${method} requestId=${requestId}${target ? ` target=${target}` : ''}`;
        if (method === 'commands.execute') this.audit('info', `${context} result=started`);
        try {
          if (!current() || !validHeaders())
            throw new AutomationError(
              'NOT_READY',
              hostText('services.automationMcp.settingsChanged'),
            );
          const latestToken = Buffer.from(`Bearer ${this.token()}`);
          if (
            authorization.length !== latestToken.length ||
            !timingSafeEqual(authorization, latestToken)
          )
            throw new AutomationError(
              'NOT_READY',
              hostText('services.automationMcp.credentialsChanged'),
            );
          if (index < 0)
            throw new AutomationError(
              'NOT_FOUND',
              hostText('services.automationMcp.unsupportedTool'),
            );
          const value = await this.api.call(methods[index], request.params.arguments ?? {});
          this.audit(
            'info',
            `${context} result=success${method === 'commands.execute' ? ` completion=${value.completion}` : ''} durationMs=${Date.now() - started}`,
          );
          if (method === 'mcp.jobs.get' && value.result) {
            const result = CallToolResultSchema.parse(value.result);
            const { content, ...metadata } = result;
            return {
              content,
              structuredContent: { ...value, result: metadata },
              ...(result.isError === undefined ? {} : { isError: result.isError }),
            };
          }
          return {
            ...(method === 'mcp.jobs.get' &&
            ['failed', 'outcome-unknown'].includes(String(value.state))
              ? { isError: true }
              : {}),
            content: [{ type: 'text', text: JSON.stringify(value) }],
            structuredContent: value,
          };
        } catch (error) {
          const value = {
            code: error instanceof AutomationError ? error.code : 'INTERNAL_ERROR',
            message:
              error instanceof AutomationError
                ? error.message
                : hostText('services.automationMcp.failed'),
          };
          this.audit(
            'warn',
            `${context} result=failed code=${value.code} durationMs=${Date.now() - started}`,
          );
          return {
            isError: true,
            content: [{ type: 'text', text: JSON.stringify(value) }],
            structuredContent: value,
          };
        }
      };
      sdk.setRequestHandler(CallToolRequestSchema, callTool);
      try {
        const data = await body(req);
        if (!current() || !validHeaders()) {
          fail(403);
          dispose();
          return;
        }
        const currentToken = Buffer.from(`Bearer ${this.token()}`);
        if (
          authorization.length !== currentToken.length ||
          !timingSafeEqual(authorization, currentToken)
        ) {
          fail(401);
          dispose();
          return;
        }
        if (modernRequest(data, req)) {
          const reply = await modernResponse(data, req, {
            version: this.version,
            events: this.events,
            tools,
            callTool,
          });
          if (!res.destroyed && !res.writableEnded) {
            res.writeHead(reply.status, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            });
            res.end(JSON.stringify(reply.body));
            if (
              reply.status === 200 &&
              'result' in reply.body &&
              current() &&
              !req.headers['x-appdock-self-test']
            )
              this.connected(isLocalClient(req.socket.remoteAddress));
          }
          dispose();
          return;
        }
        await sdk.connect(transport);
        res.setHeader('Cache-Control', 'no-store');
        await transport.handleRequest(req, res, data);
        if (
          current() &&
          sdk.getClientVersion() &&
          data &&
          typeof data === 'object' &&
          'method' in data &&
          data.method === 'initialize' &&
          !req.headers['x-appdock-self-test']
        )
          this.connected(isLocalClient(req.socket.remoteAddress));
      } catch (error) {
        fail((error as Error).message === 'TOO_LARGE' ? 413 : 400);
        dispose();
      }
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    server.setTimeout(60000, (socket) => socket.destroy());
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, scope === 'network' ? '0.0.0.0' : '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    this.port = (server.address() as { port: number }).port;
    if (!deferred) this.activate();
  }
  async close() {
    this.accepting = false;
    this.probe = undefined;
    this.epoch++;
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    server.closeAllConnections();
    await Promise.allSettled([...this.requests].map((s) => s.close()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    this.requests.clear();
    this.port = 0;
  }
}
