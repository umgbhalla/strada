// Reusable area chart component wrapping recharts.

'use client';

import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

export type AreaChartDataPoint = {
  date: string;
  [key: string]: string | number;
};

export type AreaConfig = {
  dataKey: string;
  stroke?: string;
  strokeWidth?: number;
  fill: string;
  fillOpacity?: number;
  type?: 'linear' | 'monotone' | 'step';
};

export type ChartAreaProps = {
  data: AreaChartDataPoint[];
  areas: AreaConfig[];
  height?: number | string;
  showXAxis?: boolean;
  xAxisFormatter?: (value: string) => string;
  xAxisHeight?: number;
  xAxisTickMargin?: number;
  xAxisClassName?: string;
  yDomain?: [string | number, string | number];
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  className?: string;
};

export function ChartArea({
  data,
  areas,
  height = 108,
  showXAxis = false,
  xAxisFormatter,
  xAxisHeight = 24,
  xAxisTickMargin = 8,
  xAxisClassName,
  yDomain = [0, 'auto'],
  margin = { top: 0, right: 0, left: 0, bottom: 0 },
  className,
}: ChartAreaProps) {
  return (
    <ResponsiveContainer width='100%' height={height as number} className={className}>
      <AreaChart data={data} margin={margin}>
        <XAxis
          dataKey='date'
          type='category'
          axisLine={false}
          tickLine={false}
          hide={!showXAxis}
          tickFormatter={xAxisFormatter}
          interval='preserveEnd'
          minTickGap={20}
          tickMargin={xAxisTickMargin}
          height={xAxisHeight}
          className={xAxisClassName}
        />
        <YAxis hide domain={yDomain} />
        {areas.map((area) => (
          <Area
            key={area.dataKey}
            type={area.type ?? 'linear'}
            dataKey={area.dataKey}
            stroke={area.stroke ?? 'none'}
            strokeWidth={area.strokeWidth ?? 0}
            fill={area.fill}
            fillOpacity={area.fillOpacity ?? 1}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
