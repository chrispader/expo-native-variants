import type {ConfigPlugin} from 'expo/config-plugins';

import {withAndroidVariants} from './android';
import {withIosVariants} from './ios';
import {applySelectedVariantIdentifiers} from './options/applySelectedVariantIdentifiers';
import {normalizeNativeVariants} from './options';
import type {NativeVariantsOptions, NormalizedNativeVariantsOptions} from './options';

export const withNativeVariants: ConfigPlugin<NativeVariantsOptions> = (config, options) => {
  const normalizedOptions = normalizeNativeVariants({
    configName: config.name,
    options,
  });

  const selectedConfig = applySelectedVariantIdentifiers(
    config,
    normalizedOptions.selectedVariant,
  );

  return composeNativeVariantMods(selectedConfig, normalizedOptions);
};

export {normalizeNativeVariants} from './options';
export type {
  NativeVariantAndroidOptions,
  NativeVariantIosOptions,
  NativeVariantMap,
  NativeVariantOptions,
  NativeVariantRunMode,
  NativeVariantsIosOptions,
  NativeVariantsIosTargetOptions,
  NativeVariantsOptions,
  NormalizedNativeVariant,
  NormalizedNativeVariantsIosTarget,
  NormalizedNativeVariantsOptions,
  NormalizeNativeVariantsArgs,
} from './options';

export default withNativeVariants;

function composeNativeVariantMods(
  config: Parameters<ConfigPlugin>[0],
  options: NormalizedNativeVariantsOptions,
): ReturnType<ConfigPlugin> {
  const withIos = withIosVariants(config, options);
  return withAndroidVariants(withIos, options);
}
