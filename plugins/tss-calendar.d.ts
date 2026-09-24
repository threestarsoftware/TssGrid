// TssCalendar — 休日対応カレンダー（TssGrid カスタムエディタ／単体ピッカーとしても）。保存値は 'YYYY-MM-DD'。
import { EditorDef } from '../src/tssgrid';

export = TssCalendar;
export as namespace TssCalendar;

declare function TssCalendar(opts?: TssCalendar.Options): TssCalendar.Editor;

declare namespace TssCalendar {
  /** 休日マップ。`'YYYY-MM-DD'` → 名称文字列 or `{name, type?}`。 */
  type Holidays = Record<string, string | { name: string; type?: string }>;

  interface Options {
    holidays?: Holidays;
    /** 週末とみなす曜日（0=日, 6=土。既定 [0,6]）。 */
    weekend?: number[];
    /** 曜日ラベル（既定 ['日','月',…,'土']）。 */
    weekLabels?: string[];
    /** 月見出し（既定 `y年(m+1)月`）。 */
    monthLabel?: (year: number, month: number) => string;
    /** 選択可能範囲（'YYYY-MM-DD'）。 */
    min?: string;
    max?: string;
    /** 年プルダウンの範囲。 */
    yearMin?: number;
    yearMax?: number;
    /** 選択不可にする種別（例 ['holiday','weekend']）。 */
    disable?: Array<'holiday' | 'weekend' | string>;
    /** 共有 input に乗る型（既定 true）＝直打ち可・矢印は本体へ。false でフォーカス奪取型。 */
    inline?: boolean;
    /** シングルクリックで開く（既定 true）。 */
    openOnClick?: boolean;
    /** セル右端の目印（既定 '📅'。'' で消す）。 */
    icon?: string;
    /** ポップアップに付ける任意クラス。 */
    className?: string;
  }

  /** グリッドの `editor` として使えるほか、単体で `openAt` を呼べる。 */
  interface Editor extends EditorDef {
    /** アンカー要素の下に開き、日付選択で `onPick(iso)` を呼ぶ（単体ピッカー用）。 */
    openAt(anchorEl: Element, isoValue: string, onPick: (iso: string) => void): void;
  }
}
