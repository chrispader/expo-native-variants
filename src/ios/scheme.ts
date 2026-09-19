import {configPlugins} from '../configPlugins';
import type {NormalizedNativeVariant} from '../options';

const {XML} = configPlugins;

type SchemeXmlValue = string | SchemeXmlObject | SchemeXmlValue[];
type SchemeXmlObject = {[key: string]: SchemeXmlValue};

type CreateSchemeArgs = Readonly<{
  variant: NormalizedNativeVariant;
  targetUuid: string;
  targetName: string;
  productName: string;
  projectName: string;
}>;

export function createScheme(args: CreateSchemeArgs): SchemeXmlObject {
  const {variant} = args;
  const debugBuildable = createBuildableReference(args);
  const releaseBuildable = createBuildableReference(args);
  const runConfiguration =
    variant.runMode === 'debug' ? variant.debugConfiguration : variant.releaseConfiguration;

  return {
    Scheme: {
      $: {LastUpgradeVersion: '1600', version: '1.7'},
      BuildAction: [
        {
          $: {
            buildImplicitDependencies: 'YES',
            parallelizeBuildables: 'YES',
          },
          BuildActionEntries: [
            {
              BuildActionEntry: [
                {
                  $: {
                    buildForAnalyzing: 'YES',
                    buildForArchiving: 'YES',
                    buildForProfiling: 'YES',
                    buildForRunning: 'YES',
                    buildForTesting: 'YES',
                  },
                  BuildableReference: [debugBuildable],
                },
              ],
            },
          ],
        },
      ],
      TestAction: [
        {
          $: {
            buildConfiguration: variant.debugConfiguration,
            selectedDebuggerIdentifier: 'Xcode.DebuggerFoundation.Debugger.LLDB',
            selectedLauncherIdentifier: 'Xcode.DebuggerFoundation.Launcher.LLDB',
            shouldUseLaunchSchemeArgsEnv: 'YES',
          },
          Testables: [''],
        },
      ],
      LaunchAction: [
        {
          $: {
            buildConfiguration: runConfiguration,
            debugDocumentVersioning: 'YES',
            debugServiceExtension: 'internal',
            ignoresPersistentStateOnLaunch: 'NO',
            launchStyle: '0',
            selectedDebuggerIdentifier: 'Xcode.DebuggerFoundation.Debugger.LLDB',
            selectedLauncherIdentifier: 'Xcode.DebuggerFoundation.Launcher.LLDB',
            useCustomWorkingDirectory: 'NO',
          },
          BuildableProductRunnable: [
            {
              $: {runnableDebuggingMode: '0'},
              BuildableReference: [debugBuildable],
            },
          ],
        },
      ],
      ProfileAction: [
        {
          $: {
            buildConfiguration: variant.releaseConfiguration,
            debugDocumentVersioning: 'YES',
            shouldUseLaunchSchemeArgsEnv: 'YES',
            savedToolIdentifier: '',
            useCustomWorkingDirectory: 'NO',
          },
          BuildableProductRunnable: [
            {
              $: {runnableDebuggingMode: '0'},
              BuildableReference: [releaseBuildable],
            },
          ],
        },
      ],
      AnalyzeAction: [{$: {buildConfiguration: variant.debugConfiguration}}],
      ArchiveAction: [
        {
          $: {
            buildConfiguration: variant.releaseConfiguration,
            revealArchiveInOrganizer: 'YES',
          },
        },
      ],
    },
  };
}

export function formatScheme(scheme: SchemeXmlObject): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${XML.format(scheme)}\n`;
}

export async function schemesEqual(left: string, right: string): Promise<boolean> {
  const [parsedLeft, parsedRight] = await Promise.all([
    XML.parseXMLAsync(left),
    XML.parseXMLAsync(right),
  ]);
  return JSON.stringify(parsedLeft) === JSON.stringify(parsedRight);
}

function createBuildableReference({
  targetUuid,
  targetName,
  productName,
  projectName,
}: Omit<CreateSchemeArgs, 'variant'>): SchemeXmlObject {
  return {
    $: {
      BuildableIdentifier: 'primary',
      BlueprintIdentifier: targetUuid,
      BuildableName: `${productName}.app`,
      BlueprintName: targetName,
      ReferencedContainer: `container:${projectName}.xcodeproj`,
    },
  };
}
