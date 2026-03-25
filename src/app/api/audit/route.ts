import { NextRequest, NextResponse } from "next/server";
import { getAuditLog, getAuditStats } from "@/lib/audit/logger";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "stats";

    if (view === "stats") {
      const stats = await getAuditStats();
      return NextResponse.json(stats);
    }

    const entityType = searchParams.get("entityType") || undefined;
    const entityId = searchParams.get("entityId") || undefined;
    const source = searchParams.get("source") || undefined;
    const limit = parseInt(searchParams.get("limit") || "100");

    const log = await getAuditLog({ entityType, entityId, source, limit });
    return NextResponse.json({ log });
  } catch (error) {
    console.error("[API] Audit error:", error);
    return NextResponse.json({ error: "Failed to fetch audit data" }, { status: 500 });
  }
}
