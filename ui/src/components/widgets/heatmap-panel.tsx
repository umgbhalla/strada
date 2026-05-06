// Generic cohort-style heatmap panel with configurable labels and caption.

'use client';

import * as React from 'react';

import { ChartRetentionHeatmap } from '@strada.sh/ui/src/components/chart-retention-heatmap.tsx';
import IconInfoCustom from '@strada.sh/ui/src/components/icons/icon-info-custom-fill.tsx';
import { WidgetHeader } from '@strada.sh/ui/src/components/widget-card.tsx';

export type HeatmapPanelProps = Pick<
  React.ComponentProps<typeof WidgetHeader>,
  'title' | 'value' | 'badge' | 'badgeColor' | 'actionLabel' | 'action'
> & {
  data: number[][];
  labels: React.ReactNode[];
  caption?: React.ReactNode;
};

export function HeatmapPanel({
  title,
  value,
  badge,
  badgeColor,
  actionLabel,
  action,
  data,
  labels,
  caption,
}: HeatmapPanelProps) {
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

      <ChartRetentionHeatmap
        data={data}
        labels={labels}
      />

      {caption != null ? (
        <div className='flex items-center gap-1.5 rounded-lg bg-background p-1.5 ring-1 ring-inset ring-border'>
          <IconInfoCustom className='size-4 shrink-0 text-foreground/25' />
          <div className='text-xs font-normal text-muted-foreground'>
            {caption}
          </div>
        </div>
      ) : null}
    </>
  );
}
