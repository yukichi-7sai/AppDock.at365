# 共通画像ギャラリー

`ui/image-gallery/`はフレームワークに依存しないDOM部品。壁紙履歴を基準にした16:10の画像枠、角丸カード、揃った操作列、サイズスライダーと拡大表示の内容を提供する。本体の画像ライブラリーページ、画像選択ダイアログ、WallpaperSlideshowの壁紙履歴が使用する。

## 部品の接続

`mountImageGallery(container, options)`へスクロール要素と`image/select/activate/action`コールバックを渡し、`setModel(model)`で更新する。型は`src/shared/image-gallery.ts`が正本。キーは画像を識別する安定した`id`、`assetId`は内容世代を表す。取得内容が変わったときは新しいassetIdを発行する。

- `fit: contain | cover`で全体表示と切り抜きを切り替える。
- `selection: none | single | multiple`で履歴・選択・管理を表す。操作の意味、確定、保存、権限は呼出元が所有する。
- タイトルは2行、ラベルは2個と残数表示。`textContent`で描画し、HTMLを受け取らない。
- `image(assetId, edge)`は検証済みdata画像、blob、または既存の`appdock://page-images/` URLを返す。任意のfile/http URLを使わない。
- `anchor()/restore(anchor)`で画像IDと相対オフセットを扱う。キー付き更新はフォーカスと画像を保ち、削除された先頭画像は近傍の残存画像へ引き継ぐ。
- `dispose()`でobserver、イベント、画像参照を回収する。取得中の古い応答を失効させる。

`mountGallerySizeControl`はドラッグ中の`change`と操作確定時の`commit`を分ける。サイズは180〜360 CSS px、20px刻み、初期260px。呼出元はchangeでレイアウトだけ更新し、commit時に保存する。モデル更新で操作途中の値を戻さない。検索・グループ変更などでの選択解除は用途側の判断とする。

CSSは`gallery.css`を読み込む。`.ad-gallery`配下と専用クラスへ限定し、利用側の`button`等の広い規則で上書きしない。テーマは`--surface/--border/--text/--muted/--soft/--shadow`を利用側で指定し、アクセントは[ホストの共通配色](appearance.md)を参照する。固定の高さを外側へ押し付けず、呼出元のスクロール領域をobserverへ渡す。

選択枠はカードの上に重ねた疑似要素で2 CSS pxを描く。画像や市松背景に枠を隠させず、選択時も寸法を変えない。枠はポインター操作を透過する。

`mountGalleryPreview(container, { image })`は拡大画像、読み込み状態、補足情報、所属ラベルを描く。`setModel`のassetIdとstateで取得を切り替え、古い応答と破棄後の応答を無視する。許可URLの検査はカードと共通。モーダル・フォーカス・原画像へのアクセス権は呼出元が所有する。本体はSettingsModal、壁紙履歴は既存native dialogへ配置する。Reactでは`settings-ui/ImageGallery.tsx`の薄いadapterを使う。

画像は可視領域と前後300pxで最大3要求を行い、元の正常画像を保持して次のdecode完了後に差し替える。画面外ではsrcと取得中の応答を失効させ、遅い応答で画像を再保持しない。再び表示範囲へ戻ったときに再取得する。512/1024/2048pxの選択は実カード幅とdevicePixelRatioによる。部品内で原画像の読み込み、保存、外部サービス呼出しを行わない。

## ビルドと配布

`dev.bat pnpm run build:image-gallery`は`out/ui/image-gallery/`にES module、CSS、manifestを作る。通常のbuildにも含む。manifestは`apiVersion: 1`、本体版、出力ファイルと3つのソースのSHA256を持つ。

Appletへ適用するときはこの出力一式をvendorへ梱包し、版とhashを記録する。開発repoの相対参照や本体内部importに依存させない。更新時はbundle全体を差し替え、呼出元のadapterと独立配置での起動を確認する。共通部品の更新だけで未変更Appletを一括発行しない。

WallpaperSlideshowはビルド時に`sync-gallery.ps1`で本体の専用ビルドを実行し、apiVersion・本体版・元ソース・出力hashを照合して`web/vendor/image-gallery/`へ同期する。発行時も同梱ファイルと元のhashを照合する。実行時は同梱ES moduleだけを読み、本体の開発フォルダーを参照しない。

## 本体管理ページの境界

