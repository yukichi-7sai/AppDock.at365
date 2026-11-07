# 共通MCPクライアントの詳細設計

接続・保存したMCPツールコマンド・認証復旧は[端末別MCP設定](mcp-device-settings-design.md)、外部への中継公開は[MCPハブ](mcp-hub-design.md)を参照する。

## 対応範囲

既存の固定SDK 1.32.0を使用し、initialize方式のMCP 2025-11-25を主な検証対象とする。SDKの交渉対象は2025-06-18、2025-03-26、2024-11-05、2024-10-07も含むが、古い方式を個別に検証したとは扱わない。2026-07-28の新しいメッセージ方式への対応は主張しない。stdioとStreamable HTTP（JSON/SSE応答）を実装し、旧HTTP+SSEへの自動フォールバックはしない。認証はなし/Bearer。OAuth、Sampling、Elicitation、Roots、Resources、Prompts、MCP Tasks、MCP Appsは宣言・中継しない。未対応機能はエラーにする。

参照: [採用するtransport仕様](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[tools仕様](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。採用版は既存依存と実接続で決め、最新仕様を読んだことだけで互換性を保証しない。

## 保存と設定UI

接続先と保存したMCPツールコマンドは自端末の`data/settings-<端末名>.json`の`mcpClient`へ固定保存する。Bearerとstdio環境変数の名前・値は配置別LocalAppDataの`mcp-client-secrets.json`へsafeStorageで暗号化する。旧形式は引き継がない。保存形式・原子的保存・暗号文破損・復旧手順は[端末別MCP設定](mcp-device-settings-design.md)を正本とする。

設定ページは「接続先」「MCPツールコマンド」「ツール確認」の3タブと共通ダイアログを使い、フォーム専用とする。追加・編集・削除・順序・認証再入力、接続確認、ツール探索、ジョブ表示・取消を提供する。ツール確認からコマンド追加を開ける。保存・認証の再入力ではツールを実行しない。

ローカルUIでOFFからONへ変更するとinitializeとツール取得を試み、失敗時はその接続先をOFFへ戻す。接続内容が並行編集された場合は遅い失敗で上書きしない。復元したON、ONのままの名前編集・認証再入力は接続試験をせずONを保持する。起動時も遅延接続とし、認証不足は実行前に拒否する。

ON操作・接続確認・ツール確認の失敗は共通警告へ案内する。コマンド編集の探索失敗はダイアログ内に表示し、保存済み引数を保って再試行できる。形式・保存・競合の失敗もダイアログへ表示する。管理APIの保存・dryRunは接続しない。

stdioはshellを介さず絶対EXEパスと引数配列を実行する。PATH探索やnpxによる自動取得はしない。子へ渡す環境はSDKの許可リストと明示された環境変数だけ。stderrと生の通信内容は保存しない。終了・無効化・設定変更で接続を閉じ、所有する子を回収する。

## 共通サービスと発見

本体のMcpClientServiceを単一実体とし、Appletは`context.appdock.call`/`.NET AppDock.CallAsync`を使う。MCPサーバー機能OFFでも本体とAppletの利用は可能。操作は`mcp.servers.list`、`mcp.tools.list/get/call`、`mcp.jobs.get/cancel`。Appletの`useMcp`は新規環境でON、保存済みの拒否・省略は維持する。読取りはread + useMcp、実行/取消はさらにexecute。接続先の管理は本体設定UIと、独立した管理許可を持つ共通APIから同じ保存処理を使う。

## 接続先の管理API

設定の読取りはread、保存はread + write、未公開ツールの確認はread + execute + useMcpを必要とする。操作許可自体はローカル画面だけで変更する。

| 共通API / MCPツール | 必要許可 | 結果・操作 |
| --- | --- | --- |
| `mcp.servers.getSettings` / `appdock_mcp_get_server_settings` | read | 引数なしは名簿・状態とrevision。serverId指定は1接続先のitem/connectionを返す。token・環境変数・その名前は返さない |
| `mcp.servers.updateSettings` / `appdock_mcp_update_server_settings` | read + write | 最新expectedRevisionとopで登録・編集・削除・並替・PC上の有効化。dryRun:trueは検証のみ |
| `mcp.servers.inspectTools` / `appdock_mcp_inspect_server_tools` | read + execute + useMcp | serverIdで未公開を含むツール概要をページ取得。name指定時は1ツールのSchema。refresh:trueで再取得 |

管理用の取得・保存は接続・プロセス起動を行わない。inspectToolsは有効な接続先へ接続し、stdioなら指定EXEを起動する。呼出し元・元callerの管理/利用/実行許可を通信後にも再確認する。管理用の閲覧範囲をツール実行へ流用しない。通常のMCP実行には接続先のpublishedとpublishedToolsが必要。

固定6入口の[共通設定API](settings-api.md#mcp接続一覧)にも同じ所有サービスのlist対象を提供する。通常の列を行単位で部分更新し、複数行を原子的に保存できる。ID・保存場所・上限・秘密保護は既存の管理APIと共用する。両入口の公開設定の取得・保存は秘密を復号せず、名前/説明と並べ替えだけの変更ではPC接続ファイルのbytesを保つ。公開状態は接続設定から導くもので、保存済み認証の検証結果ではない。

更新の共通項目は`{op, expectedRevision, dryRun?}`。op別に次を指定する。無関係な項目は拒否する。

- `save`: `item:{id,name,description}`とconnection全項目。新規idは小文字UUID。新規接続先は`enabled:false,published:false,publishedTools:[]`から登録し、利用・公開は明示的に選ぶ。
- `remove`: `id`。秘密を持たない名簿とこのPCの接続を削除する。暗号化情報がある行の削除はローカル設定で行う。
- `reorder`: 名簿と同じID集合の`ids`配列。
- `enabled`: `id`とbooleanの`enabled`。既存のPC設定の有効状態だけを変更する。

connectionは`{enabled,transport,command,args,cwd,url,authentication,published,publishedTools}`。HTTPはcommand/cwdを空文字・argsを空配列とし、stdioはurlを空文字・authenticationをnoneとする。入力Schemaの正本は[操作カタログ](../src/shared/mcp-client.ts)。

共通APIの`save`はtoken/environmentを受け付けず、取得・設定・消去を許可しない。既存の暗号化情報がある行は、URL・EXE・引数・作業フォルダー・認証方法の変更を拒否する。名前・説明・有効状態・公開設定の変更と並べ替えでは同じ暗号文を保持する。壊れた秘密付き行の修復・削除もローカル設定で行う。ローカル設定UIの認証情報編集は従来どおり使用でき、保存済みの認証を使った通常のMCP接続・ツール利用も維持する。

共有名簿とPC設定を既存の原子的保存で更新し、他設定を保持する。dryRunは保存上限・秘密の保護も検証し、ファイルとrevisionを変更しない。競合はREVISION_CONFLICT、保存失敗はSAVE_FAILEDと安全な案内を返し、保存失敗を共通エラー通知へつなぐ。暗号化・復号・形式の失敗で元データを上書きしない。

推奨手順は「管理設定取得 → 新規IDと接続内容をdryRun → 保存 → enabledをON → 管理用ツール取得 → 公開するツール名を選んでsave → 通常のツール詳細取得・実行」。入口は固定なので、接続先の増減による外側tools/listの更新は不要。

## 接続とカタログ

接続は発見/実行時に遅延開始する。1接続先の準備は共有し、設定世代が変われば途中の応答を採用しない。交渉15秒。ツール定義・Schema・一覧全体・結果・引数・HTTP本文・stdioメッセージにAppDock独自の容量上限は設けない。上流一覧はnextCursorがなくなるまで取得し、同じcursorの循環は拒否する。一覧キャッシュは30秒と変更通知で失効し、実行前に定義を再取得する。外向け一覧は1ページ最大50件の概要だけを返し、詳細でSchemaを返す。cursorは一覧/公開範囲の識別情報へ結び付ける。

入力・出力Schemaはカスタムコマンドと同じ有界な共通部分を検証する。未対応keywordや循環参照があるツールは一覧に理由を示して実行を拒否する。Schemaを無視して実行しない。定義全体の`toolRevision`をハッシュし、呼出しに期待値を必須とする。接続先のPC設定も識別情報へ含めるので、同じIDを別URLへ変更して保存済み操作がそのまま実行されることはない。

## ジョブと結果

FastMCPの`x-fastmcp-wrap-result`はboolean型の注釈として明示対応し、Schema位置から検証時だけ除外する。包まれた`result`プロパティの型・必須条件はそのまま検証する。Schema原文は詳細とtoolRevisionに残す。任意の未知keywordを許可する変更ではない。

呼出しは検証後にjobIdを返し、状態はrunning/succeeded/tool-error/failed/cancelled/outcome-unknown。`succeeded`はMCP応答の受領で、外部効果の確認ではない。`isError`、content、structuredContentを保持し、リンクの自動取得やHTML実行はしない。同じ接続先・呼出し元への独立した要求も並行して受け付ける。開始準備中・実行中・結果保持中の件数による受付制限を設けない。受付前の発見も時間制限内に収める。

requestIdはcaller・接続・引数・toolRevisionに結び付け、同じ入力だけ保持期間中の重複送信を抑止する。別入力で同じIDは拒否する。応答の制限時間は1〜600秒（既定60秒）で、操作後の待機や操作間隔ではない。取消・タイムアウト・通信切断は自動再送せず、結果不明と効果が戻らないことを区別する。送信後のタイムアウト/切断はoutcome-unknown。ジョブはメモリーのみ、完了10分後に結果を廃棄する。再起動後はNOT_FOUNDで、再開/再送しない。

結果の整理は完了済みジョブの最早期限に1つだけ予約し、完了結果がなければタイマーを持たない。完了時は既存の予約時刻と新しい期限だけを比較し、保持中の結果全件を調べ直さない。処理中のジョブは保持期限の対象にせず、結果取得時も期限を確認する。終了時は予約を解除する。カタログの30秒キャッシュ、実行中の制限時間と取消、同じrequestIdの重複抑止は別の既存契約として維持する。

呼出し元はホストが発行する実行文脈とプロセス世代から決定し、引数から受け取らない。結果取得・取消も同じcallerに限定する。本体UIだけが全体のジョブを管理する。許可取消、Applet停止、MCP認証世代変更、接続無効化、設定変更で実行を取り消し、既存の結果へのアクセスも止める。

失敗は安全なcode/messageに変換し、ErrorReporterへ接続する。監査はjobId、serverId、状態、コードだけ。URL・引数・token・環境変数・結果・生の例外をログへ出さない。設定の警告は共通WarningReporterを使う。

## 検証

stdio/HTTPの独立fixtureで実通信、JSON/SSE結果、変更通知、認証、取消、子終了、エラー/画像/構造化結果、重複、Schema変更、上限と権限を確認する。さらに本体から既存の実MCP接続への読取りを、許可された接続の範囲で照合する。実接続が利用できなければfixtureと分けて未確認と記録する。共通設定UIは隔離profileと固定配布EXEで確認する。
