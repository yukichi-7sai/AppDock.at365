# 検証記録

## 2026-10-27: 画像グループと所属のMCP対応 0.96.6

- main `1134e3c87be5cab69d9fd3851b280cb271388d76`のclean状態から開始し、追跡先への`pull --ff-only`でAlready up to dateを確認した。既存のimageLibrary.groupsを固定6入口へ接続し、設定項目・保存形式/ファイル種類・操作許可・MCPツールは追加しないため、パッチを0.96.5から**0.96.6**へ進めた。旧MCP worktreeと無関係な変更を保持し、共有の分類ownerとMCP接続の2単位でコミットする。
- グループ名簿はID/名前を公開し、追加・名前変更・削除・並べ替えに対応。IDは読取り専用で、追加時にUUIDを生成する。名前の前後空白、1～80文字、制御文字と大文字小文字を無視した重複、64グループの既存検証を使う。各グループから所属一覧を自動生成し、ファイル名を使う追加・解除・並べ替えに対応する。グループ増減で対象一覧を更新し、固定ツール定義のリフレッシュを必要としない。
- 所属の候補は画像サービスのキャッシュにあるファイル名だけで、512参照/グループ・4096所属/全体の既存上限を保持。パス/URL・未知候補・重複を拒否し、未到着の既存参照は取得・解除・並べ替えできる。候補変更はSchema/cursorを失効させる。画像bytes・サムネイル・実パス・内容世代は返さず、読取り/dryRun/保存で原画像の走査・decode・取込み・削除を行わない。
- ネイティブのグループ編集とMCPはImageLibrarySettingsの変更計画・既存parser・保存を共用する。保存前のrevision/元値とpreflightを再検査し、無変更/dryRunは書き込まない。グループ削除は分類だけを外し、原画像、使用先、他グループの所属、無関係な共有/PC設定と暗号化情報を保持する。破損形式はavailable=falseとして不正値を投影しない。共通の再送/許可取消・原子的な失敗処理を維持した。
- 発行前レビューで公開範囲と権限、分類ownerの共有、候補/Schema/競合、既存の容量上限、原画像/使用先/暗号文の保持、ネイティブダイアログの同時編集、翻訳/現行文書を確認し、製品の阻害指摘なし。初回の画面画像が所属解除の描画完了前だったため、GUI試験に1カードの状態を待つ検査を追加し、実MCP全58群を再実行して画面画像も確認した。製品コードの追加修正はない。
- 固定lockfile install、整形、型検査、本体/Default Shell buildと、標準**133ファイル1138/1138件（fail/cancel/skip 0）**が成功。新規**12件**は公開値/無副作用、dryRun/保存/再送、UI共有owner、グループ/所属の追加・削除・挿入/並べ替え、ID保護/名前検証、候補変更/未到着参照、原子的な不正入力、外部変更/権限取消、破損形式、64/512/4096上限、無変更/preflightと共有/PC保存を確認する。関連する既存画像・削除・ギャラリー・翻訳の回帰も成功した。
- 最終sourceの実MCP **58群**、発行した固定EXEの実MCP **60群**と隔離smokeが成功。ネイティブの名前変更ダイアログを開いたままMCPで別グループを変更しても双方が残り、グループ順序・所属のネイティブ/MCP編集が一致することを確認。原画像と既存の使用先、暗号化3ファイルのbytes、固定tools/listを保持した。source/固定EXEの画面画像を確認し、既存の画像管理画面と共通部品の配置/外観を維持している。
- 通常発行先`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**0.96.6 / 170,710,806 bytes / SHA256 `8b2811654a474adf6020f17cc700244549cedc7cd30c273f94e19496f00f1477`**。ASAR SHA256は`967b784d79b8ffd9535098995e460632bd5b74c3d5925858c3f45f1b9d72f68e`、feed SHA256は`43674ff2f0f78c4f4fbd15d4685dd8a4b0631d2327656c4f4c08801564571f46`。**254出力・621 resource**を生成元と全件照合し、File/ProductVersion・package・Default Shellの版とfeedのsize/hashが一致。固定試験用EXEコピーも最終EXEと一致した。
- 標準試験前後の全入力は一致し、その後の差分はGUI専用の`scripts/settings-image-group-gateway-checks.cjs`の描画待ち検査だけ。標準試験・製品・依存/ビルドの入力に影響しないため標準1138件と型検査は再利用し、影響するsource GUIを再実行した。最終GUI前後・発行後・固定試験後のソース/テスト/依存/ビルド入力と参照Applet manifestは全件一致。環境はLUNA、Windows 11 x64 10.0.26300、Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.403。完全ログ・入力/発行物照合・レビューは`.artifacts/mcp-settings-image-groups-20261027/`、stage/tree/commitの根拠は`.artifacts/commit-validation-mcp-settings-image-groups-20261027/`へ記録する。
- 後片付けでは専用GUIプロセス0、検証用Windowsタスクが未登録かつXMLなしを確認。成功したsource/固定コピー、画面待ちの診断、過去のコミット根拠、個別の完了マーカーがない単体出力を保持し、削除0。既存deploy設定/スクリプトと発行先の利用者設定を保持した。原画像の取込み/削除・任意JSON・専用Web名簿は今回の範囲外。Pause/F13～F24のOS送信/登録、実UAC同意、実ログイン/Cookie消去、Windowsサインインの試験は行っていない。push・Release・実利用先deployは行っていない。

## 2026-10-27: ショートカット一覧設定のMCP対応 0.96.5

- main `13d048dff824dec061efa63658b03f961c5dd689`のclean状態を確認し、追跡先から`pull --ff-only`（Already up to date）後に継続。既存のshortcut-list型を固定6入口へ接続する変更で、設定項目・保存形式/ファイル種類・操作許可・MCPツールの追加はないため、パッチを0.96.4から**0.96.5**へ進めた。旧MCP worktreeと無関係な作業を保持してmainで実装し、共通定義/検証/初期値とMCP接続の2単位でコミットする。
- Appletの宣言からID/名前/送信するキーの3列を持つlist対象を生成し、追加・部分編集・削除・並べ替えに対応。automation省略/trueは公開、false/secret/localOnlyは非公開。IDも既存UIと同様に編集でき、読取revisionに束縛したitemRefを使う。32件上限、ID形式/重複、名前/キーの長さとキー検証はUI/自己設定APIと同じ規則を使う。初期ID・初期名・Ctrl+TはUIと同じ関数から生成し、保存キー・配列順・共有/PC専用分類を維持する。
- 通常フィールドの全体置換やresetを追加せず、既存SettingsCommandsの計画/検証/保存へ委譲。未知属性はMCPの列/プレビューへ返さず、MCPとネイティブ編集で未編集行も含め保持する。未知属性にnull以外の値を持つ行のMCP removeはLOCAL_ACTION_REQUIRED。不正な保存値や停止中のAppletはavailable=false。設定欄と3列の南京錠は同じownerから判定する。従来の単純設定API/他Applet向けの対応型とvalidSendKeysの既存exportを保持した。
- 発行前レビューで公開/権限、共通検証と追加時の既定値、編集可能ID、無変更/再送/競合、部分失敗の原子性、未知属性と行削除、共有/端末保存、入力確定と南京錠、翻訳を確認。明示nullが未保存の空配列と同じ扱いになる問題を期待した失敗1件で再現し、shortcut-listはundefinedだけを未設定と扱うよう修正した。object-listの従来のnull処理は維持し、修正後の標準/GUIを再検証して阻害指摘なし。再現ログも保持した。
- 固定lockfile install、整形、型検査、本体/Default Shell build、最終入力の標準**132ファイル1126/1126件（fail/cancel/skip 0）**が成功。新規**10件**は公開/旧API範囲、dryRun/保存/再送/追加既定値、ID/名前/キーの部分変更、非公開列/未知属性保持、重複/不正キーと後半失敗の原子的拒否、行保護、挿入/並べ替え/空配列、32件/ページ分割/無変更、古いitemRef/cursorと権限取消、破損値/null/停止、後から増えた宣言とPC専用保存を確認する。
- 最終sourceの実MCP **54群**、発行した固定EXEの実MCP **56群**と隔離smokeが成功。MCPとネイティブのID/名前/キー編集・追加/削除、MCP挿入/並べ替え、未知属性の保持と行保護、重複ID/不正キーの原子的拒否、古い要求/cursor、固定tools/list不変、暗号化3ファイルのbytes保持、公開欄は南京錠なし/非公開欄は南京錠ありを確認した。fixtureは実行ハンドラー/入力フックを持たず、キーは文字列入力だけを行った。画面画像も確認し、既存の共通入力/レイアウトを維持している。
- 通常発行先`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**0.96.5 / 170,714,891 bytes / SHA256 `ce36d5e5a0ab976759d3afb3396cec76e55d60cee659c8fa57cea69592c41dfd`**。ASAR SHA256は`40996c81aabf71185b3c4131f7230336d32c3a65f16ff2f28d3a15f54ee2795b`、feed SHA256は`1e0568ba99a9db6b0769812ff2ebef7e23241bd99a449a3ff61e19f54c0c5fd5`。**252出力・621 resource**を生成元と全件照合し、File/ProductVersion・package・Default Shellの版とfeedのsize/hashが一致。固定試験用EXEコピーも最終EXEと一致した。
- 最終の型検査/標準/source試験・発行・固定試験の前後でソース/テスト/依存/ビルド入力と参照Applet manifestのhash一致を確認。環境はLUNA、Windows 11 x64 10.0.26300、Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.403。完全ログ・入力/発行物照合・レビューは`.artifacts/mcp-settings-shortcut-lists-20261027/`、コミット単位ごとのstage/tree/commit根拠は`.artifacts/commit-validation-mcp-settings-shortcut-lists-20261027/`へ記録する。
- 後片付けでは専用GUIプロセス0、検証用Windowsタスクが未登録かつXMLなしを確認。今回の成功資料・固定コピー、過去のコミット根拠、nullのレビュー再現、個別の完了マーカーがない単体出力を保持し、削除0。既存deploy設定/スクリプトと発行先の利用者設定を保持した。Pause/F13～F24のOS送信/登録、実キー送信/コマンド実行、実UAC同意、Windowsサインインの試験は行っていない。自由JSONや残る専用サービスは別範囲。push・Release・実利用先deployは行っていない。

## 2026-10-27: Webアカウント公開名簿のMCP対応 0.96.4

- main `7531fa445bcfdc5c18cecf756664c208af5386ee`のclean状態を確認し、追跡先から`pull --ff-only`（Already up to date）後に継続した。既存のweb-profiles名簿を固定6入口へ接続する変更で、設定項目・保存形式/ファイル種類・操作許可・MCPツールの追加はないため、パッチを0.96.3から**0.96.4**へ進めた。旧MCP worktreeと無関係な作業は保持し、今回の変更はmainで行った。
- `web-profiles`を宣言した提供元ごとにlist対象を自動生成し、ID/名前の取得、枠の追加、名前変更を公開。IDは読取り専用で追加時に`account.<UUID>`を生成し、最大32件、名前1～80文字/空白正規化/制御文字拒否を既存parserで検証する。同名行をitemRefで区別し、挿入時も既存行同士の順序を保持する。削除・クリア・並べ替え・認証編集は公開しない。名前列とローカル専用操作列の南京錠は同じownerのメタデータから判定する。
- UIとMCPの追加/名前変更をWebProfileStoreの変更計画と原子的保存へそろえ、元のファイルbytesによる競合を保存直前にも確認する。未編集の未知属性、既存ID、設定JSONのbytes/revision、削除待ち記録、session、暗号化ファイルを保持した。読取り/dryRunだけでは名簿を作成せず、明示addだけが空の名簿を初期化する。公開読取りからRemotePageServiceの初期化・session整理・ページ表示を行わない。停止中・複数提供元・既存移行先にも対応する。
- 発行前レビューで公開/権限、提供元の寿命、旧名簿とローカル状態、未知データ、同名/ID/最大件数、競合/再送、エラーの秘匿、UIの確定/取消と削除ガードを確認し、阻害指摘なし。公開IDの表示名を専用の翻訳キーへ修正した。追加/名前変更がローカル削除待ちを書かなくなるため、既存同期試験の競合注入を共有ファイルの一時書込みへ移し、同期中の配信を上書きしない同じ性質を確認した。初期の型診断、fixtureの設定初期化/移行形式/select optionsの不足は修正し、失敗ログも保持した。
- 固定lockfile install、整形、型検査、本体/Default Shell build、標準**131ファイル1116/1116件（fail/cancel/skip 0）**が成功。新規**11件**は公開範囲、dryRun/保存/再送/無変更、未知属性とローカル状態の保持、追加/候補/再起動、後半の不正変更の原子的拒否、古い要求/cursor、破損/未到着、複数提供元/移行、稼働サービスの再利用とbusy、保存直前の競合、権限取消/件数上限を確認する。標準成功後の4入力差分はfixtureのoptions宣言、GUI helper、公開IDの表示名と翻訳資源に限られ、新規11件を再実行し、最終入力で名簿/同期/MCP可否/翻訳の**41/41件**を再確認した。無関係な成功回帰は再利用し、照合差分と根拠をvalidation.jsonへ記録した。
- sourceの実MCP **51群**、発行した固定EXEの実MCP **53群**と隔離smokeが成功。MCPと画面の追加/名前変更、動的なアカウント候補、古い要求/cursorの拒否、非公開列と削除/並べ替えの拒否、固定tools/list不変、未知属性・検証用Cookie相当bytes・削除待ち・暗号化3ファイルの保持を確認した。source試験後の製品差分はIDの表示名と翻訳だけで、最終の固定EXEで全群を確認。画面画像も確認し、既存の共通一覧・名前入力・ローカル操作を維持している。
- 通常発行先`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**0.96.4 / 170,726,144 bytes / SHA256 `dda149cc5080c2c0976839d335fb95ff80765b25be7d03c92218b09962cc47db`**。ASAR SHA256は`c6756659ab863d3f8b58111b5975a9d244778e474e42372f3ad0f8816393c2f6`、feed SHA256は`7f2bc638b45c4778312dcf45fdec167f4382b932e6e6c4df38743c236e9691a6`。梱包した**251出力・621 resource**を生成元と全件照合し、EXE File/ProductVersion・package・Default Shellの版とfeedのsize/hashが一致した。固定試験用EXEコピーも最終EXEと一致する。
- 最終の型検査/影響回帰・発行・固定試験の前後でソース/テスト/依存/ビルド入力と参照Applet manifestのhash一致を確認。環境はLUNA、Windows 11 x64 10.0.26300、Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.403。完全ログ・入力照合・レビュー・発行物照合は`.artifacts/mcp-settings-web-profiles-20261027/`、stage/tree/commitの根拠は`.artifacts/commit-validation-mcp-settings-web-profiles-20261027/`。
- 後片付けでは専用GUIプロセス0、検証用Windowsタスクが未登録かつXMLなしを確認した。今回の成功資料・固定コピー、過去のコミット根拠、fixture診断、個別の完了マーカーがない単体出力は保持し、削除0。既存のdeploy設定/スクリプトと発行先の利用者設定を保持した。Pause/F13～F24の送信/登録、実ログイン/実Cookie消去、実UAC同意、Windowsサインインの試験は行っていない。Gmail等のweb-accounts/accountGroup専用名簿は別範囲。push・Release・実利用先deployは行っていない。

## 2026-10-27: 登録画像参照のMCP設定対応 0.96.3

- cleanなmain `dbd83eb`から開始し、既存追跡先を`pull --ff-only`して最新取得済みを確認した。今回からprimary mainで継続し、旧MCP設定worktreeは変更しない。既存のregistered-image型・保存参照/ID・固定6入口を拡張する通常修正で、新しい保存設定/ファイル・操作許可・MCPツールは追加せず、**0.96.3**へパッチ更新した。push/Release/実利用deployは行わない。
- 通常フィールドと宣言型一覧の登録画像列を同じ公開判定へ接続。入力は既存のfile参照またはnullで、登録済み候補は画像サービスのキャッシュからファイル名だけをページ分割して返す。候補の増減でSchema/cursorを更新し、古い要求・未登録画像・URL/パス・余分な属性を拒否する。読取り/dryRunによる走査・decode・画像取込みはなく、既存の秘密/非公開/PC専用保存と従来の単純設定・他Applet向け公開範囲を保持した。画像欄の南京錠は同じownerから自動判定する。
- 明示的なnullを通常設定/入れ子の画像列/ネイティブフォームで保持し、既定画像の継承と区別した。画像を参照する行のremoveは保護し、画像列を明示的に解除すると他の保護値がない行を削除できる。原画像のbytes・グループ・未編集列/未知データは保持し、画像の取込み/削除は今回の設定操作へ含めない。
- 発行前レビューで公開/候補の範囲、Schema/変更競合、共有/PC保存、既定値とnull、画像行の削除、原画像/暗号文の保持とUI互換を確認。形式不正の古い画像オブジェクトが一覧dryRunのbeforeへ残る問題を、期待した失敗1件で再現し、読取りと変更前後プレビューを同じ公開値投影へそろえた。登録画像だけにnull保持を適用し、他の列の既存既定値処理は維持した。修正後の必要回帰に成功し、阻害指摘なし。
- 固定lockfile install、整形、型検査、本体/Default Shell build、標準**130ファイル1105/1105件（fail/cancel/skip 0）**が成功。新規**12件**は公開判定/旧API維持、512候補のページ分割、dryRun/保存/再送/解除/reset、候補変更・権限取消・原子的拒否、未到着参照の保持、不正値の読取り/プレビュー非転送、一覧の入れ子/null/行保護、キャッシュ取得の無副作用を確認する。初期3件の期待値/fixture、GUIの対象数（共通/更新対象も含まれる）の診断を修正し、初期失敗と期待したレビュー再現ログを保持した。
- sourceの実MCP **48群**、発行した固定EXEの実MCP **50群**・既存リボン画像/復元/モード別 **10群**、計**60群**と隔離smokeが成功。通常画像と入れ子列のMCP/ネイティブ選択・解除、nonnull既定画像からの解除、暗号化済み3ファイル/元画像のbytes保持、候補追加と古いSchema拒否、固定tools/list不変、南京錠を確認した。設定本文と一覧ダイアログの画像も確認し、共通部品の配置/外観を維持している。
- `publish.bat`終了0。`A:/40.ARTIFACT/AppDock.at365/AppDock.at365.exe`は**170715492 bytes / SHA256 `186dda5d95e46c8a954542ab44037dcd3c0b8e1c566e11604949d1ed659c782b`**。File/ProductVersion、feedの版/size/hash、ASAR内package/Default Shell、全**250ビルド出力**・**621追加resource**、固定試験コピーを照合。既存の配置スクリプト/ローカル設定を保持した。
- レビュー後の**784入力**と参照Applet manifestは標準/source検証前後・発行後・固定検証後で一致し、以後の追記は本記録と無視対象の証跡のみ。Node **24.22.1**、pnpm **12.10.1**、Electron **45.0.0**、.NET SDK **10.0.403**、Windows x64を維持した。専用Limited Taskは登録/Task XMLとも不在、専用プロセス0、削除0件。現行/再利用の成功、固定コピー、診断と独立した成功判定のないunitフォルダーを保持した。Pause/F13〜F24のOS送信/登録、実UAC承認/Windowsサインイン、物理入力、実利用設定の変更は行っていない。
- 正本は[設定API](docs/settings-api.md#登録画像の参照)・[画像基盤](docs/registered-images.md#共通設定と選択画面)。実行コマンド/完全ログ・入力/出力hash・レビュー・環境・profile・後片付けは`.artifacts/mcp-settings-registered-images-20261027/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-registered-images-20261027/`へ記録する。公開型・保存・UI解除を1つの機能コミットにまとめる。

## 2026-10-27: MCP設定統合後のmain発行検証 0.96.2

- 統合commit `f341e13`（parents `c5ba87f` / `fa5ce41`）を保存し、cleanなprimary mainを`fa5ce41`からfast-forwardした。MCP設定一式・南京錠と最新リボンを同じtreeへ統合し、worktreeとmainの一致を確認。追跡先の変更、push/Release/実利用deployは行わない。
- primary mainから固定lockfileで通常の`publish.bat`を実行し、終了0。`A:/40.ARTIFACT/AppDock.at365/AppDock.at365.exe`は**0.96.2 / 170702713 bytes / SHA256 `7d03ab3f54270eee03d4570a54bc8b3c84c4939bf7f3878936adda597262d6bc`**。File/ProductVersion、feedの版/size/hash、ASAR内package/Default Shell、全250ビルド出力・621追加resourceを発行元と照合した。既存の配置スクリプト/ローカル設定を保持した。
- 同一Git treeでもWindowsのcheckoutごとの改行によって生成物のbytesが異なったため、単純な全ファイルhash一致だけでは再利用しなかった。238出力はbytes一致、残り12出力は改行（生成HTMLのCR重複を含む）とギャラリーの入力hash記録だけの差であることを各入力まで照合。native等のresourceはそれぞれの発行元と照合する。比較helperの初期停止はこの差の診断として保持し、製品ソースを変更していない。
- main上でも標準**129ファイル1093/1093件（fail/cancel/skip 0）**を追加実行して成功し、再ビルド後も発行物と全出力が一致した。通常発行の固定EXEで実MCP **47群**・リボンの画像/40種アイコン/復元/モード別 **10群**・個別ラベル **4群**、計**61群**と隔離smokeが成功。先行するworktree版の74群と区別して、今回の最終EXE/copyのhashを記録した。
- mainの**782入力**と参照Applet manifestは発行前後・追加標準後・最終固定検証後で一致。ツール/SDKは前項と同一。専用Taskは登録/Task XMLとも不在、専用プロセス0、削除0件。現在/再利用の証跡・固定コピー・診断を保持した。物理入力・実UAC承認・実Windowsサインインや、実利用設定の変更は検証対象外のまま。
- 後続追記は本記録だけで、製品の変更・版更新・再発行は不要。記録commit後もmainと既存worktreeを同じ先端へそろえて保持する。通常発行ログ/782入力/hashはprimaryの`.artifacts/mcp-settings-main-merge-20261027/`、固定GUI/比較/後片付けとstage/commit照合はworktreeの同名証跡フォルダーおよび`.artifacts/commit-validation-mcp-settings-main-merge-20261027/main-publication.json`・`final-state.json`を参照する。

## 2026-10-27: 最新mainとMCP設定worktreeの統合 0.96.2

- cleanな専用worktree `codex/mcp-settings-design` / `c5ba87f`とprimary mainを確認。mainの既存追跡先を`pull --ff-only`し、origin/mainと一致する`fa5ce41`（0.96.1）をworktreeへ統合した。追跡先の新設、別worktreeの変更、push/Release/実利用deployは行わない。
- 6ファイルの競合を解消。両方の検証履歴と、mainの40種アイコン・画像選択・個別iconOnly・既定復元・表示モード別アイコン/ラベル描画を保持し、MCP変更不可項目の南京錠と統合済みread/write許可を維持した。新しいネイティブのiconOnly/displayModeIcons欄も既存操作Schemaの設定IDへ接続し、アイコン表示フラグを増やさない。試験は現在のhost URL特定とポップアップ終了待ちを使用する。
- 統合調整による設定項目/保存ファイルの追加・削除や公開ツールの追加はなく、main 0.96.1から通常修正の**0.96.2**へ更新。発行前に両変更の維持、安定ID、秘密非公開、設定と実行の許可分離、既定復元/画像draft、実際の編集Schemaとの整合をレビューし、阻害指摘なし。
- 固定lockfile install、整形・型検査、本体/Default Shell build、標準**129ファイル1093/1093件（fail/cancel/skip 0）**に成功。既存の変更可否試験へ、現在のリボン操作SchemaがiconOnly/displayModeIconsを含むことを追加照合した。sourceの実MCP **45群**・リボン **6群**・グループ **7群**が成功。
- 発行した固定EXEで実MCP **47群**・リボン基本 **6群**・アイコン/復元/モード別 **10群**・個別ラベル **4群**・グループ **7群**、計**74群**と隔離smokeが成功。南京錠、ヒントOFF、許可取消の即時反映、暗号文bytes保持と固定tools/list、既存リボンの編集/再起動・一時パネル・モード切替を確認した。個別ラベルの再表示/位置ずれも既存の観測試験で確認した。
- worktreeの`publish.bat`終了0。`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`は**170712743 bytes / SHA256 `b7082b63b10b2776fbc747326f6235e9c230960dff08e251826b48c81ca350a2`**。File/ProductVersion、feedの版/size/hash、ASAR内package/Default Shell、ビルド出力**250ファイル**・追加resource **621ファイル**、固定試験コピーを照合した。
- **782入力**と参照Applet manifestは標準/source検証前後・発行後・固定検証後で一致。Node **24.22.1**、pnpm **12.10.1**、Electron **45.0.0**、.NET SDK **10.0.403**、Windows x64を維持し、後続変更は文書と無視対象の証跡だけ。専用Limited Taskは登録/Task XMLとも不在、専用GUIプロセス0、削除0件。現行/再利用証跡と初期診断は保持し、Pause/F13〜F24のOS送信/登録、実UAC承認、Windowsサインイン、物理入力・実利用設定の変更は行っていない。
- 整形検査の初回は取り込んだファイルのCRLFと既存Markdown表の書式で停止。製品の改行を保持して検査し、文書3件だけを整形した。発行後の製品変更はない。証跡はworktreeの`.artifacts/mcp-settings-main-merge-20261027/`、stage/統合commit/main反映の照合は`.artifacts/commit-validation-mcp-settings-main-merge-20261027/`へ記録。通常mainからの同じソースの発行は、primary側の同名証跡フォルダーと後続の検証記録へまとめる。

## 2026-10-27: リボン設定と表示 0.96.1のコミット検証

- 0.94.7〜0.96.1の個別iconOnly/SettingsField、通常・Applet・表示モードの画像/40種アイコン、既定復元、モード別設定、個別ラベルのちらつき修正をまとめて確認。対象31ファイルを分離し、設定・操作ID・提供元の名前/画像・通常ラベルの幅同期/位置対策を保持していることをレビューし、阻害指摘なし。
- ソース/試験/依存/ツール/native fixtureの **935入力**を照合。標準 **120ファイル946件**のうち、現行リボン関連114件と依存閉包が不変の14ファイル61件、計 **175件**の成功を再利用し、影響がある/動的なソース参照を含む残り91ファイル **771件**を追加して成功した。最終結果のfail/skip/cancelは0。型検査/build/publishの完全ログ、out全237ファイル・native input全403ファイルも照合し、製品変更・版更新・再発行は行っていない。
- 固定EXEの個別表示/アイコン/復元 **14群**とsmokeを再利用し、グループ **7群**・カスタマイズ全体 **6群**を追加、計 **27群**成功。Node/.NETのバッジ、グループの位置/スクロール/終了、実際の本体サイズ変更、ボタン追加/編集/コマンド実行、右クリック割り当て、実再起動とページ初期化を確認した。16回のラベル/アイコン位置追跡も入力・ログ・EXEを照合して再利用した。
- 追加GUIの初回は、旧試験が本体ではなく一覧先頭の一時パネルをサイズ変更したため停止。本体URLによる選択と実際の幅増加を検査するよう修正し、実測の1pxのサイズ丸めを許容した。全体モードにも旧セクション/背景/overlay参照と「個別iconOnlyなし」の期待が残っていたため、現行UIのセクション・スイッチ・一時パネルへ追従し、該当コマンド全体を再実行して成功した。変更はGUI試験だけで、既存のlabels-only/icons-only分岐と製品は不変。停止した試験の部分成功は最終成功へ流用していない。
- 利用者が動作確認した発行済み **0.96.1 / SHA256 `08d505e1d687119a30043e7e00d6064038b84e9641bb54cc7ac525b5543f529b`**を保持。証跡は`.artifacts/commit-validation-ribbon-0961-20261027/`のplan/before/after/validation・再利用元の入力/完全ログ・追加ログ・stage/commit/remote記録。参照資料・直近成功・診断を保持し、削除0件。依頼に従いGitHubのみへ通常pushする。GitHub Release/実利用先deployは対象外。

## 2026-10-27: 折りたたみ時の個別非表示ラベルのちらつき 0.96.1

- 未コミット0.96.0変更を保持して追加修正。折りたたみモデルの到着でDefault Shellが全項目のラベルを再生成し、実際の幅が狭くなるまで個別iconOnlyの文字も一時表示される原因を確認。修正前のソースで広い領域を保った8回の実切り替えを行い、通常/コマンド/グループ/子/表示モードの5種類で再表示を検出して再現した（期待した試験終了コード1）。再現ログは`.artifacts/ribbon-label-flash-0961-20261027/gui-before.log`。
- Schema 2の表示投影へ任意のhideLabelを追加し、個別iconOnly/空グループ名による常時非表示と、全体モードによる実効iconOnlyを区別。共通RibbonIconで常時非表示のラベルを描画せず、通常のラベルはDOMに保持して従来の領域幅のcontainer queryで切り替える。通常/持続的グループ/一時パネルの親子へ共用した。従来のiconOnlyとschema 1、タイトル/アクセシブル名/操作IDを保持する。保存設定/ファイルの追加なし、通常修正として0.96.1へ更新。
- 既存の位置ずれ対策は維持。レイアウトCSSと設定schemaの入力hashが0.96.0と一致することを照合。最初の位置試験は、検証用に広げた領域自体が6px移動する状態でviewport絶対座標を比較して停止したため、リボン内の相対位置と通常幅でのリボン全体の原点を別々に追跡する試験へ修正。製品の位置/幅/タイミングやCSSは変更していない。
- 発行前レビューに阻害指摘なし。固定lockfile install・型検査・build/publish、関連Node **114/114件**（fail/skip/cancel 0）成功。ソースGUI **4群**、固定EXEのラベルGUI **4群**＋アイコン/復元GUI **10群**＝**14群**、隔離smoke成功。広い領域を保つ8回と通常幅の8回の計16回をMutationObserver/rAFで追跡し、個別非表示文字の再表示0・アイコン相対位置のずれ0、通常幅ではリボン原点のずれ0を確認。通常ラベルを保持する処理、個別指定解除、グループ親子、モード別画像/アイコン、既定復元、実再起動後の保持も確認した。実利用セッションの物理フレーム録画ではなく、隔離profileと制御した幅遅延での検証である。
- **0.96.1 / 170,685,740 bytes / SHA256 `08d505e1d687119a30043e7e00d6064038b84e9641bb54cc7ac525b5543f529b`**。EXE/File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、GUI/smokeコピーと最終EXE、801入力の最終hash一致。証跡は`.artifacts/ribbon-label-flash-0961-20261027/`のreview/validation/bundle/environment/preserved-layout/cleanup・入力hash・完全ログ、ソース/固定GUIのtransition-trace.jsonと結果/画像。
- 検証プロセス0件。実行方式ごとの直近3回と、古い最終検証の参照資料・今回の再現/測定診断を保持し削除0件。実利用設定の変更・物理入力は未実行。ローカル発行まで完了、未コミット、push/GitHub Release/実利用先deployなし。

## 2026-10-26: アイコンの既定値復元とモード別設定 0.96.0

- 直前の未コミット0.95.0変更を保持して追加実装。通常項目・コマンドボタン・グループの編集左下に「アイコンを既定値に戻す」を追加。共通SettingsDialogの任意resetActionとして配置し、受付準備前/保存中は無効化する。復元は画像と固定アイコンの一時入力だけを更新し、適用で保存、取消で破棄する。名前・アイコンのみ表示・配置・コマンド・グループ色/展開方法は保持し、原画像は削除しない。通常項目は本体/登録元、グループはfolder、コマンドはextensionsへ戻す。
- 表示モード切替に「折りたたみ時」「展開時」の共通アイコン選択欄を追加。それぞれ画像/既定アイコンを独立して選べる。任意の`itemOverrides['ribbon-display-mode'].displayModeIcons`を追加したため0.96.0へ更新。未指定のモードは従来の共通icon/imageを引き継ぎ、モード別オブジェクトはその一組を上書きする。復元ではモード別指定と共通指定を両方解除し、標準の右/左矢印へ戻す。現在のPC専用表示モードや保存ファイルは変更していない。
- 公開updateItemの入力/保存検証/描画投影を整合。compact/expanded以外のキー、無効なアイコン/画像参照、他項目へのモード設定を拒否し、dry-run・原子的保存・null復元を確認。非表示側の画像も既存の再帰参照検査で削除保護されることを追加回帰で確認した。共通リセットの使い方と互換の解決規則を設計文書へ反映。
- 発行前レビューで要件、復元範囲、旧値互換、設定/API、画像保持、共通フッターの準備/保存制御、必要試験を確認し、阻害指摘なし。固定lockfile install・型検査・build/publish成功。関連Node **114/114件**（fail/skip/cancel 0）、ソースGUI **10群**、固定EXEのアイコン/復元GUI **10群**＋個別表示GUI **3群**＝**13群**、隔離smoke成功。復元の適用/取消、他項目保持、Appletの既定画像、左右の操作配置、モードごとの画像/固定アイコンを入れ替えた保存、切り替え、実再起動後の保持、両状態の既定矢印復帰、隠れている画像draftの破棄と元画像hash保持を確認した。モード別ダイアログ画像も確認した。
- **0.96.0 / 170,687,505 bytes / SHA256 `bc3a8433c0623fc5a0e3e7d60fb324e6243eeae390130677216c1fc406b69f54`**。EXE/File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、GUI/smoke用コピーと最終EXE、801入力の最終hash一致。証跡は`.artifacts/ribbon-mode-icons-0960-20261026/`のreview/validation/bundle/environment/cleanup・入力hash・完全ログ、固定GUI結果JSONと画像。
- 検証プロセス0件。source icons-onlyの終了/成功確認済み最新3回を残し、それより古い未再利用の`.artifacts/ribbon-customization-ui-1793024137563` **1件**だけを、絶対パス・プロセス参照なし・再解析ポイントなし確認後に削除。最終成功分・失敗診断・再利用資料・他の実行方式を保持した。物理入力・実利用設定の変更は未実行。ローカル発行まで完了、未コミット、push/GitHub Release/実利用先deployなし。

## 2026-10-26: リボン全項目のアイコン選択と共通カタログ 0.95.0

- 直前の未コミット0.94.8変更を保持して追加実装。通常項目（表示モード切替・Appletページ・宣言型Appletボタンを含む）を共通RibbonIconPickerへ接続し、項目名を「ボタンのアイコン」に統一。グループ/コマンドと同じ「画像」「既定のアイコン」を選べるようにした。任意の`itemOverrides[id].icon`（共通名/null）を追加したため0.95.0へ更新。ID・名前・保存画像・提供元の設定・操作IDを保持する。
- 共通アイコンを8種から40種へ拡大。既存SVG基盤へカレンダー/星/ハート/ファイル/音楽などを追加し、共有カタログ・翻訳・manifest/設定検証・公開リボン編集スキーマを整合。候補を1行に固定して候補領域だけ横スクロールさせ、キーボードフォーカスを表示範囲へ移す。共通スクロールバーを使用し、独自の幅/色は追加していない。画像/既定アイコンは共通80pxの内容領域を使い、切り替えでダイアログ高を変えない。
- 明示した固定アイコンは登録元の画像/inline iconやモード/テーマの動的アイコンより優先し、利用者の明示画像は固定アイコンより優先する。nullは元の解決規則へ戻す。Appletの既定画像を編集画面へ表示するため、リボン補助モデルへ宣言から参照する登録画像定義だけを渡す。既定画像を変更せず適用した場合は画像overrideを生成しない。選択元の切替で画像とアイコンを同時更新する親stateを関数形式へ揃え、非表示側の一時選択を保持する。
- 発行前レビューで設定/API互換、画像優先順位、無効値の原子的拒否、dry-run、null復元、画像定義の投影範囲、操作ID、共有部品、明暗/狭幅/高さ/スクロールを確認。GUIで補助モデルの画像定義不足を検出して修正・再検証し、阻害指摘なし。初回の新規単体試験は画像fixtureの不正base64、既存GUIは旧ギャラリー/追加ボタンの参照、新規Applet fixtureは最低ホスト版の不足でも停止したため修正し、部分成功を最終証跡へ流用していない。
- 固定lockfile install・型検査・build/publish成功。関連Node **103/103件**（fail/skip/cancel 0）成功。ソースGUI **7群**、発行した固定EXEのアイコンGUI **7群**＋個別表示GUI **3群**＝**10群**、隔離smoke成功。3種の通常項目・グループ・コマンド、画像選択/取消/適用・保持/復元、元画像のhash、ライト/ダークと1120/760pxでの1行横スクロール/同じ高さ、実再起動後の選択保持を確認。ソース画像と固定版の操作結果・同梱内容を照合した。
- **0.95.0 / 170,682,806 bytes / SHA256 `bdd5c9eb27dda977a72a68a7f646e7e21ab0a7e94ca43699730c89e8c24bbb21`**。EXE/File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、GUI/smoke用コピーと最終EXE、800入力の最終hash一致。証跡は`.artifacts/ribbon-icons-0950-20261026/`のreview/validation/bundle/environment・完全ログと入力hash、各GUIの結果JSON/画像。
- 検証プロセス0件。今回のアイコン/個別表示GUIは実行方式ごとの直近3回以内。失敗診断・既存の再利用資料を保持して削除0件。物理入力・実利用Appletの設定書き換え・実利用先deployは未実行。ローカル発行まで完了、未コミット、push/GitHub Releaseなし。

## 2026-10-26: アイコンのみ表示のSettingsField化 0.94.8

- 通常ボタン・コマンドボタン・グループの「リボンにアイコンのみを表示する」を、共通SettingsFieldとToggleへ統一。ラベル・入力列・区切り・余白を共通部品へ任せ、3種類の編集ダイアログを揃えた。保存値・適用/取消・全体モード/個別表示の処理は変更なし。既存の未コミット0.94.7変更を保持し、追加修正の発行として0.94.8へ更新。
- 発行前レビューに阻害指摘なし。固定lockfile install・型検査・publish成功。0.94.7の800入力と比較し、差分がpackage版・設定UI・GUI helperの3ファイルだけであることを確認。関連Node60件はruntime/model/storage/依存/試験入力が不変のため成功を再利用した。固定EXEのGUI **3群**と隔離smokeを新規実行して成功。data-testidから共通スイッチを操作し、3種類のON/OFF・適用/取消・グループ親子・名前・再起動保持を確認。3ダイアログの画像を確認し、共通Field内でのラベル/スイッチ表示を確認した。
- **0.94.8 / 170,683,932 bytes / SHA256 `5010efac92cee05e3cf6b7aaf37c879d8bca7f79ee6105c54811609dbe0d3b97`**。EXE/File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、固定GUI/smokeコピーと最終EXE、800入力の最終hash一致を確認。証跡は`.artifacts/ribbon-field-0948-20261026/`のreview/reuse/validation/bundle/environment・完全ログ、固定GUIのresult.jsonと3ダイアログ画像。
- 検証プロセス0件。今回の固定GUIは同種成功の2回目で直近3回以内、過去の診断・再利用資料を保持し削除0件。未コミット、push/GitHub Release/実利用先deployなし。

## 2026-10-26: リボン項目ごとのアイコンのみ表示を復元 0.94.7

- cleanなmainで`git pull --ff-only`による最新取得を確認して着手。通常ボタン（表示モード切替を含む）・コマンドボタン・グループの編集ダイアログへ、共通SettingsChoiceで「リボンにアイコンのみを表示する」を復元。既存のiconOnlyフィールド・翻訳・保存APIを使い、設定項目/保存ファイル/公開APIの追加なし。通常修正として0.94.7へ更新した。
- compactでは全項目の名前を省き、expandedでは個別のiconOnlyを反映する。持続的グループと一時パネルの親・子も同じ規則を適用する。表示モード切替の名前は設定カタログ/別名の解決結果を両モードで共用し、操作名はtooltipへ残す。アクセシブル名・画像・配置・実行経路・PC専用モード保存を保持した。
- 発行前レビューで適用/取消/競合検査、保存互換、全体モードと個別指定、グループ親子、アクセシビリティ、作用範囲を確認し、阻害指摘なし。版更新後の初回型検査は依存構造照合で停止したため、固定lockfileのinstallでメタデータを同期。依存版/lockfileを変えずに型検査・build・関連Node **60/60件**（fail/skip/cancel 0）成功。
- 初回2回のGUIは旧overlay URLを探す試験側の参照で停止。現行の統合グループ画面を取得するよう試験を修正し、ソースと固定EXEのGUI **各3群**を完全に再実行して成功した。各種のON/OFF、取消/適用、既定名/別名、tooltip/読み上げ名、グループ親子、compact/expanded切替、実再起動後の設定保持を確認。既存GUIの「個別設定なし」という期待値も復元後のUIに追従した。
- `publish.bat`成功。固定EXEの隔離smoke・EXE/File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、GUI/smoke用コピーと最終EXEを照合。**0.94.7 / 170,677,225 bytes / SHA256 `1eaa552c62f0994919ec7d2b71bc335ed9d08bc7096b90cad4c7e1d757d75eea`**。800入力の最終hash一致、検証プロセス0件。証跡は`.artifacts/ribbon-labels-0947-20261026/`のreview/validation/bundle/environment・入力hash・完全ログ、固定GUI結果と画像。
- 今回のGUI成功はソース/固定EXE各1回で直近3回以内。失敗診断2件、既存の再利用資料・成功不明のfixtureを保持し、削除0件。無関係な全回帰・物理入力は未実行。ローカル発行まで完了、未コミット。push/GitHub Release/実利用先deployなし。

## 2026-10-27: MCP変更不可設定の南京錠自動表示 0.94.7

- main `8ae24f2`を統合した`86382ee`から専用worktree/branchで実装。設定追加、保存ファイル追加、公開MCPツールや操作許可の追加はなく、0.94.6から**0.94.7**へパッチ更新した。primary checkoutの作業、追跡先、push/Release/実利用deployは変更しない。
- 本体設定rendererへ、既存ownerの公開フィールド・available/writable・一覧の操作/列/行制限から生成する変更可否だけを渡す。通常設定・Applet共通・Shell領域は宣言と安定した設定IDへ接続し、項目別のアイコンフラグを保存しない。従来の入力・トレイ・リボン等は既存操作Schemaを参照する。値/既定値/秘密/Task XMLやUI専用情報を公開MCPのSchemaへ追加しない。
- MCPから変更できない項目だけに共通の南京錠と理由を表示。MCP停止、read/write許可、準備状態の変化に追従し、設定用コマンドにexecute許可を追加要求しない。秘密/非公開/未対応/読取り専用・認証に結び付いた行の保護を共有し、編集可能列を持つ一覧全体は秘密列の存在だけで施錠しない。画面の直接編集は従来どおり行える。ヒントOFFでも共通ポップオーバーをキーボードで確認でき、画像選択内の検索等の一時入力は対象外とする。
- 発行前に公開判定の単一性、秘密値の非転送、即時保存/一覧/入力の互換、設定追加時の追従、権限と無効/準備状態、共通部品とポータルをレビューした。read/writeだけで実touchpad設定APIのdryRunが成功し、write取消時に拒否される試験を追加。操作許可表とApplet一覧の有効スイッチにもownerのIDを接続し、レイアウト用見出しと保存項目を区別した。阻害指摘なし。
- 固定lockfileのinstall、型検査、本体/Default Shell build、標準**129ファイル1088/1088件（fail/cancel/skip 0）**が成功。新規9件は通常/動的宣言、非公開と秘密、owner/行/列の能力と秘密を含まない投影、既存Schema、権限/停止状態、設定コマンドの実認可を確認する。最終調整後も全1088件を再実行した。.NETページ試験の初期失敗はframework-dependentホストDLLの不足だったため、既存プロジェクトをRelease buildし、試験/製品を弱めずに標準全体を成功させた。
- sourceの実MCP **45群**、タイトル/レイアウト **8群**、リボン **6群**、トレイ **5群**が成功。固定EXEでは実MCP **47群**、タイトル/レイアウト **8群**、リボン **6群**、トレイ **4群**、入力編集ダイアログ **8群**、共通並べ替え **5群**（計**78群**）とsmokeが成功。明暗/700〜1280幅、ヒントOFF、説明のfocus/Escape、画面からの編集と再起動保持、権限切替による即時反映、暗号化済み3ファイルのbytes保持、固定tools/list不変を確認した。古い試験の見出し/トリガー操作とWindow配列順への依存を現在のページID/host URLへ更新した。初期失敗と診断ログは保持する。
- `publish.bat`終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170712527 bytes / SHA256 `bc0b56974adcfc4109d7d45ec466de61ce011276717c327923bec744aaeab6aa`**。File/ProductVersion、feedの版/size/hash、ASAR内package/Default Shell、全ビルド出力**250ファイル**と追加resource **621ファイル**、固定コピーのhashが一致した。照合helperの初回はWindows上のASARパス区切りが誤っていたため、製品を変更せずnativeパスへ修正して成功した。既存deploy.local.txtの不在も保持する。
- 最終**780入力**と参照Applet manifestは、最終調整後の標準/source検証前後・発行後・固定EXE検証後で一致。Node **24.22.1**、pnpm **12.10.1**、Electron **45.0.0**、.NET SDK **10.0.403**、Windows 11 x64を確認。後続変更は本記録と無視対象の証跡だけで、製品再変更/再発行はない。
- 固定MCP試験の専用Limited Taskは登録もXMLも残らず、専用GUIプロセス0を確認した。参照中の成功・固定コピー・初期診断・過去機能の証跡を保持し、削除0件。Pause/F13〜F24のOS送信/登録、実UAC承認、Windowsサインイン、物理入力・touchpadの実設定書込みは行っていない。確認用隔離profile以外の設定/認証は変更しない。
- 正本は[設定API](docs/settings-api.md#設定画面の南京錠)と[設定基盤](docs/settings-foundation.md)。コマンド/完全ログ/入力・出力hash・profile・レビュー・環境・後片付けは`.artifacts/mcp-settings-locks-20261026/`、最終stage/commit照合は`.artifacts/commit-validation-mcp-settings-locks-20261026/`へ記録。main統合と、owner投影/UI/試験を一体にした機能変更の2コミットに分ける。

## 2026-10-26: main 8ae24f2のMCP設定worktree統合

- cleanな`codex/mcp-settings-design` / `6b15760`からorigin/mainをfetchし、ローカルmainと一致する`8ae24f2`（0.94.6）を統合。5ファイルの競合は両検証履歴、mainの5列トリガー/並べ替えUIと役割の説明、worktreeの統合済み設定変更許可・共通宣言を残して解消した。primary checkout、追跡先、push/Release/deployは変更しない。
- 固定lockfileで依存記録を同期し、型検査・本体/Default Shell build、関連84ファイル866件、sourceの共通並べ替え・トリガー・MCP設定のGUIに成功。MCP gateway内の旧「上へ」ボタン操作をmainの既存handle/ArrowUpへ変更し、ページラッパーのlocator経由で再検証した。初期2回のGUI失敗は古い試験操作で、最終成功とは区別して保持する。
- 証跡は`.artifacts/mcp-settings-locks-20261026/`の`merge-*.log`/`*-result.json`、`merge-before.json`/`merge-after.json`。検証後に製品コードは変更せず、試験操作1ファイルと本記録の差分を照合した。統合元の保存形式・固定MCPツールを保持する。今回の確認用発行は、続く南京錠表示の実装後に版更新して行う。

## 2026-10-26: 起動設定のMCP接続と非同期保存 0.94.4

- main `8b271af`の統合commit `6d681fa`から同じ専用worktree/branchで継続した。既存のstartAtLogon/runAsAdministrator・PC専用保存ファイル・固定6入口を維持し、新しい保存項目/ファイルや破壊的な契約変更はないため、発行済み0.94.3から**0.94.4**へパッチ更新した。primary main、追跡先、push/Release/deployは変更しない。
- 共通設定APIは非同期ownerの完了まで応答を待ち、待機中/完了後のrequestIdを区別する。保存直前のpreflightで元callerの最新許可・主体・対象/Schema・値revisionを再確認し、準備したOS変更の巻戻しは所有サービスへ委譲する。旧主体の遅い成功/失敗が新主体の同名requestIdキャッシュを汚さないよう、要求recordだけを更新する。従来の同期owner・読取り・dryRunは同期応答と既存512件上限を維持し、非同期失敗もAppDockApiの安全なcode/messageへ変換する。
- `category=launch`のfields対象へ起動登録/管理者起動を公開し、read + writeで変更する。候補EXE・引数・スクリプト・Task XML・管理者再起動/復旧の実行を公開しない。メタデータとdryRunは所有する能力キャッシュを使い、PowerShellを起動しない。開発版/復旧待ちの書込みを拒否し、標準ユーザーの制限も既存所有検証へ渡す。
- 実保存はWindowsLaunchの同一ユーザー/元EXE/引数/InteractiveToken検査、復旧journal、登録照合とPC専用設定保存を待ってからsettingsSavedを返す。値と上書き状態が同じsetでOS再同期せず、reset/既定値setは現在PCの上書きを除去する。runAsAdministratorは次回起動/ログオンTaskへ適用し、現在のトークンを変更しない。effectVerified=falseとUAC手動承認・取消・復元不能時のローカル復旧を維持する。
- 発行前に同期互換・認可/主体/Schema/競合・キャッシュ・PC保存/OS巻戻し・秘密非公開・UI互換と必要回帰をレビュー。既存応答用の権限スナップショットを保持して再認可だけを新しく取得し、標準ユーザーでも持込み済みの管理者希望値を解除できるようにした。journal書込み失敗もOS変更前に既存の設定エラーepisodeへ接続する。阻害指摘なし。
- 固定依存install、整形、型検査、本体/Default Shell buildが成功。関連標準は**84ファイル866/866件、fail/cancel/skip 0**。一次回帰865件のうちownerの12件を、Highest/logonの一括正常保存を追加した13件で置き換えて集計し、他の成功結果を再利用した。差分は当該unitファイルだけで、製品/GUI/依存は不変。新規回帰は非同期基盤8件と起動owner13件で、待機/再送/主体切替/応答上限、取消/登録失敗/保存失敗/復元不能、全般/PC保存、既定値falseの上書き解除、競合・許可取消時の実owner巻戻しを検証した。標準全体は未実行。
- sourceの実MCP **41群**・既存MCP設定UI **10群**、固定EXEの実MCP **43群**・既存起動設定UI **5群**・MCP設定UI **10群**・smokeが成功。固定MCPはLimited Taskの実登録/照合、同じ要求の再送、ネイティブtoggleとの連動、古い要求拒否、resetによる解除、共有/暗号文bytesと固定tools/listの保持を確認した。既存起動UIは日本語/空白/引用符のある元EXE、Task Schedulerの明示Run/LastTaskResult=0、設定の即時保存と再起動保持、明暗3幅、通常トークンのまま管理者希望値を切り替える動作を確認した。
- 最終照合で実環境の.NET SDK **10.0.403**を確認したため、先行するnative成功の再利用を取りやめ、条件/選択のnative fixture **46件**を再実行した。.NET通知fixtureを現SDKでRelease buildし、同じ固定EXEのNode/.NET接続・所有アクション・入力失敗/保存/通知ポリシー反映・再起動を **8群**追加確認。製品ソースとEXEの再変更はない。Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、Windows x64を維持した。
- `publish.bat`終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170705415 bytes / SHA256 `18f1531d01e7792c45e1eca46983f0597cb5a405d8fb2916d74739d58817e4a7`**。File/ProductVersion、feed版/size/hash、ASAR内package/Default Shellとすべての固定コピーを照合した。最終774入力と参照Applet manifestはレビュー後・発行後・固定/追加native検証後で一致し、後続追記は文書/証跡のみ。
- テスト用の2つのEXE/profileに対応するTaskを最後に個別読取りし、登録だけでなくXMLも存在しないことを確認した。専用プロセス0、今回の各script/方式の成功は3回以内、削除0件。過去の参照profile/固定コピー・初期の型/監査パス等の診断・ビルド出力を保持する。実UAC承認/Highest実行、実Windowsサインインは未確認。模擬UACでは承認経路/取消を検証し、実プロンプトの自動承認、Pause/F13～F24のOS送信/登録、実利用の設定/認証の変更は行っていない。
- 正本は[設定API](docs/settings-api.md#windows起動設定)、[起動設定](docs/launch-settings.md)、[設計](docs/mcp-settings-design.md)。証跡は`.artifacts/mcp-settings-launch-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-launch-20261026/`。source-profiles.json/fixed-profiles.json、task-audit.json、smoke-profile.jsonへ結果/hashを記録する。main統合、非同期保存基盤、起動設定adapterを独立したコミットへ分ける。

## 2026-10-26: main 8b271afのMCP設定worktree統合 0.94.3

- cleanな`codex/mcp-settings-design` / `15f623c`でorigin/mainをfetchし、ローカルmainと一致する`8b271af`（0.94.2）を統合した。追跡先の新設、primary mainの変更、push/Release/deployは行わない。入力ごとの実行方法/除外設定と通知のセッション寿命/画面/Windows起動経路を取り込み、専用worktreeの確認版を**0.94.3**へ更新した。設定/保存形式の変更はmain側の既存版更新を保持する。
- 8ファイルの競合は、両方の検証履歴、mainの入力別inputExecutionModes/excludedProcessesと現在の条件、宣言から生成する共通ブラウザ設定、MCPの統合済みread/write許可と非公開保護を残して解消した。共通ブラウザのUI/カタログへ手書きの重複一覧を戻さず、トリガー固有の除外欄は別に保持する。通知の現在の寿命と画面・起動経路はmainの実装を使用する。
- 差分・所有サービス・公開/許可・保存分類・入力/通知への影響を発行前にレビューし、阻害指摘なし。固定依存install、整形、型検査、本体/Default Shell・nativeホスト・Node/.NET fixtureのbuildが成功。関連標準**81ファイル831/831件（fail/cancel/skip 0）**と、共通条件/選択のnative fixture **46件**が成功した。標準全体は未実行。
- 隔離source/固定EXEで実MCP **各40群**、統合トリガー **各18群**、入力別/共通設定 **各9群**、通知センター **source 8群/固定7群**、固定EXE smokeが成功した（廃止Shell割当の1群は既存試験どおりsourceのみ）。MCPの暗号文/権限/固定ツール、入力別first/all/継承と除外・保存順、通知の起動中寿命/バッジ/所有アクション/旧履歴保持/再起動後破棄を確認した。物理入力・実Windows通知クリックやサインイン・実利用の設定/認証は変更していない。
- native試験の初回はfixture JSON引数が不足し、引数を補って46件成功。入力GUIはmainで変更された追加tooltipの古い期待値を現在の文言へ修正し、対象GUIを再実行した。初回770入力との差はこのGUI helperだけで、参照しない標準/MCPの成功は保持。以後の770入力と参照Applet manifestはsource後・publish後・固定検証後で一致した。失敗/整形/証跡形式の診断を保持する。
- `publish.bat`終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170709951 bytes / SHA256 `e3188ca3440d8917b5021bafb0de6054382216d4d9b613b15092f43a167b22ab`**。feedの版/size/hash、ASAR内package/同梱Default Shell、固定試験コピーのhashを照合した。Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.402、Windows x64の固定環境を維持した。
- 証跡は`.artifacts/mcp-settings-main-launch-20261026/`、入力/結果/ログ・stage/commit照合は`.artifacts/commit-validation-mcp-settings-main-launch-20261026/`。今回の成功は各方式3回以内で、失敗/参照済みprofile・固定コピー・ビルド出力は保持、削除0件。専用テストプロセス0を確認した。起動設定APIはこの統合の次の実装単位とする。

## 2026-10-26: トリガー・並べ替えUI 0.94.6のコミット検証

- 0.94.4〜0.94.6の説明・5列構成・無効マーク・円形歯車・共通の↑↓並べ替え・MITメタデータをまとめて確認。933入力、既存の完全ログ、固定EXEと試験コピーを照合し、標準120ファイル **941件**のうち **931件**の成功を再利用。変更されたCSSとrendererを読むappearance **7件**・Shell境界 **3件**を追加して成功した。runtime/保存/API・依存/SDK・fixtureは同一で、locale差分は設定UIの文言だけ。直前の型検査/build/publish成功を再利用し、製品変更・版更新・再発行は行っていない。
- 固定0.94.6で未実施だった統合トリガー一覧 **19群**を追加し、既存の共通並べ替え5群・宣言型一覧5群・トリガー設定8群と合わせ **37群**、隔離smokeの成功を確認。前後の933入力は一致し、変更範囲に阻害指摘なし。発行EXEのSHA256は`96ef3e2cbdbbcf564413c5dbb8a1a6f921b356a29a7350b823b08560a15e8afd`のまま。
- 証跡は`.artifacts/commit-validation-trigger-ui-0946-20261026/`のvalidation・入力hash・追加試験ログ・stage/commit/remote記録。依頼どおりプッシュ先は **GitHubのみ**とし、originのfetch/push URLとmain先端を確認して通常pushする。過去の両リモート運用は今回へ適用しない。既存/今回の参照証跡・直近成功・他作業の状態不明分を保持し、削除0件。Release/実利用deployは対象外。

## 2026-10-26: 共通の表示順ダイアログをハンドルと↑↓キーへ統一 0.94.6

- 既存の0.94.4〜0.94.5変更を保持し、`SettingsOrderDialog`の上下ボタンを削除。Applet管理・AI・MCPクライアントで、ハンドルにフォーカス中の修飾なし↑↓キーによる並べ替えへ統一した。同じ共通部品を使う画像ライブラリー・宣言型一覧にも適用される。ドラッグ・OK/キャンセル・保存時の競合検査を維持し、文言と既存GUIの操作手順を更新した。
- 安定IDで移動したハンドルを追跡してフォーカスとスクロールを保持する。修飾キー・IME変換中・保存中・範囲外の移動を抑止。発行前レビューでスクロール下端のフォーカス枠の欠けを見つけ、共通ハンドルに4pxのスクロール余白を追加して再確認した。保存項目・runtimeは変更せず、通常修正として0.94.6へ更新。MIT設定を維持。
- frozen install・型検査・build・publish成功。関連Node **18/18件（fail/cancel/skip 0）**。ソースGUIは共通並べ替え **5群**・宣言型一覧 **5群**に成功。初回の試験データがAI登録上限を超えていたため長い一覧をMCP側へ移し、Appletの非表示Default Shell保存枠を考慮して表示対象の期待値を修正した。製品の上限・保存仕様は変更していない。
- 固定EXEでは共通並べ替え **5群**・宣言型一覧 **5群**・既存トリガー設定 **8群**、隔離smokeに成功。3画面の連続↑↓、フォーカス、両端、修飾キー/IME、ドラッグ、取消・適用・再編集・実再起動、AI既定接続の保持を確認。18件のMCP一覧を480×540pxで14回移動し、ハンドルとフォーカス枠が表示内に収まることを確認した。ライト/ダークの固定版画像も確認。宣言型一覧は外部更新との競合を拒否し、ローカル順序と取消操作を保った。
- **0.94.6 / 170,698,203 bytes / SHA256 `96ef3e2cbdbbcf564413c5dbb8a1a6f921b356a29a7350b823b08560a15e8afd`**。EXE/File/ProductVersion・feed・Default Shell・MIT設定、out全237ファイル・native input全403ファイル、全試験コピーと最終EXEを照合。697入力が最終状態と一致。証跡は`.artifacts/shared-order-0946-20261026/`のreview/validation/bundle/environment、入力hash・完全ログ・固定GUI画像。
- 型検査/Node成功後の変更は試験fixtureとスクロールCSSだけで、対応入力を照合して成功を再利用。最終CSSはbuild・ソース/固定GUIで再確認。物理入力・OSへのPause/F13〜F24送信/登録・Windows接続書き換え・無関係な全回帰は未実行。検証プロセス0件。直近成功分・診断/参照証跡・他作業の状態不明分を保持し、削除0件。未コミット、push/Release/deployなし。

## 2026-10-26: 割り当ての無効マークとMITメタデータ 0.94.5

- 直前の0.94.4変更を保持して追加修正。コマンドトリガーの「無効」をトリガー列から「いつ・どこで」の条件前へ移動し、共通配色による枠・背景・太字のマークとして表示する。個別割り当ての`enabled`だけを参照し、ジェスチャー機能全体の有効/無効やコマンド利用可否とは区別する。他の一覧形式の表示・保存・入力処理は維持した。
- `package.json`の`license`を依頼どおり`MIT`へ変更。`private`や依存版は変更していない。通常のUI/メタデータ修正として0.94.5へ更新し、同梱packageの版とMIT識別子も照合した。
- 発行前レビューで3方式、条件編集・操作列、テーマ配色、状態の読み上げ、保存/runtimeへの影響を確認し、阻害指摘なし。frozen install・型検査・build・publish成功。0.94.4の入力/完全ログと照合して影響のない関連Node **23件**の成功を再利用。初回GUIは表示倍率による枠幅0.666667pxと期待1pxの差で停止し、試験を正の実線幅の確認へ修正して再成功した。製品側の追加修正なし。
- ソース/固定EXEの統合GUI **各19群**と固定EXEの隔離smoke成功。キー・マウス・タッチパッドの無効化で条件欄だけにマークが表示され、再有効化で消えること、ライト/ダークの枠表示、5列操作・保存・実再起動を確認。固定版の画像も確認した。
- **0.94.5 / 170,680,000 bytes / SHA256 `9f39b9a696484d0350149ab476e7388d934c6cac0bcc422908b72853b0d6260d`**。EXE/File/ProductVersion・feed・Default Shell版・同梱MIT設定、out全237ファイル・native input全403ファイル、試験コピーと最終EXEを照合。696入力は最終確認時に一致。証跡は`.artifacts/disabled-binding-0945-20261026/`のreview/validation/bundle/environment、入力hash・完全ログ・固定GUI画像。再利用元は`.artifacts/trigger-ui-0944-20261026/`。
- 物理入力、OSへのPause/F13～F24送信/登録、Windows接続書き換え、無関係な全回帰は未実行。検証プロセス0件。直近成功分・診断/再利用証跡・他作業の状態不明分を保持し、削除0件。未コミット、push/Release/deployなし。

## 2026-10-26: トリガー設定の説明・並べ替え・5列構成 0.94.4

- クリーンなmainで`git pull --ff-only`し、`8b271af → 21e4979`を取り込んで着手。4設定ページとトリガー設定ダイアログの説明を役割に合わせて更新し、用語を`docs/command-triggers.md`へ整理。ダイアログの説明は編集中も保持し、変更件数と移動結果を共通状態欄へ表示する。
- トリガー設定の上下ボタンを廃止し、ドラッグまたはハンドルにフォーカス中の修飾なし↑↓で並べ替える。移動後の同一ハンドルへのフォーカスとスクロール追従、先頭/末尾、修飾キー/IME中の抑止を確認。3方式の取消・適用・再編集・実再起動、長い一覧で14回連続移動後の表示位置も成功。一般の表示順ダイアログの操作方式は変更していない。
- 見出し上余白を共通OrderDialogFrameのタイトル行へ移し、文字とヒントの中心を整列。共通ListIconの歯車を中心(12,12)・縦横同径の8枚歯1個へ更新した。統合一覧をコマンド/トリガー/歯車/いつ・どこで/鉛筆と削除の5列へ変更。操作列の見出しは文字なし・読み上げ名あり。固定幅、32px操作、歯車と条件の余白、ホバー/フォーカス、Tab順、未割り当て、狭幅の縦横スクロールを確認した。
- 発行前レビューで要件、共有部品と保存・実行処理への影響、必要試験を確認。初回統合GUIはpull済み文言と旧期待値の差で停止、期待値を現行文言へ更新。次に5列化による条件欄の幅不足を検出し、セル左右余白を12pxへ調整して再検証した。最終レビューに阻害指摘なし。frozen install・型検査・build成功、関連Node **23/23（fail/cancel/skip 0）**。ソースGUIは設定8群・統合一覧18群成功。
- 初回publishは終了コード0だったが、直後の照合で配布先のEXE/asar/feedが0.94.3になっていることを検出。EXE更新日時は当該publishログ完了後で、更新元は未確定。製品ソースは0.94.4のまま。同版の再発行直後に全内容を照合し、最終の固定EXEで設定 **8群**・統合一覧 **18群**・隔離smokeに成功した。失敗を最終成果物の成功証拠へ含めていない。
- **0.94.4 / 170,687,312 bytes / SHA256 `2ddb9df04d5bb805d211c829c8fcbc140ce22aa05c774e84bf62537747086137`**を発行。File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、固定試験コピーと最終EXEを照合。696入力の最終一致を確認し、初回入力からのCSS/GUI期待値3ファイルの調整と再検証を記録した。ライト/ダーク・1280/760/480pxの画像、ヒントの中心一致、継承/明示切替時の高さ保持も確認。
- 証跡は`.artifacts/trigger-ui-0944-20261026/`のreview/validation/bundle/environment、入力hash・完全ログ・版不一致の観測記録と固定GUI画像。無関係な全回帰、物理ジェスチャー、OSへのPause/F13～F24送信/登録、Windows接続書き換えは実施していない。検証プロセス0件。直近成功分・今回の診断/参照証跡・用途不明の他作業を保持し、削除0件。未コミット、push/Release/deployなし。

## 2026-10-26: 通知基盤0.94.2のコミット・両リモートpush検証

- 0.94.0〜0.94.2の通知履歴/activeバッジ、カードの均一細枠と共通×（バナー/desktop右上・センター左外）、Windows通知からの本体復帰と個別処理/センターへの振り分け、本体発行元のAppDock1項目化を対象にレビュー。通知の所有権・操作ロック・安全な要約を保持し、Desktopの最前面指定は利用者指定どおり変更しない。保存ファイル/既読・削除契約の廃止は0.94.0のマイナー更新、見た目/復帰/フィルターの追加修正は0.94.1/0.94.2のパッチ更新。
- 既存の .artifacts/notification-session-20261026・notification-ui-20261026・notification-source-20261026 の入力・完全ログ・生成物を照合し、型検査/build/publish、変更のない通知/読み上げ/警告/エラー/情報/リボンと最新版センター/Windows/画面遷移の単体 **140件**を再利用。未実施の標準101ファイル **801/801件**を追加し、合計 **120ファイル・941/941件（fail/skip/cancel 0）**。全.NET/Node fixtureもビルドし、最終回帰前後の全入力hash一致を確認。
- 追加回帰で廃止済みの履歴削除翻訳への期待値を発見し、外部タイトルを保持する現在の閉じる文言へテストだけ修正。失敗したコマンドの部分成功は使わず、未実施分全体を再実行。通知設定GUIは既存の一覧/編集ダイアログに追従し、表示見出しの重複と既定ページ描画待ちも訂正。製品コードの追加修正・版更新/再発行は不要。
- 現在の固定EXEで通知設定 **8群**（Node/.NETの設定/操作、期限/手動、所有権・世代、不正値非保存、検索、明暗、再起動後の設定保持/履歴破棄）、Desktop **5群**、Windows Shell起動 **8群**（2配置/profile・hidden/minimized復帰・個別処理1回・センター・古いURI/cold起動）、操作結果通知 **2群**を追加確認。現行EXEのセンター **7群**を再利用して固定EXE計 **30群**、同一表示ソースのバナー **8群**も再利用。物理Windows通知クリック・実メール受信・物理ロック・他の最前面Windowとの間欠症状は未確認。
- 発行物は **0.94.2 / 170,689,362 bytes / SHA256 8b32103922e0ab14c67c120757b2cdf9c7a15092ab01a164b84c3dbadf941985**。EXE/feed/Default Shellと839生成物を照合。過去版EXEのGUI成功を現行版の成功へ読み替えない。
- 証跡は .artifacts/commit-validation-notifications-0942-20261026/ のreuse-audit/validation、全入力hash・完全ログ・GUI結果・stage tree/commit tree/remote heads。今回の失敗/成功・元の再利用資料を保持し、削除0件。対象ファイルだけをstageし、作業ファイルとindex blob・commit treeを照合して通常pushする。GitHub Release/実利用deployは行わない。

## 2026-10-26: 通知履歴の起動中限定とアクティブ件数バッジ 0.94.0

- cleanなmainで`pull --ff-only`による最新確認後に実装。通知の未読/既読状態・件数・検索・個別/一括既読・履歴削除・選択欄を撤去。`NotificationHistoryStore`を削除し、履歴ファイルの読込/保存を終了。残存する旧ファイルへの変更・削除は行わない。終了/再起動でアクティブ通知と終了履歴を破棄する。
- 発行元のpersistent/session/none入力は受け付ける。persistentは起動中の安全な要約として扱い、終了時に表示用の詳細を要約へ置換する。終了済みは両方針合計で最新1,000件、終了時刻順に整理しアクティブは除外。固有操作・閉じる・解消/撤回・期限・ロック保留・操作ロックは維持した。
- リボンのnotificationsへNotificationServiceのactive件数を既存共通バッジで投影。0件非表示、1〜99件は数値、100以上は99+、説明には実件数。通知ID単位で数え、センターのみ/複数配送先/ロック保留を含む。開く/検索/同一ID更新では件数不変、終了時に減少。グループの親の点と両表示モードも既存契約へ接続。固定文言はhostTextへ統一。
- 発行前レビューで寿命・要約・上限・操作検証・保存/API・バッジ所有者検査と関連試験/文書を確認。旧履歴保存を前提にした試験/文書を修正し、阻害指摘なし。保存ファイル廃止と既読/削除契約の撤去として**0.94.0**へマイナー更新。frozen install、型検査、build、publish成功。初回型検査は版更新後の依存記録不一致で停止したが、固定lockfileのinstall後に成功。
- 関連Node回帰 **131/131（fail/skip/cancel 0）**。通知寿命・保留・操作競合・安全な要約・永続化なし・1,000件上限・99+・グループ集約、警告/エラー/情報、読み上げ、Windows/desktop配送、設定通知、リボンを検証。ソースGUI: センター **7群**、バナー **8群**。固定EXE: センター **6群**、操作結果通知（commands-only）**2群**成功。Node/.NET通知の実接続・操作、既読/削除/チェックボックス不在、検索、閉じた後の要約、バッジ3→2→3と再起動後0、両リボンモード、明暗テーマを確認。
- 操作結果GUIの初回は既存ショートカットAPIのbusy/cancelledを期待値へ含めていなかったため失敗、次はセンターの非同期表示待機不足で失敗。テストだけを現行契約/表示準備待機へ修正し、同じ固定EXEで最終成功。失敗ログも保持する。製品の再修正・再発行なし。
- 配布物: `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`、**170,677,546 bytes / SHA256 `0314bfa727c7d3d7905f656ef6faa0ada53a2ed1b22ddd734a422a27a81016d1`**。EXE版、feed版/size/hash、Default Shell版、試験コピーを照合。検証入力734ファイル・生成物839ファイルのhashと完全ログは`.artifacts/notification-session-20261026/`のvalidation/bundle/before/final/reviewへ記録。検証後の入力差は上記information GUI試験1ファイルだけで、再試験前後の入力一致も確認した。
- 無関係な全回帰と通知設定GUI全体は未実行（同GUIの履歴期待値のみ更新）。実外部受信、物理Windows通知クリック、物理ロック遷移は未確認。隔離検証プロセス0件。今回の編集用一時スクリプトを削除。成功した同方式の直近3回・失敗/結果不明・参照用の証跡を保持し、テストフォルダー削除0件（inventory参照）。未コミット、push/Release/実利用deployなし。

## 2026-10-26: トリガー設定UIの仕上げと入力別実行方法のコミット検証 0.93.1

- 0.93.0の未コミット変更を保持して追加修正。統合一覧の見出しを「トリガー」、追加tooltipを「キートリガーを追加」「マウストリガーを追加」「タッチパッドトリガーを追加」に変更し、読み上げ名も整合。設定ボタンは共通の歯車1枚のSVGを使用した。
- 実行方法欄の継承時説明は`visibility: hidden`と`aria-hidden`で非表示にし、折り返しを含む領域を保持する。3方式のinherit/first/all切替とライト/ダーク・1280/760/480pxで高さ・位置の不変と説明の表示状態を確認。狭幅、長い一覧、取消、再編集、順序との同時保存、実再起動も成功。
- 発行前レビューで4要件、共有部品への影響、既存の入力別保存・実行動作の保持を確認し、阻害指摘なし。frozen install、型検査、build、publish成功。0.93.0の697入力と完全ログを照合し、変更8ファイルを特定。影響のないNode **201件**とnative共通fixture **46件**の成功を再利用し、文言/統合トリガー **14/14件**を再実行（計215件、失敗なし）。旧EXEの成功を新版の検証結果として扱っていない。
- **0.93.1 / 170,683,555 bytes / SHA256 `0738f101c9822b5d7f43620eed0319a7f50220b57748c58af8da636a40b2fff8`**を発行。固定EXEの設定 **7群**・統合一覧 **18群**・隔離smoke成功。一覧の文言/tooltip、歯車の画像、フォーカス/スクロール/保存を確認。File/ProductVersion・feed・Default Shell版、out全238ファイル・native input全403ファイル、試験コピーと最終EXEを照合した。
- 証跡は`.artifacts/trigger-ui-0931-20261026/`のreview/validation/bundle/environment、697入力hash・完全ログ・画像。実行処理の再利用元は`.artifacts/input-execution-20261026/`。コミット用の対象hash・stage tree・commit treeの照合は`.artifacts/commit-validation-0931-20261026/`に記録する。
- 物理入力、OSへのPause/F13～F24送信/登録、Windows接続設定の変更は実施していない。検証プロセス0件を通常ユーザー権限で確認。直近の成功分、参照/再利用証跡、用途不明の他作業を保持し、削除0件。push/Release/deployなし。

## 2026-10-26: 入力別の実行方法とトリガー設定ダイアログ 0.93.0

- cleanなmain `587cb41`で`pull --ff-only`による最新確認後に実装。キー・マウス・タッチパッドの各設定へ`inputExecutionModes`を追加し、正規化した入力IDごとにfirst/allを指定できるようにした。未指定は全体のexecutionModeを使用し、旧設定は空マップへ正規化。設定追加として0.93.0へマイナー更新。
- 共通ダイアログを「トリガーの設定」に変更し、「ジェスチャーの設定を使用する」（既定）・「最初の1つ」・「すべて」と実行順をまとめて編集。継承中は全体の現在値を表示し、1件の入力でも編集できる。入力を切り替えても一時変更を保持し、適用時に方法と順序を原子的に保存。同じ入力への外部編集は競合として拒否し、他入力の変更を保持する。本文スクロールと固定フッター、コマンド名/条件の2行表示を確認した。
- TSの共通実行計画とnativeマウスの待機表示/選択へ同じ実効値を接続。キー・タッチパッドの元入力制御、条件判定、exe除外、同一コマンドの重複除去、既存の保存順を維持。JSON/リセット/3方式の公開configure APIも接続し、種類全体の設定とWindows接続を入力別指定から分離した。
- 発行前レビューで既定互換、キー別名の1バッチ選択、nativeとの一致、保存競合、APIの許可/原子性、文言・狭幅・長い一覧を確認。説明の重複とスクロール期待を修正して再検証し、発行阻害指摘なし。frozen install・型検査・build・publish成功。関連16ファイルのNode回帰 **215/215、fail/cancel/skip 0**、TS/C#共通fixture **46件**成功。
- 固定EXEでトリガー設定 **7群**、統合一覧 **18群**、機能設定 **9群**と隔離smoke成功。3方式の継承/first/all/解除、取消、再編集、順序との同時適用、別入力の一時変更保持、全体設定/接続の保持、実再起動を確認。ライト/ダーク、1280/760/480pxと700×540の長い一覧で操作・フッター到達を確認し、固定版の画像も確認した。
- **0.93.0 / 170,698,578 bytes / SHA256 `34378b092cddaa671a628e73ecaf34ff3505660ceefb7da08176049ed39ee114`**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`のFile/ProductVersion・feed・Default Shell版、out全238ファイル・native input全403ファイルと固定試験コピーを照合。697入力は最終検証前後で一致。証跡は`.artifacts/input-execution-20261026/`のreview/validation/bundle/environment、入力hash・完全ログと固定GUI画像。
- OSへのPause/F13～F24送信/登録、Windowsタッチパッド接続変更、物理入力試験、無関係な全回帰は実施していない。未コミット、push/Release/deployなし。完了時の検証プロセス0件。直近の成功分・参照/再利用証跡・用途不明の他作業を保持し、削除0件（同フォルダーのtest-folder-inventory参照）。

## 2026-10-26: exe除外と設定UI 0.92.2のコミット検証

- 利用者によるplaceholderの識別しやすさの確認後、既存のレイアウトcommit `ebd4aa2`に続く除外実装・共通設定欄・placeholder調整の42ファイルを対象としてレビュー。0.92.0の実行基盤/API/保存の180回帰とC#共通fixture41件、0.92.1の表示/翻訳等21回帰、最終0.92.2の配色7回帰、各版の固定GUI35/17/9群と最終smokeの証跡を照合した。
- 最終694入力、23ログ、各固定GUIの結果とコピーEXE、発行済み0.92.2のSHA256、out237・native input403ファイルの一致を確認。0.92.0以後の9入力差分は表示/文言/版と対応する試験、0.92.1以後は共通色と版の2入力だけで、実行基盤・native・関連試験は同一。後続の変更に対応した成功結果を再利用し、追加製品変更・不足回帰はなく、再実行・版更新・再発行は行わない。
- 証跡は`.artifacts/commit-validation-0922-20261026/`のreuse・stage・commit記録。対象だけをstageし、各blobと作業ファイル、stage treeとcommit treeを照合する。物理入力の未確認範囲は既存記録を維持し、push/Release/deployは行わない。新規テストフォルダーなし、既存の再利用証跡を保持する。

## 2026-10-26: ライトモードplaceholderの追加調整 0.92.2

- 利用者の指定で共通placeholder色を`#9aa2b1`から、より薄い`#bfc5d0`へ調整。既存のライトモード専用input/textarea規則を使い、保存値・入力済み文字・ダークモード・対象画面の範囲は変更なし。0.92.1からの製品入力差分は`src/shared/appearance.ts`と版の`package.json`のみ。既存の未コミット変更を保持したためpullは実行していない。
- 発行前レビューで共通定義への集約、ライト限定selector、入力値・設定/APIへの影響がないことを確認し、指摘なし。frozen install・型検査・build成功。既存appearance回帰は **7/7、fail/cancel/skip 0**。表示の追加修正として0.92.2へパッチ更新しpublish成功。
- 固定EXEの機能設定GUI **9群**と隔離smoke成功。既存fixtureを使った手動表示確認で3方式とブラウザexeのplaceholderが`rgb(191, 197, 208)`、入力済み文字が`rgb(36, 41, 57)`であることを確認。マウス設定の画像で入力例と検索欄が淡く表示されることを確認した。新規試験追加・無関係な全回帰・物理入力試験は行っていない。
- **0.92.2 / 170,689,591 bytes / SHA256 `61d81d66df73ded1602629e26eed3b9538f0d22a420f230f46281a93587b535c`**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`のFile/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイルと試験コピーを照合。694入力は検証前後で一致。証跡は`.artifacts/placeholder-lighter-20261026/`のreview/validation/bundle/environment、入力hash・完全ログ・previewと固定GUI画像。
- 未コミット、push/Release/実利用deployなし。完了時の検証プロセス0件。直近と再利用用の既存証跡・用途不明の他作業を保持し、削除0件。対象一覧は同フォルダーのtest-folder-inventoryへ記録。

## 2026-10-26: placeholder配色とトリガー除外欄の統一 0.92.1

- 0.92.0の未コミット実装を保持したまま表示を追修正。`appearance.ts`の`placeholderCss`を既存の登録済みローカル画面への配色経路で配布し、ライトモードのinput/textareaを`#9aa2b1`へ統一。ダークの既存表示とリモート本文は対象外。除外exe・対象exe・Webブラウザexeの入力例から`.exe`を省略した。
- トリガー全体の欄名を3方式とも「ジェスチャーを除外するexe」に統一し、実行方法の直下へ配置。マウスの欄を移動し、キー/タッチパッドの設定カタログ名も整合。ダイアログは「除外するexe」のまま。保存キー・保存値・exe名の正規化・除外実行処理に変更なし。表示のみの追修正として0.92.1へパッチ更新。
- 発行前レビューでライト限定selector、共通配色の登録URL/main-frame境界、3方式の名称と配置、ダイアログの表示/保存契約を確認し、阻害指摘なし。型検査・build、既存のappearance/localization/command-triggers回帰 **21/21**、frozen install・publish成功。0.92.0からの入力差分は版・配色・表示・既存配色試験の期待値のみ9ファイルと照合し、変更のない除外実行基盤の回帰証跡を再利用した。
- 固定EXEの機能設定 **9群**、割り当て編集 **8群**、隔離smokeが成功。確定/取消/保存/再起動、明暗と幅別の既存GUI確認を実施。隔離fixtureから実フォームの目視資料も取得し、3方式の欄名、実行方法直下の配置、拡張子なしの入力例を確認。入力文字`rgb(36,41,57)`に対しplaceholderは`rgb(154,162,177)`。マウス/タッチパッドの実画面を目視した。画像の差分比較テストは追加していない。
- **0.92.1 / 170,691,917 bytes / SHA256 `57878e921ad2cf2d8cee6737e387405580a77272ba3e639c49488b53b90f9c72`**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`へ発行。EXE版/feed/同梱本体・Default Shell、out237ファイルと入力プロセス403ファイル、固定GUI/smokeコピーを照合。最終694入力hash一致。証跡は`.artifacts/placeholder-ui-20261026/`のreview/validation/bundle/environment/preview・ログ・入力hash。
- 検証用プロセス0件を確認。現在の成功資料と以前の再利用資料、用途不明の生成物を保持し、削除0件。無関係な全回帰・物理入力の再検証は行っていない。0.92.0からの実装は引き続き未コミットで、push/Release/実利用deployなし。

## 2026-10-26: トリガー全体と割り当て単位のexe除外 0.92.0

- 先行レイアウト改善を`ebd4aa2`へコミットし、cleanなmainで`pull --ff-only`（Already up to date）後に実装。キーの`keybindingOptions.excludedProcesses`、タッチパッドの`touchpadGestures.excludedProcesses`、3方式のグローバル条件の`when.excludedProcesses`を追加。マウスの既存全体設定を含め、種類別の全体除外に割り当ての指定を追加し、どちらかに一致すれば実行しない。追加設定のためマイナーを1つ増やし0.92.0とした。
- 3ダイアログの共通欄を有効化し、入力検査・正規化・取消・再編集・空欄への戻しへ接続。各機能設定には共通部品の除外欄を置き、実行方法の変更でも除外指定を保持する。設定保存・ページ投影・公開API/schema・条件表示・TS/C#の共通実行判定を整合。欠落値は空、古い行へ任意フィールドを書き足す移行なし。
- 発行前レビューでは、globalだけのキーもnative条件付きに投影すること、ローカルキーにも本体プロセス名を渡すこと、タッチパッド設定変更時に古い入力通知を破棄することを確認。タッチパッドは従来の専用キー捕捉を保ち、全体除外または同じジェスチャーの全保存行の追加除外に該当するときだけ元入力を通す形へ調整。残る発行阻害指摘なし。
- 関連12ファイルのNode回帰 **180/180**、C#共通条件・選択fixture **41件**、型検査・本体/native build・publish成功。追加除外と全体除外の合算、異なるexe/未知プロセス、first/all、入力ブロック、API dryRun/保存、独立した保存と旧設定、touchpad投影更新による旧通知破棄を模擬環境で確認。版変更直後はpnpmの依存構造確認で型検査が停止したが、publish既定の`install --frozen-lockfile`後、同じ型検査が成功。lockfile・検査方針は変更せず、停止ログを保持した。
- 固定EXEで編集 **8群**、機能設定 **9群**、統合一覧 **18群**と隔離smoke成功。3方式の追加除外の不正値/正規化/保存/取消/解除、全体設定の独立性、確定前未保存とEscape取消、実行方法変更後の保持、再起動後の永続化を確認。既存の入力選択・条件・実行順・削除・フォーカスの回帰と明暗/幅別の確認も成功。編集試験の旧「対応予定」という結果文言だけを更新して再実行し、ほかの検証結果は製品・対象試験のhash一致により再利用。
- **0.92.0 / 170,683,211 bytes / SHA256 `85e168ca744f88f8d47aa6abce3b325e61426fa5d6d8b0139df39a7c6bd81ba4`**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`へ発行。File/ProductVersion・feed・同梱本体/Default Shell版、out全237ファイル、入力プロセス403ファイルと固定試験コピーを照合。証跡は`.artifacts/trigger-exclusions-20261026/`のreview/validation/bundle/environment、694入力hashと各ログ。
- OSへのPause/F13～F24の送信・登録、Windowsタッチパッド設定の変更、物理指操作は行っていない。無関係な全回帰は未実行。今回の実装は未コミットで、push/Release/実利用deployなし。完了時に`.artifacts`を参照する検証プロセス0件を確認。整理では現在の成功証跡・既存の再利用資料・他作業/用途不明の生成物を保護し、削除0件。対象一覧と判断はtest-folder-inventory/environmentへ記録。

## 2026-10-26: 割り当てダイアログ0.91.3のコミット

- 利用者による使い勝手の確認後、レイアウト改善の関連16ファイルをコミット対象として照合。実装時の705入力、全8ログ、固定GUIの結果hash、発行済EXEが一致したため、型検査/build・関連124件・固定GUI26群・smoke・配布物確認を再利用した。追加製品変更と不足回帰はなく、版更新・再発行は行わない。
- 証跡は`.artifacts/commit-validation-binding-dialogs-20261026/`。対象だけをstageし、indexと作業ファイルのGit blob・stage treeとcommit treeを照合する。後続のexe除外実装とは分けてコミットし、push/Release/deployは行わない。

## 2026-10-26: 3方式の割り当てダイアログ改善 0.91.3

- cleanなmain `49d3c0b`で`pull --ff-only`による最新確認後に実装。`BindingEditorLayout`で入力操作と条件を横並び（800px以下は縦並び）にし、マウスの種類・段数・方向の余白を整理して2段階方向を横並びにした。タッチパッドは3本指/4本指の各5ボタンと選択中表示に変更。「いつ・どこで」は`CommandConditionEditor`へ共通化し、範囲ボタン・対象ページの直接選択・exe入力を共有。有効切り替えと適用/取消は固定フッターへ移動した。
- グローバルの「除外するexe」は対応予定を表示する入力不可欄のみ。保存キー・実行時の除外判定は追加していない。設定UI指針に3ダイアログの配置例外を記載し、保存ID・認識設定・Windows接続・実行順・原子的保存/競合検査を維持した。設定/保存ファイル/API変更のない通常パッチとして0.91.3へ更新。
- 発行前レビューで条件遷移、既存値と未導入ページの保持、入力抑止/フォーカス/適用・取消、CSSの適用範囲、翻訳と版更新区分を確認。画像確認後にスイッチをラベルと同じ行へ揃えた。発行阻害指摘なし。frozen install・型検査・build・publish成功。関連8ファイルの既存回帰は **124/124、fail/cancel/skip 0**。無関係な全回帰・物理入力テストは実行していない。
- 固定EXEで編集専用 **8群**、統合一覧 **18群**、隔離smoke成功。全方式のscope切替、exe不正入力/正規化、ページ検索/選択、取消とフォーカス復帰、マウスの種類/段数ごとの入力保持、2段階の方向交換、タッチ全10IDの保存とキーボード操作、キー記録/元入力ブロック、有効切替、追加/編集/削除/実行順、実再起動後の保存維持を確認。実テーマAPIで明暗を切り替え、1280/760/480pxの操作と画像を確認した。予約キーPause/F13～F24のOS送信/登録・Windowsタッチパッド設定変更なし。物理入力と将来のexe除外機能は確認対象外。
- **0.91.3 / 170,691,969 bytes / SHA256 `fbd8d6aefdc6588519088b246f514dcbe79cf06b2409bd430fdef01c9057d2d9`**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`へ発行。EXEのFile/ProductVersion、feedの版/size/hash、同梱本体/Default Shell版、out全237ファイル、固定GUI/smokeコピー3本を照合した。最終GUI前後705入力一致。回帰後の入力差分はGUIのテーマ設定を実APIへ変更した検証スクリプトだけで、製品/単体試験への影響なし。
- 正本: [割り当てダイアログ](docs/command-triggers.md#割り当てダイアログ)、[UI指針](docs/settings-ui-guidelines.md)。証跡: `.artifacts/binding-dialogs-20261026/`のreview/validation/bundle/environment・入力hash・各ログ。固定GUIは`command-triggers-ui-1792971771827`と`command-triggers-ui-1792971825963`、smokeは`smoke-1792971874323`。開発GUI初回は既存一覧のhover手順不足でタイムアウトし、手順修正後に成功。失敗ログは診断資料として保持した。検証プロセス終了確認、現在の証跡/過去の再利用資料/用途不明分を保持して削除0件。commit/push/Release/実利用deployなし。

## 2026-10-26: MCP接続設定の共通一覧API 0.91.5

- cleanな`codex/mcp-settings-design` / `022b1f1`から同じ専用worktreeで継続した。追跡先なしのためpullや追跡先の新設は行わず、primary mainと他のworktreeは変更しない。既存の名簿・接続項目・保存ファイル・固定MCPツール契約を維持する変更のため、発行済み0.91.4から**0.91.5**へパッチ更新した。push/Release/deployは行わない。
- McpClientSettingsへ非秘密スナップショットと保存計画を集約し、従来の管理APIと共通設定APIで同じ検証・原子的保存を使う。外部取得・保存の保護判定で暗号化/復号を呼ばず、認証情報を読めない接続でも公開メタデータを編集できる。秘密付きの削除・結び付け先変更・新たなBearer設定を拒否し、従来の秘密保護チェックも保持した。ローカルUIの秘密編集・接続確認は既存経路のまま。
- `category=mcp-client`のlist対象を固定6入口へ接続。IDは読取り専用で追加時に生成し、名前/説明は共有、非秘密connection列はPC専用へ保存する。追加・部分更新・削除・全行並べ替え、最大32件、空の引数を含む64引数、重複しない公開ツール名512件を既存検証へ渡す。一覧用の任意validator追加はこの所有対象だけに使い、他の一覧は既存の共通検証を維持する。
- 個別に壊れた行と暗号文・未設定名簿・他の行を保持し、PCファイル全体が不正なら対象をunavailableとして保存しない。名前/説明/順序だけの変更ではPC接続ファイルのbytesを維持する。read + writeで保存し、execute/useMcpを要求しない。applies=mcpSettingsChanged、settingsSaved/effectVerified=falseで、取得/dryRun/保存は接続・stdio起動・ツール探索を始めない。従来入口の公開状態は接続設定の状態を示し、認証の成否を保証しない。
- 発行前レビューで、未編集の有効URL表記を正規化して秘密の結び付け先へ影響する可能性と、メタデータ専用保存時のPCファイル競合検査を補強した。未編集URLを保持し、PCファイルを再書込みしない検査専用assetも保存直前にrevisionを確認する。回帰を追加し、型検査/build・影響する標準回帰・GUIを再実行。最終の阻害指摘なし。
- 固定依存install・変更範囲の整形検査・型検査・本体/Default Shell build・publish.batが成功。関連標準**32ファイル354/354件、fail/cancel/skip 0**、うち新規11件（所有adapter10件・従来入口の非復号回帰1件）が成功した。秘密/未設定/壊れた行、複数行の原子的拒否、保存失敗時の共有/PC巻戻し、外部更新、保存直前の再検査、再送、無変更、許可取消、既存上限とID/再読込みを検証した。標準全体は未実行。
- 隔離source/最終固定EXEで実MCP・設定連動**各40群**と従来MCP設定画面**各10群**、固定EXE smokeが成功した。MCPの追加/dryRun/再送/部分更新/並べ替え/削除、ネイティブ編集からMCPへの即時反映、古い要求と秘密変更の拒否、暗号文保持、execute/useMcp OFFとtools/list不変を確認。ループバックHTTPの要求数は保存後も0。従来ローカルUIの実ハンドシェイク・失敗時OFF復帰・警告・入力保持・再起動も維持した。
- 最終**760入力**と参照Applet manifestのSHAは、レビュー後回帰前後・発行前後・固定試験後で一致。Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.402、Windows x64、独立node_modulesで実行した。発行後の追記は文書と証跡のみ。
- EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170693659 bytes / SHA256 `26fb9cb263e373ed366bd5de30edd87e671d5e416561a04749403dbef91f95ac`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shellと全固定試験コピーを照合した。
- 正本は[設定API](docs/settings-api.md#mcp接続一覧)、[MCP接続管理](docs/mcp-client-design.md)、[設計](docs/mcp-settings-design.md)。証跡は`.artifacts/mcp-settings-client-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-client-20261026/`。source-profiles.json/fixed-profiles.jsonとsmoke-profile.jsonへ結果/hashを記録した。保存処理の共通化（`542fc4d`）と共通一覧APIへの接続を別コミットに分けた。
- 中継全体GUIの追加試行は、事前配置するCustomCommands fixture不在でホスト起動前に終了し、成功件数へ含めない。同じ全体スクリプトに今回と無関係なPauseキー送信があるため再試行せず、今回必要なMCP通信/設定回帰は上記の標準と2種類のGUIで検証した。実利用設定/認証、Windows起動登録、Pause/F13～F24のOS送信・登録は変更していない。
- 専用テストプロセス0。今回の各script/方式の成功は3回以内。過去の参照profile/固定コピー・診断・起動前に止まった中継fixture・状態未確認の過去試験・固定ビルド出力を保持し、削除0件。初期の版更新後依存照合、レビュー前の検証と診断は同じ証跡フォルダーに保持した。

## 2026-10-26: 共通ブラウザ設定の宣言共有とMCP接続 0.91.4

- main `49d3c0b`の統合commit `a802b73`から、同じ専用worktree/branchで共通ブラウザ設定のMCP対応を実装した。マージと別の実装単位とし、追跡先の追加、primary mainの変更、push/Release/deployは行わない。既存commandTriggerOptionsのbrowsers/requireChromiumWindowClassと共有settings.jsonを使い、製品設定項目/保存ファイルの追加削除はないため、発行済み0.91.3から**0.91.4**へパッチ更新した。
- command-trigger-options.tsの共通宣言から型/既定値/検証、既存3画面の通常入力、検索/JSON、差分保存とMCP項目を生成する。トグル/文字/数値/固定選択は宣言だけで反映し、MCP側に別表を作らない。正規化関数は内部に保持して公開定義から除外し、構造化複製とIPCを維持する。方式別の動作・割当・接続と衝突するキーは宣言へ入れない。通常の見た目/入力確定/既存ラベルを保った。
- 固定6入口へcategory=command-triggersのfields対象を接続。ブラウザ名は所有するprocessNamesで検証・正規化し、上限100件、空配列の明示値を維持する。正規化した候補から無変更/既定値一致を判定し、大小文字や.exe/重複だけの差で保存せず、正規化後の既定値setとresetで上書きを除去する。rawの変更キー以外をプレビューへ増やさない。
- 保存は共有commandTriggerOptionsだけを変更し、3入力方式の読取りと次の条件判定へ通常通知で反映する。割当、方式別executionMode、動作/接続設定、PC専用値と暗号化情報を保持する。read + writeで利用し、executeを追加条件にしない。applies=commandTriggerOptionsChanged、dryRunは検証だけ、settingsSaved/effectVerified=falseは保存完了だけを表す。物理入力とOS登録の完了は保証しない。
- automation=false/secret/localOnlyをSchema・値・検索・更新から除外する。従来の3方式の取得、configure用Schema/検証、返却プレビューにも同じ公開判定を適用し、明示非公開を旧入口から変更できないようにした。外側の案内は現在の公開inputSchemaを参照し、共通フィールド名を二重登録しない。MCPのツール名/外側Schemaと8行の操作許可は維持した。
- 発行前に宣言の共有、型/既定値、構造化複製、正規化と既定省略、原子的保存、公開/許可/競合、旧入口、UIと必要回帰をレビュー。機能ページのカタログ早期returnにも共通宣言を接続し、JSONの既定値だけのblockを省略する契約を試験へ反映して再検証した。阻害指摘なし。
- 固定依存install、型検査、本体/Default Shell build、関連標準**75ファイル777/777件、fail/skip 0**が成功。新規の所有adapter回帰7件は、探索/配列Schema、dryRun/正規化/再送/無変更/既定復帰、100件境界/明示空配列、共有/PC分離と暗号化bytes保持、原子的拒否/許可取消/外部更新、宣言追加によるカタログ/JSON/保存/MCP反映、非公開の旧入口保護と保存失敗を確認した。標準全体は未実行。
- 隔離source/最終固定EXEで実MCP・画面**各36群**、ジェスチャー機能設定/共通ブラウザ設定**各8群**、コマンドトリガー**各18群**と固定EXE smokeが成功した。MCPから3画面への反映、既存入力/トグルからMCPへの反映、古い要求拒否、実再起動後の保存保持、未編集設定/暗号化bytesとexecute OFF、tools/list不変を確認。Applet workerの合計起動3回と無効/待機worker未起動も保持した。実利用の設定/認証、OS登録、物理入力を変更する検証は行っていない。
- 最終**757入力**と参照Applet manifestのSHAは、回帰前後・発行前後・固定検証後で一致。Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.402、Windows x64で実行した。整形はsrc/scripts/testsの変更範囲を検査し、package.jsonは版番号だけを変更。発行後は文書と証跡だけを追加した。
- publish.bat終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170695215 bytes / SHA256 `a7adf008ed601fc83e96870bd3e5d24c43de7c581de4f2fb069b4ef3d39646e5`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shellと、全固定試験コピーを照合した。
- 正本は[設定API](docs/settings-api.md)、[設定基盤](docs/settings-foundation.md)、[コマンドトリガー](docs/command-triggers.md)、[外部操作](docs/automation.md)。証跡は`.artifacts/mcp-settings-browser-options-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-browser-options-20261026/`。全GUIのprofile/result/hashはsource-profiles.json/fixed-profiles.json、smokeはsmoke-profile.jsonに記録した。
- 専用テストプロセス0。今回の各script/方式の成功は3回以内。main統合/過去の参照profile、診断、固定ビルド出力、別作業を保持し、削除0件。初期のカタログ経路はowner-tests.log、JSON既定省略の期待値はowner-final.logに診断を残し、owner-complete.logと最終回帰で解消を確認した。

## 2026-10-26: 最新mainのMCP設定worktreeへの統合 0.91.3

- `codex/mcp-settings-design`のcleanな`c194c36`へ、fetchで確認した最新`origin/main=49d3c0b`を通常mergeした。mainのコマンドトリガー統合、共有ブラウザ判定、共通スクロールバーとジェスチャー機能設定の変更を取り込み、MCPの固定6入口、通常設定/一覧/所有adapterと秘密保護を保持した。primary main checkout、追跡先、push/Release/deployは変更しない。
- 競合9ファイルを整合した。API/案内/試験/作業指示では、3入力方式の共通設定も統合済みread + writeで判定し、廃止した個別編集許可とexecute条件を再導入しない。mainの画面/スクロール構造へ既存storage test-idを接続し、リボンはAppletごとのページ上限を守る既存の複数提供元fixtureとmainのスクロール検査を両立した。両方の仕様/検証履歴と開発入口を保持した。
- 発行前に全incoming commit、競合解消、設定型/既定値/保存、公開範囲と許可、UI構造と必要回帰をレビューし、阻害指摘なし。mainで導入済みの設定変更を超える設定項目/保存ファイル追加と破壊的変更はなく、mainの発行済み0.91.2から統合版**0.91.3**へパッチ更新した。
- 固定依存install、型検査、本体/Default Shell build、関連標準**75ファイル770/770件、fail/skip 0**が成功。標準全体は未実行。source/最終固定EXEとも実MCP 32群、コマンドトリガー18群、機能/共通設定8群、リボン7群、共通スクロールバー6群、リボンスクロールバー4群が成功し、固定EXE smokeも成功した。通常入力・表示/再起動保持と共通ブラウザ設定の連動を隔離profileで確認した。物理入力/UAC/実利用設定や認証を変更する試験は行っていない。
- 最終**756入力**と参照Applet manifestのSHAは回帰前後・発行前後・固定検証後で一致した。publish.bat終了0、EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170700489 bytes / SHA256 `47f74cc7a89abc3769b7780a5567ca31ba6a458fb8d77c77f196feaa603cf44b`**。File/ProductVersion、feedの版/size/hash、ASAR内packageと同梱Default Shell、全固定試験コピーを照合した。固定ツール/lockfile/依存方針を維持した。
- 証跡は`.artifacts/mcp-settings-main-next-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-main-next-20261026/`。各GUIのprofile/resultとhashをsource-profiles.json/fixed-profiles.jsonへ記録。検証済み入力を継続し、製品の後続変更は別の実装単位とする。次の区切りはmainで共通化されたブラウザ判定設定を固定6入口へ接続する。
- 今回の各script/方式の成功profileは3回以内。過去の再利用資料/参照profile、固定出力、別作業を保持し、削除0件。専用テストプロセス0を確認した。

## 2026-10-26: 0.91.2までの変更のコミットとGitHub/AQUAプッシュ

- ジェスチャー機能ページの整理・ブラウザ判定の共通化、設定インデックスのシンボル復元、Applet管理/AI/MCPの表操作配置を対象に、先行変更と各版のレビュー・入力hash・ログを照合。製品は確認済みの **0.91.2** を保持し、配色・製品コード・依存・配布物を追加変更していない。
- 不足していた標準回帰を実行。初回は908件中905件成功、撤去済みのタッチパッド割り当て一覧を想定したSettingsViewClientの既存3件だけが失敗。失敗時の復元・拒否入力に基づくキュー破棄・保存後Windowsエラー時の実保存値の反映という確認を保ち、現在の接続キー/修飾キーの編集へ置き換えた。新規ケースは増やさず、全体を再実行して **908/908件、fail/cancel/skip 0** を確認。初回の失敗ログは診断資料として保持し、全体成功として再利用していない。
- 現在の固定EXEで機能設定 **8群** と統合一覧 **18群** を直列実行し、編集・保存・提供元移動・実再起動まで成功。`.artifacts/command-triggers-ui-1792964581303/result.json`と`.artifacts/command-triggers-ui-1792964611841/result.json`。両コピーと発行先はSHA256 **`6ef4e1619e71f46df84ca19f0d85d004f38e75d988a8ea87be5118d8701d14a3`** で一致し、再ビルドしたout全237ファイルも同梱ASARと一致。0.91.2時点の型検査・発行・3画面×明暗6画像は、対象入力と同じEXE/hashを照合して再利用する。
- 証跡は`.artifacts/commit-validation-trigger-settings-20261026/`。検証前後の入力一致、製品入力の発行時との一致、対象ファイルだけのstage、stage/作業ファイルと`git write-tree`の一致を確認して通常commitする。初期のGitHub/AQUA mainはいずれも`3455315`。先行`0f9bd35`を含む履歴を通常pushし、各remote先端と最終commit、commit treeとstage treeの一致、cleanな作業ツリーを最終記録へ残す。関連証跡・診断資料を保護し、削除0件。Release作成と実利用deployは行わない。

## 2026-10-26: Applet管理・AI・MCPクライアントの表操作配置 0.91.2

- 先行の未コミット変更を保持し、Applet管理のApplet名ヘッダーから右寄せ専用クラスだけを外して、追加と並べ替えを隣接。移動列を「設定 → ログ → コマンドトリガー」に並べ替えた。AI/MCPクライアントは共通`actionsAlign="start"`を指定し、操作ヘッダーと行内ボタンを左寄せに揃えた。CSS・配色・アイコン色・hover/focus装飾は変更していない。
- 発行前レビューで右寄せクラスの定義が`margin-left:auto`だけであること、共通指定が文字位置とflex配置だけを変えること、移動先ID・イベント・有効状態の維持を確認。阻害指摘なし。設定や公開APIの変更を伴わない通常パッチとして0.91.2へ更新し、整形確認・型検査・frozen install・publish成功。新しい製品回帰テストと無関係な全回帰は追加・実行せず、固定EXEを隔離起動して3画面×明暗の6画像と実配置を確認した。追加/並べ替え間は10px、移動順は指定どおり、AI/MCPの見出しはleft・行内ボタンはflex-start。画面エラー0件。
- **0.91.2 / 170,688,788 bytes / SHA256 `6ef4e1619e71f46df84ca19f0d85d004f38e75d988a8ea87be5118d8701d14a3`**。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。File/ProductVersion・feedの版/サイズ/hash・同梱本体/Default Shell版・out全237ファイルを照合し、隔離コピーも一致。検証前後735入力は一致し、0.91.1からの製品入力差分は3つの対象TSXとpackage版だけ。確認後にApplet管理と共通一覧の正本文書・本記録を整合させた。
- 証跡は`.artifacts/settings-table-placement-20261026/`のreview/checks/publish-result/bundle/validation・入力hash・完全ログ、ui-inspection.jsonとui内の6画像。検査用fixtureは有効化せず、外部接続・物理入力・Windows設定書込を行っていない。検査プロセス終了を確認し、再利用する画像と記録を保持。新規の独立したテストフォルダーと整理候補はなく、削除0件。commit/push/Release/実利用deployは行っていない。

## 2026-10-26: 設定インデックスのシンボル復元 0.91.1

- 0.91.0の未コミット変更を保持し、キー・マウス・タッチパッド・カスタムコマンドの設定インデックスに、従来のkeyboard/mouse/touchpad/keyboard-command-keyを復元。一覧への移動先を1つへ統一した際、インデックスが同じ配列からアイコンを取得していたため消えていた。`SettingsIndex`のページ別アイコン定義を移動先の配列から独立させ、Applet管理・通知・コマンドトリガーの既存アイコンも保持した。
- 発行前レビューで4つの旧シンボルとの一致、統合一覧への移動、既存の設定・入力動作への影響を確認し、発行阻害指摘なし。保存項目・公開APIの変更を伴わない見た目の修正のためパッチを更新。整形確認・型検査・frozen install・publish成功。固定EXEの既存設定画面チェック **8群**（共有設定・移動・保存・実再起動を含む）が成功し、ライト/ダーク画像で4つの復元を確認。新規テストや無関係な全回帰は追加・実行していない。
- **0.91.1 / 170,679,351 bytes / SHA256 `640cde7070b1879b64dc2f047131e7165f077acd8fdf850accdc341e1598e77c`**。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。File/ProductVersion・feedの版/サイズ/hash・同梱本体/Default Shell版・out全237ファイルを照合。GUI用コピーも同一hash。検証前後735入力の一致と、0.91.0からの製品入力差分が`SettingsIndex.tsx`/`package.json`だけであることを確認した。
- 証跡は`.artifacts/settings-index-symbols-20261026/`のreview/checks/publish-result/bundle/validation・入力hash・完全ログ。固定GUIは`.artifacts/command-triggers-ui-1792963121659/result.json`。プロセス検査は検査用PowerShell自身を数えない対象名へ修正し、試験プロセス終了を確認。同方式の成功直近3回と先行の再利用・診断資料を保持し、削除0件。物理入力・Windows設定書込は試験対象外。commit/push/Release/実利用deployは行っていない。

## 2026-10-26: ジェスチャー機能設定の整理とブラウザ判定の共通化 0.91.0

- cleanなmain `0f9bd35`で`pull --ff-only`し最新を確認。「ショートカットキー」の表示名を「キージェスチャー」へ変更し、既存のページ/コマンド/割り当てIDを保持。キー・マウス・タッチパッドの3機能ページから割り当て一覧を除き、機能設定だけに整理した。動作設定はタイトルなしSectionへ置き、マウス/タッチパッドは既存の有効切り替えと同じSectionへ統合。タッチパッドのWindows接続は常時展開し、2つの保存ファイルを開けるメニューを維持したまま通常の「ファイルを開く」と同じスタイルへ揃えた。
- 各タイトルなしSectionの下に、group表示のない「ジェスチャー共通の設定」を追加。`Settings.commandTriggerOptions`にWebブラウザのexeとChromiumウィンドウ条件を1つだけ保存する。利用者の指定に従い、方式別の旧値は継承せず共通の既定値で開始する。旧フィールドは読み取ったモデルから除き、以後の保存にも含めない。既定値省略・空配列/false・exe正規化・フォーム/JSON・リセット・外部競合は既存の保存基盤へ接続し、割り当ては統合一覧だけの投影へ残す。
- キーのnative条件/JS計画、マウスのnative投影/計画/settingsKey、タッチパッドの計画/実行中世代が同じ共通値を参照する。共通値の変更も実行中バッチの失効へ含め、方式別の実行方法・保存配列順・条件・入力所有権は保持した。公開編集APIの既存ブラウザ項目も共通値の別名として扱い、全方式へ影響する変更にはキー/マウス/タッチパッドの編集許可をすべて要求する。通常の割り当て/実行方法だけの編集は各方式の従来の許可を使い、revision/dryRun/原子的保存と即時失効を維持する。
- Applet管理の移動を設定/コマンドトリガー/ログへ整理し、共通一覧を提供元で絞って開く。カスタムコマンドの移動もコマンドトリガーだけにし、安定したコマンドIDで絞る。割り当て済みの色は全3方式を合成する。機能ページへ不要なコマンド一覧データを送らず、統合一覧にはAppletページ候補と提供元の解除操作を接続した。
- 発行前レビューで保存/公開API/入力判定と失効・画面投影・旧値の非継承・移動と絞り込み・未変更項目を確認。旧タッチパッド項目の受理後除去、プロパティ順で変化判定が揺れるno-opの深い比較、統合先の提供元解除、ファイルボタンの同じポインター状態での比較、改名した入力記録ラベルを修正・再検証した。発行阻害の未解決指摘なし。設定項目の追加/廃止を含むため0.91.0へマイナー更新。
- 固定Node24.22.1/pnpm12.10.1、同一lockfile/供給網検査で整形・型検査・build・frozen install・publish成功。関連17ファイル **199/199件、fail/skip 0**。最終の共通設定変更によるバッチ取消/API説明/翻訳/画面境界は4ファイル **63/63件**（先行分と重複を含む）、共通設定6件と統合一覧の投影保護6件も最終fixtureで成功した。無関係な全回帰は再実行していない。
- 最終固定EXEで機能設定 **8群**、統合一覧 **18群**、隔離smoke成功。3画面の一覧なし・タイトルなしSection・groupなし共通Section、画面をまたぐ保存値共有と独立した実行方法、10種類のWindows接続の常時表示、ファイルメニューと通常ボタンの寸法/色一致、Applet/カスタムコマンドの移動先・対象絞り込み/解除、明暗/1280・760px、実再起動保存を確認。共通設定ブロックがない旧形式の隔離ファイルでも既定値を使い、旧方式別の値を引き継がないことを確認した。追加/編集/削除確認/同じ入力の実行順/種類と一時フィルター/CSS追従/横スクロールも維持。明暗の狭幅画像を目視確認。物理の指操作・F13～F24やPauseのOS送信/登録・Windows設定の書き換えは行っていない。
- **0.91.0 / 170,666,440 bytes / SHA256 `6ec8cf10169fc5608d9d7481fd0bd5bb85f490070fbca551e43ebb675901a29a`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版とout全237ファイルを照合。固定GUI/smoke用コピー4本も同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)・[キー](docs/keybindings.md)・[マウス](docs/gestures.md)・[タッチパッド](docs/touchpad-gestures-design.md)。証跡は`.artifacts/gesture-settings-common-20261026/`のレビュー・各ログ・bundle/validation・入力hash。最終GUIは`.artifacts/command-triggers-ui-1792962217879/result.json`と`.artifacts/command-triggers-ui-1792962101159/result.json`、smokeは`.artifacts/smoke-1792962259187/smoke-result.json`。テスト用プロセスの終了を確認。今回の成功と旧版の再利用/診断資料を保持し、削除0件。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: スクロールバー背景の透明化とコミット 0.90.11

- 0.90.9/0.90.10の未コミット変更を保持し、共通スクロールバーの本体・トラック・track-piece・縦横の交差部・つまみ周囲を透明に変更。つまみは`background-clip: padding-box`で透明な境界へ色が回り込まないようにし、その場所の背景が見える構成にした。明暗のつまみ色、12px幅、3pxの余白、角丸8pxと既存のスクロール構造は保つ。正本は[共通スクロールバー](docs/appearance.md#共通スクロールバー)。
- 発行前レビューで透明なtrack/境界とつまみの描画範囲、非表示バーの優先、テーマ切替、登録済みローカル画面だけへの適用を確認し、発行阻害の指摘なし。0.90.10の入力733件と比較し、この追加修正は`src/shared/appearance.ts`・配色文書・版の3ファイルだけと確認。先行する本文縦横共通スクロール/CSS追従と共通配色のレビュー記録も参照した。設定・保存ファイル・公開APIの変更はない通常パッチとして0.90.11へ更新。
- 利用者の明示指示により、今回の単体・GUI・smokeを含む回帰テストは実行せずコミットする。前段0.90.9/0.90.10の成功は各版の履歴として保持し、透明化後の動作確認済みとは扱わない。固定EXEの起動/画面確認も今回は実行していない。
- 固定Node24.22.1/pnpm12.10.1、同一lockfile/供給網検査で整形・frozen install・build/publish成功。版更新によるworkspace情報の照合要求はfrozen installで更新し、検査は無効化していない。確認はビルドと発行物の整合に限定し、EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版とout全236ファイルを照合した。
- **0.90.11 / 170,685,873 bytes / SHA256 `f68fb36a89c772209af44954ab0edf929efb5845f29732dfdaed7f83e367c463`**。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。証跡は`.artifacts/shared-scrollbars-transparent-20261026/`のレビュー・差分前ソース・ログ・bundle/validation・入力hashとstage/commit記録。新規の回帰テスト用プロセス/フォルダーと整理候補はなく、先行の成功/再利用/診断資料を保持する。
- ここまでのスクロール改善と背景透明化の関連23ファイルを対象にstage/作業ファイルの一致と`git write-tree`を確認し、通常commit後にtree一致・cleanを照合して完了とする。push・Release・実利用deployは行わない。

## 2026-10-26: AppDock共通スクロールバー 0.90.10

- 0.90.9の未コミット変更を保持し、コマンドトリガー本文と同じスクロールバーを本体・設定インデックス・各一覧/ダイアログ・Default Shell・通知・登録ローカルAppletへ共通適用。縦横12px、つまみ周囲3px・角丸8px、中立色の明暗テーマ、矢印なしを`src/shared/appearance.ts`の`scrollbarCss`へ集約した。Shellのthin指定とグループ独自6px、設定横バーの独自配色を除去。重複する内側横バーの非表示と既存のスクロール構造は保つ。
- 既存の配色登録を使い、正確なローカルURLとmain frameを照合した`dom-ready`でCSSを挿入する。再読込後にも適用し、共通preloadのテーマ更新へ追従。任意のWebサイト・リモートiframeには適用しない。発行前レビューで共通定義、URL/フレームの境界、再読込/破棄、意図した非表示の優先、狭幅のアイコンとスクロール、既存一覧への影響を確認。保存項目・ファイル・公開API・入力実行の変更はなく、通常パッチとして0.90.10へ更新。未解決の発行阻害指摘なし。
- 固定Node24.22.1/pnpm12.10.1・同一lockfile/供給網検査で整形・型検査・build・frozen install・publish成功。配色/翻訳/Shell境界/ローカルページ/Webアカウント/通知の関連6ファイルは **45/45件、fail/skip 0**。無関係な全回帰は再実行していない。
- 最終固定EXEで共通配色のスクロールバー専用 **6群**、リボン専用 **3群**、統合一覧 **18群**、従来スクロール **38群**と隔離smoke成功。本体・Shellの各領域・コマンドパレット・バナー/デスクトップ通知・ローカルAppletの9 WebContentsを明暗×mint/roseで確認し、再読込を含む37試料で縦横の実スクロール、幅/色/角丸/矢印/トラック一致を検査。通知の利用可能状態だけを隔離プロセス内で模擬し、OS設定は変更しない。リモートiframeには共通変数/APIがないことを確認。リボンの実オーバーフロー、末尾へのEndとEscape、フォーカス復帰、選択実行とコンパクトなアイコンの収まりも確認した。従来一覧・全ホスト/Appletのフォーム/JSONは明暗と複数幅、統合一覧はCSS追従・横固定・横バー同期・編集/再起動を維持した。明暗の画像も確認した。
- GUIの初回診断で、古い選択子と単一Appletの24ページfixture、グループの固定URL参照を特定。現行の10ページ上限を守る複数fixtureと実URLの照合へ直し、今回の見た目とスクロールに必要な専用モードを追加した。3px境界の検査はDPIの物理ピクセル丸めを許容する。廃止済み要素や別機能の全フローの成功とは扱わず、今回の対象範囲をsource/固定EXEで再実行した。途中の診断資料は保持する。
- **0.90.10 / 170,671,784 bytes / SHA256 `18d9705da529770953acccf401b229e15e5d3eb7c1925bf47263b45c5d64fa81`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版とout全236ファイルを照合。固定GUI/smoke用コピー5本も同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[共通配色とスクロールバー](docs/appearance.md#共通スクロールバー)。証跡は`.artifacts/shared-scrollbars-20261026/`のレビュー・各ログ・bundle/validation・入力hash。固定GUIは`.artifacts/appearance-ui-1792958380724/result.json`、`.artifacts/ribbon-groups-ui-1792958512032/result.json`、`.artifacts/command-triggers-ui-1792958411918/result.json`、`.artifacts/settings-hints-ui-1792958461522/result.json`、smokeは`.artifacts/smoke-1792958548304/smoke-result.json`。今回のテスト用プロセスの終了を確認。成功資料・旧版の再利用資料・診断資料を保護し、削除0件。任意のWebサイトやWindowsネイティブダイアログのスクロールバーは対象外。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: 本文の縦横共通スクロールとCSSセル内追従 0.90.9

- cleanなmain `3455315` で `pull --ff-only` し最新を確認。「コマンドトリガー」のフォームだけ、右側の設定本文を縦横共通のスクロール枠へ変更。共通キャンバス内の見出し・操作欄・状態表示・一覧フィルターは表示幅を保って横stickyにし、見出しと上部操作は縦に流す。フィルターの縦固定は継続する。共通部品のpageScroll指定を使い、JSONと従来ページは既定の表専用スクロールを使う。
- コマンド名・ID・縦3追加ボタンのまとまりをCSS stickyにし、フィルター直下からセル下端まで追従させる。scrollイベント/rAFによる全コマンドの寸法確認とtransform更新、および不要になった `useCommandCellFollow.ts` を除去。横スクロールではコマンドも表と一緒に動く。フィルター高さのCSS変数と画面下の共通横バーは継続し、バーを本文へ接続して双方向同期と矢印/Home/Endを保つ。
- 発行前レビューと実寸GUIで、枠付き表のoverflow:hiddenがstickyの参照先になる問題を特定し、角丸を保つclipへ変更。既存の0まで縮むグリッドを含め親へ表の最小幅を伝え、横stickyが親の右端で流れないよう修正した。本文右paddingが生む4pxの余分な横はみ出しもこのページだけ除去。横バーは共通下部の1つにし、縦バーは共通の中立色で維持した。取消後の本文縦横位置・同じ操作へのフォーカス、空結果、JSON切替、従来画面への影響を確認し、未解決の発行阻害指摘なし。
- 設定キー・保存ファイル・割り当てID・公開API・実行基盤は変更しない通常パッチとして0.90.9へ更新。固定Node24.22.1/pnpm12.10.1、同一lockfile/供給網検査で整形・型検査・build・frozen install・publish成功。保存/競合/翻訳/共通UI境界の関連4ファイルは **32/32件、fail/skip 0**。変更に影響しない全回帰は再実行していない。
- 最終固定EXEで統合一覧 **18群**、従来スクロール **38群**、隔離smoke成功。新たに明暗/1280・700pxでイベント待ちなしの連続scrollTop変更直後の座標、inline transformなし、セル下端停止、本文横移動時の見出し/操作/フィルター座標維持、広幅の横はみ出しなし、横バーのキー操作と同期、横移動後のダイアログ取消による縦横位置/フォーカス復帰、空検索時の横バー消失と位置0、JSON/フォームの寿命を確認。従来4一覧・Applet管理・全ホスト/Appletページの見出しとフォーム/JSONも明暗・複数幅で成功した。追加/編集/削除確認/実行順・実再起動保存も維持した。画像で狭幅の明暗と広幅の外観を確認。物理操作での体感やFPSの測定は未実施。
- **0.90.9 / 170,675,378 bytes / SHA256 `275299643a69a595d6050316d3a80436c4467da66f6a515270b1a983aeba1e50`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連コード・翻訳・renderer計11ファイルを照合。固定GUI用コピー2本も同じhash。発行先は `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)。証跡は `.artifacts/command-trigger-native-scroll-20261026/` のレビュー・ログ・bundle/validation・入力hashと削除ソース一覧。固定GUIは `.artifacts/command-triggers-ui-1792956160465/result.json`、`.artifacts/settings-hints-ui-1792956199502/result.json`、smokeは `.artifacts/smoke-1792956244267/smoke-result.json`。テスト用プロセスの終了を確認。今回のsource成功3回・固定EXE成功と先行版の再利用/診断資料を保持し、削除0件。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: コマンドトリガー0.90.8のコミット・プッシュ検証

- main `28b24c6` 上の承認済み35ファイルを対象に、現行0.90.8の入力660件と発行EXE、先行0.90.2の標準回帰896件・証跡鎖180件を照合。GitHub/AQUAの両mainは `28b24c6` で競合なし。未コミット変更を保持してfetchのみ行い、確認済み0.90.8を同じ版のまま通常commit/pushする。
- 標準117ファイルのうち、現行の保存/競合/翻訳2ファイル14件と、影響しない25ファイル103件は対象ソース・試験・依存・環境と成功証跡の一致により再利用。設定カタログ/ナビゲーションの推移的な参照先、ソース/レイアウト境界、最終配布物の参照先を含む90ファイルを追加実行し、**785/785件、fail/skip 0**。新規6件を含む必要回帰全体は **117ファイル・902/902件**。試験ごとの実行/再利用の一覧と判断は `.artifacts/commit-validation-command-triggers-0908/plan.json` に記録した。
- LUNA/Windows x64/Node24.22.1/pnpm12.10.1、同一lockfile/toolchainを確認。発行済み0.90.8の型検査・build/publish、固定EXEの統合一覧17群/共通移動・フィルター12群、隔離smoke、ホバー/通常時の画像とbundle照合を入力hashと合わせて再利用。GUI・build・publishは繰り返していない。先行する未解決の発行阻害指摘はなく、今回の製品追加変更もない。
- 発行EXEは **0.90.8 / 170,681,326 bytes / SHA256 `3f81d75338a200316876b88e7808606649405fc9c4d5abf90a8ee1f4178b5bc4`** を保持。追加試験は終了済みで、今回の追加GUIフォルダーと削除対象はない。検証後の変更は本記録だけとし、stage/作業ファイル一致と `git write-tree`、commit tree一致、両remoteのmainとcommit SHAの一致・cleanを照合して完了とする。結果は同証跡フォルダーの `validation.json`・`stage.json`・`commit.json`・`push.json` に残す。Release・実利用deployは対象外。
- 追従のチラつきについては読取り調査のみ実施。現在はscrollイベントからrAFで全コマンドのセル寸法を読み、transformを補正する方式。非同期スクロールとの時差が原因となる可能性があり、CSS stickyへ任せられるスクロール構造への見直しが対処候補。表だけの横スクロール枠がstickyの参照先になる現構造と両立させる設計が必要で、今回のコミットに追従方式の変更は含めない。実機での性能計測・対処の実装は未実施。

## 2026-10-26: 追加アイコンのホバー表示・入力フィルターのシンボル化 0.90.8

- 0.90.7の未コミット変更を保持し、統合一覧の追加アイコンはコマンド全体のホバーまたは内部フォーカスがあるときだけ表示するよう変更。非表示時はopacityとpointer-eventsを使い、32px角の操作領域・右横の縦3配置・Tab移動を保つ。ボタン自体のホバー/キーボードフォーカスがないときは枠と背景を透明にする。個別ボタンのホバー/フォーカスには共通のアクセント配色を使う。
- 入力の一時フィルターに、割り当て行と同じキー/マウス/タッチパッドのシンボルと入力内容を表示。「トリガー: マウスジェスチャー」などの接頭辞を画面から除き、完全な種類名と入力をtooltip・読み上げ用の名前・解除ボタンの名前へ残す。表示要素だけをrenderer内の一時状態へ渡し、入力ID・検索の判定・保存設定へ含めない。提供元/コマンド対象と従来一覧は既定の文字表示を継続する。
- 発行前レビューでホバーの単位、隠した操作の誤クリック防止とTab/Enterによる到達、取消後のフォーカス、配色と寸法、3種類のフィルター・解除操作、共通部品の任意表示への影響を確認し、阻害指摘なし。保存・公開API・実行基盤の変更がない通常パッチとして0.90.8へ更新。先行版との対象5ソース差分とホバー/通常時の画像も確認した。
- 固定Node24.22.1/pnpm12.10.1・同一lockfile/供給網検査で整形、型検査、build、frozen install、publish成功。関連2ファイルの保存/競合/翻訳試験は**14/14件、fail/skip 0**。最終固定EXEで統合一覧**17群**と従来の共通移動/フィルター**12群**、隔離smoke成功。明暗テーマでコマンド内の別割り当てへのホバー、別コマンドへ移動したときの非表示、切替前後の座標一致と透明な枠/背景、Tab/Enterと取消後フォーカスを確認。3種類のフィルターで入力文字・対応するSVGの一致・完全な名前・解除後フォーカスを確認した。画像取得は2描画フレーム待って状態と照合した。先行する追加/編集/削除確認/実行順・種類選択と一時フィルターの独立・1280/700pxのセル内追従と横移動・実再起動保存も成功。無関係な全回帰は再実行していない。
- **0.90.8 / 170,681,326 bytes / SHA256 `3f81d75338a200316876b88e7808606649405fc9c4d5abf90a8ee1f4178b5bc4`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連コード・翻訳・renderer計11ファイルを照合。固定GUI用コピー2本も同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)。証跡は`.artifacts/command-trigger-hover-20261026/`のレビュー・差分前ソース・各ログ・`bundle.json`・`validation.json`・入力hash。固定GUIは`.artifacts/command-triggers-ui-1792953239803/result.json`、`.artifacts/settings-hints-ui-1792953275852/result.json`、smokeは`.artifacts/smoke-1792953308124/smoke-result.json`。テスト用プロセスの終了を確認。今回の成功・先行版の再利用資料・診断資料を保持し、削除0件。物理入力・Windowsタッチパッド設定の書き込みは対象外。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: コマンドトリガーのアイコン・列幅・縦追加ボタン 0.90.7

- 0.90.6の未コミット変更を保持し、設定インデックスのコマンドトリガーを稲妻へ変更。共通コマンド一覧とカスタムコマンド一覧の公開マークを除去し、共通カタログで外部非公開と判定されたコマンドだけ南京錠を表示する。公開状態が不明な保存済みコマンドには付けない。実際の公開設定・権限・コマンド実行は変更しない。
- 統合一覧の条件文字を左寄せにし、ジェスチャー列の基本配分を24%から20%へ縮めて条件列へ割り当てた。コマンド単位の上下8pxは保ち、割り当て内部の上下余白だけ2pxへ縮小。32px角の操作領域を維持し、長い条件は必要な高さへ伸ばす。
- 追加アイコン3つを、コマンド名・IDの右横へ右寄せで縦に配置。間隔4px、各32px角とし、名前・ID・ボタン全体が同じセル内で追従する。割り当てが少ないコマンドにも縦3ボタンを収める高さを確保する。従来一覧の移動列は、増えていた4つの移動先が右余白内へ収まる幅へ調整した。
- 発行前レビューで共通カタログの真偽と不明状態、共通UIの影響範囲、文字の実座標、上下余白・操作サイズ、右横の縦配置と追従・フォーカス復帰を確認。GUIで見つかった従来移動列の幅不足を修正し、明暗/1280・760pxで再検証した。既存GUIの移動先数と件数位置の古い参照も現行仕様へ合わせ、禁止キーを含む実環境用fixtureをF8〜F11へ変更してから関連GUIを実行。阻害指摘なし。設定キー・保存ファイル・実行基盤の変更がない通常パッチとして0.90.7へ更新した。
- 固定Node24.22.1/pnpm12.10.1・同一lockfile/供給網検査で整形、型検査、build、frozen install、publish成功。保存/競合/翻訳の関連2ファイルは**14/14件、fail/skip 0**。最終固定EXEで統合一覧**15群**、共通の移動/公開表示/フィルター**12群**、従来一覧**8群**、隔離smoke成功。非公開/公開/不明の区別、条件文字の実左端、条件列と入力列の幅、24割り当ての内部余白と外側8px、右端の縦3ボタン、追加/編集/削除確認/実行順、行ホバー/フォーカス、セル内追従/横移動、明暗/狭幅、実再起動保存を確認した。UI変更の影響を受けない保存・入力基盤の全回帰は再実行していない。
- **0.90.7 / 170,668,768 bytes / SHA256 `e83449632e6bf6e1de6e64f3fe221d09e307de97b08e8b33258d6c092d9be318`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連コード・翻訳・renderer計11ファイルを照合。固定GUI用コピー3本も同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)と[共通一覧](docs/settings-list-editing.md)。証跡は`.artifacts/command-trigger-density-20261026/`のレビュー・ログ・`bundle.json`・`validation.json`・入力hash。固定GUIは`.artifacts/command-triggers-ui-1792951567312/result.json`、`.artifacts/settings-hints-ui-1792951625821/result.json`、`.artifacts/shortcuts-ui-1792951656901/result.json`、smokeは`.artifacts/smoke-1792951729285/smoke-result.json`。テスト用プロセスの終了を確認し、今回の成功・先行版の再利用資料・途中の診断資料を保持、削除0件。物理入力とWindowsタッチパッド設定の書き込みは対象外。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: ジェスチャー列・条件クリック編集・操作表示 0.90.6

- 0.90.5の未コミット変更を保持し、コマンドトリガーの見出しと列順を「コマンド」「ジェスチャー」「いつ・どこで」へ変更。条件の文字をクリックまたはEnterで押すと、対象割り当ての既存編集ダイアログを開く。適用時の保存・競合検査を共用し、閉じた後は条件ボタンへフォーカスを戻す。
- 編集・実行順・削除を最終列の右端へ配置。行のホバーまたは行内フォーカスがあるときに表示し、それ以外はopacityとpointer-eventsで隠す。領域とTab移動を残し、表示切替で周囲を動かさない。追加アイコンはコマンドIDの下へ移動し、コマンド名・ID・追加ボタンのまとまりが引き続きセル内で追従する。旧一覧の列名・操作表示・追加方法は変更しない。
- 発行前レビューで列と行の対応、条件の編集対象/保存/フォーカス復帰、非表示操作の誤クリック防止とキーボード到達、右端位置の維持、追加アイコンとIDの上下関係、既存一覧とセル内追従への影響を確認し、阻害指摘なし。保存キー・ファイル・実行基盤の変更がない通常パッチとして0.90.6へ更新。固定Node24.22.1/pnpm12.10.1・同一lockfile/供給網検査でfrozen install、整形、型検査、build、publish成功。保存/競合/翻訳の関連2ファイル**14/14件、fail/skip 0**。
- 最終固定EXEで統合一覧**14群**、従来一覧**8群**、隔離smoke成功。新たに条件文字のクリック/Enter、条件の変更・保存と復帰、Tabでの操作ボタン到達、非ホバー/非フォーカス時の非表示とクリック透過、ホバー/フォーカス時の表示、切替前後の座標一致、最終列右端、IDより下の追加ボタンを確認。先行する追加・編集・削除確認・同じ入力の実行順・条件/入力の分離・複数種類と一時フィルターの独立・1280/700pxの追従と横移動・明暗/3幅の旧画面・実再起動保存も成功した。表示比較は対象行を表示してからポインターだけを移動し、検査自身の自動スクロールを分離した。
- **0.90.6 / 170,669,924 bytes / SHA256 `35d973c3307debc3b7759c097f270d370ef1b49b6824249e447d5b6dcdc90110`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連コード・翻訳・renderer計11ファイルを照合。GUI用コピー2本も同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 証跡は`.artifacts/command-trigger-actions-20261026/`のレビュー・ログ・`bundle.json`・`validation.json`・入力hash。固定GUIは`.artifacts/command-triggers-ui-1792950081163/result.json`、`.artifacts/shortcuts-ui-1792950152183/result.json`、smokeは`.artifacts/smoke-1792950289387/smoke-result.json`。テスト用プロセスの終了を確認。今回の成功資料と診断資料、先行版の再利用/検証資料を保持し削除0件。物理入力・実利用設定・Windowsタッチパッド設定の書き込みは対象外。本件のcommit/push/Release/実利用deployなし。

## 2026-10-26: コマンドトリガーの列分離・直接追加・セル内追従 0.90.5

- 0.90.4の未コミット変更を保持し、統合一覧を「コマンド」「いつ・どこで」「割り当て」の3列へ変更。条件と入力を行単位でそろえ、編集・実行順・削除は割り当て列内の右側へ配置した。各コマンドのキー・マウス・タッチの追加ボタンから、その種類の既存編集ダイアログを直接開く。種類選択と「次へ」の段階を除き、取消後は押した追加ボタンへフォーカスを戻す。
- 割り当ての種類名を既存SVGへ変更し、入力文字列は保持。サイズは`max(1cap, 16px)`、tooltipと操作ラベルには種類名を残す。種類フィルターもアイコンにし、一時フィルター行の左端へ移動。複数選択・一時フィルターとの独立性・全解除と復帰の既存動作は維持する。
- コマンド名・提供元・追加ボタン・IDを上寄せでまとめ、設定本文のスクロールに応じて固定フィルター下へ追従させる。横スクロールの祖先を持つため、本文とセルの実寸から移動量を求め、セルの下端へ収める。読み取りとtransform更新を分けてrAFで調整し、ResizeObserver/MutationObserverとイベントを破棄時に回収する。従来一覧は既定の列・追加ボタンを使い、追従を有効にしない。保存・実行・入力認識・設定キーと保存ファイルの変更はない通常のパッチ更新。
- 発行前レビューで条件列と操作の対応、型別追加の初期scope、フォーカス復帰、セル上下端・横移動・狭幅、アイコンの識別と読み上げ、従来一覧への影響を確認し、阻害指摘なし。不要になった種類選択ダイアログ用のapplyLabel拡張も除去した。固定Node24.22.1/pnpm12.10.1、同じlockfile・供給網検査でfrozen install、整形、型検査、build、publish成功。保存・競合・翻訳の関連2ファイルは**14/14件、fail/skip 0**。保存/実行基盤に後続変更がないため、前段の無関係な回帰は再実行していない。
- 最終固定EXEで統合一覧**13群**と従来一覧**8群**、隔離smoke成功。追加した検査は3列順と条件分離、割り当て内操作、種類別の一発追加、アイコンの名前/最小寸法、一時フィルター行の左端、1280/700pxでの追従・セル下端停止・横スクロール・リサイズ・自然位置への復帰、追従中の追加クリックと取消後フォーカス。既存の保存・削除確認・順序・明暗/3幅・再起動も維持した。従来GUIの位置検査は共通セル内のラッパー追加に合わせて対象を`.binding-value-cell .muted`で特定し、同じ左端一致の検査を継続する。
- **0.90.5 / 170,684,500 bytes / SHA256 `74a0860c7c0743b1df7ef72e83fb8bae0a3588517ab7230b09b6c1a40c02869b`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連コード・翻訳・renderer計11ファイルを照合。2本のGUI用コピーも同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)。証跡は`.artifacts/command-trigger-layout-20261026/`のレビュー・各ログ・`bundle.json`・`validation.json`・入力hash。最終GUIは`.artifacts/command-triggers-ui-1792947336844/result.json`、`.artifacts/shortcuts-ui-1792947430066/result.json`、smokeは`.artifacts/smoke-1792947563354/smoke-result.json`。今回のテスト用プロセスの終了を確認。新設一覧GUIは開発ビルド3回/portable2回の成功を保持し、各実行方式の直近3回以内。失敗診断・先行版の再利用資料も保持し、削除0件。
- 物理入力・実利用設定・Windowsタッチパッド設定の書き込みは対象外。ブラウザ判定共有化、入力単位の実行方式、割り当て別exe除外などは次の段階。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: コマンドトリガーの統合一覧 0.90.4

- クリーンなmainで追跡先へ`pull --ff-only`し、最新であることを確認して着手。「コマンドトリガー」ページと開くコマンドを設定カタログへ追加。キー・マウス・タッチパッドを同じコマンド行に表示し、種類選択からの追加、既存の共通ダイアログによる編集・削除確認・同じ入力の実行順変更へ接続した。従来の3ページと一覧も保持する。
- 「キー・マウス・タッチ」は複数選択できる。入力・提供元などの一時フィルターを設定しても種類の選択を保持し、全種類OFFは0件、絞り込み解除は全種類ONへ戻す。画面移動をまたぐ保持や設定保存は追加しない。統合一覧には移動列を置かず、従来一覧からのコマンド指定移動は利用できる。共通一覧・ツールバー・モーダル・スクロール・翻訳基盤を使用した。
- ページの編集可能範囲は既存の`keybindings`、`gestures.bindings`、`touchpadGestures.bindings`のみ。表示IDに種類を含め、同じ保存済みIDが別の種類に存在しても分離する。表示だけでは保存配列を変更せず、タッチパッド接続用キーの二重表示も行わない。認識設定、ブラウザ判定、接続設定、条件判定、実行基盤、既存の保存キーとファイルは維持する。新しい保存項目・ファイルを追加しない通常変更として0.90.3へパッチ更新し、発行後の移動列・種類フィルターの追加要望を反映して最終版を0.90.4へ進めた。
- 発行前レビューで要件・表示IDの衝突・保存範囲・順序・外部更新との競合・入力停止とモーダルの寿命を確認。追加時の種類選択には、成功時に自動で閉じるSettingsDialogではなく共通BindingEditDialogを使用するよう修正。種類フィルターの解除も共通ツールバーに接続し、再検証した。最終の移動列除去・複数選択と一時フィルターの独立性を含め、発行阻害の未解決指摘なし。
- 固定Node24.22.1/pnpm12.10.1と同じlockfile・供給網検査でfrozen install、型検査、build、publish成功。関連13ファイルの単体試験は**139/139件、fail/skip 0**。表示専用投影、追加・編集・削除の保存先、同じIDの分離、保存順、外部変更の競合、ページの許可範囲、既存ページの存続を検証。最終のフィルター文言変更後は翻訳8件を再実行し、先行139件に含まれる残りの成功は、後続変更がrendererの表示・共通部品の任意propsのみで保存・実行モジュールに影響しないことから再利用した。標準全回帰896件の再実行は行っていない。
- 最終固定EXEで統合一覧**10群**（全種類・未割り当て・検索・提供元・複数選択と一時フィルターの切替・追加・編集・削除確認・同じ入力の順序・旧画面編集の反映・移動列なし・実再起動保存）と、従来一覧**8群**（条件・無効行・不明/互換コマンド・競合・入力記録・ドラッグ/キーによる順序・外部変更のマージと競合・明暗/3幅・再起動保存）成功。従来GUI試験に残っていた廃止済みの上部「実行順…」参照を現行の行ボタンへ更新し、空一覧は実行順の入口がないことを検査する形へ合わせた。製品の動作を旧テストへ戻す変更は行っていない。
- **0.90.4 / 170,676,267 bytes / SHA256 `31c8276424d5c1909a55abc481a6b6bbe66594cd06981ad68b05a6bdf4330be4`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連JS/翻訳/renderer計11ファイルを照合。GUI用コピー2本も同じhash。固定EXEの隔離smoke成功。ASAR検査はWindows内のパス正規化を修正して成功した。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)。証跡は`.artifacts/command-triggers-20261026/`の`review.json`・単体/発行/smokeログ・`bundle.json`・`validation.json`・入力hash。最終GUIは`.artifacts/command-triggers-ui-1792945290541/result.json`と`.artifacts/shortcuts-ui-1792945622278/result.json`。新設GUIの成功は直近3回以内で、解決済み失敗の診断資料と既存再利用資料も保持し削除0件。今回のテストプロファイルを参照するAppDock/Electron/Nodeプロセスの終了を確認した。
- 入力の物理操作、実利用の割り当て、Windowsタッチパッド設定の書き込みは未検証。ブラウザ判定共有化、入力単位の実行方式、割り当て別exe除外、旧一覧撤去と旧ページの改名は次の段階。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: Applet有効状態と管理表示順のMCP接続 0.90.5

- 専用worktree `AppDock.at365-mcp-settings-design`、追跡先のない`codex/mcp-settings-design`のcleanな`0627d35`から継続。現在のbranchを保ち、pull先の追加、main統合、push/Release/deployは行わない。既存のenabled/appletOrderへMCP adapterを追加する変更で、設定項目・保存ファイルの追加削除と破壊的変更を含まないため、発行済み0.90.4から**0.90.5**へパッチ更新した。
- 外部パッケージのapplet-common対象へenabledを接続。booleanの明示set、resettable=false、inherited=nullとし、組込み/collection子ページは共通対象へ含めない。AppletManagementの準備・対象検証をUI/既存コマンドと共用し、ready・同一Appletのbusy・起動/停止中・既定の有効状態と保存済みOFFを保持する。任意の内部呼出し、再起動、開始待ちの即時開始、導入・削除、保存先切替を設定APIへ追加しない。
- enabledは共有/PC専用の通常設定指定によらず既存の端末設定へ保存する。起動待ちやページ表示先との同時変更も同じ候補・検証・保存にまとめ、未編集の共有値、ローカルconfiguration、固有設定と暗号化情報を保持する。通常の設定通知で起動/停止/待機予約を再適用し、settingsSaved/effectVerified=falseは保存完了だけを表す。dryRunは保存・起動停止をせず、同値/再送で保存や再起動を繰り返さない。read + writeで使え、executeは追加条件にしない。
- 管理順序はkind=list/category=applet-management、id/nameが読取り専用、操作はreorderだけ、最大500行。共通の一覧基盤に所有対象ごとの対応操作を持たせ、targets.listとoperationSchemasへ同じ範囲を返し、未対応操作を計画前に拒否する。既存の宣言型/AI/TTS一覧のCRUDは維持する。
- 管理画面と同じmanagedApplets/reorderManagedAppletsを使い、共有appletOrderの管理対象位置だけを変更する。未導入/子ページ/組込みの保存位置と相互順序、未記録IDの補完、PC専用の有効状態を保持する。検出/起動順、入力割当の実行順とリボン配置へ流用しない。提供元の増減はSchema、保存順や値の変更はrevision/itemRefへ反映し、古い要求・不足/重複/偽造参照を拒否する。
- 発行前に所有処理の共用、非公開/秘密投影、設定/一覧の許可、原子的保存、適用境界、既存UIと必要回帰をレビューした。管理ownerを持たない既存構成で無関係な通常項目へguardが働かないよう修正し、既存の共通設定回帰を再実行。専用一覧の期待操作とGUIのswitch識別も整合し、阻害指摘なし。製品UI/CSSと8行の操作許可を変更していない。
- 固定依存install、型検査、本体/Default Shell build、関連標準回帰**70ファイル693/693件、fail/skip 0**が成功。新規所有adapter回帰12件は、dryRun/同値/再送/許可取消、既定ON/明示OFF、busy、同時項目の原子的検証、端末保存、管理対象の動的増減、対応操作制限、子/欠落/組込み位置、保存失敗と両ファイル保持を確認。以前の通常項目自動登録・一覧・秘密保護も同じ回帰で確認した。標準全体は未実行。
- 隔離source/最終固定EXEの実MCP・画面試験は各**32群**、固定EXE smokeも成功。enabledのdryRunでworkerを停止せず、MCP/UIの無効→有効で合計起動回数3、待機取消→再予約では未起動を確認した。管理順のMCP/UI相互反映、保存済み欠落IDの位置、共有/端末ファイル分離、古い要求の拒否、秘密bytes保持、execute OFFとtools/list不変を確認。実利用の設定/認証、OS登録や物理入力は変更していない。
- 最終**747入力**と参照するWebApplet/WallpaperSlideshow manifestのSHA256は、回帰前後・発行前後・固定試験後で一致。Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.402、Windows AMD64で実行した。整形は既存のsrc/scripts/tests範囲を確認し、package.jsonは版番号だけを変更。発行後は文書と証跡だけを追加した。
- publish.bat終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170699611 bytes / SHA256 `2adb7a54671fe1caa416eb3711e786fd3dc1d7b026773c2c6e69a0bdaad927ae`**。File/ProductVersion、feed版/size/hash、ASAR内package/同梱Default Shellと固定試験コピーを照合した。
- 正本は[設定API](docs/settings-api.md)、[設定基盤](docs/settings-foundation.md)、[Applet管理](docs/applet-management-settings-design.md)、[外部操作](docs/automation.md)。証跡は`.artifacts/mcp-settings-applet-management-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-applet-management-20261026/`。source=`mcp-settings-foundation-source-1792953636830`、固定EXE=`mcp-settings-foundation-portable-1792953892452`、smoke=`smoke-1792953926516`。
- 試験プロセス0。今回の成功profileはsource 2回/固定1回/smoke 1回で各方式の直近3回以内。過去の検証証跡/参照profile、失敗診断、固定ビルド出力と別作業を保持し、削除0件。初期診断はowner-initial.log（保存先切替fixtureのrevision不足）、owner-verified.log（optional管理ownerのguardと専用操作の期待値）、source-gui-initial.log（既存switchをcheckboxとした識別）に残し、最終回帰で解消を確認した。

## 2026-10-26: Applet共通設定の宣言共有とMCP接続 0.90.4

- cleanな`e781d4d`から専用worktree `AppDock.at365-mcp-settings-design`の`codex/mcp-settings-design`を継続。Applet共通の起動待ち時間とページ表示先を既存の固定6入口へ接続した。通常の共通項目も定義追加だけで公開できるよう、型/画面/検証/カタログ/JSON/保存を共通化。追跡先の追加、main統合、push/Release/deployは行わない。
- 正本を[src/shared/applet-common-settings.ts](src/shared/applet-common-settings.ts)のappletCommonSettingDeclarationsへ集約。boolean/number/string/selectの通常項目は同じ宣言から生成し、MCP専用の項目表を持たない。fromManifestの既定値と検証も共用する。automation省略時は公開、false/secret/localOnlyはMCPの名前/Schema/値/検索/更新から除外し、trueでも秘密を公開しない。起動/停止・認証・更新元等の所有処理は通常項目へ混ぜない。
- 共通設定は停止/無効の外部Appletも編集でき、組込みとcollection子ページは対象外。起動待ち時間は0～86,400の整数、表示先は現在のpagesから`page:<ID>`を生成してpage/windowを選択する。ドット入りIDをそのまま扱い、消えたページの指定と未編集の固有値を保持する。ページ/既定値/保存先の変更はSchemaへ反映し、古いSchema・cursor・値要求を拒否する。
- 現在の共有/PC専用設定から上書きを読み、同じ保存先で既定値set/resetを行う。PC専用編集で休眠中の共有値を変更せず、有効状態・更新元・固有設定・他ページと暗号化ファイルを保持。未対応のページ追加データを消すresetを拒否し、既定省略時も残る行にはparserが必要とするdisplayを保持して、両ファイルの再読込を確認した。read + writeを使い、execute許可を保存条件にしない。
- 既存の設定変更・worker schedule・Surface表示先変更へ接続。実行中workerを再起動せず、待機中は保存後に予定を再計算し、無効Appletを有効化しない。ページを明示的に開いた後のpage/window往復ではWebContentsと入力を保持する。探索/値取得/dryRunでページを開かず、dryRunでは保存/起動予定変更をしない。適用時点とeffectVerified=falseを公開する。
- 発行前に公開判定、型/共通宣言、通常入力の即時保存、共有/端末別の分離、既定継承、ページID/追加データ、worker/Surfaceの寿命と必要回帰をレビュー。追加データが残るページのdisplay既定省略を修正して再検証し、阻害指摘なし。UIは既存共通部品と見た目を保ち、共通項目の描画を宣言駆動へ置き換えた。保存先切替には検証用test-idだけを追加した。
- 固定依存install・型検査・本体/Default Shell build、最終の関連標準回帰**69ファイル681/681件、fail/skip 0**が成功。所有adapterは58件、今回の新規9件を含む。試験用宣言へのトグル/文字/選択/数値追加だけで探索・検証・検索/JSON・両保存先へ反映し、非公開3種類を除外することを確認。dryRun/無変更/再送、原子的失敗、外部競合/許可取消、ページ増減/既定変更、追加データ保持と再読込も検証した。標準全体は未実行。
- 隔離source/最終固定EXEの実MCP・画面試験は各**28群**、固定EXE smokeも成功。通常保存とUIの相互反映、PC専用への切替/旧Schema拒否/既定復帰、既存画面の入力保持、待機予定の再計算、worker起動回数1・無効/待機worker未起動、暗号化キーbytes保持、execute OFF、tools/list不変を確認。GUIの初期失敗は保存先の識別子、簡略MCP応答にない予定時刻の取得元、後続試験前の設定画面復帰を修正して解消し、診断ログを保持した。
- 最終**745入力**と参照するWebApplet/WallpaperSlideshow manifestのSHAは回帰前後・発行前後・固定試験後まで一致。整形は既存手順のsrc/scripts/testsを確認した。package.jsonはGit checkout時のCRLFを保ち、元版との差が版番号だけであることを別途照合した。発行後は関連文書と本記録だけを変更した。
- 既存の設定/保存ファイルと公開操作契約を保つadapter・共通化のため**0.90.4**へパッチ更新。publish.bat終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170688089 bytes / SHA256 `cec37d666a039069e8d74eda1d64fa65c09f5898cf3e64c6e95143d01cf1666d`**。File/ProductVersion、feed版/size/hash、ASAR内package/同梱Default Shell、固定試験コピーの一致を照合した。
- 正本は[設定API](docs/settings-api.md)、[設定基盤](docs/settings-foundation.md)、[Appletページ](docs/applet-pages.md)、[外部操作](docs/automation.md)。有効/無効・管理順序と他の専用adapterは後続。検証は隔離profile、合成した通常/非公開値と暗号化fixtureキー、loopback feedのみで、実利用の設定/認証・OS登録・物理入力を変更していない。
- 証跡は`.artifacts/mcp-settings-applet-common-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-applet-common-20261026/`。source=`mcp-settings-foundation-source-1792946169889`、固定EXE=`mcp-settings-foundation-portable-1792946601945`、smoke=`smoke-1792946629011`。試験プロセス0、今回の成功は方式ごとの直近3回以内。過去の再利用資料/診断/固定出力を保持し、削除0件。

## 2026-10-26: 最新mainのMCP設定worktreeへの統合 0.90.3

- cleanな`codex/mcp-settings-design`の`5064a09`へ、fetchで確認した最新`origin/main`=`28b24c6`を通常merge。mainの`6a3536c`/`28b24c6`によるリボン表示モードと一時グループ統合を取り込み、MCP設定の既存変更を保持した。追跡先の追加、primary main checkoutの変更、push/Release/deployは行わない。次の所有adapterは推薦のみとし、今回追加実装していない。
- 一時グループのribbon領域への統合により、現在のShellは6領域。共通const由来の型・MCP/UI候補生成と、mainの廃止領域判定・ribbonSchemaVersion 3を両立した。独立overlay.ribbon-groupをMCPへ出さず、保存済みの旧指定を保持して他領域だけを編集できることを専用回帰で確認。固定6入口の外側Schemaは変更しない。
- 競合4ファイルを整合した。shell.tsは共通定義からの導出を保ち、host.jsonは両方の翻訳キーを保持、VERIFICATIONは双方の記録を保持。package.jsonはmainの発行済み0.90.2から統合版**0.90.3**へパッチ更新。main側の設定変更/領域削除を超える設定項目・保存ファイルの追加削除はなく、新しいマイナー更新は行わない。
- 固定lockfile install、型検査、本体/Default Shell build、関連標準回帰**59ファイル616件＋表示境界4ファイル24件＝63ファイル640/640件、fail/skip 0**が成功。新しいリボン表示・group/Shell・ページ/モーダル・設定/MCP/保存/権限を対象とし、標準全体は未実行。Node24.22.1/pnpm12.10.1/Electron45.0.0を維持し、.NETのRibbonBadge fixtureをRelease buildした。
- 隔離sourceと最終固定EXEのMCP/GUIは各**24群**成功。実際の領域減少後もSchema/候補/値/set/reset、保存/再送/競合、無効提供元、既存AI/TTS/通知/更新/一覧と暗号化キー保持、tools/list不変を確認。固定EXEのリボングループ**7群**・リボン編集**6群**・smokeも成功。24項目の縦スクロールとEnd/Escape、領域位置、Node/.NETのbadge、実Window resizeでの閉鎖、追加/編集/コマンド実行/右クリック/無効化拒否/既定復帰/再起動を確認した。
- 追加GUIの古い試験前提を修正。24ページを1manifestへ宣言したfixtureを、既存10件上限を保った8ページ×3Appletへ変更した。Windowを本体URLで選び実寸の変化を検査し、統合後のpopup DOM、設定data-testid、実リボン背景を操作する。廃止されたdetails/summary/overlay.html/brand-markへの依存を除去した。操作・保存・実行回数の検査は維持し、製品コードや上限を緩めていない。失敗ログとprofileは診断証跡として保持した。
- 発行前レビューで型/翻訳/共有とPC専用保存、領域減少、既存MCPとの合成、版区分と回帰範囲を確認し、試験修正も再確認して阻害指摘なし。**743入力**と参照するWebApplet/WallpaperSlideshow manifestのSHAは最終標準回帰から発行まで一致。発行後の変更は上記GUIスクリプト2つと文書のみで、製品・640回帰・MCP/GUI入力は不変。成功を再利用し、変更したリボンGUIを再実行して最終差分/入力/EXE hashを照合した。
- publish.bat終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170684876 bytes / SHA256 `e09d5409ab9bd95ad12208f6a90529aa18cf607a77e1e2fe5fd4fb713fa814fa`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shell、固定試験の各コピーを照合した。実利用の設定・認証、Windows起動登録、実アカウントや物理入力への効果は今回の対象外。
- 証跡は`.artifacts/mcp-settings-main-merge-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-main-merge-20261026/`。source=`mcp-settings-foundation-source-1792941459646`、固定MCP=`mcp-settings-foundation-portable-1792941754267`、group=`ribbon-groups-ui-1792942233614`、編集=`ribbon-customization-ui-1792942702476`、smoke=`smoke-1792942752524`。試験プロセス終了を確認し、今回の成功は各方式の直近3回以内、過去の再利用資料/診断/固定出力は保持、削除0件。

## 2026-10-25: 領域の増減に追従するShell選択の共通MCP操作 0.88.11

- cleanな`fcb6751`から専用worktree `AppDock.at365-mcp-settings-design`の`codex/mcp-settings-design`を継続。Shell選択を既存の固定6入口へ接続した。追跡先は作成せず、mainへの統合・push・Release・実利用先deployは行わない。
- ShellRegion型と公開フィールドを同じshellRegionsから導出し、UI/MCPの候補判定をshellProviderCandidatesへ共通化。領域の追加/削除、提供元のview変更/消失、同名・停止/無効提供元を扱い、外側のツールSchemaは不変。候補の表示名・有効状態もschemaRevisionへ束縛し、古いSchema/cursor/再送を拒否する。増減はunit fixtureで模擬し、実製品の領域は既存7つを維持した。
- ドットを含む領域IDを平坦な保存キーとして扱い、指定した項目だけをPC専用settings-<端末名>.jsonへ保存。reset/既定値setで上書きを除去し、共有ファイル・他の端末・Applet設定・資格情報bytesを保持する。廃止/未知領域と消失提供元の保存指定は保持し、直接編集は現行領域/候補だけを許可。read + writeで保存し、execute・有効化・再試行を兼ねない。
- 発行前に動的投影、選択候補、保存先/既定省略、秘密と権限、Shell寿命と既存UIへの影響をレビュー。既存PC専用の上書き取得/リセット時rewriteへ接続し、試験の保存先前提と失敗注入先も修正した。初回回帰の失敗ログは保持し、全対象を再検証して阻害指摘なし。画面の見た目は保ち、候補判定の共有と検証用属性だけを変更した。
- 固定依存install・型検査・本体/Default Shell build、関連標準回帰**55ファイル584/584件、fail/skip 0**が成功。所有adapterは48件で、今回のShell7件を含む。追加/削除/再追加時の探索、未知キー/不正候補、dryRun/再送/無変更、外部競合/許可取消、保存失敗/原子性、PC専用/暗号化ファイルの保持、既存Registryのフォールバック/safe-shellを確認した。標準全体は未実行。
- 隔離sourceと最終固定EXEの実MCP/GUIは各**24群**、固定EXE smokeも成功。現在の7領域すべての指定、バー/リボンのready・bound、MCPと既存UIの相互反映、古い要求の拒否、無効Appletの指定保持と領域別Default Shell復帰、reset/継承、共有bytes/暗号化キー保持、execute OFF、tools/list不変を確認。Shell選択画面のスクリーンショットも確認した。既存の通知/AI/TTS/一覧/更新設定の検証も含む。
- 型検査/build/584回帰後の変更はGUI helperのスクリーンショット前スクロール1行だけ。標準試験と製品の入力に影響しないことを照合し、成功を再利用してsource/固定GUIを再実行した。最終**740入力**と参照するWebApplet/WallpaperSlideshow manifestのSHAは最終GUIから発行・固定試験まで一致し、詳細はcommit-validationのvalidation.jsonへ記録した。
- 設定項目/保存ファイルの追加・削除と公開操作契約の破壊を含まないadapter追加につき**0.88.11**へパッチ更新。publish.bat終了0。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170680316 bytes / SHA256 `3066b5cd3a9fc75c0a552724d40ea8e1fd423b2f427c775292004fb637279fae`**。Windows File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shell、隔離コピーと最終EXEを照合した。
- 正本は[設定API](docs/settings-api.md)、[Shell基盤](docs/shell-foundation.md)、[外部操作](docs/automation.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。実利用の設定/認証、実外部Shellパッケージ、新規Shell領域の実装、物理入力/OS効果は今回の検証対象外。起動等の残りの所有adapterは後続範囲。
- 証跡は`.artifacts/mcp-settings-shell-20261025/`、最終照合は`.artifacts/commit-validation-mcp-settings-shell-20261025/`。source=`mcp-settings-foundation-source-1792937818687`、固定EXE=`mcp-settings-foundation-portable-1792938084928`、smoke=`smoke-1792938109810`。発行後の変更は関連文書と本記録のみ。試験プロセス0、今回の成功は方式ごとの直近3回以内、過去の再利用資料/診断/固定出力は保持し、削除0件。

## 2026-10-25: 更新設定とApplet更新元の共通MCP操作 0.88.10

- cleanな`010845e`から、追跡先なしの`codex/mcp-settings-design`で本体の更新設定7項目と外部Appletごとの更新元adapterを実装。固定6入口のfields対象として取得・set/resetでき、外側のツール定義と8権限は維持した。mainの変更/統合と追跡先の設定は行わない。
- 本体は既存UpdateSettingsの既定値と共通カタログから通常フィールドを生成し、型・更新元の書式・整数0～3,600秒を既存validator/parseSettingsで検証する。GitHub、HTTP(S)、Windows絶対パス/UNC、空欄を受け付け、保存の検証で配布先のファイル読取り・通信を行わない。未登録キーと更新操作そのものは設定APIから受け付けない。
- Appletはmanifest更新元の継承、明示的な空文字による無効化、resetによる上書き解除を区別する。既定がない場合はdefault/valueを省略し、明示した無効化は後から既定が追加されても保持する。同名提供元の分離、既定変更時のSchema競合、提供元の除外/消失、停止・無効時の保存を確認。組込みとcollection子ページは更新対象外であり、固有設定・enabled・PC専用値を変更しない。
- 設定保存はread + write、更新チェック・インストールは既存の独立したexecute経路へ分離。About表示中の保存/ONで自動確認が再発火しないよう、既存UIの自動確認を各表示につき1回へ限定した。次に開いた時は従来の1時間間隔判定を使う。既存の予約済み起動時チェックが最新の対象/通知を参照することをレビューし、適用時点をnextStartupCheck、待ち時間をnextStart、更新元/同版許可をnextUpdateCheckとして公開する。
- 発行前に公開定義/保存先、継承/既定省略、秘密情報、設定と実行の分離、自動確認、外部競合/再送/失敗時の原子性をレビュー。起動時の適用時点を修正し、再検証した。GUI初期のAbout再表示後とApplet共通設定の折りたたみを試験側で開くよう修正。最終の阻害指摘なし。失敗ログは保持した。
- 固定依存install・整形/型検査・本体/Default Shell build、最終関連標準回帰**53ファイル559/559件、fail/skip 0**が成功。所有adapterの41件は今回の新規8件を含み、更新元書式、非公開/未登録情報、明示無効化、既定継承、停止提供元、device/資格情報bytes保持、無通信、保存失敗、競合と許可取消を検証。About・起動時確認・既存PortableUpdatesも対象とし、標準全体は未実行。739入力とWebApplet/WallpaperSlideshow参照manifestは最終回帰から発行までSHA一致。
- 隔離sourceと最終固定EXEの実MCP/GUIは各**21群**、固定EXE smokeも成功。MCP保存と本体/Applet既存UIの相互反映、空欄とreset、古い要求の拒否、暗号化キーbytes保持、更新execute OFFでの拒否、保存中の無通信を確認した。ループバックの既知feedへ次回About表示時だけmetadataを1回取得し、payload取得・適用を行わない。既存のAI/TTS/通知/一覧/動的候補/秘密除外/許可取消とtools/list不変も成功。
- 発行後にGUI試験だけを補強し、2描画フレーム後・画面遷移前にも要求0件を確認した。source/固定EXEの21群を再実行して成功。変更は`scripts/settings-update-gateway-checks.cjs`のみで、製品/標準回帰の依存入力と発行EXEは不変。前後739入力の差分を照合し、型検査/build・559回帰・smokeの成功を再利用した。全入力照合と試験ごとの影響判定はcommit-validationのvalidation.jsonへ記録した。
- 既存設定項目/保存ファイルと公開操作契約を保持する追加adapterとAbout動作修正のため**0.88.10**へパッチ更新。publish.bat終了0で.NET各Host/Updaterも発行。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170677589 bytes / SHA256 `e98f0c9f6a56718084a383bb60313d5b1f243c9b7a2bb4bb0c1f6059759b8cf3`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shell、隔離コピーと最終EXEを照合した。
- 正本は[設定API](docs/settings-api.md)、[更新](docs/updates.md)、[外部操作](docs/automation.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。起動/Shell等の専用adapterは後続。実利用の設定/認証・実配布元の更新取得/適用・helper交換/再起動・物理入力/OS効果は今回の対象外。push・Release・実利用先deployなし。
- 証跡は`.artifacts/mcp-settings-updates-20261025/`、最終照合は`.artifacts/commit-validation-mcp-settings-updates-20261025/`。最終source=`mcp-settings-foundation-source-1792935149475`、固定EXE=`mcp-settings-foundation-portable-1792935159831`、smoke=`smoke-1792935003324`。発行後は上記GUI確認追加と関連文書だけを変更。試験プロセス0、今回の成功は方式ごとの直近3回以内、以前の再利用資料/診断/固定出力は保持し、削除0件。

## 2026-10-25: TTS手動ボイス一覧の共通MCP操作 0.88.9

- cleanな`cf8c558`から、追跡先なしの`codex/mcp-settings-design`でTTS手動ボイス一覧の所有adapterを実装。固定6入口の探索・Schema・行取得とadd/update/remove/reorderへ接続し、外側のツール定義と8権限を維持した。read + writeで編集でき、useTts/executeを保存の追加条件にしない。mainの変更/統合、追跡先の設定は行わない。
- 既存parseTtsSettings・共有保存・通常の再適用へ接続。サーバーへ渡すボイスIDを明示入力し、ID/nameを部分編集できる。UUIDを生成せず、itemRefはスナップショットの位置とrevisionへ束縛する。名前省略はIDで補完し、明示した空の名前、IDの大文字小文字/前後空白、同名行を保持。重複ID/空白だけのID/既存の文字列長違反を拒否する。
- 既存1,000件上限に合わせ、所有サービスのmaxItemsを全件reorderのデータSchemaにも反映。宣言型一覧64行、AI接続8行の制約と要求64KiB/応答256KiBを維持する。1,000件を100件ずつ取得し、全itemRefを含む実MCP要求が64KiB以内で保存できることを確認した。固定入口の変更やツール更新は必要としない。
- 一覧編集は既定ボイス・通知の指定・取得方式・URL/モデルを自動変更しない。最後の候補を削除した場合は空配列の共有上書きを省略する。暗号化ファイルの操作、ボイス取得通信、生成・再生を行わず、実サービスのmanual候補読取りへ編集後の一覧が反映されることを、秘密読取り/通信/再生を失敗させるfixtureで確認した。
- 発行前に公開ID/列、型/上限、既存JSON編集、保存先/既定省略、秘密情報、固定入口/権限、競合・再送・無変更・一部失敗をレビューし、阻害指摘なし。固定依存install・整形検査・型検査・本体/Default Shell build、初期関連75件と最終関連標準回帰**50ファイル512/512件、fail/skip 0**が成功した。所有adapterの33件には今回の新規8件を含む。標準回帰全体は未実行。738入力と参照するWebApplet/WallpaperSlideshow manifestは回帰・発行前後のSHAが一致した。
- 隔離sourceと最終固定EXEの実MCP/GUIは各**18群**、固定EXE smokeも成功。手動一覧のdryRun/追加/再送、ID編集、JSON画面との編集往復、同名行の順序、既定候補の削除後の参照保持、1,000件の取得/全件並べ替え/上限拒否、空一覧の省略を確認。隔離UIが生成したTTS暗号化キーのbytesは一覧操作前後で同一。既存のAI/通知/宣言型一覧/動的候補/秘密除外/許可取消とtools/list不変も成功した。
- 既存設定項目/保存ファイルと公開操作契約を保持する追加adapterのため**0.88.9**へパッチ更新。publish.bat終了0で.NET各Host/Updaterも発行。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170694224 bytes / SHA256 `7841d39a6e70225467dfa733cf966ab7882af84eddd71ef0af08a057c639caee`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shellと隔離コピーを照合した。
- 正本は[設定API](docs/settings-api.md)、[TTS](docs/tts-design.md)、[外部操作](docs/automation.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。起動/更新等の所有adapterは後続。実利用の設定/認証・実TTSサーバー・生成/音声再生・物理入力/OS効果は対象外。push・Release・実利用先deployなし。
- 完全ログ・入力/環境・レビュー・成果物は`.artifacts/mcp-settings-tts-list-20261025/`、最終照合は`.artifacts/commit-validation-mcp-settings-tts-list-20261025/`。source=`mcp-settings-foundation-source-1792932373979`、固定EXE=`mcp-settings-foundation-portable-1792932742473`、smoke=`smoke-1792932764574`。source GUI後の変更は関連文書のみ、発行後も本記録だけ。試験プロセス0を確認し、今回の成功は方式ごとの直近3回以内、以前の再利用資料/診断/固定出力は保持、削除0件。

## 2026-10-25: AI接続一覧の共通MCP操作 0.88.8

- cleanな`c5133ad`から、追跡先なしの`codex/mcp-settings-design`で次の所有サービス単位を実装。AI接続をlist対象として探索・取得し、固定6入口のadd/update/remove/reorderから操作できる。外側のツールSchemaと権限は変更せず、read + writeで保存できる。mainの変更・統合と追跡先の設定は行わない。
- ID生成、preset別初期値、名前/URLの正規化、8件上限、接続の検証を既存所有サービスへ接続。ローカルUIとMCPで最初の登録時の既定選択と既定接続削除時の解除を共有する。並べ替えはIDと表示順だけを使い、既定・生成優先度を変えない。既存fields対象の任意値resetも保持する。
- 共通一覧へ所有サービス用の行生成/確定、上限、削除可否、行ごとの書込み可否を追加し、SchemaのmaxItemsとitemsのwritableKeysへ反映。宣言型一覧は既存経路を維持する。正規化後の値をプレビューへ返し、無変更時は無書込み。秘密付き行の削除・URL/認証方式変更とキー必須の新規接続をLOCAL_ACTION_REQUIREDで拒否し、通常編集・追加・削除・並べ替えで暗号化ファイルを変更しない。保護判定は復号せず、破損/読取拒否も保護ありとして扱う。
- 発行前に公開列/ID、既存UIと所有サービス、許可と固定入口、外部競合/原子的保存、秘密の改訂と保存直前の再検査をレビュー。行の内容をschemaRevisionへ含めると保存要求の再送を拒否する問題を修正し、秘密の改訂は値のrevisionへ束縛した。初期の型推論を修正し、版更新後に依存メタデータを固定lockfileで再照合。阻害指摘なし。失敗ログも証跡へ保持した。
- 固定依存のinstall、整形検査、型検査、本体/Default Shell build、関連標準回帰**50ファイル504/504件、fail/skip 0**が成功。新規11件を含む所有adapterの25件で追加/削除/順序、同名行、部分編集、既定解除、8件上限、無書込み/再送、競合/許可取消、失敗時の無保存、復号0と暗号化bytes維持、計画後に追加された秘密の保存直前拒否を確認した。製品/試験/依存/ビルド等737入力とWebApplet/WallpaperSlideshowの参照manifestは検証・発行前後のSHAが一致。標準回帰全体は未実行。
- 隔離sourceと最終固定EXEの実MCP/GUIは各**15群**、固定EXE smokeも成功。新しい一覧の追加/再送、同名IDの区別、MCPと既存UIの編集往復、表示順、既定の解除、ローカル追加/削除ダイアログ、秘密付き行の操作拒否と暗号化bytes維持を確認した。接続・行・値が変わってもtools/listの名前と引数Schemaは不変。既存の通知・TTS・宣言型一覧・動的候補・秘密除外・許可取消も成功した。
- 既存の設定項目/保存ファイルと公開操作契約を保持する追加adapterのため**0.88.8**へパッチ更新。publish.bat終了0で.NET各Host/Updaterも発行。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170683454 bytes / SHA256 `36d59d4196291dbed3ed1debbfe66d01f99d62c0dee0b61a34d8d8e7f15c07a2`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shellと隔離コピーを照合した。
- 正本は[設定API](docs/settings-api.md)、[AI](docs/ai.md)、[外部操作](docs/automation.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。TTS手動ボイス一覧、起動/更新等の専用adapterは後続。実AI/TTSサーバーの接続・生成・音声再生、実利用の設定/認証、物理入力/OS効果は対象外。push・Release・実利用先deployなし。
- 完全ログ・前後入力・環境・レビューと成果物は`.artifacts/mcp-settings-ai-list-20261025/`、最終照合は`.artifacts/commit-validation-mcp-settings-ai-list-20261025/`。source=`mcp-settings-foundation-source-1792931183933`、固定EXE=`mcp-settings-foundation-portable-1792931411051`、smoke=`smoke-1792931430708`。発行後の変更は関連文書と本記録のみ。試験プロセス0を確認し、今回の成功は方式ごとの直近3回以内、以前の再利用資料/失敗診断/固定出力は保持、削除0件。

## 2026-10-25: 通知・AI/TTS通常値のMCP所有adapter 0.88.7

- `codex/mcp-settings-design`のcleanな`5bddccc`から、次の所有サービス単位を実装。追跡先なしの専用worktreeを維持し、mainへの統合・追跡先変更を行わない。既存の固定6入口へ通知種類別/共通音声、AI共通/既存接続、TTS通常値のfields対象を追加し、外側のツールSchemaと8権限は維持した。
- 所有サービスの既存parser・AI接続検証・通知編集・共有保存/再適用へ接続。read + writeだけで更新でき、useAi/useTts/executeを設定保存の条件にしない。生成・試聴・モデル/ボイス取得・接続試験を兼ねず、AI接続の追加/削除/順序とTTS手動一覧は今回の対象外。任意のJSONパスや保存ファイル全体は公開しない。
- 暗号化情報はSchema/値/プレビューへ含めず、保護判定は復号しないメタデータ読取りで行う。暗号化ファイルの破損・読取拒否も保護ありとし、秘密付きURL/認証方式と、新たにキーを必要とする認証方式への変更をローカル操作へ制限。通常値の更新でAI/TTSの暗号化ファイルのbytesを保持する。秘密の改訂は公開revisionの内部HMACに束縛し、生のkeyRevisionは返さない。
- 通知の必須/許可先・固定寿命・整数/nullの表示時間を共通検証し、指定フィールドのresetで何も残らなくなった行は既存UIの編集経路でも除去する。未導入提供元・他の通知行を保持し、停止中の通知提供元を起動しない。音声はresetでTTSへ継承。AI接続の必須値はinherited=nullとし、temperature等の任意値はresetで除去する。明示的な名前編集だけUIと同じtrimを行い、別項目の更新で既存の名前を正規化しない。
- 発行前に公開投影、認証の結び付け、原子的保存/外部競合、継承、既存UIとSDKへの影響をレビュー。読取拒否を「秘密なし」と誤認しない処理、新しいBearer認証への切替防止、明示編集だけの名前正規化を確認・修正した。初期型検査のRecord型推論と、compact保存で省略されるnotificationPreferencesを扱うGUI fixtureを修正し再検証。最終の阻害指摘なし。
- 固定lockfileのinstall・型検査・本体/Default Shell build、関連標準回帰**50ファイル493/493件、fail/skip 0**が成功。通知・AI/TTS・設定MCP/API・一覧・共有/端末別保存・権限・既存編集を対象とし、標準全体は未実行。14件の専用回帰で復号0、dryRun/無変更の無書込み、認証保護、Unicode上限、所有項目の網羅、reset・競合・停止/同名提供元を確認。699入力と参照するWebApplet/WallpaperSlideshow manifestの前後SHAが一致した。
- 隔離sourceと最終固定EXEの実MCP/GUIは各**11群**、固定EXE smokeも成功。AI/TTSのMCP更新と既存UI編集の相互反映、ローカルで暗号化したfixtureキーのbytes保持と外部の接続先/認証変更拒否、通知の上書き解除と音声継承を確認した。キーの登録は隔離UIからだけ行い、実利用の認証・設定は変更しない。既存の一覧・動的候補・秘密除外・許可取消とtools/list不変も確認した。
- 設定キー/保存ファイルの追加・削除と既存公開APIの破壊を含まない追加adapterにつき**0.88.7**へパッチ更新。publish.bat終了0で.NET各Host/Updaterも発行。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170690725 bytes / SHA256 `c93e295463c0f60d2ff0946fd8c641264c267b16acbed4656a128c08da569ca4`**。Windows File/ProductVersion、feedの版・size/hash、ASARのpackage/同梱Default Shell、隔離コピーを照合した。
- 正本は[設定API](docs/settings-api.md)、[AI](docs/ai.md)、[TTS](docs/tts-design.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。実AI/TTSサーバーへの接続・生成・音声再生、実アカウント、物理入力/OS効果は今回の検証対象外。main逆統合・push・Release・実利用先deployなし。
- 証跡は`.artifacts/mcp-settings-services-20261025/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-services-20261025/`。source=`mcp-settings-foundation-source-1792928814460`、固定EXE=`mcp-settings-foundation-portable-1792929245003`、smoke=`smoke-1792929263669`。後続変更は関連文書と本記録だけ。試験プロセスの終了を確認し、成功/失敗診断と過去の再利用証跡を保持、削除0件。

## 2026-10-25: MCPの宣言型一覧と動的候補 0.88.6

- main `cc0a1fe`を取り込んだ`f1d3334`から、専用worktree `AppDock.at365-mcp-settings-design`の次の実装単位を完成。既存の固定6入口の外側Schemaを増やさず、宣言型object-listの探索・Schema・公開列・行参照とadd/update/remove/reorderへ対応した。動的selectは既存runtime候補、Web名簿の選択は所有元だけの既存parserによる読取りへ接続した。
- itemRefを主体・target・Schema・値のrevision・行ID/位置へ束縛。同名行とIDなし一覧、保存後/再起動後/他主体の古い参照、全件並べ替え、重複操作と構造操作の混在、応答上限前の保存拒否を確認。ID列は読取り専用で新規行だけUUID生成し、IDなし一覧へ保存IDを追加しない。指定列だけを既存行へマージし、非公開/未知列、未編集の入れ子・別名・旧数値selectとJSON文字列の無変更時表現を保持する。
- 親の非公開指定、秘密/localOnly、未対応列と重なるpropertyPath/aliases、IDの別名経由の書換えを除外。保護値を持つ行の削除はLOCAL_ACTION_REQUIRED。汎用の一覧reset/全体置換と画像参照編集は公開しない。既存のread + write、暗号化情報保護、再送と旧API/他Appletの契約を維持した。
- 発行前レビューで、Web行の検証がRemotePageServiceの生成とsession整理を起こす経路を読取り専用へ修正し、既存serviceの処理中ガードは保持。候補取得・検証前後の名簿/セッションファイル不変を確認した。旧JSON文字列の無変更時再出力、非公開保存パスとIDの重なりも修正・検証した。0.88.5発行後の追加確認で、同名ルート動的設定の候補が固定の一覧列へ混ざる問題を再現。dynamic宣言だけがruntime候補を使うよう修正し、0.88.6へ進めて全関連検証を再実行した。未解決指摘なし。
- 最終版の固定依存install・型検査・本体/Default Shell build・関連標準回帰**37ファイル354/354件、fail/skip 0**が成功。WebApplet/WallpaperSlideshowの参照manifestは前後SHA一致、製品・試験・依存/ビルドの696入力も前後一致。標準回帰全体は未実行。初期の未宣言キーのエラー期待値とGUI fixtureの最低ホスト版不足は試験を修正し、失敗記録を保持して再実行した。
- 隔離sourceと最終固定EXEの専用GUI/MCPは各**8群**成功。実SDKで接続後に一覧・提供元・通常設定を追加してもtools/list不変のまま探索・保存でき、実Node Appletの候補も取得・変更できた。実アプリで一覧の追加・部分編集・削除・並べ替え、MCP編集と既存ダイアログ編集の相互反映、未知値/秘密の保持、許可取消・再送拒否を確認。通常のPC専用設定に加え、宣言型ページ一覧のenabledだけを変えても共有ファイルが不変であることを単体試験で確認した。最終固定EXEのsmokeも成功。
- 設定キー/保存ファイルの増減や既存APIの破壊を含まない追加機能。mainの0.88.4から0.88.5を発行後に追加修正したため、最終版は**0.88.6**。publish.bat終了0、.NET各Host/Updaterも発行。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170682302 bytes / SHA256 `2a07d82687fe4b25ba095c9c027f23c117b327bbb9439604899b0846a8442add`**。EXEのFile/ProductVersion、feedの版・size/hash、ASAR内package/同梱Default Shell版、各隔離コピーのhashを照合した。
- 正本は[設定API](docs/settings-api.md)と[拡張設計](docs/mcp-settings-design.md)。通知・起動・AI/TTS等の専用adapter、画像参照とアカウントの寿命操作は次段階。実利用の設定・鍵・Cookie・外部接続・物理入力・実機効果は試験対象外。mainへの逆統合・push・Release・実利用先deployは行わない。
- 完全ログ・レビュー・入力/成果物・環境と失敗記録は`.artifacts/mcp-settings-lists-20261025/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-lists-20261025/`。最終source=`mcp-settings-foundation-source-1792922979730`、固定EXE=`mcp-settings-foundation-portable-1792923230222`、smoke=`smoke-1792923246981`。後続変更は関連文書だけ。試験プロセス終了を確認し、今回成功と失敗診断・過去の再利用証跡を保持、削除0件。

## 2026-10-25: MCP設定worktreeへmainの最新を統合

- 利用者の指定に従い、cleanな`codex/mcp-settings-design`の`bc9d404`へorigin/main `cc0a1fe`を通常merge。fetch後のlocal mainとorigin/mainは一致し、main checkoutもclean。版は新しい0.88.4を採用し、検証記録は両方を保持。コードの自動統合箇所と関連定義を確認した。
- 固定lockfileのinstall、型検査、本体/Default Shell build、設定MCP/API/保存/カタログとジェスチャー・待機表示・翻訳の関連12ファイル**140/140件、fail/skip 0**が成功。690入力hashの前後一致を確認。証跡は`.artifacts/mcp-settings-lists-20261025/`のmerge-start/merge、inputs-merge-before/after、各完全ログとmerge-commit。以降の一覧実装前の統合確認であり、この時点の新規発行・main変更・pushは行わない。

## 2026-10-26: 一時リボングループ0.90.2のコミット・プッシュ検証

- main `6a3536c` 上の承認済み35ファイルを対象に、実装時の最終入力779件・証跡のSHA256を照合した。GitHub/AQUAの両mainは親の `cc0a1fe` で競合なし。dirtyのためpull/stashは行わずfetchのみ実施。今回のcommitと、先行する未pushの `6a3536c` を通常pushする。製品の追加変更・版更新・再発行は行わず、確認済み0.90.2を維持する。
- 標準116ファイルは、統合時11ファイル89件（backend71件と、最終版で確認した表示関連18件）、影響のない基準版76ファイル583件の成功を、対象コード・試験・依存・環境と証跡鎖の一致で再利用。Shell領域一覧/設定カタログ/提供元解決の影響先、manifest/API/設定/モーダルの読取り、最終生成物を使う6試験を含む未確認29ファイルを追加実行し、224/224件成功。合計 **116ファイル・896/896件、fail/skip 0**。基準版895件からは、退役した一時Shell指定/view/要件と旧描画契約のfallbackを確認する1件だけ増えている。再利用・追加実行の一覧と依存関係の判断は `plan.json` に記録した。
- LUNA/Windows x64/Node24.22.1/pnpm12.10.1・lockfile/toolchainの一致を確認。0.90.0以降の製品差分は一時グループPanel/CSSと版のみで、最終版の上下配置・親寸法・操作順GUI、同一Shell/既存native本文/幅遅延/パレットのGUI、型検査/build/publish/smoke成功を入力・発行物hashと合わせて再利用した。今回は成功済みGUIやbuildを繰り返していない。
- 発行EXEは **0.90.2 / 170,678,066 bytes / SHA256 `83c8c15a04c05e32b3f627dcdd5c3b3d52dfd751cc84a6b22935801bd25a6a22`** のまま。既存レビューに未解決の阻害指摘なし。最終検証後の追記は本記録だけで、stage内容と作業ファイルの一致、検証済みstage treeとcommit treeの一致を確認する。結果の正本は `.artifacts/commit-validation-ribbon-0902/` の入力一覧・完全log/終了コード・再利用照合・`validation.json` / `stage.json` / `commit.json` / `push.json`。
- 追加試験は終了済み。今回の追加GUIフォルダーと削除対象はなく、過去の再利用/診断資料を保持する。両remoteのmainとcommit SHAの一致、作業ツリーcleanまで確認して完了とする。Release・実利用deployは行わない。

## 2026-10-25: 上向きの一時グループで親ボタンを末尾へ配置 0.90.2

- 0.90.1の未コミット変更を保持し、上向きに展開する場合は子一覧を上、親ボタンを一番下に配置するよう変更。下向きは親を先頭に維持する。下に収まれば下向き、上に収まれば上向き、どちらにも収まらなければ広い側を選んでスクロールする。制約を受けないグループ内容の実高から方向/最大高/位置を計算し、親の元の位置・幅・高さを保つ。子の保存順は変えず、DOM順・読み上げ順・上下/Home/End/Tabの移動順を見た目と一致させた。
- 上向きの色バーの接続部は子一覧の下へ移し、親と子の8px間隔と左2pxバーを保持。方向と位置の確定後に表示・初期フォーカスを行い、上向きの長い一覧は末尾へスクロールして親と近い実行可能な子を見せる。下向きは先頭の実行可能な子を使う。初期フォーカス枠は引き続き隠し、キーボード操作後は表示する。設定・保存・Shell契約・コントローラー/実行経路の変更なし。通常修正として0.90.2へパッチ更新。
- 発行前レビューで配置/計測の依存、親のアンカー寸法、色線、フォーカスと操作順、スクロールと既存保存への影響を確認し阻害指摘なし。固定Node24.22.1/pnpm12.10.1、同一lockfile/供給網検査でfrozen install・整形・型検査・build成功。表示関連3ファイル18/18、fail/skip 0。ソース/最終固定EXEで上/下×compact/expanded×100/125/150%の12条件を確認し、親のy/幅/高さ、DOM順、色バー/8px接続、初期枠なし、親クリック閉鎖が一致した。追加の長い上/下一覧で、初期スクロール・近い子へのフォーカス・無効行スキップ・Home/End/上下/Tab・Escape復帰・末尾コマンド選択を確認した。
- publish成功。0.90.2のFile/ProductVersion、feed、ASAR本体/Default Shell版・契約3・旧専用view不在、Default Shell同梱内容、size/hashを照合し、最終固定EXEの隔離smoke成功。170,678,066 bytes、SHA256 `83c8c15a04c05e32b3f627dcdd5c3b3d52dfd751cc84a6b22935801bd25a6a22`。発行先 `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。入力/環境/fixture/完全ログ/レビュー/最終照合は `.artifacts/ribbon-direction-0902/`。実アカウントと物理予約キーは未確認。本件のcommit/push/Release/deployなし。
- 後片付けは削除0件。今回のGUI/smoke profileを参照するプロセス0件を通常ユーザー権限のCIMで確認。直近成功3件以内・最終証跡・過去の再利用/診断資料を保持し、削除対象はなかった。詳細は `cleanup.json`。

## 2026-10-25: 一時展開時の親ボタン寸法を固定 0.90.1

- 0.90.0の未コミット変更を保持し、一時グループを開くと親ボタンが狭く見える報告に対応。旧固定EXEでcompact/expanded・表示倍率100/125/150%を測定し、親の幅がそれぞれ4px/2px/約0.667px縮むことを再現した。高さとSVGの実寸は同じで、スクロールバーの予約幅が通常リボンの右余白と異なるため、親ボタンとアイコン/開閉記号の間隔が変わっていた。
- 一時グループの幅と親の高さを、既存の検証済みsource anchorの実寸へ合わせ、パーセントのmax-widthで縮めないようにした。ネイティブの縦スクロールバーは既存右余白内の6pxにし、安定したgutterとスクロール操作を保つ。通常リボン・アイコン部品・描画契約・設定/保存/実行経路は変更しない。通常修正として0.90.1へパッチ更新。発行前レビューで要件・既存操作・可変倍率・アンカー境界・同梱内容を確認し阻害指摘なし。
- 固定Node24.22.1/pnpm12.10.1と同一lockfile/供給網検査を維持し、frozen install・整形・型検査・build成功。表示関連3ファイル18/18、fail/skip 0。ソースと最終固定EXEでcompact/expanded×100/125/150%の6条件を比較し、親の幅/高さ・SVGの幅/高さの差はすべて0、DPRも一致。さらに一時グループの既存GUI各7群で、色バーと8px接続・初期フォーカス枠なし/キーボード枠・1項目/長い縦リスト・横はみ出しなし・親子操作/閉鎖・本文probeId・Shell統合を確認した。変更のないbackend/描画同期/パレットの成功は繰り返していない。
- publish成功。最終0.90.1のFile/ProductVersion、feed、ASAR本体/Default Shell版・契約3・旧専用view不在、Default Shell同梱内容・size/hashを照合し、隔離smoke成功。170,670,964 bytes、SHA256 `a5c02f8e95122cfa2e940135e025a6af35c04bfd426a57d15c8e8fe96db1bfe9`。発行先 `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。旧固定0.90.0のcopy/hash・比較寸法・入力/環境/fixture/ログ/レビュー/最終照合は `.artifacts/ribbon-size-0901/`。実アカウントと物理予約キーは未確認。本件のcommit/push/Release/deployなし。
- 後片付けは削除0件。今回の比較/GUI/smoke profileを参照するプロセス0件を通常ユーザー権限のCIMで確認。直近成功3件以内・旧版比較・最終証跡・過去の再利用/診断資料を保持し、削除対象はなかった。詳細は `cleanup.json`。

## 2026-10-25: 一時グループの親子表示とリボンShellへの統合 0.90.0

- 0.89.4の未コミット変更を保持し、一時表示も親ボタンの下に子を並べる構造へ変更。親と子を持続的と共通の `.ribbon-group` / `.ribbon-children` で描画し、親と子の8px間隔、左2pxのグループ色バーと接続部、アイコン位置・行高・名前・バッジを統一した。親ボタンを押すと閉じる。初期フォーカスは最初の実行可能な子へ置くが枠は表示せず、上下/Home/End/Tabで操作した時は通常のフォーカス表示を復帰する。外側クリック消費、Escape、本文のWebContents/session保持と実行時の再照合は継続。外周の影も除去した。
- 独立した `overlay.ribbon-group` Shell領域・設定欄・個別の提供元解決/再試行/visible要件/view選択を廃止し、公開領域を6件へ整理。旧指定・旧view・旧要件は不活性な互換データとして保持し、動作には使用しない。設定カタログ・翻訳・領域状態・own-stateにも専用項目は返さない。リボンの実際の接続中の提供元と同じ `ribbon` HTMLへ、既存の共通overlay APIで一時表示を渡す。独立した復旧先を持たず、失効/故障時は閉じてリボン全体の復旧を使う。表示中のribbon visible要件は有効。一時表示の内容と寿命は既存OverlayHost/RibbonGroupSessionが所有する。
- 同じHTMLで通常リボンと一時表示を扱う描画契約 `shell.ribbonSchemaVersion: 3` を導入し、Default Shellと追加Shellは同じAPI/起動経路を使用。通常のRibbonViewモデル・外部取得はschema 1/2を維持する。旧描画契約はリボン全体をDefaultへ戻し、他の領域指定を維持する。設定項目・公開領域の削除を含むため0.90.0へマイナー更新。新しい保存キー・ファイルの追加削除なし。repo AGENTSと機能文書の領域数・現行契約を整合させた。A:直下のAGENTSは変更していない。
- 発行前レビューで要件一致、設定/互換データ、同じ提供元・入口、破棄/再送防止、フォーカスと共有描画への影響を確認し阻害指摘なし。frozen install・整形・型検査・build成功。関連11ファイル89/89、fail/skip 0。退役した指定/view/要件が動作せず、旧契約2はfallbackし3は有効、他領域・設定編集は保つことを検証した。
- ソース/最終固定EXEのGUI各7群で、明1280/暗900/明720、56/200px、親の下8px・色バー接続・同じアイコン位置、初期枠なし/キーボード移動後の枠、無効行スキップと親/子の移動、1項目102pxの親子パネル・親クリック閉鎖、縦overflow、本文probeId保持、外側クリック消費・選択/resize/scroll取消を確認。追加Shellでも通常リボンと一時表示が同じHTML URL/提供元で動き、旧専用指定/viewを残しても無視されること、設定・状態が6領域で専用欄なしを確認した。ソース/最終固定EXEのnative幅遅延比較はアイコン中心28px・実幅200pxのラベル保持/56pxで非表示を確認。共通OverlayApp切り出しの影響先として最終固定EXEのコマンドパレットを1群追加し、別入口での描画・検索・Escape閉鎖を確認。既存全体GUI runnerのcontract/領域数/検索先も更新したが、本件は必要箇所に絞ったGUIを使用した。
- publish成功。0.90.0のFile/ProductVersion、feed、ASAR本体/Default Shell版・描画契約3・旧専用view不在、変更main JS/共通型とDefault Shell同梱物・size/hashを照合し、最終固定EXEの隔離smoke成功。170,681,062 bytes、SHA256 `4d23ec157581b4a84ae7b6143b3b4c581574a221528e668346fa05dda3af1719`。発行先 `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。入力・環境・fixture・完全ログ・コマンド・レビュー・最終照合は `.artifacts/ribbon-integrated-0900/`。実Gmail/Wallpaperアカウントと物理予約キーは未確認。本件のcommit/push/Release/deployなし。
- 後片付けは削除0件。今回のGUI・幅遅延比較・パレット・smoke profileを参照するプロセス0件を通常ユーザー権限のCIMで確認。直近成功3件以内・最終証跡・過去の再利用資料/診断profileを保持し、削除対象はなかった。結果は `cleanup.json`。変更した既存一時グループGUI runnerの `node --check` も成功した。

## 2026-10-25: 一時リボングループをリボン上の縦表示へ統一 0.89.4

- main `6a3536c` のclean状態から追跡先へ `pull --ff-only`（Already up to date）を確認して実装。一時グループを元のリボン領域へ同じ幅で縦に重ねる表示へ変更。ダイアログ風の外周枠・丸み・大きな影・横並び・左右スクロールボタンを除去し、細い右境界と控えめな影にした。元のグループ位置から開き、上下端に収まるよう補正する。長いリストは縦スクロールする。通常リボンと共通の `ribbon-items.css`・`RibbonIcon` を使い、24pxアイコン枠・40px行・左位置・余白・名前・バッジ・画像を揃えた。表示ラベルは実際のSurface幅に対するcontainer queryで切り替える。
- 一時表示は既存の `overlay.ribbon-group` とOverlayHost/RibbonGroupSessionを継続使用し、追加のShell領域・専用APIは設けていない。個別指定がなければ解決済みのリボンShellへ継承し、当該viewが未提供/故障ならDefault Shellへ戻す。保存済みの個別指定は保持。「表示」の既存選択欄へ「リボンのShellに従う」を表示し、選択時は当該map entryだけを解除する。新しい設定項目・保存キー・ファイルの追加削除なし。hostが検証したnativeリボン矩形からhost CSS座標の任意 `content.viewport` と `displayMode` を公開モデルへ追加し、従来Shellが追加フィールドを無視できる互換性を保持した。0.89.3から通常修正の0.89.4へパッチ更新。
- 発行前レビューで操作/描画/寿命・公開境界・設定/保存・影響先を確認。コンパクト幅のスクロールバーでバッジ数字が欠ける箇所は、右余白内の固定gutterとアイコン寄りのバッジ位置で修正した。アイコン位置と通常行のpaddingは維持。継承中に設定欄がDefault表示になる問題は、上記の継承選択と即時解除で修正。修正後に阻害指摘なし。既存のGUI試験は縦配置・矩形幅・24ページの縦overflow・上下移動へ更新し、構文検査成功。旧全体GUI runnerは本件では再実行せず、変更箇所を隔離した専用GUIで確認した。
- 固定Node24.22.1/pnpm12.10.1・同一lockfile/供給網検査を維持し、frozen install・整形・型検査・build成功。最終ソースで関連10ファイル78/78、fail/skip 0。Shell継承/明示指定/未対応・無効/Default fallback・safe modeとviewport模型を検証。ソース/最終固定EXEのGUI各7群で、明1280/暗900/明720・56/200pxの幅、アイコン/行高/名前/バッジ、28項目の縦overflow、無効行のスキップ・上下/Home/End/Tab・Escape/フォーカス復帰、1項目52pxのパネル、共有設定を書かないこと、外側クリック消費・選択実行・スクロール/resize取消を確認。ローカルApplet本文のWebContents/probeIdを保持し、同じ公開APIを使う追加Shellの継承・明示override・設定UIからの解除も確認した。
- 折りたたみ回帰はnative setBoundsを遅延させる既存fixtureで確認。ソースと最終固定EXEは、model compactが先着しても実幅200pxの間はアイコン中心28pxとラベルを保持し、実幅56pxでのみラベルを隠す。バッジ位置のみの最終CSS変更はこの同期経路を変えず、最後の固定EXEでも再確認した。失敗した検証fixtureの即時close判定はIPC閉鎖待ちへ修正し、複製Shellのmanifestに最低ホスト版を明記。失敗ログ/診断profileを保持し、最終成功と区別した。
- publish成功。最終EXEのFile/ProductVersion・feed・ASAR本体/Default Shell版・変更したmain JSとDefault Shell同梱内容・size/SHA256を照合し、最終固定EXEの隔離smoke成功。0.89.4、170,688,474 bytes、SHA256 `be6d79806f01492af4295a6c9b00a0af3f9ad660233ab83c254b3915f0f944d0`。発行先は `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。入力/環境/fixture/コマンド/ログ/レビュー/ASAR比較/最終結果は `.artifacts/ribbon-temporary-0894/`。実Gmail/Wallpaperアカウント・物理予約キー・実利用先deployは未確認。本件のcommit/push/Releaseなし。
- 後片付けは削除0件。今回のsource/fixed GUI・遅延比較・smoke profileを参照するプロセス0件を通常ユーザー権限のCIMで確認した。直近3回の成功・現在の最終証跡・既存commitの再利用資料・失敗診断profileは保持し、削除対象はなかった。詳細は `cleanup.json`。

## 2026-10-25: リボン変更のコミット前確認・対象ページ候補の修正 0.89.3

- 確認済み0.89.2までの24ファイルをコミットするため、777入力・過去の標準892件・0.89.1関連68件・0.89.2関連18件とGUI/固定EXE証跡をhash照合。既存115試験ファイルは基準版と一致し、表示モードの新規試験3件を含む標準対象は116ファイル895件。依存先を追跡した追加78ファイル691件で690成功・1失敗となり、失敗コマンドの部分成功は再利用しない。証跡: `.artifacts/commit-validation-ribbon-0892/`。
- 失敗は入力条件の対象ページ候補に「表示モードの切り替え」が混入するもの。`hostShortcutPage`でthemeと同様に非ページの表示モード項目を除外し、既存の4ページ候補検査と無効対象検査へ接続。既存設定・保存ファイル・公開APIの追加削除なし。直前発行0.89.2から通常修正の0.89.3へパッチ更新した。
- 固定Node24.22.1/pnpm12.10.1、同一lockfile/供給網検査を維持。frozen install、整形、型検査、開発build成功。発行物依存の6ファイル53件を除く追加72ファイル638件を修正後に実行し、638成功・fail/skip 0。発行前ソースレビューで阻害指摘なし。入力/環境/コマンド/完全ログは `.artifacts/commit-validation-ribbon-0893/`。
- 自動承認レビューがローカルpublishを「配布EXE・更新情報の変更はコミットのみの依頼範囲を超える」として拒否した後、利用者からローカル発行・確認・コミットの明示許可を受けて実施。publish成功、最終0.89.3のFile/ProductVersion・feed・ASAR本体/Default Shell版と修正JS同梱・size/hashを照合。EXEは170,683,217 bytes、SHA256 ed383adf8840a9746d107bde575542f4bc0ca0f18bd02a362247e2ccc162667f。発行物依存6ファイル53件・最終固定EXEの明暗/3幅リボン整列GUI 2群・smoke成功。
- 0.89.1関連9ファイル68件と影響のない基準29ファイル136件を再利用し、修正後の638件・発行後の53件と合わせて標準116ファイル895/895、fail/skip 0を確認。0.89.2の折りたたみ遅延比較と0.89.1の再起動復元/native本文追従は対象コード不変を照合して再利用。確認済みのリボンの見た目は変更していない。検証後は文書追記のみ。stage/作業ファイルとcommit treeの一致は `.artifacts/commit-validation-ribbon-0893/stage.json`・`commit.json` に記録する。push/Release/deployなし。
- テスト出力は再利用証跡・直近成功・失敗/状態不明の保護対象として保持し、削除0件。今回のGUI/smoke profileを参照するプロセスは0件。CIMの制限環境でのアクセス拒否は同一読取を通常ユーザー権限で再確認して解消した。結果は `cleanup.json`。
- 一時グループは現状Default Shellの独立領域 `overlay.ribbon-group` に横並びで描画している。リボンと同じShellでの縦並び・リボン上への重ね表示は構造調査までで、製品コードへ未実装。

## 2026-10-25: リボンアイコンの横位置固定と折りたたみ描画の同期 0.89.2

- 0.89.1の未コミット変更を保持し、グループ子のインデントとレイアウト上の左borderを除去。グループ色の縦線は既存疑似要素の絶対配置left 0へ揃え、線がボタン幅/位置へ影響しないようにした。親の左右非対称paddingとcompact時の中央寄せも廃止し、親・子・通常項目を両モード共通の左paddingで固定した。グループ開閉とモード展開/折りたたみで横位置を変えない。
- 「文字が先に消え、広い領域の中央へアイコンが寄ってから幅が縮む」という報告に対応。Default Shell本体のラベルはDOMへ保持し、モードmodelのiconOnlyで先に取り除く代わりに、実際のnativeリボン幅に対するmedia queryで表示を切り替える。Native setBoundsだけを遅らせる隔離fixtureで旧固定0.89.1（SHA 4479fb79cb19399228b3bccf237088f712e7dfbd800fa4c9393e4e2327fbbb27）のアイコン移動/文字の先行非表示を再現。新ソース/最終固定EXEでは、折りたたみmodelが先着しても実幅200pxの間はアイコン中心28pxとラベル表示を保持し、実幅56pxになったときだけ文字が消えることを確認した。popupのラベル表示は従来どおりmodelのiconOnlyを使う。
- 表示方法のみの通常修正として0.89.2へパッチ更新。設定・保存ファイル・API・モード保存/項目編集・Applet本文の配置経路の追加変更なし。発行前レビューで固定位置、色線、文字とnative幅の同期、popup/アクセシブル名、レスポンシブと既存チェックを確認し阻害指摘なし。既存GUIの線色検査はborderから疑似要素へ、ラベル検査はDOM件数から可視状態へ変更し、廃止済み個別checkboxの期待も更新した。更新スクリプト2本はnode --checkで構文確認、古いGUIスクリプト全体は未再実行。
- 固定lockfile照合・整形・型検査・build・publish成功。appearance/localization/shell-boundariesの**3ファイル・18/18件、fail/skip 0**が成功。今回の親/子/通常アイコン計測GUIはソース/最終固定EXE各**2群成功**。明1280/暗900/明720で、compact/expandedと開閉前後の中心座標が一致し、色線・バッジ・幅56/200px・横はみ出しなしを確認し目視。遅延native幅の過渡状態検査は旧EXE/新source/新固定EXEそれぞれ成功（旧版は不具合の再現を成功条件とした診断）。恒久的な見た目比較試験は新設していない。前回の項目編集・状態保存・native本文追従は対象処理が同じため再実行していない。
- 最終EXEは**170,670,439 bytes / SHA256 b5a4f6af51dea10f3bde49673867e15a176d46edb947c2d394e9144261990d79**、A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exeへ0.89.2を発行。File/ProductVersion、feed版/size/hash、ASAR内package/Default Shell版、固定GUI/過渡検査/smokeコピーを照合しsmoke成功。source=ribbon-alignment-ui-1792929552006、fixed=ribbon-alignment-ui-1792929974780、旧過渡比較=ribbon-transition-ui-1792929464363、新固定過渡=ribbon-transition-ui-1792929991198、smoke=smoke-1792930005050。
- 証跡は .artifacts/ribbon-alignment-0892/ の完全log・入力SHA/環境・レビュー・fixture/計測JSON/画像・最終照合。検証後の変更は本記録のみ。今回成功のsource/portable各方式は3回以内で削除0件、旧EXE比較・失敗診断・前回機能の再利用証跡を保護。通常終了、外部Shell/実サービス、実利用データ、物理入力は新規検証していない。commit/push/Release/deployなし。

## 2026-10-25: リボン上端整理・切替項目編集・Applet本文の追従 0.89.1

- 未コミット0.89.0を保持し、リボン上端の装飾ロゴ/専用余白を除去、両モードの先頭項目を通常余白6pxから配置した。切替ボタンを安定ID ribbon-display-modeの通常builtin項目へ統合し、既定は下寄せ。リボン編集の共通操作で名前/画像・上寄せ/下寄せ・順序・表示/非表示・グループ配置を保存できる。未指定名はモード別の操作名、指定名は両モードに共用。独立した固定ボタンを重ねず、共通アイコンの左右chevronを表示する。既存itemOverrides/order/hidden/groupsだけを使用し、新しい設定キー/保存ファイルなしの通常追加修正として0.89.1へパッチ更新。
- GmailとWallpaperSlideshowの履歴で切替が正しく動かないとの報告を受け、共通Applet native Surfaceの配置経路を修正。ホストのShell/本文viewport用useLayoutEffectをモード変更にも接続し、ResizeObserverによる描画フレーム通知を待たず予約幅と本文の位置/幅を送る。ページ/Viewは再生成しない。ホストDOMのgetBoundingClientRectを読まないnative境界計測fixtureで、本文選択後のホストResizeObserver通知を抑制。旧固定0.89.0（SHA c989339af36644838d4ae7f9231e76197797e344a0cb5e9cb44b4c2210ea8591）ではexpanded時の本文との不整合を確認し、修正ソース/最終固定EXEではexpanded/compact/expandedすべてでShellと本文の境界・残幅が一致した。実Gmailのアカウント/通信と本番壁紙履歴は開かず、両者共通のnative表示経路の回帰として確認した。
- displayModeToggleは表示中の切替項目に対する互換metadataへ整理。通常項目としての実候補/hidden検査を使い、外部/旧schema 1にはactionIdを返さず無効化する。ローカルpopupに実際に配置された項目は、そのグループ候補の検査後に選択できる。既存の重複排除/epoch/PC専用モード保存と編集競合検査を維持。発行前に配置の既定値/明示override、ラベル、公開権限、ページ寿命、描画通知依存と狭幅をレビューし、未解決の阻害指摘なし。
- 固定lockfile照合・整形・型検査・build・publish成功。ribbon-display-mode/ribbon-groups/ribbon-customization/ribbon-commands/ui-presentation/applet-pages/appearance/localization/shell-boundariesの**9ファイル・68/68件、fail/skip 0**成功。追加unitは名前/上配置/非表示/グループ/外部非公開/正しいactionと非遷移を検証。fixtureは同期拒否の待機、モデル配信待ち、閉じたoverlayの正常破棄に合わせて修正し、全該当試験を再実行。恒久的な見た目比較試験は追加していない。
- ソース/最終固定EXEの隔離GUIは各**3群成功**、同一profileの再起動は各**2群成功**。明1280/暗900/明720で上端6px/ロゴなし・56/200px幅・名前/バッジ・ページ保持を計測/目視。切替項目の名前保存、上/下/一時グループへの移動、表示/非表示、popup選択、Enter/Space、再起動後の編集名/配置/モードを確認。native境界試験はソース/固定とも成功。source=ribbon-top-ui-1792928444192、fixed=ribbon-top-ui-1792928765338、native=ribbon-native-ui-1792928843975、比較旧EXE=ribbon-native-ui-1792928501737、smoke=smoke-1792928859332。
- 最終EXEは**170,673,511 bytes / SHA256 4479fb79cb19399228b3bccf237088f712e7dfbd800fa4c9393e4e2327fbbb27**、A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exeへ0.89.1を発行。File/ProductVersion、feed版/size/hash、ASAR内package/Default Shell版、GUI/native/smokeコピーを照合しsmoke成功。完全log/入力SHA/環境/レビュー/画像とnative計測/最終照合は .artifacts/ribbon-top-0891/。試験後は本記録だけ変更。
- 最新GUI、修正前後のnative比較、失敗診断と元機能の再利用証跡を保持。最新方式の直近分と比較に必要な資料を保護し削除0件。OSキー/ジェスチャー・外部サービス・実利用設定・通常終了は新規検証していない。commit/push/Release/deployなし。

## 2026-10-25: リボンの2モード切替と項目別表示設定の整理 0.89.0

- cleanなmain cc0a1feでpull --ff-only後、リボン下部の共通chevronボタンで「アイコンのみ」compact 56px／「アイコン＋名前」expanded 200pxを切り替える機能を実装。既定はcompact。展開時の名前は右側の1行・省略表示とし、tooltip/アクセシブル名を維持。グループのインデント・色の縦線・バッジと上下配置を保持し、本文とリボンの予約幅を共通ribbonDisplayWidth/既存viewport経路で連動させた。狭幅に残っていた68pxの固定ルールも共通変数へ修正した。上端の装飾アイコンは今回の変更対象に含めていない。
- 各項目/グループ/コマンドボタンの編集から「アイコンのみを表示」を除去。モードで全項目を統一し、旧iconOnlyやApplet提供値・表示名・配置・画像・コマンドIDは破棄/移行しない。描画モデルのiconOnlyは全体モードから導出し、グループ名空欄は既存の「グループ」を表示する。旧値のparse/外部編集契約は受理を継続。個別設定UIの廃止と全体モード追加のため0.88.4からマイナー更新。設定schema/保存ファイルの追加削除はない。
- RibbonStateが既存PC専用ribbon-state.jsonへdisplayModeとexpandedを一緒に原子的に保存する。旧ファイルはcompact扱い、書込み失敗時は公開状態・幅を保つ。schema 2へ任意のdisplayMode/displayModeToggleを追加し、Default Shellも追加Shellも共通UiPresentation.invoke経路を使用。操作はローカルリボン限定で、外部execute callbackとグループpopupからの切替を拒否、schema 1と外部モデルへ切替actionを公開しない。既存のepoch/session/requestId重複排除を維持。safe-shell中はcompact固定・切替無効。共有settings revisionと保存中入力を変更しない。
- 発行前レビューで、状態の正本/保存失敗、公開契約/権限境界、旧指定とグループ・画像・バッジ、全レスポンシブ規則、フォーカスとページ寿命を確認。狭幅の固定値を修正し再検証、mode矢印を共通Iconへ揃えて再検証。未解決の阻害指摘なし。固定lockfile照合・整形・型検査・build・publish成功。ribbon-display-mode/ribbon-groups/ribbon-customization/ribbon-commands/ui-presentation/shell-region/shell-boundaries/appearance/localizationの**9ファイル・77/77件、fail/skip 0**成功。新規2件は旧state/再起動/原子的な失敗、グループ状態の併存、全体投影、設定不変、操作ID、重複排除、外部/overlay拒否を検証。恒久的な見た目比較試験は新設していない。既存customization GUIの廃止checkbox期待を除去した。
- ソース/最終固定EXEの隔離GUI各**2群成功**、各同一profileの新規プロセス再起動も**1群成功**、pageerrorなし。明1280/暗900/明720で56/200pxの本体/Shell幅・名前/省略・バッジ・32px以上の操作対象・横はみ出しなしを計測/目視。持続グループの開閉・子ページ選択、一時popupとEscape、3種の編集画面で旧checkboxなし/取消、settings.ribbon不変、Enter/Spaceとfocus維持を確認。ローカルNode Appletの実WebContentsとprobeIdがモード切替後も同じであること、再起動後の200px復元を確認した。閉じるとWebContentsが破棄されるoverlayの待機は、本体overlay状態に合わせてfixtureを修正した。
- 最終EXEは**170,676,521 bytes / SHA256 c989339af36644838d4ae7f9231e76197797e344a0cb5e9cb44b4c2210ea8591**、A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exeへ0.89.0を発行。File/ProductVersion、feed版/size/hash、ASAR内package/Default Shell版、固定GUI/smokeコピーを照合しsmoke成功。source=ribbon-modes-ui-1792922032291、portable=ribbon-modes-ui-1792922238397、smoke=smoke-1792922303022。完全log・入力SHA/環境・レビュー・fixtureと画像/計測・最終照合は .artifacts/ribbon-modes-0890/。最終検証後の変更は本記録のみ。
- 完了時に方式別の今回成功を確認し、source成功2件/portable成功1件とstate試験の直近分は3回以内で削除0。失敗診断・固定helper・参照証跡も保持。外部Shell実装/実サービス、実利用データ、物理入力と通常終了は未検証。キー割り当てとジェスチャーは無効、外部ネットワークへ接続しないfixtureを使用した。commit/push/Release/deployなし。

## 2026-10-25: デスクトップ前面化修正0.88.4のコミット検証

- main `85cc8c3` 上の8ファイルを実装時の最終入力一覧と照合し、無関係な差分・stageなしを確認。dirtyのためpull/stashは行わずfetchだけ実施し、GitHub/AQUAの両mainが `85cc8c3` に一致することとGit名義を確認した。製品修正は追加せず **0.88.4** と発行物を維持し、再発行なし。
- 全115個のNode試験、main/shared/renderer/SDK/Runtime・依存/固定ツール/ビルド定義を前回892件の封印入力と照合した。差分はnative GestureTargetの前面化、実入力fixture/GUI runner、packageの版、文書だけ。現在の関連7ファイル **93件**と、影響のない前回102ファイル **746件**の成功を証跡鎖と入力hashで再利用した。最終native/updater生成物を使うall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesの6ファイル **53/53件**を追加実行し、標準 **115ファイル・892/892、fail/skip 0** を確認。Node 24.22.1/pnpm 12.10.1/.NET SDK 10.0.402/Runtime 10.0.13とLUNA/OS/lockfile/toolchainの一致も確認した。
- 変更部分と影響先をレビューし、対象限定・取消・前面確認・入力キューの解放、4検査の保持とメニュー後片付け、専用GUIのデスクトップ/通常操作に阻害指摘なし。実装時の **230/230実入力**、通知13項目・模擬キー状態10項目、型検査/build/publish、固定EXE GUI44コマンドとソース限定12コマンドを、ソース・スクリプト・EXE/コピー/DLL hashの一致で再利用した。今回は物理入力やGUIを再実行していない。
- 発行EXEは **0.88.4 / 170,673,988 bytes / SHA256 aa50211de386070f24e7becddd999385baa1607b4405eb44c9c44d195cf7d70c** のまま。証跡は `.artifacts/commit-validation-desktop-0884/` のplan/入力一覧・再利用照合、53件完全log/終了コード、環境、stage/commit tree・両remote照合。既存資料を保護し、追加GUIフォルダーと削除対象なし。stage内容と作業ファイルの一致、commit treeと検証済みstage treeの一致を確認してcommit/pushする。結果の正本は同フォルダーの `commit.json` / `push.json`。Release/実利用deployは行わない。

## 2026-10-25: デスクトップ実入力4失敗の調査・修正 0.88.4

- main `85cc8c3` / cleanを確認してpull --ff-only成功（更新なし）。前項までのデスクトップ4失敗を調査した。製品ソースを変更せずInputHostとfixtureの隔離コピーへ診断出力を追加し、入力先・前面対象・選択候補・前面化結果・取消を追跡した。最初のdesktop条件ではProgman/Explorerを正しく選び、候補22件と修飾キー抑止なしを確認したが、通常と入力キュー接続後のSetForegroundWindowがともにfalseで開始を取り消していた。その右クリック復元でExplorerの `#32768` メニューが開き、次のexe条件はデスクトップではなくメニュー上で実行されていた。
- `GestureTarget.TryActivate` の既存worker内の補助経路へBringWindowToTopを追加し、表示順とアクティブ状態を更新してから前面化を要求する。開始時の対象/source・取消・可視性の検査、実前面対象の待機、入力キューの必ずの解除を維持し、フック内の待機・新たなキー送信・常時最前面化は追加しない。本体を開く既存の前面化経路と同じ活性化手順へ揃えた。仕様参照はMicrosoftの[BringWindowToTop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-bringwindowtotop)と[GetGUIThreadInfo](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getguithreadinfo)。設定・保存ファイル・公開API・SDK/Runtime契約は不変で、通常修正の **0.88.4** へパッチ更新。
- テストは4項目とも維持した。各ケースの前後でGetGUIThreadInfoからデスクトップ所有のメニューだけを閉じ、操作開始点がデスクトップであることを2項目追加。座標の位置でメニューを探す中間版ではメニューを見落とし、旧0.88.3の実入力で225成功/5失敗（追加した開始点検査を含む）だった。最終版はメニュー所有元で判定する。試験用Windowを前面化できない場合のGUI状態診断も追加した。
- 修正版InputHostで実入力 **230/230成功・失敗0**。従来の224成功とデスクトップ4項目、追加した開始点2項目がすべて成功した。1/2段階・取消・first/all/順序/重複除去・クリック/ホイール/キー・通常入力復元・除外・フォーカス変更・前面移動の既存検査を含む。記録は `fixed-full-input-complete.log`。型検査/build/native/helper build成功、関連Node7ファイル **93/93、fail/skip 0**、表示通知13項目と模擬キー状態10項目も成功。Pause/F13〜F24はOSへ送信・登録していない。全標準回帰は今回再実行していない。
- 実JS表示の試験へdesktop条件/explorer.exe条件を追加。非アクティブなデスクトップからの開始、1→2方向と候補更新、ウィンドウ中央指定での開始モニター中央への配置、元Windowが覆われないこと、解除時の保存順と表示終了を検査する。`--desktop-only` で2条件へ限定可能。通常4種類×明暗と合わせて10組40コマンド、描画終了後4コマンドの合計44件がソース/固定EXEで成功。限定モード12コマンドも成功。初回のfixtureはdesktop条件へprocessesを指定してschemaに拒否され、限定モードの後半はexe条件を残して失敗したため、既存schemaに合わせ、描画終了検査前にglobalへ戻して修正した。
- 途中の再試験は入力開始前のfixture前面化で停止した。前面Window=NULLを読み取り、入力desktopはDefault/対話セッションActiveであることを確認。画面確認ツールは環境エラーで起動不可だった。試行したcaptionクリックによる回避は撤回し、利用者がデスクトップをクリックした後、同じ前面化処理のまま限定GUIと発行EXE GUIが成功した。これらの開始前停止は製品テストの成功件数へ含めず、失敗log/profileを保持する。
- 発行前レビューで対象限定・取消・前面確認・入力キュー解放・既存UI/APIの維持を確認し、阻害指摘なし。`publish.bat` 終了0。発行EXEは **A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe / 0.88.4 / 170,673,988 bytes / SHA256 aa50211de386070f24e7becddd999385baa1607b4405eb44c9c44d195cf7d70c**。File/ProductVersion、update.jsonのsize/hash/版、ASARのpackage/Default Shell/全rendererと待機表示main/preload、同梱InputHostと開発用DLL、固定GUIコピーを照合した。InputHostは `a5cb18cd46541089dc453dacadd6b288affa708feed4105521eee74e583903ff`、ASARは `b0f96879cdc8779c847bea0336c112769baf0a7e86b162f6e0450924e22dbed9`。配布DLLの通知13項目も成功した。
- 最終固定EXE profileは `.artifacts/gesture-web-ui-1792920245161/`、ソース通常は `gesture-web-ui-1792918987645/`、限定は `gesture-web-ui-1792919962948/`。Explorerの候補4行と方向表示を目視した。証跡は `.artifacts/desktop-gesture-diagnosis/` の診断ソース/差分・比較/回帰/GUI/publish log、review、入力一覧・発行物/コピーhash・validation。診断プロセス終了を確認し、不要な自己完結runtime・bin/obj等6フォルダーを削除。診断DLLのhashと小さなDLLコピー、診断ソース、失敗資料、旧再利用証跡を保持し、今回の成功GUIは通常/限定/固定各1回で削除対象なし。混在DPI・UAC/ロック画面・性能は今回未検証。今回は未コミット、push/Release/実利用deployなし。

## 2026-10-25: JS待機表示の採用・ネイティブ画面の撤去 0.88.3

- 利用者が0.88.2の見た目と動作を確認し、JS方式の採用、不要なネイティブ画面の整理、commit/pushを依頼した。main `c7f51db` 上のJS試作を引き継ぎ、dirtyのためpull/stashなし。fetchと両push先の読み取りでGitHub/AQUAのmainが `26fdf3e` に一致すること、実効Git名義を確認した。今回のpushには前回の待機表示コミット `c7f51db` も含む。
- InputHostのGestureIndicator.xaml/コードビハインド/GestureIndicatorContentとGestureDisplay、WPF専用試験プロジェクトを削除した。GestureIndicatorNotificationsだけで表示モデルを通知し、ネイティブ画面の作成・初期化・配色値・Web/WPF切替を持たない。入力用Dispatcherと.NET/WPFランタイム依存は引き続き必要。プレビューと実表示は共通React/CSS、既存の4種類・サイズ固定・表示候補の選択は維持する。設定/保存ファイル/公開API・SDK/Runtime契約の追加削除はなく、通常修正のため **0.88.3** へパッチ更新。
- 起動失敗/描画プロセス終了時は表示を破棄し、共通ErrorReporterで `GESTURE_INDICATOR_UNAVAILABLE` と再起動案内を一度報告する。ネイティブ表示へ切り替える処理は撤去し、表示の寿命やテーマ変更で入力構成を再同期しない。描画障害後も入力認識とコマンド実行は続ける。発行前レビューでIPC送信元/main frame/URL、revision/sequenceと寸法境界、終了/接続断、表示通知専用キュー、入力フック/条件/実行順の保持を確認し、阻害指摘なし。
- 整形・最終型検査・本体/Default Shell/native/helper build・publish成功。最初のpnpm実行は版更新後の依存再照合要求で停止し、固定lockfileのinstallで解消（依存変更なし）。旧配色同期を期待した試験1件と実入力fixtureのWPF/UI Automation探索を通知検査へ移行した。関連5ファイル **41/41**、追加80ファイル **709/709**、前回から同じ入力・到達関係・証跡鎖を確認した30ファイル **142件**を再利用し、標準 **115ファイル・892/892、fail/skip 0**。Node 24.22.1/pnpm 12.10.1/.NET SDK 10.0.402/Runtime 10.0.13、lockfile/toolchainと既存locale値不変を照合した。
- 表示通知13項目と模擬キー状態10項目が成功。配布DLLを直接読む13項目も成功し、ネイティブWindow派生型・コンパイル済みWPF画面リソースの不在、revision/負座標/方向/候補順/予約行数/非表示/終了を確認。直接InputHostを使う実入力試験は表示通知へ移行し、**224成功・デスクトップ4失敗**。変更前InputHostの既存ログと、方向検査12行の名称変更を正規化した全PASS/FAIL行が完全一致した。4失敗を成功へ含めず、既知の未解消事項として保持する。Pause/F13〜F24はOS送信・登録していない。
- ソースと固定EXEの実マウスGUIが成功。4種類×明暗、1→2段階、候補1→4行、スリムピルのHWND矩形一致、透明/非アクティブ/クリック透過、古い/不正な寸法IPCの拒否、解放後の非表示、32コマンドの順序を確認。描画を意図的に停止した後も4コマンドを実行し、共通エラーログが1件だけであることを確認（合計36コマンド）。固定EXE profileは `.artifacts/gesture-web-ui-1792916936732/`。設定GUIも明暗×1280/900/700px・SettingsField・非表示時の値保持・保存/再起動後の割り当て/条件/順序保持に成功し、profileは `.artifacts/gestures-ui-1792916962105/`。最終のピルとカラー絵文字/4行の収まりを目視確認した。
- 発行EXEは **A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe / 0.88.3 / 170,683,580 bytes / SHA256 41ddebd3e56d504aff1fefa5c4a560d2799c284222f3518419e2e12861effa64**。File/ProductVersion、update.jsonの版/size/hash、ASAR内package/Default Shell/JS画面・preload・共通配色、全renderer出力と新規main出力、同梱InputHostを照合。InputHost DLLは `10d3da6bcc0db3f72795a34894077dfde5f5b622d562cd11520f4c2b9f4b76f4`、ASARは `50354d370066f1b163cf99fdc1907f75be21ad6f6f4e1a02a52daf738f2528ff`。固定GUIコピーと最終EXEも一致した。
- 証跡は `.artifacts/commit-validation-js-indicator-0883/`。plan/入力一覧・照合済み再利用鎖、全試験log/終了結果、review、物理入力の変更前比較、発行物hash、stage/commit/push照合を保存する。削除済みWPF試験のbin/objを整理し、終了を確認した今回のGUIと必要な旧証跡を保持する。混在DPI移動、UAC/ロック画面、性能/追加メモリは未検証。Release/実利用deployなし。
- push成功後に今回の `AppDock.at365-gesture-indicator` worktreeと不要な専用branchを削除する。開始点と23変更ファイルが当時の封印入力に一致し、未知の変更がないことを確認済み。旧入力23ファイルと0.88.0検証資料は `retired-worktree/`（manifest付き67ファイル）へ保管した。実際の削除/残存worktree/両remote先端の結果は同証跡フォルダーの `cleanup.json` / `push.json` を正本とし、MCP設定用worktreeは保持する。

## 2026-10-25: 待機表示のJS描画試作 0.88.2

- 0.88.1までの23ファイルをmainの `c7f51db36146b1d7b8c7d174d66c41f5c6efc9f6` へコミット済み（標準888件の照合は次項）。その後、利用者の指定で同じmain上にJS描画を試作した。今回の試作は未コミットで、push・Release・実利用deployなし。新しい永続設定・保存ファイル・公開APIはなく、パッチ更新 **0.88.2**。
- 入力フック・認識・表示候補の選択・コマンド実行はInputHostの既存経路を維持。表示モデルだけを容量1の専用通知キューで本体へ送り、透明・非アクティブ・マウス透過・タスクバー非表示の専用BrowserWindowで描画する。実表示とSettingsFieldのプレビューは同じReactコンポーネント/CSSを共用し、クラシックのカラー絵文字もChromiumで揃える。スリムピルの2方向分の幅と最大候補行数の予約を維持した。
- 発行前レビューで送信元/main frame/正確なURL、revision/sequence、寸法/文字数の境界、設定変更・接続断・終了時の非表示、描画障害からのWPF切替を確認した。sandbox/contextIsolation、隔離した非永続session、navigation/新規Window/permission拒否と共通配色preloadを接続。ロードとreadyの両方を含む3秒の起動上限、テーマ背景より強い透明指定、クラシックの4行収まりを修正して再検証した。入力SDKとAppletの接続契約は変更していない。
- 最終型検査・build・開発InputHost/helper build・publishが成功。関連12ファイルのNode回帰 **126/126、fail/skip 0**、その後追加した起動失敗/停止の切替試験を含む `gesture-indicator.test.cjs` **4/4** が成功（3件は126件と重複）。WPF表示とWeb通知の試験 **428項目成功**。試験した開発InputHost DLLと最終配布物のSHA256一致を確認した。全標準回帰は今回再実行していない。
- ソースGUIと固定EXEの隔離コピーで実マウス入力試験が成功。4種類×明暗の8組で1→2段階、候補1→4行、スリムピルのHWND矩形完全一致、透明背景、NOACTIVATE/TRANSPARENT/TOOLWINDOW、前面対象の維持、右解放後の非表示、32コマンドの保存順を確認した。別送信元・不正frame・古いsequence・過大寸法のIPCを拒否。描画プロセスを意図的に停止し、WPF設定の受付完了後にも4コマンドを実行（合計36件）できた。固定EXE profileは `.artifacts/gesture-web-ui-1792914973398/`。クラシックのカラー矢印と4行の収まり、スリムピルを目視確認した。
- 固定EXEの設定GUIも成功。SettingsFieldのgroup/title、4種類・明暗×1280/900/700px、透過・非表示時の値保持、保存/再起動後の割り当て・条件・順序保持を確認。profileは `.artifacts/gestures-ui-1792915064332/`。最初の固定EXE入力試験は最後の切替後実行だけ32件のままで失敗し、診断が不足して原因の断定はできない。試験側の固定250ms待ちを設定受付完了待ちへ置き換え、診断付き再試験と最終試験は成功した。製品の待機処理は追加せず、失敗log/profileも保持している。
- 発行先 **A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe**、**0.88.2 / 170,696,911 bytes / SHA256 eb2475b6eb092b733ce21d779a3bcab763a651da18ce9a585932e08403034c45**。File/ProductVersion、update.jsonの版/size/hash、ASAR内package/Default Shell/JS画面・専用preload・共通配色、ビルド出力と同梱InputHost、両GUIコピーと最終EXEのhashを照合。InputHost DLLは `45829464ca09bb81994f0cd762c1bd83cb4eca7e156c44742337d7c1916cbfda`、ASARは `18d63e3a02fbf5f791d5bf3d98bf874e21700fb695273b451aec85198dd4e3c8`。
- 証跡は `.artifacts/web-gesture-indicator-0882/` の型検査/回帰/起動切替/native/ソース・固定GUI/publish log、`artifacts.json`、`validation.json`。今回のJS GUI成功はソース3回・固定2回、設定GUI固定1回で各方式3回以内のため削除0件。今回の隔離プロセス終了を確認し、以前の再利用資料を保持した。Pause/F13〜F24はOS送信・登録していない。入力全回帰、既知のデスクトップ4項目、混在DPI移動、UAC/ロック画面、性能/追加メモリは今回未検証。0.88.0で変更前と一致したデスクトップ4失敗を今回の成功へ含めない。

## 2026-10-25: 待機表示0.88.1のコミット前検証

- main `26fdf3e` 上の今回の23ファイルを対象に、0.88.1の実装時入力SHAと全変更を照合。Git名義を確認し、別作業の差分・stageなしを確認した。製品内容と発行物は変更せず、版更新・再発行なし。JS描画への移行はこのコミットへ含めない。
- 標準回帰114ファイル・**888件、fail/skip 0**を確認した。今回の最終入力と一致する8ファイル・121件、影響のない30ファイル・142件を前回の検証済み885件の証跡鎖から再利用。設定既定値/カタログ/ジェスチャー管理に到達する依存関係とnative/updater生成物の利用先、renderer静的検査を選び、残り76ファイル・**625/625件**を追加実行した。前回標準からの試験件数増加はジェスチャーの3件だけ。SDK/依存/固定ツール/既存locale値は不変で、旧localeへ追加したキーによる既存文言変更はない。
- Node 24.22.1、pnpm 12.10.1、.NET SDK 10.0.402、Runtime 10.0.13、LUNA/Windows10.0.26300/x64とlockfileを照合。隔離テスト用Appletをビルドして追加回帰へ使用。最終WPF421項目、固定EXEの4種類・明暗/3幅・SettingsField・保存/再起動GUI、型検査/publishはソース・スクリプト・EXE/コピーhashを照合して再利用した。既存デスクトップ実入力4項目の失敗は0.88.0と変更前で一致する制限として保持し、成功件数へ含めない。
- EXEは **0.88.1 / 170,678,087 bytes / SHA256 a66a8f60851799f6964e04f468db67a9d5596b0d6d20183d57d2cfa2f09ae4cc** のまま。証跡は `.artifacts/commit-validation-gesture-indicator-0881/` のplan/入力一覧、環境、fixture build、625件完全log、再利用照合、stage/commitのtree。検証後は本記録だけ追記し、再利用資料と失敗診断を保持。push・Release・実利用deployなし。

## 2026-10-25: スリムピルの段階移動サイズ固定・プレビュー欄整備 0.88.1

- main上の未コミット変更を保持したまま追加修正。スリムピルは2方向分の幅と固定の文字行高を確保し、開始対象の移動候補に共通のfirst/all・コマンド重複除去を適用した最大表示行数（1〜4行）を予約する。同じ操作で1方向から2方向へ移るとき、コマンド名や表示件数が変わってもHWNDの大きさと文字領域の位置を変えない。1件だけの操作を一律に4行分の高さにはしない。
- プレビューは共通SettingsFieldのgroup「待機表示」・title「プレビュー」とし、wide指定を外して他の設定項目と同じ配置へ揃えた。スリムピルの見本も2方向分の幅・固定行高へ合わせた。クラシックの絵文字はChromiumのプレビューとWPFの実表示で色が異なる原因を確認し、依頼どおり今回の見た目変更からは除外した。新規設定・保存ファイル・公開APIの変更なしのためパッチ更新 **0.88.1**。
- 変更部分と影響先をレビューし、入力フック・認識・実行予約・条件判定を変更せず、表示用の最大行数算定だけを既存の選択処理へ接続していることを確認。指摘なし。既存のmain/shared/設定schema・依存/ビルド定義を変更していないため、前回の関連Node回帰121件と入力状態10項目の成功を再利用。型検査成功、publish.bat終了0（固定lockfile、.NET/renderer/updater/単一EXE/update.json）。commit・push・Release・実利用deployなし。
- WPF試験 **421項目成功**。1〜4行の予約ごとに1方向/2方向、短い/長い/混在文字列、件数変化と再表示を組み合わせ、ネイティブのウィンドウ矩形が完全一致し、文字の原点も不変であることを確認。共通選択のfirst/allを反映する予約行数も確認した。4種類・明暗・透過・画面端・非アクティブ表示等の既存271項目も含む。開発DLLと配布フォルダーのDLLを直接読み込む試験でそれぞれ成功。実測3840×2160/144 DPI。
- 発行EXEの隔離GUI試験成功。SettingsFieldのgroup/titleと標準配置、4種類の選択・透過・表示なしの保持、明暗×1280/900/700px、保存・プロセス再起動・エラーログなしを確認した。profileは `.artifacts/gestures-ui-1792911548688/`。Light/1280pxとDark/700pxの描画を目視確認し、欄の対応と枠内への収まりを確認した。
- 発行先 **A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe**、**0.88.1 / 170,678,087 bytes / SHA256 a66a8f60851799f6964e04f468db67a9d5596b0d6d20183d57d2cfa2f09ae4cc**。File/ProductVersion、update.json、ASAR内package/Default Shell/ジェスチャー制御コード、extraResourcesのDefault Shell/InputHost、GUIコピーと前後のEXE hashを照合。InputHost DLL SHA256 `6a8bb704df5826d6757ac41ecfd588fa76bd356a1ac1fd646d40590789258a44`。
- 証跡は `.artifacts/pill-stable-0881/`（`delta-review.json`、`typecheck.log`、`native-display.log`、`published-native-display.log`、両native-snapshots、`publish.log`、`artifacts.json`、`fixed-exe-ui.log`、`validation.json`）。今回の成功profileは3回以内のため削除なし。実入力の全回帰・混在DPI移動・全標準回帰は今回再実行していない。前回の実入力224成功と、変更前でも同じ4項目が失敗したデスクトップ検査の制限を引き続き保持し、今回の全成功には含めない。

## 2026-10-25: 待機表示をmainへ統合して0.88.0を発行

- 最新取得後のmainはworktreeの開始点 `26fdf3e` と一致し、作業ツリーはclean。前項の検証記録にある23ファイルをmainへ反映し、`inputs.json`の全SHA256と一致することを確認した。変更はmainの未コミット差分として保持し、worktreeの元データも保持した。commit・push・GitHub Release・実利用先deployは行っていない。
- 表示変更のレビューと関連121件・模擬キー10項目の成功は、同じ開始commit・全変更ソース・lockfile/ツール定義との一致で再利用。発行前の差分確認で追加の対応指摘なし。新しい実装変更はなく、未発行だった設定追加の版 **0.88.0** をそのまま発行した。`publish.bat`は終了0。依存検証、.NET/renderer/Default Shell/updater、単一EXEとupdate.jsonの生成を含む。未変更Appletの再発行・全体ZIP作成なし。
- 発行先は **A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe**、**0.88.0 / 170,685,537 bytes / SHA256 bc5f4a2884609c3f26ee6304b3e62f61bc6dbecc9a63da12d723286900e68353**。File/ProductVersion、update.jsonの版/size/hash、ASAR内package・Default Shell、extraResourcesのDefault Shellを照合した。ASAR内のジェスチャー制御コードとビルド出力、同梱InputHostと.NET出力のSHAも一致。InputHost DLL SHA256は `483d4a82761134c632f61d7d1edc3035f837039e191696d1814e10aee8bbbd71`。
- 発行フォルダー内のInputHost DLLを直接読み込むWPF試験 **271項目成功**、描画PNG20枚。4種類・明暗・背景透過・再利用時の中央配置・画面端・長い名前/複数コマンドを確認した。試験helperへ任意のDLL指定を追加し、製品コードは変更していない。今回の実測は3840×2160、144 DPI。
- 固定EXEの隔離コピーで `APPDOCK_GESTURE_INDICATOR_ONLY=1 dev.bat exec node scripts/gestures-ui-test.cjs --portable` 成功。4種類の設定/プレビュー、明暗×3幅、表示なしの値保持、保存・プロセス再起動後の保持を確認し、前後とコピーのEXE SHA一致を確認。profileは `.artifacts/gestures-ui-1792909842119/`。固定EXE smokeも成功し、copy SHA・EXE隣のsettings/data・登録画像・Default Shell起動・トレイ操作を確認。profileは `.artifacts/smoke-1792909896264/`。
- 前回開始できなかった実入力試験を今回は実行し、**224項目成功、デスクトップの4項目失敗**。1/2段階移動・解除時実行・表示/実行の一致・取消・クリック/ホイール/キー・通常入力復元・除外・前面化等の成功を確認した。失敗はdesktop/exe条件のデスクトップでの実行とwindow-center表示。今回の変更による回帰かを判別するため、HEAD `26fdf3e` の変更前InputHostを隔離ビルドして同じ試験を実行したところ、**224成功/同じ4失敗で、全PASS/FAIL行が完全一致**した。新規失敗は確認されていないが、4項目の実機成功を主張しない。Pause/F13〜F24のOS送信・登録を伴うモードは実行していない。混在DPIの複数モニター移動と全標準回帰は今回未実行。
- 証跡は `.artifacts/publish-gesture-indicator-0880/` の `integration.json`、`publish.log`、`artifacts.json`、`validation.json`、固定EXE GUI/smoke/native/実入力と変更前比較の各log。ASAR検査の先行失敗は検査スクリプトがWindowsの区切り文字を使っていなかったためで、`path.join`で修正して照合成功。今回の各成功profileは3件以内のため削除なし。失敗診断・変更前比較資料・以前の再利用用証跡を保持。

## 2026-10-25: マウスジェスチャー待機表示の選択実装（worktree・未発行）

- 対象は `A:\30.PROJECT\AppDock.at365-gesture-indicator`、branch `codex/gesture-indicator`、開始点 `26fdf3ebcec05d015743ea5cec4a7bcf7c09e0c0`。最新origin/mainを取得して独立worktreeを作成。元checkoutの変更を移動・破棄していない。設定 `indicatorStyle` 追加のためソース上の次期版は **0.88.0**。依頼によりmainへのマージ・通常publish・commit・push・Release・実利用deployを行わず停止した。配布EXE/update.jsonは今回作成していない。
- コンパクトカード（未指定時の既定）、スリムピル、リング、クラシックの4種類を実装。新3種は共通アクセントと明暗テーマ、図形の方向表示、背景だけの透過を使用。クラシックは既存の黒パネル・絵文字・全体透過を維持。設定選択・プレビュー・検索・ページJSON・リセット・公開ジェスチャー設定APIへ接続し、位置/表示なし/不透明度/既存割り当てを保持する。複数コマンドは最大3件と残件数、長い名前は省略表示。変更対象と影響先の読み取りレビューを行い、最終差分に対応が必要なP1/P2指摘なし。
- 固定lockfileの独立node_modulesを準備（既存 `.tools` だけjunction参照）。`dev.bat run typecheck`、`dev.bat run build`、開発用 `.artifacts/dotnet-host/` の.NETビルド成功。型検査は `typecheck-final.log`、最終rendererは `build-preview-final.log`、最終InputHostは `native-build-final.log`。これらは開発用生成物で、40.ARTIFACTへの製品発行ではない。
- 関連8ファイルのNode回帰 **121/121成功**：`gestures`、`gesture-commands`、`command-execution`、`settings-page`、`settings-defaults-reset`、`settings-commands`、`localization`、`appearance`。旧設定の補完、4種類と不正値、APIのdryRun/原子的保存、表示なしの値保持、native向けスタイル/共通配色/翻訳文言の同期、コマンドタイトル無変換を含む。`regression.log`参照。後続の変更はWPF表示とrenderer見本のみで、この回帰対象のロジックは不変。
- 入力フックを登録しない `tests/GestureIndicatorTests` の実WPF試験 **271項目成功**。5120×2160、144 DPI、PerMonitorV2で、4種類×明暗、透過0.1/0.45/1、文字不透明、方向図形、複数/長い/改行入りタイトル、非アクティブ/クリック透過フラグ、画面端、再利用時の寸法と中央位置を確認。20枚の描画PNGを保存。試験で再利用時に旧高さを使う位置ずれを発見し、ContentPresenterのレイアウト完了後に寸法を読むよう修正、再検証成功。対象アプリ名を通常文字色へ変更し、明暗背景の描画を確認した。`native-display-6.log`、`native-snapshots/`参照。先行失敗logも保持。
- `APPDOCK_GESTURE_INDICATOR_ONLY=1 dev.bat exec node scripts/gestures-ui-test.cjs` の隔離開発版GUI成功。4種類のラベル/見本/保存、表示なしの保持、実設定による明暗切替、1280/900/700pxの全24組合せ、プロセス再起動後の保持、エラーログなしを確認。最終profileは `.artifacts/gestures-ui-1792909328516/`、`result.json`とPNG、`settings-indicator-ui-final-2.log`参照。狭幅の見本が縮みすぎる点とリングのラベル幅を実表示に合わせて修正後、全組合せを再実行した。元の総合UI試験は最新mainの有効化欄移動前の配置を要求する既存assertionで停止したため、元assertionを緩めず、今回の表示変更だけを検証する明示モードを追加した。
- `InputTests --gesture-key-state` はメモリ内の模擬入力 **10項目成功**（`key-state.log`）。実入力の既存InputTestsは試験Windowの前面化失敗、cleanupのSendInputはWindows error 5で停止（`input-regression.log`）。**物理入力の認識・実行回帰は今回未確認**として残す。Pause/F13〜F24のOS送信・登録を行う `--shortcuts` モードは実行していない。混在DPIの複数モニター移動、全標準回帰、固定配布EXEの検証も未実行。main統合後の発行時に現行版を再照合し、固定EXEと実入力の不足を確認する。
- 証跡の基点は `.artifacts/gesture-indicator-0880/`。`inputs.json`に今回のソース・生成物hashを記録。成功したWPF/GUIの各系列は3回以内で、失敗診断と再利用用記録は保持。隔離テスト用プロセスの残存なしを確認した。

## 2026-10-25: MCP設定の固定入口と通常設定の共通登録 0.88.1

- 専用worktree `AppDock.at365-mcp-settings-design`、branch `codex/mcp-settings-design`のcleanな`e66a2f4`から、拡張設計の第2単位を実装。追跡先がないためpull・main統合を行わず、独立node_modulesと固定lockfileを維持した。
- MCP専用の固定6入口で対象・Schema・値・固定選択候補を取得し、単純設定のset/resetを共通SettingsCommandsの検証・保存へ接続。本体の通常設定は共通登録から既定値・検証・設定カタログ・JSON投影・PC専用保存・MCP公開を生成する。既存hardwareAccelerationもnextStartとして公開する。初回の入口反映後、項目・提供元・固定候補を応答データとして追加でき、外側のツールSchemaは変更しない。
- read + writeだけで変更し、許可・公開定義・可用性を再送時にも検査。値と保存上書きに結び付く不透明revision、schemaRevision、主体と検索条件に結び付くcursor、要求/結果の上限、512件の成功/失敗の重複処理を確認。dryRun・no-op・古いrevision・未宣言/非公開/秘密の拒否、原子的なバッチ検証を確認した。実SDKクライアントで、接続後に設定と提供元を追加してもtools/listが変わらず探索・保存できた。
- 発行前レビューで、実効値が既定値と同じ上書きの解除不足を修正。物理的な上書きの有無を確認して保存対象scopeを再出力し、表現だけの外部変更も競合検査へ含めた。既存の共有/端末別保存と非公開/未知値を保持する回帰が成功。既存エラーの検証順序、MCP専用の操作列挙とAppletの既存契約も整合させ、阻害指摘なし。
- 固定依存install、型検査、本体/Default Shell buildに成功。関連27ファイル275件に加え、兄弟manifestの前後SHA付きsettings-editing/web-apiとMCP 2.0の既存mcp-eventsを37件実行。重複11件を除き**29ファイル・301/301件、fail/skip 0**。標準回帰全体は未実行。最初の試験指定に存在しないmcp-modern.test.cjsが含まれたため、実在するmcp-eventsのtransport回帰で補完した。678入力の前後hashは一致。兄弟Appletの宣言は読取りだけで変更しない。
- 隔離sourceと固定EXEの専用GUI/MCPは各**6群**成功。探索/Schema/候補・dryRun/保存/リセット・旧APIと本体snapshotの一致・再送・秘密保護・8権限・write取消を確認。固定EXEの既存MCP接続管理GUIも**10群**、再起動後の保存とsmokeが成功。各試験コピーと発行EXEのhashを照合した。配布検査helperのShell参照先をASAR内から既存extraResourcesへ修正し、同じEXEで再検査して成功。製品の修正・再発行は不要だった。
- 設定キー・保存ファイルの増減や既存公開契約の破壊を含まない追加APIのため、0.88.0から**0.88.1**へパッチ更新。publish.bat終了0で.NET各Host/Updaterも発行。出力は `A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170683939 bytes / SHA256 `8851949228f68c1e5925e98c4e5bc2b347082da3b661d607494d0457f648bce4`**。EXEのFile/ProductVersion、update.jsonの版・size/hash、ASAR内packageと同梱Default Shellの版を照合。Node 24.22.1 / pnpm 12.10.1 / Electron 45.0.0 / .NET SDK 10.0.402 / Windows 10.0.26300 x64、通常ユーザー環境で検証した。
- 現行仕様は[設定API](docs/settings-api.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。通常一覧の行操作・動的候補・専用サービスのadapterは未実装で、items.listは対応対象を公開しない。実利用設定・認証・Cookie・外部サービス・物理入力・効果確認は試験対象外。main統合・push・Release・実利用先deployなし。
- 完全ログ・レビュー・入力hash・成果物照合は`.artifacts/mcp-settings-gateway/`、コミット照合は`.artifacts/commit-validation-mcp-settings-gateway-20261025/`。source=`mcp-settings-foundation-source-1792919388415`、固定EXE=`mcp-settings-foundation-portable-1792919663285`、MCP画面=`mcp-settings-portable-1792919679470`、smoke=`smoke-1792919708977`。今回の成功profileは方式ごとの直近3回以内で削除0、失敗診断と過去の再利用証跡を保持。後続差分は本記録だけで、製品・試験入力は不変。

## 2026-10-25: MCP設定の権限・公開・秘密情報の基盤 0.88.0

- 専用worktree `AppDock.at365-mcp-settings-design`、追跡先のないbranch `codex/mcp-settings-design`のcleanな設計commit `bc4954f`から実装。既存mainや他worktreeを統合せず、[拡張設計](docs/mcp-settings-design.md)の先行基盤を対象にした。固定6入口、共通登録、通常一覧と特殊設定のadapterは後続範囲。
- 操作許可を16種類から8種類へ整理し、設定編集をread + writeへ統合。入力割当・リボン・トレイ・カスタムコマンド定義・MCP接続定義・Applet有効/無効の編集はexecuteから独立し、Applet再起動はread + executeで判定する。旧writeを保持し、旧個別ONでwriteを有効化しない。旧個別OFFによる例外は廃止。旧キーは読込互換だけを残し、ローカルの明示的な許可保存時に整理する。Applet/MCP列、元callerとの許可の積、SELF_CALL/BUSYは維持した。
- 宣言済みの対応する単純設定をMCPへ既定公開し、automation:false / secret:true / localOnly:trueを除外。他Appletへの公開はautomation:trueを維持し、生成コマンドと割当候補にも同じ公開範囲を適用した。既存の本体定義への登録が必要であり、全本体UI設定の自動登録まで対応したものではない。通常コマンドの公開と生成宣言も維持する。
- 既存MCP接続管理APIからtoken/environmentの入力・消去、環境変数名の取得、暗号化情報のある行の削除・接続先変更を拒否。壊れた秘密付き行の外部修復も拒否する。非秘密情報の編集・順序変更は暗号文を保持し、ローカルの認証編集と保存済み認証の通常利用を維持した。
- 発行前レビューで遅延評価される割当カタログのcaller範囲不足を修正し、要求ごとの文脈と関連回帰を追加。最終コードの型検査・本体/Default Shell build、関連標準回帰17ファイル175件と実行経路7ファイル99件、合計**274/274、fail/skip 0**が成功。独立node_modules・固定lockfile・供給網検査を維持した。Node 24.22.1 / pnpm 12.10.1 / Electron 45.0.0、通常ユーザー環境で実行。
- 専用GUI試験はsource・固定EXEとも4群成功。8行と独立列、write ON/execute OFFでのdryRunと保存、独立動作の拒否、明示非公開と秘密の除外、実MCPでの暗号化情報保護・暗号文保持、許可取消、tools/listの定義不変を確認。既存ローカルMCP設定GUIは固定EXEで10群、スモーク試験も成功した。古い「接続してツールを取得」ボタンを探す試験は、選択時の自動取得へ合わせて試験だけを更新し再検証した。
- 許可項目の廃止と外部API契約変更のため0.87.16から**0.88.0**へマイナー更新し、publish.batが成功。.NET Host/InputHost/ProcessHostも発行した。出力は `A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/`。EXEは170681482 bytes、SHA256 `fb7ab10478aae6a9afb94f8b0b39ced92e41ea396ab5fa7ff4d00beb2821f62d`。update.jsonの版・size/hashと固定EXEの起動版を照合した。試験だけの後続変更で製品内容は変わらず、再発行・再採番なし。
- 完全ログ・673入力hash・レビュー・GUI結果は`.artifacts/mcp-settings-foundation/`と各GUI profile、コミット照合は`.artifacts/commit-validation-mcp-settings-foundation-20261025/`へ記録。最終入力差分は上記の既存GUI試験1ファイルだけで、影響するGUIを再実行し、関連標準回帰と型検査・製品buildの成功を再利用した。実利用設定・鍵・Cookie・物理入力は変更せず、実利用先deploy・main統合・push・Releaseなし。

## 2026-10-25: MCP設定拡張設計のコミット確認

- 専用worktreeの`codex/mcp-settings-design`、開始HEAD `26fdf3e`で設計関連のMarkdown 5ファイルだけを確認。公開既定、設定編集許可の統合、暗号化情報の除外、一覧の行参照、固定MCP入口、既存契約との分離をレビューし、阻害指摘なし。未コミットの設計を保持し、pull・他branchとの統合は行わない。
- 本文のローカル参照13件、入口3か所、JSON例2件、コードフェンス6個、残す許可8行、会話上の人物名・未置換記号の不在、変更対象5ファイル、`git diff --check`を確認して成功。文書だけのため製品回帰・型検査・GUI試験を対象外とし、製品版0.87.16を維持する。
- 検査結果、対象ファイルのhash、stage/worktreeの一致、Git tree、commit後のtreeとclean状態は`.artifacts/commit-validation-mcp-settings-design-20261025/`へ記録する。設計は未実装。mainへの統合・push・版更新・publish・Release・deployは行わない。

## 2026-10-25: MCP設定公開・一覧編集・権限統合の設計

- main `26fdf3ebcec05d015743ea5cec4a7bcf7c09e0c0`（0.87.16）のclean状態を確認。制限環境のDNS失敗後、同じ`git pull --ff-only`を通常ユーザー環境で実行し、Already up to dateを確認した。専用worktree `AppDock.at365-mcp-settings-design`、branch `codex/mcp-settings-design`を同じHEADから作成し、既存worktreeを保持した。
- [設計書](docs/mcp-settings-design.md)を追加し、DEVELOPMENT・設定基盤・外部操作の入口から「未実装」として参照した。通常設定のMCP既定公開、明示非公開・暗号化情報の除外、一覧の行参照と部分編集、固定6入口、既存APIとの互換性、対象別adapter、段階別の実装範囲と検証計画を記載した。
- 設定編集の許可統合を設計へ反映。16種類から8種類へ整理し、純粋な設定変更はread + write、独立した動作はexecuteと各利用許可で判定する。旧writeの保持、旧個別OFFの廃止、Applet有効/無効と再起動の分類、MCP/Applet列の独立性を明記した。
- 現コードとの設計レビューで、旧許可キーをUIラベル一覧で検証しているため単純な行削除では旧ファイル読込が失敗する点、秘密付き接続の削除・結び付け変更、IDなし一覧、公開/権限変更後の再送結果を確認し、互換読込・ローカル限定操作・revision付きitemRef・再送前の公開再検査を設計へ反映した。
- 文書検査は設計書内のローカル参照13件、入口3か所、JSON要求例2件、コードフェンス6個、残す許可8行、会話上の人物名・未置換記号の不在、`git diff --check`が成功。製品コード・依存・設定・版・配布物は変更していない。文書のみのため型検査・製品回帰・GUI/固定EXE/実MCP変更試験は行わず、実装済みとは扱わない。commit・push・publish・Release・deployなし。

## 2026-10-25: 共通テーブル整備・ヘッダー調整のコミット前検証 0.87.16

- 利用者確認済み0.87.15～0.87.16の13ファイルを対象とし、main b0f5ccc上の差分・未追跡SettingsTable・実効Git名義を確認。GitHubをfetchし、GitHub/AQUAのmainが開始HEADと一致していることを確認した。製品内容・発行物は変更せず0.87.16を維持、再発行なし。
- 標準回帰114ファイル・**885/885件、fail/skip 0**を入力SHAと証跡で照合。前回コミットの未変更対象91ファイル・692件、共通化時の17ファイル・140件を再利用（うちappearance/localization/shell-boundariesの18件は最終ヘッダー変更後の成功へ置換）。最終native/updater発行物を利用するall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesの6ファイル・53件を追加実行し成功した。試験スクリプト、main/shared/SDK/native/Shellロジック、設定schema、依存/ビルド定義は前回成功時と一致。変更したrenderer/CSSは実装時GUIと最新の静的試験で確認した。
- 0.87.15の一覧編集/取消/順序/検索/行結合等の3群GUIは、後続変更がヘッダーCSS/追加ボタンクラスのみで操作処理が不変であることを照合して再利用。0.87.16の11画面・明暗/狭幅ヘッダーGUI2群とsmokeは現在EXE・検証コピーのhash一致を確認。型検査/build/publishログ、Node/pnpm/.NET/OSと兄弟manifest/payload、各証跡hashを照合した。pnpm版ログの末尾空行差は実値12.10.1で一致確認。物理入力や外部サービスの新規検証はしていない。
- EXE **170,683,878 bytes / SHA256 be162efa2ee99f6fe57bd4f6fae11971270eb4a8dcdc89cb0e62e89fc92a4231**。証跡は .artifacts/commit-validation-shared-tables-08716/ の入力一覧/環境/再利用判定/追加53件ログ/stageとcommit tree/両remote先端照合。元資料はcommit-validation-notification-table-08714、applet-list-toolbar-08715、table-header-08716および検証済みの参照鎖。検証後は本記録だけ追記。再利用資料と今回の回帰出力を保持して削除0件。GitHub Release/実利用先deployは行わない。

## 2026-10-25: コンパクトな共通テーブルヘッダー 0.87.16

- 利用者の追記に従い、ボタン付きヘッダーの上下余白を縮めてボタンなしと高さを統一。共通SettingsTableのthead thを内容32px＋上下6pxとし、見出しの共通flexでbaselineの余白を除去した。通常の単行ヘッダーは約44px（罫線のDPI丸めを除く）、複数行は必要に応じて拡張。共通SettingsListAddButtonに専用クラスを付け、32pxの操作対象、アクセント文字、通常透明・枠なし、hover/focus時の淡い背景とキーボードoutlineを使用する。本文の追加ボタンや保存/操作処理は変更しない。
- main上の未コミット0.87.15の共通化を保持して追加修正。変更は共通CSS/追加ボタンクラス・文書・版のみ。既存の余白/hover規則との詳細度、狭幅、権限の非表示ヘッダー、focusとdisabledをレビューし阻害指摘なし。0.87.15の発行完了後の追加修正につき0.87.16へパッチ更新。設定キー/保存ファイル/公開APIの変更なし。
- 固定lockfile照合、整形、型検査、build、publish成功。appearance/localization/shell-boundariesの3ファイル・**18/18件、fail/skip 0**。前回の機能回帰140件は保存/操作処理が不変のため全再実行せず、ヘッダーに絞った実画面検証を追加した。ソース/固定EXEとも各**2群成功**、pageerrorなし。Applet管理/通知/Webアカウント/操作の許可/AI/MCPクライアント/ショートカット/マウス・タッチパッドジェスチャー/カスタムコマンド/WebAppletの11画面で、明暗1280px・明720pxの高さを計測。ボタン有無の差は罫線丸めの範囲内、ページ横はみ出しなし。追加ボタンの枠0・通常透明・32px対象・hover背景・Tab focus outline・追加ダイアログの開閉/取消を確認し、画像を目視した。恒久的な見た目比較試験は追加していない。
- 最終EXEは**170,683,878 bytes / SHA256 be162efa2ee99f6fe57bd4f6fae11971270eb4a8dcdc89cb0e62e89fc92a4231**、A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exeへ発行。File/ProductVersion、feedの版/size/hash、ASAR内package/Default Shell版、固定GUI/smokeコピーが0.87.16と一致し、smoke成功。
- 証跡は .artifacts/table-header-08716/ の入力SHA、環境、レビュー、各log、header-measurementsと画像、最終照合。source=table-header-ui-1792907710261、portable=table-header-ui-1792907899153、smoke=smoke-1792907931302。製品入力は検証前後で一致、本記録のみ後続変更。今回成功profileは各方式1件で直近3回以内、削除0。前回の機能検証・失敗診断・固定出力を保持。物理入力、外部サービス、実利用データや通常終了は未検証。commit/push/Release/deployなし。

## 2026-10-25: 設定テーブルの共通化とApplet一覧の操作配置 0.87.15

- main b0f5cccから開始し、clean時にpull --ff-onlyで最新を確認。一連の作業中の変更を保持して、WebApplet/WallpaperSlideshowの宣言型一覧、Applet管理と追加指定の本体設定を整備。共通SettingsTableへ背景・ヘッダー・セル余白・罫線・末尾行を集約した。通知/Webアカウント/MCPクライアント/カスタムコマンドは既存SettingsListLayout/Table経由、AI/Applet管理は同レイアウトへ移行、操作の許可とショートカット/マウス・タッチパッドジェスチャーは専用行構造内で同じ土台を利用する。
- Appletの宣言型一覧は件数を右端、追加/順序操作を左へ配置し、操作列のヘッダーとセル内ボタンを左寄せ。列位置は変更しない。AIの件数も共通Summaryで右端に配置。Applet管理の検索/集計/追加/操作/横スクロールを共通化し、バージョン・状態・更新・再起動等の専用表示とguard/callbackを保持。コマンドのrowSpan/owned割り当て/スクロールとフォーカス復帰、権限のApplet/MCP独立列と狭幅表示を保持した。Appletソース変更なし、設定キー・保存ファイル・公開API変更なしのため0.87.14からパッチ更新。
- 発行前に実装差分・影響先・保存/削除/順序契約・専用CSSをレビューし、阻害指摘なし。固定lockfile照合、整形、型検査、build、publishは成功。object-list-dialog/setting-list-draft/applet-settings/applet-management/applet-order/settings-page/settings-page-host/localization/appearance/shell-boundaries/ai-settings/web-accounts/notification-preference-edit/mcp-client/keybindings/gestures/touchpad-gesturesの**17ファイル・140/140件、fail/skip 0**が成功。標準回帰全体は未実行。
- ソースGUIと最終固定EXEの隔離GUIは各**3群成功**、pageerrorなし。明1280/暗900/明720の対象全画面で共通表・32px操作・ページ横はみ出しなしを確認して目視。実際の発行済みWebApplet/WallpaperSlideshowのmanifest/payloadをhash照合し、両Appletを無効のまま、サイト編集保存/取消、追加/削除取消、順序保存、初期キー取消、モニターMode保存を確認。Applet管理の検索/設定遷移/順序取消、AI編集/追加取消、WebアカウントEnter保存/Escape取消、通知編集取消、3入力一覧の行結合/編集取消/削除取消と保存値維持も確認した。fixtureの名前/OKボタン/アカウント参照/保存待機/表示倍率/owned行数の不一致を修正し、全確認を再実行して成功。製品側の検証やガードは緩めていない。
- 発行先は A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe。**0.87.15 / 170,695,182 bytes / SHA256 cf3ee59f040dd84c744214b928707f647f9fb6ee3575bbf6b84668e64fb86eab**。固定EXE smoke成功。EXEのFile/ProductVersion、update.jsonの版/size/hash、ASAR内package/Default Shell版、固定GUI/smokeコピーを照合した。
- 証跡は .artifacts/applet-list-toolbar-08715/ の入力SHA一覧・環境/兄弟依存情報・レビュー・各完全log・最終照合/証跡hash。ソースprofileはapplet-list-toolbar-ui-1792906500294、固定EXEはapplet-list-toolbar-ui-1792906702035、smokeはsmoke-1792906750773。試験前後の製品入力は一致し、後続差分は仕様文書/本記録のみ。対象profileを成功/方式別に確認し、各方式の今回成功は3回以内のため削除0。失敗診断・固定helper・過去の再利用証跡を保持。恒久的な見た目比較テストは追加していない。
- 物理キー/ジェスチャー、外部AI/MCPサービス、実壁紙適用、実利用設定、通常終了は新規検証していない。隔離fixtureのキーはapp scope Ctrl+F8/Alt+F8、ジェスチャー機能は無効、Pause/F13〜F24のOS送信/登録なし。コミット・push・Release・実利用先deployは行っていない。

## 2026-10-25: 通知設定 0.87.14のコミット検証

- 利用者が0.87.14を確認してcommit/pushを依頼。main `ce1c630`上の今回の11対象ファイルだけをレビューし、阻害指摘なし。通知テーブル、共通編集ダイアログ、種類単位の保存/競合検査、追加6試験、翻訳8キー、版と関連文書を対象とした。dirtyのためpull/stash/統合なし。fetchとGitHub/AQUAの読取で両mainが`ce1c630`に一致し、実効author/committerを確認した。
- 標準回帰は**114ファイル・885/885、fail/skip 0**。既存113試験と既存locale値・設定スキーマ・SDK/native/Shell/runtime・共通UI・依存/固定ツール/ビルド定義は前回と同じ。mainは新しい内部通知actionとimportを除いて既存コードと一致し、新helperはこのactionだけが使用する。影響のない**89ファイル・683件を前回標準から再利用**、今回の実装時に最終入力で成功した**18ファイル・138件を再利用**、最終native/updater生成物を使うall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesとmain静的参照のribbon-commandsの**7ファイル・64件を追加実行して成功**した。型検査/buildの完全logと終了コード、Node/pnpm/.NET/OS、全ソース・試験・依存・fixtureと証跡hashを照合した。
- 今回の最終固定EXEの通知GUI 2群とsmokeは、入力・試験・実行方式・隔離コピーとEXEのSHA256一致を確認して再利用。確認済みの0.87.14の製品変更・再発行なし。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,693,021 bytes**、SHA256 `606b48cfe671623b7018264ad4028cc479c014bd04a9416f179f188974ec13a9`。既存feedと版も一致する。検証後の変更はこの記録だけ。stage/worktreeの一致・tree ID・commit/tree・両remote headとclean状態は`.artifacts/commit-validation-notification-table-08714/`へ記録する。今回の追加試験出力と再利用証跡は保護し削除0件。Release/deployは行わない。

## 2026-10-25: 通知種類のテーブルと編集ダイアログ 0.87.14

- cleanなmain `ce1c630`で`git pull --ff-only`を実行し、Already up to dateを確認して着手。通知種類を共通SettingsContent/SettingsListLayoutの1テーブル（通知名・通知先・表示時間・読み上げ・MCP Events・編集）にし、提供元マークと説明ヒント、必須・固定・停止中・仕様変更・読み上げ前提不足を表示。鉛筆から共通SettingsDialogで編集し、OKで種類単位に保存する。利用できない種類の設定削除、読み上げ共通値、受け取り方の案内は保持した。
- 内部のsettings-page actionで元の上書き値・提供元/種類ID・通知仕様を照合してから既存の原子的保存へ渡す。他の通知や共通読み上げ設定を保持し、未変更のOKでは既定値を明示化しない。取消では保存せず、失敗・競合では入力とエラーを残す。設定スキーマ・保存ファイル・公開APIの追加削除はなく、発行済み0.87.13からpatchを増加した。
- 発行前レビューは阻害指摘なし。目視後に一覧の必須・秒数表記を短縮し、未使用importと正本文書を整理。最終差分で型検査・build成功、通知ポリシー/配送/履歴/音声、新しい種類単位保存、設定page/client/host/検索、翻訳・配色・Shell境界・automationの**18ファイル・138/138、fail/skip 0**。追加した恒久試験は保存・競合・制約・同名異提供元の6件で、見た目比較テストは追加していない。
- ソースと最終固定EXEの隔離GUIで各**2群**成功、pageerrorなし。必須/固定/停止中/仕様変更/TTS不足、取消/Escape/変更なしOK、入力不正時の保持、通知設定の一括確定、別種類・共通音声の外部変更の保持、同一種類競合拒否、停止Applet編集、未知の設定保持、検索anchor、編集ボタンへのfocus復帰を確認。明るい1280px・暗い900px・明るい720pxとヒントOFFの重要状態表示を確認。途中の3失敗はfixtureの最低ホスト版宣言・検索結果の表示前提・非同期focus待ちを修正して解消した。成功profileはソース`notification-table-ui-1792891035029`、固定EXE`notification-table-ui-1792891227202`。
- `publish.bat`終了0。本体・EXE・ASAR内Default Shell・feedは**0.87.14**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170693021 bytes**、SHA256 `606b48cfe671623b7018264ad4028cc479c014bd04a9416f179f188974ec13a9`。feedのsize/hash、FileVersion/ProductVersion、隔離コピーを照合し固定smokeも成功。証跡は`.artifacts/notification-table-08714/`のレビュー・完全log/コマンド/終了コード・入力hash・最終照合・証跡hash。発行後の製品変更なし。
- 整理は削除0件。今回のGUI成功はソース2回・固定EXE1回で方式別3回以内、途中失敗と過去の照合用証跡は保持。今回のfixtureプロセス終了を確認した。実利用設定・物理入力・実TTS/MCP送信・Windows/desktop通知配送・通常終了は今回未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: 設定UI 0.87.8～0.87.13のコミット検証

- 利用者が最終0.87.13を確認してcommit/pushを依頼。main `9685a04`上の23対象ファイルをレビューし、阻害指摘なし。索引間隔、Section/一覧/操作列の整理、ジェスチャー有効化・フィルター高さ、MCPクライアント自動取得/Schema、Codex連携/接続設定/トークン・登録操作と関連文書だけを対象とする。dirtyのためpull/stash/統合なし。fetchと両push先の読取でGitHub/AQUAのmainが`9685a04`に一致し、実効author/committerを確認した。
- 標準回帰は**113ファイル・879/879、fail/skip 0**。全113試験ファイル、main/shared/native/Shell・依存/固定ツール/ビルド定義は前回標準と同じ。差分の共通localeは設定画面の文言/検索語10値変更と2キー追加のみで、エラー/状態/通信契約の文言は不変。現行のappearance/localization/設定検索・ナビゲーション等の成功と入力を照合した。**107ファイル・826件を再利用**し、最終発行のnative/updater生成物を使用するall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesの**6ファイル・53件**を追加実行して成功。実装時の18/34/66/96/39件と型検査/build・発行の完全log/終了コード/入力一覧・証跡hashも照合し、現在のNode/pnpm/.NET環境を記録した。
- GUIは機能と入力範囲ごとに再利用した。索引は0.87.8のSettingsIndex/settings.css、ジェスチャー/フィルターは0.87.10のOptions/共通toolbar/summary/CSS、AI/MCP/Web/表示/リボンは0.87.11の各コンポーネントと共通一覧が現行と同じことを照合。MCP選択時自動取得・ページ追加・失敗/再選択・Schemaは同じ実装/依存のローカルstdio fixture成功を再利用した。Codexの構成は最終0.87.13の固定GUI**2群**とsmokeのEXE hashが現行と一致することを確認。途中で置換した取得ボタン/編集見出し/旧4Fieldの期待を含む過去GUI全体を、現在の成功として数えてはいない。最新の該当機能の確認を採用し、古い構成は後続成功で置き換えた。物理OS入力・実サービス・実利用設定・通常終了・認証/登録実操作の新規検証はしていない。
- 製品修正なし、利用者確認済み**0.87.13**を維持し再発行なし。EXEは**170,683,556 bytes**、SHA256 `8ca22a5dd0b2ade6d0a29cf09fc572c10b671d71a735673af33c6530a23a8876`。証跡は`.artifacts/commit-validation-settings-08713/`の対象/入力一覧、再利用判定・旧証跡hash/機能別ソース照合、追加53件の完全log、stage/commit tree・実効名義・両remote先端の照合。元資料は`commit-validation-settings-0877`と0.87.8～0.87.13の実装記録。再利用資料・直近成功・固定helperを保持して削除0件。GitHub Release/実利用先deployは行わない。

## 2026-10-25: 認証再発行とCodex登録解除の配置分離 0.87.13

- 0.87.12の発行/固定GUI/smoke完了後、利用者が合意した操作別の配置へ変更。「認証情報を再発行」は接続設定の「接続トークン」Field、「登録を解除」はCodex連携の「Codexへ登録」Fieldへ移し、空になった「認証と登録の管理」Fieldを除去した。再発行後のCodex登録修復・他クライアント更新・ローカル保存に関する既存説明はトークンFieldへ保持。元のcallbackとbusy/port/registration guardをそのまま移し、実操作は行っていない。再発行/解除の検索語も移動先に合わせ、設定キー/保存ファイル/公開APIの追加削除なし。main `9685a04`上の未コミット変更を保持してpull/stash/統合なし。正本文書を整合し、発行前レビューで阻害指摘なし。0.87.12からパッチ更新。
- 固定lockfile照合・整形・型検査・build・publishは終了0。appearance/localization/shell-boundaries/settings-navigation/settings-page/automationの**6ファイル・39/39、fail/skip 0**が成功。標準回帰全体は未実行。`.artifacts/mcp-auth-layout-08713/probe.cjs`でソース/最終固定EXEそれぞれ**2群**成功、pageerrorなし。明るい1280px/暗い900pxで前回の統合カードと入力guardを再確認し、Codex操作Field/トークンFieldに各3ボタンがあること、再発行/解除の正しい配置と無効条件、旧Fieldの除去、再発行後の案内、Section/ポート/再発行/登録解除の検索focusと設定snapshot不変を確認して目視した。設定適用・再発行/コピー・登録/解除・実接続は行っていない。恒久的な見た目比較テストは追加していない。
- 成功profileはソース`mcp-auth-layout-ui-1792888784559`、固定EXE`mcp-auth-layout-ui-1792888987499`。本体・EXE・ASAR内Default Shell・feedは**0.87.13**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,683,556 bytes**、SHA256 `8ca22a5dd0b2ade6d0a29cf09fc572c10b671d71a735673af33c6530a23a8876`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し固定smokeも成功。証跡は`.artifacts/mcp-auth-layout-08713/`のレビュー・入力照合・完全log/コマンド/終了コードとhash・発行物照合。方式別3回以内の成功と参照資料を保持し削除0件。実利用設定・物理入力・通常終了・実サービスは未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: MCPサーバーの接続設定への統合 0.87.12

- 追加ホスト名とローカル/ネットワーク共通ポートを「接続設定」へ統合する依頼を実装。旧ネットワークカードを改名し、ポート→ホスト名→既存ネットワーク/トークン/認証案内の順とした。空になった詳細カードを除去。既存の保存callback・入力/範囲/操作guard・Codex連携は保持した。共通ポートのhintとネットワーク状態の明示的な接頭辞で用途を分け、既存のnetwork検索anchorとconnectionのID（ポートFieldへ移動）を維持して検索文言・正本文書を整合。main `9685a04`の未コミット変更を保持し、pull/stash/統合なし。保存キー/ファイル/公開APIの追加削除はなくパッチ更新。レビューで発行阻害指摘なし。
- 固定lockfile照合・整形・型検査・build・publishは終了0。appearance/localization/shell-boundaries/settings-navigation/settings-page/automationの**6ファイル・39/39、fail/skip 0**が成功。標準回帰全体は未実行。`.artifacts/mcp-connection-settings-08712/probe.cjs`でソース/最終固定EXEそれぞれ**2群**成功、pageerrorなし。明るい1280px/暗い900pxで統合・順序・旧見出し除去、ローカル時の入力有効、ポートdraft/不正範囲guard・ホスト名Escape取消、共通ポートhint、ネットワーク状態とトークン表示保持、Section/ポートへの検索focus・設定snapshot不変を確認し目視。初回fixtureは検索移動の描画フレームを待たずfocus比較して失敗し、完了待ちへ直して成功。製品の検索実装は変更していない。設定適用・登録・トークン操作・実接続は行っていない。恒久的な見た目比較テストは追加していない。
- 成功profileはソース`mcp-connection-settings-ui-1792888384514`、固定EXE`mcp-connection-settings-ui-1792888602289`。本体・EXE・ASAR内Default Shell・feedは**0.87.12**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,680,927 bytes**、SHA256 `7f1f13322fbf6ca4862e383eb8dce72de8ac4423e1132e98ea9acafa3a8f4e5d`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し固定smokeも成功。証跡は`.artifacts/mcp-connection-settings-08712/`のレビュー・入力照合・完全log/コマンド/終了コードとhash・発行物照合。方式別3回以内の成功と初回fixture失敗・再利用資料を保持し削除0件。実利用設定・物理入力・通常終了・実サービスは未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: 設定Section整理・Codex連携・MCP自動取得 0.87.11

- main `9685a04`の未コミット変更を保持し、表示の共通Sectionのtitle、リボン編集Sectionのtitle/hint、マウス/タッチパッド一覧の無効時説明を除去。AI/MCPクライアント接続一覧はSection枠を外して共通Content/一覧をページ直下へ置き、検索anchorと操作を保持した。MCPの共有名/PC専用接続設定の説明はページ説明へ統合。Webアカウントの操作列は共通SettingsListLayoutの任意`actionsAlign="start"`でヘッダー/セル/操作行を左寄せとし、既定の他一覧は変更していない。
- MCPサーバーの登録Sectionを「Codex連携」とし、設定ファイル・登録名・認証と登録の管理を同じカードへ移動。登録/修復とこのPC内接続テストは「Codexへ登録」Field内へまとめ、登録の検索anchorを当該Fieldへ移した。ホスト/ポートの詳細と、保存/登録/修復/認証/テストの既存guard・callbackは保持。実Codex設定への書込・登録・テストは行っていない。
- MCPクライアントは接続先の選択イベントで既存mcpToolsを呼び、自動接続/取得する。未選択では呼ばず、切替時に既存のツール・cursor・結果とエラー表示を解除し、処理中の選択無効・単一処理guardを維持。取得ボタンを除き、Schemaは共通SettingsField内の読み取り専用SettingsTextareaへ変更。ページ追加と実行の操作は保持した。設定キー/保存ファイル/公開APIの追加削除はなく、0.87.10からパッチ更新。dirtyのためpull/stash/統合なし。正本文書を整合し、発行前レビューで阻害指摘なし。
- 固定lockfile照合・整形・型検査・build・publishは終了0。appearance/localization/shell-boundaries/setting-sections/settings-page/settings-navigation/settings-view-client/ai-settings/mcp-client/web-accounts/automationの**11ファイル・96/96、fail/skip 0**が成功。標準回帰全体は未実行。`.artifacts/settings-sections-08711/probe.cjs`でソース/最終固定EXEそれぞれ**3群**成功、pageerrorなし。明るい1280px・暗い900pxで指定のヘッダー/説明除去、最上層一覧・AI追加取消と保存不変、Codexの4Field/2操作、Web操作列の左寄せを確認し、AI/MCP/Schema/CodexとWebの画面を目視した。
- 機能検査は隔離ローカルstdio fixtureを使用。選択前の取得なし、A選択で自動取得・pending guard・50/50/20件のページ追加、読み取り専用Schemaと引数ドラフト、空選択で取得なし/古い表示の解除、Bの意図した取得失敗と空選択後の再選択での復帰、Bの一覧へ切替・設定snapshot不変を確認。ツールの実行は行っていない。初期fixtureはページ説明/Fieldラベルのselectorと、Webアカウント操作に必要なweb-profiles所有元/最低ホスト版を訂正した。これらは製品修正ではなく、途中の失敗記録も保持。恒久的な見た目比較テストは追加していない。
- 最終ソースprofileは`settings-sections-ui-1792887334908`、固定EXEは`settings-sections-ui-1792887562061`。本体・EXE・ASAR内Default Shell・feedは**0.87.11**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,688,265 bytes**、SHA256 `0baa5a14c6c772e33c13d00e517ab774aa2f5fe25c96c4f8b433f7eb88dc1799`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し固定smokeも成功。証跡は`.artifacts/settings-sections-08711/`のレビュー、入力照合、完全log/コマンド/終了コードとhash、ローカルMCP trace、発行物照合。方式別3回以内の成功と途中のfixture失敗/再利用資料を保持し削除0件。実利用設定・物理入力・通常終了・実外部サーバー/ツール実行は未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: ジェスチャー有効化・フィルター高さ・MCP操作配置 0.87.10

- 0.87.9の発行/固定GUI/smoke完了後、追加依頼を実装。マウス/タッチパッドの有効化Fieldを先頭の見出し・説明・折りたたみなしSettingsSectionへ独立し、動作設定とWindows接続は初期折りたたみを保持した。タッチパッドの既存翻訳値を「タッチパッドジェスチャーを有効にする」へ変更し、説明をFieldのhintへ移した。既存のchecked/onChange、busy、anchorと設定キー/保存値を保持。MCPクライアントのツール取得・追加取得・実行を共通SettingsActionsへ配置し、既存の条件・callback・ジョブ操作・一覧/ダイアログは保持した。正本文書を整合し、レビューで発行阻害指摘なし。
- 一時フィルターの基準測定で通常集計42px→適用時48px、パネル90px→96pxを確認。共通の集計行を通常時から48px確保し、長い対象名を一行省略と全文tooltipへ変更。初回GUIで残っていた`command-shortcut-summary`の個別42px上書きを検出・除去し、再build・関連66件・GUIを成功まで再確認した。解除操作、件数の右寄せ、検索/状態/一時条件の範囲は変更していない。設定/保存ファイル/公開APIの追加削除はなく、発行版0.87.9からパッチ更新。dirtyなmain `9685a04`の前回変更を保持し、pull/stash/統合なし。
- 固定lockfile照合・整形・型検査・build・publishは終了0。最終のappearance/localization/shell-boundaries/setting-sections/gestures/touchpad-gestures/mcp-clientは**7ファイル・66/66、fail/skip 0**。標準回帰全体は未実行。`.artifacts/gesture-enablement-08710/probe.cjs`の隔離GUIでソース/最終固定EXEそれぞれ**6群**成功、pageerrorなし。明るい1280px・暗い900pxで先頭カード/有効化ラベル/OFF値/focus/検索anchor、hint表示とdescription除去、動作/接続の初期折りたたみを確認。6画面の集計高を確認し、3入力画面の提供元/長い名前/入力マーク/文字検索/状態/画面間コマンド条件の適用・解除で集計とパネル高が変わらず、件数右寄せ・全文tooltip・設定snapshot不変を確認した。MCPは取得ボタンの共通アクション行と未選択時の無効状態を確認し、追加取得/実行の条件分岐はソースレビュー。画面を目視し、恒久的な見た目比較テストは追加していない。GUIでは実フックを作らないよう有効化を押さず、F13～F24のOS送信/登録や実MCP接続/ツール実行は行っていない。
- 成功profileはソース`gesture-enablement-ui-1792885036466`、固定EXE`gesture-enablement-ui-1792885272503`。本体・EXE・ASAR内Default Shell・feedは**0.87.10**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,673,668 bytes**、SHA256 `bd8bdd8d37f8daa9f40f6d850df38ee7b388aa12835ab5e28306602efd9642c1`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し固定smokeも成功。証跡は`.artifacts/gesture-enablement-08710/`のレビュー・入力照合・完全log/コマンド/終了コードとhash・配布物確認。基準測定・途中のGUI失敗と方式別3回以内の成功・参照資料を保持し削除0件。実利用設定・物理入力・通常終了・実サービスは未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: リボン・トレイの動作カードの見出し除去 0.87.9

- main `9685a04`上の0.87.8未コミット変更を保持し、リボン/トレイの動作カードを既存SettingsSectionのtitle・descriptionなし、折りたたみなしの表示へ変更した。Fieldのラベル/ヒント/anchorと選択・解除、後続の編集Sectionは保持。共通部品の追加変更や設定キー・保存ファイル・公開APIの追加削除はなく、0.87.8からパッチ更新。dirtyのためpull/stash/統合なし。設定基盤・トレイの正本文書を整合し、発行前レビューで阻害指摘なし。
- 固定lockfile照合・型検査・build・publishは終了0。appearance/localization/shell-boundaries/setting-sections/ribbon-customization/tray-menuの**6ファイル・34/34、fail/skip 0**が成功。標準回帰全体は未実行。`.artifacts/behavior-sections-0879/probe.cjs`の隔離GUIでソースと最終固定EXEそれぞれ**4群**成功、pageerrorなし。明るい1280px・暗い900pxでSectionが通常sectionでありheader/summary/開閉アイコン/動作設定見出しがないこと、各Field/選択ボタンの常時表示・ラベル・有効状態・focus、後続見出しの保持、検索移動と設定snapshot不変を確認し目視した。コマンド選択確定・実コマンド実行は今回追加検証していない。恒久的な見た目比較テストは追加していない。
- 成功profileはソース`behavior-sections-ui-1792884391894`、固定EXE`behavior-sections-ui-1792884566585`。本体・EXE・ASAR内Default Shell・feedは**0.87.9**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,692,530 bytes**、SHA256 `0e38696370a8378b8fb54dc831b8e7180343e7879da5111b992fafab69899a95`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し、固定smokeも成功。証跡は`.artifacts/behavior-sections-0879/`のレビュー・入力照合・完全log/コマンド/終了コードとhash・配布物確認。方式別の成功は3回以内、再利用資料を保持し削除0件。実利用設定・物理入力・通常終了・実サービスは未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: 設定インデックスの項目間隔 0.87.8

- cleanなmain `9685a04`で通常環境の`git pull --ff-only`はAlready up to date。設定索引だけに適用する共通CSSで、項目間を4pxから2px、上下paddingを10pxから6pxへ縮小し、操作高32px以上を維持した。横余白・アイコン/文字配置、選択色、内側のfocus枠、長い文字の省略と複数行検索結果の自然な高さを保持。設定基盤の正本文書も整合させた。発行前レビューで阻害指摘なし。設定キー・保存ファイル・公開APIに追加削除はなく、表示調整として0.87.7からパッチ更新。
- 固定lockfile照合・型検査・build・publishは終了0。既存appearance/localization/shell-boundariesの**3ファイル・18/18、fail/skip 0**が成功。標準回帰全体は未実行。`.artifacts/index-spacing-0878/probe.cjs`の今回用隔離GUIでソース/最終固定EXEそれぞれ**2群**成功、pageerrorなし。明るい1280px・暗い900pxで本体/長い名前を含むAppletの32px以上の項目高・2px間隔、クリックとEnter選択、focus-visible内側枠、長い名前の省略、検索のArrow/Enter/Escapeと複数行の高さを確認して目視。初回fixtureのfocus検査だけはDPI丸めの`-2.66667px`を厳密な`-3px`と比較して失敗し、内側範囲の検査へ修正して成功。製品のfocus実装は変更していない。恒久的な見た目比較テストは追加していない。
- 成功profileはソース`index-spacing-ui-1792882218683`、固定EXE`index-spacing-ui-1792882394077`。本体・EXE・ASAR内Default Shell・feedは**0.87.8**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,690,260 bytes**、SHA256 `efcca95612a7de8852fa4847c36bbc4081f71014e20deb184eb4a13ad717fadf`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し、固定smokeも成功。証跡は`.artifacts/index-spacing-0878/`のレビュー・入力照合・実行コマンド/終了コード/完全logとhash・配布物照合。今回の方式別成功は3回以内、初回fixture失敗と再利用資料を保持して削除0件。物理OS入力・実利用設定・通常終了・実サービス操作は未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: 設定UI 0.87.5～0.87.7のコミット検証

- 利用者が0.87.7までの表示・動作を確認してcommit/pushを依頼。main `55bba3a`上の27対象ファイルをレビューし、阻害指摘なし。コマンドセル/提供元の一時フィルター・説明アイコン、設定索引とApplet内部設定、共通部品の密度/集計配置、および正本文書・版・検証記録を対象とする。新規の共通`CommandProviderBadge.tsx`を含め、別作業の変更は含まない。dirtyなためpull/stash/統合は行わず、fetchと両push先の読取でGitHub/AQUAのmainが`55bba3a`に一致し、実効author/committerを確認した。
- 標準回帰は**113ファイル・879/879、fail/skip 0**。前回標準の全試験ファイルとmain/shared/native/Shell・依存/固定ツール/ビルド定義を入力hashで照合。差分はrenderer・文書・版とrenderer用翻訳キー追加だけで、既存翻訳値は同一。実装時の91件・66件・15件、型検査/build・発行・ソース/固定GUI・smokeの完全log/終了コード/入力一覧と証跡hashも照合した。現行の翻訳/renderer検査を含む**107ファイル・826件を再利用**し、最終発行で生成したnative/updaterを使用するall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesの**6ファイル・53件**を追加実行して成功した。
- 共通CSS/集計行変更後のコマンド操作を補足するため、`command-cells-0875/probe.cjs`を最終固定EXEで実行し**5群**成功、pageerrorなし。提供元の表示名短縮と安定IDフィルター、説明popover、ヒントOFF時の説明、複数フィルターの置換と解除focus、検索/状態リセットと保存不変、明暗・幅を確認した。profileは`command-cells-ui-1792879651680`。Applet内部設定と6画面の密度/検索配置は0.87.7の固定GUI4群とsmokeの実行物hashが現行と一致するため再利用した。物理OS入力・通常終了・実利用設定・実サービス操作を追加確認した扱いにはしていない。
- 製品修正なし、確認済み**0.87.7**を維持し再発行なし。固定EXEは**170,689,015 bytes**、SHA256 `7280bd9e0122a537cf932890a2a9259995ae4d471e48b02c91b04c7e29ec2de1`。証跡は`.artifacts/commit-validation-settings-0877/`の対象/入力一覧、再利用判定・旧証跡hash照合、追加53件/固定GUIの完全log、stage/commit tree・実効名義・両remote先端の照合。元資料は`commit-validation-settings-0874`・`command-cells-0875`・`settings-density-0876`・`applet-internal-label-0877`。種類/方式ごとの直近成功と再利用資料を保持し、削除0件。GitHub Release/実利用先deployは行わない。

## 2026-10-25: Applet共通欄の見出し変更 0.87.7

- 利用者指定により共通Sectionの既存翻訳値だけを「Appletの内部設定」へ変更し、設定基盤の正本文書を整合させた。初期折りたたみ、起動待ち時間と更新元の配置、保存設定・公開APIは変更していない。main `55bba3a`上の未コミット変更を保持し、pull/stash/統合なし。表示文言のみのため発行版0.87.6からパッチ更新とし、発行前レビューで阻害指摘なし。
- 固定lockfile照合・型検査・build・publishは終了0。appearance/localizationの**2ファイル・15/15、fail/skip 0**が成功。最初のdev起動は版変更後の依存構成照合を求めたため固定installで解消。初回の翻訳検査は古いout/mainリソースとの比較で失敗し、build後に再実行成功。製品修正を追加した扱いにはせず、途中のlogも保持。0.87.6の入力一覧との照合で、変更は翻訳JSONの1値・版・正本文書だけ、ほかの製品/試験入力は不変。標準回帰全体は未実行。
- 最終固定EXEを`.artifacts/applet-internal-label-0877/probe.cjs`の隔離profileで確認し、更新した見出しと初期折りたたみ、Applet切替、検索展開、既存Field保存/取消/既定復帰、6画面の集計と入力寸法、ダイアログ取消の**4群**が成功、pageerrorなし。profileは`applet-internal-label-ui-1792879005622`。固定EXEのsmokeも成功。共通の一時fixtureを再利用し、恒久的な見た目比較テストは追加していない。
- 本体・EXE・ASAR内Default Shell・feedは**0.87.7**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,689,015 bytes**、SHA256 `7280bd9e0122a537cf932890a2a9259995ae4d471e48b02c91b04c7e29ec2de1`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合。証跡は`.artifacts/applet-internal-label-0877/`のレビュー・入力ハッシュ・完全log/コマンド/終了コード・最終照合。今回のGUI成功は方式ごと3回以内、参照資料と途中の検査失敗を保持して削除0件。実利用設定・物理入力・通常終了・実サービスは未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: 設定インデックス・Applet共通設定・入力部品の密度 0.87.6

- main `55bba3a`上の0.87.5未コミット変更を保持して追加修正。dirtyなためpull/stash/統合は行っていない。設定インデックスの本体群に指定表記`APPPDOCK`を既存APPLETと同じスタイルで追加し、Default Shellを通常ナビゲーションと検索結果から除外した。登録ページ・実行時のShell・公開操作・保存設定は保持している。
- Applet共通の起動欄は「Appletの設定」として初期折りたたみ、その中へ既存の開始秒数と更新元SettingsFieldを配置。更新元の既定復帰は入力欄隣のアイコンを使用する。レビューでApplet切替時の開閉状態が残らないようowner単位のkeyを確認した。検索結果からは該当Sectionを自動展開し、collection子ページの除外を維持する。見出しは確認待ちの間に説明した「Appletの設定」の解釈で実装した。
- 共通部品の単行テキスト・数値・URL・select・通常ボタンの標準高を32pxへ縮小し、専用アイコン/トグル等の操作寸法を維持。6画面のフィルターパネルの件数を同じ集計行の右端へ配置し、検索欄も標準高へ合わせ、虫眼鏡をSVGの中央配置へ統一した。狭幅で必要な折返しは保持する。共通レイアウト指針・設定基盤の正本も更新した。設定キー・保存ファイル・公開APIの追加削除はなく、0.87.5からパッチ更新。発行阻害指摘なし。
- 固定lockfile照合・format・型検査・build・publishはいずれも終了0。関連回帰はappearance/localization/settings-view-client/settings-page/settings-page-host/settings-navigation/applet-settings/setting-sections/settings-defaults-reset/shell-boundariesの**10ファイル・66/66、fail/skip 0**。標準回帰全体は未実行。
- `.artifacts/settings-density-0876/probe.cjs`・`behavior.cjs`の隔離GUIで、ソースと最終固定EXEそれぞれ**4群**成功、pageerrorなし。Default Shellの索引非表示とページ登録維持、Applet切替時の初期折りたたみ、開始秒数/文字/選択の保存とEnter/blur/Escape、更新元の個別値・空欄・既定復帰とowner分離、検索からの自動展開、共通入力/選択/ボタン32px、6画面の集計右寄せと検索SVG中央、共通ダイアログの取消を確認。明るい1280px・暗い900pxを目視した。初回fixtureは既定値と同じ文字列を保存後も残る想定が誤りで失敗し、fixtureの既定値を別値に訂正して再実行成功。製品の既定値省略処理は変更していない。恒久的な見た目比較テストは追加していない。
- 成功したソースprofileは`settings-density-ui-1792878360125`、固定EXEは`settings-density-ui-1792878672639`。本体・EXE・ASAR内Default Shell・feedは**0.87.6**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,691,300 bytes**、SHA256 `98036797be8d071e821a1b38f3399920040c0faef2113f898298d39dfc0458f1`。feedのsize/hash・FileVersion/ProductVersion・隔離GUI用コピーを照合し、固定EXEのsmokeも成功。証跡は`.artifacts/settings-density-0876/`のレビュー、入力ハッシュ/最終照合、完全log/コマンド/終了コードとhash、配布物確認。今回の種類/方式別の成功は各3回以内、途中の失敗と参照資料も保持し削除0件。物理OS入力・実利用設定・通常終了・実サービス操作は未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: コマンドセルの2行表示・提供元マーク・説明アイコン 0.87.5

- cleanなmain `55bba3a`で通常環境の`git pull --ff-only`はAlready up to date。合意した提供元マーク＋名前＋説明/公開アイコン、その下にIDの基本2行を共通`CommandBindingList`へ実装し、ショートカット・マウス/タッチパッドジェスチャーへ適用。セル上下8px・IDとの間2pxとし、長い名前・複数割り当てに必要な高さ、利用不可/互換表示と既存操作を保持した。
- `CommandProviderBadge`は所有元IDで一時フィルターを適用する。押下時は検索/登録状態/入力/コマンド対象を解除し、既存の提供元タグで解除できる。入力マークとは相互に置換し、解除で元のマークまたは検索欄へfocusを戻す。ページ移動で破棄し、保存操作は行わない。AppDockはowner null、未知コマンドのundefinedは押せない表示とする。`at365.*`の表示名だけ先頭`Applet.`・末尾`.at365`を省き、元名はtooltipへ保持、他の提供元名・manifest名・ID・検索元は変更していない。
- 共通`SettingsDescriptionIcon`は既存ヒントのnative popover処理を共有し、説明のある場合だけ情報アイコンを表示。hover/focus/クリック/Enterで開き、Escape/外側操作で閉じる。設定ヒントOFFでも残し、長文/改行/外部テキストをそのまま表示する。レビューで任意ヒントのselectorと説明用selectorを区別し、既存のヒント検査・表示設定に影響しないよう整理した。共通一覧と設定基盤の仕様を更新し、未解決の発行阻害指摘なし。
- 固定lockfile照合・型検査/build・発行はいずれも終了0。関連回帰はappearance/localization/settings-view-client/settings-page/settings-page-host/shortcut-pages/keybindings/gestures/touchpad-gestures/shell-boundariesの**10ファイル・91/91、fail/skip 0**。レビュー後のselector/CSS差分についてappearance/localizationの**15件**を再確認し成功。残る試験は当該差分で使う型/動作/依存が変わらない成功を維持した。標準回帰全体は未実行。
- `.artifacts/command-cells-0875/probe.cjs`・`behavior.cjs`の今回用隔離GUIで、ソースと最終固定EXEそれぞれ**5群**成功、pageerrorなし。3画面の通常2行の構造、純正名短縮/全文tooltip・外部名保持、説明なし/利用不可、ヒントOFFでの説明のキーボード/マウス操作と外部テキスト保持、所有元IDによる正しい絞り込み、検索/登録状態のリセット、入力フィルターとの双方向切替、host/unknownの区別、解除focus・画面移動時の解除、設定snapshot不変を確認。画面間のコマンド対象とApplet管理から渡った提供元を置き換え、非同期clear後も新しいフィルターが残ることを確認した。明るい1280px/暗い900pxとリボン設定コマンドのサンプル画面を目視した。恒久的な見た目比較テストは追加していない。
- ソースprofileは`command-cells-ui-1792876698614`、固定EXEは`command-cells-ui-1792876919653`。本体/EXE/ASAR内Default Shell/feedは**0.87.5**、`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,679,417 bytes**、SHA256 `a8cd99cf5b1e572b5ebba85e0783933dd8506534095c559a524ffff27629515a`。feedのsize/hash・FileVersion/ProductVersion・GUI用コピーを照合。固定EXEのsmokeも成功。証跡は`.artifacts/command-cells-0875/`のレビュー・入力一覧/最終照合・実行コマンド/終了コード/完全logとhash・配布物確認。種類/方式ごとの直近3回以内の成功と参照資料を保持し、削除0件。物理OS入力・実利用データ・通常終了・実サービス/コマンド実行は未確認。設定/保存ファイル/公開APIに追加削除はなくパッチ更新とし、commit/push/Release/deployは行っていない。

## 2026-10-25: 設定UI 0.87.2～0.87.4のコミット検証

- 利用者が0.87.4の表示・操作を確認し、今回の設定UI変更のcommit/pushを依頼。main `35d72c4`上の23対象ファイルをレビューし、未解決指摘なし。設定インデックス・トレイ/リボン・共通順番変更・削除確認と関連文書/試験だけを対象とした。dirtyなためpull/stash/統合はせず、fetchと両プッシュ先のmain読取でGitHub/AQUAとも`35d72c4`に一致、実効author/committerを確認した。
- 標準回帰は**113ファイル・879/879、fail/skip 0**。前回の標準879件と全113試験ファイル、main/shared/native/Shellソース・依存/固定ツール・ビルド定義を照合した。変更はrenderer、UI試験/文書、版番号とrenderer用翻訳7キーの追加だけで、既存の翻訳値・バックエンド処理は不変。renderer全体を読むappearance/shell-boundariesと、再発行したnative/更新helperを使うall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesの**8ファイル・63件**を追加実行し、残る**105ファイル・816件**を成功証跡と依存関係の照合で再利用した。最新実装時の関連114件・直前の134件、型検査/buildとソース/固定GUI・smokeも対応する入力/ログ/配布物hashを照合した。
- 更新した既存`tray-menu-ui-test.cjs`を最終固定EXEで追加実行し**4群**成功。確認を経た解除・削除、子項目保持、ドラッグ/移動、未知ID、明暗3幅、空配列と再起動後の保存を確認した。最新の削除確認GUI4群と固定smokeを再利用。リボンのコンパクト表示は0.87.3のRibbonSettings/controls.css、インデックスは0.87.2のSettingsPage/settings.cssが現行と同じことを照合した。実OS入力・通常終了・実利用先を新たに検証した扱いにはしていない。
- 製品ソースは修正せず、検証済み**0.87.4**の発行物を維持し再発行なし。EXEは**170,688,000 bytes**、SHA256 `291d291cae6f9eba5e21db13ac151bf9527c11a63b91682b5ec8c1688a313b7f`。証跡は`.artifacts/commit-validation-settings-0874/`の対象差分・入力一覧・再利用判定/旧証跡照合、追加63件/固定トレイGUIの完全log、stage/commit tree・実効名義・両remote先端の照合。元証跡は`commit-validation-about-0871`・`tray-index-0872`・`compact-editors-0873`・`delete-confirm-0874`。参照資料、途中の調査と種類/方式ごとの直近成功を保持し削除0件。Release/deployは行わない。

## 2026-10-25: 削除確認と順番変更ボタンの通常色 0.87.4

- main `35d72c4`上の0.87.3の未コミット変更を保持して追加修正。dirtyなためpull/stash/統合はしていない。`CommandBindingList`でショートカット・マウス/タッチパッドジェスチャーとApplet詳細に共通の削除確認を追加。対象名・入力・条件を表示し、取消/Escapeでは変更せず、確定時に安定ID・対象内容・編集可否を再確認する。確認中に対象が変わった場合は削除を止めてダイアログにエラーを残す。取消で削除ボタン、確定後は対象コマンドの追加ボタンへフォーカスを戻し、一覧位置を保持する。
- トレイはコマンド・区切り線の削除とグループ解除に共通`SettingsDialog`を追加。メニューが確認中に変わった場合も削除を止める。グループ解除は確定後に子を同じ位置へ展開する既存仕様を保持。カスタムコマンド本体の削除は既存の確認画面を保持し、取消・確定と割り当てを残す動作を再確認した。コマンド実行・保存形式・公開編集APIへの確認ダイアログは追加していない。
- `SettingsOrderDialog`と`BindingOrderDialog`の上下ボタンを`accent-action`から標準面の`secondary`へ変更。32px角と移動処理を保持する。一覧側の複数コマンド用実行順入口の強調は保持。以前の確認なし削除に関する本体AGENTS・一覧/入力/トレイ仕様と既存GUIヘルパーの削除操作を更新した。宣言型object-listの`confirmDelete`省略時の契約は変更していない。
- 発行前に上記差分と呼出元をレビューし、未解決の発行阻害指摘なし。固定依存照合・型検査/build・発行は終了0。関連回帰はtray-menu/editing-commands/commands/clicks、keybindings、gestures、touchpad-gestures、custom-commands、setting-list-draft、object-list-dialog、localization、settings-view-clientの**12ファイル・114/114、fail/skip 0**。標準回帰全体と既存の全GUIヘルパーは実行していない。
- `.artifacts/delete-confirm-0874/probe.cjs`・`behavior.cjs`の今回用隔離fixtureで、ソース/最終固定EXEそれぞれ**4群**が成功、pageerrorなし。ショートカット/マウス/タッチパッドの削除前不変・取消/Escape・確定・フォーカス・外部変更時の拒否、未知ID/無効行と他の割り当て保持、トレイの解除/コマンド/区切り線の取消と確定・子の順序保持・競合拒否、カスタムコマンドの既存削除確認と割り当て保持、両共通順序画面の通常色ボタンによる移動と取消を確認。ソースprofileは`settings-delete-confirm-ui-1792874027897`、固定EXEは`settings-delete-confirm-ui-1792874248136`。固定EXEのsmoke `smoke-1792874274117`も成功。途中の試験側のエラー表示重複selector・空設定省略に関する失敗は修正し、そのprofileとlogを保持した。恒久的な見た目比較テストは追加していない。
- 本体/EXE/ASAR内Default Shell/feedは**0.87.4**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,688,000 bytes**、SHA256 `291d291cae6f9eba5e21db13ac151bf9527c11a63b91682b5ec8c1688a313b7f`。feedのsize/hash、EXEのFileVersion/ProductVersionとGUI用コピーを照合した。証跡は`.artifacts/delete-confirm-0874/`のレビュー・入力一覧/照合・コマンド/終了コード/完全logとhash・配布物確認。種類/方式ごとの直近3回以内の成功、参照資料と失敗調査を保持してprofile削除0件。実利用設定・物理OS入力・Pause/F13～F24登録/送信・実サービス実行・通常終了は未確認。コミット/プッシュ/Release/deployは行っていない。

## 2026-10-25: リボン編集と順番変更ダイアログのコンパクト表示 0.87.3

- main `35d72c4`上の0.87.2の未コミット変更を保持して追加修正。dirtyなためpull/stash/統合は行っていない。リボン編集は枠なし・通常40px以上の項目行とし、名前と補足を1行へ配置、グループの子項目を共通境界色の1px縦線とインデントで示した。32px角の操作ボタン、チェック、配置選択、ドラッグと保存経路を保持し、狭幅では操作列を次の行へ移す。
- 共通`SettingsOrderDialog`/`BindingOrderDialog`の行も枠なし・40px以上へ統一。名前と補足を横並びにし、上下操作は32px角の横並びを保つ。コマンドIDの専用表示を除去し、名前不明時もIDを代用せず「未確認のコマンド」と表示する。移動の読み上げ用案内にも同じ名前を使う。条件・無効/利用不可の状態は残し、長い名前/補足は省略と全文tooltip、540px以下では名前と補足を縦配置にする。ID・設定・競合検査・実行順の意味は変更していない。
- 発行前レビューで長い名前によるgridの横はみ出しと、カタログが未確認コマンドの名前へIDを補う経路を検出し修正。最終GUIで操作列と状態表示が収まることを再確認し、未解決の発行阻害指摘なし。共通の並べ替え指針とリボン設計を更新。設定・保存ファイル・公開APIの追加削除を伴わない表示修正としてパッチ更新した。
- 固定lockfile同期・型検査/build・`publish.bat`はいずれも終了0。関連回帰はribbon-groups/customization/commands、keybindings、gestures、touchpad-gestures、applet-order、ai-settings、mcp-client、object-list-dialog、localization、settings-view-clientの**12ファイル・134/134、fail/skip 0**。標準回帰全体は未実行。
- 隔離したソースGUIと最終固定EXEのGUIはそれぞれ**5群**成功、pageerrorなし。明暗1280/900/720pxでリボン・表示順・実行順、追加の480pxでダイアログを確認。720/480pxは試験用Windowだけ最小幅制限を緩めた確認。長短名、縦線、ボタン寸法、枠とページ横はみ出し、条件/状態とID非表示、AIのドラッグ/Alt+上下/取消/保存、ショートカット・マウス・タッチパッド各実行順の取消/適用、未知ID・無効値の保持、Applet/MCPの共通表示、リボンのグループ移動/下寄せ/表示切替/編集入口を確認。固定EXEのsmokeも成功した。
- 今回の確認用fixtureと画面は`.artifacts/compact-editors-0873/`へ保存し、恒久的な見た目比較テストは追加していない。ソース成功profileは`settings-compact-editors-ui-1792872583763`、固定EXE成功profileは`settings-compact-editors-ui-1792872909861`、smokeは`smoke-1792872947510`。起動直後にCDPへ接続できてもhostページが未生成だった配布版の試験失敗は、試験側の待機追加で解消。途中の未確認ID・長名overflow・Window最小幅・MCP操作名の試験失敗と修正も各profileのfailure/結果へ保持した。最終確認用プロセスのみ終了し、通常終了の実動作や実OS入力、実AI/MCP接続、利用者の設定は試験していない。Pause/F13～F24は送信・登録していない。
- 本体/EXE/ASAR内Default Shell/feedは**0.87.3**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,689,638 bytes**、SHA256 `be891a3312e86830f66598288dc585704b1e71eace8a2e4793b72d4651bc4cf5`。feedのsize/hash、FileVersion/ProductVersion、固定GUIコピーを照合した。実行コマンド/終了コード/log hash・入力一覧/照合・レビュー・版/配布物確認の正本は`.artifacts/compact-editors-0873/`。種類/方式ごとの直近成功3回以内と参照資料、途中の調査記録を保持してprofile削除0件。コミット/プッシュ/Release/実利用先deployは行っていない。

## 2026-10-25: 設定インデックスとトレイのコンパクト表示 0.87.2

- cleanなmain `35d72c4`で通常環境の`git pull --ff-only`はAlready up to date。インデックス先頭の「設定」見出しを除去し、検索ボックス上下の余白をそろえた。汎用sidebarのpadding/gapが重なる箇所は、設定インデックス側の優先度で明示した。asideのアクセシブル名、検索、項目の選択とリサイズは保持した。
- トレイ編集は名前とコマンドID/グループ件数を横1行にし、長い文字は省略表示、名前とIDに全文のtooltipを付けた。行の枠を除去して40pxを基本とし、32pxの上下/削除ボタンとドラッグ/選択の余白を保持した。グループの子項目はインデントと共通境界色の縦線で示す。クリック/ダブルクリックのFieldはIDを表示せず、利用できない状態は保持する。見つからないコマンド名もIDの代わりに案内文を表示し、保存済みIDを変更しない。保存型・メニュー解決/実行・配置操作の変更がないUI調整としてパッチを進めた。
- 発行前の差分レビューで未解決指摘なし。固定lockfile同期・最終型検査/buildは終了0。トレイの解決/操作/クリック/編集コマンド、配色・翻訳・設定ナビゲーション・Viewの関連8ファイルは **55/55（fail/skip 0）**。標準全回帰は再実行していない。仕様と追加規則は設定基盤とトレイ文書へ反映した。
- 最終ソースGUIは **5群**、最終固定EXEのGUIは **4群** が成功。混在Applet/未知IDの保持、グループ/区切り線の追加・配置・上下/drag・解除、入力検証、保存と再起動後の一致、空一覧の保持を確認。ソースでは実メニューの固定末尾、callback、単/ダブルクリックの振分け、IPC/menu/ウィンドウ内キー操作によるpause状態も確認した。Pause/F13〜F24をOSへ送信/登録する試験は行っていない。
- 明暗・1280/1000/900幅で横はみ出しなし、行の枠0・高さ36〜44px、名前/補足の単一行と中心位置、子グループの縦線、見出しなし、検索欄上下の等間隔を検査し、最終固定画像も目視確認した。初回は旧試験の見出し/画面名/移動待機とDPIによる罫線幅の丸めを修正し、失敗log/profileを保持した。
- 既存GUI試験の終了待機が残ったため、今回のUI fixtureは自身が起動したPID配下のプロセスツリーを終了して、保存済み状態の再起動を検証する形へ揃えた。一般利用の通常終了経路の検証とは区別する。残存した旧隔離試験もそのprofile/PIDに限定して後片付けし、通常利用のAppDockには触れていない。固定EXEのsmokeは **ok=true**。物理キーボード/実トレイ手操作/実利用先は未確認。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.87.2**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **170,675,873 bytes**、SHA256 `aacda9fbd0086fd0ff7b47303b9c1e7a91b80dde68064d88659ccf5ccc384d4b`。feedのsize/hash、EXE版、ASAR内のDefault Shell版と固定GUIコピーが一致した。
- 証跡は`.artifacts/tray-index-0872/`のreview・inputs-before/verified/final・input-verification・型/build/単体/GUI/smokeの完全logとJSON・package-verification・environment・evidence-hashes・cleanup。最終ソースは`.artifacts/tray-menu-ui-1792871075795/`、固定画像/結果は`.artifacts/tray-menu-ui-1792871378328/`、smokeは`.artifacts/smoke-1792871422747/`。種類/方式別の直近3回、参照資料と失敗調査、所有/参照の不明な旧資料を保持し、削除0件。未コミット、push/Release/実利用先deployなし。

## 2026-10-25: About改善のコミット前照合と一括更新名 0.87.1

- 0.86.13〜0.87.0の未コミット変更を保持し、一括更新のボタンと公開コマンドの表示名を「AppDockとAppletをすべて更新」へ統一した。`appdock.updates.installAll`のID・scope・保存済み割り当てと更新処理は不変。現行仕様書・GUIの期待文言も更新し、表示変更のパッチとして0.87.1を発行した。
- main `2312153`上の全42対象ファイルをレビューし、未解決指摘なし。dirty状態のpull/stash/統合は行わず、fetchと両プッシュ先の読取でGitHub/AQUAのmainが`13ce177`、local mainの親側にあることを確認した。実効author/committerも確認した。今回の対象はAbout情報パネル、自動確認/通知、共通設定ボタンと関連文書/検証に限定し、Fluidは変更していない。
- 標準回帰は **113ファイル・879/879、fail/skip 0**。保存既定値・カタログ・更新処理への実行時依存を追跡し、未実行の影響先72ファイルと文言に関わる2ファイルで **638件**、ソース読取/発行/ランチャー境界12ファイルで **48件** を追加実行した。前回の関連134件のうち、文言に影響されない **124件** を再利用。残る未変更の純粋モジュール16ファイル **69件** は、試験入力hashと旧成功log内の全試験名、依存/実行条件と動作が不変なことを照合して再利用した。古い結果を全体成功へ読み替えていない。
- 固定lockfile同期・型検査/buildは終了0。ソース/最終固定EXEのAbout GUI **6群** と固定smokeが成功。新しい長い表示名が明暗・600/760/900/1280幅で収まり、更新確認/通知の区分、2ボタンの実行対象、設定保存/リセット/件数タイルの移動を確認した。直前0.87.0の共通設定9群とURL保存6群は、変更のない入力/保存/操作経路の成功を再利用し、文言による配置の影響を新しいAbout GUIで確認した。実サービスへの更新適用・物理入力・実利用先は未確認。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.87.1**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **170,686,321 bytes**、SHA256 `904e28cc5f73080963db1596583e5a99e1ad1d43d2b352b0bf913e8d41fcc7c2`。feedのsize/hash、EXE版、ASAR内のDefault Shell版、固定GUIコピーを照合した。
- 証跡は`.artifacts/commit-validation-about-0871/`のrename・regression-plan・reuse・review・delta-from-0870・入力一覧、追加実行とGUI/smokeのJSON/完全log、package-verification。最終stage tree/実効ID/commit tree/各remote先端の照合はstage/commit/pushへ記録する。旧成功の再利用元は`.artifacts/commit-validation-settings-ui-08612/`・`commit-validation-gesture-labels-0868/`・`about-auto-0870/`。参照証跡と種類/方式別の直近3回、失敗調査、所有/参照が不明な旧資料を保持し、削除0件。Release/実利用先deployは行わない。

## 2026-10-25: Aboutの自動確認と更新通知・標準ボタン 0.87.0

- main `2312153`上の0.86.14までの未コミット変更を保持して追加修正。dirty状態のpull/stash/commitは行わず、Fluid worktreeも変更していない。前回758入力との差分、レビューと今回759入力のhashを`.artifacts/about-auto-0870/`へ記録した。
- 確認アイコンを枠なしに変更。共通の設定画面/ダイアログでは、標準面ボタンのhoverに明るさfilterをかけず、枠をアクセント色へそろえた。意味を持つ強調/削除・タブ・トグル・アイコンの専用外観は保持する。更新設定は初期状態を閉じ、末尾の説明段落を除去。更新元のリセットは共通の`SettingsInputActions`でテキストボックス右の小さいアイコンへ移し、操作名と既定値での無効化、blur/Enter確定・Escape取消を維持した。
- `updates.checkHostOnAboutOpen`を追加し、依頼で選択された既定ON・1時間の間隔を実装した。Aboutを開くと本体metadataだけを確認し、同じプロセス内の最終確認から1時間未満なら実行しない。手動確認/更新実行の時刻も使い、更新元変更後の初回は確認する。OFF/空の更新元/更新処理中/導入確認待ちは実行せず、同時に複数画面が開いても重複しない。画面を開いたままの定期処理や、結果保存ファイルは追加しない。起動後初回は未確認として確認する。新しい保存項目のためマイナーを進めて0.87.0とし、既存値と明示OFFを保持する。移行コードは追加していない。
- 自動確認はAbout専用の内部actionに接続し、DockApiへ新しい操作を公開していない。確認だけで更新なし/未設定/未公開なら通知しない。更新あり/確認失敗は従来の通知へ渡し、更新ボタン/更新実行コマンドで更新がなかった場合の結果通知も保持する。設定/操作/間隔/結果の仕様とボタン追加規則を開発文書へ反映した。
- 発行前に差分と影響先を自己レビューし、未解決指摘なし。初回型検査でルートのDockApi providerとの型差を検出し、設定ページ専用の任意capabilityへ修正した。固定lockfile同期・最終型検査/buildは終了0。自動確認の1時間境界/手動確認による間隔更新/更新元変更/重複抑止/設定のJSON投影/明示OFF/通知の出し分けと、既存の更新・設定保存・既定値・端末分離等の関連13ファイルは **134/134（fail/skip 0）**。
- ソースと最終固定EXEの両方でAbout **6群**・既存共通設定 **9群**・URL確定/保存 **6群**、計 **3系統21群** が成功。初回の自動確認1回と無通知、再訪/最近確認済みでのON切替の抑止、確認アイコンと公開「更新チェック」コマンドの更新なし無通知、更新ボタンでの更新なし通知、更新版と日時、2種類の更新対象、折りたたみ/設定保存/隣接リセットの寸法と実際のリセットを確認した。明暗・実幅600/760/900/1280で本文の横はみ出しなし、枠なし確認アイコンと標準面2系統のhover枠色/filter、ボタン寸法を検査し、最終画像も目視確認した。
- 固定EXEのsmokeもok=true。初回smokeは、自動確認を無効にするため試験スクリプトへ追加したJSONにschemaVersion/host/extensionsがなく、設定復旧待ちでタイムアウトした。試験側を正しい既定設定のfixtureへ修正し、**同じEXE/hash**で再確認して成功した。失敗log/profileも保持し、製品の修正/再発行は行っていない。全標準回帰、実サービスからの更新適用/再起動、物理入力/実利用先は未確認。ローカルfeedの更新版は表示検証用で、実在する公開版を示さない。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.87.0**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **170,680,112 bytes**、SHA256 `85e9d22ed376f7b944215cb1330b557118f7412fe855b282ebc5a357a35668d8`。feedのsize/hash、EXEのFileVersion/ProductVersion、ASAR内のDefault Shell版、各固定GUIコピーが一致した。
- 証跡は`.artifacts/about-auto-0870/`のreview・delta-from-08614・inputs-before-final/inputs-final・input-verification・environment・コマンド別JSON/完全log・package-verification・evidence-hashes・cleanup。固定About画像/測定は`.artifacts/about-ui-1792866502971/`、共通設定は`.artifacts/settings-usability-1792866521398/`、URL/リセットは`.artifacts/settings-url-1792866543208/`、成功smokeは`.artifacts/smoke-1792866738474/`。種類/実行方式別の直近3回と参照資料、失敗調査、他作業との参照/所有関係が不明な旧資料を保持し、削除0件。今回も未コミット、push/Release/実利用先deployなし。

## 2026-10-25: 情報パネルの文言と更新操作の調整 0.86.14

- main `2312153`上の0.86.13未コミット変更を保持して追加調整した。dirty状態のpull/stash/commit・Fluid worktreeの変更は行わない。前回758入力との差分は`.artifacts/about-panel-08614/delta-from-08613.json`、修正前/検証時/最終入力はinputs-before/inputs-verified/inputs-finalへ記録した。
- 紹介文をアプリ名の上へ1回だけ配置し、歓迎文・現在のバージョンのラベル・最新である旨・実行環境/まとめて更新/本体更新の見出しを除去。Appletだけの一括更新リンクとフッターの管理ボタンも非表示にした。既存の公開コマンドや管理画面側の更新操作は保持した。
- 現在版の隣へ共通VersionDisplayによる更新版、確認アイコン、最終確認日時を1行で配置。確認アイコンは既存の`checkUpdates()`で本体metadataだけを取得し、共通のエラー表示を使う。更新は適用しない。「本体と全Appletを更新」「AppDockを更新」を等幅・等高で同じ行へ並べ、本体のみのボタンはLightで白、Darkで共通の標準面を使用する。Applet数のタイルを、クリックとキーボードで管理画面へ移動できるボタンにした。件数の定義、初期展開の更新設定、保存形式は不変。
- 発行前に実装差分と影響先をレビューした。GUIで見つかった本体確認APIの対象指定（既定の引数なしを使う）、タイルへの汎用buttonのflex継承、600px幅で縦並びになる本文幅を修正。最終ソースGUIと画像で再確認し、未解決指摘なし。初回失敗log/profileも保持した。設定項目・保存ファイル・公開API契約の変更がない表示と既存操作の接続としてパッチを進めた。
- 固定lockfileの依存同期、最終型検査/buildは終了0。関連の翻訳/ナビゲーション/設定ページ/接続/配色は **28/28（fail/skip 0）**。ソースと最終固定EXEの両方でAbout **6群**・既存共通設定 **9群**、計 **2系統15群** が成功。固定EXEのsmokeもok=true。不要文言の除去、既存カタログとの件数整合・登録後の表示更新、metadataだけによる更新版の表示/解除・日時、2種類の更新対象、手動で閉じた設定の維持と保存、件数タイルのEnter操作を確認した。
- 明暗テーマ・実幅600/760/900/1280で本文の横はみ出しなしを検査し、全幅で更新ボタンの同一y座標・幅・高さとLightの本体ボタンの白背景を測定した。1280幅では版と日時の同じ行を測定し、600幅では版の行内だけで横スクロールする。固定版の画像も目視確認した。ローカルfeedの`999.0.0`は表示検証用で、実在する公開版ではない。更新ボタンの対象検証は同版feedで行い、実ファイルの更新適用/再起動・実サービス・実利用先は未確認。標準全回帰とportable-updatesの全適用試験は未実行。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.86.14**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **170,677,435 bytes**、SHA256 `7a84233f99c4fa5f46bed7d0ca3b79b84aa4e1e99ac93e48c24d58829ea465a6`。feedのsize/hash、EXEのFileVersion/ProductVersion、ASAR内のDefault Shell版、固定GUIコピーが一致した。
- 証跡は`.artifacts/about-panel-08614/`のreview・入力照合・environment・コマンド別JSON/完全log・package-verification・evidence-hashes・cleanup。最終固定About画像/測定は`.artifacts/about-ui-1792864182307/`（更新ありはhost-update-available.png）、共通設定は`.artifacts/settings-usability-1792864199505/`、smokeは`.artifacts/smoke-1792864221072/`。種類/実行方式別の直近3回・参照証跡・失敗調査・他作業との所有/参照が不明な旧資料を保持し、削除0件。今回も未コミット、push/Release/実利用先deployなし。

## 2026-10-25: AppDockについての情報パネル 0.86.13

- 前回の設定UI変更0.86.9〜0.86.12を、標準874件と発行物の照合後にmainへ`2312153`（tree `605ed3352fefd169311ee03405f4bb3a7486fd2e`）としてコミットした。実効author/committerとstage一致を確認し、clean状態の通常環境で`git pull --ff-only`はAlready up to date。今回の実装はその後の別差分とし、commit/push/Release/実利用先deployは行っていない。Fluid worktreeも変更していない。
- 設定インデックス・ページタイトルを「AppDockについて」へ変更。既存の`settings/about`、公開コマンドID、検索アンカー、保存形式は保持した。最上部の単一情報パネルへアイコン・アプリ名・版・Applet/コマンド件数・実行環境と、一括/本体更新の操作・状態・最終確認日時、Applet管理へのリンクを統合した。独立した実行環境Sectionは除去し、「更新の設定」は初期状態で開いた共通Sectionとして配置した。利用者による折りたたみと即時保存は保持した。
- 情報パネルだけは依頼された共通レイアウト規則の例外とし、専用CSSで配置・文字・枠を構成。共通配色変数と既存の更新ハンドラー・エラー表示は共有する。Applet数は組み込み/collectionを除くパッケージ数と稼働中の数、コマンド数は入力設定と同じカタログのID重複を除いた総数と利用可能数。Aboutのauxiliaryへは集計数だけを追加した。設定項目・保存ファイル・公開操作の追加/削除がないためパッチ更新と判定した。構成・件数・例外の適用範囲を設定基盤/共通指針/更新仕様等へ反映した。
- 発行前に差分と影響先を自己レビューし、更新日時をボタン横で縦中央にそろえる修正後に再確認。未解決指摘なし。固定lockfileの依存同期、最終型検査/buildは終了0。翻訳・ナビゲーション・設定ページ/接続・配色の関連試験は、入力hash記録を揃えた最終入力で **28/28（fail/skip 0）**。最終ソースGUIと固定GUIも成功し、標準全回帰は再実行していない。
- ソースGUIはAbout **5群**と既存の共通設定 **9群**が成功。最終固定EXEではAbout **5群**・共通設定 **9群**・URL入力 **6群**、計 **3系統20群**、smoke（ok=true）が成功した。3種類の更新ボタンは同版のローカルfeedで本体/全Applet/全体の対象を検証し、実サービスからの更新適用は行っていない。件数のカタログ整合・登録後の表示更新、初期展開/手動で閉じた状態の維持・保存、Applet管理への移動、明暗テーマと実幅600/760/900/1280の収まりを確認し、固定EXEの画像も目視確認した。
- 初回GUIでは開発版の更新制限と検証用の旧コマンド名、固定版ではモデル投影から描画までの待機不足を検出。検証側の経路/実行条件/描画待機を修正して成功した。既存URL試験の旧説明文・旧Applet一覧導線・既定値を省略する保存形式への期待も現行に合わせて修正し、最終6群が成功。失敗log/profileは調査資料として保持した。既存portable-updates等の名称/初期展開の期待値は更新・構文検査済みで、その全更新適用/再起動試験は今回未実行。実アカウント・実入力・実利用先は未確認。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.86.13**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **170,667,449 bytes**、SHA256 `3288867dc686d14ec55a569749d2242b2a180502ab6a959941ed59a42fef544c`。feedのsize/hash、実EXEのFileVersion/ProductVersion、ASAR内のDefault Shell版、固定GUIコピーのhashが一致した。
- 証跡は`.artifacts/about-panel-08613/`のreview、758入力のinputs-before-final/inputs-finalとinput-verification、environment、コマンド別JSON/完全log、package-verification、evidence-hashes、cleanup。新規CSS・検証スクリプトも入力へ含めた。最終About画像/測定は`.artifacts/about-ui-1792862406332/`、共通設定は`.artifacts/settings-usability-1792862434454/`、URLは`.artifacts/settings-url-1792862548598/`、smokeは`.artifacts/smoke-1792862585083/`。証跡と種類/実行方式別の直近3回、失敗調査、他作業との参照/所有関係が不明な旧資料を保持し、削除0件。今回の実装は未コミット。

## 2026-10-25: 設定UI 0.86.9〜0.86.12のコミット前照合

- main `13ce177`上の32ファイルを対象として実装差分と影響先を再レビューし、追加修正を要する指摘なし。stage前に実効author/committerとremote設定を確認した。新しいAbout画面の実装はこのコミットの後に分離する。
- 0.86.12の686入力、完全ログ・記録のhash、固定EXE/feed/GUIコピーを照合。型/build・固定GUI4系統65群・smokeの成功を再利用した。旧標準回帰874件の入力とも比較し、差分はrenderer・UI文言・検証スクリプト・版・文書に限定された。
- 現行の翻訳/設定ナビゲーション10件を再利用。CSSを直接読むappearance 7件と、再発行でhashが変わったnative生成物を読む3ファイル7件を追加し、全件成功した。nativeのソース/SDK契約は不変で、SDKのInformationalVersionは現在のHEADを含む。残る850件の標準成功を再利用し、**標準112ファイル・874/874、fail/skip 0**を確認した。製品コードや版は修正せず、再発行していない。
- 証跡は`.artifacts/commit-validation-settings-ui-08612/`のaudit/reuse、delta-from-standard、追加試験JSON/完全log、stage/commit。標準の再利用元は`.artifacts/commit-validation-gesture-labels-0868/`と`.artifacts/touchpad-labels-20261025/`、UIの再利用元は`.artifacts/settings-list-08611/`・`settings-list-08612/`。既存の参照資料を保持し、push/Release/実利用先deployは行わない。

## 2026-10-25: 一覧ヘッダー・固定フィルターと説明の整理 0.86.12

- main `13ce177`上で0.86.9〜0.86.10の未コミット変更を保持して追加修正。dirty状態のpull/stash/branch変更・commitは行わず、Fluid worktreeは変更していない。前回入力は`.artifacts/settings-ui-08610/inputs-final.json`、今回の差分レビュー/入力一覧は`.artifacts/settings-list-08611/`と`settings-list-08612/`へ記録した。
- Applet管理・ショートカット・マウス/タッチパッドジェスチャー・カスタムコマンド・Webアカウントが使う共通固定フィルターの下端罫線を除去。背景・sticky位置・横スクロールとの連動を保持した。Webアカウントの使用中/削除/クリアの説明はページ最上部の説明へ統合し、一覧直上の重複段落を削除した。使用中の削除ガードや確認ダイアログは変更なし。
- Applet管理・AI・MCPクライアントの順番変更ボタンを、名前列ヘッダーの追加ボタン直後へ移動。`SettingsListTable.orderInTitle`を追加し、`onOrder`省略時は順番変更を表示しない。ショートカット・両ジェスチャー・カスタムコマンドのフィルターにある順序変更ボタンと専用の未使用UI接続を除去した。各割り当て行の実行順操作と、保存済みの順序・公開APIは保持した。
- ショートカット/マウスジェスチャーの「動作設定」Sectionだけhintを除去し、Field単位のhintは保持。「Windowsとの接続」は初期状態で閉じた共通Sectionへ変更し、開くと全10種類の接続キー・修飾キー・Windows設定ボタンを表示する。共通の設定アンカーを保持した。レイアウト追加規則と現構成を設定基盤・一覧編集・タッチパッド設計へ反映した。
- 型検査/build・固定lockfileの依存同期は終了0。翻訳/設定ナビゲーションは **10/10（fail/skip 0）**。0.86.11ではソースと固定EXEで一覧操作12群・スクロール38群・Webアカウント7群・配置8群とsmokeが成功。その後の目視確認で狭幅AIヘッダーの「サーバー」の折り返しを見つけ、共通ヘッダーのnowrapとAIの内容に応じた列幅へ追加修正した。再レビュー・型検査/build・ソースGUI12群・画像確認後に、規定どおりパッチを進めて **0.86.12**を発行した。
- 最終固定EXEでも **一覧操作12群・スクロール38群・Webアカウント7群・配置8群、計4系統65群** とsmoke（ok=true）が成功。明暗/1280・760幅、名前と2ボタンの一行配置・セル内収まり、移した操作の起動/取消、各行の実行順・検索/絞り込み/横スクロール、折りたたみの初期状態、Webアカウントの変更/確認/実プロセス再起動を隔離fixtureで検証した。最終画像も目視確認した。
- 0.86.11以降の4入力差分はpackageの版、GUI検証、renderer CSS 2ファイルのみ。翻訳/カタログ/単体試験/依存が不変な10件はhash差分を照合して再利用した。全標準回帰と実タッチパッド/実Windows設定変更・実アカウント・実利用先の確認は未実行。設定モデル・保存形式・公開API・入力処理の変更を含まないためパッチ更新とした。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.86.12**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は170,683,530 bytes、SHA256 `c462f21814e4e743cb16473bb2f01f001c6aaf999757f6212907d610302e1a0c`。feedのsize/hashと各固定GUIコピーが一致した。
- 証跡は`.artifacts/settings-list-08612/`のreview/reuse、changed-inputs-since-08611、686入力のinputs-final/input-verification、コマンド別JSON/完全log、package-verification、evidence-hashes。初期変更・0.86.11の証跡は`.artifacts/settings-list-08611/`へ保持。最終画像/測定は`.artifacts/settings-hints-ui-1792859937761/`、`-1792859971768/`、`-1792860013324/`、配置は`.artifacts/settings-layout-1792860043707/`、smokeは`.artifacts/smoke-1792860060424/`。今回の成功は種類/実行方式別の直近3回と参照用証跡を保持し、他作業との共有/参照関係が不明な旧資料も保持。削除0件。未コミット、push/Release/実利用先deployなし。

## 2026-10-25: mainの設定インデックスとSection配置整理 0.86.10

- main `13ce177`上で、前回0.86.9の未コミット変更を保持して追加修正した。開始差分は`.artifacts/settings-ui-08610/baseline.patch`。dirty状態のpull/stash/branch変更は行わず、Fluid worktreeは変更していない。
- インデックスの通常項目・検索結果のフォーカス枠をボタン内側へ配置し、スクロール枠による欠けを解消。キーボードTabによるfocus-visibleを実際に発生させ、枠がボタン内に収まることを検査・目視確認した。
- 操作の許可はテーブル→「許可の適用とログについて」の順。通知は提供元別の種類→利用できない種類（存在時）→読み上げ→通知の受け取り方の順。表示時間とMCP連携の説明・設定リンクを受け取り方へ統合し、Windows通知の説明とMCPの接続条件の重複をまとめた。旧表示時間/MCP Eventの独立Sectionは削除した。
- タッチパッドは先頭の折りたたみ「動作設定」の最初に有効スイッチを配置。「Windowsとの接続」へ全10種類の接続キーと40個の修飾キーチェックをまとめ、Windows設定ボタンを共通Fieldへ配置。元の設定アンカー・即時保存・操作ハンドラーを保持した。共通指針/設定基盤/タッチパッド設計を現構成へ更新した。
- 型検査/build、固定lockfileの依存同期は終了0。翻訳・設定ナビゲーション・タッチパッドの模擬回帰は **18/18（fail/skip 0）**。設定モデル・保存形式・公開API・OS入力処理に変更なしの表示整理としてパッチ更新した。全標準回帰は未実行。
- 発行前レビューで未解決指摘なし。既存GUIのページ移動前の検索解除、本文内スクロールに対する旧フレーム判定、許可説明の旧配置期待を修正して再検証した。初回失敗ログは保存。ソースGUI3系統成功後に発行し、固定EXEでも`settings-layout-ui-test` **8群**、`settings-usability-ui-test` **9群**、`settings-layout-refinements-ui-test` **8群**、smoke（ok=true）が成功した。移動後のリンク/保存、閉じた設定への検索移動、明暗/1280・760幅、接続キーの折り返し・ページ外への横はみ出しなしを確認した。Pause/F13〜F24をOSへ送信・登録する実入力試験は行っていない。既存`touchpad-ui-test`の変更は構文検査のみ。実タッチパッド/Windows設定の書き換え・実サービス/実利用先では未確認。
- 本体/EXE/Default Shell/feedは **0.86.10**。`publish.bat`終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は170,676,501 bytes、SHA256 `c2f0ebfe9442334563570f38dfa20040b4dafcb0699f7c2b092b237bfb3d36d0`。feedのsize/hash、固定GUIのコピーと一致した。
- 証跡は`.artifacts/settings-ui-08610/`のbaseline、inputs-before/final（686入力）、input-verification、review、environment、コマンド別JSON/完全log、package-verification、evidence-hashes。固定GUI画像・測定は`.artifacts/settings-layout-1792858235647/`、`.artifacts/settings-usability-1792858252877/`、`.artifacts/settings-layout-refinements-ui-1792858274664/`。成功試験は種別/実行方式別の直近3回を保持し、今回の失敗調査と過去資料の参照/所有状況未確認分も保持。削除0件。未コミット、push/Release/実利用先deployなし。

## 2026-10-25: SettingsFieldタイトルの縦中央配置 0.86.9

- main `13ce177`のclean状態と追跡先origin/mainを確認し、通常ユーザー環境の`pull --ff-only`で最新取得済み。別worktreeのFluid UIは変更せず、既存のnative共通部品だけを修正した。
- タイトルの上8pxの固定余白を取り除き、タイトル・ヒントの共通行を最小32pxに統一。20pxのスイッチには上下6pxを確保し、入力行と中心をそろえた。説明文や複数行入力全体には中央寄せせず、wide・読み取り専用・狭い幅の縦積みではタイトルの最小高さを解除する。個別ページ、設定・保存ファイル・公開API・入力イベントは変更なし。配置の追加ルールを共通レイアウト指針へ記載した。
- 固定lockfileの依存同期後、型検査/buildは終了0。版更新直後の型検査は依存構造記録不一致で実行前に停止し、`install --frozen-lockfile`で同期後に同じ検査が成功した。依存版・lockfile・供給網検査は維持した。
- 発行前に差分と影響先を自己レビューし、未解決指摘なし。既存`settings-layout-refinements-ui-test.cjs`はソース版・固定EXEの各8群が成功。明暗テーマ、1280/760幅、グループ名、説明・通知・権限・AIダイアログ、ヒントOFF、入力確定・取消・保存を確認した。CSS変更のため無関係な全標準回帰は実行していない。
- `publish.bat`終了0。発行したEXEを隔離profileへコピーし、SHA256一致を確認して「音の再生」を測定。明暗ともタイトルとスイッチの中心差は約0.00001 CSS px、ヒントは0px。狭い幅で縦積み・タイトル最小高さ0pxを確認し、スクリーンショットを目視確認した。固定EXEのsmokeも終了0・ok=true。
- 本体/EXE/Default Shell/feedは **0.86.9**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は170,677,596 bytes、SHA256 `bca6fd435bd291e004aa49db3ae6a0aa44cb30024a985d6b88d4676c46cd0ef4`。feedのsize/hashと一致。通常の表示修正としてパッチ更新した。
- 証跡は`.artifacts/settings-field-title-0869/`のinputs-before/input-verification（686入力が検証前後一致）、review、コマンド別JSON/完全log、title-result、明暗/狭幅画像、package-verification、evidence-hashes。既存GUIのprofileは`.artifacts/settings-layout-refinements-ui-1792856786052/`と`-1792857017264/`、smokeは`.artifacts/smoke-1792857047620/`。未コミット、push/Release/実利用先deployなし。

## 2026-10-25: ジェスチャー表記・表示順0.86.8のコミット前照合

- 0.86.6〜0.86.8の表記統一と割り当て表示順に関する13ファイルを再レビューし、追加修正を要する指摘なし。実効author/committerとGitHub/AQUA両mainの開始先端`865e0240993eaf80eb132118aaf301d3001d56d2`を確認した。
- 実装時の756入力、228生成物、602 native出力、完全ログ15件、発行EXE/feedと固定GUI/smokeコピーのSHA256を現在の内容へ照合し、文書追記以外の差分なし。型検査/build、関連4ファイル48件、固定EXEのジェスチャー編集GUI・両表示順/絞り込みGUI・smokeの成功を再利用した。
- 未確認だった標準回帰108ファイル826件を追加し、再利用48件と合わせて **標準112ファイル・874/874成功、fail/skip 0**。共有ジェスチャー/翻訳グラフの変更に対する不足分だけを補い、確認済みの48件とGUIは再実行していない。製品ソース・版・発行物は変更せず、0.86.8を維持した。
- 証跡は`.artifacts/commit-validation-gesture-labels-0868/`のreuse.json、additional.json/log、stage.json、commit.json、push.json。stage/作業ファイル・最終commit tree・送信先mainを照合する。実装時の検証資料を保持し、Release/実利用先deployは行わない。

## 2026-10-25: タッチパッド表記と両ジェスチャーの割り当て表示順 0.86.8

- main `865e024`上の前回0.86.7までの未コミット変更を保持して追加修正した。開始差分と756入力は`.artifacts/touchpad-labels-20261025/baseline.patch`・`baseline-inputs.json`へ保存し、変更のある作業ツリーのpull/stash/branch変更は行っていない。
- 3本指/4本指のタップ・上下左右、計10種類を`3本指: 左`、`4本指: タップ`のようにコロンと半角空白で区切る表記へ統一。本体の既存翻訳キーの値を更新し、割り当てマーク・編集候補・実行順・接続設定が使う共通カタログへ反映した。固定ID・Windows接続キー・設定/保存ファイル/公開APIは変更していない。
- 同じコマンド内の割り当て表示を、マウスは1段階移動、2段階移動、クリック、ホイール、キーの順へ変更。タッチパッドは3本指、4本指の順、各タップ、上、下、左、右の順とした。rendererで共通カタログに沿った表示配列を作り、追加/編集/削除/実行順の処理には元の保存配列を渡す。同じ入力の複数行も元の順番を保つ。表示のための保存・移行・実行順変更はない。通常の表示修正として発行済み0.86.7からパッチ更新した。
- 発行前の差分/影響先の自己レビューで未解決指摘なし。固定lockfileのinstall、最終型検査、本体/Default Shell buildが終了0。関連4ファイルの回帰は **48/48（fail/skip 0）**。最後の追加指定ではrenderer/GUI検査/文書だけを変更し、共有処理・回帰試験の入力が不変な48件の成功を再利用した。依存版・lockfileは変更していない。
- 最終ソース版と固定EXEの設定GUI各12群で、新表記のマーク/絞り込み、意図的に混ぜた保存配列から指定順への表示、同入力の行順保持、表示前後の設定値/revision不変を確認。10種類を含むタッチパッド一覧とマウス一覧の画像を目視した。固定EXEのジェスチャー編集GUIも成功し、追加/再編集/取消/競合/実行順/保存/実プロセス再起動を検査。smokeも成功した。`touchpad-ui-test.cjs`の旧表記期待値は更新したが、同試験は実F13/F18を登録するため実行せず、無効な割り当てを使う隔離GUIを選んだ。物理マウス/指の操作、Windows設定変更、Pause/F13〜F24送信・登録、UAC/ロック画面の実入力は検証していない。
- `publish.bat`終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **0.86.8 / 170,683,419 bytes / SHA256 `3f93dc8e7c527247900be2accc9e2e727b7c2fe998b9b5bbccd3ad6f0dde6646`**。EXE FileVersion/ProductVersion・feed・同梱package/Default Shell、固定GUI/smokeコピーが一致。同梱228生成ファイルと602 native出力、756検証入力を照合し、検証後の変更は本検証文書だけとする。
- 証跡は`.artifacts/touchpad-labels-20261025/`のreview、入力manifest、コマンド別JSON/完全log、package-verification、file-version、validation、cleanup。今回の隔離profileの稼働プロセス0を確認し、現在の証跡と過去の参照/所有状況が未確認の資料を保持、削除0件。変更は未コミット、push/Release/実利用先deployなし。

## 2026-10-25: マウスジェスチャー表記の種類プレフィックス 0.86.7

- main `865e024`上の前回0.86.6の未コミット変更を保持して追加修正した。開始時の差分と756入力は`.artifacts/gesture-prefix-labels-20261025/baseline.patch`・`baseline-inputs.json`へ保存。作業ツリーに変更があるためpull/stash/branch変更は行っていない。
- 共通カタログの表記を`移動: 上`、`移動: 上, 下`、`クリック: 左`、`クリック: 中`、`ホイール: 上`、`ホイール: 下`、`キー: F1`に統一した。コロン・カンマの後ろは半角空白、2段階の種類名は先頭に1回だけとする。表示全体の翻訳テンプレートを使い、移動方向選択の短い方向名は独立して維持した。割り当てマーク・絞り込み・編集候補・実行順は共通カタログから取得する。保存ID/設定/ファイル/公開API/入力認識の変更を伴わないため、発行済み0.86.6からパッチ更新した。
- 発行前の自己レビューで未解決指摘なし。固定lockfileのinstall、型検査、本体/Default Shell build、関連4ファイルの回帰 **48/48（fail/skip 0）** が成功。依存版・lockfileを変更していない。既存GUI試験の表記期待値を更新し、移動・クリック・ホイールの選択、新マークの完全一致、実行順のラベルを確認した。
- ソース版と固定EXEの隔離GUIで、追加/再編集/取消/競合・実行順・設定保存・実プロセス再起動後の保持、明暗と1280/900/700pxを確認。固定EXEのマーク絞り込みGUI10群とsmokeも成功した。`移動: 上, 下`のマーク画像を目視確認し、文字の欠けを認めなかった。実入力注入はUI-onlyで省略し、物理マウス/UAC/ロック画面の実機確認とは区別する。
- `publish.bat`終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **0.86.7 / 170,686,384 bytes / SHA256 `5cb8809a23ff621a65479686aa9cd240ac605e0e743896ee56225117fa1671fe`**。EXE FileVersion/ProductVersion・feed・同梱package/Default Shellと固定GUI/smokeコピーが一致。同梱228生成ファイルと602 native出力、756検証入力を照合し、検証後の変更は本検証文書だけとする。
- 正本の証跡は`.artifacts/gesture-prefix-labels-20261025/`のreview、入力manifest、コマンド別JSON/完全log、package-verification、file-version、validation、cleanup。今回の隔離profileに対応する稼働プロセス0を確認。今回と過去の参照/所有状況が未確認の資料を保持し、削除0件。変更は未コミット、push/Release/実利用先deployなし。

## 2026-10-24: 移動ジェスチャーの割り当て表記 0.86.6

- cleanなmain `865e024`から開始し、`git pull --ff-only`で追跡先と最新一致を確認。1段階を`上`、2段階を`上, 下`のように方向名だけで表示し、移動方向と区切りの矢印を混同しない表記へ変更した。既存の本体翻訳リソースの方向名と、新設の`settings.gestures.movementSequence`テンプレートを使用する。対応言語は既存の日本語のみ。
- 共通カタログを使う割り当てマーク・絞り込み・実行順の選択肢へ反映。編集画面の方向ボタンは矢印アイコンを方向IDから取得し、翻訳文字列の先頭切り出しを廃止した。保存ID、設定項目、保存ファイル、公開API、入力認識を変更しない表示修正として、0.86.5からパッチ更新した。
- 発行前に差分と共有カタログの参照先を自己レビューし、未解決指摘なし。固定lockfileのinstall、型検査、本体/Default Shell build、関連4ファイルの回帰 **48/48（fail/skip 0）** が成功。最初の型検査はworkspace情報の再同期を要求されたため、既存の供給網検査を維持したinstall後に成功した。依存版・lockfileは変更していない。
- ソース版と固定EXEの隔離GUIで、`右, 上`の追加と`上, 下`への再編集、実行順のラベル・件数表示、方向ボタンの名前・同方向禁止、保存/取消/競合、明暗と1280/900/700px、実プロセス再起動後の保持を確認した。固定EXEのマーク絞り込みGUI10群とsmokeも成功し、マークによる絞り込みが保存状態やコマンド実行を変えないことを確認。方向ボタンと絞り込み画面の画像を目視した。入力注入はUI-onlyとして省略し、物理マウス・UAC・ロック画面の実入力検証とは扱わない。
- GUIの初回失敗は実行順選択肢の既存件数接尾辞を期待値から落とした試験側の問題で、件数を含めて修正後に成功。ASAR照合の初回失敗も検証側のWindowsパス区切りを修正して解消し、各失敗ログを保持した。発行の自動承認レビューは外部公開/配置の可能性を理由に一度拒否したが、呼出先の`publish: 'never'`とローカルpack・配置スクリプトのコピーだけであることを確認して同一処理を再申請し、実行許可後に成功した。
- `publish.bat`終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **0.86.6 / 170,677,345 bytes / SHA256 `de42d2658f44a08c9056f5e3d7e6eefc3c8c5e62f95dea484b85314a782e1135`**。EXEのFileVersion/ProductVersion、feed、同梱package/Default Shell、固定GUIのEXEコピーが一致。同梱228生成ファイル、602 native出力、756検証入力のSHA256一致を確認した。発行後の製品ソース変更なし。
- 証跡は`.artifacts/gesture-labels-20261024/`の入力manifest、review、コマンド別JSON/完全log、package-verification、file-version、validation、cleanup。今回の隔離profileに対応する稼働プロセス0。現在の証跡と、他作業の参照確認が未完了の過去資料は保持し、削除0件。コミット・push・Release・実利用先deployは行っていない。

## 2026-10-24: Fluidを含めずWebApplet設定基盤をmainへ移植 0.86.5

- cleanな本体main`63ca00a`とWebApplet main`ef4ecf7`を各追跡先からff-only取得し、更新なし。Fluid側`e8494b9`の宣言型一覧ダイアログの機能差分と、WebApplet `fb48e89`の管理ページ削除・設定集約を選択した。ブランチ全体のmerge/cherry-pickはせず、3方向比較でmainのnative部品を維持した。本体の元のUI・配色・密度・レイアウト・フォーカス、Select/Input/パレット、CSSなど31ファイルと依存・ビルド設定のハッシュが不変。Fluidのコード/依存/ビルド、後続の見た目調整、設定専用倍率は移植していない。
- 共通`list.draftAction`の宣言・検証、現在のAppletへ束縛したpage.action呼び出し、runtime交代の拒否、手動/取得中の入力を保つ推奨値合成、取消/画面変更後の応答破棄、画像の一時プレビューとOK時だけのimportを移植した。画像選択・一覧/ダイアログ/ナビゲーションには非表示の安定test IDだけを補い、既存のタグとクラス・操作契約を維持した。設定/保存ファイルの追加・移行はなく、本体mainは通常パッチ0.86.5。SDK宣言の最低対応版も0.86.5へ接続し、WebAppletは既に発行済みの0.4.0から0.4.1、minimumHostVersionは0.86.5とした。Default Shellのソース版0.0.0は変更せず、既存buildが同梱版0.86.5を生成する。
- 発行前レビューの未解決指摘なし。通常ユーザー環境で固定Node 24.22.1/pnpm 12.10.1のfrozen install・型検査・build・fixture build・WebApplet buildが成功。本体標準874/874、WebApplet単体2/2が成功。ソースGUIは設定一覧5、推奨取得/遠隔ページ8、動的ページ4の17群が成功した。新しい見た目・寸法・色・配置・画像比較assertは追加していない。
- 両publish終了0。最終固定EXEは設定一覧5群、推奨取得/画像/実プロセス再起動8群、画像ライブラリ9群、smokeが成功した。取消では設定と画像を保存せず、OKでだけ登録し、手入力・未確定入力・選択済み画像・旧icon・保存済みサイトID・アカウント名簿・Cookieを維持する。追加/編集/削除/順序/競合/フォーカス、共通画像選択、リモートページのbridge非公開、親停止時の破棄も確認した。固定profileは`web-list-ui-1792849177459`、`web-portable-1792849194462`、`image-library-ui-1792849485724`、`smoke-1792849523653`。ソースは`web-list-ui-1792848815545`、`web-portable-1792848820996`、`dynamic-pages-ui-1792848826589`。
- 画像ライブラリの初回試験は、mainで既に本体内表示となった画面を古い`/image-library.html`として待って失敗した。`image-library-ui-1792849224657`と失敗ログを保持し、試験の画面検出だけをsnapshot.navigation.routeと本体hostへ接続して再実行した。登録/選択/保存のassertは維持し、製品や配布物は変更していない。発行後の非同梱GUIスクリプト修正であり、これを参照しない874単体と他の成功GUIは入力を照合して再利用した。対象画像GUI9群と未実行smokeは同じEXEで成功した。
- EXE/FileVersion/ProductVersion/feed/同梱Default Shellは0.86.5で一致。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は170,681,235 bytes / SHA256 `c5ff249d053754066906497cec33e95922e5de3d6310ee065c57297c0bf18ffc`、ASAR `d3f02d6bfb5854cb02b4ec320406f59297263f30f18fe259a5e40e38d4ae0cfc`。out 228ファイルとwin-unpackedを照合した。WebApplet ZIPは5,427 bytes / SHA256 `e68b02a0024dd60e562141ca3c1c8941266b4fa4a8525288635a3830b68416d6`。版/minimumHost、runtime4ファイル、MIT License、既知の旧管理資産が含まれないことを照合した。
- 証跡は`.artifacts/web-settings-port/`のbaseline/web-baseline/extraction/review、各build/unit/source-gui/publish/fixed/fixed-remainingのJSON・入力manifest・完全log、package/verification.json、file-version.json、final-validation.json、cleanup-audit.json、commit-validation.json。画像試験修正以外の発行後差分は検証文書のみとする。実利用先・認証・実サービス・実キー/Pause/F13～F24登録や物理タッチの確認ではなく、隔離fixture/loopbackである。
- 元のFluid worktreeのHEADと未commit11ファイル、WebAppletのcodex/fluid-ui、試行06a6265を保持した。GitHub/AQUA本体mainは開始時63ca00a。WebAppletはGitHub main ef4ecf7、AQUA main 28476bc（前者に含まれる既存の差）を確認し、remoteを変更していない。ローカルmainのstage/commit treeと実効identityを別記録へ照合する。push・Release・実利用先deployは行わない。古い成功profile62件を、終了/成功・絶対パス・リンクなし・参照なしを確認して削除し、直近3回と参照/失敗/固定証跡48件を保持した。削除名とsuccess proofはcleanup-results、整理前後はcleanup-audit-before/cleanup-auditへ記録する。今回のprofile参照プロセスは0。

## 2026-10-24: 本体レビュー0.86.4のコミット・プッシュ前照合

- 実装時からの697入力、226生成物、完全ログ45件、発行EXEと固定GUI2種/smokeコピーのSHA256一致を確認した。型検査/build、標準866/866、固定EXE GUI9+7群、模擬native10件とsmokeの成功を再利用。製品修正・版更新・再発行は行わない。証跡は`.artifacts/commit-validation-host-review-0864/reuse.json`。
- 対象14ファイルを再確認し、追加修正を要する指摘なし。実効author/committerとGitHub/AQUA両mainの先端`15da4c5`を確認した。stage/作業ファイル・commit tree・送信先mainの一致は同ディレクトリの`stage.json`、`commit.json`、`push.json`へ記録する。検証資料は保持し、Release/実利用deployは行わない。

## 2026-10-24: 本体全体レビュー・最新mainとの統合 0.86.4

- `cd42150`の本体をmain/core、renderer/設定UI、shared/preload/Shell、.NET入力/Runtime/更新helper、ビルド/配布処理に分けてレビューした。途中の続行依頼でoriginをfetchし、ローカル修正と未追跡ファイルを退避して`git pull --ff-only`、最新`15da4c5`（Webアカウント一覧の共通化）へ更新後、競合なく適用した。統合前の全差分は`.artifacts/host-review-20261024/pre-merge-full.patch`へ保持。コミット・pushは行っていない。
- 修正は5点。古い設定画面の非同期コールバックが後から届いた値を比較元にして上書きする問題、停止タイムアウト後の旧Appletプロセスのexit/error/出力が再起動先へ作用する問題、名簿保存途中に同期されたWebアカウント名簿を上書きする競合、取消済みAIモデル一覧の再取得と旧要求の終了処理が新要求へ干渉する問題、キー解放のないPauseイベント列で押下ラッチが残る問題に対応した。
- 設定クライアントは入力時点の保存値とrevisionを捕捉し、待ち行列中の自分の成功差分だけを後続入力の比較元へ反映する。外部からマージされた値と失敗中の表示値を比較元へ混ぜず、フォーム/JSONの連続・交互完了、同一項目の競合、不正入力の修正、リサイズ後の再編集を15件で確認した。待ち行列が空になれば成功差分履歴を破棄する。
- フォルダー一覧部品の候補修正は、唯一の呼び出し元が既に関数型の更新で最新のダイアログ入力を維持していることを確認して除外した。追加GUI試験のtop-level string-listは現行manifestで許可されない定義だったため、その失敗を製品不具合として扱わず、試験コードも除外。失敗資料は保持した。
- 先行実入力試験で通常Pauseが窓へ届かなかった件は、利用者がPauseをブロックしていたと確認した。この失敗を製品修正の根拠にしない。実入力の追加fixtureを、`InputTests --gesture-key-state <InputHost.dll>`のメモリー上のフックハンドラー呼び出しへ置換した。修正前の隔離DLLではラッチが残る検査で失敗（期待終了1）、修正後/発行同梱DLLでは10/10成功。OSフック登録・SendInput・前面変更・メッセージポンプなし。利用者の指定以降、Pause/F13〜F24の実キー送信・登録は行っていない。継続ルールを本体AGENTSへ追記した。
- 設定・保存ファイル・公開APIの追加/削除を伴わない修正のため、取り込んだ0.86.3から0.86.4へパッチ更新した。固定lockfileで依存状態を同期し、既存の供給網検査を保持。依存版・lockfile・toolchainは変更していない。制限環境のDNS/.NET/Electron起動などの失敗は資料を保持し、必要な同一処理を通常ユーザーの実行環境で確認した。追加native fixtureの不足import、隔離した修正前ビルドの共通props参照、ASAR照合のWindows区切りとbuilderのpackage変換は検証側で修正し、製品の変更へ含めていない。
- 最終型検査/build、標準回帰866/866（失敗・skip 0）、開発版設定入力GUI9群、固定EXEの設定入力9群・Webアカウント7群・smokeが成功。入力確定/取消・不完全数値・IME、名簿操作/警告確認・参照中ガード・明暗/狭幅・実プロセス再起動後の保持を検査し、画像も目視確認した。確認画面の応答はfixture。最終697入力の試験前後SHA256一致、同梱生成207ファイルとInputHost DLLのビルド出力一致を確認。完全ログ・入力hash・結果の正本は`.artifacts/host-review-20261024/validation.json`、`package-verification.json`。
- 最初の発行前停止指定は、続行中の利用者による発行許可で変更された。`publish.bat`成功。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は170,673,006 bytes、SHA256 `6d917e25ccc3801ca1a25b7442373d753feabaa3ee1d4126cf907226599af021`。EXEのFileVersion/ProductVersion、feed、同梱package/Default Shellは0.86.4で一致し、固定GUI2種/smokeのEXEコピーも同一hash。配置用ファイル4件を保持した。
- 今回の試験プロセス0を確認。今回の証跡、過去の参照資料、状態/所有者不明の22フォルダーを保持し、試験ディレクトリの削除0件。作業用stashは全差分を上記patchへ保存してから解除した。実サービスのAI/認証・複数PCの実同期・物理Pause/F13〜F24の動作は未検証。未変更Appletの再発行・全体ZIP作成・commit/push/Release/実利用deployなし。

## 2026-10-24: Webアカウント設定0.86.3のコミット・プッシュ前照合

- 実装時の653入力・完全ログ15件と現在のSHA256一致、発行EXEとGUI2種/smokeコピーの一致を確認し、型検査/build・関連26件・固定EXE GUI7+10群・smokeの成功を再利用した。未実行だった残りの標準回帰825件を通常権限で追加実行し、合計851/851成功、fail/skip 0。実装時からの製品変更・版更新・再発行なし。
- 対象12ファイルを再レビューし、追加指摘なし。実効author/committerとGitHub/AQUA両mainの開始時先端`cd42150200470d879bb8625d519598ea7c2aa447`を確認した。stage/作業ファイル・最終tree・commitと送信先mainの照合は`.artifacts/commit-validation-web-account-list-0863/`へ記録する。実装時の資料と今回の回帰ログは保持する。GitHub Release/実利用deployは行わない。

## 2026-10-24: Webアカウント設定の共通一覧化 0.86.3

- cleanなmain `cd42150`から開始し、`git pull --ff-only`で最新一致。設定・保存ファイル・公開APIの変更を伴わないレイアウト変更のため0.86.2→0.86.3へパッチ更新した。今回分は未commit、push/Release/実利用deployなし。
- アカウントごとの独自カードを「名前・使用先・操作」の3列へ変更。件数・上限、見出し横の共通＋、32pxのクリア/削除アイコンを配置し、名前のblur/Enter確定・Escape取消・IME/二重送信抑制、使用中の削除禁止、ホストの警告確認と保存処理を保持した。既存SettingsListTableの表枠をSettingsListLayoutとして共用し、使用先の折り返しと入力幅を共通CSSへ集約。重要な説明と共通エラー領域を維持した。追加ルールはdocs/settings-list-editing.md、利用仕様はdocs/web-applets.md。
- 発行前自己レビューを1回実施。折り返し指定が後続のnowrap指定に上書きされる問題を修正し、長い使用先名のGUIで再確認した。未解決の製品差分指摘なし。型検査/build、関連回帰26/26（WebProfileStore、PageCollection、設定編集、object-list、翻訳）成功。標準全回帰は表示変更に対する実装段階の範囲として未実行。
- 隔離したソースGUIでWebアカウント7群と既存一覧10群が成功。発行EXEでもWebアカウント7群、共通一覧10群、smoke成功。明暗・通常/最小幅（1280/760指定、ウィンドウの最小幅制約あり）・ヒントON/OFF、長い名前/使用先、空/32枠上限、Enter/blur/Escape/IME、不正入力保持とエラー時の配置、参照中ガード、クリア/削除の取消/確定、実プロセス再起動後のID/名前保持を確認。画像も目視確認した。renderer error 0。確認画面の応答はfixtureで与えたもので、Windowsネイティブ画面の物理操作・実ログインは未検証。
- 固定EXEの最初の2回は、サイズ変更のviewport操作と試験の設定変更が重なりrevision競合を検出した。試験側だけを、名前確定後のflush、表示ページからのテーマ変更、リサイズ後のhostWidth投影一致待ちへ修正し、同じEXEで再検証して成功。発行後の製品変更はない。途中の失敗ログも保持した。制限内のDNS・一時ファイル置換EPERM・GUI接続EACCES・依存確認停止は、同じ処理を通常権限で実行して確認した。依存版/lockfile/供給網検査は維持。
- `publish.bat`成功。EXEのFileVersion/ProductVersion、update.json、同梱package/Default Shellは0.86.3。170,670,769 bytes、SHA256 `569880f5ef3c87b9e30124d149b0a47987ee5c00b0d6deb5809c210760460714`。GUI2種とsmokeコピーの一致、同梱日本語JSONとソース一致、653入力の最終hashを確認。証跡は`.artifacts/web-account-list-20261024/validation.json`、review.json、完全ログ。固定GUIは`.artifacts/settings-hints-ui-1792773000143/`と`settings-hints-ui-1792773030646/`、smokeは`.artifacts/smoke-1792773062333/`。
- テストランナーの終了を確認。今回の成功/失敗profileは検証資料として保持し、既存の関連24資料は他作業の使用状況・再利用保護を未確認のため自動削除せず、削除0件。確認結果と一覧はcleanup.json/cleanup-inventory.jsonへ記録した。

## 2026-10-24: 共通処理翻訳0.86.2のコミット前照合

- 実装時と現在の686入力、完全ログ10件、native出力2件、固定EXE/同梱日本語JSON/Default Shell、GUI・smokeコピーのSHA256一致を確認した。型検査/build、最終標準851件、固定EXEの設定翻訳GUI7群・共通サービスGUI4群・smokeの成功を再利用。途中段階の対象37件は最終851件に包含されるため、最終ソースの証明には使わない。
- 実装後の製品変更なし。追加はこの検証記録だけで、版更新・再発行・回帰再実行は行わない。レビューの未解決指摘なし、対象108ファイルと実効author/committer、stage/作業ツリーの一致を確認する。照合・stage/commit tree・commit SHAの正本は`.artifacts/commit-validation-localization-0862/reuse.json`。push/Release/deployは行わない。

## 2026-10-24: 共通サービス結果・標準ダイアログの日本語リソース移行 0.86.2

- 先行0.86.1の685入力・完全ログ・固定EXE/同梱JSONを照合し、標準848件とGUIの成功を再利用して`3de77a6`へコミット。87ファイルのstage/commit tree一致を確認した。証跡は`.artifacts/commit-validation-localization-0861/reuse.json`。その後cleanなmainで`git pull --ff-only`は最新一致。今回0.86.2分は未commit。
- 本体TypeScriptの共通サービスと共有検証100モジュールを移行。AI/MCP/TTS、音声、更新、Applet管理、設定保存/復旧、Webアカウント、画像、通知、Shell/入力/コマンドの結果・状態説明、および本体標準ダイアログの本文/説明/ボタン/画像フィルターをJSONへ抽出した。日本語リソースは1,816→2,897項目。Applet自身の文言と、受け取った名前・OS/外部エラー詳細は無変換。設定項目・保存ファイル・公開操作の変更がないため0.86.2へパッチ更新。
- 発行前自己レビューと修正確認を実施。通知件数、Applet操作、AIエラー、ページ説明、更新要約を文章単位に整理した。保存初期値と旧データの判定を兼ねるWebアカウントの仮名は翻訳辞書から除外し、文言編集が既存データの判定へ影響しないよう維持した。100ソースの非日本語リテラル比較で削除は辞書へ移した`OK`2か所と通知タイトルの区切りだけ。操作ID/エラーコード/権限/ボタン順序/既定・キャンセルIDを保持し、未解決指摘なし。`review.json`/`literal-review.json`参照。
- 型検査/build、最終標準回帰851/851成功（失敗・skip 0）。日本語再混入検査をmain共通サービスへ広げ、差し込み変数の一致、入力名と外部文字列の保持、更新の詳細と安全な通知要約を検査した。686入力の試験前後SHA256一致。固定依存・lockfileを保持し、`install --frozen-lockfile`の408件のsupply-chain検査も成功。制限環境のWindowsファイル操作/Electron/.NET発行失敗はログを保持して同じ処理を通常ユーザーで再実行した。
- 固定EXEの設定翻訳GUI7群成功（`.artifacts/settings-hints-ui-1792770668604/`）。17ページ×明暗×1280/760の68画面、未翻訳キー/横溢れ、先頭の日本語1択、入力保存/検索/JSON拒否、カスタム名、実プロセス再起動を確認。固定EXEの共通サービスGUI4群成功（`.artifacts/settings-hints-ui-1792770710209/`）。ローカルHTTP 401からAI設定画面への日本語エラー表示、アカウント削除/クリアと画像選択のElectronダイアログ引数、取消時の保持と確定時の対象限定を検査した。使用中セッションの削除保留も既存仕様どおり。画面を目視確認し、renderer error 0。ダイアログ応答はfixtureでありWindowsネイティブ画面のレイアウト/物理操作の証明ではない。
- `publish.bat`と固定smoke（`.artifacts/smoke-1792770725044/`）成功。EXEのFileVersion/ProductVersion/feed/Default Shellは0.86.2、170,667,000 bytes、SHA256 `e376baac66911aeeb657771f4d50ae490367810d2a839e011014162a3d19aa6e`。GUI2種/smokeコピーのhashとASAR内日本語JSONのソース一致を確認した。正本は`.artifacts/localization-services-20261024/validation.json`、完全ログ・入力hash・`artifacts.json`。
- 本体rendererの残り、Default Shell固定文言、.NET補助プログラム自身の診断は次段階。Applet翻訳、多言語切替、外部AI/MCP/TTS・実UAC・実入力機器は対象外/未検証。今回のテスト終了処理成功、参照可能な隔離profileプロセス0。既存証跡・不明/失敗資料は保持し、試験ディレクトリ削除0件、今回の使い捨て編集補助4ファイルのみ削除。push/Release/実利用deployなし。

## 2026-10-24: 本体設定画面の日本語リソース移行 0.86.1

- 先行0.86.0を依頼どおり755c6b8へコミットし、stage/commit tree一致を確認。その後cleanなmainでgit pull --ff-onlyは最新一致。今回分は未commit。設定項目・保存ファイル・公開操作の変更を伴わない文言抽出のため0.86.1へパッチ更新した。
- 設定17ページの本文・選択肢・ヒント・検索・アクセシブル名、共通の一覧/編集/並べ替え/確認部品と、共有入力検証・設定操作・一部の設定状態診断をJSONへ移行。日本語リソースは259→1,816項目。カスタムコマンド、リボングループ、接続名、Applet提供文言は入力されたまま表示する。HostMessageは強調等のReact nodeを翻訳後に挿入し、HTMLとして解析しない。現行範囲と残りはdocs/localization.mdに整理。
- 発行前自己レビュー1回と修正確認を実施。文章断片を名前付き差し込みへ統合、表示文字列による分岐を安定したinputKindへ変更、従来の検索文言を保持、未定義になり得る差し込み値を正規化。80ソースのAST比較で既存の非日本語リテラルの削除0件、保存ID/操作IDの保持を確認。未解決指摘なし。review.json/literal-review.jsonを保存。
- 型検査/build、標準回帰848/848成功。設定renderer全体と移行済み共有部品の日本語直書き再混入検査を拡張。685入力の試験前後SHA256一致。バージョン変更後のworkspace検証はinstall --frozen-lockfileで更新し、固定依存・lockfileと408件のsupply-chain検査を維持。制限環境のCOM/ファイル置換、Electron、.NET発行失敗は同じ処理を通常ユーザーで再実行した。
- 固定EXEの翻訳GUI7群成功（.artifacts/settings-hints-ui-1792768204223/）。17ページ×明暗×1280/760の68画面、未翻訳キー/外側の横溢れ、先頭の日本語1択、検索/保存/JSON拒否、実再起動を確認。HTML風文字・{{name}}・$t(...)を含む接続名の確認ダイアログで無変換と取消後の保持も確認。settings.jsonという実ファイル名と翻訳キーの衝突による試験側の誤検出を修正した。
- 固定EXEの一覧操作GUI10群（.artifacts/settings-hints-ui-1792768268820/）成功。8一覧の明暗/狭幅、3入力方式のフィルター、ショートカット/マウスの直接編集・実行順・即時削除・取消・フォーカス、ヒントOFFを検査。renderer error 0。固定smoke（.artifacts/smoke-1792768340693/）も成功。AI/権限/通知/リボンの画像を目視確認した。
- publish.bat成功。固定EXEはFileVersion/ProductVersion/feed/同梱Default Shellとも0.86.1、170,651,295 bytes、SHA256 `8ff4f3056cf0e7e565af3538f570118ea3d0477cb761669b4c7ada237fb6e00e`。GUI2種/smokeコピーのhash、ASAR内日本語JSONとソースの一致を確認。正本は `.artifacts/localization-settings-20261023/validation.json`、完全ログ・入力hash・artifacts.json。
- 共通サービスが返す実行結果/native確認画面と他の本体ページは次段階。Applet自身の翻訳、多言語切替、外部AI/MCP/TTS・実入力機器・実UACの操作は未検証。テスト終了処理成功、参照可能な隔離profileプロセス0。保護すべき既存証跡・不明/失敗資料は保持し、試験ディレクトリ削除0件、今回の使い捨て編集補助6ファイルだけ削除。push/Release/実利用deployなし。

## 2026-10-23: 翻訳基盤0.86.0のコミット前照合

- 実装時の685入力・完全ログ・固定EXE/同梱JSONのSHA256一致を確認し、型検査/build・標準848件・固定EXE GUI6群・smokeの成功を再利用。製品変更・版更新・再発行なし。利用者による動作確認も受領した。
- 対象差分を再確認し、実効author/committer、stageと作業ファイル・commit treeを照合。証跡は `.artifacts/commit-validation-localization-0860/reuse.json`。このコミット後に残りの本体設定文言を移行する。push/Release/実利用deployは行わない。

## 2026-10-23: 本体翻訳基盤・表示/一般設定 0.86.0

- cleanなmain（e6c95db、origin/main追跡）から開始し、git pull --ff-onlyは最新一致。host.language設定追加のため0.85.9→0.86.0。i18next 26.4.7/react-i18next 17.0.19は公開後7日条件を満たす固定版を導入し、既存のsupply-chain検査・固定lockfileを維持。
- 日本語259項目をsrc/shared/locales/ja/host.jsonへ抽出し、表示/一般本文・設定共通部品・検索/ヒント/ダイアログ・関連状態/入力エラーを接続。「表示→共通」の先頭は表示言語、日本語だけ。端末専用・既定ja・既定省略・部分JSON/リセット/公開定義を統合。入力されたコマンド名・リボングループ名・外部文字列は翻訳せず保持。設計と段階移行方針はdocs/localization.md、README不変。
- 発行前自己レビュー1回を実施。インスタンス間の辞書共有を分離し、動的キーの広い型キャストを除去。文言抽出で処理条件・保存ID・Windows操作を変更しないことを確認。新設定の既存期待値2か所と、新GUI試験の検出条件を補正。未解決指摘なし（.artifacts/localization-20261023/review.json）。
- 型検査/build、対象117件、最終標準回帰848/848成功。dev.bat testは前提ビルド後に既存期待値1件で失敗し、期待値更新後のnode --test tests/*.test.cjsで全成功。685入力の前後SHA256一致を記録。制限内の.NET/GUI/COM/ファイル置換失敗は検査を弱めず通常ユーザーで再実行した。
- 固定EXE GUI6群成功（.artifacts/settings-hints-ui-1792765111429/result.json）。先頭位置・日本語1択・検索・即時保存・未対応言語拒否/入力保持・共通ヒント・明暗×1280/760・一般トグル・カスタム名無変換・実プロセス再起動を確認。8画像と通常/狭幅の目視確認、renderer error 0。smoke（.artifacts/smoke-1792765175982/）も成功し、隔離AppDock残存0。実UAC承認・Windowsタスク変更・native復旧ダイアログの実操作は未検証。
- publish.bat成功。A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exeはFileVersion/ProductVersion/feed/同梱Default Shellとも0.86.0、170,638,878 bytes、SHA256 86fa93fa2a2e23c446302ec0367be27467f9ba9124fc73dc3d4d9360edb9c247。GUI/smokeコピーのhash一致とASAR内日本語JSON一致を確認。検証正本: .artifacts/localization-20261023/validation.json、完全ログ・入力hash・artifacts.json。
- 本体の他ページとApplet自身の翻訳、多言語の実切替、日時/地域形式は未対応。commit/push/Release/実利用deployなし。既存証跡・状態不明/失敗資料は保持し、試験フォルダー削除0件。今回作成した使い捨て編集補助5ファイルだけ削除、検証スクリプトと証跡は保持。

対象の現行版は`0.85.9`。以下は記録した条件での検証結果であり、外部サービスや実機条件の現在の動作保証とは区別する。

## 2026-10-23: メディア・音量送信0.85.9のコミット・プッシュ前照合

- main 34c1f14上の先行変更7パスを今回の対象として確認し、未コミット変更を保持した。情報の追加はWindowsTools側の12件descriptionとterminalの実行エイリアス修正で、本体は製品を追加変更していない。実効author/committerとGitHub/AQUA両mainの開始時一致を確認した。
- 前回の入力最終hashと現ソース・型検査/build/関連JS10件・固定EXE・入力7群・smoke・完全ログを照合して再利用。標準109ファイルのうち変更試験はinput-command.testだけ。compiled input-commandへの依存グラフは当該試験だけで、process-launchの6件を含む実装時10件が該当する旧成功を置き換える。他832件は0.85.8の成功と全108試験/関連入力の一致から再利用し、合計 **842件成功・fail/skip 0**。設定/renderer/他サービス/公開API・依存は変えていない。
- SDK parsingはWindowsToolsの42件で新旧キー・記号解決を確認済み。本体を再発行せず、0.85.9 EXE（170,504,756 bytes／SHA256 `39297303f8e28aa28bb7bb2899a0eb96934c224b76118f39d654ef0c1f9c0514`）を維持した。新しいWindowsTools 0.2.4と組み合わせた固定GUI7群は実行し、91件の説明・実Terminal起動と新規窓だけの終了・終了選択画面/取消・設定/API/停止/再起動を確認した。
- 正本: `.artifacts/commit-validation-media-keys-20261023/reuse.json`、前工程 `.artifacts/media-keys-20261023/validation.json`、WindowsTools `.artifacts/commit-validation-system-commands-20261023/validation.json`。stage/commit treeと送信先mainは今回の証跡へ記録。コミット時の製品変更・版更新・再発行なし。GitHub Release・実利用deployなし。再利用/途中失敗/状態不明の資料を保持し、削除0件。

## 2026-10-23: メディア・音量の送信キー追加（0.85.9）

- main 34c1f14／clean／origin/main追跡からpull --ff-onlyで更新なし。WindowsToolsの12コマンド追加に合わせ、共通送信文法のTypeScriptとSDK InputKeyChordへMediaPlayPause/Stop/NextTrack/PrevTrack、VolumeMute/Up/Downを追加。既存InputSenderの押下・解放送信を使用し、受信フック・登録/記録文法・設定・保存ファイル・既存APIの名称/許可/寿命は維持した。WindowsToolsは0.2.3、最低本体0.85.9。
- 発行前レビューは阻害指摘なし。設定/保存ファイルの増減や破壊的変更がないため0.85.8→0.85.9のパッチ更新。型検査、input-command/process-launchの関連JS **10/10**、WindowsToolsのSDKを含む.NET **42/42**、発行DLLの実プロセス/模擬API試験が成功。
- 最終固定EXEのnative-input-ui-test **7群** が成功。7つのメディア/音量キーを専用WinFormsへ実送信し、既存Node Applet11コマンド・ローカル/MCPの保存コマンド・sendInputの独立許可・許可撤回/前面変更/取消・記号の配列解決・連続ジェスチャーに150ms待機を課さない契約も確認した。キー送信の成功と実プレイヤー/スピーカーの効果は区別し、後者は未確認。
- WindowsToolsの最終固定EXE GUIで91件のコマンドと説明、設定変更/再起動/停止後の状態、MCP設定経路と旧値保持を確認。追加した終了選択画面コマンドから実際の「Windows のシャットダウン」ダイアログが開き、選択欄・OK・キャンセルを確認してキャンセルした。実シャットダウン/再起動/サインアウトは模擬起動要求だけを検証し、実行していない。固定EXEのsmokeも成功。
- 既存publish.batで40.ARTIFACTへ発行。EXE/FileVersion/ProductVersion/feedは0.85.9、170,504,756 bytes／SHA256 `39297303f8e28aa28bb7bb2899a0eb96934c224b76118f39d654ef0c1f9c0514`。Default Shell同梱と隔離EXE起動を確認。全体ZIP、他Appletの再発行、commit/push/Release/実利用deployなし。
- 証跡: `.artifacts/media-keys-20261023/validation.json` と完全ログ、`.artifacts/native-input-ui-1792760127527/result.json`、`.artifacts/smoke-1792760209974/result.json`、WindowsTools `.artifacts/system-commands-20261023/`と `.artifacts/host-1792760191365/`。版更新でpnpmのinstall状態の差が検出されたため固定lockfileの通常installで同期。制限内.NET発行/EXE起動の失敗を保持し同一処理を通常ユーザーで成功させた。発行後は試験スクリプトの期待値/表示参照/DPI画像取得だけを修正し、製品入力のhashは不変。必要範囲外の全回帰は未実行。過去の再利用/失敗資料と状態不明資料を保持し、テストフォルダー削除0件。

## 2026-10-23: 設定一覧UI 0.85.8のコミット・プッシュ前照合

- 利用者が確認した一覧スクロール・一時フィルター・全設定のヘッダー・一般設定/操作許可の整理を、`main`の`e258a2d`上の38パスとしてレビューした。先行のタッチパッドcommitも未pushで、GitHub/AQUAのmainはともに`afd97ab`を確認した。未コミット変更を保持し、読み取りのfetchのみ行った。実効author/committerとrepo-local設定は一致し、Git設定を変更していない。
- 最終672入力・完全ログ・GUI結果・固定EXEコピーを照合し、0.85.8の型検査/build・固定GUI **56群**・smokeを再利用した。発行EXEのsize/SHA256/feed/版は前節の値を維持し、コミット時の製品修正・版更新・再発行は行っていない。
- 109個の標準JSファイルは先行commit時から不変。親commitの標準回帰証跡から、変更された設定カタログへ依存する経路とrendererソース検査を抽出した。今回 **9ファイル77件** を追加確認し、実装時の4ファイル28件・影響のない96ファイル737件と合わせて **842件成功、fail/skip 0**。制限内の一時ファイルrenameのEPERMは失敗ログを保持し、同じ9ファイルを通常ユーザー権限で再実行した。新しい試験名と先行標準ログの一致、対象処理/依存/ツールチェーンの照合を記録した。
- 証跡は`.artifacts/commit-validation-settings-ui-0858-20261023/validation.json`と`reuse.json`。stage内容/作業ファイル・stage tree/commit tree、両送信先mainの照合は同ディレクトリの`commit.json`・`push.json`へ記録する。先行の再利用証跡・途中の失敗を保持し、今回の一時GUIフォルダー削除は0件。Release公開・実利用先deployは対象外。

## 2026-10-23: 一時フィルターの行高維持・全設定の外側スクロール・一般設定のボタン整理（0.85.8）

- `main`の`e258a2d`（origin/main追跡、ahead 1）で先行変更を保持して着手し、未コミット変更があるためpull/stashは行っていない。一時フィルターは32pxへ縮め、通常の操作ボタンと高さを揃えた。狭幅は件数/フィルターの2段分を常に確保し、表示・×解除で行の高さを変えない。長い対象名の折り返しとアクセント装飾は保持する。
- `SettingsPageLayout`を全本体ページ・Applet設定・フォーム/JSONで共通の外側スクロールに統一した。タイトル・説明・上部操作も本文と一緒に動き、一覧フィルターの固定とテーブルだけの横スクロールを維持する。JSON入力欄のスタイルを新しい本文枠へ接続し、フォーム/JSONの往復で値を変更しないことを確認した。
- 一般の「Applet・MCPからの操作」案内カードと検索用の案内項目を削除し、保存済みの操作許可は維持した。設定ファイルの状態は共通Fieldを直置きし、再起動・バックアップ復元・保存先・中断したWindows起動設定の復旧を同じボタン列へ集約した。`SettingsActions`で間隔/上下余白を12px、折り返しを共通化し、`SettingsContent`を構造を持つウィジェットの枠として追加した。9フォームの該当divを置き換え、AST確認で個別画面のSettingsSection直下のdivは **11→0**。追加規則は`docs/settings-ui-guidelines.md`、現行構成は設定基盤/一覧編集の文書へ反映した。
- 型検査・ビルド・関連JS **28/28（fail/skip 0）** が成功。最終ソースの一覧移動/実際の入力フィルター解除 **10群** とスクロール **38群** が成功し、一般のボタン列を含むソースレイアウト **8群** も確認した。最終固定EXEでは同じ **10＋38＋8＝56群** とsmokeが成功した。明暗・1280/760幅・低い画面、全13種の他設定/Fixture Applet、フォーム/JSON、長い名前、×と全体解除、フォーカス復帰、保存しないこと、全体スクロールと固定フィルターの組合せを含む。
- 発行前レビューと再確認を実施。0.85.7固定EXEで実際に×を押す検査を追加し、狭いジェスチャー画面で71.33px→48pxの高さ差を検出した。container query自体は適用されていたが、共通CSSのflex指定が後勝ちしていたため、狭幅のgrid指定を`.settings-panel`で限定して優先させた。ソースの実解除/スクロールと最終固定EXEで再検証し、未解決の阻害指摘なし。0.85.7を完成版と扱わず、製品CSSの追加修正を **0.85.8** として再発行した。途中の失敗/診断ログを保持する。
- `publish.bat`終了0。発行EXE/feed/Default Shell/FileVersion/ProductVersionは **0.85.8**、**170493755 bytes / SHA256 `ca40737bc32ed90af6aa456b7271a427e8f892785a3e715e0519ccf7645f8903`**。固定GUI3種類とsmokeのコピーも一致した。制限環境での.NET発行失敗は通常ユーザー権限で同じ手順を実行して切り分け、依存・lockfile・検査方針を維持した。
- 証跡は`.artifacts/settings-page-layout-20261023/validation.json`。最終GUIは`.artifacts/settings-hints-ui-1792756868399/`・`.artifacts/settings-hints-ui-1792756898467/`・`.artifacts/settings-layout-refinements-ui-1792756937055/`、smokeは`.artifacts/smoke-1792756967206/`。最終672入力hash一致。ソース試験後の版更新とCSS/GUI検査の差分を記録し、影響のないJS成功結果を再利用した。復旧ボタンの表示は隔離profile内の状態fixtureで確認し、Windows起動設定の復旧・再起動・フォルダー操作は実行していない。無関係な全回帰や物理入力試験は対象外。
- 対象テストプロセス0、整理での削除0件。今回の各方式の成功分は3回以内で、先行の再利用証跡と失敗記録を保護した。実利用の表示は確認待ち。コミット・push・外部公開・実利用先deployは行っていない。

## 2026-10-23: 一時フィルターの件数横への移動・アクセント装飾・操作許可のカード整理（0.85.6）

- `main`の`e258a2d`（origin/main追跡、ahead 1）で先行UI変更を保持して着手した。未コミット変更があるためpull/stashは行っていない。先行0.85.5の配置は利用者確認済み。
- Applet・コマンド・キー・ジェスチャーの一時フィルターを、対象名と×のまとまりごと表示件数の右へ移した。4画面で`CommandListSummary`を共用し、右端の操作、長い名前の折り返し、明暗の共通アクセント背景/文字/枠、×のhover/focus-visibleを揃えた。カスタムコマンドの件数と対象も同じ固定ツールバー内へ統合し、他の一般設定一覧のツールバー構造は保った。検索・解除範囲・保存・フォーカス復帰は既存の処理を維持する。
- 「操作の許可」は「許可の適用とログについて」の折りたたみカードを先頭へ移し、「APIの公開」の外側カードと見出しを外して、名前付きの権限テーブルをページ直下へ配置した。行順・許可値・警告・保存処理は変更していない。追加規則と現在の構成を`docs/settings-list-editing.md`・`docs/settings-foundation.md`へ反映した。
- 型検査・ビルドが成功。ソースGUIは一覧移動/一時フィルター **10群** とレイアウト **8群** が成功した。最終固定EXEでもスクロール/固定表示 **34群**、一覧移動/一時フィルター **10群**、レイアウト **8群**（合計 **52群**）とsmokeが成功した。明暗・1280/760幅、低い画面、長い対象名、Applet/コマンド/3入力方式、Enter/Space・×/全体解除・外部変更/空結果・フォーカス復帰・保存しないことを含む。スクリーンショットでアクセント表示と操作許可のカード順序・表の配置も確認した。
- 発行前の差分レビューで未解決の阻害指摘なし。追加したタッチパッド試験がApplet管理に存在しない移動ボタンを前提としていたため、現行のコマンド行から移動する入口へ試験を修正し再確認した。制限環境でのElectron CDP/.NET発行/CIMの失敗はログを保持し、同じ処理を通常ユーザー権限で切り分けた。製品の設定・依存・検査方針は変更していない。
- 表示だけの修正として **0.85.6** へパッチ更新し、`publish.bat`終了0。発行EXE/feed/Default Shell/FileVersion/ProductVersionは0.85.6、**170498326 bytes / SHA256 `a707ec605a32937c778bac9251e0e72c75aa143b07492f07bea99107280172b6`**。固定GUI3種類とsmokeのコピーも一致した。
- 証跡は`.artifacts/temporary-filter-row-20261023/validation.json`。固定GUIは`.artifacts/settings-hints-ui-1792754667006/`・`.artifacts/settings-hints-ui-1792754698877/`・`.artifacts/settings-layout-refinements-ui-1792754728713/`、smokeは`.artifacts/smoke-1792754757609/`。最終672入力hashが一致した。関連JS28件は対象処理・試験・依存と完全ログのhashを照合して先行証跡を再利用し、今回実行したGUI結果と区別した。無関係な全回帰・実サービス・物理入力は再実行していない。
- 対象GUIプロセス0、整理での削除0件。今回の成功分は方式ごとに3回以内で、先行の再利用証跡と失敗記録を保持した。新版の実利用表示は利用者確認待ち。コミット・push・外部公開・実利用先deployは行っていない。

## 2026-10-23: 外側の縦スクロール・カード撤去・Applet管理の固定フィルター（0.85.5）

- `main`（`e258a2d`、origin/main追跡、ahead 1）の未コミット0.85.4を保持して追加修正した。dirtyのためpull/stashを行っていない。ショートカット／マウスジェスチャー／タッチパッドジェスチャー／カスタムコマンドとApplet管理のフォームで、ページタイトル・説明・上部操作欄と本文を同じ外側の縦スクロールへ収めた。上部が画面外へ流れた後もフィルターだけが表示枠上端に残る。4画面のテーブル用横バーは下端に保持し、他の設定ページとJSON編集の構成は維持した。
- 4画面の「割り当て」「登録済みコマンド」カードを共通`CommandListSection`へ置き換えた。外枠・余白・見出しを外し、フィルターと一覧を直接並べる。検索アンカー、アクセシブルな名前、無効状態・上限・利用できる種類等の必要な説明、既存の操作と保存経路は保った。Applet管理の検索・件数・並べ替えも共通`CommandListToolbar`で固定し、導入可否・検出の説明は固定領域の外へ置いた。
- フィルター背景はページの背景色に揃え、枠のない配置になじませた。固定中は後ろの行の文字が透けて重ならない。明暗テーマの背景一致、カードの境界/見出し/内側余白がないこと、ヘッダーと上部操作欄が表示枠の外へ流れることをGUIで確認した。カスタムコマンドへ検索機能は追加していない。
- 型検査・ビルドが成功。ソースGUIと最終固定EXEの双方で、スクロール等 **34群** と一覧間移動 **7群** が成功し、固定EXEのsmokeも成功した。4画面×明暗×1280×900/760×900/760×640の24条件、空の検索結果・復帰、ダイアログ取消後の位置/フォーカス、動作設定展開、JSON往復を確認した。Applet管理は明暗×1280/760の4条件で、ヘッダーの消失、検索/件数の固定、固定後の検索・解除を確認した。24個の無効なローカルfixtureを使い、実利用のApplet・設定へ変更していない。
- 発行前レビューで対象5フォーム、他ページ/JSONへの非影響、検索アンカー、状態説明、背景・重なり順、縦横位置とフォーカス復帰を確認し、未解決の発行阻害指摘なし。外側スクロールへの変更後、タッチパッドのフィルターへ固定のスクロール量では届かなかったため、試験位置を実際のフィルター位置から求めるよう修正した。失敗ログを保持し、製品の固定不良とは区別した。
- 保存項目・保存ファイル・公開API・入力フックを変更しない表示修正として **0.85.5** へパッチ更新。`publish.bat`終了0。最終EXE/feed/Default Shell/FileVersion/ProductVersionは0.85.5、**170500909 bytes / SHA256 `270ba00bd72d808a74863a7d9b8093124aaae8a5ae66ff5957a982f7fdc11d32`**。2つの固定GUIとsmokeのコピーが一致した。
- 証跡は`.artifacts/command-list-outer-scroll-20261023/validation.json`。固定GUIは`.artifacts/settings-hints-ui-1792753075710/`・`.artifacts/settings-hints-ui-1792753107566/`、smokeは`.artifacts/smoke-1792753131700/`。最終672入力hashは一致。先行JS28件は対象処理・テスト・依存が一致するため前節の証跡を再利用し、今回のGUI結果と区別した。無関係な全回帰・インストール/更新/実サービス・native/物理入力の試験は再実行していない。
- 対象テストプロセス0、整理での削除0件。今回の新しい試験は方式ごとの成功3回未満で、過去の再利用証跡と失敗記録を保持した。実利用の表示は利用者確認待ち。コミット・push・外部公開・実利用先deployは行っていない。

## 2026-10-23: コマンド一覧4画面のスクロールと固定フィルター（0.85.4）

- `main`の`e258a2d`（origin/main追跡、ahead 1、作業ツリーclean）から開始し、`pull --ff-only`でAlready up to dateを確認した。ショートカット／マウスジェスチャー／タッチパッドジェスチャー／カスタムコマンドの一覧を自然な高さにし、縦スクロールを設定本文へ集約した。テーブルだけを横スクロールさせ、本文の下端に置く標準の横バーと双方向に連動させる。検索・絞り込み・件数・解除はテーブルの外で共通`CommandListToolbar`にまとめ、本文上端に到達したら一覧の範囲内で固定する。カスタムコマンドに検索機能は追加していない。
- `CommandListScrollProvider`／`useCommandListScroll`／`CommandListScrollbar`を共通化し、カスタムコマンドだけ`SettingsListTable.commandListScroll`へ明示接続した。他の設定一覧は標準の動作を維持する。リサイズ・検索・行の増減・フォーム/JSON切り替え、ダイアログ後の本文縦位置・表の横位置・フォーカスを確認した。将来のフィルター追加方法を`docs/settings-list-editing.md`へ記載した。
- 型検査・ビルド・関連JS **28/28（fail/skip 0）** が成功した。ソースGUIのスクロール **30群**、最終ソースの一覧移動 **7群** が成功した。最終固定EXEでもスクロール **30群** と一覧移動 **7群**、smokeが成功した。4画面×明暗×1280×900/760×900/760×640の24条件で、横バーが必要な16条件・不要な8条件と、一覧内の縦スクロール0件を確認した。ドラッグ・左右キー・Home/End、空の検索結果、検索復帰、編集の取消とフォーカス、展開した動作設定、JSON往復、他のAI一覧を含む。
- 発行前の差分レビューと再確認で、双方向連動の遅延通知が次の操作を戻す経路を修正した。追加の一覧移動試験では、タッチパッド追加前の右側インデックスアイコン・移動先数を前提とする試験を現行仕様へ合わせた後、3個の移動アイコンに対して列幅が2個分のままで右端が20pxはみ出す既存不具合を検出した。列幅を3個分と余白へ修正し、ソース/固定EXEの一覧移動で再検証した。展開設定の試験位置も固定値から実際のフィルター位置へ変更した。製品の修正と試験の前提修正を区別し、途中の失敗ログを保持した。未解決の発行阻害指摘なし。
- 保存項目・保存ファイル・公開API・入力フックを変更しない表示修正として0.85.3を発行後、移動列の追加修正を **0.85.4** として再発行した。両`publish.bat`終了0。最終EXE/feed/Default Shell/FileVersion/ProductVersionは0.85.4、**170485475 bytes / SHA256 `7b3dd763f92ec0879cbfb2c13020ee1bd92b3d5cd335e4df2bc02526e809c04c`**。固定GUIとsmokeのコピーが一致した。制限環境でのElectron起動と.NET発行の失敗は通常ユーザー権限で同じ処理を再実行して切り分け、lockfile・検査方針を維持した。
- 証跡は`.artifacts/command-list-scroll-20261023/validation.json`、最終固定GUIは`.artifacts/settings-hints-ui-1792750999676/`と`.artifacts/settings-hints-ui-1792751029225/`、smokeは`.artifacts/smoke-1792751052860/`。最終672入力のhashは一致。先行JS28件後の差は版、移動列のCSS、一覧移動の試験のみで、JS回帰が扱う処理は一致する。今回に無関係な全回帰・native試験・物理キー/タッチパッドの試験は再実行していない。
- 対象テストプロセス0を確認。新しい4画面試験のソース/固定EXE各方式は成功3回未満のため、削除0件。既存証跡と今回の失敗記録を保持した。実利用での表示確認は利用者確認待ち。コミット・push・GitHub公開・実利用先deployは行っていない。

## 2026-10-23: タッチパッドジェスチャー0.85.2のコミット前照合

- `main`の開始点とGitHub `origin/main`の先端`afd97ab`、実効author/committerを確認した。設計書、Windows接続、共通条件・コマンド基盤、設定画面、通知と保存拒否時の復元、インラインの接続用キー設定、対応試験・文書の62パスを対象とした。既存の未コミット変更を保持し、pull/stashは行っていない。
- 発行時の651入力hashと現在の入力が一致した。0.85.2の型検査・ビルド、関連JS **36件**、ソース/固定EXEのタッチパッドGUI **各11群** は、完全ログのhash・試験入力・成果物を照合して再利用した。単体試験後のGUI driverとCSS間隔の差は単体試験対象に影響しない。再利用の判定は`.artifacts/commit-validation-touchpad-0852-20261023/reuse.json`へ記録した。
- 未実行の標準回帰103ファイルを実行し **806件成功、fail/skip 0**。再利用分と合わせて標準JS109ファイル・**842件**の成功を確認した。最初の制限環境ではWindows操作のアクセス拒否・一時ファイル書込みの失敗が出たため、失敗ログを残して同じ試験を通常ユーザー環境で再実行し成功した。設定・依存・lockfileは変更していない。
- 完全ログが不足していたnative試験は再実行した。偽ストアの **180検査** と実キーフックの受入が成功し、所有キーのkeydown/up遮断・1押下1実行・対象取得・自己入力除外・古い世代と所有解除後の通過を確認した。共用のマウスジェスチャーGUIは旧EXEとhashが異なるため、現在の固定EXEで **11群** を再確認した（`.artifacts/gestures-ui-1792748687520/`）。物理指操作とWindowsのジェスチャー設定書込みは追加していない。
- コミット時の製品修正はなく、版・発行物は0.85.2のまま。EXE **170473198 bytes / SHA256 `d21be207e4ba65725e68c1fb1e6b1ec764453d00a3ef94f2b9ba07950f0950cc`** がfeed・固定GUIコピーと一致した。試験前後の651入力、stage/実ファイル、stage tree/commit treeは`.artifacts/commit-validation-touchpad-0852-20261023/validation.json`と`commit.json`へ記録する。
- 対象の試験プロセス0を確認した。GUIの各実行方式で直近3件、過去の再利用証跡、失敗・状態不明の記録を保持し、今回の削除対象は0件。物理タッチパッドの製品確認と利用可否検出UIは前節の未確認・未実装事項を継続する。push・外部公開・実利用先deployは行わない。

## 2026-10-23: 保存拒否後の割り当て表示復元と接続用キーの直接編集（0.85.2）

- `main`（`afd97ab`、origin/main追跡）の未コミット変更を保持して継続した。利用者が0.85.1でキー重複通知を確認した後、新規の保存拒否が一覧に残る問題を報告した。保存自体は拒否されており、SettingsViewClientの画面内入力が保存済みと同じ表示に見えることが原因だった。
- タッチパッドのフォーム失敗時は未保存入力を破棄して保存値を再取得する。新規追加は「未割り当て」、既存編集は元の割り当てへ戻る。失敗値を含む受付待ちのフォーム操作も破棄し、後からキー等を変更しても失敗した行を保存しない。別ページ・JSONの入力保持を維持し、保存後のWindows反映だけが失敗したケースでは実際に保存された値を表示する。
- 接続用キーの編集ダイアログを除去し、「動作設定」の直下・同階層に既定で閉じた「接続用キー設定」を追加した。10種類それぞれにF13～F24のドロップダウンと、Ctrl・Alt・Shift・Winのラベル付きチェックボックスを横並びで置き、変更ごとに検証・即時保存する。共通SettingsChoiceと配置クラスを使用し、重複時は既存の共通エラー欄へ報告する。通知の案内先と検索メタデータも新しいグループ名へ合わせた。
- 型検査・ビルド・関連JS **36/36（fail/skip 0）** が成功。新規の表示キュー試験4件で、失敗値破棄/後続の別編集への混入防止/受付待ちの破棄と新入力の受付/保存後の反映失敗/他ページとJSONの入力保持を確認した。ソースと固定EXEのGUI **各11群** が成功し、通知、新規/既存行の復元、キー修正だけでは行が復活しないこと、接続キー同士の重複拒否、10キー欄・40チェック欄と各修飾キーの即時保存、明暗940px・暗760pxの横並びと横はみ出しなしを確認した。
- 発行前レビュー1回で失敗時の境界、キュー、設定/API/Windows操作への影響、共通表示とアクセシビリティ、文書整合を確認した。760pxでWinだけ折り返したため間隔を8pxへ調整して再確認した。GUI fixtureのF13競合と警告用登録の衝突、共通エラーの対象名付き表示への照合も修正し、失敗ログを保持した。製品の修正点と試験手順の修正を区別した。未解決の発行阻害指摘なし。
- 保存項目・保存ファイル・公開API・native処理を変更しない修正として **0.85.2** へパッチ更新。版更新後のpnpm workspace検査エラーは`install --frozen-lockfile`で解消し、依存/lockfileを変更していない。`publish.bat`終了0、EXE/feed/Default Shell/FileVersion/ProductVersionは0.85.2。**170473198 bytes / SHA256 `d21be207e4ba65725e68c1fb1e6b1ec764453d00a3ef94f2b9ba07950f0950cc`** が固定GUIコピーと一致した。
- 証跡は`.artifacts/touchpad-rejected-binding-20261023/validation.json`、ソースGUIは`.artifacts/touchpad-ui-1792747707594/`、固定GUIは`.artifacts/touchpad-ui-1792748076874/`。固定GUIの初回（`touchpad-ui-1792747905212`）は全操作とDOM測定が成功したが、760px暗色の取得画像1枚が単色だったため、同じコマンド・driver・EXEで再実行し、画像も確認した。製品変更は行わず初回記録も保持した。最終651入力のhashは一致。単体試験後の差はGUI driverとCSSの間隔だけで、試験対象の処理は一致する。native試験・Windows設定書込み・物理指操作の追加確認は行っていない。利用可否検出UIも未実装のまま。
- 対象テストプロセス0を確認。ソースGUIの古い成功2件（`touchpad-ui-1792743746515`、`touchpad-ui-1792744254880`）を、成功結果・絶対パス・再解析ポイントなし・参照プロセスなしの確認後に削除した。ソース/固定EXE各3件の成功に加え、再利用用の0.85.0固定EXE証跡、失敗記録、固定コンパイル出力、各版の検証記録を保持した。コミット・push・外部公開・実利用先deployは行っていない。

## 2026-10-23: タッチパッドの接続用キー重複をエラー通知へ表示（0.85.1）

- 未コミットの0.85.0を保持した`main`（`afd97ab`）で修正した。報告された保存拒否は、タッチパッド接続用キーと通常ショートカットの重複を保存前に検出したもの。端末にタッチパッドがないことによる拒否とは区別する。
- 既知の`TouchpadKeyConflictError`を共通ErrorReporterへ接続し、重複キーと「タッチパッドジェスチャー → 動作設定」で変更する案内を表示する。既存のエラー通知設定を使用する。古いrevisionは先に拒否し、この通知の対象にしない。保存値・revisionは失敗前のまま、失敗した入力は現在の画面に保持し、キーを直した再保存に使える。保存項目・ファイル・Windows操作・入力ホストは変更していない。
- 型検査・ビルド・関連JS **52/52（fail/skip 0）** が成功した。ソースと固定EXEのGUI **各9群** で、実際のエラーバナー1件、キー名と対処、保存値/revision不変、キー修正後の保存、既存8群の設定操作を確認した。最初のGUI driverはキー修正によって保持中の割り当てが保存された後に再登録して2件となり失敗したため、二重登録する試験手順だけを修正して再実行した。失敗記録は保持し、製品の重複登録不具合とは扱わない。
- 発行前レビュー1回で通知対象・安全な本文・保存前の境界・再送時の既存重複抑止・Windows操作への非影響を確認し、未解決の発行阻害指摘なし。設定/保存ファイルの増減を伴わない修正として **0.85.1** へパッチ更新した。`publish.bat`終了0。EXE/feed/Default Shell/FileVersion/ProductVersionは0.85.1、**170501745 bytes / SHA256 `8b13f4dd8614e568aa3c71d3aca8251e5030cebcc304cb632a412f225d9b5404`** で一致し、隔離GUIの固定コピーも一致した。
- 証跡は`.artifacts/touchpad-conflict-notice-20261023/validation.json`、固定GUIは`.artifacts/touchpad-ui-1792746567550/`。発行前後の650入力hashは一致。単体試験後はGUI driverの手順修正と版更新だけ、ソースGUI後は版更新だけで、製品実装は一致する。今回の変更に関係しないnative試験の再実行は行わず、0.85.0の結果と区別した。対象の残存テストプロセス0、整理での削除0件。今回の成功/失敗記録と以前の参照証跡を保持した。コミット・push・外部公開・実利用先deployは行っていない。
- 別途、利用可否の調査としてWindows 11 24H2以降の`SPI_GETTOUCHPADPARAMETERS`をLUNAで読取成功した。`touchpadPresent=false`、`legacyTouchpadPresent=false`、`maxSupportedContacts=0`に対し、`touchpadEnabled/touchpadActive=true`だったため、設定の有効フラグだけでは接続有無を判定できない。製品への検出UIは未実装。API未対応OSを未接続と断定しない。構造体の正本は[Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-touchpad_parameters_v1)。物理タッチパッドの製品確認は前節の未確認事項を継続する。

## 2026-10-23: Windows連携タッチパッドジェスチャー（0.85.0）

- `main`（`afd97ab`、origin/main追跡）の設計文書の未コミット変更を保持して実装した。dirtyのためpull/stashを行っていない。3/4本指のタップ・上下左右10種類をWindowsからF13～F24と修飾キーで受信し、既存InputHost・共通条件・実行順/first-all・重複除去・CommandDispatcherへ接続した。専用キーは条件不一致でもブロックし、AppDock自身の入力と無効な接続世代を除外する。
- 端末ごとの既定OFF、共有割り当て、PC専用の接続journal、明示的な初回接続/再設定、Windows変更の監視とジェスチャー単位の停止・通知・全解除を実装した。OFF/最後の削除/通常再起動/同期はWindowsを書き換えない。未割り当て方向の実効動作を保つ計画、直前照合、比較付き復旧、未解決journalの保持を実装。未知のWindows内部形式では書込み前に停止する。
- 設定をマウスジェスチャー直下へ追加し、簡素なタッチパッドアイコンと先頭固定幅の設定インデックスを採用。既存コマンド一覧・条件/順序ダイアログ・通知基盤を共用した。専用キーのショートカット表示は読取専用。Windows設定を開くボタンと、ジェスチャー単位の再設定/制御しない/全解除を設けた。公開APIとApplet/MCPの独立した編集許可は既定OFF。
- 発行前レビュー1回で設定保存・入力所有権・Windows書込み境界・共通UI/API・既存マウス動作を確認した。指摘したPCのON操作による共有ファイル変更、既存マウス設定の未知フィールド消失、タッチパッドの順序グループ、キー変更直前のWindows競合、他ジェスチャーの未解決journal消失、記録中の一時解除、アイコン欄のflex優先度を修正し、必要な再検証を完了した。未解決の発行阻害指摘なし。設定項目・PC専用保存ファイルの追加により**0.84.0 → 0.85.0**のマイナー更新。
- 型検査・本体/Default Shell/.NETビルドが成功。関連JS **81/81（fail/skip 0）**、Windowsモデルの偽ストア **180検査**、実Windowsのキーフック受入が成功した。モデルでは10種類×5モードの非対象動作保持、72キー表現、全10種の同時設定、書込み途中失敗6箇所の復旧、書込み前競合を確認。実フックでは1押下1実行、keydown/upの遮断、対象取得、自己入力除外、古い世代/所有解除後の入力通過と既存ショートカット回帰を確認した。物理タッチパッド入力の代わりにはしない。
- ソース/固定EXEの新規GUI **各8群**、固定EXEの既存マウス設定GUI **11群** が成功した。後者は既存の`APPDOCK_GESTURE_UI_ONLY=1`で実入力を明示除外。新規画面の10候補・キー編集・順序・読取専用投影・最後の削除・警告無視/ジェスチャー単位の解除・明暗・940px幅を確認し、共用マウス画面の条件・全入力種別・2段階・競合・削除・再起動保存を回帰確認した。Windowsの24設定値と10種類の実効動作は試験前後で一致し、製品からのWindows書込みはこの試験では行っていない。
- `publish.bat`終了0で`A:\40.ARTIFACT\AppDock.at365`へ発行。EXE/feed/Default Shell/FileVersion/ProductVersionは**0.85.0**で一致。EXEは**170487750 bytes / SHA256 `f769cced36ce65f9a376fb567aa11df8c3244cb41c75b4702cdb59f6610365b5`**。固定GUIコピーも一致した。.NET/入力ホストの制限付き実行失敗は同一コマンドの通常ユーザー実行で切り分け、検査・依存・lockfileを緩めていない。
- 証跡は`.artifacts/touchpad-implementation-20261023/validation.json`、固定GUIは`.artifacts/touchpad-ui-1792744896391/`と`.artifacts/gestures-ui-1792744961071/`。最終GUI前後の650入力hashは一致。旧設計worktreeは3文書と検証JSONをhash付きで退避し、依頼に従い削除。`git worktree list`はmainのみ。現行試験・以前の参照証跡を保持した。コミット・push・GitHub公開・実利用先deployは行っていない。
- 実機で残る確認は、製品からの10種類の設定反映と指操作、修飾キーの全組み合わせ、Windows設定を外から変更した際の体感、非対象方向の物理動作、別Windows版。Windows設定形式の偽ストア試験・読取・人工キー入力と、実タッチパッドの成功を区別する。無関係な全回帰と全Applet再発行は対象外。

## 2026-10-23: Windows連携タッチパッドジェスチャーの設計

- cleanな`main`（`afd97ab`、origin/main追跡）で`pull --ff-only`を実行し、更新なしを確認した。旧設計worktree（detached `eeb2f43`）の設計本文と文書入口の差分を保存し、必要な設計内容をmainへ引き継いだ。旧worktreeの未コミット変更は保持し、新しい正本を[タッチパッドジェスチャー設計](docs/touchpad-gestures-design.md)とした。
- Windowsの3本指・4本指の10種類、F13～F24と修飾キー、端末別の既定OFF、初回接続と再接続の区別、ジェスチャー単位の競合停止/再設定/全解除、専用キーの所有権、共通条件・実行基盤、共通設定UI・通知・公開APIへの接続を定義した。通常の再起動・同期・OFF・最後の割り当て削除ではWindowsを書き換えない。保存・Windows反映・捕捉反映と、途中失敗の復旧も区別した。
- 現行の入力エンジン・キーcodec・共通実行基盤・設定同期・一覧/警告の規則と照合した。通常キーの条件不一致通過と、本機能の条件不一致時もブロックする所有権を分離する必要、WindowsとAppDockの修飾フラグの相違、スワイプ共通モードで非対象方向を維持する必要を明記した。
- 4本指タップ→F13→AppDock→エクスプローラーの実機成功はミニ検証アプリの利用者報告を引用し、今回再実施した結果とはしていない。残り9種類・修飾キー・異なるWindows版・実機入力捕捉は実装時の検証事項。設計のリンク・表・コードフェンス・差分と受入項目の整合を確認し、証跡と元文書のhashを`.artifacts/touchpad-windows-design-20261023/`へ保存した。
- 文書3ファイルだけの変更。製品コード・Windows設定・版番号は変更せず、実装試験・ビルド・発行・commit・pushは行っていない。

## 2026-10-23: 0.84.0のコミット前照合

- ホーム除去の83パスを対象に差分と影響先を再確認し、未解決指摘なし。実装時の657入力・7完全ログ・配布EXEのSHA256一致を確認した。型検査/ビルド、全回帰830件、固定EXEのGUI15群とスモーク、構文検査の成功を再利用し、製品修正・不要な再試験・再発行は行っていない。0.84.0と発行EXEを維持する。
- `main`の開始点`4ec069a`とGitHub/AQUAの`refs/heads/main`、実効author/committerを確認した。今回の追加はこの検証記録のみ。再利用判定、対象パス、stage treeとcommit tree、push先ごとの照合結果は`.artifacts/commit-validation-home-removal-20261023/`へ記録する。GitHub Releaseと実利用先deployは対象外。

## 2026-10-23: 本体ホームの除去と既定の表示先（0.84.0）

- cleanな`main`（`4ec069a`、origin/main追跡）で`pull --ff-only`を実行し、更新なしを確認して着手した。本体ホームの画面・CSS・Controller・専用モデル・完了IPC・リボン/入力条件の新規候補を除去した。Applet化・ダッシュボード共通API・起動先設定は追加していない。通常起動と復元失敗/選択Applet停止時は設定の「バージョン情報・更新」へ戻し、既定先を`shared/navigation.ts`に集約した。
- 更新/再起動の`--restore-view`、設定カテゴリとAppletの復元、入力確定待ちと明示操作優先、終了時の復元先保持を維持。旧リボン`home`と入力条件`host:home`は保存可能な不活性値とし、自動移行/削除なし。ピン留めはコマンドパレットで使用する。現行仕様の正本は[本体ページ](docs/host-pages.md#起動と戻り先)。関連する設計・利用文書とGUI fixtureを整合させ、過去Release記録は履歴として残した。
- 発行前レビュー1回で要件・IPC/型・リボン/入力条件・設定保持・起動/復元寿命・文書・検証範囲を確認。試験がApplet選択のmain反映だけで終了していたため、rendererのDOM/localStorage反映を待つよう修正した。未解決指摘なし。操作契約の削除を含むため、共通手順に従い0.83.14から**0.84.0**へマイナー更新した。
- 型検査・ビルド・関連61件・全回帰 **830/830（fail/skip 0）**・整形・変更CJS **50ファイルの構文検査**・現行文書13ファイルの相対リンク確認が成功。サンドボックスでの一時ファイル置換/Windows API/Electron/.NET発行失敗は、同一コマンドの通常ユーザー実行で切り分けた。依存/lockfile・検査条件は変更していない。
- ソースGUI14群、固定EXEのGUI **15群** とスモークが成功。通常起動、設定カテゴリ/本体ページ/ローカルApplet復元、旧ホーム/不正/不在/無効Appletの復元失敗、選択Applet停止後の戻り先、ホーム経路の拒否と実リボンの不在、パレットのピン実行と保存設定保持を確認した。明暗の画像、既存3本体ページの狭幅100/150/200% zoom、画像ダイアログ・フォーカス・Shell7領域も確認した。実アップデート適用・物理キー入力・実サービス連携とGUI全スクリプトの再実行は対象外。再起動復元は隔離終了と`--restore-view`再起動で検証した。
- `publish.bat`終了0で`A:\40.ARTIFACT\AppDock.at365`へ発行。EXE・feed・Default Shell・EXEのFileVersion/ProductVersionは0.84.0で一致。EXEは **170474237 bytes / SHA256 `30d93f66cecfadf10176082fb8f19c28662e4f707ee7edd33ae9516396a8ecb0`**。GUI/スモーク用固定コピーのhash一致と、今回の試験プロセス0を確認した。
- コマンド・終了コード・ログhash・657入力の照合・レビュー・発行物・GUI結果は`.artifacts/home-removal-20261023/validation.json`。単体回帰後の変更はGUI driverへの実行版照合の追加だけで、製品/単体試験入力は不変。GUI入力も前後一致。host-pagesの成功分はソース/固定EXEそれぞれ直近3回を保持し、失敗/状態不明・参照証跡・固定出力も保持。削除0件。コミット・push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: キー/ジェスチャーのマークからコマンドを絞り込む（0.83.14）

- cleanな`main`（`71f93bf`、origin/mainより3commit先行）から`pull --ff-only`し、更新なしを確認して着手した。共通一覧の入力マークをnative buttonにし、既存のキー正規化/ジェスチャーIDによる完全一致の入力条件、共通の解除ラベル、対象切り替えを実装した。選択時は文字/状態/Applet/コマンドの対象を解除して同入力を使うコマンドを横断表示する。入力条件は画面内だけで保持する。
- 通常のマークは本文色、同入力に異なる2コマンド以上が登録されているマークだけアクセント色にした。全保存済み割り当てから判定し、同一コマンドの重複だけでは色を変えない。無効/利用不能な登録も含め、外部編集/削除へ追従する。選択状態と複数登録は読み上げ情報にも含める。解除時の元マーク/検索欄へのフォーカス復帰を共通hookで管理し、レビューで入力条件がないときの古いフォーカス参照の利用を防いだ。未解決指摘なし。
- 型検査・ビルド・整形・配色回帰 **7/7（fail/skip 0）** が成功。最終ソースの操作/入力フィルターGUI **9群**、既存の一覧移動GUI **7群** が成功した。F1/F10の区別、ジェスチャーID完全一致、Applet/コマンド対象からの切り替え、Enter/Space、文字検索との組み合わせ、×/全解除、フォーカス、同一コマンドの複数行、外部再割り当て/削除/該当なしを検証した。フィルター操作前後で設定値とrevisionが一致し、無効Appletも無効のままであることを確認した。
- 8一覧の明暗テーマ・実寸1280/760pxで **56割り当て行** のマーク色と行高/余白/区切り、一覧アイコンの通常/hover/focus **48組** を確認した。新しいラベルは既存の対象ラベルと同じ部品で必要幅だけ表示する。入力フィルターの狭幅暗色画像と、広幅明色の一覧画像も確認した。runtime/native/SDK/設定schema/保存形式/依存は変更しておらず、物理キー/マウス入力の成功は追加していない。
- 通常のパッチ更新 **0.83.14** として`publish.bat`終了0。EXE/feed/Default Shellの版・サイズ・hashが一致。EXEは **170465559 bytes / SHA256 `88ca24dad1b92678791d5cddfdad2cc2241261f6d82df2dbde146dc90a2f4cd5`**。固定コピーから操作/入力フィルターGUI **9群** と一覧移動GUI **7群** が成功した。
- 完全ログ・コマンド・検証前後の入力hash・実行環境・発行物・レビュー・文書リンクの照合は`.artifacts/binding-input-filter-08314-20261023/validation.json`を正本とする。当該GUIプロセス0、追加削除0件。今回/直近3回/レビュー比較/過去のcommit・再利用証跡を保持した。今回の変更は未コミット。push、GitHub Release、実利用先deployは行っていない。

## 2026-10-23: 一覧ボタンのhover枠と割り当てマークの文字色・コミット前確認（0.83.13）

- 通常色の一覧ボタンは、共通の`button:hover`の`brightness(1.14)`で明るい枠線が白背景へ溶け込んでいた。修正前の隔離GUIで失敗を再現し、共通`settings-list-icon`のhover/focus-visibleに`filter: none`を指定した。通常時の透明な背景・枠線と32px角は保持し、hover/focus時に通常色でも枠を表示する。
- ショートカットキー/ジェスチャーのマークは、共通の`kbd`の薄い補助色から本文と同じ`--text`へ変更した。対象は`.applet-shortcut-value`内に限定し、明暗テーマとも読みやすい本文色を使う。マークを押す完全一致フィルターは今回実装せず、コミット後の検討対象とする。
- 最終ソースの型検査・ビルド・変更対象の整形検査が成功した。共通操作GUI **7群**、一覧移動GUI **7群**、配色回帰 **7/7（fail/skip 0）** が成功。8一覧の明暗・実寸1280/760pxで、割り当て **56行** のマーク色=本文色、上下8px・最小48px・内部罫線なし、通常/hover/キーボードfocus **48組** の背景・枠線・filter・32px寸法を実測した。明るいテーマの広幅と暗いテーマの広幅/狭幅の画像も確認した。
- 標準833件のうち非配色 **826件**、ショートカット動作/再起動8群、共通レイアウト8群、スクロール13群は0.83.9の成功記録を、Applet管理の動作14群は0.83.8を再利用する。ソース/試験/依存/ツール/実行環境・ログ・固定EXEを照合し、後続の差分は一覧の余白・罫線・配置・色と対応GUI helperであることを確認した。ジェスチャーUIの編集/保存/取消/順序/再起動 **12群** は0.83.12の成功を再利用し、その後の変更をマーク色・無関係な操作GUI helper・パッチ版へ限定して照合した。物理キー/ジェスチャー入力の成功へ読み替えない。発行前レビューは未解決指摘なし。
- hover修正を **0.83.12** として発行した後、追加依頼のマーク色を **0.83.13** へ反映した。中間版は発行終了0・EXE/feed一致と固定コピー、ソース試験を`.artifacts/settings-ui-commit-08312-20261023/`へ保持し、固定EXEのGUI確認を実施したとは扱わない。
- 最終版の`publish.bat`終了0、EXE/feed/Default Shellの版・サイズ・SHA256が一致。EXEは **170477607 bytes / SHA256 `0bb6d7ab45544d1fa8ac9bb2ec4f530292d094c9805bbeda4cab263a32adda04`**。固定コピーで共通操作GUI **7群** と一覧移動GUI **7群** が成功した。コマンド・入力/ログhash・配布物・再利用判定・レビューの正本は`.artifacts/settings-ui-commit-08313-20261023/validation.json`。
- 0.83.5以降の今回依頼に対応するUI/文書/試験 **36パス** を、利用者の依頼に従い一つのローカルコミットへまとめる。stage/実ファイル/tree・実効identity・GitHub/AQUA main先端・commit後のtree/clean状態は`.artifacts/commit-validation-settings-ui-08312-20261023/validation.json`へ記録する。最終記録だけの文書差分を除き検証入力を照合する。再利用/中間版/比較/失敗の証跡を保護し、当該試験プロセス0・追加削除0件を確認した。push、GitHub Release、実利用先deployは行っていない。

## 2026-10-23: 割り当て行の密度と一覧アイコンのhover表示（0.83.11）

- `main`（`2dc2235`）の未コミット変更を保持して継続し、pull/stash/commitを行っていない。ショートカット/ジェスチャーの割り当て・操作セルを共通の上下8pxにし、32px角のボタンと左右の余白を保持した。同じコマンド内の割り当て間の罫線を除去し、コマンド間の区切りは保持する。ジェスチャーの移動アイコンもショートカット/カスタムコマンドと同じ左寄せにした。
- 共通の`settings-list-icon`は通常時に背景と枠線を透明にし、hover/キーボードのfocus-visible時に共通の背景・枠線を表示する。割り当てがあるアイコンは通常時もアクセントの前景色を保持し、hover/focus時はアクセントの背景・枠線・前景色を同時に切り替える。透明時も枠線の幅を確保し、状態変化で32pxのボタン寸法や配置が変わらないようにした。追加の＋など用途が異なる部品は従来の表示を保持する。
- 型検査・ビルドが成功した。最終ソースの共通操作GUI **7群** と一覧移動GUI **7群** が成功し、Applet管理を含む8一覧を明暗・実寸1280/760pxで確認した。割り当て **56行** の上下8px・最小48px・内部罫線なし・コマンド間罫線の保持、通常/hover/キーボードfocusの **48組**、条件の折り返し・操作の対応・移動列の左寄せを実測した。色の判定・直接編集/実行順/削除・絞り込み・ヒントOFFの操作も確認した。発行前レビューは未解決指摘なし。設定/保存/API、runtime/native/SDKと依存は変更していない。
- 行間と罫線の調整を **0.83.10** として発行した後、追加された通常時の背景/枠線の撤去を通常のパッチ更新 **0.83.11** に反映した。0.83.10は発行終了0・feed/EXEの版/サイズ/hashと固定コピーを確認し、`.artifacts/settings-binding-spacing-08310-20261023/`へソース試験と中間成果物を保持した。中間版の固定EXEのGUI成功は主張せず、配布物のGUI確認は最終0.83.11を対象にした。
- 最終`publish.bat`終了0。EXE・feed・Default Shell・EXEのFileVersion/ProductVersionは **0.83.11** で一致した。EXEは **170484778 bytes / SHA256 `2b1261f04a53a97554494f7f64a83b47b00adbfef9ba4c6e15b92ba4d6f6a386`**。固定コピーとhashを照合し、同じ共通操作 **7群**・一覧移動 **7群** が成功した。固定EXEでも割り当て56行と表示48組を照合した。0.83.9の833件の標準試験や入力の全回帰は今回の実行結果と混同せず、変更していないruntime等の入力hashを比較して履歴として保持した。
- コマンド・終了コード・入力hash・表示計測・レビュー・発行物照合は`.artifacts/settings-icon-hover-08311-20261023/validation.json`。今回の試験プロセス0。現行4プロファイルと中間版2プロファイル、以前の参照用証跡・固定出力・失敗・他作業を保持し、同方式の直近3回より古くなった成功済みのソース操作GUIフォルダー1件だけを整理した。操作許可型2列テーブル共通化は引き続き対象外。変更は未コミットで、push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: 一覧アイコンの統一と割り当てごとの直接操作（0.83.9）

- `main`（`2dc2235`、origin/mainより2件先行）で0.83.8までの未コミット変更を保持し、pull/stash/commitを行わず継続した。Applet管理の32px角・7px角丸・共通の背景/文字/枠線を`settings-list-icon`へ集約し、リボン・トレイ・ショートカット・ジェスチャー・カスタムコマンド・AI・MCPの一覧へ揃えた。通常の操作/並べ替えは中立色、割り当てのある移動先は共通のアクセント色を使う。AI専用のアイコン描画と寸法/色の上書きを取り除いた。
- 割り当て一覧をコマンド・割り当て・操作・移動の4列にし、割り当てごとの表の行へ鉛筆の編集・既存の実行順・ゴミ箱の削除を直接並べた。コマンド/移動先はrowspanで共有し、長い条件や折り返しでも対応する操作を同じ行へ保つ。旧その他メニューと未使用の共通メニュー部品/CSSを削除した。同じ正規化キー/ジェスチャーIDに異なるコマンドIDが2つ以上あれば実行順をアクセント色にし、検索対象外・無効・利用できない登録も数える。同じコマンドの条件違いだけでは色を付けず、削除後の色も再計算する。
- 発行前レビューで、狭いAI一覧の操作列に共通paddingが優先されてボタンがはみ出す点と、未割り当てから追加した際に行の置き換えでフォーカスが失われる点を修正した。AIの操作列とcompact paddingを揃え、コマンド行を安定させ、フォーカスはコマンド/割り当てIDから復帰先を取り直す。再検証に成功し、必要な修正の未解決指摘なし。設定キー・保存ファイル・backend/native/SDK・依存の変更なし。既存の削除確認/即時保存/競合検出を保持し、共通一覧の仕様と該当AGENTSを4列の契約へ更新した。
- 最終ソースの型検査・ビルド・標準回帰 **833/833（fail/skip 0）** が成功した。共通操作GUI **7群**（参照元を含む8一覧・明暗・実寸1280/760px・折り返し・複数コマンド/同一コマンド重複・絞り込み・削除後の色・キーボード/ヒントOFF）、ショートカットGUI **8群**、ジェスチャーGUI **12群（既存のUI-onlyモード、実入力除外の明示を含む）**、一覧移動 **7群**、共通配置 **8群**、内部スクロール **13群** が成功した。ジェスチャーの通常ユーザーでの実入力試験はWindows前面化に失敗したため、成功扱いにせず失敗ログを保持した。古い試験のその他メニュー/曖昧なラベル/checkbox/ネストされたFieldの参照は現行UIに合わせ、編集・保存・並べ替え・競合・取消・削除・実プロセス再起動のUI動作を確認した。
- 通常のパッチ更新 **0.83.9** を`publish.bat`終了0で発行した。EXE・feed・Default Shell・EXEのFileVersion/ProductVersionは0.83.9で一致。EXEは **170479032 bytes / SHA256 `6589d3865501b267946e7077db0bb33c71684c8f7f42b75ac82dccd5913f6c86`**。固定コピーとのhashを照合し、同じ共通操作 **7群**・ショートカット **8群**・共通配置 **8群**・一覧移動 **7群** が成功した。画像を確認し、以前の通知ハイライト・API一覧の枠・AI入力の保存/取消も維持した。
- 完全ログ・終了コード・前後の入力hash・レビュー・発行物照合は`.artifacts/settings-actions-0839-20261023/validation.json`。今回の試験プロセス0、削除0件。現行の10プロファイル、方式ごとの直近成功分、以前の参照用証跡・固定出力・失敗・他作業を保持した。操作許可型2列テーブル共通化は対象外。変更は未コミットで、push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: 選択欄と対象フィルターの幅・Applet管理の案内・ページ説明（0.83.8）

- `main`（`2dc2235`）の0.83.7までの未コミット変更を保持して継続し、pull/stash/commitを行っていない。共通Fieldと設定ダイアログのnative selectを、最長の選択肢が収まる自然な幅へ変更し、最大幅を親の100%へ制限した。文字・URL・JSON入力と編集可能な候補入力は従来の入力列の幅を維持する。
- 共通`CommandProviderFilter`を内容に合う幅へ変更し、flex/gridで横に引き伸ばさないようにした。ショートカット・ジェスチャー・カスタムコマンドの対象コマンドと、Appletによる対象絞り込みで、枠が文字と解除ボタンの幅に一致することを確認した。長い名前の折り返し、枠内の解除ボタン、解除後の一覧と保存値の保持も確認した。
- Applet管理の固定見出し「導入状況」と、通常時の「インストール済みAppletを管理できます。」を除去した。配布版で利用できる操作の制限、検出できなかったAppletの件数と検出ログへの入口は、該当するときだけ共通Fieldで表示する。カスタムコマンド・AI・MCPクライアントのページ上部には、各ページの用途に合う説明を追加した。トップレベルのカード必須ルールを撤回し、一覧中心の画面はApplet管理を参考に構成する方針を共通指針へ反映した。既存のAPI一覧の枠など、確認済みの配置は維持した。
- 型検査とビルドが成功した。ソースの配置GUI **8群**、コマンド移動・対象フィルターGUI **7群**、Applet管理GUI **14群** が成功した。明暗1280/760、自然な選択欄の幅と最大幅、3ページの説明、通常の案内の不在、検出問題とログ移動、一覧検索・更新確認・有効切り替え・再起動・表示順を確認した。発行前レビューは未解決指摘なし。設定キー・保存ファイル/形式・公開API・backend/native/SDK・依存の変更なし。関連しない機能回帰全体は繰り返していない。
- 通常のパッチ更新 **0.83.8** を`publish.bat`終了0で発行した。EXE・feed・Default ShellとEXEのFileVersion/ProductVersionは0.83.8で一致。EXEは **170473475 bytes / SHA256 `2bd6028d3f3d7e3ae03b4929fe28e397a826f616ae4c393565d130a6f26d6df0`**。固定コピーとのhash一致を確認し、配置GUI **8群** とコマンド移動・対象フィルターGUI **7群** が成功した。通知のハイライト・既存のField/group・API一覧の枠・AI入力の保存/取消の確認も維持した。
- 完全ログ・コマンド・終了コード・前後の入力hash・レビュー・配布物照合は`.artifacts/settings-widths-0838-20261023/validation.json`。今回の試験プロセス0、削除0件。現在の5つの資料、過去の参照用証跡・固定出力・失敗・他作業を保持した。操作許可型の2列テーブル共通化は対象外のまま。変更は未コミットで、push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: 折りたたみ行のハイライト余白とアクセント配色（0.83.7）

- `main`（`2dc2235`）の0.83.6の未コミット変更を保持して継続し、pull/stash/commitを行っていない。0.83.6の検証入力と比較し、今回変更した製品入力は共通SectionのCSSと版番号だけで、ほかは配置GUI driverの拡張である。設定ページのトップレベルは用途の見出しを持つカード、その内側に一覧・テーブルを配置する方針を共通指針へ明記した。確認済みの「APIの公開」のカードと一覧の枠は維持する。
- 通知種類のrow summaryを親カードの余白へ左右12px、狭い幅では8px広げ、同じ幅を内側の余白へ戻した。文字・説明の折り返し幅・開閉アイコン・区切り線の位置は維持し、背景と内容の間に余裕を設けた。共通Sectionのhover/focus背景は`--accent-soft`、説明文は`--accent`へ揃え、独自の配色値を追加していない。設定キー・保存形式・公開API・依存・runtime JavaScriptの変更なし。操作許可型の2列テーブル共通化は対象外のままとした。
- 型検査・ビルド・配色の標準試験 **7/7（fail/skip 0）** が成功した。ソース配置GUI **7群** で明暗1280/760、左右の余白の均等、hover前後の寸法不変、カード内への収まりと横スクロールなし、Enter/Space/アイコンの開閉、通知値の不変を確認した。5プリセットとカスタムを明暗で切り替える **12サンプル** で共通の淡い色との一致と、タイトル・説明それぞれのコントラスト4.5以上を確認した。画像も確認し、発行前レビューは未解決指摘なし。
- 通常のパッチ更新 **0.83.7** を`publish.bat`終了0で発行した。EXE・feed・Default ShellとEXEのFileVersion/ProductVersionは0.83.7で一致。EXEは **170477411 bytes / SHA256 `29b929d459ed324a97ffdc3a5ca54a234ca885ab6befce13e0a70c8994150d8e`**。固定コピーとのhash一致を確認し、同じ配置GUI **7群** が成功した。通知の必須の通知先、API一覧とCommandBindingListの枠の一致、既存のField/group・AI入力と保存/取消・ボタン配置の確認も維持した。
- 完全ログ・コマンド・終了コード・入力hash・レビュー・発行物照合は`.artifacts/settings-highlight-0837-20261023/validation.json`。backend/native/SDK、ヒントや通知の保存処理など変更していない機能の回帰全体は繰り返さず、0.83.6の記録を比較元として保持した。今回のGUI試験プロセス0、削除0件。現在の2つの資料、過去の参照用証跡・固定出力・失敗・他作業を保持した。変更は未コミットで、push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: 通知種類の折りたたみ行と操作許可一覧の枠（0.83.6）

- cleanな`main`（`2dc2235`、origin/mainより2件先行）から`git pull --ff-only`で最新を確認し、更新なしで着手した。0.83.1の`aea52e9`を比較し、通知種類は提供元カード内へ直接並べる行の構成へ戻した。共通の`SettingsSection variant="row"`でFieldと同じ文字サイズ・行の余白・全幅の区切り線を管理する。共通Sectionの開閉表示を枠付きの矢印に揃え、行全体のクリック、hover、キーボードフォーカス、Enter/Spaceの開閉を確認した。
- 「APIの公開」の外側の`variant="card"`を保持し、内側の許可一覧へCommandBindingListと同じ境界色・12pxの角丸・カード背景の外枠を復元した。通知の現在値、必須の通知先、ヒント、Applet/MCPの独立した許可と保存の契約は維持する。設定キー・保存形式・公開API・依存の変更なし。操作許可型の2列テーブル共通化は今回も対象外とした。
- 型検査・ビルド・配色の標準試験 **7/7（fail/skip 0）** が成功した。ソースの配置GUI **6群** とヒントGUI **12群** が成功し、ヒントON/OFF・折りたたみとの操作分離・実プロセス再起動を確認した。差分と影響先を発行前にレビューし、未解決の発行阻害指摘なし。backend/native/SDKと依存の入力は変わらず、変更した共通rendererの配置・配色・ヒントを対象に検証した。標準833件全体を今回再実行したものとは扱わない。
- 通常のパッチ更新 **0.83.6** を`publish.bat`終了0で発行した。EXE・update.json・Default Shell・EXEのFileVersion/ProductVersionは0.83.6で一致。EXEは **170473429 bytes / SHA256 `91df46e46a8463b257d8b1ba31407bcc60091d4f11cc9211f9d793a0e05174ec`**。固定コピーとhashを照合し、配置GUI **6群** と使いやすさGUI **9群** を直列実行して成功した。明暗1280/760、API一覧とCommandBindingListの枠の一致、通知行のEnter/Space/右端アイコン、開閉前後の保存値不変、通知先・読み上げ設定の保存、8ページの幅を確認した。
- 完全ログ・コマンド・終了コード・前後の入力hash・レビュー・発行物照合は`.artifacts/settings-lists-0836-20261023/validation.json`に集約した。今回の試験プロセス0、削除0件。現行の4つの試験資料と、過去の参照用証跡・固定出力・失敗・他作業を保持した。変更は未コミットで、push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: 共通カード構成の調整と設定UIのコミット前検証（0.83.5）

- 未コミットの設定UI変更を保持した`main`（文書commit `3a5de0e`）から継続し、自動pull/stashを行っていない。origin/mainは`aea52e9`で、実効author/committerと対象範囲を確認した。利用者の完成後コミット依頼に従い、ここまでの共通レイアウト・ダイアログ・状態/エラー表示・関連文書と試験を対象にした。
- 通知一覧の提供元ごとのSectionを`variant="card"`にし、通知種類の間隔は内側の共通`settings-sections`で維持した。操作の許可一覧は`variant="card" title="APIの公開"`で囲み、テーブルの外枠をSectionへ集約した。`SettingsSection variant="group"`は上部に共通20pxの余白を追加した。保存/API/許可の動作は維持する。操作の許可のような2列テーブルの共通部品化は今回の対象外として、設定基盤の文書に次回の検討事項を残した。
- 0.83.4の発行とカード配置の固定EXE確認後、累積変更のコミット前検証で、AIのURL正規化後に親の値が変わらない場合、入力欄の表示だけ未確定文字列が残るケースを確認した。既存の`SettingsInput.confirmation`をURL入力にも渡し、Enterでモデル取得した場合も正規化した値を確定値として反映するよう修正した。URL共通部品の変更はconfirmationの型公開だけで、共通入力の実行処理・既定の確定方法は変更していない。追加修正をレビューし、最終版を通常のパッチ更新 **0.83.5** として発行した。未解決の発行阻害指摘なし。
- 最終ソースの型検査・ビルド・標準回帰 **833/833（fail/skip 0）** が成功した。AIソースGUI **16群** と入力GUI **9群** も成功した。AI driverの旧通知スイッチ/旧エラー位置/詳細折りたたみの参照を現行のカード・常設エラー・同一階層へ合わせ、共通プロンプトの変更はEnterで確定してから取消を確認する形に更新した。URL表示の失敗と古い試験期待による失敗ログは保持した。
- `publish.bat`終了0。最終EXE・feed・Default Shell・EXEのFileVersion/ProductVersionは **0.83.5** で一致した。EXEは **170484095 bytes / SHA256 `79da95f102a391eea1efc4acd93a93324bd26e5e21fdf92a2a0a39a6a404dba6`**。固定コピーとのhashを照合し、隔離したGUI **6方式** を直列実行して全て終了0となった。カード/余白/入力列/AI保存取消の配置 **6群**、AI **16群**、画像 **10群**、ヒント **12群**、入力確定/取消 **9群**、使いやすさ **9群** が成功した。明暗1280/760、画像の150/200%表示、実プロセスの再起動も各方式の範囲で確認した。
- AIはURL/keyのEnter・IME、暗号化したPC専用キー、Node/.NET SDK、MCPの独立した許可・所有者分離・取消、古い応答の破棄、競合時の入力保持まで確認した。画像ダイアログは以前の成功後にdriverのhash差分があったため再実行した。変更していないApplet管理・リボン・MCPクライアント・nativeキー/入力ページの機能回帰は、0.83.2の成功ログ・driver・main/shared/native/fixture・依存/ツール入力を照合して再利用し、今回のEXEの新規検証とは区別した。導入ダイアログのソースfixtureも、対象コードと操作契約が一致する0.83.3の成功を再利用した。
- 実行コマンド・終了コード・入力/ログhash・固定EXEの証跡は`.artifacts/settings-ui-final-0835-20261023/`。0.83.4のカード修正時の記録は`.artifacts/settings-section-cards-20261023/`に保持した。再利用判定・stage tree・commit SHA/treeと完了状態は`.artifacts/commit-validation-settings-ui-0835-20261023/`へ記録する。コミットにプッシュ・GitHub Release・実利用先deployは含めない。
- 最終入力 **644ファイル** と各成功時のhashが一致し、関連5文書のローカルリンク **60件** に欠落なし。該当する隔離試験プロセス0を確認した。新しい成功3件で置き換わった旧レイアウト試作の成功フォルダー1件だけを、絶対パス・再解析ポイント・成功結果の確認後に削除した。失敗・現行/再利用証跡・固定出力・他作業は保持した。

## 2026-10-23: 設定画面の配置・カード・グループ表示の追加修正（0.83.3）

- `main`は文書commit `3a5de0e`でorigin/mainより1件先行し、0.83.2の実装が未コミットの状態から継続した。既存変更を保持し、自動pull・stash・commitを行っていない。保存項目・保存ファイル・公開APIを変更しないUI修正として、発行済み0.83.2から **0.83.3** へパッチ更新した。固定依存のfrozen installは403 entriesを検査して成功し、lockfileや依存の版を変更していない。
- `SettingsField.group`を追加した。最終要件に合わせ、グループ名をタイトルの左に小さく添え、同じ高さに配置する。fieldsetの読み上げ名にもグループを含め、ヒントOFFでも表示する。ジェスチャーの操作感・待機表示、両入力方式のWebブラウザ項目は入れ子のSection/複数列グリッドから同じ階層のFieldへ変更し、入力列と全幅の区切り線を揃えた。AI接続の詳細項目も同じ階層へ移した。
- 通知画面に残っていた汎用fieldset・カードの専用CSSを除去し、読み上げ/MCP Eventの値の列と通知種類の共通カードを復元した。通知先も共通Field/Choiceへ統一し、必須の通知先や通知センターのみの選択契約を保持した。導入元のタイトルは「配布元」、常時表示のdescriptionは「URLまたはフォルダー」とした。許可一覧はカードと同じ背景、暗色の共通境界色は`#4b5262`へ調整した。操作ボタンはスピナーと同じ幅の領域を左右に確保し、通常/処理中とも文字を中央に保つ。
- 発行前レビュー1回で設定保存・公開API・入力確定・取消・共通CSSの影響を確認した。ボタンの最初の修正ではbox-sizingの差で文字が2 CSS pxずれたため、スピナーをborder-boxとし左右16pxへ揃え、再検証した。発行を妨げる指摘なし。型検査・ビルド・整形・差分検査が成功し、標準回帰 **833/833（fail/skip 0）** が成功した。現行ダイアログの通常入力がField外に残る箇所は構文検査で0件。関連5文書のローカルリンク **60件** に欠落なし。
- `publish.bat`を通常ユーザー環境で実行して終了0。発行EXE・feed・Default ShellとEXEリソース版は **0.83.3** で一致した。EXEは **170480055 bytes / SHA256 `8459c3cc10436429fb3e658b3f9f5b359ecd073866c0c29e120a140d70e93447`**。固定コピーと発行物のhashを照合して隔離GUIへ使用した。
- 固定EXEのGUI **4方式** が直列で成功した。追加修正の専用driver **6群** は明暗1280/760でグループとタイトルの横並び、値の列、全幅区切り線、通知カード、許可一覧の背景、導入description、AIの入れ子除去、ボタン文字の中心を測定した。暗色カードの境界/背景コントラストは2以上を確認した。AIの既定値表示・OK前の入力保持・上限/待ち時間の保存・取消も成功した。ヒント **12群**、入力確定/取消/IME/JSON **9群**、使いやすさ **9群**（通知の声・速度の独立継承、通知先、8ページの明暗/狭幅を含む）も成功した。
- ソースfixtureでは導入ダイアログの明暗3幅・低いウィンドウ・エラー詳細・取消/遅延応答・再試行の **5群** が成功し、処理中の文字中心と各要素の位置も不変だった。初回のツールチップ保持確認は1度失敗したが、同じコマンド・同じコードの再実行で全群成功し、固定EXEのヒント試験も成功した。原因を確定した製品修正とは扱わず、失敗記録を保持した。開発起動では導入機能が無効のため、実際の導入ダイアログの配置は固定EXEで確認した。DPIによる1px境界線の丸めを考慮して幾何検査を行った。
- 証跡は`.artifacts/settings-ui-refinements-20261023/`。コマンド・終了コード・ログhash・検証前後の入力hash・固定EXEの一致を保存し、最終 **644ファイル** を照合した。標準回帰/導入fixture後の差分は、その試験が参照しない専用GUI driverへのAI保存・取消ケースの追加だけで、製品・単体試験・依存は一致した。0.83.2のApplet導入全経路・native入力・画像・リボン・MCP統合全回帰は今回の追加成功として数えず、今回変更した表示と入力を上記4方式で確認した。
- 該当テストプロセス0を確認した。今回の成功結果は方式/起動方法ごとに3回以内で、削除0件。失敗・状態不明・旧版証跡・固定出力・他作業を保持した。実利用での画面確認は利用者に委ね、実サービス/物理入力/実NAS等の成功を追加で主張しない。変更は未コミット・未プッシュで、GitHub Releaseや実利用先へのdeployは行っていない。

## 2026-10-23: 設定画面への共通レイアウト指針の適用（0.83.2）

- 文書commit `3a5de0e`を含むcleanなmainから`pull --ff-only`で最新を確認して着手した。ショートカット・ジェスチャー・リボン・トレイ・宣言型一覧・画像・Applet導入・認証等のダイアログを優先して`SettingsField`へ統一した。通常入力が共通フィールドの外にある箇所は構文検査で0件。独自の選択候補やキー記録等の共通ウィジェットは既存の操作を保つ。
- 現在値・継続的な状態・重要な注意は`description`へ、任意の補足は`hint`へ集約した。個別の`SettingsHint`/`SettingsFeedback`を廃止し、ページとモーダルごとの`SettingsStatusProvider`へエラー・対象・処理状態を渡す。常設40pxの要約領域と全文の詳細表示、項目からの参照、静的ラベルの`SettingsButton.pending`、狭幅の縦配置を共通部品が管理する。フォーム全体の外枠と通知提供元をまとめるだけのカードを外し、枠なしの共通セクショングループを追加した。
- 発行前レビュー1回で保存・公開API・入力確定・記録・取消・再試行・フォーカス復帰への影響を確認した。重複するラベルはfieldset/legendで整理し、チェックボックスの既定余白、ダイアログ内の幅優先順位、フォーカス時の遅延スクロールがヒントを閉じる競合を修正した。消費済みのキーイベントを共通モーダルが尊重するようにし、Escapeで詳細だけを閉じて編集を維持することを再確認した。未解決の製品指摘なし。
- 保存項目・保存ファイル・保存形式・外部公開APIと依存は変更せず、通常のUI修正として **0.83.1→0.83.2** にパッチ更新した。型検査・ビルド・整形・差分検査が成功し、最終版の標準回帰 **833/833（fail/skip 0）** が成功した。関連4文書のローカルリンク **56件** に欠落なし。共通部品の現行APIと利用例は`settings-foundation.md`、`settings-list-editing.md`、Applet管理の文書へ反映した。
- `publish.bat`は固定依存403 entriesの検査後、制限環境の.NET工程で停止した。同じ発行処理を通常ユーザーとして再実行して終了0。単一EXEとfeed、Default Shellは **0.83.2**、EXEのFileVersion/ProductVersionも一致した。EXEは **170468740 bytes / SHA256 `42fd8dd84c870ee7629a33f0cfc41bbd9d4c4838d79e8b3c21182e6e1ab635d2`**。固定コピーとfeedのsize/SHA256を照合してから隔離GUIに使用した。
- ソースfixtureでは導入ダイアログの長文エラー・スクロール・詳細のEscape・明暗3幅・低いウィンドウ・取消後の遅延応答・入力保持と再試行が成功した。固定EXEではsmoke、ヒント切替と重要説明の常時表示、ダイアログ内のエラー分離と項目参照、処理中/成功/失敗時の位置、Enter/Escape/IME/blur/JSONの確定・取消、8ページの明暗1280/760、リボン、MCPの認証保持と再試行、画像の追加/所属/削除失敗/拡大、Applet管理の導入・アンインストールを確認した。画像は150/200%も確認し、GUIを直列実行した。
- 固定EXEのGUIは **10方式** が終了0。上記に加え、Windows/Chromiumのキー入力、記録中の一時停止、条件・並び順・既定値保持・再起動、キー/ジェスチャーのページ選択を確認した。ショートカットの共通動作欄は明暗1280/900/700で成功した。最終入力643ファイルを照合し、製品・標準テスト入力は各成功時と一致した。後続差分は当該試験に影響しない別UI driverの調整または整形のみ。照合結果を同フォルダーの`validation.json`へまとめた。
- 既存driverは、旧インラインヒント/エラー、廃止済みApplet詳細タブやプロフィールカテゴリ、既定値を全て保存する旧fixture期待を現行仕様へ合わせた。検証条件は維持し、エラー対象の参照・背後のページへの非表示・失敗時の位置固定を追加した。旧画像ライブラリーdriverは廃止済みの別Windowを待って失敗したため、現行`image-gallery-ui-test.cjs`へ切り替えて必要なダイアログを確認した。Applet導入の初回は展開済みフォルダーの一時transactionへのアクセス拒否で復旧した。新しい隔離profileで同じ全試験を再実行し、URL・配布フォルダー・展開済みフォルダーの導入/削除と6回の実helper再起動、OFF設定・データ保持まで成功した。権限・検査条件や製品コードは変更していない。
- 完全ログ・終了コード・コマンド・Node/OS/固定ツール・各入力の検証前後SHA256・固定EXEのhashは`.artifacts/settings-ui-guidelines-20261023/`の各`source-*.json`/`portable-*.json`、`final-regression-*.json`、`review.json`、`publish-result.json`を正本とする。発行後の変更はdriverのfixture・参照方法・整形と文書だけで、製品ソースと配布物は不変。実NAS・物理キーボード/DPI・実スピーカーの確認へ読み替えず、画像のごみ箱試験は隔離アダプターでの結果として扱う。commit/push・GitHub Release・実利用先deployは行っていない。
- 通常ユーザーのCIM照会で当該試験profileに一致するNode/Electron/.NETプロセス0を確認した。今回の成功出力は方式ごと3回以内で、再利用記録・失敗経緯・固定EXE/ビルド出力と他作業の資料を保持し、削除0件（`cleanup.json`）。

## 2026-10-23: 設定画面の共通レイアウト指針

- cleanなmain/origin/mainから`pull --ff-only`で最新を確認し、`docs/settings-ui-guidelines.md`を共通指針の正本として追加した。`description`は現在の設定値・状態・重要な説明を常時表示し、`hint`は任意の補足として表示設定に従う。エラーの対象、通知を出す条件、操作位置の安定、狭幅・文字拡大・キーボード操作、共通部品の責務を定めた。
- DEVELOPMENTと本体AGENTSから参照を追加し、設定基盤・一覧編集の文書を同じ指針へ接続した。`SettingsHint`の利用を勧める記述と実装例を整理し、現行APIに存在しない`errorLayout="reserved"`の案内を除いた。現行の`inline`/`custom`とアイコン式`SettingsError`、共通レイアウト側の未対応事項を区別した。差分レビューで確定した指針との一致、参照の一元化、保存・入力の既存契約を確認し、未解決の指摘なし。
- 関連5文書のローカルリンク **152件**、Markdown見出し参照 **16件**、コードブロックの対応と`git diff --check`が成功した。検査対象・SHA256・結果は`.artifacts/commit-validation-settings-ui-guidelines-20261023/documentation-check.json`、最終対象・stage tree・実効identity・commit照合は同フォルダーの`validation.json`へ記録する。
- コミット前のGitHub/AQUA mainはいずれも`aea52e990f16087166fb1201f0b4cd726438bf9c`と一致した。AQUAの読み取りは制限内のGit補助プロセス起動が拒否されたため、同一コマンドを通常ユーザーで再実行して確認した。
- 変更は文書6ファイルに限定し、製品コード・設定・保存形式・依存・配布物は変更しない。文書のみの例外に従い、製品回帰・GUI試験・版更新・発行は実施しない。現行版0.83.1を維持し、push・Release・実利用先deployは行わない。

## 2026-10-22: Electron45更新のコミット前確認（0.83.1）

- 利用者からcommit/pushの指示を受領。main/origin/mainと対象4ファイル、実効author/committerを確認した。GitHubのmainは`b94173a`、AQUAはその祖先`c0b287a`で、双方へ通常pushできる履歴と照合した。既存の未コミット変更を保持し、pull/stash/resetや履歴の統合は行わない。
- 実装完了時の全追跡入力・9コマンドの成功ログ・EXE/feedのSHA256、導入済みElectron/builder・Default Shellの版が現在と一致した。型検査・標準833/833（fail/skip 0）、固定EXEのsmoke・倍率11群・画像/Node/.NET9群・更新/再起動13群・進捗9群・信頼診断6結果を再利用する。後続の製品/試験/依存変更がないため、回帰再実行・再発行・追加版更新は行わない。今回の追記は本項の文書記録だけ。
- 対象一覧、再利用元と入力/配布物照合、stageと実ファイル/tree、identity、commitとGitHub/AQUA mainの最終照合結果は`.artifacts/commit-validation-electron45-0831-20261022/validation.json`へ記録する。0.83.1と検証済み配布物を維持し、GitHub Releaseや実利用先deployは行わない。

## 2026-10-22: Electron最新安定版45.0.0でのビルド確認（0.83.1）

- 利用者からElectron最新版への更新とビルド確認を依頼された。cleanなmain/origin/mainからpull --ff-onlyし、先行していたLICENSE追加`b94173a`を取得した。公式Releaseとnpmのlatestを照合し、Electronを **44.9.3 → 45.0.0** へ完全版指定で更新した。共通の最新版選択器で開発Nodeの最新LTSが導入済み24.22.1と一致することも確認した。今回の対象はElectronだけなので、他の依存やbuilderの一括更新は行わない。
- lockfile差分はElectronの版とintegrityだけ。パッケージ全体の待機免除を使い、ほかの7日待機・供給網検査（403 entries）を維持した。制限内の依存リンク作成はアクセス拒否となったため、失敗ログを保存し、同一コマンドを通常ユーザーで再実行して成功した。frozen installと明示postinstallも成功した。
- 45の[公式変更点](https://www.electronjs.org/docs/latest/breaking-changes)を確認した。sandboxed preloadの削除されたBuffer/events/timers/url依存はなく、共通appearance追記もElectronだけを使う。window.open・sandbox・ASARのfd利用も確認し、製品コードの互換修正は不要と判断した。同期safeStorageは45で引き続き利用できるが非推奨のため、46以降の更新前に非同期API対応を確認する。固定builder26.15.3とportable templateの連携は維持した。発行前レビューは未解決指摘なし。
- 型検査とbuild、標準 **833/833（fail/skip 0）** が成功した。依存更新だけでアプリの設定/保存/API契約の追加・削除がないため、通常のパッチ更新として **0.83.1** を発行した。`publish.bat`終了0、EXE/feed/Default Shellの版が一致。EXEは **170470683 bytes / SHA256 `e138f565e1ac8b0e0177dea7be34e0890b6f6f64be717fcd95dbd2806523d7c3`**、`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 固定EXEの実起動で **Electron45.0.0 / Chromium156.0.8078.48 / 内蔵Node24.22.0** を確認した。smoke、表示倍率11群、共通画像/Node・.NET接続9群、更新・実入力・再起動13群、進捗/取消/テーマ9群がすべて成功した。150%の設定画面と狭幅の画像一覧の画像も確認した。2つのeMudhra問題チェーンをNode/Chromiumが証明書エラーで拒否し、正常サイトは両方で成功（計6結果）。内蔵Nodeの表示版を開発用Node24.22.1へ読み替えない。
- GUIはビルド完了後に直列実行し、毎回今回の固定EXEを使った。通知のOS可否/ロックを明示するfixtureと、現行UIの既存driverを再利用し、元の行動・倍率・更新検査は維持した。検査を緩めず期待する本体/Electron版だけを0.83.1/45.0.0へ変更した。物理DPI/ロック画面/UAC/実スピーカー/実Google受信の成功は追加していない。
- コマンド・終了コード・完全ログとhash、検証前後の入力hash・レビュー・driverの元/変更後hash・配布物一致は`.artifacts/electron45-20261022/validation.json`と各phase記録を正本とする。今回の6方式のGUIは正常終了し、当該試験プロセス0を確認した。各方式の今回分とRelease/比較/再利用資料・他作業を保持し、フォルダー削除0件（cleanup.json）。通常publishだけで、全体ZIP・未変更Appletの再発行・GitHub Release・deploy・commit/pushは行っていない。

## 2026-10-22: ランタイム更新規則のコミット前確認

- 利用者から追加の更新規則のcommit/push指示を受領。main/origin/main、未stageの対象11パスと実効author/committer、GitHub/AQUAのmain先端`248f35a`を照合した。未コミット変更を保持し、pull/stash/resetは行わない。
- 実装完了時のmanifest11ファイル・完全ログ5件のSHA256が現在と全て一致した。方針fixture24項目・更新fixture16項目・実pnpm6群を含む関連3テスト（fail/skip 0）、frozen installとsetup2回の成功を再利用する。製品コード・package.json・lockfile・固定ツールに後続変更がなく、追加の製品回帰・版更新・再発行は不要と判断した。今回の追記は本項の記録のみ。
- 対象一覧、再利用元/入力照合、stageと実ファイル・tree・実効identity、commitと各push先mainの照合結果を`.artifacts/commit-validation-runtime-policy-20261022/validation.json`へ記録する。今回の11ファイルだけをコミットし、設定済みのGitHub/AQUAへ通常pushする。

## 2026-10-22: 0.83.0の公開完了・過去Release整理

- 本体`248f35a`、WallpaperSlideshowの生成元記録`8454f59`をGitHub/AQUAへpushし、今回の全体ZIPに同梱した7Appletを照合した。型検査・標準832件の成功は入力hash一致を確認して再利用し、publish・全体ZIP・固定EXEのsmoke/倍率11群/画像9群/信頼診断、portable更新13群・進捗9群・復旧8群、壁紙履歴10群と全体ZIP起動を新たに確認した。UI driverの適応は当該フォルダーの元/変更後hashを記録し、旧ページ構造や既定OFFへの期待だけを現行仕様へ合わせて検査を維持した。
- 本体[0.83.0](https://github.com/yukichi-7sai/AppDock.at365/releases/tag/v0.83.0)、[Profile 0.1.0](https://github.com/yukichi-7sai/Applet.Profile.at365/releases/tag/v0.1.0)、[WallpaperSlideshow 0.7.2](https://github.com/yukichi-7sai/Applet.WallpaperSlideshow.at365/releases/tag/v0.7.2)、[WebApplet 0.3.1](https://github.com/yukichi-7sai/Applet.WebApplet.at365/releases/tag/v0.3.1)を公開した。既存のGmail 0.12.1・Watch 0.1.5・WebBrowserTools 0.3.4・WindowsTools 0.2.2は再作成しなかった。
- 全8repoの匿名ダウンロードsize/SHA256、feedのID/版/payload、実更新検出のavailable/installable/最新版本を照合してから、今回指定された過去の公開Release **16件** を削除した。8repoとも最新の公開Release **1件ずつ** を保持した。通常の最新3件保持は今回の明示指示で1件へ変更し、下書きと削除前のGitタグ参照を維持した。本体0.82.0の下書きは非公開のまま保持した。
- 正式EXEは **169152526 bytes / SHA256 `b3c1d1cc6d964d65df2288ced29fd59dc79c68c0bd52cf01ed42c0eb40c70a75`**、全体ZIPは **285321188 bytes / SHA256 `2e9ebc8a906e99587055f19d176565714587384618530d1141b7ba9dda09d976`**。正式再発行で前回通常publishのhashから変わったため、新しいEXEを固定して全GUIを再確認した。最終時点でもローカル配布物と公開検証済みhashの一致を再確認した。
- source/asset封印、全コマンド・終了コード・ログhash、匿名取得、更新判定、削除前の候補16件・各削除結果・保持したdraft/tagは`.artifacts/release-0.83.0-20261022/`の`plan.json`、`applet-plans.json`、`all-eight-public-verification.json`、`latest-only-cleanup-plan.json`、`latest-only-cleanup-results.json`を正本とする。GitHub作成直後に一覧への反映が遅れた際は、既存draftのID/commit/本文を確認して不足アセット登録だけを再開した。公開済みアセットの上書きや実利用先deployは行っていない。

## 2026-10-22: Release完了後のElectron/Node恒久待機免除

- 全Releaseと過去16件の整理が完了してから着手した。cleanなmain/origin/mainを確認してpull --ff-only成功。`releaseAgeExemptPackages`をNode/Electronだけに限定し、pnpmのElectron免除を版指定からパッケージ全体へ変更した。ほかの依存・pnpm本体/Windows実体の7日待機、公開日時検査、Node LTS/SHA256検査は維持した。
- `update-packages.bat`を更新入口として追加した。公式Node indexの最新LTSとnpmのElectron latest安定版を選び、Nodeの固定版とローカルsetup、Electronの完全版指定、ほかの依存更新の順に実行する。取得/検証失敗では停止し、setup失敗時は元のtoolchain.jsonを復元する。通常ビルドは固定版を使う。開発手順とAGENTSの今後の更新規則を揃えた。
- レビューで選択元・安定版/LTS限定・完全版固定・失敗時停止・junction共有禁止・通常ビルドへの影響を確認し、未解決の指摘なし。Windows PowerShellの方針fixture **24項目**、更新fixture **16項目**、実pnpmの隔離レジストリ **6群** を含む関連3テストが成功（fail/skip 0）。最新版の数値順、beta/Current除外、日時欠落・通信/コマンド失敗、setup後の復元、Electronの即時更新と他依存の待機を確認した。
- `-CheckOnly`の実接続はNode **24.22.1 LTS / Krypton** とElectron **45.0.0** を選択した。今回の依頼は更新規則の設定なので候補照会までとし、新たな依存更新は実行していない。公開済み0.83.0のElectron **44.9.3**・開発Node **24.22.1**、package.json/lockfile/配布物を維持した。設定変更後のfrozen install（403 entries）とsetup2回も成功し、固定環境のhashは不変。製品コード/依存/配布物の変更がないため、追加の製品版更新・再発行・全製品回帰は行わず、公開時の成功結果を保持した。追加の更新規則の差分は未コミット。
- 証跡は`.artifacts/runtime-update-policy-20261022/`と更新fixtureの結果JSON。今回の新しいfixtureは同方式の成功分3回以内を保持し、release-age旧方式も今回の直近3回を保持した。Release/失敗/比較・再利用資料と他作業は保護し、今回作成した成功済み更新fixtureの古い1件だけを削除して直近3回を保持した（cleanup.json）。制限内ではCIM照会不可だったため同一照会を通常ユーザーで再実行し、該当する試験用Electron/Node/.NETプロセス0を確認した。記録・公開物の最終一致確認を除き、後続の製品変更はない。

## 2026-10-22: eMudhra対策とランタイム更新（0.83.0）

- cleanなmain `ecb1603`から`pull --ff-only`で最新を確認。利用者指定によりマイナーを0.83.0へ更新し、Electron 44.6.0→44.9.3、開発用Node 24.21.0→24.22.1 LTSを採用した。lockfileの製品依存差分はElectronだけ。pnpm 12.10.1・builder 26.15.3とportable template、設定・保存・公開APIは維持する。
- 7日未満の採用は今回の明示許可に従い、Node/Electronの完全版だけを例外化。既に成熟した旧例外6件は除去し、他の依存の7日待機・供給元検査・frozen-lockfileを維持。Nodeは公式LTSとZIPのSHA256を確認し、setupの初回・再実行が成功した。制限環境のリンク作成拒否は同一の依存更新コマンドを通常ユーザーで再実行して成功。
- 発行前レビュー1回で版・lockfile・例外・起動/更新経路とABI149を確認し、阻害指摘なし。型検査・標準832/832（fail/skip 0）とWindows PowerShellでのツール方針18件が成功。PowerShell 7での方針fixture起動はJSON整数型の違いで停止したため、setupと同じWindows PowerShellで検証した。製品や検査条件を緩めていない。
- 通常publish成功。固定EXEの起動smoke、表示倍率11群、共通画像9群（Node/.NET接続・Profile・Webを含む）、更新/再起動13群（実入力のジェスチャーを含む）が成功。独立画像ページ待機を現行本体documentへ合わせた既存driverと、通知のOS可否/ロックを明示するfixtureを使用し、元の行動・倍率の検査を維持した。
- 固定EXEのElectron44.9.3 / Chromium152.0.7977.167 / 内蔵Node24.22.0とDefault Shell0.83.0を確認。2種類の問題証明書チェーンをNode側がCERT_REVOKED、Chromium側がERR_CERT_REVOKED/ERR_CERT_AUTHORITY_INVALIDで拒否し、正常対照は両側で接続成功。独立した開発Node24.22.1でも拒否を確認した。内蔵Nodeの表示版を24.22.1へ読み替えず、eMudhra対策のバックポートを実測する。Nodeの診断はTLSハンドシェイクのみ、Chromiumの診断は隔離profileで認証情報なしのHEAD要求。短い待ち時間/正常サイトの転送で止まった記録も保存し、タイムアウトを拒否成功に数えない。
- 実行コマンド・終了コード・ログhash・試験前後の入力hash・EXE一致と失敗/再実行は`.artifacts/security-update-0830-20261022/`、事前調査は`.artifacts/security-audit-20261022/`。Node/Electron更新は完了したが、OS trust-list反映や全Node上流CVEの個別実証、実Google受信・物理DPI/ロック・実NASは今回の追加成功として扱わない。
- Release作業は0.83.0へ切り替える。旧0.82.0とProfile0.1.0は下書きのまま、旧planで再公開しない。新規planと同梱照合・公開後の匿名取得/実更新検出・最新1件を残す整理の最終記録先は`.artifacts/release-0.83.0-20261022/`。利用者から本体と同梱7Applet全ての過去の公開Release16件の削除指示を受領し、全対象の公開後検証成功を条件にする。下書き・Gitタグ/履歴を保持する。
- 全Release作業後、Electron/Nodeのみを7日待機から恒久的に除外し、依存更新時に最新安定Electron/最新LTS Nodeを選ぶ方針変更も依頼された。今回のRelease入力を変えないよう、その変更はReleaseと旧公開物整理の完了後に行う。

## 2026-10-22: 0.82.0のGitHub Release準備

- 利用者から0.82.0のRelease指示を受領。GitHubではv0.82.0が未公開、直近公開版はv0.68.1であることを確認した。対象本体の製品実装は`bfe63f9`、同梱候補は7Applet。公開済み同版は上書きせず、未公開のProfile 0.1.0・WallpaperSlideshow 0.7.2・WebApplet 0.3.1を本体と合わせて扱う。
- 本体の実装時型検査と標準832件、固定EXE GUI11群/smokeの記録を照合した。Release Prepareのregressionには単一の`dev.bat test`全成功ログが必要なため、部分ログの合算で代用せず、今回の準備で実行する。typecheckは製品/試験/依存入力の一致と文書だけの差分を確認して再利用する。
- 最初の準備では標準832/832とpublishが成功したが、同梱WebAppletの共通画像API型不足によりpackが停止し、外部公開は行っていない。WebAppletのみを0.3.1へ互換修正し、標準2件/build/publishと固定本体の共通画像GUI9群で確認。本体の製品変更・版更新は行わない。旧GUIの独立ページ待機は、検査内容を維持したdriverで本体documentへ適応した。
- リリースノートは[docs/releases/v0.82.0.md](docs/releases/v0.82.0.md)。初回の完全記録は`.artifacts/release-0.82.0-20261022/`へ保持し、修正後の新規plan・配布物・更新/復旧/全体ZIP・Applet個別公開・匿名取得/更新検出・最新3件保持の実測結果、各コマンド/終了コード/完全ログ/size/SHA256、対象commitと公開URLの最終記録先は`.artifacts/release-0.82.0-20261022-final/plan.json`および同フォルダーのApplet公開結果とする。実利用先deployは今回の範囲に含めない。

## 2026-10-22: 表示倍率0.82.0の動作確認後コミット

- 利用者から表示倍率の動作確認完了とコミット・pushの指示を受けた。mainの変更25パスをレビューし、表示倍率の設定/保存/API、共通登録、Applet/Web/通知の座標、関連試験と文書が今回の対象であることを確認。追加の製品修正は行っていない。
- 実装時の655入力と現在のSHA256が一致し、型検査/build、関連12ファイル92件、固定EXEのGUI11群とportable smokeの成功を再利用した。未実行だった標準回帰96ファイル740件を追加実行し、標準全108ファイル832/832（fail/skip/cancel 0）の成功が揃った。制限内のWindows/.NET/一時ファイル操作の失敗は保持し、同一コマンドを通常ユーザー権限で再実行して成功。試験前後のソース・生成物hashの一致も確認した。
- 0.82.0の版・発行物を維持。EXEの168,993,727 bytes / SHA256 `12f602b85064cc27ac060c2512eb1d3e0a82f07d013c331fd38e4278c54d4324`、feed、ASARのpackageと生成モジュール、同梱Default Shell、固定GUI/smokeで用いたコピーとの一致を再確認した。再発行・Release・実利用先deployは行わない。
- 開始時のGitHub/AQUAのmainは双方`3040c51081be93d08fe76dfff3fd131d92fcbcc5`でローカルHEADと一致。未コミット変更を保持してpull/stash/resetは行わず、実効author/committerを設定と照合した。対象パス、再利用判定、追加回帰のコマンド/完全ログ/終了コードとhash、stage tree/実ファイル/commit tree、commitと両push先端の照合は`.artifacts/commit-validation-display-zoom-0820/`へ記録する。

## 2026-10-22: Electron画面の共通表示倍率（0.82.0）

- cleanなmain `3040c51081be93d08fe76dfff3fd131d92fcbcc5`でbranch/upstream/worktreeを確認し、`pull --ff-only`はAlready up to date。既存の別worktreeは操作していない。
- 「表示 → 共通」のテーマ直下へ表示倍率を追加。既定100%、フォーム50～200%、JSON/APIは`host.zoomFactor: 0.5～2`。PC専用保存・部分JSON・検索・リセット・共通APIへ接続し、100%は保存から省く。既存の保存値・データを自動変換しない。
- 本体・Shellの全描画領域・ローカル/リモートApplet・Webアカウントの子WebContentsView・独立通知へ共通登録を接続。isolated zoomでorigin間の影響を分離し、設定変更・新規作成・再読込・遷移・再起動へ適用する。.NETが直接出すWindow、Windows標準UI、音声/画像処理workerは除外。
- 発行前レビューで設定/API/保存、画面生成口、セキュリティ境界、座標、通知サイズと試験範囲を確認。埋め込み`AppletSurface.size`がCSSサイズをnative子Viewへ渡していた点を修正し、実ViewのDIPサイズへ統一。Applet/Webアカウントの座標変換と通知workAreaの制限を含め再確認し、未解決の指摘なし。レビュー記録は`.artifacts/display-zoom-validation-20261022/review.json`。設定項目追加のため0.81.0→0.82.0のマイナー更新。
- 固定Node 24.21.0/pnpm 12.10.1、Windows x64、Electron 44.6.0で型検査・build・関連12ファイル92件（fail/skip 0）成功。設定/default/device/JSON/API・配色・通知境界・Webアカウントの既存回帰を含む。標準全回帰や入力フックの実キー試験は今回の変更範囲外のため再実行していない。完全ログ、コマンド/時刻/終了コード、入力一覧/SHA256は`.artifacts/display-zoom-validation-20261022/{typecheck-final,build-final,regression-complete}.json/.log`。
- ソース隔離GUIは`.artifacts/display-zoom-ui-1792611760912/`で11群成功。50/75/100/125/150/200%、同じWebContentsを保持したpage/window/page切替、Web遷移・ローカル再読込、パレット、埋め込みオフラインWebアカウントのCSS→DIP変換、バナー/独立通知、再起動とPC別JSONを検査。native captureで拡大時の本体を確認し、各子描画面も個別に倍率と境界を検査した。
- `publish.bat`成功。発行物の隔離コピーで同じGUI11群（`.artifacts/display-zoom-ui-1792611970498/`）と既存portable smoke（`.artifacts/smoke-1792612018732/`）成功。EXEコピー/元EXE/feedのサイズ・SHA256、app.asar内のpackage、同梱Default Shellの版、主要生成モジュール5件と現在outの一致を確認。記録は`.artifacts/display-zoom-validation-20261022/{gui-portable,smoke-portable,publish}.json/.log`と`artifacts.json`。
- 発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`、168,993,727 bytes、SHA256 `12f602b85064cc27ac060c2512eb1d3e0a82f07d013c331fd38e4278c54d4324`。package/feed/同梱Default Shellは0.82.0。発行中にGUIドライバーへ実行版のassertだけを追加し、製品入力の不変とASAR内の生成物一致を確認した。最終型検査・回帰・固定EXE GUI/smokeの入力hashは前後一致。
- 制限内のGUI接続待ちと.NET発行失敗は成功扱いせず、同じコマンドを通常ユーザー権限で再実行して成功。ソースGUIの追加試験ではショートカットを無効化したfixtureでキー操作を使っていたためパレット待ちに失敗し、公開コマンド呼出とfixture終了処理へ修正して再検証した。失敗profile `.artifacts/display-zoom-ui-1792611237339/`、`display-zoom-ui-1792611500175/`を保持。
- 通知可否はfixtureで許可し、Webアカウントは隔離HTTPSハンドラーでオフライン化した。実ネットワーク、物理DPI変更、Windowsの実受信/ロック/全画面時通知、.NET独自Windowの実表示は今回の検証対象外。利用者による新版の実利用確認は待ち。
- 整理: 今回の倍率専用ソースGUIの成功3回・固定EXE GUI1回と、失敗/再利用証跡を保持。削除候補なし。既存smokeの過去資料は他作業/再利用状況が不明のため保持し、診断用の一時スクリプトだけ除去。コミット・push・GitHub Release・実利用先deployは行っていない。仕様と画面追加規則の正本は[共通表示倍率](docs/display-zoom.md)。

## 2026-10-22: 0.81.0のコミット前確認

- 利用者から0.81.0の動作確認完了と、コミット・pushの指示を受けた。未コミットの条件拡張を保持し、確認済みのソース・試験・依存入力・成功ログと現在の内容を照合した。
- 型検査・build・標準829件・nativeキー50項目・Windows入力228項目・条件fixture33項目・固定EXEのGUI71群/smokeの成功を再利用した。製品・試験・依存・配布物の後続変更はなく、今回の追記は検証文書だけとした。0.81.0と配布EXEのSHA256を維持し、製品回帰の再実行・再発行は行わない。
- 対象一覧、再利用元と入力照合、stage/実ファイル・tree・実効author/committer、commitとpush先端の結果は`.artifacts/commit-validation-shortcut-conditions-0810/`へ記録する。originに設定されたGitHub/AQUAのmainへ、未送信の設計・共通基盤と今回の条件拡張を通常pushする。

## 2026-10-22: キーの「いつ・どこで」を全条件へ拡張（0.81.0）

- 動作確認済みの共通基盤・キー画面を`74b1a1bd63c74a8105acf1d9ffab558a4946f936`（tree `f4ca4775323532d6b2bcf61eeb57313b2617a3d4`、59パス）へコミットした。コミット前の標準827件と既存成功の照合、stage/実ファイル・tree・実効author/committerを確認した。cleanなmainでpull --ff-onlyはAlready up to dateとなり、既存の別worktreeを操作せず条件拡張へ進んだ。pushは行っていない。
- キーにdesktop/browser/exeとglobal/exeのデスクトップ除外を追加した。InputHostが押下時の前面Windowの事実を取得し、既存の条件評価器で一致した行だけの入力ブロックを合成する。first/all・重複除去とは独立させ、AppDock内では同じキーのローカル行を元入力を止めずに共通計画へ渡す。mainは同じ押下対象・revisionを検証する。取得不能な対象条件は一致扱いにしない。
- ブラウザ一覧とChromium条件はkeybindingOptionsへ独立して追加し、既存ジェスチャーの値・保存行の自動移行は行わない。初期値・exe名検証・条件詳細・ブラウザ設定のUIを共有し、専用編集APIのconfigureとwhen Schemaへ接続した。保存・dryRun・revision・3許可・protected keys・既存設定の保持を検証した。設定追加のため0.81.0へマイナー更新した。
- 型検査・本体/Default Shell build・関連165件、標準 **829/829、fail/skip 0**、nativeキー **50項目** と既存Windows入力 **228項目**、開発GUIのキー **13群**・ジェスチャー **21群** が成功した。標準回帰の初回は制限環境によるWindows API/暗号化/一時ファイル操作の失敗で、同じコマンドを通常ユーザーとして実行すると成功した。失敗ログを保持し、依存やチェックの緩和は行っていない。
- 発行前レビューは未解決指摘なし。新しいprocesses配列を含むmanifest条件のdeep clone、nativeへの既知の環境フィールドだけの投影、旧UI試験の8候補への更新を確認した。`publish.bat`終了0。**EXE/feed/Default Shellは0.81.0、EXEは168984723 bytes、SHA256 `eaaecec4c0fa1dcbc6e13c10e308ef09c517ed4ef3ea3e5668dac5ca319cc251`**。成果物は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 固定EXEでキー設定15群・条件付きキーフック13群・ジェスチャー21群・前面化13群・起動2群・設定移動7群（計 **71群**）とsmokeが成功し、各隔離コピーのhashも一致した。実際のShellデスクトップ、WinForms対象、Chromiumの本体を使い、条件不一致時の通過・一致した行だけのORブロック・first/all・重複除去・ローカル重複・無効なexe入力・再起動保持を確認した。両テーマ/3幅の条件編集と、700px幅のブラウザ設定も画像で確認した。
- [検証証跡](.artifacts/shortcut-conditions-20261022/validation.json)に成功/失敗ログ・前後manifest・試験依存・native EXE/DLLと配布物の一致・レビュー・再利用理由を保存した。純粋なnative条件fixture33項目は同じ評価器/fixtureを照合して再利用し、TypeScript側は今回の標準回帰で再確認した。今回の9試験profileとnative fixtureのプロセス0を通常ユーザーで確認し、削除0件。方式ごとの新規成功分は各1回で、固定出力・比較/再利用資料・sandbox失敗・他作業を保持した。0.81.0の追加分は未コミット・未push。Release・deploy・全体ZIP・未変更Appletの再発行は行わず、物理機器/UAC/ロック画面/実利用は隔離環境の合成入力と区別する。

## 2026-10-22: 共通実行基盤・キー設定のコミット前確認（0.80.0）

- 利用者から0.80.0の動作確認完了と、現状をコミットしてから条件拡張へ進む指示を受けた。mainは設計commit1件先行・実装未commitだったため、変更を保持して照合した。既存の型検査・関連163件・Windows入力228項目・条件fixture33項目・配布版GUI66群/smokeは入力と最終EXEのhashが一致し、その成功を再利用した。
- 未実行だった標準回帰を追加し、**827/827、fail/skip 0**。製品ソース・依存・版・発行物の後続変更なしを確認し、0.80.0を維持した。コミット前の対象一覧・入力manifest・stage/tree・実効author/committer・成功ログの照合は`.artifacts/commit-validation-command-foundation-0800/`に記録する。push・Release・deployは行わない。

## 2026-10-22: ショートカットキーの動作設定（0.80.0）

- 既存の段階Aが未コミットのmain／origin/main（設計コミット1件先行）で継続したため、pull・stash・統合は行わず変更を保持した。別の設計用worktreeは操作していない。段階Bとして、設定インデックスとページを「ショートカットキー」、一覧を「ショートカットキー割り当て」へ変更し、一覧の上に初期状態で閉じた「動作設定」を追加した。実行方法のラベル・first/allの表示順・hint・部品をジェスチャーと共有する。レビューで共通セクション間の20px余白も揃えた。
- `keybindingOptions.executionMode`は欠落時all、既定値は差分保存から省略し、ジェスチャーとは独立した共有設定とした。キー全入口の共通アダプターでこの値を読み、フォーム・ページJSON・リセット・外部ファイル更新へ接続した。公開編集はshortcuts.getのoptionsとupdateのconfigureを追加し、割り当てとの原子的保存・expectedRevision・dryRun・3種類の許可を維持した。一般設定APIからの迂回は拒否する。既存行の自動移行は追加していない。設定追加のためマイナー更新した。
- 型検査・本体/Default Shell build・関連13ファイル **163/163、fail/skip 0**、開発GUIのキー **15群**・ジェスチャー **21群**が成功した。キーのfirst/allについて実Windows global入力とChromium合成入力の本体/PageHost、条件によるスキップ・重複除去、保存・JSON・外部更新・再起動・リセット・ジェスチャーとの独立性を確認した。試験側のPromise待機・設定名・Window接続/再起動完了待機と旧表示名の期待値を修正し、失敗ログを保持した。起動直後の失敗1回は、その隔離profileと確認できたElectronだけを終了して再実行した。
- 発行前の自己レビューは未解決指摘なし。`publish.bat`終了0。**EXE/feed/Default Shellは0.80.0、EXEは168989239 bytes、SHA256 `3155ac4b436c58b389aa20add1bacff1208e694b9847831f5bab5831169cb65f`**。成果物は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。InputHost EXE/DLLとnative試験/fixture入力は段階Aと一致し、Windows入力228項目と共通条件33項目の成功を再利用する。
- 固定EXEのキー15群・ジェスチャー21群・前面化13群・キーフック8群・起動2群・設定移動7群（計 **66群**）とsmokeが成功し、隔離コピーのhashも最終EXEと一致した。明暗テーマの1280/900/実700px幅でフィールド・20px余白・画面内への収まりを確認し、画像も目視した。狭幅試験では試験Windowの最小幅だけを解除して、指定幅が900pxへ丸められないことも検査した。
- [検証証跡](.artifacts/shortcut-options-20261022/validation.json)に各ログ・前後の入力manifest・ソース/試験依存/配布物のhash照合・レビュー・失敗履歴・再利用理由を保存した。開発ジェスチャー試験後の差分はキー画面だけへの共通余白class追加であることを照合し、最終配布版で両画面を確認した。今回の14試験profileとnative fixtureに対応するプロセス0を通常ユーザー権限で確認。方式ごとの直近3回を超える今回の不要な成功分はなく、失敗記録・比較/再利用資料・他作業を保持し、削除0件。実装は未コミット・未pushで、Release・実利用先deploy・全体ZIP・未変更Appletの再発行は行っていない。隔離環境の合成入力と、物理機器/UAC/ロック画面/実利用での確認は区別する。

## 2026-10-22: 共通条件判定・コマンド実行基盤の接続（0.79.3）

- 設計文書5ファイルを`eeb2f43`（tree `53ab4d9be6f4fc7e6384d8f63c74826e1356b98d`）へコミットした。対象パス・内容・実効author/committer・リンクを確認し、文書だけのため製品試験と版更新は行わない。cleanになったmain／origin/mainで`pull --ff-only`がAlready up to dateとなってから実装へ進んだ。今回の実装分は未コミットで、pushは行っていない。
- [段階A](docs/command-execution-foundation-design.md)を実装。`command-conditions`と`command-execution`へwhen判定・利用可能性・保存順・重複除去・first/allを集約し、単一の`CommandDispatcher`で予約・再入防止・取消・順次実行を共有する。global、renderer、Shell、PageHostのキー入口とジェスチャーを接続し、GlobalHotKeyManagerの独自実行ループを解消した。nativeの条件と選択は同じfixtureで照合する。
- キーは現行allを維持し、ジェスチャーは保存済みの実行方法を使う。待機表示と本体の選択行ID列を完全一致で検証し、開始対象の事実・session・revision・settingsKeyを照合する。レビューで、40msの同期前に設定/コマンドが変わる場合も受信時・各コマンド直前に止める検査を追加した。押下時のページ条件、元入力の通過/遮断、前面化と同一HWNDでの後続維持を保持する。設定画面・表示名・保存形式・公開Schema・SDKの変更や自動移行はなく、内部整理として本体を0.79.3へパッチ更新した。新しいトリガーの接続規則も文書化した。
- 型検査・本体/Default Shell build、関連9ファイル **122/122、fail/skip 0**、共通TypeScript/native fixture **33/33**、Windows InputHost **228/228** が成功。開発版GUIはジェスチャー21群・ページ条件9群・前面化13群の **43群**、発行した固定EXEは同じ43群にキー設定/実入力10群・Win入力フック8群・トレイ/復元起動2群を加えた **63群** とsmokeが成功した。全標準回帰を一律には実行していない。入力は隔離ウィンドウへの合成入力であり、物理機器の操作感、管理者対象/UAC、ロック画面の確認とは区別する。
- 発行前の差分・影響先の自己レビューは未解決指摘なし。`publish.bat`は終了0。**EXE/feed/Default Shellは0.79.3、EXEは168996670 bytes、SHA256 `a051d2eb59351d6a6a0f2b265988b0fe977a0069762e7d3da5b6f34285bf510e`**。各配布版GUIの隔離コピーも同じhash。配布物のInputHost EXE/DLLは228項目の試験対象とhashが一致するため、その成功結果を再利用した。成果物は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。未変更Appletの再発行、全体ZIP、Release、実利用先deployは行っていない。
- 初回の制限環境でのnative buildは停止し、同一コマンドの通常ユーザー権限での成功を採用した。版更新後のpnpm事前検査は、ローカルworkspace記録が0.79.2のため停止した。junction共有がないことを確認し、固定の`install --frozen-lockfile`でローカル記録を再構築して成功した。依存版・lockfile・toolchain・供給網検査は不変。配布版ページ試験の初回は試験コマンドの引数誤りでEXEの起動前に失敗し、正しいパスで成功した。会話中断時の未完了nativeログは再利用せず、同条件で再実行した228項目を採用した。
- [検証証跡](.artifacts/command-foundation-20261022/validation.json)に完全ログとhash、前後の入力manifest、最終機能ソースとの一致、版metadata/文書だけの後続変更を区別した再利用理由、配布物とコピーの照合を保存。`review.json`と`design-commit.json`にレビュー・設計コミットを記録した。今回の10試験profileとInputTestsに対応するプロセス0を通常ユーザー権限で確認。直近の試験・失敗/中断ログ・固定出力・旧版比較/再利用資料と他作業資料を保持し、削除は0件。実利用での確認は未実施。

## 2026-10-22: 共通条件判定・コマンド実行基盤の設計

- main／origin/main、単一worktree、作業ツリーとインデックスのcleanを確認し、`ce70314`で`git pull --ff-only`がAlready up to dateとなった。現在のresolver／Dispatcher、global・ローカル・Shell・PageHostの入口、InputHost、設定カタログと保存・編集APIを照合して[未実装の設計](docs/command-execution-foundation-design.md)を作成した。
- 最初の実装範囲を「基盤の接続」とし、キーは現行all、ジェスチャーは既存first/allを保つ。共通when判定・保存順の選択・再入防止と、入力ごとの対象・取消を分離する。設定画面の文言変更と折りたたみ、実行方法の保存・API接続は後続工程へ分けた。レビューでは、nativeの捕捉前判定と待機表示の一致、押下時context、前面化、firstの非繰り下げ、元入力のブロックと選択の独立性、既存の共有Settings範囲との一致を確認した。
- 設計書の相対リンク12件と前面化の見出し、入口3文書からの参照、7表の列数、コードフェンス4本の対応、末尾空白、会話上の人物名を含まないこと、`git diff --check`を確認した。実装・設定例の変更はなく、製品試験・build・版更新・publishは実行しない。現在の動作を検証済みに読み替えず、段階A/Bで必要な試験を設計書へ記載した。コミット・push・Release・deployは行っていない。

## 2026-10-22: 2段階移動・前面化のコミット前検証（0.79.2）

- 利用者から2段階移動と最終版の本体前面化の動作確認を受け、関連する変更25ファイルをまとめる。mainの開始先端は`8a36c114c9de2b1e9b9adff1e4ad57354bdf1b15`。fetch後のGitHubと、設定済みpush先`\\AQUA\GIT\AppDock.at365.git`のmainも同じ先端だった。未コミット変更は保持し、pull・stash・履歴統合は行っていない。
- 標準回帰106ファイル・**784件成功、失敗/skip 0**。実装時の関連4ファイル48件と、過去の成功ログへ静的な試験名を対応づけ、require依存・固定Node/lockfile/toolchainが一致した9ファイル39件を再利用した。残る93ファイル697件を今回実行して成功した。
- 制限環境の初回実行はファイル置換・子プロセス・Windows情報取得のアクセス拒否などで失敗し、`sandbox-failed/`へ完全なログと終了コードを保持。同一コマンドを通常ユーザー環境で再実行した成功結果を採用した。検査・依存・設定を弱める変更はない。
- 実装時の型検査、固定EXE0.79.2の前面化13群とsmoke、同一InputHostバイナリのWindows入力228項目、影響のないGUI31群の再利用理由とログを照合した。ソース・試験・出力・成果物のhashに新たな製品差分はなく、利用者が確認した版をそのままコミット対象とする。版更新・再発行は行わない。
- コミット前のstage/作業ファイルの一致、stage treeとcommit tree、実効author/committer、両push先mainとローカルHEADの照合は`.artifacts/commit-validation-gestures-0792/`の`validation.json`・`stage.json`・`commit.json`・`push.json`を正本とする。GitHub Release公開・実利用先へのdeployは対象外。

## 2026-10-22: ジェスチャーから本体・ページを開く際の前面化（0.79.2）

- 直前の2段階移動の未コミット変更を保持して追加修正した。dirtyのためpull・退避・履歴統合は行っていない。設定項目・保存ファイル・公開APIの変更はなく、移行処理もない。
- `showWindow(invocation)`へジェスチャーの開始元を渡し、InputHostで表示前に生存session・開始HWND・本体所有の表示先を確認してから、表示後に前面化する。権限は呼び出しから1.5秒以内・1回だけ。別workerでの`BringWindowToTop`を既存の`ForegroundPermission`へ接続し、フック内で待機しない。本体ページ・設定カテゴリ・コマンド検索は共通入口を使う。
- 前面を移す場合は開始元向けの後続コマンドを止め、元から本体が前面の場合は登録順の実行を保持する。通常のAppletコマンドは開始元の前面を保持する。入力プロセスの準備要求が失敗しても、要求された本体表示は`finally`で行う。
- 発行前の自己レビューで、実Electron Windowでの前面化、表示要求の失敗経路、同じHWNDの後続処理、native試験の自動アクティブ化による偽陽性を確認して修正・再検証した。途中の発行版0.79.1へ同じHWNDの互換性修正を加えたため、発行ごとのパッチ更新規則に従い最終版を0.79.2とした。詳細は`.artifacts/gesture-foreground-20261022/review.json`。
- 旧版0.79.0の隔離EXEで、`appdock.open/hidden/move-left`がvisible/focusedになっても、`GetForegroundWindow`は開始元のままである状態を再現した。記録は`foreground-base-20261021T161017072Z`とprofile `gesture-foreground-1792599017936`。初期化前の試験、前面の干渉が疑われた試験、要求ファイルの読み書き競合の失敗ログは保持し、成功証跡へ流用していない。
- 最終ソースの型検査・build・関連unit/API試験48件が成功。開発GUIと固定EXE **0.79.2** それぞれで前面化13群が成功し、非表示・表示中・最小化からの1/2段階移動、クリック・ホイール・キー、本体表示・設定カテゴリ・ログ、通常コマンドの前面保持、グローバルF16、すでに前面の本体での後続コマンドを実OSの前面HWNDと実行記録で確認した。固定EXEのsmokeも成功。
- Windows入力228項目（全12組の移動、表示、取消、キー解放、右クリック復元、前面化の期限・所有者・単回制約など）と固定EXE0.79.1のGUI31群（ジェスチャー21・ショートカット8・起動2）は成功済み。0.79.1以後の製品差分は`activateGesture`の同じHWNDでの準備省略だけで、これらのGUI fixtureはこの分岐を呼ばず、最終版の13群で追加分岐を確認した。InputHostのEXE/DLLは最終発行物とバイト一致を照合し、入力228項目はその同一バイナリの結果として再利用した。ログ・前後の入力manifest・再利用理由・保持した0.79.1の試験EXEのhashは`validation.json`に記録する。
- 発行先`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`、版`0.79.2`、168,982,144 bytes、SHA256 `02147b04d02bbd3df61f7724443cb4c0c0f7989b95e3ac8d08b166a48fba9caa`。`update.json`の版/size/hash、同梱Default Shellの版、試験コピーのhashを照合する。
- 検証証跡の正本は`.artifacts/gesture-foreground-20261022/validation.json`。各試験は直列の隔離profileで実施した。終了後のプロセス確認は`process-cleanup.json`、成功したテストフォルダーの直近3回と参照状況の整理は`cleanup.json`に記録する。失敗・再利用資料・用途不明のフォルダーは削除しない。
- 最終版の本体前面化は利用者確認済み。昇格対象・UAC・ロック画面は未確認で、Windows上の自動SendInputと実HWNDの検証をこれらの確認と混同しない。実装段階では関連試験に絞り、コミット前の標準回帰は上の記録に記載した。GitHub Release公開・実利用先へのdeployは行っていない。

## 2026-10-22: マウスジェスチャーの2段階移動（0.79.0）

- mainの`8a36c11`、origin/main、作業ツリー・インデックス・未追跡ファイルを確認。cleanのため`git pull --ff-only`を実行し、Already up to dateを確認して設計・実装した。
- 移動の設計を[ジェスチャー](docs/gestures.md#移動の段階と判定)へ集約。既存4方向に、右→上・上→下など異なる2方向の12種類を追加した。各段階に既存の距離設定を使い、同方向の継続は段階を増やさず、3方向目へ変えると解放まで取消する。右ボタン解放時だけ完成した方向列と完全一致する操作を実行し、未割り当ての2段階から1段階へ戻して実行しない。設定編集は1/2段階の選択と最初・次の方向指定、待機表示は矢印列とアクションの更新に対応。公開編集API・保存・検索表示・実行順も同じカタログを使う。
- 保存済みの1段階ID・安定行ID・条件・保存順とfirst/allを保持。設定項目・保存ファイルの追加や自動移行はない。方向転換の取消契約を2方向目から3方向目へ変更するため、操作契約の変更として本体を0.78.4から0.79.0へマイナー更新した。AGENTSと利用者向け仕様、API説明も現行動作へ更新した。
- 発行前の差分・影響先の自己レビューは未解決指摘なし。型検査・本体/Default Shell build、関連4ファイル **47/47、fail/skip 0**、InputHostのWindows入力 **206/206**、開発版ジェスチャーGUI **21群** が成功。12通りすべて、各段階での実行保留、逆方向への折り返し、同方向継続・距離未満の揺れ、未割り当て時の非実行と右クリック非復元、表示の更新/非表示、first/all・条件・重複除去、3方向目の取消を確認した。標準全回帰を一律には再実行していない。
- `publish.bat`が終了0。発行した固定EXEの隔離コピーでジェスチャー **21群**、ショートカット **8群**、トレイ起動/復元起動 **2群**、smokeが成功。配布物のInputHostそのものでも **206/206** が成功し、ビルド出力とのEXE/DLL hash一致を確認した。設定の追加・再編集・実行順・取消・保存・再起動、両テーマ/1280・900・700pxの到達性と横方向のはみ出しなしを検査。開発版と固定EXEの2段階編集画像を目視し、方向選択・無効表示・スクロールと追加ボタンを確認した。
- **EXE/feedは0.79.0、168972289 bytes、SHA256 `e3cf8cf3d711d657a1e7b710390e44d3d5ef698702c2cff65b6e23f12ae14146`**で一致。Default Shellも0.79.0、各固定GUIのコピーhashも同値。成果物は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。兄弟Appletの変更・再発行、全体ZIP、commit/push/Release/実利用先へのdeployは行っていない。
- [検証証跡](.artifacts/gesture-two-step-20261022/validation.json)へ各コマンド・終了コード・完全ログとhash・前後の入力manifest・最終入力との照合・環境・発行物を保存。初期の.NET/GUI/発行は制限環境で停止したため、そのログを保持し、同じ処理を通常ユーザー権限で再実行して成功した。依存版・lockfile・供給網検査は変更しない。発行前の成功からの変更は版メタデータと文書だけで、機能ソース・試験・依存定義が一致することを照合した。
- 整理では種類/実行方式ごとの直近3回、検証・再利用先から参照される旧証跡、他作業での使用状況が未確認の資料と失敗ログを保持し、削除0件。今回のprofileと試験helperの稼働プロセス0を通常ユーザー権限で確認した。[整理記録](.artifacts/gesture-two-step-20261022/cleanup.json)へ確認内容を保存。実物理マウスでの操作感、管理者対象/UAC/ロック画面は今回の確認対象外。

## 2026-10-22: MCP設定修正のコミット・push前確認（0.78.4）

- 利用者が実利用でダイアログ内のエラー表示を確認し、関連変更のコミット・pushを依頼した。mainの`4c6af67`、追跡先、変更13ファイル、実効author／committerを確認。GitHubとAQUAの両mainは同じ先端だった。未コミット変更を保持し、pull・stash・統合は行わない。
- 0.78.4検証時の639入力、完全ログのSHA256と終了0、固定EXE／feedの一致を照合。関連6ファイル62件とソース／固定EXE GUI各10群、smoke、型検査・build・publishの成功を再利用した。残りの標準試験は依存するcompiled JS・試験helperのhashを旧成功記録と照合し、33ファイル164件を再利用。間接入力・native・プロセス・版依存や変更のある67ファイル555件を追加実行し、**標準106ファイル・計781/781、fail/skip 0**となった（再利用226件／追加実行555件）。
- 入力manifestの再照合で製品ソース・試験・依存・発行物の後続変更なしを確認。検証記録だけを追記し、0.78.4の版と配布物を維持した。レビューの未解決指摘なし。証跡は`.artifacts/commit-validation-mcp-settings-20261021/`の`selection.json`、`validation.json`、完全ログ、stage／commit／pushの照合記録。選択一覧は106ファイルを重複なく網羅する。隔離fixtureと実際の2台間同期・外部サービスの確認は区別する。

## 2026-10-21: MCP追加・編集ダイアログ内の入力エラー（0.78.4）

- main／origin/mainとworktreeを確認し、前項0.78.3の未コミット差分を保持して追加修正した。dirtyのため自動pull・stash・統合は行わない。追加／編集でURLが空または不正な場合、ダイアログへ返した例外を`SettingsPageSession`が裏のページにも保存していた。修正前の隔離GUIで、ページモデルの`editing.error`に「MCPのURLを入力してください。」が残ることを再現した。初期のDOM件数だけの確認は非同期反映を見逃したため、回帰ではページモデルとDOMの両方を検査する。
- 発行済みアクションの実行中の失敗は呼出元のダイアログ／操作欄へ返し、設定ページに重複保存しない。`SettingsDialog`内のエラー表示、入力保持、修正後の再保存を維持する。不正なアクションID、フォーム／JSON編集、ページ操作そのものの失敗は従来のページ診断を保ち、operationIdの重複実行防止も維持した。設定・保存形式・公開Schemaを変更しない追加修正として0.78.4へパッチ更新。共通一覧の追加規則とMCPの正本文書を更新した。
- 発行前の自己レビューは未解決指摘なし。型検査・本体／Default Shell build・publishが終了0。関連6ファイル **62/62、fail/skip 0** が成功し、アクションの失敗は呼出元へ返ること、不正ID等はページ診断に残ること、保存済み値の不変と再操作を確認した。標準全回帰の一律再実行は行っていない。
- ソースと新しい固定EXEで専用GUI **各10群** が成功。追加ダイアログの空URL、編集ダイアログの不正URLで、エラーがダイアログ内だけに表示され、名前・URLの入力と既存ファイルを保持することを確認した。修正後は同じダイアログから保存でき、裏のページにエラーや再読み込み案内を残さない。前項の未設定スイッチ、正常行編集、接続成功、通信／認証失敗時のOFF保存＋警告のみ、明示修復、再起動も確認。固定EXEの追加・編集エラー画像を目視確認し、専用ハーネスの正常終了とsmoke成功を確認した。
- EXE／feed／生成・同梱Default Shellの版は **0.78.4**。EXEは **168978899 bytes / SHA256 `9cb1f40de572a514883d4cebf499f354510a3434be92501184e83f0ce1a88d2a`**で、GUIのコピーと一致。`A:\40.ARTIFACT\AppDock.at365`へ発行し、既存の配置スクリプト等4ファイルのhashを保持した。Node 24.21.0／pnpm 12.10.1、固定lockfileと供給網検査を維持した。
- 証跡は`.artifacts/mcp-dialog-errors-20261021/validation.json`、`review.json`、`artifact.json`、入力manifest・完全ログ・各GUI profile。639入力を照合し、unit／ソースGUI後の差分は製品版のmetadataだけで、固定GUI／smoke前後の差分は0。修正前再現と直近の成功profile、前項の再利用資料・固定出力は保持し、今回の削除はなし。実リモートMCP・実2PC同期・利用者の認証による試験は行っていない。コミット・push・Release・実利用先deploy・未変更Applet再発行はなし。

## 2026-10-21: MCP接続先の警告・編集・有効化（0.78.3）

- main／origin/mainのclean、追跡先とworktreeを確認し、`4c6af67`から`pull --ff-only`で最新を確認して実装。共有するID・名前・説明・順序と、PC専用の接続・認証・有効状態・公開許可という保存境界を維持した。設定項目・保存ファイル・公開APIの追加削除はなく、通常修正として0.78.3へパッチ更新した。移行・実利用設定の変更は行わない。
- 未設定と明示OFFの接続先は起動時の警告から除外し、未設定または形式不備で有効なPC接続設定がない行は有効スイッチだけを非活性にした。OFFの認証情報を復号できなくても、他の接続先の編集や起動を警告で妨げない。設定ファイルの外枠と各エントリの検証を分離し、不正な1件と暗号文を保持したまま、他の行の編集・順序変更・接続を可能にした。ファイル全体のJSON不正・未知版・上限超過は、元ファイルを保持して読み取り専用にする。
- ローカルUIでONにする操作と未接続の接続先をONで保存する操作は、接続・ツール一覧取得を確認し、失敗時はその接続先をOFFへ戻して保存する。失敗は安全な警告結果で返し、共通警告バナーだけに案内し、処理エラー通知・設定ページ内エラー・再読み込み案内へ接続しない。ツール取得による接続確認も同様。遅い接続失敗で別編集の新しい接続先をOFFにしない。管理APIの保存時に接続しない契約と、起動時の遅延接続は保持した。
- 発行前の自己レビューで、暫定ONの保存時に設定警告が出て、接続失敗の警告と二重になる可能性を修正した。接続確認の印を保存前から付け、途中の永続警告と処理エラーを抑止する。回帰で保存時・OFF復帰時の永続警告なし、GUIで失敗ごとの警告ログ1件を確認した。最終レビューの未解決指摘なし。正本`docs/mcp-client-design.md`と共通一覧の`canToggle`追加規則を更新した。
- 型検査、本体／Default Shell build、固定依存のinstallとpublishが終了0。関連6ファイル **61/61、fail/skip 0**（MCPクライアント、警告、設定ページ／接続寿命、カスタムコマンド、外部操作）を実行。HTTP JSON/SSE・stdioの既存回帰に、未設定/OFF、破損行の分離と保持、ON失敗のOFF保存、認証失敗、設定競合、警告の二重抑止を追加した。今回の実装段階では無関係な標準全回帰を一律実行していない。
- ソースの専用GUI **7群**と、新しい固定EXEの専用GUI **8群**が成功。未設定スイッチ非活性、正常行の編集、実MCP fixtureへのON/OFF、通信／認証失敗のOFF保存と警告のみの表示、ダイアログのON保存失敗、明示的な接続確認、破損行の明示修復、再起動後の未設定/OFF警告なしを確認。固定EXEのsmokeも成功し、Default Shell起動・bridge・画像・トレイを確認した。固定EXEの設定画面画像を目視確認し、各ハーネスの正常終了を確認した。
- 発行先は`A:\40.ARTIFACT\AppDock.at365`。EXE／feed／Default Shellは **0.78.3 / 168976924 bytes / SHA256 `9531433d1ba59e1c0231f871ed84a5bec53060a707c17235a2440226a11578fc`**で照合し、固定GUIのコピーも同じhash。既存の配置スクリプト等4ファイルのhashを保持した。Node 24.21.0／pnpm 12.10.1を使用し、固定lockfile・供給網検査を維持した。
- 証跡は`.artifacts/mcp-settings-resilience-20261021/validation.json`、`review.json`、`artifact.json`、入力manifestと完全ログ、各GUI profile。入力639ファイルを照合し、最終unit後の差分は専用GUIスクリプトへの版情報追加だけで、固定GUI／smoke前後の差分は0。制限下のEPERM・Electron起動失敗・.NET発行失敗はログを保持し、同一コマンドの通常ユーザー実行で成功を確認した。途中の型エラー・GUI selector不一致も修正後の結果と区別して保持。成功／失敗の新しい出力と再利用資料を保持し、今回の削除はなし。
- 隔離profileとfixtureによる確認であり、実際の2台間同期サービス・実リモートMCP・利用者の認証情報による確認は未実施。コミット・push・Release・実利用先deploy・未変更Appletの再発行は行っていない。

## 2026-10-21: コマンド一覧の横スクロールバーと設定インデックス（0.78.2）

- main／origin/mainのcleanと最新取得を確認し、入力条件のページ化を含む`392e3c1`／発行版0.78.1から実装。長い一覧の下端が約5621px、表示領域の下端が848pxとなる状態を隔離GUIで再現した。横スクロールバーは全行の下へ出ていたため、対象2画面の一覧部分を残りの高さで縦横スクロールさせ、検索・件数・対象解除は一覧の外に保持した。
- サイズ包含で全行の高さが親の最小サイズへ伝わることを防ぎ、説明・操作欄の最小サイズと一覧の80px最小高を保つ。低い画面やジェスチャー動作設定の展開時はページ側のスクロールでも一覧へ到達できる。必要な横バーを12pxで表示し、thumb／trackは共通の中立色を使用。横方向に収まる一覧では横バーを表示しない。
- 設定インデックスのApplet管理に`extensions`、通知に`bell`を追加。リボングループと同じ`shared/ui-icons`を参照し、既存3項目と同じ18px・右余白・選択状態の継承色を使う。保存設定・保存ファイル・公開APIを増減しない表示変更として0.78.2へパッチ更新し、正本`docs/settings-list-editing.md`へ追加条件を記載した。
- 発行前レビューで、広い`command-shortcuts`セレクターがAI一覧にも一致することを見つけ、全ての高さ／スクロール規則を`shortcuts-editor`／`gestures-editor`へ限定した。AIのblock配置とApplet詳細の既存構成を保持。最終レビューの阻害指摘なし。小画面・内容の最小サイズ・到達位置を修正した途中の試験と、修正前再現のログ／画像を保持している。
- 固定install・型検査・本体／Default Shell build・publishが終了0。固定Node 24.21.0／pnpm 12.10.1、LUNAで確認。697入力・822生成物を記録し、最終試験前後で変わった入力はこの文書だけ。
- 最終ソースの専用GUI **13群**と既存移動GUI **7群**が成功。新しい固定EXEでも専用 **13群**＋移動 **7群**、計**20群**とsmokeが成功。明暗×1280×900／760×900／760×640×2画面の**12条件**で一覧の到達性・縦スクロール・最終行を確認し、横にはみ出す**8条件**は12pxのバーから右端の移動列まで到達した。横に収まる検索結果では横overflowなし。新しい5つのインデックスアイコンの存在・右余白・継承色、編集ダイアログの開閉、動作設定を開いた低い画面、AIの既存配置も検査した。固定EXEの明暗画像を目視確認。
- 既存移動GUIで、コマンド別・Applet別の割り当て色、現在画面／非カスタム移動の非表示、左寄せ、余白、絞り込み解除、編集／ON/OFFを再確認した。先行したページ条件変更のコア・unit試験・依存の一致を照合し、標準773件のうち非影響の**707件**を再利用。native再生成・版依存の9ファイル**66/66**を実行し、計**773/773、fail/skip 0**。発行処理中の初回はmounted updater fixture1件で`ok:false`となったが、発行後の同一コマンドでは全66件が成功。原因は断定せず初回ログを保持した。
- EXE／feed／Default Shellは**0.78.2 / 168977979 bytes / SHA256 `6ee8b2de1ac936f835fb4d0cc38a5b10599779e0d69ed350affa2cf6bc3b3fcb`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行。各固定EXEコピー・設定／登録画像の保存先も照合。実利用設定・deploy・未変更Applet再発行・全体ZIP・公開Releaseは対象外。
- 証跡は`.artifacts/settings-scrollbars-index-20261021/validation.json`、`review.json`、`regression-selection.json`、入力manifest・完全ログ・各隔離profile。既存の再利用元、今回の調整過程の成功／失敗、状態不明の出力、固定出力は保護して削除なし。専用試験プロセスの終了を確認。stage／commit tree・名義・両remote先端の照合は同フォルダーへ記録する。隔離GUIの結果を実利用先の物理入力の保証へ拡張しない。

## 2026-10-21: ページ単位条件のコミット前検証（0.78.1）

- 実装時の入力・生成物・native/helper・完全ログと固定EXEのSHA256を現在の内容へ照合し、関連10ファイル91件、固定EXE GUI47群、型検査・build・publish・smokeの成功を再利用した。非影響の3ファイル15件は直前の標準回帰記録と各require依存のhash一致を確認して再利用した。
- 変更した共通条件や設定schemaを参照する試験、版・native出力・ファイル操作に依存する試験を含む残り93ファイルを追加実行し、**667/667、fail/skip 0**。再利用と合わせた標準回帰は106ファイル**773/773、fail/skip 0**。制限環境のWindows/.NETアクセス拒否は同一コマンドを通常ユーザー権限で実行して解消し、失敗ログは別途保持した。検証前後の製品・試験入力は一致した。
- コミット対象の実装・共通API・設定保存・入力経路・設計書を再レビューし、阻害指摘なし。製品内容は発行済み0.78.1のままで、再発行は行わない。追加差分はこの検証記録だけ。開始main `ce6a244`、GitHub/AQUA両mainの同一先端と実効author/committerを確認した。
- 再利用元・依存別の選択理由・入力manifest・完全ログ・発行物照合は`.artifacts/commit-validation-input-pages-20261021/validation.json`と`regression-selection.json`。対象一覧と作業ファイル/stageの一致、stage/commit tree、通常push後のGitHub/AQUA両mainとcleanの照合値は同フォルダーの`stage.json`・`commit.json`・`push.json`へ記録する。

## 2026-10-21: ショートカット・ジェスチャーのページ単位条件（0.78.1）

- cleanなmain `ce6a244`と追跡先を確認し、`pull --ff-only`は更新なし。共通候補`shared/shortcut-pages`を導入し、本体5ページ（ホーム・画像ライブラリー・設定・ログ・通知センター）とAppletの各宣言ページを列挙する。画面を持たないAppletは新規候補から除外し、同名ページには提供元を添える。設定内の各カテゴリは「設定」に含める。表示は「AppDockのすべてのページ」「AppDockの指定したページ」へ統一した。
- 本体は`host:<route>`、AppletはSurfaceの`page:<appletId>:<pageId>`で識別する。実Windowフォーカス・表示中ページをショートカットとジェスチャーの共通判定へ渡し、本体rendererの入力前チェックとShell入力経路も揃えた。公開編集APIは同じ候補とschemaを使用し、`shortcuts.get`/`gestures.get`へ`pages`を追加。設定の自動変換・削除処理は追加していない。設計・仕様は[条件付きショートカット](docs/keybindings.md#ページ候補と識別)、[ジェスチャー](docs/gestures.md)、[外部操作](docs/automation.md)を更新した。
- 発行前に差分・保存形式・公開API・入力経路を自己レビューした。最初の0.78.0固定EXE試験で本体rendererの入力前チェックにページ情報が不足することを検出し、Shell側の同様の経路も修正。開発GUI9群で再検証し、最終レビューの未解決指摘は0。新しい対象ID形式は旧版parserとの往復互換がないため0.78.0へマイナー更新し、発行後の製品修正として最終版を0.78.1へ進めた。
- 型検査・本体/Default Shell build・固定install・標準publishが終了0。関連10ファイルの回帰は**91/91、fail/skip 0**。候補・対象ID検証・ページの識別・owner・実フォーカス・同一Appletの別ページ・設定・公開APIの原子的保存を確認した。製品修正後の最終生成物で関連回帰を再実行し成功した。実装段階の必要範囲を選び、無関係な全回帰は実行していない。
- 最終固定EXEはページ条件専用GUI **9群**、既存keybindings **10群**、gestures **20群**、shortcuts **8群**、計**47群**とsmokeが成功。5本体ページでショートカットとnativeジェスチャーが一致し、同一Appletの2ページ・独立Window・両候補一覧・画面なし除外・検索・保存再起動を確認した。既存回帰でグローバル実OS入力、WebApplet、Gmailのオフライン画面、入力記録、順序、外部競合、明暗3幅も確認。専用GUIの一覧画像を目視し、ページ名・新しい条件名・全候補・ダイアログの到達性とエラー表示なしを確認した。
- 既存GUI試験のportable起動待機は共通`electron-test-launcher`へ揃え、宣言済み設定ページ公開コマンド・ホームにも一致するpages条件・Applet管理から共通画面へ移動する現行経路・平坦な互換コマンド表示へ期待値を更新した。各影響試験を再実行して完走し、試験だけの修正による製品再発行は行わない。失敗ログは保持する。制限内の.NET発行/EXE spawn失敗は同一コマンドを通常ユーザー権限で再実行して成功し、依存・セキュリティ検査は維持した。
- **EXE/feed/Default Shellは0.78.1、168966737 bytes、SHA256 `d139ae99fca6e99e9e6e3edc533e7959ecdee9491cb06c608b33e05903b51e42`**で一致。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。各固定GUIのコピーhashも同値。兄弟Appletの変更・再発行、全体ZIP、commit/push/Release/実利用先へのdeployは行っていない。
- [検証証跡](.artifacts/input-pages-20261021/validation.json)へ620入力・215生成物・native602ファイル・試験helper2件・完全ログのhash、各実行の前後入力、レビュー・再検証・発行物の照合を保存。関連3文書のローカルリンク21件と`git diff --check`は成功。試験ごとの成功を最終ソースへ照合し、後続変更がGUIスクリプトだけであることと公開製品入力が不変であることを検査した。
- 整理では今回の14隔離profileに紐付く稼働プロセス0を確認。今回の成功/失敗証跡と過去の参照付き再利用資料を保持し、再利用範囲が未確定の他作業の古いprofileは削除しない。削除0件を[整理記録](.artifacts/input-pages-20261021/cleanup.json)へ記録した。実物理キーボード・UAC/ロック画面・実サービス受信は今回の確認対象外。

## 2026-10-21: カスタムコマンドのKeyboard Command Keyアイコン（0.77.9）

- 0.77.8の発行・`b37fad2`のGitHub／AQUA push後、追加依頼によりカスタムコマンドのアイコンをGoogle Material DesignのKeyboard Command Keyへ変更。clean／main・追跡先と最新取得を確認し、共通`commandSettingsPages`を通じて設定インデックスと移動ボタンを同時に切り替えた。他のcommand／terminalアイコンは変更しない。
- 公式リポジトリの24px SVGを取得し、pathが完全一致することを検査。文字フォントに依存せず、共通`Icon`の`currentColor`塗りとstrokeなしで描画する。出典・組み込み時の変更内容・Apache-2.0ライセンスを`assets/material-design-icons-LICENSE.txt`へ収録し、配布対象へ追加。組み立て済みapp.asar内の同ファイルがソースと一致することも確認した。保存仕様・設定キー・公開APIを変えない追加表示変更としてパッチを更新した。
- 発行前レビューで阻害指摘なし。固定install・型検査・本体／Default Shell build・publishが終了0。固定Node 24.21.0／pnpm 12.10.1、LUNAで確認。693入力・821生成物とログを記録し、試験前後の差分はこの文書だけ。
- 新しい固定EXEの`settings-hints-ui-test --command-navigation-only` **7群**とsmokeが成功。明暗×1280／760幅で共通アイコン・既存の非表示・左寄せ・左右余白・割り当て色・解除位置・移動／編集を確認し、生成画像の⌘を目視した。12余白条件・33色サンプル・15対象表示の位置を再照合。前段0.77.8のApplet単位判定を含む成功結果を最終版でも確認した。
- unitの試験・import対象compiled main/shared・依存と条件を前段の証跡へ照合し、非影響の**702件**を再利用。native再生成・版依存の9ファイル**66/66**を追加実行して、標準は計**768/768、fail/skip 0**。この版の回帰は初回成功。
- EXE／feed／Default Shellは**0.77.9 / 168969677 bytes / SHA256 `86ca07f984aa25c80e6fd1442cdeb2b3501937af392976bbf297cd65f6e07d89`**で一致。`A:\40.ARTIFACT\AppDock.at365`へ発行し、固定EXEコピー・設定／画像の保存先を確認。実利用設定・deploy・全体ZIP・未変更Applet再発行・公開Releaseは対象外。
- 証跡: `.artifacts/settings-command-key-icon-20261021/validation.json`、`review.json`、`icon-source.json`、入力manifest、`regression-selection.json`、完全ログと隔離profile。前段の資料・失敗／不明出力・固定出力を保持し、今回は削除なし。専用プロセス終了を確認。stage／commit tree・名義・通常push後のGitHub／AQUA両main一致は同フォルダーへ記録する。

## 2026-10-21: Applet単位の割り当て表示と移動・解除の配置（0.77.8）

- main／origin/mainのcleanと最新取得を確認し、`240b815`から実装。Applet管理のショートカット／ジェスチャー移動ボタンは、そのAppletの提供元IDと完全一致するコマンドに割り当てがあれば共通の`accent-action`で表示する。無効な割り当て・停止／無効Applet・ジェスチャー機能OFFでも登録ありとし、キーや実行条件から所有者を推定しない。
- 本体は保存済みコマンドIDと設定カタログの`extensionId`を照合し、該当Applet IDだけを管理用補助モデルへ投影する。未知の提供元や似たIDの混入を避け、設定／ログの移動色・実行可否・外部公開状態を変更しない。割り当て追加・削除と重複の最後の削除で即時更新する。
- ショートカットの移動、カスタムコマンドの操作・移動アイコンをセル内で左寄せに変更。ボタン1個／2個、広幅／狭幅でもセル左右の余白を保つ。ジェスチャーの移動列は従来の配置を保持する。
- 追加依頼により、ショートカット／ジェスチャーのコマンド対象表示と解除ボタンを、Applet対象と同じ検索欄より上へ移動。共通の段落部品を直接使い、対象表示を二重に出さず、スクロールと絞り込み解除を保持した。現行仕様は`docs/settings-list-editing.md`と`docs/applet-management-settings-design.md`へ整合した。
- 発行前レビューで阻害指摘なし。保存設定・保存ファイル・公開APIを増減しない表示変更としてパッチ更新。固定Node 24.21.0／pnpm 12.10.1、LUNAで固定install・型検査・本体／Default Shell build・publishが終了0。
- ソースと固定EXEの`settings-hints-ui-test --command-navigation-only`が各**7群**成功。明暗×1280／760幅×3ページの**12条件**で個数・現在画面除外・左右余白と指定列の左寄せを検査。**33色サンプル**が共通配色と一致し、**15箇所**の対象表示が検索欄より上・左端一致・間隔約12pxで、Applet／コマンド単位の位置が一致した。停止Applet、無効割り当て、未知の類似接頭辞、別提供元、重複の追加削除、既存の移動・解除・編集／ON/OFF、停止Appletを起動しないことも確認。生成画像を目視確認した。
- unitの試験スクリプトとimportするcompiled core/sharedの一致を照合し、非影響の**702件**を再利用。native再生成・版依存の9ファイルを実行し**66/66**、計**768/768、fail/skip 0**。初回はmounted updaterのfixture結果1件で`ok:false`となったが、同一入力・同一コマンドをGUI終了後に再実行して全件成功。原因は断定せず初回ログを保持した。新規GUI fixtureの所有者制約違反と非同期解除の待機不足は試験だけを修正し、失敗ログも保持している。
- 固定EXE smoke・コピーSHA256・設定／共有画像の保存先照合も成功。EXE／feed／Default Shellは**0.77.8 / 168970643 bytes / SHA256 `3a5e12a89c814c080ae434df9a98540e6739801814eca6a4ec751f3328ee1a46`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行した。実利用設定・deploy・未変更Applet再発行・全体ZIP・公開Releaseは変更していない。
- 証跡は`.artifacts/settings-applet-assignment-20261021/validation.json`、入力manifest、`review.json`、`regression-selection.json`、完全ログと各隔離profile。固定出力・再利用元・失敗／状態不明の出力は保護し、今回は削除なし。専用プロセスの終了を確認。隔離fixtureの成功を物理入力や外部サービスの保証へ拡張しない。stage／commit tree・名義・両remote先端の照合は同フォルダーへ記録する。

## 2026-10-21: 移動ボタンの非表示と割り当て別アクセント（0.77.7）

- clean／main・origin/mainを確認して最新取得し、`7c3004f`から実装。カスタム定義ではないコマンドのカスタムコマンド移動ボタンを非表示にした。現在ページの除外を保持し、表示数が1個/2個でも共通の右寄せと右余白を維持する。
- ショートカット/ジェスチャーの割り当てがある移動先は共通の`accent-action`で表示し、ツールチップと読み上げの補足でも示す。本体は保存済み割り当てから重複を除いたコマンドIDだけを補助モデルへ渡す。別ページのキーや条件は渡さず、既存設定・割り当て・コマンド実行を変更しない。無効な割り当てやジェスチャー機能OFFも「登録あり」とし、完全一致で判定する。
- 発行前レビューでIDの照合、未確認コマンド、複数割り当て、色の正本、表示中ページへの保存反映、1個の行の右余白を確認し、阻害指摘なし。任意の内部表示データだけの追加で保存項目/ファイル/公開APIの増減がないためパッチ更新。型検査・本体/Default Shell build・publish成功。共通一覧文書へ表示と判定の規則を反映した。
- ソースと最終固定EXEの専用GUIはそれぞれ**6群**成功。明暗×1280/760幅で現在ページ除外・カスタム以外の非表示・1個/2個の行の余白・既存移動と絞り込みを検査。無効な割り当て、機能OFF、未確認コマンド、似たIDとの非一致、追加/削除の反映、複数のうち最後を削除した場合、両方の入力割り当てを確認。アクセントの**20標本**で文字/背景が共通変数と一致し、「アリス」パレットでも確認した。画像を目視確認。
- unitスクリプトとimport先のcompiled core/shared JSを照合し、既存成功の**702件**を再利用。変更されたmain entrypointはunitではimportされず、補助データ投影を固定EXE GUIで検査した。版とnative再生成の影響先9ファイル**66/66**を通常ユーザー・並列数4で実行し、標準回帰は計**768/768、fail/skip 0**。固定EXE smoke、実行コピーSHA256と設定/画像保存先も成功。固定Node 24.21.0/pnpm 12.10.1、LUNAで確認。
- `publish.bat`終了0。本体EXE/feed/Default Shellは**0.77.7 / 168974360 bytes / SHA256 `0f23216e899d7a8df69a1f81ebe1274b19ef524ac9d3a18dad57d46dafac83b3`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行。実利用設定・deploy・未変更Applet再発行・全体ZIP・公開Releaseは変更していない。
- 証跡: `.artifacts/settings-navigation-assignment-20261021/validation.json`、入力manifest、完全ログ、`review.json`、`regression-selection.json`、`assignment-colors.json`、各隔離profile。成功は方式ごとの直近3回以内で削除なし。再利用元・過去の失敗/状態不明の出力を保護し、専用テストプロセスの終了を確認。隔離fixtureによる検証で、物理入力や外部通信の保証へ拡張しない。commit/pushの照合は同フォルダーへ残す。

## 2026-10-21: 移動アイコンの右余白と現在ページの除外（0.77.6）

- main／origin/main・cleanを確認し、最新取得後の`9a17ac4`から実装。「移動」列は現在の設定ページを除いた2画面だけを表示する。ショートカット/ジェスチャーの固定幅列は2ボタン・間隔・セル左右のpaddingを含めて計算し、枠との接触を解消した。カスタムコマンドも同じ現在ページ除外を使う。左インデックスとApplet管理のアイコンは保持した。
- 発行前レビューで列幅、明暗/狭幅、移動先ID、登録されていないカスタムコマンドへの移動抑止、既存のフィルター解除を確認し、阻害指摘なし。保存項目・ファイル・公開APIを増減しない表示変更としてパッチ更新。型検査と本体/Default Shell build成功。
- ソースと最終固定EXEの`settings-hints-ui-test --command-navigation-only`が各**5群**成功。明暗×1280/760幅×3ページの**12条件**で、全表示行の移動ボタンが2個・現在ページが含まれないことを検査。ショートカット/ジェスチャーの右余白はそれぞれのセルpaddingと1px未満で一致し、広幅18px・狭幅12pxを確保した。既存の移動・絞り込み・解除・フィルター後の編集/ON/OFFも成功。画像を目視確認した。
- 標準回帰は前回の768件とunitスクリプト/compiled main・shared JSを照合し、非影響の**702件**を再利用。版とnative再生成の影響先9ファイル**66/66**を通常ユーザー・並列数4で実行し、計**768/768、fail/skip 0**を確認した。固定EXE smokeとコピーSHA256・保存先の照合も成功。固定Node 24.21.0/pnpm 12.10.1、LUNAで確認。
- `publish.bat`終了0。本体EXE/feed/Default Shellは**0.77.6 / 168973978 bytes / SHA256 `cb460508eb6a129f99895d2c92f3ffaa33c97a4d16c90e65769588e30db39e3d`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行。実利用設定・deploy・未変更Applet再発行・全体ZIP・公開Releaseは変更していない。
- 証跡は`.artifacts/settings-navigation-spacing-20261021/validation.json`、入力manifest、`review.json`、`regression-selection.json`、完全ログ、各隔離profile、余白の実測JSON。成功は方式ごとの直近3回以内で削除なし。再利用元・過去の失敗/状態不明の出力を保持し、専用試験プロセスの終了を確認。隔離fixtureによる画面確認で、物理入力や外部サービスの保証へ拡張しない。commit/push先端の照合は同フォルダーへ記録する。

## 2026-10-21: コマンド設定間の移動・公開表示と一覧UI（0.77.5）

- main／origin/mainのcleanと最新取得を確認し、`4f5072a`から実装。トレイ編集一覧の外枠と固定の設定/終了を除き、項目の枠・プレビュー・実メニューは保持。設定インデックスのショートカット/ジェスチャー/カスタムコマンドに、共通のキーボード/マウス/新しいコマンド画面アイコンを右寄せで表示した。
- Applet管理は操作の右隣、最終列を「移動」に変更。3つのコマンド設定にも同じアイコンの移動列を追加し、移動先ではコマンドIDの完全一致で絞り込む。解除・通常インデックス選択で全体へ戻る。通常コマンドはカスタム登録へ移動できない理由を示し、自動作成しない。移動要求はrenderer内の一時状態で、設定値・実行条件・保存ファイルを増やしていない。
- 公開コマンドの地球アイコンは本体の既存公開カタログから解決。内部の読み取りで一覧IDを共有し、実行許可を付与しない。公開/非公開・停止中/利用不可と実行権限を分離した。カスタム一覧は状態/外部公開列を除き、種類/提供元を分離、操作見出しを左寄せに変更。利用できない理由は名前の下へ保持した。
- 「…」は中央の三点SVGへ変更し、割り当てペアの中央に配置。3列の割り当て一覧は狭幅で一覧内の横スクロールを使う。フィルター後も安定IDで編集・削除・ON/OFFし、全登録数の上限を保持。古い移動完了が後のインデックス選択を上書きしないよう要求番号を照合する。共通UI・Applet管理・トレイ・カスタムコマンド・ジェスチャーとrepo指示を現行仕様へ整合した。
- 発行前レビューは阻害指摘なし。上記の移動競合、表示中行と全体上限、Applet専用入口の移動抑止、狭幅を補正して型検査・本体/Default Shell build成功。保存仕様/API互換性を変えないUI変更として0.77.4からパッチ更新した。固定Node 24.21.0/pnpm 12.10.1/.NET SDK 10.0.402、LUNAで確認。
- 関連6ファイル**43/43**を実行し、コミット前はcompiled JSと試験入力の一致を照合して再利用。native再生成に依存する試験を含む残り**725/725**を通常ユーザー・並列数4で実行し、標準回帰は計**768/768、fail/skip 0**。新しいテストのAPI応答キーを修正する前の失敗ログも保持した。
- 固定EXEの専用GUI **5群**で、明暗×1280/760幅のトレイ編集/プレビュー、共通インデックスアイコンと右寄せ、管理列順、公開/非公開、三点SVGの中央差1px未満、メニュー/Escape、3設定間の完全一致フィルター・解除・通常選択を確認。絞り込んだ2件目の編集/ON/OFFが1件目に影響しないことも確認した。初期ソースGUIも5群成功し、最終修正は固定EXEで検査した。隔離画像を目視確認。
- 固定EXEのApplet管理`--management-only` **14群**とsmokeも成功。提供元フィルター/解除・共通設定/ログへの移動・明暗と狭幅・再起動等の既存操作を保持し、実EXEコピーのSHA256、設定/共有画像の保存先を照合した。パッケージ入れ替えの全インストール試験・物理キー/マウス操作・実ネットワーク通信の保証へ拡張しない。
- `publish.bat`終了0。EXE/feed/Default Shellは**0.77.5 / 168972299 bytes / SHA256 `fda069944d7cbd5ed3f54fdccee0832ca0471d0bd48acd629a2d41f2a51eac27`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行。実利用設定・deploy・未変更Applet再発行・全体ZIP・公開Releaseは変更していない。
- 証跡: `.artifacts/settings-command-navigation-20261021/validation.json`、入力manifest、完全ログ、`review.json`、`regression-selection.json`、各隔離profile。今回の成功は方式ごとの直近3回以内で削除なし。過去の再利用資料・状態不明の出力・修正前の失敗を保持し、今回のテストプロセス終了を確認した。コミット内容と両remote先端の照合は同フォルダーのcommit/push記録へ残す。

## 2026-10-21: 公開コマンドのコミット前検証（0.77.4）

- 実装時の628入力・821生成物・8完全ログ・固定EXE/feedをSHA256で再照合し、すべて一致。標準767/767、最終固定EXEの公開コマンドGUI6群・更新GUI13群・smokeの成功結果を再利用した。製品・試験・依存・版の後続変更はなく、追加回帰・再発行は不要と判定した。今回の追加はこの検証記録のみ。
- mainの開始先端・追跡先・今回の25対象ファイルと実効author/committerを確認。GitHub/AQUA両mainの先端、ステージ内容、作業ファイルとの一致、stage/commit tree、通常push後の両先端とcleanの照合を`.artifacts/commit-validation-public-settings-20261021/`へ記録する。実装時の証跡は`.artifacts/public-settings-commands-20261021/`を保持し、過去成功を再実行したように記録しない。公開Release・実利用deployは含めない。

## 2026-10-21: 更新と設定ページの公開コマンド（0.77.4）

- 開始時はmain／origin/main追跡・cleanを確認し、`git pull --ff-only`で最新取得（更新なし）。開始commitは`d218f7302c3f4ce45a295997d3476e53cfd2b2c3`。本体だけを変更し、未変更Appletの再発行・commit・push・GitHub Release・実利用deployは行っていない。
- 「本体と全Appletを更新」「AppDockを更新」「更新チェック」を公開。設定の同名更新ボタン、既存の更新IPC、MCP／Appletの`commands.execute`を共通のコマンド処理へ接続した。チェックは無効・停止中を含む全パッケージを確認し、適用しない。利用可能な更新は既存通知種類`host/updates/available`へ接続し、一部失敗があっても更新のお知らせと共通エラーをそれぞれ通知する。
- `settings-navigation.ts`を本体設定インデックスのID・名称の正本とし、各ページとApplet／collection子ページの設定を開くコマンドを自動生成。公開API・パレット・入力割り当て・リボン・トレイ・ホームへ接続した。停止中Appletの設定を開いても開始・有効化しない。既存の`appdock.settings.open`は従来どおり、リボンと更新の既存IDは新しい生成・実行経路で維持する。保存形式・設定項目・保存ファイルの追加削除はなく、パッチ更新とした。
- 発行前の差分レビューで要件・許可・設定入力確定・既存ID・通知の安全な要約を確認。初回0.77.3発行後の追加確認で、Applet設定コマンドの共有トレイカタログへの反映不足を修正し、同じコマンド一覧を使うよう統一した。全生成コマンドのトレイ解決を回帰へ追加して再確認し、最終版を0.77.4へ進めた。未解決の指摘なし。詳細は`review.json`。
- 固定依存の`install --frozen-lockfile`、最終版の型検査／本体・Default Shell build、標準回帰**767/767、fail/skip 0**が成功。更新ヘルパーの制限環境でのアクセス拒否は通常ユーザーで同一コマンドを再実行して解消した。最終標準回帰後の入力差分は新しい固定EXE GUIスクリプトの試験追加・fixture修正だけで、製品と標準回帰入力は不変。628入力・821生成物・各完全ログのSHA256と差分理由を証跡へ保存した。
- 最終固定EXEの専用GUI**6群**が成功。実Node Appletから共通APIで全設定ページを列挙・表示し、停止維持・トレイ割当候補・通常設定コマンドの選択ページ保持・型付き更新通知を確認した。本体のみ／全体の公開コマンドと両設定ボタンが同じ更新scopeを呼び、確認取消で未適用となることも確認。同梱Default Shellの版も実行中のresourcesから照合した。初期fixtureの通知既定値・トレイAPI名の誤りと制限環境のEXE起動失敗の記録を保持し、修正後の成功と区別する。
- 最終固定EXEの既存更新GUI**13群**が成功。本体と全Appletの一括適用、本体単独の実EXE置換、Applet一括／個別更新、同版再適用、設定・ログインfixture・有効状態の保持、選択設定／Appletページの復元、更新／通常再起動後の外部ジェスチャー実行を確認した。固定EXE smokeも成功し、EXE隣の設定と共通画像保存を確認した。
- `publish.bat`終了0。最終本体EXEとupdate.jsonは**0.77.4 / 168961535 bytes / SHA256 `3bfdd5ed078632b54c771d6d6fc3d783eeee6ac43222b9a4e119dc0080b0c8a9`**で一致。Default Shellと各隔離コピーの版・hashも照合し、`A:\40.ARTIFACT\AppDock.at365`へ発行した。今回のAppDock関連試験プロセス残存0。出力は現証跡・直近成功・失敗記録と過去の再利用状態が未確定なものを保持し、削除0件とした。
- 正本は`docs/settings-foundation.md`、`docs/updates.md`、`docs/appdock-api.md`、`docs/usage.md`。変更文書のローカルリンク58件を確認。検証証跡は`.artifacts/public-settings-commands-20261021/validation.json`、`inputs-before/after.json`、`input-deltas.json`、`generated.json`、`review.json`、`cleanup.json`と各完全ログ。初回0.77.3の成功記録は同フォルダーの`first-0773/`に分離し、最終EXEの検証へ読み替えない。GUI profileは`public-settings-commands-1792572156782`、更新は`portable-updates-1792572203903`、smokeは`smoke-1792572330960`。
- ローカル更新元と隔離fixtureでの成功。実GitHub／UNC／NAS更新、Windows通知の実配信、物理入力・UAC同意後・ロック中の各条件は今回の保証へ含めない。実利用の確認は未実施。

## 2026-10-21: 共通アクセントボタンとリボン・トレイの編集UI（0.77.2）

- 更新ボタンのページ固有CSSがホバー後も淡い背景用の文字色を残す問題を修正。追加・更新・並べ替え・上下移動に共通のアクセント動作を適用し、背景と文字色を組にして切り替える。削除の意味色と既存のボタン寸法は保持した。
- ショートカットのフォームだけ外枠を除き、割り当てカードをトップレベルへ配置。JSONの枠は保持。リボンの追加は見出し横に左寄せし、「＋ コマンド」「＋ グループ」「＋ 区切り線」に統一した。コマンドのダイアログはラベル書式をそろえ、選択ボタンを次行へ移した。区切り線の自動名を連番なしの「区切り線」にし、独自名と安定IDを保持した。
- トレイは「動作設定」に改称してカードのヒントを除き、単/ダブルクリックの選択ボタンを入力領域の幅いっぱいへ配置。追加・移動は共通アクセント色、移動・削除/グループ解除は各行へ埋め込んだ。グループ解除で子を同じ位置へ戻す動きと、固定の設定/終了は保持した。
- 持続的リボングループの色線と接続部を子ボタンの背景より前へ描画。2pxの位置・余白・クリック領域は変えず、重ねる線はポインター入力を受け取らない。共通配色、設定基盤、リボン、トレイの正本文書へ追加規則を反映した。
- 発行前に実装・依存・保存互換性をレビューし、阻害指摘なし。設定項目・保存ファイル・公開APIの増減がない表示変更として0.77.1からパッチ更新。固定Node 24.21.0/pnpm 12.10.1でinstall・型検査・本体/Default Shell buildと関連11ファイル**87/87**が成功。コミット前はこの成功を再利用し、残り**677件**を実行して標準回帰**764/764、fail/skip 0**を確認した。再生成されたnative出力を使わない87件はcompiled JSと関連入力の一致を照合。native依存試験を含む残りは並列数4で実行し、制限内のWindowsアクセス拒否は同一コマンドの通常ユーザー実行で解消した。
- ソースと固定EXEの`settings-hints-ui-test --accent-layout-only`がそれぞれ**8群**成功。5パレット・カスタム白黒/逆順・保存済みsky-blueを明暗で確認し、追加/更新の通常・ホバー**64標本**がコントラスト4.5以上・同一配色だった。明暗×1280/760幅の配置、ラベル、行内操作、保存を確認。選択・hover・focusで色線の6画素が指定RGBと一致し、背景に隠れないことを検査した。
- 固定EXEの`ribbon-customization-ui-test --appearance-only` **4群**も成功。持続/一時/折りたたみ、左側だけの色線、接続位置、色なし、明暗、独自名・再起動後の保存を確認した。隔離画像を目視確認した。
- ソース版`tray-menu-ui-test` **5群**で、行内操作・配置先・ドラッグイベント・空名の検証・単/ダブルクリック・実メニューcallback・一時停止・子を保持した解除・空配列の再起動保持・明暗3幅を確認した。古い試験の空名入力はblur前に保存待ちしていたため、製品の既存契約どおりTabで確定してから検証するよう修正し、再実行で成功。実マウスドラッグの代わりに既存のDataTransfer fixtureを使用した。
- 固定EXE smokeも成功。最終EXEと各隔離コピーのSHA256、設定/共有画像の保存先、試験プロセス終了を確認。今回の成功は方式ごとの直近3回以内で削除候補なし・削除0件。失敗・過去の再利用資料・実行方式不明の出力を保持した。
- `publish.bat`終了0。本体EXE/feed/Default Shellは**0.77.2 / 168965990 bytes / SHA256 `8952cde9064d80064892ae2466af84c6ad5dbc6438276c464be60d54eac41b8b`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行。実利用設定・deploy・未変更Applet再発行・全体ZIP・GitHub Releaseは対象外。
- 証跡は`.artifacts/settings-accent-layout-20261021/validation.json`、入力manifest、完全ログ、`review.json`、`cleanup.json`と各隔離profile。fixture設定の重複所属・初期折りたたみを修正した試験の失敗ログも保持した。物理入力・実ネットワーク通信の保証へ拡張しない。

## 2026-10-21: Shell方針変更のコミット前検証（0.77.1）

- 実装時の検証記録と現在の684入力、試験スクリプト・lockfile/toolchain・OS/Node、各完全ログのSHA256、発行EXE/feed/Default Shellを照合し、一致を確認した。標準764/764と固定EXEの関連9 GUI（管理専用モードを含む）/smokeを再利用し、同じ試験の再実行と製品の再発行は行わない。追加の差分はこの検証記録だけで、版は0.77.1を維持した。
- 初期の固定EXE試験から後の差分は機能文書3件とApplet管理試験の更新だけで、製品コードは同じだった。管理専用モードの成功は同スクリプトの最終更新後に記録されている。未変更のnative updaterによる追加の全インストール試験のアクセス拒否は下記の未完了事項として保持し、失敗した全コマンドを成功として再利用しない。必要範囲の管理画面からの本体ログ移動・source解除は独立した管理専用モード14群で成功している。
- 対象は本体repoのmain、開始commitは`30a5c7b1b4e76abc695979e89e5b74127d49b894`。設定済みGitHub/AQUA両mainの開始先端が同じことと実効author/committerを確認した。意図した変更一覧、作業ファイル/stageの一致、stage/commit tree、通常push後の両先端とcleanの照合値は`.artifacts/commit-validation-shell-policy-20261021/`の`validation.json`・`commit.json`・`push.json`を正本とする。Release・実利用deployは含めない。

## 2026-10-21: Shell対象の限定と4ページの本体統合（0.77.1）

- 画面は本体rendererと共通UI部品を基本とし、Shell対象をタイトルバー・リボン・ステータスバー・コマンドパレット・一時リボングループ・通知バナー・デスクトップ通知の7領域へ限定。追加のShell化は個別依頼時だけ行う方針をAGENTS/DEVELOPMENTと機能別文書へ反映した。`overlay.ribbon-group`は一時展開ポップアップで、グループ親ボタンと持続展開の子ボタンは`ribbon`に属する。
- ホーム・画像ライブラリー・通知センター・ログを本体documentへ移し、ページ用Shell Host・専用preload・別View・公開描画契約・Default Shellのページentryを撤去。内容Controllerと保存処理は再利用し、共通配色・キーボード・スクロール・プレビュー/編集ダイアログを本体へ接続した。正本は`docs/shell-foundation.md`と`docs/host-pages.md`。
- 本体専用`window.dock.pages`はmain frame/URL・要求ID・route・revision・起動準備・モーダル中の操作を検証する。旧ページShell指定と通常Appletの設定・画像・グループ・通知履歴は保持し、自動変換/削除しない。旧指定は選択UI・稼働状態・起動・再試行から除外し、旧領域を要求するShell専用コマンドは利用不可にした。
- 実装と影響範囲を発行前にレビュー。公開ページShell契約の撤去により0.77.0へマイナー更新した後、固定EXEの再起動試験で起動準備前に本文が表示される問題を発見した。初回モデルを準備完了まで保留し、同じ接続で通知を待つ修正を0.77.1へ発行。修正前に失敗する回帰と修正後5/5成功、通知センター再起動の成功を記録した。
- 型検査・本体/Default Shell build・native出力の生成・publishは成功。固定Node 24.21.0/pnpm 12.10.1/.NET SDK 10.0.402、LUNAで検証した。最終の標準回帰は`dev.bat exec node --test --test-concurrency=4 tests/*.test.cjs`で**764/764、fail/skip 0**。検証前後の684入力は完全一致し、文書279参照・13ファイルとdiff checkも成功した。既定並列実行では未変更のmounted updater試験1件が間欠失敗し、同じ試験ファイル単独2/2と並列数を制限した全試験の成功を確認した。失敗ログは保持した。
- ソースGUIでは本体4ページ、画像ギャラリー/モーダル/セッション、Node/native通知センター、Node/.NET/native混在Shellを確認。発行済み0.77.1の同じEXEでは`host-pages-ui-test`、`image-gallery-ui-test`、`image-library-session-ui-test`、`notification-center-ui-test`、`shell-region-ui-test`、`shell-bars-ui-test`、`ribbon-customization-ui-test`、`shell-overlay-ui-test`、`applet-management-ui-test --management-only`の**9 GUIスクリプトとsmoke**が成功した。管理専用モードは14群で、今回に関係する管理画面からのログ移動・source解除・共通設定・明暗/狭幅を含む。
- 固定EXEで、4ページが本体DOMに存在し旧ページdocumentが起動しないこと、保存済みピンとログ条件、原画像の保持、画像選択/スクロール/再訪、共通モーダルとEscape/フォーカス復帰、明暗・狭幅・100/150/200% zoom、ページを再生成しないパレット表示、再起動による選択ページ/旧指定の保持を確認した。残すShellの独立提供元・復旧・safe起動、リボンの持続/一時展開、バー操作も確認した。
- 追加のApplet管理**全インストール試験は完了していない**。通常ユーザーで2回試し、管理/ログ・URL install/uninstall（両回）・配布フォルダーinstall/uninstall（2回目）までは成功したが、後続の入れ替えで未変更のnative updaterが`.transactions/.../next`へのアクセス拒否となった。各回の`restored:true`と既存データ保持を確認し、製品の検査や更新実装は変更せず失敗記録を保護した。この全試験を管理専用モードの成功へ含めない。
- 隔離profileとfixtureによる結果であり、画像削除は隔離recycle adapter、通知一括確認はソースのdialog-response fixtureを使用した。実アカウント・物理キー/UAC同意・音声・NAS・混在DPIの保証へ拡張しない。画像と本体ページの画面も目視確認した。
- `publish.bat`終了0。本体EXE/feed/Default Shellは**0.77.1 / 168971514 bytes / SHA256 `93b1dbab998ed4a8f3f728fee9906aadf86152f0c1c67f16cda10b5150775e1b`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行した。旧ページHTML/preload/Hostの生成物が残らないことも確認。実利用設定の変更・commit・push・GitHub Release・実利用先deployは行っていない。
- 証跡は`.artifacts/host-pages-20261021/validation.json`、`review.json`、入力manifest、完全ログ、各隔離profile、`artifact.json`、`cleanup.json`。今回のソース/最終EXE/修正前後/失敗証跡と既存の再利用・実行方式不明の資料を保護し、削除候補なし・削除0件。対象テストプロセスの終了を確認した。

## 2026-10-21: READMEと開発文書の整理

- 前回のREADME整理を本体・7Applet・30.PROJECTの9repoへ先行コミットした。実効author/committerとstage/commit treeの一致、コミット直後のcleanを確認。commit一覧と照合値は.artifacts/commit-validation-readme-20261021/commits.json。
- コミット前の文書検査は成功。壁紙AppletのJSON例検証を含む既存回帰は9つのPASS群・終了0で、完全ログを同フォルダーのwallpaper-regression.logへ保存した。画像ギャラリーのビルドにより更新されたvendorの版メタデータは今回の変更へ含めず、元の内容へ戻した。
- 開発文書を現行仕様の正本へ整理した。会話上の人物名・発言、不要な版別説明とデータ移行案内を除き、設定・ページ・Shell・入力・画像・通知・MCP等の重複を統合。完了済み計画書・実装履歴・リポジトリ内の旧リリースノートを削除した。Gitの履歴、生ログ、配布物は保持した。
- VERIFICATIONは現行版の最新検証を残し、記録した条件と現在の外部動作保証を区別する。最低ホスト版、現在のSDK/API/保存形式、既定値、入力・保存・認証・復旧の境界を保持した。共有設定参照先の未実装設計は、現行契約と区別して残した。
- 文書構造、全ローカル参照、人物名、JSON例、壁紙テストが読むJSON例の一致、非文書差分がないこと、diff checkを検査し、すべて成功。証跡は.artifacts/docs-cleanup-20261021/validation.jsonと同フォルダーの検査・整理スクリプト。文書のみのため製品回帰・GUI・版更新・publishは行わない。整理分のcommit treeとpush先端の照合結果は.artifacts/commit-validation-docs-20261021/へ記録する。

## 2026-10-21: 割り当てカードの見出し・余白と通知の説明位置（0.76.5）

- 全体設定のショートカット一覧を`SettingsSection`へそろえ、「ショートカット割り当て」「マウスジェスチャー割り当て」とhint「＋で割り当てを追加します。」を追加。ジェスチャーだけの上余白を削除し、両方の本文paddingとヘッダーからの距離を同じ共通規則へ統一した。Applet詳細の共用一覧へ見出しを重ねず、割り当ての保存・検索・並べ替え・追加ダイアログは保持した。
- 通知の「読み上げ」内の項目名を「TTS設定」に変更。「現在の声」「現在の速度」を各項目のdescriptionへ移し、共通/個別設定とヒントのON/OFFによらず有効値を表示する。MCP連携設定のdescriptionは指定の「MCP Eventを使用するには、MCPサーバーの設定と連携が必要です。」へ変更した。声/速度の保存値・継承・設定への移動先は保持した。
- 検索メタデータも新しい割り当て見出しへそろえ、ページID・項目アンカーと旧検索語を維持。共通配置・説明の規則を`docs/settings-foundation.md`へ記載した。設定項目・保存ファイルの増減がない表示変更としてパッチ更新。発行前レビューは阻害指摘なし。
- 型検査・本体/Default Shellビルド成功。発行後に変更した共通カタログの依存、CSS/版とnative出力を参照する**17ファイル140/140**を実行。残り**620件**は前回0.76.4の完全ログ、747入力の差分と依存選択を照合して再利用し、標準回帰は計**760/760、fail/skip 0**。lockfile・ツール・SDK/API/保存処理と他の標準試験は不変。
- 固定EXEの`settings-hints-ui-test.cjs --assignment-speech-only` **7群**成功。明暗×1280/760幅で見出し・ヒント、同一paddingと配置、割り当て追加の取消/設定保持、ヒントOFF時にも残る通知description、声/速度の個別保存と共通設定への復帰、TTS/MCPへの移動、新見出しの検索を確認した。配置の実測は0.1px未満の丸め差を許容し、computed paddingは完全一致を検査。固定EXE smokeと試験コピーのhash照合も成功し、画像を目視確認した。
- `publish.bat`終了0。本体EXE/feed/Default Shellは**0.76.5 / 168976010 bytes / SHA256 `2321ffd3a67be2b9cc8e50418af8047af5b0878ae8f3db1349b0219190dd9ff6`**。`A:\40.ARTIFACT\AppDock.at365`へ発行した。実利用設定の変更・deploy・未変更Applet再発行・全体ZIP・GitHub Releaseは行っていない。
- 証跡: `.artifacts/settings-assignment-speech-20261021/validation.json`、入力manifest、`regression-selection.json`、完全ログ、`review.json`、`cleanup.json`。今回のGUI試験方式の成功は直近3回以内で削除なし。解決した測定差の失敗記録と、過去の再利用/状態不明の出力は保護し、今回のテストプロセス終了を確認した。物理入力/ジェスチャー操作・実TTSサーバー通信は未検証。
