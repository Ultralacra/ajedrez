import { connection } from "next/server";
import { exchange, type MailRole } from "@/lib/mailbox";
import { normalizeCode } from "@/lib/local";

export async function POST(request: Request, context: { params: Promise<{ codigo: string }> }) {
  await connection();
  const { codigo } = await context.params;
  const code = normalizeCode(codigo);
  if (code.length !== 6) return Response.json({ error: "codigo" }, { status: 404 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "json" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") return Response.json({ error: "json" }, { status: 400 });

  const body = payload as { role?: unknown; since?: unknown; messages?: unknown };
  const role: MailRole | null = body.role === "host" || body.role === "guest" ? body.role : null;
  if (!role) return Response.json({ error: "rol" }, { status: 400 });

  const since = typeof body.since === "number" && Number.isFinite(body.since) ? body.since : 0;
  const messages = Array.isArray(body.messages) ? body.messages.flatMap(readMessage) : [];
  return Response.json(exchange(code, { role, since, messages }), {
    headers: { "cache-control": "no-store" },
  });
}

function readMessage(value: unknown) {
  if (!value || typeof value !== "object") return [];
  const message = value as { id?: unknown; body?: unknown };
  if (typeof message.id !== "string") return [];
  const size = JSON.stringify(message.body ?? null).length;
  if (size > 80_000) return [];
  return [{ id: message.id, body: message.body }];
}
