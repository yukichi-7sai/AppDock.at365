import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from './SettingsStatus';
import { useEffect, useRef, useState } from 'react';
import { SettingsInput } from './SettingsInput';
import { useSettingsControls } from './api';

export function DirectoryListInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange(value: string[]): void;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const choose = async (index: number) => {
    setChoosing(true);
    setError('');
    try {
      const selected = await settingsControls.chooseDirectory();
      if (active.current && selected)
        onChange(value.map((folder, i) => (i === index ? selected : folder)));
    } catch (error) {
      if (active.current) setError(String(error instanceof Error ? error.message : error));
    } finally {
      if (active.current) setChoosing(false);
    }
  };
  useSettingsFeedback({ error });
  return (
    <div className="source-folders">
      {value.map((folder, index) => (
        <div className="source-folder" key={index}>
          <SettingsInput
            aria-label={`${label} ${index + 1}`}
            value={folder}
            disabled={choosing}
            onChange={(event) =>
              onChange(value.map((item, i) => (i === index ? event.target.value : item)))
            }
          />
          <button
            type="button"
            className="secondary"
            aria-label={translate('settings.directoryListInput.chooseItem', {
              label: label,
              value: index + 1,
            })}
            disabled={choosing}
            onClick={() => void choose(index)}
          >
            {translate('settings.directoryListInput.choose')}
          </button>
          <button
            type="button"
            className="text-button"
            aria-label={translate('settings.directoryListInput.deleteItem', {
              label: label,
              value: index + 1,
            })}
            disabled={choosing}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            {translate('settings.directoryListInput.delete')}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        aria-label={translate('settings.directoryListInput.add', { label: label })}
        disabled={choosing}
        onClick={() => onChange([...value, ''])}
      >
        {translate('settings.directoryListInput.addDirectory')}
      </button>
    </div>
  );
}
