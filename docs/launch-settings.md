# スタートアップ・管理者起動

両設定は常にEXE隣の`settings-<端末名>.json`へ保存する。早期起動も共有との合成値を使う。詳細は[端末別設定](settings-sync.md#本体の起動設定)を参照する。

Windows操作の前にPC専用settings-transactions/launch.jsonへ元タスクXMLと希望値を記録し、OS確認後に操作後XMLを記録する。途中終了時は読取りだけで登録と保存値を照合し、未解決なら一般設定の明示的な復旧操作へ誘導する。起動時にタスク変更・UACを再実行しない。明示復旧でも登録が記録と異なる場合は外部変更を保持する。復旧元XMLのアクション・元EXE・引数・ユーザー・LogonTypeを検証する。

一般設定の`host.startAtLogon`と`host.runAsAdministrator`で起動方法を設定する。どちらも既定false。通常設定と同じ保存済み値/部分JSON/revisionを使う。トグル変更時に検証・OS登録・原子的保存を行い、失敗時は既存の設定と登録を保持して画面にエラーを表示する。

## Windowsの登録

`src/main/core/windows-launch.ts`がWindows PowerShell 5.1からTask Scheduler COM APIを操作する。PowerToysの[起動登録の実装](https://github.com/microsoft/PowerToys/blob/main/src/runner/auto_start_helper.cpp)と同じく、ユーザーのInteractiveToken、LogonTrigger、Limited/HighestのRunLevelを使う。ログオンから3秒遅延、バッテリー時も動作、実行時間制限なし、重複はIgnoreNewとする。検証は通常のWindows権限で実行する。

- 名前は`AppDock.at365-<元EXEパスと保存先のSHA256先頭20桁>-<SID>`。同じ配置とユーザーなら更新後も安定する。隔離profileは別名になる。
- 起動先は`PORTABLE_EXECUTABLE_FILE`で得た元の単一EXE。TEMPの展開先を登録しない。引数は通常空、隔離検証だけ`--test-profile`を保持する。作業ディレクトリは元EXEの親。
- 同名タスクの単一アクション・元EXE・引数・ユーザーSID・InteractiveTokenを照合し、不一致なら上書き/削除しない。COMはSIDをユーザー名へ、空引数をnullへ変換するため、SIDへ解決し、引数をstringに正規化して比較する。
- タスクの保護DACLはSYSTEM、Administrators、対象ユーザーだけへ全権を許可する。他ユーザー/Everyoneの書き込みを許可しない。引数とパスはPowerShellの単一引用文字列でエスケープし、UTF-16LE EncodedCommandで渡す。コマンドシェルの文字列連結で実行しない。
- ONの保存で登録/更新、OFFの保存で当該タスクだけ解除する。元タスクのXMLを保持し、OS変更成功後にrevisionを再確認してJSON/画像を保存する。競合/画像不正/書き込み失敗ではXMLを復元する。復元失敗も明示する。同時保存はガードする。状態確認後に判明した登録と希望値の差は、次の画面からの設定変更時に同期する。
- Highestタスクへの変更、または既存Highestタスクの変更/解除では、通常権限から同じWindowsユーザーのRunAsヘルパーを起動する。UACキャンセル・権限不足・別ユーザー資格情報ではJSONを保存しない。標準ユーザーのHighestは管理者権限を与えるものではないため、管理者設定を有効にする時点で管理者グループの所属も確認する。

管理者アカウントの所属判定は、WindowsIdentity.UserClaimsのGroupSid/DenyOnlySidにAdministratorsのSIDがあるかを確認する。WindowsIdentity.GroupsはUACの通常権限トークンでdeny-onlyになった管理者グループを除外するため、所属判定には使わない。現在の管理者権限は従来どおりWindowsPrincipal.IsInRoleで別に判定し、UAC後の同一ユーザー・管理者トークン確認も維持する。

タスクの作成は製品起動時や設定ファイル監視では行わない。移動前に旧配置から登録を解除し、新配置で保存する。Startupフォルダー/他名タスク/PowerToysの登録は変更しない。

## 管理者起動

発行版の起動時、設定がONで現在のトークンが通常権限ならRunAsを要求する。UAC承認後のPowerShellヘルパーが元ホストPIDの終了を待ち、元EXEを起動する。管理者でないWindowsユーザー/別資格情報は拒否する。設定の復号・保存先を別ユーザーへ変えない。`--appdock-elevation-attempt`で同じ起動の昇格ループを止める。キャンセル時は通常起動を続け、現在の権限と失敗を一般設定に表示する。smoke起動では自動昇格を行わない。

「管理者として再起動」は専用IPCから同じヘルパーを使い、`--restore-view`と隔離profileを保持する。ランダム名のローカルpipeでヘルパーの同一ユーザー・管理者確認を受けてから元ホストを終了する。拒否/確認失敗時は元ホストを継続する。設定保存処理中/実行中/既に管理者の場合はボタンを無効にする。タスクスケジューラーのログオン起動は最初から設定した権限で実行するため、登録後にログオンのたびにUACを要求しない。手動の通常起動はUACを要求する。

UACヘルパー本体はEncodedCommandを使用し、すでにbase64の本体を含む外側の固定RunAsラッパーだけはexecFileの`-Command`引数で渡す。二重base64化によるWindowsのコマンドライン上限超過を避ける。タスクXML復元にも同じ経路を使う。

設定保存で実行中のトークンは変更しない。OFFにした後は完全終了し、通常の方法で起動する。管理者プロセスの普通の再起動は権限を引き継ぐため、OFFの保存だけで降格したと表示しない。

## 契約・検証

`HostSnapshot.launch`は発行版での対応可否、実トークン、実タスク登録/RunLevel、タスク名、確認エラーを返す。`refreshLaunchState`は読み取りだけ、`restartAsAdministrator`は明示操作だけ。既存のIPC送信元検査を使い、Web/Appletに任意スクリプトや任意EXEの昇格APIを公開しない。開発起動のトグルは無効。

`scripts/launch-settings-ui-test.cjs`は固定した単一EXEのコピーを使い、日本語/空白/引用符付きパス、実タスク登録/実行/解除、即時保存、失敗値の画面内保持、再起動後の保持、両テーマ/3幅を確認する。検証タスクはfinallyで解除する。UAC承認・管理者トークン・実サインインは別に検証結果を記録し、自動承認やユーザーのログオフを行わない。
