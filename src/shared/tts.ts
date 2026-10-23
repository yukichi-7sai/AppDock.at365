import { hostText } from './i18n';
export interface TtsVoice {
  id: string;
  name: string;
}
export interface TtsSettings {
  baseUrl: string;
  model: string;
  defaultVoice: string;
  defaultSpeed: number;
  speedMode: 'playback' | 'server';
  voicesSource: 'endpoint' | 'manual';
  voicesPath: string;
  manualVoices: TtsVoice[];
}
export interface TtsJob {
  jobId: string;
  state:
    'queued' | 'generating' | 'waitingPlayback' | 'playing' | 'completed' | 'failed' | 'canceled';
  createdAt: string;
  updatedAt: string;
  error?: { code: string; message: string };
}
export const defaultTtsSettings = (): TtsSettings => ({
  baseUrl: '',
  model: '',
  defaultVoice: '',
  defaultSpeed: 1,
  speedMode: 'playback',
  voicesSource: 'endpoint',
  voicesPath: 'audio/voices',
  manualVoices: [],
});
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function ttsBaseUrl(value: string): string {
  if (!value) return '';
  if (value.length > 2048 || /[\\\s?#]/.test(value))
    throw Error(hostText('settings.tts.urlCredentials'));
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Error(hostText('settings.tts.urlInvalid'));
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw Error(hostText('settings.tts.urlProtocol'));
  return url.href.replace(/\/+$/, '');
}
export function ttsVoicesPath(value: string): string {
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(value) || value.length > 256)
    throw Error(hostText('settings.tts.voicePath'));
  return value;
}
export function parseTtsVoices(value: unknown): TtsVoice[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw Error(hostText('settings.tts.voiceLimit'));
  const ids = new Set<string>();
  return value.map((v) => {
    if (
      !object(v) ||
      typeof v.id !== 'string' ||
      !v.id.trim() ||
      v.id.length > 200 ||
      (v.name !== undefined && (typeof v.name !== 'string' || v.name.length > 200)) ||
      ids.has(v.id)
    )
      throw Error(hostText('settings.tts.voiceItem'));
    ids.add(v.id);
    return { id: v.id, name: typeof v.name === 'string' ? v.name : v.id };
  });
}
/** OpenAI-compatible catalogs and Qwen3-TTS catalogs use different envelopes. */
export function parseTtsModels(value: unknown): TtsVoice[] {
  if (!object(value)) throw Error(hostText('settings.tts.modelObject'));
  if (Object.hasOwn(value, 'data')) return parseTtsVoices(value.data);
  if (!Array.isArray(value.models) || value.models.length > 1000)
    throw Error(hostText('settings.tts.modelLimit'));
  const rows = value.models.map((model) => {
    if (!object(model) || (model.downloaded !== undefined && typeof model.downloaded !== 'boolean'))
      throw Error(hostText('settings.tts.modelItem'));
    return { id: model.id ?? model.name, name: model.name, downloaded: model.downloaded };
  });
  const models = parseTtsVoices(rows);
  // Never offer a known-unavailable model or trigger an implicit server download.
  return models.filter((_, index) => rows[index].downloaded !== false);
}
export function parseTtsSettings(value: unknown): TtsSettings {
  if (value === undefined) return defaultTtsSettings();
  if (!object(value)) throw Error(hostText('settings.tts.object'));
  const defaults = defaultTtsSettings();
  if (Object.keys(value).some((k) => !Object.hasOwn(defaults, k)))
    throw Error(hostText('settings.tts.fields'));
  const v = { ...defaults, ...value };
  for (const key of ['baseUrl', 'model', 'defaultVoice', 'voicesPath'] as const)
    if (typeof v[key] !== 'string') throw Error(hostText('settings.tts.strings'));
  if (v.model.length > 200 || v.defaultVoice.length > 200)
    throw Error(hostText('settings.tts.nameLength'));
  if (!Number.isFinite(v.defaultSpeed) || v.defaultSpeed < 0.25 || v.defaultSpeed > 4)
    throw Error(hostText('settings.tts.speed'));
  if (!['playback', 'server'].includes(v.speedMode))
    throw Error(hostText('settings.tts.speedMode'));
  if (!['endpoint', 'manual'].includes(v.voicesSource))
    throw Error(hostText('settings.tts.voiceSource'));
  return {
    ...v,
    baseUrl: ttsBaseUrl(v.baseUrl),
    model: v.model.trim(),
    defaultVoice: v.defaultVoice.trim(),
    voicesPath: ttsVoicesPath(v.voicesPath),
    manualVoices: parseTtsVoices(v.manualVoices),
  } as TtsSettings;
}
export type TtsSpeakInput = { text: string; voice?: string; speed?: number; requestId: string };
export type TtsSpeakResult = TtsJob & { completion: 'accepted' };
export type TtsVoicesResult = { voices: TtsVoice[]; source: 'endpoint' | 'manual' };
