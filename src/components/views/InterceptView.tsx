import { Eraser, FileLock2, Play, Replace, Send, Trash2 } from "lucide-react";
import type { InterceptDomain } from "../../hooks/workbench/useInterceptDomain";
import { cn } from "../../lib";
import { EmptyState, FieldLabel, StatusBadge } from "../radar/primitives";
import { ellipsisMono, interceptRowClass } from "../shell/layoutClasses";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";

export type InterceptViewActionsProps = Pick<
  InterceptDomain,
  "interceptState" | "setRequestInterceptEnabled" | "setResponseInterceptEnabled" | "resumeAllIntercepts"
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
        onClick={() => void setRequestInterceptEnabled(!interceptState.config.requestEnabled)}
        data-testid="toggleRequestIntercept"
        data-component="toggleRequestIntercept"
      >
        <FileLock2 size={14} strokeWidth={1.7} />
        {interceptState.config.requestEnabled ? "Requests On" : "Requests Off"}
      </Button>
      <Button
        variant={interceptState.config.responseEnabled ? "solid" : "outline"}
        type="button"
        onClick={() => void setResponseInterceptEnabled(!interceptState.config.responseEnabled)}
        data-testid="toggleResponseIntercept"
        data-component="toggleResponseIntercept"
      >
        <FileLock2 size={14} strokeWidth={1.7} />
        {interceptState.config.responseEnabled ? "Responses On" : "Responses Off"}
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

export type InterceptViewProps = Pick<
  InterceptDomain,
  | "interceptState"
  | "interceptRules"
  | "matchReplaceRules"
  | "selectedInterceptItem"
  | "selectInterceptItem"
  | "interceptRulesText"
  | "setInterceptRulesText"
  | "saveInterceptRules"
  | "matchReplaceRulesText"
  | "setMatchReplaceRulesText"
  | "saveMatchReplaceRules"
  | "interceptResponseStatus"
  | "setInterceptResponseStatus"
  | "interceptResponseStatusText"
  | "setInterceptResponseStatusText"
  | "interceptDraft"
  | "setInterceptDraft"
  | "interceptHeadersText"
  | "setInterceptHeadersText"
  | "forwardIntercept"
  | "dropIntercept"
>;

