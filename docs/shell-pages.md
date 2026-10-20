# Shellのページ表示

ホーム・ログ・通知センターは共通の本文契約を使います。設定画面はShell対象外であり、[設定基盤](settings-foundation.md)を参照してください。

ページViewはリボン・ステータスバー・ホスト通知を除く本文領域全体に配置します。ホストは最大幅や外側余白を付けず、Shellが内部の余白・スクロールを管理します。Appletのログは共通ログViewへ移動してsourceで絞り込みます。設定・Applet管理は本体rendererで描画します。寸法報告とページ別の配置は[Shellページのレイアウト](shell-page-layout.md)を参照してください。

WindowとページViewのネイティブ背景は現在のテーマに合わせ、View生成時から設定します。表示待ちのViewもテーマ更新の対象です。Default Shellは読込時に`prefers-color-scheme`を初期値とし、公開モデルを受け取ったら`dark`を同期的に適用してから`ready`を通知します。別Shellも初回表示前にモデルのテーマを適用してください。透明なオーバーレイやリボンの描画契約は変更しません。

全体のログページ・Applet管理から対象を指定して開く共通ログ・WebApplet管理のログタブはDefault Shellで描画する。本体rendererにログの描画は残さない。既存の起動後500件、Applet/source・レベル・文字検索、保存先を開く操作、ファイルの1MBローテーションは維持する。過去ファイルの閲覧、日付フィルター、保存期間変更は未実装。

## 部分差し替え

ログを差し替える通常Appletへ`shell` capabilityと次の宣言を追加する。`minimumHostVersion`は`0.26.42`以上。通常のコマンド・設定・ページと併用できる。

```json
"shell": {
  "apiVersion": 1,
  "views": { "page.logs": "logs.html" }
}
```

`host.shellProviders["page.logs"]`は全体・Appletで絞ったログ・WebApplet管理のログ本文へ共通適用します。未提供・無効・未導入・故障ではこの領域だけDefault Shellを使い、設定値とControllerの条件を保持します。ホーム・設定・通知センターには別の提供元を指定できます。リボンとパレットの実装は不要です。一般Appletの複数Window・同一領域の同時多重表示は未対応です。

## 責務と寿命

| 部分 | 責務 |
| --- | --- |
| `HostLog` | ログの記録、起動中の直近500件、既存ファイル保存 |
| `HomePageSession` | ホーム用の統計・ピン・カード、表示順の投影、操作ID・可否 |
| `HomeCommandExecution` | Window内で共有するホームの実行中・結果・通知。通常コマンド実行経路へ委譲 |
| `LogPageSession` | 表示対象、検索条件、表示モデル、操作の検証。表示用のコピーだけを公開 |
| `ShellPageHost` | primary本文の1枠、提供元選択、遅延生成、ready、寸法・zoom、IPC送信元、表示順序、復旧、破棄 |
| 本体の`ShellPageSlot` | 空の表示枠、領域報告、Tabによるフォーカス移動。本文UIを持たない |
| Default Shell / Shell Applet | 見出し、検索・絞り込み、一覧、エラー表示 |

ページは非モーダルで、設定通知と共通オーバーレイより下に置く。ページ上からも共通ショートカットが使え、検索欄の通常入力やIMEは描画が扱う。Tab/Shift+Tabは本体の前後の操作へつなぐ。Windowの非表示・最小化ではViewを隠し、復帰後は同じセッションを表示する。ページ・詳細タブ・対象Appletの変更、所有rendererの再読込・終了ではViewとタイマーを回収する。別ページへの遷移で他Appletの既存Viewや保存済み設定を変更しない。

本文の表示モデルと操作は`ShellPageController`に分離する。次のページを追加するときは、機能サービスと公開モデル/操作を定義し、内容ControllerとShell描画を追加する。ページ固有の検索や業務判断を`ShellPageHost`へ追加しない。Default Shell専用の分岐や内部importを設けず、双方を同じmanifest・loader・bridgeで起動する。

## ホームの契約

ホームはminimumHostVersion `0.26.43`以上で`views: { "page.home": "home.html" }`を宣言する。ホームだけを提供でき、未提供のリボン・パレット・ログはDefault Shellを使う。Default Shellのホームも同じloaderと`window.appdockPage`経路で起動する。

