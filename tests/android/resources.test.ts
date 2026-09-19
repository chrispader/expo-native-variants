import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {reconcileAndroidVariantResources} from '../../src/android/resources';
import type {NormalizedNativeVariantsOptions} from '../../src/options';

const OPTIONS: NormalizedNativeVariantsOptions = {
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
            displayName: 'Acme & Dev',
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

describe('reconcileAndroidVariantResources', () => {
    it('writes flavor app names and removes stale generated resources', async () => {
        const root = await createAndroidProjectRoot();
        await reconcileAndroidVariantResources(root, OPTIONS);
        const developmentFile = resourceFile(root, 'development');

        await expect(readFile(developmentFile, 'utf8')).resolves.toContain('Acme &amp; Dev');

        const renamedOptions = {
            ...OPTIONS,
            variants: [OPTIONS.variants[1]!],
        } satisfies NormalizedNativeVariantsOptions;
        await reconcileAndroidVariantResources(root, renamedOptions);

        await expect(readFile(developmentFile, 'utf8')).rejects.toMatchObject({code: 'ENOENT'});
        await expect(readFile(resourceFile(root, 'production'), 'utf8')).resolves.toContain(
            '<string name="app_name">Acme</string>',
        );
    });

    it('is stable when applied repeatedly', async () => {
        const root = await createAndroidProjectRoot();
        await reconcileAndroidVariantResources(root, OPTIONS);
        const before = await readFile(resourceFile(root, 'development'), 'utf8');

        await reconcileAndroidVariantResources(root, OPTIONS);

        await expect(readFile(resourceFile(root, 'development'), 'utf8')).resolves.toBe(before);
    });

    it('rejects user edits to a generated resource', async () => {
        const root = await createAndroidProjectRoot();
        await reconcileAndroidVariantResources(root, OPTIONS);
        const filePath = resourceFile(root, 'development');
        const contents = await readFile(filePath, 'utf8');
        await writeFile(filePath, contents.replace('Acme &amp; Dev', 'User edit'), 'utf8');

        await expect(reconcileAndroidVariantResources(root, OPTIONS)).rejects.toThrow(
            /not an unmodified generated resource file/,
        );
    });

    it('rejects another flavor resource that already defines app_name', async () => {
        const root = await createAndroidProjectRoot();
        const valuesDirectory = path.dirname(resourceFile(root, 'development'));
        await mkdir(valuesDirectory, {recursive: true});
        await writeFile(
            path.join(valuesDirectory, 'strings.xml'),
            '<resources><string name="app_name">Existing</string></resources>',
            'utf8',
        );

        await expect(reconcileAndroidVariantResources(root, OPTIONS)).rejects.toThrow(
            /already defines app_name/,
        );
    });
});

async function createAndroidProjectRoot(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'expo-native-variants-'));
    await mkdir(path.join(root, 'app', 'src'), {recursive: true});
    return root;
}

function resourceFile(root: string, flavor: string): string {
    return path.join(root, 'app', 'src', flavor, 'res', 'values', 'native_variants.xml');
}
