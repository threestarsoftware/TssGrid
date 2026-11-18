/*! TssGridReact — TssGrid の薄い React アダプタ（UMD・ノービルド・react は peerDependency）
 *
 *  方針（競合 ag-grid-react / @handsontable/react と同じ）:
 *   - グリッドは「アンコントロールド」= マウント時に1回生成し、アンマウントで destroy()。cell を React で描かない（高速）。
 *   - 値の読み書きは ref 経由の命令API（grid 本体）＋ onAfterChange 等のコールバック。data プロップは「差し替え」用。
 *   - TssGrid のオプションは全部そのままプロップに書ける（className / style / options / children 以外は全部 TssGrid へ）。
 *
 *  使い方:
 *    import { TssGridReact } from '@threestarsoftware/tssgrid/react';
 *    import '@threestarsoftware/tssgrid/tssgrid.css';
 *    const ref = useRef(null);
 *    <TssGridReact columns={cols} data={rows} readOnly={locked} maxRows={50}
 *                  onAfterChange={(ch, src) => ...} ref={ref} />
 *    // 命令API: ref.current.sortBy('col','desc') / ref.current.getRows() など（grid 本体）
 *
 *  後から変えて効くプロップ: data（参照が変わったら setData）・columns（setColumns）・readOnly（setReadOnly）。
 *  それ以外のオプションは生成時の値（変えたい時は key で作り直す）。
 *  on* コールバックは毎レンダーの最新を呼ぶ＝インラインの (ch) => setState(...) でも古い state を掴まない。
 *
 *  注意:
 *   - data は「参照が変わった時だけ」setData されます（毎レンダー新配列を渡すと毎回リセット＝カーソルも飛ぶ）。
 *     頻繁な更新は ref の命令API（setValue/ appendRows 等）を使うのが定石。columns も同じく参照で判定（useMemo 推奨）。
 *   - 構築はブラウザでだけ走る effect（描画前の layout effect＝親の useEffect では ref.current に grid がある）なので SSR/Next でもそのまま（サーバでは空 div）。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('react'), require('../src/tssgrid.js'));
  } else {
    root.TssGridReact = factory(root.React, { TssGrid: root.TssGrid });
  }
})(typeof self !== 'undefined' ? self : this, function (React, core) {
  'use strict';
  var TssGrid = core && (core.TssGrid || core);
  var h = React.createElement;
  // アダプタ自身が使うプロップ（TssGrid へは渡さない）。それ以外は全部 TssGrid のオプションとして渡す。
  var OWN = { className: 1, style: 1, options: 1, children: 1 };

  // propsRef: 常に最新のプロップ。on* は「呼ばれた時に最新を引く」転送関数にする（古いクロージャ対策）。
  function buildOptions(propsRef) {
    var props = propsRef.current, o = {};
    if (props.options) for (var k in props.options) o[k] = props.options[k];
    Object.keys(props).forEach(function (key) {
      if (OWN[key] || props[key] === undefined) return;
      if (/^on[A-Z]/.test(key) && typeof props[key] === 'function') {
        o[key] = function () {
          var fn = propsRef.current[key];
          if (typeof fn === 'function') return fn.apply(this, arguments);
        };
      } else o[key] = props[key];
    });
    return o;
  }

  // ブラウザでは useLayoutEffect（描画前・親の useEffect より先）、サーバー（SSR）では useEffect（警告を出さない・サーバーでは何もしない）。
  var useIsoLayoutEffect = (typeof window !== 'undefined' && React.useLayoutEffect) ? React.useLayoutEffect : React.useEffect;

  // 依存が「前回と変わった時だけ」fn を呼ぶ effect。初回は生成時の値を使うので呼ばない。
  // 前回値と比べる＝StrictMode の effect 二重実行（同じ値）では呼ばない（setData の余計な実行で履歴が消えない）。
  function useUpdateEffect(fn, deps, gridRef) {
    var prev = React.useRef(null);
    React.useEffect(function () {
      var p = prev.current; prev.current = deps;
      if (!p) return;
      var same = p.length === deps.length && p.every(function (v, i) { return Object.is(v, deps[i]); });
      if (!same && gridRef.current) fn(gridRef.current);
    }, deps);
  }

  var TssGridReact = React.forwardRef(function (props, ref) {
    var hostRef = React.useRef(null);
    var gridRef = React.useRef(null);
    var propsRef = React.useRef(props);
    propsRef.current = props;
    var readyState = React.useState(0);                           // grid 生成後に ref（命令API）を更新させるためのバンプ

    // 生成は1回（アンコントロールド）。StrictMode 二重でも destroy が冪等。
    // layout effect で作る＝親の useEffect が走る時には ref.current に grid がある（親の effect で TssSum.attach 等をそのまま書ける）。
    useIsoLayoutEffect(function () {
      var grid = new TssGrid(hostRef.current, buildOptions(propsRef));
      gridRef.current = grid;
      readyState[1](function (n) { return n + 1; });              // ref.current = grid 本体 に更新（useImperativeHandle を再評価）
      return function () { try { grid.destroy(); } catch (e) {} if (gridRef.current === grid) gridRef.current = null; };
    }, []);

    // 後から変わったら反映（参照が変わった時だけ）。列→データの順（同時に変わったら新しい列でデータを入れる）
    useUpdateEffect(function (g) { if (props.columns != null) g.setColumns(props.columns, props.headers); }, [props.columns, props.headers], gridRef);
    useUpdateEffect(function (g) { if (props.data != null) g.setData(props.data); }, [props.data], gridRef);
    useUpdateEffect(function (g) { g.setReadOnly(!!props.readOnly); }, [props.readOnly], gridRef);

    React.useImperativeHandle(ref, function () { return gridRef.current; }, [readyState[0]]);   // grid 本体を命令API として公開（生成後に更新）

    return h('div', { ref: hostRef, className: props.className, style: props.style });
  });
  TssGridReact.displayName = 'TssGridReact';
  TssGridReact.TssGridReact = TssGridReact;   // import { TssGridReact } / import TssGridReact どちらも通す
  TssGridReact.default = TssGridReact;
  return TssGridReact;
});
