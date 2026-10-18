# 条件付きショートカット

保存型[カスタムコマンド](custom-commands-design.md)も同じカタログとdispatcherに載ります。IDは`appdock.custom.<UUID>`で名前変更後も一定です。Applet種類のownerは提供元ID、本体種類は本体として条件を判定します。提供元停止・定義削除時も割当は保持し、利用不可の操作を自動起動しません。ジェスチャーも同じ実行経路を使用します。

## 設定

`Settings.keybindings`は最大2000件の配列。配列順が実行順で、各行に安定IDを持つ。フォーム/JSON/各Appletの入口は既存SettingsEditorを共用する。
Appletの`extension.json`には`defaultKeybindings`で、自身の`commands`に宣言したコマンドの初期割り当てを指定できる。ID以外の`command`/`key`/`enabled`/`when`を各行へ書き、未宣言のコマンドはmanifest読込時に拒否する。初回発見時だけsettings.jsonにコピーし、適用済みIDは`keybindingDefaultsInitialized`へ記録する。旧設定の`extensions[id]`に登録済みのAppletは利用者の編集を優先して初期値を差し込まない。行を消した後の再起動やApplet更新でも再追加しない。
新しいWebAppletは`webApplets.shortcutDefaults`から追加時の保存トランザクションでコピーする。このテンプレートのコマンドは`open`/`reload`/`back`/`forward`/`home`に限定し、コマンドIDの`web.<UUID>.`を追加時に補う。既存WebAppletの行は変更しない。Applet詳細は割り当てごとの追加・編集・削除に対応し、一括初期化の操作は置かない。WebApplet管理項目の新規サイト用テンプレート編集は維持する。
新規割り当ては、対象コマンドに登録元extensionIdがあればowner、なければappを既定にする。既存行のキー変更は条件を保持する。コマンドIDはショートカット表・パレット・ホームのピン留め・トレイ動作選択で完全な文字列を表示し、表示名による検索も維持する。

```json
{
  "id": "binding.example",
  "command": "at365.gmail.nextAccount",
  "key": "Ctrl+Tab",
  "enabled": true,
  "when": { "scope": "applets", "appletIds": ["at365.gmail"] }
}
```

scopeはglobal/app/pages/owner/applets。globalは常時、appはホスト管理Windowのフォーカス、pagesはさらに表示中Appletページ、ownerはコマンド登録元のAppletページ、appletsは対象ID内のいずれかを満たす。UIでは「グローバル」「AppDock全体」「すべてのApplet」「Gmailなどの提供元名だけ」「指定したApplet」の順。AppDock本体のコマンドには提供元の選択肢を出さない。ownerは保存したIDやコマンド名の接頭辞から推測せず、現在のコマンドカタログのextensionIdで判定する。提供元がない/不明/ページを持たない場合は一致しない。提供元の名前変更も現在の表示名を使う。applets以外のscopeはappletIdsを空にする。指定Appletは1件以上必要。未知の条件を黙って無視せず拒否する。条件追加時はshared/keybindingsの型・検証・評価・UI候補・試験を一緒に追加する。連続キー（chord）とユーザー記述の式は対象外。

keybindings未指定時のみ旧shortcuts/globalShortcutCommandsを割り当てへ変換する。旧非グローバルはappとなる。キー編集後はkeybindingsを保存し、旧フィールドはコマンドパレット等の表示用に派生させる。空配列を未指定扱いにして既定割り当てを復活させない。新形式を旧バージョンで編集する往復互換は保証しない。設定全体の1MiB上限・atomic write・revision保護を維持する。

## 入力と実行

