/*! TssCalc — セル内ミニ計算式（=12*3+5 → 41）。**eval/Function 不使用**。
 *
 *  セルに数式を打つと確定時に計算結果へ。四則 + - * / と括弧 () と小数に対応。
 *  パーサは再帰下降の自前実装＝**eval を使わない**（CSP安全）。`columns[c].parse` seam に乗るだけ。
 *
 *  使い方（2通り）:
 *    // (a) 列の parse に直接（一番素直＝入力変換そのもの）
 *    columns: [ { data:'amount', type:'number', parse: TssCalc() } ]
 *
 *    // (b) プラグインで対象列にまとめて注入（既存 parse があれば合成）
 *    plugins: [ TssCalc.plugin({ columns: ['quantity','price'] }) ]   // columns 省略で number 列すべて
 *
 *  opts:
 *    prefix : これで始まると強制的に式評価（既定 '='）。'=12*3' → 36。
 *    bare   : 接頭辞なしの素の式も評価（既定 true）。'12*3' → 36 / '100' は数値なので素通り。
 *    decimals: 結果の小数桁（既定 null=丸めない。浮動小数の誤差だけは常に10桁で整える）。
 *
 *  返り: parse 関数 `(value) => string`。式でなければ入力をそのまま返す（＝通常入力は素通り）。
 */
(function (root) {
  'use strict';

  // 安全な四則評価（再帰下降）。式文字列 → 数値 or null（構文/不正文字/0除算は null）。
  function evaluate(s) {
    var toks = [], i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === ' ' || c === '\t') { i++; continue; }
      if ((c >= '0' && c <= '9') || c === '.') {
        var j = i + 1; while (j < s.length && ((s.charAt(j) >= '0' && s.charAt(j) <= '9') || s.charAt(j) === '.')) j++;
        var num = parseFloat(s.slice(i, j)); if (!isFinite(num)) return null; toks.push({ t: 'n', v: num }); i = j; continue;
      }
      if ('+-*/()'.indexOf(c) >= 0) { toks.push({ t: c }); i++; continue; }
      return null;   // 不正文字
    }
    var p = 0;
    function peek() { return toks[p]; }
    function parseExpr() {
      var v = parseTerm(); if (v === null) return null;
      while (peek() && (peek().t === '+' || peek().t === '-')) { var op = toks[p++].t; var r = parseTerm(); if (r === null) return null; v = (op === '+') ? v + r : v - r; }
      return v;
    }
    function parseTerm() {
      var v = parseFactor(); if (v === null) return null;
      while (peek() && (peek().t === '*' || peek().t === '/')) { var op = toks[p++].t; var r = parseFactor(); if (r === null) return null; if (op === '/') { if (r === 0) return null; v = v / r; } else v = v * r; }
      return v;
    }
    function parseFactor() {
      var tk = peek(); if (!tk) return null;
      if (tk.t === '+') { p++; return parseFactor(); }
      if (tk.t === '-') { p++; var f = parseFactor(); return f === null ? null : -f; }
      if (tk.t === 'n') { p++; return tk.v; }
      if (tk.t === '(') { p++; var e = parseExpr(); if (e === null) return null; if (!peek() || peek().t !== ')') return null; p++; return e; }
      return null;
    }
    var result = parseExpr();
    if (result === null || p !== toks.length || !isFinite(result)) return null;   // 余りトークン＝構文エラー
    return result;
  }

  // 素の式（数字＋演算子だけ・演算子を最低1つ含む）か。'100' は数値なので式扱いしない＝素通り。
  function looksArithmetic(s) { return /^[\d\s.+\-*/()]+$/.test(s) && /[+\-*/]/.test(s) && /\d/.test(s); }

  function TssCalc(opts) {
    opts = opts || {};
    var prefix = (opts.prefix == null) ? '=' : opts.prefix;
    var bare = opts.bare !== false;
    var decimals = (opts.decimals == null) ? null : opts.decimals;
    return function (value) {
      var s = String(value == null ? '' : value).trim();
      if (s === '') return value;
      var expr = null;
      if (prefix && s.charAt(0) === prefix) expr = s.slice(1);
      else if (bare && looksArithmetic(s)) expr = s;
      if (expr === null) return value;                  // 式でない＝素通り（通常入力）
      var r = evaluate(expr);
      if (r === null) return value;                     // 構文エラー等＝打った値を残す（validator が弾けば赤）
      r = Math.round(r * 1e10) / 1e10;                  // 浮動小数の誤差を均す
      if (decimals != null) { var f = Math.pow(10, decimals); r = Math.round(r * f) / f; }
      return String(r);
    };
  }

  // プラグイン形: 対象列の parse に TssCalc を注入（既存 parse があれば「calc→既存」で合成）。
  TssCalc.plugin = function (opts) {
    opts = opts || {};
    var calc = TssCalc(opts);
    return function (grid) {
      var keys = opts.columns || null;
      for (var c = 0; c < grid.COLS; c++) {
        var cfg = grid.columns[c]; if (!cfg) continue;
        var hit = keys ? (keys.indexOf(cfg.data) >= 0) : (cfg.type === 'number');
        if (!hit) continue;
        var prev = (typeof cfg.parse === 'function') ? cfg.parse : null;
        cfg.parse = prev ? (function (pv) { return function (v) { return pv(calc(v)); }; })(prev) : calc;
      }
      return { name: 'calc' };
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TssCalc;
  else root.TssCalc = TssCalc;
})(typeof self !== 'undefined' ? self : this);
