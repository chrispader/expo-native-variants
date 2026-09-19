# expo-native-variants

Generate every native app variant in one Expo prebuild. Switch between development, preview, and production in Xcode or Android Studio while keeping `ios/` and `android/` generated and ignored by Git.

The implementation is available as the `0.1.0-alpha.0` prerelease under the `next` tag. The `latest` tag still points to the empty `0.0.0` package-name reservation.

This community-maintained package targets Expo SDK 57. It is an early release for the standard Expo native templates with one iOS application target, optional explicitly configured iOS extension targets, and one Android flavor dimension. See [compatibility](#compatibility) before adding it to an existing app.

See the [validation record](./VALIDATION.md) for tested toolchain versions and results.

## Configure variants

Install `expo-native-variants` in your Expo project and add it to the `plugins` array in your app config. Use complete application identifiers so the variants can be installed together.

```sh
bun add expo-native-variants@next
```

```json
{
  "expo": {
    "name": "Acme",
    "slug": "acme",
    "ios": { "bundleIdentifier": "com.acme.app" },
    "android": { "package": "com.acme.app" },
    "plugins": [
      [
        "expo-native-variants",
        {
          "defaultVariant": "production",
          "variants": {
            "development": {
              "displayName": "Acme Dev",
              "applicationId": "com.acme.app.dev",
              "urlScheme": "acme-dev",
              "runMode": "debug"
            },
            "preview": {
              "displayName": "Acme Preview",
              "applicationId": "com.acme.app.preview",
              "urlScheme": "acme-preview",
              "runMode": "release"
            },
            "production": {
              "displayName": "Acme",
              "applicationId": "com.acme.app",
              "urlScheme": "acme",
              "runMode": "release"
            }
          }
        }
      ]
    ]
  }
}
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

`defaultVariant` names the variant used by the ordinary iOS `Debug` and `Release` configurations and the canonical app identity. The base `ios.bundleIdentifier` and `android.package` must match it when supplied. Every variant is generated regardless of the default.

| Variant option | Purpose |
| --- | --- |
| `displayName` | Name shown under the app icon |
| `applicationId` | Full identifier shared by iOS and Android |
| `urlScheme` | Custom URL scheme owned by this variant |
| `runMode` | Xcode Run action's mode, `debug` by default |
| `ios.bundleIdentifier` | Optional replacement for the shared identifier on iOS |
| `ios.xcodeScheme` | Optional Xcode build-scheme name |
| `android.applicationId` | Optional replacement for the shared identifier on Android |

### iOS extension targets

The plugin can add the variant matrix to extension targets created by another config plugin. List each extension by its exact Xcode target name and give it a bundle identifier suffix:

```ts
import type {NativeVariantsConfigInput} from 'expo-native-variants/config';

const options = {
  defaultVariant: 'production',
  ios: {
    targets: {
      AcmeShare: {bundleIdentifierSuffix: '.share'},
      AcmeWidget: {bundleIdentifierSuffix: '.widget'},
    },
  },
  variants: {
    development: {
      displayName: 'Acme Dev',
      applicationId: 'com.acme.app.dev',
      urlScheme: 'acme-dev',
    },
    production: {
      displayName: 'Acme',
      applicationId: 'com.acme.app',
      urlScheme: 'acme',
    },
  },
} satisfies NativeVariantsConfigInput;
```

This produces `com.acme.app.dev.share` and `com.acme.app.share` for `AcmeShare`, plus the corresponding widget identifiers. The target-generating plugin remains responsible for creating targets, source files, build phases, frameworks, plist files, and entitlements. Register that plugin before `expo-native-variants`. The `createNativeVariantsConfig` helper already places `expo-native-variants` last.

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

import { variants } from './variants';

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

Start Metro with the selected variant's explicit scheme. Expo CLI's Android scheme discovery reads the unexpanded manifest placeholders, so its automatically generated launch URL may contain a placeholder.

```sh
expo start --dev-client --scheme acme-dev
```

The Android development launcher also registers its own fixed `expo-dev-launcher` authentication scheme. That upstream callback remains shared when several debug clients are installed. The plugin preserves it and emits a warning. Use each variant's configured URL scheme for application links and development-client launch URLs.

## Experimental EAS configuration

EAS reads application identifiers before native generation. The optional config helper projects a selected variant's identifiers into app config and keeps the same selection for the canonical native configurations. It still generates every variant.

```ts
import { createNativeVariantsConfig } from 'expo-native-variants/config';

import { options } from './variants';

export default () => createNativeVariantsConfig({
  config: { name: 'Acme', slug: 'acme' },
  options,
  variant: process.env.NATIVE_VARIANT,
});
```

Declare `NATIVE_VARIANT` explicitly in each EAS profile's `env` object. Local development can leave it unset and switch between generated native variants as usual. The helper uses `variant`, then `options.canonicalVariant`, then `defaultVariant`. It preserves the app name and existing plugins, registers this plugin last, and rejects duplicate registration. It does not read environment variables itself.

The [example profiles](./example/eas.json) select Android Gradle tasks and ordinary iOS Debug/Release configurations. Treat them as a starting point. Cloud builds, signing, provisioning, and credential selection have not been verified, so the helper is experimental. Do not rely on the cloud-only `EAS_BUILD_PROFILE` variable for local credential preflight.

## Compatibility

The current release supports Expo's generated Android Groovy template, exactly one iOS application target, and explicitly configured iOS app-extension or ExtensionKit-extension targets. Existing Android product flavors, additional flavor dimensions, Kotlin DSL projects, native test targets, App Clips, watch applications, and other target product types remain outside its supported layout. Every additional native target must appear in `ios.targets`; the plugin rejects an unconfigured target rather than generating an incomplete configuration matrix.

Extension support has been tested with `@bacons/apple-targets@5.0.0` using clean Expo prebuilds. That package currently fails while updating its own target during a repeated `expo prebuild --no-clean` on this toolchain, before `expo-native-variants` runs. Use clean prebuilds when combining these versions.

Expo SDK 57's default iOS template does not enable scene lifecycle support. A build linked with the iOS 27 SDK can crash on iOS 27 before JavaScript starts. Use Expo's [official scene-support configuration](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md) when targeting that combination. The example's launch tests use iOS 26.5.

The native dependency graph remains shared. Arbitrary per-variant Expo config objects, different plugin lists, icons, Firebase service files, entitlements, and update channels are not supported options. Other plugins can still modify native settings, so validate integrations that touch the same files.

Remote update routing is not isolated by application identifiers alone. Configure and test update channels and runtime compatibility separately. The example disables remote updates.

EAS support remains experimental until its credential preflight and cloud artifacts have been verified. Managed EAS builds resolve app identifiers before native generation and do not select arbitrary generated iOS schemes in the same way as Xcode. Local native generation does not establish EAS compatibility.

## Example and development

The [example](./example) contains three variants and displays the installed identifier, resolved variant, and debug/release mode. Install the repository dependencies, build the package, generate the example's native projects, and open its iOS workspace or Android project.

This repository uses Bun 1.3.1. The root package scripts provide `build`, `typecheck`, `test`, `test:integration`, and `verify:package`. After generating the example and installing native dependencies, `build:native:android` and `build:native:ios` build every debug/release combination without another prebuild. Native build validation requires Xcode with CocoaPods on macOS, or an Android SDK and compatible Java installation. Keep the example's generated native folders out of commits.

## License

[MIT](./LICENSE).
