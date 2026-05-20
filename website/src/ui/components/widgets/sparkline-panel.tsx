// Generic sparkline panel using ECharts with built-in legend.
//
// Imports echarts internally so no module instance crosses the RSC boundary.
// Accepts data as T or Promise<T> for RSC streaming via use().

'use client';

import { use } from 'react';

import { TimeseriesChart, type TimeseriesItem } from 'strada-website/src/ui/components/timeseries-chart.tsx';
import { WidgetHeader } from 'strada-website/src/ui/components/widget-card.tsx';

export type SparklinePanelProps = Pick<
  React.ComponentProps<typeof WidgetHeader>,
  'title' | 'value' | 'badge' | 'badgeColor' | 'actionLabel' | 'action'
> & {
  data: TimeseriesItem[] | Promise<TimeseriesItem[]>;
  gradient?: boolean;
};

function resolveData<T>(data: T | Promise<T>): T {
  if (data && typeof data === 'object' && 'then' in data) {
    return use(data as Promise<T>);
  }
  return data;
}

export function SparklinePanel({
  title,
  value,
  badge,
  badgeColor,
  actionLabel,
  action,
  data: rawData,
  gradient,
}: SparklinePanelProps) {
  const data = resolveData(rawData);

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

      <TimeseriesChart
        data={data}
        height="100%"
        gradient={gradient}
        legend
        className="min-h-0 grow"
      />
    </>
  );
}
