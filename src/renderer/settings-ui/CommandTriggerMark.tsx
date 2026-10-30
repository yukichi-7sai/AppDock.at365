import type { CommandTriggerKind } from '../../shared/command-triggers';
import { Icon } from '../../shared/ui-icons';
import { useHostTranslation } from '../HostTranslation';
import './command-trigger-mark.css';

const kinds = {
  shortcuts: { icon: 'keyboard', label: 'settings.commandTriggers.keys' },
  gestures: { icon: 'mouse', label: 'settings.commandTriggers.mouse' },
  'touchpad-gestures': { icon: 'touchpad', label: 'settings.commandTriggers.touchpad' },
} as const;

export function CommandTriggerMark({ kind, input }: { kind: CommandTriggerKind; input: string }) {
  const { t } = useHostTranslation();
  const label = t('settings.commandTriggers.input', { kind: t(kinds[kind].label), input });
  return (
    <kbd className="binding-trigger-mark" data-trigger-kind={kind} title={label} aria-label={label}>
      <span className="binding-trigger-icon" aria-hidden="true">
        <Icon name={kinds[kind].icon} />
      </span>
      <span>{input}</span>
    </kbd>
  );
}
