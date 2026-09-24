// TssCombo — コード付きプルダウン＋「その他」で自由入力（TssGrid カスタムエディタ）。
// UMD: `import TssCombo from '@threestarsoftware/tssgrid/plugins/tss-combo.js'` でも、<script> タグのグローバル `TssCombo` でも使える。
import { EditorDef } from '../src/tssgrid';

export = TssCombo;
export as namespace TssCombo;

declare function TssCombo(opts: TssCombo.Options): EditorDef;

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

  /**
   * 値 → コードを引く関数を返す（同じ options/other から）。undo/redo・貼付でコードを値に追従させたい時、
   * `onAfterChange` の中で `grid.setValueRaw(r, コード列, codeOf(grid.getValue(r, 値列)))` のように使う。
   * 値が選択肢に無ければ other の code、空なら ''。
   */
  function codeOf(opts: { options: Array<Option | string>; other?: boolean | Option }): (value: any) => string;
}
