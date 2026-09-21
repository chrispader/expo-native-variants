import {describe, expect, it} from 'vitest';

import {normalizeNativeVariants} from '../src/options';

const applicationId = 'com.acme.app';
function normalize(variant: object) {
  return normalizeNativeVariants({
    configName: 'Acme',
    options: {variants: {production: {applicationId, ...variant}}},
  });
}

describe('optional native and icon overrides', () => {
  it('honors explicit flavor, configurations, and scheme names', () => {
    expect(
      normalize({
        android: {flavor: 'store'},
        ios: {
          xcodeScheme: 'Store',
          debugConfiguration: 'Store-Debug',
          releaseConfiguration: 'AppStore',
        },
      }).selectedVariant,
    ).toMatchObject({
      androidFlavor: 'store',
      iosScheme: 'Store',
      debugConfiguration: 'Store-Debug',
      releaseConfiguration: 'AppStore',
    });
  });

  it.each([
    [{android: {flavor: 'main'}}, 'reserved name'],
    [{android: {flavor: 'bad-name'}}, 'Android flavor'],
    [{ios: {debugConfiguration: 'Local'}}, 'bundling scripts'],
    [{ios: {releaseConfiguration: 'StoreDebug'}}, 'bundling scripts'],
    [{ios: {debugConfiguration: 'Debug'}}, 'standard Debug'],
    [{ios: {releaseConfiguration: '../Release'}}, 'path-safe'],
    [{icon: ''}, 'image path'],
    [{ios: {icon: 'App.icon'}}, 'Icon Composer'],
    [{ios: {icon: {}}}, 'at least one'],
    [{ios: {icon: {light: 'icon.png', typo: true}}}, 'unknown key'],
    [{android: {adaptiveIcon: {backgroundColor: 'red'}}}, 'hex color'],
    [{android: {adaptiveIcon: {foregroundImage: 123}}}, 'image path'],
  ])('rejects invalid override %j', (variant, message) => {
    expect(() => normalize(variant)).toThrow(message);
  });

  it.each([{android: {flavor: 'same'}}, {ios: {releaseConfiguration: 'Store'}}])(
    'rejects collisions after overrides: %j',
    (overrides) => {
      expect(() =>
        normalizeNativeVariants({
          configName: 'Acme',
          options: {
            variants: {
              one: {applicationId: 'com.acme.one', ...overrides},
              two: {applicationId: 'com.acme.two', ...overrides},
            },
          },
        }),
      ).toThrow('same');
    },
  );
});
