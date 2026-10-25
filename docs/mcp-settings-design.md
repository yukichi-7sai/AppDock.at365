# MCP設定公開・一覧編集・権限統合の設計

**状態: 設計のみ・未実装。** 本文の新API、公開規則、権限統合は現行仕様ではない。現行の契約は[共通操作API](appdock-api.md)、[外部操作](automation.md)、[設定基盤](settings-foundation.md)を参照する。

## 1. 目的と決定事項

1. 本体とAppletの通常設定は、共通定義に追加するとMCPへ既定で公開する。項目ごとのMCPツール追加や公開用の二重登録を不要にする。
2. `automation: false` を明示した設定は、MCP向けのSchema・現在値・検索・更新・設定生成コマンド一覧から除外する。ローカルの設定画面とコマンドの存在は維持する。
3. APIキー、Bearer token、暗号化された環境変数などの秘密情報は、MCPから取得・設定・消去できない。`automation: true` でもこの制限を解除できない。
4. 通常の一覧に取得・追加・部分編集・削除・並べ替えを提供する。固有の検証や適用処理がある一覧は、同じ入口から所有サービスへ接続する。
5. 設定編集の細分化した許可を「設定の変更」へ統合する。MCP列とApplet列は独立させ、実行・入力送信・AI等の利用許可は保持する。
6. MCPのツール名と外側の引数形式は固定する。設定・一覧・選択候補の追加を実行時に取得するデータとして扱う。
7. 保存場所、保存ID、既定値との差分保存、外部競合、原子的保存、即時反映を既存の基盤へ接続する。

対象は設定APIとその所有サービスである。任意のファイル編集、任意の内部メソッド呼出し、画面操作の汎用公開、AppletプロセスのOSサンドボックス化は含めない。設定保存に伴う通常の再適用と、独立したコマンド実行を区別する。

## 2. 現行実装と変更理由

| 現行の入口・部品 | 現状 | 設計上の変更 |
| --- | --- | --- |
| [hostSettingDefinitions](../src/shared/settings-commands.ts) | 本体の公開設定10項目を手作業で定義 | 本体の共通設定登録から公開用情報を生成 |
| [SettingsCommands](../src/main/core/settings-commands.ts) | `automation` が真の設定だけを取得・変更 | callerと保存分類を含む共通の公開判定へ集約 |
| [設定定義の検証](../src/shared/setting-definitions.ts) | 外部公開はboolean/number/string/固定selectに限定 | 公開判定と型対応を分離し、一覧・動的選択に拡張 |
| [設定カタログ](../src/shared/settings-catalog.ts) | UI用の項目・投影と公開設定が別管理 | UIとMCPで保存上の定義・検証・適用先を共有 |
| [object-list](../src/shared/object-list.ts) | 型・入れ子フィールド・別名・一覧を扱う部品がある | 公開列の投影と行単位操作を追加 |
| `replaceOwnList` | 自己設定/UI向けの一覧置換と競合検査がある | 外部APIは行操作から候補を作り、共通保存へ渡す |
| [操作許可](../src/shared/appdock-api.ts) | 16種類の許可。設定変更に複数の編集許可を重ねる | 設定編集をwriteへ統合し、8種類へ整理 |
| [MCP接続管理](../src/main/core/mcp-client-settings.ts) | token/environmentの書込みと、削除時の秘密消去が可能 | MCP起点では秘密に触れる経路を拒否 |
| [AI設定](../src/main/core/ai-settings.ts) | 設定と秘密を同じトランザクションで保存・削除 | 秘密を保持した通常設定の更新経路を分離 |
| [MCP transport](../src/main/core/automation-mcp.ts) | 固定tools/list、設定とコマンド情報は応答データ | この分離を維持して汎用設定APIを追加 |

通常設定を公開する判定と、manifestの通常コマンドを公開する判定は別である。`DeclaredCommand.automation` やカスタムコマンドの公開指定を既定ONへ変更しない。

## 3. 公開判定

### 3.1 定義と保存分類

MCPで操作するのは、共通レジストリーに登録された設定だけとする。`settings.json` 全体、未宣言キー、Storage、Secrets、キャッシュ、実行状態を走査して公開しない。

