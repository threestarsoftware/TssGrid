// TssGridVue — TssGrid の薄い Vue 3 アダプタの型。
import { DefineComponent } from 'vue';
import { TssGrid, TssGridOptions } from '../src/tssgrid';

// TssGrid のオプションは全部そのまま属性に書ける（:max-rows / :maxRows どちらも可・@after-change = onAfterChange）。
// 後から変えて効くのは data / columns / readOnly（それ以外は生成時の値＝変えたい時は :key で作り直す）。
export type TssGridVueProps = Partial<TssGridOptions> & { options?: TssGridOptions };

// expose: grid() で grid 本体（命令API）を返す。
export interface TssGridVueExposed {
  grid(): TssGrid | null;
}

declare const TssGridVue: DefineComponent<TssGridVueProps>;

export default TssGridVue;
export { TssGridVue };
