import type {
  CaptureInterceptRecord,
  MatchReplaceHit,
  TlsDetails
} from "../../shared/domain.js";

export function parseRecordJson(value: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, entry]) => [
        key,
        typeof entry === "string" ? entry : String(entry)
      ])
    );
  } catch {
    return {};
  }
}

export function parseTlsJson(value: string | null): TlsDetails | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const tls = parsed as Partial<Record<keyof TlsDetails, unknown>>;
    return {
      protocol: typeof tls.protocol === "string" ? tls.protocol : "",
      issuer: typeof tls.issuer === "string" ? tls.issuer : "",
      subjectName: typeof tls.subjectName === "string" ? tls.subjectName : "",
      validFrom: typeof tls.validFrom === "number" ? tls.validFrom : Number(tls.validFrom || 0),
      validTo: typeof tls.validTo === "number" ? tls.validTo : Number(tls.validTo || 0)
    };
  } catch {
    return null;
  }
}

export function parseInterceptJson(
  value: string | null
): CaptureInterceptRecord[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const records: CaptureInterceptRecord[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Partial<Record<keyof CaptureInterceptRecord, unknown>>;
      const stage = record.stage === "response" ? "response" : "request";
      const resolution =
        record.resolution === "forwarded" ||
        record.resolution === "dropped" ||
        record.resolution === "edited" ||
        record.resolution === "resumed"
          ? record.resolution
          : "queued";
      const queuedAt = typeof record.queuedAt === "string" ? record.queuedAt : "";
      if (!queuedAt) {
        continue;
      }
      const nextRecord: CaptureInterceptRecord = {
        stage,
        queuedAt,
        resolution,
        edited: Boolean(record.edited)
      };
      if (typeof record.resolvedAt === "string") {
        nextRecord.resolvedAt = record.resolvedAt;
      }
      if (typeof record.note === "string") {
        nextRecord.note = record.note;
      }
      if (Array.isArray(record.ruleHits)) {
        nextRecord.ruleHits = record.ruleHits
          .map((hit) => {
            if (!hit || typeof hit !== "object" || Array.isArray(hit)) {
              return null;
            }
            const item = hit as Record<string, unknown>;
            return {
              ruleId: String(item.ruleId || ""),
              name: String(item.name || ""),
              reason: String(item.reason || "")
            };
          })
          .filter((hit): hit is NonNullable<CaptureInterceptRecord["ruleHits"]>[number] =>
            Boolean(hit?.ruleId && hit.name)
          );
      }
      records.push(nextRecord);
    }
    return records.length > 0 ? records : undefined;
  } catch {
    return undefined;
  }
}

export function parseRewriteJson(value: string | null): MatchReplaceHit[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const hits = parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }
        const hit = entry as Partial<Record<keyof MatchReplaceHit, unknown>>;
        const stage = hit.stage === "response" ? "response" : "request";
        const target = hit.target === "header" ? "header" : "body";
        const ruleId = String(hit.ruleId || "");
        const name = String(hit.name || "");
        if (!ruleId || !name) {
          return null;
        }
        return {
          ruleId,
          name,
          stage,
          target,
          detail: String(hit.detail || "")
        };
      })
      .filter((hit): hit is MatchReplaceHit => Boolean(hit));
    return hits.length > 0 ? hits : undefined;
  } catch {
    return undefined;
  }
}

export function parseJsonArray<T>(value: string, fallback: T[] = []) {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function parseJsonObject<T>(value: string, fallback: T) {
  try {
    const parsed: unknown = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as T)
      : fallback;
  } catch {
    return fallback;
  }
}
