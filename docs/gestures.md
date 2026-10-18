# マウスジェスチャー

入力基盤は本体が所有する。操作コマンドとその設定は提供元のAppletが所有する。本体はApplet IDによる専用処理を持たない。設定は`Settings.gestures`、画面は`GesturesEditor`、保存は既存SettingsEditorの即時保存/revision/atomic writeを共用する。

## 保存と初期値

- `bindings`は最大2000行。各行は安定した`id`、`command`、`gesture`、`enabled`、`when`。配列順が実行順。`executionMode`は`all`（条件に一致したすべて、既定値）または`first`（最初の1つ）。旧設定で省略された場合も`all`として読み込む。同一コマンドIDは1回だけ。移動・クリック・ホイール・キーに共通して適用する。
- 待機表示と実行は、開始対象と条件に一致した行から同じ登録順・コマンドID重複除去・実行方法で選ぶ。`indicatorPosition`は`gesture-start`・`window-center`・`none`（表示なし）。`none`でも入力認識・実行・取消を続け、不透明度の保存値を保持する。
- gestureは`move-up/down/left/right`、`click-left/middle`、`wheel-up/down`、`key:<キー>`。キーは既存ショートカットの正規化（Ctrl/Alt/Shift、英数字、F1〜F24、矢印、対応する記号・特殊キー）を使う。WinやOS専用の保護された入力は対象外。Tabは設定画面の特殊キー選択から登録できる。
- whenは`global/browser/exe/app/pages/owner/applets`、`appletIds`、`processes`。exe名はパスなし、`.exe`省略可、大文字小文字を区別せず、一覧内はOR。browserは共通`browsers`を使用。Applet条件はキーバインドの`matchesWhen`を共用し、非アクティブなページでは一致しない。
- `excludedProcesses`は全条件より優先。`enabled`は永続設定。トレイの一時停止は稼働中だけで、再起動で解除する。
- `gestures`がない場合は`defaultGestures()`の空の割り当てを使う。Applet内の旧ジェスチャー設定は読み取らない。保存済みの本体設定と明示的な空配列を保持する。
- manifestの`defaultGestureBindings`は同じAppletの宣言コマンドのみ・最大100件。新規Appletの初回発見でコピーし、`gestureDefaultsInitialized`で再追加を防ぐ。既存Appletへ更新時の既定値を押し込まない。
- 起動・設定通知・Shellへの設定取得では、保存済みの各Applet設定をそのまま渡す。入力関連の設定を挿入・上書きしない。Applet側は独自のジェスチャーフックを持たず、本体の入力基盤を使う。

## 入力・実行

`AppDock.InputHost`は本体の子プロセス。自己完結.NET/WPFで配布EXE内に収録し、利用者へDesktop Runtime追加を要求しない。マウス/キーボードフックと非アクティブ・クリック透過の待機表示を所有する。表示の初期化はフック登録前に行う。コールバック内でコマンドやRPCを待たない。

本体は実Windowフォーカスと表示中Appletに対応する行を入力プロセスへ同期する（40ms間隔、内容が変化した時のみ送信）。ネイティブ側は押下時に最前面HWND・exe・カーソル下のWindow・除外・ブラウザクラス条件を確認。ローカル条件は通知済みHWNDにも限定する。状態の同期前に入力した場合に誤ったコマンドを実行しないよう、本体側も受信時と各コマンドの開始前に最新のページ/Window文脈を照合する。

右ボタン押下時にCtrl/Alt/Shift/Win（左右両方）、左/中/X1/X2ボタンが既に押されている場合は待機を開始せず、右ボタンの押下・解放と通常入力を通す。途中のキー/ボタン解放では開始しない。開始判定はGetAsyncKeyStateの上位ビットを使い、左右ボタンの入れ替えではSM_SWAPBUTTONで論理左ボタンに対応する物理ボタンを選ぶ。前のジェスチャーで捕捉し、まだ解放されていない修飾キー・左/中ボタンも開始を見送る。待機開始後の修飾キー・クリックの捕捉は維持する。通常キーの押下状態は開始判定に含めない。

右ボタン解放で一方向の移動を実行。距離は5〜500px、方向転換で解除まで取消。何も認識せずに解放した場合だけ通常右クリックを再送し、取消・未割当ストロークでは再送しない。右ドラッグを使うアプリは除外または一時停止する。

左/中クリックは押下時、ホイールはdelta 120を1刻みとして細かい入力を積算、キーは押下時に実行。捕捉した押下に対応する解放も消費し、右を先に解放しても対象アプリへ漏らさない。キーのOS repeatを捨て、未割当キーは通常入力へ渡す。対応する修飾キーを待機中に押した場合も対で捕捉する。Escapeは割り当てがあればコマンド、なければ取消。

実行中/予約中の追加操作は溜めない。ホイール間隔0〜5000msは上下共通で、間隔内の入力を捨てる。ホイールの未送信処理は最後の入力から100ms、右の解放、対象変更、設定変更、停止で取り消す。移動で確定した処理は右解放後に開始できるが、対象変更時には中止する。OSへ送信済みの操作は取り消せない。

キーとジェスチャーは同じShortcutDispatcherのコマンド予約を使う。`command.execute`の任意`invocation`（session/window/process/source、processは拡張子なしのプロセス名）と`command.cancel`を追加し、.NETでは`CommandExecution.Current`とハンドラーのCancellationTokenに伝える。登録前に届いた取消も保持する。WebBrowserToolsは開始対象HWNDを実送信直前まで照合し、ジェスチャーに通常キー送信経路の150ms待機を加えない。再入経路のみ150msガードを維持する。任意のApplet内部の操作先や取消対応を自動変更する契約ではない。

