# MCPの共通設定API

設定対象や項目名をMCPツールの引数Schemaに埋め込まず、実行時のデータとして取得する。固定入口の初回導入時はクライアント側のツール更新が必要になる場合がある。その後、本体・Appletの通常設定や固定選択候補の追加ではtools/listを変更しない。

## 対象と公開判定

現在の対象は本体の外観・全般の通常設定と、Appletが宣言するboolean/number/string/固定select設定。対象は`kind: fields`、対応操作は`set`/`reset`。一覧・動的選択・専用サービスの設定は、対応adapterを実装する後続範囲。`items.list`は入口を予約しているが、現在は対応する一覧対象を公開しない。

本体の通常設定は[src/shared/host-settings.ts](../src/shared/host-settings.ts)へ登録し、HostSettingsの型と画面の操作を追加する。既定値・通常の型検証・設定カタログ・JSON投影・PC専用保存・MCP公開は同じ登録を使う。Appletは既存のmanifest設定定義を使い、MCP専用の登録を増やさない。特殊な適用手順を持つ起動登録・管理者実行・Shell・トレイ割当は、通常設定の登録へ混ぜない。

`automation`省略またはtrueをMCP公開、falseを非公開とする。secret/localOnlyはtrueでも公開しない。未宣言キー、保存ファイル全体、認証サービスや暗号化情報は探索しない。非公開項目は名前・Schema・既定値・値・検索・プレビューにも出さず、指定されてもNOT_FOUNDを返す。Appletから他のAppletを操作する既存APIは明示的なautomation:trueを維持する。

## 固定入口

| 内部メソッド | MCPツール | 用途 |
| --- | --- | --- |
| settings.targets.list | appdock_settings_list_targets | ownerId/queryで公開対象を探す |
| settings.schema.get | appdock_settings_get_schema | targetIdのフィールド・入力制約・対応操作とschemaRevision |
| settings.values.get | appdock_settings_get_values | 実効値・既定値・上書き状態とrevision。keysで絞込み |
| settings.items.list | appdock_settings_list_items | 一覧用の予約入口。fields対象への要求はINVALID_ARGUMENT |
| settings.options.list | appdock_settings_list_options | targetId/keyの固定select候補 |
| settings.apply | appdock_settings_apply | 1対象のset/resetをまとめて検証・保存 |

MCP専用の入口。読取りは「情報の取得」、applyは「情報の取得」と「設定の変更」を必要とし、コマンド実行許可は不要。dryRunと保存済み要求の再送にも最新の許可を検査する。許可自体はこのAPIから変更できない。

targets/schema/optionsはitemsと任意nextCursorを返す。limitは既定50、最大100。cursorは主体・対象・検索条件・各revisionに結び付け、変更後の続きをREVISION_CONFLICTで拒否する。1応答は256KiBまで、1項目も収まらなければRESULT_TOO_LARGE。valuesはページ分割せず、超える場合はkeysで絞り込む。

catalogRevisionは公開対象の構成、schemaRevisionは対象の公開定義、revisionは値と保存上書きの状態を表す。それぞれ用途が異なり、旧settings.getやコマンドAPIのrevisionとも交換できない。プロセス再起動後は値を再取得する。targetIdは探索結果を使い、名称から合成しない。

schemaのitemsはkey/title/type/inputSchema/default/writable/applies、operationSchemasは操作の構造を返す。valuesのfieldsはkey/value/hasValue/default/inherited/writable/appliesを返す。既定値や値が存在しなければ該当プロパティを省略する。inheritedは保存上書きがなければtrue、あればfalse。保存ファイルを読めない場合はnullとし、値は最後の有効なスナップショットを返す。読取りだけで再読込・復旧・書込みを行わない。対象が停止・無効ならavailable/writable=falseであり、applyはUNAVAILABLEを返す。

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
