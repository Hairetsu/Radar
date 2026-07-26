# Branching And Promotion

Radar uses `develop` as the integration branch and `master` as the release branch.

## Flow

1. Create feature branches from `develop`.
2. Open pull requests from feature branches into `develop`.
3. Merge into `develop` only after the CI `test` job passes.
4. After `develop` is green, CI automatically merges `develop` into `master`.
5. The promotion job verifies the merge result with unit tests, linting, and a production build before pushing `master`.
6. Promotion dispatches the release workflow from `master`.
7. Release tests run with read-only repository access.
8. Versioning, tagging, platform packaging, and publishing wait for the repository owner to approve the protected `release` environment.

## Protected Branches

`develop` is protected:

- Direct pushes are blocked.
- Force pushes are blocked.
- Branch deletion is blocked.
- Pull requests are required.
- The CI `test` status check is required before merge.

`master` is protected against force pushes and deletion. It does not require pull requests because the CI promotion job needs to push the verified merge result automatically.

The CI `test` job and the promotion verification both run unit tests, linting, and a production build.

## Actions And Release Gates

- Pull request workflows from every external contributor require approval from a maintainer with write access. Owner-authored workflows run normally.
- Pull request CI receives read-only repository contents permission and no repository secrets.
- Superseded CI runs for the same pull request are canceled, and every job has a bounded timeout.
- Workflow actions are pinned to full commit SHAs and repository Actions policy limits third-party actions to the explicitly approved set.
- The `release` environment requires approval from `Hairetsu` before the workflow can create a version commit or tag, start macOS/Windows/Linux packaging, upload artifacts, or publish a release.
- Temporary release artifacts expire after three days; published GitHub Releases remain available normally.
