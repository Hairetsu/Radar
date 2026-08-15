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
9. After publishing succeeds, the release workflow merges the exact released tag into a temporary branch based on current `develop` and opens a `master`-history sync pull request with the maintainer-owned `RELEASE_SYNC_TOKEN` credential.
10. Backmerge CI verifies the sync commit shape, exact released-tag parent, `develop` ancestry, and package version. It skips the full unit, build, and UI suites because those already passed before the immutable tag was published.
11. The release workflow waits for the sync pull request's required checks, then the bot merges it into `develop`, preserving the release commit and version metadata in both branch histories. The resulting backmerge push also skips promotion, preventing a recursive release loop.

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

One-time repository setup for release backmerges:

1. Create a fine-grained personal access token from a maintainer account, restrict repository access to `Hairetsu/Radar`, grant only **Pull requests: Read and write**, and set an expiration.
2. Store it as the repository Actions secret `RELEASE_SYNC_TOKEN`. From an authenticated GitHub CLI session, `gh secret set RELEASE_SYNC_TOKEN --repo Hairetsu/Radar` prompts for the value without writing it to this repository.

- Pull request workflows from first-time external contributors require approval from a maintainer with write access. Returning contributors and owner-authored workflows run normally.
- Pull request CI receives read-only repository contents permission and no repository secrets.
- Post-merge CI resolves the associated pull request and reads the GitHub Actions check runs on its exact head SHA. Promotion fails closed if either required check is missing or unsuccessful.
- Superseded CI runs for the same pull request are canceled, and every job has a bounded timeout.
- Workflow actions are pinned to full commit SHAs and repository Actions policy limits third-party actions to the explicitly approved set.
- Repository workflow permissions default to read-only. The release-sync job narrows its built-in token to `actions: read`, `contents: write`, and `pull-requests: write`; it uses that token to push the temporary branch, observe CI, and merge the protected pull request after its required checks pass.
- The `release` environment requires approval from `Hairetsu` before the workflow can create a version commit or tag, start macOS/Windows/Linux packaging, upload artifacts, or publish a release.
- A release sync uses the immutable released tag rather than the moving `master` tip, so a later promotion cannot be pulled into an earlier release's sync operation.
- The `RELEASE_SYNC_TOKEN` repository secret is a fine-grained personal access token owned by a maintainer, limited to this repository, with **Pull requests: Read and write** permission and an expiration date. Only `gh pr create` receives it. GitHub therefore schedules normal `pull_request` CI for the generated PR instead of placing the workflow in the approval-required state used for PRs opened by `GITHUB_TOKEN`.
- The release-sync path does not depend on contributor-approval state. It waits for CI on the exact sync SHA and verifies successful required `test` and `ui-regression` checks before merging. The CI workflow recognizes the trusted `automation/sync-v*` ref and runs only released-tag integrity verification; first-time external pull requests still retain the repository's normal approval policy.
- Temporary release artifacts expire after three days; published GitHub Releases remain available normally.
