import { NextResponse } from "next/server";
import { getAutomationSnapshot, resetAutomation } from "@/lib/automation";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getAutomationSnapshot());
}

export async function POST(request: Request) {
  let body: unknown = {};
  try { body = await request.json(); } catch { /* empty body is accepted for reset */ }
  if (body && typeof body === "object" && "action" in body && body.action === "reset") {
    return NextResponse.json(resetAutomation());
  }
  return NextResponse.json({ ok: false, error: "請使用任務端點指定 start、pause、stop 或 update。" }, { status: 400 });
}
