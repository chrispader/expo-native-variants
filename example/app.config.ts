import type {ExpoConfig} from 'expo/config';
import type {
  NativeVariantMap,
  NativeVariantsOptions,
} from 'expo-native-variants';

export const variants = {
  production: {
    applicationId: 'com.exponativevariants.example',
    displayName: 'Variants',
    runMode: 'release',
    urlScheme: 'nativevariants',
  },
  development: {
    applicationId: 'com.exponativevariants.example.dev',
    displayName: 'Variants Dev',
    urlScheme: 'nativevariants-dev',
  },
  preview: {
    applicationId: 'com.exponativevariants.example.preview',
    displayName: 'Variants Preview',
    runMode: 'release',
    urlScheme: 'nativevariants-preview',
  },
} satisfies NativeVariantMap;

const nativeVariants = {
  variant: process.env.NATIVE_VARIANT,
  variants,
} satisfies NativeVariantsOptions;

const config: ExpoConfig = {
  name: 'NativeVariants',
  slug: 'expo-native-variants-example',
  updates: {enabled: false},
  plugins: [
    ['expo-dev-client', {addGeneratedScheme: false}],
    ['expo-native-variants', nativeVariants],
  ],
};

export default config;
