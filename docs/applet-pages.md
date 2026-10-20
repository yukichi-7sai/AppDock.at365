# Appletページとリボン

Appletは画面のHTML/React・操作・データ処理を実装し、ホストは左のリボン、表示先、UIプロセス、画面領域、ウィンドウ状態、終了処理を管理します。同じローカルUIのWebContentsViewを本体ページと別ウィンドウへ移動し、表示先の変更で再ロードしません。既存のWPF/WinForms/nativeウィンドウを自動変換する契約ではありません。

## manifestと起動

`minimumHostVersion: "0.18.0"`、`capabilities: ["pages"]`と`pages`を宣言します。最大10ページ、安定したApplet内ページID、80文字までのtitleです。iconは`mail / clock / image / folder / extensions`、省略時はextensions。HTML/画像をリボンへ直接挿入しません。openCommandは自身の宣言済みコマンドで`activateOnExecute:true`を必須にします。無効化中はリボンから隠しますが、コマンドの明示実行による起動は引き続き可能です。

```json
{
  "commands": [{ "id": "example.applet.open", "title": "画面を開く", "activateOnExecute": true }],
  "pages": [{
    "id": "main", "title": "画面", "icon": "folder", "source": "local",
    "ui": "web/index.html", "openCommand": "example.applet.open", "defaultDisplay": "page"
  }]
}
```

`source:local`のuiはApplet内の実HTMLファイルです。実パスを照合し、シンボリックリンクを含むフォルダ外参照を拒否します。相対資産とCSPはApplet側に置きます。

Nodeのコマンドハンドラーは`context.pages.open('main')`、.NET/nativeは`context.Pages.OpenAsync("main", cancellationToken)`を呼びます。RPCは`host.pages.open`と`{id:"main"}`です。自身のローカルページのみ対象です。

WebアカウントUIでは`source:"web-accounts"`を使い、uiを重複指定しません。webAccounts定義とweb-accounts capabilityも必要で、1つのAppletにつきこのsourceは1ページまでです。既存`context.webAccounts.open()`を呼ぶコマンドをopenCommandへ指定します。ページ宣言のない既存WebアカウントAppletは別ウィンドウのままです。

## ローカルページ用の限定ブリッジ

ホストのpreloadが`window.appletPage`を公開します。sandbox/contextIsolationを有効、Nodeと`window.dock`は非公開です。

- `snapshot(): Promise<{dark:boolean,settings:Record<string,unknown>}>`: 本体テーマと自身のmanifest設定値。settings capabilityがなければ空です。
- `executeCommand(id): Promise<unknown>`: 自身の実行中の登録コマンドのみ。任意RPCや他Applet/本体コマンドは渡しません。
- `onChanged(callback): () => void`: テーマ/設定の変更通知。UI側は返された解除関数を使います。
- `call('actions.invoke', { id, input }): Promise<unknown>`: manifestの`pageActions`に宣言した操作。.NET/nativeは`IPageActionHandler`、Nodeは`onPageAction`がJSON値またはnullを返します。入力は宣言したstring/number/booleanだけです。

画面の操作は自身のコマンドまたは宣言済みページ操作からNode/.NETの処理を呼びます。IPCはホストがUIのWebContents、main frame、厳密なローカルURLを照合し、リモートWeb画面には公開しません。Webアカウントsourceは既存の限定`window.webAccounts`を継続します。

## .NET/nativeとページ画像（0.66.1）

`IPageService`は固定ページのopenに加え、list/replace/hide/dispose/openItem、変更通知、ページ別画像の登録と解放を提供します。Nodeも同じホストAPIを使用します。動的登録には`dynamic-pages`、画像には`local-images`を併せて宣言します。自身の説明へ戻る場合は`Ui.OpenDetailsAsync` / `context.ui.openDetails()`を使います。

画像は`Ui.GetImageDirectoryAsync`内のPNG/JPEG/WebPを`Pages.RegisterImagesAsync`へ登録します。返されたURLは所属する生存中のlocal Viewだけで読み込めます。画像バイトをJSONへ埋め込んだり、説明パネルを通信経路にしたりする必要はありません。View破棄・停止で参照は失効し、Appletが生成ファイルを削除します。API、各種上限、実装例は[.NETページ連携の契約](dotnet-applet-pages-design.md)を参照してください。

## 表示先と保存互換性

本体の「Applet → 対象Applet → 設定」でページごとの表示方法を選択できます。保存先は`settings.json`の`extensions.<id>.pages.<pageId>.display`（page/window）。省略時はmanifestのdefaultDisplay、さらに省略時はpage。既存のApplet設定とは別のホスト管理領域です。表示先変更は次のopenへ反映し、表示中の画面なら直ちに載せ替えます。非表示の画面を設定変更だけで前面へ出しません。

独立ウィンドウの通常位置/サイズ/最大化は保存します。Webアカウントは既存`web-accounts/<id>/window-state.json`を引き続き使用し、localは`pages/<id>/<pageId>/window-state.json`です。閉じる操作では隠し、停止/異常終了時に画面を破棄します。表示中のページを停止した場合は本体をホームへ戻します。

本体Reactのページ領域はホストpreloadの`pageViewport`経由でDIP/整数座標を報告し、ホスト側でも検証・client領域へclipします。AppletのUIにはページ内の0,0から始まる座標を見せます。リボン・タイトルバー・ステータスバーを覆いません。コマンドパレット中はページViewを外し、本体overlayへの入力を確保します。GmailのviewportはそのローカルUI内の座標のままです。

