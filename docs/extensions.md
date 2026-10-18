# Applet API v1

保存型のコマンド種類は0.60.0から`custom-commands` capabilityとmanifestの`customCommandTypes`で宣言し、Nodeの`context.customCommands.register(typeId, handler)`、.NET/nativeの`context.CustomCommands.RegisterAsync`へ登録します。configは保存値の複製、実行には取消と元callerを保持します。[カスタムコマンド契約](custom-commands-design.md)を参照してください。既存のcommands.register/replaceやWindowsToolsのキー送信定義は移行しません。

Shell Appletは、通常のコマンド・設定・ページとShell描画を同じAppletで提供できます。`shell` capabilityと`shell.views`による領域単位の宣言、自己設定の購読、描画からの自己コマンド実行は[部分Shellと共通オーバーレイ](shell-overlays.md)を参照してください。全領域の実装は不要です。

Nodeのcontext.appdockと.NETのcontext.AppDockで、MCPと同じ公開操作APIを利用できます。宣言・PC専用許可・再入制約・既存自己設定APIの互換性は[AppDock共通操作API](appdock-api.md)を参照してください。

認証・Storage・Secrets・生成キャッシュはPC専用のLOCALAPPDATA、登録素材と共有枠はEXE隣に分離します。保存領域と設定受信の正本は[設定同期](settings-sync.md)です。

0.57.0以降、起動時の設定・settingsChanged・自己設定の読書きは、このPCで選択している共有／端末専用の同じ設定へ接続します。既存のNode/.NET APIの形式は維持します。保存モードの切り替えは本体のローカル設定UIだけで行い、Appletからの切り替えAPIは追加しません。

## リボンバッジ

`minimumHostVersion: "0.51.0"`と`ribbon-badges` capabilityを宣言する。Nodeは`context.ribbon.setBadge(target, badge)`、RPCは`host.ribbon.setBadge`へ`{ target, badge }`、.NETは`context.Ribbon.SetBadgeAsync(RibbonBadgeTarget, RibbonBadge?, token)`を使う。

```typescript
await context.ribbon.setBadge({ pageId: 'main' }, { kind: 'count', count: 12, label: '未読の新着' });
await context.ribbon.setBadge({ collectionKey: 'items', itemId: 'saved-item-id' }, { kind: 'dot' });
await context.ribbon.setBadge({ pageId: 'main' }, null);
```

```csharp
await context.Ribbon.SetBadgeAsync(
    new RibbonBadgeTarget { PageId = "main" },
    new RibbonBadge { Kind = "count", Count = 12, Label = "未読の新着" }, token);
```

対象は自分が実際に登録した固定／動的ページ、または自分のpageCollectionsの有効項目。所有者をIDの接頭辞から推測しない。countは0以上の安全な整数、0またはnullは非表示、dotは件数なし。labelは制御文字を含まない1～120文字の説明で、件名・本文・アカウント名を渡さない。戻り値は`{ accepted: true, changed: boolean }`で、描画完了の保証ではない。

値はruntime世代ごとのメモリー状態で、停止・異常終了・無効化・ページ削除で本体が消去する。同値更新は通知しない。失敗時は業務処理を継続できるよう扱い、件数を加算せず最新値を再発行する。表示規則・集約と保存モデルは[グループとバッジ](ribbon-groups-badges-design.md)を参照。

## 動的コマンドとキー送信の一覧設定

`dynamic-commands` capabilityを宣言したAppletは、`.NET: context.Commands.ReplaceAsync(IReadOnlyList<CommandRegistration>, token)` またはRPC `host.commands.replace` の `{ commands: [{ id, title }] }` で起動中のコマンド一覧を置き換えられます。固定コマンドも含めた全件（最大256件）を渡します。IDの接頭辞・重複・表示名を検証してから変更します。変更はパレット、ショートカット設定、グローバルホットキーへ反映され、削除したコマンドのキー登録を解除します。保存済みの割り当てとピンは保持します。

.NETの`CommandRegistration`はID・タイトル・実行ハンドラーと、任意の`Description`プロパティを持ちます。manifestとRPCにも任意の`description`（1,000 UTF-16コード単位以内）を指定でき、カスタムコマンドと同じ説明の検証・表示を使います。ActivateまたはSettings.OnChangedの中から呼び、更新をawaitしてください。コマンドは設定変更後にハンドラーを再取得するため、削除済みの処理を実行しません。ホストが更新を拒否するとRuntimeは元の一覧へ戻します。

