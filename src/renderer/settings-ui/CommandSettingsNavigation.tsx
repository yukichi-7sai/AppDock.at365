import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import type { UiCommand } from '../../shared/commands';
import { Icon, type IconName } from '../../shared/ui-icons';
import { CommandProviderFilter } from './CommandProviderFilter';

export const commandSettingsPages = [
  { id: 'shortcuts', title: 'ショートカット', icon: 'keyboard' },
  { id: 'gestures', title: 'マウスジェスチャー', icon: 'mouse' },
  { id: 'custom-commands', title: 'カスタムコマンド', icon: 'terminal' },
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
  assignments: { shortcuts: ReadonlySet<string>; gestures: ReadonlySet<string> };
  target?: CommandSettingsTarget;
  open(page: CommandSettingsPage, command: Pick<UiCommand, 'id' | 'title'>): void;
  clear(): void;
} | null>(null);
export function useCommandSettingsTarget() {
  return useContext(CommandSettingsNavigation)?.target;
}
export function CommandTargetFilter() {
  const navigation = useContext(CommandSettingsNavigation);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (navigation?.target) root.current?.scrollIntoView({ block: 'nearest' });
  }, [navigation?.target?.request]);
  return navigation?.target ? (
    <div ref={root}>
      <CommandProviderFilter title={navigation.target.title} onClear={navigation.clear} />
    </div>
  ) : null;
}
export function CommandSettingsLinks({
  command,
}: {
  command: Pick<UiCommand, 'id' | 'title' | 'customDefinitionId'>;
}) {
  const navigation = useContext(CommandSettingsNavigation);
  if (!navigation) return null;
  return (
    <div className="command-settings-links" role="group" aria-label={`${command.title}の移動先`}>
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
              title={`${page.title}${assigned ? '（割り当てあり）' : ''}`}
              aria-label={`${command.title}の${page.title}を開く`}
              aria-description={assigned ? 'このコマンドの割り当てがあります。' : undefined}
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
  return published ? (
    <span
      className="command-publication"
      role="img"
      aria-label="外部公開コマンド"
      title="外部公開コマンド"
    >
      <Icon name="globe" size={16} />
    </span>
  ) : null;
}
