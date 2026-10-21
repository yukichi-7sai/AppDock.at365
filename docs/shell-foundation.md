# Shell Hostの構成と拡張方針

Shell全領域のアクセント色は[共通配色](appearance.md)を参照する。共通preloadがテーマと選択パレットを適用するため、Shell側に別のパレットや固定のアクセント色を追加しない。

本体が状態・操作・表示領域を管理し、Default ShellとShell Appletが公開モデルを描画する。タイトルバー、ステータスバー、リボン、コマンドパレット、ホーム、画像ライブラリー、ログ、通知センター、通知バナー・デスクトップ通知はShellが描画する。実際の型は[src/shared/shell.ts](../src/shared/shell.ts)、[shell-bars.ts](../src/shared/shell-bars.ts)、[overlays.ts](../src/shared/overlays.ts)、[shell-pages.ts](../src/shared/shell-pages.ts)を正本とする。

## 用語と境界

| 名称 | 役割 |
| --- | --- |
| Default Shell | 本体repoのshells/defaultにある標準描画。通常時と復旧時に同じ実装を使用 |
| Shell Applet | 通常AppletにShell描画能力を追加した拡張。担当する領域だけを差し替える |
| Shell Host | 本体側のView起動・配置・切替・共通API・復旧を担当 |

Default Shellは本体と独立したrenderer成果物として同時ビルドし、単一EXEへ同梱する。追加Appletの独立repo規則はDefault Shellへ適用しない。出荷元以外の実行契約はShell Appletと共通にし、Default Shell専用APIや本体rendererの復旧用描画を作らない。

設定画面は本体rendererの共通画面で、Shellの提供元・復旧には依存しない。詳しくは[設定基盤](settings-foundation.md)を参照する。

本体はShellのReact実装をimportせず、Shellもsrc/main・src/rendererをimportしない。公開型・共通のアイコン素材・限定bridgeを使う。本体の汎用ローダーがmanifestと成果物を発見するための参照は、この描画依存禁止とは別である。

## 表示領域

| 領域 | 本体の内容管理 | 公開契約 |
| --- | --- | --- |
| titlebar / statusbar | WindowBarsと既存ウィンドウ・更新サービス | [タイトルバーとステータスバー](shell-bars.md) |
| ribbon | UiPresentationの表示モデル・操作ID・ナビゲーション | [Shell API](shell-api.md) |
| overlay.command-palette | CommandPaletteSessionとOverlayController | [部分Shellと共通オーバーレイ](shell-overlays.md) |
| overlay.ribbon-group | リボングループの一時表示とOverlayHost | [部分Shellと共通オーバーレイ](shell-overlays.md) |
| page.home | HomePageSessionとShellPageController | [Shellのページ表示](shell-pages.md) |
| page.image-library | ImageLibraryPageSessionとWindow内の状態 | [共通ギャラリー](image-gallery.md) |
| page.logs | LogPageSessionとShellPageController | [Shellのページ表示](shell-pages.md) |
| page.notifications | NotificationCenterController | [通知基盤](notifications.md) |
| notification.desktop | NotificationServiceとNotificationDesktopHost/SurfaceController | [通知基盤](notifications.md) |
| notification.banner | NotificationServiceとNotificationSurfaceController | [通知基盤](notifications.md) |

割り当ては`host.shellProviders`の領域IDからApplet IDへのマップ。共通カタログの11領域ごとに1件指定でき、省略はDefault Shellです。`ShellProviderRegistry`が軽量なmanifest・有効状態・起動世代から提供元と理由を解決し、各HostがViewの接続状態を報告します。設定を保存しても指定Appletを有効化しません。表示コンテキストはprimary、通常本文の本体Windowは1つ、通知専用Windowはdesktop射影を表示します。未割り当ての有効Appletも通常のcommands/settings/pagesを利用できます。

Shell Hostは位置・zoom・ready・接続元・表示順序・フォーカス・破棄を扱い、検索や設定保存等の機能判断は内容Controllerへ置く。ページ、オーバーレイ、リボンの寿命を分離し、1つのViewの破棄で他領域やAppletの処理を止めない。

## 状態と操作

本体の機能サービスを正本とし、保存用データと描画用モデルを分ける。設定revisionと表示revisionも別とする。モデルは描画に必要な値・可否・操作ID・画像参照だけを含み、全設定、認証、任意コード、OSパスを渡さない。

