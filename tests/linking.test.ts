import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {runInNewContext} from 'node:vm';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {withNativeVariants} from '../src';

const require = createRequire(import.meta.url);
// Run Expo's actual resolver without loading React Native's native module bridge.
const schemesSource = readFileSync(
  path.join(path.dirname(require.resolve('expo-linking/package.json')), 'build/Schemes.js'),
  'utf8',
)
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^export /gm, '');
const baseConfig = {name: 'Acme', slug: 'acme'};
const variants = {
  production: {applicationId: 'com.acme.app', urlScheme: 'acme'},
  preview: {applicationId: 'com.acme.app.preview', urlScheme: 'acme-preview'},
};

afterEach(() => vi.unstubAllEnvs());

describe('Expo Linking release scheme resolution', () => {
  it('reproduces the missing-scheme crash despite a configured native identifier', () => {
    expect(() =>
      resolveScheme({...baseConfig, ios: {bundleIdentifier: 'com.acme.app'}}, 'ios'),
    ).toThrow('no custom scheme defined');
  });

  it.each(['ios', 'android'] as const)(
    'resolves each native build on %s without a user getUrlScheme function',
    (platform) => {
      for (const [key, {urlScheme}] of Object.entries(variants)) {
        vi.stubEnv('EXPO_NATIVE_VARIANT_KEY', key);
        const config = withNativeVariants(baseConfig, {variants});
        expect(resolveScheme(config, platform)).toBe(urlScheme);
      }
    },
  );
});

function resolveScheme(config: object, platform: 'ios' | 'android'): unknown {
  return runInNewContext(`${schemesSource}\nresolveScheme({isSilent: true});`, {
    Constants: {expoConfig: config, executionEnvironment: 'bare'},
    ExecutionEnvironment: {Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient'},
    Platform: {select: (options: Record<string, unknown>) => options[platform]},
    __DEV__: false,
    console,
  });
}
