import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HostPageModel } from '../../shared/host-pages';
import type {
  ImageLibraryPageAction,
  ImageLibraryPageModel,
} from '../../shared/image-library-page';
import { mountImageGallery, mountGallerySizeControl } from '../../../ui/image-gallery';
import { Icon } from '../../shared/ui-icons';
import { settingsPopoverScroll } from '../settings-ui/settings-popover-scroll';
import { useImageLibraryDialogFocus } from '../ImageLibraryDialogHost';
import '../../../ui/image-gallery/gallery.css';
import './image-library.css';
const api = window.dock.pages;
type Action = ImageLibraryPageAction extends infer T
  ? T extends ImageLibraryPageAction
    ? Omit<T, 'id' | 'type'>
    : never
  : never;
export function ImageLibraryPage({ initialModel }: { initialModel: ImageLibraryPageModel }) {
  const captureDialogFocus = useImageLibraryDialogFocus();
  const [model, setModel] = useState<ImageLibraryPageModel>(initialModel);
  const latest = useRef<ImageLibraryPageModel | undefined>(initialModel);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [width, setWidth] = useState(260);
  const [menu, setMenu] = useState('');
  const menuPopup = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const openingDialog = useRef(false);
  const grid = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    size = useRef<HTMLDivElement>(null);
  const gallery = useRef<ReturnType<typeof mountImageGallery> | undefined>(undefined);
  const sizeControl = useRef<ReturnType<typeof mountGallerySizeControl> | undefined>(undefined);
  const viewRevision = useRef(-1);
  const pendingSize = useRef<number | undefined>(undefined);
  const savingSize = useRef(false);
  const sizeDirty = useRef(false);
  const requestedSize = useRef<number | undefined>(undefined);
  const loadingMore = useRef(false);
  const sidebar = useRef<HTMLElement>(null);
  const interactionRoot = useRef<HTMLDivElement>(null);
  const filters = useRef<HTMLDivElement>(null);
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
    if (!latest.current) return;
    if (openingDialog.current && action.command !== 'anchor') return;
    const opensDialog = action.command === 'dialog';
    const releaseFocus = opensDialog ? captureDialogFocus(opener) : undefined;
    if (opensDialog) {
      openingDialog.current = true;
      setDialogPending(true);
    }
    try {
      setError('');
      return await api.act({ ...action, id: latest.current.id, type: 'gallery' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
  useEffect(() => {
    const live = true;
    const accept = (next: HostPageModel) => {
      if (
        !live ||
        next.kind !== 'image-library' ||
        (latest.current?.id === next.id && latest.current.revision > next.revision)
      )
        return;
      latest.current = next;
      setModel(next);
      setQuery(next.content.query);
      if (requestedSize.current === next.content.cardWidth) {
        requestedSize.current = undefined;
        sizeDirty.current = false;
      }
      if (!savingSize.current && !sizeDirty.current) setWidth(next.content.cardWidth);
    };
    accept(initialModel);
  }, [initialModel]);
  const ready = !!model;
  useLayoutEffect(() => {
    if (!ready) return;
    const instance = mountImageGallery(grid.current!, {
      scrollElement: scroll.current!,
      interactions: {
        root: interactionRoot.current!,
        viewport,
        enabled: () => !openingDialog.current && !latest.current?.content.busy,
        canReorder: () => !['all', 'unfiled'].includes(latest.current!.content.group),
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
        scrollTargets: () => [scroll.current!, ...(sidebar.current ? [sidebar.current] : [])],
        more: () => {
          if (loadingMore.current || !latest.current?.content.remaining) return;
          loadingMore.current = true;
          void act({ command: 'more' })
            .catch(() => {})
            .finally(() => {
              loadingMore.current = false;
            });
        },
      },
      image: async (assetId, edge) =>
        (await api.act({
          id: latest.current!.id,
          type: 'gallery',
          command: 'image',
          assetId,
          edge,
        })) as string,
      select: (imageId, selected) => run({ command: 'select', imageId, selected }),
      activate: (imageId) => run({ command: 'dialog', kind: 'preview', imageId }),
      action: (imageId, actionId) =>
        run({
          command: 'dialog',
          kind: actionId === 'delete-image' ? 'delete-image' : 'membership',
          imageId,
        }),
    });
    gallery.current = instance;
    sizeControl.current = mountGallerySizeControl(size.current!, {
      value: latest.current!.content.cardWidth,
      change: (value) => {
        sizeDirty.current = value !== latest.current?.content.cardWidth;
        setWidth(value);
      },
      commit: (value) => saveSize(value),
    });
    let frame = 0;
    const saveAnchor = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        run({ command: 'anchor', anchor: instance.anchor() });
      });
    };
    scroll.current!.addEventListener('scroll', saveAnchor, { passive: true });
    const scroller = scroll.current!;
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', saveAnchor);
      instance.dispose();
      sizeControl.current?.dispose();
      gallery.current = undefined;
    };
  }, [ready]);
  useLayoutEffect(() => {
    if (!model || !gallery.current) return;
    const c = model.content;
    gallery.current.setModel({
      items: c.items,
      cardWidth: width,
      fit: 'contain',
      selection: 'multiple',
      empty: c.query
        ? '該当する画像はありません'
        : c.group === 'all'
          ? '画像がありません'
          : 'このグループには画像がありません',
    });
    sizeControl.current?.setValue(width);
    if (viewRevision.current !== c.viewRevision) {
      gallery.current.cancelInteraction();
      viewRevision.current = c.viewRevision;
      if (c.anchor) gallery.current.restore(c.anchor);
      else scroll.current!.scrollTop = 0;
    }
  }, [model, width]);
  useLayoutEffect(() => {
    const popup = menuPopup.current,
      button = menuButton.current;
    if (!menu || !popup || !button) return;
    popup.style.maxHeight = 'calc(100dvh - 16px)';
    popup.showPopover();
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upward = below < popup.getBoundingClientRect().height && above > below;
    popup.style.maxHeight = `${Math.max(0, upward ? above : below)}px`;
    const size = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - size.width - 8))}px`;
    popup.style.top = `${Math.max(8, upward ? rect.top - size.height - 4 : rect.bottom + 4)}px`;
    popup.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const dismiss = () => setMenu('');
    const outside = (e: PointerEvent) => {
      if (!popup.contains(e.target as Node) && !button.contains(e.target as Node)) dismiss();
    };
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing && e.keyCode !== 229) {
        dismiss();
        button.focus({ preventScroll: true });
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onScroll = settingsPopoverScroll(button, popup, dismiss);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', close, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', dismiss);
    return () => {
      if (popup.isConnected && popup.matches(':popover-open')) popup.hidePopover();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', close, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [menu]);
  useEffect(() => setMenu(''), [model.content.group]);
  if (!model) return error ? <p role="alert">{error}</p> : null;
  const c = model.content,
    current = c.groups.find((g) => g.id === c.group);
  const normalGroup = !['all', 'unfiled'].includes(c.group);
  const dialog = (
    kind: 'add' | 'rename' | 'delete' | 'order' | 'order-images',
    groupId?: string,
  ) => {
    const opener = menu ? (menuButton.current ?? undefined) : undefined;
    setMenu('');
    run({ command: 'dialog', kind, groupId }, opener);
  };
  return (
    <section className="library-page" inert={dialogPending}>
      <header className="library-header">
        <div>
          <h1>画像ライブラリー</h1>
          <p>AppDockで使う画像を、ひとつの場所に。</p>
        </div>
        <button
          className="library-primary"
          disabled={c.busy}
          onClick={() => run({ command: 'add' })}
        >
          <span aria-hidden="true">＋</span>画像を追加
        </button>
      </header>
      <div className="library-layout" ref={interactionRoot}>
        <aside className="library-sidebar" aria-label="画像グループ" ref={sidebar}>
          <nav>
            {c.groups.slice(0, 2).map((g) => (
              <button
                key={g.id}
                aria-current={g.id === c.group ? 'page' : undefined}
                onClick={() => run({ command: 'group', groupId: g.id })}
              >
                <span>{g.title}</span>
                <small>{g.count}</small>
              </button>
            ))}
          </nav>
          <div className="library-group-heading">
            <strong>グループ</strong>
            <button
              aria-label="グループを並べ替え"
              disabled={!c.canOrder || c.busy}
              onClick={() => dialog('order')}
            >
              並べ替え
            </button>
          </div>
          <nav>
            {c.groups.slice(2).map((g) => (
              <div className="library-group-row" key={g.id}>
                <button
                  data-gallery-group={g.id}
                  data-testid="library-group-target"
                  disabled={c.busy}
                  aria-current={g.id === c.group ? 'page' : undefined}
                  onClick={() => run({ command: 'group', groupId: g.id })}
                >
                  <span>{g.title}</span>
                  <small>{g.count}</small>
                </button>
                <button
                  id={`library-group-menu-trigger-${g.id}`}
                  aria-label={`${g.title}の操作`}
                  aria-haspopup="menu"
                  aria-expanded={menu === g.id}
                  disabled={c.busy}
                  onClick={(e) => {
                    menuButton.current = e.currentTarget;
                    setMenu(menu === g.id ? '' : g.id);
                  }}
                >
                  …
                </button>
                {menu === g.id && (
                  <div
                    className="library-group-menu"
                    ref={menuPopup}
                    popover="manual"
                    role="menu"
                    aria-labelledby={`library-group-menu-trigger-${g.id}`}
                    onBlur={(e) => {
                      if (
                        !e.currentTarget.contains(e.relatedTarget as Node) &&
                        e.relatedTarget !== menuButton.current
                      )
                        setMenu('');
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.nativeEvent.isComposing ||
                        e.altKey ||
                        e.ctrlKey ||
                        e.metaKey ||
                        e.shiftKey
                      )
                        return;
                      const buttons = [
                        ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
                      ];
                      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                      const index =
                        e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? buttons.length - 1
                            : e.key === 'ArrowDown'
                              ? (current + 1) % buttons.length
                              : e.key === 'ArrowUp'
                                ? (current + buttons.length - 1) % buttons.length
                                : -1;
                      if (index >= 0) {
                        e.preventDefault();
                        buttons[index].focus();
                      }
                    }}
                  >
                    <button role="menuitem" onClick={() => dialog('order-images', g.id)}>
                      画像を並べ替え
                    </button>
                    <button role="menuitem" onClick={() => dialog('rename', g.id)}>
                      名前を変更
                    </button>
                    <button role="menuitem" onClick={() => dialog('delete', g.id)}>
                      グループを削除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </nav>
          <button
            className="library-add-group"
            disabled={!c.canAddGroup || c.busy}
            onClick={() => dialog('add')}
          >
            <span aria-hidden="true">＋</span>グループを追加
          </button>
        </aside>
        <section className="library-content" aria-label="登録画像">
          <div className="library-scroll" ref={scroll}>
            <div className="library-filter-panel" ref={filters}>
              <div className="library-mobile-groups">
                <label>
                  グループ
                  <select
                    aria-label="グループ"
                    value={c.group}
                    onChange={(e) => run({ command: 'group', groupId: e.target.value })}
                  >
                    {c.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title} ({g.count})
                      </option>
                    ))}
                  </select>
                </label>
                <details>
                  <summary>グループの管理</summary>
                  <button disabled={!c.canAddGroup || c.busy} onClick={() => dialog('add')}>
                    追加
                  </button>
                  <button
                    disabled={!normalGroup || c.busy}
                    onClick={() => dialog('rename', c.group)}
                  >
                    名前を変更
                  </button>
                  <button
                    disabled={!normalGroup || c.busy}
                    onClick={() => dialog('delete', c.group)}
                  >
                    削除
                  </button>
                  <button disabled={!c.canOrder || c.busy} onClick={() => dialog('order')}>
                    並べ替え
                  </button>
                  <button
                    disabled={!normalGroup || c.busy}
                    onClick={() => dialog('order-images', c.group)}
                  >
                    画像を並べ替え
                  </button>
                </details>
              </div>
              <div className="library-toolbar">
                <label className="library-search">
                  <Icon name="search" size={16} />
                  <input
                    type="search"
                    aria-label="ファイル名で検索"
                    placeholder="ファイル名で検索"
                    value={query}
                    maxLength={260}
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
                  <strong>{current?.title}</strong>
                  <span>{c.total}枚</span>
                </div>
                <button
                  disabled={!c.total || c.busy}
                  onClick={() => run({ command: 'select-all' })}
                >
                  {c.query ? '検索結果を' : ''}すべて選択（{c.total}枚）
                </button>
              </div>
              <div className="library-selection" aria-live="polite">
                {c.selected > 0 && (
                  <>
                    <span>{c.selected}枚を選択</span>
                    <button
                      disabled={c.busy}
                      onClick={() => run({ command: 'dialog', kind: 'batch-add' })}
                    >
                      グループに追加
                    </button>
                    {normalGroup && (
                      <button
                        disabled={c.busy}
                        onClick={() =>
                          run({ command: 'dialog', kind: 'batch-remove', groupId: c.group })
                        }
                      >
                        このグループから外す
                      </button>
                    )}
                    <button disabled={c.busy} onClick={() => run({ command: 'clear' })}>
                      選択を解除
                    </button>
                  </>
                )}
              </div>
              <div className="library-status" role="status">
                {c.busy ? '画像を追加しています…' : c.message}
                {c.sizeError && (
                  <div role="alert">
                    {c.sizeError}
                    <button onClick={() => saveSize(width)}>保存を再試行</button>
                  </div>
                )}
                {(error || c.error) && (
                  <div role="alert">
                    {error || c.error}
                    <button onClick={() => run({ command: 'reload' })}>再取得</button>
                    {c.canRetryMembership && (
                      <button onClick={() => run({ command: 'retry-membership' })}>
                        グループへの追加を再試行
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div ref={grid} />
            {!c.total && (
              <div className="library-empty-actions">
                {c.query ? (
                  <button onClick={() => run({ command: 'query', value: '' })}>検索を解除</button>
                ) : (
                  <>
                    <button disabled={c.busy} onClick={() => run({ command: 'add' })}>
                      画像を追加
                    </button>
                    {normalGroup && (
                      <p>登録済みの画像は「すべて」から選び、グループに追加できます。</p>
                    )}
                  </>
                )}
              </div>
            )}
            {!!c.remaining && (
              <button className="library-more" onClick={() => run({ command: 'more' })}>
                さらに表示（残り{c.remaining}枚）
              </button>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
