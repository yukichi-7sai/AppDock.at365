# 本体とAppletの共通更新

利用者向けの操作は[README](../README.md#アップデート)を参照。framework-dependent .NET 10単一ファイル`AppDock.Updater.exe`をportable本体のresourcesへ同梱する。.NET 10 Runtimeの従来要件以外の導入は不要。

## 設定と取得

取得中・確認中の進捗とキャンセルだけを`UpdateProgress`でステータスバーへ表示する。固定フッター内の配置を維持し、本文やWebContentsViewの領域を動かさない。手動確認の結果と取消は共通インフォメーション通知（既定バナー・6秒）、最終失敗は共通エラー通知へ接続する。ステータスバーに完了結果を重ねず、表示時間・履歴・閉じる操作は通知基盤へ委ねる。情報通知の「更新画面を開く」から詳細を確認できる。

明示操作の結果は一意ID・種別・メッセージを持つ`UpdateState.notice`に渡し、同じ内容を続けて確認しても再表示する。確認時の失敗/未設定を「更新なし」と混同しない。起動時の自動チェックは従来のWindows通知設定を維持し、通常結果のバーを追加しない。再起動後の適用結果は既存の`completion`から同じUIへ渡す。新しい操作開始時にnotice/completionをクリアし、保存済みの結果ファイル・ログの形式は変えない。

通知の「更新画面を開く」から設定へ移動できる。各更新ボタンの隣は未確認時から日時欄の幅を確保し、結果文とリリースへのリンクはカード内へ直接表示する。確認結果のポップアップは使わない。本体とAppletの現在版は共通VersionDisplayの色付きバッジとし、statusがavailableで確認時のcurrentVersionが現在版に一致する場合だけ右側へ「→ 新しい版」を表示する。同版再適用、古い版、確認失敗を新バージョン表示に使わない。

statusがcurrentの場合は結果本文を表示せず、現在のバージョンと最終確認日時だけを残す。「最新版です。」の表示は行わない。

`settings.updates`はhostSource、checkHostOnStartup、checkAppletsOnStartup、startupDelaySeconds（0～3600）、notifyOnStartup、allowSameVersion。本体のhostSourceの既定は`github:yukichi-7sai/AppDock.at365`。保存済みの更新元は保持し、「AppDockの更新元を既定に戻す」で現在の既定値へ戻す。Appletは`extensions.<id>.updateSource`を使い、未指定ならmanifest.updateRepositoryを継承、空文字は無効。

ローカル/UNCはupdate.jsonまたは発行フォルダー。Appletフォルダーにupdate.jsonがなければextension.jsonを読む。HTTP(S)はfeed URLまたは末尾/の配布ベースURL。GitHubはリポジトリ/Release URLからAPIとRelease assetsを使い、Source code ZIPは使わない。IDと正式版SemVer、最低本体版を照合する。非公開の認証トークンとプレリリースは扱わない。

## 発行

本体のpublish.bat/dev.bat run distはhelperをビルドし、portable EXEの発行後にA:/40.ARTIFACT/AppDock.at365/update.jsonを生成する。外部公開はしない。

共通`scripts/pack-applet-update.ps1`は.NET 10 SDKでパッカーを増分ビルドして実行する。全6Appletのpublish.batは発行後にこれを呼び、`A:\40.ARTIFACT\<リポジトリ名>`へupdate.jsonとupdate.zipを生成する。その下の各Appletの配布フォルダーは配置用として保持する。Applet側でOutputDirectoryを指定した場合も、その内容をパッケージ化してJSON/ZIPは標準発行先へ出力する。.NET AppletではNode.js不要。配置スクリプトの保存・保持は[発行手順](publishing.md)を参照する。

ZIPは一時ファイルへ完成させてから置換し、feedを最後に保存する。出力先が入力フォルダー自身でも、生成前に収録一覧を固定し、既存update.json/update.zipを除外する。manifestのAPI/entryと配布量上限を検査する。配布先確認は[チェックリスト](update-checklist.md)を参照。個別に生成するときは次も利用できる。

```powershell
.\dev.bat run build:updater
.\dev.bat run pack:update applet ..\..\40.ARTIFACT\Applet.Watch.at365\Applet.Watch.at365 .artifacts\watch-update
```

生成したupdate.jsonとupdate.zipを同じWeb配布場所/GitHub Releaseに置く。本体はupdate.jsonとAppDock.at365.exe。JSONはschemaVersion=1、kind=host/applet、id=host/実Applet ID、version、任意minimumHostVersion、payload={file,sha256,size,format=exe/zip}。ZIP直下にextension.jsonと実行ファイル一式を置く。情報JSONを配布物の最後に公開する。

## 交換と復元

PortableUpdatesが上限付き取得、SHA256/サイズ照合、ID/版/entry/最低host照合を行う。ローカルAppletも専用TEMPへコピーして固定する。helperを交換対象外のTEMPへコピーし、対象と再起動引数をjob.jsonへ記載する。

helperは範囲・リンク/ジャンクション・ZIP traversal/重複/サイズを検証する。ready→本体commit後、本体・外側ランチャー・AppletのPID終了を最大60秒待つ。manager.stopのタイムアウトを終了証拠にしない。同じvolumeへ準備を始める前に全対象のjournalを保存し、準備・再ハッシュ照合→旧版一時退避→新しい版を移動する。全交換後にcommitted=trueをjournalへ記録し、結果保存→backup整理→journal削除の順に完了する。JSONはFlush(true)後に一時ファイルから置換する。commit前の失敗は逆順に復元し、commit後の中断は新しい版を検証して保持する。これは論理的な中断からの回復であり、物理的な電源断やディスク故障に対する完全な永続性を保証する試験ではない。

結果はPC専用rootのupdate-result.json、再起動後の画面・ログへ表示。TEMPは再起動後に専用パスを検証して整理。強制終了で残ったjournalは起動時にhelper --recoverで復旧を試す。復旧前に全対象の範囲・重複・退避名の対・リンクを検証し、commit済みならインストール先のハッシュも照合する。commit前は旧版へ復元、commit後は旧版/準備ファイルの整理を完了する。途中でロック等のエラーになった場合はjournalと必要なファイルを残し、同じ復旧を再試行できる。本体EXEが使用中で復元できない場合は起動を止める。完全終了後、journalのhelperが示す一時EXEへ`--recover <元の配置先> <PC専用保存先>`を渡して復元してから起動する。復元前に一時EXE/journalを削除しない。

Appletフォルダーは配布単位で交換。共有設定/素材はEXE隣のsettings.json/dataへ、端末状態/認証はSDK/ホストのLOCALAPPDATA領域へ置く。一括は適用可能な候補だけをまとめ、失敗/未設定は各行へ残す。

`installUpdates('all')`は本体と全ファイル型Appletを同じjobへまとめる。更新元一覧の順序に関係なく本体のmetadataを先に確認し、適用候補に入った本体版でAppletのfeed・ローカルmanifest・展開後manifestの最低host版を照合する。本体が未設定/取得失敗/同版の再適用不可/旧版なら現行host版を使う。通常の確認・Appletだけの更新では現行host版を使い、互換性不足は本体を先に更新するよう表示する。全候補の取得・検証に成功した後だけ1回の確認とhelperへの引渡しを行い、1回再起動する。準備中の破損や取消で本体/Appletを交換しない。WebAppletは本体管理のため個別候補に含めない。

AboutSettingsは共通SettingsSectionで「まとめて更新」「AppDock.at365」「インストール済みのApplet」「更新の設定」「実行環境の詳細」を構成し、Applet一覧・更新設定・実行環境は初期状態で折りたたむ。先頭のUpdateActionsは「本体と全Appletを更新」と「Appletを一括更新」を提供し、本体のみ・個別の操作も維持する。WebAppletを一括対象件数に含めず、対象0件でも全体操作は本体更新に使える。確認専用ボタンは設置せず、更新候補の確認から最終確認/取消までは既存installUpdatesを使う。VersionCheckは更新ボタンと最終確認日時を同じ操作行に置き、全体操作の下には直近のcheckedAtを表示する。結果本文とリリースリンクは操作行の下へ直接表示する。フッター/個別Appletの共通VersionCheckも更新操作だけを表示する。確認用APIと起動時の自動確認は維持する。

## 検証

tests/portable-updates.test.cjsは隔離ディレクトリーで設定移行、ローカル/URL/GitHub metadata、起動時確認だけ、同版再適用、互換性、helper交換/復元/ZIP拒否を検証する。helperは事前にbuild:updaterする。

scripts/portable-updates-ui-test.cjsは配布EXEを.artifactsの専用profileへコピーし、実helper/ランチャーで本体/一括/個別交換と再起動を確認する。DevTools/Node inspectorは隔離試験に明示指定し、最終のnative確認ダイアログだけ試験内で差し替える。通常起動にdebug/inspector引数を追加しない。結果/画像は専用profileへ保存。

## 操作画面と再起動

更新・一括更新を先頭に置き、UpdateSettingsの共通設定と各AppletカードのAppletUpdateSourceをdetailsで折りたたむ。既定復帰は本体ではcreateDefaultSettings().updates.hostSource、AppletではupdateSource overrideの削除。既存の即時保存・revision付き入力キューへ接続する。

通常のrelaunchとhelperのrestartArgsへ`--restore-view`を付ける。ホストはこの起動時だけstartMinimizedを上書きしてshowし、信頼済みホスト文書の固定URLへrestoreViewクエリーを付ける。IPCはその完全一致URLと送信元WebContents/mainFrameを照合する。通常起動の設定は変更しない。

useRestartViewはページ・選択Applet・設定カテゴリ/タブ・ログの対象だけをプロフィール内localStorageへ保存し、復元指定の起動時だけ読み取る。フォームの未保存値やWebページ内の状態は復元対象外。AppletページはstartupReadyと対象のrunning状態を待ち、既存openAppletPage経路で再表示する。削除/無効/起動失敗した対象はホームへ戻す。更新前の旧版が画面状態を保存していない場合、その状態は復元できない。

portable-updates-ui-testはトレイ開始ONの通常起動非表示、更新後の設定/更新ページへの復帰、通常再起動で別カテゴリとAppletページへの復帰、dark/light・900px・折りたたみ/既定復帰/下書きガードも検証する。

## 進捗とキャンセル

UpdateStateはbusy/cancellable/phaseと、対象ID・名前・件数・取得bytes・任意の全体bytesを持つ。UpdateProgressを共通画面へ置き、ページ移動後も経過/結果を表示する。通知は取得中100msごとを目安に抑え、最終bytesは通知する。

IPCのcancelUpdatesは取得/検証中のAbortControllerだけを停止する。HTTPとローカルstream、コピーのファイル境界、ZIP展開子プロセス、ハッシュ読込へsignalを渡す。キャンセルはoriginエラーにせず、TEMPを整理してbusyを解除する。確認ダイアログ直前から共通キャンセルを無効にし、ダイアログでの取消だけを受け付ける。交換開始後は停止しない。起動時確認は引き続きmetadataのみ。

`scripts/update-progress-ui-test.cjs`は専用profileとループバックHTTPを使い、dark/lightの実progress/容量表示、キャンセル、再試行、最終確認での取消と元ファイル保持を確認する。

`scripts/update-recovery-test.cjs`はhelperソースを.artifactsへコピーし、そのコピーだけに停止点を挿入して試験用EXEをビルドする。準備前、2対象の準備後、各退避/移動後、commit後の8箇所で実プロセスを停止し、製品helperで復旧する。7箇所は旧版、commit後は新版を保持し、journal再実行、使用中ファイルによる復旧失敗→解除後再試行、設定/認証fixture保持を確認する。交換対象は隔離した検査用ファイルで、実portable EXE交換は既存portable-updates-ui-testが担当する。製品helperに故障注入機能は含めない。

```powershell
.\dev.bat exec node scripts/update-progress-ui-test.cjs
.\dev.bat exec node scripts/update-recovery-test.cjs
.\dev.bat exec node scripts/portable-updates-ui-test.cjs
```

いずれも本体とhelperを先に発行してから実行する。実配布先GitHub/HTTP(S)/UNCの検証とは区別する。

更新helperは発行・適用・復旧・展開で、対象の祖先にあるWindowsの登録済みボリュームマウントポイントを認識します。対象自身のリンク、通常の祖先ジャンクション、Applet配布物内のリンクやマウントは引き続き拒否します。ボリュームの識別は[GetVolumeNameForVolumeMountPointW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getvolumenameforvolumemountpointw)を使います。payloadの走査では配布物rootを境界にし、root内の再解析ポイントを許可しません。回帰は tests/update-pack-mount.test.cjs と tests/portable-updates.test.cjs で確認します。

## 更新適用の完了通知

更新後の起動で読み込むupdate-result.jsonの成功結果は、host/updates/appliedという通知種類のバナーで案内します。初期表示はinfo/6秒で、通知設定からオン/オフ、通知センターのみ、表示時間を変更できます。履歴はPC専用通知履歴に安全な固定文言だけを記録します。既読や履歴削除で更新処理をやり直しません。

PC専用notifications/update-receipt.jsonはschemaVersion:1と最後に受付けた成功結果のSHA256を持ち、同じ結果を再起動ごとに再送しません。通知オフで抑制した結果も受付済みにします。保存できない場合は次回再表示の可能性をログへ記録し、未知schemaは上書きしません。進捗、確認結果、失敗結果、helperの交換/復元契約は従来の更新処理を使います。
