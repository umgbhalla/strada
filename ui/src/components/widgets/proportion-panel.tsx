// Generic proportion bar panel with configurable summary rows and footer action.

'use client';

import * as React from 'react';
import {
  RiArrowDownLine,
  RiArrowUpLine,
} from '@remixicon/react';

import * as Button from '@strada.sh/ui/src/components/alignui/button';
import { CategoryBarChart } from '@strada.sh/ui/src/components/chart-category-bar';
import { DashedDivider } from '@strada.sh/ui/src/components/dashed-divider';
import { WidgetHeader } from '@strada.sh/ui/src/components/widget-card';

export type ProportionPanelDataItem = {
  label: string;
  value: number;
};

export type ProportionPanelRow = {
  label: string;
  value: string;
  change: string;
  direction: 'up' | 'down';
  icon: React.ComponentType<{ className?: string }>;
};

export type ProportionPanelProps = Pick<
  React.ComponentProps<typeof WidgetHeader>,
  'title' | 'value' | 'badge' | 'badgeColor' | 'description' | 'tooltip' | 'actionLabel' | 'action'
> & {
  data: ProportionPanelDataItem[];
  rows: ProportionPanelRow[];
  tableHeaders?: [React.ReactNode, React.ReactNode, React.ReactNode];
  footerActionLabel?: React.ReactNode;
  categoryBarClassName?: string;
  dashedDividerClassName?: string;
};

export function ProportionPanel({
  title,
  value,
  badge,
  badgeColor,
  description,
  tooltip,
  actionLabel,
  action,
  data,
  rows,
  tableHeaders = ['Channels', 'Metric', 'Total'],
  footerActionLabel,
  categoryBarClassName,
  dashedDividerClassName,
}: ProportionPanelProps) {
  return (
    <div className='relative flex w-full flex-col gap-5'>
      <WidgetHeader
        title={title}
        value={value}
        badge={badge}
        badgeColor={badgeColor}
        description={description}
        tooltip={tooltip}
        actionLabel={actionLabel}
        action={action}
      />

      <CategoryBarChart
        data={data}
        categoryClassName={categoryBarClassName}
      />

      <DashedDivider className={dashedDividerClassName} />

      <table className='w-full' cellPadding={0}>
        <thead className='text-left'>
          <tr>
            {tableHeaders.map((header) => (
              <th key={String(header)} className='text-xs font-medium text-foreground/40'>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        {/* to have space between thead and tbody */}
        <tbody aria-hidden='true' className='h-4' />
        <tbody>
          {rows.map((row, index) => {
            const Icon = row.icon;
            const TrendIcon = row.direction === 'up' ? RiArrowUpLine : RiArrowDownLine;
            return (
              <React.Fragment key={row.label}>
                {index > 0 ? (
                  <tr aria-hidden='true'>
                    <td colSpan={999} className='h-4' />
                  </tr>
                ) : null}
                <tr>
                  <td>
                    <div className='flex items-center gap-1.5 text-sm font-medium text-muted-foreground'>
                      <Icon className='size-5 shrink-0 text-foreground/40' />
                      {row.label}
                    </div>
                  </td>
                  <td>
                    <div className='text-sm font-normal text-muted-foreground'>{row.value}</div>
                  </td>
                  <td>
                    <div className='flex items-center gap-0.5 text-sm font-normal text-muted-foreground'>
                      <TrendIcon className={row.direction === 'up' ? 'size-5 shrink-0 text-success' : 'size-5 shrink-0 text-destructive'} />
                      {row.change}
                    </div>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {footerActionLabel != null ? (
        <Button.Root variant='neutral' mode='stroke' size='xsmall'>
          {footerActionLabel}
        </Button.Root>
      ) : null}
    </div>
  );
}
