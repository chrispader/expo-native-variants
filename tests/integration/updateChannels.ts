import {execFile} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

import {expect} from 'vitest';

import {configPlugins} from '../../src/configPlugins';
import {UPDATE_CHANNEL_PHASE, UPDATE_CHANNEL_BUILD_SETTING} from '../../src/ios/updates';
import {UPDATE_HEADERS_METADATA} from '../../src/android/updates';

const execute = promisify(execFile);

export async function assertUpdateChannelPrebuild(
  root: string,
  prebuild: (root: string, clean: boolean) => Promise<void>,
): Promise<void> {
  await writeConfig(root, true);
  await prebuild(root, true);
  await assertNativeChannels(root);
  await prebuild(root, false);
  await assertNativeChannels(root);

  await writeConfig(root, true, 'preview-v2');
  await prebuild(root, false);
  await assertNativeChannels(root, 'preview-v2');

  const project = configPlugins.IOSConfig.XcodeUtils.getPbxproj(root);
  const phase = readChannelPhase(project);
  expect(phase).toBeDefined();
  const projectPath = configPlugins.IOSConfig.Paths.getPBXProjectPath(root);
  const unmodifiedProject = await readFile(projectPath, 'utf8');
  if (phase !== undefined) {
    phase.shellScript = JSON.stringify(`${JSON.parse(String(phase.shellScript))}\n# manual edit`);
    await writeFile(projectPath, project.writeSync());
    await expect(prebuild(root, false)).rejects.toThrow('modified update channel build phase');
    await writeFile(projectPath, unmodifiedProject);
  }

  await writeConfig(root, false);
  await prebuild(root, false);
  const removedProject = configPlugins.IOSConfig.XcodeUtils.getPbxproj(root);
  expect(readChannelPhase(removedProject)).toBeUndefined();
  expect(await readFile(path.join(root, 'android/app/build.gradle'), 'utf8'))
    .not.toContain('nativeVariantUpdateChannels');
  for (const flavor of ['preview', 'production']) {
    await expect(readFile(path.join(root, `android/app/src/${flavor}/AndroidManifest.xml`)))
      .rejects.toMatchObject({code: 'ENOENT'});
  }
  const configurations: Record<string, unknown> = removedProject.pbxXCBuildConfigurationSection();
  for (const configuration of Object.values(configurations)) {
    if (!isRecord(configuration) || !isRecord(configuration.buildSettings)) continue;
    expect(configuration.buildSettings).not.toHaveProperty(UPDATE_CHANNEL_BUILD_SETTING);
  }

  await writeConfig(root, true, 'preview', false);
  await prebuild(root, false);
  expect(readChannelPhase(configPlugins.IOSConfig.XcodeUtils.getPbxproj(root))).toBeUndefined();
  const manifest = await configPlugins.AndroidConfig.Manifest.readAndroidManifestAsync(
    path.join(root, 'android/app/src/main/AndroidManifest.xml'),
  );
  const metadata = configPlugins.AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)['meta-data'];
  expect(metadata?.find(({ $ }) => $['android:name'] === 'expo.modules.updates.ENABLED')?.$['android:value']).toBe('false');
}

async function writeConfig(root: string, channels: boolean, preview = 'preview', enabled = true): Promise<void> {
  const variants = {
    production: {applicationId: 'com.acme.app', ...(channels ? {updateChannel: 'production'} : {})},
    preview: {applicationId: 'com.acme.app.preview', ...(channels ? {updateChannel: preview} : {})},
    development: {applicationId: 'com.acme.app.dev'},
  };
  const config = {
    name: 'Acme', slug: 'acme', runtimeVersion: '1', updates: {
      enabled, url: 'https://u.expo.dev/00000000-0000-0000-0000-000000000000',
      requestHeaders: {'expo-channel-name': 'shared', 'custom-header': 'kept'},
    }, plugins: [['expo-native-variants', {variants}]],
  };
  await writeFile(path.join(root, 'app.config.js'), `module.exports = ${JSON.stringify(config)};\n`);
}

