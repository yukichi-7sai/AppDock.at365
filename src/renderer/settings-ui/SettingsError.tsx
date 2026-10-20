import { useEffect, useId, useRef } from 'react';
import './settings-error.css';

/** One reserved line keeps errors from resizing the surrounding settings surface. */
export function SettingsError({ error }: { error?: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const details = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const popup = details.current;
    if (popup?.matches(':popover-open')) popup.hidePopover();
    const focusDetails = () => {
      if (popup?.matches(':popover-open')) popup.focus({ preventScroll: true });
    };
    popup?.addEventListener('toggle', focusDetails);
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.isComposing ||
        event.keyCode === 229 ||
        !popup?.matches(':popover-open')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      popup.hidePopover();
      trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('keydown', escape, true);
      popup?.removeEventListener('toggle', focusDetails);
    };
  }, [error]);
  return (
    <div className="settings-error-slot" data-error={!!error}>
      <span className="settings-error-summary" role="alert" aria-atomic="true">
        {error && (
          <>
            <span className="settings-error-mark" aria-hidden="true">
              !
            </span>
            <span>{error}</span>
          </>
        )}
      </span>
      <button
        ref={trigger}
        type="button"
        popoverTarget={id}
        disabled={!error}
        aria-label="エラーの詳細を表示"
      >
        詳細
      </button>
      <div
        id={id}
        ref={details}
        popover="auto"
        className="settings-error-details"
        role="region"
        aria-label="エラーの詳細"
        tabIndex={-1}
      >
        <header>
          <strong>エラーの詳細</strong>
          <button
            type="button"
            aria-label="エラーの詳細を閉じる"
            onClick={() => {
              details.current?.hidePopover();
              trigger.current?.focus({ preventScroll: true });
            }}
          >
            ×
          </button>
        </header>
        <p>{error}</p>
      </div>
    </div>
  );
}
