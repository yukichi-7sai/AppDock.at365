# リリース用オールインワンパッケージの作成

導入と更新時の注意は[オールインワン版の説明](usage.md#オールインワン版)を参照してください。各Appletの実装は独立リポジトリに置き、AppDock側で配布物を組み立てます。

## 通常publishとリリース準備

```powershell
# 通常publish: 変更した本体のEXE・更新JSONを発行
.\publish.bat
# リリース準備内のZIP作成工程（通常publishでは実行しない）
.\dev.bat run pack:all-in-one
```

通常の`publish.bat → dev.bat run dist → dist:host`は本体単一EXEと更新JSONだけを生成します。変更したAppletは各repoの40.ARTIFACT配下へ配置し、個別更新用update.zip/update.jsonも生成します。実装完了時に変更モジュールを版更新して発行し、未変更モジュールを通常publishで再発行しません。

[RELEASING.md](RELEASING.md)の`release.ps1 -Mode Prepare`が本体publishの後に`pack:all-in-one`を実行します。組み立ては`scripts/build-all-in-one.ps1`です。上記のpack単独コマンドはリリース準備の切り分け用で、正式なPrepareの全検証・sealを省略する用途には使いません。

対象は、AppDockリポジトリの親フォルダー直下にある、`.git`と`extension.json`を持つリポジトリすべてです。各repoの`publish.bat`が必要で、足りない場合は失敗します。ネストした試験fixtureや実利用先の`extensions`は探索しません。別の場所を探索する場合はPowerShellから`-AppletRoot <絶対パス>`を指定できます。

「最新版」は実行時点で各ローカルcheckoutから発行した内容です。GitHubのlatest取得やgit pull、ブランチ変更は行いません。未コミット変更もビルド対象になり、`bundle.json`へcommitとdirty状態を記録します。リリース時は意図したブランチ・変更状態で発行してください。

## 内容と検証

```text
AppDock.at365-all-in-one-<version>.zip
  AppDock.at365.exe
  bundle.json
  extensions/
    Applet.Gmail.at365/
      extension.json
      ...実行ファイル・画面資産
    ...各Applet
```

- ID重複、正式版のバージョン、最低本体版、発行スクリプトを先に検査します。
- 各Appletのpublish.batを直列実行し、終了コードを確認します。生成した更新JSONとZIPのID・版・サイズ・SHA256を照合します。
- ZIPは共通helperでリンク/パストラバーサル/サイズ等を検査して、専用stageの`extensions/<repo名>`へ展開します。展開後のmanifest・entry・最低本体版も元ソースと照合します。
- 本体EXEだけをコピーし、各Appletは検証した更新ZIPの内容だけを収録します。AppDockの設定・認証領域・ログ・実利用先の拡張は取り込みません。Appletのpublishフォルダーは生成物専用とし、個人データを置かないでください。
- `bundle.json`に本体/各Appletの版・commit・dirty状態・Applet ZIPハッシュと収録ファイルのサイズ/SHA256を記録します。初期設定は同梱せず、初回起動時の通常動作ですべてのAppletが無効になります。

出力は`A:/40.ARTIFACT/AppDock.at365/AppDock.at365-all-in-one-<version>.zip`。専用stageは`.artifacts/all-in-one-<ID>/package`に残します。完成後だけ同じ版の出力ZIPを置換します。途中で失敗した場合、以前の完成済みZIPは残るため、終了コードが失敗の発行物を新しいものとして公開しないでください。Appletが0件でも失敗します。

## publishの旧版ZIP整理

AppDockのリリース準備で新しいオールインワンZIPを`A:\40.ARTIFACT\AppDock.at365`へ配置した後、版・全収録ファイルのサイズ/SHA256・同梱本体と`A:/40.ARTIFACT/AppDock.at365/AppDock.at365.exe`の一致・隔離起動を検証します。2026-10-09のユーザーの追加指定により、通常publishではZIPの生成も整理も行いません。

削除対象は`A:\40.ARTIFACT\AppDock.at365`直下の`AppDock.at365-all-in-one-<version>.zip`という通常ファイルだけです。正式版x.y.zを数値で比較し、検証済みの新版より古い版だけを削除します。新版、同じ版、より新しい版、別名のZIP、ディレクトリ/リンク、`.artifacts`のstage/backup、GitHub Releaseは対象外です。削除した名前はplan.jsonの`removedOldBundles`へ保存します。削除時のエラーはPrepareの失敗として報告されるため、ログと残存ZIPを確認してください。

## リリース

バージョン更新からGitHub公開までの正本は[RELEASING.md](RELEASING.md)です。`scripts/release.ps1 -Mode Prepare`は通常版と全体ZIPの作成・検証をまとめて行い、リリース時には全repoがcleanであることを要求します。

通常の`AppDock.at365.exe`と`update.json`に加え、オールインワンZIPを同じAppDock Releaseへ添付します。`update.json`のpayloadは通常EXEのままとし、オールインワンZIPへ向けません。Applet個別のリリース・更新処理も従来どおりです。publish.bat自体はGitHubへの公開や実利用先deployを行いません。

## 検証

`dev.bat exec node --test tests/all-in-one.test.cjs`は事前に発行したhelperを使い、隔離したGitリポジトリと配布物で、再発行、失敗時の既存ZIP保持、改変ZIP拒否、最低本体版不足、ID重複を確認します。Windows/.NET 10/Gitが必要です。

実パッケージではZIPの収録一覧・全ファイルのhash、各Applet更新ZIPとの一致を確認し、新しい隔離フォルダーへ展開してEXEを起動します。全Appletが一覧に表示され、版が同梱一覧と一致し、初期無効であることを確認してください。通常smoke-testモードはAppletなしを想定するため、同梱状態は通常起動の隔離profileで検証します。結果は[検証記録](../VERIFICATION.md)へ残します。
