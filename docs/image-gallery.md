# 共通画像ギャラリー

`ui/image-gallery/`はフレームワークに依存しないDOM部品。壁紙履歴を基準にした16:10の画像枠、角丸カード、揃った操作列とサイズスライダーを提供する。現在は本体の画像ライブラリーページが使用する。画像選択ダイアログとWallpaperSlideshowへの適用は次工程であり、現時点で共有済みと扱わない。

## 部品の接続

`mountImageGallery(container, options)`へスクロール要素と`image/select/activate/action`コールバックを渡し、`setModel(model)`で更新する。型は`src/shared/image-gallery.ts`が正本。キーは画像を識別する安定した`id`、`assetId`は内容世代を表す。取得内容が変わったときは新しいassetIdを発行する。

- `fit: contain | cover`で全体表示と切り抜きを切り替える。
- `selection: none | single | multiple`で履歴・選択・管理を表す。操作の意味、確定、保存、権限は呼出元が所有する。
- タイトルは2行、ラベルは2個と残数表示。`textContent`で描画し、HTMLを受け取らない。
- `image(assetId, edge)`は検証済みdata画像、blob、または既存の`appdock://page-images/` URLを返す。任意のfile/http URLを使わない。
- `anchor()/restore(anchor)`で画像IDと相対オフセットを扱う。キー付き更新はフォーカスと画像を保ち、削除された先頭画像は近傍の残存画像へ引き継ぐ。
- `dispose()`でobserver、イベント、画像参照を回収する。取得中の古い応答を失効させる。

`mountGallerySizeControl`はドラッグ中の`change`と操作確定時の`commit`を分ける。サイズは180〜360 CSS px、20px刻み、初期260px。呼出元はchangeでレイアウトだけ更新し、commit時に保存する。モデル更新で操作途中の値を戻さない。検索・グループ変更などでの選択解除は用途側の判断とする。

CSSは`gallery.css`を読み込む。`.ad-gallery`配下と専用クラスへ限定し、利用側の`button`等の広い規則で上書きしない。テーマは`--surface/--border/--text/--muted/--soft/--accent/--shadow`のCSS変数を利用側で指定する。固定の高さを外側へ押し付けず、呼出元のスクロール領域をobserverへ渡す。

画像は可視領域と前後300pxで最大3要求を行い、元の正常画像を保持して次のdecode完了後に差し替える。画面外ではsrcを解放する。512/1024/2048pxの選択は実カード幅とdevicePixelRatioによる。部品内で原画像の読み込み、保存、外部サービス呼出しを行わない。

## ビルドと配布

`dev.bat pnpm run build:image-gallery`は`out/ui/image-gallery/`にES module、CSS、manifestを作る。通常のbuildにも含む。manifestは`apiVersion: 1`、本体版、出力ファイルと3つのソースのSHA256を持つ。

Appletへ適用するときはこの出力一式をvendorへ梱包し、版とhashを記録する。開発repoの相対参照や本体内部importに依存させない。更新時はbundle全体を差し替え、呼出元のadapterと独立配置での起動を確認する。共通部品の更新だけで未変更Appletを一括発行しない。

## 本体管理ページの境界

ルート`image-library`、領域`page.image-library`、minimumHostVersion `0.74.0`。`window.appdockPage`の既存経路を使い、公開型は`src/shared/image-library-page.ts`。原画像サービス・保存・グループ競合は本体に置き、Shellは表示モデルと操作IDだけを使う。ページ再生成でIDは失効する。

プレビュー・グループ編集は本体の`ImageLibraryDialogHost`から共通SettingsDialog/SettingsModal/SettingsOrderDialogを開く。本文ViewもHostModalLayerへ登録し、背景をcapture・hideする。モーダル中は本文の操作を拒否する。Controllerが明示した画像取得のみ読み取りとして許可するが、送信元・frame・session・assetIdの検証を省略しない。閉じると同じViewとフォーカスを復元し、所有元の終了・遷移では待機を取り消す。

表示サイズの`image-gallery-state.json`はPC専用。`schemaVersion: 1`、`library.cardWidth`を保存し、`picker`欄は将来の独立保存用に予約する。選択・検索・スクロールはWindow内だけに保持する。ファイルは変更時にだけ作り、破損・未知版を上書きせず、保存前の外部変更も検出する。修復後は再起動して読み直す。

## 検証

`tests/image-gallery.test.cjs`でサイズ保存、競合、一括所属、選択、ページ寿命、部分登録、最大カタログを確認する。`scripts/image-gallery-ui-test.cjs [固定EXE]`は独立した隔離profileでページ・3モードのbundle・明暗・サイズ・再起動を確認する。既存APIと選択ダイアログの互換性は`image-library-ui-test.cjs [固定EXE]`で確認する。これらは物理IME、複数モニターのDPI移動、実NAS、実壁紙操作の証明にはしない。
