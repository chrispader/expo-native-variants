import {readFile} from 'node:fs/promises';
import path from 'node:path';

import type {NormalizedNativeVariantsOptions} from './options';

export const IOS_NAME_KEY = 'CFBundleDisplayName';
export const ANDROID_NAME_KEY = 'app_name';

/**
 * Expo `locales` writes one shared resource per language. When that file also sets the app name, it
 * replaces the name of every variant that does not list the language itself.
 */
export async function findLocaleNameCollisions({
  locales,
  nameKey,
  options,
  projectRoot,
}: Readonly<{
  locales: unknown;
  nameKey: typeof IOS_NAME_KEY | typeof ANDROID_NAME_KEY;
  options: NormalizedNativeVariantsOptions;
  projectRoot: string;
}>): Promise<readonly string[]> {
  if (typeof locales !== 'object' || locales === null) {
    return [];
  }
  const collisions: string[] = [];
  for (const [tag, source] of Object.entries(locales)) {
    const strings = await readLocaleStrings(source, projectRoot);
    if (strings === undefined || !(nameKey in strings)) continue;
    const canonicalTag = canonicalizeTag(tag);
    const isOverridden = options.variants.every(
      (variant) => variant.localizedDisplayNames?.[canonicalTag] !== undefined,
    );
    if (!isOverridden) collisions.push(tag);
  }
  return collisions;
}

function canonicalizeTag(tag: string): string {
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? tag;
  } catch {
    return tag;
  }
}

async function readLocaleStrings(
  source: unknown,
  projectRoot: string,
): Promise<Record<string, unknown> | undefined> {
  if (typeof source === 'object' && source !== null) {
    return source as Record<string, unknown>;
  }
  if (typeof source !== 'string') {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(await readFile(path.resolve(projectRoot, source), 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function describeLocaleNameCollision(
  tags: readonly string[],
  nameKey: string,
): string {
  return `Expo "locales" sets ${nameKey} for ${tags.join(', ')}. That shared name replaces the display name of every variant that does not list the language in its displayName map.`;
}
