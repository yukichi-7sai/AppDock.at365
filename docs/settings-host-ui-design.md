# 設定画面の本体統合とsettings-uiの整理

状態: 実装済み（2026-10-18、0.58.0）。設計作成: 2026-10-17。設定画面はすべてのShellで共通とする方針に基づく。管理用Applet詳細タブは0.73.0で廃止し、管理一覧から共通画面へ移動する。[管理仕様](applet-management-settings-design.md)を参照。旧applet contextの型・検査は互換経路として保持する。現行動作は[設定基盤](settings-foundation.md)を参照する。本書は採用した設計を記録する。実行結果と未確認事項はVERIFICATIONを参照する。

## 目的と決定

設定画面を本体rendererで描画し、Shell Appletによる差し替え対象から外す。`src/shared/settings-ui`のReact部品とCSS、およびDefault Shellの設定画面を本体renderer配下へ集約する。

- 全体設定、Applet詳細の設定、WebAppletの設定本文は、同じ本体の設定画面部品を使う。
- 設定の即時保存、検証、競合検査、検索、部分JSON、操作許可は既存基盤を維持する。
- リボン、ホーム、ログ、通知、共通オーバーレイのShell差し替えは継続する。
- 設定画面を他Shell向けのUI SDKとして配布する仕組みは追加しない。
- 設定画面の見た目や入力方法の全面改修、保存形式の再設計は行わない。

本体rendererへの統合は、設定の検証・保存処理までrendererへ移すことを意味しない。保存の正本は引き続きmain側のSettingsStoreとする。

## 現状の確認

2026-10-17のソースを基準とする。

| 現在の場所 | 現在の役割 |
| --- | --- |
| `src/shared/settings-ui/` | 入力、カード、一覧、ダイアログ、Applet設定フォーム等のReact部品とCSS |
| `shells/default/settings.tsx`・`settings.css` | 独立した設定rendererの起動、モデル購読、全体設定とApplet本文の描画 |
| `shells/default/settings/` | 設定ページ各種、インデックス、レイアウト、SettingsViewClient |
| `src/renderer/main.tsx` | 全体設定を`ShellPageSlot kind="settings"`で表示。別途useSettingsEditorも保持 |
| `src/renderer/AppletSettingsPanel.tsx` | 設定タブはShellPageSlot、ショートカットタブは本体のAppletShortcutOverview |
| `src/main/core/settings-page.ts` | SettingsPageSession。ページの投影、検索、操作ID、編集セッションへの接続 |
| `src/main/core/settings-input-session.ts` | SettingsInputSession。既存の即時保存受付とrevision管理 |
| `src/main/core/shell-page-host.ts` | 設定を含むページ用WebContentsView、提供元、ready・flush・復旧 |

設定UIは現在、Shellだけの利用ではない。Toggle、VersionCheck、AppletShortcutOverviewとcontrols.cssは本体rendererからも参照される。一方、調査時点でsettings-uiへの直接参照は本体rendererとDefault Shellの設定実装に集まっている。

Shellカタログの現行実装は9領域であり、`page.settings`を除いた統合後は8領域となる。一部の既存文書には過去の8領域という記述が残っているため、実装時は`src/shared/shell.ts`の実装を基準に更新する。

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
| `src/main/core/settings-page.ts` | 同じ場所 | ShellPageController実装から本体設定ページのセッションへ変更 |

settings-uiのapi.tsxは本体内部の制御依存として扱う。現在は別documentにある2つの`configureSettingsControls`が、統合後に同じグローバルを書き換える構造を残さない。`SettingsControlsProvider`と`useSettingsControls`によるReact Contextへ変更し、本体ルートでは既存DockApi、SettingsPage配下ではそのSettingsViewClientのcontrolsを渡す。部品の利用側はContextから取得する。設定フォームの操作は発行済み操作IDを通し、本体の他画面は設定画面の表示有無に依存させない。

ui-icons等、他Shellも利用する素材はsharedに残す。settings-uiという名前だけを理由に、設定スキーマや共通操作APIまでrendererへ移さない。

## 描画と入力の接続

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

SettingsPageSessionはShellPageRequest/Action/ModelのunionとShellPageControllerに依存しない形へ変え、SettingsPageRequest/Action/Modelを直接受け取る。changed、release等の依存は本体側から渡す。

### 入力キューと寿命

