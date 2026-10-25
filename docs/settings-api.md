# MCPの共通設定API

設定対象や項目名をMCPツールの引数Schemaに埋め込まず、実行時のデータとして取得する。固定入口の初回導入時はクライアント側のツール更新が必要になる場合がある。その後、本体・Appletの通常設定や固定選択候補の追加ではtools/listを変更しない。

## 対象と公開判定

本体の外観・全般の通常設定と、Appletが宣言するboolean/number/string/selectは`kind: fields`で、`set`/`reset`に対応する。Appletのobject-listは`kind: list`で、`add`/`update`/`remove`/`reorder`に対応する。子のstring-listも列の値として編集できる。自由JSON・shortcut-list・画像参照の編集と未対応の専用サービスは、adapterを実装する後続範囲。

通知・AI/TTS・更新の通常設定も所有サービスのadapterから公開する。通常値はfields、AI接続とTTS手動ボイスの一覧はlist対象として扱う。既存の解析・検証・共有保存と再適用を使い、生成・読み上げ・接続試験を実行しない。対応範囲は下表のとおり。

| 対象 | 公開する設定 |
| --- | --- |
| AI共通 | 共通プロンプト、既定の接続ID。候補は現在の登録接続 |
| 既存AI接続 | 名前、preset、URL、認証方式、モデル、出力上限、待ち時間、compatibilityの通常値。IDとprotocolは変更対象外 |
| AI接続一覧 | 登録済み接続の公開列とID、追加・部分編集・削除・並べ替え。暗号化情報を保持する行は削除しない |
| TTS | URL、モデル、既定ボイス/速度、速度適用先、ボイス候補取得方式/相対パス |
| TTS手動ボイス一覧 | id/nameの取得・追加・部分編集・削除・並べ替え。既存の上限1,000件と解析規則を使用 |
| 通知の共通音声 | voice/speedの上書きと解除。解除するとTTSの既定値を継承 |
| 通知種類ごと | 通知先、表示時間、読み上げ、MCP Eventsの上書きと解除。種類の追加/削除/並べ替えは提供しない |
| 本体の更新設定 | 更新元、About表示時/起動時の自動確認、起動時の待ち時間と通知、同版更新の許可 |
| Appletの更新元 | ファイル型の外部AppletごとのupdateSource上書きと解除。組込みとcollectionの子ページは対象外 |

起動・その他の専用サービスと画像/アカウントの寿命操作は後続範囲。未宣言JSON全体の変更入口へ置き換えない。

暗号化情報を持つAI/TTSの接続先や認証方式を変更し、秘密の結び付け先や消去に影響する操作はLOCAL_ACTION_REQUIRED。キーが必要になる新しい認証方式への切替もローカル操作とする。モデル・速度等の非秘密値は暗号化ファイルをそのまま保持する。Schema/値/プレビュー/ログへキー・暗号文・キーrevisionを出さず、設定用の保護判定は秘密を復号しない。破損・読取拒否のメタデータも保護ありとして扱う。Schemaのwritable/resettableで現在の操作範囲を確認する。

AI接続は所有サービスが必須値を具体的に保存するため、inheritedはnull。resetは所有サービスの既定値への復帰、任意のtemperature/reasoningEffort等では項目の除去を行う。必須URLはresettable=false。一般の差分保存対象とは継承の意味が異なる。AI/TTSのAPIキー入力や認証の試験は含まない。

通知の必須通知先・許可された通知先・表示時間の型/範囲・固定寿命を既存の通知編集と同じ検証へ渡す。表示時間は整数またはnull（手動で閉じるまで）で、固定寿命の種類は変更できず、古い上書きのresetだけを受け付ける。指定した上書きだけを解除し、何も残らなければその種類の上書き行を除去する。停止中の提供元も通知設定の保存で起動しない。通知規則や音声継承元の変更はschemaRevisionへ反映する。

本体の通常設定は[src/shared/host-settings.ts](../src/shared/host-settings.ts)へ登録し、HostSettingsの型と画面の操作を追加する。既定値・通常の型検証・設定カタログ・JSON投影・PC専用保存・MCP公開は同じ登録を使う。Appletは既存のmanifest設定定義を使い、MCP専用の登録を増やさない。特殊な適用手順を持つ起動登録・管理者実行・Shell・トレイ割当は、通常設定の登録へ混ぜない。

