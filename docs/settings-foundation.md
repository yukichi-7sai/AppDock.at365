# 設定基盤と本体の共通設定画面

設定画面は本体rendererで描画し、すべてのShellで共通とする。[本体統合の設計](settings-host-ui-design.md)に従い、設定UIはsrc/renderer/settingsとsettings-uiへ集約した。

0.57.0以降のApplet単位の共有／端末専用設定、ツールバーとJSON・ファイル操作の連動、本体の表示／一般設定・有効状態の保存分離は[端末別設定](device-settings-design.md)を参照する。表示・一般の同じチェックボックスはチェック済み・操作不可とし、Appletでは切り替え可能にする。共有・自端末の合成値と共通revisionをDeviceSettingsStoreから取得する。

全設定は変更の確定時に検証して即時保存する。文字・数値・URL・JSONは入力中に設定へ送らず、blurまたはEnterで確定する。正本は保存済みSettingsStoreの値とrevision。共有ドラフト・dirty・全体保存/破棄・未保存通知・mainの途中入力と画像バッファは撤去した。

## 保存と入力

SettingsInputSessionは選択ページ・フォーム/JSONモード・sessionId/editRevision・pending・512操作の再送結果だけを持つ。snapshot.valueはStoreから取得し、別の値を保持しない。SettingsPageSessionは選択ページだけを投影する。useSettingsEditorとSettingsViewClientは入力キューと購読を担う。

フォーム、部分JSON、通知方針、並び順、リボン、トレイは妥当な変更ごとにprepareSettings/LaunchSettings/saveUserSettings/SettingsStoreへ保存する。宣言済みApplet設定の検証、expectedRevision、Windows登録とJSONのトランザクション、原子的置換を維持する。正常保存時に配送・実行状態を更新し、通常の保存成功通知を出さない。PC専用権限とWebアカウントは各既存サービスを維持する。

要求はbefore/valueを持ち、mergeSettingsInputが変更したフィールドだけを現在値へ統合する。未編集フィールドの外部変更を保持し、同じフィールドの外部変更は拒否する。配列は順序/IDが重要なので全体で比較する。UIキューの直前成功結果だけを後続の基準へ使い、外部変更/失敗を黙って再試行しない。操作送信前に最新モデルを取得して購読の到着遅れを補い、入力のbeforeは保持して競合を検査する。古いView入力はsession/editRevisionで拒否する。

文字・数値は共通のSettingsInput/SettingsTextarea内に保持し、blurまたはEnterで一度だけonChangeへ渡す。Enter後のblurや繰り返すEnterでは同じ入力を再送しない。Escapeはその欄の未確定入力を確定前の値へ戻し、後のblurでも保存しない。数値の上下キーも画面内の現在値へ作用し、確定まで保存しない。複数行はEnterで確定、Shift+Enterで改行する。IME変換中のEnter/Escapeを確定・取消へ使わず、フォーカス中のcompositionendだけでは設定へ送らない。変換中にblurした場合はcompositionend後に一度確定する。trim等で連続入力の空白を消さず、別の正規値への外部変更は表示へ反映する。不完全な数値、不正JSON、検証違反、保存失敗は現在のUIだけで入力とエラーを保持し、Storeや通知に保存しない。修正した入力で再検証/保存する。「設定を再読み込み」は現在ページの入力を保存値へ戻し、保存済み変更は巻き戻さない。通常のクリック移動はblurで確定し、blurを経ないView破棄では未確定入力を破棄する。再起動で途中入力を復元しない。

検索欄は入力中の絞り込みを維持する。追加・編集ダイアログはSettingsInputModeのinputモードで一時入力だけを更新し、Enter/blurで欄の確定点を更新、Escapeでその欄を戻す。変更のある欄のEscapeはダイアログへ伝播させず、欄の変更がないEscapeは従来どおりダイアログを取り消す。明示ボタンで設定するAPIキーや接続ポート、試験生成の入力も、inputモードのローカル入力と実操作を分離する。設定の保存は従来のOK/適用操作で行う。URLはこのモードでも確定まで補正・検証しない。

画像は選択/削除時に即時保存する。画面内で非同期読込の後、saveUserSettingsがPNG/JPEG、5MiB、寸法・元ファイル名・同名別画像を検査し、原画像と参照を保存する。draft-avatar URL、mainのbytes/プレビュー/変更フラグ、画像読込状態IPCを削除。登録済み原素材と保存失敗時の既存保持方針は[設定同期](settings-sync.md)。

ショートカット・ジェスチャーの編集/順序パネルは組合せ入力をパネル内に保持し、「適用」で1回保存する。取消/Escape/×はパネル内だけを破棄する。削除・ON/OFFは即時保存。ID・順序・外部変更検査・記録中の一時的実行抑止を維持し、保存自体で割当コマンドを実行しない。

