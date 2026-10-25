import { hostText } from '../../shared/i18n';
import { randomUUID } from 'node:crypto';
import { aiId, parseAiSettings, type AiConnectionSettings, type AiSettings } from '../../shared/ai';
import { SettingsTargetError } from './settings-target-types';
import { AiOpenAiChat } from './ai-openai-chat';
import type { AiSecrets } from './ai-secrets';
import type { SettingsStore } from './settings';

/** Local credential transactions, public non-secret validation, and explicit discovery. */
export class AiSettingsController {
  private discovery?: { id: string; abort: AbortController };
  constructor(
    private settings: SettingsStore,
    private secrets: AiSecrets,
    private changed: (id?: string) => void,
    private adapter = new AiOpenAiChat(),
  ) {}
  private connection(value: unknown) {
    const c = parseAiSettings({ connections: [value] }).connections[0];
    if (!c.name.trim() || !c.baseUrl) throw Error(hostText('settings.ai-settings.nameAndUrl'));
    return { ...c, name: c.name.trim() };
  }
  private current() {
    // Observe disk changes before comparing the dialog's original values.
    this.settings.assertRevision(this.settings.revision);
    return parseAiSettings(this.settings.value.ai);
  }
  private assertOriginal(c: AiConnectionSettings, original: unknown, keyRevision: unknown) {
    const found = this.settings.value.ai?.connections.find((v) => v.id === c.id);
    if (
      JSON.stringify(found ?? null) !== JSON.stringify(original) ||
      (found && keyRevision !== this.secrets.revision(c.id))
    )
      throw Error(hostText('settings.ai-settings.conflict'));
  }
  private key(c: AiConnectionSettings, key: unknown) {
    if (
      key !== undefined &&
      key !== null &&
      (typeof key !== 'string' || key.length > 8192 || /[\x00-\x1f\x7f]/.test(key))
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
  preparePublicConnection(value: AiConnectionSettings, normalizeName: boolean) {
    const next = this.connection(value);
    if (!normalizeName) next.name = value.name;
    return next;
  }
  private withConnections(current: AiSettings, connections: AiConnectionSettings[]) {
    return parseAiSettings({
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
    const parsed = parseAiSettings({ ...current, connections: rows });
    const connections = parsed.connections.map((value) => {
      const before = current.connections.find((c) => c.id === value.id);
      return JSON.stringify(before) === JSON.stringify(value)
        ? value
        : this.preparePublicConnection(value, !before || before.name !== value.name);
    });
    const next = this.withConnections(current, connections);
    this.validatePublic(next);
    return next;
  }
  validatePublic(next: AiSettings) {
    const current = this.current();
    if (
      current.connections.some(
        (c) =>
          !next.connections.some((value) => value.id === c.id) &&
          this.secrets.configurationState(c.id).protected,
      )
    )
      throw new SettingsTargetError(
        'LOCAL_ACTION_REQUIRED',
        hostText('services.settingsTargets.localAction'),
      );
    for (const connection of next.connections) {
      const before = current.connections.find((c) => c.id === connection.id);
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
    const ai = this.withConnections(current, connections);
    const asset =
      c.authentication === 'none'
        ? this.secrets.prepareKey(c, '')
        : key == null
          ? undefined
          : this.secrets.prepareKey(c, key);
    this.settings.save({ ...this.settings.value, ai }, this.settings.revision, asset);
    this.changed(c.id);
  }
  remove(original: unknown, keyRevision: unknown) {
    const c = parseAiSettings({ connections: [original] }).connections[0],
      current = this.current();
    this.assertOriginal(c, original, keyRevision);
    const connections = current.connections.filter((v) => v.id !== c.id);
    const ai = this.withConnections(current, connections);
    this.settings.save(
      { ...this.settings.value, ai },
      this.settings.revision,
      this.secrets.prepareKey(c, ''),
    );
    this.changed(c.id);
  }
  reorder(original: unknown, ordered: unknown) {
    const current = this.current(),
      ids = current.connections.map((c) => c.id);
    if (
      JSON.stringify(original) !== JSON.stringify(ids) ||
      !Array.isArray(ordered) ||
      ordered.length !== ids.length ||
      new Set(ordered).size !== ids.length ||
      ordered.some((id) => !ids.includes(id))
    )
      throw Error(hostText('settings.ai-settings.orderConflict'));
    const ai = {
      ...current,
      connections: ordered.map((id) => current.connections.find((c) => c.id === id)!),
    };
    this.settings.save({ ...this.settings.value, ai }, this.settings.revision);
    this.changed();
  }
  async models(value: unknown, key: unknown, requestId: unknown = randomUUID()) {
    if (!aiId(requestId)) throw Error(hostText('settings.ai-settings.invalidRequest'));
    const c = this.connection(value),
      resolved = this.key(c, key);
    this.cancelModels();
    const abort = new AbortController();
    this.discovery = { id: requestId, abort };
    const timer = setTimeout(() => abort.abort(), 5000);
    try {
      const result = await this.adapter.models(c, resolved, abort.signal);
      if (abort.signal.aborted) throw Error(hostText('settings.ai-settings.canceled'));
      return result;
    } finally {
      clearTimeout(timer);
      if (this.discovery?.abort === abort) this.discovery = undefined;
    }
  }
  cancelModels(requestId?: unknown) {
    if (requestId !== undefined && this.discovery?.id !== requestId) return;
    this.discovery?.abort.abort();
    this.discovery = undefined;
  }
}
