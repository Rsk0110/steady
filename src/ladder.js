// Steady — ladder-safety maths. Pure functions, unit-tested, no DOM.

export const DEG = 180 / Math.PI;

/** The 4-to-1 rule: one unit out for every four up → atan(4) ≈ 75.96°. */
export const IDEAL_ANGLE = Math.atan(4) * DEG;
export const SAFE_MIN = 73; // below this the feet can slide out
export const SAFE_MAX = 78.5; // above this the ladder can tip backwards
export const WARN_MIN = 68;
export const WARN_MAX = 83;

/**
 * Angle of the ladder rail above horizontal, from a gravity vector measured in
 * the phone's frame, with the phone's long edge (y axis) laid along the rail.
 * Works whichever way the screen faces and with any twist about the rail.
 */
export const railAngle = ({ x, y, z }) => {
  const g = Math.hypot(x, y, z);
  if (!g) return NaN;
  return Math.asin(Math.min(1, Math.abs(y) / g)) * DEG;
};

/** Side-to-side lean of the phone's short edge (x axis) — used to check a step ladder or the ground is level. */
export const sideLean = ({ x, y, z }) => {
  const g = Math.hypot(x, y, z);
  if (!g) return NaN;
  return Math.asin(Math.max(-1, Math.min(1, x / g))) * DEG;
};

/** @returns {'too-shallow'|'shallow'|'safe'|'steep'|'too-steep'|'invalid'} */
export const classifyAngle = (deg) => {
  if (!Number.isFinite(deg) || deg < 20) return 'invalid';
  if (deg < WARN_MIN) return 'too-shallow';
  if (deg < SAFE_MIN) return 'shallow';
  if (deg <= SAFE_MAX) return 'safe';
  if (deg <= WARN_MAX) return 'steep';
  return 'too-steep';
};

export const ANGLE_TEXT = {
  invalid: { title: 'Lay the phone along the rail', tip: 'Hold its long edge flat against one side rail of the ladder.' },
  'too-shallow': { title: 'Too shallow — feet may slide out', tip: 'Move the base of the ladder closer to the wall.' },
  shallow: { title: 'A little shallow', tip: 'Bring the feet slightly closer to the wall.' },
  safe: { title: 'Safe angle', tip: 'Good: about 1 out for every 4 up.' },
  steep: { title: 'A little steep', tip: 'Move the feet slightly further from the wall.' },
  'too-steep': { title: 'Too steep — could tip backwards', tip: 'Move the base further out from the wall.' },
};

/**
 * How far to move the feet, for a ladder of `length` (any unit) at angle `deg`.
 * Positive = move the base further from the wall.
 */
export const baseAdjustment = (length, deg) => {
  if (!(length > 0) || !Number.isFinite(deg)) return null;
  const now = length * Math.cos(deg / DEG);
  const ideal = length * Math.cos(IDEAL_ANGLE / DEG);
  return { now, ideal, move: ideal - now, reach: length * Math.sin(IDEAL_ANGLE / DEG) };
};

/** Exponential low-pass filter for noisy sensor vectors. */
export const smoother = (alpha = 0.15) => {
  let s = null;
  return (v) => {
    s = s ? { x: s.x + alpha * (v.x - s.x), y: s.y + alpha * (v.y - s.y), z: s.z + alpha * (v.z - s.z) } : { ...v };
    return s;
  };
};

/**
 * Wobble score from accelerometer samples (m/s², gravity included) taken while
 * someone pushes the ladder. Uses the standard deviation of the magnitude, so it
 * doesn't depend on how the phone is oriented.
 */
export const wobble = (samples) => {
  if (samples.length < 10) return { score: NaN, level: 'unknown' };
  const mags = samples.map((s) => Math.hypot(s.x, s.y, s.z));
  const mean = mags.reduce((a, b) => a + b, 0) / mags.length;
  const sd = Math.sqrt(mags.reduce((a, b) => a + (b - mean) ** 2, 0) / mags.length);
  const level = sd < 0.25 ? 'steady' : sd < 0.8 ? 'some' : 'unstable';
  return { score: sd, level };
};

export const WOBBLE_TEXT = {
  steady: { title: 'Steady', tip: 'Very little movement. The footing looks firm.' },
  some: { title: 'Some movement', tip: 'Check both feet are flat on firm ground and the top rests evenly. Use a stabiliser or a helper to foot it.' },
  unstable: { title: 'Unstable — don’t climb yet', tip: 'Re-seat the feet on firm, level ground, check the locks, and have someone foot the ladder.' },
  unknown: { title: 'Not enough data', tip: 'Keep the phone on the rung for the whole test.' },
};

/**
 * Fall detector: a period of near free-fall followed by a hard impact.
 * Feed it samples ({x,y,z} in m/s², t in ms). Returns 'fall' once, when detected.
 */
export const fallDetector = ({ freeFallG = 0.35, freeFallMs = 120, impactG = 2.3, windowMs = 1200 } = {}) => {
  const G = 9.81;
  let fallStart = null;
  let fallEnd = null;
  return (s) => {
    const g = Math.hypot(s.x, s.y, s.z) / G;
    if (g < freeFallG) {
      if (fallStart === null) fallStart = s.t;
      fallEnd = s.t;
      return null;
    }
    if (fallStart !== null && fallEnd - fallStart >= freeFallMs && s.t - fallEnd <= windowMs && g >= impactG) {
      fallStart = fallEnd = null;
      return 'fall';
    }
    if (fallStart !== null && s.t - fallEnd > windowMs) fallStart = fallEnd = null;
    return null;
  };
};

export const CHECKLIST = [
  { id: 'feet', text: 'Both feet on firm, level, dry ground', why: 'Most ladder falls start at the feet: soft ground, slopes or wet floors.' },
  { id: 'top', text: 'Top rests on something solid — not a window or gutter', why: 'Glass and plastic gutters can give way under load.' },
  { id: 'locks', text: 'Locks, hooks or spreaders fully engaged', why: 'An unlocked section can collapse when weight goes on it.' },
  { id: 'extend', text: 'Extends 1 m (3 ft) above where you step off', why: 'Gives you something to hold as you step on and off.' },
  { id: 'shoes', text: 'Clean, dry, flat shoes — no slippers or sandals', why: 'Wet or loose soles slip on rungs.' },
  { id: 'contact', text: 'I’ll keep three points of contact', why: 'Two feet and a hand, or two hands and a foot, at all times.' },
  { id: 'belt', text: 'I’ll keep my belt buckle between the rails', why: 'Overreaching shifts your weight sideways and tips the ladder.' },
  { id: 'tell', text: 'Someone knows I’m up a ladder', why: 'If something goes wrong, help comes faster.' },
];
