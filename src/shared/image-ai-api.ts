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
  'ai.image.connections.list': {
    callers: ['applet'],
    permissions: ['read', 'useImageAi'],
    name: 'appdock_image_list_connections',
    description:
      '登録した画像生成プリセットのID・名前・対応機能を取得します。認証情報やプロンプトは返しません。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: localRead,
  },
  'ai.image.generate': {
    callers: ['applet'],
    permissions: ['read', 'execute', 'useImageAi'],
    name: 'appdock_image_generate',
    description:
      '登録したプリセットサーバーで画像を生成します。受付後jobIdを返します。接続先へプロンプトを送信し、課金される場合があります。',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 100 },
        connectionId: { type: 'string', minLength: 1 },
        prompt: { type: 'string' },
        model: { type: 'string', minLength: 1 },
        options: {
          type: 'object',
          properties: {
            size: { type: 'string' },
            count: { type: 'integer', minimum: 1, maximum: 10 },
            format: { enum: ['png', 'jpeg', 'webp'] },
            providerOptions: {
              type: 'object',
              properties: {
                quality: { enum: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] },
                background: { enum: ['auto', 'opaque', 'transparent'] },
                compression: { type: 'integer', minimum: 0, maximum: 100 },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      required: ['requestId'],
      additionalProperties: false,
    },
    annotations: { ...localRead, readOnlyHint: false, idempotentHint: false, openWorldHint: true },
  },
  'ai.image.jobs.get': {
    callers: ['applet'],
    permissions: ['read'],
    name: 'appdock_image_get_job',
    description:
      '自分の画像生成ジョブの状態・画像ID・保持期限を取得します。画像データはresults.readで取得します。',
    inputSchema: jobSchema,
    annotations: localRead,
  },
  'ai.image.jobs.cancel': {
    callers: ['applet'],
    permissions: ['read', 'execute'],
    name: 'appdock_image_cancel_job',
    description: '自分の画像生成ジョブを取り消します。サーバー内の処理や課金の停止は保証しません。',
    inputSchema: jobSchema,
    annotations: { ...localRead, readOnlyHint: false },
  },
  'ai.image.results.read': {
    callers: ['applet'],
    permissions: ['read', 'useImageAi'],
    name: 'appdock_image_read_result',
    description:
      '自分の生成画像を256KiB以下のBase64分割データとして取得します。nextOffsetを渡しdoneまで取得します。取得で再生成はしません。',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', minLength: 1 },
        imageId: { type: 'string', minLength: 1 },
        offset: { type: 'integer', minimum: 0 },
      },
      required: ['jobId', 'imageId'],
      additionalProperties: false,
    },
    annotations: localRead,
  },
} as const;
