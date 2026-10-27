# AppDock共通操作API

MCPとAppletは同じ操作名・引数・結果・設定revision・dryRun・保存処理を使います。機能別の契約は[共通操作APIの各操作](automation.md)を正本とし、この文書はAppletの接続・許可・互換性を説明します。

## 保存型カスタムコマンド

`customCommands.types.list/get`と`customCommands.list/get`、`commands.execute`経由の`appdock.customCommands.update`を使用できます。[カスタムコマンド契約](custom-commands-design.md)に保存形式・Schema・上限・CRUD例をまとめています。定義の読取りはread、変更はread + write、保存済みコマンドの実行はread + executeです。Appletは自身の定義だけを管理でき、外部公開を追加できません。実行の元callerはハンドラー内の共通APIにも引き継ぎ、MCPとAppletの必要許可の積を検査します。

本体提供種類`appdock.mcp.call`は接続先ID・ツール名・toolRevision・固定argumentsを保存します。実行は`handlerReturned`内の`result.completion:'accepted'`とjobIdを返し、完了を待ちません。[保存型MCPコマンド](custom-commands-design.md)を参照してください。

## MCPクライアントとハブ

`mcp.servers.list`、`mcp.tools.list/get/call`、`mcp.jobs.get/cancel`をAppletとMCPへ公開します。発見/状態取得はread + useMcp、実行/取消はさらにexecuteが必要です。新規環境のuseMcpはApplet側がON、MCP側がOFFです。本体のMCPサーバーOFFでもAppletから利用できます。[接続・保存・上限](mcp-client-design.md)と[中継公開](mcp-hub-design.md)を参照してください。

