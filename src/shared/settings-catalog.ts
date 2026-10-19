import { collectionRecord } from './page-collections';
import { shellRegions } from './shell';
import { notificationCatalog, notificationSettingKey } from './notification-types';
import type { ExtensionSnapshot, Settings, SettingDefinition } from './contracts';
import { createDefaultSettings, parseSettings } from './settings-schema';
import { validateSettingValue, validateAppletSettings } from './setting-definitions';
import { orderApplets } from './applet-order';
import { getKeybindings } from './keybindings';
import { appletApiPermissionLabels } from './appdock-api';

export const settingsTextLimit = 1024 * 1024;
export type SettingsPath = string[];
export interface SettingsItem {
  id: string;
  pageId: string;
  key: string;
  title: string;
  description: string;
  definition?: SettingDefinition;
  keywords?: string[];
  unavailableReason?: string;
}
export interface SettingsPageDefinition {
  id: string;
  title: string;
  owner?: string;
  kind: 'host' | 'applet';
  collection?: import('./page-collections').CollectionBinding;
  json: boolean;
  items: SettingsItem[];
  unavailableReason?: string;
}
export const settingsItemId = (pageId: string, key: string) =>
  `${encodeURIComponent(pageId)}/${encodeURIComponent(key)}`;
export const appletSettingsPageId = (id: string) => `applet:${id}`;
export const hostSettingsPages = [
  ['appearance', '表示'],
  ['general', '一般'],
  ['notifications', '通知'],
  ['tts', '読み上げ'],
  ['ai', 'AI'],
  ['custom-commands', 'カスタムコマンド'],
  ['mcp-client', 'MCP接続先'],
  ['ribbon', 'リボン'],
  ['tray', 'タスクトレイ'],
  ['shortcuts', 'ショートカット'],
  ['gestures', 'マウスジェスチャー'],
  ['web-accounts', 'Webアカウント'],
  ['permissions', '操作の許可'],
  ['codex', 'MCP・Codex連携'],
  ['profile', 'プロフィール'],
  ['about', 'バージョン情報・更新'],
] as const;
const hostItems: Record<string, [string, string, string?][]> = {
  'mcp-client': [
    ['connections', 'MCP接続先', 'サーバー stdio HTTP 接続 設定 認証 ツール ジョブ 取消'],
  ],
  'custom-commands': [
    [
      'definitions',
      'カスタムコマンド',
      '種類を選んで固定設定を保存し、ショートカット・ジェスチャー・MCPから実行します。',
    ],
  ],
  ai: [
    ['commonPrompt', '共通プロンプト', '各AppletとMCPからの追加プロンプトに組み合わせる基本方針'],
    ['defaultConnectionId', '既定のAI接続', '呼出し側が接続を省略したときに使用'],
    [
      'connections',
      'AI接続設定',
      'Ollama LM Studio llama.cpp OpenAI サーバー URL モデル 認証 APIキー 互換性 トークン 上限 待ち時間 タイムアウト',
    ],
    ['preview', '文章生成の試験', 'モデル 追加プロンプト 入力 生成結果 停止'],
  ],
  appearance: [
    ['theme', 'テーマ', 'ワークスペースの配色を選びます。'],
    ...shellRegions.map(({ id, title }): [string, string, string] => [
      'shellProviders.' + id,
      title + 'のShell',
      '領域ごとにShellを指定します。利用できない場合はDefault Shellを使います。無効なAppletの割り当ても保持します。',
    ]),
  ],
  general: [
    [
      'soundEnabled',
      '音の再生',
      'AppDockの読み上げ・通知音・試聴を再生します。OFFにすると再生中の音を止め、再生待ちとOFF中に届いた音を破棄します。',
    ],
    [
      'permissions',
      'Applet・MCPからの操作',
      '操作ごとの許可は、専用の画面でまとめて設定できます。',
    ],
    [
      'startAtLogon',
      'スタートアップに登録',
      'Windowsへのサインイン時に、この場所のAppDockを起動します。変更は保存時に反映します。',
    ],
    [
      'runAsAdministrator',
      '常に管理者として起動',
      '次の起動から管理者権限を使います。管理者でのスタートアップ登録・変更にはUAC確認が必要です。登録後のサインイン時には確認を出しません。手動起動ではUAC確認が表示されます。',
    ],
    ['launch', '現在の起動状態', '状態を確認 管理者として再起動'],
    ['closeToTray', '閉じるとトレイに収納', 'ウィンドウを閉じた後もAppletを動かします。'],
    [
      'hardwareAcceleration',
      'ハードウェアアクセラレーション',
      'GPUを使ってAppDockの画面を描画します。変更は保存後、AppDockを完全終了して起動し直すと反映されます。',
    ],
    [
      'startMinimized',
      '起動時にトレイに収納',
      '次の起動時はウィンドウを表示せず、トレイに常駐します。',
    ],
    ['settingsFile', '設定ファイル', '状態 再起動 バックアップで復元 保存先を開く'],
  ],
  tts: [
    ['baseUrl', 'APIのURL', 'OpenAI互換TTSサーバーのベースURL'],
    ['apiKey', 'APIキー', 'このPCに暗号化保存。空欄で認証なし'],
    ['model', 'TTSモデル', 'モデル一覧を更新 サーバーから取得 手動入力'],
    ['defaultVoice', '既定のボイス'],
    ['defaultSpeed', '読み上げ速度'],
    ['speedMode', '速度の適用先', 'AppDockの再生速度 サーバーの生成速度'],
    ['voicesSource', 'ボイス一覧の取得方式'],
    ['voicesPath', 'ボイス一覧のパス'],
    ['manualVoices', '手動ボイス一覧'],
    ['preview', '試聴と停止', 'テキストを入力して読み上げ'],
  ],
  notifications: [
    ['speech.voice', '通知の声', '共通の読み上げ設定を継承 または上書き'],
    ['speech.speed', '通知の読み上げ速度', '共通の読み上げ設定を継承 または上書き'],
    ['speech.preview', '通知の読み上げを試聴', '試聴と停止'],
  ],
  ribbon: [
    [
      'ribbon',
      'リボン',
      '表示 配置 並べ替え 上部 下部 セパレーター グループ 展開 折りたたみ バッジ',
    ],
  ],
  tray: [
    ['trayClickCommand', 'トレイクリックのコマンド', 'シングルクリック'],
    ['trayDoubleClickCommand', 'トレイダブルクリックのコマンド', 'ダブルクリック'],
    ['trayMenu', 'コンテキストメニュー', '追加 削除 グループ 区切り線 表示イメージ'],
  ],
  shortcuts: [
    [
      'keybindings',
      'ショートカットキー',
      'キー 割り当て コマンド 条件 実行順 入力の適用エラー Win ブロック',
    ],
  ],
  gestures: [
    ['gestures', 'マウスジェスチャー', '割り当て 条件 実行順'],
    ['enabled', 'マウスジェスチャーを有効にする'],
    ['options', '動作設定', '有効・実行方法・操作感・待機表示・Webブラウザ・除外'],
    ['executionMode', '条件に一致したコマンドの実行方法', '最初の1つ すべて 登録順'],
    ['browsers', 'Webブラウザのexe'],
    ['excludedProcesses', 'ジェスチャーを除外するexe'],
    ['requireChromiumWindowClass', 'ブラウザ条件でChromiumウィンドウだけを対象にする'],
    ['distance', '移動距離（px）'],
    ['wheelDelayMs', 'ホイールの最小実行間隔（ms）'],
    [
      'indicatorPosition',
      '表示位置',
      '待機表示 ジェスチャー開始地点 対象ウィンドウの中央 表示なし',
    ],
    ['indicatorOpacity', '不透明度', '待機表示'],
  ],
  'web-accounts': [['accounts', 'Webアカウント', 'アカウント名 追加 削除 ログイン情報をクリア']],
  codex: [
    ['connectionScope', '接続範囲', 'このPCのみ ネットワーク LAN tailnet IPv4 MCP'],
    ['network', 'ネットワークからの接続', '接続先 トークン コピー Bearer Streamable HTTP'],
    ['automation', '連携を有効にする', 'AppDockの起動中に接続できます。'],
    ['permissions', '操作の許可を開く'],
    ['registration', 'Codexへ登録', '設定ファイル 設定先を変更 登録・修復 登録を解除 接続テスト'],
    [
      'connection',
      '登録先と接続の詳細',
      '設定ファイル 登録名 接続ポート ポートを適用 認証情報を再発行 登録を解除',
    ],
  ],
  profile: [
    ['name', 'ユーザー名', '80文字以内で入力してください。'],
    ['avatar', 'アバター画像', 'PNG / JPEG · 5MBまで。同名の別画像は登録できません。'],
  ],
  about: [
    ['updateActions', '更新を適用', 'すべて更新 Appletを更新 更新を中止 更新を確認'],
    ['versions', 'バージョン情報', 'AppDock 現在のバージョン 本体を更新'],
    ['runtime', '実行環境の詳細', 'Electron Chromium Node.js OS プラットフォーム'],
    ['updates', '更新の設定', '起動時の更新確認と更新元を設定します。'],
    ['updateSource', 'Appletの更新元', 'インストール済みのApplet 更新元の設定'],
    [
      'hostSource',
      'AppDockの更新元',
      '既定: github:yukichi-7sai/AppDock.at365。ローカルの絶対パス・UNC・更新情報JSONのHTTP(S) URL・GitHubリポジトリURLに対応します。空欄で更新確認を無効にします。',
    ],
    ['checkHostOnStartup', '起動時にAppDockの更新を確認'],
    ['checkAppletsOnStartup', '起動時にAppletの更新を確認'],
    ['notifyOnStartup', '起動時に更新が見つかったら通知'],
    ['allowSameVersion', '同じバージョンの再適用を許可（開発用）'],
    ['startupDelaySeconds', '起動から確認までの秒数'],
  ],
  permissions: Object.entries(appletApiPermissionLabels).map(([key, title]) => [
    key,
    title,
    (
      {
        useTts: 'TTSサーバーへ接続し、テキストから音声を生成・再生します。',
        useAi:
          'AIサーバーへ入力を送信し、文章生成やモデル一覧を利用します。生成にはコマンド実行の許可も必要です。',
        read: '公開された状態・設定・コマンド一覧を取得します。',
        execute: '公開されたコマンドを実行します。',
        write: '本体とAppletが公開した設定を変更します。',
        manageApplets: 'Appletの有効・無効・再起動を操作します。',
        editShortcuts: 'キー・条件・実行順を編集します。',
        editGestures: '割り当て・条件・実行順・動作設定を編集します。',
        editRibbon: '表示・配置・並び順・区切り線を編集します。',
        editTray: 'メニューとクリック・ダブルクリックの割り当てを編集します。',
        useMcp:
          '登録されたMCP接続先のツールを取得・実行します。実行にはコマンド実行の許可も必要です。',
        manageMcpServers:
          '接続先の登録・変更・削除と、URL・実行ファイル・公開範囲の閲覧・編集を許可します。保存には設定変更とコマンド実行、未公開ツールの取得にはMCP接続先の利用とコマンド実行の許可も必要です。',
        manageCustomCommands:
          '定義の設定値を含む閲覧と編集を許可します。公開したコマンドの実行許可とは別です。',
        sendInput: 'アクティブなウィンドウへキーや操作メッセージを送ります。',
        runProcesses:
          'コマンドやアプリのプロセスを起動します。保存したコマンドからの外部実行には、この許可も必要です。',
      } as Record<string, string>
    )[key],
  ]),
};
export function hostSettingItem(pageId: string, key: string): SettingsItem {
  const row = hostItems[pageId]?.find((row) => row[0] === key);
  if (!row) throw Error('Unknown settings item: ' + pageId + '/' + key);
  return item(pageId, row[0], row[1], row[2]);
}
export const appletCommonDescriptions = {
  display: '同じ画面をAppDock本体のページ、または別ウィンドウで表示します。',
  startupDelaySeconds:
    '有効化・再起動からAppletを起動するまで待ちます。0で即時開始。実行中の変更は次の起動から適用します。',
};
const generalKeys = [
  'soundEnabled',
  'startAtLogon',
  'runAsAdministrator',
  'closeToTray',
  'hardwareAcceleration',
  'startMinimized',
];
const updateKeys = [
  'hostSource',
  'checkHostOnStartup',
  'checkAppletsOnStartup',
  'startupDelaySeconds',
  'notifyOnStartup',
  'allowSameVersion',
];

