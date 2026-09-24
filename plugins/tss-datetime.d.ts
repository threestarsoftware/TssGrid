// TssDatetime — 日付＋時刻ピッカー（TssGrid カスタムエディタ／単体でも）。保存値は 'YYYY-MM-DDTHH:MM'。
import { EditorDef } from '../src/tssgrid';

export = TssDatetime;
export as namespace TssDatetime;

declare function TssDatetime(opts?: TssDatetime.Options): TssDatetime.Editor;

declare namespace TssDatetime {
  type Holidays = Record<string, string | { name: string; type?: string }>;

  interface Options {
    holidays?: Holidays;
    weekend?: number[];
    weekLabels?: string[];
    /** 選択可能範囲（'YYYY-MM-DD'）。 */
    min?: string;
    max?: string;
    yearMin?: number;
    yearMax?: number;
    /** 分刻み（既定 1）。 */
    step?: number;
    /** AM/PM 表示（既定 false=24h）。 */
    hour12?: boolean;
    /** 共有 input に乗る型（既定 true）＝直打ち可。false でフォーカス奪取型。 */
    inline?: boolean;
    /** シングルクリックで開く（既定 true）。 */
    openOnClick?: boolean;
    /** セル右端の目印（既定 '📅'）。 */
    icon?: string;
    /** ポップアップに付ける任意クラス。 */
    className?: string;
  }

  interface Editor extends EditorDef {
    /** アンカー要素の下に開き、選択で `onPick('YYYY-MM-DDTHH:MM')` を呼ぶ（単体用）。 */
    openAt(anchorEl: Element, value: string, onPick: (value: string) => void): void;
  }

  /** 列 format 用: 保存値 'YYYY-MM-DDTHH:MM' を表示整形。 */
  function format(value: any, opts?: { hour12?: boolean }): string;
}
