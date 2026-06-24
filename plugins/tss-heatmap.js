/*! TssHeatmap / TssDataBar — セル背景の連続ビジュアライズ（cellStyle フック用）。
 *
 *  コアの `cellStyle`（セルにインラインCSSを差すフック）に乗せる。cellClass（クラス＝離散色）では出せない
 *  **値に応じた連続色（ヒートマップ）／背景データバー**を、**編集できる数値セルのまま**実現する。
 *
 *  使い方:
 *    // ヒートマップ: 値で背景色（低→高）。文字色は自動でコントラスト確保。
 *    { data:'m4', type:'number', cellStyle: TssHeatmap({ min:0, max:400000, colors:['#f8b4b4','#ffffff','#93c5fd'] }) }
 *    // データバー: 数値はそのまま見せつつ背景に棒（編集可）。
 *    { data:'score', type:'number', cellStyle: TssDataBar({ min:0, max:100, color:'rgba(13,148,136,.25)' }) }
 *
 *  ※ min/max は明示（cellStyle はセル単位呼び出しで列全体の範囲を知らないため）。既定 0..100。
 */
(function (root) {
  'use strict';
  function r2(n) { return Math.round(n * 100) / 100; }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  // '#abc'/'#aabbcc' → [r,g,b]
  function hex2rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb2hex(c) { return '#' + c.map(function (n) { return ('0' + Math.round(n).toString(16)).slice(-2); }).join(''); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // 複数ストップ（[low, mid, high] 等）を t∈0..1 で補間
  function lerpStops(stops, t) {
    if (stops.length === 1) return stops[0];
    var seg = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(seg)), f = seg - i;
    var a = hex2rgb(stops[i]), b = hex2rgb(stops[i + 1]);
    return rgb2hex([lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)]);
  }
  // 背景色に対して読みやすい文字色（黒 or 白）
  function textOn(hex) { var c = hex2rgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 150 ? '#1f2733' : '#fff'; }

  function TssHeatmap(opts) {
    opts = opts || {};
    var min = (opts.min != null) ? opts.min : 0, max = (opts.max != null) ? opts.max : 100;
    var stops = opts.colors || [opts.low || '#e8f0fe', opts.high || '#1a73e8'];
    var autoText = opts.text !== false;
    return function (value) {
      var s = String(value == null ? '' : value).trim();
      if (s === '' || !isFinite(Number(s))) return null;     // 空・非数値はスタイル無し
      var t = clamp01((Number(s) - min) / ((max - min) || 1));
      var bg = lerpStops(stops, t), out = { background: bg };
      if (autoText) out.color = textOn(bg);
      return out;
    };
  }

  function TssDataBar(opts) {
    opts = opts || {};
    var min = (opts.min != null) ? opts.min : 0, max = (opts.max != null) ? opts.max : 100;
    var color = opts.color || 'rgba(13,148,136,.25)';
    var dir = (opts.align === 'right') ? 'to left' : 'to right';
    return function (value) {
      var s = String(value == null ? '' : value).trim();
      if (s === '' || !isFinite(Number(s))) return null;
      var pct = r2(Math.max(0, Math.min(100, ((Number(s) - min) / ((max - min) || 1)) * 100)));
      return { background: 'linear-gradient(' + dir + ', ' + color + ' ' + pct + '%, transparent ' + pct + '%)' };
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { TssHeatmap: TssHeatmap, TssDataBar: TssDataBar };
  else { root.TssHeatmap = TssHeatmap; root.TssDataBar = TssDataBar; }
})(typeof self !== 'undefined' ? self : this);
