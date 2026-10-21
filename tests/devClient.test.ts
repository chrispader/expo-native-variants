import {describe, expect, it} from 'vitest';

import {configPlugins} from '../src/configPlugins';
import {DEV_SERVER_APPLICATION_IDS, withDevServerDiscovery} from '../src/devClient';
import {normalizeNativeVariants} from '../src/options';

describe('development server discovery', () => {
  it('embeds every platform identifier independently of the selected variant', async () => {
    const options = normalizeNativeVariants({
      configName: 'Acme',
      options: {variant: 'production', variants: {
        production: {applicationId: 'com.acme.app'},
        development: {applicationId: 'com.acme.app.dev',
          ios: {bundleIdentifier: 'com.acme.ios.dev'},
          android: {applicationId: 'com.acme.android.dev'},
        },
      }},
    });
    const config = await configPlugins.compileModsAsync(
      withDevServerDiscovery({
        name: 'Acme', slug: 'acme',
        ios: {infoPlist: {[DEV_SERVER_APPLICATION_IDS]: ['com.acme.removed'], NeighborMarker: 'kept'}},
      }, options),
      {projectRoot: process.cwd(), introspect: true},
    );

    expect(config.ios?.infoPlist?.[DEV_SERVER_APPLICATION_IDS]).toEqual([
      'com.acme.app', 'com.acme.ios.dev',
    ]);
    expect(config.ios?.infoPlist?.NeighborMarker).toBe('kept');
    const manifest = config._internal?.modResults?.android?.manifest;
    const metadata = manifest?.manifest.application[0]['meta-data'];
    expect(metadata).toContainEqual({$: {
      'android:name': DEV_SERVER_APPLICATION_IDS,
      'android:value': JSON.stringify(['com.acme.app', 'com.acme.android.dev']),
    }});
  });
});
