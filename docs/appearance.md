# 共通配色とアクセントパレット

本体の基本色・明暗テーマのCSS変数は `src/renderer/theme.css` を設定UIと固定コマンドパレットで共用する。アクセント色・入力例・スクロールバーは共通preloadから適用し、パレット専用の色一覧を追加しない。

## 設定と設計

ライトモードの入力例は`appearance.ts`の`placeholderCss`で統一する。登録済みローカル画面の`input`・`textarea`へ淡い`--appdock-placeholder`を適用し、入力済みの文字と区別する。設定、ダイアログ、検索欄、ShellとローカルAppletで共用し、ダークモードの既存表示とリモート本文は変更しない。

「表示 → 共通」でテーマ・[表示倍率](display-zoom.md)・アクセントカラーを選ぶ。テーマはDark/Light/System、アクセントはプリセット5種類とカスタムの順で独立して選ぶ。選択は即時保存・反映し、再起動後も保持する。`host.accentColor`はテーマと同じく表示ページで選んだ共有／端末専用の保存先を使う。既定値は`mint`で、省略時は従来の緑を使う。既存の色値を別の色へ自動変換しない。既定値へ戻した項目は通常の設定保存と同様にJSONから省略する。

パレットと配色の解決は`src/shared/appearance.ts`を唯一の正本とする。`accentPalettes`に5種類のプリセット、`accentChoices`にカスタムを含む選択順を定義する。各プリセットの具体的な色は同モジュールで定義する。強調色・その上の文字・淡い選択背景・ホバーをテーマごとに解決する。変更にウィンドウやページの再生成は不要。警告・エラー・削除・バッジ等の意味を持つ色、ユーザーが選んだ画像や色はアクセント変更で置き換えない。

### ダイアログ・パレットの背景

