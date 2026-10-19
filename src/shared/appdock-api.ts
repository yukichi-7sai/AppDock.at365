import { mcpClientOperations } from './mcp-client';
import { aiOperations } from './ai-api';
import { customCommandOperations } from './custom-commands';
import { processLaunchOperations } from './process-launch';
// One operation catalog drives MCP tools and both Applet SDK entry points.
export const appDockOperations = {
  ...aiOperations,
  ...mcpClientOperations,
  ...customCommandOperations,
  ...processLaunchOperations,
  'tts.speak': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'execute', 'useTts'],
    name: 'appdock_tts_speak',
    description:
      'テキストから音声を生成し、このPCで順番に再生します。受付後jobIdを返します。完了はtts.jobs.getで確認してください。同じrequestIdの再送は保持期間内だけ重複を防ぎます。',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
        },
        voice: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
        },
        speed: {
          type: 'number',
          minimum: 0.25,
          maximum: 4,
        },
        requestId: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
      },
      required: ['text', 'requestId'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  'tts.voices.list': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'useTts'],
    name: 'appdock_tts_list_voices',
    description:
      '設定されたTTSサーバーまたは手動設定からボイスID・表示名の一覧を取得します。一覧非対応と空一覧を区別します。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  'tts.jobs.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_tts_get_job',
    description: '自分の読み上げジョブの状態を取得します。本文・APIキー・音声は返しません。',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'tts.stop': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'execute'],
    name: 'appdock_tts_stop',
    description:
      '自分の読み上げジョブを停止します。サーバー内の生成処理まで停止できたことは保証しません。',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  'ui.ribbon.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_get_ribbon_view',
    description:
      'リボンの描画モデル・選択状態・操作IDを取得します。編集用ribbon.getとは独立したepoch/revisionです。',
    inputSchema: {
      type: 'object',
      properties: {
        contextId: { type: 'string', enum: ['primary'] },
        schemaVersion: { type: 'integer', enum: [1, 2] },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'ui.assets.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_get_ui_asset',
    description: '描画モデルで公開されたassetIdからPNG/WebPのdata URLを取得します。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', maxLength: 64 } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'ui.actions.invoke': {
    callers: ['mcp', 'applet'],
    permissions: ['execute'],
    name: 'appdock_invoke_ui_action',
    description:
      '描画モデルのactionIdを実行します。epochと一意なrequestIdが必要です。同じIDの再送は512件の受付記録内で重複実行しません。',
    inputSchema: {
      type: 'object',
      properties: {
        contextId: { type: 'string', enum: ['primary'] },
        epoch: { type: 'string', maxLength: 100 },
        requestId: { type: 'string', minLength: 1, maxLength: 100 },
        actionId: { type: 'string', maxLength: 250 },
      },
      required: ['epoch', 'requestId', 'actionId'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  'input.sendKeys': {
    callers: ['applet'],
    permissions: ['sendInput'],
    name: 'appdock_send_keys',
    description: 'アクティブなウィンドウへキーを送信します。',
    inputSchema: {
      type: 'object',
      properties: { keys: { type: 'string', minLength: 1, maxLength: 100 } },
      required: ['keys'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  'input.appCommand': {
    callers: ['applet'],
    permissions: ['sendInput'],
    name: 'appdock_send_app_command',
    description: 'アクティブなウィンドウへ操作メッセージを送信します。',
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['back', 'forward', 'reload'] } },
      required: ['action'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  'system.getInfo': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_get_info',
    description: 'AppDockの版・接続先・対応APIを取得します。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'applets.list': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_list_applets',
    description: 'Appletの基本情報と稼働状態を取得します。設定や認証情報は含みません。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'settings.getSchema': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_get_settings_schema',
    description: '公開された設定の型・適用タイミングを取得します。appletId省略時は本体設定です。',
    inputSchema: {
      type: 'object',
      properties: {
        appletId: {
          type: 'string',
          maxLength: 200,
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'settings.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_get_settings',
    description:
      '公開された設定と変更番号を取得します。appletId省略時は本体設定です。変更前に呼んでください。',
    inputSchema: {
      type: 'object',
      properties: {
        appletId: {
          type: 'string',
          maxLength: 200,
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'applets.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_get_applet',
    description:
      '指定したAppletの説明・状態・エラー概要・外部公開コマンドを取得します。認証情報や全設定は含みません。',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          maxLength: 200,
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'commands.list': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_list_commands',
    description:
      '外部公開を許可したコマンドと現在の実行可否を取得します。実行前に確認してください。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'commands.execute': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_execute_command',
    description:
      'commands.listのinputSchemaに従いidとargsで実行します。設定変更は設定変更許可、Appletの有効・無効・再起動はApplet管理許可も必要です。settings.updateのargsにはchangesとexpectedRevision、任意のdryRunを指定します。別途コマンド実行許可が必要です。受付または処理応答を返し、操作先の効果は保証しません。失敗や応答消失時は状態確認前に再実行しないでください。',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          maxLength: 200,
        },
        args: {
          type: 'object',
          description: 'commands.listで取得したinputSchemaに従う引数',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  'shortcuts.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_get_shortcuts',
    description:
      'ショートカットの割当・条件・実行順・revision・割当可能な公開コマンド・入力フックの適用状態を取得します。Win修飾キーと任意のblockOriginalInput（globalの元入力を止める、省略時true）に対応します。変更はappdock.shortcuts.updateへoperations/expectedRevision/任意dryRunを渡してください。設定変更・コマンド実行・ショートカット編集の許可が必要です。同じキーの複数行は条件を満たす順に実行します。入力適用は非同期なので保存後に再取得してください。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'gestures.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_get_gestures',
    description:
      'マウスジェスチャーの割当・条件・実行順・動作設定・revision・割当可能な公開コマンドを取得します。変更はappdock.gestures.updateへoperations/expectedRevision/任意dryRunを渡します。設定変更・コマンド実行・ジェスチャー編集の許可が必要です。右ボタンを押しながら移動/クリック/ホイール/キーで操作します。保存成功は実入力の成功を保証しません。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'ribbon.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_get_ribbon',
    description:
      'リボンの配置・表示・項目・保持中の未導入ID・revisionを取得します。変更はappdock.ribbon.updateのoperationsとexpectedRevision、任意dryRunを指定します。コマンド実行・設定変更・リボン編集の許可が必要です。項目IDはコマンドIDと異なります。無効Appletの配置を保持し、編集だけで有効化やページ表示はしません。resetは未導入項目の配置も含め初期状態に戻します。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'tray.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read'],
    name: 'appdock_get_tray',
    description:
      'タスクトレイのメニュー・シングル/ダブルクリック割当・割当可能コマンド・revisionを取得します。編集はappdock.tray.updateへoperations/expectedRevision/任意dryRunを指定します。実行・設定変更・タスクトレイ編集の許可が必要です。新規割当は公開済み引数なしコマンドだけ。メニューの設定/終了は末尾固定。グループは1段、ungroupで中身を保持して解除できます。doubleClickCommandはnullで解除でき、シングルは1コマンド必須です。編集だけでコマンドを実行しません。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
} as const;
export type ApiCaller = 'mcp' | 'applet';
export function operationsFor(caller: ApiCaller) {
  return Object.entries(appDockOperations).filter(([, d]) =>
    (d.callers as readonly string[]).includes(caller),
  );
}
export type AppDockMethod = keyof typeof appDockOperations;
export const appDockMethods = Object.keys(appDockOperations) as AppDockMethod[];
export const appletApiPermissionLabels = {
  useMcp: 'MCP接続先の利用',
  manageCustomCommands: 'カスタムコマンド定義の閲覧・編集',
  manageMcpServers: 'MCP接続先の管理',
  useAi: 'AIサーバーへの送信・文章生成',
  useTts: 'TTSサーバーへの送信・読み上げ',
  sendInput: 'Windowsへのキー・操作メッセージ送信',
  runProcesses: 'コマンド・プロセスの起動',
  read: '情報の取得',
  execute: 'コマンドの実行',
  write: '設定の変更',
  manageApplets: 'Appletの有効・無効・再起動',
  editShortcuts: 'ショートカットの編集',
  editGestures: 'マウスジェスチャーの編集',
  editRibbon: 'リボンの編集',
  editTray: 'タスクトレイの編集',
} as const;
export type AppletApiPermission = keyof typeof appletApiPermissionLabels;
export type AppletApiPermissions = Partial<Record<AppletApiPermission, boolean>>;
export type AppDockReply =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string } };
export class AppDockApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type AppDockResult<M extends AppDockMethod> = M extends 'ai.text.generate'
  ? import('./ai').AiJob & { completion: 'accepted' }
  : M extends 'ai.jobs.get' | 'ai.jobs.cancel'
    ? import('./ai').AiJob
    : M extends 'ai.models.list'
      ? { models: import('./ai').AiModel[] }
      : M extends 'tts.speak'
        ? import('./tts').TtsSpeakResult
        : M extends 'tts.voices.list'
          ? import('./tts').TtsVoicesResult
          : M extends 'tts.jobs.get' | 'tts.stop'
            ? import('./tts').TtsJob
            : Record<string, unknown>;
export interface AppDockClient {
  call<M extends AppDockMethod>(
    method: M,
    params?: M extends 'ai.text.generate'
      ? import('./ai').AiGenerateInput
      : M extends 'ai.jobs.get' | 'ai.jobs.cancel'
        ? { jobId: string }
        : M extends 'tts.speak'
          ? import('./tts').TtsSpeakInput
          : M extends 'tts.jobs.get' | 'tts.stop'
            ? { jobId: string }
            : Record<string, unknown>,
  ): Promise<AppDockResult<M>>;
}
export function createAppDockClient(
  request: (method: string, params: unknown) => Promise<AppDockReply>,
): AppDockClient {
  const call = async (method: AppDockMethod, params: Record<string, unknown> = {}) => {
    const reply = await request('host.appdock.call', { method, params });
    if (!reply.ok) throw new AppDockApiError(reply.error.code, reply.error.message);
    return reply.value;
  };
  return { call: call as AppDockClient['call'] };
}
