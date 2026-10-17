# MCP接続範囲の切替設計

状態: mainに0.43.0として実装。2026-10-15、`6c893c0ecdedd267f4e71c3d796a36cab8a6570e`（0.42.0）を基準に設計・実装した。現行仕様は[共通操作APIとCodex連携](automation.md)、実行結果と未確認事項は[検証記録](../VERIFICATION.md)。以下は採用した設計と受入条件であり、実機確認済みの一覧ではない。

## 1. 目的と採用方針

MCPの接続範囲を「このPCのみ／ネットワークからも接続可能」で切り替える。LANまたはtailnet内のAIアプリから、既存の認証トークンとMCP操作許可を使って同じAppDockを操作できるようにする。

- 初期値と旧設定の移行先は「このPCのみ」。既存利用者の待受範囲を自動で広げない。
- ネットワークモードは接続元IPを限定せず、到達可能な接続元を受け付ける。LAN・tailnet以外のインターフェースも対象となるため、UIでは「LAN内だけ」と説明しない。
- 認証、操作カタログ、操作許可、設定revision、監査、共通APIの実行経路は共用する。ネットワーク用の別トークン・別権限・別MCPサーバー名を作らない。
- 同じPCのCodexは常に既存の `http://127.0.0.1:<port>/mcp` を使う。接続範囲だけの変更でCodexの登録内容を変えない。
- 初期実装の待受はIPv4を対象にする。LAN IPv4・Tailscale IPv4・IPv4へ解決されるホスト名を利用できる。IPv6の直接待受は別の拡張とし、画面の接続説明にIPv4対応を明記する。
- 接続範囲は本体の設定画面から即時保存する。公開MCPやApplet APIから変更する操作は追加しない。

