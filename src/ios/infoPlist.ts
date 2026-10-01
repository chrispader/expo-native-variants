import type {NormalizedNativeVariantsOptions} from '../options';
import {collectLocalizedLanguages} from './localizedNames';

export const DISPLAY_NAME_BUILD_SETTING = 'EXPO_NATIVE_VARIANT_DISPLAY_NAME';
export const URL_SCHEME_BUILD_SETTING = 'EXPO_NATIVE_VARIANT_URL_SCHEME';

const OWNED_URL_TYPE_NAME = 'expo-native-variants';

type PlistValue = string | boolean | number | null | PlistValue[] | PlistDictionary;
export type PlistDictionary = {[key: string]: PlistValue | undefined};

type UpdateInfoPlistArgs = Readonly<{
  infoPlist: PlistDictionary;
  options: NormalizedNativeVariantsOptions;
  expoSchemes: readonly string[];
  /** Languages the app already ships, for example from Expo `locales`. */
  existingLocalizations?: readonly string[];
}>;

export function updateInfoPlist({
  infoPlist,
  options,
  expoSchemes,
  existingLocalizations = [],
}: UpdateInfoPlistArgs): PlistDictionary {
  const replacedSchemes = new Set([
    ...options.variants.map((variant) => variant.urlScheme),
    ...expoSchemes,
  ]);
  const existingUrlTypes = readUrlTypes(infoPlist.CFBundleURLTypes);
  const preservedUrlTypes = existingUrlTypes
    .filter((urlType) => urlType.dictionary.CFBundleURLName !== OWNED_URL_TYPE_NAME)
    .flatMap((urlType): readonly PlistDictionary[] => {
      if (urlType.schemes === undefined) {
        return [urlType.dictionary];
      }
      const schemes = urlType.schemes.filter((scheme) => !replacedSchemes.has(scheme));
      return schemes.length === 0
        ? []
        : [{...urlType.dictionary, CFBundleURLSchemes: schemes}];
    });

  return {
    ...infoPlist,
    ...readLocalizations(infoPlist, options, existingLocalizations),
    CFBundleDisplayName: `$(${DISPLAY_NAME_BUILD_SETTING})`,
    CFBundleURLTypes: [
      ...preservedUrlTypes,
      {
        CFBundleURLName: OWNED_URL_TYPE_NAME,
        CFBundleURLSchemes: [
          `$(${URL_SCHEME_BUILD_SETTING})`,
          '$(PRODUCT_BUNDLE_IDENTIFIER)',
        ],
      },
    ],
  };
}

/**
 * Once CFBundleLocalizations exists, iOS only matches the languages it lists, so it must keep every
 * language the app already ships.
 */
function readLocalizations(
  infoPlist: PlistDictionary,
  options: NormalizedNativeVariantsOptions,
  existingLocalizations: readonly string[],
): PlistDictionary {
  const languages = collectLocalizedLanguages(options);
  if (languages.length === 0) {
    return {};
  }
  const current = Array.isArray(infoPlist.CFBundleLocalizations)
    ? infoPlist.CFBundleLocalizations.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const region = infoPlist.CFBundleDevelopmentRegion;
  const developmentLanguage =
    typeof region === 'string' && !region.includes('$(') ? region : 'en';
  return {
    CFBundleLocalizations: [
      ...new Set([developmentLanguage, ...current, ...existingLocalizations, ...languages]),
    ],
  };
}

export function findSharedUrlSchemes(infoPlist: PlistDictionary): readonly string[] {
  return readUrlTypes(infoPlist.CFBundleURLTypes)
    .filter((urlType) => urlType.dictionary.CFBundleURLName !== OWNED_URL_TYPE_NAME)
    .flatMap((urlType) => urlType.schemes ?? []);
}

type UrlType = Readonly<{
  dictionary: PlistDictionary;
  schemes: readonly string[] | undefined;
}>;

function readUrlTypes(value: PlistValue | undefined): readonly UrlType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry): UrlType => {
    if (!isDictionary(entry)) {
      throw new Error(
        'expo-native-variants found a non-dictionary entry in CFBundleURLTypes.',
      );
    }

    const schemes = entry.CFBundleURLSchemes;
    if (schemes === undefined) {
      return {dictionary: entry, schemes: undefined};
    }
    if (!Array.isArray(schemes) || !schemes.every((scheme) => typeof scheme === 'string')) {
      throw new Error(
        'expo-native-variants found an invalid CFBundleURLSchemes value in Info.plist.',
      );
    }
    return {dictionary: entry, schemes};
  });
}

function isDictionary(value: PlistValue): value is PlistDictionary {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
