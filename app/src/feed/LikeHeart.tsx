import React, {useEffect, useRef} from 'react';
import {Animated, Easing, Image, StyleSheet, View} from 'react-native';
import {colors} from '../theme';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const glow = require('../../assets/images/case-glow.png');

/** The whole like moment, from pop to fade. Short, so it never blocks browsing. */
export const LIKE_BURST_MS = 900;

/**
 * A drawn heart: a square and two circles, turned 45°, so no glyph or SVG is
 * needed. `size` is the square's side; the heart is about 1.5× that wide.
 */
export const Heart = ({
  size,
  color = colors.primary,
}: {
  size: number;
  color?: string;
}) => (
  <View
    style={{
      width: size * 1.5,
      height: size * 1.5,
      transform: [{rotate: '-45deg'}],
    }}>
    <View
      style={{
        position: 'absolute',
        left: 0,
        top: size / 2,
        width: size,
        height: size,
        backgroundColor: color,
      }}
    />
    <View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
    <View
      style={{
        position: 'absolute',
        left: size / 2,
        top: size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  </View>
);

export interface LikeBurstProps {
  /** Centre of the burst, in the parent's coordinates. */
  x: number;
  y: number;
  /** Called once the burst has faded, so the parent can drop it. */
  onDone?: () => void;
}

/**
 * The like moment over the lit case: an amber heart pops in with a small
 * overshoot while a ring of light spreads from it, then rises and fades.
 */
export const LikeBurst = ({x, y, onDone}: LikeBurstProps) => {
  const pop = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const leave = useRef(new Animated.Value(0)).current;
  // The parent may pass a new callback on every render; the animation must run once.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.sequence([
        Animated.spring(pop, {
          toValue: 1,
          friction: 4,
          tension: 140,
          useNativeDriver: true,
        }),
        Animated.delay(180),
        Animated.timing(leave, {
          toValue: 1,
          duration: 320,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(ring, {
        toValue: 1,
        duration: 620,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]);
    animation.start(({finished}) => finished && done.current?.());
    return () => animation.stop();
  }, [pop, ring, leave]);

  const HEART = 64;
  const RING = 150;

  return (
    <View
      pointerEvents="none"
      style={[styles.burst, {left: x - RING / 2, top: y - RING / 2}]}
      testID="feed-like-burst">
      <Animated.View
        style={[
          styles.ring,
          {
            opacity: ring.interpolate({
              inputRange: [0, 0.2, 1],
              outputRange: [0, 0.9, 0],
            }),
            transform: [
              {
                scale: ring.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1.25],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.heart,
          {
            opacity: leave.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
            transform: [
              {
                translateY: leave.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -36],
                }),
              },
              {
                scale: pop.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.2, 1],
                }),
              },
            ],
          },
        ]}>
        {/* A soft raster glow: on Vega a shadow follows the box, not the heart. */}
        <Image source={glow} resizeMode="stretch" style={styles.heartGlow} />
        <Heart size={HEART} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  burst: {
    position: 'absolute',
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  heart: {alignItems: 'center', justifyContent: 'center'},
  heartGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    opacity: 0.55,
    tintColor: colors.primary,
  },
});
