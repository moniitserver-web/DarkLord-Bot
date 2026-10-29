import { NextResponse } from "next/server";
import { getAutomationSnapshot, getAutomationTask, pauseAutomation, startAutomation, stopAutomation, tickAutomation, updateAutomation } from "@/lib/automation";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "自動化操作失敗。" }, { status: 400 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ ...getAutomationSnapshot(), task: getAutomationTask(id) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* default to start */ }
    const action = body.action ?? "start";
    if (action === "start") return NextResponse.json(startAutomation(id));
    if (action === "pause") return NextResponse.json(pauseAutomation(id));
    if (action === "stop") return NextResponse.json(stopAutomation(id));
    if (action === "tick") {
      const result = tickAutomation(id);
      return NextResponse.json({ ...result.snapshot, task: result.task, actions: result.actions });
    }
    if (action === "update") {
      return NextResponse.json(updateAutomation(id, {
        name: typeof body.name === "string" ? body.name : undefined,
        mode: body.mode === "native" || body.mode === "dry-run" ? body.mode : undefined,
        config: body.config && typeof body.config === "object" ? body.config as never : undefined,
      }));
    }
    return NextResponse.json({ ok: false, error: "不支援的 action。" }, { status: 400 });
  } catch (error) { return errorResponse(error); }
}
