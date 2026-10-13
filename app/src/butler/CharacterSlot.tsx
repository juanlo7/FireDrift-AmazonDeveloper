import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { Gesture } from '@firedrift/domain';
import { colors, fonts, radius, spacing, typography } from '../theme';
import type { CharacterState } from './butlerModel';

export interface CharacterSlotProps {
  state: CharacterState;
  /** The gesture playing now, once, over the state (`createSpeechSync`). */
  gesture: Gesture | null;
}

export const SLOT_WIDTH = 300;
export const SLOT_HEIGHT = 400;

const STATE_LABELS: Record<CharacterState, string> = {
  idle: 'At your service',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  fallback: 'Resting',
};

const GESTURE_LABELS: Record<Gesture, string> = {
  nod: 'nods',
  shrug: 'shrugs',
  shiver: 'shivers',
  excited: 'lights up',
  bow: 'bows',
};

/** How the light behind the character moves: [low, high, ms per half beat]. */
const PULSE: Record<CharacterState, [number, number, number]> = {
  idle: [0.35, 0.5, 2400],
  listening: [0.9, 1, 600],
  thinking: [0.3, 0.75, 900],
  speaking: [0.55, 1, 260],
  fallback: [0.15, 0.15, 1000],
};

/**
 * The butler's place on screen: a lit case like the feed's, with a placeholder
 * figure whose light follows the state. #60 puts the clip player (state loops
 * and gestures) inside the case, at this size, in place of the placeholder.
 */
export const CharacterSlot = ({ state, gesture }: CharacterSlotProps) => {
  const light = useRef(new Animated.Value(PULSE.idle[0])).current;

  useEffect(() => {
    const [low, high, ms] = PULSE[state];
    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(light, { toValue: high, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(light, { toValue: low, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    beat.start();
    return () => beat.stop();
  }, [state, light]);

  return (
    <View style={styles.case} testID="butler-character" accessibilityLabel={`Butler, ${STATE_LABELS[state]}`}>
      <Animated.View style={[styles.glow, { opacity: light }]} />
      <View style={styles.figure}>
        <View style={styles.head} />
        <View style={styles.shoulders} />
        <View style={styles.bowTie} />
      </View>
      <View style={styles.plate}>
        <Text style={styles.state} testID="butler-state">
          {STATE_LABELS[state]}
        </Text>
        {gesture ? (
          <Text style={styles.gesture} testID="butler-gesture">
            {`The butler ${GESTURE_LABELS[gesture]}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  case: {
    width: SLOT_WIDTH,
    height: SLOT_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.surfaceRaised,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  glow: {
    position: 'absolute',
    top: 40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.glow,
  },
  figure: { alignItems: 'center', marginBottom: spacing.xl + spacing.lg },
  head: { width: 92, height: 104, borderRadius: 46, backgroundColor: colors.background },
  shoulders: {
    width: 220,
    height: 120,
    marginTop: -6,
    borderTopLeftRadius: 110,
    borderTopRightRadius: 110,
    backgroundColor: colors.background,
  },
  bowTie: {
    position: 'absolute',
    top: 112,
    width: 34,
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  plate: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
  },
  state: { ...typography.label, fontSize: 16, color: colors.text },
  gesture: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },
});
