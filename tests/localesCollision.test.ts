import {mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {
  ANDROID_NAME_KEY,
  findLocaleNameCollisions,
  IOS_NAME_KEY,
} from '../src/localesCollision';
import type {NormalizedNativeVariant, NormalizedNativeVariantsOptions} from '../src/options';

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

function optionsWith(...languages: readonly (readonly string[])[]): NormalizedNativeVariantsOptions {
  const variants = languages.map((tags, index) => ({
    ...base,
    key: `variant${String(index)}`,
    localizedDisplayNames: Object.fromEntries(tags.map((tag) => [tag, 'Name'])),
  }));
  return {iosTargets: [], selectedVariant: variants[0]!, variants};
}

describe('findLocaleNameCollisions', () => {
  it('reports languages whose Expo locale file sets the app name for a variant without that language', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'expo-native-variants-'));
    await writeFile(path.join(root, 'fr.json'), JSON.stringify({CFBundleDisplayName: 'Shared'}));
    await writeFile(path.join(root, 'de.json'), JSON.stringify({NSCameraUsageDescription: 'Kamera'}));
    const locales = {fr: './fr.json', de: './de.json', ar: {CFBundleDisplayName: 'Shared', app_name: 'Shared'}};

    await expect(
      findLocaleNameCollisions({
        locales, nameKey: IOS_NAME_KEY, options: optionsWith([], []), projectRoot: root,
      }),
    ).resolves.toEqual(['fr', 'ar']);
    await expect(
      findLocaleNameCollisions({
        locales, nameKey: ANDROID_NAME_KEY, options: optionsWith([], []), projectRoot: root,
      }),
    ).resolves.toEqual(['ar']);
  });

  it('reports nothing when every variant lists the language itself', async () => {
    const locales = {fr: {CFBundleDisplayName: 'Shared'}};

    await expect(
      findLocaleNameCollisions({
        locales, nameKey: IOS_NAME_KEY, options: optionsWith(['fr'], ['fr', 'ar']), projectRoot: '/unused',
      }),
    ).resolves.toEqual([]);
    await expect(
      findLocaleNameCollisions({
        locales, nameKey: IOS_NAME_KEY, options: optionsWith(['fr'], ['ar']), projectRoot: '/unused',
      }),
    ).resolves.toEqual(['fr']);
  });

  it('reports nothing when the app has no locales or an unreadable locale file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'expo-native-variants-'));
    const options = optionsWith([]);

    await expect(
      findLocaleNameCollisions({locales: undefined, nameKey: IOS_NAME_KEY, options, projectRoot: root}),
    ).resolves.toEqual([]);
    await expect(
      findLocaleNameCollisions({
        locales: {fr: './missing.json'}, nameKey: IOS_NAME_KEY, options, projectRoot: root,
      }),
    ).resolves.toEqual([]);
  });
});
