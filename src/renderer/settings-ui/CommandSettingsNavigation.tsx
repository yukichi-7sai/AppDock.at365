import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import type { UiCommand } from '../../shared/commands';
import { Icon, type IconName } from '../../shared/ui-icons';
import { CommandProviderFilter } from './CommandProviderFilter';

export const commandSettingsPages = [
  {
    id: 'shortcuts',
    title: hostText('settings.commandSettingsNavigation.shortcuts'),
    icon: 'keyboard',
  },
  { id: 'gestures', title: hostText('settings.commandSettingsNavigation.gestures'), icon: 'mouse' },
  {
    id: 'touchpad-gestures',
    title: hostText('settings.commandSettingsNavigation.touchpad'),
    icon: 'touchpad',
  },
  {
    id: 'custom-commands',
    title: hostText('settings.commandSettingsNavigation.customCommands'),
    icon: 'keyboard-command-key',
  },
] as const satisfies { id: string; title: string; icon: IconName }[];
export type CommandSettingsPage = (typeof commandSettingsPages)[number]['id'];
export type CommandSettingsTarget = {
  page: CommandSettingsPage;
  id: string;
  title: string;
  request: number;
};
export const CommandSettingsNavigation = createContext<{
  page: string;
  assignments: {
    shortcuts: ReadonlySet<string>;
    gestures: ReadonlySet<string>;
    'touchpad-gestures': ReadonlySet<string>;
  };
  target?: CommandSettingsTarget;
  open(page: CommandSettingsPage, command: Pick<UiCommand, 'id' | 'title'>): void;
  clear(): void;
} | null>(null);
export function useCommandSettingsTarget() {
  return useContext(CommandSettingsNavigation)?.target;
}
export function CommandTargetFilter() {
  const navigation = useContext(CommandSettingsNavigation);
  const root = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (navigation?.target) root.current?.scrollIntoView({ block: 'nearest' });
  }, [navigation?.target?.request]);
  return navigation?.target ? (
    <CommandProviderFilter ref={root} title={navigation.target.title} onClear={navigation.clear} />
  ) : null;
}
export function CommandSettingsLinks({
  command,
}: {
  command: Pick<UiCommand, 'id' | 'title' | 'customDefinitionId'>;
}) {
  const { t: translate } = useHostTranslation();
  const navigation = useContext(CommandSettingsNavigation);
  if (!navigation) return null;
  return (
    <div
      className="command-settings-links"
      role="group"
      aria-label={translate('settings.commandSettingsNavigation.target', { title: command.title })}
    >
      {commandSettingsPages
        .filter(
          (page) =>
            page.id !== navigation.page &&
            (page.id !== 'custom-commands' || !!command.customDefinitionId),
        )
        .map((page) => {
          const assigned =
            page.id !== 'custom-commands' && navigation.assignments[page.id].has(command.id);
          return (
            <button
              key={page.id}
              type="button"
              className={`settings-list-icon${assigned ? ' accent-action' : ''}`}
              title={`${page.title}${assigned ? translate('settings.commandSettingsNavigation.assigned') : ''}`}
              aria-label={translate('settings.commandSettingsNavigation.open', {
                title: command.title,
                title2: page.title,
              })}
              aria-description={
                assigned ? translate('settings.commandSettingsNavigation.assignedHint') : undefined
              }
              data-assigned={assigned}
              onClick={() => navigation.open(page.id, command)}
            >
              <Icon name={page.icon} />
            </button>
          );
        })}
    </div>
  );
}
export function CommandPublication({ published }: { published?: boolean }) {
  const { t: translate } = useHostTranslation();
  return published ? (
    <span
      className="command-publication"
      role="img"
      aria-label={translate('settings.commandSettingsNavigation.public')}
      title={translate('settings.commandSettingsNavigation.public')}
    >
      <Icon name="globe" size={16} />
    </span>
  ) : null;
}
