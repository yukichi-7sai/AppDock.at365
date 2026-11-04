# 共通配色とアクセントパレット

本体の基本色・明暗テーマの正本は `resources/configs/theme.json`、アクセントのプリセットは `resources/configs/accent-color.json`。共通preloadが本体・Default Shell・登録されたローカルAppletへCSS変数を配布する。`src/renderer/theme.css` は本体の基本スタイルを担い、色値は持たない。派生色の計算は `src/shared/appearance.ts` が所有する。

## テーマJSON

配布物・更新ZIPではEXE隣の `configs/theme.json` に配置する。起動時に1回読み、編集はAppDockの再起動で反映する。Light/Dark/Systemの設定変更は読み込み済みの定義から即時に切り替える。画面の再読込ではファイルを読み直さない。

形式は `schemaVersion: 1` と `light` / `dark` のオブジェクト。各テーマの18項目の用途は[テーマの色一覧](../THEME.md)を参照。

値は `#RRGGBB`、`shadow` と `scrim` は `#RRGGBBAA` も受け付ける。混色・選択背景・影の寸法・透明な画面の構造・アクセントのホバー/前景色などの派生値はCSSまたは共通解決処理が所有する。任意のCSS式、URL、未知のキーは取り込まない。項目の欠落・不正値は項目単位、JSONの破損・不明なschemaVersion・読取失敗はファイル全体をビルド時に同じJSONから同梱した既定色で補う。通常起動では元ファイルを作成・修復・上書きしない。

同じ意味の背景・文字・通常罫線は同じ変数を参照する。画面別の微妙な色違いは持たない。警告/エラー・フォーカス・選択などの意味は区別し、必要な強弱は基準色から混色する。ユーザー指定の色・画像・カラーピッカーの見本色や、透過画像そのものを確認する白い下地はテーマ色へ変換しない。パレット・通知・ジェスチャー表示の外側は透明を保つ。

発行・更新時は、編集済みでも同梱された `configs/theme.json` を内容ごと上書きする。今回の配布にない追加ファイルは保持し、フォルダー全体は交換しない。[配布仕様](portable-distribution.md)の既存処理を使う。テーマJSONの配色と `window.appdockAppearance` の `theme` を提供する本体は0.139.0以降。

`theme-source.ts` が外部ファイルを一度読み、Electronの本体/バー背景と共通appearance snapshotへ渡す。sandbox付きpreloadからファイルを読まず、既存の登録URL・main frameの制限を保持する。snapshotの `theme` は上記の色と、エラー色の面に使う計算済みの `onError`。カスタムアクセントのコントラスト判定も選択テーマの背景・パネル・raisedを参照する。任意に編集した全色の組合せの可読性を自動保証するものではなく、既定テーマと代表画面の読みやすさを検証する。

試験は `tests/theme.test.cjs`、`tests/appearance.test.cjs`、更新時の上書き/追加保持は `tests/folder-host.test.cjs`。`scripts/theme-ui-test.cjs [固定EXE]` は隔離profileの `configs/theme.json` を使い、編集・部分不正・再起動・Light/Dark/Systemと本体/Shell/ローカルAppletを確認する。配布物の同梱JSONと既定値も発行時に照合する。

## アクセントカラーJSON（0.141.0以降）

配布物ではEXE隣の `configs/accent-color.json` を起動時に1回読む。編集はAppDockの再起動で反映し、画面の再読込では読み直さない。プリセットの追加・削除・並べ替えにビルドは不要。件数の固定上限は設けない。

```json
{
  "schemaVersion": 1,
  "defaultId": "mint",
  "customLabel": "カスタム",
  "presets": [
    {
      "id": "mint",
      "label": "ミント",
      "light": { "accent": "#217a65", "soft": "#e1f3ec" },
      "dark": { "accent": "#7ce1c5", "soft": "#243b37" }
    }
  ]
}
```

