/*! TssHyperlink — セル内ハイパーリンク（format ヘルパ）。SVG/HTML 自前描画・無依存・コア無改変。
 *
 *  セルの値を「クリックで開くリンク」として描く。値の形式は "表示テキスト|URL"（区切りは separator）、
 *  または URL 単体（その場合は URL を表示テキストにも使う）。`columns[c].html:true` ＋ `format` の seam に乗る。
 *
 *  ★セキュリティ: URL は利用者データになり得る＝XSS を最初から潰す。
 *   - プロトコルは http/https/mailto/tel のみ許可（javascript: data: vbscript: 等は拒否＝ただのテキスト表示に落とす）。
 *   - スキーム無し（example.com/path）は https:// を補完。表示テキスト・href は必ず HTML エスケープ（" ' も）。
 *   - target=_blank には rel="noopener noreferrer" を付与。
 *
 *  使い方:
 *    columns: [
 *      { data:'site', title:'リンク', html:true, readOnly:true, format: TssHyperlink() },
 *    ]
 *    // 値: "GitHub|https://github.com" / "https://example.com" / "example.com" / "問合せ|mailto:a@b.jp"
 *
 *  opts:
 *    separator : 表示テキストと URL の区切り（既定 '|'）
 *    target    : リンクの target（既定 '_blank'。'_self' 等も可）
 *    className  : <a> に付ける任意クラス（既定 'tss-link'）
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
    if (!/[:]/.test(u) && /^[\w./?#=&%+\-~@!$*,;()]+$/.test(u)) return 'https://' + u;  // スキーム無し＝ドメイン/パス→https 補完
    return null;                                               // javascript: data: vbscript: 等＝拒否
  }

  function TssHyperlink(opts) {
    opts = opts || {};
    var sep = opts.separator != null ? opts.separator : '|';
    var target = opts.target || '_blank';
    var cls = opts.className != null ? opts.className : 'tss-link';
    return function (value) {
      var v = String(value == null ? '' : value);
      if (v === '') return '';
      var i = v.indexOf(sep);
      var text = i >= 0 ? v.slice(0, i) : v;
      var url = i >= 0 ? v.slice(i + 1) : v;
      var safe = safeUrl(url);
      var label = esc((text.trim() || url.trim()));
      if (!safe) return label;                                 // 不正/未許可 URL＝リンクにせずテキスト表示（＝安全）
      var rel = (target === '_blank') ? ' rel="noopener noreferrer"' : '';
      return '<a href="' + esc(safe) + '" target="' + esc(target) + '"' + rel +
        (cls ? ' class="' + esc(cls) + '"' : '') + '>' + label + '</a>';
    };
  }
  // URL の安全化だけ外から使いたい時用（カスタム format 内など）。許可外は null。
  TssHyperlink.safeUrl = safeUrl;

  if (typeof module !== 'undefined' && module.exports) module.exports = TssHyperlink;
  else root.TssHyperlink = TssHyperlink;
})(typeof self !== 'undefined' ? self : this);
