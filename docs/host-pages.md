# 本体のページ表示

画像ライブラリー・通知センター・ログはAppDock本体rendererで描画する。ページのShell提供・割り当て・別WebContentsView・ready待ち・故障時の差し替えは設けない。設定は[設定基盤](settings-foundation.md)、通常Appletのページは[Appletページ](applet-pages.md)を参照する。

## 起動と戻り先

通常起動は設定の「AppDockについて」を表示する。既定の表示先は`src/shared/navigation.ts`の`defaultNavigation`に集約し、起動先を選択する設定は設けない。ホーム画面と専用の表示・実行処理は提供せず、代替Appletやダッシュボード用APIも追加しない。ピン留めはコマンドパレットで引き続き使用する。

更新・本体の再起動は`--restore-view`によるページと設定カテゴリの復元を維持する。復元対象が廃止・不正なページ、未導入・無効・起動失敗したAppletの場合は既定の表示先へ戻す。選択中のAppletページを停止・破棄した場合も同じ戻り先を使う。終了中の画面回収で復元先を上書きせず、トレイへの収納から開き直すときは現在のページを保つ。

保存済みのリボンID`home`は欠落項目として保持し、実リボンへ表示しない。入力条件の`host:home`は「廃止: ホーム」として保持し、新規候補・実際のページ判定へ含めない。他のページ条件への変換や、設定ファイルの自動削除は行わない。

## 責務と共通部品

| 部分 | 責務 |
| --- | --- |
| HostPages | 本体ページの現在の接続・route・要求ID・操作受付・破棄 |
| HostPageSlot | 本体document内のページ描画、初回モデルと変更購読、古いrevisionの破棄 |
| LogPageSession / HostLog | 対象・検索・レベル・表示モデル、ログの記録と保存 |
| ImageLibraryPageSession / ImageLibraryPageState | 検索・グループ・選択・閲覧位置・登録ジョブと操作の検証 |
| NotificationCenterController / NotificationService | アクティブ通知と安全な履歴、検索・ページング・既読・削除・実行の検証 |

描画はsrc/renderer/pagesのLogPage、ImageLibraryPage、NotificationCenterPageに置く。カード・画像ギャラリー・入力・ダイアログは共通部品を利用し、部品の再利用だけを理由にShell領域を作らない。配色は共通preload、キーボードとTab順は本体documentの経路を使う。

## 内部bridgeと寿命

src/shared/host-pages.tsが本体専用の要求・モデル・操作型を定義し、window.dock.pagesのopen/get/act/close/onChangedで本体mainへ接続する。Shell/Applet/リモートページへ公開しない。IPCは本体documentのmain frameとURLを検証する。

購読後に初回モデルを取得する。本体の起動準備完了までは本文を描画せず、準備中の要求は同じ接続で初回モデルの通知を待つ。同じ要求IDで内容を更新し、別ID・route変更・renderer再読込・終了では旧Controllerを破棄する。古いモデル・操作・close要求が新しいページへ作用しないようIDを照合する。本文の寸法報告やフォーカスのIPC境界は不要であり、flex/min-height/overflowで残りの本文領域を割り当てる。

本体ダイアログまたは共通オーバーレイの表示中はページの変更操作を拒否する。画像取得と、表示中セッションに属する画像ID・有限offsetの最終スクロール記録だけは継続できる。画像プレビュー・グループ編集は本体の共通ダイアログを使い、背景クリック・Escape・フォーカス復帰を共通管理する。

## ページ別の表示・操作

- ログは起動後の直近500件、source・レベル・文字検索、保存先を開く操作を維持する。ファイルは1MBでローテーションする。Applet管理からは全体ログへsourceを指定して移動し、解除して全体へ戻れる。source更新時も他の検索条件を保つ。
- 画像ライブラリーは[共通ギャラリー](image-gallery.md)を使い、検索・選択・カード幅・閲覧位置を保つ。原画像・グループ・利用先参照の保存契約は[登録画像](registered-images.md)を参照する。
- 通知センターは[通知基盤](notifications.md)のアクティブ表示・安全な履歴・検索・既読・削除・操作を使う。通知バナーとデスクトップ通知のShellは独立して継続する。

ページの外側はスクロールせず、ログは表、画像はギャラリー、通知は一覧をスクロールさせる。狭幅や低い高さでも操作へ到達できるようにする。見出し・検索・カード等のスタイルは各ページ内へ限定し、設定や他ページのCSSを上書きしない。

## 保存済み指定と検証

旧ページShellの割り当ては保存したまま使わず、選択UI・状態取得・起動・再試行へ含めない。設定・画像・グループ・通知履歴の自動変換・削除は行わない。既存の追加Shellによるページの差し替えは提供しない。

tests/host-pages.test.cjsとlog-page/image-gallery/notification-centerの単体回帰、scripts/host-pages-ui-test.cjs・image-gallery-ui-test.cjs・image-library-session-ui-test.cjs・notification-center-ui-test.cjsを使用する。固定EXEで3ページが本体documentに表示されること、起動・復元・戻り先、旧指定が不活性なこと、テーマ・サイズ・zoom・フォーカス・ダイアログ・通常Appletとの合成を確認する。検証結果はVERIFICATIONへ記録する。
