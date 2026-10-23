import { hostText } from '../../shared/i18n';
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
  busy = false;
  retry?: ImageLibraryEdit;
  closed = false;
  constructor(readonly store: GalleryViewStateStore) {
    this.width = store.get('library');
    this.sizeError = store.error;
  }
  resetView() {
    this.count = 64;
    this.anchor = undefined;
    this.viewRevision++;
  }
}
export class ImageLibraryPageSession implements HostPageController {
  readonly kind = 'image-library';
  readonly route = 'image-library';
  readonly id: string;
  private closed = false;
  private revision = 0;
  private signature = '';
  private items = new Map<
    string,
    { id: string; assetId: string; generation: string; entry: RegisteredImageEntry }
  >();
  private groups = new Map<string, string>();
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
    if (!['all', 'unfiled'].includes(state.group) && !keys.has(state.group.slice(6))) {
      state.group = 'all';
      state.resetView();
    }
    const matches = this.filtered();
    const visible = new Set(matches.map(([key]) => key));
    for (const key of state.selected) if (!visible.has(key)) state.selected.delete(key);
    return matches;
  }
  private filtered() {
    const s = this.options.state,
      groups = this.options.groups();
    const members = new Set(
      (s.group === 'unfiled'
        ? groups.flatMap((g) => g.images)
        : (groups.find((g) => `group:${g.id}` === s.group)?.images ?? [])
      ).map(imageKey),
    );
    return [...this.items].filter(
      ([key, value]) =>
        (s.group === 'all' || (s.group === 'unfiled' ? !members.has(key) : members.has(key))) &&
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
      canAddGroup: groups.length < 64,
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
      const result = await this.options.images.get(
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
      await this.options.host.images.refresh();
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
            'membership',
            'batch-add',
            'batch-remove',
            'preview',
            'delete-image',
          ].includes(action.kind)
        )
          throw Error('Unknown gallery dialog');
        const groupId = action.groupId ? resolveGroup(action.groupId) : undefined;
        const item = action.imageId ? resolveImage(action.imageId)[1] : undefined;
        if (['rename', 'delete', 'batch-remove'].includes(action.kind) && !groupId)
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
        const operation = await this.options.dialogs.open({
          kind: action.kind,
          groups: this.options.groups(),
          images,
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
      } else throw Error('Unknown gallery action');
    }
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
      const results = await this.options.host.registerMany();
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
    this.options.dialogs.cancel();
  }
}
