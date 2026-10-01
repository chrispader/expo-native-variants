import type {AndroidConfig} from 'expo/config-plugins';

import type {NormalizedNativeVariantsOptions} from '../options';
import {syncGeneratedFiles} from '../files/generated';
import {configPlugins} from '../configPlugins';
import {restoreSharedUpdateChannel} from '../updates';
import type {NativeUpdateChannels} from '../updates';

export const UPDATE_HEADERS_METADATA = 'expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY';

export function restoreAndroidUpdateChannel(
  manifest: AndroidConfig.Manifest.AndroidManifest,
  updates: NativeUpdateChannels,
): void {
  const {Manifest} = configPlugins.AndroidConfig;
  const application = Manifest.getMainApplicationOrThrow(manifest);
  const value = application['meta-data']?.find(({$}) =>
    $['android:name'] === UPDATE_HEADERS_METADATA,
  )?.$['android:value'];
  const headers: unknown = value === undefined ? {} : JSON.parse(value);
  if (!isRequestHeaders(headers)) {
    throw new Error('Expo Updates request headers must be a JSON object with string values.');
  }
  const restored = restoreSharedUpdateChannel(headers, updates);
  if (Object.keys(restored).length === 0) {
    Manifest.removeMetaDataItemFromMainApplication(application, UPDATE_HEADERS_METADATA);
    return;
  }
  Manifest.addMetaDataItemToMainApplication(
    application,
    UPDATE_HEADERS_METADATA,
    JSON.stringify(restored),
  );
}

/** Flavor overlays take precedence even when EAS edits the shared manifest after prebuild. */
export async function syncAndroidUpdateChannelManifests(
  androidRoot: string,
  options: NormalizedNativeVariantsOptions,
  enabled: boolean,
): Promise<void> {
  const files = new Map<string, Buffer>();
  if (enabled) {
    for (const {androidFlavor, updateChannel} of options.variants) {
      if (updateChannel === undefined) continue;
      files.set(`app/src/${androidFlavor}/AndroidManifest.xml`, Buffer.from(
        `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <application>
    <meta-data android:name="${UPDATE_HEADERS_METADATA}" android:value="\${nativeVariantUpdateHeaders}" tools:replace="android:value" />
  </application>
</manifest>
`,
      ));
    }
  }
  await syncGeneratedFiles(androidRoot, '.expo-native-variants-updates.json', files);
}

/** Read shared headers at build time to retain later EAS or native configuration edits. */
export function createUpdateChannelsGradle(options: NormalizedNativeVariantsOptions): string {
  const channels = options.variants
    .flatMap(({androidFlavor, updateChannel}) => updateChannel === undefined ? [] : [
      `        ${JSON.stringify(androidFlavor)}: ${JSON.stringify(updateChannel)}`,
    ])
    .join('\n');
  return `    def nativeVariantUpdateChannels = [
${channels}
    ]
    def nativeVariantUpdatesManifest = new groovy.xml.XmlSlurper(false, false).parse(file("src/main/AndroidManifest.xml"))
    def nativeVariantUpdatesMetadata = nativeVariantUpdatesManifest.application.'meta-data'.find {
        it.attributes()['android:name'] == "${UPDATE_HEADERS_METADATA}"
    }
    def nativeVariantSharedHeaders = nativeVariantUpdatesMetadata?.attributes()?.get('android:value')
    def nativeVariantRequestHeaders = nativeVariantSharedHeaders ? new groovy.json.JsonSlurper().parseText(nativeVariantSharedHeaders) : [:]
    nativeVariantUpdateChannels.each { flavor, channel ->
        def headers = new LinkedHashMap(nativeVariantRequestHeaders)
        headers["expo-channel-name"] = channel
        productFlavors.getByName(flavor).manifestPlaceholders["nativeVariantUpdateHeaders"] = groovy.json.JsonOutput.toJson(headers)
    }`;
}

function isRequestHeaders(value: unknown): value is Record<string, string> {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((header) => typeof header === 'string');
}
