# 共通操作APIとCodex連携

設定編集許可の統合と、宣言済み単純設定・object-listのMCP既定公開に対応する。設定の探索・Schema・値・行・選択候補・変更は[設定APIの固定6入口](settings-api.md)を使用する。特殊設定のadapterは[拡張設計](mcp-settings-design.md)の後続範囲。

通知、AI共通/接続、TTSと更新の通常値、AI接続/TTS手動ボイス一覧の行操作、Applet共通の有効状態・起動待ち時間・ページ表示先、管理表示順、ジェスチャー共通のブラウザ判定も同じ固定入口で扱う。更新は本体設定と外部Appletごとの更新元に対応する。保存の検証を各所有サービスへ委譲し、生成・読み上げ・試験接続・更新実行・暗号化情報の操作は設定変更に含めない。対象ごとの境界と継承/リセットは[設定API](settings-api.md)を参照する。

MCPハブは`appdock_mcp_list_servers/list_tools/get_tool/call_tool/get_job/cancel_job`の固定6入口を追加します。接続先→そのツール概要→必要なSchemaの順に取得し、call_toolで受付けたjobIdをget_jobで確認します。下流content（画像等）はMCPのcontentへ、ジョブ状態とstructuredContent/isErrorは構造化結果へ返します。[中継契約](mcp-hub-design.md)と[保存型コマンド](custom-commands-design.md)を参照してください。初回の入口反映と、導入後のデータ増減は別です。