ルート`image-library`、領域`page.image-library`、minimumHostVersion `0.74.0`。`window.appdockPage`の既存経路を使い、公開型は`src/shared/image-library-page.ts`。原画像サービス・保存・グループ競合は本体に置き、Shellは表示モデルと操作IDだけを使う。ページ再生成でIDは失効する。

プレビュー・グループ編集は本体の`ImageLibraryDialogHost`から共通SettingsDialog/SettingsModal/SettingsOrderDialogを開く。本文ViewもHostModalLayerへ登録し、背景をcapture・hideする。モーダル中は本文の選択・グループ編集・サイズ変更などを拒否する。Controllerが明示した画像取得と、遅れて届くWindow内のスクロール位置記録だけは許可する。送信元・frame・sessionの検証は共通で維持し、画像取得ではassetId、位置記録では画像IDと有限なoffsetの範囲を検証する。位置記録は共有設定やPC専用ファイルへ保存しない。閉じると同じViewとフォーカスを復元し、所有元の終了・遷移では待機を取り消す。

管理ページのカード操作は「グループ」「削除」、画像クリックはプレビュー。削除は本体の確認要求に結び付け、使用中の参照を保護する。[削除の保存境界](registered-images.md)を参照する。管理・選択画面のプレビューは`closeOnBackdrop`を有効にし、背景を押して背景で離したクリックで閉じる。画像内のクリックや内側からのドラッグでは閉じず、所属編集・グループ追加などは背景クリックで取り消さない。

表示サイズの`image-gallery-state.json`はPC専用。`schemaVersion: 1`、`library.cardWidth`と`picker.cardWidth`を独立して保存する。選択・検索・スクロールはWindow内だけに保持する。ファイルは変更時にだけ作り、破損・未知版を上書きせず、保存前の外部変更も検出する。修復後は再起動して読み直す。

ダイアログを要求した時点から終了応答まで、Shellの本文を`inert`にし、連続クリックやグループ切り替えによる重複要求を防ぐ。背景のcapture/decodeが失敗してもHostModalLayerは本文Viewを隠し、ダイアログを手前で操作できるようにする。成功時も本体documentの描画フレームを待たず、decodeとDOM配置後に本文Viewを隠す。覆われた本体の描画待ちで透明なダイアログを残さない。接続拒否には原因を識別する理由コードを付けるが、操作の許可条件は変えない。

画像選択は単一選択・全体表示とし、「画像を使う」で親の値を確定する。拡大表示の取消は選択を保ち、選択ダイアログの取消は親の画像を変えない。サイズは親の画像編集とは独立して確定時に保存する。信頼された本体rendererの`galleryImage`は現在の参照・内容世代を取得前後に照合し、同じ縮小画像サービスを使う。Applet/Webへこの内部APIを公開しない。

## 検証

`tests/image-gallery.test.cjs`でサイズ保存、競合、一括所属、選択、ページ寿命、部分登録、最大カタログを確認する。`scripts/image-gallery-ui-test.cjs [固定EXE]`は独立した隔離profileでページ・3モードのbundle・明暗・サイズ・再起動を確認する。既存APIと選択ダイアログの互換性は`image-library-ui-test.cjs [固定EXE]`で確認する。これらは物理IME、複数モニターのDPI移動、実NAS、実壁紙操作の証明にはしない。

`scripts/image-gallery-capacity-ui-test.cjs [固定EXE]`は512枚のPNG、64グループ、4096所属を隔離profileに作り、全件選択・追加表示・検索・キーボードでのサイズ変更・原画像/共有設定の保持を確認する。スクロール各地点の画像src数、表示寸法からのRGBA相当量、data URL文字列量、プロセスメモリーを記録する。RGBA相当量は実測したOSメモリーやdecode中の最大使用量とは区別する。共通bundleへの制御した遅延応答で、画面外への移動・再表示・破棄も検証する。

`scripts/image-library-session-ui-test.cjs [固定EXE]`はモーダル表示後に届くスクロール通知を再現し、位置記録でエラーを表示しないこと、背景の編集と不正な画像IDを拒否すること、画像取得とページ再表示を確認する。capture/decode失敗時のダイアログ表示とView復元、準備が遅い場合の連続クリック、終了後のグループ切り替えも確認する。自動化のfocus emulationを無効にした通常表示と、本体preloadの描画フレームを止めた状態でも表示・取消・復帰を確認する。
