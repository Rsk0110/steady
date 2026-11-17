import {
  ANGLE_TEXT,
  CHECKLIST,
  DEG,
  IDEAL_ANGLE,
  SAFE_MAX,
  SAFE_MIN,
  WOBBLE_TEXT,
  baseAdjustment,
  classifyAngle,
  fallDetector,
  railAngle,
  smoother,
  wobble,
} from './ladder.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const G = 9.81;

// ---------------- state ----------------
const state = {
  demo: false,
  sensing: false,
  sound: true,
  gravity: null, // smoothed {x,y,z}
  raw: null, // latest raw accel incl. gravity
  listeners: new Set(), // per-sample callbacks (wobble, spotter)
  angleState: 'invalid',
  demoAngle: 65,
  demoWobble: 0.1,
};
const smooth = smoother(0.12);

// ---------------- audio & haptics ----------------
let ctx = null;
const audio = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());
const beep = (freq = 880, ms = 90, vol = 0.12, type = 'sine') => {
  if (!state.sound || !ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + ms / 1000 + 0.02);
};
const buzz = (p) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* unsupported */
  }
};

$('#sound').addEventListener('click', (e) => {
  state.sound = !state.sound;
  e.currentTarget.setAttribute('aria-pressed', String(state.sound));
  e.currentTarget.textContent = state.sound ? '🔊 Sound on' : '🔇 Sound off';
});

// ---------------- navigation ----------------
const VIEWS = ['angle', 'wobble', 'check', 'spotter'];
const go = (name) => {
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
  for (const b of $$('.step')) {
    const on = b.dataset.view === name;
    b.classList.toggle('is-on', on);
    if (on) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
  }
  scrollTo({ top: 0, behavior: 'smooth' });
};
for (const b of $$('.step')) b.addEventListener('click', () => go(b.dataset.view));
for (const b of $$('[data-go]')) b.addEventListener('click', () => go(b.dataset.go));

// ---------------- sensors ----------------
const onMotion = (e) => {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const v = { x: a.x, y: a.y, z: a.z, t: performance.now() };
  state.raw = v;
  state.gravity = smooth(v);
  state.sensing = true;
  for (const fn of state.listeners) fn(v);
};

const enterDemo = () => {
  state.demo = true;
  document.body.classList.add('is-demo');
  for (const n of $$('[data-demo]')) n.hidden = false;
  $('#demo-note').hidden = false;
  // synthetic sensor stream so the wobble test and spotter work in demo mode too
  let t = 0;
  setInterval(() => {
    t += 20;
    const amp = state.wobbling ? state.demoWobble : 0.02;
    const v = { x: amp * Math.sin(t / 37) * 2.2, y: 0, z: G + amp * Math.sin(t / 23) * 1.8, t: performance.now() };
    state.raw = v;
    for (const fn of state.listeners) fn(v);
  }, 20);
};

$('#start').addEventListener('click', async () => {
  audio();
  beep(660, 80);
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') throw new Error('denied');
    }
    addEventListener('devicemotion', onMotion);
  } catch {
    /* fall through to demo */
  }
  $('#start').textContent = 'Sensors on';
  $('#start').disabled = true;
  document.body.classList.add('is-live');
  setTimeout(() => {
    if (!state.sensing) enterDemo();
  }, 1500);
});

// ---------------- angle scene ----------------
const FOOT_Y = 220;
const WALL_X = 250;
const LEN = 205;
const pt = (fx, deg, r) => [fx + r * Math.cos(deg / DEG), FOOT_Y - r * Math.sin(deg / DEG)];
const arcPath = (fx, r, a0, a1) => {
  const [x0, y0] = pt(fx, a0, r);
  const [x1, y1] = pt(fx, a1, r);
  return `M ${x0} ${y0} A ${r} ${r} 0 0 0 ${x1} ${y1}`;
};
const setLine = (el, x1, y1, x2, y2) => {
  el.setAttribute('x1', x1);
  el.setAttribute('y1', y1);
  el.setAttribute('x2', x2);
  el.setAttribute('y2', y2);
};

