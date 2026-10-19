# 一覧形式の設定編集UI

追加する操作ヒントや確定操作の補足は共通`SettingsHint`を使用し、カードのdescriptionやエラーと区別する。ヒントの表示設定とダイアログ内への適用は[設定基盤](settings-foundation.md#ヒントと一時表示)を参照する。

複数の登録項目を管理する設定画面は、AI接続一覧の「一覧＋追加／編集ダイアログ」を基本形とする。利用者が一覧で内容を見渡し、一つの登録に必要な項目をまとめて確定できる構成へ揃える。本体設定と、独自の設定画面を持つAppletで新規作成・改修する際の共通指針とする。

保存の基本契約は[設定基盤](settings-foundation.md)、AI固有の仕様は[AI文章生成](ai.md)を正本とする。この指針だけを理由に既存画面や公開APIを一括変更しない。

## 適用する場面

| 設定の性質                                               | 基本形                                               |
| -------------------------------------------------------- | ---------------------------------------------------- |
| 名前・接続先・認証など、複数の項目で一つの登録が成立する | 一覧＋追加／編集ダイアログ。OKで登録単位に保存       |
| 独立したON/OFF、共通プロンプト、既定値など               | 通常の項目行。既存の即時保存                         |
| 履歴や実行結果など、閲覧が目的                           | 閲覧用の一覧。編集操作は必要なものだけ               |
| ショートカット、ジェスチャーなど固有の操作契約がある     | 共通の見た目とダイアログ基盤を利用し、固有仕様を保持 |

ページ全体の保存／破棄、共有ドラフト、未保存通知は設けない。登録を編集中の一時入力だけを、そのダイアログ内に保持する。単純な設定まで一律にダイアログへ移さない。

## 一覧と操作の配置

- 既存の設定ページ・セクションの中に一覧を置く。上位ページのタイトルや説明を一覧内へ重ねて表示しない。
- 一覧の近くに「＋ 追加」を置く。順序に意味がある場合は、その隣に並べ替えボタンを置く。件数や登録上限があれば同じ操作欄に表示する。
- 行の主情報は名前と用途の判別に必要な値に絞る。補足は一段下へ控えめに表示する。詳細設定の全項目や秘密値を一覧へ並べない。
- 右端を操作列とし、編集は歯車、削除はゴミ箱を基本にする。アイコンだけでも対象と動作が分かるアクセシブルな名前を付ける。例：「接続名を編集」。
- 空の一覧にも追加ボタンと簡潔な案内を表示する。上限到達、並べ替える項目が足りない場合などは、該当する操作だけを無効にする。
- ショートカット／ジェスチャーと同じ表の余白、罫線、行背景、操作ボタンの寸法を使う。AI一覧を具体例にし、列幅だけを対象に合わせる。
- 行の識別には安定したIDを使う。名前や表示順の変更で別の登録として作り直さない。

追加・編集の完了後は、一覧の検索・選択・スクロール位置を保つ。追加行への自動スクロールや自動フォーカス移動を行わず、元の操作ボタンへフォーカスを戻す。削除等で元のボタンが消えた場合は、追加ボタン等の安定した操作へ戻す。

## 追加と編集は同じダイアログ

追加と編集で同じフォーム部品を使い、タイトル・初期値・確定時の操作を切り替える。主要な入力を最初から表示し、利用頻度の低い詳細設定は折りたたむ。種類によって必要な項目や初期値が変わる場合も、利用者が入力した値を不用意に消さない。

共通の`SettingsDialog`を使い、タイトルと閉じる操作、スクロールする本文、キャンセルとOKのフッターを揃える。入力エラーや詳細設定の展開で、押そうとしているOKや取得ボタンが大きく動かない配置にする。狭い画面でもフッターへ到達できる高さに制限する。

### 一時入力と保存

1. 開く時点の対象を複製し、変更前の値と一時入力を分けて保持する。追加では一覧へ空の登録を先に保存しない。
2. 入力・補正・候補取得は一時入力だけを変更する。`settings.json`や関連する秘密値ファイルへは書き込まない。
3. OKで登録全体を検証し、保存側へ一つの操作として渡す。保存側でも入力と競合を検証する。
4. 保存成功時だけ閉じ、最新の保存値から一覧を更新する。保存中は二重送信と閉鎖を防ぐ。
5. 入力不正・通信失敗・保存失敗では、入力と原因の説明をダイアログ内に残す。キャンセル・Escape・画面破棄では一時入力を破棄する。

保存側は対象の変更前の値やrevisionを照合し、最新の設定へ対象の変更だけを合成する。古い一覧全体で上書きしない。同じ対象が外部から更新・削除されていたら競合として扱い、勝手に上書き・再作成しない。設定と関連ファイルを同時に更新する場合は、既存のトランザクションと失敗時の復旧を使う。

### 入力確定と接続確認

- URLには`SettingsUrlInput`を使い、入力途中の`:`や`/`を保持する。補正と検証はEnterまたはblurで行う。ダイアログ内の確定は一時入力の更新であり、保存ではない。
- 接続確認や候補取得は明示操作にする。AIの例ではURL／APIキーのEnterとモデル横の取得ボタンで候補を取得し、blurでは補正だけを行う。
- Enterの意味を項目ごとに定め、取得用のEnterでダイアログ全体を保存しない。文字欄に未確定の変更があればEscapeでその欄を戻してダイアログを保ち、変更がないEscapeでダイアログを取り消す。複数行はEnterで確定・Shift+Enterで改行し、IME変換中のEnterやEscapeを確定・閉鎖と誤認しない。
- 未保存値での接続確認は、取得結果だけを表示する。自動保存・自動生成・失敗後の自動再試行を混ぜない。候補一覧が使えない場合も、対象の仕様が許すなら手入力を残す。
- 通信中の状態とエラーを対象の近くへ表示する。入力変更後・閉鎖後の古い結果を採用せず、取消は要求ID等で対象を限定する。

## 削除と並べ替え

登録内容をまとめて失う削除では確認ダイアログを基本とし、対象名と実際の影響を示す。確定ボタンは「削除」など結果が明確な文言にする。キャンセルでは変更せず、失敗時は確認画面にエラーを残す。関連データや既定項目への影響は、保存側の一つの操作として処理する。

既存のショートカット／ジェスチャーは確認なしの即時削除が固有仕様である。この共通指針で上書きせず、変更する場合はその機能の仕様として判断する。

並べ替えは専用ダイアログへ対象の一覧を表示し、ドラッグハンドルと上下ボタンを併設する。キーボードでも操作でき、移動結果が分かる案内を付ける。移動中はローカルの順序だけを変更し、OKで確定、キャンセルで破棄する。

表示順・実行順・優先度のどれを変えるかを明記する。AI接続は表示順だけで、生成の優先度にはしない。保存時は元のID列と変更後のID列を検証し、追加・削除・別の並べ替えとの競合を検出する。順序だけを最新の登録内容へ適用し、並べ替え中に更新された別の項目を古い値へ戻さない。

## 利用する共通部品と実装例

| 役割                     | 参照先・責務                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ページと項目の配置       | [SettingsPageLayout](../src/renderer/settings/SettingsPageLayout.tsx)、[SettingsSections](../src/renderer/settings-ui/SettingsSections.tsx)。見出し、余白、カード、項目行、フィードバック                                     |
| モーダルの表示寿命       | [SettingsModal](../src/renderer/settings-ui/SettingsModal.tsx)。native dialog、フォーカス囲い込み／復帰、IME対応のEscape、背面の入力操作の一時停止                                                                              |
| 非同期の確定操作         | 同ファイルの`SettingsDialog`。OK／キャンセル、処理中の無効化、重複防止、失敗時の入力保持                                                                                                                                      |
| 入力とテーマ             | [SettingsInput](../src/renderer/settings-ui/SettingsInput.tsx)、[controls.css](../src/renderer/settings-ui/controls.css)、[settings-sections.css](../src/renderer/settings-ui/settings-sections.css)。URL入力、共通の色・余白・状態 |
| 一覧とダイアログの接続例 | [AiSettings](../src/renderer/settings/AiSettings.tsx)。追加／編集／削除／並べ替えの入口、検索アンカー                                                                                                                       |
| 関連項目と順序の編集例   | [AiConnectionDialog](../src/renderer/settings/AiConnectionDialog.tsx)。一時入力、明示的な候補取得、詳細折りたたみ。順序編集は共通SettingsOrderDialogへ接続                                                                                 |
| 保存側の例               | [AiSettingsController](../src/main/core/ai-settings.ts)。登録単位の検証、競合、関連ファイル、順序の合成                                                                                                                       |

共通部品は表示と操作中の状態を担い、設定の保存・認証・通信の規則は所有しない。AIの一覧・保存Controllerは具体例であり、任意の設定を扱う汎用CRUD部品ではない。AI固有のモデル・キー・登録上限を別機能へコピーしない。新たな共通部品を切り出す場合は、実際に共通する表示と操作に限定する。

本体の設定ページでは公開されたSettingsPageの操作契約を通して本体が検証・保存し、本体rendererは描画と一時入力を持つ。Shellごとの内部importや専用の保存経路を増やさない。

## ダイアログを追加する

開くボタンの所在と、ダイアログを描画する場所を分けて決める。リボンやタイトルバーが入口でも、本体の設定を編集するダイアログは本体rendererに表示する。ダイアログ自体の描画をShellへ提供させる場合は、[共通オーバーレイ](shell-overlays.md)の表示モデル・操作・寿命の契約を使う。

### 共通部品の選び方

| 用途 | 使用する部品・経路 | 呼出側が用意するもの |
| --- | --- | --- |
| 通常の追加・編集・削除確認 | `SettingsDialog` | タイトル、一時入力、検証、保存処理、閉じる処理 |
| キー記録など独自の本文・フッターが必要 | `SettingsModal` | 見出しと`labelledBy`、本文・ボタン、初期フォーカス、処理中の制御 |
| 設定以外の本体内プレビュー等 | 本体documentの`<dialog>`を`showModal()`で開く | ラベル、初期フォーカス、Escape・取消・復帰、必要な入力停止 |
| パレットのように描画をShellへ差し替える | `OverlayController`と`OverlayHost` | 内容別モデル・操作・取消。新しい種類は公開契約と描画側も追加 |

`SettingsDialog`と`SettingsModal`は[SettingsControlsProvider](../src/renderer/settings-ui/api.tsx)の配下で使用する。本体のルートと設定ページは既に接続している。別のSurfaceや試験へ持ち出す場合は、そのSurfaceで許可された`SettingsControlsApi`を注入する。ShellのHTMLへ本体用部品や`window.dock`を持ち込まない。

### SettingsDialogの使用例

以下は`src/renderer/settings/`に置く部品の例。親は開く間だけmountし、`onClose`でunmountする。別の登録へ切り替えるときは対象IDで`key`を分け、一時入力を取り違えないようにする。

```tsx
import { useState } from 'react';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsInput } from '../settings-ui/SettingsInput';

export function ItemNameDialog({
  original,
  onSave,
  onClose,
}: {
  original: string;
  onSave(name: string): Promise<unknown>;
  onClose(): void;
}) {
  const [name, setName] = useState(original);
  return (
    <SettingsDialog
      title="名前を編集"
      valid={name.trim().length > 0}
      onApply={() => onSave(name.trim())}
      onClose={onClose}
    >
      <label>
        名前
        <SettingsInput
          data-initial-focus
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
    </SettingsDialog>
  );
}
```

`onSave`は機能側の既存の検証・競合検査・保存操作に接続する。上の`name`はローカルの一時入力であり、入力ごとの永続保存は行わない。保存失敗はrejectまたはthrowで返す。`SettingsDialog`がエラーを表示して入力を保持し、成功時だけ`onClose`を呼ぶため、呼出側で先に閉じない。`valid`は画面の確定可否であり、保存側の再検証も必要になる。

`SettingsDialog`はnative dialogの開始、見出し、本文とフッター、保存中の二重送信・閉鎖防止を扱う。`applyLabel`で「追加」「削除」等を指定できる。`children`に`(ready, setError) => ...`を渡すと入力受付の準備状態とエラー表示口を利用できる。この`ready`はショートカット等の入力停止の準備であり、背景画像の描画準備とは別の状態である。

`SettingsModal`を直接使う場合は、見出しIDを`labelledBy`へ渡す。初期フォーカスは`data-initial-focus`または`initialFocus`で指定し、`onReady`で入力受付を制御し、失敗は`onError`へ接続する。非同期処理中は`closeDisabled`と自前のボタン無効化・重複防止を揃える。同じ本体documentの開く前の要素へフォーカスを戻し、その要素が削除された場合は`data-dialog-focus-fallback`を付けた安定した操作へ戻す。

### 描画順と背景の管理

背景処理は[本体preload](../src/main/preload.ts)が同じdocumentの`dialog:modal`を監視して開始する。共通部品は内部で`showModal()`を呼ぶため、ダイアログごとの登録・描画順変更・待機時間の追加は不要。独自の本体内ダイアログも`showModal()`で開く。`show()`、`open`属性だけの表示、`div`による独自の覆いはこの判定の対象にならない。

準備中の透明化は[本体の共通CSS](../src/renderer/style.css)の`data-host-modal-pending`に従う。機能側でこの属性を操作したり、独自のopacity・animationで準備完了前に表示したりしない。通常のスタイル追加も既存の外部CSSへ置き、CSPを緩めない。

本体documentのnative dialogを開く間は、[HostModalLayer](../src/main/core/host-modal-layer.ts)が登録されたShellの描画面をまとめて背景として扱う。表示中の各Viewの画像を元の表示順で同じdocumentへ置き、その上からdialogの`::backdrop`で暗くする。準備中はdialogと`::backdrop`を透明に保ち、すべての画像の読み込みと配置、native Viewの一時非表示が完了した応答を受けてから両方を一緒に表示する。これにより、グレーの表示後に描画順が切り替わる瞬間を見せない。待機中もnative dialogのフォーカス囲い込みを保ち、閉じた後や古い寸法への遅延応答では表示を再開しない。画像の取得・decodeに失敗した場合は元のViewを保持してdialogの操作を再開する。renderer・接続・状態は保持し、画像は寸法・zoom・提供元・対象集合の変更時に更新する。

描画面の所有者はViewを`register(view)`で登録し、親への追加・bounds更新後に返された登録口の`setVisible(visible)`へ表示希望を渡す。操作とフォーカスの入口では`blocked`を検査し、Viewの終了時に`dispose()`する。通常は希望どおり表示し、モーダル中だけ共通側が非表示を管理する。リボンと[タイトルバー・ステータスバー](shell-bars.md)を同じ登録口へ接続している。将来追加する背景のShell領域もこの契約を使う。

現在この背景登録に接続しているのはリボン・タイトルバー・ステータスバーであり、既存の編集ダイアログは本体の設定Surface上で確認している。[Shell本文](../src/main/core/shell-page-host.ts)やWeb／Appletの本文View、通知等も含めた全Viewを自動的に取り込む仕組みではない。新しいダイアログを別の画面上で開く場合は、その時点で見えているnative Viewを確認する。対象の本体設定Surfaceへ移動してから開くか、残る描画面の登録・表示希望・操作停止・寿命を共通管理へ接続するか、用途に合う共通オーバーレイを使うかを決めて検証する。

開いている最後のnative dialogを閉じると画像を破棄して各Viewを最新の表示希望に戻す。本体rendererの再読込・終了でも非表示を解除し、遅れて届いた画像や表示完了の応答は世代で拒否する。これは既存ダイアログの背景処理であり、コマンドパレットの独立したオーバーレイは従来の表示経路を使う。

### Shellからダイアログを開く

リボン・タイトルバー・ステータスバーは本体と別のWebContentsViewである。開くボタンがこれらのShellにあっても、本体内ダイアログは次の経路へ揃える。

1. Shellが公開モデルの操作IDを`invoke`で本体へ渡す。本体で接続元・提供元・session・ready・現在の利用可否を検査する。二重要求は既存のrequestId契約で扱う。
2. 本体の内容Controllerまたは機能側の所有者が、表示対象・一時入力・完了・取消を管理する。現在のrouteと表示中のnative Viewを確認し、本体の設定Surfaceへ移るか、他の背景Viewも含む表示経路を用意して、本体rendererへ表示を依頼する。Shell Hostへ設定保存などの内容判断を追加しない。
3. 本体のWebContentsへフォーカスを渡し、共通ダイアログをmountする。DOM要素への`focus()`と、別WebContents間のフォーカス移動を分けて扱う。
4. 共通背景管理が登録されたリボン・両バーを背面として扱う。呼出元のShellだけを自前で暗くしたり、非表示・再生成したりしない。
5. 閉じたら、元のroute・Windowのフォーカス・呼出元の提供元／sessionと表示可否を確認して戻す。同じShellの元のボタンが残っていればそこへ戻す。提供元の交代・停止やroute変更があれば、現在有効な本体側の操作へ戻し、古いViewへフォーカスしない。

`SettingsModal`が覚える復帰先は本体document内の要素であり、Shell内のボタンは自動では記憶しない。Shellを入口にする新しい操作では、機能側の要求に戻り先の識別を持ち、閉じた後に有効なShellへフォーカスを渡して描画側で元のボタンへ戻す接続を追加する。既存の`focusHost(before/after)`と`onFocus(first/last)`はTab境界用なので、それだけで任意のボタンへの復帰が完成したとは扱わない。

現在、リボンは[Shell API](shell-api.md)の操作カタログ、両バーは[バーの公開契約](shell-bars.md)に定義された操作だけを受け付ける。任意の編集ダイアログを開く汎用APIはまだない。新しい入口では表示モデル・操作契約・本体側の表示要求と終了通知を追加する。`executeCommand`も自Appletの利用可能な自己コマンドに限定され、本体の任意ダイアログを開く迂回路にはしない。パレットは既存の専用オーバーレイ経路を使用する。

ShellのHTML内で`showModal()`しても、そのViewの小さな描画範囲に限定され、本体preloadの監視対象にはならない。本体全体を覆うためにShellのViewを独自に拡張したり、Shell自身のDOMから本体のDOMを操作したりせず、表示の所有者を上記の本体内ダイアログか共通オーバーレイに定める。

### Appletの宣言型一覧

Appletでは[Applet設定の公開契約](extensions.md#共通の設定ページ)を確認する。`object-list`に`list`を宣言すると、本体が共通の一覧・追加/編集・削除確認・並べ替えダイアログを自動生成する。既存の`list`未指定の表示は維持する。WebAppletの管理ページも同じ`SettingsListTable`を利用する。

## Shellで並べ替えを再利用する

`src/renderer/settings-ui/SettingsOrderDialog.tsx`は、AIサーバーと宣言型オブジェクトリストで共有する並べ替え部品。`items`にダイアログ内で一意かつ不変の`id`、表示用`title`、任意の`description`を渡し、`title`と`listLabel`で対象を示す。選択肢は保存値ではなく一覧と同じ表示名へ変換して渡す。

`onApply(orderedIds, originalIds)`が成功したときだけ閉じる。保存・入力検証・競合判定は呼び出し側が所有する。オブジェクトリストは開始時のスナップショット内のindexを一時IDに使い、既存の一覧全体の競合判定を保持する。移動途中にpropsを更新しても編集中の順序を置換しない。取消・Escapeで破棄し、保存中のボタン・ドラッグ移動を抑止する。

別Shellでは既存の`configureSettingsControls`へ公開APIのadapterを設定し、共通`controls.css`とテーマ変数を読み込んで使う。本体rendererの内部実装や`settings.css`への依存はない。行、ハンドル、番号、補足、上下操作、移動案内、狭幅の配置を共通化する。`SettingsOrderDialog`と`BindingOrderDialog`は共通の`OrderDialogFrame`を使う。幅760px（画面幅から32pxを除いた幅が上限）、通常24px／720px以下で18pxの内側余白、同じテーマ色・見出し・操作欄を適用する。本文では一覧だけを縮めてスクロールさせ、見出し・補足・操作欄を保持する。同一Surface内の表示寿命は`SettingsModal`が担う。

`OrderDialogFrame`は見た目だけを共有するテンプレート。タイトル・任意の補助見出し・本文・フッター文言・エラー・処理中状態・適用可否を受け取り、保存や順序の意味を判断しない。ショートカット／ジェスチャー側は対象選択、条件説明、複数グループの一時編集、変更件数、既存の同期的な適用・競合検出を維持する。表示順側は非同期保存、二重送信防止、保存中の入力停止、失敗時の順序保持を維持する。

## Appletの一覧宣言

`minimumHostVersion: "0.45.0"`以上が必要。例:

```json
{
  "key": "items", "title": "登録一覧", "type": "object-list", "default": [], "itemTitle": "項目",
  "list": { "columns": ["name"], "titleKey": "name", "descriptionKey": "url", "enabledKey": "enabled", "idKey": "id", "confirmDelete": true },
  "fields": [
    { "key": "id", "title": "ID", "type": "string" },
    { "key": "name", "title": "名前", "type": "string", "default": "新しい項目" },
    { "key": "url", "title": "URL", "type": "string", "format": "url", "default": "https://example.com/" },
    { "key": "enabled", "title": "有効", "type": "boolean", "default": true }
  ]
}
```

`columns`は既存フィールドから1～4列、`titleKey`は主情報、`descriptionKey`はその下の補足。selectの値はラベルで表示する。`enabledKey`はbooleanフィールドのトグル。`idKey`は編集欄に出さず、新規登録時だけUUIDを生成する。`iconKey`は行画像のdata PNG/JPEG/WebP文字列を参照する。`confirmDelete`省略時は即時削除で、ショートカットの既存契約を維持する。

AppDock 0.46.0以降の`showIndex: true`は、先頭へ`itemTitle`を見出しとした1始まりの番号列を追加する。編集・削除・並べ替えの対象名も`itemTitle`と番号で表示する。モニターのように配列位置が割り当て先を表す設定に使い、番号を永続IDとして保存しない。`string-list`の`format: directory`は共通のフォルダー追加・選択・削除入力を使う。旧JSON文字列の一覧と`aliases`・`numericOptions`を読み、編集した登録だけをOKで正規化して保存する。取消では旧形式を含む保存値を変更しない。

フィールドの`propertyPath`は最大3階層の保存パス（例:`["when", "scope"]`）。prototype系キーは禁止。未知の保存項目は保持する。selectの`optionSource: "web-profiles"`は同じAppletの共通プロフィール名簿だけを選択肢に使い、capabilityを必要とする。空の名簿ではAppletの管理画面で枠を追加してから選択する。

本体の保存操作は表示中Appletの宣言済み一覧だけを受け付け、開いた時点の一覧と現在値を照合する。変更があればダイアログへ競合を返す。正常時は最新設定へその一覧だけを合成し、共通SettingsCommandsで検証・保存する。任意のApplet向けSettingsPage操作は公開しない。

## 実装時の確認項目

- 適用場面、一覧に出す情報、登録単位、順序の意味、削除の影響が明確である。
- 追加／編集が同じフォームを使い、入力中・候補取得・キャンセルで設定ファイルを変更しない。OKは一度だけ保存する。
- 失敗時に入力が残り、外部の追加・編集・削除・並べ替えを上書きしない。
- URLの連続入力、IME、Enter／blur、Tab移動、Escape、フォーカス復帰を確認する。連続追加で一覧が勝手にスクロールしない。
- 明暗テーマ、狭い幅、長い名前、空の一覧、上限、詳細の展開、処理中・エラー表示でも操作できる。
- ダイアログがリボン・両バーに重なる寸法、背景準備中の取消、リサイズ、提供元の交代・故障でも、グレーの先出しやShellによるダイアログの遮蔽が起きず、操作・表示が復帰する。画像取得・decode失敗でも操作を再開できる。
- Shellを入口に追加した場合は、実際のShellボタンから開き、初期フォーカス・Tab／Escape・同じボタンへの復帰を確認する。入口の停止・交代・route変更後は現在有効な戻り先を確認する。本体内ボタンから開く試験だけで代用しない。
- 開けるrouteごとに背景のnative Viewを確認する。Shell本文・Web／Applet本文・通知を残す設計なら、そのViewを含む表示順・暗化・入力停止を確認し、リボンと両バーだけの成功を全画面へ広げない。
- 設定検索のアンカーを、閉じたダイアログ内だけでなく常設の一覧・項目に置く。検索対象や画面モデルへ秘密値を載せない。
- 実装の影響に応じて保存境界・競合の回帰と隔離したUI確認を行う。実サービスの成功とfixtureの成功は分けて記録する。

既存の確認例は[AI設定UI試験](../scripts/ai-ui-test.cjs)、[URL入力試験](../scripts/settings-url-ui-test.cjs)、[設定操作の回帰](../tests/ai-settings.test.cjs)を参照する。製品の変更・発行がある場合の検証範囲は[開発手順](development-workflow.md)に従う。

背景と入力の確認例は[モーダルGUI試験](../scripts/host-modal-ui-test.cjs)、Shell間の実フォーカス・ドラッグ領域の確認例は[バーGUI試験](../scripts/shell-bars-ui-test.cjs)を参照する。両試験は現在のダイアログ・パレット・既存操作の検証例であり、将来追加するShell起点の編集ダイアログの接続を実装・検証済みとするものではない。WebContentsViewを含む見た目はWindows合成画像と実入力で確認する。