`ShellPageModel`と`ShellPageRequest`はkindによる判別union。ホームモデルは`schemaVersion:1/id/contextId:primary/kind:home/revision/dark/content`。表示変更だけでrevisionが進み、本体の60ms集約通知で同じViewへ配信する。

- `stats`: running/errors/applets/commands。組み込みDefault ShellはApplet数・カードから除外し、コマンド数は従来のGUIカタログ全件数。
- `pins`: 保存済みピンの順に並べたid/title/extension/available/actionId。カタログにないピンは設定から削除せず表示を省略する。
- `applets`: id/title/description/state/runtime/version/actionId。名前・状態・版は本体の現在値から投影する。
- `actions`: palette/logs/appletsの操作ID。`busy/error/message`は本体Controllerが所有する実行状態と結果。

`act({ id, type: 'invoke', actionId })`は本体が発行した不透明IDだけを受け付ける。実行直前に現在のピン・Applet・コマンド可否を再照合し、旧ページ、消失済み項目、任意コマンドID、実行中の重複コマンドを拒否する。既存の`executeCommand`経路と共有ナビゲーションに接続し、成功・失敗をモデルへ反映する。成功通知は従来同様3.5秒で消える。実行中もカード・ログ・一覧・パレットへの移動は可能で、画面を開くだけの操作は実行中状態や結果を上書きしない。表示を閉じても受付済みのコマンドを巻き戻さない。

設定の正本はSettingsStore。HomePageSessionは保存済みappletOrderを読み取り、全設定・全HostSnapshot・保存機能をホームShellへ公開しない。ピンは従来どおり保存済み設定から取る。

ホームControllerと公開表示モデルは編集状態の所有者にならない。設定も同じ編集サービスを利用する。

提供元切替・故障復旧では同じControllerと操作ID・順序投影・実行状態を保持する。ページを離れるとControllerの操作IDとViewを破棄する。実行中の状態はWindow内のHomeCommandExecutionで保持し、ホームへの戻り直しでも重複受付を拒否する。コマンドの成功は画面に依存せず本体のインフォメーション通知へ送り、Default Shellのhome-resultと本体toastは表示しない。失敗の画面内説明は維持する。互換用モデルのmessageとタイマーは維持し、タイマーはWindow終了時に回収する。内容の更新はControllerの任意`update`、解放は任意`dispose`へ委譲し、ShellPageHostはホームの内容を解釈しない。

## 公開bridge

型の正本は[src/shared/shell-pages.ts](../src/shared/shell-pages.ts)。HTMLには`window.appdockPage`を公開し、Nodeや`window.dock`は渡さない。

1. `onChanged(callback)`を登録し、`connect()`から`sessionId/providerAppletId/snapshot`を取得する。
2. snapshotを描画してから`ready(sessionId)`を呼ぶ。
3. `act({ id, type: 'filters', filters: { source, level, text } })`で絞り込む。`level`は`all/info/warn/error`。
4. `act({ id, type: 'open-directory' })`は本体管理のログ保存先を開く。任意パスは受け取らない。
5. `getSettings/onSettingsChanged/executeCommand`は他のShell領域と同じ自己設定・自己登録コマンドの契約。任意の他Appletコマンド実行には使えない。
6. `onFocus`で先頭/末尾のコントロールへ移り、端のTabでは`focusHost('before'|'after')`を呼ぶ。`shortcut(key)`は本体の共通キー割り当てに従う。実行先をShellから指定しない。

ログモデルは`schemaVersion:1/id/contextId:primary/kind:logs/revision/dark/content`。同じ`id`では古いrevisionを無視する。`content`は`scope/filters/sources/entries/limit`を持ち、entriesは本体が絞り込んだ記録順の配列。現在のDefault Shellは従来どおり新しい順で描画する。

`scope.type`が`all`ならsourceを選択できる。`applet`なら`scope.id`に固定し、`web`なら`web.*`と`web-applets`に固定する。詳細画面からsourceを広げる操作は拒否する。提供元Applet自身のIDと、ログの表示対象AppletのIDは別物として扱う。全体ページのsource選択は既存の再起動時表示状態へ反映する。文字検索とレベルはそのページの寿命に従い、提供元切替・復旧では保持し、ページを離れると終了する。

