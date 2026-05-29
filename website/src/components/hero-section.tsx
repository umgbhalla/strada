// Hero section with background video. Video is in normal flow and defines the
// hero height. CTA is overlaid on top. Gradient overlays fade the video edges
// into the page background.
//
// The source video is a colorful holographic radar (cyan + red-orange UI) on a
// dark blue-black background, authored for dark mode. In light mode we flip the
// dark background to light with `invert`, but invert also flips every hue
// (cyan -> red, producing a pink cast). A hue rotation corrects this: 180deg
// restores the exact original palette, and a bit more pushes the contour lines
// toward a soft light-blue that matches the brand. `hue-rotate-200` lands on
// light-blue lines on a light background. Dark mode shows the video untouched
// (`dark:invert-0 dark:hue-rotate-0`).
'use client'

import { Link } from 'spiceflow/react'
import { Button } from './ui/button.tsx'

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='currentColor'>
      <path d='M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z' />
    </svg>
  )
}

const TOP_GRADIENT = [
  'linear-gradient(to bottom,',
  'var(--background) 0%,',
  'color-mix(in srgb, var(--background) 90%, transparent) 12%,',
  'color-mix(in srgb, var(--background) 75%, transparent) 26%,',
  'color-mix(in srgb, var(--background) 55%, transparent) 42%,',
  'color-mix(in srgb, var(--background) 38%, transparent) 58%,',
  'color-mix(in srgb, var(--background) 22%, transparent) 74%,',
  'color-mix(in srgb, var(--background) 8%, transparent) 88%,',
  'transparent 100%)',
].join(' ')

const BOTTOM_GRADIENT = [
  'linear-gradient(to top,',
  'var(--background) 0%,',
  'color-mix(in srgb, var(--background) 88%, transparent) 14%,',
  'color-mix(in srgb, var(--background) 70%, transparent) 28%,',
  'color-mix(in srgb, var(--background) 50%, transparent) 42%,',
  'color-mix(in srgb, var(--background) 32%, transparent) 56%,',
  'color-mix(in srgb, var(--background) 16%, transparent) 70%,',
  'color-mix(in srgb, var(--background) 6%, transparent) 86%,',
  'transparent 100%)',
].join(' ')

export function HeroSection() {
  return (
    <div className='w-screen ml-[calc(-50vw+50%)] flex justify-center mt-4 lg:mt-8 mb-6 lg:mb-10'>
      <div className='relative overflow-hidden bg-background w-full max-w-(--grid-max-width)'>
        {/* Video in normal flow — its aspect ratio defines the hero height */}
        <video
          autoPlay
          muted
          loop
          playsInline
          poster='/hero-bg-poster.jpg'
          className='w-full invert hue-rotate-[200deg] dark:invert-0 dark:hue-rotate-0'
        >
          <source src='/hero-bg.mp4' type='video/mp4' />
        </video>

        {/* Top gradient — lower starting alpha (covers less) but taller fade */}
        <div
          className='absolute top-0 inset-x-0 h-[85%] z-1 pointer-events-none'
          style={{ background: TOP_GRADIENT }}
        />

        {/* Bottom gradient — taller and softer fade into the page background */}
        <div
          className='absolute bottom-0 inset-x-0 h-[80%] z-1 pointer-events-none'
          style={{ background: BOTTOM_GRADIENT }}
        />

        {/* CTA overlay — centered over the video */}
        <div className='absolute inset-0 z-2 flex flex-col items-center justify-start pt-6 lg:pt-[30px] px-5 gap-6'>
          <h1 className='flex flex-col items-center leading-tight text-[28px] sm:text-[36px] md:text-[44px] text-foreground text-balance font-bold text-center'>
            <span>delightful open-source</span>
            <span>observability you own</span>
          </h1>

          <div className='flex gap-3 flex-wrap justify-center'>
            <Button size='lg' className='no-underline gap-2.5' render={<Link href='/dash' />}>
              Sign Up
            </Button>
            <Button variant='ghost' size='lg' className='no-underline gap-2' render={<Link href='https://github.com/remorses/strada' target='_blank' rel='noopener noreferrer' />}>
              <GitHubIcon className='size-[18px]' />
              GitHub
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
