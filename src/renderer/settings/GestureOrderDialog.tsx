import { useHostTranslation } from '../HostTranslation';
import {
  defaultTouchpadGestures,
  touchpadTitle,
  touchpadGestureTypes,
} from '../../shared/touchpad-gestures';
import type { Settings } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';
import {
  defaultGestures,
  groupGestureBindings,
  gestureTitle,
  gestureConditionLabel,
  moveGestureBinding,
} from '../../shared/gestures';
import { BindingOrderDialog } from '../settings-ui/BindingOrderDialog';
import { applyBindingSettings } from '../../shared/binding-order';
export function GestureOrderDialog({
  touchpad = false,
  settings,
  commands,
  applets,
  initialGesture,
  onChange,
  onClose,
}: {
  touchpad?: boolean;
  settings: Settings;
  commands: UiCommand[];
  applets: { id: string; title: string }[];
  initialGesture?: string;
  onChange(value: Settings): void;
  onClose(): void;
}) {
  const { t: translate } = useHostTranslation();
  const gestures = touchpad
    ? (settings.touchpadGestures ?? defaultTouchpadGestures())
    : (settings.gestures ?? defaultGestures());
  return (
    <BindingOrderDialog
      bindings={gestures.bindings}
      executionMode={gestures.executionMode}
      inputExecutionModes={gestures.inputExecutionModes ?? {}}
      commands={commands}
      initialInput={initialGesture}
      title={translate('settings.gestureOrderDialog.title')}
      inputName={translate('settings.gestureOrderDialog.inputName')}
      inputLabel={touchpad ? touchpadTitle : gestureTitle}
      conditionLabel={(row, command) =>
        gestureConditionLabel(
          row.when,
          command?.extensionId ? command.extension : undefined,
          applets,
        )
      }
      groupRows={(rows) =>
        touchpad
          ? touchpadGestureTypes
              .map(
                ([id]) => [id, rows.filter((row) => row.gesture === id)] as [string, typeof rows],
              )
              .filter(([, group]) => group.length)
          : groupGestureBindings(rows).map((group) => [group.gesture, group.bindings])
      }
      moveRow={moveGestureBinding}
      onApply={(ordered, original, modes, originalModes) =>
        onChange({
          ...settings,
          [touchpad ? 'touchpadGestures' : 'gestures']: {
            ...gestures,
            ...applyBindingSettings(
              gestures.bindings,
              original,
              ordered,
              gestures.inputExecutionModes ?? {},
              originalModes,
              modes,
              (row) => row.gesture,
              touchpad ? touchpadTitle : gestureTitle,
            ),
          },
        })
      }
      onClose={onClose}
    />
  );
}
