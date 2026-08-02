import { cn } from "../../lib";
import { revealClass } from "./layoutClasses";

export type TelemetryTickerMeta = {
  num: string;
  label: string;
};

export type TelemetryTickerProps = {
  utc: string;
  meta: TelemetryTickerMeta;
  captureCount: number;
  sslEventCount: number;
  proxyRunning: boolean;
};

export function TelemetryTicker({ utc, meta, captureCount, sslEventCount, proxyRunning }: TelemetryTickerProps) {
  return (
    <footer
      className={cn(
        revealClass,
        "relative z-[3] flex items-center justify-between border-t border-rule px-4 rd-banner text-muted backdrop-blur-[10px] [animation-delay:380ms] radar-chrome",
        "[grid-column:1/3] [grid-row:2/3] max-[1180px]:[grid-column:1/2] max-[1180px]:[grid-row:3/4]"
      )}
      data-testid="telemetryTicker"
      data-component="telemetryTicker"
    >
      <div className="flex items-center gap-4 max-[640px]:gap-3">
        <span className="flex items-center gap-2 text-signal">
          <span className="h-1 w-1 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-signal" />
          Radar Online
        </span>
        <span className="flex items-center gap-2">
          UTC <em className="not-italic font-semibold text-bone" data-testid="telemetryUtcClock">{utc}</em>
        </span>
        <span className="flex items-center gap-2 max-[640px]:hidden">
          Sector <em className="not-italic font-semibold text-bone">03</em>
        </span>
      </div>
      <div className="flex items-center gap-4 max-[640px]:hidden">
        <span className="flex items-center gap-2">
          View <em className="not-italic font-semibold text-bone">{meta.num}</em> · {meta.label}
        </span>
        <span className="flex items-center gap-2">
          Captures <em className="not-italic font-semibold text-bone">{captureCount}</em>
        </span>
        <span className="flex items-center gap-2">
          TLS <em className="not-italic font-semibold text-bone">{sslEventCount}</em>
        </span>
        <span className="flex items-center gap-2">
          Proxy{" "}
          <em className="not-italic font-semibold text-bone">
            {proxyRunning ? "engaged" : "standby"}
          </em>
        </span>
      </div>
    </footer>
  );
}
