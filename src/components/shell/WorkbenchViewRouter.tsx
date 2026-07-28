import type {
  Dispatch,
  MouseEvent,
  MutableRefObject,
  SetStateAction
} from "react";
import { AdvancedView } from "../views/AdvancedView";
import { AutomateView } from "../views/AutomateView";
import { FindingsView } from "../views/FindingsView";
import { InterceptView } from "../views/InterceptView";
import { PluginsView } from "../views/PluginsView";
import { RepeaterView } from "../views/RepeaterView";
import { ScopeView } from "../views/ScopeView";
import { SitemapView } from "../views/SitemapView";
import { SslView } from "../views/SslView";
import { TrafficView } from "../views/TrafficView";
import { WebSocketView } from "../views/WebSocketView";
import { WorkflowsView } from "../views/WorkflowsView";
import type { RadarWorkbench } from "../../hooks/useRadarWorkbench";
import type {
  CapturedRequest,
  FindingTemplateId,
  WebSocketEvent
} from "../../types";

interface WorkbenchViewRouterProps {
  workbench: RadarWorkbench;
  findingTemplateId: FindingTemplateId;
  setFindingTemplateId: Dispatch<SetStateAction<FindingTemplateId>>;
  identityLabOpen: boolean;
  selectedWebSocketId: string;
  setSelectedWebSocketId: Dispatch<SetStateAction<string>>;
  selectedWebSocketIds: string[];
  setSelectedWebSocketIds: Dispatch<SetStateAction<string[]>>;
  webSocketSelectionAnchorRef: MutableRefObject<string>;
  selectedWebSocketEvent: WebSocketEvent | null;
  findingsBuildReportRef: MutableRefObject<(() => void) | null>;
  workflowActionsRef: MutableRefObject<{
    save: () => void;
    run: () => void;
  } | null>;
  onOpenRequestMenu: (
    event: MouseEvent<HTMLElement>,
    capture?: CapturedRequest | null
  ) => void;
}

export function WorkbenchViewRouter({
  workbench,
  findingTemplateId,
  setFindingTemplateId,
  identityLabOpen,
  selectedWebSocketId,
  setSelectedWebSocketId,
  selectedWebSocketIds,
  setSelectedWebSocketIds,
  webSocketSelectionAnchorRef,
  selectedWebSocketEvent,
  findingsBuildReportRef,
  workflowActionsRef,
  onOpenRequestMenu
}: WorkbenchViewRouterProps) {
  let activeView;
  switch (workbench.activeView) {
    case "traffic":
      activeView = (
        <TrafficView
          {...workbench}
          findingTemplateId={findingTemplateId}
          onOpenRequestMenu={onOpenRequestMenu}
        />
      );
      break;
    case "websocket":
      activeView = (
        <WebSocketView
          {...workbench}
          findingTemplateId={findingTemplateId}
          selectedWebSocketId={selectedWebSocketId}
          setSelectedWebSocketId={setSelectedWebSocketId}
          selectedWebSocketIds={selectedWebSocketIds}
          setSelectedWebSocketIds={setSelectedWebSocketIds}
          selectionAnchorRef={webSocketSelectionAnchorRef}
        />
      );
      break;
    case "intercept":
      activeView = <InterceptView {...workbench} />;
      break;
    case "repeater":
      activeView = <RepeaterView {...workbench} />;
      break;
    case "automate":
      activeView = <AutomateView {...workbench} />;
      break;
    case "findings":
      activeView = (
        <FindingsView
          {...workbench}
          findingTemplateId={findingTemplateId}
          setFindingTemplateId={setFindingTemplateId}
          selectedWebSocketEvent={selectedWebSocketEvent}
          buildReportRef={findingsBuildReportRef}
        />
      );
      break;
    case "workflows":
      activeView = (
        <WorkflowsView
          {...workbench}
          workflowActionsRef={workflowActionsRef}
        />
      );
      break;
    case "plugins":
      activeView = <PluginsView {...workbench} />;
      break;
    case "advanced":
      activeView = <AdvancedView {...workbench} identityLabOpen={identityLabOpen} />;
      break;
    case "sitemap":
      activeView = <SitemapView {...workbench} />;
      break;
    case "scope":
      activeView = <ScopeView {...workbench} />;
      break;
    case "ssl":
      activeView = <SslView {...workbench} />;
      break;
  }

  return activeView;
}
