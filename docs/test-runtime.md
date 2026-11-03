# 共通テストモジュールの利用手順

AppDock本体と各Applet（新規Appletを含む）で、`.artifacts`にテスト生成物を作るときの規則です。共通のテストヘルパーと固定ランタイムを使い、実行パスを一定に保ちます。検査対象の選び方は[テストの作成と整理](testing.md)、実行段階と成功結果の再利用は[開発手順](development-workflow.md)に従います。

## 必ず守る規則

- 通常の固定配布物のGUI/MCP試験は、AppDockの[`scripts/copy-host.cjs`](../scripts/copy-host.cjs)またはそれを使う共通ランチャーから準備する。本体EXE・Electron・DLL・`resources`を試験ごとのフォルダーへ複製する処理を追加しない。
- 共通ヘルパーの実装を各Appletへコピーせず、AppDock側のモジュールを参照する。不足する機能があれば共通側への追加を検討し、個別テストに同じコピー・排他・ハッシュ照合を実装しない。
- 試験ごとに一意のprofileを対象repoの`.artifacts`内へ作る。共有するのは実行物だけとし、設定・data・extensions・PC専用状態・ログ・結果は試験ごとに分ける。
- Applet自身を直接起動する試験で実行用コピーが必要なら、`prepareTestApplet`を使う。既に発行先や固定build出力を直接使う試験は、その方式を維持し、追加のコピーを作らない。
- 継続利用するテストスクリプトはrepoの`scripts/`または`tests/`へ置く。`.artifacts`を共通ヘルパーの正本や唯一のテストソースの保存先にしない。
- 配置・更新や変更fixtureを検査する専用コピーは、後述の「専用コピーが必要な場合」に従う。

## 保存先とヘルパーを選ぶ

| 内容 | 保存先 |
| --- | --- |
| 共通ヘルパーのソース | `AppDock.at365/scripts/`（Git管理） |
| 共用するAppDock本体と同梱ランタイム | `AppDock.at365/.artifacts/test-runtime/host/` |
| 直接起動するnative Appletの共用コピー | 各Appletの`.artifacts/test-runtime/<正規化したApplet名>/` |
| 各試験の設定・fixture・結果 | 対象repoの`.artifacts/<試験名>-<一意な値>/` |

Appletの試験も、AppDock本体は上記のAppDock側の1か所を使います。AppletごとのprofileにAppDock本体を置きません。native Appletのslot名は、`Applet.Watch.at365.exe`なら`applet-watch-at365`です。`test-runtime`の内側にprofileを作りません。

| 既存の起動方法 | 指定する共通モジュール・引数 |
| --- | --- |
| 実行物を準備して既存の起動処理へ渡す | `copy-host.cjs`の`prepareTestHost(sourceExe, profile, artifacts)` |
| `testHostPath`と`copyHost`を使う既存試験 | `testHostPath(profile, artifacts)`で得たEXEへ`copyHost(sourceExe, executable)`。`testHostPath`だけではコピーは準備されない |
| ページ用ランチャー | `page-test-host.cjs`の`launch(profile, sourceExe, extraEnvironment, artifacts)` |
| 設定保存用ランチャー | `data-settings-host.cjs`の`isolatedHost(profile, sourceExe, artifacts)` |
| 汎用Electronランチャー | `electron-test-launcher.cjs`の`launchTestHost`へ`portable: true`、配布元の`executablePath`、`profileArtifacts: artifacts`、`--test-profile`を含む`args`を指定 |
| native Appletの実行物の準備 | `copy-host.cjs`の`prepareTestApplet(sourceExe, profile, artifacts)` |

表の`artifacts`はprofileを保存するrepoの`.artifacts`の絶対パスです。AppDock自身の試験では省略できるAPIもありますが、Applet側の試験は自身のrootを明示します。共通ランチャーは固定配布物を指定した場合に本体を準備するため、呼び出し側で同じコピーを重ねません。

## 新しいテストを作る

1. 検査する配布元と版を決める。本体は`AppDock.at365.exe`と`appdock-host.json`がある完成フォルダー一式を入力にする。発行物は通常`40.ARTIFACT/AppDock.at365/win-unpacked/`、開発用の固定ビルドは`AppDock.at365/.artifacts/host-build/win-unpacked/`にある。EXEだけを抜き出さない。
2. 対象repoの`.artifacts`内に新しいprofileを作り、上の表から既存の共通モジュールを選ぶ。共通ランタイム自体を配布元に指定しない。
3. 共有設定fixtureは[`test-settings.cjs`](../scripts/test-settings.cjs)の`file(profile)`で`<profile>/data/settings.json`へ作る。必要なAppletのmanifest・コードは`<profile>/extensions/`へ置く。
4. ホストへ`--test-profile=<profileの絶対パス>`を渡す。PC専用状態を別にする場合は`--test-local-state=<profile内のlocalの絶対パス>`を渡す。`--test-extensions`はなく、extensionsも`--test-profile`で分離する。EXEを共用する目的でprofileIdや設定を共用しない。
5. GUI試験は他のGUI試験と直列に行う。起動・画面・保存の完了条件を待ち、成功・失敗のどちらでも起動したホストとAppletの終了を確認してからランナーを終了する。共通モジュールはランナー終了時に自分の排他を解放する。排他中のファイルを手動で上書きしない。
6. 結果・ログ・必要な画像をprofileへ残す。AppDockの`test-runtime.json`と配布manifest、native Appletの`<slot名>-runtime.json`も検証証跡として残し、入力・実行物のハッシュと合否を記録する。

