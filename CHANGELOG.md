# Changelog

## [0.5.0](https://github.com/chrispader/expo-native-variants/compare/v0.4.0...v0.5.0) (2026-10-29)


### Features

* support Expo SDK 58 ([#24](https://github.com/chrispader/expo-native-variants/issues/24)) ([e817076](https://github.com/chrispader/expo-native-variants/commit/e817076eb3d8705f8d9986a3c3e330ca82c2dec0))
* support localized display names per variant ([#12](https://github.com/chrispader/expo-native-variants/issues/12)) ([086be62](https://github.com/chrispader/expo-native-variants/commit/086be6240b1294d16447adbeeef8f75a137138a9))


### Bug Fixes

* **android:** drop stale applicationId fallback schemes when selected variant changes ([#13](https://github.com/chrispader/expo-native-variants/issues/13)) ([b017831](https://github.com/chrispader/expo-native-variants/commit/b0178319b39008accac543e955aa252d952feb6b))
* **android:** escape apostrophes in flavor app names ([#21](https://github.com/chrispader/expo-native-variants/issues/21)) ([7340fd2](https://github.com/chrispader/expo-native-variants/commit/7340fd2de1edfff93267fdb5c646ac9b76221eb1))
* **android:** ignore commented block names when editing build.gradle ([#11](https://github.com/chrispader/expo-native-variants/issues/11)) ([3d8610e](https://github.com/chrispader/expo-native-variants/commit/3d8610e4bea7789c08eefa9645fee965cfc537ff))
* **android:** reconcile generated Expo config lint dependencies ([#14](https://github.com/chrispader/expo-native-variants/issues/14)) ([553589c](https://github.com/chrispader/expo-native-variants/commit/553589c6eab9ff743125a7854550b76ab6339c4e))
* **ios:** embed the prebuild variant in plain Debug and Release builds ([#23](https://github.com/chrispader/expo-native-variants/issues/23)) ([f8631a3](https://github.com/chrispader/expo-native-variants/commit/f8631a35afc6ee21b7b12ed1310c0f3c6ba24b3b))
* **ios:** report hand-edited update channel phase and cover it with tests ([#10](https://github.com/chrispader/expo-native-variants/issues/10)) ([58304a1](https://github.com/chrispader/expo-native-variants/commit/58304a130192defed2570868e609372f47b9f05a))
* **ios:** treat variant debug configurations as debug builds ([#25](https://github.com/chrispader/expo-native-variants/issues/25)) ([95dae0b](https://github.com/chrispader/expo-native-variants/commit/95dae0bfa72160aad3fc3c5d411945b4d12547ee))
* **ios:** use variant identifiers for EAS extension credentials ([#22](https://github.com/chrispader/expo-native-variants/issues/22)) ([f1d5e4f](https://github.com/chrispader/expo-native-variants/commit/f1d5e4f7a28c05f6c1e65b4f05ef1956b320e196))
* run example commands without workspace output wrappers ([#19](https://github.com/chrispader/expo-native-variants/issues/19)) ([25d523b](https://github.com/chrispader/expo-native-variants/commit/25d523b8602669e524a899d5716ee6f972343ba0))
* treat empty NATIVE_VARIANT as unset ([#9](https://github.com/chrispader/expo-native-variants/issues/9)) ([54434a6](https://github.com/chrispader/expo-native-variants/commit/54434a6b2c80ea04002e70a5ae14775649c6ca8d))

## [0.4.0](https://github.com/chrispader/expo-native-variants/compare/v0.3.0...v0.4.0) (2026-10-21)


### Bug Fixes

* default to the development variant ([#15](https://github.com/chrispader/expo-native-variants/issues/15)) ([779832b](https://github.com/chrispader/expo-native-variants/commit/779832baf3a4d0d4b5a74eedc6372542abb6c7e4))


### Miscellaneous Chores

* release 0.4.0 ([6dff015](https://github.com/chrispader/expo-native-variants/commit/6dff015a4a9a49d77f7d8c88c09c652926421a66))

## [0.3.0](https://github.com/chrispader/expo-native-variants/compare/v0.2.0...v0.3.0) (2026-10-01)


### Features

* support per-variant update channels ([#7](https://github.com/chrispader/expo-native-variants/issues/7)) ([19c986a](https://github.com/chrispader/expo-native-variants/commit/19c986a9a5da270b323d0e362a63ae6bb76aa075))

## [0.2.0](https://github.com/chrispader/expo-native-variants/compare/v0.2.0-alpha.0...v0.2.0) (2026-09-21)


### Bug Fixes

* build package before example typecheck ([4027181](https://github.com/chrispader/expo-native-variants/commit/4027181b58aeee96d2caa5968967323d0e724dc4))


### Miscellaneous Chores

* release 0.2.0 ([8d25ada](https://github.com/chrispader/expo-native-variants/commit/8d25adafd73991aa825fa5412afa4be2b2114c24))
