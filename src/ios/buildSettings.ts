import type {NormalizedNativeVariant} from '../options';

/** Records the values that variant build settings replaced, so another variant or a removed setting restores them. */
const ORIGINALS_BUILD_SETTING = 'EXPO_NATIVE_VARIANTS_ORIGINAL_BUILD_SETTINGS';

type Originals = Record<string, unknown>;

export function applyVariantBuildSettings(
  settings: Record<string, unknown>,
  variant: NormalizedNativeVariant,
): void {
  restoreOriginals(settings);
  const custom = variant.iosBuildSettings;
  if (custom === undefined) {
    return;
  }
  const originals: Originals = {};
  for (const [name, value] of Object.entries(custom)) {
    originals[name] = settings[name] ?? null;
    settings[name] = typeof value === 'string' ? quote(value) : value.map(quote);
  }
  settings[ORIGINALS_BUILD_SETTING] = `"${Buffer.from(JSON.stringify(originals)).toString('base64')}"`;
}

function restoreOriginals(settings: Record<string, unknown>): void {
  const encoded = settings[ORIGINALS_BUILD_SETTING];
  delete settings[ORIGINALS_BUILD_SETTING];
  if (typeof encoded !== 'string') {
    return;
  }
  const originals = JSON.parse(
    Buffer.from(encoded.replaceAll('"', ''), 'base64').toString('utf8'),
  ) as Originals;
  for (const [name, value] of Object.entries(originals)) {
    if (value === null) {
      delete settings[name];
    } else {
      settings[name] = value;
    }
  }
}

function quote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
