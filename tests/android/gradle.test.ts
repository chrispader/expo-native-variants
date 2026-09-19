import {AndroidConfig} from 'expo/config-plugins';
import {describe, expect, it} from 'vitest';

import {reconcileAppBuildGradle} from '../../src/android/gradle';
import type {NormalizedNativeVariantsOptions} from '../../src/options';

const OPTIONS: NormalizedNativeVariantsOptions = {
    iosTargets: [],
    canonicalVariant: {
        androidApplicationId: 'com.acme.app',
        androidFlavor: 'production',
        debugConfiguration: 'Debug-Production',
        displayName: 'Acme',
        iosBundleIdentifier: 'com.acme.app',
        iosScheme: 'Acme-Production',
        key: 'production',
        releaseConfiguration: 'Release-Production',
        runMode: 'release',
        urlScheme: 'acme',
    },
    variants: [
        {
            androidApplicationId: 'com.acme.app.dev',
            androidFlavor: 'development',
            debugConfiguration: 'Debug-Development',
            displayName: 'Acme Dev',
            iosBundleIdentifier: 'com.acme.app.dev',
            iosScheme: 'Acme-Development',
            key: 'development',
            releaseConfiguration: 'Release-Development',
            runMode: 'debug',
            urlScheme: 'acme-dev',
        },
        {
            androidApplicationId: 'com.acme.app',
            androidFlavor: 'production',
            debugConfiguration: 'Debug-Production',
            displayName: 'Acme',
            iosBundleIdentifier: 'com.acme.app',
            iosScheme: 'Acme-Production',
            key: 'production',
            releaseConfiguration: 'Release-Production',
            runMode: 'release',
            urlScheme: 'acme',
        },
    ],
};

const EXPO_GRADLE = `apply plugin: "com.android.application"
apply plugin: "com.facebook.react"

react {
    entryFile = file("index.js")
    // debuggableVariants = ["liteDebug", "prodDebug"]
    def example = "a brace in a string: }"
}

android {
    namespace "com.helloworld"
    defaultConfig {
        applicationId "com.helloworld"
    }
    buildTypes {
        debug {
        }
        release {
        }
    }
}
`;

describe('reconcileAppBuildGradle', () => {
    it('generates full application IDs and debug-only React variants', () => {
        const result = reconcileAppBuildGradle(EXPO_GRADLE, OPTIONS);

        expect(result).toContain('flavorDimensions += "nativeVariant"');
        expect(result).toContain('applicationId("com.acme.app.dev")');
        expect(result).toContain('applicationId("com.acme.app")');
        expect(result).toContain(
            'debuggableVariants = ["developmentDebug", "developmentDebugOptimized", "productionDebug", "productionDebugOptimized"]',
        );
        expect(result).not.toContain('developmentRelease"');
        expect(result).not.toContain('resValue');
        expect(result).toContain('namespace "com.helloworld"');
        expect(result).toContain('applicationId "com.helloworld"');
    });

    it('is stable when applied repeatedly', () => {
        const first = reconcileAppBuildGradle(EXPO_GRADLE, OPTIONS);
        const second = reconcileAppBuildGradle(first, OPTIONS);

        expect(second).toBe(first);
        expect(second.match(/productFlavors/g)).toHaveLength(1);
    });

    it('survives Expo reapplying the canonical package on a non-clean prebuild', () => {
        const first = reconcileAppBuildGradle(EXPO_GRADLE, OPTIONS);
        const afterExpoPackageMod = AndroidConfig.Package.setPackageInBuildGradle(
            {android: {package: 'com.helloworld'}},
            first,
        );

        expect(() => reconcileAppBuildGradle(afterExpoPackageMod, OPTIONS)).not.toThrow();
        expect(afterExpoPackageMod).toContain('applicationId("com.acme.app.dev")');
    });

    it('retains a simple existing debuggableVariants list', () => {
        const source = EXPO_GRADLE.replace(
            '    entryFile = file("index.js")',
            '    entryFile = file("index.js")\n    debuggableVariants = ["benchmarkDebug"]',
        );
        const result = reconcileAppBuildGradle(source, OPTIONS);

        expect(result).toContain(
            'debuggableVariants = ["benchmarkDebug", "developmentDebug", "developmentDebugOptimized", "productionDebug", "productionDebugOptimized"]',
        );
    });

    it('marks Expo debugOptimized flavor combinations as debuggable', () => {
        const source = EXPO_GRADLE.replace(
            '        release {',
            `        debugOptimized {
            initWith debug
            matchingFallbacks = ["debug"]
        }
        release {`,
        );
        const result = reconcileAppBuildGradle(source, OPTIONS);

        expect(result).toContain('"developmentDebugOptimized"');
        expect(result).toContain('"productionDebugOptimized"');
        expect(result).not.toContain('productionRelease"');
    });

    it('removes renamed flavors without retaining stale debug variants', () => {
        const first = reconcileAppBuildGradle(EXPO_GRADLE, OPTIONS);
        const renamed = {
            ...OPTIONS,
            variants: [OPTIONS.variants[1]!],
        } satisfies NormalizedNativeVariantsOptions;
        const result = reconcileAppBuildGradle(first, renamed);

        expect(result).not.toContain('development {');
        expect(result).not.toContain('developmentDebug');
        expect(result).toContain('productionDebug');
    });

    it('rejects foreign flavors', () => {
        const source = EXPO_GRADLE.replace(
            '    namespace "com.helloworld"',
            '    namespace "com.helloworld"\n    flavorDimensions += "foreign"',
        );

        expect(() => reconcileAppBuildGradle(source, OPTIONS)).toThrow(
            /without existing Android flavor dimensions/,
        );
    });

    it('rejects incompatible debuggableVariants expressions', () => {
        const source = EXPO_GRADLE.replace(
            '    entryFile = file("index.js")',
            '    entryFile = file("index.js")\n    debuggableVariants = computeDebugVariants()',
        );

        expect(() => reconcileAppBuildGradle(source, OPTIONS)).toThrow(
            /one-line list of string literals/,
        );
    });

    it('rejects edits inside a managed block', () => {
        const first = reconcileAppBuildGradle(EXPO_GRADLE, OPTIONS);
        const modified = first.replace(
            'applicationId("com.acme.app.dev")',
            'applicationId("bad.id")',
        );

        expect(() => reconcileAppBuildGradle(modified, OPTIONS)).toThrow(
            /generated contents were modified/,
        );
    });
});
