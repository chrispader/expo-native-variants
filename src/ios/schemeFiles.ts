import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';

import type {NormalizedNativeVariantsOptions} from '../options';
import {createScheme, formatScheme, schemesEqual} from './scheme';
import type {XcodeProjectMetadata} from './xcodeProject';

const STATE_FILE_NAME = '.expo-native-variants.json';
const STATE_VERSION = 1;

type SyncSchemeFilesArgs = Readonly<{
  platformProjectRoot: string;
  projectName: string;
  metadata: XcodeProjectMetadata;
  options: NormalizedNativeVariantsOptions;
}>;

type SyncSchemeFilesModArgs = SyncSchemeFilesArgs & Readonly<{introspect: boolean}>;

type SchemeStateEntry = Readonly<{name: string; hash: string}>;
type SchemeState = Readonly<{version: 1; schemes: readonly SchemeStateEntry[]}>;

export async function syncSchemeFilesMod({
  introspect,
  ...args
}: SyncSchemeFilesModArgs): Promise<void> {
  if (introspect) {
    return;
  }
  await syncSchemeFiles(args);
}

export async function syncSchemeFiles({
  platformProjectRoot,
  projectName,
  metadata,
  options,
}: SyncSchemeFilesArgs): Promise<void> {
  const schemeDirectory = path.join(
    platformProjectRoot,
    `${projectName}.xcodeproj`,
    'xcshareddata',
    'xcschemes',
  );
  const statePath = path.join(platformProjectRoot, STATE_FILE_NAME);
  const previousState = await readState(statePath);
  const previousByName = new Map(previousState.schemes.map((entry) => [entry.name, entry]));
  const desired = options.variants.map((variant) => {
    const contents = formatScheme(
      createScheme({
        variant,
        targetUuid: metadata.targetUuid,
        targetName: metadata.targetName,
        productName: metadata.productName,
        projectName,
      }),
    );
    return {
      name: variant.iosScheme,
      contents,
      hash: hash(contents),
      path: path.join(schemeDirectory, `${variant.iosScheme}.xcscheme`),
    };
  });
  const desiredNames = new Set(desired.map((scheme) => scheme.name));

  for (const previous of previousState.schemes) {
    if (desiredNames.has(previous.name)) {
      continue;
    }
    const stalePath = path.join(schemeDirectory, `${previous.name}.xcscheme`);
    const staleContents = await readOptionalFile(stalePath);
    if (staleContents !== undefined && hash(staleContents) !== previous.hash) {
      throw new Error(
        `expo-native-variants will not remove modified Xcode scheme "${previous.name}". Rename or remove the file before regenerating.`,
      );
    }
  }

  for (const scheme of desired) {
    const existingContents = await readOptionalFile(scheme.path);
    if (existingContents === undefined) {
      continue;
    }
    const previous = previousByName.get(scheme.name);
    const matchesPrevious = previous !== undefined && hash(existingContents) === previous.hash;
    const matchesDesired = await schemesEqual(existingContents, scheme.contents);
    if (!matchesPrevious && !matchesDesired) {
      throw new Error(
        `expo-native-variants will not overwrite existing Xcode scheme "${scheme.name}" because the plugin does not own it.`,
      );
    }
  }

  await mkdir(schemeDirectory, {recursive: true});
  for (const previous of previousState.schemes) {
    if (!desiredNames.has(previous.name)) {
      await rm(path.join(schemeDirectory, `${previous.name}.xcscheme`), {force: true});
    }
  }
  for (const scheme of desired) {
    await writeFile(scheme.path, scheme.contents);
  }
  const nextState: SchemeState = {
    version: STATE_VERSION,
    schemes: desired.map(({name, hash: schemeHash}) => ({name, hash: schemeHash})),
  };
  await writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
}

async function readState(statePath: string): Promise<SchemeState> {
  const contents = await readOptionalFile(statePath);
  if (contents === undefined) {
    return {version: STATE_VERSION, schemes: []};
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error(
      `expo-native-variants could not parse its iOS state file at ${statePath}.`,
    );
  }
  if (!isRecord(value) || value.version !== STATE_VERSION || !Array.isArray(value.schemes)) {
    throw new Error(
      `expo-native-variants found an unsupported iOS state file at ${statePath}.`,
    );
  }

  const schemes = value.schemes.map((entry) => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.hash !== 'string') {
      throw new Error(
        `expo-native-variants found an invalid iOS state file at ${statePath}.`,
      );
    }
    return {name: entry.name, hash: entry.hash};
  });
  return {version: STATE_VERSION, schemes};
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function hash(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
