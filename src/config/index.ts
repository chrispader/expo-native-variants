import type {ExpoConfig} from 'expo/config';

import {normalizeNativeVariants} from '../options';
import type {NativeVariantOptions, NativeVariantsOptions} from '../options';

const PLUGIN_NAME = 'expo-native-variants';
const PLUGIN_SPECIFIERS = new Set([
  PLUGIN_NAME,
  `${PLUGIN_NAME}/app.plugin.js`,
]);

export type CreateNativeVariantsConfigArgs = Readonly<{
  config: ExpoConfig;
  options: NativeVariantsConfigInput;
  variant?: string;
}>;

type NativeVariantConfigInput = Readonly<
  Omit<NativeVariantOptions, 'runMode'> & {runMode?: string}
>;

export type NativeVariantsConfigInput = Readonly<
  Omit<NativeVariantsOptions, 'variants'> & {
    variants: Readonly<Record<string, NativeVariantConfigInput>>;
  }
>;

/**
 * Projects one variant's identifiers into app config before EAS reads them,
 * while registering the plugin with the complete native variant matrix.
 * This helper remains experimental until cloud builds are verified.
 */
export function createNativeVariantsConfig({
  config,
  options,
  variant,
}: CreateNativeVariantsConfigArgs): ExpoConfig {
  assertPluginIsNotRegistered(config.plugins);
  const canonicalVariant =
    variant ?? options.canonicalVariant ?? options.defaultVariant;
  const normalized = normalizeNativeVariants({
    canonicalVariant,
    configName: config.name,
    options,
  });
  const selected = normalized.canonicalVariant;
  const pluginOptions: NativeVariantsConfigInput = {
    ...options,
    canonicalVariant: selected.key,
  };

  return {
    ...config,
    android: {
      ...config.android,
      package: selected.androidApplicationId,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: selected.iosBundleIdentifier,
    },
    plugins: [...(config.plugins ?? []), [PLUGIN_NAME, pluginOptions]],
  };
}

function assertPluginIsNotRegistered(plugins: ExpoConfig['plugins']): void {
  const existingRegistration = plugins?.find(
    (plugin) =>
      (typeof plugin === 'string' && PLUGIN_SPECIFIERS.has(plugin)) ||
      (Array.isArray(plugin) && PLUGIN_SPECIFIERS.has(plugin[0] ?? '')),
  );
  if (existingRegistration !== undefined) {
    throw new Error(
      'expo-native-variants is already registered in config.plugins. Remove the existing entry before using createNativeVariantsConfig.',
    );
  }
}
