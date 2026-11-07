# ローカル発行

本体・各Appletの標準発行先は`A:\40.ARTIFACT\<リポジトリのフォルダー名>`です。発行スクリプトはリポジトリの2階層上の`40.ARTIFACT`を基準に計算し、不足するフォルダーを作成します。手作業の発行もこの配置にそろえます。ビルド・検証の一時生成物は引き続き各repoの`.artifacts`を使います。

`publish.bat`はソースrepoから実行します。本体は`win-unpacked`フォルダーと`update.zip`/`update.json`、各Appletは配布フォルダーとupdate.zip/update.jsonを出力します。本体の保存先・所有ファイル・初回切り替えは[フォルダー型配布](portable-distribution.md)を参照してください。通常publishは全体ZIPの生成・整理を行いません。

実装・修正を完成して発行するたびに、[版更新の判断](development-workflow.md#版更新の判断)に従って対象モジュールの版を進めます。通常の変更は、同じ機能の追加修正や未コミット・GitHub未公開の変更でも、新しいパッチ版にします。

ローカル発行は実利用先への配置・commit・push・GitHub Releaseとは別工程です。実利用先へ配置する場合は対象のAppDockを完全終了し、本体一式または対象Appletの配布フォルダーをコピーします。設定・data・他Appletは保持してください。

## .NETランタイムの共通方針

AppDock本体と各.NET Appletは、環境にインストールされた.NETランタイムを使用し、ランタイムを配布物へ同梱しません。新規実装・既存実装の変更・テスト用発行にも適用します。`framework-dependent`（`--self-contained false`）で発行し、単一EXEでもこの方針を維持します。

通常の.NET処理には.NET 10 Runtime、WPF/WinFormsを使うInputHost・Watch・WallpaperSlideshowには.NET 10 Desktop Runtime（いずれもWindows x64）が必要です。Desktop Runtimeには通常の.NET Runtimeも含まれます。各Appletの動作環境へ必要な種類・版・アーキテクチャを記載してください。

native Appletのプロジェクトは本体の[`dotnet/Directory.Build.targets`](../dotnet/Directory.Build.targets)をimportし、`SelfContained=true`・`PublishSelfContained=true`・`PublishAot=true`による発行を拒否します。`publish.bat`から呼ぶスクリプトでも`--self-contained false`を明示し、プロジェクトの指定を同梱ありへ上書きしません。DLL Appletは本体のExtensionHost上で実行します。

完成した配布物の`runtimeconfig.json`（単一EXEでは埋め込み内容）が共有frameworkを参照し、`includedFrameworks`やランタイム本体のDLLを含まないことを確認します。実際の起動トレースでPC側の共有ランタイムの使用を確認し、空の`DOTNET_ROOT_X64`を指定した子プロセスではランタイム未検出で終了することを検証します。PCのインストール状態は変更しません。native単一EXEは固定Nodeで`scripts/test-native-applet-runtime.cjs <発行EXEの絶対パス> <Appletの.artifacts内の証跡先>`を実行できます。接続前の起動・EOF終了を検証し、Appletの動作確認は各repoのプロトコル/GUI試験で行います。

## 本体の.NETプロセス

AppDock本体が配布する.NETプロセスは、すべて利用先のPCにインストールされた共有ランタイムを使います。現在は.NET 10 Desktop Runtime（Windows x64）を用意すれば、WPFのInputHostと、通常の.NETを使うExtensionHost・ProcessHost・Updaterが動作します。

1. 新しいプロセスのプロジェクトは `dotnet/` 配下に置き、[`Directory.Build.targets`](../dotnet/Directory.Build.targets) の共通発行設定を適用します。Windows x64を対象とし、単一EXEが必要な場合もframework-dependentで発行します。自己完結発行とNative AOTは共通設定で拒否します。
2. 通常の補助プロセスは [`build-dotnet.cjs`](../scripts/build-dotnet.cjs) の `hosts` にプロジェクト名と出力先を登録します。全体発行とテスト用の個別発行には同じ設定を使用し、出力先を空にしてから発行します。Updaterは更新時に独立して動くため、同じ共通設定で単一EXEに発行します。
3. 本体の発行では `--seal-host` と更新ZIPの作成時に、配布フォルダー内の.NETランタイム本体のDLLや自己完結の `runtimeconfig.json` を検出すると失敗します。プロセスを追加したら、必要な共有フレームワークを[動作環境](usage.md#動作環境起動)に反映し、完成した配布物から起動してPC側のランタイムを読み込むことを確認します。
