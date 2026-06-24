/*! TssShared — 1つのマスタ(行データ)を複数グリッドで共有（A系/B系を別フィルタ・別ソートで並べて同時編集）。
 *  各ビューは同じ「行参照」を持つ＝片方の編集がもう片方へ即反映（該当行を再描画）。
 *  **行の挿入/削除も伝播**（マスタ＆他ビューに反映）。**配列データ／オブジェクト配列データ どちらも対応**。
 *
 *  使い方:
 *    const shared = TssShared.create(masterRows, { rowHeaders:true, columns:[...] });  // 共通opts（masterRows=配列 or オブジェクト配列）
 *    const gridA = shared.attach(hostA, {});            // 例: A系
 *    const gridB = shared.attach(hostB, {});            // 例: B系
 *    gridA.filter({ 部署:'営業' });  gridB.filter({ 勤務地:'東京' });
 *    // どちらかで編集 → 共有行が更新され他ビューの同じ行も再描画。行の挿入/削除 → マスタ＆全ビューへ。
 *    shared.getMaster();     // マスタ全行（getRows 相当）。 shared.detach(gridA);
 *
 *  v1 メモ: 値編集と行の挿入/削除/列の挿入削除を伝播。編集で「他ビューのフィルタ該当が変わる」場合は
 *           その値編集は再描画のみ（メンバーシップ再評価は構造変更時に実施）。構造変更は他ビューを
 *           master から作り直す＝そのビューのソートはリセット（フィルタは再適用）。minSpareRows:0 推奨。
 */
(function (root) {
  'use strict';
  function getTssGrid() { return (typeof module !== 'undefined' && module.exports) ? require('../src/tssgrid.js').TssGrid : root.TssGrid; }

  const TssShared = {
    create: function (masterRows, baseOpts) {
      const TssGrid = getTssGrid();
      const shared = { master: null, masterSrc: null, grids: [], baseOpts: baseOpts || {} };

      shared.attach = function (host, opts) {
        opts = opts || {};
        const g = new TssGrid(host, Object.assign({}, shared.baseOpts, opts, { data: masterRows }));
        // 正本(master)を確定。array モードは呼び出し側の行配列参照をそのまま正本に（編集が呼び出し側 masterRows にも反映）。
        // object モードは _ingest が 2D 化するので取り込んだ data を正本、元オブジェクトは _src を正本にする。
        if (!shared.master) {
          if (g._src) { shared.master = g.data.slice(); shared.masterSrc = g._src.slice(); }
          else { shared.master = masterRows.slice(); shared.masterSrc = null; }
        }
        g.data = shared.master.map(function (r) { return r; });                              // 行参照を共有
        g._src = shared.masterSrc ? shared.masterSrc.map(function (s) { return s; }) : null;  // object時は元オブジェクトも共有
        g.ROWS = g.data.length;
        g.buildTable(); g.setActive(0, 0);

        // 値編集 → 他ビューの同じ行を再描画（値は参照共有で既に更新済み）。
        const prevAfter = opts.onAfterChange || g.onAfterChange;
        g.onAfterChange = function (changes, source) {
          shared._propagate(g, changes);
          if (prevAfter) { try { prevAfter(changes, source); } catch (_) {} }
        };
        // 行/列の構造変更（do/undo/redo すべて）→ source の現在の全行を新マスタにして他ビューを作り直す。
        const prevStruct = opts.onStructureChange;
        g.onStructureChange = function (info) {
          shared._rebaseFrom(g);
          if (prevStruct) { try { prevStruct(info); } catch (_) {} }
        };
        g._sharedRef = shared;
        shared.grids.push(g);
        return g;
      };

      shared._propagate = function (srcGrid, changes) {
        for (let i = 0; i < shared.grids.length; i++) {
          const other = shared.grids[i];
          if (other === srcGrid) continue;
          for (let k = 0; k < changes.length; k++) {
            const ch = changes[k], ref = srcGrid.data[ch.r];
            if (!ref) continue;
            const or = other.data.indexOf(ref);
            if (or >= 0) { try { other._renderCell(or, ch.c); } catch (_) {} }
          }
        }
      };

      // 構造変更を済ませた source の「全行（フィルタ中なら _allRows）」を新マスタにし、他ビューを再構成。
      shared._rebaseFrom = function (srcGrid) {
        const allRows = srcGrid._allRows || srcGrid.data;
        const allSrc = srcGrid._allRows ? srcGrid._allSrc : srcGrid._src;
        shared.master = allRows.slice();
        shared.masterSrc = allSrc ? allSrc.slice() : null;
        for (let i = 0; i < shared.grids.length; i++) {
          const g = shared.grids[i];
          if (g === srcGrid) continue;
          // 列メタを source に合わせる（列の挿入削除に追従）。行は master から作り直す（フィルタは再適用・ソートはリセット）。
          g.COLS = srcGrid.COLS; g.headers = srcGrid.headers.slice(); g.columns = srcGrid.columns.slice(); g.colW = srcGrid.colW.slice();
          const f = (g.isFiltered && g.isFiltered()) ? g._filterFn : null;
          g._allRows = g._allSrc = g._meta = g._filterFn = null;
          g.data = shared.master.map(function (r) { return r; });
          g._src = shared.masterSrc ? shared.masterSrc.map(function (s) { return s; }) : null;
          g.ROWS = g.data.length;
          if (f) { g.filter(f); }
          else { g.buildTable(); g.setActive(Math.min(g.active.r, Math.max(0, g.ROWS - 1)), g.active.c); }
        }
      };

      // マスタ全行を getRows 形式で（フィルタに関係なく全件）。
      shared.getMaster = function () {
        const g0 = shared.grids[0]; if (!g0) return [];
        const rows = shared.master, src = shared.masterSrc;
        return rows.map(function (row, r) {
          const o = src ? Object.assign({}, src[r]) : {};
          for (let c = 0; c < g0.COLS; c++) { const k = g0._key(c); if (k != null) g0._setPathCOW(o, k, row[c]); }
          return o;
        });
      };

      shared.detach = function (g) {
        const i = shared.grids.indexOf(g);
        if (i >= 0) shared.grids.splice(i, 1);
        if (g) delete g._sharedRef;
      };

      return shared;
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TssShared;
  else root.TssShared = TssShared;
})(typeof self !== 'undefined' ? self : this);