SettingsViewClientのtransportを注入可能にし、`window.appdockPage.connect/act/onChanged`を上記bridgeへ置き換える。最新モデルの取得、自己操作だけのbefore更新、外部競合の拒否、失敗入力の画面内保持は再利用する。長時間操作は入力キューを占有せず、取消操作を受け付ける。

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
- ShellPageSlot用の高さ・座標計算を設定から外し、flex/min-height/overflowで利用可能な本文領域を使う。狭幅、スクロール、検索項目移動、左一覧幅の既存状態を維持する。
- `--restore-view`の設定カテゴリ・Applet詳細タブ復元を維持する。カテゴリ更新だけで復元成功とせず、対象本文の描画まで確認する。
- 設定を開くコマンドIDと既存ナビゲーションの入口は維持する。Shell提供元に依存せず、safe-shellでも本体の共通設定を開く。

## page.settingsの廃止と互換入力

### アクティブなShell契約

`page.settings`をshellRegions、アクティブなShellRegion、表示設定の提供元一覧、領域状態・自己状態、再試行対象から外す。設定を組み込みShellへ固定割り当てする実装は残さない。

ShellPageRequest/Model/Actionのunionから設定を外し、ShellPageSlot、ShellPageHostのcontroller生成、設定用requiresFlushとschema互換判定の不要部分を撤去する。残りのページ・オーバーレイ・通知に必要な共通処理は残す。設定用の内部bridgeとShellのページbridgeは明確に分離する。

### 既存の指定とmanifest

| 入力 | 統合後の扱い |
| --- | --- |
| 保存済み`host.shellProviders["page.settings"]` | 値を保持するが動作・提供元選択には使わない。フォームには選択欄を出さない |
| 部分JSON内の旧設定領域キー | 互換入力として構文検証して保持する。保存しても設定画面は本体のまま |
| 旧`host.shellProvider`単一指定 | 従来の移行対象8領域を固定リストで展開。旧設定領域キーも互換値として保持し、動作には使わない |
| 外部manifestの`views["page.settings"]` | 旧宣言として検証・読込を許容するが、HTMLを起動しない。他の有効な領域を継続する |
| 設定領域だけを提供する旧Applet | 通常のAppletとして管理可能なまま、設定の提供元にはならない。自動削除・自動無効化しない |
| `shellRequirement.region: "page.settings"` | 互換宣言として読込可能にするが、条件は常に不成立。非表示/実行不可の理由を返す |
| その他の未知領域・未導入Applet指定 | 従来どおり保持する。今回の廃止対象と混同しない |

アクティブ領域と互換読込専用の廃止領域を分ける。型は例えば`ShellRegion`と`LegacyShellRegion`、条件宣言は両者を表現可能にする。`isShellRegion`に廃止領域を戻すことで起動対象まで復活させない。

特に現在のparseShellProvidersは現行カタログから旧8領域を算出しているため、単にカタログを削ると旧データの展開結果が変わる。移行専用の固定リストへ変更し、overlay.ribbon-groupを旧単一指定から除外する既存挙動も維持する。

条件付きコマンドは`extension-commands.ts`と`extensions.ts`のmanifest検証で廃止領域を許容し、カタログ生成時と実行直前の両方で不成立を適用する。条件を削除して無条件コマンドへ変換しない。別名・runtime登録・自動有効化で回避できないことを確認する。

旧キーを残すのは設定ファイルの破壊的な一括書換えを避け、旧版へ戻す場合の情報を保つためである。起動時の書換え、新しい保存ファイル、他領域の割り当て変更は行わない。更新案内には設定画面の差し替え終了と共通画面への切り替えを明記する。Shell apiVersion全体の一括更新は行わず、残る領域の既存契約を維持する。

## ビルド・依存境界・文書の変更

- `vite.shell.config.mts`からsettings入力を外し、Default Shell manifestからpage.settingsを外す。workerや他領域のビルドは継続する。
- `vite.config.mts`でビルドされる本体rendererから設定コンポーネントを参照する。追加npm依存、DLL相当の共有UIパッケージ、別の設定アプリは導入しない。
- 更新後の配布物に独立した設定ShellのHTML/JSが残らないことを確認する。ビルド出力の再生成を通し、過去の成果物を手動混在させない。
- shell-boundariesの本体とShell間の実装import禁止を維持する。残るShellが`src/renderer/settings`や`settings-ui`を参照しない検査と、sharedに設定React実装が残らない検査を加える。
- 実装時にrepoのAGENTS.mdの「設定本文はShell」の規則を新方針へ更新する。ワークスペースルートのAGENTS.mdは変更しない。
- 実装時にsettings-foundation、settings-list-editing、shell-foundation、shell-pages、shell-region-assignment、shell-page-layout、DEVELOPMENT、影響するApplet開発/API文書を整合させる。旧方式は移行説明に限定し、現行仕様として併記しない。

