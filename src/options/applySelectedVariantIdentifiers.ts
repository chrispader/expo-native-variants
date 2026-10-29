import type {ConfigPlugin} from 'expo/config-plugins';

import type {NormalizedNativeVariant, NormalizedNativeVariantsIosTarget} from './types';

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

/**
 * Target plugins such as @bacons/apple-targets record extension identifiers for
 * EAS credentials before this plugin sets the selected app identifier.
 */
export function applySelectedExtensionIdentifiers(
  config: ExpoConfig,
  selectedVariant: NormalizedNativeVariant,
  iosTargets: readonly NormalizedNativeVariantsIosTarget[],
): ExpoConfig {
  const ios = config.extra?.eas?.build?.experimental?.ios;
  const appExtensions: unknown = ios?.appExtensions;
  if (!Array.isArray(appExtensions)) return config;

  const suffixByTarget = new Map(
    iosTargets.map(({name, bundleIdentifierSuffix}) => [name, bundleIdentifierSuffix]),
  );
  const updated = appExtensions.map((extension: unknown) => {
    if (typeof extension !== 'object' || extension === null || !('targetName' in extension)) {
      return extension;
    }
    const suffix =
      typeof extension.targetName === 'string' ? suffixByTarget.get(extension.targetName) : undefined;
    if (suffix === undefined) return extension;
    return {...extension, bundleIdentifier: `${selectedVariant.iosBundleIdentifier}${suffix}`};
  });
  const {eas} = config.extra ?? {};
  return {
    ...config,
    extra: {
      ...config.extra,
      eas: {
        ...eas,
        build: {
          ...eas.build,
          experimental: {...eas.build.experimental, ios: {...ios, appExtensions: updated}},
        },
      },
    },
  };
}
