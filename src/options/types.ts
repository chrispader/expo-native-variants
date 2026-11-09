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
  /**
   * Build settings for the variant's application and extension configurations, such as
   * `API_URL`. Info.plist values can read them as `$(API_URL)`.
   */
  buildSettings?: Readonly<Record<string, NativeVariantIosBuildSettingValue>>;
  /** Environment variables the Xcode scheme passes when running, testing, or profiling. */
  environmentVariables?: Readonly<Record<string, string>>;
  /** Launch arguments the Xcode scheme passes when running, testing, or profiling. */
  launchArguments?: readonly string[];
}>;

export type NativeVariantIosBuildSettingValue = string | readonly string[];

/** Strings become `String`, booleans `boolean`, integers `int`, and other numbers `double`. */
export type NativeVariantBuildConfigFieldValue = string | number | boolean;

export type NativeVariantAndroidOptions = Readonly<{
  applicationId?: string;
  flavor?: string;
  icon?: string;
  adaptiveIcon?: NativeVariantAdaptiveIcon;
  /** Fields on the generated `BuildConfig` class, such as `BuildConfig.API_URL`. */
  buildConfigFields?: Readonly<Record<string, NativeVariantBuildConfigFieldValue>>;
  /** String resources, readable as `@string/name` or `getString(R.string.name)`. */
  resValues?: Readonly<Record<string, string>>;
  /** Values that AndroidManifest.xml can read as `${name}`. */
  manifestPlaceholders?: Readonly<Record<string, string>>;
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
  /**
   * Home-screen name. A map gives per-language names keyed by BCP 47 tag and must
   * include a `default` key, used when no language matches.
   */
  displayName?: string | Readonly<Record<string, string>>;
  urlScheme?: string;
  /** Native Expo Updates channel. Omit to inherit the shared or EAS configuration. */
  updateChannel?: string;
  runMode?: NativeVariantRunMode;
  ios?: NativeVariantIosOptions;
  android?: NativeVariantAndroidOptions;
}>;

export type NativeVariantMap = Readonly<Record<string, NativeVariantOptions>>;

export type NativeVariantsOptions = Readonly<{
  /**
   * App identity used when evaluating Expo config, for example during EAS signing
   * setup. Defaults to NATIVE_VARIANT, then development if declared, then the
   * first declared variant. This does not filter the generated native builds.
   * Native compilation uses its actual Xcode configuration or Android flavor for
   * embedded metadata.
   */
  variant?: string | undefined;
  ios?: NativeVariantsIosOptions;
  variants: NativeVariantMap;
}>;

export type NormalizedNativeVariant = Readonly<{
  key: string;
  /** The default name, used when no localized name matches. */
  displayName: string;
  /** Names by canonical BCP 47 tag, excluding the default. Absent when there are none. */
  localizedDisplayNames?: Readonly<Record<string, string>>;
  iosBundleIdentifier: string;
  androidApplicationId: string;
  urlScheme: string;
  updateChannel?: string;
  runMode: NativeVariantRunMode;
  iosScheme: string;
  debugConfiguration: string;
  releaseConfiguration: string;
  androidFlavor: string;
  icon?: string;
  iosIcon?: NativeVariantIosIcon;
  androidIcon?: string;
  androidAdaptiveIcon?: NativeVariantAdaptiveIcon;
  iosBuildSettings?: Readonly<Record<string, NativeVariantIosBuildSettingValue>>;
  iosEnvironmentVariables?: Readonly<Record<string, string>>;
  iosLaunchArguments?: readonly string[];
  androidBuildConfigFields?: Readonly<Record<string, NativeVariantBuildConfigFieldValue>>;
  androidResValues?: Readonly<Record<string, string>>;
  androidManifestPlaceholders?: Readonly<Record<string, string>>;
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
