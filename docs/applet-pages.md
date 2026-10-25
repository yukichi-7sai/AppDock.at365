# Appletページとリボン

固定ページ、実行中に登録するページ、設定から投影するページ、および.NETのHTML連携を同じページ基盤で提供する。

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

## .NET/nativeとページ画像

`IPageService`は固定ページのopenに加え、list/replace/hide/dispose/openItem、変更通知、ページ別画像の登録と解放を提供します。Nodeも同じホストAPIを使用します。動的登録には`dynamic-pages`、画像には`local-images`を併せて宣言します。自身の説明へ戻る場合は`Ui.OpenDetailsAsync` / `context.ui.openDetails()`を使います。

画像は`Ui.GetImageDirectoryAsync`内のPNG/JPEG/WebPを`Pages.RegisterImagesAsync`へ登録します。返されたURLは所属する生存中のlocal Viewだけで読み込めます。画像バイトをJSONへ埋め込んだり、説明パネルを通信経路にしたりする必要はありません。View破棄・停止で参照は失効し、Appletが生成ファイルを削除します。API、各種上限、実装例は[.NETページ連携の契約](applet-pages.md)を参照してください。

## 表示先

ページ表示先と起動待ち時間は[共通MCP設定API](settings-api.md#applet共通設定)からも編集できる。ページの項目は現在のpagesから生成し、表示先変更は本節と同じSurface/寿命・保存経路を使用する。通常のApplet共通項目は[共通定義](../src/shared/applet-common-settings.ts)を正本とする。

本体の「Applet → 対象Applet → 設定」でページごとの表示方法を選択できます。保存先は`settings.json`の`extensions.<id>.pages.<pageId>.display`（page/window）。省略時はmanifestのdefaultDisplay、さらに省略時はpage。既存のApplet設定とは別のホスト管理領域です。表示先変更は次のopenへ反映し、表示中の画面なら直ちに載せ替えます。非表示の画面を設定変更だけで前面へ出しません。

独立ウィンドウの通常位置/サイズ/最大化は保存します。Webアカウントは既存`web-accounts/<id>/window-state.json`を引き続き使用し、localは`pages/<id>/<pageId>/window-state.json`です。閉じる操作では隠し、停止/異常終了時に画面を破棄します。表示中のページを停止した場合は本体の[既定の表示先](host-pages.md#起動と戻り先)へ戻します。

本体Reactのページ領域はホストpreloadの`pageViewport`経由でDIP/整数座標を報告し、ホスト側でも検証・client領域へclipします。AppletのUIにはページ内の0,0から始まる座標を見せます。リボン・タイトルバー・ステータスバーを覆いません。コマンドパレット中はページViewを外し、本体overlayへの入力を確保します。GmailのviewportはそのローカルUI内の座標のままです。

GmailのアカウントViewとsessionを表示先の変更で再作成しません。別ページ・UI内の新着一覧・非表示/最小化では背景Windowへparkし、keepActive/観測/通知を維持します。フォーカス引継ぎは現在アクティブな操作画面内に限定します。

## リボン

標準項目（image-library/settings/logs/notifications/theme）と、導入Appletのpagesおよび宣言型ribbonItemsを一覧にします。画像ライブラリーの新規既定位置は先頭で、既存の保存順・非表示・上下配置は維持します。ページIDは`page:<extensionId>:<pageId>`、宣言型IDは`applet:<extensionId>:<localId>`です。プロフィールは独立Appletの自己設定への宣言型ボタンです。[共通画像とリボン](registered-images.md)を参照してください。

すべてのApplet（Gmail/WebAppletを含む）は無効化中だけ実リボンから隠し、有効化時に元の配置へ戻します。リボン設定の一覧と保存済みの表示・配置は保持します。開始待ちやエラー状態でも、有効なAppletのリボンは表示します。

「設定 → リボン」で表示チェック、上下配置、ドラッグ、上下ボタン、セパレーター、グループの追加・編集・解除、初期化を提供します。保存は即時保存/revision/競合検査に従います。`ribbon`の`order`はトップレベルの順序、`hidden`は非表示ID、`bottom`は下寄せID、`separators`は`separator:<stable-id>`の登録です。セパレーターも順番・非表示・配置の対象です。ID配列は550件、グループと区切り線は各50件、明示配置全体の葉は500件までです。重複・不正ID・未登録グループ/区切り線への参照を拒否します。

グループは`ribbon.groups`の1階層、子の順序は`children`へ保存します。子の上下配置は親から継承し、明示配置を重複させません。持続型の開閉だけをPC専用`ribbon-state.json`へ保存します。バッジと一時パネルはメモリーのみ。

通常ボタンのリボン内の別名とアイコンのみ表示は`ribbon.itemOverrides`、グループのアイコンのみ表示は`groups[].iconOnly`へ保存します。登録元の名前・ID・実行先は変えません。未導入IDの配置と表示設定は保持し、設定一覧から明示削除できます。無効Appletは登録済みなので、この削除の対象外です。

`ribbon`未指定ならテーマを下寄せにします。Appletの宣言型項目はdefaultPlacementを使い、保存された親グループ・明示配置を優先します。旧profileの配置IDや未導入Appletの設定は保持し、自動削除しません。設定ボタンを隠しても本体の設定コマンドとトレイから復帰できます。

同じ配置を外部から取得・編集できます。許可と操作形式は[共通操作APIのリボン編集](automation.md#リボン編集)を参照してください。GUIとAPIは同じ検証と設定revisionを使います。

## 検証

追加試験は`scripts/ribbon-groups-ui-test.cjs [固定配布EXE]`。Node/.NETからのバッジ、両展開方式、横スクロール、明暗テーマ、キーボード、外側クリック、設定編集と再起動を隔離profileで確認します。単一EXEはコピーのhashを照合し、通常起動後にCDP接続します。

`scripts/applet-pages-ui-test.cjs [win-unpackedのEXE]`は隔離profile・ローカルページfixture・GmailのオフラインHTTPS fixtureを使います。画面の実幅、UI/入力/remote WebContentsの同一性、ページ/Window切替、コマンド検索、背景/最小化監視、Cookie再起動保持、リボンの保存/復帰、停止時破棄を確認します。実GmailのOAuth/実受信とは区別します。単一EXEのラッパーへElectron.launchを直接使用せず、Gmailのscripts/test-portable.cjsによる通常起動後のCDP接続を使います。

既存のWebアカウントGUI試験はUIをBrowserWindowのrootとして想定していたため、UIページの取得はElectron contextの全pagesを使い、親Windowの操作はview所有関係を照合してください。ローカルUIのcapturePageは子WebContentsViewの合成画面を含まないため、各Viewのキャプチャと実領域も照合します。

`scripts/ribbon-layout-ui-test.cjs [win-unpackedのEXE]`は上下配置・セパレーター操作・グループ間ドラッグ・再起動保持・削除/初期化と、Gmailの余白/本文の上端を確認します。ドラッグの試験時だけ画面を縮小し、移動元と移動先を同時に可視領域へ収めます。

## 動的ページと設定由来のページ

固定pagesに加え、pages/dynamic-pages capabilityでNodeのcontext.pages.list/replace/open/hide/disposeを使えます。実行中のlocalページを最大64件まで追加・置換・削除でき、同じHTMLへページ固有contextを渡せます。登録revisionで競合を拒否します。停止時は動的定義とSurfaceを回収します。

manifest.pageCollectionsは自身のobject-list設定からlocal/remoteページと管理項目を投影します。親の停止中も設定を保持し、子は独立したプロセス・配布物・更新対象を作りません。最低ホスト版は0.44.0。API、manifest、所有範囲、限定bridge、実装例は[動的ページの設計と契約](applet-pages.md)を正本とします。

## 管理用ページの入口

標準リボンの管理用`extensions`項目は表示カタログから除外する。保存済みの配置は欠落項目として保持し、`appdock.applets.open`と旧extensionsルートは設定のApplet管理へ解決する。各Applet自身のページ・リボン項目とWebサイトの表示は維持する。

## .NETのページサービス

既存の`IExtensionContext.Pages`と`IPageService.OpenAsync`を保ち、次を追加する。追加メンバーは既定実装で`NotSupportedException`を返し、既存のSDK利用者・テスト用実装を壊さない。`ExtensionContext`が実装する際は既存のホスト検証を通す。

| .NET API | RPC / 意味 |
| --- | --- |
| `ListAsync(token)` | `host.pages.list`。固定＋実行中ページと登録revisionを返す |
| `ReplaceAsync(pages, expectedRevision, token)` | `host.pages.replace`。動的定義だけを全置換し、新revisionを返す |
| `OpenAsync(id, token)` | 既存の`host.pages.open`。自身のlocalページを開く |
| `HideAsync(id, token)` | `host.pages.hide`。Viewと入力を保持して隠す |
| `DisposeAsync(id, token)` | `host.pages.dispose`。登録を残してViewを破棄する |
| `OpenItemAsync(id, token)` | `host.pages.openItem`。自身の設定由来ページを開く |
| `NotifyChangedAsync(id, token)` | 新設`host.pages.changed`。対象ページへ既存の変更イベントを送る |
| `RegisterImagesAsync(id, files, token)` | 新設`host.pages.images.register`。画像ファイルを登録して参照を返す |
| `ReleaseImagesAsync(id, imageIds, token)` | 新設`host.pages.images.release`。画像参照を失効させる |

一覧結果は`PageListResult { revision, pages }`、置換結果は`{ revision }`とする。動的定義は既存の`id/title/source/ui/icon/defaultDisplay/context`だけを持つ専用DTOにし、一覧にある`openCommand`を置換要求へ送り返さない。省略可能な値はJSONから省略し、`source`は`local`。登録revisionは設定revisionと別で、ホストで安全な整数として検証する。

固定ページ10件、動的ページ64件、contextの16KiB上限、ID衝突・相対UIの包含検査は既存契約を使う。動的登録には`pages`と`dynamic-pages`が必要。固定の1画面だけならmanifest宣言を使い、毎回動的に登録し直す必要はない。

これらの個別上限とは別に、一覧・置換も最終のRPCメッセージを1MiB以内に収める。contextへ大量の本文や画像を置かず、データ取得用の識別子を渡す。上限を超える要求を部分適用しない。

`NotifyChangedAsync`は`{id}`を受け、自身が登録したlocalページだけを対象にする。未生成・非表示のページを開かない。受付と描画完了を区別し、結果は`{accepted:true, delivered:boolean}`。同じ処理中の通知をまとめ、`window.appletPage.onChanged`を再利用する。設定・テーマの変更通知と同様に、UIが必要なデータを取り直す合図とする。

## JavaScriptから.NETへの操作

既存の`manifest.pageActions`と`actions.invoke`の形式を保つ。.NET SDKへ別インターフェースを追加する。

```csharp
public interface IPageActionHandler
{
    Task<System.Text.Json.JsonElement?> HandlePageActionAsync(
        string actionId,
        System.Text.Json.JsonElement input,
        string pageId,
        CancellationToken cancellationToken);
}
```

`AppletSession`の`page.action`がこれを呼び、返されたJSON値をRPC結果として返す。nativeの`AppletSession.RunAsync`とDLL用ExtensionHostは同じ実装を使う。入力の`JsonElement`は非同期処理中も有効な複製を渡す。未実装のAppletには「ページ操作は提供されていません」を返す。

| 境界 | 契約 |
| --- | --- |
| 呼出元 | 既存の`localPageSource`でWebContents・main frame・正確なlocal URLを照合 |
| 入力 | 宣言済みidとstring/number/booleanだけ。未宣言キー・型違い・64K文字超過を既存どおり拒否 |
| 実行 | 起動完了後だけ受付。停止開始・接続終了で取消。別Appletや任意RPCへ転送しない |
| 結果 | JSON値またはnull。.NETは最終のRPCシリアライズ形式で結果部分512KiB以内を検査し、超過はエラーにする。既存の1MiB制限を緩めない |
| 世代 | 応答時にも既存のruntimeSession照合を行い、再起動前の結果をUIへ戻さない |

UIは既存の呼出方法を使う。以下は最小の利用例。実行可能なDLL/native/Nodeのfixtureは`tests/fixtures/dotnet/AppDock.PageProbe`と`scripts/dotnet-pages-ui-test.cjs`にある。

```json
{
  "pageActions": [{
    "id": "items.read",
    "parameters": { "offset": "number", "limit": "number" }
  }]
}
```

```javascript
const result = await window.appletPage.call('actions.invoke', {
  id: 'items.read', input: { offset: 0, limit: 32 }
});
```

大量データはページまたはカーソルで分割する。長い処理は受付後にバックグラウンドで進め、変更通知と状態取得で表示する。タイムアウトを一律延長しない。操作の再送で外部効果が重複し得るため、UIの二重操作を防ぎ、結果不明時の自動再送をしない。

入力中の不正値は現在の画面内で案内する。実行した操作の最終失敗は[共通エラー通知とログ](error-reporting.md)へ接続し、通知・履歴へ生のパスや例外を渡さない。ページ内の必要な対象表示と、通知へ出す安全な説明を分ける。

Runtimeは既存のコマンド・設定の直列化を保つ。ページ操作は同じ実行ロックに接続し、ロック取得待ちにも取消を適用する。タイマー・OSイベント・バックグラウンド処理との排他とSTAへの移送はAppletが所有する。操作ハンドラーから自身のコマンド実行を再入させず、共通の内部処理を直接呼ぶ。初回の画面ロードで.NET側の排他を待つ循環を避け、`OpenAsync`の完了をUIの初期データ取得完了まで待たせない。

## ページ画像の受け渡し

画像は既存の`Ui.GetImageDirectoryAsync`が返すPC専用`cache/panel-images/<Applet ID>/`配下へ生成する。新たな保存先・永続登録ファイル・画像変換設定は追加しない。ホストの登録簿は実行中だけ保持する。

`RegisterImagesAsync`の要求は`{id,files:[{key,file}]}`、結果は`{images:[{key,id,url}]}`。`key`はApplet内の対応付け用、`id`はホストが発行する不透明な参照、`url`は`appdock://page-images/<不透明な参照>`。画像の再圧縮や縮小は行わず、元の生成サムネイルを配信する。

| 項目 | 上限・検査 |
| --- | --- |
| capability | `pages`と`local-images`。自身の固定／動的localページだけ |
| 1要求 | 最大64ファイル、最終RPC形式で256KiB以内。必要なら呼出側で小分けにする |
| 有効な参照 | 1ページ2,000件、1Applet8,000件。上限超過時は要求全体を拒否し、既存参照を保持 |
| ファイル | PNG/JPEG/WebP、1ファイル32MiB以下、各辺2,048px以下。拡張子・実形式・実ファイルを検査 |
| 所在 | 専用キャッシュ内の絶対パス。登録時と配信時に実パスを検査し、リンクによる領域外参照を拒否 |
| 所有 | Applet ID、runtimeSession、localページIDに結び付ける。クライアントにディスクパスを選ばせない |

画像登録は対象のlocal Viewが生成された後に行う。検証中にViewが破棄されたら登録を拒否し、次のViewへ遅延結果を引き継がない。画像の形式・寸法はヘッダー等を使って逐次検査し、登録バッチ全体の画像を一度にメモリへ読み込まない。

画像protocol handlerは対象localページのSessionへ、HTMLロード前に登録する。既存のdefaultSessionのパネル画像配信は継続する。専用Sessionのhandlerはそのページの登録画像だけを解決し、ホストrendererの汎用配信や別ページ・別Appletの画像へフォールバックしない。リモートWebやWebアカウントのSessionには登録しない。

配信はファイルから行い、MIME、`Cache-Control:no-store`、`X-Content-Type-Options:nosniff`を付ける。URLに元画像のパスを含めない。ローカルページのCSPは自分のJS/CSSと必要な画像schemeだけを許可し、リモートスクリプト・任意navigation・新規Window・Node公開を増やさない。

`ReleaseImagesAsync`は自身のページの参照を最大64件ずつ失効させる。既に失効した参照の解放は成功とし、ファイル自体は削除しない。画像交換は「新しい参照を登録 → UIへ渡す → 旧参照を解放 → Appletが旧ファイルを削除」の順とする。1,000枚の新旧交換ができるよう、ページ上限は2世代分を確保する。

`HideAsync`とpage/window間の載せ替えでは参照とViewを保持する。`DisposeAsync`、ページ登録解除、UI資産の差し替え、停止・異常終了では対象参照を失効させる。再open時はUIが参照を再取得する。配信中の読取ハンドルは終了時に閉じ、遅れて完了した登録を次の実行世代へ持ち越さない。Appletは自分が生成したファイルだけを片付け、既存キャッシュ全体を再帰削除しない。

本機能、Viewの破棄を.NETへ通知する新たな寿命イベントは追加しない。Applet自身が`DisposeAsync`を呼ぶ場合は、自分のworker・生成物の回収も行う。予期しないView破棄ではホストが参照を即時失効させ、Appletは次回のデータ取得または停止時に残った生成物を回収する。停止中は画像解放RPCを要求せず、ホストによる参照回収と自身のファイル解放に分担する。

## 3つの登録方法

1. **固定ページ**: 既存のmanifest.pagesを維持する。最大10件。
2. **実行中のページ**: `context.pages.replace`でローカル画面を一括登録する。最大64件。停止・異常終了で失効し、次の起動でAppletが再登録する。
3. **設定由来のページ**: manifest.pageCollectionsで自身のobject-list設定を宣言する。最大4コレクション、1親Appletにつき合計64項目。local/remoteの双方に対応し、停止中も設定と管理項目を投影する。

実行中のページは親Appletのリボン項目となる。設定由来の項目は個別設定・リボン・入力設定を持つが、パッケージの管理一覧へは含めない。個別の有効状態・公開設定・キー割当を持つ。子の実行プロセスや更新物は作らない。保存された子のenabledは親を停止しても保持し、実効状態は親と子の両方で決める。

リモートページを実行中APIから直接登録する形式は提供しない。保存された参照を持つpageCollectionsを使い、プロフィール削除の参照判定を停止中も維持する。

## 実行中ページのAPI

`pages`と`dynamic-pages` capability、minimumHostVersion 0.44.0が必要。Nodeラッパーと`host.pages.*`は同じ処理を使う。

| Node | 引数と結果 |
| --- | --- |
| pages.list() | 自身の固定＋実行中ページ定義、登録revision |
| pages.replace(pages, expectedRevision) | 実行中の定義だけを全置換。新revisionを返す |
| pages.open(id) | 自身の固定/実行中localページを開く |
| pages.hide(id) | 非表示にし、入力とViewを保持する |
| pages.dispose(id) | Viewを破棄する。登録は残り、次のopenで再生成 |
| pages.openItem(id) | 自身の設定由来の管理項目を開く |

実行中の定義は`{id,title,source:'local',ui,icon?,defaultDisplay?,context?}`。uiはAppletフォルダー内の実HTMLを指定し、フォルダー外参照や転送された資産を包含検査で拒否する。contextは16KB以下のJSONオブジェクト。固定IDとの衝突、動的ID重複、上限超過、古いrevision、コマンド衝突を全体として拒否する。

生成される開くコマンドは`<owner>.pages.<id>.open`で、外部公開はしない。登録だけでWebContentsを生成しない。名称・context・表示先の変更は既存Viewを更新し、UI資産変更・登録解除は対象Viewを破棄する。設定revisionと登録revisionは別に扱う。listは描画状態を含まない。

```ts
const current = await context.pages.list();
await context.pages.replace([
  { id: 'document.1', title: '文書1', source: 'local', ui: 'web/document.html',
    context: { documentId: '1' } },
  { id: 'document.2', title: '文書2', source: 'local', ui: 'web/document.html',
    defaultDisplay: 'window', context: { documentId: '2' } },
], current.revision);
await context.pages.open('document.1');
```

## 設定由来のページ

pageCollectionsの各宣言は`key/source/fields`を持つ。keyは自身のobject-list設定、sourceはlocalまたはremote。localはuiを必須とする。任意のmanagementCommandは自身のmanifestコマンド、shortcutDefaultsKeyは自身のobject-list設定を参照する。automationは公開するopen/back/forward/reload/homeの限定リストで、localではopenだけ。

共通レコードは`{id,name,enabled,display}`。remoteはさらに`url/accountId/navigation/allowedOrigins/icon?`を持ち、web-profiles capabilityを必須にする。追加のApplet固有データはそのレコードに保持できる。fieldsは個別設定画面へ投影する定義で、automation指定のフィールドだけが外部APIへ公開される。

管理項目IDは通常`<owner>.<collectionKey>.<itemId>`、ページキーは`page:<管理項目ID>:main`。local画面はsnapshot.page.contextから自身のレコードを取得する。remoteのページ操作は管理項目の宣言済みコマンドとして提供する。無効・親停止中の表示操作は拒否する。

保存時はレコード全体を検証し、新規項目にだけ初期ショートカットを適用する。同期で不正な一覧が届いた場合は最後に検証したカタログを保持し、プロフィールの破壊操作と自動回収を保留する。不正データを自動修復・上書きしない。

## ローカルUIの限定bridge

固定/実行中のlocalページは既存snapshot/executeCommand/onChangedに加え、`window.appletPage.call(operation,input)`を使う。IPCは送信元WebContents、main frame、ローカルURLを照合する。

| 操作 | 境界 |
| --- | --- |
| settings.update | key/value/expectedRevision。自身の設定のみ、settings capability |
| webProfiles.list/add/rename/clear/delete | 自身の名前空間のみ、web-profiles capability |
| images.normalize | PNG/JPEG/WebPの検証と32px PNG化、images capability |
| pages.openItem | 自身の設定由来項目のみ |
| actions.invoke | manifest.pageActionsのidと宣言されたstring/number/boolean引数だけ。NodeのonPageActionへ渡す |

ローカルsnapshotにはテーマ、宣言設定値、設定revision、page.id/context、自身のcollectionPages識別子を含む。設定由来local画面はpage.id/contextとテーマ、親の登録コマンド実行を提供する。remoteにはpreload/Node/ホストIPCを渡さない。

pageActionsの入力はJSON文字列表現で64K文字以下。Node処理の応答は提供元の実行世代が変わっていれば破棄する。任意RPC転送、任意JS評価、Cookie取得APIは設けない。自己リソース操作と、MCP/他Applet向けAppDockApiの権限は分離する。

## 表示寿命

1ページにつき1つのSurfaceを持つ。同じViewを本体ページと別Windowで移動し、入力・履歴を維持する。本体本文の選択は1ページ、異なるページの独立Windowは同時に保持できる。同じページの複製Windowや分割表示は対象外。

Windowの×は非表示、登録解除・停止・異常終了では破棄する。停止回収はホストが担当しdeactivate成功に依存しない。選択中のページを破棄した場合は[既定の表示先](host-pages.md#起動と戻り先)へ戻す。保存済みリボン/キー/表示先を一時的な登録解除では削除しない。既存のrestore-viewは親の起動とページ登録を待つ。
