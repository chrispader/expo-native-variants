import type {XcodeProject} from 'expo/config-plugins';
import {describe, expect, it} from 'vitest';

import {patchDevLauncherStripPhase} from '../../src/ios/devLauncher';

const STRIP_PHASE_NAME = '"[Expo Dev Launcher] Strip Local Network Keys for Release"';

describe(patchDevLauncherStripPhase, () => {
  it('replaces the configuration name check with the Swift DEBUG condition', () => {
    const phase = {name: STRIP_PHASE_NAME, shellScript: stored('if [ "$CONFIGURATION" != "Debug" ]; then\n  strip\nfi\n')};

    patchDevLauncherStripPhase(createProject({PHASE: phase, PHASE_comment: 'Strip'}));
    patchDevLauncherStripPhase(createProject({PHASE: phase}));

    expect(phase.shellScript).not.toContain('$CONFIGURATION');
    expect(phase.shellScript).toContain(String.raw`case \" $SWIFT_ACTIVE_COMPILATION_CONDITIONS \" in`);
    expect(phase.shellScript).toContain(String.raw`if [ \"$IS_DEBUG_BUILD\" != \"1\" ]; then`);
    expect(phase.shellScript).toContain('\n  strip\nfi\n');
  });

  it('leaves other phases and already fixed dev-launcher scripts untouched', () => {
    const other = {name: '"Other"', shellScript: stored('if [ "$CONFIGURATION" != "Debug" ]; then\nfi\n')};
    const fixed = {name: STRIP_PHASE_NAME, shellScript: stored('case " $SWIFT_ACTIVE_COMPILATION_CONDITIONS " in\nesac\n')};
    const before = [other.shellScript, fixed.shellScript];

    patchDevLauncherStripPhase(createProject({OTHER: other, FIXED: fixed}));

    expect([other.shellScript, fixed.shellScript]).toEqual(before);
  });
});

/** Matches how the xcode package stores scripts added with addBuildPhase. */
function stored(script: string): string {
  return `"${script.replaceAll('"', '\\"')}"`;
}

function createProject(phases: Record<string, unknown>): XcodeProject {
  return {hash: {project: {objects: {PBXShellScriptBuildPhase: phases}}}} as unknown as XcodeProject;
}
