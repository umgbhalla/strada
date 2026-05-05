// Generic metric rows panel with a stacked area chart footer.

'use client';

import * as React from 'react';
import { RiArrowDownLine, RiArrowUpLine } from '@remixicon/react';
import { format } from 'date-fns';

import * as Divider from '@/components/alignui/divider';
import { ChartArea, type AreaChartDataPoint } from '@/components/chart-area';
import { WidgetHeader } from '@/components/widget-card';

export type MetricRowsPanelDataItem = {
  label: string;
  value: string;
  change: string;
  direction: 'up' | 'down';
};

export type MetricRowsPanelChartPoint = AreaChartDataPoint & {
  value1: number;
  value2: number;
  value2Background: number;
};

export type MetricRowsPanelProps = Pick<
  React.ComponentProps<typeof WidgetHeader>,
  'title' | 'value' | 'badge' | 'badgeColor' | 'actionLabel' | 'action'
> & {
  data: MetricRowsPanelDataItem[];
  chartData: MetricRowsPanelChartPoint[];
};

function StackedAreaChartComponent({ data }: { data: MetricRowsPanelChartPoint[] }) {
  return (
    <div
      className='relative w-full'
      style={{ height: 136 }}
    >
      {/* custom cartesian grid */}
      <div
        className='absolute inset-0 overflow-hidden rounded-lg ring-1 ring-inset ring-border'
        style={{
          height: 112,
          background: `
            linear-gradient(90deg, var(--color-border) 1px, #0000 1px 100%) 0 0 / calc(100% / 6) 112px repeat no-repeat,
            linear-gradient(180deg, var(--color-border) 1px, #0000 1px 100%) 0 0 / 100% calc(112px / 4) no-repeat repeat
          `,
        }}
      />
      <div className='absolute bottom-6 left-0 z-10 size-4 overflow-hidden'>
        <div
          className='size-4 rounded-bl-lg'
          style={{
            boxShadow: '-100px 100px 0 100px var(--color-background)',
          }}
        />
      </div>
      <div className='absolute bottom-6 right-0 z-10 size-4 overflow-hidden'>
        <div
          className='size-4 rounded-br-lg'
          style={{
            boxShadow: '100px 100px 0 100px var(--color-background)',
          }}
        />
      </div>
      <ChartArea
        data={data}
        height='100%'
        showXAxis
        xAxisFormatter={(value) => {
          const date = new Date(value);
          return format(date, "MMM ''yy").toLocaleUpperCase();
        }}
        xAxisClassName='[&_.recharts-cartesian-axis-tick_text]:fill-foreground/40 [&_.recharts-cartesian-axis-tick_text]:text-xs [&_.recharts-cartesian-axis-tick_text]:font-medium'
        areas={[
          {
            dataKey: 'value2Background',
            fill: 'var(--color-background)',
          },
          {
            dataKey: 'value2',
            fill: 'color-mix(in srgb, var(--color-primary) 16%, transparent)',
          },
          {
            dataKey: 'value1',
            fill: 'var(--color-primary)',
          },
        ]}
      />
    </div>
  );
}

export function MetricRowsPanel({
  title,
  value,
  badge,
  badgeColor,
  actionLabel,
  action,
  data,
  chartData,
}: MetricRowsPanelProps) {
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

      <Divider.Root variant='line-spacing' />

      <div className='flex w-full flex-col gap-3'>
        {data.map((item) => {
          const TrendIcon = item.direction === 'up' ? RiArrowUpLine : RiArrowDownLine;
          return (
            <div key={item.label} className='flex items-center gap-1.5'>
              <div className='flex-1 text-sm font-medium text-muted-foreground'>
                {item.label}
              </div>

              <div className='flex items-center gap-1.5'>
                <div className='min-w-16 text-sm font-medium tabular-nums text-muted-foreground'>
                  {item.value}
                </div>
                <div className='flex min-w-16 items-center justify-end gap-0.5 pl-1 text-right tabular-nums'>
                  <TrendIcon className={item.direction === 'up' ? 'size-5 shrink-0 text-success' : 'size-5 shrink-0 text-destructive'} />
                  <div className='text-sm font-normal text-muted-foreground'>{item.change}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <StackedAreaChartComponent data={chartData} />
    </>
  );
}
