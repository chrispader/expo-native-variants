import type {
  NormalizedNativeVariant,
  NormalizedNativeVariantsIosTarget,
  NormalizedNativeVariantsOptions,
} from '../options';
import {
  DISPLAY_NAME_BUILD_SETTING,
  URL_SCHEME_BUILD_SETTING,
} from './infoPlist';

const MANAGED_BUILD_SETTING = 'EXPO_NATIVE_VARIANTS_MANAGED';
const APPLICATION_IDENTIFIER_BUILD_SETTING = 'EXPO_NATIVE_VARIANT_BUNDLE_IDENTIFIER';
const VARIANT_KEY_BUILD_SETTING = 'EXPO_NATIVE_VARIANT_KEY';
const APPLICATION_PRODUCT_TYPE = 'com.apple.product-type.application';
const SUPPORTED_EXTENSION_PRODUCT_TYPES = new Set([
  'com.apple.product-type.app-extension',
  'com.apple.product-type.extensionkit-extension',
]);

type XcodeProjectLike = Readonly<{
  generateUuid: () => string;
  pbxFileReferenceSection: () => Record<string, unknown>;
  pbxNativeTargetSection: () => Record<string, unknown>;
  pbxProjectSection: () => Record<string, unknown>;
  pbxXCBuildConfigurationSection: () => Record<string, unknown>;
  pbxXCConfigurationList: () => Record<string, unknown>;
}>;

export type XcodeProjectMetadata = Readonly<{
  targetUuid: string;
  targetName: string;
  productName: string;
}>;

type BuildConfiguration = {
  isa: string;
  baseConfigurationReference?: unknown;
  baseConfigurationReference_comment?: unknown;
  buildSettings: Record<string, unknown>;
  name: string;
};

type ConfigurationReference = {value: string; comment: string};
type ConfigurationList = {buildConfigurations: ConfigurationReference[]};
type NativeTargetEntry = readonly [string, Record<string, unknown>];
type ConfigurationOwner =
  | Readonly<{type: 'project'}>
  | Readonly<{type: 'application'}>
  | Readonly<{bundleIdentifierSuffix: string; type: 'extension'}>;

export function updateXcodeProject(
  projectValue: unknown,
  options: NormalizedNativeVariantsOptions,
): XcodeProjectMetadata {
  const project = requireXcodeProject(projectValue);
  const metadata = readXcodeProjectMetadata(project);
  const nativeTargets = readNativeTargetEntries(project.pbxNativeTargetSection());
  const [, target] = requireApplicationTarget(nativeTargets);
  const projectEntry = requireSingleEntry(project.pbxProjectSection(), 'PBX project');
  const [, pbxProject] = projectEntry;
  const targetConfigurationListId = requireString(
    target.buildConfigurationList,
    'native target configuration list',
  );
  const projectConfigurationListId = requireString(
    pbxProject.buildConfigurationList,
    'project configuration list',
  );
  const configurationSection = project.pbxXCBuildConfigurationSection();
  const configurationLists = project.pbxXCConfigurationList();
  const fileReferences = project.pbxFileReferenceSection();

  reconcileConfigurationList({
    configurationList: requireConfigurationList(
      configurationLists[targetConfigurationListId],
      'native target',
    ),
    configurationSection,
    fileReferences,
    generateUuid: project.generateUuid.bind(project),
    options,
    owner: {type: 'application'},
  });
  reconcileConfigurationList({
    configurationList: requireConfigurationList(
      configurationLists[projectConfigurationListId],
      'project',
    ),
    configurationSection,
    fileReferences,
    generateUuid: project.generateUuid.bind(project),
    options,
    owner: {type: 'project'},
  });

  reconcileExtensionTargets({
    configuredTargets: options.iosTargets,
    configurationLists,
    configurationSection,
    fileReferences,
    generateUuid: project.generateUuid.bind(project),
    nativeTargets,
    options,
    applicationTargetUuid: metadata.targetUuid,
  });

  return metadata;
}

