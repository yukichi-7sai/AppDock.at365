import type { ButtonHTMLAttributes } from 'react';
import './settings-button.css';

/** Keep the action label and width stable while work is pending. */
export function SettingsButton({
  pending,
  disabled,
  children,
  icon = false,
  appearance,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  icon?: boolean;
  appearance?: 'standard' | 'filled';
}) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      className={`settings-action-button ${className}`}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-icon={icon}
      data-appearance={appearance}
    >
      <span className="settings-action-spinner" aria-hidden="true" data-pending={!!pending} />
      <span className="settings-action-label">{children}</span>
    </button>
  );
}
