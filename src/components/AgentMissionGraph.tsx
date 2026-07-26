import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { CircleHelp, FlaskConical, GitBranch, Pin, Plus, ShieldCheck, Target } from "lucide-react";
import type {
  AgentMission,
  AgentMissionEntityKind,
  AgentMissionPriority,
  AgentMissionSteeringAction,
  AgentRun,
  AgentObjectiveStatus,
  AgentHypothesisStatus,
  AgentExperimentStatus,
  AgentClaimStatus,
  AgentCoverageStatus
} from "../types";
import { cn } from "../lib";
import { EmptyState, StatusBadge } from "./radar/primitives";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

type MissionNode = {
  key: string;
  entity: AgentMissionEntityKind;
  id: string;
  label: string;
  status: string;
  level: number;
  priority?: AgentMissionPriority;
  pinned?: boolean;
  evidenceRefs: string[];
};

type MissionItemStatus =
  | AgentObjectiveStatus
  | AgentHypothesisStatus
  | AgentExperimentStatus
  | AgentClaimStatus
  | AgentCoverageStatus;

const STATUS_OPTIONS: Record<AgentMissionEntityKind, string[]> = {
  objective: ["planned", "active", "blocked", "completed", "dismissed"],
  hypothesis: ["open", "testing", "supported", "rejected", "blocked", "stale"],
  experiment: ["planned", "running", "passed", "failed", "blocked", "skipped"],
  claim: ["lead", "supported", "contradicted", "verified"],
  coverage: ["untested", "planned", "testing", "covered", "blocked"]
};

const ENTITY_LABELS: Record<AgentMissionEntityKind, string> = {
  objective: "OBJ",
  hypothesis: "HYP",
  experiment: "EXP",
  claim: "CLM",
  coverage: "GAP"
};

function graphNodes(mission: AgentMission): MissionNode[] {
  const nodes: MissionNode[] = [];
  const seenHypotheses = new Set<string>();
  const seenExperiments = new Set<string>();
  const seenClaims = new Set<string>();
  for (const objective of [...mission.objectives].sort(
    (left, right) => left.priority - right.priority || left.id.localeCompare(right.id)
  )) {
    nodes.push({
      key: `objective:${objective.id}`,
      entity: "objective",
      id: objective.id,
      label: objective.title,
      status: objective.status,
      level: 1,
      priority: objective.priority,
      evidenceRefs: []
    });
    const hypotheses = mission.hypotheses
      .filter((item) => item.objectiveId === objective.id)
      .sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) || left.priority - right.priority || left.id.localeCompare(right.id)
      );
    for (const hypothesis of hypotheses) {
      seenHypotheses.add(hypothesis.id);
      nodes.push({
        key: `hypothesis:${hypothesis.id}`,
        entity: "hypothesis",
        id: hypothesis.id,
        label: hypothesis.statement,
        status: hypothesis.status,
        level: 2,
        priority: hypothesis.priority,
        pinned: hypothesis.pinned,
        evidenceRefs: hypothesis.evidenceRefs
      });
      for (const experiment of mission.experiments.filter((item) => item.hypothesisId === hypothesis.id)) {
        seenExperiments.add(experiment.id);
        nodes.push({
          key: `experiment:${experiment.id}`,
          entity: "experiment",
          id: experiment.id,
          label: experiment.title,
          status: experiment.status,
          level: 3,
          evidenceRefs: experiment.evidenceRefs
        });
      }
      for (const claim of mission.claims.filter((item) => item.hypothesisId === hypothesis.id)) {
        seenClaims.add(claim.id);
        nodes.push({
          key: `claim:${claim.id}`,
          entity: "claim",
          id: claim.id,
          label: claim.statement,
          status: claim.status,
          level: 3,
          evidenceRefs: claim.evidenceRefs
        });
      }
    }
  }
  for (const hypothesis of mission.hypotheses.filter((item) => !seenHypotheses.has(item.id))) {
    nodes.push({
      key: `hypothesis:${hypothesis.id}`,
      entity: "hypothesis",
      id: hypothesis.id,
      label: hypothesis.statement,
      status: hypothesis.status,
      level: 1,
      priority: hypothesis.priority,
      pinned: hypothesis.pinned,
      evidenceRefs: hypothesis.evidenceRefs
    });
  }
  for (const experiment of mission.experiments.filter((item) => !seenExperiments.has(item.id))) {
    nodes.push({
      key: `experiment:${experiment.id}`,
      entity: "experiment",
      id: experiment.id,
      label: experiment.title,
      status: experiment.status,
      level: 1,
      evidenceRefs: experiment.evidenceRefs
    });
  }
  for (const claim of mission.claims.filter((item) => !seenClaims.has(item.id))) {
    nodes.push({
      key: `claim:${claim.id}`,
      entity: "claim",
      id: claim.id,
      label: claim.statement,
      status: claim.status,
      level: 1,
      evidenceRefs: claim.evidenceRefs
    });
  }
  for (const cell of mission.coverage) {
    nodes.push({
      key: `coverage:${cell.id}`,
      entity: "coverage",
      id: cell.id,
      label: `${cell.dimension} / ${cell.label}`,
      status: cell.status,
      level: 1,
      evidenceRefs: cell.evidenceRefs
    });
  }
  return nodes;
}

