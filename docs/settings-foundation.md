# 設定基盤と本体の共通設定画面

本体rendererで全体設定とApplet設定を共用する。画面構成・説明・状態・エラー表示の設計基準は[共通レイアウト指針](settings-ui-guidelines.md)、保存場所とファイル同期は[設定同期](settings-sync.md)、複数項目の一覧編集は[一覧とダイアログ](settings-list-editing.md)を正本とする。

## 共通レイアウト指針との対応

本体・Applet設定と設定ダイアログは`SettingsSection`/`SettingsField`の`description`と`hint`を共用する。`description`は現在の値・継続的な状態・重要な説明を常時表示し、`hint`は任意の補足だけを表示する。入力欄を個別のラベルとCSSで配置せず、`SettingsField`へタイトル・説明・入力を渡す。共通の選択候補・キー記録・一覧等のウィジェットは、その内部の操作契約を保つ。

ページと[SettingsModal/SettingsDialog](../src/renderer/settings-ui/SettingsModal.tsx)は、常設の[SettingsStatusArea](../src/renderer/settings-ui/SettingsStatus.tsx)と[SettingsError](../src/renderer/settings-ui/SettingsError.tsx)を持つ。エラーの有無・長さによらず40pxの表示領域を確保し、要約と「詳細」から全文を確認できる。個別配置の`SettingsHint`・`SettingsFeedback`と`errorLayout`は使用しない。

## 保存と入力

SettingsInputSessionは選択ページ・フォーム/JSONモード・sessionId/editRevision・pending・512操作の再送結果だけを持つ。snapshot.valueはStoreから取得し、別の値を保持しない。SettingsPageSessionは選択ページだけを投影する。useSettingsEditorとSettingsViewClientは入力キューと購読を担う。

フォーム、部分JSON、通知方針、並び順、リボン、トレイは妥当な変更ごとにprepareSettings/LaunchSettings/SettingsStoreへ保存する。宣言済みApplet設定の検証、expectedRevision、Windows登録とJSONのトランザクション、原子的置換を維持する。正常保存時に配送・実行状態を更新し、通常の保存成功通知を出さない。PC専用権限とWebアカウントは各既存サービスを維持する。

要求はbefore/valueを持ち、mergeSettingsInputが変更したフィールドだけを現在値へ統合する。未編集フィールドの外部変更を保持し、同じフィールドの外部変更は拒否する。配列は順序/IDが重要なので全体で比較する。UIキューの直前成功結果だけを後続の基準へ使い、外部変更/失敗を黙って再試行しない。操作送信前に最新モデルを取得して購読の到着遅れを補い、入力のbeforeは保持して競合を検査する。古いView入力はsession/editRevisionで拒否する。

文字・数値は共通のSettingsInput/SettingsTextarea内に保持し、blurまたはEnterで一度だけonChangeへ渡す。Enter後のblurや繰り返すEnterでは同じ入力を再送しない。Escapeはその欄の未確定入力を確定前の値へ戻し、後のblurでも保存しない。数値の上下キーも画面内の現在値へ作用し、確定まで保存しない。複数行はEnterで確定、Shift+Enterで改行する。IME変換中のEnter/Escapeを確定・取消へ使わず、フォーカス中のcompositionendだけでは設定へ送らない。変換中にblurした場合はcompositionend後に一度確定する。trim等で連続入力の空白を消さず、別の正規値への外部変更は表示へ反映する。不完全な数値、不正JSON、検証違反、保存失敗は現在のUIだけで入力とエラーを保持し、Storeや通知に保存しない。修正した入力で再検証/保存する。「設定を再読み込み」は現在ページの入力を保存値へ戻し、保存済み変更は巻き戻さない。通常のクリック移動はblurで確定し、blurを経ないView破棄では未確定入力を破棄する。再起動で途中入力を復元しない。

検索欄は入力中の絞り込みを維持する。追加・編集ダイアログはSettingsInputModeのinputモードで一時入力だけを更新し、Enter/blurで欄の確定点を更新、Escapeでその欄を戻す。変更のある欄のEscapeはダイアログへ伝播させず、欄の変更がないEscapeは従来どおりダイアログを取り消す。明示ボタンで設定するAPIキーや接続ポート、試験生成の入力も、inputモードのローカル入力と実操作を分離する。設定の保存は従来のOK/適用操作で行う。URLはこのモードでも確定まで補正・検証しない。

画像は共通ライブラリーへ登録し、利用箇所には参照だけを保存する。通常設定では選択確定時、追加・編集ダイアログでは親のOKで参照を保存する。原画像の検証・同名衝突・独立した登録保存・既存保持は[共通画像](registered-images.md)と[設定同期](settings-sync.md)を参照する。

ショートカット・ジェスチャーの編集/順序パネルは組合せ入力をパネル内に保持し、「適用」で1回保存する。取消/Escape/×はパネル内だけを破棄する。削除・ON/OFFは即時保存。ID・順序・外部変更検査・記録中の一時的実行抑止を維持し、保存自体で割当コマンドを実行しない。

## 本体の設定ページ契約

SettingsPageModel schemaVersion:2は本体内部の投影モデルとして使用する。DockApi.settingsPageのopen/get/act/close/onChangedを本体のmainFrameだけに提供し、SettingsPageHostが接続ID・route・対象を検査する。Shell Appletへ設定描画bridgeは公開しない。

