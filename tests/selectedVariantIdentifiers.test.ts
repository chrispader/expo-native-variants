import {describe, expect, it} from 'vitest';

import {applySelectedVariantIdentifiers} from '../src/options/applySelectedVariantIdentifiers';
import type {NormalizedNativeVariant} from '../src/options';

const selectedVariant = {
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

describe('applySelectedVariantIdentifiers', () => {
  it('fills missing base identifiers without changing the shared name or scheme', () => {
    const config = applySelectedVariantIdentifiers(
      {
        name: 'Acme shared project',
        scheme: ['acme-shared', 'oauth-callback'],
        slug: 'acme',
      },
      selectedVariant,
    );

    expect(config.ios?.bundleIdentifier).toBe('com.acme.app');
    expect(config.android?.package).toBe('com.acme.app');
    expect(config.name).toBe('Acme shared project');
    expect(config.scheme).toEqual(['acme-shared', 'oauth-callback']);
  });

  it('replaces existing identifiers with the selected variant', () => {
    expect(
      applySelectedVariantIdentifiers(
        {
          android: {package: 'com.acme.previous'},
          ios: {bundleIdentifier: 'com.acme.previous'},
          name: 'Acme',
          slug: 'acme',
        },
        selectedVariant,
      ),
    ).toMatchObject({
      android: {package: 'com.acme.app'},
      ios: {bundleIdentifier: 'com.acme.app'},
    });
  });
});
