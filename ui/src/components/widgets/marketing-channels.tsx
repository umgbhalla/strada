'use client';

import * as React from 'react';
import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiFocus2Line,
  RiTimeLine,
  RiUser6Line,
} from '@remixicon/react';

import * as Button from '@/components/alignui/button';
import * as Tooltip from '@/components/alignui/tooltip';
import { CategoryBarChart } from '@/components/chart-category-bar';
import { DashedDivider } from '@/components/dashed-divider';
import IconInfoCustom from '@/components/icons/icon-info-custom-fill';
import { WidgetCard } from '@/components/widget-card';

const channelsData = [
  { label: 'Organic Search', value: 45 },
  { label: 'Social Media', value: 40 },
  { label: 'Direct', value: 15 },
];

function MarketingChannelsContent({
  categoryBarClassName,
  dashedDividerClassName,
}: {
  categoryBarClassName?: string;
  dashedDividerClassName?: string;
}) {
  return (
    <div className='relative flex w-full flex-col gap-5'>
      <div className='flex items-start gap-2'>
        <div className='flex-1'>
          <div className='flex items-center gap-1'>
            <div className='text-sm font-medium text-muted-foreground'>
              Marketing Channels
            </div>
            <Tooltip.Root>
              <Tooltip.Trigger>
                <IconInfoCustom className='size-5 text-foreground/25' />
              </Tooltip.Trigger>
              <Tooltip.Content className='max-w-80'>
                Overview of your marketing channel performance metrics,
                including customer acquisition cost, conversion time and ROI.
              </Tooltip.Content>
            </Tooltip.Root>
          </div>
          <div className='mt-1 flex items-center gap-2'>
            <div className='text-2xl font-medium text-foreground'>82%</div>
            <div className='text-sm font-medium text-muted-foreground'>
              <span className='text-success'>+2.1%</span> vs last week
            </div>
          </div>
        </div>
        <Button.Root variant='neutral' mode='stroke' size='xxsmall'>
          Details
        </Button.Root>
      </div>

      <CategoryBarChart
        data={channelsData}
        categoryClassName={categoryBarClassName}
      />

      <DashedDivider className={dashedDividerClassName} />

      <table className='w-full' cellPadding={0}>
        <thead className='text-left'>
          <tr>
            <th className='text-xs font-medium text-foreground/40'>Channels</th>
            <th className='text-xs font-medium text-foreground/40'>Metric</th>
            <th className='text-xs font-medium text-foreground/40'>Total</th>
          </tr>
        </thead>
        {/* to have space between thead and tbody */}
        <tbody aria-hidden='true' className='h-4' />
        <tbody>
          <tr>
            <td>
              <div className='flex items-center gap-1.5 text-sm font-medium text-muted-foreground'>
                <RiUser6Line className='size-5 shrink-0 text-foreground/40' />
                Acquisition
              </div>
            </td>
            <td>
              <div className='text-sm font-normal text-muted-foreground'>$38.25</div>
            </td>
            <td>
              <div className='flex items-center gap-0.5 text-sm font-normal text-muted-foreground'>
                <RiArrowUpLine className='size-5 shrink-0 text-success' />
                +5.2%
              </div>
            </td>
          </tr>
          <tr aria-hidden='true'>
            <td colSpan={999} className='h-4' />
          </tr>
          <tr>
            <td>
              <div className='flex items-center gap-1.5 text-sm font-medium text-muted-foreground'>
                <RiTimeLine className='size-5 shrink-0 text-foreground/40' />
                Conversion
              </div>
            </td>
            <td>
              <div className='text-sm font-normal text-muted-foreground'>
                4.2 days
              </div>
            </td>
            <td>
              <div className='flex items-center gap-0.5 text-sm font-normal text-muted-foreground'>
                <RiArrowDownLine className='size-5 shrink-0 text-destructive' />
                +3.8%
              </div>
            </td>
          </tr>
          <tr aria-hidden='true'>
            <td colSpan={999} className='h-4' />
          </tr>
          <tr>
            <td>
              <div className='flex items-center gap-1.5 text-sm font-medium text-muted-foreground'>
                <RiFocus2Line className='size-5 shrink-0 text-foreground/40' />
                ROI
              </div>
            </td>
            <td>
              <div className='text-sm font-normal text-muted-foreground'>324%</div>
            </td>
            <td>
              <div className='flex items-center gap-0.5 text-sm font-normal text-muted-foreground'>
                <RiArrowUpLine className='size-5 shrink-0 text-success' />
                +4.5%
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <Button.Root variant='neutral' mode='stroke' size='xsmall'>
        View reports
      </Button.Root>
    </div>
  );
}

export function MarketingChannels() {
  return <MarketingChannelsContent />;
}

export function WidgetMarketingChannels() {
  return (
    <WidgetCard>
      <MarketingChannelsContent categoryBarClassName='h-3' dashedDividerClassName='h-1' />
    </WidgetCard>
  );
}
