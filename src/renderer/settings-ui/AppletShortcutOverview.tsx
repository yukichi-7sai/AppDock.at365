import { useHostTranslation } from '../HostTranslation';
import type { ExtensionSnapshot, Settings } from '../../shared/contracts';
import { getKeybindings } from '../../shared/keybindings';
import { ShortcutCommandList } from './ShortcutCommandList';
import type { UiCommand } from '../../shared/commands';

export function AppletShortcutOverview({
  applet,
  allCommands,
  settings,
  applets,
  onChange,
}: {
  applet: ExtensionSnapshot;
  allCommands: UiCommand[];
  settings: Settings;
  applets: { id: string; title: string }[];
  onChange(settings: Settings): void;
}) {
  const { t: translate } = useHostTranslation();
  const bindings = getKeybindings(settings);
  const commands = applet.commands.map((command) => ({
    ...command,
    extension: applet.displayName,
    extensionId: applet.id,
  }));
  const normal = commands.filter((command) => !command.hidden);
  const aliases = commands.filter(
    (command) => command.hidden && bindings.some((row) => row.command === command.id),
  );
  return (
    <div className="applet-shortcuts">
      <ShortcutCommandList
        commands={normal}
        allCommands={allCommands}
        settings={settings}
        applets={applets}
        onChange={onChange}
      />
      {!!aliases.length && (
        <>
          <h3>{translate('settings.appletShortcutOverview.compatibilityBindings')}</h3>
          <ShortcutCommandList
            commands={aliases}
            allCommands={allCommands}
            settings={settings}
            applets={applets}
            onChange={onChange}
          />
        </>
      )}
    </div>
  );
}