| 項目 | 用途 |
| --- | --- |
| `schemaVersion` | 形式の版。`1`を指定する |
| `defaultId` | 設定の省略・リセット時と、保存済みIDが見つからないときに表示するプリセット。並び順と独立する |
| `customLabel` | 自動で最後に追加するカスタムボタンの表示名 |
| `presets` | JSONの順で表示するプリセットの配列 |
| `id` | 設定へ保存する一意の識別子。表示名を変えても同じIDを保つ |
| `label` | 画面・検索・設定APIでそのまま使う表示名。翻訳しない |
| `light.accent` / `dark.accent` | 各テーマの強調色・選択枠・塗りつぶしボタンの色 |
| `light.soft` / `dark.soft` | 各テーマの淡い選択背景 |
| `light.autoContrast` / `dark.autoContrast` | 任意の真偽値。`true`でカスタムと同じコントラスト補正を使う。`false`または省略は補正なし |
| `hidden` | 任意。`true`ならボタンには出さず、保存済みIDの配色・現在名・APIの選択肢を残す |

`id`は小文字英数字で始め、小文字英数字・`.`・`_`・`-`を使用する。`custom`は自動追加用の予約値で、プリセットへ書かない。`constructor`・`prototype`・`__proto__`も使えない。IDの重複、空のラベル、空の配列は無効。`defaultId`は非表示でないプリセットを指す。色は不透明な`#RRGGBB`だけを受け付ける。ホバー・ボタン上の文字色・フォーカス色はコードで生成する。

### 自動コントラスト補正

`autoContrast`は0.142.0以降で利用でき、Light/Darkごとに独立して指定する。以下はLightだけを補正するプリセットの例。配布済みのプリセットはこの項目を省略し、従来の色をそのまま使う。

```json
{
  "id": "contrast-example",
  "label": "自動補正の例",
  "light": { "accent": "#888888", "soft": "#777777", "autoContrast": true },
  "dark": { "accent": "#75d6f5", "soft": "#173b48", "autoContrast": false }
}
```

`accent`は強調色、`soft`は選択背景の元色として補正する。Darkでもこの役割は交換しない。カスタムの「濃い色/淡い色」を明暗に合わせて振り分けた後と同じ共通処理を使う。選択背景はLightでは明るく、Darkでは暗く調整し、強調色と選択背景・現在のテーマの背景/パネル/raised、塗りつぶしボタンとその文字・ホバーの読みやすさを調整する。処理の基準は後述の「カスタムの2色」と共通。

補正は表示時だけ行い、元のJSON・保存済みID・カスタム2色を変更しない。設定の色見本はカスタムと同様に入力した元色を示す。補正の有無の編集も再起動で反映する。`autoContrast`に文字列の`"true"`、数値、`null`などを指定すると不正な定義として扱う。テーマ背景の組合せによっては要求するコントラストを同時に満たせないため、任意の編集テーマに対する全色の可読性を保証するものではない。

### 読み込みと保存

不足・不正値・読取失敗・JSON破損・未知の形式版は、ファイル全体をビルド時に同じJSONから埋め込んだ既定一覧へ戻す。通常起動ではファイルを作成・修復・上書きしない。表示名はHTMLや翻訳キーとして解釈しない。任意の編集色の可読性までは自動保証しない。

保存済みIDが一覧からなくなっても、設定全体を無効にせず、そのIDを保持して`defaultId`の色を表示する。設定画面にその状態を示し、同じIDを戻して再起動すると元の選択が復帰する。部分JSONも形式の正しい未登録IDを保持できる。設定APIで新たに選ぶときは現在の一覧から指定し、ほかの項目を変更しても消失IDは保持する。明示的に別の色を選ぶと選択IDを置き換える。既定IDは通常の設定保存と同様に省略されるため、省略済みの設定はJSONの`defaultId`変更に追従する。

メインプロセスが検証済み一覧を保持し、登録済みローカル画面へ`window.appdockAppearance.accentColors()`で返す。rendererもその起動時一覧から選択肢・検索・設定定義を構成する。各ウィンドウの起動引数へ一覧全体を複製しない。既存のURL/main frame制限と、共通snapshotによる配色配布を維持する。

