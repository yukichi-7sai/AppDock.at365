# AppDock.at365 開発ガイド

機能の説明・操作方法・設定・既定値・動作環境は[機能・操作・設定](docs/usage.md)を参照してください。共通の文書構成は[ドキュメント方針](docs/documentation.md)に従います。

全ローカルUIのアクセント色と新しい画面の追加規則は[共通配色](docs/appearance.md)を参照してください。画面ごとにパレットを定義せず、共通CSS変数を利用します。

## 発行・配置ファイルの保存先

標準発行先は `A:\40.ARTIFACT\AppDock.at365` です。`publish.bat`はソースrepo、`deploy.bat`は発行先から実行します。配置用ファイル・設定の保持とテンプレートの更新は[共通発行手順](docs/publishing.md)を参照してください。

現在のコードを基準に、開発環境と機能別の仕様・検証への入口をまとめます。インストールとビルドの概要は[README](README.md)、作業規則は[AGENTS](AGENTS.md)、実測結果は[VERIFICATION](VERIFICATION.md)を参照してください。

## 文書の入口

| 対象 | 正本 |
| --- | --- |
| 操作・設定と動作環境 | [機能・操作・設定](docs/usage.md) |
| 開発・コミット・配布 | [共通手順](docs/development-workflow.md)、[ローカル発行](docs/publishing.md)、[GitHub Release](docs/RELEASING.md)、[全体ZIP](docs/all-in-one.md) |
| Appletの開発とAPI | [実装ガイド](docs/applet-development.md)、[Applet API](docs/extensions.md)、[ホスト拡張](docs/host-development.md)、[ページ](docs/applet-pages.md) |
| 設定・入力・保存 | [共通レイアウト指針](docs/settings-ui-guidelines.md)、[設定UIと既定値・リセット](docs/settings-foundation.md)、[一覧とダイアログ](docs/settings-list-editing.md)、[端末別保存・同期・復旧](docs/settings-sync.md) |
| 表示言語・翻訳 | [本体の翻訳基盤・文言変更・段階移行](docs/localization.md) |
| 表示倍率 | [Electron画面の共通倍率・対象・画面追加規則](docs/display-zoom.md) |
| Appletの導入と管理 | [管理一覧・導入・更新・削除](docs/applet-management-settings-design.md) |
| Webとアカウント | [WebApplet](docs/web-applets.md)、[Webアカウントとグループ](docs/web-accounts.md) |
| MCP・外部操作 | [共通操作API](docs/appdock-api.md)、[Codex登録・ネットワーク・許可](docs/automation.md)、[MCPクライアント](docs/mcp-client-design.md)、[MCPハブ](docs/mcp-hub-design.md)、[通知イベント](docs/mcp-events-design.md) |
| MCP設定 | [固定6入口と通常設定の共通登録](docs/settings-api.md)、[一覧編集・特殊設定の拡張設計（一部実装）](docs/mcp-settings-design.md) |
| コマンドの入力割り当て | [コマンドトリガー](docs/command-triggers.md) |
| カスタムコマンド | [保存・種類・キー送信・プロセス起動・MCP実行](docs/custom-commands-design.md) |
| AIと音声 | [AI文章生成](docs/ai.md)、[TTS](docs/tts-design.md)、[共通音声再生](docs/audio-playback.md) |
| 通知とエラー | [通知基盤](docs/notifications.md)、[通知読み上げ](docs/notification-speech-design.md)、[共通エラー](docs/error-reporting.md)、[共通警告](docs/warning-notifications-design.md) |
| キー・マウス・タッチパッド・トレイ | [ショートカットと入力フック](docs/keybindings.md)、[ジェスチャー](docs/gestures.md)、[タッチパッド](docs/touchpad-gestures-design.md)、[トレイ](docs/tray-menu.md) |
| Shellとリボン | [領域と割り当て](docs/shell-foundation.md)、[リボンの配置とバッジ](docs/ribbon-customization-design.md)、[Shell API](docs/shell-api.md)、[共通オーバーレイ](docs/shell-overlays.md)、[本体のページ](docs/host-pages.md)、[バー](docs/shell-bars.md) |
| 画像と配色 | [登録画像](docs/registered-images.md)、[共通ギャラリー](docs/image-gallery.md)、[共通配色](docs/appearance.md) |
| 起動と更新 | [Windows起動設定](docs/launch-settings.md)、[更新](docs/updates.md)、[配布先の検証](docs/update-checklist.md) |
| 文書と実測 | [文書方針](docs/documentation.md)、[検証記録](VERIFICATION.md) |

