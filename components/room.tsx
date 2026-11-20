"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { GameView, type ChatLine } from "@/components/game-view";
import { useClockDisplay, useFlagWatch } from "@/components/use-clock";
import { useMailbox } from "@/components/use-mailbox";
import { usePeerRoom, type LinkStatus } from "@/components/use-peer";
import {
  applyFlag,
  applyMove,
  cleanName,
  createGame,
  declineDraw,
  isGameState,
  offerDraw,
  offerRematch,
  pause,
  rename,
  resign,
  resume,
  turnOf,
  withElapsed,
  type Color,
  type GameState,
  type Promo,
} from "@/lib/game";
import { NAME_KEY, SOUND_KEY, colorKey, formatCode, readGame, readSetup, roleKey, seatKey, setupKey, writeGame, writeSetup } from "@/lib/local";

export function Room({ code }: { code: string }) {
  if (code.length !== 6) return <InvalidCode />;
  return <LiveRoom code={code} />;
}

const EMPTY_GAME = createGame({ minutes: null, whiteName: "Blancas", blackName: "Negras" });

function InvalidCode() {
  return (
    <main className="shell gate">
      <p className="kicker">Sala</p>
      <h1>Ese código no vale.</h1>
      <p className="quiet">Tiene que tener 6 letras o números.</p>
      <Link href="/" className="btn primary">
        Volver al inicio
      </Link>
    </main>
  );
}

