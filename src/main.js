import './style.css'
import * as THREE from 'three'

document.querySelector('#app').innerHTML = `
  <div id="game">
    <div class="topbar">
      <div class="brand">ESCAPE<span> VELOCITY</span></div>
      <div class="status">● SYSTEM ONLINE</div>
    </div>
    <div class="hud">
      <div class="label">VELOCITY</div>
      <div class="speed"><span id="speed">000</span><small> KM/H</small></div>
      <div class="lap">LAP <b id="lap">01</b> <span>/ 03</span></div>
    </div>
    <div class="center-message" id="message">READY TO DRIVE</div>
    <div class="bottom">
      <div>W / ↑ <span>ACCELERATE</span></div>
      <div>A D / ← → <span>STEER</span></div>
      <div>S / ↓ <span>BRAKE</span></div>
      <div>SPACE <span>HANDBRAKE</span></div>
    </div>
    <div class="crosshair">EV <span>// 001</span></div>
  </div>
`

const scene = new THREE.Scene()
scene.background = new THREE.Color('#050711')
scene.fog = new THREE.FogExp2('#070a18', 0.009)

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 500)
camera.position.set(0, 6, 12)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.3
document.querySelector('#game').prepend(renderer.domElement)

scene.add(new THREE.HemisphereLight(0x879dff, 0x111020, 2))

const moon = new THREE.DirectionalLight(0x9bb4ff, 2.5)
moon.position.set(-10, 20, 10)
moon.castShadow = true
scene.add(moon)

const cyan = new THREE.PointLight(0x00eaff, 35, 50)
cyan.position.set(0, 5, 0)
scene.add(cyan)

const magenta = new THREE.PointLight(0xff168f, 30, 50)
magenta.position.set(15, 4, -15)
scene.add(magenta)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: '#080c18', roughness: 0.35, metalness: 0.4 })
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -0.13
ground.receiveShadow = true
scene.add(ground)

// Closed rectangular circuit
const track = new THREE.Group()
scene.add(track)

const outerX = 38, outerZ = 55, roadW = 13
const asphalt = new THREE.MeshStandardMaterial({
  color: '#181c2b', roughness: 0.32, metalness: 0.45
})

function road(x, z, w, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), asphalt)
  mesh.position.set(x, -0.02, z)
  mesh.receiveShadow = true
  track.add(mesh)
}
road(0, -outerZ, outerX * 2, roadW)
road(0, outerZ, outerX * 2, roadW)
road(-outerX, 0, roadW, outerZ * 2)
road(outerX, 0, roadW, outerZ * 2)

const neonMaterial = (color) => new THREE.MeshStandardMaterial({
  color, emissive: color, emissiveIntensity: 2.4, roughness: 0.3
})

function strip(x, z, w, d, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), neonMaterial(color))
  mesh.position.set(x, 0.11, z)
  track.add(mesh)
}

for (const z of [-outerZ - roadW / 2, -outerZ + roadW / 2, outerZ - roadW / 2, outerZ + roadW / 2]) {
  strip(0, z, outerX * 2, 0.16, '#00dfff')
}
for (const x of [-outerX - roadW / 2, -outerX + roadW / 2, outerX - roadW / 2, outerX + roadW / 2]) {
  strip(x, 0, 0.16, outerZ * 2, '#ff168f')
}

// Dashed racing lines
const dashMaterial = new THREE.MeshBasicMaterial({ color: '#b6d5ff' })
for (let x = -outerX + 3; x < outerX; x += 6) {
  for (const z of [-outerZ, outerZ]) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.035, 0.16), dashMaterial)
    dash.position.set(x, 0.095, z)
    scene.add(dash)
  }
}
for (let z = -outerZ + 3; z < outerZ; z += 6) {
  for (const x of [-outerX, outerX]) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 2.2), dashMaterial)
    dash.position.set(x, 0.095, z)
    scene.add(dash)
  }
}

// Futuristic skyline
const buildings = new THREE.Group()
scene.add(buildings)
for (let i = 0; i < 100; i++) {
  const angle = Math.random() * Math.PI * 2
  const radius = 75 + Math.random() * 95
  const h = 8 + Math.random() * 35
  const x = Math.cos(angle) * radius
  const z = Math.sin(angle) * radius
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(4 + Math.random() * 8, h, 4 + Math.random() * 8),
    new THREE.MeshStandardMaterial({
      color: '#11172a', emissive: i % 3 ? '#071b3d' : '#280925',
      emissiveIntensity: 0.8, roughness: 0.7, metalness: 0.25
    })
  )
  building.position.set(x, h / 2 - 0.2, z)
  buildings.add(building)

  if (i % 2 === 0) {
    const lightBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, h * 0.7, 0.13),
      neonMaterial(i % 4 ? '#00dfff' : '#ff168f')
    )
    lightBar.position.set(x + 2.05, h * 0.52, z)
    buildings.add(lightBar)
  }
}

