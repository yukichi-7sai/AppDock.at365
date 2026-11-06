const jobSchema = {
  type: 'object',
  properties: { jobId: { type: 'string', minLength: 1 } },
  required: ['jobId'],
  additionalProperties: false,
} as const;
const localRead = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
export const imageAiOperations = {
  'ai.image.generateAndRegister': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'write', 'execute', 'useImageAi'],
    name: 'appdock_image_generate_and_register',
    description:
      '登録済み画像生成サーバーで画像を生成し、画像ライブラリーに保存します。入力を接続先へ送信し、課金される場合があります。受付後jobIdを返します。jobs.getのcompletedが保存完了です。バイナリは返さず、保存した画像のref.fileを返します。',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 100 },
        connectionId: { type: 'string', minLength: 1 },
        input: { type: 'string', minLength: 1, description: '生成・編集する画像のプロンプト。' },
        referenceImages: {
          type: 'array',
          description:
            '今回だけ参照する画像ライブラリーの画像。配列の順に送信します。省略または空配列で文章から生成します。',
          maxItems: 16,
          items: {
            type: 'object',
            properties: { file: { type: 'string', minLength: 1 } },
            required: ['file'],
            additionalProperties: false,
          },
        },
        options: {
          type: 'object',
          additionalProperties: false,
          properties: {
            size: { type: 'string' },
            count: { type: 'integer', minimum: 1, maximum: 10 },
            format: { type: 'string', enum: ['png', 'jpeg', 'webp'] },
            providerOptions: {
              type: 'object',
              additionalProperties: false,
              properties: {
                quality: { type: 'string' },
                background: { type: 'string', enum: ['auto', 'opaque', 'transparent'] },
                compression: { type: 'integer', minimum: 0, maximum: 100 },
              },
            },
          },
        },
        destination: {
          type: 'object',
          additionalProperties: false,
          required: ['folder'],
          properties: {
            folder: { type: 'string', description: '既存の実フォルダー。ルートは空文字。' },
            name: {
              type: 'string',
              minLength: 1,
              description: '拡張子を除く保存名。同名は連番で保存します。省略時は本体が命名します。',
            },
            group: { type: 'string', minLength: 1, description: '任意の既存グループID。' },
          },
        },
      },
      required: ['requestId', 'input', 'destination'],
      additionalProperties: false,
    },
    annotations: { ...localRead, readOnlyHint: false, idempotentHint: false, openWorldHint: true },
  },
  'ai.image.jobs.retrySave': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'write', 'execute', 'useImageAi'],
    name: 'appdock_image_retry_save',
    description:
      'unsavedの画像ジョブで未完了の保存・グループ登録だけを再試行します。再生成せず、保存済みファイルも複製しません。保持期限後は再保存できません。',
    inputSchema: jobSchema,
    annotations: { ...localRead, readOnlyHint: false },
  },
  'ai.image.connections.list': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'useImageAi'],
    name: 'appdock_image_list_connections',
    description:
      '登録した画像生成プリセットのID・名前・対応機能を取得します。認証情報やプロンプトは返しません。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: localRead,
  },
  'ai.image.jobs.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_image_get_job',
    description:
      '自分の画像生成ジョブの状態・保存済みref・未保存結果の保持期限を取得します。画像データは返しません。ref.fileはライブラリー内の相対パスで、移動・改名時に変わります。',
    inputSchema: jobSchema,
    annotations: localRead,
  },
  'ai.image.jobs.cancel': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'execute'],
    name: 'appdock_image_cancel_job',
    description: '自分の画像生成ジョブを取り消します。サーバー内の処理や課金の停止は保証しません。',
    inputSchema: jobSchema,
    annotations: { ...localRead, readOnlyHint: false },
  },
} as const;
