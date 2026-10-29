import type {XcodeProject} from 'expo/config-plugins';

import {configPlugins} from '../configPlugins';
import type {
  NormalizedNativeVariant,
  NormalizedNativeVariantsOptions,
} from '../options';
import {
  DISPLAY_NAME_BUILD_SETTING,
  URL_SCHEME_BUILD_SETTING,
} from './infoPlist';

import {applyIosIconBuildSettings} from '../icons/resolve';
import {UPDATE_CHANNEL_BUILD_SETTING} from './updates';

const {Target, XcodeUtils} = configPlugins.IOSConfig;

const MANAGED_BUILD_SETTING = 'EXPO_NATIVE_VARIANTS_MANAGED';
const APPLICATION_IDENTIFIER_BUILD_SETTING = 'EXPO_NATIVE_VARIANT_BUNDLE_IDENTIFIER';
const VARIANT_KEY_BUILD_SETTING = 'EXPO_NATIVE_VARIANT_KEY';
const SUPPORTED_EXTENSION_PRODUCT_TYPES = new Set<string>([
  Target.TargetType.EXTENSION,
  'com.apple.product-type.extensionkit-extension',
]);

export type XcodeProjectMetadata = Readonly<{
  targetUuid: string;
  targetName: string;
  productName: string;
}>;

// Expo's helpers return untyped xcode objects, so these describe the fields the plugin reads.
type NativeTarget = {
  buildConfigurationList: string;
  name: string;
  productName: string;
  productType: string;
};

type NativeTargetEntry = readonly [uuid: string, target: NativeTarget];

type BuildConfiguration = {
  isa: string;
  baseConfigurationReference?: unknown;
  baseConfigurationReference_comment?: unknown;
  buildSettings: Record<string, unknown>;
  name: string;
};

type ConfigurationList = {buildConfigurations: {value: string; comment: string}[]};
type ConfigurationOwner =
  | Readonly<{type: 'project'}>
  | Readonly<{type: 'application'}>
  | Readonly<{bundleIdentifierSuffix: string; type: 'extension'}>;

export function updateXcodeProject(
  project: XcodeProject,
  options: NormalizedNativeVariantsOptions,
): XcodeProjectMetadata {
  const nativeTargets: readonly NativeTargetEntry[] = Target.getNativeTargets(project);
  const applicationTarget = requireApplicationTarget(nativeTargets);
  const [applicationTargetUuid, target] = applicationTarget;
  const projectConfigurationListId: string =
    project.getFirstProject().firstProject.buildConfigurationList;

  reconcileConfigurationList({
    project,
    configurationListId: target.buildConfigurationList,
    options,
    owner: {type: 'application'},
  });
  reconcileConfigurationList({
    project,
    configurationListId: projectConfigurationListId,
    options,
    owner: {type: 'project'},
  });

  reconcileExtensionTargets({
    project,
    nativeTargets,
    options,
    applicationTargetUuid,
  });

  return readXcodeProjectMetadata(applicationTarget);
}

export function getXcodeProjectMetadata(project: XcodeProject): XcodeProjectMetadata {
  return readXcodeProjectMetadata(requireApplicationTarget(Target.getNativeTargets(project)));
}

function readXcodeProjectMetadata([targetUuid, target]: NativeTargetEntry): XcodeProjectMetadata {
  return {
    targetUuid,
    targetName: XcodeUtils.unquote(target.name),
    productName: XcodeUtils.unquote(target.productName),
  };
}

type ReconcileExtensionTargetsArgs = Readonly<{
  project: XcodeProject;
  nativeTargets: readonly NativeTargetEntry[];
  options: NormalizedNativeVariantsOptions;
  applicationTargetUuid: string;
}>;

