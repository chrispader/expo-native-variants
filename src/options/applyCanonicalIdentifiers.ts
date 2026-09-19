import type {ConfigPlugin} from 'expo/config-plugins';

import type {NormalizedNativeVariant} from './types';

type ExpoConfig = Parameters<ConfigPlugin>[0];

export function applyCanonicalIdentifiers(
  config: ExpoConfig,
  canonicalVariant: NormalizedNativeVariant,
): ExpoConfig {
  assertIdentifierMatches({
    actual: config.ios?.bundleIdentifier,
    expected: canonicalVariant.iosBundleIdentifier,
    label: 'ios.bundleIdentifier',
  });
  assertIdentifierMatches({
    actual: config.android?.package,
    expected: canonicalVariant.androidApplicationId,
    label: 'android.package',
  });

  return {
    ...config,
    android: {
      ...config.android,
      package: canonicalVariant.androidApplicationId,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: canonicalVariant.iosBundleIdentifier,
    },
  };
}

function assertIdentifierMatches({
  actual,
  expected,
  label,
}: Readonly<{
  actual: string | undefined;
  expected: string;
  label: string;
}>): void {
  if (actual !== undefined && actual !== expected) {
    throw new Error(
      `${label} is "${actual}", but canonicalVariant requires "${expected}". Update the Expo config or select the matching canonical variant.`,
    );
  }
}
