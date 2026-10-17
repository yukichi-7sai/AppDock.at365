import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Keep row actions outside the scrolling table so opening them never changes its layout. */
export function BindingActions({
  label,
  onDuplicate,
  onDelete,
  removalKind = 'delete',
  confirmDelete = true,
  extraActions = [],
}: {
  label: string;
  onDuplicate?(): void;
  onDelete?(): void;
  removalKind?: 'delete' | 'clear-key' | 'binding';
  confirmDelete?: boolean;
  extraActions?: { title: string; onClick(): void; disabled?: boolean }[];
}) {
  const [stage, setStage] = useState<'menu' | 'confirm' | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (restore = true) => {
    setStage(null);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!stage || !panel.current || !trigger.current) return;
    const popup = panel.current;
    const anchor = trigger.current.getBoundingClientRect();
    const bounds = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - 8))}px`;
    popup.style.top = `${Math.max(
      8,
      Math.min(
        anchor.bottom + bounds.height + 6 <= innerHeight - 8
          ? anchor.bottom + 6
          : anchor.top - bounds.height - 6,
        innerHeight - bounds.height - 8,
      ),
    )}px`;
    popup.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      if (
        e.target instanceof Node &&
        !popup.contains(e.target) &&
        !trigger.current?.contains(e.target)
      )
        close(false);
    };
    const dismiss = () => close();
    const scroll = (e: Event) => {
      if (e.target instanceof Node && popup.contains(e.target)) return;
      dismiss();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [stage]);
  return (
    <>
      <button
        ref={trigger}
        className="gesture-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={stage !== null}
        aria-controls={stage ? id : undefined}
        onClick={() => (stage ? close() : setStage('menu'))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            setStage('menu');
          }
        }}
      >
        …
      </button>
      {stage &&
        createPortal(
          <div
            id={id}
            ref={panel}
            className="gesture-actions-popup"
            role={stage === 'menu' ? 'menu' : 'alertdialog'}
            aria-label={
              stage === 'menu'
                ? label
                : removalKind === 'clear-key'
                  ? 'キーの割り当てのクリア確認'
                  : '割り当ての削除確認'
            }
            aria-describedby={stage === 'confirm' ? `${id}-message` : undefined}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              } else if (e.key === 'Tab' && stage === 'menu') {
                close();
              } else if (
                ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) ||
                e.key === 'Tab'
              ) {
                e.preventDefault();
                const buttons = Array.from(
                  panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
                );
                if (!buttons.length) return;
                const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const next =
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? buttons.length - 1
                      : (current + (e.key === 'ArrowUp' || e.shiftKey ? -1 : 1) + buttons.length) %
                        buttons.length;
                buttons[next]?.focus();
              }
            }}
          >
            {stage === 'menu' ? (
              <>
                {extraActions.map((action) => (
                  <button
                    key={action.title}
                    role="menuitem"
                    disabled={action.disabled}
                    onClick={() => {
                      close();
                      action.onClick();
                    }}
                  >
                    {action.title}
                  </button>
                ))}
                {onDuplicate && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      close();
                      onDuplicate();
                    }}
                  >
                    複製
                  </button>
                )}
                {onDelete && (
                  <button
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      if (confirmDelete) setStage('confirm');
                      else {
                        close(false);
                        onDelete();
                      }
                    }}
                  >
                    {removalKind === 'clear-key'
                      ? 'キーのクリア…'
                      : removalKind === 'binding'
                        ? '削除'
                        : '削除…'}
                  </button>
                )}
              </>
            ) : (
              <>
                <p id={`${id}-message`}>
                  {removalKind === 'clear-key'
                    ? 'このキーの割り当てをクリアしますか？'
                    : removalKind === 'binding'
                      ? 'このキーの割り当てを削除しますか？ コマンド自体は削除されません。'
                      : 'この割り当てを削除しますか？'}
                </p>
                <button onClick={() => setStage('menu')}>キャンセル</button>
                <button
                  className="danger"
                  onClick={() => {
                    close();
                    onDelete?.();
                  }}
                >
                  {removalKind === 'clear-key' ? 'クリアする' : '削除する'}
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
