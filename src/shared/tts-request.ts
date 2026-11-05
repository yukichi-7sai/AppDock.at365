import { ttsInstructionsPath, type TtsConnectionSettings } from './tts';

/** Build a request from a captured connection, ready for a future connection selector. */
export function ttsSpeechRequest(
  connection: TtsConnectionSettings,
  speech: { text: string; voice: string; speed: number; instructions: string },
) {
  const body: Record<string, unknown> = {
    ...structuredClone(connection.extraBody),
    model: connection.model,
    input: speech.text,
    ...(speech.voice ? { voice: speech.voice } : {}),
    speed: connection.speedMode === 'server' ? speech.speed : 1,
    response_format: 'wav',
  };
  if (speech.instructions && connection.instructionsMode === 'json') {
    const path = ttsInstructionsPath(connection.instructionsParameter);
    let target = body;
    for (const key of path.slice(0, -1)) {
      const child = Object.hasOwn(target, key) ? (target[key] as Record<string, unknown>) : {};
      target[key] = child;
      target = child;
    }
    target[path[path.length - 1]] = speech.instructions;
  }
  return { url: connection.baseUrl + '/' + connection.speechPath, body };
}
