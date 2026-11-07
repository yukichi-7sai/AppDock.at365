# フォルダー型ポータブル配布

本体はElectronの展開済みフォルダーをそのまま使用する。インストーラーと起動時の自己展開は不要。`win-unpacked/AppDock.at365.exe`を起動し、DLL、`locales/`、`resources/`、`appdock-host.json`も同じ配置に保持する。終了時に本体ファイルを削除しない。ソースの標準発行は`publish.bat`から行い、更新用の`update.zip`と`update.json`を同じ発行先に作る。

ビルダーの作業先は`.artifacts/host-build`とし、発行先の実行用フォルダーをビルダーへ直接渡さない。発行時も管理対象の本体ファイルだけを配置するため、発行先で動作確認して作成された設定・data・extensionsを再発行で削除しない。ZIPは作業先のクリーンな本体から作成し、発行先の利用者データを混ぜない。実行用フォルダーのAppDockを終了してから再発行する。

## 配置と保存領域

配置先のルートにある`AppDock.at365.exe`を維持し、プログラムを別のサブフォルダーへ移動しない。共有設定は`data/settings.json`、端末別設定は`data/settings-<端末名>.json`、Storageは`data/storage/`へ保存する。`extensions/`と配置パスから決まるLOCALAPPDATAのPC専用rootは維持する。旧配置の設定・UI状態・Storageを読み込んだりコピーしたりする移行は行わない。保存先の詳細は[設定同期](settings-sync.md)を参照する。

手動で配置する場合はAppDockを完全終了し、本体一式を同じ配置先へコピーします。`translations/` と `configs/` はフォルダーを削除せず、同名ファイルを上書きコピーします。未同梱ファイルと設定・data・extensionsは保持します。旧配置から新配置への切り替えは手動置き換えのみ対応し、旧版の自己更新からの移行は行いません。旧ルートの `applets.json` は新配置では参照せず、配布された `configs/applets.json` を使用します。

## 配布物と所有範囲

リポジトリでは `resources/translations/` に翻訳JSON、`resources/configs/` に `applets.json` などの構成JSONを置く。配布物・更新ZIPでは `translations/` と `configs/` をEXEの隣へ配置し、Electronの `resources/` 内には入れない。翻訳は `translations/host.json` を基本に、同じフォルダーの追加言語を重ねる。[翻訳ファイルの仕様](localization.md)を参照。

発行・更新では `translations/` と `configs/` の同梱ファイルを内容ごと上書きし、編集内容をマージしない。今回の配布に含まれない追加ファイルはそのまま残す。前の配布にだけ含まれたファイルも未同梱ファイルとして保持する。フォルダー全体の削除・交換は行わない。通常起動では上書きせず、手動編集は次の発行・更新まで有効。Appletカタログは `configs/applets.json` を管理ページ表示時に読み込む。

この更新方針は`configs/applets.json`・`theme.json`・`accent-color.json`と、今後追加するすべての同梱構成ファイルへ共通に適用する。ファイルごとの編集保持・自動マージの例外は設けない。

`appdock-host.json`はビルド時に作成する本体ファイル一覧で、schemaVersion、version、entriesを持つ。entriesは本体が所有するルート直下の名前だけを列挙する。EXE・Electronの固定ファイル、`resources`、`locales`、`translations`、`configs`、この一覧自身に限定し、Updaterの許可一覧でも検証する。設定・data・extensionsなどは受け付けない。配布元に一覧外のファイルやリンクがあれば発行・更新準備を拒否する。

`update.zip`は本体フォルダーの内容だけを格納する。feedはschemaVersion=1、kind=host、id=host、payload.format=zip。SHA256と配布サイズを従来どおり照合する。配布物・展開後ファイル・manifestにAppDock独自の固定容量・ファイル件数上限は設けない。配布物は分割してディスクへ保存しながらSHA256と実サイズを計算し、feedの宣言値との一致を確認してから展開する。包含パス・重複パス・リンクの拒否と更新の原子的適用・復旧は維持する。

## 自己更新と配置

新しい本体一覧と既存の一覧から、EXE、その他のルートファイル、resources/localesの交換計画を作る。`translations` と `configs` は新版に含まれるファイルだけを `host-resource` として列挙し、追加をinstall、上書きをupdateとして既存のパッケージトランザクションへ渡す。この2フォルダーにはuninstallやフォルダー全体の交換を認めない。それ以外の不要になった本体項目はuninstallとする。本体とAppletの一括更新も同じjournalで扱い、終了確認・変更前/後のハッシュ・範囲・リンク検証を維持する。設定などが混在する配置ルート全体を交換しない。

自己更新では交換前後の本体をjournalに対応する一時領域へ保持し、commit前の中断は元へ戻す。commit後は新しい版を検証して後片付けする。復旧対象の検証に失敗した場合はjournalを残す。EXEやresources自体が欠けて本体を起動できない中断では、journalに記録された専用TEMPのhelperから`--recover <配置先> <PC専用root>`を実行する。詳細は[更新と復旧](updates.md)を参照する。

通常発行では内部のUpdater helperが管理対象の本体ファイルをコピー・照合する。既存の本体一覧に沿って不要ファイルを整理し、一覧を最後に配置する。この処理は発行先の実行用フォルダーを更新するために使用する。

## 検証

`tests/folder-host.test.cjs`でZIP/feed、発行時の内部配置、管理対象の追加・削除、保護対象の拒否、journalの復旧を確認する。既存の更新・Appletパッケージ・Release・全体ZIP回帰も使用する。GUI fixtureのコピーは`scripts/copy-host.cjs`へ集約し、固定配布物の本体一式をコピーする。実配布物で起動・再起動・本体/一括/個別更新・保存領域保持・トレイ識別・二重起動を確認する。起動時の表示とAppletの開始順は[本体ページの起動](host-pages.md#起動と戻り先)を参照し、Appletの並列化は別工程とする。
