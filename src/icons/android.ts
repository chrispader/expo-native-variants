import path from 'node:path';

import {syncGeneratedFiles} from '../files/generated';
import type {NormalizedNativeVariantsOptions} from '../options';
import {renderIcon, renderLegacyIcon} from './image';

const DENSITIES = {mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4};

export async function syncAndroidIcons(
  projectRoot: string,
  platformRoot: string,
  options: NormalizedNativeVariantsOptions,
): Promise<void> {
  const files = new Map<string, Buffer>();
  for (const variant of options.variants) {
    const adaptive = variant.androidAdaptiveIcon;
    const legacy = variant.androidIcon ?? adaptive?.foregroundImage;
    const foreground = adaptive?.foregroundImage ?? legacy;
    if (legacy === undefined || foreground === undefined) {
      if (adaptive !== undefined)
        throw new Error(
          `Variant "${variant.key}" adaptiveIcon requires foregroundImage or a fallback icon.`,
        );
      continue;
    }
    const resourceRoot = `${variant.androidFlavor}/res`;
    for (const [density, scale] of Object.entries(DENSITIES)) {
      const mipmap = `${resourceRoot}/mipmap-${density}`;
      const legacyImage = await renderLegacyIcon(projectRoot, legacy, 48 * scale, adaptive);
      files.set(`${mipmap}/ic_launcher.png`, legacyImage);
      files.set(
        `${mipmap}/ic_launcher_round.png`,
        await renderLegacyIcon(projectRoot, legacy, 48 * scale, adaptive, true),
      );
      files.set(
        `${mipmap}/native_variant_foreground.png`,
        await renderIcon(projectRoot, foreground, 108 * scale),
      );
      if (adaptive?.backgroundImage !== undefined) {
        files.set(
          `${mipmap}/native_variant_background.png`,
          await renderIcon(projectRoot, adaptive.backgroundImage, 108 * scale),
        );
      }
      if (adaptive?.monochromeImage !== undefined) {
        files.set(
          `${mipmap}/native_variant_monochrome.png`,
          await renderIcon(projectRoot, adaptive.monochromeImage, 108 * scale),
        );
      }
    }
    const color = adaptive?.backgroundColor ?? '#ffffff';
    const androidColor = color.length === 9 ? `#${color.slice(7)}${color.slice(1, 7)}` : color;
    files.set(
      `${resourceRoot}/values/native_variant_icon.xml`,
      Buffer.from(
        `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="native_variant_icon_background">${androidColor}</color></resources>\n`,
      ),
    );
    const background =
      adaptive?.backgroundImage === undefined
        ? '@color/native_variant_icon_background'
        : '@mipmap/native_variant_background';
    const base = `<background android:drawable="${background}" />\n    <foreground android:drawable="@mipmap/native_variant_foreground" />`;
    const monochrome =
      adaptive?.monochromeImage === undefined
        ? ''
        : '\n    <monochrome android:drawable="@mipmap/native_variant_monochrome" />';
    for (const name of ['ic_launcher', 'ic_launcher_round']) {
      files.set(`${resourceRoot}/mipmap-anydpi-v26/${name}.xml`, Buffer.from(adaptiveXml(base)));
      // Override a shared API 33 icon too, even when this variant has no monochrome layer.
      files.set(
        `${resourceRoot}/mipmap-anydpi-v33/${name}.xml`,
        Buffer.from(adaptiveXml(base + monochrome)),
      );
    }
  }
  await syncGeneratedFiles(
    path.join(platformRoot, 'app', 'src'),
    '.expo-native-variants-icons.json',
    files,
  );
}

function adaptiveXml(layers: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    ${layers}\n</adaptive-icon>\n`;
}
