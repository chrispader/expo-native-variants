import * as Application from 'expo-application';
import { getNativeVariant } from 'expo-native-variants/runtime';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { variants } from './variants.json';

export default function App() {
  const variant = getNativeVariant(Application.applicationId, variants);
  const [lastLink, setLastLink] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>EXPO NATIVE VARIANTS</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {Application.applicationName}
      </Text>
      <Text testID="variant" style={styles.variant}>{variant ?? 'Unknown variant'}</Text>
      <Text testID="application-id" style={styles.detail}>{Application.applicationId}</Text>
      <Text style={styles.detail}>{__DEV__ ? 'Debug build' : 'Release build'}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={async () => setLastLink(await Linking.getInitialURL())}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Show launch URL</Text>
      </Pressable>
      <Text testID="launch-url" style={styles.detail}>{lastLink ?? 'No launch URL read'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#101820' },
  eyebrow: { color: '#89adba', fontSize: 12, letterSpacing: 2, marginBottom: 18 },
  title: { color: '#ffffff', fontSize: 34, fontWeight: '700', marginBottom: 12 },
  variant: { color: '#74e3b9', fontSize: 24, marginBottom: 18 },
  detail: { color: '#c4d4dc', fontSize: 14, marginBottom: 12 },
  button: { backgroundColor: '#74e3b9', padding: 16, borderRadius: 8, marginVertical: 18 },
  buttonText: { color: '#101820', fontWeight: '600', textAlign: 'center' },
});
