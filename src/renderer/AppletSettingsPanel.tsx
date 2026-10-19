import type { ExtensionSnapshot } from '../shared/contracts';
import type { UiCommand } from '../shared/commands';
import { SettingsPage } from './settings/SettingsPage';
import { appletSettingsPageId } from '../shared/settings-catalog';

import { AppletShortcutOverview } from './settings-ui/AppletShortcutOverview';
import type { SettingsEditor } from './useSettingsEditor';
import { useLayoutEffect, useRef } from 'react';

/** Separate detail tabs edit the same host settings session. */
export function AppletSettingsPanel({
  ready,
  applet,
  applets,
  commands,
  editor,
  tab,
}: {
  ready: boolean;
  applet: ExtensionSnapshot;
  applets: { id: string; title: string }[];
  commands: UiCommand[];
  editor: SettingsEditor;
  tab: 'settings' | 'shortcuts';
}) {
  const { value: settings, edit } = editor;
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [applet.id, tab]);
  return (
    <div
      className={`applet-settings-panel${tab === 'settings' ? ' shell-settings-panel' : ''}`}
      ref={panel}
    >
      {tab === 'settings' ? (
        <SettingsPage
          key={applet.id}
          ready={ready}
          context="applet"
          pageId={appletSettingsPageId(applet.id)}
        />
      ) : (
        <AppletShortcutOverview
          key={applet.id}
          applet={applet}
          allCommands={commands}
          settings={settings}
          applets={applets}
          onChange={edit}
        />
      )}
    </div>
  );
}
