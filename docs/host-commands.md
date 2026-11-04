# 本体コマンド

本体コマンドはコマンドパレット、コマンドトリガー、リボンのコマンドボタン、トレイに割り当てられる。各項目の説明には操作対象・保存の有無・反映時期を記載し、説明も検索対象とする。コマンド選択ダイアログは説明を確認して登録する入口であり、選択だけでは実行しない。

## 表示とウィンドウ

| コマンドID（`appdock.`以降） | 操作 |
| --- | --- |
| `ribbon.expand` / `ribbon.collapse` / `ribbon.toggle` | リボンを大きくする／小さくする／切り替える |
| `theme.light` / `theme.dark` / `theme.system` / `theme.toggle` | ライト／ダーク／Windowsに合わせる／現在の明暗を切り替える |
| `zoom.in` / `zoom.out` / `zoom.reset` | 表示倍率を上げる／下げる／100%に戻す |
| `window.hide` / `window.toggle` | 本体を隠す／表示・非表示を切り替える |
| `window.minimize` / `window.maximize` / `window.restore` / `window.toggleMaximize` | 最小化／最大化／通常サイズ／最大化切り替え |

リボンの大きい表示はアイコン＋名前、小さい表示はアイコンのみ。手動コマンドはホバー拡大をOFFにし、指定サイズと同時に保存する。どちらも通常のリボン設定で、リボンページの共有／PC専用選択に従う。手動サイズは`host.ribbonDisplayMode`へ保存し、既定はexpanded。失敗時は両方を保持する。[リボン仕様](ribbon-customization-design.md#リボンの表示モード)と同じ処理を使用する。

テーマと倍率は表示ページの保存先に従う。倍率は設定画面と同じ選択肢を前後へ移動し、50～200%の端では現在値を維持する。WindowsのDPI設定は変えない。`theme.toggle`は実効テーマの反対を保存し、システム追従を解除する。

ウィンドウ操作はメインウィンドウに限る。非表示でもAppletと本体は動作を続ける。表示する操作は既存の`showWindow(invocation)`を通し、ジェスチャーの前面化と入力先検証を保つ。既存の`appdock.open`も再表示に利用できる。

## ジェスチャーの一時停止

次の接頭辞に`.pause`／`.resume`／`.togglePause`を付け、それぞれ一時停止／再開／切り替えを行う。

| 接頭辞 | 対象 |
| --- | --- |
| `appdock.gestures` | マウスジェスチャー |
| `appdock.shortcuts` | キージェスチャー |
| `appdock.touchpadGestures` | タッチパッドジェスチャー |
| `appdock.input` | 3方式の一括停止 |

停止はプロセス内だけに保持し、再起動で解除する。保存した有効／無効・割り当て・Windows接続は変更しない。キー停止時は登録コマンドの実行と元入力のブロックを止め、通常の文字入力・ダイアログ・パレットの操作やキー記録は保つ。タッチパッドはAppDockの入力捕捉と実行を止め、Windows側の接続キーは残す。

一括停止は各方式の個別停止に重ねる。一括再開は一括停止だけを解除し、元の個別停止状態へ戻す。一括停止中の個別再開でも一括停止は継続する。保存設定が無効の方式を再開コマンドで有効化しない。停止で入力構成と世代を更新し、古い入力通知・停止後のスタック後続実行を拒否する。

停止中はトレイへ「一時停止・休止の解除」のサブメニューを一時表示する。保存済みトレイが空でも表示し、割り当てを編集せずに復帰できる。既存の`appdock.gestures.togglePause`のIDを維持する。

## 通知の休止と音声停止

- `appdock.notifications.pause30Minutes`: 通知を30分休止。再実行でその時点から30分へ延長する。
- `appdock.notifications.resume`: コマンドによる休止を解除する。
- `appdock.notifications.togglePause`: 30分休止と解除を切り替える。
- `appdock.audio.stopAll`: 共通再生キュー、保留・読取中の通知音、ライブラリー試聴、通知読み上げ、TTSの待機・生成・再生を停止する。

通知休止は保存せず、期限・再開・再起動で解除する。表示と通知音を共通の保留処理へ接続し、通知自体はセンターに保持する。休止解除でロック・スリープによる保留を解除しない。通知読み上げは抑制時の既存取消規則に従い、期限や取消を無視して再送しない。手動TTS、MCP通知イベント、通知種類の保存済みON/OFFは変更しない。

音声停止は`host.soundEnabled`を変えず、停止後に受け付ける新しい音声は再生できる。生成中のTTSも取消要求を送るが、送信先サーバーの生成停止・課金取消は保証しない。Webサイト自身・別アプリ・Windowsが独自に鳴らす音は対象外。[共通音声](audio-playback.md)を使用する。

## 設定から生成するコマンド

通常の本体boolean設定はすべて、定義の`generateCommands`から`appdock.settings.<キー>.on`／`.off`／`.toggle`を生成する。ホバー拡大、操作ガイド、定型文のWindows履歴保存、ハードウェアアクセラレーションも対象。設定値と既定値は変更しない。ハードウェアアクセラレーションは次回起動から反映する。

専用の適用処理を持つ次の設定も、登録した定義から同じ3操作を生成する。

| キー | 設定 |
| --- | --- |
| `startAtLogon` / `runAsAdministrator` | ログイン時の自動起動／管理者起動 |
| `keybindingOptions.enabled` | キージェスチャーの有効設定 |
| `gestures.enabled` / `gestures.activateOnStart` / `gestures.indicatorShowNoAction` | マウス有効／開始時アクティブ化／未割り当ての待機表示 |
| `touchpadGestures.enabled` | このPCのタッチパッド有効設定 |
| `commandTriggerOptions.requireChromiumWindowClass` | 3方式共通のブラウザ判定 |
| `updates.allowSameVersion` / `updates.checkHostOnAboutOpen` | 同版の再適用許可／本体情報を開いた際の確認 |
| `updates.checkHostOnStartup` / `updates.checkAppletsOnStartup` / `updates.notifyOnStartup` | 起動時の本体確認／Applet確認／結果通知 |

共通の設定検証・revision・原子的保存・共有／PC専用の投影を使う。自動起動の変更は`WindowsLaunch.save`、タッチパッド有効化はフォームと同じ`afterLocalEdit`を通す。UAC、接続競合、保存失敗など既存の適用結果を維持する。これらの専用設定コマンドはローカル用であり、追加を理由にMCPやAppletへ公開しない。通常設定の生成コマンドも既存の宣言・公開・操作許可に従う。

操作許可、共有／PC専用の保存先切り替え、一覧の各登録行、任意値の継承を表すトグルは、このboolean生成カタログへ混ぜない。それぞれの既存の専用操作・確認契約を使う。

## 実装と検証

固定操作は`host-action-commands.ts`、専用設定は`host-toggle-settings.ts`、一時状態は`HostCommandSession`を正本とする。表示名・説明は本体辞書へ置き、Applet・利用者の名前は変数として保持する。基本・設定ページ・更新・Applet開始停止・自動生成も説明を持つ。

`tests/host-command-expansion.test.cjs`はカタログ・公開境界・設定保持・個別／一括停止・休止期限・nativeへの入力投影を検査する。音声キューと通知音の停止は既存の音声試験で扱う。`scripts/host-command-expansion-ui-test.cjs [固定EXE]`は実画面、保存、ウィンドウ、トレイ復帰、説明検索、実プロセス再起動を検査する。自動起動・タッチパッドのOS変更と通知のロックイベントはfixtureを使用し、通常環境の物理入力・実音声とは区別する。
