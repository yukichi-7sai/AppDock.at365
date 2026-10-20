import { SettingsHint } from '../settings-ui/SettingsHint';
import { useState } from 'react';
import type { SettingDefinition, Settings } from '../../shared/contracts';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import {
  customItems,
  customCommandVersion,
  type CustomCommandDefinition,
  type CustomCommandDescriptor,
} from '../../shared/custom-commands';
import { SettingsListTable } from '../settings-ui/SettingsListTable';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsSection, SettingsField, SettingsChoice } from '../settings-ui/SettingsSections';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { McpCommandFields } from './McpCommandFields';
import { ProcessCommandFields } from './ProcessCommandFields';
import { defaultProcessLaunch } from '../../shared/process-launch';
import { ShortcutCaptureField } from '../settings-ui/ShortcutCaptureField';

const list: SettingDefinition = {
  key: 'definitions',
  title: 'カスタムコマンド',
  type: 'object-list',
  itemTitle: 'コマンド',
  fields: [
    { key: 'title', title: '名前', type: 'string' },
    { key: 'typeTitle', title: '種類・提供元', type: 'string' },
    { key: 'status', title: '状態', type: 'string' },
    { key: 'publication', title: '外部公開', type: 'string' },
  ],
  list: {
    idKey: 'id',
    titleKey: 'title',
    columns: ['title', 'typeTitle', 'status', 'publication'],
    enabledKey: 'enabled',
  },
};
type Invoke = (name: string, args?: unknown[]) => Promise<any>;
export function CustomCommandsSettings({
  settings,
  auxiliary,
  invoke,
  busy,
}: {
  settings: Settings;
  auxiliary?: SettingsPageAuxiliary['customCommands'];
  invoke: Invoke;
  busy: boolean;
}) {
  const items = customItems(settings.customCommands),
    types = auxiliary?.types ?? [];
  const supported =
    !settings.customCommands || settings.customCommands.version === customCommandVersion;
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<
    | null
    | {
        kind: 'edit' | 'delete';
        item: CustomCommandDefinition | null;
        types: CustomCommandDescriptor[];
        revision: string;
      }
    | { kind: 'order'; items: CustomCommandDefinition[]; revision: string }
  >(null);
  const update = (operations: unknown[], revision = auxiliary?.revision) =>
    invoke('updateCustomCommands', [{ expectedRevision: revision, operations }]);
  const open = (kind: 'edit' | 'delete', item: CustomCommandDefinition | null) =>
    setDialog({
      kind,
      item: structuredClone(item),
      types: structuredClone(types),
      revision: auxiliary!.revision,
    });
  return (
    <div className="settings-sections">
      <SettingsSection
        title="登録済みコマンド"
        hint="種類と固定設定を保存します。保存したコマンドをショートカット、ジェスチャー、トレイに割り当てられます。"
        {...settingAnchor('custom-commands', 'definitions')}
      >
        {!supported && (
          <p role="status">
            この保存版には対応していません。自動移行は行いません。JSON編集でversion
            2の一覧を保存して作り直してください。
          </p>
        )}
        {!types.length && (
          <p role="status">
            利用できる種類がありません。種類を提供するAppletを導入すると追加できます。
          </p>
        )}
        <SettingsListTable
          definition={list}
          maxItems={256}
          canAdd={types.length > 0}
          entries={items.map((item) => ({
            ...item,
            typeTitle:
              (types.find((t) => t.id === item.typeId)?.title ?? item.typeId) +
              ' / ' +
              (item.owner.kind === 'host' ? 'AppDock' : item.owner.id),
            status:
              auxiliary?.summaries.find((s) => s.id === item.id)?.unavailableReason ??
              '利用できます',
            publication: item.automation ? 'ON' : 'OFF',
          }))}
          busy={busy || !supported || !auxiliary}
          onAdd={() => open('edit', null)}
          onEdit={(i) => open('edit', items[i])}
          onDelete={(i) => open('delete', items[i])}
          onOrder={() =>
            setDialog({
              kind: 'order',
              items: structuredClone(items),
              revision: auxiliary!.revision,
            })
          }
          onToggle={(i) => {
            setError('');
            void update([
              {
                op: 'update',
                id: items[i].id,
                changes: { enabled: !items[i].enabled },
                expectedTypeRevision: types.find((t) => t.id === items[i].typeId)?.typeRevision,
              },
            ]).catch((e) => setError(String(e)));
          }}
        />
        {error && <p role="alert">{error}</p>}
      </SettingsSection>
      {dialog?.kind === 'edit' && (
        <CustomCommandDialog
          original={dialog.item}
          types={dialog.types}
          invoke={invoke}
          onClose={() => setDialog(null)}
          onApply={(operation) => update([operation], dialog.revision)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <SettingsDialog
          title="カスタムコマンドを削除"
          description="割り当ては保持されます。このIDのコマンドが戻るまで実行できません。"
          applyLabel="削除"
          onClose={() => setDialog(null)}
          onApply={() => update([{ op: 'remove', id: dialog.item!.id }], dialog.revision)}
        >
          <p>{dialog.item!.title}</p>
        </SettingsDialog>
      )}
      {dialog?.kind === 'order' && (
        <SettingsOrderDialog
          title="コマンドの表示順"
          listLabel="カスタムコマンド"
          items={dialog.items}
          onClose={() => setDialog(null)}
          onApply={(ids) => update([{ op: 'reorder', ids }], dialog.revision)}
        />
      )}
    </div>
  );
}
function CustomCommandDialog({
  original,
  types,
  onApply,
  onClose,
  invoke,
}: {
  original: CustomCommandDefinition | null;
  types: CustomCommandDescriptor[];
  onApply(operation: unknown): Promise<unknown>;
  onClose(): void;
  invoke: Invoke;
}) {
  const defaults = (id: string) =>
    id === 'appdock.process.start'
      ? { ...defaultProcessLaunch() }
      : Object.fromEntries(
          (types.find((t) => t.id === id)?.fields ?? [])
            .filter((f) => f.default !== undefined)
            .map((f) => [f.key, f.default]),
        );
  const [id] = useState(() => original?.id ?? crypto.randomUUID());
  const [typeId, setTypeId] = useState(original?.typeId ?? types[0]?.id ?? '');
  const [title, setTitle] = useState(original?.title ?? '');
  const [description, setDescription] = useState(original?.description ?? '');
  const [config, setConfig] = useState<Record<string, unknown>>(
    () => original?.config ?? defaults(typeId),
  );
  const [json, setJson] = useState(() => JSON.stringify(config, null, 2));
  const [jsonMode, setJsonMode] = useState(false);
  const [automation, setAutomation] = useState(original?.automation ?? false);
  const [enabled, setEnabled] = useState(original?.enabled ?? true);
  const [migrate, setMigrate] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({});
  const type = types.find((t) => t.id === typeId);
  const oldVersion = !!original && original.configVersion !== type?.configVersion;
  const editableConfig = !!type && (!oldVersion || migrate);
  const jsonOnly = !type?.fields?.length && typeId !== 'appdock.process.start';
  return (
    <SettingsDialog
      title={original ? 'カスタムコマンドの編集' : 'カスタムコマンドの追加'}
      onClose={onClose}
      valid={
        !!title.trim() &&
        (!!original || !!type) &&
        (jsonMode || !Object.values(invalidFields).some(Boolean))
      }
      onApply={async () => {
        const nextConfig = editableConfig
          ? jsonMode || jsonOnly
            ? JSON.parse(json)
            : config
          : original!.config;
        const value = {
          title: title.trim(),
          description,
          configVersion: migrate || !original ? type!.configVersion : original.configVersion,
          config: nextConfig,
          enabled,
          automation,
        };
        if (!original) {
          if (typeId === 'appdock.mcp.call')
            await invoke('mcpTool', [nextConfig.serverId, nextConfig.toolName]);
          return onApply({
            op: 'add',
            expectedTypeRevision: type!.typeRevision,
            item: { id, typeId, ...value },
          });
        }
        const changes = Object.fromEntries(
          Object.entries(value).filter(
            ([key, v]) =>
              JSON.stringify(v) !== JSON.stringify(original[key as keyof typeof original]),
          ),
        );
        if ('configVersion' in changes) changes.config = nextConfig;
        if (!Object.keys(changes).length) return;
        if (
          typeId === 'appdock.mcp.call' &&
          ('config' in changes || changes.enabled === true || changes.automation === true)
        )
          await invoke('mcpTool', [nextConfig.serverId, nextConfig.toolName]);
        return onApply({ op: 'update', id, changes, expectedTypeRevision: type?.typeRevision });
      }}
    >
      {(ready, setError) => (
        <>
          <SettingsField title="種類">
            <select
              aria-label="種類"
              value={typeId}
              disabled={!!original}
              onChange={(e) => {
                const value = e.target.value;
                setTypeId(value);
                const next = defaults(value);
                setConfig(next);
                setJson(JSON.stringify(next, null, 2));
                setAutomation(false);
                setInvalidFields({});
              }}
            >
              {!type && <option value={typeId}>{typeId || '種類がありません'}</option>}
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </SettingsField>
          {type?.description && <SettingsHint>{type.description}</SettingsHint>}
          <SettingsField title="名前">
            <SettingsInput
              aria-label="名前"
              data-initial-focus
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
            />
          </SettingsField>
          <SettingsField
            title="説明"
            hint="公開すると、MCP・Appletのコマンド一覧にも表示されます。"
          >
            <SettingsTextarea
              aria-label="説明"
              value={description}
              maxLength={1000}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          </SettingsField>
          <SettingsChoice
            label="有効"
            checked={enabled}
            disabled={!type && !enabled}
            onChange={setEnabled}
          />
          <SettingsChoice
            label="MCP・Appletの共通APIへ公開"
            checked={automation}
            disabled={!type?.automation && !automation}
            onChange={setAutomation}
          />
          {!type?.automation && <p className="muted">この種類は外部公開を許可していません。</p>}
          {oldVersion && type && (
            <SettingsChoice
              label={`現在の設定形式（${type.configVersion}）へ明示的に更新する`}
              checked={migrate}
              onChange={(checked) => {
                setMigrate(checked);
                const next = checked ? defaults(typeId) : original!.config;
                setConfig(next);
                setJson(JSON.stringify(next, null, 2));
                setInvalidFields({});
              }}
            />
          )}
          {!jsonOnly && editableConfig && (
            <SettingsChoice
              label="設定をJSONで編集"
              checked={jsonMode}
              onChange={(checked) => {
                if (checked) setJson(JSON.stringify(config, null, 2));
                else {
                  try {
                    const parsed = JSON.parse(json);
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
                    setConfig(parsed);
                  } catch {
                    return;
                  }
                }
                setInvalidFields({});
                setJsonMode(checked);
              }}
            />
          )}
          {!editableConfig || jsonMode || jsonOnly ? (
            <SettingsField title="固定設定（JSON）">
              <SettingsTextarea
                aria-label="固定設定（JSON）"
                value={json}
                readOnly={!editableConfig}
                rows={10}
                onChange={(e) => setJson(e.target.value)}
              />
            </SettingsField>
          ) : typeId === 'appdock.input.sendKeys' ? (
            <ShortcutCaptureField
              mode="send"
              label="送信キー"
              value={typeof config.keys === 'string' ? config.keys : ''}
              onChange={(keys) => setConfig({ ...config, keys })}
              recordingReady={ready}
              setError={setError}
            />
          ) : typeId === 'appdock.process.start' ? (
            <ProcessCommandFields
              config={config}
              onChange={setConfig}
              onValidity={(valid) =>
                setInvalidFields((previous) => ({ ...previous, process: !valid }))
              }
            />
          ) : typeId === 'appdock.mcp.call' ? (
            <McpCommandFields
              config={config}
              onChange={setConfig}
              invoke={invoke}
              onValidity={(valid) =>
                setInvalidFields((previous) => ({ ...previous, mcpArguments: !valid }))
              }
            />
          ) : (
            type!.fields!.map((field) => (
              <SettingsField key={field.key} title={field.title}>
                {field.type === 'boolean' ? (
                  <input
                    aria-label={field.title}
                    type="checkbox"
                    checked={config[field.key] === true}
                    onChange={(e) => setConfig({ ...config, [field.key]: e.target.checked })}
                  />
                ) : field.type === 'select' ? (
                  <select
                    aria-label={field.title}
                    value={String(config[field.key] ?? '')}
                    onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                  >
                    <option value="">選択してください</option>
                    {field.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'json' ? (
                  <JsonField
                    label={field.title}
                    value={config[field.key]}
                    onValidity={(valid) =>
                      setInvalidFields((previous) => ({ ...previous, [field.key]: !valid }))
                    }
                    onChange={(value) => setConfig({ ...config, [field.key]: value })}
                  />
                ) : (
                  <SettingsInput
                    aria-label={field.title}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={String(config[field.key] ?? '')}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        [field.key]:
                          field.type === 'number' && e.target.value.trim()
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                )}
              </SettingsField>
            ))
          )}
          {type && (
            <details>
              <summary>設定Schema</summary>
              <pre>{JSON.stringify(type.configSchema, null, 2)}</pre>
            </details>
          )}
        </>
      )}
    </SettingsDialog>
  );
}
function JsonField({
  label,
  value,
  onChange,
  onValidity,
}: {
  label: string;
  value: unknown;
  onChange(value: unknown): void;
  onValidity(valid: boolean): void;
}) {
  const [text, setText] = useState(JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState('');
  return (
    <>
      <SettingsTextarea
        aria-label={label}
        value={text}
        rows={5}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError('');
            onValidity(true);
          } catch {
            setError('JSONを修正してください。');
            onValidity(false);
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
    </>
  );
}
