# Branching and promotion

Radar uses `develop` for integration and `master` for released code.

## Ship a change

1. Create a feature branch from `develop`.
2. Open a pull request into `develop`.
3. Bring the branch up to date with `develop`.
4. Merge only after the required `test` and `ui-regression` checks pass on the pull-request head.
5. The `develop` push verifies the associated merge and those exact check runs. It does not rerun the same suites.
6. CI merges the verified `develop` tree into `master` and proves that the promoted tree is identical.
7. Promotion dispatches the release workflow from `master`.
8. Release tests run with read-only repository access.
9. Versioning, tagging, packaging, and publishing wait for approval on the protected `release` environment.
10. After publish, the release workflow opens a pull request that brings the immutable released tag back into current `develop`.
11. Backmerge CI verifies the released tag, commit shape, ancestry, and package version before the bot merges the synchronization pull request.

The backmerge does not rerun the full suites. Those suites already passed on the exact code that became the immutable tag. The resulting `develop` push also skips promotion, which prevents a release loop.

## Protected branches

`develop` is the default and protected integration branch:

- Direct pushes, force pushes, and deletion are blocked.
- Pull requests are required.
- `test` and `ui-regression` are required checks.
- Pull-request branches must be current with `develop`.
- `.github/` is owned by `@Hairetsu` through `.github/CODEOWNERS`.
- The ruleset requires code-owner review for `.github/` and gives only `Hairetsu` an owner-maintenance bypass.

`master` is protected from force pushes and deletion. It does not require pull requests because the verified promotion job pushes the release merge.

## Release authority

The protected `release` environment requires approval from `Hairetsu` before the workflow can create a version commit or tag, package platforms, upload artifacts, or publish a release.

Repository workflow permissions default to read-only. The release synchronization job narrows its built-in token to `actions: read`, `contents: write`, and `pull-requests: write` for the temporary branch, check observation, and merge.

Creating the synchronization pull request needs a maintainer-owned fine-grained token so GitHub schedules normal `pull_request` CI. Create one with access only to `Hairetsu/Radar`, grant **Pull requests: Read and write**, set an expiration, and save it as `RELEASE_SYNC_TOKEN`:

```bash
gh secret set RELEASE_SYNC_TOKEN --repo Hairetsu/Radar
```

Only `gh pr create` receives that secret.

## CI safety rules

- First-time external pull requests need maintainer approval before workflows run.
- External pull-request CI receives read-only repository contents and no repository secrets.
- Superseded runs for the same pull request are canceled.
- Every job has a timeout.
- Workflow actions are pinned to full commit SHAs and repository policy limits the allowed action set.
- Promotion fails closed if the exact pull-request head is missing either required successful check.
- Release synchronization uses the immutable tag, not the moving `master` branch.
- Trusted `automation/sync-v*` branches run only release-tag integrity checks.
- Temporary release artifacts expire after three days. Published GitHub Releases remain available.
