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
  round = false,
): Promise<Buffer> {
  const borderRadius = round ? size / 2 : undefined;
  const renderOptions = borderRadius === undefined ? {} : {borderRadius};
  const foreground = await renderIcon(projectRoot, source, size, renderOptions);
  if (adaptive === undefined) return foreground;
  const background =
    adaptive.backgroundImage === undefined
      ? await generateImageBackgroundAsync({
          width: size,
          height: size,
          resizeMode: 'cover',
          backgroundColor: adaptive.backgroundColor ?? '#ffffff',
          ...renderOptions,
        })
      : await renderIcon(projectRoot, adaptive.backgroundImage, size, renderOptions);
  return compositeImagesAsync({foreground, background});
}

type RenderIconOptions = Readonly<{opaque?: boolean; borderRadius?: number}>;

export async function renderIcon(
  projectRoot: string,
  source: string,
  size: number,
  options: RenderIconOptions = {},
): Promise<Buffer> {
  const {opaque = false, borderRadius} = options;
  const {source: image} = await generateImageAsync(
    {
      projectRoot,
      cacheType:
        borderRadius === undefined
          ? 'expo-native-variants-icons'
          : 'expo-native-variants-round-icons',
    },
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
      ...(borderRadius === undefined ? {} : {borderRadius}),
    },
  );
  return image;
}
