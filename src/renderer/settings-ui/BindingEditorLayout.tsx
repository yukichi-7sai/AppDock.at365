import { useId, type ReactNode } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { Toggle } from './Toggle';
import './binding-editor.css';

/** Shared input/condition layout for all three command trigger editors. */
export function BindingEditorLayout({
  input,
  conditions,
}: {
  input: ReactNode;
  conditions: ReactNode;
}) {
  const { t } = useHostTranslation();
  return (
    <div className="binding-editor-layout">
      <BindingEditorPanel title={t('settings.bindingEditor.input')}>{input}</BindingEditorPanel>
      {conditions}
    </div>
  );
}

export function BindingEditorPanel({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="binding-editor-panel" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  );
}

export function BindingEnabledControl({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange(enabled: boolean): void;
}) {
  const { t } = useHostTranslation();
  const label = t('settings.gestureBindingDialog.enabled');
  return (
    <label className="binding-editor-enabled">
      <Toggle checked={enabled} label={label} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
