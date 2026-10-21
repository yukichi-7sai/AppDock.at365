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
      {commandSettingsPages.map((page) => {
        const unavailable = page.id === 'custom-commands' && !command.customDefinitionId;
        return (
          <button
            key={page.id}
            type="button"
            className="settings-list-icon"
            title={unavailable ? '登録済みのカスタムコマンドではありません' : page.title}
            aria-label={`${command.title}の${page.title}を開く`}
            disabled={unavailable}
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
