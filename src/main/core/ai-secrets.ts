import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  atomicWrite,
  SettingsConflictError,
  settingsCredentialFiles,
  type SettingsAsset,
  type SettingsCredentialScope,
} from './settings';
import { aiObject, aiId, type AiConnectionSettings } from '../../shared/ai';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export class AiSecrets {
  private readonly keysFile: string;
  constructor(
    directory: string,
    private scope: Exclude<SettingsCredentialScope, 'mcp-secrets'>,
    private encryption: { encrypt(value: string): string; decrypt(value: string): string },
  ) {
    this.keysFile = path.join(directory, settingsCredentialFiles[scope]);
  }
  private bytes() {
    try {
      return fs.readFileSync(this.keysFile);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw Error(hostText('services.aiSecrets.readFailed'));
    }
  }
  private entries(
    bytes: Buffer | undefined,
  ): Record<string, { fingerprint: string; key?: string }> {
    if (!bytes) return {};
    try {
      const v = JSON.parse(bytes.toString('utf8'));
      if (!aiObject(v) || v.version !== 1 || !aiObject(v.entries)) throw Error();
      for (const [id, item] of Object.entries(v.entries)) {
        if (
          !aiId(id) ||
          !aiObject(item) ||
          typeof item.fingerprint !== 'string' ||
          !/^[a-f0-9]{64}$/.test(item.fingerprint) ||
          (item.key !== undefined && typeof item.key !== 'string') ||
          Object.keys(item).some((k) => !['fingerprint', 'key'].includes(k))
        )
          throw Error();
      }
      return v.entries as Record<string, { fingerprint: string; key?: string }>;
    } catch {
      throw Error(hostText('services.aiSecrets.readFileFailed'));
    }
  }
  key(c: Pick<AiConnectionSettings, 'id' | 'baseUrl'>): string | undefined {
    const v = this.entries(this.bytes())[c.id];
    if (!v || v.fingerprint !== hash(c.baseUrl) || v.key === undefined) return undefined;
    try {
      return this.encryption.decrypt(v.key);
    } catch {
      throw Error(hostText('services.aiSecrets.decryptFailed'));
    }
  }
  revision(id: string) {
    return hash(JSON.stringify(this.entries(this.bytes())[id] ?? null));
  }
  /** Internal credential metadata for configuration guards; never decrypts a key. */
  configurationState(id: string) {
    try {
      const entry = this.entries(this.bytes())[id];
      return { protected: entry?.key !== undefined, revision: hash(JSON.stringify(entry ?? null)) };
    } catch {
      return { protected: true, revision: 'unavailable' };
    }
  }
  prepareKey(c: Pick<AiConnectionSettings, 'id' | 'baseUrl'>, value: unknown): SettingsAsset {
    if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value))
      throw Error(hostText('services.aiSecrets.keyFormat'));
    const previous = this.bytes();
    const entries = this.entries(previous);
    if (value) {
      if (!c.baseUrl) throw Error(hostText('services.aiSecrets.configureFirst'));
      entries[c.id] = { fingerprint: hash(c.baseUrl), key: this.encryption.encrypt(value) };
    } else delete entries[c.id];
    const content = Buffer.from(JSON.stringify({ version: 1, entries }) + '\n');
    let committed = false;
    return {
      recovery: {
        scope: this.scope,
        before: previous?.toString('base64') ?? null,
        after: content.toString('base64'),
      },
      commit: () => {
        atomicWrite(this.keysFile, content, { previous });
        committed = true;
      },
      rollback: () => {
        if (!committed) return;
        if (previous) atomicWrite(this.keysFile, previous, { previous: content });
        else if (this.bytes()?.equals(content)) fs.unlinkSync(this.keysFile);
        else throw new SettingsConflictError(hostText('services.settings.pathChanged'));
      },
    };
  }
  setKey(c: Pick<AiConnectionSettings, 'id' | 'baseUrl'>, value: unknown) {
    this.prepareKey(c, value).commit();
  }
  status(c: Pick<AiConnectionSettings, 'id' | 'baseUrl'>) {
    let keyRevision = '';
    try {
      keyRevision = this.revision(c.id);
      return {
        id: c.id,
        apiKeyConfigured: !!this.key(c),
        keyRevision,
      };
    } catch (e) {
      return {
        id: c.id,
        apiKeyConfigured: false,
        keyRevision,
        error: e instanceof Error ? e.message : hostText('services.aiSecrets.invalidSettings'),
      };
    }
  }
}