const drawLadder = (deg) => {
  const d = Number.isFinite(deg) ? Math.max(30, Math.min(89, deg)) : 60;
  const fx = WALL_X - LEN * Math.cos(d / DEG);
  const [tx, ty] = pt(fx, d, LEN);
  const nx = Math.sin(d / DEG) * 7;
  const ny = Math.cos(d / DEG) * 7;
  setLine($('#rail-a'), fx - nx, FOOT_Y - ny, tx - nx, ty - ny);
  setLine($('#rail-b'), fx + nx, FOOT_Y + ny, tx + nx, ty + ny);
  const rungs = $('#rungs');
  rungs.replaceChildren();
  for (let r = 22; r < LEN - 6; r += 22) {
    const [cx, cy] = pt(fx, d, r);
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    setLine(l, cx - nx, cy - ny, cx + nx, cy + ny);
    l.setAttribute('class', 'rung');
    rungs.append(l);
  }
  // safe zone wedge and measured arc at the foot
  const [z0x, z0y] = pt(fx, SAFE_MIN, 70);
  const [z1x, z1y] = pt(fx, SAFE_MAX, 70);
  $('#zone').setAttribute('d', `M ${fx} ${FOOT_Y} L ${z0x} ${z0y} A 70 70 0 0 0 ${z1x} ${z1y} Z`);
  $('#arc').setAttribute('d', arcPath(fx, 40, 0, d));
  const [lx, ly] = pt(fx, d / 2, 54);
  const label = $('#arc-label');
  label.setAttribute('x', lx);
  label.setAttribute('y', ly + 4);
  label.textContent = Number.isFinite(deg) ? `${Math.round(deg)}°` : '';
};

const unitLabel = () => ($('#unit').value === 'ft' ? 'ft' : 'm');
const fmtLen = (v) => {
  const u = unitLabel();
  if (u === 'm') return Math.abs(v) < 1 ? `${Math.round(Math.abs(v) * 100)} cm` : `${Math.abs(v).toFixed(2)} m`;
  const inches = Math.abs(v) * 12;
  return inches < 24 ? `${Math.round(inches)} in` : `${Math.abs(v).toFixed(1)} ft`;
};

let lastTick = 0;
let lastState = 'invalid';
const renderAngle = (deg) => {
  const s = classifyAngle(deg);
  state.angleState = s;
  const card = $('#angle-card');
  card.dataset.state = s;
  $('#angle-num').textContent = Number.isFinite(deg) && s !== 'invalid' ? deg.toFixed(1) : '--';
  $('#angle-title').textContent = ANGLE_TEXT[s].title;
  $('#angle-tip').textContent = ANGLE_TEXT[s].tip;
  drawLadder(s === 'invalid' ? NaN : deg);

  const len = parseFloat($('#len').value);
  const adj = s !== 'invalid' ? baseAdjustment(len, deg) : null;
  if (adj) {
    $('#advice').textContent =
      s === 'safe'
        ? `Base is ${fmtLen(adj.now)} from the wall. That’s right for this ladder.`
        : `Move the feet ${fmtLen(adj.move)} ${adj.move > 0 ? 'further from' : 'closer to'} the wall (to about ${fmtLen(adj.ideal)} out).`;
  } else if (!(len > 0)) {
    $('#advice').textContent = 'Safe rule: the base should be 1 unit out for every 4 units of height (about 76°).';
  }

  // eyes-free guidance: low ticks = too shallow, high ticks = too steep, chime when safe
  const now = performance.now();
  if (s === 'safe' && lastState !== 'safe') {
    beep(784, 90);
    setTimeout(() => beep(1175, 140), 110);
    buzz(60);
  } else if (s !== 'safe' && s !== 'invalid' && now - lastTick > 700) {
    lastTick = now;
    beep(deg < IDEAL_ANGLE ? 330 : 990, 50, 0.07, 'triangle');
  }
  lastState = s;
};

