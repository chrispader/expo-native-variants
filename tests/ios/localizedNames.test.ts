import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, readFile, readdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

import type {XcodeProject} from 'expo/config-plugins';
import {describe, expect, it} from 'vitest';

import {
  collectLocalizedLanguages,
  createLocalizedNamesScript,
  reconcileIosLocalizedNamesPhase,
  syncIosLocalizedNames,
} from '../../src/ios/localizedNames';
import type {NormalizedNativeVariant, NormalizedNativeVariantsOptions} from '../../src/options';

const execFileAsync = promisify(execFile);

const base: NormalizedNativeVariant = {
  key: 'development',
  displayName: 'Acme Dev',
  iosBundleIdentifier: 'com.acme.app.dev',
  androidApplicationId: 'com.acme.app.dev',
  urlScheme: 'acme-dev',
  runMode: 'debug',
  iosScheme: 'Acme-Development',
  debugConfiguration: 'Debug-Development',
  releaseConfiguration: 'Release-Development',
  androidFlavor: 'development',
};

function withNames(
  names: Readonly<Record<string, string>> | undefined,
  extra: readonly NormalizedNativeVariant[] = [],
): NormalizedNativeVariantsOptions {
  const variant = names === undefined ? base : {...base, localizedDisplayNames: names};
  return {iosTargets: [], selectedVariant: variant, variants: [variant, ...extra]};
}

describe('syncIosLocalizedNames', () => {
  it('writes one InfoPlist.strings per variant language and an input list', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'expo-native-variants-'));
    await syncIosLocalizedNames({
      platformProjectRoot: root,
      projectDirectory: 'Acme',
      options: withNames({fr: 'App Dév', 'zh-Hans': '应用'}),
    });

    const variantRoot = path.join(root, 'Acme', 'NativeVariants', 'development');
    await expect(readFile(path.join(variantRoot, 'fr.lproj', 'InfoPlist.strings'), 'utf8')).resolves.toBe(
      'CFBundleDisplayName = "App Dév";\n',
    );
    await expect(
      readFile(path.join(variantRoot, 'zh-Hans.lproj', 'InfoPlist.strings'), 'utf8'),
    ).resolves.toBe('CFBundleDisplayName = "应用";\n');
    await expect(
      readFile(path.join(root, 'Acme', 'NativeVariants', 'development.xcfilelist'), 'utf8'),
    ).resolves.toBe(
      [
        '$(SRCROOT)/Acme/NativeVariants/development/fr.lproj/InfoPlist.strings',
        '$(SRCROOT)/Acme/NativeVariants/development/zh-Hans.lproj/InfoPlist.strings',
        '',
      ].join('\n'),
    );
  });

  it.each([
    ['Say "hi"', 'Say \\"hi\\"'],
    ['Back\\slash', 'Back\\\\slash'],
  ])('escapes %s in the strings file', async (name, escaped) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'expo-native-variants-'));
    await syncIosLocalizedNames({
      platformProjectRoot: root,
      projectDirectory: 'Acme',
      options: withNames({fr: name}),
    });

    await expect(
      readFile(path.join(root, 'Acme', 'NativeVariants', 'development', 'fr.lproj', 'InfoPlist.strings'), 'utf8'),
    ).resolves.toBe(`CFBundleDisplayName = "${escaped}";\n`);
  });

  it('removes dropped languages and variants on rerun and writes nothing for string-only variants', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'expo-native-variants-'));
    const args = {platformProjectRoot: root, projectDirectory: 'Acme'};
    await syncIosLocalizedNames({...args, options: withNames({fr: 'App', ar: 'تطبيق'})});
    await syncIosLocalizedNames({...args, options: withNames({ar: 'تطبيق'})});

    const variantRoot = path.join(root, 'Acme', 'NativeVariants', 'development');
    await expect(readdir(variantRoot)).resolves.toEqual(['ar.lproj']);

    await syncIosLocalizedNames({...args, options: withNames(undefined)});
    await expect(readdir(path.join(root, 'Acme'))).rejects.toMatchObject({code: 'ENOENT'});
  });
});

describe('collectLocalizedLanguages', () => {
  it('returns every language used by any variant once', () => {
    const production = {...base, key: 'production', localizedDisplayNames: {fr: 'A', de: 'B'}};

    expect(collectLocalizedLanguages(withNames({fr: 'App', ar: 'تطبيق'}, [production]))).toEqual([
      'ar',
      'de',
      'fr',
    ]);
    expect(collectLocalizedLanguages(withNames(undefined))).toEqual([]);
  });
});

