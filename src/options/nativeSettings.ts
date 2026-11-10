import type {
  NativeVariantBuildConfigFieldValue,
  NativeVariantIosBuildSettingValue,
  NormalizedNativeVariant,
} from './types';

type IosNativeSettings = Pick<
  NormalizedNativeVariant,
  'iosBuildSettings' | 'iosEnvironmentVariables' | 'iosLaunchArguments'
>;
type AndroidNativeSettings = Pick<
  NormalizedNativeVariant,
  'androidBuildConfigFields' | 'androidResValues' | 'androidManifestPlaceholders'
>;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** The plugin owns these Xcode settings for every variant configuration. */
const MANAGED_BUILD_SETTING = /^(?:PRODUCT_BUNDLE_IDENTIFIER|EXPO_NATIVE_VARIANTS?_.*)$/;
const MANAGED_RES_VALUES = new Set(['app_name']);
const MANAGED_MANIFEST_PLACEHOLDERS = new Set(['nativeVariantScheme']);

export function readIosNativeSettings(
  record: Readonly<Record<string, unknown>>,
  label: string,
): IosNativeSettings {
  const iosBuildSettings = readMap(record.buildSettings, `${label}.buildSettings`, {
    managed: (name) => MANAGED_BUILD_SETTING.test(name),
    readValue: readBuildSettingValue,
  });
  const iosEnvironmentVariables = readMap(
    record.environmentVariables,
    `${label}.environmentVariables`,
    {readValue: readText},
  );
  const iosLaunchArguments = readLaunchArguments(
    record.launchArguments,
    `${label}.launchArguments`,
  );
  return {
    ...(iosBuildSettings === undefined ? {} : {iosBuildSettings}),
    ...(iosEnvironmentVariables === undefined ? {} : {iosEnvironmentVariables}),
    ...(iosLaunchArguments === undefined ? {} : {iosLaunchArguments}),
  };
}

export function readAndroidNativeSettings(
  record: Readonly<Record<string, unknown>>,
  label: string,
): AndroidNativeSettings {
  const androidBuildConfigFields = readMap(
    record.buildConfigFields,
    `${label}.buildConfigFields`,
    {readValue: readBuildConfigFieldValue},
  );
  const androidResValues = readMap(record.resValues, `${label}.resValues`, {
    managed: (name) => MANAGED_RES_VALUES.has(name),
    readValue: readText,
  });
  const androidManifestPlaceholders = readMap(
    record.manifestPlaceholders,
    `${label}.manifestPlaceholders`,
    {managed: (name) => MANAGED_MANIFEST_PLACEHOLDERS.has(name), readValue: readText},
  );
  return {
    ...(androidBuildConfigFields === undefined ? {} : {androidBuildConfigFields}),
    ...(androidResValues === undefined ? {} : {androidResValues}),
    ...(androidManifestPlaceholders === undefined ? {} : {androidManifestPlaceholders}),
  };
}

function readMap<T>(
  value: unknown,
  label: string,
  {
    managed = () => false,
    readValue,
  }: Readonly<{
    managed?: (name: string) => boolean;
    readValue: (value: unknown, label: string) => T;
  }>,
): Readonly<Record<string, T>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const entries = Object.entries(value).map(([name, entry]) => {
    if (!IDENTIFIER.test(name)) {
      throw new Error(
        `${label} name "${name}" must start with a letter or underscore and contain only letters, numbers, or underscores.`,
      );
    }
    if (managed(name)) {
      throw new Error(`${label} must not set "${name}" because expo-native-variants manages it.`);
    }
    return [name, readValue(entry, `${label}.${name}`)] as const;
  });
  return entries.length === 0 ? undefined : Object.freeze(Object.fromEntries(entries));
}

function readLaunchArguments(value: unknown, label: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings.`);
  }
  const values = value.map((entry: unknown, index) => readText(entry, `${label}[${index}]`));
  return values.length === 0 ? undefined : Object.freeze(values);
}

function readBuildSettingValue(value: unknown, label: string): NativeVariantIosBuildSettingValue {
  if (!Array.isArray(value)) {
    return readText(value, label);
  }
  return Object.freeze(value.map((entry: unknown, index) => readText(entry, `${label}[${index}]`)));
}

function readBuildConfigFieldValue(
  value: unknown,
  label: string,
): NativeVariantBuildConfigFieldValue {
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
    return value;
  }
  if (typeof value === 'string') {
    return readText(value, label);
  }
  throw new Error(`${label} must be a string, a finite number, or a boolean.`);
}

function readText(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }
  if (/\p{Cc}/u.test(value)) {
    throw new Error(`${label} must not contain control characters.`);
  }
  return value;
}
