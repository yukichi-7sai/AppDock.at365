# 領域ごとのShell割り当てと実装計画

実装状態: AppDock 0.64.0。領域ごとにShell Appletを1件指定し、利用できない領域だけDefault Shellへ戻します。優先順位リストは導入しません。現行契約の型は[src/shared/shell.ts](../src/shared/shell.ts)、解決と状態集約は[ShellProviderRegistry](../src/main/core/shell-provider-registry.ts)を正本とします。

現行の責務分離と描画APIは[Shell基盤](shell-foundation.md)、[リボン](shell-api.md)、[オーバーレイ](shell-overlays.md)、[本文](shell-pages.md)、[通知](notifications.md)を引き継ぐ。設定保存と編集は[設定同期](settings-sync.md)と[設定基盤](settings-foundation.md)、コマンドは[Applet API](extensions.md)と[共通操作API](appdock-api.md)に従う。

## 目的と対象

すべての領域を提供するApplet AとBを同時に有効にしても、リボンにはA、ホームにはBを指定できるようにする。Default Shellは常時有効な組み込み提供元として維持する。Default Shell自体が故障した場合は、既存の最小ネイティブ通知と復旧手段を使う。

本体は機能状態・操作・配置・表示寿命、Shellは公開モデルの描画を所有する。Appletの有効状態、領域への割り当て、実際のViewの状態は分離する。未割り当ての有効Appletも、通常のコマンド・設定・ページを利用できる。

現在の対象は共通カタログの10領域とprimaryコンテキスト、通常本文の本体Window1件および既存の通知専用Window。タイトルバーとステータスバーは[専用契約](shell-bars.md)を使う。一般Appletの複数Window、同一領域の同時多重表示、Applet本文WebContentsの複製、MCP向けの新しいShell操作APIは含めない。残る本体描画の移行条件は後述する。

## 領域と割り当ての単位

| 領域ID | 描画内容 | 現行の表示Host |
| --- | --- | --- |
| `titlebar` | 検索・通知・ウィンドウ操作 | ShellBarHost |
| `statusbar` | 稼働数・本体版・更新・進捗 | ShellBarHost |
| `ribbon` | ナビゲーションとコマンドのリボン | ShellHost |
| `overlay.command-palette` | コマンド実行・選択パレット | OverlayHost |
| `overlay.ribbon-group` | 一時展開するリボングループ | OverlayHost |
| `page.home` | ホーム本文 | ShellPageHost |
| `page.logs` | 全体・Applet詳細・WebApplet管理のログ本文 | ShellPageHost |
| `page.notifications` | 通知センター本文 | ShellPageHost |
| `notification.banner` | Window内の通知バナー | NotificationSurfaceHost |
| `notification.desktop` | 独立Window内のデスクトップ通知 | NotificationDesktopHostとNotificationSurfaceHost |

同じ領域を使う表示文脈には同じ割り当てを適用する。例えば全体ログとApplet詳細ログを別々のShellにする設定は追加しない。ログ対象や設定対象のApplet IDと、描画提供元のApplet IDを混同しない。

領域ID・表示名・対応契約は本体の共通カタログにまとめる。Appletは既存の`shell.views`で提供領域を宣言し、`shell.ui`は従来どおりリボンの別名として扱う。領域の同一性を画面の名前やHTMLファイル名で判定しない。

現行カタログは上記8領域。設定画面は本体が描画する。旧page.settingsキーは保持するが領域状態・自己状態・再試行には含めない。旧`host.shellProvider`の一括指定は従来8領域だけへ移行し、新しい`overlay.ribbon-group`はDefault Shellを使う。リボン提供元は`shell.ribbonSchemaVersion: 2`が必要で、旧schemaの指定は保持したままリボン領域だけDefault Shellへ戻す。対応済みの他領域は継続する。

| 領域 | 保存された指定 | AとBが稼働中 | Aを無効化した後 |
| --- | --- | --- | --- |
| リボン | A | A | Default Shell |
| ホーム | B | B | B |
| パレット | A | A | Default Shell |