describe('reconcileIosLocalizedNamesPhase', () => {
  const phases = (project: XcodeProject) =>
    Object.entries(project.hash.project.objects.PBXShellScriptBuildPhase ?? {}).filter(
      ([key]) => !key.endsWith('_comment'),
    ) as [string, Record<string, unknown>][];

  const ownPhase = (project: XcodeProject) =>
    phases(project).find(([, phase]) => String(phase.name).includes('Localize display names')) as
      | [string, Record<string, unknown>]
      | undefined;

  it('adds one build phase that declares inputs and outputs for script sandboxing', () => {
    const project = createProject();
    reconcileIosLocalizedNamesPhase({project, targetUuid: 'TARGET', projectDirectory: 'Acme', enabled: true});

    const [uuid, phase] = ownPhase(project)!;
    expect(project.pbxNativeTargetSection().TARGET).toMatchObject({
      buildPhases: [{value: 'USER_PHASE'}, {value: uuid}],
    });
    expect(phase).toMatchObject({
      name: '"[expo-native-variants] Localize display names"',
      inputFileListPaths: ['"$(SRCROOT)/Acme/NativeVariants/$(EXPO_NATIVE_VARIANT_KEY).xcfilelist"'],
      outputPaths: ['"$(DERIVED_FILE_DIR)/expo-native-variants-localized-names.stamp"'],
      alwaysOutOfDate: 1,
    });
  });

  it('is idempotent and keeps unrelated phases', () => {
    const project = createProject();
    const args = {project, targetUuid: 'TARGET', projectDirectory: 'Acme', enabled: true};
    reconcileIosLocalizedNamesPhase(args);
    reconcileIosLocalizedNamesPhase(args);

    expect(phases(project)).toHaveLength(2);
    expect(project.pbxNativeTargetSection().TARGET).toMatchObject({
      buildPhases: [{value: 'USER_PHASE'}, {comment: '[expo-native-variants] Localize display names'}],
    });
  });

  it('removes only its own phase when disabled', () => {
    const project = createProject();
    reconcileIosLocalizedNamesPhase({project, targetUuid: 'TARGET', projectDirectory: 'Acme', enabled: true});
    reconcileIosLocalizedNamesPhase({project, targetUuid: 'TARGET', projectDirectory: 'Acme', enabled: false});

    expect(phases(project).map(([key]) => key)).toEqual(['USER_PHASE']);
    expect(project.pbxNativeTargetSection().TARGET).toMatchObject({
      buildPhases: [{value: 'USER_PHASE'}],
    });
  });

  it('refuses to replace an edited phase', () => {
    const project = createProject();
    reconcileIosLocalizedNamesPhase({project, targetUuid: 'TARGET', projectDirectory: 'Acme', enabled: true});
    const [, phase] = ownPhase(project)!;
    phase.shellScript = JSON.stringify(`${JSON.parse(phase.shellScript as string)}echo edited\n`);

    expect(() =>
      reconcileIosLocalizedNamesPhase({project, targetUuid: 'TARGET', projectDirectory: 'Acme', enabled: true}),
    ).toThrow('modified localized names build phase');
  });
});

function createProject(): XcodeProject {
  const xcode = createRequire(import.meta.url)('xcode') as {
    project: (file: string) => XcodeProject;
  };
  const project = xcode.project('unused.pbxproj');
  project.hash = {
    project: {
      objects: {
        PBXNativeTarget: {
          TARGET: {
            isa: 'PBXNativeTarget',
            name: 'Acme',
            buildPhases: [{value: 'USER_PHASE', comment: 'User phase'}],
          },
          TARGET_comment: 'Acme',
        },
        PBXShellScriptBuildPhase: {
          USER_PHASE: {isa: 'PBXShellScriptBuildPhase', name: '"User phase"', shellScript: '"true"'},
          USER_PHASE_comment: 'User phase',
        },
      },
    },
  } as unknown as XcodeProject['hash'];
  return project;
}

describe.runIf(process.platform === 'darwin')('localized names build script', () => {
  async function runScript(variantKey: string | undefined, existing: string | undefined) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'expo-native-variants-'));
    const app = path.join(root, 'Build', 'Acme.app');
    await mkdir(path.join(app, 'fr.lproj'), {recursive: true});
    const options = withNames({fr: 'App Dév', ar: 'تطبيق'});
    await syncIosLocalizedNames({platformProjectRoot: root, projectDirectory: 'Acme', options});
    if (existing !== undefined) {
      const source = path.join(root, 'existing.strings');
      await writeFile(source, existing, 'utf8');
      await execFileAsync('/usr/bin/plutil', [
        '-convert', 'binary1', '-o', path.join(app, 'fr.lproj', 'InfoPlist.strings'), source,
      ]);
    }
    await mkdir(path.join(root, 'Derived'), {recursive: true});
    await execFileAsync('/bin/sh', ['-c', createLocalizedNamesScript('Acme')], {
      env: {
        SRCROOT: root,
        TARGET_BUILD_DIR: app,
        UNLOCALIZED_RESOURCES_FOLDER_PATH: '.',
        DERIVED_FILE_DIR: path.join(root, 'Derived'),
        ...(variantKey === undefined ? {} : {EXPO_NATIVE_VARIANT_KEY: variantKey}),
      },
    });
    return app;
  }

  const readStrings = async (app: string, language: string) =>
    JSON.parse(
      (await execFileAsync('/usr/bin/plutil', [
        '-convert', 'json', '-o', '-', path.join(app, `${language}.lproj`, 'InfoPlist.strings'),
      ])).stdout,
    ) as Record<string, string>;

  it('copies the selected variant languages into the app bundle', async () => {
    const app = await runScript('development', undefined);

    await expect(readStrings(app, 'fr')).resolves.toEqual({CFBundleDisplayName: 'App Dév'});
    await expect(readStrings(app, 'ar')).resolves.toEqual({CFBundleDisplayName: 'تطبيق'});
  });

  it('replaces only the display name in an existing localized strings file', async () => {
    const app = await runScript(
      'development',
      'CFBundleDisplayName = "Shared";\nNSCameraUsageDescription = "Caméra";\n',
    );

    await expect(readStrings(app, 'fr')).resolves.toEqual({
      CFBundleDisplayName: 'App Dév',
      NSCameraUsageDescription: 'Caméra',
    });
  });

  it('leaves the bundle alone for a configuration without localized names', async () => {
    const app = await runScript('production', 'CFBundleDisplayName = "Shared";\n');

    await expect(readStrings(app, 'fr')).resolves.toEqual({CFBundleDisplayName: 'Shared'});
    await expect(readdir(app)).resolves.toEqual(['fr.lproj']);
  });
});
