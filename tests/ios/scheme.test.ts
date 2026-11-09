import {XML} from 'expo/config-plugins';
import {describe, expect, it} from 'vitest';

import {createScheme, formatScheme} from '../../src/ios/scheme';

const variant = {
  key: 'development',
  displayName: 'Acme Dev',
  iosBundleIdentifier: 'com.acme.app.dev',
  androidApplicationId: 'com.acme.app.dev',
  urlScheme: 'acme-dev',
  runMode: 'debug' as const,
  iosScheme: 'Acme-Development',
  debugConfiguration: 'Debug-Development',
  releaseConfiguration: 'Release-Development',
  androidFlavor: 'development',
};

describe(createScheme, () => {
  it('uses the real target UUID and the variant configurations for every action', async () => {
    const contents = formatScheme(
      createScheme({
        variant,
        targetUuid: 'TARGET_UUID',
        targetName: 'Acme',
        productName: 'Acme',
        projectName: 'Acme',
      }),
    );
    const parsed = await XML.parseXMLAsync(contents);

    expect(contents).toContain('BlueprintIdentifier="TARGET_UUID"');
    expect(contents).toContain('BuildableName="Acme.app"');
    expect(contents).toContain('buildConfiguration="Debug-Development"');
    expect(contents).toContain('buildConfiguration="Release-Development"');
    expect(parsed).toHaveProperty('Scheme.BuildAction');
  });

  it('uses the release configuration for Run when requested', () => {
    const contents = formatScheme(
      createScheme({
        variant: {...variant, runMode: 'release'},
        targetUuid: 'TARGET_UUID',
        targetName: 'Acme',
        productName: 'Acme',
        projectName: 'Acme',
      }),
    );

    expect(contents).toMatch(
      /<LaunchAction[\s\S]*?buildConfiguration="Release-Development"/,
    );
  });

  it('passes variant launch arguments and environment variables to the Run action', () => {
    const contents = formatScheme(
      createScheme({
        variant: {
          ...variant,
          iosLaunchArguments: ['-FIRDebugEnabled'],
          iosEnvironmentVariables: {API_URL: 'https://dev.acme.com?a=1&b=2'},
        },
        targetUuid: 'TARGET_UUID',
        targetName: 'Acme',
        productName: 'Acme',
        projectName: 'Acme',
      }),
    );

    expect(contents).toMatch(
      /<LaunchAction[\s\S]*<CommandLineArgument argument="-FIRDebugEnabled" isEnabled="YES"\/>[\s\S]*<EnvironmentVariable key="API_URL" value="https:\/\/dev.acme.com\?a=1&amp;b=2" isEnabled="YES"\/>[\s\S]*<\/LaunchAction>/,
    );
  });
});
