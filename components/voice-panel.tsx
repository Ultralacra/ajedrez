"use client";

import { useEffect, useRef, useState } from "react";
import type { LinkStatus } from "@/components/use-peer";

function Meter({ stream, active }: { stream: MediaStream | null; active: boolean }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream || !active) return;
    const audio = sharedAudio();
    if (!audio) return;
    const source = audio.createMediaStreamSource(stream);
    const analyser = audio.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    let last = 0;
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      if (time - last < 80) return;
      last = time;
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (const value of bins) sum += value;
      setLevel(Math.min(1, sum / bins.length / 70));
    };
    void audio.resume();
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
    };
  }, [active, stream]);

  return (
    <span className="meter" aria-hidden="true">
      <span style={{ transform: `scaleX(${active ? 0.08 + level * 0.92 : 0.08})` }} />
    </span>
  );
}

function sharedAudio() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const root = window as Window & { __enroqueAudio?: AudioContext };
  if (!root.__enroqueAudio || root.__enroqueAudio.state === "closed") root.__enroqueAudio = new Ctx();
  return root.__enroqueAudio;
}

export function VoicePanel({
  link,
  localStream,
  remoteStream,
  micError,
  muted,
  onToggleMute,
  onEnable,
  onReconnect,
}: {
  link: LinkStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micError: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onEnable: () => void | Promise<boolean | void>;
  onReconnect: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [deafened, setDeafened] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [ask, setAsk] = useState<null | "ready" | "blocked">(null);
  const [busy, setBusy] = useState(false);
  const allowRef = useRef<HTMLButtonElement>(null);
  const voiceOn = !!remoteStream && remoteStream.getAudioTracks().length > 0;

  const unlock = () => {
    const ctx = sharedAudio();
    setUnlocked(true);
    if (ctx) void ctx.resume();
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = false;
    void audio.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!remoteStream || deafened) {
      audio.srcObject = null;
      return;
    }
    audio.srcObject = remoteStream;
    audio.muted = false;
    audio.volume = 1;
    void audio.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
  }, [deafened, remoteStream]);

  useEffect(() => {
    if (!ask) return;
    allowRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setAsk(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, busy]);

  useEffect(() => {
    if (localStream) setAsk(null);
  }, [localStream]);

  async function openAsk() {
    try {
      const perm = await navigator.permissions?.query({ name: "microphone" as PermissionName });
      setAsk(perm?.state === "denied" ? "blocked" : "ready");
    } catch {
      setAsk("ready");
    }
  }

  async function allowMic() {
    unlock();
    setBusy(true);
    const ok = await onEnable();
    setBusy(false);
    if (ok === false) setAsk("blocked");
    else setAsk(null);
  }

  return (
    <section className="card voice">
      <header>
        <h2>Voz</h2>
        <span className={voiceOn && !deafened ? "tag on" : "tag"}>
          {voiceOn ? (deafened ? "En silencio" : "Conectada") : localStream ? "Esperando" : "Apagada"}
        </span>
      </header>
      <audio ref={audioRef} className="voice-out" autoPlay playsInline controls />
      {micError && !ask && <p className="warn">{micError}</p>}
      {!localStream ? (
        <button type="button" className="btn primary" onClick={() => void openAsk()} disabled={link === "connecting"}>
          Activar micrófono
        </button>
      ) : (
        <div className="voice-row">
          <button type="button" className="btn ghost" onClick={onToggleMute} aria-pressed={muted}>
            {muted ? "Volver a hablar" : "Silenciarme"}
          </button>
          <button type="button" className="btn ghost" onClick={() => setDeafened((value) => !value)} aria-pressed={deafened}>
            {deafened ? "Oír al rival" : "Silenciar al rival"}
          </button>
        </div>
      )}
      <Meter stream={localStream} active={!!localStream && !muted} />
      {voiceOn && (needsTap || !unlocked) && (
        <button type="button" className="btn primary" onClick={unlock}>
          Escuchar a tu rival
        </button>
      )}
      {localStream && !voiceOn && link === "live" && (
        <button type="button" className="btn ghost" onClick={onReconnect}>
          Reconectar voz
        </button>
      )}
      <p className="quiet">Activa el micrófono en los dos lados. Con auriculares no se acopla.</p>
      {ask && (
        <div
          className="mic-screen"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setAsk(null);
          }}
        >
          <div className="mic-card" role="dialog" aria-modal="true" aria-labelledby="mic-title">
            <MicMark />
            <p className="kicker">{ask === "blocked" ? "Bloqueado" : "Voz"}</p>
            <h2 id="mic-title">{ask === "blocked" ? "El micrófono está bloqueado" : "Para oírse en la partida"}</h2>
            <p>
              {ask === "blocked"
                ? "En la barra del navegador, abre el candado de este sitio y permite el micrófono. Después vuelve a intentarlo."
                : "Solo se usa mientras juegan y no se graba. Al continuar, el navegador pide permiso una vez: elige Permitir."}
            </p>
            <div className="voice-row">
              <button ref={allowRef} type="button" className="btn primary" onClick={() => void allowMic()} disabled={busy}>
                {busy ? "Esperando…" : ask === "blocked" ? "Reintentar" : "Permitir micrófono"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setAsk(null)} disabled={busy}>
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function MicMark() {
  return (
    <svg className="mic-mark" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="18" y="7" width="12" height="20" rx="6" fill="currentColor" />
      <path d="M13 23a11 11 0 0 0 22 0" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M24 34v6M17 40h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
