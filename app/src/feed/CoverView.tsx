import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Image, StyleSheet, Text, View} from 'react-native';
import type {TitleCard} from '@firedrift/domain';
import {colors, fonts, radius, spacing, typography} from '../theme';
import {toServiceOptions} from '../watchNow/serviceOptions';
import {Heart, LikeBurst} from './LikeHeart';

/** How long the case change takes. Short, so the cover shows in < 500 ms (NFR-3). */
export const CASE_IN_MS = 280;
/** The room's light follows the new title a little slower than the case. */
export const AMBIENT_IN_MS = 460;
/** Services shown as chips under the synopsis. */
export const MAX_COVER_SERVICES = 3;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const caseGlow = require('../../assets/images/case-glow.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const textScrim = require('../../assets/images/text-scrim.png');

export interface CoverViewProps {
  title: TitleCard;
  /** The title that was on screen before: its case slides out and its light fades under the new one. */
  previous?: TitleCard | null;
  isLiked: boolean;
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
  dimmed = false,
}: CoverViewProps) => {
  const change = useRef(new Animated.Value(previous ? 0 : 1)).current;
  const ambientIn = useRef(new Animated.Value(0)).current;
  const sideOpacity = useRef(new Animated.Value(1)).current;
  // The like moment: a burst over the case and a flash of its light, only when
  // the viewer likes it now (a title that comes back already liked just wears the mark).
  const [burst, setBurst] = useState(false);
  const glowFlash = useRef(new Animated.Value(0)).current;
  const markIn = useRef(new Animated.Value(isLiked ? 1 : 0)).current;
  const wasLiked = useRef(isLiked);
  useEffect(() => {
    if (!isLiked || wasLiked.current) return;
    wasLiked.current = true;
    setBurst(true);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(glowFlash, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(glowFlash, {
          toValue: 0,
          duration: 620,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(520),
        Animated.spring(markIn, {
          toValue: 1,
          friction: 5,
          tension: 160,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [isLiked, glowFlash, markIn]);

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
      <Image source={textScrim} resizeMode="stretch" style={styles.textScrim} />

      <Image source={caseGlow} resizeMode="stretch" style={styles.glow} />
      <Animated.Image
        source={caseGlow}
        resizeMode="stretch"
        style={[styles.glow, styles.glowFlash, {opacity: glowFlash}]}
      />

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

      {isLiked ? (
        <Animated.View
          style={[
            styles.likeMark,
            {opacity: markIn, transform: [{scale: markIn}]},
          ]}
          testID="feed-liked">
          <Heart size={11} color={colors.onPrimary} />
        </Animated.View>
      ) : null}
      {burst ? (
        <LikeBurst
          x={CASE_LEFT + CASE_WIDTH / 2}
          y={CASE_TOP + CASE_HEIGHT / 2}
          onDone={() => setBurst(false)}
        />
      ) : null}

      {dimmed ? null : (
        <Animated.View style={[styles.side, {opacity: sideOpacity}]}>
          <Text style={styles.name} numberOfLines={2} testID="feed-title">
            {title.name}
          </Text>
          <View style={styles.metaRow}>
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
  // One smooth alpha gradient towards the text column: stepped layers banded on a TV.
  // Vega does not stretch an Image from top/bottom alone: give it its size.
  textScrim: {position: 'absolute', top: 0, left: 340, width: 620, height: 540},
  glow: {
    position: 'absolute',
    left: CASE_LEFT - GLOW_SPREAD,
    top: CASE_TOP - GLOW_SPREAD,
    width: CASE_WIDTH + GLOW_SPREAD * 2,
    height: CASE_HEIGHT + GLOW_SPREAD * 2,
    opacity: 0.22,
  },
  // The same halo, tinted amber and a little wider, flashed when the viewer likes the title.
  glowFlash: {tintColor: colors.primary, transform: [{scale: 1.15}]},
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
  side: {position: 'absolute', left: 410, right: 60, top: 92, bottom: 70},
  metaRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // The liked mark, stamped on the case's top-right corner.
  likeMark: {
    position: 'absolute',
    left: CASE_LEFT + CASE_WIDTH - 22,
    top: CASE_TOP - 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.5,
    shadowRadius: 12,
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
