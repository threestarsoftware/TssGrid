/*! TssGridReact — TssGrid の薄い React アダプタ（UMD・ノービルド・react は peerDependency）
 *
 *  方針（競合 ag-grid-react / @handsontable/react と同じ）:
 *   - グリッドは「アンコントロールド」= マウント時に1回生成し、アンマウントで destroy()。cell を React で描かない（高速）。
 *   - 値の読み書きは ref 経由の命令API（grid 本体）＋ onAfterChange 等のコールバック。data プロップは「差し替え」用。
 *   - 全ての on* コールバック（onAfterChange / onEditEnd …）と columns/data/plugins/options をそのまま TssGrid へ渡す。
 *
 *  使い方:
 *    import { TssGridReact } from '@threestarsoftware/tssgrid/react';
 *    import '@threestarsoftware/tssgrid/tssgrid.css';
 *    const ref = useRef(null);
 *    <TssGridReact columns={cols} data={rows} plugins={[...]}
 *                  onAfterChange={(ch, src) => ...} ref={ref} />
 *    // 命令API: ref.current.sortBy('col','desc') / ref.current.getRows() など（grid 本体）
 *
 *  注意:
 *   - data は「参照が変わった時だけ」setData されます（毎レンダー新配列を渡すと毎回リセット＝カーソルも飛ぶ）。
 *     頻繁な更新は ref の命令API（setValue/ appendRows 等）を使うのが定石。
 *   - 構築は useEffect（クライアント専用）なので SSR/Next でもそのまま（サーバでは空 div）。columns を変えたい時は key で remount。
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
  // トップレベルに書ける定番オプション（それ以外は options={{…}} で）。
  var PASS = { columns: 1, headers: 1, data: 1, plugins: 1, name: 1, width: 1, height: 1, rowHeight: 1, rowHeaders: 1, colHeaders: 1, minSpareRows: 1, maxRows: 1, history: 1, virtual: 1, hiddenColumns: 1 };

  function buildOptions(props) {
    var o = {};
    if (props.options) for (var k in props.options) o[k] = props.options[k];
    for (var key in props) {
      if (PASS[key]) o[key] = props[key];
      else if (/^on[A-Z]/.test(key) && typeof props[key] === 'function') o[key] = props[key];   // on* コールバック総通し
    }
    return o;
  }

  var TssGridReact = React.forwardRef(function (props, ref) {
    var hostRef = React.useRef(null);
    var gridRef = React.useRef(null);
    var propsRef = React.useRef(props);
    propsRef.current = props;
    var firstData = React.useRef(true);
    var readyState = React.useState(0);                           // grid 生成後に ref（命令API）を更新させるためのバンプ

    React.useEffect(function () {                                  // 生成は1回（アンコントロールド）。StrictMode 二重でも destroy が冪等。
      var grid = new TssGrid(hostRef.current, buildOptions(propsRef.current));
      gridRef.current = grid;
      firstData.current = true;
      readyState[1](function (n) { return n + 1; });              // ref.current = grid 本体 に更新（useImperativeHandle を再評価）
      return function () { try { grid.destroy(); } catch (e) {} if (gridRef.current === grid) gridRef.current = null; };
    }, []);

    React.useEffect(function () {                                  // data の参照が変わったら差し替え（初回=生成時の data を使うのでスキップ）
      if (firstData.current) { firstData.current = false; return; }
      var g = gridRef.current;
      if (g && propsRef.current.data != null) g.setData(propsRef.current.data);
    }, [props.data]);

    React.useImperativeHandle(ref, function () { return gridRef.current; }, [readyState[0]]);   // grid 本体を命令API として公開（生成後に更新）

    return h('div', { ref: hostRef, className: props.className, style: props.style });
  });
  TssGridReact.displayName = 'TssGridReact';
  TssGridReact.TssGridReact = TssGridReact;   // import { TssGridReact } / import TssGridReact どちらも通す
  TssGridReact.default = TssGridReact;
  return TssGridReact;
});
