// TssTime — 時/分プルダウン方式の時刻エディタ（TssGrid カスタムエディタ／単体でも）。保存値は 24h 'HH:MM'。
import { EditorDef } from '../src/tssgrid';

export = TssTime;
export as namespace TssTime;

declare function TssTime(opts?: TssTime.Options): TssTime.Editor;

declare namespace TssTime {
  interface Options {
    /** 分刻み（既定 1）。 */
    step?: number;
    /** AM/PM 表示（既定 false=24h）。 */
    hour12?: boolean;
    /** 共有 input に乗る型（既定 true）＝直打ち可。false でフォーカス奪取型。 */
    inline?: boolean;
    /** シングルクリックで開く（既定 true）。 */
    openOnClick?: boolean;
    /** セル右端の目印（既定 '🕐'）。 */
    icon?: string;
    /** ポップアップに付ける任意クラス。 */
    className?: string;
  }

  interface Editor extends EditorDef {
    /** アンカー要素の下に開き、選択で `onPick('HH:MM')` を呼ぶ（単体用）。 */
    openAt(anchorEl: Element, value: string, onPick: (value: string) => void): void;
  }
}