本体はTypeScript/Reactで構成し、Nodeと.NET Appletは別プロセスで動作する。画像ライブラリー・通知センター・ログ・設定の描画は本体rendererと共通UI部品、Shell領域の描画は選択したShell、native画面は対象Appletが所有する。起動・復元・戻り先は[本体ページ](docs/host-pages.md#起動と戻り先)を参照する。

共有設定・dataの参照先変更は[未実装の設計](docs/shared-settings-location-design.md)として分離する。現在の保存仕様は設定同期の文書を正本とする。

入力の「いつ・どこで」と実行方法は[共通コマンド実行基盤](docs/command-execution-foundation-design.md)へ接続する。共通基盤・キー設定/公開編集API・キーの外部条件は実装済み。キーとジェスチャーは同じ条件判定と実行基盤へ、独立したfirst/all・ブラウザ設定と入力時の対象を渡す。

Windowsが判定する3本指・4本指の10種類を専用キーで接続する[タッチパッドジェスチャー](docs/touchpad-gestures-design.md)を実装。端末別の既定OFF、明示操作でのWindows設定、ジェスチャーごとの競合停止、専用キーの所有権と共通実行基盤への接続を提供する。

## 開発環境・ビルド・テスト

スタートアップ登録・管理者起動の仕様と保存処理は[起動設定](docs/launch-settings.md)を参照してください。実Windowsタスクと発行したフォルダー型本体の専用検証は`dev.bat exec node scripts/launch-settings-ui-test.cjs A:/40.ARTIFACT/AppDock.at365/win-unpacked/AppDock.at365.exe`です。UAC承認・実サインインの確認範囲は検証記録で区別します。

Windows x64と.NET 10 SDKが必要です。Node.jsとpnpmは **このプロジェクトの `.tools` 内**に配置できます。グローバルインストール、管理者権限、永続的なPATH変更は不要です。[toolchain.json](toolchain.json)でNode.jsとpnpmのバージョンを固定し、依存ライブラリは `pnpm-lock.yaml` で固定しています。

pnpmのパッケージストアは、`pnpm-workspace.yaml`の`storeDir`で`A:/30.PROJECT/.pnpm_store`に固定しています。ワークスペースを同じ`A:\`へ同期する別PCでも、このプロジェクト内では同じ保存先を使います。PCごとの環境変数やユーザー共通pnpm設定の変更は不要です。依存の参照先が一致しないPCでは、`.\dev.bat install --frozen-lockfile --force`で再接続してください。ストアが空の場合は通常のインストールで必要なパッケージを取得します。

初回は次の手順で準備します。公式Node.js ZIPのSHA256を照合し、npmでpnpmをプロジェクト内にインストールします。

```powershell
.\setup-tools.bat
.\dev.bat install --frozen-lockfile
.\publish.bat
```

次回からの発行は `.\publish.bat` です。本体EXEと更新JSONを本体のpublishへ生成します。変更したAppletは、それぞれのrepoでpublish.batを実行します。実装・修正の完成時は、[共通手順](docs/development-workflow.md#実装)に従って発行前のレビュー1回と必要な修正・再検証を終え、[版更新の判断](docs/development-workflow.md#版更新の判断)に従って対象モジュールの版を上げて発行します。同じ機能の追加修正も、完成して発行するたびにパッチ版を進めます。マイナー更新の条件と、新たな実装・修正を伴わない再発行・リリースの扱いは共通手順に従います。通常publishからは呼び出しません。対象リポジトリ・出力・検証方法は[オールインワン作成](docs/all-in-one.md)を参照してください。`dev.bat` はローカルのNode.jsとpnpmを、そのコマンドの実行中だけPATHへ追加します。開発コマンドもこの入口から実行できます。

開発ドライブのフォルダマウントにドライブ文字を割り当てたり解除したりすると、Nodeが解決する実体パスとpnpmのworkspace記録が変わることがあります。`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`が出たら現在の作業パスと`.pnpm-workspace-state-v1.json`を照合し、対象repoで`dev.bat install --frozen-lockfile`により依存状態を再構築します。lockfileと検査方針は維持します。実行中にパスが変わって発行が失敗した場合は、変更後の環境でビルドから発行し直して確認します。

Git worktreeでは`node_modules`を元の作業ツリーへのjunctionとして共有したまま、pnpmの依存インストールを実行しないでください。パッケージのjunctionや`.bin`の起動スクリプトにworktreeの絶対パスが生成され、worktree削除後に元の作業ツリーの発行も失敗します。依存を更新するworktreeは独立した`node_modules`を用意し、削除後は元の作業ツリーで`dev.bat run typecheck`と`publish.bat`が通ることを確認してください。

```powershell
.\dev.bat run build:dotnet
.\dev.bat start

.\dev.bat run typecheck
.\dev.bat test
.\dev.bat run test:ui
.\dev.bat run test:navigation
.\dev.bat run test:preferences
.\dev.bat run test:hotkeys
.\dev.bat run test:window-state
.\dev.bat run smoke
.\dev.bat run dist
.\dev.bat exec node scripts/smoke.cjs A:/40.ARTIFACT/AppDock.at365/win-unpacked/AppDock.at365.exe
```

設定サイズとApplet起動の比較は`dev.bat exec node scripts/settings-startup-performance-test.cjs <発行EXE>`で行います。同じ8個の模擬Node Appletを2KiB/34KiBの隔離設定で起動・再起動し、起動時間と本体の全設定コピー・同期ファイル操作を記録します。実Appletの処理や実利用設定の性能保証とは区別します。

同じスクリプトの`--idle`は2秒ごとの同一トレイ状態送信を模擬し、設定画面の自動スクロール中に全体更新回数を数えます。修正後は`--idle --expect-quiet`で同一状態による更新が0回であることを検査します。タッチパッドの定期確認は`tests/touchpad-gestures.test.cjs`の模擬APIで、読取継続・同一状態の通知抑制・競合と復旧の通知を確認します。実入力やWindows設定の変更は行いません。

Node.jsを含む通常のパッケージ更新は、下記の`.\update-packages.bat`を使います。pnpmの更新や固定版への切り戻しは、`toolchain.json`の完全なバージョン番号を変更してから`.\setup-tools.bat`を再実行します。両ツールの取得・動作確認が成功した後にだけ利用バージョンを切り替えます。以前のバージョンは`.tools/node/<version>`と`.tools/pnpm/<version>`に残します。winget等の更新対象にはなりません。更新後は`.\dev.bat run typecheck`、影響範囲の回帰、`.\publish.bat`で確認してください。

現在の固定ツールはNode.js 24.22.1（24 LTS）とpnpm 12.10.1です。pnpm 12はネイティブEXEになったため、setupはnpmで依存のスクリプトを無効にして取得した後、pnpm自身の公式`install.js`だけを実行し、Windowsの起動用shimを再生成します。初回取得・再実行・古いpnpmへの切り戻しもプロジェクト内で完結します。グローバルのツールやPATHは変更しません。

Electron 45.0.0はバイナリを初回実行時に取得するため、[公式手順](https://www.electronjs.org/docs/latest/tutorial/installation)の`install-electron`をプロジェクトの`postinstall`で明示実行します。pnpmが変更なしのインストールを省略する場合、バイナリが必要なら次を実行してください。

```powershell
.\dev.bat run postinstall
```

パッケージ更新は`.\update-packages.bat`を使います。公式メタデータから最新安定版のElectronと最新LTSのNode.jsを選び、Nodeの固定版を更新してsetupを実行し、Electronを完全版指定で追加してからほかの直接依存を`update --latest`で更新します。Electronはメジャー番号をまたぐ更新も対象です。NodeのCurrent版とElectronのbeta/nightlyは選びません。更新後は選んだ版と間接依存をtoolchain.json・package.json・lockfileへ固定します。

`.\update-packages.bat -CheckOnly`は候補の取得・検証だけを行い、ファイルや導入済みのツールを変更しません。公式情報を取得・検証できなければ停止し、古い候補へ黙って切り替えません。setup失敗時はNodeの指定を戻します。setup後の依存更新で失敗した場合は途中までの変更を残して停止するため、差分を確認してから再実行してください。残りの確認は`.\dev.bat outdated --format json`です。`dev.bat update`はpnpm単独の低水準操作で、Node更新を含まないため通常のパッケージ更新の入口には使いません。

通常のsetup・install・ビルド・発行では固定版を使い、最新版の選択は更新操作のときだけ行います。Node系Appletは本体のツールチェーンを共有し、.NET系Appletは共通SDKを参照します。更新後は型検査・影響範囲の回帰・発行物を確認し、Electronやbuilderのメジャー更新ではportableとGUIの互換性も確認してください。

### 依存とツールの公開後待機

ElectronとNode.jsは公開後7日の待機対象から恒久的に除外します。`toolchain.json`の`releaseAgeExemptPackages`と、pnpmの`minimumReleaseAgeExclude`にある`electron`を正本とします。パッケージ名全体での免除はこの2つだけです。ほかの実行時・開発用・間接依存は、`minimumReleaseAge: 10080`（分）、`minimumReleaseAgeStrict: true`、`minimumReleaseAgeIgnoreMissingTime: false`により各版の公開から7日待機します。条件を満たす版がなければ停止し、公開日時がない場合も停止します。既存lockfileの復元にも同じ待機設定を適用します。日数を変える場合は`toolchain.json`の`minimumReleaseAgeDays`も揃えます。

`verifyDepsBeforeRun: error`により、`dev.bat run`によるビルド・試験前に依存の不整合があれば自動インストールせず停止します。導入・復元は明示的な`dev.bat install --frozen-lockfile`、依存版更新は`update-packages.bat`で行います。`publish.bat`は発行前に`dev.bat install --frozen-lockfile`を実行し、現在のworkspaceと固定依存を同期します。同期が非0で終わったら、その終了コードを返して発行を開始しません。同期と発行の両方が成功した場合だけ終了0となります。

`package.json`の製品バージョンを変更した場合も、pnpmが記録するworkspaceの版との不一致で`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`になることがあります。`publish.bat`だけを実行すれば発行前に記録が同期されるため、製品の版更新後に手動でinstallする必要はありません。`dev.bat run typecheck`などを先に行う場合は、`dev.bat install --frozen-lockfile`で同期してください。同期には固定lockfileと公開後待機・供給網検査を適用し、検査の失敗を無視しません。復元後にTypeScriptの構文エラーが出る場合は、報告されたソースを修正して型検査を通します。依存の再インストールだけではソースの構文エラーは直りません。

ElectronとNode以外の公開後待機の例外は完全版指定とし、依存更新時に必要性を確認します。`minimumReleaseAgeExcludePrune: true`でlockfileから消えた版の例外を整理します。Electronのパッケージ全体の免除は恒久設定として残します。導入済みの固定pnpmは再利用し、新規取得には待機条件を適用します。

Node.jsは`toolchain.json`で完全な版を固定し、`nodeChannel: "lts"`を維持します。現在の24.22.1はKrypton LTSです。更新時は公式の`dist/index.json`から最新LTSを数値で比較して選び、新規取得前にも対象版のLTS表示と公開日を確認します。待機日数だけを免除し、公式SHA256照合と実行ファイルのLTS表示・版の確認は維持します。通常setupは指定された固定版を再利用します。

pnpm本体はnpmで導入するため、workspace設定だけでは保護されません。setupは公式npmレジストリで固定版のpnpmとWindows x64ネイティブパッケージの公開日時を確認し、npmにも`--min-release-age=7`を渡します。新規取得でメタデータの取得・検証に失敗したら停止します。導入済みの固定ツールは再利用し、通常ビルドのたびにツール公開情報を取得しません。

ほかのパッケージの重大なセキュリティ修正を急いで導入する場合は、出所・告知・差分を確認し、対象の完全な版だけを例外にします。npm依存は`pnpm-workspace.yaml`の`minimumReleaseAgeExclude`へ`package-name@1.2.3`を追加し、理由をコメントとVERIFICATIONへ記録します。Electron以外を名前だけやワイルドカードで除外しません。ツールは`toolchain.json`の`releaseAgeExceptions`へ`{"package":"pnpm","version":"12.10.1","reason":"確認した修正内容"}`形式で記録します（書式例）。pnpmと`@pnpm/exe.win32-x64`は個別に確認し、待機期間経過後や対象版の不使用時に例外を取り除きます。

0.83.0は[Nodeのセキュリティ告知](https://nodejs.org/en/blog/release/v24.22.1)と[eMudhra対策案内](https://emudhra.we-have-a-problem.com/)・[Electronの修正](https://releases.electronjs.org/release/v44.9.3)を確認し、失効した証明書の拒否と正常サイトへの接続を実測して採用しています。Electron内蔵のNodeと開発用Nodeは別に照合し、版名だけで対策の有無を決めません。恒久免除の[pnpm公式仕様](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/settings/dependency-resolution.md#minimumreleaseageexclude)も参照してください。

待機は不正コードの検出を保証する機能ではありません。lockfile固定、導入前の告知・差分確認、導入後の必要な回帰確認も継続します。仕組みの回帰は`dev.bat exec node --test tests/release-age.test.cjs`で、公開時刻の境界、恒久免除と版限定例外、最新安定版/LTSの選択と取得失敗、pnpm実体のElectron即時更新・ほかの直接/間接依存・日時欠落・lockfile復元時の拒否を隔離レジストリで確認します。

`.tools` のツール本体とnpmキャッシュはGit管理・EXEへの同梱対象外です。pnpmの依存パッケージストアはpnpmの通常のユーザーキャッシュを使います。

`pnpm run dist` は.NETホストのframework-dependent発行（`win-x64`、`--self-contained false`）、TypeScriptのコンパイル、React/Viteのビルド、Windows x64 フォルダー型本体作成を行います。`publish.bat` からも発行できます。`build:dotnet` は発行前に `.artifacts/dotnet-host` を削除して再生成し、以前のself-contained発行で残ったランタイムファイルの混入を防ぎます。このフォルダには手作業のファイルを置かないでください。`AppDock.at365.slnx` はSDK・Runtime・.NETホスト用です。Electron部分はプロジェクトルートのpackage.jsonを使います。

`build`は`scripts/build-main.cjs`で生成済みの`out/main`を整理してからTypeScriptをコンパイルします。削除したモジュールが次の配布物に残ることを防ぎます。React/Viteも`out/renderer`を再生成します。設定の読み込み・保存は定義済みのトップレベル項目のみを返し、Applet固有の`extensions.<id>.settings`は保持します。

本体は展開済みフォルダーを使用し、起動時に自己展開しません。配布・保存先・更新・検証の正本は[フォルダー型ポータブル配布](docs/portable-distribution.md)を参照してください。

ランチャーはWindows TEMP・外側EXEの正規化パス・test-profileを小文字化してSHA256を取り、`TEMP/AppDock.at365-<hash>`へ展開します。版番号は含めません。起動/展開/最終削除をGlobalの名前付きmutexで直列化し、別の名前付きカーネルオブジェクトの生存を実行領域のleaseとして使用します。leaseは子のElectron本体へDuplicateHandleで渡すため、ランチャーだけの強制終了後も本体を保護します。二重起動は使用中の資産をそのまま使用し、全leaseがなくなった時だけ生成領域を削除します。設定や認証領域は削除対象外です。

StdUtils.ExecShellWaitExの戻り値は`hProc:<hex>`というタグ形式です。これを検証して`0x<hex>`へ変換してから、Win32の待機/終了コード取得/CloseHandle/DuplicateHandleへ渡します。タグを数値ポインターとして扱うと待機やleaseの解放が壊れるため、実portableの停止/更新試験を省略しないでください。

TrayのGUIDは`src/main/core/tray-identity.ts`で実行EXEパスと保存先からUUID v5を生成します。未署名ではGUIDが実行パスに紐付くため、実行領域と併せて安定化し、移動した配置や隔離profileには別GUIDを割り当てます。[Electronの仕様](https://www.electronjs.org/docs/latest/api/tray/)を参照してください。

`dev.bat exec node scripts/tray-identity-portable-test.cjs`は別版のmetadataを持つ隔離EXEを発行し、同じ配置先で更新します。専用アイコンのWindows登録とIsPromotedだけを確認し、試験設定は終了時に元へ戻します。再起動/同時起動/ランチャー強制終了/生成領域の最終削除も実EXEで検証します。実利用アイコンのWindows設定は変更しません。

ソースの主な配置:

```text
src/main/                  Electron本体・IPC・拡張管理・Node拡張ランナー
src/renderer/              React UI
src/shared/                UI/ホスト間の型と設定検証
dotnet/AppDock.SDK/        .NET拡張向けインターフェース
dotnet/AppDock.Runtime/     .NET共通のJSON-RPC・SDK実装・セッション
dotnet/AppDock.ExtensionHost/  DLLを読み込むプロセス
tests/fixtures/            Node・C#拡張の検証用データ（同梱対象外）
tests/                     設定・通信・実プロセスの回帰テスト
scripts/                   ビルドと実機UI/portable検証
```

テストは専用の一時フォルダ／`.artifacts` を使い、実利用の設定・メール認証・クリップボード・壁紙に触れません。Node・C#の検証用拡張は `build:test-extensions` で `.artifacts/test-extensions` に生成し、UIテストの専用プロファイルにだけ配置します。通常のビルド・発行・起動では読み込みません。Windowsの実行制限がある環境では、通常のWindows実行環境でElectronの起動テストを行ってください。アプリ側ではChromiumのサンドボックスを有効にしています。

### 作業完了時のテストフォルダー整理

制限付きエージェント環境での実行権限については[共通手順](docs/development-workflow.md#制限付き実行環境)を参照してください。

実装・修正に必要なテストと、発行した固定EXEの動作確認がすべて成功した後、作業者が以下を行います。リリースまで待たず、各作業の完了手順として実施します。調査・手順書だけの変更でテストを行っていない場合は、整理対象なしで構いません。

1. テストスクリプトの出力先と結果形式を確認し、`.artifacts`直下のテスト専用フォルダーを列挙します。`smoke-<timestamp>`や`navigation-<timestamp>`などの名前は候補の抽出にだけ使います。
2. 結果JSON・ログ・既存の検証記録から、そのフォルダーの試験が終了し成功したことを確認します。結果形式は試験ごとに異なります。終了だけでは成功と扱わず、成功の証拠がないもの、失敗記録があるもの、調査中のものは保持します。解決済みの失敗記録の整理は別途判断します。
3. 同じテストスクリプト・実行方式ごとに、確認済みの成功分を実行日時順に並べ、直近3回分を残します。それより古い成功分だけを削除候補にします。
4. テストランナーと起動したElectron/.NET子プロセスが終了し、ほかの作業・チャットで使用されていないことを確認します。候補のパスを参照する実行中プロセスがないことも確認し、確認権限不足や状態不明なら保持します。
5. 削除直前に絶対パスと対象を再確認します。対象は当該repoの`.artifacts`直下にある通常のテスト専用ディレクトリに限定します。対象と配下にjunction・シンボリックリンク等の再解析ポイントがある場合は除外し、repo外へたどりません。PowerShellの`Remove-Item -LiteralPath`など同じシェル内で処理し、使用中や削除失敗時は強制終了・制限迂回をせず残します。
6. 残す直近分と保護対象が保持され、削除対象がなくなったことを確認します。削除名・件数、保持したものの理由、未実施や失敗を`VERIFICATION.md`の当該作業記録へ簡潔に残します。

`dotnet-host`、`updater`、`test-extensions`、`node-extensions`などの固定ビルド出力、`release-*`、`all-in-one-*`、単独の調査ファイルは、この手順の削除対象に含めません。`.artifacts`全体への再帰削除や、更新日時だけを使った一括削除は行いません。

この手順は通常publishや製品起動に自動削除を追加するものではありません。開発生成物は`.artifacts`へ保存します。既存の検証記録内の旧`artifacts/`パスは当該repoの`.artifacts/`へ読み替えてください。保存済みJSON/ログにある実行当時の絶対パスやハッシュは履歴として保持し、旧planを無条件に再実行せず、再開前にパス・phase・実状態を照合します。同期・バックアップ・スナップショットの設定は利用者が担当します。

## 配置

共通ログAPIは[Applet API](docs/extensions.md#sdkで使えるサービス)を参照してください。停止処理中のhost.logだけを許可し、クリーンアップエラーをホストファイルへ保存します。tests/logging.test.cjsで開始/稼働/停止中のログ・停止後拒否・他API拒否を確認します。WallpaperSlideshowのscripts/test-host-logging-ui.cjsは発行したフォルダー型本体とnative fixtureで全体/個別ログ画面・終了時ログを確認します。

`deploy.bat` はPowerShell 7（`pwsh.exe`）を使用します。

`deploy.bat "配置先の既存フォルダ"` でEXEのみコピーします。引数省略時は `deploy.local.txt` の先頭行を使います。`deploy.local.txt.example` を参考にしてください。設定や追加拡張はコピーしません。配置先で実行中の場合は先に終了してください。既存EXEを置換する操作なので、配置はユーザーが必要な時に実行してください。

### Windows通知の起動先

`src/main/core/notifications.ts`でAppletと更新通知を共用します。Windowsは`toastXml`のprotocol activationを使い、元のフォルダー型本体パス・保存先・packaged状態のSHA256から配置専用URI schemeを生成します。最初の通知時にだけ`app.setAsDefaultProtocolClient`で元のフォルダー型本体を登録し、開発起動にはrepoパス、隔離試験には`--test-profile`を付けます。Electron 44.6.0が共有の製品名ショートカットからCLSIDを読み、LocalServer32を現在の実行EXEへ書き換える自動登録にクリック先を依存させません。

クリックは`second-instance`または初回起動の引数から処理します。URIは配置専用schemeとUUIDトークンだけを受け付け、外部URIから任意コマンドを実行しません。実行中のコールバックは一度だけ消費し、Appletの同じ子プロセスが稼働中であることを再確認します。終了後/古いトークンは本体を開くだけです。履歴用コールバックは最大512件保持します。既存の`at365.appdock`通知設定とフォルダー型本体配布を維持します。

`dev.bat exec node scripts/notification-portable-test.cjs`は2つの隔離portableで合成通知を表示し、Windows通知履歴のXMLとURI登録を確認して、Windows Shell経由で同じURIを起動します。稼働中/終了後/停止Applet/同じURIの再実行を検証し、試験URIと合成通知を削除、Electronが触る既存のショートカット/COM登録を復元します。物理的な通知クリックと実Gmail受信は別途確認が必要です。

参照: [Electron通知](https://www.electronjs.org/docs/latest/api/notification#new-notificationoptions)、[Windows toastのprotocol activation](https://learn.microsoft.com/en-us/uwp/schemas/tiles/toastschema/element-toast)、[Electron 44.6.0の自動登録](https://github.com/electron/electron/blob/v44.6.0/shell/browser/notifications/win/windows_toast_activator.cc)。

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder portable](https://www.electron.build/nsis/)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)

## 配布・保存・Appletの実装上の補足

electron-builderのportable形式を使用します。起動時にElectronと.NETホストを一時フォルダーへ展開し、`PORTABLE_EXECUTABLE_DIR`で元のEXEの隣に設定を保存します。.NETの単一ファイルと同じ方式ではありません。

Secrets APIはElectron safeStorageによるWindowsの暗号化を利用します。React画面にはNodeを公開せず、Appletのパネルはホストの宣言的な契約で描画します。Webアカウント対応Appletの操作画面は、限定preloadを持つローカルUIとリモートのWebContentsViewを組み合わせ、[Appletページ](docs/applet-pages.md)の宣言に従って本体ページまたは別Windowへ表示します。manifestのcapabilitiesはHost APIの使用宣言・検査であり、直接のファイル操作やネットワーク通信の権限制限ではありません。

`minimumHostVersion`を宣言したAppletは起動前にホストバージョンを検査します。既存のAPI v1、設定・コマンドIDは維持します。manifestで宣言したコマンドはロード前から公開し、旧IDは別名として維持できます。履歴画像のボタンやモニター切替は一般コマンドではなく専用のパネル操作です。

`displayName`はホスト画面・設定・コマンド候補・トレイの表示に使い、省略時は`name`の先頭の`Applet.`を除去します。manifest変更後はホストの再起動が必要です。

未インストールの旧サンプル`appdock.welcome` / `appdock.dotnet-demo`の設定・ショートカット・ピン留め等は起動時に整理します。明示的にインストールしたテスト用サンプルは保持します。

トレイの設定・再起動後の保持・実Trayのメニューとイベント・停止時の扱いは`dev.bat run test:tray`、GPU設定のON→OFF→ONと再起動後のElectron実状態は`dev.bat run test:hardware-acceleration`で検証します。GPU無効化はElectronの初期化前に行います。

隔離GUIは`scripts/ribbon-layout-ui-test.cjs`、本体ショートカットは「設定 → ショートカット」のコマンド一覧で編集します。Applet個別設定/キー編集は詳細上部の独立したタブへ集約します。表示順・共有編集は[ホスト開発ガイド](docs/host-development.md#appletの表示順)、隔離GUIは`scripts/applet-order-ui-test.cjs`を参照してください。

WebアカウントのNode navigateコマンド、externalLinkSettingとreturnToStartOnHideSettingの自身のboolean設定による制御は、[WebアカウントAPI](docs/web-accounts.md)を参照してください。非表示復帰はWebAccountControllerがSurfaceの可視状態を判定し、ローカルUIのviewport(null)と区別します。関連回帰はtests/web-accounts-auto-return.test.cjs、実WebContentsの試験は兄弟Gmailのscripts/test-auto-return.cjsで実行します。

manifestのsettingActionsで設定ページに操作ボタンを表示します。自身の宣言済みコマンドだけを実行し、結果表示・二重実行防止・保存済み入力の維持を共通化します。[Applet API](docs/extensions.md)を参照してください。WallpaperSlideshowの`scripts/test-background-settings-ui.cjs`がnative fixtureを使った統合GUI検証です。
