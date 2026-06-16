import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElementType } from '../lib/elements'

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

// ── Fire: vertex shader (per-particle size + color) ──────────────────────────

const FIRE_VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3  aColor;
  uniform   float uScale;
  varying   float vAlpha;
  varying   vec3  vColor;
  void main() {
    vAlpha       = aAlpha;
    vColor       = aColor;
    vec4 mvPos   = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.5, -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`

const FIRE_FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3  vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    if (t.a < 0.004) discard;
    gl_FragColor = vec4(vColor, t.a * vAlpha);
  }
`

// Soft radial glow texture: white core → yellow → orange → red → transparent
function makeFireTexture(): THREE.CanvasTexture {
  const s = 128, h = s / 2
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(h, h, 0, h, h, h)
  g.addColorStop(0,    'rgba(255,255,255,1)')
  g.addColorStop(0.05, 'rgba(255,255,210,1)')
  g.addColorStop(0.18, 'rgba(255,210,80,0.95)')
  g.addColorStop(0.40, 'rgba(255,100,10,0.70)')
  g.addColorStop(0.65, 'rgba(200,30,0,0.38)')
  g.addColorStop(0.85, 'rgba(80,5,0,0.12)')
  g.addColorStop(1,    'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  return new THREE.CanvasTexture(c)
}

// ── Fire particle pool ───────────────────────────────────────────────────────

interface FP {
  x: number; y: number; z: number
  vx: number; vy: number
  life: number; maxLife: number
  size: number; baseY: number
}
const FIRE_MAX = 320

function makeFP(): FP {
  return { x:0, y:0, z:0, vx:0, vy:0, life:0, maxLife:1, size:0.5, baseY:0 }
}

// ── FireEffect ───────────────────────────────────────────────────────────────

interface FireEffectProps {
  handCentersRef: React.MutableRefObject<Array<{ x: number; y: number } | null>>
  continuous: boolean
  trigger: number
}

function FireEffect({ handCentersRef, continuous, trigger }: FireEffectProps) {
  const { viewport, size, gl } = useThree()

  const texture  = useMemo(makeFireTexture, [])
  const pool     = useMemo<FP[]>(() => Array.from({ length: FIRE_MAX }, makeFP), [])
  const posArr   = useMemo(() => new Float32Array(FIRE_MAX * 3), [])
  const colArr   = useMemo(() => new Float32Array(FIRE_MAX * 3), [])
  const alphaArr = useMemo(() => new Float32Array(FIRE_MAX),     [])
  const sizeArr  = useMemo(() => new Float32Array(FIRE_MAX),     [])

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(posArr,   3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aColor',   new THREE.BufferAttribute(colArr,   3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aAlpha',   new THREE.BufferAttribute(alphaArr, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aSize',    new THREE.BufferAttribute(sizeArr,  1).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    return g
  }, [posArr, colArr, alphaArr, sizeArr])

  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uMap: { value: texture }, uScale: { value: 1.0 } },
    vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), [texture])

  const ptsRef     = useRef<THREE.Points>(null!)
  const burstQ     = useRef(false)
  const prevTrig   = useRef(trigger)
  const contAccum  = useRef(0)

  useEffect(() => {
    if (trigger !== prevTrig.current) { burstQ.current = true; prevTrig.current = trigger }
  }, [trigger])

  // Hand positions → Three.js world coords
  function activeCenters(): THREE.Vector3[] {
    return handCentersRef.current
      .filter(Boolean)
      .map(hc => new THREE.Vector3(
        (hc!.x - 0.5) * viewport.width,
        -(hc!.y - 0.5) * viewport.height,
        0,
      ))
  }

  function spawnAt(c: THREE.Vector3, burst: boolean, n: number) {
    let spawned = 0
    for (const p of pool) {
      if (p.life > 0 || spawned >= n) continue
      const spreadX = burst ? 0.9 : 0.55
      p.x     = c.x + rnd(-spreadX, spreadX)
      p.y     = c.y + rnd(-0.05, 0.1)
      p.z     = rnd(-0.28, 0.4)    // slight depth variation
      p.baseY = p.y
      p.vx    = rnd(-0.28, 0.28)
      p.vy    = rnd(1.7, 3.5)      // world units/s upward
      p.maxLife = burst ? rnd(0.8, 2.0) : rnd(0.5, 1.3)
      p.life  = p.maxLife
      p.size  = burst ? rnd(0.38, 0.92) : rnd(0.20, 0.68)
      spawned++
    }
  }

  useFrame((state, dt) => {
    if (!ptsRef.current) return

    // Perspective-correct point-size scale (matches Three.js PointsMaterial formula)
    mat.uniforms.uScale.value =
      0.5 * Math.sqrt(state.size.width ** 2 + state.size.height ** 2) * state.gl.getPixelRatio()

    const cs = activeCenters()

    // Burst spawn
    if (burstQ.current && cs.length) {
      burstQ.current = false
      for (const c of cs) spawnAt(c, true, 90)
    }

    // Continuous spawn
    if (continuous && cs.length) {
      contAccum.current += dt * 24
      const n = Math.floor(contAccum.current); contAccum.current -= n
      for (let i = 0; i < n; i++) for (const c of cs) spawnAt(c, false, 1)
    }

    // Step particles + write to GPU buffers
    const col = new THREE.Color()
    let alive = 0

    for (const p of pool) {
      if (p.life <= 0) continue

      // Physics: turbulent upward rise
      p.vx += rnd(-0.022, 0.022)
      p.vx *= 0.955
      p.x  += p.vx * dt
      p.y  += p.vy * dt
      p.life -= dt

      if (p.life <= 0) continue

      const t  = p.life / p.maxLife          // 1=fresh → 0=dead
      const h  = Math.max(0, p.y - p.baseY)
      const hN = Math.min(1, h / 2.8)        // 0=palm, 1=~2.8 world units above

      // Color by height: white-yellow base → orange → dark red tip
      if      (hN < 0.12) col.setRGB(1.00, 0.98, 0.78)
      else if (hN < 0.30) col.setRGB(1.00, 0.82, 0.22)
      else if (hN < 0.52) col.setRGB(1.00, 0.52, 0.04)
      else if (hN < 0.74) col.setRGB(0.90, 0.22, 0.00)
      else if (hN < 0.90) col.setRGB(0.55, 0.07, 0.00)
      else                col.setRGB(0.20, 0.02, 0.00)

      // Alpha: fade in fast, hold, fade out at top and end of life
      const fadeTop = 1 - Math.pow(hN, 1.6)
      const alpha   = Math.min(1, t * 5) * fadeTop * t

      posArr[alive * 3]     = p.x
      posArr[alive * 3 + 1] = p.y
      posArr[alive * 3 + 2] = p.z
      colArr[alive * 3]     = col.r
      colArr[alive * 3 + 1] = col.g
      colArr[alive * 3 + 2] = col.b
      alphaArr[alive]       = Math.max(0, alpha)
      sizeArr[alive]        = p.size * (0.35 + t * 0.65)  // shrinks with age
      alive++
    }

    geo.setDrawRange(0, alive)
    ;(geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('aColor')   as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('aAlpha')   as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('aSize')    as THREE.BufferAttribute).needsUpdate = true
  })

  // suppress unused-var; these are used in activeCenters via closure over viewport
  void [size, gl]

  return <points ref={ptsRef} geometry={geo} material={mat} frustumCulled={false} />
}

