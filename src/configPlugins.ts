import {createRequire} from 'node:module';

import type * as ConfigPluginsNamespace from 'expo/config-plugins';

type ConfigPlugins = typeof ConfigPluginsNamespace;
type ConfigPluginsModule =
  | ConfigPlugins
  | Readonly<{default: ConfigPlugins}>;

const moduleRequire = createRequire(
  typeof __filename === 'string' ? __filename : import.meta.url,
);

export const configPlugins = unwrapConfigPlugins(
  moduleRequire('expo/config-plugins') as ConfigPluginsModule,
);

function unwrapConfigPlugins(module: ConfigPluginsModule): ConfigPlugins {
  return 'default' in module ? module.default : module;
}
