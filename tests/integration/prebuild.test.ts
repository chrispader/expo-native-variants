import {execFile} from 'node:child_process';
import {cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {
  APP_CONFIG,
  CONSUMER_PACKAGE,
  NEIGHBOR_PLUGIN,
  initialSettings,
  renamedSettings,
} from './fixture';
import type {PrebuildSettings} from './fixture';

const executeFile = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const expoCli = path.join(repositoryRoot, 'node_modules', 'expo', 'bin', 'cli');

let consumerRoot = '';

beforeAll(async () => {
  consumerRoot = await createConsumer();
});

afterAll(async () => {
  if (consumerRoot.length > 0) {
    await rm(consumerRoot, {force: true, recursive: true});
  }
});

describe('compiled package prebuild', () => {
  it('reconciles the full matrix across clean, repeated, and changed prebuilds', async () => {
    await writeSettings(consumerRoot, initialSettings('before'));
    await runPrebuild(consumerRoot, true);
    await assertInitialNativeProject(consumerRoot);

    await runPrebuild(consumerRoot, false);
    await assertNoRepeatedOutput(consumerRoot);

    await writeSettings(consumerRoot, renamedSettings('after'));
    await runPrebuild(consumerRoot, false);
    await assertRenamedNativeProject(consumerRoot);
  });
});

async function createConsumer(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'expo-native-variants-'));
  const nodeModules = path.join(root, 'node_modules');
  await mkdir(nodeModules, {recursive: true});
  await Promise.all([
    linkDependency(nodeModules, 'expo'),
    linkDependency(nodeModules, 'react'),
    linkDependency(nodeModules, 'react-native'),
    copyCompiledPackage(nodeModules),
  ]);
  await Promise.all([
    writeFile(path.join(root, 'index.js'), '', 'utf8'),
    writeFile(path.join(root, 'app.config.js'), APP_CONFIG, 'utf8'),
    writeFile(path.join(root, 'neighbor-plugin.js'), NEIGHBOR_PLUGIN, 'utf8'),
    writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify(CONSUMER_PACKAGE, null, 2)}\n`,
      'utf8',
    ),
  ]);
  return root;
}

async function copyCompiledPackage(nodeModules: string): Promise<void> {
  const destination = path.join(nodeModules, 'expo-native-variants');
  await mkdir(destination, {recursive: true});
  await cp(path.join(repositoryRoot, 'dist'), path.join(destination, 'dist'), {
    recursive: true,
  });
  await cp(
    path.join(repositoryRoot, 'app.plugin.js'),
    path.join(destination, 'app.plugin.js'),
  );
  await cp(path.join(repositoryRoot, 'package.json'), path.join(destination, 'package.json'));
  await lstat(path.join(destination, 'dist', 'index.js'));
}

async function linkDependency(nodeModules: string, dependency: string): Promise<void> {
  await symlink(
    path.join(repositoryRoot, 'node_modules', dependency),
    path.join(nodeModules, dependency),
    'dir',
  );
}

async function writeSettings(root: string, settings: PrebuildSettings): Promise<void> {
  await writeFile(
    path.join(root, 'variant-settings.json'),
    `${JSON.stringify(settings, null, 2)}\n`,
    'utf8',
  );
}

async function runPrebuild(root: string, clean: boolean): Promise<void> {
  const args = [expoCli, 'prebuild', '--no-install'];
  if (clean) {
    args.push('--clean');
  } else {
    args.push('--no-clean');
  }

  try {
    await executeFile(process.execPath, args, {
      cwd: root,
      env: {
        ...process.env,
        CI: '1',
        EXPO_NO_DOCTOR: '1',
        EXPO_OFFLINE: '1',
      },
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    if (isExecutionError(error)) {
      throw new Error(`Expo prebuild failed.\n${error.stdout}\n${error.stderr}`);
    }
    throw error;
  }
}

async function assertInitialNativeProject(root: string): Promise<void> {
  const androidRoot = path.join(root, 'android');
  const iosRoot = path.join(root, 'ios');
  const buildGradle = await readFile(
    path.join(androidRoot, 'app', 'build.gradle'),
    'utf8',
  );
  expect(buildGradle).toContain('development {');
  expect(buildGradle).toContain('preview {');
  expect(buildGradle).toContain('production {');
  expect(buildGradle).toContain('"developmentDebug"');
  expect(buildGradle).toContain('"previewDebug"');
  expect(buildGradle).toContain('"productionDebug"');

  await expectResource(root, 'development', 'Acme Dev');
  await expectResource(root, 'preview', 'Acme Preview');
  await expectResource(root, 'production', 'Acme');

  const manifest = await readFile(
    path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml'),
    'utf8',
  );
  expect(manifest).toContain('${nativeVariantScheme}');
  expect(manifest).toContain('android:usesCleartextTraffic="false"');
  expect(manifest).not.toContain('android:scheme="com.acme.app"');
  expect(manifest).not.toContain('android:scheme="exp+acme-native-variants-integration"');

  const projectFile = await findIosProjectFile(iosRoot);
  const project = await readFile(projectFile, 'utf8');
  expect(project).toContain('Debug-Development');
  expect(project).toContain('Release-Preview');
  expect(project).toContain('PRODUCT_BUNDLE_IDENTIFIER = "com.acme.app";');

  const schemes = await readGeneratedSchemeNames(projectFile);
  expect(schemes).toEqual(
    expect.arrayContaining([
      'Acme-Development.xcscheme',
      'Acme-Preview.xcscheme',
      'Acme-Production.xcscheme',
    ]),
  );

  const infoPlist = await readFile(await findFile(iosRoot, 'Info.plist'), 'utf8');
  expect(infoPlist).toContain('<key>NeighborMarker</key>');
  expect(infoPlist).toContain('$(EXPO_NATIVE_VARIANT_DISPLAY_NAME)');
  expect(infoPlist).toContain('$(EXPO_NATIVE_VARIANT_URL_SCHEME)');
  expect(infoPlist).not.toContain('<string>com.acme.app</string>');
  expect(infoPlist).not.toContain(
    '<string>exp+acme-native-variants-integration</string>',
  );
}

async function assertNoRepeatedOutput(root: string): Promise<void> {
  const buildGradle = await readFile(
    path.join(root, 'android', 'app', 'build.gradle'),
    'utf8',
  );
  expect(count(buildGradle, 'expo-native-variants:begin android')).toBe(1);
  expect(count(buildGradle, 'expo-native-variants:begin react')).toBe(1);

  const projectFile = await findIosProjectFile(path.join(root, 'ios'));
  const project = await readFile(projectFile, 'utf8');
  expect(count(project, 'Debug-Development')).toBeGreaterThan(0);
  expect(await readGeneratedSchemeNames(projectFile)).toHaveLength(3);
}

async function assertRenamedNativeProject(root: string): Promise<void> {
  const buildGradle = await readFile(
    path.join(root, 'android', 'app', 'build.gradle'),
    'utf8',
  );
  expect(buildGradle).toContain('local {');
  expect(buildGradle).toContain('production {');
  expect(buildGradle).not.toContain('development {');
  expect(buildGradle).not.toContain('preview {');
  await expectResource(root, 'local', 'Acme Local');
  await expect(pathExists(path.join(root, 'android', 'app', 'src', 'development'))).resolves.toBe(
    false,
  );
  await expect(pathExists(path.join(root, 'android', 'app', 'src', 'preview'))).resolves.toBe(
    false,
  );

  const projectFile = await findIosProjectFile(path.join(root, 'ios'));
  const project = await readFile(projectFile, 'utf8');
  expect(project).toContain('Debug-Local');
  expect(project).not.toContain('Debug-Development');
  expect(project).not.toContain('Debug-Preview');
  expect(await readGeneratedSchemeNames(projectFile)).toEqual(
    expect.arrayContaining(['Acme-Local.xcscheme', 'Acme-Production.xcscheme']),
  );
  expect(await readGeneratedSchemeNames(projectFile)).toHaveLength(2);

  const infoPlist = await readFile(
    await findFile(path.join(root, 'ios'), 'Info.plist'),
    'utf8',
  );
  expect(infoPlist).toContain('<key>NeighborMarker</key>');
}

async function expectResource(
  root: string,
  flavor: string,
  displayName: string,
): Promise<void> {
  const resource = await readFile(
    path.join(
      root,
      'android',
      'app',
      'src',
      flavor,
      'res',
      'values',
      'native_variants.xml',
    ),
    'utf8',
  );
  expect(resource).toContain(`<string name="app_name">${displayName}</string>`);
}

async function findIosProjectFile(iosRoot: string): Promise<string> {
  const projectDirectory = (await readdir(iosRoot, {withFileTypes: true})).find(
    (entry) => entry.isDirectory() && entry.name.endsWith('.xcodeproj'),
  );
  if (projectDirectory === undefined) {
    throw new Error('Generated iOS project was not found.');
  }
  return path.join(iosRoot, projectDirectory.name, 'project.pbxproj');
}

async function readGeneratedSchemeNames(projectFile: string): Promise<readonly string[]> {
  const schemeDirectory = path.join(
    path.dirname(projectFile),
    'xcshareddata',
    'xcschemes',
  );
  return (await readdir(schemeDirectory))
    .filter((name) => name.startsWith('Acme-') && name.endsWith('.xcscheme'))
    .sort();
}

async function findFile(root: string, fileName: string): Promise<string> {
  for (const entry of await readdir(root, {withFileTypes: true})) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) {
      return candidate;
    }
    if (entry.isDirectory() && !entry.name.endsWith('.xcodeproj')) {
      const nested = await findFileIfPresent(candidate, fileName);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  throw new Error(`${fileName} was not found under ${root}.`);
}

async function findFileIfPresent(root: string, fileName: string): Promise<string | undefined> {
  try {
    return await findFile(root, fileName);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${fileName} was not found`)) {
      return undefined;
    }
    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function count(source: string, value: string): number {
  return source.split(value).length - 1;
}

function isExecutionError(
  error: unknown,
): error is Error & {readonly stderr: string; readonly stdout: string} {
  return (
    error instanceof Error &&
    'stderr' in error &&
    typeof error.stderr === 'string' &&
    'stdout' in error &&
    typeof error.stdout === 'string'
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
