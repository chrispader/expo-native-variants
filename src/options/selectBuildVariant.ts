import type {NormalizedNativeVariantsOptions} from './types';

/** Native build identity wins over the config-evaluation default. */
export function selectBuildVariant(
  options: NormalizedNativeVariantsOptions,
  environment: Readonly<Record<string, string | undefined>>,
): NormalizedNativeVariantsOptions {
  const nativeKey = environment.EXPO_NATIVE_VARIANT_KEY;
  const configurationVariant = options.variants.find((variant) =>
    [variant.debugConfiguration, variant.releaseConfiguration].includes(
      environment.CONFIGURATION ?? '',
    ),
  );
  if (nativeKey === undefined && configurationVariant === undefined) {
    return options;
  }
  const selectedVariant =
    nativeKey === undefined
      ? configurationVariant
      : options.variants.find(({key}) => key === nativeKey);
  if (selectedVariant === undefined) {
    throw new Error(
      `Native build references unknown variant "${nativeKey}". Run prebuild again after changing variants.`,
    );
  }
  return Object.freeze({...options, selectedVariant});
}