Aに割り当てた複数領域はそれぞれ復旧対象になる。Aのリボンrendererだけの故障では、Aの正常なパレットやBのホームを切り替えない。Aのworkerが停止した場合は、Aが担当する全領域が利用不可になる。

## 設定形式と互換性

`host.shellProviders`を領域IDから提供元Applet IDへのオブジェクトとして追加する。次はhost設定の抜粋であり、単独のsettings.jsonではない。

```json
{
  "host": {
    "shellProviders": {
      "ribbon": "example.shell-a",
      "page.home": "example.shell-b",
      "overlay.command-palette": "example.shell-a"
    }
  }
}
```

配列・順位・領域ごとの有効フラグは追加しない。キー省略はDefault Shell指定と同じ意味とし、Default Shellの明示指定も受理する。Appletの有効フラグは既存の`extensions[id].enabled`を使い、割り当ての保存によって有効化・起動を行わない。

### 検証と保存

- オブジェクトは最大32件。領域キーは既存`shell.views`と同じ形式・長さ、提供元IDは既存`shellProvider`と同じ形式・長さで検証する。prototypeに影響する予約キーを拒否し、独自プロパティだけを読む。
- 形式が正しい未知の領域キーと未導入の提供元IDは保持する。未知領域は描画・コマンド条件に使用しない。既知領域で提供能力がない指定は消さず、Default Shellと理由を表示する。
- 正規化は`parseSettings`側の共通処理に置き、起動・通常保存・外部ファイル受信・バックアップ読込に同じ規則を適用する。再正規化しても結果が変わらないことを保証する。
- 割り当ては共有settings.json、故障状態は従来どおりPC専用状態に置く。実際の提供元や一時的なフォールバックをsettings.jsonへ保存しない。
- 妥当な割り当て変更は既存の入力キューとSettingsInputSessionを通して即時保存する。before/value・revision検査・原子的保存を維持し、保存成功後に実Viewへ反映する。共有ドラフト、dirty、全体保存/破棄、未保存通知は再導入しない。

### 旧設定の読み込み

旧`host.shellProvider`は入力互換として読み込むが、新UIと保存時の正本は`host.shellProviders`へ統一する。

| 入力 | 正規化の結果 |
| --- | --- |
| 新旧どちらもなし | 空の領域マップ。すべてDefault Shell |
| 旧キーのみ | この移行で固定した8領域すべてに旧IDを指定 |
| 新キーのみ | 新マップを使用。省略領域はDefault Shell |
| 新旧両方 | 新マップを使用。新マップが空でも旧値へ戻さない |
| 新キーが不正 | 設定エラー。旧値への黙示的なフォールバックはしない |

旧IDが未導入・無効・一部領域のみ提供の場合も、そのIDを移行する。現PCの導入状態から移行結果を変えると、他PCで再利用した際に元の選択を失うためである。未対応領域がDefault Shellになる点は現行と同じ。移行対象の8領域は固定し、将来追加される領域へ旧IDを自動展開しない。

正規化後のメモリ上の設定から旧キーを除き、次の成功した通常保存で新形式を書き込む。既存ファイルを起動だけで書き換えない。別項目の保存でも既存SettingsStoreを通じて新形式になる。外部更新との比較・revision検査は双方の正規化結果で行い、誤った競合や再読込ループを作らない。

旧版へのダウングレードでは領域別指定を再現できない。旧単一指定との二重書込みは行わず、利用者向け説明には旧版がDefault Shellを使い得ることと設定バックアップの復元方法を記載する。

既存のshell.views・connect・自己設定・自己コマンドの契約は設定領域以外で維持する。旧設定領域のviews宣言は読込可能だが起動しない。shellRequirementの旧page.settings条件は常に不成立とし、他の領域や通常コマンドを継続する。

## 提供元の決定と稼働状態

