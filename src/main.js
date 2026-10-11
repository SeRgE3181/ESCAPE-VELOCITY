import './style.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { updateAudio, playCollision } from './audio.js'
import { showFinish } from './finish.js'

document.querySelector('#app').innerHTML = `
  <div id="game">
    <div class="topbar">
      <div class="brand">ESCAPE<span> VELOCITY</span><small>NEON DISTRICT // NIGHT RUN</small></div>
      <div class="status"><i></i><span id="race-status">RACE READY</span></div>
    </div>
    <div class="hud">
      <div class="label">VELOCITY</div>
      <div class="speed"><span id="speed">000</span><small> KM/H</small></div>
      <div class="speedbar"><i id="speed-fill"></i></div>
      <div class="lap">LAP <b id="lap">01</b><span> / 03</span></div>
      <div class="progress"><i id="lap-progress"></i></div>
    </div>
    <div class="center-message" id="message">W / ↑ TO START YOUR RUN</div>
    <div class="bottom">
      <div><kbd>W</kbd> / <kbd>↑</kbd><span>THROTTLE</span></div>
      <div><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd><span>STEER</span></div>
      <div><kbd>S</kbd> / <kbd>↓</kbd><span>BRAKE / REVERSE</span></div>
      <div><kbd>SPACE</kbd><span>HANDBRAKE</span></div>
    </div>
    <div class="crosshair">EV <span>// 001</span></div>
    <div class="vignette"></div>
  </div>
`

// ── SCENE, RENDERER, CAMERA ──────────────────────────────────────────
const scene = new THREE.Scene()
scene.background = new THREE.Color('#050710')
scene.fog = new THREE.FogExp2('#170f30', 0.00078)

const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 4200)
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
renderer.outputColorSpace = THREE.SRGBColorSpace
document.querySelector('#game').prepend(renderer.domElement)

// Small studio environment: gives the metallic car something to reflect (without it metals render black).
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environment = envTex
scene.environmentIntensity = 0.04

// Gradient sky dome with a magenta horizon glow (follows camera, no fog).
const sky = new THREE.Mesh(new THREE.SphereGeometry(3600, 24, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 hor = vec3(0.30,0.10,0.32); vec3 mid = vec3(0.07,0.06,0.20); vec3 top = vec3(0.015,0.025,0.06); vec3 c = mix(hor, mid, smoothstep(0.0, 0.16, h)); c = mix(c, top, smoothstep(0.1, 0.65, h)); gl_FragColor = vec4(c, 1.0); }'
}))
sky.renderOrder = -10
scene.add(sky)

// ── LIGHTING ─────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0x9db8ff, 0x1a1030, 1.5))
scene.add(new THREE.AmbientLight(0x243a70, 0.4))
const moon = new THREE.DirectionalLight(0x9eb9ff, 2.2)
moon.position.set(-160, 300, 90)
moon.castShadow = true
moon.shadow.mapSize.set(1024, 1024)
moon.shadow.camera.left = -45
moon.shadow.camera.right = 45
moon.shadow.camera.top = 45
moon.shadow.camera.bottom = -45
moon.shadow.camera.far = 400
moon.shadow.bias = -0.0004
moon.shadow.normalBias = 0.06
scene.add(moon, moon.target) // shadow frustum follows the car each frame
const cyanFill = new THREE.PointLight(0x00dfff, 55, 170)
const pinkFill = new THREE.PointLight(0xff168f, 42, 160)
scene.add(cyanFill, pinkFill)

// ── GROUND ───────────────────────────────────────────────────────────
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(6000, 6000),
  new THREE.MeshStandardMaterial({ color: '#090c17', roughness: 0.88, metalness: 0.08 })
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -2.4
ground.receiveShadow = true
scene.add(ground)

// ── TRACK CENTERLINE ─────────────────────────────────────────────────
const roadWidth = 20
const halfRoad = roadWidth / 2
const trackNodes = [
  [-250, 0, 170], [-180, 2, 205], [-80, 3, 190], [10, 5, 145],
  [100, 8, 130], [195, 16, 145], [275, 25, 105], [300, 28, 30],
  [265, 24, -45], [195, 15, -72], [145, 7, -135], [100, 5, -220],
  [20, 7, -260], [-65, 12, -230], [-130, 23, -185], [-220, 31, -165],
  [-290, 32, -100], [-280, 22, -25], [-215, 10, 25], [-235, 3, 105]
].map(([x, y, z]) => new THREE.Vector3(x, y, z))
const centerline = new THREE.CatmullRomCurve3(trackNodes, true, 'centripetal', 0.42)
const sampleCount = 720
const trackPoints = Array.from({ length: sampleCount }, (_, i) => centerline.getPointAt(i / sampleCount))
const trackTangents = Array.from({ length: sampleCount }, (_, i) => centerline.getTangentAt(i / sampleCount).normalize())
const trackNormals = trackTangents.map(t => new THREE.Vector3(-t.z, 0, t.x).normalize())
const trackLengths = centerline.getLength()

function offsetPoint(index, lateral = 0, y = 0) {
  const p = trackPoints[(index + sampleCount) % sampleCount]
  const n = trackNormals[(index + sampleCount) % sampleCount]
  return new THREE.Vector3(p.x + n.x * lateral, p.y + y, p.z + n.z * lateral)
}

function ribbonGeometry(lateral, width, y = 0.035, start = 0, end = sampleCount, wrap = false) {
  const positions = [], uvs = [], indices = []
  const count = end - start
  for (let j = 0; j <= count; j++) {
    const i = wrap ? (start + j) % sampleCount : Math.min(start + j, sampleCount - 1)
    const left = offsetPoint(i, lateral - width / 2, y)
    const right = offsetPoint(i, lateral + width / 2, y)
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z)
    uvs.push(0, j / Math.max(count, 1), 1, j / Math.max(count, 1))
    if (j < count) {
      const a = j * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// ── ROAD SURFACE ─────────────────────────────────────────────────────
const roadGroup = new THREE.Group()
scene.add(roadGroup)
// Procedural asphalt: speckle, patched seams and a few wet (low-roughness) patches.
function roadTextures() {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 512; return c }
  const a = mk(), b = mk(), x = a.getContext('2d'), y = b.getContext('2d')
  x.fillStyle = '#6a7084'; x.fillRect(0, 0, 512, 512)
  y.fillStyle = '#b8b8b8'; y.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 9000; i++) { const g = 80 + Math.random() * 70 | 0; x.fillStyle = `rgba(${g},${g},${g + 12},0.35)`; x.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2) }
  for (let i = 0; i < 7; i++) { x.fillStyle = `rgba(30,32,46,${0.08 + Math.random() * 0.08})`; x.fillRect(Math.random() * 400, Math.random() * 500, 60 + Math.random() * 140, 14 + Math.random() * 40) }
  x.strokeStyle = 'rgba(10,12,20,0.55)'; x.lineWidth = 2
  for (const yy of [60, 330]) { x.beginPath(); x.moveTo(0, yy); x.lineTo(512, yy + 6); x.stroke() }
  for (let i = 0; i < 5; i++) { // wet patches: tinted + glossy
    const px = Math.random() * 512, py = Math.random() * 512, r = 40 + Math.random() * 70
    const gx = x.createRadialGradient(px, py, 0, px, py, r); gx.addColorStop(0, 'rgba(60,80,140,0.35)'); gx.addColorStop(1, 'rgba(60,80,140,0)'); x.fillStyle = gx; x.fillRect(px - r, py - r, r * 2, r * 2)
    const gy = y.createRadialGradient(px, py, 0, px, py, r); gy.addColorStop(0, 'rgba(40,40,40,0.9)'); gy.addColorStop(1, 'rgba(40,40,40,0)'); y.fillStyle = gy; y.fillRect(px - r, py - r, r * 2, r * 2)
  }
  const ta = new THREE.CanvasTexture(a), tb = new THREE.CanvasTexture(b)
  ta.colorSpace = THREE.SRGBColorSpace
  for (const t of [ta, tb]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 110); t.anisotropy = 8 }
  return [ta, tb]
}
const [roadMap, roadRough] = roadTextures()
const asphalt = new THREE.MeshStandardMaterial({ color: '#7a8096', map: roadMap, roughnessMap: roadRough, roughness: 0.85, metalness: 0.2 })
const road = new THREE.Mesh(ribbonGeometry(0, roadWidth, 0), asphalt)
road.receiveShadow = true
roadGroup.add(road)

