import type {NormalizedNativeVariantsOptions} from './types';

/** Native build identity wins over the config-evaluation default. */
export function selectBuildVariant(
  options: NormalizedNativeVariantsOptions,
  environment: Readonly<Record<string, string | undefined>>,
  prebuildVariant?: string,
): NormalizedNativeVariantsOptions {
  const configurationVariant = options.variants.find((variant) =>
    [variant.debugConfiguration, variant.releaseConfiguration].includes(
      environment.CONFIGURATION ?? '',
    ),
  );
  // Xcode builds of the plain Debug and Release configurations use the variant prebuild wrote into them.
  const key = environment.EXPO_NATIVE_VARIANT_KEY ?? configurationVariant?.key ?? prebuildVariant;
  if (key === undefined) {
    return options;
  }
  const selectedVariant = options.variants.find((variant) => variant.key === key);
  if (selectedVariant === undefined) {
    throw new Error(
      `Native build references unknown variant "${key}". Run prebuild again after changing variants.`,
    );
  }
  return Object.freeze({...options, selectedVariant});
}