本体mainに領域別の提供元解決と状態集約を置く。`ShellProviderRegistry`を使い、各Hostが同じ判定を利用する。WindowやWebContentsの生成、内容Controllerの操作はRegistryに移さない。提供元の入力はmanifest・有効状態・稼働世代の軽量な情報とし、コマンド一覧を含むmanager.snapshotを解決中に再取得しない。コマンド利用可否からRegistryを参照するため、snapshotと解決器の相互再帰を避ける。

1. `--safe-shell`なら、保存値を変えずDefault Shellを指定先として扱う。
2. 保存マップから指定先を取得する。省略はDefault Shell。
3. 指定先の実在・出自・有効状態・稼働状態・領域提供・契約互換性・故障抑止を確認する。旧page.settingsは解決対象に含めず、本体の共通設定画面を使う。
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

## 設定画面

「設定 → 表示 → Shell」に共通カタログ順の10行を配置する。各行に領域名、指定先の選択、現在の使用先、利用不可・適用待ちの理由、必要時の再試行を表示する。順番変更UIは設けない。

選択肢はDefault Shellと、その領域を宣言する導入済みAppletとする。無効Appletも無効状態を明示して指定できるが、選択では有効化しない。保存済みの未導入・領域未提供の指定は補助選択肢として残し、勝手に別の値へ変更しない。Default Shellは「常時有効」と表示し、無効化操作は提供しない。

選択変更を即時保存し、送信中・保存失敗と保存済みの使用状態を区別する。保存に失敗した入力は現在のUIで理由付きで示し、保存済み割り当てや実Viewを成功扱いで切り替えない。部分JSONの範囲は`host.theme`と`host.shellProviders`へ更新する。未知領域キーも同じオブジェクト内に保持し、別ページの編集やフォーム保存で削除しない。

横断検索用の項目IDと移動先を領域ごとに用意する。ドットを含む領域IDを設定パスの区切りとして分割せず、既存のキー配列による範囲管理を使う。候補と状態の補助モデルだけを設定Shellへ渡し、全設定や内部Registryを公開しない。

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

実行条件は操作を許可するための契約であり、任意のrenderer関数・DOM・JavaScriptを呼べるAPIではない。現行の自己設定更新と変更購読はそのまま使える。検索欄フォーカス等、既存契約にない一時操作を追加するときは対象領域の型付き操作とsession検査を別途定義する。汎用workerからViewへの任意メッセージ転送APIは今回追加しない。

独自の一時View操作そのものの新設は初回の完成条件に含めない。既存コマンドの互換維持、新しい条件宣言、自己状態API、無効な対象への実行拒否までを本計画で完成させる。

## 本体描画のDefault Shellへの移行

領域別指定と描画移行は独立して進められる。タイトルバーとステータスバーは[公開契約](shell-bars.md)を使う。Applet一覧・詳細の残る描画を移すときも、先に領域ID、表示モデル、操作、寸法、フォーカス、復旧単位を定義する。新しい領域の既定先はDefault Shellとし、既存の領域マップへ外部Appletを自動指定しない。

Window管理・保存済み設定と入力受付・ナビゲーション・通知・処理進捗・Applet本文の寿命は本体に残す。Default Shellだけが使う内部APIや、本体rendererの復旧用重複描画を作らない。AのリボンがBの本文DOMや内部状態を直接操作する依存を作らず、共通モデルと本体操作で連携する。

親となる画面の装飾を移す場合も、子領域の提供元選択・配置・操作権限は本体が所有する。単一の外部Shellに画面全体の子領域を無条件に所有させない。新領域を公開した段階で、Default Shellと公開契約だけのfixtureの両方で合成・復旧を確認する。

## 変更対象

