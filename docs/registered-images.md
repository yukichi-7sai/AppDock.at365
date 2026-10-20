# 共通画像ライブラリーと宣言型リボン

AppDock 0.69.0以降の現行契約。登録原画像、分類グループ、Applet設定、リボン表示は本体の共通基盤で扱う。プロフィール固有の保存処理や描画分岐は持たない。採用時の判断と境界は[分離設計](profile-applet-image-library-design.md)を参照する。

管理画面は独立した「画像ライブラリー」ページ。左のグループ一覧、カードサイズ変更、複数登録と一括所属を備える。表示部品の利用方法は[共通ギャラリー](image-gallery.md)、全体の設計と未着手の画像選択・壁紙履歴への適用は[ページ化の設計](image-library-gallery-design.md)を参照する。

## 保存と参照

原画像は注入された共有assets rootの`images/<元ファイル名>`、標準配置ではEXE隣の`data/assets/images/`に保存する。参照は`RegisteredImageRef = { file: string }`、未選択は`null`。パス、URL、他の属性は受け付けない。Windows禁止文字、予約名、末尾空白・点、180文字超、拡張子がPNG/JPEG/WebP以外の名前を拒否する。rootとファイルの転送も拒否する。

PNG/JPEG/WebPの静止画像、5MiB以下、各辺8192px以下かつ16Miピクセル以下。拡張子・実形式・decode・寸法を検証する。原画像の解像度、縦横比、透過、bytesを保ち、アイコン化した画像で置き換えない。APNGとアニメーションWebPは受け付けない。

大文字小文字を無視して同名照合し、同名同内容は再利用、同名別内容は拒否する。登録は一時ファイルへ書込み・flush後、排他的なlinkで完成したファイルだけを公開する。既存原画像を上書きせず、自動の連番や移動は行わない。512ファイルまで。専用インデックスJSONやID対応表は作らない。

64px長辺の一覧サムネイルと96pxの円形表示画像をメモリーへ生成する。円形表示だけ中央で切り出す。Shellへは既存のopaqueなassetIdを渡し、ファイル名やパスを渡さない。読み取りは非同期、watchと2秒pollを併用し、変更したファイルだけをdecodeする。未到着・一時削除・部分ファイルでは参照と直近正常の表示を保ち、正常なファイルが届けば再取得する。初回から画像がなければ通常アイコンを使う。

PNG/JPEGはNativeImage、WindowsのNativeImageが扱わないWebPは専用の非表示offscreen rendererでdecodeする。sandbox・contextIsolationを有効にし、Node/preload/ホストbridgeを渡さず、CSPでdata画像だけを許可する。元bytesを読み込み、小さい表示用PNGだけを返す。処理は直列、15秒の上限、1秒のidle後に回収し、本体終了後の待機処理は新しいrendererを作らない。原画像は変換しない。起動前の補助Window終了で本体を終了しない。

NASの設定場所切替・分散書込み・ネットワーク切断への完全な回復処理は[共有場所の設計](shared-settings-location-design.md)の別工程。今回のローカルファイル試験を実NASの検証として扱わない。

## グループ

共有`settings.json`へ次の分類だけを保存する。画像は複数グループへ所属できる。

```json
{
  "imageLibrary": {
    "groups": [
      { "id": "photos", "name": "写真", "images": [{ "file": "flower.png" }] },
      { "id": "buttons", "name": "ボタン", "images": [{ "file": "flower.png" }] }
    ]
  }
}
```

最大64グループ、各グループ512参照、全体4096所属。IDは英小文字・数字・ハイフン、先頭英数字で80文字以下。名前は空白除去後1～80文字、制御文字と大文字小文字を無視した重複を拒否する。同一グループ内の画像重複も拒否する。「すべて」「未分類」は保存しない仮想一覧。

名前変更、所属編集、並べ替え、グループ削除は原画像の名前・場所・使用先の参照を変更しない。グループは分類であり、アクセス許可やリボンの親子関係ではない。原画像の削除・未使用画像pruneは提供しない。

編集は直前値を検査する。所属編集は対象画像の所属集合だけを比較し、別画像への同時変更を保持する。同じ画像の所属競合、変更済みグループの編集・削除、古い並び順は拒否し、勝手に再送しない。

## 共通設定と選択画面

リボンの「画像ライブラリー」、コマンド`appdock.image-library.open`、または「設定 → 画像ライブラリー → 画像ライブラリーを開く」から管理ページへ移動する。設定カテゴリと検索アンカーは維持し、管理一覧はページへ集約する。左のグループを選び、ファイル名検索、原画像プレビュー、所属編集、グループ追加・名前変更・削除・並べ替えを行う。狭い画面ではグループを上部の選択欄へ畳む。新規の標準リボン配置はホームの次。保存済みの順序・非表示は既存の規則を保つ。

一覧は64件ずつ追加表示する。「すべて選択」は検索・グループの該当全件を含み、未描画分も選択する。複数画像をグループへ追加、現在のグループから解除できる。`membership-batch`は各画像の直前所属集合を検査し、全件と件数上限を検証してから一度だけ保存する。競合では一部だけを変更しない。

