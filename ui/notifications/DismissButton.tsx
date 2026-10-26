import { hostText } from '../../src/shared/i18n';
import { Icon } from '../../src/shared/ui-icons';
import './dismiss.css';

export function NotificationDismissButton({
  title,
  disabled,
  onClick,
}: {
  title: string;
  disabled: boolean;
  onClick(): void;
}) {
  const label = hostText('notifications.dismissTitle', { title });
  return (
    <button
      type="button"
      className="notification-dismiss"
      data-testid="notification-dismiss"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name="close" size={18} />
    </button>
  );
}
