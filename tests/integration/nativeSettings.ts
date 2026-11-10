import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {expect} from 'vitest';

import {configPlugins} from '../../src/configPlugins';

type Prebuild = (
  root: string,
  clean: boolean,
  environment?: Readonly<Record<string, string>>,
) => Promise<void>;

export async function assertNativeSettingsPrebuild(root: string, prebuild: Prebuild): Promise<void> {
  await writeConfig(root, true);
  await prebuild(root, true, {NATIVE_VARIANT: 'production'});
  expect(readAppBuildSetting(root, 'Debug-Preview', 'API_URL')).toBe('"https://preview.acme.com"');
  expect(readAppBuildSetting(root, 'Release-Production', 'API_URL')).toBe('"https://api.acme.com"');
  expect(readAppBuildSetting(root, 'Debug', 'API_URL')).toBe('"https://api.acme.com"');

  const scheme = await readFile(
    path.join(root, 'ios/Acme.xcodeproj/xcshareddata/xcschemes/Acme-Preview.xcscheme'),
    'utf8',
  );
  expect(scheme).toContain('<CommandLineArgument argument="-Verbose" isEnabled="YES"/>');
  expect(scheme).toContain(
    '<EnvironmentVariable key="API_URL" value="https://preview.acme.com" isEnabled="YES"/>',
  );

  const buildGradle = await readFile(path.join(root, 'android/app/build.gradle'), 'utf8');
  expect(buildGradle).toContain(
    String.raw`buildConfigField("String", "API_URL", "\"https://preview.acme.com\"")`,
  );
  expect(buildGradle).toContain('buildConfigField("boolean", "ANALYTICS_ENABLED", "false")');
  expect(buildGradle).toContain(String.raw`resValue("string", "api_label", "Preview\\'s API")`);
  expect(buildGradle).toContain('manifestPlaceholders["apiHost"] = "preview.acme.com"');

  // The plain configurations follow the selected variant and drop settings it no longer sets.
  await prebuild(root, false, {NATIVE_VARIANT: 'preview'});
  expect(readAppBuildSetting(root, 'Debug', 'API_URL')).toBe('"https://preview.acme.com"');
  await writeConfig(root, false);
  await prebuild(root, false, {NATIVE_VARIANT: 'preview'});
  expect(readAppBuildSetting(root, 'Debug', 'API_URL')).toBeUndefined();
  expect(readAppBuildSetting(root, 'Debug-Preview', 'API_URL')).toBeUndefined();
  const restoredGradle = await readFile(path.join(root, 'android/app/build.gradle'), 'utf8');
  expect(restoredGradle).not.toContain('"API_URL"');
  expect(restoredGradle).not.toContain('api_label');
  expect(restoredGradle).not.toContain('apiHost');
}

async function writeConfig(root: string, withSettings: boolean): Promise<void> {
  const variants = {
    preview: variant('Acme Preview', 'com.acme.app.preview', 'https://preview.acme.com', withSettings),
    production: variant('Acme', 'com.acme.app', 'https://api.acme.com', withSettings),
  };
  await writeFile(
    path.join(root, 'app.config.js'),
    `module.exports = ${JSON.stringify({
      name: 'Acme',
      slug: 'acme',
      plugins: [['expo-native-variants', {variants}]],
    })};\n`,
    'utf8',
  );
}

function variant(displayName: string, applicationId: string, apiUrl: string, withSettings: boolean) {
  const base = {applicationId, displayName, runMode: 'release', urlScheme: applicationId};
  if (!withSettings) {
    return base;
  }
  const label = displayName.replace('Acme ', '');
  return {
    ...base,
    ios: {
      buildSettings: {API_URL: apiUrl},
      environmentVariables: {API_URL: apiUrl},
      launchArguments: ['-Verbose'],
    },
    android: {
      buildConfigFields: {API_URL: apiUrl, ANALYTICS_ENABLED: label === 'Acme'},
      resValues: {api_label: `${label}'s API`},
      manifestPlaceholders: {apiHost: new URL(apiUrl).host},
    },
  };
}

function readAppBuildSetting(root: string, configuration: string, name: string): unknown {
  const configurations: Record<string, unknown> = configPlugins.IOSConfig.XcodeUtils.getPbxproj(
    root,
  ).pbxXCBuildConfigurationSection();
  const match = Object.values(configurations).find(
    (entry): entry is {buildSettings: Record<string, unknown>} =>
      isRecord(entry) &&
      entry.name === configuration &&
      isRecord(entry.buildSettings) &&
      'PRODUCT_BUNDLE_IDENTIFIER' in entry.buildSettings,
  );
  if (match === undefined) {
    throw new Error(`Missing app build configuration ${configuration}.`);
  }
  return match.buildSettings[name];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
