# Release process

Every LO2S Pattern Lab release must include a version-to-version update log. A short highlights list is not a substitute for the changelog.

## Required release checklist

1. Compare the new release candidate with the previous published tag.
2. Add a dated section to `CHANGELOG.md` containing:
   - new features;
   - interface and workflow improvements;
   - bug fixes from the previous version;
   - compatibility or behavior changes;
   - known limitations;
   - packaged artifact names when applicable.
3. Update the current version and download link in `README.md`.
4. Use the same complete changelog section as the GitHub release notes; a shorter highlights block may appear above it, but must not replace it.
5. Run the application tests and production build before creating the tag.
6. Build and launch-check the Windows portable executable when desktop code changed.
7. Publish through a pull request and wait for required checks before merging or updating the public release.
8. Keep **Beta** in the version and title whenever the product is still being tested, but use GitHub's release status according to the distribution goal:
   - publish it as a normal **Latest** release when it is the primary public download and broad testing/feedback is wanted;
   - use GitHub **prerelease** only when the build should remain secondary to another recommended release.
   State clearly whether the build is the main download and whether it uses a separate application identity.

## Changelog categories

Use only the categories that apply, but do not omit fixes merely because they happened during beta testing:

- **New features** — new workspaces, controls, formats, integrations, and workflows.
- **Interface and workflow improvements** — layout, readability, navigation, feedback, and quality-of-life changes.
- **Bug fixes** — regressions and incorrect behavior fixed since the previous tag.
- **Compatibility notes** — protocol, file-format, platform, and importer behavior.
- **Known limitations** — unresolved performance, platform, format, or signing constraints.

Release notes should be understandable without reading commit messages or previous beta discussions.