## 本体の設定ページ契約

SettingsPageModel schemaVersion:2は本体内部の投影モデルとして使用する。DockApi.settingsPageのopen/get/act/close/onChangedを本体のmainFrameだけに提供し、SettingsPageHostが接続ID・route・対象を検査する。Shell Appletへ設定描画bridgeは公開しない。

更新・再起動で画面を復元するときは、保存された表示先だけで接続を開始しない。本体のstartupReadyとnavigation.routeが実際の表示先にそろってから設定を接続する。準備中は読み込み表示とし、対象が変われば接続と検索移動の監視を解放する。全体設定とApplet詳細の両入口で同じ条件を使う。

本体内部モデルは選択ページのvalues/定義/表示用補助情報/不透明な操作IDとsessionId/editRevision/pending/mode/errorだけ。選択ページ以外のSettings/HostSnapshot・他Appletの値を投影しない。dirty/conflict/text/avatarChanged/avatarLoadingを削除した。page-values/partial-textは同ページのbefore投影を必須とし、対象外キーを拒否する。save/discard/avatar-loadingを削除。JSONはUTF-8 1MiB、画像5MiB、検索語512文字。

全体設定とApplet詳細は同じ本文を使い、全体だけ左インデックスを表示する。停止/無効Appletも編集でき、開くだけで起動しない。本体の入力flushはナビゲーション前にuseSettingsEditorとSettingsViewClientのキューを3秒以内で待つ。成功済み値はページ切替/画面再作成をまたいで共有し、不正入力をView間で保持しない。Webアカウント削除は保存済み参照を検査する。

「表示」の部分JSONは`host.theme`と`host.shellProviders`です。8領域の選択・現在の使用先・適用待ちと理由・領域ごとの再試行を表示します。旧単一キーを部分JSONへ混在させた要求は範囲外として拒否します。領域別指定の移行・未知領域保持・旧設定領域の廃止は[領域別割り当て](shell-region-assignment.md)。

## カタログ・JSON・検索

settings-catalog.tsがページ/項目ID・JSON許可範囲・静的検索メタデータを定義する。IDはページIDとキーを個別にencodeURIComponentし、ドット入りID/設定キーはキー配列で扱う。未知の未編集フィールド・未導入Appletを保持する。未設定Appletの部分保存ではenabled:false/settings:{}の行を補完する。無検証マージと変更マーク比較を削除した。JSONは選択ページのみ、Webは対象IDを保つ1行投影の許可フィールドだけを変更する。

検索はNFKC/空白区切りAND、項目名/説明/所属/静的キー・別名・固定選択肢・オブジェクトフィールドを対象にする。入力値/秘密/動的選択肢は対象外。入力だけで右ページを変えず、結果選択でフォーム全体へ移動する。data-setting-itemアンカー、details展開、スクロール/フォーカス/2秒強調、最新移動IDの完了照合を維持する。queryはprimaryのSettingsNavigationStateに保持し、不正JSONは移動を妨げない。対象消失時は結果更新/右を利用不可にする。

## 共通の画面構成

本体の設定ページは`SettingsPageLayout`（`src/renderer/settings/SettingsPageLayout.tsx`）へタイトル・説明・ツールバー・本文を渡す。ページ側で同じ見出しを重ねない。フォーム/JSONの切替と共通の操作欄を上部に固定し、間隔を置いた本文だけをスクロールする。Applet詳細でも同じ本文部品を使い、ショートカット一覧の内部にタイトル・説明を追加しない。

本文は`src/renderer/settings-ui/SettingsSections.tsx`の`SettingsSection`（カード/詳細折りたたみ）、`SettingsField`（項目名・説明と入力）、`SettingsChoice`（選択カード）、`SettingsFeedback`（処理・結果・エラー）を再利用する。新しいページでは既存の余白・境界・テーマ変数・幅に応じた縦配置を継承し、ページ専用CSSは固有の一覧構造に限定する。カード内のグループ背景には`--settings-group-background`を使い、ボタンの`--raised`や選択状態の色と分離する。入力には`SettingsInput`/`SettingsTextarea`を使い、アクセシブルなラベルを指定する。共通部品は保存や通信を所有しない。

通知のボイス候補は`SettingsCombobox`を使う。入力欄の位置と幅に合わせた同一Surfaceのポップオーバーで、スクロール枠に切られず、下に空きがない場合は上に開く。IDの直接入力・ID/名前による候補絞り込み・クリック・上下キーとEnterでの選択・Escape/Tabでの終了に対応し、IME入力の確定は共通入力部品へ委ねる。取得済み一覧は通知の声・速度や無関係な設定の保存で破棄せず、TTS設定またはAPIキーの変更時に無効化する。取得中に接続設定が変わった場合は古い応答を破棄する。

