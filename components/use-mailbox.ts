"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LinkStatus } from "@/components/use-peer";

type Outgoing = { id: string; body: unknown };

export function useMailbox({
  code,
  isHost,
  enabled,
  nonce,
  onData,
}: {
  code: string;
  isHost: boolean;
  enabled: boolean;
  nonce: number;
  onData: (data: unknown) => void;
}) {
  const [status, setStatus] = useState<LinkStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const onDataRef = useRef(onData);
  const queueRef = useRef<Outgoing[]>([]);
  const wakeRef = useRef<(() => void) | null>(null);
  onDataRef.current = onData;

  const send = useCallback((message: unknown) => {
    queueRef.current.push({ id: crypto.randomUUID(), body: message });
    wakeRef.current?.();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer = 0;
    let since = 0;
    let failures = 0;
    let last: LinkStatus = "connecting";
    let inflight = false;
    let again = false;
    queueRef.current = [];

    const applyStatus = (next: LinkStatus, message: string | null) => {
      if (cancelled || next === last) return;
      last = next;
      setStatus(next);
      setError(message);
    };

    const tick = async () => {
      if (cancelled) return;
      if (inflight) {
        again = true;
        return;
      }
      inflight = true;
      const outgoing = queueRef.current.splice(0, 20);
      let pause = 350;
      try {
        const response = await fetch(`/api/sala/${code}`, {
          method: "POST",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            role: isHost ? "host" : "guest",
            since,
            messages: outgoing,
          }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as {
          cursor?: number;
          peerOnline?: boolean;
          messages?: unknown[];
        };
        if (cancelled) return;
        failures = 0;
        if (typeof data.cursor === "number") since = data.cursor;
        for (const message of data.messages ?? []) onDataRef.current(message);
        applyStatus(data.peerOnline ? "live" : "waiting", null);
      } catch {
        if (outgoing.length) queueRef.current = [...outgoing, ...queueRef.current];
        failures += 1;
        pause = 700;
        if (failures >= 4) {
          applyStatus("error", "No se pudo usar la sala de este servidor. Revisa que la página siga abierta y reintenta.");
        }
      } finally {
        inflight = false;
      }
      if (cancelled) return;
      if (again || queueRef.current.length > 0) {
        again = false;
        pause = 30;
      }
      timer = window.setTimeout(() => void tick(), pause);
    };

    wakeRef.current = () => {
      if (cancelled) return;
      if (inflight) {
        again = true;
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), 20);
    };

    timer = window.setTimeout(() => void tick(), 40);
    return () => {
      cancelled = true;
      wakeRef.current = null;
      window.clearTimeout(timer);
    };
  }, [code, enabled, isHost, nonce]);

  return {
    status: enabled ? status : "connecting",
    error,
    send,
  };
}
