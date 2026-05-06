// Generic ranked bar panel with selectable ranges and summary stats.

'use client';

import * as React from 'react';

import { ChartVerticalBar, type VerticalBarDataPoint } from '@strada.sh/ui/src/components/chart-vertical-bar.tsx';
import { TimeRangeToggle } from '@strada.sh/ui/src/components/time-range-toggle.tsx';
import { WidgetHeader } from '@strada.sh/ui/src/components/widget-card.tsx';

export type BarRankingPanelRange = '1d' | '1w' | '1m' | '3m' | '1y';

export type BarRankingPanelStat = {
  label: string;
  value: string;
};

export type BarRankingPanelProps = Pick<
  React.ComponentProps<typeof WidgetHeader>,
  'title' | 'value' | 'badge' | 'badgeColor' | 'actionLabel' | 'action'
> & {
  data: Record<BarRankingPanelRange, VerticalBarDataPoint[]>;
  stats: BarRankingPanelStat[];
  defaultRange?: BarRankingPanelRange;
};

export function BarRankingPanel({
  title,
  value,
  badge,
  badgeColor,
  actionLabel,
  action,
  data,
  stats,
  defaultRange = '1w',
}: BarRankingPanelProps) {
  const [selectedRange, setSelectedRange] = React.useState<BarRankingPanelRange>(defaultRange);
  const currentData = data[selectedRange];

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
    <>
      <WidgetHeader
        title={title}
        value={value}
        badge={badge}
        badgeColor={badgeColor}
        actionLabel={actionLabel}
        action={action}
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
        {stats.map((stat, index) => (
          <React.Fragment key={stat.label}>
            {index > 0 ? <div className='relative w-0 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-border' /> : null}
            <div className='flex flex-1 flex-col items-center text-center'>
              <div className='text-base font-medium text-muted-foreground'>{stat.value}</div>
              <div className='mt-0.5 text-xs font-normal text-foreground/40'>
                {stat.label}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    </>
  );
}
