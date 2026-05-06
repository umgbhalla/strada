// Generic geography panel with selectable map locations and demographic rows.

'use client';

import * as React from 'react';
import { WidgetHeader } from '@strada.sh/ui/src/components/widget-card.tsx';

if (typeof window !== 'undefined') {
  void import('leaflet/dist/leaflet.css');
}

const GeographyMap = React.lazy(() =>
  import('./geography-map').then((mod) => ({ default: mod.GeographyMap })),
);

export interface LocationData {
  id: number;
  lat: number;
  lng: number;
  value: number;
  label: string;
  icon: React.ReactNode;
  demographics: { label: string; value: number }[];
}

export type GeographyPanelProps = Pick<
  React.ComponentProps<typeof WidgetHeader>,
  'title' | 'actionLabel' | 'action'
> & {
  data: LocationData[];
  initialHighlightedId?: number;
};

export function GeographyPanel({
  title,
  actionLabel,
  action,
  data,
  initialHighlightedId,
}: GeographyPanelProps) {
  const [highlightedId, setHighlightedId] = React.useState<number>(
    initialHighlightedId ?? data[0]!.id,
  );
  const highlightedLocation = data.find(
    (location) => location.id === highlightedId,
  )!;

  return (
    <div className='flex h-full flex-col gap-4'>
      <WidgetHeader
        title={title}
        value={highlightedLocation.value.toLocaleString()}
        badge={
          <span className='flex items-center gap-1'>
            <span className='shrink-0 text-sm leading-none'>{highlightedLocation.icon}</span>
            {highlightedLocation.label}
          </span>
        }
        badgeColor='gray'
        actionLabel={actionLabel}
        action={action}
      />

      <div className='flex h-7 w-full items-center gap-[3px] rounded-lg bg-background px-1.5 shadow-xs ring-1 ring-inset ring-border'>
        {highlightedLocation.demographics.map((demographic, index) => (
          <React.Fragment key={demographic.label}>
            {index > 0 ? <div className='text-xs font-medium text-foreground/25'>·</div> : null}
            <div className='flex-1 text-center text-xs font-medium text-foreground/40'>
              {demographic.label}{' '}
              <span className='text-muted-foreground'>
                {demographic.value}%
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className='relative h-[224px] min-h-[224px] flex-1'>
        <React.Suspense fallback={null}>
          <GeographyMap
            highlightedId={highlightedId}
            setHighlightedId={setHighlightedId}
            data={data}
          />
        </React.Suspense>
      </div>
    </div>
  );
}
