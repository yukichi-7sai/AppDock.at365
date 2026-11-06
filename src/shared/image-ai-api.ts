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
  'ai.image.jobs.get': {
    callers: ['applet'],
    permissions: ['read'],
    name: 'appdock_image_get_job',
    description:
      '自分の画像生成ジョブの状態・画像ID・保持期限を取得します。画像データは返しません。',
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
} as const;
