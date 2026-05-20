// Ambient type stubs for modules imported by the website source that don't
// resolve under the CLI's nodenext module resolution. The CLI only needs
// `import type { App }` from the website, so these stubs just satisfy tsc
// without providing real implementations.

// echarts uses bundler-only exports that fail under nodenext resolution
declare module "echarts" {
  export type EChartsOption = any;
  export function init(...args: any[]): any;
  export function use(...args: any[]): void;
  export function registerTheme(...args: any[]): void;
  const _default: { init: typeof init; use: typeof use; registerTheme: typeof registerTheme };
  export default _default;
}

declare module "echarts/core" {
  export function use(...args: any[]): void;
  export function registerTheme(...args: any[]): void;
  export function init(...args: any[]): any;
}

declare module "echarts/charts" {
  export const LineChart: any;
  export const BarChart: any;
}

declare module "echarts/components" {
  export const GridComponent: any;
  export const TooltipComponent: any;
  export const LegendComponent: any;
}

declare module "echarts/renderers" {
  export const CanvasRenderer: any;
}
