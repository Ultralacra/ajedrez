"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import type { PieceSymbol } from "chess.js";
import Link from "next/link";
import { ChessBoard } from "@/components/chess-board";
import { ChessPiece } from "@/components/pieces";
import { VoicePanel } from "@/components/voice-panel";
import type { LinkStatus } from "@/components/use-peer";
import {
  captures,
  formatClock,
  kingInCheck,
  resultCopy,
  sanToEs,
  turnOf,
  type Color,
  type GameState,
  type Promo,
} from "@/lib/game";
import { formatCode } from "@/lib/local";
import { playEnd, playMove, unlockSound } from "@/lib/sound";

export type ChatLine = { id: string; name: string; text: string; mine: boolean };

export function GameView({
  mode,
  code,
  state,
  myColor,
  orientation,
  link,
  linkError,
  clocks,
  canMove,
  soundOn,
  chat,
  voice,
  onMove,
  onResign,
  onDraw,
  onDeclineDraw,
  onRematch,
  onFlip,
  onRetry,
  onClaimHost,
  onBecomeGuest,
  onToggleSound,
  onSendChat,
  canInvite,
}: {
  mode: "online" | "practice";
  code?: string;
  state: GameState;
  myColor: Color | "both";
  orientation: Color;
  link: LinkStatus | "local";
  linkError?: string | null;
  clocks: { w: number | null; b: number | null };
  canMove: boolean;
  soundOn: boolean;
  chat: ChatLine[];
  voice: ComponentProps<typeof VoicePanel> | null;
  onMove: (from: string, to: string, promotion?: Promo) => void;
  onResign: () => void;
  onDraw: () => void;
  onDeclineDraw: () => void;
  onRematch: () => void;
  onFlip?: () => void;
  onRetry?: () => void;
  onClaimHost?: () => void;
  onBecomeGuest?: () => void;
  onToggleSound: () => void;
  onSendChat: (text: string) => void;
  canInvite?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const movesRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(state.history.length);
  const prevStatus = useRef(state.status);
  const turn = turnOf(state.fen);
  const waitingToStart = link === "waiting" && state.history.length === 0 && state.status === "playing";
  const loot = useMemo(() => captures(state.history), [state.history]);
  const result = resultCopy(state, myColor);
  const last = state.history.at(-1) ?? null;
  const waitingRoom = mode === "online" && link === "waiting" && state.history.length === 0 && state.status === "playing";
  const rivalGone = mode === "online" && link === "waiting" && !waitingRoom;

  useEffect(() => {
    if (state.history.length > prevLen.current && soundOn) {
      const san = state.history.at(-1)?.san;
      if (san) playMove(san);
    }
    prevLen.current = state.history.length;
  }, [soundOn, state.history]);

  useEffect(() => {
    if (prevStatus.current === "playing" && state.status !== "playing" && soundOn) {
      const san = state.history.at(-1)?.san ?? "";
      if (!san.includes("#")) playEnd();
    }
    prevStatus.current = state.status;
  }, [soundOn, state.history, state.status]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [chat.length]);

  useEffect(() => {
    movesRef.current?.scrollTo({ top: movesRef.current.scrollHeight });
  }, [state.history.length]);

  async function copyLink() {
    if (!code) return;
    await navigator.clipboard.writeText(`${window.location.origin}/sala/${code}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const rows: { n: number; w?: string; b?: string }[] = [];
  for (let i = 0; i < state.history.length; i += 2) {
    rows.push({
      n: i / 2 + 1,
      w: state.history[i]?.san,
      b: state.history[i + 1]?.san,
    });
  }

  const top: Color = orientation === "w" ? "b" : "w";
  const bottom: Color = orientation === "w" ? "w" : "b";
  const mineTurn = state.status === "playing" && myColor !== "both" && turn === myColor;

  return (
    <main className="shell" onPointerDown={unlockSound}>
      <header className="topbar">
        <Link href="/" className="brand">
          Enroque
        </Link>
        <div className="top-status">
          <span className={`pill ${link}`}>
            {link === "live" && "En vivo"}
            {link === "waiting" && "Esperando"}
            {link === "connecting" && "Conectando"}
            {link === "error" && "Sin conexión"}
            {link === "local" && "Práctica"}
          </span>
          <p className={mineTurn ? "turn-text yours" : "turn-text"}>
            {waitingToStart ? "Cuando entre tu rival" : link === "connecting" ? "Conectando…" : turnText(state, myColor, turn)}
          </p>
        </div>
        <div className="top-actions">
          {code && (
            <button type="button" className="btn ghost code-btn" onClick={() => void copyLink()}>
              {copied ? "Enlace copiado" : formatCode(code)}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onToggleSound} aria-pressed={soundOn}>
            {soundOn ? "Sonido" : "Silencio"}
          </button>
        </div>
      </header>

      <div className="stage">
        <section className="board-col">
          <PlayerBar
            name={top === "w" ? state.whiteName : state.blackName}
            color={top}
            clock={clocks[top]}
            active={state.status === "playing" && turn === top}
            low={!!state.clockOn && turn === top}
            captured={loot[top]}
            mine={myColor === top}
          />
          <ChessBoard fen={state.fen} orientation={orientation} canMove={canMove} lastMove={last} onMove={onMove} />
          <PlayerBar
            name={bottom === "w" ? state.whiteName : state.blackName}
            color={bottom}
            clock={clocks[bottom]}
            active={state.status === "playing" && turn === bottom}
            low={!!state.clockOn && turn === bottom}
            captured={loot[bottom]}
            mine={myColor === bottom}
          />

          {waitingRoom && code && canInvite && (
            <div className="banner">
              <p className="kicker">Sala lista</p>
              <strong>{formatCode(code)}</strong>
              <p>Comparte el enlace. La partida empieza cuando entre tu rival. El reloj arranca con la primera jugada.</p>
              <button type="button" className="btn primary" onClick={() => void copyLink()}>
                {copied ? "Enlace copiado" : "Copiar enlace"}
              </button>
            </div>
          )}
          {waitingRoom && !canInvite && (
            <div className="banner">
              <strong>Entrando a la partida…</strong>
              <p>Si tarda, quien creó la sala tiene que dejar esa página abierta.</p>
            </div>
          )}
          {rivalGone && (
            <div className="banner">
              <strong>Tu rival se desconectó.</strong>
              <p>El reloj queda en pausa. La posición sigue aquí cuando vuelva a entrar.</p>
            </div>
          )}
          {link === "connecting" && mode === "online" && (
            <div className="banner">
              <strong>Conectando la sala…</strong>
            </div>
          )}
          {link === "error" && (
            <div className="banner warn-banner">
              <strong>{linkError || "No se pudo conectar."}</strong>
              <div className="voice-row">
                {onRetry && (
                  <button type="button" className="btn primary" onClick={onRetry}>
                    Reintentar
                  </button>
                )}
                {onClaimHost && (
                  <button type="button" className="btn ghost" onClick={onClaimHost}>
                    Abrir yo la sala
                  </button>
                )}
                {onBecomeGuest && (
                  <button type="button" className="btn ghost" onClick={onBecomeGuest}>
                    Entrar como invitado
                  </button>
                )}
              </div>
            </div>
          )}
          {state.drawOffer && state.status === "playing" && (
            <div className="banner">
              <strong>
                {state.drawOffer === myColor
                  ? "Ofreciste tablas."
                  : `${state.drawOffer === "w" ? state.whiteName : state.blackName} ofrece tablas.`}
              </strong>
              <div className="voice-row">
                {state.drawOffer !== myColor && myColor !== "both" && (
                  <button type="button" className="btn primary" onClick={onDraw}>
                    Aceptar
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={onDeclineDraw}>
                  {state.drawOffer === myColor ? "Retirar oferta" : "Rechazar"}
                </button>
              </div>
            </div>
          )}
          {result && (
            <div className="result">
              <p className="kicker">Resultado</p>
              <strong>{result.title}</strong>
              <p>{result.reason}</p>
              {mode === "online" && state.rematchFrom && state.rematchFrom !== myColor && (
                <p>{state.rematchFrom === "w" ? state.whiteName : state.blackName} quiere la revancha.</p>
              )}
              <button type="button" className="btn primary" onClick={onRematch} disabled={mode === "online" && link !== "live"}>
                {mode === "practice"
                  ? "Nueva partida"
                  : state.rematchFrom && state.rematchFrom !== myColor
                    ? "Aceptar revancha"
                    : state.rematchFrom === myColor
                      ? "Esperando revancha…"
                      : "Revancha"}
              </button>
            </div>
          )}
        </section>

        <aside className="aside">
          {voice && <VoicePanel {...voice} />}
          <section className="card">
            <header>
              <h2>Jugadas</h2>
              {onFlip && (
                <button type="button" className="btn texty" onClick={onFlip}>
                  Girar
                </button>
              )}
            </header>
            <div className="moves" ref={movesRef}>
              {rows.length === 0 && <p className="quiet">Todavía no hay jugadas.</p>}
              {rows.map((row) => (
                <div key={row.n} className={row.n === rows.length ? "move-row latest" : "move-row"}>
                  <span>{row.n}.</span>
                  <span>{row.w ? sanToEs(row.w) : ""}</span>
                  <span>{row.b ? sanToEs(row.b) : ""}</span>
                </div>
              ))}
            </div>
            {mode === "online" && state.status === "playing" && (
              <div className="voice-row actions">
                {confirmResign ? (
                  <>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => {
                        setConfirmResign(false);
                        onResign();
                      }}
                      disabled={link !== "live"}
                    >
                      Confirmar abandono
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setConfirmResign(false)}>
                      Seguir
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn danger" onClick={() => setConfirmResign(true)} disabled={link !== "live"}>
                    Rendirse
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={onDraw} disabled={link !== "live" || state.drawOffer === myColor}>
                  {state.drawOffer && state.drawOffer !== myColor ? "Aceptar tablas" : "Ofrecer tablas"}
                </button>
              </div>
            )}
          </section>
          {mode === "online" && (
            <section className="card">
              <header>
                <h2>Chat</h2>
              </header>
              <div className="chat-log" ref={chatRef}>
                {chat.length === 0 && <p className="quiet">Si el micrófono falla, pueden escribirse aquí.</p>}
                {chat.map((line) => (
                  <p key={line.id} className={line.mine ? "mine" : ""}>
                    <strong>{line.mine ? "Tú" : line.name}</strong> {line.text}
                  </p>
                ))}
              </div>
              <form
                className="chat-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = draft.trim();
                  if (!text || link !== "live") return;
                  onSendChat(text);
                  setDraft("");
                }}
              >
                <input
                  value={draft}
                  maxLength={200}
                  placeholder="Mensaje"
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label="Mensaje"
                />
                <button type="submit" className="btn primary" disabled={link !== "live" || !draft.trim()}>
                  Enviar
                </button>
              </form>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

function turnText(state: GameState, myColor: Color | "both", turn: Color) {
  if (state.status !== "playing") return state.reason || "Partida terminada";
  const prefix = kingInCheck(state.fen) ? "Jaque · " : "";
  if (myColor === "both") return `${prefix}${turn === "w" ? "Juegan las blancas" : "Juegan las negras"}`;
  if (turn === myColor) return `${prefix}Tu turno`;
  const name = turn === "w" ? state.whiteName : state.blackName;
  return `${prefix}Turno de ${name}`;
}

function PlayerBar({
  name,
  color,
  clock,
  active,
  low,
  captured,
  mine,
}: {
  name: string;
  color: Color;
  clock: number | null;
  active: boolean;
  low: boolean;
  captured: PieceSymbol[];
  mine: boolean;
}) {
  const urgent = low && clock != null && clock <= 30_000;
  const critical = low && clock != null && clock <= 10_000;
  return (
    <div className={active ? "player active" : "player"}>
      <span className={`avatar ${color}`} aria-hidden="true">
        {name.trim().charAt(0).toUpperCase() || (color === "w" ? "B" : "N")}
      </span>
      <div className="player-copy">
        <strong>
          {name} {mine && <em>Tú</em>}
        </strong>
        <span className="loot">
          {captured.map((type, index) =>
            type ? <ChessPiece key={`${type}-${index}`} color={color === "w" ? "b" : "w"} type={type} /> : null,
          )}
        </span>
      </div>
      {clock != null && (
        <time className={critical ? "clock critical" : urgent ? "clock low" : "clock"}>{formatClock(clock)}</time>
      )}
    </div>
  );
}