export function getXcodeProjectMetadata(projectValue: unknown): XcodeProjectMetadata {
  return readXcodeProjectMetadata(requireXcodeProject(projectValue));
}

function readXcodeProjectMetadata(project: XcodeProjectLike): XcodeProjectMetadata {
  const [targetUuid, target] = requireApplicationTarget(
    readNativeTargetEntries(project.pbxNativeTargetSection()),
  );

  requireSingleEntry(project.pbxProjectSection(), 'PBX project');
  const targetName = unquote(requireString(target.name, 'native target name'));
  const productName = unquote(requireString(target.productName, 'native target product name'));
  return {targetUuid, targetName, productName};
}

type ReconcileExtensionTargetsArgs = Readonly<{
  configuredTargets: readonly NormalizedNativeVariantsIosTarget[];
  configurationLists: Record<string, unknown>;
  configurationSection: Record<string, unknown>;
  fileReferences: Record<string, unknown>;
  generateUuid: () => string;
  nativeTargets: readonly NativeTargetEntry[];
  options: NormalizedNativeVariantsOptions;
  applicationTargetUuid: string;
}>;

function reconcileExtensionTargets({
  configuredTargets,
  configurationLists,
  configurationSection,
  fileReferences,
  generateUuid,
  nativeTargets,
  options,
  applicationTargetUuid,
}: ReconcileExtensionTargetsArgs): void {
  const configuredNames = new Set(configuredTargets.map(({name}) => name));
  const targetByName = new Map(
    nativeTargets.map((entry) => [readTargetName(entry[1]), entry]),
  );

  for (const configuredTarget of configuredTargets) {
    const entry = targetByName.get(configuredTarget.name);
    if (entry === undefined) {
      throw new Error(
        `expo-native-variants could not find configured iOS extension target "${configuredTarget.name}". Ensure its target-generating plugin runs before expo-native-variants.`,
      );
    }
    const [, target] = entry;
    const productType = unquote(
      requireString(target.productType, `target "${configuredTarget.name}" product type`),
    );
    if (!SUPPORTED_EXTENSION_PRODUCT_TYPES.has(productType)) {
      throw new Error(
        `expo-native-variants supports app-extension targets in ios.targets; "${configuredTarget.name}" has product type "${productType}".`,
      );
    }
    const configurationListId = requireString(
      target.buildConfigurationList,
      `target "${configuredTarget.name}" configuration list`,
    );
    reconcileConfigurationList({
      configurationList: requireConfigurationList(
        configurationLists[configurationListId],
        `target "${configuredTarget.name}"`,
      ),
      configurationSection,
      fileReferences,
      generateUuid,
      options,
      owner: {
        bundleIdentifierSuffix: configuredTarget.bundleIdentifierSuffix,
        type: 'extension',
      },
    });
  }

  const unsupportedTargets = nativeTargets
    .filter(([uuid, target]) =>
      uuid !== applicationTargetUuid && !configuredNames.has(readTargetName(target)))
    .map(([, target]) => readTargetName(target));
  if (unsupportedTargets.length > 0) {
    throw new Error(
      `expo-native-variants found additional iOS targets that are not configured in ios.targets: ${unsupportedTargets.join(', ')}.`,
    );
  }
}

type ReconcileConfigurationListArgs = Readonly<{
  configurationList: ConfigurationList;
  configurationSection: Record<string, unknown>;
  fileReferences: Record<string, unknown>;
  generateUuid: () => string;
  options: NormalizedNativeVariantsOptions;
  owner: ConfigurationOwner;
}>;

