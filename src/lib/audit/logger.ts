import { getDb } from "../db";

export type EntityType = "price" | "deal" | "holding" | "fundamental";
export type AuditAction = "fetch" | "update" | "conflict" | "failover" | "validated" | "rejected";

interface AuditEntry {
  entityType: EntityType;
  entityId: string;
  source: string;
  action: AuditAction;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = getDb();
    await db.from("audit_log").insert({
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      source: entry.source,
      action: entry.action,
      old_value: entry.oldValue ? JSON.stringify(entry.oldValue) : null,
      new_value: entry.newValue ? JSON.stringify(entry.newValue) : null,
      confidence: entry.confidence ?? 1.0,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    });
  } catch {
    // Audit logging should never break the main flow
  }
}

export async function getAuditLog(options: {
  entityType?: string;
  entityId?: string;
  source?: string;
  limit?: number;
}) {
  const db = getDb();
  const limit = options.limit || 100;

  let query = db
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.entityType) {
    query = query.eq("entity_type", options.entityType);
  }
  if (options.entityId) {
    query = query.eq("entity_id", options.entityId);
  }
  if (options.source) {
    query = query.eq("source", options.source);
  }

  const { data } = await query;
  return data || [];
}

export async function getAuditStats() {
  const db = getDb();

  const { count: totalEntries } = await db
    .from("audit_log")
    .select("*", { count: "exact", head: true });

  const { data: bySource } = await db.rpc("get_audit_by_source").select("*");

  // Fallback: if the RPC doesn't exist, fetch raw and aggregate in JS
  let bySourceResult = bySource;
  if (!bySourceResult) {
    const { data: allLogs } = await db
      .from("audit_log")
      .select("source, action, confidence");

    if (allLogs) {
      const sourceMap = new Map<string, { count: number; conflicts: number; totalConfidence: number }>();
      for (const log of allLogs) {
        const entry = sourceMap.get(log.source) || { count: 0, conflicts: 0, totalConfidence: 0 };
        entry.count++;
        if (log.action === "conflict") entry.conflicts++;
        entry.totalConfidence += log.confidence || 0;
        sourceMap.set(log.source, entry);
      }
      bySourceResult = Array.from(sourceMap.entries())
        .map(([source, stats]) => ({
          source,
          count: stats.count,
          conflicts: stats.conflicts,
          avg_confidence: stats.count > 0 ? stats.totalConfidence / stats.count : 0,
        }))
        .sort((a, b) => b.count - a.count);
    }
  }

  // Get action breakdown
  const { data: allActions } = await db
    .from("audit_log")
    .select("action");

  const actionMap = new Map<string, number>();
  for (const row of allActions || []) {
    actionMap.set(row.action, (actionMap.get(row.action) || 0) + 1);
  }
  const byAction = Array.from(actionMap.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);

  const { data: recentConflicts } = await db
    .from("audit_log")
    .select("*")
    .eq("action", "conflict")
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    totalEntries: totalEntries || 0,
    bySource: bySourceResult || [],
    byAction,
    recentConflicts: recentConflicts || [],
  };
}
