# 部分Shellと共通オーバーレイ

Shell Appletは通常Appletに描画提供能力を加えたもの。本体が状態と操作を管理し、選択されたAppletが宣言した領域だけを描画する。未宣言・利用不可・描画失敗の領域にはDefault Shellを使用する。コマンドパレットは本体固定UIとし、Shellの差し替え対象に含めない。

## 担当領域

公開領域は`titlebar`、`ribbon`、`statusbar`、`notification.banner`、`notification.desktop`の5領域。各領域は`host.shellProviders`で指定する。一時グループはリボンの一部として同じ提供元・同じHTMLで描画し、独立した設定・領域・復旧先を持たない。

```json
{
  "apiVersion": 1,
  "id": "example.ribbon",
  "name": "Example Ribbon",
  "version": "1.0.0",
  "minimumHostVersion": "0.90.0",
  "runtime": "node",
  "entry": "worker.cjs",
  "capabilities": ["shell"],
  "shell": {
    "apiVersion": 1,
    "ribbonSchemaVersion": 3,
    "views": { "ribbon": "index.html" }
  },
  "commands": [{ "id": "example.ribbon.compact", "title": "表示を切り替える" }]
}
```

workerでは通常の`context.commands.register`で宣言コマンドを実装する。設定・ページを持つ場合も既存のcapabilityとAPIを使う。Shellとして未選択でもApplet自体の有効状態・コマンド登録は維持する。

描画側は`getSettings()`と`onSettingsChanged(callback)`で自Appletの設定を取得・購読し、`executeCommand(id)`で自Appletの通常コマンドを実行できる。任意の他Appletコマンドの入口にはしない。リボンと一時グループのbridgeには同じ`ShellAppletApi`を適用する。

`views`は最大32件。キーは英小文字から始まる英小文字・数字・ピリオド・ハイフン、最大64文字。HTMLはAppletフォルダー内の相対パス。`ui`も`views`もない宣言は拒否する。将来用・廃止済みキーは検証して保持するが、未対応の領域は描画しない。従来の`shell.ui`は`ribbon`の別名で、`views.ribbon`を優先する。

旧`overlay.command-palette`の保存指定・view宣言は不活性な互換データとして保持する。旧viewを読み込まず、選択・状態・起動・再試行の対象にしない。この領域の`shellRequirement`を持つコマンドだけ利用不可とし、通常のコマンド・設定・ページとApplet自体は維持する。旧`overlay.ribbon-group`も同様に独立した領域としては使わない。

## 本体と描画の分担

| 部分 | 責務 |
| --- | --- |
| `OverlayHost` | primaryのモーダル枠1件、遅延生成、表示順序、寸法・zoom、IPC送信元、ready、復旧、フォーカス、破棄 |
| `OverlayController` | 内容別のモデル・操作・完了・取消。表示先を所有しない |
| `CommandPaletteSession` | 最新コマンド列挙・利用可否、ピン保存、選択だけの結果、共通実行、実行中の重複防止 |
| 本体`command-palette` renderer | パレットの検索・選択位置・キーボード移動・描画 |
| Default Shell / Shell Applet | リボンと一時グループの公開snapshotを描画する |
| 本体`CommandPicker` / `CommandLink` | 選択結果を設定へ反映する、または対象コマンドを初期選択して開く |

