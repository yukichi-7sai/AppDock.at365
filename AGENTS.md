# AppDockの作業ルール

A:配下では[A:の共通指示](../AGENTS.md)と[30.PROJECTの共通指示](../AGENTS.md)を読む。このファイルはAppDock全体に適用する。兄弟Appletの変更では、そのrepoの指示も確認する。

## 文書と作業範囲

- 現行仕様は現在のコードと[開発ガイド](DEVELOPMENT.md)から参照する機能別文書を正本とする。導入版ごとの説明を現行文書へ積み重ねない。実測・未確認事項・成果物のhashはVERIFICATIONへ記録し、過去の成功を現在の動作確認とみなさない。
- READMEはインストール方法とビルド方法だけとし、機能・操作・設定・既定値などは開発文書へ置く。入口と検証記録の分担は[文書方針](docs/documentation.md)に従う。共通仕様を各Appletへ複製せず、変更時は参照先・関連する型・試験を整合させる。
- 設定は[設定基盤](docs/settings-foundation.md)と[本体統合](docs/settings-foundation.md)を正本とする。全体設定とApplet詳細は本体rendererで共用し、設定をShell差し替え領域へ戻さない。

## 実装と配布

- [実装・コミット・リリースの共通手順](docs/development-workflow.md)に従う。実装時は変更に必要な検証・発行前のレビュー1回と必要な修正・再検証・対象モジュールの版更新・各40.ARTIFACT配下への発行まで。破壊的変更、設定項目の追加・削除、保存ファイルの追加・削除はマイナーを1つ増やしてパッチを0にする。通常の実装・修正は発行のたびにパッチを1つ増やし、同じ機能の未コミット・未公開変更への追加修正にも適用する。判定と新たな実装・修正を伴わない再発行の扱いは共通手順に従う。文書のみの変更は製品の版更新・発行を行わない。
- コミット依頼時は実装時の成功結果を試験ごとに照合して原則再利用する。未実行・失敗・後続変更の影響がある試験、記録不足の試験だけを実行し、必要回帰の成功が揃ってからコミットする。製品修正時はpublishも更新する。push・公開・実利用先deployは各依頼の範囲に従う。
- 通常publishは本体単一EXEとupdate.json、変更Appletは自身のupdate.zip/update.jsonを生成する。未変更Appletの再発行・全体ZIP作成・旧ZIP整理を通常publishへ含めない。終了コード、版、成果物、固定EXEの隔離起動を確認する。
- Release依頼では[リリース手順](docs/RELEASING.md)を読み、本体と同梱Appletの未公開版を確認する。公開済み同版は上書き・再作成しない。公開後検証に成功した対象repoごとに最新3件の公開Releaseを保持し、draft・Gitタグ・履歴・無関係repoを保持する。全体ZIPの準備と整理は[オールインワン](docs/all-in-one.md)に従う。
- deploy先への旧EXEの別フォルダー退避は追加しない。配置hashと利用者データ保持は確認する。この扱いを自己更新helperの復旧用backupへ流用しない。
- 開発生成物はrepo直下の.artifacts。完了時の整理は[テストフォルダー整理](DEVELOPMENT.md#作業完了時のテストフォルダー整理)に従い、終了・成功を確認した種類ごとの直近3回を残す。実行中・状態不明・失敗未解決・固定出力・再利用資料を削除しない。同期・バックアップ・スナップショットの設定は利用者が管理する。

## ツールとWindows検証

- Node/pnpmはtoolchain.jsonに従うプロジェクト内の.toolsをdev.bat経由で使用する。グローバル導入はしない。依存・ツールの公開後7日待機、完全版指定の例外、Node LTSの固定は[依存方針](DEVELOPMENT.md#依存とツールの公開後待機)に従う。pnpmのshim生成とElectron取得を含め、更新時は初回setupと再実行も確認する。
- node_modulesをjunction共有したworktreeで依存をインストールしない。依存更新用checkoutは独立node_modulesを使い、整理前後は元checkoutへの参照と動作を確認する。
- GUI試験は直列・隔離profileで行う。build-main.cjsはout/mainを再生成するため、GUI起動中・再起動中にビルドを重ねない。発行後は固定配布物を使い、コピーと最終EXEのSHA256を照合する。
- 単一EXEのportable展開mutex・lease・子プロセス寿命・hProc形式のHANDLE変換・安定したTray識別を維持する。electron-builder更新時は独自templateの連携と実EXEの更新・再起動・同時起動・異常終了を確認する。設定・data・認証と展開物の寿命を混ぜない。
- .NET SDK/Runtime・接続契約を変えたらnative AppletもRelease buildし、接続・停止・表示・保存を確認する。runtimeconfig欠落は発行元・EXE内・展開先を比較する。
- PowerShell 5.1用PS1はUTF-8 BOM/CRLF、BATはCP932/CRLFを保つ。File.Replaceへnull backupを渡す場合はNullString.Valueを使う。GitHub CLIのPATH・認証・実行権限はその環境で確認する。
- 権限不足の切り分けと再実行は[制限付き実行環境](docs/development-workflow.md#制限付き実行環境)に従う。無関係アプリの停止や、検査・セキュリティ機構の無効化で成功扱いにしない。

## Shellと画面

- アクセント色は[共通配色](docs/appearance.md)を正本とする。新しい本体/Shell/Appletのローカル画面は共通preloadの配色変数を参照し、画面ごとにパレットや同名変数を定義しない。専用preload追加時は共通配色の同梱・URL登録・明暗テーマの検証も接続する。

- [Shell基盤](docs/shell-foundation.md)に従い、本体は状態・操作・表示寿命、Default Shell/Shell AppletはShell対象領域の描画を所有する。メイン画面の枠組み・ホーム・画像ライブラリー・通知センター・ログ・設定は本体rendererが共通UI部品で描画し、ページ用Shell機構を設けない。Shell対象は既存7領域に限定し、新しい領域のShell化は個別に依頼された場合だけ行う。両Shellは同じ公開API/実行経路を使い、相互の内部import・Default Shell専用API・本体側の復旧用重複描画を作らない。
- Default Shellは本体repo内で同時ビルドし単一EXEへ同梱する。追加のShell Appletは独立repo。提供領域だけを差し替え、未提供・故障領域はDefault Shellへ戻す。内容ControllerとViewの寿命を分離する。
- [リボン](docs/shell-api.md)、[共通オーバーレイ](docs/shell-overlays.md)の公開契約を使う。本体ページは[本体のページ表示](docs/host-pages.md)に従う。Shell領域を追加する個別依頼ではモデルと操作を定義し、Shell Hostへ内容固有の判断を混ぜない。一般Appletの複数Window/同一領域の同時多重表示は未実装。独立デスクトップ通知は通知基盤専用Windowとして共通通知Surface契約を使う。
- Applet管理は本体の設定一覧へ集約し、説明・詳細タブを再導入しない。設定・ショートカット・ジェスチャー・ログは共通画面へ移動し、入力設定は提供元ID、ログは解除可能なsourceで絞る。WebApplet本体を含め、collectionの子ページをパッケージ一覧へ含めない。[管理仕様](docs/applet-management-settings-design.md)を参照する。
- 設定は[設定基盤](docs/settings-foundation.md)の確定後の即時保存を正本とする。文字・数値・URL・JSONは共通入力部品でblur/Enter確定・Escape取消、複数行はShift+Enter改行とし、IME操作を優先する。SettingsInputSessionは受付調整のみ。本体の入力キュー、ページ投影/外部競合/原子的保存を維持し、不正入力と失敗値は現在のUIだけに保持する。dirty・共有ドラフト・全体保存/破棄・未保存通知を再導入しない。
- 関連する複数項目からなる登録の一覧編集は、[一覧形式の設定編集UI](docs/settings-list-editing.md)に従い、AI接続の一覧＋共通ダイアログを基本とする。追加／編集の一時入力はダイアログ内だけに保持し、OKで登録単位に保存する。削除確認・並べ替え・入力確定・フォーカス復帰を揃え、既存機能固有の操作契約は保持する。
- Applet設定は管理一覧と設定ページの左インデックスを入口とし、同じ本体の設定本文と編集状態を共用する。横断検索は左だけに結果を表示し、右本文はページ全体を保つ。Applet本文内のローカル検索を追加しない。
- 更新・通常再起動は--restore-viewと画面選択を復元し、終了中のselected(null)でホームへ上書きしない。Appletの復元はstartupReadyと対象runningを待つ。

## 共通APIと設定保存

- 音声再生を追加・変更するときは[共通音声再生API](docs/audio-playback.md)を使う。読み上げ・通知音・試聴は本体の単一audioPlaybackへ集約し、Node Appletはhost.audio.playを入口とする。独自プレイヤー・別キュー・ビープへの代替を追加しない。音声生成、再生待ち、開始・取消・終了を区別する。

- [共通操作API](docs/appdock-api.md)と[外部操作](docs/automation.md)を正本とする。単一AppDockApiと操作カタログを共有し、callers・permissions・schemaで公開先/許可/入力を管理する。MCPとAppletのPC専用許可を分ける。
- 外部コマンド公開はApplet自身のmanifest宣言に従う。本体へApplet固有の許可一覧を置かず、IDの接頭辞・別名・runtime登録から公開権限を推測しない。停止中の自動有効化を避け、設定変更とコマンド実行を分離する。
- 自己設定APIのcapability・非公開キー・activate中の契約を保持し、SettingsCommandsへ接続する。外部更新のexpectedRevision・dryRun・原子的保存・公開項目制限を維持する。再入のBUSY/SELF_CALLとNode/.NETの対応を確認する。
- MCPはlocalhostのHost/Origin/token検査と登録TOMLの所有範囲を維持する。監査ログに引数・認証・生の例外を追加しない。受付・保存完了・OS登録・対象アプリでの効果確認を区別する。
- 操作許可のUIは専用カテゴリへ集約し、Applet/MCPの独立した列、PC専用保存と共有設定の独立性を維持する。前提不足でも保存済みON/OFFを保ち、他の許可を自動変更しない。
- 処理の最終失敗は[共通のエラー通知とログ](docs/error-reporting.md)に従い、本体のErrorReporterへ接続する。機能別のエラー通知種類を増やさず、「エラー通知」の設定を使う。安全な原因と対処を通知・ログ・結果に揃え、重複、取消の誤通知、秘密値の混入、通知障害の再帰を防ぐ。入力中の検証エラーと各機能の適用範囲は同文書の区分に従う。
- 確認・対処が必要な状態は[共通の警告通知](docs/warning-notifications-design.md)に従い、WarningReporterへ接続する。閉じる・期限切れ・OFFを解消と扱わず、同じ状態の再通知を防ぐ。対象パス等のローカル診断情報を通知・履歴・読み上げへ混ぜず、状態詳細とログから確認できるようにする。
- Applet管理は共通AppletManagementへ集約する。enabledの保存と再起動を分け、無効Appletを再起動で有効化しない。設定アクションは自身の宣言済みコマンドに限定し、二重実行防止と保存済み入力を保つ。
- 保存場所と受信・復旧は[設定同期](docs/settings-sync.md)に従う。ログは共通Host APIを使い、停止処理中はhost.logだけを受け付ける。停止完了後・異常終了後の要求や停止中の他APIを許可しない。

## 入力とトレイ

- ジェスチャーから本体を開くコマンドは共通`showWindow(invocation)`へ入力元を渡し、InputHostの表示前準備・表示後の前面化を使う。開始元・生存session・本体所有HWND・1回限りの制約と、前面移動後の後続コマンド停止を保つ。新しい入口も[ジェスチャーの前面化](docs/gestures.md#本体を開くコマンドの前面化)に従う。

- [条件付きショートカット](docs/keybindings.md)と[ジェスチャー](docs/gestures.md)を正本とする。本体・ローカルUI・Web・Windows入力は共通resolver/dispatcherへ接続し、押下時の条件、保存順、同一コマンド1回、再入防止・取消を維持する。
- Applet条件は実Windowフォーカスと表示Surfaceで判定する。ownerはコマンド登録元IDを使い、ID接頭辞で推測しない。新規Applet割当はowner、本体/不明はapp。manifestの初期値は初回だけ適用し、解除した行を再生成しない。
- 一覧は全コマンドの平坦な表示とし、全体設定ではコマンド・割り当て・移動の3列を使う。共通アイコンでコマンド別の設定へ移動し、安定IDで絞り込む。表示順を実行順に流用せず、追加後の検索・スクロールを保持する。編集・順序パネルの一時入力は適用時に即時保存し、外部更新との競合を検査する。削除は確認なしで即時保存する。
- 正常なWindows登録状態を行に表示せず、記録中の一時解除と実登録エラーを区別する。エラーの表示キャッシュをbackendやdraftへ戻さない。
- ジェスチャーは本体InputHostが管理し、Appletへ二重フックを持たせない。開始HWND、1/2段階移動の完全一致・3方向目の取消、右クリック復元、捕捉キーの解放、ホイール積算/破棄、対象変更取消を実入力で確認する。移動の追加時は共有カタログ・設定GUI/API・並べ替え・待機表示・解放時の判定をそろえる。連続操作への固定待機は加えず、再入防止は維持する。
- トレイは[専用仕様](docs/tray-menu.md)。メニュー外の固定設定/終了、未知コマンドと配置、空配列、グループ解除時の子、単/ダブルクリック独立割当を維持する。外部編集は各専用コマンドと許可・共通revisionへ接続し、保存時に割当操作を実行しない。

## WebとApplet

- [WebApplet](docs/web-applets.md)と[WebアカウントAPI](docs/web-accounts.md)の保存領域・認証・表示寿命を区別する。リモートページへpreload/Node/ホストIPCを渡さない。提供JSONは検証した初期値だけを取り込み、手動変更・権限を上書きしない。
- アカウントグループの共有名簿・PC専用session・Applet別設定は[グループ設計](docs/web-accounts.md)に従う。グループ未宣言の専用枠とWebApplet枠は分離を継続し、同一グループを宣言したAppletだけが共用する。
- WebAppletの追加/削除/初期ショートカットは独立したApplet.WebApplet.at365の管理画面と本体の宣言型一覧設定から操作する。一覧は共通部品を使い、追加/編集はダイアログで確定する。個別サイトは汎用pageCollectionsとしてID・設定・リボンを保持し、親Appletだけをruntimeと更新対象にする。公開設定・コマンドは提供元の宣言に従う。
- Webアカウントは別ファイルへ即時保存する。名前のblur/Enter確定・Escape取消・IME/重複送信防止、削除/クリアの警告と参照中ガードを維持する。削除待ちsessionは検証済み専用root内で次回起動時に回収し、Gmail・別枠・外部リンク先を削除しない。
- 表示先切替でWebContents/session/入力を再生成しない。非選択/非表示でも背景描画を維持する。rAF・visibilityState・observer.readyやPlaywrightのfocus emulationだけで実受信成功と扱わず、通常起動の描画/取得を確認する。
- keepActiveの遷移/破棄時解除、native focusの優先、Debugger接続の冪等回収を維持する。WebContentsViewを含む画面は親WindowのcapturePageだけで表示確認を完了扱いにしない。
- 無効Appletは実リボンから除外し、設定カタログと保存配置は保持する。再開時の元の配置と、有効Appletの開始待ち/エラー/再試行を維持する。
- 新規Appletは30.PROJECT直下の独立repoにextension.jsonとpublish.batを置き、一意IDを使う。共通API・保存・配布は[Appletガイド](docs/applet-development.md)に従い、本体へ固定のApplet一覧を追加しない。共通pack-applet-update.ps1で個別更新物を作る。
