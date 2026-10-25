# Shell Hostの構成と拡張方針

画面は原則としてAppDock本体と共通UI部品で実装する。Shellの対象は下記の既存6領域に限定し、新しい領域のShell化は個別に依頼された場合に行う。ポップアップ、ページ内の部品、新しいページという理由だけでShellを追加しない。

メイン画面の枠組み、画像ライブラリー、通知センター、ログ、設定は本体rendererで描画する。ページ単位のShell描画・差し替え機構は提供しない。本体ページの構成・起動・戻り先は[本体のページ表示](host-pages.md)、通常Appletの独立したページ表示は[Appletページ](applet-pages.md)を参照する。

Shell全領域の配色は[共通配色](appearance.md)を参照する。共通preloadがテーマと選択パレットを適用し、画面ごとにアクセントパレットを複製しない。

## 用語と境界

| 名称 | 役割 |
| --- | --- |
| Default Shell | 本体repoのshells/defaultにある標準描画。通常時と復旧時に同じ実装を使用 |
| Shell Applet | 通常AppletにShell描画能力を追加した拡張。担当する対象領域だけを差し替える |
| Shell Host | 本体側のView起動・配置・切替・公開API・復旧を担当 |

Default Shellは本体と同時ビルドして単一EXEへ同梱する。追加Shell Appletは独立repoとし、両者は同じ公開モデル・操作・起動経路を使う。Default Shell専用APIや本体rendererの復旧用重複描画を作らない。本体とShellのReact実装を相互importせず、再利用する表示部品は共通UIへ置く。

## 領域と割り当ての単位

| 領域ID | 描画内容 | 表示Host・公開契約 |
| --- | --- | --- |
| titlebar | タイトルバー | ShellBarHost・[バー](shell-bars.md) |
| ribbon | リボン、グループ親ボタン、持続的・一時的な子表示 | ShellHost/OverlayHost・[Shell API](shell-api.md) |
| statusbar | ステータスバー | ShellBarHost・[バー](shell-bars.md) |
| overlay.command-palette | コマンドパレット | OverlayHost・[共通オーバーレイ](shell-overlays.md) |
| notification.banner | Window内の通知バナー | NotificationSurfaceHost・[通知基盤](notifications.md) |
| notification.desktop | 独立Window内のデスクトップ通知 | NotificationDesktopHost・[通知基盤](notifications.md) |

型と一覧の正本は[src/shared/shell.ts](../src/shared/shell.ts)。割り当てはhost.shellProvidersの領域IDからApplet IDへのマップで、未指定はDefault Shell。一時グループはリボンと同じHTML・提供元で描画し、独立した設定・領域・復旧先を持たない。残る6領域は独立して選択できる。

設定画面と[共通MCP設定API](settings-api.md#shell選択)は同じ領域一覧とshellProviderCandidatesから選択肢を生成する。領域の増減に合わせたMCP専用登録やツールの再定義は不要で、現在のSchemaと候補を取得する。選択はPC専用保存を使い、停止・無効Appletの有効化や再試行を兼ねない。領域や提供元がなくなった場合も保存済みの指定は保持する。

旧page.home、page.image-library、page.logs、page.notifications、page.settingsの保存指定は不活性な値として保持し、選択UI・稼働状態・起動・再試行へ含めない。旧指定の削除・変換や保存データの初期化は行わない。旧ページを要求するShell専用コマンドは利用不可とする。通常Appletのpages、コマンド、設定、WebContents/sessionの寿命は変更しない。

## 状態と操作

本体の機能サービスを状態・保存・操作の正本とし、Shellは描画モデルを購読する。設定revisionと表示revisionを分離する。モデルに全設定、認証、任意コード、OSパスを渡さず、本体発行の操作ID・可否・画像参照を使う。表示を再生成して状態同期の代わりにしない。

ShellProviderRegistryはmanifest・有効状態・worker世代から領域の提供元を解決する。Windowや内容Controllerの操作をRegistryへ移さず、manager.snapshotと相互再帰を作らない。各Hostは位置・zoom・ready・送信元・表示順序・フォーカス・破棄を管理する。

各領域の状態にはconfiguredProvider、resolvedProvider、boundProvider、pendingProvider、ready、visible、reasonを分けて持つ。未生成・非表示を故障と扱わず、完全設定・内部WebContents ID・パスを状態へ公開しない。ShellStatusのselected/activeはリボンの互換投影とする。

## 切り替えとフォールバック

- 未指定・未導入・無効・未提供・非互換・故障は、その領域だけDefault Shellへ戻す。保存された指定は保持する。
- renderer故障はその領域、worker停止はそのworkerに依存する全領域を失効させる。意図的な無効化・再起動で新しい故障記録を作らない。
- 接続は領域・primary context・提供元・worker世代・View sessionに結び、readyと操作直前に再検査する。古い操作や遅れたreadyで新しい表示を変更しない。
- リボンとバーは切替先readyまで正常な旧Viewを保つ。無効化した旧提供元の操作権限は即時失効させる。
- パレットと一時リボングループは開いている要求に提供元を固定する。通常の割り当て変更は次回表示から適用し、故障・停止時は同じ要求をDefault Shellへ引き継ぐ。
- 通知は同じID・期限・実行状態を保持し、切替のために再発行・期限再開始をしない。デスクトップ通知の可視判定は専用Windowを使う。

Default Shellは復旧依存として無効化・起動遅延を認めず、組み込み出自を検証する。--safe-shellは保存設定を変えず6領域をDefault Shellへ固定する。同じ故障版を無限再生成せず、明示再試行か新版で解除する。リボンの既存shell-failures.jsonと他領域のプロセス内記録を維持し、新しい保存ファイルを増やさない。

領域別再試行は指定先とDefault Shellだけを対象にし、無効Appletを有効化しない。全体再試行でも現在の6領域の指定先を重複排除し、不活性な旧ページ指定を再起動対象にしない。Default Shell自体の故障は最小ネイティブ通知と更新・復元手段で対処する。

## 新しい画面・領域を追加する手順

1. 本体の機能サービスと状態・保存先を決める。
2. 原則として本体rendererと共通UI部品で表示・操作を組み立てる。ページのレイアウト、スクロール、フォーカス、共通ダイアログは同じdocumentで扱う。
3. Shell化が個別に依頼された場合だけ、対象のまとまり・表示モデル・型付き操作・公開先・取得権限・寿命・復旧を定義する。
4. Shell対象を追加した場合は、Default Shellと追加Shellが同じ契約を使うこと、未提供・停止・故障時の復旧を検証する。Shell Hostへ内容固有の判断を加えない。

ホバー等の単純な表示状態まで本体mainへ集めない。一般Appletの複数Windowや同一領域の同時多重表示は別の設計対象。通知専用Windowを通常Appletの多重表示へ流用しない。

## 検証

tests/shell-region.test.cjs、shell-boundaries.test.cjsと各領域の回帰で公開契約と描画境界を確認する。本体ページはtests/host-pages.test.cjsとscripts/host-pages-ui-test.cjs、画像・通知の専用GUIで検証する。残す領域はshell-host、shell-bars、shell-overlay、shell-region、通知SurfaceのGUIを使い、固定単一EXE・隔離profileで確認する。GUIは直列に実行し、実測と未確認条件は[VERIFICATION](../VERIFICATION.md)へ記録する。

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
