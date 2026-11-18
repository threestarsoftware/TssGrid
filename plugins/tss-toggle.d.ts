// TssToggle — 2択以上のセグメント・トグル（有効|無効・未回答|出席|欠席 …）。値は選んだ option の value。
import { TssGrid } from '../src/tssgrid';

export = TssToggle;
export as namespace TssToggle;

declare const TssToggle: {
  /** `plugins: [TssToggle.plugin({ columns: { status: ['有効','無効'] } })]`。 */
  plugin(opts?: TssToggle.Options): (grid: TssGrid) => { name: 'toggle'; destroy(): void };
  /** 列定義で直接使う時の format（`{ html:true, format: TssToggle.format([...]) }`）。 */
  format(options: TssToggle.Option[]): (value: any) => string;
};

declare namespace TssToggle {
  /** 文字列（value=label）か {value,label}。 */
  type Option = string | { value: string | number; label: string };

  interface Options {
    /** { dataキー: 2つ以上の選択肢 }。 */
    columns?: Record<string, Option[]>;
    /** 選んだ側の色（CSS 変数 --tg-toggle-accent でも可）。 */
    accent?: string;
  }
}