入力プロセスの停止はログに報告し、設定変更/再起動で再接続可能。終了・接続断で入力フックと表示を解放する。別のジェスチャーソフトとの同時利用、管理者権限のアプリ、UAC/ロック画面は通常デスクトップと同一に保証しない。

## 検証

- Codex/MCPからの取得・編集は[共通操作API](automation.md#ジェスチャー編集)。割当・順序・動作設定を同じ保存経路で更新し、編集中の対象行との競合を検査する。
- `tests/gestures.test.cjs`: 旧Applet設定から独立した初期値、明示的な空配列、検証、条件、初期割り当て、共通予約と取消。`tests/lifecycle.test.cjs`では実Nodeプロセスへの起動・設定通知でApplet設定をそのまま渡すことも確認する。
- `dotnet run --project tests/InputTests/InputTests.csproj -c Release -- .artifacts/dotnet-host/input/AppDock.InputHost.exe`: 専用Windowで実OS入力を使った移動・クリック・キー・ホイール・通常入力復元・取消・除外、左右の修飾キーと左/中/X1/X2の先行押下・途中解放・捕捉された押下の継続・解除後の再開の試験。カーソルを終了時に戻す。
- `dev.bat exec node scripts/gestures-ui-test.cjs [win-unpacked EXE]`: 隔離AppDock、試験Applet、実入力と設定画面。先にInputTestsをビルドする。`--portable`を指定するとpublishの単一EXEを隔離コピーして同じ試験を行い、前後のSHA256を照合する。
- ショートカット/ページの既存GUI回帰も併用し、試験は直列で行う。実測と未確認範囲はVERIFICATION.mdに記録する。

## コマンド一覧と編集パネル

- 設定ページは全コマンドをカタログ順に表示し、未割り当ても残す。非表示の互換コマンドは割り当てがある場合だけ、未確認のコマンドは保存済みIDを使って表示する。検索はコマンド/完全ID/提供元/入力/条件、状態はすべて・割り当て済み・未割り当て。Windowsホットキーの登録エラーはジェスチャーには表示しない。
- CommandBindingToolbar/CommandBindingListはショートカットと共用する。コマンドと割り当ての2列、＋で直接追加、入力と条件のペアをクリックして編集する。行のメニューは編集・このジェスチャーの実行順・削除。削除確認はなく、追加後に自動スクロールせず、検索/表示位置/focusを保持する。
- GestureBindingDialogはBindingEditDialogの枠と入力停止/取消/適用を共用する。移動4方向、左/中クリック、ホイール上下を選択ボタンで指定し、キーボードはShortcutCaptureFieldで記録/修飾キー付き特殊キー選択を行う。種類を切り替えてもパネル内の各種類の選択を保持する。Tabは項目移動、Escapeは取消、対応キー自体は特殊キーから指定できる。
- 条件の共通部分とApplet検索/複数選択はShortcutConditionFieldを使用し、Webブラウザ/指定したexeを追加する。exe名はパスなし、カンマ/改行区切り、1件以上必須。未導入Appletの選択を保持する。新規Appletコマンドはowner、本体/不明コマンドはapp。条件/有効状態だけの変更は元の保存位置、追加/入力変更は移動先入力の末尾へ反映する。
- パネル内の一時入力は追加/適用時だけ保存済み設定へ反映し、キャンセル/×/Escapeで破棄する。外部更新で対象行が変わった場合は適用を拒否する。保存形式、2000行上限、JSON/revision/save、入力フック/dispatcherを維持する。編集/実行順パネルの表示中は既存setShortcutRecording契約でホットキーとジェスチャーの実行を停止する。
- GestureOrderDialogはBindingOrderDialogをショートカットと共用する。元一覧の検索にかかわらず同じgestureの全提供元/条件/無効/不明行を表示。入力選択、番号、ドラッグ・上下ボタン・Alt＋上下、複数入力の一時変更を扱う。同じgestureの既存スロットだけを入れ替え、変更した入力の外部更新は適用全体を拒否し、他入力/他設定の最新変更は保持する。key:Aとkey:Ctrl+Aは別入力で、ショートカットの順序とも独立する。
- コマンド一覧の枠の外側、一番上に独立した折りたたみ「動作設定」を置き、有効、実行方法、操作感（距離・ホイール間隔）、待機表示（表示位置・不透明度）、Webブラウザ、除外の順に共通SettingsFieldでまとめる。表示なしの間だけ不透明度の入力を無効にし、値は保持する。既存の即時保存と設定検索を維持し、OFF中も一覧と編集は利用できる。
- scripts/gesture-command-checks.cjsをgestures-ui-test.cjsから呼び、一覧/編集/並べ替え/保存再起動/両テーマ3幅を検証する。APPDOCK_GESTURE_UI_ONLY=1は物理入力試験を省略する明示モードで、実入力の成功とは区別する。ショートカット側の共用部品もshortcuts-ui-test.cjsで検証する。


一時停止/再開は本体コマンド`appdock.gestures.togglePause`で切り替えます。トレイ内はチェック付き項目で、検索・キーからの実行も同期します。保存されない実行中の状態で、再起動後は解除します。配置の仕様は[タスクトレイ](tray-menu.md)を参照してください。
