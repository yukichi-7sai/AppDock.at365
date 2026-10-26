import { useHostTranslation } from '../HostTranslation';
import type { Settings } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';
import {
  getKeybindingOptions,
  getKeybindings,
  externalShortcutScope,
  keybindingGroups,
  keybindingConditionLabel,
  moveKeybindingWithinKey,
  withKeybindings,
} from '../../shared/keybindings';
import { BindingOrderDialog } from './BindingOrderDialog';
import { applyBindingSettings } from '../../shared/binding-order';

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
  const options = getKeybindingOptions(settings);
  return (
    <BindingOrderDialog
      bindings={getKeybindings(settings)}
      executionMode={options.executionMode}
      inputExecutionModes={options.inputExecutionModes}
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
      onApply={(ordered, original, modes, originalModes) => {
        const next = applyBindingSettings(
          getKeybindings(settings),
          original,
          ordered,
          options.inputExecutionModes,
          originalModes,
          modes,
          (row) => row.key,
          (key) => key,
        );
        onChange(
          withKeybindings(
            {
              ...settings,
              keybindingOptions: {
                ...settings.keybindingOptions,
                executionMode: options.executionMode,
                excludedProcesses: options.excludedProcesses,
                inputExecutionModes: next.inputExecutionModes,
              },
            },
            next.bindings,
          ),
        );
      }}
      onClose={onClose}
    />
  );
}
