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
    try {
      if (fs.statSync(file).size > 262144) throw Error();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw Error(hostText('services.aiSecrets.readFailed'));
    }
    try {
      const v = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (
        !aiObject(v) ||
        v.version !== 1 ||
        !aiObject(v.entries) ||
        Object.keys(v.entries).length > 128
      )
        throw Error();
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
  prepareKey(c: AiConnectionSettings, value: unknown) {
    if (typeof value !== 'string' || value.length > 8192 || /[\x00-\x1f\x7f]/.test(value))
      throw Error(hostText('services.aiSecrets.keyFormat'));
    const entries = this.read(this.keysFile);
    const previous = fs.existsSync(this.keysFile) ? fs.readFileSync(this.keysFile) : undefined;
    if (value) {
      if (!c.baseUrl) throw Error(hostText('services.aiSecrets.configureFirst'));
      entries[c.id] = { fingerprint: hash(c.baseUrl), key: this.encryption.encrypt(value) };
    } else delete entries[c.id];
    if (Object.keys(entries).length > 128) throw Error(hostText('services.aiSecrets.keyLimit'));
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
