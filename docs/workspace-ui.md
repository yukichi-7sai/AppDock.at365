# 本体の画面構成

リボン、タイトルバー、ステータスバー、通知バナー、デスクトップ通知は本体rendererが描画する。mainは状態・操作・表示寿命を所有する。画像ライブラリー、通知センター、ログ、設定は本体のReactツリーを使う。

## 配置とビルド

- `src/renderer/workspace/`: リボン・一時グループ・バー・通知カードの画面。
- `src/renderer/notifications/`: 通知センターとカードで共用する閉じるボタン・配色。
- `src/main/core/ribbon-host.ts`、`window-bar-host.ts`、`notification-surface-host.ts`: 本体に同梱したHTMLだけを読み込むView管理。
- `src/shared/workspace-ui.ts`、`window-bars.ts`、`overlays.ts`: mainと専用preload/rendererの内部型。

Viteの本体ビルドで`out/renderer/workspace`を生成し、app.asarへ収録する。別のmanifest、worker、Applet登録、Shellビルド、更新単位は設けない。旧`out/shells`は配布対象から除外する。

Appletのnative Viewとの重なり順、フォーカス、ドラッグ領域を保つため、リボンとバーは独立WebContentsViewを使う。デスクトップ通知は本体Windowを隠していても表示できる専用Windowを維持する。rendererへの移動は描画コードの所有・配置の変更であり、全画面を一つのDOMにするものではない。

ステータスバーの左端には共通ジョブ基盤の進行中・終了済み件数と、該当時の要対処件数を表示する。詳細な集計・削除契約は[バックグラウンドジョブ](background-jobs-design.md)を参照する。既存の実行中Applet数・版・更新操作はその右に並べる。

## 起動と境界

本体の初期本文とリボン・両バーのreadyを確認してウィンドウを表示し、その後に通常Appletを開始する。各Viewはsandbox/contextIsolationを使用し、登録済みWebContents・main frame・URL・session・readyと操作可否をmainで照合する。専用bridgeは本体の画面だけに渡し、Applet向け公開APIにはしない。

リボンとバーの読込失敗・応答不能はログとネイティブの再試行/終了操作へ接続する。通知の失敗は再帰通知を作らず配送失敗とログで扱う。再起動で画面を作り直す。パレットの1回だけの復旧は[オーバーレイ](workspace-overlays.md)を参照する。

## 廃止したShell機構

Shellの選択・差し替え、`service.shell`、`context.shell` / `.NET context.Shell`、`host.shell.getState` / `shell.changed`、Default Shell Appletを廃止する。`--safe-shell`による表示切替や`shell-failures.json`の新規作成も行わない。

旧`host.shellProvider` / `host.shellProviders`は読込時に無視し、正規化後の設定・UI・公開schemaへ含めない。リボン、通知、Appletの通常設定を移動・初期化しない。既存の故障記録やAppletファイルをこの移行のために削除しない。

旧manifestの`shell`とcapabilityは無視してHTMLを読み込まない。`shellRequirement`付きコマンドは実行不可とし、登録や別名で条件を解除できない。その他のコマンド・設定・ページ・通知APIは維持する。旧Shell APIを直接呼ぶAppletは改修が必要で、Shell表示への互換動作は提供しない。

## 検証の担当

`workspace-ui-test.cjs`は旧設定からの起動、通常Applet、専用コマンド拒否、描画と再起動保存を担当する。バーは`shell-bars-ui-test.cjs`と`statusbar-visibility-checks.cjs`、リボンは`ribbon-groups/hover/customization-ui-test.cjs`、通知は`notification-center/desktop/settings-ui-test.cjs`が担当する。

提供元選択・フォールバック・safe-shell専用の試験とShellProbe fixtureは廃止する。残る操作契約は`startup-order.test.cjs`、`core.test.cjs`、`settings-service-targets.test.cjs`、`overlay-host.test.cjs`、`command-palette.test.cjs`、上記GUI試験および`command-links-ui-test.cjs`で確認する。実測・未確認事項は[検証記録](../VERIFICATION.md)へ記録する。
