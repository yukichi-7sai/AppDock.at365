import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { hostText, type HostTextKey } from '../../shared/i18n';
import { jsonObject, type JsonObject } from '../../shared/custom-commands';
import {
  mcpToolCommandId,
  parseMcpToolCommand,
  type McpToolCommand,
} from '../../shared/mcp-device-settings';
import type { UiCommand } from '../../shared/commands';
import { enterCommand, type InputInvocation } from './command-contexts';
import type { AutomationCommand } from './automation-commands';
import { AutomationError } from './appdock-api';
import { mcpEndpointIdentity, type McpClientSettings } from './mcp-client-settings';
import type { McpActor, McpClientService } from './mcp-client';

const fail = (code: string, key: HostTextKey): never => {
  throw new AutomationError(code, hostText(key));
};
/** Saved MCP commands have their own device-owned definitions, independent of custom providers. */
export class McpToolCommandService {
  private catalog?: { signature: string; items: McpToolCommand[]; commands: readonly UiCommand[] };
  private indexedItems?: McpToolCommand[];
  private byId = new Map<string, McpToolCommand>();
  constructor(
    private options: {
      settings: McpClientSettings;
      client: McpClientService;
      actor(context: InputInvocation): McpActor;
    },
  ) {}
  items() {
    return this.options.settings.block().commands;
  }
  private find(id: string) {
    const items = this.items();
    if (items !== this.indexedItems) {
      this.indexedItems = items;
      this.byId = new Map(items.map((item) => [mcpToolCommandId(item.id), item]));
    }
    return this.byId.get(id);
  }
  has(id: string) {
    return !!this.find(id);
  }
  private reason(item: McpToolCommand, context?: InputInvocation): string | null {
    if (!item.enabled) return hostText('settings.customCommandState.disabled');
    const settings = this.options.settings,
      connection = settings.connection(item.serverId);
    if (!connection) return hostText('services.mcpClient.unregisteredConnection');
    if (!connection.enabled) return hostText('services.mcpClient.connectionDisabled');
    const credentials = settings.credentialReason(item.serverId);
    if (credentials) return credentials;
    if (
      !item.toolBinding ||
      item.toolBinding.version !== 1 ||
      item.toolBinding.endpointFingerprint !== mcpEndpointIdentity(connection)
    )
      return hostText('settings.mcpCommands.reviewRequired');
    try {
      if (context)
        this.options.client.checkCommandAccess(
          this.options.actor(context),
          item.serverId,
          item.toolName,
        );
      const connectionError = this.options.client.connectionError(item.serverId);
      if (connectionError) return connectionError;
      const tool = this.options.client.cachedTool(item.serverId, item.toolName);
      if (tool === null) return hostText('services.mcpClient.toolMissing');
      if (tool && !isDeepStrictEqual(tool.toolBinding, item.toolBinding))
        return hostText('settings.mcpCommands.reviewRequired');
      if (tool)
        return this.options.client.commandValidation({
          ...item,
          toolRevision: tool.toolRevision,
        } as unknown as JsonObject);
    } catch (error) {
      return error instanceof AutomationError
        ? error.message
        : hostText('services.mcpClient.invalidCredentials');
    }
    return null;
  }
  isAvailable(id: string) {
    const item = this.find(id);
    return !!item && this.reason(item) === null;
  }
  summaries() {
    return this.items().map((item) => {
      const reason = this.reason(item);
      return {
        id: item.id,
        commandId: mcpToolCommandId(item.id),
        available: !reason,
        unavailableReason: reason,
      };
    });
  }
  uiCommands(): readonly UiCommand[] {
    const items = this.items(),
      signature = JSON.stringify([
        hostText('settings.mcpCommands.title'),
        this.options.client.commandStateVersion(),
      ]);
    if (this.catalog?.items === items && this.catalog.signature === signature)
      return this.catalog.commands;
    const commands = items.map((item) => {
      const reason = this.reason(item);
      return {
        id: mcpToolCommandId(item.id),
        mcpToolCommandId: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        extension: 'AppDock',
        extensionId: null,
        available: reason === null,
        disabledReason: reason ?? undefined,
      };
    });
    this.catalog = { items, signature, commands };
    return commands;
  }
  currentToolRevision(item: McpToolCommand) {
    try {
      const tool = this.options.client.cachedTool(item.serverId, item.toolName);
      return tool && isDeepStrictEqual(tool.toolBinding, item.toolBinding) ? tool.toolRevision : '';
    } catch {
      return '';
    }
  }
  publicCommands(context: InputInvocation = {}): AutomationCommand[] {
    return this.items()
      .filter((item) => item.automation)
      .map((item) => ({
        id: mcpToolCommandId(item.id),
        title: item.title,
        description: item.description,
        category: item.category,
        appletId: null,
        available: this.reason(item, context) === null,
        unavailableReason: this.reason(item, context),
        completion: 'accepted',
      }));
  }
  /** JSON may edit definitions, but cannot manufacture or replace an approval binding. */
  replacement(items: McpToolCommand[], serverIds: string[], expected: string) {
    const previous = new Map(this.items().map((item) => [item.id, item]));
    const rows = items.map((item) => {
      const old = previous.get(item.id);
      if (!isDeepStrictEqual(item.toolBinding, old?.toolBinding ?? null))
        return fail('INVALID_ARGUMENT', 'settings.mcpJson.bindingReadonly');
      const { toolBinding: _binding, ...row } = item;
      const executionChanged =
        !old ||
        ['serverId', 'toolName', 'arguments', 'timeoutMs'].some(
          (key) => !isDeepStrictEqual((item as any)[key], (old as any)[key]),
        );
      const approval =
        (executionChanged && (item.enabled || item.automation)) ||
        (!old?.enabled && item.enabled) ||
        (!old?.automation && item.automation);
      const toolRevision = approval ? this.currentToolRevision(item) : '';
      return { ...row, ...(toolRevision ? { toolRevision } : {}) };
    });
    return this.plan(rows, expected, new Set(serverIds)).items;
  }
  plan(rows: unknown[], expected: string, serverIds?: Set<string>) {
    this.options.settings.assertRevision(expected);
    const previous = this.items();
    const next = rows.map((raw) => {
      if (
        !jsonObject(raw) ||
        Object.keys(raw).some(
          (key) =>
            ![
              'id',
              'title',
              'description',
              'category',
              'enabled',
              'automation',
              'serverId',
              'toolName',
              'arguments',
              'timeoutMs',
              'toolRevision',
            ].includes(key),
        )
      )
        return fail('INVALID_ARGUMENT', 'settings.mcp-client-settings.invalidUpdate');
      const old = previous.find((item) => item.id === raw.id);
      if (
        !(serverIds
          ? serverIds.has(String(raw.serverId))
          : this.options.settings.server(String(raw.serverId))) &&
        (!old || old.serverId !== raw.serverId)
      )
        return fail('NOT_FOUND', 'services.mcpClient.unregisteredConnection');
      const executionChanged =
        !old ||
        ['serverId', 'toolName', 'arguments', 'timeoutMs'].some(
          (key) => !isDeepStrictEqual(raw[key], (old as any)[key]),
        );
      const needsApproval =
        (executionChanged && (!!raw.enabled || !!raw.automation)) ||
        (!old?.enabled && raw.enabled) ||
        (!old?.automation && raw.automation);
      let toolBinding = old?.toolBinding ?? null;
      if (raw.toolRevision !== undefined && raw.toolRevision !== '') {
        const reason = this.options.client.commandValidation(raw);
        if (reason) throw new AutomationError('SCHEMA_CHANGED', reason);
        toolBinding = this.options.client.cachedTool(
          String(raw.serverId),
          String(raw.toolName),
        )!.toolBinding;
      } else if (needsApproval)
        return fail('SCHEMA_CHANGED', 'settings.mcpCommands.reviewRequired');
      else if (executionChanged) toolBinding = null;
      const { toolRevision: _revision, ...fields } = raw;
      return parseMcpToolCommand({ ...fields, toolBinding });
    });
    if (new Set(next.map((item) => item.id)).size !== next.length)
      return fail('INVALID_ARGUMENT', 'settings.mcp-client-settings.invalidUpdate');
    return {
      items: next,
      changed: !isDeepStrictEqual(next, previous),
      commit: () => this.options.settings.saveCommands(next, expected),
    };
  }
  update(request: unknown) {
    if (
      !jsonObject(request) ||
      typeof request.expectedRevision !== 'string' ||
      Object.keys(request).some(
        (key) => !['op', 'item', 'id', 'ids', 'expectedRevision', 'dryRun'].includes(key),
      )
    )
      return fail('INVALID_ARGUMENT', 'settings.mcp-client-settings.invalidUpdate');
    let rows: Record<string, unknown>[] = this.items().map(
      ({ toolBinding: _binding, ...item }) => ({ ...item }),
    );
    if (request.op === 'save' && jsonObject(request.item)) {
      const index = rows.findIndex((item) => item.id === (request.item as JsonObject).id);
      if (index < 0) rows.push(request.item);
      else rows[index] = request.item;
    } else if (request.op === 'remove' && rows.some((row) => row.id === request.id))
      rows = rows.filter((row) => row.id !== request.id);
    else if (
      request.op === 'reorder' &&
      Array.isArray(request.ids) &&
      request.ids.length === rows.length &&
      new Set(request.ids).size === rows.length &&
      request.ids.every((id) => rows.some((row) => row.id === id))
    )
      rows = request.ids.map((id) => rows.find((row) => row.id === id)!);
    else return fail('INVALID_ARGUMENT', 'settings.mcp-client-settings.invalidUpdate');
    const plan = this.plan(rows, request.expectedRevision);
    if (!request.dryRun) plan.commit();
    return { saved: !request.dryRun, revision: this.options.settings.revision() };
  }
  async execute(id: string, context: InputInvocation = {}) {
    const item = this.find(id);
    if (!item) return fail('NOT_FOUND', 'services.customCommands.missing');
    const invocation = enterCommand(id, context),
      actor = this.options.actor(invocation);
    if (
      (context.apiCaller || context.origin?.kind === 'mcp' || context.origin?.kind === 'applet') &&
      !item.automation
    )
      return fail('NOT_FOUND', 'services.customCommands.executionForbidden');
    const reason = this.reason(item, context);
    if (reason) throw new AutomationError('COMMAND_UNAVAILABLE', reason);
    const { tool } = await this.options.client.tool(actor, {
      serverId: item.serverId,
      name: item.toolName,
      refresh: true,
    });
    if (this.find(id) !== item)
      return fail('REVISION_CONFLICT', 'settings.mcp-client-settings.changed');
    if (!isDeepStrictEqual(tool.toolBinding, item.toolBinding))
      return fail('SCHEMA_CHANGED', 'settings.mcpCommands.reviewRequired');
    const job = await this.options.client.start(
      actor,
      {
        serverId: item.serverId,
        name: item.toolName,
        arguments: item.arguments,
        toolRevision: tool.toolRevision,
        timeoutMs: item.timeoutMs,
        requestId: randomUUID(),
      },
      invocation.signal,
      true,
      () => this.find(id) === item,
    );
    return { completion: 'accepted', effectVerified: false, jobId: job.jobId, state: job.state };
  }
}
