import type {
  NormalizedNativeVariant,
  NormalizedNativeVariantsOptions,
} from '../options';
import {
  DISPLAY_NAME_BUILD_SETTING,
  URL_SCHEME_BUILD_SETTING,
} from './infoPlist';

const MANAGED_BUILD_SETTING = 'EXPO_NATIVE_VARIANTS_MANAGED';
const VARIANT_KEY_BUILD_SETTING = 'EXPO_NATIVE_VARIANT_KEY';

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

export function updateXcodeProject(
  projectValue: unknown,
  options: NormalizedNativeVariantsOptions,
): XcodeProjectMetadata {
  const project = requireXcodeProject(projectValue);
  const metadata = readXcodeProjectMetadata(project);
  const {targetUuid} = metadata;
  const nativeTargetEntry = requireSingleEntry(
    project.pbxNativeTargetSection(),
    'native target',
  );
  const [, target] = nativeTargetEntry;
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
    kind: 'target',
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
    kind: 'project',
  });

  return {...metadata, targetUuid};
}

export function getXcodeProjectMetadata(projectValue: unknown): XcodeProjectMetadata {
  return readXcodeProjectMetadata(requireXcodeProject(projectValue));
}

function readXcodeProjectMetadata(project: XcodeProjectLike): XcodeProjectMetadata {
  const nativeTargetEntry = requireSingleEntry(
    project.pbxNativeTargetSection(),
    'native target',
  );
  const [targetUuid, target] = nativeTargetEntry;
  const productType = requireString(target.productType, 'native target product type');
  if (unquote(productType) !== 'com.apple.product-type.application') {
    throw new Error(
      'expo-native-variants supports one iOS application target and found a different target type.',
    );
  }

  requireSingleEntry(project.pbxProjectSection(), 'PBX project');
  const targetName = unquote(requireString(target.name, 'native target name'));
  const productName = unquote(requireString(target.productName, 'native target product name'));
  return {targetUuid, targetName, productName};
}

type ReconcileConfigurationListArgs = Readonly<{
  configurationList: ConfigurationList;
  configurationSection: Record<string, unknown>;
  fileReferences: Record<string, unknown>;
  generateUuid: () => string;
  options: NormalizedNativeVariantsOptions;
  kind: 'project' | 'target';
}>;

function reconcileConfigurationList({
  configurationList,
  configurationSection,
  fileReferences,
  generateUuid,
  options,
  kind,
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
      kind,
    });
    reconcileVariantConfiguration({
      configurationList,
      configurationSection,
      fileReferences,
      generateUuid,
      source: releaseSource,
      name: variant.releaseConfiguration,
      variant,
      kind,
    });
  }

  if (kind === 'target') {
    applyVariantSettings(debugSource, options.canonicalVariant);
    applyVariantSettings(releaseSource, options.canonicalVariant);
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
  kind: 'project' | 'target';
}>;

function reconcileVariantConfiguration({
  configurationList,
  configurationSection,
  fileReferences,
  generateUuid,
  source,
  name,
  variant,
  kind,
}: ReconcileVariantConfigurationArgs): void {
  const existing = findConfigurationByName({
    configurationList,
    configurationSection,
    name,
  });

  if (existing !== undefined) {
    if (existing.buildSettings[MANAGED_BUILD_SETTING] !== 'YES') {
      throw new Error(
        `expo-native-variants cannot create iOS build configuration "${name}" because it already exists and is not managed by the plugin.`,
      );
    }
    refreshConfiguration({configuration: existing, source, fileReferences});
    existing.name = name;
    setManagedSettings(existing, variant, kind);
    return;
  }

  const uuid = generateUuid();
  const configuration = cloneConfiguration({source, fileReferences});
  configuration.name = name;
  setManagedSettings(configuration, variant, kind);
  configurationSection[uuid] = configuration;
  configurationSection[`${uuid}_comment`] = name;
  configurationList.buildConfigurations.push({value: uuid, comment: name});
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
  kind: 'project' | 'target',
): void {
  configuration.buildSettings[MANAGED_BUILD_SETTING] = 'YES';
  configuration.buildSettings[VARIANT_KEY_BUILD_SETTING] = quote(variant.key);
  if (kind === 'target') {
    applyVariantSettings(configuration, variant);
  }
}

function applyVariantSettings(
  configuration: BuildConfiguration,
  variant: NormalizedNativeVariant,
): void {
  configuration.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = quote(
    variant.iosBundleIdentifier,
  );
  configuration.buildSettings[DISPLAY_NAME_BUILD_SETTING] = quote(variant.displayName);
  configuration.buildSettings[URL_SCHEME_BUILD_SETTING] = quote(variant.urlScheme);
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
