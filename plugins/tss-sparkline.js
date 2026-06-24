/*! TssSparkline — セル内スパークライン（ミニ折れ線/棒）。**SVG自前描画**。
 *
 *  セルの値（カンマ/空白区切りの数列 "388,329,220,348,323,165"）を**小さなグラフ**として描く。
 *  仕組みは `columns[c].html:true` ＋ `format` 関数＝format が返す SVG 文字列がそのままセルに入る（html-cells と同じ seam）。
 *  Chart.js 等は積まない＝ノービルド維持。数値しか SVG に入れないので安全（XSS なし）。
 *
 *  使い方:
 *    columns: [
 *      { data:'trend', title:'動向', html:true, readOnly:true, format: TssSparkline({ width:80, height:22 }) }
 *    ]
 *    // 値 "12,15,9,20,18" → ミニ折れ線。formula で月次列から数列を組み立てると、編集でライブ更新:
 *    { data:'trend', html:true, readOnly:true, format: TssSparkline(),
 *      formula: (row) => ['m4','m5','m6','m7','m8','m9'].map(k=>row[k]).filter(v=>v!=='').join(',') }
 *
 *  opts:
 *    type   : 'line'(既定) | 'bar'
 *    width/height : px（既定 80 / 22）
 *    color  : 線/棒の色（既定 '#0d9488'）  strokeWidth: 線の太さ（既定 1.5）
 *    fill   : 折れ線の下を塗る色（既定なし）  padding: 余白(px・既定 2)
 *    min/max: スケール下限/上限（既定は値の最小/最大で自動）
 */
(function (root) {
  'use strict';
  function r2(n) { return Math.round(n * 100) / 100; }

  function TssSparkline(opts) {
    opts = opts || {};
    var W = opts.width || 80, H = opts.height || 22, pad = (opts.padding != null) ? opts.padding : 2;
    var color = opts.color || '#0d9488', sw = opts.strokeWidth || 1.5, type = opts.type || 'line';
    var fill = opts.fill || null, barColor = opts.barColor || color;

    return function (value) {
      var nums = String(value == null ? '' : value).split(/[,\s]+/).map(function (s) { return parseFloat(s); }).filter(function (n) { return isFinite(n); });
      if (!nums.length) return '';
      var min = (opts.min != null) ? opts.min : Math.min.apply(null, nums);
      var max = (opts.max != null) ? opts.max : Math.max.apply(null, nums);
      var range = (max - min) || 1, innerW = W - pad * 2, innerH = H - pad * 2;
      var body;
      if (type === 'bar') {
        var gap = innerW / nums.length, bw = gap * 0.7;
        body = nums.map(function (v, i) {
          var h = ((v - min) / range) * innerH, bx = pad + i * gap + (gap - bw) / 2;
          return '<rect x="' + r2(bx) + '" y="' + r2(pad + innerH - h) + '" width="' + r2(bw) + '" height="' + r2(Math.max(0, h)) + '" fill="' + barColor + '"/>';
        }).join('');
      } else {
        var x = function (i) { return pad + (nums.length <= 1 ? innerW / 2 : (i / (nums.length - 1)) * innerW); };
        var y = function (v) { return pad + innerH - ((v - min) / range) * innerH; };
        var pts = nums.map(function (v, i) { return r2(x(i)) + ',' + r2(y(v)); }).join(' ');
        var area = fill ? '<polygon points="' + r2(x(0)) + ',' + r2(H - pad) + ' ' + pts + ' ' + r2(x(nums.length - 1)) + ',' + r2(H - pad) + '" fill="' + fill + '" stroke="none"/>' : '';
        body = area + '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"/>';
      }
      return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block">' + body + '</svg>';
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TssSparkline;
  else root.TssSparkline = TssSparkline;
})(typeof self !== 'undefined' ? self : this);