更新・再起動で画面を復元するときは、保存された表示先だけで接続を開始しない。本体のstartupReadyとnavigation.routeが実際の表示先にそろってから設定を接続する。準備中は読み込み表示とし、対象が変われば接続と検索移動の監視を解放する。全体設定とApplet詳細の両入口で同じ条件を使う。

本体内部モデルは選択ページのvalues/定義/表示用補助情報/不透明な操作IDとsessionId/editRevision/pending/mode/errorだけ。選択ページ以外のSettings/HostSnapshot・他Appletの値を投影しない。dirty/conflict/text/avatarChanged/avatarLoadingを削除した。page-values/partial-textは同ページのbefore投影を必須とし、対象外キーを拒否する。save/discard/avatar-loadingを削除。JSONはUTF-8 1MiB、画像5MiB、検索語512文字。

Applet管理と左インデックスは本体の共通設定ページを開く。個別設定・入力設定・ログの移動先と表示用フィルターは[Applet管理](applet-management-settings-design.md)を参照する。停止・無効でも編集でき、移動だけで起動しない。入力キューと3秒のflush、競合と不正入力の契約を維持する。

「表示」の部分JSONは`host.language`・`host.zoomFactor`・`host.theme`・`host.accentColor`・`host.customAccentDark`・`host.customAccentLight`・`host.showHints`・`host.shellProviders`です。領域ごとの選択・現在の使用先・適用待ちと理由・領域ごとの再試行を表示します。

## カタログ・JSON・検索

settings-catalog.tsがページ/項目ID・JSON許可範囲・静的検索メタデータを定義する。IDはページIDとキーを個別にencodeURIComponentし、ドット入りID/設定キーはキー配列で扱う。未知の未編集フィールド・未導入Appletを保持する。未設定Appletの部分保存ではenabled:true/settings:{}の行を補完する。保存済みのenabled:falseは保持する。無検証マージと変更マーク比較を削除した。JSONは選択ページのみ、Webは対象IDを保つ1行投影の許可フィールドだけを変更する。

左インデックスの本体ページID・表示名は`src/shared/settings-navigation.ts`の`hostSettingsPages`を正本とし、設定カタログと「ページ名設定を開く」コマンドを同じ定義から生成する。本体ページを追加するときはこの定義へ追加し、別のコマンド一覧・公開許可リスト・分岐を増やさない。Appletとcollectionの子ページは現在の一覧から自動生成し、停止・無効でも設定を開ける。ページを開く操作でAppletを開始・有効化しない。

本体のIDは`appdock.settings.<pageId>.open`、Appletは`appdock.settings.applet.<appletId>.open`。既存割り当てのため、リボンは`appdock.ribbon.settings.open`、バージョン情報・更新は`appdock.updates.open`を維持し、同じ生成・実行経路を使う。表示名の変更でもIDを変えない。`appdock.settings.open`は現在選択中の設定を開く従来の動作を維持する。すべて共通操作APIの`commands.list/execute`へ公開し、コマンドパレット・入力割り当て・リボン・トレイでも同じIDを使う。実行は現在のカタログで対象を検査し、入力確定・ページ選択・画面移動を本体が行う。

検索はNFKC/空白区切りAND、項目名/説明/所属/静的キー・別名・固定選択肢・オブジェクトフィールドを対象にする。入力値/秘密/動的選択肢は対象外。入力だけで右ページを変えず、結果選択でフォーム全体へ移動する。data-setting-itemアンカー、details展開、スクロール/フォーカス/2秒強調、最新移動IDの完了照合を維持する。queryはprimaryのSettingsNavigationStateに保持し、不正JSONは移動を妨げない。対象消失時は結果更新/右を利用不可にする。

## 共通の画面構成

カードのタイトルは共通の`--text`を参照し、折りたたみの有無や開閉状態に関わらず同じ明瞭な文字色にする。`summary`の補助文字色をタイトルへ継承せず、説明文・ヒント・開閉記号はそれぞれの既存スタイルを使う。

入力欄がトグルだけの項目は、広い画面でも入力欄の左端にそろえる。「表示 → Shellの変更」の各領域の使用先と適用待ちは、その項目の`description`へ表示する。ヒントのON/OFFに関わらず現在の使用先を表示し、未適用の理由と再試行操作は従来どおり入力側へ残す。

全体設定の割り当て一覧は「ショートカットキー割り当て」「マウスジェスチャー割り当て」を共通の`SettingsSection`で表示し、hintは「＋で割り当てを追加します。」とする。本文とヘッダーの余白は共通規則を使い、ジェスチャーだけの上余白を追加しない。Applet詳細の共用一覧内へ見出しを重ねない。

ショートカットキーのフォームでは本文の外枠と余白を重ねず、初期状態で閉じた「動作設定」と、枠なしのコマンド一覧を本文のトップレベルに配置する。実行方法のフィールドはジェスチャーと`CommandExecutionModeField`を共有する。JSON編集の枠は維持する。一般の設定ファイルカードはファイル別の状態の下へ共通のボタン列を置き、Windows起動設定の復旧も同じ列へ含める。操作の許可への案内カードは設けない。並べ替えを開くボタンと順序ダイアログの上下移動は、[共通配色](appearance.md)の`accent-action`へ統一する。

通知の「読み上げ」カードの設定項目名は「TTS設定」とする。声・速度の現在値は各項目の`description`へ表示し、共通設定/個別設定とヒントON/OFFによらず有効値を示す。「MCP連携設定」のdescriptionは「MCP Eventを使用するには、MCPサーバーの設定と連携が必要です。」とする。

