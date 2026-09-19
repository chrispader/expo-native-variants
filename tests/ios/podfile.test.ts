import {describe, expect, it} from 'vitest';

import type {NormalizedNativeVariantsOptions} from '../../src/options';
import {updatePodfile} from '../../src/ios/podfile';

const options: NormalizedNativeVariantsOptions = {
  canonicalVariant: {
    key: 'production',
    displayName: 'Acme',
    iosBundleIdentifier: 'com.acme.app',
    androidApplicationId: 'com.acme.app',
    urlScheme: 'acme',
    runMode: 'release',
    iosScheme: 'Acme-Production',
    debugConfiguration: 'Debug-Production',
    releaseConfiguration: 'Release-Production',
    androidFlavor: 'production',
  },
  variants: [
    {
      key: 'development',
      displayName: 'Acme Dev',
      iosBundleIdentifier: 'com.acme.app.dev',
      androidApplicationId: 'com.acme.app.dev',
      urlScheme: 'acme-dev',
      runMode: 'debug',
      iosScheme: 'Acme-Development',
      debugConfiguration: 'Debug-Development',
      releaseConfiguration: 'Release-Development',
      androidFlavor: 'development',
    },
    {
      key: 'production',
      displayName: 'Acme',
      iosBundleIdentifier: 'com.acme.app',
      androidApplicationId: 'com.acme.app',
      urlScheme: 'acme',
      runMode: 'release',
      iosScheme: 'Acme-Production',
      debugConfiguration: 'Debug-Production',
      releaseConfiguration: 'Release-Production',
      androidFlavor: 'production',
    },
  ],
};

const podfile = `platform :ios, '16.4'

prepare_react_native_project!

target 'Acme' do
  use_expo_modules!
end
`;

describe(updatePodfile, () => {
  it('adds every debug and release mapping before the target', () => {
    const result = updatePodfile({contents: podfile, projectName: 'Acme', options});

    expect(result).toContain("project 'Acme', {");
    expect(result).toContain("'Debug-Development' => :debug");
    expect(result).toContain("'Release-Production' => :release");
    expect(result.indexOf("project 'Acme'")).toBeLessThan(result.indexOf("target 'Acme'"));
  });

  it('is idempotent', () => {
    const once = updatePodfile({contents: podfile, projectName: 'Acme', options});
    const twice = updatePodfile({contents: once, projectName: 'Acme', options});

    expect(twice).toBe(once);
  });

  it('rejects a foreign project mapping', () => {
    expect(() =>
      updatePodfile({
        contents: `project 'Acme', {'Debug' => :debug}\n${podfile}`,
        projectName: 'Acme',
        options,
      }),
    ).toThrow('already declares a CocoaPods project mapping');
  });

  it('rejects edits inside its generated mapping', () => {
    const generated = updatePodfile({contents: podfile, projectName: 'Acme', options});
    const modified = generated.replace(
      "'Debug-Development' => :debug",
      "'Debug-Development' => :release",
    );

    expect(() =>
      updatePodfile({contents: modified, projectName: 'Acme', options}),
    ).toThrow('generated contents were modified');
  });
});
