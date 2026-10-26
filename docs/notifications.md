# 通知基盤とShell表示

通知読み上げ機能は[通知読み上げ機能の仕様と設計](notification-speech-design.md)を参照する。種類別の読み上げON/OFFと、通知全体の声・速度の上書きを定義する。

選択した種類の新規通知は[MCP Events](mcp-events-design.md)で購読中のdot等へ送信できる。種類をOFFにすると有効な購読を保持して送信待ちを破棄し、ONに戻すと新しい通知から再開する。OFF中も有効購読の更新を受け付ける。通知発行・表示APIとは独立した購読契約を使い、MCPから通知を任意発行するツールは追加しない。

通知状態と描画を分離する。バナー契約は[notifications.ts](../src/shared/notifications.ts)、種類定義・設定・方針契約は[notification-types.ts](../src/shared/notification-types.ts)。

## 本体のサービス

NotificationServiceはinfo/warning/error、timed/manual/condition、操作、所有者単位のdedupeKey、通知状態、表示先状態を管理する。timedは受付時からの実時間で期限切れとなり、通常は表示されない時間も進む。ロック・サスペンド中は残り時間を停止し、その間の新規通知は解除後から表示時間を数える。通常の更新では期限を延長せず、restartTimerを明示した更新で再設定できる。conditionは発行元のresolve/withdrawで終了する。

### ロック中の保留

`NotificationSession`はApplet開始前にElectron `powerMonitor.getSystemIdleState(1)`で現在のロック状態を確認し、以後のlock/unlock・suspend/resumeを監視する。Windowsの自動サインイン後にロックされたまま起動する場合も対象にする。初回状態が不明・照会失敗なら保留して1秒後に再確認する。idleはロックとして扱わない。

保留中はbanner/desktop/windowsへの投影を空にし、新規通知の読み上げ受付を解除後へ遅らせる。通知のID、状態、最新本文、安全な履歴は受付時点から通常どおり管理し、更新は同じIDへ集約する。解消・撤回・発行元停止・世代変更で無効になった通知は解除後に再提示しない。すでに表示済みだったWindows通知を戻す際は、本文が同じならOSの通知音を再度鳴らさない。実行中の自動読み上げは既存の取消方針に従い、再読しない。

Appletの`host.audio.play`による通知音も共通の`NotificationSounds`で保留し、解除後に共通音声FIFOへ渡す。待機は最大32件で、発行元の停止・世代変更・ホスト終了では破棄する。再生済みの音は再開時に繰り返さない。音声APIは通知IDと独立しているため、通知のresolve/withdrawとは連動せず、発行元が稼働中なら予約した音を再生する。未選択時の無音と既存の権限・WAV検査は維持する。

保留は起動中のメモリー内で行い、再起動を越えて配送しない。手動TTS・試聴と、明示的に選択したMCP Eventsの外部配信はこのローカル通知保留の対象外。MCP Eventsは従来どおり新規通知の発行時に評価する。設定項目・保存ファイルは追加しない。

targetsはbanner/desktop/windowsの複数指定、または空配列。必須先がない種類では、空配列は画面通知を使わない指定になる。読み上げとMCP Eventsは独立して選択でき、「通知センターのみ」は両方も解除する。旧Windows通知APIも同じ基盤へ接続する。種類指定Applet APIはNode/.NETで提供する。

同じ所有者・dedupeKeyのactive通知を更新し、終了後の再発は新IDになる。所有者は本体側が決定する。操作のホスト発行IDは現在の通知revisionと照合し、要求IDを最大512件記憶する。同じ要求の再送は同じ結果、異なる内容でのID再利用はエラーになる。通知単位のロックで別表示先からの二重押下を拒否し、失敗後は明示的に再試行できる。終了・撤回時に操作関数を回収する。

アクティブ通知は全体200件・所有者50件まで。本体用に20件を確保するため、本体以外の所有者の新規受付は全体180件まで。同一キー更新は受付上限でも可能。終了後のメモリー記録は最大1,000件とする。

## 通知種類と設定

登録時の`levels`に使用可能なレベル（`info` / `warning` / `error`）、`defaultLevel`にその中の既定値を指定する。Node/.NETとも発行時に`level`を省略すると既定値を使い、指定する場合は宣言した範囲だけを許可する。本体・Appletの所有者や種類名にかかわらず、Default Shellは通知の実際のレベルで配色する。

