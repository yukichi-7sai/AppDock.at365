# 保存型MCPコマンドの詳細設計（第4段階）

2026-10-18。本体提供種類`appdock.mcp.call`を第1段階のCustomCommandServiceへ登録し、第2段階のMcpClientServiceを直接呼ぶ。第3段階のHTTP入口へ戻る経路は作らない。

## 保存契約とUI

configVersion 1。configは`serverId`、`toolName`、`toolRevision`、固定`arguments`、任意`timeoutMs`（1〜600秒、既定60秒）。commandIdは第1段階のUUIDのまま、名前/引数/接続先を編集しても入力割当を保持する。種類のconfig全体は16KiB以内。引数に秘密値を保存するための機能は設けず、接続のBearer/暗号化環境変数を使用する。ツール独自の秘密引数参照は初期対象外。

共通のカスタムコマンド画面でこの種類を選ぶと、接続先選択→ツール取得→1ツールのSchema取得→引数JSON入力を表示する。toolRevisionは選択した詳細から保存し、変化を自動承認しない。高度なJSON編集も同じ検証へ通す。新規・config変更・有効化・公開追加時は、直前に取得したカタログと引数を照合する。保存・dryRunはツールを実行しない。提供元の種類登録には、本体が実装する副作用のない検証/利用可否フックを追加する。

接続先未設定/無効化、認証情報欠落、既知のツール削除/Schema不一致は理由付きの利用不可になる。再起動後にキャッシュがない場合は実行時に接続・照合する。静的カタログが利用可能と表示していても、実行直前の最新照合で拒否される場合がある。未知の接続先を同名サーバーへ置き換えない。修正は接続/ツールを再選択し確認して保存する。

## 実行と許可

既存のパレット・ショートカット・ジェスチャー・トレイ・commands.executeから実行する。handlerの戻り値は`{completion:'accepted',jobId,state}`であり、外側のhandlerReturnedと区別する。完了/結果はMCP接続先画面またはmcp.jobs.get、取消はmcp.jobs.cancel。ハンドラーが受付を返した後もジョブは独立して生存し、ハンドラー終了をジョブ取消には使わない。受付前の入力取消は引き継ぐ。

元callerをホストの文脈から確定する。MCP起点はallowUseMcp + allowExecute + 接続先/ツールの公開条件、Applet起点はAppletのread/useMcp/executeを満たす必要がある。MCPからAppletを経由した起点でもMCP条件を失わない。ローカル入力はPCで許可した接続を使う。種類/定義のautomation指定は下流の公開条件を上書きしない。

ジョブ受付後の定義変更は実行中の引数を変更しない。接続/許可/呼出し元の寿命が変われば第2段階で取消する。同一操作の新たな入力は新しいrequestIdを使うが、実行中の接続先にはBUSYを返す。結果不明の操作を自動で再試行しない。

## 共通APIでの作成例

`customCommands.types.get({typeId:'appdock.mcp.call'})`と`mcp.tools.get`を取得し、`appdock.customCommands.update`へadd/updateを送る。expectedRevision、expectedTypeRevisionとdryRunは既存契約を使う。公開を希望する場合はdefinitionのautomation=trueも必要。その後shortcuts.getと`appdock.shortcuts.update`で安定commandIdを割り当てる。管理許可があっても接続先や公開許可を作成・拡大できない。

「10分後の消灯」は接続先の予約ツールに600秒などの引数を渡す単一呼出しとして検証する。AppDock自身の永続タイマーと複数操作の連結は含めない。全種類共通の個別説明文、本体のキー送信・プロセス起動、WindowsTools撤去は[種類拡張](custom-command-types-design.md)を参照し、このMCP種類のconfigとジョブ契約は維持する。
