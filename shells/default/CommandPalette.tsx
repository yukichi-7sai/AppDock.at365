import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { rankCommands, type UiCommand } from '../../src/shared/commands';
import { Icon } from '../../src/shared/ui-icons';

/** Execution and selection share navigation and favorites; only the caller decides the action. */
export function CommandPalette({
  commands,
  pins = [],
  onPinAction,
  shortcuts = {},
  busy = false,
  mode = 'execute',
  onChoose,
  onClose,
  error = '',
}: {
  commands: UiCommand[];
  pins?: string[];
  onPinAction?(
    type: 'togglePin' | 'movePin',
    commandId: string,
    direction?: -1 | 1,
    visibleIds?: string[],
  ): void;
  shortcuts?: Record<string, string[]>;
  busy?: boolean;
  mode?: 'execute' | 'select';
  onChoose(command: UiCommand): void;
  onClose(): void;
  error?: string;
}) {
  const [query, setQuery] = useState(''),
    [index, setIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null),
    prefix = useId();
  const filtered = rankCommands(
    commands.filter(
      (c) =>
        !c.hidden &&
        `${c.title} ${c.description ?? ''} ${c.extension} ${c.id}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
    pins,
  );
  const selected = Math.min(index, Math.max(0, filtered.length - 1));
  const visiblePins = filtered.filter((c) => pins.includes(c.id)).map((c) => c.id);
  const canChoose = (c: UiCommand) => !busy && (mode === 'select' || c.available);
  useLayoutEffect(() => {
    ref.current?.querySelector('input')?.focus();
  }, [mode]);
  useEffect(() => {
    ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, query]);
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="command-palette"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'select' ? 'コマンドを選択' : 'コマンドパレット'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
          if (e.key === 'Tab') {
            const nodes = Array.from(
              ref.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)') ?? [],
            );
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="palette-input">
          <Icon name="search" />
          <input
            aria-label="コマンドを検索"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={`${prefix}-results`}
            aria-activedescendant={filtered[selected] ? `${prefix}-option-${selected}` : undefined}
            placeholder={mode === 'select' ? '割り当てるコマンドを検索…' : 'コマンドを入力…'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex(
                  filtered.length
                    ? (selected + (e.key === 'ArrowDown' ? 1 : -1) + filtered.length) %
                        filtered.length
                    : 0,
                );
              }
              if (
                e.key === 'Enter' &&
                !e.repeat &&
                filtered[selected] &&
                canChoose(filtered[selected])
              ) {
                e.preventDefault();
                onChoose(filtered[selected]);
              }
            }}
          />
          <button aria-label="パレットを閉じる" onClick={onClose}>
            <kbd>Esc</kbd>
          </button>
        </div>
        <div className="palette-label">{mode === 'select' ? 'コマンドを選択' : 'COMMANDS'}</div>
        <div
          id={`${prefix}-results`}
          className="palette-results"
          role="listbox"
          aria-label="コマンド検索結果"
        >
          {filtered.map((c, i) => {
            const pinned = pins.includes(c.id),
              pinIndex = visiblePins.indexOf(c.id);
            return (
              <div
                className={`palette-command ${pinned ? 'pinned' : ''} ${i === selected ? 'highlighted' : ''}`}
                id={`${prefix}-option-${i}`}
                role="option"
                aria-selected={i === selected}
                key={c.id}
                data-command-id={c.id}
              >
                <button
                  className="palette-execute"
                  disabled={!canChoose(c)}
                  onClick={() => onChoose(c)}
                >
                  <Icon name={mode === 'select' ? 'check' : 'play'} size={16} />
                  <div>
                    {c.title}
                    {c.description && <small>{c.description}</small>}
                    <small title={c.extension}>
                      <span className="command-id">{c.id}</span>
                      {!c.available && (
                        <span> · {c.disabledReason ?? 'Applet起動後に利用できます'}</span>
                      )}
                      {pinned && <span className="pin-badge">PINNED</span>}
                    </small>
                  </div>
                  {shortcuts[c.id]?.[0] && <kbd>{shortcuts[c.id][0]}</kbd>}
                </button>
                {onPinAction && (
                  <div className="palette-pin-controls">
                    {pinned && (
                      <>
                        <button
                          aria-label={`${c.title}を上に移動`}
                          disabled={busy || pinIndex <= 0}
                          onClick={() => onPinAction('movePin', c.id, -1, visiblePins)}
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`${c.title}を下に移動`}
                          disabled={busy || pinIndex === visiblePins.length - 1}
                          onClick={() => onPinAction('movePin', c.id, 1, visiblePins)}
                        >
                          ↓
                        </button>
                      </>
                    )}
                    <button
                      className="pin-toggle"
                      aria-label={`${c.title}を${pinned ? 'ピン留め解除' : 'ピン留め'}`}
                      aria-pressed={pinned}
                      disabled={busy}
                      onClick={() => onPinAction('togglePin', c.id)}
                    >
                      {pinned ? '★' : '☆'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!filtered.length && <p className="empty">該当するコマンドはありません。</p>}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="palette-footer">
          ↑↓キーで選択・Enterで{mode === 'select' ? '選択（実行しません）' : '実行'}・Escで閉じる。
          {onPinAction && '☆でピン留め、矢印ボタンで並べ替え。'}
        </div>
      </div>
    </div>,
    document.body,
  );
}
