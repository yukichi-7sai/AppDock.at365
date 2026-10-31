# 本体のページ表示

画像ライブラリー・通知センター・ログはAppDock本体rendererで描画する。ページのShell提供・割り当て・別WebContentsView・ready待ち・故障時の差し替えは設けない。設定は[設定基盤](settings-foundation.md)、通常Appletのページは[Appletページ](applet-pages.md)を参照する。

## 起動と戻り先

通常起動は「設定 → 一般 → ウィンドウ」先頭の「スタートページ」を表示する。`host.startPage`はPC専用設定で、既定値`about`は「AppDockについて」、Appletページは安定した`page:<Applet ID>:<ページID>`を保存する。候補は有効なAppletの固定・動的・設定由来ページのうち、保存済みの表示先、ページ定義の既定値、省略時`page`の順で解決した実効表示先が本体内のもの。WebAppletの追加ページも含む。表示名は「Applet名 / ページ名」とし、選択時は保存のみ行い次の通常起動へ適用する。

起動先のAppletが遅延開始・起動中の場合は待機表示を出し、通常の起動順と遅延設定を維持する。動的ページの不存在は提供元の起動完了後に判断する。利用者が別ページを選ぶと待機・読み込み中の自動表示を取り消し、トレイへの収納や最小化を自動表示の完了時に解除しない。ページ表示は既存の共通Surfaceを使用し、起動先の選択で無効Appletを有効化したりコマンドを実行したりしない。

選択先が未導入・無効・停止・起動失敗・ページ削除・別ウィンドウ表示の場合は「AppDockについて」へ戻す。選択値は保存したまま、設定欄に利用不可として表示する。復旧の戻り先は`src/shared/navigation.ts`の`defaultNavigation`に集約する。ホーム画面・代替Applet・ダッシュボード用APIは提供せず、ピン留めはコマンドパレットで引き続き使用する。

起動は「Default Shellと選択中の有効なShell提供Appletを準備 → 本体の初期画面とタイトルバー・リボン・ステータスバーの準備を確認して表示 → 残りのAppletを起動」の順に進める。先行対象は既存manifestの`capabilities: ["shell"]`・`shell`宣言と`host.shellProviders`から求め、専用フラグを追加しない。複数領域の同じ提供元を重複起動せず、未選択・無効・未提供のAppletを先行対象へ含めない。`--safe-shell`ではDefault Shellだけを先行する。

画面を開ける段階を`HostSnapshot.uiReady`、通常Appletの初期起動・遅延開始の予約が済んだ段階を`startupReady`で分ける。初期設定の補完やApplet自身の設定保存からreconcileが起きた場合も、表示前は通常Appletを開始しない。本体rendererの初期本文と表示用Shellのreadyを待ち、最大30秒で準備確認できなければログへ残して表示・起動を続行する。起動完了後はこの初期確認を繰り返さない。準備中の設定ページの補助操作は`startupReady`まで待ち、Aboutの自動更新確認などを準備中エラーにしない。

起動遅延は引き続き尊重する。指定Shellが開始待ち・無効・未導入・故障の場合は既存のDefault Shellへの復旧を使用し、遅延した指定先が利用可能になれば通常の切り替えを適用する。トレイ起動は本体を表示せずに同じ準備を行い、起動後に利用者が隠した画面を完了時に再表示しない。残りのAppletは従来の順番で起動し、保存順の変更や並列化は行わない。

更新・本体の再起動は`--restore-view`によるページと設定カテゴリの復元を維持する。復元対象が廃止・不正なページ、未導入・無効・起動失敗したAppletの場合は既定の表示先へ戻す。選択中のAppletページを停止・破棄した場合も同じ戻り先を使う。終了中の画面回収で復元先を上書きせず、トレイへの収納から開き直すときは現在のページを保つ。

Appletページの復元中は本体を先に表示し、待機表示を出す。`startupReady`と提供元のrunningを確認してから元のページを開き、準備前に利用不可として既定画面へ戻さない。

保存済みのリボンID`home`は欠落項目として保持し、実リボンへ表示しない。入力条件の`host:home`は「廃止: ホーム」として保持し、新規候補・実際のページ判定へ含めない。他のページ条件への変換や、設定ファイルの自動削除は行わない。

