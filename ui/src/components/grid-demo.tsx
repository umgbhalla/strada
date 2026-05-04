// Demo page for the compound Grid component and page-level grid line extensions.

"use client";

import { BarChart, LineChart } from "echarts/charts";
import { AriaComponent, GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { Bug, Clock, Database, Globe, Server, ShieldCheck } from "lucide-react";
import type * as React from "react";
import { useMemo } from "react";

import { ChartLegend, TimeseriesChart } from "./charts.tsx";
import { Grid } from "./grid.tsx";
import { ThemeToggle } from "./traces-graph/theme-toggle.tsx";
import { TraceActivityLog } from "./traces/trace-activity-log.tsx";
import type { OtelTraceRow } from "../lib/utils.ts";
import { buildSpanTree } from "../lib/utils.ts";
import { cn } from "../lib/utils.ts";

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer, AriaComponent]);

export function GridDemoPage() {
  const trace = useMemo(() => buildSpanTree(gridTraceRows), []);
  const chartData = useMemo(() => buildGridChartData(), []);

  return (
    <div className="flex w-full flex-col items-center gap-10 overflow-x-hidden">
      <div className="flex w-full max-w-7xl items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Grid</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Compound bento layout with CSS grid tracks, border-colored lattice lines, and foreground vertex dots.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-7xl pb-10">
        <div aria-hidden className="absolute left-1/2 top-0 h-px w-screen -translate-x-1/2 bg-border" />
        <Grid columns={12} rows={4} rowHeight={180} cellPadding={20} lines>
          <Grid.LineExtensions />
          <Grid.Item columnSpan={5} rowSpan={2}>
            <DemoPanel className="h-full justify-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="size-4" />
                Browser analytics
              </div>
              <div className="flex items-end justify-center gap-4">
                <div className="flex flex-col gap-2">
                  <div className="text-4xl font-semibold tracking-tight">18.4k</div>
                  <p className="max-w-sm text-sm leading-6 text-muted-foreground">Pageviews grouped by route and session.</p>
                </div>
                <ChartLegend.SmallItem name="Visitors" value="8.1k" color="blue" />
              </div>
              <div className="shrink-0">
                <TimeseriesChart echarts={echarts} data={chartData.pageviews} height={180} gradient />
              </div>
            </DemoPanel>
          </Grid.Item>

          <Grid.Item columnSpan={3}>
            <MetricPanel icon={<Bug className="size-4" />} label="Open issues" value="12" />
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <DemoPanel className="h-full">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" />
                Latency shape
              </div>
              <div className="flex flex-wrap gap-4">
                <ChartLegend.SmallItem name="api" value="184ms" color="blue" />
                <ChartLegend.SmallItem name="db" value="72ms" color="amber" />
              </div>
              <div className="shrink-0">
                <TimeseriesChart echarts={echarts} data={chartData.latency} height={240} type="bar" yAxisTickFormat={(value) => `${value}ms`} />
              </div>
            </DemoPanel>
          </Grid.Item>

          <Grid.Item columnSpan={3}>
            <MetricPanel icon={<Clock className="size-4" />} label="p95 latency" value="184ms" />
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <DemoPanel className="h-full">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Server className="size-4" />
                Services
              </div>
              <div className="grid gap-3 text-sm">
                {['web', 'api', 'worker'].map((service) => (
                  <div key={service} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <span>{service}</span>
                    <span className="text-muted-foreground">healthy</span>
                  </div>
                ))}
              </div>
            </DemoPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <DemoPanel className="h-full">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Database className="size-4" />
                Trace activity
              </div>
              <TraceActivityLog
                rootSpans={trace.rootSpans}
                totalDurationMs={trace.totalDurationMs}
                traceStartTime={trace.traceStartTime}
                services={trace.services}
                className="max-h-40 bg-transparent"
              />
            </DemoPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <MetricPanel icon={<ShieldCheck className="size-4" />} label="Error budget" value="99.94%" />
          </Grid.Item>
        </Grid>
      </div>
    </div>
  );
}

function buildGridChartData() {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const timestamps = Array.from({ length: 18 }, (_, index) => now - (17 - index) * 60_000);
  const series = ({ name, seed, scale = 1 }: { name: string; seed: number; scale?: number }) => ({
    name,
    data: timestamps.map<[number, number]>((timestamp, index) => {
      const wave = Math.sin((index + seed) / 2) * 8;
      const trend = index * 1.4;
      return [timestamp, Math.round((40 + seed * 12 + wave + trend) * scale)];
    }),
  });

  return {
    pageviews: [series({ name: "Pageviews", seed: 1 }), { ...series({ name: "Visitors", seed: 0, scale: 0.55 }), color: "blue" as const }],
    latency: [series({ name: "api", seed: 2, scale: 3 }), { ...series({ name: "db", seed: 0, scale: 1.2 }), color: "amber" as const }],
  };
}

const traceBaseNs = new Date("2026-01-01T12:00:00.000Z").getTime() * 1_000_000;

function traceRow({
  spanId,
  parentSpanId,
  spanName,
  serviceName,
  offsetMs,
  durationMs,
  spanAttributes = {},
}: {
  spanId: string;
  parentSpanId: string;
  spanName: string;
  serviceName: string;
  offsetMs: number;
  durationMs: number;
  spanAttributes?: Record<string, string>;
}): OtelTraceRow {
  return {
    TraceId: "grid-demo-trace",
    SpanId: spanId,
    ParentSpanId: parentSpanId,
    SpanName: spanName,
    ServiceName: serviceName,
    SpanKind: spanName.startsWith("GET") ? "SPAN_KIND_SERVER" : "SPAN_KIND_INTERNAL",
    Duration: durationMs * 1_000_000,
    Timestamp: new Date((traceBaseNs + offsetMs * 1_000_000) / 1_000_000).toISOString(),
    StatusCode: "Ok",
    StatusMessage: "",
    SpanAttributes: spanAttributes,
    ResourceAttributes: {},
  };
}

const gridTraceRows: OtelTraceRow[] = [
  traceRow({ spanId: "s1", parentSpanId: "", spanName: "GET /checkout", serviceName: "web", offsetMs: 0, durationMs: 420, spanAttributes: { "http.route": "/checkout", "http.status_code": "200" } }),
  traceRow({ spanId: "s2", parentSpanId: "s1", spanName: "load_cart", serviceName: "web", offsetMs: 12, durationMs: 48 }),
  traceRow({ spanId: "s3", parentSpanId: "s1", spanName: "SELECT cart_items", serviceName: "postgres", offsetMs: 72, durationMs: 96, spanAttributes: { "db.system": "postgresql" } }),
  traceRow({ spanId: "s4", parentSpanId: "s1", spanName: "POST /payment_intents", serviceName: "api", offsetMs: 190, durationMs: 180, spanAttributes: { "peer.service": "stripe" } }),
];

function DemoPanel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col justify-between gap-2 rounded-2xl", className)} {...props} />;
}

function MetricPanel({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <DemoPanel className="h-full justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
    </DemoPanel>
  );
}
