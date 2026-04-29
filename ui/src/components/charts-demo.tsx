/**
 * Client-side chart demo page for the @strada.sh/ui demo app. Registers the
 * ECharts modules needed by the copied chart components and renders examples.
 */
'use client'

import { BarChart, LineChart, PieChart } from 'echarts/charts'
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
import type { ReactNode } from 'react'
import { useState } from 'react'

import { Chart, ChartLegend, TimeseriesChart } from './charts.tsx'
import type { StradaChartOption } from './charts.tsx'
import { ThemeToggle } from './traces/theme-toggle.tsx'
import { ChartPalette } from '../lib/chart-palette.ts'
import { useIsDark } from '../lib/utils.ts'

echarts.use([
  LineChart,
  BarChart,
  PieChart,
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
  const [selectedRange, setSelectedRange] = useState<{ from?: number; to?: number }>({})
  const data = buildChartDemoData(isDark)
  const selectedRangeText = selectedRange.from && selectedRange.to
    ? `${new Date(selectedRange.from).toLocaleTimeString()} – ${new Date(selectedRange.to).toLocaleTimeString()}`
    : 'Drag across the chart to select a time range'

  return (
    <div className="flex w-full max-w-6xl flex-col gap-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Charts</h1>
          <p className="text-sm text-muted-foreground">
            All chart examples from the Kumo docs, adapted to Strada theme tokens.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <ChartExample title="Basic line chart" description="Multiple series over time with default axes.">
        <SmallLegend data={data.basicLine} />
        <TimeseriesChart
          echarts={echarts}
          data={data.basicLine}
          isDarkMode={isDark}
          xAxisName="Time (UTC)"
          yAxisName="Count"
        />
      </ChartExample>

      <ChartExample title="Custom axis labels" description="Formats x-axis time labels, y-axis numbers, and tooltip values.">
        <TimeseriesChart
          echarts={echarts}
          data={data.customAxis}
          isDarkMode={isDark}
          xAxisName="Time (UTC)"
          yAxisName="Requests"
          xAxisTickFormat={formatTime}
          yAxisTickFormat={formatCompact}
          tooltipValueFormat={(value) => `${(value / 1000).toFixed(1)}k requests`}
        />
      </ChartExample>

      <ChartExample title="Gradient fill" description="Line chart with a subtle area fill below each series.">
        <SmallLegend data={data.gradient} />
        <TimeseriesChart
          echarts={echarts}
          data={data.gradient}
          gradient
          isDarkMode={isDark}
          xAxisName="Time (UTC)"
          yAxisName="Count"
        />
      </ChartExample>

      <ChartExample title="Incomplete data" description="Dashed trailing segment marks a period that may still be collecting.">
        <TimeseriesChart
          echarts={echarts}
          data={data.incomplete.series}
          incomplete={{ after: data.incomplete.after }}
          isDarkMode={isDark}
          xAxisName="Time (UTC)"
          yAxisName="Mbps"
        />
      </ChartExample>

      <ChartExample title="Time range selection" description={selectedRangeText}>
        <TimeseriesChart
          echarts={echarts}
          data={data.rangeSelection.series}
          isDarkMode={isDark}
          xAxisName="Time (UTC)"
          yAxisName="%"
          onTimeRangeChange={(from, to) => setSelectedRange({ from, to })}
        />
      </ChartExample>

      <ChartExample title="Bar chart" description="Timeseries data rendered as stacked bars.">
        <LargeLegend data={data.bar} unit="events" />
        <TimeseriesChart
          echarts={echarts}
          data={data.bar}
          height={300}
          isDarkMode={isDark}
          type="bar"
          xAxisName="Time (UTC)"
          yAxisName="Count"
          tooltipValueFormat={(value) => value.toFixed(2)}
        />
      </ChartExample>

      <ChartExample title="Loading state" description="Animated sine-wave skeleton shown while data is being fetched.">
        <TimeseriesChart
          echarts={echarts}
          data={[]}
          isDarkMode={isDark}
          xAxisName="Time (UTC)"
          yAxisName="Count"
          loading
        />
      </ChartExample>

      <ChartExample title="Custom pie chart" description="Low-level Chart wrapper with a pie ECharts option.">
        <Chart echarts={echarts} height={320} isDarkMode={isDark} options={data.pie} />
      </ChartExample>

      <ChartExample title="Custom tooltip with HTML" description="Uses dangerousHtmlFormatter and encodeHTML for trusted custom markup.">
        <Chart echarts={echarts} height={320} isDarkMode={isDark} options={data.customTooltip} />
      </ChartExample>

      <ChartExample title="Large legend items" description="Active and inactive states for dashboard summary legends.">
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">Active state</h2>
          <div className="flex flex-wrap gap-4 divide-x divide-border">
            <ChartLegend.LargeItem name="Requests" color={ChartPalette.semantic('neutral', isDark)} value="1,234" unit="req/s" />
            <ChartLegend.LargeItem name="Storage" color={ChartPalette.semantic('attention', isDark)} value="56" unit="GB" />
            <ChartLegend.LargeItem name="Warnings" color={ChartPalette.semantic('warning', isDark)} value="128" />
          </div>
          <h2 className="text-sm font-medium">Inactive state</h2>
          <div className="flex flex-wrap gap-4 divide-x divide-border">
            <ChartLegend.LargeItem inactive name="Requests" color={ChartPalette.semantic('neutral', isDark)} value="1,234" unit="req/s" />
            <ChartLegend.LargeItem inactive name="Storage" color={ChartPalette.semantic('attention', isDark)} value="56" unit="GB" />
            <ChartLegend.LargeItem inactive name="Warnings" color={ChartPalette.semantic('warning', isDark)} value="128" />
          </div>
        </div>
      </ChartExample>

      <ChartExample title="Small legend items" description="Compact active and inactive legend rows.">
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">Active state</h2>
          <div className="flex flex-wrap gap-4">
            <ChartLegend.SmallItem name="Requests" color={ChartPalette.semantic('neutral', isDark)} value="1,234" />
            <ChartLegend.SmallItem name="Storage" color={ChartPalette.semantic('attention', isDark)} value="56" />
            <ChartLegend.SmallItem name="Warnings" color={ChartPalette.semantic('warning', isDark)} value="128" />
          </div>
          <h2 className="text-sm font-medium">Inactive state</h2>
          <div className="flex flex-wrap gap-4">
            <ChartLegend.SmallItem inactive name="Requests" color={ChartPalette.semantic('neutral', isDark)} value="1,234" />
            <ChartLegend.SmallItem inactive name="Storage" color={ChartPalette.semantic('attention', isDark)} value="56" />
            <ChartLegend.SmallItem inactive name="Warnings" color={ChartPalette.semantic('warning', isDark)} value="128" />
          </div>
        </div>
      </ChartExample>
    </div>
  )
}

function buildChartDemoData(isDark: boolean) {
  const now = Date.now()
  const timestamps = Array.from({ length: 50 }, (_, index) => now - (49 - index) * 60_000)
  const point = (timestamp: number, value: number): [number, number] => [timestamp, value]
  const buildSeriesData = ({ seed, count, stepMs, scale }: { seed: number; count: number; stepMs: number; scale: number }) => {
    const start = now - (count - 1) * stepMs
    return Array.from({ length: count }, (_, index) => {
      const wave = Math.sin((index + seed) / 5) * 28
      const drift = index * 1.5
      return point(start + index * stepMs, Math.max(0, 80 * scale + wave * scale + drift * scale))
    })
  }

  const basicLine = [
    {
      name: 'Requests',
      color: ChartPalette.semantic('neutral', isDark),
      data: buildSeriesData({ seed: 0, count: 50, stepMs: 60_000, scale: 1 }),
    },
    {
      name: 'Errors',
      color: ChartPalette.semantic('attention', isDark),
      data: buildSeriesData({ seed: 1, count: 50, stepMs: 60_000, scale: 0.3 }),
    },
  ]

  const incompleteSeries = [
    {
      name: 'Bandwidth',
      color: ChartPalette.categorical(0, isDark),
      data: buildSeriesData({ seed: 0, count: 50, stepMs: 60_000, scale: 1 }),
    },
  ]

  return {
    basicLine,
    customAxis: [
      { name: 'Requests', color: ChartPalette.semantic('neutral', isDark), data: buildSeriesData({ seed: 0, count: 50, stepMs: 60_000, scale: 1000 }) },
    ],
    gradient: basicLine,
    incomplete: {
      series: incompleteSeries,
      after: incompleteSeries[0].data.at(-5)?.[0],
    },
    rangeSelection: {
      series: [{ name: 'CPU Usage', color: ChartPalette.categorical(0, isDark), data: buildSeriesData({ seed: 0, count: 50, stepMs: 60_000, scale: 1 }) }],
    },
    bar: [
      {
        name: 'Requests where age > 10',
        color: ChartPalette.semantic('neutral', isDark),
        data: timestamps.slice(-20).map((timestamp, index) => point(timestamp, 60 + (index % 5) * 11)),
      },
      {
        name: 'Errors',
        color: ChartPalette.semantic('attention', isDark),
        data: timestamps.slice(-20).map((timestamp, index) => point(timestamp, 20 + Math.cos(index / 2) * 8)),
      },
    ],
    pie: {
      tooltip: { show: true },
      series: [{ type: 'pie', data: pieData }],
    } satisfies StradaChartOption,
    customTooltip: {
      tooltip: {
        trigger: 'item',
        dangerousHtmlFormatter: (params: any) => {
          const safeName = echarts.format.encodeHTML(params.name)
          const safeValue = echarts.format.encodeHTML(String(params.value))
          const safePercent = echarts.format.encodeHTML(String(Math.round(params.percent)))
          return `<div style="padding:8px;"><div style="font-weight:600;margin-bottom:4px;">${safeName}</div><div>Value: <strong>${safeValue}</strong></div><div style="font-size:12px;opacity:0.7;margin-top:4px;">${safePercent}% of total</div></div>`
        },
      },
      series: [{ type: 'pie', data: [...pieData.slice(0, 2), { value: 150, name: '<img src=x onerror=alert(\'XSS\')>' }, ...pieData.slice(2)] }],
    } satisfies StradaChartOption,
  }
}

const pieData = [
  { value: 101, name: 'Series A' },
  { value: 202, name: 'Series B' },
  { value: 303, name: 'Series C' },
  { value: 404, name: 'Series D' },
  { value: 505, name: 'Series E' },
]

function ChartExample({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

function SmallLegend({ data }: { data: Array<{ name: string; color: string; data: [number, number][] }> }) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-border pb-3">
      {data.map((series) => (
        <ChartLegend.SmallItem key={series.name} color={series.color} name={series.name} value={series.data.at(-1)?.[1].toFixed(0) ?? '0'} />
      ))}
    </div>
  )
}

function LargeLegend({ data, unit }: { data: Array<{ name: string; color: string; data: [number, number][] }>; unit?: string }) {
  return (
    <div className="flex flex-wrap gap-4 border-b border-border pb-3">
      {data.map((series) => (
        <ChartLegend.LargeItem key={series.name} color={series.color} name={series.name} value={series.data.at(-1)?.[1].toFixed(0) ?? '0'} unit={unit} />
      ))}
    </div>
  )
}

function formatTime(value: number) {
  const date = new Date(value)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function formatCompact(value: number) {
  if (value >= 1000) return `${value / 1000}k`
  return value.toString()
}
