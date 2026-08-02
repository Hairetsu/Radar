import {
  FolderOpen,
  GitCompare,
  History,
  Pin,
  Plus,
  Send,
  Variable,
  X,
  Zap
} from "lucide-react";
import { jsonFormat, jsonMinify, jwtDecode, parseCookieHeader, urlDecode, urlEncode } from "../../../shared/requestTransforms.js";
import type { RepeaterDomain } from "../../hooks/workbench/useRepeaterDomain";
import type { WebSocketDomain } from "../../hooks/workbench/useWebSocketDomain";
import type { WorkbenchShellDomain } from "../../hooks/workbench/useWorkbenchShell";
import { bodyPreview, cn, elapsed, statusTone } from "../../lib";
import { FieldLabel, StatusDot } from "../radar/primitives";
import { transformRowClass, transformToolClass } from "../shell/layoutClasses";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";

export type RepeaterViewProps = Pick<
  RepeaterDomain,
  | "replayTabState"
  | "selectReplayTab"
  | "closeReplayTab"
  | "createReplayTab"
  | "activeReplayTab"
  | "setReplayTabEnvironment"
  | "replayEnvironments"
  | "toggleReplayTabPin"
  | "draft"
  | "setDraft"
  | "headersText"
  | "setHeadersText"
  | "sendReplay"
  | "replayPending"
  | "sendReplayPending"
  | "count"
  | "setCount"
  | "concurrency"
  | "setConcurrency"
  | "delayMs"
  | "setDelayMs"
  | "runBurst"
  | "runBurstPending"
  | "lastResponse"
  | "lastBurst"
  | "diffLeftHistoryId"
  | "setDiffLeftHistoryId"
  | "diffRightHistoryId"
  | "setDiffRightHistoryId"
  | "loadReplayHistoryEntry"
  | "replayDiff"
  | "replayCollections"
  | "loadCollectionItem"
  | "saveDraftToCollection"
  | "createReplayEnvironment"
> &
  Pick<WorkbenchShellDomain, "setNotice"> &
  Pick<
    WebSocketDomain,
    "webSocketReplayDraft" | "setWebSocketReplayDraft" | "sendWebSocketReplay" | "webSocketReplayResult"
  >;