function reconcileExtensionTargets({
  project,
  nativeTargets,
  options,
  applicationTargetUuid,
}: ReconcileExtensionTargetsArgs): void {
  const configuredNames = new Set(options.iosTargets.map(({name}) => name));

  for (const configuredTarget of options.iosTargets) {
    const target = nativeTargets.find(
      ([, nativeTarget]) => XcodeUtils.unquote(nativeTarget.name) === configuredTarget.name,
    )?.[1];
    if (target === undefined) {
      throw new Error(
        `expo-native-variants could not find configured iOS extension target "${configuredTarget.name}". Ensure its target-generating plugin runs before expo-native-variants.`,
      );
    }
    const productType = XcodeUtils.unquote(target.productType);
    if (!SUPPORTED_EXTENSION_PRODUCT_TYPES.has(productType)) {
      throw new Error(
        `expo-native-variants supports app-extension targets in ios.targets; "${configuredTarget.name}" has product type "${productType}".`,
      );
    }
    reconcileConfigurationList({
      project,
      configurationListId: target.buildConfigurationList,
      options,
      owner: {
        bundleIdentifierSuffix: configuredTarget.bundleIdentifierSuffix,
        type: 'extension',
      },
    });
  }

  const unsupportedTargets = nativeTargets
    .filter(([uuid, target]) =>
      uuid !== applicationTargetUuid && !configuredNames.has(XcodeUtils.unquote(target.name)))
    .map(([, target]) => XcodeUtils.unquote(target.name));
  if (unsupportedTargets.length > 0) {
    throw new Error(
      `expo-native-variants found additional iOS targets that are not configured in ios.targets: ${unsupportedTargets.join(', ')}.`,
    );
  }
}

type ReconcileConfigurationListArgs = Readonly<{
  project: XcodeProject;
  configurationListId: string;
  options: NormalizedNativeVariantsOptions;
  owner: ConfigurationOwner;
}>;

function reconcileConfigurationList({
  project,
  configurationListId,
  options,
  owner,
}: ReconcileConfigurationListArgs): void {
  const debugSource = getConfigurationByName(project, configurationListId, 'Debug');
  const releaseSource = getConfigurationByName(project, configurationListId, 'Release');
  const desiredNames = new Set(
    options.variants.flatMap((variant) => [
      variant.debugConfiguration,
      variant.releaseConfiguration,
    ]),
  );

  for (const [uuid, configuration] of getBuildConfigurations(project, configurationListId)) {
    const isManaged = configuration.buildSettings[MANAGED_BUILD_SETTING] === 'YES';

    if (isManaged && !desiredNames.has(XcodeUtils.unquote(configuration.name))) {
      removeBuildConfiguration(project, configurationListId, uuid);
    }
  }

  for (const variant of options.variants) {
    const debugConfiguration = reconcileVariantConfiguration({
      project,
      configurationListId,
      source: debugSource,
      name: variant.debugConfiguration,
      variant,
      owner,
    });
    if (owner.type === 'project') {
      addSwiftDebugCondition(debugConfiguration.buildSettings);
    }
    reconcileVariantConfiguration({
      project,
      configurationListId,
      source: releaseSource,
      name: variant.releaseConfiguration,
      variant,
      owner,
    });
  }

  if (owner.type !== 'project') {
    applyVariantSettings(debugSource, options.selectedVariant, owner);
    applyVariantSettings(releaseSource, options.selectedVariant, owner);
  }
}

type ReconcileVariantConfigurationArgs = Readonly<{
  project: XcodeProject;
  configurationListId: string;
  source: BuildConfiguration;
  name: string;
  variant: NormalizedNativeVariant;
  owner: ConfigurationOwner;
}>;

