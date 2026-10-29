import { useId, type ReactNode, type HTMLAttributes } from 'react';
import { SettingsInput } from './SettingsInput';
import { SettingsHintIcon } from './SettingsHintIcon';
import { useSettingsFeedback, SettingsFieldTarget } from './SettingsStatus';
import './settings-sections.css';
import { SettingsMcpScope, SettingsMcpLock } from './SettingsMcpAccess';
export function SettingsInputActions({
  className = '',
  wrap = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { wrap?: boolean }) {
  return (
    <div
      {...props}
      className={`settings-input-actions ${className}`}
      data-wrap={wrap || undefined}
    />
  );
}

/** A shared, wrapping action row for section bodies and field controls. */
export function SettingsActions({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`settings-actions ${className}`} />;
}

/** A section content slot for structured widgets with their own internal layout. */
export function SettingsContent({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`settings-content ${className}`} />;
}

/** Reusable content blocks inside SettingsPageLayout. */
export function SettingsSection({
  title,
  description,
  hint,
  error,
  children,
  collapsible = false,
  defaultOpen = false,
  variant = 'card',
  ...props
}: {
  title?: string;
  description?: ReactNode;
  hint?: string;
  error?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  variant?: 'card' | 'group' | 'row';
} & Omit<HTMLAttributes<HTMLElement>, 'title'>) {
  const id = useId();
  useSettingsFeedback({ error, target: title });
  const heading = (
    <>
      <div className="settings-title-with-hint">
        <h2 id={id}>{title}</h2>
        {title && <SettingsHintIcon title={title} hint={hint} />}
        {title && props['data-setting-item' as keyof typeof props] && (
          <SettingsMcpLock
            title={title}
            level="group"
            itemId={String(props['data-setting-item' as keyof typeof props])}
          />
        )}
      </div>
      {description && <p>{description}</p>}
    </>
  );
  return collapsible ? (
    <details
      {...props}
      open={defaultOpen || undefined}
      className={`settings-section settings-section-details settings-section-${variant} ${props.className ?? ''}`}
    >
      <summary>
        {heading}
        <span className="settings-section-toggle" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div className="settings-section-content">
        <SettingsMcpScope
          itemId={props['data-setting-item' as keyof typeof props] as string | undefined}
        >
          {children}
        </SettingsMcpScope>
      </div>
    </details>
  ) : (
    <section
      {...props}
      className={`settings-section settings-section-${variant} ${props.className ?? ''}`}
      aria-labelledby={title ? id : undefined}
    >
      {title && <header>{heading}</header>}
      <div className="settings-section-content">
        <SettingsMcpScope
          itemId={props['data-setting-item' as keyof typeof props] as string | undefined}
        >
          {children}
        </SettingsMcpScope>
      </div>
    </section>
  );
}

export function SettingsField({
  title,
  group,
  description,
  hint,
  error,
  children,
  settingKey,
  ...props
}: {
  title: string;
  group?: string;
  description?: ReactNode;
  hint?: string;
  error?: string;
  children?: ReactNode;
  settingKey?: string;
} & Omit<HTMLAttributes<HTMLFieldSetElement>, 'title'>) {
  const errorId = useSettingsFeedback({ error, target: title });
  return (
    <fieldset
      {...props}
      className={`settings-field ${props.className ?? ''}`}
      aria-describedby={error ? errorId : undefined}
      data-invalid={!!error}
      data-readonly={children == null || children === false}
    >
      <legend className="sr-only">{group ? `${group}：${title}` : title}</legend>
      <div className="settings-field-label">
        <div className="settings-title-with-hint">
          {group && <small className="settings-field-group">{group}</small>}
          <strong>{title}</strong>
          <SettingsHintIcon title={title} hint={hint} />
          <SettingsMcpLock
            title={title}
            itemId={props['data-setting-item' as keyof typeof props] as string | undefined}
            settingKey={settingKey}
          />
        </div>
        {description && <p>{description}</p>}
      </div>
      {children != null && children !== false && (
        <SettingsFieldTarget.Provider value={title}>
          <div className="settings-field-control">
            <SettingsMcpScope
              itemId={props['data-setting-item' as keyof typeof props] as string | undefined}
              fieldKey={settingKey}
            >
              {children}
            </SettingsMcpScope>
          </div>
        </SettingsFieldTarget.Provider>
      )}
    </fieldset>
  );
}

export function SettingsChoice({
  label,
  description,
  checked,
  disabled,
  onChange,
  ariaLabel,
  settingKey,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
  ariaLabel?: string;
  settingKey?: string;
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
        {settingKey ? (
          <span className="settings-title-with-hint">
            <strong>{label}</strong>
            <SettingsMcpLock title={label} settingKey={settingKey} />
          </span>
        ) : (
          <strong>{label}</strong>
        )}
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}
