# 部分Shellと共通オーバーレイ

Shell Appletは通常Appletに描画提供能力を加えたもの。全Shellの実装を要求しない。本体が状態と操作を管理し、選択されたAppletが宣言した領域だけを描画する。未宣言・利用不可・描画失敗の領域にはDefault Shellを使用する。Default Shell専用のAPIや本体側の第二のパレットは作らない。

## 担当領域

公開領域は`titlebar`、`ribbon`、`statusbar`、`overlay.command-palette`、`notification.banner`、`notification.desktop`の6領域です。一時グループはリボンの一部として同じ提供元・同じHTMLで描画します。ページ本文は本体の共通UIです。各領域は`host.shellProviders`で指定し、利用できない領域だけDefault Shellへ戻します。

```json
{
  "apiVersion": 1,
  "id": "example.palette",
  "name": "Example Palette",
  "version": "1.0.0",
  "minimumHostVersion": "0.76.5",
  "runtime": "node",
  "entry": "worker.cjs",
  "capabilities": ["shell"],
  "shell": {
    "apiVersion": 1,
    "views": { "overlay.command-palette": "palette.html" }
  },
  "commands": [{ "id": "example.palette.compact", "title": "表示を切り替える" }]
}
```

workerでは通常の`context.commands.register`で宣言コマンドを実装する。コマンドはパレット・ショートカット・トレイから利用でき、描画側の`executeCommand`でも自分のAppletのものを呼べる。設定・ページを持つ場合も既存のcapabilityとAPIを使う。Shellとして未選択でもApplet自体の有効状態・コマンド登録は維持される。

描画側は`getSettings()`と`onSettingsChanged(callback)`で自Appletの設定を取得・購読できる。例えば`compact`設定をコマンドから通常のsettings APIで変更すれば、リボンとオーバーレイはその設定に応じて描画を更新できる。両bridgeに同じ`ShellAppletApi`を適用する。

`views`は最大32件。キーは英小文字から始まる英小文字・数字・ピリオド・ハイフン、最大64文字。HTMLはAppletフォルダー内の相対パス。`ui`も`views`もない宣言は拒否する。将来用のキーは検証して保持するが、未対応の領域は描画しない。

従来の`shell.ui`は`ribbon`の別名。`views.ribbon`を優先する。リボンだけを提供すればパレットはDefault Shell、パレットだけならリボンはDefault Shell。これは正常な組合せであり、故障表示にしない。

## 本体と描画の分担

一時グループの表示は`ribbon`に統合し、独立したShell領域・割り当て・再試行・提供元選択を持ちません。`RibbonGroupSession`は内容と寿命を持ち、OverlayHostの単一モーダル枠を使います。OverlayHostは実際に接続中のリボン提供元と同じ`ribbon` HTMLへ、共通`window.appdockOverlay`を公開します。描画側は`kind: "ribbon-group"`、`content.groupId/title/parent/anchor/viewport/displayMode/items`を使います。親ボタンは`dismiss`、子は`ribbonChoose`で操作します。通常のリボン接続は`window.appdockShell`で、同じHTMLが接続の種類を判別します。描画契約は`shell.ribbonSchemaVersion: 3`、最低ホスト版は0.90.0です。

一時グループの専用設定はありません。保存済みの`overlay.ribbon-group`指定やview宣言は保持しても動作には使わず、単独の実行要件・visible判定・個別切り替えも受け付けません。一時表示が失敗したら要求を閉じ、リボン全体の復旧へ接続します。子の実行要求を再送しません。

| 部分                         | 責務                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `OverlayHost`                | primaryのモーダル枠1件、遅延生成、表示順序、寸法・zoom、IPC送信元、ready、復旧、フォーカス、破棄 |
| `OverlayController`          | 内容別のモデル・操作・完了・取消。表示先を所有しない                                             |
| `CommandPaletteSession`      | コマンド列挙・利用可否、現在のピン保存、選択だけの結果、共通コマンド実行、実行中の重複防止       |
| Default Shell / Shell Applet | 公開snapshotの描画、検索文字列・選択位置・キーボード移動。設定や業務状態を複製しない             |
| 本体の`CommandPicker`        | トレイ編集から選択を要求し、返されたIDを設定入力へ反映し、即時保存する。描画実装を持たない              |

下のApplet WebContentsや入力・sessionを破棄/再生成しない。オーバーレイは本体クライアント領域全体に重なる独立WebContentsView。設定通知もその下へ置く。モーダル中は本体の画面・グローバルキー・ジェスチャーによる共通コマンド割り当てを停止する。パレット自身の入力・IME・Tab循環・上下/Enter/Escapeは描画が扱う。