`automation`省略またはtrueをMCP公開、falseを非公開とする。secret/localOnlyはtrueでも公開しない。未宣言キー、保存ファイル全体、認証サービスや暗号化情報は探索しない。非公開項目は名前・Schema・既定値・値・検索・プレビューにも出さず、指定されてもNOT_FOUNDを返す。Appletから他のAppletを操作する既存APIは明示的なautomation:trueを維持する。

## 固定入口

| 内部メソッド | MCPツール | 用途 |
| --- | --- | --- |
| settings.targets.list | appdock_settings_list_targets | ownerId/queryで公開対象を探す |
| settings.schema.get | appdock_settings_get_schema | targetIdのフィールド・入力制約・対応操作とschemaRevision |
| settings.values.get | appdock_settings_get_values | 実効値・既定値・上書き状態とrevision。keysで絞込み |
| settings.items.list | appdock_settings_list_items | 一覧の公開列・itemRef・削除可否とrevision。fields対象への要求はINVALID_ARGUMENT |
| settings.options.list | appdock_settings_list_options | targetId/keyの現在のselect候補。必要に応じitemRef/draftValues |
| settings.apply | appdock_settings_apply | 1対象の対応操作をまとめて検証・保存 |

MCP専用の入口。読取りは「情報の取得」、applyは「情報の取得」と「設定の変更」を必要とし、コマンド実行許可は不要。dryRunと保存済み要求の再送にも最新の許可を検査する。許可自体はこのAPIから変更できない。

targets/schema/items/optionsはitemsと任意nextCursorを返す。limitは既定50、最大100。cursorは主体・対象・検索条件・各revisionに結び付け、変更後の続きをREVISION_CONFLICTで拒否する。1応答は256KiBまで、1項目も収まらなければRESULT_TOO_LARGE。valuesはページ分割せず、超える場合はkeysで絞り込む。list対象の値はitems.listを使い、values.getでの全体取得は拒否する。

catalogRevisionは公開対象の構成、schemaRevisionは対象の公開定義、revisionは値と保存上書きの状態を表す。それぞれ用途が異なり、旧settings.getやコマンドAPIのrevisionとも交換できない。プロセス再起動後は値を再取得する。targetIdは探索結果を使い、名称から合成しない。

schemaのitemsはkey/title/type/inputSchema/default/writable/applies、operationSchemasは操作の構造を返す。valuesのfieldsはkey/value/hasValue/default/inherited/writable/appliesを返す。既定値や値が存在しなければ該当プロパティを省略する。inheritedは保存上書きがなければtrue、あればfalse。保存ファイルを読めない場合はnullとし、値は最後の有効なスナップショットを返す。読取りだけで再読込・復旧・書込みを行わない。対象が停止・無効ならavailable/writable=falseであり、applyはUNAVAILABLEを返す。

動的selectはAppletの既存settings.setOptionsが公開した現在の候補を使用する。一覧のoptionSource:web-profilesは提供元自身のWeb名簿のIDと名前だけを既存parserで読み取り、候補取得や検証のためにRemotePageServiceの初期化・session整理・接続・ページ表示を行わない。現在の候補をSchemaと保存前の検証へ反映する。候補変更でschemaRevisionも変わる。候補を取得できない場合は空とし、未知候補への変更は拒否する。保存済みで候補から消えた値は、未編集なら保持できる。itemRefは存在する行、draftValuesは公開列のキーだけを受け付ける。現在のproviderの候補はdraftValuesに依存しない。

## 一覧の行操作

items.listの行は`itemRef`・`values`・`removable`を返す。行ごとの操作制約を持つ所有サービスは`writableKeys`も返し、その時点で変更できる列を示す。valuesは公開された対応列だけで、一覧全体のdefault・未宣言データ・非公開列をSchemaやプレビューへ含めない。親のautomation:falseを子のtrueで解除しない。非公開列やIDと保存先が重なるpropertyPath/aliasesも公開しない。

| 操作 | 入力 |
| --- | --- |
| add | values。任意beforeItemRef。省略時は末尾 |
| update | itemRefとchanges。指定した公開列だけを更新 |
| remove | itemRef。保護列に値がある行はLOCAL_ACTION_REQUIRED |
| reorder | 全行のitemRefs。欠落・重複・他の一覧の参照を拒否 |

```json
{
  "targetId": "<一覧のtargetId>",
  "expectedSchemaRevision": "<最新schemaRevision>",
  "expectedRevision": "<items.listのrevision>",
  "requestId": "<新しいUUID>",
  "operations": [
    { "kind": "update", "itemRef": "<取得したitemRef>", "changes": { "name": "変更後の名前" } }
  ]
}
```

