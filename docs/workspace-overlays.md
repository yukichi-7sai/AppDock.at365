# 本体のオーバーレイ

## 本体と描画の分担

| 部分 | 責務 |
| --- | --- |
| `OverlayHost` | primaryのモーダル枠1件、遅延生成、表示順序、寸法・zoom、IPC送信元、ready、復旧、フォーカス、破棄 |
| `OverlayController` | 内容別のモデル・操作・完了・取消。表示先を所有しない |
| `CommandPaletteSession` | 最新コマンド列挙・利用可否、ピン保存、共通実行、実行中の重複防止 |
| 本体`command-palette` renderer | パレットの検索・選択位置・キーボード移動・描画 |
| 本体workspace renderer | リボンと一時グループの内部snapshotを描画する |
| 本体`CommandLink` | 対象コマンドを初期選択して実行パレットを開く |

設定の候補選択は[共通コマンド選択ダイアログ](command-selection.md)を使い、パレットのOverlay経路を使用しない。

下のApplet WebContentsや入力・sessionを再生成しない。パレットは本体rendererが報告する本文矩形内の独立WebContentsView。一時リボングループはクライアント領域を使う。背景は[表示設定](appearance.md#ダイアログパレットの背景)に従う。リボン・タイトルバー・ステータスバーは操作でき、本文の背景クリック・route変更で閉じる。表示中もキー・マウス・タッチパッドのトリガーを継続し、フォーカスのあるダイアログ・パレットでは単独のTab・Escape・Enter・上下左右だけを画面操作へ渡す。修飾キー付きの割り当てと、別アプリでの割り当ては通常どおり評価する。キー記録中の保護は[キー入力の仕様](keybindings.md#ダイアログとパレットの入力)に従う。

所有Windowの非表示・最小化・再読込・終了、本文のroute変更、新要求への置換で取消する。元routeとWindowのフォーカスが保たれている場合だけ元のWebContentsへ戻す。開始済みコマンドの副作用は取消で巻き戻さない。要求ごとの`requestId`照合により、旧呼出側の取消が後から開いた要求を閉じない。

## リボングループの内部bridge

`RibbonGroupSession`が内容と寿命を持ち、接続中リボンと同じHTMLへ`window.appdockOverlay`を公開する。通常リボンは`window.appdockRibbon`を使用し、同じHTMLが接続の種類を判別する。契約は`src/shared/overlays.ts`。

1. `onChanged(callback)`を登録し、`connect()`で`sessionId/snapshot`を受け取る。
2. `kind:ribbon-group`の`content.groupId/title/parent/anchor/viewport/displayMode/items`を描画して`ready(sessionId)`する。
3. `act({id,type: "dismiss"})`または`ribbonChoose`（`actionId/requestId`）を送る。
4. 終了時は購読を解除する。ready期限・送信元・登録URL・現session・操作IDを本体が検査する。

一時グループのViewは閉鎖時に破棄する。表示失敗は要求を閉じ、子の実行要求を再送しない。元のリボンの接続終了でも一時表示を取り消す。

## 本体固定パレット

本体の`command-palette/index.html`と専用preloadを使う。`window.appdockPalette`の`connect/ready/act/onChanged/onSuspended`だけを公開し、Node、`window.dock`、リボンbridge、設定取得、任意コマンド実行を公開しない。WebContents・main frame・登録URL・route・現session・ready・モデルIDを検査する。

モデルは`schemaVersion:1/id/contextId:primary/kind:command-palette/revision/dark/language/modal:true/content`。contentは`commands/pins/shortcuts/triggers/busy/error/initialCommandId`。操作は`dismiss/choose/togglePin/movePin/openTriggerSettings`で、実行直前にも最新の権限・可否を照合する。busy中の重複操作を拒否し、エラー時はパレットを残す。要求は`mode:execute`だけを受け付ける。

- `mode:execute`は共通実行経路を使う。ピン操作は最新の本体設定から対象だけ更新し、検索外のピン・他設定を保つ。
- `initialCommandId`は対象を初期選択・可視位置へ移動し、フィルターへIDを入力して文字列を全選択する。入力の置換・クリア後は通常検索へ戻り、snapshot更新で入力を初期化しない。通常起動は空検索とする。開くだけでは実行せず、対象消失時に別コマンドを代わりに実行しない。
- `mode:select`は指定集合からIDを返すだけで、実行・ピン保存を行わない。停止中・保存済み未知コマンドも選べる。
- 結果は`{status:selected|executed,commandId}`または`{status:cancelled,reason}`。

初回は遅延生成し、閉じると非表示Viewを1件保持する。sessionを失効させ`onSuspended`で旧モデル・検索・選択を捨てる。次要求は新sessionとモデルを描画し、`ready(sessionId,modelId)`後に表示する。リボンの表示とは独立して寿命を管理する。

候補IDと要求IDを集合化し、説明のタグ名解決は共有索引を使う。同じカタログでの無変更監視はキャッシュを共用する。実行時の最新照合は省かない。設定ページからは本体内部の`settingsPage.palette`で受け渡し、保存キューの完了・入力エラー・page/session/actionを確認する。[コマンドリンク](command-links-design.md)も参照。

ready期限は10秒。読込失敗・renderer終了/応答不能では新しい本体Viewで同じ要求を1回だけ復旧する。続けて失敗したら要求を取り消し、共通エラー報告へ接続して操作停止を解除する。実行済みの操作を再送しない。正常に閉じた次の要求では復旧回数をリセットする。

一般Appletの同一領域の多重表示とオーバーレイモデルのMCP公開は未実装。新しいUIは原則として本体と共通部品で実装する。関連検証は`tests/command-palette.test.cjs`、`tests/overlay-host.test.cjs`、`scripts/workspace-ui-test.cjs [EXE]`、`scripts/command-links-ui-test.cjs [EXE]`。実測は[VERIFICATION](../VERIFICATION.md)。
