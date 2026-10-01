import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {configPlugins} from '../../src/configPlugins';
import {
  reconcileIosUpdateChannelPhase,
  UPDATE_CHANNEL_PHASE,
  UPDATE_CHANNEL_SCRIPT,
} from '../../src/ios/updates';

const TARGET = '13B07F861A680F5B00A75B9A';
const EXPO_PLIST = '$(SRCROOT)/Acme/Supporting/Expo.plist';
const FOREIGN_SCRIPT = 'echo "bundle react native"';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe(reconcileIosUpdateChannelPhase, () => {
  it('adds one phase with the owned script, plist input and always-run flag', async () => {
    const root = await writeProject();
    const project = load(root);
    reconcileIosUpdateChannelPhase({project, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: true});

    const [phase] = channelPhases(project);
    expect(channelPhases(project)).toHaveLength(1);
    expect(phase).toMatchObject({shellPath: '/bin/sh', alwaysOutOfDate: 1});
    expect(phase?.inputPaths).toEqual([JSON.stringify(EXPO_PLIST)]);
    expect(JSON.parse(String(phase?.shellScript))).toContain(UPDATE_CHANNEL_SCRIPT);
    expect(targetPhaseComments(project)).toContain(UPDATE_CHANNEL_PHASE);
  });

  it('accepts its own phase after a real write and re-parse, without duplicating it', async () => {
    const root = await writeProject();
    const first = load(root);
    reconcileIosUpdateChannelPhase({project: first, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: true});
    await save(root, first);

    const second = load(root);
    expect(() => reconcileIosUpdateChannelPhase({
      project: second, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: true,
    })).not.toThrow();
    expect(channelPhases(second)).toHaveLength(1);
    expect(targetPhaseComments(second).filter((name) => name === UPDATE_CHANNEL_PHASE)).toHaveLength(1);
  });

  it('replaces the phase when the plist input path changes', async () => {
    const root = await writeProject();
    const first = load(root);
    reconcileIosUpdateChannelPhase({project: first, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: true});
    await save(root, first);

    const second = load(root);
    reconcileIosUpdateChannelPhase({
      project: second, targetUuid: TARGET, expoPlistPath: '$(SRCROOT)/Other/Expo.plist', enabled: true,
    });
    expect(channelPhases(second).map(({inputPaths}) => inputPaths))
      .toEqual([[JSON.stringify('$(SRCROOT)/Other/Expo.plist')]]);
  });

  it('removes only its own phase when disabled and keeps unrelated phases', async () => {
    const root = await writeProject();
    const first = load(root);
    reconcileIosUpdateChannelPhase({project: first, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: true});
    await save(root, first);

    const second = load(root);
    reconcileIosUpdateChannelPhase({project: second, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: false});
    await save(root, second);

    const third = load(root);
    expect(channelPhases(third)).toHaveLength(0);
    expect(targetPhaseComments(third)).toEqual(['Sources', 'Bundle React Native code and images']);
    expect(Object.keys(shellPhases(third)).filter((key) => !key.endsWith('_comment')))
      .toEqual(['FOREIGN_PHASE']);
  });

  it('refuses to replace or remove a manually edited phase', async () => {
    const root = await writeProject();
    const first = load(root);
    reconcileIosUpdateChannelPhase({project: first, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: true});
    const [phase] = channelPhases(first);
    if (phase === undefined) throw new Error('phase missing');
    phase.shellScript = JSON.stringify(`${JSON.parse(String(phase.shellScript))}\n# manual edit`);
    await save(root, first);

    for (const enabled of [true, false]) {
      const edited = load(root);
      expect(() => reconcileIosUpdateChannelPhase({
        project: edited, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled,
      })).toThrow('will not replace a modified update channel build phase');
      expect(channelPhases(edited)).toHaveLength(1);
    }
  });

  it('rejects a phase whose script is not a string', async () => {
    const root = await writeProject();
    const first = load(root);
    reconcileIosUpdateChannelPhase({project: first, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: true});
    const [phase] = channelPhases(first);
    if (phase === undefined) throw new Error('phase missing');
    delete phase.shellScript;
    expect(() => reconcileIosUpdateChannelPhase({
      project: first, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: true,
    })).toThrow('Invalid native update channel build phase.');
  });

  it('removes every owned phase when more than one is present', async () => {
    const root = await writeProject();
    const first = load(root);
    reconcileIosUpdateChannelPhase({project: first, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: true});
    await save(root, first);

    const duplicated = load(root);
    const [phase] = channelPhases(duplicated);
    const target = duplicated.pbxNativeTargetSection()[TARGET] as {buildPhases: {value: string; comment: string}[]};
    shellPhases(duplicated).DUPLICATE_PHASE = {...phase};
    shellPhases(duplicated).DUPLICATE_PHASE_comment = UPDATE_CHANNEL_PHASE;
    target.buildPhases.push({value: 'DUPLICATE_PHASE', comment: UPDATE_CHANNEL_PHASE});
    expect(channelPhases(duplicated)).toHaveLength(2);

    reconcileIosUpdateChannelPhase({project: duplicated, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: false});
    expect(channelPhases(duplicated)).toHaveLength(0);
    expect(targetPhaseComments(duplicated)).toEqual(['Sources', 'Bundle React Native code and images']);
  });

  it('rejects a missing target and a target without build phases', async () => {
    const project = load(await writeProject());
    expect(() => reconcileIosUpdateChannelPhase({
      project, targetUuid: 'MISSING', expoPlistPath: EXPO_PLIST, enabled: true,
    })).toThrow('Invalid Xcode application target.');
    delete (project.pbxNativeTargetSection()[TARGET] as {buildPhases?: unknown}).buildPhases;
    expect(() => reconcileIosUpdateChannelPhase({
      project, targetUuid: TARGET, expoPlistPath: EXPO_PLIST, enabled: true,
    })).toThrow('Invalid Xcode build phases.');
  });
});

