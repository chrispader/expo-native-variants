import type {ConfigPlugin} from 'expo/config-plugins';

import type {NormalizedNativeVariant} from './types';

type ExpoConfig = Parameters<ConfigPlugin>[0];

export function applySelectedVariantIdentifiers(
  config: ExpoConfig,
  selectedVariant: NormalizedNativeVariant,
  variants: readonly NormalizedNativeVariant[] = [selectedVariant],
): ExpoConfig {
  const existingSchemes =
    typeof config.scheme === 'string' ? [config.scheme] : (config.scheme ?? []);
  const variantSchemes = new Set(variants.map(({urlScheme}) => urlScheme.toLowerCase()));
  const schemes = [
    selectedVariant.urlScheme,
    ...existingSchemes.filter((scheme) => !variantSchemes.has(scheme.toLowerCase())),
  ];
  return {
    ...config,
    scheme: schemes.length === 1 ? selectedVariant.urlScheme : schemes,
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
