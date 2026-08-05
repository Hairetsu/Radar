# Branching And Promotion

Radar uses `develop` as the integration branch and `master` as the release branch.

## Flow

1. Create feature branches from `develop`.
2. Open pull requests from feature branches into `develop`.
3. Merge into `develop` only after the CI `test` and `ui-regression` jobs pass on the pull-request head.
4. The resulting `develop` push verifies that it is the associated merge commit and that both required GitHub Actions checks succeeded on its exact pull-request head. It does not rerun the suites.
5. CI merges verified `develop` into `master` and requires the promoted tree to match `develop` exactly before pushing.
6. Promotion dispatches the release workflow from `master`.
7. Release tests run with read-only repository access.
8. Versioning, tagging, platform packaging, and publishing wait for the repository owner to approve the protected `release` environment.
9. After publishing succeeds, the release workflow merges the exact released tag into a temporary branch based on current `develop`, opens a `master`-history sync pull request, and waits for its protected-branch check.
10. Backmerge CI verifies the sync commit shape, exact released-tag parent, `develop` ancestry, and package version. It skips the full unit, build, and UI suites because those already passed before the immutable tag was published.
11. The bot merges the verified sync pull request into `develop`, preserving the release commit and version metadata in both branch histories. The resulting backmerge push also skips promotion, preventing a recursive release loop.

## Protected Branches

`develop` is protected:

- Direct pushes are blocked.
- Force pushes are blocked.
- Branch deletion is blocked.
- Pull requests are required.
- Pull-request branches must be current with `develop` before merge so their successful checks cover the exact base used by the merge commit.
- The CI `test` and `ui-regression` status checks are required before merge.

`master` is protected against force pushes and deletion. It does not require pull requests because the CI promotion job needs to push the verified merge result automatically.

Pull-request CI runs unit tests, linting, a production build, and the blocking UI regression suite once. The post-merge gate reuses those successful check runs, while promotion verifies tree identity instead of rebuilding the same commit again.

`develop` is the repository's default branch because it is the integration target. `master` remains the released branch. The release-sync pull request keeps their ancestry and package version aligned after each successful release instead of allowing master-only merge and version commits to accumulate.

## Actions And Release Gates

- Pull request workflows from first-time external contributors require approval from a maintainer with write access. Returning contributors and owner-authored workflows run normally.
- Pull request CI receives read-only repository contents permission and no repository secrets.
- Post-merge CI resolves the associated pull request and reads the GitHub Actions check runs on its exact head SHA. Promotion fails closed if either required check is missing or unsuccessful.
- Superseded CI runs for the same pull request are canceled, and every job has a bounded timeout.
- Workflow actions are pinned to full commit SHAs and repository Actions policy limits third-party actions to the explicitly approved set.
- Repository workflow permissions default to read-only, with **Allow GitHub Actions to create and approve pull requests** enabled so the narrowly scoped release-sync job can open its protected-branch pull request. The job requests only `actions: read`, `contents: write`, and `pull-requests: write`.
- The `release` environment requires approval from `Hairetsu` before the workflow can create a version commit or tag, start macOS/Windows/Linux packaging, upload artifacts, or publish a release.
- A release sync uses the immutable released tag rather than the moving `master` tip, so a later promotion cannot be pulled into an earlier release's sync operation.
- The release-sync bot is treated as a returning contributor after the one-time bootstrap approval. Its pull request receives the normal required `test` check, but the workflow recognizes the trusted same-repository `automation/sync-v*` branch and runs only the released-tag integrity verification before merging.
- Temporary release artifacts expire after three days; published GitHub Releases remain available normally.
