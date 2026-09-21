import path from 'node:path';

import {syncGeneratedFiles} from '../files/generated';
import type {NormalizedNativeVariantsOptions} from '../options';
import {renderIcon} from './image';
import {iosIconName} from './resolve';

export async function syncIosIcons(
  projectRoot: string,
  platformRoot: string,
  projectName: string,
  options: NormalizedNativeVariantsOptions,
): Promise<void> {
  const files = new Map<string, Buffer>();
  for (const variant of options.variants) {
    const name = iosIconName(variant);
    const icon = variant.iosIcon;
    if (name === undefined || icon === undefined) continue;
    const appearances = typeof icon === 'string' ? {light: icon} : icon;
    const light = appearances.light ?? appearances.dark ?? appearances.tinted;
    if (light === undefined) continue;
    const images: object[] = [];
    for (const [appearance, source] of Object.entries({...appearances, light})) {
      if (source === undefined) continue;
      const filename = `${appearance}.png`;
      files.set(
        `${name}.appiconset/${filename}`,
        await renderIcon(projectRoot, source, 1024, {opaque: appearance !== 'tinted'}),
      );
      images.push({
        filename,
        idiom: 'universal',
        platform: 'ios',
        size: '1024x1024',
        ...(appearance === 'light'
          ? {}
          : {appearances: [{appearance: 'luminosity', value: appearance}]}),
      });
    }
    files.set(
      `${name}.appiconset/Contents.json`,
      Buffer.from(
        `${JSON.stringify({images, info: {author: 'expo-native-variants', version: 1}}, null, 2)}\n`,
      ),
    );
  }
  await syncGeneratedFiles(
    path.join(platformRoot, projectName, 'Images.xcassets'),
    '.expo-native-variants-icons.json',
    files,
  );
}
