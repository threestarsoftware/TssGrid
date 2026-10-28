/*! TssComment — セルの注釈（Excel のコメント/メモ風）。マーカー＋ホバー吹き出し＋編集。
 *
 *  ★他プラグインと干渉しない設計：セルのフック（cellClass / cellStyle / editor / format）を
 *    一切奪わない。コメント済みセルの <td> に自前でクラス（tg-comment-mark）を足し直すだけ＝
 *    条件付き書式・heatmap(cellStyle)・cascade/calendar(editor) 等と同じセルに共存できる。
 *    再描画への追従は MutationObserver（グリッドの <table> を監視）で行う（クラス付与は属性変更＝
 *    childList 監視をループさせない）。吹き出し/編集ポップアップは body 直下にアンカー（calendar と同型）。
 *
 *  使い方:
 *    const cmt = TssComment(grid, {
 *      rowId: (row, r) => row.detailId ?? r,        // 安定キー（ソート/フィルタ/再読込に追従）。既定は行index
 *      comments: [{ id: 12, dataKey: 'amount', text: '要確認' }],  // 初期（保存済み）
 *      onCommentChange: ({ id, dataKey, text, action }) => save(...),  // 永続化はホストへ委譲
 *    });
 *    // 右クリックに項目を出す（ホストの contextMenu に混ぜる）:
 *    new TssGrid(el, { contextMenu: [ ...cmt.menuItems(), ...others ] })
 *    // ※グリッドを作り直すホストは、作り直すたびに TssComment(grid, {comments: cmt.getAll(), ...}) で貼り直す。
 *
 *  キー = rowId(行) ＋ 列の data キー（r/c では持たない＝ソート/フィルタ/行削除でズレないため）。
 *  永続化はしない（onCommentChange で通知するだけ）。保存/読込はホスト（kintone 等）が持つ。
 */
