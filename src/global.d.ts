import type React from "react";
import type { RadarApi } from "../shared/radar-api";

declare global {
  interface Window {
    radar?: RadarApi;
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
