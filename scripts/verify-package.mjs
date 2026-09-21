import {execFile} from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const executeFile = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredPublishedFiles = [
  'LICENSE',
  'README.md',
  'app.plugin.js',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/index.mjs',
  'dist/runtime/index.d.ts',
  'dist/runtime/index.js',
  'dist/runtime/index.mjs',
  'package.json',
];
const forbiddenPublishedPrefixes = [
  '.artifacts/',
  '.env',
  'example/',
  'node_modules/',
  'PLAN.md',
  'scripts/',
  'src/',
  'tests/',
];

async function verifyPackage() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'expo-native-variants-package-'));
  try {
    const artifact = await packArtifact(temporaryRoot);
    const consumerRoot = await extractIntoConsumer(temporaryRoot, artifact.filename);
    const packageRoot = path.join(
      consumerRoot,
      'node_modules',
      'expo-native-variants',
    );
    const publishedFiles = await collectFiles(packageRoot);

    verifyFileList(publishedFiles, artifact.files);
    const packageJson = JSON.parse(
      await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
    );
    verifyPackageMetadata(packageJson);
    await verifyConsumerResolution(consumerRoot);
    await verifyMetroBundle(consumerRoot);
    await verifyExpoPrebuild(consumerRoot);
    await verifyRuntimeIsolation(packageRoot);
    process.stdout.write(
      `Verified ${path.basename(artifact.filename)} with ${publishedFiles.length} published files.\n`,
    );
  } finally {
    await rm(temporaryRoot, {force: true, recursive: true});
  }
}

