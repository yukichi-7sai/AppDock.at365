# TTSサーバー連携と読み上げAPI

## 設定と保存

MCPの[固定設定API](settings-api.md)から通常値と手動ボイス一覧を編集できる。read/writeを使い、読み上げ許可とは分ける。保存による通常の再適用を行うが、候補取得・試聴・通信を兼ねない。暗号化キーとその結び付け先の変更はローカルの設定画面で行う。

PC専用rootのgeneration-ai.jsonのttsへ保存する。保存区分と通知のサーバーID、プリセット別MCP許可は[生成AIのPC専用設定](generation-settings.md)を参照する。

| キー                        | 内容・既定値                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `tts.connections[].authentication` | none（新規登録の既定）／bearer。認証なしではキーを送信せず、Bearerではキーを必須とする |
| `tts.connections[].baseUrl`               | APIベースURL。未設定は空。例: `http://host:8080/v1`                                             |
| `tts.connections[].model`                 | モデルID。未設定は空                                                                            |
| `tts.connections[].defaultVoice`          | この登録で使うボイスID。空欄は音声要求のvoiceを省略                                                                |
| `tts.connections[].defaultInstructions`   | 省略時のニュアンス。既定は空文字                                                                |
| `tts.connections[].alwaysInstructions`    | 毎回付与するニュアンス。既定は空文字                                                |
| `tts.connections[].preset`                | custom（既定）／openai-speech／qwen3-tts／mlx-audio／ollama。詳細値の初期入力に使ったプリセット |
| `tts.connections[].speechPath`            | 音声生成APIの相対パス。既定audio/speech                                                         |
| `tts.connections[].instructionsMode`      | none（既定、送信しない）／json（指定JSON項目へ送信）                                            |
| `tts.connections[].instructionsParameter` | ニュアンスの送信先。既定instructions。入れ子はgeneration.instructのようにドット区切り           |
| `tts.connections[].extraBody`             | 音声生成JSONに追加するオブジェクト。既定{}。例: {"language":"Japanese"}                         |
| `tts.connections[].voicesSource`          | endpointまたはmanual。既定endpoint                                                              |
| `tts.connections[].voicesPath`            | ベースURL配下の相対パス。既定audio/voices                                                       |
| `tts.connections[].manualVoices`          | 手動ボイスのid/name配列。既定空配列                                                             |

URL・モデル・ボイスIDに特定サーバーの値を埋め込まない。モデルとボイスは一覧からの選択と自由入力を提供する。一覧非対応でも直接入力したIDを保存できる。IDの大文字・小文字は維持する。

