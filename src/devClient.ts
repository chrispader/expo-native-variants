import type {ConfigPlugin} from 'expo/config-plugins';

import {configPlugins} from './configPlugins';
import type {NormalizedNativeVariantsOptions} from './options';

export const DEV_SERVER_APPLICATION_IDS = 'EXDevLauncherDevServerApplicationIds';

export function withDevServerDiscovery(
  config: Parameters<ConfigPlugin>[0],
  options: NormalizedNativeVariantsOptions,
): ReturnType<ConfigPlugin> {
  const withIos = configPlugins.withInfoPlist(config, (modConfig) => {
    modConfig.modResults[DEV_SERVER_APPLICATION_IDS] = options.variants.map(
      ({iosBundleIdentifier}) => iosBundleIdentifier,
    );
    return modConfig;
  });

  return configPlugins.withAndroidManifest(withIos, (modConfig) => {
    const {Manifest} = configPlugins.AndroidConfig;
    Manifest.addMetaDataItemToMainApplication(
      Manifest.getMainApplicationOrThrow(modConfig.modResults),
      DEV_SERVER_APPLICATION_IDS,
      JSON.stringify(options.variants.map(({androidApplicationId}) => androidApplicationId)),
    );
    return modConfig;
  });
}
