import type {NormalizedNativeVariantsOptions} from '../options';

export const EXPO_CONFIG_COMMAND =
  "require(require('path').join(require('path').dirname(require.resolve('expo-constants/package.json', { paths: [process.argv[2]] })), 'scripts/getAppConfig.js'))";

/** App assets override expo-constants' shared library asset for each flavor. */
export function createExpoConfigGradle(options: NormalizedNativeVariantsOptions): string {
  const variants = options.variants
    .map(
      ({key, androidFlavor}) => `        ${JSON.stringify(androidFlavor)}: ${JSON.stringify(key)}`,
    )
    .join(',\n');
  return `    def nativeVariantKeys = [
${variants}
    ]
    nativeVariantKeys.each { flavor, variantKey ->
        def configTask = tasks.register("generateNativeVariantConfig" + flavor.capitalize(), Exec) {
            def reactExtension = project.extensions.getByType(com.facebook.react.ReactExtension)
            def root = reactExtension.root.get().asFile
            def destination = layout.buildDirectory.dir("generated/nativeVariantConfig/" + flavor).get().asFile
            workingDir(root)
            environment("EXPO_NATIVE_VARIANT_KEY", variantKey)
            commandLine(*reactExtension.nodeExecutableAndArgs.get(), "-e",
                ${JSON.stringify(EXPO_CONFIG_COMMAND)},
                "--", "expo-native-variants", root.absolutePath, destination.absolutePath)
            doFirst { destination.mkdirs() }
            outputs.dir(destination)
            outputs.upToDateWhen { false }
        }
        sourceSets.getByName(flavor).assets.srcDir(configTask.map { it.outputs.files.singleFile })
        applicationVariants.all { applicationVariant ->
            if (applicationVariant.flavorName == flavor) {
                applicationVariant.mergeAssetsProvider.configure { dependsOn(configTask) }
            }
        }
    }`;
}