正規化した設定定義には、既存の型・範囲・既定値・表示名に加え、以下を保持する。これは内部モデルであり、すべてを外部応答へ出すものではない。

| 属性 | 用途 |
| --- | --- |
| owner / stable key / category | 提供元、保存互換のキー、検索と設定画面の分類 |
| storage | shared / device / owner-service / secret。既存の保存先から定義 |
| automation | 省略・trueはMCP公開、falseは明示非公開 |
| access | 読取り・書込み可否、immutable、localOnly、必要な既存許可 |
| validator / options provider | 型、上限、選択候補、項目間条件の共通検証 |
| reader / planner / committer | 投影、変更計画、既存所有サービスへの保存 |
| applies | 即時・次回起動・settingsChanged・OS登録等の適用時点 |

秘密分類は保存サービスと定義が所有する。キー名に`password`等が含まれるか、値が暗号文に見えるかでは判定しない。既存のSecrets/AI/TTS/MCP認証領域を汎用設定のreaderへ接続しない。

公開の判定順は次のとおりとする。

1. 宣言済みであり、呼出し元が参照できる所有範囲かを確認する。
2. secret、localOnly、親または自身の`automation: false` を除外する。子のtrueで親のfalseを解除しない。
3. 型・所有adapter・現在の可用性に応じて、読取り/更新可能な操作を決める。
4. 呼出し直前にも最新の権限と定義を再確認する。取得済みのIDやSchemaは権限の代替にしない。

非公開項目は値だけでなく、Schema、既定値、検索語、例、変更プレビュー、監査ログにも出さない。通常設定の暗号化情報に関する状態は、所有サービスが提供する`credentialConfigured`等の真偽値までとし、秘密値・暗号文・秘密由来のエラーを返さない。

### 3.2 型ごとの対応

| 型 | 自動対応 |
| --- | --- |
| boolean / number / string / 固定select | 既定公開。長さ、範囲、step、URL等の検証をUIと共有 |
| 動的select | 共通候補providerを接続して既定公開。現在の候補で保存時にも検証 |
| string-list | 宣言された文字列配列として検証・変更。一覧の子フィールドも対応 |
| object-list | 一覧targetと公開された子フィールドを生成。配列全体の外部置換は提供しない |
| registered-image | 登録済みの画像参照の選択・解除。画像の登録・ファイル操作は別の所有サービス |
| json | 構造が未宣言の自由JSONは自動書込み対象外。既知の構造または専用adapterを必要とする |
| 内部状態・未宣言キー | 対象外 |

候補取得は既存のカタログ・キャッシュ・設定候補providerを使う。外部接続、プロセス起動、画像取得、ログインは汎用読取りやdryRunの副作用にしない。外部通信を必要とする候補更新は、既存の明示操作と利用許可を通す。

`keys.close-tab`のような点を含むキーも不透明なキーとして扱う。クライアントから任意のJSONパスを指定させない。`propertyPath`、数値選択肢、別名の取扱いは登録済みの定義だけから解決する。

### 3.3 Appletとコマンドの互換性

- MCPの既定公開は、manifestにある既存の省略項目にも適用する。公開したくない通常項目は提供元が`automation: false`を明示する。
- 他Appletから共通APIを通して参照する範囲は、既存の明示公開を維持する。`isSettingAccessible(definition, caller)`を共通判定にし、MCPの変更を他Appletへ暗黙に広げない。
- MCP起点でAppletを経由した共通API呼出しには、元callerの制限も適用する。
- 自分自身の`settings.set`等は、capability・所有範囲・activate中の契約を維持する。
- `generateCommands`は明示指定を維持する。設定の既定公開だけを理由に、全booleanへON/OFF/toggleコマンドを大量生成しない。
- 既存の設定生成コマンドは同じ公開判定を使い、非公開項目を別経路から変更できないようにする。
- 停止中のAppletも静的な公開定義は取得できる。固有設定の更新は現行の稼働条件を維持し、設定編集を理由に自動有効化しない。有効/無効自体の明示変更は管理adapterで扱う。

## 4. 設定編集の許可を統合する

### 4.1 UIと内部の許可

MCPとAppletそれぞれに、以下の8種類を保持する。新しい設定カテゴリーを追加しても編集許可を増やさない。MCPの情報取得に関する現在の固定表示も維持する。

