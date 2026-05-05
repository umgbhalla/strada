'use client';

import * as React from 'react';
import { RiArrowLeftDownLine, RiArrowRightUpLine } from '@remixicon/react';

import * as Divider from '@/components/alignui/divider';
import { WidgetCard, WidgetHeader } from '@/components/widget-card';

import { DashedDividerVertical } from '../dashed-divider';

export function SplitColumnsPanel() {
  return (
    <WidgetCard>
      <WidgetHeader
        title='Total Visitors'
        value='237,456'
        badge='-1.4%'
        badgeColor='red'
        actionLabel='Report'
      />

      <Divider.Root variant='line-spacing' />

      <div className='flex gap-4'>
        <div className='flex h-60 flex-1 flex-col gap-4'>
          <div className='w-full flex-1'>
            <div className='text-sm font-medium text-foreground/40'>Desktop</div>
            <div className='mt-1 text-xl font-medium text-foreground'>27%</div>
          </div>
          <div className='flex items-center gap-0.5'>
            <div className='text-sm font-medium text-muted-foreground'>-3.2%</div>
            <RiArrowLeftDownLine className='size-5 text-destructive' />
          </div>
          <div className='h-2 w-full rounded-xs bg-yellow-500' />
        </div>
        <DashedDividerVertical />
        <div className='flex h-60 flex-1 flex-col gap-4'>
          <div className='w-full flex-1'>
            <div className='text-sm font-medium text-foreground/40'>Tablet</div>
            <div className='mt-1 text-xl font-medium text-foreground'>12%</div>
          </div>
          <div className='flex items-center gap-0.5'>
            <div className='text-sm font-medium text-muted-foreground'>-6.4%</div>
            <RiArrowLeftDownLine className='size-5 text-destructive' />
          </div>
          <div className='h-2 w-full rounded-xs bg-sky-500' />
        </div>
        <DashedDividerVertical />
        <div className='flex h-60 flex-1 flex-col gap-4'>
          <div className='w-full flex-1'>
            <div className='text-sm font-medium text-foreground/40'>Mobile</div>
            <div className='mt-1 text-xl font-medium text-foreground'>61%</div>
          </div>
          <div className='flex items-center gap-0.5'>
            <div className='text-sm font-medium text-muted-foreground'>+0.8%</div>
            <RiArrowRightUpLine className='size-5 text-success' />
          </div>
          <div className='h-2 w-full rounded-xs bg-purple-500' />
        </div>
      </div>
    </WidgetCard>
  );
}
