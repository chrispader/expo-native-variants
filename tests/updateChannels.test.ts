import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import type {AndroidConfig} from 'expo/config-plugins';
import {afterEach, describe, expect, it} from 'vitest';

import {configPlugins} from '../src/configPlugins';
import {normalizeNativeVariants} from '../src/options';
import {restoreAndroidUpdateChannel, syncAndroidUpdateChannelManifests, UPDATE_HEADERS_METADATA} from '../src/android/updates';

const roots: string[] = [];
const options = normalizeNativeVariants({configName: 'Acme', options: {variants: {
  production: {applicationId: 'com.acme.app', updateChannel: 'production'},
  preview: {applicationId: 'com.acme.app.preview', updateChannel: 'preview'},
}}});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe('native update channel configuration', () => {
  it('preserves headers written by other plugins while restoring the shared channel', () => {
    const manifest: AndroidConfig.Manifest.AndroidManifest = {manifest: {
      $: {'xmlns:android': 'http://schemas.android.com/apk/res/android'},
      queries: [],
      application: [{$: {'android:name': '.MainApplication'}}],
    }};
    const application = configPlugins.AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    configPlugins.AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, UPDATE_HEADERS_METADATA,
      JSON.stringify({'expo-channel-name': 'production', 'neighbor-header': 'kept'}));

    restoreAndroidUpdateChannel(manifest, {enabled: true, sharedRequestHeaders: {}});

    const value = application['meta-data']?.find(({ $ }) => $['android:name'] === UPDATE_HEADERS_METADATA)?.$['android:value'];
    expect(JSON.parse(value ?? '{}')).toEqual({'neighbor-header': 'kept'});
  });

  it('updates and removes only the owned flavor manifests', async () => {
    const root = await temporaryRoot();
    await syncAndroidUpdateChannelManifests(root, options, true);
    const production = path.join(root, 'app/src/production/AndroidManifest.xml');
    const preview = path.join(root, 'app/src/preview/AndroidManifest.xml');
    await syncAndroidUpdateChannelManifests(root, options, true);
    await syncAndroidUpdateChannelManifests(root, {...options, variants: [options.selectedVariant]}, true);
    await expect(readFile(preview)).rejects.toMatchObject({code: 'ENOENT'});
    await expect(readFile(production, 'utf8')).resolves.toContain('${nativeVariantUpdateHeaders}');
    await syncAndroidUpdateChannelManifests(root, options, false);
    await expect(readFile(production)).rejects.toMatchObject({code: 'ENOENT'});
  });

  it('refuses to overwrite edits to a generated flavor manifest', async () => {
    const root = await temporaryRoot();
    await syncAndroidUpdateChannelManifests(root, options, true);
    const manifest = path.join(root, 'app/src/preview/AndroidManifest.xml');
    await writeFile(manifest, '<manifest />');
    await expect(syncAndroidUpdateChannelManifests(root, options, false)).rejects.toThrow('unmodified generated file');
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'native-variants-updates-'));
  roots.push(root);
  return root;
}
