// TssSum — 明細の表のすぐ下に「条件付きの合計行」（小計／消費税10%／消費税8%／合計 …）の表を付ける。
// 明細と同じ列幅・行ヘッダ・🗑列の幅で作るので、金額の列が縦にそろう。明細の変更・行の増減・行の移動で自動で再計算。
import { TssGrid } from '../src/tssgrid';

export = TssSum;
export as namespace TssSum;

declare const TssSum: {
  /** 合計の表を mountEl に作って source に付ける。 */
  attach(source: TssGrid, mountEl: HTMLElement, opts: TssSum.Options): TssSum.Handle;
};

declare namespace TssSum {
  /** 明細の行（`grid.data[r]`＝値の配列）。 */
  type Row = any[];

  /** 合計行の定義。条件＋対象で集めるか、それまでの行から派生するか。 */
  interface RowSpec {
    /** 表示するラベル（先頭列。TssMerge があれば valueCol の手前まで横につながる）。 */
    label?: string;
    /** 対象にする明細の行（省略＝全行）。 */
    when?: (row: Row) => boolean;
    /** 行ごとの値（省略＝sumCol／valueCol の値）。 */
    of?: (row: Row) => number;
    /** 集めた合計に対して最後に1回だけ走る（例 税率ごとに1回だけ四捨五入する消費税）。 */
    after?: (sum: number) => number;
    /** それまでの行の値（配列）から派生（例 小計＋税）。指定すると when/of は使わない。 */
    total?: (prior: number[]) => number;
  }

  interface Options {
    /** 合計行の定義（上から順に）。 */
    rows: RowSpec[];
    /** 合計を出す列（既定＝最終列）。明細の金額の列にそろえる。 */
    valueCol?: number;
    /** of を省略した行で合計する明細の列（既定＝valueCol）。 */
    sumCol?: number;
    /** 合計値の表示（例 `v => '¥' + Number(v).toLocaleString('ja-JP')`）。 */
    format?: (value: any) => string;
    /** 行の高さ（既定 28）。 */
    rowHeight?: number;
    /** 選択の枠を出すか（既定 false＝見せるだけの表）。 */
    cursor?: boolean;
    /** 再計算のたびに呼ぶ（各行の値の配列）。 */
    onCompute?: (values: number[]) => void;
    /** 合計の表の name（既定 source.name + '-sum'）。 */
    name?: string;
    /** モジュール利用時に TssGrid のコンストラクタを渡す（既定 window.TssGrid）。 */
    TssGrid?: typeof TssGrid;
    /** モジュール利用時に TssMerge を渡す（既定 window.TssMerge）。ラベルの横結合に使う。 */
    TssMerge?: { plugin(opts?: any): any };
  }

  interface Handle {
    /** 合計の表（TssGrid 本体）。 */
    grid: TssGrid;
    /** 手動で再計算する。 */
    refresh(): void;
    /** 明細へのフックを外し、合計の表を破棄する。 */
    detach(): void;
  }
}
