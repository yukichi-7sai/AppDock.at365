# 画像生成AI

設定 → 画像生成AIで、接続先と生成設定をまとめたプリセットサーバーを複数登録する。現在はOpenAI Images APIの文章から画像生成に対応する。登録数の固定上限は設けない。同じ接続先にも、モデル・品質・サイズ・プロンプトの異なる登録を作成できる。

## 設定と保存

一覧の追加・編集は共通ダイアログで行う。「接続」「生成設定」「プロンプト」の入力を保持し、OKで登録と認証を原子的に保存する。キャンセルは保存しない。IDは追加時に生成し、改名・並べ替えでは変わらない。IDは接続タブで確認できる。最初の登録を既定に選び、既定登録を削除した場合は未選択にする。

- 接続は登録名、サーバーID、サーバーの種類、APIのURL、認証、MCPからの利用許可の順に配置する。OpenAIのURLは `https://api.openai.com/v1`。生成時に `/images/generations` を付加する。
- 生成設定: モデルID、画像サイズ、枚数、PNG/JPEG/WebP、品質、背景、圧縮品質、待ち時間。モデルIDは利用する画像生成モデルを入力する。モデルの自動列挙は行わない。
- プロンプト: 「いつも加えるプロンプト」と「指定がないときのプロンプト」。alwaysPrompt、今回のadditionalPrompt（省略時はdefaultPrompt）、入力データinputの順で、空白だけの部分を除いて改行で結合し、送信先のpromptへ渡す。明示した空文字のadditionalPromptは既定プロンプトを抑制する。合成結果が空なら送信しない。

通常設定は `imageAi.connections` と `imageAi.defaultConnectionId`。ダイアログのMCP利用許可とともに`data/settings-<端末名>.json`の`generationAi.imageAi`へ保存する。[生成AIの端末別設定](generation-settings.md)を参照する。APIキーはPC専用rootの `image-ai-keys.json` にOS暗号化して保存し、登録IDと正規化したURLへ結び付ける。秘密のある接続先を変更する場合はキーを入力し直す。通常設定、API応答、ログへ秘密値を含めない。

設定ページの「画像生成の試験」は選択したサーバー登録のモデルで生成し、生成画像を表示する。空欄の追加プロンプトは省略として扱う。画像ライブラリーへの保存は行わない。画像は完了から15分間の一時結果で、本体を終了すると消える。

OpenAIの現在の生成契約に合わせ、枚数は1～10、プロンプトは結合後32,000文字以内。サイズ・品質の対応範囲はモデルに依存する。圧縮品質はJPEG/WebPのみ0～100、透過背景はPNG/WebPのみ。PNGでは圧縮品質を空欄にする。待ち時間は待機列を含み、既定600秒。HTTP失敗・取消時の自動再送、他サーバーへの自動切替は行わない。旧DALL-EのURL返却や画像編集は対象外。

## 画像ライブラリーから生成

画像ライブラリーの「画像を生成」で共通ダイアログを開く。選択中の実フォルダーとグループを引き継ぎ、生成した全画像を自動で追加する。保存名は拡張子なしで指定し、空欄なら自動命名する。同名ファイルは連番で別々に保存する。サーバー、追加プロンプト、サイズ・枚数・形式は今回だけ変更でき、登録済みの設定を書き換えない。

結果を並べて比較し、サムネイルから共通の拡大表示を開く。保存後の名前変更・ごみ箱への削除はライブラリーの共通処理を使う。生成条件を各結果へ残す。閉じるときは処理中・未保存の結果があれば確認し、このダイアログのジョブだけを取り消す。保存済み画像と外部APIのジョブは残る。

## Applet・MCP共通API

最低ホスト版0.175.0。Appletは`appdock-api` capabilityと各操作の許可が必要。MCPサーバーとCodex連携は同じ操作カタログを使う。MCP全体の`allowUseImageAi`と接続ごとの`mcpEnabled`は既定OFFで、Appletの`useImageAi`とは独立して端末別に保存する。

| 操作 | MCPツール名 | 必要な許可 |
| --- | --- | --- |
| `ai.image.generateAndRegister` | `appdock_image_generate_and_register` | read, write, execute, useImageAi |
| `ai.image.jobs.retrySave` | `appdock_image_retry_save` | read, write, execute, useImageAi |
| `ai.image.connections.list` | `appdock_image_list_connections` | read, useImageAi |
| `ai.image.jobs.get` | `appdock_image_get_job` | read |
| `ai.image.jobs.cancel` | `appdock_image_cancel_job` | read, execute |

接続一覧は登録ID・名前・種類・登録のモデル・対応機能・既定IDを返す。秘密値やプロンプトは返さず、サーバーへ通信しない。MCPでは公開を許可した接続だけを列挙し、明示指定でも非公開接続の利用を拒否する。

生成登録の引数は`{requestId, connectionId?, additionalPrompt?, input?, options?, destination}`。destinationは`{folder, name?, group?}`。folderは既存の実フォルダーの相対パスで、ルートは空文字。nameは拡張子なしの保存名、groupは既存グループID。パス・グループ・書込可能性を生成前に検証する。モデルは接続設定から確定し、要求のmodel指定は拒否する。optionsのsize/count/formatとproviderOptions（quality/background/compression）は接続の既定値へ部分適用する。

```ts
const accepted = await context.appdock.call('ai.image.generateAndRegister', {
  requestId: crypto.randomUUID(),
  input: '水彩の花',
  destination: { folder: '', name: 'flower' },
});
const job = await context.appdock.call('ai.image.jobs.get', { jobId: accepted.jobId });
// completedになるまで追跡する。unsavedは再生成せずjobs.retrySaveで再保存する。
```