| 対象 | 主な変更 |
| --- | --- |
| `src/shared/shell.ts`、`contracts.ts` | 領域カタログ、領域別設定・状態、任意コマンド条件、旧状態の互換投影 |
| `src/shared/settings-schema.ts`、`settings-catalog.ts` | 旧設定移行、検証、表示設定の範囲、検索項目 |
| `src/shared/settings-page.ts`、mainの設定ページ・補助モデル | 候補・稼働状態・再試行、部分JSON・即時保存と入力キューとの接続 |
| mainの新しい提供元Registryと各表示Host・通知専用Window | 共通解決、領域別状態、故障抑止、session失効、切替 |
| `src/main/index.ts` | Hostの接続、状態通知、全体・領域別再試行、コマンド経路 |
| `src/renderer/settings/SettingsForm.tsx`と関連描画 | 単一選択から領域行へ変更、適用前後と理由の表示 |
| `src/shared/extension-commands.ts`、`src/main/core/extensions.ts` | manifest条件、利用可否、別名・動的登録との統合 |
| `src/main/core/host-api.ts`、`src/main/node-worker.ts`、.NET SDK/Runtime | 自己状態の取得・購読と世代検査。既存APIは維持 |
| 共通コマンド・入力・トレイ・外部操作の投影 | 条件と利用不可理由の共用、実行直前検査 |
| 現行Shell文書・設定文書・Applet API・README | 実装完了時に現行契約へ反映。本書だけを実装済みにしない |

## 実装の段階と完了条件

各段階は実装順序であり、途中の段階を全機能の完成とは扱わない。製品コードへ着手する前に、実装開始時のmainとこの基準との差分、特に設定・通知・コマンドの変更を照合する。

| 段階 | 実装内容 | 次へ進む条件 |
| --- | --- | --- |
| 1 設定と解決 | 共通領域カタログ、旧設定の正規化、候補・理由の純粋な判定、領域別状態型 | 旧単一設定・空マップ・未知ID・外部受信・safe・未提供・故障を再現する単体検証が成功 |
| 2 表示Host | Registryへ各表示Hostと通知専用Windowを接続。切替世代・故障・再試行・flush・通知の寿命を維持 | A/Bの混在、無効化と再有効化、領域単位故障、開いたパレット維持、保存済み値の復元と未確定入力の扱いがGUIで成功 |
| 3 設定UI | 領域行、候補・実使用先・理由、再試行、部分JSONと横断検索 | 即時保存成功後の自分自身の切替、失敗時の表示維持、未導入指定保持、競合と検索が成功 |
| 4 専用コマンド | 任意条件宣言、共通実行検査、自己状態のNode/.NET API、各操作入口の整合 | 旧コマンド互換、resolved/visible差、切替競合、別名、外部許可、停止世代拒否が成功 |
| 5 統合と発行 | 影響先レビュー、必要回帰、現行文書の更新、版更新と本体publish | 固定単一EXEで主要シナリオと同梱Default Shellを確認し、VERIFICATIONへ結果を記録 |

設定項目の追加・廃止を含むため、実装完了時は本体のマイナー版を1つ増やしてパッチを0にする。具体的な版は実装時の未公開変更と照合して確定する。同じ変更の条件をまとめてマイナー更新は1回とし、その版の発行後に通常の追加修正を発行する場合はパッチ番号を進める。Default Shellは本体と同時ビルド・単一EXEへ同梱し、未変更の外部Appletを再発行しない。

設計書作成時のコミットでは製品版・ソース・配布物を変更していない。実装時のcommit・push・Release・deploy・mainへの統合は、それぞれ依頼範囲に従う。

## 検証計画

検証fixtureとして共通カタログ全領域を持つA/B、一部領域のみのC、readyしない提供元、特定領域だけ故障する提供元を用意する。製品へ同梱しない。GUIは隔離profileで直列に実行し、既存のtoolchainと試験経路を使用する。

