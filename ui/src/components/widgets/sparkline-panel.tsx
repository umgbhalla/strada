// Generic sparkline panel with repeated source metrics below the chart.
// Uses the ECharts-based TimeseriesChart for rendering.

'use client';

import * as React from 'react';
import {
  RiArrowDownLine,
  RiArrowUpLine,
} from '@remixicon/react';

import { TimeseriesChart, type TimeseriesChartProps } from '@/components/charts';
import { TimeRangeToggle } from '@/components/time-range-toggle';
import { WidgetHeader } from '@/components/widget-card';

export type SparklinePanelMetric = {
  label: string;
  value: string;
  change: string;
  direction: 'up' | 'down';
  icon: React.ComponentType<{ className?: string }>;
};

export type SparklinePanelProps = Pick<
  React.ComponentProps<typeof WidgetHeader>,
  'title' | 'value' | 'badge' | 'badgeColor' | 'actionLabel' | 'action'
> & {
  /** ECharts instance (caller must register chart types and renderer). */
  echarts: TimeseriesChartProps['echarts'];
  /** Timeseries data for the ECharts chart. */
  data: TimeseriesChartProps['data'];
  /** Whether to show a gradient fill under the line. */
  gradient?: boolean;
  metrics: SparklinePanelMetric[];
  defaultRange?: string;
};

export function SparklinePanel({
  title,
  value,
  badge,
  badgeColor,
  actionLabel,
  action,
  echarts,
  data,
  gradient,
  metrics,
  defaultRange = '1w',
}: SparklinePanelProps) {
  const [selectedRange, setSelectedRange] = React.useState(defaultRange);

  return (
    <>
      <WidgetHeader
        title={title}
        value={value}
        badge={badge}
        badgeColor={badgeColor}
        actionLabel={actionLabel}
        action={action}
      />

      <TimeRangeToggle value={selectedRange} onValueChange={setSelectedRange} />

      <TimeseriesChart
        echarts={echarts}
        data={data}
        height={180}
        gradient={gradient}
        yAxisTickCount={3}
      />

      <div className='flex w-full flex-col gap-4'>
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const TrendIcon = metric.direction === 'up' ? RiArrowUpLine : RiArrowDownLine;
          return (
            <div key={metric.label} className='flex items-center gap-1.5'>
              <div className='flex flex-1 items-center gap-1.5'>
                <Icon className='size-5 shrink-0 text-foreground/40' />
                <div className='text-sm font-medium text-muted-foreground'>{metric.label}</div>
              </div>

              <div className='flex items-center gap-1.5'>
                <div className='min-w-16 text-sm font-normal tabular-nums text-muted-foreground'>
                  {metric.value}
                </div>
                <div className='flex min-w-16 items-center justify-end gap-0.5 pl-1 text-right tabular-nums'>
                  <TrendIcon className={metric.direction === 'up' ? 'size-5 shrink-0 text-success' : 'size-5 shrink-0 text-destructive'} />
                  <div className='text-sm font-normal text-muted-foreground'>{metric.change}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
