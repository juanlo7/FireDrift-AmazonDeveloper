import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KeplerVideoSurfaceView } from '@amazon-devices/react-native-w3cmedia';
import { VideoPlayer } from '@amazon-devices/react-native-w3cmedia/dist/headless';
import { useRemoteKeys } from '../focus';
import type { HWEvent } from '../focus';
import { colors, spacing, typography } from '../theme';

/**
 * Spike V5 (issue #53): can the app play a looping local MP4 (the butler clip
 * player, FR-5) and how much memory does it take?
 * Press Play/Pause to switch the source: the clip packaged in `assets/`, then a
 * remote file, to tell "player broken" from "local path broken".
 * Not a product screen.
 */

const SOURCES = [
  { label: 'butler idle clip', uri: 'file:///pkg/assets/butler/idle.mp4' },
  {
    label: 'remote https',
    uri: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
];
const MAX_LOG = 8;

export const VideoSpike = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loops, setLoops] = useState(0);

  const playerRef = useRef<VideoPlayer | null>(null);
  const handleRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const lastTime = useRef(0);

  const log = useCallback((line: string) => {
    console.log(`[VideoSpike] ${line}`);
    setLines(prev => [line, ...prev].slice(0, MAX_LOG));
  }, []);

  const load = useCallback(
    (index: number) => {
      const player = playerRef.current;
      if (!player || !readyRef.current) {
        return;
      }
      const source = SOURCES[index % SOURCES.length];
      log(`src ${source.label}: ${source.uri}`);
      lastTime.current = 0;
      setLoops(0);
      player.src = source.uri;
      player.load();
    },
    [log],
  );

  const onSurfaceViewCreated = useCallback(
    async (surfaceHandle: string) => {
      handleRef.current = surfaceHandle;
      try {
        const player = new VideoPlayer();
        await player.initialize();
        playerRef.current = player;
        player.setSurfaceHandle(surfaceHandle);
        player.autoplay = true;
        player.loop = true;
        player.muted = true;
        player.addEventListener('loadeddata', () => log('loadeddata'));
        player.addEventListener('playing', () => log('playing'));
        player.addEventListener('error', () => {
          log(`error: code ${String(player.error?.code)} ${String(player.error?.message)}`);
        });
        player.addEventListener('timeupdate', () => {
          if (player.currentTime < lastTime.current - 0.5) {
            setLoops(count => count + 1);
          }
          lastTime.current = player.currentTime;
        });
        readyRef.current = true;
        log('player ready');
        load(0);
      } catch (error) {
        log(`init error: ${String((error as Error)?.message ?? error)}`);
      }
    },
    [load, log],
  );

  const onSurfaceViewDestroyed = useCallback(async (surfaceHandle: string) => {
    readyRef.current = false;
    const player = playerRef.current;
    playerRef.current = null;
    if (player) {
      player.clearSurfaceHandle(surfaceHandle);
      await player.deinitialize();
    }
  }, []);

  useRemoteKeys((event: HWEvent) => {
    if (event.eventKeyAction === 1) {
      return;
    }
    if (event.eventType === 'fastforward') {
      const next = sourceIndex + 1;
      setSourceIndex(next);
      load(next);
    }
  });

  useEffect(
    () => () => {
      readyRef.current = false;
    },
    [],
  );

  return (
    <View style={styles.box} testID="video-spike">
      <Text style={styles.status}>
        VideoSpike v2: {SOURCES[sourceIndex % SOURCES.length].label}, loops {loops}. Fast forward switches source.
      </Text>
      <KeplerVideoSurfaceView
        style={styles.video}
        onSurfaceViewCreated={onSurfaceViewCreated}
        onSurfaceViewDestroyed={onSurfaceViewDestroyed}
      />
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
  status: { ...typography.body, color: colors.primary, marginBottom: spacing.sm },
  video: { width: 320, height: 180, marginBottom: spacing.sm },
  line: { ...typography.body, color: colors.textMuted },
});