const shoulderMat = new THREE.MeshStandardMaterial({ color: '#4a3344', roughness: 0.7, metalness: 0.1, emissive: '#1e0716', emissiveIntensity: 0.4 })
for (const side of [-1, 1]) {
  const shoulder = new THREE.Mesh(ribbonGeometry(side * (halfRoad + 0.32), 1.25, 0.015), shoulderMat)
  roadGroup.add(shoulder)
}

const neonMat = (color, intensity = 2.2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.32, metalness: 0.12 })
const edgeMat = neonMat('#00dfff', 1.65)
for (const side of [-1, 1]) {
  roadGroup.add(new THREE.Mesh(ribbonGeometry(side * (halfRoad - 0.5), 0.16, 0.075), edgeMat))
}

// Center dashes merge into a pair of continuous guide lines on fast straights.
const markingMat = new THREE.MeshBasicMaterial({ color: '#d1deea' })
const dashGeometries = []
const dashLength = 2.5
const spacing = 7.5
for (let distance = 0; distance < trackLengths; distance += spacing) {
  const start = Math.floor(distance / trackLengths * sampleCount)
  const count = Math.max(2, Math.round(dashLength / trackLengths * sampleCount))
  const geom = ribbonGeometry(0, 0.22, 0.09, start, start + count, true)
  dashGeometries.push(geom)
}
const dashPositions = []
const dashIndexes = []
let vertexOffset = 0
for (const geometry of dashGeometries) {
  const pos = geometry.getAttribute('position').array
  for (let i = 0; i < pos.length; i += 3) dashPositions.push(pos[i], pos[i + 1], pos[i + 2])
  const idx = geometry.index.array
  for (const index of idx) dashIndexes.push(index + vertexOffset)
  vertexOffset += pos.length / 3
  geometry.dispose()
}
const dashGeometry = new THREE.BufferGeometry()
dashGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dashPositions, 3))
dashGeometry.setIndex(dashIndexes)
dashGeometry.computeVertexNormals()
roadGroup.add(new THREE.Mesh(dashGeometry, markingMat))

// Alternating curb blocks follow the edge curvature as two merged ribbon meshes.
const curbMaterials = [new THREE.MeshStandardMaterial({ color: '#f4f5f8', roughness: 0.52, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: '#e53557', roughness: 0.58, emissive: '#3b0712', emissiveIntensity: 0.35, side: THREE.DoubleSide })]
for (const side of [-1, 1]) {
  for (let color = 0; color < 2; color++) {
    const positions = [], indices = []
    for (let i = color; i < sampleCount; i += 4) {
      const p0 = offsetPoint(i, side * (halfRoad - 1.08), 0.12)
      const p1 = offsetPoint(i, side * (halfRoad - 0.08), 0.12)
      const p2 = offsetPoint(i + 2, side * (halfRoad - 1.08), 0.12)
      const p3 = offsetPoint(i + 2, side * (halfRoad - 0.08), 0.12)
      const base = positions.length / 3
      positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z)
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    roadGroup.add(new THREE.Mesh(geometry, curbMaterials[color]))
  }
}

// Continuous guardrails and low neon edge rails track every bend and rise.
const barrierMat = new THREE.MeshStandardMaterial({ color: '#384052', metalness: 0.78, roughness: 0.3 })
for (const side of [-1, 1]) {
  const railPoints = Array.from({ length: sampleCount + 1 }, (_, i) => offsetPoint(i % sampleCount, side * (halfRoad + 2), 1.1))
  const glowPoints = railPoints.map(p => new THREE.Vector3(p.x, p.y + 0.48, p.z))
  const railCurve = new THREE.CatmullRomCurve3(railPoints, true, 'centripetal')
  const glowCurve = new THREE.CatmullRomCurve3(glowPoints, true, 'centripetal')
  const rail = new THREE.Mesh(new THREE.TubeGeometry(railCurve, sampleCount, 0.48, 6, true), barrierMat)
  rail.castShadow = true
  roadGroup.add(rail)
  roadGroup.add(new THREE.Mesh(new THREE.TubeGeometry(glowCurve, sampleCount, 0.065, 5, true), neonMat(side < 0 ? '#ff168f' : '#00dfff', 1.5)))
}

// ── ELEVATED HIGHWAY PIERS, STREETLIGHTS, GANTRIES ───────────────────
const pierGeo = new THREE.CylinderGeometry(1.5, 2.2, 1, 8)
const pierMat = new THREE.MeshStandardMaterial({ color: '#33374a', roughness: 0.6, metalness: 0.4 })
const poleGeo = new THREE.CylinderGeometry(0.16, 0.27, 10, 7)
const poleMat = new THREE.MeshStandardMaterial({ color: '#344056', roughness: 0.38, metalness: 0.8 })
const lampGeo = new THREE.BoxGeometry(2.4, 0.18, 0.55)
const lampEmissive = new THREE.MeshBasicMaterial({ color: '#c7faff' })
const lampDummy = new THREE.Object3D()
const lampSlots = []
for (let i = 0; i < sampleCount; i += 12) {
  const point = trackPoints[i]
  const normal = trackNormals[i]
  if (point.y > 7) {
    for (const side of [-1, 1]) {
      const x = point.x + normal.x * side * (halfRoad + 3)
      const z = point.z + normal.z * side * (halfRoad + 3)
      const pier = new THREE.Mesh(pierGeo, pierMat)
      pier.position.set(x, point.y / 2 - 0.1, z)
      pier.scale.y = Math.max(0.5, point.y + 2)
      roadGroup.add(pier)
    }
  }
  if (i % 24 === 0) for (const side of [-1, 1]) lampSlots.push({ i, side })
}
// Streetlights are instanced (poles, arms, lamp heads, light pools) = 4 draw calls total.
const armGeo = new THREE.BoxGeometry(3.4, 0.16, 0.2)
const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2)
const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c) })()
const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: '#a9e6ff', transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false })
const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSlots.length)
const arms = new THREE.InstancedMesh(armGeo, poleMat, lampSlots.length)
const lamps = new THREE.InstancedMesh(lampGeo, lampEmissive, lampSlots.length)
const pools = new THREE.InstancedMesh(poolGeo, poolMat, lampSlots.length)
lampSlots.forEach(({ i, side }, k) => {
  const pt = trackPoints[i], n = trackNormals[i]
  const px = pt.x + n.x * side * (halfRoad + 7), pz = pt.z + n.z * side * (halfRoad + 7)
  const rotY = Math.atan2(-n.z, n.x) // box X axis lies along the road normal (arm reaches over the road)
  const place = (mesh, ox, y, oz, sx = 1, sz = 1) => {
    lampDummy.position.set(ox, y, oz); lampDummy.rotation.set(0, rotY, 0); lampDummy.scale.set(sx, 1, sz); lampDummy.updateMatrix(); mesh.setMatrixAt(k, lampDummy.matrix)
  }
  place(poles, px, pt.y + 4.5, pz)
  place(arms, px - n.x * side * 1.7, pt.y + 9.3, pz - n.z * side * 1.7)
  place(lamps, px - n.x * side * 3.1, pt.y + 9.15, pz - n.z * side * 3.1)
  place(pools, pt.x + n.x * side * 5.5, pt.y + 0.14, pt.z + n.z * side * 5.5, 14, 14)
  if (i % 72 === 0 && side === 1) {
    const light = new THREE.PointLight(0x9fdfff, 16, 40)
    light.position.set(px - n.x * side * 3.1, pt.y + 7.5, pz - n.z * side * 3.1)
    roadGroup.add(light)
  }
})
for (const m of [poles, arms, lamps, pools]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; roadGroup.add(m) }

