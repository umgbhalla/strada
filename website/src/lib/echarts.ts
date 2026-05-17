// Browser echarts bundle. Registers chart types, components, and the Strada
// theme once. Imported via #echarts in package.json imports map (browser
// condition only).

import * as ec from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

ec.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

ec.registerTheme('strada', {
  color: [
    '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
    '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc',
  ],
})

export const echarts = ec
export const THEME = 'strada'