Shellは購読を登録してから初回snapshotを取得し、以後は変更通知で追随する。古いsessionやrevisionの通知を無視し、Viewの再生成やページ再表示を状態同期として使わない。Shellの準備完了をApplet起動処理の必須条件にして循環を作らない。

操作は本体発行IDと現在の接続・利用可否を照合して実行する。描画側でIDから機能を推測せず、任意コマンド・任意パスの実行口を作らない。重複受付・完了・取消の意味は各公開契約に従う。保存完了やハンドラー応答を外部アプリでの効果確認と混同しない。

MCP/通常Applet向けの描画APIは[共通操作API](appdock-api.md)のcallers/permissionsを適用する。選択されたShellのローカルUI権限と外部操作権限を分ける。Appletの自己設定・自己登録コマンドAPIは既存所有範囲に限定する。

## 起動と復旧

Default Shellは復旧依存として本体が保証し、任意の無効指定や開始遅延を適用しない。出自は探索元から決定し、外部manifestによる予約ID偽装を受け付けない。workerの起動には通常のApplet管理・RPC経路を使い、Default Shell workerは復旧用に維持する。

Viewは領域単位で必要時に生成し、ready後に表示を切り替える。リボンの提供元切替、オーバーレイのモーダル寿命、ページのroute寿命はそれぞれのHostが管理する。ログの対象/検索やオーバーレイの処理状態を描画側へ複製しない。

失敗した領域はDefault Shellへ復帰する。選択設定を勝手に消さず、同じ故障版の無限再起動を避ける。失敗記録の保存期間・再試行条件は各領域の仕様に従う。--safe-shellは保存設定を初期化せず、Default Shellと既定の表示設定を使う。Default Shell自身の故障は最小ネイティブ通知と通常の更新/復元手段で対処し、本体へ第二の描画を持たせない。

## 新しい機能を追加する手順

1. 機能を持つ本体サービスまたはAppletと、状態の保存先を決める。
2. 操作ID、入力検証、公開先、許可、完了・取消の意味を定義する。
3. 描画モデルと更新条件を定義し、機能の判断をrendererへ持ち込まない。
4. 内容ControllerとShell描画を追加し、既存の領域Hostへ接続する。
5. 公開契約だけを使用するShell fixtureで表示・操作・未提供時復帰・故障を検証する。

