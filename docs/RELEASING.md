# AppDockのGitHub Release手順

この文書をリリースの正本とします。ユーザーからAppDockのリリースを依頼されたら、本体とフルパッケージに同梱したAppletを下記の範囲でまとめて扱い、各repoの公開後検証と整理まで実施します（2026-10-10ユーザー指定）。単なるビルドや手順整備では公開しません。実測結果は[VERIFICATION.md](../VERIFICATION.md)へ記録します。

実装中のテスト選択、発行前のレビュー・修正と版更新、コミット前の必要回帰、コミット漏れの解消と検証証跡の再利用は[共通手順](development-workflow.md)に従います。リリース時に同じソース回帰を重複実行する必要はありません。ただし、以下の新しい配布物と公開後の確認は省略しません。

## 本体と同梱Appletをまとめてリリース

作業者が次の全工程を一つのリリース作業として実施します。`scripts/release.ps1`は本体用のPrepare/Draft/Publish/Verifyであり、同梱Appletの個別公開は[Applet個別Release](#applet個別release)の手順を併せて行います。単一のスクリプト呼出しで全repoが公開されると扱わないでください。

| 対象 | 判定と操作 | 添付する配布物 |
| --- | --- | --- |
| AppDock | 現行版が未公開ならPrepareから公開・検証。本体版が公開済みなら再作成・上書き・版更新をしない | 単一EXE、update.json、全体ZIP |
| 全体ZIPの各Applet | 同梱した版が自身のrepoで未公開なら、その同梱版を個別公開・検証。公開済み同版はskip | update.zip、update.json |
| 今回公開した全repo | 各repoの公開後検証が成功してから、公開日時順で最新3件を保持して古いRelease/assetを削除 | draft・Gitタグ/履歴は保持 |

1. 本体版とGitHubの公開Release/タグを確認します。本体版が未公開なら下記の本体Prepareを実行し、固定した全体ZIPと`bundle.json`のApplet一覧（repository/id/version/commit/updateZipSha256）を公開対象の正本にします。Applet数や名前を固定リストにしません。
2. 本体版がすでに公開済みの場合は、その公開ZIPと検証済みbundle/planを使います。公開EXE/feed/ZIPのhashと検証済み資料の一致を確認し、未公開Appletのために同版の本体を再ビルド・再公開しません。資料がなければ公開ZIPを隔離して取得・照合し、同梱版を確認します。最新checkoutが同梱版と異なる場合は混ぜず、新しい本体版のフルパッケージを準備するか、差を報告して止めます。
3. 全同梱Appletのorigin・GitHub main・既存タグ・公開Releaseを読み取ります。同梱manifestの版が公開済みなら、当該タグの公開配布物のID/版を確認してskipと記録します。最新版がローカルより新しい場合や同版の内容/タグが不一致なら、ダウングレードや上書きで合わせず停止します。無関係なrepoやWebAppletのサイト項目は公開対象にしません。
4. 未公開の各Appletについて、そのrepoの指示・既存検証を確認し、cleanな対象commit/main、ノート、manifest/feedのID/版/最低ホスト版、ZIP全収録ファイルのsize/hashを検証します。同梱の`updateZipSha256`と元update.zip、bundle中の各ファイルとの一致を必須とし、同梱版をそのまま使います。再発行でhashや内容が変われば本体Prepareへ戻します。同梱だけでApplet版を増やしません。
5. 未公開本体と未公開Appletの下書き/全asset照合を完了してから順番に公開します。各Appletは下記の個別Release手順を使い、既存の一致するdraftは不足assetだけを追加して再利用します。既存の公開済みassetには`--clobber`を使わず、タグを移動しません。
6. 本体はVerify、各Appletは匿名feed/ZIP取得とsize/hash、実`PortableUpdates.check()`の個別/一括結果（同梱版がavailable/installable）まで確認します。repoごとに公開/検証/整理/skipを記録します。新版が必要とする本体版を先に公開し、Appletが本体更新を待つ関係も確認します。実インストールやdeployは別です。
7. 今回公開・検証に成功した**すべてのrepo**へ[最新3件の整理](#公開済みreleaseを最新3件に整理)を適用します。この整理はリリース作業の継続承認済み手順です。skipしたrepoには整理を適用しません。失敗時は到達済み段階を記録し、再開時は公開済みを再作成せず未完のrepoだけ続行します。

この工程は製品の起動・通常publishで自動実行する処理ではありません。複数repoの公開は一括トランザクションではないため、一部の公開/検証が失敗しても他repoの公開成功を取り消したり隠したりしません。

本体Releaseには必ず次の3ファイルを添付します。GitHubが自動生成するSource code ZIPは実行用配布物ではありません。

| ファイル | 用途 |
| --- | --- |
| `AppDock.at365.exe` | 通常の単一EXE版・本体自己更新 |
| `update.json` | 通常EXEの版・サイズ・SHA256を示す更新情報 |
| `AppDock.at365-all-in-one-<version>.zip` | 同じEXE + 全ローカルAppletを`extensions`へ配置 + `bundle.json` |

全体ZIPをupdate.jsonのpayloadに指定しません。Appletの個別更新は各repoのupdate.json/update.zipを継続します。

実装完了時は発行前のレビュー・必要な修正と再検証を終えてから、[版更新の判断](development-workflow.md#版更新の判断)に従って変更したAppDock/Appletの版を上げ、各repoのpublishへ発行します。通常publishは対象モジュールだけを作成します。リリースを依頼されたら、版更新済みの各対象モジュールをGitHubへ公開し、AppDockを含む場合はPrepareで全体ZIPも作成・検証して添付します。全体ZIPの旧版整理もこのリリース準備だけで行います。

## 環境と事前確認

- Windows x64、.NET 10 SDK、Git、認証済みGitHub CLIが必要です。実行ユーザーに対象repoのRelease作成権限が必要です。
- `setup-tools.bat`で[toolchain.json](../toolchain.json)のローカルNode/pnpmを用意します。グローバルNode/pnpmは追加しません。ビルドは既存の`dev.bat`/`publish.bat`を使います。
- PowerShellからrepoルートで実行します。以下の`$taskRepo`は実際のcheckoutへ合わせます。Gitの所有権例外はコマンド単位とし、global設定を変更しません。
- hostと全対象Appletの未コミット変更/未追跡ファイルと未プッシュcommitを別々に確認します。関連変更のコミット漏れは共通手順のコミット工程（必要回帰・修正・再発行）を経て解消します。別作業や帰属不明の変更を勝手にコミット・破棄・stashしません。準備開始時には全対象repoをcleanにし、各Appletが意図したcommitか確認します。自動pullや自動branch切替はありません。
- fetch後にbranch/originとリモートとの差分を確認し、公開対象repoの未プッシュcommitを通常pushします。リモートが先行/分岐していたらforce pushせず解消方針を確認します。プッシュ先のSHAと検証対象を照合し、準備後もDraft前に再確認します。別作業の未コミット変更がなくても、必要な検証証跡がなければ再検証します。
- 実利用フォルダーへdeployせず、GUI試験は隔離profileで直列実行します。ログイン情報やsettingsを配布物へコピーしません。

```powershell
$taskRepo = 'A:\30.PROJECT\AppDock.at365'
Set-Location $taskRepo
$taskGh = 'C:\Program Files\GitHub CLI\gh.exe' # PATH上なら gh も使用可
& $taskGh auth status
git -c "safe.directory=$taskRepo" -C $taskRepo status --short
git -c "safe.directory=$taskRepo" -C $taskRepo remote -v
```

スクリプトは各外部コマンドの非0終了を例外にします。手動実行でも各コマンド直後の`$LASTEXITCODE`を確認し、失敗したら次へ進みません。ネットワークや通常Windows権限が必要な操作をsandbox内の失敗だけで製品不具合と断定しません。

## 1. バージョンとリリースノート

1. 対象変更は共通手順に従って実装・発行し、コミット時に必要回帰を完了します。成功証跡がある場合は再利用条件を照合し、不足する検証だけ追加します。安定版は`x.y.z`を使用し、公開済みの版・タグを再使用しません。
2. 実装時にまだ版を更新していなければ、[版更新の判断](development-workflow.md#版更新の判断)で次の版を決め、`scripts/release.ps1 -Mode SetVersion -Version <次の版>`でpackage.jsonを更新します。現在より大きい正式版だけを受け付けます。新たな製品修正を伴わず、実装時に更新・発行済みの未公開版をリリースする場合は、その版を使います。リリース準備中に製品を修正した場合は、共通手順に従って版更新・発行を行います。コミット・タグ・公開はまだ行いません。
3. docs/usage.mdなどの開発文書にある版/要件と検証記録を更新します。インストール・ビルド方法が変わる場合はREADMEも更新します。変更内容に応じた追加のGUI試験も行います。
4. UTF-8のリリースノートを`docs/releases/v<版>.md`などに保存します。変更点、Windows/.NET要件、3配布物の用途、導入/更新方法、最低対応版、既知の制約、検証範囲を記載します。古い件数やハッシュをコピーしません。
5. 未コミットの対象変更があれば共通手順のコミット工程を完了します。リリース対象mainと統合後の内容・証跡の一致を確認し、未プッシュcommitをプッシュします。既存のユーザー変更・branch境界を守り、別branchを無断で統合しません。既に検証・コミット・プッシュ済みなら重複操作は不要です。

package.jsonは本体バージョンの正本です。pnpm-lock.yamlには本体版の重複フィールドはありません。更新UI試験はpackage.jsonの版を読みます。Appletを変更した場合はそのrepoのmanifest・プロジェクト/パッケージの版とノートを整合させ、各repoで検証/コミットします。

## 2. ローカル準備（GitHubを変更しない）

```powershell
$taskNotes = Join-Path $taskRepo 'docs\releases\v<版>.md'
$taskPlan = Join-Path $taskRepo '.artifacts\release-<版>-<試行ID>\plan.json'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 `
  -Mode Prepare -NotesFile $taskNotes -PlanPath $taskPlan
```

プレースホルダーは実際の版と新しい試行IDへ置き換えます。PlanPathを省略すると固有の.artifactsフォルダーを作ります。既存planの上書きは拒否します。

標準Prepareはソース/ノートの事前記録後、次を順番に実行します。これは証跡がない場合の経路です。条件を満たす成功証跡がある場合は、下記の「証跡を再利用した準備」を選びます。現行スクリプトに再利用用オプションはありません。

1. `dev.bat run typecheck`
2. `dev.bat test`（helper・本体・fixtureビルドと回帰テスト）
3. `publish.bat`（本体/.NET/helper/portable/feedのみ）
4. `dev.bat run pack:all-in-one`（全ローカルApplet再発行 → 全体ZIP。同梱だけの未変更Appletの版は上げない）
5. ローカルNodeで`scripts/portable-updates-ui-test.cjs`
6. 同`scripts/update-progress-ui-test.cjs`
7. 同`scripts/update-recovery-test.cjs`
8. 同`scripts/all-in-one-ui-test.cjs`（ZIP全収録ファイルのhash/size、通常EXEとの一致、隔離展開起動、全Appletの版/初期無効/エラーなし、終了）

1件でも失敗するとそこで停止し、GitHubへ接続/公開しません。各ステップのログ、`checks.json`、`bundle-ui.json`をplan隣へ保存します。最後にsealでhost/Appletのcommitとclean状態、同梱一覧、元Applet ZIPハッシュ、3アセット、ノート、検証ログのハッシュを照合します。全検証成功後にpublish直下の旧版オールインワンZIPを削除し、削除名をplanの`removedOldBundles`へ保存して`prepared`にします。対象と失敗時の扱いは[旧版ZIP整理](all-in-one.md#publishの旧版zip整理)を参照してください。通常publishではこの整理を行いません。

失敗したpublishの後には以前のZIPが残る場合があります。ファイルが存在するだけで成功扱いしません。修正後は新しいPlanPathで準備をやり直します。準備後のソース変更/コミット、ノート変更、再ビルド、Applet追加、証跡変更はplanを無効にするため、必ず新しいplanで準備します。その際も再利用条件が成立する項目だけは再利用できます。

### 証跡を再利用した準備

これは既存の`release.cjs preflight`/`seal`を使う作業者向けの個別実行手順です。照合は作業者が行います。スクリプトがコミット前証跡を自動検証する機能ではありません。証跡の不足・不一致を解消できなければ、該当試験を実行します。`release.ps1 -Mode Prepare`を併用すると全試験が再実行されるため、この経路では呼びません。

1. [再利用条件](development-workflow.md#検証結果を再利用する条件)をrepoごとに照合します。本体で再利用できるステップは`typecheck`と`regression`です。このPrepare/seal経路は検証時と対象のrepo tree全体の一致（検証済みの文書のみの差分を除く）を必要とし、コミット前の試験単位の再利用とは区別します。`regression`には同じ`dev.bat test`の全成功ログが必要で、部分的な試験成功だけでは代用できません。再利用元のログ・記録が改変されていないことを保存済みSHA256で確認します。
2. 新しい`$taskPlan`と確定済み`$taskNotes`を選び、次のpreflightで現在のcleanな本体/全Appletを記録します。外部コマンドの終了コードは直後に検査します。

   ```powershell
   $taskToolchain = Get-Content -LiteralPath (Join-Path $taskRepo 'toolchain.json') -Raw | ConvertFrom-Json
   $taskNode = Join-Path $taskRepo ".tools\node\$($taskToolchain.node)\node.exe"
   $taskCore = Join-Path $taskRepo 'scripts\release.cjs'
   & $taskNode $taskCore preflight $taskPlan $taskNotes
   if ($LASTEXITCODE -ne 0) { throw 'Release preflight failed.' }
   $taskLogRoot = Split-Path $taskPlan -Parent
   ```

3. `typecheck`/`regression`それぞれについて、再利用できる場合は完全な元ログをplan隣の`typecheck.log`/`regression.log`へコピーします。各コピーの末尾へ「今回の実行ではなく再利用」である旨と、元記録/ログの絶対パス・元SHA256・実行日時・コマンド・終了コード・検証時tree/対応commit・今回のtree/commit・依存/環境照合結果を追記します。この末尾を含めてsealの証跡ハッシュに入ります。元ログ/元記録は変更しません。再利用できない項目は上記1/2のコマンドを実行して同名ログへ出力し、終了0を確認します。
4. 上記3〜8の配布物生成・検証を同じ順序/引数で実行します。実行場所は`$taskRepo`、ローカルNodeは`$taskNode`です。ログ名は順に`publish.log`、`pack-all-in-one.log`、`portable-updates.log`、`update-progress.log`、`update-recovery.log`、`all-in-one.log`。最後の試験へ渡す出力先は`Join-Path $taskLogRoot 'bundle-ui.json'`です。各終了コードを確認し、非0/実行不能ならそこで停止します。PowerShellのnative stderr処理は`release.ps1`の実装と同じく終了コードで判定します。
5. 全8項目が実行成功または上記条件で再利用成功となった場合だけ、以下の内容をUTF-8の`checks.json`へ保存します。各項目の実態とログを確認してから記入し、未確認項目を追加してsealを通す行為は禁止します。

   ```json
   ["typecheck", "regression", "publish", "pack-all-in-one", "portable-updates", "update-progress", "update-recovery", "all-in-one"]
   ```

6. 次のsealを実行し、標準経路と同じくcommit/clean状態、ノート、全ログ、bundle/配布物の照合と旧版ZIP整理を完了させます。成功後は下記Draft/Publish/Verifyへ進みます。seal後にログやノートを追記しません。

   ```powershell
   & $taskNode $taskCore seal $taskPlan
   if ($LASTEXITCODE -ne 0) { throw 'Release seal failed.' }
   ```

Appletのソース回帰も共通の照合条件で再利用できます。全体ZIP生成による再発行後の個別ZIP/feed・同梱ファイルの一致、固定配布物の動作確認と公開後検証は今回の成果物で行います。再利用元の発行物試験を新しいバイナリの成功として流用しません。

## 3. mainのpush、下書きと添付

事前確認でpush済みの対象commitについて、GitHub mainのSHAとplanのSHAの一致を再確認します。未pushが残っていた場合のみ、リリースを依頼された範囲の検証済みcommitを通常pushします。スクリプトはpushやマージを自動実行しません。準備後に別commitへ変わった場合は、古いplanで公開せず準備からやり直します。

```powershell
git -c "safe.directory=$taskRepo" -C $taskRepo push origin main
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 `
  -Mode Draft -PlanPath $taskPlan -GhPath $taskGh
```

公開先は`yukichi-7sai/AppDock.at365`です。originとremote main、既存タグの参照先、ローカルの準備物を再検査します。未作成なら`v<版>`/対象commit/ノートで**下書き**を作り、3ファイルを添付します。GitHubの各assetがuploaded状態で、sizeとSHA256 digestがplanに一致して初めて`draft`になります。タイトル・ノート・対象commit・余分なassetも検査します。GitHubからdigestが得られない場合も推測せず停止します。

同じplanの再実行は、一致する下書きの不足assetだけを添付します。`--clobber`は使いません。公開済みRelease、タグの別commit、既存asset不一致は拒否します。タグはGitHub Releaseの対象commitから作成し、既存タグの移動/強制pushは行いません。

## 4. 最後に正式公開、認証なしの取得確認

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 `
  -Mode Publish -PlanPath $taskPlan -GhPath $taskGh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 `
  -Mode Verify -PlanPath $taskPlan -GhPath $taskGh
```

Publishは検証済み下書きと全アセットを再照合してから、最後の公開操作で`gh release edit ... --draft=false --latest`を実行します。Verifyは公開タグ/main/ノート/assets/latestを読み、認証なしで3ファイル全部を取得してsize/SHA256を照合します。本体の実`PortableUpdates.check()`でもGitHub元から対象版がavailable/installableになることを確認します。インストールは行いません。成功するとplanは`verified`、URLと製品のチェック結果を保存し、その後に下記の最新3件を残すRelease整理を実行します。

自己更新処理や配布仕様を変更したReleaseでは、[配布先のチェックリスト](update-checklist.md)に沿って、隔離した旧版からGitHub更新も試験してください。Prepareの実EXE試験はローカル更新元です。Verifyの更新確認と実インストール試験は区別します。

## 失敗・中断時

- Prepare失敗: GitHub未変更。ログを確認して修正/コミットし、新しいplanで再実行。
- Draft失敗: 公開しない。不足assetだけなら同じplanのDraftを再実行。不一致asset/ノート/対象commitは自動修復しない。下書きの内容と所有関係を確認してから、人が修正・削除の範囲を判断する。
- Publish前の検査失敗: 下書きのまま停止。条件を緩めたり手動で公開を先に行ったりしない。
- Publishの通信切断/応答不明: 公開操作はサーバー側で完了している可能性がある。`gh release view <tag> --repo yukichi-7sai/AppDock.at365`とAPIで状態を読む。公開済みならVerifyへ進み、同じタグで再作成しない。下書きと確定できた場合だけ再Publishする。
- 公開後Verify失敗: 既に公開済みの可能性を明示し、原因と到達済み段階を報告する。自動削除・非公開化・asset上書きはしない。回線回復後のVerify再実行か、新しい修正版のReleaseを判断する。
- 公開後検証成功・Release整理失敗: planのphaseはverifiedのまま、retentionReportに失敗・削除済みID・応答不明のpendingDeleteを残す。公開の失敗と混同しない。GitHubの実状態を読取確認し、同じReleaseのPublishやcreateを再実行せず、Verifyをやり直すか共通整理コマンドを新しい結果ファイルで再実行する。

「失敗時に公開しない」は**公開前の検査に失敗したものを公開しない**意味です。公開リクエストと世界中への反映をネットワーク越しに原子的に取り消せる保証ではありません。複数repoのReleaseも一括トランザクションではなく、repoごとの公開/下書き状態を報告します。

## 公開済みReleaseを最新3件に整理

AppDockと各Appletでは、新しいReleaseの公開後検証に成功した対象repoごとに整理します。公開済みRelease（prereleaseも含む）を`published_at`の降順、同時刻ならIDの降順で3件だけ保持し、残りのReleaseと添付アセットを削除します。バージョン文字列やコミットの作成日時では判定しません。未公開draftは数えず保持し、Gitタグ/コミット履歴も保持します。通常publishでは実行しません。

本体はVerifyの公開後検証成功をplanへ保存してから、`scripts/release-retention.cjs`を呼び出します。全ページを取得し、検証済みReleaseのID/タグとlatestを照合、検証済みReleaseが保持3件に入ることを確認します。各削除の直前にも保持対象・latest・削除対象のID/タグ/公開日時/アセット情報を再取得して一致を確認し、[GitHub Release API](https://docs.github.com/en/rest/releases/releases#delete-a-release)のRelease ID指定DELETEだけを使います。Git ref削除の操作は行いません。

planの`retentionReport`が指すJSONに、削除前一覧・保持対象・削除候補・削除済みID・削除後一覧を保存します。3件以下なら削除しません。情報変化/通信失敗時は停止し、公開後検証の成功と整理の失敗を分けて報告します。削除応答が不明なら`pendingDelete`を参照して実状態を確認し、新しい結果ファイルで再開します。再開時も一覧を取り直し、既に消えたReleaseを推測で再削除しません。最終的な残存一覧とlatestを再確認します。

## 不具合のある旧Releaseの個別削除

保持3件内の不具合Releaseなど、通常の件数整理に加えてユーザーが対象を指定した場合に実施します。まず修正版のPrepare→Draft→Publish→Verifyを完了させ、latestと匿名取得、本体更新チェックを確認します。その後、指定された旧タグのRelease ID・公開状態を再確認して、`gh release delete <旧タグ> --repo yukichi-7sai/AppDock.at365 --yes`でReleaseと添付アセットを削除します。`--cleanup-tag`は使わず、Gitタグとコミット履歴は残します。

削除後は旧タグのRelease APIが404、修正版がlatestで全アセットを持つこと、旧Gitタグが保持されていることを確認し、削除対象のmetadataと結果を.artifactsへ記録します。削除結果が不明な場合は読み取りで状態を確認し、別のReleaseを推測で削除しません。公開後Verifyの失敗を理由に自動で削除する処理とは区別します。

## Appletを追加したとき

[オールインワン発行](all-in-one.md)の自動探索が正本です。AppDockの親フォルダー直下に独立repoを置き、`.git`、`extension.json`、失敗時非0終了の`publish.bat`を用意します。共通`pack-applet-update.ps1`で`A:/40.ARTIFACT/AppDock.at365/update.json`と`update.zip`を作ります。IDを重複させず、version/runtime/apiVersion/minimumHostVersion/entryを正しく記載します。

Release Prepareの`pack:all-in-one`が毎回全対象を列挙するため、6件などの固定リストを更新する必要はありません。追加したAppletは自身のpublishで確認し、AppDockリリース時に全体ZIPの起動検証で収録を確認します。ローカル最新版とはその時点のcheckoutです。リリース準備は全repoのcleanを要求します。

開発用`build-all-in-one.ps1 -AppletRoot`は別探索先も許可しますが、Releaseスクリプトは標準の兄弟配置を使用します。別配置を正式運用する場合は、発行とreleaseの探索を同時に変更/試験してください。新規repo自動追加の回帰は`tests/all-in-one.test.cjs`で検証します。

## Applet個別Release

AppDockのリリース作業では、全体ZIPに同梱した版が自身のrepoで未公開のAppletをこの手順で公開します。公開済み同版のAppletはskipします。Appletだけを指定してリリースする場合も、そのrepoの指示と検証に従います。実装時に版更新・テスト・publish済みの同梱版を使い、必要ならclean mainをpushします。公開のためだけに版を重ねて増やしません。manifestと更新JSON、ZIPの全ファイル、size/SHA256を確認し、以下の既存手順を適用します。

```powershell
# 各変数は対象Appletの確認済み値。実行前に既存タグ/Releaseを確認する。
& $taskGh release create $taskTag $taskZip $taskFeed --repo $taskAppletRepo `
  --target $taskCommit --title $taskTitle --notes-file $taskAppletNotes --draft
& $taskGh api --paginate --slurp "repos/$taskAppletRepo/releases?per_page=100"
# tag_nameで対象を一意に選択し、Release IDで再取得する。
# draftは公開タグ用のREST endpointから取得できない場合がある。
# target、draft=true、ノート、update.zip/update.jsonのstate/size/digestを照合。
# すべて成功した場合だけ実行する。
& $taskGh release edit $taskTag --repo $taskAppletRepo --draft=false --latest
```

公開後はlatest metadata、認証なしのupdate.json/ZIP取得とhash、AppDockの個別/一括更新チェックを確認します。古いtagのassetを新版に置き換えません。Applet側のソースを変更した後は本体のPrepareも作り直し、同梱版と個別配布版を照合します。

Appletも、上記の公開後検証がすべて成功した時点で公開済みReleaseを最新3件に整理します。検証結果JSONへ`phase: "verified"`、`repo: "<owner>/<Applet repo>"`、`tag: "v<版>"`、`releaseId: <確認した数値ID>`を記録し、結果の保存後に次を実行します。未検証の結果へverifiedを付けないでください。

```powershell
# すべて公開後検証に成功した対象Appletの実際の値へ置き換える。
$taskReceipt = '<対象Appletの公開後検証結果JSONの絶対パス>'
$taskRetention = '<新しい整理結果JSONの絶対パス>'
& "$taskRepo\.tools\node\24.21.0\node.exe" "$taskRepo\scripts\release-retention.cjs" `
  $taskReceipt $taskRetention $taskGh
if ($LASTEXITCODE -ne 0) { throw 'Release整理が失敗しました。公開結果と整理結果を別々に確認してください。' }
```

`$taskRepo`は共通スクリプトのあるAppDock repoです。Nodeの版は現行toolchain.jsonに合わせます。本体/各Appletはそれぞれのrepo内で3件を保持し、今回リリースしていないrepoは整理しません。
