/*! TssSum — 条件付き合計グリッドの軽量プラグイン。
 *
 *  tss-totals との住み分け: tss-totals は「列ごとの集計（sum/avg/min/max/count）」を onTotals で返す。
 *  tss-sum は「同じ列を条件別に複数集計＝ラベル付きの"合計行"（小計/消費税10%/消費税8%/合計 など）」＋
 *  ソースと整列した表示グリッドまで担う（per-column キーでは消費税10%と8%が衝突するため別抽象が要る）。
 *
 *  ソースグリッドと「同一の列構成」の readonly 集計グリッドを作るので、金額列の幾何を共有し
 *  画面でも印刷でも値が縦にピッタリ揃う。各合計行は宣言で（条件＋対象）または派生で定義する。
 *  ソースの onAfterChange / onStructureChange / onAfterRowMove / setData を包んで自動で再計算する。
 *  行ヘッダ（表示・幅・番号の有無）と右端の🗑列の幅もソースに合わせる＝数字の列が縦にそろう。
 *  列幅は「実際に描かれている幅」（stretchH / flex の配分込み）を写し、後から変わっても（ドラッグ・setColWidth・
 *  置き場の幅・列の表示切替）追いかける。明細が横にスクロールしたら合計の表も一緒に動く。
 *
 *  使い方:
 *    const sum = TssSum.attach(grid, document.getElementById('sumgrid'), {
 *      rows: [
 *        { label: '小計（税抜）',  of: r => (+r[2]||0)*(+r[3]||0) },                                  // 全データ行の合計
 *        { label: '消費税（10%）', when: r => r[4]==='10%', of: r => Math.round((+r[2]||0)*(+r[3]||0)*0.10) }, // 条件付き
 *        { label: '消費税（8%）',  when: r => r[4]==='8%',  of: r => Math.round((+r[2]||0)*(+r[3]||0)*0.08) },
 *        { label: '合計（税込）',  total: v => v[0]+v[1]+v[2] },                                      // 既出行から派生
 *      ],
 *      format: v => '¥' + Number(v).toLocaleString('ja-JP'),
 *      onCompute: vals => { ... },   // 計算後フック（上部の総額表示など）
 *    });
 *    sum.refresh();   // 手動再計算 / sum.detach();   // フック解除＋集計グリッド破棄
 *
 *  行の定義:
 *    { label, when?(row)->bool, of(row)->number, after?(sum)->number }
 *        … when に一致するデータ行で of(row) を合計（when 省略＝全行）。after は**その合計に対して最後に1回だけ**走る。
 *    { label, total(priorValues[])->number }        … それまでの行の値配列から派生（小計＋税 など）
 *
 *  after が要る理由（of では書けない）: **適格請求書の消費税は「税率ごとに1回だけ」端数処理する**のが法要件で、
 *  「行ごとに丸めて合計」ではない。of の中で丸めると行ごとになってしまうため、「集めてから1回丸める」を書く口が要る。
 *    { label:'消費税（10%）', when: r => tax(r)==='10%', of: r => amount(r), after: s => Math.round(s*0.10) }  // 税率ごと1回（正）
 *    { label:'消費税（10%）', when: r => tax(r)==='10%', of: r => Math.round(amount(r)*0.10) }                 // 行ごと（旧来式）
 *  105円×2行@10% で after あり=¥21 / 行ごと=¥20 と1円ずれる。when で税率ごとに行が分かれるので複数税率でも正しい。
 *  opts: rows(必須) / valueCol(既定=最終列) / sumCol(of 省略時に合計する列) / format / rowHeight(既定28)
 *        / onCompute(vals) / name / TssGrid・TssMerge(モジュール利用時に注入＝import では window に載らないため)
 *        / cursor(既定 false＝見せるだけの表なので選択枠を出さない。true で出す)
 *  返り値: { grid, refresh, detach }
 *  注意: ラベルの横結合に opts.TssMerge か window.TssMerge を使う（無ければラベルは先頭列のみ）。集計グリッドは表示専用。
 */
