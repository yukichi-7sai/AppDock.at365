// Keep the transport schema independent of setting owners, fields and operation kinds.
const text = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
const pagination = { cursor: text(2048), limit: { type: 'integer', minimum: 1, maximum: 100 } };
const targetId = text(400);
const schema = (properties: Record<string, any>, required: string[] = []) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: false,
});
const read = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const entry = (name: string, description: string, inputSchema: ReturnType<typeof schema>) =>
  ({
    callers: ['mcp'],
    permissions: ['read'],
    name,
    description,
    inputSchema,
    annotations: read,
  }) as const;

export const settingsOperations = {
  'settings.targets.list': entry(
    'appdock_settings_list_targets',
    '公開された設定対象を探します。設定名やAppletが増えても、この固定入口から取得できます。設定値や秘密情報は返しません。',
    schema({ query: { type: 'string', maxLength: 200 }, ownerId: text(200), ...pagination }),
  ),
  'settings.schema.get': entry(
    'appdock_settings_get_schema',
    '対象のフィールド・型・制約・対応操作とschemaRevisionを取得します。変更前に現在のSchemaを確認してください。',
    schema({ targetId, ...pagination }, ['targetId']),
  ),
  'settings.values.get': entry(
    'appdock_settings_get_values',
    '対象の実効値・既定値・上書き状態とrevisionを取得します。keysで必要なフィールドを絞れます。公開されていないキーは取得できません。',
    schema(
      {
        targetId,
        keys: { type: 'array', minItems: 1, maxItems: 128, uniqueItems: true, items: text(100) },
      },
      ['targetId'],
    ),
  ),
  'settings.items.list': entry(
    'appdock_settings_list_items',
    '一覧対象の行とitemRefを取得する固定入口です。対応する一覧対象がない場合は取得できません。通常フィールドにはvalues.getを使います。',
    schema({ targetId, ...pagination }, ['targetId']),
  ),
  'settings.options.list': entry(
    'appdock_settings_list_options',
    '設定フィールドの選択候補を取得します。候補取得だけで接続・起動や設定変更は行いません。',
    schema(
      {
        targetId,
        key: text(100),
        itemRef: text(500),
        draftValues: { type: 'object' },
        ...pagination,
      },
      ['targetId', 'key'],
    ),
  ),
  'settings.apply': {
    callers: ['mcp'],
    permissions: ['read', 'write'],
    name: 'appdock_settings_apply',
    description:
      '対象の最新Schemaに従って設定を検証・変更します。expectedRevision・expectedSchemaRevision・一意なrequestIdが必要です。dryRun:trueは保存しません。対応操作はSchemaのデータとして取得します。設定変更許可を使い、コマンド実行許可は不要です。',
    inputSchema: schema(
      {
        targetId,
        operations: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'object' } },
        expectedRevision: text(256),
        expectedSchemaRevision: text(128),
        requestId: text(100),
        dryRun: { type: 'boolean' },
      },
      ['targetId', 'operations', 'expectedRevision', 'expectedSchemaRevision', 'requestId'],
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
} as const;
export type SettingsMethod = keyof typeof settingsOperations;
