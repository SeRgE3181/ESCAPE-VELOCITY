// Procedural audio: engine + motor layer, tire squeal, road/brake ambience, collision, and a looping
// synthwave/glitch track scheduled on the audio clock. One AudioContext, fixed node graph; music notes
// are short-lived nodes scheduled ahead of time (never per frame). Starts after the first user gesture.
let ctx, master, sfx, music, noiseBuf, crush, started = false, timer = 0
const nodes = {}
const store = (k, d) => { const v = localStorage.getItem('ev-' + k); return v === null ? d : +v }
const vol = { music: store('vol-music', 0.5), sfx: store('vol-sfx', 0.8), muted: localStorage.getItem('ev-muted') === '1' }

// ── UI: mute + independent music / effects sliders ──
const panel = document.createElement('div')
panel.style.cssText = 'position:fixed;right:clamp(22px,4vw,68px);bottom:62px;z-index:9;width:150px;padding:8px 10px;background:#05071099;border:1px solid #00dfff55;color:#00eaff;font:700 9px Orbitron,Arial,sans-serif;letter-spacing:2px'
panel.innerHTML = `<button id="mute-btn" style="all:unset;cursor:pointer;display:block;margin-bottom:6px"></button>
 <label style="display:block">MUSIC<input id="vol-music" type="range" min="0" max="1" step="0.05" style="width:100%;accent-color:#00dfff"></label>
 <label style="display:block">EFFECTS<input id="vol-sfx" type="range" min="0" max="1" step="0.05" style="width:100%;accent-color:#ff2d9a"></label>`
document.body.appendChild(panel)
const btn = panel.querySelector('#mute-btn'), sM = panel.querySelector('#vol-music'), sS = panel.querySelector('#vol-sfx')
sM.value = vol.music; sS.value = vol.sfx
function apply() {
  btn.textContent = vol.muted ? 'SOUND OFF [M]' : 'SOUND ON [M]'
  localStorage.setItem('ev-muted', vol.muted ? '1' : '0'); localStorage.setItem('ev-vol-music', vol.music); localStorage.setItem('ev-vol-sfx', vol.sfx)
  if (!ctx) return
  const t = ctx.currentTime
  master.gain.setTargetAtTime(vol.muted ? 0 : 1, t, 0.05)
  music.gain.setTargetAtTime(vol.music * 0.45, t, 0.05); sfx.gain.setTargetAtTime(vol.sfx, t, 0.05)
}
btn.onclick = e => { e.stopPropagation(); vol.muted = !vol.muted; apply(); btn.blur() }
sM.oninput = () => { vol.music = +sM.value; apply() }; sS.oninput = () => { vol.sfx = +sS.value; apply() }
for (const el of [sM, sS]) el.onkeydown = e => e.stopPropagation() // arrow keys must not move the slider while driving
addEventListener('keydown', e => { if (e.code === 'KeyM' && e.target.tagName !== 'INPUT') { vol.muted = !vol.muted; apply() } })
apply()

// ── helpers ──
const mtof = m => 440 * 2 ** ((m - 69) / 12)
function env(g, t, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d) }
function tone(type, f, t, dur, peak, dest, cutoff, a = 0.004) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t)
  let out = g; if (cutoff) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; g.connect(lp); out = lp }
  env(g, t, a, peak, dur); o.connect(g); out.connect(dest); o.start(t); o.stop(t + dur + a + 0.05)
}
function noise(t, dur, peak, type, freq, dest, q = 0.7) {
  const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
  n.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q; env(g, t, 0.002, peak, dur)
  n.connect(f); f.connect(g); g.connect(dest); n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.02)
}