function addGantry(t, color = '#00dfff', tunnel = false) {
  const index = Math.round(t * sampleCount) % sampleCount
  const p = trackPoints[index], tangent = trackTangents[index], normal = trackNormals[index]
  const group = new THREE.Group()
  group.name = tunnel ? 'gantry-tunnel' : 'gantry-' + t
  group.position.set(p.x, p.y, p.z)
  group.rotation.y = Math.atan2(tangent.x, tangent.z)
  const frameMat = new THREE.MeshStandardMaterial({ color: '#242c40', metalness: 0.75, roughness: 0.28 })
  const glow = neonMat(color, 2.5)
  const span = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 7, 0.6, 0.6), frameMat)
  span.position.y = 8.2
  group.add(span)
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 8.5, 0.6), frameMat)
    post.position.set(side * (halfRoad + 3.5), 4, 0)
    group.add(post)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 8.2, 0.7), glow)
    strip.position.set(side * (halfRoad + 3.15), 4, 0)
    group.add(strip)
  }
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 5, 1.3, 0.8), glow)
  fascia.position.set(0, 7.3, 0)
  group.add(fascia)
  scene.add(group)
  if (tunnel) {
    // Open tunnel that follows the curved road: short segments (roof + two walls, no end caps),
    // each aligned to the local tangent. Walls sit outside the guardrail (collision untouched) and use
    // BackSide so they are only visible from inside; nothing can ever wall off the road ahead.
    const shellMat = new THREE.MeshStandardMaterial({ color: '#111627', side: THREE.BackSide, roughness: 0.78 })
    const segSamples = 4
    for (let k = 1; k <= 7; k++) {
      const si = (index - k * segSamples + sampleCount) % sampleCount
      const sp = trackPoints[si], st = trackTangents[si]
      const seg = new THREE.Group()
      seg.position.set(sp.x, sp.y, sp.z); seg.rotation.y = Math.atan2(st.x, st.z)
      const len = Math.hypot(trackPoints[(si + segSamples) % sampleCount].x - sp.x, trackPoints[(si + segSamples) % sampleCount].z - sp.z) + 0.6
      const roof = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 10, 0.6, len), shellMat); roof.position.set(0, 9.0, len / 2 - 0.3)
      const light = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 0.45), lampEmissive); light.position.set(0, 8.6, len / 2)
      seg.add(roof, light)
      for (const sd of [-1, 1]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9.6, len), shellMat); wall.position.set(sd * (halfRoad + 5), 4.5, len / 2 - 0.3); seg.add(wall) }
      scene.add(seg)
    }
  }
}
addGantry(0.015, '#00dfff')
addGantry(0.315, '#ff168f')
addGantry(0.72, '#ffb454', true)

// ── CITY SKYLINE ─────────────────────────────────────────────────────
let seed = 3181
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const city = new THREE.Group()
scene.add(city)

// nearestTrackPoint is needed during city generation — define it early.
function nearestTrackPoint(position) {
  let bestIndex = 0
  let bestScore = Infinity
  for (let i = 0; i < sampleCount; i += 1) {
    const p = trackPoints[i]
    const dx = position.x - p.x, dz = position.z - p.z
    const dy = position.y - p.y
    const score = dx * dx + dz * dz + dy * dy * 1.7
    if (score < bestScore) { bestScore = score; bestIndex = i }
  }
  const p = trackPoints[bestIndex]
  const tangent = trackTangents[bestIndex]
  const normal = trackNormals[bestIndex]
  const dx = position.x - p.x, dz = position.z - p.z
  const lateral = dx * normal.x + dz * normal.z
  return { index: bestIndex, t: bestIndex / sampleCount, point: p, tangent, lateral, distance: Math.sqrt(bestScore) }
}

