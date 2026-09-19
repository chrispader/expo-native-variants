import {describe, expect, it} from 'vitest';
import type {ExpoConfig} from 'expo/config';

import {createNativeVariantsConfig} from '../../src/config';
import type {NativeVariantsOptions} from '../../src/options';
import jsonOptions from './variants.json';

const options = {
  defaultVariant: 'production',
  variants: {
    preview: {
      android: {applicationId: 'com.acme.android.preview'},
      applicationId: 'com.acme.app.preview',
      displayName: 'Acme Preview',
      ios: {bundleIdentifier: 'com.acme.ios-preview'},
      runMode: 'release',
      urlScheme: 'acme-preview',
    },
    production: {
      applicationId: 'com.acme.app',
      displayName: 'Acme',
      runMode: 'release',
      urlScheme: 'acme',
    },
  },
} satisfies NativeVariantsOptions;

describe('createNativeVariantsConfig', () => {
  it('projects the default variant and registers the complete matrix last', () => {
    const config = createNativeVariantsConfig({
      config: {
        android: {adaptiveIcon: {backgroundColor: '#ffffff'}},
        ios: {supportsTablet: true},
        name: 'Acme shared project',
        plugins: ['unrelated-plugin'],
        slug: 'acme',
      },
      options,
    });

    expect(config).toMatchObject({
      android: {
        adaptiveIcon: {backgroundColor: '#ffffff'},
        package: 'com.acme.app',
      },
      ios: {
        bundleIdentifier: 'com.acme.app',
        supportsTablet: true,
      },
      name: 'Acme shared project',
      slug: 'acme',
    });
    expect(config.plugins).toEqual([
      'unrelated-plugin',
      [
        'expo-native-variants',
        {
          ...options,
          canonicalVariant: 'production',
        },
      ],
    ]);
  });

  it('projects an explicit selection over existing identifiers intentionally', () => {
    const config = createNativeVariantsConfig({
      config: {
        android: {package: 'com.previous.android'},
        ios: {bundleIdentifier: 'com.previous.ios'},
        name: 'Acme',
        slug: 'acme',
      },
      options,
      variant: 'preview',
    });

    expect(config.android?.package).toBe('com.acme.android.preview');
    expect(config.ios?.bundleIdentifier).toBe('com.acme.ios-preview');
    expect(config.plugins).toEqual([
      [
        'expo-native-variants',
        {
          ...options,
          canonicalVariant: 'preview',
        },
      ],
    ]);
  });

  it('uses options.canonicalVariant when no explicit selection is supplied', () => {
    const config = createNativeVariantsConfig({
      config: {name: 'Acme', slug: 'acme'},
      options: {...options, canonicalVariant: 'preview'},
    });

    expect(config.android?.package).toBe('com.acme.android.preview');
    expect(config.ios?.bundleIdentifier).toBe('com.acme.ios-preview');
  });

  it('accepts JSON-imported options and validates their widened runMode', () => {
    const config = createNativeVariantsConfig({
      config: {name: 'Acme', slug: 'acme'},
      options: jsonOptions,
    });

    expect(config.android?.package).toBe('com.acme.app');
    expect(config.ios?.bundleIdentifier).toBe('com.acme.app');
  });

  it('rejects an invalid runMode from JSON-shaped input', () => {
    expect(() =>
      createNativeVariantsConfig({
        config: {name: 'Acme', slug: 'acme'},
        options: {
          ...jsonOptions,
          variants: {
            ...jsonOptions.variants,
            production: {
              ...jsonOptions.variants.production,
              runMode: 'profile',
            },
          },
        },
      }),
    ).toThrow('runMode must be "debug" or "release"');
  });

  it('rejects invalid explicit selectors through shared validation', () => {
    expect(() =>
      createNativeVariantsConfig({
        config: {name: 'Acme', slug: 'acme'},
        options,
        variant: 'missing',
      }),
    ).toThrow('canonicalVariant references unknown variant "missing".');
  });

  it('rejects an existing plugin registration', () => {
    expectExistingPluginRegistration(['expo-native-variants']);
    expectExistingPluginRegistration([['expo-native-variants']]);
    expectExistingPluginRegistration([['expo-native-variants', options]]);
    expectExistingPluginRegistration(['expo-native-variants/app.plugin.js']);
    expectExistingPluginRegistration([
      ['expo-native-variants/app.plugin.js'],
    ]);
    expectExistingPluginRegistration([
      ['expo-native-variants/app.plugin.js', options],
    ]);
  });

  it('does not mutate the input config or options', () => {
    const config = {
      android: {package: 'com.previous.android'},
      ios: {bundleIdentifier: 'com.previous.ios'},
      name: 'Acme',
      plugins: ['unrelated-plugin'],
      slug: 'acme',
    };
    const configBefore = structuredClone(config);
    const optionsBefore = structuredClone(options);

    createNativeVariantsConfig({config, options, variant: 'preview'});

    expect(config).toEqual(configBefore);
    expect(options).toEqual(optionsBefore);
  });
});

function expectExistingPluginRegistration(
  plugins: NonNullable<ExpoConfig['plugins']>,
): void {
  expect(() =>
    createNativeVariantsConfig({
      config: {name: 'Acme', plugins, slug: 'acme'},
      options,
    }),
  ).toThrow('already registered in config.plugins');
}
