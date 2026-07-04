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

// Font stacks for the new "paper" reskin (see design_handoff_jugaadu_reskin).
// Kept separate from PAPER_FONTS so migrated files opt in without disturbing the
// pages still on the legacy stacks above. IBM Plex Mono is wired up in
// src/app/layout.tsx via next/font (--font-ibm-plex-mono).
export const PAPER_FONTS_V2 = {
  serif: 'var(--font-newsreader), Georgia, serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'var(--font-ibm-plex-mono), ui-monospace, "SFMono-Regular", monospace',
  devan: 'var(--font-noto-devan), serif',
} as const;

export type PaperFontV2Key = keyof typeof PAPER_FONTS_V2;
