import type React from "react";
import type { RadarApi } from "../shared/radar-api";
import type { RadarAiOperatorApi } from "../shared/api/aiOperatorApi";
import type { RadarWindowRole } from "../shared/windowCoordination";

declare global {
  interface Window {
    radar?: RadarApi;
    radarOperator?: RadarAiOperatorApi;
    radarSurface?: RadarWindowRole;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          allowpopups?: boolean | string;
          webpreferences?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
