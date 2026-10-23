import { useHostTranslation } from '../HostTranslation';
import { SettingsField } from '../settings-ui/SettingsSections';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { useSettingsControls } from '../settings-ui/api';
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
    <div className="web-account-card">
      <div className="web-account-row">
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
        <button
          className="secondary"
          disabled={busy || !name.trim() || name.trim() === account.name}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => void commit()}
        >
          {translate('settings.webAccountSettings.rename')}
        </button>
        <button className="secondary" disabled={busy} onClick={clear}>
          {translate('settings.webAccountSettings.clear')}
        </button>
        <button className="text-button danger" disabled={busy || users.length > 0} onClick={remove}>
          {translate('settings.webAccountSettings.delete')}
        </button>
      </div>
      <p className="muted">
        {users.length
          ? translate('settings.webAccountSettings.usedBy', { value: users.join('、') })
          : translate('settings.webAccountSettings.unused')}
      </p>
    </div>
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
  const locked = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  async function run(work: () => Promise<unknown>, lock = true) {
    if (lock && locked.current) return false;
    if (lock) {
      locked.current = true;
      setBusy(true);
    }
    const task = queue.current.then(async () => {
      setMessage('');
      setError('');
      try {
        const result = await work();
        if (result === false) setMessage(translate('settings.webAccountSettings.canceled'));
        return result !== false;
      } catch (error) {
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
    queue.current = task;
    return task;
  }
  useSettingsFeedback({
    error,
    message,
    busy,
    target: translate('settings.webAccountSettings.title'),
  });
  return (
    <SettingsField
      title={translate('settings.webAccountSettings.account')}
      description={translate('settings.webAccountSettings.hint')}
      className="settings-field-wide web-account-settings"
      {...settingAnchor('web-accounts', 'accounts')}
      aria-label={translate('settings.webAccountSettings.settings')}
    >
      <div className="actions">
        <button
          className="secondary"
          disabled={busy || accounts.length >= 32}
          onClick={() =>
            void run(() =>
              settingsControls.createWebAccount(
                translate('settings.webAccountSettings.defaultName', {
                  value: accounts.length + 1,
                }),
              ),
            )
          }
        >
          {translate('settings.webAccountSettings.add')}
        </button>
      </div>
      {!accounts.length && (
        <p className="muted">{translate('settings.webAccountSettings.empty')}</p>
      )}
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
            rename={(name) => run(() => settingsControls.renameWebAccount(account.id, name), false)}
            remove={() => void run(() => settingsControls.deleteWebAccount(account.id))}
            clear={() => void run(() => settingsControls.clearWebAccount(account.id))}
          />
        );
      })}
    </SettingsField>
  );
}
