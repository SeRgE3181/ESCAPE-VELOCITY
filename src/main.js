import './style.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

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
renderer.toneMappingExposure = 1.2
renderer.outputColorSpace = THREE.SRGBColorSpace
document.querySelector('#game').prepend(renderer.domElement)

// Small studio environment: gives the metallic car something to reflect (without it metals render black).
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environment = envTex
scene.environmentIntensity = 0.16

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
  for (let i = 0; i < 7; i++) { x.fillStyle = `rgba(30,32,46,${0.1 + Math.random() * 0.1})`; x.fillRect(Math.random() * 400, Math.random() * 500, 60 + Math.random() * 140, 14 + Math.random() * 40) }
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
const asphalt = new THREE.MeshStandardMaterial({ color: '#8c91a8', map: roadMap, roughnessMap: roadRough, roughness: 0.85, metalness: 0.2 })
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
    for (let offset = 13; offset <= 65; offset += 13) {
      const ceiling = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 8, 0.5, 2.5), frameMat)
      ceiling.position.set(0, 8.8, -offset)
      group.add(ceiling)
      const light = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 0.45), lampEmissive)
      light.position.set(0, 8.5, -offset)
      group.add(light)
    }
    const shell = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 8, 9.5, 70), new THREE.MeshStandardMaterial({ color: '#111627', side: THREE.BackSide, roughness: 0.78 }))
    shell.position.set(0, 4.6, -35)
    group.add(shell)
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
  const boardW = 26, boardH = 9
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
// Low-poly lofted supercar. Local +Z is the nose, +Y up, wheels sit on y = 0.
// The root `car` group is placed/oriented by the game loop; everything below is local.
const car = new THREE.Group()
scene.add(car)
const model = new THREE.Group()
car.add(model)

const bodyMat = new THREE.MeshPhysicalMaterial({ color: '#10162a', metalness: 0.7, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, envMap: envTex, envMapIntensity: 0.4, flatShading: true, side: THREE.DoubleSide })
const glassMat = new THREE.MeshPhysicalMaterial({ color: '#07182a', metalness: 0.6, roughness: 0.08, clearcoat: 1, envMap: envTex, envMapIntensity: 0.7, flatShading: true, side: THREE.DoubleSide })
const carbonMat = new THREE.MeshStandardMaterial({ color: '#0a0e18', metalness: 0.5, roughness: 0.42 })
const accentCyan = new THREE.MeshBasicMaterial({ color: '#19e6ff', toneMapped: false })
const accentMagenta = new THREE.MeshBasicMaterial({ color: '#ff2d9a', toneMapped: false })
const rubberMat = new THREE.MeshStandardMaterial({ color: '#07090e', roughness: 0.9 })
const rimMat = new THREE.MeshStandardMaterial({ color: '#c3cde0', metalness: 0.85, roughness: 0.25, envMap: envTex })
const rimDarkMat = new THREE.MeshStandardMaterial({ color: '#0d111c', metalness: 0.6, roughness: 0.4 })
const headlightMat = new THREE.MeshBasicMaterial({ color: '#eaffff', toneMapped: false })
const taillightMat = new THREE.MeshBasicMaterial({ color: '#ff1330', toneMapped: false })

// Loft cross-sections (8-point rings) along Z into a flat-shaded low-poly shell.
function loft(stations, material) {
  const ring = (w, yb, yt) => { const h = yt - yb; return [[-w * 0.82, yb], [w * 0.82, yb], [w, yb + h * 0.3], [w * 0.93, yb + h * 0.72], [w * 0.55, yt], [-w * 0.55, yt], [-w * 0.93, yb + h * 0.72], [-w, yb + h * 0.3]] }
  const pos = [], idx = []
  for (const [z, w, yb, yt] of stations) for (const [x, y] of ring(w, yb, yt)) pos.push(x, y, z)
  const n = stations.length
  for (let st = 0; st < n - 1; st++) for (let k = 0; k < 8; k++) {
    const a = st * 8 + k, b = st * 8 + (k + 1) % 8, c = (st + 1) * 8 + k, d = (st + 1) * 8 + (k + 1) % 8
    idx.push(a, c, b, b, c, d)
  }
  for (const [st, flip] of [[0, 1], [n - 1, 0]]) { // end caps
    const [z, , yb, yt] = stations[st]; const c = pos.length / 3
    pos.push(0, (yb + yt) / 2, z)
    for (let k = 0; k < 8; k++) idx.push(c, st * 8 + k, st * 8 + (k + 1) % 8)
    if (flip) idx.splice(idx.length - 24, 24, ...Array.from({ length: 8 }, (_, k) => [c, st * 8 + (k + 1) % 8, st * 8 + k]).flat())
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx)
  const flat = g.toNonIndexed(); flat.computeVertexNormals()
  const mesh = new THREE.Mesh(flat, material); model.add(mesh); return mesh
}
function part(geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); model.add(m); return m
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)

