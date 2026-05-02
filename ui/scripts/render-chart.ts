/**
 * Renders a shared Strada UI ECharts option to SVG, then PNG.
 * The SVG → PNG step uses resvg's wasm build so the same flow can run in Cloudflare Workers.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Resvg, initWasm } from '@resvg/resvg-wasm'
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
import { SVGRenderer } from 'echarts/renderers'

import { getDefaultChartColors } from '../src/lib/chart-palette.ts'
import { buildTimeseriesChartOption, prepareChartOptions, type TimeseriesData } from '../src/lib/echarts-options.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const repoRoot = path.resolve(__dirname, '../..')
const outputPath = path.join(repoRoot, 'tmp/strada-ui-chart-example.png')
const svgOutputPath = path.join(repoRoot, 'tmp/strada-ui-chart-example.svg')
const resvgWasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm')

await initWasm(await readFile(resvgWasmPath))

echarts.use([
  LineChart,
  BarChart,
  AxisPointerComponent,
  BrushComponent,
  GridComponent,
  ToolboxComponent,
  TooltipComponent,
  SVGRenderer,
  AriaComponent,
])

const width = 960
const height = 420
const isDarkMode = true

console.log(`Creating ${width}x${height} SVG chart`)
const chart = echarts.init(null, { color: getDefaultChartColors(isDarkMode) }, {
  renderer: 'svg',
  ssr: true,
  devicePixelRatio: 2,
  width,
  height,
})

try {
  console.log('Building shared timeseries chart option')
  const options = buildTimeseriesChartOption({
    echarts,
    data: buildExampleData(),
    gradient: true,
    isDarkMode,
    colorMode: 'static',
    ariaEnabled: false,
    xAxisName: 'Time',
    yAxisName: 'Requests',
    tooltipValueFormat: (value) => `${value.toFixed(0)} req/s`,
    ariaDescription: 'Example Strada requests and errors timeseries chart rendered in Node.js',
  })
  options.backgroundColor = 'transparent'

  console.log('Rendering ECharts option to SVG')
  chart.setOption(prepareChartOptions(options), { notMerge: true, lazyUpdate: false })
  const svg = chart.renderToSVGString()

  console.log(`Writing ${svgOutputPath}`)
  await mkdir(path.dirname(svgOutputPath), { recursive: true })
  await writeFile(svgOutputPath, svg)

  console.log('Rendering SVG to PNG with resvg wasm')
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } })

  console.log(`Writing ${outputPath}`)
  await writeFile(outputPath, png.render().asPng())

  console.log(`Rendered chart image: ${outputPath}`)
} finally {
  chart.dispose()
}

function buildExampleData(): TimeseriesData[] {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const timestamps = Array.from({ length: 36 }, (_, index) => start + index * 60_000)
  const point = (timestamp: number, value: number): [number, number] => [timestamp, value]

  return [
    {
      name: 'Requests',
      color: 'blue',
      data: timestamps.map((timestamp, index) => point(timestamp, 120 + Math.sin(index / 3) * 42 + index * 2.5)),
    },
    {
      name: 'Errors',
      color: 'red',
      data: timestamps.map((timestamp, index) => point(timestamp, 8 + Math.cos(index / 2) * 4)),
    },
  ]
}