function reconcileConfigurationList({
  configurationList,
  configurationSection,
  fileReferences,
  generateUuid,
  options,
  owner,
}: ReconcileConfigurationListArgs): void {
  const debugSource = getConfigurationByName({
    configurationList,
    configurationSection,
    name: 'Debug',
  });
  const releaseSource = getConfigurationByName({
    configurationList,
    configurationSection,
    name: 'Release',
  });
  const desiredNames = new Set(
    options.variants.flatMap((variant) => [
      variant.debugConfiguration,
      variant.releaseConfiguration,
    ]),
  );

  for (const reference of [...configurationList.buildConfigurations]) {
    const configuration = requireBuildConfiguration(
      configurationSection[reference.value],
      reference.comment,
    );
    const isManaged = configuration.buildSettings[MANAGED_BUILD_SETTING] === 'YES';

    if (isManaged && !desiredNames.has(unquote(configuration.name))) {
      removeBuildConfiguration({
        configurationList,
        configurationSection,
        uuid: reference.value,
      });
    }
  }

  for (const variant of options.variants) {
    reconcileVariantConfiguration({
      configurationList,
      configurationSection,
      fileReferences,
      generateUuid,
      source: debugSource,
      name: variant.debugConfiguration,
      variant,
      owner,
    });
    reconcileVariantConfiguration({
      configurationList,
      configurationSection,
      fileReferences,
      generateUuid,
      source: releaseSource,
      name: variant.releaseConfiguration,
      variant,
      owner,
    });
  }

  if (owner.type !== 'project') {
    applyVariantSettings(debugSource, options.canonicalVariant, owner);
    applyVariantSettings(releaseSource, options.canonicalVariant, owner);
  }
}

type ReconcileVariantConfigurationArgs = Readonly<{
  configurationList: ConfigurationList;
  configurationSection: Record<string, unknown>;
  fileReferences: Record<string, unknown>;
  generateUuid: () => string;
  source: BuildConfiguration;
  name: string;
  variant: NormalizedNativeVariant;
  owner: ConfigurationOwner;
}>;

function reconcileVariantConfiguration({
  configurationList,
  configurationSection,
  fileReferences,
  generateUuid,
  source,
  name,
  variant,
  owner,
}: ReconcileVariantConfigurationArgs): void {
  const existing = findConfigurationByName({
    configurationList,
    configurationSection,
    name,
  });

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
    return;
  }

  const uuid = generateUuid();
  const configuration = cloneConfiguration({source, fileReferences});
  configuration.name = name;
  setManagedSettings(configuration, variant, owner);
  configurationSection[uuid] = configuration;
  configurationSection[`${uuid}_comment`] = name;
  configurationList.buildConfigurations.push({value: uuid, comment: name});
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
  } else {
    delete configuration.buildSettings[DISPLAY_NAME_BUILD_SETTING];
    delete configuration.buildSettings[URL_SCHEME_BUILD_SETTING];
  }
}

function getConfigurationByName({
  configurationList,
  configurationSection,
  name,
}: Readonly<{
  configurationList: ConfigurationList;
  configurationSection: Record<string, unknown>;
  name: string;
}>): BuildConfiguration {
  const configuration = findConfigurationByName({
    configurationList,
    configurationSection,
    name,
  });
  if (configuration === undefined) {
    throw new Error(
      `expo-native-variants requires the standard iOS build configuration "${name}".`,
    );
  }
  return configuration;
}

function findConfigurationByName({
  configurationList,
  configurationSection,
  name,
}: Readonly<{
  configurationList: ConfigurationList;
  configurationSection: Record<string, unknown>;
  name: string;
}>): BuildConfiguration | undefined {
  for (const reference of configurationList.buildConfigurations) {
    const configuration = requireBuildConfiguration(
      configurationSection[reference.value],
      reference.comment,
    );
    if (unquote(configuration.name) === name) {
      return configuration;
    }
  }
  return undefined;
}

function removeBuildConfiguration({
  configurationList,
  configurationSection,
  uuid,
}: Readonly<{
  configurationList: ConfigurationList;
  configurationSection: Record<string, unknown>;
  uuid: string;
}>): void {
  configurationList.buildConfigurations = configurationList.buildConfigurations.filter(
    (reference) => reference.value !== uuid,
  );
  delete configurationSection[uuid];
  delete configurationSection[`${uuid}_comment`];
}