function reconcileVariantConfiguration({
  project,
  configurationListId,
  source,
  name,
  variant,
  owner,
}: ReconcileVariantConfigurationArgs): BuildConfiguration {
  const fileReferences: Record<string, unknown> = project.pbxFileReferenceSection();
  const existing = findConfigurationByName(project, configurationListId, name);

  if (existing !== undefined) {
    const isManaged = existing.buildSettings[MANAGED_BUILD_SETTING] === 'YES';
    if (!isManaged && owner.type !== 'extension') {
      throw new Error(
        `expo-native-variants cannot create iOS build configuration "${name}" because it already exists and is not managed by the plugin.`,
      );
    }
    if (isManaged) {
      refreshConfiguration({configuration: existing, source, fileReferences});
    } else {
      adoptExtensionConfiguration({configuration: existing, source, fileReferences});
    }
    existing.name = name;
    setManagedSettings(existing, variant, owner);
    return existing;
  }

  const uuid = project.generateUuid();
  const configuration = cloneConfiguration({source, fileReferences});
  configuration.name = name;
  setManagedSettings(configuration, variant, owner);
  const configurationSection = project.pbxXCBuildConfigurationSection();
  configurationSection[uuid] = configuration;
  configurationSection[`${uuid}_comment`] = name;
  getConfigurationList(project, configurationListId).buildConfigurations.push({
    value: uuid,
    comment: name,
  });
  return configuration;
}

function adoptExtensionConfiguration({
  configuration,
  source,
  fileReferences,
}: Readonly<{
  configuration: BuildConfiguration;
  source: BuildConfiguration;
  fileReferences: Record<string, unknown>;
}>): void {
  const existingBuildSettings = structuredClone(configuration.buildSettings);
  refreshConfiguration({configuration, source, fileReferences});
  Object.assign(configuration.buildSettings, existingBuildSettings);
}

function refreshConfiguration({
  configuration,
  source,
  fileReferences,
}: Readonly<{
  configuration: BuildConfiguration;
  source: BuildConfiguration;
  fileReferences: Record<string, unknown>;
}>): void {
  const baseConfigurationReference = configuration.baseConfigurationReference;
  const baseConfigurationReferenceComment = configuration.baseConfigurationReference_comment;
  const refreshed = cloneConfiguration({source, fileReferences});

  for (const key of Object.keys(configuration)) {
    delete configuration[key as keyof BuildConfiguration];
  }
  Object.assign(configuration, refreshed);
  if (baseConfigurationReference !== undefined) {
    configuration.baseConfigurationReference = baseConfigurationReference;
  }
  if (baseConfigurationReferenceComment !== undefined) {
    configuration.baseConfigurationReference_comment = baseConfigurationReferenceComment;
  }
}

function cloneConfiguration({
  source,
  fileReferences,
}: Readonly<{
  source: BuildConfiguration;
  fileReferences: Record<string, unknown>;
}>): BuildConfiguration {
  const clone = structuredClone(source);
  if (hasCocoaPodsBaseConfiguration({configuration: clone, fileReferences})) {
    delete clone.baseConfigurationReference;
    delete clone.baseConfigurationReference_comment;
  }
  return clone;
}

function hasCocoaPodsBaseConfiguration({
  configuration,
  fileReferences,
}: Readonly<{
  configuration: BuildConfiguration;
  fileReferences: Record<string, unknown>;
}>): boolean {
  const reference = configuration.baseConfigurationReference;
  if (typeof reference !== 'string') {
    return false;
  }

  const directComment = configuration.baseConfigurationReference_comment;
  const sectionComment = fileReferences[`${reference}_comment`];
  const fileReference = fileReferences[reference];
  const filePath = isRecord(fileReference) ? fileReference.path : undefined;
  return [directComment, sectionComment, filePath].some(
    (value) => typeof value === 'string' && /Pods-.*\.xcconfig/i.test(value),
  );
}

/** React Native's post-install hook adds Swift's DEBUG condition only to the configuration named Debug. */
function addSwiftDebugCondition(settings: Record<string, unknown>): void {
  const current = settings.SWIFT_ACTIVE_COMPILATION_CONDITIONS;
  const conditions = Array.isArray(current)
    ? current
    : typeof current === 'string'
      ? [current]
      : ['"$(inherited)"'];
  const hasDebug = conditions.some(
    (condition) =>
      typeof condition === 'string' &&
      XcodeUtils.unquote(condition).split(/\s+/).includes('DEBUG'),
  );
  if (!hasDebug) {
    settings.SWIFT_ACTIVE_COMPILATION_CONDITIONS = [...conditions, 'DEBUG'];
  }
}

