// Demo page for dashboard widgets in a bento grid layout.

"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Grid } from "./grid.tsx";
import { ThemeToggle } from "./traces-graph/theme-toggle.tsx";
import { WidgetTotalVisitors } from "./widgets/widget-total-visitors.tsx";
import { WidgetConversionRate } from "./widgets/widget-conversion-rate.tsx";
import { WidgetProductPerformance } from "./widgets/widget-product-performance.tsx";
import { WidgetRealTime } from "./widgets/widget-real-time.tsx";
import { WidgetCampaignData } from "./widgets/widget-campaign-data.tsx";
import { WidgetCustomerSegments } from "./widgets/customer-segments.tsx";
import { WidgetMarketingChannels } from "./widgets/marketing-channels.tsx";
import { WidgetUserRetention } from "./widgets/widget-user-retention.tsx";
import { WidgetProductCategories } from "./widgets/product-categories.tsx";
import { WidgetTotalSales } from "./widgets/widget-total-sales.tsx";
import { WidgetGeography } from "./widgets/widget-geogprahy.tsx";

export function WidgetsGridDemoPage() {
  return (
    <TooltipPrimitive.Provider>
    <div className="flex w-full flex-col items-center gap-10 overflow-x-hidden">
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
              <WidgetTotalSales />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <WidgetTotalVisitors />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <WidgetConversionRate />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <WidgetProductPerformance />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <WidgetMarketingChannels />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <WidgetRealTime />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <WidgetCustomerSegments />
              <div className="h-px w-full bg-border" />
              <WidgetProductCategories />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={1}>
            <WidgetPanel>
              <WidgetCampaignData />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <WidgetUserRetention />
            </WidgetPanel>
          </Grid.Item>

          <Grid.Item columnSpan={4} rowSpan={2}>
            <WidgetPanel>
              <WidgetGeography />
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
    <div className="flex h-full flex-col gap-4">
      {children}
    </div>
  );
}
