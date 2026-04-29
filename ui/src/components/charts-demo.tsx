/**
 * Client-side chart demo page for the @strada.sh/ui demo app. Registers the
 * ECharts modules needed by the copied chart components and renders examples.
 */
'use client'

import { BarChart, LineChart } from 'echarts/charts'
import {
  AriaComponent,
  AxisPointerComponent,
  BrushComponent,
  GridComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

import { ChartLegend, TimeseriesChart } from './charts.tsx'
import { ThemeToggle } from './traces/theme-toggle.tsx'
import { ChartPalette } from '../lib/chart-palette.ts'
import { useIsDark } from '../lib/utils.ts'

echarts.use([
  LineChart,
  BarChart,
  AxisPointerComponent,
  BrushComponent,
  GridComponent,
  ToolboxComponent,
  TooltipComponent,
  CanvasRenderer,
  AriaComponent,
])

export function ChartsDemoPage() {
  const isDark = useIsDark()
  const data = buildChartDemoData(isDark)

  return (
    <div className="flex w-full max-w-6xl flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Charts</h1>
          <p className="text-sm text-muted-foreground">
            Timeseries charts using ECharts with Strada theme tokens.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4 border-b border-border pb-3">
          {data.line.map((series) => (
            <ChartLegend.SmallItem
              key={series.name}
              color={series.color}
              name={series.name}
              value={series.data.at(-1)?.[1].toFixed(0) ?? '0'}
            />
          ))}
        </div>
        <TimeseriesChart
          echarts={echarts}
          data={data.line}
          gradient
          isDarkMode={isDark}
          xAxisName="Time"
          yAxisName="Requests"
          tooltipValueFormat={(value) => `${value.toFixed(0)} req/s`}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4 border-b border-border pb-3">
          {data.bar.map((series) => (
            <ChartLegend.LargeItem
              key={series.name}
              color={series.color}
              name={series.name}
              value={series.data.at(-1)?.[1].toFixed(0) ?? '0'}
              unit="events"
            />
          ))}
        </div>
        <TimeseriesChart
          echarts={echarts}
          data={data.bar}
          height={300}
          isDarkMode={isDark}
          type="bar"
          xAxisName="Time"
          yAxisName="Events"
        />
      </section>
    </div>
  )
}

function buildChartDemoData(isDark: boolean) {
  const now = Date.now()
  const timestamps = Array.from({ length: 24 }, (_, index) => now - (23 - index) * 60_000)
  const point = (timestamp: number, value: number): [number, number] => [timestamp, value]

  return {
    line: [
      {
        name: 'Requests',
        color: ChartPalette.semantic('neutral', isDark),
        data: timestamps.map((timestamp, index) => point(timestamp, 120 + Math.sin(index / 3) * 42 + index * 3)),
      },
      {
        name: 'Errors',
        color: ChartPalette.semantic('attention', isDark),
        data: timestamps.map((timestamp, index) => point(timestamp, 8 + Math.cos(index / 2) * 4)),
      },
    ],
    bar: [
      {
        name: 'Logs',
        color: ChartPalette.categorical(0, isDark),
        data: timestamps.map((timestamp, index) => point(timestamp, 60 + (index % 5) * 11)),
      },
      {
        name: 'Spans',
        color: ChartPalette.categorical(1, isDark),
        data: timestamps.map((timestamp, index) => point(timestamp, 30 + (index % 4) * 8)),
      },
    ],
  }
}
