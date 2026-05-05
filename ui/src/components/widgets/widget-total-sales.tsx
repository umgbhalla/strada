'use client';

import * as React from 'react';
import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiFacebookCircleLine,
  RiInstagramLine,
  RiStore2Line,
} from '@remixicon/react';

import { cn } from '@/utils/cn';
import { ChartLine } from '@/components/chart-line';
import { TimeRangeToggle } from '@/components/time-range-toggle';
import { WidgetCard, WidgetHeader } from '@/components/widget-card';
import {
  startOfWeek,
  subWeeks,
} from 'date-fns';

// Weekly sales data (last 40 weeks) - inlined to avoid a separate data module
const weeklySalesData = Array.from({ length: 40 }, (_, index) => {
  const date = startOfWeek(subWeeks(new Date(), 39 - index));
  return {
    date: date.toISOString().split('T')[0],
    value: 8000 + Math.floor(Math.random() * 4000),
    prev: `${Math.random() > 0.5 ? '+' : '-'}${(Math.random() * 7.5).toFixed(1)}%`,
  };
});

export function SparklinePanel() {
  const [selectedRange, setSelectedRange] = React.useState('1w');

  return (
    <WidgetCard>
      <WidgetHeader title='Total Sales' value='$128.32' badge='+2%' actionLabel='Report' />

      <TimeRangeToggle value={selectedRange} onValueChange={setSelectedRange} />

      <ChartLine
        data={weeklySalesData}
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
        <div className='flex items-center gap-1.5'>
          <div className='flex flex-1 items-center gap-1.5'>
            <RiStore2Line className='size-5 shrink-0 text-foreground/40' />
            <div className='text-sm font-medium text-muted-foreground'>Online Store</div>
          </div>

          <div className='flex items-center gap-1.5'>
            <div className='min-w-16 text-sm font-normal tabular-nums text-muted-foreground'>
              $52.12
            </div>
            <div className='flex min-w-16 items-center justify-end gap-0.5 pl-1 text-right tabular-nums'>
              <RiArrowUpLine className='size-5 shrink-0 text-success' />
              <div className='text-sm font-normal text-muted-foreground'>+4.5%</div>
            </div>
          </div>
        </div>

        <div className='flex items-center gap-1.5'>
          <div className='flex flex-1 items-center gap-1.5'>
            <RiFacebookCircleLine className='size-5 shrink-0 text-foreground/40' />
            <div className='text-sm font-medium text-muted-foreground'>Facebook</div>
          </div>

          <div className='flex items-center gap-1.5'>
            <div className='min-w-16 text-sm font-normal tabular-nums text-muted-foreground'>
              $38.45
            </div>
            <div className='flex min-w-16 items-center justify-end gap-0.5 pl-1 text-right tabular-nums'>
              <RiArrowDownLine className='size-5 shrink-0 text-destructive' />
              <div className='text-sm font-normal text-muted-foreground'>-2.8%</div>
            </div>
          </div>
        </div>

        <div className='flex items-center gap-1.5'>
          <div className='flex flex-1 items-center gap-1.5'>
            <RiInstagramLine className='size-5 shrink-0 text-foreground/40' />
            <div className='text-sm font-medium text-muted-foreground'>Instagram</div>
          </div>

          <div className='flex items-center gap-1.5'>
            <div className='min-w-16 text-sm font-normal tabular-nums text-muted-foreground'>
              $37.75
            </div>
            <div className='flex min-w-16 items-center justify-end gap-0.5 pl-1 text-right tabular-nums'>
              <RiArrowUpLine className='size-5 text-success' />
              <div className='text-sm font-normal text-muted-foreground'>+3.2%</div>
            </div>
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}