| 許可 | 意味 |
| --- | --- |
| read: 情報の取得 | 公開された設定・一覧・コマンド等を取得 |
| write: 設定の変更 | 公開された通常設定、一覧、割当、接続定義を変更 |
| execute: コマンドの実行 | 明示公開された独立した動作を実行 |
| useAi | AI機能の利用 |
| useTts | 読み上げ機能の利用 |
| useMcp | 下流MCPへの接続・ツール利用 |
| sendInput | キー等の入力送信 |
| runProcesses | プロセス起動 |

`editShortcuts / editGestures / editTouchpadGestures / editRibbon / editTray / manageMcpServers / manageCustomCommands`はwriteへ統合する。`manageApplets`も廃止し、有効/無効の保存はwrite、独立した再起動はexecuteへ振り分ける。

純粋な設定変更は`read + write`で許可し、executeを追加条件にしない。既存の`commands.execute`経由でも、コマンドを実行時のカタログで解決した後、実際の操作分類に従って判定する。IDの接頭辞やクライアントが送った分類だけで判定しない。

| 操作 | 許可・適用境界 |
| --- | --- |
| 通常設定、入力割当、リボン、トレイ、カスタムコマンド定義の編集 | read + write。割当コマンドは実行しない |
| AI/TTSの非秘密設定、MCP接続定義の保存 | read + write。試験接続やツール実行を兼ねない |
| Appletの有効/無効 | read + write。保存に伴う通常の起動/停止を含む |
| 起動設定・タッチパッド接続設定の明示変更 | read + write。所有サービスによる必要なWindows登録を含む。OS側のUAC等は省略しない |
| Applet再起動、更新チェック・更新実行 | read + execute。停止Appletを再起動で有効化しない |
| 下流MCPの未公開ツール確認・接続・ツール実行 | read + execute + useMcp |
| AI生成、読み上げ、入力送信、プロセス起動 | 既存のread/executeと各利用許可の組合せを維持 |

「設定の変更」がONでも秘密情報やlocalOnly項目は公開されない。権限そのもの、AppDock自身のMCP認証・受付・登録管理は`automation: false`とlocalOnlyを明示し、MCPから自分の権限を拡大できないようにする。Appletパッケージの導入・削除は現行のローカル経路を維持し、本設計だけで新しい公開コマンドを追加しない。

### 4.2 既存値と互換入口

- MCPの`allowWrite`、Appletの`write`を新しい「設定の変更」の正本としてそのまま引き継ぐ。旧個別許可がtrueでも、旧writeがfalseならONへ変えない。
- write=trueの場合は旧個別OFFによる例外を廃止し、公開された全設定を編集可能にする。これは意図した権限の統合であり、UI説明と実装時の案内に明記する。
- 旧manageAppletsだけがtrueだった場合、有効/無効変更にはwriteが必要になる。再起動はexecuteで判定する。
- 古い個別フラグは読込互換用として受け取るが、実効権限の判定には使わない。読んだだけではファイルを書き直さず、次の明示的な権限保存で廃止キーを整理する。
- ファイル読込の許可キー検証と、UIに表示する8種類のキーを分離する。現行AppletApiAccessは表示ラベル一覧を検証にも使うため、単にラベルを消すと旧ファイル全体が読込エラーになる。既知の廃止キーだけを互換読込で認め、未知キー・型不正の拒否と旧version 1の個別grantsを全Appletへ広げない扱いを維持する。
- 新規設定の既定値は存続する各許可の現行値を維持する。MCPのwriteは既定OFF、Applet側は現在の初期化規則を引き継ぎ、統合を理由にread/execute/利用許可を追加でONにしない。
- PC専用の`automation.json / applet-api.json`と現在の保存領域を使う。共有設定への移動や新しい保存ファイルは不要。
- 旧内部setterを残す場合、個別許可の変更をwriteの変更へ自動変換しない。廃止操作として拒否し、統合されたローカルUIへ案内する。
- 旧`*EditingAllowed`等の応答を互換目的で残す場合は、新しいwriteから導出する。再起動可否は個別コマンドのavailableで返す。
- 設定画面は8行とApplet/MCPの独立列へ整理する。設定編集にコマンド実行OFFの前提不足表示を出さない。利用許可のON/OFFを自動連動させない。

