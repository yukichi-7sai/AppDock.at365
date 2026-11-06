import { aiOutputTokenLimits, aiTimeoutLimits } from './ai';

const jobSchema = {
  type: 'object',
  properties: { jobId: { type: 'string', minLength: 1, maxLength: 100 } },
  required: ['jobId'],
  additionalProperties: false,
} as const;
const localRead = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
export const aiOperations = {
  'ai.text.generate': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'execute', 'useAi'],
    name: 'appdock_ai_generate_text',
    description:
      '登録済みサーバーのモデルとプロンプトで文章を生成します。サーバーのalwaysPromptは毎回追加し、additionalPrompt省略時はdefaultPromptを使います。接続先へ入力を送信し、課金される場合があります。受付後jobIdを返し、完了と結果はai.jobs.getで取得します。',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 100 },
        connectionId: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          description: '登録済み文章生成サーバーのID。省略時は既定のサーバーを使用します。',
        },
        additionalPrompt: {
          type: 'string',
          maxLength: 2048,
          description:
            '省略時はサーバーのdefaultPromptを使用。空文字・空白だけを明示すると既定を使わず、alwaysPromptだけを加えます。',
        },
        input: { type: 'string', maxLength: 8192 },
        timeoutMs: {
          type: 'integer',
          minimum: aiTimeoutLimits.minimumSeconds * 1000,
          maximum: aiTimeoutLimits.maximumSeconds * 1000,
          description: '省略時は接続に設定した既定の待ち時間を使用します。',
        },
        maxOutputTokens: {
          type: 'integer',
          minimum: aiOutputTokenLimits.minimum,
          maximum: aiOutputTokenLimits.maximum,
          description: '省略時は接続に設定した既定の出力トークン上限を使用します。',
        },
      },
      required: ['requestId'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  'ai.jobs.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_ai_get_job',
    description:
      '自分のAIジョブの状態と生成結果を取得します。本文はメモリー上で短期間保持され、期限後はresultExpiredを返します。',
    inputSchema: jobSchema,
    annotations: localRead,
  },
  'ai.jobs.cancel': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'execute'],
    name: 'appdock_ai_cancel_job',
    description:
      '自分のAIジョブを取り消します。サーバー内の計算・課金まで停止できたことは保証しません。',
    inputSchema: jobSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'ai.models.list': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'useAi'],
    name: 'appdock_ai_list_models',
    description:
      '許可した接続先のモデルID一覧を取得します。一覧非対応の場合はモデルIDを手入力できます。モデルの取得やロードは開始しません。',
    inputSchema: {
      type: 'object',
      properties: { connectionId: { type: 'string', minLength: 1, maxLength: 100 } },
      additionalProperties: false,
    },
    annotations: { ...localRead, openWorldHint: true },
  },
} as const;