.NETも`context.AppDock.CallAsync("ai.image.generateAndRegister", new { requestId, input, destination = new { folder = "", name = "flower" } }, token)`と汎用Callを使う。専用SDKメソッドや新たな通信経路は追加しない。

受付は`completion:'accepted'`とjobIdを返す。状態はqueued（待機）、running（生成）、saving（登録）、completed（全画像の保存と分類完了）、unsaved（保存・分類の一部が未完了）、failed、canceled。`images`は`{id,mimeType,byteLength,ref?,registration?}`の一覧で、保存した画像には既存の`ref:{file}`が入る。registrationはpending/saved/group-pending。生成画像のバイナリ、Base64、一時URLは返さない。ref.fileはライブラリー内の相対パスで、移動・改名で変わる。永続IDやアセット取得APIは追加しない。

同じ所有者・requestId・引数（保存先を含む）の要求は保持中の既存ジョブを返し、引数が違えばIMAGE_AI_REQUEST_CONFLICT。明示した不明connectionIdはNOT_FOUND、既定未設定はIMAGE_AI_NOT_CONFIGURED。応答消失時の再送は保持期間と所有者の寿命に限って重複を防ぐ。保持期間後・再起動後は再生成され得る。

保存失敗はIMAGE_AI_SAVE_FAILEDとして共通エラー通知へ接続する。unsavedには再保存期限resultExpiresAtを返す。生成済みの未保存バイト列は失敗から15分間メモリーで保持し、`jobs.retrySave({jobId})`は未完了分だけを保存する。グループ登録だけが失敗した画像は同じrefで分類だけを再試行する。保存済みファイルは再作成しない。期限後はresultExpiredとなり、再保存はIMAGE_AI_RESULT_EXPIRED。自動再生成・自動再送は行わない。再試行後の失敗はその時点から保持期間を設定する。終端ジョブとrequestIdは最後の試行終了から30分保持する。

ジョブ所有者はApplet実行世代またはMCP受信機の認証lease。両受信機、他Applet、本体UIのジョブは相互に取得・取消できない。MCP経由のAppletは双方の許可を満たす必要がある。生成・保存中は最新の許可と接続設定を再確認する。許可撤回・接続変更・停止・取消後に未着手の保存を進めず、既に確定したファイルを削除しない。保存処理と取消が競合した場合、確定済みのrefが後からジョブへ反映されることがある。サーバー側の計算・課金停止は保証しない。

## 内部プレビュー

設定ページの試験は登録を伴わない内部ジョブを使う。`ai.image.generate`と`ai.image.results.read`は公開しない。内部では256KiB単位で一時結果を読み出し、本体rendererで表示する。試験結果は15分、終端ジョブは30分保持する。Applet RPCの1MiB制限とは独立した内部転送処理であり、新しい取得APIの契約にはしない。

## 設定API

`service.imageAi` は既定ID、`service.imageAi.connections` は登録一覧、`service.imageAi.connection.<base64url ID>` は個別登録の通常値を扱う。[設定API](settings-api.md)のrevision・dryRun・原子的保存に従う。IDとprotocolは変更不可、ネストした生成設定は部分変更できる。秘密のある登録の削除・URL/認証変更や秘密の入力はローカルUIで行う。設定APIの呼出しだけで画像を生成しない。

## アダプターと今後の拡張

ImageAiServiceがジョブ・権限・プリセット解決・重複判定・結果保持を所有し、ImageAdapterがサーバー固有の検証と通信を担当する。OpenAiImageAdapterはImages APIのBase64応答をバイト列へ変換し、本体は既存の画像decoderで検証してから結果へ採用する。応答URLの追加取得は行わない。

ComfyUI追加時は設定のprotocol別SchemaとUI、ワークフロー/入力の対応、queue/history/output取得を扱うアダプターを追加する。本体内部の生成・ジョブ・結果取得処理を再利用する。対応機能はアダプターのcapabilitiesから返し、モデル固有/サーバー固有の詳細を共通必須項目へ混在させない。現在ComfyUIへの接続機能はない。

[アセットの実装方針](applet-assets.md)に従い、生成から登録までを共通APIで扱う。将来の画像取得は、このrefを使うライブラリー共通のアセット取得へ接続する。共通URL取得APIと永続IDは未実装で、生成結果専用の取得APIは追加しない。

## 検証

`tests/image-ai.test.cjs` と `tests/settings-service-targets.test.cjs` はローカルfixtureで送信内容、重複、取消、期限、権限、分割取得、破損画像、保存競合と認証のロールバックを確認する。

`tests/image-registration.test.cjs`は元画像の保存、複数枚の部分成功、分類だけの失敗、保存だけの再試行、取消、所有者、保持期限を検査する。同じ.NET fixtureのReleaseビルド後に`dev.bat exec node scripts/image-generation-ui-test.cjs [固定EXE]`でライブラリーUI・Node/.NET Applet・MCPサーバー・Codex受信機を検証する。通信先はローカルfixtureだけを使い、有料の実生成は行わない。

`dotnet build tests/fixtures/dotnet/AppDock.Extensions.ImageAiProbe/AppDock.Extensions.ImageAiProbe.csproj -c Release` の後、`dev.bat exec node scripts/image-ai-ui-test.cjs [固定EXE]` で隔離設定の画面操作・本体の生成画像表示・画像生成AIの許可項目と保存値の保持、Node/.NET Appletからの非公開操作の拒否を確認する。外部OpenAIの実通信・課金、ComfyUI、MCP画像表示はこのfixture試験では検証しない。

仕様参照: [OpenAI Images生成API](https://developers.openai.com/api/reference/resources/images/methods/generate)、[MCPのツール結果](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。
