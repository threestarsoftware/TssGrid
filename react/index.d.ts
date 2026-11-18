// TssGridReact — TssGrid の薄い React アダプタの型。
import * as React from 'react';
import { TssGrid, TssGridOptions } from '../src/tssgrid';

// TssGrid のオプションは全部そのままプロップに書ける（Partial<TssGridOptions>・名前の書き間違いは型エラー）。
// options={{…}} でまとめて渡すことも可（個別プロップが優先）。className / style は host の <div> に付く。
// 後から変えて効くのは data / columns / readOnly。on* は毎レンダーの最新が呼ばれる。
export interface TssGridReactProps extends Partial<TssGridOptions> {
  className?: string;
  style?: React.CSSProperties;
  options?: TssGridOptions;
}

// ref には grid 本体（命令API）が入る。
declare const TssGridReact: React.ForwardRefExoticComponent<
  TssGridReactProps & React.RefAttributes<TssGrid>
>;

export default TssGridReact;
export { TssGridReact };
