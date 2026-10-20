# Shell Hostの構成と拡張方針

Shell全領域のアクセント色は[共通配色](appearance.md)を参照する。共通preloadがテーマと選択パレットを適用するため、Shell側に別のパレットや固定のアクセント色を追加しない。

本体が状態・操作・表示領域を管理し、Default ShellとShell Appletが公開モデルを描画する。タイトルバー、ステータスバー、リボン、コマンドパレット、ホーム、画像ライブラリー、ログ、通知センター、通知バナー・デスクトップ通知はShellが描画する。未移行の本文と設定は本体rendererが描画する。実際の型は[src/shared/shell.ts](../src/shared/shell.ts)、[shell-bars.ts](../src/shared/shell-bars.ts)、[overlays.ts](../src/shared/overlays.ts)、[shell-pages.ts](../src/shared/shell-pages.ts)を正本とする。

## 用語と境界

| 名称 | 役割 |
| --- | --- |
| Default Shell | 本体repoのshells/defaultにある標準描画。通常時と復旧時に同じ実装を使用 |
| Shell Applet | 通常AppletにShell描画能力を追加した拡張。担当する領域だけを差し替える |
| Shell Host | 本体側のView起動・配置・切替・共通API・復旧を担当 |

Default Shellは本体と独立したrenderer成果物として同時ビルドし、単一EXEへ同梱する。追加Appletの独立repo規則はDefault Shellへ適用しない。出荷元以外の実行契約はShell Appletと共通にし、Default Shell専用APIや本体rendererの復旧用描画を作らない。

設定画面は本体rendererの共通画面で、Shellの提供元・復旧には依存しない。詳しくは[設定基盤](settings-foundation.md)を参照する。

本体はShellのReact実装をimportせず、Shellもsrc/main・src/rendererをimportしない。公開型・共通のアイコン素材・限定bridgeを使う。本体の汎用ローダーがmanifestと成果物を発見するための参照は、この描画依存禁止とは別である。

## 表示領域

| 領域 | 本体の内容管理 | 公開契約 |
| --- | --- | --- |
| titlebar / statusbar | WindowBarsと既存ウィンドウ・更新サービス | [タイトルバーとステータスバー](shell-bars.md) |
| ribbon | UiPresentationの表示モデル・操作ID・ナビゲーション | [Shell API](shell-api.md) |
| overlay.command-palette | CommandPaletteSessionとOverlayController | [部分Shellと共通オーバーレイ](shell-overlays.md) |
| page.home | HomePageSessionとShellPageController | [Shellのページ表示](shell-pages.md) |
| page.image-library | ImageLibraryPageSessionとWindow内の状態 | [共通ギャラリー](image-gallery.md) |
| page.logs | LogPageSessionとShellPageController | [Shellのページ表示](shell-pages.md) |
| page.notifications | NotificationCenterController | [通知基盤](notifications.md) |
| notification.desktop | NotificationServiceとNotificationDesktopHost/SurfaceController | [通知基盤](notifications.md) |
| notification.banner | NotificationServiceとNotificationSurfaceController | [通知基盤](notifications.md) |

割り当ては`host.shellProviders`の領域IDからApplet IDへのマップ。共通カタログの10領域ごとに1件指定でき、省略はDefault Shellです。`ShellProviderRegistry`が軽量なmanifest・有効状態・起動世代から提供元と理由を解決し、各HostがViewの接続状態を報告します。設定を保存しても指定Appletを有効化しません。表示コンテキストはprimary、通常本文の本体Windowは1つ、通知専用Windowはdesktop射影を表示します。未割り当ての有効Appletも通常のcommands/settings/pagesを利用できます。設定移行・切替・再試行・状態とコマンド条件は[領域別割り当て](shell-region-assignment.md)を参照してください。

Shell Hostは位置・zoom・ready・接続元・表示順序・フォーカス・破棄を扱い、検索や設定保存等の機能判断は内容Controllerへ置く。ページ、オーバーレイ、リボンの寿命を分離し、1つのViewの破棄で他領域やAppletの処理を止めない。

## 状態と操作

本体の機能サービスを正本とし、保存用データと描画用モデルを分ける。設定revisionと表示revisionも別とする。モデルは描画に必要な値・可否・操作ID・画像参照だけを含み、全設定、認証、任意コード、OSパスを渡さない。

