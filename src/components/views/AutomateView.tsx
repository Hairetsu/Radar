import {
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  FilePlus2,
  FileText,
  FolderOpen,
  Play,
  Repeat2,
  Square,
  Target,
  Zap
} from "lucide-react";
import type { AutomateDomain } from "../../hooks/workbench/useAutomateDomain";
import type { FindingsDomain } from "../../hooks/workbench/useFindingsDomain";
import { bodyPreview, cn, formatHeaders } from "../../lib";
import { EmptyState, FieldLabel, StatusBadge, StatusDot, SubFieldLabel, ToneText } from "../radar/primitives";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";

export type AutomateViewProps = Pick<
  AutomateDomain,
  | "automateMarkerName"
  | "setAutomateMarkerName"
  | "automateHeaderName"
  | "setAutomateHeaderName"
  | "insertAutomateMarker"
  | "automateMarkerPreview"
  | "automatePositions"
  | "automatePayloadSetName"
  | "setAutomatePayloadSetName"
  | "selectedAutomatePayloadSetId"
  | "selectAutomatePayloadSet"
  | "automatePayloadSets"
  | "automatePayloadText"
  | "setAutomatePayloadText"
  | "saveAutomatePayloadSet"
  | "automatePayloads"
  | "automateSessionName"
  | "setAutomateSessionName"
  | "automateLimits"
  | "updateAutomateLimits"
  | "startAutomateSession"
  | "pauseAutomateSession"
  | "resumeAutomateSession"
  | "stopAutomateSession"
  | "retryAutomateSession"
  | "automateWordlistPath"
  | "setAutomateWordlistPath"
  | "saveAutomateWordlistReference"
  | "automatePreviewDraft"
  | "loadAutomatePreviewIntoRepeater"
  | "automateRulesText"
  | "setAutomateRulesText"
  | "automateRules"
  | "activeAutomateSessionId"
  | "setActiveAutomateSessionId"
  | "automateSessions"
  | "automateResultFilter"
  | "setAutomateResultFilter"
  | "automateResultSort"
  | "setAutomateResultSort"
  | "activeAutomateSession"
  | "filteredAutomateResults"
  | "selectedAutomateResult"
  | "setSelectedAutomateResultId"
  | "promoteAutomateResultToRepeater"
> &
  {
    promoteAutomateResultToFinding: () => ReturnType<FindingsDomain["promoteAutomateResultToFinding"]>;
  };

