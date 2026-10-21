# AppDock.at365

## インストール方法

[Releases](https://github.com/yukichi-7sai/AppDock.at365/releases/latest)から `AppDock.at365.exe` をダウンロードし、書き込み可能な好きなフォルダーへ置いて起動するだけです。

拡張機能（Applet）を同梱した `AppDock.at365-all-in-one-<バージョン>.zip` も利用できます。ZIP全体を展開し、中の `AppDock.at365.exe` を起動してください。

## ビルド方法

Windows x64と.NET 10 SDKを用意し、リポジトリのルートで実行します。Node・pnpmはプロジェクト内へ準備されます。

```powershell
.\setup-tools.bat
.\dev.bat install --frozen-lockfile
.\publish.bat
```

出力先は `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe` です。詳しい手順と機能・操作・設定の文書は[開発ガイド](DEVELOPMENT.md)を参照してください。
