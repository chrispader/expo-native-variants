import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

/** Records the variant that prebuild wrote into the plain Debug and Release configurations. */
export const PREBUILD_VARIANT_PROPERTY = 'expo-native-variants.variant';

export function readPrebuildVariant(projectRoot: string | undefined): string | undefined {
  if (projectRoot === undefined) return undefined;
  const file = path.join(projectRoot, 'ios', 'Podfile.properties.json');
  if (!existsSync(file)) return undefined;
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'))[PREBUILD_VARIANT_PROPERTY];
  return typeof value === 'string' ? value : undefined;
}
