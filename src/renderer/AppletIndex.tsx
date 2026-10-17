import { useState } from 'react';
import type { ExtensionSnapshot } from '../shared/contracts';
import { moveApplet } from '../shared/applet-order';
import { Toggle } from './settings-ui/Toggle';
import type { SettingsEditor } from './useSettingsEditor';

export function AppletIndex({
  applets,
  selected,
  onSelect,
  editor,
  busy,
}: {
  applets: ExtensionSnapshot[];
  selected?: string;
  onSelect(id: string): void;
  editor: SettingsEditor;
  busy: boolean;
}) {
  const [search, setSearch] = useState('');
  const [reordering, setReordering] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const move = (id: string, to: string) => {
    if (busy || id === to) return;
    const order = moveApplet(
      applets.map((a) => a.id),
      id,
      to,
    );
    editor.edit({
      ...editor.value,
      appletOrder: [...order, ...editor.value.appletOrder.filter((id) => !order.includes(id))],
    });
    setAnnouncement(
      `${applets.find((a) => a.id === id)?.displayName}を${order.indexOf(id) + 1}番目へ移動しました。`,
    );
  };
  const filtered = applets.filter((a) =>
    `${a.displayName} ${a.name} ${a.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="applet-index-heading">
        <h2>Applet</h2>
        <label className="applet-reorder-toggle">
          並べ替え
          <Toggle
            label="Appletの並べ替え"
            checked={reordering}
            disabled={busy}
            onChange={(value) => {
              setReordering(value);
              setSearch('');
              setDragged(null);
              setTarget(null);
            }}
          />
        </label>
      </div>
      <input
        aria-label="Appletを検索"
        placeholder="Appletを検索…"
        value={search}
        disabled={reordering}
        onChange={(event) => setSearch(event.target.value)}
      />
      {reordering && (
        <div className="applet-reorder-help">
          <p>つまみをドラッグするか、上下ボタンで移動できます。変更は保存で反映します。</p>
          <small>ページ上部で設定・ショートカットと一緒に保存できます。</small>
        </div>
      )}
      <div className={`sidebar-extensions${reordering ? ' reordering' : ''}`}>
        {filtered.map((applet, index) => (
          <div
            key={applet.id}
            className={`applet-index-row${target === applet.id ? ' drop-target' : ''}`}
            data-applet-id={applet.id}
            onDragOver={(event) => {
              if (!reordering || !dragged || busy) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setTarget(applet.id);
            }}
            onDrop={(event) => {
              if (!reordering || !dragged || busy) return;
              event.preventDefault();
              move(dragged, applet.id);
              setDragged(null);
              setTarget(null);
            }}
          >
            {reordering && (
              <button
                className="applet-drag-handle"
                draggable={!busy}
                disabled={busy}
                aria-label={`${applet.displayName}をドラッグして移動`}
                onDragStart={(event) => {
                  setDragged(applet.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', applet.id);
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setTarget(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                  event.preventDefault();
                  const to = index + (event.key === 'ArrowUp' ? -1 : 1);
                  if (applets[to]) move(applet.id, applets[to].id);
                }}
              >
                ⠿
              </button>
            )}
            <button
              className={`applet-select${selected === applet.id ? ' selected' : ''}`}
              onClick={() => onSelect(applet.id)}
              aria-current={selected === applet.id ? 'true' : undefined}
            >
              <span title={applet.displayName}>{applet.displayName}</span>
              {!reordering && (
                <small>
                  {
                    {
                      waiting: '開始待ち',
                      running: '実行中',
                      stopped: '停止中',
                      starting: '起動中',
                      stopping: '停止処理中',
                      error: 'エラー',
                    }[applet.state]
                  }
                </small>
              )}
            </button>
            {reordering && (
              <div className="applet-order-actions">
                <button
                  aria-label={`${applet.displayName}を上へ移動`}
                  disabled={busy || index === 0}
                  onClick={() => move(applet.id, applets[index - 1].id)}
                >
                  ↑
                </button>
                <button
                  aria-label={`${applet.displayName}を下へ移動`}
                  disabled={busy || index === applets.length - 1}
                  onClick={() => move(applet.id, applets[index + 1].id)}
                >
                  ↓
                </button>
              </div>
            )}
          </div>
        ))}
        {!filtered.length && <p className="empty">該当するAppletはありません。</p>}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}
