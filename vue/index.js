/*! TssGridVue — TssGrid の薄い Vue 3 アダプタ（UMD・ノービルド・vue は peerDependency）
 *
 *  方針（React アダプタと同じ）: グリッドはアンコントロールド。マウントで生成・アンマウントで destroy()。
 *   値の読み書きは expose した grid 本体（命令API）＋ on* コールバック。data プロップは「差し替え」用。
 *
 *  使い方:
 *    import { TssGridVue } from '@threestarsoftware/tssgrid/vue';
 *    import '@threestarsoftware/tssgrid/tssgrid.css';
 *    <TssGridVue :columns="cols" :data="rows" :read-only="locked" :max-rows="50" @after-change="onChange" ref="g" />
 *    // 命令API: g.value.grid().sortBy('col','desc') など（grid 本体を返す）
 *
 *  TssGrid のオプションは全部そのまま属性に書ける（:max-rows / :maxRows どちらも可・@after-change = onAfterChange）。
 *  :options="{…}" でまとめて渡すこともできる（属性が優先）。class / style は外側の div に付く。
 *  後から変えて効くもの: data（参照が変わったら setData）・columns（setColumns）・read-only（setReadOnly）。
 *  それ以外は生成時の値（変えたい時は :key で作り直す）。on* は呼ばれた時の最新を呼ぶ。
 *
 *  注意: data は参照が変わった時だけ setData（毎回新配列はリセット＝カーソルが飛ぶ）。頻繁な更新は grid の命令APIで。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('vue'), require('../src/tssgrid.js'));
  } else {
    root.TssGridVue = factory(root.Vue, { TssGrid: root.TssGrid });
  }
})(typeof self !== 'undefined' ? self : this, function (Vue, core) {
  'use strict';
  var TssGrid = core && (core.TssGrid || core);
  // 'max-rows' → 'maxRows'（Vue.camelize が無い古い版でも動くよう自前）
  function camel(s) { return String(s).replace(/-([a-z0-9])/g, function (_, ch) { return ch.toUpperCase(); }); }

  var TssGridVue = Vue.defineComponent({
    name: 'TssGridVue',
    inheritAttrs: false,   // オプション属性を div に付けない（class / style だけ div へ手で渡す）
    props: {
      // 後から変わった時に反映するものだけプロップとして宣言（変更を監視するため）。その他のオプションは属性で受ける。
      columns: Array, data: Array, options: Object,
      readOnly: { type: Boolean, default: undefined },
    },
    setup: function (props, ctx) {
      var el = Vue.ref(null);
      var grid = null;
      function attrOpts() {
        var o = {}, attrs = ctx.attrs || {};
        Object.keys(attrs).forEach(function (a) {
          if (a === 'class' || a === 'style') return;
          var v = attrs[a];
          if (/^on[A-Z]/.test(a) && typeof v === 'function') {
            // @after-change = attrs.onAfterChange。呼ばれた時の最新の関数を呼ぶ（再描画で差し替わっても追従）
            o[a] = function () { var fn = ctx.attrs[a]; if (typeof fn === 'function') return fn.apply(this, arguments); };
          } else {
            o[camel(a)] = v;   // ※真偽は :virtual="true" のようにバインドで書く（値なし属性は '' になる＝placeholder="" と区別できないため変換しない）
          }
        });
        return o;
      }
      function buildOptions() {
        var o = {}, k;
        if (props.options) for (k in props.options) o[k] = props.options[k];
        var a = attrOpts(); for (k in a) o[k] = a[k];
        if (props.columns !== undefined) o.columns = props.columns;
        if (props.data !== undefined) o.data = props.data;
        if (props.readOnly !== undefined) o.readOnly = props.readOnly;
        return o;
      }
      Vue.onMounted(function () { grid = new TssGrid(el.value, buildOptions()); });
      Vue.onBeforeUnmount(function () { if (grid) { try { grid.destroy(); } catch (e) {} grid = null; } });
      // 後から変わったら反映（参照が変わった時だけ）。列→データの順（同時に変わったら新しい列でデータを入れる）
      Vue.watch(function () { return props.columns; }, function (cols) {
        if (!grid || cols == null) return;
        var hd = ctx.attrs.headers; grid.setColumns(cols, hd);
      }, { flush: 'pre' });
      Vue.watch(function () { return props.data; }, function (d) { if (grid && d != null) grid.setData(d); });
      Vue.watch(function () { return props.readOnly; }, function (v) { if (grid && v !== undefined) grid.setReadOnly(!!v); });
      ctx.expose({ grid: function () { return grid; } });                                                       // grid 本体を命令API として公開
      return function () { return Vue.h('div', { ref: el, class: ctx.attrs.class, style: ctx.attrs.style }); };
    },
  });

  TssGridVue.TssGridVue = TssGridVue;
  TssGridVue.default = TssGridVue;
  return TssGridVue;
});
