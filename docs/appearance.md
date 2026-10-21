# 共通配色とアクセントパレット

## 設定と設計

「表示 → 共通」のテーマ直下でアクセントカラーを選ぶ。テーマはDark/Light/System、アクセントはミント・アリス・ラベンダー・マジカル・クッキー・カスタムの順で独立して選ぶ。選択は即時保存・反映し、再起動後も保持する。`host.accentColor`はテーマと同じ端末専用項目。既定値は`mint`で、省略時は従来の緑を使う。既存ファイルの自動変換・移動・削除は行わない。既定値へ戻した項目は通常の設定保存と同様にJSONから省略する。

パレットと配色の解決は`src/shared/appearance.ts`を唯一の正本とする。`accentPalettes`に5種類のプリセット、`accentChoices`にカスタムを含む選択順を定義する。「アリス」はアリスブルーを基にした配色で、Light背景は`#f0f8ff`。強調色・その上の文字・淡い選択背景・ホバーをテーマごとに解決する。変更にウィンドウやページの再生成は不要。警告・エラー・削除・バッジ等の意味を持つ色、ユーザーが選んだ画像や色はアクセント変更で置き換えない。

### カスタムの2色

`host.accentColor: "custom"`を選んだときだけ「濃い色」「淡い色」の編集欄を開く。既存の`SettingsColorPicker`を使い、色見本・ネイティブカラーピッカー・HEX入力に対応する。HEXはblur/Enterで確定、Escapeで未確定入力を取消。不正値は入力欄だけに保持する。追加の保存ボタンは置かない。

`host.customAccentDark`と`host.customAccentLight`は`#RRGGBB`形式の文字列で、同じ端末専用JSONへ保存する。既定値はミントのLightの濃淡。プリセットへ切り替えてもこの2項目を保持し、表示ページのリセットでは両方とも既定値へ戻す。部分JSON・検索・既存の設定APIも対象とし、APIの許可・revision・dryRun・原子的保存を維持する。

Lightでは濃い色を強調色、淡い色を選択背景の基にし、Darkでは役割を反転する。元の色は変更せず、表示時だけテーマに合わせて明るさを調整する。Lightの選択背景は相対輝度0.8以上、Darkは0.025以下へ近づけ、強調色と選択背景/標準背景のコントラスト4.5以上を確保する。ボタン文字は白/黒から読みやすい方を選び、ホバーにも4.5以上を確保する。入力した2色をそのまま使う保証ではなく、色の組合せを制限せずに読める配色へ解決する契約とする。

旧`sky-blue`は選択肢から外すが、`legacyAccentPalette`で検証・解決を続ける。保存済みのスカイブルーは配色とIDを保ち、設定に現在の配色名を表示する。別の選択肢を選ぶまで自動置換しない。既存の設定APIでも引き続き有効なIDとする。

## ローカル画面の公開契約（0.75.0以降）

本体、Shellの全領域、通知Surface、WebアカウントのローカルUI、Node/.NET/native Appletのローカルページに、共通preloadが次のCSS変数を設定する。画面は変数を参照し、色コードや同名変数の独自定義を追加しない。古いUIの`:root`や`body.dark`より共通値を優先するため、documentElement/bodyのinline custom propertiesをホストが所有する。固有の別名は`--component-highlight: var(--accent)`のように参照で作る。

| 変数 | 用途 |
| --- | --- |
| `--accent` | 強調文字、選択枠・線、塗りつぶしボタン、チェック |
| `--accent-soft` | 淡い選択背景。上の文字は`--accent` |
| `--accent-text` | `--accent`/`--accent-hover`の面の文字・アイコン・トグルのつまみ |
| `--accent-hover` | 塗りつぶしボタンのホバー |
| `--accent-focus` | キーボードフォーカスの枠 |

```css
.action { background: var(--accent); color: var(--accent-text); }
.action:hover:enabled { background: var(--accent-hover); }
.action:focus-visible { outline: 2px solid var(--accent-focus); }
.selected { background: var(--accent-soft); color: var(--accent); }
```

CSS以外の描画は読み取り専用の`window.appdockAppearance`を使う。

```js
const stop = window.appdockAppearance.onChanged(renderAppearance);
renderAppearance(await window.appdockAppearance.snapshot());
// ページの破棄時にstop()を呼ぶ。描画済みより古いrevisionは無視する。
```

snapshotは`{revision,palette,dark,colors:{accent,soft,text,hover}}`。revisionはプロセス内の配色変更で増加する。購読を先に登録し、非同期取得より新しいrevisionを描画済みなら古い応答を無視する。通常のHTML/CSS画面に購読コードは不要で、preloadが自動反映する。APIは全設定・PC名・パス・認証を公開しない。外部からの設定変更は既存の`appdock.settings.update`とrevision/許可を使い、配色APIに書き込み口を追加しない。

任意のWebサイト・Webアカウントのリモート本文に配色preload・引数・IPCを渡さない。登録した正確なローカルURLとmain frameを照合し、別URLやiframeからの取得を拒否する。登録はWebContents破棄時に解除する。

## 新しい画面・パレットの追加規則

リボンの通常ボタンは文字と標準SVGアイコンで同じ`--ribbon-text`を参照し、テーマごとの中立色を使う。装飾用の薄い色を通常の文字へ流用しない。選択状態は共通の`--accent`/`--accent-soft`を参照し、通常・hover・focus・選択の各状態でコントラスト4.5以上を確認する。無効ボタンの減光、ユーザーが選んだ画像、グループの色線はこの文字色変更の対象に含めない。

1. ローカル画面は既存の`createShellView`、`AppletSurface`または本体Windowの作成経路を使う。独立経路には配色初期引数・正確なURL登録・共通preloadを接続する。リモート画面へ適用しない。
2. sandbox付きpreloadはローカルモジュールをruntime requireできないため、`scripts/build-main.cjs`が共通`appearance-preload.ts`のコンパイル結果を8種類のpreloadへIIFEとして同梱する。専用preloadを追加したらこの一覧と検証を更新する。sandbox/contextIsolationは維持する。
3. 色コードはパレット正本にだけ追加する。選択UI・検索候補は`accentChoices`を参照する。設定検証と外部設定schemaは保存済みIDの互換性も保つ。カスタム色の解決を画面ごとに複製しない。
4. Light/Dark双方で、通常/hoverボタンの文字と選択背景の強調文字を確認する。各組のコントラスト4.5以上を`tests/appearance.test.cjs`で検査する。
5. 保存・既定値省略・端末別分離・再起動・表示中/後から開いた画面・再読込・購読解除を確認する。警告/エラーの色の維持と、リモート本文にAPIがないことも確認する。

回帰は`tests/appearance.test.cjs`と設定基盤の関連試験、固定EXEの`scripts/appearance-ui-test.cjs`。実測結果と成果物のhashは[検証記録](../VERIFICATION.md)へ残す。