接続先管理には`appdock_mcp_get_server_settings`、`appdock_mcp_update_server_settings`、`appdock_mcp_inspect_server_tools`の固定3入口があります。情報取得・設定変更の許可で、登録・編集・削除と公開前のツール確認を扱います。保存には設定変更、未公開ツールの確認にはMCP利用・コマンド実行の許可も必要です。[管理APIの契約](mcp-client-design.md#接続先の管理api)を参照してください。

保存型カスタムコマンドの管理は固定の4つの読取り入口と`appdock.customCommands.update`を使用します。[カスタムコマンド契約](custom-commands-design.md#共通apiとmcpの固定入口)を参照してください。初回のツール定義反映後、種類や定義の増減でMCPのtools/listは変化しません。管理許可は既存の実行・設定変更許可と独立し、定義のconfigを閲覧できる許可です。保存成功、handlerReturned、effectVerified:falseを区別します。

Appletも同じ操作APIを使用します。[Applet向け接続・許可・SDK](appdock-api.md)を参照してください。操作実装とカタログを共有し、Codex連携の許可とは独立しています。

本体は共通操作APIを、一般向けとローカルCodex向けの2つのHTTP MCP待ち受けから提供します。利用者の手順は[Codex連携の操作説明](usage.md#カスタムコマンド・mcp・ai)、設定保存は[設定同期](settings-sync.md)を参照してください。App Serverによる会話UIとCLIは未実装です。

LAN・tailnet向けの接続範囲切替、HTTP検査、保存と切替の寿命は[ネットワーク接続の設計](automation.md)にまとめています。

## 構成

- `src/main/core/appdock-api.ts`と`src/shared/appdock-api.ts`: 通信に依存しない操作、公開カタログ、実行権限、引数、受付状態。`automation-api.ts`は既存呼出元向けの再export。
- `settings-commands.ts`: 設定宣言から読取りschema/更新コマンドを構築し、型検証・revision・保存を共通化。
- `applet-management.ts`: Applet管理の自動生成コマンド、永続化、状態確認、ローカル/MCP共通の同時操作ガード。
- `shortcut-commands.ts`: ショートカットの限定読取り、操作列の検証・原子的保存。共有keybindingsとSettingsCommandsのrevisionを使用。
- `tray-editing-commands.ts`: メニューとクリック割当をまとめて検証・保存。既存tray-menu/クリック判定/SettingsCommandsのrevisionを使用。
- `ribbon-commands.ts`: リボンの公開項目・配置の読取りと原子的編集。共有parseRibbonとSettingsCommandsのrevisionを使用。
- `gesture-commands.ts`: ジェスチャーの読取り、割当操作・動作設定の一括検証と保存。共有gesturesとSettingsCommandsのrevisionを使用。
- `src/shared/host-settings.ts`: 本体の通常設定の共通登録。既定値・検証・設定カタログ・PC専用投影・MCP公開へ接続する。
- `src/shared/settings-commands.ts`: 設定の公開Schemaとboolean派生コマンドの生成。
- `settings-targets.ts`と`src/shared/settings-operations.ts`: 固定6入口の探索・ページ分割・公開投影・変更要求の重複処理。検証と保存はSettingsCommandsへ委譲する。
- `automation-mcp.ts`: 従来方式は公式MCP TypeScript SDKによるstateless Streamable HTTP。`mcp-modern.ts`でMCP 2.0（2026-07-28）も同じendpointへ接続します。JSON応答、GET/DELETEは405。1要求64KiB、同時8要求、要求受信10秒・socket無通信60秒。API呼出しの監査ログを既存HostLogへ渡します。
- `automation-commands.ts`: 提供元の公開宣言を共通の条件で照合し、Applet情報を限定投影。
- `automation.ts`: PC専用設定、暗号化、起動/停止、登録状態、接続テスト。
- `codex-registration.ts`: smol-tomlで構文・意味を検証した限定範囲の編集。既存ファイル全体を再シリアライズしません。
- `CodexSettings.tsx`: 設定内の専用ページ。PC専用操作を即時反映します。共有設定も即時保存し、全体保存バーはありません。

`dock:automation` IPCは本体Window/mainFrame/URL検査を通し、WebAppletやAppletページへ公開しません。本体のprepareSettings/commitSettingsを共有して保存します。APIからWindows起動登録・UACを呼びません。

MCP 2.0の`server/discover`と`events/list`/`events/subscribe`/`events/unsubscribe`は[通知イベント設計](mcp-events-design.md)を参照してください。`apiVersion: 2`はAppDock操作APIの版であり、MCPのprotocolVersionとは別です。イベントの購読と送信待ちは、入口ごとにPC専用領域へ暗号化して保存します。

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
| shortcuts.get | appdock_get_shortcuts | 引数なし。bindings/options/revision/scopes/assignableCommands/globalHotKeys/warning/各許可。 |
| tray.get | appdock_get_tray | 引数なし。menu/clicks/fixedCommands/assignableCommands/revision/warning/各許可。 |
| ribbon.get | appdock_get_ribbon | 引数なし。layout/items/retainedIds/revision/warning/各許可。 |
| gestures.get | appdock_get_gestures | 引数なし。settings/bindings/revision/gestureTypes/scopes/assignableCommands/warning/各許可。 |
| ui.ribbon.get | appdock_get_ribbon_view | 任意contextId。リボンの表示モデル・epoch・revision・操作ID |
| ui.assets.get | appdock_get_ui_asset | モデル内のassetIdをidへ指定。PNG/WebPのdata URL |
| ui.actions.invoke | appdock_invoke_ui_action | epoch・requestId・actionId・任意contextId。モデルで公開された操作を実行 |

公開範囲の正本は`appDockOperations`のcallersです。入力APIはApplet専用で、MCPには直接公開しません。描画モデルの詳細は[リボンの描画](ribbon-ui.md)を参照してください。

設定変更はcommands.executeに集約します。本体はappdock.settings.update、各Appletは`<appletId>.settings.update`です。changes/valuesは公開項目の平坦なオブジェクトで、hostやsettingsで囲みません。本体の対象はhostSettingDefinitionsに登録された単純設定です。現在のキー・型はsettings.getSchemaで取得します。主な例を示します。

読取りは共有とこのPCの設定の合成値、書込みは現在の保存先を使用します。本体のテーマ等とAppletの有効状態は常に端末別です。Appletの共有／端末専用はローカルUIで選択し、MCPへ保存先切り替えや他端末の設定を公開しません。公開項目・許可・dryRun・共通revisionの契約は維持します。

| キー | 値 | 適用タイミング |
| --- | --- | --- |
| theme | dark/light/system | immediate |
| closeToTray | boolean | nextClose |
| startMinimized | boolean | nextStart |

`{"id":"appdock.settings.update","args":{"changes":{"theme":"light"},"expectedRevision":"<取得したrevision>","dryRun":true}}`で検証します。dryRunでも情報取得・設定変更の許可とrevision照合が必要です。未知項目・余分な引数・型不一致・空changesを拒否し、指定外を保持して一括保存します。同じ値だけなら書きません。

revisionは実行ごとのUUIDとSettingsStoreの変更番号からなる不透明な文字列です。本体再起動前の値は使えません。本体の設定コマンドサービスをローカル操作とMCPで共有するため、MCPの停止・再開だけではrevisionの実行IDは変わりません。保存直前にディスクも確認し、未通知の外部更新・破損を上書きしません。GUIは妥当な変更ごとに即時保存します。操作前の値と現在値を比較し、APIと同じフィールドを変更した古い入力は競合として拒否します。途中入力と失敗値は現在の画面内に保持します。ファイル同期の未到着な変更までmergeする保証はありません。

エラーコードはINVALID_ARGUMENT、NOT_FOUND、NOT_READY、WRITE_DISABLED、REVISION_CONFLICT、SAVE_FAILEDです。MCPはisErrorとtext/structuredContentにコードと説明を返し、秘密値や全設定を返しません。保存完了と全Appletの非同期reconcile完了は区別します。

未公開コマンドの実行/一般設定、アカウント/認証、更新適用、任意画面操作は公開しません。将来の入口も共通APIの検証と保存を使います。

## ジェスチャー編集

取得は`gestures.get`（MCP `appdock_get_gestures`）、変更はcommands.executeの`appdock.gestures.update`です。既存のマウスジェスチャー画面・入力処理を使用し、右ボタンを押しながら操作します。

取得結果のsettingsは保存済みGestureSettings、bindingsはその割当一覧です。gestureTypesは1段階移動4方向・2段階移動12種類・左/中クリック・ホイール上下のIDと表示名、キー操作は`key:Ctrl+A`形式です。2段階移動は`move-right-up`や`move-up-down`など異なる2方向を順番に指定します。同方向の重複と3段階以上は拒否します。scopesはglobal/desktop/app/pages/owner/applets/browser/exeで、desktopはglobalの直下です。assignableCommandsの公開済み引数なしコマンドを新規割当に使用できます。ownerIdと現在のavailableはショートカットと同じ意味です。取得にGUIの未確定入力、他の設定、認証情報、対象アプリの稼働状況は含みません。

編集には情報取得と設定変更（allowWrite）の許可が必要です。コマンド実行許可は不要です。許可自体はローカルの「操作の許可」で変更し、MCPから変更できません。従来の*EditingAllowedはallowWriteから導出します。

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
- configure: changesでenabled、activateOnStart、browsers、excludedProcesses、requireChromiumWindowClass、distance（5〜500）、wheelDelayMs（0〜5000）、executionMode（all/first）、indicatorOpacity（0.1〜1）、indicatorPosition（gesture-start/cursor-follow/window-center/monitor-center/none）、indicatorShowNoAction（boolean）を部分更新します。indicatorShowNoActionがfalseの場合は実行対象のない移動の待機表示を隠し、ジェスチャーの認識・実行・取消は維持します。cursor-followはカーソルの少し右下へ待機表示だけを追従させ、画面端で現在のモニター内へ収めます。executionModeは条件一致のすべて／最初の1つ、noneは待機表示なしです。省略された旧executionModeはallになります。bindingsの直接置換は受け付けません。トレイの一時停止は保存設定と異なり、この操作では変更しません。

desktop条件はデスクトップの背景・アイコン領域だけに一致し、フォルダー画面やタスクバーを含みません。whenの任意のboolean `excludeDesktop`はglobal/exeでtrueを指定でき、省略はfalseです。その行だけをデスクトップの開始候補から除外します。別のdesktop条件の行は維持し、候補がなければ通常の右クリックを通します。例: `{"scope":"exe","appletIds":[],"processes":["explorer"],"excludeDesktop":true}`。他のscopeでtrueを指定するとINVALID_ARGUMENTです。monitor-centerは開始時のカーソルがあるモニター全体の中央へ表示し、window-centerも対象がデスクトップなら同じ表示位置になります。

exe条件のprocessesはパスを含まない実行ファイル名を1件以上指定し、その他の条件では空配列です。browsers/excludedProcessesも同じ形式で件数上限なし。末尾.exeと大文字小文字を正規化します。applets条件だけappletIdsへ登録済みIDを1件以上指定し、その他では空配列です。本体コマンドにownerは使えません。旧未公開/未導入の割当は保持・無効化・削除でき、既存の同じ入力内で並べ替えられます。新規追加・再有効化・その他の更新は公開済み引数なしコマンドに限ります。

operationsは1〜100件、割当の件数上限なし。既存parseGestures/入力正規化/実行順処理を共用し、一括検証後に1回だけ保存します。dryRun/無変更は保存せず、途中エラーも全体を保存しません。他の本体/Applet設定・ショートカットとrevisionを共用し、未通知のディスク更新・再起動・GUIの未確定入力に対する競合保護を維持します。エラーはINVALID_ARGUMENT/NOT_FOUND/COMMAND_NOT_ASSIGNABLE/REVISION_CONFLICT/SAVE_FAILED、および実行/書込/編集の許可不足です。

結果はdryRun/changed/settings/bindings/revision/warning/applies=gesturesChanged、completionはvalidatedまたはsettingsSaved、effectVerified=false。入力処理への反映は非同期であり、保存完了は物理ジェスチャーの成功や現在の一時停止解除を示しません。全API呼出しを既存automationログへ記録し、操作引数やexe名はログに残しません。

## ショートカット編集

`shortcuts.get`と`gestures.get`は`pages`に現在のページ候補（id/titleとAppletページの提供元）を返します。本体5ページは設定も含み、Appletは各宣言ページが対象です。編集時の`when.appletIds`にはこのページIDを指定できます。対象IDと共通判定は[ページ候補と識別](keybindings.md#ページ候補と識別)を参照してください。

取得は`shortcuts.get`（MCP `appdock_get_shortcuts`）、変更は既存のcommands.executeへ`id=appdock.shortcuts.update`を渡します。

`options.enabled`はキージェスチャー全体の有効値です。既定・欠落時はtrue、configureのchangesへbooleanを指定して切り替えます。OFFはキーの実行と元入力のブロックを止め、割り当てを保持します。expectedRevision・dryRun・キー編集の許可境界は従来どおりです。動作範囲と保存は[キージェスチャーの設定](keybindings.md#設定)を参照してください。

`options.executionMode`に有効な実行方法を返します。`first`は条件に一致した先頭1件、`all`は全件を登録順に選び、同一コマンドの重複を除きます。省略時はallです。firstで選んだコマンドが実行中・失敗になっても次へ繰り下げません。ジェスチャーとは独立した設定です。

`options.browsers`と`options.requireChromiumWindowClass`はキー用のブラウザ判定設定です。configureのchangesへこれらを部分指定できます。exe名はパスを含めずに指定し、大小文字と`.exe`を正規化します。ジェスチャー側の設定は変更しません。whenのscopeはglobal/desktop/app/pages/owner/applets/browser/exe、exeだけはprocessesを1件以上指定します。global/exeではexcludeDesktopも使用できます。条件に一致しない場所では元のキー入力を通します。globalHotKeysのeffectiveBlockOriginalInputは設定上の合成値であり、現在の前面アプリで入力を止めた証拠ではありません。

読取りは保存済みのbindings（id/command/key/enabled/whenと任意のblockOriginalInput）を実行順に返します。blockOriginalInputは条件に一致した外部入力を止めるbooleanで、省略時true。旧行への既定値の書込みは行わず、updateで省略した場合は保存済み値を保持します。keyはWin／Windows／Meta修飾キーにも対応します。globalHotKeysのregisteredは共有フックへの適用成功を表し、backend="hook"とキー単位のeffectiveBlockOriginalInputも返します。OSの排他予約や実効果の保証ではありません。GUIの未確定入力は含めません。全設定・Applet設定値・認証情報は返しません。assignableCommandsは新しく割り当てられる公開済み引数なしコマンド（id/title/available/ownerId）。停止中Appletも設定先として選べますが、実行可否はavailableで区別します。設定更新などの引数必須コマンドは割り当てられません。ownerId=nullの本体コマンドには「提供元のApplet」条件を使用できません。

既存の未公開/未導入コマンドへの割当もbindingsへ返して保持します。それらは無効化・削除できますが、外部からキー/条件を変更したり有効化したりはできません。reorderは既存の同じキーの行だけを並べ替えます。ローカルの編集画面にはこの外部公開制限を加えません。

編集には情報取得と設定変更（allowWrite）の許可が必要です。コマンド実行許可は不要です。許可自体はローカルの「操作の許可」で変更し、MCPから変更できません。従来の*EditingAllowedはallowWriteから導出します。

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
- `configure`: `changes: { "executionMode": "first" }`または`"all"`を指定します。割り当て操作と同じoperations内で原子的に保存し、同じ許可・expectedRevision・dryRunを使います。保存時にコマンドを実行しません。一般設定APIからの変更は公開しません。

scopeはglobal/desktop/app/pages/owner/applets/browser/exeです。appletsだけはページIDまたは既存のApplet IDを1件以上指定し、他はappletIdsを空配列にします。既存の未導入対象は変更しない限り保持します。同じキーの複数割当を一律に競合扱いせず、既存の条件・実行順を使用します。同じコマンドが複数の条件で一致しても1回の押下では1回だけ実行します。

operationsは1〜100件、全割当の件数上限なし。既存parseKeybindings/キー正規化/条件検査/同じキー内の順序検査を共有します。全操作をメモリ上で検証し、1件でも不正なら保存しません。指定外の割当/設定を保持し、withKeybindingsでshortcuts/globalShortcutCommandsの互換フィールドも揃えます。dryRunは保存せず結果を返し、同じ許可とrevisionが必要です。同じ結果なら保存しません。

revisionは本体/各Applet設定と共通です。他の設定編集・再起動・未通知のディスク変更でも古いrevisionを拒否します。保存は既存prepareSettings/commitSettingsを使用し、GUIの未確定入力を消さず、古いGUI版の保存は競合として拒否します。応答はdryRun/changed/bindings/options/revision/warning/appliesを含み、completionはvalidatedまたはsettingsSaved、effectVerified=false。共有フックへの適用は非同期なので、保存成功だけで入力適用の成功と扱わず、shortcuts.getのglobalHotKeysを再取得してください。適用エラーは限定した説明へ置き換えます。

追加エラーはWRITE_DISABLED、COMMAND_NOT_ASSIGNABLEです。INVALID_ARGUMENT/NOT_FOUND/REVISION_CONFLICT/SAVE_FAILEDと既存の実行・書込拒否も使用します。変更はautomation監査ログへ結果を記録し、キーやbinding IDなどの引数は記録しません。キー入力の送信、既定テンプレート、Applet初期化状態、ジェスチャー/リボンの編集はこのAPIに含めません。

## Applet管理

本体が登録済みのファイル型AppletとWebAppletに `appdock.applets.<appletId>.enable` / `disable` / `restart` を生成します。引数はありません。Applet固有コマンドの公開宣言とは独立した本体コマンドで、設定JSONにIDを追加するだけでは生成しません。管理コマンドは対象appletIdを持ちますが、ショートカット・ジェスチャー・トレイではAppDock所属です。無効なAppletのenableも候補に残ります。削除済みの対象を実行すると拒否します。

- enable/disable: enabledのみを既存SettingsStoreで保存し、他の設定を保持して状態を反映します。同じ値なら保存しません。有効化は設定済みの起動遅延に従います。
- restart: 有効状態を保存し直さず、ファイル型は停止して再起動予約（起動遅延を尊重）、WebAppletはビューを作り直して表示します。無効なAppletはUNAVAILABLEで拒否します。再起動は実行中処理を中断し得ます。
- 開始/停止処理中、同じAppletの管理処理中は拒否します。GUIの有効切替・再起動も同じ処理を使用します。実行前にディスクの設定競合を検査し、未通知の変更はCONFLICTで拒否して現在値を採用します。保存済み設定とGUIの未確定入力を混同しません。
- 成功応答はcompletion=lifecycleApplied、changed（enabledの保存有無）、applet（id/enabled/state）、effectVerified=falseです。waitingは予約状態で、起動完了を意味しません。起動失敗はLIFECYCLE_FAILEDになり、保存済みenabledは巻き戻しません。失敗/通信切断後は状態とログを確認します。

Appletの有効・無効はread + write、再起動はread + executeで判定します。旧allowManageAppletsは独立した許可として使いません。操作許可自体はローカル設定でのみ変更します。

カタログのpermission=applets.manageと、system.getInfo/commands.listのappletManagementAllowedで管理権限を確認できます。拒否はAPPLET_MANAGEMENT_DISABLEDです。取消は次の要求から有効で、開始済みの処理を中断しません。ローカル操作に外部操作の許可は不要です。MCPツールは既存の7件を維持し、管理操作もcommands.execute経由で監査ログへ記録します。

## 公開コマンド

コマンド一覧の任意の`category`は提供元が指定した分類名です。AppDock 0.130.0から返し、未指定のコマンドでは省略します。カテゴリの入力規則は[Applet API](extensions.md#動的コマンドとキー送信の一覧設定)を参照してください。

設定変更とは独立したallowExecuteをPC専用設定に保存し、初期値/未保存時はfalse。MCPの一覧には許可前も公開コマンドを載せ、executableで実行権限を示します。commandsの各項目はid/title/appletId（本体はnull）/available/unavailableReason/completion/inputSchemaです。設定変更にはpermission=settings.writeが付き、一覧のwritableで編集可否、executableで独立した動作の実行可否を確認します。接尾辞・表示名・aliasから許可を推測しません。

- 本体: appdock.open、appdock.settings.open、appdock.commands.search、appdock.applets.open、appdock.logs.open、appdock.updates.openと公開設定・Applet管理コマンド。updates.openは画面表示だけで、更新適用は行いません。
- ファイル型Applet: 各manifestでautomation: trueを宣言した正規コマンド。
- WebAppletの個別サイト: 提供元AppletのpageCollections宣言からopen/back/forward/reload/homeとname/displayの公開設定を生成し、共通設定コマンドに登録。詳細は[WebApplet公開操作](web-applets.md#公開操作)。

Appletは有効かつrunningかつ現在のcommand.availableがtrueの場合だけ実行します。既存のactivateOnExecuteで停止中Appletを有効化する経路には入りません。実行直前に一覧を再構築し、通常コマンドは既存executeCommandへ、設定コマンドは共通SettingsCommandsへ渡します。通常のApplet RPCコマンドは引き続き引数なしで、argsに値を渡すと拒否します。APIコマンドの同時実行は1件、重複時はBUSY。純粋な設定編集は設定変更許可で行えます。実行許可だけでは設定変更できません。許可の取消は次の要求から反映し、既に始めた操作の取消は保証しません。

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

MCPの既定公開とsecret/localOnlyの除外を利用するAppletはminimumHostVersionを0.88.0以上にします。これらのフラグは公開範囲を定めるもので、通常の設定値を暗号化する機能ではありません。認証情報の保存には既存Secrets APIを使います。

この生成コマンドの宣言にはminimumHostVersion=0.26.30以上、settings capabilityが必要です。各Applet自身のextension.jsonのsettingsにある対応型はMCPへ既定公開します。automation:false、secret:true、localOnly:trueは公開しません。他Appletからの共通APIにはautomation:trueを必要とします。旧settings.getSchema/settings.getと生成コマンドは最上位のboolean/number/string/静的selectを扱い、既存の型・最小最大・選択肢検証を共有します。宣言型一覧と動的selectは[固定設定API](settings-api.md)を使い、非公開の認証・セッションを一括公開しません。

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

初期対応: Gmailは監視/通知/ツールバー/未読のみと履歴件数、壁紙は停止と更新間隔を公開します。Gmailの外部リンク確認省略・通知内容表示、認証や画像フォルダーは非公開です。壁紙の旧start/stop/toggle/resume/pauseは廃止し、paused.off/on/toggleへ置換しました。

## API監査ログ

認証後にMCPのtools/callハンドラーへ届いた全API呼出しを、既存HostLogのsource=automationへ記録します。成功はinfo、拒否/失敗はwarn。MCP/API名/ホスト生成requestId/公開一覧に実在する対象ID/結果/処理時間を記録し、コマンド実行は受付時にもstartedを残します。未知ツール名はunknownに置き換えます。要求引数、設定値、token、コマンド戻り値、生のエラー文は記録しません。認証前の要求やMCP初期化・一覧取得はAPI操作ログの対象外です。

MCPは接続経路の表示であり、接続元をCodex固有の本人確認として断定しません。ログ画面の絞込みと既存host.log（1MBローテーション）を共用し、種類は`audit`として重要度と独立させます。表示を絞っても記録は継続します。[ログ仕様](logging.md)に従い、別の無制限ログは作りません。終了や切断でstartedだけが残る場合は完了を断定しません。

## 通信と保存

| 設定ページ | 待ち受け | AppDock側の保存 |
| --- | --- | --- |
| MCPサーバー | 既定は `127.0.0.1`。ネットワーク公開を選ぶと `0.0.0.0` でIPv4を受ける | `data/settings-<端末名>.json` の `mcpServer` に `enabled`、`port`、`connectionScope`、`networkHostnames` |
| Codex連携 | `127.0.0.1` の専用ポート | 配置別LocalAppDataの `automation.json` の `codex` に有効状態、ポート、Codexの設定先・登録名・所有情報 |

各入口は初期無効で、MCPの操作許可は共通です。2つの `AutomationMcp` で同じ `/mcp` を受け、`AppDockApi`、公開ツール、設定のrevision、同時8要求の上限を共有します。書込・実行などの許可は呼出し時と必要な保存直前に検査します。設定画面の有効化・停止・ポート変更・接続テストは選択した入口に適用します。

入口ごとの32バイト乱数のBearerトークンは、AppDock側ではElectron safeStorageで暗号化して `automation.json` に保存します。一般向けは `token`、Codex向けは `codex.token` です。同じ入口の同じトークンを使うクライアントは同一の認証主体として扱います。トークンの再発行・停止ではその入口の購読やジョブ管理の認可を失効させます。設定APIのrequestIdの重複判定は認証主体ごとです。

### 旧設定からの引き継ぎ

バージョン1の `automation.json` がある場合、旧設定の有効状態、ポート、公開範囲、追加ホスト名を、端末別の `mcpServer` が未保存のときだけ初期値として書き込みます。一般向けトークンの暗号文、MCPの操作許可、Codexの登録名・設定ファイル・所有情報を引き継ぎます。Codex側は旧設定の有効状態を引き継ぎ、独自のトークンとポートを割り当てます。端末別の保存が済んでからPC専用ファイルをバージョン2へ原子的に更新します。途中で失敗した場合はバージョン1から再試行でき、保存済みの端末別設定を上書きしません。

旧URLと旧トークンは一般向けの入口で使えます。「Codex連携」の「登録を修復」を実行してCodexを再読み込みすると、同じ登録名で専用ポートへ切り替わります。初回起動時の移行はCodexのTOMLを変更しません。

### 待ち受けと接続範囲

ポートに0を指定すると空きポートを選んで保存します。両方に同じ固定ポートは設定できません。起動時は認証付きの内部probeで自身のリスナーに到達することを確認し、選択ポートの保存が済んでから受付を開始します。保存失敗時は既存の待ち受けを保持します。設定の保存後にbindが失敗した場合は、該当側を停止中として表示し、「接続を再試行」で保存済み設定を使います。外部からの端末別JSONの変更も一般向けの待ち受けに反映します。

どちらもHost・Origin・Bearerを検査し、本文読込後とAPI呼出直前に受付と認証を再検査します。ループバックのHostは `127.0.0.1:<port>` です。一般側のnetworkでは、ループバック・現在のNICのIPv4・PCのホスト名・明示登録したDNS名と実ポートの組を許可します。Originは未指定か、検証したHostと同じHTTP originです。CORS許可は付けず、接続元や接続先の判定に転送ヘッダーを使いません。

一般側の公開範囲やポート変更はその通信を一時切断します。追加ホスト名だけの変更は保存後に検査規則を更新します。開始済み操作は応答が届かなくても完了する場合があります。結果が不明な操作を自動再送しないでください。

「MCPサーバー」の接続先候補には利用可能なIPv4を表示します。表示ではHyper-Vの `vEthernet (Default Switch)` を除外し、Hostの検査には全NICの候補を使います。外部クライアントにStreamable HTTPのURLとBearerを設定し、その端末から到達性を確認してください。LAN直結のHTTPとtailnetによる経路保護を区別します。

一般向けの「接続トークンをコピー」は明示操作時だけOSクリップボードへ書き込みます。秘密値は設定画面・状態応答・ログへ返しません。待ち受けの管理・コピーは本体設定UI専用です。最終接続時刻は認証済み通信の観測で、自己テストや起動probeは含みません。Codexのツール利用と別端末からの疎通は、それぞれ接続元で確認します。

## Codex登録

「Codex連携」ではこのPC専用の稼働状態と登録状態を表示します。「Codexへの登録」に、登録・修復、接続テスト、登録解除、config.tomlの場所と登録名をまとめます。「接続設定」には専用ポートと認証情報の再発行を置きます。

対象は同じWindowsホストのCodex。CODEX_HOME/config.toml、未指定ならホームの.codex/config.tomlを候補とし、絶対パスを画面で変更できます。WSL/リモートの自動設定はしません。

登録名の既定値はAppDockで、mcp_servers.AppDockのurl/enabled/required/http_headersだけを追加します。「Codex連携」で登録名を変更できます（英字で始まる64文字以内の英数字・ハイフン・アンダースコア）。複数配置にはAppDock_Testなど別の名前を指定します。同名の他登録は上書きしません。serverIdはCodexへの登録名、APIのinstanceIdと管理コメントは配置IDです。

旧登録や名前変更前の登録は「登録を解除」してから登録し直します。解除は配置の管理コメント・所有情報と対象範囲を照合し、旧名の登録だけを削除します。ローカルserverNameが未保存の場合はAppDockを既定値にします。

required=falseなのでAppDock停止をCodex全体の必須起動失敗にしません。Bearer tokenはCodexのローカルconfig.tomlにも平文で保存されます。画面・IPC状態・ログには出しません。

管理用コメントと範囲hashを使い、全TOMLの構文と範囲外の意味を検査します。現在の登録内容または保存済みhashと一致する場合と、期待する設定値が同じで改行・空白・項目順だけが違う場合は、そのまま修復/解除できます。外部で値が変わった登録も、この配置の管理コメントが一意で保存済み所有情報があり、対象サーバーだけを切り離せる場合は、共通ダイアログで登録名・ファイル・処理内容を確認して修復/解除できます。認証値や生のTOMLは画面・IPCへ渡しません。

修復はurl/enabled/requiredとAuthorizationを現在の接続へ合わせ、同じ登録のツール許可・タイムアウト・他のヘッダーなどを保持します。競合するstdio起動設定・別の認証方式やAuthorizationの環境変数指定は除きます。Codexがhttp_headersなどを別テーブルへ展開し管理コメントの外へ置いた場合も、対象サーバーのテーブルだけを抽出し、他の設定値と管理コメントを保持できることを検査します。全ファイルを再シリアライズしません。解除は追加のツール設定なども含む対象登録だけを除き、過去の全ファイルを復元しません。

確認は1回限りで、修復/解除の種類・選択ファイル・接続情報・所有情報・ファイル全体のbytesに結び付けます。確認中の変更や別操作で無効になった確認は再利用できず、ダイアログ内にエラーを表示します。取消は保存せず操作元へフォーカスを戻します。複数行文字列内の偽コメント・曖昧な管理範囲・同名の他登録・不正TOMLは変更しません。保存直前のbytes照合とatomic置換を維持し、既存内容があればconfig.toml.appdock-backupへ正確な復旧用コピーを保存します（既存認証値が含まれ得ます）。

外部アプリで登録を削除した結果、開始または終了コメントが1行だけ残った場合は、保存済み所有情報があり、同名のMCP登録が存在せず、そのコメントだけを除いてもTOMLの意味が変わらないときに限り再登録・解除できます。状態確認はファイルを書き換えません。コメントの重複・文字列内のコメント・登録本体が残る場合は従来どおり確認を求めます。

登録状態はファイルから確認し、MCP稼働と実接続日時を別表示します。登録/修復/解除後はCodex再読み込み/再起動を案内します。組織ポリシーや別profileの上書きまで、この画面だけで確認できるとは限りません。

## 検証

- `dev.bat run typecheck` / `dev.bat run build`
- `dev.bat exec node --test tests/automation.test.cjs tests/settings-commands.test.cjs tests/settings-sync.test.cjs`
- `dev.bat exec node scripts/mcp-server-startup-ui-test.cjs [A:/40.ARTIFACT/AppDock.at365/win-unpacked/AppDock.at365.exe]`で旧設定の移行・両入口の同時利用・片側停止・再起動を検査します。
- `dev.bat exec node scripts/codex-registration-ui-test.cjs [A:/40.ARTIFACT/AppDock.at365/win-unpacked/AppDock.at365.exe]`: 隔離した設定の外部変更・修復/解除・取消/フォーカス・確認中の競合を実画面で検査します。
- APPDOCK_TEST_CODEX_EXEへインストール済みCodexの絶対パスを指定すると、GUIで修復した隔離configを実Codexで読み込み、ツール発見と公開API呼出しを確認します。検証にだけapp-serverのMCP呼出しを使い、モデル推論や実利用の認証値は使いません。GUIのコマンド試験は製品にないIDの専用Appletを使い、実デスクトップ壁紙は変更しません。

証跡は.artifacts/automation-source-* / automation-portable-*とVERIFICATIONに記録します。ビルドをGUI検証と同時実行しません。

参考: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Codex設定](https://learn.chatgpt.com/docs/config-file/config-reference)、[MCP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)。

## リボン編集

layoutには`buttons`（件数上限のないコマンドボタン定義）と任意の`rightClickCommand`も含みます。操作は`addButton { id, title, icon, commandId, iconOnly?, placement }`、`updateButton { id, changes }`、`removeButton { id }`、`setRightClickCommand { commandId }`を追加しました。button IDは`button:<stable-id>`で、表示用items.kindはcommandです。保存済みの未登録コマンドも保持し、通常のretainedIdsへは分類しません。外部の取得・変更結果では公開されていないcommandId／rightClickCommandを省略するため、読取結果を保存型として丸ごと送り返さず、操作と変更対象だけを指定してください。編集はコマンドの実行許可を追加せず、実行時にも元callerと公開宣言・個別許可を検査します。

layoutに任意の`separatorTitles`（登録済みセパレーターIDから名前へのマップ）を含みます。`updateSeparator { id, changes: { title } }`で80文字以内の名前を変更し、空欄で自動生成名へ戻します。`addGroup`の任意`color`、`updateGroup.changes.color`は`#RRGGBB`またはnullです。色なしのnull、欠落、色の正規化、名前、削除・初期化はGUIと同じ共有検証を使います。グループ削除で色、セパレーター削除で名前も削除されます。保存・dryRunだけではコマンドを実行しません。

取得は`ribbon.get`（MCP `appdock_get_ribbon`）、変更は`commands.execute`の`appdock.ribbon.update`です。

編集には情報取得と設定変更（allowWrite）の許可が必要です。コマンド実行許可は不要です。許可自体はローカルの「操作の許可」で変更し、MCPから変更できません。従来の*EditingAllowedはallowWriteから導出します。

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

operationsは1〜100件。全操作を順にメモリ上で検証し、一つでも失敗すれば保存しません。GUIと同じparseRibbonを使い、ID配列・グループ・区切り線・明示配置の件数上限は設けません。reorderの不足・重複・別グループ混入、未登録区切り線参照、不明フィールドは拒否します。空グループのreorderは空idsだけを許可します。現在登録されていないページはupdate不可で、再導入後に編集できます。新たなApplet追加などで項目一覧が変わった場合は再取得してください。

表示名は前後空白除去後0〜80文字で制御文字不可、iconOnlyはbooleanです。itemOverridesは通常ボタンIDごとの`{title?, iconOnly?, lastKnownTitle?}`を件数上限なしで保持します。lastKnownTitleは編集保存時の登録名で、未導入項目の名前表示に使い、updateItemの指定対象にはしません。読取り・同値編集で名前記録を更新しません。空の別名は保存せず登録元名を使用し、グループ名が空の場合は実リボンのラベルを省いてアクセシブル名に「グループ」を使用します。ID・登録元の名前・実行先は変更しません。

revisionは全設定で共通です。古いrevision、プロセス再起動前のrevision、同期競合を拒否し、GUIの未確定入力は上書きしません。dryRunは保存せず変更後のlayout/itemsを返します。同値更新は保存せずrevisionも変えません。リボン以外の設定と、ローカルribbonの未知フィールドは保持します。

結果はdryRun/changed/layout/items/retainedIds/revision/warning/applies=ribbonChanged、completionはvalidatedまたはsettingsSaved、effectVerified=false。保存後の画面反映は非同期です。Appletを有効化したりページを開いたりはしません。非表示にした設定ボタンへは既存の設定を開くコマンドやトレイの固定「設定…」から戻れます。

エラーはWRITE_DISABLED、INVALID_ARGUMENT、NOT_FOUND、REVISION_CONFLICT、SAVE_FAILEDと既存実行/書込拒否を使用します。automation監査ログへAPI名・コマンドID・結果を記録し、操作引数や配置IDは記録しません。

## タスクトレイ編集

取得は`tray.get`（MCP `appdock_get_tray`）、変更は`commands.execute`の`appdock.tray.update`です。MCPは11ツール。更新後はCodexを再読み込みしてください。

編集には情報取得と設定変更（allowWrite）の許可が必要です。コマンド実行許可は不要です。許可自体はローカルの「操作の許可」で変更し、MCPから変更できません。従来の*EditingAllowedはallowWriteから導出します。

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

parentId=nullはトップレベル、それ以外はグループ項目のID。項目IDとコマンドIDは別です。同じコマンドは異なる項目IDで複数箇所へ置けます。グループは1段、名前は前後空白除去後1〜80文字で制御文字不可、項目数の固定上限はなく、IDは全体で一意。operationsは1〜100件、全操作を順に検証後1回だけ保存します。reorderは対象階層の未知/非公開コマンドの項目も含め、欠落・重複・別階層混入を拒否します。不明フィールド・ネストしたグループ・固定メニュー項目の追加も拒否します。

新規/変更先のコマンドはassignableCommandsから指定します。メニューではmenuAllowed=trueだけを使用し、固定「設定」「終了」の重複を防ぎます。クリック割当はmenuAllowedに制約されません。既存の未知/非公開コマンドは保持・移動・並べ替え・削除が可能で、同じ値の再指定は許可しますが、別の項目やクリック先への新規コピーは許可しません。groupのremoveは拒否し、中身を消したい場合も項目ごとに明示削除します。

共有revision/dryRun/no-op/競合拒否/GUIの未確定入力と同一フィールドの競合検査は他の編集コマンドと同じです。trayMenuが存在すれば空配列も尊重し、旧trayCommandsは派生値として更新します。リボン/キー/ジェスチャー/Applet設定などは保持します。

結果はmenu/clicks/dryRun/changed/revision/warning/applies=trayChanged。completionはvalidatedまたはsettingsSaved、effectVerified=false。保存後のトレイ反映は既存applySettingsが行い、保留中のクリックを取消します。編集自体はコマンド実行ではなく、実クリックの成功を保証しません。ダブル未設定ならシングルを即実行、ダブル設定時はWindowsの判定時間を待ち、ダブル成立時に先行シングルを取消す既存仕様を維持します。

エラーはWRITE_DISABLED、COMMAND_NOT_ASSIGNABLE、INVALID_ARGUMENT、NOT_FOUND、REVISION_CONFLICT、SAVE_FAILEDと既存実行/書込拒否です。automationログへAPI名・コマンドID・結果を記録し、グループ名/項目ID/クリック割当などの引数は記録しません。

## Applet専用操作

input.sendKeys/input.appCommandはMCPの列挙・直接実行に公開しません。Appletが明示公開するコマンドからの呼出しは全Applet共通の許可で実行できます。[公開先と許可](appdock-api.md)を参照してください。

旧shellRequirement付きコマンドは一覧で利用不可にし、共通の最終実行経路でも拒否します。[Applet API](extensions.md#廃止したshell-api)を参照してください。

## TTS読み上げ

現行の発話引数とサーバー一覧は最低ホスト版0.156.0。tts.speak / tts.connections.list / tts.voices.list / tts.jobs.get / tts.stopをAppletとMCPへ公開します。発話はconnectionIdで登録を選び（省略時は既定）、instructionsで今回の話し方を指定できます。voice/speedは受け付けず、声は登録した設定を使います。音声は常に等速で再生します。Appletはappdock-api capability、両入口はそれぞれのuseTts許可を使います。受付・状態・所有者・停止・重複判定とNode/.NET例は[TTS連携](tts-design.md#共通api)を参照してください。

## Codex連携の互換性

| 操作 | 反映する接続 |
| --- | --- |
| 一般側の接続範囲・ホスト名変更 | 一般側の接続範囲とHost検査 |
| 一般側のポート変更・トークン再発行 | 一般側クライアントのURL・認証設定を更新 |
| Codex側のポート変更・認証再発行 | 「Codex連携」の「登録を修復」で所有する登録を更新し、Codexを再読み込み |
| 各入口の停止・起動失敗 | 各設定ページで該当側の状態と再試行を確認 |

設定ページIDは一般側が `mcp-server`、Codex側が `codex` です。Codex連携は「Codex → AppDock」の受信設定を提供します。

## タッチパッドジェスチャー

MCP appdock_get_touchpad_gestures（touchpadGestures.get）でrevision・割り当て・接続状態を取得します。変更はcommands.executeのappdock.touchpadGestures.update / set-enabled / reconnect / clearを使用します。変更にはread + writeを必要とし、旧allowEditTouchpadGesturesは使用しません。updateには既存ジェスチャーと同じadd/update/remove/configure/reorder操作、明示接続にはenabledまたはgestureを渡します。Windows反映や入力状態は返却stateと再取得で確認し、effectVerifiedは実機入力を検証していないためfalseです。

詳細は[タッチパッドとWindowsの接続仕様](touchpad-gestures-design.md)を参照してください。
