"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Color, Square } from "chess.js";
import { ChessPiece } from "@/components/pieces";
import {
  kingInCheck,
  needsPromotion,
  readBoard,
  targetsFrom,
  turnOf,
  type Promo,
} from "@/lib/game";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

const PIECE_NAME: Record<string, string> = {
  k: "rey",
  q: "dama",
  r: "torre",
  b: "alfil",
  n: "caballo",
  p: "peón",
};

function squaresFor(orientation: Color): Square[] {
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const squares: Square[] = [];
  for (const rank of ranks) {
    for (const file of files) squares.push(`${file}${rank}` as Square);
  }
  return squares;
}

function isDark(square: string) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return (file + rank) % 2 === 1;
}

function axis(orientation: Color) {
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  return { files, ranks };
}

function placement(square: string, orientation: Color) {
  const { files, ranks } = axis(orientation);
  return {
    x: files.indexOf(square[0] as (typeof FILES)[number]),
    y: ranks.indexOf(Number(square[1])),
  };
}

function squareDelta(from: string, to: string, orientation: Color) {
  const start = placement(from, orientation);
  const end = placement(to, orientation);
  return { dx: (start.x - end.x) * 100, dy: (start.y - end.y) * 100 };
}

function castleRook(from: string, to: string): { from: Square; to: Square } | null {
  if (from[1] !== to[1]) return null;
  const delta = to.charCodeAt(0) - from.charCodeAt(0);
  if (Math.abs(delta) !== 2) return null;
  const rank = from[1];
  if (delta === 2) return { from: `h${rank}` as Square, to: `f${rank}` as Square };
  return { from: `a${rank}` as Square, to: `d${rank}` as Square };
}

