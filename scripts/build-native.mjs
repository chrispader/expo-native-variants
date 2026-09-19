#!/usr/bin/env node

import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exampleRoot = path.join(repositoryRoot, 'example');
const artifactRoot = path.join(repositoryRoot, '.artifacts', 'native');
const variants = await readVariants();
const selectedPlatform = process.argv[2] ?? 'all';

if (!['all', 'android', 'ios'].includes(selectedPlatform)) {
  throw new Error('Platform must be "android", "ios", or "all".');
}

await mkdir(artifactRoot, {recursive: true});

if (selectedPlatform === 'all' || selectedPlatform === 'android') {
  await buildAndroid();
}
if (selectedPlatform === 'all' || selectedPlatform === 'ios') {
  await buildIos();
}

async function buildAndroid() {
  const androidRoot = path.join(exampleRoot, 'android');
  await requireDirectory(androidRoot, 'Generate the example Android project before building.');
  await requireDirectory(
    path.join(androidRoot, 'app'),
    'Generate the complete example Android project before building.',
  );
  const gradle = path.join(androidRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const maxWorkers = process.env.NATIVE_MAX_WORKERS ?? '2';
  const nativeArch = process.env.ANDROID_NATIVE_ARCH ?? 'arm64-v8a';

  for (const variant of variants) {
    for (const mode of ['debug', 'release']) {
      const variantName = `${variant.androidFlavor}${capitalize(mode)}`;
      const task = `:app:assemble${upperFirst(variantName)}`;
      const logPath = path.join(artifactRoot, 'logs', 'android', `${variantName}.log`);
      const bundlePath = path.join(
        androidRoot,
        'app',
        'build',
        'generated',
        'assets',
        'react',
        variantName,
        'index.android.bundle',
      );
      await rm(path.dirname(bundlePath), {force: true, recursive: true});
      await runLogged({
        command: gradle,
        args: [
          task,
          '--no-daemon',
          '--console=plain',
          `--max-workers=${maxWorkers}`,
          `-PreactNativeArchitectures=${nativeArch}`,
        ],
        cwd: androidRoot,
        env: {NODE_ENV: mode === 'debug' ? 'development' : 'production'},
        label: `Android ${variantName}`,
        logPath,
      });
      await verifyBundleMode({bundlePath, mode, label: `Android ${variantName}`});
      await collectAndroidArtifact({variant, mode, variantName});
    }
  }
}

async function collectAndroidArtifact({variant, mode, variantName}) {
  const outputDirectory = path.join(
    exampleRoot,
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    variant.androidFlavor,
    mode,
  );
  const metadata = JSON.parse(
    await readFile(path.join(outputDirectory, 'output-metadata.json'), 'utf8'),
  );
  const expectedApplicationId = variant.androidApplicationId;
  if (metadata.applicationId !== expectedApplicationId) {
    throw new Error(
      `${variantName} produced application ID ${JSON.stringify(metadata.applicationId)} instead of ${JSON.stringify(expectedApplicationId)}.`,
    );
  }

  const outputFile = metadata.elements?.[0]?.outputFile;
  if (typeof outputFile !== 'string') {
    throw new Error(`${variantName} did not report an APK output.`);
  }
  const apkPath = path.join(outputDirectory, outputFile);
  await requireFile(apkPath, `${variantName} did not produce ${outputFile}.`);
  const destination = path.join(
    artifactRoot,
    'android',
    `${variant.androidFlavor}-${mode}.apk`,
  );
  await mkdir(path.dirname(destination), {recursive: true});
  await copyFile(apkPath, destination);
}

async function buildIos() {
  if (process.platform !== 'darwin') {
    throw new Error('iOS native builds require macOS.');
  }

  const iosRoot = path.join(exampleRoot, 'ios');
  const projectName = process.env.IOS_PROJECT_NAME ?? 'NativeVariants';
  const workspaceName = process.env.IOS_WORKSPACE ?? `${projectName}.xcworkspace`;
  const workspacePath = path.join(iosRoot, workspaceName);
  const sdk = process.env.IOS_SDK ?? 'iphonesimulator';
  const destination = process.env.IOS_DESTINATION ?? 'generic/platform=iOS Simulator';
  const architecture = process.env.IOS_SIMULATOR_ARCH ?? defaultIosArchitecture();
  const maxWorkers = process.env.NATIVE_MAX_WORKERS ?? '2';
  const derivedDataPath = path.join(artifactRoot, 'derived-data', 'ios');

  await requireDirectory(workspacePath, 'Generate the example iOS project and install pods before building.');

  for (const variant of variants) {
    for (const mode of ['debug', 'release']) {
      const configuration = `${capitalize(mode)}-${variant.configurationLabel}`;
      const scheme = variant.iosScheme ?? `${projectName}-${variant.configurationLabel}`;
      const buildName = `${variant.key}-${mode}`;
      const logPath = path.join(artifactRoot, 'logs', 'ios', `${buildName}.log`);

      await runLogged({
        command: 'xcodebuild',
        args: [
          '-workspace',
          workspacePath,
          '-scheme',
          scheme,
          '-configuration',
          configuration,
          '-sdk',
          sdk,
          '-destination',
          destination,
          '-derivedDataPath',
          derivedDataPath,
          '-jobs',
          maxWorkers,
          `ARCHS=${architecture}`,
          'ONLY_ACTIVE_ARCH=YES',
          'CODE_SIGNING_ALLOWED=NO',
          'CODE_SIGNING_REQUIRED=NO',
          'build',
        ],
        cwd: iosRoot,
        env: {NODE_ENV: mode === 'debug' ? 'development' : 'production'},
        label: `iOS ${configuration}`,
        logPath,
      });

      await collectIosArtifact({
        variant,
        configuration,
        derivedDataPath,
        projectName,
        sdk,
        buildName,
      });
    }
  }
}

async function collectIosArtifact({
  variant,
  configuration,
  derivedDataPath,
  projectName,
  sdk,
  buildName,
}) {
  const sdkName = sdk.replace(/[0-9.]+$/, '');
  const appPath = path.join(
    derivedDataPath,
    'Build',
    'Products',
    `${configuration}-${sdkName}`,
    `${projectName}.app`,
  );
  await requireDirectory(appPath, `${configuration} did not produce ${projectName}.app.`);

  const infoPlistPath = path.join(appPath, 'Info.plist');
  await verifyBundleMode({
    bundlePath: path.join(appPath, 'main.jsbundle'),
    mode: configuration.startsWith('Debug-') ? 'debug' : 'release',
    label: `iOS ${configuration}`,
  });
  const applicationId = await readPlistValue(infoPlistPath, 'CFBundleIdentifier');
  const displayName = await readPlistValue(infoPlistPath, 'CFBundleDisplayName');
  if (applicationId !== variant.iosBundleIdentifier) {
    throw new Error(
      `${configuration} produced bundle identifier ${JSON.stringify(applicationId)} instead of ${JSON.stringify(variant.iosBundleIdentifier)}.`,
    );
  }
  if (displayName !== variant.displayName) {
    throw new Error(
      `${configuration} produced display name ${JSON.stringify(displayName)} instead of ${JSON.stringify(variant.displayName)}.`,
    );
  }

  const destination = path.join(artifactRoot, 'ios', `${buildName}.app.tar.gz`);
  await rm(destination, {force: true});
  await mkdir(path.dirname(destination), {recursive: true});
  await runLogged({
    command: 'tar',
    args: ['-C', path.dirname(appPath), '-czf', destination, path.basename(appPath)],
    cwd: repositoryRoot,
    label: `Package iOS ${configuration}`,
    logPath: path.join(artifactRoot, 'logs', 'ios', `package-${buildName}.log`),
  });
}

async function readPlistValue(plistPath, key) {
  const temporaryLog = path.join(artifactRoot, 'logs', 'ios', `plist-${key}.log`);
  const output = await runLogged({
    command: 'plutil',
    args: ['-extract', key, 'raw', '-o', '-', plistPath],
    cwd: repositoryRoot,
    label: `Read ${key}`,
    logPath: temporaryLog,
    captureOutput: true,
  });
  return output.trim();
}

async function runLogged({
  command,
  args,
  cwd,
  env = {},
  label,
  logPath,
  captureOutput = false,
}) {
  await mkdir(path.dirname(logPath), {recursive: true});
  console.log(`Building ${label}...`);

  const child = spawn(command, args, {
    cwd,
    env: {...process.env, CI: 'true', ...env},
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = createWriteStream(logPath, {encoding: 'utf8'});
  let output = '';
  child.stdout.on('data', (chunk) => {
    log.write(chunk);
    if (captureOutput) {
      output += chunk.toString();
    }
  });
  child.stderr.on('data', (chunk) => log.write(chunk));

  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({code, signal}));
  });
  await new Promise((resolve) => log.end(resolve));

  if (result.code !== 0) {
    const tail = (await readFile(logPath, 'utf8')).split('\n').slice(-100).join('\n');
    console.error(`\n${label} failed. Last log lines from ${relative(logPath)}:\n${tail}`);
    throw new Error(
      `${label} exited with ${result.code ?? `signal ${result.signal ?? 'unknown'}`}.`,
    );
  }

  console.log(`Built ${label}. Log: ${relative(logPath)}`);
  return output;
}