設定定義の `type: "shortcut-list"` は `{ id, title, keys }` の配列を扱い、追加・削除UIを提供します。IDは小文字英数字とハイフン（先頭英数字、40文字以内）、名前は100文字以内、最大32件。既定値は `[]` です。キーは `Ctrl+Shift+T` や `Win+E` などの1組の組み合わせで、フォーム保存／Host API保存時に検証します。設定型はキーを送信せず、実行はApplet側の責任です。

実装例: [WindowsToolsの開発ガイド](../../Applet.WindowsTools.at365/DEVELOPMENT.md)。この型と動的APIを使用するAppletにはAppDock 0.4.0以上が必要です。

画面上では拡張機能をAppletと呼びます。`extension.json`、`extensions`、`IAppDockExtension` などの既存API名は互換性を維持します。

新規実装の手順は[Applet実装ガイド](applet-development.md)、API・設定・UI等をホストへ足す手順は[AppDock実装ガイド](host-development.md)を参照してください。

## マニフェスト

### 共通の設定ページ

設定フォームはホストの共通テンプレートで描画します。AppletはHTML/CSSを複製せず、`settings`と任意の`settingSections`を宣言します。設定一覧とApplet詳細の設定タブは同じ本文・編集状態を使います。ページ表示方法と起動待ちはホストが末尾の共通カードへ追加します。

`settingSections`にはAppDock **0.36.8以上**が必要です。最大32件で、`id`（英小文字から始まる英数字・ハイフン、64文字以内）、`title`（160文字以内）、任意の`description`（500文字以内）、`settings`（自身の設定キー）、`actions`（自身のsettingActionsのコマンドID）、`collapsible`（既定false）を指定します。各セクションには設定か操作を1件以上含めます。ID重複・存在しない参照・複数セクションへの重複配置は起動時に拒否します。

```json
"minimumHostVersion": "0.36.8",
"settingSections": [
  {
    "id": "monitoring",
    "title": "監視",
    "description": "自動確認の間隔を設定します。",
    "settings": ["intervalSeconds"],
    "actions": ["at365.my-tool.check"]
  }
]
```

セクションとその中の参照は宣言順に表示し、設定の後に操作ボタンを置きます。未配置の設定は「その他の設定」、未配置の操作は「操作」に残ります。セクション省略時も「設定」「操作」の共通カードになるため、後から追加した設定が非表示になりません。主要項目は初期表示し、調査・詳細調整などだけを`collapsible: true`にします。横断検索はセクションの見出し・説明にも対応し、検索した項目の折りたたみを開きます。

この宣言は表示用メタデータです。設定キー・既定値・型・保存領域を変更せず、設定JSONへセクション情報を書き込みません。動的な選択肢・旧値の表示・即時保存・外部変更の競合処理も共通経路を使います。`object-list`と`shortcut-list`は横幅を使ったフォームになります。

### 設定ページの操作ボタン

`settingActions` は最大16件の `{ title, command, description?, successMessage? }` を宣言します。
`command` は同じマニフェストの `commands` に宣言した正規IDに限定し、重複・別Applet・ホストのコマンドを拒否します。
ボタンは既存のコマンド実行経路を使い、実行中は同じ設定パネルの操作ボタンを無効化します。
成功・失敗をその場へ表示し、設定変更とは独立して実行します。操作内容はsettings.jsonへ保存しません。
実行可否はコマンドの現在のavailabilityに従います。Windows等への実際の操作と結果確認はAppletの責任です。
`activateOnExecute` のないコマンドはApplet開始後に利用できます。この機能を使うAppletはminimumHostVersionを0.21.0以上にしてください。

```json
"settingActions": [
  {
    "title": "今すぐ確認",
    "command": "at365.my-tool.check",
    "description": "保存済みの設定を使って確認します。",
    "successMessage": "確認しました。"
  }
]
```

```json
{
  "apiVersion": 1,
  "id": "at365.my-tool",
  "name": "Applet.MyTool",
  "displayName": "My Tool",
  "version": "0.1.0",
  "runtime": "dotnet",
  "entry": "MyTool.dll",
  "type": "MyTool.Extension",
  "capabilities": ["ui", "settings", "notifications", "storage", "secrets", "browser"],
  "settings": [
    { "key": "intervalSeconds", "title": "確認間隔（秒）", "type": "number", "default": 30 }
  ]
}
```

`entry` はマニフェストがあるフォルダ内のファイルです。相対パスを指定し、必要な依存DLLも同じフォルダに置きます。`runtime: "node"` の場合はコンパイル済みCommonJSの `.js` を指定し、`type` は不要です。拡張IDとコマンドIDは安定した名前にしてください。コマンドIDは必ず `<extension-id>.` から始めます。

