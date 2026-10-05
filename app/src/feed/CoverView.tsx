import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import type { TitleCard } from '@firedrift/domain';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { toServiceOptions } from '../watchNow/serviceOptions';

/** How long a new case takes to slide in. Short, so the cover shows in < 500 ms (NFR-3). */
export const CASE_IN_MS = 260;
/** The room's light follows the new title a little slower than the case. */
export const AMBIENT_IN_MS = 420;
/** Services shown as chips under the synopsis. */
export const MAX_COVER_SERVICES = 3;

export interface CoverViewProps {
  title: TitleCard;
  isLiked: boolean;
  /** 1-based position in the feed, and how many titles it has now. */
  position?: { index: number; total: number };
}

const hours = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;

export const coverMeta = (title: TitleCard) =>
  [
    title.year,
    title.genres[0] ?? (title.type === 'series' ? 'Series' : 'Movie'),
    title.runtimeMinutes ? hours(title.runtimeMinutes) : null,
    title.rating ? `Rated ${title.rating.toFixed(1)}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

/**
 * Lightbox One-Sheet: the title's poster lit inside its case on the left, the
 * room washed in the backdrop's colours, and the marquee title, one meta line,
 * a short synopsis and where it streams on the right. Remount it per title
 * (`key`) so the case slides in again.
 */
export const CoverView = ({ title, isLiked, position }: CoverViewProps) => {
  const caseIn = useRef(new Animated.Value(0)).current;
  const ambientIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(caseIn, {
        toValue: 1,
        duration: CASE_IN_MS,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(ambientIn, {
        toValue: 1,
        duration: AMBIENT_IN_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [caseIn, ambientIn]);

  const poster = title.posterUrl ?? title.backdropUrl;
  const ambient = title.backdropUrl ?? title.posterUrl;
  const services = toServiceOptions(title.providers)
    .filter(s => s.included)
    .slice(0, MAX_COVER_SERVICES);
  const [primary, ...others] = services;

  return (
    <View style={StyleSheet.absoluteFill} testID="feed-cover">
      {ambient ? (
        <Animated.Image
          source={{ uri: ambient }}
          blurRadius={24}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, styles.ambient, { opacity: ambientIn }]}
          testID="feed-backdrop"
        />
      ) : null}
      {/* The room stays dark enough for warm white text on any backdrop. */}
      <View style={[StyleSheet.absoluteFill, styles.dim]} />

      <Animated.View
        style={[
          styles.case,
          {
            opacity: caseIn,
            transform: [{ translateY: caseIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
          },
        ]}
      >
        {poster ? (
          <Image source={{ uri: poster }} resizeMode="cover" style={styles.poster} testID="feed-poster" />
        ) : (
          <View style={[styles.poster, styles.posterEmpty]}>
            <Text style={styles.posterEmptyText} numberOfLines={4}>
              {title.name}
            </Text>
          </View>
        )}
      </Animated.View>

      <Text style={styles.nowShowing}>
        Now showing{position ? `  ·  ${position.index} / ${position.total}` : ''}
      </Text>

      <View style={styles.side}>
        <Text style={styles.name} numberOfLines={2} testID="feed-title">
          {title.name}
        </Text>
        <View style={styles.metaRow}>
          {isLiked ? (
            <Text style={styles.liked} testID="feed-liked">
              Liked
            </Text>
          ) : null}
          <Text style={styles.meta} numberOfLines={1} testID="feed-meta">
            {coverMeta(title)}
          </Text>
        </View>
        <Text style={styles.overview} numberOfLines={3} testID="feed-overview">
          {title.overview || 'No synopsis yet.'}
        </Text>

        <View style={styles.services}>
          {primary ? (
            <View style={[styles.chip, styles.chipPrimary]} testID="feed-on-my-services">
              <Image source={{ uri: primary.logoUrl }} style={styles.chipLogo} />
              <Text style={[styles.chipText, styles.chipTextPrimary]} numberOfLines={1}>
                Watch on {primary.name}
              </Text>
              <Text style={styles.okKey}>OK</Text>
            </View>
          ) : (
            <View style={styles.chip}>
              <Text style={[styles.chipText, styles.chipTextAlone]}>Not on your services · OK for options</Text>
            </View>
          )}
          {others.map(service => (
            <View key={service.providerId} style={styles.chip}>
              <Image source={{ uri: service.logoUrl }} style={styles.chipLogo} />
              <Text style={styles.chipText} numberOfLines={1}>
                {service.name}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const CASE_HEIGHT = 430;
const CASE_PADDING = 9;

const styles = StyleSheet.create({
  ambient: { transform: [{ scale: 1.1 }] },
  dim: { backgroundColor: 'rgba(13, 12, 11, 0.58)' },
  case: {
    position: 'absolute',
    left: 75,
    top: 55,
    height: CASE_HEIGHT,
    width: (CASE_HEIGHT - CASE_PADDING * 2) * (2 / 3) + CASE_PADDING * 2,
    padding: CASE_PADDING,
    borderRadius: radius.sm,
    backgroundColor: '#1b1916',
    borderWidth: 1,
    borderColor: 'rgba(255, 217, 160, 0.22)',
    shadowColor: colors.glow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 40,
  },
  poster: { flex: 1, borderRadius: 2, backgroundColor: colors.surfaceRaised },
  posterEmpty: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  posterEmptyText: { ...typography.title, color: colors.text, textAlign: 'center' },
  side: { position: 'absolute', left: 410, right: 60, top: 92, bottom: 70 },
  nowShowing: { ...typography.label, position: 'absolute', top: 55, right: 60, color: colors.textMuted },
  metaRow: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liked: {
    ...typography.label,
    color: colors.onPrimary,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  name: { ...typography.display, color: colors.text },
  meta: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text },
  overview: { ...typography.body, marginTop: spacing.md, color: colors.textMuted, maxWidth: 440 },
  services: { marginTop: spacing.xl, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(246, 239, 228, 0.1)',
  },
  chipPrimary: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  chipLogo: { width: 26, height: 26, borderRadius: 13 },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text, maxWidth: 220 },
  chipTextPrimary: { color: colors.onPrimary },
  chipTextAlone: { paddingLeft: spacing.sm, maxWidth: 360 },
  okKey: {
    ...typography.label,
    fontSize: 12,
    color: colors.primary,
    backgroundColor: colors.onPrimary,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    overflow: 'hidden',
  },
});