const item = (
  pageId: string,
  key: string,
  title: string,
  description = '',
  definition?: SettingDefinition,
): SettingsItem => ({
  id: settingsItemId(pageId, key),
  pageId,
  key,
  title,
  description,
  definition,
});
function definitionTerms(definition: SettingDefinition): string[] {
  return [
    ...(definition.aliases ?? []),
    ...(definition.options ?? []).map((o) => o.label),
    ...(definition.fields ?? []).flatMap((f) => [
      f.title,
      f.description ?? '',
      f.key,
      ...definitionTerms(f),
    ]),
  ];
}
export function settingsCatalog(
  applets: ExtensionSnapshot[],
  current: Settings,
): SettingsPageDefinition[] {
  return [
    ...hostSettingsPages.map(([id, title]) => ({
      id,
      title,
      kind: 'host' as const,
      json: !['web-accounts', 'permissions', 'codex'].includes(id),
      items: [
        ...hostItems[id].map(([key, title, description]) => ({
          ...item(id, key, title, description),
          keywords:
            id === 'appearance' && key === 'theme' ? ['Dark', 'Light', 'System'] : undefined,
        })),
        ...(id === 'notifications'
          ? notificationCatalog(orderApplets(applets, current.appletOrder)).map((t) =>
              item(id, notificationSettingKey(t), t.title, t.ownerTitle + ' ' + t.description),
            )
          : []),
      ],
    })),
    ...orderApplets(applets, current.appletOrder).map((a) => {
      const id = appletSettingsPageId(a.id);
      return {
        id,
        title: a.displayName,
        owner: a.id,
        kind: 'applet' as const,
        collection: a.collection,
        json: true,
        items: [
          ...(!a.collection ? (a.pages ?? []) : []).map((p) =>
            item(id, `page:${p.id}`, `${p.title}の表示方法`, appletCommonDescriptions.display),
          ),
          ...(!a.collection
            ? [
                item(
                  id,
                  'startupDelaySeconds',
                  '開始までの秒数',
                  appletCommonDescriptions.startupDelaySeconds,
                ),
              ]
            : []),
          ...(a.settingActions ?? []).map((s) => ({
            ...item(id, `action:${s.command}`, s.title, s.description),
            keywords: (a.settingSections ?? [])
              .filter((section) => section.actions?.includes(s.command))
              .flatMap((section) => [section.title, section.description ?? '']),
            unavailableReason:
              !a.enabled || a.state !== 'running'
                ? 'Appletを開始してから操作できます。'
                : undefined,
          })),
          ...(a.settings ?? []).map((s) => ({
            ...item(id, `setting:${s.key}`, s.title, s.description, s),
            keywords: [
              ...definitionTerms(s),
              ...(a.settingSections ?? [])
                .filter((section) => section.settings?.includes(s.key))
                .flatMap((section) => [section.title, section.description ?? '']),
            ],
          })),
        ],
      };
    }),
  ];
}
export function settingsPaths(
  page: SettingsPageDefinition,
  applets: ExtensionSnapshot[],
): SettingsPath[] {
  if (!page.json) return [];
  if (page.kind === 'applet') {
    const a = applets.find((a) => a.id === page.owner);
    if (!a) throw Error('設定対象が見つかりません。');
    return [
      ['extensions', a.id, 'settings'],
      ['extensions', a.id, 'startupDelaySeconds'],
      ...(!a.collection ? (a.pages ?? []) : []).map((p) => [
        'extensions',
        a.id,
        'pages',
        p.id,
        'display',
      ]),
    ];
  }
  switch (page.id) {
    case 'mcp-client':
      return [['mcpServers']];
    case 'custom-commands':
      return [['customCommands']];
    case 'appearance':
      return ['theme', 'shellProviders'].map((k) => ['host', k]);
    case 'tts':
      return [['tts']];
    case 'ai':
      return [['ai']];
    case 'notifications':
      return [['notificationPreferences']];
    case 'general':
      return generalKeys.map((k) => ['host', k]);
    case 'tray':
      return [['trayMenu'], ['host', 'trayClickCommand'], ['host', 'trayDoubleClickCommand']];
    case 'shortcuts':
      return [['keybindings']];
    case 'gestures':
      return [
        'enabled',
        'browsers',
        'excludedProcesses',
        'requireChromiumWindowClass',
        'distance',
        'wheelDelayMs',
        'executionMode',
        'indicatorOpacity',
        'indicatorPosition',
        'bindings',
      ].map((key) => ['gestures', key]);
    case 'ribbon':
      return ['order', 'hidden', 'bottom', 'separators', 'groups', 'itemOverrides'].map((k) => [
        'ribbon',
        k,
      ]);
    case 'profile':
      return [
        ['profile', 'name'],
        ['profile', 'avatar'],
      ];
    case 'about':
      return [
        ...updateKeys.map((k) => ['updates', k]),
        ...applets
          .filter((a) => !a.collection && a.sourceKind !== 'builtin')
          .map((a) => ['extensions', a.id, 'updateSource']),
      ];
    default:
      return [];
  }
}
export const readSettingsPath = (value: unknown, path: SettingsPath): any =>
  path.reduce((v: any, key) => (v != null && Object.hasOwn(v, key) ? v[key] : undefined), value);
