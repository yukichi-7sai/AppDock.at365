import type { ImageAiJob, ImageGenerateInput, ImageGenerationOptions } from './image-ai';
import type { LibraryEntry, LibraryRef } from './library-assets';

export interface ImageGenerationItem {
  job: ImageAiJob;
  input: string;
  referenceImages: LibraryRef[];
  server: string;
  folder: string;
  options: ImageGenerationOptions;
  entries: { id: string; entry: LibraryEntry; changed: boolean }[];
}
export interface ImageGenerationModel {
  id: string;
  revision: number;
  folder: string;
  folders: string[];
  initialReferenceImages: LibraryRef[];
  defaultConnectionId?: string;
  servers: { id: string; name: string; defaults: ImageGenerationOptions }[];
  items: ImageGenerationItem[];
}
export type ImageGenerationAction =
  | { kind: 'generate'; folder: string; name?: string; input: ImageGenerateInput }
  | { kind: 'cancel' | 'retrySave'; jobId: string }
  | { kind: 'rename' | 'delete'; jobId: string; imageId: string; name?: string }
  | { kind: 'close'; discard?: boolean };
export interface ImageGenerationApi {
  onChanged(callback: (model: ImageGenerationModel | null) => void): () => void;
  act(id: string, action: ImageGenerationAction): Promise<void>;
}
