import type { LibraryEntry } from '../../shared/library-assets';
import { libraryText } from '../../shared/library-text';
import type { LibrarySoundPreview } from './library-sound-preview';
import type { TextLibraryService } from './text-library-service';
import { snippetGroupId } from '../../shared/text-library';
import { filterImageBrowser } from '../../shared/image-browser';
import { hostText } from '../../shared/i18n';
import {
  iconSets,
  importIconSet,
  retryIconImport,
  type IconImportProgress,
  type IconImportRetry,
} from './icon-set-import';
import { imageBasename, imageFolder } from '../../shared/image-paths';
import { randomUUID } from 'node:crypto';
import type { HostPageController } from './host-page-controller';
import type { HostPageAction } from '../../shared/host-pages';
import type {
  ImageLibraryPageModel,
  ImageLibraryPageRequest,
} from '../../shared/image-library-page';
import { validImageLibraryLayout, type ImageLibraryLayout } from '../../shared/image-library-page';
import {
  imageKey,
  type ImageLibraryEdit,
  type ImageGroup,
  type RegisteredImageRef,
} from '../../shared/registered-images';
import { libraryGallerySize, validGalleryWidth } from '../../shared/image-gallery';
import type { ImageLibraryHost } from './image-library-host';
import type { GalleryImages } from './gallery-images';
import { LibraryReadCancelled } from './registered-assets';
import type { GalleryViewStateStore } from './gallery-view-state';
import type { ImageLibraryDialogs } from './image-library-dialogs';

