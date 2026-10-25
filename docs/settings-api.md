# MCPの共通設定API

設定対象や項目名をMCPツールの引数Schemaに埋め込まず、実行時のデータとして取得する。固定入口の初回導入時はクライアント側のツール更新が必要になる場合がある。その後、本体・Appletの通常設定や固定選択候補の追加ではtools/listを変更しない。

## 対象と公開判定

本体の外観・全般の通常設定と、Appletが宣言するboolean/number/string/selectは`kind: fields`で、`set`/`reset`に対応する。Appletのobject-listは`kind: list`で、`add`/`update`/`remove`/`reorder`に対応する。子のstring-listも列の値として編集できる。自由JSON・shortcut-list・画像参照の編集と専用サービスの設定は、対応adapterを実装する後続範囲。

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

items.listの行は`itemRef`・`values`・`removable`を返す。valuesは公開された対応列だけで、一覧全体のdefault・未宣言データ・非公開列をSchemaやプレビューへ含めない。親のautomation:falseを子のtrueで解除しない。非公開列やIDと保存先が重なるpropertyPath/aliasesも公開しない。

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

一覧は最大64行。add/remove/reorderは1要求につき1件とし、他の操作と混在させない。updateは1～32件で、同じ行の同じ保存フィールドの重複を拒否する。最新行を複製して部分変更し、非公開列・未知キー・未編集の入れ子・互換形式を保持する。propertyPath・別名・数値の旧select表現は共通object-list部品で解釈し、指定された列だけを正規化する。JSON文字列で保存された旧一覧も、無変更なら書き直さない。

addは宣言済みの既定値とID生成を使い、非公開列を要求から設定させない。汎用の全体置換・一覧resetは提供しない。removeは非公開列や未対応列に値があればローカル操作とし、画像参照等の寿命管理が必要なデータを汎用削除で消さない。dryRunは公開列だけの変更計画を返す。保存結果のchangesは操作種別と公開された変更内容で、行参照は取得時のもの。保存後の参照はitems.listで再取得する。

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
