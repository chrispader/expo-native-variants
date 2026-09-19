import {describe, expect, it} from 'vitest';

import {applyCanonicalIdentifiers} from '../src/options/applyCanonicalIdentifiers';
import type {NormalizedNativeVariant} from '../src/options';

const canonicalVariant = {
  androidApplicationId: 'com.acme.app',
  androidFlavor: 'production',
  debugConfiguration: 'Debug-Production',
  displayName: 'Acme',
  iosBundleIdentifier: 'com.acme.app',
  iosScheme: 'Acme-Production',
  key: 'production',
  releaseConfiguration: 'Release-Production',
  runMode: 'release',
  urlScheme: 'acme',
} satisfies NormalizedNativeVariant;

describe('applyCanonicalIdentifiers', () => {
  it('fills missing base identifiers without changing the shared name or scheme', () => {
    const config = applyCanonicalIdentifiers(
      {
        name: 'Acme shared project',
        scheme: ['acme-shared', 'oauth-callback'],
        slug: 'acme',
      },
      canonicalVariant,
    );

    expect(config.ios?.bundleIdentifier).toBe('com.acme.app');
    expect(config.android?.package).toBe('com.acme.app');
    expect(config.name).toBe('Acme shared project');
    expect(config.scheme).toEqual(['acme-shared', 'oauth-callback']);
  });

  it('accepts matching explicit base identifiers', () => {
    expect(
      applyCanonicalIdentifiers(
        {
          android: {package: 'com.acme.app'},
          ios: {bundleIdentifier: 'com.acme.app'},
          name: 'Acme',
          slug: 'acme',
        },
        canonicalVariant,
      ),
    ).toMatchObject({
      android: {package: 'com.acme.app'},
      ios: {bundleIdentifier: 'com.acme.app'},
    });
  });

  it.each([
    [
      {ios: {bundleIdentifier: 'com.acme.wrong'}, name: 'Acme', slug: 'acme'},
      'ios.bundleIdentifier',
    ],
    [
      {android: {package: 'com.acme.wrong'}, name: 'Acme', slug: 'acme'},
      'android.package',
    ],
  ])('rejects a conflicting explicit %s identity', (config, field) => {
    expect(() => applyCanonicalIdentifiers(config, canonicalVariant)).toThrow(
      `${field} is "com.acme.wrong", but canonicalVariant requires "com.acme.app".`,
    );
  });
});
