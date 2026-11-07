import { hostText } from '../../shared/i18n';
import {
  parseTtsConfiguration,
  parseTtsServer,
  selectedTtsServer,
  ttsServerSpeech,
  type TtsServer,
} from '../../shared/tts';
import type { SettingsStore } from './settings';
import { ttsApiKey, type TtsSecrets } from './tts-secrets';

export class TtsSettingsController {
  constructor(
    private settings: SettingsStore,
    private secrets: TtsSecrets,
    private changed: (keyChanged?: boolean) => void,
  ) {}
  private current() {
    this.settings.assertRevision(this.settings.revision);
    return parseTtsConfiguration(this.settings.value.tts);
  }
  private assertOriginal(server: TtsServer, original: unknown, keyRevision: unknown) {
    const found = this.settings.value.tts?.connections.find((c) => c.id === server.id);
    if (
      JSON.stringify(found ?? null) !== JSON.stringify(original) ||
      (found && keyRevision !== this.secrets.revision(server.id))
    )
      throw Error(hostText('settings.ttsServers.conflict'));
  }
  configuration(id?: string) {
    const server = selectedTtsServer(this.current(), id);
    if (!server) throw Error(hostText('settings.ttsServers.missingServer'));
    return {
      settings: ttsServerSpeech(server),
      key: ttsApiKey(server, () => this.secrets.key(server)),
    };
  }
  draftConfiguration(value: unknown, key: unknown) {
    const server = parseTtsServer(value);
    this.validateKey(key);
    return {
      settings: ttsServerSpeech(server),
      key: ttsApiKey(server, () => (key == null ? this.secrets.key(server) : (key as string))),
    };
  }
  private validateKey(key: unknown) {
    if (key != null && (typeof key !== 'string' || /[\x00-\x1f\x7f]/.test(key)))
      throw Error(hostText('services.ttsSecrets.keyFormat'));
  }
  save(value: unknown, original: unknown, key: unknown, keyRevision: unknown) {
    const server = parseTtsServer(value),
      current = this.current();
    if (!server.baseUrl) throw Error(hostText('services.ttsSecrets.configureFirst'));
    this.assertOriginal(server, original, keyRevision);
    this.validateKey(key);
    const before = current.connections.find((c) => c.id === server.id);
    const connections = before
      ? current.connections.map((c) => (c.id === server.id ? server : c))
      : [...current.connections, server];
    const next = parseTtsConfiguration({
      ...current,
      connections,
      defaultConnectionId:
        current.defaultConnectionId ?? (!current.connections.length ? server.id : undefined),
    });
    const keyValue =
      server.authentication === 'none' ||
      (key == null && before && before.baseUrl !== server.baseUrl)
        ? ''
        : key;
    const asset = keyValue == null ? undefined : this.secrets.prepareKey(server, keyValue);
    this.settings.save({ ...this.settings.value, tts: next }, this.settings.revision, asset);
    this.changed(!!asset);
  }
  remove(original: unknown, keyRevision: unknown, replacement: unknown, originalDefault: unknown) {
    const server = parseTtsServer(original),
      current = this.current();
    this.assertOriginal(server, original, keyRevision);
    if (originalDefault !== current.defaultConnectionId)
      throw Error(hostText('settings.ttsServers.conflict'));
    const next = parseTtsConfiguration({
      ...current,
      connections: current.connections.filter((c) => c.id !== server.id),
      defaultConnectionId:
        current.defaultConnectionId === server.id
          ? replacement || undefined
          : current.defaultConnectionId,
    });
    this.settings.save(
      { ...this.settings.value, tts: next },
      this.settings.revision,
      this.secrets.prepareKey(server, ''),
    );
    this.changed();
  }
  reorder(original: unknown, ordered: unknown) {
    const current = this.current(),
      ids = current.connections.map((c) => c.id);
    if (
      JSON.stringify(ids) !== JSON.stringify(original) ||
      !Array.isArray(ordered) ||
      ordered.length !== ids.length ||
      new Set(ordered).size !== ids.length ||
      ordered.some((id) => !ids.includes(id))
    )
      throw Error(hostText('settings.ttsServers.conflict'));
    const byId = new Map(current.connections.map((c) => [c.id, c]));
    this.settings.save(
      {
        ...this.settings.value,
        tts: { ...current, connections: ordered.map((id) => byId.get(id)!) },
      },
      this.settings.revision,
    );
    this.changed();
  }
}