// Main shell (z, halfWidth, yBottom, yTop): rear → nose, with wide rear haunches and a low sloped nose.
loft([[-2.25, 0.85, 0.35, 0.85], [-1.6, 1.02, 0.30, 1.0], [-0.6, 1.0, 0.28, 0.95], [0.4, 0.96, 0.27, 0.82], [1.4, 0.94, 0.27, 0.68], [2.0, 0.82, 0.30, 0.52], [2.32, 0.6, 0.32, 0.42]], bodyMat)
// Cabin / canopy (glass), embedded into the shell.
loft([[-1.0, 0.72, 0.7, 0.97], [-0.45, 0.62, 0.7, 1.17], [0.3, 0.6, 0.7, 1.15], [1.0, 0.68, 0.7, 0.80]], glassMat)

// Side detail: sill stripes, door vents, wheel-arch lips.
for (const sd of [-1, 1]) {
  part(box(0.05, 0.04, 2.7), accentMagenta, sd * 0.93, 0.37, 0.0)
  part(box(0.04, 0.12, 0.7), carbonMat, sd * 0.99, 0.62, -0.95)
  part(box(0.04, 0.03, 0.5), accentCyan, sd * 0.995, 0.7, -0.95)
  for (const z of [-1.4, 1.4]) part(new THREE.TorusGeometry(0.45, 0.04, 4, 14, Math.PI), carbonMat, sd * 0.93, 0.37, z, 0, Math.PI / 2, 0)
  part(box(0.04, 0.02, 1.1), accentCyan, sd * 0.2, 0.775, 0.95, 0.14, 0, 0) // hood stripes
}
// Front: splitter, DRL headlights, intake.
part(box(1.75, 0.045, 0.55), carbonMat, 0, 0.26, 2.2)
part(box(1.6, 0.03, 0.05), accentCyan, 0, 0.29, 2.5)
part(box(0.9, 0.08, 0.05), carbonMat, 0, 0.4, 2.3)
for (const sd of [-1, 1]) {
  part(box(0.36, 0.07, 0.14), headlightMat, sd * 0.5, 0.52, 2.0, 0.3, 0, 0)
  part(box(0.3, 0.025, 0.1), accentCyan, sd * 0.5, 0.45, 2.1, 0.3, 0, 0)
}
// Rear: spoiler (pylons, blade, end plates), diffuser, LED taillights.
for (const sd of [-1, 1]) {
  part(box(0.07, 0.3, 0.1), carbonMat, sd * 0.55, 1.0, -2.05)
  part(box(0.05, 0.22, 0.5), carbonMat, sd * 1.0, 1.2, -2.1)
}
part(box(2.0, 0.05, 0.46), carbonMat, 0, 1.18, -2.1, -0.1, 0, 0)
part(box(1.9, 0.025, 0.04), accentMagenta, 0, 1.15, -2.33)
part(box(1.7, 0.08, 0.5), carbonMat, 0, 0.3, -2.3)
part(box(1.55, 0.075, 0.05), taillightMat, 0, 0.74, -2.27)
for (const sd of [-1, 1]) {
  part(box(0.32, 0.12, 0.05), taillightMat, sd * 0.62, 0.64, -2.27)
  part(box(0.12, 0.1, 0.08), taillightMat, sd * 0.82, 0.8, -2.2)
}

// Four wheels: each pivot holds a spin group (tire + rim + spokes); calipers stay fixed.
const wheelMeshesForSpin = []
for (const [wx, wz] of [[-0.98, 1.4], [0.98, 1.4], [-0.98, -1.4], [0.98, -1.4]]) {
  const pivot = new THREE.Group(); pivot.position.set(wx, 0.37, wz); model.add(pivot)
  const spin = new THREE.Group(); pivot.add(spin)
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.28, 20), rubberMat); tire.rotation.z = Math.PI / 2; spin.add(tire)
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.285, 12), rimDarkMat); disc.rotation.z = Math.PI / 2; spin.add(disc)
  for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(box(0.3, 0.06, 0.5), rimMat); sp.rotation.x = k * Math.PI / 3; spin.add(sp) }
  const caliper = new THREE.Mesh(box(0.06, 0.12, 0.2), accentCyan); caliper.position.set(Math.sign(wx) * 0.12, -0.12, 0.12); pivot.add(caliper)
  wheelMeshesForSpin.push(spin)
}
part(new THREE.PlaneGeometry(1.7, 3.8), new THREE.MeshBasicMaterial({ color: '#ff168f', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }), 0, 0.08, 0, -Math.PI / 2, 0, 0) // underglow
model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })

