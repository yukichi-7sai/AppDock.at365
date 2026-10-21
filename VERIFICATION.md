# 検証記録

対象の現行版は`0.76.5`。以下は記録した条件での検証結果であり、外部サービスや実機条件の現在の動作保証とは区別する。

## 2026-10-21: READMEと開発文書の整理

- 前回のREADME整理を本体・7Applet・30.PROJECTの9repoへ先行コミットした。実効author/committerとstage/commit treeの一致、コミット直後のcleanを確認。commit一覧と照合値は.artifacts/commit-validation-readme-20261021/commits.json。
- コミット前の文書検査は成功。壁紙AppletのJSON例検証を含む既存回帰は9つのPASS群・終了0で、完全ログを同フォルダーのwallpaper-regression.logへ保存した。画像ギャラリーのビルドにより更新されたvendorの版メタデータは今回の変更へ含めず、元の内容へ戻した。
- 開発文書を現行仕様の正本へ整理した。会話上の人物名・発言、不要な版別説明とデータ移行案内を除き、設定・ページ・Shell・入力・画像・通知・MCP等の重複を統合。完了済み計画書・実装履歴・リポジトリ内の旧リリースノートを削除した。Gitの履歴、生ログ、配布物は保持した。
- VERIFICATIONは現行版の最新検証を残し、記録した条件と現在の外部動作保証を区別する。最低ホスト版、現在のSDK/API/保存形式、既定値、入力・保存・認証・復旧の境界を保持した。共有設定参照先の未実装設計は、現行契約と区別して残した。
- 文書構造、全ローカル参照、人物名、JSON例、壁紙テストが読むJSON例の一致、非文書差分がないこと、diff checkを検査し、すべて成功。証跡は.artifacts/docs-cleanup-20261021/validation.jsonと同フォルダーの検査・整理スクリプト。文書のみのため製品回帰・GUI・版更新・publishは行わない。整理分のcommit treeとpush先端の照合結果は.artifacts/commit-validation-docs-20261021/へ記録する。

## 2026-10-21: 割り当てカードの見出し・余白と通知の説明位置（0.76.5）

- 全体設定のショートカット一覧を`SettingsSection`へそろえ、「ショートカット割り当て」「マウスジェスチャー割り当て」とhint「＋で割り当てを追加します。」を追加。ジェスチャーだけの上余白を削除し、両方の本文paddingとヘッダーからの距離を同じ共通規則へ統一した。Applet詳細の共用一覧へ見出しを重ねず、割り当ての保存・検索・並べ替え・追加ダイアログは保持した。
- 通知の「読み上げ」内の項目名を「TTS設定」に変更。「現在の声」「現在の速度」を各項目のdescriptionへ移し、共通/個別設定とヒントのON/OFFによらず有効値を表示する。MCP連携設定のdescriptionは指定の「MCP Eventを使用するには、MCPサーバーの設定と連携が必要です。」へ変更した。声/速度の保存値・継承・設定への移動先は保持した。
- 検索メタデータも新しい割り当て見出しへそろえ、ページID・項目アンカーと旧検索語を維持。共通配置・説明の規則を`docs/settings-foundation.md`へ記載した。設定項目・保存ファイルの増減がない表示変更としてパッチ更新。発行前レビューは阻害指摘なし。
- 型検査・本体/Default Shellビルド成功。発行後に変更した共通カタログの依存、CSS/版とnative出力を参照する**17ファイル140/140**を実行。残り**620件**は前回0.76.4の完全ログ、747入力の差分と依存選択を照合して再利用し、標準回帰は計**760/760、fail/skip 0**。lockfile・ツール・SDK/API/保存処理と他の標準試験は不変。
- 固定EXEの`settings-hints-ui-test.cjs --assignment-speech-only` **7群**成功。明暗×1280/760幅で見出し・ヒント、同一paddingと配置、割り当て追加の取消/設定保持、ヒントOFF時にも残る通知description、声/速度の個別保存と共通設定への復帰、TTS/MCPへの移動、新見出しの検索を確認した。配置の実測は0.1px未満の丸め差を許容し、computed paddingは完全一致を検査。固定EXE smokeと試験コピーのhash照合も成功し、画像を目視確認した。
- `publish.bat`終了0。本体EXE/feed/Default Shellは**0.76.5 / 168976010 bytes / SHA256 `2321ffd3a67be2b9cc8e50418af8047af5b0878ae8f3db1349b0219190dd9ff6`**。`A:\40.ARTIFACT\AppDock.at365`へ発行した。実利用設定の変更・deploy・未変更Applet再発行・全体ZIP・GitHub Releaseは行っていない。
- 証跡: `.artifacts/settings-assignment-speech-20261021/validation.json`、入力manifest、`regression-selection.json`、完全ログ、`review.json`、`cleanup.json`。今回のGUI試験方式の成功は直近3回以内で削除なし。解決した測定差の失敗記録と、過去の再利用/状態不明の出力は保護し、今回のテストプロセス終了を確認した。物理入力/ジェスチャー操作・実TTSサーバー通信は未検証。
