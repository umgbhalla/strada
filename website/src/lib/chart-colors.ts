// Shared color palette for all chart components (echarts, recharts/donut, legends).
//
// Single source of truth so echarts line charts and recharts donut/pie charts
// use the same visual identity.

/** Tailwind fill classes for recharts Pie/Cell components. */
export const FILL_CLASSES = [
  'fill-primary', 'fill-destructive', 'fill-yellow-500', 'fill-purple-500',
  'fill-success', 'fill-orange-500', 'fill-teal-500', 'fill-pink-500',
  'fill-indigo-500', 'fill-amber-500', 'fill-cyan-500', 'fill-rose-500',
] as const

/** Tailwind bg classes for legend dots. */
export const DOT_CLASSES = [
  'bg-primary', 'bg-destructive', 'bg-yellow-500', 'bg-purple-500',
  'bg-success', 'bg-orange-500', 'bg-teal-500', 'bg-pink-500',
  'bg-indigo-500', 'bg-amber-500', 'bg-cyan-500', 'bg-rose-500',
] as const

/**
 * Hex colors matching the Tailwind classes above for use in echarts themes
 * and any context where raw CSS color values are needed.
 *
 * Order matches FILL_CLASSES / DOT_CLASSES:
 *   primary, destructive, yellow-500, purple-500,
 *   success, orange-500, teal-500, pink-500,
 *   indigo-500, amber-500, cyan-500, rose-500
 */
export const HEX_COLORS = [
  '#6366f1', // primary (indigo-based)
  '#ef4444', // destructive (red-500)
  '#eab308', // yellow-500
  '#a855f7', // purple-500
  '#22c55e', // success (green-500)
  '#f97316', // orange-500
  '#14b8a6', // teal-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
  '#f59e0b', // amber-500
  '#06b6d4', // cyan-500
  '#f43f5e', // rose-500
] as const