Shellは購読を登録してから初回snapshotを取得し、以後は変更通知で追随する。古いsessionやrevisionの通知を無視し、Viewの再生成やページ再表示を状態同期として使わない。Shellの準備完了をApplet起動処理の必須条件にして循環を作らない。

操作は本体発行IDと現在の接続・利用可否を照合して実行する。描画側でIDから機能を推測せず、任意コマンド・任意パスの実行口を作らない。重複受付・完了・取消の意味は各公開契約に従う。保存完了やハンドラー応答を外部アプリでの効果確認と混同しない。

MCP/通常Applet向けの描画APIは[共通操作API](appdock-api.md)のcallers/permissionsを適用する。選択されたShellのローカルUI権限と外部操作権限を分ける。Appletの自己設定・自己登録コマンドAPIは既存所有範囲に限定する。

## 起動と復旧

Default Shellは復旧依存として本体が保証し、任意の無効指定や開始遅延を適用しない。出自は探索元から決定し、外部manifestによる予約ID偽装を受け付けない。workerの起動には通常のApplet管理・RPC経路を使い、Default Shell workerは復旧用に維持する。

Viewは領域単位で必要時に生成し、ready後に表示を切り替える。リボンの提供元切替、オーバーレイのモーダル寿命、ページのroute寿命はそれぞれのHostが管理する。ログの対象/検索やオーバーレイの処理状態を描画側へ複製しない。

失敗した領域はDefault Shellへ復帰する。選択設定を勝手に消さず、同じ故障版の無限再起動を避ける。失敗記録の保存期間・再試行条件は各領域の仕様に従う。--safe-shellは保存設定を初期化せず、Default Shellと既定の表示設定を使う。Default Shell自身の故障は最小ネイティブ通知と通常の更新/復元手段で対処し、本体へ第二の描画を持たせない。

## 新しい機能を追加する手順

1. 機能を持つ本体サービスまたはAppletと、状態の保存先を決める。
2. 操作ID、入力検証、公開先、許可、完了・取消の意味を定義する。
3. 描画モデルと更新条件を定義し、機能の判断をrendererへ持ち込まない。
4. 内容ControllerとShell描画を追加し、既存の領域Hostへ接続する。
5. 公開契約だけを使用するShell fixtureで表示・操作・未提供時復帰・故障を検証する。

ホバーや単純な描画状態まで本体へ集めない。保存が必要なデータ、処理の進捗、描画が終了しても保持すべき編集状態は機能サービスで所有する。新規機能のためだけにグローバルツールや依存を追加せず、[プロジェクトのtoolchain](../DEVELOPMENT.md#開発環境ビルドテスト)を使う。

## 後続計画

設定の左右領域とApplet詳細の設定本文は本体のSettingsPageを共用する。即時保存・検索・部分JSONは本体の設定基盤へ接続する。設定描画をShellへ移す後続計画は廃止した。

一般Appletの複数Window・同一領域の同時多重表示は未実装。通知専用Windowは共通通知射影へ限定し、Applet Surfaceを多重化しない。導入する場合はcontext/binding/sessionとWindow寿命を分け、同じ機能サービスを複数の読者から使う。Windowが閉じても共有Appletや他の読者を停止しない。単一WebContentsの二重表示を前提にせず、既存AppletSurfaceの全面的な多重化は別に設計する。

Applet一覧・詳細等の残りの画面、過去ログ/日付検索、内蔵会話UIはこの基盤だけでは提供しない。追加時に個別の目的と公開契約を決める。

## 検証

公開モデル・操作・入力検証・古い要求拒否はui-presentation、command-palette、home-page、log-pageの単体試験で確認する。内部import禁止はtests/shell-boundaries.test.cjsで確認する。

scripts/shell-host-ui-test.cjs、shell-overlay-ui-test.cjs、shell-page-ui-test.cjs、shell-home-ui-test.cjsで領域ごとの切替/未提供/ready期限/故障/safe起動、両テーマ、サイズ/zoom、フォーカス、既存ページとの合成を検証する。既存navigation・設定通知・リボンの回帰も変更範囲に含める。GUIは直列・隔離profileで行い、本体とDefault Shellを含む固定単一EXEでも確認する。

scripts/shell-metrics.cjsは比較する固定配布物を指定し、起動時間・メモリ・待機CPUを測定する。Viewや購読の増加、未表示領域の不要起動を確認する。実測・未確認条件は[VERIFICATION](../VERIFICATION.md)へ記録する。
