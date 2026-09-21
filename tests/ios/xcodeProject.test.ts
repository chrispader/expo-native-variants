import {describe, expect, it} from 'vitest';

import type {NormalizedNativeVariantsOptions} from '../../src/options';
import {updateXcodeProject} from '../../src/ios/xcodeProject';

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

const production = {
  key: 'production',
  displayName: 'Acme',
  iosBundleIdentifier: 'com.acme.app',
  androidApplicationId: 'com.acme.app',
  urlScheme: 'acme',
  runMode: 'release' as const,
  iosScheme: 'Acme-Production',
  debugConfiguration: 'Debug-Production',
  releaseConfiguration: 'Release-Production',
  androidFlavor: 'production',
};

const options: NormalizedNativeVariantsOptions = {
  selectedVariant: production,
  iosTargets: [],
  variants: [development, production],
};

const extensionOptions: NormalizedNativeVariantsOptions = {
  ...options,
  iosTargets: [{bundleIdentifierSuffix: '.share', name: 'AcmeShare'}],
};

describe(updateXcodeProject, () => {
  it('selects per-variant icon catalogs for the app and keeps extension icon settings untouched', () => {
    const fixture = createProjectFixture();
    addExtensionTarget(fixture);
    const iconDevelopment = {...development, iosIcon: 'dev.png'};
    const iconProduction = {...production, iosIcon: 'prod.png'};
    updateXcodeProject(fixture.project, {
      ...extensionOptions,
      selectedVariant: iconProduction,
      variants: [iconDevelopment, iconProduction],
    });
    expect(
      getConfiguration(fixture, 'TARGET_CONFIG_LIST', 'Debug-Development').buildSettings
        .ASSETCATALOG_COMPILER_APPICON_NAME,
    ).toBe('"NativeVariantdevelopment"');
    expect(
      getConfiguration(fixture, 'TARGET_CONFIG_LIST', 'Release').buildSettings
        .ASSETCATALOG_COMPILER_APPICON_NAME,
    ).toBe('"NativeVariantproduction"');
    expect(
      getConfiguration(fixture, 'EXTENSION_CONFIG_LIST', 'Debug-Development').buildSettings,
    ).not.toHaveProperty('ASSETCATALOG_COMPILER_APPICON_NAME');
    updateXcodeProject(fixture.project, extensionOptions);
    expect(
      getConfiguration(fixture, 'TARGET_CONFIG_LIST', 'Debug-Development').buildSettings
        .ASSETCATALOG_COMPILER_APPICON_NAME,
    ).toBe('AppIcon');
  });
  it('clones project and target configurations while preserving base settings', () => {
    const fixture = createProjectFixture();
    const metadata = updateXcodeProject(fixture.project, options);

    expect(metadata).toEqual({
      targetUuid: 'TARGET',
      targetName: 'Acme',
      productName: 'Acme',
    });
    const targetDevelopment = getConfiguration(fixture, 'TARGET_CONFIG_LIST', 'Debug-Development');
    expect(targetDevelopment.buildSettings).toMatchObject({
      CUSTOM_DEBUG_SETTING: 'kept',
      EXPO_NATIVE_VARIANTS_MANAGED: 'YES',
      EXPO_NATIVE_VARIANT_DISPLAY_NAME: '"Acme Dev"',
      EXPO_NATIVE_VARIANT_KEY: '"development"',
      EXPO_NATIVE_VARIANT_URL_SCHEME: '"acme-dev"',
      PRODUCT_BUNDLE_IDENTIFIER: '"com.acme.app.dev"',
    });
    expect(targetDevelopment).not.toHaveProperty('baseConfigurationReference');
    expect(
      getConfiguration(fixture, 'PROJECT_CONFIG_LIST', 'Release-Production').buildSettings,
    ).toMatchObject({
      PROJECT_RELEASE_SETTING: 'kept',
      EXPO_NATIVE_VARIANTS_MANAGED: 'YES',
    });
  });

  it('maps base Debug and Release to the selected variant', () => {
    const fixture = createProjectFixture();
    updateXcodeProject(fixture.project, options);

    expect(getConfiguration(fixture, 'TARGET_CONFIG_LIST', 'Debug').buildSettings).toMatchObject({
      EXPO_NATIVE_VARIANT_DISPLAY_NAME: '"Acme"',
      PRODUCT_BUNDLE_IDENTIFIER: '"com.acme.app"',
    });
  });

  it('preserves CocoaPods references added to managed configurations', () => {
    const fixture = createProjectFixture();
    updateXcodeProject(fixture.project, options);
    const developmentConfig = getConfiguration(fixture, 'TARGET_CONFIG_LIST', 'Debug-Development');
    developmentConfig.baseConfigurationReference = 'PODS_DEVELOPMENT';
    developmentConfig.baseConfigurationReference_comment = 'Pods-Acme.debug-development.xcconfig';
    getConfiguration(fixture, 'TARGET_CONFIG_LIST', 'Debug').buildSettings.NEW_BASE_SETTING =
      'propagated';

    updateXcodeProject(fixture.project, options);

    expect(developmentConfig.baseConfigurationReference).toBe('PODS_DEVELOPMENT');
    expect(developmentConfig.buildSettings.NEW_BASE_SETTING).toBe('propagated');
  });

  it('removes stale managed configurations without touching foreign configurations', () => {
    const fixture = createProjectFixture();
    updateXcodeProject(fixture.project, options);
    const productionOnly = {
      selectedVariant: production,
      iosTargets: [],
      variants: [production],
    };

    updateXcodeProject(fixture.project, productionOnly);

    expect(() => getConfiguration(fixture, 'TARGET_CONFIG_LIST', 'Debug-Development')).toThrow();
    expect(getConfiguration(fixture, 'TARGET_CONFIG_LIST', 'Staging')).toBeDefined();
  });

  it('clones extension configurations and preserves native target settings', () => {
    const fixture = createProjectFixture();
    addExtensionTarget(fixture, {withExistingDevelopmentConfiguration: true});

    updateXcodeProject(fixture.project, extensionOptions);

    const developmentConfig = getConfiguration(
      fixture,
      'EXTENSION_CONFIG_LIST',
      'Debug-Development',
    );
    expect(developmentConfig.buildSettings).toMatchObject({
      CODE_SIGN_ENTITLEMENTS: 'AcmeShare/AcmeShare.entitlements',
      EXPO_NATIVE_VARIANTS_MANAGED: 'YES',
      EXPO_NATIVE_VARIANT_BUNDLE_IDENTIFIER: '"com.acme.app.dev"',
      EXPO_NATIVE_VARIANT_KEY: '"development"',
      FOREIGN_EXTENSION_SETTING: 'kept',
      PRODUCT_BUNDLE_IDENTIFIER: '"com.acme.app.dev.share"',
      SWIFT_VERSION: '5.0',
    });
    expect(developmentConfig.buildSettings).not.toHaveProperty('EXPO_NATIVE_VARIANT_DISPLAY_NAME');
    expect(developmentConfig.buildSettings).not.toHaveProperty('EXPO_NATIVE_VARIANT_URL_SCHEME');
    expect(getConfiguration(fixture, 'EXTENSION_CONFIG_LIST', 'Debug').buildSettings).toMatchObject(
      {
        EXPO_NATIVE_VARIANT_BUNDLE_IDENTIFIER: '"com.acme.app"',
        PRODUCT_BUNDLE_IDENTIFIER: '"com.acme.app.share"',
      },
    );
  });

  it('rejects additional native targets that are not configured', () => {
    const fixture = createProjectFixture();
    addExtensionTarget(fixture);

    expect(() => updateXcodeProject(fixture.project, options)).toThrow(
      'not configured in ios.targets: AcmeShare',
    );
  });

  it('rejects configured extension targets that do not exist', () => {
    const fixture = createProjectFixture();

    expect(() => updateXcodeProject(fixture.project, extensionOptions)).toThrow(
      'could not find configured iOS extension target "AcmeShare"',
    );
  });
});