function setManagedSettings(
  configuration: BuildConfiguration,
  variant: NormalizedNativeVariant,
  owner: ConfigurationOwner,
): void {
  configuration.buildSettings[MANAGED_BUILD_SETTING] = 'YES';
  configuration.buildSettings[VARIANT_KEY_BUILD_SETTING] = quote(variant.key);
  if (owner.type !== 'project') {
    applyVariantSettings(configuration, variant, owner);
  }
}

function applyVariantSettings(
  configuration: BuildConfiguration,
  variant: NormalizedNativeVariant,
  owner: Exclude<ConfigurationOwner, Readonly<{type: 'project'}>>,
): void {
  configuration.buildSettings[VARIANT_KEY_BUILD_SETTING] = quote(variant.key);
  configuration.buildSettings[APPLICATION_IDENTIFIER_BUILD_SETTING] = quote(
    variant.iosBundleIdentifier,
  );
  const bundleIdentifier =
    owner.type === 'application'
      ? variant.iosBundleIdentifier
      : `${variant.iosBundleIdentifier}${owner.bundleIdentifierSuffix}`;
  configuration.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = quote(
    bundleIdentifier,
  );
  if (owner.type === 'application') {
    configuration.buildSettings[DISPLAY_NAME_BUILD_SETTING] = quote(variant.displayName);
    configuration.buildSettings[URL_SCHEME_BUILD_SETTING] = quote(variant.urlScheme);
    if (variant.updateChannel === undefined) {
      delete configuration.buildSettings[UPDATE_CHANNEL_BUILD_SETTING];
    } else {
      configuration.buildSettings[UPDATE_CHANNEL_BUILD_SETTING] = quote(variant.updateChannel);
    }
    applyIosIconBuildSettings(configuration.buildSettings, variant);
  } else {
    delete configuration.buildSettings[DISPLAY_NAME_BUILD_SETTING];
    delete configuration.buildSettings[URL_SCHEME_BUILD_SETTING];
  }
}

function getConfigurationByName(
  project: XcodeProject,
  configurationListId: string,
  name: string,
): BuildConfiguration {
  const configuration = findConfigurationByName(project, configurationListId, name);
  if (configuration === undefined) {
    throw new Error(
      `expo-native-variants requires the standard iOS build configuration "${name}".`,
    );
  }
  return configuration;
}

function findConfigurationByName(
  project: XcodeProject,
  configurationListId: string,
  name: string,
): BuildConfiguration | undefined {
  return getBuildConfigurations(project, configurationListId).find(
    ([, configuration]) => XcodeUtils.unquote(configuration.name) === name,
  )?.[1];
}

function removeBuildConfiguration(
  project: XcodeProject,
  configurationListId: string,
  uuid: string,
): void {
  const configurationList = getConfigurationList(project, configurationListId);
  configurationList.buildConfigurations = configurationList.buildConfigurations.filter(
    (reference) => reference.value !== uuid,
  );
  const configurationSection = project.pbxXCBuildConfigurationSection();
  delete configurationSection[uuid];
  delete configurationSection[`${uuid}_comment`];
}

function requireApplicationTarget(
  nativeTargets: readonly NativeTargetEntry[],
): NativeTargetEntry {
  const applicationTargets = nativeTargets.filter(([, target]) =>
    Target.isTargetOfType(target, Target.TargetType.APPLICATION));
  const [applicationTarget] = applicationTargets;
  if (applicationTargets.length !== 1 || applicationTarget === undefined) {
    throw new Error(
      `expo-native-variants supports exactly one iOS application target; found ${applicationTargets.length}.`,
    );
  }
  return applicationTarget;
}

function getBuildConfigurations(
  project: XcodeProject,
  configurationListId: string,
): readonly (readonly [uuid: string, configuration: BuildConfiguration])[] {
  return XcodeUtils.getBuildConfigurationsForListId(project, configurationListId);
}

function getConfigurationList(
  project: XcodeProject,
  configurationListId: string,
): ConfigurationList {
  return project.pbxXCConfigurationList()[configurationListId];
}

function quote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
