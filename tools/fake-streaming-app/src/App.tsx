import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

// Test double for a streaming app (Watch now, FR-3): shows the URI it was opened with.
export const App = () => {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const add = (url: string | null) => url && setUrls(prev => [url, ...prev].slice(0, 5));
    Linking.getInitialURL().then(add).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => add(url));
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.logo}>FAKE STREAMING APP</Text>
      <Text style={styles.label}>Opened with:</Text>
      {urls.length === 0 ? (
        <Text style={styles.url}>(no deep link)</Text>
      ) : (
        urls.map((url, i) => (
          <Text key={`${i}-${url}`} style={styles.url} testID={`url-${i}`}>
            {url}
          </Text>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#141414', justifyContent: 'center', alignItems: 'center' },
  logo: { color: '#FF6A3D', fontSize: 80, fontWeight: '800', marginBottom: 48 },
  label: { color: '#999', fontSize: 32 },
  url: { color: '#fff', fontSize: 36, marginTop: 16 },
});
