import type React from "react";
import type { RadarApi } from "./types";

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