async function readVariants() {
  const raw = JSON.parse(
    await readFile(path.join(exampleRoot, 'variants.json'), 'utf8'),
  );
  if (typeof raw !== 'object' || raw === null || typeof raw.variants !== 'object' || raw.variants === null) {
    throw new Error('example/variants.json does not contain a variants object.');
  }

  return Object.entries(raw.variants).map(([key, value]) => {
    if (
      typeof value !== 'object' ||
      value === null ||
      typeof value.applicationId !== 'string' ||
      typeof value.displayName !== 'string'
    ) {
      throw new Error(`Variant ${JSON.stringify(key)} is missing native build metadata.`);
    }
    const configurationLabel = toPascalConfigLabel(key);
    return {
      key,
      displayName: value.displayName,
      androidApplicationId: value.android?.applicationId ?? value.applicationId,
      androidFlavor: lowerFirst(configurationLabel),
      iosBundleIdentifier: value.ios?.bundleIdentifier ?? value.applicationId,
      iosScheme: value.ios?.xcodeScheme,
      configurationLabel,
    };
  });
}

async function requireDirectory(directory, message) {
  try {
    if ((await stat(directory)).isDirectory()) {
      return;
    }
  } catch {
    // The error below includes the expected setup step.
  }
  throw new Error(message);
}

async function requireFile(filePath, message) {
  try {
    if ((await stat(filePath)).isFile()) {
      return;
    }
  } catch {
    // The error below includes the missing build output.
  }
  throw new Error(message);
}

async function verifyBundleMode({bundlePath, mode, label}) {
  const bundleExists = await isFile(bundlePath);
  if (mode === 'release' && !bundleExists) {
    throw new Error(`${label} did not embed its JavaScript bundle.`);
  }
  if (mode === 'debug' && bundleExists) {
    throw new Error(`${label} embedded a JavaScript bundle even though it is debuggable.`);
  }
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function toPascalConfigLabel(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split(/[-_]+/)
    .filter(Boolean)
    .map(capitalize)
    .join('');
}

function capitalize(value) {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1).toLowerCase()}`;
}

function lowerFirst(value) {
  return `${value[0]?.toLowerCase() ?? ''}${value.slice(1)}`;
}

function upperFirst(value) {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}

function defaultIosArchitecture() {
  return process.arch === 'arm64' ? 'arm64' : 'x86_64';
}

function relative(filePath) {
  return path.relative(repositoryRoot, filePath);
}
