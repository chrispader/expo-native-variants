type NeighborPosition = 'after' | 'before';

type VariantSettings = Readonly<{
  applicationId: string;
  displayName: string;
  runMode: 'debug' | 'release';
  urlScheme: string;
}>;

export type PrebuildSettings = Readonly<{
  neighborPosition: NeighborPosition;
  options: Readonly<{
    defaultVariant: string;
    variants: Readonly<Record<string, VariantSettings>>;
  }>;
}>;

export function initialSettings(neighborPosition: NeighborPosition): PrebuildSettings {
  return {
    neighborPosition,
    options: {
      defaultVariant: 'production',
      variants: {
        development: variant('Acme Dev', 'com.acme.app.dev', 'acme-dev', 'debug'),
        preview: variant('Acme Preview', 'com.acme.app.preview', 'acme-preview', 'release'),
        production: variant('Acme', 'com.acme.app', 'acme', 'release'),
      },
    },
  };
}

export function renamedSettings(neighborPosition: NeighborPosition): PrebuildSettings {
  return {
    neighborPosition,
    options: {
      defaultVariant: 'production',
      variants: {
        local: variant('Acme Local', 'com.acme.app.local', 'acme-local', 'debug'),
        production: variant('Acme', 'com.acme.app', 'acme', 'release'),
      },
    },
  };
}

function variant(
  displayName: string,
  applicationId: string,
  urlScheme: string,
  runMode: 'debug' | 'release',
): VariantSettings {
  return {applicationId, displayName, runMode, urlScheme};
}

export const CONSUMER_PACKAGE = {
  dependencies: {
    expo: '57.0.24',
    'expo-native-variants': '0.1.0-alpha.0',
    react: '19.2.3',
    'react-native': '0.86.3',
  },
  main: 'index.js',
  name: 'native-variants-integration-consumer',
  private: true,
  version: '1.0.0',
};

export const APP_CONFIG = `'use strict';

const settings = require('./variant-settings.json');
const nativeVariants = ['expo-native-variants', settings.options];
const neighbor = './neighbor-plugin.js';

module.exports = {
  name: 'Acme',
  slug: 'acme-native-variants-integration',
  version: '1.0.0',
  plugins:
    settings.neighborPosition === 'before'
      ? [neighbor, nativeVariants]
      : [nativeVariants, neighbor],
};
`;

export const NEIGHBOR_PLUGIN = `'use strict';

const {withAndroidManifest, withInfoPlist} = require('expo/config-plugins');

module.exports = (config) => {
  const withPlistMarker = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NeighborMarker = true;
    return modConfig;
  });

  return withAndroidManifest(withPlistMarker, (modConfig) => {
    const application = modConfig.modResults.manifest.application[0];
    application.$['android:usesCleartextTraffic'] = 'false';
    return modConfig;
  });
};
`;
