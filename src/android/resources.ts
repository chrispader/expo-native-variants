import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, rmdir, unlink, writeFile} from 'node:fs/promises';
import path from 'node:path';

import type {NormalizedNativeVariantsOptions} from '../options';

const GENERATED_FILE_NAME = 'native_variants.xml';
const MARKER_PREFIX = 'expo-native-variants:generated ';

export async function reconcileAndroidVariantResources(
    androidProjectRoot: string,
    options: NormalizedNativeVariantsOptions,
): Promise<void> {
    const sourceRoot = path.join(androidProjectRoot, 'app', 'src');
    const expectedFlavors = new Set(options.variants.map(({androidFlavor}) => androidFlavor));

    await removeStaleResources(sourceRoot, expectedFlavors);
    for (const variant of options.variants) {
        const valuesDirectory = path.join(sourceRoot, variant.androidFlavor, 'res', 'values');
        const filePath = path.join(valuesDirectory, GENERATED_FILE_NAME);
        await assertNoAppNameCollision(valuesDirectory, filePath);
        await assertGeneratedFileIsSafeToReplace(filePath);
        await mkdir(valuesDirectory, {recursive: true});
        await writeFile(filePath, createResourceFile(variant.displayName), 'utf8');
    }
}

function createResourceFile(displayName: string): string {
    const body = `<resources>\n    <string name="app_name">${escapeXml(displayName)}</string>\n</resources>\n`;
    const hash = hashContent(body);
    return `<?xml version="1.0" encoding="utf-8"?>\n<!-- ${MARKER_PREFIX}${hash} -->\n${body}`;
}

async function removeStaleResources(
    sourceRoot: string,
    expectedFlavors: ReadonlySet<string>,
): Promise<void> {
    const entries = await readDirectoryIfPresent(sourceRoot);
    for (const entry of entries) {
        if (!entry.isDirectory() || expectedFlavors.has(entry.name)) {
            continue;
        }

        const flavorDirectory = path.join(sourceRoot, entry.name);
        const resourceDirectory = path.join(flavorDirectory, 'res');
        const valuesDirectory = path.join(resourceDirectory, 'values');
        const filePath = path.join(valuesDirectory, GENERATED_FILE_NAME);
        const existing = await readTextIfPresent(filePath);
        if (existing === undefined) {
            continue;
        }

        assertGeneratedContentIsUnmodified(existing, filePath);
        await unlink(filePath);
        await removeDirectoryIfEmpty(valuesDirectory);
        await removeDirectoryIfEmpty(resourceDirectory);
        await removeDirectoryIfEmpty(flavorDirectory);
    }
}

async function assertNoAppNameCollision(
    valuesDirectory: string,
    generatedFilePath: string,
): Promise<void> {
    const entries = await readDirectoryIfPresent(valuesDirectory);
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.xml')) {
            continue;
        }
        const filePath = path.join(valuesDirectory, entry.name);
        if (filePath === generatedFilePath) {
            continue;
        }
        const contents = await readFile(filePath, 'utf8');
        if (/<string\s+[^>]*name\s*=\s*["']app_name["'][^>]*>/m.test(contents)) {
            throw new Error(
                `expo-native-variants cannot write ${generatedFilePath} because ${filePath} already defines app_name.`,
            );
        }
    }
}

async function assertGeneratedFileIsSafeToReplace(filePath: string): Promise<void> {
    const existing = await readTextIfPresent(filePath);
    if (existing !== undefined) {
        assertGeneratedContentIsUnmodified(existing, filePath);
    }
}

function assertGeneratedContentIsUnmodified(contents: string, filePath: string): void {
    const lines = contents.split('\n');
    const markerMatch = /^<!-- expo-native-variants:generated ([a-f0-9]{16}) -->$/.exec(
        lines[1] ?? '',
    );
    const body = lines.slice(2).join('\n');
    if (markerMatch?.[1] === undefined || hashContent(body) !== markerMatch[1]) {
        throw new Error(
            `expo-native-variants will not replace ${filePath} because it is not an unmodified generated resource file.`,
        );
    }
}

async function readDirectoryIfPresent(directory: string): Promise<readonly import('node:fs').Dirent[]> {
    try {
        return await readdir(directory, {withFileTypes: true});
    } catch (error) {
        if (isMissingFileError(error)) {
            return [];
        }
        throw error;
    }
}

async function readTextIfPresent(filePath: string): Promise<string | undefined> {
    try {
        return await readFile(filePath, 'utf8');
    } catch (error) {
        if (isMissingFileError(error)) {
            return undefined;
        }
        throw error;
    }
}

async function removeDirectoryIfEmpty(directory: string): Promise<void> {
    try {
        await rmdir(directory);
    } catch (error) {
        if (isMissingFileError(error) || isNonEmptyDirectoryError(error)) {
            return;
        }
        throw error;
    }
}

function isMissingFileError(error: unknown): boolean {
    return isNodeError(error) && error.code === 'ENOENT';
}

function isNonEmptyDirectoryError(error: unknown): boolean {
    return isNodeError(error) && (error.code === 'ENOTEMPTY' || error.code === 'EEXIST');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error;
}

function hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}
