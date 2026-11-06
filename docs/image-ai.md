# 画像生成AI

設定 → 画像生成AIで、接続先と生成設定をまとめたプリセットサーバーを複数登録する。現在はOpenAI Images APIの文章から画像生成に対応する。登録数の固定上限は設けない。同じ接続先にも、モデル・品質・サイズ・プロンプトの異なる登録を作成できる。

## 設定と保存

一覧の追加・編集は共通ダイアログで行う。「接続」「生成設定」「プロンプト」の入力を保持し、OKで登録と認証を原子的に保存する。キャンセルは保存しない。IDは追加時に生成し、改名・並べ替えでは変わらない。IDは接続タブで確認できる。最初の登録を既定に選び、既定登録を削除した場合は未選択にする。

- 接続: 登録名、種類、APIのURL、認証方式、APIキー。OpenAIのURLは `https://api.openai.com/v1`。生成時に `/images/generations` を付加する。
- 生成設定: モデルID、画像サイズ、枚数、PNG/JPEG/WebP、品質、背景、圧縮品質、待ち時間。モデルIDは利用する画像生成モデルを入力する。モデルの自動列挙は行わない。
- プロンプト: 「いつも加えるプロンプト」と「指定がないときのプロンプト」。前者と、要求のprompt（省略時は後者）を改行で結合する。APIで明示した空文字は既定プロンプトを抑制する。両方が空なら送信しない。

通常設定は `imageAi.connections` と `imageAi.defaultConnectionId`。本体の共有/端末別設定分類を使用する。APIキーはPC専用rootの `image-ai-keys.json` にOS暗号化して保存し、登録IDと正規化したURLへ結び付ける。秘密のある接続先を変更する場合はキーを入力し直す。通常設定、API応答、ログへ秘密値を含めない。

設定ページの「画像生成の試験」は現在の保存済み登録へ送信し、生成画像を表示する。画像ライブラリーへの保存は行わない。画像は完了から15分間の一時結果で、本体を終了すると消える。

OpenAIの現在の生成契約に合わせ、枚数は1～10、プロンプトは結合後32,000文字以内。サイズ・品質の対応範囲はモデルに依存する。圧縮品質はJPEG/WebPのみ0～100、透過背景はPNG/WebPのみ。PNGでは圧縮品質を空欄にする。待ち時間は待機列を含み、既定600秒。HTTP失敗・取消時の自動再送、他サーバーへの自動切替は行わない。旧DALL-EのURL返却や画像編集は対象外。

## 共通API

最低本体版は0.165.0。Appletは `appdock-api` capabilityを宣言し、Nodeは `context.appdock.call`、.NETは `context.AppDock.CallAsync` を使う。両者で同じ操作名・引数を利用できる。

| 操作 | 内容 | 必要許可 |
| --- | --- | --- |
| `ai.image.connections.list` | ID・名前・種類・既定モデル・対応機能・既定ID | read + useImageAi |
| `ai.image.generate` | 文章から画像生成を受け付ける | read + execute + useImageAi |
| `ai.image.jobs.get` | 自分のジョブの状態・画像ID・期限を取得 | read |
| `ai.image.jobs.cancel` | 自分のジョブを取り消す | read + execute |
| `ai.image.results.read` | 自分の結果画像を分割取得 | read + useImageAi |

`useImageAi` は「操作の許可」のApplet列で切り替える。既存保存値に項目がない場合は拒否し、新規環境のApplet既定値は既存方針に従って許可する。MCPの画像生成操作は今回公開せず、MCP列は未対応と表示する。MCP経由のAppletコマンドも画像生成許可を迂回できない。

生成の引数は `{requestId, connectionId?, prompt?, model?, options?}`。connectionIdを省略すると既定IDを使い、明示した不明IDはNOT_FOUND。既定未設定はIMAGE_AI_NOT_CONFIGURED。optionsのsize/count/formatとproviderOptions（現在はquality/background/compression）を登録の既定値へ部分適用する。変更はこの要求だけに作用する。未対応・不正な項目は拒否する。

同じ呼び出し元のrequestIdと同じ引数は、保持中の既存ジョブを返す。異なる引数への再利用はIMAGE_AI_REQUEST_CONFLICT。返り値の `completion:'accepted'` は受付で、生成成功ではない。jobs.getのstateはqueued/running/completed/failed/canceled。失敗時は安全なcode/messageを返し、サーバーの応答本文は公開しない。

