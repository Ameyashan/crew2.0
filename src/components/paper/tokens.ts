// Design tokens for the new "jugaadu" reskin — a warm, minimal paper aesthetic.
// Source of truth: design_handoff_jugaadu_reskin/README.md ("Design Tokens").
//
// Deliberately flat plain-hex constants: NO hook, NO localStorage, NO dark
// variant (dark mode is being dropped). This mirrors the `--color-jg-*` custom
// properties in src/app/globals.css; the primitives in primitives2.tsx consume
// this object directly so inline `style={{}}` usage stays type-safe.
//
// Nothing imports this yet — Phase 1 is foundation only. The legacy
// palette.ts / use-paper-theme.ts stay untouched alongside it.

export const TOKENS = {
  // Surfaces
  paper: '#faf8f3', // app background
  card: '#ffffff', // card surfaces
  cardWarm: '#fdfcf8', // inset / nested cards

  // Text / ink
  ink: '#211e19', // primary text, solid buttons
  inkSoft: '#3a352c', // secondary text, button hover bg
  muted: '#8b8171', // body-secondary text
  muted2: '#6f6656', // mid-emphasis text
  faint: '#b0a692', // captions, placeholders
  faint2: '#a89e8c', // timestamps
  faint2Alt: '#a49a88', // Hindi accent

  // Lines / borders
  line: '#e3ddd0', // default borders
  lineSoft: '#e8e2d5', // cards
  lineRow: '#eae4d7', // row dividers
  lineInset: '#eee7d6', // inset panels

  // Neutral fills
  chip: '#f2eee4', // neutral chip bg
  hoverWash: '#f7f4ec', // row hover wash

  // Success
  green: '#3d7a4f', // success / DONE
  greenBg: '#e9f1e9',

  // Warning / thin-Story
  amber: '#8a6d2f', // warnings / NEEDS YOU
  amberBg: '#f4ecda',
  amberWash: '#fdf6e8', // panel bg
  amberLine: '#ecdfc0', // border

  // Accents
  gold: '#d9a13c', // active step spinner ring
  red: '#a03d2e', // destructive / negative

  // Dashed borders
  dashed: '#ddd5c4',
  dashed2: '#cfc6b2',
} as const;

export type TokenKey = keyof typeof TOKENS;

// Corner radii (px) — cards 14, modals/large 16, inner panels 10–12,
// buttons 8–9, pills/avatars 99.
export const RADII = {
  card: 14,
  modal: 16,
  panel: 12,
  panelTight: 10,
  button: 9,
  buttonTight: 8,
  pill: 99,
} as const;

export type RadiusKey = keyof typeof RADII;

// Shadow scale — soft, no hard offset shadows.
export const SHADOWS = {
  card: '0 2px 10px rgba(60,50,30,.05)', // resting card
  elevated: '0 3px 16px rgba(60,50,30,.07)', // elevated card
  popover: '0 6px 24px rgba(60,50,30,.12)', // popover
  modal: '0 16px 48px rgba(60,50,30,.2)', // modal / gate
  google: '0 8px 32px rgba(0,0,0,.14)', // Google chooser
} as const;

export type ShadowKey = keyof typeof SHADOWS;
