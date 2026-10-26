import { useHostTranslation } from '../HostTranslation';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useSettingsHints } from './SettingsHints';
import { settingsPopoverScroll } from './settings-popover-scroll';
import './settings-hint-icon.css';

/** Optional title guidance shares the same preference as inline settings hints. */
export function SettingsHintIcon({ title, hint }: { title: string; hint?: string }) {
  const visible = useSettingsHints();
  return visible && hint?.trim() ? <HintPopover title={title} hint={hint} /> : null;
}

/** Command explanations remain available independently of optional settings hints. */
export function SettingsDescriptionIcon({
  title,
  description,
  testId,
}: {
  title: string;
  description?: string;
  testId?: string;
}) {
  return description?.trim() ? (
    <HintPopover title={title} hint={description} description testId={testId} />
  ) : null;
}

/** MCP restrictions remain visible even when optional hints are hidden. */
export function SettingsLockIcon({ title, description }: { title: string; description: string }) {
  return <HintPopover title={title} hint={description} description lock />;
}

function HintPopover({
  title,
  hint,
  description = false,
  testId,
  lock = false,
}: {
  title: string;
  hint: string;
  description?: boolean;
  testId?: string;
  lock?: boolean;
}) {
  const { t } = useHostTranslation();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const show = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (document.activeElement !== trigger.current) setOpen(false);
    }, 100);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useLayoutEffect(() => {
    const tooltip = popup.current;
    const button = trigger.current;
    if (!open || !tooltip || !button) return;
    // A native popover stays above modal dialogs and outside scrolling card clips.
    tooltip.style.maxHeight = 'calc(100dvh - 16px)';
    tooltip.showPopover();
    const rect = button.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const upward = below < tooltip.getBoundingClientRect().height && above > below;
    tooltip.style.maxHeight = `${Math.max(0, upward ? above : below)}px`;
    const size = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - size.width - margin))}px`;
    tooltip.style.top = `${Math.max(margin, upward ? rect.top - gap - size.height : rect.bottom + gap)}px`;
    const outside = (event: PointerEvent) => {
      if (!button.contains(event.target as Node) && !tooltip.contains(event.target as Node))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    const scroll = settingsPopoverScroll(button, tooltip, () => setOpen(false));
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      if (tooltip.isConnected && tooltip.matches(':popover-open')) tooltip.hidePopover();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [open, hint]);
  return (
    <span
      className={description ? 'settings-description-icon' : 'settings-hint-icon'}
      onPointerEnter={show}
      onPointerLeave={leave}
    >
      <button
        ref={trigger}
        type="button"
        className={description ? 'settings-description-trigger' : 'settings-hint-trigger'}
        data-testid={testId}
        aria-label={t(
          lock ? 'settings.mcpAccess.label' : description ? 'common.description' : 'common.hint',
          { title },
        )}
        aria-describedby={id}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          show();
        }}
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          {!lock && <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />}
          {lock ? (
            <>
              <rect
                x="4.5"
                y="8.5"
                width="11"
                height="8"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="10" cy="12.5" r="1" fill="currentColor" />
            </>
          ) : description ? (
            <>
              <path d="M10 9v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="10" cy="6" r=".9" fill="currentColor" />
            </>
          ) : (
            <>
              <path
                d="M7.8 7.5a2.2 2.2 0 0 1 4.4 0c0 1.6-2.2 1.8-2.2 3.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle cx="10" cy="14" r=".9" fill="currentColor" />
            </>
          )}
        </svg>
      </button>
      <span
        ref={popup}
        id={id}
        className="settings-hint-tooltip"
        role="tooltip"
        popover="manual"
        onPointerEnter={show}
        onPointerLeave={leave}
      >
        {hint}
      </span>
    </span>
  );
}
