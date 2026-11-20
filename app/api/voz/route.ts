import { connection } from "next/server";

const STUN: RTCIceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
  { urls: "stun:global.stun.twilio.com:3478" },
];

export async function GET() {
  await connection();
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return reply({ iceServers: STUN, relay: false });

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        cache: "no-store",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl: 6 * 60 * 60 }),
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
    const list = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    const relays = list
      .map((server) => ({
        ...server,
        urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => !/:53(\?|$)/.test(url)),
      }))
      .filter((server) => server.urls.length > 0);
    if (relays.length === 0) throw new Error("vacío");
    return reply({ iceServers: [...STUN, ...relays], relay: true });
  } catch {
    return reply({ iceServers: STUN, relay: false });
  }
}

function reply(body: { iceServers: RTCIceServer[]; relay: boolean }) {
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
