// MDX dashboard renderer for custom dashboard layouts.
//
// Renders an MDX string using safe-mdx with dashboard widget components
// injected into the scope. Each widget component supports RSC streaming:
// data props can be Promises that trigger Suspense fallbacks.
//
// Components available in MDX:
//   Grid, Grid.Item, DonutPanel, SparklinePanel, SparkAreaPanel
//
// Usage:
//   <MdxDashboard mdx={mdxString} scope={{ myData }} />

import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'

import { Grid } from '@ui/components/grid.tsx'
import { DonutPanel } from '@ui/components/widgets/donut-panel.tsx'
import { SparklinePanel } from '@ui/components/widgets/sparkline-panel.tsx'
import { SparkAreaPanel } from '@ui/components/widgets/spark-area-panel.tsx'

// ── Component map for safe-mdx ──────────────────────────────────

const DASHBOARD_COMPONENTS = {
  Grid,
  DonutPanel,
  SparklinePanel,
  SparkAreaPanel,
}

// ── Component ───────────────────────────────────────────────────

export function MdxDashboard({
  mdx,
  scope = {},
}: {
  mdx: string
  scope?: Record<string, unknown>
}) {
  const mdast = mdxParse(mdx)
  return (
    <SafeMdxRenderer
      markdown={mdx}
      mdast={mdast}
      components={DASHBOARD_COMPONENTS}
      scope={scope}
    />
  )
}
