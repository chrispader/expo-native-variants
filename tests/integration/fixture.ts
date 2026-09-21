type NeighborPosition = 'after' | 'before';

type VariantSettings = Readonly<{
  applicationId: string;
  displayName: string;
  runMode: 'debug' | 'release';
  urlScheme: string;
  icon: string;
}>;

type IosTargetSettings = Readonly<{
  bundleIdentifierSuffix: string;
}>;

export type PrebuildSettings = Readonly<{
  neighborPosition: NeighborPosition;
  options: Readonly<{
    variant: string;
    ios: Readonly<{
      targets: Readonly<Record<string, IosTargetSettings>>;
    }>;
    variants: Readonly<Record<string, VariantSettings>>;
  }>;
}>;

export function initialSettings(neighborPosition: NeighborPosition): PrebuildSettings {
  return {
    neighborPosition,
    options: {
      variant: 'production',
      ios: extensionTargets(),
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
      variant: 'production',
      ios: extensionTargets(),
      variants: {
        local: variant('Acme Local', 'com.acme.app.local', 'acme-local', 'debug'),
        production: variant('Acme', 'com.acme.app', 'acme', 'release'),
      },
    },
  };
}

function extensionTargets() {
  return {
    targets: {
      AcmeShare: {bundleIdentifierSuffix: '.share'},
    },
  } as const;
}

function variant(
  displayName: string,
  applicationId: string,
  urlScheme: string,
  runMode: 'debug' | 'release',
): VariantSettings {
  const icon = runMode === 'debug' ? './icons/development.png' : './icons/production.png';
  return {applicationId, displayName, runMode, urlScheme, icon};
}

export const CONSUMER_PACKAGE = {
  dependencies: {
    '@bacons/apple-targets': '5.0.0',
    expo: '57.0.24',
    'expo-native-variants': '0.2.0-alpha.0', // x-release-please-version
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
  ios: {
    bundleIdentifier: 'com.acme.app',
    entitlements: {
      'com.apple.security.application-groups': [
        'group.$(EXPO_NATIVE_VARIANT_BUNDLE_IDENTIFIER)',
      ],
    },
  },
  plugins: [
    '@bacons/apple-targets',
    ...(settings.neighborPosition === 'before'
      ? [neighbor, nativeVariants]
      : [nativeVariants, neighbor]),
  ],
};
`;

export const APPLE_TARGET_CONFIG = `'use strict';

module.exports = {
  type: 'share',
  name: 'AcmeShare',
  displayName: 'Acme',
  bundleIdentifier: '.share',
  deploymentTarget: '16.4',
  entitlements: {
    'com.apple.security.application-groups': [
      'group.$(EXPO_NATIVE_VARIANT_BUNDLE_IDENTIFIER)',
    ],
  },
};
`;

export const SHARE_VIEW_CONTROLLER = `import UIKit

final class ShareViewController: UIViewController {}
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
