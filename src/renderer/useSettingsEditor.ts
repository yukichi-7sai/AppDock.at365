import { flushSettingsPageInputs } from './settings-input-flush';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Settings, SettingsSnapshot } from '../shared/contracts';
import type { SettingsEdit, SettingsInputState } from '../shared/settings-editing';
import { createDefaultSettings } from '../shared/settings-schema';
import { defaultNavigation } from '../shared/navigation';
/** Renderer input queue. No global draft or save/discard state. */
export function useSettingsEditor(current: SettingsSnapshot | undefined) {
  const [state, setState] = useState<SettingsInputState>(() => ({
    sessionId: '',
    editRevision: -1,
    revision: current?.revision ?? -1,
    value: current?.value ?? createDefaultSettings(),
    mode: 'form',
    pending: false,
    pageId: defaultNavigation.section,
  }));
  const [error, setError] = useState('');
  const local = useRef(state),
    accepted = useRef<SettingsInputState | undefined>(undefined),
    queue = useRef(Promise.resolve()),
    queued = useRef(0),
    live = useRef(true);
  local.current = state;
  const receive = (next: SettingsInputState) => {
    if (accepted.current && next.editRevision < accepted.current.editRevision) return;
    accepted.current = next;
    if (live.current && !queued.current) {
      setState(next);
      local.current = next;
    }
  };
  useEffect(() => {
    live.current = true;
    const refresh = () => {
      void window.dock.settingsEditing().then(receive);
    };
    const stop = window.dock.onSettingsEditingChanged(refresh);
    refresh();
    return () => {
      live.current = false;
      stop();
    };
  }, []);
  useEffect(() => {
    void window.dock.settingsEditing().then(receive);
  }, [current?.revision]);
  const ownRevision = useRef(-1);
  const send = (action: SettingsEdit) => {
    queued.current++;
    const work = queue.current.then(async () => {
      const base = await window.dock.settingsEditing();
      receive(base);
      if (action.type === 'values' && ownRevision.current === base.editRevision)
        action = { ...action, before: base.value };
      const next = await window.dock.editSettings({
        sessionId: base.sessionId,
        editRevision: base.editRevision,
        operationId: crypto.randomUUID(),
        action,
      });
      ownRevision.current = next.editRevision;
      receive(next);
      setError('');
    });
    queue.current = work
      .catch(async (e) => {
        accepted.current = await window.dock.settingsEditing();
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        queued.current--;
        if (!queued.current && accepted.current) receive(accepted.current);
      });
    return work;
  };
  const api = useMemo(
    () => ({
      edit: (value: Settings) => {
        const before = accepted.current?.value ?? local.current.value;
        setState({ ...local.current, value });
        local.current = { ...local.current, value };
        void send({ type: 'values', before, value }).catch(() => {});
      },
      selectPage: (pageId: string) => {
        void flushSettingsPageInputs()
          .then(() => send({ type: 'select-page', pageId }))
          .catch((e) => setError(String(e)));
      },
      reset: () => {
        setError('');
        void window.dock.settingsEditing().then(receive);
      },
      flush: () => queue.current,
    }),
    [],
  );
  return { ...state, error, ...api };
}
export type SettingsEditor = ReturnType<typeof useSettingsEditor>;
