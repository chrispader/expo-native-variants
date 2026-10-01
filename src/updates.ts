import type {ConfigPlugin} from 'expo/config-plugins';

import type {NormalizedNativeVariantsOptions} from './options';

export const UPDATE_CHANNEL_HEADER = 'expo-channel-name';

export type NativeUpdateChannels = Readonly<{
  enabled: boolean;
  sharedRequestHeaders: Readonly<Record<string, string>>;
}>;

export function getNativeUpdateChannels(
  config: Parameters<ConfigPlugin>[0],
  options: NormalizedNativeVariantsOptions,
): NativeUpdateChannels {
  return {
    enabled:
      config.updates?.enabled !== false &&
      Boolean(config.updates?.url) &&
      options.variants.some(({updateChannel}) => updateChannel !== undefined),
    sharedRequestHeaders: config.updates?.requestHeaders ?? {},
  };
}

export function applySelectedVariantUpdateChannel(
  config: Parameters<ConfigPlugin>[0],
  options: NormalizedNativeVariantsOptions,
  updates: NativeUpdateChannels,
): Parameters<ConfigPlugin>[0] {
  const channel = options.selectedVariant.updateChannel;
  if (!updates.enabled || channel === undefined) return config;
  return {
    ...config,
    updates: {
      ...config.updates,
      requestHeaders: {...config.updates?.requestHeaders, [UPDATE_CHANNEL_HEADER]: channel},
    },
  };
}

/** Keep native templates shared; the selected native build applies its own channel. */
export function restoreSharedUpdateChannel(
  headers: Readonly<Record<string, string>>,
  updates: NativeUpdateChannels,
): Record<string, string> {
  const restored = {...headers};
  const sharedChannel = updates.sharedRequestHeaders[UPDATE_CHANNEL_HEADER];
  if (sharedChannel === undefined) {
    delete restored[UPDATE_CHANNEL_HEADER];
  } else {
    restored[UPDATE_CHANNEL_HEADER] = sharedChannel;
  }
  return restored;
}
