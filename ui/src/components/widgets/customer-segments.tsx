'use client';

import * as React from 'react';

import * as Tooltip from '@/components/alignui/tooltip';
import IconInfoCustom from '@/components/icons/icon-info-custom-fill';
import { LegendDot } from '@/components/legend-dot';
import PieChart from '@/components/pie-chart';
import { WidgetCard } from '@/components/widget-card';

const segmentsData = [
  {
    id: 'premium',
    name: 'Premium',
    fill: 'fill-primary',
    bg: 'bg-primary',
    value: 6450,
  },
  {
    id: 'regular',
    name: 'Regular',
    fill: 'fill-yellow-500',
    bg: 'bg-yellow-500',
    value: 5320,
  },
  {
    id: 'new',
    name: 'New',
    fill: 'fill-success',
    bg: 'bg-success',
    value: 3280,
  },
  {
    id: 'others',
    name: 'Others',
    fill: 'fill-muted',
    bg: 'bg-muted',
    value: 2880,
  },
];

function CustomerSegmentsContent({ circleSize }: { circleSize?: number }) {
  const totalValue = segmentsData.reduce(
    (sum, segment) => sum + segment.value,
    0,
  );

  const segmentsWithPercentage = segmentsData.map((segment) => ({
    ...segment,
    percentage: Math.round((segment.value / totalValue) * 100),
  }));

  return (
    <>
      <div className='flex items-start gap-2'>
        <div className='flex-1'>
          <div className='flex items-center gap-1'>
            <div className='text-sm font-medium text-muted-foreground'>
              Customer Segments
            </div>
            <Tooltip.Root>
              <Tooltip.Trigger>
                <IconInfoCustom className='size-5 text-foreground/25' />
              </Tooltip.Trigger>
              <Tooltip.Content className='max-w-80'>
                Overview of customer types based on their purchasing behavior
                and value to the business.
              </Tooltip.Content>
            </Tooltip.Root>
          </div>
        </div>

        <div className='text-sm font-medium text-muted-foreground'>
          <span className='text-success'>+5.8%</span> vs last week
        </div>
      </div>

      <div className='flex items-center gap-6'>
        <PieChart data={segmentsData} circleSize={circleSize} />

        <div className='flex flex-1 flex-col gap-[13px]'>
          {segmentsWithPercentage
            .filter((s) => s.id !== 'others')
            .map((s) => (
              <div
                key={s.id}
                className='flex items-center justify-between gap-1'
              >
                <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                  <LegendDot className={s.bg} />
                  {s.name}
                </div>

                <div className='flex items-center gap-1.5 tabular-nums'>
                  <div className='text-sm font-medium text-muted-foreground'>
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 0,
                    }).format(s.value)}
                  </div>
                  <div className='text-sm font-normal text-foreground/25'>
                    ·
                  </div>
                  <div className='text-sm font-normal text-foreground/40'>
                    {s.percentage}%
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

export function CustomerSegments() {
  return (
    <div className='relative flex w-full flex-col gap-5'>
      <CustomerSegmentsContent />
    </div>
  );
}

export function WidgetCustomerSegments() {
  return (
    <WidgetCard>
      <CustomerSegmentsContent circleSize={98} />
    </WidgetCard>
  );
}
