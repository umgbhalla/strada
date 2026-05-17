// Errors dashboard page with widget grid.
// Uses 3 chart component types: SparklinePanel, DonutPanel, SparkAreaPanel.
// Demo data mirrors real otel_errors query shapes for easy swap to live SQL.

"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Grid } from "@ui/components/grid.tsx";
import { SparkAreaPanel } from "@ui/components/widgets/spark-area-panel.tsx";
import { DonutPanel } from "@ui/components/widgets/donut-panel.tsx";
import { SparklinePanel } from "@ui/components/widgets/sparkline-panel.tsx";

// ── Demo data ────────────────────────────────────────────────────

const demoMonthDate = (startMonthIndex: number, offset: number) =>
  new Date(Date.UTC(2025, startMonthIndex + offset, 1))
    .toISOString()
    .slice(0, 10);

// ── 1. Errors by Service (SparklinePanel, ECharts multi-line) ────
// SQL: SELECT ServiceName, toStartOfDay(Timestamp) AS day, count() AS c
//      FROM otel_errors WHERE Timestamp >= now() - INTERVAL 7 DAY
//      GROUP BY ServiceName, day ORDER BY day
const errorsByServiceData = (() => {
  const base = Date.UTC(2025, 4, 1);
  const day = 86_400_000;
  const points = 30;
  return [
    {
      name: "api-service",
      data: Array.from({ length: points }, (_, i): [number, number] => [
        base + i * day,
        120 + Math.round(Math.sin(i * 0.4) * 40 + ((i * 17) % 30)),
      ]),
    },
    {
      name: "web-frontend",
      data: Array.from({ length: points }, (_, i): [number, number] => [
        base + i * day,
        80 + Math.round(Math.cos(i * 0.3) * 25 + ((i * 13) % 20)),
      ]),
    },
    {
      name: "worker",
      data: Array.from({ length: points }, (_, i): [number, number] => [
        base + i * day,
        25 + Math.round(Math.sin(i * 0.6) * 15 + ((i * 7) % 12)),
      ]),
    },
  ];
})();



// ── 3. Error Sources (DonutPanel) ────────────────────────────────
const errorSourcesData = [
  { label: "TypeError", value: 2410 },
  { label: "HttpError", value: 1735 },
  { label: "ReferenceError", value: 1084 },
  { label: "TimeoutError", value: 722 },
  { label: "SyntaxError", value: 433 },
  { label: "ChunkLoadError", value: 312 },
  { label: "AbortError", value: 245 },
  { label: "RangeError", value: 198 },
  { label: "ConnectionError", value: 156 },
  { label: "EvalError", value: 98 },
  { label: "URIError", value: 52 },
  { label: "InternalError", value: 31 },
];

// ── 4. Handled vs Unhandled (DonutPanel) ─────────────────────────
const handledData = [
  { label: "Unhandled", value: 3842 },
  { label: "Handled", value: 1256 },
  { label: "Resolved", value: 649 },
];

// ── 5. By Severity (DonutPanel) ──────────────────────────────────
const bySeverityData = [
  { label: "Fatal", value: 245 },
  { label: "Error", value: 6180 },
  { label: "Warning", value: 1520 },
  { label: "Info", value: 313 },
];

// ── 6. By Environment (DonutPanel) ───────────────────────────────
const byEnvironmentData = [
  { label: "Production", value: 5940 },
  { label: "Staging", value: 1814 },
  { label: "Development", value: 504 },
];

// ── 7. Services Error Share (DonutPanel) ─────────────────────────
const servicesData = [
  { label: "api-service", value: 4520 },
  { label: "web-frontend", value: 2847 },
  { label: "worker", value: 891 },
];



// ── 10. Browser Errors (SparkAreaPanel) ──────────────────────────
// SQL: SELECT toStartOfDay(Timestamp) AS day, count() AS c
//      FROM otel_errors WHERE mapContains(Tags, 'url.path') GROUP BY day
const browserErrorsChartData = Array.from({ length: 18 }, (_, index) => ({
  date: demoMonthDate(0, index),
  value: 45 + ((index * 19) % 35),
}));



// ── Component ────────────────────────────────────────────────────

function WidgetPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-col gap-4">{children}</div>;
}

export function ErrorsDashboard() {
  return (
    <TooltipPrimitive.Provider>
      <div className="relative flex flex-col gap-6 w-full pb-10">
        <div>
          <h1 className="text-2xl font-medium">Errors</h1>
        </div>
        <Grid columns={12} rows={6} rowHeight={200} cellPadding={34} lines>
          {/* Row 1-2: Errors by Service (SparklinePanel 8 cols) + Browser Errors (SparkAreaPanel 4 cols) */}
          <Grid.Item columnSpan={8} rowSpan={2}>
            <WidgetPanel>
              <SparklinePanel
                title="Total Errors"
                value="8,258"
                badge="+6.4%"
                badgeColor="red"
                actionLabel="Report"
                data={errorsByServiceData}
                gradient
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={1}>
            <WidgetPanel>
              <SparkAreaPanel
                title="Browser Errors"
                value="2,847"
                badge="Last 30 days"
                actionLabel="Details"
                tooltip={<>Errors from browser pages where url.path is present in Tags.</>}
                data={browserErrorsChartData}
                usageValue="/checkout"
                usageLabel="842 errors (top page)"
              />
            </WidgetPanel>
          </Grid.Item>

          {/* Row 3-4: Error Sources + Handled vs Unhandled + By Severity (all Donut, 4x2 each) */}
          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <DonutPanel
                title="Error Sources"
                badge="+6.4%"
                badgeColor="red"
                description="vs last week"
                tooltip={<>Server vs Browser vs Worker split by SourceSignal.</>}
                data={errorSourcesData}
                
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <DonutPanel
                title="Handled vs Unhandled"
                badge="+8.2%"
                badgeColor="red"
                description="unhandled rate"
                tooltip={<>Groups by MechanismHandled. Unhandled = onerror, unhandledrejection. Handled = captureException.</>}
                data={handledData}
                
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <DonutPanel
                title="By Severity"
                badge="+5.8%"
                badgeColor="red"
                description="vs last week"
                tooltip={<>Error severity breakdown from the Level column.</>}
                data={bySeverityData}
                
              />
            </WidgetPanel>
          </Grid.Item>

          {/* Row 5-6: By Environment + By Service */}
          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <DonutPanel
                title="By Environment"
                badge="+4.2%"
                badgeColor="red"
                description="production errors"
                tooltip={<>Error distribution by Environment column (production, staging, development).</>}
                data={byEnvironmentData}
                
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <DonutPanel
                title="By Service"
                badge="+6.4%"
                badgeColor="red"
                description="total errors"
                tooltip={<>Error distribution across services.</>}
                data={servicesData}
                
              />
            </WidgetPanel>
          </Grid.Item>
        </Grid>
      </div>
    </TooltipPrimitive.Provider>
  );
}