「画像を追加」は複数ファイルに対応し、追加・同内容の再利用・失敗を区別する。登録開始時のグループへ所属を一括追加し、登録後に成功画像を選択して表示する。所属保存だけが失敗した場合は登録原画像を残し、明示的な再試行を用意する。登録は独立した保存操作であり、その後の画像選択や親編集をキャンセルしても登録原画像は残る。

「画像サイズ」は180〜360 CSS px、20px刻み、初期260px。操作中は即時反映し、操作確定時だけPC専用rootの`image-gallery-state.json`へ保存する。グループ・検索・選択・閲覧位置を保持する。共有設定や原画像は変更しない。壊れたファイルや未知の版を上書きせず、当該起動中は保存を止める。外部変更との競合も上書きしない。通常起動の既定ページを変更せず、`--restore-view`で画像ライブラリーも復元する。

管理ギャラリーは必要な画像だけ512/1024/2048px長辺で縮小生成する。実幅とdevicePixelRatioで段階を選び、元画像を拡大しない。内容hashと段階で要求をまとめ、直列decodeと概算64MiBのメモリーキャッシュを使う。Shellにはsession内のopaqueな画像ID・assetIdと表示用ファイル名を渡すが、原画像パスや参照による任意取得は許可しない。従来の小型アイコン用64px/96pxと、既存の画像選択ダイアログの表示は維持する。

Appletは`type: "registered-image"`の設定を宣言する。通常フィールドとobject-listのフィールドで使える。`default`は`null`または有効な参照。object-listの`list.imageKey`は同じ定義内のregistered-imageフィールドを指す。従来の`list.iconKey`とWebAppletのinline iconは保持する。

```json
{ "key": "avatar", "title": "アバター画像", "type": "registered-image", "default": null }
```

文字列には任意の`minLength`と`maxLength`も指定できる。最小長を指定した場合は空白だけの値を拒否する。共通フォームのblur/Enter確定、Escape取消、ダイアログOKによる登録単位の保存を使う。

本体内の選択は共通SettingsDialogを使い、親ダイアログの一時入力だけを変更する。重なったモーダルがある間はショートカット記録の抑止を維持する。ローカルAppletページからの選択は本体へ委譲し、表示中Viewをcapture・hide、独立Windowを操作不可にして本体の選択画面を表示する。完了・取消・提供元停止で同じViewとフォーカスを復元し、WebContents/sessionを再生成しない。共有preloadのHostModalLayerがShellの背景を覆う。

### 画像入力部品とアイコンの選択

画像フィールドは共通`RegisteredImageInput`を使う。固定サイズのプレビュー自体を画像選択ボタンとし、画像を外すアイコンだけを隣に置く。別の選択ボタンやファイル名は表示しない。プレビューはクリック・Enter・Spaceで共通選択画面を開き、設定済みなら変更、未選択ならプレースホルダーから選択する。操作名のツールチップとアクセシブル名、キーボードのフォーカス表示を保つ。未選択時は解除を無効にする。解除は利用先の参照だけを外し、ライブラリーの原画像を削除しない。

共通`RegisteredImagePicker`は画像の登録・検索・選択・確定を担当する。「画像を外す」は入力欄に集約し、選択ダイアログには置かない。未選択の「画像を使う」は無効。取消では呼出元の値を変えず、選択開始ボタンへフォーカスを戻す。一覧のファイル名・検索・寸法は画像の識別用に保持する。公開APIのnullableな戻り値型は互換性のため保持する。

リボングループとコマンドボタンは`RibbonIconPicker`で「画像」「既定のアイコン」をこの順に切り替える。画像モードだけが共通画像入力を表示し、既定モードだけが固定アイコンの一覧を表示する。選択中の既定アイコンは枠とチェックで示す。新規追加は画像モード、既存編集は画像参照の有無から開始モードを決める。編集中の切り替えでは両側の選択を保持し、親ダイアログの適用で確定する。既定モードの適用は`image: null`、画像モードは選択した参照を保存する。画像未選択・解除後の適用は従来どおり固定アイコンへ戻る。親編集の取消は設定を変更しない。モードや非選択側の画像を保存する追加設定は作らない。

新しい画像選択欄でもこの共通入力・選択画面を利用する。既定アイコンの切り替えはリボンの責務とし、一般の画像フィールドにリボン固有の選択肢を持ち込まない。

## Applet API

`minimumHostVersion: "0.69.0"`と`registered-images` capabilityを宣言する。原画像の列挙と選択は信頼されたローカルUIだけが利用でき、リモートサイトへbridgeを渡さない。

