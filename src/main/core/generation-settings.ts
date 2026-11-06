import type { Settings } from '../../shared/contracts';
import { parseAiSettings } from '../../shared/ai';
import { parseTtsConfiguration } from '../../shared/tts';
import { parseImageAiSettings } from '../../shared/image-ai';

/** The local file owns generator configuration and the notification's server selection. */
export interface GenerationSettings {
  version: 1;
  ai: NonNullable<Settings['ai']>;
  tts: NonNullable<Settings['tts']>;
  imageAi: NonNullable<Settings['imageAi']>;
  notificationConnectionId?: string;
}
export function parseGenerationSettings(raw: any): GenerationSettings {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    raw.version !== 1 ||
    Object.keys(raw).some(
      (key) => !['version', 'ai', 'tts', 'imageAi', 'notificationConnectionId'].includes(key),
    ) ||
    (raw.notificationConnectionId !== undefined &&
      (typeof raw.notificationConnectionId !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(raw.notificationConnectionId)))
  )
    throw Error('Invalid local generation settings');
  return {
    version: 1,
    ai: parseAiSettings(raw.ai),
    tts: parseTtsConfiguration(raw.tts),
    imageAi: parseImageAiSettings(raw.imageAi),
    ...(raw.notificationConnectionId === undefined
      ? {}
      : { notificationConnectionId: raw.notificationConnectionId }),
  };
}
export function generationSettings(value: Settings): GenerationSettings {
  return parseGenerationSettings({
    version: 1,
    ai: value.ai,
    tts: value.tts,
    imageAi: value.imageAi,
    notificationConnectionId: value.notificationPreferences?.speech?.connectionId,
  });
}
/** Never import old shared/device generator values, including malformed legacy values. */
export function withoutGenerationSettings<T>(value: T): T {
  const next: any = structuredClone(value);
  if (!next || typeof next !== 'object') return next;
  delete next.ai;
  delete next.tts;
  delete next.imageAi;
  const speech = next.notificationPreferences?.speech;
  if (speech && typeof speech === 'object') {
    delete speech.connectionId;
    if (!Object.keys(speech).length) delete next.notificationPreferences.speech;
  }
  if (next.hostPages?.notifications?.configuration)
    next.hostPages.notifications.configuration = withoutGenerationSettings(
      next.hostPages.notifications.configuration,
    );
  return next;
}
export function withGenerationSettings<T>(value: T, local: GenerationSettings): T {
  const next: any = withoutGenerationSettings(value);
  for (const key of ['ai', 'tts', 'imageAi'] as const) next[key] = structuredClone(local[key]);
  if (local.notificationConnectionId !== undefined) {
    next.notificationPreferences ??= { overrides: [] };
    next.notificationPreferences.speech ??= {};
    next.notificationPreferences.speech.connectionId = local.notificationConnectionId;
  }
  return next;
}