// ── music: A minor, 112 BPM, 8-bar loop (Am F C G ×2), scheduled 120 ms ahead on the audio clock ──
const BPM = 112, STEP = 60 / BPM / 4, LOOP = 128
const ROOT = [33, 29, 36, 31], CHORD = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]]
const SCALE = [69, 72, 74, 76, 79, 81, 84]
const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x) }
let nextT = 0, step = 0
function scheduleStep(i, t) {
  const bar = (i / 16 | 0) % 8, s = i % 16, ch = bar % 4, last = bar === 7
  if (s === 0) { // pad glide to the new chord (persistent oscillators)
    nodes.pad.forEach((o, k) => o.frequency.setTargetAtTime(mtof(CHORD[ch][k % 3]) * (k < 3 ? 1 : 1.004), t, 0.25))
  }
  if (s % 4 === 0) { // kick: pitch-dropped sine
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    env(g, t, 0.002, 0.9, 0.22); o.connect(g); g.connect(music); o.start(t); o.stop(t + 0.3)
  }
  if (s === 4 || s === 12) { noise(t, 0.16, 0.3, 'bandpass', 1800, music, 0.8); tone('triangle', 190, t, 0.1, 0.25, music) } // snare/clap
  if (s % 2 === 0) noise(t, s % 4 === 2 ? 0.09 : 0.03, s % 4 === 2 ? 0.1 : 0.05, 'highpass', 7500, music) // hats (open on off-beats)
  if (last && s >= 12) noise(t, 0.05, 0.12, 'highpass', 5000, music) // snare-roll fill into the loop point
  const bassHit = [0, 3, 6, 8, 11, 14].includes(s) // syncopated bass pulse
  if (bassHit) { const f = mtof(ROOT[ch] + (s === 11 ? 12 : 0)); tone('sawtooth', f, t, 0.2, 0.34, music, 420); tone('sine', f, t, 0.24, 0.5, music) }
  // arpeggio (16ths) — plucked saw through a lowpass that opens on the bar's strong beats
  const pat = [0, 1, 2, 1, 2, 1, 0, 1], tone_ = CHORD[ch][pat[s % 8] % 3] + (s % 8 === 4 ? 12 : 0) + (bar >= 4 ? 12 : 0)
  if (!(bar % 4 === 3 && s >= 12)) tone('sawtooth', mtof(tone_), t, 0.14, 0.11, music, 1400 + (s % 4 === 0 ? 1600 : 0))
  // digital glitch accents: stutter on the last beat of every 4th bar, blips and a tape-stop at the loop end
  if (bar % 4 === 3 && s >= 12) {
    const f = mtof(SCALE[(hash(i) * 7 | 0) % 7]), half = STEP / 2
    for (let k = 0; k < 2; k++) tone('square', f, t + k * half, half * 0.8, 0.12, crush, 6000, 0.001)
    if (s === 12) noise(t, 0.05, 0.12, 'bandpass', 3500, crush, 4)
  }
  if (bar % 2 === 1 && s === 7) tone('square', mtof(93), t, 0.03, 0.1, crush, 8000, 0.001)
  if (last && s === 15) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(60, t + STEP * 1.8); env(g, t, 0.002, 0.14, STEP * 1.8); o.connect(g); g.connect(crush); o.start(t); o.stop(t + STEP * 2) }
}
function scheduler() {
  while (nextT < ctx.currentTime + 0.12) { scheduleStep(step, nextT); nextT += STEP; step = (step + 1) % LOOP }
}

function start() {
  if (started) { if (ctx.state === 'suspended') ctx.resume(); return }
  started = true
  ctx = new (window.AudioContext || window.webkitAudioContext)()
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4
  master = ctx.createGain(); master.gain.value = 0; sfx = ctx.createGain(); music = ctx.createGain()
  sfx.connect(master); music.connect(master); master.connect(comp); comp.connect(ctx.destination)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  // bit-crush bus for glitches (stepped waveshaper)
  crush = ctx.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) c[i] = Math.round(((i / 255) * 2 - 1) * 6) / 6
  crush.curve = c; crush.connect(music)
  // pad: 6 detuned saws (persistent) → lowpass
  const padF = ctx.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 800; const padG = ctx.createGain(); padG.gain.value = 0.035
  padF.connect(padG); padG.connect(music)
  nodes.pad = Array.from({ length: 6 }, (_, k) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(57); o.detune.value = k < 3 ? -7 : 7; o.connect(padF); o.start(); return o })
  // engine: saw + square + motor layer (sub sine/triangle), shared lowpass
  const eg = ctx.createGain(); eg.gain.value = 0; nodes.eg = eg
  nodes.ef = ctx.createBiquadFilter(); nodes.ef.type = 'lowpass'; nodes.ef.Q.value = 2.5
  nodes.o1 = ctx.createOscillator(); nodes.o1.type = 'sawtooth'
  nodes.o2 = ctx.createOscillator(); nodes.o2.type = 'square'
  nodes.o3 = ctx.createOscillator(); nodes.o3.type = 'sine'
  nodes.o4 = ctx.createOscillator(); nodes.o4.type = 'triangle'
  const g2 = ctx.createGain(); g2.gain.value = 0.3; const g3 = ctx.createGain(); g3.gain.value = 0.9; nodes.mg = g3 // motor layer, scaled with load
  nodes.o1.connect(nodes.ef); nodes.o2.connect(g2); g2.connect(nodes.ef); nodes.ef.connect(eg)
  nodes.o3.connect(g3); nodes.o4.connect(g3); g3.connect(eg); eg.connect(sfx)
  for (const o of [nodes.o1, nodes.o2, nodes.o3, nodes.o4]) o.start()
  // tire squeal + road rumble + brake hiss (looped noise)
  const mkNoise = (type, f, q) => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; n.connect(fl); fl.connect(g); g.connect(sfx); n.start(); return { fl, g } }
  nodes.sq = mkNoise('bandpass', 1500, 8); nodes.road = mkNoise('lowpass', 260, 0.7); nodes.hiss = mkNoise('highpass', 5500, 0.7)
  nodes.rpm = 0; nodes.last = ctx.currentTime
  apply(); master.gain.setValueAtTime(0, ctx.currentTime); master.gain.linearRampToValueAtTime(vol.muted ? 0 : 1, ctx.currentTime + 1.8) // gentle fade-in
  nextT = ctx.currentTime + 0.15; timer = setInterval(scheduler, 25)
  document.addEventListener('visibilitychange', () => document.hidden ? ctx.suspend() : ctx.resume())
  addEventListener('pagehide', () => { clearInterval(timer); ctx.close() })
}
addEventListener('keydown', start); addEventListener('pointerdown', start)

