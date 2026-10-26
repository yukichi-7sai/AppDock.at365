import { createContext, useContext, type ReactNode } from 'react';
import type {
  SettingsMcpAccess,
  SettingsMcpItemAccess,
  SettingsMcpFieldAccess,
} from '../../shared/settings-mcp-access';
import { SettingsLockIcon } from './SettingsHintIcon';
import { useHostTranslation } from '../HostTranslation';

const Access = createContext<SettingsMcpAccess | undefined>(undefined);
const Scope = createContext<
  (SettingsMcpItemAccess & { field?: SettingsMcpFieldAccess }) | undefined
>(undefined);
export const SettingsMcpAccessProvider = Access.Provider;
const own = <T,>(record: Record<string, T> | undefined, key: string) =>
  record && Object.hasOwn(record, key) ? record[key] : undefined;

/** Row/dialog contexts carry identities through React portals; they do not control visibility. */
export function SettingsMcpScope({
  itemId,
  rowId,
  fieldKey,
  children,
}: {
  itemId?: string;
  rowId?: string;
  fieldKey?: string;
  children: ReactNode;
}) {
  const access = useContext(Access),
    inherited = useContext(Scope);
  const item = itemId ? own(access?.items, itemId) : inherited;
  const fields = rowId !== undefined && item?.rows ? (own(item.rows, rowId) ?? {}) : item?.fields;
  const field = fieldKey
    ? (own(item?.fields, fieldKey) ?? inherited?.field ?? { reason: 'unsupported' as const })
    : itemId
      ? item && !item.fields
        ? { reason: item.reason }
        : undefined
      : inherited?.field;
  return (
    <Scope.Provider value={item ? { ...item, fields, field } : undefined}>
      {children}
    </Scope.Provider>
  );
}

export function SettingsMcpLock({
  title,
  itemId,
  settingKey,
  level = 'field',
}: {
  title: string;
  itemId?: string;
  settingKey?: string;
  level?: 'field' | 'group';
}) {
  const { t } = useHostTranslation();
  const access = useContext(Access),
    inherited = useContext(Scope);
  if (!access) return null;
  const item = itemId ? own(access.items, itemId) : inherited;
  if (level === 'group' && !item) return null;
  const field = settingKey
    ? (own(item?.fields, settingKey) ?? inherited?.field)
    : itemId
      ? item
      : inherited?.field;
  const reason = field ? (field.reason ?? access.reason) : 'unsupported';
  if (!reason) return null;
  const textKey = `settings.mcpAccess.${reason}` as const;
  return (
    <span data-mcp-lock={reason}>
      <SettingsLockIcon title={title} description={t(textKey)} />
    </span>
  );
}