## 5. 共通レジストリーと所有サービス

本体のフィールドは`HostSettingRegistry`（仮称）、Appletはmanifestの`SettingDefinition`から、同じ`SettingsTargetRegistry`（仮称）へ登録する。UIの見た目・セクション配置は現行を維持し、保存意味のある定義と操作だけを共有する。

`SettingsTarget`は公開用のtargetId、kind（fields/list）、owner、category、子一覧、対応操作、reader、validator、planner、committerを持つ。targetIdはサーバーが発行する安定した不透明IDとし、表示名の変更で変えない。

```mermaid
flowchart LR
  H[本体の共通設定定義] --> R[設定レジストリー]
  A[Appletのmanifest] --> R
  R --> U[既存の設定UI]
  R --> P[公開判定とSchema生成]
  P --> M[固定MCP入口]
  U --> V[検証と変更計画]
  M --> V
  V --> O[設定ごとの所有サービス]
  O --> S[既存の保存と再適用]
```

共通レジストリーは保存ファイルの万能編集器にしない。host/shared/deviceの通常設定はSettingsStoreの合成・保存処理へ、起動・AI・MCP接続・Webアカウント等は各所有サービスへ接続する。UIのcontrollerがrenderer依存や秘密入力を前提にしている場合、main側の共通処理へ抽出して両入口から利用する。

新しい通常フィールドは、既存の登録先へ定義を追加すればUI用情報とMCP用情報が揃う。新しい保存領域・副作用・特殊一覧ではadapterが必要であり、型名だけから自動で保存先を推測しない。adapterがない対象を対応済みと表示しない。

本体UIの保存フィールドはこの登録を参照する規則とし、設定Schema・UIカタログと登録の不一致を検査する。未登録のままUIだけへ通常設定が増える状態は検査失敗にする。表示だけの状態や操作ボタンは別に分類し、MCP用の手書きフィールド一覧を再導入しない。

## 6. MCPの固定入口

### 6.1 初回導入と将来の追加

次の固定6操作を共通操作カタログへ追加する。初回に新ツールを認識させるためのクライアント側の再取得・リフレッシュが必要になり得る。その後の設定・一覧・候補・Applet追加ではtools/listを変えない。

| 共通API / MCPツール（設計名） | 主な入力 | 用途 |
| --- | --- | --- |
| settings.targets.list / appdock_settings_list_targets | query?, ownerId?, cursor?, limit? | 公開対象・分類・可用性の発見 |
| settings.schema.get / appdock_settings_get_schema | targetId, cursor?, limit? | フィールドと操作の型・制約・適用時点 |
| settings.values.get / appdock_settings_get_values | targetId, keys? | 通常項目の実効値・継承状態・revision |
| settings.items.list / appdock_settings_list_items | targetId, cursor?, limit? | 一覧の公開列とitemRef |
| settings.options.list / appdock_settings_list_options | targetId, key, itemRef?, draftValues?, cursor?, limit? | 現在の許可された選択候補 |
| settings.apply / appdock_settings_apply | targetId, operations, expectedRevision, expectedSchemaRevision, requestId, dryRun? | 検証と変更 |

新入口は最初は`callers: ['mcp']`とし、内部実装・保存基盤をUI/既存APIと共有する。他Applet向け公開の拡張は別途判断する。既存のsettings.getSchema/settings.get/commands.list/commands.executeは存続させる。

外側のSchemaへ設定名・targetId・一覧名・フィールド名・操作種別のenumを焼き込まない。文字列、オブジェクト、配列と共通上限だけを固定し、操作ごとの厳密なSchemaは`settings.schema.get`のデータとして返す。固定入口が受け入れた内容も、実行時の登録済みSchemaで追加プロパティを含めて厳密に検証する。

読取りはread、applyはread + write。dryRunにも同じwriteを要求する。`useMcp`は下流サーバー利用の許可であり、AppDock自身の設定API利用には要求しない。

5つの読取りツールはreadOnlyHint=true、applyはreadOnlyHint=falseかつdestructiveHint=trueとして登録する。dryRun指定によってツール定義を変えない。対象が非公開である場合は、新旧入口ともNOT_FOUND等の一般的な拒否を返し、値や定義を開示しない。

