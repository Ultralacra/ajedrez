import { connection } from "next/server";

const STUN: RTCIceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
  { urls: "stun:global.stun.twilio.com:3478" },
];

export async function GET() {
  await connection();
  const relays = [...staticRelays(), ...(await cloudflareRelays())];
  return Response.json(
    { iceServers: [...STUN, ...relays], relay: relays.length > 0 },
    { headers: { "cache-control": "no-store" } },
  );
}

function staticRelays(): RTCIceServer[] {
  const urls = (process.env.TURN_URL ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;
  if (urls.length === 0 || !username || !credential) return [];
  return [{ urls, username, credential }];
}

async function cloudflareRelays(): Promise<RTCIceServer[]> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return [];

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
    if (!response.ok) return [];
    const data = (await response.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
    const list = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    return list
      .map((server) => ({
        ...server,
        urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => !/:53(\?|$)/.test(url)),
      }))
      .filter((server) => server.urls.length > 0);
  } catch {
    return [];
  }
}
