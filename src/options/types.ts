export type NativeVariantRunMode = 'debug' | 'release';

export type NativeVariantIosOptions = Readonly<{
  bundleIdentifier?: string;
  xcodeScheme?: string;
}>;

export type NativeVariantAndroidOptions = Readonly<{
  applicationId?: string;
}>;

export type NativeVariantOptions = Readonly<{
  displayName: string;
  applicationId: string;
  urlScheme: string;
  runMode?: NativeVariantRunMode;
  ios?: NativeVariantIosOptions;
  android?: NativeVariantAndroidOptions;
}>;

export type NativeVariantMap = Readonly<Record<string, NativeVariantOptions>>;

export type NativeVariantsOptions = Readonly<{
  defaultVariant: string;
  canonicalVariant?: string;
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

export type NormalizedNativeVariantsOptions = Readonly<{
  variants: readonly NormalizedNativeVariant[];
  canonicalVariant: NormalizedNativeVariant;
}>;

export type NormalizeNativeVariantsArgs = Readonly<{
  configName: string;
  options: unknown;
  canonicalVariant?: string;
}>;