- shared/keybindingsのresolverで全候補を保存順に判定し、利用可能なコマンドに絞り、同一IDを重複除去する。
- main/core/shortcut-dispatcherは開始前に全対象を予約する。コマンドによるキー送信の再入・同じキーの実行中再押下を抑止し、逐次awaitする。コマンド失敗は記録して続行し、終了・再起動では打ち切る。
- mainの本体IPCとpageHostShortcutが共通resolver/dispatcherを呼ぶ。PageHostはSurfaceの可視状態と実Windowフォーカスを参照し、別Windowと埋め込み表示で同じApplet IDを使う。Surface破棄時に登録を除去する。native Appletの独自Windowは含めない。
- WindowsHotKeyBackendはキーを重複除去して一度だけ登録。OSイベント時にはglobalを含む条件一致行を全評価する。同じキーがOS登録済みならローカル経路では実行しない。登録エラーは既存statusとして表示する。
- hotkeys.syncはElectron本体のPIDも内部パイプで渡す。WindowsHotKeySessionはWM_HOTKEY受信時、通知より先にAllowSetForegroundWindowでそのPIDだけへ前面化の許可を渡す。表示コマンドは既存のrestore/show/focusを使い、常時最前面化や合成Alt入力を加えない。全プロセスへの許可は拒否する。根拠は[Windowsの前面化許可](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)と[WM_HOTKEYの前面化権限](https://devblogs.microsoft.com/oldnewthing/20090226-00/?p=19013)。
- ショートカット編集dialogを開くと誤実行防止のため全グローバル登録を一時解除し、statusesを空にする。dialogを閉じると保存済み設定で再登録する。正常時の「登録済み／未登録」を表示せず、有効なglobal行で利用可能なコマンドの登録エラーだけを示す。空のstatusesは記録/再同期の一時状態でもあるため、直近の非空statusを表示専用に保持し、同じコマンド/キーのエラーを再検査結果が届くまで表示する。エラーの絞り込みも同じ表示statusを使う。無効行/別scope/利用不能コマンドへ古いエラーを表示しない。backendの登録状態/入力判定や設定値へこの表示用キャッシュを戻さない。
- 同じキーの複数割り当ては正常な使い方なので、行ごとの「同じキーの割り当てあり」を表示しない。共通の説明で全一致/順次実行を案内する。一覧には実行順操作・番号を置かず、専用パネルで変更した保存順序で実行する。
- ローカル入力はkeyDownのみ、repeat/IME中/記録中を除く。本体はDOMの入力先判定を保つ。Applet Web画面はCtrl/Alt付きまたはF1〜F24/Pauseに限定して文字入力を守る。リモートへのpreload/IPC追加は行わない。グローバルはOS登録でありIME状態は参照できない。
- アクティブページの条件は押下時に確定する。コマンドがページやフォーカスを変えても捕捉済みの対象を再評価しない。各コマンド自体の実行先（前面アプリ等）はそのコマンドの実装に従う。

## 検証

`tests/keybindings.test.cjs`は移行、検証、空配列、複数対象、全一致と重複除去、順序、エラー継続、再入、終了、OS登録集約を確認する。

`dev.bat exec node scripts/keybindings-ui-test.cjs [win-unpacked EXE]`は隔離profile/local Applet/HTTP WebAppletで本体・埋め込み・別Window・ページ切替・実Windowsキー・非表示・一覧保存を確認する。Fキー単独の既存登録との競合を避け、Ctrl+Alt+F10を試験用に使う。競合時は製品動作と区別する。実Gmail認証を使わず、既存のapplet-pages-ui-testを併用してGmailのオフラインViewを確認する。

実入力ヘルパーは押下中の修飾キーを解除せず、最大3秒待つ。専用GUIは非同期起動したヘルパーの`-ScanCode`でCtrl/Alt/F10をスキャンコードとして送り、Chromiumの合成入力より先に実OS入力を検証する。仮想キー送信が未到達になる試験環境で、この方式の実行を確認した。各押下/解放間に20ms置く。この試験用待機や方式を製品のショートカット処理へ持ち込まない。

## 編集画面と表示順

設定ページは、本体・Applet・各WebAppletの全通常コマンドをまとめた平坦な一覧とする。未割り当ても表示し、キー/提供元のグループ分け、実行順番号、並べ替え、コマンド変更操作を置かない。カタログの順序を保ち、保存済みの配列や実行順を表示の都合で並べ替えない。

検索はコマンド名・完全ID・提供元・キー・条件の表示名を対象とする。空白で区切った語をすべて含むコマンドへ絞り込む。「すべて／割り当て済み／未割り当て／登録エラー」の選択、表示件数、絞り込み解除を上部にまとめる。該当コマンドに複数の割り当てがあればすべて表示する。未確認の保存済みコマンドと割り当て済みのhidden互換別名も一覧に残す。

設定ページとApplet詳細はShortcutCommandListを共用する。Applet詳細は提供元カタログ順を維持し、互換別名を別の一覧に表示する。設定ページは提供元も各行に表示する。キーの登録エラーと再試行は設定ページに表示し、正常時の登録済み表示や同キー警告は出さない。

コマンド横の＋で追加、キー/条件ペアまたはその他メニューの編集で小さなdialogを開く。キー記録、修飾キー付き特殊キー選択、条件、有効状態を編集できる。新規はowner/appの既定条件と有効状態で開始する。空キーや対象Appletが0件の条件は適用できない。記録欄のEnter/Delete/Spaceはキー入力、Tabは移動、Escapeは取消。特殊キーからTab/Escapeや修飾キー付きの組み合わせも選べる。

追加/適用は最新の保存済み設定へ反映し、その操作で即時保存する。追加とキー変更は同キー末尾、条件/有効状態だけの変更は位置を保持する。元の割り当てが編集中に外部更新・削除されていたら上書きを拒否する。追加/取消後に一覧を自動スクロールせず、元の操作ボタンへpreventScrollでfocusを戻す。絞り込みで元のボタンが消えた場合は一覧へ戻す。

その他メニューは「編集」「このキーの実行順…」「削除」。設定/通常Appletの削除は確認なしで対象IDを保存済み設定から除き、最後の割り当てを消してもコマンド行は未割り当てとして残る。一括初期化は置かず、利用者が削除した既定割り当てを再生成しない。WebApplet管理項目の将来サイト用テンプレートは既存画面を維持する。

## 実行順の専用パネル

- 設定上部の「実行順…」と、設定/Appletの割り当てメニューの「このキーの実行順…」から開く。コマンド一覧の順序・検索・スクロールは保つ。
- 保存済みの全キーを自然順の選択欄へ表示する。上部からは複数割り当てのある最初のキー、メニューからは対象キーを選択して開く。0件/1件も空状態と説明を表示する。
- 番号、コマンド名、提供元、完全ID、条件、無効/利用不可の状態を表示する。元の検索やAppletの範囲で絞らず、そのキーの全割り当てを保存順に並べる。
- ドラッグ、上下ボタン、つまみでAlt＋上下による並べ替え。異なるキーの間では移動しない。キーを切り替えてもパネル内の変更を保持する。長い一覧では一覧だけをスクロールし、適用/取消を常に表示する。
- 適用時に変更したキーだけを同キーの既存スロットへ書き戻し、安定ID/キー/条件/有効状態と他キーの相対順序を維持する。他キーや他設定の新しい編集は最新の保存済み設定から保持する。変更したキーに外部から追加/削除/条件等の変更/並べ替えが届いた場合は全適用を拒否して開き直しを案内する。
- 適用は既存保存済み設定、その操作で即時保存する。取消/Escape/×はパネル内の変更を破棄。パネルを閉じたらスクロールを伴わず元ボタンへfocusを戻す。表示中のショートカット抑止は既存キー編集と同じ契約を使う。
- 条件一致/無効/利用可能性/同じコマンドの最初の一致を1回実行する仕様は既存resolver/dispatcherのまま。実行順の編集は行数やコマンドを変えない。
## マウスジェスチャーと共通の編集UI

CommandBindingToolbar/CommandBindingList/BindingEditDialog/BindingOrderDialogを共用する。両一覧のメニューは編集・同じ入力の実行順・確認なし削除。追加時のフィルター・表示位置を保ち、自動スクロールしない。適用後に行が非表示になった場合は一覧へpreventScrollでフォーカスを戻す。ジェスチャー固有の入力・条件は[ジェスチャー仕様](gestures.md#コマンド一覧と編集パネル)を参照する。保存形式・revision・JSON・useSettingsEditorの共有を維持する。

主要な回帰はtests/keybindings.test.cjs、scripts/shortcuts-ui-test.cjs（全コマンド一覧とApplet編集）、scripts/keybindings-ui-test.cjs（実OS入力/ページ条件）、navigation/applet-order GUI。発行した単一EXEは隔離コピーで同じ一覧・保存・再起動を確認する。
