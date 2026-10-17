import { useEffect, useState } from 'react';
import type { SettingsPageModel, SettingsPageOperation } from '../../shared/settings-page';
import { SettingsInput } from '../settings-ui/SettingsInput';

export function SettingsIndex({
  content,
  act,
}: {
  content: SettingsPageModel['content'];
  act(op: SettingsPageOperation): void;
}) {
  const [query, setQuery] = useState(content.query),
    [selected, setSelected] = useState(-1);
  useEffect(() => setQuery(content.query), [content.query]);
  useEffect(() => setSelected(-1), [content.query, content.results.map((r) => r.id).join('\n')]);
  useEffect(() => {
    if (selected >= 0)
      document.getElementById(`setting-result-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const change = (text: string) => {
    setQuery(text);
    act({ kind: 'search', text });
  };
  const choose = (id: string) => act({ kind: 'move', itemId: id });
  const searching = !!query.trim();
  const row = (p: SettingsPageModel['content']['navigation'][number]) => (
    <button
      key={p.id}
      className={p.id === content.page.id ? 'selected' : undefined}
      aria-current={p.id === content.page.id ? 'true' : undefined}
      onClick={() => act({ kind: 'select', pageId: p.id })}
    >
      <span title={p.title}>{p.title}</span>
    </button>
  );
  return (
    <>
      <SettingsInput
        className="settings-search"
        type="search"
        role="combobox"
        aria-label="設定を検索"
        placeholder="設定を検索…"
        maxLength={512}
        value={query}
        aria-expanded={searching}
        aria-controls="settings-results"
        aria-autocomplete="list"
        aria-activedescendant={selected >= 0 ? `setting-result-${selected}` : undefined}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            change('');
            setSelected(-1);
          } else if (searching && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
            e.preventDefault();
            const length = content.results.length;
            if (length)
              setSelected((i) =>
                e.key === 'ArrowDown' ? Math.min(i + 1, length - 1) : Math.max(i - 1, 0),
              );
          } else if (e.key === 'Enter' && searching && selected >= 0 && content.results[selected]) {
            e.preventDefault();
            choose(content.results[selected].id);
          }
        }}
      />
      <div className="sidebar-extensions">
        {searching ? (
          <>
            <p className="settings-result-count" role="status">
              {content.results.length}件の設定
            </p>
            <div id="settings-results" role="listbox" aria-label="設定の検索結果">
              {content.results.map((item, index) => (
                <button
                  id={`setting-result-${index}`}
                  key={item.id}
                  role="option"
                  aria-selected={selected === index}
                  className={selected === index ? 'selected' : undefined}
                  onClick={() => {
                    setSelected(index);
                    choose(item.id);
                  }}
                >
                  <span>{item.title}</span>
                  <small>{item.pageTitle}</small>
                  {item.unavailableReason && <small>{item.unavailableReason}</small>}
                </button>
              ))}
            </div>
            {!content.results.length && <p className="muted">該当する設定はありません。</p>}
          </>
        ) : (
          <>
            <div aria-label="本体の設定">{content.navigation.filter((p) => !p.owner).map(row)}</div>
            <h3 className="settings-applet-heading">Applet</h3>
            <div aria-label="Appletの設定">
              {content.navigation.filter((p) => p.owner).map(row)}
            </div>
          </>
        )}
      </div>
    </>
  );
}
