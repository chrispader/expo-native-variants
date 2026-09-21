import {createHash} from 'node:crypto';

import type {NormalizedNativeVariantsOptions} from '../options';
import {createExpoConfigGradle} from './expoConfig';

const PLUGIN_NAME = 'expo-native-variants';
const REACT_BLOCK_NAME = 'react';
const ANDROID_BLOCK_NAME = 'android';
const EXPO_GENERATED_DEBUG_BUILD_TYPES = ['debug', 'debugOptimized'] as const;

type ManagedBlockName = 'react' | 'android';

interface ManagedBlock {
    readonly content: string;
    readonly metadata: string;
    readonly range: readonly [start: number, end: number];
}

interface NamedBlock {
    readonly bodyEnd: number;
    readonly bodyStart: number;
}
export function reconcileAppBuildGradle(
    source: string,
    options: NormalizedNativeVariantsOptions,
): string {
    const withoutAndroidBlock = removeManagedBlock(source, ANDROID_BLOCK_NAME);
    const androidBlock = findNamedBlock(withoutAndroidBlock.source, ANDROID_BLOCK_NAME);
    assertNoForeignFlavors(
        withoutAndroidBlock.source.slice(androidBlock.bodyStart, androidBlock.bodyEnd),
    );

    const withoutReactBlock = removeManagedBlock(withoutAndroidBlock.source, REACT_BLOCK_NAME);
    const existingDebuggableVariants = readExistingDebuggableVariants(
        withoutReactBlock.source,
        withoutReactBlock.managedBlock,
    );
    const sourceWithoutDebuggableVariants = removeExistingDebuggableVariants(
        withoutReactBlock.source,
    );

    const debugBuildTypes = readDebugBuildTypes(sourceWithoutDebuggableVariants);
    const reactContent = createReactContent(
        options,
        existingDebuggableVariants,
        debugBuildTypes,
    );
    const withReactContent = insertManagedContent(
        sourceWithoutDebuggableVariants,
        REACT_BLOCK_NAME,
        reactContent,
        encodeMetadata(existingDebuggableVariants),
    );
    const androidContent = createAndroidContent(options);

    return insertManagedContent(withReactContent, ANDROID_BLOCK_NAME, androidContent, '');
}

function createReactContent(
    options: NormalizedNativeVariantsOptions,
    existingDebuggableVariants: readonly string[],
    debugBuildTypes: readonly string[],
): string {
    const generatedVariants = options.variants.flatMap(({androidFlavor}) =>
        debugBuildTypes.map(
            (buildType) => `${androidFlavor}${buildType[0]?.toUpperCase()}${buildType.slice(1)}`,
        ),
    );
    const variants = [...new Set([...existingDebuggableVariants, ...generatedVariants])].sort();
    const serializedVariants = variants.map(quoteGroovy).join(', ');

    return `    debuggableVariants = [${serializedVariants}]`;
}

function readDebugBuildTypes(source: string): readonly string[] {
    const buildTypesBlock = findNamedBlock(source, 'buildTypes');
    const body = source.slice(buildTypesBlock.bodyStart, buildTypesBlock.bodyEnd);
    const buildTypeNames = findDirectChildBlockNames(body);
    const debugBuildTypes = [
        ...new Set([
            ...EXPO_GENERATED_DEBUG_BUILD_TYPES,
            ...buildTypeNames.filter((name) => /^debug(?:[A-Z0-9_].*)?$/.test(name)),
        ]),
    ];

    if (!debugBuildTypes.includes('debug')) {
        throw new Error(
            `${PLUGIN_NAME} requires the standard Android debug build type.`,
        );
    }

    return debugBuildTypes;
}

