// Reusable vertical bar chart using d3-scale for height calculations.
// Used by widget-support-analytics and widget-product-performance.

'use client';

import * as React from 'react';
import { scaleLinear } from 'd3-scale';

import { cn } from '../lib/utils.ts';

export type VerticalBarDataPoint = {
  label: string;
  value: number;
  isActive?: boolean;
};

export type ChartVerticalBarProps = {
  data: VerticalBarDataPoint[];
  /** Total chart height in px */
  height?: number;
  /** Minimum bar height in px (for zero values to still be visible) */
  minBarHeight?: number;
  /** Gap between bars (tailwind gap class value) */
  gap?: string;
  /** Default bar className */
  barClassName?: string;
  /** Active bar className */
  activeBarClassName?: string;
  /** Whether to show percentage labels inside bars */
  showLabels?: boolean;
  /** Custom render for bar content */
  renderBarContent?: (item: VerticalBarDataPoint, percent: number) => React.ReactNode;
  className?: string;
};

export function ChartVerticalBar({
  data,
  height = 116,
  minBarHeight = 0,
  gap = '1.5',
  barClassName = 'rounded-md bg-border',
  activeBarClassName = 'bg-primary',
  showLabels = false,
  renderBarContent,
  className,
}: ChartVerticalBarProps) {
  const maxValue = Math.max(...data.map((d) => d.value));
  const getHeight = scaleLinear()
    .domain([0, maxValue])
    .range([minBarHeight, height]);
  const getPercent = scaleLinear().domain([0, maxValue]).range([0, 100]);

  return (
    <div
      className={cn(
        `grid auto-cols-fr grid-flow-col items-end gap-${gap}`,
        className,
      )}
      style={{ height }}
    >
      {data.map((item) => (
        <div
          key={item.label}
          className={cn(
            'origin-bottom transition-all',
            barClassName,
            item.isActive && activeBarClassName,
          )}
          style={{
            height: getHeight(item.value),
            transitionProperty: 'height, background-color',
            transitionDuration: '.6s, .2s',
            transitionTimingFunction: 'cubic-bezier(.6,.6,0,1)',
          }}
        >
          {renderBarContent
            ? renderBarContent(item, getPercent(item.value))
            : showLabels && (
                <div className='flex h-full flex-col items-center justify-between py-2 text-center text-xs font-medium text-primary-foreground'>
                  <span>{getPercent(item.value).toFixed(0)}%</span>
                  <span>{item.label}</span>
                </div>
              )}
        </div>
      ))}
    </div>
  );
}
