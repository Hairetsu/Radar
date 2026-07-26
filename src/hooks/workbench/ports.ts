import type { WorkView } from "./viewMeta";

export type NavigationPort = {
  setActiveView: (view: WorkView) => void;
};

export type NoticePort = {
  setNotice: (notice: string) => void;
};