$('#demo-angle').addEventListener('input', (e) => {
  state.demoAngle = Number(e.target.value);
  $('#demo-angle-out').textContent = `${state.demoAngle}°`;
});
for (const r of $$('input[name="demo-wobble"]')) r.addEventListener('change', () => (state.demoWobble = Number(r.value)));

const loop = () => {
  if (!$('#view-angle').hidden && (state.demo || state.gravity)) {
    renderAngle(state.demo ? state.demoAngle : railAngle(state.gravity));
  }
  requestAnimationFrame(loop);
};
drawLadder(NaN);
requestAnimationFrame(loop);

// ---------------- wobble ----------------
const wave = $('#wave');
const wctx = wave.getContext('2d');
const drawWave = (mags) => {
  const css = getComputedStyle(document.body);
  wctx.clearRect(0, 0, wave.width, wave.height);
  wctx.strokeStyle = css.getPropertyValue('--line').trim() || '#ccc';
  wctx.beginPath();
  wctx.moveTo(0, 60);
  wctx.lineTo(600, 60);
  wctx.stroke();
  if (mags.length < 2) return;
  const mean = mags.reduce((a, b) => a + b, 0) / mags.length;
  wctx.strokeStyle = css.getPropertyValue('--accent').trim() || '#f90';
  wctx.lineWidth = 3;
  wctx.beginPath();
  mags.forEach((m, i) => {
    const x = (i / 150) * 600;
    const y = 60 - Math.max(-55, Math.min(55, (m - mean) * 30));
    if (i) wctx.lineTo(x, y);
    else wctx.moveTo(x, y);
  });
  wctx.stroke();
};
drawWave([]);

$('#wobble-go').addEventListener('click', async () => {
  if (!state.sensing && !state.demo) {
    $('#start').click();
    await new Promise((r) => setTimeout(r, 1600));
  }
  const card = $('#wobble-card');
  const btn = $('#wobble-go');
  btn.disabled = true;
  card.dataset.state = 'running';
  for (const n of [3, 2, 1]) {
    $('#wobble-title').textContent = `Get ready… ${n}`;
    $('#wobble-tip').textContent = 'Hand on the rail, phone resting on a rung.';
    beep(520, 80);
    await new Promise((r) => setTimeout(r, 700));
  }
  $('#wobble-title').textContent = 'Push the ladder side to side now';
  beep(880, 160);
  const samples = [];
  const mags = [];
  const fn = (v) => {
    samples.push(v);
    mags.push(Math.hypot(v.x, v.y, v.z));
    if (mags.length > 150) mags.shift();
    drawWave(mags);
  };
  state.wobbling = true;
  state.listeners.add(fn);
  await new Promise((r) => setTimeout(r, 3000));
  state.listeners.delete(fn);
  state.wobbling = false;
  const res = wobble(samples);
  card.dataset.state = res.level;
  $('#wobble-title').textContent = WOBBLE_TEXT[res.level].title;
  $('#wobble-tip').textContent = WOBBLE_TEXT[res.level].tip;
  beep(res.level === 'steady' ? 1046 : 300, 220);
  buzz(res.level === 'steady' ? 60 : [80, 60, 80]);
  btn.disabled = false;
  btn.textContent = 'Test again';
});

// ---------------- checklist ----------------
const list = $('#checklist');
const updateProgress = () => {
  const n = $$('#checklist input:checked').length;
  $('#check-progress').textContent = n === CHECKLIST.length ? 'All done. Ready to climb.' : `${n} of ${CHECKLIST.length} done`;
  $('#check-progress').classList.toggle('done', n === CHECKLIST.length);
};
for (const item of CHECKLIST) {
  const li = document.createElement('li');
  const label = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.id = `ck-${item.id}`;
  cb.addEventListener('change', () => {
    updateProgress();
    if (cb.checked) beep(700 + 40 * $$('#checklist input:checked').length, 60, 0.06);
  });
  const span = document.createElement('span');
  span.textContent = item.text;
  label.append(cb, span);
  const why = document.createElement('p');
  why.className = 'why';
  why.textContent = item.why;
  li.append(label, why);
  list.append(li);
}
updateProgress();