// Car lights: forward spot onto the road, soft red rear glow (brighter on brake).
const headSpot = new THREE.SpotLight(0xcfeeff, 260, 75, 0.55, 0.7, 1.6)
headSpot.position.set(0, 0.7, 2.2); headSpot.target.position.set(0, 0, 14)
car.add(headSpot, headSpot.target)
const tailGlow = new THREE.PointLight(0xff1330, 5, 11)
tailGlow.position.set(0, 0.8, -3.2)
car.add(tailGlow)
car.rotation.order = 'YXZ' // heading (Y) first, then pitch/roll in the car's own frame

// ── SKID MARKS ───────────────────────────────────────────────────────
const skidMarks = []
for (let i = 0; i < 2; i++) {
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 4), new THREE.MeshBasicMaterial({ color: '#15141b', transparent: true, opacity: 0.65, depthWrite: false }))
  mark.rotation.x = -Math.PI / 2
  mark.visible = false
  scene.add(mark)
  skidMarks.push(mark)
}

// ── SPEED STREAKS (subtle, kept off the car's lane) ──────────────────
const streakCount = 70
const streakPos = new Float32Array(streakCount * 6)
const streakSeed = Array.from({ length: streakCount }, () => ({ x: 0, y: -999, z: 0 }))
const streakGeo = new THREE.BufferGeometry()
streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3))
const streakMat = new THREE.LineBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
const streaks = new THREE.LineSegments(streakGeo, streakMat)
streaks.frustumCulled = false
scene.add(streaks)

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
const clock = new THREE.Timer()
const cameraTarget = new THREE.Vector3()
const cameraPos = new THREE.Vector3()
const lookPos = new THREE.Vector3()
const camOff = new THREE.Vector3(-Math.sin(heading) * 8.6, 3.5, -Math.cos(heading) * 8.6)
const lookOff = new THREE.Vector3(Math.sin(heading) * 5, 1.0, Math.cos(heading) * 5)
let camRoll = 0
cameraPos.set(
  car.position.x - Math.sin(heading) * 8.6,
  car.position.y + 3.5,
  car.position.z - Math.cos(heading) * 8.6
)
camera.position.copy(cameraPos)
lookPos.set(car.position.x + Math.sin(heading) * 5, car.position.y + 1.0, car.position.z + Math.cos(heading) * 5)
camera.lookAt(lookPos)
const speedEl = document.querySelector('#speed')
const speedFill = document.querySelector('#speed-fill')
const lapEl = document.querySelector('#lap')
const lapProgress = document.querySelector('#lap-progress')
const message = document.querySelector('#message')
const statusEl = document.querySelector('#race-status')

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }

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
  if (forward || reverse) raceStarted = true

  // ── PHYSICS ──────────────────────────────────────────────
  if (!finished) {
    if (forward) speed += 39 * dt
    else speed *= Math.pow(0.989, dt * 60)
    if (reverse) speed -= 52 * dt
    speed = clamp(speed, -19, 112)
    if (handbrake) speed *= Math.pow(0.89, dt * 60)
  } else {
    speed *= Math.pow(0.94, dt * 60)
  }

  const steer = Number(right) - Number(left)
  const steeringResponse = 1.5 + Math.abs(speed) * 0.018
  if (left) heading += steeringResponse * dt * Math.sign(speed || 1)
  if (right) heading -= steeringResponse * dt * Math.sign(speed || 1)
  const oldPosition = car.position.clone()
  car.position.x += Math.sin(heading) * speed * dt
  car.position.z += Math.cos(heading) * speed * dt

  const nearest = nearestTrackPoint(car.position)
  const onRoad = Math.abs(nearest.lateral) <= halfRoad + 1.5 && nearest.distance < 18
  if (!onRoad) {
    car.position.copy(oldPosition)
    speed *= -0.22
  }
  const grounded = nearestTrackPoint(car.position)
  car.position.y = THREE.MathUtils.damp(car.position.y, grounded.point.y + 0.03, 9, dt)
  car.rotation.y = heading
  // Slope along the car's own heading (track tangent may point either way), nose-up on climbs.
  const fwdX = Math.sin(heading), fwdZ = Math.cos(heading)
  const along = grounded.tangent.x * fwdX + grounded.tangent.z * fwdZ
  const slope = grounded.tangent.y * Math.sign(along || 1) / Math.max(0.2, Math.hypot(grounded.tangent.x, grounded.tangent.z))
  car.rotation.z = THREE.MathUtils.damp(car.rotation.z, steer * -0.035 * Math.min(1, Math.abs(speed) / 25), 8, dt)
  car.rotation.x = THREE.MathUtils.damp(car.rotation.x, -Math.atan(slope), 6, dt)
  for (const wheel of wheelMeshesForSpin) wheel.rotation.x += speed * dt / 0.37

  // ── LAP COUNTING ─────────────────────────────────────────
  if (grounded.distance < 30) {
    if (lastT > 0.82 && grounded.t < 0.18 && speed > 1.5 && !finished) {
      lap += 1
      lapEl.textContent = String(Math.min(lap, 3)).padStart(2, '0')
      if (lap > 3) {
        finished = true
        statusEl.textContent = 'FINISH // RUN COMPLETE'
        message.textContent = 'CITY CONQUERED // RUN COMPLETE'
        message.classList.add('visible')
      }
    }
    if (grounded.t > 0.18 || grounded.t < lastT) lastT = grounded.t
    else lastT = grounded.t
  }
  lapProgress.style.width = `${Math.round(grounded.t * 100)}%`

  // ── HUD UPDATE ───────────────────────────────────────────
  const speedKmh = Math.round(Math.abs(speed) * 3.6)
  speedEl.textContent = String(speedKmh).padStart(3, '0')
  speedFill.style.width = `${Math.min(100, speedKmh / 4.5)}%`
  if (raceStarted && !finished) {
    statusEl.textContent = speedKmh > 320 ? 'MAX VELOCITY' : 'NIGHT RUN // IN PROGRESS'
    message.classList.toggle('visible', speedKmh < 3)
  }

  // ── SKID MARKS ───────────────────────────────────────────
  const justHandbraked = handbrake && !handbrakeWasDown && Math.abs(speed) > 18
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
  // Speed pulls the camera back/up a little and widens FOV; look-ahead keeps the car low in frame.
  const sp = clamp(Math.abs(speed) / 112, 0, 1)
  const camDist = 8.6 + sp * 1.6
  const camHeight = 3.5 + sp * 0.5
  const hx = Math.sin(heading), hz = Math.cos(heading)
  // Smooth the offset from the car (not the world position): heading changes swing the camera
  // softly, but there is no distance lag at speed, so the car never drifts out of frame.
  camOff.lerp(cameraTarget.set(-hx * camDist, camHeight, -hz * camDist), 1 - Math.exp(-5 * dt))
  lookOff.lerp(cameraTarget.set(hx * 5, 1.0, hz * 5), 1 - Math.exp(-8 * dt))
  cameraPos.copy(car.position).add(camOff)
  camera.position.copy(cameraPos)
  lookPos.copy(car.position).add(lookOff)
  camera.lookAt(lookPos)
  camRoll = THREE.MathUtils.damp(camRoll, steer * 0.022 * sp, 4, dt)
  camera.rotateZ(camRoll)
  camera.fov = THREE.MathUtils.damp(camera.fov, 62 + sp * 14, 3, dt)
  camera.updateProjectionMatrix()
  sky.position.copy(camera.position)

  // Speed streaks: recycled around the car, never in its lane; fade in above ~35% speed.
  streakMat.opacity = clamp((sp - 0.35) * 0.5, 0, 0.28)
  streaks.visible = streakMat.opacity > 0.01
  if (streaks.visible) {
    const len = 2 + sp * 9
    for (let i = 0; i < streakCount; i++) {
      const st = streakSeed[i]
      const rel = (st.x - car.position.x) * hx + (st.z - car.position.z) * hz
      if (st.y < -900 || rel < -20 || rel > 70) {
        const lat = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 16)
        const ahead = 25 + Math.random() * 40
        st.x = car.position.x + hx * ahead + hz * lat; st.z = car.position.z + hz * ahead - hx * lat; st.y = car.position.y + 0.6 + Math.random() * 6
      }
      streakPos.set([st.x, st.y, st.z, st.x + hx * len, st.y, st.z + hz * len], i * 6)
    }
    streakGeo.attributes.position.needsUpdate = true
  }

  // Shadow frustum + moon follow the car so shadows stay sharp.
  moon.position.set(car.position.x - 80, car.position.y + 150, car.position.z + 45)
  moon.target.position.copy(car.position)

  // ── FOLLOW LIGHTS ────────────────────────────────────────
  cyanFill.position.set(car.position.x + 18, car.position.y + 16, car.position.z - 22)
  pinkFill.position.set(car.position.x - 22, car.position.y + 13, car.position.z + 26)

  // ── TAILLIGHT INTENSITY — brighter when braking ─────────
  const braking = reverse || handbrake
  tailGlow.intensity = braking ? 12 : 5
  taillightMat.color.set(braking ? '#ff4a5e' : '#ff1330')

  renderer.render(scene, camera)
}
if (import.meta.env.DEV) window.__ev = { car, camera, get speed() { return speed }, set speed(v) { speed = v }, get heading() { return heading }, renderer }
animate()

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
