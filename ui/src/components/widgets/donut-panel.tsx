// Generic donut chart panel with configurable legend rows.

'use client';

import * as React from 'react';

import { LegendDot } from '@strada.sh/ui/src/components/legend-dot.tsx';
import PieChart from '@strada.sh/ui/src/components/pie-chart.tsx';
import { WidgetHeader } from '@strada.sh/ui/src/components/widget-card.tsx';

export type DonutPanelDataItem = {
  id: string;
  label: string;
  value: number;
  fillClassName: string;
  dotClassName: string;
  hiddenFromLegend?: boolean;
};

export type DonutPanelProps = Pick<
  React.ComponentProps<typeof WidgetHeader>,
  'title' | 'value' | 'badge' | 'badgeColor' | 'description' | 'tooltip' | 'actionLabel' | 'action'
> & {
  data: DonutPanelDataItem[];
  circleSize?: number;
  currency?: string;
  locale?: string;
  /** Custom value formatter. When provided, overrides the default currency formatter. */
  formatValue?: (value: number) => string;
};

export function DonutPanel({
  title,
  value,
  badge,
  badgeColor,
  description,
  tooltip,
  actionLabel,
  action,
  data,
  circleSize = 98,
  currency = 'USD',
  locale = 'en-US',
  formatValue,
}: DonutPanelProps) {
  const totalValue = data.reduce(
    (sum, segment) => sum + segment.value,
    0,
  );

  const segmentsWithPercentage = data.map((segment) => ({
    ...segment,
    percentage: Math.round((segment.value / totalValue) * 100),
  }));
  const chartData = data.map((item) => ({
    id: item.id,
    value: item.value,
    fill: item.fillClassName,
  }));

  return (
    <>
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

      <div className='flex items-center gap-6'>
        <PieChart data={chartData} circleSize={circleSize} />

        <div className='flex flex-1 flex-col gap-[13px]'>
          {segmentsWithPercentage
            .filter((s) => !s.hiddenFromLegend)
            .map((s) => (
              <div
                key={s.id}
                className='flex items-center justify-between gap-1'
              >
                <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                  <LegendDot className={s.dotClassName} />
                  {s.label}
                </div>

                <div className='flex items-center gap-1.5 tabular-nums'>
                  <div className='text-sm font-medium text-muted-foreground'>
                    {formatValue
                      ? formatValue(s.value)
                      : new Intl.NumberFormat(locale, {
                          style: 'currency',
                          currency,
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
