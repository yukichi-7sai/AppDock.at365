# MCPハブの詳細設計（第3段階）

2026-10-18。[共通MCPクライアント](mcp-client-design.md)の利用6操作と管理3操作をMCPへ公開する。接続先やツールの追加によってtools/listの名前・説明・Schema・注釈を変更しない。接続先IDやツール名は文字列で受け取り、最新の許可に照合する。

## 公開と許可

PC専用の接続設定で「MCPへ公開」と公開するツール名の明示リストを保存する。初期はOFF・空リストで、ワイルドカードは使わない。内部AppletのuseMcpと外部MCPのallowUseMcpは独立して初期OFF。発見にはread/useMcp、実行と取消にはexecuteも必要。MCP用の許可があっても、接続先ごとの公開条件を満たさない一覧・詳細・実行は拒否する。元がMCPのAppletハンドラーにも同じ公開条件を引き継ぐ。

接続先や公開許可は本体設定UIに加え、利用者が独立した「MCP接続先の管理」を許可した共通APIから管理できる。管理許可は初期OFFで、保存には設定変更・コマンド実行の許可も必要。URL・実行パス・引数は管理用の個別取得にだけ含め、通常の利用カタログへ含めない。Bearer・環境変数値は書込み専用。管理APIと保存条件は[接続先の管理API](mcp-client-design.md#接続先の管理api)を正本とする。

## 固定入口と結果

`appdock_mcp_list_servers` → `appdock_mcp_list_tools` → `appdock_mcp_get_tool` → `appdock_mcp_call_tool`の順で発見・実行する。ジョブは`appdock_mcp_get_job`、取消は`appdock_mcp_cancel_job`。各Schemaは[操作カタログ](../src/shared/mcp-client.ts)を正本とする。

callは受付のjobIdを返し、get_jobで完了と結果を取得する。MCPでは接続先のcontentをネイティブcontentへ、ジョブのメタデータと接続先のstructuredContent/isErrorを外側structuredContentへ投影する。画像等のbase64をJSONテキストへ重複展開しない。Applet共通APIはMcpJob.resultにcontentも含む。`tool-error`は接続先のisErrorを保持し、通信失敗/結果不明のジョブも成功に置き換えない。HTML、リンク、Resourcesを自動取得・表示実行しない。

呼出し元・認証世代に結び付いたジョブだけを読める。1つのAppDock用Bearerを共有するクライアントは同じ権限主体として扱う。token更新や許可取消後のジョブは再利用しない。AppDockに届いたBearer/Cookieを下流へ転送せず、登録した下流Bearerだけを使う。HTTPのredirectとCookie利用を禁止する。

AppDockと名乗るサーバー、およびAppDockハブの入口を持つ下流は接続を拒否する。未知の第三者ハブの内部経路は推測せず、全要求の時間/件数/容量を制限する。双方向機能、MCP Tasks、新仕様だけのサーバーへ暗黙に代替しない。

## 検証の境界

同じSDK接続で下流のツールを追加・変更し、外側のメタデータ不変、最新のカタログ、許可漏れ拒否、エラーと画像の保持を検証する。ChatGPT本体の初回ツール反映とRefreshなしの増減試験は、実際の接続を更新して行う別の実機確認であり、SDK試験の成功とは分けて記録する。既存の利用中AppDockやChatGPT登録を検証のために変更しない。
