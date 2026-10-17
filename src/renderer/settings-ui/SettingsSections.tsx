import { useId, type ReactNode, type HTMLAttributes } from 'react';
import { SettingsInput } from './SettingsInput';
import './settings-sections.css';

/** Reusable content blocks inside SettingsPageLayout. */
export function SettingsSection({
  title,
  description,
  children,
  collapsible = false,
  ...props
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
} & Omit<HTMLAttributes<HTMLElement>, 'title'>) {
  const id = useId();
  const heading = (
    <>
      <h2 id={id}>{title}</h2>
      {description && <p>{description}</p>}
    </>
  );
  return collapsible ? (
    <details
      {...props}
      className={`settings-section settings-section-details ${props.className ?? ''}`}
    >
      <summary>{heading}</summary>
      <div className="settings-section-content">{children}</div>
    </details>
  ) : (
    <section
      {...props}
      className={`settings-section ${props.className ?? ''}`}
      aria-labelledby={title ? id : undefined}
    >
      {title && <header>{heading}</header>}
      <div className="settings-section-content">{children}</div>
    </section>
  );
}

export function SettingsField({
  title,
  description,
  children,
  ...props
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div {...props} className={`settings-field ${props.className ?? ''}`}>
      <div className="settings-field-label">
        <strong>{title}</strong>
        {description && <p>{description}</p>}
      </div>
      <div className="settings-field-control">{children}</div>
    </div>
  );
}

export function SettingsChoice({
  label,
  description,
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
  ariaLabel?: string;
}) {
  return (
    <label
      className="settings-choice"
      data-selected={checked}
      aria-disabled={disabled || undefined}
    >
      <SettingsInput
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}

export function SettingsFeedback({
  error,
  message,
  busy,
}: {
  error?: string;
  message?: string;
  busy?: boolean;
}) {
  return (
    <div className="settings-feedback">
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {(busy || message) && <p role="status">{busy ? '処理しています…' : message}</p>}
    </div>
  );
}