検索対象の項目に`settingAnchor`を付け、折りたたみの展開と項目への移動を維持する。高度な設定だけを閉じ、主要な設定と状態は最初から表示する。読み上げは接続先→モデルと声→試聴→詳細、通知は受け取り方→読み上げの共通上書き→MCP Eventの接続案内→提供元別の通知種類、Codexは状態と操作許可へのリンク→登録/接続テスト→登録先や接続の詳細を基本構成とする。トレイはクリック動作と右クリックメニューを分離し、バージョン情報は一括更新・本体・Applet・共通更新設定・実行環境を共通カードで配置する。

`scripts/settings-usability-ui-test.cjs [固定EXE]`は共通構成、8ページの明暗テーマと狭い幅、モデル候補・直接入力、通知先と声/速度の継承、隔離したCodex登録/解除を確認する。保存と公開範囲の契約は上記を維持する。

Applet本文は`src/renderer/settings-ui/AppletSettingsForm.tsx`を共通テンプレートとする。manifestの`settingSections`を検証し、設定ページのauxiliaryへ投影する。セクションへ配置されなかった設定・操作も表示し、設定保存/JSONの投影に表示メタデータを混ぜない。設定アンカーは既存のキーのままで、セクションの再配置や折りたたみに依存しない。WebAppletもSettingsSection/SettingsFieldでサイト・表示とページ遷移・アカウント・管理を描画する。

