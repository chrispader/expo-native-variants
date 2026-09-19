import {describe, expect, it} from 'vitest';

import type {NormalizedNativeVariantsOptions} from '../../src/options';
import {
  DISPLAY_NAME_BUILD_SETTING,
  findSharedUrlSchemes,
  updateInfoPlist,
  URL_SCHEME_BUILD_SETTING,
} from '../../src/ios/infoPlist';

const development = {
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

const options: NormalizedNativeVariantsOptions = {
  iosTargets: [],
  canonicalVariant: development,
  variants: [development],
};

describe(updateInfoPlist, () => {
  it('uses build setting placeholders and preserves unrelated URL registrations', () => {
    const result = updateInfoPlist({
      infoPlist: {
        CFBundleName: 'Acme',
        CFBundleURLTypes: [
          {
            CFBundleTypeRole: 'Editor',
            CFBundleURLIconFile: 'CallbackIcon',
            CFBundleURLSchemes: [
              'exp+acme',
              'com.acme.app.dev',
              'oauth-callback',
            ],
          },
          {CFBundleURLSchemes: ['acme-dev']},
        ],
      },
      options,
      expoSchemes: ['exp+acme', 'com.acme.app.dev'],
    });

    expect(result.CFBundleDisplayName).toBe(`$(${DISPLAY_NAME_BUILD_SETTING})`);
    expect(result.CFBundleURLTypes).toEqual([
      {
        CFBundleTypeRole: 'Editor',
        CFBundleURLIconFile: 'CallbackIcon',
        CFBundleURLSchemes: ['oauth-callback'],
      },
      {
        CFBundleURLName: 'expo-native-variants',
        CFBundleURLSchemes: [
          `$(${URL_SCHEME_BUILD_SETTING})`,
          '$(PRODUCT_BUNDLE_IDENTIFIER)',
        ],
      },
    ]);
    expect(result.CFBundleName).toBe('Acme');
  });

  it('reconciles its owned URL registration on repeated runs', () => {
    const once = updateInfoPlist({infoPlist: {}, options, expoSchemes: []});
    const twice = updateInfoPlist({infoPlist: once, options, expoSchemes: []});

    expect(twice).toEqual(once);
  });

  it('preserves URL type dictionaries without scheme arrays and rejects malformed arrays', () => {
    expect(
      updateInfoPlist({
        infoPlist: {CFBundleURLTypes: [{CFBundleTypeRole: 'Viewer'}]},
        options,
        expoSchemes: [],
      }).CFBundleURLTypes,
    ).toContainEqual({CFBundleTypeRole: 'Viewer'});

    expect(() =>
      updateInfoPlist({
        infoPlist: {CFBundleURLTypes: [{CFBundleURLSchemes: ['valid', 1]}]},
        options,
        expoSchemes: [],
      }),
    ).toThrow('invalid CFBundleURLSchemes');
  });
});

describe(findSharedUrlSchemes, () => {
  it('returns schemes outside the generated registration', () => {
    expect(
      findSharedUrlSchemes({
        CFBundleURLTypes: [
          {CFBundleURLSchemes: ['oauth']},
          {
            CFBundleURLName: 'expo-native-variants',
            CFBundleURLSchemes: ['$(_OWNED)', '$(PRODUCT_BUNDLE_IDENTIFIER)'],
          },
        ],
      }),
    ).toEqual(['oauth']);
  });
});