(function (root) {
  'use strict';
  var SEP = '\u0000';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // 要素をアンカー（セル）に合わせて配置（画面外にはみ出さない）。calendar と同じ考え方。
  function place(el, anchor) {
    var r = anchor.getBoundingClientRect();
    el.style.left = Math.max(2, Math.min(r.left, window.innerWidth - el.offsetWidth - 6)) + 'px';
    var top = r.bottom + 2;
    if (top + el.offsetHeight > window.innerHeight) top = Math.max(2, r.top - el.offsetHeight - 2);
    el.style.top = top + 'px';
  }

  function TssComment(grid, opts) {
    opts = opts || {};
    if (!grid || !grid.table) throw new Error('TssComment: grid が不正です');
    var customRowId = typeof opts.rowId === 'function' ? opts.rowId : null;
    var onChange = typeof opts.onCommentChange === 'function' ? opts.onCommentChange : null;
    var canComment = typeof opts.canComment === 'function' ? opts.canComment : function () { return true; };
    var readOnly = !!opts.readOnly;
    var L = Object.assign({
      add: 'コメントを挿入', edit: 'コメントを編集', remove: 'コメントを削除',
      placeholder: 'コメントを入力…', save: '保存', del: '削除', cancel: '取消',
    }, opts.labels || {});

    var host = grid.root || (grid.table.closest && grid.table.closest('.tssgrid')) || grid.table;
    var store = new Map();   // key(id\0dataKey) -> text
    var bubble = null, editor = null, edCell = null, outside = null, hideT = 0, rafId = 0, dead = false;

    // 初期コメント（保存済み）を取り込む
    (opts.comments || []).forEach(function (cm) {
      if (cm && cm.id != null && cm.dataKey != null && cm.text != null) store.set(cm.id + SEP + cm.dataKey, String(cm.text));
    });

    // ── キー計算 ───────────────────────────────────────────
    function dataKeyOf(c) { var col = (grid.columns && grid.columns[c]) || {}; return col.data != null ? String(col.data) : ('#' + c); }
    function colOf(dataKey) {
      var cols = grid.columns || [];
      for (var c = 0; c < cols.length; c++) if (dataKeyOf(c) === dataKey) return c;
      return -1;
    }
    // 行 r の安定ID。customRowId が無ければ行index。rows はキャッシュ（1操作内で使い回す）。
    var _rowsCache = null;
    function rowsNow() { if (!_rowsCache) _rowsCache = grid.getRows(); return _rowsCache; }
    function clearRowsCache() { _rowsCache = null; }
    function idAt(r) { if (!customRowId) return String(r); var row = rowsNow()[r]; return String(customRowId(row, r)); }
    function keyAt(r, c) { return idAt(r) + SEP + dataKeyOf(c); }

    // ── マーカー再描画（セルフックを使わず td にクラスを足すだけ）───────────
    function decorate() {
      rafId = 0;
      if (dead || !grid.table) return;
      var marked = grid.table.querySelectorAll('td.tg-comment-mark');
      for (var i = 0; i < marked.length; i++) marked[i].classList.remove('tg-comment-mark');
      if (store.size === 0) return;
      // id -> 現在の表示行index（読み込み済みの行だけ）
      clearRowsCache();
      var rows = customRowId ? rowsNow() : null;
      var idToRow = new Map();
      var n = customRowId ? rows.length : grid.getData().length;
      for (var r = 0; r < n; r++) idToRow.set(customRowId ? String(customRowId(rows[r], r)) : String(r), r);
      store.forEach(function (text, key) {
        var sp = key.indexOf(SEP), id = key.slice(0, sp), dk = key.slice(sp + 1);
        var rr = idToRow.get(id); if (rr == null) return;
        var cc = colOf(dk); if (cc < 0) return;
        var td = grid.cellEl(rr, cc); if (td) td.classList.add('tg-comment-mark');
      });
      clearRowsCache();
    }
    function scheduleDecorate() { if (!rafId) rafId = (window.requestAnimationFrame || window.setTimeout)(decorate, 0); }

    // 再描画に追従：table の子が作り直されたら貼り直す（クラス付与は属性変更＝childList 監視はループしない）
    var mo = new MutationObserver(scheduleDecorate);
    mo.observe(grid.table, { childList: true, subtree: true });

    // ── ホバーの吹き出し（読み取り専用の表示）───────────────
    function showBubble(td, text) {
      hideBubble();
      bubble = document.createElement('div');
      bubble.className = 'tg-comment-bubble' + (opts.className ? ' ' + opts.className : '');
      bubble.textContent = text;
      document.body.appendChild(bubble);
      place(bubble, td);
    }
    function hideBubble() { if (bubble) { bubble.remove(); bubble = null; } }
    function onOver(e) {
      var td = e.target.closest && e.target.closest('td.tg-comment-mark');
      if (!td || !grid.table.contains(td)) return;
      if (hideT) { clearTimeout(hideT); hideT = 0; }
      var r = +td.getAttribute('data-r'), c = +td.getAttribute('data-c');
      var text = getText(r, c);
      if (text != null) showBubble(td, text);
    }
    function onOut(e) {
      var td = e.target.closest && e.target.closest('td.tg-comment-mark');
      if (!td) return;
      if (e.relatedTarget && td.contains(e.relatedTarget)) return;   // セル内の移動は無視
      hideT = setTimeout(hideBubble, 60);
    }

    // ── 編集ポップアップ ───────────────────────────────────
    function openEditor(r, c) {
      if (readOnly || dead) return;
      if (!canComment(r, c)) return;
      closeEditor(); hideBubble();
      var td = grid.cellEl(r, c); if (!td) return;
      edCell = { r: r, c: c };
      editor = document.createElement('div');
      editor.className = 'tg-comment-editor' + (opts.className ? ' ' + opts.className : '');
      var cur = getText(r, c) || '';
      editor.innerHTML =
        '<textarea class="tg-comment-ta" placeholder="' + esc(L.placeholder) + '"></textarea>' +
        '<div class="tg-comment-btns">' +
        '<button type="button" class="tg-comment-btn" data-act="save">' + esc(L.save) + '</button>' +
        (cur ? '<button type="button" class="tg-comment-btn danger" data-act="del">' + esc(L.del) + '</button>' : '') +
        '<button type="button" class="tg-comment-btn" data-act="cancel">' + esc(L.cancel) + '</button>' +
        '</div>';
      document.body.appendChild(editor);
      var ta = editor.querySelector('.tg-comment-ta');
      ta.value = cur;
      place(editor, td);
      ta.focus(); ta.setSelectionRange(cur.length, cur.length);
      editor.addEventListener('click', function (e) {
        var act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'save') commitEditor();
        else if (act === 'del') { removeAt(r, c); closeEditor(); }
        else if (act === 'cancel') closeEditor();
      });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); closeEditor(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEditor(); }
      });
      outside = function (e) { if (editor && !editor.contains(e.target)) closeEditor(); };
      setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
    }
    function commitEditor() {
      if (!editor || !edCell) return;
      var ta = editor.querySelector('.tg-comment-ta'), text = ta ? ta.value.trim() : '';
      var cell = edCell;
      closeEditor();
      if (text) setText(cell.r, cell.c, text); else removeAt(cell.r, cell.c);
    }
    function closeEditor() {
      if (outside) { document.removeEventListener('mousedown', outside, true); outside = null; }
      if (editor) { editor.remove(); editor = null; }
      edCell = null;
    }

    // ── データ操作（＋onCommentChange 通知・マーカー更新）───────
    function getText(r, c) { var v = store.get(keyAt(r, c)); return v == null ? null : v; }
    function fire(r, c, text, action) {
      if (!onChange) return;
      try { onChange({ id: idAt(r), dataKey: dataKeyOf(c), r: r, c: c, text: text, action: action }); } catch (e) { /* noop */ }
    }
    function setText(r, c, text) {
      text = String(text == null ? '' : text);
      if (!text) { removeAt(r, c); return; }
      store.set(keyAt(r, c), text); clearRowsCache();
      fire(r, c, text, 'set'); decorate();
    }
    function removeAt(r, c) {
      var k = keyAt(r, c);
      if (!store.has(k)) { clearRowsCache(); return; }
      store.delete(k); clearRowsCache();
      fire(r, c, '', 'delete'); decorate();
    }

    // ── キーボード（Shift+F2＝Excel 流でアクティブセルに挿入/編集）────
    function onKey(e) {
      if (readOnly) return;
      if (e.key === 'F2' && e.shiftKey) {
        var a = grid.active; if (!a) return;
        e.preventDefault(); e.stopPropagation(); openEditor(a.r, a.c);
      }
    }

    grid.table.addEventListener('mouseover', onOver);
    grid.table.addEventListener('mouseout', onOut);
    host.addEventListener('keydown', onKey, true);
    scheduleDecorate();

    return {
      /** セルにコメントを設定（空なら削除扱い）。 */
      set: function (r, c, text) { setText(r, c, text); },
      /** セルのコメント文字列（無ければ null）。 */
      get: function (r, c) { var v = getText(r, c); clearRowsCache(); return v; },
      /** セルのコメントを削除。 */
      remove: function (r, c) { removeAt(r, c); },
      /** 編集ポップアップを開く。 */
      open: function (r, c) { openEditor(r, c); },
      /** 保存済み一覧 [{id, dataKey, text}]（ホストの永続化・貼り直し用）。 */
      getAll: function () {
        var out = []; store.forEach(function (text, key) { var sp = key.indexOf(SEP); out.push({ id: key.slice(0, sp), dataKey: key.slice(sp + 1), text: text }); }); return out;
      },
      /** グリッドの contextMenu に混ぜる項目（挿入/編集・削除）。セル右クリック時のみ表示。
       *  本体契約: name/disabled/hidden は (s, ctx)、callback は { range, key, ctx }。ctx={on,r,c}。 */
      menuItems: function () {
        if (readOnly) return [];
        var cellFromCtx = function (ctx) {
          if (ctx && ctx.on === 'cell' && ctx.r != null) return { r: ctx.r, c: ctx.c };
          var a = grid.active; return a ? { r: a.r, c: a.c } : null;
        };
        var onlyCell = function (s, ctx) { return !(ctx && ctx.on === 'cell'); };   // hidden: セル以外（列/行/隅）では出さない
        return [
          { name: function (s, ctx) { var cc = cellFromCtx(ctx); return cc && getText(cc.r, cc.c) != null ? L.edit : L.add; },
            key: 'tss-comment-edit', hidden: onlyCell,
            disabled: function (s, ctx) { var cc = cellFromCtx(ctx); return !cc || !canComment(cc.r, cc.c); },
            callback: function (arg) { var cc = cellFromCtx(arg && arg.ctx); if (cc) openEditor(cc.r, cc.c); } },
          { name: L.remove, key: 'tss-comment-remove', hidden: onlyCell,
            disabled: function (s, ctx) { var cc = cellFromCtx(ctx); return !cc || getText(cc.r, cc.c) == null; },
            callback: function (arg) { var cc = cellFromCtx(arg && arg.ctx); if (cc) removeAt(cc.r, cc.c); } },
        ];
      },
      /** マーカーを貼り直す（ホストが構造を変えた後などに手動で）。 */
      refresh: function () { scheduleDecorate(); },
      /** 後片付け（observer / リスナ / 開いているポップアップを解除）。 */
      destroy: function () {
        dead = true;
        try { mo.disconnect(); } catch (e) { /* noop */ }
        grid.table && grid.table.removeEventListener('mouseover', onOver);
        grid.table && grid.table.removeEventListener('mouseout', onOut);
        host.removeEventListener('keydown', onKey, true);
        if (outside) { document.removeEventListener('mousedown', outside, true); outside = null; }
        hideBubble(); closeEditor();
        if (grid.table) { var m = grid.table.querySelectorAll('td.tg-comment-mark'); for (var i = 0; i < m.length; i++) m[i].classList.remove('tg-comment-mark'); }
      },
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TssComment;
  else root.TssComment = TssComment;
})(typeof self !== 'undefined' ? self : this);