// rpm 0..1 (within gear), load 0..1, speed01 0..1, slip 0..1, brake 0..1 — only AudioParams change here
export function updateAudio({ rpm, load, speed01, slip, brake }) {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime, dt = Math.min(0.1, t - nodes.last); nodes.last = t
  nodes.rpm += (rpm - nodes.rpm) * (1 - Math.exp(-9 * dt)) // smooth through gear shifts
  const r = nodes.rpm, f = 38 + r * 105 + speed01 * 22
  nodes.o1.frequency.setTargetAtTime(f, t, 0.05); nodes.o2.frequency.setTargetAtTime(f * 2.01, t, 0.05)
  nodes.o3.frequency.setTargetAtTime(f * 0.5, t, 0.05); nodes.o4.frequency.setTargetAtTime(f * 0.25, t, 0.05)
  nodes.ef.frequency.setTargetAtTime(260 + r * 1300 + load * 900, t, 0.06)
  nodes.mg.gain.setTargetAtTime(0.5 + load * 0.9, t, 0.1) // motor body swells on acceleration
  nodes.eg.gain.setTargetAtTime(0.05 + load * 0.06 + r * 0.03, t, 0.08)
  const sq = Math.min(1, slip + brake * speed01 * 0.3)
  nodes.sq.g.gain.setTargetAtTime(sq > 0.1 ? sq * 0.13 : 0, t, 0.07)
  nodes.sq.fl.frequency.setTargetAtTime(1100 + slip * 900 + speed01 * 500, t, 0.1)
  nodes.road.g.gain.setTargetAtTime(speed01 * 0.07, t, 0.15); nodes.road.fl.frequency.setTargetAtTime(160 + speed01 * 380, t, 0.15)
  nodes.hiss.g.gain.setTargetAtTime(brake * speed01 * 0.03, t, 0.08)
}
let lastHit = 0
export function playCollision(strength) {
  if (!ctx || ctx.state !== 'running' || ctx.currentTime - lastHit < 0.15) return
  lastHit = ctx.currentTime; const t = ctx.currentTime, v = Math.min(1, strength / 20)
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2)
  env(g, t, 0.002, 0.5 * v, 0.25); o.connect(g); g.connect(sfx); o.start(t); o.stop(t + 0.3)
  noise(t, 0.18, 0.35 * v, 'lowpass', 1800, sfx)
}
if (import.meta.env.DEV) window.__audio = () => ({ state: ctx && ctx.state, master: master && +master.gain.value.toFixed(3), music: music && +music.gain.value.toFixed(3), sfx: sfx && +sfx.gain.value.toFixed(3), muted: vol.muted, step, eng: nodes.eg && +nodes.eg.gain.value.toFixed(3), sq: nodes.sq && +nodes.sq.g.gain.value.toFixed(3) })