フォームの設定定義は `boolean` / `number` / `string` / `select` に対応します。`description` は項目の説明、数値の `minimum` / `maximum` / `step` は範囲と刻み幅です。型・範囲・静的な選択肢はUIとHost APIの保存時に検証します。手動JSON編集もあるため、Appletは設定値を読む際にも妥当性を確認してください。

`select` には `options: [{"label":"上端","value":"top"}]` を宣言します。`dynamic: true` の項目は、.NETの `Settings.SetOptionsAsync` / Nodeの `settings.setOptions` で選択肢を更新できます。未接続モニターなどの保存された選択は保持し、現在利用できない選択として表示します。動的な値の代替動作はApplet側で実装してください。

設定変更の通知は `.NET: Settings.OnChanged(async token => ...)` / `Node: settings.onChanged(async () => ...)` で購読します。購読解除のIDisposable／関数を返します。.NETでは同じAppletのコマンドと設定変更処理を直列化します。

## ネイティブ表示を持つApplet

WPF等で独自ウィンドウを表示するAppletは `runtime: "native"`、`entry: "Applet.Watch.at365.exe"` を指定します。AppDockが専用EXEを起動し、DLL拡張と同じ標準入力／出力のJSON-RPCで接続します。`type` は不要です。EXEは実行環境と依存関係を自身で持つ必要があります。

`.NET` 用の共通接続処理は `dotnet/AppDock.Runtime` の `AppletSession.RunAsync(IAppDockExtension, TextReader, TextWriter)` にあります。WPFではSTAのDispatcherを維持し、接続処理をバックグラウンドで動かします。`../Applet.Watch.at365` が実装例です。ホスト終了／無効化時はdeactivateの後にプロセスを停止し、通信断時もセッションを終了します。コマンド、設定、パネル、capabilitiesの検査は既存のAppletと共通です。

登録したコマンドは、ホストの「設定 → ショートカット」に自動的に表示され、ユーザーがキーを割り当てられます。コマンドパレットからピン留めと並べ替えもできます。設定はコマンドIDで保存するため、更新時にもIDを維持してください。拡張を無効にしてもキー設定とピンは保持され、有効にして再登録されると利用できます。

## .NET

`dotnet/AppDock.SDK/AppDock.SDK.csproj` を参照し、公開クラスに `IAppDockExtension` を実装します。実行用ランタイムはnet10.0です。UIライブラリに依存しないCoreをここへ移します。

```csharp
using AppDock.SDK;

namespace MyTool;
public sealed class Extension : IAppDockExtension
{
    private IDisposable? schedule;
    public async Task ActivateAsync(IExtensionContext context, CancellationToken token)
    {
        context.Commands.Register("at365.my-tool.check", "今すぐ確認", async ct =>
        {
            await context.Notifications.ShowAsync("My Tool", "確認しました。", ct);
        });
        context.Tray.Add("今すぐ確認", "at365.my-tool.check");
        schedule = context.Scheduler.Every(TimeSpan.FromSeconds(30), ct =>
            context.Log.InfoAsync("定期処理", ct));
        await context.Ui.ShowPanelAsync(new Panel("My Tool", "準備ができました。"), token);
    }
    public Task DeactivateAsync(CancellationToken token)
    {
        schedule?.Dispose();
        return Task.CompletedTask;
    }
}
```

1拡張ごとにホストランナーを1プロセス起動します。各DLLは独立したAssemblyLoadContextで読み込み、AppDock.SDKの型はランナーと共有します。コマンド処理は同一拡張内で直列化します。定期処理は前回の完了まで次回を重ねません。定期処理とコマンドの同時実行が問題になるロジックでは、拡張側にも排他を置いてください。定期処理はSDKから停止されますが、拡張が独自に作成したリソースはDeactivateAsyncで解放してください。CancellationTokenを処理へ渡してください。

DLL用の.NETホストはframework-dependentで発行し、PCにインストール済みのMicrosoft.NETCore.App 10.0（Windows x64）を使用します。DLL用ホストには.NETランタイムを同梱せず、WindowsDesktopランタイムも要求しません。本体のInputHostは別途自己完結で同梱します。WPF/WinFormsの画面やSTAメッセージループが必要なAppletは、上記の `runtime: native` と専用EXEで実装します。時計Appletは自身のWindowsDesktopランタイムを同梱します。別のnative Appletをframework-dependentで配布する場合は、利用先に必要なWindowsDesktopランタイムを用意してください。任意の既存EXEを置くだけで接続されるものではなく、SDKの接続とライフサイクルへの対応が必要です。P/InvokeのようなWindows API処理をDLL Appletに置くことも可能です。