### 6.2 返却と版

- 一覧・Schemaは`catalogRevision`、個別targetは`schemaRevision`、値は`revision`を返す。いずれも不透明な文字列。
- schemaRevisionは公開する型・選択ルール・操作・適用契約の変更で変える。値だけの変更と区別する。
- revisionは対象の所有サービスと全関連保存状態を表す。既存の共有revisionを使用してよく、無関係な変更で競合が増えることを隠さない。
- 動的候補・画像参照・アカウント参照は保存直前にも現物と権限を検証する。候補を取得できたことだけで参照を有効としない。
- 応答は`schemaVersion: 1`の固定envelopeとし、通常フィールドは`key/value/default/inherited/writable/applies`等のデータへ格納する。秘密のdefaultや保存パスを含めない。
- cursorは対象・フィルター・revision・callerに束縛する。ページ途中の変更は`REVISION_CONFLICT`として最初から再取得させ、異なる版の一覧を混ぜない。
- 1ページ既定50件・最大100件、1応答の構造化JSONは256KiB以下とする。値を途中で切って成功扱いにしない。単一要素も上限超過なら`RESULT_TOO_LARGE`とする。
- 既存のMCP本文64KiB制限と設定・一覧ごとの上限を維持する。values.getは必要なkeysを絞れるようにする。

## 7. 通常項目と一覧の変更契約

### 7.1 操作

| kind | 対象・内容 |
| --- | --- |
| set | fields targetの`changes`。指定した公開フィールドだけ更新 |
| reset | fields targetの`keys`。上書きを除去して既定/継承へ戻す |
| add | list targetへ`values`で1行追加。`beforeItemRef`省略時は末尾 |
| update | `itemRef`で指定した行の`changes`だけ更新 |
| remove | `itemRef`の行を削除。所有サービスの参照・保護条件を検査 |
| reorder | 現在の全行を含む`itemRefs`で順序だけ変更 |

operationsは1～32件。set/reset/updateは同じフィールドの重複指定を拒否する。add/remove/reorderの構造操作は1要求につき1件とし、他の操作と混在させない。複数target・複数所有サービスをまたぐトランザクションは提供しない。

resetは値へのnull代入と区別する。nullを値として受け付けるかは項目のSchemaに従う。文字列配列は宣言された1フィールドの更新として扱い、object-list全体をsetへ渡すことは拒否する。

### 7.2 行の指定と非公開列

- `itemRef`はtargetと読取revisionに束縛した不透明な行参照とする。現在の配列indexだけを後続要求へ渡させない。
- 保存済みの`idKey`がある一覧では内部でそのIDへ対応させる。ID自体が公開項目なら読取り専用で返し、updateによる改名は拒否する。
- IDがない一覧では、そのスナップショット内の位置へ対応させる。変更後・再起動後には参照を失効させ、再取得を求める。保存IDの追加、既存順序の変更、移行ファイルの作成を行わない。
- 同名行を名前だけで識別しない。追加時にIDが必要なら所有adapterが通常の生成規則で作成する。
- 更新候補は最新の保存行を複製して公開列の変更だけを適用する。取得結果で行全体を上書きしない。未知キー、非公開列、未編集の入れ子、既存参照を保持する。
- 非公開列を含む行の汎用remove/resetは拒否する。保護値を保持できる専用操作がなければローカル操作とする。未知の互換データは通常更新で保持し、明示的な行削除の対象に含まれることを所有adapterが扱う。
- 新規行に必要な非公開値は、所有サービスの既定値・生成処理だけで補う。必要値を生成できなければaddを提供せず、ローカル入力が必要と返す。
- reorderはページで見えている一部の行だけでは実行できない。全ページの同一revisionのitemRefを揃え、欠落・重複・別targetの混入を拒否する。

### 7.3 適用手順

1. 呼出し元と元caller、read/write、targetの公開・可用性を確認する。
2. expectedSchemaRevisionとexpectedRevisionを照合し、ディスク上の未通知変更も確認する。
3. 登録済みSchemaで操作を検証し、最新データから候補を作る。秘密に触れる副作用がないことを所有サービスで検証する。
4. 候補全体の必須項目・重複ID・参照・上限・項目間制約を検証する。
5. dryRunなら公開項目だけの差分・適用予定・現在revisionを返す。ファイル保存、秘密復号結果の返却、OS変更、起動、通信、画像取込みは行わない。
6. 保存直前に再度競合を確認し、所有サービスで1回だけ保存する。同値なら保存・revision更新をしない。
7. 通常の再適用へ接続し、新revisionと変更結果を返す。永続化の成功と実際のOS・画面・外部サービスの効果を区別する。

