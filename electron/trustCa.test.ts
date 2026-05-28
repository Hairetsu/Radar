import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn()
}));

vi.mock("node:child_process", () => ({
  execFileSync: mocks.execFileSync,
  spawnSync: mocks.spawnSync
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    mkdirSync: mocks.mkdirSync
  }
}));

import {
  ensureRadarKeychainInSearchList,
  readUserKeychainSearchList,
  setUserKeychainSearchList,
  trustProxyCa
} from "./trustCa.js";

describe("trustCa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    mocks.spawnSync.mockReturnValue({
      status: 0,
      stdout: '"login.keychain-db"\n'
    });
    mocks.execFileSync.mockImplementation((_cmd, args: string[]) => {
      if (args[0] === "find-certificate") {
        throw new Error("missing");
      }
    });
  });

  it("installs the proxy CA into a dedicated keychain on macOS", () => {
    const keychain = trustProxyCa("/tmp/radar-ca.pem", "/tmp/proxy-ca");
    expect(keychain).toBe("/tmp/proxy-ca/radar.keychain-db");
    expect(mocks.mkdirSync).toHaveBeenCalled();
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      "security",
      expect.arrayContaining(["create-keychain", "-p", "radar-proxy"]),
      expect.any(Object)
    );
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      "security",
      expect.arrayContaining(["add-trusted-cert", "-r", "trustRoot"]),
      expect.any(Object)
    );
  });

  it("prepends the radar keychain to the user search list", () => {
    const previous = ensureRadarKeychainInSearchList("/tmp/proxy-ca/radar.keychain-db");
    expect(previous).toEqual(["login.keychain-db"]);
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      "security",
      ["list-keychains", "-d", "user", "-s", "/tmp/proxy-ca/radar.keychain-db", "login.keychain-db"],
      expect.any(Object)
    );
  });

  it("parses the current user keychain search list", () => {
    expect(readUserKeychainSearchList()).toEqual(["login.keychain-db"]);
  });

  it("no-ops keychain search updates when empty", () => {
    setUserKeychainSearchList([]);
    expect(mocks.execFileSync).not.toHaveBeenCalled();
  });
});
