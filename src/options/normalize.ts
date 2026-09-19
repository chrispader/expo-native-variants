import type {
  NativeVariantRunMode,
  NormalizedNativeVariant,
  NormalizedNativeVariantsOptions,
  NormalizeNativeVariantsArgs,
} from './types';

const ROOT_KEYS = new Set(['canonicalVariant', 'defaultVariant', 'variants']);
const VARIANT_KEYS = new Set([
  'android',
  'applicationId',
  'displayName',
  'ios',
  'runMode',
  'urlScheme',
]);
const IOS_KEYS = new Set(['bundleIdentifier', 'xcodeScheme']);
const ANDROID_KEYS = new Set(['applicationId']);
const RESERVED_VARIANT_NAMES = new Set([
  'androidtest',
  'aux',
  'con',
  'debug',
  'main',
  'nul',
  'prn',
  'release',
  'test',
  'unittest',
]);
const WINDOWS_DEVICE_NAME = /^(?:com|lpt)[0-9]$/i;
const VARIANT_KEY = /^[A-Za-z][A-Za-z0-9_-]*$/;
const SAFE_FILE_LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/;
const IOS_IDENTIFIER_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const ANDROID_IDENTIFIER_SEGMENT = /^[A-Za-z][A-Za-z0-9_]*$/;

export function normalizeNativeVariants({
  configName,
  options,
  canonicalVariant: canonicalOverride,
}: NormalizeNativeVariantsArgs): NormalizedNativeVariantsOptions {
  validateFileLabel(configName, 'Expo config name');
  const optionsRecord = requireRecord(options, 'Plugin options');
  assertKnownKeys(optionsRecord, ROOT_KEYS, 'Plugin options');

  const defaultVariant = requireNonemptyString(
    optionsRecord.defaultVariant,
    'defaultVariant',
  );
  const configuredCanonicalVariant = optionalNonemptyString(
    optionsRecord.canonicalVariant,
    'canonicalVariant',
  );
  const canonicalVariant = canonicalOverride ?? configuredCanonicalVariant ?? defaultVariant;
  validateVariantKey(defaultVariant, 'defaultVariant');
  validateVariantKey(canonicalVariant, 'canonicalVariant');

  const variantsRecord = requireRecord(optionsRecord.variants, 'variants');
  const variantEntries = Object.entries(variantsRecord);
  if (variantEntries.length === 0) {
    throw new Error('variants must contain at least one variant.');
  }

  const normalizedVariants = variantEntries.map(([key, variant]) =>
    normalizeVariant({configName, key, variant}),
  );
  validateGeneratedNames(normalizedVariants);
  validateUniqueValues(normalizedVariants);

  if (!Object.hasOwn(variantsRecord, defaultVariant)) {
    throw new Error(`defaultVariant references unknown variant "${defaultVariant}".`);
  }

  const canonical = normalizedVariants.find(({key}) => key === canonicalVariant);
  if (canonical === undefined) {
    throw new Error(`canonicalVariant references unknown variant "${canonicalVariant}".`);
  }

  const variants = Object.freeze(normalizedVariants);
  return Object.freeze({canonicalVariant: canonical, variants});
}

function normalizeVariant({
  configName,
  key,
  variant,
}: Readonly<{
  configName: string;
  key: string;
  variant: unknown;
}>): NormalizedNativeVariant {
  validateVariantKey(key, `Variant key "${key}"`);
  const variantRecord = requireRecord(variant, `Variant "${key}"`);
  assertKnownKeys(variantRecord, VARIANT_KEYS, `Variant "${key}"`);

  const displayName = requireNonemptyString(
    variantRecord.displayName,
    `Variant "${key}" displayName`,
  );
  validateText(displayName, `Variant "${key}" displayName`);
  const applicationId = requireNonemptyString(
    variantRecord.applicationId,
    `Variant "${key}" applicationId`,
  );
  const urlScheme = requireNonemptyString(
    variantRecord.urlScheme,
    `Variant "${key}" urlScheme`,
  );
  validateUrlScheme(urlScheme, `Variant "${key}" urlScheme`);
  const runMode = readRunMode(variantRecord.runMode, key);
  const ios = readIosOptions(variantRecord.ios, key);
  const android = readAndroidOptions(variantRecord.android, key);
  const iosBundleIdentifier = ios.bundleIdentifier ?? applicationId;
  const androidApplicationId = android.applicationId ?? applicationId;
  validateIosIdentifier(iosBundleIdentifier, `Variant "${key}" iOS bundle identifier`);
  validateAndroidIdentifier(
    androidApplicationId,
    `Variant "${key}" Android application ID`,
  );

  const configLabel = toPascalConfigLabel(key);
  const generatedIosScheme = `${configName}-${configLabel}`;
  const iosScheme = ios.xcodeScheme ?? generatedIosScheme;
  validateFileLabel(iosScheme, `Variant "${key}" iOS scheme`);

  return Object.freeze({
    key,
    displayName,
    iosBundleIdentifier,
    androidApplicationId,
    urlScheme,
    runMode,
    iosScheme,
    debugConfiguration: `Debug-${configLabel}`,
    releaseConfiguration: `Release-${configLabel}`,
    androidFlavor: lowerFirst(configLabel),
  });
}

