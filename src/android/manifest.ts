import type {AndroidConfig} from 'expo/config-plugins';

const MANAGED_SCHEME = '${nativeVariantScheme}';
const APPLICATION_ID_SCHEME = '${applicationId}';

type AndroidManifest = AndroidConfig.Manifest.AndroidManifest;
type ManifestActivity = NonNullable<
    NonNullable<AndroidManifest['manifest']['application']>[number]['activity']
>[number];
type IntentFilter = NonNullable<ManifestActivity['intent-filter']>[number];

export interface ReconcileManifestOptions {
    readonly fallbackSchemes: ReadonlySet<string>;
}

export interface ReconcileManifestResult {
    readonly manifest: AndroidManifest;
    readonly sharedSchemes: readonly string[];
}

export function reconcileAndroidManifest(
    manifest: AndroidManifest,
    options: ReconcileManifestOptions,
): ReconcileManifestResult {
    const application = manifest.manifest.application?.[0];
    if (application === undefined) {
        throw new Error('expo-native-variants could not find the Android application manifest node.');
    }

    const mainActivity = findMainActivity(application.activity ?? []);
    const currentFilters = mainActivity['intent-filter'] ?? [];
    const retainedFilters = currentFilters.flatMap((filter) =>
        reconcileMainActivityFilter(filter, options.fallbackSchemes),
    );
    mainActivity['intent-filter'] = [...retainedFilters, createManagedIntentFilter()];

    const sharedSchemes = collectSharedSchemes(manifest, mainActivity);

    return {manifest, sharedSchemes};
}

function findMainActivity(activities: readonly ManifestActivity[]): ManifestActivity {
    const mainActivities = activities.filter((activity) =>
        (activity['intent-filter'] ?? []).some(hasMainAction),
    );

    if (mainActivities.length !== 1 || mainActivities[0] === undefined) {
        throw new Error(
            'expo-native-variants requires exactly one Android activity with the MAIN action.',
        );
    }

    return mainActivities[0];
}

function reconcileMainActivityFilter(
    filter: IntentFilter,
    fallbackSchemes: ReadonlySet<string>,
): readonly IntentFilter[] {
    if (!isBrowsableViewFilter(filter)) {
        return [filter];
    }

    const data = filter.data ?? [];
    const schemes = data.flatMap((entry) => {
        const scheme = entry.$?.['android:scheme'];
        return typeof scheme === 'string' ? [scheme] : [];
    });

    if (schemes.includes(MANAGED_SCHEME)) {
        if (isManagedFilter(filter)) {
            return [];
        }
        throw new Error(
            'expo-native-variants found its manifest placeholder in an intent filter it does not own.',
        );
    }

    const containsFallback = schemes.some((scheme) => fallbackSchemes.has(scheme));
    if (!containsFallback) {
        return [filter];
    }

    const retainedData = data.filter((entry) => {
        const scheme = entry.$?.['android:scheme'];
        return typeof scheme !== 'string' || !fallbackSchemes.has(scheme);
    });
    const retainedSchemes = retainedData.some(
        (entry) => typeof entry.$?.['android:scheme'] === 'string',
    );
    const hasSchemeDependentData = retainedData.some(
        (entry) =>
            entry.$ !== undefined &&
            Object.keys(entry.$).some((key) => key !== 'android:scheme'),
    );

    if (!retainedSchemes && hasSchemeDependentData) {
        throw new Error(
            'expo-native-variants cannot safely separate an Expo fallback scheme from a compound Android intent filter. Put third-party URL registrations in a separate intent filter.',
        );
    }
    if (retainedData.length === 0) {
        return [];
    }

    return [{...filter, data: retainedData}];
}

function collectSharedSchemes(
    manifest: AndroidManifest,
    managedActivity: ManifestActivity,
): readonly string[] {
    const sharedSchemes = new Set<string>();

    for (const application of manifest.manifest.application ?? []) {
        const activities = [
            ...(application.activity ?? []),
            ...(application['activity-alias'] ?? []),
        ];
        for (const activity of activities) {
            for (const filter of activity['intent-filter'] ?? []) {
                if (!isBrowsableViewFilter(filter) || (activity === managedActivity && isManagedFilter(filter))) {
                    continue;
                }
                for (const entry of filter.data ?? []) {
                    const scheme = entry.$?.['android:scheme'];
                    if (typeof scheme === 'string' && scheme !== MANAGED_SCHEME) {
                        sharedSchemes.add(scheme);
                    }
                }
            }
        }
    }

    return [...sharedSchemes].sort();
}

function createManagedIntentFilter(): IntentFilter {
    return {
        action: [{$: {'android:name': 'android.intent.action.VIEW'}}],
        category: [
            {$: {'android:name': 'android.intent.category.DEFAULT'}},
            {$: {'android:name': 'android.intent.category.BROWSABLE'}},
        ],
        data: [
            {$: {'android:scheme': MANAGED_SCHEME}},
            {$: {'android:scheme': APPLICATION_ID_SCHEME}},
        ],
    };
}

function isManagedFilter(filter: IntentFilter): boolean {
    const data = filter.data ?? [];
    if (!isBrowsableViewFilter(filter) || data[0]?.$?.['android:scheme'] !== MANAGED_SCHEME) {
        return false;
    }

    return (
        data.length === 1 ||
        (data.length === 2 && data[1]?.$?.['android:scheme'] === APPLICATION_ID_SCHEME)
    );
}

function isBrowsableViewFilter(filter: IntentFilter): boolean {
    return (
        (filter.action ?? []).some(
            (action) => action.$?.['android:name'] === 'android.intent.action.VIEW',
        ) &&
        (filter.category ?? []).some(
            (category) => category.$?.['android:name'] === 'android.intent.category.DEFAULT',
        ) &&
        (filter.category ?? []).some(
            (category) => category.$?.['android:name'] === 'android.intent.category.BROWSABLE',
        )
    );
}

function hasMainAction(filter: IntentFilter): boolean {
    return (filter.action ?? []).some(
        (action) => action.$?.['android:name'] === 'android.intent.action.MAIN',
    );
}
