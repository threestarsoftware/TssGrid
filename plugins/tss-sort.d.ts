// TssSort — 見出しクリックで「昇順 → 降順 → 元の順」。▲▼ を見出しに出す。
import { TssGrid } from '../src/tssgrid';

export = TssSort;
export as namespace TssSort;

declare const TssSort: {
  /** `plugins: [TssSort.plugin()]`。`grid.getPlugin('sort')` で Controller。 */
  plugin(opts?: TssSort.Options): (grid: TssGrid) => TssSort.Controller;
};

declare namespace TssSort {
  type Dir = 'asc' | 'desc';
  /** 列の data キーか番号。 */
  type ColKey = string | number;

  interface Options {
    /** 対象の列（省略＝全部の列）。 */
    columns?: ColKey[];
    /** 最初の並び。 */
    initial?: { col: ColKey; dir?: Dir };
    /** ▲▼ の所だけで並べ替える（見出しの他の所は選択だけ）。既定 false。 */
    iconOnly?: boolean;
  }

  interface Controller {
    name: 'sort';
    /** 今の並び（無ければ null）。col は data キーがあればキー。 */
    getState(): { col: ColKey; dir: Dir } | null;
    /** プログラムから並べ替え（▲▼ の点灯も合わせる）。 */
    sortBy(col: ColKey, dir?: Dir): void;
    /** 並べ替えを解除（入力の順へ）。 */
    clear(): void;
    destroy(): void;
  }
}
