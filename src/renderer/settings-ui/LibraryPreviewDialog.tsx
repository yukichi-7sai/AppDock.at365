import { useId, type ReactNode } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { Icon } from '../Icon';
import { SettingsButton } from './SettingsButton';
import { SettingsModal } from './SettingsModal';

export function LibraryPreviewDialog({
  title,
  children,
  onClose,
  returnFocus,
  error,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  returnFocus?: HTMLElement | null;
  error?: string;
  className?: string;
}) {
  const titleId = useId();
  const { t } = useHostTranslation();
  const closeLabel = t('settings.registeredImagePicker.close');
  return (
    <SettingsModal
      labelledBy={titleId}
      className={`library-preview-dialog ${className}`}
      returnFocus={returnFocus}
      closeOnBackdrop
      onClose={onClose}
      error={error}
      header={
        <header className="library-preview-heading">
          <h2 id={titleId}>{title}</h2>
          <SettingsButton
            icon
            data-initial-focus
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </SettingsButton>
        </header>
      }
    >
      {children}
    </SettingsModal>
  );
}