## 責務と共通部品

本体の起動区間・処理回数・データ量は「AppDockについて」で確認できる。起点・表示イベント・初期化完了・比較時の範囲は[本体の起動計測](host-startup-timing.md)を参照する。

| 部分 | 責務 |
| --- | --- |
| HostPages | 本体ページの現在の接続・route・要求ID・操作受付・破棄 |
| HostPageSlot | 本体document内のページ描画、初回モデルと変更購読、古いrevisionの破棄 |
| LogPageSession / HostLog | 対象・検索・レベル・表示モデル、ログの記録と保存 |
| ImageLibraryPageSession / ImageLibraryPageState | 検索・グループ・選択・閲覧位置・登録ジョブと操作の検証 |
| NotificationCenterController / NotificationService | アクティブ通知と安全な履歴、検索・ページング・実行の検証 |

描画はsrc/renderer/pagesのLogPage、ImageLibraryPage、NotificationCenterPageに置く。カード・画像ギャラリー・入力・ダイアログは共通部品を利用し、部品の再利用だけを理由にShell領域を作らない。配色は共通preload、キーボードとTab順は本体documentの経路を使う。

## 内部bridgeと寿命

src/shared/host-pages.tsが本体専用の要求・モデル・操作型を定義し、window.dock.pagesのopen/get/act/close/onChangedで本体mainへ接続する。Shell/Applet/リモートページへ公開しない。IPCは本体documentのmain frameとURLを検証する。

購読後に初回モデルを取得する。本体UIの準備完了（`uiReady`）までは本文を描画せず、準備中の要求は同じ接続で初回モデルの通知を待つ。通常Appletの初期起動完了まで本文の取得を待たせない。同じ要求IDで内容を更新し、別ID・route変更・renderer再読込・終了では旧Controllerを破棄する。古いモデル・操作・close要求が新しいページへ作用しないようIDを照合する。本文の寸法報告やフォーカスのIPC境界は不要であり、flex/min-height/overflowで残りの本文領域を割り当てる。

本体ダイアログまたは共通オーバーレイの表示中はページの変更操作を拒否する。画像取得と、表示中セッションに属する画像ID・有限offsetの最終スクロール記録だけは継続できる。画像プレビュー・グループ編集は本体の共通ダイアログを使い、背景クリック・Escape・フォーカス復帰を共通管理する。

## ページ別の表示・操作

- ログは起動後の直近500件、source・種類・レベル・文字検索、保存先を開く操作を持つ。初期表示・debugと監査の分類・記録と表示の関係は[ログ仕様](logging.md)を正本とする。Applet管理からは全体ログへsourceを指定して移動し、解除して全体へ戻れる。source更新時も他の検索条件を保つ。
- 画像ライブラリーは[共通ギャラリー](image-gallery.md)を使い、検索・選択・カード幅・閲覧位置を保つ。原画像・グループ・利用先参照の保存契約は[登録画像](registered-images.md)を参照する。
- 通知センターは[通知基盤](notifications.md)のアクティブ表示・起動中だけの安全な履歴・検索・操作を使う。通知バナーとデスクトップ通知のShellは独立して継続する。

ページの外側はスクロールせず、ログは表、画像はギャラリー、通知は一覧をスクロールさせる。狭幅や低い高さでも操作へ到達できるようにする。見出し・検索・カード等のスタイルは各ページ内へ限定し、設定や他ページのCSSを上書きしない。

## 保存済み指定と検証

旧ページShellの割り当ては保存したまま使わず、選択UI・状態取得・起動・再試行へ含めない。設定・画像・グループ・通知履歴の自動変換・削除は行わない。既存の追加Shellによるページの差し替えは提供しない。

tests/host-pages.test.cjsとlog-page/image-gallery/notification-centerの単体回帰、scripts/host-pages-ui-test.cjs・image-gallery-ui-test.cjs・image-library-session-ui-test.cjs・notification-center-ui-test.cjsを使用する。固定EXEで3ページが本体documentに表示されること、起動・復元・戻り先、旧指定が不活性なこと、テーマ・サイズ・zoom・フォーカス・ダイアログ・通常Appletとの合成を確認する。検証結果はVERIFICATIONへ記録する。
