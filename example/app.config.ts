import type { ExpoConfig } from 'expo/config';
import { createNativeVariantsConfig } from 'expo-native-variants/config';

import variants from './variants.json';

const config: ExpoConfig = {
  name: 'NativeVariants',
  slug: 'expo-native-variants-example',
  version: '1.0.0',
  orientation: 'portrait',
  ios: { bundleIdentifier: 'com.exponativevariants.example' },
  android: { package: 'com.exponativevariants.example' },
  updates: { enabled: false },
  plugins: [
    ['expo-dev-client', { addGeneratedScheme: false }],
  ],
};

export default () => createNativeVariantsConfig({
  config,
  options: variants,
  variant: process.env.NATIVE_VARIANT,
});
