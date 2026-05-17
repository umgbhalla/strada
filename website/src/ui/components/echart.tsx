// Generic ECharts component. Renders any EChartsOption using the Strada theme.
// Echarts is imported via #echarts which resolves to a server stub outside the
// browser (see package.json imports). No lazy loading needed.

'use client'

import { useEffect, useRef } from 'react'
import type { EChartsOption } from 'echarts'
import { echarts, THEME } from '#echarts'

export type EChartProps = {
  option: EChartsOption
  height?: number | string
  className?: string
}

export function EChart({ option, height = 200, className }: EChartProps) {
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null)
  const elRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = elRef.current
    if (!el || !echarts) return

    const chart = echarts.init(el, THEME)
    chart.setOption(option)
    chartRef.current = chart

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(el)

    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [option])

  return <div ref={elRef} className={className} style={{ height, width: '100%' }} />
}
