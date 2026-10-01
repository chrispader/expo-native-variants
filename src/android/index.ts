import type {ConfigPlugin} from 'expo/config-plugins';

import {configPlugins} from '../configPlugins';
import {syncAndroidIcons} from '../icons/android';
import type {NormalizedNativeVariantsOptions} from '../options';
import {reconcileAppBuildGradle} from './gradle';
import {reconcileAndroidManifest} from './manifest';
import {reconcileAndroidVariantResources} from './resources';
import {restoreAndroidUpdateChannel, syncAndroidUpdateChannelManifests} from './updates';
import type {NativeUpdateChannels} from '../updates';

const {
    WarningAggregator,
    withAndroidManifest,
    withAppBuildGradle,
    withDangerousMod,
} = configPlugins;

export const withAndroidVariants = (
    config: Parameters<ConfigPlugin>[0],
    options: NormalizedNativeVariantsOptions,
    updates: NativeUpdateChannels,
): ReturnType<ConfigPlugin> => {
    const fallbackSchemes = collectExpoFallbackSchemes(config, options);

    let nextConfig = withAppBuildGradle(config, (modConfig) => {
        if (modConfig.modResults.language !== 'groovy') {
            throw new Error(
                'expo-native-variants supports only the standard Groovy android/app/build.gradle template. Kotlin DSL projects are not supported.',
            );
        }
        modConfig.modResults.contents = reconcileAppBuildGradle(
            modConfig.modResults.contents,
            options,
            updates.enabled,
        );
        return modConfig;
    });

    nextConfig = withAndroidManifest(nextConfig, (modConfig) => {
        warnAboutDevLauncherScheme(config);
        const result = reconcileAndroidManifest(modConfig.modResults, {
            fallbackSchemes,
        });
        modConfig.modResults = result.manifest;
        if (updates.enabled) {
            restoreAndroidUpdateChannel(modConfig.modResults, updates);
        }
        for (const scheme of result.sharedSchemes) {
            WarningAggregator.addWarningAndroid(
                'expo-native-variants',
                `The Android URL scheme "${scheme}" remains registered for every flavor. If more than one variant is installed, Android may show an app chooser for that scheme.`,
            );
        }
        return modConfig;
    });

    return withDangerousMod(nextConfig, [
        'android',
        async (modConfig) => {
            if (modConfig.modRequest.introspect) return modConfig;
            await syncAndroidIcons(
                modConfig.modRequest.projectRoot,
                modConfig.modRequest.platformProjectRoot,
                options,
            );
            await reconcileAndroidVariantResources(
                modConfig.modRequest.platformProjectRoot,
                options,
            );
            await syncAndroidUpdateChannelManifests(
                modConfig.modRequest.platformProjectRoot,
                options,
                updates.enabled,
            );
            return modConfig;
        },
    ]);
};

export {reconcileAppBuildGradle} from './gradle';
export {reconcileAndroidManifest} from './manifest';
export {reconcileAndroidVariantResources} from './resources';

function collectExpoFallbackSchemes(
    config: Parameters<ConfigPlugin>[0],
    options: NormalizedNativeVariantsOptions,
): ReadonlySet<string> {
    return new Set([
        ...options.variants.map(({urlScheme}) => urlScheme),
        ...options.variants.map(({androidApplicationId}) => androidApplicationId),
        `exp+${config.slug}`,
    ]);
}

function warnAboutDevLauncherScheme(config: Parameters<ConfigPlugin>[0]): void {
    const hasDevClient = (config.plugins ?? []).some((plugin) => {
        if (typeof plugin === 'string') {
            return plugin === 'expo-dev-client' || plugin === 'expo-dev-launcher';
        }
        return (
            Array.isArray(plugin) &&
            (plugin[0] === 'expo-dev-client' || plugin[0] === 'expo-dev-launcher')
        );
    });

    if (hasDevClient) {
        WarningAggregator.addWarningAndroid(
            'expo-native-variants',
            'expo-dev-launcher registers its fixed "expo-dev-launcher" authentication scheme in debug builds. That dependency-owned scheme remains shared when multiple debug flavors are installed.',
        );
    }
}
