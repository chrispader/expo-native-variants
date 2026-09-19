import {describe, expect, it} from 'vitest';

import {getNativeVariant} from '../src/runtime';

const variants = {
  development: {
    android: {applicationId: 'com.acme.android.dev'},
    applicationId: 'com.acme.app.dev',
    displayName: 'Acme Dev',
    ios: {bundleIdentifier: 'com.acme.ios.dev'},
    runMode: 'debug',
    urlScheme: 'acme-dev',
  },
  production: {
    applicationId: 'com.acme.app',
    displayName: 'Acme',
    urlScheme: 'acme',
  },
};

describe('getNativeVariant', () => {
  it('resolves shared and overridden platform identifiers', () => {
    expect(getNativeVariant('com.acme.ios.dev', variants)).toBe('development');
    expect(getNativeVariant('com.acme.android.dev', variants)).toBe('development');
    expect(getNativeVariant('com.acme.app', variants)).toBe('production');
  });

  it('returns null for missing and unknown identifiers instead of assuming production', () => {
    expect(getNativeVariant(null, variants)).toBeNull();
    expect(getNativeVariant(undefined, variants)).toBeNull();
    expect(getNativeVariant('', variants)).toBeNull();
    expect(getNativeVariant('host.exp.Exponent', variants)).toBeNull();
  });

  it('returns null for a cross-platform ambiguity unless the platform resolves it', () => {
    const ambiguousVariants = {
      iosOwner: {
        applicationId: 'com.acme.ios-owner',
        displayName: 'iOS owner',
        ios: {bundleIdentifier: 'com.acme.shared'},
        urlScheme: 'ios-owner',
      },
      androidOwner: {
        android: {applicationId: 'com.acme.shared'},
        applicationId: 'com.acme.android-owner',
        displayName: 'Android owner',
        urlScheme: 'android-owner',
      },
    };

    expect(getNativeVariant('com.acme.shared', ambiguousVariants)).toBeNull();
    expect(getNativeVariant('com.acme.shared', ambiguousVariants, 'ios')).toBe('iosOwner');
    expect(getNativeVariant('com.acme.shared', ambiguousVariants, 'android')).toBe(
      'androidOwner',
    );
  });

  it('returns null when one platform identifier is ambiguous in an unvalidated map', () => {
    const ambiguousVariants = {
      one: variants.production,
      two: {...variants.production, displayName: 'Acme duplicate'},
    };

    expect(getNativeVariant('com.acme.app', ambiguousVariants, 'ios')).toBeNull();
  });
});