以下は、兄弟Appletの`scripts/feature-test.cjs`で使う準備部分の例です。実際の試験では、`executable`と`args`を既存の起動・終了処理へ接続します。上の表の共通ランチャーを選ぶ場合は、この`prepareTestHost`呼び出しを重ねず、そのランチャーへ配布元EXEとprofileを渡します。

```javascript
const fs = require('node:fs');
const path = require('node:path');

const appletRoot = path.resolve(__dirname, '..');
const hostRoot = path.resolve(appletRoot, '../AppDock.at365');
const { prepareTestHost } = require(path.join(hostRoot, 'scripts/copy-host.cjs'));
const settings = require(path.join(hostRoot, 'scripts/test-settings.cjs'));
const artifacts = path.join(appletRoot, '.artifacts');
const sourceExe = process.argv[2];
if (!sourceExe || !path.isAbsolute(sourceExe)) {
  throw Error('検査する配布元EXEの絶対パスを指定してください');
}

fs.mkdirSync(artifacts, { recursive: true });
const profile = fs.mkdtempSync(path.join(artifacts, 'feature-'));
const executable = prepareTestHost(sourceExe, profile, artifacts);
const settingsFile = settings.file(profile);
const extensions = path.join(profile, 'extensions');
fs.mkdirSync(extensions, { recursive: true });
const args = [
  `--test-profile=${profile}`,
  `--test-local-state=${path.join(profile, 'local')}`,
];

// settingsFileへ当該試験の設定fixtureを書き、extensionsへ必要なAppletを用意する。
// executableとargsで起動し、完了条件・合否・正常終了を既存の試験処理で確認する。
```

AppDock自身の`scripts/`に置く場合は、`hostRoot = path.resolve(__dirname, '..')`、`artifacts = path.join(hostRoot, '.artifacts')`とし、同じヘルパーを使います。

native Appletを直接起動する場合は、同じprofileとartifactsを`prepareTestApplet(sourceExe, profile, artifacts)`へ渡します。入力フォルダーにはEXEと必要なDLL・ランタイム・アセットを揃え、settings.json・data・extensionsを混ぜません。このヘルパーは実行物を準備するだけなので、Applet固有のRPC・設定・状態出力の分離と終了処理は当該試験で行います。

## .artifactsの初回・削除後に実行する

`.artifacts`が空でも、共通モジュールのソースはrepo内に残っています。以前の`.artifacts`や実行用EXEを復元してから始める必要はありません。

1. 検査する配布元を確認する。目的に合う完成済みの発行物が残っていれば、それを入力にする。配布元や必要なAppletの固定ビルド出力もない場合は、[開発ガイド](../DEVELOPMENT.md#開発環境ビルドテスト)と対象Appletのビルド手順に従って必要な入力を作る。共通ヘルパー自体は製品をビルドせず、過去の試験profileを配布元の代用にしない。
2. 通常のテストコマンドを実行する。スクリプトがprofileを作り、`prepareTestHost`または共通ランチャーがAppDock側の`test-runtime/host`を必要なときに再作成する。直接起動用のnativeコピーは`prepareTestApplet`がApplet側へ再作成する。手作業で試験ごとのEXEコピーを増やさない。
3. 同じ配布物で次の試験を行うときも新しいprofileを使う。共通ヘルパーが配布物全体のSHA256を照合し、同じ内容なら固定ランタイムを再利用する。内容が変わった場合は使用中プロセスがないことを確認して更新する。
4. 削除した過去のログ・入力ハッシュ・設定・検証結果は自動復元されない。過去の成功結果を照合できない試験は[成功結果の再利用手順](development-workflow.md)に従って必要範囲を再実行し、今回の記録を残す。

排他・プロセス確認で拒否された場合は、該当する試験の状態を確認します。別のランナーや残存プロセスがあるままlockを消さず、状態不明のファイルを削除しません。`.artifacts`全体を消す操作を通常の実行手順や自動後片付けには追加しません。

## 専用コピーが必要な場合

配置場所・移動・自己更新・ランタイムの差し替え・スターター展開を検査する場合は、検査対象の専用コピーを作れます。profile内の`extensions`に置く、変更が必要なAppletのmanifest・スクリプト・DLL/EXEもfixtureとして保持できます。通常試験の本体コピーを増やす理由にはしません。

専用コピーを使う理由、配布元、コピー先をスクリプトと検証記録に残します。成功・失敗・中断の結果と必要なログ・画像・ハッシュを保存し、起動した全プロセスの終了を確認してから、その試験のために配置したEXE・ランタイムを削除します。直近のコピーも対象です。実行中や使用状況不明のコピーは保留理由を記録し、終了確認後に整理します。対象の特定・パス検証・削除後の照合は[固定配布物の実行用コピー](../DEVELOPMENT.md#固定配布物の実行用コピー)に従います。

## 追加・修正時の確認

- 共通ヘルパーを参照し、通常の本体EXEや同梱ランタイムを試験profileへコピーしていない。
- Applet側の`.artifacts`を明示し、profile・data・extensions・PC専用状態を他の試験と共有していない。
- 初回に必要な配布元・ビルド手順が分かり、過去の`.artifacts`内のスクリプトや固定profileへ依存していない。
- 実行物のハッシュ・結果・終了確認を残し、専用コピーの使用理由と削除結果（保留時は理由）を記録している。
