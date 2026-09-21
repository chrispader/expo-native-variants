export type NativeVariantRunMode = 'debug' | 'release';

export type NativeVariantIosIcon =
  | string
  | Readonly<{
      light?: string;
      dark?: string;
      tinted?: string;
    }>;

export type NativeVariantAdaptiveIcon = Readonly<{
  foregroundImage?: string;
  backgroundImage?: string;
  backgroundColor?: string;
  monochromeImage?: string;
}>;

export type NativeVariantIosOptions = Readonly<{
  bundleIdentifier?: string;
  xcodeScheme?: string;
  debugConfiguration?: string;
  releaseConfiguration?: string;
  icon?: NativeVariantIosIcon;
}>;

export type NativeVariantAndroidOptions = Readonly<{
  applicationId?: string;
  flavor?: string;
  icon?: string;
  adaptiveIcon?: NativeVariantAdaptiveIcon;
}>;

export type NativeVariantsIosTargetOptions = Readonly<{
  bundleIdentifierSuffix: string;
}>;

export type NativeVariantsIosOptions = Readonly<{
  targets: Readonly<Record<string, NativeVariantsIosTargetOptions>>;
}>;

export type NativeVariantOptions = Readonly<{
  applicationId: string;
  icon?: string;
  displayName?: string;
  urlScheme?: string;
  runMode?: NativeVariantRunMode;
  ios?: NativeVariantIosOptions;
  android?: NativeVariantAndroidOptions;
}>;

export type NativeVariantMap = Readonly<Record<string, NativeVariantOptions>>;

export type NativeVariantsOptions = Readonly<{
  /**
   * App identity used when evaluating Expo config, for example during EAS signing
   * setup. Defaults to NATIVE_VARIANT, then the first declared variant. This does
   * not filter the generated native builds. Native compilation uses its actual
   * Xcode configuration or Android flavor for embedded metadata.
   */
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
  icon?: string;
  iosIcon?: NativeVariantIosIcon;
  androidIcon?: string;
  androidAdaptiveIcon?: NativeVariantAdaptiveIcon;
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
