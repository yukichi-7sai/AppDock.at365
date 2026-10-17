import { useSettingsControls } from './api';
import { useEffect, useRef } from 'react';
import type { UiCommand } from '../../shared/commands';

/** No renderer implementation here: the caller only receives a selected command ID. */
export function CommandPicker(props: {
  commands: UiCommand[];
  pins: string[];
  shortcuts: Record<string, string[]>;
  onChoose(command: UiCommand): void;
  onClose(): void;
}) {
  const settingsControls = useSettingsControls();
  const current = useRef(props);
  current.current = props;
  useEffect(() => {
    const requestId = crypto.randomUUID();
    let live = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void settingsControls
      .openCommandPalette({
        requestId,
        mode: 'select',
        commandIds: props.commands.map((c) => c.id),
        pins: props.pins,
        shortcuts: props.shortcuts,
      })
      .then((result) => {
        if (!live) return;
        if (result.status === 'selected') {
          const command = current.current.commands.find((c) => c.id === result.commandId);
          if (command) current.current.onChoose(command);
          else current.current.onClose();
        } else current.current.onClose();
      })
      .catch(() => {
        if (live) current.current.onClose();
      });
    return () => {
      live = false;
      void settingsControls.cancelCommandPalette(requestId).catch(() => {});
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return null;
}
