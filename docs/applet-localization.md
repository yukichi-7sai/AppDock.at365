# Appletの翻訳基盤

AppDock 0.159.0以降。翻訳の内容と版は各Appletが所有し、本体は読み込み、表示言語の配信、導入・更新時の展開を担当する。既存Appletの翻訳移行はこの基盤とは別に行う。

## 宣言と配置

`extension.json`に`"localization": { "defaultLanguage": "ja" }`を宣言し、`minimumHostVersion`を0.159.0以上にする。宣言は任意。宣言しないAppletの表示と通信契約を維持する。

各Appletの配布フォルダーには`resources/translations/applet.json`（必須の基本辞書）と`applet_<言語タグ>.json`（任意の追加辞書）を含める。JSONはUTF-8のフラットなキーと文字列のオブジェクト。固定キーと名前付き変数`{{name}}`を使い、値をHTMLとして解釈しない。言語タグは正規化したBCP 47表記とする。

本体からのインストール・更新は、同梱JSONをEXE隣の`translations/applets/<Applet ID>/`へファイル単位でコピーする。同梱辞書もApplet内に保持する。辞書の同名ファイルは全置換し、保存ファイルの内容をマージしない。配布物にない追加翻訳は保持する。アンインストールでも外部辞書を保持し、未導入Appletの辞書は読み込まない。

`extensions`への手動配置では起動時のコピー・フォルダー作成・版マーカー生成を行わず、Applet内の辞書を直接利用する。本体更新はApplet用辞書を配布・削除しない。

## 言語と優先順位

選択可能な言語は従来どおり本体の`host_*.json`だけから決める。Appletは本体の実効表示言語を受け取り、自身の辞書から選択肢を増やさない。本体にない保存済み言語は本体と同じ基本表示へ戻る。

項目ごとに以下の順で有効な値を解決する。

1. 外部の選択言語辞書。
2. 同梱の選択言語辞書。
3. 外部の基本辞書。
4. 同梱の基本辞書。

同梱基本辞書がキーと変数の定義を所有する。未知キー、空白だけの値、文字列以外、変数の不一致は追加・外部辞書から採用しない。壊れた任意辞書は無視し、必須基本辞書・宣言・参照キーの破損は導入時または検出時のエラーにする。外部辞書が残った状態の手動更新でも外部が優先され、新しいキーは同梱辞書で補う。

辞書はApplet検出時に読み込み、ファイル編集の反映には本体の再起動を使う。表示言語の変更は読み込んだ辞書から即時解決し、Appletやページを再起動しない。

## manifestの表示文言

翻訳対応Appletの表示フィールドに`"%settings.enabled.title%"`のような全体一致の参照を指定する。埋め込み部分置換は行わない。参照キーは同梱基本辞書に必要。

対象はdisplayName/description/tagline、設定のtitle/description/itemTitle・選択肢label・子フィールド・list.draftAction.title、settingActionsのtitle/description/successMessage、settingSectionsのtitle/description、commandsのtitle/description/category、pagesとribbonItemsのtitle、notificationTypesのtitle/description、customCommandTypesのtitle/descriptionとfields、pageCollections.fields。名前・設定キー・ID・列挙値・既定値・URL・configSchema・利用者入力・実行時APIの文字列は解釈しない。

翻訳参照を指定した宣言コマンドの文言は実行時登録より優先する。宣言しない項目は従来の実行時登録を使う。設定や操作の識別子は変えず、無効・停止中も宣言文言を翻訳する。

## Applet向けAPI

Nodeは`context.localization`、.NET SDK/Runtimeは`context.Localization`を使う。現在のlanguage、解決済みmessages、基本言語を持つsnapshot、同期の`t(key, values)` / `Text(key, values)`、変更購読を提供する。値の挿入は一度だけ行い、利用者の`{{...}}`や`$t(...)`を再解釈しない。未知キーはキーそのものを返す。動的UIやパネルは変更購読から既存APIで再描画する。

有効化要求にlocalization snapshotを追加し、翻訳宣言のあるAppletだけへ`localization.changed`を送る。読み取りAPI`host.localization.get`は要求元自身の辞書のみ返し、Applet IDやパス指定を受け付けない。既存Node内部の本体言語通知は維持する。

登録済みのローカルAppletページとWebアカウントのローカル画面は共通preloadの`appdockLocalization`を使う。snapshot取得・翻訳・変更購読を提供する。送信元のメインフレーム・登録URL・所有Appletを照合し、リモートページ・iframe・他Appletの辞書へ公開しない。

ローカル画面の`appdockLocalization.snapshot()`と`t(key, values)`はPromiseを返す。`onChanged(snapshot => ...)`は購読解除関数を返す。Nodeのsnapshotとt、.NETのSnapshotとTextは同期処理。翻訳APIはSDK/Runtime 0.32.0以降に対応し、AssemblyVersionは既存Appletとの互換性のため維持する。

```json
{
  "minimumHostVersion": "0.159.0",
  "localization": { "defaultLanguage": "ja" },
  "displayName": "%applet.name%"
}
```

同梱基本辞書の例:

```json
{
  "applet.name": "サンプル",
  "status.count": "{{count}}件を処理しました"
}
```

Nodeでは`context.localization.t('status.count', { count: 3 })`、.NETでは`context.Localization.Text("status.count", new Dictionary<string, object?> { ["count"] = 3 })`を使う。ローカル画面では`element.textContent = await appdockLocalization.t('status.count', { count: 3 })`とする。動的な表示の更新は購読コールバックから行い、入力欄を再生成しない。

言語変更ではUIの入力・選択・ページ寿命を保持する。履歴に保存済みの通知・ログは翻訳し直さない。

## 配布・更新・復旧

パッカーとインストーラーは翻訳宣言・基本辞書・ファイル名・リンク・所有範囲を検証する。対象Applet専用の辞書だけを更新計画へ追加する。本体ファイルと他Appletの辞書を上書きする指定は認めない。

Appletフォルダーと外部辞書は同じトランザクションで事前検証・退避・交換・確定する。交換前の失敗・中断は両方を元へ戻す。確定後の復旧は新しいAppletと辞書を保持する。通常更新・一括更新・新規導入で同じ計画生成を使い、削除時は辞書を対象へ加えない。

## 検証対象

本体だけの言語一覧、4段階の項目単位フォールバック、変数と入力の保持、manifestの表示対象と保存値の境界、無効Applet、Node/.NET/local UIへの起動時・切替時配信、旧Applet互換、導入・更新・削除と中断復旧、範囲外・リンク・破損拒否を確認する。実Appletリポジトリの翻訳移行は対象外とし、ホストrepoのfixtureで契約を検証する。

`tests/applet-localization*.test.cjs`が辞書・表示宣言・Node/.NET/native・ローカル画面の所有境界、`tests/applet-packages.test.cjs`が復旧と配布範囲を担当する。ビルドと.NET fixtureの準備は[開発ガイド](../DEVELOPMENT.md)に従う。

`scripts/applet-localization-ui-test.cjs [発行EXE]`は共用ランタイム・隔離profileで手動配置、表示言語の切り替え、ページ寿命と入力保持、外部辞書の優先を確認する。`scripts/applet-localization-package-test.cjs`はローカルfeedと実Updaterを使い、導入・個別更新・一括更新・削除を通す。後者は更新対象の専用EXEとして名前を変えたUpdaterを置き、再起動先は復旧コマンドとする。進行画面だけを試験内で無効にし、終了後に専用EXEとstagingを削除する。本体GUIの更新再起動とは区別する。
