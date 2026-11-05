import { hostText } from './i18n';
import { boundedJson } from './custom-commands';
export interface TtsVoice {
  id: string;
  name: string;
}
/** One connection's configuration; independent of selection and playback queue ownership. */
export interface TtsConnectionSettings {
  baseUrl: string;
  model: string;
  defaultVoice: string;
  preset: TtsPresetId;
  speechPath: string;
  instructionsMode: 'none' | 'json';
  instructionsParameter: string;
  extraBody: Record<string, unknown>;
  speedMode: 'playback' | 'server';
  voicesSource: 'endpoint' | 'manual';
  voicesPath: string;
  manualVoices: TtsVoice[];
}
export interface TtsSettings extends TtsConnectionSettings {
  defaultSpeed: number;
  defaultInstructions: string;
  alwaysInstructions: string;
}
export const ttsPresetIds = [
  'custom',
  'openai-speech',
  'qwen3-tts',
  'mlx-audio',
  'ollama',
] as const;
export type TtsPresetId = (typeof ttsPresetIds)[number];
type TtsPreset = Pick<
  TtsConnectionSettings,
  | 'speechPath'
  | 'speedMode'
  | 'voicesSource'
  | 'voicesPath'
  | 'instructionsMode'
  | 'instructionsParameter'
>;
const commonPreset: TtsPreset = {
  speechPath: 'audio/speech',
  speedMode: 'playback',
  voicesSource: 'endpoint',
  voicesPath: 'audio/voices',
  instructionsMode: 'none',
  instructionsParameter: 'instructions',
};
const presets: Record<Exclude<TtsPresetId, 'custom'>, TtsPreset> = {
  'openai-speech': { ...commonPreset, voicesSource: 'manual', instructionsMode: 'json' },
  'qwen3-tts': { ...commonPreset, instructionsMode: 'json', instructionsParameter: 'instruct' },
  'mlx-audio': {
    ...commonPreset,
    voicesSource: 'manual',
    instructionsMode: 'json',
    instructionsParameter: 'instruct',
  },
  ollama: { ...commonPreset, voicesSource: 'manual' },
};
const presetVoiceDefaults: Partial<Record<TtsPresetId, TtsVoice>> = {
  ollama: { id: 'default', name: 'default' },
};
export function applyTtsPreset(value: TtsSettings, preset: TtsPresetId): TtsSettings {
  const voice = presetVoiceDefaults[preset];
  return {
    ...value,
    ...(preset === 'custom' ? {} : presets[preset]),
    preset,
    defaultVoice: value.defaultVoice || voice?.id || '',
    manualVoices: voice && value.manualVoices.length === 0 ? [{ ...voice }] : value.manualVoices,
  };
}
export function isTtsPresetCustomized(value: TtsSettings): boolean {
  if (value.preset === 'custom') return false;
  const voice = presetVoiceDefaults[value.preset];
  return (
    Boolean(voice && (!value.defaultVoice || value.manualVoices.length === 0)) ||
    Object.entries(presets[value.preset]).some(([key, v]) => value[key as keyof TtsPreset] !== v)
  );
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
  defaultInstructions: '',
  alwaysInstructions: '',
  preset: 'custom',
  speechPath: 'audio/speech',
  instructionsMode: 'none',
  instructionsParameter: 'instructions',
  speedMode: 'playback',
  voicesSource: 'endpoint',
  voicesPath: 'audio/voices',
  manualVoices: [],
  extraBody: {},
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
/** Dot-separated object properties, never array indices or executable expressions. */
export function ttsInstructionsPath(value: string): string[] {
  const parts = value.split('.');
  if (
    !parts.every((part) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(part)) ||
    parts.some((part) => ['__proto__', 'prototype', 'constructor'].includes(part)) ||
    ['model', 'input', 'voice', 'speed', 'response_format'].includes(parts[0])
  )
    throw Error(hostText('settings.tts.instructionsParameterInvalid'));
  return parts;
}
/** Extra JSON never overrides speech fields or the configured instruction destination. */
export function parseTtsExtraBody(
  value: unknown,
  instructionsParameter: string,
): Record<string, unknown> {
  const invalid = () => {
    throw Error(hostText('settings.tts.extraBodyInvalid'));
  };
  if (!object(value)) return invalid();
  try {
    boundedJson(value, Infinity, Infinity, Infinity);
  } catch {
    return invalid();
  }
  if (
    ['model', 'input', 'voice', 'speed', 'response_format'].some((key) => Object.hasOwn(value, key))
  )
    return invalid();
  let current = value;
  const parts = ttsInstructionsPath(instructionsParameter);
  for (const [index, key] of parts.entries()) {
    if (!Object.hasOwn(current, key)) break;
    if (index === parts.length - 1 || !object(current[key])) return invalid();
    current = current[key] as Record<string, unknown>;
  }
  return structuredClone(value);
}
export function parseTtsVoices(value: unknown): TtsVoice[] {
  if (!Array.isArray(value)) throw Error(hostText('settings.tts.voiceLimit'));
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
  if (!Array.isArray(value.models)) throw Error(hostText('settings.tts.modelLimit'));
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
  for (const key of [
    'baseUrl',
    'model',
    'defaultVoice',
    'voicesPath',
    'speechPath',
    'defaultInstructions',
    'alwaysInstructions',
    'instructionsParameter',
  ] as const)
    if (typeof v[key] !== 'string') throw Error(hostText('settings.tts.strings'));
  if (v.model.length > 200 || v.defaultVoice.length > 200)
    throw Error(hostText('settings.tts.nameLength'));
  if (!Number.isFinite(v.defaultSpeed) || v.defaultSpeed < 0.25 || v.defaultSpeed > 4)
    throw Error(hostText('settings.tts.speed'));
  if (!['playback', 'server'].includes(v.speedMode))
    throw Error(hostText('settings.tts.speedMode'));
  if (!['endpoint', 'manual'].includes(v.voicesSource))
    throw Error(hostText('settings.tts.voiceSource'));
  if (!ttsPresetIds.includes(v.preset) || !['none', 'json'].includes(v.instructionsMode))
    throw Error(hostText('settings.tts.connectionOptions'));
  ttsInstructionsPath(v.instructionsParameter);
  return {
    ...v,
    baseUrl: ttsBaseUrl(v.baseUrl),
    model: v.model.trim(),
    defaultVoice: v.defaultVoice.trim(),
    voicesPath: ttsVoicesPath(v.voicesPath),
    speechPath: ttsVoicesPath(v.speechPath),
    extraBody: parseTtsExtraBody(v.extraBody, v.instructionsParameter),
    manualVoices: parseTtsVoices(v.manualVoices),
  } as TtsSettings;
}
export type TtsSpeakInput = {
  text: string;
  voice?: string;
  speed?: number;
  instructions?: string;
  requestId: string;
};
export type TtsSpeakResult = TtsJob & { completion: 'accepted' };
export type TtsVoicesResult = { voices: TtsVoice[]; source: 'endpoint' | 'manual' };
