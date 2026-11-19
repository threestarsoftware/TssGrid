// TssCombo — コード付きプルダウン＋「その他」で自由入力（TssGrid カスタムエディタ）。
// UMD: `import TssCombo from '@threestarsoftware/tssgrid/plugins/tss-combo.js'` でも、<script> タグのグローバル `TssCombo` でも使える。
import { EditorDef } from '../src/tssgrid';

export = TssCombo;
export as namespace TssCombo;

declare function TssCombo(opts: TssCombo.Options): TssCombo.Editor;

declare namespace TssCombo {
  /** 選択肢1件。`code`（別名 `value`）と表示 `label`。文字列を渡すと code=label。 */
  interface Option { code?: string | number; value?: string | number; label?: string; }

  interface Options {
    /** 選択肢。`{code,label}` か文字列（code=label）の配列。 */
    options: Array<Option | string>;
    /** 「その他」を有効化。`true` で `{code:'99', label:'その他'}`。選ぶと入力欄に切替。省略で自由入力なし。 */
    other?: boolean | Option;
    /** コードの書き戻し先の列（data キー or 列 index）。省略時はコードを書かず値だけ確定。 */
    codeField?: string | number;
    /** その他モードの入力欄プレースホルダ（既定 '自由入力'）。 */
    otherPlaceholder?: string;
    /** シングルクリックで開く（既定 true）。 */
    openOnClick?: boolean;
    /** セル右端の目印（既定 '▾'）。 */
    icon?: string;
    /** ポップアップに付ける任意クラス。 */
    className?: string;
  }

  /** openAt で選んだ結果。value＝表示の文字（その他は打った文字）・code＝コード・other＝「その他」で入れたか。 */
  interface PickResult { value: string; code: string; other: boolean; }

  /** グリッドの `editor` として使えるほか、表の外（スマホのカード入力など）から単体で `openAt` を呼べる。 */
  interface Editor extends EditorDef {
    /** 欄の要素の下（入らなければ上）に開く。current＝今の値（文字）か { value, code }。
     *  スクロール・キーボードの出入りに付いていき、欄が画面から外れる／外側を押すと閉じて `onCancel`。 */
    openAt(anchorEl: Element, current: string | { value?: string; code?: string | number }, onPick: (r: PickResult) => void, onCancel?: () => void): void;
  }

  /**
   * 値 → コードを引く関数を返す（同じ options/other から）。undo/redo・貼付でコードを値に追従させたい時、
   * `onAfterChange` の中で `grid.setValueRaw(r, コード列, codeOf(grid.getValue(r, 値列)))` のように使う。
   * 値が選択肢に無ければ other の code、空なら ''。
   */
  function codeOf(opts: { options: Array<Option | string>; other?: boolean | Option }): (value: any) => string;
}
