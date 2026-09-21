import path from 'node:path';

import {
  compositeImagesAsync,
  generateImageAsync,
  generateImageBackgroundAsync,
} from '@expo/image-utils';

import type {NativeVariantAdaptiveIcon} from '../options';

export async function renderLegacyIcon(
  projectRoot: string,
  source: string,
  size: number,
  adaptive: NativeVariantAdaptiveIcon | undefined,
): Promise<Buffer> {
  const foreground = await renderIcon(projectRoot, source, size);
  if (adaptive === undefined) return foreground;
  const background =
    adaptive.backgroundImage === undefined
      ? await generateImageBackgroundAsync({
          width: size,
          height: size,
          resizeMode: 'cover',
          backgroundColor: adaptive.backgroundColor ?? '#ffffff',
        })
      : await renderIcon(projectRoot, adaptive.backgroundImage, size);
  return compositeImagesAsync({foreground, background});
}

export async function renderIcon(
  projectRoot: string,
  source: string,
  size: number,
  opaque = false,
): Promise<Buffer> {
  const {source: image} = await generateImageAsync(
    {projectRoot, cacheType: 'expo-native-variants-icons'},
    {
      src:
        path.isAbsolute(source) || /^https?:\/\//.test(source)
          ? source
          : path.resolve(projectRoot, source),
      width: size,
      height: size,
      resizeMode: 'cover',
      backgroundColor: opaque ? '#ffffff' : 'transparent',
      removeTransparency: opaque,
    },
  );
  return image;
}
