// TssGridVue — TssGrid の薄い Vue 3 アダプタの型。
import { DefineComponent } from 'vue';
import { TssGrid, TssGridOptions } from '../src/tssgrid';

export type TssGridVueProps = Partial<TssGridOptions> & { options?: TssGridOptions };

// expose: grid() で grid 本体（命令API）を返す。
export interface TssGridVueExposed {
  grid(): TssGrid | null;
}

declare const TssGridVue: DefineComponent<TssGridVueProps>;

export default TssGridVue;
export { TssGridVue };
