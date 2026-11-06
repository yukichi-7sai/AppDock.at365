import { SettingsActions } from '../settings-ui/SettingsSections';

export function GenerationPreviewActions({
  startLabel,
  stopLabel,
  startDisabled,
  stopDisabled,
  onStart,
  onStop,
}: {
  startLabel: string;
  stopLabel: string;
  startDisabled: boolean;
  stopDisabled: boolean;
  onStart(): void;
  onStop(): void;
}) {
  return (
    <SettingsActions>
      <button type="button" className="primary" disabled={startDisabled} onClick={onStart}>
        {startLabel}
      </button>
      <button type="button" disabled={stopDisabled} onClick={onStop}>
        {stopLabel}
      </button>
    </SettingsActions>
  );
}
