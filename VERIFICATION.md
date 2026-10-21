# 検証記録

対象の現行版は`0.77.4`。以下は記録した条件での検証結果であり、外部サービスや実機条件の現在の動作保証とは区別する。

## 2026-10-21: 公開コマンドのコミット前検証（0.77.4）

- 実装時の628入力・821生成物・8完全ログ・固定EXE/feedをSHA256で再照合し、すべて一致。標準767/767、最終固定EXEの公開コマンドGUI6群・更新GUI13群・smokeの成功結果を再利用した。製品・試験・依存・版の後続変更はなく、追加回帰・再発行は不要と判定した。今回の追加はこの検証記録のみ。
- mainの開始先端・追跡先・今回の25対象ファイルと実効author/committerを確認。GitHub/AQUA両mainの先端、ステージ内容、作業ファイルとの一致、stage/commit tree、通常push後の両先端とcleanの照合を`.artifacts/commit-validation-public-settings-20261021/`へ記録する。実装時の証跡は`.artifacts/public-settings-commands-20261021/`を保持し、過去成功を再実行したように記録しない。公開Release・実利用deployは含めない。

## 2026-10-21: 更新と設定ページの公開コマンド（0.77.4）

- 開始時はmain／origin/main追跡・cleanを確認し、`git pull --ff-only`で最新取得（更新なし）。開始commitは`d218f7302c3f4ce45a295997d3476e53cfd2b2c3`。本体だけを変更し、未変更Appletの再発行・commit・push・GitHub Release・実利用deployは行っていない。
- 「本体と全Appletを更新」「AppDockを更新」「更新チェック」を公開。設定の同名更新ボタン、既存の更新IPC、MCP／Appletの`commands.execute`を共通のコマンド処理へ接続した。チェックは無効・停止中を含む全パッケージを確認し、適用しない。利用可能な更新は既存通知種類`host/updates/available`へ接続し、一部失敗があっても更新のお知らせと共通エラーをそれぞれ通知する。
- `settings-navigation.ts`を本体設定インデックスのID・名称の正本とし、各ページとApplet／collection子ページの設定を開くコマンドを自動生成。公開API・パレット・入力割り当て・リボン・トレイ・ホームへ接続した。停止中Appletの設定を開いても開始・有効化しない。既存の`appdock.settings.open`は従来どおり、リボンと更新の既存IDは新しい生成・実行経路で維持する。保存形式・設定項目・保存ファイルの追加削除はなく、パッチ更新とした。
- 発行前の差分レビューで要件・許可・設定入力確定・既存ID・通知の安全な要約を確認。初回0.77.3発行後の追加確認で、Applet設定コマンドの共有トレイカタログへの反映不足を修正し、同じコマンド一覧を使うよう統一した。全生成コマンドのトレイ解決を回帰へ追加して再確認し、最終版を0.77.4へ進めた。未解決の指摘なし。詳細は`review.json`。
- 固定依存の`install --frozen-lockfile`、最終版の型検査／本体・Default Shell build、標準回帰**767/767、fail/skip 0**が成功。更新ヘルパーの制限環境でのアクセス拒否は通常ユーザーで同一コマンドを再実行して解消した。最終標準回帰後の入力差分は新しい固定EXE GUIスクリプトの試験追加・fixture修正だけで、製品と標準回帰入力は不変。628入力・821生成物・各完全ログのSHA256と差分理由を証跡へ保存した。
- 最終固定EXEの専用GUI**6群**が成功。実Node Appletから共通APIで全設定ページを列挙・表示し、停止維持・トレイ割当候補・通常設定コマンドの選択ページ保持・型付き更新通知を確認した。本体のみ／全体の公開コマンドと両設定ボタンが同じ更新scopeを呼び、確認取消で未適用となることも確認。同梱Default Shellの版も実行中のresourcesから照合した。初期fixtureの通知既定値・トレイAPI名の誤りと制限環境のEXE起動失敗の記録を保持し、修正後の成功と区別する。
- 最終固定EXEの既存更新GUI**13群**が成功。本体と全Appletの一括適用、本体単独の実EXE置換、Applet一括／個別更新、同版再適用、設定・ログインfixture・有効状態の保持、選択設定／Appletページの復元、更新／通常再起動後の外部ジェスチャー実行を確認した。固定EXE smokeも成功し、EXE隣の設定と共通画像保存を確認した。
- `publish.bat`終了0。最終本体EXEとupdate.jsonは**0.77.4 / 168961535 bytes / SHA256 `3bfdd5ed078632b54c771d6d6fc3d783eeee6ac43222b9a4e119dc0080b0c8a9`**で一致。Default Shellと各隔離コピーの版・hashも照合し、`A:\40.ARTIFACT\AppDock.at365`へ発行した。今回のAppDock関連試験プロセス残存0。出力は現証跡・直近成功・失敗記録と過去の再利用状態が未確定なものを保持し、削除0件とした。
- 正本は`docs/settings-foundation.md`、`docs/updates.md`、`docs/appdock-api.md`、`docs/usage.md`。変更文書のローカルリンク58件を確認。検証証跡は`.artifacts/public-settings-commands-20261021/validation.json`、`inputs-before/after.json`、`input-deltas.json`、`generated.json`、`review.json`、`cleanup.json`と各完全ログ。初回0.77.3の成功記録は同フォルダーの`first-0773/`に分離し、最終EXEの検証へ読み替えない。GUI profileは`public-settings-commands-1792572156782`、更新は`portable-updates-1792572203903`、smokeは`smoke-1792572330960`。
- ローカル更新元と隔離fixtureでの成功。実GitHub／UNC／NAS更新、Windows通知の実配信、物理入力・UAC同意後・ロック中の各条件は今回の保証へ含めない。実利用の確認は未実施。