requestIdはcaller単位で実行中と直近512件を保持し、同じID・同じ要求は二重適用しない。同じIDで異なる内容は拒否する。最新の公開範囲・権限・Schemaを確認してから既知requestIdを解決し、新規要求にだけ現在値のrevision検査を行う。これにより、保存成功後の再送を古いrevisionだけで失敗にせず、許可取消後や非公開化後に過去の応答を返さない。保持はプロセス内だけとし、再起動・保持範囲外・応答不明時の自動再送を保証しない。保存要求にはdryRunと別のIDを使い、最新revisionを再確認する。

成功結果は`completion: validated | settingsSaved`、`changed`、`revision`、`applies`、`effectVerified: false`を基本とする。所有サービスが提供する適用状態を別に返し、settingsSavedだけで実動作確認済みとしない。

主なエラーは`INVALID_ARGUMENT / NOT_FOUND / NOT_READY / WRITE_DISABLED / UNAVAILABLE / REVISION_CONFLICT / SCHEMA_CONFLICT / LOCAL_ACTION_REQUIRED / SAVE_FAILED / RESULT_TOO_LARGE`。途中の検証失敗で一部だけ保存しない。生の例外や秘密値を返さない。

### 7.4 要求例

以下のIDとrevisionは、同じ接続で取得したものを使用する。例示値を実際のIDとして固定しない。

```json
{
  "targetId": "host.general",
  "expectedRevision": "opaque-current-revision",
  "expectedSchemaRevision": "opaque-current-schema",
  "requestId": "c6ca297b-e997-4c92-b0cc-45593c72d20c",
  "dryRun": true,
  "operations": [
    { "kind": "set", "changes": { "soundEnabled": false } }
  ]
}
```

```json
{
  "targetId": "applet.example.records",
  "expectedRevision": "opaque-list-revision",
  "expectedSchemaRevision": "opaque-list-schema",
  "requestId": "d551cbcb-f545-4397-adb0-f5a928cc0e61",
  "dryRun": true,
  "operations": [
    {
      "kind": "update",
      "itemRef": "opaque-row-reference",
      "changes": { "name": "表示名", "enabled": true }
    }
  ]
}
```

## 8. 秘密情報と既存管理API

秘密を変更できる新APIを追加しない。既存の`mcp.servers.updateSettings`もMCP起点ではtoken/environmentを受け付けない。値を無視して成功にするのではなく、指定された場合は保存前に拒否する。暗号化環境変数は値だけでなく、その取得・編集経路自体を対象外にする。既存のenvironmentNamesもMCPへ返さず、必要なら環境変数の設定有無だけを返す。

非秘密項目の変更で、保存済みの暗号化データを復号して応答・差分・ログへ混ぜない。所有サービス内部の通常処理で既存の鍵を使用するAI/TTS/MCP実行は維持する。

| 操作 | MCP設定APIの扱い |
| --- | --- |
| 認証済み接続の表示名、モデル等の非秘密項目の編集 | 秘密と結び付け先をそのまま保持できる場合に許可 |
| 接続URL、stdio command/args/cwd、認証方式等の変更 | 秘密の結び付け先変更・消去が必要ならLOCAL_ACTION_REQUIRED |
| 秘密がある接続の削除 | 秘密の削除を伴うためローカル操作 |
| 秘密がない接続の追加・編集・削除・並べ替え | 通常の検証を満たす範囲で許可 |
| キー必須の新規接続 | キー未設定状態を既存サービスが許容する範囲のみ。検証を弱めない |
| 秘密そのものの取得・設定・消去・再発行・コピー | 非公開 |

同じ制限を汎用apply、既存専用MCP入口、設定生成コマンドに適用する。設定APIを経由する元callerがMCPなら、Appletを経由しても制限を維持する。信頼済みApplet自身のSecrets APIや本体設定UIの認証操作は維持する。