`scripts/applet-settings-ui-test.cjs [固定EXE]`は兄弟Appletの宣言と配布物を隔離配置し、停止したまま全項目の描画・保存・検索・両入口の一致・明暗/狭幅を確認する。コマンドの実行中表示は専用Node fixtureを使い、実壁紙やロック・キー送信は実行しない。最低ホスト版と宣言形式は[Applet API](extensions.md#共通の設定ページ)を正本とする。

URL欄は共通の`SettingsUrlInput`を使い、入力途中のコロン・スラッシュ・不完全なURLを入力欄内に保持する。補正・検証・保存はEnterまたはフォーカスが外れた時だけ行い、Enter後のblurで同じ入力を二重送信しない。IME変換確定のEnterは設定確定として扱わない。AI/TTSのベースURL、WebAppletのURL、本体/各Appletの更新元に同じ動作を適用する。WebAppletの追加許可先は`SettingsUrlTextarea`を使い、Enterで確定、Shift+Enterで改行する。Web側の初期設定取得もURL確定後に行う。AI接続ダイアログではURLの確定はローカル入力だけを更新し、Enterでは未保存値でモデル一覧を取得する。blurでは通信・保存をしない。その他のモデル一覧・更新等の通信は既存の明示操作を維持する。

`scripts/settings-url-ui-test.cjs [固定EXE]`はURLの連続入力、確定前の保存/通信抑止、Enter/blurの補正と即時保存、IME、不正URLの保持/修正、各URL欄の共通動作を隔離fixtureで確認する。

`scripts/settings-input-ui-test.cjs [固定EXE]`は本体/Appletの文字・数値・URL、上下キー、IME、複数行、ダイアログ/パスワード、ボイス候補欄、検索の確定・取消と、実行時設定/設定ファイル/revisionが入力中に変わらないことを確認する。

## 検証と次の範囲

tests/settings-editing.test.cjs・settings-page.test.cjsは即時保存、失敗/競合、再送、範囲を確認する。scripts/settings-shell-ui-test.cjs [固定EXE]は連続入力/IME、画像、不正入力、保存失敗fixture、外部競合、公開範囲、旧旧設定Shell指定の無視・他領域の継続と再起動を確認する。settings-search/navigation/shortcuts/gestures/ribbon/tray/notification-settings/syncと実Windows起動タスクの関連回帰はVERIFICATIONを参照する。

settings-notice-ui-test.cjsと発行元は廃止した。汎用notification-banner-ui-test.cjsは通知基盤の回帰として維持する。通知基盤の段階1〜5と即時保存移行は今回で完了。新通知種類、履歴の機能拡張、一般の複数Window/MCP通知発行は別途の依頼範囲とする。

## 関連する設定をまとめて確定するダイアログ

新しい一覧編集は[一覧形式の設定編集UI](settings-list-editing.md)を共通指針とする。AI接続を基準に、適用する場面、操作配置、追加／編集、削除確認、並べ替えと確認項目をまとめている。

AI接続のように複数の項目が密接に関係する設定は、画面内のダイアログに一時入力を持たせ、OKで一つの操作として保存する。これは全体のdirty・保存／破棄を復活させるものではない。共通プロンプト等の通常項目は即時保存を維持する。キャンセル・Escape・画面破棄で入力を破棄し、保存失敗では入力と安全なエラーをそのダイアログに保持する。

本体の共通部品SettingsModalは、設定ページ内のnative dialog、フォーカス囲い込み／復帰、IME対応のEscape、背面のショートカット入力停止／復帰を担う。SettingsDialogはその上で非同期OK・二重実行防止・保存中の閉鎖抑止を提供する。ショートカットとジェスチャーの編集／順序ダイアログもSettingsModalを使う。これは既存設定Surface内のモーダルであり、別WebContentsを横断するShell OverlayHostとは用途を分ける。本体はSettingsPageの操作契約で検証と保存を所有し、本体rendererは一時入力と描画を所有する。

AIのモデル取得は設定ページ専用の操作として未保存の接続・一時キーを受け付ける。Applet/MCPの生成APIへURLやキーの上書きを公開しない。保存は元の接続・キー改訂を確認して最新の他項目へ合成し、SettingsStoreのrevisionと原子的書き込み、関連データのcommit/rollbackを使う。並べ替えは元ID列を検査し、保存後の順序だけを置換する。

## ヒントと一時表示

`host.showHints`は既定trueで、表示ページの「共通」カードから即時保存・反映する。既存設定の欠落時だけtrueを補い、保存済みfalseは保持する。設定定義から`appdock.settings.showHints.on`、`.off`、`.toggle`を生成する。保存分類は他の表示設定と同じ端末専用とする。

消してよい操作説明は`src/renderer/settings-ui/SettingsHint.tsx`を使用する。各画面で設定を読み直したり、`muted`や`small`をまとめて非表示にしたりしない。本体の設定ページモデルはページ値とは別に現在の`showHints`を渡し、`SettingsPage`のContextから全体設定・Applet詳細・portal内のダイアログへ適用する。見た目は`settings-hint.css`を正本とし、画面別クラスは必要な配置・余白に使う。

```tsx
import { SettingsHint } from '../settings-ui/SettingsHint';

<SettingsHint>入力後にEnterで確定します。</SettingsHint>
```

インラインには`as="span"`、小さな補足には`as="small"`を使用できる。ヒントIDを`aria-describedby`で参照する部品は、`useSettingsHints()`がfalseのとき参照も外す。カード・項目のdescription、現在値、警告・エラー、操作に必要なラベルをヒントへ自動変換しない。manifestのdescriptionも現状維持とし、役割が曖昧な文言は個別対応する。

共通`SettingsFeedback`の進行・正常結果と、保存中メッセージは視覚的な行を増減させず、スクリーンリーダー向けの通知として扱う。ボタンの無効化、二重実行防止、処理状態、エラー表示は維持する。この一時表示の整理はヒント表示のON/OFFと独立する。

入力確定の常設案内と「このPCに自動保存」の表示は、ヒントON時も表示しない。ジェスチャーの通常右クリックの補足、Webアカウントの削除/クリアの補足、操作許可の即時保存の案内は`SettingsHint`とする。許可不足の補足は末尾の「許可の適用とログについて」の折りたたみ内へ配置する。実際の削除/クリア確認と使用中ガード、許可の不足表示・注意アイコンは引き続き表示・実行する。

## 設定ページの配置と初期表示

表示ページは「共通」カードにテーマとヒントの表示を配置し、その下の「Shellの変更」カードで領域ごとのShellを選ぶ。Shellの各選択欄に同一のdescriptionを繰り返さない。一般ページは見出しなしの「音の再生」トグル、ウィンドウ、スタートアップ、Applet・MCPからの操作、設定ファイルの順に表示する。音の再生は既定ONで即時保存・反映し、設定定義からON/OFF/切り替えのコマンドを生成する。旧PC専用データの確認は警告通知から本体ログを開く。通知ページは受け取り方、読み上げ、提供元グループの順とし、受け取り方と各通知種類は既定で折りたたむ。読み上げページの接続カードは「TTS接続先」とする。ジェスチャーの有効化は単独のトグルにし、動作設定を既定で閉じた共通カードに配置する。通知種類の見出しには現在の通知先・表示時間・読み上げON/OFFを表示する。折りたたみ状態は画面内だけで保持し、設定ファイルへ項目を増やさない。検索で項目を選ぶと必要な親カードを開く。

新規設定のhost.themeはlight、gestures.enabledはtrue。保存済みの明示値は上書きしない。通知自体のOFF設定は廃止し、旧host.notificationsと通知種類のenabledは読込時に破棄する。
