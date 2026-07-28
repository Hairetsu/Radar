import { Eraser } from "lucide-react";
import type { WebSocketDomain } from "../../hooks/workbench/useWebSocketDomain";
import { Button } from "../ui/button";

export type WebSocketViewActionsProps = Pick<WebSocketDomain, "clearWebSocketEvents"> & {
  onClearSelection: () => void;
};

export function WebSocketViewActions({
  clearWebSocketEvents,
  onClearSelection
}: WebSocketViewActionsProps) {
  return (
    <Button
      variant="icon"
      size="icon"
      onClick={() => {
        void clearWebSocketEvents();
        onClearSelection();
      }}
      title="Clear WebSocket frames"
      data-testid="clearWebSocketEvents"
      data-component="clearWebSocketEvents"
    >
      <Eraser size={15} strokeWidth={1.7} />
    </Button>
  );
}
