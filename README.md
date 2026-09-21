# expo-native-variants

Generate every native app variant in one Expo prebuild. Switch between development, preview, and production in Xcode or Android Studio while keeping `ios/` and `android/` generated and ignored by Git.

Stable releases use the npm `latest` tag, while prereleases use `next`.

This community-maintained package targets Expo SDK 57. It is an early release for the standard Expo native templates with one iOS application target, optional explicitly configured iOS extension targets, and one Android flavor dimension. See [compatibility](#compatibility) before adding it to an existing app.

See the [validation record](./VALIDATION.md) for tested toolchain versions and results.
Release maintainers can find the automated process in [RELEASING.md](./RELEASING.md).

## Configure variants

Install `expo-native-variants` in your Expo project and add it to the `plugins` array in your app config. Each variant only requires a complete application identifier. Declare the primary variant first.

```sh
bun add expo-native-variants
```

```ts
import type {ExpoConfig} from 'expo/config';
import type {NativeVariantMap} from 'expo-native-variants';

export const variants = {
  production: {applicationId: 'com.acme.app'},
  development: {applicationId: 'com.acme.app.dev'},
  preview: {applicationId: 'com.acme.app.preview'},
} satisfies NativeVariantMap;

export default {
  name: 'Acme',
  slug: 'acme',
  plugins: [['expo-native-variants', {variants}]],
} satisfies ExpoConfig;
```

Run Expo prebuild, then open the generated native projects. Native dependencies and configuration changes require another prebuild. Selecting an existing variant does not.

```sh
expo prebuild --clean
```

| Variant | Xcode scheme | Xcode configurations | Android variants |
| --- | --- | --- | --- |
| development | `Acme-Development` | `Debug-Development`, `Release-Development` | `developmentDebug`, `developmentRelease` |
| preview | `Acme-Preview` | `Debug-Preview`, `Release-Preview` | `previewDebug`, `previewRelease` |
| production | `Acme-Production` | `Debug-Production`, `Release-Production` | `productionDebug`, `productionRelease` |

Choose a scheme in the iOS workspace or a build variant in Android Studio. Every variant supports debug and release builds. A debug build and a release build of the same variant share an identifier, so installing one replaces the other.

For Android, Expo CLI also accepts explicit variant and application selection:

```sh
expo run:android --variant developmentDebug --app-id com.acme.app.dev
```

On iOS, use Xcode for custom configurations. Expo CLI 57 defaults to the ordinary `Debug` configuration unless one is specified, and its environment-mode handling checks for the literal name `Release`. Selecting a custom scheme alone does not reliably select its configured build mode.

## Options

The first declared variant supplies the Expo application identifiers, URL scheme, and ordinary iOS `Debug` and `Release` configurations. Set `NATIVE_VARIANT` when a tool needs the config for a different app. The plugin fills `ios.bundleIdentifier`, `android.package`, and `scheme`; no wrapper or `getUrlScheme` function is needed. It preserves additional, non-variant schemes after the preferred scheme.

`variants` is the only required plugin option. The optional `variant` property overrides `NATIVE_VARIANT` during Expo config evaluation, and `ios.targets` adds extension targets created by another plugin. Neither `variant` nor the environment variable limits the generated matrix: every variant is generated.

| Variant option | Purpose |
| --- | --- |
| `applicationId` | Full identifier shared by iOS and Android |
| `icon` | Optional image shared by iOS and Android for this variant |
| `displayName` | Optional name shown under the app icon; defaults to the Expo app name for the first variant and adds the variant name for the others |
| `urlScheme` | Optional custom URL scheme; defaults to `applicationId` |
| `runMode` | Xcode Run action's mode, `debug` by default |
| `ios.bundleIdentifier` | Optional replacement for the shared identifier on iOS |
| `ios.xcodeScheme` | Optional Xcode build-scheme name |
| `ios.debugConfiguration` | Optional debug configuration name; must contain `Debug` for React Native's bundling scripts |
| `ios.releaseConfiguration` | Optional release configuration name; must not contain `Debug` |
| `ios.icon` | Optional iOS image or `{light, dark, tinted}` appearance images |
| `android.applicationId` | Optional replacement for the shared identifier on Android |
| `android.flavor` | Optional Android product flavor name, starting with a lowercase letter |
| `android.icon` | Optional Android launcher image |
| `android.adaptiveIcon` | Optional `foregroundImage`, `backgroundImage`, `backgroundColor`, and `monochromeImage` |

### Icons

Put each icon next to its variant. Selecting an Xcode configuration or Android flavor selects its native icon; there is no JavaScript icon switch.

```ts
export const variants = {
  production: {
    applicationId: 'com.acme.app',
    icon: './assets/production.png',
  },
  development: {
    applicationId: 'com.acme.app.dev',
    icon: './assets/development.png',
  },
  preview: {
    applicationId: 'com.acme.app.preview',
    icon: './assets/preview.png',
  },
} satisfies NativeVariantMap;
```

Platform-specific overrides are optional:

```ts
preview: {
  applicationId: 'com.acme.app.preview',
  icon: './assets/preview.png',
  ios: {
    icon: {
      light: './assets/preview.png',
      dark: './assets/preview-dark.png',
      tinted: './assets/preview-tinted.png',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/preview-foreground.png',
      backgroundColor: '#3A2418',
      monochromeImage: './assets/monochrome.png',
    },
  },
},
```

An omitted variant icon inherits the corresponding shared Expo icon settings. An explicit variant `icon` replaces shared artwork, including Android adaptive layers, unless a platform override is supplied. With only `icon`, Android uses that image for both legacy and adaptive launcher icons. Keep important artwork within the adaptive icon safe area. With only `android.adaptiveIcon.foregroundImage`, that image also supplies the legacy icon.

The plugin generates iOS asset catalogs and Android flavor resources, updates them on prebuild, and removes stale files it owns. It refuses to overwrite manually edited output. Use source images to make changes. Per-variant Icon Composer `.icon` directories are not supported.

### iOS extension targets

The plugin can add the variant matrix to extension targets created by another config plugin. List each extension by its exact Xcode target name and give it a bundle identifier suffix:

```ts
import type {NativeVariantsOptions} from 'expo-native-variants';

const options = {
  ios: {
    targets: {
      AcmeShare: {bundleIdentifierSuffix: '.share'},
      AcmeWidget: {bundleIdentifierSuffix: '.widget'},
    },
  },
  variants: {
    production: {
      applicationId: 'com.acme.app',
    },
    development: {
      applicationId: 'com.acme.app.dev',
    },
  },
} satisfies NativeVariantsOptions;
```

This produces `com.acme.app.share` and `com.acme.app.dev.share` for `AcmeShare`, plus the corresponding widget identifiers. The target-generating plugin remains responsible for creating targets, source files, build phases, frameworks, plist files, and entitlements. Register that plugin before `expo-native-variants`, and keep `expo-native-variants` last in the plugin list.

Keep each suffix equal to the suffix in the target generator's own configuration. `expo-native-variants` validates and applies the resulting identifiers but does not rewrite that plugin's configuration.

The extension's standard `Debug` and `Release` configurations are the templates for every generated variant configuration. Their Swift version, deployment target, plist path, signing settings, entitlements path, frameworks, and build phases remain intact. The application alone receives the variant display name and URL scheme.

For a shared app group, use the generated application-identifier build setting in both the app and extension entitlements:

```ts
const applicationGroups = [
  'group.$(EXPO_NATIVE_VARIANT_BUNDLE_IDENTIFIER)',
];
```

For example, pass that array through `ios.entitlements` for the app and through the extension generator's entitlements configuration. Xcode expands it to the main application bundle identifier for each configuration, so an extension and its containing app share `group.com.acme.app.dev` in development and `group.com.acme.app` in production.

Variant keys determine the Android flavor names and generated iOS configuration names. Identifiers must be unique on each platform. The plugin rejects invalid names and collisions before generating native settings.

The plugin changes the display name while keeping the native target, product name, and Android source namespace stable. It owns its generated files and configuration sections. Repeated prebuilds update them, including renamed or removed variants. If you remove the plugin itself, perform a clean prebuild to remove its native output.

## Read the installed variant

Install `expo-application` if your app needs runtime variant selection. Keep the variant map in a shared module and pass the installed identifier to the separate runtime entry point:

```ts
import * as Application from 'expo-application';
import { getNativeVariant } from 'expo-native-variants/runtime';

import {variants} from './app.config';

const variant = getNativeVariant(Application.applicationId, variants);
```

The helper returns the variant key or `null` when the identifier is missing, unknown, or ambiguous. It never assumes production for Expo Go or web. Pass a third argument, `'ios'` or `'android'`, if your map reuses the same identifier for different variants across platforms.

The runtime helper contains no config-plugin code and requires no native module of its own. The installed application's identifier remains the source of identity when JavaScript is reloaded or updated. A scheme change does not change bundled `EXPO_PUBLIC_*` variables or Expo's shared `extra` values.

## Development clients and links

Each variant gets its own custom URL scheme. If using `expo-dev-client`, configure its `addGeneratedScheme` option as `false` to avoid the shared default development-client scheme. The variant's custom scheme can open its development client.

```json
["expo-dev-client", { "addGeneratedScheme": false }]
```

Keep this entry before `expo-native-variants` in the plugins array. Existing third-party URL registrations are not automatically rewritten for separate OAuth applications. Configure those services explicitly and check their callbacks with every installed variant.

Native builds automatically supply their identity when generating the embedded Expo config: iOS uses the build configuration, and Android generates a separate `expo-constants` asset for each flavor. The embedded scheme therefore matches the built app even when prebuild used a different default.

A Metro server still serves one shared Expo manifest. Start it with `NATIVE_VARIANT` for the app you are developing. Keep the explicit `--scheme` as well: Expo CLI's Android native-scheme discovery reads unexpanded manifest placeholders.

```sh
NATIVE_VARIANT=development expo start --dev-client --scheme acme-dev
```

The Android development launcher also registers its own fixed `expo-dev-launcher` authentication scheme. That upstream callback remains shared when several debug clients are installed. The plugin preserves it and emits a warning. Use each variant's configured URL scheme for application links and development-client launch URLs.

## Experimental EAS configuration

EAS builds one app per job and reads its bundle identifier before native generation to select signing credentials and provisioning profiles. A profile named `preview` is not automatically connected to a variant with the same name. Connect them once in `eas.json`:

```json
{
  "build": {
    "preview": {
      "env": {"NATIVE_VARIANT": "preview"},
      "android": {"gradleCommand": ":app:assemblePreviewRelease"},
      "ios": {"buildConfiguration": "Release"}
    }
  }
}
```

Then choose `eas build --profile preview`. The plugin reads `NATIVE_VARIANT` automatically; `app.config.ts` still only needs `['expo-native-variants', {variants}]`. All native variants are generated, but EAS prepares credentials for preview and the profile builds preview.

Why not infer this from the EAS profile name? Expo's built-in `EAS_BUILD_PROFILE` is [not available during local app-config evaluation](https://docs.expo.dev/eas/environment-variables/usage/#using-environment-variables-with-eas-build). Profile `env` values are available both locally and on the builder. Using only the cloud profile name could select different identifiers during signing setup and the actual build.

The `variant` plugin option is an escape hatch for config evaluation, not a build-matrix selector. For example, `variant: process.env.APP_VARIANT` lets an existing project keep its own environment-variable name. Without an override or `NATIVE_VARIANT`, config evaluation uses the first declared variant. During native compilation, the actual build identity takes precedence so its embedded metadata cannot accidentally use the config-evaluation default.

The [example profiles](./example/eas.json) select Android Gradle tasks and ordinary iOS Debug/Release configurations. Treat them as a starting point. Cloud builds, signing, provisioning, and credential selection have not been verified, so EAS support is experimental. Do not rely on the cloud-only `EAS_BUILD_PROFILE` variable for local credential preflight.

## Compatibility

The current release supports Expo's generated Android Groovy template, exactly one iOS application target, and explicitly configured iOS app-extension or ExtensionKit-extension targets. Existing Android product flavors, additional flavor dimensions, Kotlin DSL projects, native test targets, App Clips, watch applications, and other target product types remain outside its supported layout. Every additional native target must appear in `ios.targets`; the plugin rejects an unconfigured target rather than generating an incomplete configuration matrix.

Extension support has been tested with `@bacons/apple-targets@5.0.0` using clean Expo prebuilds. That package currently fails while updating its own target during a repeated `expo prebuild --no-clean` on this toolchain, before `expo-native-variants` runs. Use clean prebuilds when combining these versions.

Expo SDK 57's default iOS template does not enable scene lifecycle support. A build linked with the iOS 27 SDK can crash on iOS 27 before JavaScript starts. Use Expo's [official scene-support configuration](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md) when targeting that combination. The example's launch tests use iOS 26.5.

The native dependency graph remains shared. Arbitrary per-variant Expo config objects, different plugin lists, Firebase service files, entitlements, and update channels are not supported options. Other plugins can still modify native settings, so validate integrations that touch the same files.

Remote update routing is not isolated by application identifiers alone. Configure and test update channels and runtime compatibility separately, and publish with the intended `NATIVE_VARIANT`: a downloaded update's manifest can replace the embedded Expo config. The example disables remote updates.

EAS support remains experimental until its credential preflight and cloud artifacts have been verified. Managed EAS builds resolve app identifiers before native generation and do not select arbitrary generated iOS schemes in the same way as Xcode. Local native generation does not establish EAS compatibility.

## Example and development

The [example](./example) contains three variants and displays the installed identifier, resolved variant, and debug/release mode. Install the repository dependencies, build the package, generate the example's native projects, and open its iOS workspace or Android project.

This repository uses Bun 1.3.1. The root package scripts provide `build`, `typecheck`, `test`, `test:integration`, and `verify:package`. After generating the example and installing native dependencies, `build:native:android` and `build:native:ios` build every debug/release combination without another prebuild. Native build validation requires Xcode with CocoaPods on macOS, or an Android SDK and compatible Java installation. Keep the example's generated native folders out of commits.

## License

[MIT](./LICENSE).
