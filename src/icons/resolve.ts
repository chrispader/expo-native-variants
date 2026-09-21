import type {ExpoConfig} from 'expo/config';

import type {NormalizedNativeVariant, NormalizedNativeVariantsOptions} from '../options';
import {readAdaptiveIcon, readIosIcon} from '../options/icons';

export function resolveVariantIcons(
  config: ExpoConfig,
  options: NormalizedNativeVariantsOptions,
): NormalizedNativeVariantsOptions {
  const variants = options.variants.map((variant) => {
    const sharedIosIcon = config.ios?.icon ?? config.icon;
    // Expo remains responsible for a shared Icon Composer catalog. Only
    // per-variant image catalogs are generated here.
    const inheritedIosIcon =
      typeof sharedIosIcon === 'string' && /\.icon\/?$/i.test(sharedIosIcon)
        ? undefined
        : sharedIosIcon;
    const iosIcon = readIosIcon(
      variant.iosIcon ?? variant.icon ?? inheritedIosIcon,
      `Variant "${variant.key}" iOS icon`,
    );
    const androidIcon = variant.androidIcon ?? variant.icon ?? config.android?.icon ?? config.icon;
    // An explicit variant icon replaces all shared artwork, including adaptive layers.
    const adaptiveBase =
      variant.androidIcon === undefined && variant.icon === undefined
        ? config.android?.adaptiveIcon
        : undefined;
    const androidAdaptiveIcon = readAdaptiveIcon(
      variant.androidAdaptiveIcon === undefined
        ? adaptiveBase
        : {...adaptiveBase, ...variant.androidAdaptiveIcon},
      `Variant "${variant.key}" Android adaptive icon`,
    );
    return Object.freeze({
      ...variant,
      ...(iosIcon === undefined ? {} : {iosIcon}),
      ...(androidIcon === undefined ? {} : {androidIcon}),
      ...(androidAdaptiveIcon === undefined
        ? {}
        : {androidAdaptiveIcon: Object.freeze(androidAdaptiveIcon)}),
    });
  });
  const selectedVariant = variants.find(({key}) => key === options.selectedVariant.key);
  if (selectedVariant === undefined)
    throw new Error('Selected variant is missing from the variant map.');
  return Object.freeze({
    ...options,
    variants: Object.freeze(variants),
    selectedVariant,
  });
}

export function iosIconName(variant: NormalizedNativeVariant): string | undefined {
  return variant.iosIcon === undefined ? undefined : `NativeVariant${variant.androidFlavor}`;
}

export function applyIosIconBuildSettings(
  settings: Record<string, unknown>,
  variant: NormalizedNativeVariant,
): void {
  const name = iosIconName(variant);
  const previous = settings.EXPO_NATIVE_VARIANTS_APP_ICON;
  const current = settings.ASSETCATALOG_COMPILER_APPICON_NAME;
  if (name === undefined) {
    if (previous !== undefined && current === previous) {
      settings.ASSETCATALOG_COMPILER_APPICON_NAME = settings.EXPO_NATIVE_VARIANTS_ORIGINAL_APP_ICON;
    }
    delete settings.EXPO_NATIVE_VARIANTS_APP_ICON;
    delete settings.EXPO_NATIVE_VARIANTS_ORIGINAL_APP_ICON;
    return;
  }
  if (current !== previous || previous === undefined) {
    settings.EXPO_NATIVE_VARIANTS_ORIGINAL_APP_ICON = current ?? 'AppIcon';
  }
  const quotedName = `"${name}"`;
  settings.ASSETCATALOG_COMPILER_APPICON_NAME = quotedName;
  settings.EXPO_NATIVE_VARIANTS_APP_ICON = quotedName;
}
