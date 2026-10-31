# メモリStorageと元画像表示

Storageの共通契約は[Applet API](extensions.md#storageの保存範囲)、localページの境界は[Appletページ](applet-pages.md)を参照する。本体0.112.2、SDK/Runtime 0.27.3以降を対象とする。

## Storageの保存先

| scope          | 保存先と寿命                                                           |
| -------------- | ---------------------------------------------------------------------- |
| 省略／`device` | 従来の端末別JSONファイル                                               |
| `shared`       | 従来の共有JSONファイル                                                 |
| `memory`       | 現在のホスト内・Applet実行世代だけ。ディレクトリーもファイルも作らない |

既存の`get/set`にscopeを指定する。`storage` capability、所有Applet、キー検証、JSONと1件1MiBの制約は共通。取得・保存では値を複製し、受け渡したオブジェクトの直接変更で確定値を変更しない。メモリ保存の`null`はキー除去、未登録の取得は`null`。ファイルscopeの`null`保存の意味は変更しない。

```csharp
await context.Storage.SetAsync("state", new { paths = new[] { originalPath } }, StorageScope.Memory, cancellationToken);
var state = await context.Storage.GetAsync<System.Text.Json.JsonElement>("state", StorageScope.Memory, cancellationToken);
```

```ts
await context.storage.set('state', { paths: [originalPath] }, 'memory');
const state = await context.storage.get('state', 'memory');
```

localページからは`window.appletPage.call('storage.get', {key,scope})`と`storage.set`で自身のStorageへアクセスする。メモリ値の変更は、そのAppletの生成済みlocalページの`onChanged`へ通知する。未生成のページを開かない。停止開始・異常終了・次回起動前にすべての値を除去する。ディスクへの退避、復元、PC間同期、外部監視は行わない。

大きな一覧はStorageの1件1MiBと各実行形式のRPC上限を守り、複数の不変なメモリキーへ分割する。全区間を保存してから索引キーを切り替え、旧区間を`null`で回収すれば途中状態を公開しない。画像バイトはStorageへ格納せず、画像取得とメタデータを分離する。

## メモリに公開した元画像

`source-images` capabilityを持つ自身のlocalページに限り、実行処理がメモリStorageへ公開した画像パスから参照を作れる。HTMLから任意のパスを選んでファイルを読むAPIは公開しない。

```js
const state = await window.appletPage.call('storage.get', { key: 'state', scope: 'memory' });
const source = await window.appletPage.call('sourceImages.register', {
  key: 'state',
  pointer: '/paths/0',
  file: state.paths[0],
});
const response = await fetch(source.url, { cache: 'no-store', signal });
const bitmap = await createImageBitmap(await response.blob());
```

`pointer`はJSON Pointerで、`file`は取得済みパスとの一致確認用。生成開始時のメモリ値から対象を固定し、生成の前後で同じ実行世代・生存中の表示Viewを検査する。途中で一覧が変わっても別の対象へ読み替えない。ページ側の`storage.set`で書いた値は画像パス公開の権限には使わない。PNG/JPEG/BMP/WebPの拡張子と実ヘッダー、実ファイルを検査し、元画像のサイズをサムネイルの上限で制限しない。

結果は`{id,url,size}`。URLは不透明なIDを使う`appdock://source-images/<id>`で、ディスクパスを含めない。ページ専用Sessionのprotocol handlerが毎回元ファイルを開いて配信する。`Cache-Control:no-store`と`nosniff`を指定し、対応するlocal View以外のSessionへ公開しない。CORSはこのSessionの画像応答だけ許可し、CSPの`connect-src appdock:`と組み合わせる。サムネイルの生成・Blob URLの保持はページのJSが担当する。

元画像が移動・削除・読取不能なら画像を返さず、以前の画像へ代替しない。既に発行した参照は一覧の更新後も元の対象へ固定し、次の値の同じ位置へ読み替えない。`sourceImages.release {ids}`で参照を解放でき、非表示・View破棄・停止でも参照と読取ストリームを回収する。取得中に閉じたViewへ遅延登録を戻さない。

`sourceImages.open {id}`はOSの関連付け、`sourceImages.trash {id}`はごみ箱へ移す処理を行う。ページは削除対象を示して確認し、送信前に確認状態を消費する。二重送信・結果不明時の自動再送はしない。成功後、ホストは任意の`.NET IPageFileHandler.HandlePageFileRemovedAsync`またはNodeの`onPageFileRemoved`へ対象を通知する。通知失敗は警告ログとし、成功済みの削除を失敗として再実行させない。

## 表示中だけの画像

`snapshot.visible`と`window.appletPage.onVisibilityChanged`は、実際のページ選択・Window表示・最小化を反映する。単なる表示先の載せ替えでは入力やダイアログを失効させない。表示寿命を使うページは、非表示で取得を取り消し、Bitmap・Canvas・Blob URL・DOMの画像参照を解放する。再表示ではメモリStorageから一覧を読み直す。他のページに画像解放の動作を強制しない。
