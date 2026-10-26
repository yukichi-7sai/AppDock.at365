import { useHostTranslation } from '../HostTranslation';
import {
  externalShortcutScope,
  externalShortcutScopes,
  type Keybinding,
} from '../../shared/keybindings';
import { BindingEditorPanel } from './BindingEditorLayout';
import { CommandConditionDetails, useConditionProcesses } from './CommandConditionDetails';
import { SettingsField } from './SettingsSections';
import { ShortcutConditionField } from './ShortcutFields';

/** One condition editor and scope-transition policy for keys, mouse and touchpad. */
export function CommandConditionEditor({
  when,
  onChange,
  ownerTitle,
  applets,
  draft,
}: {
  when: Keybinding['when'];
  onChange(when: Keybinding['when']): void;
  ownerTitle?: string;
  applets: { id: string; title: string }[];
  draft: ReturnType<typeof useConditionProcesses>;
}) {
  const { t } = useHostTranslation();
  const selectScope = (scope: Keybinding['when']['scope'], appletIds: string[] = []) =>
    onChange({
      scope,
      appletIds,
      ...(when.processes === undefined ? {} : { processes: [] }),
      ...(['global', 'exe'].includes(scope) && when.excludeDesktop !== undefined
        ? { excludeDesktop: when.excludeDesktop }
        : {}),
    });
  return (
    <BindingEditorPanel title={t('settings.gestureBindingDialog.scope')}>
      <SettingsField
        className="binding-condition-scope"
        title={t('settings.gestureBindingDialog.scopeLabel')}
        description={
          when.scope === 'browser' ? t('settings.gestureBindingDialog.browserHint') : undefined
        }
      >
        <ShortcutConditionField
          presentation="buttons"
          value={{
            scope: externalShortcutScope(when.scope) ? 'global' : when.scope,
            appletIds: when.appletIds,
          }}
          selectedScope={when.scope}
          extraScopes={externalShortcutScopes.slice()}
          onExtraScope={(scope) => selectScope(scope as Keybinding['when']['scope'])}
          label={t('settings.gestureBindingDialog.scopeLabel')}
          ownerTitle={ownerTitle}
          applets={applets}
          onChange={(next) => {
            if (next.scope !== 'default') selectScope(next.scope, next.appletIds);
          }}
        />
      </SettingsField>
      <CommandConditionDetails when={when} onChange={onChange} {...draft} />
    </BindingEditorPanel>
  );
}