export function InterceptView({
  interceptState,
  interceptRules,
  matchReplaceRules,
  selectedInterceptItem,
  selectInterceptItem,
  interceptRulesText,
  setInterceptRulesText,
  saveInterceptRules,
  matchReplaceRulesText,
  setMatchReplaceRulesText,
  saveMatchReplaceRules,
  interceptResponseStatus,
  setInterceptResponseStatus,
  interceptResponseStatusText,
  setInterceptResponseStatusText,
  interceptDraft,
  setInterceptDraft,
  interceptHeadersText,
  setInterceptHeadersText,
  forwardIntercept,
  dropIntercept
}: InterceptViewProps) {
  return (
    <div className="grid min-h-0 [grid-template-columns:minmax(0,0.95fr)_minmax(420px,1.05fr)] max-[1180px]:grid-cols-1">
      <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_minmax(0,1fr)_minmax(340px,0.9fr)] max-[1180px]:border-r-0 max-[1180px]:border-b">
        <div className="grid gap-px border-b border-rule bg-rule [grid-template-columns:repeat(4,minmax(0,1fr))]">
          {[
            ["Mode", interceptState.config.requestEnabled ? "request" : "standby"],
            ["Queued", interceptState.queue.length],
            ["Rules", interceptRules.length],
            ["Rewrites", matchReplaceRules.length]
          ].map(([label, value]) => (
            <div key={label} className="radar-card-gradient px-4 py-3">
              <span className="block rd-eyebrow text-muted">
                {label}
              </span>
              <strong className="mt-1 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-head font-semibold uppercase leading-none text-bone [font-stretch:75%]">
                {value}
              </strong>
            </div>
          ))}
        </div>

        <div className="min-h-0 overflow-auto radar-traffic-list" data-testid="interceptQueue">
          {interceptState.queue.length === 0 && (
            <EmptyState>
              <FileLock2 size={18} strokeWidth={1.4} />
              <span>
                {interceptState.config.requestEnabled || interceptState.config.responseEnabled
                  ? "No scoped traffic paused"
                  : "Request and response interception are disabled"}
              </span>
            </EmptyState>
          )}
          {interceptState.queue.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              className={interceptRowClass(item.id === selectedInterceptItem?.id)}
              onClick={() => selectInterceptItem(item.id)}
              data-selected={item.id === selectedInterceptItem?.id ? "true" : "false"}
              data-testid={`interceptRow-${item.id}`}
              data-component="interceptRow"
            >
              <StatusBadge tone="warn">{item.stage === "response" ? item.status || "resp" : item.method}</StatusBadge>
              <span className={cn(ellipsisMono, "font-medium text-bone")}>{item.host}</span>
              <span className={ellipsisMono}>{item.path}</span>
              <span className={ellipsisMono}>{item.stage}</span>
            </Button>
          ))}
        </div>
        <div className="grid min-h-0 border-t border-rule [grid-template-rows:auto_minmax(0,1fr)_auto_auto_minmax(0,1fr)_auto]">
          <div className="flex items-center justify-between gap-3 border-b border-rule bg-rust/5 px-3 py-2">
            <span className="rd-eyebrow text-muted">Intercept Rules JSON</span>
            <StatusBadge tone={interceptRules.length > 0 ? "warn" : "ghost"}>
              {interceptRules.length}
            </StatusBadge>
          </div>
          <Textarea
            variant="code"
            className="min-h-0 border-0"
            value={interceptRulesText}
            onChange={(event) => setInterceptRulesText(event.target.value)}
            spellCheck={false}
            data-testid="interceptRulesText"
            data-component="interceptRulesText"
          />
          <div className="border-t border-rule px-3 py-2">
            <Button
              variant="outline"
              type="button"
              className="w-full justify-start"
              onClick={() => void saveInterceptRules()}
              data-testid="saveInterceptRules"
              data-component="saveInterceptRules"
            >
              <FileLock2 size={14} strokeWidth={1.7} />
              Save Rules
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-b border-rule bg-ink/30 px-3 py-2">
            <span className="rd-eyebrow text-muted">Match / Replace JSON</span>
            <StatusBadge tone={matchReplaceRules.length > 0 ? "warn" : "ghost"}>
              {matchReplaceRules.length}
            </StatusBadge>
          </div>
          <Textarea
            variant="code"
            className="min-h-0 border-0"
            value={matchReplaceRulesText}
            onChange={(event) => setMatchReplaceRulesText(event.target.value)}
            spellCheck={false}
            data-testid="matchReplaceRulesText"
            data-component="matchReplaceRulesText"
          />
          <div className="border-t border-rule px-3 py-2">
            <Button
              variant="outline"
              type="button"
              className="w-full justify-start"
              onClick={() => void saveMatchReplaceRules()}
              data-testid="saveMatchReplaceRules"
              data-component="saveMatchReplaceRules"
            >
              <Replace size={14} strokeWidth={1.7} />
              Save Rewrites
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 radar-detail-pane [grid-template-rows:auto_minmax(0,1fr)_auto]">
        <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2">
          <div className="min-w-0">
            <span className="block rd-eyebrow text-rust">
              {selectedInterceptItem?.stage === "response" ? "Queued Response Editor" : "Queued Request Editor"}
            </span>
            <strong className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rd-label text-bone">
              {selectedInterceptItem
                ? `${selectedInterceptItem.host}${selectedInterceptItem.path}`
                : "No queued item selected"}
            </strong>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <StatusBadge tone={selectedInterceptItem ? "warn" : "ghost"}>
              {selectedInterceptItem?.ruleHits?.length
                ? `${selectedInterceptItem.ruleHits.length} rule`
                : selectedInterceptItem
                  ? "paused"
                  : "idle"}
            </StatusBadge>
            {selectedInterceptItem?.rewrites?.length ? (
              <StatusBadge tone="warn">{selectedInterceptItem.rewrites.length} rewrite</StatusBadge>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 overflow-auto">
          {selectedInterceptItem?.stage === "response" ? (
            <div className="grid items-center gap-2 px-5 pb-2 pt-5 [grid-template-columns:110px_minmax(0,1fr)]">
              <Input
                variant="compact"
                type="number"
                min={100}
                max={599}
                value={interceptResponseStatus}
                disabled={!selectedInterceptItem}
                onChange={(event) => setInterceptResponseStatus(Number(event.target.value))}
                data-testid="interceptStatus"
                data-component="interceptStatus"
              />
              <Input
                value={interceptResponseStatusText}
                disabled={!selectedInterceptItem}
                onChange={(event) => setInterceptResponseStatusText(event.target.value)}
                spellCheck={false}
                data-testid="interceptStatusText"
                data-component="interceptStatusText"
              />
            </div>
          ) : (
            <div className="grid items-center gap-2 px-5 pb-2 pt-5 [grid-template-columns:110px_minmax(0,1fr)]">
              <Select
                variant="method"
                value={interceptDraft.method}
                disabled={!selectedInterceptItem}
                onChange={(event) =>
                  setInterceptDraft({ ...interceptDraft, method: event.target.value })
                }
                data-testid="interceptMethod"
                data-component="interceptMethod"
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </Select>
              <Input
                value={interceptDraft.url}
                disabled={!selectedInterceptItem}
                onChange={(event) =>
                  setInterceptDraft({ ...interceptDraft, url: event.target.value })
                }
                spellCheck={false}
                data-testid="interceptUrl"
                data-component="interceptUrl"
              />
            </div>
          )}

          <FieldLabel htmlFor="interceptHeaders">
            {selectedInterceptItem?.stage === "response" ? "Response Headers" : "Request Headers"}
          </FieldLabel>
          <Textarea
            id="interceptHeaders"
            variant="code"
            className="h-[170px]"
            value={interceptHeadersText}
            disabled={!selectedInterceptItem}
            onChange={(event) => setInterceptHeadersText(event.target.value)}
            spellCheck={false}
            data-testid="interceptHeaders"
            data-component="interceptHeaders"
          />

          <FieldLabel htmlFor="interceptBody">
            {selectedInterceptItem?.stage === "response" ? "Response Body" : "Request Body"}
          </FieldLabel>
          <Textarea
            id="interceptBody"
            variant="code"
            className="h-[220px]"
            value={interceptDraft.body}
            disabled={!selectedInterceptItem}
            onChange={(event) =>
              setInterceptDraft({ ...interceptDraft, body: event.target.value })
            }
            spellCheck={false}
            data-testid="interceptBody"
            data-component="interceptBody"
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-rule radar-form-gradient px-5 py-4">
          <Button
            variant="solid"
            type="button"
            disabled={!selectedInterceptItem}
            onClick={() => void forwardIntercept()}
            data-testid="forwardIntercept"
            data-component="forwardIntercept"
          >
            <Send size={14} strokeWidth={1.8} />
            Forward
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={!selectedInterceptItem}
            onClick={() => void dropIntercept()}
            data-testid="dropIntercept"
            data-component="dropIntercept"
          >
            <Trash2 size={14} strokeWidth={1.8} />
            Drop
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={!selectedInterceptItem}
            onClick={() => {
              if (selectedInterceptItem) {
                selectInterceptItem(selectedInterceptItem.id);
              }
            }}
            data-testid="resetInterceptDraft"
            data-component="resetInterceptDraft"
          >
            <Eraser size={14} strokeWidth={1.7} />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
