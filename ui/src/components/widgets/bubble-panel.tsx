// Generic bubble chart panel with repeated legend metric rows.

'use client';

import * as React from 'react';

import BubbleChart, { BubbleDataPoint } from '@/components/bubble-chart';
import IconArrowTrendDown from '@/components/icons/arrow-trend-down';
import IconArrowTrendUp from '@/components/icons/arrow-trend-up';
import { LegendDot } from '@/components/legend-dot';
import { WidgetHeader } from '@/components/widget-card';

export type BubblePanelDataItem = BubbleDataPoint & {
  label: string;
  value: string;
  change: string;
  direction: 'up' | 'down';
  dotClassName: string;
};

export type BubblePanelProps = Pick<
  React.ComponentProps<typeof WidgetHeader>,
  'title' | 'value' | 'badge' | 'badgeColor' | 'actionLabel' | 'action'
> & {
  data: BubblePanelDataItem[];
};

export function BubblePanel({
  title,
  value,
  badge,
  badgeColor,
  actionLabel,
  action,
  data,
}: BubblePanelProps) {
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

      <div className='flex justify-center'>
        <BubbleChart data={data} width={312} height={156} />
      </div>

      <div className='flex w-full flex-col gap-3.5'>
        {data.map((item) => {
          const TrendIcon = item.direction === 'up' ? IconArrowTrendUp : IconArrowTrendDown;
          return (
            <div key={item.label} className='flex items-center gap-1.5'>
              <div className='flex size-5 shrink-0 items-center justify-center'>
                <LegendDot className={item.dotClassName} />
              </div>
              <div className='flex-1 text-sm font-medium text-muted-foreground'>{item.label}</div>

              <div className='flex items-center gap-2'>
                <div className='min-w-11 text-sm font-medium text-muted-foreground'>
                  {item.value}
                </div>
                <div className='text-sm font-normal text-foreground/25'>·</div>
                <div className='flex min-w-16 items-center justify-end gap-2 pl-0.5 text-right'>
                  <TrendIcon className='size-[9px]' />
                  <div className='text-sm font-medium text-muted-foreground'>{item.change}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
