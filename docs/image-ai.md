# 画像生成AI

設定 → 画像生成AIで、接続先と生成設定をまとめたプリセットサーバーを複数登録する。現在はOpenAI Images APIの文章から画像生成に対応する。登録数の固定上限は設けない。同じ接続先にも、モデル・品質・サイズ・プロンプトの異なる登録を作成できる。

## 設定と保存

一覧の追加・編集は共通ダイアログで行う。「接続」「生成設定」「プロンプト」の入力を保持し、OKで登録と認証を原子的に保存する。キャンセルは保存しない。IDは追加時に生成し、改名・並べ替えでは変わらない。IDは接続タブで確認できる。最初の登録を既定に選び、既定登録を削除した場合は未選択にする。

- 接続は登録名、サーバーID、サーバーの種類、APIのURL、認証、MCPからの利用許可の順に配置する。OpenAIのURLは `https://api.openai.com/v1`。生成時に `/images/generations` を付加する。
- 生成設定: モデルID、画像サイズ、枚数、PNG/JPEG/WebP、品質、背景、圧縮品質、待ち時間。モデルIDは利用する画像生成モデルを入力する。モデルの自動列挙は行わない。
- プロンプト: 「いつも加えるプロンプト」と「指定がないときのプロンプト」。alwaysPrompt、今回のadditionalPrompt（省略時はdefaultPrompt）、入力データinputの順で、空白だけの部分を除いて改行で結合し、送信先のpromptへ渡す。明示した空文字のadditionalPromptは既定プロンプトを抑制する。合成結果が空なら送信しない。

通常設定は `imageAi.connections` と `imageAi.defaultConnectionId`。ダイアログのMCP利用許可とともに`data/settings-<端末名>.json`の`generationAi.imageAi`へ保存する。[生成AIの端末別設定](generation-settings.md)を参照する。APIキーはPC専用rootの `image-ai-keys.json` にOS暗号化して保存し、登録IDと正規化したURLへ結び付ける。秘密のある接続先を変更する場合はキーを入力し直す。通常設定、API応答、ログへ秘密値を含めない。

設定ページの「画像生成の試験」は現在の保存済み登録へ送信し、生成画像を表示する。試験画面では選択先の既定モデルを使い、空欄の追加プロンプトは省略として扱う。画像ライブラリーへの保存は行わない。画像は完了から15分間の一時結果で、本体を終了すると消える。

OpenAIの現在の生成契約に合わせ、枚数は1～10、プロンプトは結合後32,000文字以内。サイズ・品質の対応範囲はモデルに依存する。圧縮品質はJPEG/WebPのみ0～100、透過背景はPNG/WebPのみ。PNGでは圧縮品質を空欄にする。待ち時間は待機列を含み、既定600秒。HTTP失敗・取消時の自動再送、他サーバーへの自動切替は行わない。旧DALL-EのURL返却や画像編集は対象外。

## 公開範囲と内部処理

Applet向けには `ai.image.connections.list` を提供する。`appdock-api` capabilityとread + useImageAi許可が必要で、Nodeは`context.appdock.call('ai.image.connections.list', {})`、.NETは`context.AppDock.CallAsync("ai.image.connections.list", new {}, token)`を使う。登録ID・名前・種類・既定モデル・対応機能・既定IDを返し、認証情報やプロンプトを返さず、生成サーバーへの通信も開始しない。

付随する`ai.image.jobs.get`（read）と`ai.image.jobs.cancel`（read + execute）も維持する。引数は`{jobId}`で、呼び出し元のApplet実行世代に属するジョブだけを取得・取消する。他のAppletや本体の試験ジョブはNOT_FOUNDになる。状態取得は画像本体を返さない。現在はAppletから新しい画像生成ジョブを作る公開入口はなく、生成登録APIの追加時に登録までの状態・取消へ接続する。

`ai.image.generate`と、256KiBずつ生成画像を取得する`ai.image.results.read`はAppletへ公開しない。Node/.NETの汎用Callでも実行できず、公開操作の一覧にも含めない。MCPには接続一覧・ジョブ操作を含む画像生成操作をまだ公開しない。生成・接続一覧・状態取得・取消・一時結果取得の内部機能は維持し、本体の設定試験で使用する。

「操作の許可」の画像生成AI（`useImageAi`）は項目と保存値を維持する。現在の接続一覧と、後続の「生成してライブラリーに登録するAPI」で使い、公開終了を理由に廃止・移行しない。既存保存値に項目がない場合は拒否し、新規環境のApplet既定値は従来どおり許可する。MCP列は引き続き未対応と表示する。許可がONでも非公開の操作は呼び出せない。

