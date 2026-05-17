// Browser echarts bundle. Registers chart types, components, and the Strada
// theme once. Imported via #echarts in package.json imports map (browser
// condition only).

import * as ec from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { HEX_COLORS } from './chart-colors.ts'

ec.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

ec.registerTheme('strada', {
  color: [...HEX_COLORS],
})

export const echarts = ec
export const THEME = 'strada'