itemRefは主体・target・Schema・値のrevision・行の識別に結び付いた不透明な参照。同名行を名前で識別しない。list.idKeyがあれば内部で保存IDに対応し、ID列が公開されていれば読取り専用にする。追加時だけ既存UIと同じUUIDを生成する。IDなしの一覧には保存IDを追加せず、取得したスナップショット内の位置を使用する。保存後・Schema変更後・再起動後は行を再取得する。

宣言型一覧は最大64行。所有サービスの一覧は既存の上限に従い、SchemaのmaxItemsとreorder.itemRefsのmaxItemsで返す。AI接続は8行、TTS手動ボイスは1,000行まで扱える。要求64KiB・応答256KiBの制限は維持する。add/remove/reorderは1要求につき1件とし、他の操作と混在させない。updateは1～32件で、同じ行の同じ保存フィールドの重複を拒否する。最新行を複製して部分変更し、非公開列・未知キー・未編集の入れ子・互換形式を保持する。propertyPath・別名・数値の旧select表現は共通object-list部品で解釈し、指定された列だけを正規化する。JSON文字列で保存された旧一覧も、無変更なら書き直さない。

addは宣言済みの既定値とID生成を使い、非公開列を要求から設定させない。汎用の全体置換・一覧resetは提供しない。removeは非公開列や未対応列に値があればローカル操作とし、画像参照等の寿命管理が必要なデータを汎用削除で消さない。dryRunは公開列だけの変更計画を返す。保存結果のchangesは操作種別と公開された変更内容で、行参照は取得時のもの。保存後の参照はitems.listで再取得する。

### AI接続一覧

AI接続一覧は最大8行。IDは読取り専用で追加時にUUIDを生成し、protocolは既存のOpenAI互換方式に固定する。追加時のpresetに応じて既存UIと同じ初期値を使い、名前とURLの検証・正規化も共有する。`name`・`baseUrl`を指定する通常の追加は、認証なしの接続として保存できる。Bearer認証を必要とする新規接続はLOCAL_ACTION_REQUIREDとし、暗号化キーの登録はローカル設定画面で行う。追加のdryRunに含まれるIDはプレビュー用であり、実保存後はitems.listで確認する。

既定接続がなく登録が空の状態から最初の接続を追加すると、その接続を既定にする。既定接続を削除すると既定を解除し、別接続へ切り替えない。並べ替えは表示順だけを変更し、既定・生成優先度を変えない。既存接続ごとのfields対象も引き続き利用でき、任意値のresetはその対象で行う。

暗号化情報を持つ行はremovable=falseであり、URL・認証方式をwritableKeysに含めない。保護のない行でも、キーが新たに必要になる認証方式への切替はローカル操作にする。名前・モデル等の編集と並べ替えでは暗号化ファイルを変更しない。暗号化情報の改訂は値のrevisionへ結び付け、保存直前にも所有サービスで検査する。行の増減・編集・並べ替えだけでは一覧のschemaRevisionを変えず、保存要求の再送を妨げない。

### TTS手動ボイス一覧

ボイスIDはサーバーへ渡す文字列であり、追加時にidを明示する。UUIDを生成せず、id/nameの両方を部分編集できる。itemRefは取得時の行位置とrevisionへ束縛する。IDの大文字小文字・前後空白と入力された名前を保持し、IDが空白だけの場合や同一IDの重複は拒否する。name省略時はidを名前に使い、明示した空の名前は保持する。各文字列の上限は既存parserと同じ200 UTF-16コード単位。id/name以外の要求キーは受け付けない。

一覧はボイス候補であり、サーバーの音声登録や寿命を管理しない。追加・ID変更・削除・並べ替えではdefaultVoice、通知の音声指定、voicesSourceや接続先を自動変更しない。endpoint方式でも手動一覧を編集できるが、実際の候補取得にはvoicesSourceの指定が適用される。取得方式の変更はTTSのfields対象で行う。最後の行を削除して空配列に戻すと、共有保存のmanualVoices上書きを省略する。

既存の手動JSON編集と同じparseTtsSettings・共有保存・通常の再適用を使う。一覧の探索・取得・dryRun・保存はボイス取得通信、音声生成・再生や秘密情報の操作を開始しない。read + writeで編集でき、useTts/executeは追加条件にしない。暗号化ファイルはそのまま保持する。

## 更新設定