/** Window-owned state survives navigation and provider recovery. Import jobs also live here. */
export class ImageLibraryPageState {
  folder = '*';
  importing?: IconImportProgress;
  importAbort?: AbortController;
  group = 'all';
  query = '';
  selected = new Set<string>();
  count = 64;
  anchor?: { key: string; offset: number };
  viewRevision = 0;
  width: number;
  layout: ImageLibraryLayout;
  sizeError: string;
  private errorValue = '';
  retryIconSet?: string;
  retryIcons?: IconImportRetry;
  get error() {
    return this.errorValue;
  }
  set error(value: string) {
    this.errorValue = value;
    this.retryIconSet = undefined;
    this.retryIcons = undefined;
  }
  private messageValue = '';
  messageRevision = 0;
  get message() {
    return this.messageValue;
  }
  set message(value: string) {
    this.messageValue = value;
    this.messageRevision++;
  }
  feedbackRevision = 0;
  busy = false;
  retry?: ImageLibraryEdit;
  closed = false;
  constructor(readonly store: GalleryViewStateStore) {
    this.width = store.get('library');
    this.layout = store.layout();
    this.sizeError = store.error;
  }
  resetView() {
    this.clearFeedback();
    this.count = 64;
    this.anchor = undefined;
    this.viewRevision++;
  }
  clearFeedback() {
    this.message = '';
    this.feedbackRevision++;
  }
}
export class ImageLibraryPageSession implements HostPageController {
  get kind(): 'image-library' | 'sound-library' | 'text-library' {
    return `${this.options.host.media}-library`;
  }
  get route() {
    return this.kind;
  }
  private text = (key: string, values?: Record<string, string | number>) =>
    libraryText(this.options.host.media, key, values);
  readonly id: string;
  private closed = false;
  private imageSession?: ReturnType<GalleryImages['session']>;
  private revision = 0;
  private signature = '';
  private items = new Map<
    string,
    { id: string; assetId: string; generation: string; entry: LibraryEntry }
  >();
  private groups = new Map<string, string>();
  private drag?: {
    token: string;
    entries: LibraryEntry[];
    images: { image: RegisteredImageRef; before: string[] }[];
    group?: ImageGroup;
  };
  constructor(
    request: ImageLibraryPageRequest,
    private options: {
      host: ImageLibraryHost;
      images?: Pick<GalleryImages, 'session'>;
      texts?: TextLibraryService;
      preview?: LibrarySoundPreview;
      state: ImageLibraryPageState;
      groups(): import('../../shared/registered-images').ImageGroup[];
      dialogs: ImageLibraryDialogs;
      dark(): boolean;
      changed(): void;
      failed(message: string): void;
    },
  ) {
    if (
      !request ||
      request.kind !== this.kind ||
      request.route !== this.route ||
      typeof request.id !== 'string' ||
      !request.id ||
      request.id.length > 100
    )
      throw Error('Invalid image library page request');
    this.id = request.id;
    this.imageSession = options.images?.session();
    void options.host.images.refresh().catch(() => {});
  }
  private catalogue() {
    const entries = new Map(this.options.host.images.list().map((e) => [imageKey(e.ref), e]));
    for (const group of this.options.groups())
      for (const ref of group.images)
        if (!entries.has(imageKey(ref)))
          entries.set(imageKey(ref), {
            ref,
            width: 0,
            height: 0,
            bytes: 0,
            thumbnail: '',
            available: false,
            state: 'missing',
          });
    const previous = this.items;
    this.items = new Map(
      [...entries]
        .sort((a, b) => a[1].ref.file.localeCompare(b[1].ref.file, 'ja'))
        .map(([key, entry]) => {
          const generation = `${entry.generation ?? ''}:${entry.available}:${entry.state}`;
          const old = previous.get(key);
          return [
            key,
            {
              id: old?.id ?? randomUUID(),
              assetId: old?.generation === generation ? old.assetId : randomUUID(),
              generation,
              entry,
            },
          ];
        }),
    );
    const groups = this.options.groups(),
      keys = new Set(groups.map((g) => g.id));
    for (const id of this.groups.keys()) if (!keys.has(id)) this.groups.delete(id);
    for (const group of groups)
      if (!this.groups.has(group.id)) this.groups.set(group.id, randomUUID());
    const state = this.options.state;
    if (state.folder !== '*' && !this.options.host.images.folders.includes(state.folder)) {
      state.folder = '*';
      state.resetView();
    }
    if (!['all', 'unfiled'].includes(state.group) && !keys.has(state.group.slice(6))) {
      state.group = 'all';
      state.resetView();
    }
    const matches = this.filtered();
    const visible = new Set(matches.map(([key]) => key));
    const selectedCount = state.selected.size;
    for (const key of state.selected) if (!visible.has(key)) state.selected.delete(key);
    if (state.selected.size !== selectedCount) state.clearFeedback();
    return matches;
  }
  private filtered() {
    return filterImageBrowser(
      [...this.items.values()].map((item) => item.entry.ref),
      this.options.groups(),
      this.options.state,
      this.options.texts ? (ref, query) => this.options.texts!.matches(ref, query) : undefined,
    ).map((ref) => [imageKey(ref), this.items.get(imageKey(ref))!] as const);
  }
  passive(action: HostPageAction) {
    // Scrolling can report its last frame after a host dialog has blocked page input.
    return (
      !!action &&
      action.type === 'gallery' &&
      (action.command === 'image' || action.command === 'anchor')
    );
  }
  snapshot(): ImageLibraryPageModel {
    const matched = this.catalogue(),
      s = this.options.state,
      groups = this.options.groups();
    const membership = new Map<string, string[]>();
    for (const g of groups)
      for (const ref of g.images) {
        const key = imageKey(ref);
        membership.set(key, [...(membership.get(key) ?? []), g.name]);
      }
    const content: ImageLibraryPageModel['content'] = {
      playback: this.options.preview?.snapshot(),
      indexing: this.options.texts?.indexing,
      iconSets:
        this.options.host.media === 'image' ? iconSets.map(({ id, name }) => ({ id, name })) : [],
      importing: s.importing,
      folders: this.options.host.images.folders,
      folder: s.folder,
      groups: [
        { id: 'all', title: this.text('services.imageLibraryPage.all'), count: this.items.size },
        {
          id: 'unfiled',
          title: this.text('services.imageLibraryPage.ungrouped'),
          count: [...this.items.keys()].filter((k) => !membership.has(k)).length,
        },
        ...groups.map((g) => ({
          id: this.groups.get(g.id)!,
          ...(this.options.texts && g.id === snippetGroupId ? { fixed: true } : {}),
          title: g.name,
          count: g.images.length,
        })),
      ],
      group: this.groups.get(s.group.slice(6)) ?? s.group,
      query: s.query,
      items: matched.slice(0, s.count).map(([key, { id, assetId, entry: e }]) => ({
        id,
        assetId: this.options.texts ? '' : assetId,
        textPreview: this.options.texts ? e.textPreview || hostText('texts.emptyBody') : undefined,
        title: e.ref.file,
        detail: this.options.texts
          ? e.characters === undefined
            ? 'TXT'
            : hostText('texts.details', { characters: e.characters, lines: e.lines ?? 1 })
          : this.options.host.media === 'sound'
            ? e.durationMs === undefined
              ? 'WAV'
              : `${Math.floor(Math.round(e.durationMs / 1000) / 60)}:${String(Math.round(e.durationMs / 1000) % 60).padStart(2, '0')} · WAV`
            : e.width
              ? `${e.width} × ${e.height} · ${e.ref.file.split('.').at(-1)!.toUpperCase()}`
              : this.text('services.imageLibraryPage.dimensionsUnavailable'),
        labels: membership.get(key) ?? [],
        state: e.available
          ? this.options.texts && e.textPreview === undefined
            ? 'loading'
            : 'ready'
          : (e.state ?? 'missing'),
        selected: s.selected.has(key),
        selectable: !s.busy,
        actions: [],
      })),
      total: matched.length,
      remaining: Math.max(0, matched.length - s.count),
      selected: s.selected.size,
      cardWidth: s.width,
      layout: s.layout,
      sizeError: s.sizeError,
      error: s.error || this.options.preview?.error || this.options.host.images.error || '',
      message: s.message,
      messageRevision: s.messageRevision,
      busy: s.busy,
      anchor:
        s.anchor && this.items.has(s.anchor.key)
          ? { id: this.items.get(s.anchor.key)!.id, offset: s.anchor.offset }
          : undefined,
      viewRevision: s.viewRevision,
      canAddGroup: true,
      canOrder: groups.length > (this.options.texts ? 2 : 1),
      canRetryMembership: !!s.retry,
      canRetryIconImport: !!s.retryIconSet,
    };
    const dark = this.options.dark(),
      signature = JSON.stringify([dark, content]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.revision++;
    }
    return {
      schemaVersion: 1,
      id: this.id,
      contextId: 'primary',
      kind: this.kind,
      revision: this.revision,
      dark,
      content,
    };
  }
  async act(action: HostPageAction) {
    if (this.closed || !action || action.id !== this.id || action.type !== 'gallery')
      throw Error('Stale gallery action');
    const s = this.options.state;
    if (action.command === 'stop-playback') {
      this.options.preview?.stop(this.id);
      return;
    }
    if (
      this.options.host.media !== 'image' &&
      ['import-set', 'retry-import', 'cancel-import'].includes(action.command)
    )
      throw Error('Unsupported library action');
    this.catalogue();
    if (
      ![
        'image',
        'anchor',
        'width',
        'layout',
        'more',
        'drag-start',
        'drop',
        'drop-folder',
        'reorder',
      ].includes(action.command)
    )
      this.drag = undefined;
    const resolveImage = (id: string) => {
      const result = [...this.items].find(([, value]) => value.id === id);
      if (!result) throw Error(this.text('services.imageLibraryPage.imageChanged'));
      return result;
    };
    const resolveGroup = (id: string) => {
      const group = [...this.groups].find(([, token]) => token === id)?.[0];
      if (!group) throw Error(this.text('services.imageLibraryPage.groupChanged'));
      return group;
    };
    const targets = (imageId?: string) => {
      if (imageId) {
        const [key] = resolveImage(imageId);
        if (!this.filtered().some(([id]) => id === key))
          throw Error(this.text('services.imageLibraryPage.imageChanged'));
        if (!s.selected.has(key)) s.selected = new Set([key]);
      }
      return this.filtered()
        .filter(([key]) => s.selected.has(key))
        .map(([, value]) => value.entry);
    };
    if (action.command === 'image') {
      if (!this.imageSession) throw Error('Unsupported library action');
      const value = [...this.items.values()].find((v) => v.assetId === action.assetId);
      if (!value?.entry.available || !value.entry.generation)
        throw Error(this.text('services.imageLibraryPage.missing'));
      const result = await this.imageSession.get(
        value.entry.ref,
        value.entry.generation,
        action.edge,
      );
      if (this.closed) throw new LibraryReadCancelled('Stale image');
      this.catalogue();
      if (![...this.items.values()].some((v) => v.assetId === action.assetId))
        throw Error('Stale image');
      return result;
    }
    if (action.command === 'anchor') {
      if (action.anchor) {
        if (!Number.isFinite(action.anchor.offset) || Math.abs(action.anchor.offset) > 10000)
          throw Error('Invalid anchor');
        s.anchor = { key: resolveImage(action.anchor.id)[0], offset: action.anchor.offset };
      } else s.anchor = undefined;
      return;
    }
    if (action.command === 'width') {
      if (
        !validGalleryWidth(action.value, libraryGallerySize) ||
        typeof action.commit !== 'boolean'
      )
        throw Error('Invalid gallery size');
      s.width = action.value;
      if (action.commit) {
        try {
          s.store.save('library', s.width);
          s.sizeError = '';
        } catch (e) {
          s.sizeError = (e as Error).message;
          this.options.failed(this.text('services.imageLibraryPage.sizeSaveFailed'));
        }
      }
    } else if (action.command === 'layout') {
      if (!validImageLibraryLayout(action.value)) throw Error('Invalid gallery layout');
      s.layout = structuredClone(action.value);
      try {
        s.store.saveLayout(s.layout);
        s.sizeError = '';
      } catch (e) {
        s.sizeError = (e as Error).message;
        this.options.failed(this.text('services.imageLibraryPage.sizeSaveFailed'));
      }
    } else if (action.command === 'select-target') {
      if (s.busy) throw Error(this.text('services.imageLibraryPage.busy'));
      targets(action.imageId);
    } else if (action.command === 'file-action' || action.command === 'open-folder') {
      if (s.busy) throw Error(this.text('services.imageLibraryPage.busy'));
      const entries = action.command === 'file-action' ? targets(action.imageId) : [];
      s.busy = true;
      s.error = '';
      this.options.changed();
      try {
        if (action.command === 'open-folder')
          await this.options.host.openFolder(action.folder ?? (s.folder === '*' ? '' : s.folder));
        else {
          await this.options.host.fileAction(action.operation, entries);
          s.message = this.text(
            action.operation === 'reveal' ? 'images.revealed' : 'images.copied',
            { count: entries.length },
          );
        }
      } catch (e) {
        s.error = (e as Error).message;
        this.options.failed(s.error);
      } finally {
        s.busy = false;
      }
    } else if (action.command === 'cancel-import') {
      s.importAbort?.abort();
    } else if (action.command === 'retry-import' || action.command === 'import-set') {
      if (s.busy) throw Error(this.text('services.imageLibraryPage.busy'));
      const setId = action.command === 'import-set' ? action.setId : s.retryIconSet;
      const retry = action.command === 'retry-import' ? s.retryIcons : undefined;
      if (!setId) throw Error(this.text('services.imageLibraryPage.noRetry'));
      if (!iconSets.some((set) => set.id === setId)) throw Error(this.text('images.setUnknown'));
      s.busy = true;
      s.error = '';
      s.message = '';
      s.importAbort = new AbortController();
      const progressId = this.options.dialogs.openProgress(() => s.importAbort?.abort());
      this.options.changed();
      let retryIcons = retry;
      try {
        const options = {
          id: setId,
          images: this.options.host.images,
          signal: s.importAbort.signal,
          writable: () => this.options.host.assertWritable(),
          groups: (groups: ImageGroup[]) =>
            this.options.host.configuration.addImportedGroups(groups),
          retry: (value: IconImportRetry | undefined) => {
            retryIcons = value;
          },
          progress: (value: IconImportProgress) => {
            s.importing = value;
            this.options.dialogs.progress(progressId, value);
          },
        };
        const result = retry ? await retryIconImport(options, retry) : await importIconSet(options);
        s.folder = result.folder;
        s.group = 'all';
        s.query = '';
        s.selected.clear();
        s.resetView();
        s.message = this.text('images.importDone', {
          added: String(result.added),
          reused: String(result.reused),
          failed: String(result.failed),
        });
        s.error = result.failures.join(', ');
        if (result.failed) {
          s.retryIconSet = setId;
          s.retryIcons = retryIcons;
        }
      } catch (error) {
        if (s.importAbort.signal.aborted && error instanceof Error && error.name === 'AbortError')
          s.message = this.text('images.importCancelled');
        else {
          s.error = error instanceof Error ? error.message : this.text('images.downloadFailed');
          s.retryIconSet = setId;
          s.retryIcons = retryIcons;
          this.options.failed(s.error);
        }
      } finally {
        s.busy = false;
        s.importing = undefined;
        s.importAbort = undefined;
        this.options.dialogs.closeProgress(progressId);
        this.options.changed();
      }
    } else if (action.command === 'folder') {
      if (
        action.folder !== '*' &&
        (!imageFolder(action.folder) || !this.options.host.images.folders.includes(action.folder))
      )
        throw Error(this.text('images.folderInvalid'));
      s.folder = action.folder;
      s.selected.clear();
      s.resetView();
    } else if (action.command === 'folder-action') {
      if (s.busy) throw Error(this.text('services.imageLibraryPage.busy'));
      const images = [...s.selected].map((key) => this.items.get(key)!.entry.ref);
      s.busy = true;
      s.error = '';
      this.options.changed();
      try {
        await this.options.host.folderOperation(
          action.operation,
          action.folder,
          action.destination,
          images,
        );
        s.folder =
          action.operation === 'delete'
            ? '*'
            : action.operation === 'move-images'
              ? action.folder
              : action.destination!;
        s.selected.clear();
        s.resetView();
      } finally {
        s.busy = false;
        this.options.changed();
      }
    } else if (action.command === 'query') {
      if (typeof action.value !== 'string' || action.value.length > 260)
        throw Error(this.text('services.imageLibraryPage.searchLimit'));
      s.query = action.value;
      s.selected.clear();
      s.resetView();
    } else if (action.command === 'group') {
      s.group = ['all', 'unfiled'].includes(action.groupId)
        ? action.groupId
        : `group:${resolveGroup(action.groupId)}`;
      s.selected.clear();
      s.resetView();
    } else if (action.command === 'more') s.count += 64;
    else if (action.command === 'reload') {
      await this.options.host.images.refresh(true);
      s.error = '';
      for (const item of this.items.values()) item.assetId = randomUUID();
    } else {
      if (s.busy) throw Error(this.text('services.imageLibraryPage.busy'));
      if (action.command === 'select') {
        if (typeof action.selected !== 'boolean') throw Error('Invalid selection');
        const [key] = resolveImage(action.imageId);
        if (!this.filtered().some(([k]) => k === key))
          throw Error(this.text('services.imageLibraryPage.notDisplayed'));
        if (action.selected) s.selected.add(key);
        else s.selected.delete(key);
      } else if (action.command === 'select-range') {
        if (!Array.isArray(action.imageIds) || typeof action.additive !== 'boolean')
          throw Error('Invalid selection');
        const displayed = new Map(
          this.filtered()
            .slice(0, s.count)
            .map(([key, item]) => [item.id, key]),
        );
        const keys = action.imageIds.map((id) => {
          const key = displayed.get(id);
          if (!key) throw Error(this.text('services.imageLibraryPage.notDisplayed'));
          return key;
        });
        s.selected = new Set([...(action.additive ? s.selected : []), ...keys]);
      } else if (action.command === 'drag-start') {
        this.drag = undefined;
        const [key] = resolveImage(action.imageId);
        if (
          !this.filtered()
            .slice(0, s.count)
            .some(([k]) => k === key)
        )
          throw Error(this.text('services.imageLibraryPage.notDisplayed'));
        const keys = s.selected.has(key)
          ? this.filtered()
              .filter(([k]) => s.selected.has(k))
              .map(([k]) => k)
          : [key];
        const membership = new Map<string, string[]>();
        for (const group of this.options.groups())
          for (const image of group.images) {
            const k = imageKey(image);
            membership.set(k, [...(membership.get(k) ?? []), group.id]);
          }
        this.drag = {
          token: randomUUID(),
          entries: keys.map((k) => structuredClone(this.items.get(k)!.entry)),
          group: structuredClone(this.options.groups().find((g) => s.group === `group:${g.id}`)),
          images: keys.map((k) => ({
            image: this.items.get(k)!.entry.ref,
            before: membership.get(k) ?? [],
          })),
        };
        return { token: this.drag.token, count: this.drag.images.length };
      } else if (action.command === 'drop-folder') {
        const drag = this.drag;
        this.drag = undefined;
        if (!drag || drag.token !== action.token) throw Error('Stale gallery drag');
        if (
          !imageFolder(action.folder) ||
          !this.options.host.images.folders.includes(action.folder)
        )
          throw Error(this.text('images.folderInvalid'));
        const selected = [...s.selected];
        const view = s.viewRevision;
        s.busy = true;
        s.error = '';
        s.message = '';
        this.options.changed();
        try {
          const moved = await this.options.host.rename(
            drag.entries,
            drag.entries.map((entry) => imageBasename(entry.ref.file)),
            action.folder,
          );
          if (!this.closed && s.viewRevision === view) {
            const mapping = new Map(
              drag.entries.map((entry, i) => [imageKey(entry.ref), imageKey(moved[i])]),
            );
            s.selected = new Set(selected.map((key) => mapping.get(key) ?? key));
            this.catalogue();
            s.message = this.text('images.movedToFolder', {
              count: moved.length,
              folder: action.folder || this.text('images.rootFolder'),
            });
          }
        } catch (e) {
          s.error = (e as Error).message;
          this.options.failed(s.error);
          throw e;
        } finally {
          s.busy = false;
          this.options.changed();
        }
      } else if (action.command === 'drop') {
        const feedbackRevision = s.feedbackRevision;
        const drag = this.drag;
        this.drag = undefined;
        if (!drag || drag.token !== action.token) throw Error('Stale gallery drag');
        const groupId = resolveGroup(action.groupId);
        if (drag.images.some(({ image }) => !this.items.has(imageKey(image))))
          throw Error(this.text('services.imageLibraryPage.imageChanged'));
        const added = drag.images.filter((image) => !image.before.includes(groupId)).length;
        try {
          await this.options.host.edit({
            kind: 'membership-batch',
            mode: 'add',
            groupId,
            images: drag.images,
          });
          s.error = '';
          if (s.feedbackRevision === feedbackRevision)
            s.message = this.text('services.imageLibraryPage.dropSummary', {
              added: String(added),
            });
        } catch (e) {
          s.error =
            e instanceof Error ? e.message : this.text('services.imageLibraryPage.groupSaveFailed');
          this.options.failed(this.text('services.imageLibraryPage.groupSaveFailed'));
          this.options.changed();
          throw e;
        }
      } else if (action.command === 'reorder') {
        const feedbackRevision = s.feedbackRevision;
        const drag = this.drag;
        this.drag = undefined;
        if (!drag || drag.token !== action.token) throw Error('Stale gallery drag');
        const before = drag.group;
        if (!before || s.group !== `group:${before.id}` || typeof action.after !== 'boolean')
          throw Error(this.text('services.imageLibraryPage.selectGroup'));
        const [target] = resolveImage(action.imageId);
        if (
          !this.filtered()
            .slice(0, s.count)
            .some(([key]) => key === target)
        )
          throw Error(this.text('services.imageLibraryPage.notDisplayed'));
        const moved = new Set(drag.images.map(({ image }) => imageKey(image)));
        if (moved.has(target)) return;
        const remaining = before.images.filter((image) => !moved.has(imageKey(image)));
        const index = remaining.findIndex((image) => imageKey(image) === target);
        if (index < 0 || drag.images.some(({ image }) => !this.items.has(imageKey(image))))
          throw Error(this.text('services.imageLibraryPage.imageChanged'));
        const insertion = index + Number(action.after);
        const images = [
          ...remaining.slice(0, insertion),
          ...before.images.filter((image) => moved.has(imageKey(image))),
          ...remaining.slice(insertion),
        ];
        await this.options.host.edit({
          kind: 'update',
          before,
          group: { ...before, images },
        });
        s.error = '';
        if (s.feedbackRevision === feedbackRevision)
          s.message = this.text('services.imageLibraryPage.orderSaved');
      } else if (action.command === 'select-all')
        s.selected = new Set(this.filtered().map(([key]) => key));
      else if (action.command === 'clear') s.selected.clear();
      else if (action.command === 'add') await this.import();
      else if (action.command === 'retry-membership') {
        if (!s.retry) throw Error(this.text('services.imageLibraryPage.noRetry'));
        try {
          await this.options.host.edit(s.retry);
          s.retry = undefined;
          s.error = '';
        } catch (e) {
          s.error = (e as Error).message;
          this.options.failed(this.text('services.imageLibraryPage.groupSaveFailed'));
        }
      } else if (action.command === 'dialog') {
        if (
          ![
            'add',
            'rename',
            'delete',
            'order',
            'order-images',
            'membership',
            'batch-add',
            'batch-remove',
            'preview',
            'rename-images',
            'delete-image',
            'folder-create',
            'folder-rename',
            'folder-delete',
            'folder-move',
            'import-set',
            'text-create',
            'text-duplicate',
            'text-edit',
            'text-preview',
          ].includes(action.kind)
        )
          throw Error('Unknown gallery dialog');
        const groupId = action.groupId ? resolveGroup(action.groupId) : undefined;
        if (
          this.options.texts &&
          groupId === snippetGroupId &&
          ['rename', 'delete'].includes(action.kind)
        )
          throw Error(this.text('services.sharedRegisteredImages.invalidOperation'));
        const item = action.imageId ? resolveImage(action.imageId)[1] : undefined;
        if (['rename', 'delete', 'order-images'].includes(action.kind) && !groupId)
          throw Error(this.text('services.imageLibraryPage.selectGroup'));
        const entries = targets(action.imageId);
        const images = entries.map((entry) => entry.ref);
        if (
          [
            'membership',
            'preview',
            'delete-image',
            'rename-images',
            'batch-add',
            'batch-remove',
          ].includes(action.kind) &&
          !images.length
        )
          throw Error(this.text('services.imageLibraryPage.selectImage'));
        if (
          ['delete-image', 'rename-images'].includes(action.kind) &&
          entries.some((entry) => !entry.available)
        )
          throw Error(this.text('services.imageLibraryPage.unreadable'));
        if (action.kind === 'folder-move' && !images.length)
          throw Error(this.text('services.imageLibraryPage.selectImage'));
        const folder = action.folder ?? (s.folder === '*' ? '' : s.folder);
        if (!imageFolder(folder) || !(this.options.host.images.folders ?? ['']).includes(folder))
          throw Error(this.text('images.folderInvalid'));
        if (['folder-rename', 'folder-delete'].includes(action.kind) && !folder)
          throw Error(this.text('images.folderInvalid'));
        if (this.options.preview && action.kind === 'preview') {
          const target = item?.entry ?? (entries.length === 1 ? entries[0] : undefined);
          if (!target) throw Error(this.text('sounds.selectOne'));
          await this.options.preview.play(target.ref, this.id);
          return;
        }
        if (this.options.host.media !== 'image' && action.kind === 'import-set')
          throw Error('Unsupported library action');
        if (action.kind.startsWith('text-') && !this.options.texts)
          throw Error('Unsupported library action');
        const kind =
          action.kind === 'text-duplicate'
            ? 'text-create'
            : this.options.texts && action.kind === 'preview'
              ? 'text-preview'
              : action.kind;
        const needsDocument =
          ['text-edit', 'text-preview'].includes(kind) || action.kind === 'text-duplicate';
        if (needsDocument && entries.length !== 1) throw Error(hostText('texts.selectOne'));
        const document =
          this.options.texts && needsDocument
            ? await this.options.texts.document(entries[0].ref, entries[0].generation)
            : undefined;
        if (this.closed || s.closed) return;
        const operation = await this.options.dialogs.open({
          media: this.options.host.media,
          kind: kind === 'membership' && images.length > 1 ? 'batch-add' : kind,
          document,
          groups: this.options.groups(),
          images,
          folder,
          folders: this.options.host.images.folders,
          iconSets:
            this.options.host.media === 'image'
              ? iconSets.map(({ id, name }) => ({ id, name }))
              : [],
          groupId:
            groupId ??
            (action.kind === 'batch-remove' && s.group.startsWith('group:')
              ? s.group.slice(6)
              : undefined),
          entry: item?.entry ?? entries[0],
          entries,
          deleteBlocked:
            ['delete-image', 'rename-images'].includes(action.kind) &&
            entries.some((entry) => this.options.host.inUse(entry.ref)),
        });
        if (operation?.kind === 'text-save' && kind === 'text-create') {
          const ref = { file: folder ? `${folder}/${operation.name}` : operation.name };
          if (s.group.startsWith('group:')) {
            const edit: ImageLibraryEdit = {
              kind: 'membership-batch',
              mode: 'add',
              groupId: s.group.slice(6),
              images: [{ image: ref, before: [] }],
            };
            try {
              await this.options.host.edit(edit);
            } catch {
              s.retry = edit;
              s.error = this.text('services.imageLibraryPage.groupAddFailure');
              s.group = 'all';
              this.options.failed(s.error);
            }
          } else if (s.group === 'unfiled') s.group = 'all';
          s.query = '';
          this.catalogue();
          s.selected = new Set([imageKey(ref)]);
          const first = this.filtered().findIndex(([key]) => key === imageKey(ref));
          s.count = Math.max(64, (Math.floor(first / 64) + 1) * 64);
          s.anchor = { key: imageKey(ref), offset: 0 };
          s.viewRevision++;
        }
        if (operation?.kind === 'rename-images') {
          const renamed = images.map((ref, i) => ({
            file: ref.file.slice(0, ref.file.lastIndexOf('/') + 1) + operation.names[i],
          }));
          s.selected = new Set(renamed.map(imageKey));
        }
        if (operation?.kind === 'add') {
          s.group = `group:${operation.group.id}`;
          s.selected.clear();
          s.resetView();
        }
        if (operation?.kind === 'folder') {
          s.folder = action.kind === 'folder-delete' ? '*' : operation.destination;
          s.selected.clear();
          s.resetView();
        }
        if (operation?.kind === 'import-set')
          await this.act({
            id: this.id,
            type: 'gallery',
            command: 'import-set',
            setId: operation.setId,
          });
      } else throw Error('Unknown gallery action');
    }
    if (['select', 'select-range', 'select-all', 'clear'].includes(action.command))
      s.clearFeedback();
    this.options.changed();
  }
  private async import() {
    const s = this.options.state,
      group = s.group,
      groupId = s.group.slice(6);
    s.busy = true;
    s.error = '';
    s.message = '';
    s.retry = undefined;
    this.options.changed();
    try {
      const results = await this.options.host.registerMany(s.folder === '*' ? '' : s.folder);
      const successes = results.flatMap((r) => (r.image ? [r.image] : []));
      if (!results.length || s.closed) return;
      s.message = this.text('services.imageLibraryPage.importSummary', {
        added: String(results.filter((r) => r.image && !r.reused).length),
        reused: String(results.filter((r) => r.image && r.reused).length),
        failed: String(results.filter((r) => r.error).length),
      });
      s.error = results
        .filter((r) => r.error)
        .map((r) => `${r.name}: ${r.error}`)
        .join('\n');
      if (successes.length && group.startsWith('group:')) {
        const groups = this.options.groups();
        const operation: ImageLibraryEdit = {
          kind: 'membership-batch',
          mode: 'add',
          groupId,
          images: [...new Map(successes.map((image) => [imageKey(image), image])).values()].map(
            (image) => ({
              image,
              before: groups
                .filter((g) => g.images.some((i) => imageKey(i) === imageKey(image)))
                .map((g) => g.id),
            }),
          ),
        };
        try {
          await this.options.host.edit(operation);
        } catch {
          s.retry = operation;
          s.error = this.text('services.imageLibraryPage.groupAddError', { error: s.error });
          this.options.failed(this.text('services.imageLibraryPage.groupAddFailure'));
        }
      }
      if (successes.length) {
        s.query = '';
        s.group = group;
        this.catalogue();
        if (successes.some((ref) => !this.filtered().some(([key]) => key === imageKey(ref))))
          s.group = 'all';
        const unique = new Set(successes.map(imageKey));
        s.selected = unique;
        const matches = this.filtered(),
          first = matches.findIndex(([key]) => unique.has(key));
        s.count = Math.max(64, (Math.floor(first / 64) + 1) * 64);
        s.anchor = { key: matches[first][0], offset: 0 };
        s.viewRevision++;
      }
    } catch (e) {
      s.error = e instanceof Error ? e.message : this.text('services.imageLibraryPage.addFailed');
      this.options.failed(this.text('services.imageLibraryPage.addFailedHint'));
    } finally {
      s.busy = false;
      this.options.changed();
    }
  }
  dispose() {
    this.closed = true;
    this.drag = undefined;
    this.imageSession?.dispose();
    this.options.preview?.stop(this.id);
    this.items.clear();
    this.options.dialogs.cancel();
  }
}
