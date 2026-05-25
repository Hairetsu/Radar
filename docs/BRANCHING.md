# Branching And Promotion

Radar uses `develop` as the integration branch and `master` as the release branch.

## Flow

1. Create feature branches from `develop`.
2. Open pull requests from feature branches into `develop`.
3. Merge into `develop` only after the CI `test` job passes.
4. After `develop` is green, CI automatically merges `develop` into `master`.
5. The promotion job verifies the merge result with unit tests, linting, and a production build before pushing `master`.
6. A successful push to `master` runs the release workflow.

## Protected Branches

`develop` is protected:

- Direct pushes are blocked.
- Force pushes are blocked.
- Branch deletion is blocked.
- Pull requests are required.
- The CI `test` status check is required before merge.

`master` is protected against force pushes and deletion. It does not require pull requests because the CI promotion job needs to push the verified merge result automatically.

The CI `test` job and the promotion verification both run unit tests, linting, and a production build.
