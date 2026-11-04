# リボンの描画と操作

本体の`src/renderer/workspace`が描画し、`UiPresentation`が表示モデルと操作を所有する。配置は[本体の画面構成](workspace-ui.md)、グループ・表示モード・バッジの設定は[リボン設定](ribbon-customization-design.md)を参照する。

## 描画モデルと共通操作

| 操作                | 引数と戻り値                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ui.ribbon.get`     | 任意`contextId: "primary"`と`schemaVersion: 1                                                                                          | 2`（省略は1）。要求した版の`schemaVersion`、`epoch`、表示用`revision`、`contextId`、`dark`、`route`、`contextActionId`、`items[]`を返す |
| `ui.assets.get`     | `id`にモデル内のassetId。PNG/WebPの`dataUrl`を返す。任意の`monochrome: true`は画像のalphaをマスクにして項目の文字色を使う指定（0.115.0以降）。ファイルパス・任意URLは受け付けない |
| `ui.actions.invoke` | `epoch`、任意`contextId: "primary"`、`actionId`、一意の`requestId`。結果は`result`に入る。受付や保存と外部アプリ側の効果確認は区別する |

各項目は`id/kind/title/tooltip/placement/selected/enabled/disabledReason/actionId/icon`を持つ。schema 1の`kind`はbutton/separator、schema 2はgroupも含み、`placement`はtop/bottom。iconは名前、任意のopaque assetId、文字代替。画像1件はdata URLで1 MiB以下。構造化モデルにローカルパス・openCommand・認証情報を含めない。

表示用revisionは設定revisionと独立。完全snapshotを返し、設定・稼働状態・選択状態・画像等が変わったときに進む。旧`ribbon.get`は設定編集用として維持する。操作IDは返されたものをそのまま渡し、描画側で項目IDから機能を推測しない。非表示項目や失効したepoch/context、実行時に利用できなくなった操作は拒否する。

通常Appletは既存の`host.appdock.call`（`appdock-api` capability）を使う。MCPのtool名は`appdock_get_ribbon_view`、`appdock_get_ui_asset`、`appdock_invoke_ui_action`。取得はread、操作はexecute、テーマ変更は追加でwriteが必要。Appletのページ操作は明示公開された利用可能コマンドだけを既存`commands.execute`へ渡す。非公開コマンドの項目は外部向けモデルで無効になる。MCPは完全snapshotの定期再取得で追随し、pushは提供しない。

重複受付は最大512件、完了から2分以内。実行中の記録は期限・容量で追い出さない。本体の描画Viewはホスト発行session単位、通常Appletはworker起動単位。既存MCPはstateless HTTPのため本体epoch内のMCP呼出し全体でrequestIdを共有する。全クライアントでUUIDを使い、接続し直した後の変更操作は自動再送しない。同一IDの異なる操作は拒否する。ホスト再起動・期限切れ・容量超過をまたぐexactly-once保証はない。

## 本体内部bridge

`window.appdockRibbon`のonChangedを購読してconnectし、snapshotを描画後にready(sessionId)する。get/asset/invokeとonFocus/focusHostで状態取得・操作・Tab境界を扱う。Nodeやwindow.dockは公開しない。操作IDを機能名やコマンドIDへ変換せず、失効epoch/session・非表示項目・利用不可操作はmainが拒否する。

通常リボンと一時グループは同じHTMLを使う。一時表示では`window.appdockOverlay`を使用する。schema 2のgroupはexpansion/expanded/childCount/children/badge/colorを持ち、開いた持続型の子だけchildrenへ含める。色なしは接続線を表示しない。一時表示のanchorはリボンのCSS座標で送り、mainがzoomとView位置を変換する。スクロール・寸法変更時はinvalidateAnchorで閉じる。

iconOnlyは実効表示、hideLabelは個別指定により常にラベルを省く指定。アクセシブル名は保持する。外部`ui.ribbon.get`のschema 1/2は維持し、省略は1へ射影する。描画用モデルのキャッシュはカタログ・設定・状態・画像変更で更新し、ページ移動やグループ開閉だけでコマンド全件を再生成しない。

## 共通ライブラリーの画像

リボンの登録画像も既存assetIdで取得する。プロフィール固有の名前・頭文字・ファイル参照を描画側へ投影しない。通常項目、グループ、コマンド、宣言型Appletは同じ画像解決を使い、円形等の加工はホスト側で行う。通常項目の明示icon指定がある場合は、登録元の画像や動的アイコンを使わず、利用者の画像指定があれば画像を、そのほかは指定した固定アイコンを投影する。優先順位と選択UIは[リボンのアイコン](ribbon-customization-design.md#固定アイコンと登録画像)を正本とする。schema 1/2の描画側に原画像保存や画像ライブラリーの管理APIを追加しない。[共通画像](registered-images.md)を参照。

## リボンの表示モード

ホバー自動表示を有効にした場合も、リボンは本体から受け取る`displayMode`を描画する。検出・一時状態・手動への復帰は本体が所有し、追加描画側への新しいメソッド要求は設けない。自動ON中の既存切替操作は自動を解除して現在の表示の反対を保存する。[自動表示の仕様](ribbon-customization-design.md#ホバーによる自動表示)を参照する。

切替項目の画像/アイコンは、現在のdisplayModeに対応した共有設定のdisplayModeIconsを本体で解決し、既存のicon.name/assetIdへ投影する。リボン側で状態ごとの設定を解釈したり、新しい描画用操作を設けたりしない。未指定時の共通値引き継ぎと復元は[リボンの表示モード](ribbon-customization-design.md#リボンの表示モード)に従う。

schema 2は任意のdisplayMode（compact / expanded）を持つ。0.89.0以降のローカルリボンモデルはdisplayModeToggle（actionId / title / enabled）を追加し、リボンは本体発行のactionIdをinvokeへ渡して切り替える。切替は通常のribbon-display-mode項目として配置し、本体rendererは独立した固定ボタンを重ねない。displayModeToggleは表示中の切替項目に対する互換メタデータとして保持する。通常Applet/MCP向けモデルとschema 1の切替項目は無効でactionIdを渡さず、外部invokeは拒否する。グループpopupでは、実際にそのグループへ配置された切替項目だけを候補検査後に選択できる。モードはPC専用UI状態で、手動表示時の本体の予約幅はcompact 56px / expandedは設定幅（既定200px）。ホバー自動表示中は予約幅を56pxに固定し、expandedのリボンを本文の手前へ重ねる。追加リボンも同じモデルと操作を利用し、本体renderer専用のAPIは設けない。
