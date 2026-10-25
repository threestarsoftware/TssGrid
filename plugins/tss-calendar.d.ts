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
    /** 範囲選択を**使える行**にする。`true` で全行／`(ctx)=>boolean` で行ごと（例: 半休の行は `false`＝単日のみ）。
     *  有効な行では上部に「範囲で選ぶ」トグルが出る: **OFF＝従来の単日**（1クリック確定・値 ISO・ツールチップ無し）／
     *  **ON＝範囲**（1クリック目=開始・2クリック目=終了・開始より前なら入替・同日2回は単日・間の色・ツールチップ）。
     *  未指定は常に単日＝従来動作。初期ON/OFFは `rangeDefault`、確定値・ツールチップ・文言は下記で差替可。休日スキップは利用側。 */
    range?: boolean | ((ctx: any) => boolean);
    /** 「範囲で選ぶ」トグルの初期状態（`true`=ON/`(ctx)=>boolean` で行ごと・既定 `false`=OFF）。
     *  いずれの場合も **セルの値が既に範囲なら ON で開く**。`range` が無効な行では無視（トグル自体が出ない）。 */
    rangeDefault?: boolean | ((ctx: any) => boolean);
    /** トグルの文言（既定 `'範囲で選ぶ'`）。 */
    rangeToggleLabel?: string;
    /** 範囲値・ツールチップの日付区切り（既定 '～'）。 */
    rangeSeparator?: string;
    /** 範囲の確定値を作る。**同日（単日）のときも呼ばれる**。引数は開始・終了の ISO
     *  （'YYYY-MM-DD'・開始<=終了に整列済み）。未指定の既定は 範囲=`'YYYY/MM/DD～YYYY/MM/DD'`／
     *  **単日＝ISO `'YYYY-MM-DD'`（範囲なしの単日と同じ形）**。別フィールド分割などはこの口で。 */
    rangeValue?: (startISO: string, endISO: string) => string;
    /** 編集中セルに出す範囲ツールチップの文面（既定は範囲文字列）。休日を除いた日数などを外から足す口。 */
    rangeTooltip?: (startISO: string, endISO: string) => string;
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