`completed` のimagesは `{id,mimeType,byteLength}[]`。画像本体を含めず、results.readへ `{jobId,imageId,offset?}` を渡す。dataはBase64、offset/nextOffsetは復号後のバイト位置、doneがtrueになるまで取得する。1応答は画像256KiB以下に分割し、既存native RPCの1MiB行制約内に収める。画像全体の容量上限ではない。

```ts
const accepted = await context.appdock.call('ai.image.generate', {
  requestId: crypto.randomUUID(),
  connectionId: '設定画面に表示されたID',
  prompt: '朝の光が差す、緑に囲まれた小さな家',
});
// 呼び出し側の待機処理でjobs.getを読み、completedを確認する。
const job = await context.appdock.call('ai.image.jobs.get', { jobId: accepted.jobId });
if (job.state === 'completed') {
  for (const image of job.images ?? []) {
    let offset = 0;
    const parts: Buffer[] = [];
    for (;;) {
      const part = await context.appdock.call('ai.image.results.read', {
        jobId: job.jobId, imageId: image.id, offset,
      });
      parts.push(Buffer.from(part.data, 'base64'));
      offset = part.nextOffset;
      if (part.done) break;
    }
    const bytes = Buffer.concat(parts);
    // bytesを呼び出し側の用途へ渡す。
  }
}
```

結果画像は15分、終端ジョブとrequestIdの重複判定は30分保持する。再起動後や保持期限後のrequestId再利用は新しい生成になり得る。結果期限切れはIMAGE_AI_RESULT_EXPIRED。取得の再試行は再生成しない。画像を永続利用する機能は期限内に保存する。ジョブは呼び出し元のApplet実行世代へ結び付け、他Applet・再起動後のAppletから取得できない。許可撤回・登録変更・削除・終了時は待機/実行中の処理を取り消し、取消後の応答は採用しない。サーバー側の処理・課金停止は保証しない。

## 設定API

`service.imageAi` は既定ID、`service.imageAi.connections` は登録一覧、`service.imageAi.connection.<base64url ID>` は個別登録の通常値を扱う。[設定API](settings-api.md)のrevision・dryRun・原子的保存に従う。IDとprotocolは変更不可、ネストした生成設定は部分変更できる。秘密のある登録の削除・URL/認証変更や秘密の入力はローカルUIで行う。設定APIの呼出しだけで画像を生成しない。

## アダプターと今後の拡張

ImageAiServiceがジョブ・権限・プリセット解決・重複判定・結果保持を所有し、ImageAdapterがサーバー固有の検証と通信を担当する。OpenAiImageAdapterはImages APIのBase64応答をバイト列へ変換し、本体は既存の画像decoderで検証してから結果へ採用する。応答URLの追加取得は行わない。

ComfyUI追加時は設定のprotocol別SchemaとUI、ワークフロー/入力の対応、queue/history/output取得を扱うアダプターを追加する。呼び出し側の生成・ジョブ・結果取得APIは維持する。対応機能はアダプターのcapabilitiesから返し、モデル固有/サーバー固有の詳細を共通必須項目へ混在させない。現在ComfyUIへの接続機能はない。

次段階では「生成」と「生成済み結果の画像ライブラリー登録」を分けて再試行できるサービスを用意し、それを「生成してライブラリーへ取り込む」MCP操作から利用する構成が適する。登録失敗を理由に再生成せず、登録済み画像IDを主な戻り値とし、必要時だけプレビュー画像を添える。MCPはimage contentを扱えるが、クライアント側の対応・画像転送量も考慮し、Base64を通常のJSONテキストへ詰め込む方式は採らない。ライブラリー連携とMCP公開は今回の実装範囲外。

## 検証

`tests/image-ai.test.cjs` と `tests/settings-service-targets.test.cjs` はローカルfixtureで送信内容、重複、取消、期限、権限、分割取得、破損画像、保存競合と認証のロールバックを確認する。

`dotnet build tests/fixtures/dotnet/AppDock.Extensions.ImageAiProbe/AppDock.Extensions.ImageAiProbe.csproj -c Release` の後、`dev.bat exec node scripts/image-ai-ui-test.cjs [固定EXE]` で隔離設定の画面操作・画像表示・Node/.NET Appletの共通APIを確認する。外部OpenAIの実通信・課金、ComfyUI、MCP画像表示はこのfixture試験では検証しない。

仕様参照: [OpenAI Images生成API](https://developers.openai.com/api/reference/resources/images/methods/generate)、[MCPのツール結果](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。
