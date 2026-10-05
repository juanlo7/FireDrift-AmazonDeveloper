import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import type { TitleCard } from '@firedrift/domain';
import { colors, radius, safeArea, spacing, typography } from '../theme';

/** One slow push-in across the backdrop (D8 plan B "animated backdrop"). */
export const BACKDROP_DRIFT_MS = 24_000;
/** How long a new cover takes to fade in. Short, so the cover shows in < 500 ms (NFR-3). */
export const COVER_FADE_MS = 180;

/** Stacked translucent layers: darker towards the left and the bottom, without hard edges. */
const SHADE_STEPS = [0, 1, 2, 3, 4, 5];

export interface CoverViewProps {
  title: TitleCard;
  isLiked: boolean;
}

export const coverMeta = (title: TitleCard) =>
  [
    title.year,
    title.type === 'series' ? 'Series' : 'Movie',
    title.runtimeMinutes ? `${title.runtimeMinutes} min` : null,
    title.rating ? `★ ${title.rating.toFixed(1)}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

/**
 * Full-screen cover: backdrop with a slow drift, title, meta, genres and
 * synopsis. Only the title on screen holds images; the next ones are just
 * prefetched. Remount it per title (`key`) so the drift starts again.
 */
export const CoverView = ({ title, isLiked }: CoverViewProps) => {
  const drift = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: COVER_FADE_MS, useNativeDriver: true }),
      Animated.timing(drift, {
        toValue: 1,
        duration: BACKDROP_DRIFT_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [drift, fade]);

  const scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.16] });
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -60] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} testID="feed-cover">
      {title.backdropUrl ? (
        <Animated.Image
          source={{ uri: title.backdropUrl }}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, { transform: [{ scale }, { translateX }] }]}
          testID="feed-backdrop"
        />
      ) : null}

      {/* Shade so the text reads on any backdrop: darker on the left and at the bottom. */}
      <View style={[StyleSheet.absoluteFill, styles.shade]} />
      {SHADE_STEPS.map(step => (
        <View key={`l${step}`} style={[styles.shadeLeft, { width: `${70 - step * 8}%` }]} />
      ))}
      {SHADE_STEPS.map(step => (
        <View key={`b${step}`} style={[styles.shadeBottom, { height: `${45 - step * 6}%` }]} />
      ))}

      <View style={styles.content}>
        {!title.backdropUrl && title.posterUrl ? (
          <Image source={{ uri: title.posterUrl }} style={styles.poster} testID="feed-poster" />
        ) : null}

        <View style={styles.badges}>
          {title.onMyServices ? (
            <Text style={[styles.badge, styles.badgeServices]} testID="feed-on-my-services">
              On your services
            </Text>
          ) : null}
          {isLiked ? (
            <Text style={[styles.badge, styles.badgeLiked]} testID="feed-liked">
              ♥ Liked
            </Text>
          ) : null}
        </View>

        <Text
          style={[styles.name, title.name.length > 18 && styles.nameLong]}
          numberOfLines={2}
          testID="feed-title"
        >
          {title.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1} testID="feed-meta">
          {coverMeta(title)}
        </Text>
        {title.genres.length ? (
          <Text style={styles.genres}>{title.genres.slice(0, 3).join('  /  ')}</Text>
        ) : null}
        <Text style={styles.overview} numberOfLines={4} testID="feed-overview">
          {title.overview || 'No synopsis yet.'}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  shade: { backgroundColor: 'rgba(11, 11, 18, 0.35)' },
  shadeLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(11, 11, 18, 0.13)',
  },
  shadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11, 11, 18, 0.12)',
  },
  content: {
    position: 'absolute',
    left: safeArea.horizontal,
    right: '38%',
    bottom: safeArea.vertical + spacing.xl,
    gap: spacing.xs,
  },
  poster: {
    width: 160,
    height: 240,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceRaised,
  },
  badges: { flexDirection: 'row', gap: spacing.xs },
  badge: {
    ...typography.caption,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  badgeServices: { backgroundColor: colors.surfaceRaised, color: colors.text },
  badgeLiked: { backgroundColor: colors.primary, color: colors.onPrimary },
  name: { ...typography.display, color: colors.text },
  nameLong: { ...typography.title },
  meta: { ...typography.body, fontWeight: '700', color: colors.primary },
  genres: { ...typography.caption, color: colors.text },
  overview: { ...typography.body, color: colors.textMuted },
});
