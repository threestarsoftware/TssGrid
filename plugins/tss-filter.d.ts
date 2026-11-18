// TssFilter — 見出しのオートフィルタ（Excel 風）。値を選ぶ／部分一致／前方一致。複数列は AND。
import { TssGrid } from '../src/tssgrid';

export = TssFilter;
export as namespace TssFilter;

declare const TssFilter: {
  /** `plugins: [TssFilter.plugin()]`。`grid.getPlugin('filter')` で Controller。 */
  plugin(opts?: TssFilter.Options): (grid: TssGrid) => TssFilter.Controller;
};

declare namespace TssFilter {
  /** 列の data キーか番号。 */
  type ColKey = string | number;

  interface Options {
    /** 対象の列（省略＝全部の列）。 */
    columns?: ColKey[];
    /** 部分一致・前方一致で大文字小文字を区別するか（既定 false）。 */
    caseSensitive?: boolean;
    /** 最初から「値を選ぶ」で絞った状態で開く（{ 列: [値, ...] }）。 */
    initial?: Record<string, Array<string | number>>;
  }

  interface Controller {
    name: 'filter';
    /** 全部の条件を外す。 */
    clearAll(): void;
    /** 列の「値を選ぶ」条件を入れる（null で外す）。 */
    setValues(col: ColKey, values: Array<string | number> | null): void;
    destroy(): void;
  }
}