const buildingGeo = new THREE.BoxGeometry(1, 1, 1)
const buildingMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.3, roughness: 0.55 })
// One shared material draws every tower AND its lit-window grid: windows are computed per-fragment
// from instance-scaled local coordinates, so there are no facade meshes or textures at all.
buildingMat.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLocal; varying vec3 vNrm; varying float vSeed;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      vLocal = position * sc + vec3(0.0, sc.y * 0.5, 0.0); vNrm = normal; vSeed = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.071;`)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLocal; varying vec3 vNrm; varying float vSeed;')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec2 uvw = abs(vNrm.x) > 0.5 ? vec2(vLocal.z, vLocal.y) : vec2(vLocal.x, vLocal.y);
      vec2 grid = uvw / vec2(3.2, 4.4);
      vec2 cell = floor(grid); vec2 f = fract(grid);
      float h = fract(sin(dot(cell + vSeed, vec2(12.9898, 78.233))) * 43758.5453);
      float h2 = fract(h * 7.31 + vSeed);
      float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.72) * step(abs(vNrm.y), 0.5);
      float lit = step(0.58, h) * step(3.0, vLocal.y);
      vec3 tint = h2 > 0.86 ? vec3(1.0, 0.18, 0.55) : (h2 > 0.55 ? vec3(1.0, 0.68, 0.30) : vec3(0.25, 0.85, 1.0));
      totalEmissiveRadiance += win * lit * tint * (0.5 + h2 * 1.1);`)
}
const cyanWindows = new THREE.MeshStandardMaterial({ color: '#39dfff', emissive: '#00b9ed', emissiveIntensity: 1.8 })
const amberWindows = new THREE.MeshStandardMaterial({ color: '#ffc06a', emissive: '#ff8b28', emissiveIntensity: 1.4 })
const magentaWindows = new THREE.MeshStandardMaterial({ color: '#ff5cae', emissive: '#fa168b', emissiveIntensity: 1.55 })
const towers = []
const windowBars = [[], [], []]
const sideVariants = [-1, 1]
const addTower = (x, z, width, depth, height, rotation, y0 = 0) => towers.push({ x, z, width, depth, height, rotation, y0 })
for (let i = 0; i < 300; i++) {
  const pathIndex = Math.floor(random() * sampleCount)
  const p = trackPoints[pathIndex], n = trackNormals[pathIndex]
  const side = sideVariants[Math.floor(random() * 2)]
  const distance = 90 + Math.pow(random(), 1.7) * 250
  const x = p.x + n.x * side * distance + (random() - 0.5) * 28
  const z = p.z + n.z * side * distance + (random() - 0.5) * 28
  // Mix of slim towers, wide blocks and a few supertall spires.
  const kind = random()
  const width = kind < 0.3 ? 9 + random() * 10 : 14 + random() * 36
  const depth = kind < 0.3 ? 9 + random() * 10 : 14 + random() * 34
  const height = kind > 0.9 ? 190 + random() * 110 : 22 + Math.pow(random(), 1.5) * 170
  const clearance = 48 + Math.max(width, depth) * 0.85
  if (nearestTrackPoint(new THREE.Vector3(x, 0, z)).distance <= clearance) continue
  const rot = random() * Math.PI
  addTower(x, z, width, depth, height, rot)
  if (height > 70 && random() > 0.45) addTower(x, z, width * 0.62, depth * 0.62, height * 0.22, rot, height - 2) // setback crown
  if (random() > 0.25) {
    const count = Math.min(5, Math.max(1, Math.floor(height / 36)))
    for (let j = 0; j < count; j++) {
      windowBars[Math.floor(random() * 3)].push({ x: x + (random() - 0.5) * width * 0.62, y: 4 + j * (height / (count + 1)), z: z + depth / 2 + 0.08, width: width * (0.18 + random() * 0.5), rotation: random() * 0.1 })
    }
  }
}
// Distant skyline layers: three rings that fade into the fog for atmospheric depth.
for (let ring = 0; ring < 3; ring++) {
  for (let i = 0; i < 150; i++) {
    const angle = random() * Math.PI * 2
    const radius = 500 + ring * 420 + random() * 280
    addTower(Math.cos(angle) * radius, Math.sin(angle) * radius, 22 + random() * 60, 22 + random() * 55, 70 + random() * (150 + ring * 90), random() * Math.PI)
  }
}
const towerInstances = new THREE.InstancedMesh(buildingGeo, buildingMat, towers.length)
towerInstances.receiveShadow = true
towerInstances.frustumCulled = false
const dummy = new THREE.Object3D()
const tintCol = new THREE.Color()
towers.forEach((tower, i) => {
  dummy.position.set(tower.x, tower.y0 + tower.height / 2 - 2, tower.z)
  dummy.rotation.y = tower.rotation
  dummy.scale.set(tower.width, tower.height, tower.depth)
  dummy.updateMatrix()
  towerInstances.setMatrixAt(i, dummy.matrix)
  towerInstances.setColorAt(i, tintCol.setHSL(0.6 + random() * 0.12, 0.35, 0.06 + random() * 0.07))
})
towerInstances.instanceMatrix.needsUpdate = true
towerInstances.instanceColor.needsUpdate = true
city.add(towerInstances)
for (let m = 0; m < windowBars.length; m++) {
  const bars = windowBars[m]
  if (bars.length === 0) continue
  const instances = new THREE.InstancedMesh(buildingGeo, [cyanWindows, amberWindows, magentaWindows][m], bars.length)
  bars.forEach((bar, i) => {
    dummy.position.set(bar.x, bar.y, bar.z)
    dummy.rotation.set(0, bar.rotation, 0)
    dummy.scale.set(bar.width, 1.2, 0.18)
    dummy.updateMatrix()
    instances.setMatrixAt(i, dummy.matrix)
  })
  instances.instanceMatrix.needsUpdate = true
  city.add(instances)
}

// Large readable billboards: 6 shared canvas textures/materials, 18 boards on posts.
const billboardMats = [
  ['NIGHT RUN', 'NEON DISTRICT // 08'], ['ESCAPE VELOCITY', 'NO LIMITS AFTER DARK'], ['NITRO 390', 'RACE THE LIGHTS'],
  ['APEX RUSH', 'TURN THE CITY ON'], ['NEON DRIFT', 'ZERO TO INFINITE'], ['KEEP YOUR LINE', 'NIGHT CITY']
].map(([title, subtitle], i) => {
  const canvas = document.createElement('canvas')
  canvas.width = 1024; canvas.height = 340
  const ctx = canvas.getContext('2d')
  const accent = i % 2 ? '#ff2d9a' : '#00e5ff'
  ctx.fillStyle = '#070b1a'; ctx.fillRect(0, 0, 1024, 340)
  ctx.fillStyle = accent + '33'; ctx.fillRect(0, 0, 1024, 340)
  ctx.strokeStyle = accent; ctx.lineWidth = 14; ctx.strokeRect(10, 10, 1004, 320)
  ctx.textBaseline = 'middle'
  let size = 130; ctx.font = `900 ${size}px Orbitron, Impact, 'Arial Black', sans-serif`
  while (ctx.measureText(title).width > 940 && size > 50) { size -= 6; ctx.font = `900 ${size}px Orbitron, Impact, 'Arial Black', sans-serif` }
  ctx.fillStyle = '#ffffff'; ctx.fillText(title, 40, 125)
  ctx.fillStyle = accent; ctx.font = "800 54px Orbitron, 'Arial Black', sans-serif"; ctx.fillText(subtitle, 44, 255)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false, fog: false })
})
const frameMats = [neonMat('#00dfff', 1.6), neonMat('#ff168f', 1.6)]
const boardPostGeo = new THREE.CylinderGeometry(0.35, 0.5, 1, 6)
const boardFrameGeo = new THREE.BoxGeometry(1, 0.32, 0.32)
const boardGeo = new THREE.PlaneGeometry(1, 1)
for (let i = 0; i < 18; i++) {
  const index = Math.floor((i + 0.5) / 18 * sampleCount)
  const p = trackPoints[index], n = trackNormals[index]
  const side = i % 2 ? -1 : 1
  const boardW = 30, boardH = 10
  const bx = p.x + n.x * side * 36, bz = p.z + n.z * side * 36, by = p.y + 17 + (i % 3) * 3
  const board = new THREE.Mesh(boardGeo, billboardMats[i % billboardMats.length])
  board.scale.set(boardW, boardH, 1)
  board.position.set(bx, by, bz)
  board.rotation.y = Math.atan2(-side * n.x, -side * n.z)
  city.add(board)
  const frame = new THREE.Mesh(boardFrameGeo, frameMats[i % 2])
  frame.scale.x = boardW + 1
  frame.position.set(bx, by - boardH / 2 - 0.2, bz)
  frame.rotation.y = board.rotation.y
  city.add(frame)
  const post = new THREE.Mesh(boardPostGeo, pierMat)
  post.scale.y = by - boardH / 2 + 2.4
  post.position.set(bx, (by - boardH / 2 - 2.4) / 2, bz)
  city.add(post)
}