## 実装の順序

1. **本体用契約の分離**: SettingsPageSessionをShellPageControllerから独立させ、本体bridgeと送信元・接続検査を追加。既存の投影・操作・保存試験を接続して確認する。
2. **描画部品の移動**: settings-uiと設定ページ群をrenderer配下へ移し、SettingsPageを全体設定・Applet詳細の両入口へ接続。入力キュー、flush、共有制御依存、テーマとフォーカスを整理する。
3. **設定Shellの撤去と互換読込**: 同じ変更セット内で旧Shell描画の呼出元・成果物とアクティブ領域を除去し、旧割り当て・manifest・コマンド条件の互換方針を実装する。移行途中の二重描画を出荷しない。
4. **検証基盤の移行**: 設定Surfaceを探す共通helperと、直接settings.htmlへ接続する試験を本体documentへ更新。旧Shell復旧の試験を、本体固定表示・旧宣言無視・他領域継続の試験へ置き換える。
5. **レビュー・記録・発行**: 差分と影響先をレビューし、必要な検証を終えて文書・版を更新。本体だけを通常publishし、固定EXEを隔離確認する。

実装は本書の方針に従う。実装時には公開契約の撤去と設定項目の廃止を含むため、[共通手順](development-workflow.md#版更新の判断)に従って本体をマイナー更新する。具体的な版は実装着手時の版から決定する。未変更Appletの版更新・再発行、全体ZIP作成、commit/push/Release/deployはこの設計作業に含めない。

## 検証計画と完了条件

### 単体・契約

既存のsettings-editing/settings-page/settings-sync/applet-settings/settings-commandsの必要範囲を継続する。Shellを前提とした型・fixtureは本体用へ変更し、以下を追加する。

- 本体bridgeは正しい本体フレームと接続だけを受け付ける。旧接続、別フレーム、非表示/別対象からの操作を拒否する。
- 全体設定とApplet詳細の操作範囲、部分JSON許可、発行済み操作ID、再送抑止、外部競合、古い応答の無視を維持する。
- flushで送信待ち入力が先に処理され、キュー自身を待つ循環や二重送信を起こさない。
- 現行8領域と旧8領域の移行リストを区別する。旧設定領域キー、未知キー、旧manifestは保持・許容されても、設定Shellを起動しない。
- 廃止領域を条件にしたコマンドは、別名・runtime置換を含め常に不成立。ほかの領域のresolved/visible条件は維持する。
- 本体とShellの実装import境界、型検査、本体・Default Shellのビルドが成功する。

### GUIと固定配布物

`scripts/settings-shell-helper.cjs`を本体設定Surface用helperへ移行し、利用側をまとめて更新する。`settings-immediate-helper.cjs`、automation、portable-updates、update-result-banner等のsettings.html直接探索も検索して更新する。単にhelper名を変えて古いShell探索を残さない。

| 確認範囲 | 主な既存試験・実装時の追加確認 |
| --- | --- |
| 設定の入力・保存 | settings-shell-ui-testを本体設定試験へ再編。連続入力、IME、不正JSON/数値、失敗値保持、外部変更、画像、原子的保存 |
| 共通UI | settings-usability、settings-url、settings-layout、settings-scroll。明暗、狭幅、候補欄、native dialog、Tab/Escape、スクロール |
| 共通本文・検索 | applet-settings、settings-search、applet-sidebar、web-list。両入口の保存値一致、検索移動、対象削除、停止/無効Applet |
| 寿命と復元 | navigation、settings-recovery。急速なカテゴリ/対象切替、flush失敗・期限、再読込、通常再起動と更新後復元 |
| 残るShell | shell-region、shell-host、shell-home、shell-page。別Shell選択/故障/safe起動中も設定は本体に表示され、他領域だけが切替・復旧する |
| 機能別操作 | 移動したAI/TTS、通知、アカウント、操作許可、更新、トレイ、ショートカット・ジェスチャーの関連試験を影響範囲に応じて選択 |

GUIは直列・隔離profileで実行する。固定配布物でも設定が本体document内に表示され、設定用WebContentsViewが生成されないことを確認する。本体画面のcaptureと対象DOMを照合し、カテゴリ変更だけで成功としない。実Google受信、物理入力、実スピーカー等の外部効果はfixture成功と区別して記録する。

完了条件は、設定UIが本体配下へ集約され、Shellの状態に依存せず全入口から操作でき、旧互換入力が他領域を壊さず、保存・入力・表示の必要回帰と配布物確認が成功することである。レビュー、実行結果、未確認事項はVERIFICATIONへ記録する。
