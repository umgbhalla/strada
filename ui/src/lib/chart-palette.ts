/**
 * Chart color utilities copied from Cloudflare Kumo's MIT-licensed chart palette
 * and adapted for Strada UI. Provides semantic, categorical, and sequential colors.
 * Portions Copyright (c) 2026 Cloudflare, Inc. SPDX-License-Identifier: MIT.
 * Original source: https://github.com/cloudflare/kumo/blob/main/packages/kumo/src/components/chart/Color.ts
 */

const CHART_CATEGORICAL_LIGHT_COLORS = {
  blue: '#4290f0',
  yellow: '#f5b647',
  pink: '#e8649d',
  purple: '#8d58ee',
  teal: '#50c3b6',
  orange: '#d37536',
} as const

const CHART_CATEGORICAL_DARK_COLORS = {
  blue: '#4290f0',
  yellow: '#eeb720',
  pink: '#e8649d',
  purple: '#8d58ee',
  teal: '#50c3b6',
  orange: '#d37536',
} as const

const CHART_SEMANTIC_LIGHT_COLORS = {
  attention: '#fc574a',
  warning: '#f8a054',
  success: '#00a63e',
  neutral: '#b9d6ff',
  disabled: '#cbcbcb',
  skeleton: '#dddddd',
} as const

const CHART_SEMANTIC_DARK_COLORS = {
  attention: '#fc574a',
  warning: '#f8a054',
  success: '#00a63e',
  neutral: '#8ec5ff',
  disabled: '#878787',
  skeleton: '#5c5c5c',
} as const

const SEQUENTIAL_LIGHT = {
  blues: ['#e1eaf4', '#8ebcf6', '#4290f0', '#0e58b4', '#03254f'],
} as const

const SEQUENTIAL_DARK = {
  blues: ['#03254f', '#0e58b4', '#4290f0', '#a6bfdd', '#e1eaf4'],
} as const

export type ChartSemanticColorName = keyof typeof CHART_SEMANTIC_LIGHT_COLORS
export type ChartSequentialPaletteName = keyof typeof SEQUENTIAL_LIGHT

export const CHART_LIGHT_COLORS = [
  CHART_CATEGORICAL_LIGHT_COLORS.blue,
  CHART_CATEGORICAL_LIGHT_COLORS.yellow,
  CHART_CATEGORICAL_LIGHT_COLORS.pink,
  CHART_CATEGORICAL_LIGHT_COLORS.purple,
  CHART_CATEGORICAL_LIGHT_COLORS.teal,
  CHART_CATEGORICAL_LIGHT_COLORS.orange,
]

export const CHART_DARK_COLORS = [
  CHART_CATEGORICAL_DARK_COLORS.blue,
  CHART_CATEGORICAL_DARK_COLORS.yellow,
  CHART_CATEGORICAL_DARK_COLORS.pink,
  CHART_CATEGORICAL_DARK_COLORS.purple,
  CHART_CATEGORICAL_DARK_COLORS.teal,
  CHART_CATEGORICAL_DARK_COLORS.orange,
]

export const ChartPalette = {
  semantic(name: ChartSemanticColorName, isDarkMode = false): string {
    return isDarkMode ? CHART_SEMANTIC_DARK_COLORS[name] : CHART_SEMANTIC_LIGHT_COLORS[name]
  },

  categorical(index: number, isDarkMode = false): string {
    const colors = isDarkMode ? CHART_DARK_COLORS : CHART_LIGHT_COLORS
    return colors[index % colors.length]
  },

  sequential(palette: ChartSequentialPaletteName, isDarkMode = false): string[] {
    return [...(isDarkMode ? SEQUENTIAL_DARK[palette] : SEQUENTIAL_LIGHT[palette])]
  },
}
