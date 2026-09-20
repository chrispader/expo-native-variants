import {describe, expect, it} from 'vitest';

import {withNativeVariants} from '../src';

const variants = {
  production: {applicationId: 'com.acme.app'},
  development: {applicationId: 'com.acme.app.dev'},
};

describe('withNativeVariants', () => {
  it('projects the first variant with the minimum options', () => {
    const config = withNativeVariants(
      {name: 'Acme', slug: 'acme'},
      {variants},
    );

    expect(config.android?.package).toBe('com.acme.app');
    expect(config.ios?.bundleIdentifier).toBe('com.acme.app');
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
});
