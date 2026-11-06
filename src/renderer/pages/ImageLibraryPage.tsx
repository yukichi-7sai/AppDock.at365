import { libraryText } from '../../shared/library-text';
import {
  LibraryMediaProvider,
  useLibraryMedia,
  useLibraryTranslation,
} from '../image-browser/LibraryMedia';
import { SettingsButton } from '../settings-ui/SettingsButton';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  ImageLibraryPageAction,
  ImageLibraryPageModel,
  ImageLibraryDialogKind,
  ImageLibraryLayout,
  ImageLibraryFileAction,
} from '../../shared/image-library-page';
import { libraryGallerySize, mountImageGallery, mountGallerySizeControl } from '../image-gallery';
import { Icon } from '../../shared/ui-icons';
import { useImageLibraryDialogFocus } from '../ImageLibraryDialogHost';
import { ImageLibraryMenu, type LibraryMenuItem } from './ImageLibraryMenu';
import '../image-gallery/gallery.css';
import './image-library.css';
import { ImageBrowserNavigation } from '../image-browser/ImageBrowserNavigation';
import {
  ImageBrowserFilters,
  ImageBrowserSplitter,
  useImageBrowserNavigation,
} from '../image-browser/ImageBrowserControls';

const api = window.dock.pages;
type Action = ImageLibraryPageAction extends infer T
  ? T extends ImageLibraryPageAction
    ? Omit<T, 'id' | 'type'>
    : never
  : never;