## TypeScript / Node.js

検証用の [Node拡張](../tests/fixtures/extensions/welcome/index.ts) が完全な例です。型は `src/main/node-worker.ts` の `NodeExtensionContext` / `NodeExtension` を `import type` で参照できます。コンパイル済みCommonJSコードを配置してください。検証用拡張は `pnpm run build:test-extensions` でコンパイルし、通常のビルド・発行には含めません。

```typescript
import type { NodeExtensionContext } from '../../src/main/node-worker';
export async function activate(context: NodeExtensionContext) {
  context.commands.register('at365.my-tool.check', '今すぐ確認', async () => {
    await context.notifications.show('My Tool', '確認しました。');
  });
  context.tray.add('今すぐ確認', 'at365.my-tool.check');
  await context.ui.showPanel({ title: 'My Tool', description: '準備ができました。' });
}
export async function deactivate() { /* 独自のリソースを解放 */ }
```

`tray.add` / `Tray.Add`はメニューの表示名を提案します。利用者が本体の「設定 → タスクトレイ」でコマンドを配置し、Appletは表示を強制しません。提案のない登録コマンドも選択できます。クリック時のコマンドは`host.trayClickCommand`で選び、既定は`appdock.open`です。メニューとダブルクリックの契約は[トレイ仕様](tray-menu.md)を参照してください。

Node拡張はElectron同梱Nodeを子プロセスで利用します。ホスト本体のNode空間にはロードしません。stdoutはプロトコル専用です。通常のconsole.logはstderrへ転送します。

## SDKで使えるサービス

Webサービスのアカウント別ページには[WebアカウントAPI](web-accounts.md)（Nodeのみ）を使用できます。一時UIデータと、ローカルUIによる表示領域・非表示の切替にも対応します。

| API | 用途 | capabilities |
| --- | --- | --- |
| Commands | パレットとボタンから呼ぶ処理の登録 | 常時 |
| Tray | ホストトレイのサブメニューにコマンドを追加 | 常時 |
| Settings | 自分の拡張設定の読み取り・保存 | 書き込みに `settings` |
| Notifications | ホストの通知設定に従うデスクトップ通知 | `notifications` |
| UI | テキスト、説明、label/value、コマンドボタンのパネル | `ui` |
| Browser | 資格情報を含まないHTTPS URLを既定ブラウザで開く | `browser` |
| Logging | 拡張ID付きホストログ | 常時 |
| Scheduler | 定期実行、停止時のタイマー解除 | 拡張ランナー内 |
| Storage | 拡張ID・キー別のJSON永続データ（1件1MBまで） | `storage` |
| Secrets | 拡張ID・キー別の暗号化文字列 | `secrets` |

ログは.NETの`context.Log.InfoAsync/ErrorAsync`、Nodeの`context.log.info/error`を使い、独自ファイルへの出力を避けてください。ホストがApplet IDを付けて全体ログ・Applet詳細ログとホストログファイルへ記録します。deactivate中の`host.log`も受け付け、クリーンアップのエラーを元のレベルで保存します。停止完了/異常終了後の呼び出しと、停止中のログ以外のAPIは拒否します。終了前に必要なログをawaitし、同期のバックグラウンド処理から接続する場合は上限付きの待ち行列と短い排出待ちを使ってください。

設定変更はキャッシュへ通知します。設定に依存する表示やタイマー間隔等は、OnChangedの購読または都度読み取りで反映してください。UIへHTML/JavaScriptは渡せません。Reactがテキストとして描画します。API v1は1拡張1パネルです。

## 通信

UTF-8のJSON-RPC 2.0をstdin/stdoutに1行1メッセージで送ります（上限1MB、通常タイムアウト15秒）。ホスト→拡張は `activate` / `settings.changed` / `command.execute` / `deactivate`。activateは `{commands:[{id,title}],tray:[{title,command}]}` を返します。

拡張→ホストは `host.settings.get/set/options` / `host.notifications.show` / `host.ui.panel` / `host.browser.open` / `host.log` / `host.storage.get/set` / `host.secrets.get/set/delete` です。SDKがこの通信を隠蔽します。無効化・終了時はdeactivateを最大2秒待ち、残った子プロセスを終了します。異常終了した拡張はエラー状態にし、他の拡張は動作を継続します。自動再起動のループは行わず、画面の「再起動」で復旧します。

## ショートカット初期値

`extension.json`に`defaultKeybindings`を指定できます。各行は`command`/`key`/`enabled`/`when`を持ち、`command`は同じmanifestの`commands`に宣言したIDに限ります。`when`は[条件付きショートカット](keybindings.md)の形式です。初回導入時にだけ利用者の設定へコピーされます。

