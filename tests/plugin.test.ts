import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {withNativeVariants} from '../src';

const variants = {
  production: {applicationId: 'com.acme.app'},
  development: {applicationId: 'com.acme.app.dev'},
};

describe('withNativeVariants', () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([{NATIVE_VARIANT: 'development'}, {CONFIGURATION: 'Release-Development'}, {EXPO_NATIVE_VARIANT_KEY: 'development'}])(
    'selects the update channel for config exports and embedded metadata: %j',
    (environment) => {
      for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
      const config = withNativeVariants({name: 'Acme', slug: 'acme', runtimeVersion: '1', updates: {
        url: 'https://u.expo.dev/example', requestHeaders: {'custom-header': 'kept', 'expo-channel-name': 'shared'},
      }}, {variants: {
        production: {...variants.production, updateChannel: 'production'},
        development: {...variants.development, updateChannel: 'preview'},
      }});
      expect(config.updates?.requestHeaders).toEqual({'custom-header': 'kept', 'expo-channel-name': 'preview'});
      expect(config.runtimeVersion).toBe('1');
    },
  );

  it.each([{enabled: false, url: 'https://u.expo.dev/example'}, {}])(
    'does not enable unconfigured or disabled updates: %j',
    (updates) => {
      const config = withNativeVariants({name: 'Acme', slug: 'acme', updates}, {
        variants: {production: {...variants.production, updateChannel: 'production'}},
      });
      expect(config.updates).toEqual(updates);
    },
  );
  it('projects development by default even when production is declared first', () => {
    const config = withNativeVariants({name: 'Acme', slug: 'acme'}, {variants});

    expect(config.android?.package).toBe('com.acme.app.dev');
    expect(config.ios?.bundleIdentifier).toBe('com.acme.app.dev');
    expect(config.scheme).toBe('com.acme.app.dev');
  });

  it.each([
    [{CONFIGURATION: 'Debug'}, 'com.acme.app'],
    [{CONFIGURATION: 'Release-Development'}, 'com.acme.app.dev'],
    [{CONFIGURATION: 'Release', EXPO_NATIVE_VARIANT_KEY: 'development'}, 'com.acme.app.dev'],
  ])('embeds the variant prebuild wrote into plain Xcode configurations: %j', async (
    environment,
    bundleIdentifier,
  ) => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'expo-native-variants-'));
    await mkdir(path.join(projectRoot, 'ios'));
    await writeFile(
      path.join(projectRoot, 'ios', 'Podfile.properties.json'),
      JSON.stringify({'expo-native-variants.variant': 'production'}),
    );
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);

    const config = withNativeVariants(
      {name: 'Acme', slug: 'acme', _internal: {projectRoot}},
      {variants},
    );

    expect(config.ios?.bundleIdentifier).toBe(bundleIdentifier);
  });

  it('uses the selected variant for extension identifiers recorded for EAS', () => {
    const entitlements = {
      'com.apple.security.application-groups': ['group.$(EXPO_NATIVE_VARIANT_BUNDLE_IDENTIFIER)'],
    };
    const extension = (targetName: string, bundleIdentifier: string) => ({
      targetName,
      bundleIdentifier,
      entitlements,
    });
    const config = withNativeVariants(
      {
        name: 'Acme',
        slug: 'acme',
        extra: {
          eas: {
            projectId: 'kept',
            build: {experimental: {ios: {appExtensions: [
              extension('AcmeShare', 'com.example.acme.share'),
              extension('Unmanaged', 'com.example.other'),
            ]}}},
          },
        },
      },
      {ios: {targets: {AcmeShare: {bundleIdentifierSuffix: '.share'}}}, variants},
    );

    expect(config.extra?.eas).toEqual({
      projectId: 'kept',
      build: {experimental: {ios: {appExtensions: [
        extension('AcmeShare', 'com.acme.app.dev.share'),
        extension('Unmanaged', 'com.example.other'),
      ]}}},
    });
  });

  it('projects an explicit variant over existing identifiers', () => {
    const config = withNativeVariants(
      {
        android: {package: 'com.previous.android'},
        ios: {bundleIdentifier: 'com.previous.ios'},
        name: 'Acme',
        slug: 'acme',
      },
      {variant: 'development', variants},
    );

    expect(config.android?.package).toBe('com.acme.app.dev');
    expect(config.ios?.bundleIdentifier).toBe('com.acme.app.dev');
  });

  it('reads the EAS or Metro variant without app-config glue', () => {
    vi.stubEnv('NATIVE_VARIANT', 'production');
    const config = withNativeVariants({name: 'Acme', slug: 'acme'}, {variants});
    expect(config.scheme).toBe('com.acme.app');
    expect(config.ios?.bundleIdentifier).toBe('com.acme.app');
  });

  it.each(['', '   '])('treats NATIVE_VARIANT=%j as unset', (value) => {
    vi.stubEnv('NATIVE_VARIANT', value);
    const config = withNativeVariants({name: 'Acme', slug: 'acme'}, {variants});
    expect(config.scheme).toBe('com.acme.app.dev');
    expect(config.ios?.bundleIdentifier).toBe('com.acme.app.dev');
  });

  it('uses the first declared variant for an empty environment value without development', () => {
    vi.stubEnv('NATIVE_VARIANT', ' ');
    const config = withNativeVariants({name: 'Acme', slug: 'acme'}, {
      variants: {production: variants.production},
    });
    expect(config.ios?.bundleIdentifier).toBe('com.acme.app');
  });

  it('trims whitespace around NATIVE_VARIANT', () => {
    vi.stubEnv('NATIVE_VARIANT', ' development ');
    const config = withNativeVariants({name: 'Acme', slug: 'acme'}, {variants});
    expect(config.scheme).toBe('com.acme.app.dev');
  });

  it('still rejects an empty explicit variant option', () => {
    vi.stubEnv('NATIVE_VARIANT', 'development');
    expect(() => withNativeVariants({name: 'Acme', slug: 'acme'}, {variant: '', variants})).toThrow(
      'variant must be a nonempty string',
    );
  });

  it('lets explicit config evaluation selection override NATIVE_VARIANT', () => {
    vi.stubEnv('NATIVE_VARIANT', 'development');
    expect(
      withNativeVariants({name: 'Acme', slug: 'acme'}, {variant: 'production', variants}).scheme,
    ).toBe('com.acme.app');
  });

  it.each([{CONFIGURATION: 'Release-Development'}, {EXPO_NATIVE_VARIANT_KEY: 'development'}])(
    'uses the actual native build identity for embedded config: %j',
    (environment) => {
      for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
      expect(
        withNativeVariants({name: 'Acme', slug: 'acme'}, {variant: 'production', variants}).scheme,
      ).toBe('com.acme.app.dev');
    },
  );

  it.each([{CONFIGURATION: 'Release-Production'}, {EXPO_NATIVE_VARIANT_KEY: 'production'}])(
    'uses the actual native identity over the development default: %j',
    (environment) => {
      for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
      const config = withNativeVariants({name: 'Acme', slug: 'acme'}, {variants});
      expect(config.scheme).toBe('com.acme.app');
      expect(config.ios?.bundleIdentifier).toBe('com.acme.app');
    },
  );

  it('fails for a stale native build identity instead of embedding production metadata', () => {
    vi.stubEnv('EXPO_NATIVE_VARIANT_KEY', 'removed');
    expect(() => withNativeVariants({name: 'Acme', slug: 'acme'}, {variants})).toThrow(
      'Run prebuild again',
    );
  });
});
