# Contributing

## Name pull requests and commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for pull request titles and commit messages. Release Please reads the commits on `main` to choose the next version and generate the changelog.

Write a type, an optional scope, and a short description:

```text
fix(ios): treat variant debug configurations as debug builds
feat: support Expo SDK 58
```

Use `fix:` for bug fixes and `feat:` for new capabilities. Use `docs:` for documentation, `test:` for tests, and `chore:` for maintenance. Choose the type that describes the change, since it affects the release version.

Mark breaking changes with `!` before the colon, such as `feat!: change the variant configuration format`, or add a `BREAKING CHANGE:` footer to the commit body that explains the change and how to migrate.

When squash merging, check the final commit title and body before confirming the merge. GitHub can use a single commit's title instead of the PR title. Keep the final title in Conventional Commit format and preserve any breaking-change footer in the body.

When merging without squashing, use the same format for each change commit that reaches `main`. Direct commits to `main` follow the same convention.

See [RELEASING.md](./RELEASING.md) for the version bump rules and publishing process.
