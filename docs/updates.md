# 本体とAppletの共通更新

利用者向けの操作は[アップデートの操作説明](usage.md#アップデート)を参照。framework-dependent .NET 10単一ファイル`AppDock.Updater.exe`をportable本体のresourcesへ同梱する。.NET 10 Runtimeの従来要件以外の導入は不要。

## 設定と取得

新規設定では、本体/各Appletの起動時更新チェックと「AppDockについて」を開いたときの自動確認はすべてOFFです。初期状態の起動やAbout表示から更新サーバーへ接続しません。必要な場合は設定でONにするか、手動の「更新チェック」を実行します。確認はバージョン等のメタデータだけを取得し、更新ZIP/EXEのダウンロード・検証・適用は明示的な更新実行時に行います。保存済みの明示的なON/OFFは維持します。

本体の更新設定と外部Appletごとの更新元は、MCPの[固定設定API](settings-api.md#更新設定)からread/writeで取得・変更・resetできる。空欄による無効化とmanifestからの継承を区別し、保存だけで更新チェック・取得・適用を行わない。Aboutの自動確認は画面を開いた時に判定し、表示中に設定をONにしたり更新元を変えたりしても通信しない。起動時の対象/通知は次の起動時確認（予約済みを含む）、待ち時間は次回起動から適用する。更新実行の許可・確認・取得検証は従来の操作へ接続する。

更新操作は共通の公開コマンドへ接続する。`appdock.updates.installAll`（AppDockとAppletをすべて更新）は`all`、`appdock.updates.installHost`（AppDockを更新）は`host`を既存のPortableUpdatesへ渡す。設定の同名ボタンもこのコマンドを呼び、確認・取消・適用・再起動を共有する。`appdock.updates.check`（更新チェック）は本体と無効・停止中を含む全パッケージのメタデータだけを確認し、ダウンロード・適用しない。Appletのcollection子ページは親パッケージで更新する。

3コマンドはMCP・Applet共通APIの`commands.list/execute`で列挙・実行でき、既存のコマンド実行許可を使う。入力引数はなく、戻り値の`completion:handlerReturned`は処理からの応答を示す。更新適用は確認後の再起動を伴い、再起動後の適用結果は従来の更新結果通知で確認する。

取得中・確認中の進捗とキャンセルは、Default Shellのタイトルバーへ表示する。処理中は検索・通知・最小化・最大化・閉じるボタンを覆い、終了後に通常表示へ戻す。タイトルバーの高さと本文やWebContentsViewの領域を維持し、ステータスバーは通常表示を続ける。手動確認で更新があれば既存の通知種類「更新のお知らせ」（host/updates/available）へ接続し、通知先・時間・読み上げ等は同種類の保存済み設定に従う。通知本文は安全な件数の要約を使う。一部の対象の確認に失敗しても、確認できた更新を通知し、失敗は共通エラー通知へ別に渡す。確認のみで更新なし・未設定・未公開の場合は通知しない。更新実行で更新がなかった場合と取消は共通インフォメーション通知（既定バナー・6秒）へ接続する。バーに完了結果を重ねず、表示時間・履歴・閉じる操作は通知基盤へ委ねる。「更新画面を開く」から詳細を確認できる。

明示操作の結果は一意ID・種別・メッセージを持つ`UpdateState.notice`に渡し、通知対象の同じ結果を続けて受け取った場合も再表示する。確認時の失敗/未設定を「更新なし」と混同しない。起動時の自動チェックは従来のWindows通知設定を維持し、通常結果のバーを追加しない。再起動後の適用結果は既存の`completion`から同じUIへ渡す。新しい操作開始時にnotice/completionをクリアし、保存済みの結果ファイル・ログの形式は変えない。

通知の「更新画面を開く」から設定へ移動できる。本体の最終確認日時はAboutの版の行、Appletの日時は管理一覧の版の欄へ表示する。確認結果のポップアップは使わない。本体とAppletの現在版は共通VersionDisplayの色付きバッジとし、statusがavailableで確認時のcurrentVersionが現在版に一致する場合だけ右側へ「→ 新しい版」を表示する。同版再適用、古い版、確認失敗を新バージョン表示に使わない。

statusがcurrentの場合は結果本文を表示せず、現在のバージョンと最終確認日時だけを残す。「最新版です。」の表示は行わない。

GitHubの最新Release取得（`releases/latest`）がHTTP 404の場合は、取得可能な公開Releaseがない`unpublished`として扱う。確認だけならエラー通知を出さず、更新実行ではその対象をスキップする。同版再適用OFFでほかがすべて現行版なら、更新なしの情報通知で終了する。明示したタグ、配布済みのupdate.json/ZIPの404、403/503、破損・不一致等は引き続きエラーとする。未公開を「更新できた」とは扱わない。

更新パッケージの読み取り・コピー・ハッシュ・一時領域の削除は、Electronでは`original-fs`を使用して物理ファイルとして処理する。`app.asar`を仮想ディレクトリとして開かない。本体が通常動作でASARを読む仕組みは変更しない。再起動後の一時領域整理も同じAPIを使い、既存のTEMP直下・名前・symlink・journal確認を保つ。実ファイルの一時的なロックには短い有限の再試行を行い、削除できなければ警告を残す。

`settings.updates`はhostSource、checkHostOnAboutOpen、checkHostOnStartup、checkAppletsOnStartup、startupDelaySeconds（0～3600）、notifyOnStartup、allowSameVersion。本体のhostSourceの既定は`github:yukichi-7sai/AppDock.at365`。保存済みの更新元は保持し、「AppDockの更新元を既定に戻す」で現在の既定値へ戻す。Appletは`extensions.<id>.updateSource`を使い、未指定ならmanifest.updateRepositoryを継承、空文字は無効。

ローカル/UNCはupdate.jsonまたは発行フォルダー。Appletフォルダーにupdate.jsonがなければextension.jsonを読む。HTTP(S)はfeed URLまたは末尾/の配布ベースURL。GitHubはリポジトリ/Release URLからAPIとRelease assetsを使い、Source code ZIPは使わない。IDと正式版SemVer、最低本体版を照合する。非公開の認証トークンとプレリリースは扱わない。

## 発行

本体のpublish.bat/dev.bat run distはhelperをビルドし、フォルダー型本体の発行後にA:/40.ARTIFACT/AppDock.at365/update.jsonを生成する。外部公開はしない。

共通`scripts/pack-applet-update.ps1`は.NET 10 SDKでパッカーを増分ビルドして実行する。全6Appletのpublish.batは発行後にこれを呼び、`A:\40.ARTIFACT\<リポジトリ名>`へupdate.jsonとupdate.zipを生成する。その下の各Appletの配布フォルダーは配置用として保持する。Applet側でOutputDirectoryを指定した場合も、その内容をパッケージ化してJSON/ZIPは標準発行先へ出力する。.NET AppletではNode.js不要。配置スクリプトの保存・保持は[発行手順](publishing.md)を参照する。

ZIPは一時ファイルへ完成させてから置換し、feedを最後に保存する。出力先が入力フォルダー自身でも、生成前に収録一覧を固定し、既存update.json/update.zipを除外する。manifestのAPI/entryと配布量上限を検査する。配布先確認は[チェックリスト](update-checklist.md)を参照。個別に生成するときは次も利用できる。

```powershell
.\dev.bat run build:updater
.\dev.bat run pack:update applet ..\..\40.ARTIFACT\Applet.Watch.at365\Applet.Watch.at365 .artifacts\watch-update
```

生成したupdate.jsonとupdate.zipを同じWeb配布場所/GitHub Releaseに置く。JSONはschemaVersion=1、kind=host/applet、id=host/実Applet ID、version、任意minimumHostVersion、payload={file,sha256,size,format=zip}。本体ZIPはEXE・resources・DLL・本体一覧、Applet ZIPはextension.jsonと実行ファイル一式を直下へ置く。新しい更新処理は従来の本体format=exeも読めるが、発行は本体ZIPを標準にする。所有範囲と初回切り替えは[フォルダー型配布](portable-distribution.md)を参照する。情報JSONを配布物の最後に公開する。

## 交換と復元

PortableUpdatesが上限付き取得、SHA256/サイズ照合、ID/版/entry/最低host照合を行う。ローカルAppletも専用TEMPへコピーして固定する。helperを交換対象外のTEMPへコピーし、対象と再起動引数をjob.jsonへ記載する。

helperは範囲・リンク/ジャンクション・ZIP traversal/重複/サイズを検証する。ready→本体commit後、本体・外側ランチャー・AppletのPID終了を最大60秒待つ。manager.stopのタイムアウトを終了証拠にしない。全交換後にcommitted=trueをjournalへ記録し、結果保存→backup整理→journal削除の順に完了する。JSONはFlush(true)後に一時ファイルから置換する。commit前の失敗は逆順に復元し、commit後の中断は新しい版を検証して保持する。これは論理的な中断からの回復であり、物理的な電源断やディスク故障に対する完全な永続性を保証する試験ではない。

結果はPC専用rootのupdate-result.json、再起動後の画面・ログへ表示。TEMPは再起動後に専用パスを検証して整理。強制終了で残ったjournalは起動時にhelper --recoverで復旧を試す。復旧前に全対象の範囲・重複・退避名の対・リンクを検証し、commit済みならインストール先のハッシュも照合する。途中でロック等のエラーになった場合はjournalと必要なファイルを残し、同じ復旧を再試行できる。本体EXEが使用中で復元できない場合は起動を止める。完全終了後、journalのhelperが示す一時EXEへ`--recover <元の配置先> <PC専用保存先>`を渡して復元してから起動する。復元前に一時EXE/journalを削除しない。

Appletフォルダーは配布単位で交換。共有設定/素材はEXE隣のsettings.json/dataへ、端末状態/認証はSDK/ホストのLOCALAPPDATA領域へ置く。一括は適用可能な候補だけをまとめ、失敗/未設定は各行へ残す。

`installUpdates('all')`は本体と全ファイル型Appletを同じjobへまとめる。更新元一覧の順序に関係なく本体のmetadataを先に確認し、適用候補に入った本体版でAppletのfeed・ローカルmanifest・展開後manifestの最低host版を照合する。通常の確認・Appletだけの更新では現行host版を使い、互換性不足は本体を先に更新するよう表示する。metadataで適用候補が見つかったら、取得前にネイティブの「更新して再起動」ダイアログを1回表示する。取消時は更新ファイルを取得しない。実行を選んだ場合だけ全候補を取得・検証し、成功後に再確認せずhelperへ引き渡して1回再起動する。準備中の破損や取消で本体/Appletを交換しない。WebAppletは本体管理のため個別候補に含めない。

「AppDockについて」のAboutSettingsは最上部の単一情報パネルに本体情報・実行環境・更新操作をまとめる。バージョン横の確認アイコンは本体metadataだけを取得し、現在版の隣に更新版、右側に最終確認日時を表示する。下部は本体+全Appletと本体のみの2つの更新ボタンを同じ大きさで横に並べる。Appletだけの一括更新リンク、独立した本体・実行環境Section、管理ボタンは置かず、Applet数タイルから管理画面へ移動する。「更新の設定」はその下に初期状態で折りたたんで表示する。Applet別の一覧は設定のApplet管理へ集約する。管理一覧には確認専用の「更新を確認」と「更新」を用意し、個別の更新元はApplet設定で編集する。更新処理・フッター等のVersionCheck・起動時確認の契約は維持する。WebApplet本体は通常のパッケージで、collectionの子サイトを更新候補・対象件数に加えない。

## 本体終了後の進行表示

本体から引き渡すjobは`showProgress:true`を指定する。helperは交換対象外の独立したWindows標準ウィンドウで「終了待ち→適用中→起動中」を表示する。進行中のAlt+F4等で交換を中断しない。Win32だけを使い、WindowsDesktop Runtimeは要求しない。固定文言は本体の日本語JSONをhelperにも埋め込む。`showProgress`がない従来job・pack/extract/recoverには画面を追加しない。

再起動時はhelperがランダム名・同一ユーザー限定のnamed pipeを作り、再起動した本体だけへ環境変数`APPDOCK_UPDATE_READY_PIPE`で渡す。本体は子プロセスの起動前にその値を環境から除去し、初期本文とShell領域の描画準備が揃って本体画面が表示されたとき、1回だけ`shown\n`を送る。helperは接続元PIDも再起動した本体と照合し、合図を受けたら表示を閉じて終了する。通常起動には通信や追加の描画待ちを加えない。保存ファイル・設定項目は増やさない。

起動プロセスの終了、起動失敗、120秒以内に表示を確認できない場合は、その状態を示す閉じられる画面に切り替える。表示待ちの失敗を理由に適用済みファイルを戻したり、本体を強制終了したりしない。更新自体の失敗時は既存の復旧契約を使い、復旧後に起動できる場合は同じ表示完了待ちへ進む。

## 検証

`scripts/updater-window-test.cjs [AppDock.Updater.exe]`は隔離した実helperと制御用の再起動プロセスで、新旧jobの終了待ち・交換・PIDが異なる送信元の拒否・表示完了の合図までhelperが終了しないことを確認する。`--pause`では終了待ちと起動待ちに観察用の停止を挟み、最後に起動プロセスが終了した場合の画面も観察する。実AppDockの描画との接続は`portable-updates-ui-test.cjs`で確認する。

helperは事前にbuild:updaterする。

scripts/portable-updates-ui-test.cjsは配布EXEを.artifactsの専用profileへコピーし、実helper/ランチャーで本体/一括/個別交換と再起動を確認する。DevTools/Node inspectorは隔離試験に明示指定し、最終のnative確認ダイアログだけ試験内で差し替える。通常起動にdebug/inspector引数を追加しない。結果/画像は専用profileへ保存。

## 操作画面と再起動

更新・一括更新を先頭に置き、UpdateSettingsの共通設定と各AppletカードのAppletUpdateSourceをdetailsで折りたたむ。既定復帰は本体ではcreateDefaultSettings().updates.hostSource、AppletではupdateSource overrideの削除。既存の即時保存・revision付き入力キューへ接続する。

通常のrelaunchとhelperのrestartArgsへ`--restore-view`を付ける。ホストはこの起動時だけstartMinimizedを上書きしてshowし、信頼済みホスト文書の固定URLへrestoreViewクエリーを付ける。IPCはその完全一致URLと送信元WebContents/mainFrameを照合する。通常起動の設定は変更しない。

useRestartViewはページ・選択Applet・設定カテゴリ/タブ・ログの対象だけをプロフィール内localStorageへ保存し、復元指定の起動時だけ読み取る。フォームの未保存値やWebページ内の状態は復元対象外。AppletページはstartupReadyと対象のrunning状態を待ち、既存openAppletPage経路で再表示する。削除/無効/起動失敗した対象や廃止ページは[既定の表示先](host-pages.md#起動と戻り先)へ戻す。

portable-updates-ui-testはトレイ開始ONの通常起動非表示、更新後の設定/更新ページへの復帰、通常再起動で別カテゴリとAppletページへの復帰、dark/light・900px・折りたたみ/既定復帰/下書きガードも検証する。

## 進捗とキャンセル

UpdateStateはbusy/cancellable/phaseと、対象ID・名前・件数・取得bytes・任意の全体bytesを持つ。Default Shellは公開ShellBarModelのupdateからタイトルバーに進捗を表示し、ページ移動やタイトルバー提供元の交換後も同じ更新サービスの進捗・取消を使う。通知は取得中100msごとを目安に抑え、最終bytesは通知する。

IPCのcancelUpdatesは取得/検証中のAbortControllerだけを停止する。HTTPとローカルstream、コピーのファイル境界、ZIP展開子プロセス、ハッシュ読込へsignalを渡す。キャンセルはoriginエラーにせず、TEMPを整理してbusyを解除する。確認ダイアログの表示中は共通キャンセルを無効にし、ダイアログでの取消だけを受け付ける。実行を選んだ後は取得・検証中の共通キャンセルを再び有効にし、helperへの引渡し直前から無効にする。交換開始後は停止しない。起動時確認は引き続きmetadataのみ。

`scripts/update-progress-ui-test.cjs`は専用profileとループバックHTTPを使い、ダウンロード前の確認と取消時のpayload要求ゼロ、dark/lightの実progress/容量表示、取得中のキャンセル、再試行と元ファイル保持を確認する。

`scripts/information-notifications-ui-test.cjs [固定EXE] --updates-only`は既存の更新通知試験だけを選び、更新なし・新版あり・失敗・確認中の取消とタイトルバーからの進捗消去を確認する。通常実行も同じ検査関数を使う。

`scripts/update-recovery-test.cjs`はhelperソースを.artifactsへコピーし、そのコピーだけに停止点を挿入して試験用EXEをビルドする。準備前、2対象の準備後、各退避/移動後、commit後の8箇所で実プロセスを停止し、製品helperで復旧する。交換対象は隔離した検査用ファイルで、実フォルダー型本体交換は既存portable-updates-ui-testが担当する。製品helperに故障注入機能は含めない。

```powershell
.\dev.bat exec node scripts/update-progress-ui-test.cjs
.\dev.bat exec node scripts/update-recovery-test.cjs
.\dev.bat exec node scripts/portable-updates-ui-test.cjs
```

いずれも本体とhelperを先に発行してから実行する。実配布先GitHub/HTTP(S)/UNCの検証とは区別する。

更新helperは発行・適用・復旧・展開で、対象の祖先にあるWindowsの登録済みボリュームマウントポイントを認識します。対象自身のリンク、通常の祖先ジャンクション、Applet配布物内のリンクやマウントは引き続き拒否します。ボリュームの識別は[GetVolumeNameForVolumeMountPointW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getvolumenameforvolumemountpointw)を使います。payloadの走査では配布物rootを境界にし、root内の再解析ポイントを許可しません。回帰は tests/update-pack-mount.test.cjs と tests/portable-updates.test.cjs で確認します。

## 更新適用の完了通知

更新後の起動で読み込むupdate-result.jsonの成功結果は、host/updates/appliedという通知種類のバナーで案内します。初期表示はinfo/6秒で、通知設定から通知先と表示時間を変更できます。履歴には起動中だけ安全な固定文言を保持します。通知の終了やAppDockの再起動で更新処理をやり直さず、更新結果の受領記録によって同じ成功通知の再表示を防ぎます。

PC専用notifications/update-receipt.jsonはschemaVersion:1と最後に受付けた成功結果のSHA256を持ち、同じ結果を再起動ごとに再送しません。通知オフで抑制した結果も受付済みにします。保存できない場合は次回再表示の可能性をログへ記録し、未知schemaは上書きしません。進捗、確認結果、失敗結果、helperの交換/復元契約は従来の更新処理を使います。

## Appletの新規導入と削除

HTTP(S)・GitHubのfeed解決、サイズ・hash・ZIP・manifest検証を共通化した。新規導入と削除は本体設定の専用計画IDで確認し、通常の更新と排他にしてhelperへ渡す。job/journalのschema 2はinstall/update/uninstallを区別し、schema 1の復旧も維持する。新形式の準備・退避はextensions/.transactions/<operationId>/<index>/配下に分離し、拡張検出から除外する。設定・data・認証を操作対象に含めない。確定と中断復旧の契約は[Applet管理](applet-management-settings-design.md)を正本とする。
