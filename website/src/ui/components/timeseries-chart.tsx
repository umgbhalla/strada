// Timeseries line chart built on EChart. Accepts named series with [timestamp, value]
// data points. Supports gradient fill and echarts legend.

'use client'

import { use } from 'react'
import type { EChartsOption } from 'echarts'
import { EChart } from '@ui/components/echart.tsx'

export type TimeseriesItem = {
  name: string
  data: [number, number][]
}

export type TimeseriesChartProps = {
  data: TimeseriesItem[] | Promise<TimeseriesItem[]>
  height?: number | string
  gradient?: boolean
  legend?: boolean
  className?: string
}

function resolveData<T>(data: T | Promise<T>): T {
  if (data && typeof data === 'object' && 'then' in data) {
    return use(data as Promise<T>)
  }
  return data
}

export function TimeseriesChart({
  data: rawData,
  height = 200,
  gradient,
  legend,
  className,
}: TimeseriesChartProps) {
  const data = resolveData(rawData)

  const series = data.map((item) => ({
    type: 'line' as const,
    name: item.name,
    data: item.data,
    showSymbol: false,
    smooth: false,
    emphasis: { focus: 'series' as const },
    ...(gradient ? { areaStyle: { opacity: 0.3 } } : {}),
  }))

  const option: EChartsOption = {
    animation: false,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: legend ? { show: true, bottom: 0, left: 'center', type: 'scroll' } : { show: false },
    xAxis: { type: 'time', splitLine: { show: false }, axisLine: { show: false }, splitNumber: 5 },
    yAxis: { type: 'value', splitLine: { show: true, lineStyle: { type: 'dashed', width: 1 } }, splitNumber: 3 },
    grid: { left: 24, right: 24, top: 12, bottom: legend ? 40 : 24 },
    series,
  }

  return <EChart option={option} height={height} className={className} />
}
