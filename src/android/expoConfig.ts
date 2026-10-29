import type {NormalizedNativeVariantsOptions} from '../options';

export const EXPO_CONFIG_COMMAND =
  "require(require('path').join(require('path').dirname(require.resolve('expo-constants/package.json', { paths: [process.argv[2]] })), 'scripts/getAppConfig.js'))";

/**
 * App assets override expo-constants' shared library asset for each variant. The
 * variant API wires the generated assets into every consumer, including lint, and
 * needs a task class, which Groovy only allows at the top level of the script.
 */
export function createExpoConfigGradle(options: NormalizedNativeVariantsOptions): string {
  const variants = options.variants
    .map(({key, androidFlavor}) => `    ${JSON.stringify(androidFlavor)}: ${JSON.stringify(key)}`)
    .join(',\n');
  return `def nativeVariantKeys = [
${variants}
]

abstract class NativeVariantConfigTask extends Exec {
    @OutputDirectory
    abstract DirectoryProperty getAssetsDirectory()
}

androidComponents {
    onVariants(selector().all()) { variant ->
        def variantKey = nativeVariantKeys[variant.flavorName]
        if (variantKey == null) {
            return
        }
        def reactExtension = project.extensions.getByType(com.facebook.react.ReactExtension)
        def root = reactExtension.root.get().asFile
        def configTask = tasks.register("generateNativeVariantConfig" + variant.name.capitalize(), NativeVariantConfigTask) {
            workingDir(root)
            environment("EXPO_NATIVE_VARIANT_KEY", variantKey)
            commandLine(*reactExtension.nodeExecutableAndArgs.get(), "-e",
                ${JSON.stringify(EXPO_CONFIG_COMMAND)},
                "--", "expo-native-variants", root.absolutePath)
            argumentProviders.add({ [assetsDirectory.get().asFile.absolutePath] } as CommandLineArgumentProvider)
            outputs.upToDateWhen { false }
        }
        variant.sources.assets?.addGeneratedSourceDirectory(configTask) { it.assetsDirectory }
    }
}`;
}
