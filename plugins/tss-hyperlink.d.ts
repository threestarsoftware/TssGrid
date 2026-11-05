// TssHyperlink — セル内ハイパーリンク（format ヘルパ）。columns[c].html:true ＋ format に渡す。
export = TssHyperlink;
export as namespace TssHyperlink;

/** セルの値をリンク HTML に変換する format 関数を返す。
 *  モードA（既定）: 値 "表示テキスト|URL"（または URL 単体）。値に URL が入る。
 *  モードB（`url` 指定）: 値＝表示テキストだけ・URL/装飾はオプションで付与（入力/コピー/編集は文字だけ）。 */
declare function TssHyperlink(opts?: TssHyperlink.Options): (value: any, ctx?: TssHyperlink.Ctx, row?: any) => string;

declare namespace TssHyperlink {
  interface Ctx { r: number; c: number; }
  /** (value, ctx, row) を受けて値を返す関数（className/url/label/attrs 用）。row はその行の値配列。 */
  type Fn<T> = (value: any, ctx: Ctx, row: any) => T;

  interface Options {
    /** （モードA）表示テキストと URL の区切り（既定 '|'）。 */
    separator?: string;
    /** リンクの target（既定 '_blank'）。 */
    target?: string;
    /** <a>/<span> に付けるクラス。文字列 or 関数（行ごとに出し分け可。既定 'tss-link'）。 */
    className?: string | Fn<string | null | undefined>;
    /** 指定するとモードB（値＝表示テキストだけ）。URL を文字列 or 関数で付与。
     *  安全な URL を返せば <a>、null/''/不正なら <span>（href 無し＝SPA クリック用）、false で素テキスト。 */
    url?: string | Fn<string | null | false | undefined>;
    /** （モードB・任意）表示テキストの差し替え（既定は値そのもの）。 */
    label?: Fn<any>;
    /** 追加属性 (value, ctx, row)=>({key:val})。data- / aria- / title / id / role のみ・値はエスケープ・null は出さない。 */
    attrs?: Fn<Record<string, any>>;
  }
  /** URL を安全化（http/https/mailto/tel のみ許可・スキーム無しは https 補完・許可外は null）。 */
  function safeUrl(u: any): string | null;
}
