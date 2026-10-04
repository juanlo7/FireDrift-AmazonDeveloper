/**
 * TV theme for a 1920×1080 screen seen from the sofa ("10-foot UI").
 * Use these tokens instead of raw values so every screen looks the same.
 */

export const colors = {
  background: '#0B0B12',
  surface: '#171722',
  surfaceRaised: '#232333',
  primary: '#FF6A3D',
  onPrimary: '#14080A',
  text: '#F4F4F8',
  textMuted: '#A3A3B8',
  focus: '#FFFFFF',
  danger: '#FF4D6A',
} as const;

export const spacing = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
} as const;

/** Keep content inside the TV title-safe area (5% of each edge). */
export const safeArea = {
  horizontal: 96,
  vertical: 54,
} as const;

export const typography = {
  display: { fontSize: 64, fontWeight: '700' },
  title: { fontSize: 44, fontWeight: '700' },
  subtitle: { fontSize: 32, fontWeight: '600' },
  body: { fontSize: 28, fontWeight: '400' },
  caption: { fontSize: 22, fontWeight: '400' },
} as const;

export const radius = {
  sm: 8,
  md: 16,
  pill: 999,
} as const;

/** How a focused element stands out: scale plus a solid ring. */
export const focus = {
  scale: 1.06,
  ringWidth: 4,
  ringColor: colors.focus,
} as const;

export const theme = { colors, spacing, safeArea, typography, radius, focus };
export type Theme = typeof theme;