バナー・デスクトップ通知・通知センターは共通のレベル配色を使う。`info`はライトでは白背景・濃い文字・アプリの緑（`#217a65`）、ダークでは暗い背景（`#191f23`）・明るい文字・明るい緑（`#7ce1c5`）を使う。緑は枠のポイント・レベル表示・主要操作へ添える。`warning`は黄系、`error`は赤系を維持し、明暗テーマに合わせて文字の明度を調整する。レベル名も表示し、色だけに意味を依存させない。Windows通知の外観はOS、追加Shellの外観はそのShellが管理する。

種類別の「既定に戻す」ボタンは設けない。通知先・表示時間・読み上げは個別に即時保存する。未指定項目の既定値継承と、既存の保存値は維持する。

本体の処理失敗は、機能ごとの種類を増やさず「エラー通知」へ接続する。初期状態はバナーとデスクトップ通知、閉じるまで表示、読み上げOFF。バナーは必須で、通知全体のOFFは設けない。ログも残す。共通入口と接続済み範囲は[共通のエラー通知とログ](error-reporting.md)を正本とする。「設定 → 通知」は内部のownerIdによらず本体の種類を一つのAppDock欄へまとめる。

確認・対処が必要な状態は本体の「警告通知」へ接続する。既定はバナーとデスクトップ通知、閉じるまで表示、読み上げOFF。バナーは必須で、通知全体のOFFは設けない。同じ状態の間は閉じる・期限切れ後に再表示せず、本体ログで確認できる。共通入口・状態寿命・整理導線は[警告通知の設計](warning-notifications-design.md)を参照する。

notificationCatalogは本体定義とmanifest.notificationTypesを集約する。Appletはnotifications capabilityとminimumHostVersion:0.30.0以上が必要。notifications capabilityを持ち、notificationTypesが未宣言または空のAppletに限り、予約ID appdock.legacyの「旧方式の通知」を本体が生成する。GmailなどnotificationTypesを宣言したAppletはpublish/endを使い、宣言済み種類だけを設定に表示する。Applet自身による同IDの宣言を拒否し、本文から種類を分類しない。既定Windows/manual、表示先・時間指定が可能。

「設定 → 通知」は本体の共通設定画面を使い、読み上げ共通値は確定後すぐ保存し、通知種類の設定は編集ダイアログのOKでまとめて保存する。通知そのもののOFFは設けず、種類ごとの通知先・表示時間・読み上げを共有settings.jsonのnotificationPreferences.overridesに保存する。targets/durationSecondsの省略は既定継承、durationSeconds:nullはmanual。時間は1〜86,400整数秒、userDurationだけ編集できる。conditionは利用者の設定で時限化できない。通知種類は一つのテーブルで、通知名（提供元マークと説明ヒント）・通知先・表示時間・読み上げ・MCP Events・鉛筆の編集操作を表示する。必須の通知先、固定の表示時間、停止中のAppletや前提不足などの状態も一覧に残す。編集は共通ダイアログ内の一時入力とし、取消では保存しない。OKでは元の上書き値と通知仕様を照合し、その通知だけを最新の設定へ合成する。競合・保存失敗では入力と原因をダイアログに残す。未変更の既定値は明示値として固定しない。

表示先変更は同じIDと期限を保ち、表示時間変更は新しいepisodeまたは明示restartTimerから適用する。停止/世代変更は旧世代をwithdrawnにする。共有設定が未導入の種類や未対応先を含んでも保持し、配送できない場合は理由付きsuppressedとなる。画面の通知先はbanner/desktop/windowsと読み上げを選択できる。視覚的な表示先は従来のtargets、読み上げはspeakに保存する。「通知センターのみ」はtargets:[]かつspeak:falseで、選択時に両方を一度に反映する。targets:[]かつspeak:trueは読み上げとセンターの履歴だけを利用する。

