import { useHostTranslation } from '../HostTranslation';
import { SettingsButton } from '../settings-ui/SettingsButton';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type {
  ImageLibraryPageAction,
  ImageLibraryPageModel,
  ImageLibraryDialogKind,
  ImageLibraryLayout,
  ImageLibraryFileAction,
} from '../../shared/image-library-page';
import {
  libraryGallerySize,
  mountImageGallery,
  mountGallerySizeControl,
} from '../../../ui/image-gallery';
import { Icon } from '../../shared/ui-icons';
import { useImageLibraryDialogFocus } from '../ImageLibraryDialogHost';
import { ImageLibraryMenu, type LibraryMenuItem } from './ImageLibraryMenu';
import '../../../ui/image-gallery/gallery.css';
import './image-library.css';

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
export function ImageLibraryPage({ initialModel }: { initialModel: ImageLibraryPageModel }) {
  const { t } = useHostTranslation();
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
  const [narrow, setNarrow] = useState(false),
    [drawer, setDrawer] = useState(false);
  const [dialogPending, setDialogPending] = useState(false),
    openingDialog = useRef(false);
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
    const opensDialog = action.command === 'dialog' || action.command === 'retry-import';
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
  const toggle = (kind: 'collapsedFolders' | 'collapsedGroups', key: string) => {
    const current = layoutRef.current;
    saveLayout({
      ...current,
      [kind]: current[kind].includes(key)
        ? current[kind].filter((v) => v !== key)
        : [...current[kind], key],
    });
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
    const observer = new ResizeObserver(() => {
      setNarrow(root.current!.clientWidth < 680);
      maybeMore();
    });
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const pane = sidebar.current!;
    if (narrow && drawer) {
      pane.showPopover();
      const bounds = root.current!.getBoundingClientRect();
      pane.style.left = bounds.left + 'px';
      pane.style.top = bounds.top + 'px';
      pane.style.height = bounds.height + 'px';
      pane.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    } else {
      if (pane.matches(':popover-open')) pane.hidePopover();
      if (!narrow) {
        pane.style.left = '';
        pane.style.top = '';
        pane.style.height = '';
      }
    }
  }, [narrow, drawer]);
  useLayoutEffect(() => {
    const instance = mountImageGallery(grid.current!, {
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
        drop: (token, groupId) => run({ command: 'drop', token, groupId }),
        reorder: (token, imageId, after) => run({ command: 'reorder', token, imageId, after }),
        clear: () => run({ command: 'clear' }),
        selectRange: (imageIds, additive) => run({ command: 'select-range', imageIds, additive }),
        targets: () =>
          [...(sidebar.current?.querySelectorAll<HTMLElement>('[data-gallery-group]') ?? [])].map(
            (element) => ({ element, id: element.dataset.galleryGroup! }),
          ),
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
  }, [model, width, layout.sidebarWidth, dialogPending, morePending]);
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
  const groupRow = (g: (typeof c.groups)[number], label = g.title) => (
    <div className="library-nav-row" key={g.id}>
      <button
        type="button"
        data-gallery-group={['all', 'unfiled'].includes(g.id) ? undefined : g.id}
        data-testid="library-group-target"
        disabled={c.busy}
        aria-current={g.id === c.group ? 'page' : undefined}
        title={g.title}
        onClick={() => navigate({ command: 'group', groupId: g.id })}
      >
        <span>{label}</span>
        <small>{g.count}</small>
      </button>
      {!['all', 'unfiled'].includes(g.id) && (
        <button
          type="button"
          className="library-icon-button"
          aria-label={t('images.itemActions', { name: g.title })}
          aria-haspopup="menu"
          aria-expanded={menu?.kind === 'group' && menu.target === g.id}
          disabled={c.busy}
          onClick={(e) => setMenu({ kind: 'group', target: g.id, opener: e.currentTarget })}
        >
          …
        </button>
      )}
    </div>
  );
  const buckets: { prefix: string; groups: typeof c.groups }[] = [],
    byPrefix = new Map<string, (typeof buckets)[number]>();
  for (const g of c.groups.slice(2)) {
    const colon = g.title.indexOf(':'),
      prefix = colon > 0 ? g.title.slice(0, colon).trim() : '';
    if (!prefix) buckets.push({ prefix: '', groups: [g] });
    else {
      let bucket = byPrefix.get(prefix);
      if (!bucket) {
        bucket = { prefix, groups: [] };
        byPrefix.set(prefix, bucket);
        buckets.push(bucket);
      }
      bucket.groups.push(g);
    }
  }
  const folderChildren = new Map<string, string[]>();
  for (const f of c.folders) {
    if (!f) continue;
    const parent = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
    const children = folderChildren.get(parent) ?? [];
    children.push(f);
    folderChildren.set(parent, children);
  }
  const folderRow = (folder: string, level = 0): ReactNode => {
    const children = folderChildren.get(folder) ?? [],
      closed = layout.collapsedFolders.includes(folder);
    return (
      <div key={folder}>
        <div className="library-nav-row" style={{ '--folder-depth': level } as CSSProperties}>
          {children.length > 0 ? (
            <button
              type="button"
              className="library-folder-toggle library-icon-button"
              aria-label={t(closed ? 'images.expandItem' : 'images.collapseItem', {
                name: folder || t('images.rootFolder'),
              })}
              aria-expanded={!closed}
              onClick={() => toggle('collapsedFolders', folder)}
            >
              <Icon name="chevron" size={12} />
            </button>
          ) : (
            <span className="library-folder-spacer" />
          )}
          <button
            type="button"
            className="library-folder-name"
            aria-current={c.folder === folder ? 'page' : undefined}
            disabled={c.busy}
            title={folder || t('images.rootFolder')}
            onClick={() => navigate({ command: 'folder', folder })}
          >
            <Icon name="folder" size={15} />
            <span>{folder ? folder.split('/').at(-1) : t('images.rootFolder')}</span>
          </button>
          <button
            type="button"
            className="library-icon-button"
            disabled={c.busy}
            aria-label={t('images.itemActions', { name: folder || t('images.rootFolder') })}
            aria-haspopup="menu"
            onClick={(e) => setMenu({ kind: 'folder', target: folder, opener: e.currentTarget })}
          >
            …
          </button>
        </div>
        {!closed && children.map((child) => folderRow(child, level + 1))}
      </div>
    );
  };
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
      { label: t('images.preview'), disabled: !count, run: () => edit('preview') },
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
      {
        label: t('images.copyImage'),
        disabled: count !== 1 || unreadable,
        run: () => file('copy-image'),
      },
      { label: t('images.reveal'), disabled: !count || unreadable, run: () => file('reveal') },
      {
        label: t('images.addToGroup'),
        separator: true,
        disabled: !count || !c.groups.slice(2).length,
        run: () => edit('batch-add'),
      },
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
        run: () => dialog('rename', menu.target, undefined, undefined, menu.opener),
      },
      {
        label: t('images.deleteGroup'),
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
      className="library-page"
      data-narrow={narrow}
      inert={dialogPending}
      style={{ '--library-sidebar-width': layout.sidebarWidth + 'px' } as CSSProperties}
      onKeyDown={(e) => {
        if (
          e.nativeEvent.isComposing ||
          e.keyCode === 229 ||
          c.busy ||
          menu ||
          e.altKey ||
          (e.target as Element).closest('input,select,textarea,[role="menu"],[role="separator"]')
        )
          return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          run({ command: 'select-all' });
        } else if (c.selected && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
          e.preventDefault();
          run({ command: 'file-action', operation: e.shiftKey ? 'copy-paths' : 'copy-files' });
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
          <Icon name="image" size={19} />
          {t('images.title')}
        </h1>
        <div className="library-header-actions">
          <SettingsButton
            disabled={c.busy}
            appearance="filled"
            onClick={() => run({ command: 'add' })}
          >
            <Icon name="upload" size={15} />
            {t('images.addImages')}
          </SettingsButton>
          <SettingsButton disabled={c.busy} onClick={() => dialog('import-set')}>
            <Icon name="download" size={15} />
            {t('images.importSet')}
          </SettingsButton>
        </div>
      </header>
      <div className="library-layout" ref={interactionRoot}>
        <aside
          className="library-sidebar"
          ref={sidebar}
          popover={narrow ? 'auto' : undefined}
          aria-label={t('images.navigation')}
          onKeyDown={(e) => {
            if (narrow && e.key === 'Escape' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.stopPropagation();
              setDrawer(false);
              navigationButton.current?.focus({ preventScroll: true });
            }
          }}
          onToggle={(e) => {
            if (e.newState === 'closed') setDrawer(false);
          }}
        >
          <div className="library-section-heading">
            <strong>{t('images.folder')}</strong>
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
          </div>
          <nav aria-label={t('images.folder')}>
            <div className="library-nav-row">
              <button
                type="button"
                disabled={c.busy}
                aria-current={c.folder === '*' ? 'page' : undefined}
                onClick={() => navigate({ command: 'folder', folder: '*' })}
              >
                <Icon name="folder" size={15} />
                <span>{t('images.allFolders')}</span>
              </button>
            </div>
            {folderRow('')}
          </nav>
          <div className="library-section-heading">
            <strong>{t('images.groups')}</strong>
            <button type="button" disabled={!c.canOrder || c.busy} onClick={() => dialog('order')}>
              {t('images.order')}
            </button>
          </div>
          <nav aria-label={t('images.groups')}>
            {c.groups.slice(0, 2).map((g) => groupRow(g))}
            {buckets.map((bucket) =>
              bucket.prefix ? (
                <div className="library-prefix" key={bucket.prefix}>
                  <button
                    type="button"
                    className="library-prefix-toggle"
                    aria-expanded={!layout.collapsedGroups.includes(bucket.prefix)}
                    onClick={() => toggle('collapsedGroups', bucket.prefix)}
                  >
                    <Icon name="chevron" size={12} />
                    <span>{bucket.prefix}</span>
                    <small>{bucket.groups.length}</small>
                  </button>
                  {!layout.collapsedGroups.includes(bucket.prefix) && (
                    <div className="library-prefix-children">
                      {bucket.groups.map((g) =>
                        groupRow(g, g.title.slice(g.title.indexOf(':') + 1).trim()),
                      )}
                    </div>
                  )}
                </div>
              ) : (
                groupRow(bucket.groups[0])
              ),
            )}
          </nav>
          <SettingsButton
            className="library-add-group"
            aria-label={t('images.addGroup')}
            disabled={!c.canAddGroup || c.busy}
            onClick={() => dialog('add')}
          >
            ＋ {t('images.addGroup')}
          </SettingsButton>
        </aside>
        <div
          className="library-splitter"
          role="separator"
          tabIndex={narrow ? -1 : 0}
          aria-orientation="vertical"
          aria-label={t('images.sidebarWidth')}
          aria-valuemin={160}
          aria-valuemax={480}
          aria-valuenow={layout.sidebarWidth}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.focus();
            e.currentTarget.setPointerCapture(e.pointerId);
            draggingSidebar.current = true;
            e.currentTarget.dataset.original = String(layoutRef.current.sidebarWidth);
          }}
          onPointerMove={(e) => {
            if (!draggingSidebar.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const next = {
              ...layoutRef.current,
              sidebarWidth: Math.max(
                160,
                Math.min(
                  480,
                  Math.round(e.clientX - sidebar.current!.getBoundingClientRect().left),
                ),
              ),
            };
            layoutRef.current = next;
            setLayout(next);
          }}
          onPointerUp={(e) => {
            if (!draggingSidebar.current) return;
            draggingSidebar.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
            saveLayout(layoutRef.current);
          }}
          onPointerCancel={(e) => {
            draggingSidebar.current = false;
            const next = {
              ...layoutRef.current,
              sidebarWidth: Number(e.currentTarget.dataset.original) || 220,
            };
            layoutRef.current = next;
            setLayout(next);
          }}
          onLostPointerCapture={(e) => {
            if (!draggingSidebar.current) return;
            draggingSidebar.current = false;
            const next = {
              ...layoutRef.current,
              sidebarWidth: Number(e.currentTarget.dataset.original) || 220,
            };
            layoutRef.current = next;
            setLayout(next);
          }}
          onKeyDown={(e) => {
            const values: Record<string, number> = {
              ArrowLeft: layoutRef.current.sidebarWidth - 8,
              ArrowRight: layoutRef.current.sidebarWidth + 8,
              Home: 160,
              End: 480,
            };
            if (values[e.key] !== undefined) {
              e.preventDefault();
              saveLayout({
                ...layoutRef.current,
                sidebarWidth: Math.max(160, Math.min(480, values[e.key])),
              });
            }
          }}
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
              <div className="library-location">
                {narrow && (
                  <button
                    type="button"
                    className="library-navigation-button"
                    ref={navigationButton}
                    aria-expanded={drawer}
                    aria-haspopup="true"
                    onClick={() => setDrawer(!drawer)}
                  >
                    {t('images.navigation')}
                  </button>
                )}
                <nav className="library-breadcrumb" aria-label={t('images.location')}>
                  <button
                    type="button"
                    onClick={() => run({ command: 'folder', folder: c.folder === '*' ? '*' : '' })}
                  >
                    {t(c.folder === '*' ? 'images.allFolders' : 'images.rootFolder')}
                  </button>
                  {c.folder !== '*' &&
                    c.folder
                      .split('/')
                      .filter(Boolean)
                      .map((part, i, parts) => (
                        <span key={i}>
                          <Icon name="chevron" size={12} />
                          <button
                            type="button"
                            title={parts.slice(0, i + 1).join('/')}
                            onClick={() =>
                              run({ command: 'folder', folder: parts.slice(0, i + 1).join('/') })
                            }
                          >
                            {part}
                          </button>
                        </span>
                      ))}
                </nav>
                <SettingsButton
                  icon
                  disabled={c.busy}
                  title={t('images.openFolder')}
                  aria-label={t('images.openFolder')}
                  onClick={() => run({ command: 'open-folder' })}
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
              </div>
              <div className="library-toolbar">
                <label className="library-search">
                  <Icon name="search" size={16} />
                  <input
                    type="search"
                    aria-label={t('images.search')}
                    placeholder={t('images.search')}
                    value={query}
                    disabled={c.busy}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (!(e.nativeEvent as InputEvent).isComposing)
                        run({ command: 'query', value: e.target.value });
                    }}
                    onCompositionEnd={(e) =>
                      run({ command: 'query', value: e.currentTarget.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
                        setQuery('');
                        run({ command: 'query', value: '' });
                        e.stopPropagation();
                      }
                    }}
                  />
                </label>
                <div ref={size} />
              </div>
              <div className="library-summary">
                <div>
                  <strong>{t('images.imageCount', { count: c.total })}</strong>
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
                </div>
                <button
                  type="button"
                  disabled={!c.total || c.busy}
                  onClick={() => run({ command: 'select-all' })}
                >
                  {t('images.selectAll', { count: c.total })}
                </button>
              </div>
              <div className="library-selection">
                <span aria-live="polite">{t('images.selectedCount', { count: c.selected })}</span>
                <SettingsButton
                  disabled={!c.selected || c.busy}
                  onClick={() => dialog('batch-add')}
                >
                  {t('images.addToGroup')}
                </SettingsButton>
                <SettingsButton
                  disabled={!c.selected || c.busy}
                  onClick={() => dialog('batch-remove', normalGroup ? c.group : undefined)}
                >
                  {t('images.removeFromGroup')}
                </SettingsButton>
                <SettingsButton
                  disabled={!c.selected || c.busy}
                  onClick={() => dialog('folder-move')}
                >
                  {t('images.moveShort')}
                </SettingsButton>
                <SettingsButton
                  disabled={!c.selected || c.busy}
                  aria-haspopup="menu"
                  onClick={(e) => imageMenu(undefined, e.currentTarget)}
                >
                  {t('images.actions')} ▾
                </SettingsButton>
                {c.selected > 0 && (
                  <button type="button" disabled={c.busy} onClick={() => run({ command: 'clear' })}>
                    {t('images.clearSelection')}
                  </button>
                )}
              </div>
            </div>
            <div
              className="library-status"
              role="status"
              hidden={!c.busy && !c.message && !c.sizeError && !c.error && !error}
            >
              {c.busy ? t('images.working') : c.message}
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
