# タイトルバーとステータスバー

`titlebar`と`statusbar`は独立したShell領域です。「設定 → 表示 → ワークスペースの表示」で各提供元を選び、省略・未提供・無効・故障時はその領域だけDefault Shellを使います。追加Shellは`minimumHostVersion: "0.64.0"`以降を宣言します。

```json
{
  "shell": {
    "apiVersion": 1,
    "views": { "titlebar": "title.html", "statusbar": "status.html" }
  }
}
```

Default Shellは両領域で`bars.html`を使い、別々のWebContentsViewから同じ公開bridgeで接続します。本体rendererは43pxと28pxの枠・フォーカス移動だけを管理し、復旧用のバーを重複描画しません。外部Shellも同じ予約寸法を使い、自由な高さ指定は提供しません。

## 内容と操作

[公開型](../src/shared/shell-bars.ts)を正本とします。`ShellBarModel`はschemaVersion 1、primary context、領域、表示revision、テーマ、本体版、パレットのキー表示、最大化状態、実行中Applet数、更新進捗、利用可能な操作IDを持ちます。完全設定・更新元・保存パス・認証情報は投影しません。

本体の`WindowBars`が状態と操作可否を投影し、`ShellBarHost`がView・提供元・ready・配置・寿命を所有します。最大化・最小化・終了、パレット、通知へのフォーカス、更新開始・キャンセルは既存の本体サービスへ渡します。更新開始前に本体の現在入力をflushし、設定処理中・更新中の重複開始を拒否します。更新処理と進捗はバーのView交換後も同じ本体サービスで続きます。

| 領域 | 操作 |
| --- | --- |
| titlebar | パレット、通知バナーへフォーカス、最小化、最大化／元に戻す、閉じる |
| statusbar | パレット、本体更新、更新を取り消せる間だけキャンセル |

操作IDは本体発行の不透明な値です。ShellはIDからコマンド・パスを組み立てません。タイトルバーのドラッグ領域は描画側が`-webkit-app-region: drag`で指定し、操作部品は`no-drag`にします。Default Shellは従来の色・配置・検索・通知・ウィンドウボタン、下部の稼働数・版・更新・進捗を維持します。

## 公開bridge

選択されたローカルViewにだけ`window.appdockBar: ShellBarApi`を公開します。Nodeや`window.dock`は渡しません。

1. `onChanged(callback)`を購読してから`connect()`で`sessionId/providerAppletId/snapshot`を取得します。同じ領域の古いrevisionを無視します。
2. 初回描画後に`ready(sessionId)`を送ります。準備中は非表示で、従来の有効なViewを維持します。期限は10秒です。
3. `invoke({sessionId, requestId, actionId})`で操作します。requestIdはUUIDを推奨します。同一session・requestIdの同一操作は実行中／完了結果を再利用し、異なる操作への再利用は拒否します。完了後2分、最大512件で管理し、実行中の記録を追い出しません。接続し直した後に変更操作を自動再送しません。
4. `getSettings/onSettingsChanged/executeCommand`は自Appletの設定・利用可能な自己コマンドだけを扱い、他Appletや本体の任意コマンドを実行しません。保存には通常のApplet設定APIを使います。
5. `onFocus(first/last)`と`focusHost(before/after)`でTab境界を渡します。`shortcut(key)`は本体の共通入力経路を使い、global側が所有するキーは二重実行しません。

要求はWebContents、main frame、登録URL、領域、提供元の有効状態とworker世代を照合します。操作はさらにactive・ready・表示中であることを検査し、ネイティブ編集ダイアログや共通オーバーレイの表示中は受け付けません。切替前のsession・準備中View・停止済み提供元の操作は拒否します。

## 背景・配置・復旧

両バーとリボンを同じ`HostModalLayer`へ登録します。本体の編集ダイアログでは[共通背景管理](settings-list-editing.md)を使い、画像の準備完了後に元のViewを一時非表示にします。ダイアログを閉じると最新の表示希望へ戻します。狭い窓でバーとダイアログが重なっても、バーの画像はnative dialogの背後です。

パレットは従来のnative OverlayHostを最前面に置きます。本文・Applet・通知のViewを作り直さず、各バーの位置とzoomを本体枠に合わせます。本体rendererの再読込中は古い配置を非表示にし、新しい枠の報告後に再表示します。

提供元交換は領域ごとにready後に行います。renderer異常終了・応答停止・ロード失敗・ready期限超過では対象領域の故障を記録し、Default Shellへ戻します。設定指定は保持します。故障抑止は既存のプロセス内Registryを使い、新しい保存ファイルは追加しません。提供元の無効化・意図的再起動では故障を作らず、再開後に選択を再適用します。領域別再試行、版更新、`--safe-shell`の共通契約は[領域別割り当て](shell-region-assignment.md)を参照してください。

## 検証

`tests/window-bars.test.cjs`は公開状態・操作可否・session・重複受付を検査します。`tests/shell-region.test.cjs`と`tests/shell-boundaries.test.cjs`は共通選択・描画境界を検査します。

`scripts/shell-bars-ui-test.cjs [固定EXE]`は実ウィンドウ操作、Windowsのマウス入力によるドラッグ、両テーマ、サイズとzoom、Tab、パレット、別々の提供元、故障・無効化・再試行・safe起動を検査します。`scripts/host-modal-ui-test.cjs [固定EXE]`は実際の3領域とダイアログのWindows合成画像を確認します。更新のHTTP取得・進捗・取消は既存の`update-progress-ui-test.cjs [固定EXE]`で検証します。実測と未確認事項は[VERIFICATION](../VERIFICATION.md)に記録します。

ドラッグ領域の指定は[Electronの公式仕様](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions#custom-draggable-regions)に従います。非表示Viewのドラッグが残る旧版の[修正記録](https://github.com/electron/electron/issues/51176)も確認し、利用中の固定Electronと実Windows入力で表示・非表示時を検証します。
