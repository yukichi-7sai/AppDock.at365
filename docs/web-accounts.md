# WebアカウントAPI

## アカウントグループ

`webAccounts.accountGroup: { id, title }`を宣言したAppletは、同じIDのグループの名簿と同じPCのアカウント別sessionを共用します。`Applet.Gmail.at365`は`at365.google`を使います。省略時はApplet専用領域です。以下の専用領域の記述はグループ未宣言のAppletに適用します。

UI snapshotの`group?: {id,title}`で共有範囲を表示できます。既存のadd/rename/move/removeは共通名簿、select/monitoring/soundはAppletごとのPC専用設定へ作用します。read/reportや表示・観測APIは継続します。認証情報や保存先のパスは公開しません。

名簿は共有`data/web-account-groups/<group-id>/accounts.json`、PC専用状態は`web-account-groups/<group-id>/state.json`、新規sessionは同じPC専用グループ配下の`sessions/<UUID>`。旧枠はUUIDを保持し、旧sessionを同じパスで使い続けます。初回グループ割当を`web-accounts/<Applet ID>/group-binding.json`に記録します。

グループ未作成時は空で始まり、UIの明示追加で最初の枠を作ります。共有名簿の削除は同期先にも反映し、このPCで明示削除したときだけこのPCの共通ログイン情報を消去します。

## 専用アカウントの基本契約

PC専用保存と登録素材の契約は[設定同期](settings-sync.md)を参照してください。Gmail等の枠はPC専用rootのweb-accountsに保存し、共有WebApplet枠とは分離します。ローカルUIのsnapshot.registeredSoundsに登録済みのファイル名を渡します。setSoundは登録済みファイル名、pickSoundはファイル登録、testSoundは試聴です。sound.fileは枠に紐づくローカル設定としてファイル名だけを保存し、ホストが自身のAppletの素材rootへ解決します。

[Appletページ](applet-pages.md)の`source:"web-accounts"`宣言により、既存のReact UIを本体ページ/別ウィンドウで共用できます。IPCの送信元はWindowのrootではなく、専用UIのWebContentsで照合します。以下の「操作Window」はローカルUIと選択アカウントを表示するWindowを指し、本体ページ表示では本体Windowです。ローカルUIのviewportはそのUI内の座標のまま、ホストが本体ページへの配置を管理します。アカウントView/永続セッション/背景描画の契約は継続します。

Node Appletへ、Webサービスのアカウント別画面と永続セッションを提供します。WebContentsViewの生成・ログイン領域・アカウント切替・UI IPC・破棄はホスト、サービス固有のDOM観測と通知はAppletの責務です。.NET SDKには専用ラッパーを提供していません。既存API v1/Node/.NET/nativeの契約は維持します。

## manifest

任意の`keepActive:boolean`は既定falseです。observeOriginの観測JSが`ready:true`を返した後、Chromiumの`Emulation.setFocusEmulationEnabled`を適用します。背景では30秒ごとに250msだけ解除して再適用し、DOMの準備後に初期化される受信処理の同期開始・再開を促します。native focusがあるWebContentsではエミュレーションを解除し、利用者の通常のfocus/blurを優先します。Windowsのフォーカス・選択枠・入力を動かさず、ページを再読み込みしません。同一文書のhash/history移動では維持し、別文書へのメインフレーム遷移開始時にタイマーと自身のDebugger接続を解除します。認証等の他originには適用しません。利用者がDevToolsを開いている間は干渉せず、閉じたときに再適用します。他のDebugger接続を切断しません。この契約を使うAppletの最低ホスト版は0.15.2です。

Windowsでは起動前に`CalculateNativeWinOcclusion`をdisable-featuresへ追加します。既存のfeature指定を保ち、画面外/透明Windowに対する描画停止を防ぎます。GmailはkeepActiveを明示的に有効にしています。

