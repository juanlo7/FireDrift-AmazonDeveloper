/**
 * Lightbox One-Sheet: a dark lobby wall lit by the title's own colours, the
 * poster in a lit case, marquee lettering, and one amber for every live state.
 *
 * Sizes are dp on the 960×540 logical TV screen (drawn at 2× on a 1080p TV).
 * Use these tokens instead of raw values so every screen looks the same.
 */

export const colors = {
  /** The lobby wall behind everything. */
  background: '#0d0c0b',
  /** Panels laid on the wall: sheets, menus. */
  surface: '#191714',
  /** A step up: rows, chips and tiles at rest. */
  surfaceRaised: '#26231f',
  /** Amber: the one colour of every live state (focus, selection, like). */
  primary: '#ffb547',
  /** Text on amber. */
  onPrimary: '#1a1006',
  /** Warm white for titles and body. */
  text: '#f6efe4',
  /** Stone for secondary text; ≥ 4.5:1 on the wall and on surfaces. */
  textMuted: '#b3a898',
  /** The lit case's bulb glow. */
  glow: '#ffd9a0',
  danger: '#ff6b5e',
} as const;

/** Bundled in `assets/fonts/` (SIL Open Font License). */
export const fonts = {
  /** Marquee lettering: titles and big labels, always uppercase. */
  marquee: 'BigShouldersDisplay-Black',
  marqueeBold: 'BigShouldersDisplay-Bold',
  body: 'Figtree-Regular',
  bodyMedium: 'Figtree-Medium',
  bodySemiBold: 'Figtree-SemiBold',
  bodyBold: 'Figtree-Bold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 32,
} as const;

/** Keep content inside the TV title-safe area (5% of each edge). */
export const safeArea = {
  horizontal: 48,
  vertical: 27,
} as const;

export const typography = {
  /** The marquee title on the feed. */
  display: { fontFamily: fonts.marquee, fontSize: 64, lineHeight: 58, textTransform: 'uppercase' },
  /** Screen titles. */
  title: { fontFamily: fonts.marquee, fontSize: 40, lineHeight: 40, textTransform: 'uppercase' },
  /** Section labels and big chip text. */
  subtitle: { fontFamily: fonts.bodySemiBold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  /** Key names in the legend and small marquee labels. */
  label: { fontFamily: fonts.marqueeBold, fontSize: 14, letterSpacing: 0.6, textTransform: 'uppercase' },
} as const;

export const radius = {
  sm: 4,
  md: 8,
  pill: 999,
} as const;

/** How a focused element stands out: amber fill, a lift and a warm shadow. */
export const focus = {
  scale: 1.05,
  ringWidth: 2,
  ringColor: colors.primary,
  shadow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
} as const;

export const theme = { colors, fonts, spacing, safeArea, typography, radius, focus };
export type Theme = typeof theme;
