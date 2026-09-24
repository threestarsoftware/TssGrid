// TssAutocomplete — 候補サジェスト付きテキスト入力（TssGrid カスタムエディタ）。
import { EditorDef } from '../src/tssgrid';

export = TssAutocomplete;
export as namespace TssAutocomplete;

declare function TssAutocomplete(opts: TssAutocomplete.Options): EditorDef;

declare namespace TssAutocomplete {
  interface SourceCtx { row: any; r: number; c: number; grid: any; }

  interface Options {
    /** 候補。配列 or `(query, ctx) => string[]`（動的候補）。 */
    source: string[] | ((query: string, ctx: SourceCtx) => string[]);
    /** 共有 input に乗る型（既定 true）＝打鍵の1文字目・IME 直打ちが効く。false で自前 input ポップアップ。 */
    inline?: boolean;
    /** true=候補から選んだ値のみ許可（既定 false=自由入力可）。 */
    strict?: boolean;
    /** この文字数以上で候補を出す（既定 0=開いた時点で全件）。 */
    minChars?: number;
    /** 候補表示の最大件数（既定 20）。 */
    max?: number;
    /** 照合方法（既定 'includes'）。大文字小文字は無視。 */
    match?: 'includes' | 'startsWith' | ((item: string, query: string) => boolean);
    /** シングルクリックで開く（既定 true）。 */
    openOnClick?: boolean;
    /** セル右端の目印（既定 '▾'）。 */
    icon?: string;
    /** ポップアップに付ける任意クラス。 */
    className?: string;
  }
}
