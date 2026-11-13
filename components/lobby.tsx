"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChessBoard } from "@/components/chess-board";
import { cleanName, type Color } from "@/lib/game";
import { NAME_KEY, formatCode, makeCode, normalizeCode, roleKey, writeSetup } from "@/lib/local";

const HERO_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

export function Lobby() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState<number | null>(10);
  const [color, setColor] = useState<Color | "random">("w");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) setName(saved);
  }, []);

  function create(event: FormEvent) {
    event.preventDefault();
    const room = makeCode();
    const chosen: Color = color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color;
    const clean = cleanName(name, "Anfitrión");
    localStorage.setItem(NAME_KEY, clean);
    sessionStorage.setItem(roleKey(room), "host");
    writeSetup(room, { name: clean, minutes, color: chosen });
    router.push(`/sala/${room}`);
  }

  function join(event: FormEvent) {
    event.preventDefault();
    const room = normalizeCode(code);
    if (room.length !== 6) {
      setError("El código tiene 6 caracteres.");
      return;
    }
    const clean = cleanName(name, "Rival");
    localStorage.setItem(NAME_KEY, clean);
    router.push(`/sala/${room}`);
  }

  return (
    <main className="shell lobby">
      <div className="lobby-copy">
        <p className="kicker">Ajedrez en vivo</p>
        <h1>Dos personas. Un tablero. La voz abierta.</h1>
        <p className="lede">
          Crea una sala, comparte el enlace y juega al momento. Las jugadas viajan al instante y pueden hablarse por el micrófono.
        </p>
        <form className="form-card" onSubmit={create}>
          <label>
            Tu nombre
            <input
              value={name}
              maxLength={18}
              placeholder="Cómo te verá tu rival"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <fieldset>
            <legend>Reloj</legend>
            <div className="seg">
              {[
                [5, "5 min"],
                [10, "10 min"],
                [15, "15 min"],
                [null, "Sin reloj"],
              ].map(([value, label]) => (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={minutes === value}
                  onClick={() => setMinutes(value as number | null)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Tu color</legend>
            <div className="seg">
              {(
                [
                  ["w", "Blancas"],
                  ["b", "Negras"],
                  ["random", "Al azar"],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={color === value} onClick={() => setColor(value)}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="btn primary">
            Crear sala
          </button>
          <p className="quiet">El reloj empieza en la primera jugada. Quien crea la sala tiene que dejar esta pestaña abierta.</p>
        </form>

        <form className="form-card join" onSubmit={join}>
          <label>
            ¿Te pasaron un código?
            <input
              value={formatCode(code)}
              placeholder="AB3-K9Q"
              onChange={(event) => {
                setCode(normalizeCode(event.target.value));
                setError("");
              }}
              aria-label="Código de la sala"
              autoCapitalize="characters"
            />
          </label>
          {error && <p className="warn">{error}</p>}
          <button type="submit" className="btn ghost">
            Entrar a la sala
          </button>
        </form>
        <p className="quiet">
          <Link href="/practicar">Practicar en este tablero</Link>, sin rival y sin micrófono.
        </p>
      </div>
      <div className="hero">
        <ChessBoard fen={HERO_FEN} orientation="w" canMove={false} lastMove={{ from: "f1", to: "c4" }} onMove={() => {}} />
        <p className="quiet">Partida italiana. El tablero de verdad se mueve en cuanto entra la otra persona.</p>
      </div>
    </main>
  );
}