// Player car: temporary procedural sports-car model
const car = new THREE.Group()
scene.add(car)

const bodyMat = new THREE.MeshStandardMaterial({
  color: '#d30e55', metalness: 0.85, roughness: 0.22
})
const glassMat = new THREE.MeshStandardMaterial({
  color: '#071525', metalness: 0.7, roughness: 0.15
})
const tireMat = new THREE.MeshStandardMaterial({ color: '#090b12', roughness: 0.8 })

const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.48, 4.3), bodyMat)
body.position.y = 0.72
body.castShadow = true
car.add(body)

const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.65, 1.9), glassMat)
cabin.position.set(0, 1.22, -0.25)
car.add(cabin)

const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.05), bodyMat)
hood.position.set(0, 0.94, -1.3)
car.add(hood)

for (const x of [-0.78, 0.78]) {
  for (const z of [-1.35, 1.35]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.25, 20), tireMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.43, z)
    car.add(wheel)
  }

  const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.08), neonMaterial('#9df5ff'))
  headlight.position.set(x * 0.72, 0.76, -2.16)
  car.add(headlight)

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.08), neonMaterial('#ff073a'))
  tail.position.set(x * 0.72, 0.79, 2.17)
  car.add(tail)
}

car.position.set(0, 0, outerZ - 5)

// Controls and arcade physics
const keys = {}
addEventListener('keydown', e => {
  keys[e.code] = true
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
})
addEventListener('keyup', e => keys[e.code] = false)

let speed = 0
let heading = Math.PI
let lastX = car.position.x, lastZ = car.position.z
let lap = 1
let lastSide = Math.sign(car.position.x)
let traveled = 0

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

const clock = new THREE.Clock()
const cameraTarget = new THREE.Vector3()
const cameraPos = new THREE.Vector3()

function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.04)

  const forward = keys.KeyW || keys.ArrowUp
  const reverse = keys.KeyS || keys.ArrowDown
  const left = keys.KeyA || keys.ArrowLeft
  const right = keys.KeyD || keys.ArrowRight
  const handbrake = keys.Space

  if (forward) speed += 24 * dt
  else speed *= Math.pow(0.982, dt * 60)
  if (reverse) speed -= 30 * dt
  speed = clamp(speed, -12, 55)

  if (left) heading += (1.5 + Math.abs(speed) * 0.018) * dt * Math.sign(speed || 1)
  if (right) heading -= (1.5 + Math.abs(speed) * 0.018) * dt * Math.sign(speed || 1)
  if (handbrake) speed *= Math.pow(0.94, dt * 60)

  const oldX = car.position.x, oldZ = car.position.z
  car.position.x += Math.sin(heading) * speed * dt
  car.position.z += Math.cos(heading) * speed * dt
  car.rotation.y = heading
  car.rotation.z = (left ? 0.035 : 0) + (right ? -0.035 : 0)

  // Keep the player on the circuit bounds
  const maxX = outerX + roadW * 0.42
  const maxZ = outerZ + roadW * 0.42
  if (Math.abs(car.position.x) > maxX || Math.abs(car.position.z) > maxZ) {
    car.position.x = oldX
    car.position.z = oldZ
    speed *= -0.25
  }

  // Count a lap when crossing the start line in the correct direction
  if (oldZ > outerZ - 8 && car.position.z <= outerZ - 8 && speed < -1) {
    lap = Math.min(3, lap + 1)
    document.querySelector('#lap').textContent = String(lap).padStart(2, '0')
  }

  document.querySelector('#speed').textContent = String(Math.round(Math.abs(speed) * 3.6)).padStart(3, '0')

  // Smooth third-person chase camera
  cameraTarget.set(
    car.position.x - Math.sin(heading) * 8,
    4.3,
    car.position.z - Math.cos(heading) * 8
  )
  cameraPos.lerp(cameraTarget, 1 - Math.exp(-4 * dt))
  camera.position.copy(cameraPos)
  camera.lookAt(car.position.x, 0.8, car.position.z)

  cyan.position.set(car.position.x + 8, 4, car.position.z - 4)
  magenta.position.set(car.position.x - 8, 3, car.position.z + 6)

  renderer.render(scene, camera)
}
animate()

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})