手動ボイス一覧に固定の件数上限は設けない。MCPのlist対象からid/nameの追加・部分編集・削除・並べ替えを行える。IDは利用するサーバーの値を入力し、名前を省略するとIDを名前に使う。候補の変更では既定ボイスや通知の指定、取得方式を自動変更しない。既存のJSON編集と同じ検証・保存を使い、暗号化情報を変更しない。行参照・制約は[設定API](settings-api.md#tts手動ボイス一覧)を参照する。

APIキーは共有設定へ保存せず、safeStorageによる既存の暗号化方式に合わせてPC専用rootのホスト用秘密領域へ保存する。Applet別SecretsのIDを流用しない。暗号化不可の場合は平文へフォールバックしない。キーの登録・置換・削除はホスト設定画面に限定し、Applet/MCPへ値を返さない。必要な状態表示にはapiKeyConfiguredだけを使う。

キーはPC専用rootのtts-keys.jsonへ登録ID別に暗号化保存し、それぞれ正規化した接続先のハッシュにも紐付ける。同じURLの複数登録でもキーを共有しない。URL変更時に以前のキーを別の接続先へ自動送信しない。「認証なし」ではAuthorizationヘッダーを送らず、OKで保存済みキーも削除する。「APIキー（Bearer）」ではキーの入力欄を表示し、送信時にキーがなければ認証エラーにする。既存のauthentication未指定登録は従来どおり保存済みキーがあれば使用し、編集時にキーの有無から認証方式を選択する。設定と秘密情報は原子的に保存し、失敗時は両方を復元する。秘密情報の保存失敗は画面へ返し、成功扱いしない。

生成音声は共有data/・登録通知音に保存しない。初期実装はサイズ制限付きメモリ保持を優先し、ジョブ終了時に音声参照を解放する。ファイルが必要になった場合だけPC専用一時領域を使い、正常終了・取消・次回起動時に自分のファイルだけ回収する。本文・音声・ジョブ履歴の永続保存は行わない。

## 設定画面

「音声生成AI」は登録サーバー一覧、既定のサーバー、試聴の順に配置する。一覧は登録名・URL・プリセット・モデルと声・MCP公開設定を表示し、追加・編集・削除・並べ替えを共通部品で行う。追加／編集ダイアログに登録名、接続先、APIキー、モデルと声をまとめ、OKで登録単位に保存する。キャンセルは秘密情報も含めて破棄する。最初の登録は既定に選び、以後の追加は既定を変えない。既定サーバーの削除確認では代わりのサーバーまたは未選択を選び、一括保存する。

設定ページでは「既定のサーバー」だけを選択し、選択先のモデル・ボイス・常時付与と既定ニュアンスを通常の読み上げに使用する。これらの値は各サーバーの追加／編集ダイアログだけで編集し、OKで保存する。既定のサーバーを切り替えても各登録の値は変更しない。試聴には独立した一時的なサーバー選択と「話し方」を置き、既定や登録内容を変更しない。話し方が空欄なら選択先の既定を使用し、入力時はその試聴だけ上書きする。「いつも加える話し方」はどちらでも加わる。

追加／編集ダイアログは「接続」「声・話し方」「詳細設定」の3タブで構成する。接続は[生成AIの共通配置](generation-settings.md#共通の編集と試験操作)に従う。声・話し方にはモデル・声・常時付与と既定の話し方、詳細設定には音声生成パス・ニュアンスの送信方式/送信先・ボイス一覧方式/パス/手動一覧・追加パラメーターJSONを配置する。カードや折りたたみを入れ子にせず、広幅では関連する短い項目を横並び、狭幅では縦並びにする。見出し・タブ・共通の確定/取消を本文のスクロールから分け、本文だけをスクロールする。

タブは左右キー・Home/Endでも選択できる。タブや方式の切替では一時入力と取得済み候補を保持し、OKで登録全体を保存する。モデル・声は共通SettingsComboboxで候補選択とID直接入力を一つの欄にまとめ、取得ボタンは欄の横へ配置する。手動一覧の選択中は声の取得ボタンを表示しない。送信先の項目名はニュアンスを送信する場合、ボイス一覧パスはサーバーから取得する場合、手動一覧は手動方式の場合に表示する。方式を変えても値は消さない。不正な一時入力が残る項目は修正できるよう表示を保ち、詳細設定のエラーは他タブからも共通エラー領域と「詳細設定の入力を確認」で到達できるようにする。

### 接続プリセットとカスタム設定

| プリセット                      | 音声生成パス | ニュアンス         | ボイス一覧             |
| ------------------------------- | ------------ | ------------------ | ---------------------- |
| OpenAI Speech API               | audio/speech | JSONのinstructions | manual                 |
| Qwen3-TTS（OpenAI互換サーバー） | audio/speech | JSONのinstruct     | endpoint、audio/voices |
| MLX-Audio（OpenAI互換サーバー） | audio/speech | JSONのinstruct     | manual                 |
| Ollama                          | audio/speech | none               | manual                 |
| カスタム                        | 現在値を維持 | 現在値を維持       | 現在値を維持           |

プリセットの選択と「プリセットの詳細設定に戻す」は共通のapplyTtsPresetで関連値を一度に更新し、既存の設定保存へ一要求で渡す。URL・モデル・登録済みの既定ボイス・既定のニュアンス・登録済みの手動ボイス一覧・追加パラメーター・認証情報を保持する。Ollamaでは既定ボイスが空の場合にdefault、手動一覧が空の場合に[{"id":"default","name":"default"}]をそれぞれ補完する。保存・選択だけでは通信しない。外部設定APIでpresetをsetしたときも同じ初期値を適用し、同じ要求に明示された個別値があればそれを優先する。同じプリセットの再適用で関連値だけが変わる場合も保存する。dryRun・revision・原子的保存を維持する。

手動ボイス一覧は「声のID」「表示名」の行で追加・編集・削除する。IDはサーバーへ送る値、表示名の空欄はIDを使う。空ID・重複ID・不正な長さはダイアログ内に保持してOKを無効にし、最後の有効な候補を保つ。一括編集用の「JSONで編集」も用意し、たとえば `[{"id":"default","name":"標準ボイス"}]` を入力できる。不正なJSONや行がある間は編集方式を切り替えず、修正後に一覧とJSONを切り替えられる。入力確定・Escape取消は共通部品へ委ねる。「手動一覧」を選んでいる間は有効な一時一覧を「声・話し方」の声の候補へ直接反映し、一覧更新ボタンは不要。声のIDの直接入力も利用でき、一覧への登録は読み上げの必須条件ではない。

手動一覧の空欄・空白のみの入力は、確定時に空配列`[]`として扱う。それ以外はJSON構文の解析後、共通のボイス一覧検証で配列・各項目・ID重複を確認してから編集モデルへ渡す。`{}`や項目の型が不正な入力は欄内だけに保持してエラーを表示し、保存済み一覧と表示中の候補を維持する。正しい内容への修正後は通常どおり保存できる。

Ollamaのdefaultはモデル本来の声を選ぶ値。利用可能な別の声はモデルに依存するため、プリセットで声の候補を固定しない。Ollamaの`ollama show <モデル名>`または`/api/show`で確認したIDを手動一覧へ追加できる。

MLX-AudioはベースURLを`/v1`まで指定し、ニュアンスを`instruct`へ送る。モデル・既定ボイスは固定せず、利用するモデルに対応した値を入力する。公式サーバーの`GET /v1/audio/voices`はmodelクエリが必須で、voice packを持たないモデルでは一覧が空になるため、プリセットは手動一覧を使う。言語などのモデル固有値は追加パラメーターで指定する（公式サーバーの言語フィールドは`lang_code`。受け付ける値やニュアンス対応はモデルによる）。

プリセットは接続先の自動検出や読み込み時の強制規則ではない。保存済みの詳細値を毎回プリセットで上書きせず、異なる値は「カスタマイズ済み」と表示する。JSON編集は各項目の確定値を保存する。新しい登録にはcustom/none/空のニュアンスを補う。

Qwen3-TTSの公式Python APIのgenerate_custom_voiceはtext・language・speaker・instructを受け付ける。日本語はlanguage="Japanese"、ニュアンスはinstructで指定する。1.7B CustomVoiceはニュアンス制御に対応するが、0.6B CustomVoiceとBaseは同じ制御を保証しない。AppDockのQwen3-TTSプリセットはinstructを受け付けるOpenAI互換HTTPサーバー向けであり、Python APIへの直接接続や全HTTPサーバーのAPIを保証しない。保存済みのinstructionsParameterは自動変更せず、プリセットの再選択／詳細設定への復元でinstructを反映する。OpenAI Speech APIはニュアンス対応モデルを使用する。OpenAIの2026-10-01告知では従来TTSモデルの2027-01-06終了とRealtime APIへの移行が案内されているが、本プリセットは既存Speech API用で、Realtime通信を実装したものではない。Ollamaは現行の音声APIでinstructionsが未対応のため初期値をnoneとし、将来の対応版や別実装では手動変更できる。

共通instructionsは話し方の文章を渡す契約で、全モデルで同じ声色になることは保証しない。非対応の数値スタイルへ自由文を自動変換せず、本文へ指示を連結しない。instructionsModeがnoneの場合、常時付与・既定値・呼び出し時の指定をすべて無視し、ニュアンスを送信せずに読み上げを続ける。保存済みのニュアンス設定は保持する。instructionsの文字列型検証とrequestIdの重複判定は送信方式にかかわらず適用する。

### 常に付与するニュアンス

サーバーの追加／編集ダイアログの「モデルと声」に「常に付与するニュアンス」を既定のニュアンスの直前へ配置する。`tts.connections[].alwaysInstructions`は既定値と同じ各登録の音声設定に属し、プリセット選択・詳細設定の復元でも保持する。公開設定APIは`service.tts.alwaysInstructions`から取得・変更・リセットできる。空欄が既定なので、未設定の既存環境の動作は変わらない。

発話受付時に、常時付与分、発話ごとの指定（省略時は既定値）の順で、空文字・空白のみの部分を除いて改行1文字で連結する。各部分の本文や内部改行は保持する。発話ごとの明示空文字・空白指定は既定値を使わず、常時付与分だけを送る。両方空ならニュアンス項目を送らない。合成結果は設定済みのinstruct／instructions等へ送り、読み上げ本文へ追加しない。

MCP・Node/.NET Applet・試聴・通知読み上げは共通TtsServiceで一度だけ合成する。受付済みジョブの内容を後から差し替えず、設定変更時は既存仕様に従い再生開始前のジョブを取り消す。再生中は受付時の内容を保ち、同じrequestIdによる再送は取消済みの場合も最初のジョブを返す。常時付与分に特別なモデル上の優先権は与えず、矛盾する指示の解釈や音声への反映はモデルに依存する。

送信先は英字/アンダースコアで始まり英数字/アンダースコア/ハイフンを含む項目名のドット区切り。空要素、配列添字、prototype関連の項目名、本文等の標準項目（model/input/voice/response_format）または非対応のspeedの指定は保存時に拒否する。配列や実行コードの式は扱わない。

### 追加パラメーター

接続先の「追加パラメーター（JSON）」で、音声生成要求のトップレベルへ追加するオブジェクトを設定する。0.150.0以上で利用でき、共通設定APIのservice.tts.extraBodyからもオブジェクトとして読み書きできる。共有設定に保存されるため、認証情報は含めず既存APIキー欄を使う。空の追加設定は{}。Qwen3-TTS CustomVoiceで日本語を指定する例:

```json
{ "language": "Japanese" }
```

文字列・有限数・真偽値・null・配列・入れ子のJSONを保持する。固定の項目数上限は設けず、既存の保存／共通通信の制約に従う。循環参照、非JSON値、prototype関連のキーを拒否する。標準のmodel/input/voice/response_formatと、設定されたニュアンス送信先への重複は保存時に拒否する。速度指定の入口を作らないため、speedも追加パラメーターやニュアンス送信先には使えない。ニュアンス送信先の途中のオブジェクトを配列・文字列・nullなどで置き換える指定も拒否する。

例として送信先generation.instructと追加設定{"generation":{"temperature":0.7}}は併用でき、temperatureを保持したままinstructを追加する。各ジョブが受付時の追加設定を複製し、本文やニュアンスを追加しても保存済み設定を変更しない。空のinstructions指定でも追加設定と常時付与するニュアンスは保持する。UIはEnter/blur確定とEscape取消を使い、不正JSONを保存しない。プリセット選択／詳細リセットでも追加設定を保持する。

### 複数接続と共通再生

接続単位のTtsConnectionSettings、共通発話入力、HTTP要求を構成するttsSpeechRequest、共通再生キューを分離する。接続用の詳細フォームもTtsConnectionDetailsとして値と変更コールバックだけを受け取る。接続は登録IDで選択し、受付時に一つの接続と認証を確定する。公開tts.speak／SDK／MCPは任意のconnectionIdで登録を選び、省略時だけ既定の登録を使う。通知は通知設定の選択先、試聴は試聴欄の選択先を使う。明示した登録が削除済み／不明ならNOT_FOUNDとし、既定へ切り替えない。サーバーの選択は保存済みの既定値を変更しない。同じURLの登録もIDごとのモデル・声・話し方と認証を組み合わせる。ジョブ途中で別接続の値を混ぜず、再生は既存の単一キューを引き続き使用する。

即時保存・入力検証・revision競合・本体描画は既存契約を使う。部分JSONは共有設定だけを対象とし、秘密値を含めない。保存や編集だけで音声を生成しない。「モデル一覧を更新」「ボイス一覧を更新」「試聴」「停止」を明示操作として提供する。試聴は保存済み設定と共通TtsServiceを使い、入力本文を共有設定に保存しない。

本体の設定rendererは共通の設定モデル・操作を使用する。秘密値を保存後の表示モデルへ戻さず、キー更新はホスト所有の専用操作に渡す。利用許可は「操作の許可」のApplet/MCP列へ追加する。

### 音声生成

サーバーのWAVはPCM/floatのRIFF形式を受け付ける。圧縮WAV・RF64等は対応外。ストリーミングWAVのRIFF長が0xffffffffの場合だけ、上限内でHTTP受信を完了してから実長へ確定する。data長も0xffffffffなら最終dataチャンクとして実長を設定し、その後は通常と同じ形式・サイズ・時間検査と共通プレイヤーを使う。任意の不正な長さを補正して受け入れない。

末尾スラッシュを正規化したベースURLにspeechPath（既定audio/speech）を追加してJSONをPOSTする。URL結合で/v1等のベースパスを失わない。生成パスもボイス一覧パスと同じ相対パス検証を通し、別オリジンへの変更は許可しない。

```json
{
  "model": "configured-model-id",
  "input": "処理が完了しました。",
  "voice": "configured-voice-id",
  "response_format": "wav"
}
```

サーバーへの音声生成要求にspeedは含めない。生成側の標準の話し方で作られたWAVを、通知・試聴・共通API・MCPのどの入口からも等速で再生する。AppDockで音声の速度加工や再生倍率の変更は行わない。

本文はUnicodeコードポイントで1～4096文字、空白だけの本文は拒否する。切詰め・自動分割はしない。モデル固有の上限がさらに厳しい場合は生成失敗とする。Node/.NET/MCPでホスト側の同じ検証を使う。

HTTP成功だけで再生へ進めない。Content-Type・RIFF/WAVEコンテナー・サイズ・デコードを確認する。JSON/HTML、破損データ、上限超過はエラー。Content-Lengthを信用して全量確保せず、受信中の累積サイズにも上限を適用する。

URLはhttp/httpsのみ。URL内の認証情報・クエリー・フラグメントを禁止し、リダイレクトは自動追従しない。本文・キー・生のサーバーエラーをログや公開エラーへ含めない。

### モデル一覧

設定ページの`ttsModels`操作から、同じ接続先・認証でベースURL配下の`models`へGETする。モデル未設定でも取得できる。標準の`{data:[{id,name?}]}`とQwen3-TTSの`{models:[{name,id?,downloaded?}]}`を明示的に受け付ける。後者は`id`がなければ`name`をIDとし、`downloaded:false`を候補から除く。モデルのダウンロードや自動選択は行わない。標準一覧に音声以外のモデルが含まれる場合、選択は利用者が判断する。

取得期限5秒、応答1MiB、1000件の制限と重複ID/型検証を適用する。404/405は一覧非対応として手入力を案内する。他の通信障害と区別し、失敗や空一覧で保存済みモデルを消さない。接続先に紐付く認証、リダイレクト拒否、秘密情報を含めないエラーをボイス一覧と共有する。同一所有者の並行取得をまとめ、ボイス一覧とは独立させる。設定・キー・許可変更と終了で中断し、UIでも古い接続条件の応答を採用しない。永続キャッシュと新しい設定項目は追加しない。モデル一覧は設定ページ用の操作とし、Applet/MCP向けには公開しない。

### ボイス一覧

endpointでは同じ接続先・認証でvoicesPathへGETする。初期対応形式は次とする。

```json
{
  "voices": [{ "id": "voice-a", "name": "Voice A" }]
}
```

id必須、name省略時はIDを表示名とする。空ID・重複ID・不正な型は拒否する。別形式を暗黙に推測せず、必要なサーバーが確定した段階で明示的なアダプターを追加する。

相対パスは同じベースURL配下だけに限定する。絶対URL・先頭スラッシュ・上位参照・クエリー・フラグメントを拒否し、一覧取得だけ別の送信先へ向けない。

OpenAI互換はボイス一覧APIの互換性まで保証しない。404/405は一覧非対応として返し、認証・接続障害と区別する。自動で別パスやmanualへ切り替えない。manualでは設定一覧を返し、ネットワークへ接続しない。正常な空一覧と取得失敗を区別する。

一覧にないボイスIDもサーバー設定へ直接入力できる。一覧取得を生成の前提にしない。声が空欄ならHTTP要求のvoiceを省略し、サーバー側の既定を使用する。声を必須とするサーバーの拒否は通常の生成エラーとして返す。試聴・通知・公開発話で同じ扱いとする。

永続キャッシュは作らない。取得期限は5秒、応答上限1MiB・1000件。共有可能な同時取得はまとめ、設定変更前の結果を変更後の一覧として表示しない。

## 共通API

次の5操作をappDockOperationsへ登録し、callersはmcp/appletとする。操作名は言語非依存、説明は日本語とする。サーバー選択を含む現行の発話APIを使うAppletはminimumHostVersionを0.156.0以上にする。

| 操作名            | MCPツール名               | 入力                                          | 結果                              |
| ----------------- | ------------------------- | --------------------------------------------- | --------------------------------- |
| `tts.speak`       | `appdock_tts_speak`       | text、任意connectionId/instructions、requestId | jobId、state、completion:accepted |
| `tts.connections.list` | `appdock_tts_list_connections` | なし | connections:[{id,name}]、任意defaultConnectionId |
| `tts.voices.list` | `appdock_tts_list_voices` | なし                                          | voices、source:endpoint/manual    |
| `tts.jobs.get`    | `appdock_tts_get_job`     | jobId                                         | 状態・時刻・失敗時のエラー        |
| `tts.stop`        | `appdock_tts_stop`        | jobId                                         | 停止後の状態                      |

声は受付時に選んだ登録のdefaultVoiceを使用する。公開発話引数のvoice/speedはINVALID_ARGUMENTで拒否し、再生は常に等速とする。URL・モデル・キーも引数に含めない。connectionId省略時に既定未選択ならTTS_NOT_CONFIGURED、明示したIDが不明ならNOT_FOUNDとする。登録一覧はID・表示名・既定IDだけを返し、接続先や認証を返さず通信しない。既存のtts.voices.listは設定用の候補確認として既定サーバーの一覧を返す。

instructions省略時は受付時のdefaultInstructionsを使用し、指定時はその発話だけ上書きする。空文字・空白だけの指定は既定値を使わない。0.154.0以上では、いずれの場合も設定されたalwaysInstructionsを前に付与する。常時付与分も空ならニュアンス項目を送信しない。型は文字列だけを受け付け、上限は共通通信本文の制限と接続先の仕様に従う。ニュアンスは本文と同様に公開ジョブ・監査ログへ含めず、ジョブ終了時に参照を解放する。通知読み上げと設定の試聴も同じ合成規則を使う。

requestIdは呼出し側が作る1～100文字の一意ID。同じ所有者・同じID・同じ入力の再送は保持期間内に限り既存ジョブを返す。同じIDで入力が異なる場合はTTS_REQUEST_CONFLICT。connectionIdとinstructionsも入力のハッシュへ含め、省略と明示指定を区別する。既定値や設定revisionが変わっても、同じ入力の再送は最初のジョブを返す。再送時も現在の許可を検査する。

受付と重複判定記録は一体で作成する。容量不足など受付失敗ではジョブを作らない。終了済み記録は最大512件かつ終了後30分までとし、稼働中の記録を追い出さない。期限切れ・再起動をまたぐ重複防止は保証しない。応答消失時に新しいrequestIdで自動再送しない。

jobIdは起動単位の推測困難なIDとする。状態には本文・キー・音声・生のサーバー応答を含めない。終了時に本文・ボイス・接続設定・秘密値への参照を解放し、重複判定は入力のハッシュだけを保持する。createdAt/updatedAtはUTCのISO 8601、失敗時はerror:{code,message}を返す。未知ID・記録消失・他所有者のIDはNOT_FOUND。終了済みジョブへの停止は既存状態を返し、再実行しない。

```ts
// appdock-api capabilityと読み上げの許可が必要。
const job = await context.appdock.call('tts.speak', {
  text: '処理が完了しました。',
  connectionId: 'registered-server-id',
  instructions: 'やさしく、落ち着いた口調で',
  requestId: crypto.randomUUID(),
});
const current = await context.appdock.call('tts.jobs.get', { jobId: job.jobId });
await context.appdock.call('tts.stop', { jobId: job.jobId });
```

```csharp
var job = await context.AppDock.CallAsync("tts.speak", new {
    text = "処理が完了しました。",
    connectionId = "registered-server-id",
    instructions = "やさしく、落ち着いた口調で",
    requestId = Guid.NewGuid().ToString()
}, token);
var id = job.GetProperty("jobId").GetString();
var state = await context.AppDock.CallAsync("tts.jobs.get", new { jobId = id }, token);
await context.AppDock.CallAsync("tts.stop", new { jobId = id }, token);
```

.NETは既存context.AppDock.CallAsyncから同じ操作名を呼ぶ。Nodeの型付き操作一覧・入出力型と共通Schemaを更新する。起動前・終了中は既存NOT_READY契約に従う。

## 許可と所有者

読み上げ専用useTtsをApplet/MCPそれぞれに設ける。生成はread+execute+useTts、一覧はread+useTts。新規環境はApplet側がON、MCP側がOFF。既存保存形式の省略項目は拒否を維持し、他の許可から推定して有効化しない。

状態取得はread、停止はread+executeを必要とする。useTts取消後も他の必要許可が残っていれば状態確認・停止ができる。useTts取消時にはホストが該当する稼働中ジョブを自動取消する。MCP連携OFF、Applet停止・異常終了、ホスト終了でも対象ジョブを取り消す。

所有者はホストが接続から確定し、API引数で受け取らない。Appletは自分のジョブだけを参照・停止できる。MCPは現在の認証境界に合わせた共通所有者とし、MCP起点のジョブだけを扱う。MCPクライアント同士の分離は初期実装で保証しない。ホスト画面だけは全体停止できる。

MCPからApplet公開コマンドを経由した場合も、元MCPとAppletの許可・実行世代、および選択したプリセットのMCP許可を検査する。

MCPのspeakは外部通信と再生を伴う操作として宣言する。状態取得はread-only、stopは変更操作。speakには重複判定の保持期限があるため無条件な冪等性を宣言しない。監査ログは操作名・所有者・受付ID・成否に限定する。

## 状態・再生・取消

状態はqueued → generating → waitingPlayback → playing → completed。受信・検証はgenerating、共通キューの待機・プレイヤー準備はwaitingPlaybackに含める。終端状態はcompleted/failed/canceledで、終端から別状態へ遷移しない。

TTSジョブは生成から再生までを1件ずつ順番に実行し、先行生成や並列生成は行わない。音声を受信するとwaitingPlaybackとなり、通知音・試聴と共通のFIFOへ入る。生成中は再生枠を予約せず、準備できた音から再生する。playingへの遷移と開始期限の解除は実際の再生開始直前に行う。

| 制限             | 初期値                                         |
| ---------------- | ---------------------------------------------- |
| 稼働中ジョブ     | 全体16件。待機・生成・再生を含む               |
| キュー待ち       | 受付から10分。超過はfailed                     |
| 生成・受信       | 開始から180秒                                  |
| 音声受信         | 最大64MiB                                      |
| 再生可能時間     | デコード後10分以下。超過は再生前に拒否         |
| 再生監視         | 音声長+30秒。終了通知がなければfailed |
| デコード後の容量 | PCM/float WAVのみ。推定256MiB以下              |

初期値は内部定数として試験し、変更には実測の根拠を残す。件数・サイズ・時間に加え、デコードによるメモリ増加も検証する。

再生のended通知でcompletedにする。HTTP成功、play呼出し成功、受付成功だけでは完了にしない。completedはプレイヤーの終了確認であり、ミュート状態や物理スピーカーから聞こえたことを保証しない。

取消は待機からの除去、HTTP Abort、プレイヤー停止、音声参照解放を行う。遅れて届く応答・イベントはジョブIDと世代で無視する。サーバー内部の生成計算まで停止できたことは保証しない。停止APIはローカル停止を確認してから返す。

キー変更・削除も同様。新規受付は一貫した設定・秘密参照を確定し、処理途中で別の設定を混ぜない。許可取消・終了時は再生中も停止する。

プレイヤーはsandbox/contextIsolationを有効にし、Node・外部ページ・外部ネットワークへアクセスさせない。再生失敗・異常終了時も必ず回収し、次ジョブへ進める。共通プレイヤーを回収してから次の音へ進める。通知音とTTSの各上限・登録素材の保存契約は呼出元で維持する。

## 音ライブラリーからの生成

本体の音声生成ダイアログは、内部専用の生成経路で同じ受付・設定スナップショット・認証・TTSキュー・HTTP取消・WAV検証を使う。毎回新しい要求として生成し、検証済みの音声を本体内で保存処理へ渡す。この経路では自動再生を行わず、内部ジョブのcompletedは音声の受信・検証完了を意味する。通常のspeakと公開APIのcompletedの意味は変えない。音声データをApplet/MCPや描画側へ返すAPIは追加しない。

複数カードからの依頼も同じTTSキューへ登録し、queued/generatingを各カードへ反映する。描画側の受付完了と音声生成完了は分け、カードごとの取消は対応するジョブだけを停止する。共通キューの受付容量・待機期限など既存制約は維持し、受付・生成の失敗は当該カードに表示する。保存用の受信上限は音ライブラリーの16MiBへ合わせる。保存状態・再試行・画面終了時の寿命は[素材ライブラリー](asset-libraries.md#音声生成)を正本とし、試聴は共通audioPlaybackへ接続する。

## エラー契約

受付前の入力・未設定・許可・容量エラーはAPIエラー。受付後の生成・受信・再生失敗はジョブのfailed。自動再生成・再生は行わない。

| コード                                      | 意味                                      |
| ------------------------------------------- | ----------------------------------------- |
| INVALID_ARGUMENT                            | 空本文、非対応引数、入力上限超過            |
| TTS_NOT_CONFIGURED                          | 接続先またはモデル未設定                  |
| API_DISABLED / NOT_READY                    | 既存APIの許可・起動状態による拒否         |
| TTS_QUEUE_FULL / TTS_QUEUE_TIMEOUT          | 件数超過／待機期限超過                    |
| TTS_REQUEST_CONFLICT                        | 同じrequestIdで異なる入力                 |
| TTS_AUTH_FAILED / TTS_RATE_LIMITED          | HTTP 401/403／429                         |
| TTS_CONNECTION_FAILED / TTS_TIMEOUT         | 接続障害／生成・受信期限超過              |
| TTS_SERVER_ERROR                            | その他HTTP失敗・サーバー拒否              |
| TTS_INVALID_AUDIO / TTS_AUDIO_TOO_LARGE     | 不正音声／受信上限超過                    |
| TTS_AUDIO_TOO_LONG / TTS_PLAYBACK_FAILED    | 再生時間超過／デコード・再生失敗          |
| TTS_VOICES_UNSUPPORTED / TTS_INVALID_VOICES | 一覧API非対応／一覧形式不正               |
| TTS_MODELS_UNSUPPORTED / TTS_INVALID_MODELS | 設定ページのモデル一覧API非対応／形式不正 |

一覧取得の5秒期限もTTS_TIMEOUTとする。サーバーのエラー本文には入力テキストが含まれる可能性があるため、そのままUI・MCP・ログへ流さない。公開エラーはHTTP状態などの安全な情報に限る。

## 外部仕様の参照

- [Ollama Speech](https://github.com/ollama/ollama/blob/main/docs/capabilities/speech.mdx): defaultボイス、モデル別ボイス一覧とAPI。2026-11-05確認。
- [OpenAI Create speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create): 音声生成、速度、返却形式。互換サーバーの追加API・実装動作は別途確認する。
- [OpenAI Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech): ボイス・音声形式。
- [OpenAI List models](https://developers.openai.com/api/reference/resources/models/methods/list): 標準モデル一覧のエンドポイントとdata/id形式。
- [OpenAI廃止予定](https://developers.openai.com/api/docs/deprecations): 既存Speech APIモデルとRealtime移行の案内。
- [Ollama Speech](https://docs.ollama.com/capabilities/speech)、[対応表の原文](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx): WAV/PCM、ストリーミング長、速度とinstructionsの対応範囲。
- 接続するサーバーの/openapi.json、/v1/audio/voices、モデル情報を実装時に再確認する。取得したボイス・ダウンロード済みモデルのスナップショットを製品の固定仕様にしない。

- [Qwen3-TTS公式CustomVoice](https://github.com/QwenLM/Qwen3-TTS#custom-voice)、[公式推論実装](https://github.com/QwenLM/Qwen3-TTS/blob/main/qwen_tts/inference/qwen3_tts_model.py): instruct・language・speakerとモデル別ニュアンス対応（2026-11-05確認）。
- [MLX-Audio公式サーバー実装](https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/server.py): SpeechRequestのinstruct・lang_code、audio/speech・models・モデル別audio/voices（2026-11-05確認）。
