# 検証記録

## 2026-10-19: ページ連携と壁紙履歴のコミット前確認（0.66.1 / 0.6.2）

- 本体の.NET/Nodeページ連携・画像配信・表示先切替と、WallpaperSlideshowの独立履歴・長パスPNG保存・60%プレビューを対象にレビューした。本体29ファイル、Applet21ファイルに範囲を限定し、先行する設計・実装をまとめて扱う。
- レビューで`test.pages-a/main`と`test.pages/a-main`のSession名が衝突することを旧固定EXEで再現した。localページのpartitionを既存の一意な`page:<owner>:<page>`キーへ変更。両Appletを同時に動かし、Session実体が別で、自身の画像は200・相手の画像は404になることを確認した。永続設定とWebアカウントの保存領域は変更しない。[レビュー](.artifacts/commit-validation-history-pages-20261019/review.md)。
- 型検査、本体/Default Shell build、既存と追加のDLL/native fixture build、関連16ファイルの **98/98、fail/skip 0** が成功。ソースと最終固定EXEの共通ページGUI各4群でDLL/native/Node・null/JSON・画像変更/解放・動的context・同一Viewと入力保持・説明への復帰・停止時回収・Session分離を確認した。既存ページGUI **7群** も成功し、Gmailの背景監視、page/window往復、設定入力、停止再開、Cookieと選択状態の再起動保持を含む。古いfixtureを現行のアカウント追加、バッジ付きリボン、PC専用の有効状態、実View配置の待機へ合わせた。途中の失敗記録は保持した。
- Appletの入力67件が0.6.2の検証時と一致し、C#34ファイルに基づく標準8群、native RPC/起動smoke、1000件の分割取得、モニター一覧GUI、配置fixtureをログ・資産hashと照合して再利用した。最終本体EXEの履歴GUI **7群** は改めて成功。260文字超のPNGの実decode、60%寸法、内部クリック/ドラッグと背景/Esc、フォーカス復帰、削除fake、MCP8設定、狭幅と表示先往復を確認した。
- 同じ未公開変更の補正として本体0.66.1を再発行した。EXEは **168925267 bytes / SHA256 f4f39cace6652da0d921bea0eb30cc9ddd434a4482f8dc870cc764d62371a4dc**。EXE/feedと実行中のDefault Shellは0.66.1で一致。Applet0.6.2は再発行せず、EXE/manifest/web・更新ZIPの全5件と既存運用スクリプト6件のhash一致を確認した。
- 最終入力671+67件、ログ、再利用理由、固定EXE、GUI結果は[検証資料](.artifacts/commit-validation-history-pages-20261019/validation.json)に保存。stage/commit tree・名義・GitHub/AQUA両mainの照合は同フォルダーの`staged.json`・`commits.json`・`push.json`へ記録する。実装時の画像/プレビュー表示は利用者確認済み。fixtureは一時画像とfakeを使い、実NAS・壁紙/Explorer・関連付け・ごみ箱の成功へ読み替えない。Release・全体ZIP作成・実利用先deployは対象外。

## 2026-10-19: .NET HTML/JavaScriptページ連携（0.66.1）

- .NET DLL/nativeの`IPageActionHandler`、型付きページサービス、ページ変更通知、説明パネルから独立した画像登録・配信・回収、自身の説明へ戻るAPIを実装した。Nodeにも同じ新APIを接続し、[共通契約](docs/dotnet-applet-pages-design.md)と開発資料を更新した。既存SDK実装向けに追加サービスメソッドは既定実装を持つ。永続設定・画像登録ファイルや保存済み割り当ての移行は追加しない。
- 発行前レビューで実行ロック・取消・512KiB結果上限、runtime世代、画像の実パス・形式・寸法・件数上限、所属SessionとViewの寿命を確認した。GUIで判明したpage→window→page復帰時の二重navigateとviewport更新不足を修正し、同じView・入力を保った往復を再確認した。Applet側はViewへの画像登録失敗でworkerの残りを停止し、遅延終了後の空フォルダーも回収する。レビュー正本は[review.md](.artifacts/dotnet-pages-20261019/review.md)。
- 型検査、.NET Release build、本体/Default Shell buildが成功。ページ・動的登録・既存パネル画像・navigation・DLL/native RPCの関連6ファイル **25/25、fail/skip 0** が成功。停止中取消、null/JSON、大きすぎる結果と処理失敗後の生存を含む。WallpaperSlideshowの標準8群、RPC、1000件・長いパスの32分割、WM_ENDSESSIONの隔離fixtureも成功した。
- DLL/native/Nodeの実ローカルページをソース起動と最終固定EXEで確認した。画像のdecode・変更イベント、別ページURL拒否とrelease/停止後404、動的context・破棄・入力保持、自身の説明表示が成功。最終profileは`.artifacts/dotnet-pages-ui-1792415346517/`。固定EXEのSHA256は`b46c3d1bcd4f907d33afa3eaf813d5bd6e692c251c22ca24249fec31c692adba`、実行中の本体と同梱Default Shellはともに0.66.1。
- 既定`publish.bat`で本体0.66.1と変更したWallpaperSlideshow 0.6.0だけを40.ARTIFACTへ発行した。EXE/feedの版・size・SHA256、Applet更新ZIPのEXE/manifest/web資産とソース、旧deploy互換入口・新テンプレートの隔離配置、設定/dataと既存運用スクリプトの保持を確認した。結果は[distribution.json](.artifacts/dotnet-pages-20261019/distribution.json)、各ログ・入力hash・GUI結果は[validation.json](.artifacts/dotnet-pages-20261019/validation.json)。
- 制限内の.NET build／Electron起動失敗は同じ処理を通常ユーザーで再実行した。固定lockfileのinstallは通常ユーザーで成功し、依存変更なし。初回のnative probeのUTF-8、GUI補助コードのCSP、既存設定試験の廃止ヘルパーと全体renderer再読込手順を修正した。失敗ログを保持し、後続の成功結果で確認する。GUIは直列で、最終GUI中の再ビルドなし。
- 壁紙とWindows画像関連付け／ごみ箱はfakeと一時画像で検証した。実Explorer・実ごみ箱・実関連付けの操作成功とは区別する。成功済み各種類の資料は3回以内、失敗・再利用証跡も保持した。commit・push・Release・実利用先deployは実施しない。

## 2026-10-19: .NET AppletのHTMLページ連携設計（設計のみ）

- [共通設計](docs/dotnet-applet-pages-design.md)を追加し、DEVELOPMENTへ入口を設けた。.NETのページサービス、`page.action`、ページ変更通知、説明パネルに依存しない画像配信、自身の説明画面へ戻るAPIを定義した。現行APIと提案APIを区別し、最初の利用先として[WallpaperSlideshowの履歴設計](../Applet.WallpaperSlideshow.at365/docs/history-page-design.md)を参照する。
- 開始時は両repoのmain・追跡先origin/main・作業ツリー／インデックス／未追跡がクリーン。両方の`pull --ff-only`は制限環境でDNS解決に失敗し、同一コマンドの通常ユーザー再実行でAlready up to dateを確認した。基点は本体`45f1228441af087bcf7997684ab53d613964c9b3`、Applet`47aae6924a7923f0793ea4b0ae7d103da4d22807`。
- ソースとの照合・自己レビューで、ローカルページ専用Sessionへの画像protocol登録、1MiBのRPC上限と分割、同一Appletの実行ロックと初回ロードの循環防止、予期しないView破棄時の参照失効と生成物回収の分担を明文化した。共通仕様は本体、画面・廃止コマンドはApplet側に分離した。
- 文書の相対リンク19件・指定アンカー1件・JSON部分例2件、未実装表示、相互参照、変更対象が文書6ファイルだけであることを検査し、成功した。結果・文書hash・ソース根拠は[文書検査資料](.artifacts/dotnet-pages-design-20261019/document-check.json)へ記録した。初回の検査スクリプトだけでGit出力の1文字をHEADと比較する問題があり、取り出しを修正して成功した。実際のHEADは変わっていない。C#例や提案APIのbuild・動作成功を意味しない。
- 製品ソース、現行0.66.0、発行物は変更しない。製品テスト・GUI・build・publish・commit・push・Release・実利用deployは未実施。実装時の検証条件は設計書へ記載した。

## 2026-10-19: リボン拡張とUI調整のコミット・push確認（0.66.0）

- 利用者の依頼により、リボン拡張・共通の色／アイコン選択・コマンド実行・右クリック・UI調整と文書・試験の32ファイルをコミットと通常pushの対象とした。mainの未コミット変更を保持してfetchし、GitHubとAQUAのmainが開始時HEAD `459b649`と一致することを確認した。設定済みの両push先を使い、stage・commit tree・実効作者・各remote先端との照合を[コミット検証資料](.artifacts/commit-validation-ribbon-20261019/validation.json)へ記録する。
- 実装時の関連13ファイル109件とUI調整時の設定2ファイル16件を入力と完全ログで照合して再利用した。設定ページ6件の重複を除くと14ファイル119件。追加した79ファイル550件と合わせ、標準93ファイル **669/669、fail/skip 0** が成功した。初回の追加回帰では新しい空の`buttons`／`separatorTitles`を未反映の期待値2件が失敗し、既存試験を現行仕様に合わせた後、79ファイルのコマンド全体を再実行して成功した。失敗ログを保持し、その中の部分成功は再利用していない。
- 最終EXEのSHA256と入力が一致するため、型検査・本体／Default Shell／native build、リボンGUI4群の成功を再利用した。共通コマンド選択部品を使うトレイGUI4群は同じ最終固定EXEで追加実行し、配置・編集・解除・明暗／幅・保存再起動が成功した。[トレイ結果](.artifacts/tray-menu-ui-1792410443554/result.json)。製品ソースを追加修正しておらず、版は0.66.0、発行EXEは **168,919,422 bytes／SHA256 595d99b6e92b775934b0de27a3939ae4d23f5b1c8a728a62b976624a694c9ded** を維持した。再発行・別Appletの変更・公開Release・実利用先deployは追加していない。
- 入力549件は既存テストの期待値修正だけを例外として照合し、生成物808件に回帰前後の変更なし。Node 24.21.0／pnpm 12.10.1／.NET SDK 10.0.402／Windows x64で実行した。コマンド・全ログ・hash・入力・再利用判断とstage後の照合を上記資料へ保存する。今回の専用GUIは終了を確認し、旧版・再利用・失敗／状態不明の資料を保持する。別PC・混在DPI・実利用先の追加検証は行っていない。

## 2026-10-19: リボン設定の項目順・見出し・カード階層の調整（0.66.0）

- コマンドボタンの追加・編集で「コマンド」を最上部へ、グループの追加・編集で色選択とプレビューを最下部へ移した。「動作設定」内の「クリック時の動作」を削除し、「右クリックのコマンド」を直接配置した。「動作設定」と「リボン編集」は設定本文のトップレベルに同じ階層のカードとして並べ、外側に共通の枠を重ねない。
- 発行前に項目の移動、フォームの分岐、既存のカード用CSS、検索アンカー・キーワードと文書をレビューし、指摘なし。最初の項目移動は逆移動後のSHA256が旧ソースと一致することも照合した。追加指定は`RibbonSettings`を共通の外枠から直接返し、既存のカード用スタイルを利用した。設定項目・保存形式・ファイル・公開APIの増減はなく、同じ未公開リボン拡張のUI補正として **0.66.0** を維持して再発行した。
- 型検査、本体・Default Shell・native build、設定検索・投影・JSON・保存・競合の関連2ファイル **16/16、fail/skip 0** が成功。最終固定EXEの既存リボンGUI **4群** も成功し、色の検証と取消、名前、コマンド選択・編集・実行、両グループ方式、右クリック、実再起動、利用不可と初期化を確認した。[最終GUI結果](.artifacts/ribbon-customization-ui-1792409691218/result.json)、[動作設定とカード階層](.artifacts/ribbon-customization-ui-1792409691218/behavior-settings.png)、[コマンドボタン編集](.artifacts/ribbon-customization-ui-1792409691218/command-button-editor.png)、[グループ編集](.artifacts/ribbon-customization-ui-1792409691218/group-editor.png)、[最小幅近傍](.artifacts/ribbon-customization-ui-1792409691218/ribbon-settings-narrow.png)を目視確認した。前工程の109件は未変更のリボン実行・設定等の証跡として保持し、今回の再実行や新EXEの確認とは区別する。標準全回帰・既存トレイGUI・独立smokeは追加実行していない。
- `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`を通常発行した。最終EXEは **0.66.0 / 168,919,422 bytes / SHA256 595d99b6e92b775934b0de27a3939ae4d23f5b1c8a728a62b976624a694c9ded**。EXE・feed・隔離コピーのsize/hash、本体・同梱Default Shellの版とmanifest hashを照合し、deploy関連3ファイルを保持した。編集順だけの中間発行・GUI成功後に追加指定を反映したため、中間EXEの結果は最終結果に流用していない。
- 入力549件は最終検証前後で一致し、生成物201件、コマンドと終了コード・完全ログ・レビュー・画像hash・発行物の照合を[今回の検証資料](.artifacts/ribbon-editor-order-20261019/validation.json)へ保存した。試験の専用プロセスは残存0件。今回の成功分は方式ごとの直近3回以内、旧版の再利用資料・失敗／状態不明を保持し、削除0件。依存・凍結lockfile・検査設定を保持した。実利用設定・認証、別PC・混在DPIの追加確認、commit・push・公開Release・実利用先deployは行っていない。

## 2026-10-19: リボン拡張の実装・通常発行（0.65.0 → 0.66.0）

- 第1段階0.65.0で共通の色選択、グループボタンの2px枠と同色の接続線、色なし、セパレーター名を追加し、第2段階0.66.0でコマンドボタン、共通の固定アイコン選択、最上部の独立した折りたたみ「動作設定」、右クリック割当を追加した。[拡張仕様](docs/ribbon-customization-design.md)と[2段階の計画](docs/ribbon-customization-implementation-plan.md)、README・公開契約を更新した。色なしは枠と線を消し、背景・アイコンはテーマを使う。登録画像の追加は後続の機能。
- 実装時の自己レビューで、初期化時のセパレーター名の回収、部分JSON・フォームへ新項目を投影する範囲、リボンから共通の選択パレットを開く接続、完了済みパレットの不要な取消、実行中の再入と遅延した操作の対象変更を確認・修正した。0.65.0の後の連続編集GUIで設定ページの投影不足を発見し、0.66.0で修正と往復試験を追加した。一時パネルの既存ページの利用可否更新は保持し、コマンド定義が変わったときは閉じる。GUIの保存後・ページ切替後は実描画を待ち、破棄済みパネルのDOMを確認し続けないよう試験を補正した。レビュー・入力hash・制限環境の失敗と再実行は[第1段階](.artifacts/ribbon-customization-20261019-stage1/validation.json)と[最終段階](.artifacts/ribbon-customization-20261019-stage2/validation.json)へ記録した。
- 型検査・本体／同梱Default Shell／native buildが成功。第1段階は関連8ファイル52/52、最終段階はコマンド・公開許可・設定同期・ページ投影・Shell境界を含む13ファイル **109/109、fail/skip 0**。実装段階の共通方針に従い、変更に無関係な標準全回帰は一律実行していない。固定lockfileの依存整合は通常ユーザー環境で成功し、依存版・lockfile・検査設定を変更していない。制限環境の依存確認の停止、設定同期のEPERM、Electron起動失敗は既存手順を同じ条件で通常ユーザー実行し、成功と失敗を分けた。
- 最終固定EXEでリボンGUI **4群**、共通の選択部品を使う既存トレイGUI **4群**、隔離smokeが成功。色・線・色なし・不正HEX・取消・名前、カードの順序と初期折りたたみ、コマンドの追加／編集／アイコンのみ／所属／本体・Applet・カスタムの実効果、両グループ方式、右クリック、実再起動、停止中の実行拒否、初期化で右クリック割当を保持することを確認した。実行回数の記録と専用の試験用プロセスを使い、保存・選択で実行しないことも検査した。[固定EXEのリボン結果](.artifacts/ribbon-customization-ui-1792405108930/result.json)、[トレイ結果](.artifacts/tray-menu-ui-1792405165102/result.json)、[smoke結果](.artifacts/smoke-1792405239712/smoke-result.json)。明暗と最小幅近傍の実描画を確認し、リボン試験の実ウィンドウ寸法は901×681。試験プロセスは終了し、失敗・旧版の再利用資料と状態不明資料は保持した。今回の成功分は方式ごとに直近3回以内、削除0件。
- `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`へ通常発行済み。最終版 **0.66.0 / 168,908,279 bytes / SHA256 e0d97e8c60d57fc5e08b1d81a6acd3bccd13976dcfd38190899cc48f5acbd17d**。EXE・update.json・隔離コピーのhashとサイズ、起動中の本体とEXE内のDefault Shellの0.66.0、同梱manifestのhashを照合した。GUI用fixtureは製品に同梱していない。実利用設定・認証・他Appletの製品コードを変更せず、新しい保存ファイルと設定移行を追加していない。実アカウント・実照明などの実効果、物理的な混在DPI・別PCは未確認。コミット・push・GitHub Release・実利用先deployは行っていない。

## 2026-10-19: リボン拡張の設計と2段階の実装計画

- [拡張設計](docs/ribbon-customization-design.md)と[実装計画](docs/ribbon-customization-implementation-plan.md)を追加した。第1段階を共通パレット・グループの枠と展開時の連結線・色なし・セパレーター名、第2段階をコマンドボタン・共通アイコン選択・独立した動作設定カード・右クリック割当とした。色なしで枠と線を消すこと、同色・同じ太さの接続、固定アイコンからの将来拡張、既存の保存・実行・公開契約を記載した。
- main `459b649`／0.64.0で開始時のbranch・追跡先・作業ツリーを確認し、追跡先からの`pull --ff-only`が更新なしで成功した。制限環境ではGitHubのDNS解決が失敗し、同一コマンドを通常ユーザー環境で再実行した。設計を自己レビューし、不正なHEX入力が残る間の確定抑止と、schema 1へ新しい表示情報を混入させない条件を追記した。追加・変更部分の相対リンク・アンカー、文書構造、JSON形式の検証記録、`git diff --check`を確認した。結果は[設計確認資料](.artifacts/ribbon-customization-design-20261019/validation.json)へ保存する。
- 今回は設計と計画の文書のみ。製品コード・設定・依存・版を変更しておらず、型検査・build・GUI試験・publish・commit・push・Release・実利用先deployは行っていない。実装と各段階の受け入れ試験は未着手であり、既存の試験成功を新機能の動作確認に流用していない。

## 2026-10-19: 共通ダイアログの追加手順とShell起点の文書化

- [一覧編集・ダイアログのガイド](docs/settings-list-editing.md)へ部品の選択表、`SettingsDialog`の使用例、Provider・一時入力・保存失敗・初期フォーカスと復帰、`SettingsModal`を直接使う際の責務を追記した。入力停止の`ready`と背景準備を区別し、native dialogの自動検知・共通CSS・背景Viewの登録条件を明記した。
- Shellのボタンから本体へ表示を依頼する手順、別WebContentsへのフォーカス移動、元のボタン／有効な戻り先、停止・提供元交代・route変更、実際の入口からの確認項目を追加した。現行の背景登録はリボン・両バーであり、Shell本文・Web／Applet本文・通知を残す場合には別途統合と確認が必要なこと、汎用の編集ダイアログ開始APIは未実装であることを明記した。リボン・バーの契約とDEVELOPMENTから参照する。
- 現ソースの部品・Provider・preload・HostModalLayer・各Shell Host／公開操作・ShellPageHostと記述を照合してレビューし、未解決の指摘なし。リンク、追加アンカー、使用例を既存rendererの型と固定TypeScript CLIで検査した。検証用コピーでは相対importだけを配置先に合わせ、製品ファイルを生成・変更していない。型APIを使う初回の補助検査は現行コンパイラーで非対応だったため、ログを保持してCLIへ修正した。[結果・入力・完全ログ](.artifacts/commit-validation-dialog-guide-20261019/validation.json)。
- 文書5ファイルだけの変更として、版は0.64.0を維持し、製品回帰・再発行は追加していない。前工程の製品・試験・依存入力が同一であることを照合し、標準659件と固定EXEの成功記録を今回実行した結果へ読み替えない。文書差分、stage／commit tree、GitHub・AQUAのmain先端とローカルcommitの照合は[今回の検証資料](.artifacts/commit-validation-dialog-guide-20261019/)へ記録する。新しいGUI試験フォルダーの生成・整理対象なし。

## 2026-10-19: ダイアログの表示タイミング修正とShell化のコミット確認（0.64.0）

- ダイアログのグレーが出た後にShellの描画面が背面へ切り替わる瞬間を見せないよう修正した。準備中はnative dialogと`::backdrop`を透明に保ち、背景画像のdecode・配置と元の3 Viewの一時非表示が完了した応答を受けてから両方を表示する。待機中のフォーカス囲い込み、早いEscape、閉じた後や旧寸法への遅延応答の破棄を維持し、画像の取得・decode失敗でも操作を再開する。公開API・設定・保存形式の追加変更はなく、同じ未公開Shell化の補正として **0.64.0** を維持した。
- 発行前に追加差分と既存のShell化レビューを照合した。最初のGUIでCSPにより動的styleが適用されないことを検出し、既存の外部CSSへ移した。標準回帰では以前の8領域を期待する1項目を10領域へ修正し、失敗したコマンド全体を再実行した。型検査・ビルド、標準92ファイル **659/659、fail/skip 0** が成功。入力一致と依存範囲を確認できた4ファイル28件を前工程から再利用し、境界走査を含む88ファイル631件を今回確認した。[選定・照合・完全ログ](.artifacts/commit-validation-shell-bars-20261019/validation.json)。
- 最終固定EXEのモーダルGUI **7群** が成功。背景取得を意図的に保留し、Windows合成画像のリボン・両バー・本体の4点が暗くならないことを照合した。描画37フレーム（準備中27・表示後10）でdialogと`::backdrop`の同時表示を確認。ショートカット／ジェスチャー／カスタムコマンド×明暗6条件、640×500指定での重なり、リサイズ、実3領域の暗化・復帰、Tab、早い取消、取得失敗、提供元故障・本体再読込も成功。[結果](.artifacts/host-modal-1792394823890/result.json)、[準備中の画像](.artifacts/host-modal-1792394823890/preparation-held.png)。
- 同じ固定EXEのバーGUI **8群**、更新GUI **9群**、smokeも成功。実マウスでのドラッグ、非表示タイトルバーより手前にあるdialogの実クリック、両バーの操作・Tab・明暗・zoom、独立した提供元と故障復旧を確認した。更新は隔離HTTPから実取得し、ステータスバーを交代しても進捗が続き、新しい提供元から取消できた。[バー](.artifacts/shell-bars-1792394890577/result.json)、[更新](.artifacts/update-progress-1792394988077/result.json)、[smoke](.artifacts/smoke-1792395046064/smoke-result.json)。以前のリボン・画面移動GUIは前節の旧EXE／ソースの結果として保持し、今回の固定EXE確認と区別する。
- `publish.bat`で本体を再発行した。最終EXEは **168909844 bytes／SHA256 2b50721dc6a6c9c1c1ef66d2c01b4e2b23fb065e4ff32140bba70f3898a5f1ac**。本体・Default Shell・feedは0.64.0で一致し、GUI試験の4コピーもhash一致。deploy関連3ファイルを保持した。制限環境での依存確認停止・Electron／portable起動・保存置換／Windows操作の拒否はログを残し、同じ凍結依存・発行・試験を通常ユーザー権限で成功させた。検査設定・依存は変更していない。
- 最終検証前後で入力654件と生成物804件を照合し、fixture149件、ログ、レビュー、stage／commit treeを[検証資料](.artifacts/commit-validation-shell-bars-20261019/)へ記録した。以後の文書追記は製品差分と区別する。終了・成功・実行中の参照なし・再解析ポイントなしを確認して古い同試験3フォルダーを整理し、方式ごとの最新3回、再利用・旧版・失敗／不明資料を保持した。[整理記録](.artifacts/commit-validation-shell-bars-20261019/cleanup.json)。
- 利用者の依頼により、タイトルバー・ステータスバーShell化と今回の補正をまとめてコミット対象とした。全GPU／画面倍率／他PCと利用者の手動受入は一括確認していない。push・公開Release・実利用先deployは実施していない。

## 2026-10-19: タイトルバーとステータスバーのShell化（0.64.0）

- 共通背景管理をmain `75b364a`へ先にコミットした後、cleanと追跡先を確認して`pull --ff-only`を実行し、Already up to dateを確認した。`titlebar/statusbar`を独立した領域として追加し、共通カタログは10領域になった。本体は43px／28pxの配置・状態・操作・寿命を管理し、Default Shellと追加Shellは同じ`appdockBar`公開bridgeで描画する。本体rendererの両バーと更新進捗の重複描画を撤去した。仕様は[バーの公開契約](docs/shell-bars.md)。
- `WindowBars`がテーマ・版・パレットキー・最大化・稼働数・更新進捗と操作IDを投影し、`ShellBarHost`が提供元・世代・URL・main frame・session・ready・表示可否を検査する。各領域はready後に交換し、故障時はその領域だけDefault Shellへ戻す。更新処理は本体の既存サービスで続き、更新開始前に現在入力をflushする。設定指定を保持し、旧単一設定の固定8領域への正規化を新領域へ拡張しない。
- リボンと両バーを同じ`HostModalLayer`へ登録した。通常のドラッグ・検索・通知フォーカス・最小化／最大化／元に戻す／閉じる、下部の版・稼働数・更新・進捗・キャンセルを維持した。発行前レビューで、エラー表示によるボタン遮蔽、受付記録の期限判定と実行直前の可否再検査、View同期起動失敗時の復旧通知重複を修正し、型検査・ビルドと関連試験を再確認した。設定に2領域の選択を追加するため0.63.2からマイナー更新。新しい保存ファイルや自動移行は追加していない。
- 型検査・本体／Default Shell／native buildと、関連6ファイル **37/37、fail/skip 0** が成功。対象はバーの公開状態・古いsession・領域違い・重複受付・期限・可否変更、描画境界・共通領域解決・背景・設定ページ寿命・パレット。今回の実装では標準全回帰を一律実行せず、変更した領域と共通枠への影響を選んだ。
- 最終固定EXEのバーGUI **8群** が成功。両バーからのボタン／Ctrl+P、Tab／フォーカス復帰、通知フォーカス、実ウィンドウ操作とWindowsマウス入力によるドラッグ、明暗・900／1280px・125% zoom、独立した提供元指定、故障／Default Shellのネイティブ再試行（応答fixture）・無効化／再開／ready期限／safe起動を確認した。非表示タイトルバーの位置で実マウスを動かしても窓は動かず、その位置に重なるnative dialogのボタンを実マウスで押せた。[結果と画像](.artifacts/shell-bars-1792392679564/result.json)。
- 同じ最終EXEの編集ダイアログGUI **5群** が成功。ショートカット／ジェスチャー／カスタムコマンド×明暗 **6条件** のWindows合成画像で、実リボン・タイトルバー・ステータスバーの暗化をピクセル照合した。640×500指定の狭い窓で重なり、リサイズ、提供元故障、本体再読込、復帰とフォーカスを確認した。[結果](.artifacts/host-modal-1792392377683/result.json)、[重なり画像](.artifacts/host-modal-1792392377683/multi-shell-narrow.png)。
- 最終EXEの更新GUI **9群** が成功。隔離HTTPから実際にダウンロードし、明暗それぞれで取得中にステータスバーの提供元を交換しても進捗が続き、新しいViewから取消でき、既存Appletのファイルを変更しないことを確認した。更新結果は既存の通知基盤へ渡る。[結果](.artifacts/update-progress-1792392565866/result.json)。旧試験の広すぎるAppletセレクターと通知OFF時の旧表示待ちを、対象Applet・現在の結果状態へ合わせた。
- 最終EXEの既存リボンGUI **13群**、ソースの既存画面移動GUI **17群**、同じ固定EXEのsmokeが成功。[リボン](.artifacts/shell-host-1792392857327/checks.json)、[画面移動](.artifacts/navigation-1792392936295/)、[smoke](.artifacts/smoke-1792393134955/smoke-result.json)。既存のready待機リボンfixtureに現行schema 2宣言を補い、タイトルバーへのTab移動は新しいViewを検査するよう変更した。設定入力・JSON・Applet詳細・ログ・両テーマの既存操作を維持した。
- `publish.bat`で本体だけを`A:\40.ARTIFACT\AppDock.at365`へ発行。EXEは **168909783 bytes／SHA256 4643d74544c133538c7a6d0741b91ce7d0c91a035e9696614732f604ef889d9c**。EXE・update.json・Default Shellは0.64.0で一致し、固定試験コピーも同じhash。既存deployスクリプト・deploy.local.txt計3ファイルはhash一致で保持した。Node 24.21.0／pnpm 12.10.1／.NET SDK 10.0.402／Windows x64で検証。依存検証が制限環境で停止したため、今回の停止プロセスだけを確認して終了し、同じ凍結lockfile検証を通常ユーザー環境で成功させた。依存・検査設定は変更していない。
- 入力・生成物・fixture・完全ログ・レビュー・最終照合は[今回の検証資料](.artifacts/shell-bars-20261019/)へ保存する。製品入力と生成物804件を照合し、後続差分はGUI試験の補正・文書のみとして記録した。今回の成功資料は方式ごとの直近3回以内、旧修正の再利用資料と失敗／不明資料は保持し、整理による追加削除0件。全GPU／画面倍率／他のPCと手動受入は一括検証していない。共通背景の修正はコミット済みで、このShell化の追加分は未コミット。push・公開Release・実利用先deployは実施していない。

## 2026-10-19: 共通ダイアログ背景のコミット前確認（0.63.2）

- 利用者のコミット依頼により、共通背景管理の11ファイルを対象とした。実装時の型検査・ビルド、関連4ファイル16件、固定EXEのモーダル5群・編集8群・smokeを入力hashと成果物hashの照合で再利用した。未実行87ファイルの **636/636** を追加し、標準91ファイルは合計 **652/652、fail/skip 0**。制限環境の.NET子ビルド・Windows操作拒否は同一コマンドの通常ユーザー実行で成功した。
- 回帰前後の入力642件と製品生成物797件に差分なし。検証用拡張の生成入力145件も記録した。製品の追加修正はなく、0.63.2の発行物を維持する。最終追記は本記録のみ。再利用元、完全ログ、stage／commit tree・実効作者の照合は[コミット検証資料](.artifacts/commit-validation-modal-layer-20261019/)へ保存する。後続のタイトルバー／ステータスバーShell化は別工程とし、push・公開・実利用先deployは行わない。

## 2026-10-19: ダイアログ背景とShell描画面の共通管理（0.63.2）

- ショートカット・ジェスチャー・カスタムコマンド編集のnative dialogで、別WebContentsのリボンがグレーの背景より手前に残る問題を修正した。本体の`HostModalLayer`へ描画面を登録し、表示中の画像を元の描画順で本体documentに置き、全画像のdecode・配置後に元のViewを一時非表示にする。ダイアログはその上に表示され、閉じると最新の表示希望へ戻る。renderer・接続・状態は保持する。
- 利用者の追加指定によりリボン専用処理を複数Viewの共通登録口へ変更した。現在のリボンは`register`／`setVisible`／`blocked`／`dispose`へ接続済み。将来のタイトルバー・ステータスバーも同じ登録口を利用できる。両領域自体のShell化は今後の作業で、今回のGUIでは仮のViewを登録して確認した。仕様・接続手順は[一覧編集UI](docs/settings-list-editing.md)を参照。
- 発行前に差分・影響先をレビュー。全画像の準備完了前に隠さないこと、表示順・表示希望の保持、閉じた後の応答と古い世代の拒否、リサイズ／提供元交代／本体再読込、操作・フォーカスの抑止を確認した。画像decode失敗時は元のViewを保持し、描画を挟んでから表示完了を返す。設定項目・保存ファイル・公開APIの変更はなく、0.63.1からパッチ更新。途中のリボン専用版も同じ修正の発行途中として0.63.2を維持し、共通化後に再発行した。
- 型検査・本体／Default Shell／native build、関連4ファイル **16/16、fail/skip 0** が成功。対象は複数View・遅延応答・失敗・破棄／復帰の6件と、パレット・Shell境界・設定ページ寿命の関連回帰。ソースGUIと最終固定EXEで **5群** が成功し、3種類の編集ダイアログ×明暗の **6条件**、Tab／キャンセル／フォーカス復帰、追加Shellの故障中の復旧、本体再読込を確認した。
- 仮のタイトルバー・ステータスバーと実リボンを同じ登録口へ接続し、Windowsのウィンドウ合成画像で3領域の暗化をピクセル照合した。最終EXEではテスト窓だけ最小寸法を解除し、実寸 **640×500** でダイアログが3領域に重なることと、ダイアログが隠れず閉じると全Viewが戻ることを確認した。[固定EXEの画像・結果](.artifacts/host-modal-1792389980597/result.json)、[重なり画像](.artifacts/host-modal-1792389980597/multi-shell-narrow.png)。本来のタイトルバー／ステータスバーをShell化した製品の実機確認とは区別する。
- 同じ最終固定EXEで既存ショートカット／ジェスチャー／Applet編集・順序・保存再起動の **8群** と標準smokeが成功。[編集GUI](.artifacts/shortcuts-ui-1792390062169/result.json)、[smoke](.artifacts/smoke-1792390133360/smoke-result.json)。変更に関係する範囲を選び、無関係な全回帰は実行していない。
- `publish.bat`で本体だけを`A:\40.ARTIFACT\AppDock.at365`へ発行。最終EXEは **168912545 bytes／SHA256 d3fc2a82a8da807815dee68952b6a25e8f98c37012fd9e3e078b3cac3952103a**。EXE・update.json・Default Shellは0.63.2で一致し、試験コピーも同一hash。既存の配置スクリプトとdeploy.local.txt計3ファイルをhash一致で保持した。実利用先deploy・commit・push・GitHub Releaseは実施していない。
- 最終固定EXE検証前後の入力 **642件** が一致し、製品生成物 **797件** とfixture・完全ログのhashを記録した。[最終判定](.artifacts/modal-layer-20261019/validation.json)、[レビュー](.artifacts/modal-layer-20261019/review-common.json)、[ソースGUI](.artifacts/host-modal-1792389728818/result.json)。制限環境の依存検証停止／Electron起動・portable spawn失敗は同じ処理の通常ユーザー環境実行で切り分け、固定lockfile・依存検査を維持した。portableの起動直後にリボンが未描画の段階を検査していた試験は、描画完了を待つよう修正した。
- 終了・成功・使用中プロセスなし・リンクなしを確認して、今回作成した古いソースGUI `host-modal-1792388510840`だけを整理した。同方式の最新3回、最終固定EXE・既存再利用資料、失敗／状態不明の資料は保持した。[整理記録](.artifacts/modal-layer-20261019/cleanup.json)。

## 2026-10-19: 操作許可UIのコミット前確認（0.63.1）

- 利用者が発行した画面を確認し、コミットとプッシュを依頼。main `abae55fc129ee6d7d7ea71ffe56c8dad1238ae0b`上の今回の7ファイルに範囲を限定した。設定済みのGitHub／AQUA両mainは開始時HEADと一致していることを通常ユーザー環境で確認した。
- 実装時の入力638件、生成物795件、成功ログ、ApiProbe DLL、固定EXEとそのGUI結果を照合して一致。型検査・ビルド、関連23件、ソース／固定EXEのGUI各6群を再利用した。未実行86ファイルの **623/623** を追加し、標準90ファイルは合計 **646/646、fail/skip 0**。検証用拡張のビルドは制限環境で失敗し、同じコマンドを通常ユーザー環境で実行して成功した。標準回帰前後の追跡638件・検証用生成入力145件・製品生成物795件のhash一致を確認した。
- 差分を再確認して製品の追加修正なし。0.63.1の版、発行EXEの **168905270 bytes／SHA256 fa88ee10bcb9a347a212a66551c31538f9fc3f166831d84ebd2fdd612d6a7c89** を維持し、再発行していない。確認後の変更は本記録への追記だけ。
- 再利用元・照合結果・標準回帰の内訳・完全なログ・stage／commit tree・作者／コミッターの実効設定と両送信先の照合は[コミット検証資料](.artifacts/commit-validation-permissions-ui-20261019/)へ記録する。実装時の固定出力・成功／失敗／診断資料を保持し、整理による削除0件。Release・実利用先へのdeployは行わない。

## 2026-10-19: 操作の許可画面の表示調整（0.63.1）

- 開始時はmain `abae55fc129ee6d7d7ea71ffe56c8dad1238ae0b`、作業ツリー・インデックス・未追跡ともclean。追跡先の`pull --ff-only`は制限環境でDNS失敗となり、同じコマンドを通常ユーザー環境で実行してAlready up to date／終了0を確認した。
- 「公開情報の取得」「公開設定の変更」「公開コマンドの実行」を「情報の取得」「設定の変更」「コマンドの実行」へ変更。15行を情報取得、設定変更、Applet管理、コマンド実行、ショートカット、ジェスチャー、リボン、トレイ、カスタムコマンド、Windows入力、プロセス起動、MCP管理、MCP利用、AI、TTSの指定順にした。共通ラベルを使う検索項目と前提許可の説明も同じ名称になる。
- MCP列の情報取得をON固定・操作不可のトグルへ変更し、「MCP連携中は常に許可」を補足した。Applet列は引き続き編集可能。MCP列のコマンド実行・Windows入力・プロセス起動・MCP利用・AI送信・TTS送信の6行へ、ON/OFFに依存しない注意アイコンと項目別の説明を追加した。マウスとキーボードの両方から説明を表示できる。共通APIの説明を、元MCPとAppletの両方の許可を確認する現行動作へ整合させた。
- 設定キー・保存形式・保存ファイル・許可判定・公開APIの追加削除はない。表示の変更としてパッチ版0.63.1へ更新。本体だけを既存`publish.bat`で`A:\40.ARTIFACT\AppDock.at365`へ発行し、終了0を確認した。依存版・lockfile・toolchainは変更せず、固定lockfileと既存の依存検査を維持した。
- 型検査、本体／Default Shellのビルド、`appdock-api`・`settings-page`・`settings-page-host`・`shell-boundaries`の関連回帰 **23/23、fail/skip 0** が成功。以後の変更はCSSとGUI試験だけで、TypeScript・単体試験の入力一致を確認してこの成功を再利用した。既存ApiProbe DLLはSHA256を固定して利用し、SDKやfixtureの変更は行っていない。
- 発行前に実装差分と影響先を自己レビュー。狭い幅では説明が一覧の枠にかからないよう設定コンテナーの幅に追従させ、変更後にビルドとGUIを再確認した。キャプチャ時のネイティブリサイズでhoverが解除される診断結果を保持し、hover表示と表示範囲を確認した後、フォーカスを保って画面を撮影する方式へ直した。発行に支障のある未解決指摘なし。レビュー内容は[review.json](.artifacts/permissions-ui-20261019-01a1526f/review.json)を参照。
- 最終のソースGUIと固定EXEのGUIはいずれも **6群成功**。明暗テーマ・1280/960/700幅、15行の順序と名称、6アイコン、hover／フォーカス説明の枠内表示、MCP停止中／稼働中／再起動後のON固定、独立した許可保存、前提不足、取消、共有設定の保持、実Node/.NET fixtureと隔離MCPの再入を確認した。最終EXEのコピーhash一致も検査。結果は[ソースGUI](.artifacts/applet-api-source-1792385214947/result.json)と[固定EXE GUI](.artifacts/applet-api-portable-1792385471831/result.json)。固定EXEの明暗・狭幅画像を目視した。
- EXEの製品版、update.json、同梱Default Shellは **0.63.1** で一致。EXEは **168905270 bytes**、SHA256 **fa88ee10bcb9a347a212a66551c31538f9fc3f166831d84ebd2fdd612d6a7c89**。feedのsize/hashとGUIで使った固定コピーも一致した。発行前後の入力638件と、既存配置用ファイル3件のhash一致を確認した。実行ログ、入力・生成物・配布物のhash、通常環境での再実行、レビュー、整理結果は[検証資料](.artifacts/permissions-ui-20261019-01a1526f/validation.json)へ保存した。
- 制限環境の依存検証待機とElectronのCDP接続失敗は成功扱いせず、ログと専用profileを保持した。通常ユーザー環境では同じ固定lockfileの処理とGUIが成功。ソース方式の成功は直近3回、portable方式の成功は今回を含む2回で、過去の参照資料・失敗・診断も保持し、整理による削除0件。標準全回帰、実キーボード／任意プロセス、実AI／TTS／外部MCPサービスの効果確認は未実施。未変更Appletの再発行、全体ZIP、実利用設定・deploy、commit・push・Releaseは行っていない。

## 2026-10-19: 入力フック対応のコミット前確認（0.63.0）

- 利用者が実装内容を確認し、コミットとプッシュを依頼した。製品・試験・依存・発行内容は追加変更せず、今回の追記は本記録のみ。
- 実装時の最終記録と入力638件・生成物794件、成功ログ、固定EXE／展開native DLL、WatchとGmailの試験コピーをSHA256で照合し、一致を確認した。標準646件、レビュー後の関連49件とAPI23件、nativeショートカット27項目／ジェスチャー112項目、開発GUIと固定EXEのGUI／smokeを、実装時に記録した各影響範囲で再利用する。コミット依頼だけを理由とする再試験・版更新・再発行は行わない。
- 対象51ファイルを限定してstageし、作業ファイル・`git write-tree`・commit treeとGitの作者／コミッターを照合する。設定済みのGitHub／AQUAへ通常pushし、両mainの先端を確認する。入力照合、記録追記の差分、stage/tree・commit・pushの実結果は[コミット確認資料](.artifacts/commit-validation-keyboard-hook-20261019/)へ保存する。既存の成功・失敗・再利用資料と0.63.0の固定配布物を保持し、整理による削除0件。

## 2026-10-19: グローバルショートカットのフック統一（0.63.0）

- 承認済み設計を実装。global受信を共有InputCaptureManager／InputHostの単一WH_KEYBOARD_LLへ統一し、旧RegisterHotKey受信と`--hotkeys`を撤去した。専用入力Dispatcherと表示Dispatcherを分離し、送信専用workerはフックを登録しない。Win／Windows／Metaの正規化、左右Winの記録、Winと英数字の選択、行ごとの任意`blockOriginalInput`を追加した。省略時ONを解釈し、省略値の書込みや設定移行を行わない。保護キーの旧行は保持し、新規の画面／API割り当てを拒否する。
- 入力の所有を本体と信頼済みpreloadへ同期・確認してから捕捉を有効にする。配列変更も同じ手順を使い、物理記号キーの別表記をまとめる。ブロックは有効で利用可能なglobal行だけを重複コマンド除去前にOR集計し、押下時の通過／抑止を解放まで保持する。ローカル条件・入力欄／IME保護・保存順と共通dispatcherを維持した。外部編集は既存revision／dryRun／許可と原子的保存へ任意項目を追加し、旧必須項目を保つ。
- 発行前に差分と影響先をレビューし、前面化、旧保護キーの読込み互換、配列切替の所有同期、物理別表記の実効状態、周期同期のキュー、保持キーの解放を修正・再確認した。フックからのAllowSetForegroundWindowでは旧WM_HOTKEYの前面化権限を引き継げなかったため、押下から1.5秒・1回限りの内部要求で、通知workerが押下元と対象の入力スレッドを一時接続して前面化する。finallyで解除し、別Windowへ操作が移った場合は中止する。プロセス起動は実際に返されたPIDと確認できた子孫に限定する。ASFW_ANY／合成Alt／常時最前面化は追加していない。[レビュー](.artifacts/keyboard-hook-implementation-20261019-01a15083/review.md)に判断を記録した。
- 固定lockfileのinstall、型検査、本体／Default Shell／native build、標準90ファイル **646/646、fail/skip 0** が成功。レビュー後の影響範囲は関連49件とAPI23件を追加確認し、無関係な標準成功結果は再実行していない。最終nativeではショートカット **27項目**（down／repeat／up、自己入力、Pause、左右Win記録、記号キーの物理別表記、保持中の設定変更等）、既存ジェスチャー **112項目** が成功した。
- 開発GUIは既存の一覧／編集／順序／保存再起動8群、Pause／Watch／停止再開／背景コマンド9群、本体・埋め込み／別Window・HTTPページ・オフラインGmail10群が成功。古い試験のWebApplet保存形式と空アカウント名簿を現在のfixtureへ合わせた。Electronのフォーカス表示と実HWNDが食い違う環境では、独立native fixtureで前面を確認してから送信するよう試験側を修正した。製品は不一致時にローカル条件を加えず、globalを維持する。
- 本体だけを既存publish.batで`A:\40.ARTIFACT\AppDock.at365`へ発行した。最終単一EXEは **168900889 bytes**、SHA256 **093daac165edd4bdab8acd9b8e9b4ed3f34ad3b243cfc6368f39c4a3454226d8**。EXE／update.json／Default Shellは0.63.0で一致。固定EXEの隔離GUI **9群** が成功し、変更前のWin+Wで実際に`WindowsDashboard`が開く環境で、ON時と記録時の抑止、元入力通過、混在OR、重複実行防止、保存再起動、helper停止／再試行を確認した。既存cmdモードの`start "" wt.exe`から起動した実Windows Terminalが前面になることも検証し、固有タイトルを付けた試験Windowだけを閉じた。
- 同じ固定EXEで背後／最小化／非表示からの本体前面化と、デスクトップからWin+Eを送る **4群**、標準smokeが成功。試験コピー／発行EXEのSHA256と、実際に展開されたInputHost／Runtime／ProcessHost DLLの生成物hashが一致した。画面は両テーマの700／900／1280pxで検査し、最終画像も確認した。証跡は[今回の検証資料](.artifacts/keyboard-hook-implementation-20261019-01a15083/)、固定GUIは`.artifacts/keyboard-hook-ui-1792358171287/`、前面化は`.artifacts/shortcut-foreground-1792358203654/`、smokeは`.artifacts/smoke-1792358219288/`。
- 制限環境の.NET restore/build失敗は成功扱いせず、同一条件の通常ユーザー実行で成功した。WindowsApps起動エイリアスを実行ファイルモードへ直接渡す試験は既存パス検査で失敗し、Terminalは既存cmdモードで検証した。実キーボードによる手動受入、全JIS／US配列、他社フック、管理者対象、UAC／ロック画面、高負荷時のWindows側タイムアウト解除、遅い起動や既存別プロセスへの引継ぎは一括検証していない。既存の成功／失敗／再利用証跡と固定出力を保持し、整理による削除0件。実利用設定・未変更Applet・全体ZIP・実利用先deploy・commit・push・Releaseは変更していない。

## 2026-10-19: グローバルショートカットのフック統一設計（未実装）

- main `5e9331b4254fcd87ba48398119bbb93fa9465137`、追跡先origin/main、作業ツリー／インデックス／未追跡がcleanであることを確認した。開始前の `pull --ff-only`は制限環境でDNS失敗となり、同一コマンドを通常ユーザー環境で再実行して終了0／Already up to dateを確認。既存のローカルcommitとブランチを保持した。
- [設計書](docs/keyboard-hook-shortcuts-design.md)を追加し、DEVELOPMENTと現行ショートカット文書から未実装の設計としてリンクした。グローバル受信は共有InputHostのローレベルフックへ統一し、方式選択は設けない。Win修飾キーの保存・記録・選択、割り当てごとの元入力ブロック、省略時ON、同じキーでの集約、既存ローカル入力の維持、API・障害・受入条件を定義した。
- 現在の正規化、Windows登録、ジェスチャーとフックなし送信worker、共通ダイアログ、resolver／dispatcher、外部編集schemaと照合して文書レビューした。本人用合成入力を押下状態の更新前に除外する順序、Pauseの単発入力、記録時のWin／Alt解放、ブロックOFFの二重実行防止も明文化した。前面化と未文書化VKによる単独修飾キー動作の抑止は、実装時に実機で確認する成立条件として残す。
- 新設計内のローカルリンク4件と参照先anchor、JSON例1件、コードフェンス6行、実在する検証入口10件、DEVELOPMENT／現行仕様からの入口、人物名・行末空白、`git diff --check`を確認した。結果は[文書検査](.artifacts/keyboard-hook-design-20261019-01a15083/validation.json)へ保存した。
- 変更対象は設計書・入口・現行仕様への案内・本記録の4文書。製品ソース・0.62.5の版・実利用設定・配布物は変更せず、製品回帰・GUI・実Win+W・publish・commit・pushは未実施。検証計画を製品機能の成功として扱わない。

## 2026-10-19: 共有settings.jsonとdataの保存先指定の設計（未実装）

- main `3af02e52135f78487d0dee9c12a11911974c9fa4`の作業ツリー・インデックス・未追跡がcleanであることを確認し、追跡先から`pull --ff-only`を実行。制限環境のDNS失敗後、同一コマンドを通常ユーザー環境で実行し、終了0／Already up to dateを確認した。
- [設計書](docs/shared-settings-location-design.md)を追加し、DEVELOPMENTの入口へリンクした。利用者の選択に従い、settings.jsonと隣のdata/を一緒に切り替える。EXE隣の端末設定・配置ID・認証/sessionは維持し、既存ファイルの自動コピー・移動は含めない。起動前の復旧、NASの非同期I/O・共通排他、素材/名簿の同時保存、参照先に結び付いたpending・正常世代・キャッシュ、結果不明時の再送防止まで設計対象とした。
- 現在のパス解決・端末合成・監視・原子的保存・回復処理・アバター・登録通知音・Webプロフィール/グループ名簿の実装と照合し、設定/data/の切り替え、PC専用領域、参照先変更待ちの保存制限に矛盾がないか文書レビューした。NASの共有モードと同期I/Oの制約は設計書末尾の公式資料を参照する。
- 文書内のローカルリンク14件、JSON抜粋1件、コードフェンスの対応、旧方針の残存・人物名・行末空白、DEVELOPMENTの入口、`git diff --check`を確認。製品ソース・版・実利用設定は変更せず、製品回帰・GUI・実NAS・publishは未実施。将来の検証計画を、機能の検証成功として扱わない。
- コミット依頼を受け、設計書・入口・本記録の3文書に範囲を限定して再確認。文書のリンク・JSON・構造・差分を検査し、製品回帰と再発行は行わない。ファイルhash、stage/tree、commitの照合は[コミット確認資料](.artifacts/commit-validation-shared-settings-design-20261019/)へ記録する。

## 2026-10-19: 管理者起動修正のコミット前確認（0.62.5）

- 利用者が、終了後に再び起動しても管理者として起動できることを確認し、コミットとプッシュを依頼。利用者による実動作確認として記録し、Highestタスクの実登録・管理者のままの自己更新・Windowsサインインの確認とは区別する。
- 実装時の追跡入力629件・生成物797件・成功ログと、発行EXE／固定コピーのhashを照合して一致を確認。型検査・ビルド、関連65件、固定EXEの起動設定GUI5群・更新／再起動GUI11群・smokeを再利用した。未実施84ファイルの574件だけを追加し、標準89ファイル **639/639、fail/skip 0**。検証用fixtureのビルドは制限環境で終了1となり、同じコマンドを通常ユーザー環境で実行して成功。追跡入力と検証用fixtureの前後一致を確認した。
- 製品の追加修正・版更新・再発行なし。0.62.5の発行EXEは168893229 bytes／SHA256 `d7c8885c0db79fc52cf4aceab065b4a0c2428e36310372600db39a62509c973e`を維持する。対象は今回の7ファイル。再利用元・回帰一覧・追加検証・ログ・stage/tree・commitと送信先の照合は[コミット検証資料](.artifacts/commit-validation-admin-launch-20261019/)へ保存する。GitHub/AQUAのmainが開始時HEADと一致することを確認し、通常pushの対象とした。Release・実利用先への追加deployは行わない。既存の成功・失敗・診断証跡を保持し、削除0件。

## 2026-10-19: 通常権限での管理者アカウント判定修正（0.62.5）

- 開始時はmain `b27bd04`、作業ツリー・インデックス・未追跡ともclean。追跡先の`pull --ff-only`は通常ユーザー環境で成功し、Already up to dateを確認した。
- Windows PowerShell 5.1のWindowsIdentity.GroupsはUACの通常権限トークンでdeny-onlyになったAdministratorsを除外するため、管理者アカウントを非管理者と誤判定していた。WindowsLaunchの所属判定をUserClaimsのGroupSid/DenyOnlySidとAdministrators SIDの照合へ変更。現在の実権限を調べるIsInRole、UAC後の同一SID・管理者確認、設定保存失敗時の復元は維持した。設定保存・専用再起動・ONでの次回起動は同じ修正済みのreadを使う。保存形式・設定項目・保存ファイル・外部APIの変更や移行処理はない。
- 追加回帰は、有効な管理者グループ・deny-only管理者グループ・一般グループ・同じSIDを持つ別種のclaim・空一覧の5条件と、実Windowsトークンの独立したwhoami結果との照合を含む。LUNAの通常ユーザー環境で旧判定false／実所属true／現在の昇格falseを確認し、実所属を使った設定変更と管理者再起動が両方ともUAC要求直前まで到達することを検証した。そこで明示キャンセルを注入し、実際のUAC表示・承認・タスク変更・設定commitを行わないことも確認した。
- 最終の型検査とpublish内の本体・Default Shell／.NETホスト・Updaterのビルドが成功。`windows-launch`、`launch-recovery`、`device-settings`、`startup-updates`、`portable-updates`の関連回帰は **65/65、fail/skip 0**。ソースとテストを発行前にレビューし、修正が必要な製品指摘なし。設定・ファイル・互換性の追加削除を伴わない不具合修正として、パッチ版0.62.5へ更新した。
- 既存`publish.bat`で本体だけを`A:\40.ARTIFACT\AppDock.at365`へ発行し、終了0を確認。EXE／update.json／同梱Default Shellの版は0.62.5で一致。EXEは **168893229 bytes**、SHA256 **d7c8885c0db79fc52cf4aceab065b4a0c2428e36310372600db39a62509c973e**。最終発行物のコピーとhashを照合した。
- 最終EXEの`launch-settings-ui-test.cjs`は **5群成功**。通常権限の管理者アカウントで、スタートアップ登録なしの「常に管理者として起動」ON/OFF即時保存と現在の通常権限の維持を追加確認した。専用の通常権限ログオンタスクの登録・実行・再起動後保持・解除、両テーマ／3幅も成功し、`taskRemoved: true`を確認。証跡は`.artifacts/launch-settings-1792350411845/`。
- 同じEXEの`portable-updates-ui-test.cjs`は **11群成功**。通常権限での本体単一EXE置換、ホスト＋Applet一括更新、Appletだけの更新、同版再適用、設定／認証fixture／有効状態保持、更新後の画面復帰と通常再起動を確認した。起動PID・終了コードだけを記録する検証用ラッパーから既存試験を実行した。最初の2回は試験側が約8秒でCDP接続待ちを打ち切り、稼働中のランチャーをSIGTERMしていた。試験の起動待ちだけを最大60秒へ修正すると、同じEXEで起動・全更新・再起動が成功した。製品側の待ち時間や更新経路は変更していない。成功証跡は`.artifacts/portable-updates-1792350746443/`、失敗と起動終了イベントも保持した。
- 最終EXEの隔離smokeも成功（`.artifacts/smoke-1792350602385/`）。今回の入力一覧、生成物・配布物・ログのhash、発行前レビュー、制限環境での失敗と通常ユーザーでの成功、テスト整理結果は[検証資料](.artifacts/admin-launch-fix-20261019/)へ保存した。Node 24.21.0／pnpm 12.10.1／.NET SDK 10.0.402を使用。固定lockfileと依存・ツールの検査条件は維持した。
- 未確認: 実際のUAC承認後の管理者トークン、Highestタスク登録・解除、管理者権限での自己更新、実Windowsサインイン。通常権限からUAC要求までの検証と、UAC承認後の実機検証を区別する。未変更Appletの再発行・無関係な全回帰・全体ZIP・実利用先deploy・commit・push・Releaseは行っていない。古いsmoke成功分は他の検証記録からの参照を確認して保持し、今回の成功・失敗・診断証跡も保持、削除0件。

## 2026-10-19: GitHub参照先変更のコミット確認（0.62.4）

- 利用者が本体への反映を確認し、先に本体をコミットするよう依頼。実装時の追跡入力・全生成物・成功ログ・固定EXEのSHA256を再照合し一致。型検査/build、関連51件、固定EXEのGUI6群・smokeを再利用した。実装時未実施の85ファイル586件だけを追加し、標準89ファイル **637/637、fail/skip 0**。制限環境のfixture build／試験中断を成功扱いせず、通常ユーザー環境でfixture buildと残り回帰が成功した。
- 製品追加修正・再発行なし。実装時からの文書追記を確認し、対象10ファイルだけをstageしてtree／作業ファイルと照合する。[コミット証跡](.artifacts/commit-validation-github-account-20261019/)に再利用元・入力・追加試験・ログ・発行物・stage/commit照合を記録。過去・今回の成功／失敗証跡を保持し削除0件。push・Release・実利用先deployなし。全Appletの対応は、このコミット後に進める。

## 2026-10-19: GitHubアカウント名の更新（0.62.4）

- 開始時はmain `cb9c2c6`／作業ツリー・インデックス・未追跡ともclean。追跡先から`pull --ff-only`成功（Already up to date）。本体リポジトリ情報、更新元の既定値、設定例、更新元の画面説明を`yukichi-7sai/AppDock.at365`へ変更し、既定復帰を検査する既存GUIスクリプトの期待値も更新した。履歴文書の旧アカウント名は当時の記録として保持する。
- 発行前に差分と影響先をレビューし、指摘なし。新規作成／欠落時の既定値と明示的な既定復帰だけを変更し、保存済みの旧GitHub指定・独自URL・空文字は保持する。設定項目・保存ファイル・公開APIの追加削除はなく、パッチ版0.62.4へ更新。本体だけを既存publish.batで`A:\40.ARTIFACT\AppDock.at365`へ発行した。
- `dev.bat run typecheck`、`dev.bat run build`成功。`dev.bat exec node --test tests/core.test.cjs tests/settings-page.test.cjs tests/startup-updates.test.cjs tests/portable-updates.test.cjs`は **51/51、fail/skip 0**。既定値と保存済み3種類の保持を直接確認した。制限環境ではGitのDNS、依存ポリシー照会待ち、更新helperのアクセス拒否、GUIのspawn UNKNOWNが発生。既存の検査条件を維持して通常ユーザー権限で実行し成功した。
- 最終EXEの隔離コピーで`settings-url-ui-test.cjs`の **6群** が成功。新しい既定値・説明文・既定復帰後のメモリ／settings.jsonの一致、既存URL確定動作を検証。画面画像も確認した。同じ最終EXEで`smoke.cjs`が成功し、画面・設定／画像保存先・正常終了を確認した。
- 発行EXE／feed／Default Shellは0.62.4で一致。EXEは **168877131 bytes**、SHA256 **043d72acd4f4176d0417bbc4166a111cecc5aaa7e8740baf21b8d6647b0e85ab**。固定EXEコピーとhash一致。証跡は[今回の検証資料](.artifacts/github-account-20261019/)、GUIは`.artifacts/settings-url-1792344576028/`、smokeは`.artifacts/smoke-1792344604511/`。追跡入力の前後hashと生成物／ログhashを記録。型検査・ソース回帰後の変更はGUIスクリプトへの画像保存1行だけであり、製品・依存・ビルド入力に影響しない。
- 全体ZIP／実更新交換のGUI、無関係な全回帰、実GitHub Releaseからの取得・実利用先deployは今回未実施。テストフォルダーは今回の成功証跡、制限環境の失敗証跡、過去の参照／再利用資料・利用状態未確認分を保持し、削除0件。コミット・push・Releaseなし。
- 追加相談の「バージョン情報・更新」ページのPC別保存は別対応。既存チェック欄は再利用できるが、切替操作はApplet専用で、updatesと各AppletのupdateSourceは共有保存のため、保存・合成・切替処理の拡張が必要。利用者の指定により今回は未実装。

## 2026-10-19: 設計・実装前の最新取得手順

- Windows標準コマンドの実装コミット後、設計・実装・修正の開始時にクリーンな対象repoを現在の追跡先から`pull --ff-only`する手順を30.PROJECT/AGENTS.mdへ追加し、このrepoの共通ワークフローから参照した。未コミット変更・未追跡ファイルの保護、追跡先なし／取得失敗／分岐時の扱いと、取得後の指示・版の再確認を明記した。
- 編集前に30.PROJECTとAppDock双方のクリーン状態・追跡先を確認し、実際の`git pull --ff-only`がともに終了0／Already up to dateであることを確認。文書と参照先・差分を検査した。製品ソース・版・発行物は変更せず、製品回帰・再発行は行わない。実装とは別の文書コミットに分離し、push・Release・実利用先deployなし。

## 2026-10-19: Windows標準コマンド対応のコミット確認（0.62.3）

- 利用者が普段使う追加コマンドの動作成功を確認し、コミットを依頼した。共通説明・件数上限・キー文法／対象配列・取消と、WindowsTools 0.2.1との接続を再確認し、未解決の製品指摘なし。製品追加変更・版更新・再発行は行わない。
- 実装時と本体629入力を照合し、検証記録以外の差分なし。関連5ファイル39件を再利用し、標準回帰の未実施84ファイル **598/598** を追加確認した。合計89ファイル **637/637、fail/skip 0**。型検査/build、発行DLLと固定EXE GUI、native Watch互換、標準smoke、利用者の実入力6群を入力／ログ／最終配布物hashと照合して再利用した。実ロックなど全Windows機能の実効果を一括検証したとは扱わない。
- 本体EXE SHA256 `ac641e1d243a9c54f3c0e910923d31359ba241a4a7c44f713f1de52b4d7a9939`、WindowsTools ZIP `709cd8f4bdff0c3dbbfb1eb437f1015224f37127b131b2576253cbdc14834e3b`を維持。[コミット前証跡](.artifacts/commit-validation-windows-shortcuts-20261019/)に試験選択・入力・完全ログとstage/tree・commit照合を保存する。既存の成功・失敗・再利用資料を保持し、削除0件。今回の実装だけをコミットし、push・Release・実利用先deployは行わない。最新取得手順の更新は、その後の別作業として分離する。

## 2026-10-19: WindowsTools最新0.2系との統合確認

- WindowsToolsのmainを最新0.2.0へfast-forwardし、旧キー送信撤去とジェスチャー判定修正を保ったまま、標準66件と専用ロックを0.2.1へ統合した。本体の製品ソース・0.62.3固定EXEは変更せず、今回の本体変更はこの記録だけ。先に成功した実入力6群と関連39件、型検査/build・native Watch互換・smokeの適用範囲を維持する。
- WindowsToolsの最終回帰40/40、発行DLL実ランナーで79件登録／説明と66件の模擬API委譲、同じ固定EXE＋最終DLLの隔離GUIが成功。説明表示／検索、旧キーUIとsend登録の非復活、旧設定／割り当て保持、MCP設定、予約取消、再起動／停止・終了0を確認した。本体の再発行なし。詳細とhashは[WindowsToolsの最新記録](../Applet.WindowsTools.at365/VERIFICATION.md#2026-10-19-最新020への標準コマンド統合021)と[統合証跡](../Applet.WindowsTools.at365/.artifacts/windows-shortcuts-merge-20261019/validation.json)を参照。

## 2026-10-19: 対話端末での実入力試験成功（0.62.3）

- 利用者が通常の対話PowerShellから固定EXEに対して`dev.bat exec node scripts/native-input-ui-test.cjs A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`を実行し、全6群が成功。保存された[result.json](.artifacts/native-input-ui-1792341550956/result.json)の`ok: true`と報告内容の一致を確認した。以下の過去の記録にある実入力GUIの確認待ちは、この成功で解消した。過去の失敗ログと診断は保持する。
- ホストのカスタムコマンドと実Node WebBrowserTools 11コマンドの共通入力、Applet入力許可と読み取り許可の独立性、Applet/MCPの入力許可取消による待機中の送信中止、MCPの入力公開範囲を確認。native workerの対象変更拒否、修飾キー押下中の取消、連続ジェスチャー入力（固定150ms待機なし、14ms）と、現在のキーボード配列での記号キー実到達も成功した。
- 試験profile内のEXEと発行EXEのSHA256は`ac641e1d243a9c54f3c0e910923d31359ba241a4a7c44f713f1de52b4d7a9939`で一致。WindowsToolsのDLLも前回のhashを維持した。製品変更・版更新・再発行は不要。個別Windows機能の実効果や実ロックは一括実行していない。今回の更新は検証記録・証跡・共有メモリのみ。

## 2026-10-19: コンソール復帰後の実入力再試験

- 利用者のコンソール復帰後、実行プロセスとActiveConsoleSessionがともに1、スレッドと入力先のデスクトップがともにDefault、UserInteractive=true、最前面がExplorer/Progmanであることを確認。RDP接続だけが原因とは断定しない。
- 同じ固定EXEで実入力GUIを再実行したが、専用ウィンドウへの前面化で停止。試験画面へ通常の復元要求と診断項目を追加して切り分けたところ、画面は可視だが、同じデスクトップのExplorerへのAttachThreadInputがWin32エラー5、SetForegroundWindowもfalse。自身の表示面への一時的なクリックでも前面化できず、この追加経路は試験コードから取り除いた。Windowsの設定・保護・製品コードは変更していない。
- 最終fixtureのビルドは成功。実入力の成功は未確認のまま。通常のPowerShellで`dev.bat exec node scripts/native-input-ui-test.cjs A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`を実行して再確認する。既存の関連80件・固定EXE GUI・実ランナー・native互換・smokeの成功と、配布物のhashは維持。版更新・再発行は不要。
- 証跡: [.artifacts/windows-shortcuts-20261019/native-input-console.log](.artifacts/windows-shortcuts-20261019/native-input-console.log)、[前面化の診断](.artifacts/windows-shortcuts-20261019/focus-desktop-check.log)、失敗profile `.artifacts/native-input-ui-1792341024024/`。入力fixtureと検証記録以外の製品ソース・配布物は変更していない。今回の追加失敗も保持し、成功した試験へ読み替えない。

## 2026-10-19: WindowsTools標準ショートカットの共通入力・説明対応（0.62.3）

- WindowsTools 0.1.6に必要なWin単独・Pause・PrintScreen・記号キーを共通送信文法へ追加。記号は対象スレッドのキーボード配列で送信直前に解決し、押下解放待機・対象変更拒否・権限・取消・再入防止を維持。カスタムコマンドの既存説明検証を静的/実行時コマンドにも共用し、共通の一覧とパレットへ表示。パレットは説明でも検索可能。登録上限は本体と.NETで256件に揃えた。保存形式・設定・既存APIを破壊しない追加として0.62.2からパッチ更新。
- 発行前レビュー、必要な修正、型検査/build、関連5ファイル **39/39**、WindowsTools標準 **41/41**、発行DLLの79固定＋32自由登録の実ランナー接続が成功。新SDK/Runtimeで未変更native WatchをRelease buildし、隔離RPC・WPF画像描画・設定反映・停止/EOF終了も成功。既存コンストラクターと説明省略時のRPC形状を維持。詳細なレビューと検証範囲は[WindowsToolsの記録](../Applet.WindowsTools.at365/VERIFICATION.md#2026-10-19-windows標準ショートカットと専用ロック016)を参照。
- 固定単一EXEとWindowsTools発行物の隔離GUI、説明表示/検索、111件同時登録、自由登録の編集とホットキー、MCP設定、再起動/停止/終了0が成功。固定EXE標準smokeも成功。本体とDefault Shellの版は0.62.3、EXE 168901925 bytes / SHA256 `ac641e1d243a9c54f3c0e910923d31359ba241a4a7c44f713f1de52b4d7a9939`、feed・GUI/smokeのコピーhash一致。publish.bat終了0、lockfile/toolchain不変。
- 実入力GUIは未完了。portableを既存のElectron launchで起動する試験がタイムアウトしたため、CDP接続と実際の展開先からのInputHost取得へテスト側を修正。その後は最前面の所有者がLockAppで、専用入力画面を前面化できず中止。ロック解除や保護回避は行っていない。失敗ログ・profileを保持し、キーの実到達、実権限取消、各Windows操作の実効果とは区別する。解除後の再検証が必要。
- [本体のログ・native互換性・実入力失敗](.artifacts/windows-shortcuts-20261019/)、[入力hash・レビュー・発行物照合](../Applet.WindowsTools.at365/.artifacts/windows-shortcuts-20261019/validation.json)、[固定EXE GUI](../Applet.WindowsTools.at365/.artifacts/host-1792340281997/result.json)、[smoke](.artifacts/smoke-1792340668570/smoke-result.json)を保存。製品659入力の照合後、発行後は試験スクリプトのみ変更。整理は今回GUI1成功と入力2失敗を保持、smokeの直近成功3件とセットアップの再利用資料・状態不明を保護し、削除対象なし。標準全回帰・全Applet再発行は未実施。commit/push/GitHub Release/実利用先deployなし。

## 2026-10-18: 汎用成功通知撤去のコミット・プッシュ確認（0.62.2）

- 利用者が動作成功を確認し、コミットとプッシュを依頼した。今回の8ファイルをレビューし、汎用成功通知だけの撤去、具体的な通知・失敗・結果イベントの維持、保存形式/APIの不変を再確認。未解決の製品指摘なし。今回の追加変更はこの検証記録だけで、製品版・発行物は維持する。
- 実装時の541入力・生成物192ファイル・完全ログ・EXE/feedを照合し不一致0。型検査/build、関連4ファイル29/29、固定EXEの専用コマンドGUI・ホーム8群・smokeを再利用した。未実行の85ファイル607/607だけを追加し、標準89ファイル**636/636、fail/skip 0**。必要fixtureを既存手順でビルド後、1481入力は回帰実行前後で一致した。Windowsによるバナー抑止と全体通知GUIの未確認範囲は実装時の記録どおり保持する。
- EXE SHA256は`b7584c623128581b2e3d5565ad8229eb26f6ff47ca366535461d67684ccf9cc2`で変更なし。再発行は行っていない。証跡は`.artifacts/commit-validation-command-success-20261018/`の`reuse-audit.json`、`test-plan.json`、`regression-run.json`、完全ログ/input一覧。stage/作業内容/commit tree・履歴名義とGit設定の照合、および設定済みGitHub/AQUA両mainの通常push後の先端を`stage.json`、`commit.json`、`push.json`へ記録する。既存の検証資料・固定出力と失敗/状態不明profileを保持し、今回の削除0件。GitHub Release・実利用先deployは対象外。

## 2026-10-18: 汎用コマンド実行成功通知の撤去（0.62.2）

- 利用者の指定に従いmainを`1cd0951378d6127d754166b6efe91f72bda735b2`へff-only pullしてから修正を反映。開始時はcleanで、先に着手した今回の差分だけをパッチへ退避・復元した。ショートカット、直接実行、パレット、ホームの汎用成功通知とホームの成功メッセージを撤去した。src内に対象文言・専用発行関数の残存なし。具体的な操作結果、エラー、実行中制御、実行結果の返却と完了イベントは保持する。
- 発行前レビュー1回と試験補強の確認を実施。ホームのmessageフィールドは空文字で保持し、Shell/APIの形式を変更しない。不要な成功メッセージ消去タイマーを削除した。設定・保存ファイル・依存版・lockfile・toolchainの追加削除はなく、通常修正として本体だけ0.62.1→**0.62.2**へ更新。未解決の製品指摘なし。詳細は`.artifacts/command-success-removal-20261018/review.md`。
- 型検査・本体/Default Shellビルドと関連4ファイル**29/29、fail/skip 0**が成功。ソースGUIの専用範囲ではキー入力・直接実行・パレット、成功/失敗件数、失敗ログとパレット完了イベントを確認。ホームGUI8群も成功した。試験補強後の最終固定EXEでも専用コマンドGUI・ホーム8群・smokeの**3コマンドすべて終了0**。実行完了を待って汎用成功ログ・通知履歴が生成されないことを検査し、具体的な読み上げ停止通知の履歴は残ることを確認した。
- 最終publish終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**168902362 bytes / SHA256 `b7584c623128581b2e3d5565ad8229eb26f6ff47ca366535461d67684ccf9cc2`**。FileVersion/ProductVersion・update.json・同梱Default Shellは0.62.2、feedのsize/hashと3試験の隔離EXEコピーも一致。発行先の既存deploy関連3ファイルは元のhashを保持した。未変更Appletの再発行・全体ZIP作成は行っていない。
- Windowsの通知可否クエリは`accepts:false`で、従来の情報通知全体GUIはバナー表示待機で失敗した。全体GUIの成功扱いにはせず、今回の専用モードは非表示だけを根拠にせずログ・永続履歴を検査した。実OSのバナー表示・実サービス・物理キーの全経路は未確認。制限環境のDNS・依存検査待機・Electron起動/.NET失敗はログを保持し、同じ必要処理を通常ユーザー環境で実行した。標準全回帰は未実施。
- 証跡は`.artifacts/command-success-removal-20261018/validation.json`、完全ログとhash・入力一覧・生成物一覧・固定試験の実行時刻/終了コード。最終固定試験の入力hashは前後一致。今回の種類別profileを確認し、直近3回・失敗/状態不明・再利用資料を保持、削除0件。commit・push・GitHub Release・実利用先deployは未実施。

## 2026-10-18: 拡張基盤・キー入力枠のコミット／プッシュ確認（0.62.1）

- 利用者がキー入力枠の動作を良好と確認し、コミットとプッシュを依頼した。カスタムコマンド拡張A〜Dと入力枠、設計／計画／利用文書を対象とする。実装完了時の本体629入力とWindowsTools 24入力を照合し、製品・試験・依存・発行設定の追加変更がないことを確認。今回の追記は検証記録だけで、製品版・発行物は維持する。
- 標準89ファイルを試験単位で分類。対象・transitive import・試験自体・依存／ツール入力を照合できた28ファイル**140件**を再利用し、後続修正の影響や生成物記録が不足した61ファイル**496/496**を追加確認した。合計**636/636、fail/skip 0**。生成物・Node・兄弟Appletのmanifest等**957入力**は前後一致。HTTP JSON／SSEの2ケースも成功ログと照合した。証跡の上書きを避けるため生成物一覧を実行別へ固定し、最終run `1792322691374-1aec1a50`を採用する。
- 型検査・build・ソース／固定EXEのMCP GUI各20群とshortcut GUI各8群を、入力／完全ログ／固定コピーのhashで照合して再利用。既存入力5群は送信経路とnative部品の不変を確認した範囲で再利用し、旧EXEの結果を新EXEの実行結果へ読み替えない。WindowsToolsの回帰35/35・最終DLLのprotocol／nativeも再利用し、最終本体0.62.1とのGUIだけ追加成功（`host-1792322404244`）。
- 本体EXE SHA256 `d6e3edc28307f37cd64c2c3760c81a21fc4c65be7986747da5d70f4672939bdc`、WindowsTools ZIP SHA256 `e0bc845a8cedef6ca6b17b13e7a2f74da148b1aa09f24a12feaeaac1651d72e9`を維持。feed・ASAR・生成物192ファイル／extraResources629ファイルを照合し、再発行なし。実装時レビューと今回の差分確認に未解決の製品指摘なし。
- 証跡は`.artifacts/commit-validation-custom-commands-20261018/validation.json`、`test-plan.json`、各runと実行別generated一覧。stage／作業内容／commit treeの照合と、設定済みGitHub／AQUA両mainの通常push後の先端を`stage.json`、`commit.json`、`push.json`へ記録する。利用中設定・認証・実サービスを変更せず、Release・実利用deployは行わない。終了済みの成功／再利用資料・固定出力を保持し、整理結果は`cleanup.json`を参照する。

## 2026-10-18: キー送信コマンドに共通キー入力枠を追加（0.62.1）

- 「キーを送信する」の追加・編集に、ショートカット編集と同じ`ShortcutCaptureField`を接続。押した組合せの表示、Win、特殊キー選択、Tab移動／Esc取消、Enterの記録、JSON切替を対応した。送信モードだけで既存の送信用文法を使い、Pause／Plus等を選択肢から除外する。保存だけで送信せず、設定版・API・許可・送信worker・WindowsToolsは維持した。
- 発行前レビュー1回と修正確認を実施。既存の入力停止／復帰・フォーカス・取消・保存処理を共用し、JSONの不正値から戻った際の修飾キー初期化と、IME 229の除外を補強した。未解決の製品指摘なし。設定項目／形式変更を伴わないUI拡張として本体だけ0.62.0→**0.62.1**へパッチ更新した。前回の未コミット変更を保持する。
- 型検査・build、関連4ファイル**42/42、fail/skip 0**（`1792321051832-082b1cac`）が成功。ソースMCP GUI **20群**（`mcp-hub-source-1792321130030`）で追加／編集、Win、Tab／Esc、未対応キー・repeat・composition／229、取消、ID／説明保持、JSONでの不正入力の修正、明暗2幅と専用native先への実送信を確認。既存shortcut GUI **8群**（`shortcuts-ui-1792321201898`）で通常の入力枠・特殊キー・登録停止と復帰・取消・競合・保存／再起動を確認した。全標準回帰は重ねず、今回のUIと関連する文法・保存・割当に絞った。
- 通常publish終了0（`1792321311199-eb03a82a`）。最終`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**168897902 bytes / SHA256 `d6e3edc28307f37cd64c2c3760c81a21fc4c65be7986747da5d70f4672939bdc`**。EXE／package／feedは0.62.1、feedのsize/hash一致、生成物192ファイルとASAR／Shell、extraResources 629ファイル、fixture非同梱、deploy関連ファイルとlockfile保持を確認。native DLLの生成hashも発行前と同一。WindowsTools 0.2.0のZIP／DLLは前回のhashを維持し、再発行していない。
- 固定EXEでもMCP GUI **20群**（`mcp-hub-portable-1792321481937`）、既存shortcut GUI **8群**（`shortcuts-ui-1792321579273`）が終了0。各固定コピーと最終EXEのhash、fixture入力前後が一致し、明暗の入力枠を目視した。キー記録の操作はChromium入力、送信先への到達は別途native Windowで確認している。OS予約のWin組合せの物理記録と各IMEの手動操作は未確認。
- 証跡は`.artifacts/custom-key-capture-20261018/validation.json`、各runの完全ログ・入力SHA256・終了結果、`review.md`、artifact／package照合と`cleanup.json`。公開一覧に設定値を期待した試験の参照先を隔離設定へ修正し、失敗資料を保持した。試験プロセス残存0、今回の成功profileは方式別1件で、過去の再利用資料・失敗・不明なものを保持し削除0。実利用設定・認証の変更、commit/push/Release/実利用deployは行っていない。

## 2026-10-18: カスタムコマンド拡張 A〜D（0.62.0）

- 全種類共通の説明文、単一のversion 2、キー送信種類、プロセス起動種類（exe／cmd／PowerShell）を実装。説明は一般公開コマンド一覧へ返し、同じMCP接続で更新される。Applet専用の`processes.start`と、初期OFFのプロセス起動許可・MCP入力許可を追加した。MCPからは保存して公開したコマンドを実行し、直接callerと元callerの許可を照合する。
- 旧設定の移行・旧IDの付替え・自動清掃は行わない。未対応版を保持して実行停止し、JSONから空のversion 2一覧へ明示的に置き換えられる。A・Bの実入力検証後にWindowsToolsの旧キー送信を撤去し、固定12コマンドを維持した。WindowsToolsの詳細は兄弟repoの検証記録を参照する。
- 発行前レビュー1回と修正確認を実施。説明のnull等の拒否、旧版JSON欄の編集可否、許可取消時の未送信入力取消、private ProcessHostのNUL標準入出力とRPC handle非継承を修正・確認した。起動受付は`processStarted / effectVerified:false`であり、子アプリの処理成功を示さない。結果不明時の再送・終了待ちは行わない。未解決の製品指摘なし。
- 型検査・build・書式・差分確認が成功。標準回帰**634/634**（`1792313165961-e2b976e1`）後、追加試験と後続修正の影響7ファイルを**23/23＋43/43、fail/skip 0**で確認（`1792314054553-23a6bf8e`、`1792315582903-62f0e238`）。依存版・lockfile・供給元検査を維持した。版変更によるpnpm記録不一致は既存のfrozen/offline installで同期し、制限環境で詳細なく停止した.NETビルドは同じコマンドを通常権限で成功確認した。
- ロック解除後の実入力GUI **5群**、実グローバルshortcut **4群**、ソースMCP GUI **19群**、権限GUI **5群**が成功。WindowsToolsなしで専用Windowへの実キー送信、開始対象・修飾キー待機・取消・連続操作、デスクトップからのWin+Eを確認した。最終固定EXEでもMCP **19群**（`mcp-hub-portable-1792315021027`）、権限 **5群**（`applet-api-portable-1792315174333`）、shortcut **4群**（`shortcut-foreground-1792315507951`）が成功。exeの厳密argv・GUI表示、cmd／PowerShell本文、Appletと元MCPの許可交差、設定保存だけでは未実行、許可取消・定義削除・実AppDock終了後のGUI継続を確認した。固定コピーのEXE hashとfixture入力前後も一致した。
- 通常publish終了0。本体**0.62.0**の`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**168900019 bytes / SHA256 `822d633ecbbe2ac2d41a99df8c71b639833b1d1289c10b90e7740839c6d402eb`**。feedの版・size/hash、生成物192ファイルとASAR／Shell、extraResources 629ファイル、ProcessHost/runtimeconfig、fixture非同梱、deploy関連ファイル保持を確認。SDK／Runtimeのソース・版は変更せず、再ビルドで変化した生成DLLは発行物との一致と新しい実入力・固定EXEのNode/.NET/native接続で確認した。変更したWindowsToolsのみ0.2.0として発行し、未変更Applet・全体ZIPは発行していない。
- 証跡は`.artifacts/custom-command-types-20261018/validation.json`、各runの入力SHA256・完全ログ・終了結果、`review.md`、`artifacts-after.json`、`package-content.json`、`zip-content.json`、`cleanup.json`。試験プロセス残存0、不要な調査ファイル4件を削除。今回の成功profileは方式別3件以内で、過去の再利用資料・失敗・利用状況不明を保持し、フォルダー削除0。利用中の設定・認証・実接続先を変更せず、実消灯・PCロック・実SwitchBot操作は行っていない。実利用アプリ固有の入力、UAC、混在DPI、各IMEの手動入力は未確認。commit/push/Release/実利用先deployは未実施。

## 2026-10-18: カスタムコマンドの種類・説明文拡張の設計

- AppDock `0d457b9`（0.61.0）とWindowsTools `3e74ec0`（0.1.6）の保存型・CRUD・入力サービス・公開一覧・共通UI・キー送信実装を照合し、[拡張設計](docs/custom-command-types-design.md)と[段階的実装計画](docs/custom-command-types-implementation-plan.md)を作成した。既存MCP実行種類を維持し、全種類共通の説明文、キー送信、プロセス起動、WindowsTools旧機能撤去を整理した。
- 利用者指定により、WindowsToolsの設定移行を行わない。既存カスタムコマンド設定の作り直しも許容し、単一の新保存形式を採用する。旧形式専用reader・自動変換・旧ID対応・割当自動付替えを作らない。共通の未対応版保持と、JSON編集による新形式の明示保存は区別した。
- 既存のキー送信は本体共通APIを再利用でき、個別説明文の保存・一般公開カタログへの投影は未実装であることを確認。MCPの固定ツールと動的な一覧応答の違い、入力許可、プロセス起動受付、各モードの引数・寿命を設計へ反映した。MCP・Microsoft・Nodeの一次資料も参照した。
- 文書の差分・追加リンク・コードフェンス・参照先・変更範囲を確認し、証跡を`.artifacts/custom-command-types-design-20261018/validation.json`へ保存する。本体8ファイルとWindowsToolsの開発入口1ファイルの文書変更のみ。製品コード・利用中の設定・版・配布物は変更せず、製品テスト・commit/pushは実行しない。

## 2026-10-18: MCP接続先管理のコミット・プッシュ前確認（0.61.0）

- 利用者が、AppDockのMCP経由で接続設定を変更し、SwitchBotのツールを公開してシーンを実行できたと報告した。実接続先での成功は利用者確認として記録し、今回の検証では機器操作を繰り返していない。
- 未コミットの25ファイルをレビューし、実装完了時の617入力と現在値が一致することを確認。型検査・ビルド・関連79件、ソース/固定EXEのMCP GUI各14群、共通API・権限画面5群、固定EXE smoke、publishの成功を再利用した。既存の標準回帰から、依存入力が不変の19ファイル79件も成功ログと照合して再利用した。
- 変更された共通API/設定の依存先、全ソースの境界検査、旧プロセス試験の生成物記録が不足していた範囲だけ追加実行。fixtureビルドと62ファイル**465/465**が成功し、再利用と合わせて本体標準回帰**623/623、fail/skip 0**。新しいfixture入力155ファイルは試験前後で不変。GUIの隔離コピー、最終EXE・feed・ASAR、main生成物160ファイル、WatchのHEADとclean状態も照合した。
- 証跡は`.artifacts/commit-validation-mcp-management-20261018/`の`initial.json`、`validation.json`、各runの完全ログ・入力hash、fixture一覧。stage tree・commit tree・GitHub/AQUAのmain照合結果を同フォルダーへ記録する。製品変更・版更新・再発行は不要で、0.61.0の既発行EXEを維持する。新しいGUI profileは作成せず、再利用資料を保持。GitHub Releaseと実利用先deployは対象外。

## 2026-10-18: MCP経由の接続先管理（0.61.0）

- MCPとAppletの共通APIへ`mcp.servers.getSettings/updateSettings/inspectTools`を追加。独立した初期OFFの「MCP接続先の管理」許可を設け、管理設定の取得、dryRun、登録・編集・削除・並替・有効化、未公開ツールの確認を既存の保存/接続サービスへ接続した。更新はread/execute/write/manageMcpServers、未公開ツール確認はread/execute/useMcp/manageMcpServersを要求し、元callerの許可も照合する。許可設定追加のため0.60.1から0.61.0へ更新。先行する利用許可スイッチの修正を含む。
- 発行前レビューで、詳細取得のrefresh、最終保存時のREVISION_CONFLICT、PC設定のrevision/byte比較と外部変更を保持するrollback、dryRunの共有/PC保存上限を確認・補強した。秘密値はAPI結果・監査へ返さず、保存だけでは下流を起動しない。型検査、build、書式、差分確認が成功。関連6ファイルの回帰は**79/79、fail/skip 0**（`1792303854633-00a07cc3`）。制限環境のTEMP置換/localhost拒否は同じコマンドを通常ユーザー権限で再実行して成功した。依存版・lockfile・供給元検査を変更していない。
- ソース/最終固定EXEのMCP GUIは各**14群**成功（`mcp-hub-source-1792303856508`、`mcp-hub-portable-1792304038574`）。同じSDK接続で管理許可の初期拒否、画面からのON、dryRunのファイル不変、MCP登録、秘密の非露出、未公開カタログ、明示公開、stdio実行、revision競合、削除を確認。外側tools/listは登録・削除で不変。既存のカスタムコマンド、Node/.NET/native、Watch、ショートカットdispatch、実プロセス再起動、利用/管理許可の取消も確認。最終EXEのsmokeは`smoke-1792304104570`で成功。
- Node/.NET共通APIと権限画面のGUI **5群**も成功（`applet-api-source-1792303762408`）。14 Applet行/12 MCP行の初期許可、独立保存、元MCPの設定変更許可、2テーマ×3幅、再起動保持を検証。旧fixtureの権限数・元callerのwrite条件を現行仕様へ更新し、テスト中の設定変更で動的ポートを保持した。途中失敗のログを保持。以後の製品変更はMCP接続保存だけで、このGUIは同保存APIを呼ばないため結果を再利用した。最終EXEの管理スイッチと狭幅の権限画面を目視確認した。
- 通常publish終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144254130 bytes / SHA256 `37cc8230b05601bd59526d38e4ca1eefeee40644c100b7a72c8d693a2368f2b3`**。package/feed/EXEは0.61.0、feedのsize/hash一致、main生成物160ファイルとASAR一致、fixture非同梱、deploy関連3ファイル保持を確認。GUIに複製したEXEのhash一致、各500個のApplet fixture入力が不変。Watch HEADは`b070c2d89f8c1b3d452a5569c99431510a78da2f`、既存Release buildを使用した。
- 証跡は`.artifacts/mcp-server-management-20261018/validation.json`、各runの完全ログ・input SHA256・result、`review.json`、`artifact.json`、`cleanup.json`。最終追記は検証文書のみ。直近3回・固定EXE・再利用資料・失敗記録を保持し、終了/成功/パス/非junction/実行プロセスなしを確認した古いsource profile 1件を整理した。ChatGPT本体の初回ツール反映・利用者の実接続先操作は未確認。利用中の設定は変更せず、commit/push/Release/実利用deployは未実施。

## 2026-10-18: MCP利用許可スイッチの保存経路修正（0.60.1）

- 操作の許可で「MCP接続先の利用」のMCP列を切り替えると、設定ページの操作一覧に`setMcpClient`がなく保存前に拒否されていた。permissionsページにこの既存操作だけを追加し、スイッチから従来の保存・許可取消処理へ接続した。既存項目の不具合修正として0.60.0から0.60.1へ更新。保存形式・新規権限・MCP公開APIの追加はない。
- 既存GUI試験の直接APIによる許可設定を、実際の画面のスイッチ操作へ変更。旧0.60.0 EXEで報告と同じエラーを再現後、修正版のソース/最終固定EXEで各**12群**成功。連携OFF中と稼働中のON/OFF保存、ほかの許可の保持、実プロセス再起動後のON/OFF復元、OFF後のMCPアクセス拒否を確認した。操作の許可画面の撮影結果も目視した。
- 型検査・ビルド・関連6ファイル**75/75、fail/skip 0**・変更ファイルの書式/差分確認が成功。標準全回帰はこの1操作の接続修正では重ねず、設定ページ、Automation、共通API、MCPクライアント、カスタムコマンド、MCP Eventsと実画面を対象にした。発行前レビューに未解決指摘なし。版更新後のpnpm記録不一致は固定lockfileのoffline同期で解消し、依存版・lockfile・検査方針は維持した。
- 通常publish終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144247496 bytes / SHA256 `360fb1df39a1a7f432a972a7a5658a269174010b611f9baae42056291dacbca7`**。EXE/package/feedの版0.60.1、feedのsize/hash、生成済みmain 160ファイルとASAR、fixture非同梱、既存deploy関連3ファイル保持を確認。最終固定EXEのGUIとsmokeも終了0。未変更Appletの再発行・実利用先deployはしていない。
- 証跡は`.artifacts/mcp-permission-fix-20261018/validation.json`と各runのresult/input SHA256/完全ログ、`review.json`、`artifact.json`。GUI profileはソース`mcp-hub-source-1792302452601`、固定EXE`mcp-hub-portable-1792302646061`、smoke`smoke-1792302721895`。旧版の再現失敗と再利用資料を保持し、旧成功source profile 1件を整理した（`cleanup.json`）。利用者の実設定・MCP登録は変更していない。MCP経由の接続先登録は、この修正完了後に追加する別の変更。

## 2026-10-18: MCPハブのコミット前照合（0.60.0）

- 実装完了時の617入力、完全ログ、発行EXE/feed/ASAR、固定コピー、生成済みmain 160ファイル、ソース/固定EXE GUIのfixture各500ファイルを照合した。製品・試験・依存・ビルド入力の追加変更はなく、今回の追記はこの検証文書だけ。WatchのHEADとclean状態も一致している。
- 標準618件のうち後続修正の影響範囲は関連69件の成功で補完し、型検査・ソースGUI10群・最終固定EXE GUI10群・smoke・publishの成功記録を再利用した。必要な成功結果に不足はなく、製品試験・publishは重ねていない。外部サービスの現在の状態やChatGPT実接続を今回再確認したとは扱わない。
- 証跡は`.artifacts/commit-validation-mcp-hub-20261018/initial.json`と`validation.json`。対象61ファイルのstage/作業内容とtreeを`stage.json`、コミット後のSHA/tree照合を`commit.json`へ記録する。ローカルコミットが対象で、push・Release・実利用先deployは行わない。

## 2026-10-18: MCPハブ 第4段階・全段階の実装完了（0.60.0）

- main `7135a68df661b424eef2e37a296ce79d5f986d2a`を基準に、第1〜4段階を実装。`appdock.mcp.call`は共通カスタムコマンド基盤へ登録し、接続先/ツール選択・Schema確認・固定引数・timeoutを保存する。実行は元callerと実API呼出し元の両方を保ち、下流公開条件を検査してjobIdを返す。保存/dryRunでの実行、ハンドラー終了による受付済みジョブの取消、自動再送は行わない。
- 発行前レビューで保存・権限・実行寿命・結果・既存入力経路・配布範囲を確認。初期種類登録の通知順序、接続の名前変更で暗号文を保持する処理、PC設定の保存前容量検証/破損時の読取り専用表示、128文字ツール名の共通API Schemaを修正した。設定/既知エラーを共通警告へ、接続/ジョブの最終失敗を共通エラーへ接続し、取消を通知しない。最終目視で発見したチェックボックスの幅は共通ダイアログの入力selectorを絞って修正。影響先のソースGUI/固定EXEを再検証し、発行を妨げる指摘は残っていない。
- 型検査成功（`1792294037892-88f863b5`）。標準回帰**618/618、fail/skip 0**（`1792293894676-07704090`）。その後のツール名Schema修正と追加試験を含む関連5ファイル**69/69、fail/skip 0**（`1792293963752-cf6f4e6f`）が成功。これ以降の製品変更はダイアログCSSの1 selectorだけで、業務処理の再変更はなく全標準試験は重ねていない。Node 24.21.0/pnpm 12.10.1、既存MCP SDK 1.32.0を維持し、依存更新なし。
- ソースGUI**10群**成功（`1792294187187-39acac24`、profile `.artifacts/mcp-hub-source-1792294187585`）。共通ダイアログの作成・不正JSON修正、API dryRun/create、専用shortcut編集、名称変更後の安定ID、受付後ジョブの成功、公開OFFによる実行拒否、再起動復元を確認。予約fixtureへ600秒を渡した。共通UIは740幅でも横はみ出しがなく項目名を読めることを計測・撮影・目視した。
- 通常publish終了0（`1792294228511-8afe92af`）。最終`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144266502 bytes / SHA256 `7dfa90c720222d25b8267d66a565a695cac6e488154d548e910c39c3392bb43c`**。package/EXE/feedの版0.60.0・サイズ/hash・ASAR内の実装一致・fixture非同梱・既存deploy関連3ファイル保持を`.artifacts/mcp-hub-validation/final-artifact.json`で照合した。共有設定ブロックとPC専用保存の追加により0.59.0からマイナー更新し、段階ごとの同じ未公開変更では版を重ねなかった。
- 最終EXEの固定コピーでGUI**10群**成功（`1792294349535-020914cf`、profile `.artifacts/mcp-hub-portable-1792294349954`）。標準portable smokeも成功（`1792294391539-0c7e81dd`）。既存Watchの接続・実Window表示・保存・停止/再開と、Node/.NET/native種類の実行を含む。fixtureの入力hash前後、Watch HEAD `b070c2d89f8c1b3d452a5569c99431510a78da2f`、Node/MCP fixture hashを各profileの`fixture-inputs.json`へ記録。Watchのソース変更・再発行はしていない。
- 証跡のIDはすべて`.artifacts/mcp-hub-validation/<ID>/`のresult.json・入力hash前後・完全ログを指す。初期化順序の起動失敗（`1792293427388-8b44d897`）と古いUI snapshotを開いた試験の競合（`1792293515238-f4da0783`）は修正/試験同期の見直し後に再確認し、失敗資料を保持した。終了済み成功profileの古い4件と不要な編集helperだけを整理し、直近3回/文書参照/失敗/実接続/検証ログは保持（`cleanup.json`）。後の再利用判定は`final-review.json`を入口とする。
- 全体概要・実装計画・4段階の詳細・README/API/開発/保存/入力文書を現行仕様へ更新。ChatGPT本体の初回反映とRefreshなしの利用、物理キー/マウスの全経路、実照明、OAuth等の初期対象外機能は未確認。SDK同一接続の確認と実DeepWikiの公開データ読取りを、それらの成功へ置き換えない。WindowsTools移行、OSコマンド、永続予約、複数操作は別工程。commit/push/Release/実利用先deployは行っていない。

## 2026-10-18: MCPハブ 第3段階（0.60.0）

- 固定6入口をMCPへ公開し、接続先・ツール別のPC公開リスト、独立した利用許可、ジョブ結果のネイティブcontent投影を接続。レビューでCookieを送らない設定と、画像base64をJSONへ重複展開しない結果表現を確認。型検査/build、関連回帰54/54成功（`1792292724816-5b5bb82b`）。
- ソースGUI9群成功（`1792292684248-6e041c66`）。公開OFFの接続先は一覧に出ず、未公開ツールのID指定を拒否。同じSDK接続で下流ツール追加後の発見/実行、外側tools/list不変、画像contentとisError保持を確認。暗色/740幅の共通ダイアログを撮影・目視した。
- 通常publish終了0（`1792292730345-6c588e17`）。この段階のEXE SHA256 `1171ae49e9346e980e2582ff0412dea0aaf98d27369f8bc7348ba838002ead7b`。固定コピーのGUI9群成功（`1792292845752-46c60453`）。実際のChatGPT登録の初回反映/Refresh操作は未確認で、SDK試験とは区別する。

## 2026-10-18: MCPハブ 第2段階（0.60.0）

- 共通MCPクライアント、共有名簿/PC接続設定/暗号化秘密の分離、共通設定UI、Applet向け6操作と初期OFFのuseMcpを実装。stdioとStreamable HTTP（JSON/SSE）、認証なし/Bearer、Schema/公開範囲/世代の再検査、最大600秒のジョブと取消、二重受付防止を確認。レビューで公開許可の再検査位置と、FastMCPの明示的な結果注釈対応を補った。
- 型検査成功（`1792292392704-b9452114`）、標準回帰615/615成功（`1792292363893-9689ef03`）。独立サーバーとの実通信7群はBearer、環境変数暗号化、許可、ページ分割、画像/isError、Schema変更、不正出力/容量超過、タイムアウト、自動再送なし、redirect防止、AppDockへの循環拒否を含む。
- [公式の公開DeepWiki MCP](https://docs.devin.ai/work-with-devin/deepwiki-mcp)へ実接続し、公開`modelcontextprotocol/typescript-sdk`の目次をread_wiki_structureで取得した。認証情報・ローカルソースは送信していない。結果3621 bytes、succeeded（`1792292203181-25693bee`、`.artifacts/mcp-live-1792292203473`）。実照明等は操作していない。
- 通常publish終了0（`1792292396206-33250b69`）。この段階のEXEは144253761 bytes、SHA256 `a034ffa708f4e7f3ab8b4a67f4ab264a72398b22326697b6557e0f1c2e922948`。固定コピーでGUI8群成功（`1792292524629-87a5b0fa`）。MCPサーバーOFFでstdio登録→一覧→実行→ジョブ結果表示も確認。ソースGUIは`.artifacts/mcp-hub-source-1792292157319`。OAuth、新方式専用サーバー、旧HTTP+SSE、実利用先deployは対象外。

## 2026-10-18: MCPハブ 第1段階（0.60.0、後続段階は作業中）

- 保存型カスタムコマンド、共有CRUD、独立管理許可、Node/.NET/nativeの種類登録、既存入力カタログ、共通設定UIを実装。WindowsTools移行・OS実行種類は対象外。発行前レビューで元callerの伝搬、旧キー送信契約、所有者/宣言/JSON検証、停止世代、取消と結果上限を照合し修正した。
- 型検査・build成功。標準回帰608/608成功（`.artifacts/mcp-hub-validation/1792291247364-aea5b248`）。レビュー後に影響するAPI/カスタムコマンド22/22を再検証（`1792291319967-5b1ada6e`）。証跡は各ディレクトリのresult.json、入力hash前後、完全ログ。既存WatchのRelease build成功、ソースGUIで接続・実Window表示・保存・停止/再開を確認し描画PNGも目視した。
- 通常publish終了0（`1792291334744-1afbd1fa`）。この段階の固定EXEは144246037 bytes、SHA256 `4b04dfc4259f0ee1a36ae828bd4bd1005ac994a8ec4ede7fc34110a08e58564b`。固定コピーの隔離確認7群が成功（`1792291478914-4ac66206`、profile `.artifacts/mcp-hub-portable-1792291479312`）。同じMCP接続で3方式の種類/定義追加と実行、入力競合保持、JSON所有者偽装拒否、安定ID、許可取消、提供元再開、AppDock再起動、削除後の割当保持を確認。
- ショートカットは既存dispatcherの呼出しを検証し、物理キー/マウス操作の実機効果やChatGPT側のRefresh操作は未実施。MCP fixtureの成功をその確認へ置き換えない。後続の段階で同じ未公開版を更新する。commit/push/Release/実利用先deployは未実施。

## 2026-10-18: ジェスチャー一覧のボタンスタイル修正（0.59.0）

- 独立したSettingsSectionへ移した一覧で、汎用`button:not(.toggle)`が追加・割り当て編集・メニューの専用スタイルを上書きしていた。共通ボタンの既定スタイルをクラスなし/primary/secondaryの操作ボタンへ限定し、専用コントロールの背景・余白・サイズ・文字サイズを維持するよう修正。設定・保存・実行処理は変更していない。
- 修正前の隔離ソースGUIで再現。追加ボタンの高さ34px、割り当て欄の背景色と左余白12px、メニュー文字12pxを検出した。修正後は追加30×30px、割り当て欄の透明な背景/枠・左余白0、メニュー文字22pxを確認。両テーマ・1280/900/700幅で計測し、割り当て済み行のスクリーンショットも保存して目視した。
- 発行前レビューで共通CSSの対象、通常操作ボタン/Toggle/専用一覧部品、他の設定カテゴリ、保存経路への影響を確認し、未解決指摘なし。同じ未公開変更の修正として0.59.0を維持。build・ソースGUIが成功し、型検査と標準回帰のうち影響のない**566項目**を入力/ログhashで照合して再利用した。再発行で変わる.NETホスト/helperを使う3ファイル**31/31**は生成入力498件の前後一致を確認して追加実行。標準回帰は合計**597/597、fail/skip 0**。生成入力の記録を補った最終実行は`regression-generated-sealed`を参照する。
- 通常publish終了0。最終`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144227016 bytes / SHA256 `00b90ebba11d91e934ef549b2541d0901d6b2b84a4ff2cdeda987a462a78d42f`**。0.59.0・feed・固定コピーを照合し、deploy関連6ファイルとWindowsToolsの配布物を保持。最終固定EXEでジェスチャーGUI/実入力**17群**、他カテゴリを含む設定レイアウト/検索**6群**、隔離smokeが成功した。実利用先deploy・UAC・混在DPIは未確認。
- 証跡は[コミット前検証](.artifacts/commit-validation-gesture-style-20261018/validation.json)と`.artifacts/gesture-style-fix-20261018/`の完全ログ・入力hash前後・再現結果・レビュー・再利用判定。対象はCSS・GUI試験・本記録の3ファイルだけとし、stage/commit treeの一致を同所`stage.json`・`commit.json`へ記録する。今回の依頼はローカルコミットまでで、push・Release・実利用先deployは行わない。終了済み成功profileの直近3回と検証/再利用資料を保持し、整理結果は同所`cleanup.json`。

## 2026-10-18: 動作設定を一覧の枠から分離・コミット確認（0.59.0）

- 追加依頼により、折りたたみ「動作設定」とコマンド一覧を共通SettingsSectionの独立した枠へ分けた。ジェスチャーページだけ既存のセクション配置へ切り替え、設定検索・即時保存・一覧の検索/編集/実行順を維持。発行前レビューで変更範囲・保存経路・他カテゴリへの影響を確認し、未解決指摘なし。同じ未公開変更の追加修正として0.59.0を維持した。
- 型検査・本体/Default Shell build・試験fixture build・ソースGUIが成功。コミットに必要な本体標準回帰は、実装時の関連7ファイル**71/71**を入力と完全ログのSHA256で照合して再利用し、未実行だった残り**526/526**を追加実行。合計**597/597、fail/skip 0**。WindowsTools標準**38/38**と専用入力試験**112項目**も対象ソース・依存・生成物432件を照合して再利用した。判定と差分は`.artifacts/commit-validation-gestures-20261018/reuse.json`。
- 通常publishを終了0で完了。最終`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144240145 bytes / SHA256 `1f8fdf6b299ba6c15903bf3beeff6b318fe20d529e1f93d05c453c1dbebb4ee8`**。版0.59.0・feed・固定コピーを照合し、deploy関連6ファイルを保持。WindowsTools 0.1.6の既存ZIP/DLLは変更せず、hashと版を再照合した。
- この最終EXEでジェスチャーGUI/実OS入力**17群**、設定レイアウト/検索**6群**、隔離smokeが成功。明暗テーマ・1280/900/700幅・独立した枠・折りたたみ・保存/再読込/再起動を確認し、最終画面も目視した。発行WindowsToolsのprotocol/通常前面/ジェスチャー対象smokeと、専用Windowの**右移動・左移動・全高3件**も再実行して成功。実利用アプリ、UAC、混在DPI、実利用先deployは未確認。
- 証跡は[validation.json](.artifacts/commit-validation-gestures-20261018/validation.json)と同所のログ・入力hash前後・review/environment/generated-inputs/publish-verification。利用者依頼の今回の変更22ファイルとWindowsToolsの6ファイルだけを対象とし、stage/commit treeの一致と、設定済みGitHub/AQUA両mainへの通常push後の先端照合を同所`stage.json`・`commit.json`・`push.json`へ記録する。Release・実利用先deployは行わない。終了済み成功出力の整理は同所`cleanup.json`へ記録し、直近3回と検証/再利用資料を保持する。

## 2026-10-18: ジェスチャーの実行方法・待機表示・動作設定（0.59.0）

- `executionMode`へ「すべて／最初の1つ」を追加。旧設定と初期値は`all`。開始対象と条件で絞った行から登録順・コマンドID重複除去で選び、待機表示と実行は同じ選択処理を使う。移動・クリック・ホイール・キーに適用し、既存の取消・予約・再入防止を維持した。
- 一番上の折りたたみ「動作設定」に、有効・実行方法・操作感・待機表示・Webブラウザ・除外をまとめた。表示位置へ`none`（表示なし）を追加し、入力・実行を継続する。不透明度の保存値は保持する。即時保存、検索での折りたたみ展開、PC別設定の対象パス、公開configureのschema・検証・文書も整合した。
- 発行前に設定互換、表示と実行の一致、条件と順序、保存・共通API、WindowsToolsとの連携、必要な試験をレビューした。GUIで表示位置selectの正確なラベル参照が失敗したため明示的なaccessible nameを補い、型検査・build・ソースUIを再確認して同じ0.59.0を再発行。追加レビュー後に未解決の指摘なし。新設定追加のため本体はマイナー更新。WindowsToolsの修正は兄弟repoの検証記録を参照する。
- 型検査、本体/Default Shell build、関連7ファイルの回帰**71/71**、WindowsTools回帰**38/38**、専用Windowと実OS入力による**112項目**が成功。112項目は先頭/全件の表示とrowIds、条件不一致の除外、重複除去、移動/クリック/ホイール/キー、表示なし、従来の開始抑止・取消・通常入力を含む。捕捉キー/ボタン継続時の2項目は、Window到達数ではなく試験worker直後の観測フックで入力通過を確認するよう試験を修正した。worker通過は1件、後段のWindow到達は0件となる状態を切り分けている。製品の開始条件は変更していない。
- 最終固定EXEでジェスチャーGUI **17群**（実OS入力、条件・順序・同一ID抑止、先頭/全件、表示なし、編集停止、保存、renderer再読込、プロセス再起動、Light/Dark各1280/900/700幅）と設定レイアウト/検索 **6群**、portable smokeが成功。独立WebAppletを発行先から隔離コピーし、入力hashも記録。旧WebApplet設定を使うfixture、async waitForFunctionによる起動待ち、共有settings.jsonだけを読む設定保存検証は現行契約へ合わせた。UI-onlyのソース確認は実入力の成功と区別する。
- 最終本体と発行WindowsToolsを隔離接続し、専用の使い捨てWindowへ本物の入力フック経由でジェスチャーを送信。**右移動・左移動・全高の3件**が成功した。名前形式のprocessを渡す実経路を確認し、実利用Windowは操作していない。WindowsToolsの発行DLLはprotocol、通常前面、ジェスチャー対象固定の各smokeも成功。
- 通常publish終了0。最終`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144227811 bytes / SHA256 `d94da795404415898c77a22026e5de88b90876dfc9857808756dc93248ed976e`**。0.59.0・feed・固定コピー・再起動後を照合。本体/WindowsToolsのdeploy関連計6ファイルを保持し、Applet ZIP内3ファイルも発行payloadとSHA256一致。未変更Appletの再発行、全体ZIP、commit/push/Release/実利用deployは行っていない。
- 証跡: [validation.json](.artifacts/gesture-behavior-20261018/validation.json)、同フォルダーの全ログ・入力hash前後・review.json・generated-inputs.json・publish-verification.json・zip-verification.json。538入力を各実行前後で照合し、後続のCJS試験修正等が無関係な成功結果は試験別の対象入力を再照合して再利用した。無関係な本体/Applet全回帰は未実行。ユーザーアプリ、手操作、UAC、混在DPI、実利用配置先での確認は別途。
- 後片付け: 完了・成功・参照・使用中プロセス・絶対パス・内部リンクを確認し、古いsmoke出力5件を削除。種類/実行方式ごとの直近3件、失敗・状態不明・検証/再利用資料は保持した。削除名と保持理由は同フォルダーのcleanup.json。固定ビルド出力・別作業は整理していない。

## 2026-10-18: MCPハブの初期設計（文書のみ）

- 0.58.1 / `87d2e02e3f2e500a100c567d9d304edac384824f`の共通API、動的登録、公開判定、実行/結果、設定・端末別保存、Node/.NET契約を調査し、[全体概要](docs/mcp-hub-design.md)、[段階的実装計画](docs/mcp-hub-implementation-plan.md)、[第1段階の詳細設計](docs/custom-commands-design.md)を作成。DEVELOPMENTに未実装の設計として入口を追加した。
- 文書間の依存関係、固定MCP入口、管理/実行権限、所有者、保存/取消、段階ごとの完了条件を確認。設定形式の更新時にID/割当を保持する明示更新と、既存の公開フィルターへ新カタログを合流する経路を補った。相対リンク・見出し参照、JSON例3件、コードフェンス、差分の空白を検査した。
- 製品コード、設定、依存、版、配布物は変更していない。ビルド、製品回帰、GUI、実MCP接続の検証は実施しておらず、文書の試験表は今後の計画。実装・発行・commit・push・Release・deployは行っていない。

## 2026-10-18: 設定画面の動作確認とpush（0.58.1）

- 利用者が実利用環境で修正版の動作を確認した。設定UI本体統合`d827906`と復元修正`afa3181`はコミット済みで、本工程は確認記録だけを追加する。製品内容・版・発行物は変更しない。
- 実装時の595入力、9コマンドの成功ログ、ソースGUIと固定EXE GUIの計5結果、生成fixture、EXE/feedのSHA256が一致。標準回帰596/596と固定EXEの4コマンドを再利用し、文書の差分・リンクを追加確認した。照合結果は`.artifacts/settings-restore-push-20261018/reuse.json`。
- 今回の依頼範囲はローカルコミットと、設定済みGitHub/AQUA両mainへの通常push。両方の開始位置は`e239d38`で、対象履歴はその子孫。push後の先端・作業ツリーの照合は同所`push.json`へ記録する。Release・実利用先deployは対象外。

## 2026-10-18: 更新・再起動時の設定画面復元（0.58.1）

- 利用者報告を受け、main `d827906`と0.58.0の固定EXEで、`--restore-view`による復元時の`dock:settingsPage:open`「設定画面の対象が変わりました」を再現した。mainのrouteはsettingsへ到達していたが、先に失敗した本文の接続は再実行されていなかった。通常起動後に手動で設定を開く試験と、再起動後のrouteだけの照合では見落としていた。再現記録は`.artifacts/settings-restore-fix-20261018/reproduce-0580.log`。
- 全体設定とApplet詳細で、startupReadyとmainのnavigation.routeが表示先にそろってから接続するよう修正。準備中は読み込み表示とし、条件が外れれば接続・入力登録・購読・検索移動の監視を解放する。mainの対象/接続検査や即時保存は維持し、時間を決めた再試行や検査の緩和は追加していない。発行前の差分レビューに未解決指摘なし。保存形式・設定項目・依存・lockfile・toolchainは変更せず、通常の不具合修正として本体を0.58.1へ更新した。
- 固定lockfileの依存検査、型検査、本体/Default Shell/Node/.NET fixtureビルドと標準回帰が成功。**596/596、fail/skip 0**。ソースGUIは、手動の開き直しを挟まず、全体設定・safe Shell時の設定・Applet詳細を復元し、入力保存まで確認した。実再起動の試験にも、route確認に加えて本文の表示確認を追加した。
- 通常publishは終了0。最終`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144237236 bytes / SHA256 `02ccdac305fd384a28c1e32914e123a58422a27cf9e0af7fd1513223b9fc774d`**。版・feedのsize/hash・固定コピーを照合し、発行先のdeploy関連3ファイルは元のhashを保持した。このEXEでsmoke、設定本文/両入口の復元、通知からの実再起動と復旧、portable更新の**4コマンドがすべて終了0**。
- portable更新試験は同版再適用を許可した隔離fixtureで、実helperによる終了・EXE置換・再起動、更新後のバージョン情報本文、通常再起動後の「一般」カテゴリ、Appletページの再開を確認した。最初の試験はカテゴリ復元の途中で既定の「表示」を読み取って失敗したため、選択前後の完了を待つよう試験を補正し、全体を再実行して11群成功。追加の製品変更はなく、同じ最終EXEを使用した。確認ダイアログはfixtureで応答し、実Google認証・物理モニター・実スピーカー・UAC・実同期サービスは対象外。
- 証跡は`.artifacts/settings-restore-fix-20261018/validation.json`、各コマンドの完全ログ/result/input SHA256一覧、環境情報、`review.md`。標準回帰後の差分は検証文書とportable更新GUIの待機だけ。当該GUIは再実行し、それを読み込まない標準回帰・ほかのGUIの成功は再利用した。制限環境の依存キャッシュ不足は、通常ユーザー環境で同じoffline固定lockfile検査を成功確認した。再現失敗・途中失敗・現在の固定物と成功資料を保持し、今回の旧成功profile削除は0件。commit前後の照合は同所`stage.json`・`commit.json`へ記録する。push・Release・実利用先deployは行わない。

## 2026-10-18: 設定画面の本体統合（0.58.0）

この時点の復旧試験の再起動照合はmainの遷移先を確認したもの。設定本文の接続までの確認不足は、上記0.58.1で補完した。

- main `e239d38`を基準に、[設計](docs/settings-host-ui-design.md)を実装。`src/shared/settings-ui`を`src/renderer/settings-ui`へ、Default Shellの設定ページを`src/renderer/settings`へ移動した。全体設定とApplet詳細は同じ本体SettingsPageを使い、設定用Shell HTML・View・ビルド入口を撤去。現行契約は[設定基盤](docs/settings-foundation.md)を参照する。
- Shellの有効領域は8件。旧`page.settings`の保存指定・manifestは保持して読込むが起動しない。旧コマンド条件は常に不成立とし、条件の削除で無条件実行へ変わらないようにした。ほかのShell領域・Node/.NET接続・保存ファイル形式・操作許可は維持した。外部の設定描画契約を廃止するため本体を0.58.0へ更新し、依存版・lockfile・toolchainは変更していない。
- 発行前レビューで、ページごとの操作ID・投影・revision・古い接続の拒否、Web/外部Shellへ内部設定APIを公開しない境界を確認。移動時に不足したPC専用保存先の補助情報と、フォームの入力キューを待たない完了通知を修正した。Reactの依存注入を画面ごとのContextにし、入れ子のmain要素を解消。起動時の復元は受付済みの明示的な画面遷移を優先する。未解決の発行阻害指摘なし。詳細は`.artifacts/settings-host-ui-20261018/review.md`。
- 最終型検査・本体/Default Shell/Node/.NET fixtureビルドと標準回帰は成功。**596/596、fail/skip 0**。ソースGUIでは意図的に保存受付を遅延させ、フォームの入力が確定するまで画面遷移しないことを確認した。24個の試験Appletを使うナビゲーションGUIも成功。変更したCJS 46ファイルの構文確認は成功し、文書の新規リンク不備は0件。既存のREADME・過去検証記録の参照欠落は変更していない。
- 最終の通常publishは終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144237074 bytes / SHA256 `b91e8dffd929266a91401bb84f5c32f464ebf5d8f0fcd8e84f0e41fe06289542`**。FileVersion/ProductVersion・update.jsonは0.58.0、feedのsize/hashと固定コピーを照合した。発行先のdeploy関連3ファイルは元のhashを保持。未変更Appletの再発行、全体ZIP、実利用先deployは行っていない。
- この最終固定EXEで、smoke・本体設定・PC専用設定・設定ページ操作・検索・Applet設定・URL確定・Shell領域・WebApplet一覧編集・設定復旧の**10コマンドがすべて終了0**。即時保存、部分JSON、IMEの擬似入力、画像、外部競合、検索と両入口の共用、旧Shell指定の不活性、明暗・狭幅を確認。5つの既存Appletの宣言/停止中payload、無効なリモート一覧fixtureと、別途WebAppletの発行済み管理画面を使用した。復旧試験は同じ隔離profileの実際の再起動まで確認。スクリーンショットも確認した。物理モニター操作・実Google認証/受信・実スピーカー・実同期サービスは未確認であり、確認ダイアログや保存失敗の注入を実操作の成功とは扱わない。
- 初期の固定EXE試験のnull-surfaceは、非同期の待機条件がPromiseの時点で成立扱いになる試験側の問題と判明。mainの遷移先はsettingsを保持していた。待機方法を修正してソース/最終EXEで再確認し、旧発行物の成功は最終EXEの証跡へ流用していない。検索試験の結果文言も旧Shell指定の不活性を表す説明へ修正し、当該試験だけ再実行した。制限環境で失敗した.NET/GUI処理は、必要な同一処理を通常ユーザー権限で成功確認した。
- 証跡は`.artifacts/settings-host-ui-20261018/validation.json`と各コマンドのresult/log/input SHA256一覧。標準回帰時の595入力から後続差分は文書と検索GUIの結果文言/コメントだけで、製品・標準試験の入力に影響しないことを照合した。コミット前後のtree照合は同所`stage.json`・`commit.json`に記録する。ローカルコミットまでが今回の範囲で、push・Releaseは対象外。終了済みの成功profileを23件識別し、現在の証跡・種類ごとの直近3回・失敗/状態不明資料を保持、不要な旧成功profile1件だけ削除した。

## 2026-10-18: 端末別設定のコミット確認（0.57.0）

- 利用者から0.57.0の動作成功の報告を受け、今回の30ファイルを再確認。設定の保存先、既存Applet契約、即時保存、移行・復旧、固定チェック表示と公開文書の整合に未解決指摘なし。利用者の報告を、未実施の実PC間同期・UAC・実タスク復旧の個別成功へ読み替えていない。
- 実装時の512入力、成功ログ、GUI結果と発行物をSHA256で照合し、型検査・ビルド・本体標準**591/591（fail/skip 0）**・固定EXE GUI8群・隔離smokeを再利用。今回の製品修正・版更新・再発行はない。検証記録の追記だけを文書差分として扱い、各試験の対象と判定は`.artifacts/commit-validation-device-settings-20261018/reuse.json`へ記録する。
- 開始時はローカルHEADとGitHub/AQUAの両mainが`1e92f5fa48de63c883ff8524f54355001f3d966e`で一致。明示された範囲は今回のコミットと両設定済み保存先への通常push。stage/commit treeと先端照合は同所の`stage.json`・`commit.json`・`push.json`へ記録する。GitHub Release・実利用先deployは行わない。

## 2026-10-18: 端末別設定と保存先ツールバー（0.57.0）

- EXE隣の`settings-<端末名>.json`を導入。Applet有効状態と保存モード、本体の表示・一般8項目を端末別に保持する。Applet設定一式・開始待ち・表示先は共有／端末専用を選択し、OFFでも端末設定を残す。共有元データへの書戻しと合成値を分離し、動的ページのenabledも端末別に扱う。
- ツールバーのフォーム／JSON／保存先／ファイル対象を同じモデルへ接続。表示・一般は同じチェックボックスをチェック済み・操作不可とした。起動前のGPU値、初回移行と初期化記録、正常世代、複数ファイルの回復記録、Windowsタスクの中断記録と明示復旧を実装。Node/.NETの既存設定契約、公開項目と許可は維持した。
- 発行前レビューと修正確認で、設定切替応答の全設定露出を解消、committed後の後片付け失敗で素材やOS登録を巻き戻さないよう修正、UTF-8 BOM付きJSONの復旧を追加、設定読込失敗時は起動前にGPUを安全な既定値へ固定した。複数ファイル失敗・途中終了・外部変更保持・BOM・初期化記録・生成コマンドdryRunと保存先を回帰で確認。修正後に未解決の発行阻害指摘はない。
- 固定lockfile install、型検査、本体／Default Shell／Node/.NET fixtureビルド成功。最終の本体標準回帰は**591/591成功、fail/skip 0**。Git管理対象と新規入力512件のSHA256を最終検証の前後で照合し、変更0件。依存版・lockfile・toolchainは変更していない。記録は`.artifacts/device-settings-implementation-20261018/`の`inputs-verified-before.json`、`inputs-verified-after.json`、`typecheck-verified.log`、`regression-verified.log`。
- 通常publishを終了0で完了。最終`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144219906 bytes / SHA256 `398fba0e2176310b6e96f69912c5ff3d122eb77d1ed4524705c513809f86e297`**。FileVersion/ProductVersionとupdate.jsonは0.57.0。BOM修正後に同じ未公開版を再発行し、旧発行の成功を最終物の検証へ流用していない。
- 最終固定EXEのコピーhashを照合し、`device-settings-ui-1792274812762/result.json`で8群成功。表示／一般の固定チェック、Applet保存先・フォーム・JSON・ファイル対象の連動、OFF/ONでの再開、不正JSONの転送拒否、明暗、狭幅のエミュレーション、再起動保持、実Node Appletの自己設定、Applet詳細と全体設定の共用を確認。ファイル対象はモデルの照合であり、既定エディターの実起動は試験していない。
- 最終EXEの隔離smokeは`smoke-1792274861510/smoke-result.json`で成功。画面、EXE隣の設定・共有素材、トレイ、正常終了を確認。Windows Task SchedulerのXmlTextはメモリ内の定義だけで往復を確認し、登録は変更していない。実PC間の同期サービス、物理モニター、実スピーカー、UAC承認・実タスクの登録／復旧・サインインは未確認。
- 制限環境のTemp置換EPERM、GUIのCDP起動不可、版更新後のpnpm検証待ちは、必要な同一処理だけ通常ユーザー権限で実行して解消。GUI初期試験の非表示viewportは通常の設定を開くコマンドと表示待機へ、非同期ページ遷移は描画完了待機へ、不正JSONでチェックが変化しない期待動作はclick検証へ修正。元の失敗資料は各fixtureとログへ保持した。
- 未変更Appletの再発行・全体ZIP作成、commit・push・Release・実利用先deployは行っていない。保存・移行・検証の契約は[端末別設定](docs/device-settings-design.md)を参照する。
- 終了時の照合は`.artifacts/device-settings-implementation-20261018/validation.json`。新規GUI成功は直近3回を保持し、失敗資料も保持した。smokeは直近3回と既存の再利用資料を保持。古い候補のプロセス参照確認はCIMアクセス拒否のため完了せず、状態不明分も保持し、削除0件。

## 2026-10-17: pnpmストアのプロジェクト共通設定

- `pnpm-workspace.yaml`に`storeDir: A:/30.PROJECT/.pnpm_store`を追加。同じ`A:\`へ同期する別PCとworktreeでも、ユーザー共通設定に依存せず30.PROJECT直下を使う。開発ガイドに設定場所と、旧ストアを使う既存依存の一度だけの再接続手順を追記した。
- 一時的な`XDG_CONFIG_HOME`をプロセス内だけ指定し、ユーザー設定が旧C:ストアを指す場合と、ユーザー設定がない場合を検証。両方で実効storeが`A:\30.PROJECT\.pnpm_store\v11`となった。実際のユーザー設定・永続環境変数は変更していない。初回検証の比較はpnpmの混在するパス区切り文字で不一致となったため、絶対パスに正規化して確認した。
- `dev.bat install --offline --frozen-lockfile`と`dev.bat run typecheck`が終了0。359パッケージを再利用し、ダウンロード0件。manifest・lockfile・toolchainのSHA256はストア移行前と一致。供給網検査・依存版を維持した。
- 差分レビューで、変更を保存先1項目と開発/検証文書に限定し、既存の待機・依存検査・ビルド許可が不変であることを確認。開発環境設定のみのため製品の版更新・発行は行わない。別PC実機でのビルド・実同期サービスは未確認。commit・pushは未実施。証跡は`.artifacts/pnpm-store-project-config-20261017/`の`configuration-precedence.json`、`install.log`、`typecheck.log`。

- コミット依頼時に3ファイルの差分を再レビューし、製品の実行時コード・依存版・API・製品ビルド定義が不変であるため製品標準回帰・GUI再試験は対象外とした。先のログには入力hash一覧が不足していたため、保存先2条件・offline固定lockfileインストール・型検査を再実行し、すべて終了0、Git管理入力のSHA256が前後一致。今回の証跡は`.artifacts/commit-validation-pnpm-store-20261017/`。検証後の変更はこの記録のみ。

## 2026-10-17: 共通アカウントグループのコミット確認（0.56.0）

- 今回の19ファイルとGmail側11ファイルを再レビューし、共有名簿/PC専用認証/移行・復旧/削除の境界、従来の専用枠、manifestと最低ホスト版、公開文書の整合に未解決指摘なし。追加の製品修正・版更新・再発行なし。
- 実装時の731入力、47ログ、12配布ファイル、10成功結果のhashが一致。型検査・ビルド・関連35件、Gmail25件、固定EXE/配布コードの共有・アカウント・監視・音・同期・背景監視・smokeの成功を再利用した。Node/.NET試験fixtureをビルドし、未実行77ファイル**537/537**を追加。本体標準は計82ファイル**572/572、fail/skip 0**、Gmail標準は**25/25**。追加回帰の前後で対象入力は不変。
- [再利用判定](.artifacts/commit-validation-account-groups-20261017/reuse.json)、[追加回帰と入力hash](.artifacts/commit-validation-account-groups-20261017/remaining-regression.json)、同所`scope.json`・`stage.json`・`commit.json`・`push.json`へ対象、stage/commit tree、GitHub/AQUAの先端照合を記録する。実装時EXE/ZIPのhashも維持。追記はVERIFICATIONのみで、既存証跡・固定fixtureは再利用用に保持した。
- 開始時のGitHub/AQUA両mainはローカルHEADに一致。依頼範囲は今回のローカルコミットと通常push。GitHub Release・実利用先deployは行わない。実Google認証/受信・実同期サービス・実スピーカーは引き続き未確認。

## 2026-10-17: 共通WebアカウントグループとGmail移行（0.56.0）

- main `6d05753`から、[設計](docs/web-account-groups-design.md)と共通ストア・Controller接続を実装。manifestの任意の`accountGroup`で参加し、共通名簿と同じPCのsessionを共有する。選択・監視・通知音はApplet別、認証情報はPC専用。未宣言Appletは専用枠を継続する。Gmail 0.12.0を`at365.google`へ移行し、Calendar本体・API OAuthは対象外。
- 旧UUID・名前・順序・選択・音・監視を保持し、旧sessionは移動せず再利用。元accounts.jsonは保持する。グループ固定、移行済み枠の再取込防止、保存journalによる復旧・競合拒否、破損/欠落/上限を検証。[レビュー](.artifacts/account-groups-20261017/review.md)で初期選択、既知名簿の欠落、非同期音移行の古い書戻し、PC設定からのidentity上書きを修正した。未解決指摘なし。
- 型検査・ビルド・発行は終了0。関連5ファイルの回帰は**35/35、fail/skip 0**、Gmail標準回帰は**25/25**。最終入力hashを記録した回帰は`regression-with-inputs.log`。依存確認の制限環境でのstack overflowと保存renameのEPERMは通常ユーザー権限で同一処理を成功確認し、依存版・lockfile・検査方針を維持した。
- 固定配布EXEの[グループGUI 7群](.artifacts/account-groups-ui-1792183445681/result.json)で旧session再利用、共用Cookie、別グループ/アカウント隔離、独立した選択/監視、片方停止後の継続、明示削除時の全View終了とCookie消去、遅延report破棄、外部削除時のView終了とCookie保持、再起動を確認。実行中の独立したテスト用2Appletを使用した。
- 固定EXEと発行Gmailで[アカウントGUI 14群](../Applet.Gmail.at365/.artifacts/accounts-1792182981256/result.json)、[監視GUI 16群](../Applet.Gmail.at365/.artifacts/gui-1792183066676/result.json)、[音/通知2群](../Applet.Gmail.at365/.artifacts/ui-features-1792183183986/result.json)成功。設定画面の共有範囲の説明を画像確認。以前のテストのNSIS接続・Shell列挙・起動待ち・旧通知enabled期待を現行契約へ合わせた。通知の本番処理は変更していない。
- [本番保存先構成の同期GUI 11群](.artifacts/settings-sync-ui-1792183369636/result.json)は2つの隔離配置間でrename配達を模擬し、共有名簿・原素材の受信、PC別の音選択、再起動保持、壊れた設定の復旧、旧.appdock非変更を確認。廃止済みのWebApplet管理APIを呼ぶ旧fixture部分を除き、今回の共通グループ名簿の同期を検証した。実同期サービスの試験ではない。
- 配布asarのコードを通常Electronで動かす[背景監視10群](../Applet.Gmail.at365/.artifacts/native-background-1792183465873/result.json)と、[最終固定EXEのsmoke](.artifacts/smoke-1792183574430/smoke-result.json)も終了0。テストツールのfocus上書きなしで、未選択2枠の初回描画・背景受信・再読込・認証画面でのactive解除・回収を確認した。実Googleの受信確認とは区別する。
- `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**0.56.0 / 144,222,852 bytes / SHA256 `f4ee7a5c6620dd65cc9ad19ce72a943c33228861ab24c57fcd38314cb24a298a`**。package/feed/EXEと隔離コピーを照合。Gmail ZIPの全8ファイルと発行フォルダーも一致。[検証一覧](.artifacts/account-groups-20261017/validation.json)に入力・ログ・成果物hashを記録する。製品入力は発行後に変更なし。
- 実Google認証・実メール・実スピーカー・実2PC同期は未確認。本体標準回帰全体は未実行。失敗診断・再利用用資料を保持し、不要になった今回の診断スクリプト1件だけ削除。commit・push・Release・実利用先deploy・未変更Appletの発行は行っていない。

## 2026-10-17: 未コミット設定UIのレビューと通知ボイス候補の位置修正（0.55.1）

- main上の利用者の未コミット4ファイル（版・Codex連携・通知画面・共通操作欄）をレビュー。通知の案内・カード名・TTS/MCPへのリンク・操作許可リンクの移動・余白を保持し、共通操作欄の`height:100%`を除去。通知先fieldsetの見出し非表示は維持し、`aria-label`でグループ名を補完。TTSへ通知のタイトル/本文を送信する説明と、Windows通知の表示時間とセンターの操作期間の違いを補足した。[レビュー](.artifacts/settings-review-20261017/review.md)に対象・指摘と対応を記録。発行を妨げる未解決指摘なし。
- 通知ボイスのnative datalistを、共通`SettingsInput`に基づく編集可能な`SettingsCombobox`へ変更。同じ設定Surfaceのtop layerへ候補を表示し、入力欄の左端・幅に合わせ、下の空きが少ないときは上に開く。直接入力、ID/名前の絞り込み、クリック、上下/Enter、Escape/Tabを維持。通知以外のdatalistは変更していない。
- GUIで、ボイスを1回保存するだけでも取得一覧が消える既存問題を確認。全設定revisionでの無効化を、TTS設定とTTS APIキー変更時の無効化へ限定した。取得中に接続設定が変わった場合の旧応答破棄を維持。通知の声/速度・テーマ変更では一覧を保持し、TTS設定変更後は再取得することを確認した。保存項目・保存ファイル・公開schemaの追加削除なし。既存の未コミット版更新`0.55.0→0.55.1`を再利用し、重ねて版を増やしていない。
- 型検査・ビルド終了0。関連7ファイルの回帰**69/69、fail/skip 0**。最初の制限環境ではローカルHTTPのEACCESが発生し、同じ試験を通常ユーザー権限で成功確認。後続のindex変更は通知ボイス一覧revisionだけで、回帰が直接importするcore/sharedモジュールは未変更。影響する実index/設定投影は下記の最終固定EXE GUIで確認した。既存GUIの見出し・順序を新画面へ合わせ、旧インライン接続結果の期待を現在の共通通知ログでの確認へ修正した。
- `publish.bat`終了0。制限環境のpnpmスタックオーバーフローはログを保持し、同じpublish.batを通常ユーザー権限で成功確認。固定lockfile・依存版・供給網検査は変更していない。発行先`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144,219,692 bytes / SHA256 `6dce14ca330ec7005f06b038ae1f4ba0a5bd2f642491a4298982f8bf00ea415c`**。package/feed/EXE FileVersion/ProductVersionは0.55.1、feed size/hashと隔離コピーのhashが一致。
- 最終固定EXEで[通知読み上げ12群](.artifacts/notification-speech-ui-1792179915985/result.json)、[設定使いやすさ8群](.artifacts/settings-usability-1792179931695/result.json)、[レイアウト6群](.artifacts/settings-layout-1792179946780/result.json)が終了0。明暗テーマ・1280/760幅で候補の幅/位置/非重複、直接入力/クリック/キーボードの保存、一覧保持/無効化、TTS/MCPリンク、独立した声/速度継承、隔離Codex登録/接続テスト/解除、8画面の横はみ出しなし、折りたたみ/検索/即時保存を確認。最終EXEの明暗候補画像を表示確認した。
- [検証一覧](.artifacts/settings-review-20261017/validation.json)にソース入力・ログ・EXE/feedのhashとGUI結果を保存。初期の制限環境失敗、候補一覧消失の再現、古いGUI期待による失敗も保持。旧テストの利用プロセスを制限環境のCIMで照合できなかったため、過去の成功分・再利用資料・失敗記録・固定出力を保全して削除0件。全標準回帰、実スピーカー、実Google/dot、別PC/DPIでの操作は未確認。未変更Appletの発行・全体ZIP作成・commit・push・Release・実利用先deployは行っていない。

## 2026-10-17: 音の再生ON/OFFのコミット確認（0.55.0）

- 利用者のコミット・プッシュ依頼に基づき、今回の22ファイルと影響先を再レビュー。追加の製品修正なし。必要範囲は本体の型検査/ビルド・標準回帰、共通音声/一般設定の固定EXE GUI、発行物の版/size/hash照合とした。GitHubのfetch先端とAQUAのmainは開始HEAD `b7ff2355d2ecf79a1dce09cebe7d4ebdaf0f3d6d`に一致した。
- 実装時の500入力・594生成物・完全ログ8本・固定EXE/隔離コピー2本・feed/実行中Shellの記録を照合し、不一致なし。型検査/ビルド・関連94/94・固定EXE2本10群・発行成功を再利用。実装時の音声GUIランナーへの版確認追加は単体試験/製品の入力に影響せず、固定EXEは追加後のランナーで成功したことを確認した。
- 未実行分のためNode/.NET fixtureをビルドし、残り71ファイル465/465を追加。再利用分を合わせて**81ファイル559/559、fail/skip 0**。追加回帰の前後で733入力（生成本体・native・updater・試験fixture）のhashも一致。fixture再ビルドは再利用した10ファイルと固定EXE試験の入力を変更していない。製品の版更新・再発行なし。
- [今回の再利用判定](.artifacts/commit-validation-sound-toggle-20261017/reuse.json)、[追加回帰](.artifacts/commit-validation-sound-toggle-20261017/remaining-regression.json)、同所`validation.json`へ完全ログ・コマンド/日時/終了コード・入力hash・必要範囲を記録。stage対象と作業ファイル、stage tree/commit treeの照合は`stage.json`・`commit.json`、GitHub/AQUA両mainへのpushと先端照合は`push.json`へ記録する。証跡と固定fixtureは再利用用に保持し、削除0件。
- 本体EXEは144,222,055 bytes、SHA256 `81c3aa0f94d3c3614acd2cf3adcda1edf4bd5a5e592d08257d4ef7dac40f8c1d`を保持。実スピーカー・物理ロック/サスペンド・実Google受信は引き続き未確認。GitHub Release・実利用先deployなし。

## 2026-10-17: 一般設定に共通音声のON/OFFを追加（0.55.0）

- 一般ページの先頭に「音の再生」を追加。`host.soundEnabled`は既定ON、欠落時もONとして読み、明示OFF・未知の保存項目は保持する。UI・一般ページの部分JSON・同期受信・生成コマンドは既存の即時保存と設定変更イベントを共有し、起動時も最初の再生前に適用する。設定定義から`appdock.settings.soundEnabled.on/off/toggle`を生成し、既存の公開・操作許可・revision検査を維持した。
- 共通音声FIFOでOFF時に再生中を中断・回収し、再生待ちとOFF中に届いた音を破棄する。ロック・サスペンド中の通知音保留も破棄し、読取中にOFF→ONへ戻しても古い音を再登録しない。TTS生成は継続し、再生省略で失敗通知や待機停止を起こさず完了する。ON後は新しい要求から再生。WebサイトやWindows独自の音は対象外。
- [発行前レビュー](.artifacts/sound-toggle-20261017/review.json)を1回実施し、設定互換・検索/JSON・公開コマンド/権限・起動/同期反映・FIFO回収・保留音・TTS状態を確認。発行を妨げる指摘なし。新しい保存設定の追加につき本体0.54.1→0.55.0のマイナー更新を1回行った。
- 型検査・本体/Default Shellビルド、関連9ファイル**84/84**と通知読み上げ10件、合計**10ファイル94/94、fail/skip 0**が成功。最初の制限環境では設定同期5件が一時ファイルrenameのEPERMで失敗し、同じ84件を通常ユーザー権限で再実行して全件成功。依存確認の制限環境での応答待ちも今回のプロセスだけを確認して停止し、同じ固定lockfile検査を通常権限で成功させた。設定・依存版・検査方針は変更していない。
- 既存`publish.bat`が終了0で`A:\40.ARTIFACT\AppDock.at365`へ発行。本体EXE **144,222,055 bytes**、SHA256 **`81c3aa0f94d3c3614acd2cf3adcda1edf4bd5a5e592d08257d4ef7dac40f8c1d`**。feedの版/size/hash、隔離コピー2本、実行中の本体/同梱Default Shellの版0.55.0を照合して一致した。
- 固定EXEを直列・隔離profileで試験し、共通音声4群（`.artifacts/audio-playback-ui-1792167992269/result.json`）と設定配置6群（`.artifacts/settings-layout-1792168017537/result.json`）、合計**10群成功**。保存済みOFFでの初回再生抑止、TTS/通知音/試聴の単一プレイヤー、取消と回収、生成OFF/切替による再生中/待機/ロック中保留/新規音の破棄、新しい音のみ再開、先頭トグルと即時保存・生成ONの画面反映・既存設定配置を確認。両試験は正常終了を確認し、一般ページのnative Settings Shell画像を目視した。
- [検証一覧](.artifacts/sound-toggle-20261017/validation.json)に500入力の前後hash、完全ログとコマンド/終了コード/日時、594生成物のhash、レビュー、成果物とGUI結果を保存。84件成功後に変更したのは音声GUIランナーの実行中本体/Shell版確認だけで、製品・単体試験・依存・ビルド入力は不変。更新後のランナーで上記固定EXE試験を実行した。最後の記録追記は文書のみ。
- テストフォルダー整理は削除0件。音声GUIのportable成功2回、設定配置のsource成功2回/portable成功3回は方式ごとの直近3回内。失敗・未完了・再利用資料も保持し、[整理一覧](.artifacts/sound-toggle-20261017/cleanup.json)へ記録。全標準回帰はコミット依頼時の不足分として未実行。実スピーカー可聴確認・物理ロック/サスペンド・実Google受信は未確認。commit/push・GitHub Release・兄弟Applet再発行・実利用先deployなし。

## 2026-10-17: ロック中通知保留のコミット確認（0.54.1）

- 利用者のコミット・プッシュ依頼に基づき、今回の20ファイルと影響先を再レビュー。設定・公開API・兄弟Appletの実装変更はなく、追加修正なし。必要範囲は本体の型検査・ビルド・標準回帰と、起動時ロック・通知読み上げ/着信音・共通音声・Node/.NET通知・固定EXE起動とした。
- [実装時の検証一覧](.artifacts/notification-lock-20261016/validation.json)の492入力・必須試験の完全ログhash・各GUIの実行スクリプト・固定EXE・隔離コピー・native fixture 9ファイルを照合し、差分なし。型検査/ビルド・標準551/551・固定EXE試験5本を再利用し、同じ試験の再実行や再発行・版更新は行っていない。EXEは144,221,524 bytes、SHA256 `7a572e4979e3c9602c7d7858eeaf57302895f6bb61083739b70d7374c6df7c87`を保持。asar内182出力と同梱native/updater 412ファイル・feed・Shellの版/hashも再照合した。
- [今回の再利用判定](.artifacts/commit-validation-notification-lock-20261017/reuse.json)に必要範囲と照合結果を保存。stageの対象・作業ファイル・tree、コミット後のtree、GitHub/AQUA両mainの先端照合結果を同所の`stage.json`・`commit.json`・`push.json`へ記録する。実ARSO再起動/物理ロック・実Google受信・可聴確認・複数DPIは引き続き未確認。GitHub Release・実利用先deployなし。

## 2026-10-16: ロック中の通知を保留し解除後に配送（0.54.1）

- 利用者指定で、ロック中の通知表示・着信音・新規読み上げを保留し、解除後に実行する。`NotificationSession`がApplet開始前に現在のロック状態を取得し、Windowsの自動サインイン後にロックされた状態で起動する場合も対象とした。ロック・サスペンド中は表示時間を停止し、更新は同じIDの最新内容に集約。解消・撤回・停止世代の通知は再提示しない。
- Gmail等の独立したaudio API経路を共通`NotificationSounds`で保留し、解除後は既存音声FIFOへ渡す。待機最大32件、停止世代・ホスト終了で破棄。開始済み音声は停止して再開時に繰り返さない。Windows通知の同内容復帰は消音。手動TTSとその試聴、MCP Eventsの外部送信は従来の発行時評価を維持する。設定項目・保存ファイル・公開APIの追加削除なし。
- [発行前レビュー](.artifacts/notification-lock-20261016/review.md)で復帰時の重複suspend blockerを撤去し、外部Eventsとローカル読み上げのcallbackを分離した。型検査・ビルド、発行後native成果物を使った標準回帰**551/551、fail/skip 0**が成功。初回標準回帰後にpublishがnativeを再ビルドしたため最終回帰を追加した。製品と単体試験・依存・ビルド入力はその間変更なし。
- `publish.bat`終了0。通常修正として**0.54.0→0.54.1**のパッチ更新。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144,221,524 bytes / SHA256 `7a572e4979e3c9602c7d7858eeaf57302895f6bb61083739b70d7374c6df7c87`**。package、EXE FileVersion/ProductVersion、asar、Default Shell、feedの版一致。feed size/hash、asar内182出力、同梱native/updater 412ファイルを照合した。
- 固定EXEの起動時ロック3群、通知読み上げ10群、共通音声2群、Node/.NETデスクトップ通知5群、隔離smokeがすべて成功し、隔離プロセスも終了。起動時ロック試験では製品の最初の処理で停止して初回状態だけをlockedへ差し替え、表示時間を越えても全表示先・通知音・TTSを開始しないこと、解除後に各1回だけ配送して表示時間が始まることを確認した。Windows配送はこの試験内では輸送fixture、デスクトップ/バナー・音声プレイヤーは実Electronを使用する。
- 制限環境の依存検証停止・ローカルHTTP/ファイル操作/GUI接続失敗はログを保持し、固定lockfileと検査を維持した同じコマンドを通常ユーザー環境で成功確認。旧GUI selectorを現行折りたたみへ合わせた。起動前デバッガー試験の失敗・停止記録も保持し、停止中フレームの同期評価へ修正後にソース/固定EXE双方で成功した。
- [検証一覧](.artifacts/notification-lock-20261016/validation.json)、[固定EXEの実行時刻・コマンド・ログhash](.artifacts/notification-lock-20261016/fixed-exe-validation.json)、[発行物照合](.artifacts/notification-lock-20261016/artifacts.json)へ証跡を保存。製品入力の差分なしを492入力で照合し、後続の変更は起動fixture追加とデスクトップfixtureの期待値・Window再取得だけ。試験方式ごとの成功は直近3件以内で、失敗・固定出力・再利用資料を保持し、削除0件。
- 実ARSO再起動・実ログイン/ロック操作、実Google受信、スピーカーからの可聴確認、複数DPIは未確認。実利用設定・実利用先のEXEは変更していない。未ステージ・未コミット。push・Release・実利用先deployなし。

## 2026-10-16: MCP Events一時停止のコミット確認（0.54.0）

- fetch後の`main`と`origin/main`はともに`3375854705697deb4f1d757607c64daf3b214065`。今回の9ファイルを再レビューし、追加の製品修正なし。購読の期限と送信許可の分離、OFF中更新、送信待ち破棄、再起動・即時終了、全体取消、説明文とテストの整合を確認した。
- [実装時の検証](.artifacts/mcp-events-pause-20261016/validation.json)の466入力、nativeソース・同梱payload、生成物180ファイル、完全ログとEXE/asar/feedを照合して一致。型検査・ビルド・発行、関連8ファイル89件、固定EXE GUI5群の成功を再利用した。
- Node/.NET試験fixtureをビルドし、未実行の標準回帰72ファイル**451/451**を追加。再利用分を合わせて**80ファイル540/540、fail/skip 0**。ソース・fixture・生成物・同梱native payloadは追加回帰前後でも一致。fixture更新は再利用した8ファイルとMCP GUIの実行対象外。版更新・再発行なし。
- [今回の検証一覧](.artifacts/commit-validation-mcp-pause-20261016/validation.json)と同所`reuse.json`・`plan.json`に再利用判断、入力hash、コマンド、日時、終了コード、ログhashを記録。stage treeとcommit tree、push後のGitHub/AQUAのmainの照合結果は同所`commit.json`・`push.json`へ保存する。公開リポジトリへのpushは利用者の明示許可による。
- 検証資料と既存固定出力を保持し、削除0件。実dotでのWebhook受領・更新・仕事実行は未確認。GitHub Release・実利用先deployは今回の対象外。

## 2026-10-16: MCP Eventsの種類別OFFを一時停止へ変更（0.54.0）

- 変更前に作業ツリーcleanを確認し、`origin/main`を`87c3068`から`3375854705697deb4f1d757607c64daf3b214065`へfast-forwardでpull。競合なし。最新リボンUIを保持したままMCP Eventsの購読寿命と送信許可を分離した。
- 種類別OFFは有効な購読を保持し、その種類の送信待ち・再送待ちを破棄する。OFF中の新規通知を蓄積せず、有効購読の期限・鍵更新を受け付ける。再ON後は新しい通知から配信。MCP無効化・トークン再発行・明示解除・HTTP 410による取消は維持。README・通知仕様・設計書・設定の説明文を更新した。
- [発行前レビュー](.artifacts/mcp-events-pause-20261016/review.md)で、接続起動中の一時的な送信不可を購読削除の条件にしないよう修正し、OFF直後の終了でも送信待ち破棄を保存するよう補完。関連する型検査・ビルド・回帰8ファイル**89/89、fail/skip 0**が成功。OFF中更新、再起動、別種類の購読更新、上限64件、期限切れ、即時終了、送信中・素早いOFF/ON、全体取消と旧方式HTTPを確認。未解決指摘なし。
- `publish.bat`終了0。OFFの操作契約を取消から一時停止へ変えるため**0.53.0→0.54.0**。設定項目・保存ファイル・保存形式の追加変更や移行処理なし。package・EXE FileVersion/ProductVersion・asar・Default Shell・feedの版が一致。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144,217,085 bytes / SHA256 `bab3e035d7745564833df65c38e2115439210a40c5bfc75d3032e7d855bfde1a`**。feed size/hash、隔離コピー、asar内180出力と同梱native payloadが一致。
- 固定EXEの[MCP Events GUI 5群](.artifacts/mcp-events-ui-1792139336407/result.json)が成功。初期OFF、即時保存、説明文とMCP専用見出し、認証付きdiscovery、非公開callback拒否、ON/OFF両状態での再起動、ON復帰を確認。設定画像の表示確認と隔離プロセス終了も確認した。実dotでの購読・期限更新・Webhook受領・仕事の実行は未確認。
- [検証一覧](.artifacts/mcp-events-pause-20261016/validation.json)にコマンド・日時・終了コード・ログhash・466入力とnativeソース・成果物を記録。最終回帰後の変更はGUIの説明文selectorを対象カードへ絞った1件だけで、固定EXE GUI前に記録し実行済み。発行でnativeの13出力hashが変わったため初回照合失敗を保持し、未変更nativeソース・現在のGit基点を含む製品情報・同梱payloadを確認。これらを実行しない8ファイルの回帰と、新しいEXEのGUIを分けて評価した。
- 制限環境の依存検査停止とローカルHTTP EACCESはログを保持し、同じ固定lockfile・試験を通常ユーザー環境で成功確認。依存版・lockfile・検査設定の変更なし。全標準回帰・未変更Applet試験は再実行していない。直近portable GUI3件と過去の再利用指定資料・失敗記録・固定出力を保持し、削除0件。変更は未ステージ・未コミット。push・Release・実利用先deployなし。

## 2026-10-16: リボンUI調整のコミット確認（0.53.0）

- 今回の26ファイルを[再レビュー](.artifacts/commit-validation-ribbon-ui-20261016/review.md)。追加の製品修正なし。実装時のソース498入力、完全ログ、生成物180ファイル、EXE/feedと環境を照合し、型検査・ビルド・9ファイル69件・固定EXEのsmokeを再利用した。
- 既存Node/.NET fixtureをビルド。RibbonBadge DLLのhash変更を初回照合で検出したため、その失敗ログを保持し、影響しない69件と、このDLLを使うGUIを分けて判定した。旧／新DLLのinformational versionはGit基点299cfec／87c3068。未実行の標準回帰71ファイル**462/462**を追加し、再利用と合わせて**80ファイル531/531、fail/skip 0**。生成入力553件は追加回帰前後で一致。
- 同じ0.53.0の固定EXEと更新後の試験DLLで[リボンGUI7群](.artifacts/ribbon-groups-ui-1792138094884/result.json)を再実行して成功。499入力は最終GUI後にも一致。EXE/feedのSHA256は実装時と同じで、版更新・再発行なし。
- [検証一覧](.artifacts/commit-validation-ribbon-ui-20261016/validation.json)と同所reuse.jsonに試験単位の再利用判断、入力・生成物・ログ・成果物hash、stage tree/commit照合を記録。GitHub/AQUAの両mainは開始時87c3068。利用者のコミット・プッシュ依頼に従って対象差分だけを保存し、両リモート先端を照合する。Release・実利用先deployは行わない。
- 今回のGUI成功資料はportable1件追加で直近3件内。再利用資料、初回照合失敗、固定出力を保持し、削除0件。実Google受信・物理的な複数DPI・未変更Appletの全回帰は未実施。

## 2026-10-16: リボンのポップアップ・編集UI・名前保持（0.53.0）

- 開始時に作業ツリーcleanを確認し、`origin/main`を`87c306817dfbff573855400a7733cd2e0e11edea`までfast-forwardでpullしてから実装。一時パネルの見出しと閉じるボタンを撤去し、子ボタンの縦中央を元のグループへ揃えた。幅不足時だけ左右スクロール操作を表示し、リボン内の子コンテナは持続型だけに限定して開閉時の位置ずれを解消した。
- 共通一覧と同じ編集／削除SVGと同幅の操作枠、未導入項目の確認付き削除、グループ／通常ボタンのアイコンのみ表示、空グループ名、通常ボタンの別名を実装。登録元のID・名前・実行先は維持。未導入項目には保存済みの別名、登録名、IDの順で表示し、実際のリボン編集保存時に参照中のApplet登録名を保持する。記録のない過去の名前は復元しない。停止中・再導入済みの項目は削除不可。
- [発行前レビュー](.artifacts/ribbon-ui-polish-20261016/review.md)で要件・保存互換・外部API・設定同期・同値更新・名前保持上限を確認。共通input幅指定を受けたcheckboxの位置を修正し、全子が無効な場合のEscape用フォーカスも補完した。画面画像で項目間余白とcheckboxを確認。未解決指摘なし。`groups[].iconOnly`と`itemOverrides`の追加により**0.52.0→0.53.0**、新規保存ファイルなし。
- 型検査・ビルド・関連回帰**69/69、fail/skip 0**成功。source／固定EXEの[リボンGUI各7群](.artifacts/ribbon-groups-ui-1792137261486/result.json)と固定EXEのsmokeが終了0。子ボタンの縦中央差1 CSS px以下、開閉前後のリボン矩形一致、操作列位置、幅不足／不要時、共通アイコン、ダイアログ項目間20px以上、別名／空欄／アイコンのみ、保存名付き未導入のルートと子の削除、既存Node/.NETバッジ、持続型再起動復元を確認した。
- `publish.bat`終了0。package・EXE FileVersion/ProductVersion・asar・Default Shell・feedは**0.53.0**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144,227,837 bytes / SHA256 `14cec5d4b446c06758480c9cd531a8924533cd124da00f0905c47a815743336f`**。GUIとsmokeの隔離コピー、feed size/hashが一致。ビルド出力180ファイルも収録内容と一致。
- [検証一覧](.artifacts/ribbon-ui-polish-20261016/validation.json)にコマンド・日時・終了コード、入力499件・fixture・ログ・生成物・環境・成果物hashを記録。最終回帰前と発行後の全入力一致を確認。pull/version変更後に固定lockfileで依存状態を更新し、依存の版変更なし。初期の制限環境EPERMと旧fixtureの失敗ログを保持し、通常ユーザー権限での最終回帰・修正済みGUI成功と区別した。
- 今回の成功資料はsource3回／portable1回／smoke1回を保持。以前の再利用資料、実行方式不明の旧成功資料、失敗記録、固定出力も保持し、削除0件。CIMプロセス一覧の取得は制限環境で拒否されたため整理の根拠に使っていない。無関係な全標準回帰・未変更Appletの全回帰、実Google受信・物理的な複数DPIは未確認。変更は未ステージ・未コミットで保持し、push・Release・実利用先deploy・全体ZIPは実施していない。

## 2026-10-16: MCP Eventsのコミット確認（0.52.0）

- コミット対象18ファイルを再レビュー。MCP Eventsだけを選択した場合にも折りたたみ見出しが「通知センターのみ」になっていたため、読み上げとの併用も含めて実際の選択を表示するよう修正し、既存GUIで確認を追加した。他の製品修正はなく、同じ変更の仕上げとして0.52.0を再発行した。[レビュー](.artifacts/commit-validation-mcp-events-20261016/review.md)を参照。
- 統合時の入力・完全ログ・生成物と発行物を照合し、今回のUI/GUI試験2ファイル以外は一致。変更した2ファイルに依存しない13回帰ファイル124件を再利用し、標準回帰の残り67ファイル402件を追加実行して全成功。**80ファイル526/526、fail/skip 0**。型検査・ビルドも再実行して成功。実Node/.NET fixture、更新helper等の551入力は再発行前後で一致し、追加の回帰再実行は不要と判断した。
- [検証一覧](.artifacts/commit-validation-mcp-events-20261016/validation.json)と[再利用判定](.artifacts/commit-validation-mcp-events-20261016/reuse.json)に、484入力・生成物・fixture・ログhash、コマンド/環境/終了結果を記録。文書追記以外の検証後変更なし。stage treeとcommit tree、両リモート照合は同証跡ディレクトリへ記録する。
- MCP Events GUIはsource4群と[最終固定EXE4群](.artifacts/mcp-events-ui-1792135036994/result.json)が成功。MCP Eventsだけの選択と見出し、保存・再起動・解除、認証と公開範囲を確認し、設定画像を目視確認。同じEXEで[リボンGUI6群](.artifacts/ribbon-groups-ui-1792135100514/result.json)も成功し、両GUIのrendererエラーなし。
- publish終了0。package・EXE FileVersion/ProductVersion・asar・Default Shell・feedは0.52.0。最終EXEは**144,213,639 bytes / SHA256 f0f533ba8cb3cd5402cab76f77b24fe84d41608f8d0b7ed5b30cd42403e6c6ea**。両GUIの固定コピー、feedのsize/hash、asar内out全180ファイルとの一致を確認。
- 今回の成功GUIは方式別に直近3回以内。固定出力・失敗資料・再利用証跡も保持し、削除なし。実dot受信・実利用接続は未確認。依頼に従いmainへのコミットとGitHub/AQUAへの通常pushを行う。GitHub Release・実利用先deploy・全体ZIPは対象外。

## 2026-10-16: 最新mainの取り込み・競合解消とMCP Events再発行（0.52.0）

- 依頼に従い、未コミットのMCP Events変更18ファイルをバックアップして退避し、`origin/main`を`299cfec`から`5f5d1ff`へfast-forwardした。最新のリボングループ/バッジ対応を保持したまま変更を戻した。競合した`VERIFICATION.md`と`docs/settings-sync.md`は両方の独立した記録・保存仕様を残して解消。自動統合された`index.ts`も確認し、リボンとMCP Eventsの起動・状態変化・通知経路を保持した。[統合記録](.artifacts/mcp-events-pull-20261016/integration.json)と[レビュー](.artifacts/mcp-events-pull-20261016/review.md)を参照。
- 最新側が0.51.0のため、設定・保存ファイル追加を含むMCP Eventsの統合版を**0.52.0**へ整理し、設計書も更新。統合前の0.51.0の実測記録はそのまま履歴として残す。依存版・lockfileは変更していない。
- 型検査・main/Default Shell/.NETビルドと、MCP Events/従来MCP/通知/共通API/リボン/Shellの関連回帰**124/124（fail/skip 0）**が成功。版変更後のpnpm依存状態は固定lockfileで再照合した。[検証一覧](.artifacts/mcp-events-pull-20261016/validation.json)にログhash・環境・482入力を記録し、試験前後の入力一致を確認。全標準回帰は再実行していない。
- 同じ最終固定EXEで[MCP Events GUI 4群](.artifacts/mcp-events-ui-1792133887266/result.json)と[リボンGUI 6群](.artifacts/ribbon-groups-ui-1792133937012/result.json)が成功。通知選択/購読公開/再起動/解除、Node/.NETバッジ、両展開方式、キーボード・外側クリック・設定編集・復元を確認。rendererエラーなし。通知設定と明暗リボンパネルの画像を確認した。実dot受信・実Google受信の確認ではない。
- `publish.bat`終了0。package・EXE FileVersion/ProductVersion・asar・Default Shell・feedは0.52.0。EXE **144,213,353 bytes / SHA256 d3338bb393077435354eeee3a23e8a9d12b646d64b1142b2ae15dc0ac43111fd**。GUIの固定コピー2つとfeed size/hashが一致し、asar内out全180ファイルもビルド結果と一致。`A:\40.ARTIFACT\AppDock.at365`へ再発行済み。
- 未解消の競合なし。変更は未ステージ・未コミットで保持し、退避前のファイル/差分と今回の検証証跡も保存。今回のGUI成功資料は方式別3回以内のため削除候補なし。push・GitHub Release・実利用先deploy・全体ZIPは実施していない。

## 2026-10-16: リボングループ・展開方式・登録元バッジ（0.51.0）

- 1階層のグループを追加し、持続型はリボン内へ展開してPC専用`ribbon-state.json`へ開閉を保存、一時型は右方向の横1行パネルへ展開する。選択・外側クリック・Escape・画面遷移・アンカー変更等で閉じる。設定の追加/編集/所属/並べ替え/解除と外部編集を共通処理へ接続し、旧配置・未導入ID・未知の追加項目を保持する。
- 登録元のNode/.NETへ`ribbon-badges` capabilityと共通APIを追加。数値/点、99+、親の点、runtime世代・停止・無効化・削除時の回収を確認。外部APIはschema 1を既定として維持し、schema 2を明示選択できる。未対応Shellはリボン領域だけDefault Shellへ戻る。
- 発行前[レビュー](.artifacts/ribbon-implementation-20261016/review.md)でGUIのダイアログ受付、設定投影と競合比較、同位置移動のno-op、Overlayの領域別retryを修正した。修正後の型検査・ビルド・本体標準回帰**510/510、fail/skip 0**が成功。Gmail標準回帰**25/25**も成功。依存の版・lockfileは不変。
- 新グループGUIはsourceと固定EXEで各6群成功。Node/.NET実プロセスのバッジ、キーボード/横スクロール/外側クリック非透過、設定追加・編集・移動・解除、追加フィールド保持、再起動後の復元を確認。明暗テーマのパネルと設定を画像確認した。sourceの暗色fixtureの設定パス誤りを試験側で修正し、固定EXEでは暗色適用もassertした。既存パレットGUI7群と固定EXE標準smokeも成功。
- `publish.bat`終了0。設定と保存ファイル追加のため本体は0.51.0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**144,205,456 bytes / SHA256 7ec2de32a2c8c553e38a78f8f89b05b8de0edfd32c48100e56564b504d9d32ce**。EXE版・package・Default Shell・feedが一致。隔離コピー2つのhashと、asar/外部Shellに含むビルド済み177ファイルを照合した。
- [検証一覧・ログhash](.artifacts/ribbon-implementation-20261016/validation.json)、[最終入力hash](.artifacts/ribbon-implementation-20261016/inputs-after.json)、[実行環境](.artifacts/ribbon-implementation-20261016/environment.json)、[固定EXE GUI](.artifacts/ribbon-groups-ui-1792131950607/result.json)を保存。本体開始HEADは`299cfec95cef4833e18042ba854cf975a497059e`。最終単体試験後の変更は暗色GUI試験の設定パス/待機だけで、固定EXE試験を再実行した。製品入力は不変なので単体回帰を再利用する。コミットのtree/入力照合は[コミット証跡](.artifacts/commit-validation-ribbon-20261016/validation.json)へ記録する。
- 制限環境での.NET/Electron/一部回帰の実行失敗は通常ユーザー権限で切り分け、成功結果を上記へ記録。旧設定期待値とGUI fixtureのmanifest/登録/selector誤りは試験側を更新し、修正前の失敗記録も保持。製品指摘の未解決なし。実Google受信、複数の物理DPI/画面は未確認で、未変更Appletの全GUIは再実行していない。
- 整理: 今回のグループ成功資料はsource3件/portable1件、パレットsource1件、smoke1件を保持。失敗・再利用資料・固定ビルド出力も保持し、削除0件。GitHub Release・実利用先deploy・全体ZIP作成は行っていない。

## 2026-10-16: MCP Eventsと通知種類別のdot連携（統合前0.51.0）

- 共通の新規通知発行口から、通知設定で選んだ種類だけを`appdock.notification.created`として配信する機能を追加。初期値OFF、タイトル/本文の送信をUIに表示し、「通知センターのみ」で解除する。MCP 2.0のdiscovery/eventsと従来SDK接続を併存させ、既存認証・操作許可を維持した。[設計書](docs/mcp-events-design.md)へ利用条件、通信・保存・再送・取消と実利用確認の手順を記載。
- [発行前レビュー](.artifacts/mcp-events-20261016/review.md)で認証、公開HTTPS callbackの検証/接続先固定、署名、暗号化保存、期限・再送・取消を確認。OFF→ONの競合、DNS待ちの取消、期限切れ再購読による旧キュー復活、保存失敗後の配信を修正し、対応試験を追加した。発行を妨げる未解決指摘なし。設定項目とPC専用`automation-events.json`の追加により0.50.0→0.51.0、依存変更なし。
- 型検査・本体/Default Shellビルド・関連回帰**80/80（fail/skip 0）**が成功。対象はMCP Events、既存automation/ネットワーク、通知policy/読み上げ/delivery/servicesと共通API。[照合資料](.artifacts/mcp-events-20261016/validation.json)へコマンド・完全ログ・実行環境・入力hashを記録。最終試験前の446入力は発行後も一致。全標準回帰と無関係Appletの試験は今回実行していない。
- [ソースGUIの4群](.artifacts/mcp-events-ui-1792130588423/result.json)と[最終固定EXEの4群](.artifacts/mcp-events-ui-1792131218498/result.json)が成功。初期OFF、即時保存と認証付きdiscovery/list・非公開callback拒否、完全再起動後の復元、「通知センターのみ」の解除を確認。rendererエラーなし、設定画面の画像を目視確認。購読・署名・Webhook配信/再送はローカルfixture試験であり、実際のChatGPT/dot受信・起動の確認ではない。
- `publish.bat`終了0。本体package、EXEのFileVersion/ProductVersion、asar、Default Shell、feedは**0.51.0**。EXEは**144,202,278 bytes / SHA256 f0d1e2fbcc4f9d85ffa67c758ba9545b40a30d6a502de93e883df22584cfcfa4**。固定GUIコピー・feed size/hashが一致し、asar内のout全173ファイルもビルド結果と一致。発行先は`A:\40.ARTIFACT\AppDock.at365`。
- 制限環境のloopback/GUI失敗とpnpm依存検証の停止はログを保持し、同じ範囲を通常ユーザー環境で再実行して成功。最初のGUI fixtureのTOML名を既存契約の`config.toml`へ修正して再実行した。試験入力と版・依存検査は維持。今回のGUI成功は方式別に各1回のため整理候補なし。失敗資料・固定fixture・再利用証跡を保持した。
- 実際のdot連携は、ChatGPTからAppDockへ届く接続経路（Secure MCP Tunnel等）、プラグイン再スキャン、dotの監視登録と受信→実行→解除の確認が必要で、未実施。現在の実利用設定・接続先は変更していない。ローカル発行まで完了し、未コミット。push・GitHub Release・実利用先deploy・全体ZIPは実施していない。

## 2026-10-16: 通知配色のコミット確認

- 今回の15ファイルを再レビューし、追加の製品修正なし。実装時の465入力・完全ログ・実.NET fixture・0.49.1のEXE/feedをSHA256で照合し一致。型検査/ビルド、関連82件、配色GUI各4群（source/固定EXE）、固定EXE通知設定GUI8群を再利用した。
- 基点`39ab0f8`の標準回帰498件の証跡を照合。変更はShellの配色/設定UI、GUI試験と版番号で、コア・標準試験・依存・ビルド定義は一致。変更したShellを参照する試験は今回の82件とGUIで確認済み。残りのうち、発行時に再生成した更新helper/実Node・.NET出力を使う4ファイル33件だけ追加実行し、全成功。重複を除き**再利用465件＋今回33件＝498/498、fail/skip 0**。
- [コミット検証](.artifacts/commit-validation-notification-colors-20261016/validation.json)に再利用元・差分判定・入力/生成物/ログhash・実行環境とstage/commit treeの照合を記録。製品と発行物は実装確認時のままで、再発行・追加版更新なし。試験自身の一時領域整理以外は削除せず、固定出力と再利用証跡を保持。push・外部公開・実利用先deployは行わない。

## 2026-10-16: 通知レベルの配色と設定ボタン整理（0.49.1）

- インフォメーション通知をライトで白背景/深い緑、ダークで暗い背景/明るい緑へ調整。エラーは赤系・警告は黄系を維持し、Default Shellのバナー・デスクトップ・通知センターで共通CSSを使う。本体とAppletに同じ実レベルの配色を適用する。レベル名を残し、色だけに依存させない。
- 既存の登録契約`levels/defaultLevel`と発行時の`level`を使用。Nodeで3つの既定レベルと明示上書き、実.NETで既定warningの継承を確認。API・設定項目・保存ファイルの追加削除はなく、0.49.0→0.49.1のパッチ更新。通知設定の「既定に戻す」ボタンと不要なUIリセット分岐/CSSを削除し、保存値・個別編集・必須バナー補完は維持した。
- [発行前レビュー](.artifacts/notification-colors-implementation-20261016/review.md)で要件、明暗テーマ、保存互換、公開契約、表示先を確認。従来のダーク主要ボタンの白文字コントラストを3.83:1から改善。全レベルの本文・レベル表示・主要ボタンは明暗両テーマで4.5:1以上、info主要ボタンは5.20:1。バナー・センター・固定EXEデスクトップの画像を目視確認した。
- 型検査・ビルド・関連回帰**82/82**成功。配色GUIはsource/固定EXEで各4群、既存通知設定GUIは同じ固定EXEで8群成功。3表示先×2テーマ、Node/.NET、操作、通知ON/OFF、秒数/手動消去、不正値非保存、種類別編集、検索、再起動後の設定/安全な履歴保持を確認。無関係な全標準回帰・全Applet回帰、OS管理のWindows通知外観、追加Shell固有の配色は未確認。
- 制限環境の依存公開日検証の停滞・.NETビルド/Electron起動失敗はログを保持し、同じ固定依存/コマンドを通常ユーザー権限で再実行して成功。GUI試験側の非同期起動待ち・隔離storageパスを修正。既存設定GUIの旧リセット操作は、削除されたボタンの不在と個別変更/再起動後の保持へ更新して再実行した。製品の追加修正・再発行は不要だった。
- `publish.bat`終了0。EXE/feedは**0.49.1 / 144,208,419 bytes / SHA256 `35ccced4b4aa623de83a5aafc14a46727ef32b62ad99abd2d196f545bbaef414`**で一致。両GUIの隔離コピーも一致。記録は[検証一覧](.artifacts/notification-colors-implementation-20261016/validation.json)、同所の入力/ログ/環境hashを参照。基点HEADは`39ab0f8a4edbeb8711ba89e43b1ebdd8bef6e59d`。後続変更は既存GUI試験と文書のみで、最終GUIを再実行した。
- 整理は成功分が実行方式別3件以内（配色source1/portable1、通知設定portable2）。固定出力・再利用資料・失敗記録を保持し、削除0件。動作確認用publishまで。コミット・push・公開・実利用先deployは未実施。

## 2026-10-16: インフォメーション通知のコミット確認

- 実装時の463入力、完全ログ、更新helper、0.48.0のEXE/feedのSHA256が一致。型検査・ビルド・関連145件、情報GUI各9群（source/固定EXE）、固定EXEの警告4群・ホーム8群を再利用した。対象差分を再レビューし、追加の製品修正なし。
- 標準回帰の未実行59ファイルを追加実行し352/352成功。再利用分と合わせて**497/497、fail/skip 0**。Node/.NETの試験fixtureを固定ツールで再ビルドした。制限環境の.NETビルド失敗ログを保持し、同じコマンドを通常ユーザー権限で再実行して成功。標準回帰も実プロセス・ローカル通信が必要な通常ユーザー権限で実行した。
- [コミット検証](.artifacts/commit-validation-information-20261016/validation.json)と同所`reuse.json`へ再利用元・入力/生成物/ログhash・実環境・stage treeとコミット後の照合を記録。製品入力と発行物は不変のため再発行・追加の版更新なし。今回の追加試験は既存fixtureと試験自身の一時領域整理を使用し、再利用資料・失敗記録・固定出力を保持した。push・外部公開・実利用先配置は行わない。

## 2026-10-16: インフォメーション通知と必須バナー（0.48.0）

- [設計](docs/information-notifications-design.md)に沿って本体にインフォメーション通知を追加。「エラー通知」「警告通知」「インフォメーション通知」の順、情報は既定ON・バナーのみ・6秒・読み上げOFF。警告と情報の有効時バナーを必須化し、種類全体のOFFは維持した。設定項目追加のため0.47.0→0.48.0。新規保存ファイル・一般Applet/MCP公開APIは追加しない。
- 手動更新の確認結果・取消、Codex連携の接続テスト成功/既存保存結果、操作許可、TTSキー保存/削除・受付/停止、Webアカウント操作、既存コマンド実行結果を共通通知へ接続。接続テスト失敗と更新失敗は共通エラー。下側toast/home-resultと更新結果表示を撤去し、進捗・キャンセルは維持。停止通知による読み上げ再開も抑止する。
- 発行前[レビュー](.artifacts/information-implementation-20261016/review.md)で寿命、重複、秘密値、旧設定補完、公開境界を確認。更新件数を今回の結果だけから生成し、停止通知と更新適用失敗の経路を修正・再検証した。未解決の製品指摘なし。
- 型検査・ビルド成功。関連回帰145/145成功。発行で再生成した固定更新helperでも更新回帰27/27成功（145件の更新試験を再実行したもので、別の27件とは数えない）。無関係な全Applet回帰は未実行。
- 情報GUIはsource/固定EXEで各9群成功。設定順・必須バナー・6秒・旧設定非書換・OFF/ON非再送・実ループバック接続テスト成功/失敗・更新有無と詳細遷移・エラーの安全な文面・低速ローカルHTTP確認中の進捗と取消・Webアカウント追加・TTSキー保存/削除と停止を確認。画面画像も目視確認した。
- 同一固定EXEで既存警告GUI4群、ホーム/Shell切替/画面遷移中のコマンド結果等8群成功。旧PC専用データはfixtureだけを用い、実利用データを操作していない。実Codexクライアントからの接続、実外部更新適用、実TTSサーバーの生成音声は未確認。
- 制限環境のMCP/更新helper試験12失敗、Electron起動不可、依存検証停滞を通常ユーザー権限で切り分け、上記最終試験は成功。GUI試験側の旧表示待機、fixtureの最低ホスト版、設定snapshot参照、前操作の通知を誤採用する待機を修正し、再実行した。旧失敗を成功扱いしていない。
- `publish.bat`終了0。`publish/AppDock.at365.exe`は144,203,445 bytes、SHA256 `ea8b814a605c044c6c151c098e67c1b834f3b25e70a7b0f002b0c0044c5eaa79`。`publish/update.json`の0.48.0・サイズ・hashと一致し、各隔離コピーも一致。
- 証跡: [検証一覧](.artifacts/information-implementation-20261016/validation.json)、[入力hash](.artifacts/information-implementation-20261016/inputs-after.json)、[ログhash](.artifacts/information-implementation-20261016/logs.json)、[実行環境](.artifacts/information-implementation-20261016/environment.json)。開始HEADは`318e64271c14118ef6c29e6644add8d6e7bad746`。製品入力は最終試験以後不変。変更したGUI試験だけを再実行し、文書追記は製品の再検証対象に含めない。
- 生成物整理: 対象の成功記録は実行方式別に3件以内（情報source2/portable1、警告source2/portable3、ホームportable1）。失敗fixture・再利用証跡を保持し、削除0件。コミット・push・外部公開・実利用先配置なし。

## 2026-10-16: 共通ダイアログのフォーカス余白とモニター一覧のコミット確認

- 利用者画像で入力欄の左のフォーカス枠が切れることを確認。共通`SettingsDialog`のスクロール本文のpaddingを四辺6pxに統一し、outline 2px＋offset 3pxを確保した。モニター一覧への対応と同じ変更の仕上げとして0.46.0で再publish。明暗1280/700幅で実際に入力へfocusし、左右の枠が本文のクリップ範囲に収まるassertと画像確認を追加した。
- [レビュー](.artifacts/commit-validation-monitor-list-20261016/review.md)と[試験単位の再利用判定](.artifacts/commit-validation-monitor-list-20261016/reuse.json)を保存。前回実装時との製品差分はCSSのみで、型検査・実装時15件とApplet回帰8群/RPC/native smokeを再利用。最後の本体標準回帰から変更された生成JSの参照関係と、動的読込/外部入力の影響を確定できない試験を抽出し、60ファイル432件を新規実行して成功。再利用53件と合わせて**本体485/485、fail/skip 0**。
- 最終固定EXEで[モニターGUI7群](../Applet.WallpaperSlideshow.at365/.artifacts/monitor-list-ui-1792077765049/result.json)、[Web一覧7群](.artifacts/web-list-ui-1792077777646/result.json)、[AI16群](.artifacts/ai-ui-1792077790674/result.json)が終了0。フォーカス枠・64フォルダーのスクロール・固定フッターと既存保存操作を確認。フォルダー選択応答のstubはsource GUI、固定EXEは手入力、AIはローカルfixture。実壁紙は操作していない。
- publish終了0。EXE/FileVersion/ProductVersion/package/asar/Default Shell/feedは0.46.0。**144,205,410 bytes / SHA256 ea55bce902705dc45acdc82288b884d1d4c3e6ea94c36f61eca418a8d8683416**。3つの固定コピー、feed size/hash、asarのout全166ファイルを照合。Applet0.4.8の配布物とZIPは前回から同じhashで再発行なし。[今回の検証証跡](.artifacts/commit-validation-monitor-list-20261016/validation.json)へ入力/fixture/ログ・stage tree/commitを記録する。
- 両repoの今回の変更だけをコミット対象とした。失敗/旧画像・再利用資料・今回の証跡は保持。push・Release・実利用先deploy・全体ZIPは未実施。

## 2026-10-16: WallpaperSlideshowのモニター一覧対応（0.46.0）

- 共通一覧へ任意の`list.showIndex`を追加。モニター番号を表示し、編集・削除・並べ替えの対象名にも使う。共通編集フォームに`DirectoryListInput`を追加し、フォルダー追加/選択/削除、既存の64件上限を保持。旧JSON文字列の一覧を配列として競合比較し、旧Folder/数値Modeは編集した登録だけOK時に正規化する。未知の項目・別の登録・取消時の保存形式は保持する。
- 型検査・ビルド・変更箇所の整形・diff検査が終了0。設定宣言/保存/競合/Shell境界の関連**15/15、fail/skip 0**。後続の変更は共通フォームのスクロールとGUI試験のみで、単体試験の対象ロジックは同じため再利用。本体の全標準回帰、未変更Appletの全回帰は実施していない。
- [発行前レビュー](.artifacts/monitor-list-20261015/review.md)で保存契約・番号の非永続化・最低版を確認。64フォルダーの画像でfieldsetの内容がフッターへ重なる問題を発見し、スクロールdivと入力無効化用fieldsetを分離。本文とフッターの境界assertを追加し、型/ビルドとsource GUI7群を再確認、同版を再発行した。
- 最終固定EXEで[モニターGUI7群](../Applet.WallpaperSlideshow.at365/.artifacts/monitor-list-ui-1792076415525/result.json)、[Web一覧7群](.artifacts/web-list-ui-1792076427538/result.json)、[AI16群](.artifacts/ai-ui-1792076440085/result.json)が終了0。旧形式の取消/移行、登録単位の保存、追加/順序/削除/競合、明暗1280/700、詳細設定入口、64件の本文スクロールと固定フッターを確認。最終画像を目視。フォルダー選択/取消の共通API経路は[source GUI](../Applet.WallpaperSlideshow.at365/.artifacts/monitor-list-ui-1792076265412/result.json)でnative dialog応答をstub、固定EXEでは手入力を使用。実壁紙は変更せず、実Appletを無効に保った。AIはローカルfixture。
- 最終publish終了0。EXE/package/asar/Default Shell/feed/FileVersion/ProductVersionは0.46.0。**144,198,099 bytes / SHA256 2601dd4ca71288c7e27f9c7ae72f6ddd6de118ec161bca9d31ced3adadc88718**。3つのGUIの固定EXE・feed size/hash・asar内out全166ファイルを照合。[検証証跡](.artifacts/monitor-list-20261015/validation.json)へ両repoの入力、コマンド別ログhash、Applet ZIP・固定資産を保存。
- 版更新後の固定依存installで整合を回復し、依存版/lockfileは変更なし。portableのPlaywright inspector接続timeoutは通常起動＋CDPへ変更。64件試験の外部設定反映待ち不足も修正した。途中の失敗/旧発行画像は保持し、成功扱いせず最終結果を上記へ限定。今回の参照資料・再利用資料を保持。未コミット、push・Release・実利用先deploy・全体ZIPは未実施。

## 2026-10-15: 並べ替え共通化と実行順アイコンのコミット確認（0.45.2）

- ショートカット／ジェスチャー共通の`CommandBindingToolbar`で「実行順…」を既存`ListIcon(order)`と共通アイコンボタンへ変更。読み上げ用の名前、対象別tooltip、既存の開く操作を保持。今回までの並べ替え共通化を含めてレビューし、未解決指摘なし。同じ変更の仕上げとして0.45.2を再publishした。
- 型検査・ビルド・変更TSXの整形・diff検査が成功。標準回帰は**484/484**を確認。以前の成功ログ・試験ソース・依存・ツール・生成mainコードを照合して451件を再利用し、UIソースを走査するShell境界1件と再生成したnative/updaterを使用する4ファイル32件を新規実行、fail/skip 0。[入力比較・結果](.artifacts/commit-validation-order-dialog-20261015/validation.json)と[レビュー](.artifacts/commit-validation-order-dialog-20261015/review.md)に根拠を記録。
- 新しい固定EXEで[ショートカット8群](.artifacts/shortcuts-ui-1792072650204/result.json)、[ジェスチャーUI8項目](.artifacts/gestures-ui-1792072743842/result.json)、[Web一覧7群](.artifacts/web-list-ui-1792072792924/result.json)、[AI16群](.artifacts/ai-ui-1792072826650/result.json)が終了0。両アイコンからダイアログを開き、ツールバー画像を目視確認。既存の並べ替え・保存・競合・取消・テーマ・狭幅の回帰も成功。ジェスチャーは物理入力省略の明示を含むUI試験、AIはローカルfixtureである。
- publish終了0。package・EXEのFileVersion/ProductVersion・asar・Default Shell・feedは0.45.2。最終EXEは**144,206,273 bytes / SHA256 89c01d506448316826cde330574619218698af24cf3e61fac8b16f835c263941**。4つのGUIの固定コピー、feed size/hash、asar内out全166ファイルの一致を確認。
- 変更16ファイルをコミット対象とした。再利用資料と今回の検証資料・失敗/不明資料は保持。未変更Appletの再発行、全体ZIP、実利用先deploy・push・Releaseは実施していない。任意の外部Shellの実機確認は未実施。

## 2026-10-15: 実行順と表示順の共通テンプレート（0.45.2）

- `OrderDialogFrame`を追加し、ショートカット／ジェスチャーの`BindingOrderDialog`と表示順の`SettingsOrderDialog`で外枠・見出し・本文・エラー・操作欄を共有。実行順側の幅760px、余白24px（狭幅18px）、テーマ色・行表示を採用。対象選択・条件説明・複数グループ・同期適用と、表示順側の非同期保存・失敗時保持は各Controllerへ残す。仕様は[共通テンプレート](docs/settings-list-editing.md#shellで並べ替えを再利用する)。
- 型検査・ビルド・整形・diff検査が成功。保存/順序の関連34件が成功し、その後のCSS・試験画像採取・版だけの変更は単体対象へ影響しないため再利用。[レビュー](.artifacts/order-frame-review.md)と[入力/成果物照合](.artifacts/order-frame-validation.json)にログ・入力hash・再利用理由を記録。全標準回帰と無関係Appletの再発行は実施していない。
- 最終固定EXEで[ショートカット8群](.artifacts/shortcuts-ui-1792071734090/result.json)、[ジェスチャーUI8項目](.artifacts/gestures-ui-1792071812381/result.json)、[Web一覧7群](.artifacts/web-list-ui-1792071834728/result.json)、[AI16群](.artifacts/ai-ui-1792071847655/result.json)が終了0。ジェスチャーは`APPDOCK_GESTURE_UI_ONLY=1`で物理入力を省略した旨を含む8項目。AIはローカルfixture。任意の外部Shell自体の実機確認は未実施。
- 並べ替え/対象切替/取消/フォーカス復帰/外部競合/失敗時の順序保持、明暗・狭幅、22件の一覧でも固定フッターが見えることを確認。各Shell内のdialog画像を目視し、ジェスチャー・ショートカット・初期ショートカットの枠/余白/色の一致を確認。
- レビューでfieldsetのflex制約による長一覧スクロール不良を修正。さらに発行物の画像で本文clipによるフォーカス枠欠けを修正して同版を再発行し、4種類のGUIを再実行。旧試験の親Window画像はShell本文を含まず、テーマもUI状態に再上書きされていたため、dialog locatorでの採取と実際のhostテーマ保存/反映待ちへ変更。初回失敗/旧EXE資料は保持する。
- 最終publish終了0。EXE/FileVersion/ProductVersion/package/asar/Default Shell/feedは0.45.2。**144,200,797 bytes / SHA256 ca3474068a2fcaa2827dfedbbaeeb4ec7ae31c266a258b944859637ef1512dee**。4つのGUIの固定コピーと最終EXE、feed size/hash、asar内out全166ファイルの一致を確認。
- 今回の編集専用一時スクリプトを削除。既存テスト資料は再利用参照または実行方式/稼働照合が未確定のため保持し、失敗・不明資料も削除していない。本体publishまで完了、未コミット。実利用先deploy・push・Release・全体ZIP作成は未実施。


## 2026-10-15: 設定の並べ替えダイアログ共通化（0.45.1）

- `SettingsOrderDialog`を共有settings-uiへ追加し、AIサーバーと宣言型object-list（登録サイト・初期ショートカット）から使用。既存AIの行スタイル、番号、説明、ドラッグハンドル、上下ボタン、Alt＋↑↓、移動案内を共用。選択肢の名前は一覧と同じラベルを使用する。Default Shell専用CSSへの依存を共通CSSへ移動。再利用契約は[一覧UI仕様](docs/settings-list-editing.md#shellで並べ替えを再利用する)へ記載。
- [発行前レビュー](.artifacts/order-dialog-review.md)で保存中のドラッグ拒否と表示ラベルの統一を確認・修正し、最終ソースの型検査・ビルド・関連10件・整形検査が終了0。既存の設定値、保存形式、競合判定、APIは変更せず、パッチ更新0.45.1。全標準回帰、無関係Appletの再発行は行っていない。
- [固定EXEのWeb一覧GUI6群](.artifacts/web-list-ui-1792070542551/result.json)と[AI GUI16群](.artifacts/ai-ui-1792070555261/result.json)が終了0。設定/詳細の両入口、OK保存、取消、キーボード/ドラッグ、フォーカス復帰、既存競合検出、明暗、狭幅を確認。登録サイトと初期ショートカットの画像を目視確認。狭幅はCDPの720pxエミュレーション。AIはローカルfixtureで、実LLMは未使用。任意の外部Shell自体の実機検証は未実施。
- `publish.bat`終了0。package、EXEのFileVersion/ProductVersion、asar、Default Shell、feedは0.45.1。EXE **144,195,150 bytes / SHA256 8cd63682da6ab7fd28fb839a5789d10f652ef821d993b79861fec5edd6455e71**。両GUIの固定コピー、feedのhash/size、asar内のout全166ファイルが一致。[照合資料](.artifacts/order-dialog-validation.json)に424入力とWebApplet8資産のhash、基点commit、実行ログを保存。
- 制限環境でElectron起動とpnpmの固定依存検証が失敗したため、同じコマンドを通常権限で再実行し成功。依存版・lockfile・公開後待機を変更していない。編集用一時スクリプトを削除。Web一覧の成功履歴は実行方式ごとに3回以内。旧AI資料は再利用参照または実行方式を確認できないため保持し、失敗/不明資料も削除していない。
- 本体publishまで完了。未コミット。実利用先deploy・push・Release・全体ZIP作成は未実施。


## 2026-10-15: WebApplet分離・一覧設定のコミット前確認

- 対象はmain `d3bb01e`以降の動的ページ/独立WebApplet/宣言型一覧の差分と新Applet repo。実装時の本体530・Applet21入力ファイル、成功ログ、EXEと配布Applet全8ファイルを照合し一致。型検査、本体68件、Applet2件・配置6件、固定EXE一覧5群/Web動作4群、発行win-unpacked動的4群を再利用した。照合と今回の結果は[コミット検証](.artifacts/commit-validation-webapplet-20261015/validation.json)と同所`reuse.json`を参照。
- 未実行の標準回帰62ファイルを追加実行し416/416成功。再利用68件と合わせて**本体484/484、fail/skip 0**。実Node/.NETの起動・設定・コマンド・異常終了/再起動・停止も含む。最初の制限環境では保存rename/loopback等で45件が失敗。同一コマンドの通常権限実行では415/416となり、旧runtime=webとURLをdescriptionに置く試験fixture1件を現行コレクション形式へ更新。公開説明と非公開URL/アカウントの分離の検証を維持して416件を再実行し成功した。製品コードの追加変更はない。
- 本体EXEは0.45.0 / SHA256 `ba1875a7e5cc1f01c06de017ba6c501b4261062516c50b8053904e4338bd5c33`のまま。Applet0.2.0のZIPは前回後に再作成されており、現在85,065 bytes / SHA256 `0941e1f9474eb178e9d0600ae262595c4ed5adb5ebc928c1172b63c25945913d`。feed一致と全8エントリの内容が前回および配布フォルダーとbyte単位で同一と確認し、runtimeのGUI結果を再利用。版追加・再publishなし。
- Windows26300 x64、Node24.21.0/pnpm12.10.1/Electron44.6.0、.NET SDK10.0.402/Runtime10.0.13。記録へソース/試験・生成物・fixture・配布物・ログhashとstage treeを保存し、コミット後のtree一致を照合する。実サービス認証・物理入力/受信の追加確認、実利用先deploy、push、Releaseは行わない。

## 2026-10-15: 宣言型一覧設定とWebApplet（0.45.0 / 0.2.0）

- `object-list.list`を宣言したApplet設定へ、閲覧用一覧、追加/編集ダイアログ、アイコン操作、トグル、削除確認、並べ替えを自動生成する。宣言のない既存一覧は維持。WebApplet管理ページも同じSettingsListTableを同梱し、登録サイト・初期ショートカットを統一した。宣言、保存パス、同一所有者のプロフィール候補、対象一覧の競合、未宣言値の保持を検証する。
- 旧webApplets reader・自動移行・旧名簿取り込み・移行専用GUIを撤去。既に保存済みのID/名簿/session参照は維持し、新規の移行記録を作らない。本体0.45.0、Applet0.2.0、最低ホスト0.45.0。Appletの配布資産8ファイルに.NETのDLL/EXEはない。
- 型検査・ビルド、関連単体57件と名簿/同期11件、Applet単体2件、配置6件が成功。[レビューとログ](.artifacts/list-ui-20261015/review.md)、[入力・配布物照合](.artifacts/list-ui-20261015/validation.json)。無関係な全標準回帰は再実行していない。配置試験は最終表示更新修正前で、変更のない配置スクリプト/8資産の照合・利用データ保持を検証した結果を再利用する。
- [最終単一EXEの一覧5群](.artifacts/web-list-ui-1792054680258/result.json)で管理ページ・本体設定・Applet詳細設定、追加/編集/削除/順序、トグル、取消、URL失敗時の入力保持、外部更新の競合、未宣言値保持、入れ子のショートカット条件、明暗テーマ、狭幅、画面間同期を確認。狭幅はCDPの720pxエミュレーションで、物理モニターの確認とは区別。画像を目視し、列の縦折り返し/トグルCSSを修正後に再確認した。
- [最終単一EXEのWeb動作4群](.artifacts/web-portable-1792054729699/result.json)は外部Node Applet、推奨JSON/手動編集保持、page/windowのView保持、実Cookie再起動保持、remoteへのbridge非公開、親停止を確認。[発行win-unpackedの動的ページ4群](.artifacts/dynamic-pages-ui-1792054777784/result.json)は保存済み旧ID/名簿参照、localページの独立性と非表示/更新時状態保持、破棄、追加/ショートカット生成、所有境界、親停止を確認。実サービス認証・長時間受信は試していない。
- 発行前レビューとGUIで、Applet設定ダイアログの入力一時停止操作の不足と、旧インライン入力向けガードによるショートカット保存後の一覧更新漏れを修正。最終内容で該当GUIを再実行した。最初のportableへのPlaywright直接接続は待機したため試験プロセスだけを停止しCDPへ変更。Browser window-size API非対応は試験方法を変更。失敗記録を保持。pnpmの制限環境エラーは同じ固定依存検査を通常権限で成功させ、lockfile/待機方針を変更していない。
- 両publish成功。本体EXE **144,211,820 bytes / SHA256 ba1875a7e5cc1f01c06de017ba6c501b4261062516c50b8053904e4338bd5c33**、Applet ZIP **85,065 bytes / SHA256 1ef8ec7bf5fc46cb4f219b3d24d5c2ca9ff5934d0d838476ddb5b5bb19f2d5ee**。feed/manifest/package/asar版、out全166ファイル、GUIの固定EXEとApplet8資産、[ZIP内容](.artifacts/list-ui-20261015/applet-archive.json)が一致。撤去モジュールはasarにも含まれない。
- 本体/当該Appletのpublishまで。実利用先deploy・commit/push/Releaseは未実施。0.1.1のdeploy成功は利用者から報告済みで、今回の0.2.0配置成功とは区別する。利用時は本体とAppletの両方を更新する。

## 2026-10-15: 動的ページと独立WebApplet（0.44.0 / 0.1.0）

- main `d3bb01e`を基点に[設計と契約](docs/dynamic-pages-webapplet-design.md)を実装。実行中localページのlist/replace/open/hide/dispose、保存設定からlocal/remoteページを投影するpageCollections、所有範囲付きWebプロフィール・画像・ローカルbridgeを追加。本体のWebApplet専用manager/フォーム/固定管理項目を除去し、独立repo `../Applet.WebApplet.at365`へサイト管理と推奨JSON処理を移した。Appletの実行資産に.NET/Electronを含まない。
- 新保存形式・ファイル領域を追加するため本体0.43.1→**0.44.0**、新Applet **0.1.0**、最低ホスト0.44.0。旧サイトID、キー、リボン、名簿/session保存先を継続。旧版0.43.1で保存した実Cookieの移行と名称変更後の保持が成功：[移行結果](.artifacts/web-profile-migration-1792049648834/result.json)。旧版試験コピーは`.artifacts/dynamic-pages-legacy-0.43.1`へ保持。
- 型検査とビルド成功。関連単体54/54＋同期競合追加1件、新Applet2/2、fail/skip 0。証跡は`.artifacts/dynamic-pages-20261015/unit-final.log`、`dynamic-final.log`、`applet-unit.log`。最終のUTF-8 byte上限と別名衝突はdynamic-finalの5件で確認。その他の単体成功は非影響として再利用。
- [発行版の動的GUI](.artifacts/dynamic-pages-ui-1792050840750/result.json)は旧ID/名簿、2つのlocal画面のcontext/独立性、更新/非表示で入力保持、破棄、所有範囲/フォルダー外拒否、別Appletの名簿非公開、remote bridge非公開、追加時キー生成、親停止時破棄を確認。既存固定ページ/Gmailの7群は[既存ページ結果](.artifacts/applet-pages-1792049713570/result.json)が成功。Gmailの実OAuth/受信ではなくオフラインfixture。
- [最終単一EXE](.artifacts/web-portable-1792050916554/result.json)は隔離コピーを通常起動し、外部Node Applet読込、推奨JSON、手動名保持、page/windowのView保持、実Cookie再起動保持、明暗テーマ、親停止を確認。画像を目視。途中のテーマ切替直後の0幅キャプチャ失敗は試験側のレイアウト待ちを修正して再試験成功。失敗ログ/プロファイルを保持。最終製品差分はなし。
- 発行前レビューは[review.md](.artifacts/dynamic-pages-20261015/review.md)。移行順序、保存と実効状態、部分JSON、画像/登録境界、非同期Surface破棄、コレクション別Window保存先、コマンド別名衝突を修正し、影響する型/単体/GUIを確認。未解決の発行阻害なし。制限環境のpnpm stack overflowと原子的ファイル置換EPERMは同じ検証を通常Windows権限で再実行して成功し、lockfile/依存検査を変更していない。
- 両publish.bat終了0。本体EXE **144,197,270 bytes / SHA256 278f41eaf6be7f18438544fb235e1c194dbe4cd6cd818ae583c6070ecd0ef975**。package/asar/Default Shell/feed版一致、main139・Shell26ファイルと出力一致、固定コピーのhash一致。Applet update.zip **11,771 bytes / SHA256 166670cca5e39f7209e2712925018383205e278dd3e2d4d9aa8ac5b779630063**、manifest/feed版一致、ZIP6ファイルと配布フォルダー一致、DLL/EXEなし。[検証証跡](.artifacts/dynamic-pages-20261015/validation.json)と[ZIP照合](.artifacts/dynamic-pages-20261015/applet-archive.json)へ記録。入力358ファイルのhashを照合。
- 今回の隔離プロセス終了を確認。成功した同種GUIは直近3回以内、移行/固定物/失敗調査資料を保持し削除0件。実サイトへのログイン、全サイトの長時間受信、旧ホストとの双方向同期、全体ZIP、公開リポジトリ/更新元の設定、deploy、commit、push、Releaseは未実施。新Appletは独立Git repoとして初期化済みで未コミット。本体単独更新では新Appletを自動導入しないため、利用時は対応Appletも配置する。

## 2026-10-15: ネットワークMCPの認証案内と接続先候補（0.43.1）

- 利用者からネットワーク越しのMCP接続成功の報告を受けた。今回の独立した遠隔試験ではなく、接続元アプリ・経路・配置版の詳細は照合していない。「ネットワークからの接続」へ、環境変数名`MCP_BEARER_TOKEN`の例、値はトークンだけであること、直接ヘッダーのキー`Authorization`と値`Bearer <コピーしたトークン>`、半角スペース・変数名の一致・接続元アプリの再起動を案内する説明を追加した。READMEにも反映。
- 余分な`192.168.192.1`は実機の`vEthernet (Default Switch)`と確認。この既知名のHyper-V仮想NATアダプターだけを候補表示から除外し、Tailscaleと外部LAN用vEthernetを保持。実機で表示候補がtailnet/LANの2件になった。全NICを使うHTTP Host検証は維持し、IP末尾`.1`や仮想アダプター全般の除外はしない。アダプターを改名した場合は既知名による除外対象外。保存形式・認証・操作許可・Codex登録を変更していないためパッチ版0.43.1とした。
- 発行前レビューで表示と接続許可の分離、環境変数の説明、秘密値の不在、通常LAN/外部vEthernetの保持を確認し、未解決指摘なし。型検査・ビルド・関連 **30/30、fail/skip 0** が成功。[固定EXE GUI](.artifacts/automation-portable-1792004556250/result.json)も **17群、終了0**。案内・2件の候補の画像を目視し、公式SDKの接続、範囲切替、既存の許可/操作、Codex登録/修復/解除、再起動、両テーマ3幅の回帰を確認した。無関係な全標準回帰は再実行していない。
- `publish.bat`終了0。EXE **144,193,161 bytes / SHA256 9a73eac76fed1f8d2e551fb789e075e39933682ce2e8de3bfbd11d7f66e4c481**。package・asar・Default Shell・feedの版0.43.1、同梱main134/Shell26ファイル、固定コピー、検証前後の入力415ファイルを照合した。[証跡](.artifacts/mcp-network-help-20261015/validation.json)に入力・コマンド・ログhash・レビュー・表示候補を記録。版更新に伴うpnpm整合要求は固定lockfileのinstallで解消。CIMの制限環境でのアクセス拒否は通常権限で読み取り確認し、アダプター設定は変更していない。
- 試験プロセスの終了を確認。今回と前回のネットワーク検証資料、過去の再利用指定資料、固定出力、失敗/不明の調査資料を保持し削除0件。実利用設定・環境変数・ファイアウォールの変更、実利用先deploy、commit、push、Releaseは行っていない。

## 2026-10-15: MCPの接続範囲切替（0.43.0）

- main `6c893c0`上で[接続範囲の設計](docs/mcp-network-access-design.md)を実装。「設定 → MCP・Codex連携」から「このPCのみ／ネットワークからも接続可能（IPv4）」を即時保存できる。旧設定はlocalのまま、networkでは到達可能な接続元を受け付ける。接続先候補・URL/トークンのコピー・追加DNS名・ローカル/ネットワーク別の最終接続日時・起動失敗時の再試行を追加した。
- 従来の認証トークン、MCPの操作許可、共通APIインスタンスとrevisionを共用。切替だけではCodexのループバックURL・ポート・登録TOMLのbytes/所有情報を変えない。保存失敗では旧待受を保持し、保存後のbind失敗では選択値を保持して停止する。Host/Origin/token、重複ヘッダー、旧要求の失効、API呼出直前の再検査を実装。Windowsのワイルドカード/個別bindの同一ポート共存に対し、起動時の内部probeでループバックが自分に届くことを確認してから有効化する。
- 型検査・ビルド、MCP/共通APIの関連 **29/29**、設定ページ/Shell境界の **7/7** が終了0、fail/skip 0。旧設定・不正入力・認証/許可取消・本文送信途中の変更・保存/bind失敗・port=0・競合/再試行を確認。トークンのコピーはmainの注入callbackで確認し、IPC状態に平文を返さず、実クリップボードの内容は試験で変更していない。無関係な全標準回帰は再実行していない。
- [ソースGUI](.artifacts/automation-source-1791997865797/result.json)と[最終固定EXE GUI](.artifacts/automation-portable-1791998688512/result.json)は各 **17群、終了0**。実画面の切替・DNS入力の失敗/保存・公式SDKのloopback/自分のNICへの接続・許可/revisionの共用・localへの復帰・Codex登録/修復/解除・既存の設定/コマンド/管理/ショートカット/ジェスチャー/リボン/トレイ・再起動を確認した。両テーマ1280/960/700幅の既存回帰が成功。新規設定Surfaceの画像を目視し、URL欄の幅とページの説明を修正後、型検査・publish・固定EXEの全17群を再実行した。後続の製品変更なし。
- 発行前レビューで通信/保存/公開操作/秘密値/登録所有権を確認し、上記の競合・失効処理を修正。新規試験の初期構文、HTTP接続再利用、競合fixture、画像対象の誤りを訂正した。pnpmの制限環境でのスタックオーバーフローとローカル接続EACCESはログを保持し、同じ検証を通常Windows権限で再実行して成功。lockfile・依存検証・待機方針は維持。成果物照合用スクリプトはWindowsのasar内パス区切りを訂正して成功した。
- 設定追加のため本体 **0.43.0**。`publish.bat`終了0、package・asar・Default Shell・feedの版が一致。EXEは **144,187,468 bytes / SHA256 6b21ae4ffd7f2b37667341a527d65f00f4328141fb92f71c278dff378293f4ce**。同梱main134ファイル/Shell26ファイルとビルド出力、固定EXEと試験コピーのhash、発行前後の入力415ファイルを照合した。[検証証跡](.artifacts/mcp-network-20261015/validation.json)にコマンド・ログhash・入力・レビュー・成果物・再利用範囲を記録。
- 別端末のLAN/tailnet疎通、Ollama利用アプリのtool callからMCP実行まで、利用中Codexから新EXEへの接続は未確認。同一PCのNIC経路での成功とは区別する。実利用設定・ファイアウォールは変更していない。今回の試験プロセスの終了を確認し、最新資料・過去の再利用指定資料・失敗調査・固定出力を保持、削除0件。未変更Appletの発行、全体ZIP、commit、push、Release、実利用先deployは行っていない。

## 2026-10-15: 共通音声・Gmail通知移行のコミット確認

- 今回の共通キュー・実プレイヤー・TTS取消/開始期限、種類指定通知のsilentと既存.NETコンストラクター互換、Gmailの通知寿命と安全な履歴、設計/操作変更を再レビューし、未解決の対象内指摘なし。両repoのmainで今回の変更だけをコミット対象とする。
- 実装時の10件の成功記録、完全ログ、入力hash、固定EXE/ZIP/feedを再照合。製品入力は一致し、初期記録との差はGUIランナー2ファイルのみ。最終GUIは変更後のランナーで成功している。型検査/ビルド/発行、本体関連65件、Gmail標準22件、固定EXEの音声・Gmail・通知読み上げ・Node/.NET通知設定の4試験を再利用した。
- 標準回帰の未実行63ファイルを追加実行して**406/406成功**。既確認9ファイル65件と合わせて本体標準**471/471成功**、fail/skip 0。標準前提のNode/.NET fixtureビルドも成功。制限環境の.NET診断なし失敗、ファイル置換EPERM/ローカル接続EACCESは失敗ログを保持し、同一処理の通常Windows権限実行で切り分けた。
- [コミット証跡](.artifacts/commit-validation-audio-20261015/validation.json)に再利用元・差分判定・今回のコマンド/入力/ログhash・環境・生成fixture・stage treeとcommit/treeの一致を保存する。最終試験後は検証文書だけを追記。製品修正・追加の版更新・再発行はなく、AppDock0.42.0/Gmail0.11.0の配布物を維持する。
- 旧Gmail全機能GUIの更新画面DOM参照は対象外の既知制約として残り、今回の音声/通知専用GUI成功と区別する。実Google受信・聴感は未確認。ローカルコミットまでで、push・Release・実利用先deployは行わない。

## 2026-10-15: 共通音声再生・ビープ廃止・Gmail種類指定通知（0.42.0）

- main `460bfa9`上で実装。設計は[共通音声再生API](docs/audio-playback.md)、発行前レビューは`.artifacts/audio-unification-20261015/review.md`。TTS、通知音、試聴が単一FIFOへ接続し、waitingPlayback中も開始期限・取消を維持することを確認。Node通知のsilent検証と.NETの既存コンストラクター互換を確認し、発行阻害指摘なし。
- 型検査・ビルド、関連**65件すべて成功**。混在FIFO、待機/再生取消、回収順序、満杯/待機期限、生成中の通知音、通知開始期限、TTS設定/権限、通知方針、Windows配送、登録WAVを対象とした。.NET通知fixtureのRelease buildは警告/エラー0。
- 固定発行EXEで4つのGUI/実プロセス試験が成功。共通音声: `.artifacts/audio-playback-ui-1791995776301/result.json`（同時プレイヤー最大1、3経路完走、未選択無音、待機/再生中取消）。通知読み上げ: `.artifacts/notification-speech-ui-1791995987648/result.json`（9群）。Node/.NET通知設定: `.artifacts/notification-settings-1791996002499/result.json`（8群、操作/停止/保存/再起動）。Gmail: `../Applet.Gmail.at365/.artifacts/ui-features-1791995939705/result.json`（実Nodeからnew-mailの発行/抑制/終了、安全な履歴、無音/試聴）。オフラインfixtureを使用し、実Google受信・物理スピーカーの聴感は未確認。
- ビープ契約の廃止とTTS状態追加のため0.42.0へマイナー更新。`publish.bat`終了0、EXE/feedの版・サイズ・SHA256を照合。EXEは`dccacea51258c0e424657405f76de000209871469ad1d99e8b64a3f55b08db9c`。Gmail0.11.0の最低ホスト版とZIP内部manifestも整合。
- 証跡は`.artifacts/audio-unification-20261015/validation.json`と各`*-validation.json`/`*-verified.log`。コマンド、終了コード、日時、入力ファイルhash、ログhash、成果物hashを保存。発行中/検証後の入力差分は試験ランナー2ファイルの起動待ち・portable接続・診断のみで製品入力は一致。最終配布版試験は現在のランナーhashで成功しており、製品の再発行は不要と判断した。
- 制限環境のpnpm stack overflow、WAV置換EPERM、診断のない.NET非0は同一処理の通常権限実行で成功。共通音声の初期固定EXE試験は内部API注入が起動完了前で終了待ちに失敗し、startupReady待機を追加して成功。Gmail既存全機能UI試験は旧ホスト更新画面DOM参照で停止したため、今回の音声/通知専用モードを追加してsource/portableを検証。旧更新画面を含む全機能GUIと本体全標準回帰は今回の成功範囲に含めない。
- 後片付け: 今回の隔離EXEプロセス残存0を確認。一時編集スクリプト2件を削除。今回の各実行方式の成功分は3件以内のため保持、失敗診断と過去の別作業の再利用/所有状態未照合のフォルダーも保持した。commit・push・Release・実利用先deployは未実施。

## 2026-10-15: 設定通知・JSON復旧のコミット確認（0.41.0）

- main `7f0a266`上の今回の実装・試験・文書を対象に、設計書を実装済みの構成へ更新した。SettingsHealth / SettingsHealthNotifications / ErrorReporter.episode、障害の処理世代、短時間の読込障害、実際の通知文言、復元操作の条件、再起動の排他と確認範囲をコードへ照合した。確認項目の表と実施結果を区別し、未実装の予定表現を取り除いた。
- 実装時の443ファイルの入力hash、6件の成功ログ、最終GUI runner、publishのEXE/feedを照合した。製品入力は一致し、単体試験後のGUI runner変更は最終固定EXE試験で使用したhashと一致。型検査・ビルド・関連**130件**・固定EXEの**7群**を再利用した。今回の追加変更は設計書と検証記録だけのため、0.41.0の再版更新・再発行は行わない。
- 標準回帰の不足分を補うため、`dev.bat run build:test-extensions`と、既存130件を含む14ファイル以外の`dev.bat exec node --test`を実行。残り**336件成功、fail/skip 0**、再利用分と合わせて**466件**の標準回帰が成功した。fixtureの.NETビルドは制限環境で非0となったためログを保持し、同じコマンドの通常権限での成功を確認した。試験ファイル一覧・コマンド・終了コードは証跡へ保存する。
- 文書リンク・見出し参照・コードフェンス・競合マーカー・会話上の人物名の不在と`git diff --check`を確認。設定ファイル優先、即時保存、通知OFF/終了と障害解消の分離、復元前の退避・競合照合を保持する。ネイティブdialogの回答はfixture、起動復旧loopは単体試験。実同期サービス・実UAC昇格・物理dialog操作は今回も対象外。
- 再利用判定と追加回帰は`.artifacts/commit-validation-settings-recovery-20261015/validation.json`、stage tree・作業ファイル・最終commitの一致は同フォルダーの`commit.json`へ記録する。今回の26ファイルだけをmainへコミットする。固定EXEと再利用証跡、今回の成功・失敗ログを保持し、push・Release・実利用先へのdeployは行わない。

## 2026-10-15: 設定の再起動通知とJSON復旧（0.41.0）

- main `7f0a266`から実装。保存直後の設定と起動時GPU要求値を比較する再起動通知、共通ErrorReporterの設定障害episode、理由・再起動・保存先・復元action、一般設定の常設復旧欄を追加した。通知OFF・終了と障害解消を分離し、既存の即時保存、外部設定優先、AIの単発エラー報告を維持する。起動時に正常なバックアップがない場合は通常初期化の前に復旧dialogを使う。
- 復元元と保存先の確認後再照合、破損bytesの退避、最初のrename直前からの比較、正常な同期受信の優先を検査した。レビューで見つけた「直接読込だけが正常期間を見た後に同じ監視エラーが再発すると見逃す」問題はobserverのエラー記録解除と回帰試験で修正。初回作成と同期到着の競合も保護し、バックアップ保存先が読めない場合に既定値を作成しない。通知自身の失敗は設定操作へ伝播させず、古い非同期反映結果で新しい障害を解消しない。
- `dev.bat run typecheck`、`dev.bat run build`成功。`dev.bat exec node --test`でsettings-recovery / settings-health-notifications / settings-sync / settings-editing / settings-page / settings-commands / error-reporter / notification-policy / notification-foundation / notification-speech / ai / ai-settings / windows-launch / global-hotkeysの**130件成功**。破損・欠落・候補変更・4MB超・退避不能・保存失敗・初回競合・一時エラー・期限切れ・OFF/再ON・dismiss・別AI通知との分離・PowerShellの1223取消を含む。
- `settings-recovery-ui-test.cjs`のsource試験と固定EXE試験に成功。通知の生成とGPU値の取消による解消、短い破損の非通知、確認中の再起動不可と正常受信の優先、通知ボタンによる退避・復元、通知OFF時の一般画面からの復元、実際の再起動と同じprofile/設定画面の復元、破損状態からのバックアップ起動を確認した。最終EXEの画面画像で復旧欄の表示も確認。ネイティブ確認dialogの回答はfixture、ファイル選択・起動復旧loopは単体試験であり、OS dialogを人がクリックする試験や実同期サービス・実UAC昇格は未実施。
- 発行前レビューで要件・競合保護・通知寿命・再起動経路・Shell限定モデル・保存境界を確認し、上記の修正を再検証した。新しい通知種類の設定追加によりマイナーを更新し**0.41.0**とした。`publish.bat`成功。EXEのProductVersionとupdate.jsonが一致し、144,197,883 bytes、SHA256 `7a9f2ac5725668c2d1328106f2aaa2471b6e06a6ac8db529f893cce6640e43ec`。固定EXE試験はこの配布物をコピーし同一hashを照合した。
- 証跡: `.artifacts/settings-recovery-validation-20261015/validation.json`、ログとhash、`inputs-before.json`の443ファイルを記録。単体試験後の製品入力は不変。GUI runnerだけ既存のCDP/main inspector接続へ修正し、`ui-runner-final.json`のhashで固定EXE試験を実行した。source結果は`.artifacts/settings-recovery-ui-1791992687676/result.json`、最終固定EXE結果は`.artifacts/settings-recovery-ui-1791993300850/result.json`。Windows 10.0.26300 x64、Node 24.21.0 / pnpm 12.10.1 / Electron 44.6.0 / .NET SDK 10.0.402を使用。
- 制限環境の一時フォルダーrenameのEPERM、Electron起動失敗、pnpmのSTATUS_STACK_OVERFLOWはログを保持し、同じ検証・発行を通常権限で実行して成功を確認した。新規fixtureのディレクトリ移動はWindowsの一時拒否に依存したため、障害注入を安定化した。固定単一EXEへのPlaywright直接接続のtimeoutは配布版用CDPへ変更して解消。成功済みの今回GUI成果物は方式別3件以内で保持し、失敗・調査資料も保持。試験プロセスの終了を確認した。未変更Appletの発行、全体回帰、Release、deployは対象外。変更は未コミット。

## 2026-10-15: 設定通知・JSON復旧の設計をmainへ統合

- `design/settings-notifications`に残っていた文書3点を`48b6838`としてコミットし、main `10ff37b`（0.40.0）へ統合。[設計書](docs/settings-recovery-notifications-design.md)とDEVELOPMENTの入口、初期設計時の検証記録を取り込む。VERIFICATIONの競合は両方の記録を保持して解消した。
- 統合レビューで、初期案の専用エラー種類・condition寿命を現行の[共通エラー方針](docs/error-reporting.md)に整合させた。設定障害は共通「エラー通知」を使い、バナー必須と独立したOFF、既定10秒と利用者の表示時間、OFFでも残るログを維持する。通知の終了と障害の解消を区別し、一般設定に復旧導線を残す。
- 再起動待ちの種類追加、設定障害の接続、復旧action・更新/解消の共通ErrorReporter拡張はすべて未実装と明記した。別処理のエラーを設定の復旧で終了しないこと、期限切れ・OFFから同じ障害を再表示しないことを実装計画と確認項目へ反映。設計の受信・復元・競合保護の方針を保持し、未実装を現行機能として記載していないことを確認した。
- 相対リンクと対象見出し、コードフェンス、競合マーカーと会話上の人物名の不在、`git diff --check`、既存mainの検証記録の保持を検査。対象は文書4点のみで、製品ソース・テスト・設定schema・依存・ビルド手順は不変。製品回帰・型検査・GUIは文書のみのため対象外とし、版更新・publishは行わない。既存0.40.0のEXE・feedのhashも不変。
- 証跡は`.artifacts/settings-design-merge-20261015/validation.json`、stage treeと最終commitの照合は同フォルダーの`commit.json`へ保存する。元のworktreeと設計branchは保持し、push・Release・deployは行わない。

## 2026-10-14: 設定の再起動通知・JSON復旧の設計

- `61dca8477069dad12f0c6f8ef4605bebeb30da99`（0.37.1）から `design/settings-notifications` worktreeを作成し、[設計書](docs/settings-recovery-notifications-design.md)とDEVELOPMENTの入口を追加した。製品コード・版・配布物は変更していない。
- SettingsStore、ファイル監視、通知種類/サービス、復元IPC/既存エラーバナー、通常再起動、Windows起動設定と現行文書を照合した。発行元の重複抑止、原因別の解消条件、復元前の破損bytes退避、正常な外部更新の優先、通知を無効にしても残る復旧導線を設計レビューした。
- 起動不能時は通知基盤を使えないこと、app.ready後に復旧した場合は通常起動へ再起動してGPU設定を適用すること、通常再起動では管理者権限を解除できないことを設計へ反映した。
- 文書の相対リンク先、コードフェンス、会話上の人物名の混入がないこと、差分の空白を検査した。製品の型検査・回帰・実EXE検証は文書だけの変更のため未実施。設計書の試験表は将来の実装で行う計画であり、動作確認済みではない。
- 初期設計時点では実装・commit・merge・push・publish・deployは未実施。文書のコミットとmain統合は2026-10-15の記録を参照。

## 2026-10-14: 必須バナーと独立した通知ON/OFF・AI変更のコミット（0.40.0）

- エラー通知を`requiredTargets:['banner'] / canDisable:true`に変更。有効な間はバナー必須で、センターのみへの変更を拒否する。通知全体のOFFは許可し、OFF中もログを残す。初期配送はバナー＋デスクトップ、10秒、読み上げOFF。表示期限・個別の閉じる操作・キャンセルの非通知は維持した。
- 共通登録の`requiredTargets`と`canDisable`を独立化。本体のOFF不可定義に必須先を要求していた制約を外し、4組合せを検証。AppletのOFF不可自己宣言は禁止のまま、本体のOFF不可には初期ONと理由を要求する。設定UIで旧値を編集するときに必須先を補完し、既存のセンターのみ設定が読み上げ・時間・ON/OFFの保存を妨げないよう修正。読み込みのみでは書き換えない。不要な「この種類の通知はオフです」の表示を削除し、ほかの停止／定義変更理由は保持した。
- [共通通知契約](docs/notifications.md#通知種類の制約)、エラー方針、移行設計、Applet API、READMEへ登録方法・制約を反映。既存エラー通知のバナーなし配送を廃止する非互換の挙動変更として0.39.0→0.40.0へ更新した。発行前に制約の独立性、UIと保存API・実効方針、旧設定、通知寿命と秘密値をレビューし、未解決の指摘なし。
- 型検査・ビルド・関連13ファイルの回帰 **108/108、fail/skip 0** が終了0。[ソースAI/通知GUI](.artifacts/ai-ui-1791989629434/result.json)と[固定EXE AI/通知GUI](.artifacts/ai-ui-1791989822942/result.json)は各**16群**成功。バナーがチェック済み・変更不可、センターのみ不可、独立したOFF/ON、OFF説明の不在、旧設定の修正保存、任意のデスクトップ通知追加／解除を確認した。
- 同一固定EXEの[一般通知設定GUI](.artifacts/notification-settings-1791989943982/result.json)も**8群**成功。Node/.NET実API、種類別OFFと親許可、期限／manual、保存失敗、権限・所有者、検索・既定復帰・再起動・履歴・両テーマを確認。初回は既存の「現在利用できない種類」が折りたたまれたままの試験手順で失敗し、開いてから検査するようテストのみ修正して再実行した。製品の再修正なし。
- `publish.bat`終了0。package・単一EXE・Default Shell・feedは**0.40.0**。EXEは**144,185,474 bytes / SHA256 0588cafca8cb5e6ffc79a0fd9505631b5bc8216b512a0d9e9efc6f71072f519c**。main127ファイル・Shell26ファイルを照合し、各GUIコピーのhash一致。固定lockfile・toolchainは不変。実Ollamaは直前の8,192トークン成功の記録を保持し、今回の通知方針変更では再生成していない。実利用先へのdeployやGmail連携は行っていない。
- コミット対象はmain `61dca84`以降の本チャットのAI接続UI・上限と期限・共通エラー通知・共通設計と今回の調整。先行の標準436件・最終キー修正・関連81件とショートカット／ジェスチャー／URL GUIのログhashと入力差分を照合し、無影響の成功結果を再利用。影響するAI／通知／設定は今回再検証した。別worktreeの設定復旧設計と兄弟Appletは含めない。[証跡](.artifacts/required-notifications-20261014/validation.json)に比較・ログ・環境・レビュー・発行物を、[コミット照合](.artifacts/required-notifications-20261014/commit.json)にstage treeと最終commitを保存する。
- 現在の固定配布物・成功fixtureと先行のコミット照合資料、初回失敗の調査資料を保持する。試験プロセスの終了を確認し、今回の削除対象なし。通常publishとローカルコミットまでとし、push・Release・実利用先への配置は行わない。

## 2026-10-14: AIの既定上限・待ち時間と共通エラー通知（0.39.0）

- main `61dca84`上のAI設定UIに続けて実装。接続の詳細へ出力トークン上限（初期8,192、32〜131,072）と待ち時間（初期60秒、1〜600秒）を追加し、OKで一括保存。未指定の旧設定は初期値へ補完し、APIの明示値は接続の既定値より優先する。上限なしは設けず、本文4,096コードポイント・応答1MiB等の既存制限は維持。設定追加のため0.38.0→0.39.0へマイナー更新した。
- `finish_reason:length`を`AI_OUTPUT_LIMIT`に分け、上限または推論設定の調整を案内。受付済みAIジョブの最終失敗を、試験画面・Applet・MCP共通でErrorReporterへ接続した。「通知 → AppDock → エラー通知」は初期ON／デスクトップ10秒／読み上げOFF。通知OFFでもerrorログは残り、同一要求の再送・照会で重複せず、取消は通知しない。秘密値・入力・生成本文・思考を通知やログへ出さない。一般Appletへ任意の本体エラー発行APIを公開したものではなく、TTS等の既存機能一括移行は未実施。
- [共通のエラー通知とログ](docs/error-reporting.md)と[一覧形式の設定編集UI](docs/settings-list-editing.md)を正本としてAGENTS・DEVELOPMENT・関連設計から参照する。新規／改修機能の最終失敗、画面内入力検証、取消、重複防止、安全な説明、通知障害の再帰防止と現在の接続範囲を文書化した。AI設計の実装状況も更新した。
- 発行前レビューで設定の範囲・旧値補完・API優先・冪等性・期限・取消・通知設定・ログ・秘密値・文書を照合。期限超過後に応答が先に完了すると取消扱いになる競合を発見し、`AI_TIMEOUT`へ修正して専用回帰を追加した。型検査・ビルド、関連8ファイルの回帰 **81/81、fail/skip 0** が成功。初回のテスト補助関数・画面ラベルの誤りを修正して再実行し、未解決の製品指摘なし。無関係な全標準回帰・Applet固有の回帰は再実行していない。
- [ソースGUI](.artifacts/ai-ui-1791988617056/result.json)と[固定配布EXE GUI](.artifacts/ai-ui-1791988880674/result.json)は各**15群、終了0**。一つのAppDock通知欄、読み上げ初期OFF、入力中のディスク不変／取消、上下限エラー、OK保存、既定10万トークン送信、上限不足の結果・通知・ログ、MCPの最大値指定と重複防止、実Node/.NET SDK/RPC、所有者・権限取消、既存の登録／削除／並べ替え／競合を確認。明暗・1280/760幅の画像で詳細入力と固定フッターを確認した。配布EXEと隔離コピーのSHA256も試験内で一致。
- LAN内Ollamaの`gemma4:26b-mxfp8`へ同じテスト入力を、新しいAiServiceの初期値**8,192トークン・60秒、推論省略**で送信して成功。**13,493ms、本文575文字、completion_tokens:1,139、total_tokens:1,169**。共通／追加プロンプトなしの隔離設定で実行し、実利用設定・実メールは変更していない。[実測](.artifacts/ai-limits-20261014/ollama.json)。LM Studio・llama.cpp・クラウドへの実接続、Gmail連携、物理的なWindows通知の閲覧は今回未確認。
- `publish.bat`終了0。制限環境でのpnpmスタックオーバーフローはログを保持し、同一コマンドを通常Windows環境で再実行して成功。固定依存の検査は維持した。EXE／asar内package／Default Shell／update.jsonは**0.39.0**。EXEは**144,187,832 bytes / SHA256 12e89b2ee949e3187e8c6cb4840172f60eadb4ecd56fcce4a2255d727b3cc36b**。同梱main127ファイル・Shell26ファイルをビルド出力と照合。照合用スクリプトのWindowsパス区切りとEXE版表記を訂正して再確認した。
- [検証証跡](.artifacts/ai-limits-20261014/validation.json)へ入力hash、実行ログ、レビュー、発行物と環境を保存。後続の製品変更なし。既存の本文中リンク2件は対象不在のままHEADと同一と確認し、新規のリンク切れとは分けて記録する。現在と先行の成功fixture・固定EXE・将来のコミット照合資料・失敗調査資料は保持し、今回の削除対象なし。未変更Appletの発行、全体ZIP、commit、push、Release、実利用先deployは行っていない。

## 2026-10-14: 一覧編集の共通指針と生成失敗の切り分け（調査時点0.38.0）

- [一覧形式の設定編集UI](docs/settings-list-editing.md)を追加し、AGENTS・DEVELOPMENT・設定基盤から参照する。現行のAI接続、SettingsModal／SettingsDialog、入力部品、順序操作、保存Controllerを照合し、登録単位のOK保存、削除確認、並べ替え、フォーカス、競合と共通部品の範囲を文書化した。単純な設定の即時保存とショートカット／ジェスチャーの固有契約を維持する。
- LAN内Ollama **0.40.3 / gemma4:26b-mxfp8**へ、利用者が提示したテスト文「テスト用の入力です。\nテキストを生成して返答してください。」を送信。共通・追加プロンプトなし、`max_tokens:256`、推論省略で **2302ms / finish_reason:length / completion_tokens:256 / 本文0文字 / reasoning852文字**となり、報告された失敗条件を再現した。推論だけ`none`へ変更すると **891ms / stop / completion_tokens:64 / 本文133文字 / reasoning0文字**で成功。利用者もAppDock画面でnoneに変更して返答が来たことを確認した。[実測とソースhash](.artifacts/ai-reasoning-diagnosis-20261014/result.json)。生の思考本文・実メール・認証情報は記録していない。
- 調査時点のソースで試験画面が出力上限を省略し、AiServiceが既定256を送信すること、終了理由stop以外や空本文をAiOpenAiChatが拒否することを確認。当時のAPIは32〜2048の指定に対応するが試験画面に指定欄はない。短い回答を明示した別入力では推論省略でも成功しており、すべての入力が失敗するわけではない。実利用設定は利用者が変更し、この切り分けではアプリコード・版・発行物を変更していない。後続の上限・待ち時間とエラー通知の実装は0.39.0の記録を参照。現行仕様は[AI文書](docs/ai.md)に反映する。

## 2026-10-14: AI接続一覧と一括保存ダイアログ（0.38.0）

- main `61dca84`上で実装。AI接続をショートカット／ジェスチャーと同じ表スタイルへ変更し、＋の追加、歯車の編集、確認付き削除、ドラッグ・上下・Alt＋↑↓による並べ替えを実装。追加／編集は同じダイアログとし、詳細設定は折りたたむ。設計と現行仕様を[AI設計](docs/ai-services-design.md)、[共通API](docs/ai.md)、[設定基盤](docs/settings-foundation.md)へ反映した。
- 共通SettingsModalへ既存の編集／順序ダイアログの表示寿命・フォーカス復帰・入力停止を集約。SettingsDialogで非同期OK・多重受付抑止を提供する。接続の入力とモデル取得は保存せず、OKでSettingsStoreへまとめて反映する。APIキーはPC専用暗号化のまま関連データトランザクションに接続し、書き込み失敗時のrollback、接続／キーの競合、削除時のキー回収、順序変更時の他項目保持を確認した。
- URL／APIキーのEnterとモデル横の取得ボタンは未保存値を使う。IME変換のEnterを無視し、URLのblurでは補正だけを行う。古い応答の破棄、要求ID別の取消、URL変更時の保存キー不使用、一覧非対応からの再試行を確認。接続ごとの「このPCで使用」とai-access.jsonの読み書きを廃止し、Applet/MCPの独立useAi許可は維持した。設定／保存仕様の削除を含むため0.37.1→0.38.0へマイナー更新。
- 発行前レビューでは要件、既存ダイアログ、保存境界、秘密値、公開API、寿命、既定接続の扱いを照合。初期GUI試験で見つかったblur時のレイアウト変動によるクリック欠落、同じURLへ正規化した場合の表示を修正した。追加確認では復号できないキーの改訂値を維持して再設定できるように修正し、関連試験を追加して同じ版を再発行した。最終の未解決指摘なし。[レビュー記録](.artifacts/ai-dialog-20261014/review.json)。
- 型検査・ビルド・整形／差分検査が終了0。標準回帰は **436/436、fail/skip 0**。最終のキー修正後は影響するAI／設定保存回帰を **27/27** で再実行し、型検査も終了0。標準回帰からの差分はai-secrets.tsと追加した試験だけ。無関係な成功試験を再実行せず、入力hashと判断を[証跡](.artifacts/ai-dialog-20261014/validation.json)へ保存した。
- [ソースAI統合12群](.artifacts/ai-ui-1791985117962/result.json)、[ショートカット](.artifacts/shortcuts-ui-1791985138925/result.json)、[ジェスチャー](.artifacts/gestures-ui-1791985190348/result.json)、[URL入力6群](.artifacts/settings-url-1791985218712/result.json)が成功。AI統合はNode/.NETの実SDK/RPC、MCPの独立許可・所有者・取消・重複を含む。.NET AiProbe fixtureはRelease build警告／エラー0。明暗・1280/760幅の表とダイアログ、詳細展開時のスクロールとOKの表示を画像で確認。実LLM・有料API・実メールはこのUI作業では使用していない。
- `publish.bat`終了0。本体EXE・asar内package・Default Shell・update.jsonは **0.38.0**、**144,177,567 bytes**、SHA256 **034a4de3168dd6047fdb6beffc6fb7cd5383d25ea7ab7802614ea636337f0ef7**。[配布物照合](.artifacts/ai-dialog-20261014/published.json)で最終AIモジュールの収録hashも一致。[固定EXEの隔離GUI12群](.artifacts/ai-ui-1791985743872/result.json)が終了0、コピーhash一致・試験プロセス終了を確認した。
- Node24.21.0／pnpm12.10.1／Electron44.6.0／.NET SDK10.0.402、Windows x64。版変更後のoffline installは制限環境の別キャッシュで失敗し、同じ固定lockfile・検査を通常キャッシュで再実行して成功。依存版・lockfile・待機設定は未変更。Gmailは変更せず、commit／push／Release／実利用先deployも未実施。
- 整理は[記録](.artifacts/ai-dialog-20261014/cleanup.json)の旧成功フォルダー2件のみ。種類・方式別の直近3回と参照資料、今回の失敗調査・固定配布物、状態不明のものを保持した。候補の終了・成功・参照なし・絶対パスと再解析ポイント不在を確認。XX.TEMPの作成なし。

## 2026-10-14: URL入力の確定タイミング統一（0.37.1）

- 指示に従いmain `dc9ab2e`上で修正。AI/TTSベースURL、WebApplet URL、Web追加許可先、本体/各Applet更新元を共通のURL入力部品へ統一。入力中のコロン・スラッシュ・不完全なURLを保持し、Enterまたはblurで補正・検証・即時保存する。IME変換EnterとEnter後のblurによる二重受付を抑止し、Web初期設定取得もURL確定後へ移した。URLリストはShift+Enterで改行し、追加許可先の厳密なorigin検証は維持。
- 発行前レビューで入力/IME/補正、通常文字・数値、選択対象の寿命、Web初期設定の受付順、URL欄の適用範囲を照合し、Web URL/追加許可先を対象IDで分離した。未解決の製品指摘なし。保存形式・公開API変更はないため0.37.0→0.37.1のパッチ更新。
- 型検査・build・Prettier・diff検査が終了0。設定編集/設定ページ/AI/TTS/Webの関連回帰 **59/59、fail/skip 0**。[URL入力のソースGUI7群](.artifacts/settings-url-1791982818991/result.json)は連続入力、未確定時の保存/通信抑止、Enter/blur、IME、不正値の保持と修正、Web確定後の初期設定取得、通常文字の即時保存を確認。[既存設定Shellのソース9群](.artifacts/settings-shell-1791982859427/result.json)は数値/IME、保存失敗、外部競合、追加Shell、再起動も確認した。
- 初回依存同期は制限環境の別キャッシュに固定依存メタデータがなく失敗。同じ固定lockfile/offlineコマンドを通常環境の既存キャッシュで実行して成功した。GUI初回は入れ子のsummaryの指定、次は既存origin検証が末尾スラッシュを許可しないことに試験を合わせ、テストだけを修正して再実行成功。これらの途中失敗は成功に数えない。
- `publish.bat`終了0。単一EXE・asar内package・Default Shell・update.jsonは **0.37.1**、EXEは **144,191,766 bytes**、SHA256 **ee2393764694644353044de02b6ec2ba6c6a414577d383ccd519b0c392a76d89**。同一hashの隔離コピーで[URL入力7群](.artifacts/settings-url-1791983051569/result.json)と[設定Shell7群](.artifacts/settings-shell-1791983065212/result.json)が終了0。配布版で利用できない保存失敗/故障fixtureの2群はソース試験と区別する。
- [入力hash・ログ・発行物照合](.artifacts/url-input-20261014/validation.json)を保存。固定lockfile/workspace/toolchainのGit差分なし。今回のURL試験の成功分は方式ごとに3件以内、旧設定Shell資料は過去検証/コミット証跡の参照対象、途中失敗は調査資料として保持し、削除0件。XX.TEMPの作成なし。main上の修正をコミット対象とし、push・Release・実利用先deployは行わない。
- コミット依頼後に製品・試験・依存/ビルド入力、既存ログ、配布EXEのSHA256とGUI成功記録を照合し、型検査/build/関連回帰/GUI/発行を再利用した。不足していた本体標準回帰`dev.bat test`を追加実行し、build/fixture/実プロセスを含む **429/429、fail/skip 0** が終了0。製品修正・再発行は不要。最終stage tree/commit、実行ログhash、再利用元と検証後の文書追記は[コミット証跡](.artifacts/commit-validation-url-input-20261014/validation.json)へ記録する。

## 2026-10-14: 本体のAI共通APIと設定（0.37.0）

- 確定設計を本体の範囲で実装。Gmail側は利用者指定で別工程とし、兄弟repoを変更していない。最新main `8bc9173`から専用worktree/branch `feature/ai-services`で作業した。共通AI設定、PC専用キー/接続許可、AIページ、Applet/MCPの4操作と独立したuseAiを追加した。
- 発行前レビューで設定保存・部分JSON・秘密値・接続許可・所有者/世代・キュー/期限・重複・取消・出力形式・SDK/MCP・UI投影を照合。生成本文のタイマー回収、取消した通信の同時数保持、キー変更の接続単位取消、MCP認証更新時の即時回収、UIから保存する接続先の照合を補強し、必要な再検証を行った。製品の未解決指摘なし。
- 型検査、build、Prettier、差分検査が終了0。実装時のAI・automation・TTS・設定ページ・設定編集の関連回帰 **65/65、fail/skip 0**。初回の旧TTS試験は出力親フォルダー不足を直して再実行。既存MCP HTTP試験と.NET buildは制限環境で失敗し、同じコマンドを通常環境で実行して成功した。Gmail回帰は今回の範囲外。
- [.NET専用fixture](tests/fixtures/dotnet/AppDock.Extensions.AiProbe/AiProbe.cs)はRelease buildで警告/エラー0。隔離した[ソース統合試験](.artifacts/ai-ui-1791980762683/result.json)で、AIページ、キーの暗号化と画面モデルからの除外、接続許可、モデル一覧、上書きモデル、Node/.NET実RPC、MCP4操作・独立許可・所有者分離・重複・取消・認証更新・設定変更を確認。明暗テーマ・1280/760幅は画像で表示を確認した。初回の試験コードのエラー形式/Windowサイズ変更の扱いを修正して再実行成功。
- LAN内Ollama **0.40.3 / gemma4:31b-mlx**に、実メールを含まない短い接続試験文を送信。共通AiServiceから推論none・出力256トークン指定で **430ms / 219ms**、2回ともcompleted。モデルは試験前にロード済みであり、冷起動時間は未確認。初期の64トークン・推論省略では思考で上限に達し、finish_reason:length/本文空を安全に拒否することを確認した。[実測](.artifacts/ai-ollama-result.json)と[応答形式](.artifacts/ai-ollama-response-summary.json)を保存。LM Studio・llama.cpp・OpenAIの実サービスは未確認、有料APIは利用していない。
- Node24.21.0/pnpm12.10.1/.NET SDK10.0.402。worktreeのnode_modulesは独立、.toolsのみ既存ツールへのjunctionを使用した。固定lockfile・待機設定・toolchainのGit差分なし。mainとの比較ではCRLF/LFを正規化した内容が同一で、依存版と供給網検査を変更していない。設定とPC保存ファイルを追加するため本体のみ0.36.8→0.37.0へマイナー更新した。
- `publish.bat`終了0。単一EXE・asar内package・Default Shell・update.jsonは **0.37.0**、EXEは **144,176,254 bytes**、SHA256 **018245258ff4ba53da81a336beec53dea8bbae01633041e438b4982b5259e9f2**。AIモジュールの収録と試験fixtureの除外を確認。固定配布物の隔離コピーで[AI統合6群](.artifacts/ai-ui-1791981056792/result.json)と[通常起動・終了のsmoke](.artifacts/smoke-1791981155056/smoke-result.json)が終了0。ASAR照合の初回はWindowsの内部パス区切りを誤って指定したため試験コードだけを修正し、収録を確認した。
- コミット依頼後に本体標準回帰`dev.bat test`を実行。初回は427/429で、既存Applet許可試験に新しいuseAiの初期OFFを反映し、10/50msの結果保持試験を制御した時刻で検査する方式へ修正。製品・発行物は不変。修正後の標準build/fixture/実プロセスを含む **429/429、fail/skip 0** が終了0。ソース/配布EXEの統合試験、型検査、発行前レビューは入力と成果物hashを照合して再利用し、[コミット証跡](.artifacts/commit-validation-ai-services-20261014/validation.json)へ記録する。
- 設計書へ本体の実装済み範囲とGmailの未実装範囲を反映してから、本体だけをローカルコミット・mainへマージする。検証後の文書追記、最終stage tree/commit/mergeと照合結果はコミット証跡へ記録する。再利用資料・失敗調査・固定配布物を保持し、XX.TEMPの作成なし。push・Release・実利用先deployは行わない。

## 2026-10-14: AI文章生成とGmail通知の設計調査

- 本体commit `f48add7`から専用worktree、branch `design/ai-services`を作成。[AI文章生成機能の設計](docs/ai-services-design.md)を追加し、DEVELOPMENTへ未実装の入口を追加した。製品ソース・版・発行物の変更はない。
- 本体の共通API、設定/秘密値保存、通知/TTS、Node/.NETのRPC期限を確認。読み上げ開始期限は現ソースの60秒を採用した。Gmailはcommit `7389034`を基礎とする作業ツリーのmonitor/indexを読み、送信元・件名、既存通知と監視ループへの接続点を確認。両mainの未コミット変更は取り込んでいない。
- OpenAI、Ollama、LM Studio、llama.cppの公式資料で通信形式と互換性の境界を確認。出典は設計書の該当説明へ記載した。
- 設計レビューで通知の単回発行、監視を塞がない構成、15秒RPCとの分離、設定同期後の送信先確認、データ最小化、秘密値と取消を照合。保存先の重複と設定変更時の取消条件を明確にした。
- 利用者の設計指定を反映し、初期範囲をApplet/MCP共通API、本体の共通プロンプト、呼出し時のmodel/additionalPrompt、Gmail側のモデル・追加プロンプト設定へ更新。モデル指定を接続の再許可と矛盾させず、共通/追加指示と入力データの分離を定義した。既存TTSのMCP所有者が共通認証域であることを`src/main/index.ts`で確認し、クライアント個別分離を保証しない設計とした。
- ローカル文書リンク、コードフェンス、設計書と入口の内容を確認し、`git diff --check`成功。アプリのテスト・ビルド・実サービス接続・モデル生成は未実施。設計の確認と実装後の検証を区別する。
- 利用者が設計を合意し、コミットとmainへのマージを指定したため、設計を確定状態へ変更。文書3件だけをコミット対象とし、文書リンク・構造・差分を再確認する。製品回帰・版更新・発行は文書のみの変更のため対象外。[コミットと統合の確認記録](.artifacts/commit-validation-ai-design-20261014/validation.json)へ対象hash・tree・commitとmain統合結果を保存する。

## 2026-10-14: 実装時の成功結果をコミットで再利用する手順

- 共通手順と本体/30.PROJECTのAGENTSを整合させ、コミット時は実装時の成功結果を原則再利用するよう明確化。未実行・失敗・後続変更の影響・記録不足のある試験だけを実行し、必要範囲の成功を揃える。CSS変更で無関係なApplet回帰を再利用する例を記載した。
- 実装時から対象ファイル/treeとログを記録し、コミット時は試験単位で差分と依存を照合。元ログの再作成・複製や記録目的だけのstageを不要とした。新しい配布物の確認と、リリースPrepare/sealの既存条件は維持した。
- 変更した4文書のローカルリンク・見出し参照61件が成功。差分レビューで記述の矛盾・製品コード/発行手順の変更なしを確認し、git diff --checkも成功。文書のみのため、製品テスト・版更新・publishは対象外。

## 2026-10-14: 設定テンプレートの仕上げとコミット前検証（0.36.8）

- 操作の許可の見出し/項目を左右18pxへ統一し、狭い画面でも行の内側に同じ余白を確保。配布EXEの明暗テーマ・1280/760幅でショートカット一覧と左位置が一致することを測定した。
- ネストしたグループ、状態表示、Appletのオブジェクト/キー一覧、一覧見出しに共通の薄い背景変数を適用。raisedを20%、panelを80%で混ぜ、ボタン・選択状態の色は維持。新規画面向けの共通ガイドにも記載。
- 前回の共通フォーム・manifest宣言・保存修正と今回のCSSをコミット対象としてレビュー。保存/API境界、未配置項目、検索アンカー、折りたたみ、両入口、テーマ/狭幅、ボタンへの非干渉を確認し、未解決指摘なし。5Appletのmanifestは表示セクション・版・最低本体版以外が旧HEADと同一。
- 型検査、標準回帰 **410/410、fail/skip 0** が成功。Gmail 21/21、Watch 8/8、WallpaperSlideshow 8群、WindowsTools 11/11、WebBrowserTools 2/2の標準回帰もすべて成功。制限環境の初回.NET fixtureビルド失敗はログを保持し、同一コマンドを通常環境で実行して成功。Node24.21.0/pnpm12.10.1/.NET SDK10.0.402。依存lockfile/toolchain/公開待機設定を変更していない。
- 再発行した固定EXEで共通設定の使いやすさ（許可とショートカットを含む10ページの追加表示計測）、Applet設定、設定検索、設定Shellの4スクリプトが終了0。ソースのnavigationとWebApplet回帰も終了0。明暗・1280/760、全6AppletとWebApplet、即時保存/部分JSON/非公開値保持、検索と折りたたみ、設定Shell切替を確認。画像で余白・背景を確認した。
- 同じ未公開変更への仕上げなので0.36.8を維持してpublish.batを再実行し終了0。EXEは **144,170,983 bytes / SHA256 eda1b3d4bb025f1f9ad94def40102ab1b372637b99e708895246414ae90d9010**。FileVersion・asar内package・同梱Default Shell・feed一致。各固定EXE試験はコピーhashを照合。5Appletは版・製品内容を追加変更せず、既存の個別ZIPと全発行ファイルのhashが前回照合記録と一致。
- [コミット検証証跡](.artifacts/commit-validation-applet-settings-20261014/validation.json)に、全6repoの検証tree、終了コード/ログhash、環境、配布物、文書のみの追記差分、最終tree/commitを記録する。試験後の製品変更なし。今回の固定配布物・既存コミットの再利用資料・失敗調査資料を保持し、XX.TEMP追加なし。
- Applet固有のOS操作・実Googleログイン・実サービスでの動作は今回の表示メタデータ変更の対象外。通常publishとコミットまでとし、push・Release・実利用先deployは行わない。


## 2026-10-14: Applet設定の共通テンプレートと用途別カード（0.36.8）

- 先行の本体設定整理・通知起動修正は **f48add7aa5744a5ae9faf5af2de26d477dcf6fcf** へコミット済み。その後の依頼として本項を実装し、今回の続きは未コミットで動作確認へ渡す。
- AppletSettingsFormをshared/settings-uiへ集約し、SettingsSection/SettingsFieldで設定一覧と詳細タブを同じ構成へ統一。manifestの任意`settingSections`を追加し、参照の存在・重複・サイズと最低ホスト版を検査する。宣言しない旧Appletや追加項目も既定カードへ表示し、検索アンカーと部分JSONの保存キーを維持。WebAppletもサイト・表示/ページ遷移・ログイン枠・管理の共通カードへ整理した。
- Gmail、Watch、WallpaperSlideshow、WindowsTools、WebBrowserToolsの宣言を用途別に再配置。既存のsettings/settingActions/commandsは旧HEADとJSON比較で同一。WindowMoverは本体の共通表示だけで対応し、未変更repoの版更新・発行はしていない。大きい一覧は全幅、キー送信は明示ラベル付き、壁紙の履歴とWindows操作は折りたたみにした。
- 実GUIで、表示方法の未保存時に別項目を編集すると空のpagesオブジェクトが生成され保存できない既存不具合を発見。writePathで未設定値の削除時に親を生成せず、表示方法を既定へ戻す際は空の親だけを除くよう修正。他ページ・非公開値の保持を回帰で確認。設定項目/保存ファイルの増減・破壊的変更がない表示メタデータと修正なので、各モジュールをパッチ更新。
- 発行前レビューで宣言検証、未配置項目、両入口、検索/折りたたみ、操作中制御、即時保存、旧値/非公開値、JSON境界、最低ホスト版を確認。保存修正を再レビュー・検証し、未解決の製品指摘なし。型検査・書式・差分検査成功。最終標準回帰は **410/410、fail/skip 0、終了0**。
- [ソースGUI](.artifacts/applet-settings-1791960158477/result.json)と[発行物GUI](.artifacts/applet-settings-1791960532161/result.json)は各4群成功。実6Appletの全項目・起動待ち、boolean/number/select・未接続選択保持、モニター/キー一覧、検索から折りたたみ展開、操作のbusy/結果、フォーム/JSON、両入口の保存、非公開値保持、6Applet+WebAppletの明暗テーマ/1280・760幅を確認。実設定Surfaceの画像を確認した。ネイティブAppletは停止したまま、操作ボタンは専用Node fixtureで検証し、壁紙変更・消灯・ロック・キー送信・実Googleログインは行っていない。
- 発行物の既存設定検索GUI7群とソース画面遷移GUIも終了0。途中のfixtureのID/アカウント枠不足、ウィンドウ表示、範囲外入力、描画待ち不足を修正して再実行。先行失敗を成功扱いしていない。既存navigation試験は新テンプレートのアンカーと空表示へ追従した。
- 本体と変更5Appletの`publish.bat`はすべて終了0。本体 **0.36.8 / 144,177,217 bytes / SHA256 74d17bc3cbee9a2b83a5ff7884111e87955fe018216e33b1dd576992c518f949**。EXE・asar内package・Default Shell・feedの版一致。Gmail **0.10.1**、Watch **0.1.4**、WallpaperSlideshow **0.4.7**、WindowsTools **0.1.4**、WebBrowserTools **0.3.3**。各minimumHostVersionは0.36.8で、ZIP全ファイルと発行フォルダー、manifest/feed、サイズ/SHA256、native製品版を照合。依存lockfile/workspace/toolchainは不変。
- [完全ログ・発行物照合・GUI結果](.artifacts/applet-settings-redesign-20261014/)を保存。各Appletにも自身の`.artifacts/settings-template-20261014/`へ発行・照合記録を保存。未変更機能のApplet固有全回帰・OS操作・長期常駐は未実行。成功した新テンプレート試験は方式ごとに3件以内を保持、コミット参照/失敗調査/固定配布物を保護し、作業用編集スクリプトだけを整理。全体ZIP・push・Release・実利用先deployは行わない。

## 2026-10-14: 設定UI整理のコミット前回帰と管理者起動時の通知経路（0.36.7）

- 「最新版です。」の結果本文を削除。現在版、最終確認日時、新バージョンのバッジ、未確認/失敗などの必要な結果は維持。
- Windows通知からの起動エラーを調査。通常権限の旧0.36.6は起動直後の更新完了通知を含むWindows Shell URI試験7群が成功した。一方、管理者起動中の実AppDockのGate/Runtimeへハンドルを開くだけの読み取り調査では、MUTEX_ALL_ACCESSは両方ERROR_ACCESS_DENIED(5)、SYNCHRONIZEおよびSYNCHRONIZE | MUTEX_MODIFY_STATEは成功。オブジェクトの取得/解放・ACL変更・実利用プロセス操作はしていない。
- portable.nsiをCreateMutexExWへ変更し、GateはSYNCHRONIZE | MUTEX_MODIFY_STATE、Runtime leaseはSYNCHRONIZEだけ要求。既定ACL、名前、mutex待機/解放、子へのlease複製、最終回収を維持。権限付与や追加UACを導入しない。発行前レビューで必要権限と全3か所の作成/再作成経路、lease寿命、二重起動を確認し、未解決指摘なし。設定/保存/API変更がないためパッチ更新。
- 隔離実EXEの[修正前再現](.artifacts/portable-mutex-1791957767932/日本語%20profile/result.json)で、テスト専用Gate/RuntimeのACLを個別に制限し、全権限拒否と同じSetupエラーダイアログを両方再現。finallyで元ACLを復元し、専用ホスト終了後の実行領域回収も確認。UACなしで権限条件を再現したもので、実管理者トークンでの通知クリック試験とは区別する。
- コミット依頼に従い、ここまでの設定共通化・TTS一覧・通知先・Codex・トレイ・更新表示とランチャー修正を対象に必要回帰を確定。固定依存同期、型検査、標準build/fixture/実プロセスを含む **407/407、fail/skip 0** が終了0。証跡は[コミット前検証](.artifacts/commit-validation-settings-0.36.7-20261014/)へ保存。
- `publish.bat`終了0。package/単一EXE/Default Shell/update.jsonは **0.36.7**、EXEは **144,184,430 bytes**、SHA256 **f1ddd2a9ff825df646606baa00b260ea89c84a3fdfbd7baf0ded69fafd8a84df**。lockfile/workspace/toolchainは前後hash一致。
- [修正後の権限再現](.artifacts/portable-mutex-1791958081251/日本語%20profile/result.json)はGate/Runtimeとも二重起動終了0・既存PID維持・second-instance転送1回・最終領域回収を確認。同一発行物で起動直後の更新完了通知と通常Windows通知のShell URI起動、更新表示、設定UI、TTS、通知読み上げ、Codex、トレイ、検索、画面遷移、スクロール、実EXE更新、更新結果、再起動/終了、トレイ識別のGUI/実プロセス **15本が終了0**。各結果・完全ログ/hashは`gui-results.json`へ保存。実管理者トークンへの物理通知クリックは未自動化であり、権限制限fixtureと区別する。
- 初回Codex試験は古い領域名、初回トレイ識別試験は再起動後の別ランチャーの終了待ち不足で失敗。テストだけを修正して各試験を再実行し成功。最後に標準回帰を新規実行し再度 **407/407、fail/skip 0**。製品内容は最初の発行物から不変。修正後stage tree **27c4b4aec14243a3684ff8120fccc8ae7c295f9a**、未stage差分・未追跡入力なし。検証後の変更はこの記録だけとし、最終tree/commitと文書例外を`validation.json`へ記録する。
- 必要回帰・差分・発行物を再確認し未解決の製品指摘なし。コミット検証で参照するfixture/ログは再利用資料として保持し、実行失敗の調査資料も保持。今回のXX.TEMP作成なし。未変更Appletの発行、実利用先deploy、push、Releaseは行わず、本体のここまでの変更だけをローカルコミットする。

## 2026-10-14: 確認結果のインライン化と新バージョン表示（0.36.6）

- バージョン情報の「確認結果」ポップアップと絶対配置CSSを削除し、結果本文・リリースリンクをカード内へ表示。本体とAppletの現在版を共通の色付きバッジへ統一し、確認済みの新バージョンを右側へ矢印付きで表示する。availableかつ確認時currentVersionが現在版に一致する場合だけ表示し、同版や確認失敗を新バージョンとして表示しない。
- 「インストール済みのApplet」を共通SettingsSectionの初期折りたたみに変更。個別更新と更新元編集は展開後に利用できる。確認処理・取得進捗・適用直前の確認/取消・保存仕様は維持。
- 発行前レビュー1回で、更新購読、対象ID、旧結果の表示条件、共通バッジ、結果の配置、折りたたみと検索/個別操作を確認。未解決の指摘なし。設定項目・保存ファイル・公開API変更がないため0.36.5→0.36.6のパッチ更新。型検査・build成功。[ソース設定UI7群](.artifacts/settings-usability-1791956885609/result.json)は両テーマ/1280・760幅、初期折りたたみ、バッジとポップアップ削除を含め終了0。
- `publish.bat`終了0。単一EXE、package、同梱Default Shell、update.jsonは **0.36.6**。EXEは **144,188,287 bytes**、SHA256 **59327a59c72ac72efb232cb86366212bbdbb121c78e071324dc5c613ca9b55e9**。固定依存同期成功、lockfile・workspace・toolchainの前後hash一致。版変更直後のPrettierは依存同期ガードで開始せず、通常publishの固定同期後に再実行して成功。diff検査も成功。
- 同一hashの単一EXE隔離コピーで[設定UI7群](.artifacts/settings-usability-1791957047040/result.json)終了0。発行したwin-unpackedで[更新表示・進捗8群](.artifacts/update-progress-1791957034663/result.json)終了0。ローカルfixtureの本体/Applet新バージョン、右側の配置と色一致、同版/失敗時の非表示、ポップアップ不在、折りたたみ初期状態と展開後操作を確認。両テーマの実設定Surface画像と、取得途中/最終確認で取消して既存Appletファイルが変わらないことを確認した。
- 同一hashの固定EXEで[設定検索7群](.artifacts/settings-search-1791957078187/result.json)終了0。検索対象アンカーへの移動と折りたたみ展開を確認。[発行・照合・整理記録](.artifacts/update-version-layout-20261014/)を保存し、テストプロセス残存0。新規成功分は種類/実行方式ごとに3件以内、古い検索資料は過去検証の参照保護対象のため削除0件。失敗/状態不明/fixtureも保持。バックエンド変更がないため単体全回帰・更新EXE交換全試験・無関係Appletの試験は未実行。commit・push・Release・実利用先deployなし。

## 2026-10-14: トレイ設定とバージョン情報・更新の再構成（0.36.5）

- タスクトレイを共通SettingsSectionの「クリック時の動作」と「コンテキストメニュー」に分離。割当、メニュー構造、操作、即時保存は既存経路を維持。バージョン情報はAboutSettingsへ切り出し、まとめて更新、本体、インストール済みApplet、折りたたみの更新設定と実行環境へ再構成した。
- 共通VersionCheckの「更新を確認」と一括確認ボタンを削除。本体だけ・Appletだけ・個別・本体と全Appletの更新、最終確認日時、結果詳細は維持。更新ボタンから確認・準備・取消を行う。起動時のメタデータ確認と公開check APIは維持し、更新backend・設定項目・保存ファイル・公開APIの変更なし。
- 発行前レビュー1回で要件、既存の更新範囲と取消経路、トレイID/保存、共通部品、検索アンカー、Applet詳細への影響を確認。不要CSSと旧dirty案内を整理し、未解決の指摘なし。保存仕様・破壊的変更がないため0.36.4→0.36.5のパッチ更新。
- 型検査・build成功。tray-menu、portable-updates、settings-page、settings-editingの関連単体 **44/44、fail/skip 0**。ソースGUIは[設定使いやすさ7群](.artifacts/settings-usability-1791955994932/result.json)、[トレイ5群](.artifacts/tray-menu-ui-1791955791096/result.json)、[設定検索7群](.artifacts/settings-search-1791956010541/result.json)が終了0。8ページの両テーマ/1280・760幅、クリック割当、実Tray callback、保存・再起動、全検索アンカーと折りたたみ展開を確認。
- トレイ試験のCDPマウス操作では埋め込みWebContentsViewへHTML5 dragイベントが届かず、ブラウザーのDataTransfer/dragイベント経路で並べ替えと保存を検証する方式に修正し再実行。物理マウスによるドラッグの検証とは区別する。更新進捗試験のソース版起動では製品の配布版限定ガードで更新準備できなかったため、発行したwin-unpackedを使う既存方式へ戻した。これらの途中失敗は成功に数えない。
- `publish.bat`終了0。単一EXE、package、同梱Default Shell、update.jsonの版は **0.36.5** で一致。EXEは **144,171,493 bytes**、SHA256 **f17e9ffa911a50f156cdaf8c235ce4bb8395b8f8e698749eb63fd99a4f6a912a**。固定依存同期は成功し、lockfile・pnpm-workspace.yaml・toolchain.jsonの前後hash一致。
- 同一hashの固定単一EXEの隔離コピーで[設定使いやすさ7群](.artifacts/settings-usability-1791956282011/result.json)と[トレイ4群](.artifacts/tray-menu-ui-1791956309548/result.json)が終了0。両テーマと狭い幅の実設定Surface画像を確認。今回発行のwin-unpackedで[更新進捗5群](.artifacts/update-progress-1791956355288/result.json)が終了0。ローカルHTTP配信の実IPC/進捗表示、途中取消、再試行、最終確認取消でインストール済みAppletが変わらないことを確認した。
- [発行ログ・成果物照合・整理記録](.artifacts/settings-maintenance-20261014/)を保存。試験プロセス残存0。古い成功sourceのtray-menu-ui-1791896672861だけ整理し、直近3回と過去の検索検証参照、portable fixture、失敗・状態不明の資料を保持した。XX.TEMPの追加なし。本体全回帰、実EXE交換を含むportable-updates-ui-test全体、無関係Appletの試験は未実行。通常publishまでで、commit・push・Release・実利用先deployは行っていない。

## 2026-10-14: 設定ページの共通化と読み上げ・通知・Codex連携の再構成（0.36.4）

- 先行0.36.3の共通ページ枠を引き継ぎ、共通カード・項目行・選択カード・結果表示を追加。読み上げ、通知、Codex連携を再構成し、一般・表示・プロフィールにも共通カードを適用。Applet詳細を含むショートカット内部の重複見出し・説明と不要CSSを削除した。新規ページの利用手順を設定基盤の正本文書へ記載。
- モデル未設定でも明示操作でモデル一覧を取得可能。標準data/id形式とQwen3-TTSのmodels/name/downloaded形式を受け付け、既知の未ダウンロードモデルを候補から除外。期限・サイズ・件数・重複・認証・取消を検証し、取得失敗でも保存済みIDを保持する。実サーバーの一覧をサービス経由で読み取り、`1.7B-Base`を確認した。モデルの自動選択・ダウンロード・実サーバーへの試験発声は行っていない。
- 読み上げを通知先の選択肢へ統合。「通知センターのみ」は視覚的通知先と読み上げを一度に解除する。保存は既存targets/speakと共通の声・速度継承を維持。Codexは状態、登録/接続テスト、折りたたみの登録先・接続詳細に整理し、権限とTOML所有範囲を維持した。
- 発行前レビュー1回で保存互換性、操作の所有者と認証、一覧取消、テンプレートの検索アンカー、Applet詳細、幅/テーマ、検証範囲を確認。APIキー保存後の結果表示、外部変更後の通知ボイス継承表示、狭い画面のショートカット検索と絞り込みの横並びを修正して再確認。未解決の指摘なし。設定項目・保存ファイル・破壊的公開API変更がないため0.36.3→0.36.4のパッチ更新。
- 型検査・build・diff検査成功。TTS、通知読み上げ/方針、設定編集/ページ、automationの関連単体 **68/68、fail/skip 0**。ソースGUIは通知読み上げ9群、Node/.NET/MCP TTS9群、automation16群、navigation17群、設定検索7群が成功。固定見出し/ツールバー・本文スクロール・JSON切替は1280/900/760で成功。検索は全本体項目のアンカーと折りたたみ展開を確認した。
- 初回の制限環境でのMCP待受EACCESは同じ試験を通常環境で再実行して成功。automation試験の再起動後Shell選択と旧ページ参照を修正し、最後まで再実行した。初回固定EXEの新GUI試験は、既存のページ全体とフォーム内の2つのエラー表示に対する曖昧なlocatorで失敗。フォーム内へ検証対象を限定して同じEXEで再実行し成功。これらの失敗を成功として数えていない。
- `publish.bat`終了0。単一EXE、package、同梱Default Shell、update.jsonは **0.36.4** で一致。EXEは **144,172,341 bytes**、SHA256 **0cba62b94e1898733d47fe65aa6c88e3122c493d398624b95d7954ec12a0a2f5**。依存の固定同期は成功し、lockfile・pnpm-workspace.yaml・toolchain.jsonの前後hash一致。依存版・供給網検査・待機設定は変更していない。
- 固定EXEの同一hashの隔離コピーで、[設定使いやすさ7群](.artifacts/settings-usability-1791954081914/result.json)、[通知読み上げ9群](.artifacts/notification-speech-ui-1791954113798/result.json)、[Node/.NET/MCP TTS9群](.artifacts/tts-ui-1791954148224/result.json)が終了0。6ページのライト/ダーク、1280/760幅、モデル取得・直接入力・Qwen候補、通知先・声/速度継承、Codex登録/解除、暗号化キー・試聴・31秒WAV停止・終了時回収を確認。スクリーンショットで余白と入力欄の表示を確認した。
- [発行ログ・照合・検証一覧](.artifacts/settings-redesign-20261014/)へ記録。テストプロセス残存0。成功済みsourceの古いnavigation2件・通知読み上げ1件を整理し、種類/実行方式ごとの直近3回、過去検証の参照資料、portable fixture、失敗・状態不明の資料は保持した。XX.TEMPの追加なし。本体全標準回帰・無関係Applet GUIは未実行、物理スピーカーの可聴性は未確認。通常publishのみで、commit・push・Release・実利用先deployは行っていない。

## 2026-10-14: publish時の固定依存自動同期（0.36.2）

- publish.batの先頭で`dev.bat install --frozen-lockfile`を実行し、非0なら同じ終了コードで停止するよう変更。成功した場合だけ従来の`run dist`へ進む。発行の失敗コードも保持する。`dev.bat run`自体の自動復元は追加せず、固定ツール・依存検査・7日待機・install script許可・lockfileを維持。開発手順を更新し、既存の画面整理差分を保持した。
- 発行前レビューで実行順序、正負の終了コード、別cwd/空白を含むパス、同期失敗時の発行停止、既存通常publishの範囲を確認。未解決の指摘なし。BATはCP932互換のASCII・CRLFを保持。設定・保存/APIの変更はなく、0.36.1→0.36.2へパッチ更新。
- 実cmd.exeでランチャー回帰2/2・fail/skip 0。既存devの3ケースに加え、同期/発行成功、同期失敗7・STATUS_STACK_OVERFLOW、発行失敗19・STATUS_STACK_OVERFLOWの5ケースを確認した。初回は試験ランナーの空白入りパスの引用符処理が失敗し、windowsVerbatimArgumentsを指定して再検証。整形後にも2/2を再実行し、型検査・Prettier・git diff --checkも成功した。
- package0.36.2／pnpm記録0.36.1の状態から、手動installなしでpublish.batを実行。自動同期は終了0、pnpm記録が0.36.2となり、そのまま発行終了0。lockfile・pnpm-workspace.yaml・toolchain.jsonの前後SHA256が一致した。供給網検査は既存キャッシュを使用し、依存解決は固定lockfileのまま省略された。
- 単一EXEは144,176,054 bytes、SHA256 `a3e17d002042b30e9b4a6390d64e4d0929c331cea891ac1633b7e2a7b8851312`。package・FileVersion・Default Shell・update.jsonは0.36.2で一致、feedのsize/hashを照合。発行完了後の隔離コピーは同じhashで、portable smokeは終了0・ok:true、Default Shell running、UI bridge、Node非公開、設定/画像保存・トレイを確認し、試験アプリ残存なし。
- [完全ログと前後・成果物照合](.artifacts/publish-sync-20261014/)と[固定EXEのsmoke結果](.artifacts/smoke-1791948447870/smoke-result.json)を保存。直近3回のsmokeと、古いコミット検証参照1件を保持。既存launcher fixtureは使用/参照状態を完全には確認できないため保持し、今回の引用符失敗fixtureも失敗ログとともに保持、削除0件。XX.TEMPの作成なし。全標準回帰・無関係GUI/兄弟Appletは未実行。通常publishのみで、commit・push・Release・全体ZIP・実利用先deployは行っていない。

## 2026-10-14: publish.batの依存記録復元と設定画面の構文修復（0.36.1）

- 初回publishは`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`で終了1。package.jsonは0.36.1、pnpmのworkspace記録は0.36.0だった。`dev.bat install --frozen-lockfile`で記録を同期し、終了0・359パッケージ再利用・取得0件。lockfileのSHA256は前後とも`E493D4630ACF4AD64463BAFBD2EDCE61E2C35FCA2CB6E229C13BAFDBCFC40DE3`。依存版・ローカルツール・7日待機・既存の完全版指定例外・供給網検査を変更していない。
- 続く型検査でSettingsForm.tsxのdetails開始タグの文字列終端と`>`欠落を確認。`className="update-disclosure"`へ1行を復元し、既存の見出し整理・自動保存案内削除は保持。発行前レビューで修復行、既存差分、設定・保存/APIへの影響、版整合を確認し、未解決の指摘なし。既存の0.36.1へのパッチ更新をこの修復でも使用し、重ねて版を増やしていない。製品バージョン変更後のworkspace同期手順をDEVELOPMENTへ追記。
- 修復後の型検査は終了0。関連するsettings-page回帰は5/5、fail/skip 0・終了0。publish.batも終了0。制限環境のpnpm installはSTATUS_STACK_OVERFLOW、publishは.NET工程で終了1となったため、同じ固定ツール・検査設定を維持して通常環境で再実行し成功した。失敗を成功に数えていない。
- 単一EXEは144,167,089 bytes、SHA256 `fbac243d331d76a1d9c42ef886ab69d29523828485e0053c21a9ce5c33575a1a`。package、EXE FileVersion、Default Shell、update.jsonは0.36.1で一致し、feedのsize/hashも照合済み。隔離コピーのSHA256一致、portable smoke終了0・ok:trueを確認。Default Shell running、UI bridge、Node非公開、プロフィール画像・設定保存・トレイを検証した。
- [検証ログ・成果物照合](.artifacts/publish-repair-20261014/)と[隔離smoke結果](.artifacts/smoke-1791947878718/smoke-result.json)を保存。試験専用プロセス残存なし。成功したportable smokeは直近3回だけ現存し、保持・削除0件。新規のXX.TEMPファイルなし。全標準回帰・設定画面全操作GUIは今回の構文修復では未実行。未変更Applet発行・全体ZIP・commit・push・Release・実利用先deployは行っていない。

## 2026-10-14: 通知読み上げの実装とコミット前検証（0.36.0）

- 通知種類ごとの`speak`（省略時OFF）と、通知全体の声・速度の任意上書きを実装。接続先・モデル・APIキー・速度適用方式は共通TTS設定を使用。共通設定ページの公開モデル・操作へ試聴と試聴だけの停止を追加し、通知ONで直接APIの利用許可を変更しない。
- 新規通知IDだけをTTSへ接続し、本文更新・表示先変更・既読・Shell切替で再発声しない。自然な表示期限切れは音声を維持し、OFF・明示終了・Applet停止・世代変更で取消。起動待ちを含む全体停止、発行から60秒の開始期限、生成後とプレイヤー準備後の再検査を実装。OS問い合わせとロック・サスペンド・全画面の判定をデスクトップ表示と共有し、表示Windowがなくても抑制する。
- 発行前レビュー1回で、要件、通知とTTSの寿命、設定の保持・公開範囲・所有者、抑制workerの共有と解放、音声・本文回収、影響する試験を確認。全体停止の起動待ち回収、受付例外と通知結果の分離、継承ラベルとUI表示を補強。後続確認では外部保存による声上書き解除の表示を修正し、対応GUI試験を追加して再レビュー・再検証・再発行した。未解決の指摘なし。
- 最終ソースで型検査と本体標準回帰を新規実行し、**401/401、fail/skip 0、終了0**。新設した通知読み上げ単体10件を含む。SDKのTTSプローブRelease buildは警告・エラー0。ソースの通知読み上げGUI9群、既存通知設定GUI8群、デスクトップ通知GUI7群がすべて成功。
- 固定0.36.0 EXEの隔離コピーで、通知読み上げGUI10群、既存Node/.NET/MCP TTS GUI9群、smokeを実行し終了0。発行物と隔離EXEのSHA256は一致。実TTS `http://alice:8080/v1`／`1.7B-Base`／`yui`へ短い専用日本語通知を送り、playback速度1.4で**3,425msで生成からプレイヤー終了まで確認**。60秒は内部の開始期限であり、長文・高負荷時の生成性能を保証する値ではない。物理スピーカーの可聴性は未確認。ロック・解除はpowerMonitorイベントfixture、全画面は実Windowで確認し、実際の画面ロック・サスペンド操作は行っていない。
- 最終の検証前後stage treeは**06609d4bf271e0f0747eedf47ae7aa42937104a0**で一致し、stageと作業ファイルも一致。検証後は本記録だけを追記し、文書のみの差分・最終tree・commitを[完全ログと検証証跡](.artifacts/commit-validation-notification-speech-20261014/validation.json)へ記録する。先行treeの成功を最終treeの代用にせず、必要回帰を再実行した。
- Node24.21.0・pnpm12.10.1・.NET SDK10.0.401を使用。設定項目追加により0.35.2から0.36.0へマイナー更新。版変更後は`dev.bat install --offline --frozen-lockfile`で構成を再確認し、依存版・lockfile・公開後待機・供給網ポリシーは変更していない。共通SDK/APIの公開署名変更と兄弟repoの変更はなく、未変更Appletの再発行・無関係なApplet GUIは対象外。
- publish.batは最終treeで終了0。単一EXE/update.json/同梱Default Shellの版は0.36.0。EXEは**144,138,352 bytes**、SHA256 **cb4914c5b64e33fc81b94c936797c1022a3c6b4717e767c99932b0934ab6e44a**。通常publishだけを行い、全体ZIP・Release・push・実利用先deployは行わない。
- 初回GUIはセンターのみを宣言したfixtureのminimumHostVersionを0.31.0へ修正。初回単体はhistory:none終了後のレコード除去に合わせて試験の期待値を修正した。これらの失敗を成功に数えず、最終試験で再確認した。
- 後片付けは今回の編集用一時スクリプト8件を削除。成功済みsourceの通知設定6件・デスクトップ5件は、直近3回より古いこと、終了、パス、再解析ポイントなし、固定EXE・再利用参照なしを再確認して整理。直近3回、新機能のsource3回とportable2回、固定EXE、失敗調査、検証証跡を保持。[整理監査](.artifacts/commit-validation-notification-speech-20261014/cleanup-result.json)を参照。

## 2026-10-14: Gmail非表示復帰のコミット前確認（0.35.2）

- 利用者から機能の動作確認済み申告あり。対象9ファイルの差分を再確認し、先行の発行前レビューから製品・試験・依存の入力hashが一致することを確認。未解決の指摘なし。
- 対象差分をstageした後、型検査と本体標準回帰を新規実行し、391/391・fail/skip 0・終了0。Gmail標準回帰21/21と、同じ固定0.35.2 EXE/Gmail0.10.0を用いたGUI8群も新規実行し成功。先行の部分回帰を本体全回帰の代用にはしていない。
- 検証前後のstage treeは本体9ed614b200aa994414d431833f4fda2b2d189088、Gmail b19becf146d59ecb50acd9b431d7b298bcc611beで一致。stageと作業内容も一致し、未追跡の検証入力なし。検証後の変更は両repoのVERIFICATIONのみとし、最終tree/commitを[証跡](.artifacts/commit-validation-gmail-auto-return-20261014/validation.json)へ記録する。
- Node24.21.0・pnpm12.10.1・.NET SDK10.0.401を使用。完全ログとSHA256、試験入力・実行方式・兄弟repo・固定配布物を証跡へ保存。Gmail再ビルド後の全8ファイルは既存ZIPの内容と一致し、ホストEXE/更新ZIPのhashも不変。製品修正・版更新・再梱包は不要。
- 今回の固定EXE GUIは[8群の結果](../Applet.Gmail.at365/.artifacts/auto-return-1791920625399/result.json)。同一方式の成功試験はsource3回・portable2回で、直近3回以内なので整理対象なし。失敗調査・固定EXE・再利用用証跡を保持。mainへローカルコミットし、push/Release/deployは行わない。

## 2026-10-14: Gmail非表示時の開始ページ復帰（0.35.2）

- WebAccountDefinitionへ任意のreturnToStartOnHideSettingを追加。自身のboolean設定・settings capability・observeOriginと開始URLのoriginを検証する。ホスト全体の設定と保存ファイルは追加せず、未宣言/OFFの従来動作を保持するため本体はパッチ更新。
- 発行前レビュー1回：切替前Viewの限定、選択先保持、実Surfaceの表示寿命とviewport(null)の区別、認証・同一文書hash移動、遅延読込/再表示/停止、設定・保存領域・API・影響先を確認。未解決の指摘なし。読込中はdid-stop-loadingで再判定し、表示先変更中の一時非表示はmicrotaskでまとめる。Gmail固有IDをホストへ追加していない。
- dev.bat run typecheck、dev.bat run buildが終了0。機能別回帰web-accounts/web-accounts-auto-return/applet-pagesは20/20、fail/skip 0。Gmail標準回帰は21/21。今回は本体標準全回帰、SDK/.NET Applet/無関係なApplet GUIは実行していない。
- Gmailのscripts/test-auto-return.cjsを固定0.35.2 EXEの隔離コピーで実行し、8群・終了0。OFF保持、ON保存、UI/コマンドの枠切替、本体ページ切替、最小化/×、表示先変更、入力/query保持と全体reloadなし、遅延読込と再表示取消、認証保護、再起動を確認。発行物と隔離EXEのSHA256は一致。結果は[GUI証跡](../Applet.Gmail.at365/.artifacts/auto-return-1791920189301/result.json)、ログと発行hashは[検証証跡](.artifacts/gmail-auto-return-20261014/validation.json)。
- 初回GUIは旧ShellのDOM待ちとWebContents列挙順への依存を修正。遅延fixtureは別queryで文書遷移を区別。portableのPlaywright直接launchはNSISからInspector出力が届かずタイムアウトしたため、既存CDP/electron-main-helper方式へ試験のみ修正。旧試験プロセスの終了を確認し、同じ固定EXEで8群を再検証した。製品の追加修正・再発行は不要。
- package版変更の構成検出へdev.bat install --offline --frozen-lockfileで対応（終了0）。依存版・lockfile・待機/供給網ポリシーに変更なし。publish.batは終了0、単一EXE/update.jsonは0.35.2で一致。EXEは144133211 bytes、SHA256 3f3408bd98f8bb2bfe1411f839fd5684551a7b7876e71ff7b64960efbc3d722c。
- テスト保管：source成功は直近3回、portable成功は1回なので削除候補なし。失敗/接続待ちの調査証跡は保持し、再利用用固定EXEとvalidationも保護。実Googleの受信・下書き処理は未確認。commit/push/Release/deployは行っていない。

## 2026-10-14: Codex登録修復のコミット前検証（0.35.1）

- 利用者から実環境での動作成功申告あり。追加差分7ファイルをレビューし、所有情報・同名表不在・独立した一意コメント・TOML意味一致、範囲外bytes保持、バックアップ・原子的保存を確認。未解決の指摘なし。本体標準回帰と登録/MCP GUIを必要回帰とし、SDK/兄弟repoは変更していない。
- 型検査と標準test（updater/main/renderer/Default Shell/fixture buildを含む）を新規実行、**387/387、fail/skip 0**。試験tree **7992d7115a8a64ecfd54efc26d50ac6547b04c3f**、検証前後・stage/作業内容が一致。以後の追記は本記録のみ。
- 固定0.35.1 EXEの登録/解除ボタン・既存MCP・許可/設定/再起動・両テーマ3幅の **16群**は先行成功証跡を再利用。製品/試験スクリプト/package/lockfile/toolchain・結果・完全ログ・EXEの全保存hashを再照合し一致。過去の部分回帰を標準回帰の代用にはしていない。実利用への操作は今回追加していない。
- 製品の追加修正・再発行・版更新なし。EXEのSHA256 **842c897f679f118cf9e6dc32a6f49f0ebdb58f1ca38f8fa88fc9e0ccde9c2fed** を保持。[再利用用証跡](.artifacts/commit-validation-codex-orphan-20261014/validation.json)へtree・コマンド/終了コード・ログhash・再利用元と照合結果・最終commit/treeを保存する。新GUIフォルダーはなく、直前の整理/保護結果を維持。mainへローカルコミットし、push・Release・deployは行わない。

## 2026-10-14: 外部アンインストール後のCodex再登録修復（0.35.1）

- 実利用config.tomlを秘密値を出さず読み取り確認。AppDockの同名MCP表と開始コメントがなく、配置IDの終了コメントだけが残っており、旧range検査で登録・解除ともに「登録範囲が変更されています」となる原因を確認。配置別automation.jsonには同じ設定ファイルの所有情報が現存する。実利用設定への書込・deploy・実クライアント再接続は行っていない。
- 保存済み所有情報があり、登録本体がなく、開始/終了のいずれかの独立コメントが1行だけ残り、その1行除去前後でTOML値が完全一致する場合だけ再登録/解除できるよう修正。状態確認は読み取り専用。コメント重複・逆順・行内追加・文字列内マーカー・所有情報なし・残存同名表は拒否を維持する。発行前レビューで原子的保存と直前bytes照合、範囲外の意味/bytes保持とバックアップを確認し、未解決の指摘なし。
- 型検査・build、関連回帰 **50/50、fail/skip 0**。登録/解除、LF/CRLF/EOF、状態確認の非書込、バックアップ、曖昧な範囲の拒否を追加検証。新規試験の引用符構文と版更新後のworkspace不一致は検証中に解消。install --frozen-lockfileは同じ依存を再利用し、lockfile・待機例外・供給網検査は変更していない。
- ソースGUI **16群**（automation-source-1791917406374）と、固定EXEのhash一致コピーによるGUI **16群**（automation-portable-1791917592204）が終了0。配布EXEでは終了コメントのみの再登録と開始コメントのみの解除を実ボタンで検証し、他のTOML bytes保持・既存MCP18ツール・許可/設定/再起動・両テーマ3幅も成功。対象の子プロセス残存なし。
- 設定・保存ファイル・公開APIの追加/削除がないため0.35.0→**0.35.1**のパッチ更新。本体publishだけを更新、publish.bat終了0。EXE **144130681 bytes**、SHA256 **842c897f679f118cf9e6dc32a6f49f0ebdb58f1ca38f8fa88fc9e0ccde9c2fed**。FileVersion/package/feed/同梱Shellが一致し、feedのsize/hashを照合。未変更Applet・全体ZIPは対象外。この修復差分は未コミット、push/Release/deployもしていない。
- [証跡](.artifacts/codex-orphan-repair-20261014/validation.json)に実設定の非機密判定、ログhash・入力hash・結果を保存。[整理](.artifacts/codex-orphan-repair-20261014/cleanup.json)は直前の照合済み保護対象と新規成功2profileを保持、削除0件。実利用側は新EXEへ更新後「登録・修復」とCodex再読み込みが必要。実アプリからのアンインストール操作自体は今回再実行せず、確認済みの残存状態を隔離configで再現した。全標準回帰はこの修復段階では未実行。

## 2026-10-14: TTS連携のコミット前検証（0.35.0）

- mainのTTS差分をレビュー。専用許可の初期OFF・独立保存、既存API互換、所有者とruntime世代、APIキーの接続先束縛・非露出、停止/終了、速度方式と設定モデル/検索を確認。製品修正を要する未解決の指摘なし。本体標準回帰とTTS・共通API/MCP・設定Shell/検索を必要回帰とした。兄弟repo製品と.NET SDKは変更していない。
- 型検査成功。標準test（updater/main/renderer/Default Shell/fixtureのbuildを含む）は **385/385、fail/skip 0**。初回384成功/1失敗はTTS完了記録の15ms実時間期限が並列負荷で観測前に切れたテスト競合。テストのDate.nowを固定し、期限直前・期限到達・新サービスでの記録不在を検証するよう修正後、全標準回帰を再実行した。元の失敗ログも保持。製品コードは変更していない。
- .NET TtsProbe/ApiProbeのRelease build成功。固定配布EXEでTTS **9群**、MCP既存操作 **15群**、ソースのNode/.NET共通API **5群**、設定Shell **9群**、設定検索 **7群**を直列・隔離profileで確認、全終了コード0。新ページのカタログ全項目のanchor、即時保存/競合/復旧、許可と再生/停止/終了を確認。試験終了後の対象プロセス残存なし。
- 試験treeは **54db186b617c27c513c73d9c03a4553d1b39a6f0**、試験前後とstage/作業内容が一致。検証後の追加は本記録のみ。発行済みEXEのSHA256は **1adff8f7a601d0b3c424a2df5e34402f0436eb704d4692460aae1b560ce2b2cf** のまま。製品/版/依存変更なしのため再publish・再版更新は不要。両ボイス1.4倍速の先行実サーバー試験は同一固定EXEのhashを照合し、今回の新規実行と分けて保存した。
- [再利用用証跡](.artifacts/commit-validation-tts-20261014/validation.json)にtree、コマンド/終了コード/完全ログhash、ツール/依存/fixture/発行物hash、GUI結果を保存。コミット後のSHA/treeを同記録へ追加する。[整理記録](.artifacts/commit-validation-tts-20261014/cleanup.json): 対象試験フォルダー54件を照合、直近成功・検証参照・失敗/不明を保持し削除0件。push・Release・実利用先deployは行わない。

## 2026-10-14: TTSサーバー連携の実装・ローカル発行（0.35.0）

- main 3388f05上で実装。読み上げ設定、接続先に紐付くPC専用暗号化APIキー、TTS専用のApplet/MCP独立許可（初期OFF）、共通4操作、ジョブの所有者・重複判定・生成/再生/停止/回収を追加。設定・保存ファイルの追加により0.34.1→0.35.0のマイナー更新。同梱Default Shellも0.35.0。Applet製品・依存・lockfile/toolchainを変更せず、本体だけをpublishへ発行。コミット・push・Release・実利用先deployは行わない。
- 発行前レビューは設定/Schema/秘密保存、API公開先・許可・所有者、再生/取消/終了寿命、Shellモデル・入力・文書と試験を対象に実施。実試験で停止後のexecuteJavaScript待機が残り、停止API/ホスト終了が待ち続ける不具合を検出した。プレイヤー破棄・取消を明示的なPromiseで待機経路へ接続して修正。レビューで接続先変更後の古いボイス候補と試聴画面の配置も修正し、設定取得条件変更時の候補消去と専用CSSを追加。修正後に再検証し、発行を妨げる指摘は残っていない。
- 実サーバーのOpenAPIにはspeed 0.25～4があるが、1.7B-Baseのボイスクローンbackendはspeed≠1にHTTP 400（等速のみ対応）を返した。AppDockの既定方式をplaybackとし、サーバー等速生成＋playbackRate/preservesPitchで速度を適用する。server方式も選択可能で、二重適用・拒否時の自動再生成をしない。仕様変更を設計/利用文書へ反映。
- 型検査・main/renderer/Default Shellのbuild成功。TTS 15件を含む共通API/MCP・設定/ページ・preferences・登録音声の関連回帰 **59/59、fail/skip 0**。新規.NET TtsProbeと既存ApiProbeのRelease build成功。Node/.NETの共通API・即時保存・許可・旧入口・MCP再入・テーマ/画面幅/再起動の実GUI回帰 **5群**（applet-api-source-1791915686923）成功。
- 固定単一EXEのSHA256一致コピーを隔離profileで起動し、TTS実プロセス試験 **11群**（tts-ui-1791915965315）成功。設定からの一覧/試聴、キー暗号化とモデル/ログ非露出、Node/.NET SDK、MCP4操作・重複防止、31秒WAVの再生開始/停止、MCP許可取消後の停止/状態取得、実サーバーのyui/yui-quietgirlを1.4倍速で再生完了、再生中のホスト終了を検査。実rendererのplaybackRate=1.4・preservesPitch=trueも照合。試験終了後に同profileのElectron/.NETプロセス残存なし。
- 実サーバーはhttp://alice:8080/v1、モデル1.7B-Base、キーなし。短い固定検証文の音声はWAVコンテナー/デコード/endedまで確認した。物理スピーカーからの聴感・音程品質、他サーバー、実長10分/64MiB上限の実機再生、非Default ShellのTTS専用フォームは未確認。境界・HTTP失敗・破損/上限超過・待機/生成期限・取消競合・所有者違い・重複期限・速度方式は疑似応答/単体試験で確認。全標準回帰・無関係なGUI/兄弟repo回帰は今回の実装範囲では未実行。
- package版変更後、pnpmがworkspace記録の変化を検出したためinstall --frozen-lockfileで再構築。終了0、既存lockfileの解決を省略し同じ依存を再利用。供給網検査・7日待機設定・既存の完全版指定例外を保持。publishは一度自動承認レビューに外部配布と判定され拒否されたが、build-portable.cjsのpublish:'never'とローカル生成のみであることを確認して同じpublish.batの実行が承認された。外部公開はしていない。
- publish.bat終了0。publish/AppDock.at365.exe **144142170 bytes**、SHA256 **1adff8f7a601d0b3c424a2df5e34402f0436eb704d4692460aae1b560ce2b2cf**。EXE FileVersion・package・update.json・同梱Shellは0.35.0、feedのサイズ/hash一致。通常publishとして未変更Applet再発行・全体ZIP作成・旧ZIP整理なし。
- 証跡は.artifacts/tts-implementation/{typecheck,build,unit-tests,applet-api-gui,gui-real,portable-tts,publish,install}.log、実WAV/real-server.json、各隔離profileのresult.jsonとsettings.png。実行手順と受入条件はdocs/tts-design.mdを参照。リンク・差分検査成功。

## 2026-10-14: 最新mainへジェスチャー開始判定を統合・コミット検証（0.34.1）

- main be7e5bf（0.34.0、Shell領域割り当て実装/TTS設計を含む）へ今回のworktree差分を3-wayで統合、競合なし。既存mainの変更を保持した。0.33.1試験版を最新minorへ合わせて0.34.1とし、package.json/更新情報/同梱Default Shellを一致させた。設定項目・保存ファイル・公開APIの変更はなく、パッチ更新区分を維持。旧0.33.1の実装・検証は以下の履歴に保持する。
- コミット前レビューで、右down時だけの判定、通常入力の通過、途中解放と捕捉済み入力の対の解放、左右Win/マウスボタン、開始後のキー/クリック、対象条件・取消、最新Shellとの文書/試験/版の整合を確認。製品側の修正を要する指摘なし。
- 最終試験tree **95001aaeebe36751a6bf2d238bb722cb259459d6**で型検査と標準回帰 **370/370（fail/skip 0）**、実OS入力 **96/96**、実Node WebBrowserTools/.NET WindowsToolsの共有入力・許可・取消・連続操作 **4群**（native-input-ui-1791913043409）成功。.NET ExtensionHost/InputHost publishとInputTests Release buildも成功。SDK/API・Applet製品コードは変更せず、無関係な兄弟Appletの全回帰/再発行は対象外。
- 固定単一EXEの隔離コピーでジェスチャー **15群**（gestures-ui-1791912850803）、ショートカット **8群**（shortcuts-ui-1791913126368）、同じ発行内容のwin-unpackedで画面遷移 **17群**（navigation-1791913207768）が成功。左右修飾キー8種類/他ボタン4種類の先行押下・途中解放・解除後の再開、開始後のCtrl+A、実Window/ページ/Web条件、登録競合、記録中の解除、即時保存/競合/再起動、両テーマ3幅を検証。
- 初回portable試験のフォーカス取得失敗と初回stroke未受信を失敗profile/ログへ保持。試験ツールに、送信モードのメッセージキュー生成、前面/対象Windowの入力スレッド接続、BringWindowToTop、入力前に限った2秒の取得確認、カーソル下root Windowの照合とキー状態の診断を追加。前面/対象が一致するまで入力せず、入力後のジェスチャー再送・期待値緩和はしない。[Windows仕様](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-attachthreadinput)も確認。修正後に上記370件/96件/4群と固定EXE試験を再確認して成功した。
- 試験ツールの調整中に製品コードは変更していない。発行時tree 477e24ad0be47c1c39f2372d6d1850941b73edf4と最終試験treeの差は配布物へ同梱しないtests/InputTests/Program.csだけ。版を重ねて増やさず同じ固定EXEを最終試験に使用。検証後の追記はVERIFICATIONだけとして差分を検査・記録する。
- publish.bat終了0。単一EXE **0.34.1 / 144,134,515 bytes / SHA256 91546e9757f5f36b3f923ad203c0ddeb5f816b410217230e63725cb11b84a593**。update.jsonの版/size/hash、同梱Default Shell0.34.1、同梱InputHost DLLと試験出力のhashが一致。portableコピーの前後hashも一致。通常publishだけを行い、未変更Appletの発行・全体ZIP・旧ZIP整理は行わない。
- 固定Node24.21.0/pnpm12.10.1/Electron44.6.0/.NET SDK10.0.401/Windows26300 x64を使用。frozen/offline install成功、lockfile/toolchain/待機/検証方針は変更なし。全コマンド/引数/cwd/時刻/終了コード/完全ログ/hash、tree、試験EXE/fixture/参照Appletのcommit/tree/発行物hashは **.artifacts/commit-validation-gesture-start-0.34.1-20261014/** に保存。コミット後SHA/treeもmetadata.jsonへ保存する。
- 明示許可に従い、実入力試験中だけ通常AppDockのgestures.enabledをOFFにし、終了後は元の値へ復元。MCP再取得で全ジェスチャー設定が変更前と一致した。今回の方式別成功分は直近3回以内で、過去の封印済み証跡・実行方式不明・失敗/診断profile・固定出力を保護し、profile削除は0件。不要な今回の診断補助2ファイルだけを削除し、ログ/hashを保持。最終4試験のアプリ終了を確認。詳細はcleanup.json/gui-results.json。
- 通常キーの先行押下は対象外。OSの左右ボタン入れ替え設定を実際に変更する試験、特殊ドライバーの独自ボタン、管理者アプリ/UAC・別デスクトップは未確認。push/Release/実利用先deployは今回の範囲外。

## 2026-10-14: 修飾キー・他マウスボタンの先行押下でジェスチャー開始を見送る（0.33.1）

- mainの確定済み51e0372（0.33.0）から専用worktree `A:/30.PROJECT/AppDock.at365.worktrees/gesture-modifier-bypass`、branch `codex/gesture-modifier-bypass`を作成した。開始時の元mainの別作業の未コミット変更（0.34.0）は含めず保持。終了時には別作業がmain 2e9737e（0.34.0）へコミット済みで、さらに別の文書編集があることを再確認した。この試験EXEは開始時の0.33.0を基にした0.33.1で、0.34.0のShell領域割り当て実装を含まない。統合時は最新mainとの版・影響を再照合する。今回の変更は未コミット・未統合で、push/Release/実利用先deployを行わない。
- 右ボタン押下時、左右Ctrl/Alt/Shift/Winまたは左/中/X1/X2が押されていればBeginへ入らず、通常入力を通す。先行入力の途中解放で待機を開始しない。前回捕捉した修飾キー・左/中ボタンがまだ解放されていない場合も見送る。開始後の修飾キー付きキー操作・クリック操作は維持。通常キーの押下は開始条件に含めない。左右マウスボタンの入れ替えはSM_SWAPBUTTONで論理左の物理キーを選ぶ。
- 発行前レビュー：Beginの判定順、通常右ボタンの押下/解放の通過、捕捉済み入力の対の解放、busy/取消/対象条件、Winと左右ボタンの扱い、既存キー/クリックジェスチャーの維持、試験・文書・版の整合を確認。発行を妨げる製品側の指摘なし。設定項目・保存ファイル・公開APIの追加/削除/互換性変更はなく、開始判定の修正としてパッチ0.33.1へ更新。README/DEVELOPMENT/ジェスチャー仕様を更新した。
- .NET SDK10.0.401、Node24.21.0、pnpm12.10.1、Electron44.6.0、Windows26300 x64。InputHost自己完結Release publishとInputTests Release buildは成功（0警告/0エラー）。型検査・本体build・ジェスチャー関連ソース回帰20/20（fail/skip 0）成功。標準の全回帰・無関係なApplet回帰は今回の部分実装では実行しない。
- 実OS入力回帰96/96成功：左右の各修飾キー8種類と左/中/X1/X2を先に押し、押下継続/途中解放の両方で右down/upが直接届くこと、移動・ホイールがジェスチャーを実行しないことを確認。捕捉Ctrl/左ボタンの継続、待機開始後のCtrl+A、解放後の再開、従来のクリック・キーrepeat・ホイール積算/破棄・通常右クリック復元・取消・対象条件も確認。
- 初回実入力試験は稼働中の通常AppDock入力フックとの干渉で通常右クリックの受信が失敗し、診断ログを保持した。明示許可を受け、通常AppDockのgestures.enabledだけを試験中OFFへ変更。干渉解消後の残り1件はOSのWM_RBUTTONDBLCLKを試験の押下数へ含めていなかったため、右downとdouble-clickの両通知を数えるよう試験を修正し再検証した。最終試験後、enabledを元のtrueへ復元し、MCPの再取得で全ジェスチャー設定が変更前と一致した。元のAppDockを停止・配置・更新していない。
- 共有node_modulesのjunctionでpnpmのworkspace構造検証が失敗したため、確認済みjunctionだけを外し専用node_modulesを作成。`dev.bat install --frozen-lockfile --offline`で359件を既存キャッシュから取得、download 0で成功。.toolsは元repoの既存固定ツールをjunction参照して再利用する。lockfile/toolchain/pnpm-workspaceはGit正規化blobが元repoと一致し、依存版・公開後待機・検証方針を変更していない。
- 通常publish.bat終了0。本体単一EXE **0.33.1 / 144,123,207 bytes / SHA256 aa81db8949bde4634e18120ee65885f4d6dc7f165cce5398ecf188114eb32503**。update.jsonの版/size/hashと同梱Default Shell0.33.1が一致し、同梱InputHost DLLと試験済み出力のhashが一致。未変更Appletの発行・全体ZIP生成・旧ZIP整理は行わない。
- 固定EXEの隔離コピーで `dev.bat exec node scripts/gestures-ui-test.cjs --portable` が15群成功。`.artifacts/gestures-ui-1791910901799/result.json`にok:true、前後EXE hash一致を記録。左右修飾キー8種類と他ボタン4種類を先に押して途中で離す実入力で開始を見送ること、解除後の通常ジェスチャー、実Window/ページ/Web条件、Ctrl+A、両テーマ3幅、即時保存/競合/renderer reload/プロセス再起動を検証した。
- 証跡と完全ログは `.artifacts/gesture-start-validation/`。今回の成功GUI profileは1件で直近3件以内。固定ビルド出力・試験資料・診断/失敗ログを保持し、削除対象はない。試験用InputTests・専用InputHost・隔離portableの終了を確認した。左右入れ替えのOS設定を実際に切り替える試験、特殊ドライバーの独自ボタン、管理者アプリ/UAC・別デスクトップは未確認。

## 2026-10-14: 領域ごとのShell割り当て実装（0.34.0）

- main `51e0372`を起点に[設計](docs/shell-region-assignment.md)の段階1〜5を実装。既存8領域の`host.shellProviders`、Default常時有効、利用不能領域だけのフォールバック、設定・解決・実Viewの区別を共通Registryへ集約した。旧`shellProvider`は入力時に移行し、起動だけでは共有設定を保存しない。新旧併記は新マップを優先し、未知領域・未導入・無効Appletの指定を保持する。設計の大きな変更なし。
- 即時保存と両入力キューを維持し、settings自身の切替は現在のIPC返信後にflushする。3秒のflush失敗では有効な旧Viewと保存済み指定を保ち、明示再試行で切り替える。View交換でController・検索・保存値を破棄せず、記録中の入力と設定用パレットは閉じる。表示中パレットの提供元は受付時に固定し、無効化・故障は同じ要求をDefaultで継続する。通知の寿命・ID・履歴・センターの検索状態を維持し、banner/desktopを独立解決する。
- 宣言済み専用コマンドの`shellRequirement`をresolved/visibleで共通検査し、別名・動的登録にもmanifestの条件を継承する。条件なしの既存コマンドと生成設定コマンドの互換を維持。受付後のworker世代・View sessionが失効した共通API呼出しを拒否する。Node/.NET/nativeで自己領域だけの取得・購読、直列配送と古いrevisionの破棄を確認。新API利用を宣言したworker以外へ未知の変更通知を送らない。
- 発行前レビューでは領域限定の故障抑止、旧statusとの互換、循環しない提供元列挙、worker/View世代、即時保存時の返信/flush順、記録解除、自己状態の情報範囲を確認・修正した。GUI終了時には破棄済みWindow/Trayへの参照が発生したため、Windowの寿命確認、終了中のchanged通知停止、Tray破棄確認を追加。終了時例外を試験失敗へ変える`gui-error-guard.cjs`で関連ソースGUIをやり直し、手動でダイアログを閉じた旧実行を成功証拠に使っていない。
- 型検査、標準回帰 **370/370**、SDK/Runtimeとnative fixtureのRelease buildが成功。ソースGUI **21種類**が終了コード0（Shell混在/リボン/overlay/page/home/settings/search、通知banner/desktop/center/settings、設定同期、テーマ、host/tray/Applet API/automation/hotkeys/shortcuts/gestures/navigation）。テーマの初回は可視フレーム取得0で失敗し、同条件GPU再実行とsoftware各18切替が成功。ジェスチャーの初回はWindows前面取得に失敗し、同条件再実行では実入力を含め成功した。両失敗のログ・結果を保持し、これらのための製品変更はしていない。
- 通常`publish.bat`が終了コード0。本体の設定項目追加・廃止により **0.33.0 → 0.34.0** のマイナー更新。単一EXE・Windows版情報・feed・同梱Default Shellは0.34.0、size **144125000**、SHA256 **5c5499037f08a86663b43ea923c3c2394578dac586d71e2da4fd1dea2a71db2a**。固定コピーの同一hashを各試験で照合し、配布EXEの混在、リボン、設定即時保存、検索、desktop、center、通知設定の **7種類**を終了コード0で確認。混在試験はNode/.NET/native、無効化・再有効化・故障と再試行、専用コマンド・自己状態、通知保持・safe起動を含む。配布EXEの設定画面画像も確認した。
- 版変更によるinstalled workspace不一致は`dev.bat install --frozen-lockfile`で復旧し、lockfile/toolchain/7日待機/依存検査を変更していない。兄弟Appletのソース・配布物、全体ZIP、公開Release、実利用先deployは対象外。物理的OSロック、別アプリ排他全画面、複数実モニターの全組合せ、支援技術、新しい一般Applet複数Windowは今回の検証対象外。
- [検証証跡](.artifacts/commit-validation-shell-region-20261014/validation.json)にtree、実行環境、各コマンド・終了コード・完全ログhash、発行物、最終文書差分とcommit後treeを保存する。ログは`.artifacts/shell-region-20261014/`。[整理記録](.artifacts/commit-validation-shell-region-20261014/cleanup.json): 同じ試験/方式の直近3成功を残し、確認済み旧成功 **39件**を整理。失敗・不明・以前の終了中断・VERIFICATION参照・固定出力・fixtureを保持し、削除前に絶対パス、プロセス終了、配下再解析ポイントなしを確認した。

## 2026-10-14: Shellの領域別割り当て設計をmainへ統合

- 設計branch codex/shell-region-design（a398213）をmain a0d5363へ統合。VERIFICATION先頭の競合は双方の検証記録を保持して解消した。製品ソース・設定・依存・配布物は変更しない。
- main 0.33.0との意味上の差分を文書だけで調整。対象を現行8領域に揃え、通知センターと独立desktop、共通NotificationSurfaceHost、設定ShellのschemaVersion:2互換検査を反映した。共有ドラフトを前提とした計画をSettingsStore/SettingsInputSessionの即時保存・フィールド単位競合・UI内の不正入力へ改めた。保存応答とflushの待ち合わせ、desktopの独立した可視状態も確認した。
- 文書リンク・参照ファイル・見出し/コードフェンス・JSON例・差分を検査し、マージ前mainからの変更が文書3件だけであることを確認した。証跡は .artifacts/merge-shell-region-design-20261014/。設計時の .artifacts/commit-validation-shell-region-design-20261013/ もmain側へhash一致で退避した。
- 文書のみのため製品回帰・GUI・版更新・publishは対象外。Shellの領域別割り当て自体は未実装。マージ検証後に設計worktreeを削除し、pushは行わない。

## 2026-10-13: Shellの領域別割り当て設計（未実装）

- main a14dd90（0.30.0）からcodex/shell-region-designを独立worktreeへ作成し、[領域ごとのShell割り当てと実装計画](docs/shell-region-assignment.md)を追加。開発ガイドに未実装計画として入口を追加した。既存作業のindex・ソース・配布物は変更していない。
- 6領域の明示指定、無効化時のDefault Shell復旧、旧単一設定の移行、保存指定と実Viewの区別、故障記録・再試行、編集中の切替、専用コマンドの任意条件と自己状態API、本体描画移行の境界を整理。5段階の実装順序と影響先・受入条件を記載した。
- 設計レビューで、旧設定を固定実装した外部Shellの更新範囲、Registryとコマンドsnapshotの相互再帰回避、表示中パレットの復旧先、モーダル中の操作拒否、最終実行経路の検査と受付済み処理の限界を補足した。現行コード・公開契約との照合を行い、コミットを妨げる未解決の指摘なし。
- 文書のローカルリンク、参照するソース/試験の存在、見出し・コードフェンス、JSON例2件、会話上の呼称混入、git diff --checkを確認した。既存VERIFICATIONの過去証跡は独立worktreeに複製されないため、そのリンクの実在確認は今回の追記範囲に限定した。初回検査の範囲過大を修正して再確認した。
- 検証スクリプト・実行ログ・対象tree/commit・文書hashは .artifacts/commit-validation-shell-region-design-20261013/ に保存。文書のみのため製品回帰・GUI・ビルド・版更新・publishは実施しない。製品機能の実装済み・動作検証済みとは扱わない。マージ・pushは行わない。

## 2026-10-13: 独立デスクトップ通知と表示Host共用（0.31.1）

- 予約済みdesktop表示先を有効にし、通知種類でbanner/desktopの複数選択を可能にした。NotificationServiceのtargetItems/setDelivery、NotificationSurfaceController/Host/preloadを共用し、バナー専用の旧ファイル/API実装を撤去。Default Shellの同じカード・操作・期限・IDを使い、desktop用の独立Windowだけを追加した。新しい保存ファイル・設定キー・SDK APIを増やしていないためパッチ0.31.1。
- desktop対象がある間だけWindowとhookを作らない表示可否query workerを生成し、最後の対象を外す/終了すると両方を破棄。新着はshowInactiveでfocusを保ち、本体を隠しても表示する。トレイの画面/作業領域/側を優先し、取得不能時は本体の画面へ配置。幅440・高さ600またはworkArea60%を上限とし、DIPと画面変更イベントを使う。
- WindowsのSHQueryUserNotificationStateとlock/suspend、本体の全画面状態で表示を抑制。抑制中もactiveの期限は進み、期限切れを解除後に再表示しない。query失敗ではログ/センター閲覧と明示再試行を使い、worker再起動ループを避ける。InputHostの通常入力/ジェスチャーモードを変更せず専用queryモードを追加した。
- notification.desktopはminimumHostVersion:0.31.1以上の追加Shellで差し替えられる。同じ公開appdockNotificationsにsurfaceとopenCenterを追加し、接続元/mainFrame/URL/session/表示先チャネルを束縛する。個別領域だけDefault Shellへ戻り、idleでWindowを作り直しても同provider/版の故障記憶を保持する。既存Appletの予約済みdesktop種類宣言は読込を維持し、新領域の最低版制約と分離した。
- 発行前レビューはIPC/操作ロック、表示先ごとの配送状態、focusと作業領域、抑制/期限、worker/Window解放、Shell故障記憶と宣言互換を対象に実施。idle時の故障記憶消失、旧版の予約済みdesktop宣言を不必要に拒否する条件を修正し回帰を追加。専用adapter registryを増やさず共通射影/Hostへまとめた構成を設計書へ反映した。
- 最終製品/試験tree **d6e725aee9e50863e6a8d6061e601f4196bf0536**を固定し、型検査と標準回帰 **350/350、fail/skip 0** 成功。通知配送・座標・宣言互換の追加回帰を含む。.NET SDK/Runtime/ExtensionHost/InputHostと通知fixtureのRelease build成功。Node24.21.0/pnpm12.10.1/Electron44.6.0/.NET SDK10.0.401/Windows26300 x64、全コマンド/引数/cwd/終了コード/完全ログ/入力・fixture・兄弟repo・EXE hashは .artifacts/commit-validation-notification-desktop-0.31.1-20261013/。
- ソースGUI: desktop **7群**（notification-desktop-1791887881033）、汎用banner **8群**（notification-banner-1791887884800）、通知センター **9群**（notification-center-1791887903230）、通知設定 **8群**（notification-settings-1791887906672）、設定通知 **10群**、設定Shell **11群**（settings-shell-1791887920475）、navigation **17群**成功。実Node/.NET、両テーマ、現在の150%画面の作業領域、共有dismiss/停止、抑制中の期限切れ、追加Shell故障復旧/idle再生成、query worker終了まで確認した。
- InputHost通常モードの実Node WebBrowserTools/.NET WindowsTools回帰 **4群**（native-input-ui-1791887896902）成功。許可・取消・対象変更・連続ジェスチャー入力を確認。途中の.NETケースは送信受付直後に実入力イベントを検査して失敗したため、隣のNodeケースと同じ実ターゲットイベント待ちへ修正。入力再送や判定緩和は行わず、修正後の最終回帰で成功。初回desktop GUIの通知件数期待も実6件に合わせて修正し、失敗profile/ログを保持した。
- 通常publishとレビュー修正後の再発行成功。単一EXE **0.31.1 / 144,125,522 bytes / SHA256 72e39ad299b84cf087dfd3a67b9564371e270dbbeee04d70eb188134bfa1b741**。update.jsonの版/size/hashと同梱Default Shell0.31.1が一致。最終固定EXEでdesktop **5群**（notification-desktop-1791888056872）、センター **7群**（notification-center-1791888070998）、設定通知 **9群**（settings-notice-1791888093560）成功。物理的なOSロック/復帰、別アプリの排他D3D全画面、複数実モニター/タスクバー方向の全組合せ、スクリーンリーダーは未確認。lock/unlockはイベントfixture、全画面は実本体Windowで検証した。
- 版変更後の固定lockfile installはキャッシュ成功。lockfile/toolchain/待機方針と兄弟Applet配布物を変更していない。開発ドライブの既存祖先マウント対応で発行成功し、新たな影響なし。通常ユーザーの実行許可を使用し、Windows管理者への昇格なし。
- 検証済み成功profileを方式別の直近3件へ整理し、VERIFICATION/最終再利用証跡・固定出力・fixture・失敗/状態不明を保持。今回の整理一覧はcleanup.json/cleanup-final.json、編集補助は削除。プロセス終了とstage/作業ファイル/tree一致を確認し、検証後の文書のみの補記を封印する。
- 設計書を段階4実装済み/次の段階5 Windows adapter・旧show統合へ更新。本体の通常本文はprimaryの1 Windowのまま、通知専用Windowをその例外として文書とrepo指示へ反映した。続けて即時保存まで各段階を実装・設計反映・コミットする。push/Release/実利用先deployは今回の範囲外。

## 2026-10-13: 通知センターと更新完了バナー（0.31.0）

- page.notificationsを公開Shell本文へ追加し、Default Shellにアクティブ通知・終了履歴、文字/レベル/発行元/状態/未読の絞込み、明示既読、50件の履歴ページ、終了履歴削除を実装。通知センターのみの表示先を空配列として指定できる。バナーとセンターは同じ通知ID・期限・操作ロックを使い、終了履歴に操作callbackを復元しない。
- 個別操作は現在の対象IDを検査し、別通知の更新で不要な拒否を起こさない。ページ/一括操作はquery hashを照合し、一括削除は確認前にIDを固定して新着を除外する。永続履歴の既読/削除は原子的保存の失敗でメモリー内変更も戻す。未知schemaは上書きせず、session履歴の個別操作を継続する。
- 成功したupdate-result.jsonをhost/updates/appliedのinfoバナーへ移行。既定6秒、手動時間指定、種類別オン/オフ、更新画面への操作を使える。本体通知なのでApplet共通スイッチで抑制しない。PC専用notifications/update-receipt.jsonの結果bytes hashで通常再起動の重複を防ぎ、オフ時の結果も受付済みにする。更新失敗・進捗は既存処理を保持。新しい保存ファイルと通知設定種類のため0.31.0へ更新した。
- 発行前レビューでShell接続元/mainFrame/session、所有者・実行世代、履歴の安全な射影、query/操作競合、更新結果の受付済み保存を確認。個別既読の過剰なrevision検査、操作後のモデル取得前に次の操作を許すUI、旧リボン件数固定の試験を修正。最終の製品・試験tree **c76605b09cf14237a2bb711f3634821e9cf96775**を固定し、型検査と標準回帰 **346/346、fail/skip 0** 成功。
- ソースGUI: 通知センター **9群**（notification-center-1791885493079、実Node/.NET、再起動、追加Shell故障復旧）、通知設定 **8群**（notification-settings-1791885496431）、設定通知 **10群**（settings-notice-1791885502979）、設定Shell **11群**（settings-shell-1791885509674）、navigation **17群**成功。個別既読・削除・検索保持、確認中の新着保持、テーマとセンターのみの操作を検証した。dialogの取消/許可はソース試験の応答fixtureを使用。
- 開発ドライブのマウント変更で、実更新helperのapply/recoverが祖先30.PROJECTをリンクと判定し、ready前に失敗した。再取得では直らないため、登録済み祖先ボリューム認識をhelper全経路へ統一。payload走査にはroot境界を渡し、対象自身・通常junction・payload内のリンク/マウントを引き続き拒否する。実helperのマウント下適用/復旧/展開とjunction拒否を追加し、更新関連 **28/28**、標準回帰も再実行して成功。packだけの暫定対応を残さず共通検査へ整理した。
- 通常publishと再発行成功。本体単一EXE **0.31.0 / 144,128,218 bytes / SHA256 263165b0337c8dfcbea2c79b4025d2e354d96fe7ffa005c2bdd46ad48971dac1**。update.jsonの版/size/hashとDefault Shell0.31.0が一致。最終固定EXEでセンター **7群**（notification-center-1791885542063）、既存設定通知 **9群**（settings-notice-1791885565024）成功。
- 実単一EXEの隔離コピーを同版更新し、実helperの適用・終了・再起動、新基盤バナー/受付済み記録、ステータスバー重複なし、実カードボタンから通常更新画面へ移動する **3群**成功（update-result-banner-1791885418971）。更新jobをseedしたGUIとは別の検証。初回の描画待ちと再起動後CDPの引継ぎを前提にした試験を修正し、再起動後は保持されるmain inspectorから実Shellの公開API/DOMを検査した。製品のデバッグ権限を増やしていない。
- 全コマンド/引数/cwd/終了コード/完全ログとhash、入力/native fixture/toolchain、Git treeと固定EXEの証跡は .artifacts/commit-validation-notification-center-0.31.0-20261013/。Node24.21.0/pnpm12.10.1/Electron44.6.0/.NET SDK10.0.401/Windows26300 x64。固定lockfile再installはキャッシュで成功し、依存/lockfile/待機方針は変更なし。通常execの0x80070057は既存環境制約として通常ユーザー実行へ切り替え、Windows管理者へ昇格していない。
- 成功した同方式の直近3件を保持し、古い通知設定sourceと設定Shell sourceの成功profile各1件をパス・再解析ポイント・使用中プロセス確認後に整理。失敗/状態不明、固定EXE、fixture、再利用証跡を保護。今回の編集補助を削除し、検証後の文書差分と最終treeを封印する。物理DPI/スクリーンリーダー、固定EXEの実ユーザーdialog応答は未確認。
- 設計書を段階3実装済み/段階4デスクトップ通知へ更新。引き続き段階4・5・即時保存を、それぞれ実装→設計書更新→コミットする依頼を受けている。即時保存完了まで未保存警告の接続を維持し、移行完了時に旧管理を除去する。push/Release/実利用先deployは今回の範囲に含めない。

## 2026-10-13: 通知種類・通知設定とApplet API（0.30.0）

- 「設定 → 通知」をpage.settings/Default Shellへ追加。本体とmanifestの静的notificationTypesを一覧化し、停止中のAppletも起動せず表示する。種類別enabled/targets/durationSeconds、既定継承/空欄manual、種類別復元、未導入種類の上書き保持、横断検索を既存の編集・部分JSON・全体保存へ接続した。設定項目追加のため本体を0.29.0→0.30.0へマイナー更新。
- notificationCatalog/resolveNotificationPolicyは共通shared関数、TypedNotificationsはepisodeと所有者/種類/起動世代の対応と保存後の方針適用を所有する。必須の未保存警告をhost/settings/unsaved-changesへ接続し、共通Appletスイッチで解除できない。オフ保存はwithdrawn、再オンは再送なし、通常更新/表示先変更は既存期限を維持、秒数変更は新規episode/明示restartから適用する。
- Node/.NETへpublish/policy/end/変更購読を追加。capabilityとminimumHostVersion:0.30.0、宣言済み種類、自所有通知/登録コマンド/現世代、過大入力、所有者50件、バースト20件/毎秒10件を検査する。SDKの共有AssemblyVersion 0.10.0と旧APIを維持。履歴schemaVersion:1へ任意の種類識別情報/終了理由だけを追加し、実行関数や画面用詳細を保存しない。
- 発行前レビューは上記API・保存領域・所有者/停止・期限・履歴・設定制約・Shellと旧経路を対象に実施。期限タイマー遅延時に終了episodeの方針を再利用し得る境界を修正し、回帰を追加した。設計の実装範囲は維持し、独立Registry/Resolverクラスではなく既存discoveryと共通関数で実装した構成を設計書へ反映した。発行を妨げる指摘なし。
- 最終stageのtree e9dfbe0a3e58c3925579f55cbfd544ec88277421を固定して、型検査と標準回帰 **334/334、fail/skip 0** 成功。新しい方針回帰12件を含む。.NET専用fixtureとSDK/Runtime/native hostのRelease buildも成功。全コマンド/引数/cwd/終了コード、完全ログ、tree、入力/fixture/成果物SHA256、Node24.21.0/pnpm12.10.1/Electron44.6.0/.NET SDK10.0.401/Windows26300 x64の証跡は .artifacts/commit-validation-notifications-0.30.0-20261013/ に保存した。
- ソースGUI: 新通知設定 **8群**（notification-settings-1791880569532）、既存設定通知 **10群**（settings-notice-1791880531012）、設定Shell **11群**（settings-shell-1791880537920）、navigation **17群**、既存Applet API **5群**成功。新通知設定は実Node/.NETの発行・操作、保存前後の抑制、manual/期限切れ、必須制約、未対応先、停止世代の失効、検索/復元/テーマ、再起動と安全な履歴を確認した。試験専用Appletを製品へ同梱していない。
- 初回の新GUI試験は起動中のホーム描画と設定ページ選択が競合し、初期ホームの表示待ちを加えて成功。既存Applet API試験は移行前のホストDOM、全体JSON/空白保持、カテゴリ厳密名と旧破棄導線を前提として停止した。Settings Shell helper、現在の部分JSONと未保存マーカー、未保存の実設定値保持/元の値への復元へ試験を更新し、最終ソース/固定EXEとも成功。専用.NET fixtureの初回buildは親Directory.Build.props外のTargetFramework省略で失敗し、net10.0等を明示して解消。失敗ログ/profileを保持した。
- 通常publish成功。本体単一EXE **0.30.0 / 144,109,931 bytes / SHA256 83398a9dd09f4f98cd802e4e12f675f6d3e549070622794f80f9426aa6b46ba4**。update.jsonの版/size/hashと同梱Default Shell0.30.0が一致。固定コピーで通知設定 **8群**（notification-settings-1791880736284）、設定通知 **9群**（settings-notice-1791880762505）、既存Applet API **5群**成功。EXE/feed/helper/Shellのhashを証跡へ保存した。
- 旧notifications.showのWindows互換も固定単一EXEの合成通知 **4群**（notification-portable-1791881055602）成功。通知XML/配置別protocol、起動中と終了後のWindows Shell起動先、別配置で実行しないこと、停止済みAppletの操作失効を確認し、試験登録を復元した。物理的なトーストクリック・実メール受信を検証済みとは扱わない。
- 設計書を段階2実装済み/次回段階3通知センターへ更新し、README/SDK API/設定同期/開発入口へ現行契約を反映。バナーだけが新APIの利用可能先で、desktop/windowsは操作不能、旧通知は共通スイッチで制御する。既存製品Appletの種類別API移行、通知センター、独自デスクトップ、Windows adapter、即時保存、未変更Appletの再発行、Release/全体ZIP/deployは実施していない。物理DPI/スクリーンリーダーと固定EXEの実ユーザー破棄dialog応答は別途未確認。ソースでは既存dialog応答fixtureを実行した。
- 開発ドライブの祖先マウントは前段階のpack対応で発行成功し、今回は新たなマウント由来の影響なし。固定lockfileのinstall成功、依存/toolchain/待機方針/lockfileに変更なし。エージェントの通常exec環境の0x80070057は既存の環境制約として通常ユーザー実行へ切り替え、Windows管理者昇格はしていない。
- 試験プロセス残存0。成功した同方式の直近3回を保持し、古い設定通知source成功profile2件（settings-notice-1791872860886、settings-notice-1791873189504）だけを絶対パス・再解析ポイント・使用中プロセス・保護参照の確認後に整理。失敗/状態不明、固定EXE、ビルドfixture、再利用証跡を保持し、今回専用の編集補助ファイルを削除した。検証後は文書のみを補記し、その差分と最終treeを証跡へ保存してコミットする。pushは行わない。

## 2026-10-13: 通知種類設定の設計更新（未実装）

- 通知基盤設計に種類カタログ、種類別オン/オフ・複数表示先・秒数/空欄manual、必須conditionの制約、共有設定の上書きと既定継承、activeへの適用、旧API/共通スイッチの互換方針を追加した。通知設定→通知センター→独自デスクトップ/Windowsの順へ変更し、Node/.NETの最小種類指定APIを通知設定と同じ段階へ前倒しした。
- 現行0.29.0の通知サービス/履歴/設定Shell/設定同期/旧Applet通知のコードと文書を照合。Registry・PolicyResolver・種類別設定は未実装と明記し、開発入口と現行通知仕様からの参照を更新した。受入条件と即時保存への移行境界を設計書へ記載した。
- 文書差分、ローカルリンク、Markdownのコードブロック、将来設定例のJSON構文、段階番号を確認。証跡は `.artifacts/notification-preferences-design-20261013/`。今回の変更は文書のみで、製品のビルド/試験/版更新/publishは実施していない。コードや実利用設定は変更していない。

## 2026-10-13: 通知基盤のコミット前回帰と設計更新（0.29.0）

- [通知基盤の設計](docs/notification-foundation.md)を実装済みのService内部操作管理、現行bridge、targets受付制限、予約枠、既読未実装に合わせて更新。次回の通知センターについてShell本文領域/Controller、activeと履歴のID統合、検索/ページ取得、明示既読、終了履歴削除、バナーと操作ロックの共有、保存不能/再起動、実装順と受入条件を具体化した。独自デスクトップ、Windows/旧API・Applet公開、即時保存は後続として区別する。
- コミット対象をstageし、最終検証前後のtree・入力SHA256・stageと作業ファイルの一致を確認。本体標準 `dev.bat run test` **322/322**、skip/fail 0、型検査成功。標準回帰には更新pack/復旧と通知基盤を含む。証跡・完全ログ・実行コマンド/終了コード・ツール/OS・treeは `.artifacts/commit-validation-notification-0.29.0-20261013/`。
- 追加ソースGUI: ホーム **8群**（`shell-home-1791875597842`）、Appletページ/Gmail **7群**（`applet-pages-1791876055817`）成功。Gmailは公開済みAppletの隔離コピーとオフラインHTTPS fixtureを使用し、通知からの保存、メールView/検索/入力保持、背景動作、停止/再開/再起動を確認。兄弟repoのcommit/tree/statusと実際のコピー入力hashを保存し、実メールアカウントは使っていない。
- Gmail試験は移行前の本体設定DOM/全体JSONを前提として失敗。現行Settings Shell helper、カテゴリ部分JSONと描画反映待ちへ修正した。修正途中のJSONキー/描画順、プロフィール/リボンの見出し厳密一致の失敗をログとprofileに保持し、最終7群成功。製品コードの追加変更なし。試験修正後に標準回帰と型検査も再実行した。
- 発行時のソース/試験入力hashとログを照合し、製品内容・該当試験に変更のない通知fixture8群、設定通知10群、Shellページ10群、navigation17群、固定単一EXE9群の結果を再利用した。今回の設計書とGmail試験の変更を区別し、変更したGUIは新規実行。再利用元/範囲/照合根拠はreused-gui.json。固定EXEでの実ユーザー破棄dialog、物理DPI/IME・スクリーンリーダー等の未確認事項は前項のまま維持する。
- 最終publishのEXE/feed/helperのSHA256は前項と一致。製品の追加修正がないため版と発行物を維持。設計リンクと差分を検査し、発行を妨げるレビュー指摘なし。検証後は本記録だけを追加し、文書のみの差分と最終treeを証跡へ保存する。
- 試験プロセス残存0。今回追加した方式別成功profileは直近3件以内のため削除対象0。失敗profile、固定EXE、再利用証跡/fixtureを保持。不要な今回専用編集補助ファイルを削除した。push・公開・実利用先deployは実施しない。

## 2026-10-13: 通知基盤とDefault Shellバナー（0.29.0）

- info/warning/error、timed/manual/condition、操作IDと要求ID、通知単位の二重実行ガード、所有者内dedupeKey、表示先状態、履歴をNotificationServiceへ集約。PC専用 `notifications/history.json` を追加したため本体0.28.2→0.29.0のマイナー更新。通常更新で期限を延長せず、明示的なrestartTimerで再設定できる。persistent履歴は安全な要約のみ、callback/操作ID/draftを保存せず、再起動時のactiveはinterruptedにする。
- `notification.banner`、共通preload、NotificationBannerController/Host、Default Shellの通知entryを追加。通知だけ提供する追加Shellも同じ経路を使用する。複数カード、3件からの展開/スクロール、両テーマ、zoom、タイトルバーからの明示focus、Tab境界/Escape、旧Viewを保持したShell切替と故障復旧に対応。本文レイアウトを変えず、Webより上・モーダルより下に配置する。旧本体専用のSettingsNotice描画・View・preload・IPCを除去した。
- 未保存警告は削除可能なSettingsNotificationSourceで既存SettingsEditingSessionに接続。入力の反映待ちと最新編集revisionで全体保存/確認付き破棄を行い、失敗/キャンセルで維持する。設定/Appletページではバナーだけ隠す。将来の即時保存化ではこの発行元だけを外せる。今回の対象は段階1。通知センターUI、独自デスクトップ通知、Windows通知の基盤統合、Applet/MCP新通知API、即時保存化は後続。既存Windows通知の経路・設定は維持。
- 発行前レビューは `.artifacts/notification-0.29.0-20261013/review.md`。解消後の空モデル送信、終了時の操作関数回収、activeと終了履歴の保持上限、終了中の再発行停止、直前編集ページの記録、通知/検索ボタンのCSS識別を修正した。修正差分を再確認し、発行を妨げる指摘なし。
- 成功: 型検査・本体/Default Shell/.NETのビルド。関連単体 **30/30**、追加された更新パッカー/既存更新・復旧 **27/27**、合計 **57/57**。ソースGUIは汎用通知fixture8群（`notification-banner-1791873177602`）、最終設定通知10群（`settings-notice-1791873609858`）、Shellページ/モーダル10群（`shell-page-1791873195325`）、navigation17群（`navigation-1791873430467`）。汎用通知fixtureは実Electronで表示先を差し替える試験であり、実Applet workerの停止検証は最終設定通知試験と固定EXE試験で行った。
- 実装中の失敗: 解消後のモデルが残る不具合を修正。汎用GUIの期限検査はElectron evaluateの引数指定を修正し、fixtureのuserData/初期zoomも隔離した。navigationはfixture未生成で開始前に失敗したため生成後再実行。通知ボタンに検索専用クラスを使っていた識別衝突を修正してnavigation17群成功。実workerの意図的な異常終了ではRPC切断を期待結果として検査した。失敗profileとログは保持し、失敗を成功に読み替えていない。
- 開発ドライブ移行後の依存: Windows用 `@typescript/typescript-win32-x64` が欠落して型検査不可。通常frozen installは変更なし判定。 `dev.bat install --frozen-lockfile --force` で359件を既存キャッシュから再配置（download0）し復旧。マウント変更との直接因果は未確認。lockfile/toolchain/待機例外は変更なし。版更新後のverifyDepsBeforeRun要求は通常frozen installで同期した。MXC起動失敗は設計調査時からあり、必要なコマンドを通常ユーザー環境で実行した。
- 開発ドライブ移行に直接関係する発行失敗: EXE作成後、更新パッカーが祖先の `A:\30.PROJECT` のボリュームマウントを拒否。pack処理だけWindows登録済み祖先マウントを認識するよう修正。入力/出力自身のリンク、通常の祖先ジャンクション、配布物内のリンクは拒否し、apply/recover/extractの従来検査は維持した。現在のマウント配下で本体/Appletのpack成功とリンク拒否を実helperで検証。新試験初回はCP932 stderrのUTF-8解釈による文言不一致で失敗し、Shift-JISのデコードへ修正して27/27成功。更新helper変更を再レビューし、同じ0.29.0を再発行した。
- 最終通常publish終了コード0。EXE **144105998 bytes / SHA256 `7a491a20bd17f3d98506ca3162198699ce70cd0372f30b5e93a83f85667392a6`**。feed SHA256 `40ef769761da3a3c5e1e6f5dfa0ce8f3d76a0383da7096d4bd5c74c484d0f39e`。package/feed/隔離起動版0.29.0、feedのsize/hash、固定コピーと試験コピーが一致。同梱helperのSHA256は `c34ff165ad2b05c2332ef6bb4b673b08db6a4e99a72507fd0d21091aeb73d3b7` で発行元と一致。発行ログ、固定EXE、hashは `.artifacts/notification-0.29.0-20261013/`。
- 固定単一EXEの設定通知 **9群**成功（`settings-notice-1791874357621`）。保存、入力/外部revisionエラー保持、Web上の操作、テーマ/サイズ、実際の通知専用Shell Applet worker異常終了→同一通知IDでDefault Shell復帰→保存、再起動後の保存状態を確認した。破棄dialogのキャンセル/確定はソースのdialog応答fixtureで確認し、固定EXEでの実ユーザー応答は今回未実施。
- 画像を確認し、通知文と保存/破棄ボタン、縦スタックと領域内スクロールを確認。試験プロセスの残存なし。今回専用の不要な編集補助ファイル8件を削除。成功profileは方式別に直近3件以内なので削除対象なし。失敗、固定EXE、検証証跡とfixtureは保持した。
- 未実施: 物理DPI/IME・スクリーンリーダー実機、実利用設定、通知センター等の後続UI、無関係な全回帰/兄弟Applet、GitHub公開/自己更新先での検証。本体のみpublishし、未変更Applet・全体ZIPは発行していない。commit・push・公開・実利用先deployは行っていない。


## 2026-10-12: LightテーマのShellページ切替時の背景（0.28.2）

- スロット自体は透明で、背後のHTMLルートはLightの`rgb(250,251,252)`だった。一方、BrowserWindowの背景は`#101116`固定、ページViewの背景は未指定、Default ShellはDarkのCSSから始まり、特に設定はready通知後のeffectでテーマを適用していた。調査時の18切替（`shell-page-theme-1791755781927`）では、利用者が見た瞬間的な黒フレーム自体は再現できていない。背景不一致と適用順序を原因候補として是正した。
- Windowの生成・設定変更・OSテーマ通知と、ページViewの生成/ready待ちを含む更新で背景色をテーマに合わせる。Default Shellはmedia queryで初期テーマを設定し、受付モデルのdarkを同期的に適用してからreadyを通知する。前回の全域レイアウト、共有編集、公開契約、透明オーバーレイを維持。保存形式・設定項目・保存ファイルに変更なしとして本体0.28.1→0.28.2のパッチ更新。
- 発行前レビューでWindowの背景更新を一般のchanged通知からテーマ関連の経路へ限定した。修正後の型検査・ビルド成功。ページController/Shell境界の単体14/14、設定ShellのソースGUI11群が成功（`settings-shell-1791756058234`）。テーマGUIはGPU有効/無効で各18切替、合計36切替を確認し、ネイティブWindow/Viewの色が一致、取得できた可視フレームに逆テーマ色なし（`shell-page-theme-1791756084359`、`shell-page-theme-1791756165995`）。フレーム購読が取得しない合成前の瞬間や実利用環境のちらつき解消を断定する検証ではない。
- 計測試験の初回はView基底prototypeを観測してWebContentsViewの背景を取得できず失敗。試験を修正して成功し、失敗結果`shell-page-theme-1791755991155`を保持。配布EXEの初回home-light画像はmainの最新モデルだけを待ち、Shellへの通知/描画反映前に撮影していた。試験にdata-themeとcomputed背景色の確認を加え、同じEXEで再実行し、Light画像を確認した。製品の追加修正なし。レビュー・試験ログ・入力hashは`.artifacts/shell-theme-0.28.2/`。
- 通常publish終了コード0。package/feed/隔離起動版0.28.2、EXE **144092668 bytes / SHA256 `acaf204d7f6676b6610eedcd044a41814a5935c63ff218e78b6292bc79a8ee64`**。feed SHA256 `97e76dce2544b32b896523f389161ad05c1a93455ae4c3f0a56129b2d6d7eddb`。size/hashと固定コピー・実行コピーが一致。固定EXEのホーム8群（`shell-home-1791756449227`）、ログ10群（`shell-page-1791756356779`）、設定10群（`settings-shell-1791756403891`）が成功。テーマ表示、編集/保存、部分差し替え、故障/ready timeout/safe-shellを確認した。
- 制限環境のfrozen installはstack overflow、publishは.NET段階終了1。同一コマンドの通常ユーザー環境で再実行し成功。固定依存359件再利用/download0、lockfile/toolchain・待機方針を変更していない。本体のみ発行し、未変更Applet・全体ZIPを再発行していない。
- 終了・成功・絶対パス境界・再解析ポイント・使用中プロセスを確認後、今回の古い成功profile1件を整理した（`cleanup-result.json`）。テーマ試験の直近3回・調査baseline・失敗・固定EXE/参照資料を保持。既存の古いprofileで参照関係や実行方式が未確定なものは保持した。関連テスト残存プロセス0。未実施: 実モニターのDPI/物理IME・実利用設定・無関係な全回帰/兄弟Applet/Release検証。commit・push・公開・実利用先deployは行っていない。

## 2026-10-12: Shellページを本文領域全体へ配置（0.28.1）

- ホーム・全体ログ・設定のホスト枠から最大幅1170px・中央寄せ・外側余白を解除。ShellPageSlotの固定36px控除/最低140pxを除き、flexで割り当てられた矩形を祖先境界でクリップして報告する。祖先/SlotのResizeObserverとscroll/resizeを集約し、同じ寸法の通知を抑える。Applet詳細は見出し・タブを残し、設定/ログ本文の残り領域だけを使用する。
- Default Shellのホームは24px（幅600px以下16px）の内部余白と可変列カード、ログは残り高さを使う表・固定列見出し・一覧内スクロール、設定は左右領域の全高表示に変更。高さ340px以下ではログ/設定をページ内スクロールへ切り替える。設定モデル・操作・共有draft・保存形式・ファイル構成を変えない表示修正として0.28.0→0.28.1のパッチ更新。README・開発入口・Shell仕様/レイアウト設計も更新した。
- 発行前に製品差分・関連CSSの適用先・Viewの寿命/座標/zoom・共有編集・公開Shellとの共通経路をレビュー。実装中に低高さ用CSSの宣言順を整え、追加の製品修正を要する指摘なし。試験修正も再確認した。レビュー本文は `.artifacts/shell-layout-0.28.1/review.md`。
- 成功: 型チェック、ビルド、ページController/Shell境界の関連単体 **14/14**。ソースGUI **7本**（ホーム8群・ログ10群・設定11群・検索7群・設定スクロール・navigation17群・未保存通知9群）。通常/狭幅/低い高さ・1500/900/700幅・125% zoom・ライト/ダーク・通知出現/消失・長いログの最終行と列見出し・Slotと利用可能領域/実View boundsの一致・詳細内の設定/ログ・Web管理・検索項目移動・JSON・draft・Shell部分差し替え/故障復旧を確認した。
- 検索GUIの初回/2回目は、外部APIのページ選択後にShellの描画更新を待たず入力し、古いqueryが残って失敗。テーマ部品の出現と新queryの受付を待つよう試験だけ修正して成功した。未保存通知GUIの初回はホスト保存後の更新をShellが受け取る前に次の入力へ進み、通知生成待ちで失敗。公開onChangedで保存済み状態の受信/描画を確認するよう試験だけ修正し、ソース9群・固定EXE8群に成功。製品の競合検査や編集キューは変更していない。失敗ログは保持した。
- 通常publish終了コード0。単一EXE **144095607 bytes / SHA256 `b1ba9ca17cea3bf9c66cb53698513ad89ecca069f63859dc9fdb68f265c1e823`**。package/feed/起動版0.28.1、feedのsize/hashと固定コピーが一致。update.json SHA256は `cc9f21f2517577f6cf50c5463ca5569facfc64eee8f0f81284e8a2c6f391ae0f`。固定配布物・入力hash・発行/試験ログは `.artifacts/shell-layout-0.28.1/`。本体のみ発行し、未変更Applet・全体ZIPは再発行していない。
- 固定EXEのGUI **5本すべて成功**: ホーム8群（`shell-home-1791755066051`）、ログ10群（`shell-page-1791755106171`）、設定10群（`settings-shell-1791755140568`）、検索7群（`settings-search-1791755174887`）、未保存通知8群（`settings-notice-1791755206004`）。隔離実行コピーも上記hashに一致。固定EXEでは初期寸法とログの最大化、通知による再配置を確認し、細かいサイズ/zoom/強制renderer crashの組合せはソースGUIで確認した。
- 制限環境ではElectron起動失敗、版更新後のfrozen installのstack overflow、publishの.NET段階終了1を記録。同じコマンドを通常ユーザー環境で実行して成功した。Node24.21.0/pnpm12.10.1/Electron44.6.0を維持し、依存359件再利用/download0、lockfile/toolchain/待機方針を変更していない。
- 整理: 成功・終了済み、同種/同方式の直近3回より古い未参照profile3件を削除（`cleanup-result.json`）。絶対パス境界と再解析ポイント、結果JSON、既存検証資料からの参照を確認。CIMによる使用中プロセスの事前照会は権限拒否となったが、PowerShellの後続処理が継続して削除されたため、事前のプロセス確認は成立していない。直後に通常ユーザー権限で削除対象と今回の固定EXE試験の残存プロセス0を確認した（`remaining-processes.json`）。失敗/不明・参照済み資料・固定出力・直近成功分は保持した。
- 未実施: 物理IME・実モニターのDPI切替・実利用設定/外部サービス・無関係な全標準回帰/全兄弟Applet/全Release検証。commit・push・GitHub Release・実利用先deployは行っていない。

## 2026-10-12: Applet専用ジェスチャー互換処理の撤去（0.28.0）

- main `17cf128296e8ae11cc8868be202e7107a724f39a`、作業ツリーcleanから開始。旧WebBrowserTools設定を読む`migrateGestures`、固定のApplet ID/8コマンド、通知時に設定を上書きする`appletInputSettings`を削除。設定読込・初期割り当て・共通操作APIは、未保存の本体ジェスチャー設定に共通初期値を使う。起動・設定通知・Shell取得は各Appletの保存済み設定をそのまま渡す。宣言による初回割り当て、保存済み本体設定、明示的な空配列は維持する。
- 本体内のWatch専用`--smoke-clock`経路と試験スクリプトの専用引数も撤去。`src`/`dotnet`に兄弟Appletの固定ID・WebBrowserTools専用設定処理が残っていないことを確認した。実Appletを使う試験fixtureと利用者向け案内は本体の専用処理と区別する。旧設定の移行・旧Appletフックの停止契約を終了する破壊的変更として、本体だけ0.27.2から0.28.0へ更新。WebBrowserToolsは本体入力を使う0.3.2以降を案内する。
- 発行前レビューで、設定取得5経路・初回宣言・未導入/既存Applet・旧設定の不正値・本体設定保持を確認。旧移行試験を新しい契約へ更新し、実Nodeプロセスの起動/変更通知で入力関連キーが上書き・挿入されない回帰を追加。ジェスチャーGUI試験はSettings Shellと本体APIの参照先を分離した。共通smokeの古い確認も修正し、同梱Shellを外部Appletとして拒否しないことと、実Shellビューの設定表示・描画を確認する。修正後の追加レビューで未解決指摘なし。
- 最終製品tree `c84a6ee028ca8c017af20aa0691aff2e5e8d4090`で型検査、標準回帰 **310/310**、Shell host **14群**、Shell page **9群**、実入力連携 **4群**が成功。入力連携では現行Node WebBrowserToolsの11コマンドと.NET WindowsTools、許可/拒否、取消、対象保護、MCP境界を確認。最終単一EXEのジェスチャー設定GUI **8群**と共通smokeが成功し、編集・順序・競合・両テーマ3幅・保存/再読込/再起動・EXE隣の設定/アバター保存を確認した。ジェスチャーGUIは`APPDOCK_GESTURE_UI_ONLY=1`で実行し、物理ジェスチャー試験の成功とは扱わない。
- 制限環境のpnpmストア/NuGet/Electronアクセス失敗は、同じ固定依存・コマンドを通常環境で再実行して成功。入力試験は試験シェル内の`ELECTRON_RUN_AS_NODE`を解除した。Shell host最終回帰は故意rendererクラッシュ直後のホーム待機が一度失敗し、同一tree・同一試験の再実行で14群成功。失敗ログは保持し、製品の入力先保護・再入防止・検査機構は変更していない。最後の入力試験は取消fixtureの前面喪失を検出し、既存試験の開始前の再取得で成功した。
- 最終publish終了コード0。本体単一EXE **144099362 bytes / SHA256 `9227e0d54241345dfb8366d846d1202e4ad490c79b3ba22decfea99b55252658`**。feedは0.28.0・サイズ・payload hashが一致し、feed SHA256は`cb66461317eade463da37ebb5c14c6e0379414b4de8951c93f9c8f2f3f2e6809`。固定コピーと隔離実行コピーを照合した。全ログ・コマンド/終了コード/時刻/log hash、固定EXE/feed、環境・入力hash・兄弟repo commit/treeは`.artifacts/commit-validation-generic-gestures-0.28.0/`に保存。最終検証前後のtreeとstage/作業ファイルが一致し、検証後の変更は本VERIFICATIONのみとして最終tree/commitを別途記録する。
- 完了時整理は、成功・終了・パス境界・使用中プロセス・再解析ポイント・既存検証証跡の参照を確認し、同種/同方式の直近3回より古い非保護フォルダー3件だけを削除。結果は`cleanup-plan.json`/`cleanup-result.json`。失敗/不明・参照済み・固定出力・再利用証跡を保持した。物理ジェスチャー全InputTests、無関係な全GUI/兄弟Applet回帰、実ブラウザ/UAC/外部サービスは今回の変更対象外。兄弟Applet再発行・全体ZIP・push・GitHub Release・実利用先deployは行っていない。

## 2026-10-12: グローバルショートカットの前面表示・デスクトップへのキー送信（0.27.2）

- コミット前確認: 利用者から2件の実動作成功の報告あり。型検査、標準回帰 **309/309**、実ホットキー9群、共通入力4群（2Applet、取消/対象保護/MCP）、InputTests **17/17**、固定EXEの前面表示/デスクトップ入力4項目が成功。全ログ・環境・入力hash・再利用元treeと差分は `.artifacts/commit-validation-shortcut-fix-0.27.2/` に保存。製品コードと発行EXEのhashは利用者確認後も変更なし。
- 追加修正は試験のみ。hotkeys-ui-testが移行前の本体DOMで設定部品を探して失敗したため、既存settings-shell-helperで設定Shellを参照するよう修正して9群成功。native-input-ui-testの最初のキー受信待ちが一度失敗したため、失敗時の前面/受信イベント記録を追加し、同じ入力検証4群の成功を確認。InputTestsは初回通知を再送せず最大2秒待ち、前面プロセスを記録するようにした。診断でEmEditorへの前面切替を確認し、利用者の入力を止めた時間に17/17と固定EXE4項目が成功した。試験途中の失敗ログは保持する。入力先保護や製品側の待機は変更していない。
- 成功済みの型検査・309件・ホットキーは、以後の変更がそれらから参照されない実入力試験の診断だけであること、残りのソース/依存/fixture/発行物hashの一致を照合して再利用した。検証後の追記はVERIFICATIONのみとして記録。コミット対象に製品の追加変更がないため0.27.2の再発行・重ねた版更新は行わない。

- 原因: WM_HOTKEYを受け取る.NET補助プロセスからElectron本体へ前面化権限を引き渡していなかった。内部hotkeys.syncで本体PIDを渡し、受信時にそのPIDへAllowSetForegroundWindowを実行してから通知する。もう1件はInputSenderがGetShellWindow/GetDesktopWindowをキー送信でも拒否していたため、sendKeysだけデスクトップを許可した。
- 修正前の固定配布物0.27.1で両方を再現。`.artifacts/shortcut-foreground-1791744534741/` は背後からの前面化失敗、`shortcut-foreground-1791744576862/` はExplorer未起動と `data/logs/host.log` の `input.sendKeys result=failed code=INPUT_FAILED` を記録。旧EXEと失敗証跡を保持した。
- 発行前レビュー: 製品差分3ファイル、入力対象保護、再入防止、取消、ホットキー登録/解除、設定・保存・公開APIの互換性、テストと文書を確認。許可先は特定PIDのみで全プロセス指定を拒否。appCommandのデスクトップ除外、キー解放待ち中の前面変更拒否、150msの再入防止を維持。製品の追加修正を要する指摘なし。設定・保存形式・公開契約の変更がないためパッチ版0.27.2とした。試験fixtureは製品に同梱しない。
- 成功: `dev.bat run typecheck`、`dev.bat exec node --test tests/keybindings.test.cjs tests/shortcut-commands.test.cjs tests/node-invocation.test.cjs tests/appdock-api.test.cjs` **36/36**、InputTargetのRelease build警告/エラー0、`dotnet run --project tests/InputTests/InputTests.csproj -c Release -- .artifacts/dotnet-host/input/AppDock.InputHost.exe` **17/17**。
- `scripts/native-input-ui-test.cjs` 成功（`.artifacts/native-input-ui-1791744717588/result.json`）。WebBrowserToolsの全11操作、WindowsToolsの.NET入力、許可拒否/取消、MCPの生入力非公開・明示コマンド経由、前面変更拒否、押下中取消、連続ジェスチャー3回13msを確認。初回は入力開始前のfixtureフォーカス取得で失敗したため、準備段階だけ前面取得を再試行するよう修正。送信開始後の対象保護は緩和していない。
- 新しい `scripts/shortcut-foreground-ui-test.cjs` は独立ネイティブfixtureからCtrl+Shift+F23/F24を送信し、GetForegroundWindowの実HWNDで背後・最小化・非表示からの復帰を判定する。実WindowsToolsのpublishを使い、Progmanが最前面の状態からWin+Eで新しいExplorerが開いたこととAPI成功ログを確認。CDPから本体をfocusしない。
- ソース試験成功（`shortcut-foreground-1791744520217`）。発行EXEの初回は非表示復帰に失敗（`shortcut-foreground-1791744874829`）。試験用押下/解放に20ms、各状態切替後に150msの待ちを入れた。次回は実動作4項目を通過後、150ms再入防止終了前のログ照合で失敗（`shortcut-foreground-1791744950547`）したため、成功ログの到着を待つよう修正。前者の瞬時入力での失敗原因は確定していない。製品への追加待機はない。最終fixtureの完成EXE試験は **2回連続で4項目成功**（`shortcut-foreground-1791744988110/result.json`、`shortcut-foreground-1791745023414/result.json`）。
- `publish.bat` 終了コード0。単一EXE **144095763 bytes / SHA256 `ae47d1b2f2770e0dbfab2fcbd8951618b262c75474537a0b9cbb1fda5de5ffc5`**。package/feed/実行時は0.27.2、feedのsize/hashと隔離コピーのhash一致。固定配布物・feed・発行ログは `.artifacts/shortcut-fix-0.27.2/`。本体のみ発行し、未変更Appletと全体ZIPは再発行していない。
- 制限環境の.NET発行は終了1、Electron試験はCDP起動待ち失敗、版更新後のfrozen installはstack overflowで失敗。同じコマンドを通常ユーザー環境で再実行して成功。依存359件再利用/download 0、依存版・lockfile・検査機構は変更していない。最終試験後に今回の隔離profileの残存AppDock/InputTargetプロセス0を確認。
- 整理削除0件。新試験は成功分が各方式3回以下で、失敗・旧版比較・固定配布物を保持。既存native-inputの古い結果は起動方式を結果JSONだけでは区別できず、過去検証参照もあるため保持した。通常回帰全体・全兄弟Applet・Release/更新適用は今回の限定修正では再実行していない。物理キーボード、実利用設定、昇格アプリ、別Windows環境は未確認。commit・push・GitHub Release・実利用先deployは未実施。

## 2026-10-12: Appletインデックス・設定横断検索、段階3の完了（0.27.1）

- 設定左側に本体カテゴリ・Applet一覧と横断検索を追加。mainの静的カタログをNFKC・AND・安定順位で検索し、結果からページ全体のフォームを表示、安定IDで折りたたみ展開・スクロール・フォーカス・約2秒の強調を行う。検索値やスクロールはJSON範囲を変更せず、停止Appletの起動や操作実行を伴わない。検索語と最新移動要求は同一起動中のmainに保持する。
- Applet本文内の旧ローカル検索を両入口から撤去し、同じ本文・編集状態を維持。検索は本文枠の外の左インデックスに置く。詳細の設定タブは継続し、詳細内に二重の検索・編集管理を加えていない。保存・破棄の全編集対象、即時保存、保存先、許可、互換変換は維持する。
- 発行前レビューでは公開モデルのページ境界、現在値を検索へ含めないこと、宣言由来の別名・静的選択肢、連続移動と古い完了通知、対象削除、Shell復旧、本文共用を確認。停止/無効Appletアクションの利用不可表示、全本体項目の安定アンカー、複合コントロールの移動先と表示名共用を整備した。型名・操作・512文字上限・移動先は設計書とShell文書へ反映した。
- 最終型検査と標準回帰 **309/309** 成功。ソース隔離GUI8本（settings-search 7群、settings-shell 10群、settings-notice 9群、navigation 17群、preferences 7群、settings-scroll、applet-sidebar 6群、shell-home 7群）が全成功。全本体項目のアンカー、検索0件/消去/キーボード、全本文維持、両入口の共有、WebApplet追加/削除、部分JSON、不正入力/数値途中入力/画像/競合、公開契約だけのShell fixture、故障/ready timeout/safe-shellを確認。両テーマ・狭幅・ホームzoom、検索の700/900幅・reduced motionも確認した。
- 初回search GUIは試験用Webアカウント未作成のため既存の保存ガードで拒否された。fixtureでアカウントを作成するよう修正後に成功。最終回帰の初回navigationは、全本文30行（文字列24、型付き4、開始遅延、操作）を25行とする試験の期待値誤りで失敗した。修正後の最終ツリーで型検査・標準回帰・GUI全8本を再実行し成功。製品側のガードを緩和せず、失敗証跡を保持した。
- 検証前後のstage treeは `1678a7ac7b3a35c7238d8f27a26c82726d29f1e2` で一致。完全ログ・実行時刻・終了コード・入力/ログhashは `.artifacts/commit-validation-settings-stage3/validation.json` と `results.jsonl`。関連文書のローカルリンク156件成功。検証後の追記はこのVERIFICATIONのみ。段階1・2は `a1fe63d` にまとめ、段階3を別コミットとする。
- 保存項目・保存ファイル・既存操作の互換性を変えない検索UI追加としてパッチ版0.27.1へ更新。Node24.21.0/pnpm12.10.1/Electron44.6.0/.NET SDK10.0.401、Windows 11 x64 10.0.26300。版更新後のfrozen installは制限環境のstack overflow後、同一コマンドの通常環境実行で359件再利用・download0で成功。依存版・lockfile・toolchain・検査機構は変更していない。
- 通常publish終了コード0。`publish/AppDock.at365.exe` は **144102261 bytes / SHA256 `237fe479b4a952c98774f9f0b261ab9d6773fb32bc41472dc10eb49b221991fd`**。update.jsonのSHA256は `5cbe2ef9fdabc789f3cd2beb933d83a284020eadfcd01bbd7413dfc6c8a88370`。feedの版・size・hash、固定コピー `.artifacts/settings-stage3-0.27.1/` が一致。段階1・2の固定EXEも保持した。本体だけを発行し、未変更Applet再発行・全体ZIP作成なし。
- 固定EXEのsettings-search 7群（settings-search-1791743659346）、settings-shell 9群（settings-shell-1791743687387）、settings-notice 8群（settings-notice-1791743721313）が成功。全項目移動・両入口・全体保存・不正JSON・revision競合・再起動保存・提供元切替・ready timeout復旧を確認。固定版の寸法は初期Window、renderer強制crash/700・900幅の切替はソース試験と区別する。各profileは.artifacts配下。
- 終了・成功を確認した古い非保護profile12件（navigation 1、settings-notice 3、settings-shell 8）を、絶対パス境界・再解析ポイント・使用中プロセス検査後に整理した。各方式の直近3回・参照済み検証資料・失敗/不明・固定EXE・再利用fixtureは保持。削除名は `cleanup-deleted.json`、残存隔離プロセス0は `remaining-processes.json`。再現用最終実行スクリプトを証跡内に保存し、不要な今回の編集補助スクリプトを削除した。
- 未確認: 物理日本語IME変換、実モニターのDPI切替、実利用アカウント/外部サービス、UAC登録・実更新適用。IMEは合成compositionイベント、DPIに関する今回の表示確認は現在の環境とzoomによる確認。ネイティブ入力フック/全兄弟Applet/全Release回帰の一律再実行は対象外。push・GitHub Release・実利用先deployは行っていない。

## 2026-10-12: 設定Shell・部分JSON、段階1・2の完了（0.27.0）

- 設定全11カテゴリとApplet詳細の設定本文をDefault Shellへ移行。page.settingsの公開モデルには選択ページの値・定義・必要な補助情報・不透明な操作IDだけを渡す。mainの共有編集、既存保存先・即時保存・許可・互換変換を使用し、全体JSON画面と本体側の重複描画を撤去した。
- 発行前レビューで、ページ投影の範囲外値、入力順・View切替のflush、画像の寿命、停止中アクション、外部revision競合、部分JSONの未知キー保持を確認。補助Applet情報をページ別に縮小し、未保存Webアカウント参照の削除ガード、未完成数値バッファ、一般操作のエラー処理、sidebar幅・再起動時カテゴリの既存保存先利用を修正した。旧試験の全体JSON/本体DOM参照を新契約へ更新した。
- 最終型検査と標準回帰306/306が成功。ソース隔離GUIはsettings-shell（10群）、settings-notice（9群）、preferences（7群）、settings-scroll、navigation（17群）、applet-sidebar（6群）、shell-home（7群）、shell-page（9群）、shell-host（14群）、shell-overlay（7群）の10本が全成功。即時保存・数値途中入力・画像・dotted key・停止中Applet・両入口・JSON保持・公開API fixture・故障/ready timeout/safe-shellを確認した。設定の両テーマと700/900/1280幅、ホームzoomも確認した。
- 検証tree `f77651b2e8a9e35fb7e9581f102ae3ea06f6eeea` が最終回帰前後で一致し、作業ファイルとstageの一致を確認。完全ログ・時刻・終了コード・入力hashは `.artifacts/commit-validation-settings-stage2/`。最終検証後の変更はこのVERIFICATIONのみ。初回標準回帰の制限環境EPERMと固定依存確認のstack overflowは、同一コマンドの通常環境再実行で成功。依存版・lockfile・検査機構は変更していない。
- 全体JSONからページ単位JSONへの操作契約変更をマイナー更新と判定し、本体0.27.0へ更新。publish終了コード0、EXE 144095387 bytes、SHA256 `8ac98557b90f5c486dae961d192e54cf2b9b5440939ed9480ee58bac24c70bde`。feedの版・size・hashと固定コピーが一致。固定出力 `.artifacts/settings-stage2-0.27.0/`。未変更Applet・全体ZIPは発行していない。
- 固定EXEのsettings-shell 9群（settings-shell-1791742273491）、settings-notice 8群（settings-notice-1791742308279）、shell-home 7群（shell-home-1791742332895）が成功。各profileは.artifacts配下。固定settings-shellは初期Window寸法・ready timeout復旧・safe-shellを確認し、renderer強制crashと3幅切替はソース試験の結果と区別する。
- 未確認: 物理日本語IME変換、複数モニターの実DPI切替、実利用アカウント/外部サービス、UAC登録・実更新適用。IMEは合成compositionイベントによる契約確認。検索・Appletインデックス・項目強調は段階3。ネイティブ入力フック/全兄弟Applet/全Release回帰は今回の変更対象外として一律実行していない。push・GitHub Release・実利用先deployは行わない。

## 2026-10-12: 設定基盤・段階1（0.26.44）

- mainの共有編集セッション、旧画面アダプター、カタログ・部分JSON変換基盤を実装。ホームのApplet順序はmainの共有編集状態から投影する。部分JSON・検索UI・設定Shellはこの段階では未提供。
- 発行前に編集所有権・保存先/即時反映境界・操作順・JSON対象範囲・既存画面への影響をレビューした。外部更新直後の表示モード切替で古い編集revisionを使う問題、再読込時に全体エラーを消す退行、開始遅延の空欄をNaNとして送る問題を修正。JSON表示切替は最新状態を取得し、設定の書込みはrevision検証を維持した。GUIの再読込確認はmainの処理完了を待つよう更新した。
- 型検査・ビルド、settings-editing/home-page/applet-settings/settings-commandsの関連回帰21件が成功。範囲外拒否・未知キー/未導入ID保持・WebApplet ID保持・検索正規化・不正JSON・画像・保存失敗・競合・再送を含む。
- 隔離GUI成功: settings-notice 9群（`.artifacts/settings-notice-1791738172800/result.json`）、preferences 7群（`.artifacts/preferences-1791738208472/result.json`）、navigation 17群（`.artifacts/navigation-1791738415869/result.json`）。両テーマ・700/900/1280幅、画像・既存ショートカット・Applet詳細・Web管理・未保存通知・競合・再起動を確認。初回失敗は上記修正と処理完了待ちの再検証で解消した。
- 設定項目・保存ファイル・外部公開APIの互換性変更を含まない内部基盤整理としてパッチ版0.26.44へ更新。未変更Applet/全体ZIPは発行しない。コミットは段階2の完了後にまとめる。
- 制限環境のElectron起動失敗、版更新後のfrozen-lockfile確認のSTATUS_STACK_OVERFLOW、publishの.NET段階終了コード1は、同じコマンドを通常環境で切り分けた。依存更新・検証無効化は行っていない。
- この段階でShell経由の設定編集/復旧、部分JSON/検索の実GUI、物理IME/DPI切替は未確認。固定EXEのsettings-noticeは8群成功（`.artifacts/settings-notice-1791738679211/result.json`）、shell-homeは7群成功（`.artifacts/shell-home-1791738712170/result.json`）。publish終了コード0、144086107 bytes、SHA256 `420da5e5483bab8c249420b9ac7497046816ba987227b213bf899d46db60b62a`。feedと隔離コピーの一致を確認し、`.artifacts/settings-stage1-0.26.44/`へEXE/feedを固定保存した。

## 2026-10-12: 0.26.43 ホームShell移行のレビュー・コミット前回帰

- レビューで、ホームのコマンド実行中にカード・ログ・一覧・パレットへの移動まで拒否する退行を修正した。画面移動は既存の実行経路へ直接委譲し、実行中状態・結果を上書きしない。ピンの実行可否検査とWindow寿命の重複実行ガードは維持。単体試験と、実行中のカード移動→ホーム復帰→ログ移動→完了通知の実画面試験で確認した。
- Applet並べ替え/サイドバー試験の旧リボン参照と遷移待機を修正し、既存WebApplet管理行を期待値へ反映。Window試験の非表示起動は起動完了を待ち、可視のときだけホームを検査する。本体コマンド試験は公開の本体表示コマンドでWindowを開いてからホームの可視性を待つ。初回失敗・切り分けログは削除せず保存した。
- 最終の型検査、標準 `dev.bat test` **297/297**、変更したCJS 21ファイルの構文検査が成功。ソースGUI **15本すべて成功**: shell-home、shell-page、shell-host、shell-overlay、settings-notice、navigation、applet-pages、applet-order、keybindings、ui、preferences、window-state、ribbon-layout、applet-sidebar、host-commands。GUIは隔離profileで直列実行した。
- 検証treeは `8cf26efbbe23d5d4809a290265fa269e6073a95b`。前後のtree一致、stageと作業ファイルの一致、未追跡入力なしを確認。検証後の追記はこのVERIFICATIONだけとし、文書差分・最終tree・コミット後SHAを `.artifacts/commit-validation-home-shell-20261012/validation.json` に記録する。完全なログ、終了コード、時刻、ログSHA256は同フォルダーの `verified-*.log` と `runs.jsonl`。
- 実環境はWindows 11 x64 10.0.26300、Node 24.21.0、pnpm 12.10.1、Electron 44.6.0、.NET SDK 10.0.401。lockfile/toolchain、生成fixture、SDK/Runtime情報を同フォルダーへ保存。Gmail連携試験で利用した既存発行物8ファイルは3つの試験profileとのSHA256一致を確認し、兄弟repoのcommit/treeとともに `gmail-input.json` へ記録した。兄弟repoの変更・再発行は行っていない。
- `publish.bat` は終了コード0。同じ未公開変更の修正なので版は **0.26.43** を維持し、本体単一EXEとupdate.jsonだけを再発行した。最新EXEは **144091167 bytes / SHA256 `6bfc75e230c85af66488032ae50d0807deb662c67f73f5dbcaa99facb9bc53fa`**。update.jsonのSHA256は `57e547a755276c625c8449258d489253688a2d40d9e4888e506640d340f9f246`。feedの版・サイズ・payload SHA256と一致し、同フォルダーへEXEを固定した。下の初回実装記録の発行ハッシュは履歴として残す。

| 固定EXEの隔離試験 | 結果 | profile（.artifacts配下） |
| --- | --- | --- |
| shell-home-ui-test | 7群成功。修正した実行中の画面移動を含む | shell-home-1791735879876 |
| shell-page-ui-test | 9群成功 | shell-page-1791735920239 |
| settings-notice-ui-test | 8群成功。source専用ダイアログfixtureはsource試験で確認 | settings-notice-1791735954251 |
| host-commands-ui-test | 再起動、新PID、再入防止、設定保持、終了/deactivate待機、残存プロセスなし | host-commands-1791735978084 |

- 完了時整理では、成功済みかつ直近3回より古い非保護フォルダー4件（applet-order 2、ribbon-layout 1、shell-home 1）だけを削除。実パス・再解析ポイント・使用中プロセスを検査し、直近分、失敗/不明、固定出力、再利用証跡は保持した。削除名と確認結果は `cleanup-plan.json` / `cleanup-result.json`。一時切り分けスクリプトも削除済み。
- レビュー指摘と必要回帰の失敗は解消した。push・GitHub Release・実利用先deploy・全体ZIP作成は行っていない。

## 2026-10-12: 0.26.43 ホームをDefault Shellへ移行

- 開始時はmain `a34027f55d21d08d6b979a55adc4b7893f6b5053`、作業ツリーclean（既存の未push設計commitは保持）。`page.home`の限定モデル・操作ID・変更通知、HomePageSession、Window寿命のHomeCommandExecutionを追加。ホームの描画・専用CSSをDefault Shellへ移し、本体の重複描画を撤去した。ShellPageHostは内容を解釈せずViewとControllerの寿命を接続する。
- 統計・保存済みピンの順序/実行可否/結果・Appletカード・共有draftのApplet順・詳細/ログ/パレットへの遷移を維持。実行直前の再検査、古い/任意操作ID拒否、同時実行・ページを離れて戻った際の重複防止を確認した。共有editorから表示順だけを投影し、全HostSnapshot/全設定のShell公開や第二のdraftは作成していない。設定移行時の入力アダプター差し替えを設計書へ記載した。設定画面・検索・部分JSONは未実装のまま。
- 最終型検査と関連39/39単体回帰が成功（home-page/log-page/shell-boundaries/command-palette/ui-presentation/applet-order/applet-pages/core）。型検査・単体試験・publish・GUIログと発行情報は `.artifacts/home-migration/`。全標準回帰や無関係な機能のGUIを一律には実行していない。

| 試験 | 実行方式・結果 | 証跡（.artifacts配下） |
| --- | --- | --- |
| shell-home-ui-test | 最終source 7群成功。部分差し替え、状態通知、draft順、成功/失敗、ページ移動をまたぐ実行ガード/結果、実行中のrenderer故障、再試行/停止/復帰、ready期限、safe、テーマ、resize/zoom、Tab/Shift+Tab/Ctrl+P | shell-home-1791733591320 |
| shell-page-ui-test | source 9群成功。全体/詳細/Web管理、検索固定、変更/自己API/古い要求、故障、寸法/テーマ/フォーカス | shell-page-1791733191072 |
| shell-host-ui-test | source 14群成功。リボン境界、共有draft、通常Applet/API、切替/故障/ready期限/safe | shell-host-1791733405550 |
| shell-overlay-ui-test | source 7群成功。パレット、選択、ピン、ページ/通知の重なり、入力保持、故障、テーマ/寸法 | shell-overlay-1791733421254 |
| settings-notice-ui-test | source 9群成功。共有編集、save/discard、JSON、競合、Web上の通知、再起動 | settings-notice-1791733435248 |
| navigation-ui-test | source 17群成功。Appletタブ/設定/ショートカット、共有draft/JSON/競合、ログ、パレット、両テーマと各幅 | navigation-1791733439994 |
| applet-pages-ui-test | source 7群成功。ページの生存、表示先切替、Web/Gmail fixtureの入力/session、リボン、再起動 | applet-pages-1791733451384 |
| shell-home-ui-test | 固定0.26.43 EXE 7群成功 | shell-home-1791733804522 |
| shell-page-ui-test | 固定0.26.43 EXE 9群成功 | shell-page-1791733843820 |
| settings-notice-ui-test | 固定0.26.43 EXE 8群成功（native dialogの応答差し替え試験はsourceのみ） | settings-notice-1791733877228 |
| 追加寸法確認 | sourceの900×650 Window・zoom 1.25。home native bounds 765×489、CSS innerWidth 612/scrollWidth 600。native画像で右端の操作とスクロールを確認 | home-layout-1791733929341 |

- 最後の実行状態分離は、上記の既存GUI回帰成功後に追加し、関連単体39件・最終sourceホーム・固定EXEホーム/ログ/通知で再検証した。ホームだけを提供する外部fixtureは、出荷Shell成果物を通常Appletとして複製して公開bridgeのみで起動する。実サービス認証、物理IME、混在DPI、複数Windowは今回未確認。
- 初回GUI試験の通知ボタン名・60ms集約通知待ち・外部更新後のrevision競合期待を修正。既存GUIの本体ホームDOM参照とTabの移動先を独立Shell Viewへ更新した。sourceのPlaywright画像はzoomで切り取り差があったため、native capturePageと実寸法で追加確認した。失敗profileは診断用に保持。
- 制限環境ではElectron起動、設定置換（EPERM）、pnpm（STATUS_STACK_OVERFLOW）、.NETを含むpublishが失敗。同じコマンドを通常ユーザー権限で再実行して成功。版更新後の `dev.bat install --frozen-lockfile` は既存lockfile/依存版・7日待機・完全版例外を維持し、新規ダウンロード0件。Node 24.21.0 / pnpm 12.10.1 / Electron 44.6.0を使用。
- `publish.bat`終了コード0。本体portable EXE 144,096,049 bytes、SHA256 `f9fd4407e3c2e462ff7e9a707cace5ba71b50a5db8d3bb95626d77f4f8864c67`。update.jsonはversion 0.26.43、payloadのsize/hash一致、feed SHA256 `95aa2b3babe8bda9a3947115542c06ab006c2b308326c8a3199751e38ee587ca`。固定コピー `.artifacts/home-migration/AppDock.at365.exe` と各隔離コピーの同一hashを照合した。
- テスト整理では対象7種類の成功記録・既存検証参照・プロセスを照合。成功114件中103件が検証資料から参照され、保護分と方式別直近3回を除いた削除候補は0件（cleanup-plan.json）。失敗/不明状態・固定出力・他作業を保持。未変更Appletの再発行・全体ZIP作成/整理、commit、push、Release、実利用先deployは実施していない。

## 2026-10-12: 現行仕様への文書整理と設定拡張設計

- AppDock 0.26.42のコード（起点commit `f767640d6b1306ab8b632a6ea05fd3b44aaafea1`）と照合し、AGENTS・開発ガイド・機能別文書を現在の仕様に整理した。導入版ごとの追記と実装に合わない旧設計を削除し、旧ショートカット設計書の現行部分はkeybindingsへ統合した。最低対応版、現在も動く互換処理、期限付き依存例外は保持した。
- Shell領域・更新通知・トレイ・設定入口・Webアカウントの音素材とショートカット処理・共通APIの公開カタログを現コードへ合わせた。過去の検証記録とリリースノートは当時の証拠として保持し、現行手順と区別した。
- `docs/settings-foundation.md`へ未実装の設定拡張を記載。共有編集基盤→Default Shell移行と部分JSON→Appletインデックス・検索の段階、API境界、移動・スクロール・ハイライト、競合と不正JSON、完了条件をまとめた。
- 文書28件の構造、リポジトリ文書57件のローカルリンク294件、兄弟Appletからの参照71件、JSON例16件を検査。部分JSON例2件は構文検査対象外。MCP一覧14件はコードのcallers宣言と一致した。差分・stageと作業ファイル・検証前後のtreeを照合し、コマンドと終了コード、入力とログのhash、最終commit/treeを`.artifacts/commit-validation-docs-20261012/`へ記録する。
- 文書のみの変更。共通手順に従い、製品回帰・ビルド・版更新・publishは対象外。製品の実機動作を今回検証したものとは扱わない。push・Release・実利用deployは行わない。

## 2026-10-11: 0.26.42 コミット前回帰

- 最終stageのtree `cc53f21903eef730f0153e83b03dad6aac32e629`で型検査・標準回帰292/292が成功。source GUIはShellページ、navigation、settings-notice、overlay、Shell Host、Webアカウント復旧、Applet/Gmailページ、ホスト再起動/終了、基本UIの9種類、固定発行EXEのShellページGUIも成功。環境取得を含む13コマンドの終了0と検証前後tree一致を記録した。
- 基本UI試験に残っていた本体DOM内のログ参照を独立Shellへ修正し、最終treeで必要回帰を再実行した。初回失敗時にもhost.logへの記録は正常だった。制限環境では標準回帰のファイル置換・ローカル接続等がEPERM/EACCES、Electron起動が失敗したため、失敗ログを保持し、同じ検証を通常ユーザー権限で完了した。
- このコミット工程で製品ソース・版・依存・発行物の追加変更はない。0.26.42のEXEは144087729 bytes、SHA256 `bf8613beb88b2c4b7a944c00291fcc32302c1cc1d8b0b66126517a6b854bea6b`のまま。feed・EXE版・同梱Shell14ファイル・隔離コピーを照合。実サービス認証、物理IME/混在DPI、複数Windowは検証範囲外。
- 証跡は`.artifacts/commit-validation-shell-pages-20261011/verified.json`、unit.json、gui.json、inputs.json、artifact-and-docs.jsonと完全ログ。Node/pnpm/.NET/OS、試験入力148ファイル、Gmail参照commit/tree、GUI profile10件、文書リンク192件を記録。検証後の変更は本VERIFICATION追記のみとし、文書差分・最終tree・コミットSHAを同証跡へ保存する。
- テストprofile410件を列挙し、種類/方式別の最新3回、再利用証跡、失敗/状態不明を保持。古い成功1件を絶対パス・再解析ポイント・使用プロセス検査後に整理し、cleanup-deleted.jsonへ記録。隔離テストプロセスの残存0。push/Release/実利用deployは行わない。

## 2026-10-11: ページ表示基盤とDefault Shellへのログ移行（0.26.42）

- ShellPageHostが本文1枠の遅延生成・表示領域/zoom・IPC境界・ready/終了・重なり順・フォーカス・復旧を管理し、ShellPageController/LogPageSessionが内容と操作を管理する。全体ログ・Applet詳細・WebApplet管理のログをDefault Shellへ移し、本体のLogsPageとログ専用CSSを撤去した。page.logsだけを提供するShell Appletで差し替えられ、リボン/パレットの未提供領域はDefault Shellを使う。
- 既存のApplet/source・レベル・文字検索、直近500件、保存先を開く操作、ファイル保存形式を維持。検索条件は提供元切替/故障復旧で保持する。過去ファイル閲覧・日付検索・保持期間変更・複数Shell/Window・MCPログ照会は追加していない。契約の正本は[Shellのページ表示](docs/shell-pages.md)。
- 型検査・ビルド・関連33/33回帰が成功（log-page/logging/boundaries/core/presentation/palette/applet-pages）。source GUIはページ9群、navigation17群、settings-notice9群、overlay7群、Shell Host14群、Webアカウント復旧5群が成功。全体/詳細/Web管理、検索・source固定・自己設定/自己コマンド、古い操作/他所有者の拒否、renderer故障・10秒ready期限・再試行・意図的な停止/再有効化・safe起動、共有draft、両テーマ、実Windowサイズ変更、Tab出入りを確認。ページ/保存通知/パレットのnative View順も確認した。
- 初回の記録済みsource回帰後、リボンから本文へTabを送る候補へShell表示枠を追加。型検査/ビルドと専用source GUIを再実行し、同一route再要求で検索条件が残ることも確認した。最終sourceページはshell-page-1791728279594、navigation-1791728171027、settings-notice-1791728182666、shell-overlay-1791728187242、shell-host-1791728201170、web-account-recovery-1791728881468。発行EXEのページGUI9群もshell-page-1791728476325で成功した。
- 既存Web管理試験は本体DOMに残っていたリボン/ログ参照を独立Shellへ変更し、実ウィンドウを表示してwindowVisibleを待つよう修正。非表示時に寸法0のログViewを可視として待っていた試験失敗を解消した。専用ページ試験の初期件数固定を実際の開始ログも含む条件へ修正。診断結果と失敗profileは保持する。製品の全標準回帰・実サービス認証・物理IME/混在DPI・複数Windowは今回未実施。
- 版更新後のfrozen-lockfile確認は制限環境のpnpm STATUS_STACK_OVERFLOW後、同じ操作を通常権限で成功。依存版・lockfile・toolchainは不変。publishの.NET工程も制限環境の終了1を記録し、同じ発行手順を通常権限で成功させた。変更は本体0.26.42だけを通常発行し、Default Shellを単一EXEへ同梱。EXE 144087729 bytes / SHA256 `bf8613beb88b2c4b7a944c00291fcc32302c1cc1d8b0b66126517a6b854bea6b`。feed・EXEの版/サイズ/hash・隔離コピー・Shell同梱14ファイルを照合した。
- 証跡は`.artifacts/shell-page-validation-20261011/`のsource.json、portable.json、published.json、完全ログ、inputs.json。ローカル文書リンク176件成功、差分/追加成果物の会話名検査成功。テストprofile390件を列挙し、直近3回/方式・再利用証跡・失敗/状態不明を保護した結果、削除候補0件。CIM読取を通常権限で行い、残存する隔離テストプロセス0を確認した。未コミット、push/Release/実利用deploy/全体ZIP作成/未変更Applet再発行なし。


## 2026-10-11: 0.26.41 コミット前回帰

- コミット対象をstageしたtree `1c4c3ec2bc350fc9aabeca72de345a2a1bc498ae`で、型検査・標準回帰288/288と関連GUIを完了。sourceはShell Host、overlay、Applet/Gmailページ、設定通知、トレイ、ホスト再起動/終了、画面遷移、設定保持、Windowsホットキー、条件付きキー、MCP操作、ジェスチャー、基本UIの13種類すべて成功。固定単一EXEでもoverlay・トレイ・再起動/終了の3種類が成功し、計18コマンドの終了0と検証前後tree一致を記録した。
- 既存GUI試験のリボン/プロフィール参照を独立Default Shellへ移し、非同期画面遷移の完了待機と、現在のApplet管理コマンドを含むパレット検索結果の検査を整備。Watchの旧コマンドID固定値を現行manifest参照へ変更した。実入力試験は初期化/フォーカスを確認し、送信中にランナーを止めない非同期処理と既存のScanCode方式を使用。隔離キーF16/F20/Ctrl+Alt+F9で非表示時操作・記録中停止・競合/再登録・終了時解放を確認した。同期送信での未到達等の失敗ログ・診断記録は保持し、OS側の低レベル原因は断定しない。
- このコミット工程で製品ソース・依存・版・発行物の追加変更はない。0.26.41のEXEは144081513bytes、SHA256 `0519a4b897728c2f107d9b1714132594d846e7b90e388001a752bc0ffcf5e9bf`のまま。feed、隔離コピー、試験fixtureのハッシュを再照合した。実サービス認証・物理IME・複数Shell/Windowの検証に読み替えない。
- 証跡は`.artifacts/commit-validation-overlay-20261011/validation.json`、`complete-*.json`と完全ログ。Node/pnpm/.NET/OS、依存・試験入力・Gmail/Watchの参照commit/tree、GUI profile16件、文書リンク184件を記録。最終検証後の変更は本VERIFICATIONの追記だけとして差分検査し、最終treeとコミットSHAを同証跡へ追記する。
- テストprofile386件を列挙し、最新3回/方式・再利用証跡・失敗/状態不明を保持。未参照の古い成功19件を絶対パス・再解析ポイント・使用プロセス検査後に削除し、`cleanup-deleted.json`へ結果ハッシュを記録。隔離テストプロセスの残存0。push/Release/実利用deployは行わない。

## 2026-10-11: 共通オーバーレイ・部分Shell・コマンドパレット移行（0.26.41）

- パレットの描画とCSSをDefault Shellへ移し、本体の重複実装を撤去。OverlayHostが遅延生成・重なり順・ready/終了・入力停止・元WebContentsへのフォーカス復帰を所有し、CommandPaletteSessionがモデル・実行/選択・ピン保存を管理する。トレイ編集は描画なしのCommandPickerから同じパレットを呼ぶ。
- `shell.views`のribbon/overlay.command-paletteで担当領域だけを提供可能。未提供領域はDefault Shell。通常のコマンド・設定・ページと併用でき、描画から自己コマンドを実行し、自己設定の取得/変更購読で再描画できる。リボンとパレットの故障・復旧を分離し、ログページは後続の契約/移行対象として仕様化。
- 型検査・ビルド・関連27/27回帰成功（palette/core/presentation/boundaries/tray）。source GUIはオーバーレイ7群（shell-overlay-1791721440033）、既存Shell/MCP/復旧14群（shell-host-1791721372544）、既存Applet/Gmailページ7群（applet-pages-1791721472874）、設定通知9群（settings-notice-1791721530696）、トレイ5群（tray-menu-ui-1791720741248）、ホスト再起動/終了（host-commands-1791721208103）が成功。IME composingイベント、Tab/Escape/Enter、停止中コマンドの選択、ピン、独立描画、ページ入力/フォーカス保持、自己コマンドの所有者検査と設定通知、readyタイムアウト、故障注入、再試行を確認。
- 0.26.41固定単一EXEでオーバーレイ7群（shell-overlay-1791721737218）、トレイ4群（tray-menu-ui-1791721796135）、再起動/終了（host-commands-1791721864418）が成功。両テーマを確認。sourceは実Windowを900×640へ変更し、portableは900×640のviewportエミュレーションで寸法・overflowを検査。既存トレイ試験は1280/1000/900幅も確認。物理IME・物理通知領域クリック・実サービスログインの検証とは区別する。
- パレット終了直後に本体rendererの古いmodal状態でキー入力を捨てる問題を修正し、停止判定をmainのdispatcherへ集約。旧GUI試験の本体DOM参照を独立Viewへ更新し、View破棄と入力完了の競合、再起動後の複数View選択、試験manifestのpages capability、所有ページ終了と提供元停止の区別、Electron未対応CDP操作を修正した。失敗profileとログは保持。
- frozen-lockfileは制限環境のSTATUS_STACK_OVERFLOW後、同じ操作を通常権限で成功。設定回帰のEPERM、Electron起動不可、publish内.NET工程の終了1も通常権限で再検証して成功。依存・lockfile・toolchainの版は変更なし。publish終了0、host/Default Shell/feedとも0.26.41。EXEは144081513bytes、SHA256 `0519a4b897728c2f107d9b1714132594d846e7b90e388001a752bc0ffcf5e9bf`。feedと隔離コピーを照合。
- 証跡は`.artifacts/overlay-validation-20261011/validation.json`と同フォルダーのログ・GUI結果参照。開発文書リンク169件とdiffを確認。標準全回帰、全既存GUI、複数Shell/Window、ログページ差し替え、overlayのMCP公開は今回未実施/未実装。既存MCPリボンは上記Shell試験で確認。変更した古いpreferences/navigation/keybindings/hotkeys/ui/automation試験はパレット参照の移行までで、今回全編の再実行はしていない。
- 成功済みprofileを方式別に整理し、最新3回・再利用参照・失敗/不明を保持。参照のない古い成功5件を絶対パス・再解析ポイント・使用プロセス検査後に削除（一覧と結果hashはcleanup-deleted.json）。隔離GUI残存0。実装は未コミット。push/Release/実利用deploy/未変更Appletの発行/全体ZIPの作成は行っていない。

## 2026-10-11: Applet専用入力API・全Applet共通許可（0.26.37）

- 操作カタログにcallers/permissionsを追加し、MCPとAppletの公開先・許可を共通dispatcherで判定。新規handlerのJSON Schema検証も共通化。既存11操作に加えinput.sendKeys/input.appCommandをApplet専用で公開し、MCPの列挙・直接実行には出さない。明示公開されたAppletコマンドからの呼出しはApplet側の許可で実行する。
- Applet操作許可を「設定→一般」の全Applet共通カテゴリへ変更。PC専用applet-api.json v2、初期OFF、Codexと独立。旧個別許可を全体へ拡大せずOFFから選び直す。監査は操作名/呼出元/結果を記録し引数は非記録。
- InputHostへWindows入力を集約。物理キー待機・対象変更拒否・再入抑止・取消を維持し、通常150msをジェスチャーへ追加しない。Node/.NETのホスト発行実行IDと開始対象を伝播。SDK/RuntimeのAssemblyVersion 0.10.0.0を維持。WebBrowserTools 0.3.2をTypeScript/Node化し、WindowsTools 0.1.3のキー送信も共通APIへ移行。既存11 ID/キー設定/ジェスチャーを保持。
- 型検査/本体標準276件/WindowsTools 11件/WebBrowserTools 2群成功。source Applet設定GUI各成功。最終単一EXEで旧DLL＋Node/.NET共通API GUI5群、既存MCP GUI15群（実Codex11ツール、推論なし）成功。両テーマ3幅・画像確認成功。
- 最終win-unpackedと最終2Appletで専用WinFormsへの全11キー/操作メッセージと.NET送信、既定拒否・全体許可・取消・MCP非公開/明示Applet委譲・対象変更を確認。連続gesture入力3回14ms。発行InputHostの物理ジェスチャー17項目成功。既存設定UIはUI_ONLY=1で7群成功、物理入力試験とは区別する。実ブラウザー/実利用アプリの意味上の効果は未確認。
- 初回の既存回帰で同期/非同期エラー契約の差を検出し、既存操作の検証経路を維持して修正。試験側の旧ナビゲーション・動的登録待ち・フォーカス取得を修正後成功。失敗ログ/profileは保持。依存/lockfile/toolchain更新なし。
- ローカルpublish完了。本体144063925 bytes、SHA256 62176788f1892400f7ceeec3725997d2563871baf3d6191834fd7ff980242f11。Applet ZIPは各repoのfeedと一致。証跡[validation.json](.artifacts/native-api-20261011/validation.json)、完全ログは同フォルダー。最終SDK applet-api-portable-1791701401707、MCP automation-portable-1791701442894、入力native-input-ui-1791701515610、UI gestures-ui-1791701492997。
- テストプロセス残存0。整理候補は直近3回または過去コミット検証の参照資料に該当し削除なし。失敗・不明資料は保持。実装は未コミット。外部公開/実利用deploy/未変更Applet発行/全体ZIP/App Server組込みなし。

## 2026-10-11: 共通操作API・SDKのコミット前確認

- 対象34ファイル・依存状態・単一EXEを実装時の証跡と照合してstage。型検査、標準272/272、固定単一EXEの新旧SDK/API GUI5群とMCP GUI15群を再実行し全終了0。旧SDKでコンパイル済みのDLL、Node/.NET別プロセス、独立許可、再入、設定保存、実Codex隔離接続を確認。
- 共通SDKの影響確認として既存WatchのRelease buildと回帰8/8が成功。配布済みWatch EXEと本体win-unpackedのGUI7群で表示、MCP設定反映、保存、ショートカット、再起動、停止を確認。元のGUI試験はキーボード確認で2回時間切れ。入力前にウィンドウ表示・focus・bringToFront・focus確認待ちを追加した証跡内のラッパーで全検査成功。失敗ログを保持し、製品や兄弟repoのソースは変更していない。焦点移動と描画待ちのどちらが原因かは未分離。
- 証跡は.artifacts/commit-validation-shared-api-20261011/。本体GUI profileはapplet-api-portable-1791695765632、automation-portable-1791695787809。Watch成功profileは同repoのui-1791695949280、失敗はui-1791695822273とui-1791695890026。検証tree/入力/fixture/兄弟repo/コマンド/終了コード/完全ログとhashを保存。
- 検証後の差分は本記録のみ。製品・発行物は不変、文書差分と最終tree/commitを記録。古い成功試験の整理候補なし、最新3回・再利用証跡・失敗/不明資料を保持。物理キー入力や実サービスは今回対象外。ローカルコミットのみ。

## 2026-10-11: AppletとMCPの共通操作API（0.26.36）

- AppDockApiの単一インスタンスをMCP起動から独立させ、MCPと既存Applet RPCのhost.appdock.callから利用。公開11操作の名前・引数・結果・revision/dryRun/保存を共有し、操作カタログからMCPツールを生成。旧AutomationApi importは互換exportを維持。
- appdock-api capabilityとPC専用applet-api.jsonのApplet ID/フォルダー別許可を導入。初期全OFF、読取り/実行/設定変更/管理/各編集をCodexと独立して設定画面で即時保存。接続から呼出元を決定し自己許可のAPIは公開しない。読取失敗時は拒否、監査はApplet ID付きで引数を記録しない。MCPからAppletを呼んだ後のAPI呼出しはApplet自身の許可を適用する仕様を文書化。
- Node context.appdock.callと.NET IExtensionContext.AppDock.CallAsync、共通結果/エラーコードを追加。SDK/Runtime 0.26.36、AssemblyVersion 0.10.0.0を維持。旧settings.set/Settings.SetAsyncの検証と変更適用をSettingsCommandsへ集約し、非公開/未宣言の自己設定・activate時更新・既存settings capabilityを維持。
- MCP→Applet→同期設定変更の再入を許可し、非同期コマンドの再入はBUSY、自身の通常コマンド/管理はSELF_CALLで拒否。MCPの編集可否表示の前提許可も従来と同じ条件へ統一。
- 型検査・標準272/272成功（新規8件）。公開/非公開・独立権限・取消・ID偽装拒否・保存/競合/dryRun・再入・旧自己設定・破損許可ファイル・MCP表示条件を検証。source GUI5群はapplet-api-source-1791692799887。初期試験の起動完了/非同期チェック反映待ちを修正し、失敗2profile/logは保持。
- 最終単一EXEで新旧SDK/API GUI5群（applet-api-portable-1791693234891）と既存MCP GUI15群（automation-portable-1791693256722）が成功。Node/.NET別プロセス、11操作、MCP停止時利用、許可画面と取消、MCP→Applet往復、再起動保持、旧SDKコンパイル済みDLLのロード/実行、GUI保存/draft競合と監査を確認。両テーマ1280/960/700幅を検査し画面を確認。実Codex隔離接続で11ツール、モデル推論なし。
- publish終了0。0.26.36単一EXEは144055110bytes、SHA256 919262d0efe476167eb9852ce06fc045274ea7815d08de016960279498f38409。feedと隔離コピー一致。依存/lockfile/toolchain変更なし。制限環境のHTTP EACCES/pnpm STATUS_STACK_OVERFLOWは同一コマンドの通常権限実行で成功、供給元検査は維持。自動承認のローカルpublish拒否は現行共通指示とpublish:neverを確認・提示して解消。
- 証跡.artifacts/shared-api-20261011/validation.json。文書リンク188件/整形/diff確認成功。今回の試験方式を整理対象として確認し、最新3回・commit/Release参照・失敗記録を除く古い成功候補なし。残存試験プロセス0。未変更Appletの再発行、実サービス/認証、物理ジェスチャー/通知領域入力、App Server製品組込みは対象外。未コミット、push/Release/実利用deploy/全体ZIPなし。
## 2026-10-11: タスクトレイ外部編集のコミット前確認

- 対象20ファイル・依存状態・発行物を前回証跡と照合してstage。型検査、標準264/264、固定単一EXEのMCP/GUI15群、既存トレイsource GUI5群・portable GUI4群を再実行し全終了0。sourceでは実Electron Trayイベントとsingle/double dispatchを検査し、物理通知領域のクリックは対象外。
- 証跡は.artifacts/commit-validation-tray-editing-20261011/。GUI profileはautomation-portable-1791674304703、tray-menu-ui-1791674330980、tray-menu-ui-1791674336857。検証tree/入力/完全ログ/コマンド/終了コードを保存。検証後の変更は本記録のみ、文書差分/最終tree/commitを記録。製品・発行物は不変、ローカルコミットのみ。

## 2026-10-11: タスクトレイの外部編集（0.26.35）

- tray.get/appdock_get_trayとappdock.tray.updateでメニューとシングル/ダブルクリック割当をまとめて公開。configure/add/update/remove/ungroup/move/reorderに対応し、既存parseTrayMenu/getTrayMenu/設定保存/TrayClickDispatcherを使用。グループ1段・固定設定/終了・解除時の子保持・空メニュー尊重を維持。
- PC専用allowEditTrayは旧省略を含め初期OFF、実行/設定変更の両許可も必要。新規割当は公開済み引数なしコマンドのみ、既存非公開/未知項目の保持・移動・削除は可能。クリック変更でコマンドを実行しない。共通revision/dryRun/no-op/原子的保存/未保存GUI draftの競合保護とautomation監査ログを継続。
- 型検査・標準264/264成功（新規9テスト）。階層・順序・重複/上限/固定項目・不正クリック・未公開割当・途中失敗・空/旧形式・関連外設定保持・許可取消・共有revision/ディスク/再起動競合・保存失敗を検証。依存/lockfile/toolchain不変。版更新後は固定依存をfrozen-lockfileと既存サプライチェーン検査で確認。
- source MCP/GUI15群（automation-source-1791673740359）と既存トレイsource GUI5群（tray-menu-ui-1791673747844）成功。実Electron Tray callback、single/double dispatch、一時停止チェック、配置・移動・固定末尾・再起動保持を確認。初回MCP試験で権限状態のmain→API接続漏れを検出して修正し、最終検証を再実行。失敗profile1791673668159とログは保持。
- 発行済み単一EXEでMCP/GUI15群（automation-portable-1791674013533）と既存トレイGUI4群（tray-menu-ui-1791674039951）成功。GUI/API相互反映、dryRun、権限拒否/取消、メニューとクリック設定の再起動保持、dirty draft競合、編集でfixtureコマンド未実行、API監査ログを確認。実Codex Desktopの隔離設定で11ツールとトレイdryRun成功、モデル推論なし。両テーマ/3幅の画面と画像を確認。
- 物理的なWindows通知領域のマウスクリックは未実施。source版の実Trayイベント検査と、renderer CDPによる単一EXE試験を区別する。実サービス/認証やApp Server製品組込みも今回対象外。
- publish終了0、0.26.35単一EXEは144056445bytes、SHA256 3e85f954ba769bb02a5a1c86431b10ec84a91096148783ae343b5944570d95bf。feedと両隔離コピー一致。証跡.artifacts/tray-editing-20261011/validation.json、文書リンク93件/整形/diff確認成功。
- 終了/成功/参照保護/境界/再解析点/実行中プロセスを確認後、古い成功automation-source-1791671195183とtray-menu-ui-1791558326093だけ整理。各方式最新3件、コミット/Release参照、失敗/不明/旧移行資料、固定出力を保持。残存試験プロセス0。今回実装は未コミット、push/Release/実利用deploy/全体ZIP作成なし。

## 2026-10-11: リボン外部編集のコミット前確認

- 対象22ファイル・依存状態・発行物を前回証跡と照合してstage。型検査、標準255/255、固定単一EXEのMCP/GUI14群と既存リボンGUI3群を再実行し全終了0。後者はオフラインGmail fixtureを使用し、実サービス/物理マウス入力は対象外。
- 証跡は.artifacts/commit-validation-ribbon-editing-20261011/。発行GUIはautomation-portable-1791673070574、既存GUIはribbon-layout-1791673095978。検証tree/入力/完全ログ/コマンド/終了コードとfixtureのhashを保存。検証後の変更は本記録のみ、文書差分/最終tree/commitを記録。製品・発行物は不変、ローカルコミットのみ。

## 2026-10-11: リボンの外部編集（0.26.34）

- 前回ジェスチャー編集をf4e4a6a5eda11d602316e6952c05e152e088992dへコミット後に実装。ribbon.get/appdock_get_ribbonとappdock.ribbon.updateで表示/非表示・上下配置・同じ配置内の順序・区切り線追加/削除・明示resetを公開。GUIの検証をparseRibbonへ抽出して共有し、保存形式と既存GUI操作は維持。
- PC専用allowEditRibbonは初期OFF、旧設定の省略もfalse。実行/設定変更/リボン編集の3許可が必要。無効Appletも配置一覧に含め、有効化やページ表示を行わない。未導入ページIDとローカル追加フィールドは保持し、明示resetだけ未導入配置も初期化。公開結果は限定した項目だけを返す。共通revision/dryRun/原子的保存/GUI未保存draft保持/automation監査ログを継続。
- 型検査・標準255/255成功（新規9テスト）。配置・非表示・区切り線・順序、無効/未導入ID、既存設定保持、no-op、dryRun、途中エラー時無保存、許可取消、共有revision/ディスク/再起動競合、保存失敗を検証。依存版/lockfile/toolchain不変。版更新後の依存確認は制限環境でpnpm STATUS_STACK_OVERFLOW、通常環境で同じfrozen-lockfileと供給元ポリシーを維持して成功。失敗ログも保存。
- source GUI/MCP14群（automation-source-1791672414537）と既存リボンGUI3群（ribbon-layout-1791672435169）成功。後者は上下配置/ドラッグ/区切り線/再起動保持とオフラインGmailページを確認。前者の初回は無効化直後に描画を待たず判定して失敗したため、表示から除去されるまで待つ試験へ修正。失敗profile1791672389511保持。
- 最終単一EXEのGUI/MCP14群成功（automation-portable-1791672743163）。実SDKによる編集/拒否/ログ、GUIからの保存をAPIで再取得、無効Appletの状態保持、dirty draftとAPIリボン変更の競合、実再起動後の配置/許可保持を確認。実Codex Desktopの隔離設定で10ツール取得とリボンdryRun成功、モデル推論なし。両テーマ1280/960/700のoverflowと画像を確認。既存ショートカット実キー順序・OS登録も成功。
- publish終了0。0.26.34単一EXEは144051108bytes、SHA256 b1d350cfba4f22c658194bed0ad48987362e14a1a7d5894fd9e7ae2f38f3ddf1。update.json/隔離コピーと照合。証跡は.artifacts/ribbon-editing-20261011/validation.json、整形・ローカル文書リンク89件・diff確認成功。
- 古い成功portable1791671479501のみ、成功/参照保護/最新3件/パス境界/再解析点/使用中プロセスを確認して整理。コミット証跡参照、各方式最新3件、失敗/不明資料、実行方式を記録していない旧ribbon-layout、固定出力・Release記録は保持。隔離試験プロセス残存0。
- マウス物理入力、実サービス/認証、App Server製品組込みは今回の対象外。今回リボン実装は未コミット、push/Release/実利用deploy/全体ZIP作成なし。

## 2026-10-11: ジェスチャー外部編集のコミット前確認

- 対象21ファイル・依存状態・発行物を前回証跡と照合してstage。型検査、標準246/246、固定単一EXEのMCP13群とジェスチャー編集GUI7群を再実行し全終了0。GUIはAPPDOCK_GESTURE_UI_ONLY=1で、今回変更していない物理入力フックの実入力試験は対象外。
- 証跡は`.artifacts/commit-validation-gesture-editing-20261011/`。発行GUIはautomation-portable-1791672012143とgestures-ui-1791672042806。検証tree/入力/完全ログ/コマンドと終了コードを保存し、検証後の変更は本記録のみ。文書差分/最終tree/commitを記録。製品・発行物は不変、ローカルコミットのみ。

## 2026-10-11: ジェスチャーの外部編集（0.26.33）

- 前回ショートカット編集を`57556a0521718e7ba7d120824d4c0e90f18b4895`へコミット後に実装。gestures.get/appdock_get_gesturesとappdock.gestures.updateで取得・割当追加/変更/削除/同じ入力の順序変更・動作設定configureを公開。既存parseGestures/入力正規化/条件/順序/保存処理を共有。動作設定は全体ON/OFF、ブラウザ/除外exe、Chromium条件、距離、間隔、待機表示。
- PC専用allowEditGesturesは初期OFF、旧設定での省略もfalse。実行/設定変更/ジェスチャー編集の3許可を要求し、ショートカット編集とは独立。新規割当は公開済み引数なしコマンドだけ。旧非公開/未導入割当を保持・無効化・削除可能。既存同一入力内の順序変更も許可。共有revision/dryRun/原子的保存/GUI未保存draftを維持し、既存automationログへ成功/失敗を記録する。
- 最終型検査、標準246/246成功（regression-final.log）。新規12テストは入力全種類、browser/exe/owner/applets条件、移動時順序、動作設定の境界/不正値、途中不正時の無保存、dryRun/no-op、許可取消、未通知ディスク/再起動/ショートカットとのrevision競合、保存失敗、独自追加フィールドを外部へ返さず保持する動作を検証。初期のテスト用ビルド名とnative行の条件参照を修正し、正規build-main経由で再検証した。依存版/lockfile/toolchain変更・取得ポリシー緩和なし。
- 最終発行EXEのGUI/MCP13群成功（automation-portable-1791671697045）。実SDKで追加/変更/削除/順序/configure/dryRun/拒否/ログ、GUI反映と全体ON、実プロセス再起動後の設定/許可保持を確認。既存ショートカット実キー順序/OS登録・Applet管理・dirty draft競合も成功。実Codex Desktop0.162.0-alpha.17.2から9ツール取得とジェスチャーdryRunを確認、モデル推論なし。
- 同じEXEの既存ジェスチャー編集GUI7群成功（gestures-ui-1791671780980）。一覧/入力全種類/条件/実行順/競合/保存再起動、両テーマ1280/900/700を確認。MCP画面は両テーマ1280/960/700、最終EXEの追加割当と狭幅編集画像も確認。初回はApplet管理追加前の件数期待4に対して7件で失敗したため、4個のfixtureコマンドと3個の管理コマンドをID照合する試験へ修正。失敗profile1791671726776とログを保持。
- マウス物理入力は今回は未実施（APPDOCK_GESTURE_UI_ONLY=1を明示）。ネイティブ入力フック/認識器は変更せず、保存と実際の入力効果を区別。実利用Applet/外部サービス/ブラウザ認証も操作していない。
- 最終publish終了0。0.26.33単一EXEは144048763bytes、SHA256 `6df4591111bb1b5e1959a76ad9c9e49e20d872a9f3f332da7079607f61ca663a`。feedとMCP/ジェスチャーUIの隔離コピーを照合。初回発行後の公開項目限定を修正して同版を再発行、初回/最終ログを別保存。証跡は`.artifacts/gesture-editing-20261011/validation.json`、文書ローカルリンク87件と整形/diff確認成功。
- 終了/成功/参照保護/境界/再解析点/使用中プロセスを検査し、古い成功source1791669870527のみ整理。各方式最新3件、コミット証跡参照の旧profile、失敗/不明、固定出力を保持。隔離試験プロセス残存0。今回ジェスチャー実装は未コミット、push/Release/実利用deploy/全体ZIP作成なし。

## 2026-10-11: ショートカット外部編集のコミット前確認

- 対象19ファイルと依存状態・発行物を前回証跡へ照合してstage。型検査、標準234/234、固定EXEのGUI/MCP12群（実Codex接続を含む）を再実行し全終了0。製品/発行物は変更なし。
- 証跡は`.artifacts/commit-validation-shortcut-editing-20261011/`、発行GUIは`automation-portable-1791670979339`。入力hash・検証tree・コマンド/終了コード/全ログを記録。検証後の変更は本記録だけで、文書差分・最終tree・commitを保存。ローカルコミットのみ、push/Release/deployなし。

## 2026-10-11: ショートカットの外部編集（0.26.32）

- 前回のApplet管理0.26.31を`162c12c99e3e77e60451326f3d258c4c65c2bcb2`へコミット後に実装。shortcuts.getとappdock.shortcuts.updateで取得/追加/変更/削除/同一キー順序変更に対応。既存keybindingsと互換フィールド、条件、共有revision/dryRun/原子的保存を利用し、GUIの未保存draftと他設定を保持する。
- 外部編集はPC専用allowEditShortcutsを初期OFFとし、allowWrite/allowExecuteも必要。新規割当は公開済み引数なしコマンドに限定。既存の非公開/未導入割当は保持し、無効化/削除と既存同一キー内の並べ替えを許可。登録結果は取得APIで確認でき、保存成功とOS登録完了を区別する。
- 型検査、関連40/40、標準234/234、source/固定発行EXEのGUI・MCP各12群が終了0。操作の一括検証/途中エラー時の保存抑止、revision競合、再起動後の保存状態と許可、権限取消、実キー入力による順序、グローバルキーのOS登録trueと解除、既存編集画面への表示、監査ログ、dirty draft保持を確認。初回の並べ替え単体試験で見つかった検索コールバック内のindex更新を修正後に全試験成功。
- sourceは`.artifacts/automation-source-1791670029838`、portableは`.artifacts/automation-portable-1791670210334`。両テーマ1280/960/700で横溢れなし。追加割当と許可画面を画像で確認。実Codex Desktop0.162.0-alpha.17.2の隔離設定から8ツール発見、取得と編集dryRun成功。モデル推論、実利用Applet/サービス、グローバルキーの物理押下は対象外。AppDock内の実キー操作とOS登録状態は確認済み。
- publish.bat終了0。単一EXE0.26.32は144051312bytes、SHA256 `b88056d228bd6709558099b039e2c6b5b24d099fea89a1909f10d27d85aa59bf`。feedと検証コピーの版/size/hashを照合。証跡は`.artifacts/shortcut-editing-20261011/validation.json`と完全ログ。依存/lockfile/toolchainの更新や取得ポリシー緩和なし。発行中に残ったWPF一時project1件は発行終了後に証跡へhash照合保存し、生成元だけ削除。
- 終了/成功/参照保護/パス境界/再解析点/実プロセスを確認し、旧成功source2件とportable1件を整理（cleanup.json）。各方式最新3件、コミット再利用資料、失敗/不明、固定出力を保持。隔離試験プロセス残存0。今回のショートカット実装は未コミット。push/Release/実利用deploy/全体ZIP作成なし。

## 2026-10-11: Applet管理のコミット前確認

- 0.26.31の対象22ファイルをstageし、型検査、標準226/226、固定発行EXEのGUI/MCP11群（実Codex接続を含む）を再実行して全終了0。製品内容と発行物hashは実装時と一致し、再発行不要。
- 検証treeは`4fda3402eea7330500c672dcb3130a0d9af926da`。証跡は`.artifacts/commit-validation-applet-management-20261011/`、発行GUIは`automation-portable-1791669479610`。検証後の差分は本記録のみで、最終tree/commitと文書差分を保存。公開/配置/プッシュなし。

## 2026-10-11: Applet管理コマンドと外部操作許可（0.26.31）

- 登録済みファイル型/WebAppletにenable/disable/restartを本体所有コマンドとして生成。GUIの有効切替・再起動と同じ処理を使用し、保存、設定競合、同じAppletへの同時操作を検査。外部管理許可は初期OFF、allowExecuteとの両許可が必要でallowWriteとは独立。Applet一覧・ログ・更新画面の表示も公開。
- 型検査、標準回帰226/226、sourceと固定単一EXEのGUI/MCP各11群が終了0。既存設定に管理フラグがない場合の拒否、実行/書込/管理の分離と取消、ディスク保存・競合・無関係設定保持、同時操作、無効時の再起動拒否、実Nodeプロセス再起動、WebApplet管理、本体再起動後の無効状態/許可保持、生成コマンドのパレット・ショートカット表示と実キーでの有効化、トレイ解決、3画面の遷移、監査ログ、dirty draft保持を確認。既存標準回帰にはnative起動・停止・再起動も含む。
- source成功: `.artifacts/automation-source-1791668987318`。発行物成功: `.artifacts/automation-portable-1791669137100`。両テーマ1280/960/700で横溢れなし、画面画像も確認。実Codexの隔離設定で7ツール発見と操作成功、モデル推論は未実行。管理操作による実利用Applet/外部サービスへの操作は行わず、専用fixtureを使用。
- 初回の制限環境ではプロセス/ファイルアクセス関連の失敗を確認し、通常権限で全回帰成功。新しい表示コマンド数の期待値と、実際には変更していなかった競合テストの値を修正。キーボード試験は描画反映前の入力で失敗したため、パレットの有効状態確認後に送るよう修正。途中の失敗profileと診断を保持。依存版/lockfile変更、供給元検査の無効化なし。
- `publish.bat`終了0。`publish/AppDock.at365.exe`は0.26.31、144037261 bytes、SHA256 `253547c736d210b6065e28bd24b108bd56369523bbc5a82872fc0679c51d384e`。feedの版/size/hashと隔離コピーを照合。証跡は`.artifacts/applet-management-20261011/`。実装は未コミット、push/Release/deploy/全体ZIP作成なし。
- 成功・終了・参照保護・実プロセス・再解析点を確認して古い成功profile4件を整理。本体source `1791660784529 / 1791665202525 / 1791665699836`、壁紙portable `ui-1791665912760`。各方式の最新3件、失敗/不明、コミット検証で保護されたportable `1791663497295`、固定出力を保持。削除結果とresult hashはcleanup.json。

## 2026-10-11: 設定コマンドのコミット前確認

- 対象26ファイルをstage後、型検査、標準回帰221/221、発行単一EXEのautomation GUI10群と実CodexによるMCP操作を再実行し、すべて終了0。検証前後treeは`71b1968dbde934b3a6c9cbe5ba93c1f121edd9de`。Gmailの標準21件/発行GUI、壁紙の標準.NET/RPC/発行ホストGUIも成功。
- 発行済み3モジュールのEXE/ZIPとZIP収録10ファイルの入力hashは前回検証時と一致。製品変更・依存更新・再梱包は不要。実Google/メール/デスクトップ壁紙にはアクセスせず、オフライン/native fixtureで確認。
- 証跡は`.artifacts/commit-validation-settings-commands-20261011/`。コマンド/終了コード/完全ログhash、tracked入力、兄弟tree、ツール/依存/発行物のhashを記録。検証後の変更は本記録の追加のみで、最終treeとcommit SHAも保存する。
- 終了済みの古い成功profileを本体/Gmail各1件、絶対パス・再解析点・稼働プロセス検査後に整理。最新成功3件と失敗/不明/再利用資料を保持。今回の依頼範囲はローカルコミットまで。

## 2026-10-11: 0.26.30 設定変更コマンドとboolean派生コマンド

- API v2: 設定変更をcommands.executeのid/argsへ統一。旧settings.patch/appdock_patch_settingsを削除し、MCPは7ツール。読取りAPIは任意appletIdに対応。提供元ごとのsettings.updateと、明示したbooleanのon/off/toggleを生成する。外部公開とローカル生成は独立し、設定変更は実行/書込の両許可を必要とする。未知項目・型/範囲/選択肢・revision・ディスク競合・dryRun・無変更時の保存抑止を維持。
- manifest/runtime/aliasの生成ID重複を拒否。生成コマンドを通常カタログ、キー/ジェスチャー候補、初期割当参照、設定アクション、Appletページ/トレイ登録へ統合。引数付きsettings.updateは引数なしの割当候補へ追加しない。本体はApplet固有の設定名・コマンド一覧を持たない。
- Windowsで高速連続置換のEPERMが通常実行でも再現。atomicWriteの同じrenameだけ最大3回/合計150ms再試行し、毎回保存先bytes/存在状態を比較して外部変更時は中断。一時ロック/介入更新/上限/一時ファイル回収を専用回帰で確認。設定操作・toggle自体は再実行しない。失敗した途中試験のログを保持。
- 最終型検査成功。本体標準回帰221/221成功（regression-final.log）。固定Node24.21.0/pnpm12.10.1、lockfile/供給元チェックを維持し、依存追加なし。制限環境のHTTP/CIM拒否は同じ検証を承認付き通常実行で実施。テストやセキュリティ検査の無効化なし。
- source GUI9群成功（automation-source-1791665699836）、最終単一EXE GUI10群成功（automation-portable-1791665838640）。公開設定のMCP/ローカル更新、生成トレイ登録、ショートカット一覧と実キー反転、Applet settingsChangedへの到達、dirty draft保持/古い保存拒否、両テーマ1280/960/700、再起動/登録解除/監査ログを確認。狭幅の表示を画像で確認。
- 実Codex Desktop0.162.0-alpha.17.2で、隔離configから7ツールを発見し、本体表示/設定コマンドの更新・再取得・復元に成功。モデル推論/実アカウント認証なし。App Serverの製品組込みは行っていない。
- 最終publish終了0。単一EXE144035497bytes、SHA256 b97240c72d3f1eaa3ce815d55906b023c1ae49c2ea53d502c7da207e6f4369d7。feed/GUIコピー一致。Gmail0.9.4/壁紙0.4.5のZIP全10ファイルと発行フォルダーのhash一致。変更した3モジュールだけ自身のpublishへ発行。
- 証跡は.artifacts/settings-commands-20261011と各GUI profile。Gmailの公開設定・実稼働停止/復帰はオフラインの発行物で確認。壁紙はnative fixtureのGUI/RPCと発行実EXEの不正設定拒否/終了を確認し、実壁紙・実Googleログイン・実メールは操作していない。全機能の無関係なGUI回帰、実OSの終了/更新適用は今回対象外。
- 古い成功profile4件をroot/再解析点/稼働プロセス検査後に整理し、方式ごとの最新成功3件、失敗/不明/再利用証跡を保持（cleanup.json）。commit/push/Release/deploy/全体ZIP作成なし。

## 2026-10-11: 0.26.28 Applet詳細・公開コマンド・API監査ログ

- applets.get/commands.list/commands.executeを追加して全8 APIに拡張。外部公開は本体の表示/設定/検索、Gmail/WebAppletのopen、壁紙next/start/stopだけ。実行直前に公開一覧と有効/running/availableを確認し、既存executeCommandを共用する。停止中AppletのactivateOnExecuteによる有効化を避け、PC専用allowExecuteを設定変更許可から分離（初期false）。同時実行拒否と受付/処理応答/効果未確認の結果を追加。
- 全MCP API呼出しを既存HostLogのautomationへ記録。API名/ホスト生成requestId/公開対象ID/成功失敗/時間と、実行の受付を記録し、未知ツール名・引数・認証・戻り値・生の例外は出さない。Applet詳細も生の起動エラー/Web URL/全設定を公開しない。ログの画面検索とhost.logのローテーションを共用。正本docs/automation.md、README/AGENTS更新。
- 型検査/build/最終整形成功。automation/loggingの関連回帰9/9成功（`.artifacts/automation-commands-20261011`）。明示許可/未公開ID/別提供元/動的availability/停止中/無効/同時実行/権限取消/保存再起動、戻り値や例外の非公開、MCP監査ログの成功・失敗と秘密値非収録を確認。前回のAドライブrenameの切り分け結果に基づきautomation fixtureは既定Windows TEMPを使用。
- source GUI9群成功: `.artifacts/automation-source-1791660784529/result.json`。実Node fixtureのnext呼出しと意図したstop失敗、loopback WebAppletのopen、本体設定画面表示、権限スイッチ、ログのautomation検索とhost.log、両テーマ3幅、再起動保持、旧設定競合/登録解除/停止を確認。実デスクトップ壁紙や実Gmailは操作せず、検証用Appletを使用。fixtureのWeb ID/アイコン形式とテスト変数重複を修正して成功。
- 実Codex Desktop0.162.0-alpha.17.2で隔離configから8ツールを発見し、commands.list/commands.execute(appdock.open)、設定取得/変更/再取得/復元成功（codex-result.json）。モデル推論/実アカウント認証なし。標準全回帰・実サービスでの効果確認は今回対象外。
- 最終publish終了0。0.26.28単一EXE144,043,104 bytes/SHA256 `0aefa4a2eaa300d48a2916d65dd6294dca883fad3db896e0df06ffe44e29c1be`、feed/検証コピー一致、梱包out66ファイル/文書リンク124件確認、旧全体ZIP不変。固定EXEでもGUI9群と実Codexの追加API呼出しが成功（`.artifacts/automation-portable-1791661019475/result.json`）。発行版の権限画面とsourceのログ画像を目視確認。
- 終了済み検証プロセス0。TEMP専用試験の111ファイルをリポジトリ内へhash一致確認して保管後に元領域を削除。古いsource成功1件automation-source-1791658701307を絶対root/再解析点/ロック確認後に整理（6,531,844 bytes）、source/portable各最新成功3件と失敗/固定/再利用資料を保持。証跡`.artifacts/automation-commands-20261011/cleanup.json`。未変更Applet再発行・commit/push/Release/deployなし。

## 2026-10-11: 0.26.27 Codex登録名をAppDockへ変更

- 配置IDを内部識別/管理コメントに残し、Codexへの登録名を既定AppDockへ分離。「接続の詳細」でAppDock_Test等の別名を設定可能。同名の他配置/手動登録は上書きせず案内。利用者指定により自動移行なし。旧名/名前変更前の登録は所有hash照合付きの「登録を解除」後に登録し直す。製品の実利用設定は変更していない。
- 型検査/build/整形成功。automation回帰7/7成功。旧名の自動変更拒否と明示解除、別配置の同名衝突/非破壊、別名の独立登録/解除、登録名保存と内部ID不変を追加確認。Aドライブの高速連続置換でEPERMが異なる箇所に出た4回は失敗記録を保持。原因は未断定、同じ最終ソースを既定Windows TEMPの隔離rootで実行して全7件成功。試験root上書き用APPDOCK_AUTOMATION_TEST_ROOTを追加し、34証跡ファイルを`.artifacts/automation-name-20261011/temp-test-evidence`へ一致確認して保管。
- source GUI8群成功（`.artifacts/automation-source-1791659914753/result.json`）。AppDock_TestのGUI登録/解除からAppDockの登録へ切替、他TOML保持、実Codexの5ツール発見/取得/変更/復元、再起動保持/解除/停止を確認。両テーマ3幅の詳細欄も確認。実Codexは隔離configを使いモデル推論なし。版更新直後のpnpm整合検査エラーはfrozen installで解消して型検査/buildを再成功、依存版/lockfile追加変更なし。
- 最終publish終了0。0.26.27単一EXE144,030,404 bytes/SHA256 `a6d4667f20e8c1197f092de28cd5ac9d8e0484ffa70c20cb101701db5289c1c4`、feed/隔離コピー一致、梱包out65ファイル/文書リンク123件確認、旧全体ZIP不変。固定EXE GUI8群と実Codex検証も成功（`.artifacts/automation-portable-1791660107886/result.json`）。発行版の詳細画面を目視確認。
- 終了済み検証プロセス0を確認。source成功の古い1件automation-source-1791658570417を絶対root/再解析点/ロック検査後に整理（3,614,797 bytes）、最新成功3件とportable成功2件、失敗/固定/再利用資料を保持。TEMPの専用領域は全34ファイルを保管先とhash照合して削除。証跡`.artifacts/automation-name-20261011/cleanup.json`。標準全回帰/実利用deploy/commit/push/Releaseなし。

## 2026-10-11: 0.26.26 共通操作API・MCP・Codex登録画面

- 通信非依存の5 API（本体情報、Applet基本一覧、設定schema、設定取得、設定patch）、公式SDKのloopback Streamable HTTP、設定内のCodex連携ページを追加。初期無効/読取り専用、変更可能項目はtheme/notifications/closeToTray/startMinimized。既存の検証・保存・通知を共用し、OS起動登録を実行しない。正本は[共通操作API](docs/automation.md)。App Serverの会話UI組込みとCLIは後続範囲。
- 型検査/build/変更コード整形成功。関連回帰38/38成功（automation、settings-sync、core、windows-launch、applet-settings）。許可項目・型・dryRun・未指定値保持・競合/再起動revision・破損設定保護、HTTP認証/Origin/サイズ/プロトコル、読取り専用、認証再発行、ポート競合/配置分離、登録/修復/解除と他TOML保持、破損認証情報の非上書きを確認。標準全回帰は今回の範囲外。ログは`.artifacts/automation-20261011/`。
- source GUI最終7群成功: `.artifacts/automation-source-1791658880032/result.json`。GUI登録/疎通、実MCPによる保存、dirty draftの保持と古い保存拒否、両テーマ1280/960/700幅と詳細表示、実プロセス再起動後の設定/endpoint/登録保持、解除/停止を確認。既存ナビゲーション17群も成功（`.artifacts/navigation-1791658884153`）。画像を目視確認し横overflowなし。
- インストール済みCodex Desktop/0.162.0-alpha.17.2で、GUIが生成した隔離config.tomlから5ツールを発見し、情報/設定取得→設定変更→再取得→復元まで成功。検証専用にapp-serverのMCP呼出しを使用し、モデル推論や実利用アカウントの認証情報は使っていない。自己疎通とCodexからのinitialize観測は別に検査。実利用config.tomlは変更していない。
- sandboxでのloopback/rename拒否は通常Windows環境で再実行して成功。実装途中のTOML null-prototype比較と書込許可切替時の接続切断を修正。Codex検証のsandbox enum誤りを試験側で修正し再成功。破損認証情報の表示を最後に補強し関連回帰を再成功後、同じ0.26.26を再発行。梱包out65ファイルが最終buildと一致、文書の相対リンク123件が存在。
- 最終publish.bat終了0。単一EXE144,035,839 bytes/SHA256 `898d5a069fcc0d309ed112c9a832b74e68728472bd5864dc61c2d2af8f55ef6b`、update.jsonと隔離コピー一致。固定EXEでも上記7群と実Codexによる取得/変更/復元が成功: `.artifacts/automation-portable-1791659206593/result.json`と`codex-result.json`。両テーマの発行版画像も目視確認。ASAR検査スクリプトのWindows区切りを直し、最終内容の一致を確認。既存0.26.25全体ZIPはsize/hash不変、未変更Applet再発行なし。
- 検証専用AppDock/Electron/Codexプロセスの終了を確認。今回のsource成功3件とportable成功1件を保持し、失敗1件・固定出力・再利用記録・状態不明の資料も保持。安全に整理すべき成功4件目以降がなく、削除0。実利用Codexチャットでのモデル推論、WSL/別PC、実利用先へのdeployは未実施。commit/push/Releaseなし。

## 2026-10-10: 0.26.18 コミット前の全回帰確認

- 共通ログ/WallpaperSlideshow終了対応のコミット依頼により、対象9ファイルをstageしてから標準回帰を実行。型検査、`dev.bat test`の192/192、変更コードのPrettier確認が成功。検証開始/終了のtreeは`14440020ff282971282d0b335478149d14175581`で一致し、未stage/未追跡の入力なし。
- 兄弟AppletのRelease回帰8グループ、RPC8項目と発行native EXE、実HWNDの終了通知3群、固定発行EXEのログGUI4群も今回再実行して成功。GUI証跡は`../Applet.WallpaperSlideshow.at365/.artifacts/host-logging-1791638884710/result.json`。停止時のApplet ID/errorレベル・全体/個別ログ・host.log・独自errors.logなしを確認。
- 再利用用証跡は`.artifacts/commit-validation-20261010-logging-shutdown/`。各コマンド/終了コード/完全ログSHA256、tracked入力、SDK/Runtime、toolchain/lockfile/依存状態、兄弟repoと発行物を保存。検証後の変更は本VERIFICATIONへの記録追加のみで、最終treeとコミットSHAを同証跡に記録する。
- 発行物は実装完了時の0.26.18/0.4.3から不変。feed/ZIP全2ファイル/文書リンク95件/既存全体ZIPの照合成功。新しい製品修正がなく再発行は不要。Applet側で終了済みの古い成功テスト2件だけを整理し、方式別最新成功3件・失敗・検証再利用資料を保持。
- PC自体のshutdown/reboot/logoff・実デスクトップ壁紙APIは未試験。隔離した実Windowsメッセージとfake壁紙APIの確認範囲を維持する。今回の明示依頼は両repoのローカルコミットまで。

## 2026-10-10: 0.26.18 Applet終了処理中の共通ログ

- WallpaperSlideshowの独自errors.logを共通APIへ移す依頼で、IExtensionContext.Log/Node logとhost.logは既存と確認。停止処理中の共通API一律拒否により、クリーンアップエラーがstderrのWarningになる境界を修正。stoppingではhost.logだけを許可し、stopped/errorと他APIの拒否は保持。SDK/RPC形式・プロセス寿命・全体終了手順の変更なし。
- 型検査/build成功（.artifacts/cleanup-logging-typecheck.log、cleanup-logging-build.log）。logging/notification-services/panel-images/lifecycleの関連回帰9/9成功（cleanup-logging-regression.log）。開始/稼働/停止中のログ、提供元IDのホスト付与、停止後拒否、停止中の設定/UI/通知拒否、実Node/.NETの起動/停止/再起動/異常終了分離を確認。
- 本体publish.bat終了0。0.26.18単一EXEは142,521,087bytes/SHA256 2dcb4e32c960101d4541dab24bdc949a655dd453b928388d4fd816f815cf7085。feedと検証コピー一致。既存全体ZIP1個はhash/size/mtime不変。未変更Applet再発行や全体ZIP生成なし。別途変更したWallpaperSlideshowは自身のpublishへ0.4.3を発行し、最低host0.26.18を設定。
- 固定単一EXEの隔離GUI4群成功: ../Applet.WallpaperSlideshow.at365/.artifacts/host-logging-1791637417933/result.json。実native Appletの起動失敗とfixtureの内部画像エラーを全体/個別ログ画面・ホストファイルで確認。普通の終了時のfixture cleanupログもApplet ID/errorレベルで保存。正常終了・重複抑制・独自errors.logなし・最終EXEコピーのhash一致を確認し、画像も目視。
- WallpaperSlideshowのWM_ENDSESSION/優先度/同期黒BMP処理の変更と、実HWNDへ限定送信した確定/取消/logoff/通常deactivateの検証は[Appletの記録](../Applet.WallpaperSlideshow.at365/VERIFICATION.md)を参照。Windows終了時にbefore-quitが発火しない仕様に対し、Applet側で同期クリーンアップする。PC自体のシャットダウン/再起動・実壁紙変更は行っていない。
- 2モジュールのmanifest/feed/ZIP全2ファイル、文書リンク95件、既存全体ZIPを照合（../Applet.WallpaperSlideshow.at365/.artifacts/logging-shutdown-final-check.json）。必要範囲を選択した実装時検証であり、全本体回帰・全GUI・実サービスを実行した記録ではない。
- 完了時整理は今回のtest-host-logging-ui/test-session-shutdownの成功をそれぞれ直近3回保持。未知の旧記録・失敗profile・固定ビルド/Release資料は保持し、.artifacts追加削除0。Appletの旧GUIが残した自身のTemp画像3件だけを境界/内容/終了確認後に削除。commit/push/Release/実利用deployなし。

## 2026-10-10: 実装・コミット・リリースの共通手順と検証再利用

- ユーザー依頼でdocs/development-workflow.mdへ本体/全Appletの段階別手順を集約。実装時は必要試験を選び版更新/publishまで、コミット時に必要回帰を全実行し修正/再発行後にcommit、リリース時に対象変更のコミット漏れと未pushを確認・解消する。
- 再利用条件はtree/対応commit、依存/関連環境・兄弟repo・未管理入力、完全な成功ログ/終了コード/SHA256の一致。文書のみの差分は明示して検査する。新規配布物と公開後検証は再実行。標準Prepareは変更せず、既存preflight/sealを用いてtypecheck/regressionの証跡だけ再利用する作業手順をRELEASINGへ追加し、再利用情報はseal対象ログへ残す。
- 30.PROJECT共通指示、本体AGENTS/DEVELOPMENT、6AppletのDEVELOPMENTと既存3AppletのAGENTSから参照。廃止された本体入口のALICE参照と親文書の誤った相対リンクを整理。変更前は本体/6AppletともGit作業ツリーcleanを確認。
- 検証: 対象手順14ファイルの相対リンク等162件が存在、追加した相互参照見出しの存在、Release手順の8項目がrelease.cjsのCHECKSと順序込みで一致、preflight/seal CLIとrelease.ps1のコマンド/ログ/出力契約を読取り照合。全7repoのgit diff --check成功。
- 文書だけのため製品回帰/GUI/ビルド/版更新/publish/Releaseの実行なし。証跡再利用経路の実Release試行は今回行っていない。スクリプトによる証跡自動判定を実装したものではなく、作業者が照合して既存準備処理を実行する手順。commit/push・実利用deploy・Codex内蔵メモリー更新なし。

## 2026-10-10: ポータブルEXEの実行時展開先の相談（変更なし）

- ユーザーは自動展開物を同期不要と考え、LOCALAPPDATA配下へ展開可能か質問。scripts/portable.nsi/build-portable.cjsを読取確認。現展開先はTEMP/AppDock.at365-PortableId、IDはTEMP/外側EXE/test-profileに基づく。EXEの配置フォルダーへは展開しない。PORTABLE_EXECUTABLE_DIR/FILEは元のEXEを子へ渡し、共有設定や素材の配置はこの展開先とは別。最後のruntime lease終了後に専用の子フォルダーだけを削除する。
- LOCALAPPDATA/at365/AppDock/runtime/識別子への変更はcustom NSIS templateで可能。ただし現時点では設計候補。変更する場合は安定した実行パス、Tray identity、二重起動/更新/再起動/親異常終了時のmutex/leaseと限定削除を維持し、実EXEで再検証する。今回の実行先変更・版更新・再発行・実利用展開先の整理は行っていない。
- READMEに残っていたログイン保存先の旧.appdock記載を現LOCALAPPDATA方式へ修正し、現TEMP展開と同期対象外を明記。並行するUI/その他差分は保持。読取/文書だけのため製品テスト再実行・テスト削除は対象なし。

## 2026-10-10: 0.26.15 at365保存先とプロフィール素材

- ユーザーの追加指定によりPC専用rootを%LOCALAPPDATA%/at365/AppDock/profiles/<配置ID>/へ変更。native updaterの許可rootも同時に変更し、旧namespace/別アプリrootは拒否する。APPDATA/LOCALAPPDATAへはat365を挟むという全アプリ共通方針と、今後のAppletも同期データはEXE配置内・端末固有データはホストのLOCALAPPDATA領域という規則を共有AGENTS/本体AGENTS/開発ガイドへ反映。現在のHost APIのSettingsは共有、Storage/SecretsはPC専用のApplet別領域を維持する。
- 続く指定で新しいアバター登録先を.appdock/assets/profile/<元ファイル名>へ変更。名前未指定のPNGもこの中のavatar.pngへ保存する。元bytes保持・同名別画像拒否・登録原素材の保持を同じ処理へ統一し、EXE隣へ新規avatar.pngを書かない。従来の参照は読み取り互換を残し、旧データの自動移動/削除は追加しない。
- 最終型検査と回帰190/190成功（at365-path-typecheck.log、at365-path-regression.log）。native helperは実LOCALAPPDATA内のランダムで不存在のIDに対し、at365/AppDockを受理、旧AppDock/別アプリを拒否し、保存ディレクトリを作成しないことも確認。既存の隔離journal復旧/設定受信/backup/素材/キー/.NET等の回帰を含む。
- 元名画像登録/同名拒否/不正画像/登録原素材保持/キー/.NET/再起動のsource GUI成功: .artifacts/preferences-1791613082761、at365-path-preferences.log。最終単一EXEの通常起動2配置GUI成功: .artifacts/settings-sync-ui-1791613228647/result.json（portable-production-path、10項目）。test-profileを使わず各fixtureのLOCALAPPDATAだけを隔離し、at365保存先・Chromium/Gmail分離・settings受信/dirty/backup/名簿・音声・profile画像単独変更/再起動を確認。実2PC/同期サービス/実認証ではなく隔離ファイル配達の試験。
- 最終固定単一EXE smoke成功: .artifacts/smoke-1791613278248/smoke-result.json、at365-path-smoke.log。ファイル名未指定のavatar.pngが.appdock/assets/profileに保存され、実画像表示・両テーマ・React/preloadのNode非公開・ピン/キー/トレイを確認。GUIは直列、専用プロセス終了を確認。smokeは既存の隔離root契約を使い、通常起動の保存先試験と区別する。
- 追加のprofile指定が発行中に届いたため、同じ修正の0.26.15を最終再発行した。at365-path-publish-final.log終了0、単一EXE142,526,132 bytes/SHA256 3a7fc899aa617ea0fe82eac98c1a668ec6903406e7e905fccfdd5d46034c9342。feed/隔離コピー一致、梱包out59ファイル/updaterが最終ビルドと一致、文書167相対リンク・両repo diff検査成功。証跡: .artifacts/at365-path-final-check.json。Gmail0.9.2のZIP hashは不変、Gmailコード/版/配布物と既存全体ZIPは変更せず、README保存先説明だけ追随。
- 作業完了時整理: 今回方式の通常起動GUI/名前未指定avatar smoke/source profile GUIはいずれも成功1回を保持。旧preferencesの結果/旧smokeの方式や再利用が未確定の記録、失敗/認証/固定ビルド/Release資料は保持し削除0。0.26.14の成功証拠も保持。実利用データの移動/削除、他アプリの既存保存先変更、commit/push/Release/deploy、同期サービス設定変更なし。

## 2026-10-10: 0.26.14 設定同期・PC専用保存・ファイル名アセット

- ユーザーが設計から一括実装へ承認し、登録元/用途別フォルダーの元ファイル名をIDにすること、同名別内容を拒否すること、旧.appdock移行を追加しないことを指定。共有settings.json/WebApplet枠/登録素材と、LOCALAPPDATA内の配置別認証・Gmail枠/枠設定・PC状態を分離。旧PC専用データの残存警告を追加し、実利用の旧フォルダーは移動・削除していない。仕様は[設定同期](docs/settings-sync.md)。
- 安定bytesの受信/rename/poll、dirty draftと保存前revision保護、正常20世代backup、破損/欠落時のローカル正常値継続、明示確認付き復元を追加。WebApplet名簿未到着時に空ファイルを生成しない。外部の枠削除で別PCのCookieを回収予約しない。アバター原画像/WAVは元ファイル名、同名同内容の再利用/別内容の拒否、共有素材の非prune、画像だけの受信再表示を実装。
- 最終のmain/renderer型検査とホスト回帰189/189成功。同期の途中JSON/rename/復旧/バックアップ20世代/古いdraft、名簿未到着の上書き防止、名簿外部削除とローカル回収の分離、名前/内容/登録rootの検証、native updaterのLOCALAPPDATA journal/result復旧と異なるroot拒否を含む。ログ: .artifacts/settings-sync-typecheck.log、settings-sync-regression.log。Gmail 0.9.2はpublish.bat -Testで21/21成功。
- sourceの2配置GUI: .artifacts/settings-sync-ui-1791611591247/result.json。最終固定単一EXEの2配置GUI: .artifacts/settings-sync-ui-1791611784215/result.json（10項目成功）。Chromium/Gmailの保存分離、settingsの起動中反映・dirty維持と古い保存拒否・破損再起動fallback/正常受信、WebApplet枠受信と外部削除後のローカルデータ保持、Gmail枠IDの非共有、登録音声一覧の到着と枠別独立選択、元アバター名と画像だけの反映、再起動保持を確認。実同期サービスを使わずファイルを隔離2配置へ配達した試験で、2台の実PCや実Googleログインは未検証。
- アバター登録/同名別画像拒否/不正画像拒否・キーと.NET等の既存設定GUI: .artifacts/preferences-1791611134067、settings-sync-preferences.log（終了0）。Gmailの既存UI機能GUI: ../Applet.Gmail.at365/.artifacts/ui-features-1791611016171/result.json（終了0）。登録済みWAV選択・同名拒否・標準/試聴・再起動、画像/枠/検索/キー/テーマ/geometry等を確認。音声欄の両テーマ画像を目視確認。途中で旧更新フィード/alert/keybindingsを前提にしたテストfixtureが失敗し、現契約に合わせたfixture・待機/locatorへ修正して最終成功。
- WebAppletの最終単一EXE回帰: .artifacts/web-portable-1791611830475/result.json。UI登録/well-known JSON/遅延表示/remote分離、ページと別Windowの入力/toolbar、停止/再開/ribbon、複数枠Cookie分離と再起動保持/Gmail保存維持が成功。GUIを直列実行し、専用起動プロセスを終了している。
- publish.bat終了0。本体0.26.14単一EXE 142,526,458 bytes、SHA256 2b12b5aa93f12103b7337cd8637e124e49796d038cc4813be0da55b8b8076e36。feedと隔離コピー一致、梱包outの全59ファイルとupdaterが最終ビルドに一致、文書167相対リンク成功。Gmail 0.9.2更新ZIP 89,381 bytes、SHA256 1a6484571df3d02481fd449d3ac1a900fec219e4ccf3d9d0008308e6c2889238、最低host0.26.14・全8ファイルのZIP/発行先一致。証跡: 両repo .artifacts/settings-sync-final-check.json、host settings-sync-publish.log、Gmail settings-sync-gmail-build.log。確認スクリプトのasar区切り/ZIP根階層の前提を修正して最終照合成功。
- 終了済みテスト整理: WebApplet portable成功の直近3回を保持し、古いweb-portable-1791531774239だけ削除（109,019,930 bytes）。結果/絶対root/再解析点/43プロセスの実行画像と候補参照0/全ファイル排他読み取りを確認。同期GUIはsource2/portable1の成功を保持。preferencesの個別resultなし、旧Gmailの方式/再利用不明、失敗・不明の資料は保持。結果: .artifacts/settings-sync-cleanup-{result,removed-proof}.json。通常publishのみで既存0.26.11全体ZIPのhash/size不変、未変更Applet再発行・commit/push/Release/実利用deploy・同期サービス設定変更なし。

## 2026-10-10: 古い成功テストフォルダーの整理

- ユーザーの削除依頼により、本体と全6Appletの`.artifacts`を確認。成功結果と実行方式を判定できるものを種類/方式ごとに直近3回まで保持し、それより古い94フォルダー（本体70、Gmail24）を削除。合計9,102,018,616 bytes（約9.1GB / 8.48GiB）。他5Appletは安全に削除できる条件を満たす古い成功分がなかった。
- 削除候補はrepoの`.artifacts`直下の検証済み絶対パスだけ。各repo/親/配下の再解析ポイントを除外し、結果JSONのhash・ファイル数/サイズを再照合、使用中プロセス/旧パス参照・ディレクトリの削除可否・配下ファイルの排他読み取りを確認してからPowerShellのLiteralPathで削除した。コマンドラインを取得できないAppDock群は実行パス/親PIDから実利用配置の子プロセスと確認、停止やACL変更はしていない。削除失敗/使用中による保留0件。
- 直近の成功結果69件のSHA256が不変、全削除候補が消え、その他の保持予定項目がすべて存在することを再確認。失敗/状態不明/実行方式不明のテスト536件、固定ビルド出力、Release/all-in-one資料、旧版移行資料、Gmailのgmail-dev/avatar-match-live、単独の調査ファイルは保持した。成功専用schemaはkeybindings/gesturesの末尾assert後のchecks形式も確認し、ただの名前/経過日数で削除していない。
- 本体0.26.12のEXE/feed SHA256と各Appletのpublish全33ファイルのhashが不変。Gmailの開発用データ3,166項目は改名時の棚卸しからsize/mtime/属性が不変。製品コード・版・設定変更/再発行/Release/deployなし。
- 候補/保持理由/全削除名/再照合結果は`.artifacts/cleanup-20261010-plan.json`、`cleanup-20261010-result.json`、`cleanup-20261010-verification.json`。調査のschema一覧と削除スクリプトは`A:/XX.TEMP/artifacts-cleanup-survey-20261010.json`、`remove-old-artifact-tests-20261010.ps1`。同期設定はユキちゃんが担当する。

## 2026-10-10: 開発生成物を`.artifacts`へ改名（0.26.12）

- ユーザー指定でrepo直下の`artifacts`を`.artifacts`へ改名。最初の通常/sandbox外の改名はアクセス拒否、ユーザーの中断・再開後の再試行は成功。原因は断定せず、ACL変更・実利用プロセス停止・旧データ削除は行っていない。Applet.WindowsTools.at365が元の場所に存在し、Git作業ツリーがcleanであることも再開時に確認した。
- 改名前後の74,986項目（ファイル51,473、通常ファイル合計42,783,730,897 bytes）の相対パス/サイズ/更新日時/ディレクトリ・リンク属性が一致。主要EXEと直近2件のRelease planのSHA256も移動直後に一致。棚卸しは`A:/XX.TEMP/appdock-artifacts-rename-20261010-before.json`と同`after.json`。保存済みJSON/ログの内部絶対パス・当時のhashは書き換えていない。旧記録のAppDock内の`artifacts/`は`.artifacts/`へ読み替える（各Applet自身の同名フォルダーは対象外）。
- 本体のビルド/開発起動/テスト/Release既定出力先/共有Appletパッカー/package.json/TypeScript fixture出力/Git除外と開発手順を更新。WindowMoverのDEVELOPMENT.mdも本体ホストを参照するコマンド1行だけ更新。以前からの未コミット文書変更を保持。製品のpackaged起動時のresources配置は変更なし。同期/バックアップ/スナップショットの除外設定は未変更。
- 型検査成功、`dev.bat test`は171 pass/0 fail。sandboxのpnpm依存検査待機を中断して通常環境で再実行し、依存検査も成功。変更CJS37件の構文、PS1の3件の構文/UTF-8 BOM、git diff --check成功。実行用ソース/スクリプト/テスト/設定に旧保存先参照なし、実行後も旧`artifacts`が再生成されないことと`.artifacts`のGit除外を確認。ログは`.artifacts/rename-20261010-{typecheck,test,publish,ui,portable,applet-pack}.log`。
- source GUIは`.artifacts/ui-1791568489764`で8群成功（.NET起動/コマンド/停止、設定保存、暗号化秘密、JSON保護など）。単一EXE smokeは`.artifacts/smoke-1791568492288`で終了0/ok:true、設定/avatarを隔離profileへ保存。共有`pack-applet-update.ps1`もdotnet-demo fixtureだけで終了0、update.zip/feedのsize/hash一致。未変更の製品Appletは再発行していない。
- 版更新後publish.bat終了0。本体EXEは142,514,767 bytes、SHA256 `ef4c8d0d412c6d1353371cbb11aa587b5ea74d9423efd518dc7096287e17bf5f`、0.26.12のfeedと隔離EXEコピーが一致。通常publishのみで全体ZIP作成/整理、GitHub操作、commit/push、実利用deployは行っていない。移動した直近2件のRelease planのhashは検証終了時も不変。
- 完了時整理: 今回のsource GUI/portable smokeは各方式1回なので直近3回保持の範囲内。改名した既存profileについては過去の使用終了・旧版資料の再利用要否を今回一括で確定していないため保持し、削除0件。フォルダーの改名で既存証跡を失わないことを確認した。

## 2026-10-09: キー割り当てのクリアをその他メニューへ明記（0.26.9）

- ユーザーの判断委任により、Deleteを解除キーにせずその他メニューを採用。従来の「削除…」をショートカットでは「キーのクリア…」へ明確化し、確認後に選んだIDの行だけを共有draftから除く。無効行/停止中でも操作でき、最後の割り当てを外した登録済みコマンドは未設定行へ戻る。他の割り当て/トレイ設定を維持し、空キーを保存するために検証を緩めない。
- 共通BindingActionsへremovalKindを追加し、ショートカットのメニュー/確認文/確定ボタンをクリア表記へ変更。ジェスチャーは既定の削除表記/確認を保持。Deleteのキー記録、通常の下書き保存/破棄・revision・登録エラー表示のしくみは保持。
- main/renderer型検査/build、Prettier/git diff --check/文書ローカルリンク97件成功。専用ソースGUIはshortcuts-ui-1791556431021の7群成功。複製した同コマンド行のクリア/キャンセル・元の割り当て保持、停止中Appletの無効行の解除→未設定表示→正常保存→終了/再起動後の解除保持、別コマンド/順序保持、Deleteをキーとして記録できることを検証。従来の登録競合/再試行、全列位置、採番、メニュー境界、両テーマ/3幅、保存/再起動も成功。
- gestures-ui-1791556254224のUI-only4群成功。共通部品変更後も従来の削除/確認/キャンセル/パレット/並べ替えを確認。実OSマウスジェスチャー入力は今回の対象外。保存形式/native入力/依存/lockfile/BAT変更なし。
- publish.bat終了0。0.26.9の単一EXEは142509665 bytes、SHA256 `0a0a5c88a0d70061e0e0836992a53d7a196537947c9b0627d70d655bd58dc712`、update.jsonの版/size/hash一致。既存0.26.2全体ZIPの個数/size/hash/更新日時ticks不変（artifacts/shortcut-clear-publish-result-20261009.json）。未変更Applet再発行/全体ZIP作成・整理なし。
- 発行した同一SHA256の実単一EXEコピーでも専用GUI7群成功（artifacts/shortcuts-ui-1791556619999/result.json）。無効/停止中行のクリア、確認キャンセル/複製行だけの解除、正常保存・終了/再起動後の解除保持、Deleteキーの記録、従来の登録競合/表示/採番/両テーマ3幅を確認。実利用設定・認証データは試験に使っていない。
- README/仕様/開発/AGENTS/版ノートと検証を更新。前の未コミット変更を保持し、今回もcommit/push/Release/実利用deployなし。
- 仕上げでメニュー幅を内容に合わせ、全項目が省略されないことをGUIで照合。ユーザーの追加指定で最終文言を短い「キーのクリア…」へ揃え、同じ0.26.9を再発行して上記最終hash/GUIを確認した。途中の実EXE試験は記録時のOS解除待ちで停止したため、試験側でホストを明示表示してからfocusする形へ修正し、最終EXEで成功。製品の入力処理/待機は変更していない。

## 2026-10-09: 正常時のショートカット表示整理・記録時の行位置安定（0.26.8）

- ユーザー承認で正常時の「登録済み/未登録」を省き、有効なglobal行かつ利用可能なコマンドの登録エラーだけを表示。「分かりづらくなる不要な表示」も対象とし、正常な複数割り当てにも出ていた「同じキーの割り当てあり」を省いた。同じキーの全一致/順次実行は上部の共通説明に残す。全体順メニューは「全体の実行順を上げる/下げる」と明記。未入力・現在利用不能・実登録エラー・再試行・完全コマンドID等、判断や対応に必要な表示は保持。
- 記録/再同期による一時的な空statusesでは直近の非空結果を表示専用に保持。同じ有効global行・同じコマンド/キーのエラー表示と絞り込みを再検査結果まで維持し、無効/別scope/利用不能の行へ古いエラーを表示しない。設定draft/JSON/revision/saveやbackendの実登録/入力処理へこのキャッシュを使わない。
- 型検査/build、Prettier/git diff --check/変更文書のローカルリンク97件成功。専用GUIはshortcuts-ui-1791554968135の6群成功。実Windows登録成功を確認してから、キー欄focusによるOS解除・blur後の再登録中も正常表示なし/全行高・表内行位置不変を照合。別の隔離ホストで同じキーを登録して実OS競合を発生させ、エラー絞り込み中の入力でも理由/行高を維持し、キー解放後の再試行成功でエラーが消えることを確認。複製/確認削除/追加/採番/全列座標/両テーマ・3幅/保存と再起動の既存検証も成功。
- keybindings-1791555044652の10群（実OSキー・ローカルとの重複防止・非表示・各条件・記録・順・保存）、navigation-1791555056219の17群成功。初期試験の浮動小数座標の完全一致、再試行/fixture設定復元の画面反映前の即時assertで失敗したため、0.5px未満の許容と対応する画面反映待ちへ試験を修正し最終成功。製品へ待機を追加していない。native入力・保存形式・依存/lockfile/BAT変更なし。
- publish.bat終了0。0.26.8の単一EXEは142512942 bytes、SHA256 `18f1cfee2c7538ab35865cafdcc21cd57576efef8256210f343672e8d8893519`。update.jsonの版/size/hashと一致、既存0.26.2全体ZIPの個数/size/hash/更新日時ticks不変（artifacts/shortcut-status-publish-result-20261009.json）。未変更Applet再発行や全体ZIP作成/整理なし。
- 同一SHA256の発行済み実単一EXEの隔離コピーでも専用GUI6群成功（artifacts/shortcuts-ui-1791555238339/result.json）。2つの実ホストでWindows登録エラーを確認し、正常focus/blur時の全行位置/高さ不変、エラー絞り込み・記録中の保持・再試行成功後の解消を検証。全列位置、両テーマ/3幅、メニュー、採番、保存と完全終了/再起動も成功。実利用設定・認証データは使用していない。
- README/開発/キー仕様/AGENTS/版ノートと検証記録を更新。既存の未コミット変更を保持、今回もcommit/push/Release/実利用deployなし。

## 2026-10-09: 全グループの列位置・幅配分・グループ内採番（0.26.7）

- ユーザー報告の列ずれを発行済み0.26.6の隔離コピーで再現。AppDock/短い名前/長い名前の3グループの先頭列は58.32/88.49/70.41pxで不一致（artifacts/group-columns-before-20261009.log、該当shortcuts-ui profileのgroup-columns-latest.json）。グループ見出しは既に表の外であり、原因はグループ別の自動テーブルレイアウトによる内容依存の幅計算。
- 両エディターに共通colgroup/table-layout: fixedを適用。追加指定で順番64px/有効52pxへ縮小、キー/ジェスチャー180px/条件200pxへ拡大、その他48pxを維持。コマンド列は残り幅、最小720pxの表を内部横スクロール。先頭2列の余白・ドラッグつまみの文字/間隔も調整し、番号とスイッチが収まる配置へ整理。
- ショートカット番号を提供元グループ内で1から表示。全行からグループ別番号を求めてから検索/状態フィルターを適用し、検索中も番号を保つ。ドラッグ後の採番は新しいグループ順へ追従する。保存配列の順序・dispatcherの条件/実行順はこの表示変更で変更しない。
- main/renderer型検査とbuild成功、Prettier/git diff --check/変更文書のローカルリンク97件成功。最終ソースGUIはartifacts/shortcuts-ui-1791553487915/result.jsonの5群成功。AppDock/2Applet（長いグループ名含む）と2ジェスチャーの全列座標/幅が一致し、dark/light・1280/900/700px全6組で両その他列48px、メニュー画面内/行高不変/main横overflowなし。番号A=1,2/B=1、検索中Aの2を保持、ドラッグで番号更新、他提供元位置保持・スイッチ・追加・複製・削除・保存/再起動を確認。
- navigation-1791553191170の17群、gestures-ui-1791553516587のUI-only4群成功。Applet詳細/共有設定の回帰、ジェスチャーのスイッチ/ドラッグ/メニュー/選択パレット/保存を確認。実OSマウス入力は今回のUI-onlyから除外。入力フック・nativeモジュール変更なし。全体unit167件は直前の0.26.6で成功済みで、今回の表示変更では型検査/既存GUIへ検証を絞った。
- publish.bat終了0。0.26.7の単一EXEは142514821 bytes、SHA256 `ba0202b905b8e22ab316c5740b60288ad525a062106581282a80c20f957931d5`、update.jsonの版/size/hash一致。既存0.26.2全体ZIPの個数/size/hashと更新日時（ticksを含む）不変。証跡artifacts/group-columns-publish-result-20261009.json。未変更Appletの再発行/全体ZIP作成・整理なし。
- 発行した同一SHA256の実単一EXEコピーでも上記専用GUI5群が成功（artifacts/shortcuts-ui-1791553673947/result.json）。全3キーグループ/2ジェスチャーグループ、両テーマ/全3幅で列座標と幅一致、その他は両方48px。グループ内採番/検索時番号保持、ドラッグ/スイッチ/パレット/複製/削除/保存/再起動を確認。実利用の設定・認証データは試験に使っていない。
- README/開発文書/AGENTS/版ノートを更新。0.26.6からの未コミット変更を保持したまま本修正を追加し、今回もcommit/push/Release/実利用deployなし。

## 2026-10-09: ショートカット/ジェスチャー編集UIの統一と細い操作列（0.26.6）

- ユーザー確認済みの0.26.5をmainへ`7b629f7`でコミットし、cleanを確認してから本変更を開始。ショートカット表を順番/有効/コマンド/キーバインド/いつ・どこで/その他の6列へ変更し、共通Toggle、ドラッグハンドル、選択専用CommandPalette、BindingActionsの浮動メニューをジェスチャーと共用。複製は既存条件を維持、削除は確認を通す。既定復元・全体の実行順操作・トレイ表示を保持した。
- グループ内のドラッグ/上下キーは他提供元の保存位置を保持。新規割り当ては空キーの下書きから始め、キー未指定の保存を拒否。特殊キー選択、提供元に限定した追加、追加後のキー欄フォーカス、記録中のホットキー停止/復帰を確認。終了・再起動の注意文をコマンド欄へ移し、両表の操作列を細くした。追加ボタン/メニューの角丸とやわらかいアクセント色を統一。
- main/renderer型検査、dev.bat testの167/167成功（artifacts/shortcuts-ui-tests-20261009.log）。追加unitは提供元内の並べ替えと実際のresolver順、他提供元位置・元配列の保持、グループ外drop拒否、保存形式のround-tripを確認。Prettier、git diff --check、変更文書のローカルリンク97件成功。依存/lockfile/BAT変更なし。
- ソースGUI: navigation-1791550774701の17群、shortcuts-ui-1791551226223の5群、keybindings-1791551229626の10群成功。キーGUIは実Windows入力、local/owner/別Window/Gmail/Web条件、記録・複製・順序・無効化・保存を含む。新規選択からコマンドが実行されないこと、空キーの保存拒否、メニューを開いても行高不変、削除キャンセル/確認、グループ外dropで未変更を確認。
- ジェスチャーGUIはgestures-ui-1791551350224のUI-only 4群成功（ネイティブ入力skipを明示）。共通メニュー・スイッチ・並べ替え・パレット/IME/フォーカス復帰・設定保存を確認。通常モードの初回は対象ウィンドウの前面取得に失敗したため、今回の実OSマウスジェスチャー入力は未確認。製品の入力フック/dispatcherは変更していない。
- publish.bat終了0。AppDock.at365.exeは0.26.6、142515253 bytes、SHA256 `2cb726de3d6bad2e6c1ba4ea872c63f3fca05ff71468f3cb3664e87277d46b7e`。publish/update.jsonの版/size/hash一致、既存0.26.2全体ZIPの個数/size/hash/更新日時不変（artifacts/shortcuts-ui-publish-result-20261009.json）。本体EXE/更新情報だけを通常発行し、未変更Applet再発行・全体ZIP作成/整理なし。
- 実単一EXE: 同一SHA256の隔離コピーでscripts/shortcuts-ui-test.cjsを実行し終了0。artifacts/shortcuts-ui-1791551793540/result.jsonはok:true、追加/保存/ドラッグ/上下キー/複製/確認付き削除/完全終了と再起動の5群成功。再起動後Ctrl+Tabとowner条件の保持を確認。dark/light、幅1280/900/700pxの全6組でショートカットの操作列51.02px、ジェスチャー48px、メニュー画面内・main横overflowなし。PNGを保存し、両表を目視確認。実利用の設定・認証データは使用していない。
- README/DEVELOPMENT/仕様/AGENTS/0.26.6版ノートを更新。今回の0.26.6は未コミット、push/GitHub Release/実利用deployなし。

## 2026-10-09: Applet設定の集約・独立ショートカットタブ・表示順（0.26.5）

- Applet詳細を説明/設定/ショートカット/ログの4タブへ整理。設定ページのApplet別一覧と本体専用キー入口を削除し、全体キー一覧をAppDock→保存されたApplet順→提供元不明のグループにした。上部tablist/tab/tabpanelとキーボード循環、固定ログsource、未保存入力/JSON/revisionの共有を保持。
- AppletIndexのトグルON中は全件表示・検索停止とし、ドラッグハンドル/上下ボタン/上下キーで共有draftのappletOrderを編集。全体保存/破棄に含め、再起動後も順を保持。WebAppletも対象、新規IDは末尾、不在IDは表示せず保存に保持。ホーム一覧/対象Applet候補も同じ順を使い、keybindingsの保存/実行順・起動順・ribbon.orderは変更しない。
- main/renderer型検査、dev.bat testの166/166、Prettier、git diff --check、変更文書のローカルリンク95件成功。新規unitは旧設定の補完、ID検証、不在/新規IDと順変更、元配列とキーの実行順の保持を確認。通常環境のtypecheck成功を確認し、sandboxのpnpm供給網確認の待機は中断した。依存/lockfile/BATの変更なし。
- ソースGUI: applet-order-1791548121973の4群、navigation-1791548125155の17群、applet-default-shortcuts-1791548134118の3群、web-applets-1791548134894の12群成功。ui-1791548270138（8群）、ribbon-layout-1791548272763（3群）、tray-ui-1791548315489も成功。旧入口のテストを新しい上部タブ/全体グループへ更新し、既存トレイ試験の固定ジェスチャーメニュー/完全ID表示の期待値も現行仕様へ修正した。フォーム/JSON/競合/破棄、停止中キー、設定action、ログ独立、Webアカウント/Gmail保存先、リボン/トレイの動作を確認。
- dark/light、幅1280/900/700pxのPNGを保存し、900pxの並べ替えとグループ画面、700pxの4タブを目視確認。等分flexで長いショートカット名が窮屈になったため自然幅へ修正し、単行/非切れ/ヘッダー座標/横overflowの検証成功。
- publish.bat終了0。AppDock.at365.exeは0.26.5、142514363 bytes、SHA256 `5d625c88e0e521f960d923604670bab894b753bcca73af30ff397f92e20cd502`。publish/update.jsonの版/size/hash一致（artifacts/applet-layout-publish-result-20261009.json）。既存0.26.2全体ZIPの個数/size/更新日時/hash不変。新版全体ZIPの作成/旧ZIP削除/未変更Appletの再発行はなし。
- 実単一EXE: publishと同じSHA256の隔離コピーでscripts/applet-order-ui-test.cjsを実行し、artifacts/applet-order-1791548674214/result.jsonはok:true。実ドラッグ・上下キー・共有設定/キーの保存と破棄・WebApplet順・全体グループ・dark/light全3幅・完全終了/再起動/順保持の4群成功。NSISのchild inspector出力はPlaywright electron.launchへ流れないため、直接接続の初回試行は停止して今回のprofileに一致する試験プロセスだけを終了し、既存web-applets-portable-testと同じ隔離CDP方式へ試験を修正した。製品への検証用API追加なし。
- README/DEVELOPMENT/ホスト開発/キー仕様/AGENTS/版ノートを更新。commit/push/GitHub Release/実利用deployは未実施。実利用中の設定・認証データは試験に使用していない。

## 2026-10-09: 通常publishとReleaseの分離・公開済みReleaseの3件保持（0.26.3）

- ユーザー指定で実装→版更新→変更モジュールのpublishを通常フローとし、本体のdistからpack:all-in-oneを分離。Release Prepareにpack-all-in-one工程を追加し、全体ZIPの作成・検証とseal成功後の旧版ZIP整理をリリース準備へ移した。通常publishは本体EXE/update.jsonだけ、変更したAppletは各repoで発行する。
- 追加指定のGitHub整理は公開後Verifyの成功保存後に共通release-retention.cjsで実行。公開日時順で最新3件の公開済みReleaseを保持し、古いRelease/assetだけを削除する。draft・Gitタグ/履歴は保持。全ページ取得、候補/保持対象/latestの再照合、削除前後と応答不明状態の記録を実装。Appletは公開後検証結果を保存して共通コマンドを実行する手順へ統一。
- 関連回帰: release.test.cjs/release-retention.test.cjsの16/16成功。既存all-in-one.test.cjsの隔離Git repoによる再発行/失敗時保持等の1件も成功。旧ZIPの数値版比較・新版/新しい版/別名/ネスト/backup保持・publishのjunction拒否、公開検証失敗時の削除抑止、整理失敗時もverified保持、3件以下/ページ分割/draft/対象変化/通信断の再開を確認。GitHubと公開ダウンロードはfixture。最終ログはartifacts/release-split-tests-20261009.log。
- 初回sandboxのfixtureはTEMPのGit書込/rename拒否で失敗。通常環境の隔離試験で成功。その後A:内TEMPで既存plan更新に一時的なEPERMが1件発生したため、既定TEMPで再実行し全件成功。製品のrename処理は変更していない。発行完了前の先行照合では旧feedの版不一致を検出し、終了0後の正式照合で解消した。
- SetVersionで0.26.2→0.26.3、README整合、型検査・ビルド・publish.bat終了0。単一EXEは142506046 bytes、SHA256 `c1b7181a7721248232ceca1fd82219f265bf78dfae55d21e036ae801ed486664`、update.jsonと一致。全Appletのpublishと既存ZIPの計34ファイルは発行前後で一覧/size/SHA256/更新日時一致。0.26.3全体ZIPは未生成、既存0.26.2 ZIPは保持。証跡artifacts/publish-scope-before-20261009.json、publish-scope-result-20261009.json、publish-split-20261009.log、publish-split-typecheck-20261009.log。
- 発行済み単一EXEの隔離smoke成功（artifacts/smoke-1791543109263、publish-split-smoke-20261009.log）。起動/保存先/プロフィール/トレイ等を確認。正式Prepare・実GitHub公開/削除・実利用deploy・commitは行っていない。releaseスクリプトは配布EXEに収録されないため、公開整理の追加後に同じ製品を再発行する必要はない。
- 共通30.PROJECT/AGENTS、本体AGENTS/DEVELOPMENT/README/all-in-one/RELEASINGとALICEの継続記録を新方針へ更新。前項の「通常発行後に旧ZIP整理」という当初指定は、この追加指定によりリリース時だけの実施へ変更。

## 2026-10-09: publishの旧版オールインワンZIP整理

- ユーザー指定で、新版の配置・検証成功後にpublish直下の旧版オールインワンZIPを削除する手順をAGENTS.mdとdocs/all-in-one.mdへ記録。発行失敗時は旧版保持。作業手順の整備であり、発行スクリプト・アプリ実装・版は変更していない。
- 現行0.26.2のpackage.json/update.json/ZIP内bundle.jsonの版一致、EXEのsize/SHA256、ZIPの安全なパス・重複拒否・全21ファイルのsize/SHA256・同梱本体の一致を再確認。全6Applet収録。実行結果は`artifacts/publish-zip-cleanup-20261009.json`。
- 0.23.0〜0.26.1の旧版ZIP9個を削除し、残存ZIPが`AppDock.at365-all-in-one-0.26.2.zip`だけであることを確認。アプリの変更・再発行・起動試験・commit・公開・実利用deployは行っていない。

## 2026-10-09: Applet別ショートカット初期値と一括初期化（0.25.2）

- `extension.json`の宣言コマンドだけを初期割り当てに指定できるようにし、初回発見時だけ設定へ追加。Gmail 0.9.1はCtrl+Tab/Ctrl+Shift+Tabをowner条件、Watch 0.1.2はPauseをglobal条件で宣言。本体のApplet固有既定値は除去。既存設定・ユーザーが解除した行を再追加せず、Applet詳細の一括初期化は対象Appletの行だけを下書きで置換する。
- WebAppletは将来の新規追加用テンプレートを設定画面で編集可能にし、作成時の保存で個別行へコピー。既定はリロードF5、戻るAlt+Left、進むAlt+Right、すべてowner/有効。既存WebAppletを遡及変更しない。WebAppletのコマンドと本体ツールバーは「リロード」へ改称。
- 型検査/build、全回帰136/136成功。sandbox内の最初の全体試験は一時フォルダーのEPERMとローカルHTTP接続待ちで完走せず、プロジェクト内一時領域と通常Windows環境で再実行して全件成功。新しい初期値・既存編集保持・Webテンプレート・Applet一括初期化のunitに加え、隔離GUIのApplet初期化3群（`artifacts/applet-default-shortcuts-1791532245168`）、WebApplet12群（`artifacts/web-applets-1791532251940`）、条件付きキー10群（`artifacts/keybindings-1791532292669`）成功。
- `publish.bat`終了0。AppDock単一EXEは100611885 bytes、SHA256 `6478fca6083f7f34ec1490ea8b85b66a1cecd5581a767f70afa3919419ec78a4`で`publish/update.json`の版0.25.2・size・hashと一致。全6Applet入りZIPは275734979 bytes、SHA256 `f922051edee927569815e2a29668d79bb0ad3a955d77adf03d4f62110e0c07fb`。`scripts/all-in-one-ui-test.cjs`でZIP全ファイルhash/size、安全な隔離展開、6Applet版/初期無効/起動を確認（`artifacts/bundle-verify-6110b7e8-bfb3-464a-aaed-573f162ad5ff`）。展開直後の設定にGmail2行とWatch1行が期待条件で存在した。
- 実単一EXEの隔離WebApplet3群も成功（`artifacts/web-portable-1791532267933`、版0.25.2/hash一致）。実Gmail認証と実利用先deployは試験していない。GitHub公開はこのローカル発行の対象外。

## 2026-10-09: Applet詳細タブを0.25.1へ版更新・コミット準備

- ユーザーがタブ表示を確認し、バージョンインクリメントとコミットを依頼。SetVersionで0.25.0→0.25.1、READMEの現行版とv0.25.1の変更ノートを整合。追加指定により、今後の完成時は版更新とpublish発行をセットにする方針を共通/本体AGENTSへ反映。通常修正はパッチ番号、再試行/未変更Applet同梱だけでは追加インクリメントしない。
- 型検査成功、`publish.bat`終了0。sandboxで版更新直後のpnpm確認が待機し、その対象だけを中断して通常Windows環境の型検査は終了0。lockfile/依存版に変更なし。
- 発行EXEは100611563 bytes、SHA256 `917e43727bb298f0227a7c637bc545a2ea8d21efcaadfe699d33b8746c6f648a`。update.jsonと0.25.1全体ZIP内の本体の版/hash/size一致。全6Applet/21ファイルの整合と安全な隔離展開を既存verify-all-in-one.ps1で確認（`artifacts/detail-tabs-0.25.1-publish-20261009.json`）。
- 0.25.1発行win-unpackedのnavigation GUI17群成功（`artifacts/navigation-1791529668175`）、実単一EXEの隔離smoke成功（`artifacts/smoke-1791529678569`）。push/GitHub Release/実利用deployは依頼範囲外。

## 2026-10-09: Applet詳細を横並びの説明・設定・ログタブへ統一

- ユーザーの横並び希望とUI判断の委任に基づき、可変ラベルの操作ボタンを固定の3タブへ統一。アイコン/選択色、tablist/tab/tabpanel、単一選択と左右循環/Home/Endの操作を追加。同ページの下だけ切り替え、共有設定draft・不正JSONの保護・対象Appletへのログ固定・別Applet選択の説明復帰を保持。
- 型検査/build/diff check成功。開発GUI17群成功（`artifacts/navigation-1791527251407`）、WebApplet GUI12群成功（`artifacts/web-applets-1791527306856`）。初回画像で説明/設定の2文字が折り返したためnowrapとアイコン縮小禁止を追加し、dark/light・700/900/1280pxでラベル1行/クリップなし、タブとヘッダーの座標一致、横overflowなしを検証・目視確認した。
- 既存JSON下書き試験のElectron fillがWindowsで全選択を失い追記になる現象が再発。下書き状態の検証はtextareaのnative value setterとinputイベントで入力し、全選択のOS状態に依存しない試験へ変更。製品のキー処理は変更していない。
- `publish.bat`終了0、単一EXE/update.json/全6Applet入りZIPを最新ソースで更新。版は0.25.0のまま。本体100608412 bytes、SHA256 `7ee2f092c84c40880e33cd045d61dd42e33cc359dbd4191e03753adb73fdaab8`。feed/hash/size一致、ZIP内本体一致、全21ファイルのhash/sizeと未収録ファイル/パスを既存verify-all-in-one.ps1で検証・隔離展開（`artifacts/detail-tabs-publish-20261009.json`、`artifacts/detail-tabs-bundle-20261009`）。
- 発行済みwin-unpackedのnavigation GUI17群成功（`artifacts/navigation-1791527467639`）、実単一EXEの隔離smoke成功（`artifacts/smoke-1791527478061`）。publish版でも上記タブ操作と共有設定・ログの回帰を確認。Release公開/commit/push/実利用deployなし。

## 2026-10-09: Applet内ログ変更をpublishへ発行・完了時の発行を定常化

- ユーザー指定で、アプリ実装・修正の完成時はRelease前でもpublishへ発行する方針を30.PROJECT/AGENTS.mdと本体AGENTS.mdへ記録。ソース/開発ビルドのみを完了とせず、既存発行手順・終了コード・成果物・隔離起動を確認する。公開/版更新/deployは別の指示に従う。
- `publish.bat`終了0。本体単一EXE/update.json/全6ローカルAppletのオールインワンZIPを発行。sandbox内の初回.NET発行は終了1、通常Windows環境で既存手順を再実行して成功。版は0.25.0のまま、commit/push/Release/実利用deployなし。
- EXEは100609519 bytes、SHA256 `ccf8dd13f9aaeb3013dd16f75d33dea06d183a9dacb6ebf82d0c72039605a24b`。update.jsonのhash/sizeと一致、ZIP内本体も一致。bundle.json記載の21ファイルのhash/sizeを検証（`artifacts/inline-logs-publish-20261009.json`）。ZIP内のWindows区切りを正規化して照合した。
- 発行済みwin-unpackedでnavigation GUI16群成功（`artifacts/navigation-1791526686735/result.json`）。初回は既存JSON fillの一時追記で失敗し、再試行成功。Applet内ログ・説明復帰・下書き保持・全体ログ独立・dark/lightと幅900/1280pxを確認。
- 実単一EXEの隔離smoke成功（`artifacts/smoke-1791526714472/smoke-result.json`）。起動・UI bridge・元EXE隣への設定保存・プロフィール画像・トレイ動作を確認。今回のZIPは収録整合の確認で、全実Appletの個別操作試験とは区別する。

## 2026-10-09: Applet詳細内でログを表示

- 「ログを見る」を別ログページへの遷移から、同じApplet詳細内のログ表示へ変更。説明・設定・ログを排他的に切り替え、両操作ボタンの位置と見た目を保持。選択Appletのsourceに固定し、既存LogsPageの検索・レベル・保存先操作を共用する。別Applet選択で説明へ戻り、リボンのログページのsourceと共有しない。
- `dev.bat run typecheck`、`dev.bat run build`、`git diff --check`成功。隔離Electronのnavigation GUI16群成功（`artifacts/navigation-1791526237083/result.json`）。固定source/空結果/検索/レベル/説明復帰/設定との往復/下書き保持/全体ログ独立を検証。dark/light、900/1280pxで切替ボタンとヘッダー座標一致・横overflowなし、900pxのログ画像も目視確認。
- sandbox内のElectron起動は失敗し、通常Windows環境の隔離profileで検証。初回GUIは既存JSON入力試験でfillが追記になり失敗、再実行で解消。追加試験の見出しlocatorがsidebarのh2も拾ったためh1へ限定して修正。最終GUIは全群成功。
- 版更新・publish・実利用deploy・commit・push・Releaseは未実施。ソースと開発ビルドでの確認結果。

## 2026-10-09: 条件付きショートカットを0.25.0としてリリース準備

- 新規キー割り当てはApplet提供元を既定にし、本体/提供元不明はAppDock全体。既存行のキー変更・複製は条件を保持。ショートカット表/コマンドパレット/ホームのピン留め/トレイ動作選択へ完全なコマンドIDを表示し、ID・コマンド名・提供元名の検索を維持した。
- 0.25.0へ版更新。型検査/build成功。専用GUI10群（`artifacts/keybindings-1791523433971`）、設定保持7群（`artifacts/preferences-1791523444534`）、画面遷移16群（`artifacts/navigation-1791523485549`）成功。dark/lightと700/900/1280pxを含む。ナビ試験の旧補助表示「未確認のコマンド」への依存を完全ID表示に合わせて更新した。
- 版変更後のpnpm依存確認はsandboxで停止し、対象プロセスだけを終了して通常環境で再実行した。lockfileは変更なし。OSキー試験の仮想キー送信は複数回未到達。非同期送信/試験順分離だけでは改善せず、試験ヘルパーに任意のScanCode方式を追加して実OS入力を確認した（比較試験`artifacts/keybindings-1791523386732`と最終GUIの双方で成功）。製品のキー受付へ待機/送信方式変更は加えていない。外部フック等の低レベル原因は断定しない。
- ユーザーがこの会話のショートカット基盤全体と上記2点をまとめた版更新/公開を依頼。最新Releaseはv0.24.2、origin/mainは`1e2a2a50d4fd86b76689d7015df57e0762bc23f9`、v0.25.0未使用、全6Applet checkout cleanと読取確認。正式Prepare→Draft→Publish→Verifyの実行証跡は`artifacts/release-0.25.0-shortcuts-20261009/plan.json`へ記録し、固定配布物の追加ショートカット/ページGUIも確認する。最終結果/公開URL/ハッシュはPlanとALICE日記を参照。実利用先deployは行わない。

## 2026-10-09: コマンド提供元のAppletページ条件を追加

- `owner`条件を追加し、現在のコマンド登録元extensionIdとアクティブページを照合。提供元名だけ（例: Gmail）を表示し、「すべてのApplet → 提供元名 → 指定したApplet」の順に配置。本体コマンドでは提供元項目を出さない。既存のpages/applets設定は意味を保つ。
- 型検査/build、条件・登録元・不明/本体・フォーカス・保存形式を含む専用unit 8/8成功。ソースGUI9群成功（`artifacts/keybindings-1791522519621`）。発行win-unpackedでも提供元内で実行/別Appletでは非実行、Gmail名だけの表示、本体項目除外、順序/保存を確認。
- 発行版GUIの実Windows入力試験は2回`Expected d,a`で停止。発行ヘルパー単独では同じSendInputを受信。診断用にOS通知/Web入力の観測だけを加えたGUIは9群成功（`artifacts/keybindings-1791522762511`）、ローカル重複防止/全Window非表示の2回ともOS通知を確認。製品コード/入力待機は変更していない。最初の未到達の低レベル原因は未特定。診断スクリプトは`artifacts/keybindings-owner-probe.cjs`に保存。
- `publish.bat`終了0。0.24.2のローカル確認版を再発行。EXE100612225 bytes/SHA256 `88c5afdb1d3978f748a4a200983822aeaf28babac0d81e8360fd8567086c41b3`とupdate.jsonが一致。全6Applet入りZIPの全ファイルsize/hashと本体一致、隔離展開した単一EXE起動/全Appletの版・初期無効を確認（`artifacts/owner-keybindings-bundle-result.json`）。実利用設定変更、deploy、commit、push、公開なし。

## 2026-10-09: 条件付きショートカット版をローカルpublishへ発行

- 追加依頼により`publish.bat`を実行し終了0。本体単一EXE、update.json、全6Applet入りZIPを更新。版は0.24.2のままのローカル確認用で、公開済みReleaseとは内容が異なる。deploy、commit、push、GitHub公開は行っていない。
- EXEは100610698 bytes、SHA256 `d9aa0f054789a38de1a0d7ae41022dbfab12d9e2cb149294052cc49f34f9b879`。update.jsonのsize/hashと実単一EXE試験コピーが一致。
- 発行したwin-unpackedで専用ショートカットGUI7群成功（`artifacts/keybindings-1791521847798`）。実単一EXEのWebApplet GUI3群も成功（`artifacts/web-portable-1791521873121`）、起動、設定/Cookieの再起動保持、リボン停止/復帰を確認。
- 同梱ZIPは275734355 bytes、SHA256 `81dd08a3c8aaf3e5da3feadd4f4bda37c2da4ffa00bd409d3a5738d7358c5aec`。全21ファイルのsize/hash、本体EXE一致、隔離展開後の実EXE起動、全6Appletの版と初期無効状態を確認（`artifacts/keybindings-publish-bundle-result.json`）。実利用設定/認証データは変更していない。

## 2026-10-09: 条件付きショートカット基盤（未公開）

- 割り当て単位のkeybindings、4種類のscope、複数Applet選択、全一致/保存順実行、同一コマンド重複除去、実行中再入抑制、失敗後の継続/終了時打切りを実装。旧設定は新形式がない時だけ利用し、新形式の空配列も維持。実利用settings.jsonの編集/破棄は行っていない。
- `dev.bat run typecheck`、`dev.bat run build`成功。通常権限の`dev.bat exec node --test tests/*.test.cjs`は132/132成功（新規7件含む）。初回sandboxではTempのrename/子プロセスが拒否され失敗したため、通常権限で再検証した。
- 専用GUI `scripts/keybindings-ui-test.cjs`は7群成功。最終証跡`artifacts/keybindings-1791521496874/result.json`、dark/light PNG。本体、localページ、WebApplet埋め込み/別Window、ページ切替後の捕捉済み実行対象、GmailローカルUI/オフライン本文、Ctrl+Alt+F10の実RegisterHotKey/SendInput、ローカルとの重複防止、全Window非表示、複数対象、記録中解除、順序/無効化/保存を確認。
- 既存GUI: `applet-pages-ui-test.cjs` 6群（`artifacts/applet-pages-1791520900394`）、`preferences-ui-test.cjs` 7群（`artifacts/preferences-1791521158229`）、`navigation-ui-test.cjs` 16群（`artifacts/navigation-1791521170308`）成功。.NET/Node実コマンド、再起動設定保持、両テーマ、狭幅、フォーム/JSON/各設定入口の下書き共有、Gmail session/入力/背景監視を含む。
- 途中の試験失敗: 素のF18/F23はOS登録競合。検証用ファイルの同時読取でatomic renameがEPERMになり、fixtureを追記型の別キー保存へ変更。GUI再起動ではPlaywrightのfocus emulationと実Windowフォーカスを区別して待機。Ctrl+Altキー一括SendInputはOS通知/対象WebContentsの双方へ届かない回があり、UIなしの最小ホストでは到着を確認。試験ヘルパーで押下中の修飾キーを待ち、各押下/解放を20ms間隔で送って最終GUI成功。製品の受付頻度に待機は追加していない。外部フック等を含む低レベル原因の断定はしない。
- 利用境界: Applet Web画面は文字入力保護のためCtrl/Alt付き・F1〜F24・Pause。本体の通常入力欄は既存保護、IME/リピート/キー記録を除外。native Appletの独自Windowはページ条件に含めない。実Gmail認証環境、物理キーボードの全配列/IME組合せ、配布単一EXEでの今回の変更は未検証。今回は版更新、publish、deploy、commit、push、Releaseを行っていない。


## 2026-10-09: 停止中Appletのリボン修正を0.24.2としてリリース

- ユーザーがローカル修正版の正常動作を確認し、版更新/公開と、不具合があった直前のRelease削除を指定。0.24.2へ更新し、下記のWeb/Gmail共通リボン修正と関連回帰をコミットする。Gmail Appletの版・API・保存形式は変更しない。
- 現在のGitHub latestはv0.24.1（Release ID 407459037、対象commit d57e9d4eac4403346adfc97733db74ecc6af3aa3）、v0.24.2のタグは未作成と読取確認。新しい`artifacts/release-0.24.2-ribbon-20261009/plan.json`で正式Prepare→Draft→Publish→Verifyを行い、固定配布物のWeb/既存ページGmail/リボン配置/実単一EXEの追加GUIも直列実施する。
- 新版のVerify成功後にv0.24.1のReleaseとアセットを削除し、Gitタグ/コミット履歴を保持する。削除前metadata・削除結果・latest/旧タグ照合は同じartifactsへ保存する。最終の版・hash・公開状態はPlanとALICE日記を参照し、Prepare後にソース/ノート/配布物を変更しない。実利用先deployは行わない。

## 2026-10-09: 停止中のWebApplet/Gmailをリボンから非表示

- 公開済み0.24.1のローカルEXEを隔離コピーして再現。AppletページでWebAppletを無効化してもアイコンが残る回帰を、`artifacts/web-ribbon-before-fix.log`の`disabled WebApplet ribbon disappears`で検出した。ユーザーの追加指定によりGmailも含め、実リボンのページ一覧を有効なAppletだけに限定した。設定の一覧・保存済み表示/順序/上下配置、開始待ち/エラー中の有効なApplet、コマンドによる明示起動の契約を保持する。
- project-local Node/pnpmの型検査・ビルド成功。ページ/WebApplet/Webプロフィールの回帰16/16成功、fail/skip 0（`artifacts/web-ribbon-typecheck.log`、`web-ribbon-build.log`、`web-ribbon-unit.log`）。Web GUIの最初の配置比較は画面更新前に読み取って失敗したため、保存済み下寄せの画面反映を待つ試験へ修正して成功。最終ソースの既存ページ/Gmail GUIも成功（`artifacts/web-ribbon-pages-source.log`）。
- `publish.bat`でローカルの通常単一EXE・update.json・全6Applet入りZIPを再発行、終了0（`artifacts/web-ribbon-publish-final.log`）。版は0.24.1のままのローカル確認用修正版で、今回のコミット/push/新Release公開/公開済みアセットの置換/実利用先deployは行っていない。
- 最終固定配布物の隔離GUIを直列実行し、全て終了0/ok:true。Web12群=`artifacts/web-applets-1791516642725/result.json`、既存ページ/Gmail6群=`artifacts/applet-pages-1791516651144/result.json`、リボン配置3群=`artifacts/ribbon-layout-1791516661820/result.json`、実単一EXE3群=`artifacts/web-portable-1791516667616/result.json`。Appletページの実スイッチで停止→対象だけ非表示→再開→リボンから正常表示、Gmail/WebのCookieとアカウント保持、上下/順序/手動非表示の保持、停止したWebAppletの再起動後の非表示を確認。実サイト認証・実メール受信は今回の変更範囲外。
- 最終EXEは100609206bytes、SHA256=`559fa6d46142c025f0a1510363e8bf5b6fe2bb541934df2c190bff092d87f5a2`。update.jsonのsize/hash、ZIP内の本体、実単一EXE試験コピーが一致（`artifacts/web-ribbon-artifact-check.json`）。README/開発ガイド/ページ・WebApplet仕様/repo AGENTSへ挙動を反映。

## 2026-10-09: Webアカウント改善と通知起動先修正を0.24.1へ統合

- ユーザーが「Gmail通知の起動先を修正」の完了を待って一緒にコミット/Releaseすることを明示承認。完了を確認し、Webアカウント独立管理・即時操作・削除後処理・名前blur/Escapeと、配置先/profile別の通知protocol activationを同じ本体版へ統合する。Applet API/各Appletの版・単一EXE形式は変更しない。
- 統合前の実測は各節の記録を参照。通知側は回帰124件と2か所の実EXEでWindows Shell activation/二重実行防止/終了済みAppletのcallback抑止/cold起動を確認。最終WebソースGUIは11群成功。物理的なGmail通知クリック/実受信は未自動検証、更新前の通知には以前の起動先が残る。
- 0.24.1のコミット後に、[Release手順](docs/RELEASING.md)のPrepare→Draft→Publish→Verifyで正式検証/公開を行う。新規証跡は`artifacts/release-0.24.1-web-notification-20261009/plan.json`と隣のログへ保存する。Prepareで固定したEXEに対しWeb/既存ページ/通知/単一EXEの追加GUIを直列確認し、公開後は匿名取得ハッシュと実PortableUpdates.checkを照合する。実利用先deployは依頼範囲外。

## 2026-10-09: Webアカウント名のフォーカス確定・Escape取消

- 名前欄のフォーカスが外れた時にも即時確定し、確定前のEscapeで保存済みの名前へ戻す。Enter/専用ボタンを維持し、空欄/IME変換中の確定と同じ値の重複送信を避ける。名前変更と直後の削除/クリアを直列化し、非同期反映中に入力した次の編集を保つ。一般設定の保存とは独立する。
- 型検査/TS/Vite build成功。隔離した最終ソースのWeb GUIは`artifacts/web-applets-1791514657911/result.json`でok:true、11検証群。Tab/マウスのフォーカス移動、Enterと続くblur、Escape後の表示復元とaccounts.jsonのbyte不変、および既存の独立操作/下書き保持/警告/実Cookie削除/次回起動回収を確認。
- 最初のローカルpublishはwin-unpackedディレクトリのEBUSYで停止（`artifacts/web-account-name-edit-publish.log`）。同じrepoで「Gmail通知の起動先を修正」の作業が進行していることを確認し、ユーザーが通知修正の完了を待ってまとめて新バージョンのReleaseへ進むよう指定した。別作業の変更やプロセスを破棄/停止せず、完了後にcleanな統合ソースから新規Release Prepareを行う。

## 2026-10-09: 枠の削除で保存データを消去・回収し、ローカルpublishへ発行

- ユーザーの改善承認により、枠除去だけだった削除を保存データも消す動作へ変更。警告は取り消せない削除と次回起動時の後処理を説明し、キャンセルを既定とする。生成済みsessionはCookie/サイト/cache/HTTP認証cacheを消去して接続を閉じ、枠とpendingDeletionを同じatomic writeで保存する。未生成のsessionディレクトリは即時物理削除、生成済み/ロック中は次回起動のsession生成前へ回収を延期する。失敗は削除待ち記録を保持して再試行、登録/参照/同プロセス生成済みの枠は回収せず、削除済みsessionの終了時再flushも避ける。旧版の削除記録がない残存領域は自動削除しない。
- project-local Node/pnpmで型検査/build成功、全回帰121/121・失敗/skip0（`artifacts/web-account-delete-regression.log`）。追加の隔離試験ではロック失敗の注入→保存→再起動→回収、参照/生成済みガード、パストラバーサル・root/対象junction拒否・nested junctionの外側保持を確認。ソースWeb GUIは`artifacts/web-applets-1791513133518/result.json`でok:true。
- 最終固定win-unpackedのWeb GUIは`artifacts/web-applets-1791513398956/result.json`でok:true、11検証群。実Cookieの削除、取消での保持、削除待ち通知/記録、終了/次回起動後のディレクトリ消失、別枠Cookie/Gmail領域/設定byteの保持を追加確認。既存ページ/Gmail GUIは`artifacts/applet-pages-1791513407222/result.json`でok:true、5群。旧0.24.0の実Cookie移行も`artifacts/web-profile-migration-1791513596748/result.json`でok:true。
- ユーザー指定により`publish.bat`で本体/更新情報/全6Applet入りZIPをローカル発行。初回はZIPの最後のFile.Replace(null backup)だけが「置換されるファイルを削除できません」で終了1（`artifacts/web-account-delete-publish.log`）。対象の排他open/属性/ACLを確認し、同じ完成ZIPをstage内backup付きFile.Replaceで安全に置換できたため、発行スクリプトもこの方法へ修正。既存の再発行/不正入力時の前ZIP保持テスト1件成功、`pack:all-in-one`を再実行して終了0（`artifacts/web-account-delete-publish-recovery.log`）。PS1はUTF-8 BOM/CRLFを確認、BAT/ACLは変更しない。
- 最終単一EXEは`artifacts/web-portable-1791513417496/result.json`でok:true。`publish/AppDock.at365.exe`は100607357bytes、SHA256 `83a3de4872933cfa4415f86d23cb0e3b26c592b59aa1980f6daa614bb2d27cfc`、update.jsonと一致。ZIPは275730805bytes、SHA256 `18908c1bcb66c7e95e00e0855d3c4739089f35c30d3c5c72a97c5a2b2be95fc9`。既存verify-all-in-one.ps1で全inventoryのsize/hashを照合・隔離展開し、本体単体EXEと一致、6Applet収録を確認（`artifacts/web-account-delete-bundle-result.json`）。版は0.24.0の開発用ローカル生成物、今回の変更は未コミット、ユーザー指定によりGitHub公開は最後にまとめる。実利用先deploy/実サイトログインは実施していない。

## 2026-10-09: Webアカウント管理を独立ページ・即時操作へ変更

- 追加のソース確認: ユーザーの残存データへの質問により、deleteAccountは一覧からの除去だけでsessionディレクトリを削除せず、clearAccountもCookie等の消去APIのみでディレクトリ回収を行わないことを確認。削除した枠のIDは再利用されず、UIから操作できない残存データが生じる。自動回収は未実装と文書/AGENTSへ追記。今回の確認では製品コード/実利用データを変更せず、ビルド/GUIの再実行は不要と判断。

- 0.24.0公開後の追加依頼。設定に独立した「Webアカウント」カテゴリを設け、WebApplet側には使用枠の選択と管理ページへのリンクを残した。枠の一覧を`.appdock/web-applets/accounts.json`へ分離し、追加/名前変更/登録削除を設定draft/revision/saveと独立して即時保存する。削除/クリアはキャンセルを既定とするwarning dialogで確認する。保存済み/下書きの使用中枠の削除ガード、保存時の参照検証、旧設定のID/sessionを保つ初回移行を追加。詳細は[WebApplet](docs/web-applets.md)。
- project-local Node 24.21.0/pnpm 12.10.1で型検査、TS/Vite build、`dev.bat run dist:host`が終了0。回帰118/118・失敗/skip0（`artifacts/web-account-settings-regression.log`）、最終ビルドでWeb関連8件も成功。GUI/実EXEは隔離profileを使う通常Windows実行で確認した。最終GUI追加チェックの初回は試験側のボタン探索範囲が狭くtimeoutしたため、正しいサイドバーへ修正して再実行した。
- 最終win-unpacked GUIは`artifacts/web-applets-1791512094425/result.json`でok:true、10検証群。独立ページに保存バー/フォーム・JSON切替がないこと、即時追加/名前変更/削除と再起動、settingsのbyte/revision不変、正常/不正JSONの下書き保持とAppDock設定への帰還、削除/クリアのwarning・取消/確認、使用中枠のガード、共有枠の画面終了/Cookie消去と別枠/Gmail領域の保持、従来のWeb表示/遷移/入力保持を確認。dark/lightの管理ページPNGを目視確認。
- 既存ページ/Gmail GUIは`artifacts/applet-pages-1791511074248/result.json`でok:true、5検証群。旧0.24.0 EXEで実Cookieを作って新ソースへ引き継ぐ移行GUIは`artifacts/web-profile-migration-1791511299195/result.json`でok:true。旧一覧から専用ファイルへの移行、ID/session/Cookieの保持、移行後の即時名前変更でsettingsのbyte/revision不変を確認した。旧版の検証用コピーは`artifacts/web-account-legacy-0.24/win-unpacked`へ保持。
- 最終単一EXEは`artifacts/web-portable-1791512101750/result.json`でok:true。UI登録、リボン複数、Cookie分離/再起動/停止、WebContents/input保持、Gmail保存領域保持を確認。ローカルEXEは100608492bytes、SHA256 `d3550e719d5d9a916fb99afb5b117ee22127ef5ffb31d7400a2498eee4b12768`でupdate.jsonと一致。版は0.24.0のままの開発用生成物であり、公開済み0.24.0のEXEとは異なる。今回の変更は未コミット、GitHub公開/実利用先deploy/オールインワン再発行は未実施。実サイト認証・HTTP認証サイト固有挙動・長期背景動作は今回確認していない。

## 2026-10-09: WebApplet（0.24.0）の実装と公開前検証

- URLごとに本体管理のWebAppletを追加し、Applet一覧/リボン/コマンド/共有設定へ統合。最大64件、専用アカウント32枠、page/windowの載せ替え、固定/同じorigin/HTTP(S)遷移、認証用の明示originを実装。Gmailの設定・アカウント・session保存先を流用せず、リモートにはNode/preload/ホストIPCを公開しない。詳細は[WebApplet](docs/web-applets.md)。版は0.23.0→0.24.0。
- project-local Node 24.21.0/pnpm 12.10.1でmain/renderer型検査、TS/Vite build成功。回帰115/115、失敗/skip 0（`artifacts/web-applets-regression-final.log`）。通常sandboxでは既存.NET/TEMP置換試験のEPERMやElectron起動の制約が出たため、隔離profileを使う通常Windows実行で判定した。グローバルツールは追加していない。
- 最終ソースのWeb GUIは`artifacts/web-applets-1791491534872/result.json`でok:true、9検証群。UI登録とmanifestの自動name/icon/navigation、手動変更の再取得保持、same-origin redirect後の相対パス、別originへ取得要求を送らないこと、JSON容量制限、トップレベルのリンク/redirect/popup/固定モード、追加origin/any/履歴/ローカルキー、同じWebContentsでのpage/window切替と入力保持、専用Cookie分離/共有/保存、消去の取消/確認、無効化/削除時の破棄を確認。消去dialogの回答は試験profileのmain内でだけ置換し、製品の確認手順は維持した。dark/light画像と1000px幅の画面を目視確認。
- 既存ページ/Gmail GUIは`artifacts/applet-pages-1791491048430/result.json`でok:true、5検証群。ローカルページの所有command bridge、UI/session/input保持、Gmailの選択アカウント/検索/背景監視、リボン非表示/並べ替え、再起動・停止をオフラインfixtureで確認。Web GUIと単一EXE試験ではGmail保存領域のmarkerバイトも不変。実利用の認証情報を読み込まず、実メール送信/実サイトログインはしていない。
- コミット前の0.24.0単一EXE試験は`artifacts/web-portable-1791491242393/result.json`でok:true。実配布EXEの隔離コピー（SHA256 `9f8ee6a9bcd8067c77dee20965e19b48f83a99e7dbcc15dae4bc6f87667162e6`）を通常起動し、UI登録、well-known JSON、遅延生成、リモートのbridge不存在、page/window入力保持、toolbar履歴、複数ボタン、専用Cookie、再起動、停止、Gmail保存領域の保持を確認。このEXEは以後の終了時保存/取得処理の仕上げ前の検証物であり、最終配布物のハッシュとして扱わない。
- 正式公開にはclean mainを対象に[Release手順](docs/RELEASING.md)のPrepare→Draft→Publish→Verifyを使用する。今回の最終ソース/配布物/115件回帰/単一EXE更新/進捗/8停止点復旧/全Applet同梱とGitHub匿名取得照合の結果は`artifacts/release-0.24.0-web-20261009/plan.json`と隣のログへ保存する。Prepare後に固定したEXEでWeb GUI、既存ページ/Gmail GUI、Web portableも直列確認する。実利用先へのdeployは依頼範囲外、サイト固有の認証可否と長期背景動作は未確認。

## 2026-10-09: 更新通知変更をコミットしpublish.batで発行

- ユーザーの承認により、成功通知変更と関連文書/指示をmainの`3c8b4ef`へコミット。続けて`publish.bat`を実行し終了0、通常EXE/update.json/6Applet入りオールインワンZIPを発行。ログは`artifacts/update-notice-publish-2026-10-09.log`。版は0.23.0を維持、GitHub公開/push/実利用先deployは未実施。
- 通常EXEは100599103bytes、SHA256 `7b4486595d71bdf3d86cf6eb7bf860c02821aadc97c0d8cb897836248d31c9ce`。update.jsonのsize/hashと一致。ZIPは275723984bytes、SHA256 `cc2aaf9b7eedfd4fcdf699a731dc7082828dcac7650f51d0b006645b591f2594`。`artifacts/update-notice-publish-hashes-2026-10-09.json`へ保存。
- 固定した発行物でGUI試験を直列実行。配布win-unpackedの通知チェックは`artifacts/update-notice-1791486954229/result.json`でok:true。dark/light、自動/手動消去、main領域不変、フォーカス非奪取、失敗結果の継続表示、トレイ開始から開いたときの通知を確認。
- 単一EXEの隔離smokeは`artifacts/smoke-1791486973286/smoke-result.json`でok:true。オールインワンは全収録ファイルのsize/hash・本体単体EXEとの一致・各Applet更新ZIPとの一致を照合し、新規隔離フォルダーへ展開して通常起動。`artifacts/update-notice-bundle-result-2026-10-09.json`はok:true、6AppletすべてのID/版一致・初期無効・EXE隣に設定生成を確認。各Applet固有機能/実ログイン操作は今回再試験していない。

## 2026-10-09: 更新適用後のお知らせをステータスバーへ移動

- mainの既存cleanなcheckoutで、起動時結果の成功だけを左下のミント色のピル型通知へ変更。本文/リボン/ネイティブWebページの領域に重ねず、約5秒でフェードアウトし、×で即時に閉じる。失敗結果と更新中の進捗は従来の上部表示を維持。配布形式・更新用helper・設定保存形式は変更していない。
- project-local Nodeでmain/rendererの型検査とTS/Vite build成功。既存`tests/portable-updates.test.cjs`12件成功、失敗/skip0。sandbox初回の4件はhelperのTEMP操作にAccess denied/EPERMが出たため、通常Windows環境で再実行して12/12を確認。
- 隔離したElectron開発起動のGUI検証は`artifacts/update-notice-1791485945591/result.json`でok:true。dark/lightで22pxの通知がfooter内に収まり、隣の操作と重ならないこと、表示時のフォーカスを奪わないこと、自動消去前後のmain領域一致、手動消去、失敗結果の継続表示、トレイ開始から5秒以上後にWindowを開いても通知が表示されることを確認。両テーマのPNGを目視確認。
- 非表示でもdocument.hiddenがfalseだったため、BrowserWindow実状態をsnapshotへ渡してtimerを制御。初回GUI起動はsandboxで失敗、通常Windows環境で検証。GUIで更新結果fixtureだけを書き、実ファイル交換・実メール/ログイン操作は今回実行していない。単一EXE再発行・実利用先deploy・commit・push・Releaseは未実施。

## 2026-10-09: publish.batでオールインワンZIPを生成

- ユーザー指定の「Appletは拡張として同梱」に対応。cleanなmain 8a4d96eから`codex/all-in-one-package`を作成。`publish.bat`が呼ぶ`dist`を本体発行`dist:host`と`pack:all-in-one`へ分割し、単一EXEと更新JSONに加えて`extensions/<repo名>`入りZIPを生成する。BAT自体・文字コードは未変更。本体の版/API/UIコードは0.23.0のまま。
- 新しいPowerShell処理は兄弟直下の`.git`/manifestを持つ全repoを対象とし、各publish.batを直列実行。ID/正式版/最低本体版の事前検査、feed/ZIPのsize/SHA256、展開後manifest/entry照合、commit/dirty/全ファイルhashのbundle.json、完成後のZIP置換を実装。失敗時に以前の完成ZIPを保持する。本体側の設定/認証/ログは収録しない。
- `publish.bat`の実実行は終了0（`artifacts/all-in-one-publish-final.log`）。本体/.NET helper/TS/Vite/portableと全6Appletの再発行、オールインワン生成まで通した。初回はWindows PowerShellの環境でGet-FileHashが解決できず失敗したため、.NET stream/SHA256へ変更して最初から再実行した。pnpm/依存/グローバル設定の変更なし。
- `tests/all-in-one.test.cjs`成功、終了0（`artifacts/all-in-one-tests.log`）。実helperを使った隔離fixtureで正常発行、変更したAppletの再発行/既存ZIP置換、発行exit19・改変ZIP・最低host不足・ID重複による失敗と以前のZIPのhash保持を確認。
- ZIPは275724048bytes、SHA256 `92a17694df699133353dc43160b68dc76eded545b4766b8b9621f13ac45f345c`。`artifacts/all-in-one-package-result.json`はok:true。本体EXE/bundle.json/6Appletの計22ファイル、収録一覧/全size/hash、本体単体EXEとの一致、各Appletの更新ZIP全ファイルとのバイト一致を確認。発行時のローカルソースを記録しており、GitHub既存assetとの一致を要求するものではない。
- ZIPから新しい隔離profileへ展開して通常起動。`artifacts/all-in-one-ui-1791481347816/result.json`はok:true、終了0。Gmail0.9.0、Wallpaper0.4.0、Watch0.1.1、WebBrowserTools0.2.4、WindowMover0.2.1、WindowsTools0.1.1をすべて認識、初期無効/エラーなし/EXE隣に設定生成/既定GitHub更新元を確認。about画面の画像を目視確認。各Appletの固有機能・実ログイン操作は今回再試験しない。
- README/DEVELOPMENT/[発行ガイド](docs/all-in-one.md)を更新。通常更新feedは単体EXEのまま、オールインワンZIPは初回導入用の追加assetとする。既存GitHub Releaseの上書き・新規公開・実利用先deploy・main統合は未実施。

## 2026-10-09: v0.23.0 更新配布物・進捗・中断復旧

- ユーザーの「順番に」「2は全部が終わったら確認する」指定に従い、1のApplet発行標準化、3の進捗/キャンセル、4の異常中断復旧を実施。2の実GitHub/HTTP(S)/UNC配布先確認はユーザー担当として[チェックリスト](docs/update-checklist.md)へ分離。AppDockは既存`codex/portable-updates`の5460b1e、6Appletは各cleanなmainから同checkoutの`codex/update-packages`で作業。worktreeは作らない。
- 全6Appletの`publish.bat`に共通.NETパッカーを接続し、各repoの`publish/update.json`と`publish/update.zip`を生成。6件終了0、ID/版/entry・サイズ/SHA256・ZIP内全ファイルと発行元のバイト一致を確認。Gmail8、Wallpaper2、Watch2、WebBrowserTools2、WindowMover3、WindowsTools3ファイル。Watchの旧DLL/埋込済みフォント、DLL型2種の同梱不要SDKを明示名で整理して再発行。`artifacts/applet-update-packages.json`と各`*-update-publish.log`に結果。Applet本体の版変更・deploy対象の追加なし。
- 共通進捗UI、取得容量/全体/件数とキャンセルを追加。HTTP/ローカルstream・展開子プロセス・ハッシュ読込へ中断を伝播し、インストール先交換前のTEMP準備だけを停止する。確認ダイアログへ進んだ後はその取消ボタンを使う。準備中断後の再試行とチェックのみの取消を追加テストで確認。
- helperは準備前のjournal、全交換後のcommitted記録、JSONのFlush(true)、全復旧対象の事前検証を追加。commit前は旧版へ戻し、commit後は新版を検証して後片付け。ロック等で復旧できないときはjournalと旧ファイルを保持する。
- main/renderer型検査、TS/Vite、.NET helperとportable発行成功。プロジェクト内Node24.21.0と既存依存を使用。最終回帰103/103、失敗/skip0（`artifacts/update-completion-regression.log`）。更新専用12件には実HTTP中断とsocket終了、再試行、metadata取消、危険なjournalの全体検証も含む。パッカーや旧交換/ZIP検証も成功。
- `artifacts/update-progress-1791476360616/result.json`はok:true。配布win-unpackedの隔離profileとループバックHTTPで、実IPC/streamの進捗、dark/lightの容量とprogressbar、キャンセル→再試行→最終確認取消、元ファイル保持を確認。両テーマ画像を目視確認。初回のDOM進捗待ち不足は、mainの進捗に加えてDOMのprogress値も待つよう試験を修正した。
- `artifacts/update-recovery-1791476324622/result.json`は8停止点すべてok:true。artifactsへコピーしたhelperソースにだけ停止点を挿入し、実プロセスを停止→製品helperで復旧。7点は旧版、commit後1点は新版、再実行の同じ結果、設定/認証fixture保持を確認。7点目では本体ファイルを別プロセスが使用中の失敗→journal/backup保持→解除後復旧も成功。初回の試験用ロック処理の挿入失敗はCRLFを正規化して修正。製品に故障注入スイッチなし。実電源断/ディスク障害の試験ではない。
- `artifacts/portable-updates-1791476387252/result.json`は9条件ok:true、終了0。実.NET Applet一括交換、実単一EXE交換/再起動、個別同版再適用、設定/認証fixture/無効状態保持、起動時metadata確認だけ、トレイ開始ONからの更新/通常再起動でabout/一般/Appletページ復元を確認。最終native確認ダイアログだけ試験内で差替え。`artifacts/navigation-1791476399630/result.json`も成功。
- 最終EXEは100596899bytes、SHA256 `71FAA4C6670D2662F195936F45D9FBFFDE13F73D9136BB9869CDC14CE1B8BF02`。feedの版/サイズ/hashと一致、最終asarのmain/portable-updates JSおよび同梱helperが検証した出力とバイト一致。ビルドログは`artifacts/update-completion-build.log`。Prettier、Git差分、ローカル文書リンク、PowerShellのBOM/CRLFを確認。BATは未編集。
- 実利用先deploy・main統合・push・GitHubへの公開は行っていない。実GitHub/HTTP(S)/UNC配布先の到達性・公開設定・実ログインデータでの確認はユーザーの後日確認として残す。

## 2026-10-09: v0.22.1 更新UIと再起動先の復元

- ユーザーが0.22.0の実再起動成功を報告。既存codex/portable-updatesのcleanな0369100から継続し、同じcheckoutで実装。更新/一括/個別の主操作をラベンダー色にし、共通設定/実行環境/各Applet更新元を折りたたみ、Applet更新元をインストール済みカードへ移動。本体/各Appletに既定復帰、未保存時は確認も含めて操作を無効化。下端のステータスバーは小さいボタンを維持。
- 通常再起動/helper再起動で--restore-viewを渡し、トレイ開始ONでも表示。ページ/設定カテゴリ/選択Applet/タブ/ログ対象をプロフィール内へ保存。Appletページは起動完了後に既存コマンドで開く。終了時のsurface破棄通知が保存先をホームへ変えていた不具合も修正。
- main/renderer型検査、TS/Vite、portable発行成功。取得済みプロジェクト内Node/TypeScript/Viteを使用（dev.batのpnpmポリシー検証は停止していたため中断、依存/ポリシーの変更なし）。既存.NETホスト/helperは変更せず再使用。回帰100/100成功（artifacts/update-ui-regression.log）。
- GUI: navigation-1791474293115、preferences-1791474300038、ui-1791474721303、host-commands-1791474669899はいずれもok:true。既存設定共有/保存/JSON/ショートカット/正常終了/多重再起動防止を確認。
- 最終portable試験 artifacts/portable-updates-1791474708972/result.json はok:true、終了0。通常起動はトレイ非表示、dark/light・900pxの横はみ出しなし、初期折りたたみ/主操作/本体とAppletの既定復帰/保存・破棄/下書きガードを確認。実helperで.NET DLLを含む一括更新→本体EXE交換→個別同版更新を通し、毎回の設定/認証fixture保持と更新画面復元を確認。通常再起動で一般カテゴリとlocal Appletページも復元し、元のPID終了と新PIDを確認。
- 試験の最初の通常再起動visibility検査はstartupReadyを待たず失敗し、待機条件を修正。続くAppletページ復元の失敗は製品側の終了通知による上書きを修正して解消。最終native確認dialogだけ試験内で承認に差替え、製品の確認処理は維持。
- 単一EXE100596499 bytes、SHA256 2E6C7540E17A5593AE18F999BCFB27694A017826EC7F27AD7D654D6ACC24C43E。update.jsonの版/サイズ/hash一致。packaged main/core JS・helperのバイト一致と文書27 local linksを確認。画面画像を目視確認、Prettier/diff check成功。
- 境界: 実UNC/実GitHub配布の取得、実Gmail内の操作/メール状態は今回試していない。画面復元は新版が保存する画面選択が対象で、旧0.22.0から初めて更新するときの未記録の画面やWebページ内部の状態/未保存フォームは復元しない。実利用先deploy/main統合/pushなし。

## 2026-10-08: worktree削除後のpublish.bat失敗を修復

- 原因は共有node_modules内のpnpm生成参照。削除済みの`AppDock.at365.worktrees/applet-settings-panel`を指す12個のパッケージjunctionと24個の`.bin`起動スクリプトがmainに残り、ビルドツールを解決できなくなっていた。既存パッケージ本体・依存版・lockfileを維持し、存在するmain側の同一パッケージへの参照へ修復。全置換先の存在と対象パスを事前確認し、古い参照が残っていないことを確認。
- `dev.bat run typecheck`と、ユーザーが実行した入口の`publish.bat`が終了コード0。.NET framework-dependent発行、TypeScript/Vite、portableの単一EXE作成まで成功。Electron/TypeScript/Vite/electron-builder/Playwrightはmain配下から解決できる。
- 発行後の単一EXEをコピーして`dev.bat exec node scripts/smoke.cjs publish/AppDock.at365.exe`を実行。`artifacts/smoke-1791469453906/smoke-result.json`はok:true、終了コード0。起動・トレイ操作・設定/プロフィール画像保存・キー・正常終了を確認。初回`smoke-1791469407880`だけ設定ファイルrenameのEPERMで失敗し、同じEXE・スクリプトでの再試行は成功。初回の一時エラーの原因は確定していない。
- 発行版win-unpackedの`navigation-1791469464113/result.json`はok:true。設定アクション、未保存下書き/JSON/外部競合、説明/設定切替の座標と見た目、dark/light・大小画面、ログの既存遷移を確認。
- 最終`publish/AppDock.at365.exe`: 100574613 bytes、SHA256 `CEED52AE034DAE0867DD0846DF740A14951822BC6DD668551F07B760EBA6609F`。portable試験へコピーしたEXEとのSHA256一致を確認。実利用deploy・外部pushなし。
- 前の統合作業はmainの071fa3bまで完了。worktreeは削除済み、`codex/applet-settings-panel`ブランチとmainへ引き継いだ検証資料は保持。今回の依存参照修復はGit管理外で、再発防止手順をDEVELOPMENT.mdへ記載。

## 2026-10-08: Applet設定パネルへ最新mainを取り込んで統合

- ユーザーの指定により、共通設定パネルと説明/設定ボタン配置の変更をdc49658へ保存し、mainのc9b185a（設定アクション）をcodex/applet-settings-panelへ取り込み。自動マージで競合なし。既存のsettingActionsの型/検証/フォーム実行と文書・試験を保持し、共通設定パネルでも利用できる状態を確認。
- main/renderer型検査、TS/Vite build、framework-dependent .NETホスト発行成功。ホスト回帰91/91、失敗0（worktreeのartifacts/integration-regression.log）。依存更新なし。
- worktreeの隔離GUI navigation-1791468074781/result.jsonはok:true。mainのsettingActionsを宣言するNode fixtureで、詳細設定パネルの操作成功/失敗と未保存値の保持・自動保存されないことを確認。ボタン/見出しの位置と装飾、大小画面・両テーマ、JSON・下書き・競合・ログの既存動作も成功。
- ui-1791468081369/result.jsonとpreferences-1791468083979/result.jsonもok:true。Node/.NET起動・停止・設定保存と再読込、プロフィール画像、キー、再起動後の永続化を確認。Prettier/diff check成功。mainから入ったCSSの空白を整形し、再ビルド後のrenderer資産ハッシュはGUI確認時と同一。
- 検証済みのブランチをmainへfast-forward統合。検証結果・画像・回帰ログをmainのartifactsへ引き継ぎ、ユーザーの追加指定でworktreeを削除する。作業ブランチは履歴として保持。実利用の設定・認証・壁紙・Windows設定は操作せず、今回の単一EXE再発行/deploy/外部pushは実施しない。
- main統合後のTS/Vite buildも成功し、renderer資産はworktreeで検証したものと同一。mainのtray-ui-1791468482091もok:true。追加smokeはWindowsのwindowsHide:trueで初回表示判定に失敗し、3秒待機でも解消しなかった。試験の起動をwindowsHide:falseへ変えるとsmoke-1791468728937/smoke-result.jsonでトレイ・フォーム保存・アバター・キー・終了が成功。製品の表示処理は変更せず、scripts/smoke.cjsのUI試験起動だけを修正。待機処理の試作と生成JS診断は除去。途中の旧0.21.0単一EXEによる対照試験は設定renameのEPERMで未達となり、今回の成功結果には含めない。

## 2026-10-08: v0.21.0 Applet詳細の共通設定パネル

- 追加調整: 「設定を開く／説明に戻る」をヘッダー直下の共通操作列へ移動し、同一のsecondaryボタン・アイコン・幅でラベルと動作を切り替えます。ボタンより下だけ説明/設定が変わります。ログは従来の移動先・フィルター・説明側の入口を維持。ユーザーの将来の説明/設定/ログタブ案は今回は実装しません。
- 追加調整のmain/renderer型検査とVite build成功。隔離Electronの`artifacts/navigation-1791467373616/result.json`はok:true。dark/light・1280/900pxで切替前後のボタン座標/サイズ/背景/文字色/枠/余白と見出しの座標/サイズが一致し、長いフォームの保存ボタン表示、下書き・JSON・外部競合・ログ移動の既存確認も成功。切替前後の画像を目視確認、Prettier/diff check成功。初回GUIで設定側の見出し幅が縮むことを検知し、旧grid由来のalign-items:startをflexのstretchに変更して解消。今回の変更は既存worktree内だけで、main/他の未完了作業には触れず、追加発行/deploy/commit/統合/pushなし。
- AppDock mainのe4b32e7から専用worktree `AppDock.at365.worktrees/applet-settings-panel`、ブランチ`codex/applet-settings-panel`を作成。元の作業ツリーで進行中の別作業には触れていません。
- 「設定を開く」はAppletページ内の説明→設定切替へ変更。「説明に戻る」で復帰し、詳細のショートカット入口は削除。設定ページのApplet別設定は保持し、同じAppletSettingsPanelと共通編集セッション/保存操作を使用します。全下書き・JSON・プロフィール画像・revision競合を保持します。
- main/renderer型検査、Vite build、既存.NETホストのframework-dependent発行に成功。ホスト回帰90/90、失敗0（artifacts/regression.log）。追加API/設定形式/依存更新はありません。
- 隔離Electron画面 `artifacts/navigation-1791464805381/result.json` はok:true。説明/設定切替、ショートカット入口統一、双方での下書き共有・保存・破棄、複数Appletの編集、数値検証、停止中のキー保持、正しいJSONの引継ぎと不正JSONの保持、外部変更競合時の上書き拒否、24Applet、長いフォーム、dark/light、1280/900px、保存ボタンの常時表示、横はみ出しなしを確認。画像も目視確認。
- 既存UI回帰 `artifacts/ui-1791464724997/result.json` とプロフィール/キー/保存/再起動回帰 `artifacts/preferences-1791464764546/result.json` はok:true。後者は名前・画像選択/上書き・不正画像拒否と再起動後の永続化を含みます。
- Prettier、git diff --checkに成功。変更したREADME/DEVELOPMENT/host-developmentのローカルリンク64件で欠落0（worktree外の兄弟Applet参照は元repo配置で照合）。
- 検証時の修正: JSON編集後に保持済み詳細設定へ復帰した際も表示前に変換する処理を追加。不正JSONは説明へ戻して修正を案内。既存ui-testのリボン期待値に、既に存在する「テーマを切り替え」を追加。新しいJSON試験の2つのalertは表示先を指定して照合。
- 実行環境の制限: dev.batのpnpm検証が進まなかったため中断し、取得済みプロジェクト内Node/TypeScript/Viteで同じビルド・検査を実行（依存取得/ポリシー変更なし）。sandboxの.NET発行は失敗し、許可されたWindows環境で成功。回帰の初回sandbox TEMPでのrename等の失敗は、worktree内TEMPを指定して90件すべて成功。
- 今回はworktree内のソースと隔離fixtureによる確認です。単一EXEの発行・実利用先deploy・実Applet/実アカウント操作・main統合・commit・pushは行っていません。

## 2026-10-08: v0.20.0 Gmailのナビゲーション・リンク設定

- ユーザーが今回の動作を確認したと報告し、マージを指定（2026-10-08 JST）。両repoのcodex/gmail-toolbar-commandsをmainへfast-forward統合（AppDock a737ae5 / Gmail d3fc1c4）。統合直後のGit treeは検証済みブランチと一致。報告は今回全体の動作確認として記録し、個別のWindows通知などの検証範囲は推測しない。追加の製品コード変更・再発行・deploy・pushなし。
- ユーザーの正常動作報告とマージ指示を受け、前回0.19.0をmainへFF統合（327a88a）。Gmailも0.8.0をmainへFF統合（918fb59）。今回は両repoのcodex/gmail-toolbar-commandsで実施。
- Node APIにcontext.webAccounts.navigate(back/forward/reload/inbox)を追加。自身の実行中Appletだけを対象にし、UIのnavigateと同じ選択中Viewを操作する。invalid actionはView作成前に拒否。snapshot.navigationRevisionで操作画面が受信トレイへ戻れるようにする。
- webAccounts.externalLinkSettingは自身のboolean設定キーとsettings capabilityを必須にする。既定の確認を保持し、対応Appletのダイアログへ「次回から聞かずに開く」を追加。開く＋チェック時のみ設定を保存。trueならHTTP(S)/mailtoの確認を省略し、資格情報や他スキームは従来どおり拒否。重複した確認を抑制し、外部起動の失敗はログへ報告する。
- main/renderer型検査・Vite・framework-dependent .NET host/portable発行成功。ホスト回帰90/90、Gmail型検査/Vite/21/21成功。Prettier・diff check、文書ローカルリンク109件でmissing0。
- 最終win-unpackedとGmail0.9.0の../Applet.Gmail.at365/artifacts/toolbar-1791463003042/result.jsonはok:true。アイコン/tooltip/版、4コマンドと既存clear、選択枠の履歴・reload・受信トレイ・変更キー、全タブのtoolbar/一覧位置、UI↔host設定、外部リンクの取消/一度開く/記憶/再確認/再起動、未読だけ保存・再起動保持を確認。外部アプリはshell呼出しを記録するfixtureへ置換し実起動しない。
- 通知は既にGmail openコマンドを指定していたため契約を継続。新GUIは実Electron Notificationオブジェクトのshowだけを抑止し、clickイベントから実ホスト・workerコマンドを通して、本体最小化からGmailページを復元、Window設定では隠れたGmailを表示、停止後の古い通知はAppletを起動しないことを確認。Windowsネイティブ通知の実表示/人手クリックは今回未実施。
- 最終版のaccounts-1791463014150、ui-features-1791463063443もok:true。既存の設定同期/再起動/監視/音/検索/未読・削除/切替キー/位置保持を確認。画像を目視確認。
- 最終単一EXE+未改変Applet: ../Applet.Gmail.at365/artifacts/portable-1791463095688/result.jsonはok:true/host0.20.0/exitCode0。ページ・新着・履歴・クリア・停止/再開・隔離・正常終了を確認。
- publish/AppDock.at365.exeは100573045 bytes、SHA256 F777FCCF41408145C5DBD77B61BD8E0577DD303EC82EEC6CDB2E52BB3F4F54C9。実利用deploy/外部push/実Google操作は未実施。
- 初期GUIの修正: ElectronApplication.evaluateはElectron moduleが第1引数なので、カウンター比較用の引数を第2引数へ直した。ロード完了を待ち、変更キーはWebContents.sendInputEventで確認。停止状態名は既存stoppedを使用。初期の型エラーと未読フィルター解除箇所を修正し、最終版の全試験で成功。

## 2026-10-08: v0.19.0 リボンの上下配置・セパレーター

- 指示により前回のcodex/applet-pages-ribbonをmainへfast-forward統合（da2bdc1）。Gmail側もdbe84beをmainへ統合。新しい作業は両repoのcodex/ribbon-layout-gmail-polishで実施。
- リボン設定へ上寄せ/下寄せ、グループ内順番・表示、セパレーターの追加/削除/配置を実装。登録と参照を検証し、削除時はorder/hidden/bottomからも除去。未導入Appletの設定を保持。古いorder/hiddenを持つ設定は既存配置を保持し、初期化はtheme/profileを下寄せにする。
- 「AppDockのキー」を「AppDock」へ変更し、「Applet別の設定」の先頭へ移動。下書き・JSON保持・全保存・検索・所属/競合処理は既存経路を使用。
- main/renderer型検査・Vite build、ホスト回帰89/89、Gmail型検査/Vite/21/21成功。Prettier、git diff --check成功。ローカルツールによるpublish.batも成功。
- 最終win-unpackedのscripts/ribbon-layout-ui-test.cjs: artifacts/ribbon-layout-1791458897839/result.json（ok:true）。上下の実配置、セパレーター追加/削除/移動、グループ間ドラッグ、上下順番、再起動保持、削除時の参照除去、初期化、本体キーの名称/位置/検索、Gmail UIの不要要素削除と本文/先頭アカウントの上端を検証。通常幅と900×640、本体ページで横はみ出しなし。画像も目視確認。
- 開発版設定GUI: artifacts/navigation-1791458862311/result.json（ok:true）。24 Applet、複数下書き、JSON/外部更新保持、所属/競合/停止後のキー、検索/フィルター/狭幅/両テーマを確認。Gmail別Window GUIは../Applet.Gmail.at365/artifacts/gui-1791458866882、UI機能はui-features-1791458910659で成功（切替キー・個別session・音・新着/削除・位置/最大化保持）。
- 最終単一EXE: ../Applet.Gmail.at365/artifacts/portable-1791458903951/result.json（ok:true/host0.19.0/exitCode0）。未改変Gmail0.8.0でページ表示・新着・履歴・クリア・停止/再開・隔離・正常終了を確認。
- publish/AppDock.at365.exe: 100576430 bytes、SHA256 816DE9044DA45A44B361182FA0044ED08F4B2FC664CA796416743ACD31787842。.NET hostは既存手順のframework-dependent発行。実利用deploy/外部push、実Google操作・実メール送信は未実施。
- GUI初回のグループ間drag試験は移動元/先が別スクロール領域になり誤った行へ入力したため失敗。試験中のみzoomを下げて両端を可視化し、drag-handleから実マウス操作を再実行して成功。最後のGUIはzoomを通常へ戻して配置/画像を確認。Gmailボタンの同名設定入口はリボン内にscopeを限定。

## 2026-10-08: v0.18.0 Appletページとリボン

- 専用ブランチ`codex/applet-pages-ribbon`。manifestのpages（local/web-accounts）、Node/.NETのページopen API、限定ローカルUI、共通AppletSurfaceを追加。リボンの標準/導入Appletボタンを表示・非表示/ドラッグ/上下で編集し、設定と並び順を保存。設定ボタンを隠しても右クリックから戻れる。Appletごとの表示方法と独立Window状態を保存する。
- 同じUI WebContentsViewとアカウントWebContents/sessionをpage/window間で共用。ページのclient領域、command palette中のView取り外し、非選択/最小化のbackground parkを確認。ホームを表示中のcycleは、ホストWindowがアクティブでも入力を奪わないようSurfaceの表示状態を検査する。
- TypeScript main/renderer型検査・Vite、ホスト回帰88/88、Gmail回帰21/21、SDK/Runtime Release（警告0/エラー0）成功。publish.bat成功、.NET ExtensionHostはframework-dependentでcoreclr等のRuntime混入なし。プロジェクト内の既存Node/pnpmのみ使用。
- 最終win-unpackedの`scripts/applet-pages-ui-test.cjs`: `artifacts/applet-pages-1791456311809/result.json` ok:true。汎用ローカルページ、実幅、同じページ再open、入力保持、page→window→page、UI/remoteのbridge分離、Gmailの検索/選択/同一WebContents/Cookie保持、ホーム/最小化中の新着、ホーム中のcycleフォーカス保持、リボン設定の再起動保持、非表示ページのcommand起動、停止時全View破棄とホーム復帰を確認。リボン設定画像を目視確認。
- 同じ変更の発行版Gmail GUI `../Applet.Gmail.at365/artifacts/gui-1791455738683/result.json`、UI/キー/音/位置保存 `../Applet.Gmail.at365/artifacts/ui-features-1791455988932/result.json` はok:true。通常Electron・Playwrightなしのpacked-core試験 `../Applet.Gmail.at365/artifacts/native-background-1791455805763/result.json` はok:trueで、2枠の初回描画/サイト自身の継続更新/非表示reload/認証先で解除/停止時破棄を確認。
- 最終EXE: 100574904 bytes、SHA256 `E21E8A05CFBE35CC5281F6825CC867739D2325CFA43DDCC0FEE89D2C9E997EF4`。単一EXEの通常起動/CDP試験 `../Applet.Gmail.at365/artifacts/portable-1791456361645/result.json` はok:true/version0.18.0/exitCode0。未改変Gmailのページ表示/新着履歴/クリア/停止・再開/正常終了を確認。
- Prettier/diff check、更新文書のローカルリンク96件を確認。既に消えていた旧Applet.GmailCheckerへのリンク4件も現行Gmailの案内へ更新。
- 検証上の修正: ページ領域が既存max-width/margin:autoにより幅1pxへ縮んだためwidth:100%/max-width:noneを指定。GUIの旧Window直下View/仮名セレクターを現在の構成へ更新。再起動fixtureはアカウント起動前に登録し、Cookieは永続期限を指定。sandboxのTEMPではrename権限が不足するためプロジェクト内TEMPを使用。Electron GUI/発行は許可されたWindows実行環境で確認。単一EXEをElectron.launchへ直接渡す詳細試験は起動フックで180秒timeoutしたため除外し、win-unpacked詳細試験と通常EXE起動後のCDP接続を使用。
- 実Googleのログイン/実受信・実複数アカウント操作・長時間/スリープは今回未実施。実利用先deploy・mainへの統合・外部pushは行っていない。

## 2026-10-08: v0.17.1 WebアカウントUIから自身の設定を変更

- ユーザーが設定タブの正常動作を確認したと報告し、Gmail側と合わせたコミットを明示指定（2026-10-08）。検証済みコードを変更せず、確認報告と今回の実装・文書をコミット対象にした。

- ローカルUIへsnapshot.settings/setSettingを追加。自身のmanifestの宣言済みboolean/静的selectとsettings capabilityに限定し、既存SettingsStoreの保存/競合検出/変更通知を使用。停止時は購読解除。リモートページ・他Applet・ホスト全体の設定は非公開。
- dev.bat run typecheck、dev.bat run test（85/85）、dev.bat run dist成功。変更したコードのPrettierとgit diff --check成功。.NETホストは既存スクリプトでクリーンなframework-dependent発行、DLLはAppDock.ExtensionHost/Runtime/SDKのみ。
- Gmail0.6.0の発行版GUI ../Applet.Gmail.at365/artifacts/accounts-1791452824168/result.json成功。設定共有・双方向同期・監視停止/再開・保存後再起動・未宣言キー/型拒否・既存アカウント管理を確認。
- 実単一EXEの../Applet.Gmail.at365/artifacts/portable-1791452888173/result.jsonはok:true/version0.17.1/exitCode0。EXE100567486 bytes、SHA256 19C334ECEBFC849AA821DC361F77D3B275939A84AD757BF60FE6D2674E2BFD6D。実利用先への配置・実Google操作・commit/pushなし。

## 2026-10-08: v0.17.0 ウィジェット機能を削除

- ユーザーが変更内容の確認完了を報告し、コミットを明示指定（2026-10-08）。今回の削除・回帰確認・文書をmainへコミット。コードは上記依頼で検証したままで、コミット時の追加変更はこの確認記録のみ。
- ユーザー指定により、ウィジェット画面・ホームの表示・配置設定・専用IPC/preload・フォント配信・デスクトップ固定/移動・日時描画・Node API・.NET SDK/Runtime・専用試験/ガイドを削除。互換APIは残さない。Watchの現行native EXEに合わせて利用者/開発文書を修正。過去の検証記録は当時の実測として保持。
- `dev.bat run typecheck`成功、`dev.bat test`は85/85成功。設定保存の回帰では旧トップレベル配置を除去し、テーマ・キー・ピン・トレイ・プロフィール・Applet固有データ（同名のwidgetsキーを含む）が保持されることを確認。定義済みのトップレベル項目だけを保存し、Applet設定内部は変えない。
- `dotnet build AppDock.at365.slnx -c Release`成功（警告0・エラー0）。復元済みWatchも新SDK/Runtimeに対するRelease build成功（警告0・エラー0）、回帰8/8成功。Watchリポジトリのソース・manifest・発行物は変更しない。
- `publish.bat`成功。生成済み`out/main`を整理してからコンパイルするbuild-main.cjsを追加し、古いモジュールの同梱を防止。最終app.asarはversion=0.17.0、名前にwidgetを含むモジュール0件。framework-dependent .NETホストにcoreclr/hostfxr等のランタイム混入なし。
- 発行版win-unpackedを使う`ui-1791443748554`成功。ホーム/同梱専用fixtureによるNode/.NETの起動・コマンド・停止、フォーム/JSON保存、不正JSON保護、手動再読込を確認。ナビゲーションはホーム・Applet・設定・ログの4ページ、widget操作API/HostSnapshot/設定の配置項目なし、BrowserWindowは本体1つ。home.pngでホームとサイドバーを目視確認。
- 発行版`navigation-1791443751234/result.json`はok:true。設定編集中の画面移動・変更保持・キー・パレット・ログ・24Appletの一覧・大小画面・両テーマのレイアウト成功。`tray-ui-1791443823904`もok:true、既存の表示選択・単クリック/ダブル・Windows判定時間・再起動保持成功。
- 最終単一EXEの`smoke-1791443817043/smoke-result.json`はok:true。設定/アバター/ピン/キー/トレイ/正常終了成功。試験コピーと発行EXEのSHA256一致を確認。`smoke-1791443919058`では復元済みWatch 0.1.1 native EXEを隔離配置し、起動・3コマンド・表示/非表示・visible保存・パネル・終了を確認。実利用の設定/認証/プロセスは操作しない。
- 最終EXEは100566507bytes、SHA256 `16AD48FA3175AA33CE844E550F0A878E1B1DFEF00E6E05D06A681B9DDBCE186C`、FileVersion/ProductVersion 0.17.0。Prettierとgit diff --check成功。実装内のwidget参照0件、残る言及は削除説明と回帰確認だけ。実利用先へのdeploy・pushなし。
- 検証途中の失敗は成功扱いしない。publish完了前の最初のportable smokeは旧0.16.4のコピーだったため除外し、最終EXEで再実行してハッシュ一致を確認。Watch buildの最初のcsproj名誤指定は正しいApplet.Watch.csprojで修正。asarの直接requireはpnpmの依存境界で失敗し、electron-builder→app-builder-libのcreateRequire経由で検査。復元されたWatchの旧test-ui.cjsはProcess failed to launchで実行できず、現UIと古いセレクターも異なるため、そのGUI試験の成功は主張しない。新ホストとのnative接続/コマンドは既存のportable smokeで確認。全モニター/DPI・実デスクトップ描画の詳細・長期常駐/スリープは今回未検証。
- 通常execのhelper_unknown_errorは許可されたWindows実行環境で作業・検証。開始時mainはclean、既存Applet/別作業の変更破棄なし。

## 2026-10-08: v0.16.4 通知領域のアイコン識別を更新間で維持

- ユーザーが修正版の正常動作を確認したと報告（2026-10-08）。その確認を受け、今回の修正と検証記録をコミット。利用者の確認は自動試験の結果と区別し、全OS版の表示位置や将来の実利用更新まで検証済みとは扱わない。
- 旧版はTrayのGUIDがなく、electron-builder26.15.3のportable展開先がbuildごとに変わっていた。Windows NotifyIconSettingsでも複数の旧TEMPパスに個別のIsPromoted=1があり、ユーザーの毎回ピン留めの報告と整合。タスクバーの固定AppUserModelId/元EXE参照は維持。
- 新ランチャーはTEMP/外側EXE/test-profileから版番号を含まないSHA256の展開先を生成し、Trayは実行パス/保存先からUUID v5を生成。異なる配置/隔離profileには別ID。gateとkernel leaseで使用中の再展開を避け、子へleaseをDuplicateHandleする。再起動/二重起動/ランチャーだけの強制終了後も保護し、最後の終了で生成領域を整理。
- 型検査・Vite・ホスト93/93成功。最終通常圧縮EXEを使う`tray-identity-1791441890232/日本語 profile/result.json`はok:true。0.16.4から別metadata版0.16.4-tray-updateへの置換前後で、実行パス・GUID・Windowsの登録キー・IsPromoted=1が一致。通常再起動、2つの同時起動で本体PID/資産保持、コマンド再起動、ランチャーだけの終了後の本体保護/再接続、次回の回復と最後の生成領域削除を確認。専用アイコンのテスト表示設定は元へ復元し、実利用の設定は変更していない。Windows設定画面での利用者のピン操作/全OS版の表示位置は未確認。
- 既存トレイGUIのtray-ui-1791441841077はok:true。クリック/ダブルクリック/メニュー/保存/再起動後の設定が成功。最終配布EXEのhost-commands-1791441961159もok:true/portable:true。パレット再起動、新PID、重複再起動防止、設定保持、終了キー、Applet deactivateと全host/worker終了を確認。
- 初期の検証エラー: StdUtilsのプロセスハンドルはhProc:<hex>というタグ形式だった。数値HANDLEへ検証/変換してからWin32の待機・終了コード取得・解放/DuplicateHandleを使うよう修正。レジストリ確認用JSのパスエスケープも修正。直接NodeでのAPI発行はpnpm環境不足で失敗したため、既存dev.batのローカルツール環境で実施。最終試験の実成功を採用し、途中の終了コード0でもエラー出力があった試験は成功扱いしない。最終CLIの失敗は明示のprocess.exit(1)で返す。
- 最終EXE100581824bytes、SHA256 E4785E4B6F0E77773B9A4E7662C9B22252E6A22CB5C98FAB2EA7FC7B755207BE。.NETホストはframework-dependent、SDK/Runtime/APIは変更なし。今回の更新後は初回のみ必要に応じてWindows側のピン設定を行う。同じ配置/EXE名/TEMPの更新間で維持し、移動/改名/Windows自身の設定リセットは対象外。実利用先deploy/commit/pushなし。
- 途中の失敗試験が残した6つのTEMP実行領域は、各専用profileのハッシュ・親TEMP・reparse pointなし・稼働プロセスなしを検証して削除し、全対象の消失を確認。最終試験の自動整理は正常。一時診断コードは配布版から除去済み。

## 2026-10-08: v0.16.3 Gmail連続切替と仮名の自動設定

- ユーザー補足の「1回目は効くが、クリックせず2回目が効かない」を旧0.16.2配布版で再現。以前のGUI試験は切替ごとに対象wc.focusを呼んでおり、入力先の消失を隠していた。新試験は初回だけfocusし、その後はgetFocusedWebContentsへキーを送る。修正は既にアクティブなGmail WebContentsの入力先だけを接続済みの切替先へ引き継ぐ。
- `dev.bat run typecheck`、build、`dev.bat test`成功（92/92）。仮名/旧番号名の置換、無効な観測拒否、手動rename優先、一度取得した名前の保持、ローカル入力と別Windowのフォーカス保持を検証。
- 最終win-unpackedのaccounts-1791438434630で新規仮名、日本語の名前、英語のメールのみ、取得後の変更抑止、ログイン前の手動名、再起動保持、前面別Window/未表示/表示/非表示/最小化、順序/監視/音/画像を確認。ui-features-1791438511879で再クリックなしの次キー4回・前キー2回と入力先、変更キー、既存の検索/削除/音/テーマ/位置保存が成功。最終単一EXE portable-1791438593328は0.16.3/ok:true/exitCode0、停止・再開・正常終了成功。
- 保存済み開発profileの実Gmailは2枠とも本人ヘッダーからaccountName取得に成功。既存accounts.jsonのハッシュ不変、認証保持/GPUオフ/本文を開く操作なし/送信・削除・既読変更なし。診断はGmailのartifacts/gmail-dev/live-result.jsonで、名前/メール/認証値は出力していない。新規の実Googleログインからの自動改名、長期常駐/スリープは未確認。
- `publish.bat`成功、framework-dependent .NETホストにRuntime混入なし。EXE100580178bytes、SHA256 A86DBFD0F350C6F4589869DCC560E57AE962D9C3F37E9DF14AFB254F55B56586。Gmail0.5.2は最低host0.16.3。実利用先deploy・commit・pushなし。通常exec/Node REPLのhelper_unknown_errorは許可されたWindows実行環境で検証。追加fixtureの未ロードへのアクセス/再起動前の古いlocatorは試験待機と再取得で解消し、最終試験が成功した。

## 2026-10-08: 実利用先へのdeploy

- 配置後の実利用について、ユーザーが正常動作を確認したと報告（2026-10-08）。

- ユーザーの明示指示により、AppDockと全6Appletの`deploy.bat`を引数なしで実行し、7件すべて終了コード0。配置先は`A:\00.ESSENTIAL\00.MainTools\AppDock.at365`。5つの.NET Appletは現ソース/SDKで`publish.bat`を先に実行し、Gmailはdeploy内で再発行した。
- AppDock0.16.2、Gmail0.5.1、WallpaperSlideshow0.3.0、Watch0.1.1（native）、WebBrowserTools0.2.4、WindowMover0.2.1、WindowsTools0.1.1を配置。Watchの古いDLL版manifestを配置せず、現ソースのnative版へ更新。
- 配置対象21ファイルのSHA256はすべて発行元と一致。現ソースと配置manifestの版/runtime/entry、minimumHostVersionも照合。settings.json・avatar.png・Gmail accounts.jsonの3ファイルは配置前後のハッシュ不変。
- 配置前後とも関連プロセスなし。実利用アプリは起動していないため、次回起動で反映する。旧ファイル退避は行わず、設定・認証領域を配置スクリプトで変更していない。結果は`../AppDock.at365/artifacts/deploy-2026-10-08-result.json`（本体では`artifacts/deploy-2026-10-08-result.json`）。

## 2026-10-08: v0.16.2 依存パッケージ更新

- npm公式レジストリのlatestタグを照会し、Electron 44.5.1→44.6.0、Vite 8.3.2→8.3.3、@vitejs/plugin-react 6.1.1→6.1.2へ更新。間接依存はpostcss 8.5.28→8.5.29、nanoid 3.3.19→3.3.20へ更新し、pnpm-lock.yamlを再生成。React/React DOM・型定義・TypeScript・Playwright・electron-builder・Prettierは既に最新。最終`dev.bat outdated --format json`は`{}`、終了コード0。
- ローカルpnpmは11.25.0→12.10.1。Node 24.21.0は公式indexで最新24 LTSと確認して維持（Currentの26.11.1へは変更なし）。グローバルインストール/PATH変更なし。
- pnpm 12のnative EXE化により、従来のnpm --ignore-scripts取得ではWindows shimが起動できなかった。取得後にpnpm自身の公式install.jsだけを実行し、npm rebuild --ignore-scriptsでWindows shimを再生成するようsetup-tools.ps1を修正。初回クリーン取得・連続再実行・dev.bat --version=12.10.1成功。旧版ローカルツールは保持。参考: [pnpmの公式導入手順](https://pnpm.io/installation/)。
- 新Electronはインストール時の依存postinstallを持たず、通常CLIの初回起動時に取得する。Playwright等は直接EXEを使うため、プロジェクトのpostinstallにinstall-electronを追加。`dev.bat install --frozen-lockfile --config.optimisticRepeatInstall=false`でroot postinstallとlockfileの再現インストールを確認。`dev.bat run postinstall`でも44.6.0実体を確認。参考: [Electronの公式バイナリ取得仕様](https://www.electronjs.org/docs/latest/tutorial/installation)。
- 型検査・Vite build・ホスト90/90・Gmail20/20成功。5つの.NET AppletのRelease buildは最終警告0/エラー0、既存回帰成功。WallpaperSlideshowは4グループ、Watch8/8、WebBrowserTools13/13、WindowMover23/23、WindowsTools11/11。各slnxのNuGet更新照会では更新なし、ソースにも外部PackageReferenceなし。Gmailはホストの依存を共有する。
- WindowsToolsのテスト用FakeContextが現SDKのIUiService.GetImageDirectoryAsyncに未追従でCS0535。未使用メソッドをNotSupportedExceptionとして追加し、新しいbuildから11/11を再実行。最初の失敗後に--no-buildで旧出力が成功した結果は最終検証として扱わない。
- トレイGUIの設定見出しlocatorがh1/h2の2件に一致して失敗。ページh1（level:1）を指定して再実行成功。製品の設定画面やトレイ動作は変更なし。
- AppDock隔離GUI: `artifacts/ui-1791435600421`（React移動、.NET起動/操作/停止、設定保存・無効JSON、暗号化secrets）、トレイ`artifacts/tray-ui-1791435643517`（実メニュー、single/double、OS間隔、再起動保存）、Widget `artifacts/widgets-ui-1791435647510`（時計tick・全9文字揃え・透過画面・Shell接続・配置保存・再起動）が成功。Widget検証はfixture DLLを使用し、native Watch実画面とは区別する。
- Gmailの最新依存でのオフラインUI: `../Applet.Gmail.at365/artifacts/accounts-1791435471926/result.json`と`ui-features-1791435496597/result.json`成功。画像/枠分離・切替の前面保持・個別監視・入力/順序保存・検索/未読・削除反映・キー・音コピー・テーマ・位置/サイズ保存を確認。通常Electron/Playwrightなしの最終app.asar背景試験`native-background-1791435598245/result.json`も成功（初回未表示の2枠更新・非選択枠・reload・認証解除・終了）。実Gmailのアカウントやメールは操作していない。
- 最終単一EXEの`../Applet.Gmail.at365/artifacts/portable-1791435656782/result.json`はhost0.16.2、ok:true/exitCode0。実EXE展開・隔離WebContentsView・到着判定・停止/再開・正常終了成功。最終EXE100,579,516 bytes、SHA256 `48E647F7C7631C13D8176A554829035CE2E3916210E01C5223E20EB0D19D4EB1`。.NETホストはframework-dependentクリーン発行、coreclr/hostfxr/hostpolicy等Runtime混入なし。
- README/DEVELOPMENT/本記録と各Appletの検証記録を更新。package.jsonのPrettier、setup-tools.ps1のPowerShell構文解析成功（PrettierはPS1非対応なので対象外）。通常隔離シェルはhelper_unknown_errorで起動できず、許可された通常Windows実行環境で検証した。実利用先deploy・外部pushなし。実メール到着、実ブラウザー操作、壁紙変更、ディスプレイOFF/ロック、長期常駐・スリープ復帰は今回の検証対象外。

## 2026-10-08: v0.16.1 認証済みアバター・非アクティブなアカウント切替

- 画像要求を当該アカウントのsession/credentials:includeへ変更。0.16.0の未認証取得ではGoogleの設定済みアバターURLが標準画像へ置き換わることを実Gmailで再現した。Cookieの適用はChromiumの各sessionへ閉じ、他枠へコピーせず、UI/Node/ログへ値を出さない。origin/転送数/時間/サイズ制限は維持する。
- cycleはselectedの保存と既存Viewの切替だけを行い、openとWebContents.focusを呼ばない。Gmailウィンドウの未作成・表示・最小化・非表示の状態と現在の前面Windowを保持する。明示openの表示動作は維持。
- main/renderer型検査・Vite、ホスト90/90・Gmail20/20成功。cycleのunit fakeはopen/focus呼出しで失敗する。最終配布版の`../Applet.Gmail.at365/artifacts/accounts-1791424612946/result.json`で、別Windowの前面/フォーカス保持と認証依存のセッション別画像を確認。最終既存UI/キー回帰は`../Applet.Gmail.at365/artifacts/ui-features-1791424637416/result.json`、単一EXEは`../Applet.Gmail.at365/artifacts/portable-1791424613849/result.json`（0.16.1、exitCode0）成功。
- 実Gmail右上の画像領域だけを読み取り、匿名/認証済み/修正版を照合して設定済みアバターとの一致を目視確認。以前のPNG取得有無だけの確認を補完した。詳細は[Gmail検証記録](../Applet.Gmail.at365/VERIFICATION.md)。メール状態や認証値を操作/出力せず、画像はローカルのGit対象外artifactだけへ保存した。
- 最終EXE100,446,218 bytes、SHA256 `8D5243653108108368DD5E04CC2C12DCBA688B4C028D07A53E6CF2CFF02C4B7F`。.NET framework-dependentクリーン発行、Runtime混入なし。Gmail0.5.1/最低host0.16.1を開発用配布先へハッシュ照合して配置。Prettier/diff check成功。既存の未配置GmailCheckerへの文書参照は確認不可。実利用先deploy/外部pushなし。長期常駐・スリープ復帰は未確認。

## 2026-10-08: v0.16.0 Webアカウント管理と画像取得

- WebアカウントUIへmove/setMonitoring、snapshot/readへmonitoring/avatar、readへmonitoringResetsを追加。旧accounts.jsonは個別監視ONを既定とし、順番の保存でselected/UUID/セッションを変更しない。OFFはUI data/attentionを直ちに消去し、遅いreportも再計上しない。ON/OFFの遷移を次のreadまで保持する。
- avatarOriginsを最大10個の厳密なHTTPS originとして検証。画像取得はNodeへのreadを待たせず、CookieなしのClientRequestで転送先を逐次検証（最大3転送/合計5秒）。入力64KBのストリーム上限、raster MIME、デコード後64px PNG/64KB、削除・停止時のabortを実装。UI snapshotだけへdata画像を返し、Nodeの1MB RPCへ画像バイトを送らない。実GmailでのSession.fetch manual redirectの取消エラーを確認し、ClientRequestへ修正した。[公式ClientRequest仕様](https://www.electronjs.org/docs/latest/api/client-request)と[関連するElectron issue](https://github.com/electron/electron/issues/43715)を参照。
- 最終main/renderer型検査・Vite・ホスト90/90・Gmail20/20成功。新しい回帰は並べ替え・OFFと古いreport・read間の再開、画像の厳密origin/MIME/サイズ、転送/取消を含む。Gmailの最終配布版アカウントUI試験`../Applet.Gmail.at365/artifacts/accounts-1791404902870/result.json`、通常Electronの最終app.asar背景試験`../Applet.Gmail.at365/artifacts/native-background-1791404906576/result.json`、単一EXE`../Applet.Gmail.at365/artifacts/portable-1791404908006/result.json`（0.16.0、exitCode0）成功。
- 実Gmailの保存済み2アカウントで両アバターをUI未表示の通常起動から取得、GPUオフ/認証保持。画像と監視のboolean・件数だけを診断し、本文/認証値を出力せず、メール状態を変更していない。実メールによる個別監視OFF/ON、長期常駐・スリープは未確認。詳細は[Gmail検証記録](../Applet.Gmail.at365/VERIFICATION.md)。
- 最終EXE100,447,550 bytes、SHA256 `55860971131436395A82378679A93AC6CF766A5B90F44CFC9936A14E3C423BB7`。.NETはframework-dependentクリーン発行、Runtime混入なし。Gmailは0.5.0/最低host0.16.0。開発配置のみ更新、外部push・実利用先deployなし。文書リンク88件・Prettier・diff check成功。

## 2026-10-08: v0.15.2 背景同期の再開・通常フォーカス

- 実利用版0.15.1/Gmail0.4.1でも、未表示の受信側は同期せず、表示しても反映せず、手動更新だけで反映するとの報告を受領。実Gmailでpaint/rAF/タイマー/document.hasFocusが正常でも受信同期が止まることを再現。DOMのreadyを待つだけの候補も実送信では不足したため、背景のアクティブ状態を30秒ごとに250msだけ解除して再適用する方式へ変更した。
- keepActiveはobserver.ready:trueの後だけ開始。native focus中はエミュレーションを解除し、通常のfocus/blurを優先する。同一文書のhash/history移動で接続を切らず、別文書の移動・認証・停止・破棄で周期/待機/接続を解除。Windowsのフォーカス移動・画面切替・定期reloadは行わない。
- main/renderer型検査・Vite、ホスト86/86・Gmail15/15成功。活動状態の7回帰には準備待ち、周期更新、native focus、認証へ移る途中の取消、破棄済みgetterへの非アクセスを含む。最終app.asarの通常Electron試験: `../Applet.Gmail.at365/artifacts/native-background-1791399095693/result.json`。DOMの準備より受信処理が遅れて初期化される2枠で、初回未表示・状態更新・hash/history移動・reload・認証・正常終了を確認。
- ユーザーがログインした開発用2アカウント間で5通を送信。最終候補は再起動を挟んだ両方向の実メールを、受信側を一度も表示せず検知し、未読件数も反映。詳細と観測時刻の範囲は[Gmail検証記録](../Applet.Gmail.at365/VERIFICATION.md)参照。長期常駐・実スリープ復帰は未確認。
- 最終単一EXE: `../Applet.Gmail.at365/artifacts/portable-1791399100255/result.json`（0.15.2、exitCode0、停止/再開/正常終了）。認証: `../Applet.Gmail.at365/artifacts/auth-redirect-1791399111873/result.json`（Google/YouTube/日本向けGoogle/Workspace、類似origin遮断、GPUオフ、認証中のアクティブ化解除）。
- 最終EXE100,442,774 bytes、SHA256 `11D9CABB02DAF33388768D1E227DEB9DD1FEB990B1657EE4D03AAB203C8C4D95`。.NETはframework-dependentクリーン発行、Runtime混入なし。開発配置のみ更新し、保存認証を保持したGPUオフの通常テストアプリを起動。外部push/実利用先deployなし。

## 2026-10-08: v0.15.1 通常起動のWeb初期化・アクティブ維持・終了処理

- 初回未表示のGmailが0.15.0でも更新されないとユーザーが報告。Playwrightの自動focus emulationが通常起動の条件を変えていたことをローカル実装で確認し、背景関連の検証に通常Electron起動を追加した。
- WindowsのCalculateNativeWinOcclusionを起動前に無効化し、既存のdisable-featuresを保持。任意のwebAccounts.keepActive（既定false）を追加し、observeOriginのロード停止後だけChromiumのページアクティブ状態を維持。メインフレーム移動/認証では解除、他Debugger/ユーザーDevToolsへ干渉せず、OSのフォーカス/選択/入力を移動しない。
- 実Gmailの2通目のユーザー送信メールは、Gmail画面を開かずopacity0/OSフォーカスfalseのまま、ページアクティブ化後に16行/未読3へ更新。修正版も通常起動でUI未表示・初期新着3・保存認証/GPUオフを確認。実受信トレイは1枠で、実複数アカウント/スリープ/長期常駐は未確認。[Gmail検証記録](../Applet.Gmail.at365/VERIFICATION.md)に詳細。
- ユーザーの終了エラー画像はWebContents.dispose / Object has been destroyed。WebContentsの破棄後にdebugger getterへ触れていた箇所を、生存中に参照取得・削除/停止前に解放する方式へ修正。破棄済みgetter・認証境界・外部Debuggerとの競合を3回帰で確認。
- main/renderer型検査・Vite、ホスト82/82、Gmail15/15成功。通常Electronから最終app.asarの実装を使った2枠の初回未表示/未読更新/reload/認証時解除/正常破棄: `../Applet.Gmail.at365/artifacts/native-background-1791394005659/result.json`。最終単一EXE: `../Applet.Gmail.at365/artifacts/portable-1791394017868/result.json`（0.15.1、exitCode0、エラーダイアログなし）。
- 最終EXEは100,443,530 bytes、SHA256 `D246228B7F8EB393FAA51E4ECAC25E4BD85EED0914C851AE764B755382ADAB8F`。.NETはframework-dependentクリーン発行でRuntime混入なし。開発配置だけを更新し、外部push/実利用先deployは行わない。

## 2026-10-08: v0.15.0 Web初回描画・テーマ・音声コピー・バージョン情報

- 未表示のWebContentsViewはrAFが動いても初回描画が成立しないことを追加実測。透明・全ディスプレイ外・非フォーカス・タスクバー非表示の親WindowでshowInactiveし、非表示/最小化中もViewを背景へ移す。display変更時は画面外へ再配置し、停止時は購読とWindowを解放する。
- Web snapshot.darkとnativeTheme変更通知でローカルUIのテーマを同期。sound.nameとsoundErrorを追加し、WAVを16MB/RIFF/WAVEで検証してsounds/<SHA256>.wavへコピー。旧設定を起動時に移行し、失敗時は元設定保持・実効音OFF・再選択案内。停止時は未参照の管理hash名WAVだけを削除する。
- 設定に「バージョン情報・更新」を追加。HostSnapshot.runtimeで実行環境を表示し、既存更新確認APIを再利用。表示時の自動通信なし、手動確認とリリースページ案内。本体/各Appletの版・確認時刻・結果/エラーを表示し、未保存の設定draftを保持する。
- main/renderer型検査・Vite・ホスト回帰79/79、Gmail回帰15/15成功。新しい音声コピー2回帰を含む。`dev.bat run dist`成功。.NETはframework-dependentクリーン発行でRuntime混入なし。
- 配布版のテーマ/音声コピー・旧設定移行/更新確認: `../Applet.Gmail.at365/artifacts/ui-features-1791389267393/result.json`。未表示・非表示reload・背景同期/透明/画面外/非フォーカス・破棄: `../Applet.Gmail.at365/artifacts/background-1791389201924/result.json`。既存GUI: `../Applet.Gmail.at365/artifacts/gui-1791389317671/result.json`。単一EXE: `../Applet.Gmail.at365/artifacts/portable-1791389361232/result.json`（0.15.0、exitCode 0）。
- 設定ナビゲーション: `artifacts/navigation-1791389280500/result.json`。about往復時のdraft保持、複数Applet/入力型/保存競合/無効JSON/両テーマ/狭い画面の既存操作が成功。同名の非表示保存ラベルを拾う旧locatorを可視toolbarへ限定した。
- 実Gmailは操作UIを開く前の初回描画、保存済み認証、GPUオフを確認。ログイン済み1枠が9行/未読2/起動時新着2、2枠目は受信トレイ未到達。実複数アカウント・別ブラウザーからの実同期・音の聞こえ方・スリープ/長期常駐は別途確認。詳細と制約は[Gmail検証記録](../Applet.Gmail.at365/VERIFICATION.md)。
- 最終EXE: 100,441,388 bytes、SHA256 `AA28B2BC11EBD62333221B43D90F71302A1D49EB27652D242515D6F321093212`。開発配置だけを更新し、実利用先へのdeploy・外部pushは行っていない。

## 2026-10-07: v0.14.0 Webアカウントの操作・個別音・ウィンドウ保存

- 任意のitemOpener資産をApplet内/100KBの関数式として検証し、限定ローカルUIのopenItem(id,key)からだけ実行。読込済みobserveOrigin・isolated world 1001・JSON文字列化した200文字以内の引数で、remoteへHost bridgeを渡さない。cycle(1|-1)をNodeと限定UIへ追加し、現在の枠から循環して同じWebContentsViewを選ぶ。
- アカウントsoundはenabled:false/file:""が既定。WAV絶対パス・4096文字以内・制御文字なしで検証し、accounts.jsonへ保存。設定/試聴にはaudio、親付きWAV選択にはfile-dialogを要求。既存queueSoundとWindowStateStoreを再利用し、位置/サイズ/最大化はweb-accounts/<Applet>/window-state.jsonへ保存。Gmailの復元下限は900×640。モニター切断/縮小・DIP丸め・最小化/非表示・終了時flushは共通処理を維持。
- Gmailの次/前コマンドへ既定Ctrl+Tab/Ctrl+Shift+Tabを追加。自身のAppletの登録済みコマンドだけをローカルUI/remoteのbefore-input-eventで処理し、利用者設定を毎回参照。global指定時は重複実行を避ける。旧設定へ既定キーを補い、明示の空配列/変更は保持する。
- main/renderer型検査・Vite・ホスト回帰77/77、Gmail回帰15/15成功。新しい境界でJSONキーのコード注入、音パス/資産の制限、循環と削除中/停止、最大10枠の観測＋音パスが1MB RPC内であることを確認。
- 発行版Gmail 0.3.0の追加UI: `../Applet.Gmail.at365/artifacts/ui-features-1791382644378/result.json`。検索/未読絞り込み、同じIDを持つ別セッションの正しいメールを開く操作と消えたメールの案内、Web/ローカルキー・キー変更、音選択/試聴/ON/OFF・保持、通常枠と最大化の再起動復元、900×640のレイアウトが成功。ホスト/Appletの通知OFFでも音ONの1枠だけ無音WAVの実プレーヤーが起動し、音/位置保存のエラーログなし。
- 既存GUI `../Applet.Gmail.at365/artifacts/gui-1791382808256/result.json`、背景描画 `../Applet.Gmail.at365/artifacts/background-1791382726283/result.json`、portableと未改変Applet `../Applet.Gmail.at365/artifacts/portable-1791382860793/result.json`（version 0.14.0、exitCode 0）成功。
- 保存済み実GmailはGPUオフ/認証保持・既読7行/未読0。既読行だけのitemOpenerで実ページ移動を確認して戻り、本文は取得せず未読を操作していない。裏側のrAFも継続。実新着の音の聞こえ方、別ブラウザーからの状態変更/実受信による背景同期、実複数アカウント/スリープ/長期常駐は別途確認。
- `dev.bat run dist`成功。framework-dependent .NETクリーン発行でRuntime混入なし。最終EXE: 100,441,648 bytes、SHA256 `B13FD8556362975E7100DB443DC8C3FA50AF66F955CA4E2A8D329B5008F42B05`。Gmailは開発用publish/extensionsへの配置のみで、実利用先へのdeploy・外部pushは行っていない。

## 2026-10-07: v0.13.1 非選択Webページの描画継続

- ユーザーはGmail 0.2.1の未読集計を確認した一方、非アクティブなGmail側の更新が止まると報告。監視のタイマー停止とは区別して調査した。`backgroundThrottling:false`だけでは、nativeで非表示/取り外したWebContentsViewのrequestAnimationFrameが止まることをオフラインで再現。document.visibilityStateはvisibleのままでも停止する。記録: `../Applet.Gmail.at365/artifacts/visibility-1791372924502/result.json`。
- Appletごとの非表示・非フォーカス・タスクバー非表示の背景BrowserWindowへ、非選択/ローカル一覧表示中のWebContentsViewを移す。View自体はvisibleと実サイズを保ち、初めて選択する前も描画を継続。UIへ戻す際は同じViewを移動する。削除/停止時にはViewと背景ウィンドウを破棄する。
- main/renderer型検査・Vite build、ホスト回帰75/75、Gmail回帰14/14成功。発行版の2アカウントでサーバーfixtureの変更をfetchし、ページ自身のrequestAnimationFrameで行状態へ適用する検証に成功。未選択アカウント・新着一覧・トレイ非表示・最小化で未読/既読が同期し、選択アカウントは変わらず、停止で背景ウィンドウも破棄。記録: `../Applet.Gmail.at365/artifacts/background-1791373818907/result.json`。以前のDOMを直接変更する検証だけでは、ページ自身の描画停止を確認できなかった。
- 発行版の既存GUI検証: `../Applet.Gmail.at365/artifacts/gui-1791373823236/result.json`。未読集計/履歴・初回未読・セッション保持/分離/削除・remote権限制限・停止/再開を確認。実portableと未改変Gmail 0.2.2: `../Applet.Gmail.at365/artifacts/portable-1791373893030/result.json`（version 0.13.1、exitCode 0）。
- 保存済み実Gmailの認証保持・GPUオフ・受信トレイ7行（既読7/未読0）と、新着一覧の裏側でrequestAnimationFrameが実行されることを読み取りだけで確認。実メールの状態は変更していない。別ブラウザーからの実既読/未読変更・実受信による背景同期はユーザー確認待ち。実複数アカウント・スリープ・長期常駐は未確認。
- `dev.bat run dist`成功。.NETはframework-dependentクリーン発行でRuntime混入なし。最終EXE: 100,440,091 bytes、SHA256 `32D58EF733AA4F91F2C53BB2FA85D09B7F26B3E1162F08DBE900D3C75F2B33D7`。Gmail 0.2.2を開発用publish/extensionsへ配置し全ファイルSHA256を照合。実利用先への配置・外部pushは行っていない。

## 2026-10-07: v0.13.0 Web表示領域と一時UIデータ

- Node `webAccounts.report(id,status,attention,data?)`に50KB以下のJSON化可能な一時データを追加。アカウントsnapshotへ渡し、ファイル/ログへ保存しない。ローカルUIの限定IPCに`viewport`を追加し、整数/DIPの矩形をclient領域へ切り詰める。nullはView非表示でページ・背景監視を継続。旧UIの未指定時は236/146の既定レイアウトを維持する。
- main/renderer型検査・Vite、ホスト回帰75/75成功。新しい境界テストで不正矩形・多バイトJSON上限・循環JSONを確認。最大10枠の履歴をNodeへ再送せず、観測結果をJSON-RPCの1MB以内で返すことも検証。既存Node/.NET起動・異常終了・再起動・設定・終了も成功。
- Gmail 0.2.0の発行版GUI: `../Applet.Gmail.at365/artifacts/gui-1791368517560/result.json`。新着一覧/設定中のView非表示と背景検知、復帰とリサイズ、送信元/件名、複数アカウントの絞り込みとクリア、ログインCookieの分離/再起動保持/削除、停止時破棄、remote Node/IPC非公開を確認。
- 最終portableと未改変Applet: `../Applet.Gmail.at365/artifacts/portable-1791368914954/result.json`（version 0.13.0、exitCode 0）。新UIとメタデータ、クリア、停止/再有効化、終了が成功。オフライン認証/GPU回帰は`../Applet.Gmail.at365/artifacts/auth-redirect-1791368563012/result.json`。
- 実開発Gmailで保存済み認証の復帰・受信トレイ2行の送信元/件名抽出・初回履歴0・GPUオフを確認。今回の新着一覧での実受信・実返信やスリープは未確認。旧版の実到着→Windows通知とWorkspaceログアウト/再ログインのユーザー確認を引き続き区別して保持する。
- .NETホストは既存手順でframework-dependentクリーン発行（coreclr.dll等のRuntimeなし）。単独electron-builderはpnpm PATH不足で失敗したが、プロジェクトの`dev.bat exec electron-builder --win portable --x64`で成功。最終発行EXE: 100,437,982 bytes、SHA256 `C6509735B60E29F09D3AD63FB5BB42E6461A18FAE4D264701648A356A210860C`。実利用先へのdeployは行っていない。

## 2026-10-07: v0.12.0 Webアカウントの共通管理

- Nodeへ`webAccounts.start/open/read/report`と`web-accounts` capabilityを追加。Gmail固有のDOM観測は新しいAppletへ置き、ホストはWebContentsView・アカウント別永続セッション・限定UI IPC・破棄を担当。.NET/nativeの既存APIは維持し、今回は.NET SDK専用ラッパーは追加していない。
- main/renderer型検査・Vite build成功、既存70＋境界3回帰で73/73成功。URL/capability/Web資産の境界、既存Node/.NETライフサイクルを確認。
- 発行win-unpacked版の隔離オフラインGUIでDOM新着/未読返信、既読変更、フォルダー復帰時基準、背景監視、900×640のレイアウト、Cookie分離と再起動保持、削除、停止、リモートのNode/bridge非公開を検証。結果: `../Applet.Gmail.at365/artifacts/gui-1791363761348/result.json`。
- portable＋未改変Gmail Appletで、明示コマンド起動、WebContentsView、新着/クリア、無効化/再有効化、正常終了コード0を確認。結果: `../Applet.Gmail.at365/artifacts/portable-1791363831174/result.json`。通信はオフラインfixtureへ差し替え。
- 開発用Gmailの旧テストprofileを元を残して隔離コピーし、再入力なしで実受信トレイと識別子解析を確認。同日、ユーザー自身が試しに送信したメールでWindowsの新着通知表示を確認したと報告。実メール到着から検知・通知表示までをユーザー確認済みとして記録。 同日のGmail 0.1.3/GPUオフの開発版で、ユーザーがGoogle Workspaceアカウントのログアウト→ログイン→受信トレイ表示も確認。実スレッド返信/複数実アカウント/セッション失効後の追加認証・組織独自SSO/実空受信トレイ/通知クリック・音/スリープ復帰/長期常駐は未確認。
- `publish.bat`で.NETホストをクリーン発行し、portableを生成。EXEは100,437,305 bytes、SHA256 `7D9168E11D6194F2B87F689354D62A0D5E3AD83546947DF71C0732FDF76D7CC4`。実利用先へは配置していない。

## 環境の.NET 10 Runtimeを使用（2026-10-06 JST）

.NETホストの発行を `win-x64` / `--self-contained false` に変更しました。発行前に専用の `artifacts/dotnet-host` を削除して再生成し、以前の同梱ランタイムが残らないようにしています。READMEとApplet開発ガイドに、利用先の.NET 10 Runtime（Windows x64）の要件とnative Appletとの違いを反映しました。

- `publish.bat`: .NETホスト・TypeScript・Reactのビルドとportable EXE作成が成功。
- 発行先と完成版 `publish/win-unpacked/resources/dotnet-host` に、`coreclr.dll`・`hostfxr.dll`・`hostpolicy.dll`などのランタイム本体がないことを確認。runtimeconfigは `Microsoft.NETCore.App 10.0.0` を参照。
- 実ホストの読み込みモジュールを確認し、`C:\Program Files\dotnet` 配下の.NET 10.0.12を使用していることを確認。`--hotkeys` モードの空のキー同期とEOFでの終了コード0も成功。記録: `artifacts/framework-dependent-validation.json`。
- `dev.bat test`: 33件すべて成功。実Node/.NET拡張の起動、コマンド実行、異常終了後の再起動、停止を含みます。
- 完成win-unpacked版の専用プロファイルでNode/.NET拡張の起動、.NETの状態更新、Storage / Secrets APIの往復、正常終了が成功。記録: `artifacts/framework-package-lnHWWO/result.json`。初回の確認はテスト側が起動完了を待てず失敗したため、待機方法を修正して再確認しました。
- portable EXEを別の専用フォルダーへコピーし、初回起動、設定・アバター保存と画像表示、正常終了が成功。Applet一覧は空。記録: `artifacts/smoke-1791270101603/smoke-result.json`。
- ビルドスクリプトのPrettier確認とGit差分空白検証が成功。

成果物: `publish/AppDock.at365.exe`、100,405,280 bytes、Version 0.4.0。
SHA256: `73DE381C8DD292FEB084A9440BE20E2ED41E0D09EC0F94276864F3A40B08DBE2`。

最初の発行はSandboxのNuGet.Config読み取り制限で失敗し、通常実行環境で上記の成功を確認しました。実利用先への配置はしていません。.NET未導入の別PCでの確認とOS全体へのキー送信は未実施です。native時計Applet自身のランタイム同梱設定は変更していません。

## サンプルAppletの同梱解除・タスクバーアイコン（2026-10-06 JST）

Welcomeと.NET Connection Demoの同梱・初期設定・通常ビルド対象を削除。Node／.NETの拡張機能は維持し、既存のサンプル実装は`tests/fixtures`に移して回帰検証だけで使用します。通常起動ではEXE隣の`extensions`のみを読み込みます。既存settings.jsonの保存済みApplet設定は削除しません。

WindowsのウィンドウアイコンをICOに統一し、[ElectronのsetAppDetails](https://www.electronjs.org/docs/latest/api/browser-window#winsetappdetailsoptions-windows)でタスクバーのAppUserModelID・アイコン・再起動先を指定。ICOをapp.asar外へ配置し、portable版のタスクバーアイコンと再起動先には、一時展開先ではなく元のportable EXEを使用します。

- 型チェック、回帰テスト33件、既存UI・プロフィール／ショートカット・完成win-unpacked版ナビゲーション11項目が成功。
- 初回起動のApplet一覧が空であること、古いサンプルの設定を残して再起動してもサンプルが復活しないことを確認。
- 完成win-unpacked版・portable EXE双方で、Windowsの大小ウィンドウアイコン（150% DPIで24×24／48×48）を取得し、アプリICOと全画素一致を確認。ShellのAppUserModelID、RelaunchIconResource、RelaunchCommandも検証。portable版は元の`publish/AppDock.at365.exe,0`を参照。
- portable EXEを別フォルダーへコピーした起動、設定・アバター保存、画面からの読み込み、ホストコマンドのピン保存、正常終了が成功。Applet同梱なし。
- Prettier・Git差分空白検証が成功。実利用先への配置、既存ピン留めの更新、OS全体へキーを送るホットキーテストは未実施。

記録: `artifacts/icon-removal-validation/profile-1791226237683/result.json`（win-unpacked・再起動）、`artifacts/icon-removal-validation/profile-1791226252327/portable-result.json`（portable・実アイコン画像）、`artifacts/ui-1791226064526/`、`artifacts/preferences-1791226067365/`、`artifacts/navigation-1791226070088/`、`artifacts/smoke-1791226417380/smoke-result.json`。

最初の.NET検証はSandboxのNuGet.Config読み取り制限で失敗し、通常実行環境で成功。初回UI検証は継承した`ELECTRON_RUN_AS_NODE`で起動できず、子シェル内だけ解除して成功。portableランチャー経由のPlaywright起動はデバッグ接続待ちとなったため、検証専用プロファイルの起動済みアプリへCDP接続し、Windows APIによる実アイコン検証と正常終了を完了しました。恒久環境変数や実利用の設定は変更していません。

成果物: `publish/AppDock.at365.exe`、125,269,111 bytes、Version 0.4.0。
SHA256: `0875F8354245AF00ABC6177AD9AAE57F066F2D8671CC41034E09BBD9A7F09E66`。

## ショートカット一覧の行をコンパクト化（2026-10-06 JST）

通常行を「コマンド名」「Applet名＋コマンドID」「グローバルチェック＋有効範囲・登録状態」の3段へ整理。キー入力と操作ボタンは右側に保持し、行の上下余白を20pxから12pxへ縮小しました。長いIDは省略表示し、ホバーで全文を確認できます。登録エラー・キー競合は下に全文を表示します。狭い画面では状態表示を折り返し、IDは10pxを維持します。保存形式と割り当て処理の変更はありません。

- 型チェック・production build、既存`test:navigation`の11項目、`test:preferences`が成功。
- 1280×840・900×620、ライト／ダークで画面を撮影し、文字・キー入力・状態の配置を目視確認。通常の1キー行は89 CSS px（グループ見出し・エラー・複数キーを含まない行）。
- 画面確認: `artifacts/compact-1791224463318/`。操作検証: `artifacts/navigation-1791224273940/result.json`、`artifacts/preferences-1791224294874/`。
- 最終の小画面向けID文字サイズ調整後も型チェックと画面確認に成功。再ビルド時にpnpmの非対話依存確認が失敗したため、準備済みのNode.jsからViteを実行。梱包の直接実行では一度pnpmのPATH指定を誤り失敗したが、`environment.bat`と同じパスへ修正して再実行。依存パッケージの再インストールや設定ファイルの変更は行っていません。
- 最終portable EXEの作成と、別フォルダーへのコピー後の起動・設定／画像保存・Node/.NET起動・終了が成功。pnpmの非対話依存確認が再度失敗したため、既存`smoke.cjs`をプロジェクト内Node.jsから直接実行しました。記録: `artifacts/smoke-1791224641797/smoke-result.json`。実利用先への配置は未実施。

成果物: `publish/AppDock.at365.exe`、125,263,290 bytes、Version 0.3.1。
SHA256: `FAA88D7042DEF34B568CDBDBC6E3DA6D388C292085E6E9F66DDEC915ADEC0698`。

## Applet別の設定・ショートカットと画面構成の改善（2026-10-06 JST）

ページ移動を左ツールバーに集約し、重複したナビゲーション・Applet一覧・固定のMy Dock表記を削除。Applet別の設定フォームとショートカット、対象設定とログへの直接移動、設定・コマンドの検索、キー重複相手の表示、未保存印と固定保存バーを追加。ホームは状態の概要とピン留めコマンドを中心にしました。既存のsettings.json形式、割り当て、保存時の競合保護は維持しています。

| 検証 | 結果 |
| --- | --- |
| TypeScript型チェック・production build | 成功 |
| 自動回帰テスト | 31件成功 |
| 既存UIテスト | Applet起動・停止・コマンド、フォーム保存、不正JSON、外部設定変更の反映と保護が成功 |
| ショートカット・ピン・プロフィールUIテスト | 記録・重複拒否・再割り当て、Node/.NETコマンド実行、画像保存・不正画像の保護・再起動後の保持が成功 |
| ウィンドウ状態UIテスト | 位置・サイズ・最大化・最小化・トレイ格納・非表示起動が成功 |
| 新設 `test:navigation`（完成版win-unpacked EXE） | 下記11項目の検証が成功 |
| `publish.bat` | .NET発行・Reactビルド・portable EXE作成が成功 |
| portable EXEを別の専用フォルダーにコピーして起動 | Node/.NET起動、設定・画像保存、正常終了が成功 |
| Prettier・差分空白検証 | 成功 |

新設テストでは、24個のテスト用Appletと同梱の2個を使用し、次を確認しました。

1. ナビゲーションが各1個で、選択表示とApplet詳細が一致し、対象設定へ直接移動する。
2. Applet名・設定項目の検索、複数Appletの未保存編集、戻る操作、全変更の一括保存。
3. 真偽値・選択肢・利用できない動的選択肢の表示、数値の空欄拒否と修正後の保存。
4. 設定項目なし・コマンドなしの表示、ショートカットへの直接移動。
5. Applet別・ホスト別・全体のキー表示、別Appletとの重複相手表示、状態絞り込み、所属未確認の保存済みキーの保持。
6. 停止したAppletの既知コマンドの所属・割り当て保持。
7. 不正JSON編集中にAppletから設定へ移動しても入力を失わない。
8. 外部更新後の古い設定による上書きを拒否し、編集中の値を保持する。
9. Applet詳細から対象Appletのログへ直接移動する。
10. コマンドパレットのApplet名検索、矢印キー選択、Enter実行、Escape終了とフォーカス復帰。
11. 1280×840・900×620、ライト／ダーク、長い設定フォームと多数のAppletで保存バーを表示し、横方向にはみ出さない。画面画像を目視確認。

記録: `artifacts/navigation-1791220776737/result.json`（完成版と画面画像）、`artifacts/ui-1791220758458/`（既存UI）、`artifacts/preferences-1791220437191/`（設定・プロフィール）、`artifacts/smoke-1791220793168/smoke-result.json`（portable）。

成果物: `publish/AppDock.at365.exe`、125,267,896 bytes、Version 0.3.1。
SHA256: `81E56C7F9A05B4A32455BC2A1ABA363705808F163438152CB96195A884D8EA70`。

実利用の配置先・設定・Appletは変更していません。OS全体へのPause送信を使うホットキーテストと実時計Appletの操作は今回再実施していません。初回のElectronテストは`ELECTRON_RUN_AS_NODE=1`の継承とSandboxアクセス制限、初回発行はNuGet.Configの読み取り制限で失敗しました。環境変数を子シェル内で解除し、通常実行環境で上記の成功を確認しました。ACL・恒久環境変数は変更していません。

## deploy.bat のpwsh切替（2026-10-06 JST）

`deploy.bat` の呼び出し先を `powershell` から `pwsh.exe` に変更。インストール済みのMicrosoft Store版PowerShell 7.6.6を通常PATHで使用し、テスト用フォルダーで引数なしの配置設定・CLI引数の優先・空白と日本語を含む配置先へのEXEコピー・既存settings.jsonの保持・不正な相対パスの終了コード1を確認しました。実利用の配置先にはコピーしていません。確認先: `artifacts/deploy-compat-44866c9c2ffb48b894dea4c8917d8f3d/`。

## mainへの統合確認（2026-10-06 JST）

グローバルホットキー・プロジェクト内Node.js／pnpmと、ウィンドウ位置・サイズ保存を統合。dev.bat経由の型チェック、production build、自動回帰テスト31件、test:window-stateの実Electron再起動・最大化・最小化・トレイ格納・非表示起動がすべて成功。今回の統合ではportable EXEの発行・配置は未実施。

## プロジェクト内のNode.js／pnpm（2026-10-06 JST）

Node.js 24.21.0とpnpm 11.25.0をAppDockの `.tools` 内に準備。Node.js ZIPは公式SHA256と一致しました。mise設定は作成せず、ツールのバージョンは `toolchain.json` で指定します。旧バージョンを残し、両ツールの動作確認後に利用バージョンを切り替える方式です。

Codexが追加するPATHを外し、Windowsの通常PATHだけを渡した子プロセスで次を確認しました。永続PATHとグローバルNode.js／pnpmは変更していません。

- `setup-tools.bat` の初回準備と再実行: 成功。
- `dev.bat exec node --version` / `dev.bat --version`: 24.21.0 / 11.25.0。
- `dev.bat install --frozen-lockfile` / `dev.bat run typecheck`: 成功。
- `dev.bat test`: 23件成功。
- `publish.bat`: .NET発行、Reactビルド、portable EXE作成に成功。
- `dev.bat exec node scripts/smoke.cjs publish/AppDock.at365.exe ../Applet.Watch.at365/publish/Applet.Watch.at365`: Node/.NET/native時計、設定保存・画像表示・終了まで成功。記録は `artifacts/smoke-1791215308632/smoke-result.json`。
- BAT 4ファイル（生成された `.tools/environment.bat` を含む）: CP932往復とCRLFを確認。差分空白検証も成功。

今回の成果物: `publish/AppDock.at365.exe`、125,270,147 bytes、Version 0.3.1。
SHA256: `0E121B1B714EA02D7BECB3A4F16272F7C1C959EFB634773492951E5317DF225D`。
別バージョンへの実際の更新・切り戻しは未実施です。pnpmの依存パッケージストアは通常のユーザーキャッシュを使います。

## v0.3.1 グローバルホットキー（2026-10-06 JST）

Windows x64、テスト専用profileで確認。元Watchはユーザーが終了し、実利用のAppDock設定は変更していません。

| 検証 | 結果 |
| --- | --- |
| TypeScript型チェック・React production build | 成功 |
| .NET ExtensionHost / Runtime発行 | 成功、警告0・エラー0 |
| 自動回帰テスト | 23件成功 |
| 既存のショートカット・ピン・プロフィールUIテスト | 成功 |
| `at365.watch.toggle` の既定グローバルPause登録 | 成功 |
| トレイ格納相当の非表示状態でWindowsのPause入力による時計の表示／非表示 | 双方向で成功 |
| AppDock前面でのグローバルキー | 1回だけ実行されることを確認 |
| キー入力欄の一時解除・単独F24への変更・Pauseの解放 | 成功 |
| 別ホストによるPause競合・設定画面への理由表示・再試行 | 成功 |
| グローバルOFF・既定に戻す・Applet停止／再有効化・AppDock終了時の登録解除 | 成功。別ホストがPauseを取得できることでも確認 |
| 背面からのTypeScriptコマンド実行・ホストコマンドで画面とパレットを開く | 成功 |
| 完成版 `publish/win-unpacked/AppDock.at365.exe` のホットキーUIテスト | 上記9項目成功 |
| portable EXEを別フォルダーにコピーして起動・Node/.NET/native時計・設定と画像保存 | 成功 |
| 両プロジェクトの差分空白検証 | 成功 |

成果物: `publish/AppDock.at365.exe`、125,270,146 bytes、Version 0.3.1。
SHA256: `38E7159990FC549F222CF6B82540A0666CADF30845502C8329C99FAA58F0879B`。

記録: `artifacts/hotkeys-1791212601125/result.json`（完成版の9項目）、`artifacts/preferences-1791212138244/`（既存UI）、`artifacts/smoke-1791212633700/smoke-result.json`（portable）。Pause等の入力はWindowsのSendInputで送信しました。手で押す実キーボード、別の配列・リモートデスクトップ、長期常駐は未検証です。Sandbox内のNuGet／Electron起動テストはアクセス制限で失敗したため、通常実行環境で成功を確認しています。


## ウィンドウ位置・サイズの保存と復元（2026-10-05）

専用Worktreeとテストプロファイルで確認。main / rendererの型チェック、Viteビルド、.NETホスト・Demoビルドが成功。自動回帰テストは28件すべて成功。

`node scripts/window-state-ui-test.cjs` で実Electronの位置・サイズの再起動復元、最大化の復元と解除、最小化中の終了、×でのトレイ格納、最大化状態を保存したままの非表示起動を確認した。Windowsの表示倍率で復元サイズが増える問題も補正し、再起動でサイズが一致することを確認。

負のモニター座標、モニター切断・作業領域縮小時の補正、不正JSON、保存失敗、初回表示直後の最小化はユニットテストで確認。実際のモニター着脱・異なるDPI間の移動は未検証。この変更のportable EXE発行・配置は未実施。

環境のPATHにNode.js / pnpmがないため、既存Electron同梱のNode.js（`ELECTRON_RUN_AS_NODE=1`）でコンパイラー・ビルドスクリプト・テストを実行した。Electron起動時はその環境変数を除去。最初の全回帰テストでは.NET成果物が未生成のため1件失敗したが、ビルド後は全件成功。

## 既存v0.3.0の検証

2026-10-05 JST、Windows x64の通常実行環境でv0.3.0を確認。実利用の設定と画像は変更せず、テスト専用のフォルダーを使用。

| 検証 | 結果 |
| --- | --- |
| TypeScript strict型チェック（main / renderer） | 成功 |
| React / Viteのproduction build | 成功 |
| .NET SDK・Runtime・ExtensionHost・Demo build | 成功、警告0・エラー0 |
| 自動回帰テスト | 20件成功 |
| 実Node/.NET拡張の起動・コマンド・停止 | 成功 |
| 拡張プロセス異常終了後の他拡張継続・再起動 | 成功 |
| React画面での操作テスト | 成功 |
| 設定フォーム・表示／一般／拡張のカテゴリ | 成功 |
| JSON保存・不正JSONの既存設定保護 | 成功 |
| 手動JSON編集の反映・不正編集時の有効設定継続 | 成功 |
| コマンドパレットからのC#コマンド実行 | 成功 |
| 0.1.0の設定を維持した読み込み・Ctrl+Pの既定キー | 成功 |
| キー記録・重複割り当ての拒否・保存と再割り当て | 成功 |
| TypeScriptと.NETの拡張コマンドのキー割り当て・実行 | 成功 |
| ピン留め・上下の並べ替え・検索時の順序保持・解除 | 成功 |
| 名前変更・画像アップロード・1枚への上書き | 成功 |
| 不正画像の拒否・既存プロフィールと画像の保持 | 成功 |
| JSONの書き込み失敗時の画像復元・古い設定での画像変更拒否 | 成功 |
| 再起動後の名前・画像・キー割り当て・ピンの保持 | 成功 |
| TypeScript/C#双方のStorage・Secrets往復 | 成功 |
| Chromium画面にNodeのrequireが公開されていないこと | 成功 |
| pnpm run dist | 成功 |
| 完成portable EXEを別フォルダへコピーして起動 | 成功 |
| portable EXEの隣へのsettings.json保存 | 成功 |
| portable EXEの隣へのavatar.png保存・画面からの読み込み | 成功 |
| portable内部のNode/.NET拡張・設定保存・暗号化保存 | 成功 |
| native EXEの起動・時計の3コマンド・Appletのトレイ項目なし | 成功 |
| 動的なモニター選択肢・設定値の型／範囲検証 | 成功 |
| 設定変更の.NET／Node購読API | 実装、時計の再起動なしの反映をUIで確認 |
| 完成portable EXEと外部時計Appletの接続・表示／非表示の保存 | 成功 |
| 時計の実画面操作・2台のモニター切り替え・停止時のプロセス終了 | 成功。詳細は隣のApplet.Watch.at365/VERIFICATION.md |
| 実装ガイド・API・READMEのローカルリンク | 48件の参照先の存在を確認 |
| ガイドの最小C#サンプル | ビルド成功、警告0・エラー0。manifest・起動・コマンド・設定購読・停止を実プロセスで確認 |
| publish.bat / deploy.bat | 0.1.0でCP932・CRLFと往復確認済み。今回変更なし |

成果物: `publish/AppDock.at365.exe`、125,254,942 bytes、Version 0.3.0、ProductName AppDock.at365。未署名。

SHA256: `BD8390D14ADAB655033167229FEA3A0BB16960110CA80AA0510F53B722BE93F0`。

最終portableテストは `artifacts/smoke-1791209958264/smoke-result.json`。既存画面のUIテストは `artifacts/ui-1791208806421/`、ショートカット・ピン・プロフィールのUIテストは `artifacts/preferences-1791208808973/`。時計のUIテストはAppletプロジェクトの記録を参照。

実装ガイドのC#コード例は `artifacts/docs-sample-1791210707074/` へ抽出し、ProjectReferenceだけ現行SDKの絶対パスへ置換してビルドしました。実際のDLLランナーとの接続、設定変更時の表示更新、終了を確認しています。

Watchの時計だけを外部Appletとして移行済みです。GmailChecker、Watchの入力フック・クリップボード・AutoLock、WallpaperSlideshowの移行は対象外です。別のクリーンPCでの実行、OS起動時の自動起動、長期常駐、配布署名は未検証です。このv0.3.0の検証時点ではElectronと.NETランタイムを同梱していました。現在の.NETランタイム要件は冒頭の「環境の.NET 10 Runtimeを使用」を参照してください。
## WindowsTools対応（2026-10-06）

`codex/windows-tools` worktreeで動的コマンド置換APIと`shortcut-list`設定UIを追加。v0.4.0。

- 型チェック・ビルド成功、既存分を含む33/33テスト成功。
- WindowsTools発行DLLとの実UI連携: 設定画面からの追加／名前変更／削除、対応するグローバルホットキーの登録／解除、削除済みコマンドの拒否、再起動／停止を確認。
- ポータブルEXE生成成功。展開済み配布アプリでも実UIテスト成功。ポータブルEXE自体のスモークテストは、初回の設定ファイル置換EPERM後、再実行で成功（WindowsTools running、panelあり、終了コード0）。
- 自動ロック・実消灯は実行していない。WindowsTools側の模擬APIで検証。実利用の設定は変更していない。

## 2026-10-06: v0.5.0 壁紙Applet・共通遅延開始・最低ホストバージョン

- TypeScript main/renderer型検査、Vite build、.NET Release build成功。自動テスト39/39。
- 遅延はプロセスを作る前に実施し、ほかのAppletを待たせない。既定値・保存上書き・設定変更時の再予約・無効化・再起動・今すぐ開始・終了時の解放を確認。
- 最低ホストバージョン不足は遅延待機前・実プロセス起動前に拒否。旧設定は遅延0のまま読み込む。
- JSON設定と画像付きパネルを検証。画像は4件まで・base64 rasterのみ、拒否した入力で既存パネルを維持。既存.NET Panelコンストラクターは保持。
- パッケージ版AppDockで壁紙Appletの隔離GUIテスト成功（履歴・ページ送り・設定保存・遅延取消・今すぐ開始・最低バージョン拒否・各更新チェック）。履歴画像はAppDock内に表示。外部への更新問い合わせは模擬化。
- portable完成EXEを隔離フォルダーへコピーしたsmoke成功。bridge / sandbox / 設定・avatar・ピン・ショートカット保存 / 正常終了を確認。smokeのElectron子プロセスだけELECTRON_RUN_AS_NODEを除去。
- SDK/Runtime v0.5.0。Watch v0.1.1（8/8）、WindowMover v0.2.1（23/23）、WindowsTools v0.1.1（11/11）は再publishと回帰テスト成功。
- 成果物: publish/AppDock.at365.exe、100,409,300 bytes、ProductVersion 0.5.0。
- SHA256: E0E9646499693F5D550086EFB8D537CA69F39195DB6C99A5E55EE0BB5B497C18。
- 詳細と壁紙APIの実機検証境界: ../Applet.WallpaperSlideshow.at365/VERIFICATION.md。

## 2026-10-06: v0.7.0 トレイコマンド設定

- main/rendererのTypeScript型検査、Vite build、.NETホストpublish成功。回帰テスト48/48。
- `trayCommands`の既定は空、`host.trayClickCommand`の既定は`appdock.open`。旧設定への補完、不正ID・型・重複・件数上限、動的置換時のメニュー名と可用性を確認。
- 未インストールの旧サンプル設定・空の`appdock.dotnet-demo.refresh`割り当てを起動時に整理。明示的にインストールしたfixtureと本来のApplet設定・未知コマンドは保持。
- 専用Node AppletのUIテスト成功: コマンドごとのON/OFF、ホストopenのON/OFF、保存直後の実Menu反映、実MenuItemのコールバックとTrayのclickイベントからの実プロセス実行、停止時の無効表示・クリック失敗時のログとウィンドウ復旧、再起動後の保持、追加のdouble-clickハンドラーがないこと。
- 開発版UI: `artifacts/tray-ui-1791290538638/`。発行済みパッケージ版UI: `artifacts/tray-ui-1791290613999/`。1280/900 DIPの画面をPNGで確認。Windows sandboxでのElectron起動はAppContainer ACL制約で失敗したため、ACLを変更せずsandbox外で再実行して成功。
- 単一EXE生成の正常終了後、コピーしたv0.7.0製品EXEのsmoke成功: `artifacts/smoke-1791290651412/smoke-result.json`。Tray clickから既定open・設定・検索、未知コマンド失敗時の復旧、bridge/sandbox、settings/avatars/pinsの保存と正常終了を確認。
- 自動化は実Trayオブジェクトのイベントと実MenuItemのコールバックを使用。Windows通知領域へ物理マウス入力を送る操作、消灯・ロック・壁紙変更などの実機副作用は行っていない。実利用先のEXE・設定の上書き、外部公開・pushは行っていない。
- 成果物: `publish/AppDock.at365.exe`、100,415,159 bytes、ProductVersion 0.7.0。
- SHA256: `83BFB8A0CFF147CFA2F880A7F3F5C535D02ADEBB7894D0F369339A0F7A1D406E`。

## 2026-10-06: v0.8.0 ハードウェアアクセラレーション

- 一般設定にON/OFFを追加。既定true、旧設定もtrueで補完、不正型は保存・起動時に拒否。変更の反映にはAppDockの完全終了・再起動が必要。
- 設定読込を単一インスタンスのロック取得後・Electron ready前へ移し、falseのときだけ`app.disableHardwareAcceleration()`を呼ぶ。不正な既存設定のエラー表示とファイル保持は継続。
- TypeScript main/renderer型検査、Vite build成功。回帰49/49成功。
- 開発版UI: `artifacts/hardware-acceleration-1791291279414/`。発行済みパッケージ版UI: `artifacts/hardware-acceleration-1791291320721/`。ON→OFF→ONを保存して3回起動し、Electronの`isHardwareAccelerationEnabled()`がtrue→false→trueとなること、保存直後は実行中の状態を変更しないことを確認。OFF時のGPU合成は`disabled_software`。フォームと再起動説明をPNGで確認。
- 早期設定読込後もパッケージ版のトレイUI回帰成功: `artifacts/tray-ui-1791291322655/`。
- 単一EXEのsmoke成功: `artifacts/smoke-1791291399989/smoke-result.json`。隔離profileで起動、bridge/sandbox、設定・avatar・ピン保存、トレイコマンドと正常終了を確認。ON/OFFの実状態検証は上記の発行済みパッケージ版で実施。
- 実利用のEXE・設定、Applet、GPUドライバーは変更していない。外部公開・pushなし。
- 成果物: `publish/AppDock.at365.exe`、100,412,458 bytes、ProductVersion 0.8.0。
- SHA256: `517053B6460EDB1477A7A418E6BD9D2B4D41C4C8B66DFA812DB83E893F0FF0F9`。

## 2026-10-06: v0.9.0 トレイのダブルクリック設定

- 一般設定に`host.trayDoubleClickCommand`を追加。既定null、旧設定も未設定で補完。未設定時のシングルクリックは即時実行、割り当て時は待機し、double-clickが来れば対応するsingleだけを取り消す。
- Electron v44.5.1のWindows実装のmouse-down / double-click通知順と、Windows GetDoubleClickTimeの仕様を確認。判定時間は読取専用の.NETホスト補助コマンドで毎回取得。この環境では340ms。通知順への25ms余裕を加え、取得時間を待機時間から差し引く。取得失敗時はwarnと最大5000msの待機にする。
- TypeScript main/renderer型検査、Vite build、.NETホストpublish成功。回帰55/55。単クリック即時/待機、二重実行抑止、ネイティブ取得完了前の取消、独立した複数クリック、設定変更・メニュー・終了時の取消、取得失敗を確認。
- 開発版UI: `artifacts/tray-ui-1791292040494/`。発行済みパッケージ版UI: `artifacts/tray-ui-1791292062264/`。別コマンドのsingle/double、ダブル時に単クリック側が動かないこと、単クリックの遅延実行、保存直後の反映、再起動後の両設定保持、停止時の復旧、未設定へ戻した際の即時実行を実TrayイベントとNode Appletで確認。1280/900 DIPの画面をPNGで確認。
- Windows通知領域への物理マウス入力は送っていない。確認したElectron実装と同じclick→double-clickイベント順で検証した。
- 単一EXEの初回smokeは設定置換のEPERMで失敗（`artifacts/smoke-1791292123270/`）。新しい隔離profileで再実行して成功（`artifacts/smoke-1791292140961/smoke-result.json`）。bridge/sandbox、設定・avatar・ピン保存、既定トレイコマンド、正常終了を確認。ダブルクリックの実行検証は上記パッケージ版で実施。
- 実利用のEXE・設定、Windowsのマウス設定、各Appletは変更していない。SDK/Runtime API変更、外部公開・pushなし。
- 成果物: `publish/AppDock.at365.exe`、100,414,619 bytes、ProductVersion 0.9.0。
- SHA256: `5A052C4D7D1E004B5BDF26EC3E5DCA4FCDC8381C23DF826F7D51BBB2D781DD6A`。

## 2026-10-06: タスクマネージャーの表示名修正

- portable起動用EXEの`FileDescription`にpackage.jsonの長い英語のdescriptionが使われていたため、descriptionを`AppDock.at365`へ変更。製品名・EXE名・バージョン0.9.0は維持。
- プロジェクト内Node.js/pnpmと既存Electron配布ファイルを使用して再パッケージ。portable起動用EXEとwin-unpacked本体の`FileDescription` / `ProductName`がともに`AppDock.at365`であることを確認。PE Machineは起動用EXEが0x014C（x86）、本体が0x8664（x64）。
- 単一EXEの隔離smoke成功: `artifacts/smoke-1791293112989/smoke-result.json`。起動、bridge/sandbox、設定・avatar・ピン保存、既定トレイ操作と正常終了を確認。タスクマネージャー画面自体は未確認。
- Sandboxでの初回起動は結果なし・終了コード2147483651。通常実行環境での初回はテスト設定置換のEPERM、新規profileでの再実行は成功。初回パッケージ処理のElectron取得はネットワーク制限で失敗し、既存ローカルElectronを指定して成功。
- SHA256: `F332E5CE2AB3DF065724CA62030232BAE6379DCCBADBC099364CD8E62598C7F3`。
- ユーザーの完全終了後、実利用先へEXEを配置。配置済みEXEのSHA256が発行元と一致し、`FileDescription` / `ProductName`は`AppDock.at365`、settings.jsonのSHA256は配置前後で不変。旧EXEは`artifacts/process-name-deployment`へ退避。配置スクリプトは実行ポリシー制限で起動できず、pwsh.exeもPATHにないため、スクリプトと同じCopy-Itemで配置。実利用アプリは再起動していない。外部公開・pushなし。

### 表示名の実画面確認

- 修正版を再起動しても、修正前から開いていたタスクマネージャーでは古い英文が残っていた。配置済みEXEのFileDescription/ProductNameはAppDock.at365で、確認したMuiCache内のAppDock表示名にも古い英文はなかった。
- ユーザーがタスクマネージャーを閉じて開き直し、AppDockホストウィンドウを表示した状態でもAppDock.at365になることを確認。タスクマネージャー側の古い表示が再起動で解消した。キャッシュやレジストリの削除、追加のEXE修正は行っていない。

## 2026-10-06: ビルトインの再起動・終了コマンド

- `appdock.restart`（再起動）と`appdock.quit`（終了）をホストのコマンド一覧へ追加。パレット・ピン留め・ショートカット・トレイ設定が同じ一覧を利用し、既定キーは追加しない。既存トレイの終了とwindowActionのquitも同じ終了処理を利用する。
- 再起動はElectronのrelaunchを予約してからquitし、既存のbefore-quitでホットキー・Applet・設定監視・トレイを終了する。終了開始後の再要求は無視する。portable版は元の配布EXEへ戻り、削除される展開先を作業ディレクトリに残さない。
- main/rendererのTypeScript型検査とビルド成功。既存回帰55/55成功。変更したTypeScriptと新検証スクリプトのPrettier確認成功。
- 開発版の実プロセス検証成功: `artifacts/host-commands-1791294664778/result.json`。パレットから再起動し、ホストPIDの切り替えと旧ホスト・workerの終了を確認。同時に2回の再起動要求でも1回だけ再起動。保存済み設定を保持し、割り当てたショートカットでcloseToTray設定にかかわらず完全終了。非同期deactivateの完了記録が各再起動・終了前に残り、最後にプロセスが残らないことを確認。
- 単一EXEでも同じ検証成功: `artifacts/host-commands-1791294787489/result.json`。3回のホストPIDは52236 → 50272 → 54616。再起動後も隔離プロファイルを保持し、2回の再起動と完全終了を確認。パレットの表示はPNGでも確認。
- GUI起動はWindows sandbox内で完了せず、許可された通常実行環境の隔離プロファイルで検証。パッケージはプロジェクト内Node/pnpmと既存Electronを指定して生成。実利用先のEXE・設定・Appletは変更していない。
- 成果物: `publish/AppDock.at365.exe`、100,498,304 bytes。SHA256: `7909549E145F4229A20FEC56608499B6F7825EFFEF372A6D3DBC3DAC526FC9E9`。

## 2026-10-06: トレイのビルトインコマンドを最上位へ移動

- 選択されたビルトインをAppDockサブメニューから最上位へ移動。Appletサブメニュー→セパレータ→ビルトイン（フラット）→セパレータ→固定の設定/終了の順とし、空の区画では余分なセパレータを省く。グループの所有者IDで区別し、Appletの表示名に依存しない。既存の表示選択とコマンドIDを維持。
- TypeScript main build、renderer型検査、Prettier、トレイ回帰4/4成功。開発版実トレイUI成功: `artifacts/tray-ui-1791295415722/`。
- 発行したwin-unpacked版の実トレイUI成功: `artifacts/tray-ui-1791295488202/`。Appletのみ/両方/ビルトインのみ/選択なしの実Menu階層と区切り位置、最上位の開くコールバック、既存Applet実行、表示切り替え、単/ダブルクリック、保存・再起動を確認。物理的なWindows通知領域への入力は送っていない。
- 更新した単一EXEの隔離smoke成功: `artifacts/smoke-1791295545430/smoke-result.json`。bridge/sandbox、設定・avatar・ピン保存、トレイコマンドと正常終了を確認。
- 最新成果物: `publish/AppDock.at365.exe`、100,500,097 bytes。SHA256: `E9A5F315042CB71759231D28F3DB597CAED93F5BF234FB6F22F06EF37C8B7C65`。実利用先への配置は行っていない。
# 2026-10-07 Settings scroll layout

- Keep the settings heading and save toolbar outside the scrolling body. Reserve scrollbar space and reset category/Applet/tab/mode scroll before paint.
- Renderer TypeScript check and Vite build passed.
- `scripts/settings-scroll-ui-test.cjs`: isolated Electron profile, 1280/900/760px widths; heading/toolbar bounds remain unchanged during scrolling and general-to-appearance switching, form width stays stable, JSON switching works.
- Initial sandbox launch was blocked by Electron install-directory ACL restrictions; the UI checks passed outside that sandbox without changing ACLs. Packaged EXE and deployed installation were not updated.

- Deployment completed after user shutdown confirmation: portable smoke passed (artifacts/smoke-1791327621153); deployed EXE SHA-256 matches publish output, settings.json SHA-256 unchanged. Previous EXE retained in artifacts/settings-scroll-deployment-20261007-075937. App was not restarted.

## Settings display cleanup (2026-10-07 JST)

- Removed the settings subtitle and bottom settings-file path; the heading omits its paragraph when no subtitle is supplied.
- Renderer typecheck/build and existing 1280/900/760px settings-scroll UI checks passed. Screenshot inspected at 900px.
- Portable smoke passed (artifacts/smoke-1791328207131). Deployed with matching EXE SHA-256 and unchanged settings.json; previous EXE backed up in artifacts/settings-cleanup-deployment-20261007-081014. App was not restarted.

## 2026-10-07: 設定とAppletの一覧を統一・検索フィルターをボタン化

- 設定カテゴリとApplet別設定の一覧をshellの左パネルへ移動。Appletと背景・余白・文字・選択表示を共通化し、既存の保存済み一覧幅を両画面で共有。フォームとJSON編集、未保存印、画面移動時のdraft保持、固定見出し・保存バーは維持。
- ホーム・Applet・ログのタイトル下の案内文を削除。ショートカットの検索欄と状態フィルターを同じ行へ配置し、「すべて／割り当て済み／未設定／競合・エラー」の排他的な切り替えボタンへ変更。選択状態はaria-pressedで表示し、領域不足時は折り返す。
- main/renderer TypeScript型検査、Vite build、変更コードのPrettier、git diff --check成功。
- 既存の一覧幅UI検証を拡張し、両画面のスタイル一致、ドラッグ・キー操作・幅の上限下限、幅の相互反映と再起動後の復元、未保存データ保持、3画面の案内文削除を確認。開発版: `artifacts/applet-sidebar-1791328926715`、発行win-unpacked版: `artifacts/applet-sidebar-1791329187617`。
- 設定スクロールUI検証成功。1280/900/760pxで見出し・保存バーを固定し、カテゴリ切り替え・JSON表示・フォーム幅を確認。
- ナビゲーションUI検証成功。検索・全4種類の絞り込み・Spaceでのボタン選択、複数Appletの編集保存、JSON不正時の保持、外部変更との競合保護、24 Applet、ライト/ダーク、1280/900/700pxでの検索とフィルターの同一行配置・同じ高さ・横はみ出しなしを確認。開発版: `artifacts/navigation-1791329154290`、発行版: `artifacts/navigation-1791329206049`。既存検証の古い期待件数を共通開始遅延設定と現行5件のホストコマンドに合わせた。
- 900pxの設定フォーム・ショートカットと700pxの設定をPNGで確認。初回のsandbox GUI起動はElectronのinstall-directory ACL制限で失敗したため、ACLを変更せず許可された通常実行環境の隔離profileで検証した。
- プロジェクト内の既存ツールとElectron、既存.NET host成果物で単一EXEを再発行。portable smoke成功: `artifacts/smoke-1791329218130/smoke-result.json`。bridge/sandbox、設定・avatar・ピン保存、トレイ操作、正常終了を確認。実利用先への配置は行っていない。
## 2026-10-07: Appletウィジェット基盤 v0.10.0

- manifest宣言、widgets capability、Node/.NET SDKの登録・配置取得・表示操作API、配置JSON検証を追加。時計・日付・テキスト/値一覧を共通Reactで描画し、ホームのピン留めとデスクトップを独立管理。9アンカー、自由位置、モニター、前面/デスクトップ、サイズ/色/不透明度、移動完了/取消/期限を実装。
- モニター/階層ごとに透過画面を共有。画面単位の日時タイマーを使い、Appletとの毎秒通信なし。バックグラウンドのShell確認時、親・座標が変わっていれば再接続し、変わっていなければSetParent/再配置を省く。背面表示を使うときだけ共通のShellブリッジを起動し、停止時に解放。専用preload、登録済みフォントの実パス検証、設定revisionで境界を維持。
- Watch 0.2.0をDLLへ移行。SDKのnull省略値（地域設定・パネル）を受け付ける互換処理も確認。既存のnative/.NET/Node Appletを維持。UIテストのElectron子プロセスからだけELECTRON_RUN_AS_NODEを外す。
- main/renderer型検査・Vite build成功。ホスト回帰64/64（ウィジェット6件を含む）、Watch回帰14/14成功。実Nodeウィジェットの内容更新とクラッシュ時の内容解放、配置の保持を検証。
- 最終開発版UI: `artifacts/widgets-ui-1791331213323`、最終win-unpacked版UI: `artifacts/widgets-ui-1791331254254`。Watch DLL実通信、初回移行/再登録時の配置保持、ピン/フォーム、共有画面、秒更新、透明画素、専用IPC、移動保存/取消、表示コマンド、停止/有効化/再起動、下書きの画面移動時保持、ライト/ダーク、900pxでの横はみ出しなしを確認。
- 接続済み2画面へ時計と日付を独立配置し、前面・デスクトップの両方で確認。未接続IDを保持してメインへ退避。Win32の親クラスProgman、WS_CHILD、WS_EX_LAYERED/TRANSPARENT/NOACTIVATE、前面と背面のTOPMOST状態、固定前後のフォーカス不変、実ピクセル座標を確認。PNGを目視確認。
- 既存Applet/設定/JSON/コマンドのGUI: `artifacts/ui-1791331012145`、設定スクロール1280/900/760pxも成功。単一EXE+Watch DLLの最終smoke: `artifacts/smoke-1791331259893/smoke-result.json`（ok=true）。
- Windows sandbox内のGUI起動、NuGet設定アクセスは制限されたため、ACL/グローバルツールを変更せず、許可された環境で隔離profileを使って検証。プロジェクト内Node/pnpmと既存Electronで発行。
- `publish/AppDock.at365.exe`: 100,511,894 bytes、SHA256 `18B06407B4B761734F3AB409E96895927F27E65B97C6DF07A80B12AC9E93A15D`。framework-dependentの.NETホストにcoreclr.dll同梱なし。プロジェクトの`publish/extensions/Applet.Watch.at365`だけDLLに更新し、発行元との4ファイルのハッシュ一致、旧Watch EXEなしを確認。実利用先への配置・公開・pushは行っていない。
- 未確認: 物理マウスによるドラッグと下側ウィンドウの操作、実モニター着脱、異なるDPI間の移動、Explorer強制再起動、RDP、スリープの実往復、長期常駐。配置ドラッグの保存検証はウィンドウ座標をプログラムから変更して実施。Shell表示面はWindows依存。
## 2026-10-07: v0.10.1 日付書式・文字配置・保存バー修正

- 元Watchの`Watch.xaml.cs`で`CultureInfo.InvariantCulture` / `M/d ddd`を確認。Intlの自動書式による曜日先行・カンマを除去し、Watchは`10/7 Wed`の書式に復元。タイムゾーン指定は保持。
- ウィジェットごとに左右（左/中央/右）・上下（上/中央/下）揃えを追加。既存設定はautoで読み込み、デスクトップではアンカー側、ホームでは中央に配置。プレビューは揃えの下書きを反映する。
- 日時を実描画境界のSVGで描画し、フォントの行高/サイドベアリングと中央基準のtransformによる余白を除去。時分と半サイズの秒をそれぞれ一続きの文字列で描画し、文字単位の等幅化は行わず、元の比例幅・字間を保持。秒で全体幅が変わっても、左端/右端/中心の選択位置を固定する。計測結果は上限256件のキャッシュで再利用。
- ウィジェットの見出しと保存/再読み込みを設定ページと同じ共通レイアウトへ移動。上部右側のバーを固定し、フォームだけスクロール。設定画面の既存UI検証は表示中のページへ絞り込むよう更新。
- main/renderer型検査・Vite build・.NET host publish成功。ホスト回帰67/67、Watch回帰14/14成功（日付/タイムゾーン、旧配置の揃え移行、比例幅の維持と実描画境界を追加）。
- 開発版UI: `artifacts/widgets-ui-1791333446251`、発行win-unpacked版UI: `artifacts/widgets-ui-1791333558608`。Playwrightの時計制御で00～59秒の自然な全体幅変化と、固定した左端/上端を確認。全9通りの揃えで各60秒進め、選択した端/中央とウィジェットの端/中央の距離が0.5DIP以内で一定。Hatten.ttfの実描画境界がSVG端から2px以内（実測は左右1px以内・上下0px）、日付`10/7 Wed`、揃え保存/再起動復元を確認。1280/900/760pxでスクロール前後の保存ボタン矩形不変、管理画面PNGを確認。実時刻での秒更新も確認。
- 既存設定スクロールUIは1280/900/760pxで成功。単一EXE+Watch DLL smoke: `artifacts/smoke-1791333566349/smoke-result.json`（ok=true）。Windowsの一時的なJSONファイル占有（EPERM）が途中のUIテスト中に1回発生し、テスト内の配置操作だけ最大2回再試行するよう調整。本体の保存処理・失敗報告は変更していない。
- `publish/AppDock.at365.exe`: 100,515,435 bytes、SHA256 `7C332C142040FB9D3669DFBA7227ADD068B1E4C65AFCD212D3AC170ED2818A38`。Watch Appletのソース・実利用先の設定/EXEは変更せず、プロジェクトの発行版だけ更新。外部公開/pushなし。

## 2026-10-07: v0.10.2 デスクトップ固定の描画開始を修正・デプロイ

- デスクトップ固定後のWin32親・座標・可視フラグは正常でも、実画面では表示されない症状を隔離fixtureで再現（`artifacts/widget-visibility-1791334244597`）。以前の親/スタイル検証と`capturePage()`だけではこの欠落を検出できなかった。
- Shell接続後、初回と非表示からの復帰時にElectronの`showInactive()`も呼んでChromiumの描画を開始し、親と座標を再確認する。通常の5秒ごとの確認でshowを繰り返さない。デスクトップ固定は維持し、GPUやShellの設定は変更していない。
- 新しい`test:widget-desktop`は隔離Node fixtureを使い、露出したデスクトップの180×120pxだけに色マーカーを描画して実画面を撮影。緑/紫の表示更新、通常のテストウィンドウによる遮蔽と復帰、非表示からの再接続、マーカー除去後の透明部分を確認。利用者のウィンドウ・壁紙を変更しない。画面の色管理を考慮し、色相と領域の90%以上の画素で判定。
- 開発版の実描画検証: `artifacts/widget-visibility-1791334489928/result.json`。発行win-unpacked版: `artifacts/widget-visibility-1791334630152/result.json`。21,600画素中、緑21,309画素、紫21,301画素、通常ウィンドウの黒21,150画素。除去後は元の背景の画素集計に戻る。
- main/renderer型検査・Vite build・Prettier・git diff --check、ホスト回帰67/67成功。Watchウィジェットの開発版UI: `artifacts/widgets-ui-1791334419882`、発行版UI: `artifacts/widgets-ui-1791334637705`。DLL起動、全9通りの文字寄せの秒更新、2モニターの親と座標、フォーカス維持、移動/保存/取消、停止/再起動、テーマ/保存バーを確認。単一EXE+Watch DLLの隔離smoke: `artifacts/smoke-1791334645561/smoke-result.json`（ok=true）。Explorer強制再起動、実モニター着脱、RDP、長期常駐は今回も未検証。
- `publish/AppDock.at365.exe`: 100,512,630 bytes、SHA256 `5571AAF9B070E88F4DA9583AC08422FB5871F22538B894847399B596296AADED`。ローカルNode/pnpmと既存Electron/.NET host成果物で再発行。native bridge/APIとWatchソースに変更なし。
- ユーザーから完成後の`deploy.bat`実行指示を受け、実行直前のAppDock/ExtensionHostプロセス0件を確認してデプロイ。デプロイ先のProductVersion 0.10.2と発行元SHA256一致、settings.jsonの前後SHA256不変を確認。旧EXEと結果を`artifacts/widget-desktop-deployment-20261007-095802`へ退避。実利用のアプリは起動していない。外部公開/pushなし。

## 2026-10-07: ウィジェットの実利用確認・mainへ統合

- ユーザーがデプロイ済み0.10.2で正常動作を確認。ユーザーの指示により、AppDockの`codex/widgets`（e04584a）とWatchの`codex/widgets`（90b3e2e）を各`main`へfast-forwardで統合。マージ前後のGit treeが同一で、検証済みコードへの変更がないことを確認。
- 旧EXEのSHA256と配置済み0.10.2のSHA256を確認してから、今回の退避先`artifacts/widget-desktop-deployment-20261007-095802`の旧EXE・結果JSON・空フォルダーを削除し、消失を確認。以前のデプロイや別作業の退避物は対象外。
- 両リポジトリのマージ済み`codex/widgets`を削除。実利用先のEXE・設定・Applet、発行版には変更なし。外部公開/pushなし。

## 2026-10-07: テキスト入力のスペルチェックを無効化

- メイン画面とウィジェット画面の`webPreferences.spellcheck`をfalseにし、画面作成前に共有セッションも`setSpellCheckerEnabled(false)`で無効化。設定JSONへの追加・移行は不要。
- ローカルTypeScriptによるmainビルド・renderer型検査、Vite build成功。既存Electron/.NET host成果物からportable EXEを再発行。
- win-unpacked版の隔離起動で`session.isSpellCheckerEnabled() === false`とプロフィール欄への文字入力を確認。スクリーンショットでもスペルチェックの赤い下線がないことを確認。結果: `artifacts/spellcheck-1791347487183/result.json`。
- 完成した単一EXEの隔離smokeも成功: `artifacts/smoke-1791347529413/smoke-result.json`（ok=true）。この検証で実利用の設定やAppletは読み書きしていない。
- `publish/AppDock.at365.exe`: 100,512,311 bytes、SHA256 `91005CC49BC2501A9A5367E5DBB8BED5203D91EC327CA6C430049A9B4B3090BB`。AppDockプロセス0件を確認して実利用先へ配置し、発行元とのハッシュ一致とsettings.jsonの前後SHA256不変を確認。旧EXEは`artifacts/spellcheck-deployment-20261007-133309`へ退避。実利用アプリの再起動は行っていない。

## 2026-10-07: ダブルクリック判定時間の取得失敗時は既定500ms

- 取得失敗時の判定時間を5000msからWindowsの既定値500msへ変更。ログ側とDispatcher側で定数を共有し、正常時のOS設定値と既存の25ms余裕は維持。READMEとホスト開発ガイドを更新。
- 根拠: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setdoubleclicktime
- mainビルド・renderer型検査・Vite build、関連回帰10件、変更したTypeScript/テストのPrettier、git diff --check成功。回帰では取得失敗後の単一操作、ダブルクリックによる取消、メニュー/設定変更/終了時の取消を確認。
- portable発行と隔離smoke成功: artifacts/smoke-1791350201920/smoke-result.json。Watchの.NET拡張running、パネル/コマンド/設定保存を確認。
- 元の配布EXEの7zip一覧にはruntimeconfig/depsが存在するが、稼働中のTemp展開先には両JSONとPDBが欠けていた。起動済み.NET拡張は存在しており、起動後の消失が疑われる。削除原因は未特定。PCのMicrosoft.NETCore.App 10.0.12と発行元の判定時間取得340msを確認。
- ユーザーのdeploy依頼後、AppDock/ExtensionHostプロセス0件を確認して既存deploy.ps1で実利用先へ配置。SHA256 CF656034E722EC2B24FBC6D1EA86887BBA108D8688E553F9851F3AC2F89CC9AAが発行元と一致。settings.json不変。旧EXE退避: artifacts/tray-fallback-deployment-20261007-141726。実利用アプリの自動再起動は行っていない。
- 500msフォールバック修正版について、ユーザーがdeploy後の実利用で正常動作を確認（2026-10-07 JST）。設定ファイル消失の原因は引き続き未特定。
- ユーザーの依頼で今回の退避フォルダーartifacts/tray-fallback-deployment-20261007-141726を削除。旧EXE・配置結果JSONを照合後に削除し、空フォルダーも除去、消失を確認。実利用EXE/settings.jsonは削除前後のSHA256一致。他作業の退避物は対象外。
## 2026-10-07: v0.11.0 GmailChecker向けの共通通知API

- Node APIへファイル選択（JSON/WAV）、短いWAVの順次再生、Appletごとのトレイattention、デスクトップ通知のsilent/クリックコマンドを追加。既存API v1/.NET呼出しは維持。停止・異常終了でattentionを解除し、音声は起動世代を確認して中止する。
- main/rendererのTypeScript型検査・Vite build成功。ホスト回帰70/70（既存67＋追加3）成功。Gmail側は16/16。既存Node/.NETの実プロセス起動・異常終了・再起動の回帰も成功。
- 実Electronで暗号化fixtureとGmail AppletのNode workerを接続し、新着表示、クリア、監視切替、削除取消、WAV選択、無音WAV再生、設定保持、停止を確認。発行版の結果は`../Applet.GmailChecker.at365/artifacts/ui-1791355520145/result.json`。通常幅/900px幅の画面を目視確認。
- 完成したportable EXEと未改変のAppletでも、初回案内、設定、消音、無効化/再有効化、終了コード0を確認。結果は`../Applet.GmailChecker.at365/artifacts/portable-1791355697468/result.json`。
- .NETホストを既存build-dotnet手順でクリーン発行し、ローカルElectronからportableを作成。単独electron-builder実行はpnpm PATH不足で失敗したが、dev.bat経由で成功。EXE SHA256: `4A6B3D6DBD4302C7A6A3015731344E8795CE7473CC760909EBB580F9C89F4275`。
- Gmail Appletを開発用publish/extensionsに配置し、5ファイルのハッシュ一致を確認。実利用先へのdeploy・外部pushは実施していない。実Google OAuth/新着、Windows通知の実表示とクリック、実音の聴感、スリープ復帰・長時間常駐は未確認。

## 2026-10-08: 0.21.0 設定ページの操作ボタン

- settingActionsを宣言して自身の宣言済みコマンドを実行。結果表示、実行中の無効化、停止中の可用性、未保存draftの維持を追加。settingActionsは設定データへ保存しない。
- ローカルツールによる型検査、TS/Vite build、ホスト回帰91/91、publish.bat成功。.NET発行物はframework-dependentで、hostpolicy/coreclr等のランタイムファイル混入なし。
- WallpaperSlideshowの隔離native fixture＋最終win-unpackedを使ったGUI: `../Applet.WallpaperSlideshow.at365/artifacts/background-settings-1791464780421/result.json`。手動案内、成功/失敗、実行中のボタン無効化、未保存77秒の維持、paused維持、操作データ非保存、停止時無効化、900×720 DIP横はみ出しなしを確認。success/small画像を目視確認。
- 最終単一EXEの隔離起動: `artifacts/smoke-1791464853687/smoke-result.json`、ok:true。初回smokeは発行完了前のコピーで最終ハッシュと違ったため、発行完了後に再実行した。最終EXE/検証コピーのハッシュ一致を確認。
- 実利用先deploy、commit、pushなし。実Windows背景を変更する検証ではない。
- 通常sandboxのpnpm呼出しはポリシー確認で進まず中断。プロジェクト内の既存Nodeで検査し、許可された通常Windows環境のdev.bat/publish.batでは成功。グローバルツールの導入なし。
- 最終EXE: 100574539 bytes、SHA256 DDCCF49D9702CB8A2E879AD44552DF2AE36114EFA6E1A43BB841A0BDB7A05A7D。

## 2026-10-09: v0.22.0 単一EXEとAppletの共通自己更新

- mainのクリーンな状態から、同じcheckoutにcodex/portable-updatesブランチを作成。worktreeは作成せず、本体単一EXEを維持。更新元は本体/各Appletごとのローカル絶対パス・UNC・HTTP(S) feed・GitHub Releases。起動時の本体/各Applet確認、待ち時間、通知、同版再適用を保存できる。起動時確認はmetadataだけで、download/installは呼ばない。
- framework-dependent .NET 10単一ファイルhelper（197666 bytes）を本体内に同梱。交換前の準備・SHA256/サイズ・ID/版/最低host/manifest・ZIP範囲検証、実PID/外側ランチャー終了待ち、全候補交換・逆順復元、journalと結果記録を実装。設定/.appdock/ほかのAppletは交換対象外。
- main/renderer型検査、TS/Vite build、.NET host/updater Release発行、dev.bat run dist終了0。回帰100/100、失敗0（artifacts/portable-updates-regression.log）。新規9回帰は旧設定移行/更新元/ID/版/互換性/起動時確認のみ/HTTP-GitHub metadata/実helper2Applet交換と途中失敗時復元/ZIP traversal拒否。sandboxのTEMP制約はプロジェクトartifacts/test-tempで確認し、Electron GUIは許可された通常Windows環境で実行。
- 既存ui/navigation/preferences GUI成功。navigationでは新しい更新設定の保存バー表示を確認し、未保存のApplet設定を保持する既存試験を継続。
- 実portableのartifacts/portable-updates-1791472687891/result.jsonはok:true。起動時metadata確認のみ、無効Appletも対象、下書き時更新禁止、設定保存、実.NET DLL Appletの稼働/停止/一括交換/再起動、無効状態保持、obsolete.dll除去、設定/ログインfixture保持、同じhelperで本体EXE交換・再起動、個別ボタンから同版再適用が成功。最終確認native dialogだけ隔離試験内で応答を差替え、交換/終了/起動は実処理。updates-settings.pngを目視確認。
- 最終EXEは100595163 bytes、SHA256 DB67DBC642612535381D90CF37801027E7686D9454B5889ECF9CC93C06D86584。publish/update.jsonのsize/hashと一致。自己更新helperとframework-dependent .NET hostを同梱し、.NET runtimeは既存の利用要件のまま。本体/各Appletが実利用されている配置先にはdeployしていない。
- 試験の途中失敗は保存ボタンの旧名、inspector内のrequire参照、終了するrendererのIPC完了待ち/CDP再接続が原因。保存名を現UIへ変更し、createRequireと再起動後Node inspectorで実snapshot/個別ボタンを確認する方式へ修正。製品の確認ダイアログを省略するコードは追加していない。最終試験は終了0。
- 未確認: 実UNC共有からの取得、GitHub上での公開/実Release asset取得、実Webサーバーからの全パッケージ取得、更新通知の実toast表示/人手クリック、電源断中の本体復元、各製品Appletの独自保存データ。対応経路は実装済みだが、公開や実利用操作で検証したとは扱わない。非公開GitHub認証とprereleaseは非対応。
- 最終確認: 起動時確認を待ち時間中にOFFにした場合の取得抑止、破損ダウンロード時に確認/終了へ進まない回帰を追加して100/100成功。未保存時のガードは更新操作だけに限定し、従来の有効化/通常操作を保持。最終版で再度実portable更新試験が終了0。整形・diff check、更新文書27リンク、packed JS/helperと現在のbuildのバイト一致を確認。

## 2026-10-09: Release手順のリポジトリ内保存

- AGENTS.mdからdocs/RELEASING.mdをリリースの正本として参照。成功済み7repoのplan/public-verificationとオールインワン追加結果、GitHub v0.23.0の3assetのsize/digest/targetを照合し、コマンド・成果物・例外を記録した。
- scripts/release.ps1はSetVersion/Prepare/Draft/Publish/Verifyを分離。Prepareは既存の型検査/回帰/publish/実EXE更新/進捗/中断復旧/全体ZIP起動を直列実行し、全ソースclean・commit・ノート・3asset・証跡を固定。Draft/Publishはremote mainとtag、下書きとasset digestを再照合。公開済み上書きや自動clobberはしない。
- tests/release.test.cjs 6件成功: 全添付後だけ公開、未完了準備拒否、ソース/asset/remote main変更拒否、アップロード中断と不足分再開、remote digest不一致/asset欠落で公開停止、版の増加と正式版制約。GitHub操作はfixtureであり、この作業で実Releaseは変更していない。
- tests/all-in-one.test.cjs成功: 従来の異常時ZIP保持に加え、新しい兄弟repoを追加するとスクリプトの一覧編集なしで同梱されることを確認。WindowsのZIP区切りを正規化するverify-all-in-one.ps1で全収録hash/sizeと展開を検査。
- sandbox内のTEMPファイルrenameはEPERM。許可された通常Windows環境で同じfixtureテストを実行して成功。製品コードや権限制約を回避する変更は行っていない。
- 実Prepare通し検証: cleanなd142d62に対して `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 -Mode Prepare -NotesFile artifacts/github-releases-0.23.0/AppDock.at365.md -PlanPath artifacts/release-workflow-validation/plan.json` が終了0。型検査、回帰110/110、publish.bat、本体/一括/個別の実portable交換と再起動、進捗/取消/再試行、8停止点の復旧、全6Applet入りZIPの通常起動まで成功。plan.phase=prepared、全7ステップのログ/証跡/ハッシュを保存した。
- 同梱ZIPの全ファイル照合・通常EXEとの一致・初期無効/版/エラーなしを検証。`artifacts/release-workflow-validation/bundle-ui.json` はok:true、profileは`artifacts/bundle-verify-37aa59db-7962-41b4-8856-b79fd7bd56b6`。EXE 100598967 bytes/SHA256 4ee27650e20d5a94701d7f241b2961fbaa2e2684b17933b0e98db3b3608bd92b、ZIP 275723780 bytes/SHA256 ff66809c47707ebcd591c3436e36bd04d62b832423c1d06d789d2454e9e0a951。これは今回のローカル検証物であり、既存GitHub v0.23.0の配布物とは別。
- GitHubの新しいDraft/Publish/Verifyモードを実サービスへ実行して新Releaseを作る試験は行っていない。公開操作の順序/停止/再開はfixture、過去の実公開値は読み取りで確認。今回の版更新・main統合・push・Release変更・実利用deployはなし。
- この検証記録を追加するコミットでもソースSHAが変わるため、上記planは当時の成功証跡として保持し、将来の公開には再Prepareを必須とする。PS1はUTF-8 BOM/CRLF、BATは未変更。文書リンクと差分を確認。

## 2026-10-09: AppDock固有の運用情報をリポジトリへ移管

- ALICE/TOOLS.mdのAppDock運用注意とWebAppletの未実装相談をAGENTS.mdへ集約。今後の仕様/運用/検証/発行変更時に、この指示と参照文書の更新要否を確認するルールを追加。
- 旧版ごとの実装・検証経緯はdocs/implementation-history.mdへ本文を保持して移動。当時の未実装/未確認を現状と区別する注記を追加し、現行のAppletページ/共有設定/自己更新と照合。WebAppletのGmail保存領域分離と未決定事項も保持。
- 共通TOOLSにはサービス環境、汎用GitHub CLI、Computer Useの環境診断を残し、AppDock記述は0件。移動先へ無関係なtailnet/サービス設定が混入していないことを確認。移行時に元のAppDock本文と保存先、WebApplet節と保存先の包含一致を確認してから元を整理。
- AGENTS/DEVELOPMENT/履歴のローカルリンク36件とgit diff --check成功。文書のみの変更のためビルド/製品試験は実行していない。Release・deploy操作なし。

## 2026-10-09: Windows通知からテストEXEが起動する問題

- ユーザー報告: 配布版のApplet.GmailのWindows通知クリックでテストアプリが起動。Gmailは登録済み`at365.gmail.open`を本体通知APIへ渡しており、Appletの変更は不要。全起動でAUMID `at365.appdock`を共有し、実HKCUのElectron通知CLSID `{06A54B3B-33F5-45DF-AFDB-E9B640783044}` のLocalServer32は`publish/win-unpacked/AppDock.at365.exe`だった。Electron 44.6.0の自動登録は製品名の共通shortcutからCLSIDを読み、現在の実EXEを登録するため、テスト/配布の経路が混ざる。公式実装の参照はDEVELOPMENTへ記載。
- 修正: notifications.tsをApplet/更新通知で共用。Windows toastXmlに配置専用protocol URIを埋め込み、元のportable EXE・profile・packaged状態でschemeを分離。最初の通知時だけ元のEXEと必要な隔離profile引数をHKCUへ登録。second-instance/初回起動でUUID callbackを一度だけ処理し、外部URIの任意commandを受け付けない。同じApplet子プロセスの稼働ガードを維持。古い/前プロセスのトークンは本体を開く。単一EXE・既存AUMID/通知設定・Gmail保存データを維持。
- 検証: typecheck/build/Prettier/diff-check成功。通常Windows環境の全回帰124/124（artifacts/notification-regression-windows.log）。新規3試験は配置/開発の分離、URI検証/一度限り処理、XML escape/無音保持を確認。sandboxでは既存一時ファイルrename EPERM・子プロセス制限により失敗/停止したため、通常Windowsで実施。残存sandbox試験PID 59180と子46104を終了。
- 発行: `dev.bat run dist:host`成功、publish/AppDock.at365.exe 100608538 bytes、SHA256 `89A1D78522D9A2CE4B18BC737F6FAFA6B02BBADA8F38D6820C254E355AB92D30`。update.jsonを再生成。版は0.24.0のまま、本体だけのローカル発行。既存の別作業変更を保持、実利用deploy/commit/push/Release公開は行っていない。
- 実EXE: artifacts/notification-portable-1791514866382/result.json、最終試験終了0。2つの隔離単一EXEに合成通知を表示しWindows通知履歴のXML/起動登録を確認、通知内のURIをWindows Shellから起動。配置先ごとのcallback・他方のcount不変・一度限り処理・停止Appletガード・終了後の元EXE/profile起動を確認、コピーSHA一致。物理toastクリック/実Gmail受信は未実施。
- 後片づけ: 通知履歴の古いContent=null項目で初期のcleanupが失敗。null項目を対象外にして最終試験終了0。途中試験を含む合成URIを限定削除、試験前のCOM起動先とAppDock shortcutのtarget/cwdを復元。artifacts/notification-cleanup.logで全試験URI消去/元target照合、関連プロセス0を確認。ユーザーの実利用通知を消去していない。
- 更新前の既存通知は旧launchを持つため、修正後の新しい通知で確認が必要。README/DEVELOPMENT/AGENTSへ仕様と実通知clickの検証境界を記載。

## 2026-10-09: v0.26.0 汎用マウスジェスチャー

- ユーザー承認に従いmainへ実装。InputHostが右押下中の上下左右・左/中クリック・ホイール・キー入力を受け、本体/ブラウザ/指定exe/ページ/提供元/選択Applet/グローバル条件、保存順、同一コマンド重複抑制、除外、一時停止を管理する。WebBrowserToolsの11コマンドと送信キーは維持。旧設定の一回移行、Applet初期値のID衝突回避、開始対象/取消情報、共通ショートカット予約を追加。
- 最終型検査と全回帰141/141成功（artifacts/gestures-typecheck-final.log、gestures-regression-final.log）。WPF入力プロセスを自己完結で収録し、追加Desktop Runtimeを要求しない。publish.bat終了0、AppDock 0.26.0、WebBrowserTools 0.3.0、6Applet同梱ZIPを発行。実利用deploy/commit/push/Releaseは未実施。
- InputTestsの専用Windowで実SendInput/カーソル操作17項目成功（artifacts/gestures-native-final.log）。単方向、方向転換取消、通常右クリック再送、左/中と対応解放、キーrepeat/解放/通常キー、細粒度ホイール/逆転/間隔/滞留破棄、設定変更、除外、browser/exe条件、別HWND拒否、前面変更と取消通知を確認。入力表示をフック登録前に初期化、初回設定同期の完了をstartupReady前に待つ。
- 最終単一EXEの実ジェスチャーGUI8群成功: artifacts/gestures-ui-1791535182689/result.json（portable:true）。グローバル/本体の順次実行と重複抑制、pages/owner/指定Applet、独立Appletウィンドウ、埋込み/独立WebApplet、キー/Ctrl付きキー、共有draft・保存・複製・順番・ブラウザ一覧を確認。dark/light画像を保存し目視確認。実EXEのSHA256/試験コピー一致。
- 既存GUI: keybindings-1791535140820は10群、applet-pages-1791535150999は6群成功。Windowsの実グローバルキー、Gmail UI/本文とページ切替/入力保持も確認。artifacts/bundle-verify-509e8e39-c6bf-4eb0-81c5-c795775f710aは全ZIP収録hash/size・単一EXE一致・全6Appletの版/初期無効/エラーなしでok:true。
- WebBrowserTools回帰14/14、専用native WindowのWM_APPCOMMAND/SendInput/最前面変更取消と20回の連続キー送信成功。発行済みAppletのhost-1791535311624で旧7割り当て/操作感移行、旧UI除去、本体設定の編集、11コマンド、キー即時反映/再起動後保持、無効化、エラーなしを確認。
- 途中のGUIでは初回入力未到達や前面取得失敗が発生。ユーザーからRDPの接続/切断中と確認。診断付き試験では操作全群が通ったものの診断をerrorログとして出したため末尾のno-error検査で失敗。診断コードを除去。portable試験は対象を明示的に表示/前面化し、最終配布物で終了0。RDPだけを原因と断定しない。試験は直列、隔離profile、カーソル復元で実施。
- 未確認: 人手の物理操作、実Chrome/Edge/Firefoxの履歴・タブ受理、管理者権限差、複数DPIモニター、RDP切替をまたぐ連続操作、他ジェスチャーソフトとの併用。OSへ送信済みの操作や、取消非対応の任意Applet内の副作用は取り消せない。
- 最終EXE: 142505370 bytes、SHA256 3edc9a6fe1e17547be70676f0d4bc3c2804617e13cfda3fec9691d4665aaa4f2。publish/update.jsonと一致。新しい入力用WPFランタイムが本体内に加わるため、以前の約100MBから増加。

## 2026-10-09: v0.26.1 ジェスチャー編集と共通パレット

- ユーザーの試用結果を反映し、同一gesture単位のグループ表示、グループ内だけのドラッグ/ハンドル上下キー並べ替え、共通Toggleのスイッチを実装。保存形式は既存bindingsのまま。別グループの相対順/設定値を保持し、キー違いも個別グループ。複製/削除は右端のメニューへ分離し、削除は確認後だけ下書きに適用する。
- CommandPaletteを実行/選択/ピン留めで共用。検索・提供元/完全ID・矢印/Enter・IMEガード・Escape/フォーカス復帰・Tab移動を共通化。選択モードでは実行せず、停止中のコマンドも選択可能。選択内のピン変更は共有draft、実行用は従来の即時保存。Icon/Toggleをmainから共通部品へ移動。キー記録欄が別グループへ移動して消える時の記録停止も保証。
- typecheck成功、dev.bat testは142/142成功（artifacts/gestures-ui2-typecheck-final.log、gestures-ui2-regression.log）。追加回帰はグループ内の実行順、異なるジェスチャー間の移動拒否、別行の位置と元配列の保持を確認。Prettierとdiff checkも成功。
- ソースGUI: artifacts/gestures-ui-1791540085907/result.json。最終単一EXE GUI: artifacts/gestures-ui-1791540351063/result.json（portable:true、下記SHAと一致）。ドラッグ、上下キー、複製、削除取消/確認、スイッチ、保存前のdraft保持、検索/矢印/IME、選択で実行しないこと、フォーカス復帰、ピン共有、キー変更後のCtrl+P復帰、実行モード、ブラウザ設定を確認。dark/lightとpalette-select画像を保存し目視確認。
- 今回の実OS入力を含む試験は最初のジェスチャー未到達（source）、前面HWND取得失敗（portable）で停止。入力フック自体は今回変更していない。APPDOCK_GESTURE_UI_ONLY=1で今回の編集/パレットを分離して成功したものであり、0.26.1の実マウスジェスチャー全群の再成功とは扱わない。RDP接続/切断の既知の状況はあるが原因を断定しない。前版0.26.0の実入力17項目/単一EXE8群成功は前節の証跡。
- 既存配布版GUI: preferences-1791540312996の7群成功（ピン留め/順番/絞込み/解除、設定、キー、再起動保持）、applet-pages-1791540315870の6群成功（Gmail/ローカル/独立ページとパレット重ね表示等）。WBTのhost-1791540326790も旧設定移行/本体スイッチ/送信キー/再起動保持で成功。WBTの試験を新スイッチと安定ID参照へ追従し、Applet製品版0.3.0は据置。
- publish.bat終了0。AppDock 0.26.1、単一EXE 142504831 bytes、SHA256 152073654baf11fbadc44a3b68c02b459653a1a20c1a2077b0e8f3f5fedbd2b4、update.json/GUI検証コピー一致。全6Applet入りZIPの全ファイルsize/hashと通常起動も成功（bundle-verify-d600028e-662d-4c37-adc3-4113a23829aa）。初回bundle試験はrenderer未準備時に接続済みbrowserを閉じてしまい接続不能になったため、接続を保ってrendererを待つ試験処理へ修正して同じ配布物で再確認。
- 途中のドラッグ試験は移動先への自動スクロールで開始位置が変わったため、同じグループが見える位置へスクロールしてから実施。キー変更試験は移動後の配列先頭ではなく安定IDを照合。最終GUIは終了0。sandboxのtypecheckはpnpmポリシー確認で停滞したため中断し、通常Windows環境の同じtypecheckで成功。
- mainの既存未コミット変更へ継続実装。ローカルpublishのみで、実利用deploy/commit/push/Release公開は未実施。

## 2026-10-09: 0.26.2 行メニューのドロップダウン化

- ジェスチャー行の「…」をボタンと浮動メニューへ変更。スクロール表の外へ描画し行の高さを維持、画面端で位置を補正。外側クリック/Escape/スクロール/リサイズで閉じ、上下/Home/Endキーで移動。Escapeでボタンへ戻り、削除は確認とキャンセルを維持。
- typecheck終了0、回帰142/142（artifacts/gestures-dropdown-regression.log）。初回整形は依存未配置で失敗し、既存dev.batのローカル依存復元後に同じPrettierを再実行して成功。新たな依存追加なし。
- ソースGUI（gestures-ui-1791541764462）と固定単一EXE（gestures-ui-1791541935557）で、メニュー表示中の行高不変/画面内配置、上下キー、Escape/フォーカス復帰、再クリック/外側クリック、複製/削除確認/キャンセル、既存グループ並べ替え/スイッチ/共通パレット/保存を確認。スクリーンショットgestures-dropdown.pngも目視確認。今回はUI変更のためAPPDOCK_GESTURE_UI_ONLY=1を明示し、OS入力試験は再実施していない。
- publish.bat終了0、0.26.2単一EXE/update.json/6Applet入りZIPを配置。EXE142516690 bytes、SHA256 f3cebdb6b932aa4041e357df0cfe70517bba15c71695853448a74a0ef8102298、feedと実試験コピーが一致。all-in-one-ui-test.cjs終了0、ZIP全収録size/hash/本体一致と隔離通常起動を確認（artifacts/gestures-dropdown-bundle-result.json）。
- ユーザーの追加指示に従い、発行・検証後に今回までの汎用ジェスチャー/UI変更をAppDockとWebBrowserToolsのmainへコミットする。push/Release/実利用deployは依頼範囲外。

## 2026-10-09: 0.26.4 本体・全Appletの同時更新と確認日時

- 更新ページに「本体と全Appletを更新」を追加。installUpdates('all')で本体と全ファイル型Applet（有効/無効を含む）の適用可能な候補を1つのjobへ準備し、1回の確認・再起動で交換する。既存の本体のみ/全Appletのみ/個別更新を維持。WebAppletは本体管理のため個別候補に含めない。
- 本体metadataを先に確認し、同時適用する本体候補の版でAppletのfeed/ローカルmanifest/展開後manifestの最低host版を照合。本体が未設定・取得失敗・再適用不可・旧版なら現行版で判定する。準備途中で本体/ZIPのハッシュが不一致の場合は、確認/終了/交換へ進まない。
- 最終確認日時を各「更新を確認」の隣へ移動。「すべての更新を確認」の隣には直近の対象checkedAtを表示。日時とボタンを同じグループにし、結果本文を間へ挟まない。
- 型検査終了0（artifacts/combined-update-typecheck.log）、回帰164/164（artifacts/combined-update-regression.log）、Prettier checkとgit diff --check成功。追加試験はlocal/feedの同時互換性、新本体が利用不能/同版/旧版/不足の場合、host/ZIP破損時の両対象保持と最終確認取消を検証。
- publish.bat終了0（artifacts/combined-update-publish.log）。AppDock 0.26.4、publish/AppDock.at365.exe 142503045 bytes、SHA256 a1673c06287c0f1ef126ea2fb938bc8424bb1af01c73139c97bcc3ea3b82cb11。publish/update.jsonのversion/size/hashと隔離検証コピーが一致。
- 固定した実単一EXEのGUI11群成功（artifacts/portable-updates-1791544025489/result.json、combined-update-portable-ui.log）。新ボタンを実クリックして本体+稼働中.NET Applet+無効Node Appletの3対象を1jobで交換・再起動。設定/認証fixture/有効状態保持、旧ファイル除去、画面復元、既存本体のみ/全Appletのみ/個別更新・通常再起動を検証。最終native確認だけ試験内で承認へ差し替え、交換・終了待ち・ランチャー・再起動は製品処理を使用。
- dark/light/900pxの画像を保存・目視確認。各本体/Applet/全体確認のボタンと日時の横並びを座標照合し、狭い設定本文に横スクロールがないことを確認。
- 初回sandbox型検査はpnpmの供給網ポリシー確認で停止したため中断。通常Windows権限で同じ既存dev.batを再実行して成功。製品や依存設定を回避目的で変更していない。
- 実GitHub/UNC取得、実利用先の更新、物理native確認操作は今回未検証。通常publishのみで本体EXE/feedを更新し、未変更Applet再発行/全体ZIP作成・整理/commit/push/Release/実利用deployなし。
- ユーザーの動作確認: ユキちゃんが「うまくうごいてる」と確認し、今回の変更のコミットを依頼（2026-10-09）。上記の未コミット状態は検証時点の記録。


## 2026-10-10: タスクトレイ設定と一時停止コマンド（0.26.10）

- 実装: タスクトレイ専用カテゴリ、クリック/ダブルクリックの検索式選択、自由グループ/トップレベル/区切り線、ドラッグ/上下ボタン/キー/配置先変更、グループ解除時の子保持。設定/終了はホストが末尾固定。ショートカットのトレイチェックを撤去。appdock.gestures.togglePauseを共通の検索/キー/トレイ/クリック経路へ登録しチェック状態を同期。共有draft/JSON/revision/saveを維持。
- 保存: trayMenuを正本とし旧trayCommandsは派生値。旧設定だけdiscover後に変換して原子的に保存、未知IDと明示空配列を保持。旧上限500コマンド＋500グループ＋一時停止も移行可能（新形式全項目上限1500）。
- 最終型検査・ビルド・Prettier・git diff --check成功。回帰171/171成功（artifacts/tray-menu-regression.log）。更新文書のローカルリンク100件に欠落なし。
- ソースGUI: tray-menu-ui-1791558765880で移行/不正名拒否/固定項目追加拒否/混在グループ/改名/区切り/移動/並べ替え/ドラッグ/共有draft/保存/破棄/停止コマンド保持/空配列/再起動を確認。実Tray構造とcallback、単/ダブルクリックの別実行、一時停止のIPC/メニュー/キー実行とチェック、利用不可クリック時のWindow復帰も成功。両テーマ、1280/1000/900幅のはみ出し/左揃えと画像を確認。
- 既存GUI: navigation-1791558771295の17群、shortcuts-ui-1791558780461の7群（実Windows登録競合/解放/再試行を含む）、host-commands-1791558786125のrestart/quit/プロセス終了、gestures-ui-1791558788649の編集4群成功。ジェスチャーは明示UI-only、入力フックの実操作は今回再検証していない。
- 初回sandbox回帰はTemp内renameのEPERM等で失敗。プロジェクト内TEMP/通常権限で再実行し最終成功。sandboxのpnpm supply-chain検証待ちは中断し、ローカルNodeと通常権限のdev.batで検証を完了。GUI試験の未保存マーク付きカテゴリの検索、停止snapshotから画面反映までの待機、追加コマンド分の旧件数期待値を修正。共通buttonスタイルによる中央寄せを修正し最終GUIへ反映。
- publish.bat終了0。publish/AppDock.at365.exeは142527598 bytes、SHA256 020357ea0447823e66e53f411ac9d0d71199dec3c2c328d88210944d34bdb1ea。update.jsonの版0.26.10/size/hashと一致（artifacts/tray-menu-publish-result.json）。単一EXEのコピーによるtray-menu-ui-1791558966808はok:true、コピーhash一致。移行/全編集/保存/破棄/両テーマ3幅/停止時保持/空構成/再起動を確認。portableはCDP経由のrenderer検証、実Trayイベント検査はソース版で実施。
- 既存AppDock.at365-all-in-one-0.26.2.zipはhash/size/mtimeMs不変（artifacts/tray-menu-bundles-before.json）。未変更Applet再発行、全体ZIP生成/整理、実利用deploy、commit/push/GitHub Releaseは実施していない。

## 2026-10-10 AppDock 0.26.11 保存導線とWebApplet管理

- 設定/Applet詳細のページ見出し下に共通SettingsToolbarを配置し、タブ内・並べ替え欄の保存を集約。全共有draftを保存する。Webアカウント操作は専用ファイルで即時反映を維持。
- 未保存で他ページへ移ると本体Window上部へnative WebContentsView通知を表示。背景レイアウトを変えず、保存・キャンセル既定dialog付き破棄・入力不備/競合から編集元へ戻る。保存失敗は浮動通知に表示して本文を押し下げない。専用preload/送信元mainFrame/URL照合と二重操作ガードを実装。
- WebAppletの追加/管理をApplet一覧の組み込み管理項目へ移動。設定タブ=サイト、ショートカットタブ=将来のサイト用初期値。個別サイトID/リボン/設定/sessionは維持し、管理項目はruntime snapshot/更新/並べ替えへ混ぜない。設定カテゴリを指定の9項目順へ変更。別Appletへ切り替えても4タブの選択を保持。
- 型検査、build、変更ファイルのPrettier、git diff --check成功。全本体回帰171/171成功（artifacts/settings-notice-unit.log）。初回sandboxではTEMP内のrenameがEPERM、Electronの起動も拒否された。project内の隔離TEMPと通常Windows実行で成功し、製品不具合として扱わない。
- 既存GUI: navigation 17群、applet-order 4群、web-applets 12群、applet-pages 7群成功。新仕様で変更した試験はタブ保持/保存入口/カテゴリ導線/role=statusの表示先を更新。navigationの旧「選択で説明へ戻る」期待値とWeb管理移動後のstatus locatorを修正した。GUIは直列・隔離profile、製品ソース/固定EXEのビルドを重ねていない。
- source最終専用GUI9群: artifacts/settings-notice-1791562372910/result.json。共通保存の同位置、4タブ保持、Web追加/初期キーのコピー、ホーム/Web上の保存、入力保持、無効JSONとrevision競合の拒否/下書き保持/本文位置不変、通知に一般host/Nodeブリッジがないこと、破棄dialog応答のキャンセル/確定、両テーマ/サイズ/--restore-view起動を確認。
- Gmailは既存Appletのオフラインfixtureで入れ子のWebContentsView上に通知が最前面となり、検索/選択account/メールWebContentsを保ったままhost draftを保存できた（artifacts/applet-pages-1791562206131/result.json）。実サイト認証/実メール到着・物理dialogのクリックは今回の範囲外。親Windowのcaptureだけでは子Viewが写らないため通知/remoteを個別確認、native View順も確認。
- publish.bat最終終了0。EXE=142,517,882 bytes、SHA256=4e68d7b1e55c7d5ce0d049a52247e3b8d80e175bd8c27f66af6d4bef7a024a82。publish/update.jsonのkind/id/version/payload/size/hashを照合。途中の表示調整も同じ版へ再発行し、同じ変更で重ねて版更新していない。
- 固定配布EXEの隔離コピーhash一致。専用GUI8群（artifacts/settings-notice-1791562376022/result.json）、WebApplet portable3群（artifacts/web-portable-1791562393375/result.json）、Applet順序portable4群（artifacts/applet-order-1791562418737/result.json）が終了0。保存/競合/復元起動、Web page/window入力/session、Gmail保存領域の保持、両テーマ/幅、並び順保持を確認。配布EXEの破棄dialogはGUI応答fixtureを使えるsource側で検証したものと区別する。
- 通常publishは本体だけ。旧AppDock.at365-all-in-one-0.26.2.zipのsize=317655348、SHA256=4819317bf7f49aa852515bb85543058f93a290adc0742f8491882fbbe17cbda6とmtimeを保持。未変更Appletの再発行・commit/push/公開/実利用deployは未実施。他チャットで追加されたartifacts整理文書を保持。
- 作業完了時の整理: 今回作成し終了/成功が確認できたsource通知試験だけ、直近3回を保持。旧settings-notice-1791561449412、settings-notice-1791561783732の2件を削除。対象の絶対パス/通常ディレクトリ/全配下非再解析ポイント/該当process不在を確認。1857230/2047485/2372910をsourceとして、2376022のportableと失敗/不明/他チャット/固定ビルド/Release証拠を保持（artifacts/settings-notice-cleanup.json）。artifacts改名・除外設定は変更なし。

## 2026-10-10 0.26.11のコミット・正式リリース依頼

- 上記の保存導線/WebApplet管理変更をユキちゃんの確認後、mainへコミットして正式Releaseへ公開する依頼を受領。既存のartifacts整理文書も保持してコミット対象へ含める。本体版は0.26.11を継続し、未変更Appletの版は増やさない。
- 正式Prepareは本体回帰/発行と6Appletの再発行・オールインワン検証・更新UI/復旧検証を行う。準備/アセットhash/公開後の匿名取得と更新チェック・保持3件の整理の実結果は、artifacts/release-0.26.11-settings-20261010-01/plan.jsonおよび隣接チェックログを正本とする。未完の結果を成功として扱わない。実利用先へのdeployは含めない。

## 2026-10-10 本体と同梱AppletのまとめたRelease

- ユーザーの追加指定により、リリースは未公開の本体（3asset）と全体ZIP内の未公開版Applet（各repoのupdate.zip/update.json）をまとめて判定・公開し、公開後検証に成功した今回の全repoを最新3件へ整理する手順へ更新。30.PROJECT/AGENTS.md、本体AGENTS/DEVELOPMENT/docs/RELEASING.mdへ反映。公開済み同版はskip、同梱だけの版更新や同版asset上書きはしない。release.ps1は本体用のままで、作業者がApplet個別公開まで行うことを明記した。
- 既存の本体0.26.11 planはverifiedで、通常EXE/feed/フルパッケージは公開済み。この本体と6Appletの製品ソース・版・配布物は再ビルド/変更せず、検証済みbundleと各Appletの元ZIP全ファイルをsize/SHA256で再照合した。6件すべて一致（artifacts/release-bundled-applets-20261010/bundle-match.json）。初回のWindows PowerShell 5.1ではUTF-8 JSONを既定文字コードで誤読して停止、-Encoding UTF8を明示して再実行後に成功。製品ファイルの文字コードは変更なし。
- 全6repoのremote main・タグ・公開版を確認し、未公開のGmail0.9.1（b3bc366）、Watch0.1.2（d21d6b4）、WebBrowserTools0.3.1（f7bdbd8）を自身のrepoで下書き/2asset照合/正式公開。既存のclean mainとbundle commitが一致し、追加commit/push不要。WallpaperSlideshow0.4.0、WindowMover0.2.1、WindowsTools0.1.1は同梱版の公開タグ/commit/feed ID・版を確認してskipした。
- 公開3repoの全6assetを匿名で取得しsize/SHA256を検証、各tag/remote main/latest/ノート/digest一致。実PortableUpdates.check()の一括結果は3件すべてavailable、同梱version、installable:true（host0.26.11、実インストールなし）。成功をrepo別に保存後、共通release-retention.cjsで各repoは2件保持/削除0・complete。既に整理済み本体は3件、skipした3repoは各1件。全7repoの最終latest/保持件数を読み取りで確認し、公開済み本体/skip repoは変更なし。
- 公開URL: [Gmail0.9.1](https://github.com/5ynonym/Applet.Gmail.at365/releases/tag/v0.9.1)、[Watch0.1.2](https://github.com/5ynonym/Applet.Watch.at365/releases/tag/v0.1.2)、[WebBrowserTools0.3.1](https://github.com/5ynonym/Applet.WebBrowserTools.at365/releases/tag/v0.3.1)。ノートと封印した配布物、draft/public/verified状態、個別更新結果、整理レポートはartifacts/release-bundled-applets-20261010/plan.jsonと各*-verified.json/*-retention-*.json、全7repo一覧はfinal-roster.json。plan.phaseはcomplete。
- 手順文書の相対リンク69件と追加見出しリンク3件、git diff --check成功。今回は製品ソース変更なしで、新しいruntimeテスト/本体版更新/本体再発行/実利用deployは不要。既存の正式Prepareと各Applet版の検証を使用した。Release記録と失敗/不明/他作業のartifactは保持し、今回の手順作業でテストフォルダー削除は行っていない。

## 2026-10-10 設定のPC間同期・保存領域の設計相談（未実装）

- 現ソースのSettingsStoreは親フォルダーをfs.watchで監視し、250ms後にJSON/スキーマ検証してchangedを発行する。index.tsはテーマ/ページ/トレイ/WebApplet/キー/Applet設定へ反映し、useSettingsEditorはdirtyな下書きを保持する。revisionは各プロセス内の値であり、未到着の別PC更新の競合を解決する仕組みではない。
- 隔離コンパイルした現SettingsStoreで6項目を確認（終了0）: 外部の直接編集、壊れたJSON中の直近正常値保持/元ファイル保持、壊れた編集後のrename置換、監視通知前の古い下書き保存拒否、壊れたJSONでの新Store起動失敗、永続backupなし。証跡は`.artifacts/settings-sync-review-20261010/result.json`。TypeScript CLIでsettings.tsを独立出力へnoCheckで変換した動作確認であり、全体型検査/実Electron GUI/実2台同期を行った結果ではない。既存out/publish/実利用設定は未変更。
- 調査手順の修正: TypeScript 7はtranspileModule APIを提供しないため最初のrequireがMODULE_NOT_FOUNDで停止。個別ファイル指定CLIのTS5112は--ignoreConfigで解消。最終隔離コンパイルと動作確認は成功、製品変更不要。
- `.appdock`はChromium、WebApplet/Gmailの永続session、暗号化secrets、Applet storage、Window状態、ログ、更新journalなどを含む。丸ごとの稼働中PC間同期は避ける。WebAppletはsettings.json内のaccountIdと別accounts.jsonを対応させるため、settings.jsonだけの同期では相手PCに同じ枠がなくなる場合がある。accounts.jsonのpendingDeletionはPC内の物理回収記録で、共有する枠名/IDと分離が必要。Gmailのselected/音声絶対パス等もそのまま共有しない。
- アリスの提案（未承認/未実装）: EXE隣のsettings.jsonを共有し、同期利用時のPC専用データ/override/正常設定backupをLOCALAPPDATAへ保存。配置ごとに分離し従来portable保存も維持。Webの枠名/IDは共有名簿へ抽出できるが、Cookie/token/session/secretsはPC専用。ファイル到着順が異なる名簿/設定は参照待ちにし、外部削除を認証データの即時物理削除へ直結させない。
- 監視に書込み安定待ち/有限再試行/定期照合/復帰時照合/同値抑制を追加し、受信設定を書き戻さない。正常値だけのPC内世代backupと起動時fallback/明示復元を追加する。未保存draftの競合を通知し、PC固有起動登録/画面/絶対パス等は共有希望値と実際のPC状態を分離する。単一JSONのファイル同期だけでは2台の未同期同時編集を完全に自動mergeする保証はない。
- 参照: Electron safeStorage公式 https://www.electronjs.org/docs/latest/api/safe-storage 、DPAPI公式 https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata （通常は同じユーザー/PCで復号）、Node fs.watch公式 https://nodejs.org/api/fs.html#fswatchfilename-options-listener （通知方式の環境依存）。
- 実装する場合の確認項目: 2個の隔離profileの双方向編集/rename・削除再作成・途中JSON・ロック・復帰、dirty draftと受信競合、backup/壊れた状態からの再起動、別PC相当の名簿到着順/未ログイン枠、同PC旧保存先からの停止中移行とrollback、Gmail/WebApplet分離/削除、実単一EXEでの反映/再起動専用項目。今回製品ソース/版/発行/同期サービス設定の変更なし。

## 2026-10-10 スタートアップ登録・管理者起動（0.26.13）

- 一般設定へスタートアップ/常に管理者/現在の実権限・登録状態/状態確認/管理者再起動を追加。共有draft/JSON/revision/saveを使用し、既定OFF。元portable EXE・配置先・SIDの専用タスク、InteractiveToken/LogonTrigger/3秒遅延/電池制限なし/実行時間制限なし/IgnoreNew/対象ユーザー限定DACLを使用する。保存競合/失敗は元XMLへ戻し、管理者再起動は同一ユーザーのヘルパー確認後に元PID終了を待つ。仕様はdocs/launch-settings.md。
- 最終型検査成功、全回帰181/181（launch追加10件含む）。生成した通常/管理者/再起動スクリプトを実Windows PowerShellのParserで構文確認。UACキャンセル・同時保存・競合・別ユーザー応答・標準ユーザー拒否を回帰で確認。最初のsandbox回帰は一時フォルダー/Windows APIのアクセス制約で失敗し、通常Windows環境で再実行成功。旧設定期待値の新しい既定2項目も更新した。
- SetVersionで0.26.13へ更新、publish.bat最終終了0。単一EXE142,516,995bytes/SHA256 61a05c72bf5969111669f797b6eb3ab89e1a22e8d6211283237276970e2e20f4。feed/隔離コピー一致。梱包asarのwindows-launch.jsが最終outと完全一致し、pipe確認を含むことも照合。文書相対リンク107件成功。証跡.artifacts/launch-publish-final.log、launch-regression-final.log、launch-final-check.json。
- 固定単一EXEの専用GUI6群成功（.artifacts/launch-settings-1791608067689/result.json）。日本語/空白/引用符を含むEXEパスで共有draftの副作用なし→保存→実タスク登録→Task Scheduler.Runで実EXE起動/既存instanceへの復帰/終了結果0→保存・再起動保持→登録解除を確認。通常ユーザーの管理者設定拒否でsaved値/タスク/draftを保持。持ち込んだ管理者希望値は通常起動を継続し、起動ループを作らず結果表示/希望OFF/状態再確認が成功。dark/lightの実反映を待ち、1280/900/700pxの表示・操作・非はみ出しを画像でも確認。全検証タスクを解除済み。
- 既存の共通保存・未保存通知GUI8群も同じ発行EXEで成功（.artifacts/settings-notice-1791607825044/result.json）。タブ/共有draft、Web表示上の通知、JSONエラー/競合、テーマ/幅、保存・再起動を確認。実Windowsの保存失敗注入では以前のタスクXMLが完全一致で復元され、検証タスクを解除（.artifacts/launch-rollback-check/result.json）。
- Windows実機でSIDがユーザー名へ、空のArgumentsがnullへ変換される動きを確認し、同一SIDへの解決/string正規化へ対応。途中のGUI停止は試験側の未保存マーク付きカテゴリのexact照合、既定RunLevelのXML省略、テーマ/状態確認の反映待ちを修正して最終成功。初回発行後にヘルパー確認/長い引数対策を加えたため、同じ版を最終再発行して固定し、その後は製品ソースを変更していない。
- 未確認: 検証Windowsユーザーは管理者グループに所属しないため、UAC承認後の実管理者トークン・Highest登録/解除・管理者上のジェスチャー動作は未実施。実Windowsサインインも未実施。これらを実行済みと扱わず、UAC承認は自動化していない。通常ユーザーへHighestが管理者権限を付与するとは案内しない。
- テスト整理: 今回方式のlaunch-settings成功3回、settings-noticeはsource3/portable3を保持し、古い成功の削除候補0/削除0。試験終了と専用プロセス終了・タスク解除を確認。途中失敗4回/完了証拠なしの以前の記録/単独rollback証拠/固定ビルド/Release/他作業資料は保持。通常publishのみで未変更Applet再発行・全体ZIP生成/整理・commit/push/Release/実利用deployなし。並行する同期設計相談の文書差分を保持。

### 同期設計の追加相談: Gmail専用枠とユーザー登録アセット

- ユーザーはWebAppletの枠を同期し、Applet.Gmail専用枠自体と枠に紐づく設定を同期しない構成を希望。プロフィール画像等のユーザー登録アセットはAppDockフォルダーごと同期したいと明示。現コードはWebAppletのWebProfileStoreとGmail等のWebAccountControllerが別保存領域なので、保存先をホスト側で分けられる構造。Gmail専用accounts.jsonは枠ID/名前/選択/枠別sound/monitoringを保存し、全体のunreadOnly等はextension settingsにある。
- 現profile.tsはavatar.pngをbaseDirectoryへ保存し、settings.jsonでは固定相対名を参照する。index.tsのsnapshotは画像mtimeをURLへ付加するが、独立した画像変更を通知する監視はない。素材だけの同期変更にも再表示通知と参照キャッシュ更新が必要。画像より先に設定が届いても入力や参照を削除しない設計にする。
- 現sound-assets.tsのimportSoundは指定root内soundsへコピーし絶対パスを返す。pruneSoundsはそのrootのローカル参照外音声を削除するので、そのまま共有素材rootに向けない。登録素材は共有root内の相対パス/安定IDで参照し、Gmailの枠ごとの割当はPC専用のまま保持。共有素材の物理削除は明示操作等の別方針が必要。
- 提案の保存分離: AppDock配置内settings.json/avatar.png/.appdock内共有枠名簿・ユーザー登録assets、LOCALAPPDATA内Gmail枠/全Webのsession/秘密情報/PC状態/キャッシュ/更新journal/backup。生成キャッシュとユーザー登録素材は区別する。現PCの旧認証/枠は停止中移行で保持し、別PCへ枠を転送しない。今回コード・版・発行・実利用データへ変更なし、ソース読取確認のみ。

## 2026-10-10 パスキー認証の実現性調査（製品実装なし）

- ユーザー報告: WebAppletの https://auth.openai.com でWindows Helloパスキー認証に一度失敗したが、製品コードを変更せずパスキーボタンを再度押すと指紋認証が表示され、ログインに成功した。追加確認では新しいアカウント枠でも成功。初回はパスキーボタン押下後、指紋画面が表示されないまま失敗画面へ遷移した。指紋照合中の失敗とは区別し、サイトの認証要求準備からWebAuthn/Windowsの画面表示までを切り分け対象とする。実WebAuthn呼出しやOSへの到達はログ未取得で不明。現在の環境・同サイトで使用可能なことをユーザーが確認。原因は未特定。Gmailの実Google認証は未検証。
- 現ソース/ローカルruntimeはElectron 44.6.0。WebAppletはWebAppletManager/AppletSurface、GmailはWebAccountControllerで、いずれもホストのWebContentsViewと専用sessionを使用。通常のPermissionRequest/Checkは全拒否。select-webauthn-accountの処理は製品ソースに存在しない。WebAppletは許可origin外の認証遷移を止め、新規Window要求を現在のViewへ読み替えるので、別サイトへの対応では遷移・popup依存も切り分ける。
- 隔離試験: .artifacts/passkey-investigation-20261010/probe.cjs / result.json。ローカルHTTP localhost、専用userData/メモリsession、非表示WebContentsView、Node無効/sandbox/contextIsolation有効。通常の権限を全拒否したままCDP仮想CTAP2 resident credentialを作成し、作成成功→選択listenerなしのgetはNotAllowedError→fixture用選択listenerありでget成功。通常のPermissionRequest/Check呼出しは0、select-webauthn-accountは1回。試験用だけでfocus emulationを有効化。実サイトへの通信、実パスキー作成/取得/列挙、実アカウントへの認証は行っていない。
- 仮想authenticatorを追加する前の能力判定はsecure/api/platform/conditionalすべてtrue。ただし能力判定や仮想authenticator成功は、実Windows Helloや入力欄の自動候補UIの成功を意味しない。sandbox内起動は0x80000003で終了し結果未生成。通常Windows環境で同一probeを実行しexit 0、結果を読戻し確認。
- 結論: Windows Helloパスキーは現構成で利用可能（上記OpenAIサイトはユーザー実証）。一律権限拒否をパスキー失敗の原因と断定できず、全権限を許可する修正は不要。選択eventが必要な認証経路にはホスト共通の選択UI/取消処理を追加する余地があるが、今回の初回失敗の原因とは未確認。Windows標準UI側で選択済みの応答はChromiumが選択eventを経由せず成功させる場合がある。Chrome/Google Password Manager保存とWindows Hello保存は区別する。
- 初回失敗の候補（推測）: 認証challenge/セッションの期限・取消、ページ遷移やフォーカスのタイミング、Windows/WebAuthnの一時的な状態。再発時は時刻、画面のエラー文、指紋画面が出る前/後、再押下/再読込での変化を記録し、秘密値・認証URLのquery・credential IDをログへ出さない。Windows 11 24H2以降は設定「プライバシーとセキュリティ > パスキーへのアクセス」のアプリ許可も確認対象。ただし今回の成功後に許可拒否を原因と断定しない。
- 参照: [Electron session/選択event](https://www.electronjs.org/docs/latest/api/session#event-select-webauthn-account)、[Windowsパスキーとアプリ許可](https://learn.microsoft.com/en-us/windows/security/identity-protection/passkeys/)、[Googleの保存環境](https://developers.google.com/identity/passkeys/supported-environments)、[Chromiumの選択済み応答分岐](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/webauth/authenticator_common_impl.cc)。オンラインmainのソースは設計理解の補助で、同梱版の根拠はローカルelectron.d.tsと44.6.0実行結果。OpenAI公式ログインURLを確認したが、初回失敗を特定する公開資料は得られていない。
- 製品ソース・版・publish・実利用ログイン情報は変更なし。既存の同期対応差分を保持。調査記録とAGENTSだけ追記し、commit/push/Release/deployなし。
## 2026-10-10: 0.26.16 共有フォルダーをdataへ変更

- 共有名簿・登録音声・アバター原素材の保存先をEXE隣の小文字dataへ変更。settings.jsonの配置、LOCALAPPDATA/at365/AppDock/profiles/配置IDのPC専用rootは維持。旧.appdockの自動移行・削除なし。古い画像参照は読み取り互換のみ残す。旧領域のPC専用データ検出を維持し、固定EXE試験で旧ファイルの不変も確認。
- 最終型検査と190/190回帰成功（.artifacts/data-folder-typecheck.log、data-folder-regression.log）。source同期GUI11項目、プロフィールGUI7項目、Gmail総合GUIが成功。固定0.26.16 EXEの通常起動2配置GUI11項目も成功（settings-sync-ui-1791615128338/result.json）。LOCALAPPDATAをfixture内へ向け、実利用データを変更しない。Gmail音声一覧の両テーマ画像を保存、lightを目視確認。実2台・実同期サービス・Google認証は未確認。
- 固定EXE smoke成功（smoke-1791615191737/smoke-result.json）、data/assets/profile/avatar.pngの保存と実表示を確認。publish.bat終了0。最終EXE142527588bytes、SHA256 456014e1295b6d3f8d66cafbcb359f60933195454b0399e534999c204485ac1e。feed/梱包59ファイル/updater一致、文書ローカルリンク182件確認（.artifacts/data-folder-final-check.json）。既存オールインワンZIPと未変更Gmail0.9.2配布ZIPは不変。
- 完了時整理: source同期成功3回、portable-production-path成功2回、旧portable成功1回を保持。旧smoke/プロフィール/Gmailの実行方式不明、失敗・再利用・認証資料を保持し、今回削除0。Wallpaperのprotocol一時画像はランナー終了時に削除済み。固定ビルド/Release出力を整理対象にしない。
- ユーザーの追加指定により今回対応したAppDock/Gmail/WallpaperSlideshowを各repoでコミットする。各モジュール自身のpublishへ発行済み。外部公開・push・実利用deploy・同期設定変更なし。
## 2026-10-10: 0.26.17 空のWebアカウント枠からの復旧と操作エラーログ

- 旧settings.jsonのWebApplet参照が残り共有accounts.jsonが未到着の場合、同期待ちガードが0件からの追加も拒否していた。WebProfileStore.addで0枠からの明示追加だけを許可し、起動時の空名簿自動生成・旧参照の自動置換は行わない。直前に届いた未反映名簿・破損名簿・既存枠がある一時欠落は上書きを拒否し、既存Cookie等を削除しない。
- ホスト画面のdock:* callbackの同期throw/非同期rejectを共通handleでerrorログへ記録し、元のエラーも返す。操作名とエラーメッセージだけを追加し、IPC引数は記録しない。既存の送信元/Frame/URLガードを維持。
- 型検査と191/191回帰成功（.artifacts/web-account-recovery-typecheck.log、web-account-recovery-regression.log）。一時欠落保護の追加assert後、設定同期6/6の対象回帰も成功。直接sandbox実行はTEMPのatomic renameでEPERMとなり、許可された通常Windows実行で成功。失敗ログをweb-account-recovery-sync-regression-sandbox-failed.logへ保持。
- 新scripts/web-account-recovery-ui-test.cjsはsourceと固定EXEの両方で5項目成功。旧登録の保持、画面での0枠からの追加/再割当/保存、同期・非同期エラーのログページとPC専用host.logへの記録、再起動、既存の空名簿からの再追加、旧ログインmarkerの保持を確認。sourceはweb-account-recovery-1791617699286、通常起動EXEはweb-account-recovery-1791617848978。各errors-in-log-page.pngを保存しsource画像を目視確認。初回fixtureは起動時の既定値初期化を考慮しないraw settings不変assertで失敗し、旧items保持の検証へ修正。失敗フォルダーを保持。
- 固定EXEの従来2配置同期GUI11項目も成功（settings-sync-ui-1791617905884/result.json）。ログ記録によるdirty保存拒否・正常backup/破損起動・共有枠/素材・Gmail個別枠等の挙動を維持。実2PC/同期サービス/実ログインは未確認、LOCALAPPDATAをfixture内へ隔離。
- publish.bat終了0。最終EXE0.26.17は142527632bytes、SHA256 ee7ad7302691926e801b686eb190ff7f8e901fba3a7776c3cdb2f8d05a2cf1c8。feed/梱包59ファイル/updater一致、182ローカルリンク確認（web-account-recovery-final-check.json）。旧全体ZIP不変、未変更Appletの再発行なし。
- 完了時整理: recovery成功はsource/portable各1回、従来2配置portable-production-path成功3回を保持。失敗/方式不明/認証・再利用資料/固定ビルド/Release記録を保持し削除0。前の継続依頼の範囲で本修正をAppDockへコミットする。push/Release/実利用deploy/同期設定変更なし。

## 2026-10-10 ショートカット画面の再設計（0.26.19）

- 設定ページをキー別グループへ変更。同キー内の保存順を表示番号・上下操作・ドラッグに揃え、他キーの保存位置を保持。未割り当てのコマンド行を撤去し、未知/無効/停止中の保存済み割り当てを保持。検索/登録エラーはグループ全行表示。
- 上部はキー/特殊キー/条件の入力後にコマンドを選択し、同キー末尾へ追加。グループ追加はコマンドの既定条件を使用。追加後は入力・絞り込み・表示位置を保持し、元ボタンへpreventScrollでfocusを戻す。4項目メニュー、条件プレビュー付きコマンド変更、確認付き削除を実装。
- Applet詳細は独立した表示専用一覧。宣言/動的カタログ順、キーと条件の組、未割り当て/無効/利用不可、互換別名の割り当てを表示。共有draftへ追従し、一括初期化を含む編集操作を撤去。組み込みWebApplet管理のテンプレートは維持。
- 型検査/build/変更コードのPrettier/差分検査成功。関連回帰25/25（keybindings、dynamic-commands、applet-order、gestures）。標準回帰全体は今回の実装段階では未実行。文書ローカルリンク125件の存在を確認。
- ソースGUI成功: shortcuts-ui-1791642534882（7群）、applet-order-1791642624600（4群）、applet-default-shortcuts-1791642627712（3項目）、keybindings-1791642639367（10群）、navigation-1791642774093（17群）、gestures-ui-1791642873291（編集UI4群）、ribbon-layout-1791642875831（3群）。Windowsグローバル実入力/登録競合・再試行、Applet Web/Gmailオフライン本文、共有draft/JSON/競合/破棄、両テーマ/3幅を含む。実メール認証・全IME/キーボード配列は未検証。
- 初回Electronはsandbox内のプロセス起動拒否で停止し、通常権限の隔離profileで成功。旧試験の再起動期待値と停止中の非宣言コマンドの表示先を新仕様に修正して最終成功。通常ジェスチャー試験gestures-ui-1791642840196は入力先HWNDを前面化できず停止。製品の入力処理は変更せず、既存APPDOCK_GESTURE_UI_ONLY=1で今回影響する編集UIを確認。物理ジェスチャー入力は今回未確認として区別する。
- publish.bat終了0。本体単一EXEは142522091 bytes、SHA256 `e11b923b947f86d1ae2dc97a96d3be2242f542f29da179ca3312438302dfc41f`。update.jsonの0.26.19/size/hashと一致。既存all-in-one-0.26.11.zipはsize/hash不変、未変更Applet再発行/新全体ZIP/commit/push/Release/deployなし。
- 固定発行単一EXEの隔離コピーでshortcuts-ui-1791643039848の7群成功。同キーの跨提供元移動、上部/グループから連続追加して表示位置とfocus保持、条件変更プレビュー、キー移動とDelete記録、空グループ消去、Appletの複数ペア/無効/互換別名、両テーマ/1280・900・700px、保存/再起動を確認。EXEコピーのSHA256は発行物と一致。追加フォームとApplet一覧のスクリーンショットを目視確認。
- 発行/型検査/関連回帰/固定EXEのログと成果物照合は`.artifacts/shortcut-redesign-20261010/`、各GUIのresult.jsonは上記profile内。旧試験の失敗/起動不明資料は保持。
- 完了時整理: 方式と成功が確認できるsource/UI-onlyの古いgestures-ui-1791555815134だけ削除（3891583 bytes）。絶対パス/配下reparseなし/現旧パスprocess参照なし/関連processのcommandline取得/全ファイル排他openを確認。直近成功3回を保持。他方式の不明資料・過去配布版/再利用資料・Release/固定ビルドは保持。cleanup-audit.json/cleanup-result.jsonに記録。

## 2026-10-11 Appletショートカットの編集パネル（0.26.20）

- 既存の提供元コマンド順一覧へ＋、キー/条件ペアの編集、編集/確認付き削除メニューを追加。小さなnative dialogでキーキャップ表示、Ctrl/Alt/Shiftと特殊キーの選択、条件、有効状態を編集する。適用は共有draftへ反映、保存は既存toolbar。Applet画面に実行順操作/導線は追加しない。
- 新規はowner/有効、追加とキー変更は同キー末尾。空キー/対象0件の適用を拒否、元行が外部更新されたら上書きしない。取消で変更を残さず、追加後の表示位置と操作元focusを保持。dialog中はglobal登録と画面ショートカットを抑止し、終了時に復帰する。Tabは移動、Escapeは取消、Enter/Delete等は記録欄ではキー入力として扱う。
- 型検査/build/変更コードPrettier/git diff --check、文書ローカルリンク124件成功。関連回帰19/19（keybindings/dynamic-commands/applet-order）成功。標準全回帰は未実行。
- ソースGUI: shortcuts-ui-1791644537426の10群、navigation-1791644544867の17群、applet-default-shortcuts-1791644871267の3項目、applet-order-1791644872131の4群成功。キー記録/特殊キー/対象選択/無効状態/取消/外部更新拒否/共有draft保存/削除確認/連続追加/実行順保持/再起動、両テーマ3幅、既存設定とジェスチャー編集の列境界を確認。
- 初回sandbox Electron起動失敗は通常Windowsの隔離profileで解消。版更新後のsandbox pnpm自動依存確認がstack overflowしリンク生成が中断、通常Windowsでdev.bat install --frozen-lockfileを実行して固定依存を復元。lockfile/依存版を変更せず、型検査/整形/通常publishを再実行し成功。失敗ログも保持。
- publish.bat終了0、単一EXE0.26.20は142534752 bytes、SHA256 b309ca51e3dcf13d5b734c5d062a01e60c776cdf24e87a7bd019921dc5f12fcd。update.jsonと一致。固定EXEコピーのshortcuts-ui-1791644835150の10群成功、コピーhash一致。最終EXEの編集パネルを目視確認。旧all-in-one-0.26.11.zipはsize/hash不変、未変更Applet再発行なし。
- 全IME/キーボード配列、実サイト認証、物理ジェスチャーは今回未検証。製品の保存形式/dispatcher/入力フックは変更しない。commit/push/Release/実利用deployなし。
- 証跡は.artifacts/applet-shortcut-edit-20261010（開始時の日付）に型検査/回帰/publish/GUIログ/成果物照合/文書リンク/整理監査を保存。試験プロセス終了確認済み、既知のソースshortcuts最新3件を保持。旧版/再利用検証・方式不明・失敗・固定ビルド/Release記録を保護し、追加の安全な削除候補はなく削除0。

## 2026-10-11 Applet一覧の左寄せと即時削除（0.26.21）

- 割り当てペアのbuttonに残っていた共通justify-content:centerをflex-startへ上書きし、左右paddingを揃えて未割り当てとキーの左端を統一。
- AppletShortcutOverviewのBindingActionsだけconfirmDelete=falseを指定し、削除を選ぶと対象IDを共有draftから直接除く。保存前は全体破棄で復元できる。設定ページとジェスチャーの確認動作は既定値trueで保持。
- 型検査/build/整形/差分検査成功、文書リンク43件成功。低影響のUI変更のため標準単体全回帰は再実行せず、発行した固定EXEのshortcuts-ui-1791645381775で10群を検証。左端座標の一致、確認dialogなしの削除、保存前の破棄による復元、連続削除・保存再起動、既存の設定ページ確認、両テーマ3幅が成功。Applet一覧のスクリーンショットを目視確認。
- publish.bat終了0。単一EXE0.26.21は142518132 bytes、SHA256 72785c150c80343f124db51595a74d69550ce5e453b8c72e2d90ee673ded5fa6。feedと検証コピー一致、旧全体ZIP hash不変。証跡は.artifacts/applet-shortcut-polish-20261011。
- 完了時整理は試験終了を確認しportable最新3件（1791645381775/1791644835150/1791643039848）を保持。旧版/再利用/方式不明/失敗資料を保護して削除0。未変更Applet再発行/commit/push/Release/deployなし。

## 2026-10-11 設定ショートカットを全コマンド一覧へ統一（0.26.22）

- 設定ページを未割り当ても含むフラットなコマンド一覧へ変更。AppletとShortcutCommandList/編集dialogを共用し、提供元・ID・複数のキー/条件・無効状態を表示。停止中/未確認の保存済みコマンドと割り当て済み互換別名も保持。キー別グループ、上部追加フォーム、実行順操作を撤去した。
- 検索/割り当て状態/件数/解除を一覧の見た目に揃えた。＋から追加、ペアから編集、確認なしの削除を共有draftへ反映し、既存toolbarで保存する。追加後の自動スクロールなし。条件変更は既存順序を維持、追加/キー変更は同キー末尾。フィルターで削除行が消えた場合は一覧へfocusを戻す。登録エラーの表示・再試行と入力中の表示キャッシュを維持。
- 型検査/build/整形/差分検査成功。keybindings/dynamic-commands/applet-orderの関連回帰19/19成功。標準全回帰は今回未実行。従来UIセレクターを更新したhotkeys/preferencesのスクリプトは構文・整形確認のみで、実GUIは今回未実行。文書ローカルリンク126件の存在を確認。
- ソースGUI: shortcuts-ui-1791646130507の7群、navigation-1791645939592の17群、applet-order-1791645882978の4群、keybindings-1791645886142の10群、ribbon-layout-1791645896744の3群が成功。全コマンド/未割り当て/検索/複数ペア/既定条件/追加・変更・即時削除/共有draft・破棄/実行順の保持/保存再起動、Windows実入力と登録競合・再試行、Applet Web/Gmailオフライン本文を確認。実サービス認証、全IME/キーボード配列、物理ジェスチャーは今回未検証。
- publish.bat終了0。固定単一EXE 0.26.22は142531222 bytes、SHA256 `ba07c8fdd84549614e2538f2ad50e567c15d035f2ea75ae2c079a2d22ca63817`。update.jsonの版/size/hashと一致。固定EXEの隔離コピーshortcuts-ui-1791646515381の7群成功、コピーhash一致。設定一覧とApplet編集を両テーマ/1280・900・700pxで確認し、最終EXEのdark900/light700画像を目視確認。既存all-in-one-0.26.11.zipはsize/hash不変。
- 初回固定EXE試験shortcuts-ui-1791646427423は、競合用の別hostを閉じた後に対象Windowが非アクティブのままCDPで編集を開き、一時停止assertが失敗。hostは非アクティブ時のキー記録を意図的に拒否する。試験で既存appdock.openから対象を前面へ戻すよう修正し、同一hashのEXEで再実行成功。製品のfocus/入力ガードを変更せず、失敗記録も保持。ソース試験の曖昧な検索語と旧UIラベルのassertも新仕様へ修正して成功。
- 証跡: `.artifacts/shortcut-command-list-20261011/`に型検査/回帰/GUI/publishログ、成果物照合、文書リンク、整理監査を保存。完了時整理では成功済み中間sourceのshortcuts-ui-1791644461438だけ削除（12244169 bytes）。絶対パス/配下reparseなし/process参照なし/全ファイル排他openを確認。source/portable各直近成功3件を保持し、旧版再利用・方式不明・失敗・固定ビルド・Release記録は保護。未変更Applet再発行/commit/push/Release/実利用deployなし。
## 2026-10-11 ショートカット再設計のコミット前検証（0.26.22）

- 対象は0.26.19〜0.26.22の設定/Appletショートカット再設計と関連仕様・試験（33ファイル）。本体/SDK/保存領域/依存版への追加変更なし。型検査、標準dev.bat testの194/194、変更コードのPrettier、差分検査が最終ステージ済みtree `5cafdb13f22e250f8dd27c47e72aca06b49bc76b`で成功。検証後の追加差分は本記録のみ。
- GUIは直列・隔離profileでpreferences7群、hotkeys9群、navigation17群、applet-order4群、applet-default-shortcuts3項目、keybindings10群、ribbon-layout3群、gestures編集4群、固定EXE shortcuts7群を確認。各結果と全ログは`.artifacts/commit-validation-shortcuts-20261011/`。標準回帰の再ビルド前後でGUI対象のout内容は同一。初期値試験の整形修正後は当該GUIも再確認した。
- hotkeysの旧fixtureはApplet状態を先に保存したため初期割り当てが追加されなかった。初回インストールの初期化を適用してから有効状態を設定するよう試験だけ修正。実利用中のPause等と競合するため、既存登録を維持したまま隔離fixtureをF16/F20/Ctrl+Alt+F9へ変更する明示モードを追加。実Windows入力、native Watch実行、登録競合と再試行、記録中停止、条件切替、Applet停止/再開、終了後解放が成功。Pauseそのものの実入力試験は実施せず、初回/競合失敗ログを保持。
- ジェスチャーは共通メニュー/パレットのUI変更範囲をAPPDOCK_GESTURE_UI_ONLY=1で確認。入力フックは変更しておらず、物理ジェスチャーは今回のコミット検証対象外。実サイト認証・全IME/キーボード配列も未検証として区別。
- 確認済みpublishの0.26.22を再梱包せず、固定EXEのshortcuts-ui-1791646977579で編集/保存再起動/両テーマ3幅を再確認。142531222bytes、SHA256 `ba07c8fdd84549614e2538f2ad50e567c15d035f2ea75ae2c079a2d22ca63817`はfeedとコピーに一致。製品ソース/配布物は動作確認後の内容を維持。
- Node24.21.0/pnpm12.10.1、OS/.NET、検証tree、コマンド・終了コード・ログhash、Watch/Gmailの依存commitと使用fixture hashを上記証跡へ記録。現在の検証を将来再利用する際は最終treeと証跡を照合する。試験プロセス終了を確認し、最新3件/今回の再利用証跡/旧版・不明・失敗資料を保持、追加削除0。commitのみ実施し、push/Release/deployなし。
## 2026-10-11 実行順の専用パネル（0.26.23）

- 現在のコマンド一覧を維持し、設定上部の「実行順…」と設定/Appletの割り当てメニュー「このキーの実行順…」からShortcutOrderDialogを開く。キー選択、番号、コマンド/提供元/完全ID/条件/状態、ドラッグ・上下ボタン・つまみのAlt＋上下を実装。元の検索やApplet範囲に依存せず同じキーの全割り当てを表示。空/1件/無効/未確認にも対応し、多数の割り当ては一覧だけをスクロールする。
- キーを切り替えてもパネル内の変更を保持。適用で変更キーの既存スロットだけを共有draftへ反映し、別キー/他設定の新しい変更を保持。編集対象キーに外部追加/削除/状態変更/並べ替えが届いた場合は全適用を拒否する。取消/Escape/×では一時変更を捨て、元focusへpreventScrollで戻す。永続化は既存の全体保存。パネル表示中のキー抑止、同一コマンドの重複除去/押下時条件/dispatcherは維持。
- 型検査/build/変更コード整形/差分確認が成功。keybindings/dynamic-commands/applet-orderの関連回帰21/21成功。ソースGUI shortcuts-ui-1791647694490の8群、navigation-1791647794011の17群、keybindings-1791647802959の10群成功。初回の外部競合試験は保存IPC後にrenderer更新を待つ前に適用していたため待機を修正し、旧メニューの期待値も新仕様へ更新して成功。失敗ログは保持。
- publish.bat終了0。固定単一EXE0.26.23は142529981bytes、SHA256 `c7fa3277a7043b93027f0a646d87eccce8587e621a5eae0faa4b4d588f461848`。update.jsonの版/size/hash一致。隔離コピーshortcuts-ui-1791647948640の8群成功、コピーhash一致。設定/Appletの全提供元表示、ドラッグ/上下/Alt＋上下/Escape取消とfocus復帰、複数キーの適用、無関係キーとのマージ、対象キーの外部更新拒否、空/1件、22行のスクロール、順序変更を保存して再起動、既存編集/登録競合を確認。両テーマ1280/900/700pxと高さ540pxを確認、最終EXEのlight700/長い一覧を目視確認。
- 証跡は`.artifacts/shortcut-order-20261011/`。文書ローカルリンク127件確認。今回の標準全回帰・全IME/キーボード配列・実サービス認証・物理ジェスチャーは未実行。前回コミット時の194件成功を今回の全回帰成功とは扱わない。既存全体ZIPのsize/hash不変、未変更Appletの再発行なし。
- 完了時整理は試験終了を確認。source/portable各最新成功3件と過去版/コミット再利用/状態不明/失敗記録を保持し、保護資料以外に安全な削除対象がなく追加削除0。commit/push/Release/実利用deployなし。

## 2026-10-11 実行順パネルのコミット前検証（0.26.23）

- 利用者確認済みの変更22ファイルを対象に、型検査と標準回帰196/196件が成功。ソースGUIはnavigationの17群、keybindingsの10群、applet-orderの4群が成功。実Windowsキー入力、共有draft、Applet一覧と実行順の独立性を確認。
- 発行済み単一EXEのshortcuts-ui-1791648774806で8群が成功。並べ替え/取消/条件/競合処理/保存再起動/両テーマ3幅を再確認。EXEは利用者確認後から不変、142529981bytes、SHA256 `c7fa3277a7043b93027f0a646d87eccce8587e621a5eae0faa4b4d588f461848`が検証コピーと一致。再梱包・版の追加更新はなし。
- 証跡は`.artifacts/commit-validation-shortcut-order-20261011/`。検証前後のtree `035109bac770d355544c8149f6380db19ef4382a`と入力hashが一致。コマンド/時刻/終了コード/全ログhash、Node24.21.0/pnpm12.10.1/.NET10.0.401/Windows x64、Gmail依存commit/treeとfixture hashを記録。検証後の変更はこの記録のみで、最終tree/commitは同証跡へ記録する。
- 隔離試験プロセスの終了を確認。最新3件、今回/前回のコミット再利用証跡、旧版検証、不明/失敗資料を保護し、追加削除0。実サービス認証・全IME/キーボード配列・物理ジェスチャーは対象外。commitのみ実施し、push/Release/実利用deployなし。

## 2026-10-11 ジェスチャーのコマンド一覧と編集パネル（0.26.24）

- 設定ジェスチャーをショートカットと同じ全コマンド一覧へ変更。検索/割り当て状態/未割り当て/＋/入力と条件/即時削除に対応。CommandBindingToolbar/CommandBindingList/BindingEditDialog/BindingOrderDialogを共用し、既存ショートカットの表示と操作を維持。ジェスチャーの全体ON/OFFと動作設定を一覧上部へ整理。
- 編集は移動4方向・クリック・ホイールの選択ボタン、キーは共通ShortcutCaptureField。browser/exe条件と共通Applet複数選択、exe名検証、入力種類を切り替えた際の選択保持、取消/focus復帰を実装。実行順は専用パネルで同一gestureの全提供元を対象にドラッグ/上下/Alt＋上下。共有draft/全体保存、条件だけの編集時の位置保持、入力変更時の末尾追加、対象行/順序の外部更新拒否と無関係入力のマージを維持。保存形式と入力フックは変更なし。
- 型検査/build/整形/差分チェック成功。keybindings/gesturesの関連回帰24/24成功（追加/変更/順序と外部更新保護を含む）。ソースGUIはshortcuts-ui-1791649248346の8群、navigation-1791649585495の17群、keybindings-1791649594527の10群成功。gestures-ui-1791649456338はUI/保存再起動7群成功と実入力省略1項目を記録。
- 追加で試みたsource実ジェスチャー試験は、InputTestsの対象Window前面化チェックで失敗し、物理入力に進めなかった。通常Windowsでの前面化制限の証跡をgestures-native.logへ保持。以降はAPPDOCK_GESTURE_UI_ONLY=1を明示し、ジェスチャーの実入力/全IME/実サービス認証/標準全回帰は未確認として区別する。キー側の既存実Windows入力・登録競合回帰は成功。
- publish.bat終了0。0.26.24の単一EXEは142527577bytes、SHA256 `85b5fdb381fee574ef48dbe8796dfb3067700c0302e4d6f100d932612343cdf6`、feedの版/size/hash一致。固定EXEのgestures-ui-1791649850413で編集UI/条件/順序/保存/実プロセス再起動7群成功（実入力省略を別記）、shortcuts-ui-1791649873489の8群成功。両テーマ1280/900/700pxを検証し、最終EXEのlight700編集パネル/dark1280一覧を目視確認。両検証コピーと最終EXEのhash一致。
- 初回portable試験はCDP接続直後にmainページが未生成で失敗。テストへwindow.dockの準備待ちと終了時server解放を追加して、同じEXEで再試験成功。失敗した隔離AppDockは通常終了コマンド、残った該当ランナーだけを終了し、失敗資料を保持。製品ソース/EXEの変更はなし。
- 証跡は`.artifacts/gesture-command-list-20261011/`。文書ローカルリンク117件確認。旧全体ZIPのsize/hash不変、未変更Applet再発行なし。今回の成功/失敗試験プロセスの終了を確認。方式別最新3件/固定発行版/過去コミット再利用/旧版/不明/失敗資料を保持して追加削除0、一時編集スクリプト2件を除去。commit/push/Release/実利用deployなし。

- 利用者の動作確認後、2026-10-11の明示指定により追加のコミット前回帰は実行せず、0.26.24を作業の区切りとしてコミット。上記は実装時の検証範囲であり、標準全回帰成功/リリース再利用済みとは扱わない。続くアバター・WebView言語・更新通知の対応は別の未コミット変更として進める。

## 2026-10-11: 0.26.25 アバター・更新通知の調整とWebView言語確認

- 先に利用者確認済み0.26.24を716e04772c5d3ca7c11af27ce74e9e390c34a846へコミット。今回の依頼により追加回帰は保留したチェックポイントであり、必要回帰完了/Release用証跡とは扱わない。続けて今回の小修正を未コミットで作成。
- リボンの中間コンテナーにより外れていたアバターCSSを修正。30×30、padding 0、正円、画像28.667×28.667を直接計測。既存のcover表示は維持。
- 更新確認/進捗/取消/適用完了を固定フッターの共通通知へ統合。通常結果は実Windowの表示時間で6秒、ホバー/フォーカス中は停止、失敗は明示閉じまで保持。IDで同一結果の再確認も表示する。結果文は確認結果の開閉へ移し、確認日時の領域を未確認時から確保。
- Windows優先言語ja、システム地域ja-JP。実際のWebAppletManager.account/WebAccountController.accountSessionで作った隔離sessionをWebContentsViewに渡し、ローカルHTTPページで両方のnavigator.language=ja、languages=[ja]、Accept-Language=jaを実測。言語コードの変更なし。実ログイン済みGmailや各サイト独自のアカウント言語設定は調べていない。
- 回帰スイートは明示依頼により未実行。型チェック/build/変更ソースのPrettier検査成功。今回の変更箇所だけを直接確認し、sourceで画像/更新ありなし/本文と更新画面の領域不変/連続確認/6秒消去/両テーマを確認。初回の直接確認でフォーカス状態が次の通知に残る点を見つけ、DOMの現在状態へ同期する修正後に成功。
- publish.bat終了0。0.26.25 EXEは142531899 bytes、SHA256 6c49973767b254ce8cd46b21b18320e71b59afccd67db8c74db64ab49a6fa692。feed・隔離コピーと一致。旧全体ZIP0.26.11は317652957 bytes/hash7e62a121ce13efbd7bbc8428777cf5021b4fbc692b792ed0aa142fb3983b363bを維持。
- 固定EXEの直接確認8項目成功: .artifacts/ui-polish-20261011/portable-profile-1791651342969/inspection.json、portable-inspection-final.log。画像/通常・更新あり通知/本文・更新画面の領域不変/再確認と消去/詳細と狭幅の位置/両テーマ/失敗保持/最小化中の表示時間停止。1280pxと900px相当を確認。発行物での900pxはrenderer viewport指定であり、source側は実Window幅900pxで確認。取得/実インストール/実サービス/既存機能回帰は未確認。
- 初回portable確認はelectron.launchの起動待ちタイムアウト、2回目はElectron未対応のBrowser.getWindowForTargetで停止。確認用の接続を既存と同じCDP、Window操作を既存IPCへ変更し、同一EXEで成功。製品側の再変更・再発行はしていない。失敗ログ/隔離profileを保持。
- 完了時整理: 今回の成功source1/portable1、失敗・接続不成立profile、固定EXE、旧版/再利用/Release資料を保持。最新3件を超える削除可能な今回の成功資料なし。不要な調査補助cjs3件のみ削除。未変更Appletの再発行、全体ZIP生成、push/Release/実利用deployなし。小修正は次の依頼まで未コミット。

## 2026-10-11: 0.26.25 コミット・リリース前確認

- 前回保留した回帰を実行。本体型検査と標準回帰198/198、ショートカット・ナビゲーション・条件付きキー・ジェスチャー編集・プロフィール・WebApplet・設定通知・Webアカウント復旧の関連GUIが成功。ジェスチャーはUIモードであり物理フック回帰とは区別する。
- 検証時のstage tree e639fccf14ab63c5da7b1c069fb10b784d3e9efcとソースが一致。後続差分は本VERIFICATIONの記録だけ。証跡.artifacts/commit-release-0.26.25-20261011。Release準備でtypecheck/regressionの完全ログと入力一致を照合して再利用し、再発行した配布物・更新/復旧/全体ZIPは新しく検証する。
- 同梱未公開版はGmail0.9.2とWallpaperSlideshow0.4.3。他4Appletは公開済み同版。Gmail回帰21/21とUI、Wallpaper回帰8群・RPC・限定HWNDの終了処理が成功。実認証・実メール・実壁紙・PC終了は行わない。
- Gmail GUIの更新確認locatorを現行の共通通知/開閉詳細へ修正。途中の隔離accounts.json置換EPERMと案内待ち失敗の資料を保持し、失敗時のalert/status診断を追加。同一製品コードの最終全GUIは成功。一過性のファイル競合の原因は未特定で、製品への試験用回避は追加していない。
- 新リリースノートに前回公開0.26.11以降の入力UI/起動/保存先/ログ変更をまとめ、最低ホスト版を含むAppletノートも確認。公開操作・新配布物の検証結果はRelease planへ記録する。

- 配布物試験で確認結果のsummary追加により更新元設定のlocatorが曖昧になったため、portable-updates-ui-testの2箇所を`.applet-update-source > summary`へ限定。製品コード変更なし。単一EXE更新/再起動11群、更新進捗/取消4群、更新復旧、全6Applet入りZIPの整合/展開起動が成功。新配布版のGmail UIとWallpaperのfixture/実nativeログ表示も成功。
- テスト修正後に型検査と標準回帰198/198を再実行して成功。完全ログと入力tree/hashは`.artifacts/commit-release-0.26.25-20261011/test-fix-evidence.json`。最終記録の追加だけを後続差分として保存し、新planで配布物を生成・再検証する。最初の失敗planとログは保持。
- テストフォルダーの候補を3repoで列挙し、成功275件と成功未確定408件を記録。今回の直近成功分、失敗/不明、固定配布物、過去の再利用/Release証跡は保持。過去分は方式/再利用依存を確定できないものを削除せず、今回の追加削除は0。候補監査は同証跡のcleanup-audit.json。最終配布物の確認結果・終了確認もRelease記録へ追記する。

## 2026-10-11: 開発依存・ツールの公開後7日待機とNode LTS制約

- pnpm-workspaceへ7日（10080分）/strict/公開日時欠落時の拒否を追加。ビルド前の依存確認はerrorとし、自動インストールによる変更を防ぐ。更新コマンドdev.bat update --latestを維持し、直接・間接・開発依存およびlockfile復元へ適用する。
- toolchain.jsonはNode24.21.0/pnpm12.10.1を維持し、LTS/7日/版限定の理由付き例外形式を追加。新規Node取得前は公式indexのLTS/公開日を検証、pnpm取得前はwrapperとWindows x64バイナリの公開日を検証しnpmにもmin-release-ageを渡す。導入済みツールは再利用する。setup環境BATの同内容書換えを省略し、失敗時の自身の一時ファイルを回収する。
- 公式Node indexでv24.21.0/date2026-09-07/ltsKryptonを確認し、実ローカルNodeもKryptonと一致。pnpm12.10.1の新規取得は2026-10-13 17:35:56 UTC（14日02:35:56 JST）まで拒否されることを確認。Nodeの新規ZIP取得・新pnpmの実インストールは行っていない（現pnpm版は待機中であるため）。取得前ガードとnpm引数はfixtureで確認。
- 導入時の既存lockfileには7日未満の6件があり、最初のstrict frozen installで各公開時刻を示して拒否した。既存0.26.25の版・lockfileを維持する移行例外として、plugin-react6.1.2/Electron44.6.0/http-cache-semantics4.3.0/nanoid3.3.20/postcss8.5.29/Vite8.3.3だけを完全な版で除外した。全6件は2026-10-14 07:39:15 JST以降に除外を外せる。新版には適用せず、lockfileから消えた版はExcludePruneで整理する。ツール用例外は空。
- 最終確認: PowerShell5.1の境界/日時欠落・不正/版とpackage限定例外/非LTS/ネイティブ版公開日/npm引数など18チェック成功。実pnpmの隔離レジストリで成熟版選択、若い直接依存拒否、若い間接依存拒否、日時欠落拒否、若い版を含むlockfileのfrozen復元拒否の5項目が成功。最終node:testは2/2。setup2回、型検査、本体build、Prettier、diff --check成功。
- sandboxではローカル通信が拒否されたため、実pnpmのレジストリ試験は通常Windows権限で実行。初期のpnpm runは自動install中にstack overflowとなりnode_modulesのリンクを外したが、通常Windowsでstrictと移行例外を適用したfrozen installが338entryのポリシー確認を通過、294package全て既存storeから復元（ダウンロード0）して成功。製品のpnpm-lock.yaml/package.jsonのGit blobはHEADと同一。PS5.1のNode式引用問題を修正し、setupの同内容BAT置換による共有違反を上記の書換え省略で修正、再実行成功。
- 証跡は.artifacts/release-age-policy-20261011（result.json/ログhash/最終試験・setup・型検査・build・公式情報）。隔離fixtureの失敗/中断資料を保持し、成功資料は3件以内。自身の失敗時.environment一時ファイル1件のみ内容照合して削除、既存の古い一時ファイルは保持。
- 開発取得ポリシーと試験/開発文書の変更のみ。製品ソース・依存版・lockfile・製品0.26.25・publishを変更せず、版更新/製品再発行は不要。標準製品全回帰/GUI/実サービスは今回は未実行。commit/push/Release/deployなし。

## 2026-10-11: 公開後待機ポリシーのコミット前確認

- 依頼対象の9ファイルだけをstageし、型検査・標準回帰200/200（新規公開後待機2テスト、実pnpm5項目、PSガード18チェックを含む）・setup2回・Prettier・diff確認に成功。Updaterの発行とDemoのReleaseビルドを含み、Demoは警告0/エラー0。検証前後のstage treeは一致し、未stageの入力変更なし。
- 証跡は.artifacts/commit-validation-release-age-20261011（tree前後/environment/inputs/完全ログとSHA256）。検証後の追加は本コミット前記録だけで、最終stage treeとcommitは同証跡へ保存する。公開後待機fixtureの成功3件、失敗/中断、前回検証・今回commit証跡を保持し、追加削除0。
- 開発取得ポリシーのみのため製品GUI・兄弟Applet回帰・製品版更新/再発行は対象外。製品のpackage.json/pnpm-lock.yamlとpublishを変更せず、既存0.26.25を維持。ローカルコミットまででpush/Release/deployなし。

## 2026-10-11: 0.26.29 Applet自身による外部公開宣言

- commands[].automation（boolean、未指定/falseは非公開）をmanifestで検証。公開IDの形式と所有名前空間を検証し、runtime登録/動的置換から公開権限を受け取らない。現在の登録と宣言を照合し、未登録/削除/停止中は利用不可。別名は公開しない。本体からGmail/壁紙のID一覧とWeb IDの特別判定を削除し、WebApplet提供元も同じフラグを付ける。src内のGmail/壁紙固有IDは0件。
- Gmail0.9.3/壁紙0.4.4のmanifestへ従来の公開対象だけを宣言。最低本体0.26.29。旧Appletを互換一覧で公開しない。許可/既存実行経路/同時実行拒否/監査ログは継続。
- 型検査/build/整形成功。automation/dynamic-commands/lifecycle/logging/core回帰28/28、供給元ポリシー回帰2/2（PowerShell境界と実pnpmの直接/間接/frozen依存）、dev launcher1/1成功。起動スクリプトは成功/通常失敗/STATUS_STACK_OVERFLOWの終了コードを保持し、異常終了時の承認付き再実行案内だけを追加。自動昇格/自動再試行/検査省略なし。
- 制限環境ではpnpm installがSTATUS_STACK_OVERFLOW、回帰が設定atomic renameのEPERMで失敗。通常環境の同一lockfile install/同一テストは成功。制限環境のtypecheck/build自体は成功。dotnet --infoはService Control Managerアクセス拒否でexit1、msbuildの実project評価はexit0。通常環境の全3repo publishはexit0。制限の原因を製品不具合と断定せず記録し、依存追加/更新、待機期間緩和、lockfile削除は行っていない。
- 固定EXEのautomation GUI9群成功（.artifacts/automation-portable-1791662917715/result.json）。本体にないtest.automation-providerの宣言→実登録→MCP実行、WebApplet open、ログ/host.log、権限、両テーマ3幅、再起動、登録解除を検証。実Codex0.162.0-alpha.17.2で8ツール発見/操作成功、モデル推論なし。Gmail側の固定本体+公開Applet試験でMCP経由open→オフラインGmail画面表示→監査ログまで成功。壁紙実EXEは不正設定拒否と正常終了を確認し、操作はfake背景APIで検証。実Google認証/メール送信/実壁紙変更は行っていない。標準全回帰は未実施。
- publish/AppDock.at365.exe: 144038249bytes / SHA256 545d04678da11cf6e79290f0015b471c6f4af741199b37e0132e901ebef32d3e。feedと2つのGUI検証コピー一致。Appletのsource/publish manifest一致、更新ZIP全10ファイルとpublish一致。証跡.artifacts/automation-declarations-20261011。単一EXE維持、全体ZIP作成/未変更Applet発行なし。
- 終了済み旧成功automation-portable-1791659206593とGmail portable-1791456361645をパス/リンク/使用中検査後に整理し、各方式の最新成功3件を保持。最初は検査自身のプロセス一致により安全停止し、検査自身だけを除外して確認。通常TEMP40ファイルをhash照合してrepoへ保管し元を削除。制限環境TEMPは既に存在せず、失敗ログを保持。その他の失敗/不明/固定/再利用資料は保持。commit/push/Release/実利用deployなし。
- 最終確認: 関係文書のローカルリンク208件、整形、3repoのdiff --check成功。dev.batはCP932互換ASCII/CRLFを保持。隔離試験の残存プロセス0。

## 2026-10-11: Automation変更のコミット前検証

- 明示依頼により、本体の共通API/MCP/Codex登録画面/公開宣言/監査ログと関連文書・試験・制限環境の案内をコミット対象に確定。検証開始stage treeはa7034eceac6373d736ed384ca3757519d29ca745。Gmailのtreeはde5c3a43d153c683ebccb4f61733c9180dda7bb8、壁紙は6bd877aec997504e3eb49f58d46ffda26c727a91。検証後もstageと作業ファイル一致、製品の追加変更なし。
- 今回typecheckと標準dev.bat testを実行し211/211成功（供給元ポリシー/起動スクリプト回帰を含む）。固定発行版GUI9群と実Codex8ツール操作成功: .artifacts/automation-portable-1791663497295。Gmail21/21とMCP表示GUI、壁紙標準回帰と実EXE/RPC試験も成功。実サービス認証/実壁紙変更/モデル推論なし。
- 証跡.artifacts/commit-validation-automation-20261011。全Git追跡入力299件、各ログ、lockfile/toolchain、既存配布物をハッシュ記録。検証版0.26.29 EXE/feedのsize/hash不変。検証後の追記は各repoのVERIFICATIONだけ、最終tree/commitは証跡へ保存。再発行/追加版更新なし。
- 旧成功本体automation-portable-1791660107886/Gmail portable-1791458903951を使用中/境界/再解析検査後整理、各最新3件を保持。TEMP40ファイルをhash照合して証跡へ移し元を削除。失敗/不明/固定/再利用資料保持、試験プロセス残存0。push/Release/deployなし。

## 2026-10-11: 共通入力APIのコミット前検証

今回の変更を実装時の記録と照合して固定し、本体276件・型検査、WindowsTools11件、WebBrowserTools2群、両Appletの配布版GUI、固定EXEの新旧SDK/API5群・MCP15群、共通入力4群、物理ジェスチャー17項目、設定UI7群、文書リンク177件を確認しました。製品/発行物の追加変更はありません。実入力試験では想定外Sキー/送信先変化と開始直後の3項目不一致があり、同一内容で再確認後成功。入力外乱の可能性がありますが個別原因は未特定、失敗ログを保持します。実ブラウザーの効果/実OSロック・消灯は対象外。

検証tree: `b2acb7e0e030426146ea467fac50bb4381c13fb5`。完全な証跡は`.artifacts/commit-validation-native-api-20261011/`。試験プロセス残存0、既存の最新3回・参照済み検証資料・失敗/不明資料を保持して削除なし。ローカルコミットのみでpushは行いません。

## 2026-10-11: 0.26.38 操作許可画面の統合

- 設定の「操作の許可」にApplet/MCPの独立スイッチを集約。一般/Codex連携には案内を残し、接続・登録はCodex連携で扱う。保存値と実効条件を区別し、MCP停止中の準備・前提不足時の取消も可能。PC専用即時保存、既存許可値と共有JSONの未保存draftを維持する。狭幅は操作ごとの2列表示。
- 型検査、source/portableの新旧SDK・許可UI6群、MCP15群、文書リンク99件が成功。両テーマ1280/960/700幅、下部入力行、許可の独立性、前提不足、MCP停止中の設定、draft保持、再起動後の保存、実Codexの11ツール接続を確認。モデル推論なし。今回の変更はUIのため、標準全回帰・OSネイティブ入力の再試験は実施していない。
- 初回MCP試験は移動先の状態取得前に期待値を読んだこと、補助試験が旧画面のスイッチを参照したことで失敗。状態読み込み待ちと新画面への移動を試験へ反映後、source/portableとも成功。失敗記録は保持。
- 通常publish成功。本体0.26.38 EXEは144074310 bytes、SHA256 `c034e9c226eddda3ed9804ea422bfdcc704f474ca62cbe3b376f6abbd97317b0`。更新feedと両GUI検証コピー一致。証跡は`.artifacts/permission-ui-20261011/validation.json`、最終profileはapplet-api-portable-1791703831090 / automation-portable-1791703873763。依存・lockfile・toolchain変更なし、版更新に伴う固定lockfileでのinstallのみ実施。
- 成功済み旧automation-source-1791671325487を境界/リンク/使用中検査後に整理。各方式最新3回・過去コミット参照資料・失敗/不明・固定fixtureを保持。試験プロセス残存0。証跡cleanup.json。
- 直前の共通入力APIは本体c853697、WebBrowserTools e5f2802、WindowsTools 2dcb764でコミット済み。今回UIは未コミット。本体だけを発行し、Applet変更・push・Release・実利用deploy・全体ZIP作成なし。

## 2026-10-11: 操作許可UIのコミット前検証

- 対象17ファイルを確認し、検証開始treeは`782878b329fb2879cdf56543828a4c5ba5ad5d50`。実装証跡の全335ファイル・各ログ・固定EXEをSHA256照合して一致。型検査と文書リンク99件は同じ入力の成功記録を再利用。
- 今回、本体標準回帰276/276、固定発行版の許可画面/新旧SDK6群とMCP15群（実Codex11ツール、推論なし）を再実行して成功。許可の独立性、停止中設定、draft保持、両テーマ3幅、再起動保存を確認。製品修正・再発行不要、0.26.38 EXE/feed不変。
- 証跡`.artifacts/commit-validation-permission-ui-20261011/`。最終試験profileはapplet-api-portable-1791704317194 / automation-portable-1791704360721。開始treeから最終treeまでの差分は本項の検証記録だけ。試験プロセス残存0、各方式最新3回・既存検証参照・失敗/不明資料を保持して整理対象なし。コミットのみ、pushなし。

## 2026-10-11: 0.26.39 WebApplet公開操作とApplet許可の既定値

- WebApplet提供元がopen/back/forward/reload/homeとname/displayを宣言し、既存カタログとSettingsCommandsへ登録。settings.get/getSchemaとcommands.executeでApplet/MCP双方から利用可能。更新はwebApplets.itemsへ保存し、URL/アカウント/遷移規則/アイコン/imported/認証を公開しない。既存revision・dryRun・原子的検査・停止中拒否・監査を継続。表示先の既定値は既存Viewへ反映し、ページ個別の保存値を優先する。
- Appletの新規既定値は全9項目ON。version 2の保存済み値・省略による拒否、旧個別version 1の全体拒否、不正/アクセス拒否時の拒否は維持。ファイル不在ENOENTだけを新規扱いにした。MCPの接続・7操作許可は初期OFFを維持し、情報取得は連携ON時に許可する従来契約。WebページにホストAPIを注入しない。
- 関連回帰33件・型検査・文書リンク107件成功。最終単一EXEで新旧SDK/許可UI6群とMCP16群成功、実Codex11ツール接続（推論なし）。MCP/実Node AppletからWeb設定の取得/更新・実ページの履歴/リロード/開始ページ移動、未公開項目を混ぜた要求の原子的拒否、許可の独立性/取消を確認。発行win-unpackedで入力4群も成功（連続gesture13ms）。両テーマ3幅・既存draft・再起動保存も確認。標準全回帰はコミット依頼時の対象として今回は未実施。実外部サイトの認証/操作は対象外。
- 最終本体EXE0.26.39は144074577bytes、SHA256 `cfa11f71e4048124c8213338f33dce0589e8a411360c7e920a92e41e89d1fa01`。feed/GUI検証コピー一致。証跡`.artifacts/web-api-20261011/validation.json`。最終SDK profile1791705713351、MCP1791705763714、入力1791705815389。
- 制限環境の固定lockfile installがSTATUS_STACK_OVERFLOWとなり、通常実行権限の同じ固定installで成功（359既存package再利用、download0）。依存/lockfile/toolchain更新や検査緩和なし。途中の発行はwin-unpacked.tmp置換EPERMで失敗、使用中プロセスなしを確認して同じ手順で再試行し成功。原因を特定したものではない。アクセス拒否試験はWindowsの非ディレクトリ配下がENOENTになるため想定が外れ、EACCESを明示する試験へ直して成功。各失敗記録保持。
- 古い成功native-input-ui-1791701339012を境界・リンク・使用中検査後に整理。各方式最新3回、既存検証参照、失敗/不明、固定fixtureを保持。試験残存0。未コミット、本体だけローカルpublish完了。Applet改修/再発行、push、Release、実利用deploy、全体ZIPは行わない。

## 2026-10-11 WebApplet API 0.26.39 コミット確認

- 標準回帰277件、発行単一EXEのApplet SDK/UI6群・MCP16群（実Codex11ツール、推論なし）、発行入力4群が成功。WebAppletの5操作、公開設定、独立した許可と既存SDK互換を確認。
- 入力試験では取消直前の最前面喪失と通常コマンドの150ms再入抑止を観測。試験だけを修正し、通常操作の間隔を確保。取消ケースはINPUT_FAILEDかつ実測focused=falseのときだけ最大3回まで再準備し、CANCELLEDとキー未送信を必須とする。前面を変えた原因は未特定。最終2回は4群成功、連続gesture3回10～11ms。途中の失敗・診断資料は保持。
- 製品・依存・発行物に追加変更なし。EXE SHA256 cfa11f71e4048124c8213338f33dce0589e8a411360c7e920a92e41e89d1fa01。型検査/文書107リンクは実装時のソース337件とログのハッシュを照合して再利用。後続変更は独立した入力GUI試験と本記録のみで、影響する入力試験は最終内容で再実行。
- 証跡: `.artifacts/commit-validation-web-api-20261011/validation.json`。標準回帰/SDK/MCPの開始tree、入力試験修正後tree、記録追記後の最終treeを分けて保存する。旧成功試験1件を整理、最新3回/過去証跡参照/失敗を保持。残存試験プロセス0。push/Release/実利用deployなし。

## 2026-10-11 Shell基盤の仕様と実装計画

- 0.26.39の現ソース（HEAD 2db1262）を確認し、docs/shell-foundation.mdへ未実装の仕様と実装計画を作成。AGENTS/DEVELOPMENTから参照を追加した。リボンを最初の独立Shellにし、共通モデル・操作・購読・復旧・MCP検証までを初期範囲とする。
- 新規仕様と入口2文書のローカルリンク103件は参照先が存在。新規仕様の行末空白と成果物禁止名は0件、git diff --check成功。文書の検査のみで、製品のビルド/回帰/実UI検証は実施していない。
- 製品ソース・設定・依存・版・publishは変更せず、新規Applet repoもまだ作成していない。実装/commit/push/Release/deployは未実施。

## 2026-10-11 Shell計画のビルトイン方式への改訂

- 同日の追加相談に合わせてdocs/shell-foundation.mdを改訂。標準AppDockShellは本体repo内のビルトインAppletとして同時ビルドし、単一EXEへ同梱する案へ変更。移行済みリボンの描画を本体から削除し、通常/復旧に同じ標準Shellを使う。独立repo・本体内蔵リボン併存の初案を置き換えた。
- 共通の公開Shell API/ローダー/worker/Viewを追加型Shellと共用し、内部importとビルトイン専用APIを禁止する。配布元・重複ID・初期選択・復旧依存・個別更新からの除外はホストの管理方針として分離。標準Shell自体の故障時は最小のネイティブ通知とsafe起動を使い、第二のリボンを実装しない。
- 現ExtensionManagerは外部rootのみを渡しており、複数root探索・manifest検証・Node起動を持つことを読取り確認。ビルトイン探索元/識別とパッケージ収録は今後の実装事項。AGENTS/DEVELOPMENTも改訂案への案内に更新。
- 文書のローカルリンク103件存在、仕様本文の禁止名/行末空白0、差分検査成功。製品実装・ビルド・GUI試験・版更新・publish・commitは行っていない。

## 2026-10-11 Shellの正式名称統一

- 仕様・実装計画とAGENTS/DEVELOPMENTの案内をDefault Shell（本体同梱の標準描画）、Shell Applet（差替え拡張）、Shell Host（本体側の実行基盤）へ統一。仕様へ用語表を追加し、Shellは前二者の総称と明記した。Default ShellをShell Appletと呼んでいた本文・段階表を訂正。提案ソース配置はshells/defaultへ整理し、実行契約は維持。
- ローカル参照103件存在、仕様本文の旧名称・禁止名・行末空白0件、差分検査成功。名称置換の初回スクリプトは置換順による一致検査で保存前に停止し、修正後に適用・読戻しを確認。製品コード/版/設定/publishを変更せず、製品試験は未実行。

## 2026-10-11: 0.26.40 Default ShellとShell Hostの初期実装

- 設計文書4件を先に`80c5bd7e1a2f2d5c0fba4264169ac56aaed1bce5`へコミットし、その後に実装。文書コミットの証跡は`.artifacts/commit-validation-shell-plan-20261011/`。以下の実装変更は未コミット。
- リボン描画を`shells/default`へ移し、本体rendererの重複描画を除去。共通manifest/worker/専用preload/View経路でDefault ShellとShell Appletを扱い、同時ビルドして単一EXEへ収録。表示モデル・意味的操作・NavigationCoordinatorを本体へ集約した。公開契約は`docs/shell-api.md`。
- epoch/revision、snapshotと変更通知、binding/session/context、実行時の許可・利用可否照合、操作の重複排除、可搬な画像取得を実装。通常AppletとMCPへui.ribbon.get/ui.assets.get/ui.actions.invokeを公開。Shellの選択・ready後の切替・タイムアウト・故障記録・Default Shell復帰・明示再試行・safe-shell起動を実装した。意図的な無効化を故障扱いせず、未導入の選択先も設定画面から戻せる。
- 型検査、build、通常`publish.bat`成功。`dev.bat exec node --test tests/core.test.cjs tests/ui-presentation.test.cjs tests/appdock-api.test.cjs tests/applet-management.test.cjs tests/ribbon-commands.test.cjs tests/settings-sync.test.cjs`の48件、`tests/shell-boundaries.test.cjs`の内部import境界1件が成功。計49件の関連検証で、標準全回帰は未実行。記録は`.artifacts/shell-validation-20261011/unit.log`と`boundaries.log`。
- ソースGUIはリボン配置3群（ribbon-layout-1791711669093）、Appletページ7群（applet-pages-1791711927907）、設定通知9群（settings-notice-1791711751518）が成功。既存ページのpage/window切替・session・入力・共有draft・フローティング通知を確認。GUIは隔離profileで直列実行した。
- Shell専用GUIはソース14群（shell-host-1791713562287）、最終固定EXE13群（shell-host-1791713851278）が成功。単一描画/専用ブリッジ/Tab境界、選択状態、重複操作、実MCPと通常Node Applet、別Shellへの切替、停止/再有効化、rendererとworker故障、再試行、保留中切替取消、readyタイムアウト、再起動後の故障抑制、safe-shellを検証。Default Shell自身のrenderer強制終了→ネイティブ再試行はソース試験でdialog応答fixtureを使った確認で、実ダイアログの手操作確認とは区別する。
- 最終固定EXEの設定通知GUIも8群成功（settings-notice-1791713933566）。保存・未保存draft・不正JSON・revision競合・Web表示上の通知・再起動後の保持・両テーマを確認。各profileのchecks.json/result.jsonに結果を保存した。
- 発行物`publish/AppDock.at365.exe`は0.26.40、144082059 bytes、SHA256 `eaa966ac066e0c3134c74cd713d3048c1f25f7c6c7e7018decc86d98fd537b6e`。update.jsonと最終GUI/計測コピーが一致。Default Shellの成果物5ファイルとmanifest版もout/publish収録先で一致。発行ログは`.artifacts/shell-validation-20261011/publish-delivery.log`、照合は同`artifacts.json`。
- 性能はハードウェアアクセラレーションOFF・空の隔離profile・EXE起動からCDP接続/表示準備までを各1回計測。0.26.39は10053 ms/5プロセス/Private 145.92 MiB、最終0.26.40は10225 ms/7プロセス/Private 207.99 MiB（約62.07 MiB増加）。5秒のアイドルCPUは1コア換算0.58%→1.44%。Working Set合計409.09→595.16 MiBは共有ページを重複計上するため主指標にしない。旧版はshell-metrics-1791713188032の旧版レコード、最終版はshell-metrics-1791714155975を参照。同条件の単回観測であり統計的な性能保証ではない。独立renderer/workerによる追加コストを今後の改善対象として記録する。
- Node24.21.0/pnpm12.10.1、依存版・lockfile・toolchainは維持。版更新後のfrozen installは制限環境で既知のstack overflowとなり、同じコマンドを通常Windows権限で再実行して359件再利用/ダウンロード0で成功。検査・公開後待機ポリシーの緩和なし。試験中に見つかった待機/locatorの不足とShell復旧・選択・無効化の問題を修正し、最終版で再確認した。失敗記録は保持。
- 古い終了済み成功Shellソース試験4件だけを使用中・絶対パス境界・再解析ポイント検査後に整理し、最新3件を保持。固定旧版、最終配布物試験、参照済み資料、失敗/不明資料は保持。整理と残存プロセス確認は`.artifacts/shell-validation-20261011/cleanup-result.json`、最終入力/証跡ハッシュは同`validation.json`。
- 同時複数Shell/Window、本文の多重表示、全UI移植、内蔵チャットは後続。物理的な混在DPI/モニター移動、応答しないrendererの長時間ハング、実Google認証/メール、実Codexのモデル推論は今回未確認。本体だけをpublishし、未変更Applet再発行・全体ZIP・push・Release・実利用deployは行っていない。

## 2026-10-11: Shell基盤のコミット前検証

- 実装時の入力355件・証跡・固定EXEのSHA256を照合して一致。承認対象41ファイルの開始stage treeは`bb873ecac3e3e7e34dc96fb5c6a415aa1a72504d`。型検査と標準回帰283/283が成功した。検証証跡は`.artifacts/commit-validation-shell-20261011/`。
- 初回の制限環境ではローカルHTTP接続EACCES、設定renameのEPERMなどにより47件が失敗。同一コマンドを通常Windows権限で実行すると282/283成功し、残る1件はMCPツール数を旧11個と期待していた試験だった。14個と新しい3ツールの存在を検証するよう修正し、標準回帰全件成功。既存MCP/Codex/入力GUIのツール数と、別rendererへ移ったリボンのlocatorも更新した。最初のMCP GUIは旧ログボタンlocatorで停止し、修正後に成功。失敗ログを保持し、製品コード・依存・発行EXEは変更していない。
- 固定portableのShell13群（shell-host-1791714785141）、設定通知8群（settings-notice-1791714988725）、MCP16群（automation-portable-1791714900237）、実Node/.NET共通API・許可画面5群（applet-api-portable-1791714948057）が成功。実Codex0.162.0-alpha.17.2から14ツールの発見・読取/操作も成功し、モデル推論なし。共通APIの旧DLL指定による追加試験は今回未指定で、既存SDKと自己設定の互換性を確認した。
- 発行済みwin-unpacked版のネイティブ入力4群も成功（native-input-ui-1791715022767）。既存WebBrowserTools/WindowsToolsの発行コピーと専用入力受信ウィンドウで、許可/取消/MCP経由/連続入力を確認。兄弟repoは読取りのみで変更・再発行しない。実サービス認証、実ブラウザーの操作効果、OSロック・消灯、物理混在DPIは今回対象外。
- ソースのリボン配置・ページ・共有draftおよびDefault Shell強制終了試験は実装時の検証を参照し、当該製品ソース・試験の不変を確認。今回の追加は試験5ファイルの追随とDEVELOPMENTの実装状態訂正、検証記録のみ。標準回帰後tree`dc2b66826daba23fa73e038e88344c94a8b66634`、最終GUI入力tree`25633ad745ab0e1cd202a8116573d71e0bd3807b`。後者からの差分は本検証記録だけと照合し、最終tree/commitを同証跡へ保存する。
- 0.26.40のEXE/feedは144082059 bytes、SHA256 `eaa966ac066e0c3134c74cd713d3048c1f25f7c6c7e7018decc86d98fd537b6e`を維持し、今回の各portableコピーと一致。版追加・再publishなし。Node24.21.0/pnpm12.10.1/.NET SDK10.0.401、固定依存と入力・試験・発行物のハッシュをvalidation.jsonへ記録。
- 境界/再解析/使用中を確認して未参照の旧成功settings-notice3件を整理し、各方式の最新3件・再利用参照・固定・失敗/不明資料を保持。隔離試験プロセス残存0。ローカルコミットまででpush・Release・実利用deployなし。

## 2026-10-13 Windows通知統合 / 0.32.0

通知基盤の段階5を実装。Windows adapter、全表示先の設定選択、Applet生成の予約種類appdock.legacy、旧showの署名/null/silent/所有コマンド、起動時更新のお知らせを統合した。更新適用成功は既定banner/6秒を維持する。OS受付はaccepted、OS消去はhiddenとしてactive/既読と分離し、同じ通知IDの内容更新だけを置換する。発行前レビューでconstructor失敗時のcallback回収、shutdown回収とstartup gateを補完した。新たな設定対象種類の追加によりマイナー0.32.0、SDK署名は変更なし。未変更Appletは再発行していない。

証跡: .artifacts/commit-validation-notification-windows-0.32.0-20261013/validation.json、review.md、tree-sealed.txt、inputs.json、fixture-inputs.json、environment.json、seal.json。型検査、標準355/355、通知設定8群、センターsource9/fixed7群、desktop source7群。fixed Windows6群は実Node/.NETプロセス、実WinRT通知履歴のTag/Groupと同ID置換・自身の撤去、Windows Shell URI dispatch、配置/profile別の外側EXEへ起動中/停止後/終了後の到達を検証。物理toastクリック・実Gmail受信は自動化していない。最初の標準失敗2件は将来Windowsの旧期待値、固定試験失敗は.NET fixtureの初期有効化漏れで、製品不具合として扱わず試験を修正し全必要回帰を通した。失敗ログも保存する。

単一EXE 0.32.0: 144124434 bytes、SHA256 7fef8e85b3e705d63c27e98939ae945ee7628a64bd87acf6d870342b6da0c261。publish/update.jsonと隔離fixed EXEを照合。Node24.21.0/pnpm12.10.1/Electron44.6.0/.NET SDK10.0.401、Windows26300 x64、通常ユーザー、GUI直列。lockfile/toolchain・供給元待機検査を維持。開発ドライブの追加不具合なし。push/Release/deploy未実施。次は即時保存と未保存管理の撤去。

## 2026-10-13 設定の即時保存 / 0.33.0

通知基盤の段階1〜5に続き、設定の即時保存を完了。SettingsStoreを正本とし、共有ドラフト・dirty・全体保存/破棄・未保存通知の発行元/種類・mainの途中入力と画像バッファ・専用IPC/URL/回帰を撤去した。妥当なフォーム/部分JSON/画像/通知方針/配置/順序を即時保存し、不正入力と失敗値は現在の画面内だけに保持する。複合編集パネルは適用時に保存。page.settings schema 2、minimumHostVersion 0.33.0を採用し、旧追加Shellの設定領域だけDefault Shellへ戻す。公開Shell契約の変更により本体をマイナー0.33.0とし、保存形式と通知SDKは維持した。

- 発行前・コミット前レビューは`.artifacts/commit-validation-settings-immediate-0.33.0-20261013/review.md`。範囲/所有者/再送/外部競合検査、未編集値の保持、原子的保存とWindows登録復元を確認。未設定Applet行、連続文字入力の空白、本文CSS、購読と操作のrevision競合、非表示WebViewのclose、遅いviewport、ナビゲーション確定後の矩形再報告を修正した。廃止モジュールがビルド出力に残らないことも確認。
- 最終検証tree `52eff4b0e9e47ede3c4f619c5e0382d8369c098f`でstage/作業ファイル/全入力ハッシュと検証前後treeが一致。型検査、標準356/356（失敗/skip 0）、関連GUI 28スクリプト、固定EXE 7スクリプトの37コマンドが全てexit 0。完全ログ/引数/cwd/時刻/exit/ログSHA256/環境/testedTreeはvalidation.json、入力はinputs-sealed.json、439件のSDK/worker/fixtureはfixture-inputs-sealed.json、参照Appletはsiblings.json。途中の別tree・失敗・D:環境は最終検証として再利用していない。
- 設定Shell source 9群/fixed 7群、通知設定8群、センターsource 9群/fixed 7群、desktop source 7群/fixed 5群、banner 8群。連続入力/IME/画像原素材/保存失敗fixture/部分JSON/競合/追加・旧Shell・故障復旧/再起動、通知方針・寿命・履歴・操作を検証。ネイティブShell画像を目視し、親Windowだけの画像を本文描画の証明にしない。navigation/search/preferences/並び順/shortcuts/ribbon/tray/sidebar/home/logs/sync/MCP/WebApplet/Applet API/pages/default shortcuts/hardware/host commands/UIの関連回帰も確認。
- Windowsキー割り当て10群、グローバルキー9群、共有ネイティブ入力4群は実入力で成功。ジェスチャー設定8群は既存UI-onlyモードで適用/取消/保存/再起動を確認。今回変更していない物理ジェスチャーフックの全入力は対象外とし、前景取得で失敗した補助試験は成功扱いにしない。
- fixed Windows通知6群は実Node/.NET、実WinRT履歴Tag/Group・同ID置換/撤去、Windows Shell URI、配置/profile別の元EXEへの到達を確認。fixed起動登録6群は日本語/空白/引用符付きEXEの実タスク登録/実行/解除、標準ユーザー拒否と状態保持、再起動を確認し、試験タスクを解除。fixed実更新11群は本体/全Applet/別々/個別の置換、正確なEXE bytes、新PID、ログイン/設定/enabled保持、トレイ起動、設定カテゴリ/Applet画面復元まで確認。実更新のhost/updates/appliedはbanner配送記録を確認した。
- 試験は実Settings/ribbon Shellと即時保存へ追随。旧dirtyガード、全体保存/破棄、組み込みShellを外部fixture版へ更新する期待値を除去し、実保存とOS結果を検査。非同期Playwright predicateはNode側待機へ修正。トレイ起動のlazy Homeを準備条件にせず、コールド再起動は60秒上限と新PIDで確認。初期接続拒否は起動待機の診断として記録。途中の失敗ログ/profileを保持。
- 開発ドライブ祖先mountの更新helper拒否は前段階で修正し、今回もA:\\30.PROJECT配下の実更新が成功。途中のD:割り当て/解除でNode実体パスとpnpm workspace記録がA:/D:間で変わった。固定lockfileで復旧し、D:解除によるENOENTで失敗した発行をA:側のビルドから再実行。最終環境はA:、Node24.21.0/pnpm12.10.1/Electron44.6.0/.NET SDK10.0.401・Runtime10.0.12、Windows26300 x64、通常ユーザー、GUI直列。359パッケージ再利用/ダウンロード0、lockfile/toolchain/供給元待機/依存検査を維持。
- 単一EXE 0.33.0: 144124612 bytes、SHA256 `53bb083c087cab40378065c9efbb1fd9ea8c47e082da30b57739689044d8b78c`。update.json、Default Shell版、固定コピー、最終EXEを照合。artifacts.jsonの固定確認開始treeとの差分は起動/更新/保存待機の試験3ファイルだけで製品不変。固定確認も最終treeで再実行。検証後の文書のみの追記はdocs-after-validation.patch、最終tree/commitはseal.jsonへ保存。
- 終了/明示成功/実行方式/参照証跡/絶対パス/再解析点/使用中を検査し、古い成功profile 21件を整理。各方式の直近3件・固定/再利用/失敗/不明を保持（cleanup-result.json）。不要な一時編集スクリプトも整理。隔離試験プロセス残存0。現行文書のローカルリンク221件に欠落なし。
- 物理Windows toastクリック、実Gmail認証/受信、UAC承認/実管理者トークン/実サインイン、物理混在DPIは自動確認していない。本体のみpublishとローカルcommitまで。未変更Applet再発行・全体ZIP・push/Release/実利用deployなし。依頼された通知基盤と即時保存に未実装段階はない。

## 2026-10-16: 0.46.0 Release準備と全体ZIP試験の追従

- GitHubアカウント変更をAPIで確認し、release.cjsとRelease手順・fixtureの公開先をyukichi-7sai/AppDock.at365へ更新。公開先fixture10/10成功。製品の版更新は行わない。
- 初回Prepareは型検査・標準485/485・本体発行・6Applet全体ZIP生成まで成功し、portable-updatesの初回起動接続が失敗。同じ配布物による再試験11項目が成功。第2準備は更新GUI・進捗・復旧まで成功したが、全体ZIP試験が起動待機と旧Shell想定で失敗した。全失敗ログを保持する。
- 全体ZIP試験の待機上限を60秒へ変更し、接続失敗時にCDPを解放。現行のsettings-aware-pageを利用し、内蔵Default Shellの正常起動と外部Applet全一覧を個別に検査する。失敗時にも接続済みの専用AppDockへ終了を依頼する。
- 修正後の同一ZIP試験は成功。ZIP全収録ファイルのsize/SHA256、本体EXEとの一致、6Appletの版/初期無効/エラーなし、内蔵Shell、更新設定の既定値と正常終了を確認。証跡 `.artifacts/release-0.46.0-20261016-02/bundle-ui-retry2.json` と `all-in-one-retry2.log`。各Appletのソース回帰は同フォルダーの `source-reuse.json` に入力・ログhashの再利用判定を保存。
- 製品ソースは変更せず、修正はRelease試験のみ。公開前にコミットして新しいPrepareを実行する。GitHub公開と公開後検証の最終結果は、新しいRelease planを正本とする。

## 2026-10-16: 共通警告通知と旧PC専用データの詳細（0.47.0）

- [設計](docs/warning-notifications-design.md)を作成し、共通WarningReporter、独立した「警告通知」の設定、旧PC専用データの固定範囲検出、一般設定の対象フルパスと整理手順、通知の「詳細を見る」、warningログを実装。rendererの独自エラーバナーを除去。通知を閉じる・期限切れ・OFF後の同状態の再発行を抑止し、解消・再発と原因/対象変更の診断を分けた。
- 削除ボタンは追加しない判断とした。旧ログイン・認証・Applet状態を完全終了後に確認・バックアップして手動で整理する。検出は固定パスのlstatのみ。旧ファイルの内容、認証、JSON本文は収集せず、共有素材・名簿・現在のPC専用rootは対象外。検査不能は未検出扱いにせず既知対象を保持する。
- 発行前レビューは `.artifacts/warning-implementation-20261016/review.md`。通知accessor障害時の反復ログを指摘し、同episodeの配信再試行を止める修正と回帰を追加。検査不能/ENOENTの区別を追加検証。残る発行阻害指摘なし。警告通知の設定項目追加のため本体と内蔵Default Shellを0.47.0へ更新。未変更Appletの版・発行物は変更していない。
- 最終build/typecheck成功。関連16ファイルの回帰 **101/101成功**。warning-reporter、legacy-local-data、error-reporter、settings-health-notifications、notification-policy/foundation/routing/services/speech/center/delivery、settings-page/editing/sync、ui-presentation、shell-boundariesを実行。全標準回帰、実Windows toastクリック、実サービス認証・同期・実利用データ削除は今回対象外。
- 初回の制限環境では既存同期5件が設定renameのEPERM、Electron画面試験が起動拒否で失敗。同じ範囲を通常ユーザー権限で実行すると99/99とソースGUI4群が成功。最終の追加2試験を含む101件も成功した。版更新後の固定lockfile同期は制限環境で供給網検査が進まず中断し、通常ユーザーで成功。検査無効化・依存更新・管理者昇格による回避はしていない。失敗/中断ログを保持。
- 既存publish.batが終了0。本体単一EXE **144202118 bytes**、SHA256 `8621fcb77a446d0364daabc3105412773f913a412d8dc1b04fa799edc64b94f3`。update.jsonの版・size/hashと一致し、内蔵Default Shellも0.47.0。通常publishの範囲とし、未変更Applet再発行・全体ZIP・GitHub公開・実利用先deployは行っていない。
- 固定EXEの隔離GUI4群成功（`.artifacts/warning-notifications-ui-1792085698415/result.json`、コピーhashは発行EXEと一致）。実通知ボタンから一般設定へ移動、3対象のフルパス、独自バナー不在、警告設定の即時保存、閉じる/画面往復/OFF→ON後の抑止、対象追加時のログ更新、ポーリングでの解消/再発、正常終了を確認。削除したのはスクリプト生成・検証済み境界内のfixtureだけ。共有素材/名簿と旧credential fixtureの不変を確認し、ネイティブSettings Shell画像を目視した。ソースGUIの成功profileは `warning-notifications-ui-1792085303432`。
- 証跡・コマンド/終了コード/ログhash・環境・発行物は `.artifacts/warning-implementation-20261016/`。Node24.21.0/pnpm12.10.1/Electron44.6.0/.NET SDK10.0.402、LUNA Windows x64。最終試験前後および発行後の431入力hash一致。lockfile/toolchainは維持。文書リンク137件中、既存READMEの未配置WindowMoverへのリンク1件だけが欠落し、新規リンクの欠落なし。
- 開始HEADは `d74c92e3bb8db9f21fb0ae6a2026f095bae40b63`。終了確認時にHEADが `fb326beabc70802ec08e49e4a6fbf3ea73c07582` へ進んだことを検出（AGENTS.mdの今回の共通警告指示1行のみのcommit）。この作業ではgit commitを実行していない。別途変更された `docs/development-workflow.md` の音声通知リンク修正にも触れていない。通常ユーザーのGit確認で差分検査成功、製品/試験431入力の不変を再照合した。制限環境の一時的なオブジェクト読み取り失敗はGit修復で回避していない。製品の実装・設計・試験は作業ツリーに残す。

## 2026-10-16: 0.47.0の初期値・表示順・一般設定配置の追加修正とコミット

- 利用者指定で通知設定をエラー→警告の順とし、両方の既定の表示時間をnull（空欄・閉じるまで）へ変更。保存済みの明示した秒数は保持する。一般設定の本文・検索項目を起動とウィンドウ→設定ファイル→旧PC専用データの順へ変更。closeToTrayの既定trueを保持し、hardwareAccelerationの新規/欠落時の既定をfalseへ統一した。明示true/falseと他の初期値は維持する。設定例・README・通知の現行仕様と設計を整合。
- 型検査成功。標準dev.bat testはbuild/updater/test-extensionsが成功し493件中492成功、復旧fixtureの旧初期ON依存1件だけが失敗した。選択したJSONへONを明示するfixtureに直し、復旧13/13成功後、標準回帰のテスト部分全体を再実行し **493/493成功**。失敗コマンドの部分成功を全体成功へ読み替えていない。前回101件は共有初期値変更前のため代用せず、今回の493件を正本とする。ビルド・型検査後の差分は当該fixtureと文書だけで、関連入力を照合した。
- ソースGUI（warning-notifications-ui-1792086899847）と、3回起動の描画試験（hardware-acceleration-1792086926409）が成功。エラー/警告の順序、両方の表示時間空欄、一般設定の3区分の順序、欠落項目での実Electron GPU OFF、明示ON/OFFの即時保存と再起動時反映、GPU compositingの無効化を確認した。ネイティブShell画像も目視した。
- 同じ未公開0.47.0の追加修正として既存publish.batで再発行し終了0。本体単一EXEは **144191025 bytes**、SHA256 `6e9fe06ced0c752380af44a5d8499de57cf79e4b1f8262a815caf4b51dd1cb0a`。update.jsonのsize/hash/版と一致し、内蔵Default Shellも0.47.0。新しい固定EXEの隔離GUI4群も成功（warning-notifications-ui-1792087191545）。コピーhash、通知の寿命・詳細・設定保存・配置・データ保持・解消/再発・正常終了を確認した。
- 発行前レビュー・再利用/再実行の判定・438入力hash・完全なコマンド結果とログhash・発行物・stage tree/commit照合の正本は `.artifacts/commit-validation-warning-20261016/`。前回の警告実装と今回の修正の28ファイルをコミット対象とし、別作業のdocs/development-workflow.mdの音声通知リンク修正は除外。未変更Appletの発行、全体ZIP、push、GitHub公開、実利用先配置は行わない。実利用の設定・旧データは操作していない。

## 2026-10-16: 新方式Appletの不要な旧通知設定欄を除去（0.49.0）

- 通知種類宣言済みのAppletには宣言済み種類だけを公開し、自動生成の「旧方式の通知」を付けない。Gmailは既にnew-mailとpublish/endを使用しているためGmail repoの修正・再発行は不要。未宣言/空配列の旧API専用Appletは従来の予約種類を維持する。種類宣言済みAppletは旧showではなくpublishを使用する契約を文書へ明記した。
- 指定に従い設定の移行・削除・変換コードは追加しない。保存済みの未知種類を保持する既存動作は維持するため、旧上書き設定がある場合は「現在利用できない種類」に残り、通常の削除操作で整理できる。
- 設定項目の削除により本体0.48.0→0.49.0へ更新。発行前レビューと試験修正の再レビューは `.artifacts/legacy-notification-removal-20261016/review.md`。発行阻害指摘なし。型検査・本体/Default Shellビルド・通知方針/サービス/基盤/配送/読み上げ/設定ページの関連回帰 **51/51成功**。
- 既存publish.batは終了0。単一EXE **144204938 bytes**、SHA256 `6783905784007e56b84755313b51dd50eb5a188eaf0694dd4513668ca7f3b4d9`。update.jsonの0.49.0/size/hashと一致、内蔵Default Shellも0.49.0。未変更Appletの発行・全体ZIP・commit/push/公開/実利用先deployは行わない。
- 固定EXEの隔離GUI **8群成功**（`.artifacts/notification-settings-1792091059251/result.json`、コピーhash一致）。旧方式スイッチの不在、実Node/.NETの新API発行と所有操作、即時OFF/ON、期限/手動寿命、不正引数/他所有者拒否、親スイッチ、設定検索/初期化、再起動/履歴、両テーマを確認。ネイティブSettings Shellのdark/light画像も目視した。実Gmail認証/受信と物理Windows通知クリックは今回対象外。
- GUI初回～3回目の再試験は期限試験で失敗。描画前の不在を期限切れと見なす待機を修正し、表示先の準備を発行前へ移動、短時間fixtureを5秒・手動維持確認を5.6秒へ変更した。さらに直近で追加されたコマンド結果の情報バナーが表示枠を占めることを確認し、隔離fixture内だけ本体情報通知をOFFにして成功。失敗ログとprofileを保持し、部分成功を全体成功として扱わない。製品EXEへの追加変更はない。
- 制限環境の固定依存同期は供給網検査待機で中断。通常ユーザーで同じ同期が成功し、固定lockfile/待機/依存検査は維持した。以後のビルド・試験・発行は通常ユーザー実行。検証開始HEAD `bf2519ef6fe87c9006c36da3fe657160983a6986`、入力hashと最終差分、完全ログhash/コマンド/終了コード/環境/成果物は `.artifacts/legacy-notification-removal-20261016/validation.json` 等。ソース回帰後の入力変更はGUI試験スクリプトだけで、製品入力は不変。型検査・ビルド・51件は最終製品へ適用できる。標準全回帰は未実行。
- 後片付け: 調査用debug.cjsのみ削除。今回の方式の確認済み成功profileは1件のため古い成功分の削除対象なし。4件の失敗profileとログを保持する。固定ビルド出力と他作業資料は保持する。

## 2026-10-16: 0.49.0のコミット前検証

- 旧通知設定欄除去の9ファイルをレビュー。製品・試験の最終入力hashと実装時ログhash、固定EXE/GUI成功結果を照合し、変更なし。型検査・ビルド・関連51件・固定EXE GUI8群を再利用する。保存設定の移行は追加しない。
- 不足していた本体標準回帰を追加実行。dev.bat run build:test-extensionsが終了0、その後dev.bat exec node --test tests/*.test.cjsが **498/498成功、終了0**。成功済みの本体/Updaterビルドは再実行せず、fixtureは今回再生成して検証した。製品ソース/依存/発行物は不変のため版更新・再発行は不要。
- 正本は `.artifacts/commit-validation-legacy-notifications-20261016/` の完全ログ・入力/ログhash・再利用判定・stage tree/commit照合。変更範囲は本体の通知カタログ、回帰/GUI試験、文書、0.49.0の版。Gmail repoは変更しない。ローカルコミットのみでpush・公開・実利用先配置は行わない。

## 2026-10-16: 設定画面の配置・折りたたみと既定テーマ（0.49.2）

- 表示は見出しなしのテーマカード→ワークスペース一覧（冒頭のShell見出しを撤去）。一般はウィンドウ→スタートアップ→Applet・MCPからの操作→設定ファイル。閉じる操作を「閉じるとトレイに収納」、起動時を「起動時にトレイに収納」へ変更し、ハードウェアアクセラレーションはウィンドウ内に保持した。旧PC専用データ欄・検索項目は撤去し、警告の詳細ボタンを本体ログへ接続。データの削除・移行は行わない。
- 通知は受け取り方→読み上げ→提供元グループの順。受け取り方と各通知種類は初期状態で閉じた共通カードにする。TTS接続先の文言と、ジェスチャーの閉じた共通カード・内部の動作設定カードを整備。検索によるカードの自動展開と即時保存を維持する。新規テーマはlight、host.notificationsとgestures.enabledは既存のtrueを確認して保持。保存済みの明示値は変更しない。
- 発行前レビュー1回を実施。削除した旧データ欄への誘導、通知説明、ドキュメント、関連GUIの旧見出し/折りたたみ前提を整合。共通カードの余白と重複見出しも修正し、型検査・ビルド・ソースGUIを再確認した。設定キー・保存ファイル・公開APIの追加削除はなく、診断表示の撤去なのでパッチ更新0.49.1→0.49.2。レビュー記録は `.artifacts/settings-layout-validation-20261016/review.json`。
- 型検査・本体/Default Shellビルド成功。core/settings-page/settings-editing/settings-commands/gestures/legacy-local-data/notification-policyの関連回帰 **62/62成功**。新規Light既定値によりwatcher fixtureの書き込みが元値と同じになったため、実際に異なるDarkを書き込むよう修正。全標準回帰、実Windows起動登録/UAC、物理ジェスチャー、実サービス通知は今回未実行。
- 既存publish.batが終了0。固定lockfileの供給網検査、.NETホスト/InputHost/Updater、TS/Shell、portable梱包を維持。本体EXE **144201873 bytes**、SHA256 `3b0f1e4f355422dc0e9e512682ce1edca302530419e9f0a39ba06baab17cd4ac`。update.jsonの0.49.2・size/hashと一致。未変更Applet、全体ZIP、commit/push/GitHub公開/実利用deployは対象外。
- 固定EXEコピーの隔離GUI **17群成功**。設定配置5群は `.artifacts/settings-layout-1792096753958/result.json`（見出し・順序・文言・折りたたみ・新規既定値/明示値保持・即時保存・検索展開）。警告4群は `.artifacts/warning-notifications-ui-1792096768518/result.json`（ログ導線・対象ログ・抑止・再発・fixtureデータ保持）。通知8群は `.artifacts/notification-settings-1792097027159/result.json`（実Node/.NET通知API・種類別/親スイッチ・期限・入力拒否・検索・両テーマ・再起動/履歴）。3コピーのhashと最終EXEが一致し、各試験の正常終了を確認。ネイティブSettings Shellの画像も目視した。
- 制限内の原子的renameはEPERM、Electron起動は失敗、publishの供給網検査は停滞したため中断。同一処理を通常ユーザー権限で再実行して成功。GUI試験側は起動/描画待機、検索欄のcombobox role、開閉で要素集合が変わるlocatorを修正。Dark画像の初期値依存も見つけたため、fixtureにDarkを明示して両テーマを再確認。初回失敗ログは保持し、成功の証拠として使わない。発行後の追加変更は通知GUIランナーだけで製品入力/EXEは不変、再発行不要。
- 証跡は `.artifacts/settings-layout-validation-20261016/validation.json`、入力一覧/各SHA256、完全ログ、レビュー、成果物hash。開始HEADは `0e133ab4996b79b8efa1a9820ef74156934eaf61`（main）。前後照合で製品入力・固定依存の不変を確認。ソース検証後は版とGUIランナーだけ、発行後はGUIランナーだけの変更を記録した。
- 後片付け: 今回作成した編集用スクリプト2本を削除。設定配置の成功はsource2/portable1で保持範囲内。通知と警告はportable4件ずつで、最古は既存legacy-notification-removal/warning-implementationの再利用証跡のため保護し、他3件も保持。失敗/状態不明profile・今回の再利用資料・固定出力を保持し、既存テストprofileの削除は0件。

## 2026-10-16 通知OFF設定の撤去・設定見出しの要約・ジェスチャー配置（0.50.0）

- 通知種類ごとの有効スイッチとApplet共通の通知許可を撤去。host.notifications、notificationPreferences.overrides[].enabled、通知ON/OFF生成コマンド、manifestのdefaultEnabled/canDisable/disabledControlReasonを現行契約から除去した。旧キーは互換読込で破棄し、旧false値で新規/既存通知を抑止しない。読込だけのファイル書換えは行わず、通常保存時に不要キーがなくなる。停止Applet・世代変更・不整合な通知先の内部抑止とNotificationPolicy.enabledは維持する。
- バナー必須のエラー・警告・情報通知は、バナー解除と通知センターのみを引き続き拒否する。各種類は既定で折りたたみ、見出しに現在の通知先・表示時間・読み上げON/OFFを表示する。編集すると要約も更新される。マウスジェスチャーは独立した有効トグルと、既定で閉じた共通カードの「動作設定」に分離した。
- 設定削除を含むため0.49.2から0.50.0へマイナー更新。発行前レビューで通知定義・互換読込・内部抑止・必須先・設定API・表示を確認し、公開テーマ定義の既定値もlightへ統一した。旧dark既定値と旧OFF動作に依存していた回帰fixtureを新仕様へ更新。型検査と標準dev.bat run testは **498/498成功**。更新した.NET API検証用AppletもReleaseビルド成功。
- 既存publish.batで本体単一EXEを発行。終了0、ProductVersion **0.50.0**、**144193021 bytes**、SHA256 `b8c7a2e60f0097a613cd84c258f1f77f762e966868437904e361316090074323`。update.jsonの版/size/hashと一致。
- 固定EXEコピーの隔離GUI **31群成功**。設定配置5群: settings-layout-1792098806434、通知8群: notification-settings-1792098833665、警告4群: warning-notifications-ui-1792098882489、情報通知9群: information-notifications-ui-1792098916696、Applet API5群: applet-api-portable-1792099190607。全result.jsonを.artifacts配下に保存。コピーhash一致、実Node/.NET発行・センターのみ・期限/手動寿命・不正入力拒否・必須バナー・検索展開・設定と履歴の再起動保持・隔離MCP経由のAPI/権限を確認。Light/Darkとジェスチャーの画像を目視した。
- 制限環境の.NET試験ビルド、EXE起動、依存検査は失敗/停滞し、同じ処理を通常ユーザー実行して成功。API GUIランナーの既存AI権限数・ページ見出し・遷移直後の描画待機を修正し、失敗時の画像取得が本来のエラーを隠さないようにした。発行後の変更はこの試験ランナーと文書だけで製品入力は不変。修正後のAPI GUI全体を同一EXEで再実行し成功。初回失敗ログは保持し、成功扱いにはしない。
- 入力一覧/hash・fixtureバイナリhash・各コマンド/ログhash・発行前レビュー・EXE照合の正本: `.artifacts/notification-always-enabled-20261016/validation.json`。全体テストから発行・GUIまでの製品入力の一致を確認。実Gmail認証/受信、物理Windows通知クリックは今回対象外。commit/push/外部公開/実利用先deployなし。
- 後片付け: 今回の編集用一時スクリプト6本を削除。各方式の直近成功3回と、過去のwarning/commit-warning/notification-colors/legacy-notification-removal検証から参照する再利用証跡を保持し、テストprofileの削除は0件。失敗/不明profileと固定ビルド出力も保持。今回の試験プロセス終了を確認した。

## 2026-10-16 設定画面・通知設定変更のコミット確認（0.50.0）

- 今回のレイアウト/既定値変更、通知OFF設定と不要な制御項目の撤去、見出しの現在値表示、ジェスチャー配置、関連文書/試験の65ファイルをコミット対象としてレビューした。実装完了時の作業一覧と一致し、別作業の差分なし。
- `.artifacts/notification-always-enabled-20261016/validation.json`の入力一覧、各成功ログ、5つの固定EXE GUI結果、.NET fixtureバイナリ、最終EXEとupdate.jsonのSHA256を現在値と照合し、差異0。型検査・標準498件・固定EXE GUI31群・.NET fixtureビルド・publishの成功を再利用した。新たな製品修正や再試験の必要なし。版は0.50.0と既発行物を維持する。
- コミット時の照合・stage tree・commit/tree・作業ツリー状態は `.artifacts/commit-validation-settings-notifications-20261016/` に記録する。検証記録の追記だけを検証後の文書差分として扱う。push・外部公開・実利用先deployは行わない。新規テストprofileの生成なし、以前の成功証跡を再利用資料として保持。

## 2026-10-16 発行先の40.ARTIFACTへの移行

- 発行先: `A:\40.ARTIFACT\AppDock.at365`。publish.batとビルド・更新梱包・関連検証の参照を変更。配置用正本はdeployment/へ移動し、成功後に発行先へ追加。deployは発行済み成果物を使い、既存deploy.bat・関連スクリプト・deploy.local.txtを保持する。配置先設定はハッシュ一致を確認して旧repo直下から移動。旧publishの過去成果物は保持。
- レビュー: 発行パス・削除境界・配置の独立動作・設定保持・梱包/Release参照を確認。GmailのWeb出力ガード、配置時の再ビルド依存、試験fixtureの分離、文書参照を修正して再確認。未解決指摘なし。発行基盤のみの変更のため製品版は0.50.0を維持。
- 検証: publish.batを2回実行し両方終了0（`.artifacts/publish-relocation-20261016/publish.log`、`.artifacts/publish-relocation-20261016/republish.log`）。7repo合計24配置用ファイルのハッシュ保持。全7repoの独立配置fixture28ケースとWebApplet専用6ケース、WebApplet単体2件、梱包/Release fixture11件、本体型検査・最終EXE隔離起動が成功。全feedの版・サイズ・SHA256、Applet ZIPの全収録ファイルと発行物を照合。
- 発行物SHA256: `123ae11497bdc10e8da522b8fc820440d2c89510ffc36208b12790c9e2f5e76f`。共通証跡: [検証一覧](../AppDock.at365/.artifacts/publish-relocation-20261016/validation.json)、[出力照合](../AppDock.at365/.artifacts/publish-relocation-20261016/artifact-validation.json)、[再発行保持](../AppDock.at365/.artifacts/publish-relocation-20261016/republish-result.json)。
- 制限環境のpnpm STATUS_STACK_OVERFLOWとEXE spawn失敗、fixtureのrename EPERMは通常ユーザー権限で同一処理を再実行して成功。依存版・lockfile・検証方針は維持。実利用先deploy・commit・push・外部公開は未実行。製品機能の変更がないため無関係な全回帰・実アカウント操作は実行していない。

## 2026-10-16 発行先移行のコミット前確認

- 実装時の入力スナップショット全7repoとログSHA256、最終発行EXE・各ZIP/feed・配置用24ファイルを照合し、型検査・ビルド・発行2回・配置・隔離起動・梱包Release fixture11件・WebApplet単体2件/配置6ケース・WebBrowserTools単体2件を再利用。製品と発行物の変更はないため再発行・版更新は不要。
- 不足分として本体標準回帰の残り487件、Gmail22件、Watch8件、WindowsTools38件、WallpaperSlideshow標準回帰を確認。本体486件は初回で成功、実行ディレクトリに依存するnode-invocationの1件は正しいrepoディレクトリから単独再実行して成功。既存11件と合わせ本体498件・skipなし。初回コマンドの終了1は保持し、全体成功へ読み替えず試験単位で照合。
- 通常ユーザー実行でfixtureビルドとネットワーク依存の.NET検証・Git fetchが成功。全7repoの入力と発行物を維持。失敗時の作業ディレクトリに生成された今回の試験資料は共通証跡内のinitial-cwd-artifactsへ移動して保持。
- 共通証跡: [コミット検証](../AppDock.at365/.artifacts/commit-validation-publish-relocation-20261016/validation.json)。stage treeとcommit tree、プッシュ先mainの一致を同フォルダーへ記録する。実利用先deployとGitHub Releaseは対象外。
