// Reusable cohort retention heatmap.
// Renders triangular cohort data where each row can have fewer cells than the full label count.

'use client';

import * as React from 'react';

import { cn } from '@/utils/cn';

export function ChartRetentionHeatmap({
  data,
  labels,
  className,
}: {
  data: number[][];
  labels?: React.ReactNode[];
  className?: string;
}) {
  const columnCount = labels?.length ?? Math.max(...data.map((row) => row.length));

  return (
    <div className={className}>
      <table className='-m-px h-[194px] w-full border-collapse' cellPadding={0}>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((value, colIndex) => (
                <td
                  key={colIndex}
                  className='p-px'
                  suppressHydrationWarning
                  data-value={value}
                >
                  <div
                    className='h-full w-full rounded-[1px] bg-primary'
                    suppressHydrationWarning
                    style={{ opacity: value / 100 }}
                  />
                </td>
              ))}
              {Array.from({ length: columnCount - row.length }).map((_, i) => (
                <td key={`empty-${i}`} className='p-px'>
                  <div className='h-full w-full rounded-[1px]' />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {labels && (
        <div className='flex w-full gap-0.5 text-center text-xs font-medium text-foreground/40'>
          {labels.map((label, i) => (
            <div key={i} className='flex-1 pt-3'>
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
