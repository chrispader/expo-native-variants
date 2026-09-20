import type {ConfigPlugin} from 'expo/config-plugins';

import type {NormalizedNativeVariant} from './types';

type ExpoConfig = Parameters<ConfigPlugin>[0];

export function applySelectedVariantIdentifiers(
  config: ExpoConfig,
  selectedVariant: NormalizedNativeVariant,
): ExpoConfig {
  return {
    ...config,
    android: {
      ...config.android,
      package: selectedVariant.androidApplicationId,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: selectedVariant.iosBundleIdentifier,
    },
  };
}