async function assertNativeChannels(root: string, preview = 'preview'): Promise<void> {
  const gradle = await readFile(path.join(root, 'android/app/build.gradle'), 'utf8');
  expect(gradle).toContain(`"preview": "${preview}"`);
  expect(gradle).toContain('"production": "production"');
  expect(gradle).not.toContain('"development": "shared"');
  const manifest = await configPlugins.AndroidConfig.Manifest.readAndroidManifestAsync(
    path.join(root, 'android/app/src/main/AndroidManifest.xml'),
  );
  const metadata = configPlugins.AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)['meta-data'];
  expect(JSON.parse(metadata?.find(({ $ }) => $['android:name'] === UPDATE_HEADERS_METADATA)?.$['android:value'] ?? '{}'))
    .toEqual({'expo-channel-name': 'shared', 'custom-header': 'kept'});
  const previewManifest = await readFile(path.join(root, 'android/app/src/preview/AndroidManifest.xml'), 'utf8');
  expect(previewManifest).toContain('tools:replace="android:value"');
  expect(previewManifest).toContain('${nativeVariantUpdateHeaders}');
  await expect(readFile(path.join(root, 'android/app/src/development/AndroidManifest.xml')))
    .rejects.toMatchObject({code: 'ENOENT'});

  const project = configPlugins.IOSConfig.XcodeUtils.getPbxproj(root);
  const phase = readChannelPhase(project);
  expect(phase).toBeDefined();
  const configurations: Record<string, unknown> = project.pbxXCBuildConfigurationSection();
  for (const [name, channel] of [['Release-Production', 'production'], ['Release-Preview', preview], ['Release-Development', undefined], ['Release', 'production']]) {
    const settings = Object.values(configurations).filter(isRecord).find((configuration) =>
      configuration.name === name && isRecord(configuration.buildSettings) && 'PRODUCT_BUNDLE_IDENTIFIER' in configuration.buildSettings,
    )?.buildSettings;
    expect(isRecord(settings) ? settings[UPDATE_CHANNEL_BUILD_SETTING] : null)
      .toBe(channel === undefined ? undefined : JSON.stringify(channel));
  }

  if (process.platform !== 'darwin' || phase === undefined) return;
  const source = configPlugins.IOSConfig.Paths.getExpoPlistPath(root);
  // Simulate EAS editing the shared channel after prebuild. Preserve its other headers.
  await execute('/usr/libexec/PlistBuddy', ['-c', 'Set :EXUpdatesRequestHeaders:expo-channel-name eas-profile', source]);
  const destination = path.join(root, 'channel-test/Acme.app');
  await mkdir(destination, {recursive: true});
  for (const channel of [preview, 'production', '']) {
    await execute('/bin/sh', ['-c', JSON.parse(String(phase.shellScript))], {env: {
      ...process.env, SCRIPT_INPUT_FILE_0: source, TARGET_BUILD_DIR: path.dirname(destination),
      UNLOCALIZED_RESOURCES_FOLDER_PATH: 'Acme.app', EXPO_NATIVE_VARIANT_UPDATE_CHANNEL: channel,
    }});
    const {stdout} = await execute('/usr/bin/plutil', ['-extract', 'EXUpdatesRequestHeaders', 'json', '-o', '-', path.join(destination, 'Expo.plist')]);
    expect(JSON.parse(stdout)).toEqual({'custom-header': 'kept', 'expo-channel-name': channel || 'eas-profile'});
  }
}

function readChannelPhase(project: ReturnType<typeof configPlugins.IOSConfig.XcodeUtils.getPbxproj>): Record<string, unknown> | undefined {
  const phases: Record<string, unknown> = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
  const channelPhases = Object.values(phases).filter(isRecord).filter(({name}) => name === JSON.stringify(UPDATE_CHANNEL_PHASE));
  expect(channelPhases.length).toBeLessThanOrEqual(1);
  return channelPhases[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