// Distant stars and a low-contrast city haze halo.
const starPositions = []
for (let i = 0; i < 900; i++) {
  const angle = random() * Math.PI * 2
  const radius = 700 + random() * 2600
  starPositions.push(Math.cos(angle) * radius, 150 + random() * 950, Math.sin(angle) * radius)
}
const starGeometry = new THREE.BufferGeometry()
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: '#a3c9ff', size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.72 })))

// ── SUPERCAR MODEL ───────────────────────────────────────────────────
// Dark metallic supercar with cyan and magenta accent lighting.
const car = new THREE.Group()
scene.add(car)

// Materials palette
const bodyMat = new THREE.MeshPhysicalMaterial({ color: '#1a1e2e', metalness: 0.92, roughness: 0.18, clearcoat: 1.0, clearcoatRoughness: 0.08 })
const accentCyan = new THREE.MeshStandardMaterial({ color: '#00dfff', emissive: '#00dfff', emissiveIntensity: 1.2, metalness: 0.4, roughness: 0.3 })
const accentMagenta = new THREE.MeshStandardMaterial({ color: '#ff168f', emissive: '#ff168f', emissiveIntensity: 1.2, metalness: 0.4, roughness: 0.3 })
const carbonMat = new THREE.MeshStandardMaterial({ color: '#080d18', metalness: 0.68, roughness: 0.3 })
const glassMat = new THREE.MeshPhysicalMaterial({ color: '#061522', metalness: 0.55, roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.92 })
const rubberMat = new THREE.MeshStandardMaterial({ color: '#05070c', roughness: 0.83 })
const rimMat = new THREE.MeshStandardMaterial({ color: '#9aa9c0', metalness: 0.92, roughness: 0.22 })
const darkMetalMat = new THREE.MeshStandardMaterial({ color: '#252d3e', metalness: 0.88, roughness: 0.28 })
const headlightMat = new THREE.MeshBasicMaterial({ color: '#b9fbff', toneMapped: false })
const taillightMat = new THREE.MeshBasicMaterial({ color: '#ff1744', toneMapped: false })
const taillightGlowMat = new THREE.MeshStandardMaterial({ color: '#ff0033', emissive: '#ff0033', emissiveIntensity: 3.0, roughness: 0.4 })
const underglowMat = new THREE.MeshBasicMaterial({ color: '#ff168f', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })

function carPart(geometry, material, position, scale, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...position)
  if (scale) mesh.scale.set(...scale)
  if (rotation) mesh.rotation.set(...rotation)
  mesh.castShadow = true
  mesh.receiveShadow = false // avoids self-shadow acne/shimmer on the body
  car.add(mesh)
  return mesh
}

// ─── BODY SHELL ──────────────────────────────────────────
// Main central body – wide and low
carPart(new THREE.BoxGeometry(2.04, 0.36, 4.50), bodyMat, [0, 0.66, 0])
// Nose taper — narrowing front section
carPart(new THREE.BoxGeometry(1.82, 0.22, 1.40), bodyMat, [0, 0.82, -1.50])
// Nose tip — low sculpted front
carPart(new THREE.BoxGeometry(1.60, 0.14, 0.60), bodyMat, [0, 0.73, -2.30])
// Rear haunches — wider at back
carPart(new THREE.BoxGeometry(2.12, 0.28, 1.20), bodyMat, [0, 0.78, 1.40])
// Rear deck — raised lip
carPart(new THREE.BoxGeometry(1.90, 0.12, 0.50), bodyMat, [0, 0.94, 1.80])

// ─── FRONT SPLITTER AND AERO ─────────────────────────────
carPart(new THREE.BoxGeometry(2.24, 0.08, 0.38), carbonMat, [0, 0.44, -2.35])
// Front lip — cyan accent line
carPart(new THREE.BoxGeometry(2.0, 0.04, 0.06), accentCyan, [0, 0.45, -2.55])

// ─── SIDE SKIRTS ─────────────────────────────────────────
for (const x of [-1, 1]) {
  carPart(new THREE.BoxGeometry(0.10, 0.18, 3.60), carbonMat, [x * 1.01, 0.47, -0.10])
  // Cyan accent stripe along the side
  carPart(new THREE.BoxGeometry(0.04, 0.06, 2.80), accentCyan, [x * 1.04, 0.55, -0.10])
}

// ─── REAR DIFFUSER ───────────────────────────────────────
carPart(new THREE.BoxGeometry(2.04, 0.10, 0.44), carbonMat, [0, 0.44, 2.30])
// Diffuser fins
for (const x of [-0.52, 0, 0.52]) {
  carPart(new THREE.BoxGeometry(0.04, 0.08, 0.40), darkMetalMat, [x, 0.44, 2.30])
}

// ─── FENDER FLARES / WHEEL ARCHES ────────────────────────
for (const x of [-1, 1]) {
  // Front fender bulge
  carPart(new THREE.BoxGeometry(0.22, 0.26, 0.90), bodyMat, [x * 0.96, 0.68, -1.35])
  // Rear fender bulge — wider
  carPart(new THREE.BoxGeometry(0.26, 0.28, 0.95), bodyMat, [x * 0.98, 0.68, 1.35])
  // Fender vent slats
  carPart(new THREE.BoxGeometry(0.06, 0.10, 0.30), accentCyan, [x * 1.06, 0.72, -0.70])
}

// ─── WINDSHIELD / CANOPY ─────────────────────────────────
const canopyGeometry = new THREE.BufferGeometry()
const canopyVertices = new Float32Array([
  // Windshield face
  -0.76, 0.90, -1.10,   0.76, 0.90, -1.10,   -0.56, 1.50, -0.30,   0.56, 1.50, -0.30,
  // Roof panel
  -0.56, 1.50, -0.30,   0.56, 1.50, -0.30,   -0.62, 1.44, 0.60,   0.62, 1.44, 0.60,
  // Left side glass
  -0.76, 0.90, -1.10,  -0.56, 1.50, -0.30,  -0.62, 1.44, 0.60,  -0.88, 0.90, 0.80,
  // Right side glass
   0.76, 0.90, -1.10,   0.88, 0.90, 0.80,    0.62, 1.44, 0.60,   0.56, 1.50, -0.30,
  // Rear glass
  -0.88, 0.90, 0.80,   -0.62, 1.44, 0.60,    0.62, 1.44, 0.60,   0.88, 0.90, 0.80
])
const canopyIndices = [0,1,2,1,3,2, 4,5,6,5,7,6, 8,9,10,8,10,11, 12,13,14,12,14,15, 16,17,18,16,18,19]
canopyGeometry.setAttribute('position', new THREE.BufferAttribute(canopyVertices, 3))
canopyGeometry.setIndex(canopyIndices)
canopyGeometry.computeVertexNormals()
carPart(canopyGeometry, glassMat, [0, 0, 0])

// Windshield frame
carPart(new THREE.BoxGeometry(1.56, 0.06, 0.08), darkMetalMat, [0, 0.91, -1.10])
// Roof spine
carPart(new THREE.BoxGeometry(0.06, 0.04, 1.30), darkMetalMat, [0, 1.50, 0.08])
// Rear glass frame
carPart(new THREE.BoxGeometry(1.80, 0.06, 0.08), carbonMat, [0, 1.34, 0.72])

