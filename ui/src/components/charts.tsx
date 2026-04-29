/**
 * Reusable ECharts-based chart components copied from Cloudflare Kumo's
 * MIT-licensed chart package and adapted to Strada's shadcn/Tailwind tokens.
 * Portions Copyright (c) 2026 Cloudflare, Inc. SPDX-License-Identifier: MIT.
 * Original sources:
 * - https://github.com/cloudflare/kumo/blob/main/packages/kumo/src/components/chart/EChart.tsx
 * - https://github.com/cloudflare/kumo/blob/main/packages/kumo/src/components/chart/TimeseriesChart.tsx
 * - https://github.com/cloudflare/kumo/blob/main/packages/kumo/src/components/chart/Legend.tsx
 */
'use client'

import type { EChartsOption, SetOptionOpts, TooltipComponentOption } from 'echarts'
import type * as echarts from 'echarts/core'
import type { Ref } from 'react'
import { useEffect, useMemo, useRef } from 'react'

import { CHART_DARK_COLORS, CHART_LIGHT_COLORS } from '../lib/chart-palette.ts'
import { cn } from '../lib/utils.ts'

type EChartsMouseEventParams = {
  componentType: string
  seriesType?: string
  seriesIndex?: number
  seriesName?: string
  name?: string
  dataIndex?: number
  data?: any
  dataType?: string
  value?: number | any[]
  color?: string
}

export type SafeTooltipOption = Omit<TooltipComponentOption, 'formatter'> & {
  dangerousHtmlFormatter?: TooltipComponentOption['formatter']
}

export type StradaChartOption = {
  [K in keyof EChartsOption]: K extends 'tooltip'
    ? SafeTooltipOption | SafeTooltipOption[] | undefined
    : EChartsOption[K]
}

export interface ChartEvents {
  [event: string]: ((params: any) => void) | undefined
  click: (params: EChartsMouseEventParams) => void
  dblclick: (params: EChartsMouseEventParams) => void
  mousedown: (params: EChartsMouseEventParams) => void
  mousemove: (params: EChartsMouseEventParams) => void
  mouseup: (params: EChartsMouseEventParams) => void
  mouseover: (params: EChartsMouseEventParams) => void
  mouseout: (params: EChartsMouseEventParams) => void
  globalout: (params: any) => void
  contextmenu: (params: any) => void
  legendselectchanged: (params: { name: string; selected: Record<string, boolean> }) => void
  legendselected: (params: any) => void
  legendunselected: (params: any) => void
  legendscroll: (params: any) => void
  datazoom: (params: any) => void
  datarangeselected: (params: any) => void
  timelinechanged: (params: any) => void
  timelineplaychanged: (params: any) => void
  restore: (params: any) => void
  dataviewchanged: (params: any) => void
  magictypechanged: (params: any) => void
  pieselectchanged: (params: any) => void
  pieselected: (params: any) => void
  pieunselected: (params: any) => void
  mapselectchanged: (params: any) => void
  mapselected: (params: any) => void
  mapunselected: (params: any) => void
  geoselectchanged: (params: any) => void
  geoselected: (params: any) => void
  geounselected: (params: any) => void
  axisareaselected: (params: any) => void
  brush: (params: any) => void
  brushselected: (params: any) => void
  brushend: (params: { areas: Array<{ coordRange: [number, number]; brushType?: string; panelId?: string; range?: any }> }) => void
}

export interface ChartProps {
  echarts: typeof echarts
  options: StradaChartOption
  ref?: Ref<echarts.ECharts>
  optionUpdateBehavior?: SetOptionOpts
  className?: string
  isDarkMode?: boolean
  height?: number
  onEvents?: Partial<ChartEvents>
}

const transformTooltip = (tooltip: SafeTooltipOption) => {
  const { dangerousHtmlFormatter, ...rest } = tooltip
  return { ...rest, formatter: dangerousHtmlFormatter }
}

const prepareChartOptions = (options: StradaChartOption): EChartsOption => {
  const defaults = {
    animation: options.animation ?? false,
  }

  if (!options.tooltip) return { ...defaults, ...options }
  return {
    ...defaults,
    ...options,
    tooltip: Array.isArray(options.tooltip)
      ? options.tooltip.map(transformTooltip)
      : transformTooltip(options.tooltip),
  }
}