本体の7項目は既存UpdateSettingsの既定値と本体カタログから登録し、validateUpdateSourceとparseSettingsを使って保存する。startupDelaySecondsは0～3,600の整数。更新元は既存のGitHub指定、HTTP(S)、Windows絶対パス/UNCと空欄を受け付け、書式検証で配布先を開いたり通信したりしない。保存済み文字列の大文字小文字・パスを維持する。

Appletの更新元はmanifestのupdateRepositoryを既定値とし、上書きがなければinherited=true。既定がなければdefault/valueを省略し、hasValue=falseとする。空文字を明示すると更新を無効化し、既定がない場合もその意図を保存する。manifestに後から既定が追加されても明示した空文字は維持し、resetで上書きを取り除いて継承へ戻す。manifestの既定変更はschemaRevisionへ反映する。同名Appletは提供元IDで区別し、停止/無効のAppletも更新元の保存だけで起動・有効化しない。固有設定やenabled、PC専用値を変更しない。

適用時点は、更新元/同版許可がnextUpdateCheck、About自動確認がnextAboutOpen、起動時確認の対象/通知がnextStartupCheck、起動時の待ち時間がnextStart。起動時チェックが既に予約されていれば、対象/通知の変更はその確認でも使われるが、待ち時間を保存しても既存タイマーを作り直さない。About表示中の保存やONへの変更で通信せず、次に開いた時に通常の1時間間隔判定を行う。

設定保存はread + write、更新チェック/取得/インストールは既存の独立した更新操作を使う。設定APIの取得・dryRun・保存は更新操作、確認ダイアログ、helper起動や再起動を開始しない。

## 変更とリセット

1. targets.listから対象を選ぶ。
2. schema.getで現在のキー・入力制約・schemaRevisionを確認する。nextCursorがあれば続きを取得する。
3. values.getで必要な値とrevisionを確認する。selectはoptions.listで候補を確認できる。
4. 一意なrequestIdと両revisionを付けてapplyする。

```json
{
  "targetId": "<探索したtargetId>",
  "expectedSchemaRevision": "<schema.getのschemaRevision>",
  "expectedRevision": "<values.getのrevision>",
  "requestId": "<新しいUUID>",
  "dryRun": true,
  "operations": [
    { "kind": "set", "changes": { "theme": "dark" } },
    { "kind": "reset", "keys": ["showHints"] }
  ]
}
```

例のキーは本体の外観対象に対するもの。外側のツールSchemaにはtargetId・キー・kindの列挙を固定しないが、実行時は最新の対象定義と操作Schemaへ厳密に照合する。未対応操作、余分なプロパティ、同一キーへの複数操作、範囲・型違反は保存前に拒否する。操作は1～32件、set/resetそれぞれ1～128キー、要求本文は64KiBまで。1要求を複数対象へ分割保存しない。

resetは指定された保存上書きを解除して現在の既定値へ戻す。setで既定値を指定した場合も同じ扱いにする。既定値と等しい値が保存されている場合も上書きを解除する。変更がなければ書き込まず、revisionを変えない。共有設定とPC専用設定、Appletのローカル設定、未宣言・非公開の値は既存の保存経路と分類を使う。

dryRun:trueは同じ検証と変更計画を実行し、保存・適用を行わない。結果はcompletion=validated、保存はsettingsSaved、いずれもeffectVerified=false。changed/changes/appliesと結果revisionを返す。changesは変更される公開項目の前後値・継承状態。保存完了と、画面・OS・Appletでの効果確認は別である。適用時点は即時/nextClose/nextStart/settingsChangedを参照する。

同一主体・同じrequestId・同じ本文の再送は、最新の権限・公開定義・対象の可用性を確認したうえで、記録済みの成功または失敗を返す。異なる本文への使い回しはINVALID_ARGUMENT。同時受付中はBUSY。保存後の応答不明時は同じ要求を再送できるが、保持はプロセス内の完了済み512件までで、再起動や接続token変更で失われる。保持外の要求を再実行してもよいと推測せず、値を再取得して判断する。dryRunから実保存へ進む際は新しいrequestIdを使う。

SCHEMA_CONFLICTやREVISION_CONFLICTではSchema/値を再取得し、変更内容を見直す。要求の自動的な上書き・再試行を行わない。旧settings.getSchema/settings.get/設定生成コマンドもSettingsCommandsを使い、更新は同じ変更計画・保存へ接続する。自己設定APIは同じクラス内の既存経路を保ち、非公開キーやactivate中の自己設定を許す契約を維持する。旧入口の引数と応答形式は変更しない。