## 9. 対象別の接続方針

| 対象 | 対応範囲・所有処理 |
| --- | --- |
| 表示・一般 | 通常フィールドを共通登録。端末別保存を保持。自動起動/管理者起動はLaunchSettings、hardwareAccelerationは再起動時適用 |
| Shell選択 | 現在の領域とproviderを候補として検証。見た目の実装やShell領域は増やさない |
| Applet固有設定 | manifestから生成。非公開指定、型、既定値、共有/PC専用の選択を維持 |
| Applet共通設定 | 有効状態、起動待ち時間、更新元、ページ表示先、管理順序を既存サービスへ接続。自身の非同期ライフサイクル操作等のSELF_CALLを維持 |
| 宣言型一覧 | WebAppletの登録サイト・初期割当、壁紙のモニター設定等。固定Applet IDの特例ではなく宣言とproviderで解決 |
| 通知 | 提供元＋通知種類IDを固定行とし、設定の部分変更と上書き解除を提供。通知種類自体の追加・削除・並べ替えは提供しない。必須通知先・固定時間を維持 |
| AI / TTS | 接続、モデル、プロンプト、速度、ボイス等の非秘密設定。認証が必要な操作は前節に従う。試験生成は別操作 |
| MCP接続一覧 | 共有名簿/PC専用接続を既存トランザクションへ接続。保存だけで接続/stdio起動しない。秘密の規則を既存入口にも適用 |
| カスタムコマンド | 既存の種類Schema・ID・公開条件を維持。定義編集はwrite、実行はexecuteと実際の動作に必要な許可 |
| キー・ジェスチャー・リボン・トレイ | 既存の編集サービスを再利用。新しい共通入口と旧入口の公開/権限/保存結果を一致させる |
| 更新設定 | 更新元・自動確認・待ち時間等。更新実行は既存コマンドへ分離 |
| Webアカウント | 公開可能な名簿・候補・名前等を所有サービスへ接続。ログイン・Cookie・認証情報・session消去は非公開。認証状態に触れる削除はローカル操作 |
| 登録画像 | 登録済み参照の選択・解除は設定基盤で対応。取込み/画像削除/参照管理は専用adapterの段階で扱い、任意パスのファイルAPIを追加しない |
| 操作許可・自身のMCP受付/認証・復旧 | localOnlyと明示非公開。現在のローカルUIから操作 |

WebApplet一覧の画像・アカウント候補は、その提供元が参照できる範囲だけ列挙する。新規行の有効化やページ生成に伴う通常のreconcileは保存後に行う。dryRunでApplet起動・ページ表示・画像ダウンロードを行わない。

## 10. 実装単位と完了条件

| 段階 | 内容 | 完了条件 |
| --- | --- | --- |
| 1. 公開・権限・秘密の基盤 | caller別公開判定、8権限への統合、秘密制限、共通登録、固定API、旧入口の委譲 | 単純設定が定義追加だけでMCPに現れ、writeだけで変更でき、秘密は全入口で拒否される |
| 2. 通常一覧 | itemRef、部分更新、非公開列保持、IDなし一覧、並べ替え、動的候補 | 共通object-listの宣言だけで対応操作を取得・実行できる |
| 3. 本体と既存専用サービス | 通知、AI/TTS、MCP接続、Applet共通、起動、更新設定、既存編集API | UIとMCPが同じ保存・検証を通り、専用編集権限が残らない |
| 4. 関連データのある一覧 | Webアカウントの公開可能な名簿操作、画像の専用adapter | 認証・参照・ファイル寿命を保持し、対応操作とlocalOnlyの境界が明示される |

段階2までで通常設定と宣言型一覧を汎用化する。段階3/4は所有サービスへの接続が必要であり、「自動公開を有効にしただけ」で完了としない。各段階の実装・発行範囲は作業開始時に確定する。本書の作成は実装、版更新、発行、commit、push、Release、deployを含まない。

## 11. 互換性・保存・実装時の変更箇所

