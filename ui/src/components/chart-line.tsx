// Reusable line chart component wrapping recharts.
// Provides a minimal, consistent API for rendering line charts across widgets.

'use client';

import * as React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '@/utils/cn';

export type LineChartDataPoint = {
  date: string;
  value: number;
};

export type ChartLineProps = {
  data: LineChartDataPoint[];
  height?: number;
  /** Line interpolation type */
  type?: 'monotone' | 'linear' | 'step';
  /** Stroke color CSS value. Defaults to primary-base */
  strokeColor?: string;
  strokeWidth?: number;
  /** Show dashed cartesian grid */
  showGrid?: boolean;
  /** Show horizontal grid lines only (no vertical) */
  gridVertical?: boolean;
  /** Custom grid classname for styling overrides */
  gridClassName?: string;
  /** Custom className for the LineChart root */
  className?: string;
  /** Animation duration in ms. 0 to disable */
  animationDuration?: number;
  /** Y-axis domain config */
  yDomain?: [string | number, string | number];
  /** Margin overrides */
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
};

export function ChartLine({
  data,
  height = 108,
  type = 'monotone',
  strokeColor = 'var(--color-primary)',
  strokeWidth = 2,
  showGrid = false,
  gridVertical = true,
  gridClassName,
  className,
  animationDuration = 400,
  yDomain = ['dataMin', 'dataMax'],
  margin = { top: 2, right: 0, left: 0, bottom: 2 },
}: ChartLineProps) {
  return (
    <ResponsiveContainer width='100%' height={height}>
      <LineChart data={data} margin={margin} className={className}>
        {showGrid && (
          <CartesianGrid
            strokeDasharray='4 4'
            className={cn('stroke-border', gridClassName)}
            vertical={gridVertical}
          />
        )}
        <XAxis hide dataKey='date' type='category' />
        <YAxis hide type='number' dataKey='value' domain={yDomain} />
        <Line
          type={type}
          dataKey='value'
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          dot={false}
          strokeLinejoin='round'
          isAnimationActive={animationDuration > 0}
          animationDuration={animationDuration}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
