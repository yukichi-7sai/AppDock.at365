import { constants as bufferLimits } from 'node:buffer';
import { TextDecoder } from 'node:util';
import {
  libraryFolder,
  libraryKey,
  libraryPath,
  type LibraryRef,
} from '../../shared/library-assets';
import { hostText } from '../../shared/i18n';
import type { LibraryTextDocument } from '../../shared/text-library';
import { snippetGroupId } from '../../shared/library-assets';
import { RegisteredAssets } from './registered-assets';
import { AssetLibraryHost } from './asset-library-host';
import type { FileWatchAssistance } from './file-watch-assistance';

export function decodeLibraryText(bytes: Buffer): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw Error('binary');
    return text;
  } catch {
    throw Error(hostText('texts.invalidEncoding'));
  }
}
function encodeLibraryText(body: unknown) {
  if (typeof body !== 'string') throw Error(hostText('texts.invalidBody'));
  const bytes = Buffer.from(body, 'utf8');
  // Reject lone surrogates instead of silently saving replacement characters.
  if (decodeLibraryText(bytes) !== body) throw Error(hostText('texts.invalidBody'));
  return bytes;
}
export class TextLibraryService {
  readonly files: RegisteredAssets;
  readonly host: AssetLibraryHost;
  private indexed = new Map<string, { generation: string; body: string }>();
  private pendingIndex?: Promise<void>;
  private indexRequested = false;
  private closed = false;
  constructor(
    directory: string,
    private options: ConstructorParameters<typeof AssetLibraryHost>[1],
    private changed: () => void,
    assistance?: FileWatchAssistance,
  ) {
    this.files = new RegisteredAssets(
      directory,
      {
        media: 'text',
        assignedDirectory: 'assigned-texts',
        allowEmpty: true,
        // The buffer runtime determines the representable file size.
        maxBytes: bufferLimits.MAX_LENGTH,
        format: () => 'txt',
        validate: async (bytes, name) => {
          if (!libraryPath(name, 'text')) throw Error(hostText('texts.invalidName'));
          const body = decodeLibraryText(bytes);
          let characters = 0,
            lines = 1;
          for (const character of body) {
            characters++;
            if (character === '\n') lines++;
          }
          return {
            width: 0,
            height: 0,
            thumbnail: '',
            circle: '',
            textPreview: body.slice(0, 800),
            characters,
            lines,
          };
        },
      },
      () => {
        this.changed();
        void this.index();
      },
      assistance,
    );
    this.host = new AssetLibraryHost(this.files, options);
  }
  get indexing() {
    return !!this.pendingIndex;
  }
  snippetEntries() {
    const files =
      this.options.settings.value.textLibrary?.groups.find((g) => g.id === snippetGroupId)?.files ??
      [];
    return files.flatMap((ref) => {
      const entry = this.files.entry(ref);
      return entry?.available && entry.generation ? [entry] : [];
    });
  }
  /** Incremental body index: unchanged generations are never reread during search. */
  index(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.indexRequested = true;
    if (this.pendingIndex) return this.pendingIndex;
    this.pendingIndex = Promise.resolve()
      .then(async () => {
        while (this.indexRequested && !this.closed) {
          this.indexRequested = false;
          const entries = this.files.list();
          const keys = new Set(entries.filter((e) => e.available).map((e) => libraryKey(e.ref)));
          for (const key of this.indexed.keys()) if (!keys.has(key)) this.indexed.delete(key);
          for (const entry of entries) {
            if (this.closed) return;
            if (
              !entry.available ||
              this.indexed.get(libraryKey(entry.ref))?.generation === entry.generation
            )
              continue;
            try {
              const result = await this.files.read(entry.ref, entry.generation, {
                active: () => !this.closed,
              });
              this.indexBody(entry.ref, result.generation, decodeLibraryText(result.bytes));
            } catch {
              /* The common catalogue exposes missing/invalid files; continue indexing others. */
            }
          }
          try {
            this.host.reconcileGroups();
          } catch {
            /* Retry when shared settings are writable. */
          }
        }
      })
      .finally(() => {
        this.pendingIndex = undefined;
        if (!this.closed) this.changed();
      });
    return this.pendingIndex;
  }
  private indexBody(ref: LibraryRef, generation: string, body: string) {
    const current = this.files.entry(ref);
    if (!this.closed && current?.available && current.generation === generation)
      this.indexed.set(libraryKey(ref), { generation, body: body.toLocaleLowerCase() });
  }
  matches(ref: LibraryRef, query: string) {
    const cached = this.indexed.get(libraryKey(ref));
    return (
      !!cached &&
      cached.generation === this.files.entry(ref)?.generation &&
      cached.body.includes(query)
    );
  }
  async document(ref: LibraryRef, generation?: string): Promise<LibraryTextDocument> {
    const result = await this.files.read(ref, generation);
    return { body: decodeLibraryText(result.bytes), generation: result.generation };
  }
  async create(folder: string, name: string, body: string) {
    this.options.writable();
    if (!libraryFolder(folder) || name.includes('/') || !libraryPath(name, 'text'))
      throw Error(hostText('texts.invalidName'));
    const file = folder ? `${folder}/${name}` : name;
    const bytes = encodeLibraryText(body);
    const result = await this.files.addVerified(bytes, file);
    if (result.reused) throw Error(hostText('texts.nameExists'));
    this.indexBody(result.ref, result.generation, decodeLibraryText(bytes));
    this.changed();
    return result.ref;
  }
  async save(ref: LibraryRef, generation: string, body: string) {
    this.options.writable();
    encodeLibraryText(body);
    const original = await this.files.read(ref, generation);
    const previous = decodeLibraryText(original.bytes);
    // Textareas normalize line endings. Keep original bytes on an unchanged save,
    // and retain an existing BOM / CRLF convention on actual edits.
    const normalized = body.replace(/\r\n/g, '\n');
    if (normalized === previous.replace(/\r\n/g, '\n')) {
      this.indexBody(ref, original.generation, previous);
      return;
    }
    const ending = previous.includes('\r\n') && !/(?<!\r)\n/.test(previous) ? '\r\n' : '\n';
    const bytes = encodeLibraryText(normalized.replace(/\n/g, ending));
    const next = original.bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))
      ? Buffer.concat([Buffer.from([239, 187, 191]), bytes])
      : bytes;
    const saved = await this.files.updateContent(ref, generation, next, this.options.writable);
    this.indexBody(ref, saved.generation, decodeLibraryText(saved.bytes));
    this.changed();
  }
  close() {
    this.closed = true;
    this.indexed.clear();
    this.files.stop();
    this.host.cancel();
  }
}
