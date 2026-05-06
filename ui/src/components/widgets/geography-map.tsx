'use client';

import * as React from 'react';
import MyMapString from '@strada.sh/ui/src/map.json';
import {
  RiAddLine,
  RiExpandLeftRightLine,
  RiSubtractLine,
} from '@remixicon/react';
import DottedMap from 'dotted-map/without-countries';
import type { LatLngBoundsExpression, LatLngExpression, LatLngTuple } from 'leaflet';
import { useIsDark } from '../../lib/utils.ts';
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  useMap,
  useMapEvent,
} from 'react-leaflet';

import * as CompactButton from '@strada.sh/ui/src/components/alignui/compact-button.tsx';

import type { LocationData } from './geography-panel';

const CustomMapControls = () => {
  const map = useMap();
  // const [zoom, setZoom] = React.useState(map.getZoom());
  // const maxZoom = map.getMaxZoom();
  // const minZoom = map.getMinZoom();

  // React.useEffect(() => {
  //   const handleZoomEnd = () => {
  //     setZoom(map.getZoom());
  //   };

  //   map.on('zoomend', handleZoomEnd);
  //   return () => {
  //     map.off('zoomend', handleZoomEnd);
  //   };
  // }, [map]);

  return (
    <div className='absolute bottom-0 left-5 z-999 flex flex-col gap-2'>
      <CompactButton.Root
        onClick={() => map.zoomIn()}
        // disabled={zoom >= maxZoom}
        aria-label='Zoom in'
      >
        <CompactButton.Icon as={RiAddLine} />
      </CompactButton.Root>
      <CompactButton.Root
        onClick={() => map.zoomOut()}
        // disabled={zoom <= minZoom}
        aria-label='Zoom out'
      >
        <CompactButton.Icon as={RiSubtractLine} />
      </CompactButton.Root>
    </div>
  );
};

const CenterControl = ({ center }: { center: LatLngTuple }) => {
  const map = useMap();
  const [isOffCenter, setIsOffCenter] = React.useState(false);

  // Check if map is centered
  const checkCenter = React.useCallback(() => {
    const currentCenter = map.getCenter();
    const targetCenter = center;
    const threshold = 0.1; // Degree threshold for considering map "off center"

    const isOff =
      Math.abs(currentCenter.lat - targetCenter[0]) > threshold ||
      Math.abs(currentCenter.lng - targetCenter[1]) > threshold;

    setIsOffCenter(isOff);
  }, [map, center]);

  useMapEvent('moveend', checkCenter);
  useMapEvent('zoomend', checkCenter);

  if (!isOffCenter) return null;

  return (
    <CompactButton.Root
      onClick={() => {
        map.setView(center, map.getZoom(), { animate: true });
      }}
      aria-label='Center map'
      className='absolute bottom-0 right-5 z-999'
    >
      <CompactButton.Icon as={RiExpandLeftRightLine} />
    </CompactButton.Root>
  );
};

const dotMap = new DottedMap({ map: MyMapString as any });
const { region } = dotMap.image;

const mapBounds: LatLngBoundsExpression = [
  [region.lat.min, region.lng.min],
  [region.lat.max, region.lng.max],
];

const DottedMapOverlay = React.memo(() => {
  const isDark = useIsDark();

  const svgMap = React.useMemo(() => {
    return dotMap.getSVG({
      radius: 0.24,
      color: isDark ? '#5C5C5C' : '#D1D1D1',
      shape: 'circle',
      backgroundColor: isDark ? '#171717' : '#fff',
    });
  }, [isDark]);

  return (
    <>
      <ImageOverlay
        url={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
        bounds={mapBounds}
      />
    </>
  );
});

DottedMapOverlay.displayName = 'DottedMapOverlay';

export function GeographyMap({
  data,
  highlightedId,
  setHighlightedId,
}: {
  data: LocationData[];
  highlightedId: number;
  setHighlightedId: React.Dispatch<React.SetStateAction<number>>;
}) {
  const calculatedBounds = React.useMemo<[[number, number], [number, number]]>(() => {
    const lats = data.map((p) => p.lat);
    const lngs = data.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return [
      [minLat, minLng],
      [maxLat, maxLng],
    ];
  }, [data]);

  const mapCenter = React.useMemo<LatLngTuple>(
    () => [
      (calculatedBounds[0][0] + calculatedBounds[1][0]) / 2,
      (calculatedBounds[0][1] + calculatedBounds[1][1]) / 2,
    ],
    [calculatedBounds],
  );

  return (
    <MapContainer
      center={mapCenter}
      bounds={mapBounds}
      maxZoom={4}
      zoom={3}
      minZoom={3}
      attributionControl={false}
      zoomControl={false}
      dragging
      className='h-full w-full bg-background!'
      style={{ height: 224, width: '100%' }}
    >
      <CustomMapControls />
      <CenterControl center={mapCenter} />
      <DottedMapOverlay />
      {data.map((location) => (
        <React.Fragment key={location.id}>
          {location.id !== highlightedId ? (
            <>
              <CircleMarker
                center={[location.lat, location.lng]}
                radius={10}
                pathOptions={{
                  fillColor: 'var(--color-border)',
                  weight: 0,
                  fillOpacity: 1,
                }}
                eventHandlers={{
                  click: () => {
                    setHighlightedId(location.id);
                  },
                }}
              />
              <CircleMarker
                center={[location.lat, location.lng]}
                radius={8}
                pathOptions={{
                  fillColor: 'var(--color-background)',
                  weight: 0,
                  fillOpacity: 1,
                }}
                className='pointer-events-none!'
              />
              <CircleMarker
                center={[location.lat, location.lng]}
                radius={4}
                pathOptions={{
                  fillColor: 'color-mix(in srgb, var(--color-foreground) 40%, transparent)',
                  weight: 0,
                  fillOpacity: 1,
                }}
                className='pointer-events-none!'
              />
            </>
          ) : (
            <>
              <CircleMarker
                center={[location.lat, location.lng]}
                radius={16}
                pathOptions={{
                  fillColor: 'color-mix(in srgb, var(--color-primary) 24%, transparent)',
                  weight: 0,
                  fillOpacity: 1,
                }}
                eventHandlers={{
                  click: () => setHighlightedId(location.id),
                }}
              />
              <CircleMarker
                center={[location.lat, location.lng]}
                radius={10}
                pathOptions={{
                  fillColor: 'var(--color-primary)',
                  weight: 0,
                  fillOpacity: 1,
                }}
                className='pointer-events-none!'
              />
              <CircleMarker
                center={[location.lat, location.lng]}
                radius={8}
                pathOptions={{
                  fillColor: 'var(--color-background)',
                  weight: 0,
                  fillOpacity: 1,
                }}
                className='pointer-events-none!'
              />
              <CircleMarker
                center={[location.lat, location.lng]}
                radius={4}
                pathOptions={{
                  fillColor: 'var(--color-primary)',
                  weight: 0,
                  fillOpacity: 1,
                }}
                className='pointer-events-none!'
              />
            </>
          )}
        </React.Fragment>
      ))}
    </MapContainer>
  );
}
