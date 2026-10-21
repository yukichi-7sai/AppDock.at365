# 共通操作APIとCodex連携

MCPハブは`appdock_mcp_list_servers/list_tools/get_tool/call_tool/get_job/cancel_job`の固定6入口を追加します。接続先→そのツール概要→必要なSchemaの順に取得し、call_toolで受付けたjobIdをget_jobで確認します。下流content（画像等）はMCPのcontentへ、ジョブ状態とstructuredContent/isErrorは構造化結果へ返します。[中継契約](mcp-hub-relay-design.md)と[保存型コマンド](mcp-command-design.md)を参照してください。初回の入口反映と、導入後のデータ増減は別です。

接続先管理には`appdock_mcp_get_server_settings`、`appdock_mcp_update_server_settings`、`appdock_mcp_inspect_server_tools`の固定3入口があります。独立した初期OFFの管理許可で、登録・編集・削除と公開前のツール確認を扱います。保存には設定変更・コマンド実行、未公開ツールの確認にはMCP利用・コマンド実行の許可も必要です。[管理APIの契約](mcp-client-design.md#接続先の管理api)を参照してください。

保存型カスタムコマンドの管理は固定の4つの読取り入口と`appdock.customCommands.update`を使用します。[カスタムコマンド契約](custom-commands-design.md#共通apiとmcpの固定入口)を参照してください。初回のツール定義反映後、種類や定義の増減でMCPのtools/listは変化しません。管理許可は既存の実行・設定変更許可と独立し、定義のconfigを閲覧できる許可です。保存成功、handlerReturned、effectVerified:falseを区別します。

Appletも同じ操作APIを使用します。[Applet向け接続・許可・SDK](appdock-api.md)を参照してください。操作実装とカタログを共有し、Codex連携の許可とは独立しています。

本体に共通操作APIとHTTP MCPを持ちます。初期の接続範囲はこのPCのみで、IPv4のネットワーク接続も選べます。利用者の手順は[Codex連携の操作説明](usage.md#codex連携)、設定保存は[設定同期](settings-sync.md)を参照してください。App Serverによる会話UIとCLIは未実装です。

LAN・tailnet向けの接続範囲切替、HTTP検査、保存と切替の寿命は[ネットワーク接続の設計](mcp-network-access-design.md)にまとめています。

## 構成

- `src/main/core/appdock-api.ts`と`src/shared/appdock-api.ts`: 通信に依存しない操作、公開カタログ、実行権限、引数、受付状態。`automation-api.ts`は既存呼出元向けの再export。
- `settings-commands.ts`: 設定宣言から読取りschema/更新コマンドを構築し、型検証・revision・保存を共通化。
- `applet-management.ts`: Applet管理の自動生成コマンド、永続化、状態確認、ローカル/MCP共通の同時操作ガード。
- `shortcut-commands.ts`: ショートカットの限定読取り、操作列の検証・原子的保存。共有keybindingsとSettingsCommandsのrevisionを使用。
- `tray-editing-commands.ts`: メニューとクリック割当をまとめて検証・保存。既存tray-menu/クリック判定/SettingsCommandsのrevisionを使用。
- `ribbon-commands.ts`: リボンの公開項目・配置の読取りと原子的編集。共有parseRibbonとSettingsCommandsのrevisionを使用。
- `gesture-commands.ts`: ジェスチャーの読取り、割当操作・動作設定の一括検証と保存。共有gesturesとSettingsCommandsのrevisionを使用。
- `src/shared/settings-commands.ts`: 本体の公開設定定義とboolean派生コマンドの生成。
- `automation-mcp.ts`: 従来方式は公式MCP TypeScript SDKによるstateless Streamable HTTP。`mcp-modern.ts`でMCP 2.0（2026-07-28）も同じendpointへ接続します。JSON応答、GET/DELETEは405。1要求64KiB、同時8要求、要求受信10秒・socket無通信60秒。API呼出しの監査ログを既存HostLogへ渡します。
- `automation-commands.ts`: 提供元の公開宣言を共通の条件で照合し、Applet情報を限定投影。
- `automation.ts`: PC専用設定、暗号化、起動/停止、登録状態、接続テスト。
- `codex-registration.ts`: smol-tomlで構文・意味を検証した限定範囲の編集。既存ファイル全体を再シリアライズしません。
- `CodexSettings.tsx`: 設定内の専用ページ。PC専用操作を即時反映します。共有設定も即時保存し、全体保存バーはありません。

`dock:automation` IPCは本体Window/mainFrame/URL検査を通し、WebAppletやAppletページへ公開しません。本体のprepareSettings/commitSettingsを共有して保存します。APIからWindows起動登録・UACを呼びません。

MCP 2.0の`server/discover`と`events/list`/`events/subscribe`/`events/unsubscribe`は[通知イベント設計](mcp-events-design.md)を参照してください。`apiVersion: 2`はAppDock操作APIの版であり、MCPのprotocolVersionとは別です。イベント用の購読と送信待ちはPC専用の暗号化`automation-events.json`へ保存し、既存のtokenを認証主体として扱います。

## API v2

| 内部メソッド | MCPツール | 引数と結果 |
| --- | --- | --- |
| system.getInfo | appdock_get_info | 引数なし。apiVersion/version/instanceId/methods/writable/executable |
| applets.list | appdock_list_applets | 引数なし。applets配列（id/name/version/state/enabled） |
| settings.getSchema | appdock_get_settings_schema | 任意appletId。fields/scope/appletId/writable。省略時は本体 |
| settings.get | appdock_get_settings | 任意appletId。values/revision/warning。省略時は本体 |
| applets.get | appdock_get_applet | id。applet（基本情報/description/runtime/errorSummary）と公開commands/executable/writable |
| commands.list | appdock_list_commands | 引数なし。commands/executable |
| commands.execute | appdock_execute_command | id/任意args。id/completion/effectVerified=falseと操作結果 |
| shortcuts.get | appdock_get_shortcuts | 引数なし。bindings/revision/scopes/assignableCommands/globalHotKeys/warning/各許可。 |
| tray.get | appdock_get_tray | 引数なし。menu/clicks/fixedCommands/assignableCommands/revision/warning/各許可。 |
| ribbon.get | appdock_get_ribbon | 引数なし。layout/items/retainedIds/revision/warning/各許可。 |
| gestures.get | appdock_get_gestures | 引数なし。settings/bindings/revision/gestureTypes/scopes/assignableCommands/warning/各許可。 |
| ui.ribbon.get | appdock_get_ribbon_view | 任意contextId。リボンの表示モデル・epoch・revision・操作ID |
| ui.assets.get | appdock_get_ui_asset | モデル内のassetIdをidへ指定。PNG/WebPのdata URL |
| ui.actions.invoke | appdock_invoke_ui_action | epoch・requestId・actionId・任意contextId。モデルで公開された操作を実行 |

公開範囲の正本は`appDockOperations`のcallersです。入力APIはApplet専用で、MCPには直接公開しません。描画モデルの詳細は[Shell API](shell-api.md)を参照してください。

設定変更はcommands.executeに集約します。本体はappdock.settings.update、各Appletは`<appletId>.settings.update`です。changes/valuesは公開項目の平坦なオブジェクトで、hostやsettingsで囲みません。本体の対象は次の4項目です。

0.57.0以降、読取りは共有とこのPCの設定の合成値、書込みは現在の保存先を使用します。本体のテーマ等とAppletの有効状態は常に端末別です。Appletの共有／端末専用はローカルUIで選択し、MCPへ保存先切り替えや他端末の設定を公開しません。公開項目・許可・dryRun・共通revisionの契約は維持します。

| キー | 値 | 適用タイミング |
| --- | --- | --- |
| theme | dark/light/system | immediate |
| closeToTray | boolean | nextClose |
| startMinimized | boolean | nextStart |

`{"id":"appdock.settings.update","args":{"changes":{"theme":"light"},"expectedRevision":"<取得したrevision>","dryRun":true}}`で検証します。dryRunでもコマンド実行・書込の両許可とrevision照合が必要です。未知項目・余分な引数・型不一致・空changesを拒否し、指定外を保持して一括保存します。同じ値だけなら書きません。

revisionは実行ごとのUUIDとSettingsStoreの変更番号からなる不透明な文字列です。本体再起動前の値は使えません。本体の設定コマンドサービスをローカル操作とMCPで共有するため、MCPの停止・再開だけではrevisionの実行IDは変わりません。保存直前にディスクも確認し、未通知の外部更新・破損を上書きしません。GUIは妥当な変更ごとに即時保存します。操作前の値と現在値を比較し、APIと同じフィールドを変更した古い入力は競合として拒否します。途中入力と失敗値は現在の画面内に保持します。ファイル同期の未到着な変更までmergeする保証はありません。

エラーコードはINVALID_ARGUMENT、NOT_FOUND、NOT_READY、WRITE_DISABLED、REVISION_CONFLICT、SAVE_FAILEDです。MCPはisErrorとtext/structuredContentにコードと説明を返し、秘密値や全設定を返しません。保存完了と全Appletの非同期reconcile完了は区別します。

未公開コマンドの実行/一般設定、アカウント/認証、更新適用、任意画面操作は公開しません。将来の入口も共通APIの検証と保存を使います。

## ジェスチャー編集

取得は`gestures.get`（MCP `appdock_get_gestures`）、変更はcommands.executeの`appdock.gestures.update`です。既存のマウスジェスチャー画面・入力処理を使用し、右ボタンを押しながら操作します。

取得結果のsettingsは保存済みGestureSettings、bindingsはその割当一覧です。gestureTypesは移動4方向・左/中クリック・ホイール上下のIDと表示名、キー操作は`key:Ctrl+A`形式です。scopesはglobal/desktop/app/pages/owner/applets/browser/exeで、desktopはglobalの直下です。assignableCommandsの公開済み引数なしコマンドを新規割当に使用できます。ownerIdと現在のavailableはショートカットと同じ意味です。取得にGUIの未確定入力、他の設定、認証情報、対象アプリの稼働状況は含みません。

編集にはallowExecute・allowWrite・allowEditGesturesの3許可が必要です。allowEditGesturesはPC専用automation.jsonに保存し、旧設定での省略時も初期OFF。操作の許可画面のMCP列で即時変更し、MCPから許可自体を変更する入口はありません。permissionはgestures.write、実効許可はgetInfo/commands.list/gestures.getのgestureEditingAllowedです。ショートカット編集許可とは独立しています。

```json
{
  "id": "appdock.gestures.update",
  "args": {
    "expectedRevision": "<gestures.getで取得したrevision>",
    "dryRun": true,
    "operations": [
      {
        "kind": "add",
        "binding": {
          "id": "gesture-open",
          "command": "appdock.open",
          "gesture": "move-up",
          "enabled": true,
          "when": { "scope": "app", "appletIds": [], "processes": [] }
        }
      },
      { "kind": "configure", "changes": { "distance": 60 } }
    ]
  }
}
```

- add: binding全項目を指定。既存と重複しない安定IDを付け、同じ入力の実行順末尾へ追加します。
- update: idとchanges（command/gesture/enabled/whenの部分更新）。whenを指定するときはscope/appletIds/processes全体が必要です。入力変更は移動先の末尾、条件だけの変更は現在位置を保ちます。
- remove: 削除するidを指定します。存在しないIDはNOT_FOUNDです。
- reorder: gestureとidsを指定。同じ入力の無効行も含む全IDが必要で、別入力の順序は維持します。
- configure: changesでenabled、activateOnStart、browsers、excludedProcesses、requireChromiumWindowClass、distance（5〜500）、wheelDelayMs（0〜5000）、executionMode（all/first）、indicatorOpacity（0.1〜1）、indicatorPosition（gesture-start/window-center/monitor-center/none）、indicatorShowNoAction（boolean）を部分更新します。indicatorShowNoActionは「アクションなしを表示する」に対応し、省略時は旧設定を含めtrueです。falseの場合は実行対象のない移動の待機表示を隠し、ジェスチャーの認識・実行・取消は維持します。activateOnStartは非アクティブな対象をアクティブにして開始する設定で、新規・旧設定での省略はfalseです。executionModeは条件一致のすべて／最初の1つ、noneは待機表示なしです。省略された旧executionModeはallになります。bindingsの直接置換は受け付けません。トレイの一時停止は保存設定と異なり、この操作では変更しません。

desktop条件はデスクトップの背景・アイコン領域だけに一致し、フォルダー画面やタスクバーを含みません。whenの任意のboolean `excludeDesktop`はglobal/exeでtrueを指定でき、省略はfalseです。その行だけをデスクトップの開始候補から除外します。別のdesktop条件の行は維持し、候補がなければ通常の右クリックを通します。例: `{"scope":"exe","appletIds":[],"processes":["explorer"],"excludeDesktop":true}`。他のscopeでtrueを指定するとINVALID_ARGUMENTです。monitor-centerは開始時のカーソルがあるモニター全体の中央へ表示し、window-centerも対象がデスクトップなら同じ表示位置になります。

exe条件のprocessesはパスを含まない実行ファイル名を1件以上指定し、その他の条件では空配列です。browsers/excludedProcessesも同じ形式で各100件まで。末尾.exeと大文字小文字を正規化します。applets条件だけappletIdsへ登録済みIDを1件以上指定し、その他では空配列です。本体コマンドにownerは使えません。旧未公開/未導入の割当は保持・無効化・削除でき、既存の同じ入力内で並べ替えられます。新規追加・再有効化・その他の更新は公開済み引数なしコマンドに限ります。

operationsは1〜100件、割当は2000件まで。既存parseGestures/入力正規化/実行順処理を共用し、一括検証後に1回だけ保存します。dryRun/無変更は保存せず、途中エラーも全体を保存しません。他の本体/Applet設定・ショートカットとrevisionを共用し、未通知のディスク更新・再起動・GUIの未確定入力に対する競合保護を維持します。エラーはINVALID_ARGUMENT/NOT_FOUND/COMMAND_NOT_ASSIGNABLE/REVISION_CONFLICT/SAVE_FAILED、および実行/書込/編集の許可不足です。

結果はdryRun/changed/settings/bindings/revision/warning/applies=gesturesChanged、completionはvalidatedまたはsettingsSaved、effectVerified=false。入力処理への反映は非同期であり、保存完了は物理ジェスチャーの成功や現在の一時停止解除を示しません。全API呼出しを既存automationログへ記録し、操作引数やexe名はログに残しません。

## ショートカット編集

取得は`shortcuts.get`（MCP `appdock_get_shortcuts`）、変更は既存のcommands.executeへ`id=appdock.shortcuts.update`を渡します。

読取りは保存済みのbindings（id/command/key/enabled/whenと任意のblockOriginalInput）を実行順に返します。blockOriginalInputはglobalの元入力を止めるbooleanで、省略時true。旧行への既定値の書込みは行わず、updateで省略した場合は保存済み値を保持します。keyはWin／Windows／Meta修飾キーにも対応します。globalHotKeysのregisteredは共有フックへの適用成功を表し、backend="hook"とキー単位のeffectiveBlockOriginalInputも返します。OSの排他予約や実効果の保証ではありません。GUIの未確定入力は含めません。全設定・Applet設定値・認証情報は返しません。assignableCommandsは新しく割り当てられる公開済み引数なしコマンド（id/title/available/ownerId）。停止中Appletも設定先として選べますが、実行可否はavailableで区別します。設定更新などの引数必須コマンドは割り当てられません。ownerId=nullの本体コマンドには「提供元のApplet」条件を使用できません。

既存の未公開/未導入コマンドへの割当もbindingsへ返して保持します。それらは無効化・削除できますが、外部からキー/条件を変更したり有効化したりはできません。reorderは既存の同じキーの行だけを並べ替えます。ローカルの編集画面にはこの外部公開制限を加えません。

編集には連携有効に加えallowExecute・allowWrite・allowEditShortcutsの3つが必要です。allowEditShortcutsはPC専用automation.jsonに保存し、初期値/旧設定での省略時はfalse。「操作の許可」のMCP列の「ショートカットの編集」で即時切替、MCP経由で許可を変える操作はありません。permission=shortcuts.write、実効許可はgetInfo/commands.list/shortcuts.getのshortcutEditingAllowedで確認します。既に保存した割当は許可取消後もローカルで使えます。

```json
{
  "id": "appdock.shortcuts.update",
  "args": {
    "expectedRevision": "<shortcuts.getで取得したrevision>",
    "dryRun": true,
    "operations": [
      {
        "kind": "add",
        "binding": {
          "id": "custom.open-appdock",
          "command": "appdock.open",
          "key": "Ctrl+Alt+D",
          "enabled": true,
          "when": { "scope": "app", "appletIds": [] }
        }
      }
    ]
  }
}
```

- `add`: bindingを全項目指定。IDは既存と重複しない安定ID。割当は同じキーの末尾へ追加します。
- `update`: idとchanges。command/key/enabled/whenの一部を指定します。whenはscopeとappletIdsを一緒に指定。キーを変えると変更先キーの末尾へ移動します。
- `remove`: idを指定。存在しないIDは拒否します。
- `reorder`: keyとidsを指定。同じキーの全行IDを、無効な行も含めて実行順に指定します。他のキーは保持します。

scopeはglobal/app/pages/owner/appletsです。appletsだけは登録済みApplet IDを1件以上指定し、他は空配列。既存の未導入対象は変更しない限り保持します。同じキーの複数割当を一律に競合扱いせず、既存の条件・実行順を使用します。同じコマンドが複数の条件で一致しても1回の押下では1回だけ実行します。

operationsは1〜100件、全割当は2000件まで。既存parseKeybindings/キー正規化/条件検査/同じキー内の順序検査を共有します。全操作をメモリ上で検証し、1件でも不正なら保存しません。指定外の割当/設定を保持し、withKeybindingsでshortcuts/globalShortcutCommandsの互換フィールドも揃えます。dryRunは保存せず結果を返し、同じ許可とrevisionが必要です。同じ結果なら保存しません。

revisionは本体/各Applet設定と共通です。他の設定編集・再起動・未通知のディスク変更でも古いrevisionを拒否します。保存は既存prepareSettings/commitSettingsを使用し、GUIの未確定入力を消さず、古いGUI版の保存は競合として拒否します。応答はdryRun/changed/bindings/revision/warning/appliesを含み、completionはvalidatedまたはsettingsSaved、effectVerified=false。共有フックへの適用は非同期なので、保存成功だけで入力適用の成功と扱わず、shortcuts.getのglobalHotKeysを再取得してください。適用エラーは限定した説明へ置き換えます。

追加エラーはSHORTCUT_EDITING_DISABLED、COMMAND_NOT_ASSIGNABLEです。INVALID_ARGUMENT/NOT_FOUND/REVISION_CONFLICT/SAVE_FAILEDと既存の実行・書込拒否も使用します。変更はautomation監査ログへ結果を記録し、キーやbinding IDなどの引数は記録しません。キー入力の送信、既定テンプレート、Applet初期化状態、ジェスチャー/リボンの編集はこのAPIに含めません。

## Applet管理

本体が登録済みのファイル型AppletとWebAppletに `appdock.applets.<appletId>.enable` / `disable` / `restart` を生成します。引数はありません。Applet固有コマンドの公開宣言とは独立した本体コマンドで、設定JSONにIDを追加するだけでは生成しません。管理コマンドは対象appletIdを持ちますが、ショートカット・ジェスチャー・トレイではAppDock所属です。無効なAppletのenableも候補に残ります。削除済みの対象を実行すると拒否します。

- enable/disable: enabledのみを既存SettingsStoreで保存し、他の設定を保持して状態を反映します。同じ値なら保存しません。有効化は設定済みの起動遅延に従います。
- restart: 有効状態を保存し直さず、ファイル型は停止して再起動予約（起動遅延を尊重）、WebAppletはビューを作り直して表示します。無効なAppletはUNAVAILABLEで拒否します。再起動は実行中処理を中断し得ます。
- 開始/停止処理中、同じAppletの管理処理中は拒否します。GUIの有効切替・再起動も同じ処理を使用します。実行前にディスクの設定競合を検査し、未通知の変更はCONFLICTで拒否して現在値を採用します。保存済み設定とGUIの未確定入力を混同しません。
- 成功応答はcompletion=lifecycleApplied、changed（enabledの保存有無）、applet（id/enabled/state）、effectVerified=falseです。waitingは予約状態で、起動完了を意味しません。起動失敗はLIFECYCLE_FAILEDになり、保存済みenabledは巻き戻しません。失敗/通信切断後は状態とログを確認します。

PC専用automation.jsonの`allowManageApplets`は既定falseです。「操作の許可」のMCP列の「Appletの有効・無効・再起動」で切り替えます。外部実行は連携有効・allowExecute・allowManageAppletsのすべてが必要で、allowWriteとは独立しています。許可設定自体はMCPから変更できません。個別コマンド/個別Appletの許可スイッチはありません。

カタログのpermission=applets.manageと、system.getInfo/commands.listのappletManagementAllowedで管理権限を確認できます。拒否はAPPLET_MANAGEMENT_DISABLEDです。取消は次の要求から有効で、開始済みの処理を中断しません。ローカル操作に外部操作の許可は不要です。MCPツールは既存の7件を維持し、管理操作もcommands.execute経由で監査ログへ記録します。

## 公開コマンド

設定変更とは独立したallowExecuteをPC専用設定に保存し、初期値/未保存時はfalse。MCPの一覧には許可前も公開コマンドを載せ、executableで実行権限を示します。commandsの各項目はid/title/appletId（本体はnull）/available/unavailableReason/completion/inputSchemaです。設定変更にはpermission=settings.writeが付き、一覧のwritableとexecutableで必要な両許可を確認します。接尾辞・表示名・aliasから許可を推測しません。

- 本体: appdock.open、appdock.settings.open、appdock.commands.search、appdock.applets.open、appdock.logs.open、appdock.updates.openと公開設定・Applet管理コマンド。updates.openは画面表示だけで、更新適用は行いません。
- ファイル型Applet: 各manifestでautomation: trueを宣言した正規コマンド。
- WebAppletの個別サイト: 提供元AppletのpageCollections宣言からopen/back/forward/reload/homeとname/displayの公開設定を生成し、共通設定コマンドに登録。詳細は[WebApplet公開操作](web-applets.md#公開操作)。

Appletは有効かつrunningかつ現在のcommand.availableがtrueの場合だけ実行します。既存のactivateOnExecuteで停止中Appletを有効化する経路には入りません。実行直前に一覧を再構築し、通常コマンドは既存executeCommandへ、設定コマンドは共通SettingsCommandsへ渡します。通常のApplet RPCコマンドは引き続き引数なしで、argsに値を渡すと拒否します。APIコマンドの同時実行は1件、重複時はBUSY。設定変更許可だけでは実行できず、実行許可だけでは設定変更できません。許可の取消は次の要求から反映し、既に始めた操作の取消は保証しません。

本体の表示要求はcompletion=accepted、Appletの処理応答はhandlerReturned。設定保存はsettingsSaved、dryRunはvalidatedです。いずれも操作先の効果を別途検証していないのでeffectVerified=falseです。settingsSavedは永続化を表し、非同期settings.changedの反映完了は表しません。生のコマンド戻り値/例外は返しません。EXECUTION_DISABLED/UNAVAILABLE/BUSY/COMMAND_FAILEDを追加。応答消失や失敗時は処理済みの可能性があるため、自動再試行せず効果を確認します。MCPの実行ツールはreadOnlyHint=false/idempotentHint=false/destructiveHint=trueです。設定値によって履歴の縮小などを伴うため、実行入口全体を非破壊とは宣言しません。

Applet詳細には全設定・認証・パス・panelを含めません。WebAppletのURLと生の起動エラーも出さず、説明/エラー概要へ置き換えます。

## Appletによる公開宣言

外部公開はAppletのextension.jsonのcommandsにbooleanのautomationで指定します。省略/falseは非公開です。本体はApplet名やIDごとの一覧を持ちません。

```json
{
  "id": "example.tool.run",
  "title": "処理を実行",
  "automation": true
}
```

この機能を使うAppletはminimumHostVersionを0.26.29以上にします。自身の名前空間の正規IDだけを宣言し、公開IDは200文字以内の英数字・ピリオド・ハイフン・アンダースコア（先頭英数字）に限定します。不正な型/IDはmanifest読込時に拒否します。aliasesへ公開権限を継承しません。MCP固有のフラグではなく、共通操作APIからの公開宣言です。

runtime登録やhost.commands.replaceのautomation値は採用せず、manifestの正規IDと現在の登録コマンドを照合します。表示名は現在の登録値を使用します。未登録・動的に削除されたコマンドは利用不可、同じ宣言済みIDが再登録されたら再び利用可能です。宣言追加/削除はAppletファイルを更新してAppDockを再起動すると反映されます。新しいAppletの公開対象追加に本体の変更は不要です。

本体は宣言の検証・実行許可・稼働状態・同時実行制御・監査ログを管理します。公開宣言は実行許可を有効にするものではありません。現在はPC単位のコマンド実行許可を全Appletで共有し、Applet/コマンド個別の許可スイッチはありません。


## 設定宣言と自動生成コマンド

この宣言にはminimumHostVersion=0.26.30以上、settings capabilityが必要です。各Applet自身のextension.jsonのsettingsへ、必要な項目だけautomation=trueを付けます。型は最上位のboolean/number/string/静的selectに限定し、既存の型・最小最大・選択肢検証を共有します。入れ子、JSON、動的select、アカウント情報を一括公開する機能はありません。

```json
{
  "key": "monitoring",
  "title": "監視",
  "type": "boolean",
  "default": true,
  "automation": true,
  "generateCommands": ["on", "off", "toggle"]
}
```

公開項目がある提供元には、複数項目を一括指定できるsettings.updateを1件生成します。各コマンドのinputSchemaはcommands.list/get_appletから取得できます。settings.get/getSchemaへappletIdを渡すと、そのAppletの公開項目だけを取得します。設定全体で同じrevisionを使い、別の提供元への更新でも以前のrevisionは無効になります。

booleanのgenerateCommandsは任意で、on/off/toggleから必要なものだけを指定します。型がbooleanのdefaultを必須とし、実行時の保存値が未設定ならdefaultを使用します。IDは`<owner>.settings.<key>.on|off|toggle`、表示名は設定titleから生成します。ONはtrue、OFFはfalseです。「停止」設定のONは停止を意味します。toggleはディスク検査後の最新値を反転して同じ同期処理内で保存し、競合時に再試行しません。

生成した引数なしコマンドは、通常の検索・ショートカット・ジェスチャー・トレイ候補へ自動追加します。実キーやトレイ項目は自動割当しません。AppletのdefaultKeybindings/defaultGestureBindings/settingActionsからも生成IDを参照できます。停止中も候補に残しますが実行は有効かつrunningに限ります。automationを省略した生成コマンドはローカル専用です。MCP公開時には両許可が必要です。

生成IDとsettings.updateは宣言・alias・runtime登録/置換との重複を拒否します。提供元IDのappdockは本体専用です。生成IDは180文字以内。引数付きsettings.updateを引数なしショートカットの候補へは追加しません。

初期対応: Gmailは監視/通知/ツールバー/未読のみと履歴件数、壁紙は停止と更新間隔を公開します。Gmailの外部リンク確認省略・通知内容表示、認証や画像フォルダーは非公開です。壁紙の旧start/stop/toggle/resume/pauseは廃止し、paused.off/on/toggleへ置換しました。既存割当の自動移行は行わないため、必要なキーを新コマンドへ割り当て直してください。

## API監査ログ

認証後にMCPのtools/callハンドラーへ届いた全API呼出しを、既存HostLogのsource=automationへ記録します。成功はinfo、拒否/失敗はwarn。MCP/API名/ホスト生成requestId/公開一覧に実在する対象ID/結果/処理時間を記録し、コマンド実行は受付時にもstartedを残します。未知ツール名はunknownに置き換えます。要求引数、設定値、token、コマンド戻り値、生のエラー文は記録しません。認証前の要求やMCP初期化・一覧取得はAPI操作ログの対象外です。

MCPは接続経路の表示であり、接続元をCodex固有の本人確認として断定しません。ログ画面の絞込みと既存host.log（1MBローテーション）を共用し、別の無制限ログは作りません。終了や切断でstartedだけが残る場合は完了を断定しません。

## 通信と保存

初期無効・初期読取り専用。PC専用automation.jsonのconnectionScopeは省略時local（127.0.0.1）、networkでは0.0.0.0へbindします。どちらもHost/Origin/専用Bearer tokenを検査し、CORS許可は付けません。networkのHostはループバック・現在のNICのIPv4・このPCのホスト名・networkHostnamesへ明示登録したDNS名に限定し、実ポートを必須とします。Originは未指定または検証済みHostと同じHTTP originだけを許可します。接続元IPの許可一覧は持ちません。32byte乱数のトークンを、AppDock側ではElectron safeStorageで暗号化してPC専用rootのautomation.jsonへ保存します。共有設定や配布物へ含めません。

範囲切替では既存ポート・token・MCP許可・共通API・revisionを保持し、Codexの登録URLは常に127.0.0.1のままです。即時保存後に旧受付を停止して同じポートへ再bindします。起動中はランダムな識別子と認証付きの内部probeでループバックの到達先が自身のリスナーであることを確認し、実ポートの保存も成功してから公開要求を実行します。途中失敗では停止状態を表示し、勝手なポート変更・networkへの復帰はしません。保存失敗は以前の保存値と待受を保持します。「接続を再試行」は保存済み設定で再起動する操作です。MCP_SAVE_FAILED/MCP_START_FAILEDは共通エラー通知へ報告します。

全MCPクライアントがtoken、許可、同時8要求の上限とAI/TTSの所有者を共有します。範囲切替は通信を一時切断しますが、開始済み操作の取消は保証しません。接続設定・認証を本文読込後とAPI呼出直前にも再検査し、停止した受付から新しい操作を開始しません。応答が失われた操作を自動で再実行しないでください。接続日時はsocketの接続元に基づき、このPCとネットワークを区別します。自己テストや内部probeは日時を更新せず、日時だけでCodex接続成功とは扱いません。

トークンは「接続トークンをコピー」の明示操作時だけmainでOSクリップボードへ書き、IPC応答・画面・ログへ返しません。接続範囲、追加ホスト名、コピー、再試行は本体設定UI専用で、MCP/一般Appletへ公開しません。HTTP自体にはTLSがなく、LAN直結とtailnetによる経路保護を区別します。IPv6待受、CORS、HTTPSプロキシ設定、ファイアウォールの自動変更は含みません。

接続先候補は`networkEndpointAddresses`で表示用に絞り、Hyper-Vの既知名`vEthernet (Default Switch)`だけを除外します。IP末尾が`.1`という理由や、仮想アダプターという理由では除外しません。Tailscaleと外部LAN用vEthernetを保持します。HTTPのHost検証は引き続き`networkAddresses`の全NIC候補を使うため、表示の除外は直接接続の拒否ではありません。アダプターが改名されている場合は既知名による除外の対象外です。認証の案内では環境変数`MCP_BEARER_TOKEN`を名前の例として示し、実際のHTTPヘッダー`Authorization: Bearer <token>`と区別します。AppDock自身がこの環境変数を読み書きする機能はありません。

初回は空きポートを選び、以後保存した値を使います。競合時は勝手に変えずエラーにします。詳細のポートに0を指定して適用すると空きポートを選び直せます。変更後はCodex登録を修復してください。EXE配置の絶対パス由来のIDは内部識別と登録範囲の所有判定に使い、Codexへの登録名とは分離します。移動は別配置として扱い、旧登録を自動削除しません。

書込許可の切替は接続を切らず、各呼出しで許可を確認します。停止/終了は接続を閉じ、認証再発行後は旧トークンを拒否します。自己接続テストの日時はクライアント接続日時に混ぜません。日時は認証したクライアントのinitializeの観測であり、現在も接続中という保証やCodex固有の本人確認ではありません。

## Codex登録

設定ページでは連携の有効状態と登録状態を先に表示し、「Codexへ登録」（登録済みなら「登録を修復」）と「接続テスト」を主な操作として並べます。config.tomlの場所・登録名・ポート・トークン更新・登録解除は「登録先と接続の詳細」にまとめます。「操作の許可を開く」から独立した許可ページへ移動します。共有設定や認証の保存契約は変更しません。

対象は同じWindowsホストのCodex。CODEX_HOME/config.toml、未指定ならホームの.codex/config.tomlを候補とし、絶対パスを画面で変更できます。WSL/リモートの自動設定はしません。

登録名の既定値はAppDockで、mcp_servers.AppDockのurl/enabled/required/http_headersだけを追加します。「登録先と接続の詳細」で登録名を変更できます（英字で始まる64文字以内の英数字・ハイフン・アンダースコア）。複数配置にはAppDock_Testなど別の名前を指定します。同名の他登録は上書きしません。serverIdはCodexへの登録名、APIのinstanceIdと管理コメントは配置IDです。

登録名を自動移行しません。旧登録や名前変更前の登録は「登録を解除」してから登録し直します。解除は保存済みの所有hashを照合して旧名の管理範囲だけを削除します。ローカルserverNameが未保存の場合はAppDockを既定値にします。

required=falseなのでAppDock停止をCodex全体の必須起動失敗にしません。Bearer tokenはCodexのローカルconfig.tomlにも平文で保存されます。画面・IPC状態・ログには出しません。

管理用コメントと範囲hashを使い、全TOMLの構文と範囲外の意味を検査します。現在の正確な登録内容または保存済みhashと一致するときだけ修復/解除します。複数行文字列内の偽コメント・外部編集・同名衝突・不正TOMLを上書きしません。直前bytesを照合しatomic置換します。既存内容があれば同じ場所のconfig.toml.appdock-backupへ復旧用コピーを保存します（既存認証値が含まれ得ます）。解除は管理範囲だけを除き、過去の全ファイルを復元しません。

外部アプリで登録を削除した結果、開始または終了コメントが1行だけ残った場合は、保存済み所有情報があり、同名のMCP登録が存在せず、そのコメントだけを除いてもTOMLの意味が変わらないときに限り再登録・解除できます。状態確認はファイルを書き換えません。コメントの重複・文字列内のコメント・登録本体が残る場合は従来どおり確認を求めます。

登録状態はファイルから確認し、MCP稼働と実接続日時を別表示します。登録/修復/解除後はCodex再読み込み/再起動を案内します。組織ポリシーや別profileの上書きまで、この画面だけで確認できるとは限りません。

## 検証

- `dev.bat run typecheck` / `dev.bat run build`
- `dev.bat exec node --test tests/automation.test.cjs tests/settings-commands.test.cjs tests/settings-sync.test.cjs`
- `dev.bat exec node scripts/automation-ui-test.cjs [A:/40.ARTIFACT/AppDock.at365/AppDock.at365.exe]`
- APPDOCK_TEST_CODEX_EXEへインストール済みCodexの絶対パスを指定すると、GUI生成の隔離configを実Codexで読み込み、7ツールの発見と取得/変更/再取得/復元・公開コマンド実行を確認します。検証にだけapp-serverのMCP呼出しを使い、モデル推論や実利用の認証値は使いません。GUIのコマンド試験は製品にないIDの専用Appletを使い、実デスクトップ壁紙は変更しません。

証跡は.artifacts/automation-source-* / automation-portable-*とVERIFICATIONに記録します。ビルドをGUI検証と同時実行しません。

参考: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Codex設定](https://learn.chatgpt.com/docs/config-file/config-reference)、[MCP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)。

## リボン編集

0.66.0以降、layoutには`buttons`（最大100件のコマンドボタン定義）と任意の`rightClickCommand`も含みます。操作は`addButton { id, title, icon, commandId, iconOnly?, placement }`、`updateButton { id, changes }`、`removeButton { id }`、`setRightClickCommand { commandId }`を追加しました。button IDは`button:<stable-id>`で、表示用items.kindはcommandです。保存済みの未登録コマンドも保持し、通常のretainedIdsへは分類しません。外部の取得・変更結果では公開されていないcommandId／rightClickCommandを省略するため、読取結果を保存型として丸ごと送り返さず、操作と変更対象だけを指定してください。編集はコマンドの実行許可を追加せず、実行時にも元callerと公開宣言・個別許可を検査します。

0.65.0以降、layoutに任意の`separatorTitles`（登録済みセパレーターIDから名前へのマップ）を含みます。`updateSeparator { id, changes: { title } }`で80文字以内の名前を変更し、空欄で自動生成名へ戻します。`addGroup`の任意`color`、`updateGroup.changes.color`は`#RRGGBB`またはnullです。色なしのnull、欠落、色の正規化、名前、削除・初期化はGUIと同じ共有検証を使います。グループ削除で色、セパレーター削除で名前も削除されます。保存・dryRunだけではコマンドを実行しません。

取得は`ribbon.get`（MCP `appdock_get_ribbon`）、変更は`commands.execute`の`appdock.ribbon.update`です。

編集にはallowExecute・allowWrite・allowEditRibbonの3許可が必要です。allowEditRibbonはPC専用automation.jsonへ保存し、初期値と旧設定での省略値はfalse。操作の許可画面のMCP列で変更し、MCPから許可自体は変更できません。permissionはribbon.write、実効許可はgetInfo/commands.list/ribbon.getのribbonEditingAllowedです。ショートカット/ジェスチャー編集とは独立しています。

取得結果のlayoutはorder/hidden/bottom/separators/groups/itemOverrides/separatorTitles/buttons/rightClickCommand、itemsはid/title/kind（builtin/page/separator/group/command）/appletId/pageId/parentId/placement/visible/enabled/displayedです。titleはリボンの実効表示名、placementは親からの継承を含みます。無効Appletのページもitemsに含み、displayedはvisibleかつenabledです。開始待ち・エラーでも有効Appletは表示対象です。ページのパス・URL・アイコンデータ・openCommand・非公開設定は返しません。retainedIdsは配置・所属・表示設定に保存中の未導入ページIDで、通常編集では保持します。項目IDはコマンドIDとは異なります。

```json
{
  "id": "appdock.ribbon.update",
  "args": {
    "expectedRevision": "<ribbon.getで取得したrevision>",
    "dryRun": true,
    "operations": [
      { "kind": "update", "id": "logs", "changes": { "visible": true, "placement": "bottom" } },
      { "kind": "addSeparator", "id": "separator:work", "placement": "top" }
    ]
  }
}
```

| kind | 引数 | 動作 |
| --- | --- | --- |
| update | id, changes | visible（boolean）/placement（topまたはbottom）の指定分を変更。配置変更時は移動先のトップレベル末尾へ。子のplacementは拒否しmoveItemを使う。現在itemsにあるIDが対象 |
| reorder | placement, ids | 指定配置のトップレベル全itemsを希望順で指定。非表示・無効ページ・区切り線も含み、retainedIdsは含めない。別配置と子の順序を保持 |
| addSeparator | id, placement | 一意のseparator:stable-idを追加。英小文字/数字で開始し、その後は英小文字/数字/ハイフン、接尾部80文字まで。指定配置のトップレベル末尾へ |
| removeSeparator | id | 登録済み区切り線だけを削除し、トップレベルと子の参照も削除 |
| addGroup | id, title, icon, expansion, placement, 任意iconOnly | 空のグループを指定配置のトップレベルへ追加。expansionはpersistent/temporary。titleは空欄可 |
| updateGroup | id, changes | title/icon/expansion/iconOnlyの指定分を変更 |
| updateItem | id, changes | 通常ボタンのtitle/iconOnlyの指定分を変更。titleはリボン内の別名、空欄で登録元名へ戻す。現在itemsにある通常ボタンか保持中の未導入ページIDが対象 |
| removeMissing | id | 登録元のない保持項目を配置・非表示・所属・表示設定から削除。登録元が現在存在する項目（停止中を含む）は拒否 |
| moveItem | id, parentId, beforeId, 任意placement | parentIdはgroup IDかnull。beforeIdは同じ所属内の挿入先かnull（末尾）。トップレベル時だけplacementが必須 |
| reorderChildren | id, ids | 未導入・非表示も含む指定グループの全childrenを並べ替える |
| ungroup | id | 子を元の親位置へ戻し、配置と実効非表示を継承。Appletは削除しない |
| reset | なし | グループと色・セパレーターと名前・コマンドボタン・未導入項目の保存配置と表示設定を初期化。bottomはtheme/profile。別の動作設定rightClickCommandは保持 |

operationsは1〜100件。全操作を順にメモリ上で検証し、一つでも失敗すれば保存しません。GUIと同じparseRibbonを使い、ID配列550件、グループ50件・区切り線50件、明示配置全体の葉500件まで。reorderの不足・重複・別グループ混入、未登録区切り線参照、不明フィールドは拒否します。空グループのreorderは空idsだけを許可します。現在登録されていないページはupdate不可で、再導入後に編集できます。新たなApplet追加などで項目一覧が変わった場合は再取得してください。

表示名は前後空白除去後0〜80文字で制御文字不可、iconOnlyはbooleanです。itemOverridesは通常ボタンIDごとの`{title?, iconOnly?, lastKnownTitle?}`を最大500件保持します。lastKnownTitleは編集保存時の登録名で、未導入項目の名前表示に使い、updateItemの指定対象にはしません。読取り・同値編集で名前記録を更新せず、枠が埋まっている場合は新規の名前記録を省略します。空の別名は保存せず登録元名を使用し、グループ名が空の場合は実リボンのラベルを省いてアクセシブル名に「グループ」を使用します。ID・登録元の名前・実行先は変更しません。

revisionは全設定で共通です。古いrevision、プロセス再起動前のrevision、同期競合を拒否し、GUIの未確定入力は上書きしません。dryRunは保存せず変更後のlayout/itemsを返します。同値更新は保存せずrevisionも変えません。リボン以外の設定と、ローカルribbonの未知フィールドは保持します。

結果はdryRun/changed/layout/items/retainedIds/revision/warning/applies=ribbonChanged、completionはvalidatedまたはsettingsSaved、effectVerified=false。保存後の画面反映は非同期です。Appletを有効化したりページを開いたりはしません。非表示にした設定ボタンへは既存の設定を開くコマンドやトレイの固定「設定…」から戻れます。

エラーはRIBBON_EDITING_DISABLED、INVALID_ARGUMENT、NOT_FOUND、REVISION_CONFLICT、SAVE_FAILEDと既存実行/書込拒否を使用します。automation監査ログへAPI名・コマンドID・結果を記録し、操作引数や配置IDは記録しません。

## タスクトレイ編集

取得は`tray.get`（MCP `appdock_get_tray`）、変更は`commands.execute`の`appdock.tray.update`です。MCPは11ツール。更新後はCodexを再読み込みしてください。

編集にはallowExecute・allowWrite・allowEditTrayの3許可が必要です。PC専用automation.jsonのallowEditTrayは新規/旧省略ともfalse。操作の許可画面のMCP列で即時変更し、MCPから許可自体は変更できません。permissionはtray.write、実効許可はgetInfo/commands.list/tray.getのtrayEditingAllowed。他の編集許可とは独立しています。

取得結果はmenu（保存対象ツリー）、clicks（singleClickCommand/doubleClickCommand）、fixedCommands、assignableCommands、revision、warning、各許可。menuはid/typeと、command・groupのtitle/childrenだけを投影し、全設定や認証情報は返しません。固定の設定/終了はmenuの外にあり、末尾へ自動付加します。assignableCommandsは公開済み引数なしコマンドのid/title/available/menuAllowedです。停止中も候補を返しますが、編集で起動・コマンド実行はしません。実表示では空グループや先頭/末尾/連続区切り線を既存ルールで省略します。

```json
{
  "id": "appdock.tray.update",
  "args": {
    "expectedRevision": "<tray.getで取得したrevision>",
    "dryRun": true,
    "operations": [
      { "kind": "add", "parentId": null, "item": { "id": "tray.work", "type": "group", "title": "よく使う操作" } },
      { "kind": "add", "parentId": "tray.work", "item": { "id": "tray.open", "type": "command", "command": "appdock.open" } },
      { "kind": "configure", "changes": { "singleClickCommand": "appdock.open", "doubleClickCommand": "appdock.settings.open" } }
    ]
  }
}
```

| kind | 引数 | 動作 |
| --- | --- | --- |
| configure | changes | singleClickCommand/doubleClickCommandの指定分だけ更新。シングルはコマンドID必須、ダブルはnullで解除 |
| add | parentId, item | 指定階層の末尾へ追加。itemは{id,type:command,command}、{id,type:separator}、{id,type:group,title}のいずれか。groupはトップレベルに空で作成 |
| update | id, changes | command項目のcommand、またはgroupのtitleを変更。項目のtype変更は不可 |
| remove | id | command/separator項目を削除。groupへは使用不可 |
| ungroup | id | グループを解除し、中の項目を同じ位置のトップレベルへ戻す |
| move | id, parentId, beforeId | 指定階層のbeforeIdの直前へ移動。beforeId=nullは末尾。グループを別グループに入れる操作は不可 |
| reorder | parentId, ids | 指定階層の全項目IDを希望順に指定。他階層の順序を維持 |

parentId=nullはトップレベル、それ以外はグループ項目のID。項目IDとコマンドIDは別です。同じコマンドは異なる項目IDで複数箇所へ置けます。グループは1段、名前は前後空白除去後1〜80文字で制御文字不可、全項目1500件以下、IDは全体で一意。operationsは1〜100件、全操作を順に検証後1回だけ保存します。reorderは対象階層の未知/非公開コマンドの項目も含め、欠落・重複・別階層混入を拒否します。不明フィールド・ネストしたグループ・固定メニュー項目の追加も拒否します。

新規/変更先のコマンドはassignableCommandsから指定します。メニューではmenuAllowed=trueだけを使用し、固定「設定」「終了」の重複を防ぎます。クリック割当はmenuAllowedに制約されません。既存の未知/非公開コマンドは保持・移動・並べ替え・削除が可能で、同じ値の再指定は許可しますが、別の項目やクリック先への新規コピーは許可しません。groupのremoveは拒否し、中身を消したい場合も項目ごとに明示削除します。

共有revision/dryRun/no-op/競合拒否/GUIの未確定入力と同一フィールドの競合検査は他の編集コマンドと同じです。trayMenuが存在すれば空配列も尊重し、旧trayCommandsは派生値として更新します。旧形式は読取り時に既存getTrayMenuで投影し、変更保存時に移行します。リボン/キー/ジェスチャー/Applet設定などは保持します。

結果はmenu/clicks/dryRun/changed/revision/warning/applies=trayChanged。completionはvalidatedまたはsettingsSaved、effectVerified=false。保存後のトレイ反映は既存applySettingsが行い、保留中のクリックを取消します。編集自体はコマンド実行ではなく、実クリックの成功を保証しません。ダブル未設定ならシングルを即実行、ダブル設定時はWindowsの判定時間を待ち、ダブル成立時に先行シングルを取消す既存仕様を維持します。

エラーはTRAY_EDITING_DISABLED、COMMAND_NOT_ASSIGNABLE、INVALID_ARGUMENT、NOT_FOUND、REVISION_CONFLICT、SAVE_FAILEDと既存実行/書込拒否です。automationログへAPI名・コマンドID・結果を記録し、グループ名/項目ID/クリック割当などの引数は記録しません。

## Applet専用操作

input.sendKeys/input.appCommandはMCPの列挙・直接実行に公開しません。Appletが明示公開するコマンドからの呼出しは全Applet共通の許可で実行できます。[公開先と許可](appdock-api.md)を参照してください。

Shell専用コマンドに宣言された`shellRequirement`も共通最終実行経路で検査します。automationの公開宣言・PC専用権限に加えて対象領域の解決先/可視状態が必要で、一覧取得後の切替では実行を拒否します。未採用でも条件を省略した自己設定コマンドは従来どおりです。詳細は[Applet API](extensions.md#shellの採用状態と専用コマンド)。

## TTS読み上げ

最低ホスト版0.35.0。tts.speak / tts.voices.list / tts.jobs.get / tts.stopをAppletとMCPへ公開します。Appletはappdock-api capability、両入口はそれぞれのuseTts許可を使います。受付・状態・所有者・停止・重複判定とNode/.NET例は[TTS連携](tts-design.md#共通api)を参照してください。
