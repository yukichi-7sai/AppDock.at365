import type { LibraryPlayback } from './registered-images';

export interface GeneratedSound {
  id: string;
  file?: string;
  folder: string;
  seconds?: number;
  text: string;
  server: string;
  instructions: string;
  state:
    'queued' | 'generating' | 'saving' | 'saved' | 'unsaved' | 'changed' | 'failed' | 'canceled';
  busy: boolean;
  error?: string;
  canRetry?: boolean;
  hasResult?: boolean;
}
export interface SoundGenerationModel {
  draft?: SoundGenerationDraft;
  id: string;
  revision: number;
  folder: string;
  folders: string[];
  servers: {
    id: string;
    name: string;
    ready: boolean;
    instructions: string;
    supportsInstructions: boolean;
  }[];
  defaultConnectionId?: string;
  items: GeneratedSound[];
  closing: boolean;
  playback?: LibraryPlayback;
  error: string;
}
export interface SoundGenerationDraft {
  folder: string;
  serverId: string;
  text: string;
  useDefault: boolean;
  instructions: string;
}
export type SoundGenerationAction =
  | { kind: 'draft'; draft: SoundGenerationDraft }
  | { kind: 'recoveryFolder' }
  | { kind: 'export' | 'discard'; itemId: string }
  | { kind: 'generate'; folder: string; connectionId: string; text: string; instructions?: string }
  | { kind: 'stop' }
  | { kind: 'close'; discard?: boolean }
  | { kind: 'cancel' | 'retry' | 'regenerate' | 'play' | 'delete' | 'dismiss'; itemId: string }
  | { kind: 'rename'; itemId: string; name: string };
/** Private trusted-renderer bridge. It never exposes WAV bytes or credentials. */
export interface SoundGenerationApi {
  onChanged(callback: (model: SoundGenerationModel | null) => void): () => void;
  act(id: string, action: SoundGenerationAction): Promise<void>;
}
