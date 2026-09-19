import {defineConfig} from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    'config/index': 'src/config/index.ts',
    index: 'src/index.ts',
    'runtime/index': 'src/runtime/index.ts',
  },
  esbuildOptions(options) {
    options.logOverride = {'empty-import-meta': 'silent'};
  },
  external: ['expo/config', 'expo/config-plugins'],
  format: ['cjs', 'esm'],
  outExtension({format}) {
    return {js: format === 'esm' ? '.mjs' : '.js'};
  },
  outDir: 'dist',
  sourcemap: true,
  splitting: false,
  target: 'node20',
});
