# 検証記録

## 2026-10-30: 通知設定・移動時のちらつき修正 0.105.7 のコミット照合

- 利用者が確認した通知設定の並べ替え・重複説明の除去・読み上げの現在値・通知センター/Windows設定へのボタン・入れ子Fieldのインデントと、通知センター移動/MCP読み込みのちらつき対策を19ファイルでレビューした。main `e120441`上の対象差分を保持し、無関係な変更は追加しない。設定ページの接続検査・入力確定・保存・取消を維持し、製品の追加修正は不要と判断した。
- 実装時0.105.7の型検査/build、ソース/固定EXEの設定コントロール各11群、固定EXEの設定操作8群とsmokeを、入力959ファイル・完全ログ・EXE/ZIPのSHA256へ照合して再利用した。差分は独立した読み上げGUI試験と本項の検証追記だけで、製品・依存・ビルド/発行手順は不変。確認済みの0.105.7を維持し、再発行は行わない。
- 標準回帰152ファイルを試験ごとに分類した。実装時の関連10ファイルと、0.104.2の標準成功記録に対して試験・依存closureのソースとコンパイル結果が一致し、追加ファイル読取・プロセス起動がない10ファイルを再利用した。残る132ファイルは今回追加実行し、並列131ファイル1,207件と単独の更新試験2件、計1,209件がfail/skip 0で成功。再利用20ファイルと合わせて必要な標準152ファイルの成功が揃った。ビルド手順の差はパレットpreloadへの配色bridge追加だけで、再利用した純粋module試験の入力は不変であることも確認した。
- 移動した読み上げ設定のGUI試験には、旧カード形式と文字入力だけで保存される前提が残っていた。現在の一覧→編集ダイアログとEnterでの入力確定へ試験だけを合わせ、確認前の通知設定が保存されない検査を追加した。初回2件の失敗記録を保持し、同じ固定EXEで12群成功。声の手入力/候補選択・明暗/狭幅・速度・通知の読み上げ・試聴・独立した継承復帰・ロック中の音声待機をloopbackの模擬TTSで確認した。実TTSサーバー・実通知受信の検証とは区別する。
- 読み上げ試験の解決済み初回2件は、終了・パス・再解析ポイント・追加指示・内容不変を照合して実行用コピーだけを整理した。161ファイルの失敗結果・ログ・設定等と配布manifestのSHA256を維持し、最新成功の固定コピーを保持した。ほかの失敗・状態不明・過去の再利用証跡は保持する。
- 証跡は`.artifacts/commit-validation-notification-settings-01057-20261030/`の`standard-plan.json`・入力SHA一覧・`concurrent/serial-result.json`と完全ログ・`speech-fixed-v3-result.json`・`cleanup.json`・`validation.json`。差分/構文/文書参照と発行物の再照合を行い、stageと作業ファイルの一致、stage/commit tree、最終commitは同ディレクトリの`stage.json`・`commit.json`へ記録する。push・GitHub Release・実利用先deployは行わない。

## 2026-10-30: MCP読み込み中の再読み込みボタンを1秒後に表示 0.105.7

- main `aa56664`上の既存18ファイルの未コミット変更を保持し、利用者が指定した読み込み中の表示遅延を実装した。MCP情報の取得はすぐ開始し、状態未取得が1秒以上続いた場合だけ「連携状態を再読み込み」ボタンを表示する。短い取得ではボタンを挟まず本文へ切り替える。
- 取得失敗ではエラーと再試行ボタンをすぐ表示し、手動の再試行中はボタンを表示したまま無効にする。成功後に最低表示時間を設けず、取得完了・ページ離脱では表示待ちのタイマーを解放する。取得処理、設定値、MCP接続・許可・認証、公開APIは変更していない。
- 発行前に差分と影響先をレビューした。製品の変更は`CodexSettings.tsx`の表示制御だけで、設定ページ・入力クライアント・接続寿命の検査は0.105.6の検証入力とSHA256が一致した。設定項目・保存ファイルの追加/削除なし。通常のUI修正として0.105.6→0.105.7へ更新した。
- 既存`settings-controls-ui-test.cjs`へ、短い読み込み中のボタン非表示、1秒の遅延、完了後の除去、取得失敗時の即時再試行、待機中のページ離脱を追加した。APIの応答ゲートとDOMの表示を使い、固定sleepで成功させない。0.105.6では短時間読み込みのボタン出現を検出して失敗し、修正後のソース/固定EXEで成功することを確認した。
- 固定lockfileのinstall、整形、型検査、build、既定`publish.bat`は終了コード0。翻訳・設定ページ接続・入力クライアントの関連3ファイル（`localization`・`settings-page-host`・`settings-view-client`）32/32件が成功。ソースと発行済み固定EXEの`settings-controls-ui-test`各11群、固定EXEの`settings-usability-ui-test`8群、smokeも成功した。ボタンの表示はソース1001.6ms・固定EXE1004.7msで、短時間取得では一度も表示されなかった。取得失敗と再試行、離脱、既存の通知先・表示位置・入力保存・取消・再起動後の保持も確認した。
- feed・フォルダー/ZIPのmanifestは0.105.7で一致。update.zipは270,737,363バイト、SHA256 `2f635e381f74a4c35c6f451ddb5f5913d16198723c6e83f9dcaf57d0f4adef7b`がfeedと一致し、EXE/asarを収録、設定・data・extensionsの混入なし。EXE SHA256 `4a9ab60d84f67079914d865d05afe08b9727255459469549b55babc0fa708a2f`は各固定試験コピーと一致。検証記録を除く追跡入力959ファイルの検証前後SHA256も一致した。証跡は`.artifacts/mcp-loading-delay-20261030/`の各log・`regression-before.json`・`review.json`・`publication.json`・入力SHA一覧・`validation.json`と、各GUI profileの結果・計測JSON・画像。
- 後片付けでは、直前の成功3件と解決した旧版回帰1件の実行用コピーだけを整理し、379ファイルの記録・画像・設定等のSHA256維持を確認した。最新成功の固定コピー3件とソース試験記録は保持。詳細は同証跡の`cleanup.json`。全標準回帰、実アカウント/実受信は今回未実行。コミット・push・GitHub Release・実利用先deployは行っていない。

## 2026-10-30: MCP連携設定への移動時に見える領域変化を調査（0.105.6）

- 通知センター移動時のエラー消失は利用者確認済み。続いて、通知の「MCP連携設定 → 設定を開く」で一瞬エラー領域が広がるように見えるとの申告を調査した。表示が短いため、利用者もエラー文・詳細ボタンの有無は判断できていない。実接続の`system.getInfo`で稼働版0.105.6を確認した。
- 同じ発行EXEの隔離profileで、MCP有効/無効、1280/760幅、MCPリンク/TTSリンク/左インデックスのMCP選択を各2回、計24回比較した。DOMのエラー文・エラー枠の出現は0件で、ツールバーの高さも変わらなかった。実利用の設定・認証・接続先は変更せず、MCP有効条件は隔離設定と専用のconfig.tomlだけを使った。
- MCP情報の応答を明示的なゲートで保留し、読み込み途中と完了後の画面も確認した。途中では「連携状態を再読み込み」ボタンだけが表示され、その後に設定本文へ切り替わる。両状態ともエラー文・エラー枠は0件。読み込み中の案内はスクリーンリーダー向けのstatusだけだった。この本文の切り替えが申告された見え方に関係する可能性はあるが、実利用で見えた一瞬と同じ現象だとは断定していない。
- `NotificationSettings`のMCPボタンは同じ設定画面内で`select('codex')`する経路で、通知センターで修正した別routeへの移動とは異なる。通常の設定本文では`SettingsStatusArea`へ`collapseWhenEmpty`を指定し、エラーや操作がある場合だけエラー枠を描画する。今回の確認で、エラー扱いと断定して表示処理を変更する根拠は得られていない。
- 証跡は`.artifacts/notification-mcp-link-investigation-20261030/`の`check.log`・`check-enabled.log`と各profileの`result.json`。読み込み前後の画像は成功した有効条件の`profile-1793334374229/status-loading.png`・`status-loaded.png`。初回の有効条件は試験側の非同期トグルに`check`を使って止まったため、`click`と状態確認へ修正し、同じEXEの別profileで成功した。失敗記録は保持した。
- 製品変更なし。検証記録を除く追跡入力959ファイルは0.105.6検証時とSHA256が一致し、版更新・build・publish・commit・push・Release・実利用先deployは行っていない。解決済みの試験側失敗1件の実行用コピーだけを整理し、75ファイルの記録・設定等のSHA256維持を確認した。成功した有効/無効の各コピーを保持。詳細は同証跡の`cleanup.json`。

## 2026-10-30: 通知センターへの移動で一瞬出る接続エラーを修正 0.105.6

- main `aa56664`上の0.105.5までの未コミット16ファイルを保持して着手。修正前の固定EXEを隔離し、4回すべての移動で「設定画面の接続が古くなっています。」を記録した。通知センターへの移動成功後、元の設定ページへの操作応答で`SettingsPageHost.act`の接続再検査が拒否し、画面が切り替わる前にエラーが表示されていた。
- 通知センターへの移動を本体rendererのページControllerへ移し、`preparePageChange`で入力・保存キューと現在のページを確認してから既存の`appdock.notifications.open`を実行する。通知設定の共通処理はコールバックも受け取れるようにし、処理中の操作抑止と実際の失敗表示を維持した。設定ページ内の`notificationOpenCenter`操作は不要になったため取り除いた。
- 発行前に差分と影響先をレビューし、設定ページ接続の検査を削除・緩和せず、エラー文言による抑止や待機時間の追加もしていないことを確認。`settings-page-host.ts`・`settings-page.ts`・`runtime.ts`は0.105.5の検証入力とSHA256が一致した。設定項目・保存ファイル・公開APIの変更なし。通常の移動処理の修正として0.105.5→0.105.6へ更新した。
- `settings-controls-ui-test.cjs`へ、移動完了までDOMのエラー表示を監視する継続回帰を追加。修正前の0.105.5で同じ検査が目的の条件で失敗し、修正後で成功することを確認した。最終画面だけの確認から、一瞬表示されるエラーも検出する確認へ補強した。
- 固定lockfileのinstall、整形、型検査、build、既定`publish.bat`は終了コード0。接続・操作・クライアント・編集・設定ナビゲーション・画面移動の関連6ファイル（`settings-page-host`・`settings-page`・`settings-view-client`・`settings-editing`・`settings-navigation`・`ui-presentation`）67/67件が成功。発行済み固定EXEで`settings-controls-ui-test`10群、`settings-usability-ui-test`8群、smokeも成功した。
- 固定0.105.6で4回連続の往復を行い、DOMのエラー表示とmainの接続エラーがともに0件、通知設定値の維持を確認した。さらに入力途中のボイスIDが確定・保存されてから移動すること、意図的に移動を失敗させた場合は設定画面に原因を表示して留まり、再試行で正常に移動することを確認した。声・速度の継承、通知先・表示位置・取消・再起動後の保存の既存確認も今回成功した。Windows設定を開く操作は変更なしで、前版の検証を参照する。
- feed・フォルダー/ZIPのmanifestは0.105.6で一致。update.zipは270,738,625バイト、SHA256 `dceb3804405b3fe84fd50679df0bd3773d9ba3f3632801ad12b38fe6792a6493`がfeedと一致し、EXE/asarを収録、設定・data・extensionsの混入なし。EXE SHA256 `4643f5e3b13f8d678b83baea3f5ccf33b9740f846e0f99c6833e29c897e447a2`は各試験コピーと一致。検証記録を除く追跡入力959ファイルの検証前後SHA256も一致した。証跡は`.artifacts/notification-center-transition-20261030/`の各log・profile別`result.json`・`regression-before.json`・`review.json`・`publication.json`・入力SHA一覧・`validation.json`。
- 後片付けでは直前の成功3件と、原因を解決した再現・旧版回帰2件のEXE/同梱ランタイムだけを整理し、452ファイルの記録・画像・設定等のSHA256維持を確認した。最新成功の4コピーは保持。詳細は同証跡の`cleanup.json`。全標準回帰・実TTS/実受信は今回未実行。コミット・push・GitHub Release・実利用先deployは行っていない。

## 2026-10-30: 通知の現在値・移動ボタンと入れ子Fieldのインデント 0.105.5

- main `aa56664`上の直前の0.105.4改修を保持して追加実装した。開始時のブランチ・追跡先・既存13ファイルの未コミット状態を確認し、pull・stash・resetは行っていない。「読み上げ」行のdescriptionへ元と同じ「現在の声: … ／ 速度: …倍」を戻し、共通値の継承と通知用の上書きに追従させた。
- 「通知センターを開く」は既存の`appdock.notifications.open`へ、「Windowsの通知設定を開く」は定数`ms-settings:notifications`へ接続するページ限定の操作とした。後者のURIは[Microsoftの起動先仕様](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings#system)に従う。任意のURLをrendererから渡さず、公開コマンド・MCP操作・設定項目・保存ファイルを追加しない。処理中の二重操作抑止と、失敗表示・再操作は通知ページの既存の共通処理を使う。
- 発行前に差分と影響先をレビューした。入れ子にした`SettingsSection variant="row"`の直下のFieldへ、共通CSSで左16pxのインデントを付ける。見出し・開閉操作の位置は維持し、他のrow利用箇所である起動計測のJSON枠はFieldではないため対象外。声・速度の保存、試聴、通知種類の一覧と検索anchor、即時保存・取消・競合の契約を保持した。通常の追加UI修正として0.105.4→0.105.5へ更新した。
- 固定lockfileのinstall、整形、型検査、build、既定`publish.bat`の終了コード0。`localization`・`notification-preference-edit`・`notification-policy`・`settings-editing`・`notification-banner-layout`・`settings-page`・`settings-page-host`の7ファイル63/63件が成功。発行済み固定EXEで`settings-controls-ui-test`9群、`settings-usability-ui-test`8群、smokeも成功した。
- 隔離した固定EXEで、折りたたみ時の現在値、声/速度の上書きと継承復帰、ヒントOFFでの現在値表示、検索での二重展開、通知センターへの実画面移動と通知設定値の維持を確認した。light/1280・dark/760の画面を確認し、読み上げ内の4つのFieldが各16px内側で、入力・ボタンのはみ出しがないことを記録した。WindowsボタンはElectronの模擬受け口で正しいURI、失敗表示、再試行成功と設定値の保持を確認した。
- Windows設定の実画面確認は、Computer Useと別の画面確認ツールの両方が`failed to prepare MXC sandbox: permission path cannot be represented losslessly`で起動できず未確認。実OS設定の変更・強制的な回避は行っていない。`native-verification.json`に環境上の制約を記録した。全標準回帰、物理入力、実TTSサーバー・実通知受信は今回未実行。
- 初回の個別GUI確認は、無効の試聴ボタンも含めて有効化を待つ試験側の条件でタイムアウトした。待機対象をWindows設定ボタンへ絞り、同じ発行EXE・別の隔離profileで成功した。製品の追加修正・追加発行は不要で、初期ログとprofileを保持した。
- feed・フォルダー/ZIPのmanifestは0.105.5で一致。update.zipは270,737,278バイト、SHA256 `8e6ff22ada62c400ee0898bbee0dea2ca5c7456eb750eced77465f97b029b770`がfeedと一致し、EXE/asarを収録、設定・data・extensionsの混入なし。EXE SHA256 `869441d5e7161277916e050c55983ba381f6e1c04d37c8c042ddadecfa2ac3a4`は各試験コピーと一致。検証記録を除く追跡入力959ファイルの検証前後SHA256も一致した。証跡は`.artifacts/notification-settings-actions-20261030/`の各log・画像・`review.json`・`publication.json`・`inspection.json`・入力SHA一覧・`validation.json`。
- 後片付けでは直前の成功4件と解決済みの試験待機失敗1件の、EXE/同梱ランタイムだけを整理し、442ファイルの記録・画像・設定等のSHA256維持を確認した。最新成功コピーと未解決の旧GUI失敗profileを保持。詳細は同証跡の`cleanup.json`。コミット・push・GitHub Release・実利用先deployは行っていない。

## 2026-10-30: 通知の受け取り方へ表示位置・読み上げを集約 0.105.4

- main `aa56664`の作業ツリー・インデックス・未追跡が空であることと`origin/main`を確認し、`pull --ff-only`で最新取得済みから着手。「通知の受け取り方」を通知ページの先頭へ移し、「バナーの表示位置」と「読み上げ」を内部へ配置した。読み上げは共通の折りたたみ行を使用する。
- バナーと読み上げの説明専用Field、重複する声・速度のサマリー、「変更の反映」Field、「変更はすぐに反映されます。」を削除。上部固定を示していた古いバナー説明を除き、通知センターは現在の通知と起動中の履歴を確認する説明へ修正した。設定基盤・利用ガイド・通知仕様の案内も現構成へ整合させた。
- 発行前に差分と影響先をレビューし、状態・ハンドラー、バナー選択、読み上げの入力・継承・一覧取得・試聴、通知種類の一覧が移動前と同じ内容であることを照合した。既存の検索anchor・設定ID・保存・取消・競合・公開APIを保持し、設定項目や保存ファイルの追加・削除なし。通常のUI修正として0.105.3→0.105.4へパッチ更新した。
- 固定lockfileのinstall、整形、型検査、build、既定`publish.bat`の終了コード0。版更新後の初回型検査は`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`で止まったため、指示どおり`install --frozen-lockfile`で照合してから成功を確認した。`localization`・`notification-preference-edit`・`notification-policy`・`settings-editing`・`notification-banner-layout`の関連5ファイル47/47件が成功した。
- 発行済み固定EXEを隔離して`settings-controls-ui-test`9群、`settings-usability-ui-test`8群、smokeが成功。バナー6位置と下側の伸長、開閉とフォーカス、保存・取消、再起動後の復元、声・速度の独立した継承、ボイス候補とTTS/MCPへの移動を確認した。1280/760幅の実画面を確認し、受け取り方が先頭で、内部の表示位置と読み上げが各1つ、削除した説明がないことを記録した。表示位置の検索で親、声の検索で親と読み上げの両方が開くことも確認した。
- `settings-hints-ui-test --assignment-speech-only`は通知検査に入る前に、既存の「ショートカットキー」という旧ナビゲーション名を探して停止した。現在の画面名は「キージェスチャー」で、旧割り当てカードも前提にしていたため、今回のUI変更の成功結果へ含めない。失敗ログ・画像・profileを保持し、通知部分は上記の固定EXE試験と画面・検索の個別確認で検証した。全標準回帰、旧GUI全体の改修、実TTSサーバー・実通知受信は今回未実行。
- 発行物のfeed・フォルダー/ZIPのmanifestは0.105.4で一致。update.zipは270,737,063バイト、SHA256 `c3d1ff4cd23ac827cb7ae906542828712662e3a9069dc6c891cc7c526c826b93`がfeedと一致し、EXE/asarを収録、設定・data・extensionsの混入なし。EXE SHA256 `b14dc9fe3db7bf45940d48b9d28880dd3c25f3f1185ec175f4c28dbe50299caa`は試験コピーと一致。検証記録を除く追跡入力959ファイルの検証前後SHA256も一致した。証跡は`.artifacts/notification-settings-layout-20261030/`の各log・`review.json`・`publication.json`・`inspection.json`・画像・入力SHA一覧・`validation.json`へ記録した。
- 後片付けは成功済みの古い固定コピー3件のEXE/同梱ランタイムだけを削除し、318ファイルの記録・画像・設定等のSHA256維持を確認。過去の検証から参照される77フォルダー、最新成功コピー、未解決の旧GUI失敗profileは保持した。詳細は同証跡の`cleanup-plan.json`・`cleanup.json`。コミット・push・GitHub Release・実利用先deployは行っていない。

## 2026-10-30: pnpmストアをプロジェクト内へ移動

- main `5bfa4e3`のcleanと追跡先を確認し、`pull --ff-only`成功後に着手。`A:\30.PROJECT\.pnpm_store`を`A:\30.PROJECT\AppDock.at365\.pnpm_store`へ同一ドライブ内で移動した。移動直後に19,407ファイル・364,214,580バイトの全SHA256と12個のjunctionの参照先が移動前と一致し、旧フォルダーの不在を確認した。junctionの先へ進まず、既存の登録先を保持した。
- `pnpm-workspace.yaml`を`storeDir: .pnpm_store`へ変更し、Git除外と開発手順を更新。固定ドライブ文字に依存しないプロジェクト相対の保存先とした。pnpmの実際の保存先と`node_modules/.modules.yaml`が新しい`.pnpm_store/v11`を指すこと、Git除外を確認した。別PCで依存の参照先が一致しない場合の再接続手順はDEVELOPMENTを参照する。
- 通常Windowsユーザー環境の固定Node 26.13.0・pnpm 12.15.0で`dev.bat install --frozen-lockfile --force`が成功。363パッケージを再利用し、追加ダウンロードは0件。続けて`install --offline --frozen-lockfile`、`run typecheck`、`run build`が成功した。lockfileと既存の公開後待機・供給網検査を維持した。
- コミット前の関連回帰として`dev.bat exec node --test tests/dev-launcher.test.cjs tests/release-age.test.cjs`の5件が成功。`dev.bat run smoke`でも隔離プロファイルで起動・設定保存・画像保存・Default Shell稼働・トレイ操作の結果が成功した。全体回帰と全GUIの再実行、別PCの実機確認は行っていない。
- 差分と影響先をレビューし、未解決の指摘なし。製品コード、package.json、lockfile、toolchain、dev.batは不変で、保存先以外の依存方針を維持。検証開始時の960入力のSHA256が型検査・build後にも一致した。開発環境の保存先整理なので製品の版更新・publishは行わない。
- 証跡は`.artifacts/pnpm-store-relocation-20261030/`の`baseline.json`・`relocation.json`・`validation-inputs.json`・`input-verification.json`と各コマンドのJSON/ログ。移動直後の内容照合と、依存再接続後の検証を区別して記録した。コミットのtree照合とGitHubへの送信結果も同ディレクトリへ記録する。

## 2026-10-30: KAGUYAの古いテスト生成物整理

- 7repoの`.artifacts`を確認し、通常フォルダーは種類・実行方式ごとの最新成功3回、固定配布物の実行用コピーは最新成功1回を保護した。成功・終了・参照なしを確認した古い3フォルダーと、古い成功テスト72件に残る単一EXEコピー75個だけを削除した。表示容量の合計は11,180,340,868バイト（約10.412GiB）。
- 結果・ログ・画像・設定・data・extensionsと最新コピーは保持。失敗・状態不明・実行方式不明、固定出力、Release・調査資料は対象外。削除前に成功結果、絶対パス、使用状況、再解析ポイント、追加AGENTSと内容不変を確認した。通常のプロセス一覧で情報を取得できなかった実利用AppDockは、OSの読み取りAPIで実行元とコマンドラインを確認し、対象を使用していないことを照合した。停止や権限変更は行わない。
- 保護した15,993ファイル、6,238,947,249バイトのSHA256が前後一致。最新コピー23区分とその他の最上位項目の保持、削除対象78項目の不在を確認。削除失敗・保護対象の変化は0件。7repoのHEAD・作業ツリーは削除前後で一致し、製品の版更新・build・publish・commit・push・deployは行っていない。
- Aの実空き容量は削除直前・直後とも814,516,908,032バイトで、今回の実空き増加は0バイト。表示容量の削除合計を物理容量の解放量として扱わない。
- 証跡: `.artifacts/cleanup-20261030-kaguya/{plan,runtime-ready,deletion-result,verification-before,verification-after}.json`。保持条件と実行用コピーの寿命はDEVELOPMENTの整理手順を参照する。

## 2026-10-30: テスト実行用コピーの容量整理

- 各repoの`.artifacts`を再解析ポイントへ進まず計測し、合計370.153GiB、本体344.458GiBを確認した。表示上のファイル容量であり、ディスクの実使用量とは区別する。通常の整理手順で、成功・終了と参照なしを確認した古い5フォルダー354,231,691バイトを削除し、保持する1,046フォルダーの存在とHEAD・作業ツリーの不変を確認した。
- 利用者の削除許可と、その後の保持数を1回にする指定に従い、種類・実行方式ごとの最新成功分を保護した。古い成功試験582件にある実行用コピー593組、管理対象4,129項目、195,982,436,863バイト（182.523GiB）だけを削除した。結果JSON・ログ・画像・設定・data・extensions・配布manifestは保持。未解決の失敗、状態不明、固定ビルド出力、調査用保全フォルダーは対象外とした。
- 絶対パスと管理対象の許可リスト、成功結果、使用中プロセス、親・対象・配下の再解析ポイント、追加AGENTS.md、計測後の内容不変を削除前に確認。保持62,023ファイル（3,636,983,851バイト）の全SHA256が前後一致し、最新成功190フォルダーと配布manifest208件の保持、削除4,129項目の不在を確認した。削除失敗・未完了・保護対象の変化は0件。製品コード・版・依存の変更やbuild/publishは行っていない。
- AはReFSの仮想ディスクで、保持EXEの領域が複数ファイルから参照されていることを読み取り確認した。表示容量の削除合計は196,336,668,554バイト（182.853GiB）。実行用コピー整理の直前・直後のA空き容量は955,803,934,720→953,998,966,784バイトで、同時間帯の実空き増加は確認できなかった。物理容量の解放量を表示容量から推定しない。ファイル整理とVHDX自体の縮小は別作業であり、ボリュームの切断・縮小や同期・バックアップ設定変更は行っていない。
- 正本証跡は`.artifacts/artifact-cleanup-20261030/`の`safe-cleanup.json`・`runtime-proposal.json`・`ready-plan.json`・`preserved-before.json`・`runtime-cleanup.json`・`verification.json`・`inventory-summary.json`・`capacity.json`。今回作成した一時スクリプト・全量棚卸し等64,143,560バイトを削除し、最終A空き容量952,901,611,520バイトを確認した。AGENTSとDEVELOPMENTの手順を、通常フォルダーの直近3回と実行用コピーの直近1回を区別する内容へ更新した。文書は未コミットで、commit/push/Release/deployは今回の対象外。

## 2026-10-30: トリガー継続のmain統合・コミット前検証 0.105.3

- main `ba8dd02`のclean/追跡先を確認し、pull --ff-only成功後にworktreeの実装を取り込んだ。既存の設定項目内操作を保持し、競合なし。mainで0.105.2が別件として発行済みのため、統合した本体は0.105.3へパッチ更新し、標準`A:\40.ARTIFACT\AppDock.at365`へ発行した。worktreeの0.105.2は別の確認用成果物として保持する。
- 実装時958入力のSHA256一致と成功ログを照合。mainとworktreeの改行差を内容変更と区別し、既存の日本語文言が不変で追加だけであること、契約型の任意metadataが実行コードへ影響しないことも確認した。依存関係ごとの照合で、実装時173件のうち8ファイル分を再利用。共通カタログが変わった残り4ファイルと、Shell・設定ページ・トリガー・設定操作などの追加対象を合わせ、20ファイル183件をmainで実行して全件成功、fail/skip 0。選定と改行差の一覧は`reuse-plan.json`、実行結果は`regression.log`120件と`integration-regression.log`63件。
- 追加検証で既存のgesture-indicator試験がキー記録中の全停止を期待していたため、新仕様の「キー記録中もマウスと待機表示を継続」へ期待値を合わせた。pause・非表示通知・古いrevision・停止中の通知拒否の検査は維持し、再実行成功。初回の失敗ログも保持した。製品コードは実装時の内容から追加変更していない。
- 差分と統合影響をレビューし、設定操作と入力受付、保存/取消/フォーカス、キー単独/修飾付きと前面Window、記録解除、nativeとmainの所有権を確認。新しい設定・保存ファイル・依存・公開APIの追加/削除なし。固定lockfileのinstall、型検査、build、既定publish.bat終了コード0。
- mainの最終native DLLで`--input-blocking`273件・`--lock-keys`255件成功。固定0.105.3で入力7群、設定項目内操作5群、host-modal9群、shell-overlay7群、IME関連のネイティブ記録42ケースとsmokeが成功。新機能だけでなく既存の設定操作、保存値保持、40回の編集取消、本文とAppletの入力、明暗/狭幅、クラッシュ復旧も確認した。Pause/F13〜F24のOS入力・登録は行わず、物理タッチパッドは引き続き未確認。
- 959入力の検証前後SHA256が一致。EXE SHA256 `097d37a96f9e5163ca430eb44403472d2b88624328ed71d65d7580faacb1bb5c`、ZIP SHA256 `716f6fa4a187cf63384ce82ab1f9b7220dd1daacbdfa9e65a68104a177ec72b6`。feedの版/サイズ/hash、試験コピーのEXE、発行物のInputHostとビルドDLLの一致を確認。正本は`.artifacts/commit-validation-modal-trigger-input-20261030/`の`integration.json`・`reuse-plan.json`・`inputs-before/after.json`・`artifacts.json`・`validation.json`と各成功log。実装時証跡はmainの`.artifacts/modal-trigger-input-20261030/`にも保全した。
- 対象19ファイルだけをステージし、stage tree/commit tree・作業ファイルとmainの状態を照合する。結果は同証跡の`stage.json`・`commits.json`。今回の各GUI方式の成功は1回ずつで、既存の再利用証跡と失敗ログを保持し、整理による削除なし。確認用worktreeも保持する。push・GitHub Release・実利用先deployは対象外。

## 2026-10-30: ダイアログ・パレットの操作キーとトリガー継続 0.105.2

- `7f2eaa4`から作成した`codex/modal-trigger-input`、worktree `A:\30.PROJECT\AppDock.at365-modal-trigger-input`で実装。共通ダイアログ・パレット・一時リボングループの表示による一括停止を廃止し、前面の対象UIでは単独Tab/Escape/Enter/上下左右のトリガーだけを抑えて元入力を画面へ渡す。修飾キー付き、その他のキー、マウス、タッチパッドは保存済み条件で継続する。別アプリが前面なら7キーの割り当ても継続する。本体PIDのWindows標準ダイアログも同じ7キーを保護する。
- 共通計画とDispatcherを維持し、nativeの入力所有権判定とmainの受付で同じキー集合を使う。通常のダイアログをキー記録と同一扱いにせず、実記録欄のフォーカス・準備完了・token・実Windowに応じてキートリガーだけを止める。離脱・前面移動・接続断で記録を解除する。マウスのrevisionはジェスチャー側の構成が変わるときだけ進め、キーボードやmodal状態の同期で生存sessionを取り消さない。
- 発行前の差分・影響先レビューを1回実施。入力の通過/抑止、単独と修飾付き、記録中のキーとタッチパッドの所有権、マウスsession、ローカル/外部の二重配送、共有ダイアログの保存・取消・フォーカスを確認した。レビューで、記録準備完了前の受付、前面復帰時の記録再開、記録開始後のキーバッチの停止、nativeの無関係な同期によるgesture取消、接続断時の記録解除を整え、関連回帰を最終EXEで再確認した。設定項目・保存ファイル・依存・公開APIの追加/削除はなく、通常修正として0.105.1→0.105.2。
- 固定lockfileのinstall、整形、型検査、build、既定`publish.bat`に成功。関連Node回帰12ファイル173/173、nativeのOS入力を送らない`--input-blocking`273件・`--lock-keys`255件が成功。Pause/F13〜F24の実送信・OS登録は行っていない。
- 発行済み固定EXEで`modal-trigger-input-ui-test`7群、`host-modal-ui-test`9群、`shell-overlay-ui-test`7群、`shortcut-native-capture-ui-test`42ケース、smoke成功。7キーのUI操作、修飾付き・その他のローカル/グローバルキーとマウスの継続、別アプリでの7キーの実行、標準フォルダーダイアログ、実記録と離脱後の再開、保存済み割り当て保持、40回の編集取消、明暗/狭幅、下のApplet入力とShell独立、IME関連キーの再クリック記録を確認した。タッチパッドはNode/native投影の模擬確認で、物理タッチパッドは未確認。全標準回帰・実利用先deploy・Releaseは今回の範囲外。
- 既存の表示GUIは独立パレットの可視化直後、本体本文のblur反映前に判定して1回失敗した。`dialog-blur-ui-test.cjs`で実際の反映完了を待つ条件を追加し、同じ固定EXEで9群成功。製品変更ではないため再発行・追加版更新なし。初期の専用fixtureの最低ホスト版・表示名・一覧のhover待機不足も試験側で修正し、失敗profile/logを保持した。後から変えた入力は当該表示試験の待機だけで、その他の成功対象コードは不変。
- 発行先は`A:\40.ARTIFACT\AppDock.at365-modal-trigger-input`。EXE SHA256 `46ae1a582d6b317a74e02051d29eb28ff65e5dba64822335f1c0e6978830dcf0`、update.zip SHA256 `53a702ac48583a02571db058aeb5b2c7c6ff33f2934be19d37e20fbd517bce8f`。feedの版・サイズ・hash、同梱InputHostとビルドDLLの一致、試験コピーと発行EXEの一致を確認。証跡は`.artifacts/modal-trigger-input-20261030/`の各log、`artifacts.json`、`validation.json`、`inputs-original/before/after.json`。958入力をhash照合し、表示試験の待機変更以外は不変、再確認前後も不変。
- 今回の試験プロセス残存0。テスト生成物は成功分が方式ごと3回以下で、失敗・証跡・固定ビルド出力を保持し、削除対象なし。worktreeは引き続き確認用として保持。コミット・mainへの統合・pushは行っていない。元のmainで進行中の別変更へ触れていない。


## 2026-10-30: 設定項目内操作0.105.2のコミット前照合

- 利用者の動作確認後、mainの対象差分をレビュー。実装時の本体845入力とWatch22入力、完全ログ8件、両発行物695ファイル/ZIPのSHA256一致を確認し、型検査/build・関連35件・本体の固定GUI5群・Watchの固定GUI14群とMCP検証を再利用した。WatchのC#/SDK依存29入力も不変で、標準回帰21件を再利用する。
- 変更したmanifest読み込み・設定カタログを直接/間接参照する標準試験から、成功済み5ファイルを除いた65ファイルを抽出。build:test-extensions後に731/731成功、失敗/skip 0。対象外の保存/実行経路等を全件再実行することはせず、依存関係と選定理由を記録した。製品の変更・版更新・再発行なし。
- 証跡は`.artifacts/commit-validation-inline-settings-20261030/`の`reuse.json`・`regression-plan.json`・`regression.log`・`stage.json`・`commits.json`・`push.json`。stage treeと作業ファイル、commit tree、各GitHub origin/mainを照合する。既存GUI成功分と再利用証跡を保持し、今回の新規GUI試行/削除は0。GitHub Releaseと実利用deployは対象外。

## 2026-10-30: 設定項目内の操作ボタン 0.105.2

- mainのclean/追跡先を確認しpull --ff-onlyで最新を取得。既存の未pushコミット7f2eaa4を保持して実装した。`settingActions.settingKey`を任意の表示metadataとして追加し、自身のトップレベル設定を参照する操作を同じFieldへ配置する。共通`SettingsInputActions`のopt-in折り返しを使い、独立操作の配置は維持。設定キー/値/既定値/保存形式、MCP公開スキーマ・読み書き・実行許可は変更しない。設定/操作それぞれの検索アンカーとMCP対応表示を保つ。
- 発行前に宣言検証・参照/重複拒否・最低版・共通フォーム・保存/実行経路・検索・MCP表示・既存Appletへの影響をレビューし、阻害事項なし。設定/保存ファイル追加と破壊的変更を含まないため0.105.1→0.105.2。新指定にはminimumHostVersion:0.105.2以上を要求する。
- 固定ツールでinstall --frozen-lockfile・型検査・build成功。関連5ファイル35件成功（setting-actions、setting-sections、settings-editing、settings-mcp-access、localization）。開発/発行固定EXEの専用GUI5群成功。同じFieldと旧独立配置、MCP対応表示の区別、blur確定後実行、二重実行防止、Escape取消、キーボード実行失敗と値保持、検索アンカー、1200/760px・停止時無効化を確認した。初回GUIは停止後のmain状態からrenderer反映までを待たず失敗し、試験の条件待ちだけを修正して再成功。製品の追加修正なし。
- Watch 0.5.3との発行物GUI14群も成功。標準フォント選択のOK/取消・保存・同じ枠・狭幅折り返し、時計/日付descriptionの個別リンク・未実行・Escapeフォーカス復帰、MCP公開15項目のschema/読取/更新・不正値/書込拒否・dryRun/revision競合、従来の個別表示・再起動保持を確認。広幅/狭幅PNGを目視確認した。
- publish.bat終了コード0。seal/feed/EXE版、update.zipのサイズ/SHA256と全693ファイルの発行先一致、deploy.batの保持を確認。配布先は`A:\40.ARTIFACT\AppDock.at365`。Watchもソース/配布/ZIP manifest、最低ホスト版、EXE/feed、全2ファイルを照合した。検証入力は前後で一致。既存のVite大チャンク注意は出るがbuild成功。全回帰や旧パレット専用試験は変更箇所ではないため再実行せず、今回のGUIでリンクを確認した。
- 証跡は`.artifacts/inline-setting-actions-20261030/`の`review.json`、`inputs-build.json`、`inputs-after.json`、`typecheck.log`、`build.log`、`tests.log`、`publish.log`、`ui-dev-retry.log`、`ui-published.log`、`packages.json`、`validation.json`。固定GUIは`.artifacts/setting-actions-ui-1793308035010/`。試験方式別の成功分は3回以下で削除0、初回失敗証跡も保持。実利用設定/他Appletの発行、commit/push、GitHub Release、実利用deployは行わない。

## 2026-10-30: コマンドリンクのID絞り込み 0.105.1 とコミット照合

- コマンドリンクの`initialCommandId`をフィルターの初期値にも使い、入力欄のIDを全選択する。直接入力で検索語を置き換え、クリアで全件表示へ戻る。snapshot/ピン変更では入力を初期化せず、リンクの再表示時は対象IDへ戻す。通常起動・選択用パレットは従来の空検索を維持し、明示操作まで実行しない。
- 前回完了時の73ファイルと今回開始時のSHA256がすべて一致し、別作業の差分がないことを確認した（`.artifacts/command-link-filter-20261030/baseline.json`）。本体固定化・タグ・Shell5領域・権限/取消/保存/復旧の実装とレビュー、標準1,344件および今回影響しない固定GUIの成功結果を、前項と`.artifacts/command-links-20261030/final.json`から再利用する。履歴はmain 15fb24fのまま、既存変更を保持して作業した。
- 発行前に初期検索・フォーカス効果・モデルIDごとの再利用・消失した対象・通常検索への復帰・IME/実行抑止への影響をレビューし、阻害事項なし。変更はrendererの初期値と初期フォーカス、関連GUIと文書。API/保存形式・依存の追加変更はない。発行済み0.105.0への通常の追加修正として0.105.1へパッチ更新した。
- `install --frozen-lockfile`、整形、型検査、buildと関連26件成功。ソースと固定EXEでcommand-links GUI4群成功：IDフィルター・全選択・打ち替え・クリア・ピン更新時の検索保持・リンク再表示・通常起動空検索・明示Enter1回実行・Escapeフォーカス・無効JSON保持・一覧ダイアログ・停止中WindowsToolsの2リンク・明暗900×640を確認した。固定EXEでは通常/選択モード・IME・ピン・クラッシュ復旧等のshell-overlay7群、モーダル/入力保持/再利用のhost-modal9群とsmokeも成功。
- `publish.bat`成功。0.105.1の管理693ファイルがstagingと一致し、ASARの新renderer/専用preload/共通配色、Default Shellの旧パレット除去、ZIP/feedを確認した。固定EXEと隔離コピーSHA256は`6788af258fbd1e4ba128e6b7ecaaf9d79f68ba8f7108a62e11f74773c961e316`。ZIPは270,736,769 bytes、SHA256 `6b791a4f341787b8ba159a49e34f5ebd326e30a6921d57c4377a425bca99d5dc`。証跡は`.artifacts/command-link-filter-20261030/{published.json,package.json,*ui*.log,regression.log,smoke.log}`。
- 現行の説明をIDによる初期絞り込みへ更新し、ローカル文書参照398件/JSON例2件と差分検査が成功。前回のworktree取り込み・削除、本体固定化・タグ対応と今回の追加修正をまとめてmainでコミットする。push・Release・実利用先deployは含めない。実消灯・実ロックは実行していない。

## 2026-10-30: コマンドリンク・タグと本体固定パレット 0.105.0

- 設計worktreeの未コミット文書を、mainの既存履歴を保って取り込み後、`A:\30.PROJECT\AppDock.at365-command-links-design`をGitで削除し、以後mainで実装した。稼働プロセス・reparse point・対象パス・差分を確認し、設計原本とignored証跡をmainの`.artifacts/command-links-20261030/retained-design`と`.artifacts/command-links-design-20261030`へ保全。`integration.json`と最後のworktree一覧を参照。ブランチ`codex/command-links-design`は保持する。
- 共通`CommandLink`・`CommandText`と`[command:ID]`を実装。再生アイコンは既存の`command` IDで共用し、`bolt`はトリガー、Commandキー用アイコンは維持。Applet概要・セクション・設定・設定アクション・一覧内フィールド/編集ダイアログのdescriptionへ適用する。未知参照は非操作表示、エスケープは文字表示、HTML/Markdown・コマンド名の再解析を行わない。検索/管理一覧/パレット内の説明は現在名のプレーンテキストへ投影し、ID検索と原文・保存値を保持する。
- リンクは対象IDを初期選択してスクロールするだけで、明示操作まで実行しない。全候補・空検索・ピン順、選択モード、IME・Tab・上下/Enter/Escape、保存キュー、入力エラー、要求ごとの取消、ページとフォーカスの復帰を維持した。初回のnative寸法確定後の可視位置と、Reactがボタンを再有効化する前のフォーカス競合をレビュー/GUIで修正した。
- パレットを本体の専用renderer/preload/WebContentsViewへ移設。APIはパレット操作に限定し、送信元/main frame/固定URL/route/session/model ID/readyを検査する。非表示Viewは1件保持し、再利用時に検索・選択・sessionを更新。読込/ready/renderer障害は1回だけ再生成し、再失敗は取消と共通エラー報告。古い要求や障害通知による別要求への干渉と、実行の再送を防ぐ。所有rendererの再読込・障害時は保持Viewも破棄する。
- Shellの有効領域を5つへ整理。旧`overlay.command-palette`の保存値・manifestは互換データとして保持し、起動・描画・再試行・設定/MCP選択へ含めない。旧領域を条件とするコマンドだけ利用不可にし、通常コマンド・設定・ページは維持する。パレットはShell停止・変更・retryから独立。一時リボングループは同じOverlayHost枠を共用して継続する。
- 発行前レビュー1回と修正・再確認を実施。専用preloadの共通配色同梱、権限境界、旧指定、描画寿命・復旧、参照投影とキャッシュ、ビルド/配布を確認した。画面レビューで基本色の未定義を修正し、本体とパレットの基本色を`theme.css`で共用。検索文字は本文色へ合わせ、明暗の読みやすさを確認。新しい依存・設定キー・保存ファイル・外部実行APIは追加していない。Shell差し替え契約の廃止により0.104.2→0.105.0とした。
- `install --frozen-lockfile`、型検査、build成功。標準回帰は最終1,344件を照合し、1,344件すべての成功を確認した。最初の旧Shell前提4件は契約変更に合わせて更新し、関連70件成功。最終全体で既存の更新試験1件に一時的なAccess deniedがあり、同じ通常Windows環境で当該2件を単独実行して成功（`test-final.log`、`regression-3.log`、`update-mount-recheck.log`）。配色preloadの対象追加後は関連8件成功。失敗ログも残す。
- 固定EXEで7本のGUI成功：`command-links-ui-test`（4群）、`shell-overlay-ui-test`（7群）、`ribbon-groups-ui-test`（7群）、`shell-region-ui-test`（7群）、`host-modal-ui-test`（9群）、`shell-bars-ui-test`（8群）、`appearance-ui-test`。発行済みWindowsTools0.2.10の2タグ・停止中の対象選択/実行不可/非起動、一覧ダイアログ、無効JSON保持、明暗900×640、下のApplet入力保持、再利用/古いsession拒否、2回の障害による打切り、40回の編集取消、本文内背景、バーのnativeドラッグ・125%zoom・Shell復旧、プリセット/カスタム色・再起動を確認した。代表画像は各profileに保存し目視確認した。`fixed-*.log`の成功結果を正本とし、最終GUIのEXE SHA256は`9195d90e76f0ad2d1cea90107a5158ad0fc52eb2c370952e14f1a1522047df81`。
- 試験の整理：旧Shellパレット提供元へのfallbackは、本体Viewの1回復旧/再失敗取消と旧view非起動へ置換。全Windowを覆う旧modal fixtureは現行の本文内modalと合わないため、パレット中の両バー可視・操作を確認するケースへ置換し、編集保持/取消/背景/フォーカスはhost-modal試験が担当する。実際のバーのドラッグは維持。旧独立ページURL・装飾brand-mark・翻訳前の色名・設定ページの入口も現在の契約へ更新した。製品を古い試験へ戻す変更はしていない。
- 性能測定は1万コマンド/千件のタグ説明。初回検索カタログ28.56ms、無変更100回の中央値0.80ms/p95 1.83ms（同じオブジェクトを再利用）、参照投影4.97ms。改名時の索引更新も成功。人工的な件数上限を追加せず、実行時の最新照合は維持する（`performance.json`）。
- `publish.bat`成功。`A:\40.ARTIFACT\AppDock.at365`へ0.105.0を発行し、管理693ファイルがstagingと一致。ASAR内の新renderer/preloadと共通配色、Default Shellの旧パレット宣言除去、ZIP内ASAR/manifestの一致、ZIP/feedを確認した。ZIP SHA256は`8428371830b0f2ab86b2846c2e998c5f8bfe20af94863b3560003346d04b4453`、270,736,763 bytes。固定EXE smoke成功。
- 文書の現行仕様・AGENTSの5領域を整合。変更文書15ファイルのローカル参照398件とJSON例2件、`git diff --check`成功。詳細は`.artifacts/command-links-20261030/{docs.json,package.json,published.json,zip-entries.json}`。WindowsToolsの設定/処理は今回変更せず、実消灯・実ロックは自動実行していない。今回のAppDock変更はmainで未コミット。push・Release・実利用先deployは行っていない。

## 2026-10-30: コマンドリンク・説明文タグ・本体固定パレットの設計

- 基点は本体 `bc5431b38aa30106359b3e0d806a819d4ac37b58` / 0.104.1。元のmainには別作業の `VERIFICATION.md` / `docs/mcp-settings-design.md` の変更があったため保持し、`fetch origin` でローカル5件先行・リモート側の追加0件を確認した。Gitで `A:\30.PROJECT\AppDock.at365-command-links-design` / `codex/command-links-design` を新規作成し、確定済みのコミットから文書だけを作成した。
- 設計の正本は [コマンドリンク・説明文タグと本体固定パレット](docs/command-links-design.md)。再生アイコン、`[command:ID]`、共通描画とプレーンテキスト/検索投影、設定の入力確定・取消・フォーカス、対象IDの初期選択と参照切れ、本体固定UIへの移設、旧Shell指定の不活性保持を定義した。開発ガイドの入口を追加した。製品への適用は未実装。
- 設計レビューでは、設定ページの既存パレット経路が選択専用である点、リンクを実行ボタンへ入れ子にしない点、折りたたみ見出しのイベント、初期対象消失時に別コマンドを実行しない点を確認し、必要な接続・検証を明記した。Shell廃止の影響を宣言・条件・設定/MCP・preload・ビルド/配布まで洗い出し、既存の廃止領域の仕組みへ合わせる方針にした。
- 文書2ファイルのローカル参照98件、JSON例2件、コードフェンスの対応、末尾空白、`git diff --check` は成功。結果と文書SHA256は `.artifacts/command-links-design-20261030/docs-check.json`。本項の追記後にも差分・参照と文書のみの変更範囲を確認する。
- 設計のみのため、製品の型検査・回帰・GUI・実消灯/実ロックは実行していない。製品コード・設定・依存・版・発行物は変更せず、コミット・push・Release・deployも行っていない。設計用worktreeと検証JSONを次工程用に保持する。


## 2026-10-30: 監視競合修正 0.104.2 のコミット照合

- 発行済み0.104.2の保存/直接再読込み/revision検査/復旧と監視世代の照合、正常復帰時のエラー解除、外部設定受信・秘密保護を、調査記録と合わせた8ファイルでレビューし、阻害事項なし。製品・テスト・依存・ビルド/発行手順は実装時から不変。変更はこの検証追記だけで、版更新・再発行は行わない。
- 実装時の945入力、関連57ファイル650件・ProcessHost6件・Windows監視再現1件、型検査/build、ソースMCP64群・固定版66群・smoke・native352件の成功ログと対象を照合して再利用する。発行済み管理694ファイル、ASAR/Default Shell、native、ZIP/feedと隔離GUIコピーの一致も確認する。
- 標準151ファイルのうち、上記58ファイル656件は今回の実装時の成功を再利用。残る93ファイルは、旧標準回帰の試験とローカル依存closureのhashが一致し、追加ファイル読取・プロセス起動・動的参照がない47ファイル323件を再利用し、それ以外の45ファイル356件と、並列時の競合履歴がある更新試験1ファイル2件を分離して追加実行した。追加358件はfail/skip 0。重複を除く標準合計は**1,337/1,337件**。
- 再利用判定・依存hash・追加ログ/終了コード/hashは`.artifacts/commit-validation-settings-observer-01042-20261030/standard-plan.json`と`validation.json`、stage blob/作業ファイルとstage/commit treeの一致・最終SHAは同`commit.json`へ記録する。元の成功/失敗・調査資料を保持し、新しいGUI起動やprofile整理は行っていない。commitのみでpush・Release・実利用先deployは行わない。

## 2026-10-30: 保存後の監視旧値による巻戻りを防止 0.104.2

- main `bc5431b`から、直前の原因調査の文書2件を保持して実装。dirtyのためpullせず`fetch origin`でahead 5 / behind 0を確認し、履歴の統合・退避はしていない。本体のみ0.104.1→0.104.2。設定項目・保存形式・ファイル・公開APIは追加せず、パッチ修正とした。
- `observeFile.invalidate()`で進行中の監視世代を無効化し、各非同期結果と採用callbackの後で世代を照合する。本体SettingsStoreの保存・復旧は確定したbytesを監視へ渡し、直接再読込み/revision検査は読込成功・失敗や値の一致にかかわらず古い監視結果を退ける。新しい値・読込エラー・revisionを旧結果で上書きせず、採用通知中の同期保存が作った監視状態も保持する。取得ごとの同期I/O、固定待機、操作再試行は追加していない。
- 修正前の生成物で、新規回帰6件がすべて旧値返却または新しい読込エラーの誤解除を検出して失敗した。発行前レビューでは、直接検証しただけのbytesを適用済みとして扱うと、正常復帰時に読込エラーが残る点を追加の失敗試験で確認した。直接検証の無効化と、保存/復旧済みbytesの通知を分ける形へ修正し、7件すべてが成功した。外部変更による元の値への復帰、採用callbackからの保存、古い読込失敗の破棄を担当する監視単体3件も追加した。レビューと必要な修正を完了し、今回の製品範囲の阻害事項なし。
- 型検査・本体/Default Shell build成功。保存・同期・復旧、監視利用先、共通APIとMCP公開境界の関連57ファイル**650/650件**、fail/skip 0。Windowsの実`fs.watch`を使い、最終statと保存の完了順序だけを制御した再現試験でも、保存済みの新値を共通取得・互換取得・入力環境が保持することを確認した（1件、通知の合成/抑止なし）。全標準回帰や実利用での発生頻度測定としては扱わない。
- 実MCP設定GUIはソース**64群**、発行後の固定配布物で**66群**が成功。共通ブラウザ値の保存直後の取得、3方式の設定画面との一致、保存/取消・競合・秘密/非公開・固定ツール定義を確認した。固定版smokeも成功。発行済みの管理694ファイルをGUI/smokeの各隔離コピーと照合し、GUIで作成した起動タスクの解除を確認する。
- 通常publish終了0。発行先`A:/40.ARTIFACT/AppDock.at365/win-unpacked/AppDock.at365.exe`は**0.104.2 / SHA256 `f163f9a646276f38e6dd3046773f1ec0a4fed62fafaa2907df7557ff9faca834`**。ZIPは**270,732,714 bytes / SHA256 `b62203a2be5e09f3395896221201a0b6986ec6db6ea962d0baa97ac9f133af10`**。管理694ファイルとstage、ASAR/Default Shellの272出力、native602ファイル、ZIP/feedと非管理3項目の保持を照合した。依存版・lockfileは不変、固定lockfileのoffline installで版更新後の状態を照合。Node26.13.0 / pnpm12.15.0 / .NET SDK10.0.403 / Windows x64。
- 発行でnative14ファイルが再生成されたため、ProcessHostの起動契約**6件**と最終配布物InputHost DLLへの純粋状態検査**352件**を追加実行して成功。C#製品ソースは変更していない。native試験用build後も最終配布物/生成物のhash一致を再確認した。Pause/F13〜F24をOSへ送信・登録せず、実キー/ジェスチャーへの効果は今回の検証範囲に含めない。
- 正本証跡は`.artifacts/settings-observer-invalidation-20261030/`の入力manifest・完全ログ/終了コード/hash・`review.json`・`validation.json`・`cleanup.json`。修正前の6件とレビュー時の1件の失敗、前回の原因調査、現在の成功profileを再利用資料として保持する。既知のsmoke起動時revision競合が今回と同じ原因かは未確定のまま。今回の変更と直前の調査文書は未コミットとし、push・GitHub Release・実利用先deployは行っていない。

## 2026-10-30: ブラウザ設定の旧値返却の原因調査

- main `bc5431b` / 0.104.1のcleanな状態で調査。製品コード・依存・生成物は変更せず、前回検証済みの生成物を使った隔離試験を行った。`service.command-triggers`と`appdock_get_shortcuts`は、ともに本体の`SettingsStore.value`を読む。既存の診断では共通取得と互換取得がともに既定一覧/false、保存ファイルだけが`edge`/trueであり、互換APIだけのキャッシュ不一致ではなかった。
- `observeFile`の最終非同期statが保存前のメタデータを取得したあと、その結果の引渡し前に共通設定APIから保存する順序を制御した。保存はファイルとメモリーを`edge`/trueへ即時更新し成功する。その後、OSの変更通知が届く前に古いstat結果が引き渡されると、監視の`generation`と読取り前後のメタデータが一致したままなので、保存前の候補を`accept`する。`SettingsStore.save()`の`resetError()`は読込みの世代を更新しない。これにより共有storeと合成storeのメモリー値が古い値へ戻り、ファイルは新値のまま、revisionがさらに増える。既に一度監視値を採用済みの状態でも再現した。
- 固定Node26.13.0 / pnpm12.15.0、通常Windowsユーザー環境で診断5件が成功（fail/skip 0）。共有storeと`DeviceSettingsStore`の2経路で同じ旧値返却を再現し、保存と監視が重ならない対照、OS通知を先に届ける対照では巻戻りがないことを確認した。5件目は実際のWindows `fs.watch`を使い、通知を合成・抑止せず同じ競合と後続通知による回復を確認した。制御したのは最終statの完了と保存の順序であり、無介入の実利用での発生頻度や過去の失敗時点の実行順序を実測したものではない。
- 汎用設定の`settingsSaved`応答直後は共通取得・互換取得・入力条件用の環境がすべて新値。そのあと古い監視結果を受け入れると、すべて旧値になる。共通取得が`inherited`を現在の保存ファイルから、`value`をメモリーから判断する構造も、既存診断の`inherited:false`と旧`value`の併存に整合する。旧環境を含む`changed`通知も発生したため、取得APIだけに限定された問題ではない。実キー/ジェスチャー操作による効果は未検証で、Pause/F13〜F24のOS送信・登録はしていない。
- 修正方針は、本体が保存・直接再読込み・復旧などで正本を採用した時点で、以前に始まった監視読込みを無効化すること。固定待機、MCPの再試行、取得のたびの同期ファイル再読込みで回避せず、世代と既知の内容を監視側へ伝える。修正の実装・回帰確認は後続であり、今回の調査で解消済みにはしない。既存のsmoke起動時revision競合が同じ原因かは未確定。
- 正本証跡は`.artifacts/browser-setting-stale-read-20261030/`の`controlled.test.cjs`、`controlled.json`、`controlled-realwatch-result.json`と完全ログ。製品ソース/生成物18入力のSHA256、fixture別の保存応答・ファイル値・両取得値・入力環境・revision・変更通知を記録した。初回4件の結果も保持する。今回のfixtureは診断の再利用資料として保持し、製品の版更新・ビルド・発行・commit・push・Release・実利用先deployは行っていない。

## 2026-10-30: サービス専用Webアカウント名簿のMCP設定対応 0.104.1

- cleanなmain `bceb3f1` / 0.104.0から開始し、追跡先へ`pull --ff-only`して変更なしを確認した。`web-accounts`宣言の専用名簿と`accountGroup`の共有名簿を既存の固定6入口へ接続する。本体のみ0.104.1へパッチ更新。保存設定・ファイル形式・権限・ツール名は追加せず、コミットまでを対象とする。
- 公開はID/名前と追加・名前変更に限定。既存UUID・順序、選択・監視・音声・未知属性、ローカル状態と認証を保持する。ローカルUIの名前変更も`WebAccountRoster`の計画へ接続し、未編集の旧名の空白と一時名フラグを保持する。最新の所有先・生存・元bytes・保存先・グループ状態/移行マーカーを確認し、秘密/削除/並べ替えを拒否する。停止中は名簿のためにAppletを有効化・起動せず、読取り/dryRunで初期化・移行・復旧しない。同じグループの別提供元への反映も確認した。
- 発行前レビューは`.artifacts/mcp-service-accounts-20261030/review.json`。名前編集の共通化、未編集値の保持、保存先/宣言の変更をrevision/Schemaへ結び付ける点を修正・再確認し、今回の製品範囲の阻害事項なし。設計と設定API/Webアカウント文書を更新した。後続は原画像の寿命を扱う操作と、必要な自由JSONの構造化とする。
- 固定Node26.13.0 / pnpm12.15.0で型検査・本体/Default Shellビルド成功。標準回帰は150ファイル**1,327件**。既存更新試験を除く149ファイル1,324件と、単独の更新試験2件が成功。その後の未編集名保持の修正では関連10ファイル**108件**を再実行して成功し、影響のない1,219件を入力・ログ照合で再利用した。テスト追加は1件なので重複を除く合計は1,327件、fail/skip 0。コマンド/時刻/終了コード/完全ログhashと試験別照合は同証跡の`*-result.json`・`standard-plan.json`・`validation.json`を参照する。
- 実MCP設定GUIはsource **64群**、固定配布物 **66群**が成功。新しい専用/共有名簿でdryRun/save/replay/add、読取り専用ID、非公開列/破壊的操作の拒否、停止維持、認証/設定JSONのbytes保持と固定ツール定義を確認した。稼働中の専用/共有サービスはsource/固定版とも**8群**が成功し、名前変更のUI IPC、複数提供元への反映、停止・再起動とログイン分離/保持、所有先変更と破棄後の書込み拒否を確認した。
- 最新mainに対して古かったGUI期待値も更新した。通知先の空配列、TTS/ブラウザ/MCP接続/shortcut-listの固定件数上限廃止、フォームとトリガー一覧のタブ分離、画像メニューのmenuitemロールへ合わせ、保存・拒否・秘密保護の判定を維持する。TTSは1,001件、ブラウザは101件の保存を確認。ソース版Electronの終了時にデバッガー接続が残った試験は、その実行プロセスだけを終了して記録を保持し、対象試験を短時間のmain inspector接続へ切替後、正常終了と再起動まで成功した。
- `publish.bat`は終了0。`A:/40.ARTIFACT/AppDock.at365/win-unpacked/AppDock.at365.exe`は**0.104.1 / SHA256 `39f8cf43eed20283c3bc7d25d20316d05654abcaf8fb16fd0be41d4c774978a4`**。ZIPは**270,732,564 bytes / SHA256 `38a10d7401a856dca485a17f1f1643d44a210eed5386f78f56e5090a2da61b02`**。管理694ファイルとstage、ASAR内/Default Shellの全272出力、native602ファイル、ZIP/feed、非管理3項目の保持を照合。ASAR検証helperの初回停止はWindowsパス区切りの修正で解消し、製品の再修正・再発行は行っていない。
- 発行でnative12ファイルが再生成されたため、最終配布物のInputHost DLLへ純粋状態検査**352件**を追加実行して成功した。旧fixtureの候補配列直書きでは索引が更新されず失敗したため、本体と同じ純粋な`SetCandidates`を呼ぶよう試験だけを修正した。Pause/F13〜F24をOSへ送信・登録していない。通常の固定版smokeも成功。固定GUI/smokeの管理ファイルと最終配布物の一致、専用起動タスクの解除と試験プロセス終了を最終照合する。
- 全並列回帰では、既存のmounted-storage更新試験が一時フォルダーのアクセス拒否で失敗するケースを2回記録した。失敗結果をassertionへ含め、単独/分離実行で成功。製品・判定・待ち時間の変更や自動再試行は行わず、原因の解消は主張しない。また、設計書に残るブラウザ互換APIの旧値返却がsource GUIで再発し、診断JSONと失敗ログを保持した。同一の製品・判定でsource/fixedの通し確認は成功したが、この既知の不一致と過去のsmoke revision競合は未解決のままとする。
- 実Googleログイン/実メール受信、実Windowsサインイン/UAC、物理キー/タッチ入力の効果は今回の確認範囲に含めない。利用者の実設定・認証、既存の再利用/失敗資料を保持する。stage/作業ファイルとcommit tree・SHAの正本は同証跡の`commits.json`。push・GitHub Release・実利用先deployは行わない。

## 2026-10-30: 通知バナー位置と通知先自由化 0.104.0 のコミット照合

- 利用者が発行済み0.104.0の動作を確認し、今回の変更のコミットを依頼した。main `de79d43`からの27ファイルを対象に、6位置の選択と即時反映・PC保存、3種類の通知先自由化、既定値・通知寿命・フォーカス・Shell復旧・Appletの必須先保護をレビューし、阻害事項なし。
- 実装時の856入力と完全ログ13件を照合した。製品・依存/ビルド入力・GUIスクリプトはすべて一致し、関連22ファイル250件、型検査/build、Surface GUI8群、固定EXE GUI9群（実プロセス再起動含む）とsmokeを再利用した。発行所有694ファイル、EXE、ZIP/feedも当時のsize/SHA256と一致。製品修正・版更新・再発行なし。
- 未確認だった標準126ファイル1,061件を追加実行。旧設定を読む`preferences.test.cjs`の完全一致期待値へ新しい既定位置`top-center`を追加し、追加回帰コマンドを再実行して1,061/1,061件成功。初回の失敗ログは成功扱いせず保持した。テスト1ファイルだけの修正で、実装時に成功した250件と製品・GUIへの影響はない。再利用と合わせて標準148ファイル1,311/1,311件、fail/skip 0。
- 試験別計画・入力/ログ/成果物照合・追加回帰の完全ログは`.artifacts/commit-validation-notification-position-01040-20261030/`の`standard-plan.json`、`evidence-reuse-check.json`、`supplemental-tests-final.log`へ記録。stageと作業ファイル、stage treeとcommit tree、コミット後の状態は`stage.json`と`commit.json`へ記録する。今回の利用者確認と検証追記は文書のみの差分として扱う。
- 新しいGUI/profileは作らず、既存の成功・解決済み失敗・再利用証跡を保持した。削除0件。コミットのみでpush・GitHub Release・実利用先deployは行わない。

## 2026-10-30: 通知バナー6位置と本体3種類の通知先自由化 0.104.0

- main `de79d43` / origin/main追跡、開始時cleanを確認し、`pull --ff-only`はAlready up to date。本体のみ0.103.1→0.104.0。`host.notificationBannerPosition`を追加するためマイナー更新。コミット・push・GitHub Release・実利用先deployは未実施。
- 「設定 → 通知」に中央上（既定）・中央下・右上・右下・左上・左下を追加。通常host定義へ登録し、選択直後の保存・反映、PC専用保存、既定値の保存省略、検索・JSON・ページリセット・公開設定APIへ接続した。本体が同じ通知Viewを配置し、下側は測定した高さで上へ伸びる。通知順序・ID・期限・操作・フォーカス・Shellの切替/復旧を維持する。
- エラー・警告・インフォメーションの`requiredTargets`を空にし、バナーを解除してデスクトップ/Windows/通知センターのみも指定可能にした。初期先・時間・読み上げ、通知履歴とログは維持する。Appletが明示した必須先は従来どおり検証する。画面説明と仕様・利用文書を揃えた。
- 発行前レビューは設定登録、保存/競合/リセット、公開権限、通知寿命/操作、Shell境界と既存先への影響を対象とし、阻害事項なし。初回検証で見つかった検索カタログへの新項目登録漏れを修正した。旧必須バナーの期待値は新仕様へ更新し、一般の必須先/競合の検査を合成定義で残した。GUIの保存ファイル確認は既存のPC専用ファイルへ修正した。レビューは`.artifacts/notification-position-20261030/review.json`。
- 固定Node v26.13.0 / pnpm12.15.0 / Windows x64で型検査・build成功、関連22ファイル250/250件（fail/skip 0）。対象は通知配送/ポリシー/履歴/操作/音声/Windows、Reporter3種類、位置計算、設定保存/編集/API/MCP公開/PC保存/リセット。初回失敗ログを保持し、修正後は`regression-final.log`で全250件成功。全標準回帰は今回未実行。
- 開発GUI8群と発行済み固定EXE GUI9群成功。6位置の即時保存とネイティブBounds、位置変更時のsession維持、下側の伸長、再読込と実プロセス再起動後の復元、3種類それぞれのセンターのみ/デスクトップのみ保存、明暗・1280/760幅での取消・フォーカス・表示を確認。Source Surface GUI8群は複数カード/スクロール/操作/期限/フォーカス/提供元停止と再開/renderer故障/ready期限復旧、狭幅125%の右下配置も成功。固定EXEのsmoke成功。物理クリック、別PCのDPI/表示倍率、実Windows通知の視認は今回未確認。
- `publish.bat`で`A:\40.ARTIFACT\AppDock.at365`へ発行成功。package/feed/host manifest/Default Shellは0.104.0で一致。staging・発行先の所有694ファイル・ZIP全694エントリーのsize/SHA256を照合。EXE SHA256=`e2433697f2243cf316090d51101b0654317209394d19731005bb8f188e18583d`、ZIP=`29f138ba6f359e471474d2688bd0c96d5d201a15486d2484f6aaca0f8fa9826d`（270,729,563 bytes）。固定GUIのコピーEXEも同一。発行先の既存設定等は所有ファイル検査対象から除外し、保持した。
- 証跡は`.artifacts/notification-position-20261030/`。`inputs-publish.json`の856入力は発行後も一致、250件成功時からの差はGUI2スクリプトの追加確認だけで製品/単体回帰入力に変更なし。完全ログ、review、`published-validation.json`へ照合を記録。GUIの正本結果は`settings-controls-ui-1793292395880/result.json`（固定EXE9群）、`notification-banner-1793292299605/result.json`（Surface8群）、`smoke-1793292434596/smoke-result.json`。検証記録・利用文書の最終追記は文書のみ。
- 今回のGUI成功分は種類ごとに3回以内で、再利用用証跡と解決済みの初回失敗を保持した。無関係な過去のprofileや別作業のファイルを削除していない。検証プロセスの終了を確認し、削除0件。

## 2026-10-30: 条件表示とトリガー編集上段 0.103.1 のコミット照合

- 利用者が発行済み0.103.1の改善を確認し、コミットを依頼した。main `aa771e9`からの今回の11ファイルを対象に、範囲の表示順・Windows全体の表記・提供元Applet条件・編集上段の整列・保存IDと実行順の保護をレビューし、阻害事項なし。
- 実装時の792入力・完全ログ16件、関連7ファイル105件、ソースGUI15群・固定EXE GUI15+7群・smokeの成功結果とhashを照合し、再利用した。発行済み所有694ファイル・ZIP/feedも確認時の版/hashと一致。製品修正・版更新・再発行はしていない。
- 残る標準140ファイル1,204件は、直前の0.103.0コミット時の試験別計画と成功ログへ照合して再利用した。各試験は変更なし、条件判定・正規化・保存処理の関数本体も同一で、scopeのID集合と検証対象は不変。差分は表示用の順序・5件の翻訳値・パッチ版・renderer CSSであり、変更対象の列挙順/文言は実装時7ファイルと現行GUIで確認済み。他の標準試験に対象5文言や変更順序の期待値がないことも確認した。再利用と合わせて標準147ファイル1,309/1,309件、fail/skip 0。不要な再実行は行っていない。
- 試験別判定・成功ログ/hash・実装時入力/成果物照合は`.artifacts/commit-validation-trigger-scope-01031-20261030/`の`standard-plan.json`と`evidence-reuse-check.json`。stage blobと作業ファイル、stage treeとcommit tree、コミット後のcleanは同フォルダーの`stage.json`/`commit.json`へ記録する。今回の検証追記は文書のみの差分として扱う。
- 新しいGUI/profile生成なし。既存の成功・失敗・再利用証跡を保持し、削除0件。commitのみでpush・GitHub Release・実利用先deployは行わない。

## 2026-10-30: 条件の表示順・Windows全体の表記とトリガー編集上段 0.103.1

- main `aa771e9` / origin/main追跡、開始時cleanを確認し、`pull --ff-only`はAlready up to date。本体のみ0.103.0→0.103.1。表示順・文言・余白の修正で、設定項目・保存ファイルの追加削除と互換性変更がないためパッチ更新。
- 共通条件の順番を「Windows全体」「デスクトップ」「指定したexe」「Webブラウザ」「AppDock全体」「AppDockのすべてのページ」「AppDockの指定したページ」へ変更。キー・マウス・タッチパッドと名前付き/トリガー専用スタックが同じ定義を使い、一覧の条件表示・関連説明もWindows全体に統一した。保存ID `global`、既存の提供元Applet条件、exe正規化・対象ページ・条件判定・実行順を維持。
- トリガー編集上段の実行方法だけに入っていた`SettingsActions`の上下余白を、このヘッダー内で除去。トリガー表示にも共通コントロールの最小高と縦余白を使い、上端と通常の高さをセレクトへそろえた。通常幅・狭幅の実画面画像で、条件の順番・表記と上段の整列を確認した。
- 発行前レビューは今回の製品差分、呼び出し元、保存/APIの境界、提供元条件、狭幅と指定数入力への影響を確認し、阻害事項なし。型検査/build・最終書式確認成功。関連7ファイル105/105件、fail/skip 0。ソースのスタックGUI15群、発行済み固定EXEの隔離コピーで同じ15群と指定数専用7群、smokeが成功。3方式の追加・編集・実行方法・保存・取消・再起動保持・フォーカス・1320/900/560pxの表示と、名前付きスタックの620px表示を確認した。
- 初回のスタックGUIは、以前のフォームと一覧の同時表示を前提にしていたため失敗した。現行のフォーム/トリガー一覧タブを明示的に開くよう既存試験を修正し、ソース/固定EXEで全15群を再実行して成功した。追加で試した`command-triggers-ui-test.cjs --binding-editors-only`は、廃止された割り当て行の鉛筆を参照して最初の操作で失敗したため成功へ数えない。この旧モード全体の移行は今回行わず、現在の歯車/スタック編集・割り当て追加・取消/保存/再起動は現行のスタックGUIを担当試験とした。失敗ログ・profileも保持。
- 通常publish成功。発行先`A:\40.ARTIFACT\AppDock.at365\win-unpacked`、EXE SHA256 `581164a46b73a224dfa82358331a8770346a3833393f634b646340638527a7b1`。package/所有manifest/Default Shell/feedの版0.103.1、所有694ファイルとstagingのhash一致、ASAR内の条件定義・翻訳JSON・renderer計9ファイルと現在の生成物一致。更新ZIPは270,728,159 bytes、SHA256 `b93b521914adeebf5ed5d7077ac8107b11e8b0d39cf535c39b8223bcac89aac3`でfeedと一致。Node v26.13.0 / pnpm 12.15.0、固定lockfile・供給網検査を維持し、依存版/lockfileは不変。
- 証跡は`.artifacts/trigger-scope-layout-20261030/`の完全ログ・入力hash・review.json・validation.json・cleanup.json。成功GUIは`.artifacts/command-stacks-ui-1793290387746/`（ソース）、`command-stacks-ui-1793290551633/`（固定EXE）、`command-stacks-ui-1793290667838/`（固定EXE指定数）、smokeは`.artifacts/smoke-1793290700217/`。最終入力792ファイルの一致と、成功結果・成果物hashを照合した。今回の成功分、失敗分、既存の再利用参照または所有未確認の旧profileを保持し、削除0件。
- 無関係な全回帰・物理入力・別PC/混在DPIは未実施。Pause/F13〜F24のOS送信/登録と実Windows接続の書換え、未変更Appletの再発行・全体ZIP、コミット・push・GitHub Release・実利用先deployは行っていない。

## 2026-10-30: ステータスバー 0.103.0 のコミット照合

- 利用者が発行済み0.103.0を確認し、コミットを依頼した。main `c9093c8`からの今回の21ファイルを対象に、既定ON・即時保存/PC専用所有・検索/JSON/API/初期化・native Viewの表示と操作拒否・フォーカス復帰・追加Shellの提供元/session保持・右下ボタン削除をレビューし、阻害事項なし。
- 実装時の936入力と完全ログ10件、固定EXE GUI8+4群・smokeの成功結果、発行済み所有694ファイル・ZIP/feedの版/hashを照合。対象製品コード・依存/lockfile・ビルド条件は不変のため、関連12ファイル134件・型検査/build・GUI・smokeを再利用した。再発行や版更新はしていない。
- 本体標準147ファイルを依存先で分類し、設定登録・設定カタログ/ページコマンドまたは翻訳資源の追加による影響がある未確認101ファイル1,028件を追加実行してfail/skip 0。`preferences.test.cjs`の旧設定読込後の期待値へ`showStatusBar:true`を追加した。変更はテストの期待値だけで、確認済み製品とGUIに影響しない。残る34ファイル147件は0.102.1コミット時の完全ログと当該試験/依存ソース・固定ツールの一致、既存翻訳値が不変であることを照合して再利用。実装時134件と合わせて標準1,309/1,309件が成功した。
- 再利用元・147ファイルの判定・実行ログ/hash・成果物照合は`.artifacts/commit-validation-statusbar-01030-20261030/`の`evidence-reuse-check.json`、`standard-plan.json`、`supplemental-tests.log`、`supplemental-summary.json`、`validation.json`。今回のstage blobと作業ファイル、stage treeとcommit tree、コミット後のcleanは同フォルダーの`stage.json`/`commit.json`へ記録する。
- 新しいGUI/profile生成はなく、既存の実装/GUI/smoke・コミット検証資料を再利用のため保護して削除0件。commitのみでpush・GitHub Release・実利用先deployは行わない。

## 2026-10-30: ステータスバーの表示設定と右下ボタン整理 0.103.0

- main `c9093c8` / origin/main追跡、開始時clean・ahead 1を確認し、`pull --ff-only`はAlready up to date。本体のみ0.102.1→0.103.0。任意の設定項目追加のためマイナー更新とした。
- 設定インデックスのリボン直下にステータスバーを追加し、`host.showStatusBar`を既定ONで登録。共通の型・既定値・検証・ページ投影・検索/JSON・PC専用保存・初期化・MCPと生成ON/OFF/toggleコマンドへ接続した。切替は即時反映・保存、OFF時は28px予約枠とTab入口を取り除く。native Viewと非表示中の操作も無効にし、表示中のフォーカスを本体へ戻す。同じ提供元/sessionを保った再表示と、非表示中の提供元無効化によるfallbackを維持する。
- Default Shellの右下コマンドパレットボタンと専用CSSを削除。タイトルバーの検索、共通ショートカット、公開コマンドを維持し、追加Shellの公開`palette`操作は変更していない。
- 発行前レビューは今回の製品差分と設定・保存/API・フォーカス・native領域・オーバーレイ/本文領域への影響を確認し、阻害事項なし。明るい通常幅と暗い狭幅の実ウィンドウ画像も確認。型検査/build成功。関連12ファイル134/134件、fail/skip 0。初回単体の失敗は「すべて既定値なら省略結果全体がundefined」のテスト側参照を修正、初回GUIの失敗は既存リセットボタンの現行ラベルへ修正した。同じ必要範囲を再実行して成功し、失敗ログも保持。
- 通常publish成功。発行済み固定EXEを隔離コピーしてvisibility専用8群・通常バー操作4群が成功。設定の切替/検索/初期化、再起動後OFF保持、native Viewの実非表示と操作拒否、sessionと提供元保持、フォーカス復帰、追加Shell/fallback、パレット/Tab/最小化/最大化/復元/実ドラッグ/終了を確認。固定EXEのsmokeもbridge・保存・登録画像・トレイ・終了が成功。開発版visibility専用8群も成功したが固定EXEの結果と区別する。
- 発行先`A:\40.ARTIFACT\AppDock.at365\win-unpacked`、EXE SHA256 `301d24b5cf50e01e5c5f8d38f832d9451c53e8b987c244c1f1421f7d24b9435f`。package/所有manifest/Default Shell/feedの版0.103.0、所有694ファイルとstagingのhash一致、ASAR内の対象14ファイルと現在の生成物一致。更新ZIPは270,728,088 bytes、SHA256 `4a4ae98030149fb08622592b885a884414fdaec4c7e76030bed976fe94c16544`でfeedと一致。Node v26.13.0 / pnpm 12.15.0 / Windows x64、固定lockfileと供給網検査を維持。版更新後の依存状態不一致は`install --frozen-lockfile`で再照合し、依存版/lockfileは変更していない。
- 証跡は`.artifacts/statusbar-visibility-20261030/`の完全ログ・inputs.json・validation.json。GUIは`.artifacts/statusbar-visibility-1793288784316/`（開発）、`.artifacts/statusbar-visibility-1793288891288/`（固定EXE）、`.artifacts/shell-bars-1793288922881/`（固定EXE通常操作）、smokeは`.artifacts/smoke-1793288943448/`。現在の成功分は方式ごとに直近3回以内のため保持、初回失敗と既存の再利用参照/所有確認が未完了の旧結果も保護し、削除0件。
- 別PC/混在DPI・第三者Shell固有のUI・無関係な全回帰は未実施。未変更Appletの再発行・全体ZIP作成、コミット・push・GitHub Release・実利用先deployは行っていない。

## 2026-10-30: キージェスチャー有効設定と表示調整 0.102.1 のコミット照合

- 利用者が発行済み0.102.1を確認し、コミットを依頼した。対象は0.102.0のキー全体有効設定と0.102.1のOFF表示・列幅・タッチパッド設定順を含む今回の32ファイル。main `56e10a1`からの差分をレビューし、入力停止/元入力ブロック、既定ONと登録保持、保存/JSON/API/初期化、表示専用auxiliary、個別無効の条件列表示、共通部品と狭幅を確認。阻害事項なし。
- 0.102.1の935入力と完全ログ12件のSHA256を照合し、後続差分はVERIFICATIONのみ。型検査/build・ソースGUI18群・固定EXE GUI18群・smokeを再利用した。0.102.0の関連単体試験13ファイル197件も、試験ソース・入力実行/設定parser/API/初期化の製品コード・固定依存/ビルド条件の一致を照合して再利用。後続差分はUI配置・版・文書と未使用翻訳キーの削除であり、対象13ファイルの単体試験へ影響しないことを確認した。
- 新しいキー有効値/既定値/設定投影で未確認だった残り134ファイル1,109件を追加実行し、fail/skip 0。再利用と合わせて本体標準147ファイル1,306/1,306件が成功。成功済み197件や同じGUIの再実行、無関係な兄弟Appletの再発行は行っていない。
- 発行先0.102.1の所有694ファイルと更新ZIP/feedが実装時のhash/版と一致し、検証に使った固定EXEとも一致。製品内容の変更がないため版更新・再発行なし。新たなGUI/profileの生成・削除なし。証跡は`.artifacts/commit-validation-key-gesture-01021-20261030/`の`evidence-reuse-check.json`、`standard-plan.json`、`supplemental-tests.log`、`distribution-reuse.json`、`validation.json`。対象ファイルのstage blobと作業ファイル、stage treeとcommit tree、コミット後のcleanは同フォルダーの`stage.json`/`commit.json`へ記録する。commitのみでpush・GitHub Release・実利用先deployは行わない。

## 2026-10-30: OFF表示の整理とジェスチャー設定のレイアウト 0.102.1

- 発行済み0.102.0の利用者確認後の追加調整。main `56e10a1`/origin/main、前段0.102.0の未コミット変更を保持して着手したためpull/stash/resetは実施していない。前段との変更ファイルは`.artifacts/gesture-layout-01021-20261030/changed-from-01020.txt`。設定・保存形式・公開APIの追加削除はなく、本体のみパッチ更新0.102.0→0.102.1。
- コマンド一覧のOFFマークは入力方式全体のOFFだけに限定し、トリガーのkbd枠の左外へ配置。個別の割り当てが無効の場合は「いつ・どこで」列の従来の無効表示だけを使用する。OFFの理由・入力による絞り込み・歯車の編集・アクセント表示を維持した。
- キー・マウス・タッチパッドで共用するトリガー一覧の先頭列を通常140→180px、本文幅600px以下では100→140pxへ拡幅。実行方法列の通常230px/狭幅80pxと折り返し、コマンド列の折り返し・無効/利用不可表示、既存の操作列を保持した。機能ページとコマンドトリガーの種類別タブへ同時適用。タッチパッドのフォームは動作設定→「Windows」との接続→「ジェスチャー共通の設定」の順に変更し、共有設定の実体や接続用キーの操作は変更していない。
- 発行前レビューで表示判定・クリック/フィルター領域・個別無効表示・共通部品・広幅/狭幅・保存境界を確認し、阻害事項なし。型検査/build成功。ソースGUIはenablement4群・feature-settings9群・trigger-tabs5群、計18群成功。発行した固定EXEの隔離コピーでも同じ18群とsmokeが成功し、明暗のOFF枠外配置、個別無効だけではOFFを出さないこと、接続後の共通設定、設定保持、編集取消、実再起動を確認した。1100px/820pxの代表画面を目視し、トリガー・登録コマンド・実行方法・操作が読めることを確認した。検査は寸法の完全一致を固定せず、左外配置と表示順の要件を確認している。
- 入力実行・設定parser・API・初期化の製品コードと関連単体試験は前段から不変。表示変更に必要なビルド/型検査/GUIを今回実行し、成功済み197件や無関係な全回帰を再実行していない。タッチパッド全体OFFを維持し、Pause/F13〜F24をOSへ送信・登録せず、実Windows接続の書換えも行っていない。
- 通常publish成功。staging・発行先・更新ZIPの所有694ファイルのSHA256一致、manifest/feed/EXEは0.102.1。更新ZIPサイズ270,726,754 bytesとfeed一致、EXE SHA256=`3f82c9cb300a7e8417ec2e886ac85d6661c0eb53dc2a4fa588bc3c52bbdf228d`、ZIP SHA256=`58dfb0e1332bfc9c4147c1cde9b8f141b5bd1a7cbc79faeb1d0ccd05c59ec602`。検証前935入力のhashは発行/固定GUI後も差分0で、後続の変更は本検証記録のみ。
- 証跡は`.artifacts/gesture-layout-01021-20261030/`の完全ログ・入力hash・各summary/validationと配布物照合。ソースGUIは`command-triggers-ui-1793287540786`/`1793287545984`/`1793287552843`、固定GUIは`1793287676757`/`1793287686706`/`1793287698553`、smokeは`smoke-1793287708339`。今回の成功資料と再利用資料は保持し、削除0件。終了済みの検証プロセスを確認し、他作業の資料・固定出力へ変更なし。commit・push・GitHub Release・実利用先deployなし。

## 2026-10-30: キージェスチャーの全体有効設定とトリガーのOFF表示 0.102.0

- main `56e10a1` の作業ツリー・index・未追跡がcleanであることを確認し、現在の追跡先origin/mainへ`pull --ff-only`を実施。制限内のDNS失敗は通常Windowsユーザー環境で同じコマンドを実行して解消し、Already up to dateを確認した。本体のみ0.101.12→0.102.0。設定項目`keybindingOptions.enabled`の追加のためマイナー更新。
- キージェスチャーのフォーム先頭へ「キージェスチャーを有効にする」を追加。既定・欠落時ON、OFFは本体renderer・ローカル/Web/Applet入力の共通計画を空にし、Windows側のキー登録と元入力ブロックを解除する。割り当て・順序・条件・入力別実行方法は保持し、OFF中も編集・記録の経路を維持。共通CommandDispatcherのキー用lifetimeで次のコマンド実行前にも有効値を確認し、マウス/タッチパッドのlifetimeへ混ぜない。既存nativeの押下/解放所有権は変更していない。
- 保存・差分JSON・フォーム初期化・公開`shortcuts.get`と`appdock.shortcuts.update` configureを同じ有効値へ接続。trueは保存から省略し、トリガー一覧だけの初期化は有効値を保つ。コマンド一覧のトリガー列は3方式の全体OFFと個別無効にOFFマークを表示し、tooltip/アクセシブルな名前で理由を区別する。全体状態は表示専用auxiliaryとして投影し、割り当ての保存やJSONへ戻さない。入力絞り込みの表示には行の一時状態を固定して残さない。
- 発行前レビューで入力全経路・登録解除・実行途中の停止・保存/API/初期化境界・他方式への影響を確認。共用parserからタッチパッドのenabledを上書きしないよう、タッチパッド側で実行方法/除外だけを取り出す形へ修正。既存の順序編集と他のキー設定変更でもenabledを保持する。発行を阻害する未解決指摘なし。
- 型検査/build成功。キー・global hotkey・公開編集API・command triggers・共通browser条件・touchpad・除外・settings page/editingの9ファイル98件と、command execution/input execution/settings targetsの4ファイル99件が成功、計197件、fail/skip 0。主な新規確認は欠落時ON・OFF永続化・不正値拒否・ローカル/グローバル計画とnative入力投影の停止・登録解除/再開・API dryRun/再読込・初期化範囲。物理Pause/F13〜F24の送信・登録は行わず、該当する既存単体試験は模擬backendだけを使用した。
- ソースGUIの専用4群に続き、発行済み固定EXEの隔離コピーで`command-triggers-ui-test.cjs --enablement-only`4群、`--feature-settings-only`9群、`--tab-reset-only`15群（キー全体OFFを初期化の基準へ追加）、計28群成功。OFFでnative登録が空になりローカルDOM入力のdefaultPreventedがfalse、ONで登録と抑止が戻ること、割り当て保持、OFF中の編集取消、3方式OFFマークと個別無効の理由、明暗・狭幅・Space操作、実再起動後の保持を確認。先行GUI失敗は表示反映待ちと無関係な画像を含むselectorの問題で、保存値を変えずに条件待ちと名前による特定へ修正して成功した。
- 通常publish成功、manifest/feed/EXEは0.102.0。staging・発行先・更新ZIPの所有694ファイルすべてのSHA256一致、ZIPサイズ270,725,592 bytesとfeedのhash/size一致。EXE SHA256=`7b0273b4a2d2bcb3e71fd4dd2cdccb1a7eaef468d13ed7d302979c03db56b64e`、ZIP SHA256=`fbd9dc4ab7d929b68bee90697a66e7f30ca256b809bb7bd4ca076699f6c4a3d0`。固定EXE smokeも成功し、設定と画像の保存先を隔離profile内で確認した。Node26.13.0/pnpm12.15.0/.NET SDK10.0.403、固定lockfileと供給網検査を維持。
- 証跡は`.artifacts/key-gesture-enablement-20261030/`の各完全ログ、入力hash、`runtime.json`、`gui-summary.json`、`distribution-files.json`/`distribution-verification.json`。GUI正本は`command-triggers-ui-1793286651199`（ソース）、`1793286777299`（固定専用）、`1793286787088`（固定機能設定）、`1793286798511`（固定初期化）、smokeは`smoke-1793286809946`。今回のプロセス終了をCIMで確認。再利用証跡と診断用profileを保持し削除0件、既存の別作業/使用状態不明の古いprofileは削除していない。
- 実物理キーでのdown/up中の切り替え・外部アプリへの入力通過・物理タッチパッド/Windows接続変更は未確認。タッチパッドはGUI中OFFのままとし、全体ON状態の表示判定はフックを持たない単体入力で確認。無関係な全回帰・兄弟Appletの再発行は実施していない。実利用先deploy・commit・push・GitHub Releaseなし。

## 2026-10-29: 設定インデックス余白 0.101.12 のコミット照合

- 利用者が発行済み0.101.12を確認し、コミットを依頼した。対象は設定インデックスのCSS、版、UI指針、検証記録の4ファイルのみ。余白の移動と検索欄の整列を再レビューし、検索・選択・保存・フォーカス・幅変更の処理に変更がないことを確認、阻害事項なし。
- 実装時の934入力と完全ログ・専用GUI fixtureをSHA256照合し、後続変更はVERIFICATIONの追記だけ。型検査/build・固定EXE GUI7群・smokeの成功を再利用した。標準147ファイルは親commit `1281299`の試験別再利用表、各成功ログ、現在のテスト・製品・依存/ビルド入力を照合して再利用した。今回の差分はインデックスCSSとpackageの版、文書のみであり、既存の成功試験や無関係な全回帰は再実行していない。
- 発行済み0.101.12の所有694ファイル・EXE・更新ZIP/feedが実装時のhashと一致。版更新・再発行なし。照合結果は`.artifacts/commit-validation-settings-index-spacing-010112-20261029/`の`verify-result.json`・`verify.log`・`reuse.json`。対象4ファイルのstage blobと作業ファイル、stage treeとcommit tree、コミット後のcleanを照合する。新しいGUI/profileの生成・削除なし。コミットのみでpush・Release・実利用先deployは行わない。

## 2026-10-29: 設定インデックスのスクロール余白 0.101.12

- `settings.css`でインデックスの外側余白を上下左右4pxへ揃え、従来の16pxから移した12pxを一覧の左右・下端の内側余白にした。検索欄は対応するmarginと幅を持ち、項目との左端の一致を維持する。共通スクロールバーの見た目、設定・保存/API、検索・選択・フォーカス・幅変更の処理は変更していない。通常のCSS修正として本体のみ0.101.11→0.101.12へパッチ更新。
- main `1281299`のcleanと追跡先を確認し、`pull --ff-only`は最新だった。発行前に3ファイルの差分と影響範囲をレビューし、阻害事項なし。`git diff --check`と型検査が成功。最初の型検査は`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`で停止したため、通常ユーザー環境で`install --frozen-lockfile`を行って依存状態を同期し、型検査を再実行して成功した。依存版・lockfile・検査方針の変更なし。
- `publish.bat`（ビルドを含む）が成功し、`A:/40.ARTIFACT/AppDock.at365/win-unpacked`へ発行した。固定配布物・隔離profile・無効な18個の模擬Appletで専用GUI7群が成功。dark/1280×650、light/760×500、dark/760×320で外側とバー右側・下側4px、一覧内側12px、検索欄と項目の左端一致、横はみ出しなしを実測。左右の内側余白でのホイール、末尾の項目・検索結果への到達とキーボードフォーカス、Enterでの選択、検索のArrowDown/Enter移動とEscape解除、入力フックの無効維持、広幅でのインデックス幅変更を確認し、明暗・低い画面の画像も目視確認した。余白寸法を固定する永続テストは追加していない。
- 初回の専用GUIはホイールの対象点が右端のスクロールバー/幅変更ハンドル上に入り待機に失敗。既存のスクロール試験と同じ`clientWidth`基準でコンテンツ内の右余白を操作するよう検証fixtureだけを修正し、同じ配布物で上記全7群が成功した。初回ログ・失敗画像は診断資料として保持した。製品の追加修正や再発行はない。
- 固定EXEの既存smokeが成功。版・manifest/feed、update.zipのSHA256/サイズ、所有694ファイルをビルド出力・最終GUIコピー・smokeコピー・ZIP内容と照合してすべて一致した。EXE SHA256=`2412ad7990983a15070831c967eafd0ef053942e5242a40266d98b13c5219365`、ZIP SHA256=`6cbd158c87545a31fd9708258afe09251c24b9be721476e5c026b95106282f8f`（270,726,441 bytes）。Node v26.13.0 / pnpm 12.15.0 / win32 x64、934入力は型検査前から最終GUI・smoke後まで不変。
- 入力・完全ログ・レビュー・成果物照合は`.artifacts/settings-index-spacing-20261029/`、成功GUIは`.artifacts/settings-index-spacing-ui-1793268762305/result.json`、smokeは`.artifacts/smoke-1793268819515/smoke-result.json`。今回のGUIは専用方式の成功1回、既存smokeは過去の再利用資料を保持し、削除0件。CSSに無関係な標準全回帰・他Appletの再発行・別PC/DPI確認は行っていない。コミット・push・Release・全体ZIP・実利用先deployは未実施。

## 2026-10-29: カーソル追従 0.101.11 のコミット照合

- 利用者が追従の滑らかさを確認し、コミットを依頼した。0.101.10/0.101.11で加えた20ファイルを対象に、設定の選択・保存/API、描画同期、非表示/障害/終了、送信元とsequence、DIP寸法と画面端、最前面/透過/フォーカス、native試験の入力の対と既存実行計画をレビューし、阻害事項なし。利用者申告のKAGUYAは120Hz。`requestAnimationFrame`に60回/秒の制限は入れていないため、通常は表示先の120Hzに応じた約8.3ms間隔の更新要求になるが、その実測は未実施。座標不変時の更新省略と負荷による変動はあり得る。
- 実装時の933入力/完全ログと現在のhashが一致。関連3ファイル46件、設定/翻訳2ファイル20件、型検査/build、固定EXE GUI21群・性能GUI4群・smoke、所有694ファイルと更新ZIPの照合を再利用した。入力マネージャー/設定解析を参照する未実施の影響先5ファイル105件だけ追加実行し、fail/skip 0。成功済みの同じ試験やGUIをコミットのために再実行していない。
- 現在と同一の固定依存/ビルド定義を使う標準147ファイルの集合を確認し、依存更新時の標準1296件の成功ログを基準に再利用表を作成。後続で変わったApplet起動9件と設定編集13件は、対応する後続成功ログと試験ソースの一致を確認し、今回の関連46件・設定/翻訳20件・追加105件で必要範囲を更新した。製品の他領域/兄弟Appletを再実行・再発行していない。
- 発行済み0.101.11のEXE/ZIP/feedと所有694ファイルが不変のため、版更新/再発行なし。証跡は`.artifacts/commit-validation-gesture-follow-010111-20261029/`の`inspection.json`・`reuse.json`・`supplemental*.json/log`・`stage.json`・`commit.json`。今回の20ファイルだけをstageし、作業ファイル/stage blob、stage tree/commit tree、コミット後のcleanを照合する。既存の実装/比較/再利用資料を保持し、新しいGUI/一時profileの生成・削除なし。commitのみでpush/Release/実利用deployは行わない。

## 2026-10-29: カーソル追従の描画同期と実測 0.101.11

- 0.101.10について、利用者が実モニター間の追従成功と追従時のカクつきを報告した。LUNAの固定0.101.10で、右ボタンを保持して180物理px/秒で3秒間の連続移動を行い、別プロセスのhelperで実HWNDの位置変化を計測。本体の`position()`は高精度時刻で開始間隔と所要時間だけを記録した。入力条件・表示倍率150%・hardwareAcceleration=false・明暗テーマを揃え、元の16ms interval、処理時間を補正する締切時刻方式、描画同期を比較した。
- 元版の移動処理は平均0.56〜0.65msで、呼び出し間隔の中央値が約30.6〜30.7ms、p95が約31.5〜31.7msへ伸びていた。実ウィンドウ位置の更新は37.3〜39.7回/秒。締切時刻を使う補正方式は57.7〜58.0回/秒まで改善したがp95は約30.6〜30.9ms。描画同期の試作は59.7〜60.0回/秒、p95約17.7〜17.9msで安定した。この比較はウィンドウ位置の更新頻度であり、画面キャプチャから測った合成後の映像fpsではない。
- `GestureIndicatorHost`のNode intervalを廃止し、専用rendererの`requestAnimationFrame`から内部preload経由で追従要求を送る方式へ変更。フレーム要求には表示sequenceだけを渡し、表示内容やReact state・候補選択・寸法測定を更新しない。本体は専用Window/main frame/ローカルURL・sequence・追従モード・モデル/サイズ・表示中を照合し、現在のカーソル座標で位置だけを更新する。非表示・固定位置・描画障害・終了ではフレーム要求を止め、遅れた要求を無視する。DIP寸法キャッシュ・画面端補正・最前面復旧・非アクティブ/透過・開始対象と実行順を維持した。
- 発行前レビューでフレーム要求の所有範囲、古い要求の拒否、停止、描画と移動の分離、前回の高DPIサイズ保持、既存固定位置への影響を確認し、阻害事項なし。新しい保存設定/ファイル・外部API・入力フックの変更を含まない性能修正のため0.101.10からパッチ更新した。`timeBeginPeriod`や独自のnative高分解能タイマー、認識器の改変は追加していない。Nodeのタイマーが指定時刻どおりの実行を保証しない点は公式資料も確認した（https://nodejs.org/api/timers.html#scheduling-timers）。
- 型検査・通常build・InputTests helper build・関連Node3ファイル46件が成功（fail/skip 0）。初期測定前/非表示/固定位置/障害/終了、別sender・subframe・文字列や古いsequenceの要求拒否、同じ位置でのWindow更新省略と内容通知なしを含む。既存の設定API/翻訳2ファイル20件は試験/設定schema/公開編集実装/日本語リソースのhash一致と影響を確認して再利用した。
- ソース版は製品のフレーム更新方式を差し替えずに連続移動を検証し、59.3〜60.0回/秒、p95約17.7〜18.0ms。発行した固定EXEの同一測定では59.3〜59.7回/秒、p95約17.2〜17.5msを記録。すべての方式でピルは600×219物理pxを維持した。hardwareAccelerationをONにして数値を改善した測定ではない。最新固定EXEの通常GUI21検査群、連続移動GUI4検査群、隔離smokeも成功。非表示DOMの確定後250msの観測でフレーム要求が増えないことも確認し、Pause/F13〜F24は送信・登録していない。
- `publish.bat`成功。所有694ファイルがstage/通常GUI/性能測定/smokeの4コピーと一致し、更新ZIP全694ファイル・配置manifest/feed/EXE ProductVersion（0.101.11.0）も一致した。EXE SHA256=`323a020b9037502e2de98fe316447e948e425569a1e210d9e669f648855ba8cc`、update.zip=`ccb3cbc7de099442e1159e81d837eab2c9260f0e5ef07873b758f1804bba17e9`（270,724,462 bytes）。発行先は`A:\40.ARTIFACT\AppDock.at365`。
- 完全ログ・933入力の前後hash・helper/測定スクリプトhash・比較結果・レビュー・配布物照合は`.artifacts/gesture-follow-performance-20261029/`。比較結果は`measurements.json`、baseline/deadline/rafのログは同フォルダー内、各試験profileは同JSONを参照する。通常の古い成功整理より比較/再利用資料の保全を優先し、今回の削除は0件。全検証プロセスの終了を確認。0.101.11での利用者の体感・別PC/リフレッシュレートは未確認。既存の未コミット変更を保持し、commit/push/Release/全体ZIP/実利用先deployは行っていない。

## 2026-10-29: マウスジェスチャー待機表示のカーソル追従 0.101.10

- `indicatorPosition`へ`cursor-follow`（「カーソルに追従」）を追加。既存の開始地点・ウィンドウ中央・モニター中央・表示なしと既定値を保持し、設定フォーム・検証・公開編集APIを整合させた。既存項目の選択値を拡張する変更で、新しい設定キーや保存ファイル・既存契約の破壊を含まないため、0.101.9からパッチ更新した。
- `GestureIndicatorHost`は、表示寸法が確定してから表示中だけ16ms間隔でカーソルのDIP座標を取得する。右下16 DIPへ配置し、現在のモニター内へ補正する。位置だけの変更はrendererへ通知せず、方向・候補・開始対象の再選択を行わない。同じ配置ならWindowの更新も省く。非表示・終了・描画障害ではタイマーと位置キャッシュを破棄する。前回の表示時の最前面復旧・非アクティブ・マウス透過・古い通知の拒否を維持した。
- 発行前レビューで、設定とAPIの整合、寸法通知のsequence/送信元検査、追従の停止、認識・条件・取消と開始対象、既存の固定位置を確認した。150%表示では丸め済みのWindow寸法を移動時に再利用すると実サイズが変化するため、DOMで測定したDIP寸法と意図した配置をキャッシュする方式へ修正。実HWNDでピルが1段階・同方向移動・画面端・2段階のすべてで600×219物理pxを保持することを確認した。発行を妨げる指摘は残っていない。
- 型検査・通常build・InputTests helperのRelease buildが成功。関連Node回帰は3ファイル46件、設定API/日本語リソースは2ファイル20件、計66件が成功（fail/skip 0）。負座標・モニター境界・異なるscaleFactorのDIPデータ、同じ座標での更新省略、rendererへの位置通知なし、固定位置への切替、非表示/終了/描画障害後の停止を含む。
- ソース版の追従限定GUIは4種類×明暗の8条件と実行順・描画障害の計10検査群が成功。発行した固定EXEでは追従8条件と従来の固定位置・デスクトップ・explorer条件・別プロセス最前面11条件、実行順/描画障害の計21検査群が成功。同じ方向に動かしたときの位置追従と表示sequence・方向・候補の不変、画面端補正、最前面復旧と実際のZ順、フォーカス保持、右解放後の非表示と実行を確認した。Pause/F13〜F24は送信・登録していない。
- 初期の実入力試験ではWindowsセキュリティのダイアログと暗転Windowが入力面を覆っていた。所有プロセスを読み取りで確認し、利用者が閉じた後に再検証した。helperは実際に対象へ入力が届く位置を押下前に検査するよう補強し、本体Windowの識別も現行の`appdock://host/`へ限定した。製品の入力保護を変更していない。初期失敗と診断profileは保持し、成功へ読み替えていない。
- 固定EXEの設定GUIは成功。追従の選択・即時保存、他設定の保持、4デザイン/明暗/1280・900・700pxの見本、表示なし時の保存値保持、追従を選んだ状態での再起動復元を確認した。結果の6項目のうち1項目は明示的な実入力省略の記録であり、この設定試験自体を実入力試験へ数えていない。旧セクションclassを現行の`mouse-gesture-enablement`へ合わせた試験修正もレビューし、成功した固定EXE GUIを再実行した。製品変更はないため再発行は不要。
- `publish.bat`と固定EXEの隔離smokeが成功。発行先`A:\40.ARTIFACT\AppDock.at365`の版・配置manifest・feed・EXE ProductVersion（0.101.10.0）・ZIPサイズ/SHA256を照合し、所有694ファイルがstage/待機GUI/設定GUI/smokeの各コピーと一致した。ZIP内の全694ファイルも発行先と一致。EXE SHA256=`8f4461dd954f0067faa36e20b9fff178e64cae1e0d9349358dcfc6e8530d1c2e`、update.zip=`71dc6319f67684d31bfa8f1ff9711649486878886c3b6e188782698d9249f231`（270,724,462 bytes）。
- 完全ログ・933入力の前後hash・helper hash・レビュー・配布物照合の正本は`.artifacts/cursor-follow-20261029/`。後続の試験/文書差分は影響を判定して既存成功を再利用し、関連のない標準全回帰・native入力全回帰は再実行していない。InputHost製品コード、依存、SDK、実行基盤の変更はない。実マウスは150%画面で検証し、実際の複数モニター間移動・別PC/DPI・長期の再発有無は未確認。
- 今回の成功profileは方式ごとの直近3回以内で削除0件。診断・再利用証跡・別作業の出力を保持し、今回の検証プロセスが残っていないことを確認した。コミット・push・Release・全体ZIP・実利用先deployは行っていない。

## 2026-10-29: 更新設定の初期表示レビューと本体・全Appletのコミット照合 0.101.9

- 先行0.101.8の1,115実装入力と照合し、追加の製品変更は`UpdateSettings.tsx`だけだった。「更新の設定」を既定で開く指定と、`allowSameVersion`を最初のboolean行へ移す変更を確認。設定値・保存・更新処理・確認前のダウンロードを変えず、共通Sectionの折りたたみも維持するため、問題なしと判断した。既存About GUIの初期状態・順序・再表示の期待値と現行文書を合わせた。
- 本体・8Appletの変更全体、先行レビュー、manifest/版、単独更新の対象境界、情報/計測/検索/フォームとJSON、壁紙の標準発行による共通ギャラリー生成差分を確認した。全repoはmainのdirtyを保持してpull/stash/branch切替を行わず、GitHub originのfetch後、開始HEADと各origin/mainが全て一致した。コミット対象に別作業の実装変更なし。
- 単体の設定/更新71件、先行101件ログ内のApplet起動/manifest9件、共通ギャラリー21件、壁紙のnative fake履歴GUI9群を、関連入力と完全ログSHA256の一致に基づき再利用。101件全体を現在の同一試験として扱わず、検索文字列の変更を含む試験は新しい71件の結果を採用した。8Appletの実装入力、配置manifest/entry、ZIP/feedと既存の版は一致し、再ビルド・再発行しなかった。
- 変更後の本体は0.101.9へパッチ更新し、frozen-lockfile install、型検査/build、ソースAbout GUI6群を実行して成功。標準publish後、最終固定EXEのAbout6群・Applet7群（既存8Applet表示を含む）・本体計測2条件・smokeも成功。初期展開と行順、利用者の折りたたみ、即時保存、自動確認の抑制、明暗/狭幅、対象限定の更新確認/取消、読み取り専用計測を確認した。
- 本体所有694ファイルは発行物・ビルド出力・5隔離コピーで一致。EXE SHA256は`4833b7d7bcbc31912f7d3b892f0ce962d416076e0bde6835d275676ad1ff4503`、update.zipは270,725,688 bytes・SHA256 `d45d08504b667017a778905140fb9e6b0180a96ad858940130c29648be181d45`でfeedと一致。9repo/1,115実装入力は検証前後で一致した。
- 照合の正本は`.artifacts/commit-validation-applet-information-20261029/{initial,review,reuse,validation,artifacts,stage,commits,push}.json`と各ログ。stageのtree/作業ファイル一致、commitのtree一致、GitHub main先端とcommitの一致を同ディレクトリへ記録する。今回の5成功profileは各方式の直近3回以内で保持し、先行の再利用資料も保持した。実サービス・実利用Applet起動・実更新適用・他PC/DPIと無関係な全回帰は今回実施せず、GitHub Releaseと実利用deployは依頼範囲に含めない。

## 2026-10-29: About見出しの統一と起動時間欄の末尾移動 0.101.8

- 先行する本体0.101.7と8Appletの未コミット変更を保持。本体だけを0.101.8へパッチ更新し、通常publishで40.ARTIFACTへ発行した。設定・保存ファイル・公開APIの追加/削除はなく、各Appletの再発行・commit・push・Release・実利用先deployは行っていない。
- 「AppDockについて」のフォームは、タイトルと定型説明を既存情報パネルへ置き換えた。アプリ名を唯一のh1とし、共通ツールバーより上へ配置。情報パネルの自動更新確認・版表示・件数・管理画面への移動・更新操作は既存経路を維持し、JSONではコンパクトな見出しを保つ。本体とAppletの共通パネルから外枠の影を除いた。
- 本体とAppletの計測欄をどちらも「起動時間の計測」へ変更し、Aboutは更新設定の後、Appletは設定・表示先・共通設定の後の最下部へ配置。既定の折りたたみ、直近計測の表示、再起動時の更新、読み取り専用JSONを維持した。設定検索の期待値と現行仕様文書を整合させた。
- 発行前に差分と影響を1回レビューし、未解決の発行阻害なし。型検査/buildと関連6ファイル71件が成功。ソースGUIはAbout6群・Applet5群、発行した固定EXEはAbout6群・Applet7群・本体計測2条件・smokeが成功した。Aboutのフォーム/JSON切替後の自動確認抑制、保存、両ページの計測欄の名前と末尾配置、明暗/狭幅、既存8Appletの情報表示、単独更新確認の取消も確認。実際の公開更新の適用、実利用設定でのApplet起動、他PC/DPI、無関係な全標準回帰は今回の対象外。
- About GUIの初回は、幅変更後もポインターが更新ボタンへ重なり通常色の検査が失敗。検査前にポインターを外し、ソースと固定EXEで成功した。smokeの初回は余分な引数区切りを実行パスと解釈して起動前に失敗し、呼出しを訂正して成功。製品側の検査緩和や権限変更は行っていない。
- 発行物・ビルド出力・5隔離コピーの本体所有694ファイルが全てSHA256一致。EXEは`943b3bab53038ca486d55d1b4253281802bd0ff9324e0b13525d9ebaf8cec2a1`。update.zipは270,725,693 bytes、SHA256 `be94ca747112ce83dab81709cdeddc512e87cebe87cf3bd54efd801862f39ab9`でfeedと一致。9repo/1,115実装入力も最終検証前後で一致した。
- 証跡は`.artifacts/about-heading-20261029/{review,validation,artifacts,cleanup}.json`と各ログ、About画像は`.artifacts/about-ui-1793253477535/`、Applet画像は`.artifacts/applet-information-ui-1793253497509/`。今回の成功6フォルダーは各方式の直近3回以内として保持し、過去の検証資料・他作業も保持。起動前失敗で生じたsettings.jsonだけの一時profile1件を、絶対パス・内容・再解析ポイント・プロセス終了を確認して削除した。今回の試験プロセス残存0。

## 2026-10-29: Appletフォームの見出し差し替えと単独更新 0.101.7

- 先行0.101.6と8Appletの未コミット変更を保持して継続。本体はdirtyのためpull/stash/branch切替を行わず、今回の製品変更は本体UIだけとした。通常の表示変更で設定・保存ファイル・公開APIの追加/削除を含まないため、0.101.6→0.101.7のパッチ更新。各Appletは先行発行版を維持し、再発行していない。
- `SettingsPageLayout`に任意の見出し内容を渡し、Applet設定フォームのタイトル・定型説明を共通情報パネルへ置き換えた。パネルを共通ツールバーの上に置き、Applet名を唯一のh1として表示する。JSON/collection/他の本体設定の見出しは従来の構成を保つ。起動計測と設定本文はツールバーの下に残し、情報の検索アンカー・入力確定・保存・モード切替と共通のエラー/操作Contextを維持した。
- 稼働状態を名前の横へ移し、従来の状態表示位置には「このAppletを更新」を常設。既存`VersionCheck`をラベルなしの共通操作列へ配置し、対象ownerだけの`installUpdates(id)`と既存の確認→ダウンロード/検証→AppDock再起動の経路を使用する。更新元なしでは確認と更新の両ボタンを無効にし、理由を既存文言で示す。新しい更新方式や設定値は追加していない。
- 発行前に見出しの重複/階層、表示順、明暗/狭幅、共通Provider、JSON/リセット、対象ID制約、確認前の取得禁止、既存Aboutへの影響をレビューし、阻害事項なし（`.artifacts/applet-heading-20261029/review.json`）。既存Applet設定GUIのアンカー件数は本文から情報アンカーが移動した分だけ更新したが、その旧スクリプト全体は今回実行していない。
- frozen-lockfile install、型検査/buildと関連6ファイル96件（設定ページ/編集/リセット/About更新/portable更新）が成功。専用GUIはソース5群、発行した固定EXE7群が成功。先頭の唯一のh1と情報パネル/ツールバーの順序、JSON編集からフォーム復帰後の保存値、状態/計測/検索、更新元なし、対象外12通りの拒否、先行発行8Appletすべてのアイコン/キャッチコピー/概要と常設更新ボタンの表示を確認した。Pause/F13〜F24の割り当てを生成せず、無いことも検査した。
- 固定EXEの単独更新ではローカル模擬feedを使用し、Electronの確認ダイアログAPIを試験側でキャンセル応答に置き換え、確認要求が`fixture.info 1.0.0 → 1.1.0`だけであることと、キャンセル後の要求がmetadataだけでpayload取得0であることを確認。実更新や実再起動を実行した試験とは扱わない。既存Aboutも固定EXEで6群（更新・即時保存・明暗×4幅）成功、smoke成功。
- 本体の通常publishが成功し、発行先は`A:/40.ARTIFACT/AppDock.at365/win-unpacked`。所有694ファイルをstage/最終専用GUI/About/smokeの4コピーとSHA256照合して一致。EXE=`c160a90f7d79af0828ee713fae8734f1c5909aa9b0f97540626604ba504cc3a7`、update.zip=`a622f9d453124bcdb94fed364683b98119fa46068786483550b7b154447f8461`（270,725,649 bytes）。版/feed/manifestが一致。9repoの1115入力は最終GUI前後で不変であり、途中の追加は実Appletでボタン表示を待ってから採取する試験上の確認だけで製品差分はない。
- 入力/完全ログ/成果物照合/レビューの正本は`.artifacts/applet-heading-20261029/`。最終GUIは`.artifacts/applet-information-ui-1793251445155/result.json`、Aboutは`.artifacts/about-ui-1793251303437/result.json`、smokeは`.artifacts/smoke-1793251311688/smoke-result.json`。今回の成功分は方式別の直近3回以内で、既存の再利用資料・診断・固定出力を保持し、試験フォルダー削除0件。標準全回帰、実公開先更新、実利用Applet起動、別PC/DPI、commit/push/Release/全体ZIP/実利用deployは行っていない。

## 2026-10-29: Appletのアイコン・キャッチコピーとAbout共通表示 0.101.6

- 本体は先行の情報/起動計測0.101.5の未コミット変更を保持して継続。8つの独立Appletはmain/追跡先とcleanを確認し、通常環境の`pull --ff-only`で最新化してから変更した。開始時の状態と全manifestは`.artifacts/applet-branding-20261029/baseline.json`へ保存した。
- manifestに任意の`icon`（共通`RibbonBuiltinIcon`）と`tagline`（改行なしのプレーンテキスト）を追加。アイコン名・型・改行を読込時に検証し、人為的な文字数上限は設けない。省略時は`extensions`、キャッチコピー省略/空欄時は行を表示しない。キャッチコピーを設定インデックスとApplet管理の検索にも含めた。設定・コマンド・保存形式や既存のページ/リボンアイコンは変更していない。表示用の任意情報なので、Appletの最低本体版は既存の使用APIに対応した値を維持する。
- `SettingsAppIdentity`と共通CSSへ「AppDockについて」のアイコン/キャッチコピー/名前/バージョンの配置を抽出し、Applet情報にも使用。80px（狭幅60px）アイコンの右に同じアクセント色/文字サイズ/余白でキャッチコピーを表示する。概要はその下に残す。明暗・狭幅と省略時の表示、既存更新操作/起動計測/確定保存を維持した。公開前レビューは`review.json`。通常の表示追加であり、設定・保存ファイルや破壊的変更を伴わないため本体0.101.5→0.101.6と各Appletのパッチを更新した。

| Applet | 版 | icon | tagline |
| --- | --- | --- | --- |
| ChatCodex | 0.6.7 | terminal | 会話から、作業のその先へ。 |
| Gmail | 0.12.2 | mail | メールの確認を、もっと身近に。 |
| Profile | 0.1.1 | user | 名前とアバターで、自分らしく。 |
| WallpaperSlideshow | 0.7.6 | image | お気に入りの景色を、デスクトップに。 |
| Watch | 0.4.1 | clock | いつもの画面に、見やすい時計を。 |
| WebApplet | 0.4.2 | globe | いつものサイトを、すぐそばに。 |
| WebBrowserTools | 0.3.6 | mouse | ブラウザー操作を、指先ひとつで。 |
| WindowsTools | 0.2.8 | settings | 毎日のWindows操作を、もっと軽やかに。 |

- frozen-lockfile install、型検査/build、関連10ファイル101件と共通ギャラリー2ファイル21件のNode回帰が成功。WebBrowserToolsは標準publish内の2件も成功。専用GUIはソース4群・発行EXE5群が成功し、後者は実発行した8Appletすべてのicon/tagline/description/版を停止状態のまま検証した。省略時の共通アイコン、キャッチコピー検索、選択対象以外12通りの更新操作拒否、既存の計測/更新/Enter保存も成功。
- Aboutの固定EXE GUIは6群成功し、更新確認/対象/通知、即時保存/再入時抑制、管理画面への移動、明暗×1280/900/760/600pxの表示を確認した。既存試験の旧前提は、更新設定を専用testidで識別、自動確認ONのfixtureを明示、移動先名を現在のカタログから取得するよう修正。存在しない別機能のファイルボタンに対する重複hover検査を除き、About内の共通標準ボタンのhover/フォーカス・更新操作の確認を維持した。初期の失敗ログを成功扱いせず保持する。smokeも成功。
- WallpaperSlideshowの標準publishは本体の共通ギャラリーを0.101.6へ同期するため、`web/vendor/image-gallery/`の生成JS/CSS/manifestも更新された。v1契約と元ソース/生成物hashの一致を確認し、発行済みWeb資産と専用native fixtureを使う履歴ページGUI9群が成功。デスクトップ描画・壁紙設定を変更しないfixtureであり、実利用の壁紙や画像は操作していない。生成物の追加差分もレビューし、阻害事項なし。
- 本体と全8Appletの通常publishが成功。各feed/ZIP内manifest/配置manifestのID・版・icon/tagline、ZIPサイズ/SHA256、native/.NETのProductVersionを照合した。本体所有694ファイルはstage/専用GUI/About/smokeの4コピーと一致し、EXE=`ec90cdf32840df6e7e66e7d28a9699735f720ddf3a0c9223487906d1c2f4b936`、ZIP=`5c301b44c3bd4f25ae71474be52815b4227e606b1bf4c3b52f98e7094e8a052d`（270,723,897 bytes）。9repoの1115入力は最終GUI前後で不変。先行の専用GUIからの製品ソース変更はなく、後続差分はAbout試験の前提修正だけである。
- 完全ログ/入力/hash/レビュー/各配布物の正本は`.artifacts/applet-branding-20261029/`。固定専用GUIは`.artifacts/applet-information-ui-1793249075900/result.json`、Aboutは`.artifacts/about-ui-1793249424439/result.json`、壁紙は兄弟repoの`.artifacts/history-page-ui-1793249137971/result.json`。実利用Appletの通常起動、実Google/Codex接続、実Windows入力、別PC/DPI、標準全回帰は今回の実施範囲に含めない。
- 試験フォルダーは今回の成功が方式別の直近3回以内であり削除0件。先行作業の再利用資料・失敗診断・固定出力は保持。コミット/プッシュ/Release/全体ZIP/実利用先deployは行わず、既存変更を保持した未コミット状態で引き渡す。

最終の専用GUIでは実Appletの初期キー/ジェスチャー割り当ての取り込みを明示的に抑止し、Pause/F13〜F24の割り当てがないことも検査して5群を再確認した（`.artifacts/applet-information-ui-1793249820682/`）。先行GUI後の後続変更は、About試験の旧前提修正に加え、この試験用の初期化と検査だけで、製品ソース/配布物は不変。任意の初期化済み一覧を試験側で作る修正後に成功し、初回の試験準備失敗はログへ保持した。

## 2026-10-29: Applet設定の共通情報パネルと起動計測 0.101.5

- mainの作業ツリー/インデックス/未追跡がcleanであることと追跡先を確認し、通常ユーザー環境の`pull --ff-only`で最新を確認して着手。各Appletの定義や配布物は変更せず、本体の共通`AppletInformationPanel`に名前・版・対象Appletの更新確認/最終確認・概要・状態を表示し、詳細にID/最低本体版/宣言配布元をまとめた。既存の任意`description`をプレーンテキストとして使い、非文字列はmanifest検証で拒否する。概要はヒントOFFでも表示し、設定インデックスとApplet管理から検索できる。
- 「Appletの起動計測」は情報パネルの直後に既定で閉じて配置。既存の直近の`startupTiming`の合計/4区間/成功・途中失敗を表示し、未起動と開始待ちは未計測、再起動中は旧値を消して計測中、完了後は新しい値へ更新する。読み取り専用の計測JSONをコピーできる。本体の起動計測と表示CSSを共用し、collectionの子ページにはパッケージ情報/計測を置かない。新たな設定・保存ファイル・計測処理・ポーリングは追加していない。
- 発行前レビューで、共通レイアウト/配色、概要の未指定/文字列検証とHTML非解釈、状態と計測の寿命、設定JSON/リセット、表示用投影の範囲、既存の更新確認/確認ダイアログへの接続を確認。GUI確認で判明した概要/最低版/計測の投影不足とAppletページの更新操作未接続を修正し、更新操作は選択owner以外のID・host/all・未指定を拒否し、全体更新/全体取消の操作を公開しない構成とした。再確認後の発行阻害事項なし。保存仕様/APIの破壊的変更を含まない表示追加・修正として0.101.4→0.101.5のパッチ更新。
- frozen-lockfile install、型検査、ビルド、関連10ファイル100件のNode回帰（Applet起動/manifest、検索/設定投影、設定ページ/寿命、既定値リセット、About更新、本体起動計測、翻訳、MCP表示、Applet管理）が成功。初回の追加試験の引数順/入力確定の誤りも修正し、失敗ログは成功として扱わず保持。既存Applet設定GUIのアンカー件数期待は情報/計測の2件分を更新したが、同スクリプト全体は今回実行していない。
- 専用GUIはソース版と発行した固定EXEで各4検査群成功。概要の改行/HTML非解釈/ヒントOFF、キーボード詳細と計測開閉、実Node Appletの各区間/再起動中から完了への更新、停止・開始待ち・失敗、Enter確定による即時保存、概要検索、明暗/狭幅、模擬feedのmetadataのみの取得と共通エラーを確認。固定EXEでは追加した12通りの対象拒否も確認した。本体起動計測GUIは明暗2条件（共有設定2,606/37,871 bytes）成功し、固定EXEのsmokeも成功。実利用Appletの実起動・公開先での更新/ブラウザーリンク・別PC/DPIの確認とは区別する。
- 通常publishは成功し、`A:/40.ARTIFACT/AppDock.at365/win-unpacked`の0.101.5を検証。本体所有694ファイルをstage/専用GUI/本体計測GUI2環境/smokeの計5コピーとSHA256照合し全件一致。EXE=`bbc1bbc13f38ad6d8e8f48ca2124136951efd107dc04dfb3ffa60629ce9a6c50`、update.zip=`ca42c797f88bc15a3b066d2dccdc0246826fdf2aa8cdadf3efb6411823f934b7`（270,723,605 bytes）。feed/manifest/本体版が一致し、829入力も固定GUI前後で不変。入力/完全ログ/成果物照合の正本は`.artifacts/applet-information-20261029/`の`inputs-before.json`・`inputs-after.json`・`artifacts.json`、専用固定GUIは`.artifacts/applet-information-ui-1793247792794/result.json`。
- テスト整理は、新しい専用GUIの成功分がソース/固定とも3回以内、本体起動計測も方式別で各2回のため削除対象なし。失敗診断・先行検証の再利用資料・固定出力は保持。今回の試験プロセス終了を確認し、その他の古いsmoke等は既存記録の再利用資料として保持する。全標準回帰、未変更Appletの再発行、全体ZIP、コミット/プッシュ/Release/実利用deployは行っていない。

## 2026-10-29: 依存パッケージ・ツール更新と脆弱性確認 0.101.4

- main=`c5abad4`、作業ツリー/インデックス/未追跡はclean。通常ユーザー環境で追跡先へ`pull --ff-only`し最新を確認した。公式メタデータと公開日時を照合し、`update-packages.bat`でNode.js 24.22.1→26.13.0 Lithium LTS、Electron 45.0.0→45.1.0を完全版固定。pnpmは7日経過済みの12.10.1→12.15.0へ更新した。製品コード・設定・保存形式・公開APIの変更はなく、通常の依存更新として0.101.3→0.101.4へパッチ更新。
- 直接依存はMCP SDK 1.32.1、i18next 26.5.4、react/react-dom 19.3.1、react-i18next 17.1.0、smol-toml 1.9.1、@types/node 26.6.5、electron-builder 26.18.0、Playwright 1.64.1、Prettier 3.9.10、Vite 8.3.5へ更新。@types/react・@types/react-dom・@vitejs/plugin-react・TypeScriptは変更なし。通常依存とpnpmの公開後7日、日時欠落拒否、verifyDepsBeforeRun、既存のinstall script許可を維持。SDK 1.32.2等の未成熟版は採用していない。
- 更新後の全依存監査で、MCP SDK→Express→body-parser 2.3.0にHighの[CVE-2026-111181 / GHSA-27r3-jxmh-p828](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828)を検出した。圧縮リクエストの末尾バイトでプロセスが終了するDoSで、[公式修正版2.4.0](https://github.com/expressjs/body-parser/releases/tag/v2.4.0)と修正差分を確認。脆弱な2.3.0だけを互換範囲内の2.4.0へ置換するoverrideと、完全版指定`body-parser@2.4.0`だけのセキュリティ修正用待機例外を追加した。公開日時は2026-10-22T11:39:38.614Zで、**2026-10-29 20:39:38.614 JST以降は待機例外を除去可能**。overrideは上流の解決で修正版が保持されることを確認してから整理する。
- 最終`pnpm audit --json`は実行時・開発用・間接依存407件に対し、全重大度0件・終了0。pnpm自身のローカル導入先を対象にしたnpm auditも0件・終了0。[Node 26.13.0](https://nodejs.org/en/blog/release/v26.13.0)は[10月のセキュリティ版26.12.1](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)を継承するLTSであることを確認。[Electron 45.1.0](https://releases.electronjs.org/release/v45.1.0)の内蔵Node 24.22.1、Chromium 156.0.8078.49と[eMudhra対策の修正範囲](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9)を別に確認した。[React Server Componentsの告知](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3)の対象`react-server-dom-*`はlockfileに存在しない。これは確認日時点の既知情報と監査の結果であり、未公開の脆弱性がないことを保証するものではない。
- Nodeの公式SHA256照合を含む初回取得、pnpmのWindows x64ネイティブ実体とshimの初回生成、setup再実行、Electronバイナリ取得、固定lockfile install、型検査、本体/Default Shell/Node・.NET fixture build、標準回帰**1,296/1,296（fail/skip/cancel 0）**、通常publishが成功。7日待機を実pnpmで検査する既存fixtureも含む。ホストのツール・型定義を共有するGmail/WebApplet/WebBrowserToolsの型検査4件と、GmailのReact/Viteの隔離buildも成功し、兄弟repoの追跡ファイルは全件hash不変。兄弟Appletの版更新・発行は行っていない。
- 発行前に依存差分、待機例外の範囲、overrideの互換性、保存・公開APIへの影響、必要回帰と版区分を1回レビューし、監査の指摘を修正版で解消した。最終発行物の`settings-controls-ui-test.cjs`6群、`mcp-settings-ui-test.cjs`10群、`portable-updates-ui-test.cjs`14群とsmokeが成功。明暗・狭幅・キーボード/フォーカス・保存/取消、実MCP handshake・認証/接続失敗と復旧・再起動後保持、実フォルダー更新と再起動・設定/ログインfixture/有効状態の保持、Node/.NET fixture接続、画像読込とNode非公開を確認した。実アカウント・実利用設定の操作、脆弱性の実攻撃再現、他PCの動作は未確認。
- `A:\40.ARTIFACT\AppDock.at365`へ0.101.4を発行。ステージ/発行先/4つの隔離GUI・smokeコピーの本体所有694ファイルとZIP内694ファイルがSHA256一致。ASAR内の製品版0.101.4とbody-parser 2.4.0、固定EXEの実Electron 45.1.0/内蔵Node 24.22.1を確認。EXE SHA256=`8ae08e497cde44ce0d76c184eda0a6d91d5cb4f38f4b0dd60b1301449301c272`、ZIPサイズ270,722,982 bytes、ZIP SHA256=`6a2ca3f99256701e6372838137b03232ace24601fcf76fc55abc2c77fc9ef32f`。manifest/feed/ZIPの版・サイズ・hashも一致した。
- 証跡は`.artifacts/dependency-update-20261029/`の各stage完全ログ/終了コード/hash、927追跡入力の検証前後hash、`review.json`、`registry-preflight.json`、`sibling-compat.json`、`artifact-validation.json`、`zip-validation.json`。最終GUIのprofile名はartifact-validationへ記録。初期監査のHigh、選択的な間接更新で版が変わらなかった記録と未使用例外のprune、例外再追加前の待機拒否、検証スクリプトのWindows ASARパス修正前の失敗を保持し、最終成功と区別する。全ての製品/試験/依存入力は検証後も不変。コミット照合は`.artifacts/commit-validation-dependencies-20261029/`を参照する。
- テストフォルダーの種類と直近3件を確認。今回の成功分と元資料を保持し、既存の参照・再利用資料および他作業の利用状態を確定できない古いprofileは削除していない。今回の専用テストプロセスの終了を確認する。ローカルcommitのみを行い、push・GitHub Release・実利用先deployは行わない。

## 2026-10-29: ジェスチャー検証の二重解放とデスクトップメニュー後片付け

- main=`43acba2`、作業ツリー/インデックス/未追跡はclean。追跡先へ`pull --ff-only`して最新を確認した。先行調査で、待機表示用helperが正常解放後のfinallyでも右ボタン解放を送り、デスクトップのメニュー状態が残って次の開始を除外されることを確認済み。診断用コピーでの成功を、今回は正式なテストへ反映した。
- `RunIndicatorStages`と`--send`/`--send-inactive`は右ボタンの押下状態を保持し、finallyではまだ押している場合だけ解放する。押下前に失敗した場合や正常解放後に余分な解放を送らず、途中失敗時の解放は維持する。製品のInputHost/表示処理は変更していない。
- デスクトップの後片付けは、前面スレッドだけでなくShellのGUIスレッドを照会し、メニュー所有Windowのrootがデスクトップであることを確認する。`SHELLDLL_DefView`などの子Windowが所有する背景メニューも対象にし、確認した所有Windowへ`WM_CANCELMODE`を送って終了を待つ。前面WindowへEscapeを送る方式を除き、他Windowのメニューや操作先のフォーカスを保つ。
- 正式InputTestsのRelease build、発行済み0.101.3の固定InputHostを使う実OS入力233検査（従来230＋子Window所有/背景メニュー取消とフォーカス/他Windowメニュー保持の3検査）が成功。続けて通常の`gesture-web-indicator-ui-test.cjs --portable`を制限モードなしで実行し、4種類×明暗、デスクトップ/Explorer条件、別プロセスの最前面Windowとの重なり、解放後の実行順、IPC拒否、描画障害後の継続を含む13検査群が成功した。以前失敗したデスクトップとexe条件も正式helperで連続して通過し、試験終了後のデスクトップメニューフラグ/捕捉は0。Pause/F13～F24のOS送信/登録なし。
- レビューで正常/途中失敗/押下前失敗の入力の対、メニュー所有元の境界、非アクティブ状態の後片付け、フォーカスと他メニューの保持、試験の期待値/文書との整合を確認し、阻害事項なし。製品コード・設定・依存・版/配布内容に変更がないため版更新/publishは行わず、0.101.3を維持する。発行先と最終GUIコピーの本体所有694ファイルが先行発行時のSHA256と一致し、EXE=`fb2bfcc8cc0c73a5392f33232313a29a0eced65620a19b38f1fb6ef68a531449`、ZIP/feedも不変。
- コミット時は先行コミットの標準147ファイルと成功ログ、926入力、現在の差分を照合。変更はnativeテスト3ファイルと関連文書だけで、Nodeテスト・製品ソース・依存/ビルド定義は不変のため、標準Node回帰147ファイルと製品の型検査/build/smokeは既存成功を再利用した。変更したnative helperと固定発行物GUIは今回実行し、同じ成功試験をコミットのためだけに繰り返さない。
- 証跡は`.artifacts/gesture-test-cleanup-20261029/`の各stage入力SHA256と前後不変記録・完全ログ・`validation.json`・`cleanup.json`・`stage.json`・`commit.json`。今回の5ファイルだけをstageし、作業ファイル/stage blobとstage tree/commit treeを照合する。今回の全体GUI成功は同方式の直近3回以内、先行の失敗診断/再利用資料を保持し削除0件。専用GUIプロセスの残存なし。実利用環境での物理操作や別PC/DPIの確認とは区別する。ローカルcommitのみでpush/Release/実利用deployは行わない。

## 2026-10-29: 待機表示の最前面復旧 0.101.3 のコミット照合

- 利用者は実利用での再発を観察する方針でコミットを依頼した。再発解消を実機確認済みとは扱わない。main=`dafd81d`上の今回の7ファイルをレビューし、表示時だけの最前面復旧、非アクティブ/透過、送信元/sequence/寸法通知、入力/保存/APIの維持、試験と版/文書の整合にコミット阻害事項なし。デスクトップ開始の失敗調査はこのコミット後に行う。
- 実装時の926入力と完全ログのSHA256、所有694ファイルの発行先/ステージ/最終GUI/smokeコピー、ZIP/feed/manifestの0.101.3を照合して一致。型検査/build、関連3ファイル43件、ソース/固定発行物の最前面GUI11検査群、smokeを再利用した。製品内容は発行済み0.101.3から変えず、版更新/再発行は行わない。
- 先行コミットの818入力・標準147ファイルの試験集合/ソース・成功ログを照合。差分は本体版、待機表示host、専用GUI/native probeだけで、変更した製品モジュールは今回の関連43件と固定GUIが担当する。他の144ファイルは対象コード・依存/試験入力が不変のため、先行コミットの標準成功を再利用した。コミットだけを理由とする全回帰/GUIの再実行は行わない。
- 証跡は`.artifacts/commit-validation-gesture-topmost-01013-20261029/`の`reuse.json`・`stage.json`・`commit.json`。今回の7ファイルだけをstageし、作業ファイル/stage blobとstage tree/commit treeを照合する。既存の失敗診断/再利用資料を保持し、追加削除なし。ローカルcommitのみでpush/Release/実利用deployは行わない。

## 2026-10-29: マウスジェスチャー待機表示の最前面復旧 0.101.3

- 開始時はmain=`dafd81d`、作業ツリー/インデックス/未追跡はclean。`pull --ff-only`は制限環境のDNS失敗後、通常ユーザー環境で最新を確認。既存の個別実行数0.101.2のcommitを保持し、main上で今回の変更だけを追加した。
- `GestureIndicatorHost`は有効なsequenceの寸法通知で位置とサイズを確定し、非表示から`showInactive()`した直後に`setAlwaysOnTop(true, 'pop-up-menu')`を再適用する。Windowsの最前面属性が外れた場合や他の最前面Windowより下になった場合の復旧を対象とし、表示中の更新では繰り返さない。フォーカス/クリック透過、通知の送信元/sequence、解放/取消/実行、設定・保存形式・公開APIは変更しない。通常修正として0.101.2→0.101.3へパッチ更新。
- 発行前に製品差分と表示寿命、入力/保存/APIへの影響、試験の検出能力、版区分をレビューし、表示順修正に未解決の阻害事項なし。レビューは`.artifacts/gesture-topmost-20261029/review.json`。初期の検査は表示直後を採取していたため実際の表示/最前面属性/Z順序を待つ条件へ変更し、入力開始の成否と独立して別プロセスWindowとの重なりを検証する構成へ整理した。旧コードでは最前面を外した待機Windowが対象Windowの上に戻らず、新しいZ順序検査が失敗することを確認。
- 固定Node24.22.1/pnpm12.10.1/Electron45.0.0・lockfile・供給網検査を維持。offline frozen-lockfile install、型検査、本体/Default Shell build、関連3ファイル43件、専用InputTests helperのRelease build、通常publishが成功。Unit後の差分は試験スクリプト・native probe・仕様文書だけで、製品TS/設定/依存と当該Unit入力は不変として43件と型検査を再利用。最終のnative helperとGUIは試験修正後に実行した。
- ソース版と最終発行物の`gesture-web-indicator-ui-test.cjs --topmost-only`が各成功。4種類×明暗と別プロセスの最前面Windowを重ねる9条件で、表示前に最前面属性を意図的に外し、再表示での`WS_EX_TOPMOST`復旧、実HWNDのZ順序、元のAppDock Windowの前面状態維持、透過/非アクティブ/ツールWindow属性を確認。1/2段階の方向/候補更新、解放後の非表示と実行順、IPC拒否、描画プロセス障害後の共通エラー1回と入力実行継続を含む11検査群成功。別プロセスWindowは非アクティブに重ねる専用fixtureであり、そのWindowを開始対象にした成功とは扱わない。Pause/F13～F24の送信・登録なし。
- 全体GUIのデスクトップ/Explorer条件は待機表示自体が出ず失敗。表示APIの診断では再表示の呼出しが来ておらず、変更前の固定0.101.2（EXE SHA256=`83361e11aa01059d1b43e23a8a8f7fa840e0f1c4f8e7999cf5e4e81b8bfff9a0`）とHEADの元スクリプトでも同じ非表示を確認した（`baseline-desktop.log`）。別プロセスWindowを開始対象にした追加試験も非表示で失敗しており、入力開始処理へ修正を広げない。全体GUI成功や任意アプリでの物理操作成功と扱わず、今回の表示順重点検査と区別する。
- `A:\40.ARTIFACT\AppDock.at365`へ0.101.3を発行し、最終固定EXEの隔離smoke成功。ステージ/発行先/最終GUI/smokeコピーの本体所有694ファイル、およびZIP内694ファイルのSHA256が一致。manifest/feed/ZIPの版、payloadサイズ270,710,165 bytes、ZIP SHA256=`0a6d89474bbca2d407419bb42e2c21b69966fe5f2cdcbca45558e57b032067bc`、EXE SHA256=`fb2bfcc8cc0c73a5392f33232313a29a0eced65620a19b38f1fb6ef68a531449`を確認。
- 証跡は`.artifacts/gesture-topmost-20261029/`のstage入力926ファイルのSHA256・前後不変記録、完全ログ、review/cleanup-audit/artifact-validation/zip-validation。最終GUIは`.artifacts/gesture-web-ui-1793239274449/`、smokeは`.artifacts/smoke-1793239291455/`。初期診断ランナーの起動待ち失敗時は今回専用のNode/子プロセスだけを終了し、準備待ちを修正した。最終プロセス照合で今回のprofileを使う専用GUIプロセスの残存なし。今回のソース/固定成果物の成功分は各方式の直近3回以内、失敗診断・旧版照合・過去の再利用資料を保持し、削除0件。
- 無関係な全回帰・Applet再発行・全体ZIP・commit/push・Release・実利用先deployは行わない。利用環境での再発解消、デスクトップ/任意アプリからの物理ジェスチャー、他PC/DPI・ロック/UAC画面は未確認。

## 2026-10-29: 個別実行数指定・トリガー編集表示 0.101.2 のコミット照合

- main=`00e49ea`上の今回の32ファイルをレビュー。階層ごとの行数指定、条件/利用可否/重複/失敗時の非補充、全体2択と個別継承、保存正本・公開schema・編集権限・revision、native候補と入力ブロック、UIの入力/取消と幅、版・試験・文書の整合を確認し、コミット阻害事項なし。製品は発行済み0.101.2から変更せず、版更新・再発行は行わない。
- 実装時の818入力と成功ログを照合。関連13ファイル231件、共通native69fixture、固定EXEの入力4群、最終GUI7群/3方式×3幅の9画面・再起動保持・smoke、型検査/build/publishを再利用した。実装時のunit引数には非存在の`automation-api.test.cjs`が含まれていたため、実ファイル数を14から13へ訂正。231件の成功は不変で、現在の`automation.test.cjs`/`appdock-api.test.cjs`は今回の追加試験に含めて確認した。
- 標準147ファイルを洗い出し、現在の実装時成功13ファイル、過去の標準ログと実ソース/依存先が一致する未影響31ファイルを再利用。変更した入力へ到達する依存先・source読み取り、変更された試験と元の成功ログ入力を照合して再利用できない103ファイル949件だけを追加実行し、fail/skip/cancel 0で成功。追加試験前後も818入力は不変。標準147ファイルの必要範囲を確認した。
- 発行先/ステージ/最終GUI/smokeコピーの本体所有694ファイル、ZIP/feedとmanifestの0.101.2、payloadサイズ/SHA256、前段の固定EXE入力試験で使ったInputHost DLLと現在のDLLの一致を確認。発行物のhashを維持した。今回の照合証跡は`.artifacts/commit-validation-command-count-01012-20261029/`の`plan.json`・`additional-regression.json/log`・`reuse.json`・`stage.json`・`commit.json`。元の実装/表示検証資料と既存の再利用資料を保持し、追加削除なし。
- 今回の32ファイルだけをstageし、各worktreeファイルのGit blobとstage、stage treeとcommit treeを照合する。ローカルcommitのみで、push/Release/実利用deployは行わない。専用fixtureの結果と物理デバイス・実利用先での効果の未確認範囲は前段から変更なし。

## 2026-10-29: トリガー編集の実行方法・実行数を横並びにする 0.101.2

- 前段0.101.1の未commit変更を保持して表示だけを追加修正。トリガー編集に残っていたselectの強制100%を2箇所から除き、共通の実行方法に`field-sizing: content`を適用して選択中の文言に必要な幅へ揃えた。狭幅の均等2列では実行数が折り返すため、右列へ内容幅を確保。保存、実行方法の値、条件、公開API、nativeコードの変更なし。通常の表示修正として0.101.1→0.101.2をパッチ更新した。
- 発行前にCSS差分と共通部品への影響、選択肢の継承表示、実行数の操作到達と狭幅をレビュー。ソース版の一時検証で見つけた狭幅の折り返しを修正し、3方式×1320/900/620pxの9画面で選択欄と実行数の横並び・領域内への収まりを確認。寸法/CSSを固定する永続試験は増やしていない。実行数の保存・取消・継承・実再起動を含む既存GUI7群も成功。未解決の発行阻害事項なし。
- 固定lockfile/供給網検査付きinstall、build、通常publish成功。最終固定EXEでも同じ9画面とGUI7群、smokeが成功。前段の型検査、関連231件、native69fixture/実入力4群は、818入力の照合で今回の製品差分がpackage版とCSSだけと確認して再利用。本体InputHost DLLも前段の実入力試験コピーと同一hash。無関係な全回帰やnative実入力の再実行は行っていない。
- `A:\40.ARTIFACT\AppDock.at365`へ0.101.2を発行。ステージ/発行先/最終GUI/smokeの所有694ファイル、ZIP内694ファイルのSHA256が一致。manifest/feed/ZIPの版とpayloadサイズ270,710,196 bytes、ZIP SHA256=`a22dcf045cb075b0c64ee334003a24c43d15a17ce492edc0b5ea6897c40be88d`、EXE SHA256=`83361e11aa01059d1b43e23a8a8f7fa840e0f1c4f8e7999cf5e4e81b8bfff9a0`を確認。
- 証跡は`.artifacts/trigger-mode-width-20261029/`のstage完全ログ・818入力のhash/前後不変記録・review・source-layouts/layouts・artifact-validation/zip-validation。最終GUIは`.artifacts/command-stacks-ui-1793237017121/`、smokeは`.artifacts/smoke-1793237051593/`。一時ランナーの空引数解釈エラーと修正前の狭幅診断を保持。今回の成功分は同方式の直近3回以内、前段の再利用資料と他作業の利用状態が不明な既存profileを保持し、削除なし。専用fixtureプロセスの残存なし。
- commit/push/Release/実利用先deployは行わず、利用者による表示確認待ち。

## 2026-10-29: 個別トリガー・コマンドスタックの実行数指定 0.101.1

- `main/00e49ea`のcleanな作業ツリーから開始し、通常ユーザー環境で`pull --ff-only`を実行して最新を確認。個別トリガーと名前付きスタックに「指定の数」と実行数入力を追加した。方式全体はfirst/allの2択、個別トリガーの既定値は継承のまま。条件一致・有効・利用可能な登録行を保存順で最大N件選び、重複行も各1件、入れ子は親で1件と数える。失敗時に未選択行で補充せず、取消・対象変更・許可の検査を維持する。
- 保存と公開APIは従来のfirst/allに加え、個別の`executionMode`と`inputExecutionModes`の値で`{ mode: "count", count: N }`を扱う。正の安全な整数を共通検証し、既存の保存正本、revision/dryRun、編集権限、条件・順序・ID、nativeのキー入力ブロックを保持。数値オブジェクトの比較は参照同一性に依存しない。方式全体への件数指定はAPIでも拒否する。
- 実行基盤、保存投影、公開schema、共通編集部品、一覧の件数表示・絞り込み、native候補と待機表示、試験と正本文書を発行前にレビューし、未解決の発行阻害事項なし。0.101.0発行後の画像確認で、数値欄へ共通入力の幅指定が優先されラベルが折り返す問題を修正。0.101.1で入力幅・ラベルと選択欄を再確認した。設定値追加による0.100.6→0.101.0のマイナー更新、その後の表示修正による0.101.1のパッチ更新を適用。
- 固定Node 24.22.1/pnpm 12.10.1/Electron 45.0.0、Windows x64で、固定lockfileと供給網検査を維持したinstall、型検査、build、通常publishが成功。関連13ファイル231件、TypeScript/native共通69fixture、InputTests Release buildが成功。失敗時の非補充・取消、不正数値、条件不一致・無効・利用不能、重複、階層別選択、3方式の保存往復と競合、公開APIのdryRun・拒否・継承を検査した。標準全回帰は今回の実装段階では実施していない。
- 最終発行EXEの隔離GUI7群が成功。正整数入力、空欄/0/負数/小数/非安全整数の拒否と入力保持、Escape/取消、モード切替中の数値保持、入れ子実行、3方式の個別保存と一覧/絞り込み、全体2択、全体変更と個別優先、継承への復帰、実再起動後の保存を確認。広幅・狭幅の画像を目視確認した。試験途中の空一覧説明行の数え方、画面切替待機、native所有キーへローカルdispatchを使っていた試験ハーネスを修正し、最終発行物で全群を再実行。製品の契約は変更していない。
- 最終固定EXEと専用Windowsウィンドウで入力4群成功。通常キーの入れ子条件、外部exe条件と順序/入力ブロック、不一致時の元キー通過、マウスの指定2行と未選択3行目の除外を確認。最終smokeも成功。Pause/F13～F24の送信・登録は行っていない。専用fixtureへOS入力を送った結果であり、物理デバイスによるタッチパッド認識、Windows接続設定の書き込み、実Appletの外部効果、実利用配置での確認は対象外。
- `A:\40.ARTIFACT\AppDock.at365`へ0.101.1を発行。ステージ/発行先/最終GUI/入力/smokeコピーの本体所有694ファイルと、ZIP内694ファイルのSHA256が一致。manifest/feed/ZIPの版、payloadサイズ270,710,143 bytes、ZIP SHA256=`d6e6295b054e1e23f0fe357a1e8aee2e58836755784581582c5a63b0a85b27c0`、EXE SHA256=`87123dedeac1e47d7eb2a68861d34ca43c1f723eaa1b66f2d0c63bfe737752b0`を確認。
- 証跡は`.artifacts/command-count-20261029/`の各stage完全ログ、818入力のSHA256と前後不変記録、review/cleanup/artifact-validation/zip-validation。231件・native69fixtureの後の差分は製品版、GUIハーネス、編集部品のclassとCSSのみで、計画・保存・API・native・当該回帰入力は不変として再利用。最終GUIは`.artifacts/command-stacks-ui-1793234211202/`、入力は`.artifacts/command-stacks-native-1793234268292/`、smokeは`.artifacts/smoke-1793234286032/`。同方式の今回成功分は直近3回以内、解決済み失敗診断と過去の再利用資料/他作業の利用状態が不明なprofileを保持し、削除なし。専用InputTarget/InputTestsプロセスの残存なし。
- 未変更Appletの再発行、全体ZIP、commit/push、GitHub Release、実利用先deployは行わない。利用者による動作確認待ち。

## 2026-10-29: メニュー・ポップアップ対応 0.100.6 のコミット照合

- 利用者が「非アクティブなウィンドウ・デスクトップでも開始する」をONにした状態で、Windowsのコンテキストメニュー、Edgeと他アプリのポップアップでも右クリックが動作することを確認し、今回の対応を受け入れた。これは利用者による実機確認であり、専用fixtureの成功とは区別する。
- main=`efdee7f5bd3193ddcffe8283243f770f95e64523`上の今回の7ファイルをレビューし、入力の対、捕捉前/前面化workerの判定、デスクトップ/通常ダイアログ/枠なしアプリとの境界、試験の期待値・仕様・版の整合を確認。コミット阻害事項なし。製品内容は利用者が確認した0.100.6から変更しておらず、版更新・再発行は行わない。
- 実装時の598入力、完全ログと最終7ファイルのSHA256、発行先/ステージ/最終smokeコピーの本体所有694ファイル、EXE/ZIP/feed、InputHost DLLを照合して一致。関連49件、ポップアップ30検査、実OS入力230検査、型検査/build・固定発行物smokeの成功を再利用した。
- 先行0.100.5のcommit/tree、843入力、完全ログの再利用参照を照合。標準147ファイルの集合・試験ソース、main/shared/renderer、SDK/runtime、依存/ビルド定義は不変で、差分は本体パッチ版・今回のnative開始判定・InputTestsだけ。実装時49件以外の143ファイル1,224件を再利用し、標準147ファイル1,273件の必要範囲を確認した。コミットだけを理由に同じ試験・GUIを繰り返していない。
- 照合証跡は`.artifacts/commit-validation-gesture-popup-01006-20261029/`の`reuse.json`・`stage.json`・`commit.json`。今回の7ファイルだけをstageし、作業ファイルとstage blob、stage treeとcommit treeを照合する。実装時の成功記録・今回の照合資料を保持し、追加の削除は行わない。ローカルcommitのみで、push/Release/実利用deployは行わない。

## 2026-10-29: メニュー・ポップアップでのジェスチャー開始を見送る 0.100.6

- main=`efdee7f5bd3193ddcffe8283243f770f95e64523`、開始時clean。追跡先へ`pull --ff-only`して最新を確認し、main上で実装した。非アクティブ開始をOFFにすると元の右クリックが使えることは利用者が確認済み。今回の修正は設定のON/OFFにかかわらずメニュー/一時ポップアップの入力を通すもので、利用中の設定は変更していない。
- `GestureEngine.Begin`のセッション取得・右押下捕捉・前面化より前に、対象/前面スレッドのメニューモード、標準メニュー/コンボ一覧のクラス、タイトルバー/サイズ変更枠のない所有付きまたは非アクティブ属性付き`WS_POPUP`を判定する。該当時は押下/解放をそのまま通し、右クリックの再送もしない。前面化workerも同じ判定を再確認する。Shellデスクトップ、通常ダイアログ、独立した枠なしアプリを対象から除外しない。
- 発行前レビューで入力の対、捕捉前の判定、workerの再確認、デスクトップ/通常Windowとの境界、フック内の処理量、設定/保存/公開APIへの影響を確認し、阻害事項なし。設定・保存形式・保存ファイル・公開APIの追加/削除はなく、通常修正としてパッチ版0.100.6へ更新した。実行候補の選択処理は変更していない。
- `--gesture-popups`の専用画面で、修正前InputHostがWinFormsポップアップの右押下通過検査に失敗することを確認。修正後と最終発行DLLで各30検査成功。標準メニュー、WinFormsメニュー、コンボ一覧、所有付きポップアップ、非アクティブ表示のポップアップ、設定ON/OFF、通常ダイアログ/枠なしアプリの開始とメニュー終了後の復帰を確認した。この試験は実Window/メニューループを表示し、製品のマウス処理へメモリ内の押下/解放を渡す。フック登録やOSへのクリック送信は行っておらず、任意の実アプリで物理クリックした結果とは区別する。
- 既存InputTestsの実OS入力230検査が成功し、1/2段階移動、クリック、キー、ホイール、右クリック復元、修飾キー/他ボタンによる開始抑止、取消、デスクトップ/Explorer、非アクティブ開始、本体への前面移動を確認した。最初の実行で、現在のコマンドスタック仕様に対して古い重複コマンド除去を期待する7検査が失敗したため、既存コードと`docs/command-stacks.md`の「同じIDでも選ばれた各行を実行」に期待値と関連説明を合わせ、全230検査を再実行して成功した。Pause/F13〜F24はOSへ送信/登録していない。
- 固定Node24.22.1/pnpm12.10.1/Electron45.0.0と既存lockfile・供給網検査を維持。版更新で依存照合が再installを要求したため、`install --offline --frozen-lockfile`で再照合し成功。型検査、関連4ファイル49件、通常publishの.NET/本体/Default Shell build、最終発行物の隔離smokeが成功した。598入力のSHA256は検証/発行の前後で一致。無関係な標準全回帰・設定GUI全体・兄弟Appletの再発行は行っていない。
- `A:\40.ARTIFACT\AppDock.at365`へ発行。ステージ/発行先/最終smokeコピーの本体所有694ファイルがSHA256一致し、manifest/feed/ZIP内manifestの0.100.6、ZIPのsize/SHA256、利用者データを含まないことを確認。EXE SHA256=`7425dc1c717f4d8ac13856fbe776c80a80001cbeedec986b427af74b86041985`、ZIP SHA256=`c8a2070cb661ad78e63a0f267e461c49f16254bc2aa10592812bdbc0c557875a`、270,708,481 bytes。実入力試験済みInputHostと最終発行DLLのSHA256=`366f9c0d270431f86060e38694e1f07427b016d567af2f5d81d9f6b60cf8c857`は一致した。
- 証跡は`.artifacts/gesture-popup-pass-through-20261029/`の完全ログ・`inputs-final.json`・`review.json`・`artifact-validation.json`・`validation.json`。最終smokeは`.artifacts/smoke-1793221853843/`。今回のポップアップ試験フォルダーは1件。smokeの直近3回、既存の検証/再利用資料、他作業での利用状態が確定できない既存分を保持し、削除0件（`cleanup-audit.json`）。各実アプリの独自ポップアップ、同一Window内の独自描画、UAC/ロック画面、他PC/DPIでの操作は未確認。commit/push/Release/実利用deployは行っていない。

## 2026-10-29: 実行方法列の幅調整とトリガー一覧のコミット 0.100.5

- 0.100.4の確認後、広い画面の実行方法列を160pxから230pxへ広げ、「ジェスチャーの設定を使用する」を折り返さず表示。狭幅では従来の80pxと折り返しへ戻す。登録コマンドの全文折り返し、無効・利用不可表示、コンパクトなトリガー列、操作見出しの省略を保つ。
- main=`3a1a6d135ed455aec41c514946455e51a6b3ecc7`上の今回の9ファイルを保持して追加修正。継続中のdirtyを自動pull/stash/破棄しない。設定項目・保存形式・公開API・保存ファイルの変更はなく、発行済み0.100.4への通常修正のため0.100.5へパッチ更新。発行前レビューで広幅/狭幅、既存の状態表示・順序・編集/削除・アクセシビリティ、共通一覧への影響を確認し、阻害事項なし。
- 固定lockfile/供給網検査付きinstall、最終build、配色/構造の追加2ファイル11件が成功。0.100.4の成功ログ・入力を照合し、変更がCSSとpackageの版だけでTS/TSX・main/shared・回帰ソース・固定依存は不変のため型検査と関連3ファイル27件を再利用した。
- 先行0.100.3のcommit/tree、776入力、完全ログとSHA256、標準147ファイルの集合・試験ソース・main/shared/native/依存を照合。今回の27件と追加11件以外の142ファイル1,235件を再利用し、標準147ファイル1,273件の必要範囲を確認。コミットだけを理由とする全回帰の再実行は行っていない。判断と照合は`.artifacts/commit-validation-trigger-list-01005-20261029/reuse.json`。
- 一時runnerによるソースGUI6群・最終発行EXE GUI6群、最終smokeが成功。3方式×種類別タブ/機能ページで明1280px/暗760pxの12状態を確認し、広幅の実行方法が実際に1行で全文表示され、狭幅と長い登録コマンドでも横はみ出しがないことを実測・画像確認した。編集取消、設定保持、操作列のアクセシブルな名前、他一覧の従来表示、実再起動後の保存も確認。寸法・CSSの一致を固定する永続試験は追加していない。
- `A:\40.ARTIFACT\AppDock.at365`へ通常発行。発行元/発行先/最終GUIコピー/最終smokeコピーの本体所有694ファイルがSHA256一致。manifest/feed/ZIP内manifestの0.100.5、ZIPのsize/SHA256、843入力の検証前後の不変を確認。最終EXE SHA256=`9e5b4e7f114a5313d56481a2b98fbe87dec69a9d05c4d8a98ca04d8358929d5c`。未変更Appletの再発行・全体ZIP・Release・実利用deployは行わない。
- 証跡は`.artifacts/trigger-mode-width-20261029/`の入力一覧・完全ログ・`layout-observations.json`・`artifact-validation.json`・`zip-validation.json`、コミット照合は`.artifacts/commit-validation-trigger-list-01005-20261029/`。最終GUIは`.artifacts/command-triggers-ui-1793220995525/`、smokeは`.artifacts/smoke-1793221006919/`。今回の専用runnerの成功はソース/発行物それぞれ1回で直近3回以内、前段の再利用資料・失敗診断・固定出力を保持し削除なし。
- コミット対象は今回の9ファイルだけとし、作業ファイル・stage blob、stage tree・commit treeの一致を証跡へ残す。pushは行わない。物理入力・Windows設定書込・実Appletの外部処理効果・実利用先での操作は未確認で、隔離profile/fixtureによる表示・操作・保存の成功と区別する。

## 2026-10-29: トリガー一覧の折り返しとコマンド状態 0.100.4

- main=`3a1a6d135ed455aec41c514946455e51a6b3ecc7`、開始時clean・追跡先あり。`pull --ff-only`は制限環境のDNS失敗後、通常ユーザー環境で最新を確認。今回の変更は未コミット。push・Release・実利用先deployは行わない。
- 3方式のトリガー一覧で、登録コマンドを保存順のままセル内で折り返す。トリガー列は通常140px、狭幅100pxとし、登録コマンド列へ残りの幅を配分。長い名前・空白のないIDも折り返し、行の高さを自然に広げる。無効な割り当てと利用できないコマンドは、それぞれ打ち消し線と状態文言を表示する。操作列は見出し文字だけを省き、アクセシブルな列名と編集・削除を保持。種類別タブと各機能ページは同じ共通一覧を使用する。
- 共通`SettingsListTable`へ任意のセル描画・表class・操作見出し省略を追加。未指定の一覧の表示を維持し、カスタムコマンド一覧の従来の操作見出しをGUIで確認。設定項目・保存形式・公開API・保存ファイルの追加削除と実行基盤の変更はなく、通常パッチ更新で0.100.3→0.100.4。
- 発行前レビューで要件、状態の区別、ID・検索・保存順・編集取消、共通一覧への影響、保存/API境界、必要検証を確認。GUIの曖昧なボタンselectorを名前による指定へ修正。実画面でclampによる列幅が均等になる問題と共通CSSの優先度を修正し、明示幅・狭幅の配分で再確認した。狭幅で常に登録コマンド列を最も広くするという一時検査の過剰な期待も除去し、横はみ出し・全文折り返しと操作到達の確認を維持。最終差分に発行阻害事項なし。レビューは`.artifacts/trigger-summary-20261029/review.json`。
- 固定Node 24.22.1/pnpm 12.10.1/Electron 45.0.0、Windows x64。固定lockfile/供給網検査を保ったinstall、変更ファイル整形、型検査/build成功。`command-triggers/command-stacks/localization`の3ファイル27件成功。型検査・Node回帰後の製品変更はCSSだけでTS/TSX・main/shared・回帰ソースは不変。最終ビルドとGUIを再実行し、型検査と27件は当該CSSに依存しないため再利用。無関係な標準全回帰は実施していない。
- `command-triggers-ui-test.cjs --trigger-tabs-only`へ、3方式×種類別タブ/機能ページの状態表示・順序・編集取消・設定保持、アクセシブルな操作列と他一覧への影響の検査を追加。寸法/CSSの固定検査は永続試験へ追加していない。一時runnerで長い日本語名と空白のない英数字を与え、明1280px/暗760px×3方式の横はみ出しなしと折り返しを実測・画像確認。ソースと最終発行EXEでそれぞれ6群成功、実再起動後の設定保持と最終smoke成功。
- `A:\40.ARTIFACT\AppDock.at365`へ通常発行成功。発行元/発行先/最終GUIコピー/最終smokeコピーの本体所有694ファイルをSHA256で照合し一致。manifest/feed/ZIP内manifestの0.100.4、ZIPのサイズ・SHA256、検証前後の843入力の不変を確認。最終EXE SHA256=`e419aa6fc67be4fd6d658a97b06b6eb8e06c8ec786b91ca4b85219474ba8a4e6`。未変更Appletの再発行・全体ZIPは行わない。
- 証跡は`.artifacts/trigger-summary-20261029/`の完全ログ、`inputs-build.json`・`inputs.json`・`artifact-validation.json`・`zip-validation.json`・`validation.json`。最終ソースGUIは`.artifacts/command-triggers-ui-1793220304112/`、最終発行GUIは`.artifacts/command-triggers-ui-1793220414455/`、smokeは`.artifacts/smoke-1793220424892/`。今回の一時runnerの成功はソース2回・発行物1回で各方式の直近3回以内。失敗診断と再利用証跡を保持し、既存profileは使用/参照状態を十分確認できないため削除しない。CIMのアクセス拒否はプロセス不在の証明に使わず、試験スクリプトの正常終了・明示的な終了処理と区別する。
- 実利用設定・物理入力・Windowsタッチパッド設定の書き込み・実Appletの外部処理効果は確認対象外。隔離profileとfixtureによる一覧表示・操作・保存の検証であり、実利用先での確認は未実施。

## 2026-10-29: タブ単位の設定リセット 0.100.3 のコミット照合

- 利用者が0.100.3の動作を確認した後、main=`7eeb601`上の今回の14ファイルをレビュー。名前付きscopeの検証、タブ/ページの対象、revision/signature、設定省略、共有/端末の境界、Windows接続と既存確認ダイアログへの影響を確認し、コミット阻害事項なし。
- 実装時の776入力・完全ログ22件、発行先/最終GUI/最終smokeコピーの本体所有694ファイルとZIP/feedのSHA256を照合して一致。型検査/build、関連91件、最終発行EXE GUI15群・smokeを再利用し、版更新・再発行は行わない。
- 共有型・既存ページ・共通ブラウザ設定を確認する未実施の`command-trigger-options/settings-view-client/settings-navigation/appearance/shell-boundaries` 5ファイル39件を追加し成功。先行コミットの922入力と成功ログ、変更のない試験・依存/実行条件を照合し、他の134ファイル1,143件を再利用。今回の13ファイル130件と合わせ、標準147ファイル1,273件の必要範囲を確認した。同じGUIやbuildをコミット依頼だけで繰り返していない。
- 照合証跡は`.artifacts/commit-validation-tab-reset-01003-20261029/`の`reuse.json`・`stage.json`・`commit.json`。今回の14ファイルだけをstageし、作業ファイル/stageとstage tree/commit treeを照合する。既存の失敗診断・固定出力・再利用資料を保持し、ローカルcommitだけを行う。push・Release・実利用deployは行わない。

## 2026-10-29: 表示中のタブ単位の設定リセット 0.100.3

- main=`7eeb6013d74b78f6fb956115b6ada2acc22e1bd6`、開始時clean・追跡先と一致。`pull --ff-only`は制限環境のDNS失敗後、通常ユーザー環境で最新を確認。main上で実装し、commit/push/Release/実利用deployは行っていない。
- コマンドトリガーの種類別タブは、その方式の割り当てと入力別の実行方法だけを戻す。コマンド一覧は3方式すべて、各機能ページはフォームの動作設定・共通ブラウザ設定とトリガー一覧を分離。検索・絞り込みに連動せずタブ全体を対象にし、JSONはページ全体を対象にする。確認画面にページ/タブ名・保存先・共有設定への影響を表示する。
- ホストが名前付きscopeを既存の設定カタログの範囲へ解決し、任意のパス・不正scope・他ページのscopeを拒否。従来のrevision/signature/確認時の値の照合、入力確定、原子的保存と既定値省略を維持する。タッチパッド一覧のリセットは共有保存だけを対象にし、端末の有効状態・接続用キーを保持。フォームのリセットもWindows設定・接続試行履歴を変更しない。
- 発行前レビューで要件、タブ/ページの所有範囲、カスタムコマンドの定義・条件・順序、既存の保存先と競合・Windows接続への影響を確認。初回GUIの一括リセット比較は、既定のkeybindingsを省略する既存の保存仕様との表現差で失敗したため、保存形式を正規化して比較し、割り当て・動作設定・他の値の検査を維持して14群成功。失敗診断も保持する。
- 0.100.2発行後、既存リボンGUIの参照確認で共通ダイアログの見出し変更を発見。通常ページ/JSONの従来の見出しを保持する修正と代表ページの取消検査を追加し、再レビュー・型検査・翻訳8件・固定EXE GUI15群・smokeに成功。設定項目・保存形式・公開API・保存ファイルの追加削除はなく通常パッチ更新。発行済み0.100.2への追加修正のため、最終版を0.100.3に進めて再発行した。
- 固定Node 24.22.1/pnpm 12.10.1/Electron 45.0.0、Windows x64。固定lockfile/供給網検査を維持したinstall、変更ファイル整形、型検査/build成功。`settings-defaults-reset/settings-editing/settings-page/settings-page-host/command-triggers/command-stacks/touchpad-gestures/localization`の8ファイル91件成功。最終の見出し修正はrenderer・版・GUI検査だけでmain/sharedと8試験ソースは不変のため91件を再利用し、rendererを直接読むlocalizationは8件を再確認した。無関係な全回帰は実施していない。
- `command-triggers-ui-test.cjs --tab-reset-only`はソース14群、最終発行EXE15群で成功。3方式×種類別タブ/トリガー一覧/フォーム、コマンド一覧、JSON、取消、外部変更後の確定拒否、既存ページの確認見出し、実再起動後の保存を確認した。GUIの設定は隔離profileとfixtureコマンドを使用。物理入力、Windowsのタッチパッド設定書込、実利用先での操作は未確認。
- `A:\40.ARTIFACT\AppDock.at365`へ通常発行。生成元/発行先/最終GUIコピー/最終smokeコピーの本体所有694ファイルのSHA256が一致。manifest/feed/ZIP内manifestの0.100.3、ZIPのsize/SHA256、776入力が最終発行・検証中に不変であることを確認。最終EXE SHA256=`decaddd1045ee1fd2f9d6a1ab7f16f16a6cc9c052465135c8735cb365dd60c90`。兄弟Applet再発行・全体ZIPは行っていない。
- 証跡は`.artifacts/settings-tab-reset-20261029/`の完全ログ・`inputs-01003.json`・`artifact-validation.json`・`validation.json`。最終GUIは`.artifacts/command-triggers-ui-1793219168991/`、smokeは`.artifacts/smoke-1793219213948/`。今回のタブリセット専用GUIの成功は方式別で直近3回以下。既存smoke等は参照/使用状態の確認が不十分なため保持し、失敗診断・固定出力・再利用資料も削除していない。

## 2026-10-29: 設定ページ遷移 0.100.1 のコミット照合

- 利用者が0.100.1の改善を確認した後、main=`4bca7de`上の今回の15ファイルをレビュー。インデックスの先行表示、1秒の遅延案内、先行選択/離脱/失敗、既存検索・即時保存とIPC/session境界への影響を再確認し、コミット阻害事項なし。
- 実装時の841入力と成功ログのSHA256、発行物/固定GUI・smokeの隔離コピーの本体所有694ファイルとZIP/feedを照合して一致。型検査/build・関連62件・ソース遷移GUI5群/検索8群・最終発行EXE遷移5群/smokeの成功を再利用し、版更新・再発行は行わない。
- 未実施だったrenderer/配色/パッケージの構造検査5ファイル25件を追加し成功。今回の12ファイル87件と、先行mainの完全ログ/試験ソース/未変更の実行依存を照合した135ファイル1,176件を合わせ、標準147ファイル1,263件の必要範囲を確認した。コミットだけを理由とする同一GUI/buildの再実行は行わない。
- 照合証跡は`.artifacts/commit-validation-settings-transition-01001-20261029/`の`reuse.json`・`inputs-final.json`・`stage.json`・`commit.json`。今回の15ファイルだけをstageし、作業ファイルとstage、stage treeとcommit treeを照合する。追加検査のログと既存の失敗診断・再利用資料を保持。ローカルcommitのみを行い、push・Release・実利用deployは行わない。

## 2026-10-29: 設定ページへの遷移と読み込み案内 0.100.1

- main=`4bca7de9a05cde1f7cf87408a72b268f70d600ef`、開始時clean・未push1件。`pull --ff-only`は制限環境のDNS失敗後、通常ユーザー権限で実行して最新を確認した。main上で実装し、commit/push/Release/実利用deployは行っていない。
- 設定値・編集session・操作IDを含まないインデックスを本体専用IPCで別途取得し、他ページの表示中もsnapshot変更で更新。通常と読み込み中の共通frameでインデックスDOM・幅・スクロール・フォーカスを保ち、本文は新しい接続から取得する。1秒未満では案内を出さず、超過時だけ右本文中央へ表示する。最低表示時間は設けず、失敗/詳細は即時表示する。
- 読み込み中の項目選択/結果への移動は新接続のキューへ順番どおり反映。検索入力・幅変更は接続完了後に有効化し、離脱時に旧キュー/タイマー/接続を破棄する。設定保存・権限・MCP/Applet公開API・保存ファイルは不変のため通常パッチ版`0.100.1`とした。
- 発行前レビューはframe継続、インデックスの情報範囲、既存IPC送信元検査、session/revision、先行操作、タイマー/失敗/離脱、幅変更と検索/即時保存への影響を確認し、製品の指摘なし。検索GUIの廃止済みApplet一覧/詳細タブの期待値だけを現在の管理一覧から設定へ移る入口に修正し、8群すべて成功。初回遷移GUIの失敗は詳細ボタンの古いアクセシブル名で、現行名へ修正後に全群成功。失敗診断も保持する。
- 固定Node `24.22.1`/pnpm `12.10.1`/Electron `45.0.0`、Windows x64。固定lockfile・供給網検査を維持して`install --frozen-lockfile`、変更ファイルの書式、型検査、buildが成功。`settings-page/settings-page-host/settings-editing` 27件、`settings-view-client/settings-navigation/host-pages/localization` 35件、合計62件成功。無関係な標準全回帰・兄弟Appletの再発行は実施していない。
- `settings-transition-ui-test.cjs`はソースと最終発行EXEの両方で5群成功。短時間/長時間、インデックス先行と同一DOM/幅、先行選択の反映、即時エラー/詳細、読み込み途中離脱と再接続、狭幅/暗色の本文内表示を確認。既存検索GUIはNFKC/IME・項目移動・即時保存・JSON・動的追加/削除・検索保持・狭幅を含む8群成功。発行EXEの隔離smokeも成功。
- 既存`publish.bat`で`A:\40.ARTIFACT\AppDock.at365`へ発行。ステージと発行先の本体所有694ファイルがSHA256一致。EXE=`97e2159a80a1c3dedc2864e8ea81cae1ae8185985bd85a5681561224414bcb4a`、update.zip=`c77e1d81bcd170f7464ffa61fce26b821bb1876b6263198758bc25eeb567b80c`、270,706,369 bytes。manifest/feed/ZIP内manifestは0.100.1で、ZIPのSHA256/sizeと利用者データを含まないことを確認した。
- 証跡は`.artifacts/settings-transition-20261029/`の完全ログ、841入力のSHA256、レビュー、成果物照合、最終結果。GUI詳細は`.artifacts/settings-transition-ui-1793217673175/`（source）、`settings-transition-ui-1793217762805/`（portable）、検索は`settings-search-1793217605588/`、smokeは`smoke-1793217768783/`。renderer画像だけでnative Shell全体の合成を確認したとは扱わず、本文/インデックスの領域内配置と実接続を動的検査した。実利用環境での体感、物理入力・実メール/Windows通知は未確認。
- 今回のテストアプリは終了を確認。種類/実行方式別の新しい成功分は直近3件以内、失敗診断/再利用資料は保持した。旧smokeの既存参照・他作業利用が未確定の資料も保護し、削除は行わない。詳細は`cleanup.json`。

## 2026-10-29: タイトルバーの通知ベルと通知センター表示 0.100.0

- main=`b7df63d`のクリーン状態から`pull --ff-only`し、最新一致を確認して着手。タイトルバーの「通知」をベルへ変更し、クリックは既存の`appdock.notifications.open`へ接続した。センターを開いた後は本体本文へnativeフォーカスを渡す。通知サービスのアクティブ件数をバーの公開モデルへ投影し、0件は通常色、1件以上は共通アクセント色にする。センターを開くだけでは件数・色を変えない。
- バナーへ移動する`dock.focusNotifications`、IPC、`NotificationSurfaceHost.focus`、通知bridgeの`onFocus`とDefault Shellの受信処理を削除。バナーの直接操作・Escape/Tabによる本文復帰と、デスクトップ通知のフォーカス解放は維持した。既存API・操作契約の廃止に該当するため0.99.34から0.100.0へマイナー更新。設定・保存ファイルの追加削除なし。タイトルバーのカスタマイズ機能は対象外。
- 発行前レビューで、センター表示後にnativeフォーカスがバナーへ残る場合を検出し、バーの操作から本文へ渡すよう修正した。最終の型検査・build・関連66件、ソース版ベル5群と通知バナー8群が成功。通知発生時のフォーカス保持、手動操作と期限切れ、提供元切替・故障復旧、Escape復帰も確認した。
- `publish.bat`成功。`40.ARTIFACT/AppDock.at365/win-unpacked`の所有694ファイルがbuildとSHA256一致し、0.100.0のmanifest/feed、更新ZIPのサイズとSHA256も一致。固定EXEの隔離GUIはベル5群、更新進捗14群、デスクトップ通知5群とsmokeが成功。両テーマ、センターのみの通知、重複更新、閉じる・解消・期限切れ・発行元停止、バナー表示中のセンター移動を確認した。進捗表示中はベルが隠れ、取消後に復帰する。
- GUI検証の途中では、試験用の通知schema不足・旧移動先・省略設定の扱い・接続を繰り返すことによる投影確認の干渉を修正した。デスクトップ試験も、非同期の状態判定と空配列の`every`で起動待ちを抜ける条件を修正し、実際の通知Applet2件のrunningを待って成功した。初回の失敗ログは診断資料として保持する。
- 利用者が発行版を確認し、コミットを依頼した。実装時の成功ログ・最終入力・発行物を照合して再利用し、API・配色・版情報を参照する追加6ファイル50件だけ補完した。今回の標準15ファイル116件と、影響のない132ファイル1,146件の既存成功を合わせて、標準147ファイル1,262件の必要範囲を確認する。コミット依頼だけを理由に同じGUIやbuild・発行を繰り返さない。
- 実装証跡は`.artifacts/titlebar-bell-20261029/`、コミット照合は`.artifacts/commit-validation-titlebar-bell-01000-20261029/`。最終EXE SHA256は`d91db693f34f7d733a4a9b22dbc5484fce602e608c0f7c68877ef678c533f5a3`。固定配布物・直近成功・失敗診断・再利用用資料を保持し、既存資料の削除は行わない。物理Windows通知クリック・実メール受信・物理入力・実ロック/UAC・全体ZIPは未実施。今回のcommitのみを行い、push・Release・実利用先deployは行わない。

## 2026-10-29: 共通画像選択ダイアログ 0.99.34 のコミット照合

- 利用者が0.99.34の使いやすさを確認した後、main=`e62b540`上の今回の8ファイルをレビュー。配置・固定サイズ・補助操作の無効化・検索/追加表示・取消/確定・既存共通ダイアログへの影響を確認し、コミット阻害事項なし。製品修正・版更新・再発行は行わない。
- 最終実装の819入力、実装時の完全ログと一時検証スクリプト、発行先の本体所有694ファイル・ZIP/feedをSHA256で照合し一致。型検査/build/書式、関連38件、前段GUI11群と最終GUI4群/24状態、最終smokeを再利用した。前段から変わった高さと追加表示の配置は最終GUIで確認済みで、登録・補助フッター・既定アイコン等の未変更経路は前段の成功結果を適用した。
- 標準147ファイルは先行コミットの成功判定・完全ログhashと試験ソースの一致を照合した。main/shared・依存・ビルド入力は不変で、変更したrendererに直接依存するNodeソース検査はない。先行標準1262件の成功範囲を再利用し、コミット依頼だけを理由とする同一試験の再実行は行わない。
- 証跡は`.artifacts/commit-validation-image-picker-09934-20261029/`の`reuse.json`、stage/commit照合。今回の8ファイルだけをstageし、作業ファイル・stage tree・commit treeを一致させる。新規試験profileや整理対象なし、再利用/失敗診断資料を保持。ローカルコミットまでとし、push・Release・実利用deployは行わない。

## 2026-10-29: 画像選択の絞り込み時にダイアログサイズを保持 0.99.34

- main=`e62b540`上の前段0.99.33の未コミット変更を保持して追加修正した。dirtyのためpull/stash/resetは行わない。画像一覧に従来の最大表示高`min(46vh, 520px)`を常に確保し、グループ/検索が少数・0件でも「すべて」の多数表示時と同じ外枠とフッター位置を保つ。「さらに表示」をImageGallery adapterのスクロール領域内へ移し、出現・消失で外枠を伸縮させない。
- 発行前レビューは指摘なし。高さ計算・DOM計測キャッシュ・保存設定を追加せず、CSSの画面高への追従を維持する。画像選択・登録・確定・取消、64件ずつの追加表示と検索時の再設定、observerへ渡すスクロール要素は不変。公開API・設定・保存ファイルの追加削除なし。発行済み版への通常追加修正として0.99.33から0.99.34へ更新した。
- 固定依存照合、型検査、書式、publish内buildと発行が成功。前段のNode回帰38件は完全ログのhash、試験・main/shared・依存入力の一致を照合して再利用した。入力差分はrenderer3ファイルとpackageの版だけ。前段GUI全体と全標準回帰は繰り返さず、今回の表示領域と選択経路を対象に確認した。
- 固定0.99.34の隔離GUI4群が成功。90件のライブラリーで初期64件→グループ1件/0件、検索1件/0件/10件/解除、追加表示90件、追加後の絞り込みを実施。明1360×950、暗600×850、明900×650で、ダイアログの位置・寸法、フッターの位置・寸法、一覧枠の寸法が変わらないことを24状態で確認した。狭幅はテストWindowの最小幅だけを一時変更した。取消の値保持/フォーカス復帰と、絞り込んだ画像の確定・保存も成功。代表画面を目視確認した。
- 最初の一時確認は「さらに表示」への自動スクロールで一覧の画面上のY座標が変わったことを失敗とした。外枠・フッターと一覧寸法は不変だったため、一覧だけはスクロールに伴う座標変化を許容し、外枠・フッターの位置と全対象の寸法比較を維持して再確認した。製品修正なし。失敗ログ/profileも保持する。
- 最終固定EXEのsmoke成功。検証前後の819入力hashは一致、本体所有694ファイルは配布元と一致。feed/manifestは0.99.34、EXE SHA256=`4ed991e936099cf57f4fdd8ba7c3286c889c33da34244f10f08cf9d5c07aca74`、ZIPは270705253 bytes / `d6d5b0bf443a080164cead3f46a2b49f84435ef95861de8b4c64a6417147d593`。
- 証跡: `.artifacts/image-picker-height-20261029/`の完全ログ、前後入力hash、再利用判定、`validation.json`、`geometry.json`、PNG、一時検証スクリプト。今回のプロセス終了を確認、成功/失敗と再利用証跡を保持、削除0件。実利用確認待ち。コミット・push・Release・実利用deploy・兄弟Applet再発行・全体ZIP作成は未実施。

## 2026-10-29: 共通画像選択ダイアログの配置調整 0.99.33

- cleanなmain=`e62b540`で開始し、追跡先への`pull --ff-only`は通常ユーザー環境で最新を確認した。制限環境の初回DNS失敗は解消済み。画像選択の登録ボタンを共通SettingsDialogの補助操作としてフッター左へ移動し、選択中ファイル名とサイズスライダーを同じ行に配置した。グループ/検索は内容幅のラベルと入力欄を隣接させ、検索エリア全幅に罫線を置いた。サムネイル周囲をダイアログ背景に揃え、カードが継承していた大きな影をこの選択画面だけで無効化した。
- 追加改善として、長いファイル名の省略/全文tooltip、狭幅のフィルター縦配置、登録中の共通ボタン表示を追加した。登録・選択・確定・取消、原画像保持、サイズ保存、入力元へのフォーカス復帰は既存経路を維持する。設定/保存ファイル/公開APIの追加削除や互換性喪失はなく、通常修正として0.99.32からパッチを進めた。
- 発行前レビューは指摘なし。共通フッターの既存リセット、ready/pending中の操作抑止、画像選択以外へのCSS影響、保存経路と必要回帰を確認した。固定依存照合、型検査、書式、publish内のbuildと発行が成功。既存`registered-images.test.cjs`と`image-gallery.test.cjs`の38件はfail/skip/cancelled 0。未変更の全標準回帰、兄弟Appletの再発行は対象外。
- 固定0.99.33で既存リボン画像GUIと今回の一時的な表示確認を合わせた11群が成功。登録中の無効化・取消、検索/グループ絞り込み、サイズ保存、元画像hash、長いファイル名、明暗テーマ、入れ子取消/フォーカス、リボンの画像/既定アイコン、フッターの既定値復元、実再起動後の保持を確認した。追加の狭幅確認はテストWindowの最小幅を一時的に下げてダイアログ幅512 CSS pxで実施し、フィルターの縦配置と各操作への到達を確認。代表3画面を目視確認した。ファイル選択結果は隔離プロセスの模擬応答であり、実利用環境のネイティブファイル選択操作は未確認。
- 最初の一時表示確認は1px罫線の完全一致で失敗した。実表示倍率でcomputed styleが0.666667pxとなるため、表示確認を非0の可視罫線へ修正して成功した。製品修正・検査無効化ではない。意匠の恒久的な回帰テストは追加していない。失敗ログ/profileも保持した。
- 最終発行物の隔離smoke成功、EXEのSHA256は`d2d7b81628cf858451ea2f42eeedd5f58922fa08bbaac12b36b6afae2ae64bd3`。本体所有694ファイルは配布元と一致。feed/manifestは0.99.33、ZIPは270705611 bytes / `7f1d30275ba0efff1272a6a42a6da1cce03fbf51de28333202a30c09c34c2a0f`。検証前後の819入力hashは一致した。
- 証跡は`.artifacts/image-picker-layout-20261029/`の完全ログ、入力hash、`validation.json`、表示観測JSON、PNG、一時確認スクリプト。狭幅追加は既存GUI全体を繰り返さず対象だけ実行した。今回のプロセス終了を確認し、成功/失敗の証跡・再利用資料・固定出力を保持、削除0件。実利用確認待ち。コミット・push・Release・実利用deploy・全体ZIP作成は行っていない。

## 2026-10-29: 更新確認・タイトルバー進捗のコミット照合とフォーカス修正 0.99.32

- 利用者が0.99.30/0.99.31の動作を確認した後、main=`8f51b41`上の今回の16ファイルをレビューした。更新確認の前倒し、タイトルバー進捗とその仕様・試験・検証記録を対象とし、他作業の変更はない。未コミット状態を保持し、pull/stash/resetは行わない。
- 更新中のバーへのキーボード入口が`visibility:hidden`の通常ボタンを拾い、先頭から入るとキャンセルへフォーカスしない問題を固定0.99.31で再現した。Default Shellの移動対象を表示中かつ有効なボタンだけに限定し、進捗GUIへ同じ操作の回帰を追加。最終0.99.32で明暗ともに成功した。通常操作・設定・保存形式・公開APIは変えず、発行済み0.99.31への通常修正としてパッチを進めた。
- 発行前レビューと修正後の差分確認を実施し、追加の製品指摘なし。型検査/buildと、未実行だった配色・Appletパッケージ・更新設定サービスの3ファイル89件が成功。実装時の81件と前段の最終62件は完全ログのSHA256・対象ソース/試験・依存/ツール・同一Updaterを照合して再利用した。後続の製品差分はShellの可視ボタン判定と版のみで、Nodeの更新サービス・スキーマ・nativeには変更がない。
- 標準回帰は`.artifacts/custom-command-cache-20261029/`の1261件成功と先行コミットの再利用判定を照合。標準147ファイル中145ファイルの試験ソースが一致し、変更した2ファイルは実装時の81件に含む。今回の更新サービス・Shell境界と、そのほかの依存先は前段62件および追加89件で確認した。未変更の試験をコミット依頼だけを理由に繰り返さず、対象差分と再利用根拠を`standard-reuse.json`へ記録した。
- `publish.bat`成功後の固定0.99.32で、進捗GUI13群・通常バー操作限定GUI4群・更新通知限定GUI3群とsmokeが成功。表示・取消・フォーカス復帰・本文矩形維持・Shell交換に加え、パレット、Tab境界、最小化/最大化/復元、実Windowsマウスのドラッグ、閉じるも確認した。更新・再起動の実処理は、同一の更新サービス/Updaterによる前段14群の成功と0.99.30/0.99.31に対する利用者確認を照合し、バーのフォーカスだけを追加修正した0.99.32では再起動全体試験を再実行しない。
- バー全体試験の画面外判定はfixtureの`windowsHide:true`をfalseへ揃えると解消した。既存のパレットView破棄待ちも、保持を許す現在の公開visible状態の待機へ修正。全体試験はその後の合成dialogによる全バー被覆待ちで停止したため成功扱いせず、通常操作は同じ検査を使う`--controls-only`で独立して完走させた。modal被覆・故障/復旧を含むバー全体と、キーボード起点の情報通知全体は未完了の補助試験として記録を保持し、今回の更新表示の必要回帰とは分ける。
- 本体所有694ファイルと配布元のSHA256が一致。manifest/feedは0.99.32、ZIPは270705492 bytes / `662753efda53b1bd08e9dadaf44119736449d3840ef5e1cb34abaa3127253fbd`、EXEは`5204b47b123dbe67d6fb9fe7cd2e026dcfe6f0d805be488136eef6b574c05fc8`。未変更Appletの再発行・全体ZIP・Release・実利用deployなし。
- 証跡は`.artifacts/commit-validation-updates-09932-20261029/`の入力前後hash、再利用判定、完全ログと終了コード、配布物照合、stage/commit照合。再現前の失敗は同09931フォルダーと実装時フォルダーに保持する。成功・失敗profileと再利用資料、固定出力を保護し削除0件。今回の依頼はローカルコミットまででpushしない。

## 2026-10-29: 更新進捗をタイトルバーへ移動 0.99.31

- 利用者確認済みの未コミット0.99.30を保持して追加変更。dirtyなmain=`8f51b41`のため自動pull/stash/resetは行わない。Default Shellの更新進捗・取得量・キャンセルをステータスバーからタイトルバーへ移し、処理中は検索・通知・最小化・最大化・閉じるボタンを覆う。終了後に通常表示へ戻し、タイトルバーの高さと本文領域を維持する。ステータスバーは通常の稼働数・版・更新操作を表示し続ける。
- WindowBarsは取得・検証中の取消操作をtitlebarにも投影し、実行時点のbusy/cancellableを再照合する。追加Shellの既存操作を保つため、statusbarの取消IDも継続する。進捗領域をno-dragにし、ドラッグ領域がキャンセルを妨げないようにした。更新処理・前段の確認順序・通知・保存契約は変更しない。
- 発行前レビューは指摘なし。確認対象は一重の進捗表示、取消可否、通常ボタンの一時非表示と復帰、本文領域不変、Shell提供元交換、従来APIの互換性。設定項目・保存ファイル・スキーマの追加削除や互換性喪失はなく、通常修正として発行済み0.99.30から0.99.31へ更新した。
- frozen install、型検査、build、関連7ファイル81件のNode回帰（fail/skip/cancelled 0）、書式検査が成功。`publish.bat`も成功。最終UpdaterのSHA256は前段0.99.30の検証済み配布物と一致し、今回の回帰入力にも適用できる。未変更Appletの再発行・全体ZIP作成・全標準回帰・再度の更新/再起動全体試験は対象外。
- 固定EXEの進捗GUI12群、更新通知限定GUI3群、smokeが成功。明暗でのタイトルバー進捗・実HTTP取得・取消・元ファイル保持・提供元交換後の継続、閉じるボタンの非表示と復帰、ステータスバーの稼働表示維持、バーと本文の矩形不変を確認。更新確認のみの現行版は無通知、更新実行で対象なしは情報通知、新版ありは更新通知、失敗は安全なエラー通知、遅い確認の取消は情報通知となり進捗が消えることも確認した。代表スクリーンショットを目視確認した。
- 情報通知GUIの全体試験は変更対象外のキーボード待ちで停止。既存の更新検査を共通関数へ抽出し、`--updates-only`で対象だけを選べるようにした。古い無更新/新版通知の期待値を現行契約へ揃え、通知操作はready/visibleを待つ。通知Viewの操作拒否は、試験用EXEの`windowsHide:true`を既存smokeと同じfalseへ揃えた後に解消し、限定3群が成功した。通常モードにも同じ検査を残すが、全体試験の成功とは扱わない。
- 追加の`scripts/shell-bars-ui-test.cjs`の全体GUIは、最初のステータスバー更新ボタンが画面外と判定される箇所で停止（checks 0）。製品不具合かfixtureの座標問題かは未確定で、成功扱いしない。今回のタイトルバー表示・取消・復帰は上記専用GUIで確認済み。Windowsの物理ドラッグ、全バー操作・全体通知GUIは今回未完了として残す。
- 発行先の本体所有694ファイルを発行元とSHA256照合し、manifest/feedの0.99.31、ZIPのsize/SHA256、隔離コピーとのEXE一致を確認。EXE SHA256は`388e4cdf5a4f9ad8b9ad2f59e80e759232f8f39b9bcb71eda2d3e81b445f01bf`。証跡は`.artifacts/titlebar-update-progress-20261029/`の入力hash・完全ログ・結果・配布物照合。commit/push/Release/実利用deployなし。
- 成功・失敗profileは証跡として保持。関連4種類の過去profileを列挙し、別工程の再利用依存が確定できないため保護して削除0件。テスト用プロセスの終了を確認し、固定ビルド出力と他作業のファイルも保持する。

## 2026-10-29: 更新確認をダウンロード前へ移動 0.99.30

- cleanなmain=`8f51b41`から開始し、`git pull --ff-only`で最新取得済みを確認。`PortableUpdates.install`はmetadataで対象を確認した直後、更新ファイルの取得と一時領域の作成より前にネイティブの「更新して再起動」確認を1回表示する。取消時は取得せず終了し、実行後は取得・検証・helperへの引渡し・再起動を続ける。本体/全体/Applet一括/個別で共通処理を使う。
- 確認中はダイアログ内の取消を使い、実行後は取得・検証中の共通キャンセルを再有効化する。ハッシュ・manifest・最低host版の検査、全候補の検証成功後だけの適用、再入防止、更新なし/取消/失敗の通知と一時領域の整理を維持した。確認本文と更新仕様・操作説明も新しい順序へ揃えた。
- 発行前レビューでは、確認前の取得禁止、取消・再入防止、承認後の破損拒否、候補と互換性、一度だけの確認と再起動、保存データ保護を確認。製品の追加指摘なし。試験説明に残った「最終確認」の記述を修正した。設定項目・保存ファイル・公開APIの追加削除や互換性喪失はなく、通常修正として0.99.29からパッチを更新した。
- frozen install、型検査、buildと関連7ファイル62件のNode回帰が成功（fail/skip/cancelled 0）。版変更直後の依存照合エラーは固定lockfileのinstallで同期し、検査の緩和や依存更新は行わない。publishで再生成した最終Updaterでも同62件を再確認した。
- `publish.bat`成功。発行した0.99.30の固定EXEで進捗GUI10群と更新・再起動GUI14群、smokeが成功。確認を保留している間と取消後のpayload要求ゼロ、承認後のdark/lightでの取得・取消・再試行、statusbar差し替え、本体/全体/Applet一括/個別の実更新・再起動、設定/認証用fixture/有効状態・画面復元を確認した。ネイティブの確認はElectronの呼出し引数と応答を模擬し、実際のWindowsダイアログの描画・物理操作は未確認。
- 更新・再起動GUIの初回は、既存のAbout画面内部セクション数を固定したassertion（期待1/実際2）で停止した。更新操作に不要な内部段数の固定だけを除き、単一のAbout概要、更新操作・表示・保存・適用・復元の検査は維持して再実行成功。再起動接続の一時的なECONNREFUSED診断は成功時ログにも保持する。
- 発行先`A:/40.ARTIFACT/AppDock.at365`の本体所有694ファイルを発行元とSHA256照合し、manifest/feedの0.99.30、ZIPのsize/SHA256を確認。EXEのSHA256は`e60197e4d9ced2b65b3115af5a1d0f02986fa2f03b3e655f8739941cfd90a9ff`。未変更Appletの再発行・全体ZIP作成・全標準回帰・実利用先の更新は行わない。commit/push/Release/deployなし。
- 証跡は`.artifacts/update-confirm-before-download-20261029/`の入力hash・完全ログ・実行結果・発行物照合。今回の成功profileと修正前の失敗profileは証跡として保持する。対象3種類の過去profileを列挙し、テスト用プロセス終了を確認。過去profileは別工程での再利用依存を確定できないため保護し、削除0件。固定ビルド出力と他作業のファイルは保持した。

## 2026-10-29: 設定JSON表記・Aboutアイコン・Applet管理の配置 0.99.29 とコミット照合

- main=`03fb2d5`で、確認済みの未コミット0.99.27/0.99.28を保持して追加調整。全設定ページのJSONタブを共通の「JSON」に統一し、ページ別のラベル上書きを撤去した。「AppDockについて」の索引は既存の`brand-mark small`を共用し、背景なし・共通アクセント色の3本バーへ変更。「Applet管理」をAPPLETグループの先頭へ移した。本体側のページ分類、ID、公開コマンド、検索・保存先は保持する。
- 発行前レビューは指摘なし。表示のみの追加変更で設定項目・保存ファイル・公開APIの変更はなく、発行済み0.99.28からパッチを1つ進めた。前段のカスタムコマンド検索・固定パネルの隙間修正・各トリガー検索・フォーカス・解除位置・件数統一も今回のコミット対象とした。
- frozen install、型検査、build、関連5ファイル41件のNode回帰が成功。コミット用の標準回帰は`.artifacts/custom-command-cache-20261029/`の1261件成功をログSHA256・812入力と照合し、UI・版番号・追加翻訳キー・既検証のページ順以外の本体処理、スキーマ、全テスト、依存/ツールが不変のため再利用。今回の41件は設定編集・スタック・トリガー・翻訳・ページ公開を現入力で検証した。
- `publish.bat`成功後、固定EXEでスクロール/設定索引13群、ジェスチャー設定9群、6トリガー一覧フィルター7群、カスタムコマンド/並べ替え/共通focus11群の計40群とsmokeが成功。JSON切替・保存、明暗テーマの透明アクセントアイコン、APPLET先頭配置、狭幅・短いウィンドウ・固定パネルの上端被覆も確認した。初回の明暗撮影はOS側mediaだけを切り替えていたため、保存済みの本体テーマで切り替えるfixtureへ修正し、同じ最終EXEで対象13群を再実行した。製品の追加修正・再発行は不要だった。
- 発行先/ビルド出力/更新ZIPの管理対象694ファイルと、各固定GUI・smokeの隔離コピー6組が全て一致。EXE SHA256=`8CB4D1697C2A1C1F3ACC276A701FD9AA04C3EA0D919BBCEA4A670F0848E7CC54`、ZIP SHA256=`81D953069004F22DFD29A826E9794FA9920FDE41681DCA53F25C349190FF82A7`、270704933 bytes。manifest/feedは0.99.29で整合する。
- 実行環境はNode24.22.1/pnpm12.10.1/Electron45.0.0、Windows x64。証跡は`.artifacts/settings-index-polish-20261029/`のreview・入力前後SHA256・完全ログ・runtime・packaging・copies・cleanup、および`.artifacts/commit-validation-settings-filters-09929-20261029/`の再利用判定・stage/commit記録。検証中の製品入力は不変、後続の変更は対象GUIで再検証した試験fixtureのみ。終了確認済み、削除0で再利用資料と診断を保護した。
- 今回はmainへのコミットまで。push・Release・実利用先deployは行わず、物理ジェスチャー/キー操作・実利用設定での効果は未確認。

## 2026-10-29: フィルターのフォーカス・解除位置・トリガー検索・件数統一 0.99.28

- main=`03fb2d5`の未コミット0.99.27を保持し、その続きとして実装。既存変更があるためpull/stash/自動コミットは行わず、mainを維持した。公開設定・保存ファイル・実行計画の追加変更はなく、発行済み0.99.27からパッチ更新した。
- フィルター検索の外枠へ通常のテキスト入力と同じ共通focus-visible outlineを適用し、内側入力との二重枠を避けた。解除ボタンを検索欄の列から`SettingsListTable.toolbarActions`へ移動。共通`CommandListSummary`は解除と件数を末尾グループへまとめ、解除を件数の左で右寄せする。
- キー・マウス・タッチパッドの`TriggerStackSettings`へ、入力操作/コマンド名/説明/ID/提供元IDの検索と、保存済みの実行方法（継承/最初の1つ/すべて）の絞り込みを追加。コマンドトリガーの種類別タブと各機能設定ページの6一覧で共用する。検索と解除は画面内の一時状態で、設定や実行条件へ保存しない。編集・削除は絞り込み後の表示行に対応する元のスタックを対象にする。
- コマンドトリガーのコマンド一覧、カスタムコマンド、Applet管理、トリガー一覧は共通`SettingsListCount`で`表示件数 / 全件数 件`へ統一。0件・未絞り込みでも同じ形式を使う。その他の一覧は既存の件数表示を保持する。
- 発行前レビューで各入口、フィルターのAND条件と実行方法、表示行/元入力の対応、保存/取消、件数の分母、フォーカス、解除の位置、狭幅、既存のsticky/JSON/低高度を確認し、未解決の発行阻害事項なし。型検査、本体/Default Shell build、関連4ファイルのNode回帰**39/39**成功。初回の新規gesture fixtureは条件のprocesses配列が不足して起動しなかったため、fixtureを修正し起動前のparseSettings検証を追加した。初回失敗を成功へ合算せず、ログと診断profileを保持する。
- 最終固定配布物でトリガーフィルター/共通件数**7群**、カスタムの共通順序/フィルター/フォーカス**11群**、スクロール/低高度**13群**、計**31群**とsmokeが成功。6一覧の検索/実行方法/一致なし/解除、0件と全件の件数、絞り込み中の編集取消、F9入力だけの実行方法変更とF8入力・割り当て配列の保持/復元、入力/条件の保存値不変、共通フォーカスoutlineとの一致、狭幅での解除/件数の同じ行の配置、既存の部分並べ替えと競合拒否/再起動を確認した。検索枠・トリガーフィルター・狭いダーク画面の代表画像を目視確認した。
- `publish.bat`終了0。`A:\40.ARTIFACT\AppDock.at365`のmanifest/feed/Default Shellは**0.99.28**で一致。stage・発行フォルダー・更新ZIPの所有**694ファイル**、4つの最終隔離コピーも各694ファイルのSHA256が一致。EXE SHA256: `3322b3b949c64d22904383e5218e41a60e3ff79ef7ddb41ea98b222f41f45221`。ZIPは270705003 bytes、SHA256: `ca8c97aca9feecb20192020204bef6aabbdb5b7aa0dd4317580babf6e601c754`。
- 証跡は`.artifacts/settings-filter-consistency-20261029/`のresult.json・review.json・入力/ログSHA256・packaging.json・copies.json・完全ログ。発行前後の全入力不変、試験プロセス終了を確認。削除0で、最終成功・前段のコミット/再利用資料・初回fixture診断を保護した。標準全回帰・物理入力・実利用設定での効果は未確認。前回からの追加変更を含め未コミットで、push・Release・実利用先deployは行っていない。

## 2026-10-29: カスタムコマンドのフィルター・固定パネルの隙間・About索引アイコン 0.99.27

- 前段の確認済みUI 0.99.25をmain=`03fb2d5`へコミットし、stage treeとcommit treeの一致、25ファイルだけの収録、作業ツリーcleanを確認した。次の実装前に`pull --ff-only`で追跡先を確認し、同じmainで追加対応を開始した。プッシュは行っていない。
- カスタムコマンド一覧へ共通`SettingsListFilters`を追加。名前・説明・種類名/ID・提供元名/ID・コマンドID・利用不可理由の検索と、種類・有効/無効/利用不可・MCP公開の絞り込みを組み合わせられる。検索は空白区切りのAND条件とし、configや秘密値を含めない。保存や実行を伴わず、一致なし・解除・表示件数/全件数を共通テーブルへ接続した。
- 編集・有効切り替え・削除は表示項目の安定IDに接続する。順序ダイアログには表示中のIDだけを渡し、隠れた項目の位置を保った全体ID列を開始時revision付きで保存する。既存の外部変更との競合拒否・保存失敗時の保持を維持した。設定項目・保存ファイル・実行計画・公開APIの追加変更はない。
- 設定ツールバーとコマンド/トリガー一覧のフィルターに、内側余白由来の上端の隙間を再現。固定位置でその余白を相殺し、背景を左右端まで広げて表の文字が見えないようにした。0.99.26の固定GUI22群とsmoke成功後、既存の低高度レイアウトで操作ボタンが上へ欠けることを追加プローブで確認。外側へスクロール枠が移る場合もその枠に合わせて補正し、追加修正後の発行として0.99.27へパッチ更新した。Aboutの索引は既存assets/icon.svgを18pxで共用し、装飾画像として項目名・操作領域を維持する。
- 発行前レビューで共通テーブルの既定動作、検索範囲、複合条件、未知の種類/停止提供元、解除、安定ID、非表示項目、revision、共通スクロール・横固定・JSON・低高度・アイコンの読み込みを確認。未解決の発行阻害事項なし。型検査・本体/Default Shell buildと関連5ファイルのNode回帰**64/64**が成功。最終CSSと版だけの追加変更はTypeScript・保存・実行処理へ影響しないため、型検査とNode回帰を再利用した。
- 最終固定配布物でスクロール**13群**、共通順序/フィルター**10群**、計**23群**とsmokeが成功。通常の明暗/幅、左右のホイール、上端の左右/中央の被覆、両一覧と設定ツールバー、低いウィンドウでの操作到達、JSONの単一スクロールとエラー回復、検索の大文字/ID/提供元・未知の種類・状態/公開の複合条件・一致なし/解除・検索時の保存値不変・絞り込み中の順序/編集/切り替え・外部変更の拒否・再起動を確認した。狭いダーク画面でも実際に編集を開閉し、検索条件を保持した。Aboutの索引画像をdecodeし、About/低高度/両一覧/フィルターの代表画像を目視確認した。
- 最終`publish.bat`終了0。発行先`A:\40.ARTIFACT\AppDock.at365`のmanifest/feed/Default Shellは**0.99.27**で一致し、stage・発行フォルダー・更新ZIPの所有**694ファイル**、3つの最終隔離コピーも各694ファイルのSHA256が一致。EXE SHA256: `e9b7fd96c0d6c7ca5c2c385fa4b91f441742cfccb0661084a4a92f5c2846085a`。ZIPは270704759 bytes、SHA256: `b8934ec958c090ae038147ceeca111f6fe95d4b854e4566470012c23e9da9326`。
- 証跡は`.artifacts/custom-command-filters-20261029/`のresult.json・review-final.json・入力/ログSHA256・packaging.json・copies.json・各完全ログ。発行後は狭幅GUIのクリック検査だけを強化し、製品入力は不変。試験プロセス終了を確認、削除0。直近の成功、コミット済み0.99.25の再利用資料、修正前/中間版の診断資料を保持した。標準全回帰・物理入力・実利用設定での効果は未確認。追加フィルター/隙間/アイコンの変更は未コミットで、push・Release・実利用先deployは行っていない。

## 2026-10-29: 設定画面UI 0.99.25のコミット照合

- 実利用で確認済みの0.99.25について、実装時の全入力・完全ログ10件、発行フォルダー694ファイルと更新ZIPのSHA256を再照合した。製品修正・版更新・再発行は行わず、型検査/build・関連87件・固定GUI32群・smokeを再利用した。
- mainサービス・保存スキーマ・単体試験は不変。日本語リソースはキー追加のみで既存値を保ち、ページ順の変更は設定ナビゲーション/ページ/ページホストの3ファイル16件を追加実行して成功した。0.99.24の完全ログと入力差分を照合し、影響のない標準回帰を再利用する。実装時と追加実行の計103件を含め、標準147ファイル1,261件の成功範囲を満たす。
- 証跡は`.artifacts/commit-validation-settings-ui-09925-20261029/`のreuse.json・catalog-regression.log・stage/commit記録。今回の25ファイルだけをコミット対象とし、stage tree・作業ファイル・commit treeを照合する。フィルター追加と一覧の上端の隙間修正は次の実装へ分離する。push・Release・実利用先deployなし。

## 2026-10-29: 設定画面の余白・並べ替え・ジェスチャータブ調整 0.99.25

- cleanなmain=`ee8ef19`で追跡先へ`pull --ff-only`し、最新を確認して着手。制限環境のDNS失敗は通常ユーザー環境の同一コマンドで解消した。設定本文の外側余白を4pxへ減らし、スクロール枠内へ20pxの余白を移した。左右端でのホイール操作とフォーカス枠の描画、既存の縦・横sticky、JSONだけの内部スクロールを維持する。
- 設定インデックスの選択・hoverをリボンと同じ共通アクセント配色へ接続し、Applet管理をAppDockについての直後へ移動。カスタムコマンドの名前列ヘッダーから共通SettingsOrderDialogを開き、既存のrevision付きreorder操作で表示順だけを保存する。
- リボンとトレイは項目名・ハンドルからドラッグでき、各行の上下ボタンを廃止。ハンドルの修飾キー・IMEを除く↑↓操作を保ち、リボンは保存後の同じハンドルへのフォーカス復帰を追加した。操作列も残るボタン数へ縮めた。トレイの「表示イメージ」見出しを削除。キー・マウス・タッチパッドの各ページは「フォーム」「トリガー一覧」「JSONの構成」で切り替え、既存の設定と共通トリガースタックを編集する。Aboutの更新チェックは共通アイコンボタンの内部を中央揃えにした。
- 発行前レビューで要件、保存・取消・競合、既存の配置・グループ、検索からの移動、共通配色・入力・フォーカス、JSONとの往復を確認。内側余白追加後の横stickyのずれを補正し、削除した上下ボタンの空き列も詰めた。設定項目・保存ファイル・公開API・実行計画は変更せず、通常UI修正として0.99.24からパッチ更新。未解決の発行阻害事項なし。
- 型検査、本体/Default Shell build、関連8ファイルのNode回帰**87/87**が成功。ソースGUIはスクロール10群、ジェスチャー9群、共通順序7群、リボン順序1群、トレイ5群が成功。トレイの従来形式fixtureに現行既定のtrayMenuが残る問題と、async predicateを直接waitForFunctionへ渡す起動待機を試験側で修正。リボンのドラッグ試験は配置変更と同じ配置内の順序を区別して修正した。初回失敗は成功結果へ合算せず、診断ログを保持する。
- 最終固定配布物で、スクロール**11**・ジェスチャー**9**・共通順序**7**・リボン順序**1**・トレイ**4**の計**32群**とsmokeが成功。左右の内側余白でのホイール、明暗/1280・900・760幅、左側追加ボタンのキーボードフォーカス、300件の一覧、JSONの単一スクロール、3方式のタブ切り替えで保存値不変、順序の取消/保存/再起動、カスタムコマンド順序編集中の外部変更拒否、項目名ドラッグとハンドルのキー操作を確認した。Aboutの文字と更新アイコン、フォーカス枠、代表レイアウトは固定EXE画像を目視確認した。配布版トレイ試験ではnative callbackの注入を行わず、その範囲はソースGUIの成功と区別する。
- `publish.bat`終了0。`A:\40.ARTIFACT\AppDock.at365`のmanifest/feed/Default Shellは**0.99.25**で一致。stage・発行フォルダー・更新ZIPの所有**694ファイル**すべてのSHA256が一致し、6つの最終隔離コピーも各694ファイルが発行物と一致した。EXE SHA256: `4f03d8f8a9978f233a91eac87ecdef39292d587c4ce6a3d29abbd54d0c760018`。ZIPは270703111 bytes、SHA256: `d0fc8b74ee4b9f7e0d805a3864f9441ceb70059fdb95b296365a842bcdcc14eb`。
- 証跡は`.artifacts/settings-ui-20261029/`の完全ログ・review.json・packaging.json・copies.json・入力SHA256・cleanup.json。製品入力は発行前から不変で、発行後はスクロール試験のAboutコマンド選択と検査内容だけを修正して最終固定試験を実行した。標準全回帰と物理入力・実利用設定での動作は未実施。commit・push・Release・実利用先deployなし。今回の成功profileは各スクリプト/実行方式で直近3回以内のため削除0、失敗診断と他作業の再利用資料を保持した。

## 2026-10-29: カスタムコマンド一覧再利用0.99.24のコミット・プッシュ照合

- 実利用での回数改善確認後、確定定義/Schemaの再利用、型・提供元世代・MCP設定/ツール/期限の更新条件、共有値の変更防止、単件索引、実行時の権限/条件/取消と既存リボンの再利用を再レビューし、未解決のコミット阻害事項なし。今回の製品修正・版更新・再発行はない。
- 実装時の812入力と完全ログ11件のSHA256が一致。発行先の所有694ファイルと更新ZIP、manifest/feedの0.99.24も実装時の記録と一致した。型検査/build・標準147ファイル1,261件・固定GUI23群・smoke・性能計測を再利用し、同一入力の再試験は行わない。初回GUIの旧ラベルによる失敗と修正後の成功を区別した記録も保持する。
- 証跡は`.artifacts/commit-validation-custom-command-cache-09924-20261029/`の`reuse.json`、stage/commit/push記録。今回の13ファイルと同じ作業の先行調査メモだけをコミットし、stageと作業ファイル・commit treeを照合する。`git fetch origin main`で履歴を確認済みで、先行する未プッシュのWebアカウント修正`7522478`を祖先としてGitHubのorigin/mainへ通常pushする。Release/実利用先deployは対象外。新しい試験profileや整理対象はなく、再利用資料を保持する。

## 2026-10-29: カスタムコマンド一覧と確定定義の検証結果の再利用 0.99.24

- main=`7522478`から着手。前回の起動調査メモだけが未コミットだったため自動pull/stashをせず、その記録を保持した。表示用一覧を確定設定・使用する種類の宣言・提供元の稼働世代/登録/利用可能状態で共有し、入力監視・トレイ・リボンで全定義の再検査を繰り返さないようにした。起動計測の一覧生成回数は参照回数ではなく実際の生成回数を集計する。
- 確定したカスタム定義/configと解析済みスタックを変更不可にし、定義と種類の版に対応するSchema検証結果をWeakMapで再利用する。1件の存在/利用可否は設定のID索引を使う。ショートカット同期は同じcatalogからIDと実行計画用の入力を作り、名前付きスタックの実行時の差し替えはその呼出しの複製へ適用する。
- MCPの表示更新にはローカル接続設定ファイルの識別情報・サイズ・更新時刻、接続/ツール変更の世代と30秒の一覧有効期限を含める。ジョブの進捗だけでは無効化しない。動的な利用不可理由に変更トークンがない提供元は一覧をキャッシュしない。公開一覧・実行直前の提供元/世代/動的理由/呼出し元権限、保存、取消・循環検査、入力40ms周期と押下時の条件/順序は維持した。設定/保存ファイル/APIの追加削除はなく、0.99.23からパッチを更新した。
- 発行前レビューで上記の寿命・変更条件、未導入/停止/再起動/種類変更、共有値の変更防止、保存ID/順序/形式への影響と必要な検証を確認し、未解決の発行阻害事項なし。型検査・本体/Default Shell build成功。関連134件に加え、確定設定の変更防止が共通設定処理へ及ぶため標準回帰全体を並列数4で実行し、147ファイル**1,261/1,261、fail/skip/cancel 0**。1,000件×繰り返し参照、単件照会、設定変更/停止/種類Schema変更、動的な理由/許可、MCP期限切れと設定ファイル外部編集を検証した。
- 前回の固定調査モジュールと改善後を同じ模擬定義/固定依存で比較した。一覧158回・3試行の中央値は、100件105.67ms→1.66ms、1,000件1,017.28ms→1.65ms、5,000件5,182.39ms→1.63ms。初回生成後の158参照では一覧/状態の再生成0回。7件の約1秒の入力監視は前23回生成/161回状態検査、後23回参照/生成0/状態0。これは温めた一覧参照処理だけのNode計測で、実環境の起動全体の時間と混同しない。
- 最終固定EXEの隔離GUIで7件と1,000件を起動し、一覧生成はともに**1回**、状態検査は**28回/4,000回**を確認。無変更の約1秒に23〜24回参照しても一覧生成/状態検査は0回。外部設定による名前変更・無効化・再有効化の反映と、共有一覧を変更せず安全なno-opスタックを2回実行する確認を含む専用GUI8群成功。申告された実利用設定をコピー/変更した測定ではなく、実稼働版での回数の保証はしない。
- 固定EXEの既存カスタム編集GUI8群、リボンGUI7群とsmokeも成功。リボンは各開閉が投影1回・catalogBuilds 0回で、既存の再利用を保持した。編集GUI初回は旧ラベル「待ち時間」を参照して失敗したため、現行「応答の制限時間」へ試験だけを修正し再実行した。初回失敗ログを保持し、製品の後続変更や再発行はない。
- `publish.bat`終了0、`A:/40.ARTIFACT/AppDock.at365`へ**0.99.24**を発行。本体manifest/feed/Default Shellの版、stage/発行フォルダー/更新ZIPの所有**694ファイル**のSHA256が一致。EXE SHA256=`cd626369414625909c2368e17dbd40e2a0524bd5fbcacb4d440fe674bab4cc40`、ZIP SHA256=`5563a194506e3750014f1f5473985cd4ee2b2ee682f2df4ffdf791f4ed7d6978`（270702292 bytes）。各固定GUIは同じEXEのコピーを使用し、終了を確認した。
- 証跡入口は`.artifacts/custom-command-cache-20261029/validation.json`。review、入力/完全ログhash、全計測値、発行物照合と固定GUI/終了/整理記録を保持する。今回の成功資料は方式ごとの直近3回以内、初回失敗は解決後の診断として保持。既存の参照/再利用状況が不明な過去証跡は削除せず、削除0件。物理キー/タッチ、実MCPアカウント/実アプリでの効果、無関係な全Appletの動作は未検証。commit/push/Release/実利用先deployは行っていない。

## 2026-10-28: 起動時のカスタムコマンド一覧・状態検査回数の調査（未修正）

- 申告値はカスタム定義7件で一覧生成158回・状態検査1,218回。現ソースの`CustomCommandService.uiCommands()`は毎回`summaries()`から全定義の`state()`を呼ぶため、158×7=1,106回は一覧生成だけで説明できる。残る112回には公開一覧・設定用summary等の別入口があり得るが、実稼働プロセスでの呼出元別内訳は採取していない。`reconcile()`内の直接のSchema検証等は`commandState`の計測外なので、この表示はすべての検証の総数ではない。
- 継続的な発生源は`InputCaptureManager.start()`の40ms周期の`refresh()`。`sync()`が変更判定前に`state()`を読み、indexのreadState callbackが`availableShortcutCommands()`を経由してカスタム全件の一覧を生成する。fingerprintが同じでnativeへの送信を省略する場合も、この生成・検査は完了済み。起動計測の`finish()`後も監視処理は続くが、表示のカウンターは増えない。現行リボンキャッシュはこの入力経路・トレイの一覧を共有しない。
- 起動イベントでも重複する。`syncHotKeys()`は利用可能IDと実行計画用catalogのためにカスタム一覧を2回生成する。managerのchangedに直結するトレイ1回を含めると最低3回。入力backendの反映が発生する場合は`syncShortcuts()`からのrefreshも加わる。名前付きスタックの利用可否照会にも、1件のために全件一覧を作る入口がある。
- 現ソースを通常のoutを置き換えない専用outDirへコンパイルし、模擬設定だけで計測した。7件を固定した入力監視で、1,041msに一覧23回・状態161回を確認。OSへのキー送信/登録なし、native接続なし、マウス/タッチパッドジェスチャー無効でも発生した。`syncHotKeys()`のコンパイル済み関数をnative backend stubで実行し、一覧2回・状態14回、トレイ相当と合わせて一覧3回・状態21回を確認した。
- 有効な本体プロセス/キー送信定義を交互に配置し、validatorを温めて一覧生成158回を3試行した中央値は、7件10.28ms/状態1,106回、100件110.30ms/15,800回、1,000件1,034.14ms/158,000回、5,000件5,055.04ms/790,000回。全試行で生成数・状態回数・利用可否を照合した。これは当該一覧処理だけのNode実測で、実利用設定や固定EXEの起動時間・操作性能の保証ではない。定義内容・提供種類・MCP接続等で変化する。全体起動が長いほど周期処理の回数も増え得るため、158回を全環境の固定値としない。
- 改善候補は、同じ設定/提供元世代での表示用一覧と索引の共有、Schema/config等の変化しない検証の再利用、同じ同期処理内でのcatalog共用、1件の利用可否をID索引から現在状態で判定すること。入力の40ms周期や押下時の条件評価を遅くせず、一覧再生成だけを変更時へ寄せる。設定・型・Applet稼働世代・MCP接続/認証/ツールrevisionと有効期限等の変更を反映し、外部公開・許可・実行前検査・保存を表示キャッシュで代替しない。呼出元がstackを変更する経路があるため、共有する表示値と実行用の可変値の所有も分ける。
- 調査のみ。開始時のmain=`646cf02`、既存のWebアカウント関連等の未コミット変更を保持し、pull・stash・製品コード変更・版更新・publish・実利用先操作は行っていない。コンパイル/模擬計測の入口と入力SHA256・3試行の全値は`.artifacts/custom-command-startup-investigation-20261028/probe.cjs`と`result.json`。終了時に調査入力7ファイルのSHA256不変を確認した。固定EXE GUI・実キー/タッチ・実MCPの効果試験は行っていない。独立した調査証跡1件を保持し、既存の検証資料は整理対象にしていない。

## 2026-10-28: Webアカウントの画面内確認0.99.23のコミット検証

- 利用者の実利用での改善確認後、削除/クリアのモーダル、両transportの確認済み対象受け渡し、ID/名前/提供元の再照合、参照禁止・処理排他、既存ネイティブ確認の互換性と失敗後の復旧を再レビューした。未解決のコミット阻害事項なし。製品・版・発行物への追加変更はない。
- 実装時の917入力、268生成物、22完全ログと発行フォルダーの所有694ファイル・更新ZIPをSHA256で再照合した。差分は別作業の調査追記を含むVERIFICATIONだけで、実装時の型検査/build・関連6ファイル35件・固定GUI9群＋従来サービス4群・smokeを再利用した。新しい配布物は生成せず、0.99.23を維持した。
- テストfixtureを固定ツールで生成し、未実施の141ファイル**1,224/1,224**を並列数4で追加実行。再利用した6ファイル35件と合わせ、標準回帰は**147ファイル1,259/1,259、fail/skip/cancel 0**。再実行後も製品/試験/依存入力の不変を照合した。
- 証跡: `.artifacts/commit-validation-web-account-modals-09923-20261028/`の`reuse.json`、各実行結果/完全ログ、入力再照合、stage/commit記録。今回の13ファイルだけを対象に、同じVERIFICATION内のカスタムコマンド起動調査は作業ツリーへ保持してコミット対象から除外する。新しいGUI/起動profileは作らず、既存の失敗診断・再利用資料を保持、整理対象なし。push/Release/実利用先deployは行わない。

## 2026-10-28: Webアカウントの削除・クリア確認を画面内モーダルへ統一 0.99.23

- cleanなmainで追跡先を`pull --ff-only`し、更新なしを確認して実装。制限環境ではDNS失敗したため、同一コマンドを通常ユーザー環境で実行した。Webアカウント設定の枠削除とログイン情報のクリアを共通`SettingsDialog`へ変更し、対象名・警告・確定/取消・失敗表示・フォーカス復帰を揃えた。設定項目・保存ファイルの追加削除、破壊的API変更はなく、本体のみ0.99.22から0.99.23へパッチ更新した。
- 確認済みの枠をローカル設定操作から渡し、ホストは提供元・ID・名前と現在の名簿ファイルを消去前に再照合する。削除時の参照検査、処理中の排他、対象sessionだけの消去、削除待ちの安全な回収を維持。確認済みの枠を渡さない従来のDock/Applet API呼出しにはネイティブ確認を残し、設定画面では二重確認しない。
- 発行前レビューで、要件、両transport、既存API/保存/認証処理、入力停止・エラー後のキュー復旧と必要な試験を確認。GUIで判明したWebアカウント設定の入力停止アクション未接続を修正し、確定・取消を再検証した。未解決の発行阻害事項なし。版変更後の依存照合は固定lockfileのinstallで同期し、依存版・検査方針は維持した。
- 型検査・本体/Default Shell build、関連6ファイルのNode回帰**35/35**（fail/skip/cancel 0）が成功。ソースGUIと最終固定EXEのWebアカウントGUIはそれぞれ**9群**成功。明暗/1280・760幅の画面内モーダル、Escape/取消後の名簿・Cookie保持とフォーカス復帰、確認中の名前変更・参照追加の拒否とダイアログ内エラー、確定時の対象Cookie消去と他枠保護、33枠以上の追加、実プロセス再起動後のID/名前保持を検証し、ネイティブ確認呼出し0回を確認した。固定EXEのモーダル画像も目視確認した。
- 最終固定EXEで従来のネイティブ確認経路を含むサービスGUI**4群**とsmokeも成功。ネイティブ確認の取消/確定・文字列/安全な既定ボタン・対象Cookieのみの消去と削除待ちを確認した。古いGUI期待値（MCP補助ボタン、旧件数上限、テーマのDOM参照）と描画待機を現行仕様へ合わせ、装飾/座標の固定条件は操作・保存・取消・フォーカス確認へ整理。サービスfixtureのログをグループと下側へ重複配置する不整合も試験だけ修正した。各初回失敗ログは保持し、成功扱いしていない。
- `publish.bat`終了0、`A:\40.ARTIFACT\AppDock.at365`へ発行済み。本体manifest/feed/Default Shellは**0.99.23**で一致。stage/発行フォルダー/更新ZIPの所有**694ファイル**のSHA256がすべて一致し、固定GUIのコピーEXEも一致した。EXE SHA256: `345bd6750e57826f385cecd951b8fd7c7b93e335a685c6d8a28a463c3ec19c57`。ZIPは270701411 bytes、SHA256: `163ab9a64fdf35aa4fef0fdb2ead8dc9def23a3436d1a03a6a11a996668cfb72`。
- 証跡入口: `.artifacts/web-account-modals-20261028/validation.json`。917入力、268生成物、完全ログと終了コード、`review.json`、`package-validation.json`、`cleanup.json`を保存。発行後の入力差分はサービスfixtureだけで、製品への後続変更なし。今回の成功は方式ごとの直近3回以内として保持し、他作業/再利用状態が不明な過去証跡と失敗診断も保持、削除0件。今回の隔離profileを参照する残存プロセス0を確認した。実アカウントのログイン・物理入力・無関係な全回帰は未実施。commit/push/Release/実利用先deployは行っていない。

## 2026-10-28: 画像ライブラリー改善0.99.22のコミット検証

- 0.99.20〜0.99.22で実装・発行した画像ライブラリーの選択/ドラッグ/グループ順序/表示調整、共通並べ替え、関連試験・文書を再レビューした。保存ID/既存形式、グループごとの順序、競合拒否、非同期結果の寿命、共通部品の履歴/単一選択/キー操作への影響を確認し、未解決のコミット阻害事項なし。今回の製品変更・版更新・再発行はない。
- `.artifacts/image-library-polish-20261028/validation.json`に対し、検証入力852件・完全ログ11件のSHA256が一致。型検査/build、Node回帰71件、固定EXEの画像ライブラリー12群・共通並べ替え5群・smokeの成功を照合して再利用した。未実行の無関係な全回帰や物理操作を実行済みとは扱わない。
- stage/発行フォルダー/固定GUI2件/smokeの5配置で所有694ファイルが一致し、更新ZIPのSHA256・feed・package版も0.99.22の証跡と一致した。変更した開発文書3件のローカル参照46件と差分の空白検査も成功した。
- `git fetch origin main`でGitHubの先端と開始HEADの一致を確認した。コミット先はmain、push先はorigin/main（GitHubのみ）。対象24ファイル、stage/作業ファイルとcommit treeの照合、remote先端の確認は`.artifacts/commit-validation-image-library-09922-20261028/`の`reuse.json`/`stage.json`/`commit.json`/`push.json`へ記録する。Release/実利用先deployは対象外。新しい試験profileや整理対象はなく、再利用証跡を保持した。

## 2026-10-28: 画像ライブラリーの重なり・メニュー・共通ドラッグ調整 0.99.22

- main上の未コミット0.99.21変更を保持して追加修正。画像一覧の重なりを分離し、チェックボックスと選択枠がstickyパネルより前へ出ないようにした。スクロール要素の上paddingを除き、検索欄上の隙間から背後の画像が見える問題を解消した。
- 所属追加/並べ替えの成功表示は、選択の変更/解除、グループ/検索変更で消す。成功表示の世代を状態とともに更新し、保存応答待ちの間に選択や表示対象を変えた場合も、古い成功メッセージを戻さない。エラー/再試行表示は別に保持する。設定項目・保存ファイル・公開APIの追加削除なし。
- グループの…メニューをトップレイヤーのpopoverへ変更。一覧を押し広げず、画面内に配置し、外側クリック/Escape/フォーカス離脱/スクロール/リサイズ/グループ変更で閉じる。Escapeの呼出元への復帰と、↑↓/Home/End/Tabの操作を維持した。
- 共通SettingsOrderDialogは文字/番号/余白もドラッグ開始範囲とし、移動した項目のハンドルへフォーカスを保持する。保存中の拒否、↑↓キーのIME/修飾キー/端の保護、OK/取消の意味は維持。画像・Applet・AI・MCPで共用する変更として影響先をレビューし、保存/取消/再表示/実再起動で確認した。未解決の発行阻害事項なし。
- 型検査・build・関連6ファイルのNode回帰**71/71**（fail/skip/cancel 0）成功。ソースと発行固定EXEで、画像ライブラリー**12群**、共通並べ替え**5群**が成功。stickyの裏に隠れたチェックボックスがクリックを奪わないこと、上端で画像が露出しないこと、popup外側クリック/Escape/キー操作、文字ドラッグ後の保存/取消とフォーカス、遅延成功表示の抑止を検査。stickyとpopupの画像を目視確認し、固定EXEのsmokeも成功した。
- 初回固定GUIの最後で、試験用BrowserWindowのload完了後にCDPのpage登録を待たず探索する競合が発生。gallery-component-helperをpageイベントと対象URLの待機へ修正し、同じ発行EXEで再検査して成功した。製品修正や再発行は不要。失敗診断を保持し、固定sleep/無条件の成功再試行には置き換えていない。
- `publish.bat`で`A:\40.ARTIFACT\AppDock.at365`へ0.99.22を発行。証跡は`.artifacts/image-library-polish-20261028/validation.json`。ソースGUIは`image-gallery-ui-1793197155965`/`settings-order-ui-1793197229456`、固定GUIは`image-gallery-ui-1793197564830`/`settings-order-ui-1793197591079`、smokeは`smoke-1793197601375`。最終入力852件と、stage/発行/ZIP/固定試験コピー3件の所有694ファイル一致を確認した。EXE SHA256は`5599529137505aab26b561be0362d3bd4300b2b51a1d8779113dce4efcff79b4`。
- 試験プロセスの終了を確認し、同チャットの旧成功ソースGUI`image-gallery-ui-1793188056773`だけを保持手順に従って整理。直近3ソースGUI、固定成果物、失敗診断、他作業の履歴を保持した。物理マウス/タッチパッド、実利用profile、実NAS、混在モニターDPI、無関係な全回帰は未確認。commit/push/Release/実利用先deployは行っていない。

## 2026-10-28: 画像ライブラリーの背景操作とグループ内順序 0.99.21

- main上の未コミット0.99.20変更を保持して追加実装。画像一覧・グループ欄・フィルター欄の背景で選択解除と矩形選択ができ、入力/ボタン/スライダーの操作では解除しない。右側を共通スクロール要素にしてフィルターをstickyで保持し、左側の独立スクロールを維持した。検索は虫眼鏡を含む外枠の内側へフォーカス枠を表示する。
- ドラッグ中は幅180pxの縮小画像と件数、複数枚の重なりをカーソル近傍へ表示する。通常グループでは挿入線へ単数/複数カードをドロップし、既存のimages配列へ表示順を保存する。複数枚の相対順、検索で隠れた画像同士の順、ほかのグループを保持。「すべて」「未分類」はファイル名順の固定表示。操作メニューの共通並べ替えダイアログで↑↓キーによる変更もできる。
- 所属追加/編集は継続する画像を動かさず、新規所属だけ末尾へ追加する。ドラッグ開始時のグループを保存前に照合し、外部変更・古いtoken・仮想グループへの並べ替えを拒否する。保存項目/保存ファイルの追加削除や公開APIの破壊的変更はなくpatch更新。
- 発行前レビューで、パネル背景から始めた矩形選択でもスクロール通過分を保つ座標計算と、多数画像の移動で関数引数数に依存しない挿入処理を補強した。型検査・build・画像/分類/削除/翻訳の関連6ファイル**69/69**（fail/skip/cancel 0）が成功。GUI初回の共通ダイアログ確定ボタン指定を、実際のOKボタンのtestidへ修正した。版変更後の依存照合は固定lockfileのinstallで同期し、依存版・lockfileは不変。
- ソースGUIで**12群**、最終固定EXEでも**12群**とsmokeが成功。背景解除/両パネルからの範囲選択、スクロール・追加読込みで全77枚の選択保持、複数枚移動/既存所属への再追加、キーボード並べ替え、再起動後の保存順表示を確認。スライダー両端、フォーカス枠、明暗/狭幅/拡大、プレビュー/削除/履歴/単一選択の既存契約も確認。明暗とドラッグ画像を目視した。GUIの削除は隔離ごみ箱アダプターを使用する。
- `publish.bat`で`A:\40.ARTIFACT\AppDock.at365`へ0.99.21を発行。証跡入口は`.artifacts/image-library-order-20261028/validation.json`。最終ソースGUIは`image-gallery-ui-1793190085820`、固定GUIは`image-gallery-ui-1793190269888`、smokeは`smoke-1793190295639`。入力852件の不変と、stage/発行/ZIP/固定GUIコピー/smokeコピーの所有694ファイル一致を確認した。EXE SHA256は`8a45368f5faf977f1d586b19724e56d5c1f95991b7c43d9f809982f27c911642`。
- 今回の試験プロセス終了を確認し、同じチャットの旧成功ソースGUI`image-gallery-ui-1793187846799`だけを整理（絶対パス/結果/プロセス/再解析ポイントを確認）。直近3ソースGUI、固定成果物、診断/再利用証跡、他作業の履歴は保持。物理マウス/タッチパッド、実NAS、混在モニターDPI、実利用profile、無関係な全回帰は未確認。commit/push/Release/実利用先deployは行っていない。

## 2026-10-28: 画像ライブラリーの選択・ドラッグ操作と表示改善 0.99.20

- cleanなmainで`git pull --ff-only`が更新なしで成功してから実装した。選択済みカードからは未描画分を含む全選択画像、未選択カードからは1枚を通常グループへ追加する。開始時の対象・所属を一度限りのtokenで固定し、外部の所属変更・画面切替・元画像削除・仮想グループへの適用を拒否する。既存の一括所属保存を使い、ほかの所属と原画像を保持する。
- 背景の矩形選択、Ctrl追加、Escape取消、一覧/グループの端での自動スクロール、範囲選択中の追加表示、対象件数/ドロップ先表示、ドラッグ後のプレビュー抑止を追加。チェック周辺36pxを選択領域にし、画像/カードのhover表現を撤去した。検索欄は32pxを基本とし、スクロール領域の背景とカードの影を整えて周囲と統一した。
- サイズは120〜360pxへ拡張し、範囲入力に重なっていた共通入力paddingを解除。小型カードの余白を縮め、保存応答待ちの古いモデルが一瞬サイズを戻す不具合も修正した。設定キー・保存ファイル・既存ID/保存形式の追加削除はなく、公開APIの既存操作を維持するためパッチ更新とした。共通部品の操作は任意の接続とし、履歴/単一選択モードの動作を保持する。
- 発行前に変更と影響先をレビューし、一括選択のID照合をMapへ集約、削除された画像の再所属防止を補強した。型検査・build・関連4ファイル**37/37**が成功。保存/取消/競合/重複/全件選択/画像削除/画像session解放/分類APIを確認した。未解決の発行阻害事項なし。
- `scripts/image-gallery-ui-test.cjs`の最終ソースGUIと発行固定EXEの**各11群**が成功。新しいポインター操作、拡張したチェック領域、スライダー左右端、両一覧の自動スクロール、未描画画像の一括追加、再起動後の保存、明暗/狭幅/150・200%のCSS拡大、共通部品の履歴/画像選択モードを確認。明暗の小型カードを画像でも確認し、固定EXEのsmokeも成功した。GUIの原画像削除は隔離したごみ箱アダプターを使用した。
- 初回の依存照合は`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`で停止し、通常ユーザー環境の`install --frozen-lockfile`で同期した。依存版・lockfile・供給網検査は不変。GUIではサイズの巻き戻りを修正し、旧Shell非表示/Window左上の背景クリック検査を現行の本文ダイアログ領域へ合わせた。サイズ変更時の位置保持は列先頭IDではなく元画像の相対位置と、現在のスクロール通知の反映を確認する。
- `publish.bat`で`A:\40.ARTIFACT\AppDock.at365`へ0.99.20を発行。検証の入口は`.artifacts/image-library-interactions-20261028/validation.json`、入力hashは`inputs-before.json`、所有配布ファイルは`published-files.json`。最終ソースGUIは`.artifacts/image-gallery-ui-1793188056773/`、固定GUIは`.artifacts/image-gallery-ui-1793188121020/`、smokeは`.artifacts/smoke-1793188140977/`。入力不変と、stage/発行/ZIP/GUIコピー/smokeコピーの一致を照合した。
- 今回の成功GUI3回と単体/smoke、失敗原因の診断資料を保持。固定ビルド出力と既存の再利用証跡は保持し、削除対象なし。試験のプロセス終了を確認した。無関係な全回帰、物理マウス/タッチパッド、実NAS、混在モニターDPIと実利用profileは未確認。commit/push/Release/実利用先deployは行っていない。

## 2026-10-28: 画像キャッシュ解放0.99.19のコミット検証

- main/`3d087d0`の今回の15ファイルをレビューし、`origin`がGitHubの対象repoであること、fetch後に`HEAD...origin/main`が0/0であることを確認した。画像寿命の所有・同時読込の共有と取消・旧結果の破棄・本体IPC送信元の検査・小型画像の保持・設定/原画像の保護を再確認し、製品の追加修正は不要だった。
- 実装時の**850入力**、関連95件の完全ログ、型検査/build・発行・固定GUI/起動・レビューのログhashが一致。stageと配布フォルダー/ZIP694ファイル、ASAR内out268ファイル、固定GUIとsmokeの配布コピー各694ファイルも照合し、型検査・関連9ファイル95件・固定GUI7群・通常smokeを再利用した。版0.99.19と成果物は変更せず、再発行・GUIの再起動は行っていない。
- 標準回帰の不足分としてtest fixturesのbuild後、**137ファイル1,152/1,152**を追加実行。再利用と合わせて**146ファイル1,247/1,247、fail/skip/cancel 0**。実行前後の850入力も一致した。変更のないnative入力/兄弟Appletの追加検証や、実NAS・物理入力・OSメモリーの即時減少の確認は追加対象外。
- 証跡の入口は`.artifacts/commit-validation-image-cache-20261028/validation.json`。実装記録への参照と再利用判定、完全ログhash、追加回帰、最終stage treeとcommit tree・GitHub mainの照合を同フォルダーへ記録する。再利用するGUI/profileとworktreeの退避証跡は保護し、Release・実利用先deployは行わない。

## 2026-10-28: 画像表示の寿命に応じたキャッシュ解放 0.99.19

- cleanなmain/`3d087d0`の`pull --ff-only`で更新なしを確認して実装。管理ページ・画像選択・拡大プレビュー・設定の画像表示に画像sessionを結び付け、最後の利用元を閉じた時点で縮小画像とbyte会計を解放する。別の生存画面が使う画像とリボン用小型画像は保持。待機要求は開始前に生存確認し、進行中の遅い応答で閉じた画面のキャッシュを復活させない。renderer再読込・異常終了・本体終了でも回収する。
- 一時表示と登録はメタデータだけを常駐一覧へ反映し、ギャラリー由来の64px/96px画像を残さない。表示中のプレビューは同じファイル版の画像を再利用し、設定更新ごとの再decodeを避ける。原画像・設定・Appletの生成コピーは変更しない。既存Applet/MCP APIは維持し、画像sessionは信頼された本体IPC内だけで扱う。
- 関連Node **9ファイル95/95、fail/skip/cancel 0**、型検査・buildが成功。95件は0.99.18で検証した入力と最終入力を照合し、差分が版と`runSmoke`の明示的な画像取得だけで、対象機能・テスト・依存が一致するため再利用した。最終0.99.19でも型検査・publish内buildを実施。全標準回帰とnative入力試験は実装範囲に応じて未実行。
- 発行前レビューと追加確認で、表示中プレビューの再利用、登録直後の常駐画像を前提にしていた欠落復旧fixtureとsmokeを調整した。fixtureは一度表示してから欠落時の直近画像保持を検査し、smokeは`preview`による取得を待つ。0.99.18の旧smoke失敗を残し、開発版と最終固定配布物のsmokeで解消を確認。0.99.17/0.99.18を経て最終発行は0.99.19。保存項目・保存ファイル・公開互換性の変更がないため通常のパッチ更新。最終レビューに発行阻害事項なし。
- 最終固定配布物を隔離コピーしてGUI **7群**とsmokeが成功。実際の管理ページ遷移で本体キャッシュ0件・0バイト・待機0、画像選択取消でも0、拡大だけを閉じた際の背後の画像保持、古いsession要求の拒否、再表示、未要求画像の非decode、WebP要求時decode、リボン画像の更新を確認した。テスト用main inspectorでキャッシュと所有元数を直接観測し、製品用の診断APIは追加していない。
- `A:/40.ARTIFACT/AppDock.at365`へ発行成功。版・Default Shell・feed・deployスクリプト、stage/配布フォルダー/更新ZIP **694ファイル**とASAR内の最終out **268ファイル**を照合。EXE SHA256 `b76f14972946bf653ed32f4803cafaa536dab43894d2ac4b77f2f5ed5119d3a8`、ASAR `46f462dbcfee8862239c8bb454143efa933be63b7fab071350554598d3280679`、ZIP `3e53129798d12fe6f8363f61546c8fefdc22cd7239d0fc61fe63523579dae79b`。詳細な入力・ログhash・固定コピー・レビュー・整理記録は`.artifacts/image-cache-release-20261028/validation.json`を入口とする。
- main取り込み済みの`AppDock.at365-test-maintenance`と`AppDock.at365-picker-performance`を削除。前者はcleanでmainと同じHEAD。後者は未コミット差分があり初回の強制削除は自動承認レビューで拒否されたため、全追跡ソース897件・検証証跡1316件とbinary patchをhash照合して保全し、追加したソース86行の`32f7483`への取り込みと主要3ファイルのblob一致を追加確認してから削除した。前者のソース913件・証跡1285件も保全。共有junctionはリンクだけを外し、参照先は保持。退避先は`.artifacts/retained-{picker-performance,test-maintenance}-20261028/`。ローカルbranch/worktreeはmainだけで、追加削除するbranchはなかった。
- 参照の解放を確認したもので、Chromium/OSの使用量が即座に同量減る保証ではない。実利用設定でのメモリー推移、実NAS、物理入力は未確認。今回のcommit/push/Release/実利用先deployは行っていない。

## 2026-10-28: テスト整備を最新main 0.99.16へ統合

- cleanなmainの`git pull --ff-only`は更新なしで成功。開始点は`de048a53db07866716f2feab3b40a9d91a0f5f0a`。前回のテスト整備の912入力が当時の記録と一致することを確認し、専用worktreeの変更をコミットして最新mainへrebaseした。
- 競合したVERIFICATIONは双方の記録を保持し、変更と削除が重なった旧レイアウト検査は削除を採用した。代替の操作検査へ、mainで変わったJSONからの戻り先`command-trigger-tab:commands`を反映。mainの容量制限撤廃・索引・ツールバー/JSON構成・既存Nodeテスト・依存/配布設定はそのまま保持し、製品差分がないことをGitで照合した。
- 最新コードの開発ビルドと、関連Node 6ファイル**62/62（fail/skip/cancel 0）**が成功。設定共通6群・コマンドトリガー16群・模擬API/隔離Codex設定8群のGUI 3本も成功し、トリガーの実再起動、JSON/一覧切替、保存/取消、必須宛先、順序とフォーカス/スクロールの復帰を確認した。
- main側の既存検証815入力と完全ログ33件のSHA256が一致。既存の標準1240件・最終調整後46件等は、製品コードと既存Nodeテストを変更しない根拠とともに再利用し、全回帰を重複実行していない。worktreeとの336入力の改行差を正規化して照合し、内容差は今回整理したGUIスクリプト5本だけだった。共通フォーカス/可読性ヘルパーは前回検証時と同じGit内容のため、正常/異常検出6群も再利用した。
- 初回buildは版更新後の依存記録のずれで`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`となり、独立node_modulesのoffline `install --frozen-lockfile`で同期後に成功した。lockfile・依存検査・供給網方針は変更していない。
- 構文5ファイル、開発文書6ファイルの参照173件、Prettierと`git diff --check`を確認。最新mainとの差は対象スクリプト2,836行→1,398行（1,438行削減）、GUI入口99本→98本。行数・ファイル数をテスト件数や実行時間の削減率とは扱わない。レビューの未解決指摘なし。
- 証跡の入口は`.artifacts/test-maintenance-integration-20261028/validation.json`。検証したGit treeとmainへfast-forward反映するtree、最終commit、両worktreeの一致を同フォルダーへ記録する。過去の検証は元のworktreeの`.artifacts/test-maintenance-20261028/`を保持。版0.99.16と発行物を変更せず、publish・push・Release・実利用先deployは行わない。全回帰の再実行、固定配布EXEの再起動、物理入力・Windows設定変更・実サービスの効果確認は追加対象外。

## 2026-10-28: テストの整理と作成指針

- `b1f30b92832e03f096495da09ec49f028cc71328`から`A:/30.PROJECT/AppDock.at365-test-maintenance`のdetached worktreeを作成した。元のmainには別の設定UI修正があり、取り込まずに保持した。通常ユーザーの`git fetch origin`は成功し、開始時のmainはorigin/mainより1 commit先行・履歴分岐なしだった。Git標準のworktreeを使用し、`.tools`だけを既存固定ツールへ接続、`node_modules`はofflineの`install --frozen-lockfile`で独立作成した。
- 設定画面の旧`settings-layout-ui-test.cjs`と`settings-layout-refinements-ui-test.cjs`を`settings-controls-ui-test.cjs`へ集約。余白・中央位置・角丸・grid指定・内部構造の固定、全パレット/全ページでの重複した意匠検査を除去した。音の即時保存とコマンド反映、代表的な明暗/狭幅でのキーボード開閉・フォーカス・可読性、通知の必須宛先と確定前の一時入力、設定検索、AIダイアログの保存/取消を残した。
- `command-trigger-layout-checks.cjs`を短い`command-trigger-usability-checks.cjs`へ置き換え、3方式の入力フィルター、キーボードからの編集、スクロールバーのEnd/Home、ダイアログ終了後のスクロール/フォーカス、JSON/フォーム切替と保存値の不変を検査する。寸法・SVGパス・列の内部構造・CSS sticky/transformの指定検査は除去した。本体側の構造上の指針と、`tests/`の境界・保存・許可・実行計画の検査は変更していない。
- 旧テストが参照していた通知カード、独立した鉛筆ボタン/並べ替え一覧、Codex設定の旧折りたたみを、現行の一覧と共通ダイアログへ合わせた。設定操作試験から8ページ×明暗×2幅の配置確認と32枚の一律撮影、トレイ/バージョン画面の構造だけを数える検査を除去した。トレイ/更新の機能試験は専用の`tray-menu-ui-test.cjs`、`about-ui-test.cjs`等へ任せ、模擬APIの取得・通知先/音声の継承・隔離Codex設定の登録/解除は維持した。
- レビューで、クリック前の自動スクロールと画面幅変更後のバー計測が検査の前提に混ざる問題を修正した。クリックの準備後に復帰位置を記録し、本文とバーの可動範囲・位置が揃う条件で待機する。固定sleepや成功するまでの自動再試行は追加していない。最終のトリガー試験はEndによる実際の右端到達を含めて成功した。
- 共通のフォーカス/可読性検査は、固定の枠寸法やパレット値へ依存しない。隔離した確認画面で正常表示、透明な枠、枠の削除、フォーカス消失、同色文字、祖先の半透明背景を与え、正常2群の成功と異常4群の検出を確認した。一時的な異常は確認画面だけに与え、製品ソースには加えていない。
- `dev.bat run build`成功。関連Node 5ファイル57/57成功（fail/skip/cancel 0）。整理後のGUIは開発ビルドで設定共通6群、トリガー16群（実際の再起動を含む）、設定操作8群が成功した。最終ログと各profileのresult、診断用確認の6群、対象入力hashは`.artifacts/test-maintenance-20261028/validation.json`を入口とする。
- 対象スクリプト5本の比較は2,835行→1,397行、1,438行削減。GUIの入口は99本→98本。これはスクリプトの行数とファイル数であり、Nodeのテスト件数の削減や実行時間の改善率ではない。構文5ファイル、開発文書6ファイルのローカル参照169件、Prettier、`git diff --check`を確認した。
- [テスト作成指針](docs/testing.md)を追加し、AGENTS/DEVELOPMENT/開発手順/設定基盤/UI指針から接続した。意匠の固定と操作上の不具合を分け、共通部品への集約、適切な検査層、削除前の契約確認と担当試験を記載した。テストと文書だけで配布内容を変えない整備の扱いも明記した。
- 本体・既存Nodeテスト・依存/lockfile・ビルド/配布設定は変更なし、版は0.99.13のまま。全回帰・固定配布EXE・物理入力・Windows設定変更・実TTS/外部アカウントの効果確認は対象外。発行・commit・push・mainへの統合は行っていない。今回の試験プロセスは終了し、成功分は種類ごとに3回以内、失敗診断を含む今回の証跡を保持した。元の作業ツリーの0.99.14 UI修正へ統合する際は、その差分に対するGUI検査を別途照合する。


## 2026-10-28: 容量制限の実装方針と0.99.16のコミット検証

- AGENTS.mdと`docs/settings-capacity.md`へ、システム上必須ではなく利用者の使い方を制限する目的の件数・容量制限を組み込まない方針を明記した。今後の実装全般へ適用し、必要な制約には具体的な根拠と適用範囲を要求する。表示・処理の分割を保存総量の制限へ置き換えない。
- 未コミットの設定上限撤廃・索引共有・関連UI/API・試験・文書を再レビュー。設定置換時の索引更新、可変ドラフト、登録順とfirst/all、現在の権限判定、秘密保護、原子的保存を確認し、未解決のコミット阻害事項なし。この工程の追加変更は文書だけで、製品コードの追加修正・版更新・再発行はない。
- 最終検証入力815件と完全ログ33件のSHA256が一致。全回帰1240件と最終調整後の関連46件、型検査、native条件52件と大規模集合、ビルド、固定EXEの設定画面10群・タブ3群・smoke・発行の成功結果を照合して再利用した。全回帰後の日本語文言変更を対象に、未実行だったlocalization回帰を追加実行し、**8/8、fail/skip 0、終了コード0**。
- 0.99.16のstage/発行先/固定試験用コピー3件の所有694ファイルを全件再照合し、更新ZIP・feedのSHA256も実装時の記録と一致した。変更文書19ファイルのローカルリンク382件と`git diff --check`も成功。物理入力・実サービスの効果と、古い広域GUIの期待値についての検証境界は前項を維持する。
- 証跡は`.artifacts/commit-validation-settings-capacity-20261028/validation.json`、追加試験は`localization.log`/`localization.json`。stage/作業ファイルと検証入力の一致、stage treeとcommit treeの一致は同フォルダーの`stage.json`/`commit.json`へ記録する。mainへのコミットまでとし、push・Release・実利用先deployは行わない。新しいGUI profileや整理対象はなく、再利用証跡は保持する。

## 2026-10-28: 設定一覧の件数上限撤廃と検索索引 0.99.16

- UI改善0.99.14は先にmainの`2f8ae17`へコミットした。その後clean状態で`git pull --ff-only`成功（更新なし）。今回の設定容量・検索改善は同じmainで実装し、未コミット。push・Release・実利用先deployは行っていない。
- exe名、カスタムコマンド、キー/マウス/タッチパッド割り当て、スタック、リボン/トレイ、AI/MCP接続、Web名簿、宣言型一覧、登録素材/画像所属など、利用者の保存一覧の固定件数上限を撤去。設定JSON/名簿の合計サイズ上限も撤去した。型・重複ID・秘密保護・revision・原子的保存、入力順とfirst/all、循環/深さ、通信/操作バッチ/OS契約の制約は保持する。保存項目・保存ファイルの追加削除はない通常patch。正本は`docs/settings-capacity.md`。
- 設定確定時のWeakMap索引でexe名/対象IDのSet、入力から行位置へのMap、カスタムcommandId/解析済みスタックを共有する。設定置換で再生成し、可変ドラフトはキャッシュしない。.NETも設定受信時に同内容のHashSetを共有する。Web名簿・画像所属・並べ替え・カスタム一覧等の繰り返し検索もMap/Setへ変更。権限と実行可否は現在値で評価する。
- 発行前レビューで、MCP環境変数の暗号文サイズ、プロセス起動引数のJSON上限、Applet種類の全体256件上限、古い説明文の残りを修正した。0.99.15発行後の最終調整を含めて0.99.16へ再発行。既存の拒否テストは新方針の保存成功と不正値拒否へ更新し、値を小さくして旧上限を回避していない。
- `dev.bat test` **1240/1240、fail/skip 0**、型検査、.NET Release build成功。全回帰後の変更範囲に対し設定容量・custom commands・process launch・Applet packages/defaults/generationsの6ファイル **46/46**（新規1件を含む）と型検査/buildを再実行して成功。.NET条件/選択fixture **52件**と10,000exe名の共有・設定更新を検証した。5,000コマンド/4MiB超の保存再読込、2,501入力行、各旧上限超過、1,000環境変数の秘密保存、合計300種類超の登録とID衝突を確認した。
- ソースGUIは300コマンドを含む設定画面10群成功。最終固定EXEでも設定画面10群、トリガータブ3群、smoke成功。明暗・3幅、スクロール/JSON/エラー/sticky/追加ボタンを確認。実キー・物理タッチパッド・外部アプリでの効果・実サービス接続や実利用設定の書換えは未実施。古い5列期待値を持つ広域GUIは前項と同じく必要回帰から分離した。
- exe名の末尾一致を100,000回評価した参考測定は100件 **10.58ms**、10,000件 **10.31ms**、100,000件 **15.79ms**。同じ値の線形検索1,000回は約4/430/4082ms。索引準備後の単一プロセス内測定であり、GUIや設定全体の時間保証ではない。
- 固定Node24.22.1・lockfileで検証。最終入力815件のSHA256は検証前後一致。全回帰の入力は`inputs-regression.json`、最終版は`inputs-before.json`/`inputs-after.json`へ保存し、差分と関連再検証を`validation.json`に記録した。完全ログ・終了コード・測定結果・GUI結果・所有ファイルhashの正本は`.artifacts/settings-counts-20261028/`。
- 0.99.16のstage/発行先/GUI2種・smoke用コピー/更新ZIPの所有694ファイルすべて一致。EXE SHA256=`e8cf8839b081f5f18fdbf8da52858546cfd30a915bc6dad95120adf146eff936`、ZIP SHA256=`6f72f5e6f344c4424215500862645cd3c1ca1e0af4fa8fa5f5937996185199b0`。update.jsonの版・size/hashも一致。
- 整理: 成功済みsource設定画面試験の直近3回を残し、古い`settings-scroll-1793175029794`と今回の編集用一時スクリプト5件を削除。終了・絶対パス・再解析ポイント・保持結果を確認した。他方式・失敗/状態不明・再利用証跡・固定出力は保持。`cleanup.json`参照。

## 2026-10-28: 設定UI 0.99.14のコミット検証

- 実装時の入力808件と完全ログ、発行済みEXE/ZIPのSHA256が一致。型検査、source/固定EXEのscroll 9群・tabs 3群とsmokeを再利用し、未実行だった標準`dev.bat test`を通常環境で追加実行して1235/1235件成功。製品の追加変更と再発行はない。
- 現行4列と異なる古い5列期待値を持つ広域GUIは、この変更の必要回帰から分離する。対象の共通レイアウト・JSON・タブ切替は専用の固定EXE試験で成功済み。再レビューと`git diff --check`に問題なし。証跡は`.artifacts/commit-validation-settings-ui-20261028/validation.json`、標準回帰の完全ログ、stage/commit tree照合。push・Release・deployは行わない。

## 2026-10-28: 設定ツールバー・JSONスクロール・トリガータブ 0.99.14

- 指定されたcleanなmain `b1f30b92832e03f096495da09ec49f028cc71328`/0.99.13から開始。追跡先origin/mainへの`pull --ff-only`は通常環境で変更なし。制限環境でのDNS失敗は同じコマンドの通常環境で解消した。commit・push・Release・実利用先deployは行っていない。
- 全体設定とApplet設定の共通レイアウトへ右端8pxの余白を追加。JSONのSection相当の囲いを外し、残り高さを編集欄へ割り当て、縦スクロールを編集欄だけにした。保存先の重複ラベルを除去し、ファイルを開く操作はJSON選択中だけタブ列の直後へ表示する。複数ファイルの選択、即時保存、失敗入力の保持、ページ全体のJSON/初期化範囲は維持する。
- ツールバーと表示中のエラーを一つの縦sticky領域にし、フィルターをその前面へ重ねる。エラーがないときはページのエラー行と余白を確保せず、進行・正常結果の支援技術向け通知は維持する。ダイアログ内のエラー固定高は変更しない。コマンドトリガーは4種類の一覧とJSONを設定ツールバーへ統合し、狭幅で折り返す。
- 発行前レビューで保存/API境界、狭幅、縦横sticky、JSONエラー時の高さ、タブ選択/提供元ナビゲーションを確認。非同期scrollイベントだけでは一覧切替時の位置を失う問題を修正し、タブ切替前に同期記録する形で再確認した。通常patchとして0.99.14へ更新し、設定項目・保存ファイル・公開API・条件判定の変更はない。
- 固定lockfileのinstall、型検査/build成功。設定編集・ページ・view client・既定値リセット・トリガー・ナビゲーションの既存6ファイル65/65件成功。後続のrenderer内スクロール保持修正はこれらが対象とするshared/runtimeのコードに影響せず、修正後は型検査/buildと専用GUIを再実行した。
- 最終sourceと発行した固定EXEで、共通UI9群とトリガータブ3群が成功。実本体ウィンドウの1280/900/760px・明暗、長いJSONの単一スクロール、不正JSON保持/修正時のエラー出現/消滅、ファイル操作の表示条件、フィルターの前面重なり、横scroll中の操作位置、停止中Applet設定への共通適用、一覧の検索/種類/状態フィルター・scroll保持、実再起動での設定保持を確認。固定EXEの通常smokeも成功。
- 初期fixtureはexe名300件で既存の100件上限に抵触して復旧待ちとなったため、40件へ訂正し、起動前のparseSettings検査を追加した。件数上限が適切であることの検証ではない。100件はAppDockの共通processNamesの入力制限であり、対象exe名・除外exe名・ブラウザー名に適用される。上限の根拠と判定負荷の見直しは相談事項として未変更。画面幅の初期検証は補助Windowを参照していたため、本体URLでWindowを特定し、検証環境だけ最小幅を下げ、innerWidthも照合して全サイズを再確認した。
- 広い既存`command-triggers-ui-test.cjs`の全モードは`command-trigger-layout-checks.cjs`の古い5列期待値で停止。現在の実装/既存AGENTSは4列であり、本変更に起因する列変更はない。この全モードの成功や、その先の編集機能を今回検証済みとは扱わない。変更範囲は専用のscroll試験と`--trigger-tabs-only`で確認した。物理入力、実アカウント、複数DPI環境、実利用先への配置は未確認。
- `publish.bat`終了0、標準`A:/40.ARTIFACT/AppDock.at365/win-unpacked`へ発行。版/所有manifest/feed/ZIPサイズとSHA256、stage・配布・GUI2件/smokeコピー・更新ZIPの所有694ファイルを全件照合。EXE SHA256=`9679cf3df77c9e1363f60a38cf4ecf00069e9e321b442e464880e1ea11ab81ef`、ZIP=`f2ef9cd89e47e3c1e29d5587c8d89005f178f6ec6ce890bc1fc9ca77a0d6ee4f`。
- 正本は`.artifacts/settings-toolbar-ui-20261028/validation.json`、`inputs-before.json`（入力808件・発行後変更なし）、`owned-files.json`、完全ログ。固定GUI結果は`.artifacts/settings-scroll-1793175637858/result.json`と`.artifacts/command-triggers-ui-1793175646185/result.json`、smokeは`.artifacts/smoke-1793175654244/smoke-result.json`。入力と結果が最終変更へ適用できることを記録し、失敗ログも保持した。
- プロセス終了・絶対パス・再解析ポイントを確認し、今回の解決済み上限超過fixture6フォルダーだけ削除。診断ログ、最終成功証跡、現用/再利用状態の不明な過去215フォルダーを保持した。削除/保持判断は同証跡内`cleanup.json`。既存worktreeと他作業のファイルは保持する。

## 2026-10-28: 登録画像の必要時読込・デコード 0.99.13

- 指定どおりcleanなmain `3210be2`/0.99.11から開始。`pull --ff-only`は変更なし。既存worktree・専用発行先・利用者の設定/認証/原画像を保持して実装し、追加依頼に従い発行後のコミットまで行う。push・Release・実利用先deployは含めない。
- 起動時とwatch/2秒pollはファイル名・size/mtime/ctime・realpath/reparseだけを検査し、原画像のread/hash/decodeを行わない。未decodeの寸法は0、サムネイルは空または直近正常画像の読込候補として扱う。形式/静止画/寸法は最初の利用時に検証し、登録/importは公開前検証を維持する。
- リボンは既存opaque assetIdの取得時に初めて読み込む。閉じたグループの子や非表示項目が表示モデルへ含まれても、ロード関数を呼ぶまで原画像へ触れない。ギャラリー・設定プレビュー・Appletのローカルプレビューも必要時の取得へ接続し、通常アイコンを使いながら非同期完了後に差し替える。未知の寸法はサイズ不明として表示する。
- 同じファイル版への同時要求をまとめ、read/decodeを直列化。世代は内容hashと区別したopaque tokenで、前後statと現在のrecord/assetを検査し、差し替え・削除・停止後の古い完了を採用しない。読込失敗はpollで繰返さず、ファイル更新/管理画面の再読込後、再び要求された画像だけを検証する。MCPの候補/分類はmetadata cacheだけを使い、画像の取得・権限・パス/内容公開の範囲を広げない。
- 削除は現在版と既知内容hashを検査し、既存の確認/保存競合/失敗時復元を維持。原画像を変換せず、新しい設定や保存ファイルを追加しない。公開APIの呼出形式を保った通常patch 0.99.12として一度発行した後、完了Promiseが最後のraw Bufferを保持しないよう待ち行列をvoidへ変換する追加修正を0.99.13へ進めて再発行した。中間版の証跡は`.artifacts/lazy-registered-images-20261028/`に保持。
- 最終ソースで型検査/build、画像・設定参照・分類・削除・リボンの関連7ファイル76件が成功。コミット工程では未実行の既存138ファイル1,159件を追加し、標準145ファイル1,235/1,235成功（fail/skip/cancel 0）。同じ成功範囲をコミットのために重複実行していない。新規ケースでmetadataのread/decode各0、同時要求1回、pollによる追加decodeなし、差し替え/削除/停止競合、失敗後の明示reloadを確認した。
- 隔離source GUI5群と、最終0.99.13固定EXE GUI5群/通常smokeが成功。103件の一覧取得後、起動時にdecodeされたのは表示中のリボン1件だけ。閉じたグループ/未使用WebPは未decode、グループ展開で1件だけ追加、可視ギャラリーと明示画像要求、WebPの必要時起動、表示中画像の置換更新を確認。source GUIはref複製/待ち行列の保持解放前の成功を参照し、追加修正は最終固定GUIでも確認した。
- 発行先`A:/40.ARTIFACT/AppDock.at365/win-unpacked`、`publish.bat`終了0。版/Default Shell/feed、stage/配布/ZIPの694ファイル、ASAR内out266ファイル、固定GUI/smoke各694ファイルの最終配布物との一致、管理外設定2ファイル保持を照合。EXE SHA256=`07b400f4a639fcbf5fee493e3d682e55f9f86369048e0bdeae65fafa018124ec`、ASAR=`f44f099fbdb2ea21e766d859a0083db09dd9e950ff1904c8bf6e857369e356c6`、update.zip=`e0d17e69c88486c3ec6861284e8f164ea1f0e377aef3458a8af07dd6fafc2351`（270,690,630 bytes）。最終846入力・コマンド/終了コード/完全ログhash・レビューの入口は`.artifacts/lazy-registered-images-final-20261028/validation.json`、stage/tree/commit照合は`.artifacts/commit-validation-lazy-images-20261028/`。
- 今回の隔離本体の終了を確認し、source1回/fixed2回とsmoke2回を証跡として保持。単体試験の再利用/参照中の証跡も保護し、削除候補なし。実設定での短縮幅、実NAS回復、全物理入力/UACは未確認。起動計測の画像区間は登録画像の一覧取得へ文言を変更し、必要時decodeの全時間とは区別する。

## 2026-10-28: リボン開閉キャッシュ0.99.11のコミット・プッシュ前照合

- 利用者から、リボングループの開閉が大幅に速くなり、起動時のウィンドウ表示も速くなったとの確認を受けた。実利用での報告として記録し、今回の工程で新たに応答時間を測定した値や改善率とは区別する。
- main `c7060bd`上の対象8ファイルをレビューし、実装時907入力、完全ログと終了コード、固定EXE/ASAR/更新ZIP、所有694ファイルと隔離コピー2件のSHA256一致を確認した。型検査/build・関連90件・固定グループGUI7群/計数3操作・通常smokeを再利用し、追加の製品変更・版更新・再発行・GUI起動は行わない。
- 既存の標準回帰と現在の入力を試験ごとに比較した。未確認分、変更された推移依存、動的なファイル読取りを持つ136ファイル1,140件を追加し全件成功。実装時の8ファイル90件と合わせて、標準144ファイル1,230/1,230、fail/skip/cancel 0となった。共通翻訳/設定基盤などの推移入力が旧成功時から変わっており、旧版の他の試験結果は再利用しなかった。
- GitHubのorigin/mainをfetchしてmainとの一致を確認した。正本は`.artifacts/commit-validation-ribbon-cache-20261028/`の`plan.json`・`validation.json`・`stage.json`・`commit.json`・`push.json`。対象差分とstage/作業ファイル、stage tree/commit tree、プッシュ後のGitHub mainを照合する。今回の新規GUI profileはなく、既存の検証/診断資料とworktreeを保持し、整理による削除は0件。Release・実利用先deployは対象外。

## 2026-10-28: リボングループ開閉時の表示データ再利用 0.99.11

- main `c7060bd`のclean状態から開始し、通常ユーザー環境の`pull --ff-only`で最新・変更なしを確認した。持続的グループの開閉と一時的グループの内容取得に、同じ入力から生成した表示データを共用する。開閉後だけ1回再構築し、コマンド一覧とApplet一覧は開閉・ページ移動・バッジ変更で再生成しない。
- リボン専用の入力キャッシュを設け、設定の置換、Appletの登録/状態、カスタムコマンド、collection、Shell要件の利用可否変更で更新する。登録画像の変更は表示キャッシュだけを更新する。リボン用コマンド取得をMCP公開一覧生成から切り離し、既存の外部APIの公開判定・実行権限・操作対象再検査・要求重複排除・schema 1/2・保存仕様を保持した。設定項目と保存ファイルの増減はなくパッチ版を更新。
- 発行前に差分と変更通知経路、権限投影、画像/バッジ/モード/ナビゲーション、原子的な開閉状態保存をレビューし、発行を妨げる指摘なし。型検査/build、関連8ファイル90/90、発行した固定EXEのグループGUI7群と通常smokeが成功。GUIでは持続的展開・持続的折りたたみ・一時的展開の各操作で、表示再構築1回・コマンド一覧再生成0回を実測した。バッジ、Appletの無効化/再開、設定編集、実再起動での持続的状態保持と一時パネル閉鎖も確認。実利用設定での応答時間や体感改善率は未計測。
- `publish.bat`で標準発行先へ0.99.11を発行した。feed/所有manifest/版、更新ZIPのSHA256、所有694ファイルとGUI/smoke隔離コピー2件を全件照合した。EXE SHA256は`fe7e011870e83c1cd107303a547793ebc54d44e05df10a5dfa61c74ec7ad26e5`、app.asarは`0e615db1fcfd93af3f58c6ababf3479036cea40187451bbb622a2ac9150b853e`。
- 正本は`.artifacts/ribbon-open-cache-20261028/validation.json`。入力907件、完全ログ/終了コード、GUI計数、配布/コピー/ZIP照合を保存した。初回単体検証のバッジ表示アサートをraw countからtextへ訂正し、最終90件が成功。版更新後の依存メタデータ不一致は固定lockfileのinstallで同期し、型検査と発行を成功させた。追加の製品修正・再発行はない。
- GUI/smokeは直列実行し、今回のアプリ/テストプロセス終了を通常ユーザー環境で確認した。関連136フォルダーを整理確認し、直近分と既存の証跡/利用状態が確定していないものを保持した（削除0件、`cleanup-review.json`）。既存worktreeと専用発行先、利用者データを保持。未コミットで、push・Release・実利用先deployは行っていない。

## 2026-10-28: 設定表示データ再利用 0.99.10のコミット

- 利用者から、普段の設定でウィンドウ表示まで約1.5秒へ大幅に改善し、各Appletの起動時間も短縮したとの確認を受けた。利用者の実環境での報告であり、この作業で新たに実測した値や、全設定での改善保証ではない。
- main `32f7483`上の対象8ファイルをレビューし、発行時の全入力・型検査/ビルドの完全ログ・終了コード・0.99.10の発行済みEXE/ASAR/ZIPのSHA256を照合する。表示専用データの再利用、同期範囲の終了/例外時解放、設定/定義/状態変更時の無効化と、実要求の権限/保存経路の分離を再確認。追加の製品修正はない。
- 前回の指定を維持し、追加テスト・アプリ起動確認を行わず、実装時の型検査/ビルド/発行記録を再利用してコミットする。版更新・再発行・push・Release・実利用先deployは行わない。既存worktree・専用発行先・検証証跡を保持し、新しいprofileや整理候補はない。
- 入力/ログ/成果物の照合、レビュー、stage/作業ファイル一致、stage treeとcommit treeの一致の正本は`.artifacts/commit-validation-settings-page-cache-20261028/validation.json`・`stage.json`・`commit.json`。

## 2026-10-28: 設定ページ表示データの再利用 0.99.10

- main `32f7483`/0.99.9のclean状態から開始し、`pull --ff-only`は変更なし。設定ページ生成の重複取得と、変更のない定義・投影・MCP公開表示の再構築を抑制した。既存worktreeと専用発行先を保持し、commit・push・Release・deployは行っていない。
- 同期的な設定ページ生成の間だけ、親Applet/collectionを含む一覧とStore/カタログを共有する。読取り範囲はfinallyで解放し、非同期の保存や実行には持ち越さない。範囲外のApplet取得は現在値を毎回取得する。
- 設定カタログは言語・並び順・Applet定義・enabled/state、選択ページのフォーム/JSON投影はStore参照/revision・ページID・定義を比較して再利用する。投影の呼出元には複製を返し、保存用ドラフトを作らず、before/revision/原子的保存の検査を保持する。
- trusted UIのMCP公開表示だけを設定revision・定義・対象ページ・custom type revisionで再利用し、最終の1ページ分を保持する。追加のrevision供給がない利用先は都度構築する。MCP要求時の全target生成・権限検査・保存・実行の経路はキャッシュせず、公開表示と実行可否を分離する。
- 発行前レビューで同期範囲、例外時解放、状態/定義/保存値変更時の無効化、複製、メモリー保持範囲、既存入力/保存と公開APIを確認。既知の発行阻害事項なし。書式整形・型検査・publish内の本体/Default Shell/native/updaterビルド成功。前回の指定に合わせてテストとアプリ起動確認は省略し、従来の成功を今回の動作証明へ転用していない。
- 実行時設定項目・保存ファイル・公開Schema・依存の追加/変更がない通常patchとして0.99.10へ更新。`publish.bat`終了0、版/Default Shell/feed、ZIP SHA256/size、管理外設定2ファイルの不変を照合。速度改善幅、実設定での表示・保存・動的定義変更後の動作は利用者確認待ち。起動計測の生成回数自体は残り、累計/最長時間の比較で効果を評価する。
- 発行先`A:/40.ARTIFACT/AppDock.at365/win-unpacked`。EXE SHA256=`0ae9c8e9a0fbefc74eedcfd209468ff27a4c5ac0f1e070ef06fd812c43d5c9e3`、ASAR=`d5dd9b7b77f4977e6dbccf7bc60f5fddab0b26298ddfc30e7ecdae2d2f465227`、update.zip=`6ec7ddf7f6aa6a8781f1d6857ab2e929c3060774a7a769a883dca70f58ee9f9f`（270,688,340 bytes）。入力一覧・完全publishログhash・終了コードは`.artifacts/settings-page-cache-20261028/validation.json`、レビューは同`review.md`。
- アプリ/試験プロセスを起動せず、新しいテストprofileや整理候補はない。利用者設定・認証・既存証跡を保持した。

## 2026-10-28: 起動計測Sectionの折りたたみとコミット 0.99.9

- 0.99.8の選択パレット高速化統合/本体起動計測を保ち、共通SettingsSectionへ`collapsible`を指定した。既定の`defaultOpen=false`により、AppDockについてを開いたときは「本体の起動計測」を折りたたみ、見出しから展開できる。計測処理とデータ保持、設定・保存ファイル・公開APIは変更していない。
- 既存GUIスクリプトは外側Sectionを展開してから内側の計測JSONを開くセレクターへ追従。今回の明示指示に従い、テスト・アプリ起動確認・未実行標準回帰の追加を省略した。0.99.8時点の関連115件/固定GUI/native352/smokeの成功記録は履歴として保持し、追加修正後の0.99.9を動作確認済みとは扱わない。
- ユーザー提供の比較データはsettings.jsonだけを変更し、登録画像はどちらも0件との補足を受けた。ウィンドウ表示1,234.4→2,220.9ms、設定ページ生成累計318.5→1,278.1ms、11→12回（平均29.0→106.5ms）。初期UI待ち427.7→1,439.8msと差が大きいが、生成累計は表示後を含むため因果/支配的な内訳は未確定。今回、起動最適化の追加は行っていない。
- コミット前レビューでは既存843入力が直前証跡と一致することを確認し、追加した共通Sectionの既定状態・操作スクリプト/仕様の整合・保存変更がないことを静的に確認。既知のコミット阻害事項なし。発行済み0.99.8への通常追加修正として0.99.9へpatch更新した。
- 版更新直後の最初のdev execは依存検証メタデータ不一致で開始前に停止。既存lockfileを使うoffline/frozen installでメタデータを更新し、書式整形と通常publishを実行した。発行後の起動/操作確認は利用者指定により省略。発行結果・入力一覧・ログhash・レビュー・stage/commit tree照合の入口は`.artifacts/commit-validation-host-startup-20261028/`。
- 既存worktree・専用発行先・検証証跡を保持。今回はアプリを起動しておらず、新しいテスト用profileや整理候補はない。mainへのコミットまでとし、push・Release・実利用先deployは行わない。

## 2026-10-28: 選択パレットのmain統合と本体起動計測 0.99.8

- 開始時のmainは`2d17b28`/0.99.7でクリーン。追跡先へ`pull --ff-only`して変更なしを確認し、動作確認済みの`AppDock.at365-picker-performance`/0.99.5からパレット実装と関連仕様だけを3-way適用した。mainの4タブ化・継承表示等を保持。専用worktree/発行物は残し、commit・push・Release・deployは行っていない。
- 選択パレットは現行session/page/actionと接続寿命・利用可否を検査する一時経路で開閉し、全設定モデルの再構築/転送を省略する。保存キューと候補順序・非表示/未知ID・取消は維持。候補照合はID集合を使う。試行段階は指定によりテストせず発行し、利用者からコマンド件数を増やしても速く開くとの確認を受けている。
- 本体の最小bootstrapでimport/同期設定読込より前から計測し、設定/画像/Window/manifest/入力/初期UI待ち/通知連携等20種類の区間と、設定複製・コマンド状態検査・表示データ生成等11種類の処理回数/累計/最長を集計。「設定 → AppDockについて」の「本体の起動計測」で表示し、計測データのJSONを選択コピーできる。メモリーだけに保持し、初期化終了で固定。実行時設定項目・保存ファイル・公開Applet APIの変更がない通常パッチとして0.99.8へ更新した。
- showイベントまでの時間は実際の初描画やEXEロード開始時刻とは異なり、計測前のOS/Electron処理を本体区間へ含めない。区間/処理は入れ子・並行を含み合計不可。設定・画像内容や名称は計測データへ含めず、既存の起動順・入力停止・待機を変更していない。仕様は`docs/host-startup-timing.md`。
- 利用者の観察では、ログ削除/Webアカウント枠14→1の削減はほぼ差がなく、登録画像削除で約0.5秒短くなった可能性がある。本作業で利用者の実設定を読取り/変更/実測した結果ではなく、原因は未確定。今回の隔離固定EXEでは共有JSON 2,606/37,871 bytesの2条件で表示まで2,871.7/2,790.5ms、うちWindows起動設定確認が1,918.8/1,859.6msだった。画像/カスタムコマンドを含まないダミー設定であり、実設定量による遅延の再現・差の比較試験とは扱わない。
- 発行前レビューで統合互換性、接続/操作検査、計測境界、起動後固定、情報漏れ/保存変更、共通UIを確認。狭幅の表とJSON欄の幅を調整し、型検査・buildと関連11ファイル115件を再実行して全件成功（fail/skip/cancel 0）。明暗/小大設定の隔離ソースGUI2条件で表示と数値固定を確認。未解決の発行阻害指摘なし。
- `publish.bat`終了0。発行済み固定EXEの起動計測GUI2条件、既存dialog-blur GUI9群と通常smokeが成功。UI幅/明暗、共有JSONの初回読取サイズ、全区間終了、起動後読取で数値不変、背景クリック/透明・ブラー切替/繰返し開閉を確認した。固定GUI4コピーの管理対象694ファイルずつを最終配布物と照合した。
- 発行時にGit識別情報でnative14ファイルが再生成されたため、最終InputHost DLLを使う既存模擬入力352件も新規実行して成功。fixture/runner入力の一致を確認し、フック登録とOSへのキー送信は行っていない。Node24.22.1/pnpm12.10.1/Electron45.0.0、LUNA/Windows11 x64で実行。全標準回帰、実設定での起動比較、物理入力/UAC検査は未実施。
- 発行先`A:/40.ARTIFACT/AppDock.at365/win-unpacked`。stage/配布/ZIPの管理対象694件、ASAR内out264件、版/feed/Default Shell、管理外設定2ファイルの不変を照合。EXE SHA256=`1540182e68ab1ce5e20effc199be32db4718a946058cf60cd683a50fb3d4e693`、ASAR=`a9e338d820377d3d446ec0a043ac8ea27750f6189962a0cb8f5e64557fdc9be8`、update.zip=`e984c81f7d7eddc0d653486e359d2c7a34e1a43a31994d3cda26ed0a88c7a764`（270,687,216 bytes）。全843入力/各コマンドの完全ログhash/終了コード/配布物の入口は`.artifacts/host-startup-timing-20261028/validation.json`。
- 今回の隔離本体/対象プロセス終了を確認。起動計測profileはsource2回/fixed1回で各方式の直近3回以内、dialog/smokeは最終配布物の証跡として保持し、削除候補なし。既存worktree・過去の参照中証跡・利用者設定/認証を保持した。

## 2026-10-28: 継承実行方法表示 0.99.7のコミット前照合

- 実利用での確認を受け、main/`3a601c4`上の表示修正12ファイルをレビューした。実装時の897入力、11コマンドの完全ログ/終了コード、生成物とnative試験入力、発行済み694ファイルと更新ZIPをSHA256で照合して全一致。型検査/build、関連4ファイル44件、source GUI8群・固定GUI11群、最終InputHost DLLの352件、通常smokeを再利用した。
- 共通スタックと本体入口のCJS依存・ソース読取を含む115ファイル1,084件を追加し全件成功。入力と依存に変更がない24ファイル93件は前回の成功証跡を再利用し、実装時の44件と合わせて標準143ファイル1,221/1,221、fail/skip/cancel 0。表示補助情報だけを渡し、継承元・明示上書き・保存値・JSON/リセット所有範囲・実行計画の分離を再確認した。
- 製品ソース・版・発行物を変更せず、再発行しない。正本は`.artifacts/commit-validation-trigger-inheritance-20261028/validation.json`。再利用元/追加範囲/入力は`plan.json`、完全ログ/終了コードは各`*-result.json`、stage/作業ファイル・stage treeとcommit treeの一致は`stage.json`・`commit.json`へ記録する。GUI用プロファイルは新規作成せず、成功・診断・再利用資料を保持。push・Release・deployは行わない。

## 2026-10-28: トリガーの継承実行方法表示 0.99.7

- 4タブ化を`3a601c4`へコミットした後の別工程。0.99.6の隔離コピーで、全体の実行方法がfirstでも「ジェスチャーの設定を使用する (すべて)」と表示されることを再現した。コマンドトリガーのページ投影は割り当てと入力別上書きだけを持ち、表示処理が欠落した全体設定をallとして扱っていた。
- 全体の実行方法3件を表示専用auxiliaryへ渡し、種類別一覧とコマンド逆引きの両方から開く共通ダイアログへ接続した。各入力方式の既定値取得も共通化し、入力別のfirst/all指定と継承元の表示を分離。既存の保存値・入力API・JSON/リセット対象・実行計画を変更せず、設定項目や保存ファイルの増減がないパッチ0.99.7として発行した。
- 発行前レビューで3方式・追加/編集の入口・開いたままの表示更新・保存所有範囲を確認。型検査/build、関連4ファイル44/44、source GUI8群、固定配布物の継承GUI8群＋タブGUI3群、最終InputHost DLLのnative状態試験352件、通常smokeが成功。各ジェスチャー設定ページの表示、外部でのfirst/all切替への追従、明示上書きの独立性、元の設定全体の保持、実再起動を確認した。物理キー送信・OSフック登録・Windowsタッチパッド接続変更は行っていない。
- `publish.bat`で標準発行先へ発行。版/manifest/feed一致、全694管理ファイルと更新ZIPのSHA256一致、3隔離コピーの計2,082ファイル一致。EXE SHA256は`cc3c8c277a86007414ec2f0c5da7858c0cd3bcec08d3f28fb7e9d0cd366347c7`、app.asarは`41cf55879f074a5c2b88b75e513a98a0db199b43ec41cf389560dbb5c587c6d2`。
- 正本は`.artifacts/trigger-inheritance-20261028/validation.json`。修正前の再現ログ、897入力（新しい未追跡GUI helperを含む）、各コマンド/終了コード/完全ログ、生成物・native試験入力、配布/ZIP・コピー照合を保存。継承モードのsource/固定成功は各1回、タブモードは直近3回を保持し、再現失敗と参照済み証跡も保護した（削除0件）。今回の試験プロセスは終了済み。追加修正は未コミットで、push・Release・実利用先deployは行っていない。

## 2026-10-28: 4タブ集約 0.99.6のコミット前照合

- 実利用での確認を受け、main/`d5069c3`上の4タブ集約20ファイルを対象にレビューした。実装時の896入力・35ログ・発行物694ファイル・更新ZIPのSHA256を照合し、全一致。型検査、関連7ファイル80件、固定GUI82群と通常smokeを再利用した。
- 前回0.99.4の標準1,219件と今回の追加1件から必要範囲を確定した。CJS依存とソース/ファイル読取を持つ78ファイル790件を追加し全件成功。入力と依存に変更がない58ファイル350件を前回証跡から再利用し、実装時の80件と合わせて標準143ファイル1,220/1,220、fail/skip/cancel 0。公開文言の追加だけでは無関係な既存試験を無効にせず、影響する共有カタログ/API・ソース検査は追加対象にした。
- 生成されたInputTarget fixtureと最終InputHost DLLは前回のhashと異なるため、発行済み0.99.6のDLLそのものへnative状態試験352件を追加して全件成功。OSフック登録・キー送信は行わず、制御した対象ウィンドウと模擬入力で確認した。製品ソース・版・発行物は変更せず、再発行しない。
- 正本は`.artifacts/commit-validation-trigger-tabs-20261028/validation.json`。再利用元・入力差分・追加対象は`plan.json`、完全ログと終了コードは各`*-result.json`、stage/作業ファイル・`git write-tree`とcommit treeの一致は`stage.json`・`commit.json`へ記録する。今回のコミット工程ではGUI用プロファイルを新規作成せず、既存の成功・診断・再利用資料を保持する。push・Release・deployは対象外。

## 2026-10-28: コマンドトリガーの4タブ集約 0.99.6

- コマンドトリガーへ「コマンド一覧」「キージェスチャー」「マウスジェスチャー」「タッチパッドジェスチャー」を集約。カスタムコマンドは作成したコマンドの一覧だけとし、種類別タブを除去した。同じ専用スタック部品と保存経路を使い、保存済みID・条件・実行順・入力認識を変更していない。タブ往復時の検索・種類/状態フィルター・縦横位置を保持し、コマンド/提供元指定で開く場合はコマンド一覧を選ぶ。
- カスタムコマンドのページ投影・JSON・リセット・公開項目の補助情報を名前付き定義だけへ限定した。コマンドトリガーのJSON/リセットは選択タブにかかわらず従来の3方式を扱う。永続設定項目・保存ファイル・入力APIの追加/削除はなくパッチ更新。0.99.5発行後、共通スクロールの直接の子として従来の一覧構造を保つ修正を加え、0.99.6を再発行した。
- 発行前に要件・ページ所有範囲・即時保存/競合・移動先・共通スクロール・文書をレビューし、外側の囲みを増やさない構成へ整理した。最終版の型検査、関連7ファイル80/80、固定配布物のタブGUI3群・スタックGUI15群・MCP設定GUI64群（計82群）、通常smokeが成功。追加/編集/削除・取消・共通入力一覧との一致・再起動後の保持・カスタム画面のタブ不在・公開設定の南京錠を確認した。
- `publish.bat`で`A:\40.ARTIFACT\AppDock.at365`へ0.99.6を発行。manifest/feed/製品版が一致し、更新ZIPの全694管理ファイルが発行先とSHA256で一致。GUI/smokeの4隔離コピーも計2,776ファイルを照合して全一致。EXE SHA256は`4fa07e7160372e7cb99488903ad2745f8cf578f4480e20b02a08813229caea6b`、app.asarは`f7b2b163cd0c02437b2b3912154e11aa30042adad8b1e222c5449d35ad259d79`。実利用先へのdeploy・commit・push・Releaseは行っていない。
- 初回発行はゼロ埋めの既存Runtime中間参照DLLによりCS0009で失敗した。該当DLLを診断資料へ保存し、Runtimeの`Rebuild`で生成物だけを復旧して通常発行に成功。試験データの必須条件/初期値、記録開始の待ち合わせ、自動操作による事前スクロールも修正して再検証した。旧コマンドトリガーGUI全体モードは現在の4列化に未追随の5列期待値で失敗するため、今回のタブ専用モードと現行スタックGUIを使用した。
- 検索直後の行操作では、自動hover後のクリック捕捉失敗を診断資料に残した。同じ最終配布物・保存行は隔離再起動後にタブの表示/非表示の両方でマウスクリック成功、連続試験ではフォーカスを確定したEnter操作で編集/保存まで成功。元のhover捕捉失敗の原因特定・解消とは扱わない。物理入力・Windowsタッチパッド接続変更・全標準回帰/native全件は今回のUI変更の確認範囲に含めていない。
- 正本は`.artifacts/trigger-tabs-20261028/validation.json`。最終入力896件、全ログ/終了コード、`inputs-final.json`・`published-files.json`・`fixed-copy-comparison.json`・`artifacts.json`・`log-hashes.json`を保存。試験専用フォルダーを棚卸しし、今回の成功分、参照済み再利用証跡、診断/実行方式/他チャット使用が未確認の資料を保持した（削除0件）。今回の4試験プロファイルを使うプロセスは終了済み。保持理由は`cleanup.json`・`cleanup-inventory.json`・`cleanup-protected-names.txt`に記録した。

## 2026-10-28: 公開定義による南京錠 0.99.4のコミット前照合

- main/`91c338e`に残した0.99.4の20ファイルを今回のcommit/push対象とする。全897入力、実行コマンドと完全ログ、発行物のSHA256を実装時の記録と照合し、一致を確認した。未コミットの状態を保持して確認し、pull・stash・resetは行っていない。
- 実装時の関連6ファイル71件を再利用し、残る標準137ファイル1,148件だけを追加実行して全件成功。重複を除く標準143ファイル1,219/1,219、fail/skip/cancel 0の必要成功がそろった。型検査/build、source MCP設定GUI62群、固定EXE GUI64群、最終InputHost DLLの352件、通常smokeは入力/ログ/バイナリの一致で再利用した。
- 追加回帰の前後もout261・native602・fixture16・配布管理694ファイルとupdate.zip/update.jsonが一致。製品を修正しておらず、版更新・再発行は行わない。南京錠の公開判定、実際のAPI権限、専用スタックの設定ID接続と設計文書を再確認した。先行試験での旧値返却・revision競合は原因未確定のまま設計の確認待ちとして保持し、今回解消したとは扱わない。
- 照合と追加回帰の正本は`.artifacts/commit-validation-mcp-publication-locks-20261028/validation.json`。stage/作業ファイルとcommit tree、commit SHA、push後のremote mainは同ディレクトリーの`stage.json`・`commit.json`・`push.json`へ記録する。今回の依頼範囲はcommitと通常pushまでで、GitHub Release・実利用先deployや他worktreeの変更は含めない。既存の固定GUI・失敗/診断・再利用証跡を保持する。

## 2026-10-28: MCP設定の残範囲確認と公開定義だけの南京錠 0.99.4

- 先行依頼のpushは、cleanなmainの`91c338e88f4e0a160ad71f818b64c46056a433c9`をGitHub origin/mainへ通常pushして完了。前のremote `c1c8215`から4コミットを送信し、ls-remoteと追跡先の一致を確認した。利用者は0.99.3のScrollLock修正後に一度も再現していないと報告した。今回の後続修正開始前もcleanを確認し、pull --ff-onlyはAlready up to date。今回追加分のcommit/push・Release・実利用先deployは行っていない。
- 現mainの設計・設定owner・共通/互換APIと、実接続0.99.3の公開Schemaを読取りで照合した。固定6入口、通常設定/宣言型一覧、通知/AI/TTS/MCP接続、更新/起動、Shell、Applet共通、画像参照/分類、web-profiles、shortcut-listは接続済み。背景の透明/ブラーと新しい名前付き/専用スタックも既存の公開経路で扱える。残るサービス専用Web名簿、原画像の寿命を扱う操作、自由JSONの構造化と、意図した非公開範囲を`docs/mcp-settings-design.md`へ整理した。MCPの応答制限時間は保持し、設定追加に伴うツールリフレッシュ不要の基盤も維持する。
- 初回調査では、0.99.3固定EXEの隔離GUIで、新しいトリガー編集の実行方法/条件にunsupportedの南京錠が出ることを確認。今回、各入力ページ・逆引き・カスタムコマンド内の専用スタックを同じ入力種別の設定IDへ接続し、update/configureの公開Schemaから入力・条件・入力別実行方法を取得するようにした。名前付きスタックは従来のカスタムconfig所有定義を使用する。コマンド自体の外部実行の公開指定とは独立させた。
- 利用者の新しい指定に従い、南京錠はMCPへ非公開の設定だけを表す。明示非公開・secret/localOnly、公開定義/所有adapterがない項目には表示し、連携ON/OFF・接続・変更許可・起動/停止・準備状態や、公開済みのreadonly/行保護では表示を変えない。内部メタデータから接続状態と値/行ID・per-row writableの投影を除去し、取得時に値/保存/readonly判定を呼ばないことを試験した。実際のSchema・保存・権限・秘密保護は従来どおり各APIが再検証する。
- 設定API/設定基盤の文書と共通の南京錠説明を「MCPに公開していない設定」へ整合。公開MCPツール、操作許可、設定キー、保存ファイルの種類は増減しない通常のUI修正として0.99.3から0.99.4へpatch更新した。Node24.22.1/pnpm12.10.1/Electron45.0.0/.NET SDK10.0.403、LUNA/Windows11 x64で確認。版更新後の初回整形は依存照合メタデータの失効で拒否され、通常ユーザー環境のfrozen install後に成功。固定依存・供給網検査を回避していない。
- 型検査・本体/Default Shellビルド・関連6ファイル71/71（fail/skip/cancel 0）が成功。ソースのMCP設定GUIは62群、固定EXEは64群が成功した。未連携の公開/非公開表示、MCP writeのON/OFFで公開マークが不変、許可OFF時の保存拒否、秘密/未知列保持、公開readonly ID/保護URL、非公開JSON、3つのスタック画面接続、既存6入口とtools/list不変を確認。固定版の暗/狭幅・明/通常幅・スタックの画像を目視した。
- 発行前レビューで公開と現在の変更可否の分離、読み取り専用表示から権限を付与しないこと、親の非公開、設定/保存契約、各スタック入口、既存ownerとの接続を確認。ソース検証で未解決の発行阻害指摘なし。publish.batは終了0で標準発行先へ発行した。前段からGit revisionが進んだためnative14ファイルが再生成され、最初の「native不変」照合は失敗。C#本体/試験入力不変とInputHostのInformationalVersion（1a4d2ae→91c338e）を確認し、最終配布DLLで352項目を新規実行して全件成功した。期待する14ファイルを明示し、配布先のnative602ファイルもビルド出力と照合した。
- 固定設定GUIの初回は、ブラウザ共通設定の保存/再送後に互換APIから一度既定値が返り失敗した。保存ファイルにはedge指定が残っていた。比較条件を緩めず、読取り差分の診断だけを追加し、同一配布物の新profileで64群が成功。原因は未確定であり、南京錠修正でこの事象が解消したとは扱わない。設計書にも原因切り分けを確認待ちとして残す。
- 固定smokeは隔離設定保存時のrevision競合で2回失敗した。前版0.99.3にも記録のある事象。保存検査を変更しない診断付きコピーでは差分を捕捉できず成功し、続く通常のsmokeも成功した。全失敗/診断/成功profileを保持し、競合を解決済みとは扱わない。通常成功は`.artifacts/smoke-1793122767926`。本件のために製品へ待機や自動再試行、外部競合検査の緩和を加えていない。
- 検証前後のout261・fixture16ファイルを照合し、ASAR内outと版、feedのZIP hash/size、管理外2ファイルの保持を確認。固定設定GUIと通常smokeの管理対象694ファイルずつも照合した。EXE SHA256=`df5cac2b7b6f36c1c44457335b8ca7afa54df0e35452a9560b02ec6b04db13e4`、ASAR=`07bb4f8f9ae4e3a1f029ebdce1a133c6138b203089ee9831da3ea55404995063`、update.zip=`f259ad18919b3319f2adb082985bc3b858d0983fc4f4cbe4db1d455979aea42a`（270,679,828 bytes）。
- 調査の証跡は`.artifacts/mcp-remaining-audit-20261028/`、今回の入力一覧・コマンド/時刻/終了コード/完全ログhash・review・失敗と診断・発行照合の入口は`.artifacts/mcp-publication-locks-20261028/validation.json`。今回の本体/入力対象の終了と固定GUI専用Limited起動タスクの解除を確認した。Pause/F13〜F24をOSへ送信/登録せず、実UAC/サインインや全物理入力の効果は主張しない。利用者の実設定・認証、既存worktree、参照中/未解決の証跡を保持する。

## 2026-10-28: 条件付き入力ブロックの通知・再同期からの分離 0.99.3

- main/`1a4d2ae`の未コミット変更を保持して着手した。依頼に従い、今回の修正と前作業の固定待機・独立呼出しの重複抑止撤去を、発行後に1コミットへまとめる。開始時の変更一覧・全入力hash・許可範囲は`.artifacts/scroll-lock-block-fix-20261028/baseline.json`に保持。作業中のpull・stash・resetは行っていない。
- 元入力を止める条件は従来どおり、有効・利用可能・押下時の条件に一致した行のblockOriginalInputの合成とする。不一致やブロックOFFは通し、first/allによる実行選択をブロック判定へ流用しない。押下時に確定した判断を通知や修飾キー処理より先に保持し、長押しリピートと対になる解放まで維持する。通知失敗・再同期中という理由で確定済みのブロックを取り消さない。
- 所有権の再同期中にブロックした新規押下は、押下時の条件・対象を保ってFIFOで保留し、同期完了後に各1回通知する。通過させた入力はローカル側との二重実行を避けるため同期中の保留対象にしない。通知キューの64件上限を取り除き、表示更新だけは従来の最新1件への集約を保持。通知の明確な受付拒否は再試行できるが、配送成否不明の例外は自動再送しない。
- shortcut revision変更・記録開始・全割当解除・終了時は保留した実行を破棄し、保持中のキーの押下/解放の組は維持する。前面HWNDが0の一時状態は対象情報不明として扱い、無条件globalは判定できる一方、exe/browser/desktopや除外条件は不足した情報から一致を推測しない。ジェスチャーやキー送信の開始対象照合・取消は今回の合意範囲では撤去していない。
- 前作業のコマンド側150ms待機/抑止、プロセス起動後の前面化探索、独立呼出しの予約/重複除去、MCP同時受付/保持件数上限の撤去を含めて回帰した。応答期限・取消・権限失効・同じrequestIdの再送識別・同一実行経路の循環検査は保持。実行時設定・保存ファイル・公開要求Schemaの追加/削除はなく、通常修正として発行済み0.99.2から0.99.3へpatch更新した。既にコミット済みのappdock.noopもこの配布物へ含まれる。
- 発行前レビューで条件不一致/OFF、長押し、同期前後、通知拒否/例外、revisionによる破棄、未知の前面情報、実行循環/取消、既存未コミット範囲を確認。未解決の発行阻害事項なし。型検査・標準回帰1,219/1,219（fail/skip/cancel 0）・共通条件fixture52件が成功。開発版と最終発行InputHost DLLのネイティブ試験はそれぞれ352件（gesture58、lock255、送信queue4、今回のblock35）成功。
- 新規block fixtureはフック未登録のメモリ内で200連打/長押し/同期中200件、64件超の通知保持、受付拒否と配送成否不明例外、OFF/不一致/行の合成、保持中のON/OFF切替、revision/終了による破棄を確認。初回はfixtureのTaskCompletionSource.Task取得と、既存lock fixtureが独立ケース間の保留通知をリセットしていない点で失敗し、試験を修正後に全件成功した。製品の条件を試験都合で緩めていない。
- ソース/固定EXEでそれぞれ条件付きブロックGUI7群とMCP GUI21群が成功。Ctrl+Alt+F10でONの連続押下、OFF/不一致/無効の通過と再有効化を隔離native対象で確認。MCP側は保存キーコマンド4同時呼出しの全配送、設定GUI/再起動、Node/.NET/Watch、権限失効とプロセス寿命を確認した。Pause・F13〜F24をOSへ送信/登録していない。
- 固定EXEの最初のsmokeは隔離設定保存時のSettingsConflictErrorで失敗。ログとprofileを保持し、製品変更なしで新しい隔離profileへ再実行して成功した。一時競合の発生タイミングは未特定であり、今回修正により解消したとは扱わない。成功profileは`.artifacts/smoke-1793119728830`。
- `publish.bat`終了0。Node24.22.1/pnpm12.10.1/Electron45.0.0/.NET SDK10.0.403、LUNA/Windows11 x64 10.0.26300で実行。発行先は`A:/40.ARTIFACT/AppDock.at365/win-unpacked`。検証前後のout261・native602・fixture16ファイルを照合し、ASAR内outと版、feedのZIP hash/size、管理外2ファイルの保持を確認。固定block/MCP/smokeコピーの管理対象694ファイルずつも最終配布物と一致した。
- EXE SHA256=`c691974bbda068deccdc86d2bf4328be56da335974953925a8c8a5620072fbd9`、ASAR=`b06e62e85edb952464f2e5f030ec0cd248b408daaed779947c4cb9420e3cac5a`、update.zip=`0a7fe4d7d0b651ceaf64f00482908dafce659d39003e5b881fd0912c87911085`（270,680,728 bytes）。コマンド/終了コード/完全ログhash・入力一覧・レビュー・発行hash・stage/commit照合の入口は`.artifacts/scroll-lock-block-fix-20261028/validation.json`と`commit.json`。
- 今回の検証に使った本体・対象プロセスの終了を確認。整理計画の削除候補は0件で、再利用証跡・直近3回・失敗/状態不明・実行方式不明のフォルダーを保持した。既存worktree・利用者の設定・実利用先を変更していない。ローカル発行とまとめたコミットまでとし、push・GitHub Release・実利用先deployは行わない。
- 実機ScrollLock/RDPの断続通過は直接再現できていない。今回の変更は確認できた同期/通知失敗時の通過経路を塞ぐもので、報告された現象全体の解消や、全物理入力・UAC・第三者フック環境での効果を証明するものではない。

## 2026-10-28: 「何もしない」コマンドの単独追加（発行なし）

- 本体コマンド「何もしない」（`appdock.noop`）を共通カタログ・トレイ候補・公開コマンドへ追加。実行は共通入口の先頭で受付成功を返し、画面表示・前面化・設定保存を行わない。元入力の抑止は既存トリガーの条件と`blockOriginalInput`へ委ねる。設定項目・保存ファイル・既存の入力フックは変更していない。
- 発行不要の指定に従い版更新・publish・push・Release・deployは行わない。前作業の未コミット変更と作業ツリーの0.99.2を保持し、base `c17f542`へ今回分だけを重ねた7ファイルのtree `f5a4d01c5f1a5f4368daef1bf1771ecf786630b3`を隔離コピーして検証した。コミットへ加える本記録以外の検証入力は一致を確認。
- 隔離したコミット対象でmain/UI型検査・本体/Default Shellビルド・native/更新helper/fixtureビルド成功。標準回帰は1,216/1,216成功、fail/skip/cancel 0。開発ビルドの専用GUIは7項目成功（パレットの表示、直接実行時の前面対象と設定の保持、ブロックONとリピート抑止、OFF通過、exe条件不一致の通過、無効時の通過、再有効化）。Ctrl+Alt+F10を隔離native対象へ合成送信し、Pause/F13〜F24は送信・登録していない。起動した本体・対象プロセスの終了を確認。
- 最初の隔離標準回帰は参照manifest・固定ツール・.NETテスト用build出力の不足で8件失敗したため、必要なテスト環境を補って標準回帰全体を再実行し成功。主作業ツリー側の最初のGUIはパレットを開く前のフォーカス不足で失敗し、公開コマンドからパレットを開く試験へ修正後に7項目成功。製品の入力ブロックをこの試験都合で変更していない。
- レビュー: 共通一覧から全トリガーへ割り当て可能なこと、利用可能判定、表示処理より前の無操作return、ブロックOFF/無効/条件不一致の保持を確認し、指摘なし。物理キーボードや既報のScrollLock断続通過の解消、発行EXEの試験は今回の確認範囲に含まない。
- 証跡: `.artifacts/noop-command-20261028/`（`stage-validation.json`、`stage-standard-repaired.log`、`stage-gui.log`、`staged.diff`、`validation.json`）。検証用コピーと成功/失敗ログは再利用・診断用に保持し、同種の成功GUIは3回以下のため削除対象なし。隔離コピーの固定ツール参照junctionは試験終了後にリンクだけを除去し、参照先を保持。

## 2026-10-28: ScrollLockの元入力ブロックの調査（未修正）

- 0.99.2の実接続を読取りで確認。ScrollLockはglobal・有効・blockOriginalInput=true、フックのregistered/effectiveBlockOriginalInputもtrueだった。割当は`RDP最小化トグル`というexe起動型カスタムコマンド。設定変更・コマンド実行・実RDP操作は行っていない。
- 指定されたInvoke-MinimizeWindowの公開main（tree `2eca66d2febc5a7229a8b2784a9b6ec282c77d69`、Program.cs blob `607f370f0564c8f9ef195f0fc3d65fbfa3ffb557`）を確認。ShowWindowAsyncで最小化/復元し、復元時はSetForegroundWindowを呼ぶ。キー送信処理はない。AppDockのprocess.startには開始ウィンドウと現在ウィンドウを比較する中止判定がなく、キー送信/マウスジェスチャーの対象固定とは別経路である。
- 入力フックには、`accepting=false`の再同期区間や`shortcuts.pressed`通知の拒否時に、元入力を次のフックへ通す経路がある。通知先は64件のbounded channelをTryWriteで受け付ける。最初の押下でownedへ記録されなければ、その長押しリピートも通る。前面/配列/設定の変化で再同期が必要になった場合に通過区間が生じ得るが、実報告でその区間や通知拒否が発生した事実はまだ確認できていない。
- 発行済みInputHost DLLを使うメモリ内fixtureで210項目成功。安定状態のScrollLock連打200回は押下/解放ともブロックし、同期中の押下・通知拒否・拒否後のリピート通過・次の新規押下での回復・保持済み押下のブロック維持を確認した。OSへのキー送信・フック登録・ScrollLock状態変更は行っていない。WindowsのフックタイムアウトやRDP固有の同期が実際の原因であるとは断定していない。
- 利用者から、発生しないことも多く、長押しを織り交ぜると発生しやすい可能性、一度起きると再現しやすいとの情報を受けた。発生条件をまだ特定できず、深追いしない指示に従い調査を終了。修正候補は元入力のブロック判断とコマンド通知/再同期を分離すること。前面/開始ウィンドウの制約撤去も相談段階で、今回の製品変更・版更新・publish・commitはない。証跡: `.artifacts/scroll-lock-block-investigation-20261028/`。

## 2026-10-28: コマンド側の固定待機・重複抑止の撤去 0.99.2

- cleanなmain/c17f542から`pull --ff-only`、Already up to dateを確認して実装した。独立した入力をコマンド側で間引かず、間隔制御は必要に応じてトリガー側で扱う方針を適用した。コミット・push・GitHub Release・実利用先deployは依頼範囲に含めていない。
- キー送信後の固定150ms待機と150msの再入ガードを削除。送信中の別要求はBUSYで捨てず、押下・解放の組を保つための送信ゲートで順番に処理する。物理修飾キーの解放確認、送信直前の対象照合、取消、自身のSendInput識別、捕捉側のOSキーリピート破棄は保持した。
- プロセス起動後の可視Window探索・前面化と、その内部RPC経路を削除。workerの起動受付で戻り、非表示cmd/PowerShellの子プロセス寿命を制限しない。起動workerとの応答期限5秒、共通handlerの応答期限30秒は応答確認の仕組みとして保持した。本体を開くコマンドの前面化とジェスチャーの開始対象・session寿命は変更していない。
- 共通dispatcherのコマンド・入力・スタックの予約による抑止と、API全体のBUSYガードを削除。同じコマンドの独立した要求を受け付け、各計画内は順番に実行する。allでは同一IDの保存行・入れ子の各末端を登録回数分実行し、firstは先頭候補の失敗で繰り下げない。nativeの選択と共通fixtureも揃えた。
- カスタムコマンドの実行追跡をcommandId単位から実行ID単位へ変更。一方の完了・取消で他方の追跡を消さず、権限取消・提供元停止等は対象となるすべての実行へ反映する。ホスト発行のexecutionIdにコマンド・Appletの呼出し経路を保持し、同じ経路で同じコマンドや実行中Appletへ戻る待ち合いはSELF_CALLにする。Node/.NETの公開引数やSDK契約を増やさず、既存の自己設定変更・権限・lifecycle排他を保持した。
- MCPクライアントの開始準備中8件・同一接続先1件・全体/所有者4件・保持中64件等による受付拒否を削除。新規requestIdは独立して実行し、同じrequestIdの通信再送・内容競合・取消・権限失効・結果の10分保持期限・Schema/本文サイズ制限は保持した。設定`timeoutMs`は応答の制限時間として1〜600秒/既定60秒のまま、表示名を「応答の制限時間（ミリ秒）」へ変更した。保存キー・保存ファイル・公開MCPツールのSchemaは追加/削除していない。
- 型検査、標準回帰1,217/1,217（fail/skip 0）、native共通条件52項目が成功。対象回帰159件では同じカスタムコマンドの並行実行/片方だけの取消/全実行への公開取消、APIの独立したrootと循環拒否、MCPの同一接続先12件同時実行・66件追加・取消・再送を確認した。発行前後のInputHost DLL自体で、メモリ内のジェスチャー状態58・ロック/IMEキー状態255・送信キュー取消4の計317項目が成功した。
- ソースと固定配布物の隔離MCP GUIは各21群成功。Node/.NET DLL/native Watchの実接続、設定保存・再起動・権限取消を確認し、同じ保存済みキーコマンド4件の同時呼出しすべてがCtrl+Shift+Tとして専用ネイティブ対象へ到達した。応答期限の既定60,000ms表示と120,000msへの保存も確認した。固定EXEのsmokeも成功した。
- 追加の長時間試験では、固定配布物のProcessHostを使い、同一の非表示cmdを2件とPowerShellを1件起動した。受付917ms後にworkerを閉じ、35秒時点で3つの子PIDが生存、各PIDの完了記録は65,014ms/65,015ms/65,048msだった。最初の共有/乱数名の出力だけでは2件の区別を証明できなかったため、PID別の開始・完了記録に置き換えて再確認した。製品を修正して成功扱いにしたものではない。
- 試験側の旧BUSY/重複除去期待と、狭幅ダイアログの実行内容タブへの移動を整合させた。新規native補助の名前空間不足、版更新後の依存状態照合、前面HWND=0での状態試験、初回標準回帰の一時的なmounted-update失敗はログを保持し、それぞれ修正/通常のfrozen install/利用者によるデスクトップ利用可能化/単独試験と最終全回帰で解消を確認した。OSへPause・F13〜F24を送信/登録していない。キーリピートの証明はメモリ内のhook模擬であり、全ての実利用アプリ・物理デバイス・UACでの効果を主張しない。
- 発行前レビューで要件・取消/権限・循環・入力の組・保存順・公開Schema・検証不足を確認し、未解決の発行阻害事項なし。設定/保存ファイルの増減を伴わない通常修正として0.99.1→0.99.2へpatch更新し、`publish.bat`で標準発行先へ発行した。自動承認の初回拒否後、共通AGENTSの実装時ローカル発行規定と出力先/既存ファイル保持/実行中プロセス0を照合し、同じ手順が再審査で許可された。Release/deployへの迂回はしていない。
- Node24.22.1/pnpm12.10.1/Electron45.0.0/.NET SDK10.0.403、LUNA/Windows11 x64 10.0.26300で実行。261個のoutファイルをソースGUI時/発行後/ASAR内で照合し、native602ファイルとfixture16ファイルも不変。管理対象694ファイルを固定GUIコピーと照合し、発行先の管理外2ファイルを保持した。EXE SHA256=`f0cbf94ab4e320a3763b00b6f0f7d06bfa33e06c8b300fd9dc5276e3a60f8812`、ASAR=`c354eaa84bc808b51b8df9f29a14519499aed0d3797d2dc1cf3c16830439170c`、update.zip=`6576e7fd07b79dc9b736a1d0620365200b3353e90e1a98343c2e2a9e7f676b8f`（270,680,084 bytes）。
- 証跡の入口は`.artifacts/command-execution-unrestricted-20261028/validation.json`。コマンド/時刻/終了コード/完全ログSHA、入力一覧・発行物・review・PID別長時間試験・整理計画を保持する。ソースGUIは`mcp-hub-source-1793115233129`、固定GUIは`mcp-hub-portable-1793115587493`、固定smokeは`smoke-1793115678126`。GUIは直列/隔離profileで実行。整理候補は0件で、同種の直近3回・再利用証跡・失敗/状態不明・実行方式不明のフォルダーを保持した。利用者の配置・旧MCP設計worktreeを保持した。

## 2026-10-27: 0.99.1のコミット確認と試行worktreeの整理

- 利用者がmain版の動作を確認し、mainの変更のコミットと`AppDock.at365-dialog-performance`のworktree/専用発行先だけの削除を依頼した。製品差分は0.99.1の検証入力と一致。新しい製品修正は行わず、既存の配布物を維持して再発行・版更新はしない。
- 実装時の関連205件・固定EXE GUI32群/smokeを入力/完全ログ/発行694ファイルのhash一致で再利用した。標準回帰の残り121ファイル1,009件を追加実行し、1,008件成功。失敗1件は`preferences.test.cjs`の旧設定期待値に新規項目`overlayBackground: transparent`が不足していたため、テストだけを修正し同ファイル7件が成功。重複を除き標準142ファイル1,214件の必要成功が揃い、fail/skip 0。修正したテスト以外の入力・製品・配布物は不変。
- 公開SDK/native本体は変更していない。追加のnativeキー状態試験の前面Window制約と、実OS入力全般の未確認範囲は前項のとおり保持する。今回のコミットで同試験の成功を主張しない。証跡の入口は`.artifacts/commit-validation-dialog-performance-20261027/`。stage treeと作業ファイル、commit treeの一致を記録し、push/Release/deployは行わない。
- worktreeの変更38ファイルを統合先と照合した。本文は一致し、例外はmain 0.98.8のGUI検査を保持したスタック試験と、保存する試行履歴のVERIFICATIONのみ。削除前にソース・試行履歴・計測スクリプト・完全ログ・結果・画像を`.artifacts/retained-dialog-performance-trial-20261027/`へhash照合して保存する。
- コミット後の整理記録は`.artifacts/dialog-performance-worktree-cleanup-20261027/{before,cleanup,final-verification}.json`を正本とする。対象は`A:\30.PROJECT\AppDock.at365-dialog-performance`と`A:\40.ARTIFACT\AppDock.at365-dialog-performance`。実行中プロセスと絶対パスを確認し、再解析ポイントをリンクとして解除してから削除する。main、標準発行物、共有ツール、MCP設計worktreeを保持する。

## 2026-10-27: パレット再利用・背景選択のmain統合と透明既定 0.99.1

- 利用者が専用worktreeの0.99.0を確認し、透明ではダイアログも速くなることを確認した。依頼に従い背景の既定値を`transparent`へ変更し、選択肢を「透明」「ブラー」とした。省略設定・新規設定・appearanceの初期値未提供・CSS変数未配布もfilterなし。保存IDの`blur`と明示的に保存された選択は保持する。体感改善は利用者確認として記録し、定量値に置き換えない。
- cleanなmain/b9184edに`pull --ff-only`を実行、Already up to date。c1c8215基点の`AppDock.at365-dialog-performance`から3方向で適用、競合0。mainのカスタム編集・スクロール・狭幅レイアウトと対応GUIはHEADとの一致を確認した。package/検証記録は個別に扱い、発行済み試行版から0.99.1へ更新した。
- 設定ページの入力停止・再開で全モデルの再取得・再構築・返却を省く。既存入力確定キュー、送信元/接続/session/ページ/発行済み操作ID/最新利用可否の検査、ショートカット・ジェスチャーの保護を維持した。パレットは対応Viewを最大1件再利用し、閉鎖時にsession・検索・選択を初期化、再表示時に新しいreadyを待つ。旧Shellの破棄方式・故障時の復旧も維持する。
- 発行前レビューは`.artifacts/dialog-performance-main-20261027/review.md`。worktreeの関連44件、統合mainの型検査/build・関連21ファイル205件（pass205/fail0/skip0）が成功。依存検査メタデータは固定lockfileのオフラインinstallで更新した。パッチ出力の改行/引数エラーはmainを変更しておらず、git自身が出力したraw patchで適用を完了した。
- `publish.bat`で標準の`A:\40.ARTIFACT\AppDock.at365`へ発行、exit0。Node24.22.1/pnpm12.10.1/Electron45.0.0。staging/発行/ZIPの管理対象694ファイル、ASAR内out261ファイル、版・Default Shell・feed・deploy用ファイルを照合した。利用者データは管理対象へ含めていない。
- 固定EXEでダイアログ9群、画像ライブラリー8群、Shell/パレット7群、カスタム編集8群（計32群）とsmokeが成功。透明既定、選択肢/切替、画像プレビュー・Applet/nested本文、編集40回とパレット反復、背景クリックの制御、検索初期化/session更新、未対応Shell・故障・timeout・再試行、既存レイアウトを確認。5つの隔離コピーも管理対象694ファイルずつ最終発行物と一致した。
- 追加のInputHost模擬キー状態試験は未完了。初回`GetForegroundWindow`が0・不可視の環境で、最初のPause模擬入力の前面Window前提を満たせずexit1。一時的な試験用Windowでも先頭検査で停止した。OSへPause/F13〜F24を送信・登録しておらず、native/試験ソースは試行基点から不変。今回の発行DLLで58件成功したとは扱わない。今回の必要範囲は上記の設定・入力保護・パレットの単体/固定GUIで確認し、実OSの全入力効果は未確認とする。
- 最終EXE SHA256 `778d39641cdcb5f115c0a5a664750626a3e2850df10483b9f8a22d17709b93e4`、ASAR `dd816afbfbc66a51d996604535c653339a3630b6bd64a8583287cdbc657bd532`、更新ZIP `8d6dcf3311d50f864e1fff063c5b60df1741c356f7f9eea93c96071162996738`（270,681,738 bytes）。検証前後と最終入力のhash一致。完全ログ・コマンド・入力/配布hashの入口は`.artifacts/dialog-performance-main-20261027/validation.json`、段階別は`check.json`・`publish.json`・`gui.json`・`package-validation.json`・`asar-validation.json`。
- 試行版の計測正本は`.artifacts/retained-dialog-performance-trial-20261027/source/VERIFICATION.md`と同保持先の`artifacts/dialog-performance-validation-20261027/`・`dialog-performance-latency-20261027/`。再表示中央値136→10msは当時の隔離fixtureによる計測で、今回の統合版では再計測していない。
- 今回の試験プロセス0、indexの変更0、diff検査成功。固定EXE profile5件は証跡として保持し、既存の検証参照・状態未確定の生成物は削除していない。専用worktree/旧専用発行先と他worktreeも保持した。main統合・ローカル発行までで、commit・push・Release・実利用先deployは行っていない。

## 2026-10-27: カスタムコマンドダイアログの区切りとスクロール整理 0.98.8

- 開始時に履歴・作業ツリー・インデックス・未追跡・worktreeを確認。`main`はクリーンで、明示依頼後の`pull --ff-only`はAlready up to date。`origin/main`と`c1c8215f954012a5ef65679686b24a2af35c37aa`で一致し、ahead/behindは0/0。他のworktreeを保持して着手した。
- カスタムコマンドの追加・編集を最大900pxの画面内レイアウトにし、見出し・共通情報と実行内容・フッターを罫線で区切った。本文全体のスクロールを除き、左右の領域でスクロールする。狭幅では共通情報／実行内容を切り替え、入力途中の値・エラーと、ウィンドウを縮める直前の編集領域を保持する。Schemaと特殊キー一覧の内側のスクロールも除いた。チェックボックスは枠なしを維持した。
- 名前付きスタックはトリガー編集と同じ一覧・条件の罫線と高さ配分を使用する。狭幅で上下配置になる場合は実行内容全体を1つのスクロール領域にして、小さな一覧・条件枠へ閉じ込めない。保存・取消・JSON切替・MCP仕様再確認・キー記録・設定形式・公開API・native入力処理は維持。通常のUI改善として0.98.7からパッチ更新した。
- 発行前レビューでCSSの適用範囲、共通部品、入力保持、フォーカス、既存トリガーへの影響を確認。型付き翻訳キーの修正、狭幅でのスタック領域不足、幅変更時の編集中領域の非表示を修正した。GUIのSchema検査は2つの展開欄を明示して修正。切替ボタンを32px以上に整え、最終固定版で再確認して未解決指摘なし。
- 型検査・build・関連単体41/41件が成功。ソースGUIはカスタム8群・スタック14群が成功。以後のフォーカス／ボタン寸法調整は最終固定GUIで検証した。単体対象のmain/native・翻訳定義はその調整の影響を受けないため41件の成功を再利用した。最終入力831ファイルの前後SHA256一致、固定Node24.22.1／pnpm12.10.1、lockfile・供給網検査の維持を確認した。無関係な全回帰と物理入力は実施せず、Pause/F13〜F24をOSへ送信・登録していない。
- `publish.bat`終了0。発行先は`A:/40.ARTIFACT/AppDock.at365/win-unpacked`。staging／発行先／更新ZIPの管理694ファイル、feedの版・サイズ・hash、ASAR内main233・renderer8ファイルと最終out、GUI／smokeの3コピー各694ファイルを照合。EXE SHA256=`992886955dde0d95c47398892144328ddc1244b265a44b1a5ebaad6754df55b2`、ASAR=`ee1c0ac47956dc4cf89b1b3a2ca4a17f896a2ecb5b67fd2067f70b7a899b4fc5`、update.zip=270679680 bytes／SHA256=`a13cd1fab1276e5ad90d51a99fa72505bc8add8c6451470ff384440e81e8434e`。
- 最終固定EXEのカスタム8群・スタック14群とsmokeが成功。MCPの自動取得／長文説明／Schema変更確認、プロセス設定、送信キーのDOM記録、JSON編集、両テーマ、1320x1050・900x640・520x640・360x650での外側スクロールなし・罫線・フッター到達、切替前後の不正入力保持を確認。スタックの追加・削除・並べ替え・3方式トリガー・反復編集・取消・保存・再起動も成功し、スクリーンショットを目視した。実MCPサービスへのツール実行やWindows設定変更は行っていない。
- 証跡は`.artifacts/custom-command-scroll-0988-20261027/`のbaseline／base-commit／remote-status／review／各完全log／inputs-before・after／artifacts／package-check／fixed-copy-validation／cleanup／validation。固定profileはcustom `1793108355983`、stacks `1793108406278`、smoke `1793108455821`。今回の試験プロセス残存0。成功と失敗診断・参照資料を保持し、追加削除なし。実装完了時は未コミット。push・Release・実利用先deployは行っていない。
- コミット依頼後、831入力・成功した型検査／build／単体41件／固定GUI22群／smokeの完全ログ、配布694ファイルと試験コピー3組の一致を確認して再利用した。標準1210件と前回の影響範囲365件は、前回コミットの入力とログを照合し、今回の差分がrenderer3ファイル・GUI試験・packageの版だけでmain/native/共有定義/単体試験/依存が不変のため再利用した。最終InputHost DLLは前回のnative試験時とhashが異なったため、そのDLL自体のメモリ内状態58項目を再実行して成功。SHA256=`a684eb50767471172aa02efdf8b0cc2b0f8048625e700e13849c3f4a74267719`。キー送信／フック登録なし。追加の製品修正・版更新・再発行は不要。今回の11ファイルを対象に、stageと作業ファイル・commit treeの一致を確認してコミットする。照合根拠・完全ログ・stage／commit結果は`.artifacts/commit-validation-custom-command-dialog-20261027/`を参照する。

## 2026-10-27: ぼかしworktreeのmain統合と発行 0.98.7

- 利用者が確認した専用worktreeの0.98.5を、クリーンなmain/0389f78へ取り込んだ。開始時に`pull --ff-only`で最新取得済みを確認。試験基点はf8d1954で、30ファイルの3方向照合は競合なし。main側の`closeAfterApply`・2段階追加・最新トリガーUIと既定設定を保持し、スタックGUI回帰1本を追加改修した計31ファイルを対象とする。
- ダイアログとパレットの背景を本文範囲だけの2pxぼかしへ統合し、Shellの撮影・画像転送・非表示待ちを除いた。OK／キャンセルのあるダイアログは背景クリックで入力を保持し、閉じるだけのプレビューとパレットは背景で閉じる。mainの新しい900pxスタックダイアログにも共通の高さ上限変数を接続した。
- 発行前レビューと統合確認で、パレット開始時の一括閉鎖がスタック編集のコマンド選択を巻き込む問題を発見した。0.98.6の固定GUI失敗を保持し、表示先の変更時だけ元のダイアログを閉じるよう修正。パレットの背景取消で親と未保存名が残り、選択結果を編集へ戻せる回帰を追加した。修正後のソースGUI13群・最終固定GUI14群が成功し、未解決指摘なし。発行済み0.98.6から通常修正のパッチ更新として0.98.7とした。設定項目・保存ファイル・公開APIの追加削除なし。
- 統合版の型検査・build、関連40ファイル365/365件が成功（fail/cancel/skip 0）。標準1210件のうち非影響分は、0.98.5の既存照合チェーン・888入力と完全ログのSHA256から再利用した。365件後の差分は版・rendererの閉鎖条件・GUI試験だけで、対象main/native/単体試験と固定文言は不変のため365件の成功も最終版へ再利用。最後の829入力の前後一致を確認した。最終InputHost DLLそのもののメモリ内状態58項目も成功し、0.98.7との同一hashを確認した。OSへPause/F13〜F24を送信・登録していない。
- `publish.bat`終了0。通常発行先は `A:/40.ARTIFACT/AppDock.at365/win-unpacked`。管理694ファイルのstaging／発行先／ZIP、ASAR内261生成物と最終out、manifest／Default Shell／feedの版・サイズ・hashを照合。EXE SHA256=`aa821bcf8d335a64e4331e0d494fbf980dc4a25f097954117859680838001485`、ASAR=`10c3299457921fecb92e6a8362b0a6d958eba9440131327e0ab2af09f72de35b`、update.zip=270679272 bytes／SHA256=`42fd93bdf219384812a016e2782519e2f3279c939ad1e92352ebcf109a96f3ba`。
- 最終固定EXEは共通ダイアログ5群・画像ライブラリー8群・Shell overlay7群・スタック編集14群、smokeがすべて成功。背景クリック40回の入力保持、パレット26回、親付きパレット取消／選択、3方式の追加・編集・保存・再起動、本文内の高さ制限、両テーマ、狭幅、Applet／入れ子Viewと入力、IME／Tab／ピン／Shell復旧を確認した。5試験コピーの管理694ファイルをすべて最終配布物と照合。実リモートアカウント・物理入力・長時間GPU／プロセス全体メモリは未確認。
- 証跡: `.artifacts/commit-validation-dialog-blur-main-20261027/` のbaseline／integration／review-reuse／inputs-before・after／各完全log／package・asar・fixed-copy-validation／native-result／cleanup／validation／stage・commit-result。最終GUI profileはdialog `1793105199798`、gallery `1793105217042`、overlay `1793105228189`、stacks `1793105143792`、smoke `1793105246531`。今回の試験プロセス残存0。直近成功と失敗診断・再利用資料を保持し、追加削除なし。今回の変更だけをコミットし、push・Release・実利用先deployは行わない。元の専用worktreeと発行先を保持する。

以下の専用worktreeに関する3節は試験時の履歴であり、証跡の相対`.artifacts/`は `A:/30.PROJECT/AppDock.at365-dialog-blur/` を基準とする。

## 2026-10-27: ダイアログの背景クリック制御 0.98.5（専用worktree）

- `SettingsModal.closeOnBackdrop`の既定値をfalseにした。OK／キャンセル等の確定操作がある編集・確認・並べ替えダイアログは背景クリックで閉じず、一時入力を保持する。閉じる操作だけの画像プレビュー2経路は明示的なtrueを維持し、独立したコマンドパレットも従来どおり背景クリックで閉じる。画像プレビューのぼかしは既存実装を維持した。
- 発行前に全SettingsModal呼出元と影響先をレビューし、ボタンの文言・DOMによる推測を使わず共通既定値と明示指定で制御できること、保存・API・IME・busy・Escape・フォーカスへの変更がないことを確認した。未解決指摘なし。型検査成功。804入力の照合で製品差分は共通部品の既定値とpackage.jsonの版だけ、試験差分は関連GUI2本だけで、main/native/依存と関連63件の成功を再利用した。設定項目・保存ファイル・公開APIの追加削除はなく、既発行0.98.4から通常修正のパッチ更新とした。
- `publish.bat`終了0。発行先は `A:/40.ARTIFACT/AppDock.at365-dialog-blur/win-unpacked`。管理694ファイルをstaging／発行先／ZIPで照合し、ASAR内260生成物と最終out、feed／manifest／Default Shellの0.98.5を確認。EXE SHA256=`c3add4bbb2908129eb883aa96b0d3194177956c95488c427acac623233bff2d4`、ASAR=`239d722db7a20506d1e49b08252af7dc912a4305f58517963eaaf779900389a0`、update.zip=270676776 bytes／SHA256=`54bb9cadc65c4d1fcf8451c247bb64f5ee912b8e0456179e45bf4a851624a763`。照合スクリプトは発行先の利用者ファイルを全件比較する旧前提を修正し、manifest所有分だけを検査した。製品の発行手順は変更していない。
- 固定EXEの共通GUI5群、画像GUI8群、smokeが成功。背景クリック40回で未保存の名前を保持し、キャンセル／Escapeで閉じること、パレット26回の表示寿命、画像グループ編集の入力保持、画像プレビューの背景閉鎖と内側クリック／ドラッグの非閉鎖を確認。従来の本文内2pxぼかし、バー操作、両テーマ、狭幅、入れ子Viewと入力保持も成功。3試験コピーの全694ファイルを最終配布物と照合した。実リモートアカウント・物理IME／機器・長時間GPU／全体メモリは未確認。
- 証跡: `.artifacts/dialog-backdrop-0985-20261027/` のreview-reuse、inputs-before/after、各完全log、package/asar/fixed-copy-validation、cleanup、validation。固定GUIは `dialog-blur-ui-1793100012929`、画像は `image-library-session-ui-1793100066111`、smokeは `smoke-1793100099601`。テストプロセス残存0。同じscript／実行方式の直近成功と参照証跡を保持し、今回の追加削除なし。main統合・commit・push・Release・実利用先deployは行っていない。

## 2026-10-27: ぼかしworktree専用フォルダーへの0.98.4発行

- 依頼に従い `A:/40.ARTIFACT/AppDock.at365-dialog-blur` を新規の専用発行先として、既存publish.batで0.98.4を発行した（終了0）。通常版0.98.3を参照して新しいパッチ番号を選択。対象ソースは前項の専用worktree、mainへの統合・commit・push・Release・実利用先deployは行っていない。発行先は既存publish-pathsのworktreeフォルダー名による解決を使用し、発行スクリプトは変更していない。
- 804入力を前項の最終manifestと照合し、製品側の差分はpackage.jsonの版のみ。実装時の関連63件とレビュー結果を再利用した。frozen-lockfileの同期・供給網検査を維持。発行前にpnpm実行すると版変更に伴うworkspace構造照合で止まったため、publish.bat内の正規のinstallから実行し成功した。固定配布物の試験ではWindow表示をfixtureで明示し、製品コードを追加変更せず検証した。
- 配布フォルダー・staging・update.zipの全694ファイルのSHA256を照合し、feedの版・サイズ・hash・format、Default Shell版、配置用スクリプトを確認した。ASAR内の生成物260ファイルも最終outと完全一致。EXE SHA256=`e1f27b17689788a0cb4db12e842d5eca979a081c01bf4a06591aee7b0cd60aeb`、ASAR=`f28ddbc768076dd20aaa1810ff83c1d949069d419944e5ab58b38419ea84eb26`。update.zipは270676807 bytes/SHA256=`b1393e0101084a4b69e418e2187eb16d9ef7ba8142b19c5fa14a18825f44230b`。
- 発行物を隔離profileへコピーして共通GUI5群（ダイアログ40回・パレット26回・入れ子の描画面・入力保持・両テーマ・狭幅・背景取消・バー操作）、画像ライブラリーGUI8群、smokeが成功。各コピーの管理対象694ファイルを発行元と照合した。GUIのcapture/hideは各0、GC後DOM nodesは510→509。通常のぼかし・取消・再選択・起動保存を固定EXEで確認し、長時間GPU/全体メモリ・実リモートアカウント・物理入力は追加確認していない。
- 証跡: `.artifacts/dialog-blur-publish-20261027/` のreuse/publish.log/package-validation/asar-validation/fixed-copy-validationと固定GUI・gallery・smokeの完全ログ。GUIは `.artifacts/dialog-blur-ui-1793098067594/result.json`、画像は `.artifacts/image-library-session-ui-1793097917985/result.json`、smokeは `.artifacts/smoke-1793097929875/smoke-result.json`。未解決指摘なし。発行物を使う成功分は各方式で直近3回以内のため削除なし。失敗fixtureと検証資料、元のworktreeも保持する。

## 2026-10-27: 本文内の薄いぼかしとダイアログ背景処理（専用worktree・未発行）

- `AppDock.at365-dialog-blur`を確定済みmain `f8d1954c87cd2ae4c50ac78e6bd192e019786a6c`からdetachedで作成。元checkoutの別作業は保持した。依頼に従い発行の直前で停止し、版更新・publish・main統合・commit・push・Release・deployは行っていない。検証は固定配布物ではなく専用worktreeの開発ビルド。
- 共通SettingsModalは本文矩形だけに収め、透明な背景へ2pxのCSSぼかしを適用。背景クリックで取消し、保存中の閉鎖抑止、IME、Tab、フォーカス復帰と一時入力・保存処理を維持。Shellの撮影・画像転送・decode・非表示と準備完了待ちを廃止し、リボン・タイトルバー・ステータスバーの表示と操作を保持した。リボンでの表示先変更とパレット開始で元のダイアログを閉じる。
- パレットも本文矩形だけに配置し、背景クリックで閉じる。本体本文はCSS filter、別WebContentsのApplet本文とその内部の子Viewも追加・削除する一時CSSでぼかし、renderer・session・入力を保持する。Webアカウントの選択中本文の載せ替えも同じ管理へ接続し、nested View fixtureで入力保持と10回の適用・解除を確認した。グローバルキーとジェスチャーの停止、選択と実行の分離、ピン保存、Shellの復旧、独立Windowから本体へ画像選択を委譲する既存契約は維持した。
- 型検査・本体/Default Shell開発ビルド・ネイティブ補助ビルドが成功。関連63件はfail/cancel/skip 0。共通GUI5群（通常ダイアログ40回、パレット26回、両テーマ、狭幅、背景クリック、バー操作、ページ移動、Applet入力とCSS解除）成功。40回の開閉でShell capture/hide各0、GC後DOM nodesは510→509。開閉全体の自動操作時間に回数に比例する悪化は見られなかったが、旧版との速度比較・長時間のGPU/プロセス全体メモリ計測は行っていない。
- 画像ライブラリーGUI8群とShell overlay GUI7群も成功。画像プレビュー・グループ編集、rAF停止、capture/decode使用不能、スクロール/再選択、IME/Tab、選択/実行/ピン、Appletの入力とフォーカス、外部Shell/復旧/ready期限を確認。古い試験の撮影待ちと非表示期待を新契約に更新し、native Windowの特定とready待ちを明示した。
- レビューでは、狭幅で個別max-heightが共通制限を上書きする問題を共有CSS変数へ変更した。Electron 45.0.0のuser-origin CSSはremoveInsertedCSS成功後もfilterが残ることを最小probeで再現し、解除できるauthor-originへ修正した。パレットの初期フォーカスは描画前に準備し、Appletの上へ配置する既存native処理を維持。パレット閉鎖で別のダイアログを巻き込まないよう、取消通知はページ変更とオーバーレイ開始だけに制限した。最終の関連GUIは成功、発行を妨げる未解決指摘なし。設定項目・保存形式・外部公開APIの変更なし。発行時の版は、その時点のmainと発行済み版を確認して決定する。
- 完全ログと最終入力・生成物hash: `.artifacts/dialog-blur-validation/`。最終GUI: `.artifacts/dialog-blur-ui-1793095123503/result.json`、画像: `.artifacts/image-library-session-ui-1793094322163/result.json`、overlay: `.artifacts/shell-overlay-1793094492434/checks.json`。終了・成功・対象パス・実行プロセスなし・再解析ポイントなしを確認し、古い成功profile `dialog-blur-ui-1793094207076`と`dialog-blur-ui-1793094309554`の2件だけ削除。同種の成功は直近3回を保持し、失敗/probeと固定出力も保持。結果は同証跡のcleanup.json。`.tools`は元checkoutへのjunction、node_modulesは専用展開で、元の依存へinstallしていない。

## 2026-10-27: 既定設定とタッチパッド予備照合のコミット前再確認 0.98.5

- 0.97.12/.13の未コミット変更を、後続のコマンドスタック・編集UIを含むmain/473a2ed（本体0.98.5）で再確認した。対象は可視設定画面に限定した60秒予備照合、本体の提供設定に沿う既定値、自動更新確認OFF、Applet操作許可の新規全ON、保存互換性と関連仕様・試験の40ファイル。別作業の`scripts/mcp-hub-ui-test.cjs`はコミット対象から外し、作業ツリーに保持する。別worktreeは変更していない。
- 最新0.98.5の829検証入力と現在を比較し、差があった本体11ファイルはすべてLF/CRLFだけの違いだった。元のSHA256を改行の正規化後に再現して確認した。依存・lockfile・toolchain・既存試験・実装内容は一致する。発行物に今回の変更がすでに含まれているため、製品修正なしのコミットでは版を増やさない共通手順に従い、0.98.5を維持し、再発行していない。
- 0.98.1時点の標準1210/1210件と、後続0.98.5の関連68/68件を、元ログのSHA256、入力比較、差分の影響で照合して再利用した。標準回帰には今回の初期値・更新確認・許可・60秒/非表示/破棄待ち照合の試験も含まれる。後続の非表示関連以外の変更は、設定UI・トリガー表示順とその試験、版・smoke準備待ちであり、関連回帰と最新の固定GUI/native/smokeが成功している。追加で、変更されたrendererを走査する翻訳・設定ビュー・共通配色34/34件を実行し、fail/cancel/skip 0。最新の型検査/build、InputHost状態58項目、起動/保存/トレイ/終了smokeの成功も入力・成果物一致を確認して再利用した。
- 最新固定EXEで初回設定GUI4群と可視状態GUI8群を新たに実行し、すべて成功した。初回起動/About表示と11秒待機中の自動HTTP(S)/待受作成0、Applet許可8項目ON/MCPサーバーOFF、手動更新確認のrelease/update.json取得のみ・ZIP取得0を確認した。設定以外/トレイ/最小化での予備照合停止、設定表示/復帰での再開、非表示でもWindows変更通知の処理を確認した。予備照合は模擬Bridgeと加速した時計を使い、実キー登録・送信やWindows設定への書込はしていない。今回の試験プロセス残存0を通常ユーザーのCIM照会で確認した。
- 発行先の0.98.5 EXE SHA256=`ddb8df3b7f441cee0c1e642b973b568d4ad18b80a8af3d8346aee26d9856f278`、app.asar=`a5ed6c5014f898f945646f4fa72bfa533456d7ae6bd797d879f4dbe0e32d4764`、update.zip=270679260 bytes/SHA256 `2764e5c92d8f7e050df233193cf6fb7a6d3a90e52b352d9d470b02d58c264344`を再照合した。staging/発行先/ZIPの管理694ファイル、feed、ASAR内main233/renderer8ファイルとビルド結果、検証前後888入力の一致を確認した（本記録追記を除く）。
- 証跡は`.artifacts/commit-validation-defaults-touchpad-0985-20261027/`のreview、compare/line-ending-comparison、standard-regression-input-comparison/reused-log-checks/reuse、各status/log、inputs-before/after、package-check/artifacts、staged-tree/commit-result/validation。今回の成功出力と既存の参照証跡を保持し、追加削除なし。発行前後の製品修正・push/Release/実利用先deployは行っていない。

## 2026-10-27: コマンドトリガー一覧の編集ボタン整理 0.98.5

- コマンドトリガーの逆引き一覧で、同じ編集画面を開く鉛筆を省き、既存の歯車を条件の右・削除の左へ移した。入力の隣の空く操作列をなくして4列にした。共通CommandBindingListのtriggerStackActionsをこの画面だけで有効にし、従来のショートカット一覧の編集／実行順は保持する。歯車の複数コマンド判定・アクセント色・tooltip／読み上げ説明・選択行・フォーカス復帰を再利用した。条件文字からの編集も保持する。
- 発行前レビューで使用箇所、readOnly、列幅、保存／競合検査への影響を確認し、阻害事項なし。設定項目・保存形式・公開API・native入力処理は未変更のためパッチ更新。型検査／build／関連68件が成功。GUI初回は選択行とチェックボックスのdata-selectedを同時に拾う検査が失敗したため、スタック行に限定し、全体を再実行して成功した。版変更後の依存照合エラーはfrozen installで解消し、依存・lockfile・toolchain・供給網検査は変更していない。
- ソースと最終固定EXEの隔離GUI各13群が成功。3方式の追加・編集・保存・再起動と既存レイアウトに加え、鉛筆と旧操作列がないこと、右端の歯車／削除の順、Tab／Enter操作、対象行を選んだ編集と取消／保存後のフォーカス復帰、検索で他コマンドを隠しても複数色を保つこと、異なるコマンド削除後に同一コマンドの複数条件だけなら通常色へ戻ることを確認した。画面を目視し、固定EXEの起動／保存／トレイ／終了smokeも成功した。
- 初回publishはRuntimeの中間ref DLLに管理メタデータがなく失敗した。refint／binは正常だったことを記録し、ソースを変えずRuntimeを再ビルドして参照DLLを修復し、同じ0.98.5のpublish再試行が終了0。再生成を受け最終配布InputHost DLLそのもののメモリ内状態58項目も成功。物理入力試験・Windows設定変更は行わず、Pause/F13〜F24をOSへ送信・登録していない。
- 発行先は `A:/40.ARTIFACT/AppDock.at365/win-unpacked`。EXE SHA256=`ddb8df3b7f441cee0c1e642b973b568d4ad18b80a8af3d8346aee26d9856f278`、app.asar=`a5ed6c5014f898f945646f4fa72bfa533456d7ae6bd797d879f4dbe0e32d4764`。update.zipは270679260 bytes／SHA256 `2764e5c92d8f7e050df233193cf6fb7a6d3a90e52b352d9d470b02d58c264344`。staging／発行先／ZIPの管理694ファイル、feedの版／size／hash、ASAR内main233・renderer8ファイル、発行前後829入力、固定GUI／smokeのEXE・ASARコピー一致を照合した。
- 証跡は `.artifacts/trigger-row-actions-0985-20261027/` のbaseline／review／各log／reference-diagnostics／inputs-before・after／artifacts／package-check／validation／commit-result。ソースGUIは `.artifacts/command-stacks-ui-1793099569281/`、固定GUIは `.artifacts/command-stacks-ui-1793099745775/`、smokeは `.artifacts/smoke-1793099790999/`。直近成功・初回診断・参照中の旧版・他作業資料を保持し、削除なし。通常ユーザーのCIM照会で今回の試験プロセス残存0。今回の変更のみをコミットし、既存の別作業は未stageで保持する。発行物は現在の作業ツリーから作成した。push／Release／実利用先deployは行っていない。

## 2026-10-27: トリガー選択部品の共通化と追加手順の分離 0.98.4

- マウス／タッチパッドの既存割り当て追加UIを`GestureInputPicker`へ抽出し、トリガー専用スタックの追加でも共用した。移動・クリック・ホイール・キー、1／2段階の移動方向、3／4本指のマークを同じ部品と配列で表示する。種類を行き来したときの選択保持、同方向の2連続防止、キーの記録・正規化も維持した。
- 追加は「トリガーを選ぶ → コマンドを組む」の2段階とし、前段は広い選択領域、後段はトリガー表示・実行方法と一覧／条件に分離した。選び直し時にもコマンドと不正な入力途中の条件を保持し、最後の追加まで保存しない。未入力／既存トリガー重複は次へ進めない。共通SettingsDialogへ既定trueのcloseAfterApplyを追加し、前段だけ閉じずに次へ進む。
- 既存スタックの編集タイトルを「トリガーの編集」とし、トリガーは表示専用にした。記録／選択／戻る操作を出さず、保存時にも元のkind／inputを使用する。公開API・設定保存形式・入力実行処理・権限は変更していない。通常のUI改善としてパッチを更新した。仕様は[コマンドスタック](docs/command-stacks.md)。
- 発行前レビューでは抽出前後の操作、CSSの適用範囲、段階移動時の一時入力・フォーカス・記録停止、既定のダイアログ終了契約、既存設定との競合検査を確認し、阻害事項なし。型検査／build／関連62件が成功。GUIの初期失敗2件は、対象が既に見える画面サイズでのスクロール要求と、非同期の条件検証を待たない検査を修正したもので、修正後に全体が成功した。
- ソース・最終固定EXEの隔離GUI各12群が成功。両追加画面の共通部品でボタンID／文言一致、種類・2段階方向の選択保持、3方式の追加／反復編集／保存／再起動、入力固定、未入力／重複抑止、戻る際の不正条件保持、両段階での取消による未保存、1320x1050・900x640・560x640の選択／編集領域とフッター、既存の並び順・ローカルスタック実行を確認した。固定版の画面を目視し、起動／保存／トレイ／終了smokeも成功。物理キー／マウス／タッチパッドの再試験やWindows接続設定の変更は実施していない。Pause/F13〜F24をOSへ送信・登録していない。
- publish.batは終了0。発行先は `A:/40.ARTIFACT/AppDock.at365/win-unpacked`。EXE SHA256=`ba06f5c7272d19cbda08409640319b8276421bdbae1ebbf1eee1732e03bff2a8`、app.asar=`cd76ce4833e9ab44e4b5ec7f673244a98a1dd6c5fa743f3cd676b398d82ce376`。update.zipは270679249 bytes／SHA256 `64dffa210b7d94d904b337136a2d876113eb93813e3bdedbdea7e079b1b2a5c0`。管理694ファイルのstaging／発行先／ZIP、feedの版／size／hash、ASAR内main233・renderer8ファイル、発行前後829入力、固定GUI／smokeのEXE・ASARコピー一致を照合した。
- 証跡は `.artifacts/trigger-picker-0984-20261027/` のbaseline／review／各log／inputs-before・after／artifacts／package-check／validation／commit-result。ソースGUIは `.artifacts/command-stacks-ui-1793097844578/`、固定GUIは `.artifacts/command-stacks-ui-1793097963906/`、smokeは `.artifacts/smoke-1793098010877/`。直近成功と参照中の診断・旧版証跡を保持し、削除はない。通常ユーザーのCIM照会で試験プロセス残存0。今回のUI変更を1単位でコミットし、既存の別作業とlocaleの更新説明を未stageで保持する。発行物は現在の作業ツリーから作成した。push／Release／実利用先deployは行っていない。

## 2026-10-27: トリガー編集レイアウトと一覧順の改善 0.98.3

- トリガー専用ダイアログを最大900px・画面上下32pxの余白に拡大し、入力設定／コマンド一覧／条件を罫線で分けた。本文全体のスクロールをなくし、一覧・条件・必要時の入力欄内だけをスクロールする。特殊キー選択の内外に二重のスクロール枠を作らず、OK／キャンセルを固定する。狭い画面では一覧と条件を上下に配置する。キー入力部品のSettingsField二重包装を除き、見える「トリガー」見出しを1つにした。
- 各入力設定とカスタムコマンドの専用スタック一覧は、マーク／Selectと同じカタログ順にした。マウス・タッチパッドは既存カタログ、キーは選択UIと新しい共有カタログを使う。表示配列だけをソートし、行の編集／削除も同じ配列を参照する。保存形式・スタック内の実行順・入力処理・権限は変更していない。仕様は[コマンドスタック](docs/command-stacks.md)。
- 発行前レビューで、本文内fieldsetの高さ制約不足によるクリップと、狭い画面での一覧領域の不足を修正した。GUI検査はスクリーンリーダー用legendを見出し重複に含めず、DPIの境界線丸めを許容する。最終型検査、build、スタック／入力設定／設定ページ／キー／翻訳の関連62件が成功。依存・lockfile・toolchainは変更していない。
- ソースと最終固定EXEの隔離GUI各10群が成功。3方式の反復編集による増殖再発なし、1320x1050・900x640・560x640で外側本文のoverflowなし、区切り線・単一見出し・フッター到達性、特殊キー末尾へのスクロール、多数コマンドの一覧スクロール、逆順追加後のカタログ順、並べ替え後の正しい行への編集保存を確認した。名前付き／専用スタックの保存・再起動・ローカル実行も成功。固定版の画面を目視確認し、起動／保存／トレイ／終了smokeも成功した。
- 今回はGUI配置と表示順の変更範囲を検証した。nativeの実入力コードは未変更で、物理キー／マウス／タッチパッドの再試験やWindows接続設定の変更は行っていない。Pause/F13〜F24をOSへ送信・登録していない。既存0.98.1の全体1210件・native52件は過去の証跡として保持し、今回の固定版での物理入力確認とは扱わない。
- publish.batは終了0。発行先は `A:/40.ARTIFACT/AppDock.at365/win-unpacked`。EXE SHA256=`bf3e2a04bcab88e7c05f1a09ed9e94895dea5028eada70b393df4935a8856aa7`、app.asar=`8c05638ef9c4571655182a99922388a71d77b3b3372c6a8d91cdee577ef3918a`。update.zipは270678449 bytes／SHA256 `b8cd743bee1dfe77401cbdffd8d21701143de5159d3bd88015274566774b36ec`。管理694ファイルのstaging／発行先／ZIP、feedの版／size／hash、ASAR内main233・renderer8ファイル、発行前後828入力、固定GUIとsmokeのEXE／ASARコピー一致を照合した。
- 証跡は `.artifacts/trigger-stack-layout-0983-20261027/` のbaseline／review／各log／inputs-before・after／artifacts／package-check／validation／commit-result。ソースGUIは `.artifacts/command-stacks-ui-1793093045643/`、固定GUIは `.artifacts/command-stacks-ui-1793093143114/`、smokeは `.artifacts/smoke-1793093180015/`。直近成功と参照中の診断・旧版証跡を保持し、削除はない。通常ユーザーのCIM照会で試験プロセス残存0。今回の変更のみを1単位でコミットし、既存の別作業を未stageで保持する。発行物は従来どおり現在の作業ツリーから作成した。push／Release／実利用先deployは行っていない。

## 2026-10-27: ジェスチャー設定欄の増殖修正 0.98.2

- 0.98.1でジェスチャー設定を編集すると同じ欄が増える報告を受け、固定EXEで1回の変更後にキージェスチャーの動作設定が7個残ることを再現した。原因は `SettingsForm` の兄弟要素である動作設定と専用スタック一覧へ同じReact keyを渡していたこと。描画更新で古い要素が残るため、3方式の動作設定とスタック一覧を区別する安定したkeyへ修正した。保存内容と実行方式は変更していない。
- 回帰試験へ、キー・マウス・タッチパッドそれぞれでfirst/allを4回切り替え、専用スタックも編集した後に動作設定・共通設定・接続設定・一覧が1組であることを確認する項目を追加した。旧固定0.98.1では失敗し、修正ソースと固定0.98.2では成功した。型検査、関連回帰21/21件、固定GUI8群、smokeが成功（fail/cancel/skip 0）。既存の標準1210件のうち影響しない保存/実行/native等の成功は前項の証跡を再利用し、今回の描画変更は新しい連続編集試験で確認した。
- レビューで全3方式の兄弟keyの一意性を確認し、未解決指摘なし。通常修正として0.98.2へ更新し、`publish.bat`終了0。発行先は `A:/40.ARTIFACT/AppDock.at365/win-unpacked`。EXE SHA256=`b7ce7be895e315196e146ed9920d38b67ce73103648934a182779c96416babe8`、app.asar=`2ad116f61804206d00658e7ccfa8adc2579e604dbb290318546b032793402690`。update.zipは270677292 bytes/SHA256 `8f9e68c326e6d92e16900b8a29f4e308c5666a326810f6fb3e860012287cda3b`。管理694ファイルのstaging/発行先/ZIP、feed、ASAR main232/renderer8ファイル、827入力の検証前後一致を照合した。
- 証跡は `.artifacts/gesture-settings-duplication-0982-20261027/` のbaseline/reproduce-0981/review、各log、inputs-before/after、artifacts/package-check、validation/commit-result。固定GUIは `.artifacts/command-stacks-ui-1793091380040/`、smokeは `.artifacts/smoke-1793091394211/`。再現・修正後の直近成功と参照証跡を保持し、削除は行っていない。今回の3ファイルと本記録だけを追加コミットし、既存の別作業は保持する。push・Release・実利用先deployは行っていない。

## 2026-10-27: コマンドスタックとトリガー連携 0.98.1

- 名前付きカスタムコマンド `appdock.commands.stack` と、キー・マウス・タッチパッドの各トリガー専用スタックを実装した。追加・削除・ドラッグ/キー並べ替え、行の有効状態と「いつ・どこで」、first/all/全体設定の継承を共通エディターで編集する。各入力設定の一覧とカスタムコマンドのタブ、逆引き一覧の編集は同じ記録を扱う。チェックボックスを枠なしにし、ダイアログの高さとスクロールを制限した。仕様の正本は[コマンドスタック](docs/command-stacks.md)。時間指定の待機ステップは追加していない。
- 保存形式を `triggerStacks.version: 1` へ集約し、既存の行配列/APIは投影として維持する。循環・8段を超える入れ子・展開2000件超を拒否し、呼び出し開始時の条件で末端を展開する。同一コマンドは全体で1回、firstはbusy/失敗で繰り下げず、allは個別エラー後も継続する。共通dispatcherの予約・取消、外部呼出元の公開/権限/SELF_CALL検査を保持した。nativeの事前判定も入れ子の条件と対象HWNDを確認する。
- 発行前レビューで、条件/定義の固定、専用スタックを含む展開上限、外部権限の再検査、不正入力の保持と保存抑止、前面Windowの一致を確認・修正した。標準回帰は1210/1210件、fail/cancel/skip 0。旧UI・旧保存形式を前提とした2試験を新仕様へ更新後に全件成功した。C#/TypeScript共有条件fixtureは52件とHWND一致確認が成功。最終固定DLLのメモリ内キー状態試験も成功した。
- 最初の0.98.0発行後、組み込みsmokeのパレット表示判定が固定150ms待ちで失敗した。起動直後のInputHost接続を含む準備完了を上限5秒で待つ検査へ修正し、発行規則に従い0.98.1とした。最終型検査、スタック・パレット・トレイ関連20/20件が成功。全体回帰からの入力差分は `package.json`、組み込みsmokeだけの `src/main/index.ts`、新規native GUI試験だけで、他の標準回帰は成功を再利用した。コミット内容だけを別展開したmain/rendererの型検査も成功した。
- 最終固定EXEの隔離GUIは、スタック編集7群、既存カスタムコマンド編集7群、実入力4群、smokeがすべて成功。スタックの実行順/入れ子、実前面条件、3種類の一覧間の共有、条件不正時の保存抑止、幅900x640のフッター到達性、行削除、正本形式の保存と再起動を確認した。既存のMCP自動取得・遅い応答/再試行・仕様採用・JSON/プロセス/送信キー編集も確認した。最終固定版の画面を目視確認した。
- 実入力試験では専用Windowと隔離本体だけを対象にCtrl+Shift+8/9とマウス移動をOSへ送信し、入れ子のAppDock条件/外部exe条件、末端の順序、元入力のブロック、不一致時の入力通過、マウスの専用スタック実行を確認した。Pause/F13〜F24をOSへ送信・登録していない。実タッチパッド機器・Windows接続設定への書込、実下流MCPツールや外部プロセスの効果確認は未実施。試験途中の失敗は初期fixtureの不足・Windows前面状態・自動非表示を修正し、診断を保持した。
- `publish.bat` は終了0。発行先は `A:/40.ARTIFACT/AppDock.at365/win-unpacked`、EXE SHA256=`6e2889f08d9146571bf1b1dcdaf240d7efa399bbb7819c2a9ce46ec01d31e46d`、app.asar=`4d01acd3d977be5c8a4a2f87ccd4a3ef147f5a0a5c29e725392174148f47ff30`。update.zipは270677179 bytes/SHA256 `8b9e801fa94fdad31a4ee1b0c8e0eae1d78905f636a8d17e465eb7c732c672b3`。管理694ファイルのstaging/発行先/ZIP、feedの版/size/hash、ASAR内main232/renderer8ファイルとビルド出力、最終827入力の前後一致を照合した。
- 基点main/8d74924から、土台・実行統合・編集UI・実入力/起動検証・発行版/記録の5単位でコミットする。既存0.97.12/.13の別作業は未stageのまま保持し、36ファイルの残存変更内容を開始時差分と照合した。localeの既定更新説明も残している。既存0.97.14の依頼対象UIは今回のUIコミットに含めた。発行物は既存作業を含む現在の作業ツリーから作成し、対象差分・基点と入力hashを証跡に保存した。push・GitHub Release・実利用先deployは行っていない。
- 証跡は `.artifacts/command-stacks-0980-20261027/` のbaseline/review、final/issued-inputs、regression-reuse-delta、各完全log、issued-gui-status/issued-artifacts/issued-package-check、prior-changes-preserved、validation。最終固定GUIは `.artifacts/command-stacks-ui-1793090507469/`、`custom-command-editor-portable-1793090521947/`、`command-stacks-native-1793090531516/`、`smoke-1793090501533/`。直近成功と再利用/診断証跡を保持し、テストprofileは削除していない。型検査用の一時展開だけをjunction解除・対象内のパス確認後に削除し、元のnode_modulesを保持した。通常ユーザーのCIM照会で試験プロセス残存0を確認した。

## 2026-10-27: カスタムコマンド編集ダイアログの整理 0.97.14

- 共通項目を左、種類別の実行内容を右に配置する専用レイアウトへ変更した。狭い画面では縦に並べ、本文だけをスクロールさせてOK／キャンセルを表示する。種類・プロセス実行方法の説明をSelect右の情報アイコンへ移し、送信キーのField説明を省いて記録状態をボタン内へ移した。作業フォルダー・コンソール・待ち時間・Schema・JSON編集は詳細設定にまとめた。利用者の指定に従い、このダイアログのレイアウト指針の例外を明文化し、共通の配色・保存・取消・記録抑止・フォーカス・MCP操作許可を維持した。
- MCP接続先の変更と編集開始時にツール一覧を全ページ自動取得する。常設の取得・詳細再取得ボタンを除き、失敗時は共通エラー欄から再試行する。古い接続先の応答を破棄し、取得中の引数編集を保持する。長い説明は1行と「説明を読む」のスクロール可能なポップオーバーへ変更した。既存toolRevisionの変更は自動採用せず、確認・採用が必要。保存直前の仕様変化やJSON編集からも引数を保持して確認へ戻る。名前・説明だけの変更は、接続できない既存定義でも保存可能とした。
- 発行前レビューで共通CSSとの優先順位、説明をEscapeで閉じたときのフォーカス復帰を修正した。最初のソースGUI試験は、プロセス起動のfixtureに絶対パスが必要なため停止し、fixture修正後に7群成功。版更新後の依存構造検査は固定lockfileでinstallして解消した。最終型検査・関連回帰46/46件が成功（fail/cancel/skip 0）。保存項目・保存ファイル・API契約の追加削除はなく、パッチ版0.97.14とした。
- publish.bat終了0。固定EXEの隔離GUI7群で、自動全55ツール取得、失敗・再試行、遅い応答の破棄、取得中の引数保持、仕様変更の採用と取消、JSON編集、入力不正、プロセス設定、送信キー記録、保存・取消を確認した。説明アイコンのhover/focus、説明ポップオーバーの閉じる／Escapeとフォーカス、ヒント非表示時の説明、幅360/520/1200での操作到達性、明暗テーマを確認した。幅広／狭幅／プロセスの画像も確認した。キーはDOMイベント、MCPはローカル模擬サーバーのみで、実際のキー送信・プロセス起動・下流ツール実行は行っていない。固定EXEのsmokeも成功した。
- 発行先は`A:/40.ARTIFACT/AppDock.at365/win-unpacked`。EXE SHA256=`1ed20fbfeb5080eda03a99ea3d5278f154e8858ba4d1a27aefc9a34b2b49469b`、app.asar=`329103e048476e68d5c61de60f0362bc7196f36cc90bd13ac3b741aea9b48687`、update.zip=270665581 bytes/SHA256 `662db3c22392100304127b692856d05ff2abdff69d04817d1ab998242313d1de`。管理694ファイルのstaging／発行先／ZIPと隔離コピー2組、feedの版/size/hash、ASAR内main230／renderer8ファイルと最終ビルドの一致、877入力の検証前後一致を確認した（本記録追記を除く）。
- 証跡は`.artifacts/custom-command-layout-20261027/`のbaseline、review、inputs-before/after、各status/log、artifacts/package-check/validation、prior-changes-preserved、cleanup-inventory/status。固定GUIは`.artifacts/custom-command-editor-portable-1793084313767/`、smokeは`.artifacts/smoke-1793084339736/`。直近成功・失敗診断・既存の参照証跡を保持し、追加削除なし。CIM照会は制限環境で拒否されたため通常ユーザーで再確認し、試験プロセス残存なし。既存0.97.12/.13の未コミット変更を保持し、重複編集したpackage.json・locale・本記録以外の35変更ファイルは開始時差分と一致した。commit/push/Release/実利用先deployは実施していない。

## 2026-10-27: 本体の既定設定と初回起動時の更新通信 0.97.13

- 提供されたsettings.json（SHA256 `eb8cdf3c23252f5c61916504a19e59b228e29204d03c0b887b11a59a11705f6b`）の実効設定を本体の既定値へ反映した。ホイール遅延20ms、待機表示の不透明度90%、コマンド検索Ctrl+P、トレイの「本体を開く」、リボンの順序と下部配置、エラー/警告のバナー、更新検出のバナー6秒を統一した。インストール済みAppletの初期化履歴や利用者生成のトレイUUIDは共通の既定値へ固定していない。
- About表示時・本体起動時・Applet起動時の自動更新確認はすべて既定OFF。AI/TTS接続先未設定、MCPサーバー既定OFFは維持する。更新確認の既存経路はrelease/update.json等のバージョン情報だけを取得し、パッケージの取得・適用はinstall経路で行うことを確認した。自動・手動の確認経路にダウンロード処理を追加していない。
- applet-api.jsonがない新規環境では、現在のApplet操作許可8項目をすべてONにした。保存済みversion 2の明示値・省略時拒否、version 1の個別許可を共通許可へ拡大しない移行、不正/読取不能時の拒否、MCP列の独立した許可は維持する。既存の設定ファイルや明示したON/OFFを上書きしない。
- 発行前レビューで、旧trayCommandsだけの保存値を新しい既定trayMenuで置き換えないことと、保存済みリボングループの子を省略された既定root/bottomへ追加しないことを確認・修正した。明示した無効な子/root重複は従来どおり拒否する。画面の説明・関連仕様・旧既定値を前提にしたfixtureを更新した。型検査と標準回帰1197/1197件が成功（fail/cancel/skip 0）。初回の回帰失敗、fixture修正後の成功ログを保持する。保存項目/保存ファイル/公開APIの追加削除はなく、既存既定値と互換読込の調整としてパッチ版0.97.13とした。
- publish.bat終了0。固定EXEを設定ファイルのない隔離profileで起動し、本体入口で事前設置したfetch/Electron net.fetch・HTTP(S)・Node listenの記録で、起動時の設定待機時間を超える11秒とAbout表示中の自動通信/待受作成0件を確認した。Appletの8項目ONとMCPサーバーOFF、実際の許可スイッチ全ONも確認した。手動の更新チェックは模擬リリース情報とupdate.jsonの2件だけで更新候補を表示し、ZIP取得/適用0件だった。実サービスへの接続や実FWダイアログの操作は行っていない。別途設定したAppletの通信はこの本体初期設定の確認対象に含めない。
- GUIプローブの初期試行は、Electron初期化前のresourcesPath、停止中評価方式、カテゴリ名、Electron net.fetchへのfixture接続を試験側だけで修正した。製品は発行後変更していない。設定入力9群とsmokeも固定EXEで成功した。About/許可画面の画像を確認した。全体回帰の入力から変わったのは新設GUIプローブのみで、製品・単体試験・ビルド入力の不変を照合した。
- 発行先は`A:/40.ARTIFACT/AppDock.at365/win-unpacked`。EXE SHA256=`5d9e502641f9f6b92794b73ab5459ff903bfe415ce560656b952d385294a5d98`、app.asar=`44a3f2171352b44f661305e60c3b4509d197e1fb230000f2c3eb394e20f2a43b`、update.zip=270663951 bytes/SHA256 `c55c60bf7ccbf3d9f4ea4d6b0455fba21d69f2568b363c5bf7ba5ef75fed3092`。管理694ファイルのstaging/発行先/ZIP、feedの版/size/hash、固定試験コピー、ASAR内main230ファイル/renderer8ファイルとビルド結果を照合した。最終874入力は検証前後で一致した（本記録の追記を除く）。
- 証跡は`.artifacts/defaults-network-09713-20261027/`のattachment-diff、inputs-pre-publish/before/after、input-adjustments、review、typecheck/regression、publish、defaults-ui/gui-status、artifacts/package-check/validation、cleanup-inventory/status。既存の参照証跡・比較基準、今回の失敗プローブ診断と成功結果を保持し、追加削除なし。0.97.12のタッチパッド確認抑制を含む未コミット変更を保持した。commit/push/Release/実利用先deployは実施していない。

## 2026-10-27: タッチパッドの予備確認を表示中の設定画面へ限定 0.97.12

- 利用者の希望により、タッチパッド接続の予備照合を常時2秒から60秒へ広げ、本体の設定画面（Applet設定を含む）が表示されている間だけ実行するよう変更した。別画面、トレイ収納、最小化、設定接続の破棄ではタイマーを解除する。設定画面を開く/再表示するときは一度照合し、待機中の周期処理も実行直前に表示状態を再確認する。機能OFF/割り当て0件では周期確認しない。
- SettingsPageHostの現在の設定接続と、main Windowの可視/最小化状態から表示状態を通知する。画面ハンドラーや公開APIへ独立した保存値を追加していない。Windows変更通知による世代無効化・即時照合、起動/明示操作、ジェスチャー受付/実行、Windows設定の書込条件と競合停止は維持した。通知漏れや一時障害の解消確認は、表示中の次の確認か設定画面を開くまで遅れる場合がある。
- 開始時はmain/8d74924でclean、共通手順のpull --ff-onlyはAlready up to dateだった。直前の配色名変更は保持した。型検査と関連6ファイル44/44件（fail/cancel/skip 0）が成功した。模擬時計で非表示中10分の周期確認0、表示直後と60秒時の確認、非表示後の通知による競合/回復、非表示中のジェスチャー実行、OFF/未割り当て、待機中の周期処理取消とclose後の再開禁止を確認した。発行前レビューに未解決指摘なし。設定項目/保存ファイル/公開契約の追加削除はないためパッチ版0.97.12とした。
- 最初の発行は、生成済みRuntime参照DLL（20992 bytes、先頭16 bytesが全て00）を.NETコンパイラーが読めずCS0009で停止した。同時ビルドは検出されなかった。失敗ログを保持し、ExtensionHostと参照プロジェクトの標準Rebuildを通常ユーザーで実行して成功（警告/エラー0）。MZヘッダーを確認し、固定設定を維持したpublish.bat再実行は終了0で完了した。製品ソースや検査の回避変更は行っていない。
- 固定0.97.12のGUI8群で、設定以外では周期確認0、表示中の周期確認、トレイ収納/最小化での停止、再表示での再開、非表示中のWindows変更通知を確認した。ここでは隔離プロセスのBridgeを模擬化し、対象タイマーだけ60秒を100msへ加速した。実際の60秒境界は単体で検査し、Windows設定への書込・Pause/F13～F24の実登録/実送信は行っていない。従来の設定入力/JSON/IME等9群とsmokeも成功した。物理入力・実タッチパッドの再確認は未実施。
- 標準発行先は`A:/40.ARTIFACT/AppDock.at365/win-unpacked`。EXE SHA256=`92bdd57be66b9591bd7749f5a20e8890dc311ae8e1b1fcc6a2812798d70e5bfe`、app.asar=`372a2392dfcf38f26ce7dcb6b4d4357dec32827ddd473026baa1ec22472ae1ae`、update.zip=270664203 bytes/SHA256 `3bdc279891f7e5d032fc73e0fa4dc2faad9034a3e0a8fca26dcfa653ca8c0245`。管理694ファイルのstaging/発行先/ZIP、feedの版/size/hash、固定試験コピー、ASARコードのビルド一致を照合した。検証前後の872入力は一致した（本記録追記を除く）。
- 証跡は`.artifacts/touchpad-polling-09712-20261027/`の入力一覧、review、regression/typecheck、publish-failed/native-reference-failure/native-rebuild/publish、gui-status、artifacts/package-check/validation。直近成功分と既存の参照証跡を保持し追加削除なし。commit/push/Release/実利用先deployは行っていない。

## 2026-10-27: 0.97.11までの改善・修正の一括コミット検証

- 利用者の依頼により、設定監視の非同期化/60秒補助と読取worker、設定コピーと同一周期通知の削減、Applet起動4区間の表示、連続保存EPERMと入力基準の競合修正、それらの文書/試験を36ファイルの1コミットへまとめた。基点はmainの293c134。既存変更を保持し、pull/stash/reset・他repoの変更は行っていない。
- 最終0.97.11の検証入力871ファイルと現在のbytes、lockfile/toolchain/build定義、未追跡の試験/workerを照合して一致した。必要な関連回帰26ファイルは、0.97.9の182件、0.97.10の91件、0.97.11の78件の既存成功から、試験/対象コード/後続差分の影響を個別判定して再利用した。重複するケース数を合計せず、最終版の型検査と色変更120回/入力9群/同期11群/smokeも再利用した。根拠と入力差分は`.artifacts/commit-validation-settings-performance-09711-20261027/{reuse,input-comparison,prior-log-checks}.json`。
- 最終EXEで未実施だった起動内訳/連続切替60回を含む10群、復旧7群、idleを追加し、すべて成功した。idleは同じ2秒周期の通知3回で全体更新0、391フレーム/最大16.8ms。古い版のGUI成功を今回実行したものへ読み替えていない。実KAGUYA/Google認証/物理入力の未確認範囲は各実装記録のとおり。
- 発行先/staging/ZIPの管理694ファイルとfeedの0.97.11/size/SHA256を再照合して一致した。EXE SHA256は`a7195e1b26c7d1b47c85a49b309d34c962a055ffcf333ce6a3bfc37ae8990aca`、ZIPは`57d6d9735bf7b9b61b55e626f5d4e9ca2e900531de03efe6017d794b9efd2efd`。製品の追加修正がないため版更新/再発行は行わない。
- 差分レビューに未解決指摘なし。stage対象一覧、`git write-tree`、commit/tree、Git設定とauthor/committerの一致、終了状態は同証跡のstage/commit/validationに記録する。直近試験と比較基準・参照済みの旧試験を保護し、追加削除なし。コミット工程のみとし、push/Release/deployは実施していない。

## 2026-10-27: 連続入力で自分の保存を外部変更と誤判定する競合を修正 0.97.11

- 利用者が0.97.10でAppletの連続切替と設定連続変更の保存エラー解消を確認した。一方、アクセントカラーを続けて変えると、設定画面の赤いエラーと`dock:settingsPage:act: 同じ設定が別の場所で変わりました`が時々発生した。
- 修正前のSettingsViewClientで、先行入力を表示した画面の操作ハンドラーを保持し、その保存でキューが空になった後に同じ項目を変更すると、報告と同じ競合を再現した。キューの成功履歴は完了時に解放する一方、画面の比較基準は直前の保存前のまま残っていた。`.artifacts/settings-input-race-09711-20261027/baseline-unit.log`へ失敗を記録した。実画面の120回の混合間隔クリックだけでは、修正前0.97.10でも再現しなかったため、遅延条件を固定した単体の再現と区別する。
- 先行入力と画面ハンドラーで比較基準の参照を共有し、自分の保存成功時に送信した変更だけを反映するよう修正した。画面の再描画前に次の操作が届いても、直前の自分の保存とは競合しない。表示値と比較基準は分け、保存で統合した外部の未編集値は取り込まない。同一項目への外部更新、失敗入力、古いsession/保存先の検査、配列比較、設定の原子的保存は維持する。成功履歴をキュー完了後も蓄積する方式にはせず、設定項目・保存ファイル・公開API/transport契約は変更していない。
- 型検査と関連8ファイル78/78件（fail/cancel/skip 0）が成功した。遅延した画面ハンドラーによる60回の色変更、保存後の同一項目外部変更の拒否、別項目の外部変更保持、JSONの連続/交互入力、失敗値の修正、タッチパッドの拒否入力回収を含む。発行前に入力基準の寿命、成功/失敗/外部更新との境界、追加コピー/長期履歴の有無、既存画面と保存契約をレビューし、未解決指摘なし。0.97.10の監視worker/保存処理と0.97.9の周期通知抑制は変更していない。
- `publish.bat`終了0、`A:/40.ARTIFACT/AppDock.at365/win-unpacked`へ0.97.11を発行した。固定EXEの隔離GUIではアクセント120回の変更で一時画面エラー/設定actionエラー0、最後の色の実プロセス再起動後の保持が成功した。文字/JSON/数値/IME/ダイアログ入力9群、共有設定/名簿/素材同期11群、smokeも成功した。実KAGUYAの連続操作と物理IME/入力は今回実測していない。
- EXE SHA256=`a7195e1b26c7d1b47c85a49b309d34c962a055ffcf333ce6a3bfc37ae8990aca`、app.asar=`be4940d0b1dc873b50df20aa8ede025cff191e6e2842c8bc3a1216218ee54977`、update.zip=270663856 bytes/SHA256 `57d6d9735bf7b9b61b55e626f5d4e9ca2e900531de03efe6017d794b9efd2efd`。管理694ファイルのstaging/発行先/ZIP、feedの版/size/hash、固定試験コピー、ASAR内renderer8ファイルと監視workerのビルド一致を確認した。検証前後の871入力も一致した（本記録の追記を除く）。
- 証跡は`.artifacts/settings-input-race-09711-20261027/`のbefore/after入力一覧、baseline、runtime-review.diff/review.json、regression/typecheck/publish、GUI結果参照、artifacts/package-check/validation。固定Node 24.22.1/pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.403で検証した。直近GUIと比較基準、過去の検証から参照する出力を保護し、今回の追加削除なし。実利用先deploy、commit/push/Releaseは実施していない。

## 2026-10-27: Appletの連続切り替え時に発生する設定保存EPERMを修正 0.97.10

- 利用者が0.97.9でプチフリーズとCPU使用率の大幅な改善を確認した。その後、Appletの有効/無効を続けて切り替えると、端末設定の一時ファイルから`settings-KAGUYA.json`へのrenameがEPERMになり、save-failed通知が一時的に出ると報告した。
- LUNA上の隔離ファイルで、Node 24.22.1の非同期readFileと同期atomicWriteの重なりを再現した。ファイルを閉じた状態の置換は成功し、読取handleを保持した状態と、100回の非同期readFileとの重なりはすべてEPERMになった。同期保存の再試行がメインループを止める間、同じループに依存する非同期読取のcloseも進まなかった。空き容量や権限不足だけを原因とするログではなかった。再現元は`.artifacts/settings-save-race-09710-20261027/probe-result.json`。
- 監視の内容読取を、全監視で共有する遅延起動のworkerへ委譲した。worker内でopen/read/closeを完結させ、保存中もhandleを解放する。開いたファイルと読取中の増大へ4MiB上限を適用し、エラーとworker終了は未完了要求へ返し、次回確認で再作成する。待機workerは終了を妨げない。60秒のメタデータ確認、5分の内容照合、安定bytes/古い結果の破棄、150ms以内の既存置換再試行、revision/期待bytes/ジャーナルの保護、実際の保存失敗通知は維持した。設定項目・保存ファイル・Applet契約の追加/削除はない。
- 型検査と関連10ファイル91/91件（fail/cancel/skip 0）が成功した。実ファイルのworker読取/保存100回、両監視中の端末設定切替100回、UTF-8/空/4MiB上限、worker異常/再作成、本当のWindows読取lockでの失敗保持と解放後の回復、再試行中の外部編集保護を含む。固定EXEでは実設定画面の切替60回の全保存と一時エラー0を確認し、起動内訳等と合わせ10群、同期11群、復旧7群、smokeが成功した。idleは2秒周期の同値通知3回に対して全体更新0/全設定コピー0、391フレーム・最大間隔16.8msだった。0.97.9の通知/タッチパッド/startup計測の製品コードは変更していない。
- 発行前レビューで、同期保存と監視handleの寿命、共有workerの終了/要求対応、サイズ上限、変更競合と既存保存形式、必要試験を確認し、未解決指摘なし。`publish.bat`終了0、`A:/40.ARTIFACT/AppDock.at365/win-unpacked`へ0.97.10を発行した。EXE SHA256=`264638ec937f42128999357548ddab0df87b02c396fba4aa93edd438ed9497f8`、app.asar=`31bb58b41920c06a3c5ef6cbfb30bc3fbf7e3152a1b88e85b5f3d43abae397ef`、update.zip=270663079 bytes/SHA256 `ecaabd6b3ab95390bf9b82b9c8555f68b1ac9bd18b3f939facf5abeb0cc36709`。管理694ファイルをstaging/発行先/ZIPで一致確認し、feedの版/size/hashと固定試験コピーのhashを照合した。検証前後の870入力は一致した（本記録の追記を除く）。
- 証跡は`.artifacts/settings-save-race-09710-20261027/`の入力一覧・review・regression/typecheck/publish・gui-status・artifactsと各GUI結果。固定Node 24.22.1/pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.403を使用した。今回作成したGUI5種は各直近3回が残り、比較基準・固定出力・既存証跡も保持するため追加削除なし。実KAGUYA上の連打、同期サービスや他プロセスの長時間lockは未確認。実設定の書き換えや実利用先deploy、commit/push/Releaseは実施していない。

## 2026-10-27: 設定サイズによる負荷と周期的な全体更新を削減し、起動区間を表示 0.97.9

- 提供画像ではsettings.jsonが34KBの構成で、多くのAppletの起動時間が2KBの構成より約100ms長かった。起動のactivateへはメモリー上の当該Applet設定だけを渡しており、Appletごとの全ファイル読取ではなかった。設定画面の全設定コピーと、周期処理からの全体更新を調査した。画像の数値は`.artifacts/settings-startup-0978-20261027/reported-observation.json`へ利用者の観測値として記録し、合成データの測定と区別した。
- 設定・共有名簿の監視はfs.watchを主経路にし、読取とstatを非同期化した。補助は指定された60秒ごとの識別情報/サイズ/更新日時/変更日時の確認とし、同じなら内容を読まない。通知とメタデータの両方で検出できない更新に備え5分ごとの内容照合を残す。イベント時の読取、180ms以上離した同一bytesの確認、4MiB上限、終了/更新中の古い読取の破棄を維持した。保存直前のファイル/revision再照合は監視間隔と独立して残した。未作成の親は既存祖先を監視し、監視APIが使えない場合も安定候補をリセットし続けず補助確認で動作する。
- SettingsInputSessionのmetadata、カタログとページ投影、設定ページの補助情報を全体snapshotから分離した。全体snapshotと公開するページ値の変更分離は維持した。同じ8個の模擬Node Appletを各3回再起動した診断では、全設定コピーは各サイズとも534回から156回へ減った。0.97.5と0.97.8の固定配布物で2KiB/34KiBの内容をpaddingだけ変えた場合、約100msの差は再現せず、実設定の内容差と実Appletの性能は未確認とした。
- 起動時間セルのnative tooltipに、開始準備/プロセス起動要求/接続・初期化の応答待ち/登録内容確認を表示した。区間は単調時計で連続して測り、合計を従来の全体時間へ一致させる。失敗は到達区間まで、再起動は新しい計測へ置換し、停止後も直近結果を保持する。snapshotの区間配列も変更分離した。応答待ちにはOS/runtimeの立上がり、Applet初期化、通信、本体処理待ちが含まれ、Applet内部の実行時間だけとは扱わない。区間情報は保存せず、Applet側のRPC/SDKは変更しない。利用者は0.97.8で応答待ちが大半であることを確認した。
- 続いて、0.97.8でも自動スクロールが約2秒周期で止まり、Gmailを無効にしても同周期が残るとの報告を受けた。Gmailの2秒tickが同じtray.attention値を送っても本体が毎回manager変更を通知し、有効なTouchpadBridgeも同じ状態を2秒ごとにpublishしていた。attentionはbooleanが変わる場合だけコマンド/全体更新へ進め、TouchpadBridgeは有効状態・接続状態・busy・操作IDが同じなら警告と画面通知を省く。タッチパッドの読取と実際の競合/復旧の通知は維持した。実利用のGmail有効状態やWindows設定は操作していない。
- 固定0.97.8の隔離再現では、同一attention要求3回で全体更新3回・全設定コピー9回だった。固定0.97.9では同じ3回を処理しても全体更新0回・全設定コピー0回となった。34KiB設定で自動スクロールし、各6.5秒/391フレームを記録した。両方の最大フレーム間隔は16.8msであり、この軽いfixtureで実環境のフリーズ自体を再現したという意味ではない。タッチパッドは模擬APIで同一状態でもWindows読取が続き、通知が増えず、競合/復旧で通知することを確認した。Pause/F13〜F24の実送信・実登録は行わない。
- 発行前の差分/影響レビューで、保存・権限・世代・警告・区間合計と変更分離を確認し、発行阻害の指摘なし。監視API未対応時の候補リセットを修正して回帰を追加した。同期GUIの旧label参照がMCP説明ボタンにも一致する問題と、静的PNGのIDAT CRC不正は試験側を修正し、正常なCanvas PNGで検査条件を維持して再検証した。保存設定/保存ファイルの追加削除・破壊的変更はなく、各ローカル発行でパッチを進め、最終版を0.97.9とした。
- 固定Node 24.22.1/pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.403を使用し、固定lockfileと供給網検査を維持した。最終版の型検査、本体/Default Shell build、関連23ファイルの単体182/182件（fail/cancel/skip 0）、固定配布物の起動/tooltip9群・共有設定/名簿/素材同期11群・入力9群・復旧/再起動7群、idle重複通知抑制とsmokeが成功した。実Google認証/受信、実同期サービス、実タッチパッド操作、実環境の全Applet起動時間とフリーズ解消は今回の試験では確認していない。
- publish.bat exit 0。標準発行先は`A:\40.ARTIFACT\AppDock.at365\win-unpacked\AppDock.at365.exe`。EXE SHA256は`36f680b7661912933b71a19dfd3614394166f246c2a8f6d26ce43bcdeb28d813`、update.zip sizeは270662028、SHA256は`17e468f3406462ba213bef243f2c28729657372ecbd61fe39ffeabfd2d337ad4`。manifest/feedの0.97.9、staging/配布フォルダー/ZIPの管理694ファイルのSHA256一致と、検証前後866入力の一致を確認した。Appletsの再発行・全体ZIP作成・commit/push/Release・実利用先deployは行わない。
- 最終記録は`.artifacts/settings-startup-0979-20261027/{validation,review,artifacts,environment,cleanup,inputs-before,inputs-after}.json`と完全ログ。旧/新idleは`settings-idle-update-1793053063141/`・`settings-idle-update-1793053388147/`、起動サイズ比較は`settings-startup-performance-1793050736281/`・`settings-startup-performance-1793052184529/`、固定GUIは同validationから参照する。今回の解決済みfixture準備失敗7フォルダーだけ、結果JSON保管・プロセス終了・絶対パス/再解析ポイントなしを確認して整理した。最新成功分、比較基準、固定出力、既存の検証/再利用資料と他作業は保持した。

## 2026-10-27: フォルダー型をmainへ反映し通常版0.97.5を確認

- 利用者のmain反映指示により、準備済み138項目を`ff286da52a2c5c2921334f41eb8f0a5529f29d3c`（tree `6c69c92b25cde38861e9f4ec5b02e9fa5992e0de`）へコミットし、cleanなprimary mainへfast-forwardした。stage tree/commit tree、Git設定のauthor/committerとの一致を確認した。元の`codex/folder-portable`も同commitでcleanな状態を保持する。
- 試験版の865入力・完全ログ・配布EXE/ZIP・reviewを再照合し、標準**1,166/1,166件**と試験版固定GUI101群等の成功を再利用した。不足分として試験用worktreeで開発版の更新進捗9群、固定版トレイ7群・Windows自動起動5群を追加して成功した。専用Taskは解除済み。mainへのcheckoutは525入力がbyte一致、340入力が改行だけの差だった。生成済みmainコード228ファイルも224件がbyte一致、残る4件は改行だけで内容一致した。rendererのhash付きasset名を含む全outの初回照合は非同一となったため、コンパイル照合をmainコードに限定し、rendererは新しい固定EXEのGUIで再確認した。
- 製品の追加修正を伴わない通常発行として**0.97.5**を維持し、primaryの`publish.bat`を実行した。発行先は`A:\40.ARTIFACT\AppDock.at365\win-unpacked\AppDock.at365.exe`。EXE/File/ProductVersion・manifest/feedは0.97.5で整合し、EXE size **249797632**、SHA256 **23092070f3db415f9780fa122c550eebf247f2092a4a3c51955ef8081aed92ac**。`update.zip` size **270659690**、SHA256 **d3b62b8cdaf6e1ce093dc3d5c23adc9217819c5804c05882461a702f967f5797**。ビルド元・通常発行先・更新ZIPの本体管理**694ファイル**はすべてSHA256一致した。試験用発行先のEXEとは生成場所/コミット情報が異なるためhashを区別する。
- 通常版に収録したInputHost DLL（SHA256 **d6c93dfbaf16d70e3f74bd517f0cb1767c5666ee76258567db58a98d865d0eda**）そのもので、OSへキー送信・登録をしないnative状態**255項目**・マウス＋キー状態**58項目**を再実行した。固定EXEではMCP設定60群、起動順/トレイ/復元19群、更新/再起動/ASAR後片付け14群、更新進捗9群、計測/空一覧8群の計**110群**と、`APPDOCK`見出し・smokeが成功した。Pause/F13〜F24はOSへ送信・登録しない。
- 初回の旧単一EXE版からは、旧更新器が本体に`format=exe`を要求するためフォルダー型の`format=zip`へ自動更新できない。完全終了後、同じ配置先へ新しい本体一式を手動配置し、settings/data/extensionsと配置パスを維持する。その後はフォルダー型の通常更新を使う。発行先に残る旧単一EXE、既存deploy.bat/scripts/deploy.ps1/deploy.local.txt、旧全体ZIPの計5ファイルはhashを保持した。既存deployは旧EXEだけを配置する内容なので、初回には新しい`win-unpacked`の中身一式を使う。実利用先への配置は行っていない。
- 証跡の正本はprimary `.artifacts/commit-validation-folder-portable-0975-20261027/`のstage/merge/reuse・compiled-runtime-reuse・artifact・各完全ログ・validation。試験用worktreeの同名フォルダーとmain-merge-prepにも元ログ・入力を保持する。mainで追加した各方式は今回1回、ほかの作業の旧profileは再利用/保護状態を断定せず保持して削除0件。試験用worktreeの追加3方式も成功3回以内で削除0件。検証専用プロセスは終了済み。
- この追記は検証記録だけとして別commitにし、製品を再build/版更新しない。通常版と試験版の両worktreeを保持する。push・Release・実利用deploy、新しい実アカウント/実Windowsサインイン/UACの確認は未実施。

## 2026-10-27: フォルダー型0.97.5をmainへ反映するコミット検証

- 利用者のmain反映指示を受け、primary mainのcleanと`pull --ff-only`による最新一致を確認した。対象は準備済み138項目のみ。製品コード・版・依存の追加変更は行わず0.97.5を維持する。
- `.artifacts/main-merge-prep-0975-20261027/validation.json`・865入力・完全ログ・review・試験EXE/ZIPのSHA256を再照合した。標準1,166件、native状態313項目、固定GUI101群、smoke/実ASAR/APPDOCK見出しの成功を再利用する。起動順変更後の不足範囲として、更新進捗の開発GUI9群・固定版トレイ7群・Windows自動起動5群を追加し成功した。検証専用Taskの登録/実行/解除、同時起動・再起動・異常終了、設定保持を確認した。
- 単一EXE版の本体更新は`payload.format=exe`を要求するため、新しい`format=zip`は適用できず、初回は終了後に同じ配置先へ本体一式を手動配置する。配置ルートとsettings/data/extensionsを維持し、切り替え後はフォルダー型の自己更新を使う。通常の発行先の既存deployスクリプトは単一EXE配置の旧内容で、運用者所有として保持されることも確認し、配布仕様へ追記した。
- コミット対象/検証再利用の正本は試験用worktree `.artifacts/commit-validation-folder-portable-0975-20261027/`。stage tree・commit・main反映・通常発行先での検証はprimaryの同名フォルダーへ記録する。保存設定や実利用先の変更・push・Releaseは今回の範囲に含めない。

## 2026-10-27: 最新mainを取り込みマージ準備・見出しを修正 0.97.5

- 利用者が0.97.4で更新エラーが出なくなったことを確認した。最新mainの取り込みとmainへマージする準備、`settings.index.hostHeading`の`APPPDOCK`→`APPDOCK`修正を行った。保存設定・保存ファイル・公開プロトコルを変えない通常修正として、確認用を**0.97.4→0.97.5**へパッチ更新した。
- `codex/folder-portable`の未commit差分137項目を、rawファイル・hash・binary patch付きで`.artifacts/main-merge-prep-0975-20261027/`へ保存した。originをfetchし、MCP名簿/shortcut-list/画像グループとロックキー対応の6コミット・46ファイルを含むローカルmain `86acd2714d9776bc9d479cd782506eca6e34e688`へfast-forwardした。一時stashを再適用し、競合したpackage.jsonはフォルダー配布設定、本記録は双方の履歴を保持した。重なった残り4ファイルのMCP接続・試験・翻訳も照合し、重なりのない移行131項目はbyte単位で保持、行末だけ変わった15ファイルも元のbytesへ戻した。検証後に所有する一時stashだけを整理し、backupを保持した。
- 確認中にmainへ追加された検証記録だけの`e976d2beae0a743201febdd6732f19d2a693eaca`も取り込んだ。この再取り込みは既知baseのVERIFICATIONだけを一時復元してfast-forwardし、準備済みの結合内容を戻した。ほか864入力はhash一致、stash/reset/新規commitなし。終了前の再fetchでもHEAD/mainはe976d2b、origin/mainはe1906cbで、mainのローカル2コミットを保持している。発行時HEADは86acd27、後続の製品コード変更はない。
- 見出しは既存キーの値だけを変更し、残る辞書は双方の変更を結合した期待値と全項目一致した。mainで増えたnative記録GUIの固定版コピーを共通`copyHost`へ接続し、フォルダー一式で検証できるようにした。発行前レビュー1回で両方の実装・保存互換・起動順・更新・共通設定の維持を確認し、阻害指摘なし。発行後はASAR試験の標準出力/エラーを専用ログへ採取する変更だけを加え、判定条件・製品コード・配布物を変えずに再確認した。
- 固定Node24.22.1/pnpm12.10.1、独立node_modulesでfrozen install・型検査・本体/Default Shell/.NET/helper build・全CJS構文検査・差分検査が成功。lockfile・依存・供給網ポリシーは変更しない。標準回帰は**1,166/1,166件（fail/cancel/skip 0）**、発行InputHost DLLそのものでOSへキーを送らないnative状態**255項目**・マウス＋キー状態**58項目**が成功した。Pause/F13〜F24のOS送信・登録は行わない。
- 固定配布EXEでMCP設定**60群**、Shell先行/トレイ/復元の起動順**19群**、起動計測/空一覧**8群**、更新/再起動/ASAR後片付け**14群**の計**101群**と、隔離smoke・実ASARのステージング/取消/削除・未公開404のinfoを確認した。見出しは`settings-host-heading`の実画面で`APPDOCK`を確認し、`settings-index.png`を保存・目視確認した。全固定試験のEXEを発行元とhash照合した。
- 初回標準試験の.NETページ1件はframework-dependent ExtensionHostの生成不足を補って再実行した。入力試験の初回はモード指定不足でhelper接続前に停止し、明示的な`--lock-keys`/`--gesture-key-state`へ直して成功した。更新GUIの外部マウスジェスチャー待ち1回は、同じソース/EXEで再実行して14群成功。ASAR補助試験はstdio破棄時の接続/終了待ち2回を保持し、診断採取を追加した専用コピーと本来の試験で各1回成功した。これらの待機の根本原因は断定せず、初期ログと失敗profileを保持する。製品の検査・期待値は緩めていない。
- `publish.bat`成功（exit 0）。発行先`A:\40.ARTIFACT\AppDock.at365-folder-portable\win-unpacked\AppDock.at365.exe`、EXE size **249797632**、SHA256 **09e4ea01b9f04941bdfeeb4b744b30c85c42f2ce5b3bb5cddcd1f3196190baa8**。`update.zip` size **270659973**、SHA256 **56e90435db7fdad18fcdcd5f9bc71235ccff63acaa3b650f1b2b6f29e6125d6a**。EXE/File/ProductVersion・manifest/feedは0.97.5で整合し、ビルド元・発行先・更新ZIPの管理**694ファイル**がすべてSHA256一致。試験InputHost DLLはSHA256 **325177e1288992db0a5a825a187ea0160323a6335676e6f9d7cced9f7d1cc6b5**。
- 完全ログ・初期/検証時/最終入力・review・統合/再取り込み・配布hash・最終結果は`.artifacts/main-merge-prep-0975-20261027/`。固定MCPは`mcp-settings-foundation-portable-1793046758437/`、起動順は`startup-order-ui-1793046839917/`、計測は`applet-startup-ui-1793046867823/`、更新成功は`portable-updates-1793047038419/`、ASAR成功は`update-filesystem-1793047426246/`、smokeは`smoke-1793047431324/`。配布後のソース差分は本記録と製品へ同梱しない試験の診断採取だけ。
- 終了・成功・結果の保存hash・絶対パス・再解析ポイントなしを確認し、古い成功smoke/更新の各1フォルダーだけを整理した。各方式の最新3成功、初期失敗・移行/同期の証跡・固定出力・backupを保持する。準備した差分は未commitで、index/unmergedは空。main本体worktreeと他worktreeは変更せず、この差分のcommit/main反映・push・Release・実利用deployは未実施。実利用Applet全件の再計測・実Windowsサインイン/UACも今回の対象外。

## 2026-10-27: 未公開Releaseの404とASAR一時領域削除を修正 0.97.4

- 利用者が0.97.3で本体ウィンドウがすぐ表示されることを確認した。続いて、同版再適用OFFで`UPDATE_OPERATION_FAILED`、Watchの更新元はReleaseがまだなくHTTP 404、再起動後に`payload-0/resources/app.asar`のEBUSY警告が出るとの報告を受けて調査した。404の全体エラーと、前の更新後の一時領域削除警告は別の経路だった。
- GitHubの最新公開Releaseを読み取り確認した。以前の利用者の一覧と比較すると、Gmailは導入/公開とも0.12.1、WallpaperSlideshowは導入0.7.3/公開0.7.2、WebAppletは0.4.1/0.3.1、WebBrowserToolsは0.3.5/0.3.4、WindowsToolsは0.2.7/0.2.2。Gmailだけが同版再適用対象になる状況と整合する。古い版へ戻さない既存仕様は維持する。公開情報は`.artifacts/update-recovery-validation/public-releases.json`。WatchのRelease未公開は利用者申告。新しいReleaseの公開やAppletの更新元設定変更は行わない。
- GitHub `releases/latest`の404だけを`unpublished`へ分類した。未公開は確認時にエラー通知せず、適用時はスキップし、同版OFFで残りがすべて現行版なら更新なしの情報通知で終える。403/503、明示タグの404、配布済みfeed/assetの404、不正な内容等は従来どおりエラーとする。未公開対象を更新済みとして数えない。
- Electron 45.0.0で実ASARの専用コピーを削除して再現した。通常fsはASARを仮想ディレクトリと扱い、事前に開かない条件でもrmがEBUSY/rmdirになる。`original-fs`だけを使う新規コピーは物理ファイルとして削除できた。通常fsで開いた後はキャッシュが解放されるまでrawのunlinkもロックされるため、更新パッケージのコピー・読み取り・ハッシュ・削除を一貫して物理fsへ接続した。再起動後の削除も同じAPIにし、既存のTEMP名/親パス/symlink/journal確認を保持し、有限の3回/100msの再試行後も失敗なら警告を残す。通常のASAR読取やグローバル設定を変更しない。
- 発行前レビュー1回で404の判定範囲、真正エラー・取消・同版/旧版判定の保持、fsの適用範囲、パス/リンク/容量/hash/transactionの既存検証と一時領域の寿命を確認し、未解決指摘なし。変更前850入力のうち今回の9項目以外の843ファイルがhash一致し、既存のフォルダー配布・Shell先行・起動計測・空一覧を保持した。保存設定・保存ファイル・Applet実行RPCの変更がない修正としてパッチ**0.97.3→0.97.4**に更新した。発行後は本記録だけを変更した。
- 固定Node 24.22.1/pnpm 12.10.1と独立node_modulesで`install --frozen-lockfile`を再照合し、依存/lockfile/toolchainを変更しない。型検査、本体/Default Shell build、差分検査、共通更新・フォルダー本体・結果通知・起動時更新の関連**4ファイル45/45件（fail/cancel/skip 0）**が成功した。未公開+現行版の同版OFF、ON時の同版だけの確認、通常の新版と未公開の混在、実際の失敗を維持するケースを含む。
- ソース版と固定配布版の実Electronで、実ASARを含むAppletのステージング・物理ファイル/hash・確認取消・一時領域削除・既存配置保持と、未公開404の`unpublished`/infoを確認した。固定版はapp.asar内の実製品moduleを呼び、実行コピーと発行EXEのhash一致を確認した。ASAR入力のsource/fixed用SHA256は各`update-filesystem-*/result.json`へ記録した。
- 固定EXEの更新/再起動GUI **14群**（従来13群+再起動後のASARを含む一時領域の消去/警告なし）とsmokeが成功した。同版再適用、まとめて/個別/本体更新、設定・認証・有効状態保持、リソース交換、startMinimized時の更新/通常再起動、設定カテゴリ/Appletページ復元、外部マウスジェスチャーを再確認した。Pause/F13〜F24は送信・登録しない。
- `publish.bat`成功（exit 0）。発行先`A:\40.ARTIFACT\AppDock.at365-folder-portable\win-unpacked\AppDock.at365.exe`。EXE size **249797632**、SHA256 **38bf7bcb543943ec0b8c27a6b956b5dbe75a9be8af8f4683ca343f6bdc8543b7**。`update.zip` size **270653231**、SHA256 **d256af653c1c4e2e3fe6e3104e1a5a7a126592dd7756ff15c74355236070baea**。manifest/feedの0.97.4とZIPのsize/hash、ビルド元・発行先・更新ZIPの管理694ファイルのSHA256一致を確認した。
- 旧ASAR再現、完全ログ、review、変更前/検証時/最終入力、成果物hash、最終結果は`.artifacts/update-investigation/`と`.artifacts/update-recovery-validation/`。実Electronのソース/固定試験は`update-filesystem-1793044409674/`と`update-filesystem-1793044654294/`、固定更新GUIは`portable-updates-1793044658979/`、smokeは`smoke-1793044736162/`。
- 古い成功smoke/更新の各1世代と、今回の不要なASAR再現コピー2フォルダーだけを、絶対パス・リンクなし・プロセス終了を確認して整理した。smoke旧結果は保護済み移行ログとの全項目一致を確認し、旧更新のresultを保存した。smoke/固定更新は直近3成功を保持し、診断JSON・既存の移行/同期/起動証跡・固定出力は保持する。全リポジトリ回帰、別worktree統合、commit/push/Release/実利用先deployは行わない。0.97.2の利用者一覧のWatch最大523msは過去の実測として保持し、今回の実利用版の再計測・再確認は未実施。

## 2026-10-27: 選択Shellを先行し本体表示後に通常Appletを起動 0.97.3

- `codex/folder-portable`（HEAD/main取込元`7531fa4`）の移行・起動計測・空一覧を保持して実装した。既存の`capabilities: ["shell"]`・`shell`宣言と領域別の選択設定を使用し、Default Shellと選択中の有効な提供元を先行する。本体の標準本文とタイトルバー・リボン・ステータスバーのreadyを確認してから本体を表示し、残りのAppletを従来の順で起動する。未選択Shellは後続、safe-shellではDefault Shellだけを先行し、保存順・並列化・Applet固有処理は変更しない。
- `uiReady`を本文/Shellの準備に使用し、既存の`startupReady`は通常Appletの初期起動・開始予約後まで維持する。初期設定の補完・Applet自己設定の保存・再起動・activate-on-executeも同じ起動許可で制御し、別経路から通常Appletが表示前に開始されないことを確認した。Aboutの自動確認等は準備完了まで待つ。起動中に終了した場合は後続workerを開始しない。
- トレイ起動の非表示、起動中に隠した本体を完了時に再表示しない挙動、設定カテゴリとAppletページの復元を保持した。Applet復元は待機表示の後、startupReadyと提供元runningを待って開く。選択Shellの失敗時はDefault Shellへ戻り、起動遅延5秒のShellは待機中にDefault Shellで表示してから切り替わる。準備確認は最大30秒で打ち切るが、GUI試験では打切りログがないことを確認した。
- 発行前レビュー1回で、選別・設定保存からの再入・frame/URL限定IPC・renderer再読込・終了・遅延/故障・復元・後続表示の抑止を確認した。完了後もShell状態を照会し続ける点を修正し、追加単体試験とGUIで再確認、未解決指摘なし。変更前847入力のうち今回の16項目以外の834ファイルはhash一致。発行後は本文の準備完了の定義、Shell文書のフォルダー同梱表記と本記録だけを変更した。
- 固定Node 24.22.1/pnpm 12.10.1を`dev.bat`経由で使用し、独立node_modulesへ`install --frozen-lockfile`を再照合した。lockfile・依存・toolchainを変更しない。型検査、本体/Default Shell build、差分検査、起動順・計測・世代・既定有効・Shell/境界・本体ページ・設定ページ/移動・遅延/更新の関連**11ファイル59/59件（fail/cancel/skip 0）**が成功。保存項目/保存ファイル/実行プロトコルを追加・変更しない内部の起動制御なので、通常パッチ**0.97.2→0.97.3**とした。
- ソース版は起動順19群と計測/空一覧8群が成功。固定配布EXEは、同じ起動順19群・計測/空一覧8群・更新/再起動13群の計**40群**とsmokeに成功した。選択Shellのactivate中に設定保存を発生させた段階では本体非表示かつ通常workerなし、本体表示時には通常Appletがまだactivate待機中であることを確認した。全体完了後の再表示抑止、トレイ起動、safe-shell、失敗復旧、遅延切替、更新後/通常再起動後のカテゴリ・Appletページ復元、同版再適用、外部マウスジェスチャーを確認した。Pause/F13〜F24は送信・登録しない。
- 初期本文のDOMと領域のboundProvider/readyに加え、固定EXEの別隔離profileで選択Shellのタイトルバー・リボン・ステータスバーそれぞれのDOM、正の寸法、ready/visible、各WebContentsからの直接PNGを確認した。親WindowのcapturePageだけではShell領域を確認したことにしない。直接PNGは`.artifacts/startup-order-validation/{titlebar,statusbar,ribbon}.png`、結果は`native-surfaces.json`。
- `publish.bat`成功（exit 0）。発行先`A:\40.ARTIFACT\AppDock.at365-folder-portable\win-unpacked\AppDock.at365.exe`。EXE size **249797632**、SHA256 **460f0e8ef1f016a0622c1607026ca15e4241a50de19bd085918b85f01187c40c**。`update.zip` size **270652988**、SHA256 **5a86fb7673349b81bd48db344ec8f7d6e3da0181b238936894362191ed248b68**。manifest/feedの0.97.3とZIPのsize/hashを確認し、ビルド元・発行先・更新ZIP内の管理694ファイルがすべてSHA256一致した。固定GUI2系統の実行コピーも発行EXEとhash一致。
- 完全ログ・review・変更前/検証時/最終入力hash・全配布ファイルhash・最終結果は`.artifacts/startup-order-validation/`。起動順のソース/固定出力は`.artifacts/startup-order-ui-1793041549546/`と`startup-order-ui-1793041802250/`、計測は`applet-startup-ui-1793041434357/`と`applet-startup-ui-1793041830942/`、更新は`portable-updates-1793042069386/`。GUI初期のfixture宣言不足・renderer復元先の保存待ち不足・safe-shellの表示直後の早過ぎる判定はfixtureを整えて解決し、診断結果を保持した。
- 古い成功smoke `smoke-1793033997069`だけを、絶対パス・成功結果・プロセス終了・再解析ポイントなしを確認して整理し、直近3世代を保持した。ほかの試験は実行方式ごとの成功3世代以内、現行証跡・旧移行/同期証跡・固定出力を保持する。実利用Watch/全Appletでの新しい表示順と体感、実Windowsサインインは利用者確認待ち。全リポジトリ回帰・別worktreeの統合・commit/push/Release/実利用先deployは行わない。

## 2026-10-27: Appletの起動時間と空一覧の表示 0.97.2

- `codex/folder-portable`（main `7531fa4`取込済み）の既存移行内容を保持して実装した。Applet管理に「起動時間」を追加し、Node/.NET/native共通の起動準備からactivate応答・登録検証までを単調時計で計測する。設定した起動遅延・キュー待ち・停止時間は除外する。起動中は計測中、未計測は「—」、失敗は失敗までの時間と起動失敗を表示する。再起動で直近値へ置き換え、停止後は保持し、本体終了時に破棄する。設定・履歴ファイル・起動順は変更しない。
- 管理対象0件と検索結果0件を、見出しと外枠が残る表内の全7列にまたがる案内へ変更した。AI一覧の空表示を`SettingsTableEmptyRow`へ共通化し、同じ余白と中央配置を使用する。設定ページへ渡す要約にも起動計測を含め、実画面の更新を確認した。
- 発行前レビュー1回で計測開始/終了、初回失敗・再試行、停止/後続クラッシュ、snapshot・設定ページ連携、保存非干渉、空表示の列数・折り返し・既存操作を確認し、未解決指摘なし。変更前の845入力と照合し、今回の13項目以外の834ファイルはhash一致。レビュー後は本文の「起動処理中」の表現と本記録のみを修正した。通常の診断表示と既存UIの修正で保存仕様の追加・削除がないためパッチを0.97.1→**0.97.2**へ更新した。
- 固定Node 24.22.1/pnpm 12.10.1を`dev.bat`経由で使用した。版更新に必要な`install --frozen-lockfile`再照合を独立node_modulesで行い、lockfile・toolchain・依存設定を変更しない。型検査、本体/Default Shell build、差分検査、関連**9ファイル48/48件（fail/cancel/skip 0）**に成功した。計測の成功・失敗・RPC完了前のプロセス障害・再試行・遅延除外・保存不変と、世代ガード/既定有効/Applet管理/AI/設定ページ/動的ページを確認した。
- GUIはソース版8群、発行済み固定EXEの隔離コピー8群を直列実行し、初回の秒表示・無効/開始待ちの未計測・失敗表示・再起動中と直近値・今すぐ開始・検索0件/解除・未導入0件・AI空表示・明暗/狭幅・保存に計測値が入らないことを確認した。固定版fixtureの計測は約1269 ms→再起動約2080 ms、遅延60秒の今すぐ開始は約180 ms。これは検証用Appletの測定であり、実利用Appletの速度評価ではない。固定EXEのsmokeも成功した。
- `publish.bat`成功（exit 0）。発行先は`A:\40.ARTIFACT\AppDock.at365-folder-portable\win-unpacked\AppDock.at365.exe`。EXE size **249797632**、SHA256 **605bacf99f150fc8af99b63744ac83a5fec0c8d90ab1204e9eda2a5341f3a3d3**。`update.zip` size **270652196**、SHA256 **fd2c4223f47962ad3b9347e89c71910c1a81007c85c1c580cc974c4b5498a8fb**。manifest/feedの0.97.2、ZIPのsize/hash、ビルド元・発行先・更新ZIP内の管理694ファイルのSHA256一致を確認した。
- 完全ログ、レビュー、変更前/検証時/最終入力hash、配布ファイルhash、結果JSONは`.artifacts/applet-startup-validation/`。GUIの結果とPNGは`.artifacts/applet-startup-ui-1793038322937/`（ソース）と`.artifacts/applet-startup-ui-1793038555406/`（固定版）。GUI初回の要約連携不足は修正後に成功し、再現資料を保持した。今回の試験フォルダーは実行方式ごとに成功分3件以下のため削除0件、過去の移行証跡も保持する。
- 起動/トレイ/更新方式は今回変更していない。0.97.1での利用者による1秒以内表示・トレイ再起動・同版更新の申告と前回の検証は前項を参照する。今回の全リポジトリ回帰、トレイ識別、Windowsサインイン実動作、実利用Applet全部の計測は実施していない。commit/push/Release/実利用先deployは行わない。

## 2026-10-27: フォルダー型worktreeへ最新mainを取り込み（ソース同期）

- 利用者の取り込み依頼に合わせて、cleanなprimary mainを`pull --ff-only`で確認し、最新`7531fa445bcfdc5c18cecf756664c208af5386ee`（登録画像のMCP設定対応、0.96.3）を`codex/folder-portable`へfast-forwardした。移行作業を新たにcommitすることなく、HEADを`dbd83eb`から更新した。
- 未commitの移行内容は差分・全対象ファイルのhash付きバックアップを作り、一時stash後に再適用。競合したpackage.jsonは移行版の0.97.1とフォルダー配布設定を保持し、VERIFICATIONは双方の履歴を保持した。自動統合された本体indexとMCP GUI fixtureは、mainの画像連携と移行版の起動先/コピー方法の両立を確認した。mainとの重複を除く移行110項目は元の内容と照合し、2ファイルの改行bytesも復元した。
- 型検査、本体/Default Shell build、登録画像・MCP設定/一覧/対象/ダイアログ・画像基盤・フォルダー本体更新・従来更新の関連**9ファイル105/105件、fail/cancel/skip 0**が成功。未追跡の移行4ファイルと削除2ファイルも保持し、unmerged/staged項目は残さない。
- 今回はソース同期のみで、版更新・再発行・push・Release・実利用deployは行わない。40.ARTIFACTの0.97.1は前項の移行時に検証した配布物のままで、今回のmain追加分を含む配布物ではない。次の実装/発行時に所定の版更新と発行物検証を行う。
- バックアップ・競合解消/保持照合・型検査/build/105件の完全ログ・最終状態は`.artifacts/main-sync-20261027-024603/`。一時stashは再適用と検証後に所有hashを確認して整理し、差分とファイルバックアップは保持する。

## 2026-10-27: フォルダー型ポータブルへの移行 0.97.1

- `dbd83eb`から専用worktree `AppDock.at365-folder-portable` / `codex/folder-portable`を作成。起動時に展開するランチャーを外し、配置先のElectron EXEを直接起動する方式へ移行した。設定・端末別設定・data・extensionsと、配置パスから決まるPC専用rootは維持する。Appletの起動順序・計測機能は今回変更しない。
- 本体一覧`appdock-host.json`とUpdaterの許可一覧で所有する本体項目を限定。EXE、resources/locales、DLL等の追加・交換・削除を既存のパッケージトランザクションへ接続し、終了確認・ハッシュ・リンク/範囲検証・中断復旧を保持した。更新結果には本体/Appletだけを数え、内部の本体資産をAppletとして数えない。
- 配布/更新契約の変更で0.97.0へマイナー更新し、発行・検証した。その後、実行用の発行フォルダーへビルダーを直接出力すると再発行で利用者データを消し得る点を修正し、規則に従って0.97.1へ更新。ビルドは`.artifacts/host-build`、発行は本体所有ファイルだけの配置とし、ZIPをクリーンな作業先から生成する。0.97.0→0.97.1の実再発行で確認ファイルの保持を検証し、確認ファイルだけを削除した。
- 発行前レビューと追加修正レビューは`.artifacts/folder-portable-validation/review.json`へ記録。本体一式が約630MBのため、展開済み本体の上限を1GiBへ分離。配布ZIPとAppletの上限は512MiB、ファイル数・SHA256・パス等の検査は維持する。通常publishは全体ZIP生成・未変更Appletの再発行を行わない。
- 型検査、本体/Default Shell/.NET/helperビルド成功。関連回帰は**94件（更新・パッケージ・配布62件、Windows起動・トレイ32件）、fail/skip 0**。32件は0.97.1の発行先分離に影響されないソース・試験・依存を照合して再利用。標準全回帰は今回一律には再実行していない。固定Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、builder 26.15.3を使用し、lockfile・依存検査を維持した。worktreeは独立node_modules、固定ツールだけjunctionで再利用した。
- 最終0.97.1の固定フォルダーでGUI **34群**成功。更新/再起動/復元13群、進捗・取消・再試行/ステータスバー9群、トレイ識別・同時起動・版変更・異常終了7群、自動起動の登録/実Task実行/再起動/解除5群。専用Windows Taskは解除済み。smokeも成功し、既存の設定・保存場所・fixtureのログイン情報の保持を確認した。
- 更新後のresourcesの完全交換と不要資産の除去もGUIで確認。GUI fixtureは本体一式を共通helperでコピーする。旧試験に残っていた補助Windowの配列番号参照、廃止されたApplet欄、共通設定の折りたたみ・既定のAbout自動確認を現UIへ合わせた。撮影は本体URLで対象を特定し、PNG寸法も検査。製品の画面・保存動作を試験のために変更していない。
- 最終helperで**8箇所の中断・復旧試験**成功。停止点は試験用コピーだけに追加した。独立した日本語/空白入りの配置fixtureで、旧EXEのみの配置からの移行、再配置、全694ファイルの照合、既存データ保持を確認。発行ZIPからの独立配置試験も、明示引数/UTF-8設定/引数優先/不正な配置先の4ケースで成功した。
- 発行先は`A:/40.ARTIFACT/AppDock.at365-folder-portable`。本体EXEは**249797632 bytes / SHA256 `9ce9f9047aea76350ba8a4773b167e8aae6e502c6a7601fc7d195f98caba2aca`**、update.zipは**270650767 bytes / SHA256 `8ec7c39b570979a696092df0c6121b8a6eed7b3e58e057489530dc4d42bd8a1f`**。feed・本体一覧・UIの版は0.97.1で整合。exe単体の配布は行わず、初回の旧形式からの切り替えは同じ既存配置先への手動配置とする。
- 利用者から、ウィンドウ表示が1秒以内、トレイ起動/トレイ再起動/同版更新が成功したとの報告を受けた。これは利用者の実環境での確認として記録し、自動計測の値と混同しない。実UAC承認・実Windowsサインイン・実アカウント/NAS・全Applet入り実ZIPは今回の試験対象外（全体ZIPはfixtureで検証）。起動時間の内訳と遅いAppletの特定は次の工程。
- 正本仕様は[フォルダー型配布](docs/portable-distribution.md)。完全ログ、成果物のhash、入力manifest、再利用判定、レビューと後片付けは`.artifacts/folder-portable-validation/`を参照する。commit・push・GitHub Release・実利用先deployは未実施。

## 2026-10-27: キー対応をmainへマージし通常版0.96.7を確認

- 利用者の指示により、準備済み20ファイルを`86acd2714d9776bc9d479cd782506eca6e34e688`（tree `30d4aeae7e1f88cc0b0882d97c2a5e78c130c573`）へコミットし、cleanなmainへfast-forwardで反映した。stage treeとcommit tree、author/committerと有効なGit設定の一致を確認した。対象外の変更・push・Release・実利用deployは含めていない。
- 準備時の856入力・完全ログ22件・試験版EXEをhash照合し、標準回帰1,141件・型検査・開発ホスト設定API58群の成功を再利用した。mainのcheckoutでは510入力がbyte一致、346入力はCRLF/LFだけの差で内容一致した。再生成した226ファイルも221件がbyte一致、残る5件は改行だけで正規化後のJavaScriptが一致し、製品の意味的な変更はない（`merge.json`・`compiled-runtime-reuse.json`）。
- 製品修正を伴わない通常版の再発行として**0.96.7**を維持し、mainの標準publishを実行した。通常版EXE/File/ProductVersion・feedは**0.96.7 / 170,718,857 bytes / SHA256 `566bf6107540f8f8fca97a67e54ce14001a36a950c0cf84fda273990c16f5adf`**。試験用worktreeのEXEとはビルド位置・コミット情報が異なるためhashを区別する。既存の設定・配置ファイル4件のhashを保持した。
- 通常版に収録したInputHost DLL（SHA256`c3fdca3d17c270c5f6993b2f5c4443313c36a1ee66cc031a12ac9fe2dae8beac`）そのものでnative状態**255項目**・マウス＋キー状態**58項目**を再実行して成功。OSへのキー送信・フック登録をしないメモリ試験を使用した。新しい通常版EXEでは隔離したnative記録**42/42件**、特殊キー選択・保存/ブロック設定・取消・実再起動後の登録**13群**、portable smokeが成功した。Pause/Break・F13〜F24をOSへ送信/ホットキー登録していない。
- 通常版の記録GUIは`.artifacts/shortcut-native-capture-ui-1793046335990/`、設定GUIは`.artifacts/command-triggers-ui-1793046384600/`、smokeは`.artifacts/smoke-1793046420051/`。各新規モードは今回1回、既存の別作業のsmokeは再利用・保護状態を断定できないため保持し、削除0件。検証専用プロセスは終了確認済み。Node24.22.1/pnpm12.10.1/Electron45.0.0/.NET SDK10.0.403、Windows x64。
- 証跡の正本はmain側`.artifacts/commit-validation-lock-keys-20261027/`のreuse/stage/commit/merge・artifact・各完全ログ・validation。今回の追記は検証記録だけの差分としてコミットし、製品を再build・版更新しない。旧試験worktreeと実機ログを保持する。0.94.12での利用者確認と通常版の自動検証を区別し、複数起動時のデスクトップ不検出および3修飾KANAの未観測という既知の制約は変えていない。

## 2026-10-27: 0.96.7キー対応のmainマージに向けたコミット検証

- 利用者のmainマージ指示を受け、mainのcleanと`pull --ff-only`による最新一致を確認した。対象は準備済み20ファイルだけとし、設定・保存値・製品コードの追加修正は行わない。
- `.artifacts/merge-main-20261027/final-inputs.json`の856入力、完全ログ22件、試験版EXEのSHA256を照合して一致した。標準回帰1,141件・型検査・native255/マウス＋キー58項目・設定API58群・固定記録42件/保存再起動13群/smokeの成功は、対象コード・試験・依存・環境の一致に基づき再利用する。この追記は検証記録だけの差分として扱う。
- コミット対象とstage tree、author/committer、main反映結果は、通常版repoの`A:\30.PROJECT\AppDock.at365\.artifacts\commit-validation-lock-keys-20261027/`に記録する。通常版への反映に新しい製品修正は伴わないため0.96.7を維持し、main側の標準publishと新しい固定EXEの確認を行う。push・Release・実利用deployは今回の範囲に含めない。

## 2026-10-27: 最新mainを取り込みキージェスチャーのマージ準備 0.96.7

- 利用者の依頼によりoriginをfetchし、ローカルmainのコミット済み最新を試験用`codex/lock-keys`へ取り込んだ。開始時の`8ae24f2`から`1134e3c`へ進め、確認中に追加された画像グループ対応`e1906cbe324268cf7ab912efd7d2aaf4374eb8a3`も取り込んだ。終了前の再fetchでもHEAD/main/origin/mainが同コミットと一致することを確認した。main本体worktreeの進行中変更には手を加えていない。
- 未コミットのキー対応19ファイルを先に`.artifacts/merge-main-20261027/backup/`へ保全した。重なったのはpackage.jsonと本記録だけで、main側の既存位置への追記と試験側の記録を両方残し、受け入れ済みのキー対応17ファイルはbyte単位で保持した。Gitのbaseをcheckout-indexで正確に書き出し、対象2ファイルだけを一時的に既知baseへ戻してfast-forward後、準備済みの解決内容を適用した。stash・reset・新規commitは行っていない。再取り込み時の保全20ファイルと処理記録は`refresh-e1906cb/`に保持した。
- main 0.96.6を基準とする通常の互換対応として、統合版を**0.96.7**へパッチ更新した。キー対応に伴う設定項目・保存ファイル・公開APIの追加はない。MCPのshortcut-listは送信キー用の別文法を維持し、今回追加した捕捉キーがその文法を広げないことを`tests/settings-shortcut-lists.test.cjs`で確認した。トリガー側ではキー名を正規化でき、送信一覧のdryRun/実保存では従来どおり拒否されて保存も実行も起きない。既存ID・名称・入力文字列は書き換えない。
- 固定依存のfrozen install・型検査・標準`dev.bat test`が成功し、最新mainで**1,141/1,141件**（fail/cancel/skip 0）。開発ホストの設定MCP/GUIは画像グループ対応を含む**58群**が成功した。開発ホストでは起動設定が読み取り専用となる既存の試験経路を使い、実Windows起動登録の再検証は行っていない。前段1134e3cでの1,129件/54群は別ログへ保持し、最新mainの成功件数へ混在させていない。
- 初回標準試験の2失敗は、追加試験で送信一覧と捕捉キーの文法を混同した期待値、およびframework-dependentな.NET検証ホストの未生成だった。試験の前提を修正し、既存ExtensionHostをRelease buildしてから標準回帰を再実行して成功した。製品の送信文法や検査を緩めていない。統合手順の初回試行で検証記録の追記位置・base復元時の行末差を検出した記録も保持し、保全内容へ戻したことを確認後、正確なbase書き出しで取り込みを完了した。
- 発行前レビュー1回でmain統合・保存互換・送信/捕捉の境界・入力ブロック/所有状態・未確認範囲を確認し、阻害指摘なし。native関連29入力は旧試験版と一致したが、発行DLLにはmainのコミット情報`0.10.0+e1906cb...`が収録されhashが変わったため、過去DLLの試験をそのまま再利用せず、**発行されたDLLそのもの**でnative状態**255項目**・マウス＋キー状態**58項目**を再実行して成功した。OSへのPause/Break・F13〜F24送信/ホットキー登録は行っていない。
- 固定EXEでnative記録**42/42件**、特殊キー選択・保存・ブロック設定・取消・実再起動後の登録**13群**、隔離portable smokeが成功した。発行EXE/File/ProductVersion・feedは**0.96.7 / 170,706,835 bytes / SHA256 `9cc07a3334c170e2bfe91552c39f51b5e7dce6b9593f537f306bf68ff0119e58`**。収録/試験InputHost DLLはSHA256`331179bd45552922861b1104bb6cf0edf54ba63a4d1a234367b92490af7126b4`、全試験コピーと最終EXEも照合した。発行・試験前後の856入力が一致し、その後のソース側変更は本記録だけ。既存設定・診断v2 EXE・実機ログ11ファイルは発行前後のhash一致を確認した。
- 証跡は`.artifacts/merge-main-20261027/validation.json`・入力hash・各完全ログ・integration/review・native-hash-change/native-final。native記録GUIは`.artifacts/shortcut-native-capture-ui-1793044418709/`、設定GUIは`.artifacts/command-triggers-ui-1793044466522/`、smokeは`.artifacts/smoke-1793044503926/`、設定APIは`.artifacts/mcp-settings-foundation-source-1793043968565/`。Node24.22.1/pnpm12.10.1/Electron45.0.0/.NET SDK10.0.403、Windows x64。
- 成功最新3回を保持し、最古の0.94.10の設定GUI/smoke profile2件だけを終了・範囲・再解析ポイントなしを確認して整理した。結果JSONは元hashのまま`.artifacts/kana-keys-20261027/retired-command-triggers-ui-result.json`・`retired-smoke-result.json`へ保管し、`merge-main-20261027/cleanup.json`に記録した。native固定GUIは最新3回、開発版nativeと設定MCPは各2回、固定出力・保全・調査/失敗証跡は保持した。
- マージ準備の差分は未コミット。mainへの変更マージ・push・Release・実利用deployは行っていない。0.94.12での利用者確認と、統合版0.96.7の自動検証は分けて扱う。複数AppDock同時起動時のデスクトップ不検出と、Ctrl+Alt+Shift+KANAの本体イベントなしの制約は維持し、今回修正したとは扱わない。実機/IME/LEDや実Windows起動登録の新たな受け入れ確認は行っていない。

## 2026-10-27: 0.94.12の実機成功と複数起動時の発生条件を確認

- 利用者がCtrl+ScrollLock・Ctrl+Alt+NonConvertの動作成功を確認した。デスクトップで入力が拾われず元のキーが素通しになる現象は、別のAppDockを同時に起動していると発生し、その別個体を終了するとデスクトップの入力にも反応することを確認した。
- 今回の実機条件では、別AppDockとの同時起動が発生条件として切り分けられ、単一起動時のデスクトップでの動作成功を確認済みとする。別個体の版・設定・起動順と、内部のどの経路で干渉したかは未計測であり、フックの優先順位など特定の機構を原因と断定しない。元入力ブロックの全条件にわたる実効果を、この動作成功報告だけで確認済みとはしない。
- Ctrl+Alt+Shift+KANAは引き続き本体イベントの観測なし。前項の自動試験と今回の利用者確認は対象を分けて保持する。利用者確認の要点は`.artifacts/ime-chords-20261027/physical-acceptance.json`。
- 記録のみの更新。製品コード・版・発行物・設定・複数起動ポリシーは変更せず、文書差分と既存検証入力との照合を行った。製品回帰の再実行・再publish・commit/pushは行っていない。

## 2026-10-27: Ctrl+ScrollLock・Ctrl+Alt+NonConvertの派生コードに対応 0.94.12試験版

- 利用者が診断v2を実機で試し、診断アプリ前面なら前2組が記録され、デスクトップでは記録なし、Ctrl+Alt+Shift+KANAは反応なしと報告した。`key-probe-KAGUYA-20261027-040116-972.json`は30イベント。Ctrl+ScrollLockはVK03/scan46/非拡張の押下3件、Ctrl+Alt+NonConvertはVKF7/scan7B/非拡張の押下5件で、対応する解放も記録された。3修飾キーを押す区間は修飾キーだけで、KANA本体に相当するイベントなし。全イベントの前面は診断WinFormsであり、このログからデスクトップで届かない原因やCopilot起動経路は確定しない。原本SHA256`363d9c196c67a6850cc36d5f59caefff7dc5caf44a6e629d560ea9411ae222ed`、集計は`.artifacts/ime-chords-20261027/physical-input.json`。
- 共通`ShortcutCodec.CaptureKey`に、非拡張scan46のVK03をScrollLock、非拡張scan7BのVKF7をNonConvertへ揃える処理を追加した。修飾キー、既存の保存値、通常キーの長押し抑止・押下/解放の所有状態、条件・dispatcher・元入力ブロックを維持し、記録・通常実行・マウス＋キーで共通に使う。異なる位置、拡張されたBreak、通常文字への再割当は変換しない。新しい取得経路や、イベントが来ない組み合わせの代替発火は追加していない。
- 先にメモリ内回帰を追加して旧0.94.11 DLLの失敗を再現し、修正後に成功した（`native-before.log`・`regression-before.json`）。追加項目は物理位置/拡張の境界、修飾キー付き表示、block ON/OFFの実行・反復抑止・解放・再押下・記録、およびマウス＋キーの解放までの所有状態。OSへのキー送信やフック登録をせず、native状態**255項目**・マウス＋キー状態**58項目**が成功した。Break系入力はこのメモリ内検査だけで扱い、OSへPause/Break・F13〜F24を送信/ホットキー登録していない。
- 発行前レビュー1回で物理位置の限定・既存キーとの区別・共有捕捉/修飾/所有状態・保存互換・試験の安全性と実機未確認範囲を確認し、阻害指摘なし（`review.json`）。設定項目・保存ファイル・公開APIの追加を伴わない捕捉互換修正として、前回発行0.94.11から**0.94.12**へパッチ更新した。版更新直後のdev実行は依存照合がworkspace変更を検出して停止したため、固定依存のfrozen install後に実行して成功した。型検査、関連Node8ファイル**95/95件**（fail/cancel/skip 0）、書式検査・標準publish成功。
- 記録の恒久GUI回帰へCtrl+Alt+NonConvertのVK/物理位置送信を追加し、IME切り替え操作の前後・実クリック後の記録を開発版/固定EXEで**各42/42件**成功した。全件でnative通知・正しい表示・エラーなし・前面維持を確認し、42個の異なる記録tokenで再開始された。固定EXEでは特殊キー選択・保存・ブロック設定・取消・実再起動後の登録**13群**、隔離portable smokeも成功。native GUIは`.artifacts/shortcut-native-capture-ui-1793041919520/`、設定GUIは`.artifacts/command-triggers-ui-1793041980634/`、smokeは`.artifacts/smoke-1793042016438/`。
- 発行EXE/File/ProductVersion・feedは**0.94.12 / 170,704,865 bytes / SHA256 `dba3abb0a3ea2501e2b8a4dca343fb8139887ed5c648599a059aed9293244248`**。試験DLLと発行/収録InputHost DLLのSHA256`048b8a1babd5a6a3e1fc6db378999b8148c1dc43e130b74777f71154bf6f8b80`が一致し、固定試験コピーと最終EXEも照合した。発行/試験前後の803入力が一致し、その後のソース側変更は本記録だけ。設定・診断v2 EXE・既存実機ログの計10ファイルは発行直後にhash一致を確認。最終照合ではsettings.jsonだけ04:14:05に後続更新され、他9件は一致した。現設定に試験fixtureの割り当て/拡張は含まれず、更新元は断定せずに現内容を保持し、上書きしていない（`preserved-final.json`）。証跡は`.artifacts/ime-chords-20261027/validation.json`・各完全ログ・入力hash・review.json。固定ツールはNode24.22.1/pnpm12.10.1/Electron45.0.0/.NET SDK10.0.403、Windows x64。
- 設定GUI/smokeは成功最新3回を保持し、最古の0.94.9 profile2件だけを終了・範囲・再解析ポイントなしを確認して整理した。結果JSONは元hashのまま`.artifacts/ime-pulse-20261027/retired-command-triggers-ui-result.json`・`retired-smoke-result.json`へ保管し、`ime-chords-20261027/cleanup.json`へ記録した。native記録GUIは各実行方式2回、固定出力・診断・失敗/再現証跡は保持。
- 0.94.12の両組み合わせの物理的な記録・実行・入力抑止、特にデスクトップでの入力到達は利用者再確認待ち。Ctrl+Alt+Shift+KANAは今回も本体イベントを観測できておらず、現行の入力フックで捕捉できることを示す証拠がない。OSや他入力処理がイベントを出さない場合は、この変換追加では対応できない。IME/LEDへの実効果・無関係な全回帰は未検証、commit・merge・push・Release・実利用deployなし。

## 2026-10-27: 残る3組の見込み調査と複合キー診断v2

- 利用者が0.94.11で動作改善を確認した。残る報告はCtrl+ScrollLock・Ctrl+Alt+NonConvertの記録欄での非対応エラー、およびCtrl+Alt+Shift+KANAでCopilotが開く現象。3組とも旧診断でログが出なかった。新しいKAGUYAログ`key-probe-KAGUYA-20261027-035118-025.json`・`035231-776.json`は、いずれも対象イベント0件、上限未到達。旧診断は対象VK/scanのフィルター付きなので、これだけでフックに入力が届かないと断定しない。
- 現行の共通正規化と設定parserは`Ctrl+ScrollLock`・`Ctrl+Alt+NonConvert`・`Ctrl+Alt+Shift+KanaMode`の3組を受理する（`.artifacts/key-combinations-20261027/grammar-check.log`、OS送信なしのメモリ内検査）。組み合わせを禁止する設定文法の制限とは確認できなかった。
- [Microsoft日本語106キーの公式サンプル](https://github.com/microsoft/Windows-driver-samples/blob/main/input/layout/fe_kbds/jpn/106/kbd106.c)では、ScrollLock位置がKBDMULTIVK、Ctrl+Alt+NonConvertは`VK_DBE_ENTERWORDREGISTERMODE`、Ctrl+Alt+Shift+KANAは`KBDNLS_NOEVENT`の定義になっている。[Microsoftのデバッグ資料](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/debug-universal-drivers---step-by-step-lab--echo-kernel-mode-)にもBreakとScrollLockの関係がある。前2組は変換後コードの追加対応候補、3組目は現行フックへキーイベントが出ない可能性がある。実機の実コードとの一致、Copilotを起動した経路、他フックによる抑止は未確定とし、サンプル定義をそのまま当該PCの実測に読み替えない。
- 診断のみ更新。旧ソースと固定EXEは保持し、`.artifacts/key-combinations-20261027/probe-source/`から自己完結単一EXEを作成した。従来の対象キー/物理位置に加え、Break系VK03、IME派生F0〜FD、修飾キー、F13〜F24・Apps/起動用キーを受動記録する。文字キーやタイトル・本文は保存せず、入力を遮断しない。高位Fキーを診断に含めるのは観測だけであり、OSへの送信・ホットキー登録はしない。JSONのprobeVersionは2、画面タイトルは「AppDock キー診断 v2（複合キー）」。
- 診断差分のレビューで対象限定・文字入力の除外・全入力通過・記録上限・手動開始/停止・保存先を確認し、阻害指摘なし。build成功、フック登録/OS送信なしのself-testは48コード＋5位置＋5除外の**58条件成功**。初回の自己試験読取はGUI EXE終了前だったため、Start-ProcessのWaitで終了コード/結果を確認した。文法検査の初回引用符エラーと不完全な試験行のエラーは別ログへ保持し、正しい行による3件成功だけを採用した。
- `A:\40.ARTIFACT\AppDock.at365-lock-keys\AppDock.KeyProbe.exe`を更新。SHA256`3a78f07dd780fcf8ba24309387550bc301d360e516f8b4e36bb979fc36a6157b`。証跡は`.artifacts/key-combinations-20261027/probe-placement.json`・build/self-test・入力hash・文法確認ログ。本体EXE/feedは0.94.11のまま、本体・設定・既存実機ログの計10ファイルをhashで保持確認した。製品コード・版・キー割り当て・OS/IME/Copilot設定は変更していない。製品回帰の再実行・再publish・commit/pushは不要として行わず、固定出力・既存成功最新3回・調査/失敗証跡を保持し、削除0件。次はv2で3組の派生コードを実測し、捕捉・抑止方法を判断する。

## 2026-10-27: IMEキー記録の再クリックと補助入力を修正 0.94.11試験版

- 利用者が0.94.10でKANAの実行成功を確認した一方、設定画面ではCtrl/Win/Alt付きや単体KANA・Convertが前の表示のまま記録されない場合があり、Win/Alt付きで非対応キーのエラーが一瞬出ると報告した。IMEのON/OFF操作後にも発生するとの観測を受け、設定の記録経路を調査した。
- 旧固定EXEの実マウス再クリックでは、DOMのフォーカスが同じ記録欄に残っていても、nativeのマウスフックが記録を終了し、再開始されないことを確認した。30入力中native通知は3件、通知なし27件、表示不一致14件（`.artifacts/kana-capture-20261027/native-click-before.json`）。CDPだけのクリックでは30件とも成功しており、マウスフックを通る再クリックを試験へ追加する必要があった。nativeが停止するとDOM側のIME/繰り返し保護に依存するため、IMEキーで記録できたりできなかったりする状態になる。
- 共有`ShortcutCaptureField`の左pointer downで記録要求を更新し、フォーカスの変化がなくても新しいtokenでnative記録を開始し直す。旧tokenの取消・遅延応答の無効化、記録欄外のクリックによる取消、前面Windowの検査は維持した。再開始だけの中間修正ではnative通知36件が成功したが、18件で一瞬のエラーを再現した（`development-result.json`）。Win/Alt単独動作の抑止用にnativeが送るVK255・extraInfo`0x365B012`がDOMへ`Unidentified/keyCode255`として届き、非対応キー扱いされていたため、この補助入力を除外した。IME変換中/229、実際の非対応キー、保護キーの既存判定は維持する。
- 恒久回帰として`scripts/shortcut-native-capture-ui-test.cjs`を追加し、既存InputTarget fixtureへ対象Windowの前面確認付きのクリック・限定IMEキー送信を追加した。隔離した設定の記録欄で、IME切り替えキー操作の前後3段階、VK送信と物理位置scan送信の2経路、Ctrl/Win/Alt付きKANA（AltはF5/F6の両方）・単体KANA・Convertの6入力を検査する。実クリック後のnative通知、表示、エラーなし、前面維持と36個の異なる記録tokenを確認する。送信対象は限定したIMEキー/位置と修飾キーだけで、Pause/F13〜F24は送信・登録しない。実行例は`dev.bat exec node scripts/shortcut-native-capture-ui-test.cjs A:/40.ARTIFACT/AppDock.at365-lock-keys/AppDock.at365.exe`。
- 発行前レビュー1回で共有記録欄の寿命・取消・保存互換・入力保護・試験範囲を確認。試験用送信に前面Window検査を追加する指摘へ対応し、fixtureのbuildと最終固定EXE試験で再確認した。設定項目・保存ファイル・公開APIの追加を伴わないUI修正として、前回発行0.94.10から**0.94.11**へパッチ更新した。型検査・build・標準publish成功、関連Node10ファイル**102/102件**（fail/cancel/skip 0）。変更のないInputHost/Runtime・状態試験29入力と試験/収録DLLをhash照合し、0.94.10のnative状態**229項目**・マウス＋キー状態**50項目**の成功を再利用した（`native-reuse.json`）。
- 開発版と固定EXEで上記native記録**各36/36件・エラー0件**、固定EXEの特殊キー選択・保存・元入力ブロック設定・取消・実再起動後の登録**12群**と隔離portable smokeが成功した。nativeは`.artifacts/shortcut-native-capture-ui-1793039830133/`、設定GUIは`.artifacts/command-triggers-ui-1793039885444/`、smokeは`.artifacts/smoke-1793039932105/`。検証入力803ファイルは発行/試験前後で一致し、その後のソース側変更は本検証記録だけ。発行先のsettings.json・settings-KAGUYA.json・診断EXE・実機ログ4件の計7ファイルをhashで保持確認した。
- 発行EXE/File/ProductVersion・feedは**0.94.11 / 170,694,325 bytes / SHA256 `7930bb9443a18ec96cd8857e9679aa40b8f71668fd8224b07738163c8b069788`**。発行/収録InputHost DLLは前版と同じSHA256`d562598c4e58efc38df65e488e2c3afb01f88ca7018e932e6483df5d1a1ff181`。証跡は`.artifacts/kana-capture-20261027/validation.json`・入力hash・review.json・各完全ログ・修正前再現。診断スクリプトの起動待ち/hover/座標取得を修正する途中の失敗ログは保持し、製品の成功結果へ数えていない。Node24.22.1/pnpm12.10.1/Electron45.0.0/.NET SDK10.0.403、Windows x64で検証した。
- 成功最新3回を保持し、最古の0.94.8の設定GUI/smoke profile2件だけを終了・範囲・再解析ポイントなしを確認して整理した。結果JSONは元hashのまま`.artifacts/ime-keys-20261026/retired-command-triggers-ui-result.json`・`retired-smoke-result.json`へ保管し、`kana-capture-20261027/cleanup.json`へ記録した。診断・失敗証跡と固定出力は保持。制限環境のCIM照合は権限不足で止まったため、同じ処理を通常ユーザー環境で再実行して確認後に整理した。
- 自動入力は実機のIME状態・キーボード配列すべての受け入れ確認には代えない。0.94.11のKANA/Convertの物理記録、IMEのON/OFF後・Win/Alt/Ctrl付きの記録、長押しやIME/LEDの実効果は利用者の再確認待ち。製品nativeフック、通常キーの状態管理、入力ブロック、保存値は今回変更していない。無関係な全回帰、commit・merge・push・Release・実利用deployは行っていない。

## 2026-10-27: KANAキーに対応 0.94.10試験版

- 利用者が0.94.9の単体CapsLock（英数）の実行と、設定画面での入力記録の成功を確認した。追加対象のKANAは「カタカナ/ひらがな/ローマ字」キーだと確認。旧診断で得た`key-probe-KAGUYA-20261027-013139-851.json`は対象フィルター外の押下を含まず、解放10件だけだったため、かな位置と関連IMEコードを含めて診断EXEを更新した。OS送信/フック登録なしの20条件self-testに成功し、`40.ARTIFACT/AppDock.at365-lock-keys/AppDock.KeyProbe.exe`へ配置した（`.artifacts/kana-keys-20261027/probe-placement.json`）。
- 更新後の`key-probe-KAGUYA-20261027-013611-573.json`は56イベント。全件JISかな位置のscan`0x70`で、単体/Ctrl/Win付きは主にVKF2、Shift付きはVKF1、Alt付きはVKF5/F6が届いた。押下前に旧モードのupが入り、同じVKの対応するupが来ない連続押下も確認。集計と原本hashは`.artifacts/kana-keys-20261027/physical-input.json`。これは入力コードの実測であり、新版での実行・入力抑止の成功へ読み替えていない。
- KANAを`KanaMode`として共通正規化・特殊キー選択・native記録/実行・マウス＋キー・ページ入力へ追加し、`KANA`表記も同じ保存値へ正規化する。標準のVK_KANA（0x15）に加え、非拡張scan0x70のIMEコードF0/F1/F2/F5/F6を共通の捕捉変換でKanaModeとして扱い、修飾キーを保持する。英数のscan0x3A、通常文字への再割当、拡張スキャンは変換しない。DOM側も物理codeがKanaModeで既知のIMEキー名のときだけ揃え、IME変換中・Process/Dead/Unidentifiedの保護を維持する。名称と物理codeの確認には[W3C code定義](https://www.w3.org/TR/uievents-code/)・[key定義](https://www.w3.org/TR/uievents-key/)、標準VKには[Microsoft定義](https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes)を参照した。
- KanaModeも解放待ちのない押下として扱い、連続押下・モード切り替え前の解放・任意のupで所有状態を残さない。既存Alphanumeric/Pause、通常キーの長押し抑止と押下/解放の対、元入力ブロック、条件と共通dispatcher、保存済み割り当て、別契約の送信キー文法を維持。発行前レビュー1回で要件/互換/影響/検証不足を確認し、阻害指摘なし。新しい設定項目・保存ファイル・公開APIを追加しない通常対応として0.94.9から**0.94.10**へパッチ更新した。
- frozen install・型検査・標準publish成功。Node関連10ファイル**102/102件**、OSへ送信/フック登録をしないnative状態試験**229項目**、マウス＋キー状態試験**50項目**に成功。固定EXEでは既存キーにKanaMode・Ctrl+KanaMode・Shift+KanaModeを加えた、特殊キー選択・保存・ブロック設定・取消・実再起動後の登録**12群**と隔離portable smokeが成功した。802入力と診断の補助入力hashが一致し、発行前のsettings.json・更新済み診断EXE・実機ログ4件の計6ファイルをhashで保持確認した。
- 発行EXE/File/ProductVersionとfeedは**0.94.10 / 170,689,402 bytes / SHA256 `1bb5407d201d21bd2062698c2ef3ea8c975b5a35e1c594b411478213c160a3e3`**。試験DLLと発行/収録InputHost DLLのSHA256`d562598c4e58efc38df65e488e2c3afb01f88ca7018e932e6483df5d1a1ff181`が一致。証跡は`.artifacts/kana-keys-20261027/validation.json`と各完全ログ・入力hash・review.json、GUIは`.artifacts/kana-keys-20261027/retired-command-triggers-ui-result.json`、smokeは`.artifacts/kana-keys-20261027/retired-smoke-result.json`。Node24.22.1/pnpm12.10.1/Electron45.0.0/.NET SDK10.0.403、Windows x64で検証した。
- GUI/smokeの各モードは成功最新3回を保持し、最古の0.94.7 profile2件だけを、成功・終了・対象範囲・再解析ポイントなしを確認して整理した。結果JSONは元hashのまま`.artifacts/lock-keys-20261026/retired-command-triggers-ui-result.json`・`retired-smoke-result.json`へ保管し、詳細を`kana-keys-20261027/cleanup.json`へ記録した。固定出力・調査/失敗証跡は保持。0.94.10のKANAの物理的な記録・実行・入力抑止、長押しやIME/LEDの実効果は実機再確認待ち。Pause/F13〜F24のOS送信/登録、commit・merge・push・Release・実利用deployは行っていない。

## 2026-10-27: 英数の解放なし入力に対応 0.94.9試験版

- AppDock起動中の追加実機ログ`A:\40.ARTIFACT\AppDock.at365-lock-keys\key-probe-KAGUYA-20261027-010509-581.json`を解析（19イベント）。Shift+CapsLock・無変換・変換・ScrollLockはいずれもChrome系Windowとデスクトップ`Progman`から押下後、解放前に同じ表示先Windowへ前面が切り替わった。利用者も単体CapsLock以外でAppDockが開き、元入力もブロックされたように見えたと報告した。入力抑止の実効果は利用者の観測であり、常に入力を通す診断EXE単体では証明しない。今回の0.94.8実機試験で以前のデスクトップ不動作は再現せず、その変化の原因は未確定とする。
- 単体CapsLock位置はVKF0/scan3Aのdownが2件、対応するupは0件。現行InputCaptureEngineで同じ`F0 down → F2 up → F0 down`をメモリ内で再現すると、VK単位のpressed/ownedが残り、2回目の通知を出さないことを確認（修正前DLL・期待した回帰失敗は`.artifacts/ime-pulse-20261027/native-before.json`・`native-red.log`・`regression.json`）。
- `Alphanumeric`を解放待ちのない入力として扱い、初期キー状態から除外し、記録・通常実行・マウス＋キーで長押し/所有状態を残さないよう修正した。各downを判定し、任意のupでは実行しない。既存Pauseも共通の分類を使い、通常キーの繰り返し抑止と押下/解放の対を保持。日本語配列の単体CapsLockは引き続き`Alphanumeric`として登録し、`CapsLock`との区別、保存済みキー、IME変換中のローカル入力保護、入力フックの寿命は変更しない。
- 発行前レビュー1回で修正範囲・保存互換・元入力ブロック・既存キーへの影響を確認し、阻害指摘なし。設定項目・保存ファイル・公開APIの増減を伴わない修正として、前回発行0.94.8から**0.94.9**へパッチ更新。固定依存のfrozen install・型検査・標準publishに成功。Node関連9ファイル**97/97件**、実キー送信/フック登録をしないnative状態試験**179項目**、マウス＋キー状態試験**32項目**に成功した。
- 発行した固定EXEで特殊キー選択・保存/ブロック設定・取消・実再起動後の登録**9群**、F10/F11だけを使った通常Window/デスクトップの実行・表示と前面化**4群**、隔離portable smokeに成功。EXE/File/ProductVersionとfeedは**0.94.9 / 170,688,798 bytes / SHA256 `8a53b2e2e1dd6c32f4350c8316bae7c129280a673636ca6f0b9abd83c3112599`**。試験DLLと発行/収録InputHost DLLのSHA256`c976a8b9b130baa1d08700ed50b893a0bf6bb2b90107255f4c2407aba43c7eff`が一致した。
- 試験前後の802入力と補助fixtureのhashが一致。発行先のsettings.json・診断EXE・実機ログ2件の計4ファイルをhashで保持確認した。証跡は`.artifacts/ime-pulse-20261027/validation.json`・各完全ログ・入力hash・review.json・active-log-analysis.json。GUI/smoke結果は同フォルダーの`retired-command-triggers-ui-result.json`・`retired-smoke-result.json`へ保管した。発行当時は各モードの成功最新3回以内と原因再現の失敗証跡を保持し、削除0件。その後0.94.12完了時の整理で旧profile2件を削除し、結果JSONを元hashのまま上記へ保管した。
- 0.94.9での単体CapsLock/英数の物理的な記録・反復押下・長押し・IME/LED・入力抑止の実効果は利用者の再試験待ち。Pause/F13〜F24をOSへ送信・登録していない。mainの別変更は取り込まず、commit・merge・push・Release・実利用deployは行っていない。

## 2026-10-27: KAGUYA実機ログの解析（AppDock停止中）

- `A:\40.ARTIFACT\AppDock.at365-lock-keys\key-probe-KAGUYA-20261027-005217-389.json`の41イベントを解析。利用者が**AppDockを終了して記録した**と確認したため、Windows側の入力観測として扱い、試験版の捕捉・照合・実行成功へ読み替えていない。集計・元ログのSHA256・未確定事項は`.artifacts/desktop-key-diagnosis-20261027/raw-key-analysis.json`。
- 診断Window、デスクトップ（`Progman`）、`Chrome_WidgetWin_1`の順で入力が記録され、全41イベントで前面HWNDが非0・配列`0x4110411`・Injected=false。WindowクラスだけではChrome系Windowのアプリ名を確定しない。デスクトップでもScrollLock（VK91/scan46）は3対、変換（VK1C/scan79）と無変換（VK1D/scan7B）は各1対、Shift+CapsLock（VK14/scan3A、修飾4）は2対のdown/upを確認した。
- 通常のCapsLock位置はVKF0/scan3A（`Alphanumeric`）、Shift付きではVK14/scan3A（`Shift+CapsLock`）。`CapsLock`割当のVK14と通常押しのVKF0は一致しない。一方、既に対応した`Alphanumeric`や`Convert`の記録/実行不可、およびデスクトップ全体の不動作は、この生入力ログだけでは説明できない。
- VKF0/scan3Aはdown4件・up0件、VKF0/scan70はupのみ2件、VKF2/scan3Aはupのみ1件。英数関連の通常と異なるdown/upの並びを確認した。現InputCaptureEngineのpressed/ownedはVK単位なので、解放されないdownが長押し扱いとして残る可能性がある。ただし異なるscanのupも同じVKなら現実装では状態を消すため、scanの不一致だけを原因と断定しない。AppDock停止中の記録から、実際の捕捉中の状態・IMEの入力抑止時の挙動は確定できない。
- 次は**試験版0.94.8を起動した後に診断の記録開始**とし、Edgeとデスクトップで対象キーを押して比較する。AppDockの設定画面の記録欄は使用せず、通常実行中の入力を観測する。製品ソース・版・配布EXE・キー設定の変更なし。既存診断EXEは40.ARTIFACTに配置済みのものを使用する。

## 2026-10-27: 別PCでの実入力結果とデスクトップ不反応の切り分け

- 利用者の別PCでの0.94.8実機結果: **NonConvert・Shift+CapsLock・ScrollLockは記録/実行成功、Convert・CapsLock・Alphanumericは記録/実行不可**。成功したキーもEdgeやテキストエディターでは動作するが、デスクトップをクリックすると動作しないとの報告。別PCではPowerToysを無効にして試しており、LUNAもキー制御OFFだったと確認された。PowerToysの競合やIME一般の制約を原因と断定しない。
- 共有された試験版settings.jsonの該当割り当ては、有効・`scope: global`・`command: appdock.open`で、ScrollLockの`excludeDesktop: false`、キー共通/個別の除外指定なし。単なるアプリ限定条件やデスクトップ除外では説明できない。接続中の通常MCPは0.96.0で試験版のキー割り当てを持たないため、その状態を0.94.8試験版の実行状態へ読み替えていない。
- LUNAで固定0.94.8を隔離profileと既存InputTargetで起動し、F10による記録だけのコマンドとF11による`appdock.open`を、通常のテストWindow/実Windows Shellのデスクトップ（Progman）の両方で検証。**4段階とも成功**し、非表示だった本体が実際の前面HWNDになった。実利用設定・OSのIME設定を変更せず、Pause/F13〜F24の送信/登録は行っていない。初回Ctrl+Shift+F10の記録件数検査はlocal/storageをdata/storageと誤って参照していたため無効と注記し、正しい記録先と新規profileで再検証した。初回の前面化2ケース自体は成功している。
- この比較は「デスクトップからの処理が常に無効」という仕様を否定するが、別PCの物理入力・デスクトップクリック後の状態を再現できた証明ではない。nativeの入力取得、コード/修飾キー照合、記録セッション、表示/前面化のどこで止まるかは未確定。前回LUNAで読んだ配列のscan→VK対応も、別PCの実入力コードを確定するものではない。
- 対象キー/位置だけを観測する自己完結の診断EXE `.artifacts/desktop-key-diagnosis-20261027/probe/AppDock.KeyProbe.exe`を用意。実機試験用に`A:\40.ARTIFACT\AppDock.at365-lock-keys\AppDock.KeyProbe.exe`へコピーし、元の検証済みEXEとSHA256が一致した（`probe-placement.json`）。開始/停止は手動、対象キーのVK/scan/flags/修飾キー・前面HWND/class/PID・そのthreadの配列を最大512件記録し、文字・Windowタイトルを保存しない。入力を抑止せず、停止/終了時に同フォルダーのJSONへ保存する。ビルドと、フック登録/OS送信をしない対象フィルター16条件のself-testが成功。診断用の実キー観測は未実施で、別PCでのログ待ち。これは調査用ツールだけで、製品ソース・版・配布EXE・設定は変更していない。
- 証跡は`.artifacts/desktop-key-diagnosis-20261027/`のresult-plain.json・run-plain.log・desktop-roots.json・probe-build.log・probe/self-test.jsonと診断ソース。診断中の失敗記録と前回証跡を保持し、削除0件。実機観測後、原因を確定してから修正範囲を判断する。

## 2026-10-26: 日本語配列の英数・変換・無変換に対応 0.94.8試験版

- 0.94.7の実機確認でScrollLockは検出でき、CapsLockは記録とコマンド実行の両方ができなかったとの報告を受けた。同じ専用worktreeでWindowsの配列を読み取り、`0x04110411`における`MapVirtualKeyExW(MAPVK_VSC_TO_VK_EX)`が、CapsLock位置のscan `0x3A`を`0xF0`、変換位置`0x79`を`0x1C`、無変換位置`0x7B`を`0x1D`へ変換することを確認。これは配列情報の読取であり、物理押下のフックイベントを観測したものではない。
- 英数の`Alphanumeric`、変換の`Convert`、無変換の`NonConvert`を、共通正規化・特殊キー選択・nativeの変換と記録・マウス＋キー・ページ入力に追加。日本語配列の英数キーはAlphanumericとして登録する。既存のCapsLock（`0x14`）と英数（`0xF0`）を分け、保存済み割り当ての自動変更はしない。条件・元入力ブロックとIME変換中のローカル入力保護を保持し、別契約の送信キー文法は広げていない。
- 発行前レビュー1回で対応範囲・保存互換・名前/キーコードの往復・IME保護・共有記録欄とnativeの整合を確認し、阻害指摘なし。設定項目・保存ファイル・SDK/APIの追加はなく、前回の試験版0.94.7から0.94.8へパッチ更新。frozen install・型検査・build・publish成功。Node関連9ファイル **97/97件**、OSへキー送信・フック登録をしないnative状態試験 **146項目**、マウス＋キーの状態 **30項目**に成功し、試験前後の802入力hashが一致。Pause/F13〜F24の実入力・OS登録は行っていない。
- 固定EXEでは前回の3入力にAlphanumeric・Convert・NonConvert・Ctrl+NonConvertを加え、特殊キー選択・保存・元入力ブロックON/OFF・再編集/取消・実再起動後の再登録 **9群**と隔離portable smokeに成功。EXE/File/ProductVersionとfeedは **0.94.8 / 170,700,103 bytes / SHA256 `45617c74b8d1989f992d4d225a477b7511a8d3a04525bd6821c0271c6fdb8dad`**。native試験DLLと発行/収録InputHost DLLのSHA256が一致し、発行先の既存settings.json 1件のhashを保持した。
- 証跡は`.artifacts/ime-keys-20261026/`のlayout-probe・review・入力hash・artifact・完全ログと、同フォルダーの`retired-command-triggers-ui-result.json`・`retired-smoke-result.json`。発行当時は同じ試験/実行方式の成功分が各2回以下で削除0件、固定出力・前回証跡を保持した。その後0.94.11完了時の整理で旧profile2件を削除し、結果JSONを元hashのまま上記へ保管した。新しい3キーの物理押下とIME・LEDへの実効果は再確認待ちであり、CapsLockの実機不検出の解消を確定していない。mainの別変更を保持し、commit・merge・push・Release・実利用deployは行っていない。

## 2026-10-26: CapsLock・ScrollLockのキージェスチャー対応 0.94.7試験版

- `origin/main`をfetchし、コミット済みmain `8ae24f2bb63390159a030950563033d0293a1412`と一致することを確認。専用worktree `AppDock.at365-lock-keys` / `codex/lock-keys`で実装した。本体mainの編集中のリボン変更は取り込んでいない。開始版0.94.6からの通常追加として0.94.7へパッチ更新し、`40.ARTIFACT/AppDock.at365-lock-keys/`へ独立発行。設定項目・保存ファイル・SDK/APIの追加はない。
- 共通のキー正規化、ネイティブのキー変換・記録、特殊キー選択、Webページ上のローカル条件でCapsLockとScrollLockを受け付ける。既存の修飾キー、条件、コマンド実行基盤と元入力ブロックを共用。共通の記録欄から登録できるマウス＋キーにも同じネイティブ対応をそろえた。送信キーの文法・保護された組み合わせは維持。
- 発行前レビュー1回で、正規化とnativeの整合、共有記録欄のモード別対応範囲、元入力ブロック・反復・解放、保存互換と必要な回帰を確認し、製品の阻害指摘なし。GUI検査のトグルラベルを現行表示に合わせた。frozen install・型検査・build・通常publish成功。Node関連9ファイル **97/97件**、nativeのメモリ上のキー変換・記録・ブロック・反復・解放 **59項目**、マウス＋キーの状態 **18項目**に成功。native試験はフックを登録せず、OSへキーを送らない。PauseとF13〜F24の実入力・OS登録は行っていない。
- 発行した固定EXEをコピー前後のSHA256一致で隔離起動し、CapsLock、ScrollLock、Ctrl+ScrollLockの選択・保存・ブロックON/OFF・再編集/取消・実再起動後の再登録 **5群**とportable smokeに成功。EXE/File/ProductVersionとfeedは0.94.7、**170,693,593 bytes / SHA256 `62690fb38f7887ea0ced8701ef8ecea02b8812b5a55323ab8aed7e2f81774182`**。発行に収録したInputHost DLLはnative試験対象とSHA256が一致する。
- 証跡は`.artifacts/lock-keys-20261026/`の入力hash、review、artifact、完全ログと、同フォルダーの`retired-command-triggers-ui-result.json`、`retired-smoke-result.json`。結果JSONは2026-10-27の最古profile整理時に元hashのまま保管した。発行当時は各試験の直近成功分が3回以下のため削除0件。関連プロセス終了を確認し、証跡・固定ビルド出力を保持。実キーボードの押下、配列/IME/再割当差、ロック状態/LEDと他ソフトの共存は利用者の実機確認待ち。無関係な全回帰・commit・merge・push・Release・実利用先deployは行っていない。

## 2026-10-27: 画像グループと所属のMCP対応 0.96.6

- main `1134e3c87be5cab69d9fd3851b280cb271388d76`のclean状態から開始し、追跡先への`pull --ff-only`でAlready up to dateを確認した。既存のimageLibrary.groupsを固定6入口へ接続し、設定項目・保存形式/ファイル種類・操作許可・MCPツールは追加しないため、パッチを0.96.5から**0.96.6**へ進めた。旧MCP worktreeと無関係な変更を保持し、共有の分類ownerとMCP接続の2単位でコミットする。
- グループ名簿はID/名前を公開し、追加・名前変更・削除・並べ替えに対応。IDは読取り専用で、追加時にUUIDを生成する。名前の前後空白、1～80文字、制御文字と大文字小文字を無視した重複、64グループの既存検証を使う。各グループから所属一覧を自動生成し、ファイル名を使う追加・解除・並べ替えに対応する。グループ増減で対象一覧を更新し、固定ツール定義のリフレッシュを必要としない。
- 所属の候補は画像サービスのキャッシュにあるファイル名だけで、512参照/グループ・4096所属/全体の既存上限を保持。パス/URL・未知候補・重複を拒否し、未到着の既存参照は取得・解除・並べ替えできる。候補変更はSchema/cursorを失効させる。画像bytes・サムネイル・実パス・内容世代は返さず、読取り/dryRun/保存で原画像の走査・decode・取込み・削除を行わない。
- ネイティブのグループ編集とMCPはImageLibrarySettingsの変更計画・既存parser・保存を共用する。保存前のrevision/元値とpreflightを再検査し、無変更/dryRunは書き込まない。グループ削除は分類だけを外し、原画像、使用先、他グループの所属、無関係な共有/PC設定と暗号化情報を保持する。破損形式はavailable=falseとして不正値を投影しない。共通の再送/許可取消・原子的な失敗処理を維持した。
- 発行前レビューで公開範囲と権限、分類ownerの共有、候補/Schema/競合、既存の容量上限、原画像/使用先/暗号文の保持、ネイティブダイアログの同時編集、翻訳/現行文書を確認し、製品の阻害指摘なし。初回の画面画像が所属解除の描画完了前だったため、GUI試験に1カードの状態を待つ検査を追加し、実MCP全58群を再実行して画面画像も確認した。製品コードの追加修正はない。
- 固定lockfile install、整形、型検査、本体/Default Shell buildと、標準**133ファイル1138/1138件（fail/cancel/skip 0）**が成功。新規**12件**は公開値/無副作用、dryRun/保存/再送、UI共有owner、グループ/所属の追加・削除・挿入/並べ替え、ID保護/名前検証、候補変更/未到着参照、原子的な不正入力、外部変更/権限取消、破損形式、64/512/4096上限、無変更/preflightと共有/PC保存を確認する。関連する既存画像・削除・ギャラリー・翻訳の回帰も成功した。
- 最終sourceの実MCP **58群**、発行した固定EXEの実MCP **60群**と隔離smokeが成功。ネイティブの名前変更ダイアログを開いたままMCPで別グループを変更しても双方が残り、グループ順序・所属のネイティブ/MCP編集が一致することを確認。原画像と既存の使用先、暗号化3ファイルのbytes、固定tools/listを保持した。source/固定EXEの画面画像を確認し、既存の画像管理画面と共通部品の配置/外観を維持している。
- 通常発行先`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**0.96.6 / 170,710,806 bytes / SHA256 `8b2811654a474adf6020f17cc700244549cedc7cd30c273f94e19496f00f1477`**。ASAR SHA256は`967b784d79b8ffd9535098995e460632bd5b74c3d5925858c3f45f1b9d72f68e`、feed SHA256は`43674ff2f0f78c4f4fbd15d4685dd8a4b0631d2327656c4f4c08801564571f46`。**254出力・621 resource**を生成元と全件照合し、File/ProductVersion・package・Default Shellの版とfeedのsize/hashが一致。固定試験用EXEコピーも最終EXEと一致した。
- 標準試験前後の全入力は一致し、その後の差分はGUI専用の`scripts/settings-image-group-gateway-checks.cjs`の描画待ち検査だけ。標準試験・製品・依存/ビルドの入力に影響しないため標準1138件と型検査は再利用し、影響するsource GUIを再実行した。最終GUI前後・発行後・固定試験後のソース/テスト/依存/ビルド入力と参照Applet manifestは全件一致。環境はLUNA、Windows 11 x64 10.0.26300、Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.403。完全ログ・入力/発行物照合・レビューは`.artifacts/mcp-settings-image-groups-20261027/`、stage/tree/commitの根拠は`.artifacts/commit-validation-mcp-settings-image-groups-20261027/`へ記録する。
- 後片付けでは専用GUIプロセス0、検証用Windowsタスクが未登録かつXMLなしを確認。成功したsource/固定コピー、画面待ちの診断、過去のコミット根拠、個別の完了マーカーがない単体出力を保持し、削除0。既存deploy設定/スクリプトと発行先の利用者設定を保持した。原画像の取込み/削除・任意JSON・専用Web名簿は今回の範囲外。Pause/F13～F24のOS送信/登録、実UAC同意、実ログイン/Cookie消去、Windowsサインインの試験は行っていない。push・Release・実利用先deployは行っていない。

## 2026-10-27: ショートカット一覧設定のMCP対応 0.96.5

- main `13d048dff824dec061efa63658b03f961c5dd689`のclean状態を確認し、追跡先から`pull --ff-only`（Already up to date）後に継続。既存のshortcut-list型を固定6入口へ接続する変更で、設定項目・保存形式/ファイル種類・操作許可・MCPツールの追加はないため、パッチを0.96.4から**0.96.5**へ進めた。旧MCP worktreeと無関係な作業を保持してmainで実装し、共通定義/検証/初期値とMCP接続の2単位でコミットする。
- Appletの宣言からID/名前/送信するキーの3列を持つlist対象を生成し、追加・部分編集・削除・並べ替えに対応。automation省略/trueは公開、false/secret/localOnlyは非公開。IDも既存UIと同様に編集でき、読取revisionに束縛したitemRefを使う。32件上限、ID形式/重複、名前/キーの長さとキー検証はUI/自己設定APIと同じ規則を使う。初期ID・初期名・Ctrl+TはUIと同じ関数から生成し、保存キー・配列順・共有/PC専用分類を維持する。
- 通常フィールドの全体置換やresetを追加せず、既存SettingsCommandsの計画/検証/保存へ委譲。未知属性はMCPの列/プレビューへ返さず、MCPとネイティブ編集で未編集行も含め保持する。未知属性にnull以外の値を持つ行のMCP removeはLOCAL_ACTION_REQUIRED。不正な保存値や停止中のAppletはavailable=false。設定欄と3列の南京錠は同じownerから判定する。従来の単純設定API/他Applet向けの対応型とvalidSendKeysの既存exportを保持した。
- 発行前レビューで公開/権限、共通検証と追加時の既定値、編集可能ID、無変更/再送/競合、部分失敗の原子性、未知属性と行削除、共有/端末保存、入力確定と南京錠、翻訳を確認。明示nullが未保存の空配列と同じ扱いになる問題を期待した失敗1件で再現し、shortcut-listはundefinedだけを未設定と扱うよう修正した。object-listの従来のnull処理は維持し、修正後の標準/GUIを再検証して阻害指摘なし。再現ログも保持した。
- 固定lockfile install、整形、型検査、本体/Default Shell build、最終入力の標準**132ファイル1126/1126件（fail/cancel/skip 0）**が成功。新規**10件**は公開/旧API範囲、dryRun/保存/再送/追加既定値、ID/名前/キーの部分変更、非公開列/未知属性保持、重複/不正キーと後半失敗の原子的拒否、行保護、挿入/並べ替え/空配列、32件/ページ分割/無変更、古いitemRef/cursorと権限取消、破損値/null/停止、後から増えた宣言とPC専用保存を確認する。
- 最終sourceの実MCP **54群**、発行した固定EXEの実MCP **56群**と隔離smokeが成功。MCPとネイティブのID/名前/キー編集・追加/削除、MCP挿入/並べ替え、未知属性の保持と行保護、重複ID/不正キーの原子的拒否、古い要求/cursor、固定tools/list不変、暗号化3ファイルのbytes保持、公開欄は南京錠なし/非公開欄は南京錠ありを確認した。fixtureは実行ハンドラー/入力フックを持たず、キーは文字列入力だけを行った。画面画像も確認し、既存の共通入力/レイアウトを維持している。
- 通常発行先`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**0.96.5 / 170,714,891 bytes / SHA256 `ce36d5e5a0ab976759d3afb3396cec76e55d60cee659c8fa57cea69592c41dfd`**。ASAR SHA256は`40996c81aabf71185b3c4131f7230336d32c3a65f16ff2f28d3a15f54ee2795b`、feed SHA256は`1e0568ba99a9db6b0769812ff2ebef7e23241bd99a449a3ff61e19f54c0c5fd5`。**252出力・621 resource**を生成元と全件照合し、File/ProductVersion・package・Default Shellの版とfeedのsize/hashが一致。固定試験用EXEコピーも最終EXEと一致した。
- 最終の型検査/標準/source試験・発行・固定試験の前後でソース/テスト/依存/ビルド入力と参照Applet manifestのhash一致を確認。環境はLUNA、Windows 11 x64 10.0.26300、Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.403。完全ログ・入力/発行物照合・レビューは`.artifacts/mcp-settings-shortcut-lists-20261027/`、コミット単位ごとのstage/tree/commit根拠は`.artifacts/commit-validation-mcp-settings-shortcut-lists-20261027/`へ記録する。
- 後片付けでは専用GUIプロセス0、検証用Windowsタスクが未登録かつXMLなしを確認。今回の成功資料・固定コピー、過去のコミット根拠、nullのレビュー再現、個別の完了マーカーがない単体出力を保持し、削除0。既存deploy設定/スクリプトと発行先の利用者設定を保持した。Pause/F13～F24のOS送信/登録、実キー送信/コマンド実行、実UAC同意、Windowsサインインの試験は行っていない。自由JSONや残る専用サービスは別範囲。push・Release・実利用先deployは行っていない。

## 2026-10-27: Webアカウント公開名簿のMCP対応 0.96.4

- main `7531fa445bcfdc5c18cecf756664c208af5386ee`のclean状態を確認し、追跡先から`pull --ff-only`（Already up to date）後に継続した。既存のweb-profiles名簿を固定6入口へ接続する変更で、設定項目・保存形式/ファイル種類・操作許可・MCPツールの追加はないため、パッチを0.96.3から**0.96.4**へ進めた。旧MCP worktreeと無関係な作業は保持し、今回の変更はmainで行った。
- `web-profiles`を宣言した提供元ごとにlist対象を自動生成し、ID/名前の取得、枠の追加、名前変更を公開。IDは読取り専用で追加時に`account.<UUID>`を生成し、最大32件、名前1～80文字/空白正規化/制御文字拒否を既存parserで検証する。同名行をitemRefで区別し、挿入時も既存行同士の順序を保持する。削除・クリア・並べ替え・認証編集は公開しない。名前列とローカル専用操作列の南京錠は同じownerのメタデータから判定する。
- UIとMCPの追加/名前変更をWebProfileStoreの変更計画と原子的保存へそろえ、元のファイルbytesによる競合を保存直前にも確認する。未編集の未知属性、既存ID、設定JSONのbytes/revision、削除待ち記録、session、暗号化ファイルを保持した。読取り/dryRunだけでは名簿を作成せず、明示addだけが空の名簿を初期化する。公開読取りからRemotePageServiceの初期化・session整理・ページ表示を行わない。停止中・複数提供元・既存移行先にも対応する。
- 発行前レビューで公開/権限、提供元の寿命、旧名簿とローカル状態、未知データ、同名/ID/最大件数、競合/再送、エラーの秘匿、UIの確定/取消と削除ガードを確認し、阻害指摘なし。公開IDの表示名を専用の翻訳キーへ修正した。追加/名前変更がローカル削除待ちを書かなくなるため、既存同期試験の競合注入を共有ファイルの一時書込みへ移し、同期中の配信を上書きしない同じ性質を確認した。初期の型診断、fixtureの設定初期化/移行形式/select optionsの不足は修正し、失敗ログも保持した。
- 固定lockfile install、整形、型検査、本体/Default Shell build、標準**131ファイル1116/1116件（fail/cancel/skip 0）**が成功。新規**11件**は公開範囲、dryRun/保存/再送/無変更、未知属性とローカル状態の保持、追加/候補/再起動、後半の不正変更の原子的拒否、古い要求/cursor、破損/未到着、複数提供元/移行、稼働サービスの再利用とbusy、保存直前の競合、権限取消/件数上限を確認する。標準成功後の4入力差分はfixtureのoptions宣言、GUI helper、公開IDの表示名と翻訳資源に限られ、新規11件を再実行し、最終入力で名簿/同期/MCP可否/翻訳の**41/41件**を再確認した。無関係な成功回帰は再利用し、照合差分と根拠をvalidation.jsonへ記録した。
- sourceの実MCP **51群**、発行した固定EXEの実MCP **53群**と隔離smokeが成功。MCPと画面の追加/名前変更、動的なアカウント候補、古い要求/cursorの拒否、非公開列と削除/並べ替えの拒否、固定tools/list不変、未知属性・検証用Cookie相当bytes・削除待ち・暗号化3ファイルの保持を確認した。source試験後の製品差分はIDの表示名と翻訳だけで、最終の固定EXEで全群を確認。画面画像も確認し、既存の共通一覧・名前入力・ローカル操作を維持している。
- 通常発行先`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**0.96.4 / 170,726,144 bytes / SHA256 `dda149cc5080c2c0976839d335fb95ff80765b25be7d03c92218b09962cc47db`**。ASAR SHA256は`c6756659ab863d3f8b58111b5975a9d244778e474e42372f3ad0f8816393c2f6`、feed SHA256は`7f2bc638b45c4778312dcf45fdec167f4382b932e6e6c4df38743c236e9691a6`。梱包した**251出力・621 resource**を生成元と全件照合し、EXE File/ProductVersion・package・Default Shellの版とfeedのsize/hashが一致した。固定試験用EXEコピーも最終EXEと一致する。
- 最終の型検査/影響回帰・発行・固定試験の前後でソース/テスト/依存/ビルド入力と参照Applet manifestのhash一致を確認。環境はLUNA、Windows 11 x64 10.0.26300、Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.403。完全ログ・入力照合・レビュー・発行物照合は`.artifacts/mcp-settings-web-profiles-20261027/`、stage/tree/commitの根拠は`.artifacts/commit-validation-mcp-settings-web-profiles-20261027/`。
- 後片付けでは専用GUIプロセス0、検証用Windowsタスクが未登録かつXMLなしを確認した。今回の成功資料・固定コピー、過去のコミット根拠、fixture診断、個別の完了マーカーがない単体出力は保持し、削除0。既存のdeploy設定/スクリプトと発行先の利用者設定を保持した。Pause/F13～F24の送信/登録、実ログイン/実Cookie消去、実UAC同意、Windowsサインインの試験は行っていない。Gmail等のweb-accounts/accountGroup専用名簿は別範囲。push・Release・実利用先deployは行っていない。

## 2026-10-27: 登録画像参照のMCP設定対応 0.96.3

- cleanなmain `dbd83eb`から開始し、既存追跡先を`pull --ff-only`して最新取得済みを確認した。今回からprimary mainで継続し、旧MCP設定worktreeは変更しない。既存のregistered-image型・保存参照/ID・固定6入口を拡張する通常修正で、新しい保存設定/ファイル・操作許可・MCPツールは追加せず、**0.96.3**へパッチ更新した。push/Release/実利用deployは行わない。
- 通常フィールドと宣言型一覧の登録画像列を同じ公開判定へ接続。入力は既存のfile参照またはnullで、登録済み候補は画像サービスのキャッシュからファイル名だけをページ分割して返す。候補の増減でSchema/cursorを更新し、古い要求・未登録画像・URL/パス・余分な属性を拒否する。読取り/dryRunによる走査・decode・画像取込みはなく、既存の秘密/非公開/PC専用保存と従来の単純設定・他Applet向け公開範囲を保持した。画像欄の南京錠は同じownerから自動判定する。
- 明示的なnullを通常設定/入れ子の画像列/ネイティブフォームで保持し、既定画像の継承と区別した。画像を参照する行のremoveは保護し、画像列を明示的に解除すると他の保護値がない行を削除できる。原画像のbytes・グループ・未編集列/未知データは保持し、画像の取込み/削除は今回の設定操作へ含めない。
- 発行前レビューで公開/候補の範囲、Schema/変更競合、共有/PC保存、既定値とnull、画像行の削除、原画像/暗号文の保持とUI互換を確認。形式不正の古い画像オブジェクトが一覧dryRunのbeforeへ残る問題を、期待した失敗1件で再現し、読取りと変更前後プレビューを同じ公開値投影へそろえた。登録画像だけにnull保持を適用し、他の列の既存既定値処理は維持した。修正後の必要回帰に成功し、阻害指摘なし。
- 固定lockfile install、整形、型検査、本体/Default Shell build、標準**130ファイル1105/1105件（fail/cancel/skip 0）**が成功。新規**12件**は公開判定/旧API維持、512候補のページ分割、dryRun/保存/再送/解除/reset、候補変更・権限取消・原子的拒否、未到着参照の保持、不正値の読取り/プレビュー非転送、一覧の入れ子/null/行保護、キャッシュ取得の無副作用を確認する。初期3件の期待値/fixture、GUIの対象数（共通/更新対象も含まれる）の診断を修正し、初期失敗と期待したレビュー再現ログを保持した。
- sourceの実MCP **48群**、発行した固定EXEの実MCP **50群**・既存リボン画像/復元/モード別 **10群**、計**60群**と隔離smokeが成功。通常画像と入れ子列のMCP/ネイティブ選択・解除、nonnull既定画像からの解除、暗号化済み3ファイル/元画像のbytes保持、候補追加と古いSchema拒否、固定tools/list不変、南京錠を確認した。設定本文と一覧ダイアログの画像も確認し、共通部品の配置/外観を維持している。
- `publish.bat`終了0。`A:/40.ARTIFACT/AppDock.at365/AppDock.at365.exe`は**170715492 bytes / SHA256 `186dda5d95e46c8a954542ab44037dcd3c0b8e1c566e11604949d1ed659c782b`**。File/ProductVersion、feedの版/size/hash、ASAR内package/Default Shell、全**250ビルド出力**・**621追加resource**、固定試験コピーを照合。既存の配置スクリプト/ローカル設定を保持した。
- レビュー後の**784入力**と参照Applet manifestは標準/source検証前後・発行後・固定検証後で一致し、以後の追記は本記録と無視対象の証跡のみ。Node **24.22.1**、pnpm **12.10.1**、Electron **45.0.0**、.NET SDK **10.0.403**、Windows x64を維持した。専用Limited Taskは登録/Task XMLとも不在、専用プロセス0、削除0件。現行/再利用の成功、固定コピー、診断と独立した成功判定のないunitフォルダーを保持した。Pause/F13〜F24のOS送信/登録、実UAC承認/Windowsサインイン、物理入力、実利用設定の変更は行っていない。
- 正本は[設定API](docs/settings-api.md#登録画像の参照)・[画像基盤](docs/registered-images.md#共通設定と選択画面)。実行コマンド/完全ログ・入力/出力hash・レビュー・環境・profile・後片付けは`.artifacts/mcp-settings-registered-images-20261027/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-registered-images-20261027/`へ記録する。公開型・保存・UI解除を1つの機能コミットにまとめる。

## 2026-10-27: MCP設定統合後のmain発行検証 0.96.2

- 統合commit `f341e13`（parents `c5ba87f` / `fa5ce41`）を保存し、cleanなprimary mainを`fa5ce41`からfast-forwardした。MCP設定一式・南京錠と最新リボンを同じtreeへ統合し、worktreeとmainの一致を確認。追跡先の変更、push/Release/実利用deployは行わない。
- primary mainから固定lockfileで通常の`publish.bat`を実行し、終了0。`A:/40.ARTIFACT/AppDock.at365/AppDock.at365.exe`は**0.96.2 / 170702713 bytes / SHA256 `7d03ab3f54270eee03d4570a54bc8b3c84c4939bf7f3878936adda597262d6bc`**。File/ProductVersion、feedの版/size/hash、ASAR内package/Default Shell、全250ビルド出力・621追加resourceを発行元と照合した。既存の配置スクリプト/ローカル設定を保持した。
- 同一Git treeでもWindowsのcheckoutごとの改行によって生成物のbytesが異なったため、単純な全ファイルhash一致だけでは再利用しなかった。238出力はbytes一致、残り12出力は改行（生成HTMLのCR重複を含む）とギャラリーの入力hash記録だけの差であることを各入力まで照合。native等のresourceはそれぞれの発行元と照合する。比較helperの初期停止はこの差の診断として保持し、製品ソースを変更していない。
- main上でも標準**129ファイル1093/1093件（fail/cancel/skip 0）**を追加実行して成功し、再ビルド後も発行物と全出力が一致した。通常発行の固定EXEで実MCP **47群**・リボンの画像/40種アイコン/復元/モード別 **10群**・個別ラベル **4群**、計**61群**と隔離smokeが成功。先行するworktree版の74群と区別して、今回の最終EXE/copyのhashを記録した。
- mainの**782入力**と参照Applet manifestは発行前後・追加標準後・最終固定検証後で一致。ツール/SDKは前項と同一。専用Taskは登録/Task XMLとも不在、専用プロセス0、削除0件。現在/再利用の証跡・固定コピー・診断を保持した。物理入力・実UAC承認・実Windowsサインインや、実利用設定の変更は検証対象外のまま。
- 後続追記は本記録だけで、製品の変更・版更新・再発行は不要。記録commit後もmainと既存worktreeを同じ先端へそろえて保持する。通常発行ログ/782入力/hashはprimaryの`.artifacts/mcp-settings-main-merge-20261027/`、固定GUI/比較/後片付けとstage/commit照合はworktreeの同名証跡フォルダーおよび`.artifacts/commit-validation-mcp-settings-main-merge-20261027/main-publication.json`・`final-state.json`を参照する。

## 2026-10-27: 最新mainとMCP設定worktreeの統合 0.96.2

- cleanな専用worktree `codex/mcp-settings-design` / `c5ba87f`とprimary mainを確認。mainの既存追跡先を`pull --ff-only`し、origin/mainと一致する`fa5ce41`（0.96.1）をworktreeへ統合した。追跡先の新設、別worktreeの変更、push/Release/実利用deployは行わない。
- 6ファイルの競合を解消。両方の検証履歴と、mainの40種アイコン・画像選択・個別iconOnly・既定復元・表示モード別アイコン/ラベル描画を保持し、MCP変更不可項目の南京錠と統合済みread/write許可を維持した。新しいネイティブのiconOnly/displayModeIcons欄も既存操作Schemaの設定IDへ接続し、アイコン表示フラグを増やさない。試験は現在のhost URL特定とポップアップ終了待ちを使用する。
- 統合調整による設定項目/保存ファイルの追加・削除や公開ツールの追加はなく、main 0.96.1から通常修正の**0.96.2**へ更新。発行前に両変更の維持、安定ID、秘密非公開、設定と実行の許可分離、既定復元/画像draft、実際の編集Schemaとの整合をレビューし、阻害指摘なし。
- 固定lockfile install、整形・型検査、本体/Default Shell build、標準**129ファイル1093/1093件（fail/cancel/skip 0）**に成功。既存の変更可否試験へ、現在のリボン操作SchemaがiconOnly/displayModeIconsを含むことを追加照合した。sourceの実MCP **45群**・リボン **6群**・グループ **7群**が成功。
- 発行した固定EXEで実MCP **47群**・リボン基本 **6群**・アイコン/復元/モード別 **10群**・個別ラベル **4群**・グループ **7群**、計**74群**と隔離smokeが成功。南京錠、ヒントOFF、許可取消の即時反映、暗号文bytes保持と固定tools/list、既存リボンの編集/再起動・一時パネル・モード切替を確認した。個別ラベルの再表示/位置ずれも既存の観測試験で確認した。
- worktreeの`publish.bat`終了0。`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`は**170712743 bytes / SHA256 `b7082b63b10b2776fbc747326f6235e9c230960dff08e251826b48c81ca350a2`**。File/ProductVersion、feedの版/size/hash、ASAR内package/Default Shell、ビルド出力**250ファイル**・追加resource **621ファイル**、固定試験コピーを照合した。
- **782入力**と参照Applet manifestは標準/source検証前後・発行後・固定検証後で一致。Node **24.22.1**、pnpm **12.10.1**、Electron **45.0.0**、.NET SDK **10.0.403**、Windows x64を維持し、後続変更は文書と無視対象の証跡だけ。専用Limited Taskは登録/Task XMLとも不在、専用GUIプロセス0、削除0件。現行/再利用証跡と初期診断は保持し、Pause/F13〜F24のOS送信/登録、実UAC承認、Windowsサインイン、物理入力・実利用設定の変更は行っていない。
- 整形検査の初回は取り込んだファイルのCRLFと既存Markdown表の書式で停止。製品の改行を保持して検査し、文書3件だけを整形した。発行後の製品変更はない。証跡はworktreeの`.artifacts/mcp-settings-main-merge-20261027/`、stage/統合commit/main反映の照合は`.artifacts/commit-validation-mcp-settings-main-merge-20261027/`へ記録。通常mainからの同じソースの発行は、primary側の同名証跡フォルダーと後続の検証記録へまとめる。

## 2026-10-27: リボン設定と表示 0.96.1のコミット検証

- 0.94.7〜0.96.1の個別iconOnly/SettingsField、通常・Applet・表示モードの画像/40種アイコン、既定復元、モード別設定、個別ラベルのちらつき修正をまとめて確認。対象31ファイルを分離し、設定・操作ID・提供元の名前/画像・通常ラベルの幅同期/位置対策を保持していることをレビューし、阻害指摘なし。
- ソース/試験/依存/ツール/native fixtureの **935入力**を照合。標準 **120ファイル946件**のうち、現行リボン関連114件と依存閉包が不変の14ファイル61件、計 **175件**の成功を再利用し、影響がある/動的なソース参照を含む残り91ファイル **771件**を追加して成功した。最終結果のfail/skip/cancelは0。型検査/build/publishの完全ログ、out全237ファイル・native input全403ファイルも照合し、製品変更・版更新・再発行は行っていない。
- 固定EXEの個別表示/アイコン/復元 **14群**とsmokeを再利用し、グループ **7群**・カスタマイズ全体 **6群**を追加、計 **27群**成功。Node/.NETのバッジ、グループの位置/スクロール/終了、実際の本体サイズ変更、ボタン追加/編集/コマンド実行、右クリック割り当て、実再起動とページ初期化を確認した。16回のラベル/アイコン位置追跡も入力・ログ・EXEを照合して再利用した。
- 追加GUIの初回は、旧試験が本体ではなく一覧先頭の一時パネルをサイズ変更したため停止。本体URLによる選択と実際の幅増加を検査するよう修正し、実測の1pxのサイズ丸めを許容した。全体モードにも旧セクション/背景/overlay参照と「個別iconOnlyなし」の期待が残っていたため、現行UIのセクション・スイッチ・一時パネルへ追従し、該当コマンド全体を再実行して成功した。変更はGUI試験だけで、既存のlabels-only/icons-only分岐と製品は不変。停止した試験の部分成功は最終成功へ流用していない。
- 利用者が動作確認した発行済み **0.96.1 / SHA256 `08d505e1d687119a30043e7e00d6064038b84e9641bb54cc7ac525b5543f529b`**を保持。証跡は`.artifacts/commit-validation-ribbon-0961-20261027/`のplan/before/after/validation・再利用元の入力/完全ログ・追加ログ・stage/commit/remote記録。参照資料・直近成功・診断を保持し、削除0件。依頼に従いGitHubのみへ通常pushする。GitHub Release/実利用先deployは対象外。

## 2026-10-27: 折りたたみ時の個別非表示ラベルのちらつき 0.96.1

- 未コミット0.96.0変更を保持して追加修正。折りたたみモデルの到着でDefault Shellが全項目のラベルを再生成し、実際の幅が狭くなるまで個別iconOnlyの文字も一時表示される原因を確認。修正前のソースで広い領域を保った8回の実切り替えを行い、通常/コマンド/グループ/子/表示モードの5種類で再表示を検出して再現した（期待した試験終了コード1）。再現ログは`.artifacts/ribbon-label-flash-0961-20261027/gui-before.log`。
- Schema 2の表示投影へ任意のhideLabelを追加し、個別iconOnly/空グループ名による常時非表示と、全体モードによる実効iconOnlyを区別。共通RibbonIconで常時非表示のラベルを描画せず、通常のラベルはDOMに保持して従来の領域幅のcontainer queryで切り替える。通常/持続的グループ/一時パネルの親子へ共用した。従来のiconOnlyとschema 1、タイトル/アクセシブル名/操作IDを保持する。保存設定/ファイルの追加なし、通常修正として0.96.1へ更新。
- 既存の位置ずれ対策は維持。レイアウトCSSと設定schemaの入力hashが0.96.0と一致することを照合。最初の位置試験は、検証用に広げた領域自体が6px移動する状態でviewport絶対座標を比較して停止したため、リボン内の相対位置と通常幅でのリボン全体の原点を別々に追跡する試験へ修正。製品の位置/幅/タイミングやCSSは変更していない。
- 発行前レビューに阻害指摘なし。固定lockfile install・型検査・build/publish、関連Node **114/114件**（fail/skip/cancel 0）成功。ソースGUI **4群**、固定EXEのラベルGUI **4群**＋アイコン/復元GUI **10群**＝**14群**、隔離smoke成功。広い領域を保つ8回と通常幅の8回の計16回をMutationObserver/rAFで追跡し、個別非表示文字の再表示0・アイコン相対位置のずれ0、通常幅ではリボン原点のずれ0を確認。通常ラベルを保持する処理、個別指定解除、グループ親子、モード別画像/アイコン、既定復元、実再起動後の保持も確認した。実利用セッションの物理フレーム録画ではなく、隔離profileと制御した幅遅延での検証である。
- **0.96.1 / 170,685,740 bytes / SHA256 `08d505e1d687119a30043e7e00d6064038b84e9641bb54cc7ac525b5543f529b`**。EXE/File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、GUI/smokeコピーと最終EXE、801入力の最終hash一致。証跡は`.artifacts/ribbon-label-flash-0961-20261027/`のreview/validation/bundle/environment/preserved-layout/cleanup・入力hash・完全ログ、ソース/固定GUIのtransition-trace.jsonと結果/画像。
- 検証プロセス0件。実行方式ごとの直近3回と、古い最終検証の参照資料・今回の再現/測定診断を保持し削除0件。実利用設定の変更・物理入力は未実行。ローカル発行まで完了、未コミット、push/GitHub Release/実利用先deployなし。

## 2026-10-26: アイコンの既定値復元とモード別設定 0.96.0

- 直前の未コミット0.95.0変更を保持して追加実装。通常項目・コマンドボタン・グループの編集左下に「アイコンを既定値に戻す」を追加。共通SettingsDialogの任意resetActionとして配置し、受付準備前/保存中は無効化する。復元は画像と固定アイコンの一時入力だけを更新し、適用で保存、取消で破棄する。名前・アイコンのみ表示・配置・コマンド・グループ色/展開方法は保持し、原画像は削除しない。通常項目は本体/登録元、グループはfolder、コマンドはextensionsへ戻す。
- 表示モード切替に「折りたたみ時」「展開時」の共通アイコン選択欄を追加。それぞれ画像/既定アイコンを独立して選べる。任意の`itemOverrides['ribbon-display-mode'].displayModeIcons`を追加したため0.96.0へ更新。未指定のモードは従来の共通icon/imageを引き継ぎ、モード別オブジェクトはその一組を上書きする。復元ではモード別指定と共通指定を両方解除し、標準の右/左矢印へ戻す。現在のPC専用表示モードや保存ファイルは変更していない。
- 公開updateItemの入力/保存検証/描画投影を整合。compact/expanded以外のキー、無効なアイコン/画像参照、他項目へのモード設定を拒否し、dry-run・原子的保存・null復元を確認。非表示側の画像も既存の再帰参照検査で削除保護されることを追加回帰で確認した。共通リセットの使い方と互換の解決規則を設計文書へ反映。
- 発行前レビューで要件、復元範囲、旧値互換、設定/API、画像保持、共通フッターの準備/保存制御、必要試験を確認し、阻害指摘なし。固定lockfile install・型検査・build/publish成功。関連Node **114/114件**（fail/skip/cancel 0）、ソースGUI **10群**、固定EXEのアイコン/復元GUI **10群**＋個別表示GUI **3群**＝**13群**、隔離smoke成功。復元の適用/取消、他項目保持、Appletの既定画像、左右の操作配置、モードごとの画像/固定アイコンを入れ替えた保存、切り替え、実再起動後の保持、両状態の既定矢印復帰、隠れている画像draftの破棄と元画像hash保持を確認した。モード別ダイアログ画像も確認した。
- **0.96.0 / 170,687,505 bytes / SHA256 `bc3a8433c0623fc5a0e3e7d60fb324e6243eeae390130677216c1fc406b69f54`**。EXE/File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、GUI/smoke用コピーと最終EXE、801入力の最終hash一致。証跡は`.artifacts/ribbon-mode-icons-0960-20261026/`のreview/validation/bundle/environment/cleanup・入力hash・完全ログ、固定GUI結果JSONと画像。
- 検証プロセス0件。source icons-onlyの終了/成功確認済み最新3回を残し、それより古い未再利用の`.artifacts/ribbon-customization-ui-1793024137563` **1件**だけを、絶対パス・プロセス参照なし・再解析ポイントなし確認後に削除。最終成功分・失敗診断・再利用資料・他の実行方式を保持した。物理入力・実利用設定の変更は未実行。ローカル発行まで完了、未コミット、push/GitHub Release/実利用先deployなし。

## 2026-10-26: リボン全項目のアイコン選択と共通カタログ 0.95.0

- 直前の未コミット0.94.8変更を保持して追加実装。通常項目（表示モード切替・Appletページ・宣言型Appletボタンを含む）を共通RibbonIconPickerへ接続し、項目名を「ボタンのアイコン」に統一。グループ/コマンドと同じ「画像」「既定のアイコン」を選べるようにした。任意の`itemOverrides[id].icon`（共通名/null）を追加したため0.95.0へ更新。ID・名前・保存画像・提供元の設定・操作IDを保持する。
- 共通アイコンを8種から40種へ拡大。既存SVG基盤へカレンダー/星/ハート/ファイル/音楽などを追加し、共有カタログ・翻訳・manifest/設定検証・公開リボン編集スキーマを整合。候補を1行に固定して候補領域だけ横スクロールさせ、キーボードフォーカスを表示範囲へ移す。共通スクロールバーを使用し、独自の幅/色は追加していない。画像/既定アイコンは共通80pxの内容領域を使い、切り替えでダイアログ高を変えない。
- 明示した固定アイコンは登録元の画像/inline iconやモード/テーマの動的アイコンより優先し、利用者の明示画像は固定アイコンより優先する。nullは元の解決規則へ戻す。Appletの既定画像を編集画面へ表示するため、リボン補助モデルへ宣言から参照する登録画像定義だけを渡す。既定画像を変更せず適用した場合は画像overrideを生成しない。選択元の切替で画像とアイコンを同時更新する親stateを関数形式へ揃え、非表示側の一時選択を保持する。
- 発行前レビューで設定/API互換、画像優先順位、無効値の原子的拒否、dry-run、null復元、画像定義の投影範囲、操作ID、共有部品、明暗/狭幅/高さ/スクロールを確認。GUIで補助モデルの画像定義不足を検出して修正・再検証し、阻害指摘なし。初回の新規単体試験は画像fixtureの不正base64、既存GUIは旧ギャラリー/追加ボタンの参照、新規Applet fixtureは最低ホスト版の不足でも停止したため修正し、部分成功を最終証跡へ流用していない。
- 固定lockfile install・型検査・build/publish成功。関連Node **103/103件**（fail/skip/cancel 0）成功。ソースGUI **7群**、発行した固定EXEのアイコンGUI **7群**＋個別表示GUI **3群**＝**10群**、隔離smoke成功。3種の通常項目・グループ・コマンド、画像選択/取消/適用・保持/復元、元画像のhash、ライト/ダークと1120/760pxでの1行横スクロール/同じ高さ、実再起動後の選択保持を確認。ソース画像と固定版の操作結果・同梱内容を照合した。
- **0.95.0 / 170,682,806 bytes / SHA256 `bdd5c9eb27dda977a72a68a7f646e7e21ab0a7e94ca43699730c89e8c24bbb21`**。EXE/File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、GUI/smoke用コピーと最終EXE、800入力の最終hash一致。証跡は`.artifacts/ribbon-icons-0950-20261026/`のreview/validation/bundle/environment・完全ログと入力hash、各GUIの結果JSON/画像。
- 検証プロセス0件。今回のアイコン/個別表示GUIは実行方式ごとの直近3回以内。失敗診断・既存の再利用資料を保持して削除0件。物理入力・実利用Appletの設定書き換え・実利用先deployは未実行。ローカル発行まで完了、未コミット、push/GitHub Releaseなし。

## 2026-10-26: アイコンのみ表示のSettingsField化 0.94.8

- 通常ボタン・コマンドボタン・グループの「リボンにアイコンのみを表示する」を、共通SettingsFieldとToggleへ統一。ラベル・入力列・区切り・余白を共通部品へ任せ、3種類の編集ダイアログを揃えた。保存値・適用/取消・全体モード/個別表示の処理は変更なし。既存の未コミット0.94.7変更を保持し、追加修正の発行として0.94.8へ更新。
- 発行前レビューに阻害指摘なし。固定lockfile install・型検査・publish成功。0.94.7の800入力と比較し、差分がpackage版・設定UI・GUI helperの3ファイルだけであることを確認。関連Node60件はruntime/model/storage/依存/試験入力が不変のため成功を再利用した。固定EXEのGUI **3群**と隔離smokeを新規実行して成功。data-testidから共通スイッチを操作し、3種類のON/OFF・適用/取消・グループ親子・名前・再起動保持を確認。3ダイアログの画像を確認し、共通Field内でのラベル/スイッチ表示を確認した。
- **0.94.8 / 170,683,932 bytes / SHA256 `5010efac92cee05e3cf6b7aaf37c879d8bca7f79ee6105c54811609dbe0d3b97`**。EXE/File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、固定GUI/smokeコピーと最終EXE、800入力の最終hash一致を確認。証跡は`.artifacts/ribbon-field-0948-20261026/`のreview/reuse/validation/bundle/environment・完全ログ、固定GUIのresult.jsonと3ダイアログ画像。
- 検証プロセス0件。今回の固定GUIは同種成功の2回目で直近3回以内、過去の診断・再利用資料を保持し削除0件。未コミット、push/GitHub Release/実利用先deployなし。

## 2026-10-26: リボン項目ごとのアイコンのみ表示を復元 0.94.7

- cleanなmainで`git pull --ff-only`による最新取得を確認して着手。通常ボタン（表示モード切替を含む）・コマンドボタン・グループの編集ダイアログへ、共通SettingsChoiceで「リボンにアイコンのみを表示する」を復元。既存のiconOnlyフィールド・翻訳・保存APIを使い、設定項目/保存ファイル/公開APIの追加なし。通常修正として0.94.7へ更新した。
- compactでは全項目の名前を省き、expandedでは個別のiconOnlyを反映する。持続的グループと一時パネルの親・子も同じ規則を適用する。表示モード切替の名前は設定カタログ/別名の解決結果を両モードで共用し、操作名はtooltipへ残す。アクセシブル名・画像・配置・実行経路・PC専用モード保存を保持した。
- 発行前レビューで適用/取消/競合検査、保存互換、全体モードと個別指定、グループ親子、アクセシビリティ、作用範囲を確認し、阻害指摘なし。版更新後の初回型検査は依存構造照合で停止したため、固定lockfileのinstallでメタデータを同期。依存版/lockfileを変えずに型検査・build・関連Node **60/60件**（fail/skip/cancel 0）成功。
- 初回2回のGUIは旧overlay URLを探す試験側の参照で停止。現行の統合グループ画面を取得するよう試験を修正し、ソースと固定EXEのGUI **各3群**を完全に再実行して成功した。各種のON/OFF、取消/適用、既定名/別名、tooltip/読み上げ名、グループ親子、compact/expanded切替、実再起動後の設定保持を確認。既存GUIの「個別設定なし」という期待値も復元後のUIに追従した。
- `publish.bat`成功。固定EXEの隔離smoke・EXE/File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、GUI/smoke用コピーと最終EXEを照合。**0.94.7 / 170,677,225 bytes / SHA256 `1eaa552c62f0994919ec7d2b71bc335ed9d08bc7096b90cad4c7e1d757d75eea`**。800入力の最終hash一致、検証プロセス0件。証跡は`.artifacts/ribbon-labels-0947-20261026/`のreview/validation/bundle/environment・入力hash・完全ログ、固定GUI結果と画像。
- 今回のGUI成功はソース/固定EXE各1回で直近3回以内。失敗診断2件、既存の再利用資料・成功不明のfixtureを保持し、削除0件。無関係な全回帰・物理入力は未実行。ローカル発行まで完了、未コミット。push/GitHub Release/実利用先deployなし。

## 2026-10-27: MCP変更不可設定の南京錠自動表示 0.94.7

- main `8ae24f2`を統合した`86382ee`から専用worktree/branchで実装。設定追加、保存ファイル追加、公開MCPツールや操作許可の追加はなく、0.94.6から**0.94.7**へパッチ更新した。primary checkoutの作業、追跡先、push/Release/実利用deployは変更しない。
- 本体設定rendererへ、既存ownerの公開フィールド・available/writable・一覧の操作/列/行制限から生成する変更可否だけを渡す。通常設定・Applet共通・Shell領域は宣言と安定した設定IDへ接続し、項目別のアイコンフラグを保存しない。従来の入力・トレイ・リボン等は既存操作Schemaを参照する。値/既定値/秘密/Task XMLやUI専用情報を公開MCPのSchemaへ追加しない。
- MCPから変更できない項目だけに共通の南京錠と理由を表示。MCP停止、read/write許可、準備状態の変化に追従し、設定用コマンドにexecute許可を追加要求しない。秘密/非公開/未対応/読取り専用・認証に結び付いた行の保護を共有し、編集可能列を持つ一覧全体は秘密列の存在だけで施錠しない。画面の直接編集は従来どおり行える。ヒントOFFでも共通ポップオーバーをキーボードで確認でき、画像選択内の検索等の一時入力は対象外とする。
- 発行前に公開判定の単一性、秘密値の非転送、即時保存/一覧/入力の互換、設定追加時の追従、権限と無効/準備状態、共通部品とポータルをレビューした。read/writeだけで実touchpad設定APIのdryRunが成功し、write取消時に拒否される試験を追加。操作許可表とApplet一覧の有効スイッチにもownerのIDを接続し、レイアウト用見出しと保存項目を区別した。阻害指摘なし。
- 固定lockfileのinstall、型検査、本体/Default Shell build、標準**129ファイル1088/1088件（fail/cancel/skip 0）**が成功。新規9件は通常/動的宣言、非公開と秘密、owner/行/列の能力と秘密を含まない投影、既存Schema、権限/停止状態、設定コマンドの実認可を確認する。最終調整後も全1088件を再実行した。.NETページ試験の初期失敗はframework-dependentホストDLLの不足だったため、既存プロジェクトをRelease buildし、試験/製品を弱めずに標準全体を成功させた。
- sourceの実MCP **45群**、タイトル/レイアウト **8群**、リボン **6群**、トレイ **5群**が成功。固定EXEでは実MCP **47群**、タイトル/レイアウト **8群**、リボン **6群**、トレイ **4群**、入力編集ダイアログ **8群**、共通並べ替え **5群**（計**78群**）とsmokeが成功。明暗/700〜1280幅、ヒントOFF、説明のfocus/Escape、画面からの編集と再起動保持、権限切替による即時反映、暗号化済み3ファイルのbytes保持、固定tools/list不変を確認した。古い試験の見出し/トリガー操作とWindow配列順への依存を現在のページID/host URLへ更新した。初期失敗と診断ログは保持する。
- `publish.bat`終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170712527 bytes / SHA256 `bc0b56974adcfc4109d7d45ec466de61ce011276717c327923bec744aaeab6aa`**。File/ProductVersion、feedの版/size/hash、ASAR内package/Default Shell、全ビルド出力**250ファイル**と追加resource **621ファイル**、固定コピーのhashが一致した。照合helperの初回はWindows上のASARパス区切りが誤っていたため、製品を変更せずnativeパスへ修正して成功した。既存deploy.local.txtの不在も保持する。
- 最終**780入力**と参照Applet manifestは、最終調整後の標準/source検証前後・発行後・固定EXE検証後で一致。Node **24.22.1**、pnpm **12.10.1**、Electron **45.0.0**、.NET SDK **10.0.403**、Windows 11 x64を確認。後続変更は本記録と無視対象の証跡だけで、製品再変更/再発行はない。
- 固定MCP試験の専用Limited Taskは登録もXMLも残らず、専用GUIプロセス0を確認した。参照中の成功・固定コピー・初期診断・過去機能の証跡を保持し、削除0件。Pause/F13〜F24のOS送信/登録、実UAC承認、Windowsサインイン、物理入力・touchpadの実設定書込みは行っていない。確認用隔離profile以外の設定/認証は変更しない。
- 正本は[設定API](docs/settings-api.md#設定画面の南京錠)と[設定基盤](docs/settings-foundation.md)。コマンド/完全ログ/入力・出力hash・profile・レビュー・環境・後片付けは`.artifacts/mcp-settings-locks-20261026/`、最終stage/commit照合は`.artifacts/commit-validation-mcp-settings-locks-20261026/`へ記録。main統合と、owner投影/UI/試験を一体にした機能変更の2コミットに分ける。

## 2026-10-26: main 8ae24f2のMCP設定worktree統合

- cleanな`codex/mcp-settings-design` / `6b15760`からorigin/mainをfetchし、ローカルmainと一致する`8ae24f2`（0.94.6）を統合。5ファイルの競合は両検証履歴、mainの5列トリガー/並べ替えUIと役割の説明、worktreeの統合済み設定変更許可・共通宣言を残して解消した。primary checkout、追跡先、push/Release/deployは変更しない。
- 固定lockfileで依存記録を同期し、型検査・本体/Default Shell build、関連84ファイル866件、sourceの共通並べ替え・トリガー・MCP設定のGUIに成功。MCP gateway内の旧「上へ」ボタン操作をmainの既存handle/ArrowUpへ変更し、ページラッパーのlocator経由で再検証した。初期2回のGUI失敗は古い試験操作で、最終成功とは区別して保持する。
- 証跡は`.artifacts/mcp-settings-locks-20261026/`の`merge-*.log`/`*-result.json`、`merge-before.json`/`merge-after.json`。検証後に製品コードは変更せず、試験操作1ファイルと本記録の差分を照合した。統合元の保存形式・固定MCPツールを保持する。今回の確認用発行は、続く南京錠表示の実装後に版更新して行う。

## 2026-10-26: 起動設定のMCP接続と非同期保存 0.94.4

- main `8b271af`の統合commit `6d681fa`から同じ専用worktree/branchで継続した。既存のstartAtLogon/runAsAdministrator・PC専用保存ファイル・固定6入口を維持し、新しい保存項目/ファイルや破壊的な契約変更はないため、発行済み0.94.3から**0.94.4**へパッチ更新した。primary main、追跡先、push/Release/deployは変更しない。
- 共通設定APIは非同期ownerの完了まで応答を待ち、待機中/完了後のrequestIdを区別する。保存直前のpreflightで元callerの最新許可・主体・対象/Schema・値revisionを再確認し、準備したOS変更の巻戻しは所有サービスへ委譲する。旧主体の遅い成功/失敗が新主体の同名requestIdキャッシュを汚さないよう、要求recordだけを更新する。従来の同期owner・読取り・dryRunは同期応答と既存512件上限を維持し、非同期失敗もAppDockApiの安全なcode/messageへ変換する。
- `category=launch`のfields対象へ起動登録/管理者起動を公開し、read + writeで変更する。候補EXE・引数・スクリプト・Task XML・管理者再起動/復旧の実行を公開しない。メタデータとdryRunは所有する能力キャッシュを使い、PowerShellを起動しない。開発版/復旧待ちの書込みを拒否し、標準ユーザーの制限も既存所有検証へ渡す。
- 実保存はWindowsLaunchの同一ユーザー/元EXE/引数/InteractiveToken検査、復旧journal、登録照合とPC専用設定保存を待ってからsettingsSavedを返す。値と上書き状態が同じsetでOS再同期せず、reset/既定値setは現在PCの上書きを除去する。runAsAdministratorは次回起動/ログオンTaskへ適用し、現在のトークンを変更しない。effectVerified=falseとUAC手動承認・取消・復元不能時のローカル復旧を維持する。
- 発行前に同期互換・認可/主体/Schema/競合・キャッシュ・PC保存/OS巻戻し・秘密非公開・UI互換と必要回帰をレビュー。既存応答用の権限スナップショットを保持して再認可だけを新しく取得し、標準ユーザーでも持込み済みの管理者希望値を解除できるようにした。journal書込み失敗もOS変更前に既存の設定エラーepisodeへ接続する。阻害指摘なし。
- 固定依存install、整形、型検査、本体/Default Shell buildが成功。関連標準は**84ファイル866/866件、fail/cancel/skip 0**。一次回帰865件のうちownerの12件を、Highest/logonの一括正常保存を追加した13件で置き換えて集計し、他の成功結果を再利用した。差分は当該unitファイルだけで、製品/GUI/依存は不変。新規回帰は非同期基盤8件と起動owner13件で、待機/再送/主体切替/応答上限、取消/登録失敗/保存失敗/復元不能、全般/PC保存、既定値falseの上書き解除、競合・許可取消時の実owner巻戻しを検証した。標準全体は未実行。
- sourceの実MCP **41群**・既存MCP設定UI **10群**、固定EXEの実MCP **43群**・既存起動設定UI **5群**・MCP設定UI **10群**・smokeが成功。固定MCPはLimited Taskの実登録/照合、同じ要求の再送、ネイティブtoggleとの連動、古い要求拒否、resetによる解除、共有/暗号文bytesと固定tools/listの保持を確認した。既存起動UIは日本語/空白/引用符のある元EXE、Task Schedulerの明示Run/LastTaskResult=0、設定の即時保存と再起動保持、明暗3幅、通常トークンのまま管理者希望値を切り替える動作を確認した。
- 最終照合で実環境の.NET SDK **10.0.403**を確認したため、先行するnative成功の再利用を取りやめ、条件/選択のnative fixture **46件**を再実行した。.NET通知fixtureを現SDKでRelease buildし、同じ固定EXEのNode/.NET接続・所有アクション・入力失敗/保存/通知ポリシー反映・再起動を **8群**追加確認。製品ソースとEXEの再変更はない。Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、Windows x64を維持した。
- `publish.bat`終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170705415 bytes / SHA256 `18f1531d01e7792c45e1eca46983f0597cb5a405d8fb2916d74739d58817e4a7`**。File/ProductVersion、feed版/size/hash、ASAR内package/Default Shellとすべての固定コピーを照合した。最終774入力と参照Applet manifestはレビュー後・発行後・固定/追加native検証後で一致し、後続追記は文書/証跡のみ。
- テスト用の2つのEXE/profileに対応するTaskを最後に個別読取りし、登録だけでなくXMLも存在しないことを確認した。専用プロセス0、今回の各script/方式の成功は3回以内、削除0件。過去の参照profile/固定コピー・初期の型/監査パス等の診断・ビルド出力を保持する。実UAC承認/Highest実行、実Windowsサインインは未確認。模擬UACでは承認経路/取消を検証し、実プロンプトの自動承認、Pause/F13～F24のOS送信/登録、実利用の設定/認証の変更は行っていない。
- 正本は[設定API](docs/settings-api.md#windows起動設定)、[起動設定](docs/launch-settings.md)、[設計](docs/mcp-settings-design.md)。証跡は`.artifacts/mcp-settings-launch-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-launch-20261026/`。source-profiles.json/fixed-profiles.json、task-audit.json、smoke-profile.jsonへ結果/hashを記録する。main統合、非同期保存基盤、起動設定adapterを独立したコミットへ分ける。

## 2026-10-26: main 8b271afのMCP設定worktree統合 0.94.3

- cleanな`codex/mcp-settings-design` / `15f623c`でorigin/mainをfetchし、ローカルmainと一致する`8b271af`（0.94.2）を統合した。追跡先の新設、primary mainの変更、push/Release/deployは行わない。入力ごとの実行方法/除外設定と通知のセッション寿命/画面/Windows起動経路を取り込み、専用worktreeの確認版を**0.94.3**へ更新した。設定/保存形式の変更はmain側の既存版更新を保持する。
- 8ファイルの競合は、両方の検証履歴、mainの入力別inputExecutionModes/excludedProcessesと現在の条件、宣言から生成する共通ブラウザ設定、MCPの統合済みread/write許可と非公開保護を残して解消した。共通ブラウザのUI/カタログへ手書きの重複一覧を戻さず、トリガー固有の除外欄は別に保持する。通知の現在の寿命と画面・起動経路はmainの実装を使用する。
- 差分・所有サービス・公開/許可・保存分類・入力/通知への影響を発行前にレビューし、阻害指摘なし。固定依存install、整形、型検査、本体/Default Shell・nativeホスト・Node/.NET fixtureのbuildが成功。関連標準**81ファイル831/831件（fail/cancel/skip 0）**と、共通条件/選択のnative fixture **46件**が成功した。標準全体は未実行。
- 隔離source/固定EXEで実MCP **各40群**、統合トリガー **各18群**、入力別/共通設定 **各9群**、通知センター **source 8群/固定7群**、固定EXE smokeが成功した（廃止Shell割当の1群は既存試験どおりsourceのみ）。MCPの暗号文/権限/固定ツール、入力別first/all/継承と除外・保存順、通知の起動中寿命/バッジ/所有アクション/旧履歴保持/再起動後破棄を確認した。物理入力・実Windows通知クリックやサインイン・実利用の設定/認証は変更していない。
- native試験の初回はfixture JSON引数が不足し、引数を補って46件成功。入力GUIはmainで変更された追加tooltipの古い期待値を現在の文言へ修正し、対象GUIを再実行した。初回770入力との差はこのGUI helperだけで、参照しない標準/MCPの成功は保持。以後の770入力と参照Applet manifestはsource後・publish後・固定検証後で一致した。失敗/整形/証跡形式の診断を保持する。
- `publish.bat`終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170709951 bytes / SHA256 `e3188ca3440d8917b5021bafb0de6054382216d4d9b613b15092f43a167b22ab`**。feedの版/size/hash、ASAR内package/同梱Default Shell、固定試験コピーのhashを照合した。Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.402、Windows x64の固定環境を維持した。
- 証跡は`.artifacts/mcp-settings-main-launch-20261026/`、入力/結果/ログ・stage/commit照合は`.artifacts/commit-validation-mcp-settings-main-launch-20261026/`。今回の成功は各方式3回以内で、失敗/参照済みprofile・固定コピー・ビルド出力は保持、削除0件。専用テストプロセス0を確認した。起動設定APIはこの統合の次の実装単位とする。

## 2026-10-26: トリガー・並べ替えUI 0.94.6のコミット検証

- 0.94.4〜0.94.6の説明・5列構成・無効マーク・円形歯車・共通の↑↓並べ替え・MITメタデータをまとめて確認。933入力、既存の完全ログ、固定EXEと試験コピーを照合し、標準120ファイル **941件**のうち **931件**の成功を再利用。変更されたCSSとrendererを読むappearance **7件**・Shell境界 **3件**を追加して成功した。runtime/保存/API・依存/SDK・fixtureは同一で、locale差分は設定UIの文言だけ。直前の型検査/build/publish成功を再利用し、製品変更・版更新・再発行は行っていない。
- 固定0.94.6で未実施だった統合トリガー一覧 **19群**を追加し、既存の共通並べ替え5群・宣言型一覧5群・トリガー設定8群と合わせ **37群**、隔離smokeの成功を確認。前後の933入力は一致し、変更範囲に阻害指摘なし。発行EXEのSHA256は`96ef3e2cbdbbcf564413c5dbb8a1a6f921b356a29a7350b823b08560a15e8afd`のまま。
- 証跡は`.artifacts/commit-validation-trigger-ui-0946-20261026/`のvalidation・入力hash・追加試験ログ・stage/commit/remote記録。依頼どおりプッシュ先は **GitHubのみ**とし、originのfetch/push URLとmain先端を確認して通常pushする。過去の両リモート運用は今回へ適用しない。既存/今回の参照証跡・直近成功・他作業の状態不明分を保持し、削除0件。Release/実利用deployは対象外。

## 2026-10-26: 共通の表示順ダイアログをハンドルと↑↓キーへ統一 0.94.6

- 既存の0.94.4〜0.94.5変更を保持し、`SettingsOrderDialog`の上下ボタンを削除。Applet管理・AI・MCPクライアントで、ハンドルにフォーカス中の修飾なし↑↓キーによる並べ替えへ統一した。同じ共通部品を使う画像ライブラリー・宣言型一覧にも適用される。ドラッグ・OK/キャンセル・保存時の競合検査を維持し、文言と既存GUIの操作手順を更新した。
- 安定IDで移動したハンドルを追跡してフォーカスとスクロールを保持する。修飾キー・IME変換中・保存中・範囲外の移動を抑止。発行前レビューでスクロール下端のフォーカス枠の欠けを見つけ、共通ハンドルに4pxのスクロール余白を追加して再確認した。保存項目・runtimeは変更せず、通常修正として0.94.6へ更新。MIT設定を維持。
- frozen install・型検査・build・publish成功。関連Node **18/18件（fail/cancel/skip 0）**。ソースGUIは共通並べ替え **5群**・宣言型一覧 **5群**に成功。初回の試験データがAI登録上限を超えていたため長い一覧をMCP側へ移し、Appletの非表示Default Shell保存枠を考慮して表示対象の期待値を修正した。製品の上限・保存仕様は変更していない。
- 固定EXEでは共通並べ替え **5群**・宣言型一覧 **5群**・既存トリガー設定 **8群**、隔離smokeに成功。3画面の連続↑↓、フォーカス、両端、修飾キー/IME、ドラッグ、取消・適用・再編集・実再起動、AI既定接続の保持を確認。18件のMCP一覧を480×540pxで14回移動し、ハンドルとフォーカス枠が表示内に収まることを確認した。ライト/ダークの固定版画像も確認。宣言型一覧は外部更新との競合を拒否し、ローカル順序と取消操作を保った。
- **0.94.6 / 170,698,203 bytes / SHA256 `96ef3e2cbdbbcf564413c5dbb8a1a6f921b356a29a7350b823b08560a15e8afd`**。EXE/File/ProductVersion・feed・Default Shell・MIT設定、out全237ファイル・native input全403ファイル、全試験コピーと最終EXEを照合。697入力が最終状態と一致。証跡は`.artifacts/shared-order-0946-20261026/`のreview/validation/bundle/environment、入力hash・完全ログ・固定GUI画像。
- 型検査/Node成功後の変更は試験fixtureとスクロールCSSだけで、対応入力を照合して成功を再利用。最終CSSはbuild・ソース/固定GUIで再確認。物理入力・OSへのPause/F13〜F24送信/登録・Windows接続書き換え・無関係な全回帰は未実行。検証プロセス0件。直近成功分・診断/参照証跡・他作業の状態不明分を保持し、削除0件。未コミット、push/Release/deployなし。

## 2026-10-26: 割り当ての無効マークとMITメタデータ 0.94.5

- 直前の0.94.4変更を保持して追加修正。コマンドトリガーの「無効」をトリガー列から「いつ・どこで」の条件前へ移動し、共通配色による枠・背景・太字のマークとして表示する。個別割り当ての`enabled`だけを参照し、ジェスチャー機能全体の有効/無効やコマンド利用可否とは区別する。他の一覧形式の表示・保存・入力処理は維持した。
- `package.json`の`license`を依頼どおり`MIT`へ変更。`private`や依存版は変更していない。通常のUI/メタデータ修正として0.94.5へ更新し、同梱packageの版とMIT識別子も照合した。
- 発行前レビューで3方式、条件編集・操作列、テーマ配色、状態の読み上げ、保存/runtimeへの影響を確認し、阻害指摘なし。frozen install・型検査・build・publish成功。0.94.4の入力/完全ログと照合して影響のない関連Node **23件**の成功を再利用。初回GUIは表示倍率による枠幅0.666667pxと期待1pxの差で停止し、試験を正の実線幅の確認へ修正して再成功した。製品側の追加修正なし。
- ソース/固定EXEの統合GUI **各19群**と固定EXEの隔離smoke成功。キー・マウス・タッチパッドの無効化で条件欄だけにマークが表示され、再有効化で消えること、ライト/ダークの枠表示、5列操作・保存・実再起動を確認。固定版の画像も確認した。
- **0.94.5 / 170,680,000 bytes / SHA256 `9f39b9a696484d0350149ab476e7388d934c6cac0bcc422908b72853b0d6260d`**。EXE/File/ProductVersion・feed・Default Shell版・同梱MIT設定、out全237ファイル・native input全403ファイル、試験コピーと最終EXEを照合。696入力は最終確認時に一致。証跡は`.artifacts/disabled-binding-0945-20261026/`のreview/validation/bundle/environment、入力hash・完全ログ・固定GUI画像。再利用元は`.artifacts/trigger-ui-0944-20261026/`。
- 物理入力、OSへのPause/F13～F24送信/登録、Windows接続書き換え、無関係な全回帰は未実行。検証プロセス0件。直近成功分・診断/再利用証跡・他作業の状態不明分を保持し、削除0件。未コミット、push/Release/deployなし。

## 2026-10-26: トリガー設定の説明・並べ替え・5列構成 0.94.4

- クリーンなmainで`git pull --ff-only`し、`8b271af → 21e4979`を取り込んで着手。4設定ページとトリガー設定ダイアログの説明を役割に合わせて更新し、用語を`docs/command-triggers.md`へ整理。ダイアログの説明は編集中も保持し、変更件数と移動結果を共通状態欄へ表示する。
- トリガー設定の上下ボタンを廃止し、ドラッグまたはハンドルにフォーカス中の修飾なし↑↓で並べ替える。移動後の同一ハンドルへのフォーカスとスクロール追従、先頭/末尾、修飾キー/IME中の抑止を確認。3方式の取消・適用・再編集・実再起動、長い一覧で14回連続移動後の表示位置も成功。一般の表示順ダイアログの操作方式は変更していない。
- 見出し上余白を共通OrderDialogFrameのタイトル行へ移し、文字とヒントの中心を整列。共通ListIconの歯車を中心(12,12)・縦横同径の8枚歯1個へ更新した。統合一覧をコマンド/トリガー/歯車/いつ・どこで/鉛筆と削除の5列へ変更。操作列の見出しは文字なし・読み上げ名あり。固定幅、32px操作、歯車と条件の余白、ホバー/フォーカス、Tab順、未割り当て、狭幅の縦横スクロールを確認した。
- 発行前レビューで要件、共有部品と保存・実行処理への影響、必要試験を確認。初回統合GUIはpull済み文言と旧期待値の差で停止、期待値を現行文言へ更新。次に5列化による条件欄の幅不足を検出し、セル左右余白を12pxへ調整して再検証した。最終レビューに阻害指摘なし。frozen install・型検査・build成功、関連Node **23/23（fail/cancel/skip 0）**。ソースGUIは設定8群・統合一覧18群成功。
- 初回publishは終了コード0だったが、直後の照合で配布先のEXE/asar/feedが0.94.3になっていることを検出。EXE更新日時は当該publishログ完了後で、更新元は未確定。製品ソースは0.94.4のまま。同版の再発行直後に全内容を照合し、最終の固定EXEで設定 **8群**・統合一覧 **18群**・隔離smokeに成功した。失敗を最終成果物の成功証拠へ含めていない。
- **0.94.4 / 170,687,312 bytes / SHA256 `2ddb9df04d5bb805d211c829c8fcbc140ce22aa05c774e84bf62537747086137`**を発行。File/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイル、固定試験コピーと最終EXEを照合。696入力の最終一致を確認し、初回入力からのCSS/GUI期待値3ファイルの調整と再検証を記録した。ライト/ダーク・1280/760/480pxの画像、ヒントの中心一致、継承/明示切替時の高さ保持も確認。
- 証跡は`.artifacts/trigger-ui-0944-20261026/`のreview/validation/bundle/environment、入力hash・完全ログ・版不一致の観測記録と固定GUI画像。無関係な全回帰、物理ジェスチャー、OSへのPause/F13～F24送信/登録、Windows接続書き換えは実施していない。検証プロセス0件。直近成功分・今回の診断/参照証跡・用途不明の他作業を保持し、削除0件。未コミット、push/Release/deployなし。

## 2026-10-26: 通知基盤0.94.2のコミット・両リモートpush検証

- 0.94.0〜0.94.2の通知履歴/activeバッジ、カードの均一細枠と共通×（バナー/desktop右上・センター左外）、Windows通知からの本体復帰と個別処理/センターへの振り分け、本体発行元のAppDock1項目化を対象にレビュー。通知の所有権・操作ロック・安全な要約を保持し、Desktopの最前面指定は利用者指定どおり変更しない。保存ファイル/既読・削除契約の廃止は0.94.0のマイナー更新、見た目/復帰/フィルターの追加修正は0.94.1/0.94.2のパッチ更新。
- 既存の .artifacts/notification-session-20261026・notification-ui-20261026・notification-source-20261026 の入力・完全ログ・生成物を照合し、型検査/build/publish、変更のない通知/読み上げ/警告/エラー/情報/リボンと最新版センター/Windows/画面遷移の単体 **140件**を再利用。未実施の標準101ファイル **801/801件**を追加し、合計 **120ファイル・941/941件（fail/skip/cancel 0）**。全.NET/Node fixtureもビルドし、最終回帰前後の全入力hash一致を確認。
- 追加回帰で廃止済みの履歴削除翻訳への期待値を発見し、外部タイトルを保持する現在の閉じる文言へテストだけ修正。失敗したコマンドの部分成功は使わず、未実施分全体を再実行。通知設定GUIは既存の一覧/編集ダイアログに追従し、表示見出しの重複と既定ページ描画待ちも訂正。製品コードの追加修正・版更新/再発行は不要。
- 現在の固定EXEで通知設定 **8群**（Node/.NETの設定/操作、期限/手動、所有権・世代、不正値非保存、検索、明暗、再起動後の設定保持/履歴破棄）、Desktop **5群**、Windows Shell起動 **8群**（2配置/profile・hidden/minimized復帰・個別処理1回・センター・古いURI/cold起動）、操作結果通知 **2群**を追加確認。現行EXEのセンター **7群**を再利用して固定EXE計 **30群**、同一表示ソースのバナー **8群**も再利用。物理Windows通知クリック・実メール受信・物理ロック・他の最前面Windowとの間欠症状は未確認。
- 発行物は **0.94.2 / 170,689,362 bytes / SHA256 8b32103922e0ab14c67c120757b2cdf9c7a15092ab01a164b84c3dbadf941985**。EXE/feed/Default Shellと839生成物を照合。過去版EXEのGUI成功を現行版の成功へ読み替えない。
- 証跡は .artifacts/commit-validation-notifications-0942-20261026/ のreuse-audit/validation、全入力hash・完全ログ・GUI結果・stage tree/commit tree/remote heads。今回の失敗/成功・元の再利用資料を保持し、削除0件。対象ファイルだけをstageし、作業ファイルとindex blob・commit treeを照合して通常pushする。GitHub Release/実利用deployは行わない。

## 2026-10-26: 通知履歴の起動中限定とアクティブ件数バッジ 0.94.0

- cleanなmainで`pull --ff-only`による最新確認後に実装。通知の未読/既読状態・件数・検索・個別/一括既読・履歴削除・選択欄を撤去。`NotificationHistoryStore`を削除し、履歴ファイルの読込/保存を終了。残存する旧ファイルへの変更・削除は行わない。終了/再起動でアクティブ通知と終了履歴を破棄する。
- 発行元のpersistent/session/none入力は受け付ける。persistentは起動中の安全な要約として扱い、終了時に表示用の詳細を要約へ置換する。終了済みは両方針合計で最新1,000件、終了時刻順に整理しアクティブは除外。固有操作・閉じる・解消/撤回・期限・ロック保留・操作ロックは維持した。
- リボンのnotificationsへNotificationServiceのactive件数を既存共通バッジで投影。0件非表示、1〜99件は数値、100以上は99+、説明には実件数。通知ID単位で数え、センターのみ/複数配送先/ロック保留を含む。開く/検索/同一ID更新では件数不変、終了時に減少。グループの親の点と両表示モードも既存契約へ接続。固定文言はhostTextへ統一。
- 発行前レビューで寿命・要約・上限・操作検証・保存/API・バッジ所有者検査と関連試験/文書を確認。旧履歴保存を前提にした試験/文書を修正し、阻害指摘なし。保存ファイル廃止と既読/削除契約の撤去として**0.94.0**へマイナー更新。frozen install、型検査、build、publish成功。初回型検査は版更新後の依存記録不一致で停止したが、固定lockfileのinstall後に成功。
- 関連Node回帰 **131/131（fail/skip/cancel 0）**。通知寿命・保留・操作競合・安全な要約・永続化なし・1,000件上限・99+・グループ集約、警告/エラー/情報、読み上げ、Windows/desktop配送、設定通知、リボンを検証。ソースGUI: センター **7群**、バナー **8群**。固定EXE: センター **6群**、操作結果通知（commands-only）**2群**成功。Node/.NET通知の実接続・操作、既読/削除/チェックボックス不在、検索、閉じた後の要約、バッジ3→2→3と再起動後0、両リボンモード、明暗テーマを確認。
- 操作結果GUIの初回は既存ショートカットAPIのbusy/cancelledを期待値へ含めていなかったため失敗、次はセンターの非同期表示待機不足で失敗。テストだけを現行契約/表示準備待機へ修正し、同じ固定EXEで最終成功。失敗ログも保持する。製品の再修正・再発行なし。
- 配布物: `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`、**170,677,546 bytes / SHA256 `0314bfa727c7d3d7905f656ef6faa0ada53a2ed1b22ddd734a422a27a81016d1`**。EXE版、feed版/size/hash、Default Shell版、試験コピーを照合。検証入力734ファイル・生成物839ファイルのhashと完全ログは`.artifacts/notification-session-20261026/`のvalidation/bundle/before/final/reviewへ記録。検証後の入力差は上記information GUI試験1ファイルだけで、再試験前後の入力一致も確認した。
- 無関係な全回帰と通知設定GUI全体は未実行（同GUIの履歴期待値のみ更新）。実外部受信、物理Windows通知クリック、物理ロック遷移は未確認。隔離検証プロセス0件。今回の編集用一時スクリプトを削除。成功した同方式の直近3回・失敗/結果不明・参照用の証跡を保持し、テストフォルダー削除0件（inventory参照）。未コミット、push/Release/実利用deployなし。

## 2026-10-26: トリガー設定UIの仕上げと入力別実行方法のコミット検証 0.93.1

- 0.93.0の未コミット変更を保持して追加修正。統合一覧の見出しを「トリガー」、追加tooltipを「キートリガーを追加」「マウストリガーを追加」「タッチパッドトリガーを追加」に変更し、読み上げ名も整合。設定ボタンは共通の歯車1枚のSVGを使用した。
- 実行方法欄の継承時説明は`visibility: hidden`と`aria-hidden`で非表示にし、折り返しを含む領域を保持する。3方式のinherit/first/all切替とライト/ダーク・1280/760/480pxで高さ・位置の不変と説明の表示状態を確認。狭幅、長い一覧、取消、再編集、順序との同時保存、実再起動も成功。
- 発行前レビューで4要件、共有部品への影響、既存の入力別保存・実行動作の保持を確認し、阻害指摘なし。frozen install、型検査、build、publish成功。0.93.0の697入力と完全ログを照合し、変更8ファイルを特定。影響のないNode **201件**とnative共通fixture **46件**の成功を再利用し、文言/統合トリガー **14/14件**を再実行（計215件、失敗なし）。旧EXEの成功を新版の検証結果として扱っていない。
- **0.93.1 / 170,683,555 bytes / SHA256 `0738f101c9822b5d7f43620eed0319a7f50220b57748c58af8da636a40b2fff8`**を発行。固定EXEの設定 **7群**・統合一覧 **18群**・隔離smoke成功。一覧の文言/tooltip、歯車の画像、フォーカス/スクロール/保存を確認。File/ProductVersion・feed・Default Shell版、out全238ファイル・native input全403ファイル、試験コピーと最終EXEを照合した。
- 証跡は`.artifacts/trigger-ui-0931-20261026/`のreview/validation/bundle/environment、697入力hash・完全ログ・画像。実行処理の再利用元は`.artifacts/input-execution-20261026/`。コミット用の対象hash・stage tree・commit treeの照合は`.artifacts/commit-validation-0931-20261026/`に記録する。
- 物理入力、OSへのPause/F13～F24送信/登録、Windows接続設定の変更は実施していない。検証プロセス0件を通常ユーザー権限で確認。直近の成功分、参照/再利用証跡、用途不明の他作業を保持し、削除0件。push/Release/deployなし。

## 2026-10-26: 入力別の実行方法とトリガー設定ダイアログ 0.93.0

- cleanなmain `587cb41`で`pull --ff-only`による最新確認後に実装。キー・マウス・タッチパッドの各設定へ`inputExecutionModes`を追加し、正規化した入力IDごとにfirst/allを指定できるようにした。未指定は全体のexecutionModeを使用し、旧設定は空マップへ正規化。設定追加として0.93.0へマイナー更新。
- 共通ダイアログを「トリガーの設定」に変更し、「ジェスチャーの設定を使用する」（既定）・「最初の1つ」・「すべて」と実行順をまとめて編集。継承中は全体の現在値を表示し、1件の入力でも編集できる。入力を切り替えても一時変更を保持し、適用時に方法と順序を原子的に保存。同じ入力への外部編集は競合として拒否し、他入力の変更を保持する。本文スクロールと固定フッター、コマンド名/条件の2行表示を確認した。
- TSの共通実行計画とnativeマウスの待機表示/選択へ同じ実効値を接続。キー・タッチパッドの元入力制御、条件判定、exe除外、同一コマンドの重複除去、既存の保存順を維持。JSON/リセット/3方式の公開configure APIも接続し、種類全体の設定とWindows接続を入力別指定から分離した。
- 発行前レビューで既定互換、キー別名の1バッチ選択、nativeとの一致、保存競合、APIの許可/原子性、文言・狭幅・長い一覧を確認。説明の重複とスクロール期待を修正して再検証し、発行阻害指摘なし。frozen install・型検査・build・publish成功。関連16ファイルのNode回帰 **215/215、fail/cancel/skip 0**、TS/C#共通fixture **46件**成功。
- 固定EXEでトリガー設定 **7群**、統合一覧 **18群**、機能設定 **9群**と隔離smoke成功。3方式の継承/first/all/解除、取消、再編集、順序との同時適用、別入力の一時変更保持、全体設定/接続の保持、実再起動を確認。ライト/ダーク、1280/760/480pxと700×540の長い一覧で操作・フッター到達を確認し、固定版の画像も確認した。
- **0.93.0 / 170,698,578 bytes / SHA256 `34378b092cddaa671a628e73ecaf34ff3505660ceefb7da08176049ed39ee114`**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`のFile/ProductVersion・feed・Default Shell版、out全238ファイル・native input全403ファイルと固定試験コピーを照合。697入力は最終検証前後で一致。証跡は`.artifacts/input-execution-20261026/`のreview/validation/bundle/environment、入力hash・完全ログと固定GUI画像。
- OSへのPause/F13～F24送信/登録、Windowsタッチパッド接続変更、物理入力試験、無関係な全回帰は実施していない。未コミット、push/Release/deployなし。完了時の検証プロセス0件。直近の成功分・参照/再利用証跡・用途不明の他作業を保持し、削除0件（同フォルダーのtest-folder-inventory参照）。

## 2026-10-26: exe除外と設定UI 0.92.2のコミット検証

- 利用者によるplaceholderの識別しやすさの確認後、既存のレイアウトcommit `ebd4aa2`に続く除外実装・共通設定欄・placeholder調整の42ファイルを対象としてレビュー。0.92.0の実行基盤/API/保存の180回帰とC#共通fixture41件、0.92.1の表示/翻訳等21回帰、最終0.92.2の配色7回帰、各版の固定GUI35/17/9群と最終smokeの証跡を照合した。
- 最終694入力、23ログ、各固定GUIの結果とコピーEXE、発行済み0.92.2のSHA256、out237・native input403ファイルの一致を確認。0.92.0以後の9入力差分は表示/文言/版と対応する試験、0.92.1以後は共通色と版の2入力だけで、実行基盤・native・関連試験は同一。後続の変更に対応した成功結果を再利用し、追加製品変更・不足回帰はなく、再実行・版更新・再発行は行わない。
- 証跡は`.artifacts/commit-validation-0922-20261026/`のreuse・stage・commit記録。対象だけをstageし、各blobと作業ファイル、stage treeとcommit treeを照合する。物理入力の未確認範囲は既存記録を維持し、push/Release/deployは行わない。新規テストフォルダーなし、既存の再利用証跡を保持する。

## 2026-10-26: ライトモードplaceholderの追加調整 0.92.2

- 利用者の指定で共通placeholder色を`#9aa2b1`から、より薄い`#bfc5d0`へ調整。既存のライトモード専用input/textarea規則を使い、保存値・入力済み文字・ダークモード・対象画面の範囲は変更なし。0.92.1からの製品入力差分は`src/shared/appearance.ts`と版の`package.json`のみ。既存の未コミット変更を保持したためpullは実行していない。
- 発行前レビューで共通定義への集約、ライト限定selector、入力値・設定/APIへの影響がないことを確認し、指摘なし。frozen install・型検査・build成功。既存appearance回帰は **7/7、fail/cancel/skip 0**。表示の追加修正として0.92.2へパッチ更新しpublish成功。
- 固定EXEの機能設定GUI **9群**と隔離smoke成功。既存fixtureを使った手動表示確認で3方式とブラウザexeのplaceholderが`rgb(191, 197, 208)`、入力済み文字が`rgb(36, 41, 57)`であることを確認。マウス設定の画像で入力例と検索欄が淡く表示されることを確認した。新規試験追加・無関係な全回帰・物理入力試験は行っていない。
- **0.92.2 / 170,689,591 bytes / SHA256 `61d81d66df73ded1602629e26eed3b9538f0d22a420f230f46281a93587b535c`**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`のFile/ProductVersion・feed・Default Shell版、out全237ファイル・native input全403ファイルと試験コピーを照合。694入力は検証前後で一致。証跡は`.artifacts/placeholder-lighter-20261026/`のreview/validation/bundle/environment、入力hash・完全ログ・previewと固定GUI画像。
- 未コミット、push/Release/実利用deployなし。完了時の検証プロセス0件。直近と再利用用の既存証跡・用途不明の他作業を保持し、削除0件。対象一覧は同フォルダーのtest-folder-inventoryへ記録。

## 2026-10-26: placeholder配色とトリガー除外欄の統一 0.92.1

- 0.92.0の未コミット実装を保持したまま表示を追修正。`appearance.ts`の`placeholderCss`を既存の登録済みローカル画面への配色経路で配布し、ライトモードのinput/textareaを`#9aa2b1`へ統一。ダークの既存表示とリモート本文は対象外。除外exe・対象exe・Webブラウザexeの入力例から`.exe`を省略した。
- トリガー全体の欄名を3方式とも「ジェスチャーを除外するexe」に統一し、実行方法の直下へ配置。マウスの欄を移動し、キー/タッチパッドの設定カタログ名も整合。ダイアログは「除外するexe」のまま。保存キー・保存値・exe名の正規化・除外実行処理に変更なし。表示のみの追修正として0.92.1へパッチ更新。
- 発行前レビューでライト限定selector、共通配色の登録URL/main-frame境界、3方式の名称と配置、ダイアログの表示/保存契約を確認し、阻害指摘なし。型検査・build、既存のappearance/localization/command-triggers回帰 **21/21**、frozen install・publish成功。0.92.0からの入力差分は版・配色・表示・既存配色試験の期待値のみ9ファイルと照合し、変更のない除外実行基盤の回帰証跡を再利用した。
- 固定EXEの機能設定 **9群**、割り当て編集 **8群**、隔離smokeが成功。確定/取消/保存/再起動、明暗と幅別の既存GUI確認を実施。隔離fixtureから実フォームの目視資料も取得し、3方式の欄名、実行方法直下の配置、拡張子なしの入力例を確認。入力文字`rgb(36,41,57)`に対しplaceholderは`rgb(154,162,177)`。マウス/タッチパッドの実画面を目視した。画像の差分比較テストは追加していない。
- **0.92.1 / 170,691,917 bytes / SHA256 `57878e921ad2cf2d8cee6737e387405580a77272ba3e639c49488b53b90f9c72`**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`へ発行。EXE版/feed/同梱本体・Default Shell、out237ファイルと入力プロセス403ファイル、固定GUI/smokeコピーを照合。最終694入力hash一致。証跡は`.artifacts/placeholder-ui-20261026/`のreview/validation/bundle/environment/preview・ログ・入力hash。
- 検証用プロセス0件を確認。現在の成功資料と以前の再利用資料、用途不明の生成物を保持し、削除0件。無関係な全回帰・物理入力の再検証は行っていない。0.92.0からの実装は引き続き未コミットで、push/Release/実利用deployなし。

## 2026-10-26: トリガー全体と割り当て単位のexe除外 0.92.0

- 先行レイアウト改善を`ebd4aa2`へコミットし、cleanなmainで`pull --ff-only`（Already up to date）後に実装。キーの`keybindingOptions.excludedProcesses`、タッチパッドの`touchpadGestures.excludedProcesses`、3方式のグローバル条件の`when.excludedProcesses`を追加。マウスの既存全体設定を含め、種類別の全体除外に割り当ての指定を追加し、どちらかに一致すれば実行しない。追加設定のためマイナーを1つ増やし0.92.0とした。
- 3ダイアログの共通欄を有効化し、入力検査・正規化・取消・再編集・空欄への戻しへ接続。各機能設定には共通部品の除外欄を置き、実行方法の変更でも除外指定を保持する。設定保存・ページ投影・公開API/schema・条件表示・TS/C#の共通実行判定を整合。欠落値は空、古い行へ任意フィールドを書き足す移行なし。
- 発行前レビューでは、globalだけのキーもnative条件付きに投影すること、ローカルキーにも本体プロセス名を渡すこと、タッチパッド設定変更時に古い入力通知を破棄することを確認。タッチパッドは従来の専用キー捕捉を保ち、全体除外または同じジェスチャーの全保存行の追加除外に該当するときだけ元入力を通す形へ調整。残る発行阻害指摘なし。
- 関連12ファイルのNode回帰 **180/180**、C#共通条件・選択fixture **41件**、型検査・本体/native build・publish成功。追加除外と全体除外の合算、異なるexe/未知プロセス、first/all、入力ブロック、API dryRun/保存、独立した保存と旧設定、touchpad投影更新による旧通知破棄を模擬環境で確認。版変更直後はpnpmの依存構造確認で型検査が停止したが、publish既定の`install --frozen-lockfile`後、同じ型検査が成功。lockfile・検査方針は変更せず、停止ログを保持した。
- 固定EXEで編集 **8群**、機能設定 **9群**、統合一覧 **18群**と隔離smoke成功。3方式の追加除外の不正値/正規化/保存/取消/解除、全体設定の独立性、確定前未保存とEscape取消、実行方法変更後の保持、再起動後の永続化を確認。既存の入力選択・条件・実行順・削除・フォーカスの回帰と明暗/幅別の確認も成功。編集試験の旧「対応予定」という結果文言だけを更新して再実行し、ほかの検証結果は製品・対象試験のhash一致により再利用。
- **0.92.0 / 170,683,211 bytes / SHA256 `85e168ca744f88f8d47aa6abce3b325e61426fa5d6d8b0139df39a7c6bd81ba4`**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`へ発行。File/ProductVersion・feed・同梱本体/Default Shell版、out全237ファイル、入力プロセス403ファイルと固定試験コピーを照合。証跡は`.artifacts/trigger-exclusions-20261026/`のreview/validation/bundle/environment、694入力hashと各ログ。
- OSへのPause/F13～F24の送信・登録、Windowsタッチパッド設定の変更、物理指操作は行っていない。無関係な全回帰は未実行。今回の実装は未コミットで、push/Release/実利用deployなし。完了時に`.artifacts`を参照する検証プロセス0件を確認。整理では現在の成功証跡・既存の再利用資料・他作業/用途不明の生成物を保護し、削除0件。対象一覧と判断はtest-folder-inventory/environmentへ記録。

## 2026-10-26: 割り当てダイアログ0.91.3のコミット

- 利用者による使い勝手の確認後、レイアウト改善の関連16ファイルをコミット対象として照合。実装時の705入力、全8ログ、固定GUIの結果hash、発行済EXEが一致したため、型検査/build・関連124件・固定GUI26群・smoke・配布物確認を再利用した。追加製品変更と不足回帰はなく、版更新・再発行は行わない。
- 証跡は`.artifacts/commit-validation-binding-dialogs-20261026/`。対象だけをstageし、indexと作業ファイルのGit blob・stage treeとcommit treeを照合する。後続のexe除外実装とは分けてコミットし、push/Release/deployは行わない。

## 2026-10-26: 3方式の割り当てダイアログ改善 0.91.3

- cleanなmain `49d3c0b`で`pull --ff-only`による最新確認後に実装。`BindingEditorLayout`で入力操作と条件を横並び（800px以下は縦並び）にし、マウスの種類・段数・方向の余白を整理して2段階方向を横並びにした。タッチパッドは3本指/4本指の各5ボタンと選択中表示に変更。「いつ・どこで」は`CommandConditionEditor`へ共通化し、範囲ボタン・対象ページの直接選択・exe入力を共有。有効切り替えと適用/取消は固定フッターへ移動した。
- グローバルの「除外するexe」は対応予定を表示する入力不可欄のみ。保存キー・実行時の除外判定は追加していない。設定UI指針に3ダイアログの配置例外を記載し、保存ID・認識設定・Windows接続・実行順・原子的保存/競合検査を維持した。設定/保存ファイル/API変更のない通常パッチとして0.91.3へ更新。
- 発行前レビューで条件遷移、既存値と未導入ページの保持、入力抑止/フォーカス/適用・取消、CSSの適用範囲、翻訳と版更新区分を確認。画像確認後にスイッチをラベルと同じ行へ揃えた。発行阻害指摘なし。frozen install・型検査・build・publish成功。関連8ファイルの既存回帰は **124/124、fail/cancel/skip 0**。無関係な全回帰・物理入力テストは実行していない。
- 固定EXEで編集専用 **8群**、統合一覧 **18群**、隔離smoke成功。全方式のscope切替、exe不正入力/正規化、ページ検索/選択、取消とフォーカス復帰、マウスの種類/段数ごとの入力保持、2段階の方向交換、タッチ全10IDの保存とキーボード操作、キー記録/元入力ブロック、有効切替、追加/編集/削除/実行順、実再起動後の保存維持を確認。実テーマAPIで明暗を切り替え、1280/760/480pxの操作と画像を確認した。予約キーPause/F13～F24のOS送信/登録・Windowsタッチパッド設定変更なし。物理入力と将来のexe除外機能は確認対象外。
- **0.91.3 / 170,691,969 bytes / SHA256 `fbd8d6aefdc6588519088b246f514dcbe79cf06b2409bd430fdef01c9057d2d9`**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`へ発行。EXEのFile/ProductVersion、feedの版/size/hash、同梱本体/Default Shell版、out全237ファイル、固定GUI/smokeコピー3本を照合した。最終GUI前後705入力一致。回帰後の入力差分はGUIのテーマ設定を実APIへ変更した検証スクリプトだけで、製品/単体試験への影響なし。
- 正本: [割り当てダイアログ](docs/command-triggers.md#割り当てダイアログ)、[UI指針](docs/settings-ui-guidelines.md)。証跡: `.artifacts/binding-dialogs-20261026/`のreview/validation/bundle/environment・入力hash・各ログ。固定GUIは`command-triggers-ui-1792971771827`と`command-triggers-ui-1792971825963`、smokeは`smoke-1792971874323`。開発GUI初回は既存一覧のhover手順不足でタイムアウトし、手順修正後に成功。失敗ログは診断資料として保持した。検証プロセス終了確認、現在の証跡/過去の再利用資料/用途不明分を保持して削除0件。commit/push/Release/実利用deployなし。

## 2026-10-26: MCP接続設定の共通一覧API 0.91.5

- cleanな`codex/mcp-settings-design` / `022b1f1`から同じ専用worktreeで継続した。追跡先なしのためpullや追跡先の新設は行わず、primary mainと他のworktreeは変更しない。既存の名簿・接続項目・保存ファイル・固定MCPツール契約を維持する変更のため、発行済み0.91.4から**0.91.5**へパッチ更新した。push/Release/deployは行わない。
- McpClientSettingsへ非秘密スナップショットと保存計画を集約し、従来の管理APIと共通設定APIで同じ検証・原子的保存を使う。外部取得・保存の保護判定で暗号化/復号を呼ばず、認証情報を読めない接続でも公開メタデータを編集できる。秘密付きの削除・結び付け先変更・新たなBearer設定を拒否し、従来の秘密保護チェックも保持した。ローカルUIの秘密編集・接続確認は既存経路のまま。
- `category=mcp-client`のlist対象を固定6入口へ接続。IDは読取り専用で追加時に生成し、名前/説明は共有、非秘密connection列はPC専用へ保存する。追加・部分更新・削除・全行並べ替え、最大32件、空の引数を含む64引数、重複しない公開ツール名512件を既存検証へ渡す。一覧用の任意validator追加はこの所有対象だけに使い、他の一覧は既存の共通検証を維持する。
- 個別に壊れた行と暗号文・未設定名簿・他の行を保持し、PCファイル全体が不正なら対象をunavailableとして保存しない。名前/説明/順序だけの変更ではPC接続ファイルのbytesを維持する。read + writeで保存し、execute/useMcpを要求しない。applies=mcpSettingsChanged、settingsSaved/effectVerified=falseで、取得/dryRun/保存は接続・stdio起動・ツール探索を始めない。従来入口の公開状態は接続設定の状態を示し、認証の成否を保証しない。
- 発行前レビューで、未編集の有効URL表記を正規化して秘密の結び付け先へ影響する可能性と、メタデータ専用保存時のPCファイル競合検査を補強した。未編集URLを保持し、PCファイルを再書込みしない検査専用assetも保存直前にrevisionを確認する。回帰を追加し、型検査/build・影響する標準回帰・GUIを再実行。最終の阻害指摘なし。
- 固定依存install・変更範囲の整形検査・型検査・本体/Default Shell build・publish.batが成功。関連標準**32ファイル354/354件、fail/cancel/skip 0**、うち新規11件（所有adapter10件・従来入口の非復号回帰1件）が成功した。秘密/未設定/壊れた行、複数行の原子的拒否、保存失敗時の共有/PC巻戻し、外部更新、保存直前の再検査、再送、無変更、許可取消、既存上限とID/再読込みを検証した。標準全体は未実行。
- 隔離source/最終固定EXEで実MCP・設定連動**各40群**と従来MCP設定画面**各10群**、固定EXE smokeが成功した。MCPの追加/dryRun/再送/部分更新/並べ替え/削除、ネイティブ編集からMCPへの即時反映、古い要求と秘密変更の拒否、暗号文保持、execute/useMcp OFFとtools/list不変を確認。ループバックHTTPの要求数は保存後も0。従来ローカルUIの実ハンドシェイク・失敗時OFF復帰・警告・入力保持・再起動も維持した。
- 最終**760入力**と参照Applet manifestのSHAは、レビュー後回帰前後・発行前後・固定試験後で一致。Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.402、Windows x64、独立node_modulesで実行した。発行後の追記は文書と証跡のみ。
- EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170693659 bytes / SHA256 `26fb9cb263e373ed366bd5de30edd87e671d5e416561a04749403dbef91f95ac`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shellと全固定試験コピーを照合した。
- 正本は[設定API](docs/settings-api.md#mcp接続一覧)、[MCP接続管理](docs/mcp-client-design.md)、[設計](docs/mcp-settings-design.md)。証跡は`.artifacts/mcp-settings-client-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-client-20261026/`。source-profiles.json/fixed-profiles.jsonとsmoke-profile.jsonへ結果/hashを記録した。保存処理の共通化（`542fc4d`）と共通一覧APIへの接続を別コミットに分けた。
- 中継全体GUIの追加試行は、事前配置するCustomCommands fixture不在でホスト起動前に終了し、成功件数へ含めない。同じ全体スクリプトに今回と無関係なPauseキー送信があるため再試行せず、今回必要なMCP通信/設定回帰は上記の標準と2種類のGUIで検証した。実利用設定/認証、Windows起動登録、Pause/F13～F24のOS送信・登録は変更していない。
- 専用テストプロセス0。今回の各script/方式の成功は3回以内。過去の参照profile/固定コピー・診断・起動前に止まった中継fixture・状態未確認の過去試験・固定ビルド出力を保持し、削除0件。初期の版更新後依存照合、レビュー前の検証と診断は同じ証跡フォルダーに保持した。

## 2026-10-26: 共通ブラウザ設定の宣言共有とMCP接続 0.91.4

- main `49d3c0b`の統合commit `a802b73`から、同じ専用worktree/branchで共通ブラウザ設定のMCP対応を実装した。マージと別の実装単位とし、追跡先の追加、primary mainの変更、push/Release/deployは行わない。既存commandTriggerOptionsのbrowsers/requireChromiumWindowClassと共有settings.jsonを使い、製品設定項目/保存ファイルの追加削除はないため、発行済み0.91.3から**0.91.4**へパッチ更新した。
- command-trigger-options.tsの共通宣言から型/既定値/検証、既存3画面の通常入力、検索/JSON、差分保存とMCP項目を生成する。トグル/文字/数値/固定選択は宣言だけで反映し、MCP側に別表を作らない。正規化関数は内部に保持して公開定義から除外し、構造化複製とIPCを維持する。方式別の動作・割当・接続と衝突するキーは宣言へ入れない。通常の見た目/入力確定/既存ラベルを保った。
- 固定6入口へcategory=command-triggersのfields対象を接続。ブラウザ名は所有するprocessNamesで検証・正規化し、上限100件、空配列の明示値を維持する。正規化した候補から無変更/既定値一致を判定し、大小文字や.exe/重複だけの差で保存せず、正規化後の既定値setとresetで上書きを除去する。rawの変更キー以外をプレビューへ増やさない。
- 保存は共有commandTriggerOptionsだけを変更し、3入力方式の読取りと次の条件判定へ通常通知で反映する。割当、方式別executionMode、動作/接続設定、PC専用値と暗号化情報を保持する。read + writeで利用し、executeを追加条件にしない。applies=commandTriggerOptionsChanged、dryRunは検証だけ、settingsSaved/effectVerified=falseは保存完了だけを表す。物理入力とOS登録の完了は保証しない。
- automation=false/secret/localOnlyをSchema・値・検索・更新から除外する。従来の3方式の取得、configure用Schema/検証、返却プレビューにも同じ公開判定を適用し、明示非公開を旧入口から変更できないようにした。外側の案内は現在の公開inputSchemaを参照し、共通フィールド名を二重登録しない。MCPのツール名/外側Schemaと8行の操作許可は維持した。
- 発行前に宣言の共有、型/既定値、構造化複製、正規化と既定省略、原子的保存、公開/許可/競合、旧入口、UIと必要回帰をレビュー。機能ページのカタログ早期returnにも共通宣言を接続し、JSONの既定値だけのblockを省略する契約を試験へ反映して再検証した。阻害指摘なし。
- 固定依存install、型検査、本体/Default Shell build、関連標準**75ファイル777/777件、fail/skip 0**が成功。新規の所有adapter回帰7件は、探索/配列Schema、dryRun/正規化/再送/無変更/既定復帰、100件境界/明示空配列、共有/PC分離と暗号化bytes保持、原子的拒否/許可取消/外部更新、宣言追加によるカタログ/JSON/保存/MCP反映、非公開の旧入口保護と保存失敗を確認した。標準全体は未実行。
- 隔離source/最終固定EXEで実MCP・画面**各36群**、ジェスチャー機能設定/共通ブラウザ設定**各8群**、コマンドトリガー**各18群**と固定EXE smokeが成功した。MCPから3画面への反映、既存入力/トグルからMCPへの反映、古い要求拒否、実再起動後の保存保持、未編集設定/暗号化bytesとexecute OFF、tools/list不変を確認。Applet workerの合計起動3回と無効/待機worker未起動も保持した。実利用の設定/認証、OS登録、物理入力を変更する検証は行っていない。
- 最終**757入力**と参照Applet manifestのSHAは、回帰前後・発行前後・固定検証後で一致。Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.402、Windows x64で実行した。整形はsrc/scripts/testsの変更範囲を検査し、package.jsonは版番号だけを変更。発行後は文書と証跡だけを追加した。
- publish.bat終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170695215 bytes / SHA256 `a7adf008ed601fc83e96870bd3e5d24c43de7c581de4f2fb069b4ef3d39646e5`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shellと、全固定試験コピーを照合した。
- 正本は[設定API](docs/settings-api.md)、[設定基盤](docs/settings-foundation.md)、[コマンドトリガー](docs/command-triggers.md)、[外部操作](docs/automation.md)。証跡は`.artifacts/mcp-settings-browser-options-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-browser-options-20261026/`。全GUIのprofile/result/hashはsource-profiles.json/fixed-profiles.json、smokeはsmoke-profile.jsonに記録した。
- 専用テストプロセス0。今回の各script/方式の成功は3回以内。main統合/過去の参照profile、診断、固定ビルド出力、別作業を保持し、削除0件。初期のカタログ経路はowner-tests.log、JSON既定省略の期待値はowner-final.logに診断を残し、owner-complete.logと最終回帰で解消を確認した。

## 2026-10-26: 最新mainのMCP設定worktreeへの統合 0.91.3

- `codex/mcp-settings-design`のcleanな`c194c36`へ、fetchで確認した最新`origin/main=49d3c0b`を通常mergeした。mainのコマンドトリガー統合、共有ブラウザ判定、共通スクロールバーとジェスチャー機能設定の変更を取り込み、MCPの固定6入口、通常設定/一覧/所有adapterと秘密保護を保持した。primary main checkout、追跡先、push/Release/deployは変更しない。
- 競合9ファイルを整合した。API/案内/試験/作業指示では、3入力方式の共通設定も統合済みread + writeで判定し、廃止した個別編集許可とexecute条件を再導入しない。mainの画面/スクロール構造へ既存storage test-idを接続し、リボンはAppletごとのページ上限を守る既存の複数提供元fixtureとmainのスクロール検査を両立した。両方の仕様/検証履歴と開発入口を保持した。
- 発行前に全incoming commit、競合解消、設定型/既定値/保存、公開範囲と許可、UI構造と必要回帰をレビューし、阻害指摘なし。mainで導入済みの設定変更を超える設定項目/保存ファイル追加と破壊的変更はなく、mainの発行済み0.91.2から統合版**0.91.3**へパッチ更新した。
- 固定依存install、型検査、本体/Default Shell build、関連標準**75ファイル770/770件、fail/skip 0**が成功。標準全体は未実行。source/最終固定EXEとも実MCP 32群、コマンドトリガー18群、機能/共通設定8群、リボン7群、共通スクロールバー6群、リボンスクロールバー4群が成功し、固定EXE smokeも成功した。通常入力・表示/再起動保持と共通ブラウザ設定の連動を隔離profileで確認した。物理入力/UAC/実利用設定や認証を変更する試験は行っていない。
- 最終**756入力**と参照Applet manifestのSHAは回帰前後・発行前後・固定検証後で一致した。publish.bat終了0、EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170700489 bytes / SHA256 `47f74cc7a89abc3769b7780a5567ca31ba6a458fb8d77c77f196feaa603cf44b`**。File/ProductVersion、feedの版/size/hash、ASAR内packageと同梱Default Shell、全固定試験コピーを照合した。固定ツール/lockfile/依存方針を維持した。
- 証跡は`.artifacts/mcp-settings-main-next-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-main-next-20261026/`。各GUIのprofile/resultとhashをsource-profiles.json/fixed-profiles.jsonへ記録。検証済み入力を継続し、製品の後続変更は別の実装単位とする。次の区切りはmainで共通化されたブラウザ判定設定を固定6入口へ接続する。
- 今回の各script/方式の成功profileは3回以内。過去の再利用資料/参照profile、固定出力、別作業を保持し、削除0件。専用テストプロセス0を確認した。

## 2026-10-26: 0.91.2までの変更のコミットとGitHub/AQUAプッシュ

- ジェスチャー機能ページの整理・ブラウザ判定の共通化、設定インデックスのシンボル復元、Applet管理/AI/MCPの表操作配置を対象に、先行変更と各版のレビュー・入力hash・ログを照合。製品は確認済みの **0.91.2** を保持し、配色・製品コード・依存・配布物を追加変更していない。
- 不足していた標準回帰を実行。初回は908件中905件成功、撤去済みのタッチパッド割り当て一覧を想定したSettingsViewClientの既存3件だけが失敗。失敗時の復元・拒否入力に基づくキュー破棄・保存後Windowsエラー時の実保存値の反映という確認を保ち、現在の接続キー/修飾キーの編集へ置き換えた。新規ケースは増やさず、全体を再実行して **908/908件、fail/cancel/skip 0** を確認。初回の失敗ログは診断資料として保持し、全体成功として再利用していない。
- 現在の固定EXEで機能設定 **8群** と統合一覧 **18群** を直列実行し、編集・保存・提供元移動・実再起動まで成功。`.artifacts/command-triggers-ui-1792964581303/result.json`と`.artifacts/command-triggers-ui-1792964611841/result.json`。両コピーと発行先はSHA256 **`6ef4e1619e71f46df84ca19f0d85d004f38e75d988a8ea87be5118d8701d14a3`** で一致し、再ビルドしたout全237ファイルも同梱ASARと一致。0.91.2時点の型検査・発行・3画面×明暗6画像は、対象入力と同じEXE/hashを照合して再利用する。
- 証跡は`.artifacts/commit-validation-trigger-settings-20261026/`。検証前後の入力一致、製品入力の発行時との一致、対象ファイルだけのstage、stage/作業ファイルと`git write-tree`の一致を確認して通常commitする。初期のGitHub/AQUA mainはいずれも`3455315`。先行`0f9bd35`を含む履歴を通常pushし、各remote先端と最終commit、commit treeとstage treeの一致、cleanな作業ツリーを最終記録へ残す。関連証跡・診断資料を保護し、削除0件。Release作成と実利用deployは行わない。

## 2026-10-26: Applet管理・AI・MCPクライアントの表操作配置 0.91.2

- 先行の未コミット変更を保持し、Applet管理のApplet名ヘッダーから右寄せ専用クラスだけを外して、追加と並べ替えを隣接。移動列を「設定 → ログ → コマンドトリガー」に並べ替えた。AI/MCPクライアントは共通`actionsAlign="start"`を指定し、操作ヘッダーと行内ボタンを左寄せに揃えた。CSS・配色・アイコン色・hover/focus装飾は変更していない。
- 発行前レビューで右寄せクラスの定義が`margin-left:auto`だけであること、共通指定が文字位置とflex配置だけを変えること、移動先ID・イベント・有効状態の維持を確認。阻害指摘なし。設定や公開APIの変更を伴わない通常パッチとして0.91.2へ更新し、整形確認・型検査・frozen install・publish成功。新しい製品回帰テストと無関係な全回帰は追加・実行せず、固定EXEを隔離起動して3画面×明暗の6画像と実配置を確認した。追加/並べ替え間は10px、移動順は指定どおり、AI/MCPの見出しはleft・行内ボタンはflex-start。画面エラー0件。
- **0.91.2 / 170,688,788 bytes / SHA256 `6ef4e1619e71f46df84ca19f0d85d004f38e75d988a8ea87be5118d8701d14a3`**。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。File/ProductVersion・feedの版/サイズ/hash・同梱本体/Default Shell版・out全237ファイルを照合し、隔離コピーも一致。検証前後735入力は一致し、0.91.1からの製品入力差分は3つの対象TSXとpackage版だけ。確認後にApplet管理と共通一覧の正本文書・本記録を整合させた。
- 証跡は`.artifacts/settings-table-placement-20261026/`のreview/checks/publish-result/bundle/validation・入力hash・完全ログ、ui-inspection.jsonとui内の6画像。検査用fixtureは有効化せず、外部接続・物理入力・Windows設定書込を行っていない。検査プロセス終了を確認し、再利用する画像と記録を保持。新規の独立したテストフォルダーと整理候補はなく、削除0件。commit/push/Release/実利用deployは行っていない。

## 2026-10-26: 設定インデックスのシンボル復元 0.91.1

- 0.91.0の未コミット変更を保持し、キー・マウス・タッチパッド・カスタムコマンドの設定インデックスに、従来のkeyboard/mouse/touchpad/keyboard-command-keyを復元。一覧への移動先を1つへ統一した際、インデックスが同じ配列からアイコンを取得していたため消えていた。`SettingsIndex`のページ別アイコン定義を移動先の配列から独立させ、Applet管理・通知・コマンドトリガーの既存アイコンも保持した。
- 発行前レビューで4つの旧シンボルとの一致、統合一覧への移動、既存の設定・入力動作への影響を確認し、発行阻害指摘なし。保存項目・公開APIの変更を伴わない見た目の修正のためパッチを更新。整形確認・型検査・frozen install・publish成功。固定EXEの既存設定画面チェック **8群**（共有設定・移動・保存・実再起動を含む）が成功し、ライト/ダーク画像で4つの復元を確認。新規テストや無関係な全回帰は追加・実行していない。
- **0.91.1 / 170,679,351 bytes / SHA256 `640cde7070b1879b64dc2f047131e7165f077acd8fdf850accdc341e1598e77c`**。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。File/ProductVersion・feedの版/サイズ/hash・同梱本体/Default Shell版・out全237ファイルを照合。GUI用コピーも同一hash。検証前後735入力の一致と、0.91.0からの製品入力差分が`SettingsIndex.tsx`/`package.json`だけであることを確認した。
- 証跡は`.artifacts/settings-index-symbols-20261026/`のreview/checks/publish-result/bundle/validation・入力hash・完全ログ。固定GUIは`.artifacts/command-triggers-ui-1792963121659/result.json`。プロセス検査は検査用PowerShell自身を数えない対象名へ修正し、試験プロセス終了を確認。同方式の成功直近3回と先行の再利用・診断資料を保持し、削除0件。物理入力・Windows設定書込は試験対象外。commit/push/Release/実利用deployは行っていない。

## 2026-10-26: ジェスチャー機能設定の整理とブラウザ判定の共通化 0.91.0

- cleanなmain `0f9bd35`で`pull --ff-only`し最新を確認。「ショートカットキー」の表示名を「キージェスチャー」へ変更し、既存のページ/コマンド/割り当てIDを保持。キー・マウス・タッチパッドの3機能ページから割り当て一覧を除き、機能設定だけに整理した。動作設定はタイトルなしSectionへ置き、マウス/タッチパッドは既存の有効切り替えと同じSectionへ統合。タッチパッドのWindows接続は常時展開し、2つの保存ファイルを開けるメニューを維持したまま通常の「ファイルを開く」と同じスタイルへ揃えた。
- 各タイトルなしSectionの下に、group表示のない「ジェスチャー共通の設定」を追加。`Settings.commandTriggerOptions`にWebブラウザのexeとChromiumウィンドウ条件を1つだけ保存する。利用者の指定に従い、方式別の旧値は継承せず共通の既定値で開始する。旧フィールドは読み取ったモデルから除き、以後の保存にも含めない。既定値省略・空配列/false・exe正規化・フォーム/JSON・リセット・外部競合は既存の保存基盤へ接続し、割り当ては統合一覧だけの投影へ残す。
- キーのnative条件/JS計画、マウスのnative投影/計画/settingsKey、タッチパッドの計画/実行中世代が同じ共通値を参照する。共通値の変更も実行中バッチの失効へ含め、方式別の実行方法・保存配列順・条件・入力所有権は保持した。公開編集APIの既存ブラウザ項目も共通値の別名として扱い、全方式へ影響する変更にはキー/マウス/タッチパッドの編集許可をすべて要求する。通常の割り当て/実行方法だけの編集は各方式の従来の許可を使い、revision/dryRun/原子的保存と即時失効を維持する。
- Applet管理の移動を設定/コマンドトリガー/ログへ整理し、共通一覧を提供元で絞って開く。カスタムコマンドの移動もコマンドトリガーだけにし、安定したコマンドIDで絞る。割り当て済みの色は全3方式を合成する。機能ページへ不要なコマンド一覧データを送らず、統合一覧にはAppletページ候補と提供元の解除操作を接続した。
- 発行前レビューで保存/公開API/入力判定と失効・画面投影・旧値の非継承・移動と絞り込み・未変更項目を確認。旧タッチパッド項目の受理後除去、プロパティ順で変化判定が揺れるno-opの深い比較、統合先の提供元解除、ファイルボタンの同じポインター状態での比較、改名した入力記録ラベルを修正・再検証した。発行阻害の未解決指摘なし。設定項目の追加/廃止を含むため0.91.0へマイナー更新。
- 固定Node24.22.1/pnpm12.10.1、同一lockfile/供給網検査で整形・型検査・build・frozen install・publish成功。関連17ファイル **199/199件、fail/skip 0**。最終の共通設定変更によるバッチ取消/API説明/翻訳/画面境界は4ファイル **63/63件**（先行分と重複を含む）、共通設定6件と統合一覧の投影保護6件も最終fixtureで成功した。無関係な全回帰は再実行していない。
- 最終固定EXEで機能設定 **8群**、統合一覧 **18群**、隔離smoke成功。3画面の一覧なし・タイトルなしSection・groupなし共通Section、画面をまたぐ保存値共有と独立した実行方法、10種類のWindows接続の常時表示、ファイルメニューと通常ボタンの寸法/色一致、Applet/カスタムコマンドの移動先・対象絞り込み/解除、明暗/1280・760px、実再起動保存を確認。共通設定ブロックがない旧形式の隔離ファイルでも既定値を使い、旧方式別の値を引き継がないことを確認した。追加/編集/削除確認/同じ入力の実行順/種類と一時フィルター/CSS追従/横スクロールも維持。明暗の狭幅画像を目視確認。物理の指操作・F13～F24やPauseのOS送信/登録・Windows設定の書き換えは行っていない。
- **0.91.0 / 170,666,440 bytes / SHA256 `6ec8cf10169fc5608d9d7481fd0bd5bb85f490070fbca551e43ebb675901a29a`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版とout全237ファイルを照合。固定GUI/smoke用コピー4本も同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)・[キー](docs/keybindings.md)・[マウス](docs/gestures.md)・[タッチパッド](docs/touchpad-gestures-design.md)。証跡は`.artifacts/gesture-settings-common-20261026/`のレビュー・各ログ・bundle/validation・入力hash。最終GUIは`.artifacts/command-triggers-ui-1792962217879/result.json`と`.artifacts/command-triggers-ui-1792962101159/result.json`、smokeは`.artifacts/smoke-1792962259187/smoke-result.json`。テスト用プロセスの終了を確認。今回の成功と旧版の再利用/診断資料を保持し、削除0件。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: スクロールバー背景の透明化とコミット 0.90.11

- 0.90.9/0.90.10の未コミット変更を保持し、共通スクロールバーの本体・トラック・track-piece・縦横の交差部・つまみ周囲を透明に変更。つまみは`background-clip: padding-box`で透明な境界へ色が回り込まないようにし、その場所の背景が見える構成にした。明暗のつまみ色、12px幅、3pxの余白、角丸8pxと既存のスクロール構造は保つ。正本は[共通スクロールバー](docs/appearance.md#共通スクロールバー)。
- 発行前レビューで透明なtrack/境界とつまみの描画範囲、非表示バーの優先、テーマ切替、登録済みローカル画面だけへの適用を確認し、発行阻害の指摘なし。0.90.10の入力733件と比較し、この追加修正は`src/shared/appearance.ts`・配色文書・版の3ファイルだけと確認。先行する本文縦横共通スクロール/CSS追従と共通配色のレビュー記録も参照した。設定・保存ファイル・公開APIの変更はない通常パッチとして0.90.11へ更新。
- 利用者の明示指示により、今回の単体・GUI・smokeを含む回帰テストは実行せずコミットする。前段0.90.9/0.90.10の成功は各版の履歴として保持し、透明化後の動作確認済みとは扱わない。固定EXEの起動/画面確認も今回は実行していない。
- 固定Node24.22.1/pnpm12.10.1、同一lockfile/供給網検査で整形・frozen install・build/publish成功。版更新によるworkspace情報の照合要求はfrozen installで更新し、検査は無効化していない。確認はビルドと発行物の整合に限定し、EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版とout全236ファイルを照合した。
- **0.90.11 / 170,685,873 bytes / SHA256 `f68fb36a89c772209af44954ab0edf929efb5845f29732dfdaed7f83e367c463`**。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。証跡は`.artifacts/shared-scrollbars-transparent-20261026/`のレビュー・差分前ソース・ログ・bundle/validation・入力hashとstage/commit記録。新規の回帰テスト用プロセス/フォルダーと整理候補はなく、先行の成功/再利用/診断資料を保持する。
- ここまでのスクロール改善と背景透明化の関連23ファイルを対象にstage/作業ファイルの一致と`git write-tree`を確認し、通常commit後にtree一致・cleanを照合して完了とする。push・Release・実利用deployは行わない。

## 2026-10-26: AppDock共通スクロールバー 0.90.10

- 0.90.9の未コミット変更を保持し、コマンドトリガー本文と同じスクロールバーを本体・設定インデックス・各一覧/ダイアログ・Default Shell・通知・登録ローカルAppletへ共通適用。縦横12px、つまみ周囲3px・角丸8px、中立色の明暗テーマ、矢印なしを`src/shared/appearance.ts`の`scrollbarCss`へ集約した。Shellのthin指定とグループ独自6px、設定横バーの独自配色を除去。重複する内側横バーの非表示と既存のスクロール構造は保つ。
- 既存の配色登録を使い、正確なローカルURLとmain frameを照合した`dom-ready`でCSSを挿入する。再読込後にも適用し、共通preloadのテーマ更新へ追従。任意のWebサイト・リモートiframeには適用しない。発行前レビューで共通定義、URL/フレームの境界、再読込/破棄、意図した非表示の優先、狭幅のアイコンとスクロール、既存一覧への影響を確認。保存項目・ファイル・公開API・入力実行の変更はなく、通常パッチとして0.90.10へ更新。未解決の発行阻害指摘なし。
- 固定Node24.22.1/pnpm12.10.1・同一lockfile/供給網検査で整形・型検査・build・frozen install・publish成功。配色/翻訳/Shell境界/ローカルページ/Webアカウント/通知の関連6ファイルは **45/45件、fail/skip 0**。無関係な全回帰は再実行していない。
- 最終固定EXEで共通配色のスクロールバー専用 **6群**、リボン専用 **3群**、統合一覧 **18群**、従来スクロール **38群**と隔離smoke成功。本体・Shellの各領域・コマンドパレット・バナー/デスクトップ通知・ローカルAppletの9 WebContentsを明暗×mint/roseで確認し、再読込を含む37試料で縦横の実スクロール、幅/色/角丸/矢印/トラック一致を検査。通知の利用可能状態だけを隔離プロセス内で模擬し、OS設定は変更しない。リモートiframeには共通変数/APIがないことを確認。リボンの実オーバーフロー、末尾へのEndとEscape、フォーカス復帰、選択実行とコンパクトなアイコンの収まりも確認した。従来一覧・全ホスト/Appletのフォーム/JSONは明暗と複数幅、統合一覧はCSS追従・横固定・横バー同期・編集/再起動を維持した。明暗の画像も確認した。
- GUIの初回診断で、古い選択子と単一Appletの24ページfixture、グループの固定URL参照を特定。現行の10ページ上限を守る複数fixtureと実URLの照合へ直し、今回の見た目とスクロールに必要な専用モードを追加した。3px境界の検査はDPIの物理ピクセル丸めを許容する。廃止済み要素や別機能の全フローの成功とは扱わず、今回の対象範囲をsource/固定EXEで再実行した。途中の診断資料は保持する。
- **0.90.10 / 170,671,784 bytes / SHA256 `18d9705da529770953acccf401b229e15e5d3eb7c1925bf47263b45c5d64fa81`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版とout全236ファイルを照合。固定GUI/smoke用コピー5本も同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[共通配色とスクロールバー](docs/appearance.md#共通スクロールバー)。証跡は`.artifacts/shared-scrollbars-20261026/`のレビュー・各ログ・bundle/validation・入力hash。固定GUIは`.artifacts/appearance-ui-1792958380724/result.json`、`.artifacts/ribbon-groups-ui-1792958512032/result.json`、`.artifacts/command-triggers-ui-1792958411918/result.json`、`.artifacts/settings-hints-ui-1792958461522/result.json`、smokeは`.artifacts/smoke-1792958548304/smoke-result.json`。今回のテスト用プロセスの終了を確認。成功資料・旧版の再利用資料・診断資料を保護し、削除0件。任意のWebサイトやWindowsネイティブダイアログのスクロールバーは対象外。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: 本文の縦横共通スクロールとCSSセル内追従 0.90.9

- cleanなmain `3455315` で `pull --ff-only` し最新を確認。「コマンドトリガー」のフォームだけ、右側の設定本文を縦横共通のスクロール枠へ変更。共通キャンバス内の見出し・操作欄・状態表示・一覧フィルターは表示幅を保って横stickyにし、見出しと上部操作は縦に流す。フィルターの縦固定は継続する。共通部品のpageScroll指定を使い、JSONと従来ページは既定の表専用スクロールを使う。
- コマンド名・ID・縦3追加ボタンのまとまりをCSS stickyにし、フィルター直下からセル下端まで追従させる。scrollイベント/rAFによる全コマンドの寸法確認とtransform更新、および不要になった `useCommandCellFollow.ts` を除去。横スクロールではコマンドも表と一緒に動く。フィルター高さのCSS変数と画面下の共通横バーは継続し、バーを本文へ接続して双方向同期と矢印/Home/Endを保つ。
- 発行前レビューと実寸GUIで、枠付き表のoverflow:hiddenがstickyの参照先になる問題を特定し、角丸を保つclipへ変更。既存の0まで縮むグリッドを含め親へ表の最小幅を伝え、横stickyが親の右端で流れないよう修正した。本文右paddingが生む4pxの余分な横はみ出しもこのページだけ除去。横バーは共通下部の1つにし、縦バーは共通の中立色で維持した。取消後の本文縦横位置・同じ操作へのフォーカス、空結果、JSON切替、従来画面への影響を確認し、未解決の発行阻害指摘なし。
- 設定キー・保存ファイル・割り当てID・公開API・実行基盤は変更しない通常パッチとして0.90.9へ更新。固定Node24.22.1/pnpm12.10.1、同一lockfile/供給網検査で整形・型検査・build・frozen install・publish成功。保存/競合/翻訳/共通UI境界の関連4ファイルは **32/32件、fail/skip 0**。変更に影響しない全回帰は再実行していない。
- 最終固定EXEで統合一覧 **18群**、従来スクロール **38群**、隔離smoke成功。新たに明暗/1280・700pxでイベント待ちなしの連続scrollTop変更直後の座標、inline transformなし、セル下端停止、本文横移動時の見出し/操作/フィルター座標維持、広幅の横はみ出しなし、横バーのキー操作と同期、横移動後のダイアログ取消による縦横位置/フォーカス復帰、空検索時の横バー消失と位置0、JSON/フォームの寿命を確認。従来4一覧・Applet管理・全ホスト/Appletページの見出しとフォーム/JSONも明暗・複数幅で成功した。追加/編集/削除確認/実行順・実再起動保存も維持した。画像で狭幅の明暗と広幅の外観を確認。物理操作での体感やFPSの測定は未実施。
- **0.90.9 / 170,675,378 bytes / SHA256 `275299643a69a595d6050316d3a80436c4467da66f6a515270b1a983aeba1e50`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連コード・翻訳・renderer計11ファイルを照合。固定GUI用コピー2本も同じhash。発行先は `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)。証跡は `.artifacts/command-trigger-native-scroll-20261026/` のレビュー・ログ・bundle/validation・入力hashと削除ソース一覧。固定GUIは `.artifacts/command-triggers-ui-1792956160465/result.json`、`.artifacts/settings-hints-ui-1792956199502/result.json`、smokeは `.artifacts/smoke-1792956244267/smoke-result.json`。テスト用プロセスの終了を確認。今回のsource成功3回・固定EXE成功と先行版の再利用/診断資料を保持し、削除0件。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: コマンドトリガー0.90.8のコミット・プッシュ検証

- main `28b24c6` 上の承認済み35ファイルを対象に、現行0.90.8の入力660件と発行EXE、先行0.90.2の標準回帰896件・証跡鎖180件を照合。GitHub/AQUAの両mainは `28b24c6` で競合なし。未コミット変更を保持してfetchのみ行い、確認済み0.90.8を同じ版のまま通常commit/pushする。
- 標準117ファイルのうち、現行の保存/競合/翻訳2ファイル14件と、影響しない25ファイル103件は対象ソース・試験・依存・環境と成功証跡の一致により再利用。設定カタログ/ナビゲーションの推移的な参照先、ソース/レイアウト境界、最終配布物の参照先を含む90ファイルを追加実行し、**785/785件、fail/skip 0**。新規6件を含む必要回帰全体は **117ファイル・902/902件**。試験ごとの実行/再利用の一覧と判断は `.artifacts/commit-validation-command-triggers-0908/plan.json` に記録した。
- LUNA/Windows x64/Node24.22.1/pnpm12.10.1、同一lockfile/toolchainを確認。発行済み0.90.8の型検査・build/publish、固定EXEの統合一覧17群/共通移動・フィルター12群、隔離smoke、ホバー/通常時の画像とbundle照合を入力hashと合わせて再利用。GUI・build・publishは繰り返していない。先行する未解決の発行阻害指摘はなく、今回の製品追加変更もない。
- 発行EXEは **0.90.8 / 170,681,326 bytes / SHA256 `3f81d75338a200316876b88e7808606649405fc9c4d5abf90a8ee1f4178b5bc4`** を保持。追加試験は終了済みで、今回の追加GUIフォルダーと削除対象はない。検証後の変更は本記録だけとし、stage/作業ファイル一致と `git write-tree`、commit tree一致、両remoteのmainとcommit SHAの一致・cleanを照合して完了とする。結果は同証跡フォルダーの `validation.json`・`stage.json`・`commit.json`・`push.json` に残す。Release・実利用deployは対象外。
- 追従のチラつきについては読取り調査のみ実施。現在はscrollイベントからrAFで全コマンドのセル寸法を読み、transformを補正する方式。非同期スクロールとの時差が原因となる可能性があり、CSS stickyへ任せられるスクロール構造への見直しが対処候補。表だけの横スクロール枠がstickyの参照先になる現構造と両立させる設計が必要で、今回のコミットに追従方式の変更は含めない。実機での性能計測・対処の実装は未実施。

## 2026-10-26: 追加アイコンのホバー表示・入力フィルターのシンボル化 0.90.8

- 0.90.7の未コミット変更を保持し、統合一覧の追加アイコンはコマンド全体のホバーまたは内部フォーカスがあるときだけ表示するよう変更。非表示時はopacityとpointer-eventsを使い、32px角の操作領域・右横の縦3配置・Tab移動を保つ。ボタン自体のホバー/キーボードフォーカスがないときは枠と背景を透明にする。個別ボタンのホバー/フォーカスには共通のアクセント配色を使う。
- 入力の一時フィルターに、割り当て行と同じキー/マウス/タッチパッドのシンボルと入力内容を表示。「トリガー: マウスジェスチャー」などの接頭辞を画面から除き、完全な種類名と入力をtooltip・読み上げ用の名前・解除ボタンの名前へ残す。表示要素だけをrenderer内の一時状態へ渡し、入力ID・検索の判定・保存設定へ含めない。提供元/コマンド対象と従来一覧は既定の文字表示を継続する。
- 発行前レビューでホバーの単位、隠した操作の誤クリック防止とTab/Enterによる到達、取消後のフォーカス、配色と寸法、3種類のフィルター・解除操作、共通部品の任意表示への影響を確認し、阻害指摘なし。保存・公開API・実行基盤の変更がない通常パッチとして0.90.8へ更新。先行版との対象5ソース差分とホバー/通常時の画像も確認した。
- 固定Node24.22.1/pnpm12.10.1・同一lockfile/供給網検査で整形、型検査、build、frozen install、publish成功。関連2ファイルの保存/競合/翻訳試験は**14/14件、fail/skip 0**。最終固定EXEで統合一覧**17群**と従来の共通移動/フィルター**12群**、隔離smoke成功。明暗テーマでコマンド内の別割り当てへのホバー、別コマンドへ移動したときの非表示、切替前後の座標一致と透明な枠/背景、Tab/Enterと取消後フォーカスを確認。3種類のフィルターで入力文字・対応するSVGの一致・完全な名前・解除後フォーカスを確認した。画像取得は2描画フレーム待って状態と照合した。先行する追加/編集/削除確認/実行順・種類選択と一時フィルターの独立・1280/700pxのセル内追従と横移動・実再起動保存も成功。無関係な全回帰は再実行していない。
- **0.90.8 / 170,681,326 bytes / SHA256 `3f81d75338a200316876b88e7808606649405fc9c4d5abf90a8ee1f4178b5bc4`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連コード・翻訳・renderer計11ファイルを照合。固定GUI用コピー2本も同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)。証跡は`.artifacts/command-trigger-hover-20261026/`のレビュー・差分前ソース・各ログ・`bundle.json`・`validation.json`・入力hash。固定GUIは`.artifacts/command-triggers-ui-1792953239803/result.json`、`.artifacts/settings-hints-ui-1792953275852/result.json`、smokeは`.artifacts/smoke-1792953308124/smoke-result.json`。テスト用プロセスの終了を確認。今回の成功・先行版の再利用資料・診断資料を保持し、削除0件。物理入力・Windowsタッチパッド設定の書き込みは対象外。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: コマンドトリガーのアイコン・列幅・縦追加ボタン 0.90.7

- 0.90.6の未コミット変更を保持し、設定インデックスのコマンドトリガーを稲妻へ変更。共通コマンド一覧とカスタムコマンド一覧の公開マークを除去し、共通カタログで外部非公開と判定されたコマンドだけ南京錠を表示する。公開状態が不明な保存済みコマンドには付けない。実際の公開設定・権限・コマンド実行は変更しない。
- 統合一覧の条件文字を左寄せにし、ジェスチャー列の基本配分を24%から20%へ縮めて条件列へ割り当てた。コマンド単位の上下8pxは保ち、割り当て内部の上下余白だけ2pxへ縮小。32px角の操作領域を維持し、長い条件は必要な高さへ伸ばす。
- 追加アイコン3つを、コマンド名・IDの右横へ右寄せで縦に配置。間隔4px、各32px角とし、名前・ID・ボタン全体が同じセル内で追従する。割り当てが少ないコマンドにも縦3ボタンを収める高さを確保する。従来一覧の移動列は、増えていた4つの移動先が右余白内へ収まる幅へ調整した。
- 発行前レビューで共通カタログの真偽と不明状態、共通UIの影響範囲、文字の実座標、上下余白・操作サイズ、右横の縦配置と追従・フォーカス復帰を確認。GUIで見つかった従来移動列の幅不足を修正し、明暗/1280・760pxで再検証した。既存GUIの移動先数と件数位置の古い参照も現行仕様へ合わせ、禁止キーを含む実環境用fixtureをF8〜F11へ変更してから関連GUIを実行。阻害指摘なし。設定キー・保存ファイル・実行基盤の変更がない通常パッチとして0.90.7へ更新した。
- 固定Node24.22.1/pnpm12.10.1・同一lockfile/供給網検査で整形、型検査、build、frozen install、publish成功。保存/競合/翻訳の関連2ファイルは**14/14件、fail/skip 0**。最終固定EXEで統合一覧**15群**、共通の移動/公開表示/フィルター**12群**、従来一覧**8群**、隔離smoke成功。非公開/公開/不明の区別、条件文字の実左端、条件列と入力列の幅、24割り当ての内部余白と外側8px、右端の縦3ボタン、追加/編集/削除確認/実行順、行ホバー/フォーカス、セル内追従/横移動、明暗/狭幅、実再起動保存を確認した。UI変更の影響を受けない保存・入力基盤の全回帰は再実行していない。
- **0.90.7 / 170,668,768 bytes / SHA256 `e83449632e6bf6e1de6e64f3fe221d09e307de97b08e8b33258d6c092d9be318`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連コード・翻訳・renderer計11ファイルを照合。固定GUI用コピー3本も同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)と[共通一覧](docs/settings-list-editing.md)。証跡は`.artifacts/command-trigger-density-20261026/`のレビュー・ログ・`bundle.json`・`validation.json`・入力hash。固定GUIは`.artifacts/command-triggers-ui-1792951567312/result.json`、`.artifacts/settings-hints-ui-1792951625821/result.json`、`.artifacts/shortcuts-ui-1792951656901/result.json`、smokeは`.artifacts/smoke-1792951729285/smoke-result.json`。テスト用プロセスの終了を確認し、今回の成功・先行版の再利用資料・途中の診断資料を保持、削除0件。物理入力とWindowsタッチパッド設定の書き込みは対象外。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: ジェスチャー列・条件クリック編集・操作表示 0.90.6

- 0.90.5の未コミット変更を保持し、コマンドトリガーの見出しと列順を「コマンド」「ジェスチャー」「いつ・どこで」へ変更。条件の文字をクリックまたはEnterで押すと、対象割り当ての既存編集ダイアログを開く。適用時の保存・競合検査を共用し、閉じた後は条件ボタンへフォーカスを戻す。
- 編集・実行順・削除を最終列の右端へ配置。行のホバーまたは行内フォーカスがあるときに表示し、それ以外はopacityとpointer-eventsで隠す。領域とTab移動を残し、表示切替で周囲を動かさない。追加アイコンはコマンドIDの下へ移動し、コマンド名・ID・追加ボタンのまとまりが引き続きセル内で追従する。旧一覧の列名・操作表示・追加方法は変更しない。
- 発行前レビューで列と行の対応、条件の編集対象/保存/フォーカス復帰、非表示操作の誤クリック防止とキーボード到達、右端位置の維持、追加アイコンとIDの上下関係、既存一覧とセル内追従への影響を確認し、阻害指摘なし。保存キー・ファイル・実行基盤の変更がない通常パッチとして0.90.6へ更新。固定Node24.22.1/pnpm12.10.1・同一lockfile/供給網検査でfrozen install、整形、型検査、build、publish成功。保存/競合/翻訳の関連2ファイル**14/14件、fail/skip 0**。
- 最終固定EXEで統合一覧**14群**、従来一覧**8群**、隔離smoke成功。新たに条件文字のクリック/Enter、条件の変更・保存と復帰、Tabでの操作ボタン到達、非ホバー/非フォーカス時の非表示とクリック透過、ホバー/フォーカス時の表示、切替前後の座標一致、最終列右端、IDより下の追加ボタンを確認。先行する追加・編集・削除確認・同じ入力の実行順・条件/入力の分離・複数種類と一時フィルターの独立・1280/700pxの追従と横移動・明暗/3幅の旧画面・実再起動保存も成功した。表示比較は対象行を表示してからポインターだけを移動し、検査自身の自動スクロールを分離した。
- **0.90.6 / 170,669,924 bytes / SHA256 `35d973c3307debc3b7759c097f270d370ef1b49b6824249e447d5b6dcdc90110`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連コード・翻訳・renderer計11ファイルを照合。GUI用コピー2本も同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 証跡は`.artifacts/command-trigger-actions-20261026/`のレビュー・ログ・`bundle.json`・`validation.json`・入力hash。固定GUIは`.artifacts/command-triggers-ui-1792950081163/result.json`、`.artifacts/shortcuts-ui-1792950152183/result.json`、smokeは`.artifacts/smoke-1792950289387/smoke-result.json`。テスト用プロセスの終了を確認。今回の成功資料と診断資料、先行版の再利用/検証資料を保持し削除0件。物理入力・実利用設定・Windowsタッチパッド設定の書き込みは対象外。本件のcommit/push/Release/実利用deployなし。

## 2026-10-26: コマンドトリガーの列分離・直接追加・セル内追従 0.90.5

- 0.90.4の未コミット変更を保持し、統合一覧を「コマンド」「いつ・どこで」「割り当て」の3列へ変更。条件と入力を行単位でそろえ、編集・実行順・削除は割り当て列内の右側へ配置した。各コマンドのキー・マウス・タッチの追加ボタンから、その種類の既存編集ダイアログを直接開く。種類選択と「次へ」の段階を除き、取消後は押した追加ボタンへフォーカスを戻す。
- 割り当ての種類名を既存SVGへ変更し、入力文字列は保持。サイズは`max(1cap, 16px)`、tooltipと操作ラベルには種類名を残す。種類フィルターもアイコンにし、一時フィルター行の左端へ移動。複数選択・一時フィルターとの独立性・全解除と復帰の既存動作は維持する。
- コマンド名・提供元・追加ボタン・IDを上寄せでまとめ、設定本文のスクロールに応じて固定フィルター下へ追従させる。横スクロールの祖先を持つため、本文とセルの実寸から移動量を求め、セルの下端へ収める。読み取りとtransform更新を分けてrAFで調整し、ResizeObserver/MutationObserverとイベントを破棄時に回収する。従来一覧は既定の列・追加ボタンを使い、追従を有効にしない。保存・実行・入力認識・設定キーと保存ファイルの変更はない通常のパッチ更新。
- 発行前レビューで条件列と操作の対応、型別追加の初期scope、フォーカス復帰、セル上下端・横移動・狭幅、アイコンの識別と読み上げ、従来一覧への影響を確認し、阻害指摘なし。不要になった種類選択ダイアログ用のapplyLabel拡張も除去した。固定Node24.22.1/pnpm12.10.1、同じlockfile・供給網検査でfrozen install、整形、型検査、build、publish成功。保存・競合・翻訳の関連2ファイルは**14/14件、fail/skip 0**。保存/実行基盤に後続変更がないため、前段の無関係な回帰は再実行していない。
- 最終固定EXEで統合一覧**13群**と従来一覧**8群**、隔離smoke成功。追加した検査は3列順と条件分離、割り当て内操作、種類別の一発追加、アイコンの名前/最小寸法、一時フィルター行の左端、1280/700pxでの追従・セル下端停止・横スクロール・リサイズ・自然位置への復帰、追従中の追加クリックと取消後フォーカス。既存の保存・削除確認・順序・明暗/3幅・再起動も維持した。従来GUIの位置検査は共通セル内のラッパー追加に合わせて対象を`.binding-value-cell .muted`で特定し、同じ左端一致の検査を継続する。
- **0.90.5 / 170,684,500 bytes / SHA256 `74a0860c7c0743b1df7ef72e83fb8bae0a3588517ab7230b09b6c1a40c02869b`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連コード・翻訳・renderer計11ファイルを照合。2本のGUI用コピーも同じhash。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)。証跡は`.artifacts/command-trigger-layout-20261026/`のレビュー・各ログ・`bundle.json`・`validation.json`・入力hash。最終GUIは`.artifacts/command-triggers-ui-1792947336844/result.json`、`.artifacts/shortcuts-ui-1792947430066/result.json`、smokeは`.artifacts/smoke-1792947563354/smoke-result.json`。今回のテスト用プロセスの終了を確認。新設一覧GUIは開発ビルド3回/portable2回の成功を保持し、各実行方式の直近3回以内。失敗診断・先行版の再利用資料も保持し、削除0件。
- 物理入力・実利用設定・Windowsタッチパッド設定の書き込みは対象外。ブラウザ判定共有化、入力単位の実行方式、割り当て別exe除外などは次の段階。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: コマンドトリガーの統合一覧 0.90.4

- クリーンなmainで追跡先へ`pull --ff-only`し、最新であることを確認して着手。「コマンドトリガー」ページと開くコマンドを設定カタログへ追加。キー・マウス・タッチパッドを同じコマンド行に表示し、種類選択からの追加、既存の共通ダイアログによる編集・削除確認・同じ入力の実行順変更へ接続した。従来の3ページと一覧も保持する。
- 「キー・マウス・タッチ」は複数選択できる。入力・提供元などの一時フィルターを設定しても種類の選択を保持し、全種類OFFは0件、絞り込み解除は全種類ONへ戻す。画面移動をまたぐ保持や設定保存は追加しない。統合一覧には移動列を置かず、従来一覧からのコマンド指定移動は利用できる。共通一覧・ツールバー・モーダル・スクロール・翻訳基盤を使用した。
- ページの編集可能範囲は既存の`keybindings`、`gestures.bindings`、`touchpadGestures.bindings`のみ。表示IDに種類を含め、同じ保存済みIDが別の種類に存在しても分離する。表示だけでは保存配列を変更せず、タッチパッド接続用キーの二重表示も行わない。認識設定、ブラウザ判定、接続設定、条件判定、実行基盤、既存の保存キーとファイルは維持する。新しい保存項目・ファイルを追加しない通常変更として0.90.3へパッチ更新し、発行後の移動列・種類フィルターの追加要望を反映して最終版を0.90.4へ進めた。
- 発行前レビューで要件・表示IDの衝突・保存範囲・順序・外部更新との競合・入力停止とモーダルの寿命を確認。追加時の種類選択には、成功時に自動で閉じるSettingsDialogではなく共通BindingEditDialogを使用するよう修正。種類フィルターの解除も共通ツールバーに接続し、再検証した。最終の移動列除去・複数選択と一時フィルターの独立性を含め、発行阻害の未解決指摘なし。
- 固定Node24.22.1/pnpm12.10.1と同じlockfile・供給網検査でfrozen install、型検査、build、publish成功。関連13ファイルの単体試験は**139/139件、fail/skip 0**。表示専用投影、追加・編集・削除の保存先、同じIDの分離、保存順、外部変更の競合、ページの許可範囲、既存ページの存続を検証。最終のフィルター文言変更後は翻訳8件を再実行し、先行139件に含まれる残りの成功は、後続変更がrendererの表示・共通部品の任意propsのみで保存・実行モジュールに影響しないことから再利用した。標準全回帰896件の再実行は行っていない。
- 最終固定EXEで統合一覧**10群**（全種類・未割り当て・検索・提供元・複数選択と一時フィルターの切替・追加・編集・削除確認・同じ入力の順序・旧画面編集の反映・移動列なし・実再起動保存）と、従来一覧**8群**（条件・無効行・不明/互換コマンド・競合・入力記録・ドラッグ/キーによる順序・外部変更のマージと競合・明暗/3幅・再起動保存）成功。従来GUI試験に残っていた廃止済みの上部「実行順…」参照を現行の行ボタンへ更新し、空一覧は実行順の入口がないことを検査する形へ合わせた。製品の動作を旧テストへ戻す変更は行っていない。
- **0.90.4 / 170,676,267 bytes / SHA256 `31c8276424d5c1909a55abc481a6b6bbe66594cd06981ad68b05a6bdf4330be4`**。EXEのFile/ProductVersion、feedの版/サイズ/hash、同梱ASARの本体/Default Shell版と関連JS/翻訳/renderer計11ファイルを照合。GUI用コピー2本も同じhash。固定EXEの隔離smoke成功。ASAR検査はWindows内のパス正規化を修正して成功した。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 正本は[コマンドトリガー](docs/command-triggers.md)。証跡は`.artifacts/command-triggers-20261026/`の`review.json`・単体/発行/smokeログ・`bundle.json`・`validation.json`・入力hash。最終GUIは`.artifacts/command-triggers-ui-1792945290541/result.json`と`.artifacts/shortcuts-ui-1792945622278/result.json`。新設GUIの成功は直近3回以内で、解決済み失敗の診断資料と既存再利用資料も保持し削除0件。今回のテストプロファイルを参照するAppDock/Electron/Nodeプロセスの終了を確認した。
- 入力の物理操作、実利用の割り当て、Windowsタッチパッド設定の書き込みは未検証。ブラウザ判定共有化、入力単位の実行方式、割り当て別exe除外、旧一覧撤去と旧ページの改名は次の段階。本件のcommit/push/Release/実利用deployは行っていない。

## 2026-10-26: Applet有効状態と管理表示順のMCP接続 0.90.5

- 専用worktree `AppDock.at365-mcp-settings-design`、追跡先のない`codex/mcp-settings-design`のcleanな`0627d35`から継続。現在のbranchを保ち、pull先の追加、main統合、push/Release/deployは行わない。既存のenabled/appletOrderへMCP adapterを追加する変更で、設定項目・保存ファイルの追加削除と破壊的変更を含まないため、発行済み0.90.4から**0.90.5**へパッチ更新した。
- 外部パッケージのapplet-common対象へenabledを接続。booleanの明示set、resettable=false、inherited=nullとし、組込み/collection子ページは共通対象へ含めない。AppletManagementの準備・対象検証をUI/既存コマンドと共用し、ready・同一Appletのbusy・起動/停止中・既定の有効状態と保存済みOFFを保持する。任意の内部呼出し、再起動、開始待ちの即時開始、導入・削除、保存先切替を設定APIへ追加しない。
- enabledは共有/PC専用の通常設定指定によらず既存の端末設定へ保存する。起動待ちやページ表示先との同時変更も同じ候補・検証・保存にまとめ、未編集の共有値、ローカルconfiguration、固有設定と暗号化情報を保持する。通常の設定通知で起動/停止/待機予約を再適用し、settingsSaved/effectVerified=falseは保存完了だけを表す。dryRunは保存・起動停止をせず、同値/再送で保存や再起動を繰り返さない。read + writeで使え、executeは追加条件にしない。
- 管理順序はkind=list/category=applet-management、id/nameが読取り専用、操作はreorderだけ、最大500行。共通の一覧基盤に所有対象ごとの対応操作を持たせ、targets.listとoperationSchemasへ同じ範囲を返し、未対応操作を計画前に拒否する。既存の宣言型/AI/TTS一覧のCRUDは維持する。
- 管理画面と同じmanagedApplets/reorderManagedAppletsを使い、共有appletOrderの管理対象位置だけを変更する。未導入/子ページ/組込みの保存位置と相互順序、未記録IDの補完、PC専用の有効状態を保持する。検出/起動順、入力割当の実行順とリボン配置へ流用しない。提供元の増減はSchema、保存順や値の変更はrevision/itemRefへ反映し、古い要求・不足/重複/偽造参照を拒否する。
- 発行前に所有処理の共用、非公開/秘密投影、設定/一覧の許可、原子的保存、適用境界、既存UIと必要回帰をレビューした。管理ownerを持たない既存構成で無関係な通常項目へguardが働かないよう修正し、既存の共通設定回帰を再実行。専用一覧の期待操作とGUIのswitch識別も整合し、阻害指摘なし。製品UI/CSSと8行の操作許可を変更していない。
- 固定依存install、型検査、本体/Default Shell build、関連標準回帰**70ファイル693/693件、fail/skip 0**が成功。新規所有adapter回帰12件は、dryRun/同値/再送/許可取消、既定ON/明示OFF、busy、同時項目の原子的検証、端末保存、管理対象の動的増減、対応操作制限、子/欠落/組込み位置、保存失敗と両ファイル保持を確認。以前の通常項目自動登録・一覧・秘密保護も同じ回帰で確認した。標準全体は未実行。
- 隔離source/最終固定EXEの実MCP・画面試験は各**32群**、固定EXE smokeも成功。enabledのdryRunでworkerを停止せず、MCP/UIの無効→有効で合計起動回数3、待機取消→再予約では未起動を確認した。管理順のMCP/UI相互反映、保存済み欠落IDの位置、共有/端末ファイル分離、古い要求の拒否、秘密bytes保持、execute OFFとtools/list不変を確認。実利用の設定/認証、OS登録や物理入力は変更していない。
- 最終**747入力**と参照するWebApplet/WallpaperSlideshow manifestのSHA256は、回帰前後・発行前後・固定試験後で一致。Node 24.22.1、pnpm 12.10.1、Electron 45.0.0、.NET SDK 10.0.402、Windows AMD64で実行した。整形は既存のsrc/scripts/tests範囲を確認し、package.jsonは版番号だけを変更。発行後は文書と証跡だけを追加した。
- publish.bat終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170699611 bytes / SHA256 `2adb7a54671fe1caa416eb3711e786fd3dc1d7b026773c2c6e69a0bdaad927ae`**。File/ProductVersion、feed版/size/hash、ASAR内package/同梱Default Shellと固定試験コピーを照合した。
- 正本は[設定API](docs/settings-api.md)、[設定基盤](docs/settings-foundation.md)、[Applet管理](docs/applet-management-settings-design.md)、[外部操作](docs/automation.md)。証跡は`.artifacts/mcp-settings-applet-management-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-applet-management-20261026/`。source=`mcp-settings-foundation-source-1792953636830`、固定EXE=`mcp-settings-foundation-portable-1792953892452`、smoke=`smoke-1792953926516`。
- 試験プロセス0。今回の成功profileはsource 2回/固定1回/smoke 1回で各方式の直近3回以内。過去の検証証跡/参照profile、失敗診断、固定ビルド出力と別作業を保持し、削除0件。初期診断はowner-initial.log（保存先切替fixtureのrevision不足）、owner-verified.log（optional管理ownerのguardと専用操作の期待値）、source-gui-initial.log（既存switchをcheckboxとした識別）に残し、最終回帰で解消を確認した。

## 2026-10-26: Applet共通設定の宣言共有とMCP接続 0.90.4

- cleanな`e781d4d`から専用worktree `AppDock.at365-mcp-settings-design`の`codex/mcp-settings-design`を継続。Applet共通の起動待ち時間とページ表示先を既存の固定6入口へ接続した。通常の共通項目も定義追加だけで公開できるよう、型/画面/検証/カタログ/JSON/保存を共通化。追跡先の追加、main統合、push/Release/deployは行わない。
- 正本を[src/shared/applet-common-settings.ts](src/shared/applet-common-settings.ts)のappletCommonSettingDeclarationsへ集約。boolean/number/string/selectの通常項目は同じ宣言から生成し、MCP専用の項目表を持たない。fromManifestの既定値と検証も共用する。automation省略時は公開、false/secret/localOnlyはMCPの名前/Schema/値/検索/更新から除外し、trueでも秘密を公開しない。起動/停止・認証・更新元等の所有処理は通常項目へ混ぜない。
- 共通設定は停止/無効の外部Appletも編集でき、組込みとcollection子ページは対象外。起動待ち時間は0～86,400の整数、表示先は現在のpagesから`page:<ID>`を生成してpage/windowを選択する。ドット入りIDをそのまま扱い、消えたページの指定と未編集の固有値を保持する。ページ/既定値/保存先の変更はSchemaへ反映し、古いSchema・cursor・値要求を拒否する。
- 現在の共有/PC専用設定から上書きを読み、同じ保存先で既定値set/resetを行う。PC専用編集で休眠中の共有値を変更せず、有効状態・更新元・固有設定・他ページと暗号化ファイルを保持。未対応のページ追加データを消すresetを拒否し、既定省略時も残る行にはparserが必要とするdisplayを保持して、両ファイルの再読込を確認した。read + writeを使い、execute許可を保存条件にしない。
- 既存の設定変更・worker schedule・Surface表示先変更へ接続。実行中workerを再起動せず、待機中は保存後に予定を再計算し、無効Appletを有効化しない。ページを明示的に開いた後のpage/window往復ではWebContentsと入力を保持する。探索/値取得/dryRunでページを開かず、dryRunでは保存/起動予定変更をしない。適用時点とeffectVerified=falseを公開する。
- 発行前に公開判定、型/共通宣言、通常入力の即時保存、共有/端末別の分離、既定継承、ページID/追加データ、worker/Surfaceの寿命と必要回帰をレビュー。追加データが残るページのdisplay既定省略を修正して再検証し、阻害指摘なし。UIは既存共通部品と見た目を保ち、共通項目の描画を宣言駆動へ置き換えた。保存先切替には検証用test-idだけを追加した。
- 固定依存install・型検査・本体/Default Shell build、最終の関連標準回帰**69ファイル681/681件、fail/skip 0**が成功。所有adapterは58件、今回の新規9件を含む。試験用宣言へのトグル/文字/選択/数値追加だけで探索・検証・検索/JSON・両保存先へ反映し、非公開3種類を除外することを確認。dryRun/無変更/再送、原子的失敗、外部競合/許可取消、ページ増減/既定変更、追加データ保持と再読込も検証した。標準全体は未実行。
- 隔離source/最終固定EXEの実MCP・画面試験は各**28群**、固定EXE smokeも成功。通常保存とUIの相互反映、PC専用への切替/旧Schema拒否/既定復帰、既存画面の入力保持、待機予定の再計算、worker起動回数1・無効/待機worker未起動、暗号化キーbytes保持、execute OFF、tools/list不変を確認。GUIの初期失敗は保存先の識別子、簡略MCP応答にない予定時刻の取得元、後続試験前の設定画面復帰を修正して解消し、診断ログを保持した。
- 最終**745入力**と参照するWebApplet/WallpaperSlideshow manifestのSHAは回帰前後・発行前後・固定試験後まで一致。整形は既存手順のsrc/scripts/testsを確認した。package.jsonはGit checkout時のCRLFを保ち、元版との差が版番号だけであることを別途照合した。発行後は関連文書と本記録だけを変更した。
- 既存の設定/保存ファイルと公開操作契約を保つadapter・共通化のため**0.90.4**へパッチ更新。publish.bat終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170688089 bytes / SHA256 `cec37d666a039069e8d74eda1d64fa65c09f5898cf3e64c6e95143d01cf1666d`**。File/ProductVersion、feed版/size/hash、ASAR内package/同梱Default Shell、固定試験コピーの一致を照合した。
- 正本は[設定API](docs/settings-api.md)、[設定基盤](docs/settings-foundation.md)、[Appletページ](docs/applet-pages.md)、[外部操作](docs/automation.md)。有効/無効・管理順序と他の専用adapterは後続。検証は隔離profile、合成した通常/非公開値と暗号化fixtureキー、loopback feedのみで、実利用の設定/認証・OS登録・物理入力を変更していない。
- 証跡は`.artifacts/mcp-settings-applet-common-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-applet-common-20261026/`。source=`mcp-settings-foundation-source-1792946169889`、固定EXE=`mcp-settings-foundation-portable-1792946601945`、smoke=`smoke-1792946629011`。試験プロセス0、今回の成功は方式ごとの直近3回以内。過去の再利用資料/診断/固定出力を保持し、削除0件。

## 2026-10-26: 最新mainのMCP設定worktreeへの統合 0.90.3

- cleanな`codex/mcp-settings-design`の`5064a09`へ、fetchで確認した最新`origin/main`=`28b24c6`を通常merge。mainの`6a3536c`/`28b24c6`によるリボン表示モードと一時グループ統合を取り込み、MCP設定の既存変更を保持した。追跡先の追加、primary main checkoutの変更、push/Release/deployは行わない。次の所有adapterは推薦のみとし、今回追加実装していない。
- 一時グループのribbon領域への統合により、現在のShellは6領域。共通const由来の型・MCP/UI候補生成と、mainの廃止領域判定・ribbonSchemaVersion 3を両立した。独立overlay.ribbon-groupをMCPへ出さず、保存済みの旧指定を保持して他領域だけを編集できることを専用回帰で確認。固定6入口の外側Schemaは変更しない。
- 競合4ファイルを整合した。shell.tsは共通定義からの導出を保ち、host.jsonは両方の翻訳キーを保持、VERIFICATIONは双方の記録を保持。package.jsonはmainの発行済み0.90.2から統合版**0.90.3**へパッチ更新。main側の設定変更/領域削除を超える設定項目・保存ファイルの追加削除はなく、新しいマイナー更新は行わない。
- 固定lockfile install、型検査、本体/Default Shell build、関連標準回帰**59ファイル616件＋表示境界4ファイル24件＝63ファイル640/640件、fail/skip 0**が成功。新しいリボン表示・group/Shell・ページ/モーダル・設定/MCP/保存/権限を対象とし、標準全体は未実行。Node24.22.1/pnpm12.10.1/Electron45.0.0を維持し、.NETのRibbonBadge fixtureをRelease buildした。
- 隔離sourceと最終固定EXEのMCP/GUIは各**24群**成功。実際の領域減少後もSchema/候補/値/set/reset、保存/再送/競合、無効提供元、既存AI/TTS/通知/更新/一覧と暗号化キー保持、tools/list不変を確認。固定EXEのリボングループ**7群**・リボン編集**6群**・smokeも成功。24項目の縦スクロールとEnd/Escape、領域位置、Node/.NETのbadge、実Window resizeでの閉鎖、追加/編集/コマンド実行/右クリック/無効化拒否/既定復帰/再起動を確認した。
- 追加GUIの古い試験前提を修正。24ページを1manifestへ宣言したfixtureを、既存10件上限を保った8ページ×3Appletへ変更した。Windowを本体URLで選び実寸の変化を検査し、統合後のpopup DOM、設定data-testid、実リボン背景を操作する。廃止されたdetails/summary/overlay.html/brand-markへの依存を除去した。操作・保存・実行回数の検査は維持し、製品コードや上限を緩めていない。失敗ログとprofileは診断証跡として保持した。
- 発行前レビューで型/翻訳/共有とPC専用保存、領域減少、既存MCPとの合成、版区分と回帰範囲を確認し、試験修正も再確認して阻害指摘なし。**743入力**と参照するWebApplet/WallpaperSlideshow manifestのSHAは最終標準回帰から発行まで一致。発行後の変更は上記GUIスクリプト2つと文書のみで、製品・640回帰・MCP/GUI入力は不変。成功を再利用し、変更したリボンGUIを再実行して最終差分/入力/EXE hashを照合した。
- publish.bat終了0。EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170684876 bytes / SHA256 `e09d5409ab9bd95ad12208f6a90529aa18cf607a77e1e2fe5fd4fb713fa814fa`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shell、固定試験の各コピーを照合した。実利用の設定・認証、Windows起動登録、実アカウントや物理入力への効果は今回の対象外。
- 証跡は`.artifacts/mcp-settings-main-merge-20261026/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-main-merge-20261026/`。source=`mcp-settings-foundation-source-1792941459646`、固定MCP=`mcp-settings-foundation-portable-1792941754267`、group=`ribbon-groups-ui-1792942233614`、編集=`ribbon-customization-ui-1792942702476`、smoke=`smoke-1792942752524`。試験プロセス終了を確認し、今回の成功は各方式の直近3回以内、過去の再利用資料/診断/固定出力は保持、削除0件。

## 2026-10-25: 領域の増減に追従するShell選択の共通MCP操作 0.88.11

- cleanな`fcb6751`から専用worktree `AppDock.at365-mcp-settings-design`の`codex/mcp-settings-design`を継続。Shell選択を既存の固定6入口へ接続した。追跡先は作成せず、mainへの統合・push・Release・実利用先deployは行わない。
- ShellRegion型と公開フィールドを同じshellRegionsから導出し、UI/MCPの候補判定をshellProviderCandidatesへ共通化。領域の追加/削除、提供元のview変更/消失、同名・停止/無効提供元を扱い、外側のツールSchemaは不変。候補の表示名・有効状態もschemaRevisionへ束縛し、古いSchema/cursor/再送を拒否する。増減はunit fixtureで模擬し、実製品の領域は既存7つを維持した。
- ドットを含む領域IDを平坦な保存キーとして扱い、指定した項目だけをPC専用settings-<端末名>.jsonへ保存。reset/既定値setで上書きを除去し、共有ファイル・他の端末・Applet設定・資格情報bytesを保持する。廃止/未知領域と消失提供元の保存指定は保持し、直接編集は現行領域/候補だけを許可。read + writeで保存し、execute・有効化・再試行を兼ねない。
- 発行前に動的投影、選択候補、保存先/既定省略、秘密と権限、Shell寿命と既存UIへの影響をレビュー。既存PC専用の上書き取得/リセット時rewriteへ接続し、試験の保存先前提と失敗注入先も修正した。初回回帰の失敗ログは保持し、全対象を再検証して阻害指摘なし。画面の見た目は保ち、候補判定の共有と検証用属性だけを変更した。
- 固定依存install・型検査・本体/Default Shell build、関連標準回帰**55ファイル584/584件、fail/skip 0**が成功。所有adapterは48件で、今回のShell7件を含む。追加/削除/再追加時の探索、未知キー/不正候補、dryRun/再送/無変更、外部競合/許可取消、保存失敗/原子性、PC専用/暗号化ファイルの保持、既存Registryのフォールバック/safe-shellを確認した。標準全体は未実行。
- 隔離sourceと最終固定EXEの実MCP/GUIは各**24群**、固定EXE smokeも成功。現在の7領域すべての指定、バー/リボンのready・bound、MCPと既存UIの相互反映、古い要求の拒否、無効Appletの指定保持と領域別Default Shell復帰、reset/継承、共有bytes/暗号化キー保持、execute OFF、tools/list不変を確認。Shell選択画面のスクリーンショットも確認した。既存の通知/AI/TTS/一覧/更新設定の検証も含む。
- 型検査/build/584回帰後の変更はGUI helperのスクリーンショット前スクロール1行だけ。標準試験と製品の入力に影響しないことを照合し、成功を再利用してsource/固定GUIを再実行した。最終**740入力**と参照するWebApplet/WallpaperSlideshow manifestのSHAは最終GUIから発行・固定試験まで一致し、詳細はcommit-validationのvalidation.jsonへ記録した。
- 設定項目/保存ファイルの追加・削除と公開操作契約の破壊を含まないadapter追加につき**0.88.11**へパッチ更新。publish.bat終了0。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170680316 bytes / SHA256 `3066b5cd3a9fc75c0a552724d40ea8e1fd423b2f427c775292004fb637279fae`**。Windows File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shell、隔離コピーと最終EXEを照合した。
- 正本は[設定API](docs/settings-api.md)、[Shell基盤](docs/shell-foundation.md)、[外部操作](docs/automation.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。実利用の設定/認証、実外部Shellパッケージ、新規Shell領域の実装、物理入力/OS効果は今回の検証対象外。起動等の残りの所有adapterは後続範囲。
- 証跡は`.artifacts/mcp-settings-shell-20261025/`、最終照合は`.artifacts/commit-validation-mcp-settings-shell-20261025/`。source=`mcp-settings-foundation-source-1792937818687`、固定EXE=`mcp-settings-foundation-portable-1792938084928`、smoke=`smoke-1792938109810`。発行後の変更は関連文書と本記録のみ。試験プロセス0、今回の成功は方式ごとの直近3回以内、過去の再利用資料/診断/固定出力は保持し、削除0件。

## 2026-10-25: 更新設定とApplet更新元の共通MCP操作 0.88.10

- cleanな`010845e`から、追跡先なしの`codex/mcp-settings-design`で本体の更新設定7項目と外部Appletごとの更新元adapterを実装。固定6入口のfields対象として取得・set/resetでき、外側のツール定義と8権限は維持した。mainの変更/統合と追跡先の設定は行わない。
- 本体は既存UpdateSettingsの既定値と共通カタログから通常フィールドを生成し、型・更新元の書式・整数0～3,600秒を既存validator/parseSettingsで検証する。GitHub、HTTP(S)、Windows絶対パス/UNC、空欄を受け付け、保存の検証で配布先のファイル読取り・通信を行わない。未登録キーと更新操作そのものは設定APIから受け付けない。
- Appletはmanifest更新元の継承、明示的な空文字による無効化、resetによる上書き解除を区別する。既定がない場合はdefault/valueを省略し、明示した無効化は後から既定が追加されても保持する。同名提供元の分離、既定変更時のSchema競合、提供元の除外/消失、停止・無効時の保存を確認。組込みとcollection子ページは更新対象外であり、固有設定・enabled・PC専用値を変更しない。
- 設定保存はread + write、更新チェック・インストールは既存の独立したexecute経路へ分離。About表示中の保存/ONで自動確認が再発火しないよう、既存UIの自動確認を各表示につき1回へ限定した。次に開いた時は従来の1時間間隔判定を使う。既存の予約済み起動時チェックが最新の対象/通知を参照することをレビューし、適用時点をnextStartupCheck、待ち時間をnextStart、更新元/同版許可をnextUpdateCheckとして公開する。
- 発行前に公開定義/保存先、継承/既定省略、秘密情報、設定と実行の分離、自動確認、外部競合/再送/失敗時の原子性をレビュー。起動時の適用時点を修正し、再検証した。GUI初期のAbout再表示後とApplet共通設定の折りたたみを試験側で開くよう修正。最終の阻害指摘なし。失敗ログは保持した。
- 固定依存install・整形/型検査・本体/Default Shell build、最終関連標準回帰**53ファイル559/559件、fail/skip 0**が成功。所有adapterの41件は今回の新規8件を含み、更新元書式、非公開/未登録情報、明示無効化、既定継承、停止提供元、device/資格情報bytes保持、無通信、保存失敗、競合と許可取消を検証。About・起動時確認・既存PortableUpdatesも対象とし、標準全体は未実行。739入力とWebApplet/WallpaperSlideshow参照manifestは最終回帰から発行までSHA一致。
- 隔離sourceと最終固定EXEの実MCP/GUIは各**21群**、固定EXE smokeも成功。MCP保存と本体/Applet既存UIの相互反映、空欄とreset、古い要求の拒否、暗号化キーbytes保持、更新execute OFFでの拒否、保存中の無通信を確認した。ループバックの既知feedへ次回About表示時だけmetadataを1回取得し、payload取得・適用を行わない。既存のAI/TTS/通知/一覧/動的候補/秘密除外/許可取消とtools/list不変も成功。
- 発行後にGUI試験だけを補強し、2描画フレーム後・画面遷移前にも要求0件を確認した。source/固定EXEの21群を再実行して成功。変更は`scripts/settings-update-gateway-checks.cjs`のみで、製品/標準回帰の依存入力と発行EXEは不変。前後739入力の差分を照合し、型検査/build・559回帰・smokeの成功を再利用した。全入力照合と試験ごとの影響判定はcommit-validationのvalidation.jsonへ記録した。
- 既存設定項目/保存ファイルと公開操作契約を保持する追加adapterとAbout動作修正のため**0.88.10**へパッチ更新。publish.bat終了0で.NET各Host/Updaterも発行。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170677589 bytes / SHA256 `e98f0c9f6a56718084a383bb60313d5b1f243c9b7a2bb4bb0c1f6059759b8cf3`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shell、隔離コピーと最終EXEを照合した。
- 正本は[設定API](docs/settings-api.md)、[更新](docs/updates.md)、[外部操作](docs/automation.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。起動/Shell等の専用adapterは後続。実利用の設定/認証・実配布元の更新取得/適用・helper交換/再起動・物理入力/OS効果は今回の対象外。push・Release・実利用先deployなし。
- 証跡は`.artifacts/mcp-settings-updates-20261025/`、最終照合は`.artifacts/commit-validation-mcp-settings-updates-20261025/`。最終source=`mcp-settings-foundation-source-1792935149475`、固定EXE=`mcp-settings-foundation-portable-1792935159831`、smoke=`smoke-1792935003324`。発行後は上記GUI確認追加と関連文書だけを変更。試験プロセス0、今回の成功は方式ごとの直近3回以内、以前の再利用資料/診断/固定出力は保持し、削除0件。

## 2026-10-25: TTS手動ボイス一覧の共通MCP操作 0.88.9

- cleanな`cf8c558`から、追跡先なしの`codex/mcp-settings-design`でTTS手動ボイス一覧の所有adapterを実装。固定6入口の探索・Schema・行取得とadd/update/remove/reorderへ接続し、外側のツール定義と8権限を維持した。read + writeで編集でき、useTts/executeを保存の追加条件にしない。mainの変更/統合、追跡先の設定は行わない。
- 既存parseTtsSettings・共有保存・通常の再適用へ接続。サーバーへ渡すボイスIDを明示入力し、ID/nameを部分編集できる。UUIDを生成せず、itemRefはスナップショットの位置とrevisionへ束縛する。名前省略はIDで補完し、明示した空の名前、IDの大文字小文字/前後空白、同名行を保持。重複ID/空白だけのID/既存の文字列長違反を拒否する。
- 既存1,000件上限に合わせ、所有サービスのmaxItemsを全件reorderのデータSchemaにも反映。宣言型一覧64行、AI接続8行の制約と要求64KiB/応答256KiBを維持する。1,000件を100件ずつ取得し、全itemRefを含む実MCP要求が64KiB以内で保存できることを確認した。固定入口の変更やツール更新は必要としない。
- 一覧編集は既定ボイス・通知の指定・取得方式・URL/モデルを自動変更しない。最後の候補を削除した場合は空配列の共有上書きを省略する。暗号化ファイルの操作、ボイス取得通信、生成・再生を行わず、実サービスのmanual候補読取りへ編集後の一覧が反映されることを、秘密読取り/通信/再生を失敗させるfixtureで確認した。
- 発行前に公開ID/列、型/上限、既存JSON編集、保存先/既定省略、秘密情報、固定入口/権限、競合・再送・無変更・一部失敗をレビューし、阻害指摘なし。固定依存install・整形検査・型検査・本体/Default Shell build、初期関連75件と最終関連標準回帰**50ファイル512/512件、fail/skip 0**が成功した。所有adapterの33件には今回の新規8件を含む。標準回帰全体は未実行。738入力と参照するWebApplet/WallpaperSlideshow manifestは回帰・発行前後のSHAが一致した。
- 隔離sourceと最終固定EXEの実MCP/GUIは各**18群**、固定EXE smokeも成功。手動一覧のdryRun/追加/再送、ID編集、JSON画面との編集往復、同名行の順序、既定候補の削除後の参照保持、1,000件の取得/全件並べ替え/上限拒否、空一覧の省略を確認。隔離UIが生成したTTS暗号化キーのbytesは一覧操作前後で同一。既存のAI/通知/宣言型一覧/動的候補/秘密除外/許可取消とtools/list不変も成功した。
- 既存設定項目/保存ファイルと公開操作契約を保持する追加adapterのため**0.88.9**へパッチ更新。publish.bat終了0で.NET各Host/Updaterも発行。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170694224 bytes / SHA256 `7841d39a6e70225467dfa733cf966ab7882af84eddd71ef0af08a057c639caee`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shellと隔離コピーを照合した。
- 正本は[設定API](docs/settings-api.md)、[TTS](docs/tts-design.md)、[外部操作](docs/automation.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。起動/更新等の所有adapterは後続。実利用の設定/認証・実TTSサーバー・生成/音声再生・物理入力/OS効果は対象外。push・Release・実利用先deployなし。
- 完全ログ・入力/環境・レビュー・成果物は`.artifacts/mcp-settings-tts-list-20261025/`、最終照合は`.artifacts/commit-validation-mcp-settings-tts-list-20261025/`。source=`mcp-settings-foundation-source-1792932373979`、固定EXE=`mcp-settings-foundation-portable-1792932742473`、smoke=`smoke-1792932764574`。source GUI後の変更は関連文書のみ、発行後も本記録だけ。試験プロセス0を確認し、今回の成功は方式ごとの直近3回以内、以前の再利用資料/診断/固定出力は保持、削除0件。

## 2026-10-25: AI接続一覧の共通MCP操作 0.88.8

- cleanな`c5133ad`から、追跡先なしの`codex/mcp-settings-design`で次の所有サービス単位を実装。AI接続をlist対象として探索・取得し、固定6入口のadd/update/remove/reorderから操作できる。外側のツールSchemaと権限は変更せず、read + writeで保存できる。mainの変更・統合と追跡先の設定は行わない。
- ID生成、preset別初期値、名前/URLの正規化、8件上限、接続の検証を既存所有サービスへ接続。ローカルUIとMCPで最初の登録時の既定選択と既定接続削除時の解除を共有する。並べ替えはIDと表示順だけを使い、既定・生成優先度を変えない。既存fields対象の任意値resetも保持する。
- 共通一覧へ所有サービス用の行生成/確定、上限、削除可否、行ごとの書込み可否を追加し、SchemaのmaxItemsとitemsのwritableKeysへ反映。宣言型一覧は既存経路を維持する。正規化後の値をプレビューへ返し、無変更時は無書込み。秘密付き行の削除・URL/認証方式変更とキー必須の新規接続をLOCAL_ACTION_REQUIREDで拒否し、通常編集・追加・削除・並べ替えで暗号化ファイルを変更しない。保護判定は復号せず、破損/読取拒否も保護ありとして扱う。
- 発行前に公開列/ID、既存UIと所有サービス、許可と固定入口、外部競合/原子的保存、秘密の改訂と保存直前の再検査をレビュー。行の内容をschemaRevisionへ含めると保存要求の再送を拒否する問題を修正し、秘密の改訂は値のrevisionへ束縛した。初期の型推論を修正し、版更新後に依存メタデータを固定lockfileで再照合。阻害指摘なし。失敗ログも証跡へ保持した。
- 固定依存のinstall、整形検査、型検査、本体/Default Shell build、関連標準回帰**50ファイル504/504件、fail/skip 0**が成功。新規11件を含む所有adapterの25件で追加/削除/順序、同名行、部分編集、既定解除、8件上限、無書込み/再送、競合/許可取消、失敗時の無保存、復号0と暗号化bytes維持、計画後に追加された秘密の保存直前拒否を確認した。製品/試験/依存/ビルド等737入力とWebApplet/WallpaperSlideshowの参照manifestは検証・発行前後のSHAが一致。標準回帰全体は未実行。
- 隔離sourceと最終固定EXEの実MCP/GUIは各**15群**、固定EXE smokeも成功。新しい一覧の追加/再送、同名IDの区別、MCPと既存UIの編集往復、表示順、既定の解除、ローカル追加/削除ダイアログ、秘密付き行の操作拒否と暗号化bytes維持を確認した。接続・行・値が変わってもtools/listの名前と引数Schemaは不変。既存の通知・TTS・宣言型一覧・動的候補・秘密除外・許可取消も成功した。
- 既存の設定項目/保存ファイルと公開操作契約を保持する追加adapterのため**0.88.8**へパッチ更新。publish.bat終了0で.NET各Host/Updaterも発行。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170683454 bytes / SHA256 `36d59d4196291dbed3ed1debbfe66d01f99d62c0dee0b61a34d8d8e7f15c07a2`**。File/ProductVersion、feedの版/size/hash、ASAR内package/同梱Default Shellと隔離コピーを照合した。
- 正本は[設定API](docs/settings-api.md)、[AI](docs/ai.md)、[外部操作](docs/automation.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。TTS手動ボイス一覧、起動/更新等の専用adapterは後続。実AI/TTSサーバーの接続・生成・音声再生、実利用の設定/認証、物理入力/OS効果は対象外。push・Release・実利用先deployなし。
- 完全ログ・前後入力・環境・レビューと成果物は`.artifacts/mcp-settings-ai-list-20261025/`、最終照合は`.artifacts/commit-validation-mcp-settings-ai-list-20261025/`。source=`mcp-settings-foundation-source-1792931183933`、固定EXE=`mcp-settings-foundation-portable-1792931411051`、smoke=`smoke-1792931430708`。発行後の変更は関連文書と本記録のみ。試験プロセス0を確認し、今回の成功は方式ごとの直近3回以内、以前の再利用資料/失敗診断/固定出力は保持、削除0件。

## 2026-10-25: 通知・AI/TTS通常値のMCP所有adapter 0.88.7

- `codex/mcp-settings-design`のcleanな`5bddccc`から、次の所有サービス単位を実装。追跡先なしの専用worktreeを維持し、mainへの統合・追跡先変更を行わない。既存の固定6入口へ通知種類別/共通音声、AI共通/既存接続、TTS通常値のfields対象を追加し、外側のツールSchemaと8権限は維持した。
- 所有サービスの既存parser・AI接続検証・通知編集・共有保存/再適用へ接続。read + writeだけで更新でき、useAi/useTts/executeを設定保存の条件にしない。生成・試聴・モデル/ボイス取得・接続試験を兼ねず、AI接続の追加/削除/順序とTTS手動一覧は今回の対象外。任意のJSONパスや保存ファイル全体は公開しない。
- 暗号化情報はSchema/値/プレビューへ含めず、保護判定は復号しないメタデータ読取りで行う。暗号化ファイルの破損・読取拒否も保護ありとし、秘密付きURL/認証方式と、新たにキーを必要とする認証方式への変更をローカル操作へ制限。通常値の更新でAI/TTSの暗号化ファイルのbytesを保持する。秘密の改訂は公開revisionの内部HMACに束縛し、生のkeyRevisionは返さない。
- 通知の必須/許可先・固定寿命・整数/nullの表示時間を共通検証し、指定フィールドのresetで何も残らなくなった行は既存UIの編集経路でも除去する。未導入提供元・他の通知行を保持し、停止中の通知提供元を起動しない。音声はresetでTTSへ継承。AI接続の必須値はinherited=nullとし、temperature等の任意値はresetで除去する。明示的な名前編集だけUIと同じtrimを行い、別項目の更新で既存の名前を正規化しない。
- 発行前に公開投影、認証の結び付け、原子的保存/外部競合、継承、既存UIとSDKへの影響をレビュー。読取拒否を「秘密なし」と誤認しない処理、新しいBearer認証への切替防止、明示編集だけの名前正規化を確認・修正した。初期型検査のRecord型推論と、compact保存で省略されるnotificationPreferencesを扱うGUI fixtureを修正し再検証。最終の阻害指摘なし。
- 固定lockfileのinstall・型検査・本体/Default Shell build、関連標準回帰**50ファイル493/493件、fail/skip 0**が成功。通知・AI/TTS・設定MCP/API・一覧・共有/端末別保存・権限・既存編集を対象とし、標準全体は未実行。14件の専用回帰で復号0、dryRun/無変更の無書込み、認証保護、Unicode上限、所有項目の網羅、reset・競合・停止/同名提供元を確認。699入力と参照するWebApplet/WallpaperSlideshow manifestの前後SHAが一致した。
- 隔離sourceと最終固定EXEの実MCP/GUIは各**11群**、固定EXE smokeも成功。AI/TTSのMCP更新と既存UI編集の相互反映、ローカルで暗号化したfixtureキーのbytes保持と外部の接続先/認証変更拒否、通知の上書き解除と音声継承を確認した。キーの登録は隔離UIからだけ行い、実利用の認証・設定は変更しない。既存の一覧・動的候補・秘密除外・許可取消とtools/list不変も確認した。
- 設定キー/保存ファイルの追加・削除と既存公開APIの破壊を含まない追加adapterにつき**0.88.7**へパッチ更新。publish.bat終了0で.NET各Host/Updaterも発行。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170690725 bytes / SHA256 `c93e295463c0f60d2ff0946fd8c641264c267b16acbed4656a128c08da569ca4`**。Windows File/ProductVersion、feedの版・size/hash、ASARのpackage/同梱Default Shell、隔離コピーを照合した。
- 正本は[設定API](docs/settings-api.md)、[AI](docs/ai.md)、[TTS](docs/tts-design.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。実AI/TTSサーバーへの接続・生成・音声再生、実アカウント、物理入力/OS効果は今回の検証対象外。main逆統合・push・Release・実利用先deployなし。
- 証跡は`.artifacts/mcp-settings-services-20261025/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-services-20261025/`。source=`mcp-settings-foundation-source-1792928814460`、固定EXE=`mcp-settings-foundation-portable-1792929245003`、smoke=`smoke-1792929263669`。後続変更は関連文書と本記録だけ。試験プロセスの終了を確認し、成功/失敗診断と過去の再利用証跡を保持、削除0件。

## 2026-10-25: MCPの宣言型一覧と動的候補 0.88.6

- main `cc0a1fe`を取り込んだ`f1d3334`から、専用worktree `AppDock.at365-mcp-settings-design`の次の実装単位を完成。既存の固定6入口の外側Schemaを増やさず、宣言型object-listの探索・Schema・公開列・行参照とadd/update/remove/reorderへ対応した。動的selectは既存runtime候補、Web名簿の選択は所有元だけの既存parserによる読取りへ接続した。
- itemRefを主体・target・Schema・値のrevision・行ID/位置へ束縛。同名行とIDなし一覧、保存後/再起動後/他主体の古い参照、全件並べ替え、重複操作と構造操作の混在、応答上限前の保存拒否を確認。ID列は読取り専用で新規行だけUUID生成し、IDなし一覧へ保存IDを追加しない。指定列だけを既存行へマージし、非公開/未知列、未編集の入れ子・別名・旧数値selectとJSON文字列の無変更時表現を保持する。
- 親の非公開指定、秘密/localOnly、未対応列と重なるpropertyPath/aliases、IDの別名経由の書換えを除外。保護値を持つ行の削除はLOCAL_ACTION_REQUIRED。汎用の一覧reset/全体置換と画像参照編集は公開しない。既存のread + write、暗号化情報保護、再送と旧API/他Appletの契約を維持した。
- 発行前レビューで、Web行の検証がRemotePageServiceの生成とsession整理を起こす経路を読取り専用へ修正し、既存serviceの処理中ガードは保持。候補取得・検証前後の名簿/セッションファイル不変を確認した。旧JSON文字列の無変更時再出力、非公開保存パスとIDの重なりも修正・検証した。0.88.5発行後の追加確認で、同名ルート動的設定の候補が固定の一覧列へ混ざる問題を再現。dynamic宣言だけがruntime候補を使うよう修正し、0.88.6へ進めて全関連検証を再実行した。未解決指摘なし。
- 最終版の固定依存install・型検査・本体/Default Shell build・関連標準回帰**37ファイル354/354件、fail/skip 0**が成功。WebApplet/WallpaperSlideshowの参照manifestは前後SHA一致、製品・試験・依存/ビルドの696入力も前後一致。標準回帰全体は未実行。初期の未宣言キーのエラー期待値とGUI fixtureの最低ホスト版不足は試験を修正し、失敗記録を保持して再実行した。
- 隔離sourceと最終固定EXEの専用GUI/MCPは各**8群**成功。実SDKで接続後に一覧・提供元・通常設定を追加してもtools/list不変のまま探索・保存でき、実Node Appletの候補も取得・変更できた。実アプリで一覧の追加・部分編集・削除・並べ替え、MCP編集と既存ダイアログ編集の相互反映、未知値/秘密の保持、許可取消・再送拒否を確認。通常のPC専用設定に加え、宣言型ページ一覧のenabledだけを変えても共有ファイルが不変であることを単体試験で確認した。最終固定EXEのsmokeも成功。
- 設定キー/保存ファイルの増減や既存APIの破壊を含まない追加機能。mainの0.88.4から0.88.5を発行後に追加修正したため、最終版は**0.88.6**。publish.bat終了0、.NET各Host/Updaterも発行。本体EXEは`A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170682302 bytes / SHA256 `2a07d82687fe4b25ba095c9c027f23c117b327bbb9439604899b0846a8442add`**。EXEのFile/ProductVersion、feedの版・size/hash、ASAR内package/同梱Default Shell版、各隔離コピーのhashを照合した。
- 正本は[設定API](docs/settings-api.md)と[拡張設計](docs/mcp-settings-design.md)。通知・起動・AI/TTS等の専用adapter、画像参照とアカウントの寿命操作は次段階。実利用の設定・鍵・Cookie・外部接続・物理入力・実機効果は試験対象外。mainへの逆統合・push・Release・実利用先deployは行わない。
- 完全ログ・レビュー・入力/成果物・環境と失敗記録は`.artifacts/mcp-settings-lists-20261025/`、stage/commit照合は`.artifacts/commit-validation-mcp-settings-lists-20261025/`。最終source=`mcp-settings-foundation-source-1792922979730`、固定EXE=`mcp-settings-foundation-portable-1792923230222`、smoke=`smoke-1792923246981`。後続変更は関連文書だけ。試験プロセス終了を確認し、今回成功と失敗診断・過去の再利用証跡を保持、削除0件。

## 2026-10-25: MCP設定worktreeへmainの最新を統合

- 利用者の指定に従い、cleanな`codex/mcp-settings-design`の`bc9d404`へorigin/main `cc0a1fe`を通常merge。fetch後のlocal mainとorigin/mainは一致し、main checkoutもclean。版は新しい0.88.4を採用し、検証記録は両方を保持。コードの自動統合箇所と関連定義を確認した。
- 固定lockfileのinstall、型検査、本体/Default Shell build、設定MCP/API/保存/カタログとジェスチャー・待機表示・翻訳の関連12ファイル**140/140件、fail/skip 0**が成功。690入力hashの前後一致を確認。証跡は`.artifacts/mcp-settings-lists-20261025/`のmerge-start/merge、inputs-merge-before/after、各完全ログとmerge-commit。以降の一覧実装前の統合確認であり、この時点の新規発行・main変更・pushは行わない。

## 2026-10-26: 一時リボングループ0.90.2のコミット・プッシュ検証

- main `6a3536c` 上の承認済み35ファイルを対象に、実装時の最終入力779件・証跡のSHA256を照合した。GitHub/AQUAの両mainは親の `cc0a1fe` で競合なし。dirtyのためpull/stashは行わずfetchのみ実施。今回のcommitと、先行する未pushの `6a3536c` を通常pushする。製品の追加変更・版更新・再発行は行わず、確認済み0.90.2を維持する。
- 標準116ファイルは、統合時11ファイル89件（backend71件と、最終版で確認した表示関連18件）、影響のない基準版76ファイル583件の成功を、対象コード・試験・依存・環境と証跡鎖の一致で再利用。Shell領域一覧/設定カタログ/提供元解決の影響先、manifest/API/設定/モーダルの読取り、最終生成物を使う6試験を含む未確認29ファイルを追加実行し、224/224件成功。合計 **116ファイル・896/896件、fail/skip 0**。基準版895件からは、退役した一時Shell指定/view/要件と旧描画契約のfallbackを確認する1件だけ増えている。再利用・追加実行の一覧と依存関係の判断は `plan.json` に記録した。
- LUNA/Windows x64/Node24.22.1/pnpm12.10.1・lockfile/toolchainの一致を確認。0.90.0以降の製品差分は一時グループPanel/CSSと版のみで、最終版の上下配置・親寸法・操作順GUI、同一Shell/既存native本文/幅遅延/パレットのGUI、型検査/build/publish/smoke成功を入力・発行物hashと合わせて再利用した。今回は成功済みGUIやbuildを繰り返していない。
- 発行EXEは **0.90.2 / 170,678,066 bytes / SHA256 `83c8c15a04c05e32b3f627dcdd5c3b3d52dfd751cc84a6b22935801bd25a6a22`** のまま。既存レビューに未解決の阻害指摘なし。最終検証後の追記は本記録だけで、stage内容と作業ファイルの一致、検証済みstage treeとcommit treeの一致を確認する。結果の正本は `.artifacts/commit-validation-ribbon-0902/` の入力一覧・完全log/終了コード・再利用照合・`validation.json` / `stage.json` / `commit.json` / `push.json`。
- 追加試験は終了済み。今回の追加GUIフォルダーと削除対象はなく、過去の再利用/診断資料を保持する。両remoteのmainとcommit SHAの一致、作業ツリーcleanまで確認して完了とする。Release・実利用deployは行わない。

## 2026-10-25: 上向きの一時グループで親ボタンを末尾へ配置 0.90.2

- 0.90.1の未コミット変更を保持し、上向きに展開する場合は子一覧を上、親ボタンを一番下に配置するよう変更。下向きは親を先頭に維持する。下に収まれば下向き、上に収まれば上向き、どちらにも収まらなければ広い側を選んでスクロールする。制約を受けないグループ内容の実高から方向/最大高/位置を計算し、親の元の位置・幅・高さを保つ。子の保存順は変えず、DOM順・読み上げ順・上下/Home/End/Tabの移動順を見た目と一致させた。
- 上向きの色バーの接続部は子一覧の下へ移し、親と子の8px間隔と左2pxバーを保持。方向と位置の確定後に表示・初期フォーカスを行い、上向きの長い一覧は末尾へスクロールして親と近い実行可能な子を見せる。下向きは先頭の実行可能な子を使う。初期フォーカス枠は引き続き隠し、キーボード操作後は表示する。設定・保存・Shell契約・コントローラー/実行経路の変更なし。通常修正として0.90.2へパッチ更新。
- 発行前レビューで配置/計測の依存、親のアンカー寸法、色線、フォーカスと操作順、スクロールと既存保存への影響を確認し阻害指摘なし。固定Node24.22.1/pnpm12.10.1、同一lockfile/供給網検査でfrozen install・整形・型検査・build成功。表示関連3ファイル18/18、fail/skip 0。ソース/最終固定EXEで上/下×compact/expanded×100/125/150%の12条件を確認し、親のy/幅/高さ、DOM順、色バー/8px接続、初期枠なし、親クリック閉鎖が一致した。追加の長い上/下一覧で、初期スクロール・近い子へのフォーカス・無効行スキップ・Home/End/上下/Tab・Escape復帰・末尾コマンド選択を確認した。
- publish成功。0.90.2のFile/ProductVersion、feed、ASAR本体/Default Shell版・契約3・旧専用view不在、Default Shell同梱内容、size/hashを照合し、最終固定EXEの隔離smoke成功。170,678,066 bytes、SHA256 `83c8c15a04c05e32b3f627dcdd5c3b3d52dfd751cc84a6b22935801bd25a6a22`。発行先 `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。入力/環境/fixture/完全ログ/レビュー/最終照合は `.artifacts/ribbon-direction-0902/`。実アカウントと物理予約キーは未確認。本件のcommit/push/Release/deployなし。
- 後片付けは削除0件。今回のGUI/smoke profileを参照するプロセス0件を通常ユーザー権限のCIMで確認。直近成功3件以内・最終証跡・過去の再利用/診断資料を保持し、削除対象はなかった。詳細は `cleanup.json`。

## 2026-10-25: 一時展開時の親ボタン寸法を固定 0.90.1

- 0.90.0の未コミット変更を保持し、一時グループを開くと親ボタンが狭く見える報告に対応。旧固定EXEでcompact/expanded・表示倍率100/125/150%を測定し、親の幅がそれぞれ4px/2px/約0.667px縮むことを再現した。高さとSVGの実寸は同じで、スクロールバーの予約幅が通常リボンの右余白と異なるため、親ボタンとアイコン/開閉記号の間隔が変わっていた。
- 一時グループの幅と親の高さを、既存の検証済みsource anchorの実寸へ合わせ、パーセントのmax-widthで縮めないようにした。ネイティブの縦スクロールバーは既存右余白内の6pxにし、安定したgutterとスクロール操作を保つ。通常リボン・アイコン部品・描画契約・設定/保存/実行経路は変更しない。通常修正として0.90.1へパッチ更新。発行前レビューで要件・既存操作・可変倍率・アンカー境界・同梱内容を確認し阻害指摘なし。
- 固定Node24.22.1/pnpm12.10.1と同一lockfile/供給網検査を維持し、frozen install・整形・型検査・build成功。表示関連3ファイル18/18、fail/skip 0。ソースと最終固定EXEでcompact/expanded×100/125/150%の6条件を比較し、親の幅/高さ・SVGの幅/高さの差はすべて0、DPRも一致。さらに一時グループの既存GUI各7群で、色バーと8px接続・初期フォーカス枠なし/キーボード枠・1項目/長い縦リスト・横はみ出しなし・親子操作/閉鎖・本文probeId・Shell統合を確認した。変更のないbackend/描画同期/パレットの成功は繰り返していない。
- publish成功。最終0.90.1のFile/ProductVersion、feed、ASAR本体/Default Shell版・契約3・旧専用view不在、Default Shell同梱内容・size/hashを照合し、隔離smoke成功。170,670,964 bytes、SHA256 `a5c02f8e95122cfa2e940135e025a6af35c04bfd426a57d15c8e8fe96db1bfe9`。発行先 `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。旧固定0.90.0のcopy/hash・比較寸法・入力/環境/fixture/ログ/レビュー/最終照合は `.artifacts/ribbon-size-0901/`。実アカウントと物理予約キーは未確認。本件のcommit/push/Release/deployなし。
- 後片付けは削除0件。今回の比較/GUI/smoke profileを参照するプロセス0件を通常ユーザー権限のCIMで確認。直近成功3件以内・旧版比較・最終証跡・過去の再利用/診断資料を保持し、削除対象はなかった。詳細は `cleanup.json`。

## 2026-10-25: 一時グループの親子表示とリボンShellへの統合 0.90.0

- 0.89.4の未コミット変更を保持し、一時表示も親ボタンの下に子を並べる構造へ変更。親と子を持続的と共通の `.ribbon-group` / `.ribbon-children` で描画し、親と子の8px間隔、左2pxのグループ色バーと接続部、アイコン位置・行高・名前・バッジを統一した。親ボタンを押すと閉じる。初期フォーカスは最初の実行可能な子へ置くが枠は表示せず、上下/Home/End/Tabで操作した時は通常のフォーカス表示を復帰する。外側クリック消費、Escape、本文のWebContents/session保持と実行時の再照合は継続。外周の影も除去した。
- 独立した `overlay.ribbon-group` Shell領域・設定欄・個別の提供元解決/再試行/visible要件/view選択を廃止し、公開領域を6件へ整理。旧指定・旧view・旧要件は不活性な互換データとして保持し、動作には使用しない。設定カタログ・翻訳・領域状態・own-stateにも専用項目は返さない。リボンの実際の接続中の提供元と同じ `ribbon` HTMLへ、既存の共通overlay APIで一時表示を渡す。独立した復旧先を持たず、失効/故障時は閉じてリボン全体の復旧を使う。表示中のribbon visible要件は有効。一時表示の内容と寿命は既存OverlayHost/RibbonGroupSessionが所有する。
- 同じHTMLで通常リボンと一時表示を扱う描画契約 `shell.ribbonSchemaVersion: 3` を導入し、Default Shellと追加Shellは同じAPI/起動経路を使用。通常のRibbonViewモデル・外部取得はschema 1/2を維持する。旧描画契約はリボン全体をDefaultへ戻し、他の領域指定を維持する。設定項目・公開領域の削除を含むため0.90.0へマイナー更新。新しい保存キー・ファイルの追加削除なし。repo AGENTSと機能文書の領域数・現行契約を整合させた。A:直下のAGENTSは変更していない。
- 発行前レビューで要件一致、設定/互換データ、同じ提供元・入口、破棄/再送防止、フォーカスと共有描画への影響を確認し阻害指摘なし。frozen install・整形・型検査・build成功。関連11ファイル89/89、fail/skip 0。退役した指定/view/要件が動作せず、旧契約2はfallbackし3は有効、他領域・設定編集は保つことを検証した。
- ソース/最終固定EXEのGUI各7群で、明1280/暗900/明720、56/200px、親の下8px・色バー接続・同じアイコン位置、初期枠なし/キーボード移動後の枠、無効行スキップと親/子の移動、1項目102pxの親子パネル・親クリック閉鎖、縦overflow、本文probeId保持、外側クリック消費・選択/resize/scroll取消を確認。追加Shellでも通常リボンと一時表示が同じHTML URL/提供元で動き、旧専用指定/viewを残しても無視されること、設定・状態が6領域で専用欄なしを確認した。ソース/最終固定EXEのnative幅遅延比較はアイコン中心28px・実幅200pxのラベル保持/56pxで非表示を確認。共通OverlayApp切り出しの影響先として最終固定EXEのコマンドパレットを1群追加し、別入口での描画・検索・Escape閉鎖を確認。既存全体GUI runnerのcontract/領域数/検索先も更新したが、本件は必要箇所に絞ったGUIを使用した。
- publish成功。0.90.0のFile/ProductVersion、feed、ASAR本体/Default Shell版・描画契約3・旧専用view不在、変更main JS/共通型とDefault Shell同梱物・size/hashを照合し、最終固定EXEの隔離smoke成功。170,681,062 bytes、SHA256 `4d23ec157581b4a84ae7b6143b3b4c581574a221528e668346fa05dda3af1719`。発行先 `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。入力・環境・fixture・完全ログ・コマンド・レビュー・最終照合は `.artifacts/ribbon-integrated-0900/`。実Gmail/Wallpaperアカウントと物理予約キーは未確認。本件のcommit/push/Release/deployなし。
- 後片付けは削除0件。今回のGUI・幅遅延比較・パレット・smoke profileを参照するプロセス0件を通常ユーザー権限のCIMで確認。直近成功3件以内・最終証跡・過去の再利用資料/診断profileを保持し、削除対象はなかった。結果は `cleanup.json`。変更した既存一時グループGUI runnerの `node --check` も成功した。

## 2026-10-25: 一時リボングループをリボン上の縦表示へ統一 0.89.4

- main `6a3536c` のclean状態から追跡先へ `pull --ff-only`（Already up to date）を確認して実装。一時グループを元のリボン領域へ同じ幅で縦に重ねる表示へ変更。ダイアログ風の外周枠・丸み・大きな影・横並び・左右スクロールボタンを除去し、細い右境界と控えめな影にした。元のグループ位置から開き、上下端に収まるよう補正する。長いリストは縦スクロールする。通常リボンと共通の `ribbon-items.css`・`RibbonIcon` を使い、24pxアイコン枠・40px行・左位置・余白・名前・バッジ・画像を揃えた。表示ラベルは実際のSurface幅に対するcontainer queryで切り替える。
- 一時表示は既存の `overlay.ribbon-group` とOverlayHost/RibbonGroupSessionを継続使用し、追加のShell領域・専用APIは設けていない。個別指定がなければ解決済みのリボンShellへ継承し、当該viewが未提供/故障ならDefault Shellへ戻す。保存済みの個別指定は保持。「表示」の既存選択欄へ「リボンのShellに従う」を表示し、選択時は当該map entryだけを解除する。新しい設定項目・保存キー・ファイルの追加削除なし。hostが検証したnativeリボン矩形からhost CSS座標の任意 `content.viewport` と `displayMode` を公開モデルへ追加し、従来Shellが追加フィールドを無視できる互換性を保持した。0.89.3から通常修正の0.89.4へパッチ更新。
- 発行前レビューで操作/描画/寿命・公開境界・設定/保存・影響先を確認。コンパクト幅のスクロールバーでバッジ数字が欠ける箇所は、右余白内の固定gutterとアイコン寄りのバッジ位置で修正した。アイコン位置と通常行のpaddingは維持。継承中に設定欄がDefault表示になる問題は、上記の継承選択と即時解除で修正。修正後に阻害指摘なし。既存のGUI試験は縦配置・矩形幅・24ページの縦overflow・上下移動へ更新し、構文検査成功。旧全体GUI runnerは本件では再実行せず、変更箇所を隔離した専用GUIで確認した。
- 固定Node24.22.1/pnpm12.10.1・同一lockfile/供給網検査を維持し、frozen install・整形・型検査・build成功。最終ソースで関連10ファイル78/78、fail/skip 0。Shell継承/明示指定/未対応・無効/Default fallback・safe modeとviewport模型を検証。ソース/最終固定EXEのGUI各7群で、明1280/暗900/明720・56/200pxの幅、アイコン/行高/名前/バッジ、28項目の縦overflow、無効行のスキップ・上下/Home/End/Tab・Escape/フォーカス復帰、1項目52pxのパネル、共有設定を書かないこと、外側クリック消費・選択実行・スクロール/resize取消を確認。ローカルApplet本文のWebContents/probeIdを保持し、同じ公開APIを使う追加Shellの継承・明示override・設定UIからの解除も確認した。
- 折りたたみ回帰はnative setBoundsを遅延させる既存fixtureで確認。ソースと最終固定EXEは、model compactが先着しても実幅200pxの間はアイコン中心28pxとラベルを保持し、実幅56pxでのみラベルを隠す。バッジ位置のみの最終CSS変更はこの同期経路を変えず、最後の固定EXEでも再確認した。失敗した検証fixtureの即時close判定はIPC閉鎖待ちへ修正し、複製Shellのmanifestに最低ホスト版を明記。失敗ログ/診断profileを保持し、最終成功と区別した。
- publish成功。最終EXEのFile/ProductVersion・feed・ASAR本体/Default Shell版・変更したmain JSとDefault Shell同梱内容・size/SHA256を照合し、最終固定EXEの隔離smoke成功。0.89.4、170,688,474 bytes、SHA256 `be6d79806f01492af4295a6c9b00a0af3f9ad660233ab83c254b3915f0f944d0`。発行先は `A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。入力/環境/fixture/コマンド/ログ/レビュー/ASAR比較/最終結果は `.artifacts/ribbon-temporary-0894/`。実Gmail/Wallpaperアカウント・物理予約キー・実利用先deployは未確認。本件のcommit/push/Releaseなし。
- 後片付けは削除0件。今回のsource/fixed GUI・遅延比較・smoke profileを参照するプロセス0件を通常ユーザー権限のCIMで確認した。直近3回の成功・現在の最終証跡・既存commitの再利用資料・失敗診断profileは保持し、削除対象はなかった。詳細は `cleanup.json`。

## 2026-10-25: リボン変更のコミット前確認・対象ページ候補の修正 0.89.3

- 確認済み0.89.2までの24ファイルをコミットするため、777入力・過去の標準892件・0.89.1関連68件・0.89.2関連18件とGUI/固定EXE証跡をhash照合。既存115試験ファイルは基準版と一致し、表示モードの新規試験3件を含む標準対象は116ファイル895件。依存先を追跡した追加78ファイル691件で690成功・1失敗となり、失敗コマンドの部分成功は再利用しない。証跡: `.artifacts/commit-validation-ribbon-0892/`。
- 失敗は入力条件の対象ページ候補に「表示モードの切り替え」が混入するもの。`hostShortcutPage`でthemeと同様に非ページの表示モード項目を除外し、既存の4ページ候補検査と無効対象検査へ接続。既存設定・保存ファイル・公開APIの追加削除なし。直前発行0.89.2から通常修正の0.89.3へパッチ更新した。
- 固定Node24.22.1/pnpm12.10.1、同一lockfile/供給網検査を維持。frozen install、整形、型検査、開発build成功。発行物依存の6ファイル53件を除く追加72ファイル638件を修正後に実行し、638成功・fail/skip 0。発行前ソースレビューで阻害指摘なし。入力/環境/コマンド/完全ログは `.artifacts/commit-validation-ribbon-0893/`。
- 自動承認レビューがローカルpublishを「配布EXE・更新情報の変更はコミットのみの依頼範囲を超える」として拒否した後、利用者からローカル発行・確認・コミットの明示許可を受けて実施。publish成功、最終0.89.3のFile/ProductVersion・feed・ASAR本体/Default Shell版と修正JS同梱・size/hashを照合。EXEは170,683,217 bytes、SHA256 ed383adf8840a9746d107bde575542f4bc0ca0f18bd02a362247e2ccc162667f。発行物依存6ファイル53件・最終固定EXEの明暗/3幅リボン整列GUI 2群・smoke成功。
- 0.89.1関連9ファイル68件と影響のない基準29ファイル136件を再利用し、修正後の638件・発行後の53件と合わせて標準116ファイル895/895、fail/skip 0を確認。0.89.2の折りたたみ遅延比較と0.89.1の再起動復元/native本文追従は対象コード不変を照合して再利用。確認済みのリボンの見た目は変更していない。検証後は文書追記のみ。stage/作業ファイルとcommit treeの一致は `.artifacts/commit-validation-ribbon-0893/stage.json`・`commit.json` に記録する。push/Release/deployなし。
- テスト出力は再利用証跡・直近成功・失敗/状態不明の保護対象として保持し、削除0件。今回のGUI/smoke profileを参照するプロセスは0件。CIMの制限環境でのアクセス拒否は同一読取を通常ユーザー権限で再確認して解消した。結果は `cleanup.json`。
- 一時グループは現状Default Shellの独立領域 `overlay.ribbon-group` に横並びで描画している。リボンと同じShellでの縦並び・リボン上への重ね表示は構造調査までで、製品コードへ未実装。

## 2026-10-25: リボンアイコンの横位置固定と折りたたみ描画の同期 0.89.2

- 0.89.1の未コミット変更を保持し、グループ子のインデントとレイアウト上の左borderを除去。グループ色の縦線は既存疑似要素の絶対配置left 0へ揃え、線がボタン幅/位置へ影響しないようにした。親の左右非対称paddingとcompact時の中央寄せも廃止し、親・子・通常項目を両モード共通の左paddingで固定した。グループ開閉とモード展開/折りたたみで横位置を変えない。
- 「文字が先に消え、広い領域の中央へアイコンが寄ってから幅が縮む」という報告に対応。Default Shell本体のラベルはDOMへ保持し、モードmodelのiconOnlyで先に取り除く代わりに、実際のnativeリボン幅に対するmedia queryで表示を切り替える。Native setBoundsだけを遅らせる隔離fixtureで旧固定0.89.1（SHA 4479fb79cb19399228b3bccf237088f712e7dfbd800fa4c9393e4e2327fbbb27）のアイコン移動/文字の先行非表示を再現。新ソース/最終固定EXEでは、折りたたみmodelが先着しても実幅200pxの間はアイコン中心28pxとラベル表示を保持し、実幅56pxになったときだけ文字が消えることを確認した。popupのラベル表示は従来どおりmodelのiconOnlyを使う。
- 表示方法のみの通常修正として0.89.2へパッチ更新。設定・保存ファイル・API・モード保存/項目編集・Applet本文の配置経路の追加変更なし。発行前レビューで固定位置、色線、文字とnative幅の同期、popup/アクセシブル名、レスポンシブと既存チェックを確認し阻害指摘なし。既存GUIの線色検査はborderから疑似要素へ、ラベル検査はDOM件数から可視状態へ変更し、廃止済み個別checkboxの期待も更新した。更新スクリプト2本はnode --checkで構文確認、古いGUIスクリプト全体は未再実行。
- 固定lockfile照合・整形・型検査・build・publish成功。appearance/localization/shell-boundariesの**3ファイル・18/18件、fail/skip 0**が成功。今回の親/子/通常アイコン計測GUIはソース/最終固定EXE各**2群成功**。明1280/暗900/明720で、compact/expandedと開閉前後の中心座標が一致し、色線・バッジ・幅56/200px・横はみ出しなしを確認し目視。遅延native幅の過渡状態検査は旧EXE/新source/新固定EXEそれぞれ成功（旧版は不具合の再現を成功条件とした診断）。恒久的な見た目比較試験は新設していない。前回の項目編集・状態保存・native本文追従は対象処理が同じため再実行していない。
- 最終EXEは**170,670,439 bytes / SHA256 b5a4f6af51dea10f3bde49673867e15a176d46edb947c2d394e9144261990d79**、A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exeへ0.89.2を発行。File/ProductVersion、feed版/size/hash、ASAR内package/Default Shell版、固定GUI/過渡検査/smokeコピーを照合しsmoke成功。source=ribbon-alignment-ui-1792929552006、fixed=ribbon-alignment-ui-1792929974780、旧過渡比較=ribbon-transition-ui-1792929464363、新固定過渡=ribbon-transition-ui-1792929991198、smoke=smoke-1792930005050。
- 証跡は .artifacts/ribbon-alignment-0892/ の完全log・入力SHA/環境・レビュー・fixture/計測JSON/画像・最終照合。検証後の変更は本記録のみ。今回成功のsource/portable各方式は3回以内で削除0件、旧EXE比較・失敗診断・前回機能の再利用証跡を保護。通常終了、外部Shell/実サービス、実利用データ、物理入力は新規検証していない。commit/push/Release/deployなし。

## 2026-10-25: リボン上端整理・切替項目編集・Applet本文の追従 0.89.1

- 未コミット0.89.0を保持し、リボン上端の装飾ロゴ/専用余白を除去、両モードの先頭項目を通常余白6pxから配置した。切替ボタンを安定ID ribbon-display-modeの通常builtin項目へ統合し、既定は下寄せ。リボン編集の共通操作で名前/画像・上寄せ/下寄せ・順序・表示/非表示・グループ配置を保存できる。未指定名はモード別の操作名、指定名は両モードに共用。独立した固定ボタンを重ねず、共通アイコンの左右chevronを表示する。既存itemOverrides/order/hidden/groupsだけを使用し、新しい設定キー/保存ファイルなしの通常追加修正として0.89.1へパッチ更新。
- GmailとWallpaperSlideshowの履歴で切替が正しく動かないとの報告を受け、共通Applet native Surfaceの配置経路を修正。ホストのShell/本文viewport用useLayoutEffectをモード変更にも接続し、ResizeObserverによる描画フレーム通知を待たず予約幅と本文の位置/幅を送る。ページ/Viewは再生成しない。ホストDOMのgetBoundingClientRectを読まないnative境界計測fixtureで、本文選択後のホストResizeObserver通知を抑制。旧固定0.89.0（SHA c989339af36644838d4ae7f9231e76197797e344a0cb5e9cb44b4c2210ea8591）ではexpanded時の本文との不整合を確認し、修正ソース/最終固定EXEではexpanded/compact/expandedすべてでShellと本文の境界・残幅が一致した。実Gmailのアカウント/通信と本番壁紙履歴は開かず、両者共通のnative表示経路の回帰として確認した。
- displayModeToggleは表示中の切替項目に対する互換metadataへ整理。通常項目としての実候補/hidden検査を使い、外部/旧schema 1にはactionIdを返さず無効化する。ローカルpopupに実際に配置された項目は、そのグループ候補の検査後に選択できる。既存の重複排除/epoch/PC専用モード保存と編集競合検査を維持。発行前に配置の既定値/明示override、ラベル、公開権限、ページ寿命、描画通知依存と狭幅をレビューし、未解決の阻害指摘なし。
- 固定lockfile照合・整形・型検査・build・publish成功。ribbon-display-mode/ribbon-groups/ribbon-customization/ribbon-commands/ui-presentation/applet-pages/appearance/localization/shell-boundariesの**9ファイル・68/68件、fail/skip 0**成功。追加unitは名前/上配置/非表示/グループ/外部非公開/正しいactionと非遷移を検証。fixtureは同期拒否の待機、モデル配信待ち、閉じたoverlayの正常破棄に合わせて修正し、全該当試験を再実行。恒久的な見た目比較試験は追加していない。
- ソース/最終固定EXEの隔離GUIは各**3群成功**、同一profileの再起動は各**2群成功**。明1280/暗900/明720で上端6px/ロゴなし・56/200px幅・名前/バッジ・ページ保持を計測/目視。切替項目の名前保存、上/下/一時グループへの移動、表示/非表示、popup選択、Enter/Space、再起動後の編集名/配置/モードを確認。native境界試験はソース/固定とも成功。source=ribbon-top-ui-1792928444192、fixed=ribbon-top-ui-1792928765338、native=ribbon-native-ui-1792928843975、比較旧EXE=ribbon-native-ui-1792928501737、smoke=smoke-1792928859332。
- 最終EXEは**170,673,511 bytes / SHA256 4479fb79cb19399228b3bccf237088f712e7dfbd800fa4c9393e4e2327fbbb27**、A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exeへ0.89.1を発行。File/ProductVersion、feed版/size/hash、ASAR内package/Default Shell版、GUI/native/smokeコピーを照合しsmoke成功。完全log/入力SHA/環境/レビュー/画像とnative計測/最終照合は .artifacts/ribbon-top-0891/。試験後は本記録だけ変更。
- 最新GUI、修正前後のnative比較、失敗診断と元機能の再利用証跡を保持。最新方式の直近分と比較に必要な資料を保護し削除0件。OSキー/ジェスチャー・外部サービス・実利用設定・通常終了は新規検証していない。commit/push/Release/deployなし。

## 2026-10-25: リボンの2モード切替と項目別表示設定の整理 0.89.0

- cleanなmain cc0a1feでpull --ff-only後、リボン下部の共通chevronボタンで「アイコンのみ」compact 56px／「アイコン＋名前」expanded 200pxを切り替える機能を実装。既定はcompact。展開時の名前は右側の1行・省略表示とし、tooltip/アクセシブル名を維持。グループのインデント・色の縦線・バッジと上下配置を保持し、本文とリボンの予約幅を共通ribbonDisplayWidth/既存viewport経路で連動させた。狭幅に残っていた68pxの固定ルールも共通変数へ修正した。上端の装飾アイコンは今回の変更対象に含めていない。
- 各項目/グループ/コマンドボタンの編集から「アイコンのみを表示」を除去。モードで全項目を統一し、旧iconOnlyやApplet提供値・表示名・配置・画像・コマンドIDは破棄/移行しない。描画モデルのiconOnlyは全体モードから導出し、グループ名空欄は既存の「グループ」を表示する。旧値のparse/外部編集契約は受理を継続。個別設定UIの廃止と全体モード追加のため0.88.4からマイナー更新。設定schema/保存ファイルの追加削除はない。
- RibbonStateが既存PC専用ribbon-state.jsonへdisplayModeとexpandedを一緒に原子的に保存する。旧ファイルはcompact扱い、書込み失敗時は公開状態・幅を保つ。schema 2へ任意のdisplayMode/displayModeToggleを追加し、Default Shellも追加Shellも共通UiPresentation.invoke経路を使用。操作はローカルリボン限定で、外部execute callbackとグループpopupからの切替を拒否、schema 1と外部モデルへ切替actionを公開しない。既存のepoch/session/requestId重複排除を維持。safe-shell中はcompact固定・切替無効。共有settings revisionと保存中入力を変更しない。
- 発行前レビューで、状態の正本/保存失敗、公開契約/権限境界、旧指定とグループ・画像・バッジ、全レスポンシブ規則、フォーカスとページ寿命を確認。狭幅の固定値を修正し再検証、mode矢印を共通Iconへ揃えて再検証。未解決の阻害指摘なし。固定lockfile照合・整形・型検査・build・publish成功。ribbon-display-mode/ribbon-groups/ribbon-customization/ribbon-commands/ui-presentation/shell-region/shell-boundaries/appearance/localizationの**9ファイル・77/77件、fail/skip 0**成功。新規2件は旧state/再起動/原子的な失敗、グループ状態の併存、全体投影、設定不変、操作ID、重複排除、外部/overlay拒否を検証。恒久的な見た目比較試験は新設していない。既存customization GUIの廃止checkbox期待を除去した。
- ソース/最終固定EXEの隔離GUI各**2群成功**、各同一profileの新規プロセス再起動も**1群成功**、pageerrorなし。明1280/暗900/明720で56/200pxの本体/Shell幅・名前/省略・バッジ・32px以上の操作対象・横はみ出しなしを計測/目視。持続グループの開閉・子ページ選択、一時popupとEscape、3種の編集画面で旧checkboxなし/取消、settings.ribbon不変、Enter/Spaceとfocus維持を確認。ローカルNode Appletの実WebContentsとprobeIdがモード切替後も同じであること、再起動後の200px復元を確認した。閉じるとWebContentsが破棄されるoverlayの待機は、本体overlay状態に合わせてfixtureを修正した。
- 最終EXEは**170,676,521 bytes / SHA256 c989339af36644838d4ae7f9231e76197797e344a0cb5e9cb44b4c2210ea8591**、A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exeへ0.89.0を発行。File/ProductVersion、feed版/size/hash、ASAR内package/Default Shell版、固定GUI/smokeコピーを照合しsmoke成功。source=ribbon-modes-ui-1792922032291、portable=ribbon-modes-ui-1792922238397、smoke=smoke-1792922303022。完全log・入力SHA/環境・レビュー・fixtureと画像/計測・最終照合は .artifacts/ribbon-modes-0890/。最終検証後の変更は本記録のみ。
- 完了時に方式別の今回成功を確認し、source成功2件/portable成功1件とstate試験の直近分は3回以内で削除0。失敗診断・固定helper・参照証跡も保持。外部Shell実装/実サービス、実利用データ、物理入力と通常終了は未検証。キー割り当てとジェスチャーは無効、外部ネットワークへ接続しないfixtureを使用した。commit/push/Release/deployなし。

## 2026-10-25: デスクトップ前面化修正0.88.4のコミット検証

- main `85cc8c3` 上の8ファイルを実装時の最終入力一覧と照合し、無関係な差分・stageなしを確認。dirtyのためpull/stashは行わずfetchだけ実施し、GitHub/AQUAの両mainが `85cc8c3` に一致することとGit名義を確認した。製品修正は追加せず **0.88.4** と発行物を維持し、再発行なし。
- 全115個のNode試験、main/shared/renderer/SDK/Runtime・依存/固定ツール/ビルド定義を前回892件の封印入力と照合した。差分はnative GestureTargetの前面化、実入力fixture/GUI runner、packageの版、文書だけ。現在の関連7ファイル **93件**と、影響のない前回102ファイル **746件**の成功を証跡鎖と入力hashで再利用した。最終native/updater生成物を使うall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesの6ファイル **53/53件**を追加実行し、標準 **115ファイル・892/892、fail/skip 0** を確認。Node 24.22.1/pnpm 12.10.1/.NET SDK 10.0.402/Runtime 10.0.13とLUNA/OS/lockfile/toolchainの一致も確認した。
- 変更部分と影響先をレビューし、対象限定・取消・前面確認・入力キューの解放、4検査の保持とメニュー後片付け、専用GUIのデスクトップ/通常操作に阻害指摘なし。実装時の **230/230実入力**、通知13項目・模擬キー状態10項目、型検査/build/publish、固定EXE GUI44コマンドとソース限定12コマンドを、ソース・スクリプト・EXE/コピー/DLL hashの一致で再利用した。今回は物理入力やGUIを再実行していない。
- 発行EXEは **0.88.4 / 170,673,988 bytes / SHA256 aa50211de386070f24e7becddd999385baa1607b4405eb44c9c44d195cf7d70c** のまま。証跡は `.artifacts/commit-validation-desktop-0884/` のplan/入力一覧・再利用照合、53件完全log/終了コード、環境、stage/commit tree・両remote照合。既存資料を保護し、追加GUIフォルダーと削除対象なし。stage内容と作業ファイルの一致、commit treeと検証済みstage treeの一致を確認してcommit/pushする。結果の正本は同フォルダーの `commit.json` / `push.json`。Release/実利用deployは行わない。

## 2026-10-25: デスクトップ実入力4失敗の調査・修正 0.88.4

- main `85cc8c3` / cleanを確認してpull --ff-only成功（更新なし）。前項までのデスクトップ4失敗を調査した。製品ソースを変更せずInputHostとfixtureの隔離コピーへ診断出力を追加し、入力先・前面対象・選択候補・前面化結果・取消を追跡した。最初のdesktop条件ではProgman/Explorerを正しく選び、候補22件と修飾キー抑止なしを確認したが、通常と入力キュー接続後のSetForegroundWindowがともにfalseで開始を取り消していた。その右クリック復元でExplorerの `#32768` メニューが開き、次のexe条件はデスクトップではなくメニュー上で実行されていた。
- `GestureTarget.TryActivate` の既存worker内の補助経路へBringWindowToTopを追加し、表示順とアクティブ状態を更新してから前面化を要求する。開始時の対象/source・取消・可視性の検査、実前面対象の待機、入力キューの必ずの解除を維持し、フック内の待機・新たなキー送信・常時最前面化は追加しない。本体を開く既存の前面化経路と同じ活性化手順へ揃えた。仕様参照はMicrosoftの[BringWindowToTop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-bringwindowtotop)と[GetGUIThreadInfo](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getguithreadinfo)。設定・保存ファイル・公開API・SDK/Runtime契約は不変で、通常修正の **0.88.4** へパッチ更新。
- テストは4項目とも維持した。各ケースの前後でGetGUIThreadInfoからデスクトップ所有のメニューだけを閉じ、操作開始点がデスクトップであることを2項目追加。座標の位置でメニューを探す中間版ではメニューを見落とし、旧0.88.3の実入力で225成功/5失敗（追加した開始点検査を含む）だった。最終版はメニュー所有元で判定する。試験用Windowを前面化できない場合のGUI状態診断も追加した。
- 修正版InputHostで実入力 **230/230成功・失敗0**。従来の224成功とデスクトップ4項目、追加した開始点2項目がすべて成功した。1/2段階・取消・first/all/順序/重複除去・クリック/ホイール/キー・通常入力復元・除外・フォーカス変更・前面移動の既存検査を含む。記録は `fixed-full-input-complete.log`。型検査/build/native/helper build成功、関連Node7ファイル **93/93、fail/skip 0**、表示通知13項目と模擬キー状態10項目も成功。Pause/F13〜F24はOSへ送信・登録していない。全標準回帰は今回再実行していない。
- 実JS表示の試験へdesktop条件/explorer.exe条件を追加。非アクティブなデスクトップからの開始、1→2方向と候補更新、ウィンドウ中央指定での開始モニター中央への配置、元Windowが覆われないこと、解除時の保存順と表示終了を検査する。`--desktop-only` で2条件へ限定可能。通常4種類×明暗と合わせて10組40コマンド、描画終了後4コマンドの合計44件がソース/固定EXEで成功。限定モード12コマンドも成功。初回のfixtureはdesktop条件へprocessesを指定してschemaに拒否され、限定モードの後半はexe条件を残して失敗したため、既存schemaに合わせ、描画終了検査前にglobalへ戻して修正した。
- 途中の再試験は入力開始前のfixture前面化で停止した。前面Window=NULLを読み取り、入力desktopはDefault/対話セッションActiveであることを確認。画面確認ツールは環境エラーで起動不可だった。試行したcaptionクリックによる回避は撤回し、利用者がデスクトップをクリックした後、同じ前面化処理のまま限定GUIと発行EXE GUIが成功した。これらの開始前停止は製品テストの成功件数へ含めず、失敗log/profileを保持する。
- 発行前レビューで対象限定・取消・前面確認・入力キュー解放・既存UI/APIの維持を確認し、阻害指摘なし。`publish.bat` 終了0。発行EXEは **A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe / 0.88.4 / 170,673,988 bytes / SHA256 aa50211de386070f24e7becddd999385baa1607b4405eb44c9c44d195cf7d70c**。File/ProductVersion、update.jsonのsize/hash/版、ASARのpackage/Default Shell/全rendererと待機表示main/preload、同梱InputHostと開発用DLL、固定GUIコピーを照合した。InputHostは `a5cb18cd46541089dc453dacadd6b288affa708feed4105521eee74e583903ff`、ASARは `b0f96879cdc8779c847bea0336c112769baf0a7e86b162f6e0450924e22dbed9`。配布DLLの通知13項目も成功した。
- 最終固定EXE profileは `.artifacts/gesture-web-ui-1792920245161/`、ソース通常は `gesture-web-ui-1792918987645/`、限定は `gesture-web-ui-1792919962948/`。Explorerの候補4行と方向表示を目視した。証跡は `.artifacts/desktop-gesture-diagnosis/` の診断ソース/差分・比較/回帰/GUI/publish log、review、入力一覧・発行物/コピーhash・validation。診断プロセス終了を確認し、不要な自己完結runtime・bin/obj等6フォルダーを削除。診断DLLのhashと小さなDLLコピー、診断ソース、失敗資料、旧再利用証跡を保持し、今回の成功GUIは通常/限定/固定各1回で削除対象なし。混在DPI・UAC/ロック画面・性能は今回未検証。今回は未コミット、push/Release/実利用deployなし。

## 2026-10-25: JS待機表示の採用・ネイティブ画面の撤去 0.88.3

- 利用者が0.88.2の見た目と動作を確認し、JS方式の採用、不要なネイティブ画面の整理、commit/pushを依頼した。main `c7f51db` 上のJS試作を引き継ぎ、dirtyのためpull/stashなし。fetchと両push先の読み取りでGitHub/AQUAのmainが `26fdf3e` に一致すること、実効Git名義を確認した。今回のpushには前回の待機表示コミット `c7f51db` も含む。
- InputHostのGestureIndicator.xaml/コードビハインド/GestureIndicatorContentとGestureDisplay、WPF専用試験プロジェクトを削除した。GestureIndicatorNotificationsだけで表示モデルを通知し、ネイティブ画面の作成・初期化・配色値・Web/WPF切替を持たない。入力用Dispatcherと.NET/WPFランタイム依存は引き続き必要。プレビューと実表示は共通React/CSS、既存の4種類・サイズ固定・表示候補の選択は維持する。設定/保存ファイル/公開API・SDK/Runtime契約の追加削除はなく、通常修正のため **0.88.3** へパッチ更新。
- 起動失敗/描画プロセス終了時は表示を破棄し、共通ErrorReporterで `GESTURE_INDICATOR_UNAVAILABLE` と再起動案内を一度報告する。ネイティブ表示へ切り替える処理は撤去し、表示の寿命やテーマ変更で入力構成を再同期しない。描画障害後も入力認識とコマンド実行は続ける。発行前レビューでIPC送信元/main frame/URL、revision/sequenceと寸法境界、終了/接続断、表示通知専用キュー、入力フック/条件/実行順の保持を確認し、阻害指摘なし。
- 整形・最終型検査・本体/Default Shell/native/helper build・publish成功。最初のpnpm実行は版更新後の依存再照合要求で停止し、固定lockfileのinstallで解消（依存変更なし）。旧配色同期を期待した試験1件と実入力fixtureのWPF/UI Automation探索を通知検査へ移行した。関連5ファイル **41/41**、追加80ファイル **709/709**、前回から同じ入力・到達関係・証跡鎖を確認した30ファイル **142件**を再利用し、標準 **115ファイル・892/892、fail/skip 0**。Node 24.22.1/pnpm 12.10.1/.NET SDK 10.0.402/Runtime 10.0.13、lockfile/toolchainと既存locale値不変を照合した。
- 表示通知13項目と模擬キー状態10項目が成功。配布DLLを直接読む13項目も成功し、ネイティブWindow派生型・コンパイル済みWPF画面リソースの不在、revision/負座標/方向/候補順/予約行数/非表示/終了を確認。直接InputHostを使う実入力試験は表示通知へ移行し、**224成功・デスクトップ4失敗**。変更前InputHostの既存ログと、方向検査12行の名称変更を正規化した全PASS/FAIL行が完全一致した。4失敗を成功へ含めず、既知の未解消事項として保持する。Pause/F13〜F24はOS送信・登録していない。
- ソースと固定EXEの実マウスGUIが成功。4種類×明暗、1→2段階、候補1→4行、スリムピルのHWND矩形一致、透明/非アクティブ/クリック透過、古い/不正な寸法IPCの拒否、解放後の非表示、32コマンドの順序を確認。描画を意図的に停止した後も4コマンドを実行し、共通エラーログが1件だけであることを確認（合計36コマンド）。固定EXE profileは `.artifacts/gesture-web-ui-1792916936732/`。設定GUIも明暗×1280/900/700px・SettingsField・非表示時の値保持・保存/再起動後の割り当て/条件/順序保持に成功し、profileは `.artifacts/gestures-ui-1792916962105/`。最終のピルとカラー絵文字/4行の収まりを目視確認した。
- 発行EXEは **A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe / 0.88.3 / 170,683,580 bytes / SHA256 41ddebd3e56d504aff1fefa5c4a560d2799c284222f3518419e2e12861effa64**。File/ProductVersion、update.jsonの版/size/hash、ASAR内package/Default Shell/JS画面・preload・共通配色、全renderer出力と新規main出力、同梱InputHostを照合。InputHost DLLは `10d3da6bcc0db3f72795a34894077dfde5f5b622d562cd11520f4c2b9f4b76f4`、ASARは `50354d370066f1b163cf99fdc1907f75be21ad6f6f4e1a02a52daf738f2528ff`。固定GUIコピーと最終EXEも一致した。
- 証跡は `.artifacts/commit-validation-js-indicator-0883/`。plan/入力一覧・照合済み再利用鎖、全試験log/終了結果、review、物理入力の変更前比較、発行物hash、stage/commit/push照合を保存する。削除済みWPF試験のbin/objを整理し、終了を確認した今回のGUIと必要な旧証跡を保持する。混在DPI移動、UAC/ロック画面、性能/追加メモリは未検証。Release/実利用deployなし。
- push成功後に今回の `AppDock.at365-gesture-indicator` worktreeと不要な専用branchを削除する。開始点と23変更ファイルが当時の封印入力に一致し、未知の変更がないことを確認済み。旧入力23ファイルと0.88.0検証資料は `retired-worktree/`（manifest付き67ファイル）へ保管した。実際の削除/残存worktree/両remote先端の結果は同証跡フォルダーの `cleanup.json` / `push.json` を正本とし、MCP設定用worktreeは保持する。

## 2026-10-25: 待機表示のJS描画試作 0.88.2

- 0.88.1までの23ファイルをmainの `c7f51db36146b1d7b8c7d174d66c41f5c6efc9f6` へコミット済み（標準888件の照合は次項）。その後、利用者の指定で同じmain上にJS描画を試作した。今回の試作は未コミットで、push・Release・実利用deployなし。新しい永続設定・保存ファイル・公開APIはなく、パッチ更新 **0.88.2**。
- 入力フック・認識・表示候補の選択・コマンド実行はInputHostの既存経路を維持。表示モデルだけを容量1の専用通知キューで本体へ送り、透明・非アクティブ・マウス透過・タスクバー非表示の専用BrowserWindowで描画する。実表示とSettingsFieldのプレビューは同じReactコンポーネント/CSSを共用し、クラシックのカラー絵文字もChromiumで揃える。スリムピルの2方向分の幅と最大候補行数の予約を維持した。
- 発行前レビューで送信元/main frame/正確なURL、revision/sequence、寸法/文字数の境界、設定変更・接続断・終了時の非表示、描画障害からのWPF切替を確認した。sandbox/contextIsolation、隔離した非永続session、navigation/新規Window/permission拒否と共通配色preloadを接続。ロードとreadyの両方を含む3秒の起動上限、テーマ背景より強い透明指定、クラシックの4行収まりを修正して再検証した。入力SDKとAppletの接続契約は変更していない。
- 最終型検査・build・開発InputHost/helper build・publishが成功。関連12ファイルのNode回帰 **126/126、fail/skip 0**、その後追加した起動失敗/停止の切替試験を含む `gesture-indicator.test.cjs` **4/4** が成功（3件は126件と重複）。WPF表示とWeb通知の試験 **428項目成功**。試験した開発InputHost DLLと最終配布物のSHA256一致を確認した。全標準回帰は今回再実行していない。
- ソースGUIと固定EXEの隔離コピーで実マウス入力試験が成功。4種類×明暗の8組で1→2段階、候補1→4行、スリムピルのHWND矩形完全一致、透明背景、NOACTIVATE/TRANSPARENT/TOOLWINDOW、前面対象の維持、右解放後の非表示、32コマンドの保存順を確認した。別送信元・不正frame・古いsequence・過大寸法のIPCを拒否。描画プロセスを意図的に停止し、WPF設定の受付完了後にも4コマンドを実行（合計36件）できた。固定EXE profileは `.artifacts/gesture-web-ui-1792914973398/`。クラシックのカラー矢印と4行の収まり、スリムピルを目視確認した。
- 固定EXEの設定GUIも成功。SettingsFieldのgroup/title、4種類・明暗×1280/900/700px、透過・非表示時の値保持、保存/再起動後の割り当て・条件・順序保持を確認。profileは `.artifacts/gestures-ui-1792915064332/`。最初の固定EXE入力試験は最後の切替後実行だけ32件のままで失敗し、診断が不足して原因の断定はできない。試験側の固定250ms待ちを設定受付完了待ちへ置き換え、診断付き再試験と最終試験は成功した。製品の待機処理は追加せず、失敗log/profileも保持している。
- 発行先 **A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe**、**0.88.2 / 170,696,911 bytes / SHA256 eb2475b6eb092b733ce21d779a3bcab763a651da18ce9a585932e08403034c45**。File/ProductVersion、update.jsonの版/size/hash、ASAR内package/Default Shell/JS画面・専用preload・共通配色、ビルド出力と同梱InputHost、両GUIコピーと最終EXEのhashを照合。InputHost DLLは `45829464ca09bb81994f0cd762c1bd83cb4eca7e156c44742337d7c1916cbfda`、ASARは `18d63e3a02fbf5f791d5bf3d98bf874e21700fb695273b451aec85198dd4e3c8`。
- 証跡は `.artifacts/web-gesture-indicator-0882/` の型検査/回帰/起動切替/native/ソース・固定GUI/publish log、`artifacts.json`、`validation.json`。今回のJS GUI成功はソース3回・固定2回、設定GUI固定1回で各方式3回以内のため削除0件。今回の隔離プロセス終了を確認し、以前の再利用資料を保持した。Pause/F13〜F24はOS送信・登録していない。入力全回帰、既知のデスクトップ4項目、混在DPI移動、UAC/ロック画面、性能/追加メモリは今回未検証。0.88.0で変更前と一致したデスクトップ4失敗を今回の成功へ含めない。

## 2026-10-25: 待機表示0.88.1のコミット前検証

- main `26fdf3e` 上の今回の23ファイルを対象に、0.88.1の実装時入力SHAと全変更を照合。Git名義を確認し、別作業の差分・stageなしを確認した。製品内容と発行物は変更せず、版更新・再発行なし。JS描画への移行はこのコミットへ含めない。
- 標準回帰114ファイル・**888件、fail/skip 0**を確認した。今回の最終入力と一致する8ファイル・121件、影響のない30ファイル・142件を前回の検証済み885件の証跡鎖から再利用。設定既定値/カタログ/ジェスチャー管理に到達する依存関係とnative/updater生成物の利用先、renderer静的検査を選び、残り76ファイル・**625/625件**を追加実行した。前回標準からの試験件数増加はジェスチャーの3件だけ。SDK/依存/固定ツール/既存locale値は不変で、旧localeへ追加したキーによる既存文言変更はない。
- Node 24.22.1、pnpm 12.10.1、.NET SDK 10.0.402、Runtime 10.0.13、LUNA/Windows10.0.26300/x64とlockfileを照合。隔離テスト用Appletをビルドして追加回帰へ使用。最終WPF421項目、固定EXEの4種類・明暗/3幅・SettingsField・保存/再起動GUI、型検査/publishはソース・スクリプト・EXE/コピーhashを照合して再利用した。既存デスクトップ実入力4項目の失敗は0.88.0と変更前で一致する制限として保持し、成功件数へ含めない。
- EXEは **0.88.1 / 170,678,087 bytes / SHA256 a66a8f60851799f6964e04f468db67a9d5596b0d6d20183d57d2cfa2f09ae4cc** のまま。証跡は `.artifacts/commit-validation-gesture-indicator-0881/` のplan/入力一覧、環境、fixture build、625件完全log、再利用照合、stage/commitのtree。検証後は本記録だけ追記し、再利用資料と失敗診断を保持。push・Release・実利用deployなし。

## 2026-10-25: スリムピルの段階移動サイズ固定・プレビュー欄整備 0.88.1

- main上の未コミット変更を保持したまま追加修正。スリムピルは2方向分の幅と固定の文字行高を確保し、開始対象の移動候補に共通のfirst/all・コマンド重複除去を適用した最大表示行数（1〜4行）を予約する。同じ操作で1方向から2方向へ移るとき、コマンド名や表示件数が変わってもHWNDの大きさと文字領域の位置を変えない。1件だけの操作を一律に4行分の高さにはしない。
- プレビューは共通SettingsFieldのgroup「待機表示」・title「プレビュー」とし、wide指定を外して他の設定項目と同じ配置へ揃えた。スリムピルの見本も2方向分の幅・固定行高へ合わせた。クラシックの絵文字はChromiumのプレビューとWPFの実表示で色が異なる原因を確認し、依頼どおり今回の見た目変更からは除外した。新規設定・保存ファイル・公開APIの変更なしのためパッチ更新 **0.88.1**。
- 変更部分と影響先をレビューし、入力フック・認識・実行予約・条件判定を変更せず、表示用の最大行数算定だけを既存の選択処理へ接続していることを確認。指摘なし。既存のmain/shared/設定schema・依存/ビルド定義を変更していないため、前回の関連Node回帰121件と入力状態10項目の成功を再利用。型検査成功、publish.bat終了0（固定lockfile、.NET/renderer/updater/単一EXE/update.json）。commit・push・Release・実利用deployなし。
- WPF試験 **421項目成功**。1〜4行の予約ごとに1方向/2方向、短い/長い/混在文字列、件数変化と再表示を組み合わせ、ネイティブのウィンドウ矩形が完全一致し、文字の原点も不変であることを確認。共通選択のfirst/allを反映する予約行数も確認した。4種類・明暗・透過・画面端・非アクティブ表示等の既存271項目も含む。開発DLLと配布フォルダーのDLLを直接読み込む試験でそれぞれ成功。実測3840×2160/144 DPI。
- 発行EXEの隔離GUI試験成功。SettingsFieldのgroup/titleと標準配置、4種類の選択・透過・表示なしの保持、明暗×1280/900/700px、保存・プロセス再起動・エラーログなしを確認した。profileは `.artifacts/gestures-ui-1792911548688/`。Light/1280pxとDark/700pxの描画を目視確認し、欄の対応と枠内への収まりを確認した。
- 発行先 **A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe**、**0.88.1 / 170,678,087 bytes / SHA256 a66a8f60851799f6964e04f468db67a9d5596b0d6d20183d57d2cfa2f09ae4cc**。File/ProductVersion、update.json、ASAR内package/Default Shell/ジェスチャー制御コード、extraResourcesのDefault Shell/InputHost、GUIコピーと前後のEXE hashを照合。InputHost DLL SHA256 `6a8bb704df5826d6757ac41ecfd588fa76bd356a1ac1fd646d40590789258a44`。
- 証跡は `.artifacts/pill-stable-0881/`（`delta-review.json`、`typecheck.log`、`native-display.log`、`published-native-display.log`、両native-snapshots、`publish.log`、`artifacts.json`、`fixed-exe-ui.log`、`validation.json`）。今回の成功profileは3回以内のため削除なし。実入力の全回帰・混在DPI移動・全標準回帰は今回再実行していない。前回の実入力224成功と、変更前でも同じ4項目が失敗したデスクトップ検査の制限を引き続き保持し、今回の全成功には含めない。

## 2026-10-25: 待機表示をmainへ統合して0.88.0を発行

- 最新取得後のmainはworktreeの開始点 `26fdf3e` と一致し、作業ツリーはclean。前項の検証記録にある23ファイルをmainへ反映し、`inputs.json`の全SHA256と一致することを確認した。変更はmainの未コミット差分として保持し、worktreeの元データも保持した。commit・push・GitHub Release・実利用先deployは行っていない。
- 表示変更のレビューと関連121件・模擬キー10項目の成功は、同じ開始commit・全変更ソース・lockfile/ツール定義との一致で再利用。発行前の差分確認で追加の対応指摘なし。新しい実装変更はなく、未発行だった設定追加の版 **0.88.0** をそのまま発行した。`publish.bat`は終了0。依存検証、.NET/renderer/Default Shell/updater、単一EXEとupdate.jsonの生成を含む。未変更Appletの再発行・全体ZIP作成なし。
- 発行先は **A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe**、**0.88.0 / 170,685,537 bytes / SHA256 bc5f4a2884609c3f26ee6304b3e62f61bc6dbecc9a63da12d723286900e68353**。File/ProductVersion、update.jsonの版/size/hash、ASAR内package・Default Shell、extraResourcesのDefault Shellを照合した。ASAR内のジェスチャー制御コードとビルド出力、同梱InputHostと.NET出力のSHAも一致。InputHost DLL SHA256は `483d4a82761134c632f61d7d1edc3035f837039e191696d1814e10aee8bbbd71`。
- 発行フォルダー内のInputHost DLLを直接読み込むWPF試験 **271項目成功**、描画PNG20枚。4種類・明暗・背景透過・再利用時の中央配置・画面端・長い名前/複数コマンドを確認した。試験helperへ任意のDLL指定を追加し、製品コードは変更していない。今回の実測は3840×2160、144 DPI。
- 固定EXEの隔離コピーで `APPDOCK_GESTURE_INDICATOR_ONLY=1 dev.bat exec node scripts/gestures-ui-test.cjs --portable` 成功。4種類の設定/プレビュー、明暗×3幅、表示なしの値保持、保存・プロセス再起動後の保持を確認し、前後とコピーのEXE SHA一致を確認。profileは `.artifacts/gestures-ui-1792909842119/`。固定EXE smokeも成功し、copy SHA・EXE隣のsettings/data・登録画像・Default Shell起動・トレイ操作を確認。profileは `.artifacts/smoke-1792909896264/`。
- 前回開始できなかった実入力試験を今回は実行し、**224項目成功、デスクトップの4項目失敗**。1/2段階移動・解除時実行・表示/実行の一致・取消・クリック/ホイール/キー・通常入力復元・除外・前面化等の成功を確認した。失敗はdesktop/exe条件のデスクトップでの実行とwindow-center表示。今回の変更による回帰かを判別するため、HEAD `26fdf3e` の変更前InputHostを隔離ビルドして同じ試験を実行したところ、**224成功/同じ4失敗で、全PASS/FAIL行が完全一致**した。新規失敗は確認されていないが、4項目の実機成功を主張しない。Pause/F13〜F24のOS送信・登録を伴うモードは実行していない。混在DPIの複数モニター移動と全標準回帰は今回未実行。
- 証跡は `.artifacts/publish-gesture-indicator-0880/` の `integration.json`、`publish.log`、`artifacts.json`、`validation.json`、固定EXE GUI/smoke/native/実入力と変更前比較の各log。ASAR検査の先行失敗は検査スクリプトがWindowsの区切り文字を使っていなかったためで、`path.join`で修正して照合成功。今回の各成功profileは3件以内のため削除なし。失敗診断・変更前比較資料・以前の再利用用証跡を保持。

## 2026-10-25: マウスジェスチャー待機表示の選択実装（worktree・未発行）

- 対象は `A:\30.PROJECT\AppDock.at365-gesture-indicator`、branch `codex/gesture-indicator`、開始点 `26fdf3ebcec05d015743ea5cec4a7bcf7c09e0c0`。最新origin/mainを取得して独立worktreeを作成。元checkoutの変更を移動・破棄していない。設定 `indicatorStyle` 追加のためソース上の次期版は **0.88.0**。依頼によりmainへのマージ・通常publish・commit・push・Release・実利用deployを行わず停止した。配布EXE/update.jsonは今回作成していない。
- コンパクトカード（未指定時の既定）、スリムピル、リング、クラシックの4種類を実装。新3種は共通アクセントと明暗テーマ、図形の方向表示、背景だけの透過を使用。クラシックは既存の黒パネル・絵文字・全体透過を維持。設定選択・プレビュー・検索・ページJSON・リセット・公開ジェスチャー設定APIへ接続し、位置/表示なし/不透明度/既存割り当てを保持する。複数コマンドは最大3件と残件数、長い名前は省略表示。変更対象と影響先の読み取りレビューを行い、最終差分に対応が必要なP1/P2指摘なし。
- 固定lockfileの独立node_modulesを準備（既存 `.tools` だけjunction参照）。`dev.bat run typecheck`、`dev.bat run build`、開発用 `.artifacts/dotnet-host/` の.NETビルド成功。型検査は `typecheck-final.log`、最終rendererは `build-preview-final.log`、最終InputHostは `native-build-final.log`。これらは開発用生成物で、40.ARTIFACTへの製品発行ではない。
- 関連8ファイルのNode回帰 **121/121成功**：`gestures`、`gesture-commands`、`command-execution`、`settings-page`、`settings-defaults-reset`、`settings-commands`、`localization`、`appearance`。旧設定の補完、4種類と不正値、APIのdryRun/原子的保存、表示なしの値保持、native向けスタイル/共通配色/翻訳文言の同期、コマンドタイトル無変換を含む。`regression.log`参照。後続の変更はWPF表示とrenderer見本のみで、この回帰対象のロジックは不変。
- 入力フックを登録しない `tests/GestureIndicatorTests` の実WPF試験 **271項目成功**。5120×2160、144 DPI、PerMonitorV2で、4種類×明暗、透過0.1/0.45/1、文字不透明、方向図形、複数/長い/改行入りタイトル、非アクティブ/クリック透過フラグ、画面端、再利用時の寸法と中央位置を確認。20枚の描画PNGを保存。試験で再利用時に旧高さを使う位置ずれを発見し、ContentPresenterのレイアウト完了後に寸法を読むよう修正、再検証成功。対象アプリ名を通常文字色へ変更し、明暗背景の描画を確認した。`native-display-6.log`、`native-snapshots/`参照。先行失敗logも保持。
- `APPDOCK_GESTURE_INDICATOR_ONLY=1 dev.bat exec node scripts/gestures-ui-test.cjs` の隔離開発版GUI成功。4種類のラベル/見本/保存、表示なしの保持、実設定による明暗切替、1280/900/700pxの全24組合せ、プロセス再起動後の保持、エラーログなしを確認。最終profileは `.artifacts/gestures-ui-1792909328516/`、`result.json`とPNG、`settings-indicator-ui-final-2.log`参照。狭幅の見本が縮みすぎる点とリングのラベル幅を実表示に合わせて修正後、全組合せを再実行した。元の総合UI試験は最新mainの有効化欄移動前の配置を要求する既存assertionで停止したため、元assertionを緩めず、今回の表示変更だけを検証する明示モードを追加した。
- `InputTests --gesture-key-state` はメモリ内の模擬入力 **10項目成功**（`key-state.log`）。実入力の既存InputTestsは試験Windowの前面化失敗、cleanupのSendInputはWindows error 5で停止（`input-regression.log`）。**物理入力の認識・実行回帰は今回未確認**として残す。Pause/F13〜F24のOS送信・登録を行う `--shortcuts` モードは実行していない。混在DPIの複数モニター移動、全標準回帰、固定配布EXEの検証も未実行。main統合後の発行時に現行版を再照合し、固定EXEと実入力の不足を確認する。
- 証跡の基点は `.artifacts/gesture-indicator-0880/`。`inputs.json`に今回のソース・生成物hashを記録。成功したWPF/GUIの各系列は3回以内で、失敗診断と再利用用記録は保持。隔離テスト用プロセスの残存なしを確認した。

## 2026-10-25: MCP設定の固定入口と通常設定の共通登録 0.88.1

- 専用worktree `AppDock.at365-mcp-settings-design`、branch `codex/mcp-settings-design`のcleanな`e66a2f4`から、拡張設計の第2単位を実装。追跡先がないためpull・main統合を行わず、独立node_modulesと固定lockfileを維持した。
- MCP専用の固定6入口で対象・Schema・値・固定選択候補を取得し、単純設定のset/resetを共通SettingsCommandsの検証・保存へ接続。本体の通常設定は共通登録から既定値・検証・設定カタログ・JSON投影・PC専用保存・MCP公開を生成する。既存hardwareAccelerationもnextStartとして公開する。初回の入口反映後、項目・提供元・固定候補を応答データとして追加でき、外側のツールSchemaは変更しない。
- read + writeだけで変更し、許可・公開定義・可用性を再送時にも検査。値と保存上書きに結び付く不透明revision、schemaRevision、主体と検索条件に結び付くcursor、要求/結果の上限、512件の成功/失敗の重複処理を確認。dryRun・no-op・古いrevision・未宣言/非公開/秘密の拒否、原子的なバッチ検証を確認した。実SDKクライアントで、接続後に設定と提供元を追加してもtools/listが変わらず探索・保存できた。
- 発行前レビューで、実効値が既定値と同じ上書きの解除不足を修正。物理的な上書きの有無を確認して保存対象scopeを再出力し、表現だけの外部変更も競合検査へ含めた。既存の共有/端末別保存と非公開/未知値を保持する回帰が成功。既存エラーの検証順序、MCP専用の操作列挙とAppletの既存契約も整合させ、阻害指摘なし。
- 固定依存install、型検査、本体/Default Shell buildに成功。関連27ファイル275件に加え、兄弟manifestの前後SHA付きsettings-editing/web-apiとMCP 2.0の既存mcp-eventsを37件実行。重複11件を除き**29ファイル・301/301件、fail/skip 0**。標準回帰全体は未実行。最初の試験指定に存在しないmcp-modern.test.cjsが含まれたため、実在するmcp-eventsのtransport回帰で補完した。678入力の前後hashは一致。兄弟Appletの宣言は読取りだけで変更しない。
- 隔離sourceと固定EXEの専用GUI/MCPは各**6群**成功。探索/Schema/候補・dryRun/保存/リセット・旧APIと本体snapshotの一致・再送・秘密保護・8権限・write取消を確認。固定EXEの既存MCP接続管理GUIも**10群**、再起動後の保存とsmokeが成功。各試験コピーと発行EXEのhashを照合した。配布検査helperのShell参照先をASAR内から既存extraResourcesへ修正し、同じEXEで再検査して成功。製品の修正・再発行は不要だった。
- 設定キー・保存ファイルの増減や既存公開契約の破壊を含まない追加APIのため、0.88.0から**0.88.1**へパッチ更新。publish.bat終了0で.NET各Host/Updaterも発行。出力は `A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/AppDock.at365.exe`、**170683939 bytes / SHA256 `8851949228f68c1e5925e98c4e5bc2b347082da3b661d607494d0457f648bce4`**。EXEのFile/ProductVersion、update.jsonの版・size/hash、ASAR内packageと同梱Default Shellの版を照合。Node 24.22.1 / pnpm 12.10.1 / Electron 45.0.0 / .NET SDK 10.0.402 / Windows 10.0.26300 x64、通常ユーザー環境で検証した。
- 現行仕様は[設定API](docs/settings-api.md)、後続範囲は[拡張設計](docs/mcp-settings-design.md)。通常一覧の行操作・動的候補・専用サービスのadapterは未実装で、items.listは対応対象を公開しない。実利用設定・認証・Cookie・外部サービス・物理入力・効果確認は試験対象外。main統合・push・Release・実利用先deployなし。
- 完全ログ・レビュー・入力hash・成果物照合は`.artifacts/mcp-settings-gateway/`、コミット照合は`.artifacts/commit-validation-mcp-settings-gateway-20261025/`。source=`mcp-settings-foundation-source-1792919388415`、固定EXE=`mcp-settings-foundation-portable-1792919663285`、MCP画面=`mcp-settings-portable-1792919679470`、smoke=`smoke-1792919708977`。今回の成功profileは方式ごとの直近3回以内で削除0、失敗診断と過去の再利用証跡を保持。後続差分は本記録だけで、製品・試験入力は不変。

## 2026-10-25: MCP設定の権限・公開・秘密情報の基盤 0.88.0

- 専用worktree `AppDock.at365-mcp-settings-design`、追跡先のないbranch `codex/mcp-settings-design`のcleanな設計commit `bc4954f`から実装。既存mainや他worktreeを統合せず、[拡張設計](docs/mcp-settings-design.md)の先行基盤を対象にした。固定6入口、共通登録、通常一覧と特殊設定のadapterは後続範囲。
- 操作許可を16種類から8種類へ整理し、設定編集をread + writeへ統合。入力割当・リボン・トレイ・カスタムコマンド定義・MCP接続定義・Applet有効/無効の編集はexecuteから独立し、Applet再起動はread + executeで判定する。旧writeを保持し、旧個別ONでwriteを有効化しない。旧個別OFFによる例外は廃止。旧キーは読込互換だけを残し、ローカルの明示的な許可保存時に整理する。Applet/MCP列、元callerとの許可の積、SELF_CALL/BUSYは維持した。
- 宣言済みの対応する単純設定をMCPへ既定公開し、automation:false / secret:true / localOnly:trueを除外。他Appletへの公開はautomation:trueを維持し、生成コマンドと割当候補にも同じ公開範囲を適用した。既存の本体定義への登録が必要であり、全本体UI設定の自動登録まで対応したものではない。通常コマンドの公開と生成宣言も維持する。
- 既存MCP接続管理APIからtoken/environmentの入力・消去、環境変数名の取得、暗号化情報のある行の削除・接続先変更を拒否。壊れた秘密付き行の外部修復も拒否する。非秘密情報の編集・順序変更は暗号文を保持し、ローカルの認証編集と保存済み認証の通常利用を維持した。
- 発行前レビューで遅延評価される割当カタログのcaller範囲不足を修正し、要求ごとの文脈と関連回帰を追加。最終コードの型検査・本体/Default Shell build、関連標準回帰17ファイル175件と実行経路7ファイル99件、合計**274/274、fail/skip 0**が成功。独立node_modules・固定lockfile・供給網検査を維持した。Node 24.22.1 / pnpm 12.10.1 / Electron 45.0.0、通常ユーザー環境で実行。
- 専用GUI試験はsource・固定EXEとも4群成功。8行と独立列、write ON/execute OFFでのdryRunと保存、独立動作の拒否、明示非公開と秘密の除外、実MCPでの暗号化情報保護・暗号文保持、許可取消、tools/listの定義不変を確認。既存ローカルMCP設定GUIは固定EXEで10群、スモーク試験も成功した。古い「接続してツールを取得」ボタンを探す試験は、選択時の自動取得へ合わせて試験だけを更新し再検証した。
- 許可項目の廃止と外部API契約変更のため0.87.16から**0.88.0**へマイナー更新し、publish.batが成功。.NET Host/InputHost/ProcessHostも発行した。出力は `A:/40.ARTIFACT/AppDock.at365-mcp-settings-design/`。EXEは170681482 bytes、SHA256 `fb7ab10478aae6a9afb94f8b0b39ced92e41ea396ab5fa7ff4d00beb2821f62d`。update.jsonの版・size/hashと固定EXEの起動版を照合した。試験だけの後続変更で製品内容は変わらず、再発行・再採番なし。
- 完全ログ・673入力hash・レビュー・GUI結果は`.artifacts/mcp-settings-foundation/`と各GUI profile、コミット照合は`.artifacts/commit-validation-mcp-settings-foundation-20261025/`へ記録。最終入力差分は上記の既存GUI試験1ファイルだけで、影響するGUIを再実行し、関連標準回帰と型検査・製品buildの成功を再利用した。実利用設定・鍵・Cookie・物理入力は変更せず、実利用先deploy・main統合・push・Releaseなし。

## 2026-10-25: MCP設定拡張設計のコミット確認

- 専用worktreeの`codex/mcp-settings-design`、開始HEAD `26fdf3e`で設計関連のMarkdown 5ファイルだけを確認。公開既定、設定編集許可の統合、暗号化情報の除外、一覧の行参照、固定MCP入口、既存契約との分離をレビューし、阻害指摘なし。未コミットの設計を保持し、pull・他branchとの統合は行わない。
- 本文のローカル参照13件、入口3か所、JSON例2件、コードフェンス6個、残す許可8行、会話上の人物名・未置換記号の不在、変更対象5ファイル、`git diff --check`を確認して成功。文書だけのため製品回帰・型検査・GUI試験を対象外とし、製品版0.87.16を維持する。
- 検査結果、対象ファイルのhash、stage/worktreeの一致、Git tree、commit後のtreeとclean状態は`.artifacts/commit-validation-mcp-settings-design-20261025/`へ記録する。設計は未実装。mainへの統合・push・版更新・publish・Release・deployは行わない。

## 2026-10-25: MCP設定公開・一覧編集・権限統合の設計

- main `26fdf3ebcec05d015743ea5cec4a7bcf7c09e0c0`（0.87.16）のclean状態を確認。制限環境のDNS失敗後、同じ`git pull --ff-only`を通常ユーザー環境で実行し、Already up to dateを確認した。専用worktree `AppDock.at365-mcp-settings-design`、branch `codex/mcp-settings-design`を同じHEADから作成し、既存worktreeを保持した。
- [設計書](docs/mcp-settings-design.md)を追加し、DEVELOPMENT・設定基盤・外部操作の入口から「未実装」として参照した。通常設定のMCP既定公開、明示非公開・暗号化情報の除外、一覧の行参照と部分編集、固定6入口、既存APIとの互換性、対象別adapter、段階別の実装範囲と検証計画を記載した。
- 設定編集の許可統合を設計へ反映。16種類から8種類へ整理し、純粋な設定変更はread + write、独立した動作はexecuteと各利用許可で判定する。旧writeの保持、旧個別OFFの廃止、Applet有効/無効と再起動の分類、MCP/Applet列の独立性を明記した。
- 現コードとの設計レビューで、旧許可キーをUIラベル一覧で検証しているため単純な行削除では旧ファイル読込が失敗する点、秘密付き接続の削除・結び付け変更、IDなし一覧、公開/権限変更後の再送結果を確認し、互換読込・ローカル限定操作・revision付きitemRef・再送前の公開再検査を設計へ反映した。
- 文書検査は設計書内のローカル参照13件、入口3か所、JSON要求例2件、コードフェンス6個、残す許可8行、会話上の人物名・未置換記号の不在、`git diff --check`が成功。製品コード・依存・設定・版・配布物は変更していない。文書のみのため型検査・製品回帰・GUI/固定EXE/実MCP変更試験は行わず、実装済みとは扱わない。commit・push・publish・Release・deployなし。

## 2026-10-25: 共通テーブル整備・ヘッダー調整のコミット前検証 0.87.16

- 利用者確認済み0.87.15～0.87.16の13ファイルを対象とし、main b0f5ccc上の差分・未追跡SettingsTable・実効Git名義を確認。GitHubをfetchし、GitHub/AQUAのmainが開始HEADと一致していることを確認した。製品内容・発行物は変更せず0.87.16を維持、再発行なし。
- 標準回帰114ファイル・**885/885件、fail/skip 0**を入力SHAと証跡で照合。前回コミットの未変更対象91ファイル・692件、共通化時の17ファイル・140件を再利用（うちappearance/localization/shell-boundariesの18件は最終ヘッダー変更後の成功へ置換）。最終native/updater発行物を利用するall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesの6ファイル・53件を追加実行し成功した。試験スクリプト、main/shared/SDK/native/Shellロジック、設定schema、依存/ビルド定義は前回成功時と一致。変更したrenderer/CSSは実装時GUIと最新の静的試験で確認した。
- 0.87.15の一覧編集/取消/順序/検索/行結合等の3群GUIは、後続変更がヘッダーCSS/追加ボタンクラスのみで操作処理が不変であることを照合して再利用。0.87.16の11画面・明暗/狭幅ヘッダーGUI2群とsmokeは現在EXE・検証コピーのhash一致を確認。型検査/build/publishログ、Node/pnpm/.NET/OSと兄弟manifest/payload、各証跡hashを照合した。pnpm版ログの末尾空行差は実値12.10.1で一致確認。物理入力や外部サービスの新規検証はしていない。
- EXE **170,683,878 bytes / SHA256 be162efa2ee99f6fe57bd4f6fae11971270eb4a8dcdc89cb0e62e89fc92a4231**。証跡は .artifacts/commit-validation-shared-tables-08716/ の入力一覧/環境/再利用判定/追加53件ログ/stageとcommit tree/両remote先端照合。元資料はcommit-validation-notification-table-08714、applet-list-toolbar-08715、table-header-08716および検証済みの参照鎖。検証後は本記録だけ追記。再利用資料と今回の回帰出力を保持して削除0件。GitHub Release/実利用先deployは行わない。

## 2026-10-25: コンパクトな共通テーブルヘッダー 0.87.16

- 利用者の追記に従い、ボタン付きヘッダーの上下余白を縮めてボタンなしと高さを統一。共通SettingsTableのthead thを内容32px＋上下6pxとし、見出しの共通flexでbaselineの余白を除去した。通常の単行ヘッダーは約44px（罫線のDPI丸めを除く）、複数行は必要に応じて拡張。共通SettingsListAddButtonに専用クラスを付け、32pxの操作対象、アクセント文字、通常透明・枠なし、hover/focus時の淡い背景とキーボードoutlineを使用する。本文の追加ボタンや保存/操作処理は変更しない。
- main上の未コミット0.87.15の共通化を保持して追加修正。変更は共通CSS/追加ボタンクラス・文書・版のみ。既存の余白/hover規則との詳細度、狭幅、権限の非表示ヘッダー、focusとdisabledをレビューし阻害指摘なし。0.87.15の発行完了後の追加修正につき0.87.16へパッチ更新。設定キー/保存ファイル/公開APIの変更なし。
- 固定lockfile照合、整形、型検査、build、publish成功。appearance/localization/shell-boundariesの3ファイル・**18/18件、fail/skip 0**。前回の機能回帰140件は保存/操作処理が不変のため全再実行せず、ヘッダーに絞った実画面検証を追加した。ソース/固定EXEとも各**2群成功**、pageerrorなし。Applet管理/通知/Webアカウント/操作の許可/AI/MCPクライアント/ショートカット/マウス・タッチパッドジェスチャー/カスタムコマンド/WebAppletの11画面で、明暗1280px・明720pxの高さを計測。ボタン有無の差は罫線丸めの範囲内、ページ横はみ出しなし。追加ボタンの枠0・通常透明・32px対象・hover背景・Tab focus outline・追加ダイアログの開閉/取消を確認し、画像を目視した。恒久的な見た目比較試験は追加していない。
- 最終EXEは**170,683,878 bytes / SHA256 be162efa2ee99f6fe57bd4f6fae11971270eb4a8dcdc89cb0e62e89fc92a4231**、A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exeへ発行。File/ProductVersion、feedの版/size/hash、ASAR内package/Default Shell版、固定GUI/smokeコピーが0.87.16と一致し、smoke成功。
- 証跡は .artifacts/table-header-08716/ の入力SHA、環境、レビュー、各log、header-measurementsと画像、最終照合。source=table-header-ui-1792907710261、portable=table-header-ui-1792907899153、smoke=smoke-1792907931302。製品入力は検証前後で一致、本記録のみ後続変更。今回成功profileは各方式1件で直近3回以内、削除0。前回の機能検証・失敗診断・固定出力を保持。物理入力、外部サービス、実利用データや通常終了は未検証。commit/push/Release/deployなし。

## 2026-10-25: 設定テーブルの共通化とApplet一覧の操作配置 0.87.15

- main b0f5cccから開始し、clean時にpull --ff-onlyで最新を確認。一連の作業中の変更を保持して、WebApplet/WallpaperSlideshowの宣言型一覧、Applet管理と追加指定の本体設定を整備。共通SettingsTableへ背景・ヘッダー・セル余白・罫線・末尾行を集約した。通知/Webアカウント/MCPクライアント/カスタムコマンドは既存SettingsListLayout/Table経由、AI/Applet管理は同レイアウトへ移行、操作の許可とショートカット/マウス・タッチパッドジェスチャーは専用行構造内で同じ土台を利用する。
- Appletの宣言型一覧は件数を右端、追加/順序操作を左へ配置し、操作列のヘッダーとセル内ボタンを左寄せ。列位置は変更しない。AIの件数も共通Summaryで右端に配置。Applet管理の検索/集計/追加/操作/横スクロールを共通化し、バージョン・状態・更新・再起動等の専用表示とguard/callbackを保持。コマンドのrowSpan/owned割り当て/スクロールとフォーカス復帰、権限のApplet/MCP独立列と狭幅表示を保持した。Appletソース変更なし、設定キー・保存ファイル・公開API変更なしのため0.87.14からパッチ更新。
- 発行前に実装差分・影響先・保存/削除/順序契約・専用CSSをレビューし、阻害指摘なし。固定lockfile照合、整形、型検査、build、publishは成功。object-list-dialog/setting-list-draft/applet-settings/applet-management/applet-order/settings-page/settings-page-host/localization/appearance/shell-boundaries/ai-settings/web-accounts/notification-preference-edit/mcp-client/keybindings/gestures/touchpad-gesturesの**17ファイル・140/140件、fail/skip 0**が成功。標準回帰全体は未実行。
- ソースGUIと最終固定EXEの隔離GUIは各**3群成功**、pageerrorなし。明1280/暗900/明720の対象全画面で共通表・32px操作・ページ横はみ出しなしを確認して目視。実際の発行済みWebApplet/WallpaperSlideshowのmanifest/payloadをhash照合し、両Appletを無効のまま、サイト編集保存/取消、追加/削除取消、順序保存、初期キー取消、モニターMode保存を確認。Applet管理の検索/設定遷移/順序取消、AI編集/追加取消、WebアカウントEnter保存/Escape取消、通知編集取消、3入力一覧の行結合/編集取消/削除取消と保存値維持も確認した。fixtureの名前/OKボタン/アカウント参照/保存待機/表示倍率/owned行数の不一致を修正し、全確認を再実行して成功。製品側の検証やガードは緩めていない。
- 発行先は A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe。**0.87.15 / 170,695,182 bytes / SHA256 cf3ee59f040dd84c744214b928707f647f9fb6ee3575bbf6b84668e64fb86eab**。固定EXE smoke成功。EXEのFile/ProductVersion、update.jsonの版/size/hash、ASAR内package/Default Shell版、固定GUI/smokeコピーを照合した。
- 証跡は .artifacts/applet-list-toolbar-08715/ の入力SHA一覧・環境/兄弟依存情報・レビュー・各完全log・最終照合/証跡hash。ソースprofileはapplet-list-toolbar-ui-1792906500294、固定EXEはapplet-list-toolbar-ui-1792906702035、smokeはsmoke-1792906750773。試験前後の製品入力は一致し、後続差分は仕様文書/本記録のみ。対象profileを成功/方式別に確認し、各方式の今回成功は3回以内のため削除0。失敗診断・固定helper・過去の再利用証跡を保持。恒久的な見た目比較テストは追加していない。
- 物理キー/ジェスチャー、外部AI/MCPサービス、実壁紙適用、実利用設定、通常終了は新規検証していない。隔離fixtureのキーはapp scope Ctrl+F8/Alt+F8、ジェスチャー機能は無効、Pause/F13〜F24のOS送信/登録なし。コミット・push・Release・実利用先deployは行っていない。

## 2026-10-25: 通知設定 0.87.14のコミット検証

- 利用者が0.87.14を確認してcommit/pushを依頼。main `ce1c630`上の今回の11対象ファイルだけをレビューし、阻害指摘なし。通知テーブル、共通編集ダイアログ、種類単位の保存/競合検査、追加6試験、翻訳8キー、版と関連文書を対象とした。dirtyのためpull/stash/統合なし。fetchとGitHub/AQUAの読取で両mainが`ce1c630`に一致し、実効author/committerを確認した。
- 標準回帰は**114ファイル・885/885、fail/skip 0**。既存113試験と既存locale値・設定スキーマ・SDK/native/Shell/runtime・共通UI・依存/固定ツール/ビルド定義は前回と同じ。mainは新しい内部通知actionとimportを除いて既存コードと一致し、新helperはこのactionだけが使用する。影響のない**89ファイル・683件を前回標準から再利用**、今回の実装時に最終入力で成功した**18ファイル・138件を再利用**、最終native/updater生成物を使うall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesとmain静的参照のribbon-commandsの**7ファイル・64件を追加実行して成功**した。型検査/buildの完全logと終了コード、Node/pnpm/.NET/OS、全ソース・試験・依存・fixtureと証跡hashを照合した。
- 今回の最終固定EXEの通知GUI 2群とsmokeは、入力・試験・実行方式・隔離コピーとEXEのSHA256一致を確認して再利用。確認済みの0.87.14の製品変更・再発行なし。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,693,021 bytes**、SHA256 `606b48cfe671623b7018264ad4028cc479c014bd04a9416f179f188974ec13a9`。既存feedと版も一致する。検証後の変更はこの記録だけ。stage/worktreeの一致・tree ID・commit/tree・両remote headとclean状態は`.artifacts/commit-validation-notification-table-08714/`へ記録する。今回の追加試験出力と再利用証跡は保護し削除0件。Release/deployは行わない。

## 2026-10-25: 通知種類のテーブルと編集ダイアログ 0.87.14

- cleanなmain `ce1c630`で`git pull --ff-only`を実行し、Already up to dateを確認して着手。通知種類を共通SettingsContent/SettingsListLayoutの1テーブル（通知名・通知先・表示時間・読み上げ・MCP Events・編集）にし、提供元マークと説明ヒント、必須・固定・停止中・仕様変更・読み上げ前提不足を表示。鉛筆から共通SettingsDialogで編集し、OKで種類単位に保存する。利用できない種類の設定削除、読み上げ共通値、受け取り方の案内は保持した。
- 内部のsettings-page actionで元の上書き値・提供元/種類ID・通知仕様を照合してから既存の原子的保存へ渡す。他の通知や共通読み上げ設定を保持し、未変更のOKでは既定値を明示化しない。取消では保存せず、失敗・競合では入力とエラーを残す。設定スキーマ・保存ファイル・公開APIの追加削除はなく、発行済み0.87.13からpatchを増加した。
- 発行前レビューは阻害指摘なし。目視後に一覧の必須・秒数表記を短縮し、未使用importと正本文書を整理。最終差分で型検査・build成功、通知ポリシー/配送/履歴/音声、新しい種類単位保存、設定page/client/host/検索、翻訳・配色・Shell境界・automationの**18ファイル・138/138、fail/skip 0**。追加した恒久試験は保存・競合・制約・同名異提供元の6件で、見た目比較テストは追加していない。
- ソースと最終固定EXEの隔離GUIで各**2群**成功、pageerrorなし。必須/固定/停止中/仕様変更/TTS不足、取消/Escape/変更なしOK、入力不正時の保持、通知設定の一括確定、別種類・共通音声の外部変更の保持、同一種類競合拒否、停止Applet編集、未知の設定保持、検索anchor、編集ボタンへのfocus復帰を確認。明るい1280px・暗い900px・明るい720pxとヒントOFFの重要状態表示を確認。途中の3失敗はfixtureの最低ホスト版宣言・検索結果の表示前提・非同期focus待ちを修正して解消した。成功profileはソース`notification-table-ui-1792891035029`、固定EXE`notification-table-ui-1792891227202`。
- `publish.bat`終了0。本体・EXE・ASAR内Default Shell・feedは**0.87.14**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170693021 bytes**、SHA256 `606b48cfe671623b7018264ad4028cc479c014bd04a9416f179f188974ec13a9`。feedのsize/hash、FileVersion/ProductVersion、隔離コピーを照合し固定smokeも成功。証跡は`.artifacts/notification-table-08714/`のレビュー・完全log/コマンド/終了コード・入力hash・最終照合・証跡hash。発行後の製品変更なし。
- 整理は削除0件。今回のGUI成功はソース2回・固定EXE1回で方式別3回以内、途中失敗と過去の照合用証跡は保持。今回のfixtureプロセス終了を確認した。実利用設定・物理入力・実TTS/MCP送信・Windows/desktop通知配送・通常終了は今回未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: 設定UI 0.87.8～0.87.13のコミット検証

- 利用者が最終0.87.13を確認してcommit/pushを依頼。main `9685a04`上の23対象ファイルをレビューし、阻害指摘なし。索引間隔、Section/一覧/操作列の整理、ジェスチャー有効化・フィルター高さ、MCPクライアント自動取得/Schema、Codex連携/接続設定/トークン・登録操作と関連文書だけを対象とする。dirtyのためpull/stash/統合なし。fetchと両push先の読取でGitHub/AQUAのmainが`9685a04`に一致し、実効author/committerを確認した。
- 標準回帰は**113ファイル・879/879、fail/skip 0**。全113試験ファイル、main/shared/native/Shell・依存/固定ツール/ビルド定義は前回標準と同じ。差分の共通localeは設定画面の文言/検索語10値変更と2キー追加のみで、エラー/状態/通信契約の文言は不変。現行のappearance/localization/設定検索・ナビゲーション等の成功と入力を照合した。**107ファイル・826件を再利用**し、最終発行のnative/updater生成物を使用するall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesの**6ファイル・53件**を追加実行して成功。実装時の18/34/66/96/39件と型検査/build・発行の完全log/終了コード/入力一覧・証跡hashも照合し、現在のNode/pnpm/.NET環境を記録した。
- GUIは機能と入力範囲ごとに再利用した。索引は0.87.8のSettingsIndex/settings.css、ジェスチャー/フィルターは0.87.10のOptions/共通toolbar/summary/CSS、AI/MCP/Web/表示/リボンは0.87.11の各コンポーネントと共通一覧が現行と同じことを照合。MCP選択時自動取得・ページ追加・失敗/再選択・Schemaは同じ実装/依存のローカルstdio fixture成功を再利用した。Codexの構成は最終0.87.13の固定GUI**2群**とsmokeのEXE hashが現行と一致することを確認。途中で置換した取得ボタン/編集見出し/旧4Fieldの期待を含む過去GUI全体を、現在の成功として数えてはいない。最新の該当機能の確認を採用し、古い構成は後続成功で置き換えた。物理OS入力・実サービス・実利用設定・通常終了・認証/登録実操作の新規検証はしていない。
- 製品修正なし、利用者確認済み**0.87.13**を維持し再発行なし。EXEは**170,683,556 bytes**、SHA256 `8ca22a5dd0b2ade6d0a29cf09fc572c10b671d71a735673af33c6530a23a8876`。証跡は`.artifacts/commit-validation-settings-08713/`の対象/入力一覧、再利用判定・旧証跡hash/機能別ソース照合、追加53件の完全log、stage/commit tree・実効名義・両remote先端の照合。元資料は`commit-validation-settings-0877`と0.87.8～0.87.13の実装記録。再利用資料・直近成功・固定helperを保持して削除0件。GitHub Release/実利用先deployは行わない。

## 2026-10-25: 認証再発行とCodex登録解除の配置分離 0.87.13

- 0.87.12の発行/固定GUI/smoke完了後、利用者が合意した操作別の配置へ変更。「認証情報を再発行」は接続設定の「接続トークン」Field、「登録を解除」はCodex連携の「Codexへ登録」Fieldへ移し、空になった「認証と登録の管理」Fieldを除去した。再発行後のCodex登録修復・他クライアント更新・ローカル保存に関する既存説明はトークンFieldへ保持。元のcallbackとbusy/port/registration guardをそのまま移し、実操作は行っていない。再発行/解除の検索語も移動先に合わせ、設定キー/保存ファイル/公開APIの追加削除なし。main `9685a04`上の未コミット変更を保持してpull/stash/統合なし。正本文書を整合し、発行前レビューで阻害指摘なし。0.87.12からパッチ更新。
- 固定lockfile照合・整形・型検査・build・publishは終了0。appearance/localization/shell-boundaries/settings-navigation/settings-page/automationの**6ファイル・39/39、fail/skip 0**が成功。標準回帰全体は未実行。`.artifacts/mcp-auth-layout-08713/probe.cjs`でソース/最終固定EXEそれぞれ**2群**成功、pageerrorなし。明るい1280px/暗い900pxで前回の統合カードと入力guardを再確認し、Codex操作Field/トークンFieldに各3ボタンがあること、再発行/解除の正しい配置と無効条件、旧Fieldの除去、再発行後の案内、Section/ポート/再発行/登録解除の検索focusと設定snapshot不変を確認して目視した。設定適用・再発行/コピー・登録/解除・実接続は行っていない。恒久的な見た目比較テストは追加していない。
- 成功profileはソース`mcp-auth-layout-ui-1792888784559`、固定EXE`mcp-auth-layout-ui-1792888987499`。本体・EXE・ASAR内Default Shell・feedは**0.87.13**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,683,556 bytes**、SHA256 `8ca22a5dd0b2ade6d0a29cf09fc572c10b671d71a735673af33c6530a23a8876`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し固定smokeも成功。証跡は`.artifacts/mcp-auth-layout-08713/`のレビュー・入力照合・完全log/コマンド/終了コードとhash・発行物照合。方式別3回以内の成功と参照資料を保持し削除0件。実利用設定・物理入力・通常終了・実サービスは未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: MCPサーバーの接続設定への統合 0.87.12

- 追加ホスト名とローカル/ネットワーク共通ポートを「接続設定」へ統合する依頼を実装。旧ネットワークカードを改名し、ポート→ホスト名→既存ネットワーク/トークン/認証案内の順とした。空になった詳細カードを除去。既存の保存callback・入力/範囲/操作guard・Codex連携は保持した。共通ポートのhintとネットワーク状態の明示的な接頭辞で用途を分け、既存のnetwork検索anchorとconnectionのID（ポートFieldへ移動）を維持して検索文言・正本文書を整合。main `9685a04`の未コミット変更を保持し、pull/stash/統合なし。保存キー/ファイル/公開APIの追加削除はなくパッチ更新。レビューで発行阻害指摘なし。
- 固定lockfile照合・整形・型検査・build・publishは終了0。appearance/localization/shell-boundaries/settings-navigation/settings-page/automationの**6ファイル・39/39、fail/skip 0**が成功。標準回帰全体は未実行。`.artifacts/mcp-connection-settings-08712/probe.cjs`でソース/最終固定EXEそれぞれ**2群**成功、pageerrorなし。明るい1280px/暗い900pxで統合・順序・旧見出し除去、ローカル時の入力有効、ポートdraft/不正範囲guard・ホスト名Escape取消、共通ポートhint、ネットワーク状態とトークン表示保持、Section/ポートへの検索focus・設定snapshot不変を確認し目視。初回fixtureは検索移動の描画フレームを待たずfocus比較して失敗し、完了待ちへ直して成功。製品の検索実装は変更していない。設定適用・登録・トークン操作・実接続は行っていない。恒久的な見た目比較テストは追加していない。
- 成功profileはソース`mcp-connection-settings-ui-1792888384514`、固定EXE`mcp-connection-settings-ui-1792888602289`。本体・EXE・ASAR内Default Shell・feedは**0.87.12**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,680,927 bytes**、SHA256 `7f1f13322fbf6ca4862e383eb8dce72de8ac4423e1132e98ea9acafa3a8f4e5d`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し固定smokeも成功。証跡は`.artifacts/mcp-connection-settings-08712/`のレビュー・入力照合・完全log/コマンド/終了コードとhash・発行物照合。方式別3回以内の成功と初回fixture失敗・再利用資料を保持し削除0件。実利用設定・物理入力・通常終了・実サービスは未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: 設定Section整理・Codex連携・MCP自動取得 0.87.11

- main `9685a04`の未コミット変更を保持し、表示の共通Sectionのtitle、リボン編集Sectionのtitle/hint、マウス/タッチパッド一覧の無効時説明を除去。AI/MCPクライアント接続一覧はSection枠を外して共通Content/一覧をページ直下へ置き、検索anchorと操作を保持した。MCPの共有名/PC専用接続設定の説明はページ説明へ統合。Webアカウントの操作列は共通SettingsListLayoutの任意`actionsAlign="start"`でヘッダー/セル/操作行を左寄せとし、既定の他一覧は変更していない。
- MCPサーバーの登録Sectionを「Codex連携」とし、設定ファイル・登録名・認証と登録の管理を同じカードへ移動。登録/修復とこのPC内接続テストは「Codexへ登録」Field内へまとめ、登録の検索anchorを当該Fieldへ移した。ホスト/ポートの詳細と、保存/登録/修復/認証/テストの既存guard・callbackは保持。実Codex設定への書込・登録・テストは行っていない。
- MCPクライアントは接続先の選択イベントで既存mcpToolsを呼び、自動接続/取得する。未選択では呼ばず、切替時に既存のツール・cursor・結果とエラー表示を解除し、処理中の選択無効・単一処理guardを維持。取得ボタンを除き、Schemaは共通SettingsField内の読み取り専用SettingsTextareaへ変更。ページ追加と実行の操作は保持した。設定キー/保存ファイル/公開APIの追加削除はなく、0.87.10からパッチ更新。dirtyのためpull/stash/統合なし。正本文書を整合し、発行前レビューで阻害指摘なし。
- 固定lockfile照合・整形・型検査・build・publishは終了0。appearance/localization/shell-boundaries/setting-sections/settings-page/settings-navigation/settings-view-client/ai-settings/mcp-client/web-accounts/automationの**11ファイル・96/96、fail/skip 0**が成功。標準回帰全体は未実行。`.artifacts/settings-sections-08711/probe.cjs`でソース/最終固定EXEそれぞれ**3群**成功、pageerrorなし。明るい1280px・暗い900pxで指定のヘッダー/説明除去、最上層一覧・AI追加取消と保存不変、Codexの4Field/2操作、Web操作列の左寄せを確認し、AI/MCP/Schema/CodexとWebの画面を目視した。
- 機能検査は隔離ローカルstdio fixtureを使用。選択前の取得なし、A選択で自動取得・pending guard・50/50/20件のページ追加、読み取り専用Schemaと引数ドラフト、空選択で取得なし/古い表示の解除、Bの意図した取得失敗と空選択後の再選択での復帰、Bの一覧へ切替・設定snapshot不変を確認。ツールの実行は行っていない。初期fixtureはページ説明/Fieldラベルのselectorと、Webアカウント操作に必要なweb-profiles所有元/最低ホスト版を訂正した。これらは製品修正ではなく、途中の失敗記録も保持。恒久的な見た目比較テストは追加していない。
- 最終ソースprofileは`settings-sections-ui-1792887334908`、固定EXEは`settings-sections-ui-1792887562061`。本体・EXE・ASAR内Default Shell・feedは**0.87.11**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,688,265 bytes**、SHA256 `0baa5a14c6c772e33c13d00e517ab774aa2f5fe25c96c4f8b433f7eb88dc1799`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し固定smokeも成功。証跡は`.artifacts/settings-sections-08711/`のレビュー、入力照合、完全log/コマンド/終了コードとhash、ローカルMCP trace、発行物照合。方式別3回以内の成功と途中のfixture失敗/再利用資料を保持し削除0件。実利用設定・物理入力・通常終了・実外部サーバー/ツール実行は未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: ジェスチャー有効化・フィルター高さ・MCP操作配置 0.87.10

- 0.87.9の発行/固定GUI/smoke完了後、追加依頼を実装。マウス/タッチパッドの有効化Fieldを先頭の見出し・説明・折りたたみなしSettingsSectionへ独立し、動作設定とWindows接続は初期折りたたみを保持した。タッチパッドの既存翻訳値を「タッチパッドジェスチャーを有効にする」へ変更し、説明をFieldのhintへ移した。既存のchecked/onChange、busy、anchorと設定キー/保存値を保持。MCPクライアントのツール取得・追加取得・実行を共通SettingsActionsへ配置し、既存の条件・callback・ジョブ操作・一覧/ダイアログは保持した。正本文書を整合し、レビューで発行阻害指摘なし。
- 一時フィルターの基準測定で通常集計42px→適用時48px、パネル90px→96pxを確認。共通の集計行を通常時から48px確保し、長い対象名を一行省略と全文tooltipへ変更。初回GUIで残っていた`command-shortcut-summary`の個別42px上書きを検出・除去し、再build・関連66件・GUIを成功まで再確認した。解除操作、件数の右寄せ、検索/状態/一時条件の範囲は変更していない。設定/保存ファイル/公開APIの追加削除はなく、発行版0.87.9からパッチ更新。dirtyなmain `9685a04`の前回変更を保持し、pull/stash/統合なし。
- 固定lockfile照合・整形・型検査・build・publishは終了0。最終のappearance/localization/shell-boundaries/setting-sections/gestures/touchpad-gestures/mcp-clientは**7ファイル・66/66、fail/skip 0**。標準回帰全体は未実行。`.artifacts/gesture-enablement-08710/probe.cjs`の隔離GUIでソース/最終固定EXEそれぞれ**6群**成功、pageerrorなし。明るい1280px・暗い900pxで先頭カード/有効化ラベル/OFF値/focus/検索anchor、hint表示とdescription除去、動作/接続の初期折りたたみを確認。6画面の集計高を確認し、3入力画面の提供元/長い名前/入力マーク/文字検索/状態/画面間コマンド条件の適用・解除で集計とパネル高が変わらず、件数右寄せ・全文tooltip・設定snapshot不変を確認した。MCPは取得ボタンの共通アクション行と未選択時の無効状態を確認し、追加取得/実行の条件分岐はソースレビュー。画面を目視し、恒久的な見た目比較テストは追加していない。GUIでは実フックを作らないよう有効化を押さず、F13～F24のOS送信/登録や実MCP接続/ツール実行は行っていない。
- 成功profileはソース`gesture-enablement-ui-1792885036466`、固定EXE`gesture-enablement-ui-1792885272503`。本体・EXE・ASAR内Default Shell・feedは**0.87.10**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,673,668 bytes**、SHA256 `bd8bdd8d37f8daa9f40f6d850df38ee7b388aa12835ab5e28306602efd9642c1`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し固定smokeも成功。証跡は`.artifacts/gesture-enablement-08710/`のレビュー・入力照合・完全log/コマンド/終了コードとhash・配布物確認。基準測定・途中のGUI失敗と方式別3回以内の成功・参照資料を保持し削除0件。実利用設定・物理入力・通常終了・実サービスは未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: リボン・トレイの動作カードの見出し除去 0.87.9

- main `9685a04`上の0.87.8未コミット変更を保持し、リボン/トレイの動作カードを既存SettingsSectionのtitle・descriptionなし、折りたたみなしの表示へ変更した。Fieldのラベル/ヒント/anchorと選択・解除、後続の編集Sectionは保持。共通部品の追加変更や設定キー・保存ファイル・公開APIの追加削除はなく、0.87.8からパッチ更新。dirtyのためpull/stash/統合なし。設定基盤・トレイの正本文書を整合し、発行前レビューで阻害指摘なし。
- 固定lockfile照合・型検査・build・publishは終了0。appearance/localization/shell-boundaries/setting-sections/ribbon-customization/tray-menuの**6ファイル・34/34、fail/skip 0**が成功。標準回帰全体は未実行。`.artifacts/behavior-sections-0879/probe.cjs`の隔離GUIでソースと最終固定EXEそれぞれ**4群**成功、pageerrorなし。明るい1280px・暗い900pxでSectionが通常sectionでありheader/summary/開閉アイコン/動作設定見出しがないこと、各Field/選択ボタンの常時表示・ラベル・有効状態・focus、後続見出しの保持、検索移動と設定snapshot不変を確認し目視した。コマンド選択確定・実コマンド実行は今回追加検証していない。恒久的な見た目比較テストは追加していない。
- 成功profileはソース`behavior-sections-ui-1792884391894`、固定EXE`behavior-sections-ui-1792884566585`。本体・EXE・ASAR内Default Shell・feedは**0.87.9**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,692,530 bytes**、SHA256 `0e38696370a8378b8fb54dc831b8e7180343e7879da5111b992fafab69899a95`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し、固定smokeも成功。証跡は`.artifacts/behavior-sections-0879/`のレビュー・入力照合・完全log/コマンド/終了コードとhash・配布物確認。方式別の成功は3回以内、再利用資料を保持し削除0件。実利用設定・物理入力・通常終了・実サービスは未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: 設定インデックスの項目間隔 0.87.8

- cleanなmain `9685a04`で通常環境の`git pull --ff-only`はAlready up to date。設定索引だけに適用する共通CSSで、項目間を4pxから2px、上下paddingを10pxから6pxへ縮小し、操作高32px以上を維持した。横余白・アイコン/文字配置、選択色、内側のfocus枠、長い文字の省略と複数行検索結果の自然な高さを保持。設定基盤の正本文書も整合させた。発行前レビューで阻害指摘なし。設定キー・保存ファイル・公開APIに追加削除はなく、表示調整として0.87.7からパッチ更新。
- 固定lockfile照合・型検査・build・publishは終了0。既存appearance/localization/shell-boundariesの**3ファイル・18/18、fail/skip 0**が成功。標準回帰全体は未実行。`.artifacts/index-spacing-0878/probe.cjs`の今回用隔離GUIでソース/最終固定EXEそれぞれ**2群**成功、pageerrorなし。明るい1280px・暗い900pxで本体/長い名前を含むAppletの32px以上の項目高・2px間隔、クリックとEnter選択、focus-visible内側枠、長い名前の省略、検索のArrow/Enter/Escapeと複数行の高さを確認して目視。初回fixtureのfocus検査だけはDPI丸めの`-2.66667px`を厳密な`-3px`と比較して失敗し、内側範囲の検査へ修正して成功。製品のfocus実装は変更していない。恒久的な見た目比較テストは追加していない。
- 成功profileはソース`index-spacing-ui-1792882218683`、固定EXE`index-spacing-ui-1792882394077`。本体・EXE・ASAR内Default Shell・feedは**0.87.8**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,690,260 bytes**、SHA256 `efcca95612a7de8852fa4847c36bbc4081f71014e20deb184eb4a13ad717fadf`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合し、固定smokeも成功。証跡は`.artifacts/index-spacing-0878/`のレビュー・入力照合・実行コマンド/終了コード/完全logとhash・配布物照合。今回の方式別成功は3回以内、初回fixture失敗と再利用資料を保持して削除0件。物理OS入力・実利用設定・通常終了・実サービス操作は未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: 設定UI 0.87.5～0.87.7のコミット検証

- 利用者が0.87.7までの表示・動作を確認してcommit/pushを依頼。main `55bba3a`上の27対象ファイルをレビューし、阻害指摘なし。コマンドセル/提供元の一時フィルター・説明アイコン、設定索引とApplet内部設定、共通部品の密度/集計配置、および正本文書・版・検証記録を対象とする。新規の共通`CommandProviderBadge.tsx`を含め、別作業の変更は含まない。dirtyなためpull/stash/統合は行わず、fetchと両push先の読取でGitHub/AQUAのmainが`55bba3a`に一致し、実効author/committerを確認した。
- 標準回帰は**113ファイル・879/879、fail/skip 0**。前回標準の全試験ファイルとmain/shared/native/Shell・依存/固定ツール/ビルド定義を入力hashで照合。差分はrenderer・文書・版とrenderer用翻訳キー追加だけで、既存翻訳値は同一。実装時の91件・66件・15件、型検査/build・発行・ソース/固定GUI・smokeの完全log/終了コード/入力一覧と証跡hashも照合した。現行の翻訳/renderer検査を含む**107ファイル・826件を再利用**し、最終発行で生成したnative/updaterを使用するall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesの**6ファイル・53件**を追加実行して成功した。
- 共通CSS/集計行変更後のコマンド操作を補足するため、`command-cells-0875/probe.cjs`を最終固定EXEで実行し**5群**成功、pageerrorなし。提供元の表示名短縮と安定IDフィルター、説明popover、ヒントOFF時の説明、複数フィルターの置換と解除focus、検索/状態リセットと保存不変、明暗・幅を確認した。profileは`command-cells-ui-1792879651680`。Applet内部設定と6画面の密度/検索配置は0.87.7の固定GUI4群とsmokeの実行物hashが現行と一致するため再利用した。物理OS入力・通常終了・実利用設定・実サービス操作を追加確認した扱いにはしていない。
- 製品修正なし、確認済み**0.87.7**を維持し再発行なし。固定EXEは**170,689,015 bytes**、SHA256 `7280bd9e0122a537cf932890a2a9259995ae4d471e48b02c91b04c7e29ec2de1`。証跡は`.artifacts/commit-validation-settings-0877/`の対象/入力一覧、再利用判定・旧証跡hash照合、追加53件/固定GUIの完全log、stage/commit tree・実効名義・両remote先端の照合。元資料は`commit-validation-settings-0874`・`command-cells-0875`・`settings-density-0876`・`applet-internal-label-0877`。種類/方式ごとの直近成功と再利用資料を保持し、削除0件。GitHub Release/実利用先deployは行わない。

## 2026-10-25: Applet共通欄の見出し変更 0.87.7

- 利用者指定により共通Sectionの既存翻訳値だけを「Appletの内部設定」へ変更し、設定基盤の正本文書を整合させた。初期折りたたみ、起動待ち時間と更新元の配置、保存設定・公開APIは変更していない。main `55bba3a`上の未コミット変更を保持し、pull/stash/統合なし。表示文言のみのため発行版0.87.6からパッチ更新とし、発行前レビューで阻害指摘なし。
- 固定lockfile照合・型検査・build・publishは終了0。appearance/localizationの**2ファイル・15/15、fail/skip 0**が成功。最初のdev起動は版変更後の依存構成照合を求めたため固定installで解消。初回の翻訳検査は古いout/mainリソースとの比較で失敗し、build後に再実行成功。製品修正を追加した扱いにはせず、途中のlogも保持。0.87.6の入力一覧との照合で、変更は翻訳JSONの1値・版・正本文書だけ、ほかの製品/試験入力は不変。標準回帰全体は未実行。
- 最終固定EXEを`.artifacts/applet-internal-label-0877/probe.cjs`の隔離profileで確認し、更新した見出しと初期折りたたみ、Applet切替、検索展開、既存Field保存/取消/既定復帰、6画面の集計と入力寸法、ダイアログ取消の**4群**が成功、pageerrorなし。profileは`applet-internal-label-ui-1792879005622`。固定EXEのsmokeも成功。共通の一時fixtureを再利用し、恒久的な見た目比較テストは追加していない。
- 本体・EXE・ASAR内Default Shell・feedは**0.87.7**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,689,015 bytes**、SHA256 `7280bd9e0122a537cf932890a2a9259995ae4d471e48b02c91b04c7e29ec2de1`。feedのsize/hash・FileVersion/ProductVersion・隔離コピーを照合。証跡は`.artifacts/applet-internal-label-0877/`のレビュー・入力ハッシュ・完全log/コマンド/終了コード・最終照合。今回のGUI成功は方式ごと3回以内、参照資料と途中の検査失敗を保持して削除0件。実利用設定・物理入力・通常終了・実サービスは未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: 設定インデックス・Applet共通設定・入力部品の密度 0.87.6

- main `55bba3a`上の0.87.5未コミット変更を保持して追加修正。dirtyなためpull/stash/統合は行っていない。設定インデックスの本体群に指定表記`APPPDOCK`を既存APPLETと同じスタイルで追加し、Default Shellを通常ナビゲーションと検索結果から除外した。登録ページ・実行時のShell・公開操作・保存設定は保持している。
- Applet共通の起動欄は「Appletの設定」として初期折りたたみ、その中へ既存の開始秒数と更新元SettingsFieldを配置。更新元の既定復帰は入力欄隣のアイコンを使用する。レビューでApplet切替時の開閉状態が残らないようowner単位のkeyを確認した。検索結果からは該当Sectionを自動展開し、collection子ページの除外を維持する。見出しは確認待ちの間に説明した「Appletの設定」の解釈で実装した。
- 共通部品の単行テキスト・数値・URL・select・通常ボタンの標準高を32pxへ縮小し、専用アイコン/トグル等の操作寸法を維持。6画面のフィルターパネルの件数を同じ集計行の右端へ配置し、検索欄も標準高へ合わせ、虫眼鏡をSVGの中央配置へ統一した。狭幅で必要な折返しは保持する。共通レイアウト指針・設定基盤の正本も更新した。設定キー・保存ファイル・公開APIの追加削除はなく、0.87.5からパッチ更新。発行阻害指摘なし。
- 固定lockfile照合・format・型検査・build・publishはいずれも終了0。関連回帰はappearance/localization/settings-view-client/settings-page/settings-page-host/settings-navigation/applet-settings/setting-sections/settings-defaults-reset/shell-boundariesの**10ファイル・66/66、fail/skip 0**。標準回帰全体は未実行。
- `.artifacts/settings-density-0876/probe.cjs`・`behavior.cjs`の隔離GUIで、ソースと最終固定EXEそれぞれ**4群**成功、pageerrorなし。Default Shellの索引非表示とページ登録維持、Applet切替時の初期折りたたみ、開始秒数/文字/選択の保存とEnter/blur/Escape、更新元の個別値・空欄・既定復帰とowner分離、検索からの自動展開、共通入力/選択/ボタン32px、6画面の集計右寄せと検索SVG中央、共通ダイアログの取消を確認。明るい1280px・暗い900pxを目視した。初回fixtureは既定値と同じ文字列を保存後も残る想定が誤りで失敗し、fixtureの既定値を別値に訂正して再実行成功。製品の既定値省略処理は変更していない。恒久的な見た目比較テストは追加していない。
- 成功したソースprofileは`settings-density-ui-1792878360125`、固定EXEは`settings-density-ui-1792878672639`。本体・EXE・ASAR内Default Shell・feedは**0.87.6**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,691,300 bytes**、SHA256 `98036797be8d071e821a1b38f3399920040c0faef2113f898298d39dfc0458f1`。feedのsize/hash・FileVersion/ProductVersion・隔離GUI用コピーを照合し、固定EXEのsmokeも成功。証跡は`.artifacts/settings-density-0876/`のレビュー、入力ハッシュ/最終照合、完全log/コマンド/終了コードとhash、配布物確認。今回の種類/方式別の成功は各3回以内、途中の失敗と参照資料も保持し削除0件。物理OS入力・実利用設定・通常終了・実サービス操作は未確認。commit/push/Release/deployは行っていない。

## 2026-10-25: コマンドセルの2行表示・提供元マーク・説明アイコン 0.87.5

- cleanなmain `55bba3a`で通常環境の`git pull --ff-only`はAlready up to date。合意した提供元マーク＋名前＋説明/公開アイコン、その下にIDの基本2行を共通`CommandBindingList`へ実装し、ショートカット・マウス/タッチパッドジェスチャーへ適用。セル上下8px・IDとの間2pxとし、長い名前・複数割り当てに必要な高さ、利用不可/互換表示と既存操作を保持した。
- `CommandProviderBadge`は所有元IDで一時フィルターを適用する。押下時は検索/登録状態/入力/コマンド対象を解除し、既存の提供元タグで解除できる。入力マークとは相互に置換し、解除で元のマークまたは検索欄へfocusを戻す。ページ移動で破棄し、保存操作は行わない。AppDockはowner null、未知コマンドのundefinedは押せない表示とする。`at365.*`の表示名だけ先頭`Applet.`・末尾`.at365`を省き、元名はtooltipへ保持、他の提供元名・manifest名・ID・検索元は変更していない。
- 共通`SettingsDescriptionIcon`は既存ヒントのnative popover処理を共有し、説明のある場合だけ情報アイコンを表示。hover/focus/クリック/Enterで開き、Escape/外側操作で閉じる。設定ヒントOFFでも残し、長文/改行/外部テキストをそのまま表示する。レビューで任意ヒントのselectorと説明用selectorを区別し、既存のヒント検査・表示設定に影響しないよう整理した。共通一覧と設定基盤の仕様を更新し、未解決の発行阻害指摘なし。
- 固定lockfile照合・型検査/build・発行はいずれも終了0。関連回帰はappearance/localization/settings-view-client/settings-page/settings-page-host/shortcut-pages/keybindings/gestures/touchpad-gestures/shell-boundariesの**10ファイル・91/91、fail/skip 0**。レビュー後のselector/CSS差分についてappearance/localizationの**15件**を再確認し成功。残る試験は当該差分で使う型/動作/依存が変わらない成功を維持した。標準回帰全体は未実行。
- `.artifacts/command-cells-0875/probe.cjs`・`behavior.cjs`の今回用隔離GUIで、ソースと最終固定EXEそれぞれ**5群**成功、pageerrorなし。3画面の通常2行の構造、純正名短縮/全文tooltip・外部名保持、説明なし/利用不可、ヒントOFFでの説明のキーボード/マウス操作と外部テキスト保持、所有元IDによる正しい絞り込み、検索/登録状態のリセット、入力フィルターとの双方向切替、host/unknownの区別、解除focus・画面移動時の解除、設定snapshot不変を確認。画面間のコマンド対象とApplet管理から渡った提供元を置き換え、非同期clear後も新しいフィルターが残ることを確認した。明るい1280px/暗い900pxとリボン設定コマンドのサンプル画面を目視した。恒久的な見た目比較テストは追加していない。
- ソースprofileは`command-cells-ui-1792876698614`、固定EXEは`command-cells-ui-1792876919653`。本体/EXE/ASAR内Default Shell/feedは**0.87.5**、`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,679,417 bytes**、SHA256 `a8cd99cf5b1e572b5ebba85e0783933dd8506534095c559a524ffff27629515a`。feedのsize/hash・FileVersion/ProductVersion・GUI用コピーを照合。固定EXEのsmokeも成功。証跡は`.artifacts/command-cells-0875/`のレビュー・入力一覧/最終照合・実行コマンド/終了コード/完全logとhash・配布物確認。種類/方式ごとの直近3回以内の成功と参照資料を保持し、削除0件。物理OS入力・実利用データ・通常終了・実サービス/コマンド実行は未確認。設定/保存ファイル/公開APIに追加削除はなくパッチ更新とし、commit/push/Release/deployは行っていない。

## 2026-10-25: 設定UI 0.87.2～0.87.4のコミット検証

- 利用者が0.87.4の表示・操作を確認し、今回の設定UI変更のcommit/pushを依頼。main `35d72c4`上の23対象ファイルをレビューし、未解決指摘なし。設定インデックス・トレイ/リボン・共通順番変更・削除確認と関連文書/試験だけを対象とした。dirtyなためpull/stash/統合はせず、fetchと両プッシュ先のmain読取でGitHub/AQUAとも`35d72c4`に一致、実効author/committerを確認した。
- 標準回帰は**113ファイル・879/879、fail/skip 0**。前回の標準879件と全113試験ファイル、main/shared/native/Shellソース・依存/固定ツール・ビルド定義を照合した。変更はrenderer、UI試験/文書、版番号とrenderer用翻訳7キーの追加だけで、既存の翻訳値・バックエンド処理は不変。renderer全体を読むappearance/shell-boundariesと、再発行したnative/更新helperを使うall-in-one/applet-defaults/lifecycle/dotnet-pages/applet-packages/portable-updatesの**8ファイル・63件**を追加実行し、残る**105ファイル・816件**を成功証跡と依存関係の照合で再利用した。最新実装時の関連114件・直前の134件、型検査/buildとソース/固定GUI・smokeも対応する入力/ログ/配布物hashを照合した。
- 更新した既存`tray-menu-ui-test.cjs`を最終固定EXEで追加実行し**4群**成功。確認を経た解除・削除、子項目保持、ドラッグ/移動、未知ID、明暗3幅、空配列と再起動後の保存を確認した。最新の削除確認GUI4群と固定smokeを再利用。リボンのコンパクト表示は0.87.3のRibbonSettings/controls.css、インデックスは0.87.2のSettingsPage/settings.cssが現行と同じことを照合した。実OS入力・通常終了・実利用先を新たに検証した扱いにはしていない。
- 製品ソースは修正せず、検証済み**0.87.4**の発行物を維持し再発行なし。EXEは**170,688,000 bytes**、SHA256 `291d291cae6f9eba5e21db13ac151bf9527c11a63b91682b5ec8c1688a313b7f`。証跡は`.artifacts/commit-validation-settings-0874/`の対象差分・入力一覧・再利用判定/旧証跡照合、追加63件/固定トレイGUIの完全log、stage/commit tree・実効名義・両remote先端の照合。元証跡は`commit-validation-about-0871`・`tray-index-0872`・`compact-editors-0873`・`delete-confirm-0874`。参照資料、途中の調査と種類/方式ごとの直近成功を保持し削除0件。Release/deployは行わない。

## 2026-10-25: 削除確認と順番変更ボタンの通常色 0.87.4

- main `35d72c4`上の0.87.3の未コミット変更を保持して追加修正。dirtyなためpull/stash/統合はしていない。`CommandBindingList`でショートカット・マウス/タッチパッドジェスチャーとApplet詳細に共通の削除確認を追加。対象名・入力・条件を表示し、取消/Escapeでは変更せず、確定時に安定ID・対象内容・編集可否を再確認する。確認中に対象が変わった場合は削除を止めてダイアログにエラーを残す。取消で削除ボタン、確定後は対象コマンドの追加ボタンへフォーカスを戻し、一覧位置を保持する。
- トレイはコマンド・区切り線の削除とグループ解除に共通`SettingsDialog`を追加。メニューが確認中に変わった場合も削除を止める。グループ解除は確定後に子を同じ位置へ展開する既存仕様を保持。カスタムコマンド本体の削除は既存の確認画面を保持し、取消・確定と割り当てを残す動作を再確認した。コマンド実行・保存形式・公開編集APIへの確認ダイアログは追加していない。
- `SettingsOrderDialog`と`BindingOrderDialog`の上下ボタンを`accent-action`から標準面の`secondary`へ変更。32px角と移動処理を保持する。一覧側の複数コマンド用実行順入口の強調は保持。以前の確認なし削除に関する本体AGENTS・一覧/入力/トレイ仕様と既存GUIヘルパーの削除操作を更新した。宣言型object-listの`confirmDelete`省略時の契約は変更していない。
- 発行前に上記差分と呼出元をレビューし、未解決の発行阻害指摘なし。固定依存照合・型検査/build・発行は終了0。関連回帰はtray-menu/editing-commands/commands/clicks、keybindings、gestures、touchpad-gestures、custom-commands、setting-list-draft、object-list-dialog、localization、settings-view-clientの**12ファイル・114/114、fail/skip 0**。標準回帰全体と既存の全GUIヘルパーは実行していない。
- `.artifacts/delete-confirm-0874/probe.cjs`・`behavior.cjs`の今回用隔離fixtureで、ソース/最終固定EXEそれぞれ**4群**が成功、pageerrorなし。ショートカット/マウス/タッチパッドの削除前不変・取消/Escape・確定・フォーカス・外部変更時の拒否、未知ID/無効行と他の割り当て保持、トレイの解除/コマンド/区切り線の取消と確定・子の順序保持・競合拒否、カスタムコマンドの既存削除確認と割り当て保持、両共通順序画面の通常色ボタンによる移動と取消を確認。ソースprofileは`settings-delete-confirm-ui-1792874027897`、固定EXEは`settings-delete-confirm-ui-1792874248136`。固定EXEのsmoke `smoke-1792874274117`も成功。途中の試験側のエラー表示重複selector・空設定省略に関する失敗は修正し、そのprofileとlogを保持した。恒久的な見た目比較テストは追加していない。
- 本体/EXE/ASAR内Default Shell/feedは**0.87.4**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,688,000 bytes**、SHA256 `291d291cae6f9eba5e21db13ac151bf9527c11a63b91682b5ec8c1688a313b7f`。feedのsize/hash、EXEのFileVersion/ProductVersionとGUI用コピーを照合した。証跡は`.artifacts/delete-confirm-0874/`のレビュー・入力一覧/照合・コマンド/終了コード/完全logとhash・配布物確認。種類/方式ごとの直近3回以内の成功、参照資料と失敗調査を保持してprofile削除0件。実利用設定・物理OS入力・Pause/F13～F24登録/送信・実サービス実行・通常終了は未確認。コミット/プッシュ/Release/deployは行っていない。

## 2026-10-25: リボン編集と順番変更ダイアログのコンパクト表示 0.87.3

- main `35d72c4`上の0.87.2の未コミット変更を保持して追加修正。dirtyなためpull/stash/統合は行っていない。リボン編集は枠なし・通常40px以上の項目行とし、名前と補足を1行へ配置、グループの子項目を共通境界色の1px縦線とインデントで示した。32px角の操作ボタン、チェック、配置選択、ドラッグと保存経路を保持し、狭幅では操作列を次の行へ移す。
- 共通`SettingsOrderDialog`/`BindingOrderDialog`の行も枠なし・40px以上へ統一。名前と補足を横並びにし、上下操作は32px角の横並びを保つ。コマンドIDの専用表示を除去し、名前不明時もIDを代用せず「未確認のコマンド」と表示する。移動の読み上げ用案内にも同じ名前を使う。条件・無効/利用不可の状態は残し、長い名前/補足は省略と全文tooltip、540px以下では名前と補足を縦配置にする。ID・設定・競合検査・実行順の意味は変更していない。
- 発行前レビューで長い名前によるgridの横はみ出しと、カタログが未確認コマンドの名前へIDを補う経路を検出し修正。最終GUIで操作列と状態表示が収まることを再確認し、未解決の発行阻害指摘なし。共通の並べ替え指針とリボン設計を更新。設定・保存ファイル・公開APIの追加削除を伴わない表示修正としてパッチ更新した。
- 固定lockfile同期・型検査/build・`publish.bat`はいずれも終了0。関連回帰はribbon-groups/customization/commands、keybindings、gestures、touchpad-gestures、applet-order、ai-settings、mcp-client、object-list-dialog、localization、settings-view-clientの**12ファイル・134/134、fail/skip 0**。標準回帰全体は未実行。
- 隔離したソースGUIと最終固定EXEのGUIはそれぞれ**5群**成功、pageerrorなし。明暗1280/900/720pxでリボン・表示順・実行順、追加の480pxでダイアログを確認。720/480pxは試験用Windowだけ最小幅制限を緩めた確認。長短名、縦線、ボタン寸法、枠とページ横はみ出し、条件/状態とID非表示、AIのドラッグ/Alt+上下/取消/保存、ショートカット・マウス・タッチパッド各実行順の取消/適用、未知ID・無効値の保持、Applet/MCPの共通表示、リボンのグループ移動/下寄せ/表示切替/編集入口を確認。固定EXEのsmokeも成功した。
- 今回の確認用fixtureと画面は`.artifacts/compact-editors-0873/`へ保存し、恒久的な見た目比較テストは追加していない。ソース成功profileは`settings-compact-editors-ui-1792872583763`、固定EXE成功profileは`settings-compact-editors-ui-1792872909861`、smokeは`smoke-1792872947510`。起動直後にCDPへ接続できてもhostページが未生成だった配布版の試験失敗は、試験側の待機追加で解消。途中の未確認ID・長名overflow・Window最小幅・MCP操作名の試験失敗と修正も各profileのfailure/結果へ保持した。最終確認用プロセスのみ終了し、通常終了の実動作や実OS入力、実AI/MCP接続、利用者の設定は試験していない。Pause/F13～F24は送信・登録していない。
- 本体/EXE/ASAR内Default Shell/feedは**0.87.3**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は**170,689,638 bytes**、SHA256 `be891a3312e86830f66598288dc585704b1e71eace8a2e4793b72d4651bc4cf5`。feedのsize/hash、FileVersion/ProductVersion、固定GUIコピーを照合した。実行コマンド/終了コード/log hash・入力一覧/照合・レビュー・版/配布物確認の正本は`.artifacts/compact-editors-0873/`。種類/方式ごとの直近成功3回以内と参照資料、途中の調査記録を保持してprofile削除0件。コミット/プッシュ/Release/実利用先deployは行っていない。

## 2026-10-25: 設定インデックスとトレイのコンパクト表示 0.87.2

- cleanなmain `35d72c4`で通常環境の`git pull --ff-only`はAlready up to date。インデックス先頭の「設定」見出しを除去し、検索ボックス上下の余白をそろえた。汎用sidebarのpadding/gapが重なる箇所は、設定インデックス側の優先度で明示した。asideのアクセシブル名、検索、項目の選択とリサイズは保持した。
- トレイ編集は名前とコマンドID/グループ件数を横1行にし、長い文字は省略表示、名前とIDに全文のtooltipを付けた。行の枠を除去して40pxを基本とし、32pxの上下/削除ボタンとドラッグ/選択の余白を保持した。グループの子項目はインデントと共通境界色の縦線で示す。クリック/ダブルクリックのFieldはIDを表示せず、利用できない状態は保持する。見つからないコマンド名もIDの代わりに案内文を表示し、保存済みIDを変更しない。保存型・メニュー解決/実行・配置操作の変更がないUI調整としてパッチを進めた。
- 発行前の差分レビューで未解決指摘なし。固定lockfile同期・最終型検査/buildは終了0。トレイの解決/操作/クリック/編集コマンド、配色・翻訳・設定ナビゲーション・Viewの関連8ファイルは **55/55（fail/skip 0）**。標準全回帰は再実行していない。仕様と追加規則は設定基盤とトレイ文書へ反映した。
- 最終ソースGUIは **5群**、最終固定EXEのGUIは **4群** が成功。混在Applet/未知IDの保持、グループ/区切り線の追加・配置・上下/drag・解除、入力検証、保存と再起動後の一致、空一覧の保持を確認。ソースでは実メニューの固定末尾、callback、単/ダブルクリックの振分け、IPC/menu/ウィンドウ内キー操作によるpause状態も確認した。Pause/F13〜F24をOSへ送信/登録する試験は行っていない。
- 明暗・1280/1000/900幅で横はみ出しなし、行の枠0・高さ36〜44px、名前/補足の単一行と中心位置、子グループの縦線、見出しなし、検索欄上下の等間隔を検査し、最終固定画像も目視確認した。初回は旧試験の見出し/画面名/移動待機とDPIによる罫線幅の丸めを修正し、失敗log/profileを保持した。
- 既存GUI試験の終了待機が残ったため、今回のUI fixtureは自身が起動したPID配下のプロセスツリーを終了して、保存済み状態の再起動を検証する形へ揃えた。一般利用の通常終了経路の検証とは区別する。残存した旧隔離試験もそのprofile/PIDに限定して後片付けし、通常利用のAppDockには触れていない。固定EXEのsmokeは **ok=true**。物理キーボード/実トレイ手操作/実利用先は未確認。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.87.2**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **170,675,873 bytes**、SHA256 `aacda9fbd0086fd0ff7b47303b9c1e7a91b80dde68064d88659ccf5ccc384d4b`。feedのsize/hash、EXE版、ASAR内のDefault Shell版と固定GUIコピーが一致した。
- 証跡は`.artifacts/tray-index-0872/`のreview・inputs-before/verified/final・input-verification・型/build/単体/GUI/smokeの完全logとJSON・package-verification・environment・evidence-hashes・cleanup。最終ソースは`.artifacts/tray-menu-ui-1792871075795/`、固定画像/結果は`.artifacts/tray-menu-ui-1792871378328/`、smokeは`.artifacts/smoke-1792871422747/`。種類/方式別の直近3回、参照資料と失敗調査、所有/参照の不明な旧資料を保持し、削除0件。未コミット、push/Release/実利用先deployなし。

## 2026-10-25: About改善のコミット前照合と一括更新名 0.87.1

- 0.86.13〜0.87.0の未コミット変更を保持し、一括更新のボタンと公開コマンドの表示名を「AppDockとAppletをすべて更新」へ統一した。`appdock.updates.installAll`のID・scope・保存済み割り当てと更新処理は不変。現行仕様書・GUIの期待文言も更新し、表示変更のパッチとして0.87.1を発行した。
- main `2312153`上の全42対象ファイルをレビューし、未解決指摘なし。dirty状態のpull/stash/統合は行わず、fetchと両プッシュ先の読取でGitHub/AQUAのmainが`13ce177`、local mainの親側にあることを確認した。実効author/committerも確認した。今回の対象はAbout情報パネル、自動確認/通知、共通設定ボタンと関連文書/検証に限定し、Fluidは変更していない。
- 標準回帰は **113ファイル・879/879、fail/skip 0**。保存既定値・カタログ・更新処理への実行時依存を追跡し、未実行の影響先72ファイルと文言に関わる2ファイルで **638件**、ソース読取/発行/ランチャー境界12ファイルで **48件** を追加実行した。前回の関連134件のうち、文言に影響されない **124件** を再利用。残る未変更の純粋モジュール16ファイル **69件** は、試験入力hashと旧成功log内の全試験名、依存/実行条件と動作が不変なことを照合して再利用した。古い結果を全体成功へ読み替えていない。
- 固定lockfile同期・型検査/buildは終了0。ソース/最終固定EXEのAbout GUI **6群** と固定smokeが成功。新しい長い表示名が明暗・600/760/900/1280幅で収まり、更新確認/通知の区分、2ボタンの実行対象、設定保存/リセット/件数タイルの移動を確認した。直前0.87.0の共通設定9群とURL保存6群は、変更のない入力/保存/操作経路の成功を再利用し、文言による配置の影響を新しいAbout GUIで確認した。実サービスへの更新適用・物理入力・実利用先は未確認。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.87.1**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **170,686,321 bytes**、SHA256 `904e28cc5f73080963db1596583e5a99e1ad1d43d2b352b0bf913e8d41fcc7c2`。feedのsize/hash、EXE版、ASAR内のDefault Shell版、固定GUIコピーを照合した。
- 証跡は`.artifacts/commit-validation-about-0871/`のrename・regression-plan・reuse・review・delta-from-0870・入力一覧、追加実行とGUI/smokeのJSON/完全log、package-verification。最終stage tree/実効ID/commit tree/各remote先端の照合はstage/commit/pushへ記録する。旧成功の再利用元は`.artifacts/commit-validation-settings-ui-08612/`・`commit-validation-gesture-labels-0868/`・`about-auto-0870/`。参照証跡と種類/方式別の直近3回、失敗調査、所有/参照が不明な旧資料を保持し、削除0件。Release/実利用先deployは行わない。

## 2026-10-25: Aboutの自動確認と更新通知・標準ボタン 0.87.0

- main `2312153`上の0.86.14までの未コミット変更を保持して追加修正。dirty状態のpull/stash/commitは行わず、Fluid worktreeも変更していない。前回758入力との差分、レビューと今回759入力のhashを`.artifacts/about-auto-0870/`へ記録した。
- 確認アイコンを枠なしに変更。共通の設定画面/ダイアログでは、標準面ボタンのhoverに明るさfilterをかけず、枠をアクセント色へそろえた。意味を持つ強調/削除・タブ・トグル・アイコンの専用外観は保持する。更新設定は初期状態を閉じ、末尾の説明段落を除去。更新元のリセットは共通の`SettingsInputActions`でテキストボックス右の小さいアイコンへ移し、操作名と既定値での無効化、blur/Enter確定・Escape取消を維持した。
- `updates.checkHostOnAboutOpen`を追加し、依頼で選択された既定ON・1時間の間隔を実装した。Aboutを開くと本体metadataだけを確認し、同じプロセス内の最終確認から1時間未満なら実行しない。手動確認/更新実行の時刻も使い、更新元変更後の初回は確認する。OFF/空の更新元/更新処理中/導入確認待ちは実行せず、同時に複数画面が開いても重複しない。画面を開いたままの定期処理や、結果保存ファイルは追加しない。起動後初回は未確認として確認する。新しい保存項目のためマイナーを進めて0.87.0とし、既存値と明示OFFを保持する。移行コードは追加していない。
- 自動確認はAbout専用の内部actionに接続し、DockApiへ新しい操作を公開していない。確認だけで更新なし/未設定/未公開なら通知しない。更新あり/確認失敗は従来の通知へ渡し、更新ボタン/更新実行コマンドで更新がなかった場合の結果通知も保持する。設定/操作/間隔/結果の仕様とボタン追加規則を開発文書へ反映した。
- 発行前に差分と影響先を自己レビューし、未解決指摘なし。初回型検査でルートのDockApi providerとの型差を検出し、設定ページ専用の任意capabilityへ修正した。固定lockfile同期・最終型検査/buildは終了0。自動確認の1時間境界/手動確認による間隔更新/更新元変更/重複抑止/設定のJSON投影/明示OFF/通知の出し分けと、既存の更新・設定保存・既定値・端末分離等の関連13ファイルは **134/134（fail/skip 0）**。
- ソースと最終固定EXEの両方でAbout **6群**・既存共通設定 **9群**・URL確定/保存 **6群**、計 **3系統21群** が成功。初回の自動確認1回と無通知、再訪/最近確認済みでのON切替の抑止、確認アイコンと公開「更新チェック」コマンドの更新なし無通知、更新ボタンでの更新なし通知、更新版と日時、2種類の更新対象、折りたたみ/設定保存/隣接リセットの寸法と実際のリセットを確認した。明暗・実幅600/760/900/1280で本文の横はみ出しなし、枠なし確認アイコンと標準面2系統のhover枠色/filter、ボタン寸法を検査し、最終画像も目視確認した。
- 固定EXEのsmokeもok=true。初回smokeは、自動確認を無効にするため試験スクリプトへ追加したJSONにschemaVersion/host/extensionsがなく、設定復旧待ちでタイムアウトした。試験側を正しい既定設定のfixtureへ修正し、**同じEXE/hash**で再確認して成功した。失敗log/profileも保持し、製品の修正/再発行は行っていない。全標準回帰、実サービスからの更新適用/再起動、物理入力/実利用先は未確認。ローカルfeedの更新版は表示検証用で、実在する公開版を示さない。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.87.0**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **170,680,112 bytes**、SHA256 `85e9d22ed376f7b944215cb1330b557118f7412fe855b282ebc5a357a35668d8`。feedのsize/hash、EXEのFileVersion/ProductVersion、ASAR内のDefault Shell版、各固定GUIコピーが一致した。
- 証跡は`.artifacts/about-auto-0870/`のreview・delta-from-08614・inputs-before-final/inputs-final・input-verification・environment・コマンド別JSON/完全log・package-verification・evidence-hashes・cleanup。固定About画像/測定は`.artifacts/about-ui-1792866502971/`、共通設定は`.artifacts/settings-usability-1792866521398/`、URL/リセットは`.artifacts/settings-url-1792866543208/`、成功smokeは`.artifacts/smoke-1792866738474/`。種類/実行方式別の直近3回と参照資料、失敗調査、他作業との参照/所有関係が不明な旧資料を保持し、削除0件。今回も未コミット、push/Release/実利用先deployなし。

## 2026-10-25: 情報パネルの文言と更新操作の調整 0.86.14

- main `2312153`上の0.86.13未コミット変更を保持して追加調整した。dirty状態のpull/stash/commit・Fluid worktreeの変更は行わない。前回758入力との差分は`.artifacts/about-panel-08614/delta-from-08613.json`、修正前/検証時/最終入力はinputs-before/inputs-verified/inputs-finalへ記録した。
- 紹介文をアプリ名の上へ1回だけ配置し、歓迎文・現在のバージョンのラベル・最新である旨・実行環境/まとめて更新/本体更新の見出しを除去。Appletだけの一括更新リンクとフッターの管理ボタンも非表示にした。既存の公開コマンドや管理画面側の更新操作は保持した。
- 現在版の隣へ共通VersionDisplayによる更新版、確認アイコン、最終確認日時を1行で配置。確認アイコンは既存の`checkUpdates()`で本体metadataだけを取得し、共通のエラー表示を使う。更新は適用しない。「本体と全Appletを更新」「AppDockを更新」を等幅・等高で同じ行へ並べ、本体のみのボタンはLightで白、Darkで共通の標準面を使用する。Applet数のタイルを、クリックとキーボードで管理画面へ移動できるボタンにした。件数の定義、初期展開の更新設定、保存形式は不変。
- 発行前に実装差分と影響先をレビューした。GUIで見つかった本体確認APIの対象指定（既定の引数なしを使う）、タイルへの汎用buttonのflex継承、600px幅で縦並びになる本文幅を修正。最終ソースGUIと画像で再確認し、未解決指摘なし。初回失敗log/profileも保持した。設定項目・保存ファイル・公開API契約の変更がない表示と既存操作の接続としてパッチを進めた。
- 固定lockfileの依存同期、最終型検査/buildは終了0。関連の翻訳/ナビゲーション/設定ページ/接続/配色は **28/28（fail/skip 0）**。ソースと最終固定EXEの両方でAbout **6群**・既存共通設定 **9群**、計 **2系統15群** が成功。固定EXEのsmokeもok=true。不要文言の除去、既存カタログとの件数整合・登録後の表示更新、metadataだけによる更新版の表示/解除・日時、2種類の更新対象、手動で閉じた設定の維持と保存、件数タイルのEnter操作を確認した。
- 明暗テーマ・実幅600/760/900/1280で本文の横はみ出しなしを検査し、全幅で更新ボタンの同一y座標・幅・高さとLightの本体ボタンの白背景を測定した。1280幅では版と日時の同じ行を測定し、600幅では版の行内だけで横スクロールする。固定版の画像も目視確認した。ローカルfeedの`999.0.0`は表示検証用で、実在する公開版ではない。更新ボタンの対象検証は同版feedで行い、実ファイルの更新適用/再起動・実サービス・実利用先は未確認。標準全回帰とportable-updatesの全適用試験は未実行。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.86.14**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **170,677,435 bytes**、SHA256 `7a84233f99c4fa5f46bed7d0ca3b79b84aa4e1e99ac93e48c24d58829ea465a6`。feedのsize/hash、EXEのFileVersion/ProductVersion、ASAR内のDefault Shell版、固定GUIコピーが一致した。
- 証跡は`.artifacts/about-panel-08614/`のreview・入力照合・environment・コマンド別JSON/完全log・package-verification・evidence-hashes・cleanup。最終固定About画像/測定は`.artifacts/about-ui-1792864182307/`（更新ありはhost-update-available.png）、共通設定は`.artifacts/settings-usability-1792864199505/`、smokeは`.artifacts/smoke-1792864221072/`。種類/実行方式別の直近3回・参照証跡・失敗調査・他作業との所有/参照が不明な旧資料を保持し、削除0件。今回も未コミット、push/Release/実利用先deployなし。

## 2026-10-25: AppDockについての情報パネル 0.86.13

- 前回の設定UI変更0.86.9〜0.86.12を、標準874件と発行物の照合後にmainへ`2312153`（tree `605ed3352fefd169311ee03405f4bb3a7486fd2e`）としてコミットした。実効author/committerとstage一致を確認し、clean状態の通常環境で`git pull --ff-only`はAlready up to date。今回の実装はその後の別差分とし、commit/push/Release/実利用先deployは行っていない。Fluid worktreeも変更していない。
- 設定インデックス・ページタイトルを「AppDockについて」へ変更。既存の`settings/about`、公開コマンドID、検索アンカー、保存形式は保持した。最上部の単一情報パネルへアイコン・アプリ名・版・Applet/コマンド件数・実行環境と、一括/本体更新の操作・状態・最終確認日時、Applet管理へのリンクを統合した。独立した実行環境Sectionは除去し、「更新の設定」は初期状態で開いた共通Sectionとして配置した。利用者による折りたたみと即時保存は保持した。
- 情報パネルだけは依頼された共通レイアウト規則の例外とし、専用CSSで配置・文字・枠を構成。共通配色変数と既存の更新ハンドラー・エラー表示は共有する。Applet数は組み込み/collectionを除くパッケージ数と稼働中の数、コマンド数は入力設定と同じカタログのID重複を除いた総数と利用可能数。Aboutのauxiliaryへは集計数だけを追加した。設定項目・保存ファイル・公開操作の追加/削除がないためパッチ更新と判定した。構成・件数・例外の適用範囲を設定基盤/共通指針/更新仕様等へ反映した。
- 発行前に差分と影響先を自己レビューし、更新日時をボタン横で縦中央にそろえる修正後に再確認。未解決指摘なし。固定lockfileの依存同期、最終型検査/buildは終了0。翻訳・ナビゲーション・設定ページ/接続・配色の関連試験は、入力hash記録を揃えた最終入力で **28/28（fail/skip 0）**。最終ソースGUIと固定GUIも成功し、標準全回帰は再実行していない。
- ソースGUIはAbout **5群**と既存の共通設定 **9群**が成功。最終固定EXEではAbout **5群**・共通設定 **9群**・URL入力 **6群**、計 **3系統20群**、smoke（ok=true）が成功した。3種類の更新ボタンは同版のローカルfeedで本体/全Applet/全体の対象を検証し、実サービスからの更新適用は行っていない。件数のカタログ整合・登録後の表示更新、初期展開/手動で閉じた状態の維持・保存、Applet管理への移動、明暗テーマと実幅600/760/900/1280の収まりを確認し、固定EXEの画像も目視確認した。
- 初回GUIでは開発版の更新制限と検証用の旧コマンド名、固定版ではモデル投影から描画までの待機不足を検出。検証側の経路/実行条件/描画待機を修正して成功した。既存URL試験の旧説明文・旧Applet一覧導線・既定値を省略する保存形式への期待も現行に合わせて修正し、最終6群が成功。失敗log/profileは調査資料として保持した。既存portable-updates等の名称/初期展開の期待値は更新・構文検査済みで、その全更新適用/再起動試験は今回未実行。実アカウント・実入力・実利用先は未確認。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.86.13**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **170,667,449 bytes**、SHA256 `3288867dc686d14ec55a569749d2242b2a180502ab6a959941ed59a42fef544c`。feedのsize/hash、実EXEのFileVersion/ProductVersion、ASAR内のDefault Shell版、固定GUIコピーのhashが一致した。
- 証跡は`.artifacts/about-panel-08613/`のreview、758入力のinputs-before-final/inputs-finalとinput-verification、environment、コマンド別JSON/完全log、package-verification、evidence-hashes、cleanup。新規CSS・検証スクリプトも入力へ含めた。最終About画像/測定は`.artifacts/about-ui-1792862406332/`、共通設定は`.artifacts/settings-usability-1792862434454/`、URLは`.artifacts/settings-url-1792862548598/`、smokeは`.artifacts/smoke-1792862585083/`。証跡と種類/実行方式別の直近3回、失敗調査、他作業との参照/所有関係が不明な旧資料を保持し、削除0件。今回の実装は未コミット。

## 2026-10-25: 設定UI 0.86.9〜0.86.12のコミット前照合

- main `13ce177`上の32ファイルを対象として実装差分と影響先を再レビューし、追加修正を要する指摘なし。stage前に実効author/committerとremote設定を確認した。新しいAbout画面の実装はこのコミットの後に分離する。
- 0.86.12の686入力、完全ログ・記録のhash、固定EXE/feed/GUIコピーを照合。型/build・固定GUI4系統65群・smokeの成功を再利用した。旧標準回帰874件の入力とも比較し、差分はrenderer・UI文言・検証スクリプト・版・文書に限定された。
- 現行の翻訳/設定ナビゲーション10件を再利用。CSSを直接読むappearance 7件と、再発行でhashが変わったnative生成物を読む3ファイル7件を追加し、全件成功した。nativeのソース/SDK契約は不変で、SDKのInformationalVersionは現在のHEADを含む。残る850件の標準成功を再利用し、**標準112ファイル・874/874、fail/skip 0**を確認した。製品コードや版は修正せず、再発行していない。
- 証跡は`.artifacts/commit-validation-settings-ui-08612/`のaudit/reuse、delta-from-standard、追加試験JSON/完全log、stage/commit。標準の再利用元は`.artifacts/commit-validation-gesture-labels-0868/`と`.artifacts/touchpad-labels-20261025/`、UIの再利用元は`.artifacts/settings-list-08611/`・`settings-list-08612/`。既存の参照資料を保持し、push/Release/実利用先deployは行わない。

## 2026-10-25: 一覧ヘッダー・固定フィルターと説明の整理 0.86.12

- main `13ce177`上で0.86.9〜0.86.10の未コミット変更を保持して追加修正。dirty状態のpull/stash/branch変更・commitは行わず、Fluid worktreeは変更していない。前回入力は`.artifacts/settings-ui-08610/inputs-final.json`、今回の差分レビュー/入力一覧は`.artifacts/settings-list-08611/`と`settings-list-08612/`へ記録した。
- Applet管理・ショートカット・マウス/タッチパッドジェスチャー・カスタムコマンド・Webアカウントが使う共通固定フィルターの下端罫線を除去。背景・sticky位置・横スクロールとの連動を保持した。Webアカウントの使用中/削除/クリアの説明はページ最上部の説明へ統合し、一覧直上の重複段落を削除した。使用中の削除ガードや確認ダイアログは変更なし。
- Applet管理・AI・MCPクライアントの順番変更ボタンを、名前列ヘッダーの追加ボタン直後へ移動。`SettingsListTable.orderInTitle`を追加し、`onOrder`省略時は順番変更を表示しない。ショートカット・両ジェスチャー・カスタムコマンドのフィルターにある順序変更ボタンと専用の未使用UI接続を除去した。各割り当て行の実行順操作と、保存済みの順序・公開APIは保持した。
- ショートカット/マウスジェスチャーの「動作設定」Sectionだけhintを除去し、Field単位のhintは保持。「Windowsとの接続」は初期状態で閉じた共通Sectionへ変更し、開くと全10種類の接続キー・修飾キー・Windows設定ボタンを表示する。共通の設定アンカーを保持した。レイアウト追加規則と現構成を設定基盤・一覧編集・タッチパッド設計へ反映した。
- 型検査/build・固定lockfileの依存同期は終了0。翻訳/設定ナビゲーションは **10/10（fail/skip 0）**。0.86.11ではソースと固定EXEで一覧操作12群・スクロール38群・Webアカウント7群・配置8群とsmokeが成功。その後の目視確認で狭幅AIヘッダーの「サーバー」の折り返しを見つけ、共通ヘッダーのnowrapとAIの内容に応じた列幅へ追加修正した。再レビュー・型検査/build・ソースGUI12群・画像確認後に、規定どおりパッチを進めて **0.86.12**を発行した。
- 最終固定EXEでも **一覧操作12群・スクロール38群・Webアカウント7群・配置8群、計4系統65群** とsmoke（ok=true）が成功。明暗/1280・760幅、名前と2ボタンの一行配置・セル内収まり、移した操作の起動/取消、各行の実行順・検索/絞り込み/横スクロール、折りたたみの初期状態、Webアカウントの変更/確認/実プロセス再起動を隔離fixtureで検証した。最終画像も目視確認した。
- 0.86.11以降の4入力差分はpackageの版、GUI検証、renderer CSS 2ファイルのみ。翻訳/カタログ/単体試験/依存が不変な10件はhash差分を照合して再利用した。全標準回帰と実タッチパッド/実Windows設定変更・実アカウント・実利用先の確認は未実行。設定モデル・保存形式・公開API・入力処理の変更を含まないためパッチ更新とした。
- `publish.bat`終了0。本体/EXE/Default Shell/feedは **0.86.12**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は170,683,530 bytes、SHA256 `c462f21814e4e743cb16473bb2f01f001c6aaf999757f6212907d610302e1a0c`。feedのsize/hashと各固定GUIコピーが一致した。
- 証跡は`.artifacts/settings-list-08612/`のreview/reuse、changed-inputs-since-08611、686入力のinputs-final/input-verification、コマンド別JSON/完全log、package-verification、evidence-hashes。初期変更・0.86.11の証跡は`.artifacts/settings-list-08611/`へ保持。最終画像/測定は`.artifacts/settings-hints-ui-1792859937761/`、`-1792859971768/`、`-1792860013324/`、配置は`.artifacts/settings-layout-1792860043707/`、smokeは`.artifacts/smoke-1792860060424/`。今回の成功は種類/実行方式別の直近3回と参照用証跡を保持し、他作業との共有/参照関係が不明な旧資料も保持。削除0件。未コミット、push/Release/実利用先deployなし。

## 2026-10-25: mainの設定インデックスとSection配置整理 0.86.10

- main `13ce177`上で、前回0.86.9の未コミット変更を保持して追加修正した。開始差分は`.artifacts/settings-ui-08610/baseline.patch`。dirty状態のpull/stash/branch変更は行わず、Fluid worktreeは変更していない。
- インデックスの通常項目・検索結果のフォーカス枠をボタン内側へ配置し、スクロール枠による欠けを解消。キーボードTabによるfocus-visibleを実際に発生させ、枠がボタン内に収まることを検査・目視確認した。
- 操作の許可はテーブル→「許可の適用とログについて」の順。通知は提供元別の種類→利用できない種類（存在時）→読み上げ→通知の受け取り方の順。表示時間とMCP連携の説明・設定リンクを受け取り方へ統合し、Windows通知の説明とMCPの接続条件の重複をまとめた。旧表示時間/MCP Eventの独立Sectionは削除した。
- タッチパッドは先頭の折りたたみ「動作設定」の最初に有効スイッチを配置。「Windowsとの接続」へ全10種類の接続キーと40個の修飾キーチェックをまとめ、Windows設定ボタンを共通Fieldへ配置。元の設定アンカー・即時保存・操作ハンドラーを保持した。共通指針/設定基盤/タッチパッド設計を現構成へ更新した。
- 型検査/build、固定lockfileの依存同期は終了0。翻訳・設定ナビゲーション・タッチパッドの模擬回帰は **18/18（fail/skip 0）**。設定モデル・保存形式・公開API・OS入力処理に変更なしの表示整理としてパッチ更新した。全標準回帰は未実行。
- 発行前レビューで未解決指摘なし。既存GUIのページ移動前の検索解除、本文内スクロールに対する旧フレーム判定、許可説明の旧配置期待を修正して再検証した。初回失敗ログは保存。ソースGUI3系統成功後に発行し、固定EXEでも`settings-layout-ui-test` **8群**、`settings-usability-ui-test` **9群**、`settings-layout-refinements-ui-test` **8群**、smoke（ok=true）が成功した。移動後のリンク/保存、閉じた設定への検索移動、明暗/1280・760幅、接続キーの折り返し・ページ外への横はみ出しなしを確認した。Pause/F13〜F24をOSへ送信・登録する実入力試験は行っていない。既存`touchpad-ui-test`の変更は構文検査のみ。実タッチパッド/Windows設定の書き換え・実サービス/実利用先では未確認。
- 本体/EXE/Default Shell/feedは **0.86.10**。`publish.bat`終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は170,676,501 bytes、SHA256 `c2f0ebfe9442334563570f38dfa20040b4dafcb0699f7c2b092b237bfb3d36d0`。feedのsize/hash、固定GUIのコピーと一致した。
- 証跡は`.artifacts/settings-ui-08610/`のbaseline、inputs-before/final（686入力）、input-verification、review、environment、コマンド別JSON/完全log、package-verification、evidence-hashes。固定GUI画像・測定は`.artifacts/settings-layout-1792858235647/`、`.artifacts/settings-usability-1792858252877/`、`.artifacts/settings-layout-refinements-ui-1792858274664/`。成功試験は種別/実行方式別の直近3回を保持し、今回の失敗調査と過去資料の参照/所有状況未確認分も保持。削除0件。未コミット、push/Release/実利用先deployなし。

## 2026-10-25: SettingsFieldタイトルの縦中央配置 0.86.9

- main `13ce177`のclean状態と追跡先origin/mainを確認し、通常ユーザー環境の`pull --ff-only`で最新取得済み。別worktreeのFluid UIは変更せず、既存のnative共通部品だけを修正した。
- タイトルの上8pxの固定余白を取り除き、タイトル・ヒントの共通行を最小32pxに統一。20pxのスイッチには上下6pxを確保し、入力行と中心をそろえた。説明文や複数行入力全体には中央寄せせず、wide・読み取り専用・狭い幅の縦積みではタイトルの最小高さを解除する。個別ページ、設定・保存ファイル・公開API・入力イベントは変更なし。配置の追加ルールを共通レイアウト指針へ記載した。
- 固定lockfileの依存同期後、型検査/buildは終了0。版更新直後の型検査は依存構造記録不一致で実行前に停止し、`install --frozen-lockfile`で同期後に同じ検査が成功した。依存版・lockfile・供給網検査は維持した。
- 発行前に差分と影響先を自己レビューし、未解決指摘なし。既存`settings-layout-refinements-ui-test.cjs`はソース版・固定EXEの各8群が成功。明暗テーマ、1280/760幅、グループ名、説明・通知・権限・AIダイアログ、ヒントOFF、入力確定・取消・保存を確認した。CSS変更のため無関係な全標準回帰は実行していない。
- `publish.bat`終了0。発行したEXEを隔離profileへコピーし、SHA256一致を確認して「音の再生」を測定。明暗ともタイトルとスイッチの中心差は約0.00001 CSS px、ヒントは0px。狭い幅で縦積み・タイトル最小高さ0pxを確認し、スクリーンショットを目視確認した。固定EXEのsmokeも終了0・ok=true。
- 本体/EXE/Default Shell/feedは **0.86.9**。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は170,677,596 bytes、SHA256 `bca6fd435bd291e004aa49db3ae6a0aa44cb30024a985d6b88d4676c46cd0ef4`。feedのsize/hashと一致。通常の表示修正としてパッチ更新した。
- 証跡は`.artifacts/settings-field-title-0869/`のinputs-before/input-verification（686入力が検証前後一致）、review、コマンド別JSON/完全log、title-result、明暗/狭幅画像、package-verification、evidence-hashes。既存GUIのprofileは`.artifacts/settings-layout-refinements-ui-1792856786052/`と`-1792857017264/`、smokeは`.artifacts/smoke-1792857047620/`。未コミット、push/Release/実利用先deployなし。

## 2026-10-25: ジェスチャー表記・表示順0.86.8のコミット前照合

- 0.86.6〜0.86.8の表記統一と割り当て表示順に関する13ファイルを再レビューし、追加修正を要する指摘なし。実効author/committerとGitHub/AQUA両mainの開始先端`865e0240993eaf80eb132118aaf301d3001d56d2`を確認した。
- 実装時の756入力、228生成物、602 native出力、完全ログ15件、発行EXE/feedと固定GUI/smokeコピーのSHA256を現在の内容へ照合し、文書追記以外の差分なし。型検査/build、関連4ファイル48件、固定EXEのジェスチャー編集GUI・両表示順/絞り込みGUI・smokeの成功を再利用した。
- 未確認だった標準回帰108ファイル826件を追加し、再利用48件と合わせて **標準112ファイル・874/874成功、fail/skip 0**。共有ジェスチャー/翻訳グラフの変更に対する不足分だけを補い、確認済みの48件とGUIは再実行していない。製品ソース・版・発行物は変更せず、0.86.8を維持した。
- 証跡は`.artifacts/commit-validation-gesture-labels-0868/`のreuse.json、additional.json/log、stage.json、commit.json、push.json。stage/作業ファイル・最終commit tree・送信先mainを照合する。実装時の検証資料を保持し、Release/実利用先deployは行わない。

## 2026-10-25: タッチパッド表記と両ジェスチャーの割り当て表示順 0.86.8

- main `865e024`上の前回0.86.7までの未コミット変更を保持して追加修正した。開始差分と756入力は`.artifacts/touchpad-labels-20261025/baseline.patch`・`baseline-inputs.json`へ保存し、変更のある作業ツリーのpull/stash/branch変更は行っていない。
- 3本指/4本指のタップ・上下左右、計10種類を`3本指: 左`、`4本指: タップ`のようにコロンと半角空白で区切る表記へ統一。本体の既存翻訳キーの値を更新し、割り当てマーク・編集候補・実行順・接続設定が使う共通カタログへ反映した。固定ID・Windows接続キー・設定/保存ファイル/公開APIは変更していない。
- 同じコマンド内の割り当て表示を、マウスは1段階移動、2段階移動、クリック、ホイール、キーの順へ変更。タッチパッドは3本指、4本指の順、各タップ、上、下、左、右の順とした。rendererで共通カタログに沿った表示配列を作り、追加/編集/削除/実行順の処理には元の保存配列を渡す。同じ入力の複数行も元の順番を保つ。表示のための保存・移行・実行順変更はない。通常の表示修正として発行済み0.86.7からパッチ更新した。
- 発行前の差分/影響先の自己レビューで未解決指摘なし。固定lockfileのinstall、最終型検査、本体/Default Shell buildが終了0。関連4ファイルの回帰は **48/48（fail/skip 0）**。最後の追加指定ではrenderer/GUI検査/文書だけを変更し、共有処理・回帰試験の入力が不変な48件の成功を再利用した。依存版・lockfileは変更していない。
- 最終ソース版と固定EXEの設定GUI各12群で、新表記のマーク/絞り込み、意図的に混ぜた保存配列から指定順への表示、同入力の行順保持、表示前後の設定値/revision不変を確認。10種類を含むタッチパッド一覧とマウス一覧の画像を目視した。固定EXEのジェスチャー編集GUIも成功し、追加/再編集/取消/競合/実行順/保存/実プロセス再起動を検査。smokeも成功した。`touchpad-ui-test.cjs`の旧表記期待値は更新したが、同試験は実F13/F18を登録するため実行せず、無効な割り当てを使う隔離GUIを選んだ。物理マウス/指の操作、Windows設定変更、Pause/F13〜F24送信・登録、UAC/ロック画面の実入力は検証していない。
- `publish.bat`終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **0.86.8 / 170,683,419 bytes / SHA256 `3f93dc8e7c527247900be2accc9e2e727b7c2fe998b9b5bbccd3ad6f0dde6646`**。EXE FileVersion/ProductVersion・feed・同梱package/Default Shell、固定GUI/smokeコピーが一致。同梱228生成ファイルと602 native出力、756検証入力を照合し、検証後の変更は本検証文書だけとする。
- 証跡は`.artifacts/touchpad-labels-20261025/`のreview、入力manifest、コマンド別JSON/完全log、package-verification、file-version、validation、cleanup。今回の隔離profileの稼働プロセス0を確認し、現在の証跡と過去の参照/所有状況が未確認の資料を保持、削除0件。変更は未コミット、push/Release/実利用先deployなし。

## 2026-10-25: マウスジェスチャー表記の種類プレフィックス 0.86.7

- main `865e024`上の前回0.86.6の未コミット変更を保持して追加修正した。開始時の差分と756入力は`.artifacts/gesture-prefix-labels-20261025/baseline.patch`・`baseline-inputs.json`へ保存。作業ツリーに変更があるためpull/stash/branch変更は行っていない。
- 共通カタログの表記を`移動: 上`、`移動: 上, 下`、`クリック: 左`、`クリック: 中`、`ホイール: 上`、`ホイール: 下`、`キー: F1`に統一した。コロン・カンマの後ろは半角空白、2段階の種類名は先頭に1回だけとする。表示全体の翻訳テンプレートを使い、移動方向選択の短い方向名は独立して維持した。割り当てマーク・絞り込み・編集候補・実行順は共通カタログから取得する。保存ID/設定/ファイル/公開API/入力認識の変更を伴わないため、発行済み0.86.6からパッチ更新した。
- 発行前の自己レビューで未解決指摘なし。固定lockfileのinstall、型検査、本体/Default Shell build、関連4ファイルの回帰 **48/48（fail/skip 0）** が成功。依存版・lockfileを変更していない。既存GUI試験の表記期待値を更新し、移動・クリック・ホイールの選択、新マークの完全一致、実行順のラベルを確認した。
- ソース版と固定EXEの隔離GUIで、追加/再編集/取消/競合・実行順・設定保存・実プロセス再起動後の保持、明暗と1280/900/700pxを確認。固定EXEのマーク絞り込みGUI10群とsmokeも成功した。`移動: 上, 下`のマーク画像を目視確認し、文字の欠けを認めなかった。実入力注入はUI-onlyで省略し、物理マウス/UAC/ロック画面の実機確認とは区別する。
- `publish.bat`終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **0.86.7 / 170,686,384 bytes / SHA256 `5cb8809a23ff621a65479686aa9cd240ac605e0e743896ee56225117fa1671fe`**。EXE FileVersion/ProductVersion・feed・同梱package/Default Shellと固定GUI/smokeコピーが一致。同梱228生成ファイルと602 native出力、756検証入力を照合し、検証後の変更は本検証文書だけとする。
- 正本の証跡は`.artifacts/gesture-prefix-labels-20261025/`のreview、入力manifest、コマンド別JSON/完全log、package-verification、file-version、validation、cleanup。今回の隔離profileに対応する稼働プロセス0を確認。今回と過去の参照/所有状況が未確認の資料を保持し、削除0件。変更は未コミット、push/Release/実利用先deployなし。

## 2026-10-24: 移動ジェスチャーの割り当て表記 0.86.6

- cleanなmain `865e024`から開始し、`git pull --ff-only`で追跡先と最新一致を確認。1段階を`上`、2段階を`上, 下`のように方向名だけで表示し、移動方向と区切りの矢印を混同しない表記へ変更した。既存の本体翻訳リソースの方向名と、新設の`settings.gestures.movementSequence`テンプレートを使用する。対応言語は既存の日本語のみ。
- 共通カタログを使う割り当てマーク・絞り込み・実行順の選択肢へ反映。編集画面の方向ボタンは矢印アイコンを方向IDから取得し、翻訳文字列の先頭切り出しを廃止した。保存ID、設定項目、保存ファイル、公開API、入力認識を変更しない表示修正として、0.86.5からパッチ更新した。
- 発行前に差分と共有カタログの参照先を自己レビューし、未解決指摘なし。固定lockfileのinstall、型検査、本体/Default Shell build、関連4ファイルの回帰 **48/48（fail/skip 0）** が成功。最初の型検査はworkspace情報の再同期を要求されたため、既存の供給網検査を維持したinstall後に成功した。依存版・lockfileは変更していない。
- ソース版と固定EXEの隔離GUIで、`右, 上`の追加と`上, 下`への再編集、実行順のラベル・件数表示、方向ボタンの名前・同方向禁止、保存/取消/競合、明暗と1280/900/700px、実プロセス再起動後の保持を確認した。固定EXEのマーク絞り込みGUI10群とsmokeも成功し、マークによる絞り込みが保存状態やコマンド実行を変えないことを確認。方向ボタンと絞り込み画面の画像を目視した。入力注入はUI-onlyとして省略し、物理マウス・UAC・ロック画面の実入力検証とは扱わない。
- GUIの初回失敗は実行順選択肢の既存件数接尾辞を期待値から落とした試験側の問題で、件数を含めて修正後に成功。ASAR照合の初回失敗も検証側のWindowsパス区切りを修正して解消し、各失敗ログを保持した。発行の自動承認レビューは外部公開/配置の可能性を理由に一度拒否したが、呼出先の`publish: 'never'`とローカルpack・配置スクリプトのコピーだけであることを確認して同一処理を再申請し、実行許可後に成功した。
- `publish.bat`終了0。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は **0.86.6 / 170,677,345 bytes / SHA256 `de42d2658f44a08c9056f5e3d7e6eefc3c8c5e62f95dea484b85314a782e1135`**。EXEのFileVersion/ProductVersion、feed、同梱package/Default Shell、固定GUIのEXEコピーが一致。同梱228生成ファイル、602 native出力、756検証入力のSHA256一致を確認した。発行後の製品ソース変更なし。
- 証跡は`.artifacts/gesture-labels-20261024/`の入力manifest、review、コマンド別JSON/完全log、package-verification、file-version、validation、cleanup。今回の隔離profileに対応する稼働プロセス0。現在の証跡と、他作業の参照確認が未完了の過去資料は保持し、削除0件。コミット・push・Release・実利用先deployは行っていない。

## 2026-10-24: Fluidを含めずWebApplet設定基盤をmainへ移植 0.86.5

- cleanな本体main`63ca00a`とWebApplet main`ef4ecf7`を各追跡先からff-only取得し、更新なし。Fluid側`e8494b9`の宣言型一覧ダイアログの機能差分と、WebApplet `fb48e89`の管理ページ削除・設定集約を選択した。ブランチ全体のmerge/cherry-pickはせず、3方向比較でmainのnative部品を維持した。本体の元のUI・配色・密度・レイアウト・フォーカス、Select/Input/パレット、CSSなど31ファイルと依存・ビルド設定のハッシュが不変。Fluidのコード/依存/ビルド、後続の見た目調整、設定専用倍率は移植していない。
- 共通`list.draftAction`の宣言・検証、現在のAppletへ束縛したpage.action呼び出し、runtime交代の拒否、手動/取得中の入力を保つ推奨値合成、取消/画面変更後の応答破棄、画像の一時プレビューとOK時だけのimportを移植した。画像選択・一覧/ダイアログ/ナビゲーションには非表示の安定test IDだけを補い、既存のタグとクラス・操作契約を維持した。設定/保存ファイルの追加・移行はなく、本体mainは通常パッチ0.86.5。SDK宣言の最低対応版も0.86.5へ接続し、WebAppletは既に発行済みの0.4.0から0.4.1、minimumHostVersionは0.86.5とした。Default Shellのソース版0.0.0は変更せず、既存buildが同梱版0.86.5を生成する。
- 発行前レビューの未解決指摘なし。通常ユーザー環境で固定Node 24.22.1/pnpm 12.10.1のfrozen install・型検査・build・fixture build・WebApplet buildが成功。本体標準874/874、WebApplet単体2/2が成功。ソースGUIは設定一覧5、推奨取得/遠隔ページ8、動的ページ4の17群が成功した。新しい見た目・寸法・色・配置・画像比較assertは追加していない。
- 両publish終了0。最終固定EXEは設定一覧5群、推奨取得/画像/実プロセス再起動8群、画像ライブラリ9群、smokeが成功した。取消では設定と画像を保存せず、OKでだけ登録し、手入力・未確定入力・選択済み画像・旧icon・保存済みサイトID・アカウント名簿・Cookieを維持する。追加/編集/削除/順序/競合/フォーカス、共通画像選択、リモートページのbridge非公開、親停止時の破棄も確認した。固定profileは`web-list-ui-1792849177459`、`web-portable-1792849194462`、`image-library-ui-1792849485724`、`smoke-1792849523653`。ソースは`web-list-ui-1792848815545`、`web-portable-1792848820996`、`dynamic-pages-ui-1792848826589`。
- 画像ライブラリの初回試験は、mainで既に本体内表示となった画面を古い`/image-library.html`として待って失敗した。`image-library-ui-1792849224657`と失敗ログを保持し、試験の画面検出だけをsnapshot.navigation.routeと本体hostへ接続して再実行した。登録/選択/保存のassertは維持し、製品や配布物は変更していない。発行後の非同梱GUIスクリプト修正であり、これを参照しない874単体と他の成功GUIは入力を照合して再利用した。対象画像GUI9群と未実行smokeは同じEXEで成功した。
- EXE/FileVersion/ProductVersion/feed/同梱Default Shellは0.86.5で一致。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は170,681,235 bytes / SHA256 `c5ff249d053754066906497cec33e95922e5de3d6310ee065c57297c0bf18ffc`、ASAR `d3f02d6bfb5854cb02b4ec320406f59297263f30f18fe259a5e40e38d4ae0cfc`。out 228ファイルとwin-unpackedを照合した。WebApplet ZIPは5,427 bytes / SHA256 `e68b02a0024dd60e562141ca3c1c8941266b4fa4a8525288635a3830b68416d6`。版/minimumHost、runtime4ファイル、MIT License、既知の旧管理資産が含まれないことを照合した。
- 証跡は`.artifacts/web-settings-port/`のbaseline/web-baseline/extraction/review、各build/unit/source-gui/publish/fixed/fixed-remainingのJSON・入力manifest・完全log、package/verification.json、file-version.json、final-validation.json、cleanup-audit.json、commit-validation.json。画像試験修正以外の発行後差分は検証文書のみとする。実利用先・認証・実サービス・実キー/Pause/F13～F24登録や物理タッチの確認ではなく、隔離fixture/loopbackである。
- 元のFluid worktreeのHEADと未commit11ファイル、WebAppletのcodex/fluid-ui、試行06a6265を保持した。GitHub/AQUA本体mainは開始時63ca00a。WebAppletはGitHub main ef4ecf7、AQUA main 28476bc（前者に含まれる既存の差）を確認し、remoteを変更していない。ローカルmainのstage/commit treeと実効identityを別記録へ照合する。push・Release・実利用先deployは行わない。古い成功profile62件を、終了/成功・絶対パス・リンクなし・参照なしを確認して削除し、直近3回と参照/失敗/固定証跡48件を保持した。削除名とsuccess proofはcleanup-results、整理前後はcleanup-audit-before/cleanup-auditへ記録する。今回のprofile参照プロセスは0。

## 2026-10-24: 本体レビュー0.86.4のコミット・プッシュ前照合

- 実装時からの697入力、226生成物、完全ログ45件、発行EXEと固定GUI2種/smokeコピーのSHA256一致を確認した。型検査/build、標準866/866、固定EXE GUI9+7群、模擬native10件とsmokeの成功を再利用。製品修正・版更新・再発行は行わない。証跡は`.artifacts/commit-validation-host-review-0864/reuse.json`。
- 対象14ファイルを再確認し、追加修正を要する指摘なし。実効author/committerとGitHub/AQUA両mainの先端`15da4c5`を確認した。stage/作業ファイル・commit tree・送信先mainの一致は同ディレクトリの`stage.json`、`commit.json`、`push.json`へ記録する。検証資料は保持し、Release/実利用deployは行わない。

## 2026-10-24: 本体全体レビュー・最新mainとの統合 0.86.4

- `cd42150`の本体をmain/core、renderer/設定UI、shared/preload/Shell、.NET入力/Runtime/更新helper、ビルド/配布処理に分けてレビューした。途中の続行依頼でoriginをfetchし、ローカル修正と未追跡ファイルを退避して`git pull --ff-only`、最新`15da4c5`（Webアカウント一覧の共通化）へ更新後、競合なく適用した。統合前の全差分は`.artifacts/host-review-20261024/pre-merge-full.patch`へ保持。コミット・pushは行っていない。
- 修正は5点。古い設定画面の非同期コールバックが後から届いた値を比較元にして上書きする問題、停止タイムアウト後の旧Appletプロセスのexit/error/出力が再起動先へ作用する問題、名簿保存途中に同期されたWebアカウント名簿を上書きする競合、取消済みAIモデル一覧の再取得と旧要求の終了処理が新要求へ干渉する問題、キー解放のないPauseイベント列で押下ラッチが残る問題に対応した。
- 設定クライアントは入力時点の保存値とrevisionを捕捉し、待ち行列中の自分の成功差分だけを後続入力の比較元へ反映する。外部からマージされた値と失敗中の表示値を比較元へ混ぜず、フォーム/JSONの連続・交互完了、同一項目の競合、不正入力の修正、リサイズ後の再編集を15件で確認した。待ち行列が空になれば成功差分履歴を破棄する。
- フォルダー一覧部品の候補修正は、唯一の呼び出し元が既に関数型の更新で最新のダイアログ入力を維持していることを確認して除外した。追加GUI試験のtop-level string-listは現行manifestで許可されない定義だったため、その失敗を製品不具合として扱わず、試験コードも除外。失敗資料は保持した。
- 先行実入力試験で通常Pauseが窓へ届かなかった件は、利用者がPauseをブロックしていたと確認した。この失敗を製品修正の根拠にしない。実入力の追加fixtureを、`InputTests --gesture-key-state <InputHost.dll>`のメモリー上のフックハンドラー呼び出しへ置換した。修正前の隔離DLLではラッチが残る検査で失敗（期待終了1）、修正後/発行同梱DLLでは10/10成功。OSフック登録・SendInput・前面変更・メッセージポンプなし。利用者の指定以降、Pause/F13〜F24の実キー送信・登録は行っていない。継続ルールを本体AGENTSへ追記した。
- 設定・保存ファイル・公開APIの追加/削除を伴わない修正のため、取り込んだ0.86.3から0.86.4へパッチ更新した。固定lockfileで依存状態を同期し、既存の供給網検査を保持。依存版・lockfile・toolchainは変更していない。制限環境のDNS/.NET/Electron起動などの失敗は資料を保持し、必要な同一処理を通常ユーザーの実行環境で確認した。追加native fixtureの不足import、隔離した修正前ビルドの共通props参照、ASAR照合のWindows区切りとbuilderのpackage変換は検証側で修正し、製品の変更へ含めていない。
- 最終型検査/build、標準回帰866/866（失敗・skip 0）、開発版設定入力GUI9群、固定EXEの設定入力9群・Webアカウント7群・smokeが成功。入力確定/取消・不完全数値・IME、名簿操作/警告確認・参照中ガード・明暗/狭幅・実プロセス再起動後の保持を検査し、画像も目視確認した。確認画面の応答はfixture。最終697入力の試験前後SHA256一致、同梱生成207ファイルとInputHost DLLのビルド出力一致を確認。完全ログ・入力hash・結果の正本は`.artifacts/host-review-20261024/validation.json`、`package-verification.json`。
- 最初の発行前停止指定は、続行中の利用者による発行許可で変更された。`publish.bat`成功。`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`は170,673,006 bytes、SHA256 `6d917e25ccc3801ca1a25b7442373d753feabaa3ee1d4126cf907226599af021`。EXEのFileVersion/ProductVersion、feed、同梱package/Default Shellは0.86.4で一致し、固定GUI2種/smokeのEXEコピーも同一hash。配置用ファイル4件を保持した。
- 今回の試験プロセス0を確認。今回の証跡、過去の参照資料、状態/所有者不明の22フォルダーを保持し、試験ディレクトリの削除0件。作業用stashは全差分を上記patchへ保存してから解除した。実サービスのAI/認証・複数PCの実同期・物理Pause/F13〜F24の動作は未検証。未変更Appletの再発行・全体ZIP作成・commit/push/Release/実利用deployなし。

## 2026-10-24: Webアカウント設定0.86.3のコミット・プッシュ前照合

- 実装時の653入力・完全ログ15件と現在のSHA256一致、発行EXEとGUI2種/smokeコピーの一致を確認し、型検査/build・関連26件・固定EXE GUI7+10群・smokeの成功を再利用した。未実行だった残りの標準回帰825件を通常権限で追加実行し、合計851/851成功、fail/skip 0。実装時からの製品変更・版更新・再発行なし。
- 対象12ファイルを再レビューし、追加指摘なし。実効author/committerとGitHub/AQUA両mainの開始時先端`cd42150200470d879bb8625d519598ea7c2aa447`を確認した。stage/作業ファイル・最終tree・commitと送信先mainの照合は`.artifacts/commit-validation-web-account-list-0863/`へ記録する。実装時の資料と今回の回帰ログは保持する。GitHub Release/実利用deployは行わない。

## 2026-10-24: Webアカウント設定の共通一覧化 0.86.3

- cleanなmain `cd42150`から開始し、`git pull --ff-only`で最新一致。設定・保存ファイル・公開APIの変更を伴わないレイアウト変更のため0.86.2→0.86.3へパッチ更新した。今回分は未commit、push/Release/実利用deployなし。
- アカウントごとの独自カードを「名前・使用先・操作」の3列へ変更。件数・上限、見出し横の共通＋、32pxのクリア/削除アイコンを配置し、名前のblur/Enter確定・Escape取消・IME/二重送信抑制、使用中の削除禁止、ホストの警告確認と保存処理を保持した。既存SettingsListTableの表枠をSettingsListLayoutとして共用し、使用先の折り返しと入力幅を共通CSSへ集約。重要な説明と共通エラー領域を維持した。追加ルールはdocs/settings-list-editing.md、利用仕様はdocs/web-applets.md。
- 発行前自己レビューを1回実施。折り返し指定が後続のnowrap指定に上書きされる問題を修正し、長い使用先名のGUIで再確認した。未解決の製品差分指摘なし。型検査/build、関連回帰26/26（WebProfileStore、PageCollection、設定編集、object-list、翻訳）成功。標準全回帰は表示変更に対する実装段階の範囲として未実行。
- 隔離したソースGUIでWebアカウント7群と既存一覧10群が成功。発行EXEでもWebアカウント7群、共通一覧10群、smoke成功。明暗・通常/最小幅（1280/760指定、ウィンドウの最小幅制約あり）・ヒントON/OFF、長い名前/使用先、空/32枠上限、Enter/blur/Escape/IME、不正入力保持とエラー時の配置、参照中ガード、クリア/削除の取消/確定、実プロセス再起動後のID/名前保持を確認。画像も目視確認した。renderer error 0。確認画面の応答はfixtureで与えたもので、Windowsネイティブ画面の物理操作・実ログインは未検証。
- 固定EXEの最初の2回は、サイズ変更のviewport操作と試験の設定変更が重なりrevision競合を検出した。試験側だけを、名前確定後のflush、表示ページからのテーマ変更、リサイズ後のhostWidth投影一致待ちへ修正し、同じEXEで再検証して成功。発行後の製品変更はない。途中の失敗ログも保持した。制限内のDNS・一時ファイル置換EPERM・GUI接続EACCES・依存確認停止は、同じ処理を通常権限で実行して確認した。依存版/lockfile/供給網検査は維持。
- `publish.bat`成功。EXEのFileVersion/ProductVersion、update.json、同梱package/Default Shellは0.86.3。170,670,769 bytes、SHA256 `569880f5ef3c87b9e30124d149b0a47987ee5c00b0d6deb5809c210760460714`。GUI2種とsmokeコピーの一致、同梱日本語JSONとソース一致、653入力の最終hashを確認。証跡は`.artifacts/web-account-list-20261024/validation.json`、review.json、完全ログ。固定GUIは`.artifacts/settings-hints-ui-1792773000143/`と`settings-hints-ui-1792773030646/`、smokeは`.artifacts/smoke-1792773062333/`。
- テストランナーの終了を確認。今回の成功/失敗profileは検証資料として保持し、既存の関連24資料は他作業の使用状況・再利用保護を未確認のため自動削除せず、削除0件。確認結果と一覧はcleanup.json/cleanup-inventory.jsonへ記録した。

## 2026-10-24: 共通処理翻訳0.86.2のコミット前照合

- 実装時と現在の686入力、完全ログ10件、native出力2件、固定EXE/同梱日本語JSON/Default Shell、GUI・smokeコピーのSHA256一致を確認した。型検査/build、最終標準851件、固定EXEの設定翻訳GUI7群・共通サービスGUI4群・smokeの成功を再利用。途中段階の対象37件は最終851件に包含されるため、最終ソースの証明には使わない。
- 実装後の製品変更なし。追加はこの検証記録だけで、版更新・再発行・回帰再実行は行わない。レビューの未解決指摘なし、対象108ファイルと実効author/committer、stage/作業ツリーの一致を確認する。照合・stage/commit tree・commit SHAの正本は`.artifacts/commit-validation-localization-0862/reuse.json`。push/Release/deployは行わない。

## 2026-10-24: 共通サービス結果・標準ダイアログの日本語リソース移行 0.86.2

- 先行0.86.1の685入力・完全ログ・固定EXE/同梱JSONを照合し、標準848件とGUIの成功を再利用して`3de77a6`へコミット。87ファイルのstage/commit tree一致を確認した。証跡は`.artifacts/commit-validation-localization-0861/reuse.json`。その後cleanなmainで`git pull --ff-only`は最新一致。今回0.86.2分は未commit。
- 本体TypeScriptの共通サービスと共有検証100モジュールを移行。AI/MCP/TTS、音声、更新、Applet管理、設定保存/復旧、Webアカウント、画像、通知、Shell/入力/コマンドの結果・状態説明、および本体標準ダイアログの本文/説明/ボタン/画像フィルターをJSONへ抽出した。日本語リソースは1,816→2,897項目。Applet自身の文言と、受け取った名前・OS/外部エラー詳細は無変換。設定項目・保存ファイル・公開操作の変更がないため0.86.2へパッチ更新。
- 発行前自己レビューと修正確認を実施。通知件数、Applet操作、AIエラー、ページ説明、更新要約を文章単位に整理した。保存初期値と旧データの判定を兼ねるWebアカウントの仮名は翻訳辞書から除外し、文言編集が既存データの判定へ影響しないよう維持した。100ソースの非日本語リテラル比較で削除は辞書へ移した`OK`2か所と通知タイトルの区切りだけ。操作ID/エラーコード/権限/ボタン順序/既定・キャンセルIDを保持し、未解決指摘なし。`review.json`/`literal-review.json`参照。
- 型検査/build、最終標準回帰851/851成功（失敗・skip 0）。日本語再混入検査をmain共通サービスへ広げ、差し込み変数の一致、入力名と外部文字列の保持、更新の詳細と安全な通知要約を検査した。686入力の試験前後SHA256一致。固定依存・lockfileを保持し、`install --frozen-lockfile`の408件のsupply-chain検査も成功。制限環境のWindowsファイル操作/Electron/.NET発行失敗はログを保持して同じ処理を通常ユーザーで再実行した。
- 固定EXEの設定翻訳GUI7群成功（`.artifacts/settings-hints-ui-1792770668604/`）。17ページ×明暗×1280/760の68画面、未翻訳キー/横溢れ、先頭の日本語1択、入力保存/検索/JSON拒否、カスタム名、実プロセス再起動を確認。固定EXEの共通サービスGUI4群成功（`.artifacts/settings-hints-ui-1792770710209/`）。ローカルHTTP 401からAI設定画面への日本語エラー表示、アカウント削除/クリアと画像選択のElectronダイアログ引数、取消時の保持と確定時の対象限定を検査した。使用中セッションの削除保留も既存仕様どおり。画面を目視確認し、renderer error 0。ダイアログ応答はfixtureでありWindowsネイティブ画面のレイアウト/物理操作の証明ではない。
- `publish.bat`と固定smoke（`.artifacts/smoke-1792770725044/`）成功。EXEのFileVersion/ProductVersion/feed/Default Shellは0.86.2、170,667,000 bytes、SHA256 `e376baac66911aeeb657771f4d50ae490367810d2a839e011014162a3d19aa6e`。GUI2種/smokeコピーのhashとASAR内日本語JSONのソース一致を確認した。正本は`.artifacts/localization-services-20261024/validation.json`、完全ログ・入力hash・`artifacts.json`。
- 本体rendererの残り、Default Shell固定文言、.NET補助プログラム自身の診断は次段階。Applet翻訳、多言語切替、外部AI/MCP/TTS・実UAC・実入力機器は対象外/未検証。今回のテスト終了処理成功、参照可能な隔離profileプロセス0。既存証跡・不明/失敗資料は保持し、試験ディレクトリ削除0件、今回の使い捨て編集補助4ファイルのみ削除。push/Release/実利用deployなし。

## 2026-10-24: 本体設定画面の日本語リソース移行 0.86.1

- 先行0.86.0を依頼どおり755c6b8へコミットし、stage/commit tree一致を確認。その後cleanなmainでgit pull --ff-onlyは最新一致。今回分は未commit。設定項目・保存ファイル・公開操作の変更を伴わない文言抽出のため0.86.1へパッチ更新した。
- 設定17ページの本文・選択肢・ヒント・検索・アクセシブル名、共通の一覧/編集/並べ替え/確認部品と、共有入力検証・設定操作・一部の設定状態診断をJSONへ移行。日本語リソースは259→1,816項目。カスタムコマンド、リボングループ、接続名、Applet提供文言は入力されたまま表示する。HostMessageは強調等のReact nodeを翻訳後に挿入し、HTMLとして解析しない。現行範囲と残りはdocs/localization.mdに整理。
- 発行前自己レビュー1回と修正確認を実施。文章断片を名前付き差し込みへ統合、表示文字列による分岐を安定したinputKindへ変更、従来の検索文言を保持、未定義になり得る差し込み値を正規化。80ソースのAST比較で既存の非日本語リテラルの削除0件、保存ID/操作IDの保持を確認。未解決指摘なし。review.json/literal-review.jsonを保存。
- 型検査/build、標準回帰848/848成功。設定renderer全体と移行済み共有部品の日本語直書き再混入検査を拡張。685入力の試験前後SHA256一致。バージョン変更後のworkspace検証はinstall --frozen-lockfileで更新し、固定依存・lockfileと408件のsupply-chain検査を維持。制限環境のCOM/ファイル置換、Electron、.NET発行失敗は同じ処理を通常ユーザーで再実行した。
- 固定EXEの翻訳GUI7群成功（.artifacts/settings-hints-ui-1792768204223/）。17ページ×明暗×1280/760の68画面、未翻訳キー/外側の横溢れ、先頭の日本語1択、検索/保存/JSON拒否、実再起動を確認。HTML風文字・{{name}}・$t(...)を含む接続名の確認ダイアログで無変換と取消後の保持も確認。settings.jsonという実ファイル名と翻訳キーの衝突による試験側の誤検出を修正した。
- 固定EXEの一覧操作GUI10群（.artifacts/settings-hints-ui-1792768268820/）成功。8一覧の明暗/狭幅、3入力方式のフィルター、ショートカット/マウスの直接編集・実行順・即時削除・取消・フォーカス、ヒントOFFを検査。renderer error 0。固定smoke（.artifacts/smoke-1792768340693/）も成功。AI/権限/通知/リボンの画像を目視確認した。
- publish.bat成功。固定EXEはFileVersion/ProductVersion/feed/同梱Default Shellとも0.86.1、170,651,295 bytes、SHA256 `8ff4f3056cf0e7e565af3538f570118ea3d0477cb761669b4c7ada237fb6e00e`。GUI2種/smokeコピーのhash、ASAR内日本語JSONとソースの一致を確認。正本は `.artifacts/localization-settings-20261023/validation.json`、完全ログ・入力hash・artifacts.json。
- 共通サービスが返す実行結果/native確認画面と他の本体ページは次段階。Applet自身の翻訳、多言語切替、外部AI/MCP/TTS・実入力機器・実UACの操作は未検証。テスト終了処理成功、参照可能な隔離profileプロセス0。保護すべき既存証跡・不明/失敗資料は保持し、試験ディレクトリ削除0件、今回の使い捨て編集補助6ファイルだけ削除。push/Release/実利用deployなし。

## 2026-10-23: 翻訳基盤0.86.0のコミット前照合

- 実装時の685入力・完全ログ・固定EXE/同梱JSONのSHA256一致を確認し、型検査/build・標準848件・固定EXE GUI6群・smokeの成功を再利用。製品変更・版更新・再発行なし。利用者による動作確認も受領した。
- 対象差分を再確認し、実効author/committer、stageと作業ファイル・commit treeを照合。証跡は `.artifacts/commit-validation-localization-0860/reuse.json`。このコミット後に残りの本体設定文言を移行する。push/Release/実利用deployは行わない。

## 2026-10-23: 本体翻訳基盤・表示/一般設定 0.86.0

- cleanなmain（e6c95db、origin/main追跡）から開始し、git pull --ff-onlyは最新一致。host.language設定追加のため0.85.9→0.86.0。i18next 26.4.7/react-i18next 17.0.19は公開後7日条件を満たす固定版を導入し、既存のsupply-chain検査・固定lockfileを維持。
- 日本語259項目をsrc/shared/locales/ja/host.jsonへ抽出し、表示/一般本文・設定共通部品・検索/ヒント/ダイアログ・関連状態/入力エラーを接続。「表示→共通」の先頭は表示言語、日本語だけ。端末専用・既定ja・既定省略・部分JSON/リセット/公開定義を統合。入力されたコマンド名・リボングループ名・外部文字列は翻訳せず保持。設計と段階移行方針はdocs/localization.md、README不変。
- 発行前自己レビュー1回を実施。インスタンス間の辞書共有を分離し、動的キーの広い型キャストを除去。文言抽出で処理条件・保存ID・Windows操作を変更しないことを確認。新設定の既存期待値2か所と、新GUI試験の検出条件を補正。未解決指摘なし（.artifacts/localization-20261023/review.json）。
- 型検査/build、対象117件、最終標準回帰848/848成功。dev.bat testは前提ビルド後に既存期待値1件で失敗し、期待値更新後のnode --test tests/*.test.cjsで全成功。685入力の前後SHA256一致を記録。制限内の.NET/GUI/COM/ファイル置換失敗は検査を弱めず通常ユーザーで再実行した。
- 固定EXE GUI6群成功（.artifacts/settings-hints-ui-1792765111429/result.json）。先頭位置・日本語1択・検索・即時保存・未対応言語拒否/入力保持・共通ヒント・明暗×1280/760・一般トグル・カスタム名無変換・実プロセス再起動を確認。8画像と通常/狭幅の目視確認、renderer error 0。smoke（.artifacts/smoke-1792765175982/）も成功し、隔離AppDock残存0。実UAC承認・Windowsタスク変更・native復旧ダイアログの実操作は未検証。
- publish.bat成功。A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exeはFileVersion/ProductVersion/feed/同梱Default Shellとも0.86.0、170,638,878 bytes、SHA256 86fa93fa2a2e23c446302ec0367be27467f9ba9124fc73dc3d4d9360edb9c247。GUI/smokeコピーのhash一致とASAR内日本語JSON一致を確認。検証正本: .artifacts/localization-20261023/validation.json、完全ログ・入力hash・artifacts.json。
- 本体の他ページとApplet自身の翻訳、多言語の実切替、日時/地域形式は未対応。commit/push/Release/実利用deployなし。既存証跡・状態不明/失敗資料は保持し、試験フォルダー削除0件。今回作成した使い捨て編集補助5ファイルだけ削除、検証スクリプトと証跡は保持。

対象の現行版は`0.85.9`。以下は記録した条件での検証結果であり、外部サービスや実機条件の現在の動作保証とは区別する。

## 2026-10-23: メディア・音量送信0.85.9のコミット・プッシュ前照合

- main 34c1f14上の先行変更7パスを今回の対象として確認し、未コミット変更を保持した。情報の追加はWindowsTools側の12件descriptionとterminalの実行エイリアス修正で、本体は製品を追加変更していない。実効author/committerとGitHub/AQUA両mainの開始時一致を確認した。
- 前回の入力最終hashと現ソース・型検査/build/関連JS10件・固定EXE・入力7群・smoke・完全ログを照合して再利用。標準109ファイルのうち変更試験はinput-command.testだけ。compiled input-commandへの依存グラフは当該試験だけで、process-launchの6件を含む実装時10件が該当する旧成功を置き換える。他832件は0.85.8の成功と全108試験/関連入力の一致から再利用し、合計 **842件成功・fail/skip 0**。設定/renderer/他サービス/公開API・依存は変えていない。
- SDK parsingはWindowsToolsの42件で新旧キー・記号解決を確認済み。本体を再発行せず、0.85.9 EXE（170,504,756 bytes／SHA256 `39297303f8e28aa28bb7bb2899a0eb96934c224b76118f39d654ef0c1f9c0514`）を維持した。新しいWindowsTools 0.2.4と組み合わせた固定GUI7群は実行し、91件の説明・実Terminal起動と新規窓だけの終了・終了選択画面/取消・設定/API/停止/再起動を確認した。
- 正本: `.artifacts/commit-validation-media-keys-20261023/reuse.json`、前工程 `.artifacts/media-keys-20261023/validation.json`、WindowsTools `.artifacts/commit-validation-system-commands-20261023/validation.json`。stage/commit treeと送信先mainは今回の証跡へ記録。コミット時の製品変更・版更新・再発行なし。GitHub Release・実利用deployなし。再利用/途中失敗/状態不明の資料を保持し、削除0件。

## 2026-10-23: メディア・音量の送信キー追加（0.85.9）

- main 34c1f14／clean／origin/main追跡からpull --ff-onlyで更新なし。WindowsToolsの12コマンド追加に合わせ、共通送信文法のTypeScriptとSDK InputKeyChordへMediaPlayPause/Stop/NextTrack/PrevTrack、VolumeMute/Up/Downを追加。既存InputSenderの押下・解放送信を使用し、受信フック・登録/記録文法・設定・保存ファイル・既存APIの名称/許可/寿命は維持した。WindowsToolsは0.2.3、最低本体0.85.9。
- 発行前レビューは阻害指摘なし。設定/保存ファイルの増減や破壊的変更がないため0.85.8→0.85.9のパッチ更新。型検査、input-command/process-launchの関連JS **10/10**、WindowsToolsのSDKを含む.NET **42/42**、発行DLLの実プロセス/模擬API試験が成功。
- 最終固定EXEのnative-input-ui-test **7群** が成功。7つのメディア/音量キーを専用WinFormsへ実送信し、既存Node Applet11コマンド・ローカル/MCPの保存コマンド・sendInputの独立許可・許可撤回/前面変更/取消・記号の配列解決・連続ジェスチャーに150ms待機を課さない契約も確認した。キー送信の成功と実プレイヤー/スピーカーの効果は区別し、後者は未確認。
- WindowsToolsの最終固定EXE GUIで91件のコマンドと説明、設定変更/再起動/停止後の状態、MCP設定経路と旧値保持を確認。追加した終了選択画面コマンドから実際の「Windows のシャットダウン」ダイアログが開き、選択欄・OK・キャンセルを確認してキャンセルした。実シャットダウン/再起動/サインアウトは模擬起動要求だけを検証し、実行していない。固定EXEのsmokeも成功。
- 既存publish.batで40.ARTIFACTへ発行。EXE/FileVersion/ProductVersion/feedは0.85.9、170,504,756 bytes／SHA256 `39297303f8e28aa28bb7bb2899a0eb96934c224b76118f39d654ef0c1f9c0514`。Default Shell同梱と隔離EXE起動を確認。全体ZIP、他Appletの再発行、commit/push/Release/実利用deployなし。
- 証跡: `.artifacts/media-keys-20261023/validation.json` と完全ログ、`.artifacts/native-input-ui-1792760127527/result.json`、`.artifacts/smoke-1792760209974/result.json`、WindowsTools `.artifacts/system-commands-20261023/`と `.artifacts/host-1792760191365/`。版更新でpnpmのinstall状態の差が検出されたため固定lockfileの通常installで同期。制限内.NET発行/EXE起動の失敗を保持し同一処理を通常ユーザーで成功させた。発行後は試験スクリプトの期待値/表示参照/DPI画像取得だけを修正し、製品入力のhashは不変。必要範囲外の全回帰は未実行。過去の再利用/失敗資料と状態不明資料を保持し、テストフォルダー削除0件。

## 2026-10-23: 設定一覧UI 0.85.8のコミット・プッシュ前照合

- 利用者が確認した一覧スクロール・一時フィルター・全設定のヘッダー・一般設定/操作許可の整理を、`main`の`e258a2d`上の38パスとしてレビューした。先行のタッチパッドcommitも未pushで、GitHub/AQUAのmainはともに`afd97ab`を確認した。未コミット変更を保持し、読み取りのfetchのみ行った。実効author/committerとrepo-local設定は一致し、Git設定を変更していない。
- 最終672入力・完全ログ・GUI結果・固定EXEコピーを照合し、0.85.8の型検査/build・固定GUI **56群**・smokeを再利用した。発行EXEのsize/SHA256/feed/版は前節の値を維持し、コミット時の製品修正・版更新・再発行は行っていない。
- 109個の標準JSファイルは先行commit時から不変。親commitの標準回帰証跡から、変更された設定カタログへ依存する経路とrendererソース検査を抽出した。今回 **9ファイル77件** を追加確認し、実装時の4ファイル28件・影響のない96ファイル737件と合わせて **842件成功、fail/skip 0**。制限内の一時ファイルrenameのEPERMは失敗ログを保持し、同じ9ファイルを通常ユーザー権限で再実行した。新しい試験名と先行標準ログの一致、対象処理/依存/ツールチェーンの照合を記録した。
- 証跡は`.artifacts/commit-validation-settings-ui-0858-20261023/validation.json`と`reuse.json`。stage内容/作業ファイル・stage tree/commit tree、両送信先mainの照合は同ディレクトリの`commit.json`・`push.json`へ記録する。先行の再利用証跡・途中の失敗を保持し、今回の一時GUIフォルダー削除は0件。Release公開・実利用先deployは対象外。

## 2026-10-23: 一時フィルターの行高維持・全設定の外側スクロール・一般設定のボタン整理（0.85.8）

- `main`の`e258a2d`（origin/main追跡、ahead 1）で先行変更を保持して着手し、未コミット変更があるためpull/stashは行っていない。一時フィルターは32pxへ縮め、通常の操作ボタンと高さを揃えた。狭幅は件数/フィルターの2段分を常に確保し、表示・×解除で行の高さを変えない。長い対象名の折り返しとアクセント装飾は保持する。
- `SettingsPageLayout`を全本体ページ・Applet設定・フォーム/JSONで共通の外側スクロールに統一した。タイトル・説明・上部操作も本文と一緒に動き、一覧フィルターの固定とテーブルだけの横スクロールを維持する。JSON入力欄のスタイルを新しい本文枠へ接続し、フォーム/JSONの往復で値を変更しないことを確認した。
- 一般の「Applet・MCPからの操作」案内カードと検索用の案内項目を削除し、保存済みの操作許可は維持した。設定ファイルの状態は共通Fieldを直置きし、再起動・バックアップ復元・保存先・中断したWindows起動設定の復旧を同じボタン列へ集約した。`SettingsActions`で間隔/上下余白を12px、折り返しを共通化し、`SettingsContent`を構造を持つウィジェットの枠として追加した。9フォームの該当divを置き換え、AST確認で個別画面のSettingsSection直下のdivは **11→0**。追加規則は`docs/settings-ui-guidelines.md`、現行構成は設定基盤/一覧編集の文書へ反映した。
- 型検査・ビルド・関連JS **28/28（fail/skip 0）** が成功。最終ソースの一覧移動/実際の入力フィルター解除 **10群** とスクロール **38群** が成功し、一般のボタン列を含むソースレイアウト **8群** も確認した。最終固定EXEでは同じ **10＋38＋8＝56群** とsmokeが成功した。明暗・1280/760幅・低い画面、全13種の他設定/Fixture Applet、フォーム/JSON、長い名前、×と全体解除、フォーカス復帰、保存しないこと、全体スクロールと固定フィルターの組合せを含む。
- 発行前レビューと再確認を実施。0.85.7固定EXEで実際に×を押す検査を追加し、狭いジェスチャー画面で71.33px→48pxの高さ差を検出した。container query自体は適用されていたが、共通CSSのflex指定が後勝ちしていたため、狭幅のgrid指定を`.settings-panel`で限定して優先させた。ソースの実解除/スクロールと最終固定EXEで再検証し、未解決の阻害指摘なし。0.85.7を完成版と扱わず、製品CSSの追加修正を **0.85.8** として再発行した。途中の失敗/診断ログを保持する。
- `publish.bat`終了0。発行EXE/feed/Default Shell/FileVersion/ProductVersionは **0.85.8**、**170493755 bytes / SHA256 `ca40737bc32ed90af6aa456b7271a427e8f892785a3e715e0519ccf7645f8903`**。固定GUI3種類とsmokeのコピーも一致した。制限環境での.NET発行失敗は通常ユーザー権限で同じ手順を実行して切り分け、依存・lockfile・検査方針を維持した。
- 証跡は`.artifacts/settings-page-layout-20261023/validation.json`。最終GUIは`.artifacts/settings-hints-ui-1792756868399/`・`.artifacts/settings-hints-ui-1792756898467/`・`.artifacts/settings-layout-refinements-ui-1792756937055/`、smokeは`.artifacts/smoke-1792756967206/`。最終672入力hash一致。ソース試験後の版更新とCSS/GUI検査の差分を記録し、影響のないJS成功結果を再利用した。復旧ボタンの表示は隔離profile内の状態fixtureで確認し、Windows起動設定の復旧・再起動・フォルダー操作は実行していない。無関係な全回帰や物理入力試験は対象外。
- 対象テストプロセス0、整理での削除0件。今回の各方式の成功分は3回以内で、先行の再利用証跡と失敗記録を保護した。実利用の表示は確認待ち。コミット・push・外部公開・実利用先deployは行っていない。

## 2026-10-23: 一時フィルターの件数横への移動・アクセント装飾・操作許可のカード整理（0.85.6）

- `main`の`e258a2d`（origin/main追跡、ahead 1）で先行UI変更を保持して着手した。未コミット変更があるためpull/stashは行っていない。先行0.85.5の配置は利用者確認済み。
- Applet・コマンド・キー・ジェスチャーの一時フィルターを、対象名と×のまとまりごと表示件数の右へ移した。4画面で`CommandListSummary`を共用し、右端の操作、長い名前の折り返し、明暗の共通アクセント背景/文字/枠、×のhover/focus-visibleを揃えた。カスタムコマンドの件数と対象も同じ固定ツールバー内へ統合し、他の一般設定一覧のツールバー構造は保った。検索・解除範囲・保存・フォーカス復帰は既存の処理を維持する。
- 「操作の許可」は「許可の適用とログについて」の折りたたみカードを先頭へ移し、「APIの公開」の外側カードと見出しを外して、名前付きの権限テーブルをページ直下へ配置した。行順・許可値・警告・保存処理は変更していない。追加規則と現在の構成を`docs/settings-list-editing.md`・`docs/settings-foundation.md`へ反映した。
- 型検査・ビルドが成功。ソースGUIは一覧移動/一時フィルター **10群** とレイアウト **8群** が成功した。最終固定EXEでもスクロール/固定表示 **34群**、一覧移動/一時フィルター **10群**、レイアウト **8群**（合計 **52群**）とsmokeが成功した。明暗・1280/760幅、低い画面、長い対象名、Applet/コマンド/3入力方式、Enter/Space・×/全体解除・外部変更/空結果・フォーカス復帰・保存しないことを含む。スクリーンショットでアクセント表示と操作許可のカード順序・表の配置も確認した。
- 発行前の差分レビューで未解決の阻害指摘なし。追加したタッチパッド試験がApplet管理に存在しない移動ボタンを前提としていたため、現行のコマンド行から移動する入口へ試験を修正し再確認した。制限環境でのElectron CDP/.NET発行/CIMの失敗はログを保持し、同じ処理を通常ユーザー権限で切り分けた。製品の設定・依存・検査方針は変更していない。
- 表示だけの修正として **0.85.6** へパッチ更新し、`publish.bat`終了0。発行EXE/feed/Default Shell/FileVersion/ProductVersionは0.85.6、**170498326 bytes / SHA256 `a707ec605a32937c778bac9251e0e72c75aa143b07492f07bea99107280172b6`**。固定GUI3種類とsmokeのコピーも一致した。
- 証跡は`.artifacts/temporary-filter-row-20261023/validation.json`。固定GUIは`.artifacts/settings-hints-ui-1792754667006/`・`.artifacts/settings-hints-ui-1792754698877/`・`.artifacts/settings-layout-refinements-ui-1792754728713/`、smokeは`.artifacts/smoke-1792754757609/`。最終672入力hashが一致した。関連JS28件は対象処理・試験・依存と完全ログのhashを照合して先行証跡を再利用し、今回実行したGUI結果と区別した。無関係な全回帰・実サービス・物理入力は再実行していない。
- 対象GUIプロセス0、整理での削除0件。今回の成功分は方式ごとに3回以内で、先行の再利用証跡と失敗記録を保持した。新版の実利用表示は利用者確認待ち。コミット・push・外部公開・実利用先deployは行っていない。

## 2026-10-23: 外側の縦スクロール・カード撤去・Applet管理の固定フィルター（0.85.5）

- `main`（`e258a2d`、origin/main追跡、ahead 1）の未コミット0.85.4を保持して追加修正した。dirtyのためpull/stashを行っていない。ショートカット／マウスジェスチャー／タッチパッドジェスチャー／カスタムコマンドとApplet管理のフォームで、ページタイトル・説明・上部操作欄と本文を同じ外側の縦スクロールへ収めた。上部が画面外へ流れた後もフィルターだけが表示枠上端に残る。4画面のテーブル用横バーは下端に保持し、他の設定ページとJSON編集の構成は維持した。
- 4画面の「割り当て」「登録済みコマンド」カードを共通`CommandListSection`へ置き換えた。外枠・余白・見出しを外し、フィルターと一覧を直接並べる。検索アンカー、アクセシブルな名前、無効状態・上限・利用できる種類等の必要な説明、既存の操作と保存経路は保った。Applet管理の検索・件数・並べ替えも共通`CommandListToolbar`で固定し、導入可否・検出の説明は固定領域の外へ置いた。
- フィルター背景はページの背景色に揃え、枠のない配置になじませた。固定中は後ろの行の文字が透けて重ならない。明暗テーマの背景一致、カードの境界/見出し/内側余白がないこと、ヘッダーと上部操作欄が表示枠の外へ流れることをGUIで確認した。カスタムコマンドへ検索機能は追加していない。
- 型検査・ビルドが成功。ソースGUIと最終固定EXEの双方で、スクロール等 **34群** と一覧間移動 **7群** が成功し、固定EXEのsmokeも成功した。4画面×明暗×1280×900/760×900/760×640の24条件、空の検索結果・復帰、ダイアログ取消後の位置/フォーカス、動作設定展開、JSON往復を確認した。Applet管理は明暗×1280/760の4条件で、ヘッダーの消失、検索/件数の固定、固定後の検索・解除を確認した。24個の無効なローカルfixtureを使い、実利用のApplet・設定へ変更していない。
- 発行前レビューで対象5フォーム、他ページ/JSONへの非影響、検索アンカー、状態説明、背景・重なり順、縦横位置とフォーカス復帰を確認し、未解決の発行阻害指摘なし。外側スクロールへの変更後、タッチパッドのフィルターへ固定のスクロール量では届かなかったため、試験位置を実際のフィルター位置から求めるよう修正した。失敗ログを保持し、製品の固定不良とは区別した。
- 保存項目・保存ファイル・公開API・入力フックを変更しない表示修正として **0.85.5** へパッチ更新。`publish.bat`終了0。最終EXE/feed/Default Shell/FileVersion/ProductVersionは0.85.5、**170500909 bytes / SHA256 `270ba00bd72d808a74863a7d9b8093124aaae8a5ae66ff5957a982f7fdc11d32`**。2つの固定GUIとsmokeのコピーが一致した。
- 証跡は`.artifacts/command-list-outer-scroll-20261023/validation.json`。固定GUIは`.artifacts/settings-hints-ui-1792753075710/`・`.artifacts/settings-hints-ui-1792753107566/`、smokeは`.artifacts/smoke-1792753131700/`。最終672入力hashは一致。先行JS28件は対象処理・テスト・依存が一致するため前節の証跡を再利用し、今回のGUI結果と区別した。無関係な全回帰・インストール/更新/実サービス・native/物理入力の試験は再実行していない。
- 対象テストプロセス0、整理での削除0件。今回の新しい試験は方式ごとの成功3回未満で、過去の再利用証跡と失敗記録を保持した。実利用の表示は利用者確認待ち。コミット・push・外部公開・実利用先deployは行っていない。

## 2026-10-23: コマンド一覧4画面のスクロールと固定フィルター（0.85.4）

- `main`の`e258a2d`（origin/main追跡、ahead 1、作業ツリーclean）から開始し、`pull --ff-only`でAlready up to dateを確認した。ショートカット／マウスジェスチャー／タッチパッドジェスチャー／カスタムコマンドの一覧を自然な高さにし、縦スクロールを設定本文へ集約した。テーブルだけを横スクロールさせ、本文の下端に置く標準の横バーと双方向に連動させる。検索・絞り込み・件数・解除はテーブルの外で共通`CommandListToolbar`にまとめ、本文上端に到達したら一覧の範囲内で固定する。カスタムコマンドに検索機能は追加していない。
- `CommandListScrollProvider`／`useCommandListScroll`／`CommandListScrollbar`を共通化し、カスタムコマンドだけ`SettingsListTable.commandListScroll`へ明示接続した。他の設定一覧は標準の動作を維持する。リサイズ・検索・行の増減・フォーム/JSON切り替え、ダイアログ後の本文縦位置・表の横位置・フォーカスを確認した。将来のフィルター追加方法を`docs/settings-list-editing.md`へ記載した。
- 型検査・ビルド・関連JS **28/28（fail/skip 0）** が成功した。ソースGUIのスクロール **30群**、最終ソースの一覧移動 **7群** が成功した。最終固定EXEでもスクロール **30群** と一覧移動 **7群**、smokeが成功した。4画面×明暗×1280×900/760×900/760×640の24条件で、横バーが必要な16条件・不要な8条件と、一覧内の縦スクロール0件を確認した。ドラッグ・左右キー・Home/End、空の検索結果、検索復帰、編集の取消とフォーカス、展開した動作設定、JSON往復、他のAI一覧を含む。
- 発行前の差分レビューと再確認で、双方向連動の遅延通知が次の操作を戻す経路を修正した。追加の一覧移動試験では、タッチパッド追加前の右側インデックスアイコン・移動先数を前提とする試験を現行仕様へ合わせた後、3個の移動アイコンに対して列幅が2個分のままで右端が20pxはみ出す既存不具合を検出した。列幅を3個分と余白へ修正し、ソース/固定EXEの一覧移動で再検証した。展開設定の試験位置も固定値から実際のフィルター位置へ変更した。製品の修正と試験の前提修正を区別し、途中の失敗ログを保持した。未解決の発行阻害指摘なし。
- 保存項目・保存ファイル・公開API・入力フックを変更しない表示修正として0.85.3を発行後、移動列の追加修正を **0.85.4** として再発行した。両`publish.bat`終了0。最終EXE/feed/Default Shell/FileVersion/ProductVersionは0.85.4、**170485475 bytes / SHA256 `7b3dd763f92ec0879cbfb2c13020ee1bd92b3d5cd335e4df2bc02526e809c04c`**。固定GUIとsmokeのコピーが一致した。制限環境でのElectron起動と.NET発行の失敗は通常ユーザー権限で同じ処理を再実行して切り分け、lockfile・検査方針を維持した。
- 証跡は`.artifacts/command-list-scroll-20261023/validation.json`、最終固定GUIは`.artifacts/settings-hints-ui-1792750999676/`と`.artifacts/settings-hints-ui-1792751029225/`、smokeは`.artifacts/smoke-1792751052860/`。最終672入力のhashは一致。先行JS28件後の差は版、移動列のCSS、一覧移動の試験のみで、JS回帰が扱う処理は一致する。今回に無関係な全回帰・native試験・物理キー/タッチパッドの試験は再実行していない。
- 対象テストプロセス0を確認。新しい4画面試験のソース/固定EXE各方式は成功3回未満のため、削除0件。既存証跡と今回の失敗記録を保持した。実利用での表示確認は利用者確認待ち。コミット・push・GitHub公開・実利用先deployは行っていない。

## 2026-10-23: タッチパッドジェスチャー0.85.2のコミット前照合

- `main`の開始点とGitHub `origin/main`の先端`afd97ab`、実効author/committerを確認した。設計書、Windows接続、共通条件・コマンド基盤、設定画面、通知と保存拒否時の復元、インラインの接続用キー設定、対応試験・文書の62パスを対象とした。既存の未コミット変更を保持し、pull/stashは行っていない。
- 発行時の651入力hashと現在の入力が一致した。0.85.2の型検査・ビルド、関連JS **36件**、ソース/固定EXEのタッチパッドGUI **各11群** は、完全ログのhash・試験入力・成果物を照合して再利用した。単体試験後のGUI driverとCSS間隔の差は単体試験対象に影響しない。再利用の判定は`.artifacts/commit-validation-touchpad-0852-20261023/reuse.json`へ記録した。
- 未実行の標準回帰103ファイルを実行し **806件成功、fail/skip 0**。再利用分と合わせて標準JS109ファイル・**842件**の成功を確認した。最初の制限環境ではWindows操作のアクセス拒否・一時ファイル書込みの失敗が出たため、失敗ログを残して同じ試験を通常ユーザー環境で再実行し成功した。設定・依存・lockfileは変更していない。
- 完全ログが不足していたnative試験は再実行した。偽ストアの **180検査** と実キーフックの受入が成功し、所有キーのkeydown/up遮断・1押下1実行・対象取得・自己入力除外・古い世代と所有解除後の通過を確認した。共用のマウスジェスチャーGUIは旧EXEとhashが異なるため、現在の固定EXEで **11群** を再確認した（`.artifacts/gestures-ui-1792748687520/`）。物理指操作とWindowsのジェスチャー設定書込みは追加していない。
- コミット時の製品修正はなく、版・発行物は0.85.2のまま。EXE **170473198 bytes / SHA256 `d21be207e4ba65725e68c1fb1e6b1ec764453d00a3ef94f2b9ba07950f0950cc`** がfeed・固定GUIコピーと一致した。試験前後の651入力、stage/実ファイル、stage tree/commit treeは`.artifacts/commit-validation-touchpad-0852-20261023/validation.json`と`commit.json`へ記録する。
- 対象の試験プロセス0を確認した。GUIの各実行方式で直近3件、過去の再利用証跡、失敗・状態不明の記録を保持し、今回の削除対象は0件。物理タッチパッドの製品確認と利用可否検出UIは前節の未確認・未実装事項を継続する。push・外部公開・実利用先deployは行わない。

## 2026-10-23: 保存拒否後の割り当て表示復元と接続用キーの直接編集（0.85.2）

- `main`（`afd97ab`、origin/main追跡）の未コミット変更を保持して継続した。利用者が0.85.1でキー重複通知を確認した後、新規の保存拒否が一覧に残る問題を報告した。保存自体は拒否されており、SettingsViewClientの画面内入力が保存済みと同じ表示に見えることが原因だった。
- タッチパッドのフォーム失敗時は未保存入力を破棄して保存値を再取得する。新規追加は「未割り当て」、既存編集は元の割り当てへ戻る。失敗値を含む受付待ちのフォーム操作も破棄し、後からキー等を変更しても失敗した行を保存しない。別ページ・JSONの入力保持を維持し、保存後のWindows反映だけが失敗したケースでは実際に保存された値を表示する。
- 接続用キーの編集ダイアログを除去し、「動作設定」の直下・同階層に既定で閉じた「接続用キー設定」を追加した。10種類それぞれにF13～F24のドロップダウンと、Ctrl・Alt・Shift・Winのラベル付きチェックボックスを横並びで置き、変更ごとに検証・即時保存する。共通SettingsChoiceと配置クラスを使用し、重複時は既存の共通エラー欄へ報告する。通知の案内先と検索メタデータも新しいグループ名へ合わせた。
- 型検査・ビルド・関連JS **36/36（fail/skip 0）** が成功。新規の表示キュー試験4件で、失敗値破棄/後続の別編集への混入防止/受付待ちの破棄と新入力の受付/保存後の反映失敗/他ページとJSONの入力保持を確認した。ソースと固定EXEのGUI **各11群** が成功し、通知、新規/既存行の復元、キー修正だけでは行が復活しないこと、接続キー同士の重複拒否、10キー欄・40チェック欄と各修飾キーの即時保存、明暗940px・暗760pxの横並びと横はみ出しなしを確認した。
- 発行前レビュー1回で失敗時の境界、キュー、設定/API/Windows操作への影響、共通表示とアクセシビリティ、文書整合を確認した。760pxでWinだけ折り返したため間隔を8pxへ調整して再確認した。GUI fixtureのF13競合と警告用登録の衝突、共通エラーの対象名付き表示への照合も修正し、失敗ログを保持した。製品の修正点と試験手順の修正を区別した。未解決の発行阻害指摘なし。
- 保存項目・保存ファイル・公開API・native処理を変更しない修正として **0.85.2** へパッチ更新。版更新後のpnpm workspace検査エラーは`install --frozen-lockfile`で解消し、依存/lockfileを変更していない。`publish.bat`終了0、EXE/feed/Default Shell/FileVersion/ProductVersionは0.85.2。**170473198 bytes / SHA256 `d21be207e4ba65725e68c1fb1e6b1ec764453d00a3ef94f2b9ba07950f0950cc`** が固定GUIコピーと一致した。
- 証跡は`.artifacts/touchpad-rejected-binding-20261023/validation.json`、ソースGUIは`.artifacts/touchpad-ui-1792747707594/`、固定GUIは`.artifacts/touchpad-ui-1792748076874/`。固定GUIの初回（`touchpad-ui-1792747905212`）は全操作とDOM測定が成功したが、760px暗色の取得画像1枚が単色だったため、同じコマンド・driver・EXEで再実行し、画像も確認した。製品変更は行わず初回記録も保持した。最終651入力のhashは一致。単体試験後の差はGUI driverとCSSの間隔だけで、試験対象の処理は一致する。native試験・Windows設定書込み・物理指操作の追加確認は行っていない。利用可否検出UIも未実装のまま。
- 対象テストプロセス0を確認。ソースGUIの古い成功2件（`touchpad-ui-1792743746515`、`touchpad-ui-1792744254880`）を、成功結果・絶対パス・再解析ポイントなし・参照プロセスなしの確認後に削除した。ソース/固定EXE各3件の成功に加え、再利用用の0.85.0固定EXE証跡、失敗記録、固定コンパイル出力、各版の検証記録を保持した。コミット・push・外部公開・実利用先deployは行っていない。

## 2026-10-23: タッチパッドの接続用キー重複をエラー通知へ表示（0.85.1）

- 未コミットの0.85.0を保持した`main`（`afd97ab`）で修正した。報告された保存拒否は、タッチパッド接続用キーと通常ショートカットの重複を保存前に検出したもの。端末にタッチパッドがないことによる拒否とは区別する。
- 既知の`TouchpadKeyConflictError`を共通ErrorReporterへ接続し、重複キーと「タッチパッドジェスチャー → 動作設定」で変更する案内を表示する。既存のエラー通知設定を使用する。古いrevisionは先に拒否し、この通知の対象にしない。保存値・revisionは失敗前のまま、失敗した入力は現在の画面に保持し、キーを直した再保存に使える。保存項目・ファイル・Windows操作・入力ホストは変更していない。
- 型検査・ビルド・関連JS **52/52（fail/skip 0）** が成功した。ソースと固定EXEのGUI **各9群** で、実際のエラーバナー1件、キー名と対処、保存値/revision不変、キー修正後の保存、既存8群の設定操作を確認した。最初のGUI driverはキー修正によって保持中の割り当てが保存された後に再登録して2件となり失敗したため、二重登録する試験手順だけを修正して再実行した。失敗記録は保持し、製品の重複登録不具合とは扱わない。
- 発行前レビュー1回で通知対象・安全な本文・保存前の境界・再送時の既存重複抑止・Windows操作への非影響を確認し、未解決の発行阻害指摘なし。設定/保存ファイルの増減を伴わない修正として **0.85.1** へパッチ更新した。`publish.bat`終了0。EXE/feed/Default Shell/FileVersion/ProductVersionは0.85.1、**170501745 bytes / SHA256 `8b13f4dd8614e568aa3c71d3aca8251e5030cebcc304cb632a412f225d9b5404`** で一致し、隔離GUIの固定コピーも一致した。
- 証跡は`.artifacts/touchpad-conflict-notice-20261023/validation.json`、固定GUIは`.artifacts/touchpad-ui-1792746567550/`。発行前後の650入力hashは一致。単体試験後はGUI driverの手順修正と版更新だけ、ソースGUI後は版更新だけで、製品実装は一致する。今回の変更に関係しないnative試験の再実行は行わず、0.85.0の結果と区別した。対象の残存テストプロセス0、整理での削除0件。今回の成功/失敗記録と以前の参照証跡を保持した。コミット・push・外部公開・実利用先deployは行っていない。
- 別途、利用可否の調査としてWindows 11 24H2以降の`SPI_GETTOUCHPADPARAMETERS`をLUNAで読取成功した。`touchpadPresent=false`、`legacyTouchpadPresent=false`、`maxSupportedContacts=0`に対し、`touchpadEnabled/touchpadActive=true`だったため、設定の有効フラグだけでは接続有無を判定できない。製品への検出UIは未実装。API未対応OSを未接続と断定しない。構造体の正本は[Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-touchpad_parameters_v1)。物理タッチパッドの製品確認は前節の未確認事項を継続する。

## 2026-10-23: Windows連携タッチパッドジェスチャー（0.85.0）

- `main`（`afd97ab`、origin/main追跡）の設計文書の未コミット変更を保持して実装した。dirtyのためpull/stashを行っていない。3/4本指のタップ・上下左右10種類をWindowsからF13～F24と修飾キーで受信し、既存InputHost・共通条件・実行順/first-all・重複除去・CommandDispatcherへ接続した。専用キーは条件不一致でもブロックし、AppDock自身の入力と無効な接続世代を除外する。
- 端末ごとの既定OFF、共有割り当て、PC専用の接続journal、明示的な初回接続/再設定、Windows変更の監視とジェスチャー単位の停止・通知・全解除を実装した。OFF/最後の削除/通常再起動/同期はWindowsを書き換えない。未割り当て方向の実効動作を保つ計画、直前照合、比較付き復旧、未解決journalの保持を実装。未知のWindows内部形式では書込み前に停止する。
- 設定をマウスジェスチャー直下へ追加し、簡素なタッチパッドアイコンと先頭固定幅の設定インデックスを採用。既存コマンド一覧・条件/順序ダイアログ・通知基盤を共用した。専用キーのショートカット表示は読取専用。Windows設定を開くボタンと、ジェスチャー単位の再設定/制御しない/全解除を設けた。公開APIとApplet/MCPの独立した編集許可は既定OFF。
- 発行前レビュー1回で設定保存・入力所有権・Windows書込み境界・共通UI/API・既存マウス動作を確認した。指摘したPCのON操作による共有ファイル変更、既存マウス設定の未知フィールド消失、タッチパッドの順序グループ、キー変更直前のWindows競合、他ジェスチャーの未解決journal消失、記録中の一時解除、アイコン欄のflex優先度を修正し、必要な再検証を完了した。未解決の発行阻害指摘なし。設定項目・PC専用保存ファイルの追加により**0.84.0 → 0.85.0**のマイナー更新。
- 型検査・本体/Default Shell/.NETビルドが成功。関連JS **81/81（fail/skip 0）**、Windowsモデルの偽ストア **180検査**、実Windowsのキーフック受入が成功した。モデルでは10種類×5モードの非対象動作保持、72キー表現、全10種の同時設定、書込み途中失敗6箇所の復旧、書込み前競合を確認。実フックでは1押下1実行、keydown/upの遮断、対象取得、自己入力除外、古い世代/所有解除後の入力通過と既存ショートカット回帰を確認した。物理タッチパッド入力の代わりにはしない。
- ソース/固定EXEの新規GUI **各8群**、固定EXEの既存マウス設定GUI **11群** が成功した。後者は既存の`APPDOCK_GESTURE_UI_ONLY=1`で実入力を明示除外。新規画面の10候補・キー編集・順序・読取専用投影・最後の削除・警告無視/ジェスチャー単位の解除・明暗・940px幅を確認し、共用マウス画面の条件・全入力種別・2段階・競合・削除・再起動保存を回帰確認した。Windowsの24設定値と10種類の実効動作は試験前後で一致し、製品からのWindows書込みはこの試験では行っていない。
- `publish.bat`終了0で`A:\40.ARTIFACT\AppDock.at365`へ発行。EXE/feed/Default Shell/FileVersion/ProductVersionは**0.85.0**で一致。EXEは**170487750 bytes / SHA256 `f769cced36ce65f9a376fb567aa11df8c3244cb41c75b4702cdb59f6610365b5`**。固定GUIコピーも一致した。.NET/入力ホストの制限付き実行失敗は同一コマンドの通常ユーザー実行で切り分け、検査・依存・lockfileを緩めていない。
- 証跡は`.artifacts/touchpad-implementation-20261023/validation.json`、固定GUIは`.artifacts/touchpad-ui-1792744896391/`と`.artifacts/gestures-ui-1792744961071/`。最終GUI前後の650入力hashは一致。旧設計worktreeは3文書と検証JSONをhash付きで退避し、依頼に従い削除。`git worktree list`はmainのみ。現行試験・以前の参照証跡を保持した。コミット・push・GitHub公開・実利用先deployは行っていない。
- 実機で残る確認は、製品からの10種類の設定反映と指操作、修飾キーの全組み合わせ、Windows設定を外から変更した際の体感、非対象方向の物理動作、別Windows版。Windows設定形式の偽ストア試験・読取・人工キー入力と、実タッチパッドの成功を区別する。無関係な全回帰と全Applet再発行は対象外。

## 2026-10-23: Windows連携タッチパッドジェスチャーの設計

- cleanな`main`（`afd97ab`、origin/main追跡）で`pull --ff-only`を実行し、更新なしを確認した。旧設計worktree（detached `eeb2f43`）の設計本文と文書入口の差分を保存し、必要な設計内容をmainへ引き継いだ。旧worktreeの未コミット変更は保持し、新しい正本を[タッチパッドジェスチャー設計](docs/touchpad-gestures-design.md)とした。
- Windowsの3本指・4本指の10種類、F13～F24と修飾キー、端末別の既定OFF、初回接続と再接続の区別、ジェスチャー単位の競合停止/再設定/全解除、専用キーの所有権、共通条件・実行基盤、共通設定UI・通知・公開APIへの接続を定義した。通常の再起動・同期・OFF・最後の割り当て削除ではWindowsを書き換えない。保存・Windows反映・捕捉反映と、途中失敗の復旧も区別した。
- 現行の入力エンジン・キーcodec・共通実行基盤・設定同期・一覧/警告の規則と照合した。通常キーの条件不一致通過と、本機能の条件不一致時もブロックする所有権を分離する必要、WindowsとAppDockの修飾フラグの相違、スワイプ共通モードで非対象方向を維持する必要を明記した。
- 4本指タップ→F13→AppDock→エクスプローラーの実機成功はミニ検証アプリの利用者報告を引用し、今回再実施した結果とはしていない。残り9種類・修飾キー・異なるWindows版・実機入力捕捉は実装時の検証事項。設計のリンク・表・コードフェンス・差分と受入項目の整合を確認し、証跡と元文書のhashを`.artifacts/touchpad-windows-design-20261023/`へ保存した。
- 文書3ファイルだけの変更。製品コード・Windows設定・版番号は変更せず、実装試験・ビルド・発行・commit・pushは行っていない。

## 2026-10-23: 0.84.0のコミット前照合

- ホーム除去の83パスを対象に差分と影響先を再確認し、未解決指摘なし。実装時の657入力・7完全ログ・配布EXEのSHA256一致を確認した。型検査/ビルド、全回帰830件、固定EXEのGUI15群とスモーク、構文検査の成功を再利用し、製品修正・不要な再試験・再発行は行っていない。0.84.0と発行EXEを維持する。
- `main`の開始点`4ec069a`とGitHub/AQUAの`refs/heads/main`、実効author/committerを確認した。今回の追加はこの検証記録のみ。再利用判定、対象パス、stage treeとcommit tree、push先ごとの照合結果は`.artifacts/commit-validation-home-removal-20261023/`へ記録する。GitHub Releaseと実利用先deployは対象外。

## 2026-10-23: 本体ホームの除去と既定の表示先（0.84.0）

- cleanな`main`（`4ec069a`、origin/main追跡）で`pull --ff-only`を実行し、更新なしを確認して着手した。本体ホームの画面・CSS・Controller・専用モデル・完了IPC・リボン/入力条件の新規候補を除去した。Applet化・ダッシュボード共通API・起動先設定は追加していない。通常起動と復元失敗/選択Applet停止時は設定の「バージョン情報・更新」へ戻し、既定先を`shared/navigation.ts`に集約した。
- 更新/再起動の`--restore-view`、設定カテゴリとAppletの復元、入力確定待ちと明示操作優先、終了時の復元先保持を維持。旧リボン`home`と入力条件`host:home`は保存可能な不活性値とし、自動移行/削除なし。ピン留めはコマンドパレットで使用する。現行仕様の正本は[本体ページ](docs/host-pages.md#起動と戻り先)。関連する設計・利用文書とGUI fixtureを整合させ、過去Release記録は履歴として残した。
- 発行前レビュー1回で要件・IPC/型・リボン/入力条件・設定保持・起動/復元寿命・文書・検証範囲を確認。試験がApplet選択のmain反映だけで終了していたため、rendererのDOM/localStorage反映を待つよう修正した。未解決指摘なし。操作契約の削除を含むため、共通手順に従い0.83.14から**0.84.0**へマイナー更新した。
- 型検査・ビルド・関連61件・全回帰 **830/830（fail/skip 0）**・整形・変更CJS **50ファイルの構文検査**・現行文書13ファイルの相対リンク確認が成功。サンドボックスでの一時ファイル置換/Windows API/Electron/.NET発行失敗は、同一コマンドの通常ユーザー実行で切り分けた。依存/lockfile・検査条件は変更していない。
- ソースGUI14群、固定EXEのGUI **15群** とスモークが成功。通常起動、設定カテゴリ/本体ページ/ローカルApplet復元、旧ホーム/不正/不在/無効Appletの復元失敗、選択Applet停止後の戻り先、ホーム経路の拒否と実リボンの不在、パレットのピン実行と保存設定保持を確認した。明暗の画像、既存3本体ページの狭幅100/150/200% zoom、画像ダイアログ・フォーカス・Shell7領域も確認した。実アップデート適用・物理キー入力・実サービス連携とGUI全スクリプトの再実行は対象外。再起動復元は隔離終了と`--restore-view`再起動で検証した。
- `publish.bat`終了0で`A:\40.ARTIFACT\AppDock.at365`へ発行。EXE・feed・Default Shell・EXEのFileVersion/ProductVersionは0.84.0で一致。EXEは **170474237 bytes / SHA256 `30d93f66cecfadf10176082fb8f19c28662e4f707ee7edd33ae9516396a8ecb0`**。GUI/スモーク用固定コピーのhash一致と、今回の試験プロセス0を確認した。
- コマンド・終了コード・ログhash・657入力の照合・レビュー・発行物・GUI結果は`.artifacts/home-removal-20261023/validation.json`。単体回帰後の変更はGUI driverへの実行版照合の追加だけで、製品/単体試験入力は不変。GUI入力も前後一致。host-pagesの成功分はソース/固定EXEそれぞれ直近3回を保持し、失敗/状態不明・参照証跡・固定出力も保持。削除0件。コミット・push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: キー/ジェスチャーのマークからコマンドを絞り込む（0.83.14）

- cleanな`main`（`71f93bf`、origin/mainより3commit先行）から`pull --ff-only`し、更新なしを確認して着手した。共通一覧の入力マークをnative buttonにし、既存のキー正規化/ジェスチャーIDによる完全一致の入力条件、共通の解除ラベル、対象切り替えを実装した。選択時は文字/状態/Applet/コマンドの対象を解除して同入力を使うコマンドを横断表示する。入力条件は画面内だけで保持する。
- 通常のマークは本文色、同入力に異なる2コマンド以上が登録されているマークだけアクセント色にした。全保存済み割り当てから判定し、同一コマンドの重複だけでは色を変えない。無効/利用不能な登録も含め、外部編集/削除へ追従する。選択状態と複数登録は読み上げ情報にも含める。解除時の元マーク/検索欄へのフォーカス復帰を共通hookで管理し、レビューで入力条件がないときの古いフォーカス参照の利用を防いだ。未解決指摘なし。
- 型検査・ビルド・整形・配色回帰 **7/7（fail/skip 0）** が成功。最終ソースの操作/入力フィルターGUI **9群**、既存の一覧移動GUI **7群** が成功した。F1/F10の区別、ジェスチャーID完全一致、Applet/コマンド対象からの切り替え、Enter/Space、文字検索との組み合わせ、×/全解除、フォーカス、同一コマンドの複数行、外部再割り当て/削除/該当なしを検証した。フィルター操作前後で設定値とrevisionが一致し、無効Appletも無効のままであることを確認した。
- 8一覧の明暗テーマ・実寸1280/760pxで **56割り当て行** のマーク色と行高/余白/区切り、一覧アイコンの通常/hover/focus **48組** を確認した。新しいラベルは既存の対象ラベルと同じ部品で必要幅だけ表示する。入力フィルターの狭幅暗色画像と、広幅明色の一覧画像も確認した。runtime/native/SDK/設定schema/保存形式/依存は変更しておらず、物理キー/マウス入力の成功は追加していない。
- 通常のパッチ更新 **0.83.14** として`publish.bat`終了0。EXE/feed/Default Shellの版・サイズ・hashが一致。EXEは **170465559 bytes / SHA256 `88ca24dad1b92678791d5cddfdad2cc2241261f6d82df2dbde146dc90a2f4cd5`**。固定コピーから操作/入力フィルターGUI **9群** と一覧移動GUI **7群** が成功した。
- 完全ログ・コマンド・検証前後の入力hash・実行環境・発行物・レビュー・文書リンクの照合は`.artifacts/binding-input-filter-08314-20261023/validation.json`を正本とする。当該GUIプロセス0、追加削除0件。今回/直近3回/レビュー比較/過去のcommit・再利用証跡を保持した。今回の変更は未コミット。push、GitHub Release、実利用先deployは行っていない。

## 2026-10-23: 一覧ボタンのhover枠と割り当てマークの文字色・コミット前確認（0.83.13）

- 通常色の一覧ボタンは、共通の`button:hover`の`brightness(1.14)`で明るい枠線が白背景へ溶け込んでいた。修正前の隔離GUIで失敗を再現し、共通`settings-list-icon`のhover/focus-visibleに`filter: none`を指定した。通常時の透明な背景・枠線と32px角は保持し、hover/focus時に通常色でも枠を表示する。
- ショートカットキー/ジェスチャーのマークは、共通の`kbd`の薄い補助色から本文と同じ`--text`へ変更した。対象は`.applet-shortcut-value`内に限定し、明暗テーマとも読みやすい本文色を使う。マークを押す完全一致フィルターは今回実装せず、コミット後の検討対象とする。
- 最終ソースの型検査・ビルド・変更対象の整形検査が成功した。共通操作GUI **7群**、一覧移動GUI **7群**、配色回帰 **7/7（fail/skip 0）** が成功。8一覧の明暗・実寸1280/760pxで、割り当て **56行** のマーク色=本文色、上下8px・最小48px・内部罫線なし、通常/hover/キーボードfocus **48組** の背景・枠線・filter・32px寸法を実測した。明るいテーマの広幅と暗いテーマの広幅/狭幅の画像も確認した。
- 標準833件のうち非配色 **826件**、ショートカット動作/再起動8群、共通レイアウト8群、スクロール13群は0.83.9の成功記録を、Applet管理の動作14群は0.83.8を再利用する。ソース/試験/依存/ツール/実行環境・ログ・固定EXEを照合し、後続の差分は一覧の余白・罫線・配置・色と対応GUI helperであることを確認した。ジェスチャーUIの編集/保存/取消/順序/再起動 **12群** は0.83.12の成功を再利用し、その後の変更をマーク色・無関係な操作GUI helper・パッチ版へ限定して照合した。物理キー/ジェスチャー入力の成功へ読み替えない。発行前レビューは未解決指摘なし。
- hover修正を **0.83.12** として発行した後、追加依頼のマーク色を **0.83.13** へ反映した。中間版は発行終了0・EXE/feed一致と固定コピー、ソース試験を`.artifacts/settings-ui-commit-08312-20261023/`へ保持し、固定EXEのGUI確認を実施したとは扱わない。
- 最終版の`publish.bat`終了0、EXE/feed/Default Shellの版・サイズ・SHA256が一致。EXEは **170477607 bytes / SHA256 `0bb6d7ab45544d1fa8ac9bb2ec4f530292d094c9805bbeda4cab263a32adda04`**。固定コピーで共通操作GUI **7群** と一覧移動GUI **7群** が成功した。コマンド・入力/ログhash・配布物・再利用判定・レビューの正本は`.artifacts/settings-ui-commit-08313-20261023/validation.json`。
- 0.83.5以降の今回依頼に対応するUI/文書/試験 **36パス** を、利用者の依頼に従い一つのローカルコミットへまとめる。stage/実ファイル/tree・実効identity・GitHub/AQUA main先端・commit後のtree/clean状態は`.artifacts/commit-validation-settings-ui-08312-20261023/validation.json`へ記録する。最終記録だけの文書差分を除き検証入力を照合する。再利用/中間版/比較/失敗の証跡を保護し、当該試験プロセス0・追加削除0件を確認した。push、GitHub Release、実利用先deployは行っていない。

## 2026-10-23: 割り当て行の密度と一覧アイコンのhover表示（0.83.11）

- `main`（`2dc2235`）の未コミット変更を保持して継続し、pull/stash/commitを行っていない。ショートカット/ジェスチャーの割り当て・操作セルを共通の上下8pxにし、32px角のボタンと左右の余白を保持した。同じコマンド内の割り当て間の罫線を除去し、コマンド間の区切りは保持する。ジェスチャーの移動アイコンもショートカット/カスタムコマンドと同じ左寄せにした。
- 共通の`settings-list-icon`は通常時に背景と枠線を透明にし、hover/キーボードのfocus-visible時に共通の背景・枠線を表示する。割り当てがあるアイコンは通常時もアクセントの前景色を保持し、hover/focus時はアクセントの背景・枠線・前景色を同時に切り替える。透明時も枠線の幅を確保し、状態変化で32pxのボタン寸法や配置が変わらないようにした。追加の＋など用途が異なる部品は従来の表示を保持する。
- 型検査・ビルドが成功した。最終ソースの共通操作GUI **7群** と一覧移動GUI **7群** が成功し、Applet管理を含む8一覧を明暗・実寸1280/760pxで確認した。割り当て **56行** の上下8px・最小48px・内部罫線なし・コマンド間罫線の保持、通常/hover/キーボードfocusの **48組**、条件の折り返し・操作の対応・移動列の左寄せを実測した。色の判定・直接編集/実行順/削除・絞り込み・ヒントOFFの操作も確認した。発行前レビューは未解決指摘なし。設定/保存/API、runtime/native/SDKと依存は変更していない。
- 行間と罫線の調整を **0.83.10** として発行した後、追加された通常時の背景/枠線の撤去を通常のパッチ更新 **0.83.11** に反映した。0.83.10は発行終了0・feed/EXEの版/サイズ/hashと固定コピーを確認し、`.artifacts/settings-binding-spacing-08310-20261023/`へソース試験と中間成果物を保持した。中間版の固定EXEのGUI成功は主張せず、配布物のGUI確認は最終0.83.11を対象にした。
- 最終`publish.bat`終了0。EXE・feed・Default Shell・EXEのFileVersion/ProductVersionは **0.83.11** で一致した。EXEは **170484778 bytes / SHA256 `2b1261f04a53a97554494f7f64a83b47b00adbfef9ba4c6e15b92ba4d6f6a386`**。固定コピーとhashを照合し、同じ共通操作 **7群**・一覧移動 **7群** が成功した。固定EXEでも割り当て56行と表示48組を照合した。0.83.9の833件の標準試験や入力の全回帰は今回の実行結果と混同せず、変更していないruntime等の入力hashを比較して履歴として保持した。
- コマンド・終了コード・入力hash・表示計測・レビュー・発行物照合は`.artifacts/settings-icon-hover-08311-20261023/validation.json`。今回の試験プロセス0。現行4プロファイルと中間版2プロファイル、以前の参照用証跡・固定出力・失敗・他作業を保持し、同方式の直近3回より古くなった成功済みのソース操作GUIフォルダー1件だけを整理した。操作許可型2列テーブル共通化は引き続き対象外。変更は未コミットで、push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: 一覧アイコンの統一と割り当てごとの直接操作（0.83.9）

- `main`（`2dc2235`、origin/mainより2件先行）で0.83.8までの未コミット変更を保持し、pull/stash/commitを行わず継続した。Applet管理の32px角・7px角丸・共通の背景/文字/枠線を`settings-list-icon`へ集約し、リボン・トレイ・ショートカット・ジェスチャー・カスタムコマンド・AI・MCPの一覧へ揃えた。通常の操作/並べ替えは中立色、割り当てのある移動先は共通のアクセント色を使う。AI専用のアイコン描画と寸法/色の上書きを取り除いた。
- 割り当て一覧をコマンド・割り当て・操作・移動の4列にし、割り当てごとの表の行へ鉛筆の編集・既存の実行順・ゴミ箱の削除を直接並べた。コマンド/移動先はrowspanで共有し、長い条件や折り返しでも対応する操作を同じ行へ保つ。旧その他メニューと未使用の共通メニュー部品/CSSを削除した。同じ正規化キー/ジェスチャーIDに異なるコマンドIDが2つ以上あれば実行順をアクセント色にし、検索対象外・無効・利用できない登録も数える。同じコマンドの条件違いだけでは色を付けず、削除後の色も再計算する。
- 発行前レビューで、狭いAI一覧の操作列に共通paddingが優先されてボタンがはみ出す点と、未割り当てから追加した際に行の置き換えでフォーカスが失われる点を修正した。AIの操作列とcompact paddingを揃え、コマンド行を安定させ、フォーカスはコマンド/割り当てIDから復帰先を取り直す。再検証に成功し、必要な修正の未解決指摘なし。設定キー・保存ファイル・backend/native/SDK・依存の変更なし。既存の削除確認/即時保存/競合検出を保持し、共通一覧の仕様と該当AGENTSを4列の契約へ更新した。
- 最終ソースの型検査・ビルド・標準回帰 **833/833（fail/skip 0）** が成功した。共通操作GUI **7群**（参照元を含む8一覧・明暗・実寸1280/760px・折り返し・複数コマンド/同一コマンド重複・絞り込み・削除後の色・キーボード/ヒントOFF）、ショートカットGUI **8群**、ジェスチャーGUI **12群（既存のUI-onlyモード、実入力除外の明示を含む）**、一覧移動 **7群**、共通配置 **8群**、内部スクロール **13群** が成功した。ジェスチャーの通常ユーザーでの実入力試験はWindows前面化に失敗したため、成功扱いにせず失敗ログを保持した。古い試験のその他メニュー/曖昧なラベル/checkbox/ネストされたFieldの参照は現行UIに合わせ、編集・保存・並べ替え・競合・取消・削除・実プロセス再起動のUI動作を確認した。
- 通常のパッチ更新 **0.83.9** を`publish.bat`終了0で発行した。EXE・feed・Default Shell・EXEのFileVersion/ProductVersionは0.83.9で一致。EXEは **170479032 bytes / SHA256 `6589d3865501b267946e7077db0bb33c71684c8f7f42b75ac82dccd5913f6c86`**。固定コピーとのhashを照合し、同じ共通操作 **7群**・ショートカット **8群**・共通配置 **8群**・一覧移動 **7群** が成功した。画像を確認し、以前の通知ハイライト・API一覧の枠・AI入力の保存/取消も維持した。
- 完全ログ・終了コード・前後の入力hash・レビュー・発行物照合は`.artifacts/settings-actions-0839-20261023/validation.json`。今回の試験プロセス0、削除0件。現行の10プロファイル、方式ごとの直近成功分、以前の参照用証跡・固定出力・失敗・他作業を保持した。操作許可型2列テーブル共通化は対象外。変更は未コミットで、push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: 選択欄と対象フィルターの幅・Applet管理の案内・ページ説明（0.83.8）

- `main`（`2dc2235`）の0.83.7までの未コミット変更を保持して継続し、pull/stash/commitを行っていない。共通Fieldと設定ダイアログのnative selectを、最長の選択肢が収まる自然な幅へ変更し、最大幅を親の100%へ制限した。文字・URL・JSON入力と編集可能な候補入力は従来の入力列の幅を維持する。
- 共通`CommandProviderFilter`を内容に合う幅へ変更し、flex/gridで横に引き伸ばさないようにした。ショートカット・ジェスチャー・カスタムコマンドの対象コマンドと、Appletによる対象絞り込みで、枠が文字と解除ボタンの幅に一致することを確認した。長い名前の折り返し、枠内の解除ボタン、解除後の一覧と保存値の保持も確認した。
- Applet管理の固定見出し「導入状況」と、通常時の「インストール済みAppletを管理できます。」を除去した。配布版で利用できる操作の制限、検出できなかったAppletの件数と検出ログへの入口は、該当するときだけ共通Fieldで表示する。カスタムコマンド・AI・MCPクライアントのページ上部には、各ページの用途に合う説明を追加した。トップレベルのカード必須ルールを撤回し、一覧中心の画面はApplet管理を参考に構成する方針を共通指針へ反映した。既存のAPI一覧の枠など、確認済みの配置は維持した。
- 型検査とビルドが成功した。ソースの配置GUI **8群**、コマンド移動・対象フィルターGUI **7群**、Applet管理GUI **14群** が成功した。明暗1280/760、自然な選択欄の幅と最大幅、3ページの説明、通常の案内の不在、検出問題とログ移動、一覧検索・更新確認・有効切り替え・再起動・表示順を確認した。発行前レビューは未解決指摘なし。設定キー・保存ファイル/形式・公開API・backend/native/SDK・依存の変更なし。関連しない機能回帰全体は繰り返していない。
- 通常のパッチ更新 **0.83.8** を`publish.bat`終了0で発行した。EXE・feed・Default ShellとEXEのFileVersion/ProductVersionは0.83.8で一致。EXEは **170473475 bytes / SHA256 `2bd6028d3f3d7e3ae03b4929fe28e397a826f616ae4c393565d130a6f26d6df0`**。固定コピーとのhash一致を確認し、配置GUI **8群** とコマンド移動・対象フィルターGUI **7群** が成功した。通知のハイライト・既存のField/group・API一覧の枠・AI入力の保存/取消の確認も維持した。
- 完全ログ・コマンド・終了コード・前後の入力hash・レビュー・配布物照合は`.artifacts/settings-widths-0838-20261023/validation.json`。今回の試験プロセス0、削除0件。現在の5つの資料、過去の参照用証跡・固定出力・失敗・他作業を保持した。操作許可型の2列テーブル共通化は対象外のまま。変更は未コミットで、push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: 折りたたみ行のハイライト余白とアクセント配色（0.83.7）

- `main`（`2dc2235`）の0.83.6の未コミット変更を保持して継続し、pull/stash/commitを行っていない。0.83.6の検証入力と比較し、今回変更した製品入力は共通SectionのCSSと版番号だけで、ほかは配置GUI driverの拡張である。設定ページのトップレベルは用途の見出しを持つカード、その内側に一覧・テーブルを配置する方針を共通指針へ明記した。確認済みの「APIの公開」のカードと一覧の枠は維持する。
- 通知種類のrow summaryを親カードの余白へ左右12px、狭い幅では8px広げ、同じ幅を内側の余白へ戻した。文字・説明の折り返し幅・開閉アイコン・区切り線の位置は維持し、背景と内容の間に余裕を設けた。共通Sectionのhover/focus背景は`--accent-soft`、説明文は`--accent`へ揃え、独自の配色値を追加していない。設定キー・保存形式・公開API・依存・runtime JavaScriptの変更なし。操作許可型の2列テーブル共通化は対象外のままとした。
- 型検査・ビルド・配色の標準試験 **7/7（fail/skip 0）** が成功した。ソース配置GUI **7群** で明暗1280/760、左右の余白の均等、hover前後の寸法不変、カード内への収まりと横スクロールなし、Enter/Space/アイコンの開閉、通知値の不変を確認した。5プリセットとカスタムを明暗で切り替える **12サンプル** で共通の淡い色との一致と、タイトル・説明それぞれのコントラスト4.5以上を確認した。画像も確認し、発行前レビューは未解決指摘なし。
- 通常のパッチ更新 **0.83.7** を`publish.bat`終了0で発行した。EXE・feed・Default ShellとEXEのFileVersion/ProductVersionは0.83.7で一致。EXEは **170477411 bytes / SHA256 `29b929d459ed324a97ffdc3a5ca54a234ca885ab6befce13e0a70c8994150d8e`**。固定コピーとのhash一致を確認し、同じ配置GUI **7群** が成功した。通知の必須の通知先、API一覧とCommandBindingListの枠の一致、既存のField/group・AI入力と保存/取消・ボタン配置の確認も維持した。
- 完全ログ・コマンド・終了コード・入力hash・レビュー・発行物照合は`.artifacts/settings-highlight-0837-20261023/validation.json`。backend/native/SDK、ヒントや通知の保存処理など変更していない機能の回帰全体は繰り返さず、0.83.6の記録を比較元として保持した。今回のGUI試験プロセス0、削除0件。現在の2つの資料、過去の参照用証跡・固定出力・失敗・他作業を保持した。変更は未コミットで、push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: 通知種類の折りたたみ行と操作許可一覧の枠（0.83.6）

- cleanな`main`（`2dc2235`、origin/mainより2件先行）から`git pull --ff-only`で最新を確認し、更新なしで着手した。0.83.1の`aea52e9`を比較し、通知種類は提供元カード内へ直接並べる行の構成へ戻した。共通の`SettingsSection variant="row"`でFieldと同じ文字サイズ・行の余白・全幅の区切り線を管理する。共通Sectionの開閉表示を枠付きの矢印に揃え、行全体のクリック、hover、キーボードフォーカス、Enter/Spaceの開閉を確認した。
- 「APIの公開」の外側の`variant="card"`を保持し、内側の許可一覧へCommandBindingListと同じ境界色・12pxの角丸・カード背景の外枠を復元した。通知の現在値、必須の通知先、ヒント、Applet/MCPの独立した許可と保存の契約は維持する。設定キー・保存形式・公開API・依存の変更なし。操作許可型の2列テーブル共通化は今回も対象外とした。
- 型検査・ビルド・配色の標準試験 **7/7（fail/skip 0）** が成功した。ソースの配置GUI **6群** とヒントGUI **12群** が成功し、ヒントON/OFF・折りたたみとの操作分離・実プロセス再起動を確認した。差分と影響先を発行前にレビューし、未解決の発行阻害指摘なし。backend/native/SDKと依存の入力は変わらず、変更した共通rendererの配置・配色・ヒントを対象に検証した。標準833件全体を今回再実行したものとは扱わない。
- 通常のパッチ更新 **0.83.6** を`publish.bat`終了0で発行した。EXE・update.json・Default Shell・EXEのFileVersion/ProductVersionは0.83.6で一致。EXEは **170473429 bytes / SHA256 `91df46e46a8463b257d8b1ba31407bcc60091d4f11cc9211f9d793a0e05174ec`**。固定コピーとhashを照合し、配置GUI **6群** と使いやすさGUI **9群** を直列実行して成功した。明暗1280/760、API一覧とCommandBindingListの枠の一致、通知行のEnter/Space/右端アイコン、開閉前後の保存値不変、通知先・読み上げ設定の保存、8ページの幅を確認した。
- 完全ログ・コマンド・終了コード・前後の入力hash・レビュー・発行物照合は`.artifacts/settings-lists-0836-20261023/validation.json`に集約した。今回の試験プロセス0、削除0件。現行の4つの試験資料と、過去の参照用証跡・固定出力・失敗・他作業を保持した。変更は未コミットで、push・GitHub Release・実利用先deployは行っていない。

## 2026-10-23: 共通カード構成の調整と設定UIのコミット前検証（0.83.5）

- 未コミットの設定UI変更を保持した`main`（文書commit `3a5de0e`）から継続し、自動pull/stashを行っていない。origin/mainは`aea52e9`で、実効author/committerと対象範囲を確認した。利用者の完成後コミット依頼に従い、ここまでの共通レイアウト・ダイアログ・状態/エラー表示・関連文書と試験を対象にした。
- 通知一覧の提供元ごとのSectionを`variant="card"`にし、通知種類の間隔は内側の共通`settings-sections`で維持した。操作の許可一覧は`variant="card" title="APIの公開"`で囲み、テーブルの外枠をSectionへ集約した。`SettingsSection variant="group"`は上部に共通20pxの余白を追加した。保存/API/許可の動作は維持する。操作の許可のような2列テーブルの共通部品化は今回の対象外として、設定基盤の文書に次回の検討事項を残した。
- 0.83.4の発行とカード配置の固定EXE確認後、累積変更のコミット前検証で、AIのURL正規化後に親の値が変わらない場合、入力欄の表示だけ未確定文字列が残るケースを確認した。既存の`SettingsInput.confirmation`をURL入力にも渡し、Enterでモデル取得した場合も正規化した値を確定値として反映するよう修正した。URL共通部品の変更はconfirmationの型公開だけで、共通入力の実行処理・既定の確定方法は変更していない。追加修正をレビューし、最終版を通常のパッチ更新 **0.83.5** として発行した。未解決の発行阻害指摘なし。
- 最終ソースの型検査・ビルド・標準回帰 **833/833（fail/skip 0）** が成功した。AIソースGUI **16群** と入力GUI **9群** も成功した。AI driverの旧通知スイッチ/旧エラー位置/詳細折りたたみの参照を現行のカード・常設エラー・同一階層へ合わせ、共通プロンプトの変更はEnterで確定してから取消を確認する形に更新した。URL表示の失敗と古い試験期待による失敗ログは保持した。
- `publish.bat`終了0。最終EXE・feed・Default Shell・EXEのFileVersion/ProductVersionは **0.83.5** で一致した。EXEは **170484095 bytes / SHA256 `79da95f102a391eea1efc4acd93a93324bd26e5e21fdf92a2a0a39a6a404dba6`**。固定コピーとのhashを照合し、隔離したGUI **6方式** を直列実行して全て終了0となった。カード/余白/入力列/AI保存取消の配置 **6群**、AI **16群**、画像 **10群**、ヒント **12群**、入力確定/取消 **9群**、使いやすさ **9群** が成功した。明暗1280/760、画像の150/200%表示、実プロセスの再起動も各方式の範囲で確認した。
- AIはURL/keyのEnter・IME、暗号化したPC専用キー、Node/.NET SDK、MCPの独立した許可・所有者分離・取消、古い応答の破棄、競合時の入力保持まで確認した。画像ダイアログは以前の成功後にdriverのhash差分があったため再実行した。変更していないApplet管理・リボン・MCPクライアント・nativeキー/入力ページの機能回帰は、0.83.2の成功ログ・driver・main/shared/native/fixture・依存/ツール入力を照合して再利用し、今回のEXEの新規検証とは区別した。導入ダイアログのソースfixtureも、対象コードと操作契約が一致する0.83.3の成功を再利用した。
- 実行コマンド・終了コード・入力/ログhash・固定EXEの証跡は`.artifacts/settings-ui-final-0835-20261023/`。0.83.4のカード修正時の記録は`.artifacts/settings-section-cards-20261023/`に保持した。再利用判定・stage tree・commit SHA/treeと完了状態は`.artifacts/commit-validation-settings-ui-0835-20261023/`へ記録する。コミットにプッシュ・GitHub Release・実利用先deployは含めない。
- 最終入力 **644ファイル** と各成功時のhashが一致し、関連5文書のローカルリンク **60件** に欠落なし。該当する隔離試験プロセス0を確認した。新しい成功3件で置き換わった旧レイアウト試作の成功フォルダー1件だけを、絶対パス・再解析ポイント・成功結果の確認後に削除した。失敗・現行/再利用証跡・固定出力・他作業は保持した。

## 2026-10-23: 設定画面の配置・カード・グループ表示の追加修正（0.83.3）

- `main`は文書commit `3a5de0e`でorigin/mainより1件先行し、0.83.2の実装が未コミットの状態から継続した。既存変更を保持し、自動pull・stash・commitを行っていない。保存項目・保存ファイル・公開APIを変更しないUI修正として、発行済み0.83.2から **0.83.3** へパッチ更新した。固定依存のfrozen installは403 entriesを検査して成功し、lockfileや依存の版を変更していない。
- `SettingsField.group`を追加した。最終要件に合わせ、グループ名をタイトルの左に小さく添え、同じ高さに配置する。fieldsetの読み上げ名にもグループを含め、ヒントOFFでも表示する。ジェスチャーの操作感・待機表示、両入力方式のWebブラウザ項目は入れ子のSection/複数列グリッドから同じ階層のFieldへ変更し、入力列と全幅の区切り線を揃えた。AI接続の詳細項目も同じ階層へ移した。
- 通知画面に残っていた汎用fieldset・カードの専用CSSを除去し、読み上げ/MCP Eventの値の列と通知種類の共通カードを復元した。通知先も共通Field/Choiceへ統一し、必須の通知先や通知センターのみの選択契約を保持した。導入元のタイトルは「配布元」、常時表示のdescriptionは「URLまたはフォルダー」とした。許可一覧はカードと同じ背景、暗色の共通境界色は`#4b5262`へ調整した。操作ボタンはスピナーと同じ幅の領域を左右に確保し、通常/処理中とも文字を中央に保つ。
- 発行前レビュー1回で設定保存・公開API・入力確定・取消・共通CSSの影響を確認した。ボタンの最初の修正ではbox-sizingの差で文字が2 CSS pxずれたため、スピナーをborder-boxとし左右16pxへ揃え、再検証した。発行を妨げる指摘なし。型検査・ビルド・整形・差分検査が成功し、標準回帰 **833/833（fail/skip 0）** が成功した。現行ダイアログの通常入力がField外に残る箇所は構文検査で0件。関連5文書のローカルリンク **60件** に欠落なし。
- `publish.bat`を通常ユーザー環境で実行して終了0。発行EXE・feed・Default ShellとEXEリソース版は **0.83.3** で一致した。EXEは **170480055 bytes / SHA256 `8459c3cc10436429fb3e658b3f9f5b359ecd073866c0c29e120a140d70e93447`**。固定コピーと発行物のhashを照合して隔離GUIへ使用した。
- 固定EXEのGUI **4方式** が直列で成功した。追加修正の専用driver **6群** は明暗1280/760でグループとタイトルの横並び、値の列、全幅区切り線、通知カード、許可一覧の背景、導入description、AIの入れ子除去、ボタン文字の中心を測定した。暗色カードの境界/背景コントラストは2以上を確認した。AIの既定値表示・OK前の入力保持・上限/待ち時間の保存・取消も成功した。ヒント **12群**、入力確定/取消/IME/JSON **9群**、使いやすさ **9群**（通知の声・速度の独立継承、通知先、8ページの明暗/狭幅を含む）も成功した。
- ソースfixtureでは導入ダイアログの明暗3幅・低いウィンドウ・エラー詳細・取消/遅延応答・再試行の **5群** が成功し、処理中の文字中心と各要素の位置も不変だった。初回のツールチップ保持確認は1度失敗したが、同じコマンド・同じコードの再実行で全群成功し、固定EXEのヒント試験も成功した。原因を確定した製品修正とは扱わず、失敗記録を保持した。開発起動では導入機能が無効のため、実際の導入ダイアログの配置は固定EXEで確認した。DPIによる1px境界線の丸めを考慮して幾何検査を行った。
- 証跡は`.artifacts/settings-ui-refinements-20261023/`。コマンド・終了コード・ログhash・検証前後の入力hash・固定EXEの一致を保存し、最終 **644ファイル** を照合した。標準回帰/導入fixture後の差分は、その試験が参照しない専用GUI driverへのAI保存・取消ケースの追加だけで、製品・単体試験・依存は一致した。0.83.2のApplet導入全経路・native入力・画像・リボン・MCP統合全回帰は今回の追加成功として数えず、今回変更した表示と入力を上記4方式で確認した。
- 該当テストプロセス0を確認した。今回の成功結果は方式/起動方法ごとに3回以内で、削除0件。失敗・状態不明・旧版証跡・固定出力・他作業を保持した。実利用での画面確認は利用者に委ね、実サービス/物理入力/実NAS等の成功を追加で主張しない。変更は未コミット・未プッシュで、GitHub Releaseや実利用先へのdeployは行っていない。

## 2026-10-23: 設定画面への共通レイアウト指針の適用（0.83.2）

- 文書commit `3a5de0e`を含むcleanなmainから`pull --ff-only`で最新を確認して着手した。ショートカット・ジェスチャー・リボン・トレイ・宣言型一覧・画像・Applet導入・認証等のダイアログを優先して`SettingsField`へ統一した。通常入力が共通フィールドの外にある箇所は構文検査で0件。独自の選択候補やキー記録等の共通ウィジェットは既存の操作を保つ。
- 現在値・継続的な状態・重要な注意は`description`へ、任意の補足は`hint`へ集約した。個別の`SettingsHint`/`SettingsFeedback`を廃止し、ページとモーダルごとの`SettingsStatusProvider`へエラー・対象・処理状態を渡す。常設40pxの要約領域と全文の詳細表示、項目からの参照、静的ラベルの`SettingsButton.pending`、狭幅の縦配置を共通部品が管理する。フォーム全体の外枠と通知提供元をまとめるだけのカードを外し、枠なしの共通セクショングループを追加した。
- 発行前レビュー1回で保存・公開API・入力確定・記録・取消・再試行・フォーカス復帰への影響を確認した。重複するラベルはfieldset/legendで整理し、チェックボックスの既定余白、ダイアログ内の幅優先順位、フォーカス時の遅延スクロールがヒントを閉じる競合を修正した。消費済みのキーイベントを共通モーダルが尊重するようにし、Escapeで詳細だけを閉じて編集を維持することを再確認した。未解決の製品指摘なし。
- 保存項目・保存ファイル・保存形式・外部公開APIと依存は変更せず、通常のUI修正として **0.83.1→0.83.2** にパッチ更新した。型検査・ビルド・整形・差分検査が成功し、最終版の標準回帰 **833/833（fail/skip 0）** が成功した。関連4文書のローカルリンク **56件** に欠落なし。共通部品の現行APIと利用例は`settings-foundation.md`、`settings-list-editing.md`、Applet管理の文書へ反映した。
- `publish.bat`は固定依存403 entriesの検査後、制限環境の.NET工程で停止した。同じ発行処理を通常ユーザーとして再実行して終了0。単一EXEとfeed、Default Shellは **0.83.2**、EXEのFileVersion/ProductVersionも一致した。EXEは **170468740 bytes / SHA256 `42fd8dd84c870ee7629a33f0cfc41bbd9d4c4838d79e8b3c21182e6e1ab635d2`**。固定コピーとfeedのsize/SHA256を照合してから隔離GUIに使用した。
- ソースfixtureでは導入ダイアログの長文エラー・スクロール・詳細のEscape・明暗3幅・低いウィンドウ・取消後の遅延応答・入力保持と再試行が成功した。固定EXEではsmoke、ヒント切替と重要説明の常時表示、ダイアログ内のエラー分離と項目参照、処理中/成功/失敗時の位置、Enter/Escape/IME/blur/JSONの確定・取消、8ページの明暗1280/760、リボン、MCPの認証保持と再試行、画像の追加/所属/削除失敗/拡大、Applet管理の導入・アンインストールを確認した。画像は150/200%も確認し、GUIを直列実行した。
- 固定EXEのGUIは **10方式** が終了0。上記に加え、Windows/Chromiumのキー入力、記録中の一時停止、条件・並び順・既定値保持・再起動、キー/ジェスチャーのページ選択を確認した。ショートカットの共通動作欄は明暗1280/900/700で成功した。最終入力643ファイルを照合し、製品・標準テスト入力は各成功時と一致した。後続差分は当該試験に影響しない別UI driverの調整または整形のみ。照合結果を同フォルダーの`validation.json`へまとめた。
- 既存driverは、旧インラインヒント/エラー、廃止済みApplet詳細タブやプロフィールカテゴリ、既定値を全て保存する旧fixture期待を現行仕様へ合わせた。検証条件は維持し、エラー対象の参照・背後のページへの非表示・失敗時の位置固定を追加した。旧画像ライブラリーdriverは廃止済みの別Windowを待って失敗したため、現行`image-gallery-ui-test.cjs`へ切り替えて必要なダイアログを確認した。Applet導入の初回は展開済みフォルダーの一時transactionへのアクセス拒否で復旧した。新しい隔離profileで同じ全試験を再実行し、URL・配布フォルダー・展開済みフォルダーの導入/削除と6回の実helper再起動、OFF設定・データ保持まで成功した。権限・検査条件や製品コードは変更していない。
- 完全ログ・終了コード・コマンド・Node/OS/固定ツール・各入力の検証前後SHA256・固定EXEのhashは`.artifacts/settings-ui-guidelines-20261023/`の各`source-*.json`/`portable-*.json`、`final-regression-*.json`、`review.json`、`publish-result.json`を正本とする。発行後の変更はdriverのfixture・参照方法・整形と文書だけで、製品ソースと配布物は不変。実NAS・物理キーボード/DPI・実スピーカーの確認へ読み替えず、画像のごみ箱試験は隔離アダプターでの結果として扱う。commit/push・GitHub Release・実利用先deployは行っていない。
- 通常ユーザーのCIM照会で当該試験profileに一致するNode/Electron/.NETプロセス0を確認した。今回の成功出力は方式ごと3回以内で、再利用記録・失敗経緯・固定EXE/ビルド出力と他作業の資料を保持し、削除0件（`cleanup.json`）。

## 2026-10-23: 設定画面の共通レイアウト指針

- cleanなmain/origin/mainから`pull --ff-only`で最新を確認し、`docs/settings-ui-guidelines.md`を共通指針の正本として追加した。`description`は現在の設定値・状態・重要な説明を常時表示し、`hint`は任意の補足として表示設定に従う。エラーの対象、通知を出す条件、操作位置の安定、狭幅・文字拡大・キーボード操作、共通部品の責務を定めた。
- DEVELOPMENTと本体AGENTSから参照を追加し、設定基盤・一覧編集の文書を同じ指針へ接続した。`SettingsHint`の利用を勧める記述と実装例を整理し、現行APIに存在しない`errorLayout="reserved"`の案内を除いた。現行の`inline`/`custom`とアイコン式`SettingsError`、共通レイアウト側の未対応事項を区別した。差分レビューで確定した指針との一致、参照の一元化、保存・入力の既存契約を確認し、未解決の指摘なし。
- 関連5文書のローカルリンク **152件**、Markdown見出し参照 **16件**、コードブロックの対応と`git diff --check`が成功した。検査対象・SHA256・結果は`.artifacts/commit-validation-settings-ui-guidelines-20261023/documentation-check.json`、最終対象・stage tree・実効identity・commit照合は同フォルダーの`validation.json`へ記録する。
- コミット前のGitHub/AQUA mainはいずれも`aea52e990f16087166fb1201f0b4cd726438bf9c`と一致した。AQUAの読み取りは制限内のGit補助プロセス起動が拒否されたため、同一コマンドを通常ユーザーで再実行して確認した。
- 変更は文書6ファイルに限定し、製品コード・設定・保存形式・依存・配布物は変更しない。文書のみの例外に従い、製品回帰・GUI試験・版更新・発行は実施しない。現行版0.83.1を維持し、push・Release・実利用先deployは行わない。

## 2026-10-22: Electron45更新のコミット前確認（0.83.1）

- 利用者からcommit/pushの指示を受領。main/origin/mainと対象4ファイル、実効author/committerを確認した。GitHubのmainは`b94173a`、AQUAはその祖先`c0b287a`で、双方へ通常pushできる履歴と照合した。既存の未コミット変更を保持し、pull/stash/resetや履歴の統合は行わない。
- 実装完了時の全追跡入力・9コマンドの成功ログ・EXE/feedのSHA256、導入済みElectron/builder・Default Shellの版が現在と一致した。型検査・標準833/833（fail/skip 0）、固定EXEのsmoke・倍率11群・画像/Node/.NET9群・更新/再起動13群・進捗9群・信頼診断6結果を再利用する。後続の製品/試験/依存変更がないため、回帰再実行・再発行・追加版更新は行わない。今回の追記は本項の文書記録だけ。
- 対象一覧、再利用元と入力/配布物照合、stageと実ファイル/tree、identity、commitとGitHub/AQUA mainの最終照合結果は`.artifacts/commit-validation-electron45-0831-20261022/validation.json`へ記録する。0.83.1と検証済み配布物を維持し、GitHub Releaseや実利用先deployは行わない。

## 2026-10-22: Electron最新安定版45.0.0でのビルド確認（0.83.1）

- 利用者からElectron最新版への更新とビルド確認を依頼された。cleanなmain/origin/mainからpull --ff-onlyし、先行していたLICENSE追加`b94173a`を取得した。公式Releaseとnpmのlatestを照合し、Electronを **44.9.3 → 45.0.0** へ完全版指定で更新した。共通の最新版選択器で開発Nodeの最新LTSが導入済み24.22.1と一致することも確認した。今回の対象はElectronだけなので、他の依存やbuilderの一括更新は行わない。
- lockfile差分はElectronの版とintegrityだけ。パッケージ全体の待機免除を使い、ほかの7日待機・供給網検査（403 entries）を維持した。制限内の依存リンク作成はアクセス拒否となったため、失敗ログを保存し、同一コマンドを通常ユーザーで再実行して成功した。frozen installと明示postinstallも成功した。
- 45の[公式変更点](https://www.electronjs.org/docs/latest/breaking-changes)を確認した。sandboxed preloadの削除されたBuffer/events/timers/url依存はなく、共通appearance追記もElectronだけを使う。window.open・sandbox・ASARのfd利用も確認し、製品コードの互換修正は不要と判断した。同期safeStorageは45で引き続き利用できるが非推奨のため、46以降の更新前に非同期API対応を確認する。固定builder26.15.3とportable templateの連携は維持した。発行前レビューは未解決指摘なし。
- 型検査とbuild、標準 **833/833（fail/skip 0）** が成功した。依存更新だけでアプリの設定/保存/API契約の追加・削除がないため、通常のパッチ更新として **0.83.1** を発行した。`publish.bat`終了0、EXE/feed/Default Shellの版が一致。EXEは **170470683 bytes / SHA256 `e138f565e1ac8b0e0177dea7be34e0890b6f6f64be717fcd95dbd2806523d7c3`**、`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 固定EXEの実起動で **Electron45.0.0 / Chromium156.0.8078.48 / 内蔵Node24.22.0** を確認した。smoke、表示倍率11群、共通画像/Node・.NET接続9群、更新・実入力・再起動13群、進捗/取消/テーマ9群がすべて成功した。150%の設定画面と狭幅の画像一覧の画像も確認した。2つのeMudhra問題チェーンをNode/Chromiumが証明書エラーで拒否し、正常サイトは両方で成功（計6結果）。内蔵Nodeの表示版を開発用Node24.22.1へ読み替えない。
- GUIはビルド完了後に直列実行し、毎回今回の固定EXEを使った。通知のOS可否/ロックを明示するfixtureと、現行UIの既存driverを再利用し、元の行動・倍率・更新検査は維持した。検査を緩めず期待する本体/Electron版だけを0.83.1/45.0.0へ変更した。物理DPI/ロック画面/UAC/実スピーカー/実Google受信の成功は追加していない。
- コマンド・終了コード・完全ログとhash、検証前後の入力hash・レビュー・driverの元/変更後hash・配布物一致は`.artifacts/electron45-20261022/validation.json`と各phase記録を正本とする。今回の6方式のGUIは正常終了し、当該試験プロセス0を確認した。各方式の今回分とRelease/比較/再利用資料・他作業を保持し、フォルダー削除0件（cleanup.json）。通常publishだけで、全体ZIP・未変更Appletの再発行・GitHub Release・deploy・commit/pushは行っていない。

## 2026-10-22: ランタイム更新規則のコミット前確認

- 利用者から追加の更新規則のcommit/push指示を受領。main/origin/main、未stageの対象11パスと実効author/committer、GitHub/AQUAのmain先端`248f35a`を照合した。未コミット変更を保持し、pull/stash/resetは行わない。
- 実装完了時のmanifest11ファイル・完全ログ5件のSHA256が現在と全て一致した。方針fixture24項目・更新fixture16項目・実pnpm6群を含む関連3テスト（fail/skip 0）、frozen installとsetup2回の成功を再利用する。製品コード・package.json・lockfile・固定ツールに後続変更がなく、追加の製品回帰・版更新・再発行は不要と判断した。今回の追記は本項の記録のみ。
- 対象一覧、再利用元/入力照合、stageと実ファイル・tree・実効identity、commitと各push先mainの照合結果を`.artifacts/commit-validation-runtime-policy-20261022/validation.json`へ記録する。今回の11ファイルだけをコミットし、設定済みのGitHub/AQUAへ通常pushする。

## 2026-10-22: 0.83.0の公開完了・過去Release整理

- 本体`248f35a`、WallpaperSlideshowの生成元記録`8454f59`をGitHub/AQUAへpushし、今回の全体ZIPに同梱した7Appletを照合した。型検査・標準832件の成功は入力hash一致を確認して再利用し、publish・全体ZIP・固定EXEのsmoke/倍率11群/画像9群/信頼診断、portable更新13群・進捗9群・復旧8群、壁紙履歴10群と全体ZIP起動を新たに確認した。UI driverの適応は当該フォルダーの元/変更後hashを記録し、旧ページ構造や既定OFFへの期待だけを現行仕様へ合わせて検査を維持した。
- 本体[0.83.0](https://github.com/yukichi-7sai/AppDock.at365/releases/tag/v0.83.0)、[Profile 0.1.0](https://github.com/yukichi-7sai/Applet.Profile.at365/releases/tag/v0.1.0)、[WallpaperSlideshow 0.7.2](https://github.com/yukichi-7sai/Applet.WallpaperSlideshow.at365/releases/tag/v0.7.2)、[WebApplet 0.3.1](https://github.com/yukichi-7sai/Applet.WebApplet.at365/releases/tag/v0.3.1)を公開した。既存のGmail 0.12.1・Watch 0.1.5・WebBrowserTools 0.3.4・WindowsTools 0.2.2は再作成しなかった。
- 全8repoの匿名ダウンロードsize/SHA256、feedのID/版/payload、実更新検出のavailable/installable/最新版本を照合してから、今回指定された過去の公開Release **16件** を削除した。8repoとも最新の公開Release **1件ずつ** を保持した。通常の最新3件保持は今回の明示指示で1件へ変更し、下書きと削除前のGitタグ参照を維持した。本体0.82.0の下書きは非公開のまま保持した。
- 正式EXEは **169152526 bytes / SHA256 `b3c1d1cc6d964d65df2288ced29fd59dc79c68c0bd52cf01ed42c0eb40c70a75`**、全体ZIPは **285321188 bytes / SHA256 `2e9ebc8a906e99587055f19d176565714587384618530d1141b7ba9dda09d976`**。正式再発行で前回通常publishのhashから変わったため、新しいEXEを固定して全GUIを再確認した。最終時点でもローカル配布物と公開検証済みhashの一致を再確認した。
- source/asset封印、全コマンド・終了コード・ログhash、匿名取得、更新判定、削除前の候補16件・各削除結果・保持したdraft/tagは`.artifacts/release-0.83.0-20261022/`の`plan.json`、`applet-plans.json`、`all-eight-public-verification.json`、`latest-only-cleanup-plan.json`、`latest-only-cleanup-results.json`を正本とする。GitHub作成直後に一覧への反映が遅れた際は、既存draftのID/commit/本文を確認して不足アセット登録だけを再開した。公開済みアセットの上書きや実利用先deployは行っていない。

## 2026-10-22: Release完了後のElectron/Node恒久待機免除

- 全Releaseと過去16件の整理が完了してから着手した。cleanなmain/origin/mainを確認してpull --ff-only成功。`releaseAgeExemptPackages`をNode/Electronだけに限定し、pnpmのElectron免除を版指定からパッケージ全体へ変更した。ほかの依存・pnpm本体/Windows実体の7日待機、公開日時検査、Node LTS/SHA256検査は維持した。
- `update-packages.bat`を更新入口として追加した。公式Node indexの最新LTSとnpmのElectron latest安定版を選び、Nodeの固定版とローカルsetup、Electronの完全版指定、ほかの依存更新の順に実行する。取得/検証失敗では停止し、setup失敗時は元のtoolchain.jsonを復元する。通常ビルドは固定版を使う。開発手順とAGENTSの今後の更新規則を揃えた。
- レビューで選択元・安定版/LTS限定・完全版固定・失敗時停止・junction共有禁止・通常ビルドへの影響を確認し、未解決の指摘なし。Windows PowerShellの方針fixture **24項目**、更新fixture **16項目**、実pnpmの隔離レジストリ **6群** を含む関連3テストが成功（fail/skip 0）。最新版の数値順、beta/Current除外、日時欠落・通信/コマンド失敗、setup後の復元、Electronの即時更新と他依存の待機を確認した。
- `-CheckOnly`の実接続はNode **24.22.1 LTS / Krypton** とElectron **45.0.0** を選択した。今回の依頼は更新規則の設定なので候補照会までとし、新たな依存更新は実行していない。公開済み0.83.0のElectron **44.9.3**・開発Node **24.22.1**、package.json/lockfile/配布物を維持した。設定変更後のfrozen install（403 entries）とsetup2回も成功し、固定環境のhashは不変。製品コード/依存/配布物の変更がないため、追加の製品版更新・再発行・全製品回帰は行わず、公開時の成功結果を保持した。追加の更新規則の差分は未コミット。
- 証跡は`.artifacts/runtime-update-policy-20261022/`と更新fixtureの結果JSON。今回の新しいfixtureは同方式の成功分3回以内を保持し、release-age旧方式も今回の直近3回を保持した。Release/失敗/比較・再利用資料と他作業は保護し、今回作成した成功済み更新fixtureの古い1件だけを削除して直近3回を保持した（cleanup.json）。制限内ではCIM照会不可だったため同一照会を通常ユーザーで再実行し、該当する試験用Electron/Node/.NETプロセス0を確認した。記録・公開物の最終一致確認を除き、後続の製品変更はない。

## 2026-10-22: eMudhra対策とランタイム更新（0.83.0）

- cleanなmain `ecb1603`から`pull --ff-only`で最新を確認。利用者指定によりマイナーを0.83.0へ更新し、Electron 44.6.0→44.9.3、開発用Node 24.21.0→24.22.1 LTSを採用した。lockfileの製品依存差分はElectronだけ。pnpm 12.10.1・builder 26.15.3とportable template、設定・保存・公開APIは維持する。
- 7日未満の採用は今回の明示許可に従い、Node/Electronの完全版だけを例外化。既に成熟した旧例外6件は除去し、他の依存の7日待機・供給元検査・frozen-lockfileを維持。Nodeは公式LTSとZIPのSHA256を確認し、setupの初回・再実行が成功した。制限環境のリンク作成拒否は同一の依存更新コマンドを通常ユーザーで再実行して成功。
- 発行前レビュー1回で版・lockfile・例外・起動/更新経路とABI149を確認し、阻害指摘なし。型検査・標準832/832（fail/skip 0）とWindows PowerShellでのツール方針18件が成功。PowerShell 7での方針fixture起動はJSON整数型の違いで停止したため、setupと同じWindows PowerShellで検証した。製品や検査条件を緩めていない。
- 通常publish成功。固定EXEの起動smoke、表示倍率11群、共通画像9群（Node/.NET接続・Profile・Webを含む）、更新/再起動13群（実入力のジェスチャーを含む）が成功。独立画像ページ待機を現行本体documentへ合わせた既存driverと、通知のOS可否/ロックを明示するfixtureを使用し、元の行動・倍率の検査を維持した。
- 固定EXEのElectron44.9.3 / Chromium152.0.7977.167 / 内蔵Node24.22.0とDefault Shell0.83.0を確認。2種類の問題証明書チェーンをNode側がCERT_REVOKED、Chromium側がERR_CERT_REVOKED/ERR_CERT_AUTHORITY_INVALIDで拒否し、正常対照は両側で接続成功。独立した開発Node24.22.1でも拒否を確認した。内蔵Nodeの表示版を24.22.1へ読み替えず、eMudhra対策のバックポートを実測する。Nodeの診断はTLSハンドシェイクのみ、Chromiumの診断は隔離profileで認証情報なしのHEAD要求。短い待ち時間/正常サイトの転送で止まった記録も保存し、タイムアウトを拒否成功に数えない。
- 実行コマンド・終了コード・ログhash・試験前後の入力hash・EXE一致と失敗/再実行は`.artifacts/security-update-0830-20261022/`、事前調査は`.artifacts/security-audit-20261022/`。Node/Electron更新は完了したが、OS trust-list反映や全Node上流CVEの個別実証、実Google受信・物理DPI/ロック・実NASは今回の追加成功として扱わない。
- Release作業は0.83.0へ切り替える。旧0.82.0とProfile0.1.0は下書きのまま、旧planで再公開しない。新規planと同梱照合・公開後の匿名取得/実更新検出・最新1件を残す整理の最終記録先は`.artifacts/release-0.83.0-20261022/`。利用者から本体と同梱7Applet全ての過去の公開Release16件の削除指示を受領し、全対象の公開後検証成功を条件にする。下書き・Gitタグ/履歴を保持する。
- 全Release作業後、Electron/Nodeのみを7日待機から恒久的に除外し、依存更新時に最新安定Electron/最新LTS Nodeを選ぶ方針変更も依頼された。今回のRelease入力を変えないよう、その変更はReleaseと旧公開物整理の完了後に行う。

## 2026-10-22: 0.82.0のGitHub Release準備

- 利用者から0.82.0のRelease指示を受領。GitHubではv0.82.0が未公開、直近公開版はv0.68.1であることを確認した。対象本体の製品実装は`bfe63f9`、同梱候補は7Applet。公開済み同版は上書きせず、未公開のProfile 0.1.0・WallpaperSlideshow 0.7.2・WebApplet 0.3.1を本体と合わせて扱う。
- 本体の実装時型検査と標準832件、固定EXE GUI11群/smokeの記録を照合した。Release Prepareのregressionには単一の`dev.bat test`全成功ログが必要なため、部分ログの合算で代用せず、今回の準備で実行する。typecheckは製品/試験/依存入力の一致と文書だけの差分を確認して再利用する。
- 最初の準備では標準832/832とpublishが成功したが、同梱WebAppletの共通画像API型不足によりpackが停止し、外部公開は行っていない。WebAppletのみを0.3.1へ互換修正し、標準2件/build/publishと固定本体の共通画像GUI9群で確認。本体の製品変更・版更新は行わない。旧GUIの独立ページ待機は、検査内容を維持したdriverで本体documentへ適応した。
- リリースノートは[docs/releases/v0.82.0.md](docs/releases/v0.82.0.md)。初回の完全記録は`.artifacts/release-0.82.0-20261022/`へ保持し、修正後の新規plan・配布物・更新/復旧/全体ZIP・Applet個別公開・匿名取得/更新検出・最新3件保持の実測結果、各コマンド/終了コード/完全ログ/size/SHA256、対象commitと公開URLの最終記録先は`.artifacts/release-0.82.0-20261022-final/plan.json`および同フォルダーのApplet公開結果とする。実利用先deployは今回の範囲に含めない。

## 2026-10-22: 表示倍率0.82.0の動作確認後コミット

- 利用者から表示倍率の動作確認完了とコミット・pushの指示を受けた。mainの変更25パスをレビューし、表示倍率の設定/保存/API、共通登録、Applet/Web/通知の座標、関連試験と文書が今回の対象であることを確認。追加の製品修正は行っていない。
- 実装時の655入力と現在のSHA256が一致し、型検査/build、関連12ファイル92件、固定EXEのGUI11群とportable smokeの成功を再利用した。未実行だった標準回帰96ファイル740件を追加実行し、標準全108ファイル832/832（fail/skip/cancel 0）の成功が揃った。制限内のWindows/.NET/一時ファイル操作の失敗は保持し、同一コマンドを通常ユーザー権限で再実行して成功。試験前後のソース・生成物hashの一致も確認した。
- 0.82.0の版・発行物を維持。EXEの168,993,727 bytes / SHA256 `12f602b85064cc27ac060c2512eb1d3e0a82f07d013c331fd38e4278c54d4324`、feed、ASARのpackageと生成モジュール、同梱Default Shell、固定GUI/smokeで用いたコピーとの一致を再確認した。再発行・Release・実利用先deployは行わない。
- 開始時のGitHub/AQUAのmainは双方`3040c51081be93d08fe76dfff3fd131d92fcbcc5`でローカルHEADと一致。未コミット変更を保持してpull/stash/resetは行わず、実効author/committerを設定と照合した。対象パス、再利用判定、追加回帰のコマンド/完全ログ/終了コードとhash、stage tree/実ファイル/commit tree、commitと両push先端の照合は`.artifacts/commit-validation-display-zoom-0820/`へ記録する。

## 2026-10-22: Electron画面の共通表示倍率（0.82.0）

- cleanなmain `3040c51081be93d08fe76dfff3fd131d92fcbcc5`でbranch/upstream/worktreeを確認し、`pull --ff-only`はAlready up to date。既存の別worktreeは操作していない。
- 「表示 → 共通」のテーマ直下へ表示倍率を追加。既定100%、フォーム50～200%、JSON/APIは`host.zoomFactor: 0.5～2`。PC専用保存・部分JSON・検索・リセット・共通APIへ接続し、100%は保存から省く。既存の保存値・データを自動変換しない。
- 本体・Shellの全描画領域・ローカル/リモートApplet・Webアカウントの子WebContentsView・独立通知へ共通登録を接続。isolated zoomでorigin間の影響を分離し、設定変更・新規作成・再読込・遷移・再起動へ適用する。.NETが直接出すWindow、Windows標準UI、音声/画像処理workerは除外。
- 発行前レビューで設定/API/保存、画面生成口、セキュリティ境界、座標、通知サイズと試験範囲を確認。埋め込み`AppletSurface.size`がCSSサイズをnative子Viewへ渡していた点を修正し、実ViewのDIPサイズへ統一。Applet/Webアカウントの座標変換と通知workAreaの制限を含め再確認し、未解決の指摘なし。レビュー記録は`.artifacts/display-zoom-validation-20261022/review.json`。設定項目追加のため0.81.0→0.82.0のマイナー更新。
- 固定Node 24.21.0/pnpm 12.10.1、Windows x64、Electron 44.6.0で型検査・build・関連12ファイル92件（fail/skip 0）成功。設定/default/device/JSON/API・配色・通知境界・Webアカウントの既存回帰を含む。標準全回帰や入力フックの実キー試験は今回の変更範囲外のため再実行していない。完全ログ、コマンド/時刻/終了コード、入力一覧/SHA256は`.artifacts/display-zoom-validation-20261022/{typecheck-final,build-final,regression-complete}.json/.log`。
- ソース隔離GUIは`.artifacts/display-zoom-ui-1792611760912/`で11群成功。50/75/100/125/150/200%、同じWebContentsを保持したpage/window/page切替、Web遷移・ローカル再読込、パレット、埋め込みオフラインWebアカウントのCSS→DIP変換、バナー/独立通知、再起動とPC別JSONを検査。native captureで拡大時の本体を確認し、各子描画面も個別に倍率と境界を検査した。
- `publish.bat`成功。発行物の隔離コピーで同じGUI11群（`.artifacts/display-zoom-ui-1792611970498/`）と既存portable smoke（`.artifacts/smoke-1792612018732/`）成功。EXEコピー/元EXE/feedのサイズ・SHA256、app.asar内のpackage、同梱Default Shellの版、主要生成モジュール5件と現在outの一致を確認。記録は`.artifacts/display-zoom-validation-20261022/{gui-portable,smoke-portable,publish}.json/.log`と`artifacts.json`。
- 発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`、168,993,727 bytes、SHA256 `12f602b85064cc27ac060c2512eb1d3e0a82f07d013c331fd38e4278c54d4324`。package/feed/同梱Default Shellは0.82.0。発行中にGUIドライバーへ実行版のassertだけを追加し、製品入力の不変とASAR内の生成物一致を確認した。最終型検査・回帰・固定EXE GUI/smokeの入力hashは前後一致。
- 制限内のGUI接続待ちと.NET発行失敗は成功扱いせず、同じコマンドを通常ユーザー権限で再実行して成功。ソースGUIの追加試験ではショートカットを無効化したfixtureでキー操作を使っていたためパレット待ちに失敗し、公開コマンド呼出とfixture終了処理へ修正して再検証した。失敗profile `.artifacts/display-zoom-ui-1792611237339/`、`display-zoom-ui-1792611500175/`を保持。
- 通知可否はfixtureで許可し、Webアカウントは隔離HTTPSハンドラーでオフライン化した。実ネットワーク、物理DPI変更、Windowsの実受信/ロック/全画面時通知、.NET独自Windowの実表示は今回の検証対象外。利用者による新版の実利用確認は待ち。
- 整理: 今回の倍率専用ソースGUIの成功3回・固定EXE GUI1回と、失敗/再利用証跡を保持。削除候補なし。既存smokeの過去資料は他作業/再利用状況が不明のため保持し、診断用の一時スクリプトだけ除去。コミット・push・GitHub Release・実利用先deployは行っていない。仕様と画面追加規則の正本は[共通表示倍率](docs/display-zoom.md)。

## 2026-10-22: 0.81.0のコミット前確認

- 利用者から0.81.0の動作確認完了と、コミット・pushの指示を受けた。未コミットの条件拡張を保持し、確認済みのソース・試験・依存入力・成功ログと現在の内容を照合した。
- 型検査・build・標準829件・nativeキー50項目・Windows入力228項目・条件fixture33項目・固定EXEのGUI71群/smokeの成功を再利用した。製品・試験・依存・配布物の後続変更はなく、今回の追記は検証文書だけとした。0.81.0と配布EXEのSHA256を維持し、製品回帰の再実行・再発行は行わない。
- 対象一覧、再利用元と入力照合、stage/実ファイル・tree・実効author/committer、commitとpush先端の結果は`.artifacts/commit-validation-shortcut-conditions-0810/`へ記録する。originに設定されたGitHub/AQUAのmainへ、未送信の設計・共通基盤と今回の条件拡張を通常pushする。

## 2026-10-22: キーの「いつ・どこで」を全条件へ拡張（0.81.0）

- 動作確認済みの共通基盤・キー画面を`74b1a1bd63c74a8105acf1d9ffab558a4946f936`（tree `f4ca4775323532d6b2bcf61eeb57313b2617a3d4`、59パス）へコミットした。コミット前の標準827件と既存成功の照合、stage/実ファイル・tree・実効author/committerを確認した。cleanなmainでpull --ff-onlyはAlready up to dateとなり、既存の別worktreeを操作せず条件拡張へ進んだ。pushは行っていない。
- キーにdesktop/browser/exeとglobal/exeのデスクトップ除外を追加した。InputHostが押下時の前面Windowの事実を取得し、既存の条件評価器で一致した行だけの入力ブロックを合成する。first/all・重複除去とは独立させ、AppDock内では同じキーのローカル行を元入力を止めずに共通計画へ渡す。mainは同じ押下対象・revisionを検証する。取得不能な対象条件は一致扱いにしない。
- ブラウザ一覧とChromium条件はkeybindingOptionsへ独立して追加し、既存ジェスチャーの値・保存行の自動移行は行わない。初期値・exe名検証・条件詳細・ブラウザ設定のUIを共有し、専用編集APIのconfigureとwhen Schemaへ接続した。保存・dryRun・revision・3許可・protected keys・既存設定の保持を検証した。設定追加のため0.81.0へマイナー更新した。
- 型検査・本体/Default Shell build・関連165件、標準 **829/829、fail/skip 0**、nativeキー **50項目** と既存Windows入力 **228項目**、開発GUIのキー **13群**・ジェスチャー **21群** が成功した。標準回帰の初回は制限環境によるWindows API/暗号化/一時ファイル操作の失敗で、同じコマンドを通常ユーザーとして実行すると成功した。失敗ログを保持し、依存やチェックの緩和は行っていない。
- 発行前レビューは未解決指摘なし。新しいprocesses配列を含むmanifest条件のdeep clone、nativeへの既知の環境フィールドだけの投影、旧UI試験の8候補への更新を確認した。`publish.bat`終了0。**EXE/feed/Default Shellは0.81.0、EXEは168984723 bytes、SHA256 `eaaecec4c0fa1dcbc6e13c10e308ef09c517ed4ef3ea3e5668dac5ca319cc251`**。成果物は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。
- 固定EXEでキー設定15群・条件付きキーフック13群・ジェスチャー21群・前面化13群・起動2群・設定移動7群（計 **71群**）とsmokeが成功し、各隔離コピーのhashも一致した。実際のShellデスクトップ、WinForms対象、Chromiumの本体を使い、条件不一致時の通過・一致した行だけのORブロック・first/all・重複除去・ローカル重複・無効なexe入力・再起動保持を確認した。両テーマ/3幅の条件編集と、700px幅のブラウザ設定も画像で確認した。
- [検証証跡](.artifacts/shortcut-conditions-20261022/validation.json)に成功/失敗ログ・前後manifest・試験依存・native EXE/DLLと配布物の一致・レビュー・再利用理由を保存した。純粋なnative条件fixture33項目は同じ評価器/fixtureを照合して再利用し、TypeScript側は今回の標準回帰で再確認した。今回の9試験profileとnative fixtureのプロセス0を通常ユーザーで確認し、削除0件。方式ごとの新規成功分は各1回で、固定出力・比較/再利用資料・sandbox失敗・他作業を保持した。0.81.0の追加分は未コミット・未push。Release・deploy・全体ZIP・未変更Appletの再発行は行わず、物理機器/UAC/ロック画面/実利用は隔離環境の合成入力と区別する。

## 2026-10-22: 共通実行基盤・キー設定のコミット前確認（0.80.0）

- 利用者から0.80.0の動作確認完了と、現状をコミットしてから条件拡張へ進む指示を受けた。mainは設計commit1件先行・実装未commitだったため、変更を保持して照合した。既存の型検査・関連163件・Windows入力228項目・条件fixture33項目・配布版GUI66群/smokeは入力と最終EXEのhashが一致し、その成功を再利用した。
- 未実行だった標準回帰を追加し、**827/827、fail/skip 0**。製品ソース・依存・版・発行物の後続変更なしを確認し、0.80.0を維持した。コミット前の対象一覧・入力manifest・stage/tree・実効author/committer・成功ログの照合は`.artifacts/commit-validation-command-foundation-0800/`に記録する。push・Release・deployは行わない。

## 2026-10-22: ショートカットキーの動作設定（0.80.0）

- 既存の段階Aが未コミットのmain／origin/main（設計コミット1件先行）で継続したため、pull・stash・統合は行わず変更を保持した。別の設計用worktreeは操作していない。段階Bとして、設定インデックスとページを「ショートカットキー」、一覧を「ショートカットキー割り当て」へ変更し、一覧の上に初期状態で閉じた「動作設定」を追加した。実行方法のラベル・first/allの表示順・hint・部品をジェスチャーと共有する。レビューで共通セクション間の20px余白も揃えた。
- `keybindingOptions.executionMode`は欠落時all、既定値は差分保存から省略し、ジェスチャーとは独立した共有設定とした。キー全入口の共通アダプターでこの値を読み、フォーム・ページJSON・リセット・外部ファイル更新へ接続した。公開編集はshortcuts.getのoptionsとupdateのconfigureを追加し、割り当てとの原子的保存・expectedRevision・dryRun・3種類の許可を維持した。一般設定APIからの迂回は拒否する。既存行の自動移行は追加していない。設定追加のためマイナー更新した。
- 型検査・本体/Default Shell build・関連13ファイル **163/163、fail/skip 0**、開発GUIのキー **15群**・ジェスチャー **21群**が成功した。キーのfirst/allについて実Windows global入力とChromium合成入力の本体/PageHost、条件によるスキップ・重複除去、保存・JSON・外部更新・再起動・リセット・ジェスチャーとの独立性を確認した。試験側のPromise待機・設定名・Window接続/再起動完了待機と旧表示名の期待値を修正し、失敗ログを保持した。起動直後の失敗1回は、その隔離profileと確認できたElectronだけを終了して再実行した。
- 発行前の自己レビューは未解決指摘なし。`publish.bat`終了0。**EXE/feed/Default Shellは0.80.0、EXEは168989239 bytes、SHA256 `3155ac4b436c58b389aa20add1bacff1208e694b9847831f5bab5831169cb65f`**。成果物は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。InputHost EXE/DLLとnative試験/fixture入力は段階Aと一致し、Windows入力228項目と共通条件33項目の成功を再利用する。
- 固定EXEのキー15群・ジェスチャー21群・前面化13群・キーフック8群・起動2群・設定移動7群（計 **66群**）とsmokeが成功し、隔離コピーのhashも最終EXEと一致した。明暗テーマの1280/900/実700px幅でフィールド・20px余白・画面内への収まりを確認し、画像も目視した。狭幅試験では試験Windowの最小幅だけを解除して、指定幅が900pxへ丸められないことも検査した。
- [検証証跡](.artifacts/shortcut-options-20261022/validation.json)に各ログ・前後の入力manifest・ソース/試験依存/配布物のhash照合・レビュー・失敗履歴・再利用理由を保存した。開発ジェスチャー試験後の差分はキー画面だけへの共通余白class追加であることを照合し、最終配布版で両画面を確認した。今回の14試験profileとnative fixtureに対応するプロセス0を通常ユーザー権限で確認。方式ごとの直近3回を超える今回の不要な成功分はなく、失敗記録・比較/再利用資料・他作業を保持し、削除0件。実装は未コミット・未pushで、Release・実利用先deploy・全体ZIP・未変更Appletの再発行は行っていない。隔離環境の合成入力と、物理機器/UAC/ロック画面/実利用での確認は区別する。

## 2026-10-22: 共通条件判定・コマンド実行基盤の接続（0.79.3）

- 設計文書5ファイルを`eeb2f43`（tree `53ab4d9be6f4fc7e6384d8f63c74826e1356b98d`）へコミットした。対象パス・内容・実効author/committer・リンクを確認し、文書だけのため製品試験と版更新は行わない。cleanになったmain／origin/mainで`pull --ff-only`がAlready up to dateとなってから実装へ進んだ。今回の実装分は未コミットで、pushは行っていない。
- [段階A](docs/command-execution-foundation-design.md)を実装。`command-conditions`と`command-execution`へwhen判定・利用可能性・保存順・重複除去・first/allを集約し、単一の`CommandDispatcher`で予約・再入防止・取消・順次実行を共有する。global、renderer、Shell、PageHostのキー入口とジェスチャーを接続し、GlobalHotKeyManagerの独自実行ループを解消した。nativeの条件と選択は同じfixtureで照合する。
- キーは現行allを維持し、ジェスチャーは保存済みの実行方法を使う。待機表示と本体の選択行ID列を完全一致で検証し、開始対象の事実・session・revision・settingsKeyを照合する。レビューで、40msの同期前に設定/コマンドが変わる場合も受信時・各コマンド直前に止める検査を追加した。押下時のページ条件、元入力の通過/遮断、前面化と同一HWNDでの後続維持を保持する。設定画面・表示名・保存形式・公開Schema・SDKの変更や自動移行はなく、内部整理として本体を0.79.3へパッチ更新した。新しいトリガーの接続規則も文書化した。
- 型検査・本体/Default Shell build、関連9ファイル **122/122、fail/skip 0**、共通TypeScript/native fixture **33/33**、Windows InputHost **228/228** が成功。開発版GUIはジェスチャー21群・ページ条件9群・前面化13群の **43群**、発行した固定EXEは同じ43群にキー設定/実入力10群・Win入力フック8群・トレイ/復元起動2群を加えた **63群** とsmokeが成功した。全標準回帰を一律には実行していない。入力は隔離ウィンドウへの合成入力であり、物理機器の操作感、管理者対象/UAC、ロック画面の確認とは区別する。
- 発行前の差分・影響先の自己レビューは未解決指摘なし。`publish.bat`は終了0。**EXE/feed/Default Shellは0.79.3、EXEは168996670 bytes、SHA256 `a051d2eb59351d6a6a0f2b265988b0fe977a0069762e7d3da5b6f34285bf510e`**。各配布版GUIの隔離コピーも同じhash。配布物のInputHost EXE/DLLは228項目の試験対象とhashが一致するため、その成功結果を再利用した。成果物は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。未変更Appletの再発行、全体ZIP、Release、実利用先deployは行っていない。
- 初回の制限環境でのnative buildは停止し、同一コマンドの通常ユーザー権限での成功を採用した。版更新後のpnpm事前検査は、ローカルworkspace記録が0.79.2のため停止した。junction共有がないことを確認し、固定の`install --frozen-lockfile`でローカル記録を再構築して成功した。依存版・lockfile・toolchain・供給網検査は不変。配布版ページ試験の初回は試験コマンドの引数誤りでEXEの起動前に失敗し、正しいパスで成功した。会話中断時の未完了nativeログは再利用せず、同条件で再実行した228項目を採用した。
- [検証証跡](.artifacts/command-foundation-20261022/validation.json)に完全ログとhash、前後の入力manifest、最終機能ソースとの一致、版metadata/文書だけの後続変更を区別した再利用理由、配布物とコピーの照合を保存。`review.json`と`design-commit.json`にレビュー・設計コミットを記録した。今回の10試験profileとInputTestsに対応するプロセス0を通常ユーザー権限で確認。直近の試験・失敗/中断ログ・固定出力・旧版比較/再利用資料と他作業資料を保持し、削除は0件。実利用での確認は未実施。

## 2026-10-22: 共通条件判定・コマンド実行基盤の設計

- main／origin/main、単一worktree、作業ツリーとインデックスのcleanを確認し、`ce70314`で`git pull --ff-only`がAlready up to dateとなった。現在のresolver／Dispatcher、global・ローカル・Shell・PageHostの入口、InputHost、設定カタログと保存・編集APIを照合して[未実装の設計](docs/command-execution-foundation-design.md)を作成した。
- 最初の実装範囲を「基盤の接続」とし、キーは現行all、ジェスチャーは既存first/allを保つ。共通when判定・保存順の選択・再入防止と、入力ごとの対象・取消を分離する。設定画面の文言変更と折りたたみ、実行方法の保存・API接続は後続工程へ分けた。レビューでは、nativeの捕捉前判定と待機表示の一致、押下時context、前面化、firstの非繰り下げ、元入力のブロックと選択の独立性、既存の共有Settings範囲との一致を確認した。
- 設計書の相対リンク12件と前面化の見出し、入口3文書からの参照、7表の列数、コードフェンス4本の対応、末尾空白、会話上の人物名を含まないこと、`git diff --check`を確認した。実装・設定例の変更はなく、製品試験・build・版更新・publishは実行しない。現在の動作を検証済みに読み替えず、段階A/Bで必要な試験を設計書へ記載した。コミット・push・Release・deployは行っていない。

## 2026-10-22: 2段階移動・前面化のコミット前検証（0.79.2）

- 利用者から2段階移動と最終版の本体前面化の動作確認を受け、関連する変更25ファイルをまとめる。mainの開始先端は`8a36c114c9de2b1e9b9adff1e4ad57354bdf1b15`。fetch後のGitHubと、設定済みpush先`\\AQUA\GIT\AppDock.at365.git`のmainも同じ先端だった。未コミット変更は保持し、pull・stash・履歴統合は行っていない。
- 標準回帰106ファイル・**784件成功、失敗/skip 0**。実装時の関連4ファイル48件と、過去の成功ログへ静的な試験名を対応づけ、require依存・固定Node/lockfile/toolchainが一致した9ファイル39件を再利用した。残る93ファイル697件を今回実行して成功した。
- 制限環境の初回実行はファイル置換・子プロセス・Windows情報取得のアクセス拒否などで失敗し、`sandbox-failed/`へ完全なログと終了コードを保持。同一コマンドを通常ユーザー環境で再実行した成功結果を採用した。検査・依存・設定を弱める変更はない。
- 実装時の型検査、固定EXE0.79.2の前面化13群とsmoke、同一InputHostバイナリのWindows入力228項目、影響のないGUI31群の再利用理由とログを照合した。ソース・試験・出力・成果物のhashに新たな製品差分はなく、利用者が確認した版をそのままコミット対象とする。版更新・再発行は行わない。
- コミット前のstage/作業ファイルの一致、stage treeとcommit tree、実効author/committer、両push先mainとローカルHEADの照合は`.artifacts/commit-validation-gestures-0792/`の`validation.json`・`stage.json`・`commit.json`・`push.json`を正本とする。GitHub Release公開・実利用先へのdeployは対象外。

## 2026-10-22: ジェスチャーから本体・ページを開く際の前面化（0.79.2）

- 直前の2段階移動の未コミット変更を保持して追加修正した。dirtyのためpull・退避・履歴統合は行っていない。設定項目・保存ファイル・公開APIの変更はなく、移行処理もない。
- `showWindow(invocation)`へジェスチャーの開始元を渡し、InputHostで表示前に生存session・開始HWND・本体所有の表示先を確認してから、表示後に前面化する。権限は呼び出しから1.5秒以内・1回だけ。別workerでの`BringWindowToTop`を既存の`ForegroundPermission`へ接続し、フック内で待機しない。本体ページ・設定カテゴリ・コマンド検索は共通入口を使う。
- 前面を移す場合は開始元向けの後続コマンドを止め、元から本体が前面の場合は登録順の実行を保持する。通常のAppletコマンドは開始元の前面を保持する。入力プロセスの準備要求が失敗しても、要求された本体表示は`finally`で行う。
- 発行前の自己レビューで、実Electron Windowでの前面化、表示要求の失敗経路、同じHWNDの後続処理、native試験の自動アクティブ化による偽陽性を確認して修正・再検証した。途中の発行版0.79.1へ同じHWNDの互換性修正を加えたため、発行ごとのパッチ更新規則に従い最終版を0.79.2とした。詳細は`.artifacts/gesture-foreground-20261022/review.json`。
- 旧版0.79.0の隔離EXEで、`appdock.open/hidden/move-left`がvisible/focusedになっても、`GetForegroundWindow`は開始元のままである状態を再現した。記録は`foreground-base-20261021T161017072Z`とprofile `gesture-foreground-1792599017936`。初期化前の試験、前面の干渉が疑われた試験、要求ファイルの読み書き競合の失敗ログは保持し、成功証跡へ流用していない。
- 最終ソースの型検査・build・関連unit/API試験48件が成功。開発GUIと固定EXE **0.79.2** それぞれで前面化13群が成功し、非表示・表示中・最小化からの1/2段階移動、クリック・ホイール・キー、本体表示・設定カテゴリ・ログ、通常コマンドの前面保持、グローバルF16、すでに前面の本体での後続コマンドを実OSの前面HWNDと実行記録で確認した。固定EXEのsmokeも成功。
- Windows入力228項目（全12組の移動、表示、取消、キー解放、右クリック復元、前面化の期限・所有者・単回制約など）と固定EXE0.79.1のGUI31群（ジェスチャー21・ショートカット8・起動2）は成功済み。0.79.1以後の製品差分は`activateGesture`の同じHWNDでの準備省略だけで、これらのGUI fixtureはこの分岐を呼ばず、最終版の13群で追加分岐を確認した。InputHostのEXE/DLLは最終発行物とバイト一致を照合し、入力228項目はその同一バイナリの結果として再利用した。ログ・前後の入力manifest・再利用理由・保持した0.79.1の試験EXEのhashは`validation.json`に記録する。
- 発行先`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`、版`0.79.2`、168,982,144 bytes、SHA256 `02147b04d02bbd3df61f7724443cb4c0c0f7989b95e3ac8d08b166a48fba9caa`。`update.json`の版/size/hash、同梱Default Shellの版、試験コピーのhashを照合する。
- 検証証跡の正本は`.artifacts/gesture-foreground-20261022/validation.json`。各試験は直列の隔離profileで実施した。終了後のプロセス確認は`process-cleanup.json`、成功したテストフォルダーの直近3回と参照状況の整理は`cleanup.json`に記録する。失敗・再利用資料・用途不明のフォルダーは削除しない。
- 最終版の本体前面化は利用者確認済み。昇格対象・UAC・ロック画面は未確認で、Windows上の自動SendInputと実HWNDの検証をこれらの確認と混同しない。実装段階では関連試験に絞り、コミット前の標準回帰は上の記録に記載した。GitHub Release公開・実利用先へのdeployは行っていない。

## 2026-10-22: マウスジェスチャーの2段階移動（0.79.0）

- mainの`8a36c11`、origin/main、作業ツリー・インデックス・未追跡ファイルを確認。cleanのため`git pull --ff-only`を実行し、Already up to dateを確認して設計・実装した。
- 移動の設計を[ジェスチャー](docs/gestures.md#移動の段階と判定)へ集約。既存4方向に、右→上・上→下など異なる2方向の12種類を追加した。各段階に既存の距離設定を使い、同方向の継続は段階を増やさず、3方向目へ変えると解放まで取消する。右ボタン解放時だけ完成した方向列と完全一致する操作を実行し、未割り当ての2段階から1段階へ戻して実行しない。設定編集は1/2段階の選択と最初・次の方向指定、待機表示は矢印列とアクションの更新に対応。公開編集API・保存・検索表示・実行順も同じカタログを使う。
- 保存済みの1段階ID・安定行ID・条件・保存順とfirst/allを保持。設定項目・保存ファイルの追加や自動移行はない。方向転換の取消契約を2方向目から3方向目へ変更するため、操作契約の変更として本体を0.78.4から0.79.0へマイナー更新した。AGENTSと利用者向け仕様、API説明も現行動作へ更新した。
- 発行前の差分・影響先の自己レビューは未解決指摘なし。型検査・本体/Default Shell build、関連4ファイル **47/47、fail/skip 0**、InputHostのWindows入力 **206/206**、開発版ジェスチャーGUI **21群** が成功。12通りすべて、各段階での実行保留、逆方向への折り返し、同方向継続・距離未満の揺れ、未割り当て時の非実行と右クリック非復元、表示の更新/非表示、first/all・条件・重複除去、3方向目の取消を確認した。標準全回帰を一律には再実行していない。
- `publish.bat`が終了0。発行した固定EXEの隔離コピーでジェスチャー **21群**、ショートカット **8群**、トレイ起動/復元起動 **2群**、smokeが成功。配布物のInputHostそのものでも **206/206** が成功し、ビルド出力とのEXE/DLL hash一致を確認した。設定の追加・再編集・実行順・取消・保存・再起動、両テーマ/1280・900・700pxの到達性と横方向のはみ出しなしを検査。開発版と固定EXEの2段階編集画像を目視し、方向選択・無効表示・スクロールと追加ボタンを確認した。
- **EXE/feedは0.79.0、168972289 bytes、SHA256 `e3cf8cf3d711d657a1e7b710390e44d3d5ef698702c2cff65b6e23f12ae14146`**で一致。Default Shellも0.79.0、各固定GUIのコピーhashも同値。成果物は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。兄弟Appletの変更・再発行、全体ZIP、commit/push/Release/実利用先へのdeployは行っていない。
- [検証証跡](.artifacts/gesture-two-step-20261022/validation.json)へ各コマンド・終了コード・完全ログとhash・前後の入力manifest・最終入力との照合・環境・発行物を保存。初期の.NET/GUI/発行は制限環境で停止したため、そのログを保持し、同じ処理を通常ユーザー権限で再実行して成功した。依存版・lockfile・供給網検査は変更しない。発行前の成功からの変更は版メタデータと文書だけで、機能ソース・試験・依存定義が一致することを照合した。
- 整理では種類/実行方式ごとの直近3回、検証・再利用先から参照される旧証跡、他作業での使用状況が未確認の資料と失敗ログを保持し、削除0件。今回のprofileと試験helperの稼働プロセス0を通常ユーザー権限で確認した。[整理記録](.artifacts/gesture-two-step-20261022/cleanup.json)へ確認内容を保存。実物理マウスでの操作感、管理者対象/UAC/ロック画面は今回の確認対象外。

## 2026-10-22: MCP設定修正のコミット・push前確認（0.78.4）

- 利用者が実利用でダイアログ内のエラー表示を確認し、関連変更のコミット・pushを依頼した。mainの`4c6af67`、追跡先、変更13ファイル、実効author／committerを確認。GitHubとAQUAの両mainは同じ先端だった。未コミット変更を保持し、pull・stash・統合は行わない。
- 0.78.4検証時の639入力、完全ログのSHA256と終了0、固定EXE／feedの一致を照合。関連6ファイル62件とソース／固定EXE GUI各10群、smoke、型検査・build・publishの成功を再利用した。残りの標準試験は依存するcompiled JS・試験helperのhashを旧成功記録と照合し、33ファイル164件を再利用。間接入力・native・プロセス・版依存や変更のある67ファイル555件を追加実行し、**標準106ファイル・計781/781、fail/skip 0**となった（再利用226件／追加実行555件）。
- 入力manifestの再照合で製品ソース・試験・依存・発行物の後続変更なしを確認。検証記録だけを追記し、0.78.4の版と配布物を維持した。レビューの未解決指摘なし。証跡は`.artifacts/commit-validation-mcp-settings-20261021/`の`selection.json`、`validation.json`、完全ログ、stage／commit／pushの照合記録。選択一覧は106ファイルを重複なく網羅する。隔離fixtureと実際の2台間同期・外部サービスの確認は区別する。

## 2026-10-21: MCP追加・編集ダイアログ内の入力エラー（0.78.4）

- main／origin/mainとworktreeを確認し、前項0.78.3の未コミット差分を保持して追加修正した。dirtyのため自動pull・stash・統合は行わない。追加／編集でURLが空または不正な場合、ダイアログへ返した例外を`SettingsPageSession`が裏のページにも保存していた。修正前の隔離GUIで、ページモデルの`editing.error`に「MCPのURLを入力してください。」が残ることを再現した。初期のDOM件数だけの確認は非同期反映を見逃したため、回帰ではページモデルとDOMの両方を検査する。
- 発行済みアクションの実行中の失敗は呼出元のダイアログ／操作欄へ返し、設定ページに重複保存しない。`SettingsDialog`内のエラー表示、入力保持、修正後の再保存を維持する。不正なアクションID、フォーム／JSON編集、ページ操作そのものの失敗は従来のページ診断を保ち、operationIdの重複実行防止も維持した。設定・保存形式・公開Schemaを変更しない追加修正として0.78.4へパッチ更新。共通一覧の追加規則とMCPの正本文書を更新した。
- 発行前の自己レビューは未解決指摘なし。型検査・本体／Default Shell build・publishが終了0。関連6ファイル **62/62、fail/skip 0** が成功し、アクションの失敗は呼出元へ返ること、不正ID等はページ診断に残ること、保存済み値の不変と再操作を確認した。標準全回帰の一律再実行は行っていない。
- ソースと新しい固定EXEで専用GUI **各10群** が成功。追加ダイアログの空URL、編集ダイアログの不正URLで、エラーがダイアログ内だけに表示され、名前・URLの入力と既存ファイルを保持することを確認した。修正後は同じダイアログから保存でき、裏のページにエラーや再読み込み案内を残さない。前項の未設定スイッチ、正常行編集、接続成功、通信／認証失敗時のOFF保存＋警告のみ、明示修復、再起動も確認。固定EXEの追加・編集エラー画像を目視確認し、専用ハーネスの正常終了とsmoke成功を確認した。
- EXE／feed／生成・同梱Default Shellの版は **0.78.4**。EXEは **168978899 bytes / SHA256 `9cb1f40de572a514883d4cebf499f354510a3434be92501184e83f0ce1a88d2a`**で、GUIのコピーと一致。`A:\40.ARTIFACT\AppDock.at365`へ発行し、既存の配置スクリプト等4ファイルのhashを保持した。Node 24.21.0／pnpm 12.10.1、固定lockfileと供給網検査を維持した。
- 証跡は`.artifacts/mcp-dialog-errors-20261021/validation.json`、`review.json`、`artifact.json`、入力manifest・完全ログ・各GUI profile。639入力を照合し、unit／ソースGUI後の差分は製品版のmetadataだけで、固定GUI／smoke前後の差分は0。修正前再現と直近の成功profile、前項の再利用資料・固定出力は保持し、今回の削除はなし。実リモートMCP・実2PC同期・利用者の認証による試験は行っていない。コミット・push・Release・実利用先deploy・未変更Applet再発行はなし。

## 2026-10-21: MCP接続先の警告・編集・有効化（0.78.3）

- main／origin/mainのclean、追跡先とworktreeを確認し、`4c6af67`から`pull --ff-only`で最新を確認して実装。共有するID・名前・説明・順序と、PC専用の接続・認証・有効状態・公開許可という保存境界を維持した。設定項目・保存ファイル・公開APIの追加削除はなく、通常修正として0.78.3へパッチ更新した。移行・実利用設定の変更は行わない。
- 未設定と明示OFFの接続先は起動時の警告から除外し、未設定または形式不備で有効なPC接続設定がない行は有効スイッチだけを非活性にした。OFFの認証情報を復号できなくても、他の接続先の編集や起動を警告で妨げない。設定ファイルの外枠と各エントリの検証を分離し、不正な1件と暗号文を保持したまま、他の行の編集・順序変更・接続を可能にした。ファイル全体のJSON不正・未知版・上限超過は、元ファイルを保持して読み取り専用にする。
- ローカルUIでONにする操作と未接続の接続先をONで保存する操作は、接続・ツール一覧取得を確認し、失敗時はその接続先をOFFへ戻して保存する。失敗は安全な警告結果で返し、共通警告バナーだけに案内し、処理エラー通知・設定ページ内エラー・再読み込み案内へ接続しない。ツール取得による接続確認も同様。遅い接続失敗で別編集の新しい接続先をOFFにしない。管理APIの保存時に接続しない契約と、起動時の遅延接続は保持した。
- 発行前の自己レビューで、暫定ONの保存時に設定警告が出て、接続失敗の警告と二重になる可能性を修正した。接続確認の印を保存前から付け、途中の永続警告と処理エラーを抑止する。回帰で保存時・OFF復帰時の永続警告なし、GUIで失敗ごとの警告ログ1件を確認した。最終レビューの未解決指摘なし。正本`docs/mcp-client-design.md`と共通一覧の`canToggle`追加規則を更新した。
- 型検査、本体／Default Shell build、固定依存のinstallとpublishが終了0。関連6ファイル **61/61、fail/skip 0**（MCPクライアント、警告、設定ページ／接続寿命、カスタムコマンド、外部操作）を実行。HTTP JSON/SSE・stdioの既存回帰に、未設定/OFF、破損行の分離と保持、ON失敗のOFF保存、認証失敗、設定競合、警告の二重抑止を追加した。今回の実装段階では無関係な標準全回帰を一律実行していない。
- ソースの専用GUI **7群**と、新しい固定EXEの専用GUI **8群**が成功。未設定スイッチ非活性、正常行の編集、実MCP fixtureへのON/OFF、通信／認証失敗のOFF保存と警告のみの表示、ダイアログのON保存失敗、明示的な接続確認、破損行の明示修復、再起動後の未設定/OFF警告なしを確認。固定EXEのsmokeも成功し、Default Shell起動・bridge・画像・トレイを確認した。固定EXEの設定画面画像を目視確認し、各ハーネスの正常終了を確認した。
- 発行先は`A:\40.ARTIFACT\AppDock.at365`。EXE／feed／Default Shellは **0.78.3 / 168976924 bytes / SHA256 `9531433d1ba59e1c0231f871ed84a5bec53060a707c17235a2440226a11578fc`**で照合し、固定GUIのコピーも同じhash。既存の配置スクリプト等4ファイルのhashを保持した。Node 24.21.0／pnpm 12.10.1を使用し、固定lockfile・供給網検査を維持した。
- 証跡は`.artifacts/mcp-settings-resilience-20261021/validation.json`、`review.json`、`artifact.json`、入力manifestと完全ログ、各GUI profile。入力639ファイルを照合し、最終unit後の差分は専用GUIスクリプトへの版情報追加だけで、固定GUI／smoke前後の差分は0。制限下のEPERM・Electron起動失敗・.NET発行失敗はログを保持し、同一コマンドの通常ユーザー実行で成功を確認した。途中の型エラー・GUI selector不一致も修正後の結果と区別して保持。成功／失敗の新しい出力と再利用資料を保持し、今回の削除はなし。
- 隔離profileとfixtureによる確認であり、実際の2台間同期サービス・実リモートMCP・利用者の認証情報による確認は未実施。コミット・push・Release・実利用先deploy・未変更Appletの再発行は行っていない。

## 2026-10-21: コマンド一覧の横スクロールバーと設定インデックス（0.78.2）

- main／origin/mainのcleanと最新取得を確認し、入力条件のページ化を含む`392e3c1`／発行版0.78.1から実装。長い一覧の下端が約5621px、表示領域の下端が848pxとなる状態を隔離GUIで再現した。横スクロールバーは全行の下へ出ていたため、対象2画面の一覧部分を残りの高さで縦横スクロールさせ、検索・件数・対象解除は一覧の外に保持した。
- サイズ包含で全行の高さが親の最小サイズへ伝わることを防ぎ、説明・操作欄の最小サイズと一覧の80px最小高を保つ。低い画面やジェスチャー動作設定の展開時はページ側のスクロールでも一覧へ到達できる。必要な横バーを12pxで表示し、thumb／trackは共通の中立色を使用。横方向に収まる一覧では横バーを表示しない。
- 設定インデックスのApplet管理に`extensions`、通知に`bell`を追加。リボングループと同じ`shared/ui-icons`を参照し、既存3項目と同じ18px・右余白・選択状態の継承色を使う。保存設定・保存ファイル・公開APIを増減しない表示変更として0.78.2へパッチ更新し、正本`docs/settings-list-editing.md`へ追加条件を記載した。
- 発行前レビューで、広い`command-shortcuts`セレクターがAI一覧にも一致することを見つけ、全ての高さ／スクロール規則を`shortcuts-editor`／`gestures-editor`へ限定した。AIのblock配置とApplet詳細の既存構成を保持。最終レビューの阻害指摘なし。小画面・内容の最小サイズ・到達位置を修正した途中の試験と、修正前再現のログ／画像を保持している。
- 固定install・型検査・本体／Default Shell build・publishが終了0。固定Node 24.21.0／pnpm 12.10.1、LUNAで確認。697入力・822生成物を記録し、最終試験前後で変わった入力はこの文書だけ。
- 最終ソースの専用GUI **13群**と既存移動GUI **7群**が成功。新しい固定EXEでも専用 **13群**＋移動 **7群**、計**20群**とsmokeが成功。明暗×1280×900／760×900／760×640×2画面の**12条件**で一覧の到達性・縦スクロール・最終行を確認し、横にはみ出す**8条件**は12pxのバーから右端の移動列まで到達した。横に収まる検索結果では横overflowなし。新しい5つのインデックスアイコンの存在・右余白・継承色、編集ダイアログの開閉、動作設定を開いた低い画面、AIの既存配置も検査した。固定EXEの明暗画像を目視確認。
- 既存移動GUIで、コマンド別・Applet別の割り当て色、現在画面／非カスタム移動の非表示、左寄せ、余白、絞り込み解除、編集／ON/OFFを再確認した。先行したページ条件変更のコア・unit試験・依存の一致を照合し、標準773件のうち非影響の**707件**を再利用。native再生成・版依存の9ファイル**66/66**を実行し、計**773/773、fail/skip 0**。発行処理中の初回はmounted updater fixture1件で`ok:false`となったが、発行後の同一コマンドでは全66件が成功。原因は断定せず初回ログを保持した。
- EXE／feed／Default Shellは**0.78.2 / 168977979 bytes / SHA256 `6ee8b2de1ac936f835fb4d0cc38a5b10599779e0d69ed350affa2cf6bc3b3fcb`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行。各固定EXEコピー・設定／登録画像の保存先も照合。実利用設定・deploy・未変更Applet再発行・全体ZIP・公開Releaseは対象外。
- 証跡は`.artifacts/settings-scrollbars-index-20261021/validation.json`、`review.json`、`regression-selection.json`、入力manifest・完全ログ・各隔離profile。既存の再利用元、今回の調整過程の成功／失敗、状態不明の出力、固定出力は保護して削除なし。専用試験プロセスの終了を確認。stage／commit tree・名義・両remote先端の照合は同フォルダーへ記録する。隔離GUIの結果を実利用先の物理入力の保証へ拡張しない。

## 2026-10-21: ページ単位条件のコミット前検証（0.78.1）

- 実装時の入力・生成物・native/helper・完全ログと固定EXEのSHA256を現在の内容へ照合し、関連10ファイル91件、固定EXE GUI47群、型検査・build・publish・smokeの成功を再利用した。非影響の3ファイル15件は直前の標準回帰記録と各require依存のhash一致を確認して再利用した。
- 変更した共通条件や設定schemaを参照する試験、版・native出力・ファイル操作に依存する試験を含む残り93ファイルを追加実行し、**667/667、fail/skip 0**。再利用と合わせた標準回帰は106ファイル**773/773、fail/skip 0**。制限環境のWindows/.NETアクセス拒否は同一コマンドを通常ユーザー権限で実行して解消し、失敗ログは別途保持した。検証前後の製品・試験入力は一致した。
- コミット対象の実装・共通API・設定保存・入力経路・設計書を再レビューし、阻害指摘なし。製品内容は発行済み0.78.1のままで、再発行は行わない。追加差分はこの検証記録だけ。開始main `ce6a244`、GitHub/AQUA両mainの同一先端と実効author/committerを確認した。
- 再利用元・依存別の選択理由・入力manifest・完全ログ・発行物照合は`.artifacts/commit-validation-input-pages-20261021/validation.json`と`regression-selection.json`。対象一覧と作業ファイル/stageの一致、stage/commit tree、通常push後のGitHub/AQUA両mainとcleanの照合値は同フォルダーの`stage.json`・`commit.json`・`push.json`へ記録する。

## 2026-10-21: ショートカット・ジェスチャーのページ単位条件（0.78.1）

- cleanなmain `ce6a244`と追跡先を確認し、`pull --ff-only`は更新なし。共通候補`shared/shortcut-pages`を導入し、本体5ページ（ホーム・画像ライブラリー・設定・ログ・通知センター）とAppletの各宣言ページを列挙する。画面を持たないAppletは新規候補から除外し、同名ページには提供元を添える。設定内の各カテゴリは「設定」に含める。表示は「AppDockのすべてのページ」「AppDockの指定したページ」へ統一した。
- 本体は`host:<route>`、AppletはSurfaceの`page:<appletId>:<pageId>`で識別する。実Windowフォーカス・表示中ページをショートカットとジェスチャーの共通判定へ渡し、本体rendererの入力前チェックとShell入力経路も揃えた。公開編集APIは同じ候補とschemaを使用し、`shortcuts.get`/`gestures.get`へ`pages`を追加。設定の自動変換・削除処理は追加していない。設計・仕様は[条件付きショートカット](docs/keybindings.md#ページ候補と識別)、[ジェスチャー](docs/gestures.md)、[外部操作](docs/automation.md)を更新した。
- 発行前に差分・保存形式・公開API・入力経路を自己レビューした。最初の0.78.0固定EXE試験で本体rendererの入力前チェックにページ情報が不足することを検出し、Shell側の同様の経路も修正。開発GUI9群で再検証し、最終レビューの未解決指摘は0。新しい対象ID形式は旧版parserとの往復互換がないため0.78.0へマイナー更新し、発行後の製品修正として最終版を0.78.1へ進めた。
- 型検査・本体/Default Shell build・固定install・標準publishが終了0。関連10ファイルの回帰は**91/91、fail/skip 0**。候補・対象ID検証・ページの識別・owner・実フォーカス・同一Appletの別ページ・設定・公開APIの原子的保存を確認した。製品修正後の最終生成物で関連回帰を再実行し成功した。実装段階の必要範囲を選び、無関係な全回帰は実行していない。
- 最終固定EXEはページ条件専用GUI **9群**、既存keybindings **10群**、gestures **20群**、shortcuts **8群**、計**47群**とsmokeが成功。5本体ページでショートカットとnativeジェスチャーが一致し、同一Appletの2ページ・独立Window・両候補一覧・画面なし除外・検索・保存再起動を確認した。既存回帰でグローバル実OS入力、WebApplet、Gmailのオフライン画面、入力記録、順序、外部競合、明暗3幅も確認。専用GUIの一覧画像を目視し、ページ名・新しい条件名・全候補・ダイアログの到達性とエラー表示なしを確認した。
- 既存GUI試験のportable起動待機は共通`electron-test-launcher`へ揃え、宣言済み設定ページ公開コマンド・ホームにも一致するpages条件・Applet管理から共通画面へ移動する現行経路・平坦な互換コマンド表示へ期待値を更新した。各影響試験を再実行して完走し、試験だけの修正による製品再発行は行わない。失敗ログは保持する。制限内の.NET発行/EXE spawn失敗は同一コマンドを通常ユーザー権限で再実行して成功し、依存・セキュリティ検査は維持した。
- **EXE/feed/Default Shellは0.78.1、168966737 bytes、SHA256 `d139ae99fca6e99e9e6e3edc533e7959ecdee9491cb06c608b33e05903b51e42`**で一致。発行先は`A:\40.ARTIFACT\AppDock.at365\AppDock.at365.exe`。各固定GUIのコピーhashも同値。兄弟Appletの変更・再発行、全体ZIP、commit/push/Release/実利用先へのdeployは行っていない。
- [検証証跡](.artifacts/input-pages-20261021/validation.json)へ620入力・215生成物・native602ファイル・試験helper2件・完全ログのhash、各実行の前後入力、レビュー・再検証・発行物の照合を保存。関連3文書のローカルリンク21件と`git diff --check`は成功。試験ごとの成功を最終ソースへ照合し、後続変更がGUIスクリプトだけであることと公開製品入力が不変であることを検査した。
- 整理では今回の14隔離profileに紐付く稼働プロセス0を確認。今回の成功/失敗証跡と過去の参照付き再利用資料を保持し、再利用範囲が未確定の他作業の古いprofileは削除しない。削除0件を[整理記録](.artifacts/input-pages-20261021/cleanup.json)へ記録した。実物理キーボード・UAC/ロック画面・実サービス受信は今回の確認対象外。

## 2026-10-21: カスタムコマンドのKeyboard Command Keyアイコン（0.77.9）

- 0.77.8の発行・`b37fad2`のGitHub／AQUA push後、追加依頼によりカスタムコマンドのアイコンをGoogle Material DesignのKeyboard Command Keyへ変更。clean／main・追跡先と最新取得を確認し、共通`commandSettingsPages`を通じて設定インデックスと移動ボタンを同時に切り替えた。他のcommand／terminalアイコンは変更しない。
- 公式リポジトリの24px SVGを取得し、pathが完全一致することを検査。文字フォントに依存せず、共通`Icon`の`currentColor`塗りとstrokeなしで描画する。出典・組み込み時の変更内容・Apache-2.0ライセンスを`assets/material-design-icons-LICENSE.txt`へ収録し、配布対象へ追加。組み立て済みapp.asar内の同ファイルがソースと一致することも確認した。保存仕様・設定キー・公開APIを変えない追加表示変更としてパッチを更新した。
- 発行前レビューで阻害指摘なし。固定install・型検査・本体／Default Shell build・publishが終了0。固定Node 24.21.0／pnpm 12.10.1、LUNAで確認。693入力・821生成物とログを記録し、試験前後の差分はこの文書だけ。
- 新しい固定EXEの`settings-hints-ui-test --command-navigation-only` **7群**とsmokeが成功。明暗×1280／760幅で共通アイコン・既存の非表示・左寄せ・左右余白・割り当て色・解除位置・移動／編集を確認し、生成画像の⌘を目視した。12余白条件・33色サンプル・15対象表示の位置を再照合。前段0.77.8のApplet単位判定を含む成功結果を最終版でも確認した。
- unitの試験・import対象compiled main/shared・依存と条件を前段の証跡へ照合し、非影響の**702件**を再利用。native再生成・版依存の9ファイル**66/66**を追加実行して、標準は計**768/768、fail/skip 0**。この版の回帰は初回成功。
- EXE／feed／Default Shellは**0.77.9 / 168969677 bytes / SHA256 `86ca07f984aa25c80e6fd1442cdeb2b3501937af392976bbf297cd65f6e07d89`**で一致。`A:\40.ARTIFACT\AppDock.at365`へ発行し、固定EXEコピー・設定／画像の保存先を確認。実利用設定・deploy・全体ZIP・未変更Applet再発行・公開Releaseは対象外。
- 証跡: `.artifacts/settings-command-key-icon-20261021/validation.json`、`review.json`、`icon-source.json`、入力manifest、`regression-selection.json`、完全ログと隔離profile。前段の資料・失敗／不明出力・固定出力を保持し、今回は削除なし。専用プロセス終了を確認。stage／commit tree・名義・通常push後のGitHub／AQUA両main一致は同フォルダーへ記録する。

## 2026-10-21: Applet単位の割り当て表示と移動・解除の配置（0.77.8）

- main／origin/mainのcleanと最新取得を確認し、`240b815`から実装。Applet管理のショートカット／ジェスチャー移動ボタンは、そのAppletの提供元IDと完全一致するコマンドに割り当てがあれば共通の`accent-action`で表示する。無効な割り当て・停止／無効Applet・ジェスチャー機能OFFでも登録ありとし、キーや実行条件から所有者を推定しない。
- 本体は保存済みコマンドIDと設定カタログの`extensionId`を照合し、該当Applet IDだけを管理用補助モデルへ投影する。未知の提供元や似たIDの混入を避け、設定／ログの移動色・実行可否・外部公開状態を変更しない。割り当て追加・削除と重複の最後の削除で即時更新する。
- ショートカットの移動、カスタムコマンドの操作・移動アイコンをセル内で左寄せに変更。ボタン1個／2個、広幅／狭幅でもセル左右の余白を保つ。ジェスチャーの移動列は従来の配置を保持する。
- 追加依頼により、ショートカット／ジェスチャーのコマンド対象表示と解除ボタンを、Applet対象と同じ検索欄より上へ移動。共通の段落部品を直接使い、対象表示を二重に出さず、スクロールと絞り込み解除を保持した。現行仕様は`docs/settings-list-editing.md`と`docs/applet-management-settings-design.md`へ整合した。
- 発行前レビューで阻害指摘なし。保存設定・保存ファイル・公開APIを増減しない表示変更としてパッチ更新。固定Node 24.21.0／pnpm 12.10.1、LUNAで固定install・型検査・本体／Default Shell build・publishが終了0。
- ソースと固定EXEの`settings-hints-ui-test --command-navigation-only`が各**7群**成功。明暗×1280／760幅×3ページの**12条件**で個数・現在画面除外・左右余白と指定列の左寄せを検査。**33色サンプル**が共通配色と一致し、**15箇所**の対象表示が検索欄より上・左端一致・間隔約12pxで、Applet／コマンド単位の位置が一致した。停止Applet、無効割り当て、未知の類似接頭辞、別提供元、重複の追加削除、既存の移動・解除・編集／ON/OFF、停止Appletを起動しないことも確認。生成画像を目視確認した。
- unitの試験スクリプトとimportするcompiled core/sharedの一致を照合し、非影響の**702件**を再利用。native再生成・版依存の9ファイルを実行し**66/66**、計**768/768、fail/skip 0**。初回はmounted updaterのfixture結果1件で`ok:false`となったが、同一入力・同一コマンドをGUI終了後に再実行して全件成功。原因は断定せず初回ログを保持した。新規GUI fixtureの所有者制約違反と非同期解除の待機不足は試験だけを修正し、失敗ログも保持している。
- 固定EXE smoke・コピーSHA256・設定／共有画像の保存先照合も成功。EXE／feed／Default Shellは**0.77.8 / 168970643 bytes / SHA256 `3a5e12a89c814c080ae434df9a98540e6739801814eca6a4ec751f3328ee1a46`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行した。実利用設定・deploy・未変更Applet再発行・全体ZIP・公開Releaseは変更していない。
- 証跡は`.artifacts/settings-applet-assignment-20261021/validation.json`、入力manifest、`review.json`、`regression-selection.json`、完全ログと各隔離profile。固定出力・再利用元・失敗／状態不明の出力は保護し、今回は削除なし。専用プロセスの終了を確認。隔離fixtureの成功を物理入力や外部サービスの保証へ拡張しない。stage／commit tree・名義・両remote先端の照合は同フォルダーへ記録する。

## 2026-10-21: 移動ボタンの非表示と割り当て別アクセント（0.77.7）

- clean／main・origin/mainを確認して最新取得し、`7c3004f`から実装。カスタム定義ではないコマンドのカスタムコマンド移動ボタンを非表示にした。現在ページの除外を保持し、表示数が1個/2個でも共通の右寄せと右余白を維持する。
- ショートカット/ジェスチャーの割り当てがある移動先は共通の`accent-action`で表示し、ツールチップと読み上げの補足でも示す。本体は保存済み割り当てから重複を除いたコマンドIDだけを補助モデルへ渡す。別ページのキーや条件は渡さず、既存設定・割り当て・コマンド実行を変更しない。無効な割り当てやジェスチャー機能OFFも「登録あり」とし、完全一致で判定する。
- 発行前レビューでIDの照合、未確認コマンド、複数割り当て、色の正本、表示中ページへの保存反映、1個の行の右余白を確認し、阻害指摘なし。任意の内部表示データだけの追加で保存項目/ファイル/公開APIの増減がないためパッチ更新。型検査・本体/Default Shell build・publish成功。共通一覧文書へ表示と判定の規則を反映した。
- ソースと最終固定EXEの専用GUIはそれぞれ**6群**成功。明暗×1280/760幅で現在ページ除外・カスタム以外の非表示・1個/2個の行の余白・既存移動と絞り込みを検査。無効な割り当て、機能OFF、未確認コマンド、似たIDとの非一致、追加/削除の反映、複数のうち最後を削除した場合、両方の入力割り当てを確認。アクセントの**20標本**で文字/背景が共通変数と一致し、「アリス」パレットでも確認した。画像を目視確認。
- unitスクリプトとimport先のcompiled core/shared JSを照合し、既存成功の**702件**を再利用。変更されたmain entrypointはunitではimportされず、補助データ投影を固定EXE GUIで検査した。版とnative再生成の影響先9ファイル**66/66**を通常ユーザー・並列数4で実行し、標準回帰は計**768/768、fail/skip 0**。固定EXE smoke、実行コピーSHA256と設定/画像保存先も成功。固定Node 24.21.0/pnpm 12.10.1、LUNAで確認。
- `publish.bat`終了0。本体EXE/feed/Default Shellは**0.77.7 / 168974360 bytes / SHA256 `0f23216e899d7a8df69a1f81ebe1274b19ef524ac9d3a18dad57d46dafac83b3`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行。実利用設定・deploy・未変更Applet再発行・全体ZIP・公開Releaseは変更していない。
- 証跡: `.artifacts/settings-navigation-assignment-20261021/validation.json`、入力manifest、完全ログ、`review.json`、`regression-selection.json`、`assignment-colors.json`、各隔離profile。成功は方式ごとの直近3回以内で削除なし。再利用元・過去の失敗/状態不明の出力を保護し、専用テストプロセスの終了を確認。隔離fixtureによる検証で、物理入力や外部通信の保証へ拡張しない。commit/pushの照合は同フォルダーへ残す。

## 2026-10-21: 移動アイコンの右余白と現在ページの除外（0.77.6）

- main／origin/main・cleanを確認し、最新取得後の`9a17ac4`から実装。「移動」列は現在の設定ページを除いた2画面だけを表示する。ショートカット/ジェスチャーの固定幅列は2ボタン・間隔・セル左右のpaddingを含めて計算し、枠との接触を解消した。カスタムコマンドも同じ現在ページ除外を使う。左インデックスとApplet管理のアイコンは保持した。
- 発行前レビューで列幅、明暗/狭幅、移動先ID、登録されていないカスタムコマンドへの移動抑止、既存のフィルター解除を確認し、阻害指摘なし。保存項目・ファイル・公開APIを増減しない表示変更としてパッチ更新。型検査と本体/Default Shell build成功。
- ソースと最終固定EXEの`settings-hints-ui-test --command-navigation-only`が各**5群**成功。明暗×1280/760幅×3ページの**12条件**で、全表示行の移動ボタンが2個・現在ページが含まれないことを検査。ショートカット/ジェスチャーの右余白はそれぞれのセルpaddingと1px未満で一致し、広幅18px・狭幅12pxを確保した。既存の移動・絞り込み・解除・フィルター後の編集/ON/OFFも成功。画像を目視確認した。
- 標準回帰は前回の768件とunitスクリプト/compiled main・shared JSを照合し、非影響の**702件**を再利用。版とnative再生成の影響先9ファイル**66/66**を通常ユーザー・並列数4で実行し、計**768/768、fail/skip 0**を確認した。固定EXE smokeとコピーSHA256・保存先の照合も成功。固定Node 24.21.0/pnpm 12.10.1、LUNAで確認。
- `publish.bat`終了0。本体EXE/feed/Default Shellは**0.77.6 / 168973978 bytes / SHA256 `cb460508eb6a129f99895d2c92f3ffaa33c97a4d16c90e65769588e30db39e3d`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行。実利用設定・deploy・未変更Applet再発行・全体ZIP・公開Releaseは変更していない。
- 証跡は`.artifacts/settings-navigation-spacing-20261021/validation.json`、入力manifest、`review.json`、`regression-selection.json`、完全ログ、各隔離profile、余白の実測JSON。成功は方式ごとの直近3回以内で削除なし。再利用元・過去の失敗/状態不明の出力を保持し、専用試験プロセスの終了を確認。隔離fixtureによる画面確認で、物理入力や外部サービスの保証へ拡張しない。commit/push先端の照合は同フォルダーへ記録する。

## 2026-10-21: コマンド設定間の移動・公開表示と一覧UI（0.77.5）

- main／origin/mainのcleanと最新取得を確認し、`4f5072a`から実装。トレイ編集一覧の外枠と固定の設定/終了を除き、項目の枠・プレビュー・実メニューは保持。設定インデックスのショートカット/ジェスチャー/カスタムコマンドに、共通のキーボード/マウス/新しいコマンド画面アイコンを右寄せで表示した。
- Applet管理は操作の右隣、最終列を「移動」に変更。3つのコマンド設定にも同じアイコンの移動列を追加し、移動先ではコマンドIDの完全一致で絞り込む。解除・通常インデックス選択で全体へ戻る。通常コマンドはカスタム登録へ移動できない理由を示し、自動作成しない。移動要求はrenderer内の一時状態で、設定値・実行条件・保存ファイルを増やしていない。
- 公開コマンドの地球アイコンは本体の既存公開カタログから解決。内部の読み取りで一覧IDを共有し、実行許可を付与しない。公開/非公開・停止中/利用不可と実行権限を分離した。カスタム一覧は状態/外部公開列を除き、種類/提供元を分離、操作見出しを左寄せに変更。利用できない理由は名前の下へ保持した。
- 「…」は中央の三点SVGへ変更し、割り当てペアの中央に配置。3列の割り当て一覧は狭幅で一覧内の横スクロールを使う。フィルター後も安定IDで編集・削除・ON/OFFし、全登録数の上限を保持。古い移動完了が後のインデックス選択を上書きしないよう要求番号を照合する。共通UI・Applet管理・トレイ・カスタムコマンド・ジェスチャーとrepo指示を現行仕様へ整合した。
- 発行前レビューは阻害指摘なし。上記の移動競合、表示中行と全体上限、Applet専用入口の移動抑止、狭幅を補正して型検査・本体/Default Shell build成功。保存仕様/API互換性を変えないUI変更として0.77.4からパッチ更新した。固定Node 24.21.0/pnpm 12.10.1/.NET SDK 10.0.402、LUNAで確認。
- 関連6ファイル**43/43**を実行し、コミット前はcompiled JSと試験入力の一致を照合して再利用。native再生成に依存する試験を含む残り**725/725**を通常ユーザー・並列数4で実行し、標準回帰は計**768/768、fail/skip 0**。新しいテストのAPI応答キーを修正する前の失敗ログも保持した。
- 固定EXEの専用GUI **5群**で、明暗×1280/760幅のトレイ編集/プレビュー、共通インデックスアイコンと右寄せ、管理列順、公開/非公開、三点SVGの中央差1px未満、メニュー/Escape、3設定間の完全一致フィルター・解除・通常選択を確認。絞り込んだ2件目の編集/ON/OFFが1件目に影響しないことも確認した。初期ソースGUIも5群成功し、最終修正は固定EXEで検査した。隔離画像を目視確認。
- 固定EXEのApplet管理`--management-only` **14群**とsmokeも成功。提供元フィルター/解除・共通設定/ログへの移動・明暗と狭幅・再起動等の既存操作を保持し、実EXEコピーのSHA256、設定/共有画像の保存先を照合した。パッケージ入れ替えの全インストール試験・物理キー/マウス操作・実ネットワーク通信の保証へ拡張しない。
- `publish.bat`終了0。EXE/feed/Default Shellは**0.77.5 / 168972299 bytes / SHA256 `fda069944d7cbd5ed3f54fdccee0832ca0471d0bd48acd629a2d41f2a51eac27`**で一致し、`A:\40.ARTIFACT\AppDock.at365`へ発行。実利用設定・deploy・未変更Applet再発行・全体ZIP・公開Releaseは変更していない。
- 証跡: `.artifacts/settings-command-navigation-20261021/validation.json`、入力manifest、完全ログ、`review.json`、`regression-selection.json`、各隔離profile。今回の成功は方式ごとの直近3回以内で削除なし。過去の再利用資料・状態不明の出力・修正前の失敗を保持し、今回のテストプロセス終了を確認した。コミット内容と両remote先端の照合は同フォルダーのcommit/push記録へ残す。

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
