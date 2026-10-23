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
  applyGestureOrder,
} from '../../shared/gestures';
import { BindingOrderDialog } from '../settings-ui/BindingOrderDialog';
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
  const gestures = touchpad
    ? (settings.touchpadGestures ?? defaultTouchpadGestures())
    : (settings.gestures ?? defaultGestures());
  return (
    <BindingOrderDialog
      bindings={gestures.bindings}
      commands={commands}
      initialInput={initialGesture}
      title="ジェスチャーの実行順"
      inputName="ジェスチャー"
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
      onApply={(ordered, original) =>
        onChange({
          ...settings,
          [touchpad ? 'touchpadGestures' : 'gestures']: {
            ...gestures,
            bindings: applyGestureOrder(gestures.bindings, original, ordered),
          },
        })
      }
      onClose={onClose}
    />
  );
}
