// Shared dashboard widget header used by generic widget panels.

import type * as React from 'react';

import { cn } from '@strada.sh/ui/src/utils/cn';
import * as Badge from '@strada.sh/ui/src/components/alignui/badge';
import * as Button from '@strada.sh/ui/src/components/alignui/button';
import * as Tooltip from '@strada.sh/ui/src/components/alignui/tooltip';
import IconInfoCustom from '@strada.sh/ui/src/components/icons/icon-info-custom-fill';

type WidgetHeaderProps = {
  title: React.ReactNode;
  value?: React.ReactNode;
  badge?: React.ReactNode;
  badgeColor?: React.ComponentProps<typeof Badge.Root>['color'];
  description?: React.ReactNode;
  tooltip?: React.ReactNode;
  actionLabel?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function WidgetHeader({
  title,
  value,
  badge,
  badgeColor = 'green',
  description,
  tooltip,
  actionLabel,
  action,
  className,
}: WidgetHeaderProps) {
  const hasMeta = value != null || badge != null || description != null;

  return (
    <div className={cn('flex items-start gap-2', className)}>
      <div className='flex-1'>
        <div className='flex items-center gap-1'>
          <div className='text-sm font-medium text-muted-foreground'>{title}</div>
          {tooltip != null ? (
            <Tooltip.Root>
              <Tooltip.Trigger>
                <IconInfoCustom className='size-5 text-foreground/25' />
              </Tooltip.Trigger>
              <Tooltip.Content className='max-w-80'>{tooltip}</Tooltip.Content>
            </Tooltip.Root>
          ) : null}
        </div>
        {hasMeta ? (
          <div className='mt-1 flex items-center gap-2'>
            {value != null ? (
              <div className='text-2xl font-medium text-foreground'>{value}</div>
            ) : null}
            {badge != null ? (
              <Badge.Root variant='light' color={badgeColor} size='medium'>
                {badge}
              </Badge.Root>
            ) : null}
            {description != null ? (
              <div className='text-sm font-medium text-muted-foreground'>
                {description}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {action ??
        (actionLabel != null ? (
          <Button.Root variant='neutral' mode='stroke' size='xxsmall'>
            {actionLabel}
          </Button.Root>
        ) : null)}
    </div>
  );
}
