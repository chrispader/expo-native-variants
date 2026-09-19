import {execFile} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {initialSettings} from './fixture';

const executeFile = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const previewVersion = process.env.EXPO_58_VERSION ?? '58.0.0-preview.3';
const runAdvisory = process.env.EXPO_NATIVE_VARIANTS_EXPO_58 === '1';

let consumerRoot = '';

describe.skipIf(!runAdvisory)('Expo 58 preview advisory', () => {
  beforeAll(async () => {
    consumerRoot = await createPreviewConsumer();
    await installPreview(consumerRoot);
    await copyCompiledPackage(consumerRoot);
    await runPrebuild(consumerRoot);
  });

  afterAll(async () => {
    if (consumerRoot.length > 0) {
      await rm(consumerRoot, {force: true, recursive: true});
    }
  });

  it('generates the native variant matrix with the current preview', async () => {
    const buildGradle = await readFile(
      path.join(consumerRoot, 'android', 'app', 'build.gradle'),
      'utf8',
    );
    expect(buildGradle).toContain('development {');
    expect(buildGradle).toContain('preview {');
    expect(buildGradle).toContain('production {');

    const manifest = await readFile(
      path.join(
        consumerRoot,
        'android',
        'app',
        'src',
        'main',
        'AndroidManifest.xml',
      ),
      'utf8',
    );
    expect(manifest).toContain('${nativeVariantScheme}');

    const projectDirectory = (
      await readdir(path.join(consumerRoot, 'ios'), {withFileTypes: true})
    ).find((entry) => entry.isDirectory() && entry.name.endsWith('.xcodeproj'));
    if (projectDirectory === undefined) {
      throw new Error('Expo 58 preview did not generate an Xcode project.');
    }
    const projectFile = path.join(
      consumerRoot,
      'ios',
      projectDirectory.name,
      'project.pbxproj',
    );
    const project = await readFile(projectFile, 'utf8');
    expect(project).toContain('Debug-Development');
    expect(project).toContain('Release-Preview');
    expect(project).toContain('Debug-Production');
  });
});

async function createPreviewConsumer(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'expo-native-variants-expo58-'));
  await Promise.all([
    writeFile(path.join(root, 'app.config.js'), APP_CONFIG, 'utf8'),
    writeFile(path.join(root, 'index.js'), '', 'utf8'),
    writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify(
        {
          dependencies: {expo: previewVersion},
          main: 'index.js',
          name: 'native-variants-expo58-advisory',
          private: true,
          version: '1.0.0',
        },
        null,
        2,
      )}\n`,
      'utf8',
    ),
    writeFile(
      path.join(root, 'variant-settings.json'),
      `${JSON.stringify(initialSettings('before').options, null, 2)}\n`,
      'utf8',
    ),
  ]);
  return root;
}

async function installPreview(root: string): Promise<void> {
  await executeFile(
    process.platform === 'win32' ? 'bun.exe' : 'bun',
    ['install', '--ignore-scripts', '--cache-dir', path.join(root, '.cache')],
    {
      cwd: root,
      env: {...process.env, CI: '1'},
      maxBuffer: 8 * 1024 * 1024,
    },
  );
}

async function copyCompiledPackage(root: string): Promise<void> {
  const destination = path.join(root, 'node_modules', 'expo-native-variants');
  await mkdir(destination, {recursive: true});
  await Promise.all([
    cp(path.join(repositoryRoot, 'app.plugin.js'), path.join(destination, 'app.plugin.js')),
    cp(path.join(repositoryRoot, 'dist'), path.join(destination, 'dist'), {
      recursive: true,
    }),
    cp(path.join(repositoryRoot, 'package.json'), path.join(destination, 'package.json')),
  ]);
}

async function runPrebuild(root: string): Promise<void> {
  const expoCli = path.join(root, 'node_modules', 'expo', 'bin', 'cli');
  try {
    await executeFile(
      process.execPath,
      [expoCli, 'prebuild', '--clean', '--no-install'],
      {
        cwd: root,
        env: {...process.env, CI: '1', EXPO_NO_DOCTOR: '1'},
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  } catch (error) {
    if (isExecutionError(error)) {
      throw new Error(`Expo 58 preview prebuild failed.\n${error.stdout}\n${error.stderr}`);
    }
    throw error;
  }
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

const APP_CONFIG = `'use strict';

const options = require('./variant-settings.json');

module.exports = {
  name: 'Acme',
  slug: 'acme-native-variants-expo58',
  version: '1.0.0',
  plugins: [['expo-native-variants', options]],
};
`;
