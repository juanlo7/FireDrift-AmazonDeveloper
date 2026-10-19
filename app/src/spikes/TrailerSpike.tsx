import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from '@amazon-devices/webview';
import { useRemoteKeys } from '../focus';
import type { HWEvent } from '../focus';
import { colors, spacing, typography } from '../theme';
import { VideoSpike } from './VideoSpike';

/**
 * Spike on the Apple Silicon VVD (not a product screen, not for merge): can the
 * Vega WebView play a YouTube trailer, and do the butler clips decode?
 * Play/Pause (F4) cycles: local page with the IFrame API and a plain HTML5 video,
 * the YouTube embed URL loaded directly, then the butler clip player.
 */

const MODES = [
  { label: 'local page: IFrame API + HTML5 video', uri: 'file:///pkg/assets/trailer-spike.html' },
  { label: 'direct embed URL', uri: 'https://www.youtube.com/embed/Way9Dexny3w?autoplay=1&mute=1&playsinline=1' },
  { label: 'butler clip (W3C media)', uri: null },
];
const MAX_LOG = 14;

export const TrailerSpike = () => {
  const [mode, setMode] = useState(0);
  const [lines, setLines] = useState<string[]>([]);

  const log = useCallback((line: string) => {
    console.log(`[TrailerSpike] ${line}`);
    setLines(prev => [line, ...prev].slice(0, MAX_LOG));
  }, []);

  useRemoteKeys((event: HWEvent) => {
    if (event.eventKeyAction === 1) return;
    if (event.eventType === 'play' || event.eventType === 'pause' || event.eventType === 'playpause') {
      setLines([]);
      setMode(current => (current + 1) % MODES.length);
    }
  });

  const current = MODES[mode];
  return (
    <View style={styles.root}>
      <Text style={styles.status}>{`TrailerSpike: ${current.label}. F4 (Play/Pause) switches.`}</Text>
      {current.uri ? (
        <WebView
          key={current.uri}
          style={styles.web}
          source={{ uri: current.uri }}
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          onLoadStart={() => log(`onLoadStart ${current.uri}`)}
          onLoad={() => log('onLoad')}
          onError={event => log(`onError ${JSON.stringify(event.nativeEvent)}`)}
          onMessage={event => log(event.nativeEvent.data)}
        />
      ) : (
        <VideoSpike />
      )}
      {lines.map((line, index) => (
        <Text key={`${index}-${line}`} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  status: { ...typography.body, color: colors.primary, marginBottom: spacing.sm },
  web: { width: 960, height: 400, backgroundColor: '#000000', marginBottom: spacing.sm },
  line: { ...typography.caption, color: colors.textMuted },
});
