import type {AndroidConfig} from 'expo/config-plugins';
import {describe, expect, it} from 'vitest';

import {reconcileAndroidManifest} from '../../src/android/manifest';

type AndroidManifest = AndroidConfig.Manifest.AndroidManifest;

describe('reconcileAndroidManifest', () => {
    it('replaces Expo URL schemes and retains third-party filters', () => {
        const manifest = createManifest([
            createUrlFilter('exp+hello-world'),
            createUrlFilter('acme'),
            createUrlFilter('oauth-callback'),
        ]);
        const result = reconcileAndroidManifest(manifest, {
            fallbackSchemes: new Set(['exp+hello-world', 'acme']),
        });
        const filters = getMainActivityFilters(result.manifest);

        expect(readSchemes(filters)).toEqual([
            'oauth-callback',
            '${nativeVariantScheme}',
            '${applicationId}',
        ]);
        expect(result.sharedSchemes).toEqual(['oauth-callback']);
        expect(filters.some(hasMainAction)).toBe(true);
    });

    it('does not duplicate its placeholder when applied repeatedly', () => {
        const first = reconcileAndroidManifest(createManifest([createUrlFilter('acme')]), {
            fallbackSchemes: new Set(['acme']),
        });
        const second = reconcileAndroidManifest(first.manifest, {
            fallbackSchemes: new Set(['acme']),
        });

        expect(readSchemes(getMainActivityFilters(second.manifest))).toEqual([
            '${nativeVariantScheme}',
            '${applicationId}',
        ]);
    });

    it('preserves another scheme in the same filter', () => {
        const filter = createUrlFilter('acme');
        filter.data?.push({$: {'android:scheme': 'oauth-callback'}});
        const result = reconcileAndroidManifest(createManifest([filter]), {
            fallbackSchemes: new Set(['acme']),
        });

        expect(readSchemes(getMainActivityFilters(result.manifest))).toEqual([
            'oauth-callback',
            '${nativeVariantScheme}',
            '${applicationId}',
        ]);
    });

    it('handles Expo appending the selected and auxiliary schemes to its generated filter', () => {
        const filter = createUrlFilter('${nativeVariantScheme}');
        filter.data?.push(
            {$: {'android:scheme': '${applicationId}'}},
            {$: {'android:scheme': 'acme'}},
            {$: {'android:scheme': 'oauth-callback'}},
        );
        const result = reconcileAndroidManifest(createManifest([filter]), {
            fallbackSchemes: new Set(['acme']),
        });
        expect(readSchemes(getMainActivityFilters(result.manifest))).toEqual([
            'oauth-callback', '${nativeVariantScheme}', '${applicationId}',
        ]);
    });

    it('still refuses compound data added to a managed filter', () => {
        const filter = createUrlFilter('${nativeVariantScheme}');
        filter.data?.push({$: {'android:scheme': '${applicationId}'}}, {$: {'android:host': 'example.com'}});
        expect(() => reconcileAndroidManifest(createManifest([filter]), {fallbackSchemes: new Set()})).toThrow('does not own');
    });

    it('rejects scheme-dependent data that cannot be separated safely', () => {
        const filter = createUrlFilter('acme');
        filter.data?.push({$: {'android:host': 'callback.example.com'}});

        expect(() =>
            reconcileAndroidManifest(createManifest([filter]), {
                fallbackSchemes: new Set(['acme']),
            }),
        ).toThrow(/compound Android intent filter/);
    });
});

function createManifest(urlFilters: AndroidIntentFilter[]): AndroidManifest {
    return {
        manifest: {
            $: {'xmlns:android': 'http://schemas.android.com/apk/res/android'},
            queries: [],
            application: [
                {
                    $: {'android:name': '.MainApplication'},
                    activity: [
                        {
                            $: {'android:name': '.MainActivity'},
                            'intent-filter': [
                                {
                                    action: [{$: {'android:name': 'android.intent.action.MAIN'}}],
                                    category: [
                                        {$: {'android:name': 'android.intent.category.LAUNCHER'}},
                                    ],
                                },
                                ...urlFilters,
                            ],
                        },
                    ],
                },
            ],
        },
    };
}

type AndroidIntentFilter = NonNullable<
    NonNullable<
        NonNullable<AndroidManifest['manifest']['application']>[number]['activity']
    >[number]['intent-filter']
>[number];

function createUrlFilter(scheme: string): AndroidIntentFilter {
    return {
        action: [{$: {'android:name': 'android.intent.action.VIEW'}}],
        category: [
            {$: {'android:name': 'android.intent.category.DEFAULT'}},
            {$: {'android:name': 'android.intent.category.BROWSABLE'}},
        ],
        data: [{$: {'android:scheme': scheme}}],
    };
}

function getMainActivityFilters(manifest: AndroidManifest): AndroidIntentFilter[] {
    return manifest.manifest.application?.[0]?.activity?.[0]?.['intent-filter'] ?? [];
}

function readSchemes(filters: readonly AndroidIntentFilter[]): readonly string[] {
    return filters.flatMap((filter) =>
        (filter.data ?? []).flatMap((entry) => {
            const scheme = entry.$?.['android:scheme'];
            return scheme === undefined ? [] : [scheme];
        }),
    );
}

function hasMainAction(filter: AndroidIntentFilter): boolean {
    return (filter.action ?? []).some(
        (action) => action.$?.['android:name'] === 'android.intent.action.MAIN',
    );
}