(function (root) {
  'use strict';

  function TssSum() { /* 名前空間。attach を使う */ }

  TssSum.attach = function (source, mountEl, opts) {
    opts = opts || {};
    var Grid = opts.TssGrid || root.TssGrid;
    if (!Grid) throw new Error('TssSum: TssGrid が見つかりません（opts.TssGrid で渡してください）');
    var rows = opts.rows || [];
    var COLS = source.COLS;
    var valueCol = (opts.valueCol != null) ? opts.valueCol : COLS - 1;
    var fmt = opts.format || function (v) { return v; };

    // ソースと同じ列幅・行ヘッダ・全体幅でミラー（＝金額列が揃う）。全セル readonly。
    var srcW = function () { return (typeof source.getColumnWidths === 'function') ? source.getColumnWidths() : null; };
    var w0 = srcW();
    var columns = [], hidden = [];
    for (var c = 0; c < COLS; c++) {
      var col = { width: (w0 && w0[c]) ? w0[c] : source._colWidth(c), readOnly: true };
      if (w0 && w0[c] === 0) hidden.push(c);   // 明細で隠した列は合計でも隠す
      if (c === valueCol) { col.align = 'right'; col.format = fmt; }
      columns.push(col);
    }
    // ソースに右端の🗑列（rowDelete）があれば、同じ幅の空き列を足して右端もそろえる
    var delW = (typeof source._delW === 'function') ? source._delW() : 0;
    if (delW) columns.push({ width: delW, readOnly: true });
    var NC = columns.length;
    var data = rows.map(function (spec) {
      var r = new Array(NC).fill('');
      r[0] = (spec.label != null) ? spec.label : '';   // ラベルは先頭列（アンカー）
      return r;
    });
    var plugins = [];
    var Merge = opts.TssMerge || root.TssMerge;   // import 利用時は window に載らない＝opts で渡せる（TssGrid と同じ形）
    if (Merge && valueCol > 1) {   // ラベルを valueCol の手前まで横結合
      plugins.push(Merge.plugin({
        merges: rows.map(function (_, r) { return { r: r, c: 0, colspan: valueCol }; }),
      }));
    }
    var tg = new Grid(mountEl, {
      name: opts.name || (source.name ? source.name + '-sum' : 'sum'),
      width: source.width, defaultRowHeight: opts.rowHeight || 28,   // 本体のオプション名は defaultRowHeight（rowHeight は本体が読まない＝以前は指定が効いていなかった）
      rowHeaders: source.rowHeaders, rowHeaderWidth: source.rowHeaderW, rowHeaderLabel: source.rowHeaderLabel,   // 行ヘッダの表示・幅・番号の有無も写す（幅違いで数字が横にずれない）
      colHeaders: false,
      readOnly: true, cursor: opts.cursor === true,   // 見せるだけの表＝選択枠を出さない・灰色にしない（tg-view）
      columns: columns, data: data, plugins: plugins, hiddenColumns: hidden,
    });

    // 明細の列幅が変わったら写す（隠し列も合わせる）。合計の表は数行なので作り直しで十分軽い。
    function mirrorWidths(w) {
      w = w || srcW(); if (!w) return;
      var same = true;
      for (var c = 0; c < COLS; c++) {
        var hid = w[c] === 0;
        if (hid !== tg.hiddenCols.has(c)) { same = false; if (hid) tg.hiddenCols.add(c); else tg.hiddenCols.delete(c); }
        if (!hid && tg.colW[c] !== w[c]) { same = false; tg.colW[c] = w[c]; }
      }
      if (!same) tg.buildTable();
      syncScroll();
    }
    // 明細が横にスクロールする時は、合計の表を明細の見えている幅に合わせ、横位置を明細に連動させる（合計側のスクロールバーは出さない）
    function syncScroll() {
      var sw = source.wrap, tw = tg.wrap; if (!sw || !tw) return;
      if (sw.scrollWidth > sw.clientWidth + 1) {
        tw.style.boxSizing = 'content-box'; tw.style.width = sw.clientWidth + 'px';   // 見えている幅（内寸）を明細とそろえる＝右端まで送っても同じ位置
        tw.style.overflowX = 'hidden';
        tw.scrollLeft = sw.scrollLeft;
      } else if (tw.style.overflowX === 'hidden') {
        tw.style.width = source.width || ''; tw.style.overflowX = ''; tw.scrollLeft = 0;
      }
    }
    var origCW = source.onColumnWidthsChange;
    source.onColumnWidthsChange = function (w) { if (origCW) { try { origCW.apply(this, arguments); } catch (e) {} } mirrorWidths(w); };
    if (source.wrap) source.wrap.addEventListener('scroll', syncScroll);
    var ro = (typeof ResizeObserver !== 'undefined' && source.wrap) ? new ResizeObserver(function () { syncScroll(); }) : null;
    if (ro) ro.observe(source.wrap);

    function num(v) { return Number(v) || 0; }
    function refresh() {
      var src = source.data, vals = [];
      for (var i = 0; i < rows.length; i++) {
        var spec = rows[i], v;
        if (typeof spec.total === 'function') {
          v = spec.total(vals.slice());
        } else {
          v = 0;
          for (var k = 0; k < src.length; k++) {
            var row = src[k];
            if (spec.when && !spec.when(row)) continue;
            v += spec.of ? num(spec.of(row)) : num(row[(opts.sumCol != null) ? opts.sumCol : valueCol]);
          }
        }
        // 集計後フック: 集めた合計に対して最後に1回だけ走る（行ごとではない）。
        // 適格請求書の消費税は「税率ごとに1回」端数処理するのが法要件＝ of の中で丸めると「行ごと」になり
        // 1円ずれる（105円×2行@10%: after=端数処理(210*0.10)=21 / 行ごと=floor(10.5)*2=20）。
        // when で税率ごとに行が分かれているので after はその税率の合計に対して走る（請求書全体で1回ではない）。
        // ここ（vals[i] の直前）なので、後続の total(vals) 行は「丸めた後の税額」を見る＝合計が合う。
        if (typeof spec.after === 'function') v = spec.after(v);
        vals[i] = v;
        tg.data[i][valueCol] = String(v);
      }
      tg.buildTable();
      if (opts.onCompute) { try { opts.onCompute(vals.slice()); } catch (e) {} }
    }

    // ソースの変更フックを包んで自動再計算（既存ハンドラは温存）
    var origAC = source.onAfterChange, origSC = source.onStructureChange, origRM = source.onAfterRowMove;
    source.onAfterChange = function () { if (origAC) origAC.apply(this, arguments); refresh(); };
    source.onStructureChange = function () { if (origSC) origSC.apply(this, arguments); refresh(); };
    source.onAfterRowMove = function () { if (origRM) origRM.apply(this, arguments); refresh(); };
    // setData（データの差し替え＝Vue の :data / React の data プロップ変更もこれ）でも再計算。tss-running / tss-totals と同じ包み方
    var hadOwnSetData = Object.prototype.hasOwnProperty.call(source, 'setData'), origSetData = source.setData;
    source.setData = function () { var ret = origSetData.apply(source, arguments); refresh(); return ret; };   // rowReorder で空の行が途中に動く等、中身が変わる場合がある
    refresh();
    mirrorWidths();

    return {
      grid: tg,
      refresh: refresh,
      detach: function () {
        source.onAfterChange = origAC; source.onStructureChange = origSC; source.onAfterRowMove = origRM;
        source.onColumnWidthsChange = origCW;
        if (hadOwnSetData) source.setData = origSetData; else delete source.setData;
        if (source.wrap) source.wrap.removeEventListener('scroll', syncScroll);
        if (ro) ro.disconnect();
        if (tg.destroy) tg.destroy();
      },
    };
  };

  if (typeof module === 'object' && module.exports) module.exports = TssSum;
  root.TssSum = TssSum;
})(typeof window !== 'undefined' ? window : this);