type Menu = {
  kind: 'images' | 'group' | 'folder';
  target?: string;
  opener: HTMLElement;
  count?: number;
  point?: { x: number; y: number };
};
export function ImageLibraryPage(props: { initialModel: ImageLibraryPageModel }) {
  return (
    <LibraryMediaProvider
      media={
        props.initialModel.kind === 'text-library'
          ? 'text'
          : props.initialModel.kind === 'sound-library'
            ? 'sound'
            : 'image'
      }
    >
      <LibraryPageBody {...props} />
    </LibraryMediaProvider>
  );
}
function LibraryPageBody({ initialModel }: { initialModel: ImageLibraryPageModel }) {
  const { t, language } = useLibraryTranslation();
  const media = useLibraryMedia();
  const captureDialogFocus = useImageLibraryDialogFocus();
  const [model, setModel] = useState(initialModel),
    latest = useRef(initialModel);
  const [error, setError] = useState(''),
    [query, setQuery] = useState(initialModel.content.query);
  const [width, setWidth] = useState(initialModel.content.cardWidth);
  const [layout, setLayout] = useState(initialModel.content.layout),
    layoutRef = useRef(layout);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [focusedFile, setFocusedFile] = useState('');
  const [toast, setToast] = useState('');
  const [dialogPending, setDialogPending] = useState(false),
    openingDialog = useRef(false);
  const generationOpener = useRef<HTMLElement | undefined>(undefined);
  useLayoutEffect(() => {
    if (dialogPending || model.content.busy || !generationOpener.current) return;
    generationOpener.current.focus({ preventScroll: true });
    generationOpener.current = undefined;
  }, [dialogPending, model.content.busy]);
  const root = useRef<HTMLElement>(null),
    sidebar = useRef<HTMLElement>(null);
  const navigationButton = useRef<HTMLButtonElement>(null);
  const interactionRoot = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    size = useRef<HTMLDivElement>(null);
  const filters = useRef<HTMLDivElement>(null),
    sentinel = useRef<HTMLDivElement>(null);
  const gallery = useRef<ReturnType<typeof mountImageGallery> | undefined>(undefined);
  const sizeControl = useRef<ReturnType<typeof mountGallerySizeControl> | undefined>(undefined);
  const viewRevision = useRef(-1),
    anchorSelection = useRef<string | undefined>(undefined);
  const pendingSize = useRef<number | undefined>(undefined),
    savingSize = useRef(false),
    sizeDirty = useRef(false);
  const requestedSize = useRef<number | undefined>(undefined);
  const requestedLayout = useRef<ImageLibraryLayout | undefined>(undefined);
  const loadingMore = useRef(false),
    moreRequest = useRef(''),
    moreErrorRef = useRef(false);
  const [moreError, setMoreError] = useState(false),
    [morePending, setMorePending] = useState(false);
  const draggingSidebar = useRef(false);
  const viewport = () => {
    const rect = scroll.current!.getBoundingClientRect();
    return {
      top: Math.max(rect.top, filters.current!.getBoundingClientRect().bottom),
      bottom: rect.bottom,
      left: rect.left,
      right: rect.left + scroll.current!.clientWidth,
    };
  };
  const act = async (action: Action, opener?: HTMLElement) => {
    if (openingDialog.current && action.command !== 'anchor') return;
    const opensDialog =
      action.command === 'dialog' ||
      action.command === 'retry-import' ||
      action.command === 'sound-generation';
    const focusTarget =
      opener ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
    const releaseFocus = opensDialog
      ? captureDialogFocus(
          narrow && focusTarget && sidebar.current?.contains(focusTarget)
            ? (navigationButton.current ?? undefined)
            : focusTarget,
        )
      : undefined;
    if (opensDialog) {
      if (action.command === 'sound-generation') generationOpener.current = focusTarget;
      openingDialog.current = true;
      setDialogPending(true);
      setDrawer(false);
    }
    try {
      if (action.command !== 'anchor' && action.command !== 'more') setError('');
      return await api.act({ ...action, id: latest.current.id, type: 'gallery' });
    } catch (e) {
      if (action.command !== 'anchor') setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      if (opensDialog) {
        releaseFocus?.();
        openingDialog.current = false;
        setDialogPending(false);
      }
    }
  };
  const run = (action: Action, opener?: HTMLElement) => {
    void act(action, opener).catch(() => {});
  };
  const saveSize = (value: number) => {
    requestedSize.current = value;
    pendingSize.current = value;
    if (savingSize.current) return;
    savingSize.current = true;
    void (async () => {
      try {
        while (pendingSize.current !== undefined) {
          const next = pendingSize.current;
          pendingSize.current = undefined;
          await act({ command: 'width', value: next, commit: true });
        }
      } finally {
        savingSize.current = false;
      }
    })().catch(() => {});
  };
  const saveLayout = (value: ImageLibraryLayout) => {
    requestedLayout.current = value;
    layoutRef.current = value;
    setLayout(value);
    run({ command: 'layout', value });
  };
  const more = (retry = false) => {
    const c = latest.current.content,
      key = c.viewRevision + ':' + c.items.length;
    if (
      loadingMore.current ||
      !c.remaining ||
      c.busy ||
      openingDialog.current ||
      (moreErrorRef.current && !retry) ||
      (!retry && moreRequest.current === key)
    )
      return;
    moreRequest.current = key;
    loadingMore.current = true;
    moreErrorRef.current = false;
    setMoreError(false);
    setMorePending(true);
    void act({ command: 'more' })
      .catch(() => {
        moreErrorRef.current = true;
        setMoreError(true);
      })
      .finally(() => {
        loadingMore.current = false;
        setMorePending(false);
      });
  };
  const maybeMore = () => {
    if (
      scroll.current &&
      sentinel.current &&
      sentinel.current.getBoundingClientRect().top <
        scroll.current.getBoundingClientRect().bottom + 300
    )
      more();
  };
  const navigation = useImageBrowserNavigation(root, sidebar, navigationButton, maybeMore);
  const { narrow, setDrawer } = navigation;
  const imageMenu = (
    imageId: string | undefined,
    opener: HTMLElement,
    event?: MouseEvent | KeyboardEvent,
  ) => {
    if (latest.current.content.busy || openingDialog.current) return;
    const c = latest.current.content,
      item = c.items.find((i) => i.id === imageId);
    const count = item && !item.selected ? 1 : c.selected;
    const point =
      event instanceof MouseEvent && (event.clientX || event.clientY)
        ? { x: event.clientX, y: event.clientY }
        : undefined;
    const show = () => setMenu({ kind: 'images', target: imageId, opener, point, count });
    if (imageId)
      void act({ command: 'select-target', imageId })
        .then(show)
        .catch(() => {});
    else show();
  };
  const select = (id: string, event: MouseEvent) => {
    const items = latest.current.content.items,
      item = items.find((i) => i.id === id);
    if (!item || openingDialog.current || latest.current.content.busy) return;
    if (event.shiftKey && anchorSelection.current) {
      const start = items.findIndex((i) => i.id === anchorSelection.current),
        end = items.findIndex((i) => i.id === id);
      if (start >= 0) {
        run({
          command: 'select-range',
          imageIds: items.slice(Math.min(start, end), Math.max(start, end) + 1).map((i) => i.id),
          additive: event.ctrlKey || event.metaKey,
        });
        return;
      }
    }
    anchorSelection.current = id;
    if (event.ctrlKey || event.metaKey)
      run({ command: 'select', imageId: id, selected: !item.selected });
    else if (!item.selected) run({ command: 'select-range', imageIds: [id], additive: false });
  };
  useEffect(() => {
    setToast(model.content.busy ? '' : model.content.message);
    if (model.content.busy || !model.content.message) return;
    const timer = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [model.id, model.content.message, model.content.messageRevision, model.content.busy]);
  useEffect(() => {
    if (latest.current.id === initialModel.id && latest.current.revision > initialModel.revision)
      return;
    latest.current = initialModel;
    setModel(initialModel);
    setQuery(initialModel.content.query);
    if (requestedSize.current === initialModel.content.cardWidth) {
      requestedSize.current = undefined;
      sizeDirty.current = false;
    }
    if (!savingSize.current && !sizeDirty.current) setWidth(initialModel.content.cardWidth);
    if (
      requestedLayout.current &&
      JSON.stringify(requestedLayout.current) === JSON.stringify(initialModel.content.layout)
    )
      requestedLayout.current = undefined;
    if (!draggingSidebar.current && !requestedLayout.current) {
      layoutRef.current = initialModel.content.layout;
      setLayout(initialModel.content.layout);
    }
  }, [initialModel]);
  useLayoutEffect(() => {
    const instance = mountImageGallery(grid.current!, {
      get errorText() {
        return media === 'text'
          ? libraryText(media, 'texts.invalidEncoding')
          : media === 'sound'
            ? libraryText(media, 'sounds.readFailed')
            : undefined;
      },
      expandLabels: true,
      size: libraryGallerySize,
      scrollElement: scroll.current!,
      clickSelect: select,
      context: (id, event, opener) => imageMenu(id, opener, event),
      interactions: {
        root: interactionRoot.current!,
        viewport,
        enabled: () => !openingDialog.current && !latest.current.content.busy,
        canReorder: () => !['all', 'unfiled'].includes(latest.current.content.group),
        beginDrag: async (imageId) =>
          (await act({ command: 'drag-start', imageId })) as { token: string; count: number },
        drop: (token, target) =>
          target.startsWith('folder:')
            ? run({ command: 'drop-folder', token, folder: target.slice(7) })
            : run({ command: 'drop', token, groupId: target }),
        reorder: (token, imageId, after) => run({ command: 'reorder', token, imageId, after }),
        clear: () => run({ command: 'clear' }),
        selectRange: (imageIds, additive) => {
          // A marquee starts on non-focusable space, possibly leaving focus in the search field.
          root.current?.focus({ preventScroll: true });
          run({ command: 'select-range', imageIds, additive });
        },
        targets: () => [
          ...[
            ...(sidebar.current?.querySelectorAll<HTMLElement>('[data-gallery-group]') ?? []),
          ].map((element) => ({
            element,
            id: element.dataset.galleryGroup!,
            description: (count: number) =>
              libraryText(media, 'images.dragAddToGroup', { count, group: element.title }),
          })),
          ...[
            ...(sidebar.current?.querySelectorAll<HTMLElement>('[data-gallery-folder]') ?? []),
          ].map((element) => {
            const folder = element.dataset.galleryFolder!;
            return {
              element,
              id: 'folder:' + folder,
              description: (count: number) =>
                libraryText(media, 'images.dragMoveToFolder', {
                  count,
                  folder: folder || libraryText(media, 'images.rootFolder'),
                }),
              hover: () => {
                const current = layoutRef.current;
                if (current.collapsedFolders.includes(folder))
                  saveLayout({
                    ...current,
                    collapsedFolders: current.collapsedFolders.filter((f) => f !== folder),
                  });
              },
            };
          }),
          ...(navigationButton.current && !sidebar.current?.matches(':popover-open')
            ? [
                {
                  element: navigationButton.current,
                  id: 'navigation',
                  canDrop: false,
                  description: (count: number) =>
                    libraryText(media, 'images.dragChooseFolder', { count }),
                  hover: () => setDrawer(true),
                },
              ]
            : []),
        ],
        scrollTargets: () => [scroll.current!, sidebar.current!],
        more,
      },
      image: async (assetId, edge) =>
        (await api.act({
          id: latest.current.id,
          type: 'gallery',
          command: 'image',
          assetId,
          edge,
        })) as string,
      select: (imageId, selected) => {
        anchorSelection.current = imageId;
        run({ command: 'select', imageId, selected });
      },
      activate: (imageId) => run({ command: 'dialog', kind: 'preview', imageId }),
      action: (imageId, actionId) => {
        if (actionId === 'menu') imageMenu(imageId, document.activeElement as HTMLElement);
        else
          run({
            command: 'dialog',
            kind: actionId === 'delete-image' ? 'delete-image' : 'membership',
            imageId,
          });
      },
    });
    gallery.current = instance;
    sizeControl.current = mountGallerySizeControl(size.current!, {
      get label() {
        return media !== 'image' ? libraryText(media, 'sounds.cardSize') : undefined;
      },
      range: libraryGallerySize,
      value: latest.current.content.cardWidth,
      change: (value) => {
        sizeDirty.current = value !== latest.current.content.cardWidth;
        setWidth(value);
      },
      commit: saveSize,
    });
    let frame = 0;
    const scroller = scroll.current!;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        run({ command: 'anchor', anchor: instance.anchor() });
        maybeMore();
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) more();
      },
      { root: scroller, rootMargin: '300px' },
    );
    observer.observe(sentinel.current!);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', onScroll);
      instance.dispose();
      sizeControl.current?.dispose();
      gallery.current = undefined;
    };
  }, []);
  useLayoutEffect(() => {
    const c = model.content;
    gallery.current?.setModel({
      items: c.items,
      cardWidth: width,
      fit: 'contain',
      selection: 'multiple',
      empty: c.query ? t('images.noMatches') : t('images.empty'),
    });
    sizeControl.current?.setValue(width);
    if (viewRevision.current !== c.viewRevision) {
      gallery.current?.cancelInteraction();
      viewRevision.current = c.viewRevision;
      anchorSelection.current = undefined;
      moreErrorRef.current = false;
      setMoreError(false);
      moreRequest.current = '';
      if (c.anchor) gallery.current?.restore(c.anchor);
      else scroll.current!.scrollTop = 0;
    }
    const frame = requestAnimationFrame(maybeMore);
    return () => cancelAnimationFrame(frame);
  }, [model, width, layout.sidebarWidth, dialogPending, morePending, language]);
  useEffect(
    () => setMenu(null),
    [model.content.group, model.content.folder, model.content.query, model.id],
  );
  const c = model.content;
  const dialog = (
    kind: ImageLibraryDialogKind,
    groupId?: string,
    folder?: string,
    imageId?: string,
    opener?: HTMLElement,
  ) => {
    setMenu(null);
    run({ command: 'dialog', kind, groupId, folder, imageId }, opener);
  };
  const navigate = (action: Action) => {
    setDrawer(false);
    if (narrow) navigationButton.current?.focus({ preventScroll: true });
    run(action);
  };
  const currentGroup = c.groups.find((g) => g.id === c.group),
    normalGroup = !['all', 'unfiled'].includes(c.group);
  let menuItems: LibraryMenuItem[] = [],
    menuTitle = '';
  if (menu?.kind === 'images') {
    const count = menu.count ?? c.selected;
    const chosen =
      menu.target && !c.items.find((i) => i.id === menu.target)?.selected
        ? c.items.filter((i) => i.id === menu.target)
        : c.items.filter((i) => i.selected);
    const unreadable = chosen.some((i) => i.state !== 'ready');
    const file = (operation: ImageLibraryFileAction) =>
      run({ command: 'file-action', operation, imageId: menu.target }, menu.opener);
    const edit = (kind: ImageLibraryDialogKind) =>
      dialog(kind, undefined, undefined, menu.target, menu.opener);
    menuTitle = t('images.selectedCount', { count });
    menuItems = [
      {
        label: t('images.preview'),
        disabled: media !== 'image' ? count !== 1 : !count,
        run: () => edit('preview'),
      },
      ...(media === 'text'
        ? [
            {
              label: t('texts.edit'),
              disabled: count !== 1 || unreadable,
              run: () => edit('text-edit'),
            },
            {
              label: t('texts.duplicate'),
              disabled: count !== 1 || unreadable,
              run: () => edit('text-duplicate'),
            },
            {
              label: t('texts.copy'),
              disabled: !count || unreadable,
              run: () => file('copy-text'),
            },
          ]
        : []),
      {
        label: t('images.renameImages'),
        disabled: !count || unreadable,
        run: () => edit('rename-images'),
      },
      {
        label: t('images.copyFiles'),
        separator: true,
        disabled: !count || unreadable,
        run: () => file('copy-files'),
      },
      { label: t('images.copyPaths'), disabled: !count, run: () => file('copy-paths') },
      ...(media === 'image'
        ? [
            {
              label: t('images.copyImage'),
              disabled: count !== 1 || unreadable,
              run: () => file('copy-image'),
            },
          ]
        : []),
      { label: t('images.reveal'), disabled: !count || unreadable, run: () => file('reveal') },
      {
        label: t('images.addToGroup'),
        separator: true,
        disabled: !count || !c.groups.slice(2).length,
        run: () => edit('batch-add'),
      },
      ...(count === 1
        ? [
            {
              label: t('images.editMembership'),
              run: () => edit('membership'),
            },
          ]
        : []),
      {
        label: t('images.removeFromGroup'),
        disabled: !count || !c.groups.slice(2).length,
        run: () => edit('batch-remove'),
      },
      {
        label: t('images.moveImages'),
        disabled: !count || unreadable,
        run: () => edit('folder-move'),
      },
      {
        label: t('images.deleteImages'),
        separator: true,
        danger: true,
        disabled: !count || unreadable,
        run: () => edit('delete-image'),
      },
    ];
  } else if (menu?.kind === 'group') {
    menuTitle = t('images.itemActions', {
      name: c.groups.find((g) => g.id === menu.target)?.title ?? '',
    });
    menuItems = [
      {
        label: t('images.orderImages'),
        run: () => dialog('order-images', menu.target, undefined, undefined, menu.opener),
      },
      {
        label: t('images.renameGroup'),
        disabled: c.groups.find((g) => g.id === menu.target)?.fixed,
        run: () => dialog('rename', menu.target, undefined, undefined, menu.opener),
      },
      {
        label: t('images.deleteGroup'),
        disabled: c.groups.find((g) => g.id === menu.target)?.fixed,
        danger: true,
        run: () => dialog('delete', menu.target, undefined, undefined, menu.opener),
      },
    ];
  } else if (menu) {
    menuTitle = menu.target || t('images.rootFolder');
    menuItems = [
      {
        label: t('images.openFolder'),
        run: () => run({ command: 'open-folder', folder: menu.target }),
      },
      {
        label: t('images.createFolder'),
        run: () => dialog('folder-create', undefined, menu.target, undefined, menu.opener),
      },
      {
        label: t('images.renameFolder'),
        disabled: !menu.target,
        run: () => dialog('folder-rename', undefined, menu.target, undefined, menu.opener),
      },
      {
        label: t('images.deleteFolder'),
        disabled: !menu.target,
        danger: true,
        run: () => dialog('folder-delete', undefined, menu.target, undefined, menu.opener),
      },
    ];
  }
  return (
    <section
      ref={root}
      className="library-page image-browser"
      data-media={media}
      data-narrow={narrow}
      inert={dialogPending}
      tabIndex={-1}
      style={{ '--library-sidebar-width': layout.sidebarWidth + 'px' } as CSSProperties}
      onKeyDown={(e) => {
        if (
          e.nativeEvent.isComposing ||
          e.keyCode === 229 ||
          e.repeat ||
          c.busy ||
          menu ||
          e.altKey ||
          (e.target as Element).closest(
            'input:not([type="checkbox"]),select,textarea,[contenteditable],[role="menu"],[role="separator"]',
          )
        )
          return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          run({ command: 'select-all' });
        } else if (c.selected && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
          e.preventDefault();
          run({
            command: 'file-action',
            operation: e.shiftKey ? 'copy-paths' : media === 'text' ? 'copy-text' : 'copy-files',
          });
        } else if (
          c.selected &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.shiftKey &&
          ['F2', 'Delete'].includes(e.key)
        ) {
          e.preventDefault();
          dialog(e.key === 'F2' ? 'rename-images' : 'delete-image');
        } else if (e.key === 'Enter' && (e.target as Element).matches('.ad-gallery-image')) {
          e.preventDefault();
          const imageId = (e.target as Element).closest<HTMLElement>('[data-image-id]')?.dataset
            .imageId;
          if (imageId) dialog('preview', undefined, undefined, imageId);
        }
      }}
    >
      <header className="library-header">
        <h1>
          <Icon
            name={media === 'text' ? 'file' : media === 'sound' ? 'music' : 'image'}
            size={19}
          />
          {t('images.title')}
        </h1>
        <div className="library-header-actions">
          {media === 'text' && (
            <SettingsButton
              disabled={c.busy}
              appearance="filled"
              onClick={() => dialog('text-create')}
            >
              <Icon name="edit" size={15} />
              {t('texts.create')}
            </SettingsButton>
          )}
          <SettingsButton
            disabled={c.busy}
            appearance={media === 'text' ? undefined : 'filled'}
            onClick={() => run({ command: 'add' })}
          >
            <Icon name="upload" size={15} />
            {t('images.addImages')}
          </SettingsButton>
          {media === 'sound' && (
            <SettingsButton disabled={c.busy} onClick={() => run({ command: 'sound-generation' })}>
              <Icon name="volume" size={15} />
              {t('soundGeneration.open')}
            </SettingsButton>
          )}
          {media === 'image' && (
            <SettingsButton disabled={c.busy} onClick={() => dialog('import-set')}>
              <Icon name="download" size={15} />
              {t('images.importSet')}
            </SettingsButton>
          )}
        </div>
      </header>
      <div className="library-layout" ref={interactionRoot}>
        <aside
          className="library-sidebar"
          ref={sidebar}
          {...navigation.sidebarProps}
          aria-label={t('images.navigation')}
        >
          <ImageBrowserNavigation
            folders={c.folders}
            folder={c.folder}
            groups={c.groups}
            group={c.group}
            layout={layout}
            disabled={c.busy}
            onLayout={saveLayout}
            onFolder={(folder) => navigate({ command: 'folder', folder })}
            onGroup={(groupId) => navigate({ command: 'group', groupId })}
            folderHeading={
              <button
                type="button"
                className="library-icon-button"
                title={t('images.createFolder')}
                aria-label={t('images.createFolder')}
                disabled={c.busy}
                onClick={() => dialog('folder-create')}
              >
                ＋
              </button>
            }
            groupHeading={
              <button
                type="button"
                disabled={!c.canOrder || c.busy}
                onClick={() => dialog('order')}
              >
                {t('images.order')}
              </button>
            }
            groupFooter={
              <SettingsButton
                className="library-add-group"
                aria-label={t('images.addGroup')}
                disabled={!c.canAddGroup || c.busy}
                onClick={() => dialog('add')}
              >
                ＋ {t('images.addGroup')}
              </SettingsButton>
            }
            folderAction={(folder) => (
              <button
                type="button"
                className="library-icon-button"
                disabled={c.busy}
                aria-label={t('images.itemActions', { name: folder || t('images.rootFolder') })}
                aria-haspopup="menu"
                onClick={(e) =>
                  setMenu({ kind: 'folder', target: folder, opener: e.currentTarget })
                }
              >
                …
              </button>
            )}
            groupAction={(g) => (
              <button
                type="button"
                className="library-icon-button"
                disabled={c.busy}
                aria-label={t('images.itemActions', { name: g.title })}
                aria-haspopup="menu"
                aria-expanded={menu?.kind === 'group' && menu.target === g.id}
                onClick={(e) => setMenu({ kind: 'group', target: g.id, opener: e.currentTarget })}
              >
                …
              </button>
            )}
          />
        </aside>
        <ImageBrowserSplitter
          layout={layoutRef}
          sidebar={sidebar}
          narrow={narrow}
          dragging={draggingSidebar}
          onChange={(value) => {
            layoutRef.current = value;
            setLayout(value);
          }}
          onCommit={saveLayout}
        />
        <section
          className="library-content"
          aria-label={t('images.registeredImages')}
          onPointerOver={(e) => {
            const card = (e.target as Element).closest<HTMLElement>('[data-image-id]');
            if (card) setFocusedFile(card.title);
          }}
          onPointerLeave={() => {
            const card = document.activeElement?.closest<HTMLElement>('[data-image-id]');
            setFocusedFile(card?.title ?? '');
          }}
          onFocus={(e) => {
            const card = (e.target as Element).closest<HTMLElement>('[data-image-id]');
            setFocusedFile(card?.title ?? '');
          }}
        >
          <div className="library-scroll" ref={scroll}>
            <div className="library-filter-panel" ref={filters}>
              <ImageBrowserFilters
                folder={c.folder}
                onFolder={(folder) => navigate({ command: 'folder', folder })}
                query={query}
                onQuery={setQuery}
                onSearch={(value) => run({ command: 'query', value })}
                disabled={c.busy}
                navigation={navigation}
                navigationButton={navigationButton}
                size={<div ref={size} />}
                locationActions={
                  <>
                    <SettingsButton
                      icon
                      disabled={c.busy}
                      title={t('images.openFolder')}
                      aria-label={t('images.openFolder')}
                      onClick={() =>
                        run({ command: 'open-folder', folder: c.folder === '*' ? '' : c.folder })
                      }
                    >
                      <Icon name="external-link" size={16} />
                    </SettingsButton>
                    <SettingsButton
                      icon
                      disabled={c.busy}
                      title={t('images.reload')}
                      aria-label={t('images.reload')}
                      onClick={() => run({ command: 'reload' })}
                    >
                      <Icon name="refresh" size={16} />
                    </SettingsButton>
                  </>
                }
              >
                <div className="library-summary">
                  <div className="library-selection-controls">
                    <SettingsButton
                      disabled={!c.total || c.selected === c.total || c.busy}
                      onClick={() => run({ command: 'select-all' })}
                    >
                      <Icon name="select-all" size={15} />
                      {t('images.selectAll')}
                    </SettingsButton>
                    <SettingsButton
                      disabled={!c.selected || c.busy}
                      onClick={() => run({ command: 'clear' })}
                    >
                      <Icon name="clear-selection" size={15} />
                      {t('images.clearSelection')}
                    </SettingsButton>
                  </div>
                  <div className="library-selection-status">
                    {c.group !== 'all' && (
                      <button
                        className="library-filter-chip"
                        title={t('images.clearGroup')}
                        onClick={() => run({ command: 'group', groupId: 'all' })}
                      >
                        {currentGroup?.title}
                        <Icon name="close" size={12} />
                      </button>
                    )}
                    {c.indexing && <span role="status">{t('texts.indexing')}</span>}
                    {c.playback && (
                      <span role="status">
                        {t(
                          c.playback.state === 'playing'
                            ? 'sounds.playing'
                            : c.playback.state === 'waiting'
                              ? 'sounds.waiting'
                              : 'sounds.loading',
                        )}
                      </span>
                    )}
                    <span className="library-selection-count" aria-live="polite">
                      {t('images.selectionSummary', { total: c.total, count: c.selected })}
                    </span>
                  </div>
                </div>
                <div className="library-selection">
                  <div className="library-action-group">
                    {media === 'image' && (
                      <SettingsButton
                        disabled={!c.selected || c.busy}
                        onClick={() => dialog('preview')}
                      >
                        <Icon name="eye" size={15} />
                        {t('images.preview')}
                      </SettingsButton>
                    )}
                    {media === 'text' && (
                      <>
                        <SettingsButton
                          disabled={c.selected !== 1 || c.busy}
                          onClick={() => dialog('preview')}
                        >
                          <Icon name="eye" size={15} />
                          {t('texts.preview')}
                        </SettingsButton>
                        <SettingsButton
                          disabled={c.selected !== 1 || c.busy}
                          onClick={() => dialog('text-edit')}
                        >
                          <Icon name="edit" size={15} />
                          {t('texts.edit')}
                        </SettingsButton>
                        <SettingsButton
                          disabled={!c.selected || c.busy}
                          onClick={() => run({ command: 'file-action', operation: 'copy-text' })}
                        >
                          <Icon name="copy" size={15} />
                          {t('texts.copy')}
                        </SettingsButton>
                      </>
                    )}
                    {media === 'sound' && (
                      <>
                        <SettingsButton
                          disabled={c.selected !== 1 || c.busy}
                          onClick={() => dialog('preview')}
                        >
                          <Icon name="play" size={15} />
                          {t('sounds.play')}
                        </SettingsButton>
                        <SettingsButton
                          disabled={!c.playback}
                          onClick={() => run({ command: 'stop-playback' })}
                        >
                          <Icon name="square" size={15} />
                          {t('sounds.stop')}
                        </SettingsButton>
                      </>
                    )}
                  </div>
                  <div className="library-action-group">
                    <SettingsButton
                      disabled={!c.selected || c.busy}
                      onClick={() => dialog('batch-add')}
                    >
                      <Icon name="list-plus" size={15} />
                      {t('images.addToGroup')}
                    </SettingsButton>
                    <SettingsButton
                      disabled={!c.selected || c.busy}
                      onClick={() => dialog('batch-remove', normalGroup ? c.group : undefined)}
                    >
                      <Icon name="list-minus" size={15} />
                      {t('images.removeFromGroup')}
                    </SettingsButton>
                  </div>
                  <div className="library-action-group">
                    <SettingsButton
                      disabled={!c.selected || c.busy}
                      onClick={() => dialog('folder-move')}
                    >
                      <Icon name="folder-move" size={15} />
                      {t('images.moveShort')}
                    </SettingsButton>
                    <SettingsButton
                      disabled={!c.selected || c.busy}
                      aria-haspopup="menu"
                      aria-expanded={menu?.kind === 'images' && !menu.target}
                      onClick={(e) => imageMenu(undefined, e.currentTarget)}
                    >
                      <Icon name="more" size={15} />
                      {t('images.actions')}
                      <Icon name="chevron-down" size={12} />
                    </SettingsButton>
                  </div>
                  <div className="library-action-group">
                    <SettingsButton
                      className="library-selection-delete"
                      disabled={!c.selected || c.busy}
                      onClick={() => dialog('delete-image')}
                    >
                      <Icon name="trash" size={15} />
                      {t('images.delete')}
                    </SettingsButton>
                  </div>
                </div>
              </ImageBrowserFilters>
            </div>
            <div className="library-grid-pad">
              <div ref={grid} />
            </div>
            {!c.total && (
              <div className="library-empty-actions">
                {c.query ? (
                  <button onClick={() => run({ command: 'query', value: '' })}>
                    {t('images.clearSearch')}
                  </button>
                ) : (
                  <button disabled={c.busy} onClick={() => run({ command: 'add' })}>
                    {t('images.addImages')}
                  </button>
                )}
              </div>
            )}
            <div ref={sentinel} className="library-load-more" aria-live="polite">
              {moreError ? (
                <button onClick={() => more(true)}>{t('images.retryMore')}</button>
              ) : c.remaining > 0 ? (
                <button disabled={morePending || c.busy} onClick={() => more(true)}>
                  {t(morePending ? 'images.loadingMore' : 'images.more', { count: c.remaining })}
                </button>
              ) : c.total > 0 ? (
                t('images.loadedAll', { count: c.total })
              ) : (
                ''
              )}
            </div>
          </div>
          <div
            className="library-status"
            role="status"
            hidden={!c.busy && !toast && !c.sizeError && !c.error && !error}
          >
            {c.busy ? t('images.working') : toast}
            {c.sizeError && (
              <div role="alert">
                {c.sizeError}
                <button
                  onClick={() => {
                    saveSize(width);
                    saveLayout(layoutRef.current);
                  }}
                >
                  {t('images.retrySave')}
                </button>
              </div>
            )}
            {(error || c.error) && (
              <div role="alert">
                {error || c.error}
                <button
                  disabled={c.busy}
                  onClick={() =>
                    run({ command: !error && c.canRetryIconImport ? 'retry-import' : 'reload' })
                  }
                >
                  {t(!error && c.canRetryIconImport ? 'images.importRetry' : 'images.reload')}
                </button>
                {c.canRetryMembership && (
                  <button onClick={() => run({ command: 'retry-membership' })}>
                    {t('images.retryMembership')}
                  </button>
                )}
              </div>
            )}
          </div>
          {width < 120 && (
            <div className="library-file-info" title={focusedFile}>
              {focusedFile || t('images.imageCount', { count: c.total })}
            </div>
          )}
        </section>
      </div>
      {menu && (
        <ImageLibraryMenu
          title={menuTitle}
          opener={menu.opener}
          point={menu.point}
          items={menuItems}
          close={() => setMenu(null)}
        />
      )}
    </section>
  );
}