- 設定保存の形・キー・既定値・PC専用分類を維持する。定義を読み込んだだけで保存しない。既存のIDなし一覧へIDを追加しない。
- 既存の設定値取得・更新と生成コマンドは互換入口として残す。旧形式で表現できるフィールドは共通adapterへ委譲し、一覧等の新しい形式は新入口で提供する。
- 通常コマンドの公開既定、割当の公開条件、SELF_CALL/BUSY、元callerの権限の積は維持する。
- Node/.NET自己設定APIの契約を維持する。公開・権限判定の共通化でSDKごとに異なる挙動を作らない。
- secret入力の拒否、権限統合、MCPの公開既定変更は互換性変更として扱う。実装時の版更新は[共通手順](development-workflow.md)に従う。
- 起動前・保存直前の外部更新検査、破損時の保存拒否、共有/端末別の原子的保存、既定値の省略を維持する。
- 監査ログは操作名、公開対象ID、結果、処理時間を記録する。設定値・非公開列・候補の秘密値・生の要求/例外を記録しない。
- 現行の共通API文書には、後続の実装に追従していない説明もある。更新時にはコードと照合し、MCP接続管理の公開有無や細分化された許可の記述を同時に整合させる。

主な変更先は`src/shared/contracts.ts / setting-definitions.ts / settings-commands.ts / settings-catalog.ts / appdock-api.ts / automation.ts / mcp-client.ts / custom-commands.ts`、`src/main/core/settings-commands.ts / appdock-api.ts / automation.ts / applet-api-access.ts`、各所有サービス、`src/main/index.ts`の設定action接続、`ApiPermissionsSettings.tsx`と翻訳資源。新しいレジストリー/共通設定操作サービスの名前は実装時に既存命名へ揃える。

UIの表・ダイアログ・入力確定・検索・レイアウトを作り直す変更は含めない。権限画面の行整理と、共通定義を使うための接続変更を行う。

## 12. 検証計画

| 観点 | 必須の確認 |
| --- | --- |
| 自動公開 | boolean/string/number/selectを本体とfixture Appletに追加し、MCP個別定義の変更なしで取得・変更できる |
| 明示非公開 | 省略/true/false、親false、入れ子、生成コマンド、旧入口、検索、エラーの全経路で同じ判定 |
| 暗号化情報 | 取得・設定・消去・接続先変更・行削除・token/environment入力を拒否。dryRunと失敗でも暗号化ファイル不変 |
| 呼出し元 | MCP、他Applet、自己設定、MCP経由Appletを分け、公開既定と元callerの制限を照合 |
| 権限統合 | write ON/execute OFFで編集成功、write OFF/旧個別ONで編集拒否。実行・AI/TTS/MCP利用・入力/プロセスの独立性 |
| 許可保存 | 旧writeを保持、個別OFF廃止の意味、読込時無保存、廃止setter拒否、MCP/Applet列の独立性 |
| 一覧 | 同名行、IDあり/なし、未知/非公開列、入れ子、再起動、古いitemRef、全件reorder、欠落/重複、未編集値の保持 |
| 候補 | 候補変更・削除・提供元停止・権限変更を保存前に再検証。候補取得で外部接続や有効化をしない |
| 保存 | 無変更・dryRunで無書込み、競合拒否、一部失敗で無保存、既定値の省略、共有/PC専用の保持、破損拒否 |
| 再送 | 同requestId二重送信・異なる本文・実行中・保持範囲外・再起動・応答不明を区別 |
| 固定MCP入口 | 設定/一覧/候補/fixture Appletの追加前後でtools/listの名前とinputSchemaが同一。同じ既知のツールから追加設定を操作 |
| 所有サービス | 起動/入力登録、通知の必須条件、秘密付き接続、参照中アカウント/画像、停止Applet、reconcile失敗 |
| UI互換 | 既存の即時保存、IME/取消、外部競合、リセット、一覧編集。追加の見た目比較試験は作らない |

既存のsettings-commands、setting定義、settings-page、device-settings、automation、applet-api、custom-commands、mcp-client、ai-settings、通知設定、入力/リボン/トレイ試験から影響範囲を選ぶ。将来の実装検証は隔離fixtureを使い、実利用の設定・鍵・Cookie・実キー割当を変更しない。Pause/F13～F24をOSへ送信・登録しない。

設計段階では参照先・用語・API例・権限対応表・差分を検査する。製品回帰、固定EXE試験、OS/外部サービスでの実効果は実装段階で記録し、設計レビューの成功と混同しない。
