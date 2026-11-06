# WebApplet

[Applet.WebApplet.at365](../../Applet.WebApplet.at365/docs/usage.md)は、登録したWebサイトをリボンのページまたは別ウィンドウで表示するNode Appletです。AppDock 0.172.0以上が必要です。

## 導入と操作

発行した `extensions/at365.web-applet` をAppDockの `extensions/` に配置し、Applet一覧で有効にします。設定の「WebApplet」でサイトと新規サイトの初期ショートカットを編集します。編集は歯車、削除はゴミ箱、有効状態はトグルです。追加・編集はダイアログのOKで1件を保存し、検証や競合で保存できない場合は入力を保持します。初期ショートカットの変更は次の新規登録から適用します。

登録1件にAppDockがログイン枠を割り当てます。URLが同じでも登録IDごとにCookieとサイトデータが分かれ、各PCでサイトにログインします。本体ページと別ウィンドウの切り替えは同じViewを使います。ウィンドウを閉じる、サイトを無効にする、親Appletを停止する操作ではログインを保持します。サイトによってはElectron内でログインできない場合があります。

## 保存と回収

サイトは `extensions.at365.web-applet.settings.sites`、初期ショートカットは同じ設定内の `siteShortcutDefaults` に保存します。保存先は親Appletの共有／PC専用モードに従い、各サイトの有効状態はPC専用です。以前のサイト、初期ショートカット、共用枠は新方式へ移行せず、新規登録から始めます。

本体はサイト一覧を正本として枠を管理します。提供元のIDをグループ、一覧のキーと登録UUIDを枠の識別に使い、初回表示時にPC専用rootの `web-account-groups/<Applet ID>/site-sessions/<一覧キー>/<UUID>/` を開きます。Gmailの `at365.google/sessions/` はサービス専用グループです。Cookieやサイトデータは同期対象に含めません。

サイトを削除したときはページを閉じ、確定済みの共有・PC専用の両設定で参照がなくなった枠を回収します。同期中、破損、読取不能で参照を確認できない場合は保留します。本体はAppletの有無に関係なく起動時と設定の反映時に回収を行います。そのプロセスで開いた枠やファイルがロックされている枠は、参照の再確認後に次回起動時に回収します。回収範囲は新方式のサイト専用保存領域です。

## 遷移と権限

`none` は開始文書とhash移動、`same-origin` は同じscheme/host/port、`any` はHTTP(S)へのトップレベル遷移を許可します。`allowedOrigins` は認証先等の完全なoriginを追加します。redirect、window.open、履歴にも同じ規則を適用します。

リモート画面はsandbox、contextIsolation、webSecurityを有効にし、preload、Node、ホストIPCを公開しません。サイトのデバイス権限を拒否します。

## 推奨設定と画像

開始URLの `link rel=manifest`、なければ同じoriginの `/.well-known/appdock.json` を取得します。名前・開始URL・画像と、限定した遷移設定を取り込みます。取得は認証なし、同一origin、最大3転送、全体5秒、HTML/画像256KB・JSON64KBです。手入力、取得中の編集、選択済み画像を保持します。推奨画像はダイアログのOKで[共通画像ライブラリー](registered-images.md)へ登録し、選択がないときは保存済みの `icon` を表示します。

## 公開操作

宣言したサイトの `name` / `display` と `open` / `back` / `forward` / `reload` / `home`、共通ライフサイクルを公開します。URL、遷移規則、画像、ログイン情報、サイトの追加・削除はローカルで扱います。公開設定のrevision、dryRun、権限検査は[共通API](appdock-api.md)を使います。

## 検証

単体試験は `tests/dynamic-pages.test.cjs`、`tests/web-applets.test.cjs`、`tests/web-site-accounts.test.cjs`、`tests/web-api.test.cjs`。共通一覧とダイアログは `scripts/web-list-ui-test.cjs`、Cookieの分離と未導入時の回収は `scripts/web-applets-portable-test.cjs` を使います。実サイトの認証とfixtureは区別し、結果を[VERIFICATION](../VERIFICATION.md)へ記録します。
