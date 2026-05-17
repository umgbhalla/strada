// Donut chart panel with legend rows.
// Accepts simple { label, value }[] data with auto-assigned colors.

'use client';

import { use } from 'react';
import * as React from 'react';

import { LegendDot } from '@ui/components/legend-dot.tsx';
import PieChart from '@ui/components/pie-chart.tsx';
import { ShowMore } from '@ui/components/show-more.tsx';
import { WidgetHeader } from '@ui/components/widget-card.tsx';

import { FILL_CLASSES, DOT_CLASSES } from '../../lib/chart-colors.ts';

// ── Types ────────────────────────────────────────────────────────

type DataItem = { label: string; value: number };

export type DonutPanelProps = Pick<
  React.ComponentProps<typeof WidgetHeader>,
  'title' | 'value' | 'badge' | 'badgeColor' | 'description' | 'tooltip' | 'actionLabel' | 'action'
> & {
  data: DataItem[] | Promise<DataItem[]>;
  formatValue?: (value: number) => string;
};

// ── Helpers ─────────────────────────────────────────────────────

function resolveData<T>(data: T | Promise<T>): T {
  if (data && typeof data === 'object' && 'then' in data) {
    return use(data as Promise<T>);
  }
  return data;
}

const DEFAULT_FMT = new Intl.NumberFormat('en-US');

// ── Component ───────────────────────────────────────────────────

export function DonutPanel({
  title,
  value,
  badge,
  badgeColor,
  description,
  tooltip,
  actionLabel,
  action,
  data: rawData,
  formatValue,
}: DonutPanelProps) {
  const data = resolveData(rawData);
  const fmt = formatValue ?? ((v: number) => DEFAULT_FMT.format(v));

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  const segments = data.map((item, i) => ({
    ...item,
    id: item.label,
    fillClassName: FILL_CLASSES[i % FILL_CLASSES.length]!,
    dotClassName: DOT_CLASSES[i % DOT_CLASSES.length]!,
    percentage: Math.round((item.value / totalValue) * 100),
  }));

  const chartData = segments.map((s) => ({
    id: s.id,
    value: s.value,
    fill: s.fillClassName,
  }));

  return (
    <ShowMore maxHeight={200}>
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

      <div className='mt-4 flex items-start gap-4'>
        <PieChart data={chartData} circleSize={98} className='shrink-0' />

        <div className='grid min-w-0 flex-1 grid-cols-[12px_1fr_auto_auto_auto] items-center gap-x-1.5 gap-y-2'>
          {segments.map((s) => (
            <React.Fragment key={s.id}>
              <LegendDot className={s.dotClassName} />
              <div className='truncate text-sm font-medium text-muted-foreground'>
                {s.label}
              </div>
              <div className='text-right text-sm font-medium tabular-nums text-muted-foreground'>
                {fmt(s.value)}
              </div>
              <div className='text-sm font-normal text-foreground/25'>·</div>
              <div className='text-sm font-normal tabular-nums text-foreground/40'>
                {s.percentage}%
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </ShowMore>
  );
}