async function packArtifact(temporaryRoot) {
  const artifactDirectory = path.join(temporaryRoot, 'artifact');
  await mkdir(artifactDirectory, {recursive: true});

  const {stdout} = await executeFile(
    process.platform === 'win32' ? 'bun.exe' : 'bun',
    [
      'pm',
      'pack',
      '--destination',
      artifactDirectory,
      '--ignore-scripts',
      '--quiet',
    ],
    {
      cwd: repositoryRoot,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const artifactPath = path.resolve(stdout.trim());
  const filename = path.basename(artifactPath);
  if (
    filename.length === 0 ||
    path.dirname(artifactPath) !== path.resolve(artifactDirectory) ||
    path.extname(filename) !== '.tgz'
  ) {
    throw new Error('Packed artifact returned an unsafe path.');
  }
  await assertFile(artifactPath, filename);
  const {stdout: archiveListing} = await executeFile(
    'tar',
    ['-tzf', artifactPath],
    {maxBuffer: 4 * 1024 * 1024},
  );
  return {
    filename: artifactPath,
    files: archiveListing
      .split('\n')
      .filter((filePath) => filePath.startsWith('package/') && !filePath.endsWith('/'))
      .map((filePath) => filePath.slice('package/'.length))
      .sort(),
  };
}

async function extractIntoConsumer(temporaryRoot, artifactPath) {
  const consumerRoot = path.join(temporaryRoot, 'consumer');
  const nodeModules = path.join(consumerRoot, 'node_modules');
  const packageRoot = path.join(nodeModules, 'expo-native-variants');
  await mkdir(packageRoot, {recursive: true});
  await executeFile(
    'tar',
    ['-xzf', artifactPath, '-C', packageRoot, '--strip-components=1'],
    {maxBuffer: 4 * 1024 * 1024},
  );
  await Promise.all([
    linkDependency(nodeModules, '@expo/image-utils'),
    linkDependency(nodeModules, 'expo'),
    linkDependency(nodeModules, 'react'),
    linkDependency(nodeModules, 'react-native'),
    writeFile(path.join(consumerRoot, 'index.js'), METRO_ENTRY, 'utf8'),
    writeFile(path.join(consumerRoot, 'app.config.js'), APP_CONFIG, 'utf8'),
    writeFile(
      path.join(consumerRoot, 'package.json'),
      `${JSON.stringify(CONSUMER_PACKAGE, null, 2)}\n`,
      'utf8',
    ),
  ]);
  return consumerRoot;
}

async function linkDependency(nodeModules, dependency) {
  await mkdir(path.dirname(path.join(nodeModules, dependency)), {recursive: true});
  await symlink(
    path.join(repositoryRoot, 'node_modules', dependency),
    path.join(nodeModules, dependency),
    'dir',
  );
}

function verifyFileList(extractedFiles, reportedFiles) {
  for (const requiredFile of requiredPublishedFiles) {
    if (!extractedFiles.includes(requiredFile)) {
      throw new Error(`Packed artifact is missing ${requiredFile}.`);
    }
  }
  for (const filePath of extractedFiles) {
    if (
      forbiddenPublishedPrefixes.some(
        (prefix) => filePath === prefix || filePath.startsWith(prefix),
      )
    ) {
      throw new Error(`Packed artifact contains forbidden path ${filePath}.`);
    }
  }
  if (JSON.stringify(extractedFiles) !== JSON.stringify(reportedFiles)) {
    throw new Error('Packed file report does not match the extracted artifact.');
  }
}

function verifyPackageMetadata(packageJson) {
  assertEqual(packageJson.main, 'dist/index.js', 'package main');
  assertEqual(packageJson.types, 'dist/index.d.ts', 'package types');
  assertEqual(
    packageJson.peerDependencies?.expo,
    '>=57.0.0 <58.0.0',
    'bounded Expo peer dependency',
  );
  assertEqual(
    packageJson.exports?.['.']?.import,
    './dist/index.mjs',
    'root ESM export',
  );
  if (packageJson.exports?.['./config'] !== undefined) {
    throw new Error('The package still exports the removed config wrapper.');
  }
  assertEqual(
    packageJson.exports?.['./runtime']?.import,
    './dist/runtime/index.mjs',
    'runtime ESM export',
  );
  assertEqual(
    packageJson.exports?.['./runtime']?.require,
    './dist/runtime/index.js',
    'runtime CommonJS export',
  );
}

async function verifyConsumerResolution(consumerRoot) {
  const consumerRequire = createRequire(path.join(consumerRoot, 'package.json'));
  const packageEntry = consumerRequire('expo-native-variants');
  if (
    typeof packageEntry.default !== 'function' ||
    typeof packageEntry.withNativeVariants !== 'function'
  ) {
    throw new Error('The packed root entry does not export the config plugin.');
  }

  const plugin = consumerRequire('expo-native-variants/app.plugin.js');
  if (typeof plugin !== 'function') {
    throw new Error('The packed app.plugin.js does not export the plugin function.');
  }

  const expoRequire = createRequire(consumerRequire.resolve('expo/package.json'));
  const {resolveConfigPluginFunction} = expoRequire(
    '@expo/config-plugins/build/utils/plugin-resolver',
  );
  const expoResolvedPlugin = resolveConfigPluginFunction(
    consumerRoot,
    'expo-native-variants',
  );
  if (typeof expoResolvedPlugin !== 'function') {
    throw new Error('Expo could not resolve the packed config plugin function.');
  }

  const runtime = consumerRequire('expo-native-variants/runtime');
  if (
    typeof runtime.getNativeVariant !== 'function' ||
    runtime.getNativeVariant('com.acme.app', {
      production: {applicationId: 'com.acme.app'},
    }) !== 'production'
  ) {
    throw new Error('The packed runtime export does not resolve a variant.');
  }

  await executeFile(
    process.execPath,
    ['--input-type=module', '--eval', ESM_CONSUMER_CHECK],
    {cwd: consumerRoot, maxBuffer: 4 * 1024 * 1024},
  );
}

async function verifyExpoPrebuild(consumerRoot) {
  const expoCli = path.join(repositoryRoot, 'node_modules', 'expo', 'bin', 'cli');
  try {
    await executeFile(
      process.execPath,
      [expoCli, 'prebuild', '--platform', 'android', '--clean', '--no-install'],
      {
        cwd: consumerRoot,
        env: {
          ...process.env,
          CI: '1',
          EXPO_NO_DOCTOR: '1',
          EXPO_OFFLINE: '1',
        },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'stdout' in error &&
      'stderr' in error
    ) {
      throw new Error(
        `Expo prebuild failed for the packed artifact.\n${error.stdout}\n${error.stderr}`,
      );
    }
    throw error;
  }

  const buildGradle = await readFile(
    path.join(consumerRoot, 'android', 'app', 'build.gradle'),
    'utf8',
  );
  for (const flavor of ['development', 'production']) {
    if (!buildGradle.includes(`${flavor} {`)) {
      throw new Error(`Packed artifact prebuild did not generate the ${flavor} flavor.`);
    }
  }
}

async function verifyMetroBundle(consumerRoot) {
  const expoCli = path.join(repositoryRoot, 'node_modules', 'expo', 'bin', 'cli');
  const bundlePath = path.join(consumerRoot, 'android.bundle');
  try {
    await executeFile(
      process.execPath,
      [
        expoCli,
        'export:embed',
        '--platform',
        'android',
        '--entry-file',
        'index.js',
        '--bundle-output',
        bundlePath,
        '--dev',
        'true',
        '--minify',
        'false',
      ],
      {
        cwd: consumerRoot,
        env: {...process.env, CI: '1', EXPO_OFFLINE: '1'},
        maxBuffer: 4 * 1024 * 1024,
      },
    );
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'stdout' in error &&
      'stderr' in error
    ) {
      throw new Error(
        `Metro failed to bundle the packed runtime export.\n${error.stdout}\n${error.stderr}`,
      );
    }
    throw error;
  }

  const bundle = await readFile(bundlePath, 'utf8');
  if (!bundle.includes('__packedRuntimeVariant')) {
    throw new Error('Metro output did not include the packed runtime consumer entry.');
  }
}

const ESM_CONSUMER_CHECK = `
import plugin, {withNativeVariants} from 'expo-native-variants';
import {getNativeVariant} from 'expo-native-variants/runtime';

if (typeof plugin !== 'function' || plugin !== withNativeVariants) {
  throw new Error('Root ESM default export is not the config plugin function.');
}
if (getNativeVariant('com.acme.app', {production: {applicationId: 'com.acme.app'}}) !== 'production') {
  throw new Error('Runtime ESM named export did not resolve a variant.');
}
`;

const CONSUMER_PACKAGE = {
  dependencies: {
    expo: '57.0.24',
    'expo-native-variants': '0.2.0-alpha.0', // x-release-please-version
    react: '19.2.3',
    'react-native': '0.86.3',
  },
  main: 'index.js',
  name: 'package-verification-consumer',
  private: true,
  version: '1.0.0',
};

const APP_CONFIG = `'use strict';

module.exports = {
  name: 'Packed Native Variants',
  slug: 'packed-native-variants',
  version: '1.0.0',
  plugins: [
    ['expo-native-variants', {
      variants: {
        production: {
          applicationId: 'com.acme.packed',
        },
        development: {
          applicationId: 'com.acme.packed.dev',
        },
      },
    }],
  ],
};
`;

const METRO_ENTRY = `import {getNativeVariant} from 'expo-native-variants/runtime';

globalThis.__packedRuntimeVariant = getNativeVariant(
  'com.acme.packed',
  {production: {applicationId: 'com.acme.packed'}},
);
`;

async function verifyRuntimeIsolation(packageRoot) {
  const runtimeSource = await readFile(
    path.join(packageRoot, 'dist/runtime/index.js'),
    'utf8',
  );
  for (const forbiddenImport of [
    'config/index',
    'expo/config-plugins',
    'src/options',
    '../options',
  ]) {
    if (runtimeSource.includes(forbiddenImport)) {
      throw new Error(`The runtime bundle imports Node-only code through ${forbiddenImport}.`);
    }
  }
}

async function collectFiles(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), {withFileTypes: true})) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function assertFile(filePath, label) {
  const details = await stat(filePath);
  if (!details.isFile()) {
    throw new Error(`${label} is not a file.`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}.`);
  }
}

await verifyPackage();
