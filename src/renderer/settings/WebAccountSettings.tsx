import { useHostTranslation } from '../HostTranslation';
import { CommandListSection, CommandListSummary } from '../settings-ui/CommandListScroll';
import {
  ListIcon,
  SettingsListAddButton,
  SettingsListLayout,
} from '../settings-ui/SettingsListTable';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { useSettingsControls } from '../settings-ui/api';
import { SettingsMcpLock } from '../settings-ui/SettingsMcpAccess';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { settingsItemId } from '../../shared/settings-catalog';
import { useEffect, useRef, useState } from 'react';
import type { RemotePageDefinition as WebApplet, WebProfile } from '../../shared/web-content';

function AccountRow({
  account,
  users,
  busy,
  rename,
  remove,
  clear,
}: {
  account: WebProfile;
  users: string[];
  busy: boolean;
  rename(name: string): Promise<boolean>;
  remove(): void;
  clear(): void;
}) {
  const { t: translate } = useHostTranslation();
  const [name, setName] = useState(account.name);
  const savedName = useRef(account.name);
  const pending = useRef<{ value: string; sequence: number } | null>(null);
  const sequence = useRef(0);
  const composing = useRef(false);
  useEffect(() => {
    const previous = savedName.current;
    savedName.current = account.name;
    setName((current) =>
      current.trim() === previous || current.trim() === account.name ? account.name : current,
    );
  }, [account.name]);
  async function commit(value = name) {
    if (
      busy ||
      composing.current ||
      !value.trim() ||
      value.trim() === pending.current?.value ||
      (!pending.current && value.trim() === savedName.current)
    )
      return;
    const request = ++sequence.current;
    pending.current = { value: value.trim(), sequence: request };
    try {
      if (await rename(value)) savedName.current = value.trim();
    } finally {
      if (pending.current?.sequence === request) pending.current = null;
    }
  }
  return (
    <tr data-account-id={account.id}>
      <td className="settings-list-primary">
        <SettingsInput
          commitOn="input"
          aria-label={translate('settings.webAccountSettings.nameLabel', { name: account.name })}
          maxLength={80}
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => void commit(e.currentTarget.value)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            if (document.activeElement !== e.currentTarget) void commit(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (
              e.key === 'Escape' &&
              !e.nativeEvent.isComposing &&
              !composing.current &&
              !pending.current
            ) {
              e.preventDefault();
              e.stopPropagation();
              setName(savedName.current);
              return;
            }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && name.trim()) {
              e.preventDefault();
              void commit(e.currentTarget.value);
            }
          }}
        />
      </td>
      <td className="settings-list-wrap">
        {users.length ? users.join('、') : translate('settings.webAccountSettings.unused')}
      </td>
      <td className="settings-list-actions-cell">
        <div className="settings-list-actions">
          <button
            type="button"
            className="settings-list-icon"
            title={translate('settings.webAccountSettings.clear')}
            aria-label={translate('settings.webAccountSettings.clearLabel', { name: account.name })}
            disabled={busy}
            onClick={clear}
          >
            <ListIcon kind="clear" />
          </button>
          <button
            type="button"
            className="settings-list-icon settings-list-delete"
            title={translate('settings.webAccountSettings.delete')}
            aria-label={translate('settings.webAccountSettings.deleteLabel', {
              name: account.name,
            })}
            disabled={busy || users.length > 0}
            onClick={remove}
          >
            <ListIcon kind="delete" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function WebAccountSettings({
  accounts,
  savedItems,
}: {
  accounts: WebProfile[];
  savedItems: Pick<WebApplet, 'id' | 'name' | 'accountId'>[];
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    kind: 'delete' | 'clear';
    account: WebProfile;
  } | null>(null);
  const locked = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  async function run(work: () => Promise<unknown>, lock = true, throwOnError = false) {
    if (lock && locked.current) {
      if (throwOnError) throw Error(translate('services.remotePages.accountBusy'));
      return false;
    }
    if (lock) {
      locked.current = true;
      setBusy(true);
    }
    const task = queue.current.then(async () => {
      setMessage('');
      setError('');
      try {
        const result = await work();
        if (throwOnError && result === false)
          throw Error(translate('settings.webAccountSettings.canceled'));
        if (result === false) setMessage(translate('settings.webAccountSettings.canceled'));
        return result !== false;
      } catch (error) {
        if (throwOnError) throw error;
        setError(
          error instanceof Error ? error.message : translate('settings.webAccountSettings.failed'),
        );
        return false;
      } finally {
        if (lock) {
          locked.current = false;
          setBusy(false);
        }
      }
    });
    queue.current = task.catch(() => {});
    return task;
  }
  useSettingsFeedback({
    error,
    message,
    busy,
    target: translate('settings.webAccountSettings.title'),
  });
  return (
    <>
      {confirmation && (
        <SettingsDialog
          title={translate(`settings.webAccountSettings.${confirmation.kind}`)}
          applyLabel={translate(`services.remotePages.${confirmation.kind}`)}
          onClose={() => setConfirmation(null)}
          onApply={async () => {
            const { kind, account } = confirmation;
            await run(
              () =>
                kind === 'delete'
                  ? settingsControls.deleteWebAccount(account.id, account)
                  : settingsControls.clearWebAccount(account.id, account),
              true,
              true,
            );
          }}
        >
          <p data-initial-focus tabIndex={-1}>
            {translate(`services.remotePages.${confirmation.kind}Account`, {
              name: confirmation.account.name,
            })}
          </p>
          <p className="muted">{translate(`services.remotePages.${confirmation.kind}Details`)}</p>
        </SettingsDialog>
      )}
      <CommandListSection
        title={translate('settings.webAccountSettings.settings')}
        {...settingAnchor('web-accounts', 'accounts')}
      >
        <SettingsListLayout
          title={translate('settings.webAccountSettings.title')}
          actionsAlign="start"
          commandListScroll
          toolbar={
            <CommandListSummary className="settings-list-toolbar" actions={null}>
              <span role="status">
                {translate('settings.settingsListTable.unlimitedCount', {
                  count: accounts.length,
                })}
              </span>
            </CommandListSummary>
          }
        >
          <thead>
            <tr>
              <th>
                <span className="settings-list-heading">
                  {translate('settings.webAccountSettings.name')}
                  <SettingsMcpLock
                    title={translate('settings.webAccountSettings.name')}
                    itemId={settingsItemId('web-accounts', 'accounts')}
                    settingKey="name"
                  />
                  <SettingsListAddButton
                    label={translate('settings.webAccountSettings.add')}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        settingsControls.createWebAccount(
                          translate('settings.webAccountSettings.defaultName', {
                            value: accounts.length + 1,
                          }),
                        ),
                      )
                    }
                  />
                </span>
              </th>
              <th>{translate('settings.webAccountSettings.usage')}</th>
              <th className="settings-list-actions-heading">
                <span className="settings-list-heading">
                  {translate('settings.settingsListTable.actions')}
                  <SettingsMcpLock
                    title={translate('settings.settingsListTable.actions')}
                    itemId={settingsItemId('web-accounts', 'accounts')}
                    settingKey="clearWebAccount"
                  />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const users = [
                ...new Map(
                  savedItems
                    .filter((item) => item.accountId === account.id)
                    .map((item) => [item.id, item.name]),
                ).values(),
              ];
              return (
                <AccountRow
                  key={account.id}
                  account={account}
                  users={users}
                  busy={busy}
                  rename={(name) =>
                    run(() => settingsControls.renameWebAccount(account.id, name), false)
                  }
                  remove={() => setConfirmation({ kind: 'delete', account: { ...account } })}
                  clear={() => setConfirmation({ kind: 'clear', account: { ...account } })}
                />
              );
            })}
            {!accounts.length && (
              <tr>
                <td colSpan={3} className="settings-list-empty">
                  {translate('settings.webAccountSettings.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </SettingsListLayout>
      </CommandListSection>
    </>
  );
}
