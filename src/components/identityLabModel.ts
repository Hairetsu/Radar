import type { IdentityProfile } from "../../shared/identityProfiles.js";
import type { CapturedRequest } from "../types";
import {
  cleanActionId,
  comparisonFields,
  comparisonSignature,
  resourceLabel,
  type MatrixRow
} from "./identityLabPresentation";

export function buildIdentityLabModel({
  workspaceId,
  identities,
  captures,
  leftCaptureId,
  rightCaptureId
}: {
  workspaceId: string;
  identities: IdentityProfile[];
  captures: CapturedRequest[];
  leftCaptureId: string;
  rightCaptureId: string;
}) {
  const workspaceIdentities = identities.filter(
    (identity) => identity.workspaceId === workspaceId
  );
  const identityById = new Map(workspaceIdentities.map((identity) => [identity.id, identity]));
  const attributedCaptures = captures.filter((capture) =>
    Boolean(capture.activationId && capture.identityId && identityById.has(capture.identityId))
  );
  const matrix = new Map<string, MatrixRow>();
  for (const capture of attributedCaptures) {
    const identity = identityById.get(capture.identityId || "");
    if (!identity) continue;
    const resource = resourceLabel(capture);
    const key = `${identity.roleLabel}\n${identity.tenantLabel}\n${resource}`;
    const row = matrix.get(key) || {
      key,
      role: identity.roleLabel,
      tenant: identity.tenantLabel,
      resource,
      identityLabels: [],
      captures: []
    };
    row.identityLabels.push(identity.label);
    row.captures.push(capture);
    matrix.set(key, row);
  }
  const matrixRows = [...matrix.values()]
    .map((row) => ({
      ...row,
      identityLabels: [...new Set(row.identityLabels)].sort((left, right) =>
        left.localeCompare(right)
      )
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  const groupedActions = new Map<string, CapturedRequest[]>();
  for (const capture of captures) {
    const actionId = cleanActionId(capture.actionId);
    if (!actionId) continue;
    groupedActions.set(actionId, [...(groupedActions.get(actionId) || []), capture]);
  }
  const actionGroups = [...groupedActions.entries()]
    .map(([actionId, requests]) => ({
      actionId,
      requests: [...requests].sort(
        (left, right) =>
          left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id)
      )
    }))
    .sort((left, right) => {
      const leftTime = left.requests[0]?.startedAt || "";
      const rightTime = right.requests[0]?.startedAt || "";
      return leftTime.localeCompare(rightTime) || left.actionId.localeCompare(right.actionId);
    });
  const unmatchedCaptures = captures
    .filter((capture) => !cleanActionId(capture.actionId))
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const leftCapture = attributedCaptures.find((capture) => capture.id === leftCaptureId);
  const matchingRightCaptures = leftCapture
    ? attributedCaptures.filter(
        (capture) =>
          capture.id !== leftCapture.id &&
          capture.identityId !== leftCapture.identityId &&
          comparisonSignature(capture) === comparisonSignature(leftCapture)
      )
    : [];
  const rightCapture = matchingRightCaptures.find((capture) => capture.id === rightCaptureId);
  const comparedFields =
    leftCapture && rightCapture ? comparisonFields(leftCapture, rightCapture) : [];

  return {
    workspaceIdentities,
    identityById,
    attributedCaptures,
    unattributedCount: captures.length - attributedCaptures.length,
    matrixRows,
    actionGroups,
    unmatchedCaptures,
    leftCapture,
    matchingRightCaptures,
    rightCapture,
    comparedFields,
    comparisonDiffers: comparedFields.some((field) => field.different),
    hasSnapshotIdentity: workspaceIdentities.some(
      (identity) => identity.isolation === "snapshot-only"
    )
  };
}