## Appletの表示名

`extension.json`の任意項目`displayName`（空白だけではない1～100文字の文字列）で表示名を指定できます。前後の空白を除いた名前をホストの一覧・詳細・設定・コマンド候補・トレイのサブメニュー・起動ログに使用します。明示した表示名はそのまま尊重します。

省略時は`name`の先頭の`Applet.`だけを取り除きます（例: `Applet.Watch.at365` → `Watch.at365`）。除去して空になる場合は元の名前を使います。`name`・`id`・実行ファイル名・設定やコマンドIDは変更しません。検索は表示名・元の名前・IDのすべてに対応します。snapshotは元の`name`と、解決済みの`displayName`を別々に返します。旧ホストはこの項目を無視して従来の`name`を表示するため、既存Appletの最低ホスト版を変更する必要はありません。反映にはAppDockの再起動が必要です。

## manifestとホスト共通設定

- `minimumHostVersion`: 必要なホストの安定版SemVer (`0.5.0`など)。省略時は従来どおりAPI v1として起動。
- `startupDelaySeconds`: 既定の遅延秒数、0～86400の整数。省略は0。
- `updateRepository`: GitHubの`owner/repository`。省略時は更新確認非対応。更新比較には`major.minor.patch`の正式版タグ（先頭`v`も可）が必要。
- 保存先は`extensions[id].startupDelaySeconds`。Applet固有の`settings`とは別で、旧設定をそのまま読み込める。待機のタイマーを起動・RPCのキューで待たず、ほかのAppletの起動を妨げない。
- snapshotの`state: waiting`、`scheduledStartAt`（Unixミリ秒）で待機を表示。無効化・再起動・終了でタイマーを解放。再起動も遅延を適用し、「今すぐ開始」だけ即時にする。
- `type: json`の設定値は最大10000文字のJSON文字列。ホストで構文、Appletで意味と範囲を検証。

パネルの`images`は4件まで。各項目は`title`、任意の`description`、`image`（JPEG/PNG/WebPのbase64 data URL、200000文字以内）、名前空間内の`actions`（4件まで）。ホストは外部URL・SVG・HTMLを受け付けない。.NETの既存`Panel`コンストラクターは維持し、任意の`Images`プロパティと`PanelImage`を追加。Nodeの`ui.showPanel`でも同じJSON型を使用できる。

これらはホスト内部と既存パネルAPIの追加で、`.NET`/Nodeに新しいRPCメソッドは追加していない。外部native Appletは独自のSDKコピーを含むため、追加プロパティを使うAppletは再publishすること。
## 宣言コマンド・構造化一覧・パネル操作

この節の機能を使うAppletは`minimumHostVersion: "0.6.0"`を指定してください。

manifestの`commands: [{ id, title, activateOnExecute?, aliases? }]`は、ロード前からパレット・ショートカットに表示するコマンドを宣言します。実行中はruntimeの登録内容を優先し、snapshotの`available`で使用可否を知らせます。`activateOnExecute: true`の明示実行は無効化・開始待ち状態から有効化して即時起動します。最低ホストバージョンはこの経路でも検証します。起動時に同じIDをruntimeへ登録してください。`aliases`は同じ名前空間の旧ID（8件まで）を受け付け、未割り当ての別名はコマンド候補に重複表示しません。既存の割り当ては保持します。

`type: object-list`の設定は`fields`と`itemTitle`を持つ64件までのオブジェクト配列です。フォームで追加・並べ替え・削除します。旧JSON文字列も読み取れます。フィールドはboolean / number / string / select / string-listで、一覧の入れ子は不可。`string-list`はフィールド内だけで使用し、64件までの文字列を追加・削除します。`format: directory`でフォルダー選択、`aliases: ["Folder"]`で旧単一文字列を統合します。`select`の`numericOptions: true`は旧数値enumをoptionsの順序で読み取ります。正規化時も未知のフィールドを保持します。

`Panel.Images`は最大1000件、`Tabs`は最大100件です。`PanelAction`は従来の`Command`、または`Command: ""`と`ActionId`のどちらかを指定します。`Selected`はタブの選択状態。`ActionId`はAppletの名前空間内のIDとし、.NETの`IPanelActionHandler.HandlePanelActionAsync` / Nodeの`onPanelAction`で処理します。ホストは現在表示中のパネルに存在するIDだけを`panel.action`で送ります。可変数の履歴ボタンを一般コマンドへ登録する必要はありません。ページ世代IDと表示対象の検証はApplet側でも行ってください。

