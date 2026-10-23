# AppletのためにAppDockへ機能を追加する

新しい公開操作は[AppDock共通操作API](appdock-api.md)へ実装し、MCPとAppletから同じ処理を使います。操作カタログを共有し、通信アダプターへ機能の処理を複製しません。

共通操作API・MCP・Codex登録は[専用仕様](automation.md)を参照してください。Applet向けJSON-RPCとは別の入口です。

外部コマンド公開は各Appletのmanifest宣言を使います。ホストへApplet固有IDの許可一覧を追加せず、runtimeの登録と宣言を照合して、実行権限・稼働状態・監査ログを共通管理します。[公開宣言](automation.md#appletによる公開宣言)を参照してください。

ホスト画面のdock:* IPC操作失敗は共通handleでerrorログに記録する。同期throwと非同期rejectの両方を捕捉して元のエラーを返し、ログページとPC専用host.logへ操作名・エラーメッセージを残す。IPCの引数（設定・認証値・入力内容）は追加しない。送信元/Frame/URL検証はcallback呼び出し前に維持する。

認証・Storage・Secrets・生成キャッシュはPC専用のLOCALAPPDATA、登録素材と共有枠はEXE隣に分離します。保存領域と設定受信の正本は[設定同期](settings-sync.md)です。

一般設定のスタートアップ登録と管理者起動は[起動設定](launch-settings.md)を参照してください。ホスト・UIの共有設定とWindowsタスクの保存処理、UACを伴う再起動をこの仕様で管理します。

現在のコードを基準に、どの層へ変更を入れるかと検証方法をまとめます。Appletを作り始める手順は[Applet実装ガイド](applet-development.md)、通信契約は[Applet API](extensions.md)を参照してください。

条件付きショートカットの現行設計は[保存形式・入力判定・逐次実行](keybindings.md)を参照してください。

## まず変更範囲を決める

Webアカウント設定連携はhost-apiのサービス経由で自身の宣言済みboolean/静的selectだけを公開し、WebAccountControllerがローカルUIの送信元を検証します。既存SettingsStoreの保存・変更通知を再利用し、停止時に購読を解除します。APIの詳細は[WebアカウントAPI](web-accounts.md)を参照してください。

Applet名の画面表示にはsnapshotの`displayName`を使用します。manifestの任意の`displayName`を優先し、省略時は`src/shared/applet-display-name.ts`で`name`の先頭の`Applet.`を除去します。元の`name`と`id`を識別・保存に使う契約は維持し、検索には表示名・元の名前・IDを含めます。manifestの検証、snapshot、renderer、トレイ、ログを一緒に整合させてください。

ホストのビルトインコマンドは`src/shared/commands.ts`の`hostCommands`へ登録し、`src/main/index.ts`の`executeCommand`で実行します。`appdock.restart` / `appdock.quit`はウィンドウを表示せず`quitHost`へ渡し、既存の`before-quit`でキー登録・Applet・設定監視・トレイを終了します。再起動予約は一度だけ行い、portable版は`PORTABLE_EXECUTABLE_FILE`を再起動先として、作業ディレクトリも元のEXEの隣へ移します。開発版はElectronの既定の起動引数を維持します。`dev.bat run test:host-commands`で実プロセスの再起動と終了、保存済み設定、Appletのdeactivateを確認できます。引数に配布EXEを指定するとportable版も検証します。

設定項目の追加だけなら、Appletのmanifestと設定読み取りを追加します。boolean / number / string / select、説明、範囲、動的選択肢はすでに対応しています。コマンド・ピン・ショートカットも登録から利用できます。

機能固有の時計描画、画像処理、WindowsフックなどはAppletへ置きます。複数Appletで共有したい操作、ホストの保存・通知・アカウント管理、ユーザー向けの共通画面はHost APIやReact UIを拡張します。Appletのために任意のElectron APIやファイル操作をrendererへ公開しません。

[WebアカウントAPI](web-accounts.md)では、ホストがWebContentsView・独立永続セッション・限定IPC・停止時の破棄を管理します。Gmailのセレクターと新着判定はApplet側です。Node APIは`webAccounts.start/open/read/report`で、.NET SDKのラッパーは提供していません。`report`の一時UIデータと、信頼済みローカルUIの`viewport`による表示領域変更・非表示を追加しています。

アカウントのcycle、限定UIのitemOpener、枠別soundの保存/選択/試聴は[WebアカウントAPI](web-accounts.md)に従います。UI/WebContentsのショートカットは本体の共通処理へ渡し、manifestの初期割当と利用者の編集を保持します。操作Windowの位置・サイズ/最大化はWindowStateStoreで保存します。境界/ライフサイクル回帰とGmailのtest-ui-features.cjsを併用し、音は無音WAVで実プレーヤーまで確認します。

| 追加したいもの | 主な変更先 |
| --- | --- |
| Applet向けHost API | `src/main/core/host-api.ts` → .NET SDK/Runtime・Node SDK |
| 新しいmanifest／設定の種類 | `src/shared/contracts.ts`、`src/shared/setting-definitions.ts`、`src/main/core/extensions.ts`、renderer |
| 永続的なホスト設定 | `src/shared/contracts.ts`、`src/shared/settings-schema.ts`、`src/main/core/settings.ts`、設定フォーム・設定例 |
| Reactからの操作 | `DockApi` → `src/main/preload.ts` → `src/main/index.ts`のIPC → renderer |
| 表示する状態・パネル | 共有型、Host APIの検証、ExtensionSnapshot／HostSnapshot、renderer |
| 新しいプロセス／ライフサイクル | `src/main/core/extensions.ts`、各ランナー、ビルド・package.json・停止テスト |

## Host APIを追加する手順

1. **入出力と失敗条件を先に決める。** `host.<機能>.<操作>`、JSONで送れる引数、戻り値、必要なcapability、サイズ上限、キャンセルと停止時の挙動を[API仕様](extensions.md)へ記述します。通常のRPCは15秒以内です。長時間の処理は開始と状態確認に分け、UIを待たせ続けない設計にします。
2. **mainで入力を検証する。** [createHostApi](../src/main/core/host-api.ts)のswitchへ処理を追加します。`ExtensionInstance`から呼出元IDを取得し、引数の任意IDを信用して他Appletの設定・秘密領域へ書き込みません。型・範囲・URL・パス・キー・capabilityを処理前に確認します。rendererやSDKの型だけでは実行時の検証になりません。
3. **保存と表示更新をつなぐ。** 設定はSettingsStore経由で更新し、全JSONの独自書き込みを避けます。状態をメモリへ追加した場合はsnapshotへ含め、`changed()`またはmanagerのchangedイベントでrendererへ通知します。既存の変更通知はまとめて送られます。React側では更新が届くまで待つ必要があります。
4. **SDKへ公開する。** .NETは[Contracts.cs](../dotnet/AppDock.SDK/Contracts.cs)のインターフェースと型、[ExtensionContext](../dotnet/AppDock.Runtime/ExtensionContext.cs)の実装を対応させます。Nodeは[NodeExtensionContext](../src/main/node-worker.ts)とactivate時に渡すcontextの実装を対応させます。片方だけ対応する場合はAPI仕様に明記し、未対応なのに型だけ存在する状態を避けます。
5. **購読やリソースの寿命を定める。** 解除用IDisposable／関数を返し、deactivateと通信断で解除します。.NETのコマンド／設定変更を直列化する `commandLock`を保持したまま、同じロックを再取得する処理を呼ばないようにします。ホストへ要求するだけなら別方向のRPCで返答を処理できますが、逆方向の処理完了を相互に待つ循環を作らないでください。
6. **互換性を記録する。** 既存ID・メソッド名・設定名は維持します。新APIを使うAppletの開発文書（`docs/usage.md`など）には必要なAppDockバージョンを記載します。manifestの`minimumHostVersion`で起動前に最小ホストバージョンを確認します。配布時にも必要バージョンを明記してください。APIの能力交渉はありません。

新APIがAppletプロセスからだけ使われる場合、preload/renderer IPCへの追加は不要です。Applet通信とReact用IPCは別の境界です。

時計で追加した `host.settings.options` が、この手順の具体例です。C#の `SettingOption(Label, Value)` は共通のJSON設定でcamelCaseへ変換され、Nodeと同じ `{label, value}` を送ります。mainはsettings capability、宣言済みのdynamic select、重複・長さ・件数を検証してから `ExtensionInstance.settingOptions` を更新し、変更通知を送ります。Reactはsnapshotの候補を使い、保存された未接続の値も別optionとして保持します。候補の更新ではsettings.jsonを書き換えません。

## React UIとIPCを追加する手順

Webアカウント管理は`web-accounts.ts`の原子的な配列保存と`web-account-preload.ts`の限定IPCを使います。moveはselected/UUIDを変更せず、setMonitoringは遅いworker reportも抑制します。monitoringResetsはreadで一度だけ渡します。`web-account-avatar.ts`はURLとストリーム上限を検証し、Controllerが当該アカウントのsession/credentials:includeのnet.requestとnativeImageの64px変換を行います。取得/再試行/破棄の寿命をControllerに閉じ、画像バイトはUI snapshotだけへ渡します。Gmailのtest-accounts.cjsはオフラインの画像/2アカウントで並べ替え・個別監視・設定保持・表示を確認します。

window-rendering.tsはapp.readyより前にWindowsのNativeWinOcclusionを無効にし、既存feature引数を保持します。web-page-activity.tsはkeepActiveのobserveOriginでobserver.readyを待ち、背景のアクティブ状態を30秒ごとに更新します。native focus中はエミュレーションを解除します。同一文書の移動では状態を保ち、別文書のメインフレーム遷移/破棄・認証originで周期/250ms待機/接続を解除します。別Debugger/DevToolsへ干渉せず、URLや認証値をログに出しません。Gmailのtest-native-background/probe-native-startupは通常のElectron起動を使い、DOM準備後に受信処理が遅れて始まる条件も検証します。Playwrightの自動focus emulationを背景更新の証拠として使わないでください。

更新の設定と表示・通知は[更新ガイド](updates.md)を参照してください。保存フォームと表示専用の実行環境情報を区別します。

ユーザーがAppDock画面から操作する機能だけを対象にします。

Applet管理一覧は本体renderer、設定カテゴリ・設定用Applet一覧・横断検索も本体rendererが描画します。設定本文はSettingsPageSessionが選択ページだけを投影し、SettingsInputSessionへ編集を送ります。本体のサイドバーや非表示の設定本文を重複mountしません。ショートカット等の共用コントロールはsrc/renderer/settings-uiに置き、依存を注入して本体の各画面で利用します。

1. [共有契約](../src/shared/contracts.ts)へ表示データや `DockApi`メソッドを追加します。秘密情報・プロセス内部オブジェクト・任意コードは渡しません。
2. [preload](../src/main/preload.ts)に、固定したIPCメソッドの橋渡しを追加します。任意のチャンネルや任意のElectron操作を呼べる汎用口は作りません。
3. [mainのregisterIpc](../src/main/index.ts)の既存handleラッパーで受けます。送信元webContents・mainFrame・`appdock://host/index.html`の確認を維持し、引数も実行時に検証します。
4. [React](../src/renderer/main.tsx)で読み込み・操作・保存・エラーを実装します。設定入力は保存済み値とrevisionを使い、他の変更が起きた際の古い内容による上書き拒否、画像の保存／復元処理を保ちます。
5. 購読はunmount時に解除し、UIテストでは通知の到着まで待ちます。Applet名・項目名・単位・説明を表示し、ユーザーが判断に使わない通信名やプロセス情報を設定画面へ出しません。

`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、CSP、外部navigationの禁止を維持します。Appletから提供するパネルはReactでテキストとして描画し、生HTMLやスクリプトを受けません。

メイン画面の`BrowserWindow`は、`webPreferences.spellcheck: false`でElectron内蔵スペルチェックを無効にします。画面作成前に共有セッションも`session.defaultSession.setSpellCheckerEnabled(false)`で無効にします（[Electron Session API](https://www.electronjs.org/docs/latest/api/session#sessetspellcheckerenabledenable)）。新しい入力欄にも共通で適用されるため、フォームごとの指定や設定JSONの項目追加は不要です。

## 設定スキーマと保存を変更する場合

- ホストの永続設定は `Settings`、`createDefaultSettings`、`parseSettings`、設定フォーム、[settings.example.json](../settings.example.json)を一緒に更新します。古いsettings.jsonに項目がない場合の既定値を用意し、実利用の設定ファイルをビルド時に変更しません。
- Appletの設定定義を増やす場合は `SettingDefinition`、`parseSettingDefinitions`、`validateSettingValue`、rendererの入力部を揃えます。main側IPCとHost API双方で同じ検証を使い、拒否された保存で既存値を失わないことを確認します。
- manifestの既定値とSDK読み取り時のfallbackを一致させます。手動JSON編集は汎用スキーマで読み込み、個別Appletの範囲を自動的にすべて検査するわけではありません。Applet側の補正も必要です。
- 動的selectの選択肢はExtensionInstance／snapshotのメモリ上で管理し、設定JSONへ候補一覧を毎回保存しません。現在ない選択値も保持し、代替動作はAppletへ任せます。
- SettingsStoreの原子的保存、revision確認、ファイル監視を利用します。秘密情報はSecrets、処理データはStorageへ分けます。
- 既存の内部名 `extensions` / `extension.json` / `IAppDockExtension`は画面の呼称Appletと区別して維持します。表示名を揃えるためだけに保存形式を変更しません。

## 検証と成果物を更新する

更新確認・進捗・完了は共通ステータスバー通知で表示します。寿命と実Window可視状態の契約は[更新ガイド](updates.md#設定と取得)に従います。

Node.jsとpnpmのグローバルインストールは不要です。プロジェクトの `setup-tools.bat` で `.tools` に準備し、下記のpnpmコマンドは `dev.bat` 経由で実行できます。直接のNodeコマンドは `dev.bat exec node ...` を使います。バージョンは `toolchain.json` で指定します。

グローバルホットキーは `src/main/core/global-hotkeys.ts` が設定とAppletの稼働状態に追従し、同梱.NETホストの `--hotkeys` モードがWindowsのRegisterHotKey / WM_HOTKEYを扱います。PauseはElectronのaccelerator対象外のため、Windows登録に統一しています。キー記録中は一時解除し、設定画面に登録結果・競合理由・再試行ボタンを表示します。`pnpm run test:hotkeys` で専用profileの時計Appletを使い、Windows入力、競合、再割り当て、停止と終了時の解除を確認します。先に元WatchなどのPause登録を解除してください。

変更に合う検証だけを選び、通ったものと未検証事項を記録します。

Windows portable起動用EXEの`FileDescription`は、electron-builderが`package.json`の`description`から生成します。タスクマネージャーの表示名を本体とそろえるため、この値は`productName`と同じ`AppDock.at365`を維持します。発行後はportable起動用EXEと`win-unpacked`内の本体の両方で`FileDescription`を確認してください。起動用EXEは32ビット、本体は64ビットです。

| 変更箇所 | 確認するもの |
| --- | --- |
| 型・React・main | `pnpm run typecheck` / `pnpm run build` |
| SDK・Runtime | `pnpm run build:dotnet`、該当Appletの再ビルド。SDKとRuntimeを参照するnative EXEも再publish |
| 設定・RPC・ライフサイクル | `pnpm test`。[core](../tests/core.test.cjs)、[lifecycle](../tests/lifecycle.test.cjs)、[Applet設定](../tests/applet-settings.test.cjs)の該当箇所 |
| UI・保存・コマンド | `pnpm run test:ui` / `pnpm run test:preferences`、該当AppletのUIテスト |
| 配布・依存ランタイム | `pnpm run dist`、完成EXEを別テストフォルダーへコピーしたsmoke |

API追加のテストは、正常系に加え、capability不足、不正型／範囲、他Applet領域への指定、停止後の要求、保存失敗を変更内容に応じて確認します。プロセス関連は無効化・再起動・ホスト終了・異常終了と、他Appletが継続することを確認します。Nodeと.NETに共通APIを足した場合は双方の実プロセスで往復させます。

`pnpm run dist`はDLLランナーのRuntime/SDKを含めてpublishします。外部native Appletの再publishは行わないため、そのAppletの発行も必要です。開発版の成功を完成EXEの成功と扱わず、次の組み合わせで確認します:

```powershell
# AppDockルートで
node scripts/smoke.cjs A:/40.ARTIFACT/AppDock.at365/AppDock.at365.exe
# 時計Appletも接続する検証
node scripts/smoke.cjs A:/40.ARTIFACT/AppDock.at365/AppDock.at365.exe ../../40.ARTIFACT/Applet.Watch.at365/Applet.Watch.at365
# Applet.Watch.at365ルートで、ビルド済みホストのUIを検証
node scripts/test-ui.cjs ../../40.ARTIFACT/AppDock.at365/win-unpacked/AppDock.at365.exe
```

テスト設定は専用profileへ保存します。設定保存を検証するために実利用のsettings.jsonを触らず、フック・壁紙・ロック等のOS全体に作用する処理は、そのテストに必要な範囲だけ扱います。時計のGUIテストが別AppletのOS動作まで検証するわけではありません。

Windows SDKへのアクセス制限がある環境はビルド未確認として扱い、許可された実行環境で再確認します。実行中EXEの書き込みロックがあれば、その配置先を通常終了するか別出力先を使います。無関係な既存アプリを止めません。

完成後は[ドキュメント方針](documentation.md)に従い、READMEにはインストール方法とビルド方法だけを記載します。必要なホストバージョンと配布ファイルの詳細はdocs/usage.mdへ、開発・検証の手順はDEVELOPMENTまたはこのガイドへ、実機条件と限界・結果・成果物のVersion／SHA256はVERIFICATIONへ記録します。Gitではsourceとdocsを管理し、publish・.artifacts・設定・秘密情報は除外します。

## 宣言コマンドと構造化フォームの検証

ロード前コマンドは`parseDeclaredCommands` / `ExtensionManager.commandCatalog`で検証・公開します。通常のruntimeコマンドを優先し、起動可能な宣言だけ明示実行で有効化・即時起動します。互換性チェックと起動キューを共有し、遅延タイマーを取り消します。旧IDの別名は保存されたホットキーを維持し、新規候補に重複表示しません。

構造化フォームは`ObjectListSetting`と共有の`object-list`変換・設定検証で扱います。旧JSON・Folder・数値enum、モニター別Padding、未知のデータの保持を回帰確認します。フォルダー選択は既存のIPC呼び出し元検証を通します。

履歴専用操作は一般コマンドとは独立した`panel.action`です。現在のパネル（actions / tabs / images）にあるIDだけ許可します。ローカル画像は`panel-images.ts`で実パスの包含を確認し、CSPを緩めず`appdock://host/panel-images`で配信します。ホスト管理外のファイルや外部画像URLは受け付けません。

[panel-imagesのテスト](../tests/panel-images.test.cjs)は大きなローカル画像・キャッシュ外拒否・古いボタン拒否を確認します。[ライフサイクル](../tests/lifecycle.test.cjs)はロード前宣言・旧ID・同時開始・互換性・遅延解除を確認します。SDKの既存コンストラクターを維持し、利用するAPIの最低ホスト版をmanifestへ指定します。

## トレイコマンドとメニュー

トレイの正本は[タスクトレイの設定とメニュー](tray-menu.md)。設定/終了はホストが末尾固定し、一時停止/再開は通常の本体コマンドです。クリック判定は下記に従います。

## 描画設定

`host.hardwareAcceleration`はboolean、既定true。単一インスタンスのロック取得後、`app.whenReady()`より前に同じ`SettingsStore`で設定を読み込み、falseの場合だけ`app.disableHardwareAcceleration()`を呼びます。不正な設定は既存のエラー表示で起動を中止し、ファイルを保持します。設定保存・外部編集による変更は次の完全起動で適用し、実行中のGPUプロセスへ変更を加えません。

一般設定の説明には完全終了・再起動が必要なことを表示します。GPU情報取得後の`app.isHardwareAccelerationEnabled()`とOFF時の`getGPUFeatureStatus().gpu_compositing`を確認します。Applet APIとSDKは変更しません。

## クリック判定

`host.trayDoubleClickCommand`はコマンドIDまたはnull、既定null。`TrayClickDispatcher`がWindowsのclick→double-click通知で後者が来たときに前者の待機を取り消します。未設定時は即時実行。設定変更・メニュー表示・終了では待機を取り消し、非同期の判定時間取得が後から完了しても復活させません。

ダブル割り当て時だけ.NETホストの`--double-click-time`で`GetDoubleClickTime`を取得します。設定変更を毎クリックで読み、Windows自体の設定は変更しません。取得中の時間を差し引き、通知の順序競合を避ける25msの余裕を加えます。取得失敗はwarnログに記録し、Windowsの既定判定時間500msを使います。`DEFAULT_DOUBLE_CLICK_TIME_MS`をログ側と`TrayClickDispatcher`側で共有し、待機には同じ25msの余裕を加えます。SDK/Runtime/Applet APIは変更しません。

[クリック回帰](../tests/tray-clicks.test.cjs)は即時実行、単クリック待機、ダブル時の単クリック取消、取得完了前の取消、複数単クリック、メニュー・設定・終了の取消、取得失敗を確認します。[トレイUIテスト](../scripts/tray-commands-ui-test.cjs)は実Trayイベント、別コマンドの実行と重複抑止、Windows時間取得、再起動後の保持を確認します。

Webアカウントの仮名とtemporaryNameフラグを保存し、観測accountNameで仮名だけを一度変更します。cycleはアクティブな操作Windowの選択中WebContentsに入力フォーカスがある場合だけ、新しいViewへ引き継ぎます。別Window・ローカル入力欄・非表示/最小化にはフォーカスを移しません。

portableランチャーは更新間で実行パスを固定し、tray-identity.tsのUUID v5と併せてWindowsの通知領域の識別を維持します。ビルドはbuild-portable.cjsを経由し、使用中の資産を削除しないkernel lease/gateをportable.nsiで扱います。内部のビルダー連携と再起動/二重起動/設定保持試験は[開発ガイド](../DEVELOPMENT.md)を参照してください。タスクバーのAppUserModelId/元EXEの再起動先とは別の仕組みです。

名前付きmutexは[CreateMutexExW](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-createmutexexw)で必要な権限だけ要求します。GateはSYNCHRONIZE | MUTEX_MODIFY_STATE、Runtime leaseはSYNCHRONIZEです。CreateMutexWの暗黙のMUTEX_ALL_ACCESSは管理者起動済みホストへ通常権限の通知起動が合流すると拒否されるため使いません。既定DACL、mutex名、待機/解放、DuplicateHandle、最終lease回収は変更しません。ACL緩和や通知クリックによる追加のUAC昇格を行いません。

## Node Appletのファイル選択と音声

- `node-worker.ts`: `ui.pickFile`、`audio.play`、`tray.attention`、通知オプションを追加。ファイル選択だけRPC期限を5分に拡張。
- `core/host-api.ts`: capabilityと引数を検証。通知クリックは所有Appletと起動世代を照合。
- `core/sounds.ts`: 上限付き順次再生。RIFF/WAVE確認、sandbox有効の短命な非表示renderer、停止・再起動時の中止。
- `core/extensions.ts` / `index.ts`: 各Appletのattentionを集約し、共通トレイの印とツールチップへ反映。停止・異常終了時は解除。
- `renderer/main.tsx`: タブのアクセシビリティ名をモニター専用から一般パネル向けに変更。

既存API v1/.NET Appletとの互換を維持します。ホスト回帰は`tests/notification-services.test.cjs`、現在の実Electron/Nodeの統合検証は[Gmailの検証スクリプト](../../Applet.Gmail.at365/scripts/test-gui.cjs)を参照してください。

## Appletページとリボン

契約・検証手順は[Appletページとリボン](applet-pages.md)。shared/applet-pages.tsがmanifestとリボンID、settings-schema.tsが互換性と保存検証、core/applet-pages.tsが移動可能なUI Viewと表示先、src/renderer/settings/RibbonSettings.tsxが即時保存する入力を担当します。WebアカウントIPCはUIのWebContentsに結び付け、本体ページの領域・overlay・最小化/背景parkを独立して扱います。

リボンを上寄せ/下寄せの2グループとして描画し、共有settings-schemaでseparator登録と参照を検証します。現行の導線は下記の設定パネルと表示順の仕様に従います。

WebアカウントのNode navigateコマンドと、外部リンク確認を自身のboolean設定へ保存するexternalLinkSettingは、[WebアカウントAPI](web-accounts.md)を参照してください。

## Applet設定パネルの共用

全体設定とApplet詳細は同じSettingsPageSession/本体SettingsPage本文を使う。保存済みSettingsStoreが正本となり、SettingsInputSessionはページ・モード・操作受付だけを担当する。フォーム/JSONの不完全入力や保存失敗値は現在のUIだけに保持する。全体保存/破棄・共有ドラフト・未保存警告・draft-avatarを撤去した。

SettingsPageModel schemaVersion:2は本体内部の投影契約とし、DockApi.settingsPageを使う。旧page.settingsのShell宣言と保存指定は読込可能だが描画には使用しない。部分JSON・入力キュー・外部競合・検索は[設定基盤](settings-foundation.md)を正本とする。scripts/settings-shell-ui-test.cjs [固定EXE]は本体設定の即時保存・IME・画像・失敗/競合・入力flush・復元を確認する。

## Appletの表示順

- `shared/applet-order.ts`は保存ID順に既存Appletを並べ、未登録の新規Appletは発見順で末尾へ置きます。不在IDを表示せず、新しい並べ替えでもそのIDは保存配列に保持します。WebAppletも同じ一覧に含みます。既存JSONのappletOrder未指定は空配列で補い、重複・不正ID・500件超を拒否します。
- 設定の`AppletManagementSettings.tsx`から共通`SettingsOrderDialog`を開き、ドラッグ・上下ボタン・上下キーで並べ替え、OKで保存します。管理対象はWebApplet本体を含む外部パッケージで、collectionの子と不在IDの保存位置を保ちます。revision競合・保存失敗時は保存済み値を維持してエラーを表示します。
- rendererのApplet一覧・対象Applet候補に同じ順を使います。ショートカットのコマンド一覧はカタログ順で独立し、一覧内に実行順操作を置きません。専用ShortcutOrderDialogは全カタログを受け取り、提供元をまたいで同じキー内の順番を変更します。Applet表示順で実行順・起動順・ribbon.orderを変更しません。
- 検証は`tests/applet-order.test.cjs`、`scripts/applet-order-ui-test.cjs`と既存navigation/default-shortcuts/WebApplet UI試験で行います。

## コマンドパレットの共用

コマンド検索とトレイの選択パレットは本体のCommandPaletteSessionとDefault Shellの描画を共用します。表示・取消・フォーカス・復旧は[共通オーバーレイ](shell-overlays.md)に従い、本体rendererへパレットを追加しません。

## 割り当て操作UIの共用

設定ページとApplet詳細はShortcutCommandListの2列一覧とAppletShortcutDialogの入力を共用します。設定ページだけが検索/状態フィルター/提供元表示/登録エラー・再試行を持ち、Applet詳細は提供元の定義順を維持します。追加/変更/削除はuseSettingsEditorから即時保存し、JSON/revision/saveは複製しません。検索で行が消えてもdialogの一時入力や一覧のfocus復帰を管理します。

設定ジェスチャーも全コマンド一覧へ統一し、CommandBindingToolbar/CommandBindingList/BindingEditDialog/BindingOrderDialogを共用します。ShortcutCommandList/ShortcutOrderDialogはキー用、GesturesEditor/GestureOrderDialogはジェスチャー用の保存処理と表示を渡します。AppletShortcutDialogとGestureBindingDialogは入力と条件を構成し、キー記録はShortcutCaptureFieldを共用します。両方のメニューは編集・同入力の実行順・即時削除（confirmDelete=false）。表外portalの位置補正・外側クリック/スクロール/Escape・キーボード移動を維持します。条件の差異と全体設定は[ジェスチャー仕様](gestures.md#コマンド一覧と編集パネル)を参照してください。

詳細は[条件付きショートカット](keybindings.md#編集画面と表示順)、[ジェスチャー](gestures.md)。専用GUIはscripts/shortcuts-ui-test.cjs、即時保存/画面遷移はscripts/navigation-ui-test.cjsを参照してください。

### 設定インデックスと項目移動

設定本文内のAppletローカル検索は両入口から除去した。横断検索は本文外の左インデックスに置く。詳細側へ検索入口を追加する場合も、設定本文の枠外に置き、別の検索・下書き管理を作らない。

hostSettingsPagesとhostSettingItemの静的ラベル・説明、Applet宣言をカタログと専用フォームで共有する。設定キーのaliasesは従来の保存互換キーのまま検索語にも使い、動的候補・現在値を索引に入れない。複合一覧はブロック単位、object-listの静的フィールドは親項目へ移動する。
