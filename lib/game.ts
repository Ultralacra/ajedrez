import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

export type { Color, PieceSymbol, Square };
export type Promo = "q" | "r" | "b" | "n";
export type GameStatus = "playing" | "mate" | "stalemate" | "draw" | "resign" | "timeout";

export type HistMove = {
  san: string;
  from: Square;
  to: Square;
  color: Color;
  promotion?: Promo;
};

export type GameState = {
  fen: string;
  whiteMs: number | null;
  blackMs: number | null;
  initialMs: number | null;
  clockOn: boolean;
  status: GameStatus;
  winner: Color | null;
  reason: string;
  history: HistMove[];
  drawOffer: Color | null;
  rematchFrom: Color | null;
  whiteName: string;
  blackName: string;
};

const PIECE_RANK: Record<PieceSymbol, number> = { q: 0, r: 1, b: 2, n: 3, p: 4, k: 5 };

export function cleanName(name: string, fallback = "Jugador") {
  const clean = name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 18);
  return clean || fallback;
}

export function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

export function createGame(opts: {
  minutes: number | null;
  whiteName: string;
  blackName: string;
}): GameState {
  const ms = opts.minutes == null ? null : Math.round(opts.minutes * 60_000);
  return {
    fen: new Chess().fen(),
    whiteMs: ms,
    blackMs: ms,
    initialMs: ms,
    clockOn: false,
    status: "playing",
    winner: null,
    reason: "",
    history: [],
    drawOffer: null,
    rematchFrom: null,
    whiteName: cleanName(opts.whiteName, "Blancas"),
    blackName: cleanName(opts.blackName, "Negras"),
  };
}

export function rematch(state: GameState): GameState {
  return {
    ...createGame({
      minutes: null,
      whiteName: state.whiteName,
      blackName: state.blackName,
    }),
    initialMs: state.initialMs,
    whiteMs: state.initialMs,
    blackMs: state.initialMs,
  };
}

export function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

export function asPromo(value: unknown): Promo | undefined {
  return value === "q" || value === "r" || value === "b" || value === "n" ? value : undefined;
}

export function readBoard(fen: string) {
  const chess = new Chess(fen);
  const map: Partial<Record<Square, { type: PieceSymbol; color: Color }>> = {};
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece) map[piece.square] = { type: piece.type, color: piece.color };
    }
  }
  return map;
}

export function targetsFrom(fen: string, square: string) {
  if (!isSquare(square)) return [];
  const chess = new Chess(fen);
  return [...new Set(chess.moves({ square, verbose: true }).map((move) => move.to))];
}

export function needsPromotion(fen: string, from: string, to: string) {
  if (!isSquare(from) || !isSquare(to)) return false;
  const piece = new Chess(fen).get(from);
  return piece?.type === "p" && (to[1] === "8" || to[1] === "1");
}

export function kingInCheck(fen: string): Square | null {
  const chess = new Chess(fen);
  if (!chess.isCheck()) return null;
  const turn = chess.turn();
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece?.type === "k" && piece.color === turn) return piece.square;
    }
  }
  return null;
}

export function turnOf(fen: string): Color {
  return new Chess(fen).turn();
}

export function withElapsed(state: GameState, elapsedMs: number): GameState {
  if (!state.clockOn || state.whiteMs == null || state.blackMs == null || state.status !== "playing") {
    return state;
  }
  const elapsed = Math.max(0, elapsedMs);
  const turn = new Chess(state.fen).turn();
  if (turn === "w") return { ...state, whiteMs: Math.max(0, state.whiteMs - elapsed) };
  return { ...state, blackMs: Math.max(0, state.blackMs - elapsed) };
}

export function pause(state: GameState, elapsedMs: number): GameState {
  if (!state.clockOn) return state;
  return { ...withElapsed(state, elapsedMs), clockOn: false };
}

export function resume(state: GameState): GameState {
  if (state.status !== "playing" || state.initialMs == null || state.history.length === 0) {
    return { ...state, clockOn: false };
  }
  return { ...state, clockOn: true };
}

function matingMaterial(chess: Chess, color: Color) {
  const types: string[] = [];
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.color === color && piece.type !== "k") types.push(piece.type);
    }
  }
  types.sort();
  const sig = types.join("");
  return sig !== "" && sig !== "n" && sig !== "b" && sig !== "nn";
}

export function applyFlag(state: GameState, flagged: Color): GameState {
  if (state.status !== "playing") return state;
  const chess = new Chess(state.fen);
  const winner = opposite(flagged);
  const base: GameState = {
    ...state,
    whiteMs: state.whiteMs == null ? null : flagged === "w" ? 0 : state.whiteMs,
    blackMs: state.blackMs == null ? null : flagged === "b" ? 0 : state.blackMs,
    clockOn: false,
    drawOffer: null,
  };
  if (!matingMaterial(chess, winner)) {
    return { ...base, status: "draw", winner: null, reason: "Tiempo agotado, sin material de mate" };
  }
  return { ...base, status: "timeout", winner, reason: "Tiempo agotado" };
}

