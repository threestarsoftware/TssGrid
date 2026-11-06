// TssGridReact — TssGrid の薄い React アダプタの型。
import * as React from 'react';
import { TssGrid, TssGridOptions } from '../src/tssgrid';

// トップレベルに書ける定番オプション＋全 on* コールバックは Partial<TssGridOptions> として受ける。
// それ以外は options={{…}} でまとめて渡す。className / style は host の <div> に付く。
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
