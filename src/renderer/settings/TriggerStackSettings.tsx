import { useState } from 'react';
import type { Settings, ExtensionSnapshot, SettingDefinition } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';
import {
  triggerStacks,
  sortTriggerStacksForDisplay,
  applyTriggerStack,
  normalizeStackInput,
  type TriggerStack,
  type TriggerStackKind,
} from '../../shared/trigger-stacks';
import { gestureTypes, gestureTitle } from '../../shared/gestures';
import { touchpadGestureTypes, touchpadTitle } from '../../shared/touchpad-gestures';
import { getKeybindingOptions } from '../../shared/keybindings';
import { shortcutPageChoices } from '../../shared/shortcut-pages';
import { useHostTranslation } from '../HostTranslation';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsField } from '../settings-ui/SettingsSections';
import { SettingsListTable } from '../settings-ui/SettingsListTable';
import { CommandListSection } from '../settings-ui/CommandListScroll';
import { ShortcutCaptureField } from '../settings-ui/ShortcutCaptureField';
import { CommandStackEditor, StackExecutionMode } from './CommandStackEditor';

export const triggerStackTitle = (stack: Pick<TriggerStack, 'kind' | 'input'>) =>
  stack.kind === 'shortcuts'
    ? stack.input
    : stack.kind === 'gestures'
      ? gestureTitle(stack.input)
      : touchpadTitle(stack.input);

export function TriggerStackDialog({
  settings,
  initial,
  original = initial,
  commands,
  applets,
  onChange,
  onClose,
  initialEntryId,
}: {
  settings: Settings;
  initial: TriggerStack;
  original?: TriggerStack | null;
  commands: UiCommand[];
  applets: { id: string; title: string }[];
  onChange(settings: Settings): void;
  onClose(): void;
  initialEntryId?: string;
}) {
  const { t } = useHostTranslation();
  const [value, setValue] = useState(() => structuredClone(initial));
  const [before] = useState(() => (original ? structuredClone(original) : undefined));
  const [valid, setValid] = useState(true);
  const keyGesture = value.kind === 'gestures' && value.input.startsWith('key:');
  const inherited =
    value.kind === 'shortcuts'
      ? getKeybindingOptions(settings).executionMode
      : value.kind === 'gestures'
        ? (settings.gestures?.executionMode ?? 'all')
        : (settings.touchpadGestures?.executionMode ?? 'all');
  let validInput = true;
  try {
    normalizeStackInput(value.kind, value.input);
  } catch {
    validInput = false;
  }
  return (
    <SettingsDialog
      className="command-stack-dialog"
      title={t(before ? 'settings.commandStacks.editTrigger' : 'settings.commandStacks.addTrigger')}
      onClose={onClose}
      valid={valid && validInput && value.entries.length > 0}
      onApply={async () => onChange(applyTriggerStack(settings, value, before))}
    >
      {(ready, setError) => (
        <>
          <div className="stack-trigger-header">
            <div className="stack-trigger-input">
              {value.kind !== 'shortcuts' && (
                <SettingsField title={t('settings.commandStacks.input')}>
                  <select
                    data-testid="stack-trigger-input"
                    aria-label={t('settings.commandStacks.input')}
                    value={keyGesture ? 'key:' : value.input}
                    onChange={(event) => setValue({ ...value, input: event.target.value })}
                  >
                    {(value.kind === 'gestures' ? gestureTypes : touchpadGestureTypes).map(
                      ([id, title]) => (
                        <option key={id} value={id}>
                          {title}
                        </option>
                      ),
                    )}
                    {value.kind === 'gestures' && (
                      <option value="key:">{t('settings.gestureBindingDialog.keyboard')}</option>
                    )}
                  </select>
                </SettingsField>
              )}
              {(value.kind === 'shortcuts' || keyGesture) && (
                <ShortcutCaptureField
                  label={value.kind === 'shortcuts' ? t('settings.commandStacks.input') : undefined}
                  showDescription={false}
                  allowWin={value.kind === 'shortcuts'}
                  value={keyGesture ? value.input.slice(4) : value.input}
                  onChange={(input) =>
                    setValue({ ...value, input: keyGesture ? 'key:' + input : input })
                  }
                  recordingReady={ready}
                  setError={setError}
                />
              )}
            </div>
            <StackExecutionMode
              value={value.executionMode}
              inherited={inherited}
              onChange={(executionMode) => setValue({ ...value, executionMode })}
            />
          </div>
          <CommandStackEditor
            entries={value.entries}
            onChange={(entries) => setValue({ ...value, entries })}
            commands={commands}
            applets={applets}
            keyboard={value.kind === 'shortcuts'}
            onValidity={setValid}
            initialEntryId={initialEntryId}
            maxEntries={2000}
          />
        </>
      )}
    </SettingsDialog>
  );
}

