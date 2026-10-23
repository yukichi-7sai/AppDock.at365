import { useHostTranslation } from '../HostTranslation';
import type { Settings } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';
import {
  applyKeybindingOrder,
  getKeybindings,
  externalShortcutScope,
  keybindingGroups,
  keybindingConditionLabel,
  moveKeybindingWithinKey,
  withKeybindings,
} from '../../shared/keybindings';
import { BindingOrderDialog } from './BindingOrderDialog';

export function ShortcutOrderDialog({
  settings,
  commands,
  applets,
  initialKey,
  onChange,
  onClose,
}: {
  settings: Settings;
  commands: UiCommand[];
  applets: { id: string; title: string }[];
  initialKey?: string;
  onChange(value: Settings): void;
  onClose(): void;
}) {
  const { t: translate } = useHostTranslation();
  return (
    <BindingOrderDialog
      bindings={getKeybindings(settings)}
      commands={commands}
      initialInput={initialKey}
      title={translate('settings.shortcutOrderDialog.title')}
      inputName={translate('settings.shortcutOrderDialog.key')}
      inputLabel={(key) => key}
      conditionLabel={(row, command) =>
        keybindingConditionLabel(
          row.when,
          command?.extensionId ? command.extension : undefined,
          applets,
        ) +
        (externalShortcutScope(row.when.scope)
          ? row.blockOriginalInput === false
            ? translate('settings.shortcutOrderDialog.pass')
            : translate('settings.shortcutOrderDialog.block')
          : '')
      }
      groupRows={keybindingGroups}
      moveRow={moveKeybindingWithinKey}
      onApply={(ordered, original) =>
        onChange(
          withKeybindings(
            settings,
            applyKeybindingOrder(getKeybindings(settings), original, ordered),
          ),
        )
      }
      onClose={onClose}
    />
  );
}
