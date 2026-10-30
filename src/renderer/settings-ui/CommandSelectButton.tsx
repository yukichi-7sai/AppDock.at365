import type { ButtonHTMLAttributes } from 'react';
import { useHostTranslation } from '../HostTranslation';
import './command-select-button.css';

/** A shared entrance to the command palette's selection mode. */
export function CommandSelectButton({
  commandTitle,
  add = false,
  className = '',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  commandTitle?: string;
  add?: boolean;
}) {
  const { t } = useHostTranslation();
  return (
    <button
      {...props}
      type="button"
      className={`command-select-button ${className}`}
      aria-haspopup="dialog"
    >
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M7 5h10M7 10h10M7 15h10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M3 5h.01M3 10h.01M3 15h.01"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
      <span className="command-select-title">
        {commandTitle || t(add ? 'settings.commandSelect.add' : 'settings.commandSelect.choose')}
      </span>
      {commandTitle && (
        <span className="command-select-change">{t('settings.commandSelect.change')}</span>
      )}
    </button>
  );
}
