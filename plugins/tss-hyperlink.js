/*! TssHyperlink — セル内ハイパーリンク（format ヘルパ）。SVG/HTML 自前描画・無依存・コア無改変。
 *
 *  2つのモード（Tabulator の link フォーマッタ同様、URL を値に埋めても／システムが付けてもよい）:
 *   ◆モードA（既定・後方互換）: 値 = "表示テキスト|URL" または URL 単体。値に URL が入っている。
 *       format: TssHyperlink()
 *   ◆モードB（`url` オプション指定時）: 値 = 表示テキストだけ。URL・装飾はシステム側（関数/文字列）で付与。
 *       入力・コピー・編集は「文字だけ」。本文は常に自動エスケープ＝手書き format の XSS 罠を回避。
 *       format: TssHyperlink({ url:(val,{r},row)=>'/x/'+row.id })            // 本物リンク（URLを生成）
 *       format: TssHyperlink({ url:()=>null, className:'my-link',            // href 無し＝<span>（SPA クリックをホストが拾う）
 *                              attrs:(val,{r})=>({ 'data-id': ids[r] }) })
 *
 *  ★セキュリティ: URL も attrs も利用者データになり得る＝XSS を最初から潰す。
 *   - URL のプロトコルは http/https/mailto/tel のみ許可（javascript: data: vbscript: 等は拒否＝ただのテキスト/素の span に落とす）。
 *   - スキーム無し（example.com/path）は https:// を補完。表示テキスト・href・属性値は必ず HTML エスケープ（" ' も）。
 *   - attrs は data-* / aria-* / title / id / role のキーだけ許可（on* や style, href, class は弾く）。値が null のキーは出さない。
 *   - target=_blank には rel="noopener noreferrer" を付与。
 *
 *  使い方（列は html:true が要る＝format が HTML を返すため。編集はコアが「生の値」を出すので文字だけ編集になる）:
 *    columns: [
 *      { data:'site', title:'リンク', html:true, readOnly:true, format: TssHyperlink() },               // モードA
 *      { data:'name', title:'名前',   html:true, format: TssHyperlink({ url:(v,{r})=>'/u/'+ids[r] }) }, // モードB
 *    ]
 *
 *  opts:
 *    separator : （モードA）表示テキストと URL の区切り（既定 '|'）
 *    url       : （指定でモードB）URL。文字列 or (value, ctx, row)=>string。安全な URL を返せば <a>、
 *                null/''/不正なら <span>（href 無し＝SPA クリック用）、false を返すと素テキスト（装飾なし）。
 *    label     : （モードB・任意）表示テキストを差し替える (value, ctx, row)=>string（既定は値そのもの）
 *    attrs     : （任意）追加属性 (value, ctx, row)=>({key:val})。data- / aria- / title / id / role のみ・値はエスケープ。
 *    target    : リンクの target（既定 '_blank'。'_self' 等も可）
 *    className : <a>/<span> に付けるクラス。文字列 or (value, ctx, row)=>string（行ごとに出し分け可。既定 'tss-link'）
 */
(function (root) {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // 許可: http/https/mailto/tel。スキーム無しで安全な文字だけなら https:// 補完。それ以外(javascript: data: 等)は null。
  function safeUrl(u) {
    u = String(u == null ? '' : u).trim();
    if (u === '') return null;
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;          // whitelist したスキーム
    if (/^\/\//.test(u)) return null;                          // プロトコル相対 //host は拒否（不意の外部遷移/phishing 回避）
    if (/^(\/|\.\/|\.\.\/|[#?])/.test(u)) return u;            // サイト内相対（/path ./x ../x #frag ?q）はそのまま（SPA ルーティング用）
    if (!/[:]/.test(u) && /^[\w./?#=&%+\-~@!$*,;()]+$/.test(u)) return 'https://' + u;  // スキーム無し＝ドメイン/パス→https 補完
    return null;                                               // javascript: data: vbscript: 等＝拒否
  }
  // attrs を安全な属性文字列に。data-*/aria-*/title/id/role のみ・値はエスケープ・null は出さない。
  function attrStr(fn, v, ctx, row) {
    if (typeof fn !== 'function') return '';
    var o; try { o = fn(v, ctx, row) || {}; } catch (_) { return ''; }
    var s = '';
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      var val = o[k];
      if (val == null) continue;
      if (!/^(data-[a-z0-9-]+|aria-[a-z0-9-]+|title|id|role)$/i.test(k)) continue;   // 安全キーのみ
      s += ' ' + k.toLowerCase() + '="' + esc(val) + '"';
    }
    return s;
  }

  function TssHyperlink(opts) {
    opts = opts || {};
    var sep = opts.separator != null ? opts.separator : '|';
    var target = opts.target || '_blank';
    var defCls = opts.className != null ? opts.className : 'tss-link';
    var modeB = ('url' in opts);                                // url 指定＝モードB（値は文字だけ）
    function clsAttrFor(v, ctx, row) {
      var c = (typeof defCls === 'function') ? defCls(v, ctx, row) : defCls;
      c = (c == null ? '' : String(c));
      return c ? ' class="' + esc(c) + '"' : '';
    }
    return function (value, ctx, row) {
      var v = String(value == null ? '' : value);
      if (v === '') return '';
      var clsAttr = clsAttrFor(v, ctx, row);
      var extra = attrStr(opts.attrs, v, ctx, row);
      var rel = (target === '_blank') ? ' rel="noopener noreferrer"' : '';

      if (modeB) {
        // 値＝表示テキスト。URL は opts.url（文字列/関数）で付与。本文は常にエスケープ。
        var label0 = (typeof opts.label === 'function') ? opts.label(v, ctx, row) : v;
        var label = esc(String(label0 == null ? '' : label0));
        var u = (typeof opts.url === 'function') ? opts.url(v, ctx, row) : opts.url;
        if (u === false) return label;                          // 明示的にリンクにしない＝素テキスト
        var safeB = safeUrl(u);
        if (safeB) return '<a href="' + esc(safeB) + '" target="' + esc(target) + '"' + rel + clsAttr + extra + '>' + label + '</a>';
        return '<span' + clsAttr + extra + '>' + label + '</span>';   // href 無し＝SPA クリック用
      }

      // モードA（後方互換）: 値 "表示|URL" / "URL"
      var i = v.indexOf(sep);
      var text = i >= 0 ? v.slice(0, i) : v;
      var url = i >= 0 ? v.slice(i + 1) : v;
      var safe = safeUrl(url);
      var labelA = esc((text.trim() || url.trim()));
      if (!safe) return labelA;                                 // 不正/未許可 URL＝リンクにせずテキスト表示（＝安全）
      return '<a href="' + esc(safe) + '" target="' + esc(target) + '"' + rel + clsAttr + extra + '>' + labelA + '</a>';
    };
  }
  // URL の安全化だけ外から使いたい時用（カスタム format 内など）。許可外は null。
  TssHyperlink.safeUrl = safeUrl;

  if (typeof module !== 'undefined' && module.exports) module.exports = TssHyperlink;
  else root.TssHyperlink = TssHyperlink;
})(typeof self !== 'undefined' ? self : this);
