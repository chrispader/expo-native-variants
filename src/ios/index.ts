import {writeFile} from 'node:fs/promises';
import path from 'node:path';

import type {ConfigPlugin} from 'expo/config-plugins';

import {configPlugins} from '../configPlugins';
import {syncIosIcons} from '../icons/ios';
import type {NormalizedNativeVariantsOptions} from '../options';
import {findSharedUrlSchemes, updateInfoPlist} from './infoPlist';
import {updatePodfile} from './podfile';
import {syncSchemeFilesMod} from './schemeFiles';
import {getXcodeProjectMetadata, updateXcodeProject} from './xcodeProject';
import {reconcileIosUpdateChannelPhase} from './updates';
import {restoreSharedUpdateChannel} from '../updates';
import type {NativeUpdateChannels} from '../updates';

const {
  IOSConfig,
  WarningAggregator,
  withDangerousMod,
  withFinalizedMod,
  withInfoPlist,
  withExpoPlist,
  withPodfile,
} = configPlugins;

export const withIosVariants = (
  config: Parameters<ConfigPlugin>[0],
  options: NormalizedNativeVariantsOptions,
  updates: NativeUpdateChannels,
): ReturnType<ConfigPlugin> => {
  const expoSchemes = [
    `exp+${config.slug}`,
    ...options.variants.map((variant) => variant.iosBundleIdentifier),
    ...(config.ios?.bundleIdentifier === undefined ? [] : [config.ios.bundleIdentifier]),
  ];

  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults = updateInfoPlist({
      infoPlist: modConfig.modResults,
      options,
      expoSchemes,
    });
    const sharedSchemes = findSharedUrlSchemes(modConfig.modResults);
    if (sharedSchemes.length > 0) {
      WarningAggregator.addWarningIOS(
        'expo-native-variants',
        `The following URL schemes remain shared by every iOS variant and may route ambiguously when variants are installed together: ${sharedSchemes.join(', ')}.`,
      );
    }
    return modConfig;
  });

  config = withPodfile(config, (modConfig) => {
    modConfig.modResults.contents = updatePodfile({
      contents: modConfig.modResults.contents,
      projectName: requireProjectName(modConfig.modRequest.projectName),
      options,
    });
    return modConfig;
  });

  if (updates.enabled) {
    config = withExpoPlist(config, (modConfig) => {
      const headers = restoreSharedUpdateChannel(
        modConfig.modResults.EXUpdatesRequestHeaders ?? {},
        updates,
      );
      if (Object.keys(headers).length === 0) {
        delete modConfig.modResults.EXUpdatesRequestHeaders;
      } else {
        modConfig.modResults.EXUpdatesRequestHeaders = headers;
      }
      return modConfig;
    });
  }

  config = withDangerousMod(config, ['ios', async (modConfig) => {
    if (!modConfig.modRequest.introspect) {
      await syncIosIcons(
        modConfig.modRequest.projectRoot,
        modConfig.modRequest.platformProjectRoot,
        requireProjectName(modConfig.modRequest.projectName),
        options,
      );
    }
    const project = IOSConfig.XcodeUtils.getPbxproj(modConfig.modRequest.projectRoot);
    const metadata = getXcodeProjectMetadata(project);
    await syncSchemeFilesMod({
      introspect: modConfig.modRequest.introspect,
      platformProjectRoot: modConfig.modRequest.platformProjectRoot,
      projectName: requireProjectName(modConfig.modRequest.projectName),
      metadata,
      options,
    });
    return modConfig;
  }]);

  config = withFinalizedMod(config, ['ios', async (modConfig) => {
    if (modConfig.modRequest.introspect) {
      return modConfig;
    }
    const projectPath = IOSConfig.Paths.getPBXProjectPath(
      modConfig.modRequest.projectRoot,
    );
    const project = IOSConfig.XcodeUtils.getPbxproj(
      modConfig.modRequest.projectRoot,
    );
    const metadata = updateXcodeProject(project, options);
    reconcileIosUpdateChannelPhase({
      project,
      targetUuid: metadata.targetUuid,
      expoPlistPath: `$(SRCROOT)/${path.relative(
        modConfig.modRequest.platformProjectRoot,
        IOSConfig.Paths.getExpoPlistPath(modConfig.modRequest.projectRoot),
      )}`,
      enabled: updates.enabled,
    });
    await writeFile(projectPath, project.writeSync(), 'utf8');
    return modConfig;
  }]);

  return config;
};

function requireProjectName(projectName: string | undefined): string {
  if (projectName === undefined) {
    throw new Error('expo-native-variants could not determine the iOS project name.');
  }
  return projectName;
}