function writePath(value: any, path: SettingsPath, next: unknown) {
  let parent = value;
  const ancestors: { parent: any; key: string }[] = [];
  for (const key of path.slice(0, -1)) {
    if (!Object.hasOwn(parent, key)) {
      if (next === undefined) return;
      parent[key] = {};
    }
    ancestors.push({ parent, key });
    parent = parent[key];
  }
  const key = path.at(-1)!;
  if (next === undefined) {
    delete parent[key];
    // Removing a display override must not leave an invalid pages[id]: {} behind.
    for (const ancestor of ancestors.reverse()) {
      const child = ancestor.parent[ancestor.key];
      if (!child || typeof child !== 'object' || Array.isArray(child) || Object.keys(child).length)
        break;
      delete ancestor.parent[ancestor.key];
    }
  } else parent[key] = structuredClone(next);
}
export function settingsProjection(
  value: Settings,
  page: SettingsPageDefinition,
  applets: ExtensionSnapshot[],
): Record<string, unknown> {
  if (!page.json) throw Error('このページはJSON編集に対応していません。');
  if (page.collection) {
    const applet = applets.find((a) => a.id === page.owner);
    const fields = applet?.settings ?? [];
    const source = value.extensions[page.collection.owner]?.settings[page.collection.key];
    const row = Array.isArray(source)
      ? collectionRecord(value, page.collection)
      : (value.extensions[page.owner!]?.settings ?? {});
    return {
      extensions: {
        [page.owner!]: {
          settings: Object.fromEntries(
            fields.map((field) => [field.key, row[field.key] ?? field.default]),
          ),
        },
      },
    };
  }
  const result = {};
  if (page.kind === 'applet') writePath(result, ['extensions', page.owner!, 'settings'], {});
  for (const path of settingsPaths(page, applets)) {
    const part = path[0] === 'keybindings' ? getKeybindings(value) : readSettingsPath(value, path);
    if (part !== undefined) writePath(result, path, part);
  }
  return result;
}
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function assertScope(value: unknown, paths: SettingsPath[], prefix: string[] = []) {
  if (paths.some((p) => p.length === prefix.length)) return;
  if (!object(value)) throw Error('JSONの親キーはオブジェクトで指定してください。');
  for (const [key, child] of Object.entries(value)) {
    const matching = paths.filter((p) => p[prefix.length] === key);
    if (!matching.length || ['__proto__', 'prototype', 'constructor'].includes(key))
      throw Error(`このページでは変更できないキーです: ${key}`);
    assertScope(child, matching, [...prefix, key]);
  }
}
/** Validate an isolated page, then merge only its allowed leaves into persisted settings. */
export function applySettingsJson(
  current: Settings,
  page: SettingsPageDefinition,
  applets: ExtensionSnapshot[],
  text: string,
): Settings {
  if (new TextEncoder().encode(text).length > settingsTextLimit)
    throw Error('JSONは1MB以下にしてください。');
  const value = JSON.parse(text);
  if (!object(value) || !page.json) throw Error('部分JSONはオブジェクトで指定してください。');
  const next = structuredClone(current);
  if (page.collection) {
    const applet = applets.find((a) => a.id === page.owner);
    const fields = applet?.settings ?? [];
    assertScope(
      value,
      fields.map((field) => ['extensions', page.owner!, 'settings', field.key]),
    );
    const input = value.extensions?.[page.owner!]?.settings;
    if (!object(input)) throw Error('ページ設定を指定してください。');
    const row = collectionRecord(next, page.collection);
    for (const field of fields) {
      validateSettingValue(field, input[field.key]);
      row[field.key] = input[field.key];
    }
    return next;
  }
  const paths = settingsPaths(page, applets);
  assertScope(value, paths);
  const check = createDefaultSettings();
  for (const p of paths)
    if (p[0] === 'extensions') check.extensions[p[1]] ??= { enabled: false, settings: {} };
  for (const p of paths) writePath(check, p, readSettingsPath(value, p));
  // Missing required values fail; optional values use the existing parser's defaults.
  if (page.id === 'shortcuts' && !Array.isArray(value.keybindings))
    throw Error('keybindings は配列で指定してください。');
  if (
    page.kind === 'applet' &&
    !object(readSettingsPath(check, ['extensions', page.owner!, 'settings']))
  )
    throw Error('settings はオブジェクトで指定してください。');
  const normalized = parseSettings(check);
  validateAppletSettings(
    normalized,
    page.kind === 'applet' ? applets.filter((a) => a.id === page.owner) : [],
  );
  for (const p of paths) {
    if (p[0] === 'extensions') next.extensions[p[1]] ??= { enabled: false, settings: {} };
    writePath(next, p, readSettingsPath(normalized, p));
  }
  return next;
}
const normalize = (text: string) => text.normalize('NFKC').toLowerCase();
export function searchSettings(pages: SettingsPageDefinition[], query: string): SettingsItem[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return pages
    .flatMap((page) => page.items.map((field) => ({ field, page })))
    .map(({ field, page }, order) => ({
      field,
      order,
      name: normalize(field.title),
      text: normalize(
        [
          field.title,
          field.description,
          field.key,
          page.title,
          page.owner,
          ...(field.keywords ?? []),
          ...(field.definition?.options?.map((o) => o.label) ?? []),
        ].join(' '),
      ),
    }))
    .filter((row) => words.every((w) => row.text.includes(w)))
    .map((row) => ({
      ...row,
      rank:
        row.name === normalize(query).trim() ? 0 : words.every((w) => row.name.includes(w)) ? 1 : 2,
    }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((row) => row.field);
}
