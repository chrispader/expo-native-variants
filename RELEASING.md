# Releasing

Releases are driven by conventional commits on `main`. Release Please keeps a release pull request up to date with the next version and changelog; merging that pull request creates the `v<version>` tag and GitHub release, validates the package, and publishes it to npm through trusted publishing.

`fix:` commits request a patch release, `feat:` commits request a minor release, and commits with a breaking-change marker request a major release. Other commit types do not normally request a release.

The current configuration publishes alpha prereleases. Prerelease versions use the npm `next` tag, while stable versions use `latest`. To promote the package to a stable release, change `prerelease` to `false` and `versioning` to `default` in `release-please-config.json`, then merge the resulting release pull request.

If package publication fails after the GitHub release was created, run the release workflow manually with the existing release tag. The workflow verifies that the tag matches `package.json` before attempting publication again.
