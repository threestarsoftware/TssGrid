// TssMerge — 矩形のセル結合（colspan×rowspan）。左上のセル（アンカー）が値・編集・選択の対象。
// plugin を入れると grid に setMerge / removeMerge / mergeSelection / getMerges / destroyMerged が生える。
import { TssGrid } from '../src/tssgrid';

export = TssMerge;
export as namespace TssMerge;

declare const TssMerge: {
  /** `plugins: [TssMerge.plugin({ merges: [...] })]` で使う。 */
  plugin(opts?: TssMerge.Options): (grid: TssGrid) => TssMerge.Controller;
};

declare namespace TssMerge {
  /** 結合1件。(r,c) が左上。 */
  interface Merge { r: number; c: number; colspan: number; rowspan?: number; }

  interface Options {
    /** 最初の結合（履歴には積まない）。 */
    merges?: Merge[];
  }

  interface Controller { name: 'merge'; destroy(): void; }

  /** plugin を入れた grid に生えるメソッド（`(grid as TssGrid & TssMerge.GridMethods).setMerge(...)`）。 */
  interface GridMethods {
    /** (r,c) を起点に結合。absorb=true で重なる既存の結合を飲み込む。 */
    setMerge(r: number, c: number, colspan: number, rowspan?: number, absorb?: boolean): boolean;
    /** (r,c) を含む結合を解除。 */
    removeMerge(r: number, c: number): boolean;
    /** 選択の矩形を結合。 */
    mergeSelection(): boolean;
    /** 今の結合の一覧。 */
    getMerges(): Required<Merge>[];
    /** 全部の結合を解除。 */
    destroyMerged(): void;
  }
}
