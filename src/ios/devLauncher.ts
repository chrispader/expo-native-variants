import type {XcodeProject} from 'expo/config-plugins';

const STRIP_PHASE_NAME = '[Expo Dev Launcher] Strip Local Network Keys for Release';
// expo-dev-launcher 57 strips its local network keys from every configuration not named Debug.
const NAME_CHECK = 'if [ "$CONFIGURATION" != "Debug" ]; then';
// The check from expo/expo#48101, which later expo-dev-launcher releases ship.
const DEBUG_CONDITION_CHECK = `case " $SWIFT_ACTIVE_COMPILATION_CONDITIONS " in
  *" DEBUG "*) IS_DEBUG_BUILD=1 ;;
  *) IS_DEBUG_BUILD=0 ;;
esac

if [ "$IS_DEBUG_BUILD" != "1" ]; then`;

export function patchDevLauncherStripPhase(project: XcodeProject): void {
  const phases: Record<string, unknown> =
    project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
  for (const phase of Object.values(phases)) {
    if (
      typeof phase !== 'object' || phase === null ||
      !('name' in phase) || phase.name !== JSON.stringify(STRIP_PHASE_NAME) ||
      !('shellScript' in phase) || typeof phase.shellScript !== 'string'
    ) {
      continue;
    }
    phase.shellScript = phase.shellScript.replace(
      escapeScript(NAME_CHECK),
      escapeScript(DEBUG_CONDITION_CHECK),
    );
  }
}

/** The pbxproj stores scripts as quoted strings with escaped quotes. */
function escapeScript(value: string): string {
  return value.replaceAll('"', '\\"').replaceAll('\n', '\\n');
}