// ---------------- spotter ----------------
const KEY = 'steady:contact';
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) {
    $('#c-name').value = saved.name || '';
    $('#c-phone').value = saved.phone || '';
    $('#c-save').checked = true;
  }
} catch {
  /* storage unavailable */
}

let wakeLock = null;
let detect = null;
let spotFn = null;
let alarmTimer = null;
let sirenTimer = null;

const contact = () => ({ name: $('#c-name').value.trim(), phone: $('#c-phone').value.trim() });

const stopSpotter = () => {
  if (spotFn) state.listeners.delete(spotFn);
  spotFn = null;
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  $('#spot-on').hidden = true;
  $('#spot-setup').hidden = false;
};

const stopAlarm = () => {
  clearInterval(alarmTimer);
  clearInterval(sirenTimer);
  $('#alarm').hidden = true;
  document.body.classList.remove('alarming');
};

const raiseAlarm = () => {
  if (!$('#alarm').hidden) return;
  const c = contact();
  const call = $('#call-contact');
  call.textContent = c.name ? `Call ${c.name}` : 'Call contact';
  call.href = c.phone ? `tel:${c.phone.replace(/[^\d+]/g, '')}` : '#';
  call.hidden = !c.phone;
  $('#alarm').hidden = false;
  document.body.classList.add('alarming');
  $('#ok').focus();
  let left = 30;
  $('#alarm-count').textContent = left;
  const wasSound = state.sound;
  state.sound = true; // the alarm always sounds
  let hi = false;
  sirenTimer = setInterval(() => {
    hi = !hi;
    beep(hi ? 1320 : 880, 380, 0.35, 'square');
    buzz(300);
  }, 420);
  alarmTimer = setInterval(() => {
    left--;
    $('#alarm-count').textContent = Math.max(0, left);
    if (left <= 0) {
      clearInterval(alarmTimer);
      $('#alarm-h').textContent = c.phone ? `Call ${c.name || 'your contact'} or emergency services` : 'Call emergency services if you’re hurt';
    }
  }, 1000);
  $('#ok').onclick = () => {
    state.sound = wasSound;
    stopAlarm();
    $('#alarm-h').textContent = 'Did you fall?';
  };
};

$('#spot-go').addEventListener('click', async () => {
  audio();
  if (!state.sensing && !state.demo) {
    $('#start').click();
    await new Promise((r) => setTimeout(r, 1600));
  }
  const c = contact();
  try {
    if ($('#c-save').checked) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    /* not supported */
  }
  detect = fallDetector();
  spotFn = (v) => {
    if (detect(v) === 'fall') raiseAlarm();
  };
  state.listeners.add(spotFn);
  $('#spot-meta').textContent = c.name ? `Contact: ${c.name}${c.phone ? ` · ${c.phone}` : ''}` : 'No contact set: the alarm will still sound.';
  $('#spot-setup').hidden = true;
  $('#spot-on').hidden = false;
  beep(660, 80);
  setTimeout(() => beep(990, 120), 100);
});
$('#spot-stop').addEventListener('click', stopSpotter);
$('#spot-sim').addEventListener('click', () => {
  // replay a synthetic fall through the real detector
  let t = performance.now();
  for (let i = 0; i < 25; i++) spotFn?.({ x: 0, y: 0, z: 0.08 * G, t: (t += 10) });
  spotFn?.({ x: 0, y: 0, z: 3.4 * G, t: (t += 10) });
});

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
