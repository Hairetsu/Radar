import { ArrowLeft, ArrowRight, ExternalLink, RotateCw } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { BrowserState } from "../../types";
import type { FormEvent } from "react";

export type BrowserToolbarProps = {
  browserState: BrowserState;
  address: string;
  setAddress: (address: string) => void;
  onNavigate: (event: FormEvent) => void;
  onBack: () => void | Promise<void>;
  onForward: () => void | Promise<void>;
  onReload: () => void | Promise<void>;
};

export function BrowserToolbar({
  browserState,
  address,
  setAddress,
  onNavigate,
  onBack,
  onForward,
  onReload
}: BrowserToolbarProps) {
  return (
    <form
      className="grid w-[min(680px,52vw)] grid-cols-[auto_auto_auto_minmax(180px,1fr)_auto] justify-self-end max-[1180px]:w-full max-[1180px]:justify-self-start max-[640px]:grid-cols-[auto_auto_auto_minmax(100px,1fr)]"
      onSubmit={onNavigate}
      data-testid="browserLauncher"
      data-component="browserLauncher"
    >
      <Button
        type="button"
        variant="icon"
        className="h-[38px] w-[38px] rounded-none border-r-0"
        disabled={!browserState.open}
        onClick={() => void onBack()}
        aria-label="Browser back"
        data-testid="browserBack"
      >
        <ArrowLeft size={14} strokeWidth={2} />
      </Button>
      <Button
        type="button"
        variant="icon"
        className="h-[38px] w-[38px] rounded-none border-r-0"
        disabled={!browserState.open}
        onClick={() => void onForward()}
        aria-label="Browser forward"
        data-testid="browserForward"
      >
        <ArrowRight size={14} strokeWidth={2} />
      </Button>
      <Button
        type="button"
        variant="icon"
        className="h-[38px] w-[38px] rounded-none border-r-0"
        disabled={!browserState.open}
        onClick={() => void onReload()}
        aria-label="Reload browser"
        data-testid="browserReload"
      >
        <RotateCw size={13} strokeWidth={2} />
      </Button>
      <Input
        variant="compact"
        className="h-[38px] min-w-0 rounded-none border-r-0 font-mono text-body max-[640px]:border-r"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        aria-label="Browser address"
        data-testid="browserAddress"
      />
      <Button
        type="submit"
        variant="solid"
        className="h-[38px] px-4 max-[640px]:col-span-4 max-[640px]:mt-1"
        data-testid="openBrowser"
        data-component="openBrowser"
      >
        <ExternalLink size={14} strokeWidth={2} />
        {browserState.open ? "Navigate" : "Open Browser"}
      </Button>
    </form>
  );
}
