import type { AiAgentApi } from "./api/aiAgentApi.js";
import type { BrowserCaptureApi } from "./api/browserCaptureApi.js";
import type { EvidenceExtensionsApi } from "./api/evidenceExtensionsApi.js";
import type { IdentityApi } from "./api/identityApi.js";
import type { LocalProjectApi } from "./api/localProjectApi.js";
import type { TestingApi } from "./api/testingApi.js";
import type { WindowCoordinationApi } from "./api/windowCoordinationApi.js";

export type RadarApi = AiAgentApi &
  BrowserCaptureApi &
  EvidenceExtensionsApi &
  IdentityApi &
  LocalProjectApi &
  TestingApi &
  WindowCoordinationApi;

export type {
  AiAgentApi,
  BrowserCaptureApi,
  EvidenceExtensionsApi,
  IdentityApi,
  LocalProjectApi,
  TestingApi,
  WindowCoordinationApi
};
