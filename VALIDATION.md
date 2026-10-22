# Validation record

## Per-variant update channel validation, October 1, 2026

The optional `updateChannel` setting was checked with Expo 57.0.24, Xcode 27.0 build 27A266a, Gradle 9.3.1, Android Gradle plugin 8.12.0, and Java 17.0.20.1.

Compiled-package prebuild tests cover separate production and preview channels, a variant inheriting shared settings, repeated non-clean prebuilds, channel changes and removal, disabled updates, and protection against manual edits. Config-export tests cover `NATIVE_VARIANT` and the actual native build identity. The iOS build script also runs against real plist files, including a simulated EAS channel edit after prebuild.

Minimal native resource fixtures built all three release variants from one generated project. Xcode simulator builds produced `Expo.plist` with `preview`, `production`, and the inherited `eas-profile` channel. Android builds produced APK manifests with the same channels, checked inside the packaged artifacts. Every variant retained the shared custom request header.

These checks establish native channel selection and packaging. Full React Native app builds, installed `expo-updates` runtime behavior, EAS cloud builds, and live OTA delivery were not exercised for this feature.

## Localized display name validation, October 1, 2026

Localized `displayName` maps were checked with Expo 57.0.24, Xcode 27.0 build 27A266a, Gradle 9.3.1, Android Gradle plugin 8.12.0, and Java 21.0.12.1.

An unmodified copy of the example app with Expo `locales` confirmed the collision described in the README. The development APK carried the shared `fr` `app_name`, and the development iPhone build showed the shared name on a French home screen.

A prebuilt copy of the example app with a localized development variant (`fr`, `ar`, `zh-Hans`) was built as the development debug APK and as the iOS Debug-Development simulator app, with user script sandboxing enabled for the iOS app target. The built `.app` contained the three `InfoPlist.strings` files with the right names, and `aapt2` showed the matching `app_name` entries in the APK.

Runtime checks used an iOS 18.6 simulator and an Android API 34 arm64 emulator (Google APIs with Play Store image). The launcher labels matched the map in English (default), French, Arabic, and Simplified Chinese on both platforms. The French name contained an apostrophe and an ampersand, which compiled and displayed correctly. The Android emulator language was changed through the system Settings UI because the emulator image cannot be rooted.

With Expo `locales` setting `app_name` for `fr` and a French name only on the development variant, the development APK resolved to the variant name and the production APK to the shared name.

Not exercised: release builds, EAS builds, `zh-Hant` fallback on a device (the APK showed the default name for `zh-TW`), iOS devices, and extension targets.

## Original release validation

This records checks performed from September 19 through 21, 2026 for the published `0.1.0` release and the `0.2.0-alpha.0` prerelease.

## Build environment

| Component | Version |
| --- | --- |
| Expo | 57.0.24 |
| Expo CLI | 57.0.26 |
| React Native | 0.86.3 |
| React | 19.2.3 |
| Node.js | 24.11.0 |
| Xcode | 27.0, build 27A266a |
| CocoaPods | 1.17.0 |
| Java | Temurin 17.0.20.1 |
| Gradle | 9.3.1 |
| Android Gradle plugin | 8.12.0 |

## Native compilation

One clean prebuild generated all variants. CocoaPods installed once. Subsequent builds selected existing configurations without regenerating native projects.

| Variant | Android Debug | Android Release | iOS Debug | iOS Release |
| --- | --- | --- | --- | --- |
| development | Passed | Passed | Passed | Passed |
| preview | Passed | Passed | Passed | Passed |
| production | Passed | Passed | Passed | Passed |

The build script checks application identifiers, display names, and JavaScript bundle presence. Release builds contain a bundle; debug builds use Metro. The iOS builds target the arm64 simulator without distribution signing. Android builds target arm64-v8a.

The iOS project contains one application target, eight build configurations, and four shared schemes. CocoaPods produced matching configuration support files. Repeated generation also passed after dependency installation.

## Device checks

Development Debug, Preview Release, and Production Release install together on the Android API 35 emulator and iOS 26.5 simulator. Both release variants display the expected name, application identifier, variant key, and release mode with Metro stopped.