## 2026-10-21: 共通アクセントボタンとリボン・トレイの編集UI（0.77.2）

- 更新ボタンのページ固有CSSがホバー後も淡い背景用の文字色を残す問題を修正。追加・更新・並べ替え・上下移動に共通のアクセント動作を適用し、背景と文字色を組にして切り替える。削除の意味色と既存のボタン寸法は保持した。
- ショートカットのフォームだけ外枠を除き、割り当てカードをトップレベルへ配置。JSONの枠は保持。リボンの追加は見出し横に左寄せし、「＋ コマンド」「＋ グループ」「＋ 区切り線」に統一した。コマンドのダイアログはラベル書式をそろえ、選択ボタンを次行へ移した。区切り線の自動名を連番なしの「区切り線」にし、独自名と安定IDを保持した。
- トレイは「動作設定」に改称してカードのヒントを除き、単/ダブルクリックの選択ボタンを入力領域の幅いっぱいへ配置。追加・移動は共通アクセント色、移動・削除/グループ解除は各行へ埋め込んだ。グループ解除で子を同じ位置へ戻す動きと、固定の設定/終了は保持した。
- 持続的リボングループの色線と接続部を子ボタンの背景より前へ描画。2pxの位置・余白・クリック領域は変えず、重ねる線はポインター入力を受け取らない。共通配色、設定基盤、リボン、トレイの正本文書へ追加規則を反映した。
- 発行前に実装・依存・保存互換性をレビューし、阻害指摘なし。設定項目・保存ファイル・公開APIの増減がない表示変更として0.77.1からパッチ更新。固定Node 24.21.0/pnpm 12.10.1でinstall・型検査・本体/Default Shell buildと関連11ファイル**87/87**が成功。コミット前はこの成功を再利用し、残り**677件**を実行して標準回帰**764/764、fail/skip 0**を確認した。再生成されたnative出力を使わない87件はcompiled JSと関連入力の一致を照合。native依存試験を含む残りは並列数4で実行し、制限内のWindowsアクセス拒否は同一コマンドの通常ユーザー実行で解消した。
- ソースと固定EXEの`settings-hints-ui-test --accent-layout-only`がそれぞれ**8群**成功。5パレット・カスタム白黒/逆順・保存済みsky-blueを明暗で確認し、追加/更新の通常・ホバー**64標本**がコントラスト4.5以上・同一配色だった。明暗×1280/760幅の配置、ラベル、行内操作、保存を確認。選択・hover・focusで色線の6画素が指定RGBと一致し、背景に隠れないことを検査した。
- 固定EXEの`ribbon-customization-ui-test --appearance-only` **4群**も成功。持続/一時/折りたたみ、左側だけの色線、接続位置、色なし、明暗、独自名・再起動後の保存を確認した。隔離画像を目視確認した。
- ソース版`tray-menu-ui-test` **5群**で、行内操作・配置先・ドラッグイベント・空名の検証・単/ダブルクリック・実メニューcallback・一時停止・子を保持した解除・空配列の再起動保持・明暗3幅を確認した。古い試験の空名入力はblur前に保存待ちしていたため、製品の既存契約どおりTabで確定してから検証するよう修正し、再実行で成功。実マウスドラッグの代わりに既存のDataTransfer fixtureを使用した。
- 固定EXE smokeも成功。最終EXEと各隔離コピーのSHA256、設定/共有画像の保存先、試験プロセス終了を確認。今回の成功は方式ごとの直近3回以内で削除候補なし・削除0件。失敗・過去の再利用資料・実行方式不明の出力を保持した。
- `publish.bat`終了0。本体EXE/feed/Default Shellは**0.77.2 / 168965990 bytes / SHA256 `8952cde9064d80064892ae2466af84c6ad5dbc6438276c464be60d54eac41b8b`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行。実利用設定・deploy・未変更Applet再発行・全体ZIP・GitHub Releaseは対象外。
- 証跡は`.artifacts/settings-accent-layout-20261021/validation.json`、入力manifest、完全ログ、`review.json`、`cleanup.json`と各隔離profile。fixture設定の重複所属・初期折りたたみを修正した試験の失敗ログも保持した。物理入力・実ネットワーク通信の保証へ拡張しない。

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
