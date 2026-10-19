import type { Settings } from '../../shared/contracts';
import {
  appendKeybinding,
  changeKeybindingKey,
  getKeybindings,
  keybindingConditionLabel,
  withKeybindings,
  type Keybinding,
} from '../../shared/keybindings';
import { AppletShortcutDialog } from './AppletShortcutDialog';
import { ShortcutOrderDialog } from './ShortcutOrderDialog';
import { CommandBindingList } from './CommandBindingList';
import type { UiCommand } from '../../shared/commands';

export function ShortcutCommandList({
  commands,
  allCommands = commands,
  settings,
  applets,
  onChange,
  showProvider = false,
  statusError,
  onRetry,
}: {
  commands: UiCommand[];
  allCommands?: UiCommand[];
  settings: Settings;
  applets: { id: string; title: string }[];
  onChange(settings: Settings): void;
  showProvider?: boolean;
  statusError?(row: Keybinding): string | undefined;
  onRetry?(): void;
}) {
  const bindings = getKeybindings(settings);
  return (
    <CommandBindingList<Keybinding>
      commands={commands}
      bindings={bindings}
      showProvider={showProvider}
      statusError={statusError}
      onRetry={onRetry}
      inputName="キー"
      inputLabel={(row) => row.key}
      conditionLabel={(row, command) =>
        keybindingConditionLabel(
          row.when,
          command.extensionId ? command.extension : undefined,
          applets,
        ) +
        (row.when.scope === 'global'
          ? row.blockOriginalInput === false
            ? '・入力を通す'
            : '・入力をブロック'
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
          if (bindings.length >= 2000) throw Error('キーバインドは2000件以内です。');
          next = appendKeybinding(bindings, row);
        } else {
          if (
            JSON.stringify(bindings.find((binding) => binding.id === row.id)) !==
            JSON.stringify(original)
          )
            throw Error('編集中に割り当てが変更されました。キャンセルして開き直してください。');
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