// ─── REAR WING ───────────────────────────────────────────
// Wing mounts — two pylons
for (const x of [-0.60, 0.60]) {
  carPart(new THREE.BoxGeometry(0.08, 0.32, 0.08), carbonMat, [x, 1.06, 1.90])
}
// Wing blade — wide and thin
carPart(new THREE.BoxGeometry(2.20, 0.08, 0.36), carbonMat, [0, 1.24, 1.90], null, [-0.06, 0, 0])
// Wing endplates
for (const x of [-1, 1]) {
  carPart(new THREE.BoxGeometry(0.04, 0.14, 0.38), carbonMat, [x * 1.10, 1.22, 1.90])
}
// Wing accent — magenta glow strip
carPart(new THREE.BoxGeometry(1.90, 0.03, 0.06), accentMagenta, [0, 1.18, 2.08])

// ─── WHEELS (4x) ─────────────────────────────────────────
const wheelMeshes = []
const wheelPositions = [
  [-0.94, 0.39, -1.40],
  [ 0.94, 0.39, -1.40],
  [-0.94, 0.39,  1.40],
  [ 0.94, 0.39,  1.40]
]
for (const [wx, wy, wz] of wheelPositions) {
  // Tire
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.26, 28), rubberMat)
  wheel.rotation.z = Math.PI / 2
  wheel.position.set(wx, wy, wz)
  wheel.castShadow = true
  car.add(wheel)
  wheelMeshes.push(wheel)
  // Rim
  const sideSign = Math.sign(wx)
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.27, 24), rimMat)
  rim.rotation.z = Math.PI / 2
  rim.position.set(wx + sideSign * 0.01, wy, wz)
  car.add(rim)
  // Hub
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 16), darkMetalMat)
  hub.rotation.z = Math.PI / 2
  hub.position.set(wx + sideSign * 0.02, wy, wz)
  car.add(hub)
  // 5 spokes
  for (let spoke = 0; spoke < 5; spoke++) {
    const angle = spoke * Math.PI * 2 / 5
    const spokeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.30, 0.04), rimMat)
    spokeMesh.position.set(wx + sideSign * 0.025, wy + Math.sin(angle) * 0.12, wz + Math.cos(angle) * 0.12)
    spokeMesh.rotation.x = -angle
    car.add(spokeMesh)
  }
  // Brake caliper accent — tiny cyan block visible through spokes
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, 0.14), accentCyan)
  caliper.position.set(wx + sideSign * 0.015, wy - 0.08, wz)
  car.add(caliper)
}
const wheelMeshesForSpin = wheelMeshes

// ─── HEADLIGHTS ──────────────────────────────────────────
// Dual thin DRL-style headlights — cyan signature
carPart(new THREE.BoxGeometry(0.58, 0.08, 0.05), headlightMat, [-0.52, 0.77, -2.55])
carPart(new THREE.BoxGeometry(0.58, 0.08, 0.05), headlightMat, [ 0.52, 0.77, -2.55])
// Lower headlight accent bars
carPart(new THREE.BoxGeometry(0.40, 0.04, 0.04), accentCyan, [-0.52, 0.70, -2.56])
carPart(new THREE.BoxGeometry(0.40, 0.04, 0.04), accentCyan, [ 0.52, 0.70, -2.56])
// Headlight point light for forward illumination
const headlightGlow = new THREE.PointLight(0x9ef5ff, 12, 25)
headlightGlow.position.set(0, 0.76, -3.0)
car.add(headlightGlow)

// ─── TAILLIGHTS ──────────────────────────────────────────
// Full-width LED tail strip — bright red
carPart(new THREE.BoxGeometry(1.70, 0.08, 0.05), taillightMat, [0, 0.84, 2.32])
// Additional tail glow strips for LED effect
carPart(new THREE.BoxGeometry(0.60, 0.04, 0.04), taillightGlowMat, [-0.42, 0.90, 2.33])
carPart(new THREE.BoxGeometry(0.60, 0.04, 0.04), taillightGlowMat, [ 0.42, 0.90, 2.33])
// Tail light point glow
const tailGlow = new THREE.PointLight(0xff1744, 8, 12)
tailGlow.position.set(0, 0.84, 2.8)
car.add(tailGlow)

// ─── FRONT GRILLE VENTS ──────────────────────────────────
for (const x of [-0.55, -0.28, 0, 0.28, 0.55]) {
  carPart(new THREE.BoxGeometry(0.14, 0.04, 0.04), carbonMat, [x, 0.50, -2.50])
}

// ─── SIDE MARKERS ────────────────────────────────────────
for (const x of [-1, 1]) {
  carPart(new THREE.BoxGeometry(0.06, 0.04, 0.28), accentCyan, [x * 1.04, 0.62, -0.50])
}

// ─── UNDERBODY NEON ──────────────────────────────────────
carPart(new THREE.PlaneGeometry(1.8, 3.80), underglowMat, [0, 0.38, 0], null, [-Math.PI / 2, 0, 0])

// ─── SKID MARKS ──────────────────────────────────────────
const skidMarks = []
for (let i = 0; i < 2; i++) {
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 4), new THREE.MeshBasicMaterial({ color: '#15141b', transparent: true, opacity: 0.65, depthWrite: false }))
  mark.rotation.x = -Math.PI / 2
  mark.visible = false
  scene.add(mark)
  skidMarks.push(mark)
}

// ── INITIAL POSITION AND CONTROLS ────────────────────────────────────
const startPoint = centerline.getPointAt(0.015)
const startTangent = centerline.getTangentAt(0.015)
car.position.set(startPoint.x, startPoint.y + 0.03, startPoint.z)
let heading = Math.atan2(startTangent.x, startTangent.z)
car.rotation.y = heading

const keys = {}
addEventListener('keydown', e => {
  keys[e.code] = true
  keys[e.key.toLowerCase()] = true
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
})
addEventListener('keyup', e => {
  keys[e.code] = false
  keys[e.key.toLowerCase()] = false
})
addEventListener('blur', () => { for (const key of Object.keys(keys)) keys[key] = false })

let speed = 0
let lap = 1
let lastT = 0.015
let raceStarted = false
let finished = false
let handbrakeWasDown = false
let raceStartMs = 0, topKmh = 0
const clock = new THREE.Timer()
const cameraTarget = new THREE.Vector3()
const cameraPos = new THREE.Vector3()
cameraPos.set(
  car.position.x - Math.sin(heading) * 8,
  car.position.y + 4.3,
  car.position.z - Math.cos(heading) * 8
)
camera.position.copy(cameraPos)
camera.lookAt(car.position.x, car.position.y + 0.8, car.position.z)
const speedEl = document.querySelector('#speed')
const speedFill = document.querySelector('#speed-fill')
const lapEl = document.querySelector('#lap')
const lapProgress = document.querySelector('#lap-progress')
const message = document.querySelector('#message')
const statusEl = document.querySelector('#race-status')

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }

