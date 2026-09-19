import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import type {NormalizedNativeVariantsOptions} from '../../src/options';
import {syncSchemeFiles, syncSchemeFilesMod} from '../../src/ios/schemeFiles';

const variant = {
  key: 'development',
  displayName: 'Acme Dev',
  iosBundleIdentifier: 'com.acme.app.dev',
  androidApplicationId: 'com.acme.app.dev',
  urlScheme: 'acme-dev',
  runMode: 'debug' as const,
  iosScheme: 'Acme-Development',
  debugConfiguration: 'Debug-Development',
  releaseConfiguration: 'Release-Development',
  androidFlavor: 'development',
};

const metadata = {
  targetUuid: 'TARGET_UUID',
  targetName: 'Acme',
  productName: 'Acme',
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true}),
    ),
  );
});

describe(syncSchemeFiles, () => {
  it('does not write files during introspection', async () => {
    const directory = await createTemporaryDirectory();

    await syncSchemeFilesMod({
      introspect: true,
      platformProjectRoot: directory,
      projectName: 'Acme',
      metadata,
      options: {canonicalVariant: variant, iosTargets: [], variants: [variant]},
    });

    await expect(stat(path.join(directory, '.expo-native-variants.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('writes a shared scheme and remains idempotent', async () => {
    const directory = await createTemporaryDirectory();
    const options: NormalizedNativeVariantsOptions = {
      canonicalVariant: variant,
      iosTargets: [],
      variants: [variant],
    };

    await syncSchemeFiles({
      platformProjectRoot: directory,
      projectName: 'Acme',
      metadata,
      options,
    });
    const schemePath = getSchemePath(directory, variant.iosScheme);
    const once = await readFile(schemePath, 'utf8');
    await syncSchemeFiles({
      platformProjectRoot: directory,
      projectName: 'Acme',
      metadata,
      options,
    });

    expect(await readFile(schemePath, 'utf8')).toBe(once);
  });

  it('removes a scheme after a variant rename', async () => {
    const directory = await createTemporaryDirectory();
    const firstOptions: NormalizedNativeVariantsOptions = {
      canonicalVariant: variant,
      iosTargets: [],
      variants: [variant],
    };
    const renamedVariant = {
      ...variant,
      key: 'local',
      iosScheme: 'Acme-Local',
      debugConfiguration: 'Debug-Local',
      releaseConfiguration: 'Release-Local',
      androidFlavor: 'local',
    };
    await syncSchemeFiles({
      platformProjectRoot: directory,
      projectName: 'Acme',
      metadata,
      options: firstOptions,
    });

    await syncSchemeFiles({
      platformProjectRoot: directory,
      projectName: 'Acme',
      metadata,
      options: {canonicalVariant: renamedVariant, iosTargets: [], variants: [renamedVariant]},
    });

    await expect(readFile(getSchemePath(directory, variant.iosScheme))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(getSchemePath(directory, renamedVariant.iosScheme))).resolves.toBeDefined();
  });

  it('refuses to overwrite a modified owned scheme', async () => {
    const directory = await createTemporaryDirectory();
    const options: NormalizedNativeVariantsOptions = {
      canonicalVariant: variant,
      iosTargets: [],
      variants: [variant],
    };
    await syncSchemeFiles({
      platformProjectRoot: directory,
      projectName: 'Acme',
      metadata,
      options,
    });
    await writeFile(getSchemePath(directory, variant.iosScheme), '<Scheme version="1.7"/>');

    await expect(
      syncSchemeFiles({
        platformProjectRoot: directory,
        projectName: 'Acme',
        metadata,
        options,
      }),
    ).rejects.toThrow('does not own it');
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'expo-native-variants-ios-'));
  temporaryDirectories.push(directory);
  return directory;
}

function getSchemePath(directory: string, scheme: string): string {
  return path.join(directory, 'Acme.xcodeproj', 'xcshareddata', 'xcschemes', `${scheme}.xcscheme`);
}
