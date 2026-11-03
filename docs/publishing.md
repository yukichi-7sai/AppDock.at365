# ローカル発行と配置

本体・各Appletの標準発行先は`A:\40.ARTIFACT\<リポジトリのフォルダー名>`です。発行スクリプトはリポジトリの2階層上の`40.ARTIFACT`を基準に計算し、不足するフォルダーを作成します。手作業の発行もこの配置にそろえます。ビルド・検証の一時生成物は引き続き各repoの`.artifacts`を使います。

`publish.bat`はソースrepoから実行します。本体は`win-unpacked`フォルダーと`update.zip`/`update.json`、各Appletは配布フォルダーとupdate.zip/update.jsonを出力します。本体の保存先・所有ファイル・初回切り替えは[フォルダー型配布](portable-distribution.md)を参照してください。通常publishは全体ZIPの生成・整理を行いません。

実装・修正を完成して発行するたびに、[版更新の判断](development-workflow.md#版更新の判断)に従って対象モジュールの版を進めます。通常の変更は、同じ機能の追加修正や未コミット・GitHub未公開の変更でも、新しいパッチ版にします。

発行成功後、repoの`deployment/`から発行先へ`deploy.bat`と関連する`scripts/`・記入例を追加します。既存ファイルは上書き・削除しません。`deploy.local.txt`も同様に保持し、初回は旧repo直下の設定があれば引き継ぎます。配置用テンプレートの変更を既存発行先へ反映する場合は、変更点を確認して明示的に更新します。

配置は発行先の`deploy.bat "配置先の既存フォルダー"`で実行します。引数を省略すると発行先直下の`deploy.local.txt`の先頭行をUTF-8で読みます。未指定・不正な配置先では失敗します。配置処理はビルドツールやソースrepoを参照せず、発行済みの成果物をコピーします。実行前に配置先のAppDockを終了してください。

配置対象は本体が所有するファイル一式または対象Appletの配布ファイルだけです。設定・data・他Appletを保持します。ローカル発行は実利用先へのdeploy・commit・push・GitHub Releaseとは別工程です。

## 本体の.NETプロセス

AppDock本体が配布する.NETプロセスは、すべて利用先のPCにインストールされた共有ランタイムを使います。現在は.NET 10 Desktop Runtime（Windows x64）を用意すれば、WPFのInputHostと、通常の.NETを使うExtensionHost・ProcessHost・Updaterが動作します。

1. 新しいプロセスのプロジェクトは `dotnet/` 配下に置き、[`Directory.Build.targets`](../dotnet/Directory.Build.targets) の共通発行設定を適用します。Windows x64を対象とし、単一EXEが必要な場合もframework-dependentで発行します。自己完結発行とNative AOTは共通設定で拒否します。
2. 通常の補助プロセスは [`build-dotnet.cjs`](../scripts/build-dotnet.cjs) の `hosts` にプロジェクト名と出力先を登録します。全体発行とテスト用の個別発行には同じ設定を使用し、出力先を空にしてから発行します。Updaterは更新時に独立して動くため、同じ共通設定で単一EXEに発行します。
3. 本体の発行では `--seal-host` と更新ZIPの作成時に、配布フォルダー内の.NETランタイム本体のDLLや自己完結の `runtimeconfig.json` を検出すると失敗します。プロセスを追加したら、必要な共有フレームワークを[動作環境](usage.md#動作環境起動)に反映し、完成した配布物から起動してPC側のランタイムを読み込むことを確認します。