| 検証群 | 必須の受入条件 | 利用する既存試験と追加範囲 |
| --- | --- | --- |
| 設定移行 | 旧IDだけから表示を維持。新旧併記は新優先、空マップはDefault、未知領域保持、繰返し正規化不変、起動時の共有ファイル無変更 | `tests/core.test.cjs`、設定編集・設定ページの既存単体、`scripts/settings-sync-ui-test.cjs`へ追加 |
| 領域別解決 | A/B両方が全領域を提供してもリボンA・ホームB。C未提供、未導入、無効、起動待ち、safe、Default故障の結果が仕様どおり | 新しい解決器の単体と`tests/shell-boundaries.test.cjs` |
| 表示と独立性 | A無効でA担当だけ復旧、再有効で復帰。renderer故障は対象領域のみ、worker故障は依存領域全部。他Appletを再生成しない | `scripts/shell-host-ui-test.cjs`、`shell-home-ui-test.cjs`、`shell-page-ui-test.cjs` |
| パレット | 開いた要求の提供元固定、次回から新指定、無効化時のDefault継続、取消と実行中コマンドを重複させない、フォーカス復帰 | `scripts/shell-overlay-ui-test.cjs` |
| 設定入力 | settings自身の即時保存と切替、外部受信中flush、3秒失敗から再試行、保存済み画像の復元、UI内の不正入力・競合と破棄、未送信IMEの扱い | `scripts/settings-shell-ui-test.cjs`、`settings-search-ui-test.cjs` |
| 通知 | バナー/desktopの別提供元と独立復旧、通知ID・期限・処理状態保持、centerの選択維持、本体非表示、通知専用Windowのfocus・解放、通知の再発行なし | `scripts/notification-banner-ui-test.cjs`、`notification-desktop-ui-test.cjs`、`notification-center-ui-test.cjs`、`notification-settings-ui-test.cjs`、通知の既存単体 |
| コマンド | 条件省略の互換、未採用の設定変更、未生成resolved、非表示visible拒否、受付後切替、別名・動的登録・generated settingsの区別 | コマンド・manifestの単体、`scripts/applet-api-ui-test.cjs`へNode/.NET fixtureを追加 |
| 操作入口 | パレット・ピン・リボン・トレイ・ローカル/グローバルキー・ジェスチャー・MCPで条件一致。割当保存保持、権限迂回なし | 変更が及ぶ既存host commands・tray・hotkeys・gestures・automation試験 |
| 見た目と寿命 | Light/Dark、resize/zoom、Tab・IME、古いready/操作の拒否、View/購読/タイマーの回収、不要領域の未生成 | `scripts/shell-page-theme-ui-test.cjs`と既存Shell GUI、必要時`shell-metrics.cjs` |

段階5では型検査・本体とDefault Shellのビルド、変更関連の回帰を実施する。Node/.NETの契約を追加する段階4ではSDK/Runtime/native hostのRelease buildと実接続・停止試験を含める。実装後にコミットを依頼された場合は[共通手順](development-workflow.md)に従い対象の標準回帰と必要GUIをすべて確認する。

発行物のhash・版・feedと固定コピーを照合し、固定単一EXEでも混在、無効化復旧、設定入力、専用コマンド、safe起動の代表シナリオを実行する。旧単一指定のShell fixtureを残し、既存manifest・bridgeの互換を確認する。結果と未確認条件はVERIFICATIONへ記録し、本書の実装状態を段階ごとに更新する。

## 実装との対応

段階1〜4は共通設定正規化、領域Registry、各表示Host、設定UI、コマンド条件、Node/.NETの自己状態取得・購読へ実装しました。自己状態の初回取得後に変更通知を配送し、旧workerへ未知の通知を送らないようにします。非同期コマンドは受付時のworker世代とView sessionへ実行情報を結び、失効した実行情報を使う後続の共通API呼び出しを拒否します。保存済み処理を巻き戻す契約ではありません。

[領域別回帰](../tests/shell-region.test.cjs)、[混在GUI](../scripts/shell-region-ui-test.cjs)、Node/.NET/native fixtureと既存Shell・設定・通知のGUI回帰を使います。実行結果・修正履歴・版・発行物の照合は[VERIFICATION](../VERIFICATION.md)へ記録し、段階5も完了しました。本体0.34.0と同梱Default Shellを発行し、固定単一EXEで混在・設定・専用コマンド・通知・safe起動を確認しました。
