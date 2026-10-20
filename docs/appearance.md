# 共通配色とアクセントパレット

## 設定と設計

「表示 → 共通」のテーマ直下でアクセントカラーを選ぶ。テーマはDark/Light/System、アクセントはミント・アリス・スカイブルー・ラベンダー・マジカル・クッキーの独立した選択とする。選択は即時保存・反映し、再起動後も保持する。`host.accentColor`はテーマと同じ端末専用項目。既定値は`mint`で、省略時は従来の緑を使う。既存ファイルの自動変換・移動・削除は行わない。既定値へ戻した項目は通常の設定保存と同様にJSONから省略する。

パレットのID、表示名、Light/Darkの組は`src/shared/appearance.ts`の`accentPalettes`を唯一の正本とする。「アリス」はアリスブルーを基にした配色で、Light背景は`#f0f8ff`。強調色・その上の文字・淡い選択背景・ホバーをテーマごとに解決する。変更にウィンドウやページの再生成は不要。警告・エラー・削除・バッジ等の意味を持つ色、ユーザーが選んだ画像や色はアクセント変更で置き換えない。

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

1. ローカル画面は既存の`createShellView`、`AppletSurface`または本体Windowの作成経路を使う。独立経路には配色初期引数・正確なURL登録・共通preloadを接続する。リモート画面へ適用しない。
2. sandbox付きpreloadはローカルモジュールをruntime requireできないため、`scripts/build-main.cjs`が共通`appearance-preload.ts`のコンパイル結果を8種類のpreloadへIIFEとして同梱する。専用preloadを追加したらこの一覧と検証を更新する。sandbox/contextIsolationは維持する。
3. 色コードはパレット正本にだけ追加する。設定検証・選択UI・外部設定schema・検索候補は同じ一覧を参照する。
4. Light/Dark双方で、通常/hoverボタンの文字と選択背景の強調文字を確認する。各組のコントラスト4.5以上を`tests/appearance.test.cjs`で検査する。
5. 保存・既定値省略・端末別分離・再起動・表示中/後から開いた画面・再読込・購読解除を確認する。警告/エラーの色の維持と、リモート本文にAPIがないことも確認する。

回帰は`tests/appearance.test.cjs`と設定基盤の関連試験、固定EXEの`scripts/appearance-ui-test.cjs`。実測結果と成果物のhashは[検証記録](../VERIFICATION.md)へ残す。
