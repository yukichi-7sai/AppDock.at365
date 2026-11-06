/** Supported local audio containers. Decoder support is checked when opening the media. */
export const audioExtensions = ['wav', 'mp3', 'aac', 'm4a', 'flac', 'ogg', 'oga', 'opus', 'webm'];
export const audioExtensionPattern = '(?:' + audioExtensions.join('|') + ')';
export function audioExtension(file: string): string | undefined {
  const extension = /\.([^.\\/]+)$/.exec(file)?.[1].toLowerCase();
  return extension && audioExtensions.includes(extension) ? extension : undefined;
}
export function audioMime(file: string): string {
  const extension = audioExtension(file);
  const types: Record<string, string> = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    opus: 'audio/ogg',
    webm: 'audio/webm',
  };
  if (!extension) throw Error('Unsupported audio extension');
  return types[extension];
}
