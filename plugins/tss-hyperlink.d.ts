// TssHyperlink — セル内ハイパーリンク（format ヘルパ）。columns[c].html:true ＋ format に渡す。
export = TssHyperlink;
export as namespace TssHyperlink;

/** 値 "表示テキスト|URL"（または URL 単体）を安全なリンク HTML に変換する format 関数を返す。 */
declare function TssHyperlink(opts?: TssHyperlink.Options): (value: any) => string;

declare namespace TssHyperlink {
  interface Options {
    /** 表示テキストと URL の区切り（既定 '|'）。 */
    separator?: string;
    /** リンクの target（既定 '_blank'）。 */
    target?: string;
    /** <a> に付ける任意クラス（既定 'tss-link'）。 */
    className?: string;
  }
  /** URL を安全化（http/https/mailto/tel のみ許可・スキーム無しは https 補完・許可外は null）。 */
  function safeUrl(u: any): string | null;
}
