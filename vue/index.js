/*! TssGridVue — TssGrid の薄い Vue 3 アダプタ（UMD・ノービルド・vue は peerDependency）
 *
 *  方針（React アダプタと同じ）: グリッドはアンコントロールド。マウントで生成・アンマウントで destroy()。
 *   値の読み書きは expose した grid 本体（命令API）＋ on* コールバック。data プロップは「差し替え」用。
 *
 *  使い方:
 *    import { TssGridVue } from '@threestarsoftware/tssgrid/vue';
 *    import '@threestarsoftware/tssgrid/tssgrid.css';
 *    <TssGridVue :columns="cols" :data="rows" :plugins="[...]" :options="{ onAfterChange }" ref="g" />
 *    // 命令API: this.$refs.g.grid().sortBy('col','desc') など（grid 本体を返す）
 *
 *  注意: on* コールバックは :options（例 :options="{ onAfterChange: fn }"）か、@after-change などの属性で渡せます。
 *        data は参照が変わった時だけ setData（毎回新配列はリセット＝カーソルが飛ぶ）。頻繁な更新は grid の命令APIで。
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
  var PASS = ['columns', 'data', 'plugins', 'headers', 'name', 'width', 'height', 'rowHeight', 'rowHeaders', 'colHeaders', 'minSpareRows', 'maxRows', 'history', 'virtual', 'hiddenColumns'];

  var TssGridVue = Vue.defineComponent({
    name: 'TssGridVue',
    inheritAttrs: false,   // on* 属性を div に二重付けしない
    props: {
      columns: Array, data: Array, plugins: Array, options: Object, headers: Array,
      name: String, width: [Number, String], height: [Number, String],
      rowHeight: Number, rowHeaders: { type: Boolean, default: undefined }, minSpareRows: Number,
    },
    setup: function (props, ctx) {
      var el = Vue.ref(null);
      var grid = null;
      function buildOptions() {
        var o = {};
        if (props.options) for (var k in props.options) o[k] = props.options[k];
        PASS.forEach(function (key) { if (props[key] !== undefined) o[key] = props[key]; });
        var attrs = ctx.attrs || {};
        for (var a in attrs) { if (/^on[A-Z]/.test(a) && typeof attrs[a] === 'function') o[a] = attrs[a]; }   // @after-change 等＝attrs の onAfterChange
        return o;
      }
      Vue.onMounted(function () { grid = new TssGrid(el.value, buildOptions()); });
      Vue.onBeforeUnmount(function () { if (grid) { try { grid.destroy(); } catch (e) {} grid = null; } });
      Vue.watch(function () { return props.data; }, function (d) { if (grid && d != null) grid.setData(d); });   // 参照が変わったら差し替え
      ctx.expose({ grid: function () { return grid; } });                                                       // grid 本体を命令API として公開
      return function () { return Vue.h('div', { ref: el }); };
    },
  });

  TssGridVue.TssGridVue = TssGridVue;
  TssGridVue.default = TssGridVue;
  return TssGridVue;
});
