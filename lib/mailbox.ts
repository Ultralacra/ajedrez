type Envelope = { n: number; id: string; body: unknown };

type RoomBox = {
  seen: Set<string>;
  hostAt: number;
  guestAt: number;
  n: number;
  toHost: Envelope[];
  toGuest: Envelope[];
};

type MailGlobal = typeof globalThis & { __enroqueMail?: Map<string, RoomBox> };

const FRESH_MS = 4000;

function boxes() {
  const root = globalThis as MailGlobal;
  if (!root.__enroqueMail) root.__enroqueMail = new Map();
  return root.__enroqueMail;
}

function emptyBox(): RoomBox {
  return { seen: new Set(), hostAt: 0, guestAt: 0, n: 0, toHost: [], toGuest: [] };
}

export type MailRole = "host" | "guest";

export type MailInput = {
  role: MailRole;
  since: number;
  messages: { id: string; body: unknown }[];
};

export type MailResult = {
  cursor: number;
  peerOnline: boolean;
  messages: unknown[];
};

export function exchange(code: string, input: MailInput): MailResult {
  const map = boxes();
  const now = Date.now();
  for (const [key, box] of map) {
    if (now - Math.max(box.hostAt, box.guestAt) > 30 * 60 * 1000) map.delete(key);
  }

  let box = map.get(code);
  if (!box) {
    box = emptyBox();
    map.set(code, box);
  }

  if (input.role === "host") box.hostAt = now;
  else box.guestAt = now;

  const inbox = input.role === "host" ? box.toGuest : box.toHost;
  for (const message of input.messages.slice(0, 20)) {
    if (!message || typeof message.id !== "string" || message.id.length < 8 || message.id.length > 80) continue;
    if (box.seen.has(message.id)) continue;
    box.seen.add(message.id);
    box.n += 1;
    inbox.push({ n: box.n, id: message.id, body: message.body });
  }

  if (box.seen.size > 500) {
    const drop = box.seen.size - 400;
    const ids = box.seen.values();
    for (let i = 0; i < drop; i += 1) {
      const id = ids.next().value;
      if (id) box.seen.delete(id);
    }
  }

  const since = Number.isFinite(input.since) ? input.since : 0;
  const mine = input.role === "host" ? box.toHost : box.toGuest;
  const fresh = mine.filter((item) => item.n > since);
  if (input.role === "host") box.toHost = mine.filter((item) => item.n > since);
  else box.toGuest = mine.filter((item) => item.n > since);
  if (inbox.length > 80) inbox.splice(0, inbox.length - 80);

  const other = input.role === "host" ? box.guestAt : box.hostAt;
  return {
    cursor: box.n,
    peerOnline: other > 0 && now - other < FRESH_MS,
    messages: fresh.map((item) => item.body),
  };
}
