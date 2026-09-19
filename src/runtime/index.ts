export type NativeVariantPlatform = 'android' | 'ios';

export type NativeVariantIdentifier = Readonly<{
  applicationId: string;
  ios?: Readonly<{bundleIdentifier?: string}>;
  android?: Readonly<{applicationId?: string}>;
}>;

export type NativeVariantIdentifierMap = Readonly<
  Record<string, NativeVariantIdentifier>
>;

/**
 * Resolves an installed application identifier to its variant key. Returns null
 * for missing, unknown, or ambiguous identifiers.
 */
export function getNativeVariant(
  applicationId: string | null | undefined,
  variants: NativeVariantIdentifierMap,
  platform?: NativeVariantPlatform,
): string | null {
  if (applicationId === null || applicationId === undefined || applicationId.length === 0) {
    return null;
  }

  const matches = new Set<string>();
  for (const [key, variant] of Object.entries(variants)) {
    if (
      platform !== 'android' &&
      (variant.ios?.bundleIdentifier ?? variant.applicationId) === applicationId
    ) {
      matches.add(key);
    }
    if (
      platform !== 'ios' &&
      (variant.android?.applicationId ?? variant.applicationId) === applicationId
    ) {
      matches.add(key);
    }
  }

  if (matches.size !== 1) {
    return null;
  }
  return matches.values().next().value ?? null;
}