// ── ROAD PROJECTION ──────────────────────────────────────────────────
// Exact position on the centerline polyline: nearest *segment* (not nearest sample) near the last
// known index, so lateral offset, height and tangent are continuous around the whole closed loop.
const proj = { index: 0, t: 0, lateral: 0, distance: 0, y: 0, tx: 0, tz: 1, nx: 1, nz: 0, slope: 0, tangent: new THREE.Vector3() }
let projHint = nearestTrackPoint(car.position).index
function projectToTrack(x, z) {
  const N = sampleCount
  let best = projHint, bs = Infinity
  for (let k = -20; k <= 20; k++) {
    const i = (projHint + k + N) % N, q = trackPoints[i]
    const d = (x - q.x) ** 2 + (z - q.z) ** 2
    if (d < bs) { bs = d; best = i }
  }
  if (bs > 1600) best = nearestTrackPoint({ x, y: car.position.y, z }).index // lost the track → global search
  let bi = best, bu = 0, bd = Infinity
  for (const i of [(best - 1 + N) % N, best]) {
    const a = trackPoints[i], b = trackPoints[(i + 1) % N]
    const abx = b.x - a.x, abz = b.z - a.z
    const u = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz), 0, 1)
    const d = (x - a.x - abx * u) ** 2 + (z - a.z - abz * u) ** 2
    if (d < bd) { bd = d; bi = i; bu = u }
  }
  const j = (bi + 1) % N, a = trackPoints[bi], b = trackPoints[j], ta = trackTangents[bi], tb = trackTangents[j]
  let tx = ta.x + (tb.x - ta.x) * bu, tz = ta.z + (tb.z - ta.z) * bu
  const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl
  const nx = -tz, nz = tx
  proj.lateral = (x - (a.x + (b.x - a.x) * bu)) * nx + (z - (a.z + (b.z - a.z) * bu)) * nz
  proj.y = a.y + (b.y - a.y) * bu
  proj.slope = (b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z)
  proj.tx = tx; proj.tz = tz; proj.nx = nx; proj.nz = nz
  proj.index = bi; proj.t = ((bi + bu) / N) % 1; proj.distance = Math.abs(proj.lateral)
  proj.tangent.set(tx, proj.slope, tz)
  projHint = bi
  return proj
}

// ── ARCADE PHYSICS ───────────────────────────────────────────────────
// Velocity is a world vector (vx, vz) split each step into forward/lateral parts relative to the
// heading: lateral grip bleeds the sideways part (planted car); the handbrake drops grip so the
// car slides, and grip then recovers gradually. Fixed ≤1/90 s sub-steps keep it frame-rate stable.
const MAX_SPEED = 112, REV_SPEED = 19
let vx = 0, vz = 0, steerSm = 0, yawRate = 0, grip = 8.5, slip = 0, impact = 0
function stepPhysics(h, inp) {
  let fx = Math.sin(heading), fz = Math.cos(heading)
  steerSm += (inp.steer - steerSm) * (1 - Math.exp(-8 * h))
  const vf0 = vx * fx + vz * fz
  const maxYaw = 2.81 / (1 + Math.abs(vf0) / 28) // steering gets less sensitive with speed
  yawRate = steerSm * maxYaw * Math.min(1, Math.abs(vf0) / 7) * Math.sign(vf0 || 1) * (inp.handbrake ? 1.3 : 1)
  heading += yawRate * h
  fx = Math.sin(heading); fz = Math.cos(heading)
  const rx = fz, rz = -fx
  let vf = vx * fx + vz * fz, vl = vx * rx + vz * rz
  if (inp.finished) vf *= Math.exp(-3 * h)
  else {
    if (inp.forward) vf += (vf < 0 ? 62 : 46 * Math.max(0, 1 - (vf / 114) ** 2)) * h
    if (inp.reverse) vf -= (vf > 0.5 ? 62 : 34) * h
    if (!inp.forward && !inp.reverse) vf *= Math.exp(-0.65 * h)
    if (inp.handbrake) vf *= Math.exp(-0.5 * h)
  }
  vf = clamp(vf, -REV_SPEED, MAX_SPEED)
  const gripTarget = inp.handbrake ? 2.6 : 8.5 // rear grip drops under handbrake, then recovers gradually
  grip += (gripTarget - grip) * (1 - Math.exp(-(inp.handbrake ? 14 : 1.8) * h))
  vl *= Math.exp(-grip * h)
  vf *= Math.exp(-0.015 * Math.min(Math.abs(vl), 25) * h) // sliding scrubs speed
  vx = vf * fx + vl * rx; vz = vf * fz + vl * rz
  slip = Math.abs(vf) > 5 ? clamp(Math.abs(vl) / 12, 0, 1) : 0

  car.position.x += vx * h; car.position.z += vz * h
  const pr = projectToTrack(car.position.x, car.position.z)
  // Wall limit accounts for the car's yawed footprint (half-width 0.95, half-length 2.2) so corners
  // never poke through the guardrail (inner rail face is at halfRoad + 1.5).
  const limit = halfRoad + 1.4 - (0.95 * Math.abs(fx * pr.tx + fz * pr.tz) + 2.2 * Math.abs(fx * pr.nx + fz * pr.nz))
  const over = Math.abs(pr.lateral) - limit
  if (over > 0) {
    const sg = Math.sign(pr.lateral), ox = pr.nx * sg, oz = pr.nz * sg // outward wall normal
    car.position.x -= ox * over; car.position.z -= oz * over; pr.lateral -= sg * over // minimal push-out
    const vn = vx * ox + vz * oz
    if (vn > 0) {
      vx -= 1.2 * vn * ox; vz -= 1.2 * vn * oz // soft bounce
      const k = 1 - Math.min(0.35, vn * 0.012); vx *= k; vz *= k // wall scrape
      const dirAngle = Math.atan2(pr.tx, pr.tz) + ((vx * pr.tx + vz * pr.tz) >= 0 ? 0 : Math.PI)
      heading += Math.atan2(Math.sin(dirAngle - heading), Math.cos(dirAngle - heading)) * Math.min(0.5, vn * 0.03) // slide along the wall
      impact = Math.max(impact, vn)
    }
  }
  car.position.y = pr.y + 0.03 // exact road height: no lag through climbs/crests
  speed = vx * Math.sin(heading) + vz * Math.cos(heading)
}
let camAng = heading
const lightOffset = new THREE.Vector3(-80, 150, 45), snapV = new THREE.Vector3()
const lightDir = lightOffset.clone().normalize()
const lightRight = new THREE.Vector3(0, 1, 0).cross(lightDir).normalize(), lightUp = lightDir.clone().cross(lightRight).normalize()
let tailLevel = 0 // smoothed brake-light level (was a hard 8↔18 intensity jump = visible flash)

