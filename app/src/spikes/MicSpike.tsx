import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
// The lint rule asks for `settings.control` for any use of this library. Recording needs only
// `microphone.access` (see `docs/spikes.md`), so the rule is off for this import.
/* eslint-disable @amazon-devices/kepler/api-privileges-check */
import {
  AudioChannelMask,
  AudioRecordStreamBuilder,
  AudioSampleFormat,
  AudioSampleRate,
  AudioSource,
} from '@amazon-devices/keplerscript-audio-lib';
import type { AudioRecordStream } from '@amazon-devices/keplerscript-audio-lib';
import { SecurityManager } from '@amazon-devices/security-manager-lib';
import { useRemoteKeys } from '../focus';
import type { HWEvent } from '../focus';
import { colors, spacing, typography } from '../theme';

/**
 * Spike V2 (issue #53): can the app capture PCM 16 kHz from the microphone
 * while a remote button is held, and which button can we use?
 * Hold OK (or Play/Pause) to record. Everything is logged on screen.
 * Not a product screen: the butler (FR-5) builds the real one.
 */

const MIC_PRIVILEGE = 'com.amazon.audio.privilege.microphone.access';
const PTT_KEYS = ['select', 'enter', 'play', 'pause', 'playpause'];
/** If no key event arrives for this long, treat the button as released. */
const RELEASE_TIMEOUT_MS = 700;
const READ_BYTES = 3200; // 100 ms of 16 kHz, 16 bit, mono
const MAX_LOG = 14;
/** Each capture tries the next source, to find one the VVD backs with a device. */
const SOURCES = [AudioSource.VOICE_RECOGNITION, AudioSource.RAW, AudioSource.VOICE_COMMUNICATION];

const peakOf = (buffer: ArrayBuffer): number => {
  const samples = new Int16Array(buffer, 0, Math.floor(buffer.byteLength / 2));
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  return peak;
};

export const MicSpike = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [summary, setSummary] = useState('No capture yet');

  const streamRef = useRef<AudioRecordStream | null>(null);
  const activeRef = useRef(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyUpSeen = useRef(false);
  const attempt = useRef(0);

  const log = useCallback((line: string) => {
    console.log(`[MicSpike] ${line}`);
    setLines(prev => [line, ...prev].slice(0, MAX_LOG));
  }, []);

  const stop = useCallback(async () => {
    if (!activeRef.current) {
      return;
    }
    activeRef.current = false;
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) {
      return;
    }
    activeRef.current = true;
    setRecording(true);
    const startedAt = Date.now();
    let bytes = 0;
    let peak = 0;
    let reads = 0;
    try {
      const state = await SecurityManager.requestPrivilege(MIC_PRIVILEGE);
      log(`privilege: ${String(state)}`);

      const builder = new AudioRecordStreamBuilder();
      builder.setAudioConfig({
        sampleRate: AudioSampleRate.SAMPLE_RATE_16_KHZ,
        channelMask: AudioChannelMask.CHANNEL_MONO,
        format: AudioSampleFormat.FORMAT_PCM_16_BIT,
      });
      const source = SOURCES[attempt.current % SOURCES.length];
      attempt.current += 1;
      log(`source ${AudioSource[source]}`);
      builder.setAudioSource(source);
      const stream = await builder.buildAsync();
      streamRef.current = stream;
      const config = await stream.getAudioConfigAsync();
      log(`stream ${stream.streamId}: ${JSON.stringify(config)}`);
      log(`initCheck ${await stream.initCheckAsync()}`);
      const minBytes = await stream.getMinBufferSizeInBytesAsync();
      log(`minBuffer ${minBytes}, rate ${await stream.getSampleRateAsync()}, ch ${await stream.getChannelCountAsync()}`);
      const readBytes = minBytes > 0 ? minBytes : READ_BYTES;

      while (activeRef.current) {
        const chunk = await stream.readAsync(readBytes);
        reads += 1;
        bytes += chunk.byteLength;
        peak = Math.max(peak, peakOf(chunk));
      }
    } catch (error) {
      log(`error: ${String((error as Error)?.message ?? error)}`);
    } finally {
      const stream = streamRef.current;
      streamRef.current = null;
      if (stream) {
        try {
          await AudioRecordStreamBuilder.destroyAsync(stream);
        } catch (error) {
          log(`destroy error: ${String((error as Error)?.message ?? error)}`);
        }
      }
      activeRef.current = false;
      setRecording(false);
      const ms = Date.now() - startedAt;
      const rate = ms > 0 ? Math.round((bytes / 2 / ms) * 1000) : 0;
      setSummary(
        `${ms} ms, ${reads} reads, ${bytes} bytes (~${rate} samples/s), peak ${peak}/32767`,
      );
      log(`done: ${bytes} bytes, peak ${peak}`);
    }
  }, [log]);

  useRemoteKeys((event: HWEvent) => {
    log(`key ${event.eventType} action=${String(event.eventKeyAction)}`);
    if (!PTT_KEYS.includes(event.eventType)) {
      return;
    }
    if (event.eventKeyAction === 1) {
      keyUpSeen.current = true;
      if (releaseTimer.current) {
        clearTimeout(releaseTimer.current);
      }
      stop();
      return;
    }
    if (releaseTimer.current) {
      clearTimeout(releaseTimer.current);
    }
    // Some remotes never send a release: stop when repeats stop.
    releaseTimer.current = setTimeout(() => {
      if (!keyUpSeen.current) {
        log('no key-up event: stopped by timeout');
      }
      stop();
    }, RELEASE_TIMEOUT_MS);
    start();
  });

  useEffect(
    () => () => {
      activeRef.current = false;
      if (releaseTimer.current) {
        clearTimeout(releaseTimer.current);
      }
    },
    [],
  );

  return (
    <View style={styles.box} testID="mic-spike">
      <Text style={[styles.status, recording && styles.live]}>
        {recording ? 'RECORDING: keep OK held' : 'MicSpike v3: hold OK or Play/Pause to record'}
      </Text>
      <Text style={styles.summary}>{summary}</Text>
      {lines.map((line, index) => (
        <Text key={`${index}-${line}`} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { marginBottom: spacing.lg },
  status: { ...typography.body, color: colors.text, marginBottom: spacing.sm },
  live: { color: colors.danger },
  summary: { ...typography.body, color: colors.primary, marginBottom: spacing.sm },
  line: { ...typography.body, color: colors.textMuted },
});