export function Chart({
  echarts,
  options,
  ref,
  optionUpdateBehavior,
  className,
  isDarkMode,
  height = 350,
  onEvents,
}: ChartProps) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const handlersRef = useRef<Partial<ChartEvents>>({})
  const wrappersRef = useRef<Record<string, (params: any) => void>>({})
  const boundEventsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!elRef.current) return

    const chart = echarts.init(
      elRef.current,
      isDarkMode ? 'dark' : { color: isDarkMode ? CHART_DARK_COLORS : CHART_LIGHT_COLORS },
    )
    chartRef.current = chart

    if (typeof ref === 'function') ref(chart)
    else if (ref) ref.current = chart

    return () => {
      for (const event of boundEventsRef.current) {
        const wrapper = wrappersRef.current[event]
        if (wrapper) chart.off(event, wrapper)
      }
      boundEventsRef.current.clear()
      if (typeof ref === 'function') ref(null)
      else if (ref) ref.current = null
      chartRef.current = null
      chart.dispose()
    }
  }, [echarts, isDarkMode, ref])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setOption(prepareChartOptions(options), { notMerge: false, lazyUpdate: true, ...optionUpdateBehavior })
  }, [optionUpdateBehavior, options])

  useEffect(() => {
    handlersRef.current = onEvents ?? {}
  }, [onEvents])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const nextBound = new Set<string>()

    for (const [event, handler] of Object.entries(onEvents ?? {})) {
      if (typeof handler !== 'function') continue
      nextBound.add(event)

      if (!wrappersRef.current[event]) {
        wrappersRef.current[event] = (params: any) => {
          const handler = handlersRef.current[event]
          if (!handler) return
          handler(params)
        }
      }

      if (!boundEventsRef.current.has(event)) chart.on(event, wrappersRef.current[event])
    }

    for (const event of boundEventsRef.current) {
      if (nextBound.has(event)) continue
      const wrapper = wrappersRef.current[event]
      if (wrapper) chart.off(event, wrapper)
    }

    boundEventsRef.current = nextBound
  }, [onEvents])

  useEffect(() => {
    const chart = chartRef.current
    const el = elRef.current
    if (!chart || !el) return

    let isInitial = true
    const observer = new ResizeObserver(() => {
      if (isInitial) {
        isInitial = false
        return
      }
      chart.resize()
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={elRef}
      className={cn('w-full', className)}
      style={{ height }}
      tabIndex={options.aria?.enabled ? 0 : undefined}
      role={options.aria?.enabled ? 'img' : undefined}
    />
  )
}

export interface TimeseriesData {
  name: string
  data: [number, number][]
  color: string
}

export interface TimeseriesChartProps {
  echarts: typeof echarts
  type?: 'line' | 'bar'
  data: TimeseriesData[]
  xAxisName?: string
  xAxisTickCount?: number
  xAxisTickFormat?: (value: number) => string
  yAxisTickFormat?: (value: number) => string
  yAxisTickLabelFormat?: (value: number) => string
  yAxisName?: string
  yAxisTickCount?: number
  tooltipValueFormat?: (value: number) => string
  incomplete?: { before?: number; after?: number }
  height?: number
  onTimeRangeChange?: (from: number, to: number) => void
  isDarkMode?: boolean
  gradient?: boolean
  loading?: boolean
  ariaDescription?: string
}

export function TimeseriesChart({
  echarts,
  type = 'line',
  data,
  xAxisName,
  xAxisTickCount,
  xAxisTickFormat,
  yAxisTickFormat,
  yAxisTickLabelFormat,
  yAxisName,
  yAxisTickCount,
  tooltipValueFormat,
  onTimeRangeChange,
  height = 350,
  incomplete,
  isDarkMode,
  gradient,
  loading,
  ariaDescription,
}: TimeseriesChartProps) {
  const chartRef = useRef<echarts.ECharts | null>(null)
  const incompleteBefore = incomplete?.before
  const incompleteAfter = incomplete?.after

  const options = useMemo(() => {
    const series: any[] = []
    const seriesType = type === 'bar'
      ? ({ type: 'bar', stack: 'total' } as const)
      : ({ type: 'line', showSymbol: false, smooth: false } as const)

    for (const item of data) {
      const incompleteBeforePoints = incompleteBefore && type === 'line' ? item.data.filter((point) => point[0] <= incompleteBefore) : []
      const incompleteAfterPoints = incompleteAfter && type === 'line' ? item.data.filter((point) => point[0] >= incompleteAfter) : []
      const completePoints = incompleteBeforePoints.length > 0 || incompleteAfterPoints.length > 0
        ? item.data.slice(
            Math.max(0, incompleteBeforePoints.length - 1),
            Math.max(0, item.data.length - incompleteAfterPoints.length + 1),
          )
        : item.data

      const areaStyle = gradient && type === 'line'
        ? {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: colorWithOpacity(item.color, 0.4) },
              { offset: 1, color: colorWithOpacity(item.color, 0) },
            ]),
          }
        : undefined

      series.push({
        data: completePoints,
        color: item.color,
        name: item.name,
        emphasis: { focus: 'series' },
        ...(areaStyle ? { areaStyle } : {}),
        ...seriesType,
      })

      const incompleteSeriesConfig = {
        color: item.color,
        name: item.name,
        type: 'line' as const,
        lineStyle: { type: 'dashed' as const },
        showSymbol: false,
        smooth: false,
        emphasis: { focus: 'series' as const },
      }

      if (incompleteBeforePoints.length > 0) series.push({ ...incompleteSeriesConfig, data: incompleteBeforePoints })
      if (incompleteAfterPoints.length > 0) series.push({ ...incompleteSeriesConfig, data: incompleteAfterPoints })
    }

    return {
      aria: { enabled: true, ...(ariaDescription && { label: { description: ariaDescription } }) },
      brush: {
        xAxisIndex: 'all' as const,
        brushType: 'lineX' as const,
        brushMode: 'single' as const,
        outOfBrush: { colorAlpha: 0.3 },
        brushStyle: {
          borderWidth: 1,
          color: 'color-mix(in srgb, var(--primary) 20%, transparent)',
          borderColor: 'color-mix(in srgb, var(--primary) 60%, transparent)',
        },
      },
      tooltip: {
        trigger: 'axis' as const,
        appendTo: 'body',
        axisPointer: { type: 'shadow' as const },
        backgroundColor: 'var(--popover)',
        borderColor: 'var(--border)',
        textStyle: { color: 'var(--popover-foreground)' },
        dangerousHtmlFormatter: (params) => {
          const items = Array.isArray(params) ? params : [params]
          const seenNames = new Set<string>()
          const filteredParams = items.filter((param) => {
            const name = String(param.seriesName)
            if (seenNames.has(name)) return false
            seenNames.add(name)
            return true
          })
          const first = filteredParams[0]
          const ts = Array.isArray(first?.value) ? first.value[0] : first?.axisValue
          const header = ts != null
            ? `<div style="font-weight:600;margin-bottom:4px;">${echarts.format.encodeHTML(formatTimestamp(ts))}</div>`
            : ''
          const rows = filteredParams.map((param) => {
            const value = Array.isArray(param?.value) ? Number(param.value[1]) : Number(param?.value)
            const formatFn = tooltipValueFormat ?? yAxisTickLabelFormat
            const formattedValue = formatFn ? formatFn(value) : String(value)
            return `${param.marker} ${echarts.format.encodeHTML(String(param.seriesName))}: <strong>${echarts.format.encodeHTML(formattedValue)}</strong>`
          }).join('<br/>')

          return `${header}${rows}`
        },
      },
      backgroundColor: 'transparent',
      toolbox: { show: false },
      xAxis: {
        name: xAxisName,
        nameLocation: 'middle' as const,
        nameGap: 30,
        type: 'time' as const,
        splitLine: { show: false },
        axisLine: { show: false },
        splitNumber: xAxisTickCount ?? 5,
        axisLabel: xAxisTickFormat ? { formatter: (value: number) => xAxisTickFormat(value) } : undefined,
      },
      yAxis: {
        name: yAxisName,
        nameLocation: 'middle' as const,
        nameGap: 40,
        type: 'value' as const,
        axisTick: { show: true },
        axisLabel: {
          margin: 15,
          ...(yAxisTickFormat && { formatter: (value: number) => yAxisTickFormat(value) }),
        },
        splitLine: { show: true, lineStyle: { type: 'dashed' as const, width: 1 } },
        splitNumber: yAxisTickCount,
      },
      grid: { left: yAxisName ? 30 : 24, right: 24, top: 24, bottom: xAxisName ? 30 : 24 },
      series,
    } satisfies StradaChartOption
  }, [
    ariaDescription,
    data,
    echarts,
    gradient,
    incompleteAfter,
    incompleteBefore,
    tooltipValueFormat,
    type,
    xAxisName,
    xAxisTickCount,
    xAxisTickFormat,
    yAxisName,
    yAxisTickCount,
    yAxisTickFormat,
    yAxisTickLabelFormat,
  ])

  const events = useMemo<Partial<ChartEvents>>(() => {
    if (!onTimeRangeChange) return {}
    return {
      brushend: (params) => {
        const range = params.areas[0].coordRange
        onTimeRangeChange(range[0], range[1])
        chartRef.current?.dispatchAction({ type: 'brush', areas: [] })
      },
    }
  }, [onTimeRangeChange])

  const hasTimeRangeCallback = !!onTimeRangeChange
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !hasTimeRangeCallback) return

    chart.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: { brushType: 'lineX' as const, brushMode: 'single' as const },
    })

    return () => {
      chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: false } })
    }
  }, [hasTimeRangeCallback, loading])

  return (
    <div className="relative w-full" style={{ height }}>
      {loading && <ChartWaveLoader height={height} isDarkMode={isDarkMode} />}
      {!loading && <Chart echarts={echarts} ref={chartRef} options={options} height={height} isDarkMode={isDarkMode} onEvents={events} />}
    </div>
  )
}