export function applyMove(
  state: GameState,
  from: string,
  to: string,
  promotion: Promo | undefined,
  elapsedMs: number,
): { ok: true; state: GameState } | { ok: false } {
  if (state.status !== "playing" || !isSquare(from) || !isSquare(to)) return { ok: false };
  const timed = withElapsed(state, state.clockOn ? elapsedMs : 0);
  const chess = new Chess(timed.fen);
  const mover = chess.turn();
  const promo = needsPromotion(timed.fen, from, to) ? (promotion ?? "q") : undefined;
  let move;
  try {
    move = chess.move(promo ? { from, to, promotion: promo } : { from, to });
  } catch {
    return { ok: false };
  }

  let status: GameStatus = "playing";
  let winner: Color | null = null;
  let reason = "";
  if (chess.isCheckmate()) {
    status = "mate";
    winner = mover;
    reason = "Jaque mate";
  } else if (chess.isStalemate()) {
    status = "stalemate";
    reason = "Ahogado";
  } else if (chess.isThreefoldRepetition()) {
    status = "draw";
    reason = "Triple repetición";
  } else if (chess.isInsufficientMaterial()) {
    status = "draw";
    reason = "Material insuficiente";
  } else if (chess.isDrawByFiftyMoves()) {
    status = "draw";
    reason = "Regla de los 50 movimientos";
  } else if (chess.isDraw()) {
    status = "draw";
    reason = "Tablas";
  }

  const played: GameState = {
    ...timed,
    fen: chess.fen(),
    status,
    winner,
    reason,
    drawOffer: null,
    clockOn: status === "playing" && timed.whiteMs != null,
    history: [
      ...state.history,
      {
        san: move.san,
        from: move.from,
        to: move.to,
        color: move.color,
        promotion: asPromo(move.promotion),
      },
    ],
  };

  if (status === "playing" && timed.whiteMs != null) {
    const left = mover === "w" ? played.whiteMs : played.blackMs;
    if (left != null && left <= 0) return { ok: true, state: applyFlag(played, mover) };
  }
  if (status !== "playing") played.clockOn = false;
  return { ok: true, state: played };
}

export function resign(state: GameState, color: Color): GameState {
  if (state.status !== "playing") return state;
  return {
    ...state,
    status: "resign",
    winner: opposite(color),
    reason: "Abandono",
    clockOn: false,
    drawOffer: null,
  };
}

export function offerDraw(state: GameState, color: Color): GameState {
  if (state.status !== "playing") return state;
  if (state.drawOffer && state.drawOffer !== color) {
    return {
      ...state,
      status: "draw",
      winner: null,
      reason: "Tablas por acuerdo",
      clockOn: false,
      drawOffer: null,
    };
  }
  if (state.drawOffer === color) return state;
  return { ...state, drawOffer: color };
}

export function declineDraw(state: GameState): GameState {
  if (!state.drawOffer || state.status !== "playing") return state;
  return { ...state, drawOffer: null };
}

export function offerRematch(state: GameState, color: Color): GameState {
  if (state.status === "playing") return state;
  if (state.rematchFrom && state.rematchFrom !== color) return rematch(state);
  return { ...state, rematchFrom: color };
}

export function rename(state: GameState, color: Color, name: string): GameState {
  const clean = cleanName(name, "Rival");
  return color === "w" ? { ...state, whiteName: clean } : { ...state, blackName: clean };
}

export function sanToEs(san: string) {
  const map: Record<string, string> = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
  return san.replace(/[KQRBN]/g, (char) => map[char] ?? char);
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function captures(history: HistMove[]) {
  const chess = new Chess();
  const taken: Record<Color, PieceSymbol[]> = { w: [], b: [] };
  for (const step of history) {
    try {
      const move = chess.move(
        step.promotion ? { from: step.from, to: step.to, promotion: step.promotion } : { from: step.from, to: step.to },
      );
      if (move.captured) taken[move.color].push(move.captured);
    } catch {
      break;
    }
  }
  for (const color of ["w", "b"] as const) {
    taken[color].sort((a, b) => PIECE_RANK[a] - PIECE_RANK[b]);
  }
  return taken;
}

export function resultCopy(state: GameState, myColor: Color | "both") {
  if (state.status === "playing") return null;
  if (!state.winner) return { title: "Tablas", reason: state.reason || "La partida terminó en tablas." };
  if (myColor === "both") {
    return {
      title: state.winner === "w" ? "Ganan las blancas" : "Ganan las negras",
      reason: state.reason,
    };
  }
  return {
    title: state.winner === myColor ? "Ganaste" : "Perdiste",
    reason: state.reason,
  };
}

export function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const state = value as GameState;
  return typeof state.fen === "string" && Array.isArray(state.history) && typeof state.status === "string";
}
