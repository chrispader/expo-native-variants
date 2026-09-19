'use strict';

const path = require('node:path');
const {getDefaultConfig} = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, '..');
config.watchFolders = [workspaceRoot];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-native-variants/runtime') {
    return {
      filePath: path.join(workspaceRoot, 'src', 'runtime', 'index.ts'),
      type: 'sourceFile',
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
