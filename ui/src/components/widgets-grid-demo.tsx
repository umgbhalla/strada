// Demo page for dashboard widgets in a bento grid layout.

"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Grid } from "./grid.tsx";
import { ThemeToggle } from "./traces-graph/theme-toggle.tsx";
import { SplitColumnsPanel } from "./widgets/widget-total-visitors.tsx";
import { MetricRowsPanel } from "./widgets/widget-conversion-rate.tsx";
import { BarRankingPanel } from "./widgets/widget-product-performance.tsx";
import { BubblePanel } from "./widgets/widget-real-time.tsx";
import { SparkAreaPanel } from "./widgets/widget-campaign-data.tsx";
import { DonutPanel } from "./widgets/customer-segments.tsx";
import { ProportionPanel } from "./widgets/marketing-channels.tsx";
import { HeatmapPanel } from "./widgets/widget-user-retention.tsx";
import { ProgressNavPanel } from "./widgets/product-categories.tsx";
import { SparklinePanel } from "./widgets/widget-total-sales.tsx";
import { GeographyPanel } from "./widgets/widget-geogprahy.tsx";

export function WidgetsGridDemoPage() {
  return (
    <TooltipPrimitive.Provider>
    <div className="flex w-full flex-col items-center gap-10 overflow-x-clip">
      <div className="flex w-full max-w-[1300px] items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Widgets</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Dashboard widget components in a bento grid. Each widget is a generic building block with data passed as props.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-[1300px] pb-10">
        <div aria-hidden className="absolute left-1/2 top-0 h-px w-screen -translate-x-1/2 bg-border" />
        <Grid columns={12} rows={8} rowHeight={200} cellPadding={34} lines>
          <Grid.LineExtensions />

          <Grid.Item columnSpan={8} rowSpan={2}>
            <WidgetPanel>
              <SparklinePanel />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <SplitColumnsPanel />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <MetricRowsPanel />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <BarRankingPanel />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <ProportionPanel />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <BubblePanel />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <DonutPanel />
              <div className="h-px w-full bg-border" />
              <ProgressNavPanel />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={1}>
            <WidgetPanel>
              <SparkAreaPanel />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <HeatmapPanel />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <GeographyPanel />
            </WidgetPanel>
          </Grid.Item>
        </Grid>
      </div>
    </div>
    </TooltipPrimitive.Provider>
  );
}

function WidgetPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col gap-4">
      {children}
    </div>
  );
}
