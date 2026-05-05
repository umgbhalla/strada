'use client';

import * as React from 'react';
import { RiArrowDownLine, RiArrowUpLine } from '@remixicon/react';
import { format } from 'date-fns';

import * as Divider from '@/components/alignui/divider';
import { ChartArea, type AreaChartDataPoint } from '@/components/chart-area';
import { WidgetCard, WidgetHeader } from '@/components/widget-card';

function StackedAreaChartComponent() {
  // Generate sample data for 18 months
  const generateData = (): AreaChartDataPoint[] => {
    const data: AreaChartDataPoint[] = [];
    const startDate = new Date('2023-06-01');

    for (let i = 0; i < 18; i++) {
      const currentDate = new Date(startDate);
      currentDate.setMonth(startDate.getMonth() + i);

      const value1 = Math.floor(Math.random() * 50) + 5;
      const value2 = value1 + Math.floor(Math.random() * 20) + 15;

      data.push({
        date: currentDate.toISOString().split('T')[0],
        value1,
        value2,
      });
    }

    return data;
  };

  const data = generateData();

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
            dataKey: 'value2',
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

export function MetricRowsPanel() {
  return (
    <WidgetCard>
      <WidgetHeader
        title='Conversion Rate'
        value='16.9%'
        badge='+2.1%'
        actionLabel='Details'
      />

      <Divider.Root variant='line-spacing' />

      <div className='flex w-full flex-col gap-3'>
        <div className='flex items-center gap-1.5'>
          <div className='flex-1 text-sm font-medium text-muted-foreground'>
            Added to Cart
          </div>

          <div className='flex items-center gap-1.5'>
            <div className='min-w-16 text-sm font-medium tabular-nums text-muted-foreground'>
              3,842
            </div>
            <div className='flex min-w-16 items-center justify-end gap-0.5 pl-1 text-right tabular-nums'>
              <RiArrowUpLine className='size-5 shrink-0 text-success' />
              <div className='text-sm font-normal text-muted-foreground'>+1.8%</div>
            </div>
          </div>
        </div>

        <div className='flex items-center gap-1.5'>
          <div className='flex-1 text-sm font-medium text-muted-foreground'>
            Reached Checkout
          </div>

          <div className='flex items-center gap-1.5'>
            <div className='min-w-16 text-sm font-medium tabular-nums text-muted-foreground'>
              1,256
            </div>
            <div className='flex min-w-16 items-center justify-end gap-0.5 pl-1 text-right tabular-nums'>
              <RiArrowDownLine className='size-5 shrink-0 text-destructive' />
              <div className='text-sm font-normal text-muted-foreground'>-1.2%</div>
            </div>
          </div>
        </div>

        <div className='flex items-center gap-1.5'>
          <div className='flex-1 text-sm font-medium text-muted-foreground'>
            Purchased
          </div>

          <div className='flex items-center gap-1.5'>
            <div className='min-w-16 text-sm font-medium tabular-nums text-muted-foreground'>
              649
            </div>
            <div className='flex min-w-16 items-center justify-end gap-0.5 pl-1 text-right tabular-nums'>
              <RiArrowUpLine className='size-5 text-success' />
              <div className='text-sm font-normal text-muted-foreground'>+2.4%</div>
            </div>
          </div>
        </div>
      </div>

      <StackedAreaChartComponent />
    </WidgetCard>
  );
}
