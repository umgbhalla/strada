// Generic sparkline panel with repeated source metrics below the chart.

'use client';

import * as React from 'react';
import {
  RiArrowDownLine,
  RiArrowUpLine,
} from '@remixicon/react';

import { cn } from '@/utils/cn';
import { ChartLine, type LineChartDataPoint } from '@/components/chart-line';
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
  data: LineChartDataPoint[];
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
  data,
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

      <ChartLine
        data={data}
        height={180}
        showGrid
        className={cn(
          '[&_.recharts-cartesian-grid-horizontal>line]:stroke-border [&_.recharts-cartesian-grid-horizontal>line]:[stroke-dasharray:0]',
          '[&_.recharts-cartesian-grid-vertical>line:last-child]:opacity-0 [&_.recharts-cartesian-grid-vertical>line:nth-last-child(2)]:opacity-0',
        )}
        margin={{ top: 6, right: 0, left: 0, bottom: 6 }}
        yDomain={['auto', 'auto']}
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
