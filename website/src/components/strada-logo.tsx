// Strada logo using the docs site AI-generated logo image.
//
// The source asset is a JPEG (no alpha): a pure-black wordmark on a pure-white
// background. We knock out the white background visually with blend modes so it
// works on any surface in both light and dark themes:
//   - light mode: `mix-blend-mode: multiply` makes the white disappear and keeps
//     the black text black.
//   - dark mode: `invert(1)` flips the image (white bg -> black, text -> white),
//     then `mix-blend-mode: screen` makes the now-black background disappear and
//     keeps the now-white text visible.

import { cn } from '../lib/utils.ts'

export function StradaLogo({ className }: { className?: string }) {
  return (
    <img
      src="/holocron-api/ai-logo/strada.jpeg"
      alt="Strada"
      className={cn(
        'mix-blend-multiply dark:mix-blend-screen dark:invert',
        className,
      )}
    />
  )
}
