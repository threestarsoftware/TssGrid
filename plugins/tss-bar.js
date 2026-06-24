/*! TssBar — セル内 横棒グラフ（データバー）。
 *
 *  セルの数値を**横棒**で描く（アンケートの認知率バー、進捗%、スコアなど）。
 *  `columns[c].html:true` ＋ `format` 関数 seam に乗るだけ（format が返す <div> がセルに入る）。
 *  数値・色(dev指定)しか入れない＝安全。type:'number' と併用すれば**バーのまま編集**（打つと伸びる）。
 *
 *  使い方:
 *    // 表示専用バー
 *    { data:'rate', title:'認知率', html:true, readOnly:true, format: TssBar({ max:100, suffix:'%', decimals:1 }) }
 *    // バーのまま編集（値を打つと伸びる）
 *    { data:'rate', type:'number', html:true, format: TssBar({ max:100, suffix:'%' }) }
 *
 *  opts:
 *    min/max  : スケール（既定 0 / 100）。値は min..max を 0..100% に。範囲外はクランプ。
 *    color    : バー色（文字列 or (value)=>色＝閾値で色分け）。track: 下地色。
 *    height   : バーの高さ(px・既定 12)  radius: 角丸(px・既定 3)
 *    showValue: 値ラベルを右に出す（既定 true）。decimals: ラベルの小数桁。suffix: 単位（'%' 等）。
 *    labelWidth: ラベル幅(px・既定 44)。
 */
(function (root) {
  'use strict';
  function r2(n) { return Math.round(n * 100) / 100; }

  function TssBar(opts) {
    opts = opts || {};
    var min = (opts.min != null) ? opts.min : 0, max = (opts.max != null) ? opts.max : 100;
    var color = opts.color || '#0d9488', track = opts.track || '#eef2f6';
    var height = opts.height || 12, radius = (opts.radius != null) ? opts.radius : 3;
    var showValue = opts.showValue !== false, decimals = opts.decimals, suffix = opts.suffix || '';
    var labelW = (opts.labelWidth != null) ? opts.labelWidth : 44;

    return function (value) {
      var s = String(value == null ? '' : value).trim();
      if (s === '' || !isFinite(Number(s))) return '';
      var v = Number(s);
      var pct = Math.max(0, Math.min(100, ((v - min) / ((max - min) || 1)) * 100));
      var col = (typeof color === 'function') ? color(v) : color;
      var label = '';
      if (showValue) {
        var t = (decimals != null) ? v.toFixed(decimals) : String(v);
        label = '<span style="min-width:' + labelW + 'px;text-align:right;font-variant-numeric:tabular-nums">' + t + suffix + '</span>';
      }
      return '<div style="display:flex;align-items:center;gap:6px;height:100%">'
        + '<div style="flex:1;background:' + track + ';border-radius:' + radius + 'px;height:' + height + 'px;overflow:hidden">'
        + '<div style="width:' + r2(pct) + '%;background:' + col + ';height:100%;border-radius:' + radius + 'px"></div>'
        + '</div>' + label + '</div>';
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TssBar;
  else root.TssBar = TssBar;
})(typeof self !== 'undefined' ? self : this);
