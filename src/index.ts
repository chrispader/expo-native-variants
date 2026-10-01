import type {ConfigPlugin} from 'expo/config-plugins';

import {withAndroidVariants} from './android';
import {withIosVariants} from './ios';
import {applySelectedVariantIdentifiers} from './options/applySelectedVariantIdentifiers';
import {normalizeNativeVariants} from './options';
import {selectBuildVariant} from './options/selectBuildVariant';
import {resolveVariantIcons} from './icons/resolve';
import type {NativeVariantsOptions, NormalizedNativeVariantsOptions} from './options';
import {applySelectedVariantUpdateChannel, getNativeUpdateChannels} from './updates';
import type {NativeUpdateChannels} from './updates';

export const withNativeVariants: ConfigPlugin<NativeVariantsOptions> = (config, options) => {
  const normalizedOptions = resolveVariantIcons(
    config,
    selectBuildVariant(
      normalizeNativeVariants({
        configName: config.name,
        options: {...options, variant: options?.variant ?? process.env.NATIVE_VARIANT},
      }),
      process.env,
    ),
  );

  const updates = getNativeUpdateChannels(config, normalizedOptions);
  const selectedConfig = applySelectedVariantUpdateChannel(
    applySelectedVariantIdentifiers(
      config,
      normalizedOptions.selectedVariant,
      normalizedOptions.variants,
    ),
    normalizedOptions,
    updates,
  );

  return composeNativeVariantMods(selectedConfig, normalizedOptions, updates);
};

export {normalizeNativeVariants} from './options';
export type {
  NativeVariantAdaptiveIcon,
  NativeVariantIosIcon,
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
  updates: NativeUpdateChannels,
): ReturnType<ConfigPlugin> {
  const withIos = withIosVariants(config, options, updates);
  return withAndroidVariants(withIos, options, updates);
}