function findDirectChildBlockNames(source: string): readonly string[] {
    const names: string[] = [];
    let index = 0;

    while (index < source.length) {
        const match = /^[ \t]*([A-Za-z][A-Za-z0-9_]*)[ \t]*\{/m.exec(source.slice(index));
        if (match === null || match[1] === undefined) {
            break;
        }
        const matchIndex = index + match.index;
        const openingBrace = source.indexOf('{', matchIndex);
        const closingBrace = findClosingBrace(source, openingBrace);
        names.push(match[1]);
        index = closingBrace + 1;
    }

    return names;
}

function createAndroidContent(options: NormalizedNativeVariantsOptions): string {
    const flavors = options.variants
        .map(
            ({androidApplicationId, androidFlavor, urlScheme}) => `        ${androidFlavor} {
            dimension ${quoteGroovy('nativeVariant')}
            applicationId(${quoteGroovy(androidApplicationId)})
            manifestPlaceholders[${quoteGroovy('nativeVariantScheme')}] = ${quoteGroovy(urlScheme)}
        }`,
        )
        .join('\n');

    return `    flavorDimensions += ${quoteGroovy('nativeVariant')}
    productFlavors {
${flavors}
    }

${createExpoConfigGradle(options)}`;
}

function quoteGroovy(value: string): string {
    const escaped = value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    return `"${escaped}"`;
}

function assertNoForeignFlavors(androidBody: string): void {
    if (/^\s*flavorDimensions\b/m.test(androidBody) || /^\s*productFlavors\s*\{/m.test(androidBody)) {
        throw new Error(
            `${PLUGIN_NAME} supports only projects without existing Android flavor dimensions or product flavors. Remove the foreign flavor configuration or generate a clean Expo Android project.`,
        );
    }
}

function readExistingDebuggableVariants(
    source: string,
    previousManagedBlock: ManagedBlock | undefined,
): readonly string[] {
    if (previousManagedBlock !== undefined) {
        return decodeMetadata(previousManagedBlock.metadata);
    }

    const reactBlock = findNamedBlock(source, REACT_BLOCK_NAME);
    const body = source.slice(reactBlock.bodyStart, reactBlock.bodyEnd);
    const assignments = [...body.matchAll(/^\s*debuggableVariants\s*=\s*(.+)$/gm)];

    if (assignments.length === 0) {
        return [];
    }
    if (assignments.length > 1) {
        throw new Error(`${PLUGIN_NAME} found more than one react.debuggableVariants assignment.`);
    }

    const expression = assignments[0]?.[1]?.trim();
    if (expression === undefined) {
        return [];
    }

    return parseStringList(expression);
}

function parseStringList(expression: string): readonly string[] {
    const listMatch = /^\[(.*)]\s*;?$/.exec(expression);
    if (listMatch === null) {
        throw new Error(
            `${PLUGIN_NAME} can merge react.debuggableVariants only when it is a one-line list of string literals.`,
        );
    }

    const contents = listMatch[1]?.trim() ?? '';
    if (contents.length === 0) {
        return [];
    }

    const values: string[] = [];
    let remainder = contents;
    const itemPattern = /^\s*(["'])([^"'\\]*(?:\\.[^"'\\]*)*)\1\s*(?:,|$)/;

    while (remainder.length > 0) {
        const match = itemPattern.exec(remainder);
        if (match === null || match[2] === undefined) {
            throw new Error(
                `${PLUGIN_NAME} can merge react.debuggableVariants only when it contains plain string literals.`,
            );
        }
        values.push(unescapeGroovyString(match[2]));
        remainder = remainder.slice(match[0].length);
    }

    return [...new Set(values)];
}

function unescapeGroovyString(value: string): string {
    return value.replace(/\\([\\"'])/g, '$1');
}

function removeExistingDebuggableVariants(source: string): string {
    const reactBlock = findNamedBlock(source, REACT_BLOCK_NAME);
    const body = source.slice(reactBlock.bodyStart, reactBlock.bodyEnd);
    const updatedBody = body.replace(/^\s*debuggableVariants\s*=\s*.+(?:\n|$)/gm, '');

    return `${source.slice(0, reactBlock.bodyStart)}${updatedBody}${source.slice(reactBlock.bodyEnd)}`;
}

function insertManagedContent(
    source: string,
    blockName: ManagedBlockName,
    content: string,
    metadata: string,
): string {
    const block = findNamedBlock(source, blockName);
    const managedContent = formatManagedBlock(blockName, content, metadata);
    const prefix = source.slice(0, block.bodyEnd).replace(/\s*$/, '');
    const suffix = source.slice(block.bodyEnd);

    return `${prefix}\n\n${managedContent}\n${suffix}`;
}

function formatManagedBlock(
    blockName: ManagedBlockName,
    content: string,
    metadata: string,
): string {
    const hash = hashContent(content);
    const metadataSuffix = metadata.length > 0 ? ` ${metadata}` : '';

    return `${beginMarker(blockName)} ${hash}${metadataSuffix}\n${content}\n${endMarker(blockName)}`;
}

function removeManagedBlock(
    source: string,
    blockName: ManagedBlockName,
): {readonly managedBlock: ManagedBlock | undefined; readonly source: string} {
    const begin = beginMarker(blockName);
    const end = endMarker(blockName);
    const beginIndex = source.indexOf(begin);
    const endIndex = source.indexOf(end);

    if (beginIndex === -1 && endIndex === -1) {
        return {managedBlock: undefined, source};
    }
    if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
        throw new Error(`${PLUGIN_NAME} found a malformed managed ${blockName} block.`);
    }
    if (source.indexOf(begin, beginIndex + begin.length) !== -1 || source.indexOf(end, endIndex + end.length) !== -1) {
        throw new Error(`${PLUGIN_NAME} found duplicate managed ${blockName} blocks.`);
    }

    const headerEnd = source.indexOf('\n', beginIndex);
    if (headerEnd === -1) {
        throw new Error(`${PLUGIN_NAME} found a malformed managed ${blockName} block header.`);
    }
    const header = source.slice(beginIndex + begin.length, headerEnd).trim();
    const [expectedHash, metadata = ''] = splitOnce(header, ' ');
    const content = source.slice(headerEnd + 1, endIndex).replace(/\n$/, '');

    if (expectedHash.length === 0 || hashContent(content) !== expectedHash) {
        throw new Error(
            `${PLUGIN_NAME} will not replace the managed ${blockName} block because its generated contents were modified.`,
        );
    }

    let rangeEnd = endIndex + end.length;
    if (source[rangeEnd] === '\n') {
        rangeEnd += 1;
    }
    const rangeStart = beginIndex;
    const nextSource = `${source.slice(0, rangeStart)}${source.slice(rangeEnd)}`;

    return {
        managedBlock: {content, metadata, range: [rangeStart, rangeEnd]},
        source: nextSource,
    };
}

function findNamedBlock(source: string, name: string): NamedBlock {
    const openingPattern = new RegExp(`^\\s*${name}\\s*\\{`, 'm');
    const match = openingPattern.exec(source);
    if (match === null) {
        throw new Error(`${PLUGIN_NAME} could not find the standard ${name} { } block.`);
    }

    const openingBrace = source.indexOf('{', match.index);
    const closingBrace = findClosingBrace(source, openingBrace);

    return {bodyEnd: closingBrace, bodyStart: openingBrace + 1};
}

function findClosingBrace(source: string, openingBrace: number): number {
    let depth = 0;
    let quote: '"' | "'" | undefined;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let index = openingBrace; index < source.length; index += 1) {
        const character = source[index];
        const nextCharacter = source[index + 1];

        if (lineComment) {
            if (character === '\n') {
                lineComment = false;
            }
            continue;
        }
        if (blockComment) {
            if (character === '*' && nextCharacter === '/') {
                blockComment = false;
                index += 1;
            }
            continue;
        }
        if (quote !== undefined) {
            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === quote) {
                quote = undefined;
            }
            continue;
        }
        if (character === '/' && nextCharacter === '/') {
            lineComment = true;
            index += 1;
            continue;
        }
        if (character === '/' && nextCharacter === '*') {
            blockComment = true;
            index += 1;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === '{') {
            depth += 1;
        } else if (character === '}') {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }

    throw new Error(`${PLUGIN_NAME} found an unclosed Gradle block.`);
}

function beginMarker(blockName: ManagedBlockName): string {
    return `    // ${PLUGIN_NAME}:begin ${blockName}`;
}

function endMarker(blockName: ManagedBlockName): string {
    return `    // ${PLUGIN_NAME}:end ${blockName}`;
}

function hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function encodeMetadata(values: readonly string[]): string {
    return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');
}

function decodeMetadata(metadata: string): readonly string[] {
    if (metadata.length === 0) {
        return [];
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.from(metadata, 'base64url').toString('utf8'));
    } catch {
        throw new Error(`${PLUGIN_NAME} found invalid metadata in its managed react block.`);
    }

    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) {
        throw new Error(`${PLUGIN_NAME} found invalid metadata in its managed react block.`);
    }

    return parsed;
}

function splitOnce(value: string, separator: string): readonly [string, string] {
    const index = value.indexOf(separator);
    if (index === -1) {
        return [value, ''];
    }

    return [value.slice(0, index), value.slice(index + separator.length)];
}