Ollama APIではモデルのtool callを受けたAIアプリが実際のツールを実行する。この用途の接続元は、Ollamaを利用するMCP対応アプリまたは中継プログラムになる。モデルのtool calling対応と、アプリのStreamable HTTP・Bearer認証対応を別に確認する。[Ollama公式の例](https://github.com/ollama/ollama/blob/main/docs/capabilities/tool-calling.mdx)

## 2. 現在の実装と変更点

| 対象 | 実装前 | 実装後 |
| --- | --- | --- |
| 待受 | `127.0.0.1`固定 | `local`は従来どおり、`network`は`0.0.0.0` |
| ポート | 初回0で選択後、実ポートを保存 | 両モードで同じ値を使用。範囲変更で選び直さない |
| Host / Origin | `127.0.0.1:<port>`だけ | ローカル契約を保持し、ネットワーク向けの明示した規則を追加 |
| Codex登録URL | ループバックURL | 常に同じ。ネットワーク用URLへ置き換えない |
| トークン | 32byte乱数、safeStorageで保存 | 同一値を共用。明示操作によるコピー導線を追加 |
| 操作許可 | PC専用のMCP列 | 全MCPクライアントに同じ許可を適用 |
| 接続日時 | 全クライアント共通の最終initialize日時 | 全体・このPC・ネットワークを区別して表示 |
| 内部接続テスト | ループバックへのinitialize | 維持。LAN疎通やCodex接続成功の証明とは扱わない |

主な参照元は [automation.ts](../src/main/core/automation.ts)、[automation-mcp.ts](../src/main/core/automation-mcp.ts)、[codex-registration.ts](../src/main/core/codex-registration.ts)、[CodexSettings.tsx](../src/renderer/settings/CodexSettings.tsx)。

## 3. 保存とIPC

### 3.1 PC専用設定

既存のPC専用`automation.json`へ次を追加する。共有`settings.json`には入れず、保存ファイルも増やさない。

```ts
connectionScope: 'local' | 'network'; // 省略時 local
networkHostnames: string[];          // 省略時 []、追加の接続先ホスト名
```

`version: 1`の追加フィールドとして読み、既存のtoken・port・allow*・configFile・serverName・ownedを保持する。省略は既定値に補完するが、未知のscope、null、型違反、不正なホスト名は設定読込エラーとしてMCPを起動しない。破損ファイルを既定値で上書きしない。読込だけでは移行書込みを行わない。古い実行ファイルへ戻すと追加フィールドが失われる可能性があるため、ダウングレード後のネットワーク設定維持は保証しない。

`networkHostnames`は接続元の許可一覧ではなく、AppDockへ接続するURLの名前を追加するもの。通常はIPアドレスで接続でき、追加登録は不要。MagicDNSの完全名や独自DNS別名を使う場合だけ詳細設定で指定する。最大16件、各253文字までのASCII DNS名とし、ラベルは1～63文字の英数字・ハイフン、先頭末尾のハイフンを拒否する。小文字化・末尾ドット除去・重複除去を行い、スキーム、ポート、パス、ユーザー情報、ワイルドカード、IP表記、空文字を拒否する。DNS照会で任意の名前を自動許可しない。

### 3.2 状態と操作

`AutomationState`へ保存済み`connectionScope`・`networkHostnames`、実際の`activeConnectionScope`（停止中null）、`networkEndpoints: string[]`、`lastLocalClientAt`・`lastNetworkClientAt`、`canCopyToken: boolean`を追加する。canCopyTokenは保存済みの有効なtokenが利用できるかだけを示す。既存の`endpoint`はループバック専用のまま維持し、`lastClientAt`も互換用に保持する。トークンやAuthorizationは状態に含めない。

新規操作は本体設定UI専用の`setConnectionScope { scope }`、`setNetworkHostnames { hostnames }`、`copyToken`、`copyEndpoint { endpoint }`、`retryStart`。copyEndpointは現在稼働中のendpointまたはnetworkEndpointsに含むURLだけをmainでコピーする。既存`configure { enabled, allowWrite, port }`へscopeを混ぜず、古い設定画面や操作許可画面からのconfigureでnetworkがlocalへ戻る事故を防ぐ。専用操作は指定されたフィールドだけを更新し、無関係なallow*を上書きしない。既存busyガードで操作を直列化する。

追加操作は`dock:automation`と、既存Shell設定ページの`codex`用action許可一覧へ接続する。`permissions`ページの許可一覧へは追加しない。Settings HostとDefault Shellに別の実装を持たせず、同じAutomationServiceを呼ぶ。公開操作カタログ、MCP、Applet、WebApplet、外部Webページからは呼べないことを確認する。

## 4. 待受とHTTP検査

### 4.1 接続範囲

単一のAutomationMcpでbind先を切り替える。networkでもループバック接続を受け付け、同じポート・APIインスタンスを使用する。`0.0.0.0`は待受指定だけに使い、利用者向け接続URLには出さない。

接続URL候補は、このPCに現在割り当てられた非ループバックのIPv4アドレスから生成する。未指定、マルチキャスト、リンクローカルのアドレスは候補・自動Host許可から除く。候補は到達性を保証せず、ネットワークモードで稼働中の場合だけ表示する。設定状態の取得時に更新し、HTTP側でも要求ごとに現在のインターフェース情報を取得してHostを判定する。DHCP・VPNの切替後に古いIPを許可し続けず、ポートやCodex登録は変えない。

### 4.2 HostとOrigin

接続元IPの制限と、HTTPの接続先名・ブラウザーOriginの検査を分ける。ネットワークモードでも検査を無条件に省略しない。[MCPのStreamable HTTP仕様](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)のOrigin検査を維持する。

| モード／項目 | 許可条件 |
| --- | --- |
| localのHost / Origin | 現行と同じ。Hostは`127.0.0.1:<port>`、Originは未指定または`http://127.0.0.1:<port>` |
| networkのHost | `127.0.0.1`、現在の非ループバックIPv4、`os.hostname()`の正規化名、保存したnetworkHostnamesのいずれかと実ポートが一致 |
| networkのOrigin | 未指定、または検証済みHostと同じ`http://<host>:<port>`のOriginに限る |

networkのHost/Originは共通の厳密なparserで正規化する。Host欠落・重複、複数Origin、`Origin: null`、userinfo、パス、query、fragment、制御文字、無効なポート、許可外名を拒否する。Hostは明示した実ポートを必須とし、Originはその同一originを要求する。ヘッダー名の大文字小文字とは別に、DNS名だけを小文字化・末尾ドット除去して比較する。IPv4は正規の4区切り十進表記に限定し、整数・16進等の代替表記を許可しない。

Origin未指定はサーバー間のMCPクライアント向けに許可する。ブラウザーからの別originの直接呼出しは本設計の対象にせず、CORS許可やOPTIONS対応を追加しない。AIアプリのバックエンドから接続する。`Forwarded` / `X-Forwarded-*`を信用してHost・Origin・接続元の判定を変えない。HTTPSリバースプロキシとの互換性は別途検証し、この切替だけでTailscale Serveへ対応したとは扱わない。

### 4.3 認証と共通制限

全接続に既存の`Authorization: Bearer <token>`を必須とし、比較方法、本文読込後の再検査、token再発行による旧token失効を維持する。認証をURLやqueryへ埋め込まず、ローカル接続も認証を省略しない。

`/mcp`だけを提供し、POST・JSON応答、GET/DELETEの405、1要求64KiB、同時8要求、要求受信10秒・socket無通信60秒を維持する。同時8要求はローカルとネットワークの合計。操作のBUSYや設定競合も全接続で共有し、API・許可・revisionの状態を接続ごとに作り直さない。ネットワーク利用による混雑がCodexへも影響することは受入試験に含める。

HTTP接続自体はTLS暗号化されない。LAN直結ではトークンと要求がHTTPで流れ、tailnet経由ではTailscaleの経路で保護される。設定画面のネットワーク説明へこの違いを短く示す。証明書管理、HTTPSサーバー、ファイアウォール規則作成、ルーターのポート開放、Tailscale設定変更は今回の実装に含めない。

## 5. 切替、保存失敗、実行中要求

### 5.1 通常の切替

1. 入力検証とbusy取得後、変更対象だけを候補設定へ反映する。同値なら保存・再起動しない。
2. 候補をatomicWriteで保存する。失敗したら保存済み値と既存リスナーを維持し、操作失敗を返す。networkからlocalへの変更でも保存失敗ならnetworkのままであることを状態とエラーで示す。
3. 保存成功後に旧リスナーを受付停止にし、既存socket/要求を閉じる。受付世代を更新し、本文読込中など旧世代の要求が後からAPIを呼ばないよう、API呼出直前にも世代と受付可否を確認する。
4. 同じポートで新しいbind先へ起動する。ランダムな識別子とBearer認証を使う内部probeで、127.0.0.1への要求を自身のリスナーが受け取ったことを確認する。Windowsでワイルドカードと特定アドレスの待受が共存しても、Codexの接続先が別プロセスになる状態を成功と扱わない。probeは設定・操作APIを呼ばず、接続日時も更新しない。成功してからrunning・activeConnectionScopeを更新する。連携無効なら保存だけで、次の有効化時に適用する。
5. 失敗した場合、候補設定は保存済み、MCPは停止中としてエラーを表示する。勝手なポート変更や旧networkへの復帰は行わない。利用者は設定の修正または「接続を再試行」で回復できる。

起動処理は「待受成功」と「選択ポートの保存成功」を分けて管理し、両方が成功するまで新リスナーからAPIを実行しない。port=0で選ばれた実ポートを保存できなければ、そのリスナーを閉じて停止状態にする。保存・bind失敗後に外側のcatchがメモリだけ旧設定へ戻す現在の形を流用せず、保存済み設定・実際の待受・UIの一致を保つ。bind途中のserverも確実に破棄する。retryStartは連携有効・停止中の場合だけ同じ保存設定で起動し、有効化やポート選び直しを兼ねない。

保存や起動の最終失敗は[共通のエラー通知とログ](error-reporting.md)へ接続し、設定欄にも現在の稼働状態と対処を返す。入力検証違反は画面内だけで扱う。例外の生文、token、HTTPヘッダーをログや通知へ出さず、同じ失敗を重複通知しない。

networkHostnamesの変更は保存後に検査規則を差し替える。bind変更は不要。本文読込後にも最新規則を再検査し、削除した名前で新たなAPI実行を開始しない。ポート変更・連携無効化も同じ受付停止の仕組みを使い、登録更新の要否は次節に従う。

### 5.2 既に開始した操作

範囲の切替時にはCodexを含む通信が一時切断される。クライアントの自動再接続は保証しない。既にAPIへ渡った操作・保存・OS操作は、応答が届かなくても完了する場合がある。通信切断を操作の取消や失敗とみなさず、自動再実行もしない。

接続範囲の変更だけではトークンを更新せず、`authorizationChanged`も発火しない。共有APIのインスタンス、AI/TTSジョブと所有者世代、重複判定を維持する。連携無効化・操作許可取消・token再発行はそれぞれ既存の取消／失効経路を使う。範囲変更は、開始済み処理を取り消す機能ではない。

受付世代の切替後に旧initializeが完了しても、新リスナーの接続日時を更新しない。全接続日時をbind変更時にクリアし、自己テストは日時を更新しない。

## 6. Codex連携の互換性

| 操作 | Codexへの影響 |
| --- | --- |
| local ⇔ network | URL・token・登録名・所有hashを保持。config.tomlを書き換えず再登録不要。一時切断から復帰しなければCodex側で再接続／再読み込み |
| 接続先ホスト名の追加・削除 | ループバックURLを使うCodexへの変更なし |
| LANのIP変更・Tailscale接続切替 | ローカルCodexのURLは不変。外部クライアントのIP指定URLは必要に応じて更新 |
| ポート変更・0で再選択 | 既存どおり「登録・修復」が必要。外部クライアントのURLも更新 |
| 認証情報の再発行 | 既存どおりCodex登録を修復し、外部クライアントも新tokenへ更新。旧tokenは全接続で無効 |
| 連携無効・起動失敗 | Codexから利用不可。登録の`required=false`を保持 |

`registrationBlock()`のループバックURL限定検証と、管理コメント・所有hash・TOML検証・直前bytes照合・backup・原子的置換を変更しない。外部削除後の孤立コメント修復条件も保持する。他PCのCodexやAIアプリの設定ファイルをこの画面から編集しない。

現在の「クライアント接続」日時はCodex専用ではない。ネットワーク接続が増えてもCodexの接続成功と誤認しないよう、「このPCからの最終接続」「ネットワークからの最終接続」に分ける。分類はsocket.remoteAddressのIPv4 loopback判定で行う。このPC側でもクライアント名の自己申告をCodex認証に使わない。実際のCodexからツールが呼べたことは別途確認する。

## 7. 設定画面と外部クライアントへの登録

既存の設定ページID・検索anchorの`codex`は保持する。ページ表示名を「MCP・Codex連携」にし、設定カタログの検索語へMCP・LAN・ネットワーク・tailnetを追加する。Codexへの登録欄とネットワーク接続欄を同じページに置く。

- 「連携を有効にする」の直下へ「接続範囲」の2択selectを追加。選択確定で即時保存する。無効中でも選択できる。保存中だけ操作を抑止し、失敗時は保存済み値とエラーを表示する。
- 説明: 「このPCのみ」／「ネットワークからも接続可能（IPv4）」。「ネットワークでは、接続トークンを持つクライアントにMCPの操作許可が適用されます。HTTP接続です。利用するネットワークとファイアウォールの設定を確認してください。」
- 同じ画面に「このPCの接続先」と「ネットワークの接続先候補」を区別して表示。ネットワーク候補はIPを省略せず、URLのコピーを用意する。候補がない場合はその旨を示し、稼働・到達を保証する表示にしない。
- 詳細欄に「追加の接続先ホスト名」を置く。改行区切りの入力をblur/Enter等の確定操作で一括検証・保存する。入力中や不正値はその画面だけに保持し、全体保存バーを設けない。localでも値を保持し、network時だけ有効にする。
- ネットワーク設定欄に「接続トークンをコピー」を置く。既存tokenがないときは無効。押下時だけmainでクリップボードへ書き、IPC応答は成功・失敗だけ。トークンを画面、DOM、AutomationState、ログ、通知へ返さない。コピー先がOSクリップボードであることをボタン付近に明記する。共有クリップボード履歴を変更・削除せず、時間差のクリップボード消去も行わない。
- 「接続テスト」は「このPC内の接続テスト」と表記し、LAN到達性や接続元アプリの対応を判定しない。停止エラーには「接続を再試行」を用意する。

トークンコピーは既存の「状態では秘密値を返さない」契約を保った明示操作として追加する。Electron clipboardへの書込みをmain側で注入し、AutomationServiceが返すReplyへ秘密値を入れない。既存の本体Window/mainFrame/URL検査とShell設定ページの操作検査を通す。MCPの`ui.actions.invoke`や公開ツールへコピー操作を露出しない。

外部クライアントへ渡す情報はStreamable HTTP、`http://<AppDock-PCのIPv4または許可済みホスト名>:<port>/mcp`、Bearer tokenの3点。例の秘密値は`<token>`とし、実値を文書へ書かない。接続元とAppDock双方のルーティング／ファイアウォールで到達可能であることが前提。

同じtokenを持つクライアントは同じMCP主体として扱う。現行のAI/TTSジョブ所有・停止・参照範囲やrequestIdの重複判定も接続元ごとには分離されない。各クライアントはrequestIdにUUID等を使い、ユーザー名やIPから別主体を推測しない。クライアント別トークン・権限・監査識別は今回の対象外とする。

## 8. 実装範囲と受入条件

変更箇所は`automation.ts`（保存・状態・操作・切替）、`automation-mcp.ts`（bind・HTTP検査・受付世代・接続分類）、`src/shared/automation.ts`、`src/main/index.ts`の本体／Shell操作接続、`CodexSettings.tsx`、`src/shared/settings-catalog.ts`。Host検証の純粋関数は新しい小さなモジュールへ分けてもよい。共通APIとcodex-registrationの操作契約は変更しない。

実装時に[現行仕様](automation.md)、READMEの利用手順、開発ガイドの関連試験を更新する。設定項目追加なので実装完了時はその時点の本体版からマイナー更新し、通常publishを行う。設計だけの段階では版更新・発行・コミットを行わない。

| 確認対象 | 必須の確認 |
| --- | --- |
| 移行・保存 | 旧フィールド省略はlocal。不正設定で起動・上書きしない。token/allow*/owned等の保持。保存失敗・再起動後の一致 |
| bind | localは外部IPv4で到達不可、networkはLAN/tailnet IPv4とループバックで利用可。範囲変更で実ポート不変 |
| Host / Origin | 許可IP・名前・Originなしの成功。未知名、異ポート、悪意あるOrigin、null、重複ヘッダー、URL混入、IPv4代替表記の拒否。NIC変更と名前削除後の拒否 |
| 認証 | 両経路で未指定・誤tokenを拒否。同一tokenで成功。本文送信中の再発行も旧tokenを拒否。ログやIPC状態へ漏れない |
| 操作許可 | 既存のread/write/execute/各編集/管理/AI/TTS許可と取消が両経路に同じように作用。範囲変更で許可を変えない |
| lifecycle | 有効／無効の両状態で切替。切替中の旧要求を拒否。bind競合・保存失敗・retry・port=0の保存失敗で設定と実待受が一致 |
| 実行中操作 | 応答切断と実行結果を分ける。重複実行しない。範囲変更だけでAI/TTSの所有者世代・ジョブ・設定revisionを破棄しない |
| Codex互換 | 切替前後でconfig.tomlのbytes・登録block・所有hash不変。localhost initialize/tools/list/tools/callの再接続。既存の登録／修復／解除・孤立コメント回帰 |
| 複数クライアント | ローカルと別端末が同時利用。同時数、BUSY、revision競合、requestId重複とジョブ共有の既存契約を確認 |
| UI・コピー | 実際の設定UIで切替・エラー復帰・検索・コピー。mainだけがtokenを扱い、公開APIやWebページからコピーを呼べない。URL候補と停止表示の正確さ |
| 接続表示 | 自己テストは日時を更新しない。ローカル／ネットワークを区別。ネットワーク接続だけでCodex確認済みと表示しない |
| 実機 | 別LAN端末とtailnet端末のMCPクライアントでinitialize・一覧・安全な読取を確認。Ollama利用アプリのtool call→MCP実行→結果返却も確認 |

`tests/automation-network.test.cjs`を追加し、既存の`tests/automation.test.cjs`、`tests/appdock-api.test.cjs`と合わせて回帰を確認する。`scripts/automation-ui-test.cjs`から`automation-network-checks.cjs`を実行する。実ネットワークの疎通は同一PCから自分のLAN IPを呼ぶ試験だけで代替しない。固定発行EXEでlocal／network両モードとCodex互換のSDK接続を確認し、実際に試したクライアント・モデル・接続経路・未確認事項をVERIFICATIONへ記録する。
