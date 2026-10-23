import { useHostTranslation } from '../HostTranslation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { settingsPopoverScroll } from './settings-popover-scroll';
import './settings-error.css';

/** Stable summary row with keyboard-readable, scrollable error details. */
export function SettingsError({ error, id }: { error?: string; id: string }) {
  const { t } = useHostTranslation();
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
      if (
        document.activeElement !== trigger.current &&
        !popup.current?.contains(document.activeElement)
      )
        setOpen(false);
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
        button.focus({ preventScroll: true });
        setOpen(false);
      } else if (document.activeElement === button || tooltip.contains(document.activeElement)) {
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
    const scroll = settingsPopoverScroll(button, tooltip, dismiss);
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
    <div className="settings-error" data-error={!!error}>
      <span
        id={id}
        className="sr-only"
        role={error ? 'alert' : undefined}
        aria-live="assertive"
        aria-atomic="true"
      >
        {error}
      </span>
      <span className="settings-error-summary" aria-hidden="true">
        {error}
      </span>
      <button
        ref={trigger}
        type="button"
        className="settings-error-trigger"
        style={{ visibility: error ? 'visible' : 'hidden' }}
        disabled={!error}
        aria-label={t('common.errorDetails')}
        aria-describedby={`${id}-tooltip`}
        onPointerEnter={show}
        onPointerLeave={leave}
        onFocus={show}
        onBlur={(event) => {
          if (!popup.current?.contains(event.relatedTarget) && !popup.current?.matches(':hover'))
            setOpen(false);
        }}
        onClick={show}
      >
        {t('common.details')}
      </button>
      <span
        ref={popup}
        id={`${id}-tooltip`}
        className="settings-error-tooltip"
        role="tooltip"
        tabIndex={-1}
        popover="manual"
        onPointerEnter={show}
        onPointerLeave={leave}
        onBlur={(event) => {
          if (
            event.relatedTarget !== trigger.current &&
            !popup.current?.contains(event.relatedTarget)
          )
            setOpen(false);
        }}
      >
        {error}
      </span>
    </div>
  );
}
