import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { atomicWrite } from './settings';
import { aiObject, aiId, type AiConnectionSettings } from '../../shared/ai';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export class AiSecrets {
  constructor(
    private keysFile: string,
    private encryption: { encrypt(value: string): string; decrypt(value: string): string },
  ) {}
  private read(file: string): Record<string, { fingerprint: string; key?: string }> {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw Error(hostText('services.aiSecrets.readFailed'));
    }
    try {
      const v = JSON.parse(text);
      if (!aiObject(v) || v.version !== 1 || !aiObject(v.entries)) throw Error();
      for (const [id, item] of Object.entries(v.entries)) {
        if (
          !aiId(id) ||
          !aiObject(item) ||
          typeof item.fingerprint !== 'string' ||
          !/^[a-f0-9]{64}$/.test(item.fingerprint) ||
          (item.key !== undefined && (typeof item.key !== 'string' || item.key.length > 32768)) ||
          Object.keys(item).some((k) => !['fingerprint', 'key'].includes(k))
        )
          throw Error();
      }
      return v.entries as Record<string, { fingerprint: string; key?: string }>;
    } catch {
      throw Error(hostText('services.aiSecrets.readFileFailed'));
    }
  }
  key(c: AiConnectionSettings): string | undefined {
    const v = this.read(this.keysFile)[c.id];
    if (!v || v.fingerprint !== hash(c.baseUrl) || v.key === undefined) return undefined;
    try {
      return this.encryption.decrypt(v.key);
    } catch {
      throw Error(hostText('services.aiSecrets.decryptFailed'));
    }
  }
  revision(id: string) {
    return hash(JSON.stringify(this.read(this.keysFile)[id] ?? null));
  }
  /** Internal credential metadata for configuration guards; never decrypts a key. */
  configurationState(id: string) {
    try {
      const entry = this.read(this.keysFile)[id];
      return { protected: entry?.key !== undefined, revision: hash(JSON.stringify(entry ?? null)) };
    } catch {
      return { protected: true, revision: 'unavailable' };
    }
  }
  prepareKey(c: AiConnectionSettings, value: unknown) {
    if (typeof value !== 'string' || value.length > 8192 || /[\x00-\x1f\x7f]/.test(value))
      throw Error(hostText('services.aiSecrets.keyFormat'));
    const entries = this.read(this.keysFile);
    const previous = fs.existsSync(this.keysFile) ? fs.readFileSync(this.keysFile) : undefined;
    if (value) {
      if (!c.baseUrl) throw Error(hostText('services.aiSecrets.configureFirst'));
      entries[c.id] = { fingerprint: hash(c.baseUrl), key: this.encryption.encrypt(value) };
    } else delete entries[c.id];
    return {
      commit: () => atomicWrite(this.keysFile, JSON.stringify({ version: 1, entries }) + '\n'),
      rollback: () => {
        if (previous) atomicWrite(this.keysFile, previous);
        else fs.rmSync(this.keysFile, { force: true });
      },
    };
  }
  setKey(c: AiConnectionSettings, value: unknown) {
    this.prepareKey(c, value).commit();
  }
  status(c: AiConnectionSettings) {
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
