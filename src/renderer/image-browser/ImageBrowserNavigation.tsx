import type { CSSProperties, ReactNode } from 'react';
import type { ImageLibraryLayout } from '../../shared/image-library-page';
import { Icon } from '../../shared/ui-icons';
import { libraryOrderLabel } from '../../shared/order-list';
import { useLibraryTranslation } from './LibraryMedia';
import {
  externalLibraryLocation,
  externalLibraryPath,
  libraryFolderLabel,
  type LibrarySourceSnapshot,
} from '../../shared/library-sources';

export interface ImageBrowserGroup {
  id: string;
  title: string;
  count: number;
}

export function ImageBrowserNavigation({
  folders,
  sources = [],
  folder,
  groups,
  group,
  layout,
  disabled,
  onFolder,
  onGroup,
  onLayout,
  folderHeading,
  folderFooter,
  groupHeading,
  groupFooter,
  folderAction,
  groupAction,
}: {
  folders: string[];
  sources?: LibrarySourceSnapshot[];
  folder: string;
  groups: ImageBrowserGroup[];
  group: string;
  layout: ImageLibraryLayout;
  disabled?: boolean;
  onFolder(value: string): void;
  onGroup(value: string): void;
  onLayout(value: ImageLibraryLayout): void;
  folderHeading?: ReactNode;
  folderFooter?: ReactNode;
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
    const prefix = libraryOrderLabel(g.title).group ?? '';
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
    if (!f || externalLibraryLocation(f)?.relative === '*') continue;
    const parent = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
    const children = folderChildren.get(parent) ?? [];
    children.push(f);
    folderChildren.set(parent, children);
  }
  const folderRow = (value: string, level = 0): ReactNode => {
    const location = externalLibraryLocation(value);
    const label =
      libraryFolderLabel(value, sources, t('library.sources.direct')) || t('images.rootFolder');
    const children =
        value && (!location || location.relative) ? (folderChildren.get(value) ?? []) : [],
      closed = layout.collapsedFolders.includes(value);
    return (
      <div key={value}>
        <div
          className="library-nav-row library-folder-row"
          style={{ '--folder-depth': level } as CSSProperties}
        >
          {children.length ? (
            <button
              type="button"
              className="library-folder-toggle library-icon-button"
              aria-label={t(closed ? 'images.expandItem' : 'images.collapseItem', {
                name: label,
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
            title={label}
            onClick={() => onFolder(value)}
          >
            <Icon name="folder" size={15} />
            <span>
              {location && !location.relative
                ? t('library.sources.direct')
                : value
                  ? value.split('/').at(-1)
                  : t('images.rootFolder')}
            </span>
          </button>
          {folderAction?.(value)}
        </div>
        {!closed && children.map((child) => folderRow(child, level + 1))}
      </div>
    );
  };
  const rootRow = (
    key: string,
    label: string,
    children: ReactNode,
    source?: LibrarySourceSnapshot,
  ) => {
    const closed = layout.collapsedFolders.includes(key);
    const value = source ? key + '/*' : '*';
    return (
      <div key={key}>
        <div className="library-nav-row library-folder-row">
          <button
            type="button"
            className="library-folder-toggle library-icon-button"
            aria-expanded={!closed}
            aria-label={t(closed ? 'images.expandItem' : 'images.collapseItem', { name: label })}
            disabled={disabled}
            onClick={() => toggle('collapsedFolders', key)}
          >
            <Icon name="chevron" size={12} />
          </button>
          <button
            type="button"
            className="library-folder-name"
            data-gallery-root={key}
            disabled={disabled}
            title={source?.path ?? label}
            aria-current={folder === value ? 'page' : undefined}
            onClick={() => onFolder(value)}
          >
            <Icon name="folder" size={15} />
            <span className="library-source-name">
              {label}
              {source && (
                <small>
                  {t(
                    source.loading
                      ? 'library.sources.loading'
                      : !source.available
                        ? 'library.sources.unavailable'
                        : source.access === 'read-write'
                          ? 'library.sources.readWriteLabel'
                          : 'library.sources.readOnlyLabel',
                  )}
                </small>
              )}
            </span>
          </button>
          {source && folderAction?.(value)}
        </div>
        {!closed && children}
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
        {rootRow(
          '*',
          t('images.allFolders'),
          <>
            {folderRow('', 1)}
            {(folderChildren.get('') ?? [])
              .filter((value) => !externalLibraryLocation(value))
              .map((value) => folderRow(value, 1))}
          </>,
        )}
        {sources.map((source) => {
          const root = externalLibraryPath(source.id);
          return rootRow(
            root,
            source.name,
            <>
              {folderRow(root, 1)}
              {(folderChildren.get(root) ?? []).map((value) => folderRow(value, 1))}
            </>,
            source,
          );
        })}
      </nav>
      {folderFooter}
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
                  {bucket.groups.map((g) => groupRow(g, libraryOrderLabel(g.title).displayTitle))}
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