本体とAppletの全設定ページは`SettingsPageLayout`（`src/renderer/settings/SettingsPageLayout.tsx`）へタイトル・説明・ツールバー・本文を渡す。ページ側で同じ見出しを重ねない。フォーム/JSONの切替を含む上部操作・タイトル・本文を同じ外側の表示枠で縦スクロールする。一覧フィルターだけを共通の固定ツールバーへ接続する。JSON入力欄の編集領域は読み書きできる高さを保つ。Applet詳細でも同じ本文部品を使い、ショートカット一覧の内部にタイトル・説明を追加しない。

本文は`src/renderer/settings-ui/SettingsSections.tsx`の`SettingsSection`（カード/詳細折りたたみ、`variant="group"`で枠のない見出しグループ）、`SettingsField`（項目名・説明と入力、入力なしの状態表示）、`SettingsChoice`（選択カード）、`SettingsActions`（余白と折り返しを持つボタン列）、`SettingsContent`（構造を持つウィジェットの外枠）を再利用する。説明・状態・エラーの表示は共通レイアウト指針に従って共通部品側へ集約する。新しいページでは既存の余白・境界・テーマ変数・幅に応じた縦配置を継承し、ページ専用CSSは固有の一覧構造に限定する。カード内のグループ背景には`--settings-group-background`を使い、ボタンの`--raised`や選択状態の色と分離する。入力には`SettingsInput`/`SettingsTextarea`を使い、アクセシブルなラベルを指定する。共通部品は保存や通信を所有しない。

`SettingsField.group?: string`は項目名の左に小さなグループ名を常時表示する。色・文字サイズ・配置で項目名と区別し、groupの有無でタイトルの高さを変えない。同じ行に表示し、fieldsetの読み上げ名にもグループ名を含める。関連する項目には同じgroupを指定し、SettingsSectionや複数列の専用グリッドで囲まず同じ階層へ並べる。マウスジェスチャーの操作感・待機表示と、両入力方式のWebブラウザ設定はこの形を使う。枠なしの`SettingsSection variant="group"`は上部に共通の20pxの余白を設ける。Fieldのgroupとは別の構成部品として扱う。

折りたたみSectionのhoverとキーボードフォーカスは共通の`--accent-soft`を背景に使い、説明文は読みやすい`--accent`で表示する。rowのsummaryは親カードの内側の余白へ左右12px（狭い幅では8px）広げ、その分を内側の余白へ戻す。タイトル・説明・開閉アイコン・区切り線の位置と折り返し幅を変えず、背景と文字の間に余裕を設ける。カードの枠からはみ出さず、ハイライトの有無で寸法を変えない。

設定値のnative selectは共通Fieldとダイアログで`fit-content`を使い、最長の選択肢が収まる自然な幅を基本とする。最大幅は親の100%に制限し、文字・URL・JSONなどの入力欄は従来の入力列の幅を保つ。Applet/コマンドの対象フィルターも共通`CommandProviderFilter`で内容に合う幅にし、flex/gridの親で横へ引き伸ばさない。長い名前は枠内で折り返し、解除ボタンを隠さない。一覧中心の画面はApplet管理を参考に構成し、トップレベルのカードを必須にしない。

通知一覧は提供元ごとの`SettingsSection variant="card"`内へ、通知種類を`SettingsSection variant="row" collapsible`で直接並べる。rowはSettingsFieldと同じ文字サイズ・行の余白・全幅の区切り線を使い、タイトルと常時表示のdescriptionを持つ枠なしの行にする。共通の開閉アイコンを右端へ表示し、行全体のクリック、Enter/Space、hoverとフォーカス表示で開閉箇所を分かりやすくする。通知先も共通のField/Choiceを使い、汎用fieldsetやカードを画面専用CSSで上書きしない。操作の許可一覧は先頭の説明カードの下へ直接配置し、一覧自体にCommandBindingListと同じ境界色・12pxの角丸・カード背景の外枠を付ける。Applet/MCPの独立した許可列と専用テーブルの操作契約を保つ。これと同種の2列テーブルの共通部品化は今後の検討対象で、現行では専用テーブルを使用する。

通知のボイス候補は`SettingsCombobox`を使う。入力欄の位置と幅に合わせた同一Surfaceのポップオーバーで、スクロール枠に切られず、下に空きがない場合は上に開く。IDの直接入力・ID/名前による候補絞り込み・クリック・上下キーとEnterでの選択・Escape/Tabでの終了に対応し、IME入力の確定は共通入力部品へ委ねる。取得済み一覧は通知の声・速度や無関係な設定の保存で破棄せず、TTS設定またはAPIキーの変更時に無効化する。取得中に接続設定が変わった場合は古い応答を破棄する。

検索対象の項目に`settingAnchor`を付け、折りたたみの展開と項目への移動を維持する。高度な設定だけを閉じ、主要な設定と状態は最初から表示する。読み上げは接続先→モデルと声→試聴→詳細、通知は受け取り方→読み上げの共通上書き→MCP Eventの接続案内→提供元別の通知種類、Codexは状態と操作許可へのリンク→登録/接続テスト→登録先や接続の詳細を基本構成とする。トレイはクリック動作と右クリックメニューを分離し、バージョン情報は一括更新・本体・Applet・共通更新設定・実行環境を共通カードで配置する。

