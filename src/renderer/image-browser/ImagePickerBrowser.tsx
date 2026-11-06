import { libraryText } from '../../shared/library-text';
import { useLibraryMedia, soundDuration } from './LibraryMedia';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { assignedImage } from '../../shared/image-paths';
import {
  imageKey,
  type ImageLibrarySnapshot,
  type RegisteredImageEntry,
  type RegisteredImageRef,
} from '../../shared/registered-images';
import type { ImageLibraryLayout } from '../../shared/image-library-page';
import { filterImageBrowser } from '../../shared/image-browser';
import {
  libraryGallerySize,
  mountImageGallery,
  mountGallerySizeControl,
  type GalleryModel,
} from '../image-gallery';
import { useLibraryTranslation } from './LibraryMedia';
import { Icon } from '../../shared/ui-icons';
import { ImageBrowserNavigation } from './ImageBrowserNavigation';
import {
  ImageBrowserFilters,
  ImageBrowserSplitter,
  useImageBrowserNavigation,
} from './ImageBrowserControls';
import '../image-gallery/gallery.css';
import './image-browser.css';

export function ImagePickerBrowser({
  snapshot,
  selected,
  selectedImages,
  reveal,
  onSelect,
  folder,
  onFolder,
  group,
  onGroup,
  query,
  onQuery,
  cardWidth,
  onWidth,
  onSaveWidth,
  layout,
  onLayout,
  onSaveLayout,
  disabled,
  onPreview,
  image,
  onReload,
}: {
  snapshot: ImageLibrarySnapshot;
  selected: RegisteredImageRef | null;
  selectedImages?: RegisteredImageRef[];
  reveal: RegisteredImageRef | null;
  onSelect(ref: RegisteredImageRef): void;
  folder: string;
  onFolder(value: string): void;
  group: string;
  onGroup(value: string): void;
  query: string;
  onQuery(value: string): void;
  cardWidth: number;
  onWidth(value: number): void;
  onSaveWidth(value: number): void;
  layout: ImageLibraryLayout;
  onLayout(value: ImageLibraryLayout): void;
  onSaveLayout(value: ImageLibraryLayout): void;
  disabled: boolean;
  onPreview(entry: RegisteredImageEntry): void;
  image(ref: RegisteredImageRef, generation: string, edge: number): Promise<string>;
  onReload(): void;
}) {
  const { t } = useLibraryTranslation();
  const media = useLibraryMedia();
  const root = useRef<HTMLDivElement>(null),
    sidebar = useRef<HTMLElement>(null),
    navigationButton = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null),
    grid = useRef<HTMLDivElement>(null),
    size = useRef<HTMLDivElement>(null),
    sentinel = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const dragging = useRef(false);
  const revealed = useRef<RegisteredImageRef | null>(null);
  const filters = useRef<HTMLDivElement>(null);
  const [queryInput, setQueryInput] = useState(query);
  useEffect(() => setQueryInput(query), [query]);
  const key = JSON.stringify([folder, group, query]);
  const [page, setPage] = useState({ key, limit: 64 });
  const limit = page.key === key ? page.limit : 64;
  const entries = useMemo(() => {
    const entries = new Map(snapshot.images.map((entry) => [imageKey(entry.ref), entry]));
    const include = (ref: RegisteredImageRef) => {
      if (!entries.has(imageKey(ref)))
        entries.set(imageKey(ref), {
          ref,
          width: 0,
          height: 0,
          bytes: 0,
          thumbnail: '',
          available: false,
        });
    };
    snapshot.groups.forEach((g) => g.images.forEach(include));
    if (selected && !assignedImage(selected.file)) include(selected);
    selectedImages?.forEach(include);
    return entries;
  }, [snapshot, selected, selectedImages]);
  const refs = useMemo(() => [...entries.values()].map((e) => e.ref), [entries]);
  const filtered = useMemo(
    () => filterImageBrowser(refs, snapshot.groups, { folder, group, query }),
    [refs, snapshot.groups, folder, group, query],
  );
  const memberships = useMemo(() => {
    const names = new Map<string, string[]>();
    for (const g of snapshot.groups)
      for (const ref of g.images) {
        const key = imageKey(ref),
          labels = names.get(key) ?? [];
        labels.push(g.name);
        names.set(key, labels);
      }
    return names;
  }, [snapshot.groups]);
  const groups = [
    { id: 'all', title: t('settings.registeredImagePicker.all'), count: entries.size },
    {
      id: 'unfiled',
      title: t('settings.registeredImagePicker.ungrouped'),
      count: refs.filter((ref) => !memberships.has(imageKey(ref))).length,
    },
    ...snapshot.groups.map((g) => ({ id: `group:${g.id}`, title: g.name, count: g.images.length })),
  ];
  const model: GalleryModel = {
    cardWidth,
    fit: 'contain',
    selection: selectedImages ? 'multiple' : 'single',
    empty: t('settings.registeredImagePicker.noMatches'),
    items: filtered.slice(0, limit).map((ref) => {
      const entry = entries.get(imageKey(ref))!;
      return {
        id: imageKey(ref),
        assetId: `${imageKey(ref)}:${entry.generation ?? ''}`,
        title: ref.file,
        detail:
          media === 'sound'
            ? soundDuration(entry.durationMs, entry.ref.file)
            : entry.width > 0
              ? `${entry.width} × ${entry.height}`
              : t('services.imageLibraryPage.dimensionsUnavailable'),
        labels: memberships.get(imageKey(ref)) ?? [],
        state: entry.available ? 'ready' : (entry.state ?? 'missing'),
        selected: selectedImages
          ? selectedImages.some((image) => imageKey(image) === imageKey(ref))
          : !!selected && imageKey(selected) === imageKey(ref),
        selectable: !disabled,
        actions: [],
      };
    }),
  };
  const assets = useMemo(
    () =>
      new Map(
        [...entries.values()].map((entry) => [
          `${imageKey(entry.ref)}:${entry.generation ?? ''}`,
          entry,
        ]),
      ),
    [entries],
  );
  const latest = useRef({
    entries,
    assets,
    image,
    onSelect,
    onPreview,
    disabled,
    onWidth,
    onSaveWidth,
  });
  latest.current = { entries, assets, image, onSelect, onPreview, disabled, onWidth, onSaveWidth };
  const choose = (id: string) => {
    const s = latest.current,
      entry = s.entries.get(id);
    if (!s.disabled && entry) s.onSelect(entry.ref);
  };
  const preview = (id: string) => {
    const s = latest.current,
      entry = s.entries.get(id);
    if (!s.disabled && entry?.available) s.onPreview(entry);
  };
  const more = () => {
    if (!disabled && limit < filtered.length) setPage({ key, limit: limit + 64 });
  };
  const maybeMore = () => {
    if (
      scroll.current &&
      scroll.current.clientHeight > 0 &&
      sentinel.current &&
      sentinel.current.getBoundingClientRect().top <
        scroll.current.getBoundingClientRect().bottom + 300
    )
      more();
  };
  const navigation = useImageBrowserNavigation(root, sidebar, navigationButton, maybeMore);
  const gallery = useRef<ReturnType<typeof mountImageGallery>>(null);
  const sizeControl = useRef<ReturnType<typeof mountGallerySizeControl>>(null);
  useLayoutEffect(() => {
    const view = mountImageGallery(grid.current!, {
      get errorText() {
        return media === 'sound' ? libraryText(media, 'sounds.readFailed') : undefined;
      },
      scrollElement: scroll.current!,
      size: libraryGallerySize,
      expandLabels: true,
      clickSelect: choose,
      select: choose,
      activate: preview,
      action: preview,
      image: (id, edge) => {
        const s = latest.current,
          entry = s.assets.get(id);
        if (!entry) return Promise.reject(Error(t('settings.registeredImagePicker.updated')));
        return s.image(entry.ref, entry.generation ?? '', edge);
      },
    });
    gallery.current = view;
    const control = mountGallerySizeControl(size.current!, {
      get label() {
        return media === 'sound' ? libraryText(media, 'sounds.cardSize') : undefined;
      },
      range: libraryGallerySize,
      value: cardWidth,
      change: (value) => latest.current.onWidth(value),
      commit: (value) => latest.current.onSaveWidth(value),
    });
    sizeControl.current = control;
    return () => {
      view.dispose();
      control.dispose();
      gallery.current = null;
      sizeControl.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    gallery.current?.setModel(model);
    sizeControl.current?.setValue(cardWidth);
  });
  useLayoutEffect(() => {
    scroll.current!.scrollTop = 0;
    setPage({ key, limit: 64 });
  }, [key]);
  useLayoutEffect(() => {
    if (!reveal || revealed.current === reveal) return;
    const index = filtered.findIndex((ref) => imageKey(ref) === imageKey(reveal));
    if (index < 0) return;
    if (index >= limit) {
      setPage({ key, limit: Math.ceil((index + 1) / 64) * 64 });
      return;
    }
    gallery.current?.restore({
      id: imageKey(reveal),
      offset: filters.current!.getBoundingClientRect().height + 8,
    });
    revealed.current = reveal;
  }, [reveal, filtered, key, limit]);
  useEffect(() => {
    const frame = requestAnimationFrame(maybeMore);
    return () => cancelAnimationFrame(frame);
  }, [key, limit, filtered.length, cardWidth, layout.sidebarWidth, disabled, navigation.narrow]);
  useEffect(() => {
    if (!groups.some((g) => g.id === group)) onGroup('all');
    if (folder !== '*' && !(snapshot.folders ?? ['']).includes(folder)) onFolder('*');
  }, [snapshot]);
  return (
    <div
      ref={root}
      className="image-browser image-picker-browser"
      data-narrow={navigation.narrow}
      style={{ '--library-sidebar-width': `${layout.sidebarWidth}px` } as CSSProperties}
      onKeyDown={(e) => {
        if (
          e.key !== 'Enter' ||
          e.nativeEvent.isComposing ||
          e.nativeEvent.keyCode === 229 ||
          e.altKey ||
          e.ctrlKey ||
          e.metaKey
        )
          return;
        const card = (e.target as HTMLElement).closest<HTMLElement>('[data-image-id]');
        if (card) {
          e.preventDefault();
          e.stopPropagation();
          preview(card.dataset.imageId!);
        }
      }}
    >
      <div className="library-layout">
        <aside
          className="library-sidebar"
          ref={sidebar}
          {...navigation.sidebarProps}
          aria-label={t('images.navigation')}
        >
          <ImageBrowserNavigation
            folders={snapshot.folders ?? ['']}
            folder={folder}
            groups={groups}
            group={group}
            layout={layout}
            disabled={disabled}
            onFolder={(value) => {
              navigation.close();
              onFolder(value);
            }}
            onGroup={(value) => {
              navigation.close();
              onGroup(value);
            }}
            onLayout={onSaveLayout}
          />
        </aside>
        <ImageBrowserSplitter
          layout={layoutRef}
          sidebar={sidebar}
          narrow={navigation.narrow}
          dragging={dragging}
          onChange={(value) => {
            layoutRef.current = value;
            onLayout(value);
          }}
          onCommit={onSaveLayout}
        />
        <section className="library-content" aria-label={t('images.registeredImages')}>
          <div className="library-scroll image-picker-scroll" ref={scroll} onScroll={maybeMore}>
            <div className="library-filter-panel" ref={filters}>
              <ImageBrowserFilters
                folder={folder}
                onFolder={onFolder}
                query={queryInput}
                onQuery={setQueryInput}
                onSearch={onQuery}
                disabled={disabled}
                navigation={navigation}
                navigationButton={navigationButton}
                size={<div ref={size} />}
                locationActions={
                  <button
                    type="button"
                    className="library-icon-button"
                    title={t('images.reload')}
                    aria-label={t('images.reload')}
                    disabled={disabled}
                    onClick={onReload}
                  >
                    <Icon name="refresh" size={16} />
                  </button>
                }
              >
                <div className="library-summary">
                  <strong>{t('images.imageCount', { count: filtered.length })}</strong>
                  {group !== 'all' && (
                    <button
                      type="button"
                      className="library-filter-chip"
                      title={t('images.clearGroup')}
                      disabled={disabled}
                      onClick={() => onGroup('all')}
                    >
                      {groups.find((g) => g.id === group)?.title}
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </div>
              </ImageBrowserFilters>
            </div>
            <div className="library-grid-pad">
              <div ref={grid} />
            </div>
            {!filtered.length && query && (
              <div className="library-empty-actions">
                <button type="button" onClick={() => onQuery('')}>
                  {t('images.clearSearch')}
                </button>
              </div>
            )}
            <div ref={sentinel} className="library-load-more" aria-live="polite">
              {filtered.length > limit ? (
                <button type="button" disabled={disabled} onClick={more}>
                  {t('images.more', { count: filtered.length - limit })}
                </button>
              ) : filtered.length > 0 ? (
                t('images.loadedAll', { count: filtered.length })
              ) : (
                ''
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