`local-images` capabilityで`.NET: Ui.GetImageDirectoryAsync` / Nodeの`ui.getImageDirectory` / RPC `host.ui.imageDirectory`が専用キャッシュを作成します。そこにPNG/JPEG/WebPを作り、`PanelImage.ImageFile`へ絶対パスを指定します。ホストは実パスでキャッシュ内に含まれるファイルだけを登録し、同一オリジンの画像URLとして表示します。画像データはJSON-RPCへ載せず、画像バイト数による画質・解像度の制限はありません。従来のbase64 `Image`は200000文字上限のまま使用可能です。`Tooltip`で元ファイルパスを表示できます。キャッシュファイルの寿命と削除はAppletが管理します。
## Node Appletの通知・ファイル選択

既存API v1と従来の通知呼出しを維持した追加です。利用するAppletは`minimumHostVersion: "0.11.0"`を指定します。

| Node API | capability | 動作 |
| --- | --- | --- |
| `ui.pickFile('json' \| 'wav')` | `file-dialog` | ホストのファイル選択。絶対パスまたはキャンセル時null。RPC待機は5分 |
| `audio.play(file?)` | `audio` | ローカルWAVを共通キューで再生。0.42.0以降は空文字/省略が無音。キュー受付時に戻る |
| `tray.attention(boolean)` | `tray-attention` | 稼働中Appletの通知要求を集約し、共通トレイに橙色の印を表示 |
| `notifications.show(title, body, { silent?, command? })` | `notifications` | 音の抑制とクリック時の自Appletコマンドを任意指定 |

WAVは絶対パス、16 MiB以下のRIFF/WAVE。待機は32件まで、1回の再生は30秒で打ち切ります。再生時だけsandbox/contextIsolation有効の非表示Electronウィンドウを作り、終了時に破棄します。停止・再起動したAppletの音は中止し、待機分は破棄します。再生失敗はホストログに記録します。外部URLやシェルによる再生は行いません。

通知の`command`は登録済みの自Appletコマンドのみ受け付け、クリック時にも同じプロセスが稼働中であることを確認します。`silent`を省略した既存通知の動作は維持します。トレイのattentionは停止・異常終了で解除し、トレイメニューへのコマンド表示やクリック割当は変更しません。

長い認証やファイル選択を行うAppletはコマンドを即時受付し、バックグラウンドで処理してパネルへ状態を反映してください。通常のコマンドRPCは従来どおり15秒です。GmailCheckerが利用例です。

## ジェスチャーの初期値と実行文脈

manifestのdefaultGestureBindingsに、自身のcommandsに宣言したコマンドの割り当て（id/command/gesture/enabled/when、最大100行）を宣言できる。初回だけ設定へコピーする。詳細は[マウスジェスチャー](gestures.md)。

command.executeは任意のinvocation（session/window/process/source）を受け取る。.NETハンドラーはCommandExecution.Currentから読み取れる。source=gestureの場合のwindowは開始対象HWNDの10進文字列。command.cancelのsessionが一致すればハンドラーのCancellationTokenを取り消す。引数なしの既存ハンドラーは変更不要。対象固定や取消を実操作まで反映するかはAppletの実装による。
## 外部コマンド公開