function LiveRoom({ code }: { code: string }) {
  const [role, setRole] = useState<"pending" | "host" | "guest">("pending");
  const [phase, setPhase] = useState<"load" | "gate" | "play">("load");
  const [draftName, setDraftName] = useState("");
  const [state, setState] = useState<GameState | null>(null);
  const [hostColor, setHostColor] = useState<Color>("w");
  const [myColor, setMyColor] = useState<Color>("w");
  const [colorKnown, setColorKnown] = useState(false);
  const [seatGuess, setSeatGuess] = useState<Color>("b");
  const [myName, setMyName] = useState("Rival");
  const [nonce, setNonce] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const anchorRef = useRef(0);
  const [anchor, setAnchor] = useState(0);
  const stateRef = useRef<GameState | null>(null);
  const roleRef = useRef(role);
  const hostColorRef = useRef(hostColor);
  const myColorRef = useRef(myColor);
  const nameRef = useRef(myName);
  const sendRef = useRef<(message: unknown) => void>(() => {});
  const placeCallRef = useRef<() => void>(() => {});
  const onDataRef = useRef<(data: unknown) => void>(() => {});
  const onLinkRef = useRef<(status: LinkStatus) => void>(() => {});
  const seenRef = useRef(new Set<string>());
  const linkMark = useRef("");

  roleRef.current = role;
  hostColorRef.current = hostColor;
  myColorRef.current = myColor;
  nameRef.current = myName;

  const playing = phase === "play" && role !== "pending" && !!state;
  const bus = useMailbox({
    code,
    isHost: role === "host",
    enabled: playing,
    nonce,
    onData: (data) => onDataRef.current(data),
  });
  const peer = usePeerRoom({
    code,
    isHost: role === "host",
    enabled: playing,
    nonce,
    onData: (data) => onDataRef.current(data),
    onLink: () => {},
  });
  const link = combineLink(playing ? bus.status : "connecting", playing ? peer.status : "connecting");
  sendRef.current = (message) => {
    const stamped = stamp(message);
    bus.send(stamped);
    peer.send(stamped);
  };
  placeCallRef.current = peer.placeCall;

  function bump() {
    const now = Date.now();
    anchorRef.current = now;
    setAnchor(now);
  }

  function guestColor(): Color {
    return hostColorRef.current === "w" ? "b" : "w";
  }

  function mySide(): Color {
    return roleRef.current === "host" ? hostColorRef.current : myColorRef.current;
  }

  function publish(next: GameState, anchorMode: "now" | "keep") {
    if (anchorMode === "now") bump();
    stateRef.current = next;
    setState(next);
    if (roleRef.current !== "host") return;
    writeGame(code, next);
    sendRef.current({ type: "state", state: next, guestColor: guestColor() });
  }

  function handleLink(status: LinkStatus) {
    const current = stateRef.current;
    if (!current) return;
    if (status === "live") {
      if (roleRef.current !== "host") {
        sendRef.current({ type: "hello", name: nameRef.current });
        return;
      }
      const wasOn = current.clockOn;
      const next = resume(current);
      publish(next, !wasOn && next.clockOn ? "now" : "keep");
      return;
    }
    if ((status === "waiting" || status === "error") && current.clockOn) {
      const next = pause(current, Date.now() - anchorRef.current);
      bump();
      stateRef.current = next;
      setState(next);
      if (roleRef.current === "host") writeGame(code, next);
    }
  }

  function handleData(data: unknown) {
    if (!data || typeof data !== "object") return;
    const message = data as Record<string, unknown>;
    if (typeof message.mid === "string") {
      if (seenRef.current.has(message.mid)) return;
      seenRef.current.add(message.mid);
      if (seenRef.current.size > 400) {
        const oldest = seenRef.current.values().next().value;
        if (oldest) seenRef.current.delete(oldest);
      }
    }
    if (message.type === "chat" && typeof message.text === "string") {
      const text = message.text.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);
      if (!text) return;
      setChat((lines) =>
        [
          ...lines,
          {
            id: typeof message.id === "string" ? message.id : crypto.randomUUID(),
            name: cleanName(typeof message.name === "string" ? message.name : "", "Rival"),
            text,
            mine: false,
          },
        ].slice(-80),
      );
      return;
    }
    if (message.type === "voice-please") {
      if (roleRef.current !== "host") placeCallRef.current();
      return;
    }
    const current = stateRef.current;
    if (!current) return;

    if (roleRef.current !== "host") {
      if (message.type === "state" && isGameState(message.state)) {
        newStateFromHost(message.state, message.guestColor);
      }
      return;
    }

    if (message.type === "hello" && typeof message.name === "string") {
      const wasOn = current.clockOn;
      const next = resume(rename(current, guestColor(), message.name));
      publish(next, !wasOn && next.clockOn ? "now" : "keep");
      return;
    }
    if (message.type === "move" && typeof message.from === "string" && typeof message.to === "string") {
      const elapsed = current.clockOn ? Date.now() - anchorRef.current : 0;
      const result = applyMove(current, message.from, message.to, promoOf(message.promotion), elapsed);
      if (!result.ok) {
        publish(current, "keep");
        return;
      }
      publish(result.state, "now");
      return;
    }
    if (message.type === "resign") {
      publish(resign(current, guestColor()), "keep");
      return;
    }
    if (message.type === "draw") {
      publish(offerDraw(current, guestColor()), "keep");
      return;
    }
    if (message.type === "decline-draw") {
      publish(declineDraw(current), "keep");
      return;
    }
    if (message.type === "rematch") {
      publish(offerRematch(current, guestColor()), "now");
      return;
    }
    if (message.type === "timeout") {
      const baked = withElapsed(current, current.clockOn ? Date.now() - anchorRef.current : 0);
      const turn = turnOf(baked.fen);
      const left = turn === "w" ? baked.whiteMs : baked.blackMs;
      if (left != null && left > 1500) return;
      publish(applyFlag(baked, turn), "now");
    }
  }

  function newStateFromHost(next: GameState, guest: unknown) {
    try {
      turnOf(next.fen);
    } catch {
      return;
    }
    bump();
    stateRef.current = next;
    setState(next);
    if (guest === "w" || guest === "b") {
      myColorRef.current = guest;
      setMyColor(guest);
      setSeatGuess(guest);
      setColorKnown(true);
      sessionStorage.setItem(colorKey(code), guest);
    }
  }

  onDataRef.current = handleData;
  onLinkRef.current = handleLink;

  useEffect(() => {
    if (!playing) {
      linkMark.current = "";
      return;
    }
    const mark = `${nonce}:${link}`;
    if (linkMark.current === mark) return;
    linkMark.current = mark;
    onLinkRef.current(link);
  }, [link, nonce, playing]);

  useEffect(() => {
    const savedSound = localStorage.getItem(SOUND_KEY);
    if (savedSound === "0") setSoundOn(false);
    const isHost = sessionStorage.getItem(roleKey(code)) === "host";
    if (isHost) {
      const setup = readSetup(code);
      const saved = readGame(code);
      const initial =
        saved ??
        createGame({
          minutes: setup.minutes,
          whiteName: setup.color === "w" ? setup.name : "Rival",
          blackName: setup.color === "b" ? setup.name : "Rival",
        });
      stateRef.current = initial;
      setState(initial);
      setHostColor(setup.color);
      setMyColor(setup.color);
      setMyName(setup.name);
      nameRef.current = setup.name;
      hostColorRef.current = setup.color;
      myColorRef.current = setup.color;
      setColorKnown(true);
      setRole("host");
      setPhase("play");
      return;
    }
    setRole("guest");
    const saved = localStorage.getItem(NAME_KEY) || "";
    if (sessionStorage.getItem(seatKey(code)) === "1" && saved.trim()) {
      sitGuest(saved);
      return;
    }
    setDraftName(saved);
    setPhase("gate");
  }, [code]);

  function sitGuest(raw: string) {
    const name = cleanName(raw, "");
    if (!name) return;
    localStorage.setItem(NAME_KEY, name);
    sessionStorage.setItem(seatKey(code), "1");
    if (sessionStorage.getItem(colorKey(code)) === "w") setSeatGuess("w");
    nameRef.current = name;
    setMyName(name);
    const placeholder = createGame({ minutes: null, whiteName: "Blancas", blackName: "Negras" });
    stateRef.current = placeholder;
    setState(placeholder);
    setRole("guest");
    setPhase("play");
  }

  useEffect(() => {
    const save = () => {
      if (roleRef.current !== "host" || !stateRef.current) return;
      const elapsed = stateRef.current.clockOn ? Date.now() - anchorRef.current : 0;
      writeGame(code, pause(stateRef.current, elapsed));
    };
    window.addEventListener("beforeunload", save);
    return () => window.removeEventListener("beforeunload", save);
  }, [code]);

  const clocks = useClockDisplay(state ?? EMPTY_GAME, anchor);

  useFlagWatch(state, anchorRef, link === "live", (color) => {
    const current = stateRef.current;
    if (!current) return;
    if (roleRef.current === "host") {
      publish(applyFlag(current, color), "now");
      return;
    }
    sendRef.current({ type: "timeout" });
    const next = applyFlag(current, color);
    stateRef.current = next;
    setState(next);
  });

  useEffect(() => {
    if (!playing || role !== "host" || link !== "live") return;
    const id = window.setInterval(() => {
      const current = stateRef.current;
      if (!current || roleRef.current !== "host") return;
      const elapsed = current.clockOn ? Date.now() - anchorRef.current : 0;
      sendRef.current({
        type: "state",
        state: withElapsed(current, elapsed),
        guestColor: hostColorRef.current === "w" ? "b" : "w",
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [link, playing, role]);

  function onMove(from: string, to: string, promotion?: Promo) {
    const current = stateRef.current;
    if (!current) return;
    const elapsed = current.clockOn ? Date.now() - anchorRef.current : 0;
    const result = applyMove(current, from, to, promotion, elapsed);
    if (!result.ok) return;
    if (roleRef.current === "host") {
      publish(result.state, "now");
      return;
    }
    bump();
    stateRef.current = result.state;
    setState(result.state);
    sendRef.current({ type: "move", from, to, promotion });
  }

  function sideAction(next: GameState, message: Record<string, unknown>, anchorMode: "now" | "keep") {
    if (roleRef.current === "host") {
      publish(next, anchorMode);
      return;
    }
    stateRef.current = next;
    setState(next);
    sendRef.current(message);
  }

  function claimHost() {
    const name = cleanName(nameRef.current || localStorage.getItem(NAME_KEY) || "", "Anfitrión");
    sessionStorage.setItem(roleKey(code), "host");
    if (!sessionStorage.getItem(setupKey(code))) {
      writeSetup(code, { name, minutes: 10, color: "w" });
    }
    const setup = readSetup(code);
    const initial = createGame({
      minutes: setup.minutes,
      whiteName: setup.color === "w" ? setup.name : "Rival",
      blackName: setup.color === "b" ? setup.name : "Rival",
    });
    stateRef.current = initial;
    setState(initial);
    setHostColor(setup.color);
    setMyColor(setup.color);
    hostColorRef.current = setup.color;
    myColorRef.current = setup.color;
    setColorKnown(true);
    setRole("host");
    setPhase("play");
    setNonce((value) => value + 1);
  }

  function becomeGuest() {
    sessionStorage.removeItem(roleKey(code));
    setRole("guest");
    setColorKnown(false);
    setNonce((value) => value + 1);
  }

  if (phase === "gate") {
    return (
      <SeatGate
        code={code}
        name={draftName}
        onName={setDraftName}
        onSit={(event) => {
          event.preventDefault();
          sitGuest(draftName);
        }}
      />
    );
  }

  if (phase === "load" || !state) {
    return (
      <main className="shell gate">
        <p className="kicker">Enroque</p>
        <h1>Abriendo la sala…</h1>
      </main>
    );
  }

  const turn = turnOf(state.fen);
  const canMove = state.status === "playing" && link === "live" && colorKnown && myColor === turn;

  return (
    <GameView
      mode="online"
      code={code}
      state={state}
      myColor={colorKnown ? myColor : "both"}
      orientation={colorKnown ? myColor : seatGuess}
      link={link}
      linkError={link === "error" ? bus.error || peer.error : null}
      canInvite={role === "host"}
      clocks={clocks}
      canMove={canMove}
      soundOn={soundOn}
      chat={chat}
      voice={{
        link: link,
        localStream: peer.localStream,
        remoteStream: peer.remoteStream,
        micError: peer.micError,
        blocked: peer.voiceBlocked,
        muted: peer.muted,
        onToggleMute: () => peer.setMuted((value) => !value),
        onEnable: () =>
          peer.enableMic().then((ok) => {
            if (ok && roleRef.current === "host") sendRef.current({ type: "voice-please" });
            return ok;
          }),
        onReconnect: () => {
          if (roleRef.current === "host") sendRef.current({ type: "voice-please" });
          else placeCallRef.current();
        },
      }}
      onMove={onMove}
      onResign={() => sideAction(resign(stateRef.current ?? state, mySide()), { type: "resign" }, "keep")}
      onDraw={() => sideAction(offerDraw(stateRef.current ?? state, mySide()), { type: "draw" }, "keep")}
      onDeclineDraw={() => sideAction(declineDraw(stateRef.current ?? state), { type: "decline-draw" }, "keep")}
      onRematch={() => {
        if (roleRef.current === "host") publish(offerRematch(stateRef.current ?? state, hostColorRef.current), "now");
        else sendRef.current({ type: "rematch" });
      }}
      onRetry={() => setNonce((value) => value + 1)}
      onClaimHost={role === "guest" ? claimHost : undefined}
      onBecomeGuest={role === "host" ? becomeGuest : undefined}
      onToggleSound={() =>
        setSoundOn((value) => {
          const next = !value;
          localStorage.setItem(SOUND_KEY, next ? "1" : "0");
          return next;
        })
      }
      onSendChat={(text) => {
        const clean = text.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);
        if (!clean) return;
        const line = { id: crypto.randomUUID(), name: myName, text: clean, mine: true };
        setChat((lines) => [...lines, line].slice(-80));
        sendRef.current({ type: "chat", id: line.id, name: myName, text: clean });
      }}
    />
  );
}

function SeatGate({
  code,
  name,
  onName,
  onSit,
}: {
  code: string;
  name: string;
  onName: (value: string) => void;
  onSit: (event: FormEvent) => void;
}) {
  return (
    <main className="shell gate">
      <Link href="/" className="brand">
        Enroque
      </Link>
      <p className="kicker">Sala {formatCode(code)}</p>
      <h1>Siéntate a la mesa.</h1>
      <p className="lede">Tu rival ya abrió la sala. Dile cómo te llamas y entras a la partida con ese nombre.</p>
      <form className="form-card" onSubmit={onSit}>
        <label>
          Tu nombre
          <input
            value={name}
            maxLength={18}
            placeholder="Cómo te verá tu rival"
            autoFocus
            autoComplete="nickname"
            onChange={(event) => onName(event.target.value)}
          />
        </label>
        <button type="submit" className="btn primary" disabled={!name.trim()}>
          Sentarme
        </button>
        <p className="quiet">El color y el reloj los eligió quien creó la sala. Tú juegas con el otro color.</p>
      </form>
      <Link href="/" className="btn ghost">
        Volver al inicio
      </Link>
    </main>
  );
}

function promoOf(value: unknown): Promo | undefined {
  return value === "q" || value === "r" || value === "b" || value === "n" ? value : undefined;
}

function stamp(message: unknown) {
  if (!message || typeof message !== "object") return message;
  return { ...(message as Record<string, unknown>), mid: crypto.randomUUID() };
}

function combineLink(bus: LinkStatus, peer: LinkStatus): LinkStatus {
  if (bus === "live" || peer === "live") return "live";
  if (bus === "waiting" || peer === "waiting") return "waiting";
  if (bus === "error" && peer === "error") return "error";
  return "connecting";
}