`scripts/settings-usability-ui-test.cjs [固定EXE]`は共通構成、8ページの明暗テーマと狭い幅、モデル候補・直接入力、通知先と声/速度の継承、隔離したCodex登録/解除を確認する。`scripts/settings-layout-refinements-ui-test.cjs [固定EXE]`はgroupとタイトルの高さ、入力列・全幅区切り線、通知カード・暗色の枠、許可一覧の背景、導入description、AIの同一階層と保存/取消、操作文字の中心を確認する。保存と公開範囲の契約は上記を維持する。

Applet本文は`src/renderer/settings-ui/AppletSettingsForm.tsx`を共通テンプレートとする。manifestの`settingSections`を検証し、設定ページのauxiliaryへ投影する。セクションへ配置されなかった設定・操作も表示し、設定保存/JSONの投影に表示メタデータを混ぜない。設定アンカーは既存のキーのままで、セクションの再配置や折りたたみに依存しない。WebAppletもSettingsSection/SettingsFieldでサイト・表示とページ遷移・アカウント・管理を描画する。

`scripts/applet-settings-ui-test.cjs [固定EXE]`は兄弟Appletの宣言と配布物を隔離配置し、停止したまま全項目の描画・保存・検索・両入口の一致・明暗/狭幅を確認する。コマンドの実行中表示は専用Node fixtureを使い、実壁紙やロック・キー送信は実行しない。最低ホスト版と宣言形式は[Applet API](extensions.md#共通の設定ページ)を正本とする。

URL欄は共通の`SettingsUrlInput`を使い、入力途中のコロン・スラッシュ・不完全なURLを入力欄内に保持する。補正・検証・保存はEnterまたはフォーカスが外れた時だけ行い、Enter後のblurで同じ入力を二重送信しない。IME変換確定のEnterは設定確定として扱わない。AI/TTSのベースURL、WebAppletのURL、本体/各Appletの更新元に同じ動作を適用する。WebAppletの追加許可先は`SettingsUrlTextarea`を使い、Enterで確定、Shift+Enterで改行する。Web側の初期設定取得もURL確定後に行う。AI接続ダイアログではURLの確定はローカル入力だけを更新し、Enterでは未保存値でモデル一覧を取得する。blurでは通信・保存をしない。その他のモデル一覧・更新等の通信は既存の明示操作を維持する。

`scripts/settings-url-ui-test.cjs [固定EXE]`はURLの連続入力、確定前の保存/通信抑止、Enter/blurの補正と即時保存、IME、不正URLの保持/修正、各URL欄の共通動作を隔離fixtureで確認する。

`scripts/settings-input-ui-test.cjs [固定EXE]`は本体/Appletの文字・数値・URL、上下キー、IME、複数行、ダイアログ/パスワード、ボイス候補欄、検索の確定・取消と、実行時設定/設定ファイル/revisionが入力中に変わらないことを確認する。

## 関連する設定をまとめて確定するダイアログ

新しい一覧編集は[一覧形式の設定編集UI](settings-list-editing.md)を共通指針とする。AI接続を基準に、適用する場面、操作配置、追加／編集、削除確認、並べ替えと確認項目をまとめている。

AI接続のように複数の項目が密接に関係する設定は、画面内のダイアログに一時入力を持たせ、OKで一つの操作として保存する。これは全体のdirty・保存／破棄を復活させるものではない。共通プロンプト等の通常項目は即時保存を維持する。キャンセル・Escape・画面破棄で入力を破棄し、保存失敗では入力と安全なエラーをそのダイアログに保持する。

本体の共通部品SettingsModalは、設定ページ内のnative dialog、フォーカス囲い込み／復帰、IME対応のEscape、背面のショートカット入力停止／復帰を担う。SettingsDialogはその上で非同期OK・二重実行防止・保存中の閉鎖抑止を提供する。ショートカットとジェスチャーの編集／順序ダイアログもSettingsModalを使う。これは既存設定Surface内のモーダルであり、別WebContentsを横断するShell OverlayHostとは用途を分ける。本体はSettingsPageの操作契約で検証と保存を所有し、本体rendererは一時入力と描画を所有する。

AIのモデル取得は設定ページ専用の操作として未保存の接続・一時キーを受け付ける。Applet/MCPの生成APIへURLやキーの上書きを公開しない。保存は元の接続・キー改訂を確認して最新の他項目へ合成し、SettingsStoreのrevisionと原子的書き込み、関連データのcommit/rollbackを使う。並べ替えは元ID列を検査し、保存後の順序だけを置換する。

## ヒントと一時表示

`host.showHints`は既定trueで、表示ページの「共通」カードから即時保存・反映する。既存設定の欠落時だけtrueを補い、保存済みfalseは保持する。設定定義から`appdock.settings.showHints.on`、`.off`、`.toggle`を生成する。保存分類は他の表示設定と同じ端末専用とする。

説明・補足情報はレイアウト部品の`description`/`hint`へ渡す。内容の使い分けは[共通レイアウト指針](settings-ui-guidelines.md#説明補足情報)を正本とし、`SettingsHint`を使用する案内や個別配置の実装例は設けない。

ヒント表示設定の共有には、`src/renderer/settings-ui/SettingsHints.tsx`内の`SettingsHintsContext`と`useSettingsHints()`を使う。各画面で設定を読み直したり、`muted`や`small`をまとめて非表示にしたりしない。本体の設定ページモデルはページ値とは別に現在の`showHints`を渡し、`SettingsPage`のContextから全体設定・個別Applet設定・portal内のダイアログへ適用する。ヒントの見た目と表示制御は共通部品側で管理する。

`SettingsSection`/`SettingsField`の`hint?: string`は、空白を除いた内容があるときだけタイトルのすぐ右に丸付きの「？」を表示する。`description?: ReactNode`と併用できる。タイトルなしのセクションにはアイコンを表示しない。ヒントOFF時にはアイコン・ツールチップ・その参照をまとめて取り除き、入力欄やdescriptionは保持する。表示の切り替え用の設定や保存形式を追加しない。

```tsx
<SettingsField
  title="読み上げ速度"
  hint="1倍が標準速度です。"
  description={`現在の速度: ${speed}倍`}
>
  {/* 入力部品 */}
</SettingsField>
```

共通`SettingsHintIcon`がhover・Tabでのフォーカス・クリックでツールチップを表示し、Escape、フォーカス離脱、外側のクリック、画面のスクロール/サイズ変更で閉じる。Escapeは最初にツールチップだけを閉じ、編集ダイアログの取消へ伝播させない。アイコンのクリック・Enter・Spaceで折りたたみセクションを開閉しない。見出し名にはアイコンの操作ラベルを混ぜず、アイコン自身に「項目名のヒント」のアクセシブルな名前と`aria-describedby`を付ける。

ツールチップは既存の候補選択部品と同じnative popoverのtop layerへ表示する。ダイアログ/スクロール領域に切り取られず、画面端では左右位置と上下の表示方向を調整し、長文は折り返す。アイコンからツールチップへポインターを移しても読める状態を保つ。各画面で独自のアイコン・ブラウザー標準title・非表示制御を追加しない。

入力方法・単位・空欄や既定値の意味も、理解や判断に必要かどうかを基準に表示先を選ぶ。外部送信・料金・認証、接続切断、再登録/再起動などの重要な注意は、常時表示する`description`や用途に合った共通の警告・エラー表示で扱う。任意の補足と重要な注意が混在する文章は分ける。

本体の`SettingRow`も同じ共通部品を使う。明確な補助説明をhintへ渡し、起動状態の明示descriptionやUAC・描画設定の再起動に関する注意は保持する。検索カタログのdescriptionは検索用メタデータとして引き続き利用する。Applet manifestや宣言型一覧のdescriptionは提供元の機能説明・ラベルとの関連付けを含むため、自動でhintへ読み替えない。共通のページ表示・起動待ち時間など、本体が所有する補助説明だけを個別にhintへ渡す。

通知種類カタログのdescriptionは各通知カードの`hint`へ渡し、エラー通知・警告通知を含めてタイトル横の「？」から表示する。通知先・表示時間・読み上げ等の現在の設定要約はカードの`description`に残す。実際の警告状態、必要な通知先の固定表示、接続不足やエラーの表示はヒントOFFでも保持する。

ヒントIDを`aria-describedby`で参照する共通部品は、`useSettingsHints()`がfalseのとき参照も外す。既存のdescriptionを移すときも共通レイアウト指針で内容を確認し、役割が曖昧な文言や操作に必要なラベルを一括して非表示にしない。

項目のエラーは`SettingsField.error`、セクションのエラーは`SettingsSection.error`へ渡す。複合ウィジェットや非同期操作は`useSettingsFeedback({ error, target, busy, message, onRetry, retryLabel })`を使う。`target`を省略すると親の項目名を使い、共通領域で「対象: メッセージ」に揃える。`SettingsField`はfieldset/legendで項目をまとめ、エラー時は共通エラーIDを`aria-describedby`で参照する。モーダルごとに表示先を分けるため、背後のページへエラーを重複表示しない。

共通領域の進行・正常結果と保存中メッセージは、視覚的な行を増減させずスクリーンリーダーへ通知する。継続して確認する状態は`description`へ渡す。非同期の操作ボタンは[SettingsButton](../src/renderer/settings-ui/SettingsButton.tsx)の`pending`を使い、同じラベル・幅・文字の中央位置を保ってスピナーと無効状態を表示する。アイコンだけの操作は`icon`を指定する。実際の二重送信ガードと取消の可否は既存の処理側でも維持する。これらはヒント表示設定と独立する。

入力確定の常設案内と「このPCに自動保存」の表示は、ヒントON時も表示しない。ジェスチャーの通常右クリックの補足、Webアカウントの削除/クリアの補足は、対応するレイアウト部品の`hint`へ渡す。操作の許可は先頭に「許可の適用とログについて」の折りたたみカードを置き、その下へ権限テーブルをページ直下で表示する。「APIの公開」の外側カードと見出しは設けない。許可不足の補足は先頭の折りたたみ内へ配置する。実際の削除/クリア確認と使用中ガード、許可の不足表示・注意アイコンは引き続き表示・実行する。

## 設定ページの配置と初期表示

本体インデックスは「表示、一般、Applet管理、通知、リボン、タスクトレイ、ショートカット、マウスジェスチャー、カスタムコマンド、Webアカウント、操作の許可、TTS、AI、MCPサーバー、MCPクライアント、バージョン情報・更新」の順とする。表示名だけを変更し、既存のページID・保存先・検索結果の移動先は保つ。画像ライブラリーは独立ページのため、このインデックスには追加しない。

操作の許可は「Applet」「MCP」の2列で表示する。MCP連携の状態カード・設定への移動ボタン・即時保存の案内は表示しない。許可不足の状態、エラー、情報取得の固定ON、注意アイコンと保存の処理は維持する。ショートカットとジェスチャーの一覧上部にも、クリック編集と＋追加の定型案内は表示しない。

表示ページは「共通」カードにテーマ・アクセントカラー・ヒントの表示を配置し、その下の「Shellの変更」カードで領域ごとのShellを選ぶ。Shellの各選択欄に同一のdescriptionを繰り返さない。一般ページは見出しなしの「音の再生」トグル、ウィンドウ、スタートアップ、Applet・MCPからの操作、設定ファイルの順に表示する。音の再生は既定ONで即時保存・反映し、設定定義からON/OFF/切り替えのコマンドを生成する。通知ページは受け取り方、読み上げ、提供元グループの順とし、受け取り方と各通知種類は既定で折りたたむ。読み上げページの接続カードは「TTS接続先」とする。ジェスチャーの有効化は単独のトグルにし、動作設定を既定で閉じた共通カードに配置する。通知種類の見出しには現在の通知先・表示時間・読み上げON/OFFを表示する。折りたたみ状態は画面内だけで保持し、設定ファイルへ項目を増やさない。検索で項目を選ぶと必要な親カードを開く。

表示→共通の先頭に表示言語を置き、日本語だけを選べる。`host.language`は端末専用、既定`ja`。翻訳範囲・追加規則は[表示言語と翻訳](localization.md)を参照する。

新規設定のhost.themeはlight、host.accentColorはmint、gestures.enabledはtrue。保存済みの明示値は上書きしない。通知自体のOFF設定は廃止し、旧host.notificationsと通知種類のenabledは読込時に破棄する。

## 登録画像

画像登録は設定保存から独立した共通ライブラリー操作。Appletは`registered-image`、object-listは同型フィールドと`list.imageKey`を宣言する。プロフィール専用保存・設定ページは持たない。入力と選択の契約は[共通画像](registered-images.md)を参照する。

## Applet管理と個別の更新元

管理ページはJSON・保存先切り替え・ページリセットを提供しない。個別Appletの更新元は従来の共有保存分類を保って個別設定へ配置し、フォーム／JSONとページリセットの同じ投影へ含める。更新元が未指定ならmanifestを継承し、空文字の無効化と保存済み値を保つ。

## 統合後の構成

```text
本体renderer
  SettingsPage（全体設定／Applet詳細で共用）
    SettingsIndex（全体設定のみ）
    SettingsPageLayout・SettingsForm・各設定ページ
    settings-uiの入力／一覧／ダイアログ部品
    SettingsViewClient（本体用transport）
          │ 本体preloadの設定ページ専用IPC
main      ▼
  SettingsPageSession（Shellから独立）
    SettingsInputSession → 既存検証／保存処理 → SettingsStore
    settingsPageAuxiliary／settingsPageActions → 既存機能サービス
```

設定画面のためのWebContentsView、独立HTML、Shell提供元、ready待機、Default Shellへの復旧は持たない。本体の通常のReactツリーへ描画し、既存の本体ウィンドウ・テーマ・ナビゲーションを使用する。

### ファイル配置

| 現在 | 統合後 | 方針 |
| --- | --- | --- |
| `src/shared/settings-ui/*` | `src/renderer/settings-ui/*` | 全ファイルを移動。相対importとCSS参照も更新 |
| `shells/default/settings/*.tsx` | `src/renderer/settings/*.tsx` | SettingsForm、SettingsIndex、SettingsPageLayout、各ページ・編集ダイアログを移動 |
| `shells/default/settings/runtime.ts` | `src/renderer/settings/runtime.ts` | 入力キュー等を再利用し、transportを本体用へ変更 |
| `shells/default/settings.tsx` | `src/renderer/settings/SettingsPage.tsx` | Reactコンポーネントへ変換。createRoot、window宣言、Shell接続・ready・境界フォーカス処理を除く |
| `shells/default/settings.css` | `src/renderer/settings/settings.css` | 本体へ取り込み。設定画面のルート内へスタイルを限定 |
| `shells/default/settings.html` | 削除 | 独立HTMLのビルド・配布を終了 |
| `src/shared/settings-page.ts` | 同じ場所 | mainと本体preload/renderer間の型として再利用。Shell公開型との接続を外す |
| `src/shared/settings-editing.ts`・`settings-catalog.ts`等 | 同じ場所 | Reactに依存しない型、定義、検索・投影処理は共通側に保持 |
| `src/main/core/settings-page.ts` | 同じ場所 | 本体設定ページのセッション |

settings-uiのapi.tsxは本体内部の制御依存として扱う。現在は別documentにある2つの`configureSettingsControls`が、統合後に同じグローバルを書き換える構造を残さない。`SettingsControlsProvider`と`useSettingsControls`によるReact Contextへ変更し、本体ルートでは既存DockApi、SettingsPage配下ではそのSettingsViewClientのcontrolsを渡す。部品の利用側はContextから取得する。設定フォームの操作は発行済み操作IDを通し、本体の他画面は設定画面の表示有無に依存させない。

ui-icons等、他Shellも利用する素材はsharedに残す。settings-uiという名前だけを理由に、設定スキーマや共通操作APIまでrendererへ移さない。

### 本体専用の設定ページbridge

本体preloadのDockApiへ`settingsPage`を追加する。以下は本体の内部APIで、Applet/MCPには公開しない。

| 操作 | 役割 |
| --- | --- |
| `open(request)` | fullまたはappletの表示を登録し、接続IDと初回モデルを返す |
| `get(connectionId)` | 現在の接続に対する最新SettingsPageModelを取得 |
| `act(connectionId, action)` | 既存SettingsPageActionを検証し、モデルと結果を返す |
| `close(connectionId)` | 対象接続を閉じ、記録中入力等の表示に付随する処理を解放 |
| `onChanged(callback)` | 接続ID付きでモデルの更新を受け取る |

接続IDはmainが発行し、開き直した画面へ使い回さない。これはShellの接続ID・提供元IDとは独立する。mainは1つのアクティブな設定ページを管理し、全体設定とApplet詳細を同時にmountしない。新しいopenは既存の入力受付を待った後に古い接続を失効させる。SettingsPageSessionは既存の`settingsNavigation`、`settingsEditing`、補助情報生成と操作関数を再利用する。rendererは購読を登録してからopenし、接続IDとrevisionで初回snapshotと更新通知の順序を判定する。

- 送信元は既存の`dock:*`ハンドラーと同じ本体webContents・mainFrame・hostDocumentUrl検査で限定する。
- open時に本体の現在routeと表示対象を検査する。Applet詳細は選択中のAppletとpageIdの所有者を照合し、full用の検索・ページ選択を許可しない。
- get/actは接続IDと現在の表示文脈を照合する。closeは画面遷移後もその接続IDの解放だけを許し、新しい接続へ作用させない。古い画面の操作・応答は新しい画面へ適用しない。
- sessionId/editRevision、操作ID、ページの許可範囲、発行済みactionId、入力サイズの既存検査を維持する。
- アカウント認証、APIキー、任意のURL実行等を別の汎用口として追加しない。既存の機能サービスを通す。
- Shell側のpreloadへこのbridgeを追加しない。エラー記録には入力値・認証値を含めない。

SettingsPageModelの選択ページ単位の投影と補助情報は維持する。Shellへの公開が終わっても、全Settingsを渡して画面内で自由に保存する構造へ置き換えない。schemaVersion:2は既存内部モデルの形式として当初維持できるが、Shell向け互換性の保証とは分離する。

SettingsPageSessionは本体の他ページの要求・モデルに依存しない形へ変え、SettingsPageRequest/Action/Modelを直接受け取る。changed、release等の依存は本体側から渡す。

### 入力キューと寿命

SettingsViewClientのtransportを注入可能にし、本体専用の上記bridgeを使う。最新モデルの取得、自己操作だけのbefore更新、外部競合の拒否、失敗入力の画面内保持は再利用する。長時間操作は入力キューを占有せず、取消操作を受け付ける。

本体のuseSettingsEditorは、Applet一覧・ショートカット等に必要な既存の編集口として整理する。同じ設定フォームの入力をuseSettingsEditorとSettingsViewClientの両方から送らない。両者は同一SettingsInputSessionへ接続し、全体設定の選択・再起動時復元・プロフィール等への移動要求も、その正本のpageIdへ集約する。

既存の本体入力flushの受付に、表示中SettingsViewClientのflushを登録する。ナビゲーション、対象変更、再起動等の前に既存キューを待ち、flushの通信失敗または3秒の期限超過では遷移を成立扱いしない。保存できない入力を自動再送しない。すでに検証・保存の結果が返った失敗入力と、受付完了を確認できないflushを区別する。不正JSON等の画面内入力は既存方針どおり、ページ移動を禁止せず破棄する。

flushはすでに送信を受け付けたキューを待つもので、全体保存ではない。キュー内のact/editSettingsから、その同じキューのflush応答を待つ循環を作らない。旧`dock:flushSettings`、editSettingsのselect-page/mode/reload時のShell flush、およびNavigationCoordinatorの待機順を併せて見直す。

画面終了時には検索移動のobserver、購読、ショートカット記録、一時ダイアログ、キャンセル対象のパレット等を既存release処理で解放する。古いclose通知で新しい接続を閉じない。本体renderer再読込時は全接続を無効にする。

## 表示と操作の維持

- 全体設定は左インデックス・横断検索と右本文、Applet詳細は同じ右本文のみを表示する。
- 未導入・停止・無効Appletの扱い、宣言型のsettingSections/settings/actions、WebAppletの動的一覧を維持する。設定を開くだけでAppletを起動しない。
- 部分JSON、外部変更、原子的保存、PC専用権限、Webアカウントの参照検査はそのまま機能サービスで扱う。
- 入力途中の数値・URL・不正JSON、IME、Enter/blur/Escape、候補欄、フォーカス復帰、一覧の並べ替えを維持する。
- native dialogが同じ本体documentへ移ることを踏まえ、背面の操作とローカルショートカットの抑止、実行中の重複操作防止を確認する。
- Shell向けTab境界IPCとショートカット転送は設定から外す。本体documentのTab順序・既存のショートカット経路を使い、1回の入力を二重に実行しない。
- 設定CSSのhtml/bodyへの指定を本体全体へ持ち込まない。既存の本体テーマを継承し、初期表示時の別テーマ適用を行わない。
- 本文の独立View用の高さ・座標計算は使わず、flex/min-height/overflowで利用可能な本文領域を使う。狭幅、スクロール、検索項目移動、左一覧幅の既存状態を維持する。
- `--restore-view`の設定カテゴリ・Applet詳細タブ復元を維持する。カテゴリ更新だけで復元成功とせず、対象本文の描画まで確認する。
- 設定を開くコマンドIDと既存ナビゲーションの入口は維持する。Shell提供元に依存せず、safe-shellでも本体の共通設定を開く。

## 決定

- 設定JSONは既定値との差分を表す。項目の省略は「現在の版・現在のApplet宣言の既定値を使う」を意味する。将来の版で既定値が変われば、省略した項目は新しい値に従う。
- フォームには実際に適用する値を表示し、JSONモードには既定値と異なる値だけを表示する。全項目が既定値なら、そのページのJSONは`{}`となる。
- フォーム・JSON・設定コマンド等の共通保存経路で既定値を省く。既定値の補完は読み込み・実行時だけ行い、補完した値をそのままファイルへ戻さない。
- ページのリセットと、PC用設定を削除して共有へ戻す操作を分ける。前者は既定値、後者は現在の共有値を使う。

## 既定値と比較単位

本体は既存の設定スキーマ、Appletは宣言済みsetting.default、startupDelaySeconds、pagesのdisplayを正本とする。既定値を別の固定表へ重複させない。宣言が取得できないAppletの設定・未宣言キーには既定値を推測せず、保存済みの値を保持する。

objectは既知の既定値と再帰比較し、差分がなくなった親objectも省く。配列は順序を含む一つの値として比較し、要素単位の差分や番号キーへ変換しない。空配列、false、0、空文字、nullは、それぞれの既定値と一致する場合だけ省く。未知キーは省かない。危険なprototypeキー、型、深さ、サイズの既存検証は維持する。

動的ページのリセットは、そのページに宣言された編集対象フィールドだけを扱う。親の登録一覧、項目ID、他の子ページ、保存先を維持する。子ページで既定値が省略されたフィールドは、親のobject-list内の同名フィールドの既定値を継承する。配列内の登録情報は通常の配列として保持し、既定値との差分表示と必要な登録構造を区別する。設定のリセットで原画像ファイル・session・Secrets等を削除しない。

動的ページの登録行については、宣言されたフィールドの既定値も保存時に省く。登録IDと配列の順序を保ったまま、読込時に親・子の宣言から行の既定値を補い、ページ一覧のドメイン検証へ渡す。これにより子ページのリセット後も将来の既定値へ追従できる。通常の配列の要素削除や部分マージを意味しない。

## JSON編集

JSONを`{}`に置き換えると、そのページの編集対象だけが既定値に戻る。部分的にキーを削除した場合は削除した項目だけが既定値となる。空のテキストや不正なJSONは従来どおり入力エラーとする。

フォーム用の補完済み投影とJSON用の差分投影を分ける。JSON操作のbeforeも差分投影で検査し、既定値を省く表示によって競合検査が緩くならないようにする。ページ外キーは引き続き拒否する。フォーム側では別項目の変更を保持する。

## ページリセット

JSONを持つページのツールバーに「このページを既定値に戻す」を配置し、フォーム・JSONの両モードで表示する。確認にはページ名、対象保存先、共有の場合は他PCにも反映されることを表示する。

リボン設定もこの共通操作へ統一する。配置と動作設定の右クリック割当をまとめて既定値へ戻し、リボン編集の下部には初期化専用ボタンを置かない。公開APIの配置編集`reset`が右クリック割当を保持する契約は維持する。

確認開始時の対象ページ、保存先signature、revision、ページ値を保持し、確定時に再確認する。対象・保存先・値が外部で変わった場合は上書きせず、確認し直せるエラーにする。未確定入力は通常のblurで先に確定し、不正入力が残る場合は修正または再読み込みを案内する。キャンセルでは変更しない。

確定後は既存の検証・prepareSettings・WindowsLaunch・保存経路を通して1回だけ保存し、成功時だけ閉じる。保存先モード、Appletの起動状態、対象外ページ、認証等を維持する。起動設定は既存のOS登録トランザクションを利用する。JSON表示は`{}`となり、再起動後も既定値のキーを再生成しない。

## タッチパッドジェスチャー

touchpad-gesturesページをマウスジェスチャーの下に配置し、先頭の固定幅アイコン欄にタッチパッドの線画を表示します。割り当ては共通4列一覧とダイアログを使います。「動作設定」の直下・同じ階層に既定で閉じた「接続用キー設定」を配置し、F13～F24の選択とCtrl・Alt・Shift・Winのラベル付きチェックボックスを横並びにします。ON/OFF・キー編集・割り当ては即時保存します。フォームによる明示編集とJSON編集・外部受信を区別し、後者はWindowsへ自動反映しません。ページリセットはこのPCをOFFにし、共有割り当てを既定値へ戻します。Windowsと接続試行履歴は保持します。

タッチパッドのフォーム保存が失敗した場合は、画面内に残した未保存値を破棄して取得済みの保存値へ戻し、最新の保存値を再取得します。新規割り当ての拒否では「未割り当て」、既存割り当ての編集拒否では編集前の割り当てを表示します。失敗した入力を含む受付待ちのフォーム編集も破棄し、別の設定変更と一緒に保存し直しません。エラー表示は保持します。JSONや他ページの失敗入力を画面内に保持する契約は変えません。保存後のWindows反映だけが失敗した場合は、実際に保存できた値を表示します。

詳細は[タッチパッドとWindowsの接続仕様](touchpad-gestures-design.md)を参照してください。
