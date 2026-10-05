import React, {useEffect, useRef} from 'react';
import {Animated, Easing, Image, StyleSheet, Text, View} from 'react-native';
import type {TitleCard} from '@firedrift/domain';
import {colors, fonts, radius, spacing, typography} from '../theme';
import {toServiceOptions} from '../watchNow/serviceOptions';

/** How long the case change takes. Short, so the cover shows in < 500 ms (NFR-3). */
export const CASE_IN_MS = 280;
/** The room's light follows the new title a little slower than the case. */
export const AMBIENT_IN_MS = 460;
/** Services shown as chips under the synopsis. */
export const MAX_COVER_SERVICES = 3;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const caseGlow = require('../../assets/images/case-glow.png');

export interface CoverViewProps {
  title: TitleCard;
  /** The title that was on screen before: its case slides out and its light fades under the new one. */
  previous?: TitleCard | null;
  isLiked: boolean;
  /** 1-based position in the feed, and how many titles it has now. */
  position?: {index: number; total: number};
  /** A sheet or the menu is open: the text column steps back so nothing shows cut beside it. */
  dimmed?: boolean;
}

const hours = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
    : `${minutes} min`;

export const coverMeta = (title: TitleCard) =>
  [
    title.year,
    title.genres[0] ?? (title.type === 'series' ? 'Series' : 'Movie'),
    title.runtimeMinutes ? hours(title.runtimeMinutes) : null,
    title.rating ? `Rated ${title.rating.toFixed(1)}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

const ambientOf = (title: TitleCard) => title.backdropUrl ?? title.posterUrl;
const posterOf = (title: TitleCard) => title.posterUrl ?? title.backdropUrl;

const Poster = ({title}: {title: TitleCard}) => {
  const poster = posterOf(title);
  return poster ? (
    <Image
      source={{uri: poster}}
      resizeMode="cover"
      style={styles.poster}
      testID="feed-poster"
    />
  ) : (
    <View style={[styles.poster, styles.posterEmpty]}>
      <Text style={styles.posterEmptyText} numberOfLines={4}>
        {title.name}
      </Text>
    </View>
  );
};

/**
 * Lightbox One-Sheet: the title's poster lit inside its case on the left, the
 * room washed in the backdrop's colours, and the marquee title, one meta line,
 * a short synopsis and where it streams on the right. Remount it per title
 * (`key`) and pass the `previous` title so the cases and the light hand over.
 */
export const CoverView = ({
  title,
  previous,
  isLiked,
  position,
  dimmed = false,
}: CoverViewProps) => {
  const change = useRef(new Animated.Value(previous ? 0 : 1)).current;
  const ambientIn = useRef(new Animated.Value(0)).current;
  const sideOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(change, {
        toValue: 1,
        duration: CASE_IN_MS,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(ambientIn, {
        toValue: 1,
        duration: AMBIENT_IN_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [change, ambientIn]);

  useEffect(() => {
    Animated.timing(sideOpacity, {
      toValue: dimmed ? 0 : 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [dimmed, sideOpacity]);

  const services = toServiceOptions(title.providers)
    .filter((s) => s.included)
    .slice(0, MAX_COVER_SERVICES);
  const [primary, ...others] = services;
  const ambient = ambientOf(title);
  const previousAmbient = previous ? ambientOf(previous) : null;

  return (
    <View style={StyleSheet.absoluteFill} testID="feed-cover">
      {/* The old light stays under the new one until it has faded in: a crossfade, not a dip to dark. */}
      {previousAmbient ? (
        <Image
          source={{uri: previousAmbient}}
          blurRadius={24}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, styles.ambient]}
        />
      ) : null}
      {ambient ? (
        <Animated.Image
          source={{uri: ambient}}
          blurRadius={24}
          resizeMode="cover"
          style={[
            StyleSheet.absoluteFill,
            styles.ambient,
            {opacity: ambientIn},
          ]}
          testID="feed-backdrop"
        />
      ) : null}
      {/* Keeps the wall dark on bright backdrops; the text side gets one more layer. */}
      <View style={[StyleSheet.absoluteFill, styles.dim]} />
      {SCRIM_STEPS.map((left) => (
        <View key={left} style={[styles.textScrim, {left}]} />
      ))}

      <Image source={caseGlow} resizeMode="stretch" style={styles.glow} />

      {previous ? (
        <Animated.View
          style={[
            styles.case,
            {
              opacity: change.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
              transform: [
                {
                  translateY: change.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -24],
                  }),
                },
              ],
            },
          ]}>
          <Poster title={previous} />
        </Animated.View>
      ) : null}
      <Animated.View
        style={[
          styles.case,
          {
            opacity: change,
            transform: [
              {
                translateY: change.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              },
            ],
          },
        ]}>
        <Poster title={title} />
      </Animated.View>

      {position ? (
        <Text style={styles.plate} testID="feed-position">
          {position.index} / {position.total}
        </Text>
      ) : null}

      {dimmed ? null : (
        <Animated.View style={[styles.side, {opacity: sideOpacity}]}>
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
          <Text
            style={styles.overview}
            numberOfLines={2}
            testID="feed-overview">
            {title.overview || 'No synopsis yet.'}
          </Text>

          <View style={styles.services}>
            {primary ? (
              <View
                style={[styles.chip, styles.chipPrimary]}
                testID="feed-on-my-services">
                <Image
                  source={{uri: primary.logoUrl}}
                  style={styles.chipLogo}
                />
                <Text
                  style={[styles.chipText, styles.chipTextPrimary]}
                  numberOfLines={1}>
                  Watch on {primary.name}
                </Text>
                <Text style={styles.okKey}>OK</Text>
              </View>
            ) : (
              <View style={styles.chip}>
                <Text style={[styles.chipText, styles.chipTextAlone]}>
                  Not on your services · OK for options
                </Text>
              </View>
            )}
            {others.map((service) => (
              <View key={service.providerId} style={styles.chip}>
                <Image
                  source={{uri: service.logoUrl}}
                  style={styles.chipLogo}
                />
                <Text style={styles.chipText} numberOfLines={1}>
                  {service.name}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  );
};

/** Overlapping layers from these x positions: darker towards the text, with no hard edge. */
const SCRIM_STEPS = [360, 420, 480, 540];

const CASE_LEFT = 75;
const CASE_TOP = 50;
const CASE_HEIGHT = 430;
const CASE_PADDING = 5;
const CASE_WIDTH =
  (CASE_HEIGHT - CASE_PADDING * 2) * (2 / 3) + CASE_PADDING * 2;
const GLOW_SPREAD = 90;

const styles = StyleSheet.create({
  ambient: {transform: [{scale: 1.1}]},
  dim: {backgroundColor: 'rgba(13, 12, 11, 0.72)'},
  textScrim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(13, 12, 11, 0.1)',
  },
  glow: {
    position: 'absolute',
    left: CASE_LEFT - GLOW_SPREAD,
    top: CASE_TOP - GLOW_SPREAD,
    width: CASE_WIDTH + GLOW_SPREAD * 2,
    height: CASE_HEIGHT + GLOW_SPREAD * 2,
    opacity: 0.22,
  },
  case: {
    position: 'absolute',
    left: CASE_LEFT,
    top: CASE_TOP,
    height: CASE_HEIGHT,
    width: CASE_WIDTH,
    padding: CASE_PADDING,
    borderRadius: radius.sm,
    backgroundColor: '#2a2219',
    // The warm inner edge of a lit frame.
    borderWidth: 1,
    borderColor: 'rgba(255, 217, 160, 0.55)',
    shadowColor: colors.glow,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.45,
    shadowRadius: 30,
  },
  poster: {flex: 1, borderRadius: 2, backgroundColor: colors.surfaceRaised},
  posterEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  posterEmptyText: {
    ...typography.title,
    color: colors.text,
    textAlign: 'center',
  },
  plate: {
    ...typography.label,
    position: 'absolute',
    top: CASE_TOP + CASE_HEIGHT + spacing.sm,
    left: CASE_LEFT,
    width: CASE_WIDTH,
    textAlign: 'center',
    color: colors.textMuted,
  },
  side: {position: 'absolute', left: 410, right: 60, top: 92, bottom: 70},
  metaRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liked: {
    ...typography.label,
    color: colors.onPrimary,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  name: {...typography.display, color: colors.text},
  meta: {fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text},
  overview: {
    ...typography.body,
    marginTop: spacing.md,
    color: colors.textMuted,
    maxWidth: 440,
  },
  services: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
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
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  chipLogo: {width: 26, height: 26, borderRadius: 13},
  chipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
    maxWidth: 220,
  },
  chipTextPrimary: {color: colors.onPrimary},
  chipTextAlone: {paddingLeft: spacing.sm, maxWidth: 360},
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
