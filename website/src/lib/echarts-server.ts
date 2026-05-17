// Server-side echarts stub. Provides the same export shape as the browser
// bundle but without importing the real echarts (which crashes in non-browser
// environments due to HTMLElement access at module evaluation time).
//
// This file is resolved via the #echarts import map when the browser condition
// is not active (SSR, RSC, Cloudflare Workers, Node.js).

export const echarts = null as any
export const THEME = 'strada'
