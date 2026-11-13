"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Chess } from "chess.js";
import type { Color, GameState } from "@/lib/game";

export function useClockDisplay(state: GameState, anchor: number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!state.clockOn || state.status !== "playing") return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [state.clockOn, state.status, state.fen, anchor]);

  const turn = new Chess(state.fen).turn();
  const show = (color: Color, ms: number | null) => {
    if (ms == null) return null;
    if (!state.clockOn || state.status !== "playing" || turn !== color || now === 0 || anchor === 0) return ms;
    return Math.max(0, ms - (now - anchor));
  };
  return { w: show("w", state.whiteMs), b: show("b", state.blackMs) };
}

export function useFlagWatch(
  state: GameState | null,
  anchorRef: RefObject<number>,
  enabled: boolean,
  onFlag: (color: Color) => void,
) {
  const onFlagRef = useRef(onFlag);
  onFlagRef.current = onFlag;
  useEffect(() => {
    if (!enabled || !state || state.status !== "playing" || !state.clockOn || state.whiteMs == null) return;
    let fired = false;
    const id = window.setInterval(() => {
      if (fired || state.whiteMs == null || state.blackMs == null) return;
      const turn = new Chess(state.fen).turn();
      const base = turn === "w" ? state.whiteMs : state.blackMs;
      if (base - (Date.now() - anchorRef.current) <= 0) {
        fired = true;
        onFlagRef.current(turn);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [anchorRef, enabled, state]);
}
