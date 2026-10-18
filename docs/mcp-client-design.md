# 共通MCPクライアントの詳細設計（第2段階）

2026-10-18、0.60.0で実装。外部への中継公開と保存型MCPコマンドは[第3段階](mcp-hub-relay-design.md)・[第4段階](mcp-command-design.md)で同じサービスへ接続した。

## 対応範囲

既存の固定SDK 1.32.0を使用し、initialize方式のMCP 2025-11-25を主な検証対象とする。SDKの交渉対象は2025-06-18、2025-03-26、2024-11-05、2024-10-07も含むが、古い方式を個別に検証したとは扱わない。2026-07-28の新しいメッセージ方式への対応は主張しない。stdioとStreamable HTTP（JSON/SSE応答）を実装し、旧HTTP+SSEへの自動フォールバックはしない。認証はなし/Bearer。OAuth、Sampling、Elicitation、Roots、Resources、Prompts、MCP Tasks、MCP Appsは宣言・中継しない。未対応機能はエラーにする。

参照: [採用するtransport仕様](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[tools仕様](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。採用版は既存依存と実接続で決め、最新仕様を読んだことだけで互換性を保証しない。

## 保存と設定UI

- 共有settings.jsonの`mcpServers: {version:1, items:[{id,name,description}]}`は最大32件。IDはUUIDで、名前変更後も一定。共有JSONに接続先のパス、URL、秘密、許可を入れない。
- PC専用`mcp-client.json`にID別のtransport、絶対EXEパス/引数配列/cwd、HTTP URL、認証方式、enabledと公開許可を保存する。Bearerと環境変数値はsafeStorageで暗号化し、設定UIにも既存値を戻さない。秘密の更新は明示入力、未指定は保持、空文字は解除。接続先を変更した場合Bearerの再入力が必要。
- PCファイルは64エントリ/1MiB以内。保存前にも同じ上限を検証する。名前だけの変更では同じ暗号文を保持し、実行中接続や保存済みtoolRevisionを失効させない。復号不能・破損・未対応版は保持してエラー表示する。
- 同期で名簿が届いてもPC設定がなければ未設定となる。自動接続・他のIDへの代替はしない。名前/PC設定/秘密の編集は共通ダイアログのOKで原子的に保存し、expectedRevision競合では入力を保持する。名簿だけのJSON編集は許可し、接続許可を変更できない。
- 設定の一覧に状態を表示し、追加/編集/削除/並替、接続確認、ツール探索、ジョブ表示・取消を提供する。全体の未保存状態は作らない。
- stdioはshellを介さず絶対パスのEXEと引数配列を実行する。PATH探索やnpxによる自動取得はしない。子プロセスへ渡す環境はSDKの許可リストと明示された環境変数だけ。stderrと生の通信内容は保存しない。終了/無効化/設定変更で接続を閉じ、所有する子を回収する。

## 共通サービスと発見

本体のMcpClientServiceを単一実体とし、Appletは`context.appdock.call`/`.NET AppDock.CallAsync`を使う。MCPサーバー機能OFFでも本体とAppletの利用は可能。操作は`mcp.servers.list`、`mcp.tools.list/get/call`、`mcp.jobs.get/cancel`。Appletの`useMcp`は新設で初期OFF。読取りはread + useMcp、実行/取消はさらにexecute。接続先の作成・秘密・公開許可は信頼された本体設定UIだけで変更する。

接続は発見/実行時に遅延開始する。1接続先の準備は共有し、設定世代が変われば途中の応答を採用しない。交渉15秒、一覧最大16ページ/512ツール、ツール定義1件64KiB、全体1MiB、結果1MiB、引数64KiBで制限する。一覧キャッシュは30秒と変更通知で失効し、実行前に定義を再取得する。外向け一覧は1ページ最大50件の概要だけを返し、詳細でSchemaを返す。cursorは一覧/公開範囲の識別情報へ結び付ける。

入力・出力Schemaはカスタムコマンドと同じ有界な共通部分を検証する。未対応keywordや循環参照があるツールは一覧に理由を示して実行を拒否する。Schemaを無視して実行しない。定義全体の`toolRevision`をハッシュし、呼出しに期待値を必須とする。接続先のPC設定も識別情報へ含めるので、同じIDを別URLへ変更して保存済み操作がそのまま実行されることはない。

## ジョブと結果

FastMCPの`x-fastmcp-wrap-result`はboolean型の注釈として明示対応し、Schema位置から検証時だけ除外する。包まれた`result`プロパティの型・必須条件はそのまま検証する。Schema原文は詳細とtoolRevisionに残す。任意の未知keywordを許可する変更ではない。

呼出しは検証後にjobIdを返し、状態はrunning/succeeded/tool-error/failed/cancelled/outcome-unknown。`succeeded`はMCP応答の受領で、外部効果の確認ではない。`isError`、content、structuredContentを保持し、リンクの自動取得やHTML実行はしない。1サーバー1件、全体4件まで実行し、待ち行列は作らずBUSYを返す。受付前の発見も時間制限内に収める。

requestIdはcaller・接続・引数・toolRevisionに結び付け、同じ入力だけ保持期間中の重複送信を抑止する。別入力で同じIDは拒否する。待ち時間は1〜600秒（既定60秒）。取消・タイムアウト・通信切断は自動再送せず、結果不明と効果が戻らないことを区別する。送信後のタイムアウト/切断はoutcome-unknown。ジョブはメモリーのみ、完了10分後に結果を廃棄し、最大64件。再起動後はNOT_FOUNDで、再開/再送しない。

呼出し元はホストが発行する実行文脈とプロセス世代から決定し、引数から受け取らない。結果取得・取消も同じcallerに限定する。本体UIだけが全体のジョブを管理する。許可取消、Applet停止、MCP認証世代変更、接続無効化、設定変更で実行を取り消し、既存の結果へのアクセスも止める。

失敗は安全なcode/messageに変換し、ErrorReporterへ接続する。監査はjobId、serverId、状態、コードだけ。URL・引数・token・環境変数・結果・生の例外をログへ出さない。設定の警告は共通WarningReporterを使う。

## 検証

stdio/HTTPの独立fixtureで実通信、JSON/SSE結果、変更通知、認証、取消、子終了、エラー/画像/構造化結果、重複、Schema変更、上限と権限を確認する。さらに本体から既存の実MCP接続への読取りを、許可された接続の範囲で照合する。実接続が利用できなければfixtureと分けて未確認と記録する。共通設定UIは隔離profileと固定配布EXEで確認する。