type LegendItemProps = {
  name: string
  color: string
  value: string
  unit?: string
  inactive?: boolean
}

const LargeItem = function LargeItem({ color, value, name, unit, inactive }: LegendItemProps) {
  return (
    <div className="inline-flex min-w-42 flex-col gap-2 py-2">
      <div className="flex items-center gap-2">
        <span className={cn('inline-block size-2 rounded-full', inactive && 'opacity-50')} style={{ backgroundColor: color }} />
        <span className={cn('text-xs', inactive && 'opacity-50')}>{name}</span>
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className={cn('text-lg font-medium leading-none', inactive && 'opacity-50')}>{value}</span>
        {unit && <span className={cn('text-xs leading-none text-muted-foreground', inactive && 'opacity-50')}>{unit}</span>}
      </div>
    </div>
  )
}

const SmallItem = function SmallItem({ color, value, name, inactive }: LegendItemProps) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className={cn('inline-block size-2 rounded-full', inactive && 'opacity-50')} style={{ backgroundColor: color }} />
      <span className={cn('text-xs', inactive && 'opacity-50')}>{name}</span>
      <span className={cn('text-xs font-medium', inactive && 'opacity-50')}>{value}</span>
    </div>
  )
}

export const ChartLegend = {
  SmallItem,
  LargeItem,
}

function ChartWaveLoader({ height, isDarkMode }: { height: number; isDarkMode?: boolean }) {
  const mid = height / 2
  const amp = Math.min(height * 0.12, 28)
  const period = 400
  const steps = 120
  const points: string[] = []

  for (let i = 0; i <= steps; i++) {
    const x = -period + (i / steps) * period * 3
    const y = mid + Math.sin((i / steps) * 2 * Math.PI * 3) * amp
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
  }

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden" style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${period} ${height}`} preserveAspectRatio="none" className="w-full animate-pulse">
        <path
          d={points.join(' ')}
          fill="none"
          stroke={isDarkMode ? 'var(--muted-foreground)' : 'var(--border)'}
          strokeWidth="2"
          style={{ animation: 'strada-chart-wave 2.4s linear infinite', transformOrigin: '0 0' }}
        />
      </svg>
    </div>
  )
}

function colorWithOpacity(color: string, alpha: number): string {
  const opacity = Math.max(0, Math.min(1, alpha))
  const rgbMatch = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (rgbMatch) return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${opacity})`

  let hex = color.replace(/^#/, '')
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  if (hex.length === 8) hex = hex.slice(0, 6)

  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function formatTimestamp(ts: number | string | Date): string {
  const date = new Date(ts)
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
