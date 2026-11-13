import { Chess, type Color } from "chess.js";
import type { GameState } from "@/lib/game";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const NAME_KEY = "enroque-name";
export const SOUND_KEY = "enroque-sound";

export function roleKey(code: string) {
  return `enroque-role:${code}`;
}

export function seatKey(code: string) {
  return `enroque-seat:${code}`;
}

export function setupKey(code: string) {
  return `enroque-setup:${code}`;
}

export function gameKey(code: string) {
  return `enroque-game:${code}`;
}

export function makeCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function normalizeCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function formatCode(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

export type Setup = {
  name: string;
  minutes: number | null;
  color: Color;
};

export function readSetup(code: string): Setup {
  try {
    const raw = sessionStorage.getItem(setupKey(code));
    if (!raw) return { name: "Anfitrión", minutes: 10, color: "w" };
    const data = JSON.parse(raw) as Partial<Setup>;
    const minutes =
      data.minutes === null
        ? null
        : data.minutes === 5 || data.minutes === 10 || data.minutes === 15
          ? data.minutes
          : 10;
    return {
      name: typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 18) : "Anfitrión",
      minutes,
      color: data.color === "b" ? "b" : "w",
    };
  } catch {
    return { name: "Anfitrión", minutes: 10, color: "w" };
  }
}

export function writeSetup(code: string, setup: Setup) {
  sessionStorage.setItem(setupKey(code), JSON.stringify(setup));
}

export function readGame(code: string): GameState | null {
  try {
    const raw = sessionStorage.getItem(gameKey(code));
    if (!raw) return null;
    const data = JSON.parse(raw) as GameState;
    if (!data || typeof data.fen !== "string" || !Array.isArray(data.history)) return null;
    new Chess(data.fen);
    return { ...data, clockOn: false };
  } catch {
    return null;
  }
}

export function writeGame(code: string, state: GameState) {
  sessionStorage.setItem(gameKey(code), JSON.stringify(state));
}