function requireXcodeProject(value: unknown): XcodeProjectLike {
  if (!isRecord(value)) {
    throw new Error('expo-native-variants received an invalid Xcode project.');
  }

  const methodNames = [
    'generateUuid',
    'pbxFileReferenceSection',
    'pbxNativeTargetSection',
    'pbxProjectSection',
    'pbxXCBuildConfigurationSection',
    'pbxXCConfigurationList',
  ] as const;
  if (!methodNames.every((name) => typeof value[name] === 'function')) {
    throw new Error('expo-native-variants received an invalid Xcode project.');
  }

  return value as unknown as XcodeProjectLike;
}

function readNativeTargetEntries(
  section: Record<string, unknown>,
): readonly NativeTargetEntry[] {
  return Object.entries(section).filter(
    (entry): entry is [string, Record<string, unknown>] =>
      !entry[0].endsWith('_comment') && isRecord(entry[1]),
  );
}

function requireApplicationTarget(
  nativeTargets: readonly NativeTargetEntry[],
): NativeTargetEntry {
  const applicationTargets = nativeTargets.filter(([, target]) => {
    const productType = target.productType;
    return typeof productType === 'string' && unquote(productType) === APPLICATION_PRODUCT_TYPE;
  });
  if (applicationTargets.length !== 1) {
    throw new Error(
      `expo-native-variants supports exactly one iOS application target; found ${applicationTargets.length}.`,
    );
  }

  const applicationTarget = applicationTargets[0];
  if (applicationTarget === undefined) {
    throw new Error('expo-native-variants could not find an iOS application target.');
  }
  return applicationTarget;
}

function readTargetName(target: Record<string, unknown>): string {
  return unquote(requireString(target.name, 'native target name'));
}

function requireSingleEntry(
  section: Record<string, unknown>,
  label: string,
): readonly [string, Record<string, unknown>] {
  const entries = Object.entries(section).filter(
    ([key, value]) => !key.endsWith('_comment') && isRecord(value),
  );
  if (entries.length !== 1) {
    throw new Error(
      `expo-native-variants supports exactly one iOS ${label}; found ${entries.length}.`,
    );
  }

  const entry = entries[0];
  if (entry === undefined) {
    throw new Error(`expo-native-variants could not find an iOS ${label}.`);
  }
  const [uuid, object] = entry;
  if (!isRecord(object)) {
    throw new Error(`expo-native-variants could not read the iOS ${label}.`);
  }
  return [uuid, object];
}

function requireConfigurationList(value: unknown, label: string): ConfigurationList {
  if (!isRecord(value) || !Array.isArray(value.buildConfigurations)) {
    throw new Error(
      `expo-native-variants could not read the ${label} iOS configuration list.`,
    );
  }

  const references = value.buildConfigurations.map((reference) => {
    if (
      !isRecord(reference) ||
      typeof reference.value !== 'string' ||
      typeof reference.comment !== 'string'
    ) {
      throw new Error(
        `expo-native-variants found an invalid entry in the ${label} iOS configuration list.`,
      );
    }
    return {value: reference.value, comment: reference.comment};
  });

  value.buildConfigurations = references;
  return value as ConfigurationList;
}

function requireBuildConfiguration(value: unknown, label: string): BuildConfiguration {
  if (
    !isRecord(value) ||
    value.isa !== 'XCBuildConfiguration' ||
    !isRecord(value.buildSettings) ||
    typeof value.name !== 'string'
  ) {
    throw new Error(
      `expo-native-variants could not read iOS build configuration "${label}".`,
    );
  }
  return value as BuildConfiguration;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`expo-native-variants could not read the iOS ${label}.`);
  }
  return value;
}

function quote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function unquote(value: string): string {
  return value.match(/^"(.*)"$/)?.[1] ?? value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
