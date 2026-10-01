import {createHash} from 'node:crypto';

import type {XcodeProject} from 'expo/config-plugins';

import {syncGeneratedFiles} from '../files/generated';
import type {NormalizedNativeVariantsOptions} from '../options';

export const LOCALIZED_NAMES_PHASE = '[expo-native-variants] Localize display names';
export const LOCALIZED_NAMES_STAMP =
  '$(DERIVED_FILE_DIR)/expo-native-variants-localized-names.stamp';

const STATE_FILE = '.expo-native-variants-localized-names.json';
const VARIANT_DIRECTORY = 'NativeVariants';
const VARIANT_KEY_BUILD_SETTING = 'EXPO_NATIVE_VARIANT_KEY';

/**
 * Localized names differ per build configuration, but the Xcode resource group is shared by all of
 * them. This phase therefore copies the selected variant's InfoPlist.strings into the built app.
 * Where the app already has InfoPlist.strings for that language, for example from Expo `locales`,
 * only CFBundleDisplayName is replaced so other localized keys survive.
 */
export function createLocalizedNamesScript(projectDirectory: string): string {
  return `set -eu
src="$SRCROOT/${shellEscape(projectDirectory)}/${VARIANT_DIRECTORY}/\${${VARIANT_KEY_BUILD_SETTING}:-}"
dest_root="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
if [ -d "$src" ]; then
  for lproj in "$src"/*.lproj; do
    [ -d "$lproj" ] || continue
    name="$(basename "$lproj")"
    dest="$dest_root/$name/InfoPlist.strings"
    mkdir -p "$dest_root/$name"
    if [ -f "$dest" ]; then
      value="$(/usr/bin/plutil -extract CFBundleDisplayName raw -o - "$lproj/InfoPlist.strings")"
      /usr/bin/plutil -replace CFBundleDisplayName -string "$value" "$dest"
    else
      /usr/bin/plutil -convert binary1 -o "$dest" "$lproj/InfoPlist.strings"
    fi
  done
fi
touch "$DERIVED_FILE_DIR/expo-native-variants-localized-names.stamp"
`;
}

export function collectLocalizedLanguages(
  options: NormalizedNativeVariantsOptions,
): readonly string[] {
  return [
    ...new Set(options.variants.flatMap((variant) => Object.keys(variant.localizedDisplayNames ?? {}))),
  ].sort();
}

export async function syncIosLocalizedNames({
  platformProjectRoot,
  projectDirectory,
  options,
}: Readonly<{
  platformProjectRoot: string;
  projectDirectory: string;
  options: NormalizedNativeVariantsOptions;
}>): Promise<void> {
  const files = new Map<string, Buffer>();
  for (const variant of options.variants) {
    const names = Object.entries(variant.localizedDisplayNames ?? {});
    if (names.length === 0) continue;
    const variantRoot = `${projectDirectory}/${VARIANT_DIRECTORY}/${variant.key}`;
    const inputs: string[] = [];
    for (const [tag, name] of names) {
      const relative = `${variantRoot}/${tag}.lproj/InfoPlist.strings`;
      files.set(relative, Buffer.from(createStringsFile(name), 'utf8'));
      inputs.push(`$(SRCROOT)/${relative}`);
    }
    files.set(`${variantRoot}.xcfilelist`, Buffer.from(`${inputs.join('\n')}\n`, 'utf8'));
  }
  await syncGeneratedFiles(platformProjectRoot, STATE_FILE, files);
}

export function reconcileIosLocalizedNamesPhase({
  project,
  targetUuid,
  projectDirectory,
  enabled,
}: Readonly<{
  project: XcodeProject;
  targetUuid: string;
  projectDirectory: string;
  enabled: boolean;
}>): void {
  const target = requireRecord(project.pbxNativeTargetSection()[targetUuid]);
  const phases: Record<string, unknown> | undefined =
    project.hash.project.objects.PBXShellScriptBuildPhase;
  for (const reference of requireReferences(target.buildPhases)) {
    const phase = phases?.[reference.value];
    if (!isRecord(phase) || phase.name !== JSON.stringify(LOCALIZED_NAMES_PHASE)) continue;
    assertOwnedScript(phase.shellScript);
    if (phases !== undefined) {
      delete phases[reference.value];
      delete phases[`${reference.value}_comment`];
    }
    target.buildPhases = requireReferences(target.buildPhases).filter(
      ({value}) => value !== reference.value,
    );
  }
  if (!enabled) return;

  const result: {buildPhase: Record<string, unknown>} = project.addBuildPhase(
    [],
    'PBXShellScriptBuildPhase',
    LOCALIZED_NAMES_PHASE,
    targetUuid,
    {shellPath: '/bin/sh', shellScript: '', inputPaths: [], outputPaths: [JSON.stringify(LOCALIZED_NAMES_STAMP)]},
  );
  const body = createLocalizedNamesScript(projectDirectory);
  const script = `# expo-native-variants:localized-names ${hash(body)}\n${body}`;
  result.buildPhase.shellScript = JSON.stringify(script);
  result.buildPhase.inputFileListPaths = [
    JSON.stringify(
      `$(SRCROOT)/${projectDirectory}/${VARIANT_DIRECTORY}/$(${VARIANT_KEY_BUILD_SETTING}).xcfilelist`,
    ),
  ];
  // Resource copying can rewrite InfoPlist.strings without changing this phase's inputs.
  result.buildPhase.alwaysOutOfDate = 1;
}

function createStringsFile(displayName: string): string {
  const escaped = displayName
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n');
  return `CFBundleDisplayName = "${escaped}";\n`;
}

function shellEscape(value: string): string {
  return value.replace(/(["\\$`])/g, '\\$1');
}

function assertOwnedScript(value: unknown): void {
  if (typeof value !== 'string') throw new Error('Invalid localized names build phase.');
  const script: unknown = JSON.parse(value);
  if (typeof script === 'string') {
    const newline = script.indexOf('\n');
    if (
      script.slice(0, newline) ===
      `# expo-native-variants:localized-names ${hash(script.slice(newline + 1))}`
    ) {
      return;
    }
  }
  throw new Error('expo-native-variants will not replace a modified localized names build phase.');
}

function requireReferences(value: unknown): {value: string; comment?: string}[] {
  if (!Array.isArray(value)) throw new Error('Invalid Xcode build phases.');
  return value.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.value !== 'string') {
      throw new Error('Invalid Xcode build phase reference.');
    }
    return {
      value: entry.value,
      ...(typeof entry.comment === 'string' ? {comment: entry.comment} : {}),
    };
  });
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid Xcode application target.');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
