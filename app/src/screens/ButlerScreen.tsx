import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Chip, Gesture, TitleCard } from '@firedrift/domain';
import { api } from '../api';
import {
  butlerReducer,
  butlerSessionInfo,
  characterState,
  CharacterSlot,
  createSpeechPlayer,
  FALLBACK_REASONS,
  fallbackEvent,
  initialView,
  openButlerSession,
  pickFromPool,
  type ButlerSession,
} from '../butler';
import { FocusableButton, Screen } from '../components';
import { deviceProfile } from '../profile';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { WatchNowSheet } from '../watchNow';

/** How long a gesture's caption stays on the placeholder; the clips are 1–2 s. */
const GESTURE_MS = 1500;
const titleKey = (title: TitleCard) => `${title.type}:${title.tmdbId}`;

/**
 * FR-5: the butler. One session per visit (the feed warms it up). Chips with
 * the D-pad; the answer is shown and spoken; a suggestion card with Watch now;
 * Undo and Reset for taste changes. When the agent is off or over a cap, the
 * chips are answered from the taste algorithm, so the screen is never blank.
 */
export const ButlerScreen = () => {
  const [view, dispatch] = useReducer(butlerReducer, initialView);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [watchNow, setWatchNow] = useState<TitleCard | null>(null);
  const [note, setNote] = useState('');
  const session = useRef<ButlerSession | null>(null);
  const speech = useRef<ReturnType<typeof createSpeechPlayer> | null>(null);
  const shown = useRef(new Set<string>());
  const pool = useRef<TitleCard[]>([]);

  useEffect(() => {
    let gestureTimer: ReturnType<typeof setTimeout> | undefined;
    let left = false;
    const player = createSpeechPlayer({
      onTalking: talking => dispatch({ t: 'talking', talking }),
      onGesture: name => {
        setGesture(name);
        if (gestureTimer) clearTimeout(gestureTimer);
        gestureTimer = setTimeout(() => setGesture(null), GESTURE_MS);
      },
    });
    speech.current = player;
    butlerSessionInfo()
      .then(info => {
        if (left) return;
        session.current = openButlerSession(info, {
          onEvent: event => {
            if (event.t === 'speech') player.enqueue(event);
            else dispatch({ t: 'agent', event });
            if (event.t === 'suggestion') shown.current.add(titleKey(event.title));
          },
        });
      })
      .catch(() => dispatch({ t: 'agent', event: fallbackEvent() }));
    return () => {
      left = true;
      if (gestureTimer) clearTimeout(gestureTimer);
      session.current?.end();
      player.dispose();
    };
  }, []);

  const answerFromTaste = useCallback(async (chip: Chip, current: TitleCard | null) => {
    try {
      if (pool.current.length === 0) {
        pool.current = (await api.getPool(await deviceProfile.getProfileId())).titles;
      }
      const title = pickFromPool(pool.current, shown.current, current, chip.id);
      if (!title) return;
      shown.current.add(titleKey(title));
      dispatch({
        t: 'suggested',
        suggestion: { title, reason: FALLBACK_REASONS[chip.id] ?? 'A pick from your taste.' },
      });
    } catch {
      setNote('Nothing new right now. Try the feed.');
    }
  }, []);

  const choose = (chip: Chip) => {
    setNote('');
    if (chip.id === 'watch_now' && view.suggestion) {
      openWatchNow(view.suggestion.title);
      return;
    }
    if (view.fallback || !session.current) {
      answerFromTaste(chip, view.suggestion?.title ?? null);
      return;
    }
    speech.current?.stop();
    dispatch({ t: 'asked' });
    session.current.send({ t: 'chip.select', chipId: chip.id });
  };

  const openWatchNow = (title: TitleCard) => {
    session.current?.send({ t: 'suggestion.feedback', tmdbId: title.tmdbId, type: title.type, kind: 'watch_now' });
    setWatchNow(title);
  };

  const changeTaste = async (action: 'undo' | 'reset') => {
    try {
      const profileId = await deviceProfile.getProfileId();
      await (action === 'undo' ? api.undoWeights(profileId) : api.resetWeights(profileId));
      dispatch({ t: 'weightsCleared' });
      setNote(action === 'undo' ? 'Undone. Your taste is back as it was.' : 'Your taste adjustments are reset.');
    } catch {
      setNote('Could not change your taste right now.');
    }
  };

  const suggestion = view.suggestion;
  const firstChip = view.chips[0]?.id;

  return (
    <Screen testID="screen-butler">
      <View style={styles.row}>
        <CharacterSlot state={characterState(view)} gesture={gesture} />

        <View style={styles.side}>
          {view.heard ? <Text style={styles.heard}>{`You said: “${view.heard}”`}</Text> : null}
          <Text style={styles.answer} numberOfLines={4} testID="butler-answer">
            {view.answer || (view.waiting ? '' : 'What are you in the mood for?')}
          </Text>

          {suggestion ? (
            <View style={styles.card} testID="butler-suggestion">
              {suggestion.title.posterUrl ? (
                <Image source={{ uri: suggestion.title.posterUrl }} style={styles.poster} />
              ) : (
                <View style={[styles.poster, styles.noPoster]} />
              )}
              <View style={styles.cardText}>
                <Text style={styles.name} numberOfLines={2}>
                  {suggestion.title.name}
                </Text>
                <Text style={styles.meta}>
                  {[suggestion.title.year, suggestion.title.runtimeMinutes && `${suggestion.title.runtimeMinutes} min`]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <Text style={styles.reason} numberOfLines={2}>
                  {suggestion.reason}
                </Text>
                <FocusableButton
                  label="Watch now"
                  onPress={() => openWatchNow(suggestion.title)}
                  style={styles.watch}
                  testID="butler-watch-now"
                />
              </View>
            </View>
          ) : null}

          {view.weightChange ? (
            <View style={styles.taste} testID="butler-weights">
              <Text style={styles.tasteText} numberOfLines={2}>
                {`Taste changed: ${view.weightChange.reason}`}
              </Text>
              <FocusableButton label="Undo" onPress={() => changeTaste('undo')} testID="butler-undo" />
              <FocusableButton label="Reset" onPress={() => changeTaste('reset')} testID="butler-reset" />
            </View>
          ) : null}

          {note ? <Text style={styles.note}>{note}</Text> : null}

          <View style={styles.chips} testID="butler-chips">
            {view.chips.map(chip => (
              <FocusableButton
                key={chip.id}
                label={chip.label}
                hasTVPreferredFocus={chip.id === firstChip}
                onPress={() => choose(chip)}
                testID={`butler-chip-${chip.id}`}
              />
            ))}
          </View>
          <Text style={styles.hint}>Back · Feed</Text>
        </View>
      </View>

      <WatchNowSheet title={watchNow} onClose={() => setWatchNow(null)} source="butler" />
    </Screen>
  );
};

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', gap: spacing.xl, alignItems: 'center' },
  side: { flex: 1, gap: spacing.md, justifyContent: 'center' },
  heard: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  answer: { ...typography.subtitle, color: colors.text, minHeight: 52 },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  poster: { width: 92, height: 138, borderRadius: radius.sm },
  noPoster: { backgroundColor: colors.surfaceRaised },
  cardText: { flex: 1, gap: spacing.xs },
  name: { ...typography.title, fontSize: 30, lineHeight: 30, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
  reason: { ...typography.body, color: colors.text },
  watch: { alignSelf: 'flex-start', marginTop: spacing.xs },
  taste: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tasteText: { ...typography.caption, color: colors.textMuted, flex: 1 },
  note: { ...typography.caption, color: colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { ...typography.label, color: colors.textMuted, marginTop: spacing.xs },
});
