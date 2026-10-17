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
  return (
    <div className="source-folders">
      {error && <p role="alert">{error}</p>}
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
            aria-label={`${label} ${index + 1}を選ぶ`}
            disabled={choosing}
            onClick={() => void choose(index)}
          >
            選ぶ
          </button>
          <button
            type="button"
            className="text-button"
            aria-label={`${label} ${index + 1}を削除`}
            disabled={choosing}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            削除
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        aria-label={`${label}を追加`}
        disabled={choosing || value.length >= 64}
        onClick={() => onChange([...value, ''])}
      >
        フォルダーを追加
      </button>
    </div>
  );
}
