import { useHostTranslation } from '../HostTranslation';
import type { Settings } from '../../shared/contracts';
import {
  appendKeybinding,
  changeKeybindingKey,
  getKeybindings,
  externalShortcutScope,
  keybindingConditionLabel,
  withKeybindings,
  type Keybinding,
} from '../../shared/keybindings';
import { AppletShortcutDialog } from './AppletShortcutDialog';
import { ShortcutOrderDialog } from './ShortcutOrderDialog';
import { CommandBindingList } from './CommandBindingList';
import type { BindingInputFilter } from './useBindingCommandFilter';
import { normalizeShortcut, type UiCommand } from '../../shared/commands';

export function ShortcutCommandList({
  owned = [],
  commands,
  allCommands = commands,
  settings,
  applets,
  onChange,
  showProvider = false,
  statusError,
  onRetry,
  selectedInput,
  onInputFilter,
}: {
  owned?: Keybinding[];
  commands: UiCommand[];
  allCommands?: UiCommand[];
  settings: Settings;
  applets: { id: string; title: string }[];
  onChange(settings: Settings): void;
  showProvider?: boolean;
  statusError?(row: Keybinding): string | undefined;
  onRetry?(): void;
  selectedInput?: string;
  onInputFilter?(input: BindingInputFilter, trigger: HTMLButtonElement): void;
}) {
  const { t: translate } = useHostTranslation();
  const bindings = getKeybindings(settings);
  return (
    <CommandBindingList<Keybinding>
      commands={commands}
      bindings={[...bindings, ...owned]}
      readOnly={(row) =>
        owned.some((item) => item.id === row.id)
          ? translate('settings.shortcutCommandList.editTouchpad')
          : undefined
      }
      showProvider={showProvider}
      statusError={statusError}
      onRetry={onRetry}
      selectedInput={selectedInput}
      onInputFilter={onInputFilter}
      inputName={translate('settings.shortcutCommandList.key')}
      inputKey={(row) => normalizeShortcut(row.key)}
      inputLabel={(row) => row.key}
      conditionLabel={(row, command) =>
        keybindingConditionLabel(
          row.when,
          command.extensionId ? command.extension : undefined,
          applets,
        ) +
        (externalShortcutScope(row.when.scope)
          ? row.blockOriginalInput === false
            ? translate('settings.shortcutCommandList.pass')
            : translate('settings.shortcutCommandList.block')
          : '')
      }
      newBinding={(command) => ({
        id: crypto.randomUUID(),
        command: command.id,
        key: '',
        enabled: true,
        when: { scope: command.extensionId ? 'owner' : 'app', appletIds: [] },
      })}
      applyBinding={(row, original) => {
        let next: Keybinding[];
        if (!original) {
          if (bindings.length >= 2000) throw Error(translate('settings.shortcutCommandList.limit'));
          next = appendKeybinding(bindings, row);
        } else {
          if (
            JSON.stringify(bindings.find((binding) => binding.id === row.id)) !==
            JSON.stringify(original)
          )
            throw Error(translate('settings.shortcutCommandList.conflict'));
          next = changeKeybindingKey(bindings, row.id, row.key).map((binding) =>
            binding.id === row.id ? row : binding,
          );
        }
        onChange(withKeybindings(settings, next));
      }}
      deleteBinding={(row) =>
        onChange(
          withKeybindings(
            settings,
            bindings.filter((binding) => binding.id !== row.id),
          ),
        )
      }
      renderEditor={(edit, apply, close) => (
        <AppletShortcutDialog
          initial={edit.row}
          title={edit.title}
          ownerTitle={edit.ownerTitle}
          applets={applets}
          adding={edit.adding}
          onApply={apply}
          onClose={close}
        />
      )}
      renderOrder={(row, close) => (
        <ShortcutOrderDialog
          settings={settings}
          commands={allCommands}
          applets={applets}
          initialKey={row.key}
          onChange={onChange}
          onClose={close}
        />
      )}
    />
  );
}
