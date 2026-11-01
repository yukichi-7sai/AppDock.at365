import { hostText } from '../../shared/i18n';
import { iconSets, importIconSet, type IconImportProgress } from './icon-set-import';
import { imageFolder } from '../../shared/image-paths';
import { randomUUID } from 'node:crypto';
import type { HostPageController } from './host-page-controller';
import type { HostPageAction } from '../../shared/host-pages';
import type {
  ImageLibraryPageModel,
  ImageLibraryPageRequest,
} from '../../shared/image-library-page';
import {
  imageKey,
  type ImageLibraryEdit,
  type ImageGroup,
  type RegisteredImageEntry,
  type RegisteredImageRef,
} from '../../shared/registered-images';
import { validGalleryWidth } from '../../shared/image-gallery';
import type { ImageLibraryHost } from './image-library-host';
import type { GalleryImages } from './gallery-images';
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
  sizeError: string;
  error = '';
  message = '';
  feedbackRevision = 0;
  busy = false;
  retry?: ImageLibraryEdit;
  closed = false;
  constructor(readonly store: GalleryViewStateStore) {
    this.width = store.get('library');
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
  readonly kind = 'image-library';
  readonly route = 'image-library';
  readonly id: string;
  private closed = false;
  private imageSession: ReturnType<GalleryImages['session']>;
  private revision = 0;
  private signature = '';
  private items = new Map<
    string,
    { id: string; assetId: string; generation: string; entry: RegisteredImageEntry }
  >();
  private groups = new Map<string, string>();
  private drag?: {
    token: string;
    images: { image: RegisteredImageRef; before: string[] }[];
    group?: ImageGroup;
  };
  constructor(
    request: ImageLibraryPageRequest,
    private options: {
      host: ImageLibraryHost;
      images: GalleryImages;
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
    this.imageSession = options.images.session();
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
    const s = this.options.state,
      groups = this.options.groups();
    const group = groups.find((g) => `group:${g.id}` === s.group);
    const members = new Set(groups.flatMap((g) => g.images.map(imageKey)));
    const ordered = group
      ? group.images.map((image) => [imageKey(image), this.items.get(imageKey(image))!] as const)
      : [...this.items];
    return ordered.filter(
      ([key, value]) =>
        (s.folder === '*' ||
          (s.folder === ''
            ? !value.entry.ref.file.includes('/')
            : value.entry.ref.file.startsWith(s.folder + '/'))) &&
        (s.group !== 'unfiled' || !members.has(key)) &&
        value.entry.ref.file.toLocaleLowerCase().includes(s.query.toLocaleLowerCase()),
    );
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
      iconSets: iconSets.map(({ id, name }) => ({ id, name })),
      importing: s.importing,
      folders: this.options.host.images.folders,
      folder: s.folder,
      groups: [
        { id: 'all', title: hostText('services.imageLibraryPage.all'), count: this.items.size },
        {
          id: 'unfiled',
          title: hostText('services.imageLibraryPage.ungrouped'),
          count: [...this.items.keys()].filter((k) => !membership.has(k)).length,
        },
        ...groups.map((g) => ({
          id: this.groups.get(g.id)!,
          title: g.name,
          count: g.images.length,
        })),
      ],
      group: this.groups.get(s.group.slice(6)) ?? s.group,
      query: s.query,
      items: matched.slice(0, s.count).map(([key, { id, assetId, entry: e }]) => ({
        id,
        assetId,
        title: e.ref.file,
        detail: e.width
          ? `${e.width} × ${e.height} · ${e.ref.file.split('.').at(-1)!.toUpperCase()}`
          : hostText('services.imageLibraryPage.dimensionsUnavailable'),
        labels: membership.get(key) ?? [],
        state: e.available ? 'ready' : (e.state ?? 'missing'),
        selected: s.selected.has(key),
        selectable: !s.busy,
        actions: [
          {
            id: 'membership',
            title: hostText('services.imageLibraryPage.group'),
            disabled: s.busy,
          },
          {
            id: 'delete-image',
            title: hostText('services.imageLibraryPage.delete'),
            disabled: !e.available || s.busy,
          },
        ],
      })),
      total: matched.length,
      remaining: Math.max(0, matched.length - s.count),
      selected: s.selected.size,
      cardWidth: s.width,
      sizeError: s.sizeError,
      error: s.error || this.options.host.images.error || '',
      message: s.message,
      busy: s.busy,
      anchor:
        s.anchor && this.items.has(s.anchor.key)
          ? { id: this.items.get(s.anchor.key)!.id, offset: s.anchor.offset }
          : undefined,
      viewRevision: s.viewRevision,
      canAddGroup: true,
      canOrder: groups.length > 1,
      canRetryMembership: !!s.retry,
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
    this.catalogue();
    if (
      !['image', 'anchor', 'width', 'more', 'drag-start', 'drop', 'reorder'].includes(
        action.command,
      )
    )
      this.drag = undefined;
    const resolveImage = (id: string) => {
      const result = [...this.items].find(([, value]) => value.id === id);
      if (!result) throw Error(hostText('services.imageLibraryPage.imageChanged'));
      return result;
    };
    const resolveGroup = (id: string) => {
      const group = [...this.groups].find(([, token]) => token === id)?.[0];
      if (!group) throw Error(hostText('services.imageLibraryPage.groupChanged'));
      return group;
    };
    if (action.command === 'image') {
      const value = [...this.items.values()].find((v) => v.assetId === action.assetId);
      if (!value?.entry.available || !value.entry.generation)
        throw Error(hostText('services.imageLibraryPage.missing'));
      const result = await this.imageSession.get(
        value.entry.ref,
        value.entry.generation,
        action.edge,
      );
      this.catalogue();
      if (this.closed || ![...this.items.values()].some((v) => v.assetId === action.assetId))
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
      if (!validGalleryWidth(action.value) || typeof action.commit !== 'boolean')
        throw Error('Invalid gallery size');
      s.width = action.value;
      if (action.commit) {
        try {
          s.store.save('library', s.width);
          s.sizeError = '';
        } catch (e) {
          s.sizeError = (e as Error).message;
          this.options.failed(hostText('services.imageLibraryPage.sizeSaveFailed'));
        }
      }
    } else if (action.command === 'cancel-import') {
      s.importAbort?.abort();
    } else if (action.command === 'import-set') {
      if (s.busy) throw Error(hostText('services.imageLibraryPage.busy'));
      s.busy = true;
      s.error = '';
      s.message = '';
      s.importAbort = new AbortController();
      const progressId = this.options.dialogs.openProgress(() => s.importAbort?.abort());
      this.options.changed();
      try {
        const result = await importIconSet({
          id: action.setId,
          images: this.options.host.images,
          signal: s.importAbort.signal,
          writable: () => this.options.host.assertWritable(),
          groups: (groups) => this.options.host.configuration.addImportedGroups(groups),
          progress: (value) => {
            s.importing = value;
            this.options.dialogs.progress(progressId, value);
          },
        });
        s.folder = result.folder;
        s.group = 'all';
        s.query = '';
        s.selected.clear();
        s.resetView();
        s.message = hostText('images.importDone', {
          added: String(result.added),
          reused: String(result.reused),
          failed: String(result.failed),
        });
        s.error = result.failures.join(', ');
      } catch (error) {
        if (s.importAbort.signal.aborted && error instanceof Error && error.name === 'AbortError')
          s.message = hostText('images.importCancelled');
        else {
          s.error = error instanceof Error ? error.message : hostText('images.downloadFailed');
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
        throw Error(hostText('images.folderInvalid'));
      s.folder = action.folder;
      s.selected.clear();
      s.resetView();
    } else if (action.command === 'folder-action') {
      if (s.busy) throw Error(hostText('services.imageLibraryPage.busy'));
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
        throw Error(hostText('services.imageLibraryPage.searchLimit'));
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
      if (s.busy) throw Error(hostText('services.imageLibraryPage.busy'));
      if (action.command === 'select') {
        if (typeof action.selected !== 'boolean') throw Error('Invalid selection');
        const [key] = resolveImage(action.imageId);
        if (!this.filtered().some(([k]) => k === key))
          throw Error(hostText('services.imageLibraryPage.notDisplayed'));
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
          if (!key) throw Error(hostText('services.imageLibraryPage.notDisplayed'));
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
          throw Error(hostText('services.imageLibraryPage.notDisplayed'));
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
          group: structuredClone(this.options.groups().find((g) => s.group === `group:${g.id}`)),
          images: keys.map((k) => ({
            image: this.items.get(k)!.entry.ref,
            before: membership.get(k) ?? [],
          })),
        };
        return { token: this.drag.token, count: this.drag.images.length };
      } else if (action.command === 'drop') {
        const feedbackRevision = s.feedbackRevision;
        const drag = this.drag;
        this.drag = undefined;
        if (!drag || drag.token !== action.token) throw Error('Stale gallery drag');
        const groupId = resolveGroup(action.groupId);
        if (drag.images.some(({ image }) => !this.items.has(imageKey(image))))
          throw Error(hostText('services.imageLibraryPage.imageChanged'));
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
            s.message = hostText('services.imageLibraryPage.dropSummary', { added: String(added) });
        } catch (e) {
          s.error =
            e instanceof Error ? e.message : hostText('services.imageLibraryPage.groupSaveFailed');
          this.options.failed(hostText('services.imageLibraryPage.groupSaveFailed'));
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
          throw Error(hostText('services.imageLibraryPage.selectGroup'));
        const [target] = resolveImage(action.imageId);
        if (
          !this.filtered()
            .slice(0, s.count)
            .some(([key]) => key === target)
        )
          throw Error(hostText('services.imageLibraryPage.notDisplayed'));
        const moved = new Set(drag.images.map(({ image }) => imageKey(image)));
        if (moved.has(target)) return;
        const remaining = before.images.filter((image) => !moved.has(imageKey(image)));
        const index = remaining.findIndex((image) => imageKey(image) === target);
        if (index < 0 || drag.images.some(({ image }) => !this.items.has(imageKey(image))))
          throw Error(hostText('services.imageLibraryPage.imageChanged'));
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
          s.message = hostText('services.imageLibraryPage.orderSaved');
      } else if (action.command === 'select-all')
        s.selected = new Set(this.filtered().map(([key]) => key));
      else if (action.command === 'clear') s.selected.clear();
      else if (action.command === 'add') await this.import();
      else if (action.command === 'retry-membership') {
        if (!s.retry) throw Error(hostText('services.imageLibraryPage.noRetry'));
        try {
          await this.options.host.edit(s.retry);
          s.retry = undefined;
          s.error = '';
        } catch (e) {
          s.error = (e as Error).message;
          this.options.failed(hostText('services.imageLibraryPage.groupSaveFailed'));
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
            'delete-image',
            'folder-create',
            'folder-rename',
            'folder-delete',
            'folder-move',
            'import-set',
          ].includes(action.kind)
        )
          throw Error('Unknown gallery dialog');
        const groupId = action.groupId ? resolveGroup(action.groupId) : undefined;
        const item = action.imageId ? resolveImage(action.imageId)[1] : undefined;
        if (['rename', 'delete', 'batch-remove', 'order-images'].includes(action.kind) && !groupId)
          throw Error(hostText('services.imageLibraryPage.selectGroup'));
        if (['membership', 'preview', 'delete-image'].includes(action.kind) && !item)
          throw Error(hostText('services.imageLibraryPage.selectImage'));
        if (['preview', 'delete-image'].includes(action.kind) && !item?.entry.available)
          throw Error(hostText('services.imageLibraryPage.unreadable'));
        if (action.kind === 'batch-remove' && s.group !== `group:${groupId}`)
          throw Error(hostText('services.imageLibraryPage.currentGroup'));
        const images = item
          ? [item.entry.ref]
          : [...s.selected].map((k) => this.items.get(k)!.entry.ref);
        if (action.kind.startsWith('batch') && !images.length)
          throw Error(hostText('services.imageLibraryPage.selectImage'));
        if (action.kind === 'folder-move' && !images.length)
          throw Error(hostText('services.imageLibraryPage.selectImage'));
        const folder = s.folder === '*' ? '' : s.folder;
        if (['folder-rename', 'folder-delete'].includes(action.kind) && !folder)
          throw Error(hostText('images.folderInvalid'));
        const operation = await this.options.dialogs.open({
          kind: action.kind,
          groups: this.options.groups(),
          images,
          folder,
          folders: this.options.host.images.folders,
          iconSets: iconSets.map(({ id, name }) => ({ id, name })),
          groupId,
          entry: item?.entry,
          deleteBlocked:
            action.kind === 'delete-image' && !!item && this.options.host.inUse(item.entry.ref),
        });
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
      s.message = hostText('services.imageLibraryPage.importSummary', {
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
          s.error = hostText('services.imageLibraryPage.groupAddError', { error: s.error });
          this.options.failed(hostText('services.imageLibraryPage.groupAddFailure'));
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
      s.error = e instanceof Error ? e.message : hostText('services.imageLibraryPage.addFailed');
      this.options.failed(hostText('services.imageLibraryPage.addFailedHint'));
    } finally {
      s.busy = false;
      this.options.changed();
    }
  }
  dispose() {
    this.closed = true;
    this.drag = undefined;
    this.imageSession.dispose();
    this.items.clear();
    this.options.dialogs.cancel();
  }
}
