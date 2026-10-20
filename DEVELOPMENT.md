# AppDock.at365 開発ガイド

## 発行・配置ファイルの保存先

標準発行先は `A:\40.ARTIFACT\AppDock.at365` です。`publish.bat`はソースrepo、`deploy.bat`は発行先から実行します。配置用ファイル・設定の保持とテンプレートの更新は[共通発行手順](docs/publishing.md)を参照してください。

現在のコードを基準に、開発環境と機能別の仕様・検証への入口をまとめます。利用方法は[README](README.md)、作業規則は[AGENTS](AGENTS.md)、実測結果は[VERIFICATION](VERIFICATION.md)を参照してください。

## 文書の入口

| 対象 | 正本 |
| --- | --- |
| 実装・コミット・Release | [共通手順](docs/development-workflow.md)、[Release](docs/RELEASING.md)、[全体パッケージ](docs/all-in-one.md) |
| ホストとAppletの開発 | [ホスト開発](docs/host-development.md)、[Applet開発](docs/applet-development.md)、[Applet API](docs/extensions.md) |
| 保存・起動 | [設定同期と保存領域](docs/settings-sync.md)、[Windows起動設定](docs/launch-settings.md) |
| 端末別設定 | [Appletごとの保存先・ツールバー・表示／一般設定・移行と復旧](docs/device-settings-design.md) |
| 既定値とリセット | [設定JSONの既定値省略・ページリセット・PC専用から共有への選択](docs/settings-defaults-reset-design.md) |
| 共有設定・dataの場所（設計・未実装） | [端末ごとの参照先指定・素材と名簿・NASの排他と復旧](docs/shared-settings-location-design.md) |
| 設定の再起動通知・JSON復旧 | [現行仕様](docs/settings-sync.md#設定の状態と再起動通知)、[設計と確認項目](docs/settings-recovery-notifications-design.md) |
| 共通操作と許可 | [共通操作API](docs/appdock-api.md)、[MCPとCodex登録](docs/automation.md) |
| MCPハブ・カスタムコマンド（0.60.0） | [全体概要](docs/mcp-hub-design.md)、[実装計画と到達点](docs/mcp-hub-implementation-plan.md)、[コマンド基盤](docs/custom-commands-design.md)、[クライアント](docs/mcp-client-design.md)、[ハブ](docs/mcp-hub-relay-design.md)、[保存型MCPコマンド](docs/mcp-command-design.md) |
| カスタムコマンドの種類と説明 | [共通説明文・キー送信・プロセス起動・WindowsToolsの撤去](docs/custom-command-types-design.md)、[実装計画と到達点](docs/custom-command-types-implementation-plan.md)。保存版2へ一本化し、旧設定の移行は行わない |
| MCPのネットワーク接続 | [接続範囲・認証・Codex互換性の設計](docs/mcp-network-access-design.md) |
| MCP Eventsとdot | [通知種類の選択・購読・Webhook・保存と再送](docs/mcp-events-design.md) |
| 音声再生の共通API | [再生キュー・取消・Gmail通知移行](docs/audio-playback.md) |
| TTSサーバー連携・読み上げAPI | [TTSサーバー連携と読み上げAPI](docs/tts-design.md) |
| AI共通API・プロンプト設定 | [AI文章生成とApplet/MCP共通API](docs/ai.md)、[Gmail連携を含む設計](docs/ai-services-design.md)（Gmailは未実装） |
| 通知の読み上げ | [種類別ON/OFFと通知全体の声・速度](docs/notification-speech-design.md) |
| 情報通知・操作結果 | [設定・発行・移行範囲](docs/information-notifications-design.md) |
| 共通警告・旧PC専用データ | [通知・対象一覧・整理導線の設計](docs/warning-notifications-design.md) |
| ページとWeb | [Appletページ](docs/applet-pages.md)、[Webアカウント](docs/web-accounts.md)、[WebApplet](docs/web-applets.md) |
| アカウントグループ | [共用・保存・Gmail移行の設計](docs/web-account-groups-design.md) |
| 動的ページとWebApplet分離 | [汎用ページ登録・共通Web基盤・独立Appletと移行の設計](docs/dynamic-pages-webapplet-design.md) |
| .NET AppletのHTMLページ連携（0.66.1） | [ページサービス・JavaScriptからの操作・画像配信](docs/dotnet-applet-pages-design.md) |
| 入力・トレイ | [ショートカット](docs/keybindings.md)、[ジェスチャー](docs/gestures.md)、[トレイ](docs/tray-menu.md) |
| グローバル入力のフック統一（0.63.0） | [Winキーの記録・元入力のブロック・共有InputHost・検証計画](docs/keyboard-hook-shortcuts-design.md) |
| Shell | [構成と拡張方針](docs/shell-foundation.md)、[タイトルバー・ステータスバー](docs/shell-bars.md)、[リボンAPI](docs/shell-api.md)、[オーバーレイ](docs/shell-overlays.md)、[本文とログ](docs/shell-pages.md) |
| リボンのグループ化とバッジ | [両展開方式・保存・共通API・Gmail連携](docs/ribbon-groups-badges-design.md) |
| プロフィール分離・共通画像ライブラリー | [現行API・保存・グループ・汎用リボン](docs/registered-images.md)、[採用設計](docs/profile-applet-image-library-design.md) |
| リボンの装飾・コマンドボタン | [色付きの枠と連結線・色なし・名前・右クリック動作](docs/ribbon-customization-design.md)、[2段階の実装計画と受け入れ条件](docs/ribbon-customization-implementation-plan.md) |
| Shellの領域別割り当て | [領域ごとの指定・復旧・専用コマンドと実装計画](docs/shell-region-assignment.md) |
| 更新 | [自己更新](docs/updates.md)、[配布先の確認](docs/update-checklist.md) |
| 文書 | [文書方針](docs/documentation.md) |
| 設定基盤・共通UIテンプレート | [設定基盤と本体の共通設定画面](docs/settings-foundation.md)、[ページ・カード・項目行の共通部品](docs/settings-foundation.md#共通の画面構成) |
| 設定画面の本体統合 | [設定Shellの終了・settings-uiの移動・互換入力・検証計画](docs/settings-host-ui-design.md) |
| 一覧編集・ダイアログ | [一覧の基本形、共通部品の使用例、表示順・Shellを入口にする際の接続とフォーカス](docs/settings-list-editing.md) |
| 通知基盤・移行設計 | [通知サービスとShell契約](docs/notifications.md)、[通知種類設定と段階的な拡張の設計](docs/notification-foundation.md) |
| 共通のエラー報告 | [エラー通知とログの方針・共通入口・接続範囲](docs/error-reporting.md) |
| Shellページの表示領域 | [本文領域全体への配置とページ内レイアウト](docs/shell-page-layout.md) |
| 独立アプリの追加機能を取り込む場合 | [現状と未着手候補](docs/migration.md) |

本体はTypeScript、描画はReactです。C#/.NETとNode.jsのAppletは別プロセスで実行し、独自WPF/WinForms画面はnative Appletが所有します。設定/APIの内部名extensionsは維持します。ページ共通の即時保存・詳細タブの契約は[設定パネルの共用](docs/host-development.md#applet設定パネルの共用)を参照してください。

## 開発環境・ビルド・テスト

スタートアップ登録・管理者起動の仕様と保存処理は[起動設定](docs/launch-settings.md)を参照してください。実Windowsタスクと発行した単一EXEの専用検証は`dev.bat exec node scripts/launch-settings-ui-test.cjs A:/40.ARTIFACT/AppDock.at365/AppDock.at365.exe`です。UAC承認・実サインインの確認範囲は検証記録で区別します。

Windows x64と.NET 10 SDKが必要です。Node.jsとpnpmは **このプロジェクトの `.tools` 内**に配置できます。グローバルインストール、管理者権限、永続的なPATH変更は不要です。[toolchain.json](toolchain.json)でNode.jsとpnpmのバージョンを固定し、依存ライブラリは `pnpm-lock.yaml` で固定しています。

pnpmのパッケージストアは、`pnpm-workspace.yaml`の`storeDir`で`A:/30.PROJECT/.pnpm_store`に固定しています。ワークスペースを同じ`A:\`へ同期する別PCでも、このプロジェクト内では同じ保存先を使います。PCごとの環境変数やユーザー共通pnpm設定の変更は不要です。既存の`node_modules`が旧ストアを参照するPCでは、一度だけ`.\dev.bat install --frozen-lockfile --force`で再接続してください。ストアが空の場合は通常のインストールで必要なパッケージを取得します。

初回は次の手順で準備します。公式Node.js ZIPのSHA256を照合し、npmでpnpmをプロジェクト内にインストールします。

```powershell
.\setup-tools.bat
.\dev.bat install --frozen-lockfile
.\publish.bat
```

次回からの発行は `.\publish.bat` です。本体EXEと更新JSONを本体のpublishへ生成します。変更したAppletは、それぞれのrepoでpublish.batを実行します。実装・修正の完成時は、[共通手順](docs/development-workflow.md#実装)に従って発行前のレビュー1回と必要な修正・再検証を終え、[版更新の判断](docs/development-workflow.md#版更新の判断)に従って対象モジュールの版を上げて発行します。同じ機能の追加修正も、完成して発行するたびにパッチ版を進めます。マイナー更新の条件と、新たな実装・修正を伴わない再発行・リリースの扱いは共通手順に従います。オールインワンZIPの作成・検証と旧版ZIP整理は、[GitHub Release手順](docs/RELEASING.md)のPrepareで行います。通常publishからは呼び出しません。対象リポジトリ・出力・検証方法は[オールインワン作成](docs/all-in-one.md)を参照してください。`dev.bat` はローカルのNode.jsとpnpmを、そのコマンドの実行中だけPATHへ追加します。開発コマンドもこの入口から実行できます。

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
.\dev.bat exec node scripts/smoke.cjs A:/40.ARTIFACT/AppDock.at365/AppDock.at365.exe
```

Node.js／pnpmの更新は、`toolchain.json` の完全なバージョン番号を変更してから `.\setup-tools.bat` を再実行します。両ツールの取得・動作確認が成功した後にだけ利用バージョンを切り替えます。以前のバージョンは `.tools/node/<version>` と `.tools/pnpm/<version>` に残すので、設定を戻してsetupを実行すると切り戻せます。winget等の更新対象にはなりません。更新後は `.\dev.bat run typecheck`、`.\dev.bat test`、`.\publish.bat` で確認してください。

現在の固定ツールはNode.js 24.21.0（24 LTS）とpnpm 12.10.1です。pnpm 12はネイティブEXEになったため、setupはnpmで依存のスクリプトを無効にして取得した後、pnpm自身の公式`install.js`だけを実行し、Windowsの起動用shimを再生成します。初回取得・再実行・古いpnpmへの切り戻しもプロジェクト内で完結します。グローバルのツールやPATHは変更しません。

Electron 44.6.0はバイナリを初回実行時に取得するため、[公式手順](https://www.electronjs.org/docs/latest/tutorial/installation)の`install-electron`をプロジェクトの`postinstall`で明示実行します。pnpmが変更なしのインストールを省略する場合、バイナリが必要なら次を実行してください。

```powershell
.\dev.bat run postinstall
```

依存更新は`.\dev.bat update --latest`、残りの確認は`.\dev.bat outdated --format json`です。安定版の直接依存と、それが要求する間接依存をlockfileに固定します。GmailはこのホストのTypeScript・Vite・Reactを共有し、他の5つの.NET Appletは外部NuGet参照を持ちません。各Appletの既存回帰テストも合わせて実行してください。

### 依存とツールの公開後待機

通常更新は各バージョンの公開から7日待機します。`pnpm-workspace.yaml`の`minimumReleaseAge: 10080`（分）、`minimumReleaseAgeStrict: true`、`minimumReleaseAgeIgnoreMissingTime: false`を使い、実行時・開発用・間接依存へ適用します。条件を満たす版がなければ停止し、公開日時がない場合も停止します。既存lockfileを使ったインストールにも適用するため、若い版を別環境から持ち込んでも待機を回避できません。`outdated`に新版が残っても、待機中なら無理に導入しません。日数を変える場合は`toolchain.json`の`minimumReleaseAgeDays`も揃えます。setupは両設定の一致を確認します。

`verifyDepsBeforeRun: error`により、`dev.bat run`によるビルド・試験前に依存の不整合があれば自動インストールせず停止します。導入・復元は明示的な`dev.bat install --frozen-lockfile`、依存版更新は`dev.bat update --latest`で行います。`publish.bat`は発行前に`dev.bat install --frozen-lockfile`を実行し、現在のworkspaceと固定依存を同期します。同期が非0で終わったら、その終了コードを返して発行を開始しません。同期と発行の両方が成功した場合だけ終了0となります。

`package.json`の製品バージョンを変更した場合も、pnpmが記録するworkspaceの版との不一致で`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`になることがあります。`publish.bat`だけを実行すれば発行前に記録が同期されるため、製品の版更新後に手動でinstallする必要はありません。`dev.bat run typecheck`などを先に行う場合は、`dev.bat install --frozen-lockfile`で同期してください。同期には固定lockfileと公開後待機・供給網検査を適用し、検査の失敗を無視しません。復元後にTypeScriptの構文エラーが出る場合は、報告されたソースを修正して型検査を通します。依存の再インストールだけではソースの構文エラーは直りません。

2026-10-11の導入時は、既存0.26.25で導入・検証済みのlockfileに7日未満の6件が含まれていました。版とlockfileを変えず現状を維持する移行例外として`@vitejs/plugin-react@6.1.2`、`electron@44.6.0`、`http-cache-semantics@4.3.0`、`nanoid@3.3.20`、`postcss@8.5.29`、`vite@8.3.3`だけを完全な版で除外しています。通常の新版には適用されません。全6件が成熟する2026-10-14 07:39:15 JST以降にこれらを取り除けます。`minimumReleaseAgeExcludePrune: true`でlockfileから消えた版の除外は更新時に自動整理します。pnpm本体12.10.1は導入済みのものを再利用し、新規取得は成熟するまで拒否します（ツールの例外は追加していません）。

Node.jsは`toolchain.json`で完全な版を固定し、`nodeChannel: "lts"`を維持します。現在の24.21.0はKrypton LTSです。自動でCurrentや新しいLTSへ移行しません。新規取得前に公式の`dist/index.json`で対象版のLTS表示と公開日を確認します。公開日が日単位なので、そのUTC日が終わってから7日待ちます。導入済みNodeは実行ファイル自身のLTS表示を確認して再利用します。

pnpm本体はnpmで導入するため、workspace設定だけでは保護されません。setupは公式npmレジストリで固定版のpnpmとWindows x64ネイティブパッケージの公開日時を確認し、npmにも`--min-release-age=7`を渡します。新規取得でメタデータの取得・検証に失敗したら停止します。導入済みの固定ツールは再利用し、通常ビルドのたびにツール公開情報を取得しません。

重大なセキュリティ修正を急いで導入する場合は、出所・告知・差分を確認し、対象の完全な版だけを例外にします。npm依存は`pnpm-workspace.yaml`の`minimumReleaseAgeExclude`へ`package-name@1.2.3`を追加し、理由をコメントとVERIFICATIONへ記録します。名前だけやワイルドカードで全バージョンを除外しません。ツールは`toolchain.json`の`releaseAgeExceptions`へ`{"package":"pnpm","version":"12.10.1","reason":"確認した修正内容"}`形式で記録します（これは書式例で、現在の例外は空です）。対象は`node`、`pnpm`、`@pnpm/exe.win32-x64`です。pnpmとそのバイナリはそれぞれ確認し、必要ならそれぞれ版指定で例外にします。Nodeの例外は待機日数だけを免除し、LTS要件や公開日時の確認は維持します。待機期間経過後や対象版の不使用時に例外を取り除きます。

待機は不正コードの検出を保証する機能ではありません。lockfile固定、導入前の告知・差分確認、導入後の必要な回帰確認も継続します。仕組みの回帰は`node --test tests/release-age.test.cjs`（ローカルNodeを使用）で、公開時刻の境界、版限定例外、非LTS拒否、pnpm実体の直接・間接・日時欠落・lockfile復元時の拒否を隔離レジストリで確認します。

`.tools` のツール本体とnpmキャッシュはGit管理・EXEへの同梱対象外です。pnpmの依存パッケージストアはpnpmの通常のユーザーキャッシュを使います。

`pnpm run dist` は.NETホストのframework-dependent発行（`win-x64`、`--self-contained false`）、TypeScriptのコンパイル、React/Viteのビルド、Windows x64 portable EXE作成を行います。`publish.bat` からも発行できます。`build:dotnet` は発行前に `.artifacts/dotnet-host` を削除して再生成し、以前のself-contained発行で残ったランタイムファイルの混入を防ぎます。このフォルダには手作業のファイルを置かないでください。`AppDock.at365.slnx` はSDK・Runtime・.NETホスト用です。Electron部分はプロジェクトルートのpackage.jsonを使います。

`build`は`scripts/build-main.cjs`で生成済みの`out/main`を整理してからTypeScriptをコンパイルします。削除したモジュールが次の配布物に残ることを防ぎます。React/Viteも`out/renderer`を再生成します。設定の読み込み・保存は定義済みのトップレベル項目のみを返し、Applet固有の`extensions.<id>.settings`は保持します。

portable発行は`scripts/build-portable.cjs`を経由します。electron-builderのportableテンプレートを適用するため、ビルドプロセス内だけでNsisTarget.computeFinalScriptへ`scripts/portable.nsi`を渡し、終了時に復元します。node_modulesは編集しません。ビルダーの固定版と元テンプレートのライフサイクルを検証し、依存更新時は明示的に見直します。直接electron-builder CLIを使うとこのランチャーを含まないため、発行にはpublish.batまたはdev.bat run distを使ってください。APIからビルドする試験もdev.batのローカルNode/pnpm環境を使います。

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
3. 同じテストスクリプト・実行方式ごとに、確認済みの成功分を実行日時順に並べ、直近3回分を残します。それより古い成功分だけを削除候補にします。移行試験用の旧版EXE、今後使うfixture、検証記録から再利用を指定された資料は候補から除きます。
4. テストランナーと起動したElectron/.NET子プロセスが終了し、ほかの作業・チャットで使用されていないことを確認します。候補のパスを参照する実行中プロセスがないことも確認し、確認権限不足や状態不明なら保持します。
5. 削除直前に絶対パスと対象を再確認します。対象は当該repoの`.artifacts`直下にある通常のテスト専用ディレクトリに限定します。対象と配下にjunction・シンボリックリンク等の再解析ポイントがある場合は除外し、repo外へたどりません。PowerShellの`Remove-Item -LiteralPath`など同じシェル内で処理し、使用中や削除失敗時は強制終了・制限迂回をせず残します。
6. 残す直近分と保護対象が保持され、削除対象がなくなったことを確認します。削除名・件数、保持したものの理由、未実施や失敗を`VERIFICATION.md`の当該作業記録へ簡潔に残します。

`dotnet-host`、`updater`、`test-extensions`、`node-extensions`などの固定ビルド出力、`release-*`、`all-in-one-*`、単独の調査ファイルは、この手順の削除対象に含めません。`.artifacts`全体への再帰削除や、更新日時だけを使った一括削除は行いません。publishの旧版ZIP整理・GitHub Release保持数とは別の手順です。

この手順は通常publishや製品起動に自動削除を追加するものではありません。開発生成物は`.artifacts`へ保存します。既存の検証記録内の旧`artifacts/`パスは当該repoの`.artifacts/`へ読み替えてください。保存済みJSON/ログにある実行当時の絶対パスやハッシュは履歴として保持し、旧planを無条件に再実行せず、再開前にパス・phase・実状態を照合します。同期・バックアップ・スナップショットの設定は利用者が担当します。

## 配置

共通ログAPIは[Applet API](docs/extensions.md#sdkで使えるサービス)を参照してください。停止処理中のhost.logだけを許可し、クリーンアップエラーをホストファイルへ保存します。tests/logging.test.cjsで開始/稼働/停止中のログ・停止後拒否・他API拒否を確認します。WallpaperSlideshowのscripts/test-host-logging-ui.cjsは発行した単一EXEとnative fixtureで全体/個別ログ画面・終了時ログを確認します。

`deploy.bat` はPowerShell 7（`pwsh.exe`）を使用します。

`deploy.bat "配置先の既存フォルダ"` でEXEのみコピーします。引数省略時は `deploy.local.txt` の先頭行を使います。`deploy.local.txt.example` を参考にしてください。設定や追加拡張はコピーしません。配置先で実行中の場合は先に終了してください。既存EXEを置換する操作なので、配置はユーザーが必要な時に実行してください。

## 公式仕様

### Windows通知の起動先

`src/main/core/notifications.ts`でAppletと更新通知を共用します。Windowsは`toastXml`のprotocol activationを使い、元のportable EXEパス・保存先・packaged状態のSHA256から配置専用URI schemeを生成します。最初の通知時にだけ`app.setAsDefaultProtocolClient`で元の単一EXEを登録し、開発起動にはrepoパス、隔離試験には`--test-profile`を付けます。Electron 44.6.0が共有の製品名ショートカットからCLSIDを読み、LocalServer32を現在の実行EXEへ書き換える自動登録にクリック先を依存させません。

クリックは`second-instance`または初回起動の引数から処理します。URIは配置専用schemeとUUIDトークンだけを受け付け、外部URIから任意コマンドを実行しません。実行中のコールバックは一度だけ消費し、Appletの同じ子プロセスが稼働中であることを再確認します。終了後/古いトークンは本体を開くだけです。履歴用コールバックは最大512件保持します。既存の`at365.appdock`通知設定と単一EXE配布を維持します。

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

リボンの上寄せ/下寄せ・セパレーターと既存設定の移行は[Appletページとリボン](docs/applet-pages.md)を参照してください。隔離GUIは`scripts/ribbon-layout-ui-test.cjs`、本体ショートカットは「設定 → ショートカット」のコマンド一覧で編集します。Applet個別設定/キー編集は詳細上部の独立したタブへ集約します。表示順・共有編集は[ホスト開発ガイド](docs/host-development.md#appletの表示順)、隔離GUIは`scripts/applet-order-ui-test.cjs`を参照してください。

WebアカウントのNode navigateコマンド、externalLinkSettingとreturnToStartOnHideSettingの自身のboolean設定による制御は、[WebアカウントAPI](docs/web-accounts.md)を参照してください。非表示復帰はWebAccountControllerがSurfaceの可視状態を判定し、ローカルUIのviewport(null)と区別します。関連回帰はtests/web-accounts-auto-return.test.cjs、実WebContentsの試験は兄弟Gmailのscripts/test-auto-return.cjsで実行します。

manifestのsettingActionsで設定ページに操作ボタンを表示します。自身の宣言済みコマンドだけを実行し、結果表示・二重実行防止・保存済み入力の維持を共通化します。[Applet API](docs/extensions.md)を参照してください。WallpaperSlideshowの`scripts/test-background-settings-ui.cjs`がnative fixtureを使った統合GUI検証です。


## 共通操作と更新の検証

MCPハブの契約試験は`tests/custom-commands.test.cjs`と`tests/mcp-client.test.cjs`、実GUIは`dev.bat exec node scripts/mcp-hub-ui-test.cjs [固定EXEの絶対パス]`。GUIは隔離profileにNode/.NET/nativeの種類fixtureとMCPサーバーを配置し、既存WatchのRelease出力を使う。先に本体をbuildし、`tests/fixtures/dotnet/AppDock.CustomCommands`と兄弟WatchのRelease buildを用意する。GUI実行中のbuildを禁止し、結果のprofile・EXE hash・確認項目を保存する。fixtureは製品へ同梱しない。実ChatGPT、物理入力、実照明は別の確認範囲である。

AppDockApiと操作カタログをMCP/Node/.NETで共有します。設定、Applet管理、ショートカット、ジェスチャー、リボン、トレイの編集にはそれぞれの既存サービスを使い、通信層へ処理を複製しません。tests/appdock-api.test.cjs、tests/automation.test.cjsと対象サービスの単体試験、scripts/automation-ui-test.cjs、scripts/applet-api-ui-test.cjsを変更範囲から選びます。入力APIはNode実行文脈とInputTests、scripts/native-input-ui-test.cjsも確認します。詳細な手順と許可は[共通操作API](docs/appdock-api.md)と[外部操作](docs/automation.md)を参照してください。

`scripts/shortcut-foreground-ui-test.cjs [portable EXE]`はWindowsToolsを入れない隔離profileの本体キー送信種類を使い、Ctrl+Shift+F23で背後・最小化・非表示から本体の実HWNDが最前面になること、Ctrl+Shift+F24でデスクトップからWin+Eを送り新しいExplorerが開くことを確認します。先にInputTarget fixtureをReleaseビルドします。CDPは本体のフォーカスを操作せず、独立したネイティブfixtureがOS入力を生成します。試験で新規作成したExplorerだけを閉じ、portableの隔離コピーは元EXEとのSHA256を照合します。

自己更新のmetadata・helper・journal・中断復旧は[更新ガイド](docs/updates.md)、実GitHub/HTTP(S)/UNCは[チェックリスト](docs/update-checklist.md)で確認します。通常publishと、公開後の実取得・インストール確認は別工程です。

## 条件付きショートカット

[保存形式・判定・検証](docs/keybindings.md)を参照してください。全画面の入力とWindowsホットキーをホスト共通の条件判定/逐次実行へ集約します。新規割り当ては提供元条件を既定にし、本体コマンドはapp条件にします。

[編集画面と表示順](docs/keybindings.md#編集画面と表示順)を参照してください。設定ページの全コマンド一覧とApplet詳細で一覧・小さな編集パネルを共用し、検索/状態フィルターと追加時の表示位置を保持します。

## マウスジェスチャー

本体の入力プロセス、宣言による初期割り当て、コマンド文脈・取消、試験は[マウスジェスチャー](docs/gestures.md)を参照してください。InputHostは右ボタン押下時の修飾キー（左右Ctrl/Alt/Shift/Win）と他の標準マウスボタン（左/中/X1/X2）を調べ、先行押下があれば通常入力を通します。待機中の修飾キー付き操作とクリック操作は維持します。実入力回帰はInputTestsで確認します。本体はApplet固有の設定移行や通知時の上書きを行わず、保存済みのApplet設定をそのまま渡します。ショートカットと一覧/編集の枠/実行順パネルを共用し、ジェスチャー選択とbrowser/exe条件だけを専用に構成します。

ショートカット/マウスジェスチャーの共通操作UIは[割り当て操作UI](docs/host-development.md#割り当て操作uiの共用)を参照してください。scripts/shortcuts-ui-test.cjsは全コマンド/フィルター/メニュー/保存/登録エラー/両画面のdark/light全3幅を検証し、単一EXEのパスを引数で渡すと隔離コピーをCDPで検証します。

同じGUIで、未割り当てとキーの左端、複数割り当て、検索中のコマンド一覧、一覧操作で保存済みの実行順が変わらないことも照合します。shortcut-order-checks.cjsで専用パネルのドラッグ/上下/Alt＋上下、全提供元の表示、複数キーの一時編集、取消、外部更新の競合保護、無効/未確認/空/1件/長い一覧、両テーマ3幅を検証し、同じGUIの再起動で適用後の順序を照合します。

隔離した2つの実ホストによるWindows登録競合、記録中のエラー絞り込み/表示保持と再試行成功後の解消も確認します。

`scripts/hotkeys-ui-test.cjs`は実Windows入力で登録・競合・解除とnative Appletの実行を確認します。実利用中のPause/F23/F24を避ける場合は`APPDOCK_HOTKEY_TEST_ISOLATED=1`で隔離fixtureだけをF16/F20/Ctrl+Alt+F9へ変更します。試験キーが空いていることを事前に確認し、実利用設定を変更しません。

ショートカットの即時保存・削除、停止中Appletの無効行を解除して保存/再起動後も解除を保つこと、他の割り当ての保持、Deleteキーを記録できることも同じGUIで確認します。

タスクトレイの保存形式・移行・編集UI・一時停止コマンドと検証は[タスクトレイ仕様](docs/tray-menu.md)を参照してください。

更新確認/進捗は共通のステータスバー通知へ統一しています。表示時間・確認結果・実Windowの可視状態の扱いは[更新ガイド](docs/updates.md#設定と取得)を参照してください。リボンのアバター用CSSは配置用の中間要素があっても一致するセレクターとし、画像の余白なし・正円を維持します。


## Shell実装の入口

[部分Shellと共通オーバーレイ](docs/shell-overlays.md)は、`shell.views`による領域単位の選択、リボン/パレットそれぞれのDefault Shell復旧、通常Applet機能との併用を定義する。`OverlayHost`と内容別`OverlayController`を分離し、新しいモーダルは表示寿命・最前面・入力停止・フォーカス復帰を再利用する。トレイのコマンド選択も同じ描画を使用する。パレット関連回帰は`tests/command-palette.test.cjs`、`scripts/shell-overlay-ui-test.cjs [固定EXE]`。新しいページ領域は取得/購読/操作契約を定義してから移す。

公開契約・ビルド境界は[Shell API](docs/shell-api.md)。Default Shellのソースは`shells/default`、本体側は`src/main/core/shell-host.ts`と`ui-presentation.ts`。新たなUIは機能状態・操作・表示モデルを本体側へ置き、Shellは公開モデルを描画する。移行した描画を本体rendererへ重複実装しない。

`dev.bat run build`は本体とDefault Shellを独立ビルドし、`publish.bat`で同じEXEへ同梱する。関連回帰は`tests/ui-presentation.test.cjs`、`tests/shell-boundaries.test.cjs`（内部importの逆流防止）、`scripts/shell-host-ui-test.cjs`、既存リボン/ページ/設定通知試験。Shell試験は発行EXEを引数にして同じ隔離試験を行える。`scripts/shell-metrics.cjs <旧EXE> <新EXE>`は2つの固定配布物を順次測定する。

[Shellのページ表示](docs/shell-pages.md)は、本文領域のShellPageHostと内容別ShellPageController、ホーム・ログ・通知センターの公開モデル/操作/購読を定義する。設定画面は[本体の共通UI](docs/settings-foundation.md)で描画する。全体・Applet詳細・WebApplet管理のログを共用し、本体の重複描画を撤去した。回帰はtests/home-page.test.cjs、tests/log-page.test.cjsとscripts/shell-home-ui-test.cjs [固定EXE]、scripts/shell-page-ui-test.cjs [固定EXE]。テーマ切替時のネイティブ背景とページ描画はscripts/shell-page-theme-ui-test.cjsで確認し、--softwareでハードウェアアクセラレーション無効も確認できる。ホームの表示順はmainのSettingsInputSessionから読み取ります。過去ログや日付検索は後続。

設定の正本は保存済みSettingsStoreです。mainのSettingsInputSessionは選択/モード/操作受付だけを持ちます。本体rendererのuseSettingsEditorは直列入力と購読を担当します。設定範囲・カタログ・公開契約は[設定基盤](docs/settings-foundation.md)を参照してください。

設定Shellの回帰は `tests/settings-editing.test.cjs`、`tests/settings-page.test.cjs`、`scripts/settings-shell-ui-test.cjs [固定EXE]`。既存navigation・preferences・設定通知・スクロール・sidebar・Shell復旧も影響範囲として確認します。全体JSONの入力を前提にした試験は、選択ページの部分JSONまたはhost専用編集アダプターへ接続します。

ヒントの表示とタイトル横の「？」は`dev.bat exec node scripts/settings-hints-ui-test.cjs [固定EXE]`で確認します。hover/Tab/Escape、折りたたみを開閉しない操作、ダイアログ内のtop layer、ON/OFFの即時反映・再起動後の保持、状態・コマンドID・重要な注意・エラーの維持を検査します。文言の分類と部品の追加規則は[設定基盤](docs/settings-foundation.md#ヒントと一時表示)を参照してください。

本体のnative dialogとShell描画面の共通背景は`tests/host-modal-layer.test.cjs`と`dev.bat exec node scripts/host-modal-ui-test.cjs [固定EXE]`で確認します。隔離profileでショートカット・ジェスチャー・カスタムコマンド編集の明暗テーマ、幅変更、フォーカス復帰、追加Shellの故障復旧、本体再読込を検査します。仮のタイトルバー・ステータスバーも同じ登録口へ接続し、複数Viewの暗化・復帰をWindowsのウィンドウ合成画像とピクセルで照合します。将来のShell領域そのものの実装確認とは区別します。

設定の通知と破損復旧は`tests/settings-recovery.test.cjs`、`tests/settings-health-notifications.test.cjs`、`scripts/settings-recovery-ui-test.cjs [固定EXE]`で確認します。GUIは専用profileとPC専用rootを使い、復元確認だけをdialog fixtureで応答します。固定EXEでは既存のCDP/main inspector helperへ接続し、元EXEからの実際の再起動も確認します。OSのファイル選択dialogの実操作とは区別して記録してください。

設定横断検索はmainのSettingsNavigationStateがqueryと移動要求を保持し、settings-catalogの静的メタデータだけを照合します。Default ShellのSettingsIndexと安定アンカーが本文全体への移動を担当します。検索値・選択・移動はsettings.jsonへ保存しません。追加回帰は`scripts/settings-search-ui-test.cjs [固定EXE]`で、全本体項目のアンカー、非表示ページの遅延描画、検索/移動/復旧/削除対象を確認します。

## 通知設定の回帰

レベル別配色は`scripts/notification-colors-ui-test.cjs [固定EXE]`で確認する。実Node/.NETの登録時レベル、発行時の上書き、明暗テーマのバナー・デスクトップ・通知センター、文字/主要ボタンのコントラスト、既定復帰ボタンの不在と個別設定の即時保存を検証する。

種類宣言・設定・寿命・所有者の共通回帰はtests/notification-policy.test.cjs。scripts/notification-settings-ui-test.cjs [固定EXE]は実Node/.NETの新APIとDefault Shellの通知設定、親スイッチ、保存/抑制/期限/再起動を検証します。標準testは専用.NET fixtureもRelease buildします。旧Appletの既存APIはscripts/applet-api-ui-test.cjs [固定EXE]で確認します。即時保存はscripts/settings-shell-ui-test.cjs [固定EXE]で確認します。実装契約と次回範囲は[通知設計](docs/notification-foundation.md)を参照してください。

通知センターの回帰はtests/notification-center.test.cjs、実Node/.NET・更新結果・ページング・再起動・追加Shell復旧はscripts/notification-center-ui-test.cjs [固定EXE]。共有bridgeと既存通知操作ロックを使います。独自デスクトップの回帰はtests/notification-delivery.test.cjsとscripts/notification-desktop-ui-test.cjs [固定EXE]。実Node/.NET・独立Window・focus・抑制・Shell復旧・最後の表示先を外した解放を確認します。InputHostの専用queryモードに通知内容や入力hookを渡しません。次回はWindows表示先と旧show APIを基盤へ接続します。

領域別Shellの回帰は`dev.bat exec node scripts/shell-region-ui-test.cjs [固定EXE]`で、A/B混在・無効化復帰・パレット要求維持・設定Shell自身の即時保存/切替・通知ID/検索状態保持・Node/.NET/native自己状態・専用コマンド・safe起動を検証します。sourceでは入力flushの期限切れとrenderer単独故障も注入し、単体の`tests/shell-region.test.cjs`では正規化・版別故障・世代/session失効を検証します。

## 共通画像の検証

`tests/registered-images.test.cjs`と関連するリボン・設定・ページの回帰を実行する。`dev.bat exec node scripts/build-image-library-fixtures.cjs`でRegisteredImagesの.NET fixtureとnative3Appletを`.artifacts/image-library-fixtures/`へRelease buildする。GUIは`dev.bat exec node scripts/image-library-ui-test.cjs [固定EXE]`。独立Profileのソースと発行WebAppletを隔離profileへ配置する。GUI実行中に本体や.NET出力を再ビルドしない。実測の準備コマンド・入力hash・成功記録はVERIFICATIONを参照する。ファイル選択はnative dialog fixtureで応答し、原画像decodeと保存は実装を使う。

## Appletの既定状態と参照欠落時の保存

未保存のApplet有効状態は`src/shared/applet-state.ts`を正本とする。設定を補完する経路でも同じ既定値を使い、保存済みOFFは保持する。`tests/applet-defaults.test.cjs`と関連するlifecycle・端末設定・設定操作を確認する。`tests/page-collections.test.cjs`は既存の不足参照が無関係な保存を妨げないことと、追加/変更行の検証を確認する。

GUIは`dev.bat exec node scripts/applet-defaults-ui-test.cjs [固定EXE]`。新規Profileと開始待ちの自動起動、保存済みOFF、部分保存と実再起動、アカウント未検出時のリボンのフォーム/JSON保存を隔離profileで確認する。元の名簿と参照情報のbytes保持を検査し、実サイトへの接続や実利用設定の復旧は行わない。