下のApplet WebContentsや入力・sessionを再生成しない。パレットは本体rendererが報告する本文矩形内の独立WebContentsView。一時リボングループはクライアント領域を使う。背景は[表示設定](appearance.md#ダイアログパレットの背景)に従う。リボン・タイトルバー・ステータスバーは操作でき、本文の背景クリック・route変更で閉じる。表示中もキー・マウス・タッチパッドのトリガーを継続し、フォーカスのあるダイアログ・パレットでは単独のTab・Escape・Enter・上下左右だけを画面操作へ渡す。修飾キー付きの割り当てと、別アプリでの割り当ては通常どおり評価する。キー記録中の保護は[キー入力の仕様](keybindings.md#ダイアログとパレットの入力)に従う。

所有Windowの非表示・最小化・再読込・終了、本文のroute変更、新要求への置換で取消する。元routeとWindowのフォーカスが保たれている場合だけ元のWebContentsへ戻す。開始済みコマンドの副作用は取消で巻き戻さない。要求ごとの`requestId`照合により、旧呼出側の取消が後から開いた要求を閉じない。

## リボングループの公開bridge

`RibbonGroupSession`が内容と寿命を持ち、接続中リボンと同じHTMLへ`window.appdockOverlay`を公開する。通常リボンは`window.appdockShell`を使用し、同じHTMLが接続の種類を判別する。契約は`src/shared/overlays.ts`と`shell.ribbonSchemaVersion:3`。

1. `onChanged(callback)`を登録し、`connect()`で`sessionId/providerAppletId/snapshot`を受け取る。
2. `kind:ribbon-group`の`content.groupId/title/parent/anchor/viewport/displayMode/items`を描画して`ready(sessionId)`する。
3. `act({id,type: "dismiss"})`または`ribbonChoose`（`actionId/requestId`）を送る。
4. 終了時は購読を解除する。ready期限・送信元・登録URL・現session・操作IDを本体が検査する。

一時グループのViewは閉鎖時に破棄する。表示失敗は要求を閉じてリボン全体の復旧へ接続し、子の実行要求を再送しない。提供元の変更は次の表示から適用し、停止・無効化で操作権限を失効させる。

## 本体固定パレット

本体の`command-palette/index.html`と専用preloadを使う。`window.appdockPalette`の`connect/ready/act/onChanged/onSuspended`だけを公開し、Node、`window.dock`、Shell bridge、設定取得、任意コマンド実行を公開しない。WebContents・main frame・登録URL・route・現session・ready・モデルIDを検査する。

モデルは`schemaVersion:1/id/contextId:primary/kind:command-palette/revision/dark/language/modal:true/content`。contentは`mode/commands/pins/shortcuts/busy/error/initialCommandId`。操作は`dismiss/choose/togglePin/movePin`で、実行直前にも最新の権限・可否を照合する。busy中の重複選択を拒否し、エラー時はパレットを残す。

- `mode:execute`は共通実行経路を使う。ピン操作は最新の本体設定から対象だけ更新し、検索外のピン・他設定を保つ。
- `initialCommandId`は対象を初期選択・可視位置へ移動し、フィルターへIDを入力して文字列を全選択する。入力の置換・クリア後は通常検索へ戻り、snapshot更新で入力を初期化しない。通常起動は空検索とする。開くだけでは実行せず、対象消失時に別コマンドを代わりに実行しない。
- `mode:select`は指定集合からIDを返すだけで、実行・ピン保存を行わない。停止中・保存済み未知コマンドも選べる。
- 結果は`{status:selected|executed,commandId}`または`{status:cancelled,reason}`。

初回は遅延生成し、閉じると非表示Viewを1件保持する。sessionを失効させ`onSuspended`で旧モデル・検索・選択を捨てる。次要求は新sessionとモデルを描画し、`ready(sessionId,modelId)`後に表示する。Shellの変更・停止・再試行はパレットの寿命へ影響しない。

候補IDと要求IDを集合化し、説明のタグ名解決は共有索引を使う。同じカタログでの無変更監視はキャッシュを共用する。実行時の最新照合は省かない。設定ページからは本体内部の`settingsPage.palette`で受け渡し、保存キューの完了・入力エラー・page/session/actionを確認する。[コマンドリンク](command-links-design.md)も参照。

ready期限は10秒。読込失敗・renderer終了/応答不能では新しい本体Viewで同じ要求を1回だけ復旧する。続けて失敗したら要求を取り消し、共通エラー報告へ接続して操作停止を解除する。実行済みの操作を再送しない。正常に閉じた次の要求では復旧回数をリセットする。

一般Appletの同一領域の多重表示とオーバーレイモデルのMCP公開は未実装。新しいUIは原則として本体と共通部品で実装する。関連検証は`tests/command-palette.test.cjs`、Shell境界・領域回帰、`scripts/shell-overlay-ui-test.cjs [EXE]`、`scripts/command-links-ui-test.cjs [EXE]`。実測は[VERIFICATION](../VERIFICATION.md)。
