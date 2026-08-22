import type { RadarApi } from "../shared/radar-api";
import type { RadarAiOperatorApi } from "../shared/api/aiOperatorApi";
import type { RadarWindowRole } from "../shared/windowCoordination";

declare global {
  interface Window {
    radar?: RadarApi;
    radarOperator?: RadarAiOperatorApi;
    radarSurface?: RadarWindowRole;
  }

}

export {};