manifestの`commands[].automation: true`で共通操作API/MCPへの公開を宣言できます。省略/falseは非公開、runtime登録や別名だけでは公開しません。形式・動的コマンドとの照合・権限は[共通操作API](automation.md#appletによる公開宣言)を参照してください。利用するAppletは`minimumHostVersion: "0.26.29"`以上を指定します。

設定を外部公開し、booleanのON/OFF/切り替えを通常コマンドとして生成する場合は、[設定宣言と自動生成コマンド](automation.md#設定宣言と自動生成コマンド)を参照してください。settings capabilityと明示の公開・生成宣言が必要です。

公開先をAPIごとのcallers宣言から判定し、Applet専用入力APIを提供します。利用許可は全Applet共通です。Node/.NETのコマンド実行文脈と取消は入力APIまで伝播します。[共通操作API](appdock-api.md)を参照してください。

page.logsとwindow.appdockPageは[Shellのページ表示](shell-pages.md)を参照してください。Shell Appletの自己設定/自己コマンドAPIも共用します。

## 種類指定通知API

登録時の`levels`と`defaultLevel`で通知のレベルを指定する。`info`は緑をポイントにライトで白背景・ダークで暗い背景、`warning`は黄系、`error`は赤系で、Default Shellのバナー・デスクトップ・通知センターに共通して適用される。発行元による色の個別指定は不要。複数レベルを宣言する場合は発行時の`level`で選択でき、省略時は`defaultLevel`になる。

最低ホスト版は0.30.0。notifications capabilityと、manifestのnotificationTypesが必要です。旧ShowAsync/notifications.showは、notificationTypesを宣言していないAppletに限り本体生成の予約種類appdock.legacyへ接続します。種類を宣言したAppletはPublishAsync/notifications.publishを使います。従来の署名・null戻り値・silent・所有コマンドのクリック実行を維持し、種類別の通知先・表示時間を適用します。安全な汎用要約だけを履歴へ保存します。

```json
{
  "minimumHostVersion": "0.50.0",
  "capabilities": ["notifications"],
  "notificationTypes": [{
    "typeId": "new-message",
    "title": "新着メッセージ",
    "description": "新しいメッセージを受信したときに通知します。",
    "levels": ["info", "warning"],
    "defaultLevel": "info",
    "allowedTargets": ["banner", "desktop", "windows"],
    "defaultTargets": ["banner"],
    "requiredTargets": [],
    "lifetimePolicy": "userDuration",
    "defaultDurationSeconds": 10,
    "history": "persistent"
  }]
}
```

定義は1Applet64件まででtypeIdは所有者内で一意です。重複、未知フィールド、範囲外秒数、既定/必須先が許可先にない定義を拒否します。通知全体のOFFは設けず、requiredTargets:['banner']はバナーの解除とセンターのみへの変更を拒否します。[通知先の必須指定](notifications.md#通知種類の制約)を参照してください。0.50.0以降は旧defaultEnabled/canDisable/disabledControlReasonを互換読込で無視し、新規宣言では省略します。lifetimePolicyはuserDuration/fixedManual/condition、historyはpersistent/session/none。userDurationの既定秒数を省略/nullにするとmanualです。conditionは発行元の終了まで持続し、閉じるボタンを持ちません。

| 操作 | Node context.notifications | .NET context.Notifications |
| --- | --- | --- |
| 発行・同じキーの更新 | publish(request) | PublishAsync(NotificationRequest, token) |
| 保存済みの実効方針取得 | getPolicy(typeId) | GetPolicyAsync(typeId, token) |
| 所有通知の終了 | end(notificationId, status?) | EndAsync(notificationId, status, token) |
| 方針変更購読 | onChanged(handler)、解除関数を返す | OnPolicyChanged(handler)、IDisposableを返す |

```javascript
const unsubscribe = context.notifications.onChanged(async () => {
  const policy = await context.notifications.getPolicy('new-message');
  // 必要なら現在の条件を再評価する。過去のイベントは再送しない。
});
const result = await context.notifications.publish({
  typeId: 'new-message', title: 'メッセージを受信しました', body: '内容を確認できます。',
  dedupeKey: 'inbox', historyText: { title: '新着メッセージ', body: 'メッセージを受信しました。' },
  actions: [{ key: 'open', label: '確認', command: 'example.mail.open' }]
});
if (result.status === 'accepted') await context.notifications.end(result.notificationId, 'resolved');
```

.NETはNotificationRequest/NotificationHistoryText/NotificationAction/NotificationPublishResult/NotificationPolicyをSDKで提供します。新SDK/Runtimeを使ってビルドし、最低ホスト版を宣言してください。SDKの共有AssemblyVersion 0.10.0と旧ShowAsyncの署名を維持します。古いサービス実装の新メソッドはNotSupportedExceptionとなります。

発行入力はtypeId/title/bodyと任意のlevel/dedupeKey/historyText/actions/restartTimer/silentです。silentは0.42.0以降の任意booleanで、trueならWindows通知の音だけを抑制します。共通通知の読み上げ設定は変更しません。.NETはNotificationRequestのSilent initプロパティを使います。level省略は種類のdefaultLevel。表示先・寿命・有効状態の上書きは拒否します。persistentでは安全なhistoryTextが必須です。タイトル200文字、本文2,000文字、dedupeKey200文字、操作3件、操作key/label100文字まで。操作のcommandは実行中の自Appletが登録したコマンドに限定し、押下時にも所有者と起動世代を再検査します。

結果はacceptedとnotificationId、またはsuppressedとreasonです。acceptedは登録完了で、表示成功/既読を保証しません。抑制理由はtype-disabled/applet-disabled/type-definition-changed/no-available-targets。不正入力・未知種類・上限/頻度超過はエラーです。endのstatusはresolved/withdrawnのみ、他Appletや古い世代の通知は終了できません。

同じ所有者/typeId/dedupeKeyのactiveを更新します。通常更新は既存の期限を維持し、restartTimer:trueだけが現在の設定で期限を再設定します。所有者50件の上限は全種類で共有、発行頻度はバースト20件/毎秒10件補充です。終了は頻度制限を受けません。方針変更通知は再取得の合図で、通知本文や履歴を含みません。通知方針の購読はNode/.NETともコマンドや他の通知と並行し得るため、再評価処理が必要ならAppletで排他を設けます。

通知先はbanner/desktop/windowsの複数選択に対応します。Windowsへの配送を必要とするAppletはminimumHostVersion:0.32.0以上を指定してください。設定・履歴の保存と寿命は[通知基盤](notifications.md)を参照してください。

本体0.31.0ではtargets:[]を通知センターのみとして解決します。発行APIに新しい表示先/寿命指定を渡す必要はありません。notificationTypesのdefaultTargets:[]を宣言するAppletはminimumHostVersion:0.31.0以上にしてください。allowedTargets:[]もセンター専用の種類として宣言できます。本体0.31.1はdesktopにも配送します。desktop配送を必要とするAppletはminimumHostVersion:0.31.1以上を指定してください。旧版と併用する種類の予約済みdesktop宣言は読込可能で、0.30.0では未対応先として抑制されます。Shell領域notification.desktopにはminimumHostVersion:0.31.1以上が必要です。0.32.0では予約済みwindowsにも配送します。Windows側の表示時間・集中モード等はOSが管理し、基盤の寿命や既読と区別します。

## Shellの採用状態と専用コマンド

最低ホスト版は0.34.0。shell capabilityと自Appletの対象領域宣言を必要とします。Nodeはcontext.shell.getState()/onChanged(handler)、.NETはcontext.Shell.GetStateAsync()/OnChanged(handler)、RPCはhost.shell.getStateとホスト発shell.changedです。購読を登録してから初回取得し、古い表示revisionを無視します。初回取得後に通知を受け取り、activate中もViewやreadyを待ちません。状態はprimary・表示revisionと、自分が提供する領域だけのconfigured/resolved/bound/ready/visible/reasonです。他の提供元ID・全設定・パスを返しません。外部操作許可は不要で、能力と本人の稼働世代を検査します。

manifestのcommands[]に任意のshellRequirement: { region: "ribbon", state: "visible" }を指定できます。stateはresolvedまたはvisible、1コマンドに1領域です。resolvedは現在の解決先、visibleは現在のreadyかつ実表示・操作可能なViewで判定します。モーダルで操作を止めている領域もvisible条件を満たしません。activateOnExecute:trueとの併用は拒否します。省略は従来どおりで、自己設定変更や生成された設定コマンドへ条件を自動付与しません。

runtime登録・動的置換はmanifestの条件を解除できず、別名も同じ条件です。available/disabledReasonとExtensionManager.executeの直前検査を共用し、UI・キー・トレイ・MCP・他Applet経由を揃えます。IDを書き換えたり、別Appletへ転送したり、実行のために割り当てや有効状態を変更したりしません。取得後の状態変化では実行を拒否します。型付きViewの一時操作を新設した契約ではなく、任意DOM/JavaScript/renderer RPCは追加しません。詳細は[領域別割り当て](shell-region-assignment.md)。

native Appletの入口ではConsole.InputEncoding=Encoding.UTF8、Console.OutputEncoding=new UTF8Encoding(false)をConsole.In/Out取得前に設定し、wire用stdoutを確保して通常ログはstderrへ出してください。UTF-8の状態理由をWindows既定の文字コードで読むとJSONの引用符まで破損するため、ASCIIのみのfixture成功を文字コード契約の検証に代用しません。

## TTS読み上げ

最低ホスト版0.35.0。tts.speak / tts.voices.list / tts.jobs.get / tts.stopをAppletとMCPへ公開します。Appletはappdock-api capability、両入口はそれぞれのuseTts許可を使います。受付・状態・所有者・停止・重複判定とNode/.NET例は[TTS連携](tts-design.md#共通api)を参照してください。

AIの文章生成は最低ホスト版0.37.0。既存context.appdock.call / context.AppDock.CallAsyncからai.text.generate等を利用できます。appdock-api capabilityと独立したuseAi許可が必要です。[モデル・追加プロンプトの指定とジョブAPI](ai.md#共通api)を参照してください。

### 宣言型の一覧編集

`object-list`の`list`指定で、読み取り用の表・アイコン操作・有効トグルと追加/編集ダイアログを自動生成できます。最低ホスト版は0.45.0です。列、識別子、入れ子フィールド、保存の競合検査は[一覧形式の設定編集UI](settings-list-editing.md#appletの一覧宣言)を参照してください。