export function RepeaterView({
  replayTabState,
  selectReplayTab,
  closeReplayTab,
  createReplayTab,
  activeReplayTab,
  setReplayTabEnvironment,
  replayEnvironments,
  toggleReplayTabPin,
  draft,
  setDraft,
  headersText,
  setHeadersText,
  setNotice,
  sendReplay,
  replayPending,
  sendReplayPending,
  count,
  setCount,
  concurrency,
  setConcurrency,
  delayMs,
  setDelayMs,
  runBurst,
  runBurstPending,
  lastResponse,
  lastBurst,
  diffLeftHistoryId,
  setDiffLeftHistoryId,
  diffRightHistoryId,
  setDiffRightHistoryId,
  loadReplayHistoryEntry,
  replayDiff,
  replayCollections,
  loadCollectionItem,
  saveDraftToCollection,
  createReplayEnvironment,
  webSocketReplayDraft,
  setWebSocketReplayDraft,
  sendWebSocketReplay,
  webSocketReplayResult
}: RepeaterViewProps) {
  return (
    <div className="grid min-h-0 [grid-template-rows:auto_minmax(0,1fr)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
        {replayTabState.tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={tab.id === replayTabState.activeTabId ? "solid" : "ghost"}
            className="h-8 gap-1.5 px-3"
            onClick={() => void selectReplayTab(tab.id)}
            data-testid={`repeaterTab-${tab.id}`}
          >
            {tab.pinned && <Pin size={12} strokeWidth={1.8} />}
            {tab.name}
            {replayTabState.tabs.length > 1 && (
              <X
                size={12}
                strokeWidth={1.8}
                className="opacity-60 hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  void closeReplayTab(tab.id);
                }}
              />
            )}
          </Button>
        ))}
        <Button
          variant="ghost"
          className="h-8 px-2"
          aria-label="Create Repeater tab"
          onClick={() => void createReplayTab()}
          data-testid="createReplayTab"
        >
          <Plus size={14} strokeWidth={1.8} />
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            variant="compact"
            value={activeReplayTab?.environmentId || ""}
            onChange={(event) => void setReplayTabEnvironment(event.target.value)}
            data-testid="repeaterEnvironment"
          >
            <option value="">No environment</option>
            {replayEnvironments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </Select>
          <Button
            variant="ghost"
            className="h-8"
            aria-label={activeReplayTab?.pinned ? "Unpin Repeater tab" : "Pin Repeater tab"}
            onClick={() => void toggleReplayTabPin(activeReplayTab?.id || "")}
            data-testid="pinReplayTab"
          >
            <Pin size={14} strokeWidth={1.8} />
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 [grid-template-columns:minmax(0,1.05fr)_minmax(360px,0.95fr)] max-[1180px]:grid-cols-1">
        <div className="min-h-0 overflow-auto border-r border-rule max-[1180px]:border-r-0 max-[1180px]:border-b">
          <FieldLabel htmlFor="repeaterUrl">Request line</FieldLabel>
          <div className="grid items-center gap-2 px-5 pb-2 [grid-template-columns:110px_minmax(0,1fr)]">
            <Select
              variant="method"
              value={draft.method}
              onChange={(event) => setDraft({ ...draft, method: event.target.value })}
              data-testid="repeaterMethod"
              data-component="repeaterMethod"
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((method) => (
                <option key={method}>{method}</option>
              ))}
            </Select>
            <Input
              id="repeaterUrl"
              value={draft.url}
              onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              spellCheck={false}
              data-testid="repeaterUrl"
              data-component="repeaterUrl"
            />
          </div>
          <div className={transformRowClass}>
            <Button
              variant="ghost"
              className={transformToolClass}
              onClick={() => setDraft({ ...draft, url: urlEncode(draft.url).value || draft.url })}
            >
              URL encode
            </Button>
            <Button
              variant="ghost"
              className={transformToolClass}
              onClick={() => setDraft({ ...draft, url: urlDecode(draft.url).value || draft.url })}
            >
              URL decode
            </Button>
          </div>

          <FieldLabel htmlFor="headers">
            Headers
          </FieldLabel>
          <Textarea
            id="headers"
            variant="code"
            className="h-[170px]"
            value={headersText}
            onChange={(event) => setHeadersText(event.target.value)}
            spellCheck={false}
            data-testid="repeaterHeaders"
            data-component="repeaterHeaders"
          />

          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pr-5">
            <FieldLabel htmlFor="body">Body</FieldLabel>
            <div className={cn(transformRowClass, "px-0 pb-0")}>
              <Button
                variant="ghost"
                className={transformToolClass}
                onClick={() => setDraft({ ...draft, body: jsonFormat(draft.body).value || draft.body })}
              >
                JSON format
              </Button>
              <Button
                variant="ghost"
                className={transformToolClass}
                onClick={() => setDraft({ ...draft, body: jsonMinify(draft.body).value || draft.body })}
              >
                JSON minify
              </Button>
              <Button
                variant="ghost"
                className={transformToolClass}
                onClick={() => {
                  const auth = draft.headers.Authorization || draft.headers.authorization || "";
                  const decoded = jwtDecode(auth.replace(/^Bearer\s+/i, ""));
                  if (decoded.ok) {
                    setNotice(`JWT payload loaded into body preview`);
                    setDraft({ ...draft, body: decoded.payload });
                  } else {
                    setNotice(decoded.error || "JWT decode failed");
                  }
                }}
              >
                JWT decode
              </Button>
              <Button
                variant="ghost"
                className={transformToolClass}
                onClick={() => {
                  const cookie = draft.headers.Cookie || draft.headers.cookie || "";
                  const parsed = parseCookieHeader(cookie);
                  if (parsed.ok) {
                    setDraft({ ...draft, body: parsed.value });
                  } else {
                    setNotice(parsed.error || "Cookie parse failed");
                  }
                }}
              >
                Parse cookies
              </Button>
            </div>
          </div>
          <Textarea
            id="body"
            variant="code"
            className="h-[220px]"
            value={draft.body}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            spellCheck={false}
            data-testid="repeaterBody"
            data-component="repeaterBody"
          />

          <div className="flex gap-2 px-5 py-4">
            <Button
              variant="solid"
              onClick={sendReplay}
              disabled={replayPending}
              data-testid="transmitReplay"
              data-component="transmitReplay"
            >
              <Send size={14} strokeWidth={1.8} />
              {sendReplayPending ? "Transmitting" : "Transmit"}
            </Button>
          </div>
        </div>

        <div className="min-h-0 overflow-auto">
          <div className="grid items-end gap-3 border-b border-rule radar-form-gradient px-5 py-5 [grid-template-columns:1fr_1fr_1fr_auto]">
            <div className="grid gap-1.5">
              <span className="font-mono text-label font-semibold uppercase tracking-banner text-muted">
                Count
              </span>
              <Input
                variant="compact"
                type="number"
                aria-label="Burst count"
                min={1}
                max={50}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                data-testid="burstCount"
                data-component="burstCount"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="font-mono text-label font-semibold uppercase tracking-banner text-muted">
                Parallel
              </span>
              <Input
                variant="compact"
                type="number"
                aria-label="Burst parallel requests"
                min={1}
                max={5}
                value={concurrency}
                onChange={(event) => setConcurrency(Number(event.target.value))}
                data-testid="burstConcurrency"
                data-component="burstConcurrency"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="font-mono text-label font-semibold uppercase tracking-banner text-muted">
                Delay
              </span>
              <Input
                variant="compact"
                type="number"
                aria-label="Burst delay in milliseconds"
                min={0}
                max={10000}
                step={50}
                value={delayMs}
                onChange={(event) => setDelayMs(Number(event.target.value))}
                data-testid="burstDelay"
                data-component="burstDelay"
              />
            </div>
            <Button
              variant="zap"
              onClick={runBurst}
              disabled={replayPending}
              data-testid="runBurst"
              data-component="runBurst"
            >
              <Zap size={14} strokeWidth={1.8} />
              {runBurstPending ? "Saturating" : "Saturate"}
            </Button>
          </div>

          <div className="mx-5 my-5 min-h-0 overflow-hidden border border-rule radar-panel">
            <div className="flex h-9 items-center gap-3 border-b border-rule bg-signal/5 px-4 py-2 font-mono text-meta tracking-data text-muted">
              <StatusDot tone={statusTone(lastResponse?.status || null)} />
              <strong className="font-semibold text-current">
                {lastResponse
                  ? `${lastResponse.status} ${lastResponse.statusText}`
                  : "No response"}
              </strong>
              <span>{elapsed(lastResponse?.durationMs)}</span>
              {lastBurst && <span>{lastBurst.failures} flagged</span>}
            </div>
            <pre className="h-[220px] px-4 py-3">
              {lastResponse ? bodyPreview(lastResponse.body) : ""}
            </pre>
          </div>

          {activeReplayTab && activeReplayTab.history.length > 0 && (
            <div className="border-t border-rule px-5 py-4">
              <div className="mb-2 flex items-center gap-2 rd-eyebrow text-muted">
                <History size={13} strokeWidth={1.7} />
                Replay history
              </div>
              <div className="grid gap-2">
                {activeReplayTab.history.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center gap-2 rounded border border-rule px-3 py-2 text-body">
                    <span>{entry.result.status}</span>
                    <span className="text-muted">{elapsed(entry.result.durationMs)}</span>
                    <span className="truncate text-muted">{entry.draft.method} {entry.draft.url}</span>
                    <Button variant="ghost" className="ml-auto h-7 px-2" onClick={() => loadReplayHistoryEntry(entry)}>
                      Load
                    </Button>
                    <input
                      type="radio"
                      name="diffLeft"
                      checked={diffLeftHistoryId === entry.id}
                      onChange={() => setDiffLeftHistoryId(entry.id)}
                      aria-label="Diff left"
                    />
                    <input
                      type="radio"
                      name="diffRight"
                      checked={diffRightHistoryId === entry.id}
                      onChange={() => setDiffRightHistoryId(entry.id)}
                      aria-label="Diff right"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {replayDiff && (
            <div className="border-t border-rule px-5 py-4">
              <div className="mb-2 flex items-center gap-2 rd-eyebrow text-muted">
                <GitCompare size={13} strokeWidth={1.7} />
                Response diff
              </div>
              <div className="grid gap-1 text-body text-muted">
                <span>Status: {replayDiff.statusBefore} → {replayDiff.statusAfter}</span>
                <span>Latency delta: {replayDiff.latencyDeltaMs} ms</span>
                <span>Body length delta: {replayDiff.bodyLengthDelta}</span>
                {replayDiff.headerDiffs
                  .filter((entry) => entry.change !== "same")
                  .slice(0, 6)
                  .map((entry) => (
                    <span key={entry.key}>
                      {entry.key}: {entry.change}
                    </span>
                  ))}
              </div>
              <pre className="mt-3 max-h-[160px] overflow-auto rounded border border-rule px-3 py-2 text-meta">
                {replayDiff.bodyTextDiff.join("\n")}
              </pre>
            </div>
          )}

          {(replayEnvironments.length > 0 || replayCollections.length > 0) && (
            <div className="border-t border-rule px-5 py-4">
              <div className="mb-2 flex items-center gap-2 rd-eyebrow text-muted">
                <FolderOpen size={13} strokeWidth={1.7} />
                Collections
              </div>
              {replayCollections.map((collection) => (
                <div key={collection.id} className="mb-3">
                  <div className="mb-1 font-semibold">{collection.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {collection.items.slice(0, 6).map((item) => (
                      <Button key={item.id} variant="ghost" className="h-7 px-2 text-meta" onClick={() => loadCollectionItem(item.draft)}>
                        {item.name}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-meta"
                      onClick={() => void saveDraftToCollection(collection.id, activeReplayTab?.name || "Request")}
                    >
                      Save tab
                    </Button>
                  </div>
                </div>
              ))}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  className="h-7 px-2 text-meta"
                  onClick={() => void createReplayEnvironment(`Env ${replayEnvironments.length + 1}`)}
                >
                  <Variable size={12} />
                  New environment
                </Button>
              </div>
            </div>
          )}

          {webSocketReplayDraft && (
            <div className="border-t border-rule px-5 py-4">
              <FieldLabel htmlFor="wsReplayPayload">WebSocket replay</FieldLabel>
              <Textarea
                id="wsReplayPayload"
                variant="code"
                className="h-[120px]"
                value={webSocketReplayDraft.payload}
                onChange={(event) =>
                  setWebSocketReplayDraft(
                    webSocketReplayDraft
                      ? { ...webSocketReplayDraft, payload: event.target.value }
                      : null
                  )
                }
                spellCheck={false}
                data-testid="webSocketReplayPayload"
              />
              <div className="mt-2 flex gap-2">
                <Button variant="solid" onClick={() => void sendWebSocketReplay()} data-testid="sendWebSocketReplay">
                  Send frame
                </Button>
                {webSocketReplayResult && (
                  <span className="self-center text-body text-muted">
                    {webSocketReplayResult.ok
                      ? `Reply in ${webSocketReplayResult.durationMs} ms`
                      : webSocketReplayResult.error}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
