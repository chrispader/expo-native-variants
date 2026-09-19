import {describe, expect, it} from 'vitest';

import {normalizeNativeVariants} from '../src/options';
import type {NativeVariantMap} from '../src/options';

const variants = {
  development: {
    applicationId: 'com.acme.app.dev',
    displayName: 'Acme Dev',
    runMode: 'debug',
    urlScheme: 'acme-dev',
  },
  preview: {
    applicationId: 'com.acme.app.preview',
    displayName: 'Acme Preview',
    runMode: 'release',
    urlScheme: 'acme-preview',
  },
  production: {
    applicationId: 'com.acme.app',
    displayName: 'Acme',
    urlScheme: 'acme',
  },
} satisfies NativeVariantMap;

describe('normalizeNativeVariants', () => {
  it('normalizes every configured variant and its generated names', () => {
    const result = normalizeNativeVariants({
      configName: 'Acme',
      options: {defaultVariant: 'production', variants},
    });

    expect(result.variants).toEqual([
      {
        androidApplicationId: 'com.acme.app.dev',
        androidFlavor: 'development',
        debugConfiguration: 'Debug-Development',
        displayName: 'Acme Dev',
        iosBundleIdentifier: 'com.acme.app.dev',
        iosScheme: 'Acme-Development',
        key: 'development',
        releaseConfiguration: 'Release-Development',
        runMode: 'debug',
        urlScheme: 'acme-dev',
      },
      {
        androidApplicationId: 'com.acme.app.preview',
        androidFlavor: 'preview',
        debugConfiguration: 'Debug-Preview',
        displayName: 'Acme Preview',
        iosBundleIdentifier: 'com.acme.app.preview',
        iosScheme: 'Acme-Preview',
        key: 'preview',
        releaseConfiguration: 'Release-Preview',
        runMode: 'release',
        urlScheme: 'acme-preview',
      },
      {
        androidApplicationId: 'com.acme.app',
        androidFlavor: 'production',
        debugConfiguration: 'Debug-Production',
        displayName: 'Acme',
        iosBundleIdentifier: 'com.acme.app',
        iosScheme: 'Acme-Production',
        key: 'production',
        releaseConfiguration: 'Release-Production',
        runMode: 'debug',
        urlScheme: 'acme',
      },
    ]);
    expect(result.canonicalVariant).toBe(result.variants[2]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.variants)).toBe(true);
    expect(result.variants.every(Object.isFrozen)).toBe(true);
  });

  it('applies platform overrides and an explicit scheme', () => {
    const result = normalizeNativeVariants({
      configName: 'Acme',
      options: {
        defaultVariant: 'development',
        variants: {
          development: {
            android: {applicationId: 'com.acme.android.dev'},
            applicationId: 'com.acme.app.dev',
            displayName: 'Acme Dev',
            ios: {
              bundleIdentifier: 'com.acme.ios-dev',
              xcodeScheme: 'Acme Dev Local',
            },
            urlScheme: 'acme-dev',
          },
        },
      },
    });

    expect(result.canonicalVariant).toMatchObject({
      androidApplicationId: 'com.acme.android.dev',
      iosBundleIdentifier: 'com.acme.ios-dev',
      iosScheme: 'Acme Dev Local',
    });
  });

  it('uses canonical selection without reducing the generated matrix', () => {
    const fromOptions = normalizeNativeVariants({
      configName: 'Acme',
      options: {
        canonicalVariant: 'preview',
        defaultVariant: 'production',
        variants,
      },
    });
    const fromOverride = normalizeNativeVariants({
      canonicalVariant: 'development',
      configName: 'Acme',
      options: {
        canonicalVariant: 'preview',
        defaultVariant: 'production',
        variants,
      },
    });

    expect(fromOptions.canonicalVariant.key).toBe('preview');
    expect(fromOverride.canonicalVariant.key).toBe('development');
    expect(fromOverride.variants.map(({key}) => key)).toEqual([
      'development',
      'preview',
      'production',
    ]);
  });

  it.each([
    [{defaultVariant: 'production', variants, extra: true}, 'Plugin options'],
    [
      {
        defaultVariant: 'production',
        variants: {
          production: {...variants.production, extra: true},
        },
      },
      'Variant "production"',
    ],
    [
      {
        defaultVariant: 'production',
        variants: {
          production: {...variants.production, ios: {extra: true}},
        },
      },
      'Variant "production" ios',
    ],
    [
      {
        defaultVariant: 'production',
        variants: {
          production: {...variants.production, android: {extra: true}},
        },
      },
      'Variant "production" android',
    ],
  ])('rejects unknown keys at every options level', (options, context) => {
    expect(() => normalizeNativeVariants({configName: 'Acme', options})).toThrow(
      `${context} contains unknown key "extra".`,
    );
  });

  it.each([
    [{defaultVariant: 'production', variants: {}}, 'at least one'],
    [{defaultVariant: 'missing', variants}, 'defaultVariant references unknown'],
    [
      {canonicalVariant: 'missing', defaultVariant: 'production', variants},
      'canonicalVariant references unknown',
    ],
    [{defaultVariant: '', variants}, 'defaultVariant must be a nonempty'],
  ])('rejects empty or unknown variant selections', (options, message) => {
    expect(() => normalizeNativeVariants({configName: 'Acme', options})).toThrow(message);
  });

  it('rejects duplicate effective identifiers independently after overrides', () => {
    expect(() =>
      normalizeNativeVariants({
        configName: 'Acme',
        options: {
          defaultVariant: 'one',
          variants: {
            one: {
              ...variants.development,
              android: {applicationId: 'com.acme.one'},
              ios: {bundleIdentifier: 'com.acme.same'},
            },
            two: {
              ...variants.preview,
              android: {applicationId: 'com.acme.two'},
              ios: {bundleIdentifier: 'com.acme.SAME'},
            },
          },
        },
      }),
    ).toThrow('same iOS bundle identifier');

    expect(() =>
      normalizeNativeVariants({
        configName: 'Acme',
        options: {
          defaultVariant: 'one',
          variants: {
            one: {
              ...variants.development,
              android: {applicationId: 'com.acme.same'},
              ios: {bundleIdentifier: 'com.acme.ios-one'},
            },
            two: {
              ...variants.preview,
              android: {applicationId: 'com.acme.SAME'},
              ios: {bundleIdentifier: 'com.acme.ios-two'},
            },
          },
        },
      }),
    ).toThrow('same Android application ID');
  });

  it('rejects duplicate URL schemes without case sensitivity', () => {
    expect(() =>
      normalizeNativeVariants({
        configName: 'Acme',
        options: {
          defaultVariant: 'one',
          variants: {
            one: {...variants.development, urlScheme: 'acme-shared'},
            two: {...variants.preview, urlScheme: 'ACME-SHARED'},
          },
        },
      }),
    ).toThrow('same URL scheme');
  });

  it('rejects a URL scheme matching another variant iOS bundle identifier', () => {
    expect(() =>
      normalizeNativeVariants({
        configName: 'Acme',
        options: {
          defaultVariant: 'one',
          variants: {
            one: {
              ...variants.development,
              urlScheme: 'com.acme.ios-two',
            },
            two: {
              ...variants.preview,
              ios: {bundleIdentifier: 'com.acme.ios-two'},
            },
          },
        },
      }),
    ).toThrow(
      'Variant "one" URL scheme "com.acme.ios-two" matches variant "two" iOS bundle identifier.',
    );
  });

  it('rejects a URL scheme matching another variant Android application ID', () => {
    expect(() =>
      normalizeNativeVariants({
        configName: 'Acme',
        options: {
          defaultVariant: 'one',
          variants: {
            one: {
              ...variants.development,
              urlScheme: 'com.acme.androidtwo',
            },
            two: {
              ...variants.preview,
              android: {applicationId: 'com.acme.androidtwo'},
              ios: {bundleIdentifier: 'com.acme.ios-two'},
            },
          },
        },
      }),
    ).toThrow(
      'Variant "one" URL scheme "com.acme.androidtwo" matches variant "two" Android application ID.',
    );
  });

  it('allows a variant URL scheme to match its own platform identifiers', () => {
    const result = normalizeNativeVariants({
      configName: 'Acme',
      options: {
        defaultVariant: 'production',
        variants: {
          production: {
            ...variants.production,
            urlScheme: 'com.acme.app',
          },
        },
      },
    });

    expect(result.canonicalVariant.urlScheme).toBe('com.acme.app');
  });

  it.each([
    [['dev-test', 'dev_test'], 'same iOS configuration'],
    [['Development', 'development'], 'same variant key'],
    [['fooBar', 'foo-bar'], 'same iOS configuration'],
  ])('rejects naming collisions after normalization', (keys, message) => {
    const firstKey = keys[0] ?? '';
    const secondKey = keys[1] ?? '';
    expect(() =>
      normalizeNativeVariants({
        configName: 'Acme',
        options: {
          defaultVariant: firstKey,
          variants: {
            [firstKey]: {...variants.development, urlScheme: 'first'},
            [secondKey]: {...variants.preview, urlScheme: 'second'},
          },
        },
      }),
    ).toThrow(message);
  });

  it.each(['debug', 'release', 'main', 'CON', 'lpt1', 'android-test', 'de-bug'])(
    'rejects the reserved variant name %s',
    (key) => {
      expect(() =>
        normalizeNativeVariants({
          configName: 'Acme',
          options: {
            defaultVariant: key,
            variants: {[key]: variants.development},
          },
        }),
      ).toThrow('reserved name');
    },
  );

  it.each(['../preview', 'preview/release', 'preview;touch', 'preview\nrelease'])(
    'rejects the unsafe variant key %j',
    (key) => {
      expect(() =>
        normalizeNativeVariants({
          configName: 'Acme',
          options: {
            defaultVariant: key,
            variants: {[key]: variants.development},
          },
        }),
      ).toThrow('must start with a letter');
    },
  );

  it.each(['../Acme', 'Acme/Preview', 'Acme;touch', 'Acme\nPreview'])(
    'rejects the unsafe generated file label %j',
    (configName) => {
      expect(() =>
        normalizeNativeVariants({
          configName,
          options: {defaultVariant: 'production', variants},
        }),
      ).toThrow('path-safe');
    },
  );

  it('rejects unsafe explicit Xcode scheme names', () => {
    expect(() =>
      normalizeNativeVariants({
        configName: 'Acme',
        options: {
          defaultVariant: 'production',
          variants: {
            production: {
              ...variants.production,
              ios: {xcodeScheme: '../../Acme'},
            },
          },
        },
      }),
    ).toThrow('path-safe');
  });

  it.each([
    [{...variants.production, applicationId: 'invalid'}, 'iOS bundle identifier'],
    [
      {...variants.production, android: {applicationId: 'com.acme.bad-id'}},
      'Android application ID',
    ],
    [{...variants.production, urlScheme: '1-invalid'}, 'urlScheme'],
    [{...variants.production, runMode: 'profile'}, 'runMode'],
    [{...variants.production, displayName: 'Acme\u0000'}, 'control characters'],
  ])('rejects invalid variant field values', (variant, message) => {
    expect(() =>
      normalizeNativeVariants({
        configName: 'Acme',
        options: {
          defaultVariant: 'production',
          variants: {production: variant},
        },
      }),
    ).toThrow(message);
  });
});
