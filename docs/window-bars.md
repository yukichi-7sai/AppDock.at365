# タイトルバーとステータスバー

本体の`workspace/bars.html`を2つのWebContentsViewで表示する。本体rendererは43pxと28pxの枠・フォーカス移動を管理する。

「設定 → ステータスバー」の「ステータスバーの表示」で下部全体を切り替えます。`host.showStatusBar`は既定ONで、変更は即時反映・保存されます。OFFでは28pxの予約枠とTabの入口を取り除き、本文とオーバーレイの表示範囲を広げます。本体はnative Viewを非表示にして操作を受け付けず、Viewの状態は保持します。再表示時は同じViewを利用します。

本体rendererの下部には稼働数・版・更新ボタンを表示し、コマンドパレットボタンは置きません。パレットはタイトルバーの検索ボタン、共通ショートカット、公開コマンドから開けます。内部`palette`操作は共通パレットを開きます。

## 内容と操作

[内部型](../src/shared/window-bars.ts)を正本とします。`WindowBarModel`はschemaVersion 1、primary context、領域、表示revision、テーマ、本体版、パレットのキー表示、最大化状態、実行中Applet数、アクティブ通知件数`activeNotificationCount`、更新進捗、利用可能な操作IDを持ちます。完全設定・更新元・保存パス・認証情報は投影しません。

本体の`WindowBars`が状態と操作可否を投影し、`WindowBarHost`がView・ready・配置・寿命を所有します。最大化・最小化・終了、パレット、通知センター表示、更新開始・キャンセルは既存の本体サービスへ渡します。更新開始前に本体の現在入力をflushし、設定処理中・更新中の重複開始を拒否します。更新処理と進捗はバーのView交換後も同じ本体サービスで続きます。

| 領域      | 操作                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------- |
| titlebar  | 戻る、進む、パレット、通知センター表示、最小化、最大化／元に戻す、閉じる、更新を取り消せる間だけキャンセル |
| statusbar | パレット、本体更新、更新を取り消せる間だけキャンセル                                           |

操作IDは本体発行の不透明な値です。描画側はIDからコマンド・パスを組み立てません。タイトルバーのドラッグ領域は描画側が`-webkit-app-region: drag`で指定し、操作部品は`no-drag`にします。本体rendererは通常時の検索・通知・ウィンドウボタンを、更新処理中だけ進捗・取得量・キャンセルで覆います。進捗全体を`no-drag`にし、終了後は通常表示へ戻します。キーボードの入口・Tab境界は表示中の有効なボタンだけを対象にし、進捗表示中はキャンセルへ移動します。ステータスバーを表示している間は下部の稼働数・版・更新を維持します。

## 本体内部bridge

本体rendererはブランドアイコンの左に「戻る」「進む」のボタンを常時並べる。共通のSVG矢印を左向きと右向きに描画する。本体0.126.0以降は、移動先がある方向にだけ `actions.back` と `actions.forward` を発行する。操作IDのない方向のボタンは無効になる。描画側は同じ操作IDで[本体の移動履歴](host-pages.md#戻る進む)を操作できる。

本体rendererの通知ボタンはベルだけを表示し、`notifications`操作で本体の通知センターを開きます。0件は通常色、1件以上は共通アクセント色を使い、説明にはアクティブ件数を表示します。件数はリボンと同じ通知サービスの状態を使い、通知センターのみの通知も含めます。センターを開いても件数と色は変わらず、閉じる・解消・期限切れ・撤回・発行元停止で減少します。更新進捗表示中はベルを覆い、操作できません。

本体のバーViewにだけ`window.appdockBar: WindowBarApi`を公開します。Nodeや`window.dock`は渡しません。

1. `onChanged(callback)`を購読してから`connect()`で`sessionId/snapshot`を取得します。同じ領域の古いrevisionを無視します。
2. 初回描画後に`ready(sessionId)`を送ります。準備中は非表示で、従来の有効なViewを維持します。期限は10秒です。
3. `invoke({sessionId, requestId, actionId})`で操作します。requestIdはUUIDを推奨します。同一session・requestIdの同一操作は実行中／完了結果を再利用し、異なる操作への再利用は拒否します。完了後2分、最大512件で管理し、実行中の記録を追い出しません。接続し直した後に変更操作を自動再送しません。
4. `onFocus(first/last)`と`focusHost(before/after)`でTab境界を渡します。`shortcut(key)`は本体の共通入力経路を使い、global側が所有するキーは二重実行しません。

要求はWebContents、main frame、登録URL、sessionを照合します。操作はさらにactive・ready・表示中であることを検査し、失効したsessionや準備中・非表示のViewからの操作は拒否します。

## 背景・配置・復旧

本体の編集ダイアログとパレットは本文内に収め、本文だけを薄くぼかします。両バーとリボンは表示・操作を維持します。バーの撮影・背景画像への変換・一時非表示は行いません。

バーのボタンから本体内の新しいダイアログを開く場合は、[ダイアログの追加手順](settings-list-editing.md#shellからダイアログを開く)に従います。表示は本体に依頼し、開閉時のWebContents間のフォーカス移動と、同じボタンへ戻す接続を追加します。現行の操作ID一覧に汎用ダイアログ開始操作はありません。新しい操作は公開モデルと本体の機能側へ定義し、本体は同じ経路を使用します。

パレットはnative OverlayHostで本文の矩形だけに置きます。本文・Applet・通知のViewを作り直さず、各バーの位置とzoomを本体枠に合わせます。本体rendererの再読込中は古い配置を非表示にし、新しい枠の報告後に再表示します。

renderer異常終了・応答停止・読込失敗・ready期限超過はログとネイティブの再試行操作へ接続します。[画面構成](workspace-ui.md)を参照してください。

## 検証

`tests/window-bars.test.cjs`は公開状態・操作可否・session・重複受付を検査します。`scripts/workspace-ui-test.cjs`は本体UIの起動・旧設定の無視・操作境界を確認します。

`scripts/shell-bars-ui-test.cjs [固定EXE]`は実ウィンドウ操作、Windowsのマウス入力によるドラッグ、両テーマ、サイズとzoom、Tab、パレットを検査します。`scripts/host-modal-ui-test.cjs [固定EXE]`はダイアログ・パレットの本文範囲、ぼかし、連続開閉と3領域の操作維持を確認します。更新のHTTP取得・進捗・取消は既存の`update-progress-ui-test.cjs [固定EXE]`で検証します。実測と未確認事項は[VERIFICATION](../VERIFICATION.md)に記録します。

`shell-bars-ui-test.cjs [固定EXE] --controls-only`は通常バーの操作・パレット・Tab移動・最小化/最大化/復元・実ドラッグ・閉じるに対象を絞ります。modal被覆等を含む全体試験とは結果を区別します。

`shell-bars-ui-test.cjs [固定EXE] --visibility-only`は設定インデックス・検索・既定ON・即時切替と保存・再起動後のOFF保持・ページの初期化・非表示Viewの操作拒否とフォーカス復帰・Viewのsession保持を確認します。明るい通常幅と暗い狭幅を代表画面として確認します。

ドラッグ領域の指定は[Electronの公式仕様](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions#custom-draggable-regions)に従います。
