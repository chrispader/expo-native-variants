import type {ExpoConfig} from 'expo/config';
import type {
  NativeVariantMap,
} from 'expo-native-variants';

// Each variant points at its own API. The native build checks read API_URL back from the built apps.
function apiSettings(apiUrl: string, label: string) {
  return {
    ios: {
      buildSettings: {API_URL: apiUrl},
      environmentVariables: {API_URL: apiUrl},
      launchArguments: ['-NativeVariantsExample', 'YES'],
    },
    android: {
      buildConfigFields: {API_URL: apiUrl, ANALYTICS_ENABLED: label === 'Production', MAX_RETRIES: 3},
      resValues: {api_label: `${label}'s API`},
      manifestPlaceholders: {apiHost: new URL(apiUrl).host},
    },
  } as const;
}

export const variants = {
  production: {
    applicationId: 'com.exponativevariants.example',
    icon: './assets/icons/production.png',
    displayName: 'Variants',
    runMode: 'release',
    urlScheme: 'nativevariants',
    ...apiSettings('https://api.example.com', 'Production'),
  },
  development: {
    applicationId: 'com.exponativevariants.example.dev',
    icon: './assets/icons/development.png',
    displayName: 'Variants Dev',
    urlScheme: 'nativevariants-dev',
    ...apiSettings('https://dev.api.example.com', 'Development'),
  },
  preview: {
    applicationId: 'com.exponativevariants.example.preview',
    icon: './assets/icons/preview.png',
    displayName: 'Variants Preview',
    runMode: 'release',
    urlScheme: 'nativevariants-preview',
    ...apiSettings('https://preview.api.example.com', 'Preview'),
  },
} satisfies NativeVariantMap;

const config: ExpoConfig = {
  name: 'NativeVariants',
  slug: 'expo-native-variants-example',
  updates: {enabled: false},
  // Xcode expands the per-configuration API_URL build setting into the built Info.plist.
  ios: {infoPlist: {ApiUrl: '$(API_URL)'}},
  plugins: [
    ['expo-dev-client', {addGeneratedScheme: false}],
    ['expo-native-variants', {variants}],
  ],
};

export default config;
