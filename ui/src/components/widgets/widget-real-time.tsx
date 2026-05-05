'use client';

import * as React from 'react';

import BubbleChart, { BubbleDataPoint } from '@/components/bubble-chart';
import IconArrowTrendDown from '@/components/icons/arrow-trend-down';
import IconArrowTrendUp from '@/components/icons/arrow-trend-up';
import { LegendDot } from '@/components/legend-dot';
import { WidgetCard, WidgetHeader } from '@/components/widget-card';

const data: BubbleDataPoint[] = [
  {
    category: 'Europe',
    percentage: 48,
    color: 'color-mix(in srgb, var(--color-primary) 24%, transparent)',
    textColor: '#71330a',
  },
  {
    category: 'Asia',
    percentage: 32,
    color: 'color-mix(in srgb, var(--color-warning) 24%, transparent)',
    textColor: 'var(--color-yellow-950)',
  },
  {
    category: 'Americas',
    percentage: 20,
    color: 'color-mix(in srgb, var(--color-success) 24%, transparent)',
    textColor: '#0b4627',
  },
];

export function BubblePanel() {
  return (
    <WidgetCard>
      <WidgetHeader
        title='Real-time Visitors'
        value='32.6M'
        badge='+8.4%'
        actionLabel='Details'
      />

      <div className='flex justify-center'>
        <BubbleChart data={data} width={312} height={156} />
      </div>

      <div className='flex w-full flex-col gap-3.5'>
        <div className='flex items-center gap-1.5'>
          <div className='flex size-5 shrink-0 items-center justify-center'>
            <LegendDot className='bg-primary' />
          </div>
          <div className='flex-1 text-sm font-medium text-muted-foreground'>Europe</div>

          <div className='flex items-center gap-2'>
            <div className='min-w-11 text-sm font-medium text-muted-foreground'>
              15.8M
            </div>
            <div className='text-sm font-normal text-foreground/25'>·</div>
            <div className='flex min-w-16 items-center justify-end gap-2 pl-0.5 text-right'>
              <IconArrowTrendUp className='size-[9px]' />
              <div className='text-sm font-medium text-muted-foreground'>+4.7%</div>
            </div>
          </div>
        </div>

        <div className='flex items-center gap-1.5'>
          <div className='flex size-5 shrink-0 items-center justify-center'>
            <LegendDot className='bg-yellow-500' />
          </div>
          <div className='flex-1 text-sm font-medium text-muted-foreground'>Asia</div>

          <div className='flex items-center gap-2'>
            <div className='min-w-11 text-sm font-medium text-muted-foreground'>
              10.2M
            </div>
            <div className='text-sm font-normal text-foreground/25'>·</div>
            <div className='flex min-w-16 items-center justify-end gap-2 pl-0.5 text-right'>
              <IconArrowTrendDown className='size-[9px]' />
              <div className='text-sm font-medium text-muted-foreground'>-6.2%</div>
            </div>
          </div>
        </div>

        <div className='flex items-center gap-1.5'>
          <div className='flex size-5 shrink-0 items-center justify-center'>
            <LegendDot className='bg-success' />
          </div>
          <div className='flex-1 text-sm font-medium text-muted-foreground'>Americas</div>

          <div className='flex items-center gap-2'>
            <div className='min-w-11 text-sm font-medium text-muted-foreground'>6.6M</div>
            <div className='text-sm font-normal text-foreground/25'>·</div>
            <div className='flex min-w-16 items-center justify-end gap-2 pl-0.5 text-right'>
              <IconArrowTrendUp className='size-[9px]' />
              <div className='text-sm font-medium text-muted-foreground'>+3.8%</div>
            </div>
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}
