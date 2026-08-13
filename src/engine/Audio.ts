// P1-4 Phase 4: chase-state audio cues.
//
// Two cues fire when an enemy enters the chase state:
//   1. **Heartbeat** — a low-frequency oscillator (~60 BPM) whose
//      rate depends on the closest chasing enemy's distance
//      (closer = faster). On enterPatrol, the heartbeat fades
//      out over 0.5s (the enemy's `alertTimer` window).
//   2. **Footsteps** — short lowpass-white-noise bursts every
//      0.6s while the closest enemy is < 8m.
//
// Both are gated by the user's settings (chaseHeartbeat /
// enemyFootsteps). The WebAudio AudioContext is created lazily
// on the first user-initiated event (browser autoplay policy
// requires a user gesture before audio plays); if the user has
// never interacted when an enemy chases, the heartbeat + footsteps
// silently no-op and the next interaction will pick up subsequent
// state changes.

const HEARTBEAT_FREQUENCY = 60; // Hz (the "thump" itself, not BPM)
const HEARTBEAT_NEAR_DISTANCE = 5; // m
const HEARTBEAT_SILENT_DISTANCE = 15; // m and beyond
const HEARTBEAT_FADEOUT_SEC = 0.5;

const FOOTSTEP_DISTANCE_THRESHOLD = 8; // m
const FOOTSTEP_DURATION_SEC = 0.05;
const FOOTSTEP_FREQUENCY = 200; // Hz lowpass cutoff

const HEARTBEAT_GAIN = 0.05; // peak gain on the master gain node

let audioContext: AudioContext | null = null;
let heartbeatIntervalId: number | null = null;
let heartbeatGainNode: GainNode | null = null;
let heartbeatOscillator: OscillatorNode | null = null;
let heartbeatFadingOut = false;
let heartbeatLastThumpMs: number | null = null;

let footstepIntervalId: number | null = null;
let footstepLastPlayMs: number | null = null;

let lastDistance: number | null = null;

// Lazy AudioContext creation. Browser autoplay policy forbids
// `new AudioContext()` outside a user gesture; we capture the
// first interaction (click / keydown) and create the context
// then. Subsequent state changes can play audio immediately.
function ensureAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  if (typeof window === 'undefined') return null;
  // P1-4: AudioContext API exists on all modern browsers; the
  // try/catch guards against older Safari / privacy-mode quirks.
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
    return audioContext;
  } catch (e) {
    // eslint-disable-next-line no-console -- diagnostics for audio init failure
    console.warn('[Audio] AudioContext creation failed; chase audio disabled', e);
    return null;
  }
}

function clearHeartbeatLoop(): void {
  if (heartbeatIntervalId !== null) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  if (heartbeatOscillator) {
    try {
      heartbeatOscillator.stop();
    } catch {
      // already stopped
    }
    heartbeatOscillator = null;
  }
  heartbeatGainNode = null;
  heartbeatFadingOut = false;
  heartbeatLastThumpMs = null;
}

function clearFootstepLoop(): void {
  if (footstepIntervalId !== null) {
    clearInterval(footstepIntervalId);
    footstepIntervalId = null;
  }
  footstepLastPlayMs = null;
}

// Compute heartbeat interval (sec) for a given distance.
// Closer = faster; far / silent at the distance threshold.
function heartbeatIntervalFor(distance: number): number {
  if (distance >= HEARTBEAT_SILENT_DISTANCE) {
    return 2; // caller should treat as silence
  }
  if (distance <= HEARTBEAT_NEAR_DISTANCE) {
    return 1; // 60 BPM
  }
  // Linear interpolate between NEAR (60 BPM, 1s) and FAR (30 BPM, 2s).
  const t = (distance - HEARTBEAT_NEAR_DISTANCE) /
    (HEARTBEAT_SILENT_DISTANCE - HEARTBEAT_NEAR_DISTANCE);
  return 1 + t * (2 - 1);
}

// Schedule one heartbeat "thump" — a short gain envelope on a
// low-frequency oscillator. The oscillator is reused across
// thumps (it's always running while the chase audio is on);
// only the gain envelope changes per beat.
function playHeartbeatThump(whenMs: number): void {
  const ctx = audioContext;
  if (!ctx || !heartbeatGainNode) return;
  const now = ctx.currentTime * 1000;
  const t0 = Math.max(whenMs, now) / 1000;
  const gain = heartbeatGainNode.gain;
  // Quick attack + decay envelope: 0 → HEARTBEAT_GAIN (20ms) → 0 (200ms).
  gain.cancelScheduledValues(t0);
  gain.setValueAtTime(0, t0);
  gain.linearRampToValueAtTime(HEARTBEAT_GAIN, t0 + 0.02);
  gain.linearRampToValueAtTime(0, t0 + 0.22);
}

