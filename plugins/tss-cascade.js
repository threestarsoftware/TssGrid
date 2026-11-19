/*! TssCascade — 多段プルダウン（PC は横に開く／スマホは1枚の中で段を入れ替える）。TssGrid カスタムエディタ（ポップアップ型）。
 *
 *  メニューのように「大分類 ▸ 中分類 ▸ 小分類」とフライアウトで開き、葉を選ぶとセルに確定。
 *  葉に `other:true` を付けると、その葉は「その他」＝選ぶと入力欄に切替わり、打った文字をセルに確定。
 *
 *  ── 2つの保存モード ───────────────────────────────────────────────
 *  (1) codeField 無し（従来）:
 *      葉の value（未指定なら label）を**値セルに**保存。表示は TssCascade.pathFormat でパスに。
 *      「その他」を選んだら、打った文字をそのまま値セルに保存。
 *  (2) codeField あり（コードと表示を分離・combo と同じ流儀）:
 *      ・値セル        … 普通の葉＝パス「有給 / 私用」／その他＝打った文字「通院」
 *      ・codeField セル … 普通の葉＝その葉の value／その他＝その「その他」ノードの value
 *      ＝「その他」が枝ごとにあっても（有給▸その他／午前休▸その他）、codeField を見れば
 *        どの枝の「その他」かが分かる（文字だけで親が消えない）。値は人が読む表示に使う。
 *
 *  使い方（勤怠の区分・枝ごとの「その他」コード）:
 *    const OPTS = [
 *      { label:'有給', children:[
 *        { label:'私用', value:'paid:personal' },
 *        { label:'その他', other:true, value:'paid:other' },   // ← この枝の「その他」コード
 *      ] },
 *      { label:'午前休', children:[
 *        { label:'私用', value:'am_half:personal' },
 *        { label:'その他', other:true, value:'am_half:other' },
 *      ] },
 *    ];
 *    columns: [
 *      { data:'categoryCode' },                                 // コード列（paid:other 等・hidden:true でも可）
 *      { data:'leaveReason', editor: TssCascade({
 *          options: OPTS,
 *          codeField: 'categoryCode',   // コードの書き戻し先（data キー or 列 index）
 *      }) },
 *    ]
 *    // 「有給 ▸ その他」で「通院」と入力 → leaveReason='通院' / categoryCode='paid:other'
 *
 *  opts:
 *    options     : 入れ子配列 [{ label, value?, children?, other? }]。必須。value 未指定の葉は label を保存。
 *    codeField   : コードの書き戻し先の列（data キー or index）。指定時はモード(2)。省略でモード(1)。
 *    separator   : 値セルに入れるパスの区切り（既定 ' / '）。pathFormat と合わせると良い。
 *    otherPlaceholder : 「その他」入力欄のプレースホルダ（既定 '自由入力'）。
 *  開いた時: 今の選択の所までたどってカーソルを置く。「その他」で打った文字があれば、その「その他」に
 *    「その他…（通院）」と添え、選ぶと入力欄にその文字を入れて開く（少し直すだけで済む）。
 *    モード(2)は codeField のコード＝その「その他」の value で判定（枝ごとの「その他」を取り違えない）。
 *    モード(1)は値がふつうの葉のどれでもない時に「その他」の文字とみなす（「その他」が複数あればどれにも入れる）。
 *    openOnClick : 既定 true（プルダウン同様シングルクリックで開く）。
 *    icon        : セル右の目印（既定 '▾'／'' で消す）。
 *    className   : ポップアップに付ける任意クラス。
 *    layout      : 'auto'（既定）＝指で操作する狭い画面（幅600px未満のスマホ）では「1枚の中で段を入れ替える」表示、
 *                  ほかは右へ横に開く表示／'flyout'＝いつも横に開く／'drill'＝いつも1枚で入れ替える。
 *                  1枚の表示は、枝を押すと次の段に入れ替わり、上の「‹ 有給」で戻る（横に開く場所が無いスマホ向け）。
 *  単体で開く（表の外＝スマホのカード入力など。一覧と同じ定義をそのまま使える）:
 *    const kubun = TssCascade({ options: OPTS, codeField: 'categoryCode' });
 *    kubun.openAt(欄の要素, { value: '通院', code: 'paid:other' }, function (r) {
 *      // r = { value: '通院', code: 'paid:other', other: true }／普通の葉なら { value: '有給 / 私用', code: 'paid:personal', other: false }
 *    }, onCancel?);
 *    // codeField を使わない定義なら openAt(el, '私用', fn) と文字だけで渡せる（r.value＝葉の value）。欄が画面から外れたら閉じる。
 *  静的:
 *    TssCascade.pathFormat(options, { separator }) => (value)=>string   // 列 format 用（モード1の表示）
 *    TssCascade.pathOf(options, value, sep?) => string
 */
