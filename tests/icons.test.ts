import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {getPngInfo} from '@expo/image-utils';
import {afterEach, describe, expect, it} from 'vitest';

import {syncAndroidIcons} from '../src/icons/android';
import {syncIosIcons} from '../src/icons/ios';
import {applyIosIconBuildSettings, resolveVariantIcons} from '../src/icons/resolve';
import {normalizeNativeVariants} from '../src/options';

const root = path.resolve('example');
const config = {name: 'Acme', slug: 'acme', icon: './assets/icons/production.png'};
const variants = {
  production: {applicationId: 'com.acme.app'},
  development: {
    applicationId: 'com.acme.app.dev',
    icon: './assets/icons/development.png',
    ios: {
      icon: {
        light: './assets/icons/development.png',
        dark: './assets/icons/preview.png',
        tinted: './assets/icons/production.png',
      },
    },
    android: {
      flavor: 'local',
      adaptiveIcon: {monochromeImage: './assets/icons/production.png', backgroundColor: '#123456'},
    },
  },
};
const options = resolveVariantIcons(
  config,
  normalizeNativeVariants({configName: config.name, options: {variants}}),
);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})),
  );
});

describe('variant icons', () => {
  it('restores the original shared app icon after removing per-variant artwork', () => {
    const plain = normalizeNativeVariants({
      configName: 'Acme',
      options: {variants: {production: variants.production}},
    }).selectedVariant;
    const settings: Record<string, unknown> = {
      ASSETCATALOG_COMPILER_APPICON_NAME: 'CustomNativeVariantIcon',
    };
    applyIosIconBuildSettings(settings, plain);
    expect(settings.ASSETCATALOG_COMPILER_APPICON_NAME).toBe('CustomNativeVariantIcon');
    applyIosIconBuildSettings(settings, {...plain, iosIcon: 'icon.png'});
    expect(settings.ASSETCATALOG_COMPILER_APPICON_NAME).toBe('"NativeVariantproduction"');
    applyIosIconBuildSettings(settings, plain);
    expect(settings.ASSETCATALOG_COMPILER_APPICON_NAME).toBe('CustomNativeVariantIcon');
  });
  it('leaves a shared Icon Composer catalog to Expo when no variant overrides it', () => {
    const plain = normalizeNativeVariants({
      configName: 'Acme',
      options: {variants: {production: variants.production}},
    });
    expect(
      resolveVariantIcons({name: 'Acme', slug: 'acme', ios: {icon: './Shared.icon'}}, plain)
        .selectedVariant,
    ).not.toHaveProperty('iosIcon');
  });
  it('resolves shared fallbacks, clears shared adaptive artwork for explicit icons, and honors overrides', () => {
    const resolved = resolveVariantIcons(
      {...config, android: {adaptiveIcon: {foregroundImage: 'shared.png'}}},
      options,
    );
    expect(resolved.variants[0]?.iosIcon).toBe(config.icon);
    expect(resolved.variants[1]?.androidAdaptiveIcon).not.toHaveProperty('foregroundImage');
    expect(resolved.variants[1]?.androidIcon).toBe('./assets/icons/development.png');
    expect(resolved.variants[1]?.iosIcon).toHaveProperty('dark', './assets/icons/preview.png');
  });

  it('writes actual iOS images and appearance metadata, then removes stale owned catalogs', async () => {
    const nativeRoot = await temporaryRoot();
    await syncIosIcons(root, nativeRoot, 'Acme', options);
    const catalog = path.join(nativeRoot, 'Acme/Images.xcassets');
    const iconSet = path.join(catalog, 'NativeVariantlocal.appiconset');
    expect(await getPngInfo(path.join(iconSet, 'light.png'))).toMatchObject({
      width: 1024,
      height: 1024,
    });
    expect(JSON.parse(await readFile(path.join(iconSet, 'Contents.json'), 'utf8')).images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: 'dark.png',
          appearances: [{appearance: 'luminosity', value: 'dark'}],
        }),
        expect.objectContaining({
          filename: 'tinted.png',
          appearances: [{appearance: 'luminosity', value: 'tinted'}],
        }),
      ]),
    );
    await syncIosIcons(root, nativeRoot, 'Acme', options);
    await syncIosIcons(root, nativeRoot, 'Acme', {
      ...options,
      variants: options.variants.slice(0, 1),
    });
    await expect(stat(iconSet)).rejects.toHaveProperty('code', 'ENOENT');
  });

  it('generates each Android density, adaptive overrides and flavor-specific artwork', async () => {
    const nativeRoot = await temporaryRoot();
    await syncAndroidIcons(root, nativeRoot, options);
    const resources = path.join(nativeRoot, 'app/src/local/res');
    expect(await getPngInfo(path.join(resources, 'mipmap-xxxhdpi/ic_launcher.png'))).toMatchObject({
      width: 192,
      height: 192,
    });
    const regular = await getPngInfo(path.join(resources, 'mipmap-xxxhdpi/ic_launcher.png'));
    const round = await getPngInfo(path.join(resources, 'mipmap-xxxhdpi/ic_launcher_round.png'));
    expect(alphaAt(regular, 0, 0)).toBe(255);
    expect(alphaAt(round, 0, 0)).toBe(0);
    expect(alphaAt(round, round.width / 2, round.height / 2)).toBe(255);
    expect(
      await getPngInfo(path.join(resources, 'mipmap-xxxhdpi/native_variant_foreground.png')),
    ).toMatchObject({width: 432, height: 432});
    expect(
      await readFile(path.join(resources, 'mipmap-anydpi-v33/ic_launcher.xml'), 'utf8'),
    ).toContain('<monochrome');
    expect(
      await readFile(
        path.join(nativeRoot, 'app/src/production/res/mipmap-anydpi-v33/ic_launcher.xml'),
        'utf8',
      ),
    ).not.toContain('<monochrome');
    const development = await readFile(path.join(resources, 'mipmap-mdpi/ic_launcher.png'));
    expect(
      development.equals(
        await readFile(path.join(nativeRoot, 'app/src/production/res/mipmap-mdpi/ic_launcher.png')),
      ),
    ).toBe(false);
    await syncAndroidIcons(root, nativeRoot, options);
    await writeFile(path.join(resources, 'mipmap-mdpi/ic_launcher.png'), 'user edit');
    await expect(syncAndroidIcons(root, nativeRoot, options)).rejects.toThrow(
      'not an unmodified generated file',
    );
  });
});

async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'native-variant-icons-'));
  directories.push(directory);
  return directory;
}

function alphaAt(
  image: Awaited<ReturnType<typeof getPngInfo>>,
  x: number,
  y: number,
): number | undefined {
  return image.data[(y * image.width + x) * 4 + 3];
}
