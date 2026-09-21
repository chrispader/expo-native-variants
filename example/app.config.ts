import type {ExpoConfig} from 'expo/config';
import type {
  NativeVariantMap,
} from 'expo-native-variants';

export const variants = {
  production: {
    applicationId: 'com.exponativevariants.example',
    icon: './assets/icons/production.png',
    displayName: 'Variants',
    runMode: 'release',
    urlScheme: 'nativevariants',
  },
  development: {
    applicationId: 'com.exponativevariants.example.dev',
    icon: './assets/icons/development.png',
    displayName: 'Variants Dev',
    urlScheme: 'nativevariants-dev',
  },
  preview: {
    applicationId: 'com.exponativevariants.example.preview',
    icon: './assets/icons/preview.png',
    displayName: 'Variants Preview',
    runMode: 'release',
    urlScheme: 'nativevariants-preview',
  },
} satisfies NativeVariantMap;

const config: ExpoConfig = {
  name: 'NativeVariants',
  slug: 'expo-native-variants-example',
  updates: {enabled: false},
  plugins: [
    ['expo-dev-client', {addGeneratedScheme: false}],
    ['expo-native-variants', {variants}],
  ],
};

export default config;