export function AutomateView({
  automateMarkerName,
  setAutomateMarkerName,
  automateHeaderName,
  setAutomateHeaderName,
  insertAutomateMarker,
  automateMarkerPreview,
  automatePositions,
  automatePayloadSetName,
  setAutomatePayloadSetName,
  selectedAutomatePayloadSetId,
  selectAutomatePayloadSet,
  automatePayloadSets,
  automatePayloadText,
  setAutomatePayloadText,
  saveAutomatePayloadSet,
  automatePayloads,
  automateSessionName,
  setAutomateSessionName,
  automateLimits,
  updateAutomateLimits,
  startAutomateSession,
  pauseAutomateSession,
  resumeAutomateSession,
  stopAutomateSession,
  retryAutomateSession,
  automateWordlistPath,
  setAutomateWordlistPath,
  saveAutomateWordlistReference,
  automatePreviewDraft,
  loadAutomatePreviewIntoRepeater,
  automateRulesText,
  setAutomateRulesText,
  automateRules,
  activeAutomateSessionId,
  setActiveAutomateSessionId,
  automateSessions,
  automateResultFilter,
  setAutomateResultFilter,
  automateResultSort,
  setAutomateResultSort,
  activeAutomateSession,
  filteredAutomateResults,
  selectedAutomateResult,
  setSelectedAutomateResultId,
  promoteAutomateResultToRepeater,
  promoteAutomateResultToFinding
}: AutomateViewProps) {
  return (
    <div className="grid min-h-0 [grid-template-columns:minmax(320px,0.58fr)_minmax(360px,1fr)] max-[1180px]:grid-cols-1 max-[1180px]:auto-rows-[minmax(520px,auto)]">
      <div className="min-h-0 overflow-auto border-r border-rule max-[1180px]:border-r-0 max-[1180px]:border-b">
        <div className="grid gap-4 border-b border-rule radar-form-gradient px-5 py-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <FieldLabel htmlFor="automateMarkerName">Marker</FieldLabel>
              <Input
                id="automateMarkerName"
                value={automateMarkerName}
                onChange={(event) => setAutomateMarkerName(event.target.value)}
                spellCheck={false}
                data-testid="automateMarkerName"
                data-component="automateMarkerName"
              />
            </div>
            <div>
              <FieldLabel htmlFor="automateHeaderName">Header</FieldLabel>
              <Input
                id="automateHeaderName"
                value={automateHeaderName}
                onChange={(event) => setAutomateHeaderName(event.target.value)}
                spellCheck={false}
                data-testid="automateHeaderName"
                data-component="automateHeaderName"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="solid"
              type="button"
              onClick={() => insertAutomateMarker("url")}
              data-testid="markAutomateUrl"
              data-component="markAutomateUrl"
            >
              <Target size={14} strokeWidth={1.7} />
              Mark URL
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => insertAutomateMarker("header")}
              data-testid="markAutomateHeader"
              data-component="markAutomateHeader"
            >
              <FileCode2 size={14} strokeWidth={1.7} />
              Mark Header
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => insertAutomateMarker("body")}
              data-testid="markAutomateBody"
              data-component="markAutomateBody"
            >
              <Code2 size={14} strokeWidth={1.7} />
              Mark Body
            </Button>
          </div>
          <span className="rd-eyebrow text-muted">
            {automateMarkerPreview}
          </span>
        </div>

        <div className="px-5 py-5">
          <div className="mb-3 flex items-center gap-2 rd-eyebrow text-muted">
            <Zap size={13} strokeWidth={1.7} />
            Positions
            <StatusBadge tone={automatePositions.length > 0 ? "good" : "ghost"}>
              {automatePositions.length}
            </StatusBadge>
          </div>
          {automatePositions.length === 0 && (
            <EmptyState>
              <Zap size={18} strokeWidth={1.4} />
              <span>No payload positions marked</span>
            </EmptyState>
          )}
          <div className="grid gap-2" data-testid="automatePositions" data-component="automatePositions">
            {automatePositions.map((position) => (
              <div
                key={position.id}
                className="grid gap-2 border border-rule bg-ink/30 px-3 py-3 text-body text-copy"
                data-testid={`automatePosition-${position.id}`}
                data-component="automatePosition"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rd-eyebrow text-signal">
                    {position.name}
                  </span>
                  <StatusBadge tone={position.location === "body" ? "warn" : position.location === "header" ? "move" : "good"}>
                    {position.location}
                  </StatusBadge>
                </div>
                {position.headerName && (
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-label text-muted">
                    {position.headerName}
                  </span>
                )}
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta text-dim">
                  {position.preview}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 [grid-template-rows:auto_minmax(0,1fr)]">
        <div className="grid gap-4 border-b border-rule px-5 py-5 xl:grid-cols-[minmax(0,0.48fr)_minmax(0,0.26fr)_minmax(0,0.26fr)]">
          <div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.35fr)]">
              <div>
                <FieldLabel htmlFor="automatePayloadSetName">Payload Set</FieldLabel>
                <Input
                  id="automatePayloadSetName"
                  value={automatePayloadSetName}
                  onChange={(event) => setAutomatePayloadSetName(event.target.value)}
                  spellCheck={false}
                  data-testid="automatePayloadSetName"
                />
              </div>
              <div>
                <FieldLabel htmlFor="automatePayloadSetSelect">Saved</FieldLabel>
                <Select
                  id="automatePayloadSetSelect"
                  value={selectedAutomatePayloadSetId}
                  onChange={(event) => selectAutomatePayloadSet(event.target.value)}
                  data-testid="automatePayloadSetSelect"
                >
                  <option value="">Inline deck</option>
                  {automatePayloadSets.map((payloadSet) => (
                    <option key={payloadSet.id} value={payloadSet.id}>
                      {payloadSet.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <FieldLabel htmlFor="automatePayloads">Payloads</FieldLabel>
            <Textarea
              id="automatePayloads"
              variant="code"
              className="h-[168px]"
              value={automatePayloadText}
              onChange={(event) => setAutomatePayloadText(event.target.value)}
              spellCheck={false}
              data-testid="automatePayloads"
              data-component="automatePayloads"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-8" type="button" onClick={() => void saveAutomatePayloadSet()}>
                <FilePlus2 size={13} strokeWidth={1.7} />
                Save Set
              </Button>
              <StatusBadge tone={automatePayloads.length > 0 ? "good" : "ghost"}>
                {automatePayloads.length} payloads
              </StatusBadge>
            </div>
          </div>

          <div className="grid content-start gap-2">
            <FieldLabel htmlFor="automateSessionName">Run</FieldLabel>
            <Input
              id="automateSessionName"
              value={automateSessionName}
              onChange={(event) => setAutomateSessionName(event.target.value)}
              spellCheck={false}
              data-testid="automateSessionName"
            />
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              <div className="grid gap-1">
                <SubFieldLabel htmlFor="automateCount">Requests</SubFieldLabel>
                <Input
                  id="automateCount"
                  aria-label="Automate count"
                  type="number"
                  min={1}
                  max={100}
                  value={automateLimits.count}
                  onChange={(event) => updateAutomateLimits({ count: Number(event.target.value) })}
                  data-testid="automateCount"
                />
              </div>
              <div className="grid gap-1">
                <SubFieldLabel htmlFor="automateConcurrency">Parallel</SubFieldLabel>
                <Input
                  id="automateConcurrency"
                  aria-label="Automate concurrency"
                  type="number"
                  min={1}
                  max={5}
                  value={automateLimits.concurrency}
                  onChange={(event) => updateAutomateLimits({ concurrency: Number(event.target.value) })}
                  data-testid="automateConcurrency"
                />
              </div>
              <div className="grid gap-1">
                <SubFieldLabel htmlFor="automateDelay">Delay ms</SubFieldLabel>
                <Input
                  id="automateDelay"
                  aria-label="Automate delay"
                  type="number"
                  min={0}
                  max={10000}
                  value={automateLimits.delayMs}
                  onChange={(event) => updateAutomateLimits({ delayMs: Number(event.target.value) })}
                  data-testid="automateDelay"
                />
              </div>
              <div className="grid gap-1">
                <SubFieldLabel htmlFor="automateTimeout">Timeout ms</SubFieldLabel>
                <Input
                  id="automateTimeout"
                  aria-label="Automate timeout"
                  type="number"
                  min={1000}
                  max={30000}
                  value={automateLimits.timeoutMs}
                  onChange={(event) => updateAutomateLimits({ timeoutMs: Number(event.target.value) })}
                  data-testid="automateTimeout"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="solid"
                className="h-8"
                type="button"
                onClick={() => void startAutomateSession()}
                disabled={automatePositions.length === 0 || automatePayloads.length === 0}
                data-testid="startAutomateSession"
              >
                <Play size={13} strokeWidth={1.7} />
                Start
              </Button>
              <Button variant="outline" className="h-8 px-2" type="button" onClick={() => void pauseAutomateSession()} data-testid="pauseAutomateSession">
                Pause
              </Button>
              <Button variant="outline" className="h-8 px-2" type="button" onClick={() => void resumeAutomateSession()} data-testid="resumeAutomateSession">
                Resume
              </Button>
              <Button variant="ghost" className="h-8 px-2" type="button" onClick={() => void stopAutomateSession()} data-testid="stopAutomateSession">
                <Square size={12} strokeWidth={1.7} />
                Stop
              </Button>
              <Button variant="ghost" className="h-8 px-2" type="button" onClick={() => void retryAutomateSession()} data-testid="retryAutomateSession">
                <Repeat2 size={12} strokeWidth={1.7} />
                Retry
              </Button>
            </div>
          </div>

          <div className="grid content-start gap-2">
            <FieldLabel htmlFor="automateWordlistPath">Wordlist Ref</FieldLabel>
            <Input
              id="automateWordlistPath"
              value={automateWordlistPath}
              onChange={(event) => setAutomateWordlistPath(event.target.value)}
              spellCheck={false}
              placeholder="/path/to/list.txt"
              data-testid="automateWordlistPath"
            />
            <Button variant="outline" className="h-8 w-fit" type="button" onClick={() => void saveAutomateWordlistReference()}>
              <FolderOpen size={13} strokeWidth={1.7} />
              Save Ref
            </Button>
            <div className="grid max-h-[120px] gap-1 overflow-auto border border-rule bg-surface/50 p-2">
              {automatePayloads.slice(0, 6).map((payload, index) => (
                <span key={`${payload}-${index}`} className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta text-muted">
                  {index + 1}. {payload}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-auto px-5 py-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
            <div className="grid gap-4">
              <div className="overflow-hidden border border-rule radar-panel">
                <div className="flex min-w-0 items-center gap-3 border-b border-rule bg-signal/5 px-4 py-2 font-mono text-meta text-muted">
                  <StatusDot tone="warn" />
                  <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-current">
                    {automatePreviewDraft.method} {automatePreviewDraft.url}
                  </strong>
                  <Button
                    variant="ghost"
                    className="ml-auto h-7 px-2 text-label"
                    type="button"
                    onClick={loadAutomatePreviewIntoRepeater}
                    disabled={automatePositions.length === 0 || automatePayloads.length === 0}
                    data-testid="loadAutomatePreviewInline"
                  >
                    <Repeat2 size={12} strokeWidth={1.7} />
                    Load
                  </Button>
                </div>
                <pre className="max-h-[240px] min-h-[180px] overflow-auto px-4 py-3" data-testid="automatePreview">
                  {`${automatePreviewDraft.method} ${automatePreviewDraft.url}\n\n${formatHeaders(
                    automatePreviewDraft.headers
                  )}\n\n${bodyPreview(automatePreviewDraft.body)}`}
                </pre>
              </div>

              <div className="overflow-hidden border border-rule bg-ink/25">
                <div className="border-b border-rule px-4 py-2 rd-eyebrow text-muted">
                  Match / Extract Rules
                </div>
                <Textarea
                  variant="code"
                  className="h-[170px] rounded-none border-0"
                  value={automateRulesText}
                  onChange={(event) => setAutomateRulesText(event.target.value)}
                  spellCheck={false}
                  data-testid="automateRules"
                />
                <div className="flex items-center gap-2 border-t border-rule px-4 py-2">
                  <StatusBadge tone={automateRules.length > 0 ? "good" : "ghost"}>
                    {automateRules.length} rules
                  </StatusBadge>
                </div>
              </div>
            </div>

            <div className="grid min-h-[520px] gap-4 [grid-template-rows:auto_minmax(0,1fr)_auto]">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <FieldLabel htmlFor="automateSessionSelect">Session</FieldLabel>
                  <Select
                    id="automateSessionSelect"
                    value={activeAutomateSessionId}
                    onChange={(event) => setActiveAutomateSessionId(event.target.value)}
                    data-testid="automateSessionSelect"
                  >
                    {automateSessions.length === 0 && <option value="">No sessions</option>}
                    {automateSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.name} - {session.status}
                      </option>
                    ))}
                  </Select>
                </div>
                <Select
                  variant="compact"
                  value={automateResultFilter}
                  onChange={(event) => setAutomateResultFilter(event.target.value)}
                  data-testid="automateResultFilter"
                >
                  <option value="all">All results</option>
                  <option value="failures">Failures</option>
                  <option value="matches">Matches</option>
                  <option value="outliers">Outliers</option>
                </Select>
                <Select
                  variant="compact"
                  value={automateResultSort}
                  onChange={(event) => setAutomateResultSort(event.target.value)}
                  data-testid="automateResultSort"
                >
                  <option value="index">Order</option>
                  <option value="status">Status</option>
                  <option value="length">Length</option>
                  <option value="latency">Latency</option>
                  <option value="matches">Matches</option>
                </Select>
                <Button
                  variant="ghost"
                  className="h-8 px-2"
                  type="button"
                  onClick={() => {
                    const blob = new window.Blob([JSON.stringify(activeAutomateSession?.results || [], null, 2)], {
                      type: "application/json"
                    });
                    const url = window.URL.createObjectURL(blob);
                    const link = window.document.createElement("a");
                    link.href = url;
                    link.download = `${activeAutomateSession?.name || "automate"}-results.json`;
                    link.click();
                    window.URL.revokeObjectURL(url);
                  }}
                >
                  <ExternalLink size={12} strokeWidth={1.7} />
                  Export
                </Button>
              </div>

              <div className="min-h-0 overflow-auto border border-rule bg-surface/40" data-testid="automateResults">
                <table className="w-full table-fixed border-collapse text-left font-mono text-meta">
                  {/* Fixed layout keeps the payload column elastic without letting a long
                      payload starve the numeric columns or clip their headers. */}
                  <colgroup>
                    <col className="w-[52px]" />
                    <col className="w-[68px]" />
                    <col className="w-[64px]" />
                    <col className="w-[68px]" />
                    <col className="w-[58px]" />
                    <col className="w-[82px]" />
                    <col />
                    <col className="w-[68px]" />
                  </colgroup>
                  <thead className="sticky top-0 bg-ink text-label uppercase tracking-eyebrow text-muted">
                    <tr>
                      <th className="border-b border-rule px-3 py-2">#</th>
                      <th className="border-b border-rule px-3 py-2">Status</th>
                      <th className="border-b border-rule px-3 py-2">Len</th>
                      <th className="border-b border-rule px-3 py-2">Words</th>
                      <th className="border-b border-rule px-3 py-2">Ms</th>
                      <th className="border-b border-rule px-3 py-2">Cluster</th>
                      <th className="border-b border-rule px-3 py-2">Payload</th>
                      <th className="border-b border-rule px-3 py-2">Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAutomateResults.map((result) => (
                      <tr
                        key={result.id}
                        className={cn(
                          "cursor-pointer border-b border-rule/70 text-copy hover:bg-signal/10",
                          selectedAutomateResult?.id === result.id && "bg-signal/10"
                        )}
                        onClick={() => setSelectedAutomateResultId(result.id)}
                        data-testid="automateResultRow"
                      >
                        <td className="px-3 py-2 text-dim">{result.index}</td>
                        <td className="px-3 py-2">
                          <ToneText tone={result.ok && result.status < 400 ? "good" : "danger"}>
                            {result.error ? "ERR" : result.status}
                          </ToneText>
                        </td>
                        <td className="px-3 py-2 text-muted">{result.length}</td>
                        <td className="px-3 py-2 text-muted">{result.wordCount}</td>
                        <td className="px-3 py-2 text-muted">{result.latencyMs}</td>
                        <td className="truncate px-3 py-2 text-muted">{result.clusterId || "-"}</td>
                        <td className="px-3 py-2 text-copy">
                          <span className="block truncate" title={result.payload}>
                            {result.payload}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-signal">{result.matchedRules.length + result.extracts.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredAutomateResults.length === 0 && (
                  <EmptyState className="min-h-[240px]">
                    <Zap size={18} strokeWidth={1.4} />
                    <span>No Automate results yet</span>
                  </EmptyState>
                )}
              </div>

              <div className="grid gap-3 border border-rule bg-ink/30 p-3 md:grid-cols-[minmax(0,1fr)_minmax(210px,0.35fr)]">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={
                        activeAutomateSession?.status === "running"
                          ? "good"
                          : activeAutomateSession?.status === "failed"
                            ? "danger"
                            : "ghost"
                      }
                    >
                      {activeAutomateSession?.status || "ready"}
                    </StatusBadge>
                    <StatusBadge tone="move">{activeAutomateSession?.clusters.length || 0} clusters</StatusBadge>
                    <Button
                      variant="ghost"
                      className="ml-auto h-7 px-2 text-label"
                      type="button"
                      onClick={() => {
                        void window.navigator.clipboard?.writeText(JSON.stringify(selectedAutomateResult || {}, null, 2));
                      }}
                    >
                      <Copy size={12} strokeWidth={1.7} />
                      Copy Result
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-label"
                      type="button"
                      onClick={() => void promoteAutomateResultToRepeater()}
                      disabled={!selectedAutomateResult}
                    >
                      <Repeat2 size={12} strokeWidth={1.7} />
                      Promote
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-label"
                      type="button"
                      onClick={() => void promoteAutomateResultToFinding()}
                      disabled={!selectedAutomateResult}
                    >
                      <FileText size={12} strokeWidth={1.7} />
                      Finding
                    </Button>
                  </div>
                  <pre className="max-h-[170px] overflow-auto text-meta" data-testid="automateResultDetail">
                    {selectedAutomateResult
                      ? `${selectedAutomateResult.request.method} ${selectedAutomateResult.request.url}\n\n${selectedAutomateResult.bodyPreview || selectedAutomateResult.error || ""}`
                      : "Select a result to inspect response evidence."}
                  </pre>
                </div>
                <div className="grid max-h-[210px] gap-2 overflow-auto">
                  {activeAutomateSession?.clusters.map((cluster) => (
                    <div key={cluster.id} className="border border-rule bg-surface/50 px-3 py-2 font-mono text-meta text-muted">
                      <div className="flex items-center justify-between gap-2 text-copy">
                        <span>{cluster.id}</span>
                        <StatusBadge tone={cluster.count === 1 ? "warn" : "ghost"}>{cluster.count}</StatusBadge>
                      </div>
                      <div className="mt-1 text-dim">
                        {cluster.statusFamily} · {cluster.averageLength}b · {cluster.averageLatencyMs}ms
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
