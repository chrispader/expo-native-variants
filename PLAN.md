# expo-native-variants implementation plan

Expo's usual variant setup regenerates the native project for the selected environment. This package will generate every configured variant together, so developers can switch schemes or flavors while keeping `ios/` and `android/` generated and ignored by Git.

Status: implemented on September 19, 2026. This plan incorporates an Astra architecture assessment and checks against released packages. Implementation used GPT-5.6-Sol subagents. The source is public on GitHub, and `0.1.0-alpha.0` is published under the npm `next` tag. The repository uses Bun for package management.

## Viability and support boundary

The core feature is viable as a config plugin. Expo provides native project modification hooks, and both platforms already support the required variants. The work is generating and maintaining the right native configuration through those hooks. The initial assessment used documentation and source inspection; implementation validation now includes compiled native apps. [Expo mods](https://docs.expo.dev/config-plugins/mods/)

The first supported setup will be an Expo-generated project with one iOS application target, the standard Android Groovy template, and a shared native dependency graph. One prebuild generates all variants. Switching between them requires a build of the selected variant, but no further prebuild or local variant environment variable. Native dependency or configuration changes still require regeneration.

| Capability | Proposed first-release commitment |
| --- | --- |
| All variants generated together | Required on iOS and Android |
| Separate identifiers, display names, and URL schemes | Required, with side-by-side installation tests |
| Xcode schemes and Android Studio variants | Primary supported local workflows |
| Expo CLI selection | Document only combinations verified against the supported CLI version |
| Runtime variant detection | Use the installed application identifier through an optional JavaScript helper |
| EAS builds with ignored native folders | Separate compatibility milestone, including credential preflight |
| Arbitrary per-variant Expo configuration | Outside the initial API |
| Icons, Firebase files, update channels, entitlements | Follow-up integrations with their own tests |
| iOS extension targets | Implemented for explicitly configured app-extension and ExtensionKit targets |

### Limits that affect the design

**Expo still evaluates one app config.** A plugin can generate several native configurations, but it cannot automatically rerun every other plugin with different options for each variant. Settings consumed by arbitrary plugins, native dependencies, and generated source code remain shared unless this package adds a specific integration. Do not expose `Partial<ExpoConfig>` per variant and imply that every field works.

**iOS schemes do not guarantee correct Expo CLI selection.** In the released `@expo/cli` 57.0.26 package, iOS selection defaults to literal `Debug` unless a configuration is supplied. Environment-mode selection also checks for literal `Release`. A scheme pointing at `Release-Preview` therefore does not make scheme-only invocation reliable, and an explicit custom configuration still needs testing for correct bundling behavior. The initial guarantee is Xcode and native builds. Do not silently patch consumer dependencies to broaden it. [Expo configuration resolution](https://github.com/expo/expo/blob/main/packages/%40expo/cli/src/run/ios/options/resolveOptions.ts), [Expo iOS execution](https://github.com/expo/expo/blob/main/packages/%40expo/cli/src/run/ios/runIosAsync.ts)

**EAS needs more than generated schemes.** Inspection of released EAS CLI 24.7.0 confirms that its managed workflow selects the canonical scheme from `expo.name` and reads application identifiers from app config. Credential selection can happen before the generated project exists. A cloud-only scheme change cannot correct an identifier selected earlier. [EAS scheme resolution](https://github.com/expo/eas-cli/blob/main/packages/eas-cli/src/project/ios/scheme.ts), [EAS bundle identifier resolution](https://github.com/expo/eas-cli/blob/main/packages/eas-cli/src/project/ios/bundleIdentifier.ts)

**JavaScript environment values do not follow native scheme selection.** Bundled `EXPO_PUBLIC_*` values and `extra` are not a dependable source of the installed variant's identity. Use the native application identifier to select a public runtime configuration map. A release bundle or update can still contain its own build-time configuration, which the plugin does not rewrite. [Expo environment variables](https://docs.expo.dev/guides/environment-variables/)

**Third-party integrations need explicit support.** Unique identifiers do not automatically configure OAuth callbacks, associated domains, push provisioning, app groups, Firebase, or update routing. Extension target configuration is now explicit and limited to bundle identifiers plus complete configuration cloning; target creation remains the responsibility of a target-generating plugin. The initial example leaves remote updates disabled. Installing `expo-updates` does not imply that channels are isolated by flavor; documentation and diagnostics must make any shared update configuration explicit. [Expo Updates configuration](https://docs.expo.dev/versions/latest/sdk/updates/)

## Proposed public configuration

Use `expo-native-variants` as the package name and `withNativeVariants` as the plugin export. Register it through the standard Expo `plugins` array with these options:

```json
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
```

The keys are user-defined, not limited to these three environments. `applicationId` supplies both platforms, with optional `ios.bundleIdentifier` and `android.applicationId` overrides. An optional `ios.xcodeScheme` can override the generated build-scheme name without confusing it with the deep-link scheme. Android flavor names derive from validated variant keys.

`defaultVariant` supplies the effective canonical variant locally. The optional EAS helper supplies an explicit, validated profile selection instead. The effective canonical variant controls the base Expo identifiers, canonical native scheme, and ordinary Debug/Release configurations. Conflicting identifiers produce an actionable error. Neither selection reduces the set of generated variants.

Keep environment identity separate from build mode. Every variant gets debug and release builds. `runMode` selects the Xcode scheme's Run default, with debug as the default if omitted. It does not remove other build combinations or select an Android task implicitly.

| Variant | iOS configurations | Shared scheme | Android variants |
| --- | --- | --- | --- |
| development | `Debug-Development`, `Release-Development` | `Acme-Development` | `developmentDebug`, `developmentRelease` |
| preview | `Debug-Preview`, `Release-Preview` | `Acme-Preview` | `previewDebug`, `previewRelease` |
| production | `Debug-Production`, `Release-Production` | `Acme-Production` | `productionDebug`, `productionRelease` |

Debug and release builds of the same variant share its identifier and replace each other when installed. The three environment variants can coexist.

## Implementation sequence

### 1. Prove native feasibility before building the full API

Pin an example to Expo 57.0.24 and record the exact Expo CLI, React Native, CocoaPods, Xcode, Gradle, and Android plugin versions. The registry currently lists Expo 57.0.24 as stable and 58.0.0-preview.3 as the preview release. Begin with SDK 57; run SDK 58 as an advisory compatibility check.

Create the smallest generator that produces the table above from one prebuild. Include `expo-dev-client` and `expo-application` in the example so the spike exercises real development behavior and runtime identity.

The spike must prove all of the following before platform implementation expands:

- Every variant builds in both debug and release mode on both platforms.
- Debug builds connect to Metro and support reload; release builds launch with Metro stopped.
- Identifiers and display names in built artifacts match the selected variant.
- All three variants can be installed together, and switching between builds does not run prebuild again.
- CocoaPods and Expo's generated scripts interpret each custom iOS configuration correctly.

Also exercise Expo CLI with explicit configuration and application selection. Record failures as a support limit instead of treating successful Xcode builds as proof of CLI support. If correct native debug/release behavior itself requires dependency patches or manual native edits, stop and revise the architecture before proceeding.

### 2. Establish the package and shared generator contract

Use TypeScript with one normalization and validation stage feeding both platforms. Validate nonempty variants, the default and effective canonical keys, platform identifiers, naming collisions after normalization, duplicate URL schemes, reserved names, and unsafe file names. Reject duplicate effective application identifiers independently on each platform after applying overrides. Keep normalized data immutable and avoid exposing parser-specific objects to the public API.

Compile the plugin to CommonJS, expose a root `app.plugin.js`, and import plugin APIs through `expo/config-plugins`. Publish type declarations and separate Node configuration code from runtime JavaScript so Metro cannot accidentally import native-project tooling. Declare a bounded Expo compatibility range based on the builds that pass. [Expo plugin development](https://docs.expo.dev/config-plugins/development-and-debugging/)

Use a compact repository layout with `src/options`, `src/android`, `src/ios`, optional `src/runtime` and `src/config` entries, a generated-native example, and focused fixtures. Keep compiled output out of Git and include it in the published package. Example native folders remain ignored; small purpose-built native test fixtures can be committed.

### 3. Implement both native generators

The Android generator adds one owned flavor dimension with full application IDs while preserving the source namespace and Java/Kotlin package. It writes flavor-specific names and manifest settings, retains the existing debug/release build types, and adds every generated debug combination to `react.debuggableVariants`. Release combinations must still bundle JavaScript. Full IDs also avoid EAS's documented limitations detecting identifier suffixes. [Expo variant guidance](https://docs.expo.dev/build-reference/variants/), [React Native Gradle plugin](https://reactnative.dev/docs/react-native-gradle-plugin#debuggablevariants)

Use guarded, tagged edits to the supported Groovy template and owned resource files. Reject unsupported Kotlin DSL projects, conflicting existing flavors, or additional flavor dimensions with a useful diagnostic. Test actual Expo module dependency resolution, including flavor matching, rather than relying on generated Gradle text alone. [Android dependency matching](https://developer.android.com/build/build-variants#resolve_matching_errors)

The iOS generator keeps one application target and a stable product name. It clones the existing Debug and Release settings at both project and target levels, then overrides only supported variant fields. Set the home-screen name through an `Info.plist` build-setting placeholder. Preserve compiler flags, inherited settings, build phases, and unrelated target references.

Add explicit CocoaPods `:debug` and `:release` mappings before dependency installation. Ensure each new configuration uses the right generated CocoaPods settings rather than retaining a stale base-configuration reference. Unmapped configurations default to release in CocoaPods. [CocoaPods configuration mapping](https://guides.cocoapods.org/syntax/podfile.html#project)

Generate shared schemes using the existing application target UUID. Run uses `runMode`; Test and Analyze use the variant's debug configuration; Profile and Archive use release. Do not invent test targets. Explicitly configured extension targets receive the same configuration matrix after their target-generating plugins run. Existing native test targets remain unsupported; future test-target support must generate matching configurations and verify the scheme's Test action. Audit configuration-name checks in React Native, Hermes, Expo Constants, and development-client scripts against the pinned versions.

Both generators must isolate the package's URL registrations for each variant, including identifiers that Expo otherwise adds as fallback schemes. Handle development-client launch URLs explicitly. Preserve unrelated integrations and report remaining shared registrations that can cause ambiguous routing. [Expo deep linking](https://docs.expo.dev/linking/into-your-app/)

### 4. Make repeated generation and runtime selection reliable

Track only package-owned configurations, schemes, Gradle sections, and generated files. Reconcile additions, updates, renamed variants, and removals. Refuse to overwrite conflicting user-owned content. Removing the plugin entirely requires a clean regeneration to remove its native output.

Use Expo's project/XML/plist interfaces and ordered mods. Keep arbitrary file writes out of app-config evaluation. Test the actual mod execution order, including another plugin modifying the same base settings; placing this plugin last in an array alone is not sufficient evidence of compatibility.

Provide an optional pure JavaScript `getNativeVariant` helper that accepts `Application.applicationId` and the shared variant map. It needs no new Swift/Kotlin module and no mandatory runtime dependency for plugin-only consumers. Unknown identifiers return an explicit unknown result; web and Expo Go never silently become production. The example uses the resolved variant to show its identity and select public endpoint settings. [Expo Application API](https://docs.expo.dev/versions/latest/sdk/application/#applicationapplicationid)

### 5. Prove an explicit EAS integration

Keep local generation independent of environment selection. For EAS only, prototype an app-config helper that validates the selected variant, sets it as the effective canonical variant, and exposes its scalar identifiers before EAS credential preflight while continuing to generate the full native matrix. The same validated selection must reach the native generator so metadata and native aliases agree.

Use a nonsecret variant selector declared in each EAS profile and passed through dynamic app config. Do not rely solely on `EAS_BUILD_PROFILE`: Expo documents that built-in build variables are unavailable during local app-config evaluation. This is a cloud-profile integration detail, not a requirement to change the local shell environment or regenerate native folders when switching locally. [EAS environment availability](https://docs.expo.dev/eas/environment-variables/usage/)

On iOS, test a canonical scheme with ordinary Debug/Release configurations bound to the selected EAS variant while retaining every custom local scheme. Keep the target/product name stable. On Android, select the full flavor task and verify that EAS's preflight identifier matches the resulting artifact. Check that EAS signing configuration does not leak a selected provisioning profile into other variants.

Freeze this helper's API only after inspecting the submitted build job and generated project for all profiles. Then verify real simulator/cloud artifacts and a signed device/archive path when credentials are available. Inspection alone does not prove provisioning or successful cloud builds.

If this approach fails on the supported EAS version, label EAS unsupported for the local-only prerelease and return the concrete limitation for review. Do not silently replace the design with committed native folders, hidden environment switching, or a custom build wrapper. EAS support must be verified before advertising it.

### 6. Validate the package as a consumer would use it

Use unit tests for validation and meaningful transformation rules, fixture assertions for generated project structure, and integration tests that invoke real prebuild. Required cases include repeated non-clean prebuilds, clean regeneration, variant removal/renaming, plugin ordering, conflicting native content, and path/name escaping.

Compare owned files and semantic project structure across clean generations; unrelated generated UUID differences should not produce false failures. Repeated generation in the same project must not accumulate duplicate configurations, schemes, or Gradle blocks.

Release checks must compile all six Android combinations and six iOS variant configurations, inspect packaged metadata, and exercise side-by-side launch and deep links. Run release apps offline. Verify that the runtime helper continues to identify the installed binary regardless of app-config metadata.

Set up Linux CI for package checks, generation, and Android builds, with macOS CI for CocoaPods and iOS simulator builds. Keep slower complete build checks as a release gate. Test SDK 58 separately until its matrix passes, and publish a specific compatibility table rather than claiming every Expo version works.

Finally, install the packed package into a clean consumer and repeat generation. Verify CommonJS plugin resolution, declarations, runtime-entry isolation, and package contents. The published archive must contain the compiled plugin, entry points, declarations, license, and README, without example native builds or credentials.

### 7. Publish on GitHub and npm

Use a public `chrispader/expo-native-variants` repository and the unscoped npm name, subject to availability at release time. GitHub authentication currently identifies `chrispader`; no local remote exists and that repository lookup returned 404. The npm package lookup also returned 404, which indicates no published package currently occupies the name but does not reserve it.

Propose the MIT license, a README showing the supported native workflows, a compatibility table, limitations, a working example, and contribution/release guidance. Use conventional commits and attempt signing with the configured key. Keep the initial branch focused on the package.

The source is public and `0.1.0-alpha.0` is published under the `next` tag. Version `0.0.0` remains the `latest` package and contains only `package.json`. Verify the prerelease in consumer projects before considering a stable release. Create matching GitHub releases when stable implementation versions are released.

Use GitHub Actions trusted publishing with OIDC and provenance for subsequent releases. Account ownership, initial package bootstrap, any required two-factor challenge, and the trusted-publisher connection must be completed using the actual account at release time. Do not assume credentials or an existing publisher connection. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)

## Implementation ownership after approval

Start with one GPT-5.6-Sol subagent for the feasibility spike and shared contract. Once that contract is stable, use three GPT-5.6-Sol subagents with separate file ownership for Android, iOS, and package/runtime/integration tests. The coordinating agent integrates the changes and checks the support claims; a subsequent Sol review examines cross-platform behavior and release readiness.

The first checkpoint was native feasibility, the second was reproducible side-by-side operation, and the last was an installable prerelease with accurate support claims. All three checkpoints are complete.
