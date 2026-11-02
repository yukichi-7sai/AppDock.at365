import { useState } from 'react';
import type {
  ImageLibraryDialogRequest,
  ImageLibraryDialogOperation,
} from '../shared/image-library-page';
import { libraryPath } from '../shared/library-assets';
import { useHostTranslation } from './HostTranslation';
import { SettingsDialog } from './settings-ui/SettingsModal';
import { LibraryPreviewDialog } from './settings-ui/LibraryPreviewDialog';
import { SettingsInput, SettingsTextarea } from './settings-ui/SettingsInput';
import { SettingsField } from './settings-ui/SettingsSections';

/** The draft belongs to this dialog; cancellation never writes a file. */
export function TextLibraryEditor({
  request,
  returnFocus,
  onClose,
  onSave,
  error,
}: {
  request: ImageLibraryDialogRequest;
  returnFocus: HTMLElement | null;
  onClose(): void;
  onSave(operation: ImageLibraryDialogOperation): Promise<void>;
  error: string;
}) {
  const { t } = useHostTranslation();
  const [name, setName] = useState(
    request.kind === 'text-create' && request.document && request.entry
      ? request.entry.ref.file
          .split('/')
          .at(-1)!
          .replace(/\.txt$/i, '') + t('texts.copySuffix')
      : '',
  );
  const [body, setBody] = useState(request.document?.body ?? '');
  const creating = request.kind === 'text-create';
  const filename = /\.txt$/i.test(name) ? name : name + '.txt';
  if (request.kind === 'text-preview')
    return (
      <LibraryPreviewDialog
        title={request.entry?.ref.file ?? t('texts.preview')}
        returnFocus={returnFocus}
        onClose={onClose}
        error={error}
      >
        <pre className="text-library-preview" tabIndex={0}>
          {body || t('texts.emptyBody')}
        </pre>
      </LibraryPreviewDialog>
    );
  return (
    <SettingsDialog
      className="text-library-dialog"
      title={creating ? t('texts.create') : t('texts.edit')}
      description={creating ? undefined : request.entry?.ref.file}
      returnFocus={returnFocus}
      onClose={onClose}
      closeAfterApply={false}
      onApply={() =>
        onSave({ kind: 'text-save', name: creating ? filename : request.entry!.ref.file, body })
      }
      valid={!creating || (!!name && !filename.includes('/') && !!libraryPath(filename, 'text'))}
      applyLabel={t('images.apply')}
      error={error}
      collapseStatusWhenEmpty
    >
      {creating && (
        <SettingsField title={t('texts.filename')}>
          <SettingsInput
            data-initial-focus
            aria-label={t('texts.filename')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </SettingsField>
      )}
      <SettingsField title={t('texts.body')} className="text-library-body-field">
        <SettingsTextarea
          newlineOnEnter
          data-initial-focus={!creating || undefined}
          aria-label={t('texts.body')}
          className="text-library-input"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </SettingsField>
    </SettingsDialog>
  );
}
