// Audible alert chimes synthesised with WebAudio (no audio assets required).
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.18) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.05);
}

export function playChime(level: string) {
  const ac = audio();
  if (!ac) return;
  if (level === "CRITICAL") {
    // urgent two-tone siren burst
    for (let i = 0; i < 3; i++) {
      tone(ac, 880, i * 0.32, 0.15, "square", 0.08);
      tone(ac, 660, i * 0.32 + 0.16, 0.15, "square", 0.08);
    }
  } else if (level === "HIGH") {
    tone(ac, 740, 0, 0.18, "triangle");
    tone(ac, 988, 0.2, 0.25, "triangle");
  } else {
    tone(ac, 660, 0, 0.25, "sine", 0.12);
  }
}

/** Browsers block audio until a user gesture; call once from a click. */
export function unlockAudio() {
  audio();
}
