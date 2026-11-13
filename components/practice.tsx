"use client";

import { useEffect, useRef, useState } from "react";
import { GameView } from "@/components/game-view";
import { useClockDisplay } from "@/components/use-clock";
import { applyMove, createGame, rematch, type Color, type Promo } from "@/lib/game";
import { SOUND_KEY } from "@/lib/local";

export function Practice() {
  const [state, setState] = useState(() =>
    createGame({ minutes: null, whiteName: "Blancas", blackName: "Negras" }),
  );
  const [orientation, setOrientation] = useState<Color>("w");
  const [soundOn, setSoundOn] = useState(true);
  const anchorRef = useRef(0);
  const [anchor, setAnchor] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (localStorage.getItem(SOUND_KEY) === "0") setSoundOn(false);
  }, []);

  const clocks = useClockDisplay(state, anchor);

  return (
    <GameView
      mode="practice"
      state={state}
      myColor="both"
      orientation={orientation}
      link="local"
      clocks={clocks}
      canMove={state.status === "playing"}
      soundOn={soundOn}
      chat={[]}
      voice={null}
      onMove={(from, to, promotion?: Promo) => {
        const elapsed = stateRef.current.clockOn ? Date.now() - anchorRef.current : 0;
        const result = applyMove(stateRef.current, from, to, promotion, elapsed);
        if (!result.ok) return;
        const now = Date.now();
        anchorRef.current = now;
        setAnchor(now);
        setState(result.state);
      }}
      onResign={() => {}}
      onDraw={() => {}}
      onDeclineDraw={() => {}}
      onRematch={() => {
        const now = Date.now();
        anchorRef.current = now;
        setAnchor(now);
        setState(rematch(stateRef.current));
      }}
      onFlip={() => setOrientation((color) => (color === "w" ? "b" : "w"))}
      onToggleSound={() =>
        setSoundOn((value) => {
          const next = !value;
          localStorage.setItem(SOUND_KEY, next ? "1" : "0");
          return next;
        })
      }
      onSendChat={() => {}}
    />
  );
}