export function ChessBoard({
  fen,
  orientation,
  canMove,
  lastMove,
  onMove,
}: {
  fen: string;
  orientation: Color;
  canMove: boolean;
  lastMove: { from: string; to: string } | null;
  onMove: (from: string, to: string, promotion?: Promo) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ from: Square; x: number; y: number; moved: boolean; wasSelected: boolean } | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [dragFrom, setDragFrom] = useState<Square | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [armed, setArmed] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [squarePx, setSquarePx] = useState(56);
  const [gliding, setGliding] = useState<Record<string, { dx: number; dy: number }>>({});
  const seenFen = useRef(fen);
  const pieces = useMemo(() => readBoard(fen), [fen]);
  const squares = useMemo(() => squaresFor(orientation), [orientation]);
  const turn = useMemo(() => turnOf(fen), [fen]);
  const checkSquare = useMemo(() => kingInCheck(fen), [fen]);
  const focus = dragFrom ?? selected ?? (canMove ? armed : null);
  const targets = useMemo(() => (focus ? targetsFrom(fen, focus) : []), [fen, focus]);
  const preview = !selected && !dragFrom;
  const onMoveRef = useRef(onMove);
  const fenRef = useRef(fen);
  const orientationRef = useRef(orientation);
  const canMoveRef = useRef(canMove);
  const selectedRef = useRef(selected);
  onMoveRef.current = onMove;
  fenRef.current = fen;
  orientationRef.current = orientation;
  canMoveRef.current = canMove;
  selectedRef.current = selected;

  useEffect(() => {
    setSelected(null);
    setPromo(null);
    setDragFrom(null);
    setArmed(null);
  }, [fen, orientation]);

  useEffect(() => {
    if (seenFen.current === fen) return;
    seenFen.current = fen;
    if (!lastMove) return;
    const moves = [{ from: lastMove.from, to: lastMove.to }];
    const rook = castleRook(lastMove.from, lastMove.to);
    if (rook) moves.push(rook);
    const next: Record<string, { dx: number; dy: number }> = {};
    for (const move of moves) next[move.to] = squareDelta(move.from, move.to, orientation);
    setGliding(next);
    const timer = window.setTimeout(() => setGliding({}), 230);
    return () => window.clearTimeout(timer);
  }, [fen, lastMove, orientation]);

  useEffect(() => {
    document.documentElement.classList.toggle("dragging-piece", !!dragFrom);
    return () => document.documentElement.classList.remove("dragging-piece");
  }, [dragFrom]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setSquarePx(el.getBoundingClientRect().width / 8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function squareAt(clientX: number, clientY: number) {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const file = Math.min(7, Math.floor((x / rect.width) * 8));
    const rank = Math.min(7, Math.floor((y / rect.height) * 8));
    return squaresFor(orientationRef.current)[rank * 8 + file] ?? null;
  }

  function tryMove(from: Square, to: string) {
    if (!targetsFrom(fenRef.current, from).includes(to as Square)) {
      setSelected(from);
      return;
    }
    if (needsPromotion(fenRef.current, from, to)) {
      setPromo({ from, to: to as Square });
      setSelected(null);
      return;
    }
    onMoveRef.current(from, to);
    setSelected(null);
  }

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 10) {
        drag.moved = true;
        setDragFrom(drag.from);
      }
      if (drag.moved) {
        setGhost({ x: event.clientX, y: event.clientY });
        setHover(squareAt(event.clientX, event.clientY));
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      setGhost(null);
      setHover(null);
      setDragFrom(null);
      const target = squareAt(event.clientX, event.clientY);
      if (!drag.moved || !target || target === drag.from) {
        setSelected(drag.wasSelected && !drag.moved ? null : drag.from);
        return;
      }
      tryMove(drag.from, target);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  const bottomRank = orientation === "w" ? "1" : "8";
  const leftFile = orientation === "w" ? "a" : "h";
  const draggingPiece = dragFrom ? pieces[dragFrom] : null;

  return (
    <div className={canMove ? "board-frame your-turn" : "board-frame"}>
      <div className="board-stage">
      <div
        className="board"
        ref={boardRef}
        onContextMenu={(event) => {
          event.preventDefault();
          setSelected(null);
        }}
        style={{ touchAction: "none" }}
      >
        {squares.map((square) => {
          const piece = pieces[square];
          const dark = isDark(square);
          const isLast = lastMove?.from === square || lastMove?.to === square;
          const isTarget = targets.includes(square);
          const mine = !!piece && piece.color === turn && canMove;
          return (
            <button
              key={square}
              type="button"
              className={[
                "sq",
                dark ? "dark" : "light",
                mine ? "hot" : "",
                selected === square ? "selected" : "",
                dragFrom === square ? "origin" : "",
                isLast ? "last" : "",
                checkSquare === square ? "check" : "",
                isTarget && piece ? (preview ? "aim-take soft" : "aim-take") : "",
                hover === square && isTarget ? "over" : "",
                isTarget && !piece ? "aim" : "",
              ].filter(Boolean).join(" ")}
              aria-label={
                piece
                  ? `${square}, ${PIECE_NAME[piece.type]} ${piece.color === "w" ? "blanco" : "negro"}`
                  : `casilla ${square}`
              }
              aria-pressed={selected === square}
              onPointerEnter={() => {
                if (mine) setArmed(square);
              }}
              onPointerLeave={() => {
                setArmed((current) => (current === square ? null : current));
              }}
              onClick={(event) => {
                if (event.detail !== 0 || !canMoveRef.current) return;
                if (mine) {
                  setSelected((current) => (current === square ? null : square));
                  return;
                }
                if (selectedRef.current && targetsFrom(fenRef.current, selectedRef.current).includes(square)) {
                  tryMove(selectedRef.current, square);
                }
              }}
              onPointerDown={(event) => {
                if (event.button !== 0 || !canMove) return;
                if (mine) {
                  dragRef.current = {
                    from: square,
                    x: event.clientX,
                    y: event.clientY,
                    moved: false,
                    wasSelected: selectedRef.current === square,
                  };
                  setSelected(square);
                  return;
                }
                if (selectedRef.current && targetsFrom(fen, selectedRef.current).includes(square)) {
                  tryMove(selectedRef.current, square);
                } else {
                  setSelected(null);
                }
              }}
            >
              {square[1] === bottomRank && <span className={dark ? "coord on-dark file" : "coord on-light file"}>{square[0]}</span>}
              {square[0] === leftFile && <span className={dark ? "coord on-dark rank" : "coord on-light rank"}>{square[1]}</span>}
              {isTarget && !piece && <span className={preview ? "hint soft" : "hint"} />}
            </button>
          );
        })}
      </div>
      <div className="piece-layer" aria-hidden="true">
        {squares.map((square) => {
          const piece = pieces[square];
          if (!piece || dragFrom === square) return null;
          const place = placement(square, orientation);
          const glide = gliding[square];
          const lifted = canMove && piece.color === turn && (armed === square || selected === square) && !glide;
          return (
            <div
              key={square}
              className={["piece-float", lifted ? "up" : "", glide ? "glide" : ""].filter(Boolean).join(" ")}
              style={{
                left: `${place.x * 12.5}%`,
                top: `${place.y * 12.5}%`,
                ["--dx" as string]: glide ? `${glide.dx}%` : undefined,
                ["--dy" as string]: glide ? `${glide.dy}%` : undefined,
              }}
            >
              <ChessPiece color={piece.color} type={piece.type} />
            </div>
          );
        })}
      </div>
      </div>
      {promo && (
        <div className="promo" role="dialog" aria-label="Elige la pieza de coronación">
          <p>¿En qué se convierte?</p>
          <div>
            {(["q", "r", "b", "n"] as const).map((type) => (
              <button
                key={type}
                type="button"
                className="promo-piece"
                onClick={() => {
                  onMove(promo.from, promo.to, type);
                  setPromo(null);
                }}
                aria-label={PIECE_NAME[type]}
              >
                <ChessPiece color={turn} type={type} />
              </button>
            ))}
          </div>
          <button type="button" className="texty" onClick={() => setPromo(null)}>
            Cancelar
          </button>
        </div>
      )}
      {draggingPiece && ghost && (
        <div
          className="drag-piece"
          style={{
            width: squarePx,
            height: squarePx,
            left: ghost.x - squarePx / 2,
            top: ghost.y - squarePx / 2,
          }}
        >
          <ChessPiece color={draggingPiece.color} type={draggingPiece.type} />
        </div>
      )}
    </div>
  );
}