接続先管理には`mcp.servers.getSettings/updateSettings/inspectTools`を使用します。設定の読取りはread、保存はread + write、未公開ツールの確認はread + execute + useMcpです。元callerの必要許可も照合します。[管理API](mcp-client-design.md#接続先の管理api)に、保存・秘密・公開範囲の契約をまとめています。

tools.listは概要、tools.getは1ツールのSchemaとtoolRevisionを返します。tools.callには`{serverId,name,arguments,toolRevision,requestId,timeoutMs?}`を指定し、返されたjobIdでjobs.get/cancelを呼びます。Nodeは`context.appdock.call`、.NETは`context.AppDock.CallAsync`を使用します。結果取得は同じ実行主体に限り、MCP起点を経由したAppletには元のMCP許可と公開リストも適用します。設定UIだけが全ジョブを確認できます。

非秘密の接続定義は管理APIでも登録・変更できます。秘密の入力・消去と、秘密付きの行の削除・接続先変更は本体設定UIで行います。未対応Schema・変更済みtoolRevision・非公開ツール・上限超過・再起動後のジョブは明確なエラーとして返します。

## 構造と公開範囲

本体と全Appletの更新・本体のみの更新・更新チェック、および設定インデックスの各ページを開く操作は、`commands.list`で公開コマンドとして取得し、`commands.execute`へそのIDを渡す。設定UIも同じコマンド処理を使う。コマンドID・通知と更新確認の契約は[更新](updates.md)、設定ページの自動生成と既存IDは[設定基盤](settings-foundation.md#カタログjson検索)を参照する。

- `src/main/core/appdock-api.ts`のAppDockApiはMCPの起動状態から独立した単一インスタンスです。MCPはHTTPアダプター、Appletは既存JSON-lines RPCの`host.appdock.call`から呼びます。AppletにHTTPポート・Bearer token・Codex登録は不要です。
- 操作カタログは`src/shared/appdock-api.ts`のappDockOperationsへ集約します。各操作で`callers`（mcp/applet）、`permissions`、入力JSON SchemaとMCP情報を宣言します。新規処理はAppDockApiのhandlersへ登録し、共通dispatcherが公開先・必要許可・Schemaを検証します。MCP列挙も同じ公開先を使うため、Applet RPC/SDK/MCPの通信実装を追加する必要はありません。既存のcommands.executeから公開コマンドを増やす場合も新しいツールは不要です。
- 公開操作の正本は操作カタログのcallersです。公開情報・設定・コマンド、カスタムコマンド管理、Applet管理、入力割当編集等を提供し、Applet専用の入力2操作とprocesses.startがあります。非公開コマンド、秘密情報、全settings.jsonをこの入口から取得することはできません。
- 自分のStorage/Secrets、通知、UI登録等の既存APIは引き続き用途別の入口を使います。これらをMCPへ自動公開しません。リモートWebページにはこのAPIやホストIPCを渡しません。

## 宣言と許可

新しいAPIを使うAppletのmanifestに`"capabilities": ["appdock-api"]`と`"minimumHostVersion": "0.76.5"`を指定します。従来のsettings/UI等も使う場合は、そのcapabilityも残します。

本体の「設定 → 操作の許可」のApplet列で変更します。MCP列と並べて表示しますが、保存先・許可判定は独立したままです。操作カテゴリごとに全Applet共通の許可を使い、Applet別の許可は設けません。applet-api.jsonが存在しない新規環境では、Applet列の全項目をONにします。既存version 2の保存値はそのまま使用し、省略項目も拒否を維持します。MCPは接続・操作許可が初期OFFで、情報取得は連携ON時に許可する既存契約を保ちます。変更はその場でPC専用の`applet-api.json`（version 2、permissions）へ保存され、共有settings.jsonの保存とは独立しています。旧version 1の個別許可を全Appletへ拡大せず、初回は共通許可をOFFとして扱います。設定を読み取れない場合は拒否し、画面へエラーを表示します。Codex側の許可・登録とは独立しています。

画面ではread／write／executeを「情報の取得」「設定の変更」「コマンドの実行」と表示します。MCP列の情報取得はON固定・操作不可のトグルで、「MCP連携中は常に許可」と補足します。Applet列の情報取得は従来どおり切り替えられます。コマンド実行・Windows入力・プロセス起動・MCP利用・AI送信・TTS送信の6項目は、MCP列のトグル横に注意アイコンを表示します。許可がOFFでも表示し、マウスを重ねるかキーボードでフォーカスすると注意理由を読めます。アイコンは表示上の案内で、許可の判定や保存値を変更しません。

| 操作 | 必要なApplet側の許可 |
| --- | --- |
| 読取り | 情報の取得（read） |
| 通常の公開コマンド | read + execute |
| 公開設定変更・生成ON/OFF/toggle | read + write |
| Appletの有効・無効 | read + write |
| Appletの再起動 | read + execute |
| ショートカット等の編集 | read + write |
| input.sendKeys / input.appCommand | sendInputのみ（MCPは直接呼出し不可） |
| processes.start | read + execute + runProcesses（Applet専用） |
| 保存したキー送信／プロセス起動コマンド | read + execute + sendInput／runProcessesと、定義の外部公開 |

許可を変更できるのはホストの設定画面だけです。MCPやAppletから自分の許可を追加できません。呼び出し元のApplet IDはホストが接続から決定し、リクエストから受け取りません。監査ログは呼び出し元Appletのログへ`[Applet API]`として操作名・リクエストID・成否を記録し、引数や秘密値を含めません。

CodexとAppletの許可設定は独立しています。MCPから明示公開されたAppletコマンドを実行し、そのハンドラーが共通APIを呼ぶ場合、ホストが発行する元callerを維持し、必要な共通許可はAppletとMCPの両方を満たす必要があります。キー送信にもMCP列のsendInput許可を使い、元MCPのコマンド実行許可だけでは実行しません。プロセス起動も両方のrunProcessesを必要とします。どちらもMCPの生の引数指定APIとして直接公開しません。信頼できるローカルAppletを前提とし、Appletプロセス自体をOSサンドボックスにする機能ではありません。

設定編集の個別許可はwriteへ統合します。旧write/allowWriteの値を維持し、旧個別ONでwriteを有効化しません。writeがONなら旧個別OFFによる編集制限は適用しません。旧キーは読込互換だけを残し、次のローカルな許可保存時に整理します。読取りだけでは保存しません。未知キーや型不正は拒否します。許可画面はread/write/execute/useAi/useTts/useMcp/sendInput/runProcessesの8行です。

## プロセス起動

Applet専用操作`processes.start`は、appdock-api capabilityとread／execute／runProcesses許可を必要とします。Node/.NET/nativeは既存の汎用Callを使います。直接モードは絶対パスの.exeと文字列配列のarguments、cmdは1行のcommand、Windows PowerShellはscriptを指定します。任意項目は絶対パスのworkingDirectoryとshowConsole（既定false）です。

```ts
await context.appdock.call('processes.start', {
  mode: 'executable', executable: 'C:\\Tools\\Example.exe', arguments: ['file name.txt']
});
```

返り値は`{completion:'processStarted',effectVerified:false}`。起動受付を表し、終了・出力の取得は待ちません。起動済みプロセスはAppDock終了や許可撤回で強制終了しません。未確認の起動を自動再送しません。保存形式、モード別の引用符・サイズ・寿命は[カスタムコマンド拡張](custom-commands-design.md#共通apiと寿命)を正本とします。

## Windows入力

最低本体版0.26.37、appdock-api capability、sendInput許可が必要です。

```ts
await context.appdock.call('input.sendKeys', { keys: 'Ctrl+Shift+T' });
await context.appdock.call('input.appCommand', { action: 'back' });
```

.NETでは同じ操作名・引数を`context.AppDock.CallAsync`へ渡します。sendKeysは修飾キーと1キーの組、appCommandはback/forward/reloadだけを受け付けます。キー解析は.NET SDKのInputKeyChordに集約します。本体は既存InputHostをフックなしの入力workerとして必要時に起動し、SendInput/WM_APPCOMMANDの処理を共有します。

可視の最前面を対象にし、物理キー解放を最大2秒待ち、途中の対象変更を拒否します。ジェスチャーは開始HWNDと取消情報を維持します。通常経路の再入防止150msを連続ジェスチャーへ課しません。許可取消・Applet停止・ジェスチャー取消で未送信処理を取り消します。送信済み入力を取り消すものではありません。

sendKeysはデスクトップが最前面でも使用でき、Win+EなどのWindows共通キーを送れます。ウィンドウ宛てのappCommandではデスクトップ/Shellの除外を維持します。キー待機中の前面変更はデスクトップでも取消対象です。

Win単独、Pause、PrintScreen（PrtScn）、Period（.）、Semicolon（;）、Slash（/）、Plus、Minus（-）も送信できます。プラス記号は区切りと区別して`Win+Plus`のように指定します。記号は送信直前の対象スレッドのキーボード配列から、必要な仮想キーと修飾キーへ解決します。配列で表せない場合は失敗し、配列やWindowsの設定は変更しません。呼び出し側のショートカット登録文法とは独立しています。

本体0.85.9以降はMediaPlayPause、MediaStop、MediaNextTrack、MediaPrevTrack、VolumeMute、VolumeUp、VolumeDownも送信できます。メディアはWindowsと対応アプリ、音量はWindowsの音声出力へ処理を委ねます。これらは送信キー名の追加であり、ショートカット登録・記録・入力フックの対応キーを追加するものではありません。

成功は`{completion:'inputSubmitted',effectVerified:false}`です。対象アプリの実際の動作成功を保証せず、自動再送しません。対象のアプリによるキー解釈やWindowsの権限制約があります。

Node workerはコマンドごとのAbortSignalを提供し、AsyncLocalStorageでホスト発行executionIdをAPIへ付加します。.NET Runtimeも実行文脈を保持します。本体がApplet/実行寿命/開始対象を照合するので、通信層から任意HWNDを送信先として指定しません。コマンド外の通常呼出しは実行時の最前面を使います。

## SDK

Nodeの`NodeExtensionContext.appdock.call(method, params?)`が結果オブジェクトを返します。失敗時は`AppDockApiError`の`code`と`message`を確認します。

```ts
const current = await context.appdock.call('settings.get');
await context.appdock.call('commands.execute', {
  id: 'appdock.settings.update',
  args: {
    changes: { closeToTray: false },
    expectedRevision: current.revision,
    dryRun: true,
  },
});
```

.NETは`IExtensionContext.AppDock`の`IAppDockService.CallAsync`を使用します。結果は`JsonElement`、失敗は`AppDockApiException.Code`です。SDK/Runtimeは従来のAssemblyVersionを維持し、既存IExtensionContext実装向けに既定のプロパティ実装を備えます。新APIを使うnative Appletは新Runtimeも組み込んで再発行してください。

```csharp
var current = await context.AppDock.CallAsync("settings.get", cancellationToken: token);
await context.AppDock.CallAsync("commands.execute", new {
    id = "appdock.settings.update",
    args = new {
        changes = new { closeToTray = false },
        expectedRevision = current.GetProperty("revision").GetString(),
        dryRun = true
    }
}, token);
```

生のRPCは`host.appdock.call`へ`{method, params}`を渡します。成功は`{ok:true,value}`、失敗は`{ok:false,error:{code,message}}`です。SDKがこの包みを取り外します。未対応ホストや通信断は従来のRPCエラーとなります。タイムアウトや応答消失後は状態を読み直し、変更を自動再送しないでください。

## 再入・起動と互換性

- 共通APIはAppDockの起動完了後に利用できます。activate時点ではNOT_READYとなる場合があるため、起動時の必須処理に依存させず、起動後のコマンド等から呼びます。
- MCP→Appletハンドラー→共通APIの読取り・設定変更・別コマンドの実行を利用できます。独立した要求は同じIDでも並行して受け付けます。ホストが発行する実行IDに呼び出し経路を保持し、同じ経路内で同じコマンドや実行中Appletへ戻る循環をSELF_CALLで拒否します。自分の通常コマンドや自分の有効・無効・再起動もSELF_CALLです。自分の公開設定変更は可能です。Appletの開始・停止など、同一資源の変更に必要な排他は保持します。
- 既存の`context.settings.set`/`Settings.SetAsync`/`host.settings.set`は互換入口を維持します。settings capabilityと自分自身の設定範囲を保ち、非公開/従来の未宣言キーやactivate中の更新に新しい許可を要求しません。
- 互換入口の設定値検証・Applet設定への変更適用をSettingsCommandsへ集約しました。公開設定更新も同じ処理を使用し、同じSettingsStoreのrevisionを進めます。公開APIには引き続き公開フィールド制限・expectedRevision・dryRun・通常の設定保存検証を適用し、互換入口には従来の保存契約を残します。

## 検証

型検査、`tests/appdock-api.test.cjs`と設定/API回帰を使用します。実プロセス試験は先に`dev.bat run build:dotnet`と`dotnet build tests/fixtures/dotnet/AppDock.Extensions.ApiProbe/AppDock.Extensions.ApiProbe.csproj -c Release`を実行してから、`dev.bat node scripts/applet-api-ui-test.cjs`を直列で実行します。引数に発行EXEを渡すと隔離コピーで検証します。旧SDKでコンパイル済みのDemo DLLを`APPDOCK_TEST_LEGACY_DEMO_DLL`へ指定すると旧DLL互換も検査します。fixtureは製品へ同梱しません。

入力は`tests/node-invocation.test.cjs`、InputTests、専用WinForms fixture `tests/fixtures/dotnet/AppDock.InputTarget`をReleaseビルド後の`scripts/native-input-ui-test.cjs`で検証します。後者は2Appletのpublish出力を隔離profileへコピーし、全11操作・.NET呼出し・許可取消・MCP経由の明示コマンド・対象変更・取消・連続ジェスチャーを確認します。GUIは直列で実行し、引数のEXEはwin-unpacked版を使用します。

## 操作許可の画面

ApiPermissionsSettingsで操作行とApplet/MCPの列を並べ、狭幅では操作ごとの2列表示に切り替えます。MCP情報取得は連携中許可の固定表示、入力は直接公開なしの固定表示です。許可のON/OFFは保存値を表示し、不足する前提や連携停止を補足します。連携OFF/前提未充足でも許可の準備・取消を可能にし、他の許可を自動変更しません。接続・登録はCodexSettingsに残し相互リンクします。

従来のPC専用APIで即時保存し、共有settings.jsonのrevisionとは独立します。この画面にはJSON切替を出しません。共有設定も即時保存し、全体保存ツールバーはありません。回帰はscripts/applet-api-ui-test.cjsとscripts/automation-ui-test.cjsです。

## WebAppletの操作

登録したWebAppletを対象に、同じsettings.getSchema/settings.get/commands.list/commands.executeを使います。Node/.NET SDKとMCPの双方で利用できます。設定とコマンドの公開宣言はWebApplet提供元に置き、通信層に専用入口は追加しません。公開する範囲・引数例・表示先の優先順位は[WebApplet公開操作](web-applets.md)を参照してください。Webページ自身へのホストAPI注入は行いません。

## 描画モデルAPI

`ui.ribbon.get`、`ui.assets.get`、`ui.actions.invoke`を共通操作カタログへ追加。既存の編集用`ribbon.get`とは独立する。モデル・操作ID・MCP公開範囲・Shell roleは[Shell API](shell-api.md)を参照。

## TTS読み上げ

最低ホスト版0.35.0。tts.speak / tts.voices.list / tts.jobs.get / tts.stopをAppletとMCPへ公開します。Appletはappdock-api capability、両入口はそれぞれのuseTts許可を使います。受付・状態・所有者・停止・重複判定とNode/.NET例は[TTS連携](tts-design.md#共通api)を参照してください。

## AI文章生成

最低ホスト版0.37.0。ai.text.generate / ai.jobs.get / ai.jobs.cancel / ai.models.listをAppletとMCPへ公開します。本体の共通プロンプトと接続設定を使い、呼出しでモデル・追加プロンプト・入力を指定できます。Applet/MCPのuseAiは独立したPC専用許可で、新規環境はApplet側がON、MCP側がOFFです。入力と結果・保存・期限・例は[AI共通API](ai.md)を参照してください。

## タッチパッドジェスチャー

touchpadGestures.getはreadで取得できます。commands.executeのappdock.touchpadGestures.update / set-enabled / reconnect / clearにはread・execute・write・editTouchpadGesturesが必要です。専用許可はApplet/MCPで独立し、既定falseです。updateはAppDockの設定だけを保存し、Windows変更にはset-enabledまたはreconnectを明示的に呼びます。全変更にexpectedRevisionと任意dryRunを使います。shortcuts.getのownedBindingsは読取専用で、通常bindings編集・削除の対象外です。

詳細は[タッチパッドとWindowsの接続仕様](touchpad-gestures-design.md)を参照してください。
