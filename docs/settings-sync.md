# 設定同期と保存領域

保存型カスタムコマンドの`customCommands`ブロックは共有settings.jsonに保存します。Applet自身の設定保存先切替とは独立します。未知のブロック版・未導入種類・停止中提供元の定義と入力割当を保持し、実行だけを利用不可にします。[詳細契約](custom-commands-design.md)を参照してください。

MCPの`mcpServers`名簿（ID・名前・説明）も共有settings.jsonです。URL/EXEパス/引数/cwd/許可は本体dataDirectoryのPC専用`mcp-client.json`へ分離し、Bearer/環境変数値はsafeStorageで暗号化します。共有名簿だけが届いたPCでは未設定です。固定コマンド引数は共有されるため秘密値を入れません。PCファイルの破損・未対応版は上書きせず、設定画面を読み取り専用にします。詳細は[クライアント保存契約](mcp-client-design.md#保存と設定ui)を参照してください。

利用者向けの入口は[README](../README.md#設定とデータの保存先)。単一EXEの配布方式は維持し、同期できる登録データとPC専用の実行状態を分離する。

0.57.0以降、EXE隣の`settings-<端末名>.json`を共有settings.jsonと合成する。Appletの有効状態、本体の表示・一般8項目は常に端末別。Applet設定一式・開始待ち・表示先は、ツールバーの「このPCで設定を保持する」で保存先を選ぶ。OFFでも端末設定を保持する。端末名・初期化・保存分離・復旧の契約は[端末別設定](device-settings-design.md)を参照する。

本体で使用するDeviceSettingsStoreは、共有と自端末のStoreを統括する。合成値を共有へ丸ごと書き戻さず、編集した対象だけを保存先へ振り分ける。共通revisionはマスクされた共有変更でも進む。両ファイルを監視し、他端末のJSONは読まない。正常世代は共有と端末ごとに分離し、複数ファイル保存の回復記録・Windows起動設定の記録はPC専用settings-transactionsへ保持する。

## 保存先

リボンのグループ定義・所属・表示名・アイコンのみ表示は共有`settings.json`、持続型の開閉はPC専用rootの`ribbon-state.json`へ分離する。一時パネルとバッジは保存しない。形式・失敗時の扱いは[グループとバッジ](ribbon-groups-badges-design.md#pc専用の開閉状態)を参照する。

MCP Eventsの購読・署名鍵・callback・送信待ちはPC専用rootの`automation-events.json`へsafeStorageで暗号化して保存する。種類別の送信選択は共有settings.jsonの通知設定に含める。[購読と再送の仕様](mcp-events-design.md)を参照。

共有フォルダー名は小文字の`data`。旧`.appdock`の自動改名・移行・削除は行わない。旧プロフィール設定と画像は未使用のまま保持し、新規原画像は共通の`data/assets/images/`へ登録する。

今後追加するAppletにもこの保存境界を適用する。同期する設定はホストSettings、登録原素材はEXE隣のApplet別assetsを使う。端末固有のStorage/Secrets/認証/生成キャッシュはホストのPC専用root内でApplet IDごとに分離する。

PC専用データはドメイン名のat365配下に保存する。`data-paths.ts`はEXE配置先の絶対パスを小文字化してSHA256を計算し、`%LOCALAPPDATA%/at365/AppDock/profiles/<配置ID>/`をPC専用rootにする。配置が同じなら更新・再起動で同じrootを使う。配置先を変えると新しいrootになり、ログインをやり直す。IDとパスの対応表や追加のprofile manifestは持たない。

EXE隣の`settings.json`と`data/`の共有アカウント名簿・登録素材は同期対象。Webプロフィール名簿は`data/web-profiles/<Applet ID>/accounts.json`の`schemaVersion/accounts`だけを共有する。移行済みWebAppletは既存の`data/web-applets/accounts.json`を継続使用する。CookieとsessionはPC専用領域へ保存し、PC間では共有しない。グループ未宣言Appletの`web-accounts/<Applet ID>/accounts.json`、全session、Chromium、secrets、storage、ページ/Window状態、ログ、更新journal/result、設定backup、通知履歴notifications/history.jsonはPC専用rootに保存する。

Gmail 0.12.0以降の共通グループ名簿は`data/web-account-groups/at365.google/accounts.json`。UUID・表示名・仮名フラグ・順序だけを共有し、選択・監視・音割当と移行/復旧記録はPC専用`web-account-groups/<group-id>/state.json`へApplet別に保存する。同じPCの同じグループではsessionを共用する。旧Gmailのsessionは移動せず参照を継続し、新規枠はPC専用グループ配下へ保存する。全体設定とキーは従来のsettings.json。詳しくは[グループ設計](web-account-groups-design.md)を参照。

旧.appdockからのPC専用データの移行・削除は実装しないというユーザー指定。旧chromium/web-accounts/storage/secrets/web-applets/sessionsが残る場合は警告する。同期を始める前に完全終了して旧保存データを整理する。既存settings.jsonの読み取り互換性と、従来からある名簿の旧フィールド読み取りとは区別する。

`data`と`.appdock`の固定した旧PC専用パスを起動後と2秒間隔で検査し、共通の「警告通知」へ接続する。通知の「詳細を見る」は本体ログを開く。対象フルパスはログの「整理対象」の行へwarningレベルで記録し、一般設定には専用欄を置かない。空のフォルダーも検出し、検査不能は解消と扱わない。閉じる・期限切れ後も同じ状態は再通知せず、本体ログは更新する。自動削除や通知からの削除は行わない。詳細は[設計](warning-notifications-design.md)を参照する。

## ファイル名を使う登録素材

- 共通原画像: `data/assets/images/<元ファイル名>`。PNG/JPEG/WebP、5MiB以下。参照は`{file}`、画像の分類は共有`imageLibrary.groups`へ保存し、名前変更や所属変更で原画像を動かさない。詳しくは[共通画像](registered-images.md)。旧アバター原画像と設定は保持し、自動移行しない。
- Appletの通知音: `data/assets/applets/<Applet ID>/sounds/<元ファイル名>`。Gmailは`at365.gmail`。既存の16MB以下WAV検証を使い、512件まで登録する。ローカル枠の`{enabled,file}`のfileはファイル名だけ。保存された絶対パスをそのまま共有しない。
- 同一フォルダー内の大文字小文字を無視した同名照合を行う。同名同内容は既存素材を再利用、同名別内容は登録拒否。上書き・連番生成をしない。新規ファイルはexclusive create。登録元・用途の別フォルダーでは同名を使用できる。
- ファイル名はWindowsの禁止文字/予約名/末尾の空白・点/パス区切りを拒否し、登録rootから外れる参照や転送root/ファイルを受け入れない。任意パスをローカルUIの一覧選択から渡さない。
- 一覧は実ファイルから生成し、インデックスJSONやID対応表を作らない。Gmailのsnapshot.registeredSoundsはローカルUIだけに渡す。Node readへ素材一覧を含めない。枠の削除・停止時に共有素材を自動pruneしない。
- 素材だけ届く変更も監視する。Gmailの登録済み一覧は2秒ごとに照合。共通画像はwatchと2秒pollでファイル変更を確認し、縮小表示を更新する。settingsが先に届いて原画像が後から来ても回復し、一時欠落時は参照と直近正常表示を保持する。

## 設定と名簿の受信

`file-observer.ts`は親フォルダーのwatchと2秒のpollを併用する。イベント後100msから読み、同じbytesを180ms隔てて2回確認してから検証・反映する。途中JSON/一時的削除/ロック/通知欠落は直近正常値を維持して再照合する。同じ内容は再適用せず、受信ファイルを整形して書き戻さない。名簿とsettingsの到着順が違う場合は不足枠を同期待ちとして表示する。名簿未到着の起動時は空の共有accounts.jsonを生成しない。枠が0件ならユーザーの明示的な追加で名簿を作成できる。旧設定に残った参照は自動置換せず、WebApplet設定で新しい枠を選んで保存する。追加直前に届いた未反映名簿・破損名簿は上書きしない。既存枠を保持しているときの一時的欠落も同期待ちとする。

SettingsStoreのchanged経由でホスト/キー/トレイ/ページコレクション/実行中Appletへ適用する。保存済み値を正本として画面を更新し、現在のUIだけが不完全入力を保持する。変更した項目についてbeforeと現在値を比較し、同じ項目の外部変更を拒否する。hardwareAcceleration等の起動専用項目、Windows起動タスクの保存トランザクションは維持する。

WebProfileStoreのpendingDeletionはPC専用の別ファイル。共有名簿の外部削除は対象Viewを閉じるが、このPCのCookieの物理削除を予約しない。明示的なこのPCでの枠削除だけが当該PCの保存領域を回収する。回収で共有accounts.jsonを書き換えない。

## 正常設定のバックアップ

PC専用`settings-backups/`へ検証済み設定を保存し、`last-good.json`と直近20世代を保持する。同値は追加しない。破損・欠落状態からの起動では最新の読み取り可能な正常世代で継続し、共有ファイルはそのまま残す。正常設定が届けば読込障害を解除する。バックアップを書けなくても正常な受信設定は採用し、バックアップ失敗を別に保持する。

「バックアップで復元」は通知と「設定 → 一般 → 設定ファイル」から実行する。確認dialogに候補の更新日時と同期先にも届くことを表示する。確認後に候補・共有ファイル・revisionを再照合し、正常ファイルが到着していれば復元を中止して採用する。候補や破損bytesが変わった場合も古い確認では復元しない。復元前の破損bytesはローカルの`invalid-<時刻>-<UUID>.txt`へ退避し、退避できなければ置換しない。4MB超・通常ファイル以外・読取不能のファイルは手動での確認・退避が必要。置換成功後にだけ実行中の設定を更新する。

起動時に正常なバックアップもない場合は、通常のShellやAppletを起動する前にネイティブの復旧dialogを表示する。「正常なJSONから復元」「保存先を開く」「再読み込み」「終了」を選べる。選択JSONも4MB上限と設定schemaを検証し、同じ確認・退避・再照合を通す。「再読み込み」は欠落時に既定設定を生成しない。復旧後は起動前設定を適用するため再起動する。設定・バックアップが初めから存在しない通常の初回起動だけは既定値を作成する。

## 設定の状態と再起動通知

`SettingsHealth`は読込不正・読取不能・保存・バックアップ・反映・Windows起動設定の失敗を別々に保持する。成功した読込だけで保存失敗を解除せず、その処理の成功または確認で解除する。非同期の反映は世代を照合し、古い結果で新しい障害を消さない。`syncError`は既存API向けの安全な要約として維持する。

監視中の読込障害は2秒続いてから[共通エラー通知](error-reporting.md)へ報告する。確定した保存失敗と起動時のバックアップ継続は直ちに対象にする。入力検証・revision競合・BUSY・明示的なUAC取消は対象外。通知の期限切れ・閉じるは障害の解消と区別し、同じ障害の間に再表示しない。ログと一般設定の復旧導線も残す。本文・履歴・共通ログへ生JSONや例外の値を含めない。

`host.hardwareAcceleration`が起動前に適用した要求値と異なる間は、`host/settings/restart-required`の「再起動が必要です」を表示する。既定はバナー、読み上げOFF、条件解消まで表示する。値を起動時に戻すか、新しい設定で再起動すると終了する。次回起動方針や通常権限への降格をこの判定に混ぜない。

設定通知は理由と「再起動」「保存先を開く」、復元候補がある読込障害では「バックアップで復元」を持つ。再起動は既存の元EXE・profile・`--restore-view`経路を使い、不完全入力の強制保存はしない。保存・復旧中は再起動を拒否し、復旧確認中も他のローカル保存を拒否する。JSON不正には再起動だけでは直らないことを明記する。Windows通知のクリック先は通知センターとする。

## 検証と制約

`tests/settings-sync.test.cjs`と`tests/registered-sounds.test.cjs`、updaterのローカルjournal復旧回帰、`scripts/settings-sync-ui-test.cjs`で検証する。GUIスクリプトは2個の隔離配置にファイルを配達して実挙動を確認し、単一EXE引数でも同じ手順を使う。`--test-profile`の既存隔離テストは従来のrootを維持し、新仕様の検証には配置内の`--test-local-state=<絶対パス>`を追加する。EXE引数の後ろへ`--production-path`を付ける試験ではtest-profileを使わず、fixture内にLOCALAPPDATAを向けて通常起動のat365保存先を検証する。実利用LOCALAPPDATAへテスト用のログイン領域を作らない。

この実装はファイル同期サービスを設定・代行しない。2台の未同期同時編集を自動mergeする保証はなく、受信した正常ファイルを適用する。2台で同名別素材を同時に登録するケースも同期サービスの競合になるため、別名での登録や競合コピーの確認が必要。バックアップでJSONの内容を回復できるが、PC間認証の移行・実Google認証・実同期サービスの動作保証とは別。

## Windowsの一時的な置換拒否

atomicWriteは一時ファイルを書いた後、WindowsのEPERM/EACCES/EBUSYだけ同じrenameを最大3回、25/50/75ms待って再試行します。最初の置換と各再試行の直前に保存先のbytes/存在状態を保存前の状態と比較し、外部更新・削除・新規作成を検出したら拒否します。設定操作やtoggleを再実行するものではなく、revision確認と変更内容は保持します。合計待機は最大150ms、他のエラーや読み取り失敗は即時に返し、一時ファイルは回収します。外部変更のABAや最終確認とrenameの間の別プロセス更新まで排他的に防ぐ仕組みではありません。

## 通知種類の共通設定

notificationPreferences.overridesはsettings.jsonの任意フィールドです。ownerKind/ownerId/typeIdの組で種類ごとにtargets/durationSeconds/speakを上書きします。未導入Applet/削除された種類/未実装の既知表示先を同期で受信しても保持し、PCで実行できない場合は理由付き抑制となります。種類定義、起動世代、利用可否、active状態と履歴はこの共有設定へ保存しません。

省略した項目は種類の既定値を継承し、durationSeconds:nullは明示manualです。構造不正、重複、未知フィールド/表示先、範囲外秒数は既存の設定受信検証で拒否し、直近正常値を維持します。正常保存/受信した方針だけを通知へ適用します。設定の即時保存や外部revisionの競合保護を共用し、通知設定も共通の即時保存経路を使います。詳細は[通知契約](notifications.md)を参照してください。

通知センターの既読/履歴削除とnotifications/update-receipt.jsonの受付済み記録はPC専用です。通知種類の設定上書きだけを共有します。targets:[]は通知センターのみの指定であり、既知の未対応先だけを選んだ状態と区別します。

TTSの通常設定は共有settings.jsonのtts、APIキーはPC専用rootのtts-key.json（safeStorage暗号化・接続先ハッシュに紐付け）へ保存します。生成音声とジョブはメモリ上だけで保持し、共有data/と登録素材へ追加しません。詳細は[TTS連携](tts-design.md#設定と保存)を参照してください。

AIの接続設定と共通プロンプトは共有settings.jsonのai、APIキーはPC専用rootのai-keys.jsonへ保存します。接続ごとのPC許可ファイルは使用しません。接続ダイアログ内の入力はOKで一括保存し、キャンセルでは変更しません。生成入力・結果・ジョブはメモリー上だけで保持します。Applet/MCPのuseAiは各操作許可のファイルで独立して管理し、共有設定から許可しません。詳細は[AI文章生成](ai.md)を参照してください。
