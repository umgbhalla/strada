// MDX-powered errors dashboard.
//
// Same visual output as the hardcoded errors-dashboard.tsx, but rendered
// via safe-mdx with demo data in scope. This validates the MDX rendering
// pipeline before wiring up live SQL queries.
//
// All scope values must be RSC-serializable (plain objects, arrays, strings,
// numbers, promises). No functions, class instances, or React components.

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import dedent from 'string-dedent'

import { renderDashboard } from '../lib/mdx-dashboard.tsx'

// ── Demo data ────────────────────────────────────────────────────

const demoMonthDate = (startMonthIndex: number, offset: number) =>
  new Date(Date.UTC(2025, startMonthIndex + offset, 1))
    .toISOString()
    .slice(0, 10)

const errorsByServiceData = (() => {
  const base = Date.UTC(2025, 4, 1)
  const day = 86_400_000
  const points = 30
  return [
    {
      name: 'api-service',
      data: Array.from({ length: points }, (_, i): [number, number] => [
        base + i * day,
        120 + Math.round(Math.sin(i * 0.4) * 40 + ((i * 17) % 30)),
      ]),
    },
    {
      name: 'web-frontend',
      data: Array.from({ length: points }, (_, i): [number, number] => [
        base + i * day,
        80 + Math.round(Math.cos(i * 0.3) * 25 + ((i * 13) % 20)),
      ]),
    },
    {
      name: 'worker',
      data: Array.from({ length: points }, (_, i): [number, number] => [
        base + i * day,
        25 + Math.round(Math.sin(i * 0.6) * 15 + ((i * 7) % 12)),
      ]),
    },
  ]
})()

const errorSourcesData = [
  { label: 'TypeError', value: 2410 },
  { label: 'HttpError', value: 1735 },
  { label: 'ReferenceError', value: 1084 },
  { label: 'TimeoutError', value: 722 },
  { label: 'SyntaxError', value: 433 },
  { label: 'ChunkLoadError', value: 312 },
  { label: 'AbortError', value: 245 },
  { label: 'RangeError', value: 198 },
  { label: 'ConnectionError', value: 156 },
  { label: 'EvalError', value: 98 },
  { label: 'URIError', value: 52 },
  { label: 'InternalError', value: 31 },
]

const handledData = [
  { label: 'Unhandled', value: 3842 },
  { label: 'Handled', value: 1256 },
  { label: 'Resolved', value: 649 },
]

const bySeverityData = [
  { label: 'Fatal', value: 245 },
  { label: 'Error', value: 6180 },
  { label: 'Warning', value: 1520 },
  { label: 'Info', value: 313 },
]

const byEnvironmentData = [
  { label: 'Production', value: 5940 },
  { label: 'Staging', value: 1814 },
  { label: 'Development', value: 504 },
]

const servicesData = [
  { label: 'api-service', value: 4520 },
  { label: 'web-frontend', value: 2847 },
  { label: 'worker', value: 891 },
]

const browserErrorsChartData = Array.from({ length: 18 }, (_, index) => ({
  date: demoMonthDate(0, index),
  value: 45 + ((index * 19) % 35),
}))

// ── MDX template ─────────────────────────────────────────────────

const dashboardMdx = dedent`
  <Grid columns={12} rows={6} rowHeight={200} cellPadding={34} lines>
    <Grid.Item columnSpan={8} rowSpan={2}>
      <SparklinePanel
        title="Total Errors"
        value="8,258"
        badge="+6.4%"
        badgeColor="red"
        actionLabel="Report"
        data={errorsByServiceData}
        gradient
      />
    </Grid.Item>

    <Grid.Item columnSpan={4} rowSpan={1}>
      <SparkAreaPanel
        title="Browser Errors"
        value="2,847"
        badge="Last 30 days"
        actionLabel="Details"
        data={browserErrorsChartData}
        usageValue="/checkout"
        usageLabel="842 errors (top page)"
      />
    </Grid.Item>

    <Grid.Item columnSpan={4} rowSpan={2}>
      <DonutPanel
        title="Error Sources"
        badge="+6.4%"
        badgeColor="red"
        description="vs last week"
        data={errorSourcesData}

      />
    </Grid.Item>

    <Grid.Item columnSpan={4} rowSpan={2}>
      <DonutPanel
        title="Handled vs Unhandled"
        badge="+8.2%"
        badgeColor="red"
        description="unhandled rate"
        data={handledData}

      />
    </Grid.Item>

    <Grid.Item columnSpan={4} rowSpan={2}>
      <DonutPanel
        title="By Severity"
        badge="+5.8%"
        badgeColor="red"
        description="vs last week"
        data={bySeverityData}

      />
    </Grid.Item>

    <Grid.Item columnSpan={4} rowSpan={2}>
      <DonutPanel
        title="By Environment"
        badge="+4.2%"
        badgeColor="red"
        description="production errors"
        data={byEnvironmentData}

      />
    </Grid.Item>

    <Grid.Item columnSpan={4} rowSpan={2}>
      <DonutPanel
        title="By Service"
        badge="+6.4%"
        badgeColor="red"
        description="total errors"
        data={servicesData}

      />
    </Grid.Item>
  </Grid>
`

// ── Component ────────────────────────────────────────────────────

export function ErrorsDashboardMdx() {
  return (
    <TooltipPrimitive.Provider>
      <div className='relative flex w-full flex-col gap-6 pb-10'>
        <div>
          <h1 className='text-2xl font-medium'>Errors</h1>
        </div>
        {renderDashboard({
          mdx: dashboardMdx,
          scope: {
            errorsByServiceData,
            errorSourcesData,
            handledData,
            bySeverityData,
            byEnvironmentData,
            servicesData,
            browserErrorsChartData,
          },
        })}
      </div>
    </TooltipPrimitive.Provider>
  )
}
