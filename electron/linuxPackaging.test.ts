import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ARCH_PACMAN_DEPENDS = [
  "gtk3",
  "libnotify",
  "nss",
  "libxss",
  "libxtst",
  "xdg-utils",
  "at-spi2-core",
  "libsecret"
] as const;

const AUR_ONLY_PACMAN_DEPENDS = ["http-parser", "libappindicator-gtk3"] as const;

function readJsonObject(relativePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8")
  );
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${relativePath} must be a JSON object`);
  }
  return parsed;
}

function readStringRecord(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

describe("linux packaging", () => {
  const pkg = readJsonObject("../package.json");
  const build = readStringRecord(pkg.build, "package.json build");
  const linux = readStringRecord(build.linux, "package.json build.linux");
  const pacman = readStringRecord(build.pacman, "package.json build.pacman");
  const releaseWorkflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8"
  );

  it("ships an Arch pacman target with official-repo runtime depends", () => {
    expect(readStringArray(linux.target, "linux.target")).toEqual([
      "AppImage",
      "deb",
      "pacman"
    ]);
    expect(readStringArray(pacman.depends, "pacman.depends")).toEqual([
      ...ARCH_PACMAN_DEPENDS
    ]);
    expect(readStringArray(pacman.fpm, "pacman.fpm")).toEqual([
      "--pacman-compression=zstd"
    ]);
    expect(linux.synopsis).toBe(
      "Defensive web security workbench for authorized testing"
    );
    expect(pkg.homepage).toBe("https://github.com/Hairetsu/Radar");
  });

  it("does not require AUR-only pacman dependencies", () => {
    const depends = readStringArray(pacman.depends, "pacman.depends");
    for (const packageName of AUR_ONLY_PACMAN_DEPENDS) {
      expect(depends).not.toContain(packageName);
    }
  });

  it("publishes Arch packages from the Linux release job", () => {
    expect(releaseWorkflow).toContain("fakeroot libarchive-tools zstd");
    expect(releaseWorkflow).toContain("release/*.pacman");
    expect(releaseWorkflow).toContain("release/*.pkg.tar.*");
  });
});