更新時は編集済みでも同梱JSONを上書きする。追加ファイルの保持を含む、現在と今後の`configs`共通方針は[配布仕様](portable-distribution.md#配布物と所有範囲)に従う。ファイルごとの自動マージや上書き例外は設けない。

検査は`tests/accent-color.test.cjs`、`tests/appearance.test.cjs`、`tests/folder-host.test.cjs`。`scripts/accent-color-ui-test.cjs [固定EXE]`は隔離JSONで追加・順序・ラベル・Light/Dark別の補正とカスタムとの一致・再起動・消失IDの復帰・破損時のフォールバックを確認する。

## 設定と設計

入力例は`appearance.ts`の`placeholderCss`で統一する。登録済みローカル画面の`input`・`textarea`へテーマJSONの`placeholder`から解決した`--appdock-placeholder`を適用し、入力済みの文字と区別する。設定、ダイアログ、検索欄、ShellとローカルAppletで共用し、リモート本文には適用しない。

「表示 → 共通」でテーマ・[表示倍率](display-zoom.md)・アクセントカラーを独立して選ぶ。テーマはDark/Light/System、アクセントはJSONのプリセットと最後のカスタム。選択は即時保存・反映し、再起動後も保持する。`host.accentColor`はテーマと同じく表示ページで選んだ共有／端末専用の保存先を使う。配布時の既定値は`mint`。既定値へ戻した項目は通常の設定保存と同様にJSONから省略する。

アクセントの派生色は`src/shared/appearance.ts`で解決する。`accentPalettes`はJSONから読み込んだ表示用プリセット、`accentChoices`は最後のカスタムを含む選択順。強調色・その上の文字・淡い選択背景・ホバーをテーマごとに解決する。変更にウィンドウやページの再生成は不要。警告・エラー・削除・バッジ等の意味を持つ色、ユーザーが選んだ画像や色はアクセント変更で置き換えない。

### ダイアログ・パレットの背景

「表示 → 共通」の「ダイアログ・パレットの背景」で「透明」「半透明」「ブラー」を選ぶ。`host.overlayBackground`は表示ページで選んだ保存先へ格納する列挙値`transparent | translucent | blur`で、既定値は`transparent`。設定ダイアログ、画像プレビュー、コマンドパレットへ共通適用し、表示中の画面にも即時反映する。半透明は選択テーマの`theme.json`の`scrim`を背後に重ね、ぼかしは付けない。ブラーは透明な背景と2pxのCSS filter、透明は色の覆いもfilterもなしとする。下のページは画像化しない。カバーの範囲と閉鎖操作は[一覧とダイアログ](settings-list-editing.md#描画順と背景の管理)に従う。半透明の選択肢と共通背景変数は0.140.0以降。

その直下の「ダイアログ・パレットの影」で、共通ダイアログとコマンドパレットの外側の影を切り替える。`host.overlayShadow`は表示ページで選んだ保存先へ格納する真偽値で既定は`true`。表示中にも即時反映し、背景の透明/ブラーとは独立する。選択行の目印・フォーカス枠・メニューや画像カードの影には適用しない。通知の影は[通知設定](notifications.md)のバナー/デスクトップ通知で個別に設定する。

共通preloadが`--appdock-overlay-background`と`--appdock-overlay-filter`を配布する。背景色は半透明時だけ`scrim`、それ以外は`transparent`。別WebContentsのApplet本文のパレット用ブラーCSSも同じ設定に従い、不要なときは除去する。半透明はパレット側の背景で描画し、下のApplet本文へ着色しない。既存設定で項目を省略した場合も透明を使い、明示的な`blur`は保持する。保存・ページリセット・部分JSON・外部設定APIは既存の設定基盤へ接続する。

ローカルAppletのHTML `dialog`も、`::backdrop`に`background: var(--appdock-overlay-background, transparent)`と`backdrop-filter: var(--appdock-overlay-filter, none)`を指定します。影は共通preloadが更新する`:root[data-overlay-shadow='off']`で無効にします。これにより表示中にも設定へ追従し、Appletから全設定を取得する必要はありません。独自CSSで背景を固定しているAppletは、そのCSSで共通変数を参照する対応が必要です。

`scripts/overlay-translucent-ui-test.cjs [固定EXE]`は隔離したテーマJSONと実画面で、3種類の背景切替、編集入力の保持、画像プレビュー、再起動後の保存と色の再読込を検査する。既定色のダイアログ/パレットは、子WebContentsViewも含むテストウィンドウの画像で確認する。既存の閉鎖操作・フォーカス・Applet本文は`dialog-blur-ui-test.cjs`で確認する。

### カスタムの2色

`host.accentColor: "custom"`を選んだときだけ「濃い色」「淡い色」の編集欄を開く。既存の`SettingsColorPicker`を使い、色見本・ネイティブカラーピッカー・HEX入力に対応する。HEXはblur/Enterで確定、Escapeで未確定入力を取消。不正値は入力欄だけに保持する。追加の保存ボタンは置かない。

`host.customAccentDark`と`host.customAccentLight`は`#RRGGBB`形式の文字列で、同じ表示ページの共有／端末専用の選択に従って保存する。既定値はミントのLightの濃淡。プリセットへ切り替えてもこの2項目を保持し、表示ページのリセットでは両方とも既定値へ戻す。部分JSON・検索・既存の設定APIも対象とし、APIの許可・revision・dryRun・原子的保存を維持する。

Lightでは濃い色を強調色、淡い色を選択背景の基にし、Darkでは役割を反転する。元の色は変更せず、表示時だけテーマに合わせて明るさを調整する。Lightの選択背景は相対輝度0.8以上、Darkは0.025以下へ近づけ、強調色と選択背景/標準背景のコントラスト4.5以上を確保する。プリセットを含むボタン文字は白/黒から読みやすい方を選び、ホバーにも4.5以上を確保する。入力した2色をそのまま使う保証ではなく、色の組合せを制限せずに読める配色へ解決する契約とする。

配布JSONの`sky-blue`は`hidden: true`として保持する。保存済みのスカイブルーは配色とIDを保ち、設定に現在の配色名を表示する。カスタム2色の省略時既定値は埋め込み済みの既定ミントから解決し、外部JSONの並べ替えや既定ID変更では変わらない。

## ローカル画面の公開契約（0.75.0以降）

本体、Shellの全領域、通知Surface、WebアカウントのローカルUI、Node/.NET/native Appletのローカルページに、共通preloadが次のCSS変数を設定する。画面は変数を参照し、色コードや同名変数の独自定義を追加しない。古いUIの`:root`や`body.dark`より共通値を優先するため、documentElement/bodyのinline custom propertiesをホストが所有する。固有の別名は`--component-highlight: var(--accent)`のように参照で作る。

基本色も同じ経路で `--bg` / `--rail` / `--side` / `--panel` / `--raised` / `--border` / `--text` / `--muted` / `--faint` を配布する。意味色は `--blue`（info）、`--purple`（decoration）、`--error`、`--warning`、`--success`。`--destructive` はerror、`--ribbon-text` はtextを使う。影の色は `--shadow-color`、既存の影全体は `--shadow`、遮蔽面は `--scrim`。`--on-error` はerrorを背景に塗ったバッジ等の前景色として計算する。アクセントと同じくリモート本文へは渡さない。

| 変数             | 用途                                                            |
| ---------------- | --------------------------------------------------------------- |
| `--accent`       | 強調文字、選択枠・線、塗りつぶしボタン、チェック                |
| `--accent-soft`  | 淡い選択背景。上の文字は`--accent`                              |
| `--accent-text`  | `--accent`/`--accent-hover`の面の文字・アイコン・トグルのつまみ |
| `--accent-hover` | 塗りつぶしボタンのホバー                                        |
| `--accent-focus` | キーボードフォーカスの枠                                        |

```css
.action {
  background: var(--accent);
  color: var(--accent-text);
}
.action:hover:enabled {
  background: var(--accent-hover);
}
.action:focus-visible {
  outline: 2px solid var(--accent-focus);
}
.selected {
  background: var(--accent-soft);
  color: var(--accent);
}
```

設定の追加・並べ替え・上下移動には共通の`accent-action`を使う。通常は`--accent-soft`と`--accent`、ホバーは`--accent-hover`と`--accent-text`を組にして切り替える。更新ボタンと一覧ヘッダーの追加ボタンも同じ規則を使う。背景だけを切り替えたり、`filter: brightness()`で解決済みの色を変えたりしない。寸法は既存のテキスト/アイコンボタンの部品に任せ、削除は既存の意味色を保つ。

CSS以外の描画は読み取り専用の`window.appdockAppearance`を使う。

```js
const stop = window.appdockAppearance.onChanged(renderAppearance);
renderAppearance(await window.appdockAppearance.snapshot());
// ページの破棄時にstop()を呼ぶ。描画済みより古いrevisionは無視する。
```

snapshotは`{revision,palette,dark,colors:{accent,soft,text,hover},theme}`。revisionはプロセス内の配色変更で増加する。購読を先に登録し、非同期取得より新しいrevisionを描画済みなら古い応答を無視する。通常のHTML/CSS画面に購読コードは不要で、preloadが自動反映する。APIは全設定・PC名・パス・認証を公開しない。外部からの設定変更は既存の`appdock.settings.update`とrevision/許可を使い、配色APIに書き込み口を追加しない。

任意のWebサイト・Webアカウントのリモート本文に配色preload・引数・IPCを渡さない。登録した正確なローカルURLとmain frameを照合し、別URLやiframeからの取得を拒否する。登録はWebContents破棄時に解除する。

## 共通スクロールバー

本体、設定インデックス、各一覧とダイアログ、Default Shell、通知、登録されたローカルApplet画面には、コマンドトリガーの設定本文を基準にした共通スクロールバーを使う。縦横とも12px、つまみは周囲3pxの余白と8pxの角丸を持ち、矢印ボタンは表示しない。中立色のつまみを明暗テーマに合わせ、アクセントカラーで見た目を変えない。バー本体・トラック・縦横の交差部・つまみ周囲は透明にし、その場所の背景を見せる。つまみの背景色はpadding-box内だけへ描き、透明な境界まで塗りつぶさない。

色の正本は `resources/configs/theme.json` の `scrollbar`。寸法・CSSの正本は`src/shared/appearance.ts`の`scrollbarCss`。`appearance-host.ts`が、既存の配色登録で照合した正確なローカルURLのmain frameへ`dom-ready`ごとに挿入する。再読込後にも適用し、テーマ変更は共通preloadが更新する`data-theme`へ追従する。新しい設定項目や公開APIは追加しない。任意のWebサイト、Webアカウントのリモート本文、リモートiframeには挿入しない。

各画面には、必要な方向の表示・非表示とスクロール領域の構造だけを残す。例えば共通の下部横バーを持つ設定一覧は、重複する内側の横バーを引き続き隠す。個別の幅・つまみ・トラック・矢印スタイルは追加せず、共通CSSへ集約する。

`scripts/appearance-ui-test.cjs [固定EXE] --scrollbars-only`で、本体・Shell・通知・オーバーレイ・ローカルAppletの実スクロール、明暗とアクセント切替、再読込、リモートiframeへの非適用を確認する。設定一覧のスクロール構造は既存のコマンドトリガーGUIと一覧スクロールGUIで確認する。

## 新しい画面・パレットの追加規則

リボンの通常ボタンは文字と標準SVGアイコンで同じ`--ribbon-text`を参照し、テーマごとの中立色を使う。装飾用の薄い色を通常の文字へ流用しない。選択状態は共通の`--accent`/`--accent-soft`を参照し、通常・hover・focus・選択の各状態でコントラスト4.5以上を確認する。無効ボタンの減光、ユーザーが選んだ画像、グループの色線はこの文字色変更の対象に含めない。

1. ローカル画面は既存の`createShellView`、`AppletSurface`または本体Windowの作成経路を使う。独立経路には配色初期引数・正確なURL登録・共通preloadを接続する。リモート画面へ適用しない。
2. sandbox付きpreloadはローカルモジュールをruntime requireできないため、`scripts/build-main.cjs`が共通`appearance-preload.ts`のコンパイル結果を待機表示・入力パレット用を含む10種類のpreloadへIIFEとして同梱する。専用preloadを追加したらこの一覧と検証を更新する。sandbox/contextIsolationは維持する。
3. 基本色はテーマJSON、アクセントの元色はパレット正本にだけ追加する。選択UI・検索候補は`accentChoices`を参照する。設定検証と外部設定schemaは保存済みIDの互換性も保つ。カスタム色の解決を画面ごとに複製しない。
4. Light/Dark双方で、通常/hoverボタンの文字と選択背景の強調文字を確認する。各組のコントラスト4.5以上を`tests/appearance.test.cjs`で検査する。
5. 保存・既定値省略・端末別分離・再起動・表示中/後から開いた画面・再読込・購読解除を確認する。警告/エラーの色の維持と、リモート本文にAPIがないことも確認する。

回帰は`tests/appearance.test.cjs`と設定基盤の関連試験、固定EXEの`scripts/appearance-ui-test.cjs`。実測結果と成果物のhashは[検証記録](../VERIFICATION.md)へ残す。
