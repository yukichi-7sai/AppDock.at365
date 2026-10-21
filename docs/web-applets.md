# WebApplet

WebAppletは独立した[Applet.WebApplet.at365](../../Applet.WebApplet.at365/docs/usage.md)が提供するNode Appletです。AppDock 0.45.0以上で動作し、Applet側に.NETやElectronを含めません。サイト管理・推奨設定の取得はApplet、ページ表示・Webアカウント・Cookie保存はホストの共通APIが担当します。

## 導入と操作

A:/40.ARTIFACT/Applet.WebApplet.at365/extensions/at365.web-appletをAppDockのextensionsへ配置し、Applet一覧で有効にします。「WebAppletを管理」でサイト・アカウント・新規サイトの初期ショートカットを編集します。サイトは個別の管理項目とリボンとして現れ、名前・表示先・キー割当を個別に設定できます。最大64サイト、1Appletにつき32アカウント枠です。

登録サイトと初期ショートカットは本体の宣言型一覧を使い、管理ページと設定ページで同じ表を表示します。編集は歯車、削除はゴミ箱、有効状態はトグルで操作します。追加/編集はダイアログのOKで1レコードを即時保存します。不正入力や競合時は入力を残します。URL、許可origin、枠の選択は両画面から編集でき、アイコンとWeb側の推奨設定取得は管理ページで扱います。管理ページでは枠がなければ明示追加時に「個人用」を作ります。サイトの削除は枠を削除しません。新規サイトのキー既定値は既存の割り当てへ遡及しません。

親Appletの停止は全サイト画面を閉じます。サイト単独の停止はそのページだけを閉じ、再起動はそのSurfaceだけを再生成します。ページ・Window切替は同じViewを使います。Windowの×は非表示です。各サイトのログイン可否は提供サービスに依存し、常時受信は保証しません。

## 保存

サイトと初期キーはsettings.jsonのextensions.at365.web-applet.settingsへ保存します。旧webAppletsからの自動取り込みは行いません。参照情報を新たに生成・更新する処理はありません。

`ids`は以前のページIDを、`owner`は以前のアカウント名簿とPC専用sessionの保存先を維持するために使います。削除すると新方式のID・保存先を参照し、既存アカウントや保存したリボン配置が見つからなくなる場合があります。元のデータは自動削除しません。

アカウント参照の存在確認は、追加・変更したWebページの行に対して行います。名簿未到着や参照情報の変更で既存ページが同期待ちでも、変更していない行を再検査してリボン等の無関係な設定保存を拒否しません。新規/変更行の検証と、アカウント処理中のガードは維持します。

既存の共有名簿data/web-applets/accounts.jsonとPC専用web-applets/sessions、web-applets/windowsを引き続き使い、Cookieを移動しません。新規構成は共有data/web-profiles/at365.web-applet/accounts.jsonとPC専用web-profiles/at365.web-appletを使います。詳しい保存区分は[設定同期](settings-sync.md)、保存先の互換参照は[分離設計](applet-pages.md)を参照してください。

本体単独更新では新Appletを自動導入しません。古いホストと新しい設定を双方向同期しないでください。

## Webアカウントと遷移

アカウントはApplet所有範囲で隔離します。同じ枠のサイトだけがログイン状態を共有し、GmailのwebAccountsとは別です。枠の名前はblur/Enterで即時保存し、Escapeで保存前の値に戻せます。枠の操作は設定revisionを変えません。使用中の枠は削除できず、クリア/削除にはホスト警告確認が必要です。取消を既定とし、削除待ち・junction拒否・外部同期との競合検査を維持します。

noneは開始文書とhash移動、same-originは同じscheme/host/port、anyはHTTP(S)へのトップレベル遷移を許可します。allowedOriginsは認証先等の完全なoriginを追加します。redirect/window.open/履歴にも同じ規則を適用します。画像や通信全体を遮断するネットワークフィルターではありません。

remoteページはsandbox/contextIsolation/webSecurityを有効にし、preload/Node/ホストIPCを公開しません。サイトのデバイス権限は拒否します。CookieやURLのquery/fragmentを外部操作APIへ返しません。

## 推奨設定

開始URLのlink rel=manifest、なければ同じoriginの/.well-known/appdock.jsonを取得します。name/short_name/start_url/iconsとappdock.schemaVersion=1のnavigation（none/same-origin）だけを解釈します。any、追加origin、アカウント、コマンド、ホスト設定は採用しません。

