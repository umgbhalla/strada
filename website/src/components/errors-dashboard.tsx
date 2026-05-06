// Errors dashboard page with widget grid.
// Imports individual widget components from @strada.sh/ui.
// Demo data will be replaced with real error/trace data from Tinybird later.

"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  RiFacebookCircleLine,
  RiFocus2Line,
  RiInstagramLine,
  RiStore2Line,
  RiTimeLine,
  RiUser6Line,
} from "@remixicon/react";
import { LineChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { Grid } from "@strada.sh/ui/src/components/grid.tsx";
import { SplitColumnsPanel } from "@strada.sh/ui/src/components/widgets/split-columns-panel.tsx";
import { MetricRowsPanel } from "@strada.sh/ui/src/components/widgets/metric-rows-panel.tsx";
import { BarRankingPanel } from "@strada.sh/ui/src/components/widgets/bar-ranking-panel.tsx";
import { BubblePanel } from "@strada.sh/ui/src/components/widgets/bubble-panel.tsx";
import { SparkAreaPanel } from "@strada.sh/ui/src/components/widgets/spark-area-panel.tsx";
import { DonutPanel } from "@strada.sh/ui/src/components/widgets/donut-panel.tsx";
import { ProportionPanel } from "@strada.sh/ui/src/components/widgets/proportion-panel.tsx";
import { HeatmapPanel } from "@strada.sh/ui/src/components/widgets/heatmap-panel.tsx";
import { ProgressNavPanel } from "@strada.sh/ui/src/components/widgets/progress-nav-panel.tsx";
import { SparklinePanel } from "@strada.sh/ui/src/components/widgets/sparkline-panel.tsx";
import { GeographyPanel } from "@strada.sh/ui/src/components/widgets/geography-panel.tsx";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
  AriaComponent,
]);

// ── Demo data (replace with real Tinybird queries later) ─────────

const demoMonthDate = (startMonthIndex: number, offset: number) =>
  new Date(Date.UTC(2023, startMonthIndex + offset, 1))
    .toISOString()
    .slice(0, 10);

const sparklineData = (() => {
  const base = Date.UTC(2024, 0, 1);
  const day = 86_400_000;
  return [
    {
      name: "Errors",
      data: Array.from({ length: 40 }, (_, i): [number, number] => [
        base + i * 7 * day,
        8200 + ((i * 719) % 3900),
      ]),
    },
  ];
})();

const sparklineMetrics = [
  {
    label: "TypeError",
    value: "1,204",
    change: "+4.5%",
    direction: "up" as const,
    icon: RiStore2Line,
  },
  {
    label: "ReferenceError",
    value: "842",
    change: "-2.8%",
    direction: "down" as const,
    icon: RiFacebookCircleLine,
  },
  {
    label: "SyntaxError",
    value: "315",
    change: "+3.2%",
    direction: "up" as const,
    icon: RiInstagramLine,
  },
];

const splitColumnsData = [
  {
    label: "Chrome",
    value: "27%",
    numericValue: 27,
    change: "-3.2%",
    direction: "down" as const,
    colorClassName: "bg-yellow-500",
  },
  {
    label: "Safari",
    value: "12%",
    numericValue: 12,
    change: "-6.4%",
    direction: "down" as const,
    colorClassName: "bg-sky-500",
  },
  {
    label: "Firefox",
    value: "61%",
    numericValue: 61,
    change: "+0.8%",
    direction: "up" as const,
    colorClassName: "bg-purple-500",
  },
];

const metricRowsData = [
  {
    label: "Unhandled",
    value: "3,842",
    change: "+1.8%",
    direction: "up" as const,
  },
  {
    label: "Handled",
    value: "1,256",
    change: "-1.2%",
    direction: "down" as const,
  },
  {
    label: "Resolved",
    value: "649",
    change: "+2.4%",
    direction: "up" as const,
  },
];

const metricRowsChartData = Array.from({ length: 18 }, (_, index) => {
  const value1 = 10 + ((index * 17) % 46);
  const value2 = value1 + 18 + (index % 5) * 3;
  return {
    date: demoMonthDate(5, index),
    value1,
    value2,
    value2Background: value2,
  };
});

