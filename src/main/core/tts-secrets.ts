import { AiSecrets } from './ai-secrets';
import type { TtsServer } from '../../shared/tts';
import { hostText } from '../../shared/i18n';

/** Resolve credentials for saved presets and uncommitted discovery drafts alike. */
export function ttsApiKey(server: TtsServer, readKey: () => string | undefined) {
  if (server.authentication === 'none') return undefined;
  const key = readKey();
  if (server.authentication === 'bearer' && !key)
    throw Error(hostText('services.ttsService.apiKey'));
  return key;
}

/** Per-server keys share the host's atomic encrypted credential storage. */
export class TtsSecrets extends AiSecrets {}
