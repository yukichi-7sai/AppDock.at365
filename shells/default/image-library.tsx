import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ShellPageApi, ShellPageModel } from '../../src/shared/shell-pages';
import type {
  ImageLibraryPageAction,
  ImageLibraryPageModel,
} from '../../src/shared/image-library-page';
import { mountImageGallery, mountGallerySizeControl } from '../../ui/image-gallery';
import { shortcutFromEvent } from '../../src/shared/commands';
import { Icon } from '../../src/shared/ui-icons';
import '../../ui/image-gallery/gallery.css';
import './image-library.css';
declare global {
  interface Window {
    appdockPage: ShellPageApi;
  }
}
const api = window.appdockPage;
type Action = ImageLibraryPageAction extends infer T
  ? T extends ImageLibraryPageAction
    ? Omit<T, 'id' | 'type'>
    : never
  : never;
function App() {
  const [model, setModel] = useState<ImageLibraryPageModel>();
  const latest = useRef<ImageLibraryPageModel | undefined>(undefined);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [width, setWidth] = useState(260);
  const [menu, setMenu] = useState('');
  const grid = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    size = useRef<HTMLDivElement>(null);
  const gallery = useRef<ReturnType<typeof mountImageGallery> | undefined>(undefined);
  const sizeControl = useRef<ReturnType<typeof mountGallerySizeControl> | undefined>(undefined);
  const viewRevision = useRef(-1);
  const pendingSize = useRef<number | undefined>(undefined);
  const savingSize = useRef(false);
  const sizeDirty = useRef(false);
  const act = async (action: Action) => {
    if (!latest.current) return;
    try {
      setError('');
      return await api.act({ ...action, id: latest.current.id, type: 'gallery' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  };
  const run = (action: Action) => {
    void act(action).catch(() => {});
  };
  const saveSize = (value: number) => {
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
        sizeDirty.current = false;
      }
    })().catch(() => {});
  };
  useEffect(() => {
    let live = true;
    const accept = (next: ShellPageModel) => {
      if (
        !live ||
        next.kind !== 'image-library' ||
        (latest.current?.id === next.id && latest.current.revision > next.revision)
      )
        return;
      latest.current = next;
      document.documentElement.dataset.theme = next.dark ? 'dark' : 'light';
      setModel(next);
      setQuery(next.content.query);
      if (!savingSize.current && !sizeDirty.current) setWidth(next.content.cardWidth);
    };
    const off = api.onChanged(accept);
    void api
      .connect()
      .then(async (connection) => {
        if (!live) return;
        accept(connection.snapshot);
        await api.ready(connection.sessionId);
      })
      .catch((e) => setError(String(e)));
    const controls = () =>
      [...document.querySelectorAll<HTMLElement>('button,input,select,summary')].filter(
        (e) => !e.matches(':disabled') && e.getClientRects().length,
      );
    const offFocus = api.onFocus((edge) =>
      (edge === 'first' ? controls()[0] : controls().at(-1))?.focus({ preventScroll: true }),
    );
    const keys = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      if (e.key === 'Tab') {
        const list = controls();
        if (document.activeElement === (e.shiftKey ? list[0] : list.at(-1))) {
          e.preventDefault();
          void api.focusHost(e.shiftKey ? 'before' : 'after');
        }
        return;
      }
      if (
        e.target instanceof Element &&
        e.target.closest('input,textarea,select') &&
        !e.ctrlKey &&
        !e.altKey
      )
        return;
      const key = shortcutFromEvent(e);
      if (key) void api.shortcut(key).catch((err) => setError(String(err)));
    };
    document.addEventListener('keydown', keys);
    return () => {
      live = false;
      off();
      offFocus();
      document.removeEventListener('keydown', keys);
    };
  }, []);
  const ready = !!model;
  useLayoutEffect(() => {
    if (!ready) return;
    const instance = mountImageGallery(grid.current!, {
      scrollElement: scroll.current!,
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
          kind: actionId === 'preview' ? 'preview' : 'membership',
          imageId,
        }),
    });
    gallery.current = instance;
    sizeControl.current = mountGallerySizeControl(size.current!, {
      value: latest.current!.content.cardWidth,
      change: (value) => {
        sizeDirty.current = true;
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
      viewRevision.current = c.viewRevision;
      if (c.anchor) gallery.current.restore(c.anchor);
      else scroll.current!.scrollTop = 0;
    }
  }, [model, width]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu('');
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menu]);
  if (!model) return error ? <p role="alert">{error}</p> : null;
  const c = model.content,
    current = c.groups.find((g) => g.id === c.group);
  const normalGroup = !['all', 'unfiled'].includes(c.group);
  const dialog = (kind: 'add' | 'rename' | 'delete' | 'order', groupId?: string) => {
    setMenu('');
    run({ command: 'dialog', kind, groupId });
  };
  return (
    <main className="library-page">
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
      <div className="library-layout">
        <aside className="library-sidebar" aria-label="画像グループ">
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
                  aria-current={g.id === c.group ? 'page' : undefined}
                  onClick={() => run({ command: 'group', groupId: g.id })}
                >
                  <span>{g.title}</span>
                  <small>{g.count}</small>
                </button>
                <button
                  aria-label={`${g.title}の操作`}
                  aria-expanded={menu === g.id}
                  disabled={c.busy}
                  onClick={() => setMenu(menu === g.id ? '' : g.id)}
                >
                  …
                </button>
                {menu === g.id && (
                  <div className="library-group-menu">
                    <button onClick={() => dialog('rename', g.id)}>名前を変更</button>
                    <button onClick={() => dialog('delete', g.id)}>グループを削除</button>
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
              <button disabled={!normalGroup || c.busy} onClick={() => dialog('rename', c.group)}>
                名前を変更
              </button>
              <button disabled={!normalGroup || c.busy} onClick={() => dialog('delete', c.group)}>
                削除
              </button>
              <button disabled={!c.canOrder || c.busy} onClick={() => dialog('order')}>
                並べ替え
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
                onCompositionEnd={(e) => run({ command: 'query', value: e.currentTarget.value })}
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
            <button disabled={!c.total || c.busy} onClick={() => run({ command: 'select-all' })}>
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
          <div className="library-scroll" ref={scroll}>
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
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