// ── Other elements (InstancedMesh) ───────────────────────────────────────────

const MAX = 600

const COLORS: Record<ElementType, string> = {
  fire: '#ff6000', water: '#00aadd', air: '#cceeff',
  earth: '#7a5028', lightning: '#aaddff', energy: '#dd00ff', spirit: '#00ffcc',
}
const ADDITIVE_ELS: ElementType[] = ['lightning', 'energy', 'spirit']

interface PState {
  pos: THREE.Vector3; vel: THREE.Vector3
  life: number; maxLife: number; size: number
  angle: number; radius: number
  orbitAxis: THREE.Vector3; phase: number
}
function makePState(): PState {
  return {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    life: 0, maxLife: 1, size: 1, angle: 0, radius: 0,
    orbitAxis: new THREE.Vector3(0, 1, 0), phase: 0,
  }
}

interface SystemProps {
  el: ElementType; trigger: number; continuous: boolean
  handCenterRef: React.MutableRefObject<{ x: number; y: number } | null>
}

function ParticleSystem({ el, trigger, continuous, handCenterRef }: SystemProps) {
  const { viewport } = useThree()
  const meshRef  = useRef<THREE.InstancedMesh>(null!)
  const dummy    = useMemo(() => new THREE.Object3D(), [])
  const pool     = useMemo<PState[]>(() => Array.from({ length: MAX }, makePState), [])
  const burstQ   = useRef(false)
  const prevT    = useRef(trigger)
  const contAccum = useRef(0)
  const core     = COLORS[el]

  useEffect(() => {
    if (trigger !== prevT.current) { burstQ.current = true; prevT.current = trigger }
  }, [trigger])

  function getCenter(): THREE.Vector3 | null {
    const hc = handCenterRef.current
    if (!hc) return null
    return new THREE.Vector3((hc.x - 0.5) * viewport.width, -(hc.y - 0.5) * viewport.height, 0)
  }

  function spawnP(p: PState, center: THREE.Vector3, burst: boolean, i: number) {
    p.life = 1; p.angle = rnd(0, Math.PI * 2); p.phase = rnd(0, Math.PI * 2)
    void i
    switch (el) {
      case 'water': {
        p.radius = burst ? rnd(0.8, 2.5) : rnd(0.5, 1.5)
        p.orbitAxis.set(rnd(-0.3,0.3), rnd(0.7,1), rnd(-0.3,0.3)).normalize()
        p.pos.set(center.x+Math.cos(p.angle)*p.radius, center.y+rnd(-0.5,0.5), Math.sin(p.angle)*p.radius*0.4)
        p.vel.set(rnd(-0.3,0.3), rnd(0.2,0.8), rnd(-0.1,0.1))
        p.maxLife = burst ? rnd(1.0,2.0) : rnd(0.8,1.6)
        p.size = burst ? rnd(0.1,0.28) : rnd(0.07,0.18); break
      }
      case 'air': {
        p.radius = burst ? rnd(0.6,2.0) : rnd(0.4,1.4)
        p.pos.set(center.x+Math.cos(p.angle)*p.radius, center.y+rnd(-1.0,1.0), Math.sin(p.angle)*p.radius)
        p.vel.set(0, rnd(-0.02,0.05), 0)
        p.maxLife = burst ? rnd(1.0,2.0) : rnd(0.8,1.5)
        p.size = burst ? rnd(0.06,0.18) : rnd(0.04,0.12); break
      }
      case 'earth': {
        const tilt = Math.PI * 0.25
        p.radius = burst ? rnd(1.0,3.0) : rnd(0.7,2.0)
        const ax = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), rnd(-0.2,0.2)).normalize()
        p.orbitAxis.copy(ax)
        const radial  = new THREE.Vector3(Math.cos(p.angle), 0, Math.sin(p.angle))
        const tangent = new THREE.Vector3().crossVectors(ax, radial).normalize()
        p.pos.set(center.x+radial.x*p.radius, center.y+radial.y*p.radius, radial.z*p.radius)
        p.vel.copy(tangent).multiplyScalar(rnd(0.015,0.04)*p.radius)
        p.maxLife = burst ? rnd(2.0,4.0) : rnd(3.0,6.0)
        p.size = burst ? rnd(0.15,0.45) : rnd(0.08,0.25); break
      }
      case 'lightning': {
        const a = rnd(0,Math.PI*2), dist = rnd(0.3,2.0)
        p.pos.set(center.x+Math.cos(a)*dist*rnd(0.1,1), center.y+Math.sin(a)*dist*rnd(0.1,1), rnd(-0.5,0.5))
        p.vel.set(rnd(-0.5,0.5), rnd(-0.5,0.5), rnd(-0.3,0.3))
        p.maxLife = burst ? rnd(0.15,0.4) : rnd(0.1,0.25)
        p.size = burst ? rnd(0.08,0.25) : rnd(0.05,0.15); break
      }
      case 'energy': {
        const phi = Math.acos(rnd(-1,1)), theta = rnd(0,Math.PI*2)
        p.radius = burst ? rnd(0.5,1.8) : rnd(0.3,1.2)
        p.orbitAxis.set(rnd(-1,1), rnd(-1,1), rnd(-1,1)).normalize()
        p.pos.set(center.x+Math.sin(phi)*Math.cos(theta)*p.radius, center.y+Math.cos(phi)*p.radius, Math.sin(phi)*Math.sin(theta)*p.radius)
        p.vel.set(rnd(-0.1,0.1), rnd(-0.1,0.1), rnd(-0.1,0.1))
        p.maxLife = burst ? rnd(0.8,1.5) : rnd(0.6,1.2)
        p.size = burst ? rnd(0.1,0.3) : rnd(0.06,0.18); break
      }
      case 'spirit': {
        const a2 = rnd(0,Math.PI*2)
        p.radius = burst ? rnd(0.5,2.5) : rnd(0.4,1.8)
        p.orbitAxis.set(rnd(-0.5,0.5), 1, rnd(-0.5,0.5)).normalize()
        p.pos.set(center.x+Math.cos(a2)*p.radius, center.y+rnd(-0.8,0.8), Math.sin(a2)*p.radius*0.6)
        p.vel.set(rnd(-0.08,0.08), rnd(-0.1,0.15), rnd(-0.05,0.05))
        p.maxLife = burst ? rnd(2.0,4.0) : rnd(1.5,3.0)
        p.size = burst ? rnd(0.12,0.35) : rnd(0.08,0.22); break
      }
      default:
        p.pos.copy(center); p.vel.set(rnd(-1,1)*0.1, rnd(-1,1)*0.1, 0)
        p.maxLife = 1; p.size = 0.2
    }
  }

  function stepP(p: PState, dt: number, center: THREE.Vector3 | null) {
    const spd = dt * 60
    switch (el) {
      case 'water':
        p.vel.y -= 0.008*spd; p.vel.multiplyScalar(Math.pow(0.985,spd))
        p.pos.addScaledVector(p.vel, spd); p.life -= dt/p.maxLife; break
      case 'air':
        if (center) {
          p.angle += (0.04+0.02*(1-p.life))*spd
          p.radius = Math.max(0.1, p.radius+rnd(-0.005,0.005)*spd)
          p.pos.set(center.x+Math.cos(p.angle)*p.radius, p.pos.y+0.003*spd, Math.sin(p.angle)*p.radius)
        }
        p.life -= dt/p.maxLife; break
      case 'earth':
        if (center) {
          const toC    = new THREE.Vector3().subVectors(center, p.pos)
          const proj   = new THREE.Vector3().copy(p.orbitAxis).multiplyScalar(toC.dot(p.orbitAxis))
          const radial = new THREE.Vector3().subVectors(toC, proj)
          const dist   = radial.length()
          if (dist > 0.01)
            p.vel.addScaledVector(radial.normalize(), (dist - p.radius) * 0.04 * spd)
        }
        p.vel.multiplyScalar(Math.pow(0.992,spd))
        p.pos.addScaledVector(p.vel, spd); p.life -= dt/p.maxLife; break
      case 'lightning':
        p.vel.multiplyScalar(Math.pow(0.88,spd))
        p.pos.addScaledVector(p.vel, spd); p.life -= dt/p.maxLife; break
      case 'energy':
        if (center) {
          p.angle += 0.07*spd
          const ax   = p.orbitAxis
          const perp1 = new THREE.Vector3(ax.z, ax.x, ax.y).normalize()
          const perp2 = new THREE.Vector3().crossVectors(ax, perp1).normalize()
          const s = Math.sin(p.angle+p.phase), c2 = Math.cos(p.angle+p.phase)
          p.pos.set(
            center.x + (perp1.x*c2 + perp2.x*s) * p.radius,
            center.y + (perp1.y*c2 + perp2.y*s) * p.radius,
                       (perp1.z*c2 + perp2.z*s) * p.radius,
          )
        }
        p.life -= dt/p.maxLife; break
      case 'spirit':
        if (center) {
          p.angle += 0.012*spd
          const sr = p.radius*(0.5+0.5*p.life)
          p.pos.x += (center.x + Math.cos(p.angle)*sr - p.pos.x) * 0.015*spd
          p.pos.z += (Math.sin(p.angle)*sr*0.6        - p.pos.z) * 0.015*spd
        }
        p.vel.y -= 0.001*spd; p.pos.y += p.vel.y*spd
        p.life -= dt/p.maxLife; break
      default:
        p.vel.multiplyScalar(Math.pow(0.97,spd))
        p.pos.addScaledVector(p.vel, spd); p.life -= dt/p.maxLife
    }
  }

  const CONT_RATE:  Record<ElementType, number> = { fire:5, water:5,  air:10, earth:3, lightning:6, energy:7, spirit:4 }
  const BURST_CNT:  Record<ElementType, number> = { fire:80, water:55, air:90, earth:35, lightning:50, energy:60, spirit:50 }

  useFrame((_, dt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const center = getCenter()

    if (burstQ.current && center) {
      burstQ.current = false
      let n = 0
      for (const p of pool) if (p.life <= 0 && n < BURST_CNT[el]) { spawnP(p, center, true, n++); }
    }

    if (continuous && center) {
      contAccum.current += dt * CONT_RATE[el]
      const n = Math.floor(contAccum.current); contAccum.current -= n
      let sp = 0
      for (const p of pool) if (p.life <= 0 && sp < n) { spawnP(p, center, false, sp++); }
    }

    let alive = 0
    const tmpCol = new THREE.Color(core)
    for (const p of pool) {
      if (p.life <= 0) continue
      stepP(p, dt, center)
      if (p.life <= 0) continue
      dummy.position.copy(p.pos)
      dummy.scale.setScalar(p.size * Math.max(0, p.life))
      dummy.updateMatrix()
      mesh.setMatrixAt(alive, dummy.matrix)
      mesh.setColorAt!(alive, tmpCol)
      alive++
    }
    mesh.count = alive
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  const geo2 = useMemo(() => new THREE.SphereGeometry(1, 6, 6), [])
  const mat2 = useMemo(() => new THREE.MeshBasicMaterial({
    color: core, transparent: true, opacity: 0.85, depthWrite: false,
    blending: ADDITIVE_ELS.includes(el) ? THREE.AdditiveBlending : THREE.NormalBlending,
  }), [el, core])

  return <instancedMesh ref={meshRef} args={[geo2, mat2, MAX]} frustumCulled={false} />
}

// ── Exported component ───────────────────────────────────────────────────────

interface Props {
  element: ElementType | ''
  trigger: number
  continuous: boolean
  handCenterRef: React.MutableRefObject<{ x: number; y: number } | null>
  handCentersRef: React.MutableRefObject<Array<{ x: number; y: number } | null>>
}

export function ElementEffect({ element, trigger, continuous, handCenterRef, handCentersRef }: Props) {
  if (!element) return null
  return (
    <div className="pointer-events-none absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
        gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        {element === 'fire' ? (
          <FireEffect
            key="fire"
            handCentersRef={handCentersRef}
            continuous={continuous}
            trigger={trigger}
          />
        ) : (
          <ParticleSystem
            key={element}
            el={element}
            trigger={trigger}
            continuous={continuous}
            handCenterRef={handCenterRef}
          />
        )}
      </Canvas>
    </div>
  )
}