type Configuration = {
  isa: string;
  baseConfigurationReference?: string;
  baseConfigurationReference_comment?: string;
  buildSettings: Record<string, unknown>;
  name: string;
};

function createProjectFixture() {
  let uuid = 0;
  const sections = {
    nativeTargets: {
      TARGET: {
        isa: 'PBXNativeTarget',
        buildConfigurationList: 'TARGET_CONFIG_LIST',
        name: 'Acme',
        productName: 'Acme',
        productType: 'com.apple.product-type.application',
      },
      TARGET_comment: 'Acme',
    } as Record<string, unknown>,
    projects: {
      PROJECT: {
        isa: 'PBXProject',
        buildConfigurationList: 'PROJECT_CONFIG_LIST',
      },
      PROJECT_comment: 'Project object',
    },
    configurations: {
      TARGET_DEBUG: {
        isa: 'XCBuildConfiguration',
        baseConfigurationReference: 'PODS_DEBUG',
        baseConfigurationReference_comment: 'Pods-Acme.debug.xcconfig',
        buildSettings: {CUSTOM_DEBUG_SETTING: 'kept'},
        name: 'Debug',
      },
      TARGET_RELEASE: {
        isa: 'XCBuildConfiguration',
        buildSettings: {CUSTOM_RELEASE_SETTING: 'kept'},
        name: 'Release',
      },
      TARGET_STAGING: {
        isa: 'XCBuildConfiguration',
        buildSettings: {FOREIGN_SETTING: 'kept'},
        name: 'Staging',
      },
      PROJECT_DEBUG: {
        isa: 'XCBuildConfiguration',
        buildSettings: {PROJECT_DEBUG_SETTING: 'kept'},
        name: 'Debug',
      },
      PROJECT_RELEASE: {
        isa: 'XCBuildConfiguration',
        buildSettings: {PROJECT_RELEASE_SETTING: 'kept'},
        name: 'Release',
      },
    } as Record<string, unknown>,
    lists: {
      TARGET_CONFIG_LIST: {
        buildConfigurations: [
          {value: 'TARGET_DEBUG', comment: 'Debug'},
          {value: 'TARGET_RELEASE', comment: 'Release'},
          {value: 'TARGET_STAGING', comment: 'Staging'},
        ],
      },
      PROJECT_CONFIG_LIST: {
        buildConfigurations: [
          {value: 'PROJECT_DEBUG', comment: 'Debug'},
          {value: 'PROJECT_RELEASE', comment: 'Release'},
        ],
      },
    } as Record<string, unknown>,
    files: {
      PODS_DEBUG: {path: 'Target Support Files/Pods-Acme/Pods-Acme.debug.xcconfig'},
      PODS_DEBUG_comment: 'Pods-Acme.debug.xcconfig',
    },
  };
  const project = {
    generateUuid: () => `GENERATED_${String(++uuid)}`,
    pbxFileReferenceSection: () => sections.files,
    pbxNativeTargetSection: () => sections.nativeTargets,
    pbxProjectSection: () => sections.projects,
    pbxXCBuildConfigurationSection: () => sections.configurations,
    pbxXCConfigurationList: () => sections.lists,
  };
  return {project, sections};
}