本体内部ではImageAiServiceが要求を受け付ける。引数は `{requestId, connectionId?, additionalPrompt?, input?, model?, options?}`。connectionIdを省略すると既定IDを使い、明示した不明IDはNOT_FOUND。既定未設定はIMAGE_AI_NOT_CONFIGURED。optionsのsize/count/formatとproviderOptions（現在はquality/background/compression）を登録の既定値へ部分適用する。変更はこの要求だけに作用する。未対応・不正な項目は拒否する。

同じ所有者のrequestIdと同じ引数は、保持中の既存ジョブを返す。異なる引数への再利用はIMAGE_AI_REQUEST_CONFLICT。`completion:'accepted'` は受付で、生成成功ではない。stateはqueued/running/completed/failed/canceled。失敗時は安全なcode/messageを返し、サーバーの応答本文は公開しない。

本体の試験表示は、完了したジョブの画像IDから内部の結果取得処理を呼び出す。現在は画像256KiB単位のBase64応答を組み立てて表示する。これは内部プレビューの転送方法であり、AppletのAPIでも画像全体の容量上限でもない。Applet RPCの1MiB制限は今回変更しない。

結果画像は15分、終端ジョブとrequestIdの重複判定は30分保持する。再起動後や保持期限後のrequestId再利用は新しい生成になり得る。結果期限切れはIMAGE_AI_RESULT_EXPIRED。取得の再試行は再生成しない。ジョブは所有者ごとに分離する。登録変更・削除・終了などによる取消後の応答は採用しない。サーバー側の処理・課金停止は保証しない。

## 設定API

`service.imageAi` は既定ID、`service.imageAi.connections` は登録一覧、`service.imageAi.connection.<base64url ID>` は個別登録の通常値を扱う。[設定API](settings-api.md)のrevision・dryRun・原子的保存に従う。IDとprotocolは変更不可、ネストした生成設定は部分変更できる。秘密のある登録の削除・URL/認証変更や秘密の入力はローカルUIで行う。設定APIの呼出しだけで画像を生成しない。

## アダプターと今後の拡張

ImageAiServiceがジョブ・権限・プリセット解決・重複判定・結果保持を所有し、ImageAdapterがサーバー固有の検証と通信を担当する。OpenAiImageAdapterはImages APIのBase64応答をバイト列へ変換し、本体は既存の画像decoderで検証してから結果へ採用する。応答URLの追加取得は行わない。

ComfyUI追加時は設定のprotocol別SchemaとUI、ワークフロー/入力の対応、queue/history/output取得を扱うアダプターを追加する。本体内部の生成・ジョブ・結果取得処理を再利用する。対応機能はアダプターのcapabilitiesから返し、モデル固有/サーバー固有の詳細を共通必須項目へ混在させない。現在ComfyUIへの接続機能はない。

生成機能を公開するときは、[アセットの実装方針](applet-assets.md)に従い、サーバーとプロンプトを指定し、ライブラリーへの登録までを一つの公開操作として扱う。AppletとMCPの両方から呼び出せるようにし、接続一覧・ジョブ状態取得・取消もその契約に接続する。生成結果専用の画像取得API・URL取得APIは追加しない。登録済みアセットはライブラリーの共通参照・URL取得へ接続する。内部では生成と登録を独立して再試行できるようにし、保存の失敗で再生成しない。画像の生成・登録APIとUI、MCP公開、Applet向けの共通URL取得は後続実装とする。

## 検証

`tests/image-ai.test.cjs` と `tests/settings-service-targets.test.cjs` はローカルfixtureで送信内容、重複、取消、期限、権限、分割取得、破損画像、保存競合と認証のロールバックを確認する。

`dotnet build tests/fixtures/dotnet/AppDock.Extensions.ImageAiProbe/AppDock.Extensions.ImageAiProbe.csproj -c Release` の後、`dev.bat exec node scripts/image-ai-ui-test.cjs [固定EXE]` で隔離設定の画面操作・本体の生成画像表示・画像生成AIの許可項目と保存値の保持、Node/.NET Appletからの非公開操作の拒否を確認する。外部OpenAIの実通信・課金、ComfyUI、MCP画像表示はこのfixture試験では検証しない。

仕様参照: [OpenAI Images生成API](https://developers.openai.com/api/reference/resources/images/methods/generate)、[MCPのツール結果](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。
