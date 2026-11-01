import type { CSSProperties, ReactNode } from 'react';
import type { ImageLibraryLayout } from '../../shared/image-library-page';
import { Icon } from '../../shared/ui-icons';
import { useLibraryTranslation } from './LibraryMedia';

export interface ImageBrowserGroup {
  id: string;
  title: string;
  count: number;
}

export function ImageBrowserNavigation({
  folders,
  folder,
  groups,
  group,
  layout,
  disabled,
  onFolder,
  onGroup,
  onLayout,
  folderHeading,
  groupHeading,
  groupFooter,
  folderAction,
  groupAction,
}: {
  folders: string[];
  folder: string;
  groups: ImageBrowserGroup[];
  group: string;
  layout: ImageLibraryLayout;
  disabled?: boolean;
  onFolder(value: string): void;
  onGroup(value: string): void;
  onLayout(value: ImageLibraryLayout): void;
  folderHeading?: ReactNode;
  groupHeading?: ReactNode;
  groupFooter?: ReactNode;
  folderAction?(folder: string): ReactNode;
  groupAction?(group: ImageBrowserGroup): ReactNode;
}) {
  const { t } = useLibraryTranslation();
  const toggle = (kind: 'collapsedFolders' | 'collapsedGroups', key: string) =>
    onLayout({
      ...layout,
      [kind]: layout[kind].includes(key)
        ? layout[kind].filter((v) => v !== key)
        : [...layout[kind], key],
    });
  const groupRow = (g: ImageBrowserGroup, label = g.title) => (
    <div className="library-nav-row" key={g.id}>
      <button
        type="button"
        data-gallery-group={['all', 'unfiled'].includes(g.id) ? undefined : g.id}
        data-testid="library-group-target"
        disabled={disabled}
        aria-current={g.id === group ? 'page' : undefined}
        title={g.title}
        onClick={() => onGroup(g.id)}
      >
        <span>{label}</span>
        <small>{g.count}</small>
      </button>
      {!['all', 'unfiled'].includes(g.id) && groupAction?.(g)}
    </div>
  );
  const buckets: { prefix: string; groups: ImageBrowserGroup[] }[] = [];
  const byPrefix = new Map<string, (typeof buckets)[number]>();
  for (const g of groups.slice(2)) {
    const colon = g.title.indexOf(':'),
      prefix = colon > 0 ? g.title.slice(0, colon).trim() : '';
    if (!prefix) buckets.push({ prefix: '', groups: [g] });
    else {
      let bucket = byPrefix.get(prefix);
      if (!bucket) {
        bucket = { prefix, groups: [] };
        byPrefix.set(prefix, bucket);
        buckets.push(bucket);
      }
      bucket.groups.push(g);
    }
  }
  const folderChildren = new Map<string, string[]>();
  for (const f of folders) {
    if (!f) continue;
    const parent = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
    const children = folderChildren.get(parent) ?? [];
    children.push(f);
    folderChildren.set(parent, children);
  }
  const folderRow = (value: string, level = 0): ReactNode => {
    const children = value ? (folderChildren.get(value) ?? []) : [],
      closed = layout.collapsedFolders.includes(value);
    return (
      <div key={value}>
        <div className="library-nav-row" style={{ '--folder-depth': level } as CSSProperties}>
          {children.length ? (
            <button
              type="button"
              className="library-folder-toggle library-icon-button"
              aria-label={t(closed ? 'images.expandItem' : 'images.collapseItem', {
                name: value || t('images.rootFolder'),
              })}
              aria-expanded={!closed}
              disabled={disabled}
              onClick={() => toggle('collapsedFolders', value)}
            >
              <Icon name="chevron" size={12} />
            </button>
          ) : (
            <span className="library-folder-spacer" />
          )}
          <button
            type="button"
            className="library-folder-name"
            data-gallery-folder={value}
            aria-current={folder === value ? 'page' : undefined}
            disabled={disabled}
            title={value || t('images.rootFolder')}
            onClick={() => onFolder(value)}
          >
            <Icon name="folder" size={15} />
            <span>{value ? value.split('/').at(-1) : t('images.rootFolder')}</span>
          </button>
          {folderAction?.(value)}
        </div>
        {!closed && children.map((child) => folderRow(child, level + 1))}
      </div>
    );
  };
  return (
    <>
      <div className="library-section-heading">
        <strong>{t('images.folder')}</strong>
        {folderHeading}
      </div>
      <nav aria-label={t('images.folder')}>
        <div className="library-nav-row">
          <button
            type="button"
            disabled={disabled}
            aria-current={folder === '*' ? 'page' : undefined}
            onClick={() => onFolder('*')}
          >
            <Icon name="folder" size={15} />
            <span>{t('images.allFolders')}</span>
          </button>
        </div>
        {folderRow('')}
        {(folderChildren.get('') ?? []).map((value) => folderRow(value))}
      </nav>
      <div className="library-section-heading">
        <strong>{t('images.groups')}</strong>
        {groupHeading}
      </div>
      <nav aria-label={t('images.groups')}>
        {groups.slice(0, 2).map((g) => groupRow(g))}
        {buckets.map((bucket) =>
          bucket.prefix ? (
            <div className="library-prefix" key={bucket.prefix}>
              <button
                type="button"
                className="library-prefix-toggle"
                disabled={disabled}
                aria-expanded={!layout.collapsedGroups.includes(bucket.prefix)}
                onClick={() => toggle('collapsedGroups', bucket.prefix)}
              >
                <Icon name="chevron" size={12} />
                <span>{bucket.prefix}</span>
                <small>{bucket.groups.length}</small>
              </button>
              {!layout.collapsedGroups.includes(bucket.prefix) && (
                <div className="library-prefix-children">
                  {bucket.groups.map((g) =>
                    groupRow(g, g.title.slice(g.title.indexOf(':') + 1).trim()),
                  )}
                </div>
              )}
            </div>
          ) : (
            groupRow(bucket.groups[0])
          ),
        )}
      </nav>
      {groupFooter}
    </>
  );
}