function readIosOptions(
  value: unknown,
  variantKey: string,
): Readonly<{bundleIdentifier?: string; xcodeScheme?: string}> {
  if (value === undefined) {
    return {};
  }

  const record = requireRecord(value, `Variant "${variantKey}" ios`);
  assertKnownKeys(record, IOS_KEYS, `Variant "${variantKey}" ios`);
  const bundleIdentifier = optionalNonemptyString(
    record.bundleIdentifier,
    `Variant "${variantKey}" ios.bundleIdentifier`,
  );
  const xcodeScheme = optionalNonemptyString(
    record.xcodeScheme,
    `Variant "${variantKey}" ios.xcodeScheme`,
  );
  return compactOptionalStrings({bundleIdentifier, xcodeScheme});
}

function readAndroidOptions(
  value: unknown,
  variantKey: string,
): Readonly<{applicationId?: string}> {
  if (value === undefined) {
    return {};
  }

  const record = requireRecord(value, `Variant "${variantKey}" android`);
  assertKnownKeys(record, ANDROID_KEYS, `Variant "${variantKey}" android`);
  const applicationId = optionalNonemptyString(
    record.applicationId,
    `Variant "${variantKey}" android.applicationId`,
  );
  return applicationId === undefined ? {} : {applicationId};
}

function compactOptionalStrings({
  bundleIdentifier,
  xcodeScheme,
}: Readonly<{
  bundleIdentifier: string | undefined;
  xcodeScheme: string | undefined;
}>): Readonly<{bundleIdentifier?: string; xcodeScheme?: string}> {
  if (bundleIdentifier === undefined) {
    if (xcodeScheme === undefined) {
      return {};
    }
    return {xcodeScheme};
  }
  if (xcodeScheme === undefined) {
    return {bundleIdentifier};
  }
  return {bundleIdentifier, xcodeScheme};
}

function readRunMode(value: unknown, variantKey: string): NativeVariantRunMode {
  if (value === undefined) {
    return 'debug';
  }
  if (value === 'debug' || value === 'release') {
    return value;
  }
  throw new Error(`Variant "${variantKey}" runMode must be "debug" or "release".`);
}

function validateGeneratedNames(variants: readonly NormalizedNativeVariant[]): void {
  for (const variant of variants) {
    const generatedName = variant.androidFlavor.toLowerCase();
    if (
      RESERVED_VARIANT_NAMES.has(generatedName) ||
      WINDOWS_DEVICE_NAME.test(generatedName)
    ) {
      throw new Error(
        `Variant key "${variant.key}" produces reserved name "${variant.androidFlavor}".`,
      );
    }
  }
  assertUnique(variants, ({key}) => key.toLowerCase(), 'variant key');
  assertUnique(variants, ({debugConfiguration}) => debugConfiguration.toLowerCase(), 'iOS configuration');
  assertUnique(variants, ({iosScheme}) => iosScheme.toLowerCase(), 'iOS scheme');
  assertUnique(variants, ({androidFlavor}) => androidFlavor.toLowerCase(), 'Android flavor');
}

function validateUniqueValues(variants: readonly NormalizedNativeVariant[]): void {
  assertUnique(
    variants,
    ({iosBundleIdentifier}) => iosBundleIdentifier.toLowerCase(),
    'iOS bundle identifier',
  );
  assertUnique(
    variants,
    ({androidApplicationId}) => androidApplicationId.toLowerCase(),
    'Android application ID',
  );
  assertUnique(variants, ({urlScheme}) => urlScheme.toLowerCase(), 'URL scheme');
  assertNoCrossVariantRouteCollision({
    identifierLabel: 'iOS bundle identifier',
    selectIdentifier: ({iosBundleIdentifier}) => iosBundleIdentifier,
    variants,
  });
  assertNoCrossVariantRouteCollision({
    identifierLabel: 'Android application ID',
    selectIdentifier: ({androidApplicationId}) => androidApplicationId,
    variants,
  });
}

