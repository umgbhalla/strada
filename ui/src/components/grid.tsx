// Compound CSS Grid component for declarative bento and mosaic layouts.

import type { CSSProperties, ReactNode } from "react";

import { cn } from "../lib/utils.ts";

type GridSize = number | string;

export interface GridProps {
  children: ReactNode;
  columns?: number;
  gap?: GridSize;
  rowHeight?: GridSize;
  className?: string;
  style?: CSSProperties;
}

export interface GridItemProps {
  children: ReactNode;
  columnSpan?: number;
  rowSpan?: number;
  columnStart?: number | string;
  rowStart?: number | string;
  className?: string;
  style?: CSSProperties;
}

function cssSize(value: GridSize) {
  return typeof value === "number" ? `${value}px` : value;
}

function GridRoot({
  children,
  columns = 12,
  gap = 16,
  rowHeight = 120,
  className,
  style,
}: GridProps) {
  return (
    <div
      className={cn("w-full", className)}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: cssSize(rowHeight),
        gap: cssSize(gap),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function GridItem({
  children,
  columnSpan = 1,
  rowSpan = 1,
  columnStart,
  rowStart,
  className,
  style,
}: GridItemProps) {
  return (
    <div
      className={className}
      style={{
        gridColumn: `${columnStart ? `${columnStart} / ` : ""}span ${columnSpan}`,
        gridRow: `${rowStart ? `${rowStart} / ` : ""}span ${rowSpan}`,
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export const Grid = Object.assign(GridRoot, { Item: GridItem });
