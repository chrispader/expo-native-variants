export type NativeVariantRunMode = 'debug' | 'release';

export type NativeVariantIosOptions = Readonly<{
  bundleIdentifier?: string;
  xcodeScheme?: string;
}>;

export type NativeVariantAndroidOptions = Readonly<{
  applicationId?: string;
}>;

export type NativeVariantsIosTargetOptions = Readonly<{
  bundleIdentifierSuffix: string;
}>;

export type NativeVariantsIosOptions = Readonly<{
  targets: Readonly<Record<string, NativeVariantsIosTargetOptions>>;
}>;

export type NativeVariantOptions = Readonly<{
  applicationId: string;
  displayName?: string;
  urlScheme?: string;
  runMode?: NativeVariantRunMode;
  ios?: NativeVariantIosOptions;
  android?: NativeVariantAndroidOptions;
}>;

export type NativeVariantMap = Readonly<Record<string, NativeVariantOptions>>;

export type NativeVariantsOptions = Readonly<{
  variant?: string | undefined;
  ios?: NativeVariantsIosOptions;
  variants: NativeVariantMap;
}>;

export type NormalizedNativeVariant = Readonly<{
  key: string;
  displayName: string;
  iosBundleIdentifier: string;
  androidApplicationId: string;
  urlScheme: string;
  runMode: NativeVariantRunMode;
  iosScheme: string;
  debugConfiguration: string;
  releaseConfiguration: string;
  androidFlavor: string;
}>;

export type NormalizedNativeVariantsIosTarget = Readonly<{
  name: string;
  bundleIdentifierSuffix: string;
}>;

export type NormalizedNativeVariantsOptions = Readonly<{
  variants: readonly NormalizedNativeVariant[];
  selectedVariant: NormalizedNativeVariant;
  iosTargets: readonly NormalizedNativeVariantsIosTarget[];
}>;

export type NormalizeNativeVariantsArgs = Readonly<{
  configName: string;
  options: unknown;
}>;