「表示 → 共通」の「ダイアログ・パレットの背景」で「透明」「ブラー」を選ぶ。`host.overlayBackground`は表示ページで選んだ保存先へ格納する列挙値`blur | transparent`で、既定値は`transparent`。設定ダイアログ、画像プレビュー、コマンドパレットへ共通適用し、表示中の画面にも即時反映する。下のページは画像化せず、ブラーは2pxのCSS filter、透明はfilterなしとする。カバーの範囲と閉鎖操作は[一覧とダイアログ](settings-list-editing.md#描画順と背景の管理)に従う。

その直下の「ダイアログ・パレットの影」で、共通ダイアログとコマンドパレットの外側の影を切り替える。`host.overlayShadow`は表示ページで選んだ保存先へ格納する真偽値で既定は`true`。表示中にも即時反映し、背景の透明/ブラーとは独立する。選択行の目印・フォーカス枠・メニューや画像カードの影には適用しない。通知の影は[通知設定](notifications.md)のバナー/デスクトップ通知で個別に設定する。

共通preloadが`--appdock-overlay-filter`を配布する。別WebContentsのApplet本文のパレット用CSSも同じ設定に従い、不要なときは除去する。既存設定で項目を省略した場合も透明を使い、明示的な`blur`は保持する。保存・ページリセット・部分JSON・外部設定APIは既存の設定基盤へ接続する。

### カスタムの2色

`host.accentColor: "custom"`を選んだときだけ「濃い色」「淡い色」の編集欄を開く。既存の`SettingsColorPicker`を使い、色見本・ネイティブカラーピッカー・HEX入力に対応する。HEXはblur/Enterで確定、Escapeで未確定入力を取消。不正値は入力欄だけに保持する。追加の保存ボタンは置かない。

`host.customAccentDark`と`host.customAccentLight`は`#RRGGBB`形式の文字列で、同じ表示ページの共有／端末専用の選択に従って保存する。既定値はミントのLightの濃淡。プリセットへ切り替えてもこの2項目を保持し、表示ページのリセットでは両方とも既定値へ戻す。部分JSON・検索・既存の設定APIも対象とし、APIの許可・revision・dryRun・原子的保存を維持する。

Lightでは濃い色を強調色、淡い色を選択背景の基にし、Darkでは役割を反転する。元の色は変更せず、表示時だけテーマに合わせて明るさを調整する。Lightの選択背景は相対輝度0.8以上、Darkは0.025以下へ近づけ、強調色と選択背景/標準背景のコントラスト4.5以上を確保する。ボタン文字は白/黒から読みやすい方を選び、ホバーにも4.5以上を確保する。入力した2色をそのまま使う保証ではなく、色の組合せを制限せずに読める配色へ解決する契約とする。

旧`sky-blue`は選択肢から外すが、`legacyAccentPalette`で検証・解決を続ける。保存済みのスカイブルーは配色とIDを保ち、設定に現在の配色名を表示する。別の選択肢を選ぶまで自動置換しない。既存の設定APIでも引き続き有効なIDとする。

## ローカル画面の公開契約（0.75.0以降）

本体、Shellの全領域、通知Surface、WebアカウントのローカルUI、Node/.NET/native Appletのローカルページに、共通preloadが次のCSS変数を設定する。画面は変数を参照し、色コードや同名変数の独自定義を追加しない。古いUIの`:root`や`body.dark`より共通値を優先するため、documentElement/bodyのinline custom propertiesをホストが所有する。固有の別名は`--component-highlight: var(--accent)`のように参照で作る。

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

snapshotは`{revision,palette,dark,colors:{accent,soft,text,hover}}`。revisionはプロセス内の配色変更で増加する。購読を先に登録し、非同期取得より新しいrevisionを描画済みなら古い応答を無視する。通常のHTML/CSS画面に購読コードは不要で、preloadが自動反映する。APIは全設定・PC名・パス・認証を公開しない。外部からの設定変更は既存の`appdock.settings.update`とrevision/許可を使い、配色APIに書き込み口を追加しない。

任意のWebサイト・Webアカウントのリモート本文に配色preload・引数・IPCを渡さない。登録した正確なローカルURLとmain frameを照合し、別URLやiframeからの取得を拒否する。登録はWebContents破棄時に解除する。

## 共通スクロールバー

本体、設定インデックス、各一覧とダイアログ、Default Shell、通知、登録されたローカルApplet画面には、コマンドトリガーの設定本文を基準にした共通スクロールバーを使う。縦横とも12px、つまみは周囲3pxの余白と8pxの角丸を持ち、矢印ボタンは表示しない。中立色のつまみを明暗テーマに合わせ、アクセントカラーで見た目を変えない。バー本体・トラック・縦横の交差部・つまみ周囲は透明にし、その場所の背景を見せる。つまみの背景色はpadding-box内だけへ描き、透明な境界まで塗りつぶさない。

寸法・色・CSSの正本は`src/shared/appearance.ts`の`scrollbarCss`。`appearance-host.ts`が、既存の配色登録で照合した正確なローカルURLのmain frameへ`dom-ready`ごとに挿入する。再読込後にも適用し、テーマ変更は共通preloadが更新する`data-theme`へ追従する。新しい設定項目や公開APIは追加しない。任意のWebサイト、Webアカウントのリモート本文、リモートiframeには挿入しない。

各画面には、必要な方向の表示・非表示とスクロール領域の構造だけを残す。例えば共通の下部横バーを持つ設定一覧は、重複する内側の横バーを引き続き隠す。個別の幅・つまみ・トラック・矢印スタイルは追加せず、共通CSSへ集約する。

`scripts/appearance-ui-test.cjs [固定EXE] --scrollbars-only`で、本体・Shell・通知・オーバーレイ・ローカルAppletの実スクロール、明暗とアクセント切替、再読込、リモートiframeへの非適用を確認する。設定一覧のスクロール構造は既存のコマンドトリガーGUIと一覧スクロールGUIで確認する。

## 新しい画面・パレットの追加規則

リボンの通常ボタンは文字と標準SVGアイコンで同じ`--ribbon-text`を参照し、テーマごとの中立色を使う。装飾用の薄い色を通常の文字へ流用しない。選択状態は共通の`--accent`/`--accent-soft`を参照し、通常・hover・focus・選択の各状態でコントラスト4.5以上を確認する。無効ボタンの減光、ユーザーが選んだ画像、グループの色線はこの文字色変更の対象に含めない。

1. ローカル画面は既存の`createShellView`、`AppletSurface`または本体Windowの作成経路を使う。独立経路には配色初期引数・正確なURL登録・共通preloadを接続する。リモート画面へ適用しない。
2. sandbox付きpreloadはローカルモジュールをruntime requireできないため、`scripts/build-main.cjs`が共通`appearance-preload.ts`のコンパイル結果を待機表示用を含む9種類のpreloadへIIFEとして同梱する。専用preloadを追加したらこの一覧と検証を更新する。sandbox/contextIsolationは維持する。
3. 色コードはパレット正本にだけ追加する。選択UI・検索候補は`accentChoices`を参照する。設定検証と外部設定schemaは保存済みIDの互換性も保つ。カスタム色の解決を画面ごとに複製しない。
4. Light/Dark双方で、通常/hoverボタンの文字と選択背景の強調文字を確認する。各組のコントラスト4.5以上を`tests/appearance.test.cjs`で検査する。
5. 保存・既定値省略・端末別分離・再起動・表示中/後から開いた画面・再読込・購読解除を確認する。警告/エラーの色の維持と、リモート本文にAPIがないことも確認する。

回帰は`tests/appearance.test.cjs`と設定基盤の関連試験、固定EXEの`scripts/appearance-ui-test.cjs`。実測結果と成果物のhashは[検証記録](../VERIFICATION.md)へ残す。