function addExtensionTarget(
  fixture: ReturnType<typeof createProjectFixture>,
  options: Readonly<{withExistingDevelopmentConfiguration?: boolean}> = {},
): void {
  fixture.sections.nativeTargets.EXTENSION = {
    isa: 'PBXNativeTarget',
    buildConfigurationList: 'EXTENSION_CONFIG_LIST',
    name: 'AcmeShare',
    productName: 'AcmeShare',
    productType: 'com.apple.product-type.app-extension',
  };
  fixture.sections.configurations.EXTENSION_DEBUG = {
    isa: 'XCBuildConfiguration',
    buildSettings: {
      CODE_SIGN_ENTITLEMENTS: 'AcmeShare/AcmeShare.entitlements',
      PRODUCT_BUNDLE_IDENTIFIER: '"com.acme.app.share"',
      SWIFT_VERSION: '5.0',
    },
    name: 'Debug',
  };
  fixture.sections.configurations.EXTENSION_RELEASE = {
    isa: 'XCBuildConfiguration',
    buildSettings: {
      CODE_SIGN_ENTITLEMENTS: 'AcmeShare/AcmeShare.entitlements',
      PRODUCT_BUNDLE_IDENTIFIER: '"com.acme.app.share"',
      SWIFT_VERSION: '5.0',
    },
    name: 'Release',
  };
  if (options.withExistingDevelopmentConfiguration === true) {
    fixture.sections.configurations.EXTENSION_DEVELOPMENT = {
      isa: 'XCBuildConfiguration',
      buildSettings: {
        FOREIGN_EXTENSION_SETTING: 'kept',
        PRODUCT_BUNDLE_IDENTIFIER: '"com.acme.incomplete.share"',
      },
      name: 'Debug-Development',
    };
  }
  fixture.sections.lists.EXTENSION_CONFIG_LIST = {
    buildConfigurations: [
      {value: 'EXTENSION_DEBUG', comment: 'Debug'},
      {value: 'EXTENSION_RELEASE', comment: 'Release'},
      ...(options.withExistingDevelopmentConfiguration === true
        ? [{value: 'EXTENSION_DEVELOPMENT', comment: 'Debug-Development'}]
        : []),
    ],
  };
}

function getConfiguration(
  fixture: ReturnType<typeof createProjectFixture>,
  listId: string,
  name: string,
): Configuration {
  const list = fixture.sections.lists[listId];
  if (!isConfigurationList(list)) {
    throw new Error(`Missing configuration list ${listId}`);
  }
  const reference = list.buildConfigurations.find((entry) => entry.comment === name);
  const configuration =
    reference === undefined ? undefined : fixture.sections.configurations[reference.value];
  if (!isConfiguration(configuration)) {
    throw new Error(`Missing configuration ${name}`);
  }
  return configuration;
}

function isConfigurationList(
  value: unknown,
): value is {buildConfigurations: {value: string; comment: string}[]} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'buildConfigurations' in value &&
    Array.isArray(value.buildConfigurations)
  );
}

function isConfiguration(value: unknown): value is Configuration {
  return (
    typeof value === 'object' &&
    value !== null &&
    'buildSettings' in value &&
    typeof value.buildSettings === 'object' &&
    value.buildSettings !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'isa' in value &&
    typeof value.isa === 'string'
  );
}
