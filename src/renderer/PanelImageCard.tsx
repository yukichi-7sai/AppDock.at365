import { useEffect, useRef, useState } from 'react';
import type { ExtensionSnapshot, Panel } from '../shared/contracts';

export function PanelImageCard({
  item,
  extension,
  busy,
  run,
}: {
  item: NonNullable<Panel['images']>[number];
  extension: ExtensionSnapshot;
  busy: boolean;
  run(work: () => Promise<unknown>): Promise<void>;
}) {
  const [preview, setPreview] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (preview) dialog.current?.showModal();
  }, [preview]);
  useEffect(() => {
    setPreview(false);
  }, [item.image]);
  return (
    <article>
      {item.image && (
        <button
          className="image-preview-button"
          aria-label={`${item.title}を拡大`}
          onClick={() => setPreview(true)}
        >
          <img src={item.image} alt={item.title} loading="lazy" decoding="async" />
        </button>
      )}
      <strong title={item.tooltip}>{item.title}</strong>
      <p>{item.description}</p>
      <div className="actions">
        {item.actions?.map((action) => (
          <button
            className="secondary"
            key={action.actionId ?? action.command}
            disabled={
              busy ||
              (!action.actionId &&
                !extension.commands.some(
                  (command) => command.id === action.command && command.available,
                ))
            }
            onClick={() =>
              void run(() =>
                action.actionId
                  ? window.dock.executePanelAction(extension.id, action.actionId)
                  : window.dock.executeCommand(action.command),
              )
            }
          >
            {action.title}
          </button>
        ))}
      </div>
      {preview && (
        <dialog
          ref={dialog}
          className="image-preview-dialog"
          aria-label="画像のプレビュー"
          onClose={() => setPreview(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) dialog.current?.close();
          }}
        >
          <button className="secondary" autoFocus onClick={() => dialog.current?.close()}>
            閉じる
          </button>
          <p>{item.title}</p>
          <img src={item.image} alt={item.title} />
        </dialog>
      )}
    </article>
  );
}
