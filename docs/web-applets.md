# WebApplet

WebAppletは独立した[Applet.WebApplet.at365](../../Applet.WebApplet.at365/README.md)が提供するNode Appletです。AppDock 0.45.0以上で動作し、Applet側に.NETやElectronを含めません。サイト管理・推奨設定の取得はApplet、ページ表示・Webアカウント・Cookie保存はホストの共通APIが担当します。

## 導入と操作

A:/40.ARTIFACT/Applet.WebApplet.at365/extensions/at365.web-appletをAppDockのextensionsへ配置し、Applet一覧で有効にします。「WebAppletを管理」でサイト・アカウント・新規サイトの初期ショートカットを編集します。サイトは個別の管理項目とリボンとして現れ、名前・表示先・キー割当を個別に設定できます。最大64サイト、1Appletにつき32アカウント枠です。

登録サイトと初期ショートカットは本体の宣言型一覧を使い、管理ページと設定ページで同じ表を表示します。編集は歯車、削除はゴミ箱、有効状態はトグルで操作します。追加/編集はダイアログのOKで1レコードを即時保存します。不正入力や競合時は入力を残します。URL、許可origin、枠の選択は両画面から編集でき、アイコンとWeb側の推奨設定取得は管理ページで扱います。管理ページでは枠がなければ明示追加時に「個人用」を作ります。サイトの削除は枠を削除しません。新規サイトのキー既定値は既存の割り当てへ遡及しません。

親Appletの停止は全サイト画面を閉じます。サイト単独の停止はそのページだけを閉じ、再起動はそのSurfaceだけを再生成します。ページ・Window切替は同じViewを使います。Windowの×は非表示です。各サイトのログイン可否は提供サービスに依存し、常時受信は保証しません。

## 保存と既存データ

サイトと初期キーはsettings.jsonのextensions.at365.web-applet.settingsへ保存します。旧webAppletsからの自動取り込みは行いません。移行済みの設定に記録されたIDと保存先の参照情報だけを読み取り、サイトID・リボン・キー・ログイン領域を維持します。参照情報を新たに生成・更新する処理はありません。

既存の共有名簿data/web-applets/accounts.jsonとPC専用web-applets/sessions、web-applets/windowsを引き続き使い、Cookieを移動しません。新規構成は共有data/web-profiles/at365.web-applet/accounts.jsonとPC専用web-profiles/at365.web-appletを使います。詳しい保存区分は[設定同期](settings-sync.md)、保存先の互換参照は[分離設計](dynamic-pages-webapplet-design.md)を参照してください。

本体単独更新では新Appletを自動導入しません。移行済みのデータを保持しますが、表示には対応Appletの配置が必要です。古いホストと新しい設定を双方向同期しないでください。旧版へ戻す場合は旧設定のバックアップと旧構成を使用します。

## Webアカウントと遷移

アカウントはApplet所有範囲で隔離します。同じ枠のサイトだけがログイン状態を共有し、GmailのwebAccountsとは別です。枠の名前はblur/Enterで即時保存し、Escapeで保存前の値に戻せます。枠の操作は設定revisionを変えません。使用中の枠は削除できず、クリア/削除にはホスト警告確認が必要です。取消を既定とし、削除待ち・junction拒否・外部同期との競合検査を維持します。

noneは開始文書とhash移動、same-originは同じscheme/host/port、anyはHTTP(S)へのトップレベル遷移を許可します。allowedOriginsは認証先等の完全なoriginを追加します。redirect/window.open/履歴にも同じ規則を適用します。画像や通信全体を遮断するネットワークフィルターではありません。

remoteページはsandbox/contextIsolation/webSecurityを有効にし、preload/Node/ホストIPCを公開しません。サイトのデバイス権限は拒否します。CookieやURLのquery/fragmentを外部操作APIへ返しません。

## 推奨設定

開始URLのlink rel=manifest、なければ同じoriginの/.well-known/appdock.jsonを取得します。name/short_name/start_url/iconsとappdock.schemaVersion=1のnavigation（none/same-origin）だけを解釈します。any、追加origin、アカウント、コマンド、ホスト設定は採用しません。

取得は認証なし、同一origin、最大3転送、要求全体5秒、HTML/画像256KB・JSON64KB。取得失敗でも手動登録できます。前回の取り込み値を記録し、手動変更と取得中の入力を保持します。PNG/JPEGの取得画像はホストで検証・32px PNG化します。手動画像はPNG/JPEG/WebP、4MB・2048px以下です。

## 公開操作

サイトのname/displayだけをsettings.getSchema/get/settings.updateへ公開します。open/back/forward/reload/homeと共通ライフサイクルを提供し、親が停止中の操作を拒否します。revision/dryRun/権限検査を共用します。URL/accountId/遷移規則/icon/imported、追加/削除、Cookie消去は外部公開しません。

通常の管理・公開経路はpageCollectionsの宣言を使います。旧web.<UUID>やat365.web-appletという名前から権限を推測しません。一般Appletでの利用は[動的ページ設計](dynamic-pages-webapplet-design.md)と[Appletページ](applet-pages.md)を参照してください。

## 検証

単体試験はtests/dynamic-pages.test.cjs、web-applets.test.cjs、web-profiles.test.cjs、web-api.test.cjs。動的local/remote GUIはscripts/dynamic-pages-ui-test.cjs。共通一覧とダイアログはscripts/web-list-ui-test.cjs、配布EXEはscripts/web-applets-portable-test.cjsで確認します。実サイト認証とfixtureは区別し、結果は[VERIFICATION](../VERIFICATION.md)へ記録します。

## 共通画像

WebApplet 0.3.0とAppDock 0.69.0以降は、管理ダイアログの画像を共通ライブラリーから選ぶ。提供JSONやメタデータで取得した元画像も、OK時に共通importへ渡す。サイトレコードのimageはRegisteredImageRef、既存iconのdata URLは保持する。imageを優先し、未取得時は既存iconへ戻る。ローカル管理ページは登録画像APIを使い、リモートサイトには渡さない。原画像・制約・グループは[共通画像](registered-images.md)を参照する。
