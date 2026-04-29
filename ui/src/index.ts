// Public exports for the @strada.sh/ui component package.

export { TraceTimeline } from './components/traces/trace-timeline.tsx'
export type { TraceTimelineProps } from './components/traces/trace-timeline.tsx'
export { TraceTimelineDemo } from './components/traces/trace-timeline-demo.tsx'
export {
  TraceTimelineConnectors,
  TraceTimelineRows,
  TraceTimelineSearch,
  TraceTimelineTimeAxis,
  TraceTimelineTooltipContent,
} from './components/traces/trace-timeline-parts.tsx'
export type { BarSearchState } from './components/traces/trace-timeline-parts.tsx'
export { TraceViewProvider } from './components/traces/trace-timeline-state.tsx'
export type { TraceViewContextValue, TimelineBar, ViewportState } from './components/traces/trace-timeline-state.tsx'
export { TraceTimelineMinimap } from './components/traces/trace-timeline-minimap.tsx'
export { ThemeToggle } from './components/traces/theme-toggle.tsx'
export { Chart, ChartLegend, TimeseriesChart } from './components/charts.tsx'
export type {
  ChartEvents,
  ChartProps,
  SafeTooltipOption,
  StradaChartOption,
  TimeseriesChartProps,
  TimeseriesData,
} from './components/charts.tsx'
export { ChartPalette } from './lib/chart-palette.ts'
export type { ChartSemanticColorName, ChartSequentialPaletteName } from './lib/chart-palette.ts'
export {
  buildSpanTree,
  calculateSelfTime,
  cn,
  formatDuration,
  getHttpInfo,
  getServiceBarColors,
  getServiceLegendColor,
  useContainerSize,
  useIsDark,
} from './lib/utils.ts'
export type { OtelTraceRow, SpanNode } from './lib/utils.ts'
