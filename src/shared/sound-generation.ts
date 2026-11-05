import type { LibraryPlayback } from './registered-images';

export interface GeneratedSound {
  id: string;
  file?: string;
  folder: string;
  seconds: number;
  text: string;
  server: string;
  instructions: string;
  state: 'saved' | 'unsaved' | 'changed';
  error?: string;
  canRetry?: boolean;
}
export interface SoundGenerationModel {
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
  phase: 'idle' | 'generating' | 'saving' | 'editing';
  playback?: LibraryPlayback;
  error: string;
}
export type SoundGenerationAction =
  | { kind: 'generate'; folder: string; connectionId: string; text: string; instructions?: string }
  | { kind: 'cancel' | 'stop' }
  | { kind: 'close'; discard?: boolean }
  | { kind: 'retry' | 'play' | 'delete'; itemId: string }
  | { kind: 'rename'; itemId: string; name: string };
/** Private trusted-renderer bridge. It never exposes WAV bytes or credentials. */
export interface SoundGenerationApi {
  onChanged(callback: (model: SoundGenerationModel | null) => void): () => void;
  act(id: string, action: SoundGenerationAction): Promise<void>;
}
