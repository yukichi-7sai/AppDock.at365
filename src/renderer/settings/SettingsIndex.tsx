import { useHostTranslation } from '../HostTranslation';
import { useEffect, useState } from 'react';
import type { SettingsIndexModel, SettingsPageOperation } from '../../shared/settings-page';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { Icon, type IconName } from '../../shared/ui-icons';
import { defaultShellId } from '../../shared/shell';
import { appletSettingsPageId } from '../../shared/settings-catalog';

const indexIcons: Partial<Record<string, IconName>> = {
  applets: 'extensions',
  notifications: 'bell',
  'command-triggers': 'bolt',
  shortcuts: 'keyboard',
  gestures: 'mouse',
  'touchpad-gestures': 'touchpad',
};

export function SettingsIndex({
  content,
  act,
  pending = false,
}: {
  content: SettingsIndexModel;
  act(op: SettingsPageOperation): void;
  pending?: boolean;
}) {
  const { t } = useHostTranslation();
  const [query, setQuery] = useState(content.query),
    [selected, setSelected] = useState(-1);
  const results = content.results.filter(
    (item) => item.pageId !== appletSettingsPageId(defaultShellId),
  );
  useEffect(() => setQuery(content.query), [content.query]);
  useEffect(() => setSelected(-1), [content.query, results.map((r) => r.id).join('\n')]);
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
  const row = (p: SettingsIndexModel['navigation'][number]) => (
    <button
      key={p.id}
      data-testid={`settings-nav:${p.id}`}
      className={p.id === content.page.id ? 'selected' : undefined}
      aria-current={p.id === content.page.id ? 'true' : undefined}
      onClick={() => act({ kind: 'select', pageId: p.id })}
    >
      <span className="settings-index-icon" aria-hidden="true">
        {p.id === 'about' ? (
          <span className="brand-mark small">
            <span />
            <span />
            <span />
          </span>
        ) : (
          indexIcons[p.id] && <Icon name={indexIcons[p.id]!} />
        )}
      </span>
      <span title={p.title}>{p.title}</span>
    </button>
  );
  return (
    <>
      <SettingsInput
        className="settings-search"
        type="search"
        role="combobox"
        aria-label={t('settings.search')}
        placeholder={t('settings.searchPlaceholder')}
        maxLength={512}
        disabled={pending}
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
            const length = results.length;
            if (length)
              setSelected((i) =>
                e.key === 'ArrowDown' ? Math.min(i + 1, length - 1) : Math.max(i - 1, 0),
              );
          } else if (e.key === 'Enter' && searching && selected >= 0 && results[selected]) {
            e.preventDefault();
            choose(results[selected].id);
          }
        }}
      />
      <div className="sidebar-extensions">
        {searching ? (
          <>
            <p className="settings-result-count" role="status">
              {t('settings.resultCount', { count: results.length })}
            </p>
            <div id="settings-results" role="listbox" aria-label={t('settings.searchResults')}>
              {results.map((item, index) => (
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
            {!results.length && <p className="muted">{t('settings.searchEmpty')}</p>}
          </>
        ) : (
          <>
            <h3 className="settings-applet-heading" data-testid="settings-host-heading">
              {t('settings.index.hostHeading')}
            </h3>
            <div aria-label={t('settings.host')} data-testid="settings-host-pages">
              {content.navigation.filter((p) => !p.owner && p.id !== 'applets').map(row)}
            </div>
            <h3 className="settings-applet-heading">Applet</h3>
            <div aria-label={t('settings.applets')} data-testid="settings-applet-pages">
              {content.navigation.filter((p) => p.id === 'applets').map(row)}
              {content.navigation.filter((p) => p.owner && p.owner !== defaultShellId).map(row)}
            </div>
          </>
        )}
      </div>
    </>
  );
}