参照: [Chromiumのページアクティブ設定](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setFocusEmulationEnabled)、[Electron Debugger](https://www.electronjs.org/docs/latest/api/debugger)。アクティブ維持の接続はWebContentsの破棄より前に解放し、破棄後にWebContents.debuggerを再取得しません。

基本APIは`minimumHostVersion: "0.12.0"`と`capabilities: ["web-accounts"]`が必要です。`report`のdataやUIの`viewport`を使用するAppletは`minimumHostVersion: "0.13.0"`を指定してください。

初回未表示からWebページの描画を継続するAppletは、を指定してください。非選択Viewは専用Windowへ可視・実寸で接続したまま保持します。この親Windowはopacity:0・全ディスプレイ外・frameなし・taskbar/フォーカス対象外でshowInactiveし、初回ネイティブ描画を開始します。ディスプレイ構成変更でも画面外へ配置し直します。操作Windowと背景WindowはbackgroundThrottling=false。選択中Viewのみ可視の操作Windowへ移し、非選択・viewport(null)・非表示・最小化では背景Windowへ戻します。全Viewと背景Windowを停止時に破棄します。

```json
{
  "webAccounts": {
    "url": "https://mail.google.com/mail/u/0/#inbox",
    "origins": ["https://mail.google.com", "https://accounts.google.com", "https://myaccount.google.com"],
    "observeOrigin": "https://mail.google.com",
    "ui": "web/index.html",
    "observer": "web/observer.js"
  }
}
```

URLは宣言したHTTPS origin内、観測先もその1つに限定します。ui/observerは実パスでもApplet内のファイルだけを許可し、observerは100KB以内。任意の`itemOpener`も同じ資産境界・100KB上限の関数式ファイルです。既定の画面枠は左236px・上146pxを予約します。UIが`viewport`で変更できます。最小ウィンドウ900×640、既定1280×900です。

## 非表示時の開始ページへの復帰

任意のmanifest `returnToStartOnHideSetting:string`は、自身が宣言したboolean設定のキーです。settings capabilityが必要で、開始URLのoriginはobserveOriginと一致しなければなりません。最低ホスト版は0.35.2です。未宣言または設定がONでなければ従来の画面保持を継続します。

ONでは、実際に表示していたSurfaceが非表示・最小化・本体の別ページへ移ったときに、選択中のViewを開始URLのhashへ戻し、navigationRevisionでローカルUIの開始タブへの復帰を通知します。アカウント切替では切替前のViewだけを戻し、切替先とローカルUIのタブは保持します。viewport(null)によるローカルタブの切替、フォーカス移動、同じ枠の再選択、停止時の破棄、表示先変更中の一時的な非表示は対象外です。

同じorigin・pathnameの読み込み済み文書だけにisolated world 1001でhash移動を行います。query、ログインsession、WebContentsを保持し、全体reload・Window表示を行いません。開始hashにいる場合は移動しません。読み込み中ならdid-stop-loadingまで待ち、再表示・OFF・停止・認証画面などになっていれば中止します。サービス自身がhash移動へ応答する際の入力・下書きの扱いはサービス側の仕様です。

## Node/RPC

画像要求は各アカウントのsessionとcredentials:includeを使用します。Googleの認証依存画像URLは未認証で取り直すと標準画像を返すためです。Cookieの適用と送信先はChromiumの当該セッションに閉じ、他アカウントのCookieをコピーしません。転送先の厳密なorigin制限とサイズ/時間上限は維持します。cycleは保存と既存Viewの切替だけを行い、未表示のUIは作成せず、非表示/最小化や現在のフォーカスを保ちます。明示的なopenは従来どおりウィンドウを表示します。

ローカルUIは`move(id, 1|-1)`（隣の枠と順番を交換、端では変更なし）と`setMonitoring(id, boolean)`を提供します。並べ替えはaccountsの配列順だけを保存し、UUID・選択枠・セッション・通知音を維持します。OFFではホストもattentionとdataを直ちにクリアし、遅延reportからの再計上を抑制します。ページ更新と読取は保持し、検知・通知・音を止める判断はNode Appletが行います。

`read`は`monitoringResets:string[]`も返します。ON/OFFの遷移を次のreadまで保持し、OFF→ONが読取間隔内に発生しても基準を消去できます。Appletは該当するmonitorをresetし、個別/全体の監視OFFなら履歴・件数を消去してください。再開時の未読取り込みはAppletの方針です。

任意のmanifest `avatarOrigins:string[]`は最大10個の厳密なHTTPS originです。観測結果のトップレベル`avatar:string`から、そのoriginの画像だけをホストが[ClientRequest](https://www.electronjs.org/docs/latest/api/client-request)で取得します（各アカウント固有のログイン済みセッション・全要求で配信先を再検証・最大3回の転送・合計5秒上限）。PNG/JPEG/WebP/GIFのみ、ストリームを含め64KBまで。デコード後64×64のPNGへ変換し、snapshotの`avatar`へdata URLを返します。失敗・画像未取得は空文字、originを離れたら破棄します。停止・削除時に待機を中断し、保存ファイル/ログ/Node readへ画像バイトを出しません。UIのCSPは外部画像を許可せず、data画像だけで表示できます。Session.fetchのmanual redirectは転送レスポンスを返さず取消エラーとなるため、ClientRequestのredirectイベントから転送先を検証します。取得はDOM読取を待たせず、同じURLは成功後キャッシュ、失敗時は最短60秒で再試行します。この契約を使うAppletの最低ホスト版は0.16.0です。

| Node | RPC | 処理 |
| --- | --- | --- |
| `context.webAccounts.start()` | `host.webAccounts.start` | 全枠を非表示で読込開始、UIを開かない |
| `context.webAccounts.open()` | `host.webAccounts.open` | 操作用ウィンドウを表示・復帰 |
| `context.webAccounts.cycle(1|-1)` | `host.webAccounts.cycle` | 次/前の枠へ循環して選択。ウィンドウ表示/復元/フォーカス移動なし |
| `context.webAccounts.navigate(action)` | `host.webAccounts.navigate` | back/forward/reload/inboxだけを受け付け、選択中のViewを操作。停止中は拒否 |
| `context.webAccounts.read()` | `host.webAccounts.read` | 各枠の観測結果とUIからのクリア要求を返す |
| `context.webAccounts.report(id, status, attention, data?)` | `host.webAccounts.report` | アカウントの状態表示と一時UIデータを更新 |

`read`の戻り値は`{ dark, selected, accounts, acknowledged, monitoringResets }`。アカウントは`id/name/monitoring/avatar/url/loading/error/canGoBack/canGoForward/observation/status/attention/data/sound/soundError`を持ちます。型は[src/shared/web-accounts.ts](../src/shared/web-accounts.ts)、Node contextは[src/main/node-worker.ts](../src/main/node-worker.ts)が正本です。dataはJSON化可能な50KB以下の値で、ローカルUIのsnapshotへ渡します。省略時はnull。ホストはファイルやログに保存せず、Applet停止時に破棄します。Nodeへの`read`ではdataをnull、avatarを空文字にし、最大10枠の観測と履歴の二重送信でJSON-RPCの1MB制限を超えないようにします。

観測JSは式としてJSON化可能な値を返します。ページがobserveOrigin内で読み込み済みの場合だけ、**isolated world 1001**で実行します。1枠の観測結果は60KBまで、待機は800msまで。同じ枠で未完了の観測を並行起動しません。逐次読取で最大10枠を扱い、ナビゲーション世代/URLの変化・停止・削除があれば遅い結果を捨てます。ページの再読込や通信APIポーリングは行いません。ページ遷移/プロセス終了でisolated worldのObserverも破棄されます。

観測の任意の`accountName`（制御文字なしの1〜60文字）を仮名の置換に使います。新規枠は`name:"新しいアカウント"/temporaryName:true`で保存します。取得成功または明示的なrenameで`temporaryName:false`とし、以後は自動変更しません。Gmail固有の名前/メール抽出はAppletのobserverへ置きます。受信トレイのreadyとは独立して処理し、監視OFFでも本人情報を取得できます。

ローカルReact UIのpreloadは`window.webAccounts`へ`snapshot/add/select/rename/remove/navigate/acknowledge/viewport/onChanged`を公開します。`cycle/openItem/setSound/pickSound/testSound`も利用できます。ホストはsenderのWebContents・main frame・厳密なローカルUI URLを検証し、そのUI自身のAppletへ割り当てます。パネルの任意HTML実行機能とは独立しています。

`openItem(id,key): Promise<boolean>`は任意のitemOpenerを宣言したAppletのみが使えます。アカウントを選択し、読込済みのobserveOriginページへ、JSON文字列化した1〜200文字のkeyをisolated world 1001で渡します。UIから任意のソース/URLを受け取りません。itemOpenerは関数式として対象の可視行を探し、ユーザーが求めた項目だけを開いてtrueを返します。対象を確認できない場合はfalse。未宣言・認証ページ・読み込み中もfalseです。サービス固有のセレクターとフォルダー復帰/代替案内はAppletへ置きます。項目を開く操作でサイトの既読状態等が変わり得るため、背景監視からは実行しません。

アカウントsnapshotは`sound:{enabled:boolean,file:string,name?:string}`も返します。初期値はfalse/空文字（無音）。`setSound(id,sound)`で保存し、`pickSound(id)`は親付きWAV選択ダイアログでfileを変更、取消は変更なし。設定/試聴にはaudio、選択にはfile-dialogも必要です。`testSound(id)`はON/OFFにかかわらず共通再生キューで試聴します（WAV未選択は無音）。Nodeではsoundをreadから受け取り、通知と独立した条件でaudio.playを呼びます。Windows通知の音との二重再生はsilent:trueで抑制してください。

選択したWAVはRIFF/WAVE・16MB以下を検証し、EXE隣の`data/assets/applets/<Applet ID>/sounds`へ元のファイル名で登録します。同名・同一内容は再利用し、同名で内容が異なる場合は拒否します。元ファイルを変更せず、登録素材を停止時の未参照キャッシュとして削除しません。再選択で復旧できます。詳細は[登録素材](settings-sync.md#ファイル名を使う登録素材)を参照してください。

snapshot/readには`dark:boolean`も含まれます。AppDockのテーマを反映したnativeTheme.shouldUseDarkColorsで、テーマ変更時にローカルUIへonChangedを通知します。サービス自身のWebページのCSSは変更しません。

操作UIと各WebContentsのbefore-input-eventは本体の共通ショートカット処理へ渡します。条件と同一キーの実行順は[条件付きショートカット](keybindings.md)に従い、グローバル登録と重複実行しません。長押し・IME入力を区別し、Appletの初期キーはmanifestのdefaultKeybindingsから初回だけ反映します。

cycleは、切替前に操作Windowがアクティブかつ表示中で、選択中WebContents自身が入力フォーカスを持つ場合だけ、接続後の切替先WebContentsへ入力を渡します。Windowのshow/focus/restoreは呼びません。ローカルUIの入力欄、別Windowの前面、未表示/非表示/最小化は保持します。切替後に毎回wc.focusを呼んでからキーを送る試験は不具合を隠すため、最初の1回だけフォーカスを設定し、以後はgetFocusedWebContentsに連続してキーを送る試験を使います。

`viewport({x,y,width,height})`はローカルUIのclient座標・DIPで表示領域を指定し、ホストがclient領域内へ切り詰めます。各値は0〜100000の整数（幅・高さは1以上）です。`viewport(null)`は操作WindowからViewを外して背景Windowへ戻し、アカウント切替後も操作画面へ表示せず、ページと監視を続けます。UIではResizeObserver等で実領域を再送してください。

[Electron WebPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences)のbackgroundThrottling=falseだけでは、非表示・切り離しされたViewのrAFを維持できないことを実測しました。document.visibilityStateがvisibleでもrAFが止まるため、DOMの可視性判定だけを検証して済ませません。背景保持はGmailのスクリプト改変やフォーカス移動・周期的reloadを行わず、サイト側の通常の更新を待ちます。描画を維持する資源コストはアカウント数に応じます。

## 保存とライフサイクル

ローカルUIのsnapshotは`settings?: Record<string, boolean | string>`、preloadは`setSetting(key, value): Promise<void>`を提供します。settings capabilityを持つ自身のAppletのmanifestで宣言したboolean/静的select項目だけを公開し、未保存時はmanifestのdefault（未指定はbooleanならfalse、selectなら空文字）を使います。未宣言キー・定義の型・選択肢に合わない値は拒否します。ホスト全体や他Applet、未宣言の保存項目は読み書きできません。NodeのreadにはこのUI用設定を追加しません。

保存はホストの設定サービスを通して行い、ほかの項目・有効化状態を保持します。既存の競合検出とatomicWriteを使い、失敗は呼び出し元へ返します。AppDockからの変更もonChangedでローカルUIへ通知し、停止時に購読を解除します。Gmailの設定タブがこのAPIを使います。

`%LOCALAPPDATA%/at365/AppDock/profiles/<配置ID>/web-accounts/<extension-id>/accounts.json`に安定したUUIDと表示名、`sessions/<account-id>/`にChromiumの永続セッションを保存します。`session.fromPath`を使うので複数のApplet・アカウント間でCookieを共有しません。アカウント保存はatomicWrite、不正な既存JSONは上書きせず起動エラーとして報告します。停止・異常終了でWebContents/UIを明示破棄し、Cookieをflushします。ウィンドウの×は非表示にし、Appletを止めるまで背景のページ更新を維持します。

同じ保存先のwindow-state.jsonへ通常の位置・サイズ/最大化を記録します。共通WindowStateStoreで300ms遅延保存、終了時flush、DIP丸め補正とモニター作業領域への復帰を再利用します。最小化/非表示では通常枠を上書きしません。保存失敗はホストログへ内容を含まない診断を残し、ページを閉じません。

削除は利用者確認後、対象枠のWebContentsを閉じ、storage/cache/Cookieを消去して一覧から外します。最後の枠は残します。削除処理中の枠は観測から除外します。Webページ内のアカウント切替はGoogle自身の操作で、追加枠とは異なります。

リモートページはpreloadなし、Nodeなし、contextIsolation/sandbox/webSecurityを有効にします。権限要求は拒否し、トップレベル移動先を宣言originへ制限します。子フレームのリダイレクトにトップレベル制限を適用しません。認証URLのquery/fragmentは診断へ記録せず、ローカルUIでは認証originだけ表示します。外部リンクは既定では利用者確認後に開きます。webAccounts.externalLinkSettingで自身のboolean設定キーを宣言できます（settings capability必須）。trueなら確認を省略し、falseならダイアログへ「次回から聞かずに開く」を追加します。チェック付きで「開く」を選んだ場合のみホストの検証済み設定保存経路でtrueを保存します。キャンセルでは保存しません。未宣言のAppletは確認を継続します。許可する外部スキームはHTTP(S)/mailtoに限定し、資格情報付きURLは拒否します。内部HTTPS originや認証境界の制限は変わりません。開く処理の失敗はログへ報告し、並行する重複確認を抑制します。認証偽装・User-Agent変更はしません。

Appletは通常のNodeプロセスと同じ権限を持つ信頼済みコードであり、capabilitiesはOSのサンドボックスではありません。observer/itemOpenerにもその信頼境界が適用されます。observerは読取に限定し、項目を開く操作はitemOpenerへ分離して明示的なUI操作でだけ実行してください。

## 検証

ホストの`tests/web-accounts.test.cjs`でorigin・資産の境界とcapabilityを検証します。[Gmailの開発ガイド](../../Applet.Gmail.at365/DEVELOPMENT.md)の`test-gui.cjs`で実Electronのセッション分離、DOM変化、背景監視、再起動保持、削除、停止を確認します。実Googleログイン・実メール到着・スリープ復帰は別の検証として扱います。

公式仕様: [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)、[session.fromPath](https://www.electronjs.org/docs/latest/api/session#sessionfrompathpath-options)、[webContents](https://www.electronjs.org/docs/latest/api/web-contents)。

snapshot.navigationRevisionはUI/Nodeのnavigate成功ごとに増えます。ローカルUIは変更を見て受信トレイ表示へ戻せます。Web履歴の移動可否は従来のcanGoBack/canGoForwardを使用し、履歴の端では移動しません。navigateはWindowを開く操作を含まず、表示はopenで制御します。Gmailの通知は既存のnotifications.show(...,{command:"at365.gmail.open",silent:true})を使い、クリック時はホストが同じ起動世代の実行中Appletか確認してからコマンドを実行します。

## WebViewの言語

Webアカウントのsession/表示WebContentsView/背景Windowは、ChromiumがWindowsから取得する優先言語を使います。ホストでAccept-Languageやnavigator.languageの独自上書きを行いません。サイト側のアカウント設定やURLによる表示言語は別です。隔離セッションでの実測は[検証記録](../VERIFICATION.md)を参照してください。

## 任意URL向けのWebプロフィール

web-profiles capabilityとcontext.webProfiles.list/add/rename/clear/deleteは、Applet自身のログイン保存枠を管理します。任意URLのページ表示にはpageCollectionsのsource:remoteを使います。Cookieやsession、任意保存パスはAppletへ渡しません。上記webAccountsのサービス観測・専用UIとは別契約です。Gmail等の既存APIと保存先を維持します。

新規名簿は共有data/web-profiles/<owner>/accounts.json、sessionと削除待ちはPC専用web-profiles/<owner>です。宣言と操作の詳細は[動的ページ設計](applet-pages.md)を参照してください。

## 宣言と公開契約

`webAccounts.accountGroup: { id, title }`を追加する。Gmailは`{ "id": "at365.google", "title": "Googleアカウント" }`。IDは安全な小文字の名前空間付き識別子、titleは表示名。同じIDを明示したAppletだけが同じグループを使う。省略したAppletは従来の専用枠を継続する。

従来のweb-accounts capability、Nodeのstart/open/read/report/cycle/navigate、ローカルUIのadd/rename/move/remove/select等を継続する。呼出し先グループはホストがmanifestから確定し、IPC引数で任意のグループ・パスを指定させない。UI snapshotにgroupのid/titleを追加する。Cookieやパスは返さない。

これは信頼済みNode Appletが宣言する共用契約であり、任意のWebページへの権限付与ではない。Node Applet自体をOSサンドボックスと扱わない。各Viewのorigin制限・observer・itemOpener・preloadなし・Nodeなしを維持する。共通sessionのpermission handlerはサービス固有の許可を追加せず、一律拒否を維持する。

## 操作と寿命

- 追加・改名・順序変更は全参加Appletへ反映する。選択の変更は呼出し元だけ。通知音と監視も呼出し元だけに保存する。
- 追加時は既存上限の10枠。新規グループは空で開始し、明示的な追加で最初の枠を作る。同期未到着時に既定名簿を作らない。最後の1枠は従来どおり削除しない。
- 仮名の自動更新は最初の有効な観測だけ。利用者が決めた名前を後から上書きしない。
- 削除確認は全参加Appletの共通一覧から消えることと、このPCの共通ログイン情報を消去することを明記する。確認中の別変更を再照合する。実行中はグループの変更を排他し、全参加Viewを閉じてからセッションを消去し、名簿を保存する。失敗は報告し、成功したと表示しない。
- 外部名簿から消えた枠は全Viewを閉じるが、このPCのCookieを自動削除しない。別PCの名簿操作をローカル認証の破棄許可と解釈しない。
- Applet停止では自身のView・購読だけを破棄する。他の参加Appletや永続名簿・sessionを削除しない。最後の購読終了時にファイル監視を閉じる。
- グループを使うWeb画面内でのログアウトは、同じアカウントを使う他Appletにも影響する。Gmail UIで共有範囲を説明する。

## Gmailの変更

manifestのグループ宣言、最低ホスト版、アカウント設定画面の共有範囲の説明を追加する。メール観測と新着判定、通知、ショートカット、登録音のAPIは継続する。グループの削除後に遅れて届く観測・reportは破棄する。既存UIのアカウント設定から共通名簿を操作できるようにし、本機能専用の管理Appletは増やさない。
