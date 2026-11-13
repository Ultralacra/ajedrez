let ctx: AudioContext | null = null;

function context() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockSound() {
  context();
}

function tone(
  audio: AudioContext,
  freq: number,
  duration: number,
  gain: number,
  delay = 0,
  type: OscillatorType = "sine",
) {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(amp);
  amp.connect(audio.destination);
  const start = audio.currentTime + delay;
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playMove(san: string) {
  const audio = context();
  if (!audio) return;
  if (san.includes("#")) {
    tone(audio, 523, 0.12, 0.045);
    tone(audio, 659, 0.16, 0.045, 0.09);
    tone(audio, 784, 0.24, 0.05, 0.18);
    return;
  }
  if (san.includes("+")) {
    tone(audio, 640, 0.08, 0.04);
    tone(audio, 860, 0.12, 0.04, 0.08);
    return;
  }
  if (san.includes("x")) {
    tone(audio, 190, 0.09, 0.05, 0, "triangle");
    return;
  }
  tone(audio, 490, 0.06, 0.03);
}

export function playEnd() {
  const audio = context();
  if (!audio) return;
  tone(audio, 392, 0.12, 0.04);
  tone(audio, 311, 0.18, 0.045, 0.12);
  tone(audio, 233, 0.28, 0.05, 0.24);
}