// P1-4 Phase 4: enemy just entered chase state. Start the
// heartbeat loop and (if the enemy is close) the footstep loop.
// Idempotent: calling while already started is a no-op.
export function onChaseEnter(opts: {
  enabled: boolean;
  distance: number;
}): void {
  const ctx = ensureAudioContext();
  if (!ctx || !opts.enabled) return;
  lastDistance = opts.distance;
  // Start the heartbeat (if not already running).
  if (heartbeatIntervalId === null) {
    heartbeatGainNode = ctx.createGain();
    heartbeatGainNode.gain.value = 0;
    heartbeatGainNode.connect(ctx.destination);
    heartbeatOscillator = ctx.createOscillator();
    heartbeatOscillator.frequency.value = HEARTBEAT_FREQUENCY;
    heartbeatOscillator.type = 'sine';
    heartbeatOscillator.connect(heartbeatGainNode);
    heartbeatOscillator.start();
    // Schedule the first thump immediately.
    playHeartbeatThump(ctx.currentTime * 1000);
    heartbeatLastThumpMs = ctx.currentTime * 1000;
    heartbeatIntervalId = window.setInterval(() => {
      if (!audioContext) return;
      if (lastDistance === null) return;
      if (lastDistance >= HEARTBEAT_SILENT_DISTANCE) {
        // Out of range; silence. Next onChaseUpdate with a
        // closer distance will re-enable the thumps.
        if (heartbeatGainNode) {
          heartbeatGainNode.gain.setValueAtTime(0, audioContext.currentTime);
        }
        return;
      }
      const intervalSec = heartbeatIntervalFor(lastDistance);
      const nextThumpMs = (heartbeatLastThumpMs ?? audioContext.currentTime * 1000) + intervalSec * 1000;
      if (audioContext.currentTime * 1000 >= nextThumpMs) {
        playHeartbeatThump(audioContext.currentTime * 1000);
        heartbeatLastThumpMs = audioContext.currentTime * 1000;
      }
    }, 100); // 100ms poll — cheap and lets us react to distance changes
  }
}

// P1-4 Phase 4: chase is ongoing; the distance to the closest
// chasing enemy may have changed (player moves, enemy moves).
// Update the heartbeat rate + start the footstep loop if the
// enemy is close enough.
export function onChaseUpdate(opts: {
  heartbeatEnabled: boolean;
  footstepsEnabled: boolean;
  distance: number;
}): void {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  lastDistance = opts.distance;
  // Start / restart the footstep loop if close enough.
  if (opts.footstepsEnabled && opts.distance < FOOTSTEP_DISTANCE_THRESHOLD) {
    if (footstepIntervalId === null) {
      playFootstep(ctx);
      footstepLastPlayMs = ctx.currentTime * 1000;
      footstepIntervalId = window.setInterval(() => {
        if (!audioContext) return;
        const nextFootstepMs = (footstepLastPlayMs ?? audioContext.currentTime * 1000) + 600; // 0.6s
        if (audioContext.currentTime * 1000 >= nextFootstepMs) {
          playFootstep(audioContext);
          footstepLastPlayMs = audioContext.currentTime * 1000;
        }
      }, 100); // 100ms poll
    }
  } else if (footstepIntervalId !== null) {
    clearFootstepLoop();
  }
}

// P1-4 Phase 4: enemy exited chase state. Begin a 0.5s fadeout
// on the heartbeat and stop the footstep loop immediately.
export function onChaseExit(): void {
  // Stop the footstep loop first — it's the most transient cue
  // and the player should hear the silence immediately.
  clearFootstepLoop();
  if (!audioContext) {
    clearHeartbeatLoop();
    return;
  }
  if (heartbeatIntervalId === null) return;
  if (heartbeatFadingOut) return; // already fading
  heartbeatFadingOut = true;
  if (heartbeatGainNode) {
    const t0 = audioContext.currentTime;
    heartbeatGainNode.gain.cancelScheduledValues(t0);
    heartbeatGainNode.gain.setValueAtTime(heartbeatGainNode.gain.value, t0);
    heartbeatGainNode.gain.linearRampToValueAtTime(0, t0 + HEARTBEAT_FADEOUT_SEC);
  }
  // After the fadeout, tear down the oscillator + gain node.
  window.setTimeout(() => {
    if (heartbeatFadingOut) {
      clearHeartbeatLoop();
    }
  }, HEARTBEAT_FADEOUT_SEC * 1000 + 50);
}

function playFootstep(ctx: AudioContext): void {
  // White-noise burst lowpass-filtered at 200Hz, gated for
  // 0.05s. Each footstep creates fresh buffer sources (they're
  // one-shot so reusing the source is not safe).
  const now = ctx.currentTime;
  const bufferSize = Math.floor(ctx.sampleRate * FOOTSTEP_DURATION_SEC);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.6;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = FOOTSTEP_FREQUENCY;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.linearRampToValueAtTime(0, now + FOOTSTEP_DURATION_SEC);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + FOOTSTEP_DURATION_SEC);
}

// P1-4 Phase 4: clean teardown. Called on level reset / app
// unmount so we don't leave audio nodes / intervals running.
export function disposeAudio(): void {
  clearHeartbeatLoop();
  clearFootstepLoop();
  lastDistance = null;
  if (audioContext) {
    audioContext.close().catch(() => {
      // already closed
    });
    audioContext = null;
  }
}

// Test-only escape hatch. Resets all module-level state so
// successive tests in a shared module don't bleed into each
// other (e.g. one test starting a heartbeat that the next test
// would have to clean up).
export function __resetAudioForTests(): void {
  clearHeartbeatLoop();
  clearFootstepLoop();
  lastDistance = null;
  if (audioContext) {
    audioContext.close().catch(() => {
      // already closed
    });
    audioContext = null;
  }
}
