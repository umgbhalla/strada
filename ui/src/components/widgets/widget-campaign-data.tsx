'use client';

import * as React from 'react';

import { ChartArea, type AreaChartDataPoint } from '@/components/chart-area';
import { WidgetCard, WidgetHeader } from '@/components/widget-card';

export function SparkAreaPanel() {
  const generateData = (): AreaChartDataPoint[] => {
    const data: AreaChartDataPoint[] = [];
    const startDate = new Date('2023-06-01');

    for (let i = 0; i < 18; i++) {
      const currentDate = new Date(startDate);
      currentDate.setMonth(startDate.getMonth() + i);

      const value = Math.floor(Math.random() * 30) + 20;

      data.push({
        date: currentDate.toISOString().split('T')[0],
        value,
      });
    }

    return data;
  };

  const data = generateData();

  return (
    <WidgetCard className='gap-0 overflow-hidden p-0'>
      <WidgetHeader
        className='p-5 pb-4'
        title='Campaign Data'
        value='$1,750'
        badge='Last 15 days'
        actionLabel='Details'
        tooltip={
          <>
            Monitor your campaign&apos;s budget spending. Track remaining budget and
            ensure efficient allocation for optimal campaign performance.
          </>
        }
      />

      <div className='grid h-[86px] grid-cols-2 border-t border-muted'>
        <ChartArea
          data={data}
          height='100%'
          areas={[
            {
              dataKey: 'value',
              stroke: 'var(--color-primary)',
              strokeWidth: 2,
              fill: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
            },
          ]}
        />
        <div className='flex flex-col items-start justify-end border-l-2 border-primary px-4 pb-4'>
          <div className='text-base font-medium text-foreground'>45%</div>
          <div className='text-xs font-medium text-foreground/40'>$32.9K used</div>
        </div>
      </div>
    </WidgetCard>
  );
}
