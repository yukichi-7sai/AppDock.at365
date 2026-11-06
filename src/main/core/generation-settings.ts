import type { Settings } from '../../shared/contracts';
import { aiObject, parseAiSettings } from '../../shared/ai';
import { parseTtsConfiguration, ttsServerId } from '../../shared/tts';
import { parseImageAiSettings } from '../../shared/image-ai';

/** The device file owns generator configuration and the notification's server selection. */
export interface GenerationSettings {
  version: 1;
  ai: NonNullable<Settings['ai']>;
  tts: NonNullable<Settings['tts']>;
  imageAi: NonNullable<Settings['imageAi']>;
  notificationConnectionId?: string;
}
export function parseGenerationSettings(raw: unknown): GenerationSettings {
  if (
    !aiObject(raw) ||
    raw.version !== 1 ||
    Object.keys(raw).some(
      (key) => !['version', 'ai', 'tts', 'imageAi', 'notificationConnectionId'].includes(key),
    ) ||
    (raw.notificationConnectionId !== undefined && !ttsServerId(raw.notificationConnectionId))
  )
    throw Error('Invalid device generation settings');
  // Retired image prompts are removed only when reading saved device settings.
  // Public request/settings schemas remain strict and cannot restore these fields.
  const imageAi = structuredClone(raw.imageAi);
  if (aiObject(imageAi) && Array.isArray(imageAi.connections))
    for (const connection of imageAi.connections) {
      if (!aiObject(connection)) continue;
      delete connection.alwaysPrompt;
      delete connection.defaultPrompt;
    }
  return {
    version: 1,
    ai: parseAiSettings(raw.ai),
    tts: parseTtsConfiguration(raw.tts),
    imageAi: parseImageAiSettings(imageAi),
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
export function withGenerationSettings<T>(value: T, generation?: GenerationSettings): T {
  const next: any = withoutGenerationSettings(value);
  delete next.generationAi;
  if (!generation) return next;
  for (const key of ['ai', 'tts', 'imageAi'] as const) next[key] = structuredClone(generation[key]);
  if (generation.notificationConnectionId !== undefined) {
    next.notificationPreferences ??= { overrides: [] };
    next.notificationPreferences.speech ??= {};
    next.notificationPreferences.speech.connectionId = generation.notificationConnectionId;
  }
  return next;
}
