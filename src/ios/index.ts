import {writeFile} from 'node:fs/promises';

import type {ConfigPlugin} from 'expo/config-plugins';

import {configPlugins} from '../configPlugins';
import type {NormalizedNativeVariantsOptions} from '../options';
import {findSharedUrlSchemes, updateInfoPlist} from './infoPlist';
import {updatePodfile} from './podfile';
import {syncSchemeFilesMod} from './schemeFiles';
import {getXcodeProjectMetadata, updateXcodeProject} from './xcodeProject';

const {
  IOSConfig,
  WarningAggregator,
  withDangerousMod,
  withFinalizedMod,
  withInfoPlist,
  withPodfile,
} = configPlugins;

export const withIosVariants: ConfigPlugin<NormalizedNativeVariantsOptions> = (
  config,
  options,
) => {
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

  config = withDangerousMod(config, ['ios', async (modConfig) => {
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
    updateXcodeProject(project, options);
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
