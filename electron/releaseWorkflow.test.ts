import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const releaseWorkflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8"
);
const ciWorkflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8"
);
const codeOwners = readFileSync(
  new URL("../.github/CODEOWNERS", import.meta.url),
  "utf8"
);

describe("release sync workflow", () => {
  it("opens the backmerge pull request as a maintainer and waits for protected checks", () => {
    expect(releaseWorkflow.match(/secrets\.RELEASE_SYNC_TOKEN/g)).toHaveLength(1);
    expect(releaseWorkflow).toContain('if [ -z "${GH_TOKEN}" ]');
    expect(releaseWorkflow).toContain("--event pull_request");
    expect(releaseWorkflow).toContain('gh pr checks "${PR_URL}" --required');
    expect(releaseWorkflow).not.toContain("gh workflow run ci.yml");
  });

  it("recognizes only same-repository release-sync pull request refs", () => {
    expect(ciWorkflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository && startsWith(github.head_ref, 'automation/sync-v')"
    );
    expect(ciWorkflow).not.toContain(
      "github.event.pull_request.user.login == 'github-actions[bot]'"
    );
  });

  it("assigns all GitHub automation configuration to the repository owner", () => {
    expect(codeOwners).toContain("/.github/ @Hairetsu");
  });
});
