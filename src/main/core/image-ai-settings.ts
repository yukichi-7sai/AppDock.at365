import { hostText } from '../../shared/i18n';
import {
  parseImageAiSettings,
  type ImageAiConnection,
  type ImageAiSettings,
} from '../../shared/image-ai';
import { SettingsTargetError } from './settings-target-types';
import type { AiSecrets } from './ai-secrets';
import type { SettingsStore } from './settings';

/** Local credential transactions and public non-secret validation. */
export class ImageAiSettingsController {
  constructor(
    private settings: SettingsStore,
    private secrets: AiSecrets,
    private changed: (id?: string) => void,
  ) {}
  private connection(value: unknown) {
    const c = parseImageAiSettings({ connections: [value] }).connections[0];
    if (!c.name.trim() || !c.baseUrl) throw Error(hostText('settings.ai-settings.nameAndUrl'));
    return { ...c, name: c.name.trim() };
  }
  private current() {
    // Observe disk changes before comparing the dialog's original values.
    this.settings.assertRevision(this.settings.revision);
    return parseImageAiSettings(this.settings.value.imageAi);
  }
  private assertOriginal(c: ImageAiConnection, original: unknown, keyRevision: unknown) {
    const found = this.settings.value.imageAi?.connections.find((v) => v.id === c.id);
    if (
      JSON.stringify(found ?? null) !== JSON.stringify(original) ||
      (found && keyRevision !== this.secrets.revision(c.id))
    )
      throw Error(hostText('settings.ai-settings.conflict'));
  }
  private key(c: ImageAiConnection, key: unknown) {
    if (
      key !== undefined &&
      key !== null &&
      (typeof key !== 'string' || /[\x00-\x1f\x7f]/.test(key))
    )
      throw Error(hostText('settings.ai-settings.invalidKey'));
    if (c.authentication === 'none') return undefined;
    const resolved = key == null ? this.secrets.key(c) : (key as string);
    if (!resolved) throw Error(hostText('settings.ai-settings.keyRequired'));
    return resolved;
  }
  configurationState(id: string) {
    return this.secrets.configurationState(id);
  }
  preparePublicConnection(value: ImageAiConnection, normalizeName: boolean) {
    const next = this.connection(value);
    if (!normalizeName) next.name = value.name;
    return next;
  }
  private withConnections(current: ImageAiSettings, connections: ImageAiConnection[]) {
    return parseImageAiSettings({
      ...current,
      connections,
      defaultConnectionId:
        current.defaultConnectionId &&
        current.connections.some((c) => c.id === current.defaultConnectionId) &&
        !connections.some((c) => c.id === current.defaultConnectionId)
          ? undefined
          : (current.defaultConnectionId ??
            (!current.connections.length ? connections[0]?.id : undefined)),
    });
  }
  preparePublicConnections(rows: Record<string, unknown>[]) {
    const current = this.current();
    const parsed = parseImageAiSettings({ connections: rows });
    const currentById = new Map(
      current.connections.map((connection) => [connection.id, connection]),
    );
    const connections = parsed.connections.map((value) => {
      const before = currentById.get(value.id);
      return JSON.stringify(before) === JSON.stringify(value)
        ? value
        : this.preparePublicConnection(value, !before || before.name !== value.name);
    });
    const next = this.withConnections(current, connections);
    this.validatePublic(next);
    return next;
  }
  validatePublic(next: ImageAiSettings) {
    const current = this.current();
    const nextIds = new Set(next.connections.map((connection) => connection.id));
    const currentById = new Map(
      current.connections.map((connection) => [connection.id, connection]),
    );
    if (
      current.connections.some(
        (c) => !nextIds.has(c.id) && this.secrets.configurationState(c.id).protected,
      )
    )
      throw new SettingsTargetError(
        'LOCAL_ACTION_REQUIRED',
        hostText('services.settingsTargets.localAction'),
      );
    for (const connection of next.connections) {
      const before = currentById.get(connection.id);
      if (
        (connection.mcpEnabled === true) !== (before?.mcpEnabled === true) ||
        (before?.mcpEnabled &&
          (before.baseUrl !== connection.baseUrl ||
            before.authentication !== connection.authentication))
      )
        throw new SettingsTargetError(
          'LOCAL_ACTION_REQUIRED',
          hostText('services.settingsTargets.localAction'),
        );
      if (JSON.stringify(before) === JSON.stringify(connection)) continue;
      this.connection(connection);
      if (!before) {
        if (
          connection.authentication !== 'none' ||
          this.secrets.configurationState(connection.id).protected
        )
          throw new SettingsTargetError(
            'LOCAL_ACTION_REQUIRED',
            hostText('services.settingsTargets.localAction'),
          );
        continue;
      }
      if (
        before.authentication !== connection.authentication &&
        connection.authentication === 'bearer' &&
        !this.secrets.configurationState(connection.id).protected
      )
        throw new SettingsTargetError(
          'LOCAL_ACTION_REQUIRED',
          hostText('services.settingsTargets.localAction'),
        );
      if (
        (before.baseUrl !== connection.baseUrl ||
          before.authentication !== connection.authentication) &&
        this.secrets.configurationState(connection.id).protected
      )
        throw new SettingsTargetError(
          'LOCAL_ACTION_REQUIRED',
          hostText('services.settingsTargets.localAction'),
        );
    }
  }
  save(value: unknown, original: unknown, key: unknown, keyRevision: unknown) {
    const c = this.connection(value),
      current = this.current();
    this.assertOriginal(c, original, keyRevision);
    this.key(c, key);
    const exists = current.connections.some((v) => v.id === c.id);
    const connections = exists
      ? current.connections.map((v) => (v.id === c.id ? c : v))
      : [...current.connections, c];
    const imageAi = this.withConnections(current, connections);
    const previousKeyRevision = this.secrets.revision(c.id);
    const asset =
      c.authentication === 'none'
        ? this.secrets.prepareKey(c, '')
        : key == null
          ? undefined
          : this.secrets.prepareKey(c, key);
    this.settings.save({ ...this.settings.value, imageAi }, this.settings.revision, asset);
    this.changed(this.secrets.revision(c.id) !== previousKeyRevision ? c.id : undefined);
  }
  remove(original: unknown, keyRevision: unknown) {
    const c = parseImageAiSettings({ connections: [original] }).connections[0],
      current = this.current();
    this.assertOriginal(c, original, keyRevision);
    const connections = current.connections.filter((v) => v.id !== c.id);
    const imageAi = this.withConnections(current, connections);
    this.settings.save(
      { ...this.settings.value, imageAi },
      this.settings.revision,
      this.secrets.prepareKey(c, ''),
    );
    this.changed(c.id);
  }
  reorder(original: unknown, ordered: unknown) {
    const current = this.current(),
      ids = current.connections.map((c) => c.id);
    const byId = new Map(current.connections.map((connection) => [connection.id, connection]));
    if (
      JSON.stringify(original) !== JSON.stringify(ids) ||
      !Array.isArray(ordered) ||
      ordered.length !== ids.length ||
      new Set(ordered).size !== ids.length ||
      ordered.some((id) => !byId.has(id))
    )
      throw Error(hostText('settings.ai-settings.orderConflict'));
    const imageAi = {
      ...current,
      connections: ordered.map((id) => byId.get(id)!),
    };
    this.settings.save({ ...this.settings.value, imageAi }, this.settings.revision);
    this.changed();
  }
}