const barRankingData = {
  "1d": [
    { value: 50, label: "A" },
    { value: 80, label: "B" },
    { value: 100, label: "C" },
    { value: 60, label: "D" },
    { value: 40, label: "E" },
  ],
  "1w": [
    { value: 30, label: "A" },
    { value: 70, label: "B" },
    { value: 80, label: "C" },
    { value: 20, label: "D" },
    { value: 60, label: "E" },
  ],
  "1m": [
    { value: 70, label: "A" },
    { value: 10, label: "B" },
    { value: 100, label: "C" },
    { value: 80, label: "D" },
    { value: 0, label: "E" },
  ],
  "3m": [
    { value: 25, label: "A" },
    { value: 45, label: "B" },
    { value: 60, label: "C" },
    { value: 80, label: "D" },
    { value: 40, label: "E" },
  ],
  "1y": [
    { value: 50, label: "A" },
    { value: 80, label: "B" },
    { value: 70, label: "C" },
    { value: 88, label: "D" },
    { value: 55, label: "E" },
  ],
};

const barRankingStats = [
  { label: "Avg. Rating", value: "4.7" },
  { label: "Satisfaction", value: "92%" },
  { label: "Return Rate", value: "4.2%" },
];

const proportionData = [
  { label: "Frontend", value: 45 },
  { label: "Backend", value: 40 },
  { label: "Worker", value: 15 },
];

const proportionRows = [
  {
    label: "p50 Latency",
    value: "38ms",
    change: "+5.2%",
    direction: "up" as const,
    icon: RiUser6Line,
  },
  {
    label: "p95 Latency",
    value: "142ms",
    change: "+3.8%",
    direction: "down" as const,
    icon: RiTimeLine,
  },
  {
    label: "Error Rate",
    value: "2.4%",
    change: "+4.5%",
    direction: "up" as const,
    icon: RiFocus2Line,
  },
];

const bubbleData = [
  {
    category: "Europe",
    label: "Europe",
    percentage: 48,
    value: "15.8K",
    change: "+4.7%",
    direction: "up" as const,
    color: "color-mix(in srgb, var(--color-primary) 24%, transparent)",
    textColor: "#71330a",
    dotClassName: "bg-primary",
  },
  {
    category: "Asia",
    label: "Asia",
    percentage: 32,
    value: "10.2K",
    change: "-6.2%",
    direction: "down" as const,
    color: "color-mix(in srgb, var(--color-warning) 24%, transparent)",
    textColor: "var(--color-yellow-950)",
    dotClassName: "bg-yellow-500",
  },
  {
    category: "Americas",
    label: "Americas",
    percentage: 20,
    value: "6.6K",
    change: "+3.8%",
    direction: "up" as const,
    color: "color-mix(in srgb, var(--color-success) 24%, transparent)",
    textColor: "#0b4627",
    dotClassName: "bg-success",
  },
];

const donutData = [
  {
    id: "critical",
    label: "Critical",
    fillClassName: "fill-primary",
    dotClassName: "bg-primary",
    value: 6450,
  },
  {
    id: "warning",
    label: "Warning",
    fillClassName: "fill-yellow-500",
    dotClassName: "bg-yellow-500",
    value: 5320,
  },
  {
    id: "info",
    label: "Info",
    fillClassName: "fill-success",
    dotClassName: "bg-success",
    value: 3280,
  },
  {
    id: "debug",
    label: "Debug",
    fillClassName: "fill-muted",
    dotClassName: "bg-muted",
    value: 2880,
    hiddenFromLegend: true,
  },
];

const progressNavData = [
  {
    id: "70d9",
    label: "api-service",
    value: 58,
    detailLabel: "errors",
    detailValue: "45",
    change: "+3.2%",
    badge: "+2.1%",
    description: "vs last week",
  },
  {
    id: "477b",
    label: "web-frontend",
    value: 40,
    detailLabel: "errors",
    detailValue: "32",
    change: "+2.8%",
    badge: "+1.5%",
    description: "vs last week",
  },
  {
    id: "9cf3",
    label: "worker",
    value: 15,
    detailLabel: "errors",
    detailValue: "18",
    change: "+4.5%",
    badge: "+3.2%",
    description: "vs last week",
  },
];

const sparkAreaData = Array.from({ length: 18 }, (_, index) => ({
  date: demoMonthDate(5, index),
  value: 22 + ((index * 13) % 29),
}));

const heatmapData = Array.from({ length: 12 }, (_, rowIndex) =>
  Array.from({ length: 12 - rowIndex }, (_, colIndex) =>
    Math.max(42, 96 - rowIndex * 4 - colIndex * 3),
  ),
);