WebContents・main frame・登録URL・現在route・readyを照合し、旧ページIDの操作を拒否する。新しい表示枠の後に届いた古い枠のcloseは無視する。ログの本体snapshot契約は既存互換のため維持するが、Shellへ全設定や認証状態を渡さない。MCP/worker向けのログ照会APIは提供していない。

## 復旧

ready期限は10秒。読込失敗・renderer終了/応答不能では同じControllerを使ってDefault Shellへ復帰する。検索条件と対象を保持し、リボンやパレットの提供元は変更しない。同じ領域・提供元・版の故障はプロセス中に記憶し、「Shellを再試行」または提供元の新版で再試行する。意図的な無効化・再起動は故障扱いにしない。

表示中のShell選択変更はページにも反映する。`--safe-shell`ではDefault Shellへ固定する。Default Shellも使えない場合は本体から最小ネイティブ通知を出し、設定にあるShell再試行などの操作を残す。第二のホーム・ログ描画は作らない。

## 検証

`tests/home-page.test.cjs`は限定モデル・順序・変更revision・可否再検査・古い操作・重複防止・終了時回収を確認する。`scripts/shell-home-ui-test.cjs [固定EXE]`はホームのみの差し替え、保存済み設定、変更通知、実行結果、実行中の故障復旧、ready期限、safe起動、テーマ、リサイズ、zoom、フォーカスを確認する。

`tests/log-page.test.cjs`は絞り込み・範囲固定・500件・revision・古い操作の拒否を確認する。`scripts/shell-page-ui-test.cjs [固定EXE]`は全体/詳細/Web管理・部分差し替え・自己コマンド/設定・復旧・ready期限・safe起動・テーマ・寸法・フォーカスを隔離profileで確認する。既存navigation、Shell、overlay、settings-shellの回帰も影響範囲に含む。実行結果と未確認事項は[VERIFICATION](../VERIFICATION.md)へ記録する。

## 設定画面との境界

設定画面は本体rendererの共通UIであり、ShellPageRequest/Model/Actionの対象外とする。全体設定と個別Applet設定は本体のSettingsPageSession・SettingsPageを共用する。投影、検索、即時保存、入力flushは[設定基盤](settings-foundation.md)を参照する。旧page.settings指定とmanifestは互換入力として保持・読込するが、設定用HTMLは起動しない。

## 通知センター

minimumHostVersion:0.31.0以上のShellはshell.viewsのpage.notificationsへ本文HTMLを指定できます。kind:notificationsのモデルと通知専用actionを同じwindow.appdockPageから取得します。モデル・署名は[notification-center.ts](../src/shared/notification-center.ts)、状態/保存/操作の契約は[通知設計](notification-foundation.md#段階3-通知センター)を参照してください。getSettings/executeCommandは従来どおり自Applet限定です。ShellPageHostのmainFrame/URL/現sessionとControllerのslot IDを検査します。

設定操作で非表示のWebViewを閉じても現在の設定ページを離れない。閉鎖済み/Windowへ移したAppletページへ遅れて届くViewport更新は状態を変更せず破棄する。表示中ページを閉じた場合は従来どおりホームへ戻る。

本体側のnavigation requestもslotの報告キーへ含める。画面側が先に切り替わって初回報告を本体が拒否した場合、navigation確定後に同じ矩形でも再報告してViewを生成する。

設定本文の通常交換では、現在のIPC応答と入力キューを待ち、候補を再解決します。3秒のflushが失敗した場合は、旧Viewが有効なら交換を保留して再試行を提示します。保存済みの割り当ては巻き戻しません。停止・故障時は保存済み値から復旧し、未確定入力を複製しません。設定Controllerと保存済み値は提供元変更で再生成しません。

Applet管理からのログ移動は`scope: all`と`source: appletId`を使う。sourceを解除して全体表示へ戻れるようにし、旧詳細用の固定Applet scopeをこの入口へ流用しない。
