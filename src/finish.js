// Full-screen finish sequence: flash → neon wipes → "RACE OVER" slams in → "CITY CONQUERED" expands → stats.
const CSS = `
#fin{position:fixed;inset:0;z-index:50;overflow:hidden;font-family:Orbitron,'Arial Black',Impact,sans-serif;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none}
#fin .bg{position:absolute;inset:0;background:radial-gradient(ellipse at center,#0a1030f2 0%,#02030bfa 75%);animation:fin-bg .7s ease-out both}
#fin .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,#ffffff08 0 2px,transparent 2px 5px);animation:fin-fade 1s .5s both}
#fin .flash{position:absolute;inset:0;background:#fff;animation:fin-flash .45s ease-out both}
#fin .wipe{position:absolute;top:-10%;bottom:-10%;width:60%;left:-70%;transform:skewX(-18deg);animation:fin-wipe 1s cubic-bezier(.7,0,.2,1) both}
#fin .w1{background:linear-gradient(90deg,transparent,#00e5ff 40%,#00e5ffcc 60%,transparent)}
#fin .w2{background:linear-gradient(90deg,transparent,#ff2d9a 40%,#ff2d9acc 60%,transparent);animation-delay:.14s}
#fin .streak{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#00e5ff,transparent);opacity:0;animation:fin-streak 1.4s linear infinite}
#fin .t1{position:relative;font-size:clamp(46px,14vw,250px);font-weight:900;line-height:.95;letter-spacing:.02em;display:flex;gap:.02em;text-shadow:0 0 30px #00e5ff99,0 0 80px #ff2d9a66}
#fin .t1 span{display:inline-block;opacity:0;animation:fin-slam .55s cubic-bezier(.2,1.4,.3,1) forwards;animation-delay:calc(.75s + var(--i)*.06s)}
#fin .t1.glitch{animation:fin-glitch 2.6s steps(1) 1.6s infinite}
#fin .t2{position:relative;margin-top:1.2vh;font-size:clamp(20px,5.2vw,92px);font-weight:800;white-space:nowrap;background:linear-gradient(90deg,#00e5ff,#ffffff 50%,#ff2d9a);-webkit-background-clip:text;background-clip:text;color:transparent;animation:fin-t2 1.1s cubic-bezier(.2,.9,.2,1) 1.45s both}
#fin .line{width:0;height:3px;margin-top:2.4vh;background:linear-gradient(90deg,#00e5ff,#ff2d9a);box-shadow:0 0 18px #00e5ff;animation:fin-line 1s ease-out 1.9s forwards}
#fin .stats{display:flex;gap:clamp(18px,5vw,80px);margin-top:3.5vh;animation:fin-up .8s ease-out 2.4s both}
#fin .stats div{font-size:clamp(9px,1vw,13px);letter-spacing:.3em;color:#8fa3c4}#fin .stats b{display:block;margin-top:6px;font-size:clamp(20px,3vw,48px);letter-spacing:.06em;color:#fff;text-shadow:0 0 14px #00e5ff}
#fin .hint{margin-top:4vh;font-size:clamp(9px,1vw,13px);letter-spacing:.4em;color:#00eaff;animation:fin-up .8s ease-out 3s both,fin-blink 1.2s ease-in-out 3.8s infinite}
@keyframes fin-bg{from{opacity:0}to{opacity:1}}@keyframes fin-fade{from{opacity:0}to{opacity:1}}
@keyframes fin-flash{from{opacity:.9}to{opacity:0}}
@keyframes fin-wipe{from{left:-70%}to{left:130%}}
@keyframes fin-slam{0%{opacity:0;transform:translateY(-60%) scale(2.6);filter:blur(18px)}60%{opacity:1;filter:blur(0)}100%{opacity:1;transform:none;filter:blur(0)}}
@keyframes fin-glitch{0%,92%,100%{transform:none;text-shadow:0 0 30px #00e5ff99,0 0 80px #ff2d9a66}93%{transform:translateX(-.02em) skewX(-4deg);text-shadow:.04em 0 #ff2d9a,-.04em 0 #00e5ff}95%{transform:translateX(.03em);text-shadow:-.05em 0 #ff2d9a,.05em 0 #00e5ff}97%{transform:none}}
@keyframes fin-t2{0%{opacity:0;letter-spacing:.9em;filter:blur(10px)}100%{opacity:1;letter-spacing:.22em;filter:blur(0)}}
@keyframes fin-line{to{width:min(70vw,900px)}}
@keyframes fin-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes fin-blink{50%{opacity:.35}}
@keyframes fin-streak{0%{opacity:0;transform:translateX(-30%)}20%{opacity:.8}100%{opacity:0;transform:translateX(30%)}}
`
const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`
export function showFinish({ time, topKmh, laps = 3 }) {
  if (document.getElementById('fin')) return
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`)
  const letters = 'RACE OVER'.split('').map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('')
  const streaks = Array.from({ length: 7 }, (_, i) => `<i class="streak" style="top:${10 + i * 13}%;animation-delay:${(i * 0.23).toFixed(2)}s"></i>`).join('')
  document.body.insertAdjacentHTML('beforeend', `<div id="fin"><div class="bg"></div><div class="scan"></div>${streaks}
    <div class="wipe w1"></div><div class="wipe w2"></div><div class="flash"></div>
    <div class="t1 glitch">${letters}</div><div class="t2">CITY CONQUERED</div><div class="line"></div>
    <div class="stats"><div>TOTAL TIME<b>${fmt(time)}</b></div><div>TOP SPEED<b>${topKmh} KM/H</b></div><div>LAPS<b>${laps} / ${laps}</b></div></div>
    <div class="hint">PRESS R TO RACE AGAIN</div></div>`)
  addEventListener('keydown', e => { if (e.code === 'KeyR' || e.code === 'Enter') location.reload() })
}