function load(root: string) {
  return configPlugins.IOSConfig.XcodeUtils.getPbxproj(root);
}

async function save(root: string, project: ReturnType<typeof load>): Promise<void> {
  await writeFile(configPlugins.IOSConfig.Paths.getPBXProjectPath(root), project.writeSync(), 'utf8');
}

function shellPhases(project: ReturnType<typeof load>): Record<string, unknown> {
  return project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
}

function channelPhases(project: ReturnType<typeof load>): Record<string, unknown>[] {
  return Object.values(shellPhases(project)).filter(isRecord)
    .filter(({name}) => name === JSON.stringify(UPDATE_CHANNEL_PHASE));
}

function targetPhaseComments(project: ReturnType<typeof load>): string[] {
  const target = project.pbxNativeTargetSection()[TARGET] as {buildPhases: {comment: string}[]};
  return target.buildPhases.map(({comment}) => comment);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function writeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'native-variants-pbx-'));
  roots.push(root);
  const directory = path.join(root, 'ios/Acme.xcodeproj');
  await mkdir(directory, {recursive: true});
  await writeFile(path.join(directory, 'project.pbxproj'), PBXPROJ, 'utf8');
  return root;
}

const PBXPROJ = `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 46;
	objects = {

/* Begin PBXNativeTarget section */
		${TARGET} /* Acme */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = 13B07F931A680F5B00A75B9A /* Build configuration list for PBXNativeTarget "Acme" */;
			buildPhases = (
				13B07F871A680F5B00A75B9A /* Sources */,
				FOREIGN_PHASE /* Bundle React Native code and images */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = Acme;
			productName = Acme;
			productType = "com.apple.product-type.application";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		83CBB9F71A601CBA00E9B192 /* Project object */ = {
			isa = PBXProject;
			buildConfigurationList = 83CBB9FA1A601CBA00E9B192 /* Build configuration list for PBXProject "Acme" */;
			compatibilityVersion = "Xcode 3.2";
			mainGroup = 83CBB9F61A601CBA00E9B192;
			targets = (
				${TARGET} /* Acme */,
			);
		};
/* End PBXProject section */

/* Begin PBXShellScriptBuildPhase section */
		FOREIGN_PHASE /* Bundle React Native code and images */ = {
			isa = PBXShellScriptBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			name = "Bundle React Native code and images";
			runOnlyForDeploymentPostprocessing = 0;
			shellPath = /bin/sh;
			shellScript = ${JSON.stringify(FOREIGN_SCRIPT)};
		};
/* End PBXShellScriptBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		13B07F871A680F5B00A75B9A /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */
	};
	rootObject = 83CBB9F71A601CBA00E9B192 /* Project object */;
}
`;
