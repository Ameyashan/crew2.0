// Font family stacks referenced by the paper primitives.
// The CSS variables are wired up in src/app/layout.tsx via next/font.

export const PAPER_FONTS = {
  display: 'var(--font-dm-serif), var(--font-newsreader), Georgia, serif',
  serif: 'var(--font-newsreader), Georgia, serif',
  serifAlt: 'var(--font-instrument-serif), var(--font-newsreader), Georgia, serif',
  sans: 'var(--font-space-grotesk), system-ui, sans-serif',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
  devan: 'var(--font-noto-devan), serif',
  caveat: 'var(--font-caveat), cursive',
  bricolage: 'var(--font-bricolage), system-ui, sans-serif',
} as const;

export type PaperFontKey = keyof typeof PAPER_FONTS;