// ── ANIMATION LOOP ───────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate)
  clock.update()
  const dt = Math.min(clock.getDelta(), 0.035)

  // Key inputs — Boolean() prevents NaN from Number(undefined)
  const forward = Boolean(keys.KeyW || keys.w || keys.ArrowUp)
  const reverse = Boolean(keys.KeyS || keys.s || keys.ArrowDown)
  const left = Boolean(keys.KeyA || keys.a || keys.ArrowLeft)
  const right = Boolean(keys.KeyD || keys.d || keys.ArrowRight)
  const handbrake = Boolean(keys.Space)
  if (forward || reverse) { if (!raceStarted) raceStartMs = performance.now(); raceStarted = true }

  // ── PHYSICS ──────────────────────────────────────────────
  const steer = Number(left) - Number(right) // + = left (heading increases)
  const inp = { forward, reverse, handbrake, steer, finished }
  const sub = Math.max(1, Math.ceil(dt / (1 / 90)))
  impact = 0
  for (let n = 0; n < sub; n++) stepPhysics(dt / sub, inp)
  const grounded = proj
  car.rotation.y = heading
  const along = grounded.tx * Math.sin(heading) + grounded.tz * Math.cos(heading)
  car.rotation.z = THREE.MathUtils.damp(car.rotation.z, clamp(yawRate * speed * 0.0014, -0.07, 0.07), 7, dt) // body roll
  car.rotation.x = THREE.MathUtils.damp(car.rotation.x, -Math.atan(grounded.slope * Math.sign(along || 1)), 8, dt)
  for (const wheel of wheelMeshesForSpin) wheel.rotation.x -= speed * dt * 1.8
  const totalSpeed = Math.hypot(vx, vz)
  if (impact > 3) playCollision(impact)
  // Simple 5-gear rpm model for the engine note
  const gearTop = [26, 48, 70, 92, 112]; const g = gearTop.findIndex(v => Math.abs(speed) <= v), lo = g > 0 ? gearTop[g - 1] : 0
  const rpm = clamp(0.2 + 0.8 * (Math.abs(speed) - lo) / (gearTop[Math.max(g, 0)] - lo), 0, 1)
  updateAudio({ rpm, load: forward ? 1 : 0.15, speed01: totalSpeed / MAX_SPEED, slip: slip * (grip < 6 || slip > 0.5 ? 1 : 0.6), brake: (reverse && speed > 5) || handbrake ? 1 : 0 })

  // ── LAP COUNTING ─────────────────────────────────────────
  if (grounded.distance < 30) {
    if (lastT > 0.82 && grounded.t < 0.18 && speed > 1.5 && !finished) {
      lap += 1
      lapEl.textContent = String(Math.min(lap, 3)).padStart(2, '0')
      if (lap > 3) {
        finished = true
        statusEl.textContent = 'FINISH // RUN COMPLETE'
        message.textContent = 'CITY CONQUERED // RUN COMPLETE'
        message.classList.remove('visible')
        showFinish({ time: (performance.now() - raceStartMs) / 1000, topKmh })
      }
    }
    if (grounded.t > 0.18 || grounded.t < lastT) lastT = grounded.t
    else lastT = grounded.t
  }
  lapProgress.style.width = `${Math.round(grounded.t * 100)}%`

  // ── HUD UPDATE ───────────────────────────────────────────
  const speedKmh = Math.round(totalSpeed * 3.6)
  topKmh = Math.max(topKmh, speedKmh)
  speedEl.textContent = String(speedKmh).padStart(3, '0')
  speedFill.style.width = `${Math.min(100, speedKmh / 4.5)}%`
  if (raceStarted && !finished) {
    statusEl.textContent = speedKmh > 320 ? 'MAX VELOCITY' : 'NIGHT RUN // IN PROGRESS'
    message.classList.toggle('visible', speedKmh < 3)
  }

  // The model was authored nose-toward -Z, but the game drives toward +Z: rotate it once so the nose leads.
{ const body = new THREE.Group(); body.rotation.y = Math.PI; for (const c of [...car.children]) body.add(c); car.add(body) }
car.rotation.order = 'YXZ' // heading first, then pitch/roll in the car's own frame (was world-axis pitch)

// ── SKID MARKS ───────────────────────────────────────────
  const justHandbraked = handbrake && !handbrakeWasDown && totalSpeed > 18
  if (justHandbraked) {
    const rear = new THREE.Vector3(0, 0, -2.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).add(car.position)
    for (let i = 0; i < skidMarks.length; i++) {
      skidMarks[i].visible = true
      skidMarks[i].position.set(rear.x + (i ? 0.8 : -0.8) * Math.cos(heading), car.position.y + 0.16, rear.z - (i ? 0.8 : -0.8) * Math.sin(heading))
      skidMarks[i].rotation.z = -heading
    }
  }
  if (!handbrake) skidMarks.forEach(mark => { mark.visible = false })
  handbrakeWasDown = handbrake

  // ── CHASE CAMERA ─────────────────────────────────────────
  // The camera's *angle* smooths toward the car heading (softer at speed, swings out in drifts);
  // its position stays locked to the car, so it never falls behind or dips into the road.
  const sp = clamp(totalSpeed / MAX_SPEED, 0, 1)
  camAng += Math.atan2(Math.sin(heading - camAng), Math.cos(heading - camAng)) * (1 - Math.exp(-(6 - 2.5 * sp) * dt))
  const camDist = 8.5 + sp * 1.0, camHeight = 4.3 + sp * 0.6
  cameraPos.set(car.position.x - Math.sin(camAng) * camDist, car.position.y + camHeight, car.position.z - Math.cos(camAng) * camDist)
  camera.position.copy(cameraPos)
  cameraTarget.set(car.position.x + Math.sin(camAng) * 3, car.position.y + 0.9, car.position.z + Math.cos(camAng) * 3)
  camera.lookAt(cameraTarget)
  camera.fov = THREE.MathUtils.damp(camera.fov, 66 + sp * 11, 2.8, dt)
  camera.updateProjectionMatrix()

  // Shadow camera follows the car, snapped to whole shadow-map texels in light space so edges don't crawl.
  snapV.copy(car.position)
  const sa = snapV.dot(lightRight), sb = snapV.dot(lightUp), texel = 90 / 1024
  snapV.addScaledVector(lightRight, Math.round(sa / texel) * texel - sa).addScaledVector(lightUp, Math.round(sb / texel) * texel - sb)
  moon.target.position.copy(snapV); moon.position.copy(snapV).add(lightOffset)
  sky.position.copy(camera.position)

  // ── FOLLOW LIGHTS ────────────────────────────────────────
  cyanFill.position.set(car.position.x + 18, car.position.y + 16, car.position.z - 22)
  pinkFill.position.set(car.position.x - 22, car.position.y + 13, car.position.z + 26)

  // ── TAILLIGHT INTENSITY — brighter when braking ─────────
  const braking = reverse || handbrake
  tailLevel += ((braking ? 1 : 0) - tailLevel) * (1 - Math.exp(-14 * dt))
  tailGlow.intensity = 8 + tailLevel * 8
  taillightGlowMat.emissiveIntensity = 3 + tailLevel * 1.8

  renderer.render(scene, camera)
}
if (import.meta.env.DEV) window.__ev = { scene, city, roadGroup, THREE, trackPoints, trackTangents, sampleCount, halfRoad, car, proj, camera, stepPhysics, projectToTrack, get state() { return { speed, vx, vz, heading, grip, slip, impact } }, set(x, z, h, v) { car.position.set(x, 0, z); heading = h; vx = Math.sin(h) * v; vz = Math.cos(h) * v; projHint = nearestTrackPoint(car.position).index; projectToTrack(x, z) } }
animate()

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
