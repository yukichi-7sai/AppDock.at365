import { useId, type ReactNode } from 'react';
import { useHostTranslation } from '../HostTranslation';
import './settings-statistic.css';

/** Shared count cards for host and Applet information panels. */
export function SettingsStatistic({
  label,
  count,
  detail,
  testId,
  title,
  onClick,
}: {
  label: string;
  count?: number;
  detail: ReactNode;
  testId: string;
  title?: string;
  onClick?: () => void;
}) {
  const id = useId();
  const { language } = useHostTranslation();
  const content = (
    <>
      <span className="settings-statistic-label">{label}</span>
      <span id={id} className="settings-statistic-count" data-testid={testId}>
        {count === undefined ? '—' : new Intl.NumberFormat(language).format(count)}
      </span>
      <small>{detail}</small>
    </>
  );
  return onClick ? (
    <button
      type="button"
      className="settings-statistic"
      title={title}
      aria-label={title ?? label}
      aria-describedby={id}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div className="settings-statistic">{content}</div>
  );
}