const geographyData = [
  {
    id: 1,
    lat: 41.0082,
    lng: 28.9784,
    value: 1500,
    label: "Turkey",
    icon: "🇹🇷",
    demographics: [
      { label: "Men", value: 32 },
      { label: "Women", value: 60 },
      { label: "Other", value: 8 },
    ],
  },
  {
    id: 2,
    lat: 48.8566,
    lng: 2.3522,
    value: 800,
    label: "France",
    icon: "🇫🇷",
    demographics: [
      { label: "Men", value: 45 },
      { label: "Women", value: 50 },
      { label: "Other", value: 5 },
    ],
  },
  {
    id: 3,
    lat: 51.5074,
    lng: -0.1278,
    value: 1200,
    label: "United Kingdom",
    icon: "🇬🇧",
    demographics: [
      { label: "Men", value: 48 },
      { label: "Women", value: 47 },
      { label: "Other", value: 5 },
    ],
  },
  {
    id: 4,
    lat: 52.52,
    lng: 13.405,
    value: 900,
    label: "Germany",
    icon: "🇩🇪",
    demographics: [
      { label: "Men", value: 42 },
      { label: "Women", value: 53 },
      { label: "Other", value: 5 },
    ],
  },
  {
    id: 5,
    lat: 45.4642,
    lng: 9.19,
    value: 600,
    label: "Italy",
    icon: "🇮🇹",
    demographics: [
      { label: "Men", value: 38 },
      { label: "Women", value: 55 },
      { label: "Other", value: 7 },
    ],
  },
];

// ── Component ────────────────────────────────────────────────────

function WidgetPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-col gap-4">{children}</div>;
}

export function ErrorsDashboard() {
  return (
    <TooltipPrimitive.Provider>
      <div className="relative flex flex-col gap-6 w-full pb-10">
        <div className="">
          <h1 className="text-2xl font-medium">Errors Statistics</h1>
        </div>
        <Grid columns={12} rows={8} rowHeight={200} cellPadding={34} lines>
          <Grid.Item columnSpan={8} rowSpan={2}>
            <WidgetPanel>
              <SparklinePanel
                title="Total Errors"
                value="12,847"
                badge="+2%"
                actionLabel="Report"
                echarts={echarts}
                data={sparklineData}
                gradient
                metrics={sparklineMetrics}
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <SplitColumnsPanel
                title="By Browser"
                value="237,456"
                badge="-1.4%"
                badgeColor="red"
                actionLabel="Report"
                data={splitColumnsData}
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <MetricRowsPanel
                title="Error Status"
                value="16.9%"
                badge="+2.1%"
                actionLabel="Details"
                data={metricRowsData}
                chartData={metricRowsChartData}
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <BarRankingPanel
                title="Top Endpoints"
                value="22.8%"
                badge="+8.4%"
                actionLabel="Details"
                data={barRankingData}
                stats={barRankingStats}
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <ProportionPanel
                title="By Service"
                value="82%"
                badge="+2.1%"
                description="vs last week"
                tooltip={<>Error distribution across services.</>}
                actionLabel="Details"
                data={proportionData}
                rows={proportionRows}
                footerActionLabel="View reports"
                categoryBarClassName="h-3"
                dashedDividerClassName="h-1"
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <BubblePanel
                title="By Region"
                value="32.6K"
                badge="+8.4%"
                actionLabel="Details"
                data={bubbleData}
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <DonutPanel
                title="By Severity"
                badge="+5.8%"
                description="vs last week"
                tooltip={<>Error severity breakdown.</>}
                data={donutData}
              />
              <div className="h-px w-full bg-border" />
              <ProgressNavPanel
                title="By Service"
                actionLabel="Details"
                tooltip={<>Errors per service.</>}
                data={progressNavData}
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={1}>
            <WidgetPanel>
              <SparkAreaPanel
                title="Error Budget"
                value="$1,750"
                badge="Last 15 days"
                actionLabel="Details"
                tooltip={<>Track error budget consumption.</>}
                data={sparkAreaData}
                usageValue="45%"
                usageLabel="32.9K errors"
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <HeatmapPanel
                title="Error Retention"
                value="24%"
                badge="+2.0%"
                actionLabel="Details"
                data={heatmapData}
                labels={Array.from({ length: 12 }, (_, i) => i + 1)}
                caption="Last 12 months data updated at 1:51 PM."
              />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <GeographyPanel
                title="Geography"
                actionLabel="Details"
                data={geographyData}
                initialHighlightedId={1}
              />
            </WidgetPanel>
          </Grid.Item>
        </Grid>
      </div>
    </TooltipPrimitive.Provider>
  );
}