Each platform routes the three custom URL schemes and three application-identifier fallback schemes to the intended variant. iOS checks use cold URL launches without specifying an application. Android checks confirm each URL has exactly one matching activity among the installed apps.

Both Development Debug apps connect to Metro, render their development identifier and debug mode, and return to the same identity after reload. The repository example uses an explicit resolver for its local runtime source because Metro cannot follow this workspace's package link back to its parent directory. A separate extracted-package consumer bundles the published runtime entry without that resolver.

Expo CLI's Android variant and application selection builds and installs `developmentDebug` successfully. Its automatic scheme discovery prints an unexpanded manifest placeholder, so the documented development workflow starts Metro with an explicit variant scheme.

## Package and generation checks

The unit suite covers option validation, canonical identity selection, runtime lookup, native ownership guards, and platform transformations. Real Expo prebuild integration covers clean generation, repeated non-clean generation, variant rename/removal, and another plugin changing shared native settings.

Package verification creates the actual tarball, extracts it into a fresh consumer, checks its contents and CommonJS/ESM exports, resolves the plugin through Expo's loader, bundles the runtime entry through Metro, and runs an Android prebuild from the extracted package. Runtime imports remain separate from config-plugin code. All 92 unit tests and the root and example TypeScript checks pass.

All three experimental EAS selectors resolve the intended app-config identifiers and canonical variant locally. This does not verify EAS credential selection or a cloud build.

## Extension support validation

The repository changes from September 20, 2026 add explicit iOS extension targets. Unit tests verify suffix validation, identifier collision checks, complete Debug/Release configuration cloning, canonical base configurations, stale configuration removal, and preservation of extension settings such as `SWIFT_VERSION` and `CODE_SIGN_ENTITLEMENTS`.

The Expo prebuild integration creates a share extension with `@bacons/apple-targets@5.0.0`. Clean generation and regeneration pass with development, preview, production, and renamed local variants. The generated extension appends `.share` to each application's identifier, retains its Swift settings, and contains the same `group.$(EXPO_NATIVE_VARIANT_BUNDLE_IDENTIFIER)` entitlement placeholder as the application. The unit suite now contains 101 passing tests.

On this Expo 57 toolchain, `@bacons/apple-targets@5.0.0` throws while replacing its own extension configuration list during a repeated non-clean prebuild. Clean prebuilds pass. The failure occurs in that plugin's custom Xcode mod before `expo-native-variants` runs.

## Plugin-only API and icon validation

The September 21, 2026 API changes have 128 passing unit tests, passing root and example TypeScript checks, and passing extracted-package verification. Expo's actual Linking resolver reproduces the missing-scheme production crash before the plugin runs and resolves the intended scheme afterward.

Real Expo prebuild tests cover per-variant icons, extension compatibility, repeated non-clean generation without the extension plugin, and removal of renamed variants' owned assets. The embedded-config check executes the same Expo Constants command used by the generated Android tasks and checks iOS configuration-based selection too.

Android asset merging and resource compilation pass for `developmentDebug`, `previewRelease`, and `productionRelease`. Building those asset variants together produces three different merged `app.config` files with the expected URL schemes and identifiers. The native build validation script now checks the embedded config inside each APK and iOS app bundle.

Apple's asset compiler accepts all three example icon catalogs with each catalog selected as the primary app icon. These checks did not rerun full native app compilation, device launches, EAS cloud builds, or signing for this API change. Earlier native-build and device results above describe the previous release, not this change.

## Compatibility limits

Expo `58.0.0-preview.3` passed an isolated clean prebuild advisory check. Its native compilation and runtime behavior remain untested. The package's supported peer range stays on SDK 57.

The default Expo 57 template crashes before React Native starts when launched on iOS 27 after linking with the iOS 27 SDK. The crash identifies UIKit's scene-lifecycle assertion. The same release runs on iOS 26.5. Expo documents an [official scene-support opt-in](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md); this example does not enable or validate it.

The manual native CI workflow selects Xcode 26.6 on the macOS 26 runner. Local build results do not establish that the cloud native workflow has passed.

EAS cloud builds, provisioning profiles, signed archives, remote updates, OAuth callbacks, and integrations outside the documented initial scope remain unverified. The Android development launcher's fixed authentication scheme remains shared between installed debug clients.