TypedNotificationsは呼出元/宣言/現在世代を検証してrawサービスへ接続する。種類別dedupeでも上限50件はApplet全体で共有する。発行頻度はAppletごとにバースト20件、毎秒10件補充で、endは除外。API署名・manifest例は[種類指定Applet API](extensions.md#種類指定通知api)。

### 通知種類の制約

登録側は許可先・既定先・必須先を指定する。必須の表示先は`allowedTargets`と`defaultTargets`にも含める。

| 登録定義 | 動作 |
| --- | --- |
| `requiredTargets:['banner']` | バナーを必ず含める。バナーの解除とセンターのみへの変更を拒否する |
| `requiredTargets:[]` | 許可された表示先をすべて外してセンターのみへ変更できる |

エラー・警告・インフォメーション通知は`requiredTargets:['banner']`を使う。Appletにも必須先を宣言できる。通知の寿命や閉じる操作は`lifetimePolicy`の別の契約で、バナー必須だけでは常時表示を意味しない。

設定UIは必須先をチェック済みで編集不可にし、理由を表示する。設定更新APIからの必須先解除も検証で拒否する。UIでその種類を編集するときは必須先を補完して保存する。これにより読み上げや表示時間の変更が古い制約違反値に妨げられない。

旧`host.notifications`と種類別`enabled`は読込時に破棄し、旧OFF値で通知を抑止しない。公開設定・ON/OFFコマンドも削除する。manifestの旧`defaultEnabled`・`canDisable`・`disabledControlReason`は互換読込だけを残し、実効定義には含めない。読込だけでファイルを書き換えず、次の通常保存で不要項目がなくなる。実行世代・発行元停止・不整合な通知先を検査する内部方針`NotificationPolicy.enabled`と抑止理由は維持する。

## インフォメーション通知

本体の操作結果は「インフォメーション通知」へ集約する。通知設定では警告通知の直下に配置し、既定はON・バナーのみ・6秒・読み上げOFF。バナーは必須で、通知全体のOFFは設けない。更新確認、Codex連携、明示保存、Webアカウント、読み上げ受付・停止、既存のコマンド実行結果を接続する。通常の即時保存や入力途中の説明へ通知を増やさない。下側の汎用toastと更新結果表示を撤去し、更新中の進捗・キャンセルは残す。

## 履歴

通知は今回のAppDock起動中だけメモリーに保持し、通知履歴のファイル読込・保存は行わない。終了・再起動時にアクティブ通知と終了履歴を破棄する。再起動後は発行元が現在の状態を評価して必要な通知を新規発行する。

発行APIのhistoryはpersistent/session/noneを受け付ける。persistentは安全なhistoryTextを必要とする起動中の履歴で、ディスク保存を意味しない。activeの表示は詳細本文、終了後は安全な要約に置き換える。sessionも起動中だけ保持し、noneはactive終了時に除去する。終了時にcallbackと操作IDを回収し、終了した通知から操作を再実行しない。

終了履歴は全方針合計で最新1,000件を保持し、終了時刻の古いものから自動整理する。アクティブ通知はこの上限の整理対象にしない。ownerKind/ownerId/typeId/endReasonを保持し、提供元・種類・終了理由を表示する。

未読・既読状態、未読件数、未読のみの検索、既読操作、履歴削除操作と一括選択は提供しない。通知センターはアクティブ/履歴のタブと、本文・レベル・発行元・終了状態の検索、履歴50件ずつのページングを提供する。アクティブ通知の固有操作と「閉じる」は維持し、閉じた記録は履歴へ残す。閉じることと問題の解消は別の状態として扱う。

発行元フィルターでは、本体の更新・エラー・警告などをひとつの「AppDock」にまとめる。Appletは内部の発行元IDで区別し、表示名が同じでも統合しない。アクティブ/履歴の両タブで同じ単位を使い、通知自身の発行元・所有者・操作権限は変更しない。

リボンの通知センターはNotificationServiceのactive件数を共通バッジへ投影する。通知IDごとに1件とし、複数の表示先、通知センターのみ、ロック中の保留を含める。同じIDの更新・検索・センターを開く操作では増減せず、新規発行で増加、閉じる・解消・期限切れ・撤回・発行元停止で減少する。0件は非表示、1〜99件は数値、100件以上は99+。ツールチップ/支援技術向けの説明には実件数を使う。アイコンのみ/名前付き、配置変更、グループの子と親の点表示は共通リボン契約に従う。

バナーとデスクトップのShell提供元はhost.shellProvidersのnotification.banner・notification.desktopで指定する。フォールバックと故障抑止は領域ごとに行い、同じworkerの停止では依存する各領域を失効させる。切替で通知を再発行せず、同じID・期限・操作状態を使う。通知センターは本体rendererで共通描画し、Controllerが検索・ページングを保持する。デスクトップの可視判定は専用Windowに従い、本体を隠しても無効にしない。

## Shellの領域とbridge

minimumHostVersion:0.29.0以上のShell Appletは、shell.viewsで次を宣言できる。

```json
{ "notification.banner": "notifications.html" }
```

専用preloadはDefault Shellと追加Shellの両方にwindow.appdockNotificationsを公開する。通常のwindow.dockとNode APIは渡さない。接続元のWebContents、mainFrame、URLと現sessionを検査する。

1. onChangedを購読し、connectでsessionId/providerAppletId/snapshotを取得する。
2. themeを適用してsnapshotを描画後、ready(sessionId)を送る。
3. actへnotificationId/revision/requestId/type:invoke/actionId、またはtype:dismissを渡す。表示中のactive通知だけ操作できる。
4. resizeで描画した高さをCSS pxで報告する。ホストが最大高さを制限する。
5. onFocusに応じて先頭操作へ移動し、focusHostで元のWebContentsへ戻す。
6. getSettings/onSettingsChanged/executeCommandは他のShellと同じ自Applet用契約を使う。executeCommandは自身の登録済みコマンドに限定する。

モデルはschemaVersion:1/contextId:primary/sessionId/revision/dark/items/viewportと任意のsurface:banner/desktop。itemsは発行順。viewportはCSS pxのwidth/maxHeight。古いrevisionを無視する。NotificationSurfaceControllerが表示モデルと操作を持ち、NotificationSurfaceHostはネイティブViewの寿命・ready・位置・復旧だけを管理する。

## 配置と復旧

通知カードはレベル色の細い均一枠を使用する。バナーとデスクトップ通知の閉じるアイコンはカード右上、通知センターではカード外の左列に置く。閉じる操作のない行も左列を確保し、カードの位置を揃える。終了済みの履歴には閉じる操作を表示しない。

Window上部48 CSS pxへ、幅最大680 CSS px/左右余白16 CSS pxの小さなWebContentsViewを重ねる。幅・高さとzoomをDIPへ変換する。本文レイアウト、Web/AppletのView、入力、sessionを維持する。ページより上、モーダルパレットより下へ置き、ページの追加とバナー更新の後もモーダルを最後に配置する。

Default Shellは最大3カードを通常表示し、超過分を「ほかN件を表示」で展開する。利用可能高さ40%を目安に領域内をスクロールする。新規通知でfocusを奪わず、タイトルバーの「通知」から操作へ移れる。EscapeとTab境界で元の画面へ戻る。色・アイコン・レベル名を使い、新規通知の読み上げを行う。

ready期限は10秒。Shell切替先のreadyまでは旧Viewを保持し、同じ通知ID・期限・操作ロックを引き継ぐ。未提供/無効/停止/故障領域はDefault Shellへ戻す。通知領域の同じ提供元・版の故障はプロセス内で記憶し、「Shellを再試行」または新版で再試行する。safe起動はDefault Shellへ固定する。Default Shellも利用不能な場合は最小ネイティブdialogとログを使い、通知を再帰的に発行しない。

## 独立デスクトップ表示

notification.desktopはminimumHostVersion:0.31.1以上の追加Shellで提供できる。同じwindow.appdockNotificationsとカードを使用し、openCenter()で通常の通知センターへ移動できる。接続/ready/操作は表示先ごとのIPCチャネルとsessionに束縛する。既存NotificationBannerApi/Modelという公開型名は互換のため維持する。

NotificationDesktopHostは通知がある間だけ独立Windowと表示可否query workerを作る。本体を隠しても表示し、最後のdesktop対象がなくなると両方を破棄する。showInactiveで新着時のfocusを保ち、カードをクリックした時だけ操作先としてfocus可能。Escapeはdesktopのfocusを解放し、センターを開く操作は本体を表示する。

トレイ座標の画面、取得できなければ本体の画面のworkAreaへ配置する。座標はDIP、幅最大440/高さ最大600または作業領域60%、余白12。トレイがある側の隅を選び、負の画面座標や狭い画面も範囲内へ収める。画面追加/削除/作業領域・scale変更で再計算する。

[SHQueryUserNotificationState](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shqueryusernotificationstate)のACCEPTS_NOTIFICATIONSだけを表示可能とし、desktop対象がある間に1秒ごと問い合わせる。ロック/サスペンドのイベントと本体の全画面化も抑制する。非表示はdelivery:hiddenで、通知自体はactiveを保ち、期限は進む。問い合わせ失敗はログへ記録し、センターの閲覧を継続する。自動worker再起動を繰り返さず「Shellを再試行」で再問い合わせできる。

Shell未提供/故障は同じ共通HostでDefault Shellへ戻る。Default Shellも利用不能なdesktopはdelivery:failedとログを使い、勝手にバナーへ配送しない。バナーのDefault Shell全故障時に使うネイティブdialogをdesktopへ複製しない。

## 設定画面との境界

通知基盤は編集状態を持たず、設定エラーは現在の設定ページへ表示する。通常の保存成功通知を出さない。過去の未保存通知の終了履歴は保持期限まで読め、操作を復元しない。

## 検証

単体回帰はtests/notification-foundation.test.cjs、関連するsettings-editing/shell-boundaries/ui-presentation/notification-routing/notification-services。scripts/notification-banner-ui-test.cjsは汎用発行元の隔離Electron fixtureで複数通知、期限、操作、フォーカス、provider切替と復旧を確認する。scripts/settings-shell-ui-test.cjsは即時保存とShell復旧を確認する。host-pages-ui-test.cjsとnavigation-ui-test.cjsは重なり順と入力反映待ちの関連回帰。実測と制約はVERIFICATIONへ記録する。

## Windows表示の実装

NotificationWindowsAdapterはactiveのwindows対象を1件ずつ投影する。startupReady後に受付を開始し、状態はpending/accepted/hidden/failedとして通知の寿命から分離する。acceptedはOSへの受付で、ユーザーが見た証明ではない。busy/配送報告では再送せず、タイトル/本文/レベル/消音が変わった時だけ同じIDのOS記録を置換する。表示先を外す、終了、無効化、発行元停止では自身のOS記録と起動callbackを回収する。撤去はOSへのbest effortで、別表示先へ無断配送しない。

Windows Tagは通知IDのSHA256先頭16桁、Groupは配置/profile固有protocol末尾16桁。callback URIはランダムtoken、所有者/世代/現行操作を本体で再検査する。通常の種類指定通知のクリックは通知センターへ移動する。複数ボタンはセンターで操作する。旧showのcommandと起動時更新のお知らせは、本体ウィンドウを表示してから個別操作を1回だけ実行する。個別操作がない通知、および停止/期限/内容置換後や前回起動時の古いURIは、本体を表示して通知センターを開く。古いURIから個別操作を復元しない。終了時はcallbackを破棄してOS履歴を残し、再起動で過去の操作を復元しない。

管理者起動中のAppDockへ通常権限のWindows通知から戻る場合も、portableランチャーは必要最小限の同期権限で既存ホストへ合流する。起動途中の通知引数はstartupReadyまで保留し、準備後に既存の通知操作へ渡す。`scripts/notification-portable-test.cjs`は起動直後の更新完了通知のShell URI起動を含み、`scripts/portable-mutex-access-test.cjs`は専用のGate/Runtimeだけに制限ACLを設定して全権限拒否と実EXEの引き継ぎ・終了・実行領域保持/回収を確認する。試験のACLはfinallyで復元し、UACや実利用のACLは変更しない。

旧showは本体生成appdock.legacyへ統合。署名・null・100/500文字制限・silent・登録済み所有コマンド検査を保持する。既定はWindows/manual。履歴は固定の汎用要約だけを保存し、旧本文に安全な要約があると推測しない。Appletが予約IDを宣言することを拒否する。起動時更新検出もhost/updates/available (Windows/manual、消音)へ統合し、更新適用成功host/updates/appliedの既定banner/6秒は維持する。

Windowsの集中モード、表示有無、ポップアップ表示時間、manual時の常時表示はOSが管理する。基盤の時限はactive/センターでの操作期限であり、OSのcloseは基盤のresolveにしない。OS表示を閉じても基盤activeならセンターで操作できる。この違いを通知設定に表示する。固定Electronの[Notification](https://www.electronjs.org/docs/latest/api/notification)と実WindowsのTag/Group・履歴・Shell URI起動を検証し、物理クリックと実メール受信は別の未確認事項として記録する。

## 通知音との併用

「設定 → 一般 → 音の再生」がOFFの間は、読み上げ・通知音・試聴の共通APIでの再生を省略する。OFFへ切り替えると再生中と再生待ち、ロック・サスペンド中の通知音保留を破棄し、ONへ戻しても再生し直さない。通知の表示・履歴・音声生成は継続する。詳細は[共通音声再生API](audio-playback.md#音の再生のonoff)を参照する。

種類指定通知のsilent:true（最低ホスト0.42.0）はWindows自身の音を抑制します。Appletの通知音は[共通音声再生API](audio-playback.md)へ渡し、通知の読み上げ・試聴と重ならないようにします。