| 呼出元 | 操作 | 契約 |
| --- | --- | --- |
| Node | `context.registeredImages.import({ filename?, base64 })` | 元bytesを登録して参照を返す。512KiB以下。名前省略時は内容hash名 |
| Node | `context.registeredImages.copyToCache(image, variant?)` | `original`（既定）または`thumbnail`を自己のPC専用imageDirectoryへコピーし、絶対パスを返す |
| .NET | `context.RegisteredImages.ImportAsync(bytes, filename?, token)` | Nodeと同じ。SDK 0.27.0 |
| .NET | `context.RegisteredImages.CopyToCacheAsync(image, thumbnail?, token)` | `RegisteredImageRef`を使い、既定は原画像 |
| local UI | `appletPage.call('registeredImages.snapshot')` | メタデータ・参照・グループ。サムネイル本体は別取得 |
| local UI | `appletPage.call('registeredImages.preview', { image })` | 縮小プレビューを返す |
| local UI | `appletPage.call('registeredImages.pick', { current })` | `{cancelled:true}`または`{cancelled:false,image:ref|null}`。現在の選択UIは参照を返し、nullable型は互換用に保持。解除は呼出元の画像入力で行う |
| local UI | `appletPage.call('registeredImages.import', { filename?, base64 })` | プログラム登録と同じ上限 |

`copyToCache`は自己manifestのregistered-image設定、またはobject-list内の同型フィールドが現在参照している画像だけを受け付ける。登録しただけでは読取対象にならず、まず自己設定へ保存する。生成コピーはruntime世代別とし、停止・異常終了・世代変更で回収する。共有原画像は回収しない。古い処理の完了で新世代のコピーを消さない。ページで表示するときは既存の`pages.registerImages`へコピーを渡し、その画像IDの寿命も守る。

登録データはbase64で送り、Node/.NET共通の1MiB JSON-RPC行上限内に収める。ネイティブファイル選択による本体の登録だけが5MiB上限を使う。大きい原画像は利用者が共通選択画面から登録する。APIに任意のホストファイルパスは渡さない。

## 宣言型リボン

`ribbon-items`と`settings` capabilitiesを宣言し、最大16件の`ribbonItems`を定義できる。HTMLや空ページは不要。

```json
{
  "id": "main", "title": "プロフィール", "action": "settings", "icon": "user",
  "imageSetting": "avatar", "imageShape": "circle", "iconOnly": true,
  "defaultPlacement": "bottom"
}
```

IDはApplet内で安定させる。リボンIDは`applet:<Applet ID>:<id>`。actionは自己設定を開く`settings`だけ。画像設定は自己のregistered-imageフィールドに限定する。画像形状はsquare/circle、配置はtop/bottom。省略時はsquare/top、iconOnlyはfalse。実際の検証は`ribbon-items.ts`を正本とする。

宣言の初期値より保存した親グループと配置・表示設定を優先する。宣言のbottomを利用者がtopへ変えた場合は明示overrideを保存する。無効Appletは実リボンから外し、設定と配置は保持する。設定への入口はruntimeの開始失敗時にも使用できる。名前・tooltip・アクセシブル名は宣言値と利用者のリボン表示名から作り、プロフィールのユーザー名・頭文字を投影しない。

グループ・コマンドボタンの`image`、通常／動的ページの`image`、`ribbon.itemOverrides[id].image`も同じ参照を使う。画像が使えない場合は宣言・設定した固定アイコン、WebAppletでは旧inline iconへ戻る。外部リボン編集のadd/updateButton、add/updateGroup、updateItemも参照またはnullを受け付ける。

## プロフィールと既存データ

独立repo [Applet.Profile.at365](../../Applet.Profile.at365/README.md)の`at365.profile`が名前・アバターの自己設定と宣言型リボンを提供する。本体はこのIDや設定キーを固定参照しない。初期リボンは下寄せ・画像のみ・固定名「プロフィール」。未選択時はuserアイコン。

新規ホスト設定にはtop-levelの`profile`を作らない。旧`profile`は解釈しない値として保存時に保持し、旧`profile`リボンIDも設定内に保持する。旧`data/assets/profile/`や`avatar.png`は削除・コピー・自動移行しない。新Appletを導入して名前と画像を選び直す。WebAppletの既存`icon`も保持し、`image`を選んだ場合に優先する。

## 検証と追加時の規則

`tests/registered-images.test.cjs`は参照・保存・同名衝突・グループ競合・欠落回復・設定・汎用リボンを検査する。`scripts/image-library-ui-test.cjs [固定EXE]`は独立Profile/WebApplet、Node/.NET API、選択画面、原画像hash、表示、再起動を隔離profileで確認する。先に`tests/fixtures/dotnet/AppDock.RegisteredImages`をRelease publishする。必要な出力場所と実測は[VERIFICATION](../VERIFICATION.md)を参照する。

`scripts/ribbon-customization-ui-test.cjs [固定EXE] --icons-only`は共通画像入力とリボンのモード切替、親・子ダイアログの取消、フォーカス復帰、キーボード、解除と適用、明暗テーマ・画面幅、原画像保持・実再起動後の選択状態を確認する。

新しい利用先は参照型・共通選択・既存の画像asset投影を使う。用途ごとの原画像保存、独自のID対応表、専用監視、ホストのApplet ID判定を追加しない。原画像、メモリーの縮小画像、PC専用コピー、ページ画像IDの寿命を混同しない。
