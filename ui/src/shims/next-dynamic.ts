// Shim for next/dynamic. Handles ssr:false by rendering nothing on the server
// and lazy-loading the component on the client.

'use client';

import { lazy, Suspense, createElement, useState, useEffect } from 'react';
import type { ComponentType } from 'react';

export default function dynamic<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  options?: { ssr?: boolean },
): T {
  const LazyComponent = lazy(loader);
  const ssrDisabled = options?.ssr === false;

  const Wrapper = (props: any) => {
    const [mounted, setMounted] = useState(!ssrDisabled);
    useEffect(() => {
      if (!mounted) setMounted(true);
    }, []);
    if (!mounted) return null;
    return createElement(Suspense, { fallback: null }, createElement(LazyComponent, props));
  };
  return Wrapper as unknown as T;
}