function nodeGlyph(node: MissionNode) {
  if (node.entity === "objective") return <Target size={12} strokeWidth={1.8} />;
  if (node.entity === "hypothesis") return <GitBranch size={12} strokeWidth={1.8} />;
  if (node.entity === "experiment") return <FlaskConical size={12} strokeWidth={1.8} />;
  if (node.entity === "claim") return <ShieldCheck size={12} strokeWidth={1.8} />;
  return <CircleHelp size={12} strokeWidth={1.8} />;
}

export function AgentMissionGraph({
  run,
  onSteer
}: {
  run: AgentRun | null;
  onSteer: (action: AgentMissionSteeringAction) => void | Promise<void>;
}) {
  const mission = run?.mission || null;
  const nodes = useMemo(() => (mission ? graphNodes(mission) : []), [mission]);
  const [selectedKey, setSelectedKey] = useState("");
  const [newKind, setNewKind] = useState<"objective" | "hypothesis">("hypothesis");
  const [newItemText, setNewItemText] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const selectedNode = nodes.find((node) => node.key === selectedKey) || nodes[0] || null;
  const canSteer = Boolean(run && (run.status === "paused" || run.status === "failed"));

  useEffect(() => {
    setSelectedKey("");
    setNewItemText("");
    setQuestionText("");
    setAnswers({});
  }, [run?.id]);

  useEffect(() => {
    if (selectedKey && !nodes.some((node) => node.key === selectedKey)) {
      setSelectedKey(nodes[0]?.key || "");
    }
  }, [nodes, selectedKey]);

  const submitNewItem = (event: FormEvent) => {
    event.preventDefault();
    const text = newItemText.trim();
    if (!text || !canSteer) return;
    if (newKind === "objective") {
      void onSteer({ action: "add-objective", title: text, priority: 3 });
    } else {
      const objectiveId = selectedNode?.entity === "objective" ? selectedNode.id : mission?.objectives[0]?.id;
      void onSteer({ action: "add-hypothesis", statement: text, objectiveId, priority: 3 });
    }
    setNewItemText("");
  };

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    const prompt = questionText.trim();
    if (!prompt || !canSteer) return;
    void onSteer({ action: "ask-operator", prompt });
    setQuestionText("");
  };

  const onTreeKeyDown = (event: KeyboardEvent) => {
    if (!nodes.length) return;
    const currentIndex = Math.max(0, nodes.findIndex((node) => node.key === selectedNode?.key));
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") nextIndex = Math.min(nodes.length - 1, currentIndex + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = nodes.length - 1;
    else return;
    event.preventDefault();
    setSelectedKey(nodes[nextIndex]?.key || "");
    document.getElementById(`mission-node-${nodes[nextIndex]?.key}`)?.focus();
  };

  const coverageByDimension = mission
    ? ["host", "endpoint", "identity", "state", "control"].map((dimension) => {
        const cells = mission.coverage.filter((cell) => cell.dimension === dimension);
        return { dimension, covered: cells.filter((cell) => cell.status === "covered").length, total: cells.length };
      })
    : [];

  return (
    <section className="border border-signal/30 bg-surface/60 md:col-span-2" aria-labelledby="mission-graph-heading" data-testid="agentMissionGraph">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-signal/[0.035] px-3 py-2">
        <div className="flex items-center gap-2">
          <GitBranch size={13} className="text-signal" strokeWidth={1.8} />
          <h2 id="mission-graph-heading" className="rd-eyebrow text-bone">
            Mission Graph
          </h2>
          {mission && <StatusBadge>r{mission.revision}</StatusBadge>}
        </div>
        <div className="flex flex-wrap gap-1" aria-live="polite">
          <StatusBadge>{mission?.hypotheses.length || 0} hypotheses</StatusBadge>
          <StatusBadge>{mission?.experiments.length || 0} experiments</StatusBadge>
          <StatusBadge>{mission?.claims.length || 0} claims</StatusBadge>
          <StatusBadge>{mission?.status || "idle"}</StatusBadge>
        </div>
      </div>

      {!mission ? (
        <div className="p-4"><EmptyState>Start or select a run to open its durable Mission Graph.</EmptyState></div>
      ) : (
        <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <div className="min-w-0 border-b border-rule lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-2 gap-px border-b border-rule bg-rule sm:grid-cols-5">
              {coverageByDimension.map(({ dimension, covered, total }) => (
                <div key={dimension} className="bg-ink/70 px-2 py-2">
                  <span className="block rd-label-sm text-muted">{dimension}</span>
                  <span className="mt-1 block font-mono text-label text-copy">
                    {covered} covered / {total || "unknown"}
                  </span>
                </div>
              ))}
            </div>
            <div className="max-h-[270px] overflow-auto p-2" role="tree" aria-label="Mission objectives and evidence graph" onKeyDown={onTreeKeyDown}>
              {nodes.map((node) => {
                const selected = selectedNode?.key === node.key;
                return (
                  <button
                    key={node.key}
                    id={`mission-node-${node.key}`}
                    type="button"
                    role="treeitem"
                    aria-level={node.level}
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setSelectedKey(node.key)}
                    className={cn(
                      "relative mb-px grid min-h-9 w-full grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2 border border-transparent px-2 py-1.5 text-left transition",
                      "hover:border-signal/25 hover:bg-signal/[0.04]",
                      selected && "border-signal/40 bg-signal/[0.07] before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0.5 before:bg-signal"
                    )}
                    style={{ paddingLeft: `${8 + (node.level - 1) * 18}px` }}
                    data-testid={`missionNode-${node.key}`}
                  >
                    <span className="flex items-center gap-1 rd-label-sm text-signal">
                      {nodeGlyph(node)} {ENTITY_LABELS[node.entity]}
                    </span>
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-meta text-copy">
                      {node.label}
                    </span>
                    <span className="flex items-center gap-1">
                      {node.pinned && <Pin size={10} className="text-sand" aria-label="Pinned" />}
                      {node.priority && <span className="font-mono text-nano text-muted">P{node.priority}</span>}
                      <StatusBadge>{node.status}</StatusBadge>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid content-start gap-3 p-3">
            {selectedNode ? (
              <div data-testid="missionNodeInspector">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rd-label text-signal">
                    {ENTITY_LABELS[selectedNode.entity]} / {selectedNode.id}
                  </span>
                  <StatusBadge>{selectedNode.evidenceRefs.length} evidence</StatusBadge>
                </div>
                <p className="mt-2 text-body leading-5 text-copy">{selectedNode.label}</p>
                {selectedNode.evidenceRefs.length > 0 && (
                  <p className="mt-2 select-text break-all font-mono text-micro leading-4 text-muted">
                    {selectedNode.evidenceRefs.join(" · ")}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Select
                    variant="compact"
                    value={selectedNode.status}
                    disabled={!canSteer}
                    aria-label={`Status for ${selectedNode.id}`}
                    onChange={(event) =>
                      void onSteer({
                        action: "update-item",
                        entity: selectedNode.entity,
                        id: selectedNode.id,
                        status: event.target.value as MissionItemStatus
                      })
                    }
                    data-testid="missionStatusSelect"
                  >
                    {STATUS_OPTIONS[selectedNode.entity].map((status) => <option key={status} value={status}>{status}</option>)}
                  </Select>
                  {(selectedNode.entity === "objective" || selectedNode.entity === "hypothesis") && (
                    <Select
                      variant="compact"
                      value={String(selectedNode.priority || 3)}
                      disabled={!canSteer}
                      aria-label={`Priority for ${selectedNode.id}`}
                      onChange={(event) =>
                        void onSteer({
                          action: "update-item",
                          entity: selectedNode.entity,
                          id: selectedNode.id,
                          priority: Number(event.target.value) as AgentMissionPriority
                        })
                      }
                      data-testid="missionPrioritySelect"
                    >
                      {[1, 2, 3, 4, 5].map((priority) => <option key={priority} value={priority}>P{priority}</option>)}
                    </Select>
                  )}
                  {selectedNode.entity === "hypothesis" && (
                    <Button
                      type="button"
                      variant={selectedNode.pinned ? "solid" : "outline"}
                      size="compact"
                      disabled={!canSteer}
                      onClick={() => void onSteer({ action: "update-item", entity: "hypothesis", id: selectedNode.id, pinned: !selectedNode.pinned })}
                      data-testid="missionPinHypothesis"
                    >
                      <Pin size={11} strokeWidth={1.8} /> {selectedNode.pinned ? "Pinned" : "Pin"}
                    </Button>
                  )}
                </div>
              </div>
            ) : <EmptyState>No mission nodes yet.</EmptyState>}

            <form className="grid grid-cols-[112px_minmax(0,1fr)_auto] gap-2" onSubmit={submitNewItem}>
              <Select variant="compact" value={newKind} onChange={(event) => setNewKind(event.target.value as "objective" | "hypothesis")} disabled={!canSteer} aria-label="New mission item kind">
                <option value="hypothesis">Hypothesis</option>
                <option value="objective">Objective</option>
              </Select>
              <Input variant="compact" value={newItemText} onChange={(event) => setNewItemText(event.target.value)} disabled={!canSteer} placeholder="Add an operator-owned branch" data-testid="missionNewItemInput" />
              <Button type="submit" variant="outline" size="compact" disabled={!canSteer || !newItemText.trim()} data-testid="missionAddItem">
                <Plus size={11} /> Add
              </Button>
            </form>

            <form className="grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={submitQuestion}>
              <Input variant="compact" value={questionText} onChange={(event) => setQuestionText(event.target.value)} disabled={!canSteer} placeholder="Record a question that must be answered before resume" data-testid="missionQuestionInput" />
              <Button type="submit" variant="outline" size="compact" disabled={!canSteer || !questionText.trim()} data-testid="missionAskOperator">
                <CircleHelp size={11} /> Ask
              </Button>
            </form>

            {mission.operatorQuestions.filter((question) => question.status === "open").map((question) => (
              <div key={question.id} className="border border-sand/35 bg-sand/[0.055] p-2" role="alert" data-testid={`missionQuestion-${question.id}`}>
                <p className="rd-label text-sand">Operator answer required</p>
                <p className="mt-1 text-meta leading-5 text-copy">{question.prompt}</p>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                  <Input variant="compact" value={answers[question.id] || ""} onChange={(event) => setAnswers((items) => ({ ...items, [question.id]: event.target.value }))} placeholder="Answer with a bounded instruction" data-testid={`missionAnswer-${question.id}`} />
                  <Button type="button" variant="solid" size="compact" disabled={!answers[question.id]?.trim()} onClick={() => void onSteer({ action: "answer-operator", questionId: question.id, answer: answers[question.id] || "" })}>Answer</Button>
                  <Button type="button" variant="ghost" size="compact" onClick={() => void onSteer({ action: "dismiss-operator", questionId: question.id })}>Dismiss</Button>
                </div>
              </div>
            ))}

            <p className="font-mono text-micro leading-4 text-muted">
              {canSteer
                ? "STEERING ARMED · every mutation is revision-checked and appended to the run transcript"
                : "PAUSE TO STEER · active and terminal runs keep the graph read-only"}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
