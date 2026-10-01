import {createHash} from 'node:crypto';

import type {XcodeProject} from 'expo/config-plugins';

export const UPDATE_CHANNEL_BUILD_SETTING = 'EXPO_NATIVE_VARIANT_UPDATE_CHANNEL';
export const UPDATE_CHANNEL_PHASE = '[expo-native-variants] Configure update channel';

// Expo.plist is a copied resource, so Xcode does not expand build settings in it.
export const UPDATE_CHANNEL_SCRIPT = `set -eu
destination="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/Expo.plist"
cp "$SCRIPT_INPUT_FILE_0" "$destination"
channel="\${EXPO_NATIVE_VARIANT_UPDATE_CHANNEL:-}"
if [ -n "$channel" ]; then
  /usr/libexec/PlistBuddy -c "Add :EXUpdatesRequestHeaders dict" "$destination" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Delete :EXUpdatesRequestHeaders:expo-channel-name" "$destination" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :EXUpdatesRequestHeaders:expo-channel-name string $channel" "$destination"
fi
`;

export function reconcileIosUpdateChannelPhase({
  project,
  targetUuid,
  expoPlistPath,
  enabled,
}: Readonly<{
  project: XcodeProject;
  targetUuid: string;
  expoPlistPath: string;
  enabled: boolean;
}>): void {
  const target = requireRecord(project.pbxNativeTargetSection()[targetUuid]);
  const phases: Record<string, unknown> | undefined =
    project.hash.project.objects.PBXShellScriptBuildPhase;
  const references = requireReferences(target.buildPhases);
  for (const reference of references) {
    const phase = phases?.[reference.value];
    if (!isRecord(phase) || phase.name !== JSON.stringify(UPDATE_CHANNEL_PHASE)) continue;
    assertOwnedScript(phase.shellScript);
    if (phases !== undefined) {
      delete phases[reference.value];
      delete phases[`${reference.value}_comment`];
    }
    target.buildPhases = requireReferences(target.buildPhases)
      .filter(({value}) => value !== reference.value);
  }
  if (!enabled) return;

  const result: {buildPhase: Record<string, unknown>} = project.addBuildPhase(
    [],
    'PBXShellScriptBuildPhase',
    UPDATE_CHANNEL_PHASE,
    targetUuid,
    {shellPath: '/bin/sh', shellScript: '', inputPaths: [JSON.stringify(expoPlistPath)]},
  );
  const script = `# expo-native-variants:updates ${hash(UPDATE_CHANNEL_SCRIPT)}\n${UPDATE_CHANNEL_SCRIPT}`;
  result.buildPhase.shellScript = JSON.stringify(script);
  result.buildPhase.alwaysOutOfDate = 1;
}

function assertOwnedScript(value: unknown): void {
  if (typeof value !== 'string') throw new Error('Invalid native update channel build phase.');
  let script: unknown;
  try {
    script = JSON.parse(value);
  } catch {
    // An unquoted pbxproj token is a hand edit, not our JSON-quoted script.
  }
  if (typeof script === 'string') {
    const newline = script.indexOf('\n');
    if (script.slice(0, newline) === `# expo-native-variants:updates ${hash(script.slice(newline + 1))}`) {
      return;
    }
  }
  throw new Error('expo-native-variants will not replace a modified update channel build phase.');
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
