/*! TssToggle — 2択セグメント・トグル（有効|無効・公開|非公開・男|女 …）。
 *
 *  ラジオの2択を「並んだピル（セグメント）」で表示し、クリックでどちらかに切替。値は dropdown と同じく
 *  選んだ option の value を保存（getData も value）。html:true+format で描画、クリックは委譲で拾う。
 *
 *  使い方:
 *    plugins: [ TssToggle.plugin({ columns: {
 *      status: ['有効', '無効'],                                   // 文字列2つ（value=label）
 *      pub:    [{value:'1',label:'公開'},{value:'0',label:'非公開'}] // value/label 分離も可
 *    } }) ]
 *    // 列定義側で直接: { data:'status', html:true, format: TssToggle.format(['有効','無効']) } ＋ plugins:[TssToggle.plugin()]
 *
 *  opts(plugin): columns（{dataキー: 2要素配列}） / accent（選択側の色・CSS変数 --tg-toggle-accent でも）。
 *  挙動: クリックでその側に確定（setValue＝検証/Undo を通る）。アクティブセルで Space は反対側へトグル。
 *        他値を打ち込めないよう、対象列に「2値のみ許可」の validator を自動付与。
 */
(function (root) {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function normOpts(arr) { return (arr || []).slice(0, 2).map(function (o) { return (o && typeof o === 'object') ? { value: String(o.value), label: String(o.label) } : { value: String(o), label: String(o) }; }); }

  function makeFormat(options) {
    var opts = normOpts(options);
    return function (value) {
      var v = String(value == null ? '' : value);
      return '<span class="tg-toggle">' + opts.map(function (o) {
        return '<span class="tg-seg' + (o.value === v ? ' active' : '') + '" data-tg-v="' + esc(o.value) + '">' + esc(o.label) + '</span>';
      }).join('') + '</span>';
    };
  }

  function TssToggle() { /* 名前空間。format / plugin を使う */ }
  TssToggle.format = makeFormat;

  TssToggle.plugin = function (opts) {
    opts = opts || {};
    var cols = opts.columns || {};
    return function (grid) {
      var byCol = {};   // 列index → 正規化オプション
      Object.keys(cols).forEach(function (key) {
        var ci = -1; for (var c = 0; c < grid.COLS; c++) if (grid.columns[c] && grid.columns[c].data === key) { ci = c; break; }
        if (ci < 0) return;
        var o = normOpts(cols[key]); if (o.length < 2) return;
        var cfg = grid.columns[ci];
        cfg.html = true;
        if (typeof cfg.format !== 'function') cfg.format = makeFormat(o);
        var vals = o.map(function (x) { return x.value; });
        if (typeof cfg.validator !== 'function') cfg.validator = function (v) { return v === '' || vals.indexOf(v) >= 0; };   // 2値以外を弾く
        byCol[ci] = vals;
      });
      // それ自体は無効でも format 直指定の列をクリックで拾えるよう、format 由来の列も拾う
      function valsOf(c) {
        if (byCol[c]) return byCol[c];
        return null;   // 設定外の列は対象外
      }
      function editable(r, c) { var cfg = grid.columns[c]; return !grid.readOnly && !(cfg && cfg.readOnly === true); }

      function onClick(e) {
        var seg = e.target.closest && e.target.closest('.tg-seg[data-tg-v]'); if (!seg) return;
        var td = seg.closest('td[data-c]'); if (!td) return;
        var c = +td.dataset.c, r = +td.dataset.r;
        if (!valsOf(c) || !editable(r, c)) return;
        grid.setValue(r, c, seg.getAttribute('data-tg-v'));   // 検証/Undo を通る
      }
      function onKey(e) {
        if (e.key !== ' ' && e.key !== 'Spacebar') return;
        var r = grid.active.r, c = grid.active.c, vals = valsOf(c);
        if (!vals || !editable(r, c) || grid.mode === 'edit') return;
        e.preventDefault();
        var cur = grid.getValue(r, c), i = vals.indexOf(String(cur));
        grid.setValue(r, c, vals[(i + 1) % vals.length]);     // 反対側へトグル
      }
      grid.wrap.addEventListener('click', onClick);
      grid.editor.addEventListener('keydown', onKey);
      grid.buildTable();   // format/html を反映

      return {
        name: 'toggle',
        destroy: function () { grid.wrap.removeEventListener('click', onClick); grid.editor.removeEventListener('keydown', onKey); },
      };
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TssToggle;
  else root.TssToggle = TssToggle;
})(typeof self !== 'undefined' ? self : this);