(function (root) {
  'use strict';
  // ---- 小窓の置き場所（tss-calendar / time / datetime / cascade / combo / autocomplete で同じ中身。直す時は全部）----
  // anchor の下（入らなければ上・どちらにも入らなければ広いほう）。見えている範囲（visualViewport＝スマホのキーボードを
  // 除いた所）に収め、ページ/表のスクロール・画面の向き・キーボードの出入り・小窓の大きさの変化に付いていく。
  // o.side:'right'＝右へ（多段の子）。o.fit＝入らない時は高さを縮めて中をスクロール（一覧向け＝欄に重ならない）。
  // o.onLost＝anchor が見える範囲から外れた時（単体で開いた時に閉じる用）。anchor は要素か、要素を返す関数。戻り値 { update, destroy }。
  function tssPlace(pop, anchor, o) {
    o = o || {};
    var W = window, vv = W.visualViewport, raf = 0, alive = true, ro = null, first = true;
    function place() {
      raf = 0; if (!alive || !pop.isConnected) return;
      var a = typeof anchor === 'function' ? anchor() : anchor;
      if (!a || !a.isConnected) return;
      var b = a.getBoundingClientRect(), m = 6, g = o.gap != null ? o.gap : 2;
      var V = vv ? { l: vv.offsetLeft, t: vv.offsetTop, w: vv.width, h: vv.height } : { l: 0, t: 0, w: W.innerWidth, h: W.innerHeight };
      if (o.onLost && !first && (b.bottom <= V.t || b.top >= V.t + V.h)) { o.onLost(); return; }   // 開いた瞬間は閉じない（開いた側の処理の途中で消えないように）
      var T = V.t + m, B = V.t + V.h - m, L = V.l + m, R = V.l + V.w - m;
      var st = pop.scrollTop; if (o.fit) pop.style.maxHeight = '';
      var w = pop.offsetWidth, h = pop.offsetHeight, top, left;
      if (o.side === 'right') {
        left = b.right - 2; if (left + w > R) left = b.left - w + 2;
        top = b.top - 4;
      } else {
        var below = B - b.bottom - g, above = b.top - g - T, down = h <= below || (h > above && below >= above);
        if (o.fit && h > (down ? below : above)) { pop.style.maxHeight = Math.max(60, down ? below : above) + 'px'; h = pop.offsetHeight; }
        top = down ? b.bottom + g : b.top - g - h;
        left = b.left; if (left + w > R) left = R - w;
      }
      pop.style.top = Math.max(T, Math.min(top, B - h)) + 'px';
      pop.style.left = Math.max(L, left) + 'px';
      if (o.fit && st) pop.scrollTop = st;
    }
    function req(e) {
      if (e && e.type === 'scroll' && e.target && e.target.nodeType === 1 && pop.contains(e.target)) return;   // 小窓の中のスクロールは無関係
      if (!raf) raf = W.requestAnimationFrame(place);
    }
    W.addEventListener('scroll', req, true); W.addEventListener('resize', req);
    if (vv) { vv.addEventListener('resize', req); vv.addEventListener('scroll', req); }
    if (W.ResizeObserver) { ro = new W.ResizeObserver(function () { req(); }); ro.observe(pop); }   // 中身が変わって大きさが変わった（月送り・候補の絞り込み等）
    place(); first = false;
    return {
      update: place,
      destroy: function () {
        alive = false; if (raf) W.cancelAnimationFrame(raf); raf = 0; if (ro) ro.disconnect();
        W.removeEventListener('scroll', req, true); W.removeEventListener('resize', req);
        if (vv) { vv.removeEventListener('resize', req); vv.removeEventListener('scroll', req); }
      }
    };
  }
  // 表の中で開いた時の anchor＝今のセル（表のスクロール・描き直しでセルの要素が替わっても追う）。単体の時は渡された要素。
  function tssAnchor(el, ctx) {
    if (!(ctx && ctx.grid && ctx.grid.cellEl && ctx.r != null)) return el;
    return function () { var t = null; try { t = ctx.grid.cellEl(ctx.r, ctx.c); } catch (e) {} return (t && t.isConnected) ? t : el; };
  }
  // 単体で開く時: ほかの文字欄のキーボードを閉じる（出たままだと小窓がキーボードの裏に開く）。
  function tssBlurOther(el) {
    var ae = document.activeElement;
    if (ae && ae !== el && !(el && el.contains && el.contains(ae)) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) { try { ae.blur(); } catch (e) {} }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function leafVal(n) { return n.value !== undefined ? n.value : n.label; }
  function isBranch(n) { return !n.other && n.children && n.children.length; }

  // 条件に合う葉（その他を含む）までの index の道筋 [i0, i1, …]。見つからなければ null。
  function nodePath(nodes, pred, trail) {
    trail = trail || [];
    for (var i = 0; i < (nodes || []).length; i++) {
      var n = nodes[i], t = trail.concat(i);
      if (isBranch(n)) { var r = nodePath(n.children, pred, t); if (r) return r; }
      else if (pred(n)) return t;
    }
    return null;
  }
  function allPaths(nodes, pred, trail, out) {
    out = out || []; trail = trail || [];
    (nodes || []).forEach(function (n, i) { var t = trail.concat(i); if (isBranch(n)) allPaths(n.children, pred, t, out); else if (pred(n)) out.push(t); });
    return out;
  }

  // 値 → ラベルのパス配列（[大, 中, 小]）。見つからなければ null。
  function findPath(nodes, value, trail) {
    trail = trail || [];
    for (var i = 0; i < (nodes || []).length; i++) {
      var n = nodes[i], t = trail.concat(n.label);
      if (n.children && n.children.length) { var r = findPath(n.children, value, t); if (r) return r; }
      else if (String(leafVal(n)) === String(value)) return t;
    }
    return null;
  }

  function TssCascade(opts) {
    opts = opts || {};
    var roots = opts.options || [];
    var codeField = opts.codeField;
    var sep = opts.separator || ' / ';
    var placeholder = opts.otherPlaceholder != null ? opts.otherPlaceholder : '自由入力';
    var layoutOpt = opts.layout || 'auto';

    var panels = [];              // flyout: 開いているパネル(div)。panels[0]=root, [1]=sub, …／drill: panels[0] だけ
    var chosen = [];              // chosen[d] = 深さ d で降りた枝ノード（葉のパス復元に使う）
    var ctxRef = null, done = false, onDoc = null, onKey = null, composing = false, drill = false, standalone = false;
    // 開いた時の「今の選択」: curPath＝今の葉までの道筋（開いた時にそこへカーソル）／curOther(n)＝その「その他」に前に打った文字が入っているか
    var curPath = null, curOther = null, curText = '';
    function readCurrent(ctx) {
      curPath = null; curOther = null; curText = ctx.value == null ? '' : String(ctx.value);
      if (codeField != null) {
        // モード(2): codeField のコードで判定（その他は枝ごとにコードが違う＝開いた「その他」自身の value と比べる）
        var code = ctx.code !== undefined ? ctx.code : ((ctx.grid && ctx.r != null) ? ctx.grid.getValue(ctx.r, codeField) : null);
        if (code == null || code === '') return;
        curPath = nodePath(roots, function (n) { return String(leafVal(n)) === String(code); });
        curOther = function (n) { return !!n.other && String(leafVal(n)) === String(code); };
      } else if (curText !== '') {
        // モード(1): 値がふつうの葉のどれでもなければ「その他」で打った文字
        curPath = nodePath(roots, function (n) { return !n.other && String(leafVal(n)) === curText; });
        if (!curPath) {
          var others = allPaths(roots, function (n) { return !!n.other; });
          if (others.length === 1) curPath = others[0];   // 「その他」が1つならそこへカーソル（複数ならどれか分からない＝カーソルは置かず、どの「その他」にも文字を入れる）
          curOther = function (n) { return !!n.other; };
        }
      }
    }
    function otherText(n) { return (curOther && curOther(n) && curText !== '') ? curText : ''; }

    // 表示の仕方: 'flyout'＝右へ横に開く（PC）／'drill'＝1枚の中で段を入れ替える（スマホ）／'auto'＝指で操作する狭い画面だけ drill
    function useDrill() {
      if (layoutOpt === 'drill') return true;
      if (layoutOpt !== 'auto') return false;
      var coarse = false; try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
      return coarse && Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth) < 600;
    }

    function killPanel(p) { if (p._placer) { p._placer.destroy(); p._placer = null; } if (p.parentNode) p.parentNode.removeChild(p); }
    function teardown() {
      panels.forEach(killPanel);
      panels = []; chosen = [];
      if (onDoc) document.removeEventListener('pointerdown', onDoc, true);
      if (onKey) document.removeEventListener('keydown', onKey, true);
      onDoc = onKey = null; composing = false;
    }
    function closeFrom(depth) { while (panels.length > depth) killPanel(panels.pop()); if (chosen.length > depth) chosen.length = depth; }
    function doCancel() { if (done) return; done = true; var c = ctxRef; teardown(); if (c.cancel) c.cancel(); }

    // 確定。表の中: 値セルは commit（履歴に積む）、codeField は別列へ setValueRaw（readOnly 貫通・独立undoを作らない）。
    // 単体（openAt）: onPick({ value, code, other })。
    function finish(value, code, isOther) {
      if (done) return; done = true;
      var c = ctxRef; teardown();
      if (c.pick) { c.pick({ value: value, code: code, other: !!isOther }); return; }
      c.commit(value);
      if (codeField != null && c.grid && c.r != null) { try { c.grid.setValueRaw(c.r, codeField, code); } catch (e) {} }
    }
    // 普通の葉。モード(2)は値＝パス／code＝葉value、モード(1)は値＝葉value（従来）。
    function commitLeaf(n, depth) {
      var path = chosen.slice(0, depth).map(function (x) { return x.label; }).concat(n.label).join(sep);
      finish(codeField != null ? path : leafVal(n), leafVal(n), false);
    }
    // 「その他」。値＝打った文字／code＝その他ノードの value（枝ごとに違うコード）。
    function commitOther(n, text) { finish(text, leafVal(n), true); }

    function newPop(extra) {
      var pop = document.createElement('div');
      pop.className = 'tg-cascade' + (extra ? ' ' + extra : '') + (opts.className ? ' ' + opts.className : '');
      document.body.appendChild(pop);
      return pop;
    }
    function itemHTML(n, i) {
      var branch = isBranch(n), other = !!n.other;
      return '<div class="tg-casc-item' + (branch ? ' branch' : '') + (other ? ' tg-casc-other' : '') + '" data-i="' + i + '" role="menuitem" tabindex="-1">' +
        '<span class="tg-casc-label">' + esc(n.label) + (other ? '…' : '') + (other && otherText(n) ? '<span class="tg-casc-cur">（' + esc(otherText(n)) + '）</span>' : '') + '</span>' + (branch ? '<span class="tg-casc-arrow">' + (drill ? '›' : '▸') + '</span>' : '') + '</div>';
    }
    // 「その他」の入力欄（共通）。wrap に入れて、確定/戻るを結ぶ。
    function buildInput(wrap, n, onBack) {
      wrap.innerHTML += '<div class="tg-casc-inputwrap">' +
        '<input class="tg-casc-input" type="text" placeholder="' + esc(placeholder) + '">' +
        '<div class="tg-casc-actions"><button type="button" class="tg-casc-ok">確定</button>' +
        '<button type="button" class="tg-casc-back">戻る</button></div></div>';
      var input = wrap.querySelector('.tg-casc-input');
      input.value = otherText(n);   // 前に打った文字を入れて開く（少し直すだけで済む）
      input.addEventListener('compositionstart', function () { composing = true; });
      input.addEventListener('compositionend', function () { composing = false; });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { if (composing || e.isComposing || e.keyCode === 229) return; e.preventDefault(); commitOther(n, input.value); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onBack(); }
      });
      wrap.querySelector('.tg-casc-ok').addEventListener('mousedown', function (e) { e.preventDefault(); commitOther(n, input.value); });
      wrap.querySelector('.tg-casc-back').addEventListener('mousedown', function (e) { e.preventDefault(); onBack(); });
      setTimeout(function () { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 0);
    }

    // ---- flyout（PC）: 右へ横に開く ----
    function openInput(n, depth, anchorEl) {
      closeFrom(depth + 1);
      var pop = newPop('tg-casc-inputpop');
      pop._isInput = true; pop._depth = depth + 1;
      panels[depth + 1] = pop;
      buildInput(pop, n, function () { closeFrom(depth + 1); var pp = panels[depth]; if (pp && pp._active != null && pp._items[pp._active]) pp._items[pp._active].focus(); });
      pop._placer = tssPlace(pop, anchorEl, { side: 'right' });
      return pop;
    }
    function bindItems(pop, nodes, depth) {
      var items = pop.querySelectorAll('.tg-casc-item');
      pop._items = items; pop._active = null; pop._depth = depth;
      pop._activate = function (idx) { Array.prototype.forEach.call(items, function (el, k) { el.classList.toggle('active', k === idx); }); pop._active = idx; if (items[idx] && items[idx].scrollIntoView) items[idx].scrollIntoView({ block: 'nearest' }); };
      return items;
    }
    function openPanel(nodes, depth, anchor) {
      closeFrom(depth);
      var pop = newPop(); pop.setAttribute('role', 'menu');
      pop.innerHTML = nodes.map(itemHTML).join('');
      panels[depth] = pop;
      var items = bindItems(pop, nodes, depth);
      pop._enter = function (idx, viaKey) {          // ホバー/→: 枝なら submenu を開く。葉/その他はそれ以上開かない。
        var n = nodes[idx]; if (!n) return; pop._activate(idx);
        if (isBranch(n)) {
          chosen[depth] = n;
          openPanel(n.children, depth + 1, items[idx]);
          if (viaKey) { var sub = panels[depth + 1], f = sub._items[0]; if (f) { sub._activate(0); f.focus(); } }
        } else closeFrom(depth + 1);
      };
      pop._choose = function (idx) {                 // クリック/Enter: 枝→開く／その他→入力へ／葉→確定
        var n = nodes[idx]; if (!n) return;
        if (n.other) { pop._activate(idx); openInput(n, depth, items[idx]); }
        else if (isBranch(n)) pop._enter(idx, true);
        else commitLeaf(n, depth);
      };
      Array.prototype.forEach.call(items, function (el) {
        var idx = +el.dataset.i;
        el.addEventListener('mouseenter', function () { pop._enter(idx, false); });
        el.addEventListener('click', function (e) { e.stopPropagation(); pop._choose(idx); });
      });
      pop._placer = depth === 0 ? tssPlace(pop, anchor, { fit: true, onLost: standalone ? doCancel : null }) : tssPlace(pop, anchor, { side: 'right' });
      return pop;
    }

    // ---- drill（スマホ）: 1枚の中で段を入れ替える。上に「‹ 親」の戻る行 ----
    var dpop = null, dNodes = null, dDepth = 0;
    function drillNodesAt(depth) { var ns = roots; for (var d = 0; d < depth; d++) ns = chosen[d].children; return ns; }
    function drillBackRow(label) { return '<div class="tg-casc-dback" role="button" tabindex="-1">‹ ' + esc(label) + '</div>'; }
    function drillBack() { if (dDepth > 0) { var from = chosen[dDepth - 1]; drillShow(dDepth - 1, from); } }
    function drillShow(depth, highlightNode) {
      dDepth = depth; chosen.length = depth; dNodes = drillNodesAt(depth);
      dpop._isInput = false;
      dpop.innerHTML = (depth > 0 ? drillBackRow(chosen[depth - 1].label) : '') + dNodes.map(itemHTML).join('');
      var items = bindItems(dpop, dNodes, depth);
      var back = dpop.querySelector('.tg-casc-dback');
      if (back) back.addEventListener('click', function (e) { e.stopPropagation(); drillBack(); });
      dpop._enter = function (idx) { var n = dNodes[idx]; if (n && isBranch(n)) { chosen[depth] = n; drillShow(depth + 1); } };
      dpop._choose = function (idx) {
        var n = dNodes[idx]; if (!n) return;
        if (n.other) drillInput(n, depth);
        else if (isBranch(n)) dpop._enter(idx);
        else commitLeaf(n, depth);
      };
      Array.prototype.forEach.call(items, function (el) {
        var idx = +el.dataset.i;
        el.addEventListener('click', function (e) { e.stopPropagation(); dpop._choose(idx); });
      });
      var k = highlightNode ? dNodes.indexOf(highlightNode) : 0;
      if (items.length) { dpop._activate(k >= 0 ? k : 0); }
      dpop.scrollTop = 0; if (k > 0 && items[k]) items[k].scrollIntoView({ block: 'nearest' });
    }
    function drillInput(n, depth) {
      dpop._isInput = true;
      dpop.innerHTML = drillBackRow(depth > 0 ? chosen[depth - 1].label : '戻る');
      buildInput(dpop, n, function () { drillShow(depth, n); });   // ↑ innerHTML += するので、戻る行の listener はこの後で付ける
      dpop.querySelector('.tg-casc-dback').addEventListener('click', function (e) { e.stopPropagation(); drillShow(depth, n); });
    }

    function handleKey(e) {
      var pop = panels[panels.length - 1]; if (!pop) return;
      if (pop._isInput) return;                       // 入力モードのキーは input 側で処理
      var items = pop._items, idx = pop._active == null ? -1 : pop._active, n;
      if (e.key === 'ArrowDown') { e.preventDefault(); n = (idx + 1) % items.length; pop._activate(n); items[n].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); n = (idx - 1 + items.length) % items.length; pop._activate(n); items[n].focus(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (idx >= 0) pop._enter(idx, true); }
      else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (drill) { drillBack(); var f = dpop._items[dpop._active]; if (f) f.focus(); }
        else if (panels.length > 1) { closeFrom(panels.length - 1); var pp = panels[panels.length - 1]; if (pp._active != null) pp._items[pp._active].focus(); }
      }
      else if (e.key === 'Enter') { e.preventDefault(); if (idx >= 0) pop._choose(idx); }
      else if (e.key === 'Escape') { e.preventDefault(); if (drill && dDepth > 0) drillBack(); else doCancel(); }
    }

    // 開く（表の中・単体の共通）。anchor＝置き場所の基準（要素 or 要素を返す関数）。
    function start(ctx, anchor, isStandalone) {
      if (panels.length) teardown();
      ctxRef = ctx; done = false; standalone = !!isStandalone; drill = useDrill();
      readCurrent(ctx);
      if (drill) {
        dpop = newPop('tg-casc-drill'); dpop.setAttribute('role', 'menu');
        panels[0] = dpop;
        var aw = typeof anchor === 'function' ? anchor() : anchor;
        if (aw) dpop.style.minWidth = Math.max(aw.getBoundingClientRect().width, 220) + 'px';
        // 今の選択の所まで降りて開く（有給 ▸ その他（通院）なら「‹ 有給」の段で その他 が光る）
        var depth = 0, hl = null;
        if (curPath) {
          var ns = roots;
          for (var d = 0; d < curPath.length - 1; d++) { var b = ns[curPath[d]]; if (!b || !isBranch(b)) break; chosen[d] = b; ns = b.children; depth = d + 1; }
          if (depth === curPath.length - 1) hl = ns[curPath[depth]];
        }
        drillShow(depth, hl);
        dpop._placer = tssPlace(dpop, anchor, { fit: true, onLost: standalone ? doCancel : null });
        var f0 = dpop._items[dpop._active]; if (f0) f0.focus({ preventScroll: true });
      } else {
        openPanel(roots, 0, anchor);
        // 今の選択の所までたどってカーソルを置く（有給 ▸ その他（通院）なら そこが光った状態で開く）。無ければ先頭。
        var placed = false;
        if (curPath) {
          for (var dd = 0; dd < curPath.length; dd++) {
            var pp = panels[dd], i = curPath[dd]; if (!pp || !pp._items[i]) break;
            if (dd < curPath.length - 1) pp._enter(i, false);
            else { pp._activate(i); pp._items[i].focus(); placed = true; }
          }
        }
        if (!placed) { closeFrom(1); var f = panels[0]._items[0]; if (f) { panels[0]._activate(0); f.focus(); } }
      }
      onDoc = function (e) { for (var i = 0; i < panels.length; i++) if (panels[i].contains(e.target)) return; doCancel(); };
      onKey = handleKey;
      document.addEventListener('pointerdown', onDoc, true);
      document.addEventListener('keydown', onKey, true);
    }

    return {
      openOnClick: opts.openOnClick !== false,
      icon: opts.icon != null ? opts.icon : '▾',
      open: function (ctx) { start(ctx, tssAnchor(ctx.td, ctx), false); },
      // 単体で開く: current＝今の値（文字）か { value, code }（codeField を使う定義なら code も渡す）。onPick({ value, code, other })。
      openAt: function (anchorEl, current, onPick, onCancel) {
        tssBlurOther(anchorEl);
        var cur = (current && typeof current === 'object') ? current : { value: current };
        start({ value: cur.value == null ? '' : cur.value, code: cur.code === undefined ? null : cur.code, td: anchorEl, pick: onPick, cancel: onCancel || function () {} }, anchorEl, true);
      },
      close: function () { teardown(); },
    };
  }

  TssCascade.pathFormat = function (options, o) {
    o = o || {}; var sep = o.separator || ' / ';
    return function (value) { if (value === '' || value == null) return ''; var p = findPath(options || [], value); return p ? p.join(sep) : String(value); };
  };
  TssCascade.pathOf = function (options, value, sep) { var p = findPath(options || [], value); return p ? p.join(sep || ' / ') : (value == null ? '' : String(value)); };

  if (typeof module !== 'undefined' && module.exports) module.exports = TssCascade;
  else root.TssCascade = TssCascade;
})(typeof self !== 'undefined' ? self : this);