function assertNoCrossVariantRouteCollision({
  identifierLabel,
  selectIdentifier,
  variants,
}: Readonly<{
  identifierLabel: string;
  selectIdentifier: (variant: NormalizedNativeVariant) => string;
  variants: readonly NormalizedNativeVariant[];
}>): void {
  const identifierOwnerByValue = new Map(
    variants.map((variant) => [
      selectIdentifier(variant).toLowerCase(),
      variant.key,
    ]),
  );

  for (const variant of variants) {
    const identifierOwner = identifierOwnerByValue.get(variant.urlScheme.toLowerCase());
    if (identifierOwner !== undefined && identifierOwner !== variant.key) {
      throw new Error(
        `Variant "${variant.key}" URL scheme "${variant.urlScheme}" matches variant "${identifierOwner}" ${identifierLabel}.`,
      );
    }
  }
}

function assertUnique(
  variants: readonly NormalizedNativeVariant[],
  select: (variant: NormalizedNativeVariant) => string,
  label: string,
): void {
  const ownerByValue = new Map<string, string>();
  for (const variant of variants) {
    const value = select(variant);
    const owner = ownerByValue.get(value);
    if (owner !== undefined) {
      throw new Error(
        `Variants "${owner}" and "${variant.key}" produce the same ${label} "${value}".`,
      );
    }
    ownerByValue.set(value, variant.key);
  }
}

function validateVariantKey(value: string, label: string): void {
  if (!VARIANT_KEY.test(value)) {
    throw new Error(
      `${label} must start with a letter and contain only letters, numbers, hyphens, or underscores.`,
    );
  }
  const normalized = value.toLowerCase();
  if (RESERVED_VARIANT_NAMES.has(normalized) || WINDOWS_DEVICE_NAME.test(normalized)) {
    throw new Error(`${label} uses reserved name "${value}".`);
  }
}

function validateFileLabel(value: string, label: string): void {
  if (value !== value.trim() || !SAFE_FILE_LABEL.test(value) || value === '.' || value === '..') {
    throw new Error(
      `${label} must be a path-safe name containing only letters, numbers, spaces, periods, hyphens, or underscores.`,
    );
  }
}

function validateText(value: string, label: string): void {
  if (/\p{Cc}/u.test(value)) {
    throw new Error(`${label} must not contain control characters.`);
  }
}

function validateUrlScheme(value: string, label: string): void {
  if (!URL_SCHEME.test(value)) {
    throw new Error(
      `${label} must start with a letter and contain only letters, numbers, plus signs, periods, or hyphens.`,
    );
  }
}

function validateIosIdentifier(value: string, label: string): void {
  const segments = value.split('.');
  if (segments.length < 2 || segments.some((segment) => !IOS_IDENTIFIER_SEGMENT.test(segment))) {
    throw new Error(`${label} must be a valid reverse-DNS bundle identifier.`);
  }
}

function validateAndroidIdentifier(value: string, label: string): void {
  const segments = value.split('.');
  if (segments.length < 2 || segments.some((segment) => !ANDROID_IDENTIFIER_SEGMENT.test(segment))) {
    throw new Error(`${label} must be a valid reverse-DNS application ID.`);
  }
}

function toPascalConfigLabel(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split(/[-_]+/)
    .filter((word) => word.length > 0);
  return words.map(capitalize).join('');
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1).toLowerCase()}`;
}

function lowerFirst(value: string): string {
  return `${value[0]?.toLowerCase() ?? ''}${value.slice(1)}`;
}

function requireNonemptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}

function optionalNonemptyString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireNonemptyString(value, label);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertKnownKeys(
  record: Readonly<Record<string, unknown>>,
  knownKeys: ReadonlySet<string>,
  label: string,
): void {
  const unknownKey = Object.keys(record).find((key) => !knownKeys.has(key));
  if (unknownKey !== undefined) {
    throw new Error(`${label} contains unknown key "${unknownKey}".`);
  }
}
