import * as configPluginsNamespace from 'expo/config-plugins.js';

type ConfigPlugins = typeof configPluginsNamespace;
type ConfigPluginsModule =
  | ConfigPlugins
  | Readonly<{default: ConfigPlugins}>;

export const configPlugins = unwrapConfigPlugins(configPluginsNamespace);

function unwrapConfigPlugins(module: ConfigPluginsModule): ConfigPlugins {
  return 'default' in module ? module.default : module;
}
