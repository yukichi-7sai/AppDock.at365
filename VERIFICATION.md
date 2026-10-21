# 検証記録

対象の現行版は`0.77.1`。以下は記録した条件での検証結果であり、外部サービスや実機条件の現在の動作保証とは区別する。

## 2026-10-21: Shell方針変更のコミット前検証（0.77.1）

- 実装時の検証記録と現在の684入力、試験スクリプト・lockfile/toolchain・OS/Node、各完全ログのSHA256、発行EXE/feed/Default Shellを照合し、一致を確認した。標準764/764と固定EXEの関連9 GUI（管理専用モードを含む）/smokeを再利用し、同じ試験の再実行と製品の再発行は行わない。追加の差分はこの検証記録だけで、版は0.77.1を維持した。
- 初期の固定EXE試験から後の差分は機能文書3件とApplet管理試験の更新だけで、製品コードは同じだった。管理専用モードの成功は同スクリプトの最終更新後に記録されている。未変更のnative updaterによる追加の全インストール試験のアクセス拒否は下記の未完了事項として保持し、失敗した全コマンドを成功として再利用しない。必要範囲の管理画面からの本体ログ移動・source解除は独立した管理専用モード14群で成功している。
- 対象は本体repoのmain、開始commitは`30a5c7b1b4e76abc695979e89e5b74127d49b894`。設定済みGitHub/AQUA両mainの開始先端が同じことと実効author/committerを確認した。意図した変更一覧、作業ファイル/stageの一致、stage/commit tree、通常push後の両先端とcleanの照合値は`.artifacts/commit-validation-shell-policy-20261021/`の`validation.json`・`commit.json`・`push.json`を正本とする。Release・実利用deployは含めない。

## 2026-10-21: Shell対象の限定と4ページの本体統合（0.77.1）

- 画面は本体rendererと共通UI部品を基本とし、Shell対象をタイトルバー・リボン・ステータスバー・コマンドパレット・一時リボングループ・通知バナー・デスクトップ通知の7領域へ限定。追加のShell化は個別依頼時だけ行う方針をAGENTS/DEVELOPMENTと機能別文書へ反映した。`overlay.ribbon-group`は一時展開ポップアップで、グループ親ボタンと持続展開の子ボタンは`ribbon`に属する。
- ホーム・画像ライブラリー・通知センター・ログを本体documentへ移し、ページ用Shell Host・専用preload・別View・公開描画契約・Default Shellのページentryを撤去。内容Controllerと保存処理は再利用し、共通配色・キーボード・スクロール・プレビュー/編集ダイアログを本体へ接続した。正本は`docs/shell-foundation.md`と`docs/host-pages.md`。
- 本体専用`window.dock.pages`はmain frame/URL・要求ID・route・revision・起動準備・モーダル中の操作を検証する。旧ページShell指定と通常Appletの設定・画像・グループ・通知履歴は保持し、自動変換/削除しない。旧指定は選択UI・稼働状態・起動・再試行から除外し、旧領域を要求するShell専用コマンドは利用不可にした。
- 実装と影響範囲を発行前にレビュー。公開ページShell契約の撤去により0.77.0へマイナー更新した後、固定EXEの再起動試験で起動準備前に本文が表示される問題を発見した。初回モデルを準備完了まで保留し、同じ接続で通知を待つ修正を0.77.1へ発行。修正前に失敗する回帰と修正後5/5成功、通知センター再起動の成功を記録した。
- 型検査・本体/Default Shell build・native出力の生成・publishは成功。固定Node 24.21.0/pnpm 12.10.1/.NET SDK 10.0.402、LUNAで検証した。最終の標準回帰は`dev.bat exec node --test --test-concurrency=4 tests/*.test.cjs`で**764/764、fail/skip 0**。検証前後の684入力は完全一致し、文書279参照・13ファイルとdiff checkも成功した。既定並列実行では未変更のmounted updater試験1件が間欠失敗し、同じ試験ファイル単独2/2と並列数を制限した全試験の成功を確認した。失敗ログは保持した。
- ソースGUIでは本体4ページ、画像ギャラリー/モーダル/セッション、Node/native通知センター、Node/.NET/native混在Shellを確認。発行済み0.77.1の同じEXEでは`host-pages-ui-test`、`image-gallery-ui-test`、`image-library-session-ui-test`、`notification-center-ui-test`、`shell-region-ui-test`、`shell-bars-ui-test`、`ribbon-customization-ui-test`、`shell-overlay-ui-test`、`applet-management-ui-test --management-only`の**9 GUIスクリプトとsmoke**が成功した。管理専用モードは14群で、今回に関係する管理画面からのログ移動・source解除・共通設定・明暗/狭幅を含む。
- 固定EXEで、4ページが本体DOMに存在し旧ページdocumentが起動しないこと、保存済みピンとログ条件、原画像の保持、画像選択/スクロール/再訪、共通モーダルとEscape/フォーカス復帰、明暗・狭幅・100/150/200% zoom、ページを再生成しないパレット表示、再起動による選択ページ/旧指定の保持を確認した。残すShellの独立提供元・復旧・safe起動、リボンの持続/一時展開、バー操作も確認した。
- 追加のApplet管理**全インストール試験は完了していない**。通常ユーザーで2回試し、管理/ログ・URL install/uninstall（両回）・配布フォルダーinstall/uninstall（2回目）までは成功したが、後続の入れ替えで未変更のnative updaterが`.transactions/.../next`へのアクセス拒否となった。各回の`restored:true`と既存データ保持を確認し、製品の検査や更新実装は変更せず失敗記録を保護した。この全試験を管理専用モードの成功へ含めない。
- 隔離profileとfixtureによる結果であり、画像削除は隔離recycle adapter、通知一括確認はソースのdialog-response fixtureを使用した。実アカウント・物理キー/UAC同意・音声・NAS・混在DPIの保証へ拡張しない。画像と本体ページの画面も目視確認した。
- `publish.bat`終了0。本体EXE/feed/Default Shellは**0.77.1 / 168971514 bytes / SHA256 `93b1dbab998ed4a8f3f728fee9906aadf86152f0c1c67f16cda10b5150775e1b`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行した。旧ページHTML/preload/Hostの生成物が残らないことも確認。実利用設定の変更・commit・push・GitHub Release・実利用先deployは行っていない。
- 証跡は`.artifacts/host-pages-20261021/validation.json`、`review.json`、入力manifest、完全ログ、各隔離profile、`artifact.json`、`cleanup.json`。今回のソース/最終EXE/修正前後/失敗証跡と既存の再利用・実行方式不明の資料を保護し、削除候補なし・削除0件。対象テストプロセスの終了を確認した。

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
