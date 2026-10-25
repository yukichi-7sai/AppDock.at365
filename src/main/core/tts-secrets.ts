import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { atomicWrite } from './settings';
import { ttsBaseUrl } from '../../shared/tts';
export class TtsSecrets {
  constructor(
    private file: string,
    private encryption: { encrypt(value: string): string; decrypt(value: string): string },
  ) {}
  private endpoint(baseUrl: string) {
    return createHash('sha256').update(ttsBaseUrl(baseUrl)).digest('hex');
  }
  /** Internal credential metadata for configuration guards; never decrypts a key. */
  configurationState() {
    try {
      if (fs.statSync(this.file).size > 32768) throw Error();
      const bytes = fs.readFileSync(this.file),
        value = JSON.parse(bytes.toString('utf8'));
      if (
        value.version !== 1 ||
        typeof value.endpoint !== 'string' ||
        typeof value.key !== 'string'
      )
        throw Error();
      return { protected: true, revision: createHash('sha256').update(bytes).digest('hex') };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { protected: false, revision: 'absent' };
      return { protected: true, revision: 'unavailable' };
    }
  }
  get(baseUrl: string): string | undefined {
    if (!baseUrl || !fs.existsSync(this.file)) return undefined;
    try {
      if (fs.statSync(this.file).size > 32768) throw Error();
      const v = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (v.version !== 1 || typeof v.endpoint !== 'string' || typeof v.key !== 'string')
        throw Error();
      if (v.endpoint !== this.endpoint(baseUrl)) return undefined;
      return this.encryption.decrypt(v.key);
    } catch {
      throw Error(hostText('services.ttsSecrets.readFailed'));
    }
  }
  set(baseUrl: string, value: unknown) {
    if (typeof value !== 'string' || value.length > 8192 || /[\r\n\x00-\x1f\x7f]/.test(value))
      throw Error(hostText('services.ttsSecrets.keyFormat'));
    if (!value) {
      if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
      return;
    }
    if (!baseUrl) throw Error(hostText('services.ttsSecrets.configureFirst'));
    atomicWrite(
      this.file,
      JSON.stringify({
        version: 1,
        endpoint: this.endpoint(baseUrl),
        key: this.encryption.encrypt(value),
      }) + '\n',
    );
  }
  status(baseUrl: string) {
    try {
      return { apiKeyConfigured: !!this.get(baseUrl) };
    } catch {
      return {
        apiKeyConfigured: false,
        error: hostText('services.ttsSecrets.decryptFailed'),
      };
    }
  }
}