閉じるとView・readyタイマーを破棄し、元のrouteが変わらず本体Windowにフォーカスがある場合だけ元のWebContentsへ戻す。新しい要求は旧要求を取消。所有Windowの非表示・最小化・再読込・終了、本文のroute変更でも取消する。実行開始済みコマンドの副作用を取消で巻き戻すことはしない。

## 公開bridge

契約の正本は`src/shared/overlays.ts`。パレットHTMLにはDefault Shell/Shell Applet共通の`window.appdockOverlay`だけを公開し、`window.dock`やNodeアクセスを渡さない。

1. `onChanged(callback)`を登録して`connect()`する。`sessionId/providerAppletId/snapshot`を受け取る。
2. snapshotを描画後に`ready(sessionId)`する。同じIDの古いrevisionを無視する。
3. `act({id,type,...})`で操作する。`id`はホスト発行のオーバーレイID。取消`dismiss`、選択/実行`choose`（`commandId`）、`togglePin`（`commandId`）、`movePin`（`commandId/direction: -1|1/visibleIds`）を提供する。
4. `executeCommand(id)`で自Appletの登録コマンドを実行できる。任意コマンド実行の入口にはしない。選択中コマンドの実行は`choose`でホストに判断させる。
5. `onChanged`の戻り値で購読を解除する。View終了時はホストが回収する。

モデルは`schemaVersion:1/id/contextId:primary/kind:command-palette/revision/dark/modal:true/content`。contentは`mode/commands/pins/shortcuts/busy/error`。リボンとは独立した接続・モデル・readyを持つ。WebContents、main frame、登録URL、現session、ready状態を検査し、古いオーバーレイIDの操作は拒否する。

`mode:execute`はクリック時にも利用可否を照合して実行する。実行中の二重選択を拒否し、エラー時はパレットを残す。ピン操作は本体の最新設定を取得して対象だけを更新し、他の設定と検索外のピンを保つ。

`mode:select`は呼出側が指定したID集合から結果を返すだけで、実行・ピン保存を行わない。停止中・保存済みの未知コマンドも選択できる。トレイ編集は保存済み値を基準に選択結果を即時保存し、変更ごとの検証と保存は本体が所有する。

要求の結果は`{status:selected|executed,commandId}`または`{status:cancelled,reason}`。画面を閉じることと、開始済みコマンドの取消は別。呼出側の破棄による取消はrequestIdを照合し、後から開いた別要求を閉じない。

## 復旧・後続の拡張

ready期限は10秒。読込失敗・renderer終了/応答不能で同じ要求をDefault Shellへつなぎ直す。パレットの故障で稼働中のリボンを切り替えない。故障したパレット提供元の同版は当該プロセス中再利用せず、「Shellを再試行」または提供元の新版で再試行できる。意図的な停止/無効化は故障記録に含めない。オーバーレイは開いた時点の提供元に結び、設定のShell選択変更は次回表示から適用する。リボンの再起動をまたぐ故障記録は既存[Shell API](shell-api.md)に従う。

Default Shellも利用できない場合は要求を取消して最小ネイティブ通知を出し、本体の操作停止を解除する。`--safe-shell`では各領域をDefault Shellへ固定する。

新しいUIは原則として本体と共通部品で実装する。Shell化の個別依頼がある場合だけ、機能サービス→型付き表示モデル/操作→内容Controller→Default Shellの描画の順に追加する。別モーダルは共有契約のkindと領域を追加し、OverlayHostへ内容固有の判断を入れない。本体のページは[本体のページ表示](host-pages.md)を参照する。一般Appletの同一領域の多重表示とオーバーレイモデルのMCP公開は未実装。

関連検証: `tests/command-palette.test.cjs`、manifest/boundary/presentation回帰、`scripts/shell-overlay-ui-test.cjs [EXE]`、既存Shell/トレイ/ページ/設定通知/ホストコマンド試験。実測は[VERIFICATION](../VERIFICATION.md)。

## 領域別指定とパレットの寿命

開いた要求の提供元は固定し、割り当て変更は次回表示から適用します。停止・無効化・故障では現在の要求をDefault Shellへ引き継ぎ、別の外部Shellへ自動転送しません。選択結果・実行中状態・取消・フォーカス復帰は既存Controllerが維持します。設定と解決先、現在のViewが異なる間は領域状態に適用待ちを表示します。