GmailのアカウントViewとsessionを表示先の変更で再作成しません。別ページ・UI内の新着一覧・非表示/最小化では背景Windowへparkし、keepActive/観測/通知を維持します。フォーカス引継ぎは現在アクティブな操作画面内に限定します。

## リボン

標準項目（home/extensions/settings/logs/theme/notifications）と、導入Appletのpagesおよび宣言型ribbonItemsを一覧にします。ページIDは`page:<extensionId>:<pageId>`、宣言型IDは`applet:<extensionId>:<localId>`です。プロフィールは独立Appletの自己設定への宣言型ボタンです。[共通画像とリボン](registered-images.md)を参照してください。

すべてのApplet（Gmail/WebAppletを含む）は無効化中だけ実リボンから隠し、有効化時に元の配置へ戻します。リボン設定の一覧と保存済みの表示・配置は保持します。開始待ちやエラー状態でも、有効なAppletのリボンは表示します。

「設定 → リボン」で表示チェック、上下配置、ドラッグ、上下ボタン、セパレーター、グループの追加・編集・解除、初期化を提供します。保存は即時保存/revision/競合検査に従います。`ribbon`の`order`はトップレベルの順序、`hidden`は非表示ID、`bottom`は下寄せID、`separators`は`separator:<stable-id>`の登録です。セパレーターも順番・非表示・配置の対象です。ID配列は550件、グループと区切り線は各50件、明示配置全体の葉は500件までです。重複・不正ID・未登録グループ/区切り線への参照を拒否します。

グループは`ribbon.groups`の1階層、子の順序は`children`へ保存します。子の上下配置は親から継承し、明示配置を重複させません。持続型の開閉だけをPC専用`ribbon-state.json`へ保存します。バッジと一時パネルはメモリーのみ。完全な構造・移行・解除規則は[グループとバッジ](ribbon-groups-badges-design.md)を参照してください。

通常ボタンのリボン内の別名とアイコンのみ表示は`ribbon.itemOverrides`、グループのアイコンのみ表示は`groups[].iconOnly`へ保存します。登録元の名前・ID・実行先は変えません。未導入IDの配置と表示設定は保持し、設定一覧から明示削除できます。無効Appletは登録済みなので、この削除の対象外です。

`ribbon`未指定ならテーマを下寄せにします。Appletの宣言型項目はdefaultPlacementを使い、保存された親グループ・明示配置を優先します。旧profileの配置IDや未導入Appletの設定は保持し、自動削除しません。設定ボタンを隠しても本体の設定コマンドとトレイから復帰できます。

同じ配置を外部から取得・編集できます。許可と操作形式は[共通操作APIのリボン編集](automation.md#リボン編集)を参照してください。GUIとAPIは同じ検証と設定revisionを使います。

## 検証

追加試験は`scripts/ribbon-groups-ui-test.cjs [固定配布EXE]`。Node/.NETからのバッジ、両展開方式、横スクロール、明暗テーマ、キーボード、外側クリック、設定編集と再起動を隔離profileで確認します。単一EXEはコピーのhashを照合し、通常起動後にCDP接続します。

`scripts/applet-pages-ui-test.cjs [win-unpackedのEXE]`は隔離profile・ローカルページfixture・GmailのオフラインHTTPS fixtureを使います。画面の実幅、UI/入力/remote WebContentsの同一性、ページ/Window切替、コマンド検索、背景/最小化監視、Cookie再起動保持、リボンの保存/復帰、停止時破棄を確認します。実GmailのOAuth/実受信とは区別します。単一EXEのラッパーへElectron.launchを直接使用せず、Gmailのscripts/test-portable.cjsによる通常起動後のCDP接続を使います。

既存のWebアカウントGUI試験はUIをBrowserWindowのrootとして想定していたため、UIページの取得はElectron contextの全pagesを使い、親Windowの操作はview所有関係を照合してください。ローカルUIのcapturePageは子WebContentsViewの合成画面を含まないため、各Viewのキャプチャと実領域も照合します。

`scripts/ribbon-layout-ui-test.cjs [win-unpackedのEXE]`は上下配置・セパレーター操作・グループ間ドラッグ・再起動保持・削除/初期化と、Gmailの余白/本文の上端を確認します。ドラッグの試験時だけ画面を縮小し、移動元と移動先を同時に可視領域へ収めます。

## 動的ページと設定由来のページ（0.44.0）

固定pagesに加え、pages/dynamic-pages capabilityでNodeのcontext.pages.list/replace/open/hide/disposeを使えます。実行中のlocalページを最大64件まで追加・置換・削除でき、同じHTMLへページ固有contextを渡せます。登録revisionで競合を拒否します。停止時は動的定義とSurfaceを回収します。

manifest.pageCollectionsは自身のobject-list設定からlocal/remoteページと管理項目を投影します。親の停止中も設定を保持し、子は独立したプロセス・配布物・更新対象を作りません。最低ホスト版は0.44.0。API、manifest、所有範囲、限定bridge、実装例は[動的ページの設計と契約](dynamic-pages-webapplet-design.md)を正本とします。

## 管理用ページの入口

標準リボンの管理用`extensions`項目は表示カタログから除外する。保存済みの配置は欠落項目として保持し、`appdock.applets.open`と旧extensionsルートは設定のApplet管理へ解決する。各Applet自身のページ・リボン項目とWebサイトの表示は維持する。
