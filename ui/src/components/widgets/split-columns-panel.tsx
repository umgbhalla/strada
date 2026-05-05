// Generic split-column metric panel with one repeated column per data item.

'use client';

import * as React from 'react';
import { RiArrowLeftDownLine, RiArrowRightUpLine } from '@remixicon/react';

import * as Divider from '@/components/alignui/divider';
import { WidgetHeader } from '@/components/widget-card';

import { DashedDividerVertical } from '../dashed-divider';

export type SplitColumnsPanelDataItem = {
  label: string;
  value: string;
  change: string;
  direction: 'up' | 'down';
  colorClassName: string;
};

export type SplitColumnsPanelProps = Pick<
  React.ComponentProps<typeof WidgetHeader>,
  'title' | 'value' | 'badge' | 'badgeColor' | 'actionLabel' | 'action'
> & {
  data: SplitColumnsPanelDataItem[];
};

export function SplitColumnsPanel({
  title,
  value,
  badge,
  badgeColor,
  actionLabel,
  action,
  data,
}: SplitColumnsPanelProps) {
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

      <div className='flex gap-4'>
        {data.map((item, index) => {
          const TrendIcon = item.direction === 'up' ? RiArrowRightUpLine : RiArrowLeftDownLine;
          return (
            <React.Fragment key={item.label}>
              {index > 0 ? <DashedDividerVertical /> : null}
              <div className='flex h-60 flex-1 flex-col gap-4'>
                <div className='w-full flex-1'>
                  <div className='text-sm font-medium text-foreground/40'>{item.label}</div>
                  <div className='mt-1 text-xl font-medium text-foreground'>{item.value}</div>
                </div>
                <div className='flex items-center gap-0.5'>
                  <div className='text-sm font-medium text-muted-foreground'>{item.change}</div>
                  <TrendIcon className={item.direction === 'up' ? 'size-5 text-success' : 'size-5 text-destructive'} />
                </div>
                <div className={`h-2 w-full rounded-xs ${item.colorClassName}`} />
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}
