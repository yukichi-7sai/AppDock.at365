import { useLayoutEffect, useRef, useState } from 'react';
import type { Settings, ExtensionSnapshot, SettingDefinition } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';
import {
  triggerStacks,
  sortTriggerStacksForDisplay,
  applyTriggerStack,
  normalizeStackInput,
  inheritedTriggerExecutionMode,
  type TriggerStack,
  type TriggerStackKind,
} from '../../shared/trigger-stacks';
import { gestureTitle } from '../../shared/gestures';
import { touchpadTitle } from '../../shared/touchpad-gestures';
import { shortcutPageChoices } from '../../shared/shortcut-pages';
import { useHostTranslation } from '../HostTranslation';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsField } from '../settings-ui/SettingsSections';
import { SettingsListTable } from '../settings-ui/SettingsListTable';
import { CommandListSection } from '../settings-ui/CommandListScroll';
import { ShortcutCaptureField } from '../settings-ui/ShortcutCaptureField';
import { GestureInputPicker } from '../settings-ui/GestureInputPicker';
import { CommandStackEditor, StackExecutionMode } from './CommandStackEditor';
import { SettingsMcpScope } from '../settings-ui/SettingsMcpAccess';
import { settingsItemId } from '../../shared/settings-catalog';

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
  inheritedMode,
}: {
  settings: Settings;
  initial: TriggerStack;
  original?: TriggerStack | null;
  commands: UiCommand[];
  applets: { id: string; title: string }[];
  onChange(settings: Settings): void;
  onClose(): void;
  initialEntryId?: string;
  inheritedMode?: 'first' | 'all';
}) {
  const { t } = useHostTranslation();
  const [value, setValue] = useState(() => structuredClone(initial));
  const [before] = useState(() => (original ? structuredClone(original) : undefined));
  const [valid, setValid] = useState(true);
  const [selecting, setSelecting] = useState(!before);
  const selection = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = selecting
        ? selection.current?.querySelector<HTMLElement>('[data-initial-focus], .shortcut-capture')
        : editor.current?.querySelector<HTMLElement>('[data-testid="stack-add-command"]');
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selecting]);
  const inherited = inheritedMode ?? inheritedTriggerExecutionMode(settings, value.kind);
  let validInput = true;
  try {
    normalizeStackInput(value.kind, value.input);
  } catch {
    validInput = false;
  }
  const duplicate =
    !before && triggerStacks(settings, value.kind).some((stack) => stack.input === value.input);
  return (
    <SettingsMcpScope itemId={settingsItemId(value.kind, 'bindings')}>
      <SettingsDialog
        className="command-stack-dialog"
        title={t(
          before ? 'settings.commandStacks.editTrigger' : 'settings.commandStacks.addTrigger',
        )}
        description={
          !before && (
            <span className="stack-creation-steps">
              <span aria-current={selecting ? 'step' : undefined}>
                {t('settings.commandStacks.chooseTriggerStep')}
              </span>
              <span aria-current={!selecting ? 'step' : undefined}>
                {t('settings.commandStacks.editStackStep')}
              </span>
            </span>
          )
        }
        onClose={onClose}
        valid={validInput && !duplicate && (selecting || (valid && value.entries.length > 0))}
        error={duplicate ? t('settings.commandStacks.triggerExists') : undefined}
        applyLabel={
          selecting
            ? t('settings.commandStacks.next')
            : before
              ? 'OK'
              : t('settings.bindingEditDialog.addAction')
        }
        closeAfterApply={!selecting}
        resetAction={
          !before && !selecting
            ? {
                label: t('settings.commandStacks.backToTrigger'),
                onClick: () => setSelecting(true),
              }
            : undefined
        }
        onApply={async () => {
          if (selecting) {
            setSelecting(false);
            return;
          }
          onChange(
            applyTriggerStack(
              settings,
              before ? { ...value, kind: before.kind, input: before.input } : value,
              before,
            ),
          );
        }}
      >
        {(ready, setError) => (
          <>
            {!before && (
              <div
                ref={selection}
                className="stack-trigger-selection"
                hidden={!selecting}
                data-testid="stack-trigger-selection"
              >
                {value.kind === 'shortcuts' ? (
                  <ShortcutCaptureField
                    label={t('settings.commandStacks.input')}
                    showDescription={false}
                    value={value.input}
                    onChange={(input) => setValue({ ...value, input })}
                    recordingReady={ready}
                    setError={setError}
                  />
                ) : (
                  <GestureInputPicker
                    touchpad={value.kind === 'touchpad-gestures'}
                    value={value.input}
                    onChange={(input) => setValue({ ...value, input })}
                    recordingReady={ready}
                    setError={setError}
                  />
                )}
              </div>
            )}
            <div
              ref={editor}
              className="stack-command-step"
              hidden={selecting}
              data-testid="stack-command-step"
            >
              <div className="stack-trigger-header">
                <div className="stack-trigger-input">
                  <SettingsField
                    title={t('settings.commandStacks.input')}
                    settingKey={value.kind === 'shortcuts' ? 'key' : 'gesture'}
                  >
                    <div className="stack-trigger-summary" data-testid="stack-trigger-readonly">
                      {triggerStackTitle(before ?? value)}
                    </div>
                  </SettingsField>
                </div>
                <SettingsMcpScope fieldKey="inputExecutionModes">
                  <StackExecutionMode
                    value={value.executionMode}
                    inherited={inherited}
                    onChange={(executionMode) => setValue({ ...value, executionMode })}
                  />
                </SettingsMcpScope>
              </div>
              <CommandStackEditor
                entries={value.entries}
                onChange={(entries) => setValue({ ...value, entries })}
                commands={commands}
                applets={applets}
                keyboard={value.kind === 'shortcuts'}
                onValidity={setValid}
                initialEntryId={initialEntryId}
              />
            </div>
          </>
        )}
      </SettingsDialog>
    </SettingsMcpScope>
  );
}

export function TriggerStackSettings({
  settings,
  kind,
  commands,
  applets,
  onChange,
  busy = false,
  inheritedMode,
}: {
  settings: Settings;
  kind: TriggerStackKind;
  commands: UiCommand[];
  applets: ExtensionSnapshot[];
  onChange(settings: Settings): void;
  busy?: boolean;
  inheritedMode?: 'first' | 'all';
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
          inheritedMode={inheritedMode}
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
