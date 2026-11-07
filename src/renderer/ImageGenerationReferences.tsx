import { useRef, useState } from 'react';
import { imageReferenceMaxBytes, imageReferenceMaxCount } from '../shared/image-ai';
import { libraryBasename, type LibraryEntry, type LibraryRef } from '../shared/library-assets';
import { useHostTranslation } from './HostTranslation';
import { Icon } from './Icon';
import { SettingsField, SettingsActions } from './settings-ui/SettingsSections';
import { SettingsButton } from './settings-ui/SettingsButton';
import { RegisteredImagePicker, RegisteredImagePreview } from './settings-ui/RegisteredImagePicker';

export function imageReferencesValid(refs: LibraryRef[], entries: LibraryEntry[]) {
  return (
    refs.length <= imageReferenceMaxCount &&
    refs.every((ref) => {
      const entry = entries.find((entry) => entry.ref.file === ref.file);
      return (
        /\.(png|jpe?g|webp)$/i.test(ref.file) &&
        !!entry?.available &&
        entry.bytes < imageReferenceMaxBytes
      );
    })
  );
}

export function ImageGenerationReferences({
  value,
  entries,
  onChange,
  onPreview,
}: {
  value: LibraryRef[];
  entries: LibraryEntry[];
  onChange(value: LibraryRef[]): void;
  onPreview(entry: LibraryEntry): void;
}) {
  const { t } = useHostTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  return (
    <SettingsField
      title={t('imageGeneration.references', { count: value.length })}
      description={t('imageGeneration.referencesHint')}
    >
      <div ref={root} className="image-generation-references">
        <SettingsActions>
          <SettingsButton onClick={() => setOpen(true)}>
            {t('imageGeneration.attach')}
          </SettingsButton>
        </SettingsActions>
        {!value.length && (
          <p className="image-generation-reference-empty">{t('imageGeneration.noReferences')}</p>
        )}
        {value.length > imageReferenceMaxCount && (
          <p role="alert">{t('imageAi.referenceInvalid')}</p>
        )}
        <ol className="image-generation-reference-list">
          {value.map((ref, index) => {
            const entry = entries.find((entry) => entry.ref.file === ref.file);
            const valid = imageReferencesValid([ref], entries);
            return (
              <li key={ref.file} data-reference-file={ref.file}>
                <button
                  type="button"
                  className="image-generation-reference-preview"
                  disabled={!entry?.available}
                  aria-label={t('imageGeneration.preview', { name: libraryBasename(ref.file) })}
                  onClick={() => entry && onPreview(entry)}
                >
                  <RegisteredImagePreview value={ref} />
                </button>
                <span className="image-generation-reference-name" title={ref.file}>
                  {index + 1}. {libraryBasename(ref.file)}
                </span>
                {!valid && <p role="alert">{t('imageAi.referenceInvalid')}</p>}
                <SettingsButton
                  icon
                  className="image-generation-reference-remove"
                  title={t('imageGeneration.removeReference', { index: index + 1 })}
                  aria-label={t('imageGeneration.removeReference', { index: index + 1 })}
                  onClick={() => {
                    onChange(value.filter((image) => image.file !== ref.file));
                    requestAnimationFrame(() =>
                      root.current?.querySelector<HTMLButtonElement>('button')?.focus(),
                    );
                  }}
                >
                  <Icon name="close" size={16} />
                </SettingsButton>
              </li>
            );
          })}
        </ol>
      </div>
      {open && (
        <RegisteredImagePicker
          multiple
          current={value}
          onClose={() => setOpen(false)}
          selectionError={(refs) =>
            imageReferencesValid(refs, entries) ? '' : t('imageAi.referenceInvalid')
          }
          onSelect={(refs) => {
            onChange(refs);
            setOpen(false);
          }}
        />
      )}
    </SettingsField>
  );
}
