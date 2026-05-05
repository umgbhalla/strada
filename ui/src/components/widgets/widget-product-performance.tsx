'use client';

import * as React from 'react';

import { ChartVerticalBar, type VerticalBarDataPoint } from '@/components/chart-vertical-bar';
import { TimeRangeToggle } from '@/components/time-range-toggle';
import { WidgetCard, WidgetHeader } from '@/components/widget-card';

type Range = '1d' | '1w' | '1m' | '3m' | '1y';

const productPerformanceData: Record<Range, VerticalBarDataPoint[]> = {
  '1d': [
    { value: 50, label: 'A' },
    { value: 80, label: 'B' },
    { value: 100, label: 'C' },
    { value: 60, label: 'D' },
    { value: 40, label: 'E' },
  ],
  '1w': [
    { value: 30, label: 'A' },
    { value: 70, label: 'B' },
    { value: 80, label: 'C' },
    { value: 20, label: 'D' },
    { value: 60, label: 'E' },
  ],
  '1m': [
    { value: 70, label: 'A' },
    { value: 10, label: 'B' },
    { value: 100, label: 'C' },
    { value: 80, label: 'D' },
    { value: 0, label: 'E' },
  ],
  '3m': [
    { value: 25, label: 'A' },
    { value: 45, label: 'B' },
    { value: 60, label: 'C' },
    { value: 80, label: 'D' },
    { value: 40, label: 'E' },
  ],
  '1y': [
    { value: 50, label: 'A' },
    { value: 80, label: 'B' },
    { value: 70, label: 'C' },
    { value: 88, label: 'D' },
    { value: 55, label: 'E' },
  ],
};

export function BarRankingPanel() {
  const [selectedRange, setSelectedRange] = React.useState<Range>('1w');
  const currentData = productPerformanceData[selectedRange];

  const handleRangeChange = (value: string) => {
    if (
      value === '1d' ||
      value === '1w' ||
      value === '1m' ||
      value === '3m' ||
      value === '1y'
    ) {
      setSelectedRange(value);
    }
  };

  return (
    <WidgetCard>
      <WidgetHeader
        title='Product Performance'
        value='22.8%'
        badge='+8.4%'
        actionLabel='Details'
      />

      <TimeRangeToggle
        value={selectedRange}
        onValueChange={handleRangeChange}
      />

      <ChartVerticalBar
        data={currentData}
        height={158}
        minBarHeight={52}
        gap='2.5'
        barClassName='rounded-lg bg-primary'
        activeBarClassName=''
        showLabels
      />

      <div className='flex gap-3'>
        <div className='flex flex-1 flex-col items-center text-center'>
          <div className='text-base font-medium text-muted-foreground'>4.7</div>
          <div className='mt-0.5 text-xs font-normal text-foreground/40'>
            Avg. Rating
          </div>
        </div>

        <div className='relative w-0 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-border' />

        <div className='flex flex-1 flex-col items-center text-center'>
          <div className='text-base font-medium text-muted-foreground'>92%</div>
          <div className='mt-0.5 text-xs font-normal text-foreground/40'>
            Satisfaction
          </div>
        </div>

        <div className='relative w-0 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-border' />

        <div className='flex flex-1 flex-col items-center text-center'>
          <div className='text-base font-medium text-muted-foreground'>4.2%</div>
          <div className='mt-0.5 text-xs font-normal text-foreground/40'>
            Return Rate
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}