export function TriggerStackSettings({
  settings,
  kind,
  commands,
  applets,
  onChange,
  busy = false,
}: {
  settings: Settings;
  kind: TriggerStackKind;
  commands: UiCommand[];
  applets: ExtensionSnapshot[];
  onChange(settings: Settings): void;
  busy?: boolean;
}) {
  const { t } = useHostTranslation();
  const [dialog, setDialog] = useState<{
    kind: 'edit' | 'delete';
    stack: TriggerStack;
    adding?: boolean;
  } | null>(null);
  const stacks = sortTriggerStacksForDisplay(triggerStacks(settings, kind));
  const list: SettingDefinition = {
    key: 'stacks',
    title: t('settings.commandStacks.triggers'),
    type: 'object-list',
    itemTitle: t('settings.commandStacks.input'),
    fields: [
      { key: 'title', title: t('settings.commandStacks.input'), type: 'string' },
      { key: 'commands', title: t('settings.commandStacks.commands'), type: 'string' },
      { key: 'mode', title: t('settings.commandStacks.mode'), type: 'string' },
    ],
    list: { idKey: 'input', titleKey: 'title', columns: ['title', 'commands', 'mode'] },
  };
  return (
    <CommandListSection
      title={t('settings.commandStacks.triggers')}
      data-testid="trigger-stack-table"
    >
      <SettingsListTable
        definition={list}
        entries={stacks.map((stack) => ({
          ...stack,
          title: triggerStackTitle(stack),
          commands: stack.entries
            .map(
              (row) => commands.find((command) => command.id === row.command)?.title ?? row.command,
            )
            .join(' → '),
          mode: t(
            stack.executionMode === 'inherit'
              ? 'settings.inputExecution.inherit'
              : `settings.commandExecutionModeField.${stack.executionMode}`,
          ),
        }))}
        busy={busy}
        addInTitle
        commandListScroll
        maxItems={2000}
        canAdd={stacks.length < 2000}
        onAdd={() =>
          setDialog({
            kind: 'edit',
            adding: true,
            stack: {
              kind,
              input: kind === 'shortcuts' ? '' : kind === 'gestures' ? 'move-up' : 'three.tap',
              executionMode: 'inherit',
              entries: [],
            },
          })
        }
        onEdit={(index) => setDialog({ kind: 'edit', stack: structuredClone(stacks[index]) })}
        onDelete={(index) => setDialog({ kind: 'delete', stack: structuredClone(stacks[index]) })}
      />
      {dialog?.kind === 'edit' && (
        <TriggerStackDialog
          settings={settings}
          initial={dialog.stack}
          original={dialog.adding ? null : dialog.stack}
          commands={commands}
          applets={shortcutPageChoices(applets)}
          onChange={onChange}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <SettingsDialog
          title={t('settings.commandStacks.deleteTrigger')}
          description={t('settings.commandStacks.deleteHint')}
          applyLabel={t('settings.customCommandsSettings.delete')}
          onClose={() => setDialog(null)}
          onApply={async () => onChange(applyTriggerStack(settings, null, dialog.stack))}
        >
          <p>{triggerStackTitle(dialog.stack)}</p>
        </SettingsDialog>
      )}
    </CommandListSection>
  );
}
