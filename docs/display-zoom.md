# 共通の表示倍率

「設定 → 表示 → 共通」の「表示倍率」でElectronのページ全体を拡大・縮小する。既定は100%。フォームは50・67・75・80・90・100・110・125・150・175・200%を提供し、選択時に保存・反映する。`host.zoomFactor`は1が100%の数値で、JSON/APIでは0.5～2の範囲を指定できる。選択肢にない有効な保存値もフォームで表示し、勝手に丸めたり置換しない。

テーマと同じく表示ページで選んだ共有／端末専用の保存先へ保存する。部分JSON・検索・ページリセット・共通設定APIに接続し、100%は既定値として保存から省く。表示倍率は勝手に変更せず、保存先の切り替えは既存の設定ファイルで扱う。

## 対象

本体の全ページ・設定とHTMLダイアログ、Default Shell/Shell Appletのリボン・バー・オーバーレイ・通知Surface、ローカル/リモートAppletページ、WebアカウントのローカルUIとWebContentsViewを対象とする。独立ウィンドウ・埋め込み・非表示状態も同じ倍率を保持し、新規作成・再読込・Webページ遷移・再起動後にも適用する。.NETが直接作成するウィンドウ、Windows標準のメニュー・ファイル選択・Windows通知、描画用でない音声/画像処理workerは対象外。

OSのDPI拡大率に対する追加のページ倍率として扱い、OS設定やウィンドウの保存サイズ自体は変更しない。拡大時には同じウィンドウ内の表示範囲が小さくなり、各ページの既存スクロールやレスポンシブレイアウトを使う。

## 実装と画面追加の規則

`src/shared/display-zoom.ts`に既定値・範囲・フォーム選択肢、`src/main/core/display-zoom-host.ts`に適用と寿命管理を集約する。設定適用時に登録済みの画面へ`setZoomFactor`で反映し、画面の再作成は不要。Chromiumの同一originによる倍率共有を避けるため、各WebContentsを`setZoomMode('isolated')`で登録する。リモートページへのpreload・Node・IPCの追加は行わない。

- 新しい表示用WebContentsは、読込前に`registerDisplayZoom`へ登録する。現在は本体、`AppletSurface`、`createShellView`、WebアカウントのWebビュー、独立通知Windowの作成口で登録する。破棄時は登録を自動解除する。
- CSS座標からElectronのView境界へ渡す位置・サイズは、親描画面の倍率を1回だけ掛けてDIPへ変換する。OSのDPI倍率を重ねて掛けない。既存のShell/バー/オーバーレイの補正と合わせ、Appletページ・Webアカウントの子Viewも同じ規則に従う。
- デスクトップ通知は内容のCSS幅・高さに倍率を掛けてWindow/Viewを配置する。利用可能なworkArea内へ収め、モデルへ渡す幅・最大高さは倍率で割ったCSS座標とする。内容の倍率だけを変えて固定枠へ切り取らない。
- 外部Shellや.NET Appletが提供するHTMLもホストのElectronで描画する場合は対象となる。Appletの実装言語で除外を判断しない。

## 検証

`tests/display-zoom.test.cjs`で既定値・範囲・疎な保存/リセット・登録/遷移/破棄・通知境界を確認する。`scripts/display-zoom-ui-test.cjs [固定EXE]`は隔離profileで複数倍率、Shell、ローカル/リモートApplet、埋め込み座標、通知、再起動と端末JSONを確認する。通知表示可否だけはfixtureで許可するため、Windowsの実受信・ロック・全画面時の通知可否を検証した証拠にはしない。実測結果は[VERIFICATION](../VERIFICATION.md)へ記録する。