ホバーや単純な描画状態まで本体へ集めない。保存が必要なデータ、処理の進捗、描画が終了しても保持すべき編集状態は機能サービスで所有する。新規機能のためだけにグローバルツールや依存を追加せず、[プロジェクトのtoolchain](../DEVELOPMENT.md#開発環境ビルドテスト)を使う。

## 後続計画

設定の左右領域とApplet詳細の設定本文は本体のSettingsPageを共用する。即時保存・検索・部分JSONは本体の設定基盤へ接続する。設定描画をShellへ移す後続計画は廃止した。

一般Appletの複数Window・同一領域の同時多重表示は未実装。通知専用Windowは共通通知射影へ限定し、Applet Surfaceを多重化しない。導入する場合はcontext/binding/sessionとWindow寿命を分け、同じ機能サービスを複数の読者から使う。Windowが閉じても共有Appletや他の読者を停止しない。単一WebContentsの二重表示を前提にせず、既存AppletSurfaceの全面的な多重化は別に設計する。

Applet一覧・詳細等の残りの画面、過去ログ/日付検索、内蔵会話UIはこの基盤だけでは提供しない。追加時に個別の目的と公開契約を決める。

## 検証

公開モデル・操作・入力検証・古い要求拒否はui-presentation、command-palette、home-page、log-pageの単体試験で確認する。内部import禁止はtests/shell-boundaries.test.cjsで確認する。

scripts/shell-host-ui-test.cjs、shell-overlay-ui-test.cjs、shell-page-ui-test.cjs、shell-home-ui-test.cjsで領域ごとの切替/未提供/ready期限/故障/safe起動、両テーマ、サイズ/zoom、フォーカス、既存ページとの合成を検証する。既存navigation・設定通知・リボンの回帰も変更範囲に含める。GUIは直列・隔離profileで行い、本体とDefault Shellを含む固定単一EXEでも確認する。

scripts/shell-metrics.cjsは比較する固定配布物を指定し、起動時間・メモリ・待機CPUを測定する。Viewや購読の増加、未表示領域の不要起動を確認する。実測・未確認条件は[VERIFICATION](../VERIFICATION.md)へ記録する。

## 提供元の決定と稼働状態

本体mainに領域別の提供元解決と状態集約を置く。`ShellProviderRegistry`を使い、各Hostが同じ判定を利用する。WindowやWebContentsの生成、内容Controllerの操作はRegistryに移さない。提供元の入力はmanifest・有効状態・稼働世代の軽量な情報とし、コマンド一覧を含むmanager.snapshotを解決中に再取得しない。コマンド利用可否からRegistryを参照するため、snapshotと解決器の相互再帰を避ける。

1. `--safe-shell`なら、保存値を変えずDefault Shellを指定先として扱う。
2. 保存マップから指定先を取得する。省略はDefault Shell。
3. 指定先の実在・出自・有効状態・稼働状態・領域提供・契約互換性・故障抑止を確認する。設定画面は本体rendererが描画する。
4. 利用可能なら指定先、利用不可なら同じ領域のDefault Shellを候補にする。
5. Default Shellも利用できなければ、候補なしと既存の復旧エラーを返す。他の外部Shellは自動採用しない。

Default Shellの無効化禁止・開始遅延なし・組み込み出自の検証・予約ID偽装拒否は維持する。有効な外部Appletは既存の起動管理に従い、Shellのready待ちをworker起動の必須条件にしない。

### 状態モデル

設定UIとコマンド判定で単一の`selected/active`を使わず、primaryの領域ごとに以下を持つ。名称は公開型で統一する。

| フィールド | 意味 |
| --- | --- |
| `configuredProvider` | 保存設定上の指定先。省略時もDefault ShellのIDを返す |
| `resolvedProvider` | 今、新たにViewを開く場合の提供元。復旧不能ならnull |
| `boundProvider` | 現在の操作対象Viewの提供元。未生成ならnull |
| `ready` / `visible` | 現Viewの準備完了と実表示状態。候補決定とは別に扱う |
| `pendingProvider` | 準備中または適用待ちの提供元。なければnull |
| `reason` | safe起動・未導入・無効・起動待ち・領域未提供・契約非互換・故障抑止・適用待ち・復旧不能等の理由。正常時はnull |

状態に表示用revisionを付け、設定revisionとは分ける。パレット未表示や別ページ表示中は`boundProvider:null`でも正常であり、故障を意味しない。通知Viewを非表示で保持する場合も`visible:false`を区別する。未設定はDefault Shellの通常指定として扱う。

HostSnapshotと設定ページの補助モデルへ領域別状態を追加する。既存の`ShellStatus.selected/active/error/safeMode`はリボンの互換投影として維持し、新しい判定には使用しない。パス・完全設定・内部WebContents IDを公開状態へ含めない。既存connect応答の`providerAppletId`は、その接続の実提供元を引き続き返す。

非表示領域の候補確認のためにViewを起動しない。各表示枠で通常必要なViewと切替準備中のViewだけを作り、Applet数に比例して全領域のrendererを増やさない。

## 切り替えとフォールバック

| 変化 | 指定設定 | 表示の扱い |
| --- | --- | --- |
| 指定Appletの無効化・意図的な再起動 | 保持 | 対象の全領域だけDefault Shellへ戻す。故障登録しない |
| 再有効化・起動完了 | 保持 | 故障抑止がなければ指定先へ戻す |
| 未導入・領域未提供 | 保持 | Default Shellを使い理由を表示。正常な他領域は維持 |
| renderer故障・ready期限超過 | 保持 | 故障した領域だけDefault Shellへ戻す |
| worker故障 | 保持 | そのworkerに依存する各領域を復旧する |
| 別の割り当てを保存・受信 | 新設定 | 領域ごとの適用時点に従って切り替える |
| safe起動 | 保持 | 全領域をDefault Shellへ固定 |

各接続を領域・コンテキスト・提供元・worker起動世代・View sessionへ結び、準備完了時と操作直前に有効性を再検査する。高速な設定変更で準備中Viewが不要になったら破棄し、遅れて届くready・失敗・操作完了が新しい表示を変更しないようにする。

利用者が無効化したAppletや停止したworkerに属する旧Viewの操作権限は直ちに失効させる。代替Viewのreadyを待つために、無効化済み提供元へ操作を通し続けない。

### 領域ごとの適用時点

- リボンは正常な旧Viewを切替先のreadyまで維持する。現行の10秒ready期限を引き継ぐ。
- ホーム・ログ・通知センター・設定本文は表示中の枠に反映する。同一Controllerを保ち、保存済み設定・ログ条件・通知履歴の選択やページング・実行状態を再生成しない。未表示領域は次回生成時に解決する。
- パレットは開いている要求に提供元を固定する。設定変更・再有効化による新候補は次回表示から適用する。現在の提供元が無効・停止・故障した場合は、同じ要求をDefault Shellへ引き継ぐ。保存設定と現在の提供元が異なる間は適用待ちを示す。設定変更と停止が重なった場合も、既存要求の復旧先はDefault Shellに固定し、新しい外部提供元は次回要求から使う。
- 通知バナーとデスクトップ通知は同じNotificationServiceの通知・期限・実行状態を使い、領域ごとに切替先のready後に交換する。デスクトップ通知は既存の専用Windowと表示抑制、focusを奪わない表示、最後の対象を外した際の解放を維持する。本体Windowの非表示だけでデスクトップ領域を無効にしない。非表示Viewも提供元の停止を検出して失効させる。切替のために通知を再発行したり、期限を再開始したりしない。

フォーカス境界、ページ枠、通知とモーダルの重なり順、共通ショートカット停止、IME、zoom、テーマ背景の責任は各Hostに残す。切替で他AppletのWebContents/sessionを作り直さない。

### 設定入力中の切り替え

設定Shellの割り当て変更は、現在の設定画面自身を切り替え得る。妥当な入力を即時保存し、保存成功と新Viewの接続完了を分ける。SettingsStoreを値の正本とし、SettingsInputSessionは選択・モード・操作受付だけを保持する。受付中の操作応答を待つflushを保存処理へ同期的に戻してデッドロックさせず、応答と入力キューの完了後に表示先を再評価する。

外部設定の受信を含む正常なView交換では、requiresFlushを持つControllerだけで既存の現在入力キューを待つ。flush待ち中に変更された候補は完了後に再解決する。before/valueのフィールド単位競合検査を維持し、未編集フィールドの外部変更を失わない。外部更新や失敗を自動再送しない。

3秒のflushが失敗した場合、旧Viewがまだ有効なら通常の交換を保留し、入力受付待ちと再試行導線を示す。保存済みの割り当てを巻き戻さない。停止・無効化・renderer故障では旧Viewを保持できないため、保存に成功した値から再描画する。受付だけ済み保存が未完了の要求を成功扱いしない。

不正JSON・不完全な数値・保存失敗・IME変換途中は現在のUIにだけ保持し、View間で複製しない。ページ/モード移動・View破棄では未確定入力を破棄する現行方針を維持する。保存済み画像は復元し、読込途中の画像や未送信入力まで復旧できるとは扱わない。共有ドラフト・全体保存/破棄・未保存通知は作らない。

### 故障記録と再試行

故障は少なくとも領域・提供元ID・提供元版で区別する。リボンは既存のPC専用`shell-failures.json`を引き継ぎ、従来形式のIDと版の記録をリボンの故障として読む。他領域へ故障を拡大しない。ページ・パレット・バナー・デスクトップは現行どおりプロセス内の領域別記録とする。保存ファイルは増やさない。

同じ故障版を無限に再生成せず、明示再試行または版更新で解除する。意図的な再起動・無効化・割り当て変更自体では故障を新規登録しない。版を変えない無効化と再有効化で、既存の故障抑止を消さない。

領域ごとの再試行では、その領域の故障記録を解除する。workerがerrorなら、現在も有効な指定先と組み込みDefault Shellだけを再起動対象にする。無効Appletは有効化しない。workerの再起動はそのAppletが担当する他領域にも影響するため、UIでその範囲を説明する。既存の全体再試行は、各領域の指定先とDefault Shellを重複排除して処理する。

## Shell専用コマンド

コマンドの所有者は登録元Applet、操作先は宣言された領域として扱う。Shell割り当てによってIDを読み替えたり、別Appletの同名コマンドへ転送したりしない。コマンド実行を契機に割り当てを書き換えない。

| 操作 | 利用条件 |
| --- | --- |
| 自Appletの配色・コンパクト表示等の設定変更 | 従来の自己設定・コマンド条件。未割り当てでも利用でき、次の描画で反映 |
| 自分が担当する領域を開く処理 | 自Appletがその領域の現在の解決先であること。未生成Viewでも実行可能 |
| 表示中の自分のViewを操作する処理 | 自Appletの対象領域のViewがreadyかつvisibleで、現在の操作対象であること |
| AppDock共通のパレット表示やナビゲーション | 既存の本体共通操作を使い、担当Shellの選択は本体に任せる |

### 任意の宣言による実行条件

manifestの`commands[]`へ任意の`shellRequirement`を追加する。以下は宣言の抜粋である。

```json
{
  "commands": [
    {
      "id": "example.shell-a.ribbon-action",
      "title": "表示中のリボンを操作",
      "shellRequirement": { "region": "ribbon", "state": "visible" }
    }
  ]
}
```

`state`は`resolved`または`visible`の2種類、対象は1コマンドにつき1領域とする。`resolved`は現在の解決先、`visible`は実際の操作対象Viewで判定する。切替準備中や表示中パレットでは両者が異なり得るため、一律の「選択中」フラグへまとめない。visible条件では対象View自身の非表示・所有Windowの最小化・破棄・無効化・古い起動世代を拒否する。デスクトップ通知では本体Windowの可視状態を流用しない。Viewが見えていても、モーダルによって操作を停止されている領域は利用不可とする。他Windowによる物理的な遮蔽は判定対象にしない。

宣言にはshell capabilityと自Appletによる対象領域の提供を要求する。新宣言を使うAppletは実装された版をminimumHostVersionへ指定し、古いホストが条件を無視して実行することを防ぐ。`activateOnExecute:true`との併用は拒否する。条件を満たすために無効Appletを自動有効化しない。

省略時は既存コマンドの意味を変更しない。生成された設定コマンドにも条件を自動付与しない。外部公開のautomation宣言・権限、別名、再入制御は既存契約を維持する。runtime登録・動的置換では条件の解除や外部権限の昇格を許さず、manifestの正規IDから条件を適用する。別名も正規IDと同じ条件で判定する。

一覧の`available`と利用不可理由、パレット・トレイ・ショートカット等の表示へ同じ判定を使う。さらに本体の共通実行経路で実行直前に再検査し、一覧取得後の切替を見逃さない。MCP・他Applet経由もこの判定を通す。具体的にはAppletコマンドの最終実行経路であるExtensionManager.executeへ共通ガードを接続し、本体UI側だけで検査して外部経路を取りこぼさない。条件不成立でも保存済みのピン・キー・トレイ配置は消さない。

表示中Viewを操作する非同期処理は受付時の対象sessionへ結び、切替・停止でその対象を失効させる。要求を新しいViewへ自動再送しない。複数領域で同じAppletが採用されても、対象の1領域以外を操作しない。sessionの失効は、すでに受付済みの設定保存や外部処理を巻き戻す保証ではない。将来の型付きView操作は受付時と適用時の両方でsessionを照合する。

### 自分の採用状態の取得

shell capabilityを持つworker向けに、自Appletの提供領域だけの状態取得と変更購読を追加する。RPCは`host.shell.getState`とホスト発の`shell.changed`、Nodeは`context.shell.getState/onChanged`、.NETは同等の非同期取得とイベントとする。返す値はprimary、領域ID、自分がconfigured/resolved/boundか、ready/visible、理由、表示用revisionに限定する。

購読してから初回取得し、古いrevisionを無視する。activate中はView未生成のsnapshotを返せるものとし、readyや全Applet起動完了を待たない。自己状態の取得にappdock-apiの外部操作許可は要求せず、shell capability・本人の稼働世代・既存RPC検査を使う。他Appletの情報や任意Viewへのアクセスを追加しない。

状態通知だけで実行許可を保証しない。取得後の競合はホストの実行直前検査とsession失効で防ぐ。一般のショートカット`owner`条件をShell採用条件へ読み替えず、キーの保存順や複数実行規則も変更しない。

### View操作APIの境界

実行条件は操作を許可するための契約であり、任意のrenderer関数・DOM・JavaScriptを呼べるAPIではない。現行の自己設定更新と変更購読はそのまま使える。検索欄フォーカス等、既存契約にない一時操作を追加するときは対象領域の型付き操作とsession検査を別途定義する。汎用workerからViewへの任意メッセージ転送APIは本機能追加しない。

独自の一時View操作そのものの新設は初回の完成条件に含めない。既存コマンドの互換維持、新しい条件宣言、自己状態API、無効な対象への実行拒否までを本計画で完成させる。
