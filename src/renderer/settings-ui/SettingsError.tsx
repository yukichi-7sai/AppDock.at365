import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './settings-error.css';

/** Reserve an icon beside the field; errors remain available even when hints are off. */
export function SettingsError({ error, id }: { error?: string; id: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const show = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (document.activeElement !== trigger.current) setOpen(false);
    }, 100);
  };
  useEffect(() => {
    setOpen(false);
    return () => window.clearTimeout(timer.current);
  }, [error]);
  useLayoutEffect(() => {
    const tooltip = popup.current;
    const button = trigger.current;
    if (!open || !error || !tooltip || !button) return;
    tooltip.style.maxHeight = 'min(320px, calc(100dvh - 16px))';
    tooltip.showPopover();
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 14;
    const above = rect.top - 14;
    const upward = below < tooltip.getBoundingClientRect().height && above > below;
    tooltip.style.maxHeight = `${Math.max(0, Math.min(320, upward ? above : below))}px`;
    const size = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - size.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, upward ? rect.top - 6 - size.height : rect.bottom + 6)}px`;
    tooltip.scrollTop = 0;
    const outside = (event: PointerEvent) => {
      if (!button.contains(event.target as Node) && !tooltip.contains(event.target as Node))
        setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      } else if (document.activeElement === button) {
        const amounts: Record<string, number> = {
          ArrowDown: 40,
          ArrowUp: -40,
          PageDown: tooltip.clientHeight,
          PageUp: -tooltip.clientHeight,
        };
        const amount = amounts[event.key];
        if (amount !== undefined) {
          event.preventDefault();
          event.stopPropagation();
          tooltip.scrollTop += amount;
        }
      }
    };
    const dismiss = () => setOpen(false);
    const scroll = (event: Event) => {
      if (!tooltip.contains(event.target as Node)) dismiss();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keydown, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', dismiss);
    return () => {
      if (tooltip.isConnected && tooltip.matches(':popover-open')) tooltip.hidePopover();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keydown, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open, error]);
  return (
    <span className="settings-error-icon">
      <span id={id} className="sr-only" role="alert" aria-atomic="true">
        {error}
      </span>
      <button
        ref={trigger}
        type="button"
        className="settings-error-trigger"
        style={{ visibility: error ? 'visible' : 'hidden' }}
        disabled={!error}
        aria-label="インストールのエラー"
        aria-describedby={`${id}-tooltip`}
        onPointerEnter={show}
        onPointerLeave={leave}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={show}
      >
        <span aria-hidden="true">!</span>
      </button>
      <span
        ref={popup}
        id={`${id}-tooltip`}
        className="settings-error-tooltip"
        role="tooltip"
        popover="manual"
        onPointerEnter={show}
        onPointerLeave={leave}
      >
        {error}
      </span>
    </span>
  );
}
