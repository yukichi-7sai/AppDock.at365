import { useRef, useState } from 'react';
import { imageReferenceMaxBytes, imageReferenceMaxCount } from '../shared/image-ai';
import { libraryBasename, type LibraryEntry, type LibraryRef } from '../shared/library-assets';
import { useHostTranslation } from './HostTranslation';
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
  const move = (index: number, direction: number) => {
    const next = [...value];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>(
          `[data-reference-file="${CSS.escape(value[index].file)}"] .image-generation-reference-preview`,
        )
        ?.focus(),
    );
  };
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
                <SettingsActions>
                  <SettingsButton
                    icon
                    disabled={index === 0}
                    title={t('imageGeneration.moveBefore', { index: index + 1 })}
                    aria-label={t('imageGeneration.moveBefore', { index: index + 1 })}
                    onClick={() => move(index, -1)}
                  >
                    ←
                  </SettingsButton>
                  <SettingsButton
                    icon
                    disabled={index === value.length - 1}
                    title={t('imageGeneration.moveAfter', { index: index + 1 })}
                    aria-label={t('imageGeneration.moveAfter', { index: index + 1 })}
                    onClick={() => move(index, 1)}
                  >
                    →
                  </SettingsButton>
                  <SettingsButton
                    icon
                    aria-label={t('imageGeneration.removeReference', { index: index + 1 })}
                    onClick={() => {
                      onChange(value.filter((image) => image.file !== ref.file));
                      requestAnimationFrame(() =>
                        root.current?.querySelector<HTMLButtonElement>('button')?.focus(),
                      );
                    }}
                  >
                    {t('imageGeneration.detach')}
                  </SettingsButton>
                </SettingsActions>
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
