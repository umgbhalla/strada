// Pill-style toggle group for switching between categories/tabs.
// Used across widgets for filtering by category (technical/billing, delivered/in-transit, etc.)

'use client';

import * as React from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';

import { cn } from '@/utils/cn';

export type ChipToggleItem = {
  value: string;
  label: string;
};

export type ChipToggleGroupProps = {
  items: ChipToggleItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Gap between items */
  gap?: string;
  className?: string;
};

export function ChipToggleGroup({
  items,
  value,
  onValueChange,
  className,
}: ChipToggleGroupProps) {
  return (
    <ToggleGroup.Root
      type='single'
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v);
      }}
      className={cn('flex flex-wrap gap-1.5', className)}
    >
      {items.map((item) => (
        <ToggleGroup.Item
          key={item.value}
          value={item.value}
          className={cn(
            'flex h-7 items-center justify-center rounded-lg bg-muted px-2.5 text-sm font-medium text-muted-foreground',
            'transition duration-200 ease-out',
            'data-[state=on]:bg-primary/10 data-[state=on]:text-primary',
          )}
        >
          {item.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