取得は認証なし、同一origin、最大3転送、要求全体5秒、HTML/画像256KB・JSON64KB。取得失敗でも手動登録できます。前回の取り込み値を記録し、手動変更と取得中の入力を保持します。PNG/JPEGの取得画像はホストで検証・32px PNG化します。手動画像はPNG/JPEG/WebP、4MB・2048px以下です。

## 公開操作

サイトのname/displayだけをsettings.getSchema/get/settings.updateへ公開します。open/back/forward/reload/homeと共通ライフサイクルを提供し、親が停止中の操作を拒否します。revision/dryRun/権限検査を共用します。URL/accountId/遷移規則/icon/imported、追加/削除、Cookie消去は外部公開しません。

通常の管理・公開経路はpageCollectionsの宣言を使います。旧web.<UUID>やat365.web-appletという名前から権限を推測しません。一般Appletでの利用は[動的ページ設計](applet-pages.md)と[Appletページ](applet-pages.md)を参照してください。

## 検証

単体試験はtests/dynamic-pages.test.cjs、web-applets.test.cjs、web-profiles.test.cjs、web-api.test.cjs。動的local/remote GUIはscripts/dynamic-pages-ui-test.cjs。共通一覧とダイアログはscripts/web-list-ui-test.cjs、配布EXEはscripts/web-applets-portable-test.cjsで確認します。実サイト認証とfixtureは区別し、結果は[VERIFICATION](../VERIFICATION.md)へ記録します。

## 共通画像

WebAppletの管理ダイアログでは画像を共通ライブラリーから選ぶ。提供JSONやメタデータで取得した元画像も、OK時に共通importへ渡す。サイトレコードのimageはRegisteredImageRef、既存iconのdata URLは保持する。imageを優先し、未取得時は既存iconへ戻る。ローカル管理ページは登録画像APIを使い、リモートサイトには渡さない。原画像・制約・グループは[共通画像](registered-images.md)を参照する。

## Webプロフィール

`context.webProfiles.list/add/rename/clear/delete`を共通提供する。ID・名前だけを扱い、Cookie、sessionオブジェクト、任意保存パスをAppletへ渡さない。既定はApplet専用名前空間で、同じAppletの同じ枠を選んだページだけがログイン状態を共有する。Gmailの既存webAccountsとは統合しない。

名簿は共有data/web-profiles/<owner>/accounts.json、sessionと削除待ちはPC専用rootのweb-profiles/<owner>へ保存する。名簿未到着時は空のファイルを自動作成しない。明示追加・名称変更は独立ファイルへ即時保存し設定revisionを変更しない。

参照中の削除を拒否し、親停止中の保存済み参照も含める。削除・クリアはホスト警告dialogで確認し、取消を既定とする。確認後に参照を再検査し、処理中の枠を参照する設定保存を拒否する。削除待ち記録、次回起動時の回収、junction拒否、外部同期による名簿削除でCookieを消さない既存契約を継続する。

HTTP(S)・資格情報のないURLを使い、none/same-origin/any＋追加originでトップレベル遷移を検査する。redirect/window.open/履歴も同じ制約とする。サイトのデバイス権限は拒否する。汎用Webページの常時受信は保証しない。

## WebAppletと保存済みデータ

独立AppletのIDはat365.web-applet。サイト設定と初期キーはextensions.at365.web-applet.settingsへ保存する。管理画面は自身のlocalページで、サイト追加/編集はダイアログのOKで1レコードを保存する。不完全入力とエラーは画面内に保持する。アカウント名はIME確定後のblur/Enterで保存する。

推奨JSONの取得/解釈はApplet側に置く。認証なし、同一origin、転送3回、要求全体5秒、HTML/画像256KB・JSON64KBの上限を設ける。name/short_name/start_url/iconsと限定したnavigationだけを採用し、手動変更を上書きしない。画像のデコード/縮小だけを共通ホストAPIへ委譲する。

旧webAppletsのサイト・初期キー・アカウントを取り込む処理は撤去した。既に保存されているmigrations.webAppletのversion/owner/idsは、ページIDと保存領域の参照としてだけ検証・保持する。

既存のdata/web-applets/accounts.json、PC専用web-applets/sessions/<accountId>とweb-applets/windows/<webId>.jsonを継続利用し、Cookieをコピーしない。旧webAppletsは現行設定として読み込まない。

本体単独更新で新Appletが自動導入されるとは扱わない。対応Appletをextensionsへ配置する。

外部公開は従来どおり各サイトのname/displayとopen/back/forward/reload/home、共通ライフサイクルに限定する。URL/accountId/遷移規則/icon/imported/Cookieを公開しない。個別項目は親Appletの配布物に含まれ、別の更新対象にならない。
