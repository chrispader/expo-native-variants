import type {NativeVariantAdaptiveIcon, NativeVariantIosIcon} from './types';

export function readIosIcon(value: unknown, label: string): NativeVariantIosIcon | undefined {
  if (value === undefined || typeof value === 'string') {
    return readIconPath(value, label);
  }
  return readIconFields(value, label, ['light', 'dark', 'tinted']);
}

export function readAdaptiveIcon(
  value: unknown,
  label: string,
): NativeVariantAdaptiveIcon | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readIconFields(value, label, [
    'foregroundImage',
    'backgroundImage',
    'backgroundColor',
    'monochromeImage',
  ]);
}

export function readIconPath(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim().length === 0 || /\p{Cc}/u.test(value)) {
    throw new Error(`${label} must be a nonempty image path.`);
  }
  if (/\.icon\/?$/i.test(value)) {
    throw new Error(
      `${label} does not support Icon Composer .icon directories. Use an image or light/dark/tinted images.`,
    );
  }
  return value;
}

function readIconFields(
  value: unknown,
  label: string,
  keys: readonly string[],
): Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const result: Record<string, string> = {};
  for (const [key, field] of Object.entries(value)) {
    if (!keys.includes(key)) {
      throw new Error(`${label} contains unknown key "${key}".`);
    }
    if (field === undefined) {
      continue;
    }
    if (key === 'backgroundColor') {
      if (typeof field !== 'string' || !/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(field)) {
        throw new Error(`${label}.backgroundColor must be a hex color.`);
      }
      result[key] =
        field.length <= 5
          ? `#${[...field.slice(1)].map((channel) => channel + channel).join('')}`
          : field;
      continue;
    }
    const iconPath = readIconPath(field, `${label}.${key}`);
    if (iconPath !== undefined) {
      result[key] = iconPath;
    }
  }
  if (Object.keys(result).length === 0) {
    throw new Error(`${label} must contain at least one icon property.`);
  }
  return Object.freeze(result);
}
