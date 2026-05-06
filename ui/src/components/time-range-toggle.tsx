// Time range toggle (1D/1W/1M/3M/1Y) using ButtonGroup + ToggleGroup.
// Used by widget-total-sales and widget-product-performance.

'use client';

import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';

import * as ButtonGroup from '@strada.sh/ui/src/components/alignui/button-group.tsx';

export type TimeRangeOption = {
  value: string;
  label: string;
};

const DEFAULT_OPTIONS: TimeRangeOption[] = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '1y', label: '1Y' },
];

export type TimeRangeToggleProps = {
  value: string;
  onValueChange: (value: string) => void;
  options?: TimeRangeOption[];
};

export function TimeRangeToggle({
  value,
  onValueChange,
  options = DEFAULT_OPTIONS,
}: TimeRangeToggleProps) {
  return (
    <ButtonGroup.Root
      size='xxsmall'
      className='grid auto-cols-fr grid-flow-col'
      asChild
    >
      <ToggleGroupPrimitive.Root
        type='single'
        value={value}
        onValueChange={(v) => {
          if (v) onValueChange(v);
        }}
      >
        {options.map((opt) => (
          <ButtonGroup.Item key={opt.value} asChild>
            <ToggleGroupPrimitive.Item value={opt.value}>
              {opt.label}
            </ToggleGroupPrimitive.Item>
          </ButtonGroup.Item>
        ))}
      </ToggleGroupPrimitive.Root>
    </ButtonGroup.Root>
  );
}
