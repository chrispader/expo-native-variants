import {execFile} from 'node:child_process';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

import plist from '@expo/plist';
import {expect} from 'vitest';

import {configPlugins} from '../../src/configPlugins';
import {LOCALIZED_NAMES_PHASE} from '../../src/ios/localizedNames';

const execute = promisify(execFile);

export async function assertLocalizedNamesPrebuild(
  root: string,
  prebuild: (root: string, clean: boolean) => Promise<void>,
): Promise<void> {
  await mkdir(path.join(root, 'locales'), {recursive: true});
  await writeFile(
    path.join(root, 'locales/fr.json'),
    JSON.stringify({CFBundleDisplayName: 'Shared', app_name: 'Shared', NSCameraUsageDescription: 'Caméra'}),
  );
  await writeConfig(root, true);
  await prebuild(root, true);
  await assertLocalizedProject(root);
  await prebuild(root, false);
  await assertLocalizedProject(root);

  await writeConfig(root, false);
  await prebuild(root, false);
  expect(readPhases(root)).toHaveLength(0);
  await expect(readdir(path.join(root, 'ios/Acme/NativeVariants'))).rejects.toMatchObject({code: 'ENOENT'});
  await expect(readdir(path.join(root, 'android/app/src/development/res'))).resolves.toEqual(['values']);
}

async function writeConfig(root: string, localized: boolean): Promise<void> {
  const config = {
    name: 'Acme',
    slug: 'acme',
    locales: {fr: './locales/fr.json'},
    plugins: [
      [
        'expo-native-variants',
        {
          variants: {
            production: {applicationId: 'com.acme.app', displayName: 'Acme'},
            development: {
              applicationId: 'com.acme.app.dev',
              displayName: localized
                ? {default: 'Acme Dev', fr: 'Acme Dév', 'zh-Hans': '应用 (开发)'}
                : 'Acme Dev',
            },
          },
        },
      ],
    ],
  };
  await writeFile(path.join(root, 'app.config.js'), `module.exports = ${JSON.stringify(config)};\n`);
}

async function assertLocalizedProject(root: string): Promise<void> {
  const resources = path.join(root, 'android/app/src/development/res');
  expect((await readdir(resources)).sort()).toEqual(['values', 'values-b+fr', 'values-b+zh+Hans']);
  await expect(readFile(path.join(resources, 'values-b+fr/native_variants.xml'), 'utf8')).resolves.toContain(
    '<string name="app_name">Acme Dév</string>',
  );
  await expect(readdir(path.join(root, 'android/app/src/production/res'))).resolves.toEqual(['values']);

  const infoPlist = plist.parse(await readFile(path.join(root, 'ios/Acme/Info.plist'), 'utf8')) as {
    CFBundleLocalizations?: string[];
  };
  expect(infoPlist.CFBundleLocalizations).toEqual(['en', 'fr', 'zh-Hans']);

  const phases = readPhases(root);
  expect(phases).toHaveLength(1);
  if (process.platform !== 'darwin') return;

  // Run the generated phase against the prebuilt Expo-localized strings, as Xcode would.
  const app = path.join(root, 'ios-build/Acme.app');
  await mkdir(path.join(root, 'ios-build/Derived'), {recursive: true});
  for (const [variant, expected] of [['development', 'Acme Dév'], ['production', 'Shared']] as const) {
    await mkdir(path.join(app, 'fr.lproj'), {recursive: true});
    await execute('/usr/bin/plutil', [
      '-convert', 'binary1', '-o', path.join(app, 'fr.lproj/InfoPlist.strings'),
      path.join(root, 'ios/Acme/Supporting/fr.lproj/InfoPlist.strings'),
    ]);
    await execute('/bin/sh', ['-c', JSON.parse(String(phases[0]?.shellScript))], {
      env: {
        ...process.env,
        SRCROOT: path.join(root, 'ios'),
        TARGET_BUILD_DIR: path.dirname(app),
        UNLOCALIZED_RESOURCES_FOLDER_PATH: 'Acme.app',
        DERIVED_FILE_DIR: path.join(root, 'ios-build/Derived'),
        EXPO_NATIVE_VARIANT_KEY: variant,
      },
    });
    const {stdout} = await execute('/usr/bin/plutil', [
      '-convert', 'json', '-o', '-', path.join(app, 'fr.lproj/InfoPlist.strings'),
    ]);
    expect(JSON.parse(stdout)).toMatchObject({CFBundleDisplayName: expected, NSCameraUsageDescription: 'Caméra'});
  }
}

function readPhases(root: string): Record<string, unknown>[] {
  const project = configPlugins.IOSConfig.XcodeUtils.getPbxproj(root);
  const phases: Record<string, unknown> = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
  return Object.values(phases).filter(
    (phase): phase is Record<string, unknown> =>
      typeof phase === 'object' && phase !== null && (phase as {name?: unknown}).name === JSON.stringify(LOCALIZED_NAMES_PHASE),
  );
}
