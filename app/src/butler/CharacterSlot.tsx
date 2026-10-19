import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Gesture } from '@firedrift/domain';
import { colors, fonts, radius, spacing, typography } from '../theme';
import type { CharacterState } from './butlerModel';
import { createClipPlayer } from './clipPlayer';
import { clipReducer, currentClip, initialClipView, stillFor } from './clips';
import type { ClipName } from './clips';
import { CLIP_STILLS } from './stills';

interface SurfaceViewProps {
  style?: StyleProp<ViewStyle>;
  onSurfaceViewCreated: (handle: string) => void;
  onSurfaceViewDestroyed: (handle: string) => void;
}

/** Loaded on first use: the native module exists only on Vega. */
const loadSurfaceView = (): ComponentType<SurfaceViewProps> | null => {
  try {
    return require('@amazon-devices/react-native-w3cmedia').KeplerVideoSurfaceView ?? null;
  } catch {
    return null;
  }
};

/** A gesture clip is 1–2 s; if its `ended` never comes, go back to the loop after this. */
const GESTURE_GUARD_MS = 4000;

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
 * The butler's place on screen: a lit case like the feed's. The one clip player
 * loops the clip of the state and plays a gesture once over it. If the player
 * or a clip fails (the VVD cannot decode video, spike V5), the placeholder
 * figure stays, silently.
 */
export const CharacterSlot = ({ state, gesture }: CharacterSlotProps) => {
  const light = useRef(new Animated.Value(PULSE.idle[0])).current;
  const [clip, dispatch] = useReducer(clipReducer, initialClipView);
  /** The clip the player shows now; `null` until the first one plays. */
  const [onScreen, setOnScreen] = useState<ClipName | null>(null);
  const [SurfaceView] = useState(loadSurfaceView);
  const player = useRef<ReturnType<typeof createClipPlayer> | null>(null);

  if (!player.current) {
    player.current = createClipPlayer({
      onPlaying: name => setOnScreen(name),
      onEnded: () => dispatch({ t: 'gestureEnded' }),
      onError: () => dispatch({ t: 'error' }),
    });
  }

  useEffect(() => {
    if (!SurfaceView) dispatch({ t: 'error' });
    return () => {
      player.current?.dispose();
    };
  }, [SurfaceView]);

  useEffect(() => dispatch({ t: 'state', state }), [state]);
  useEffect(() => {
    if (gesture) dispatch({ t: 'gesture', gesture });
  }, [gesture]);

  useEffect(() => {
    if (!clip.gesture) return;
    const guard = setTimeout(() => dispatch({ t: 'gestureEnded' }), GESTURE_GUARD_MS);
    return () => clearTimeout(guard);
  }, [clip.gesture]);

  const wanted = currentClip(clip);
  useEffect(() => {
    if (wanted) player.current?.play(wanted);
    // `wanted` is a new object on each render; the url and loop say if it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted?.url, wanted?.loop]);

  const onCreated = useCallback((handle: string) => player.current?.attach(handle), []);
  const onDestroyed = useCallback(() => player.current?.detach(), []);

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

  const showPlaceholder = clip.failed || !SurfaceView;
  const still = showPlaceholder ? null : stillFor(wanted, onScreen);

  return (
    <View style={styles.case} testID="butler-character" accessibilityLabel={`Butler, ${STATE_LABELS[state]}`}>
      {showPlaceholder ? (
        <>
          <Animated.View style={[styles.glow, { opacity: light }]} />
          <View style={styles.figure}>
            <View style={styles.head} />
            <View style={styles.shoulders} />
            <View style={styles.bowTie} />
          </View>
        </>
      ) : null}
      {SurfaceView && !clip.failed ? (
        <SurfaceView style={styles.video} onSurfaceViewCreated={onCreated} onSurfaceViewDestroyed={onDestroyed} />
      ) : null}
      {still ? <Image source={CLIP_STILLS[still]} style={styles.video} testID="butler-still" /> : null}
      <View style={styles.plate}>
        <Text style={styles.state} testID="butler-state">
          {STATE_LABELS[state]}
        </Text>
        {gesture && showPlaceholder ? (
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
  video: { position: 'absolute', top: 0, left: 0, width: SLOT_WIDTH, height: SLOT_HEIGHT },
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
