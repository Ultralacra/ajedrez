"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DataConnection, MediaConnection, Peer } from "peerjs";

export type LinkStatus = "connecting" | "waiting" | "live" | "error";

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"],
      username: "peerjs",
      credential: "peerjsp",
    },
  ],
};

export function peerIdFor(code: string) {
  return `enroque-${code.toLowerCase()}`;
}

export function usePeerRoom({
  code,
  isHost,
  enabled,
  nonce,
  onData,
  onLink,
}: {
  code: string;
  isHost: boolean;
  enabled: boolean;
  nonce: number;
  onData: (data: unknown) => void;
  onLink: (status: LinkStatus) => void;
}) {
  const [status, setStatus] = useState<LinkStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const onDataRef = useRef(onData);
  const onLinkRef = useRef(onLink);
  const isHostRef = useRef(isHost);
  const connRef = useRef<DataConnection | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const pendingCallRef = useRef<MediaConnection | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  onDataRef.current = onData;
  onLinkRef.current = onLink;
  isHostRef.current = isHost;

  const attachCall = useCallback((call: MediaConnection) => {
    const previous = callRef.current;
    if (previous && previous !== call) previous.close();
    callRef.current = call;
    const hear = (stream: MediaStream) => {
      if (callRef.current !== call || stream.getAudioTracks().length === 0) return;
      setRemoteStream(stream);
    };
    call.on("stream", hear);
    const pc = call.peerConnection;
    pc?.addEventListener("track", (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      hear(stream);
      event.track.onunmute = () => hear(stream);
    });
    call.on("close", () => {
      if (callRef.current === call) setRemoteStream(null);
    });
    call.on("error", () => {
      if (callRef.current === call) setRemoteStream(null);
    });
  }, []);

  const placeCall = useCallback(() => {
    const peer = peerRef.current;
    const stream = localStreamRef.current;
    if (!peer || peer.destroyed || !peer.open || !stream || isHostRef.current) return;
    const call = peer.call(peerIdFor(code), stream);
    attachCall(call);
  }, [attachCall, code]);

  const enableMic = useCallback(async () => {
    if (localStreamRef.current) {
      if (!isHostRef.current) placeCall();
      return true;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("Este navegador no puede usar el micrófono.");
      return false;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name !== "OverconstrainedError" && name !== "ConstraintNotSatisfiedError") throw err;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicError(null);
      setMuted(false);
      const pending = pendingCallRef.current;
      if (pending) {
        pending.answer(stream);
        attachCall(pending);
        pendingCallRef.current = null;
      } else if (!isHostRef.current) {
        placeCall();
      }
      return true;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setMicError(
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Permiso de micrófono bloqueado. Actívalo en el navegador."
          : name === "NotFoundError"
            ? "Este aparato no tiene un micrófono que se pueda usar."
            : "No se pudo abrir el micrófono.",
      );
      return false;
    }
  }, [attachCall, placeCall]);

  const send = useCallback((message: unknown) => {
    const conn = connRef.current;
    if (!conn?.open) return;
    try {
      conn.send(JSON.parse(JSON.stringify(message)) as unknown);
    } catch {
      /* la jugada siguiente vuelve a sincronizar */
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let peer: Peer | null = null;
    let timer = 0;
    let generation = 0;

    const emit = (next: LinkStatus) => {
      if (cancelled) return;
      setStatus(next);
      if (next !== "connecting") onLinkRef.current(next);
    };

    const destroyPeer = () => {
      peer?.removeAllListeners();
      peer?.destroy();
      peer = null;
      peerRef.current = null;
    };

    const boot = async (attempt: number) => {
      if (cancelled) return;
      const gen = ++generation;
      setError(null);
      setStatus("connecting");
      const { Peer } = await import("peerjs");
      if (cancelled || gen !== generation) return;
      destroyPeer();
      connRef.current = null;

      const onIncoming = (call: MediaConnection) => {
        const stream = localStreamRef.current;
        if (!stream) {
          pendingCallRef.current?.close();
          pendingCallRef.current = call;
          return;
        }
        call.answer(stream);
        attachCall(call);
      };

      const bindConn = (conn: DataConnection) => {
        if (connRef.current && connRef.current !== conn) connRef.current.close();
        connRef.current = conn;
        conn.on("data", (data) => onDataRef.current(data));
        conn.on("open", () => {
          if (cancelled) return;
          emit("live");
          if (!isHostRef.current && localStreamRef.current) placeCall();
        });
        conn.on("close", () => {
          if (cancelled || connRef.current !== conn) return;
          connRef.current = null;
          setRemoteStream(null);
          if (isHostRef.current) {
            emit("waiting");
            return;
          }
          if (attempt < 4 && retry(700)) {
            emit("waiting");
            return;
          }
          setError("Se cortó la conexión. Puedes reintentar.");
          emit("error");
        });
      };

      const fail = (message: string) => {
        if (cancelled || gen !== generation) return;
        destroyPeer();
        setError(message);
        emit("error");
      };

      const retry = (delay: number) => {
        if (cancelled || gen !== generation || attempt >= 6) return false;
        destroyPeer();
        timer = window.setTimeout(() => void boot(attempt + 1), delay);
        return true;
      };

      if (isHost) {
        peer = new Peer(peerIdFor(code), { config: ICE, debug: 0 });
      } else {
        peer = new Peer({ config: ICE, debug: 0 });
      }
      peerRef.current = peer;

      peer.on("open", () => {
        if (cancelled || gen !== generation || !peer) return;
        if (isHost) emit("waiting");
        else bindConn(peer.connect(peerIdFor(code), { reliable: true }));
      });
      peer.on("connection", (conn) => {
        if (!cancelled && isHost) bindConn(conn);
      });
      peer.on("call", onIncoming);
      peer.on("disconnected", () => {
        if (!cancelled && peer && !peer.destroyed) peer.reconnect();
      });
      peer.on("error", (err) => {
        if (cancelled || gen !== generation) return;
        if (err.type === "unavailable-id") {
          if (retry(700 * (attempt + 1))) return;
          fail("Esta sala ya está abierta en otra pestaña.");
          return;
        }
        if (err.type === "peer-unavailable") {
          if (retry(800)) return;
          fail("Nadie tiene abierta esta sala. Pídele al anfitrión que entre, o ábrela tú.");
          return;
        }
        if (err.type === "browser-incompatible") {
          fail("Este navegador no puede jugar en vivo. Prueba Chrome, Edge o Firefox.");
          return;
        }
        if (err.type === "network" || err.type === "server-error" || err.type === "socket-error" || err.type === "socket-closed") {
          if (connRef.current?.open) return;
          if (retry(900)) return;
          fail("No se pudo usar el servidor de señal. Revisa tu red y reintenta.");
        }
      });
    };

    timer = window.setTimeout(() => void boot(0), 40);

    return () => {
      cancelled = true;
      generation += 1;
      window.clearTimeout(timer);
      connRef.current?.close();
      connRef.current = null;
      callRef.current?.close();
      callRef.current = null;
      pendingCallRef.current?.close();
      pendingCallRef.current = null;
      destroyPeer();
    };
  }, [attachCall, code, enabled, isHost, nonce, placeCall]);

  useEffect(() => {
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }, [localStream, muted]);

  return {
    status: enabled ? status : "connecting",
    error,
    remoteStream,
    localStream,
    micError,
    muted,
    setMuted,
    send,
    enableMic,
    placeCall,
  };
}
