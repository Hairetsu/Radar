import { FileLock2, Play } from "lucide-react";
import type { InterceptDomain } from "../../hooks/workbench/useInterceptDomain";
import { Button } from "../ui/button";

export type InterceptViewActionsProps = Pick<
  InterceptDomain,
  | "interceptState"
  | "setRequestInterceptEnabled"
  | "setResponseInterceptEnabled"
  | "resumeAllIntercepts"
>;

export function InterceptViewActions({
  interceptState,
  setRequestInterceptEnabled,
  setResponseInterceptEnabled,
  resumeAllIntercepts
}: InterceptViewActionsProps) {
  return (
    <>
      <Button
        variant={interceptState.config.requestEnabled ? "solid" : "outline"}
        type="button"
        onClick={() =>
          void setRequestInterceptEnabled(!interceptState.config.requestEnabled)
        }
        data-testid="toggleRequestIntercept"
        data-component="toggleRequestIntercept"
      >
        <FileLock2 size={14} strokeWidth={1.7} />
        {interceptState.config.requestEnabled ? "Requests On" : "Requests Off"}
      </Button>
      <Button
        variant={interceptState.config.responseEnabled ? "solid" : "outline"}
        type="button"
        onClick={() =>
          void setResponseInterceptEnabled(!interceptState.config.responseEnabled)
        }
        data-testid="toggleResponseIntercept"
        data-component="toggleResponseIntercept"
      >
        <FileLock2 size={14} strokeWidth={1.7} />
        {interceptState.config.responseEnabled
          ? "Responses On"
          : "Responses Off"}
      </Button>
      <Button
        variant="outline"
        type="button"
        disabled={interceptState.queue.length === 0}
        onClick={() => void resumeAllIntercepts()}
        data-testid="resumeAllIntercepts"
        data-component="resumeAllIntercepts"
      >
        <Play size={14} strokeWidth={1.7} />
        Resume All
      </Button>
    </>
  );
}
