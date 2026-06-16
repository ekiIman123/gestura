import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElementType } from '../lib/elements'

// ─── constants ──────────────────────────────────────────────────────────────

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const MAX = 600

// Element color palettes [core, mid, edge]
const COLORS: Record<ElementType, [string, string, string]> = {
  fire:      ['#fff8c0', '#ff6000', '#8b0000'],
  water:     ['#e0f8ff', '#00aadd', '#003880'],
  air:       ['#ffffff', '#cceeff', '#88ccdd'],
  earth:     ['#c8a060', '#7a5028', '#3a2010'],
  lightning: ['#ffffff', '#aaddff', '#3300cc'],
  energy:    ['#ffffff', '#dd00ff', '#550080'],
  spirit:    ['#ffccee', '#00ffcc', '#880055'],
}

// ─── props ───────────────────────────────────────────────────────────────────

interface Props {
  element: ElementType | ''
  trigger: number
  continuous: boolean
  handCenterRef: React.MutableRefObject<{ x: number; y: number } | null>
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Convert normalised hand coords (0-1) → Three.js world coords */
function handToWorld(
  hc: { x: number; y: number },
  viewport: { width: number; height: number },
) {
  // hc.x is mirrored in App (video scaleX(-1)), so uninvert: worldX = (hc.x - 0.5) * vp.width
  const wx = (hc.x - 0.5) * viewport.width
  const wy = -(hc.y - 0.5) * viewport.height
  return new THREE.Vector3(wx, wy, 0)
}

// ─── per-particle state ───────────────────────────────────────────────────────

interface PState {
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  maxLife: number
  size: number
  angle: number     // for orbital elements
  radius: number
  orbitAxis: THREE.Vector3
  phase: number
}

function makePState(): PState {
  return {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    life: 0,
    maxLife: 1,
    size: 1,
    angle: 0,
    radius: 0,
    orbitAxis: new THREE.Vector3(0, 1, 0),
    phase: 0,
  }
}

// ─── Instanced particle mesh ─────────────────────────────────────────────────

interface SystemProps {
  el: ElementType
  trigger: number
  continuous: boolean
  handCenterRef: React.MutableRefObject<{ x: number; y: number } | null>
}

function ParticleSystem({ el, trigger, continuous, handCenterRef }: SystemProps) {
  const { viewport } = useThree()
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const pool = useMemo<PState[]>(() => Array.from({ length: MAX }, makePState), [])
  const burstQueued = useRef(false)
  const prevTrigger = useRef(trigger)

  // Color texture — 1×1 canvas per element for tinting
  const [core, mid] = COLORS[el]

  useEffect(() => {
    if (trigger !== prevTrigger.current) {
      burstQueued.current = true
      prevTrigger.current = trigger
    }
  }, [trigger])

  function getCenter(): THREE.Vector3 | null {
    const hc = handCenterRef.current
    if (!hc) return null
    return handToWorld(hc, viewport)
  }

  function spawnParticle(p: PState, center: THREE.Vector3, burst: boolean) {
    p.life = 1
    p.angle = rnd(0, Math.PI * 2)
    p.phase = rnd(0, Math.PI * 2)

    switch (el) {
      case 'fire': {
        // Rises upward from palm
        const spread = burst ? 1.2 : 0.5
        p.pos.set(
          center.x + rnd(-spread, spread),
          center.y + rnd(-0.2, 0.3),
          rnd(-0.3, 0.3),
        )
        const s = burst ? rnd(1.5, 4) : rnd(0.8, 2)
        p.vel.set(rnd(-0.4, 0.4) * s * 0.3, s * 0.12, rnd(-0.1, 0.1))
        p.maxLife = burst ? rnd(0.6, 1.2) : rnd(0.4, 0.9)
        p.size = burst ? rnd(0.18, 0.5) : rnd(0.1, 0.3)
        break
      }
      case 'water': {
        // Orbiting droplets + gravity arc
        p.radius = burst ? rnd(0.8, 2.5) : rnd(0.5, 1.5)
        p.orbitAxis.set(rnd(-0.3, 0.3), rnd(0.7, 1), rnd(-0.3, 0.3)).normalize()
        p.pos.set(
          center.x + Math.cos(p.angle) * p.radius,
          center.y + rnd(-0.5, 0.5),
          Math.sin(p.angle) * p.radius * 0.4,
        )
        p.vel.set(rnd(-0.3, 0.3), rnd(0.2, 0.8), rnd(-0.1, 0.1))
        p.maxLife = burst ? rnd(1.0, 2.0) : rnd(0.8, 1.6)
        p.size = burst ? rnd(0.1, 0.28) : rnd(0.07, 0.18)
        break
      }
      case 'air': {
        // Vortex spiral around hand
        p.radius = burst ? rnd(0.6, 2.0) : rnd(0.4, 1.4)
        p.pos.set(
          center.x + Math.cos(p.angle) * p.radius,
          center.y + rnd(-1.0, 1.0),
          Math.sin(p.angle) * p.radius,
        )
        p.vel.set(0, rnd(-0.02, 0.05), 0)
        p.maxLife = burst ? rnd(1.0, 2.0) : rnd(0.8, 1.5)
        p.size = burst ? rnd(0.06, 0.18) : rnd(0.04, 0.12)
        break
      }
      case 'earth': {
        // Debris orbits in inclined ring like asteroid belt
        const tilt = Math.PI * 0.25 // 45° tilt
        p.radius = burst ? rnd(1.0, 3.0) : rnd(0.7, 2.0)
        const ax = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), rnd(-0.2, 0.2)).normalize()
        p.orbitAxis.copy(ax)
        const radial = new THREE.Vector3(Math.cos(p.angle), 0, Math.sin(p.angle))
        const tangent = new THREE.Vector3().crossVectors(ax, radial).normalize()
        p.pos.set(
          center.x + radial.x * p.radius,
          center.y + radial.y * p.radius,
          radial.z * p.radius,
        )
        p.vel.copy(tangent).multiplyScalar(rnd(0.015, 0.04) * p.radius)
        p.maxLife = burst ? rnd(2.0, 4.0) : rnd(3.0, 6.0)
        p.size = burst ? rnd(0.15, 0.45) : rnd(0.08, 0.25)
        break
      }
      case 'lightning': {
        // Instant arcs — short-lived, fast, erratic
        const a = rnd(0, Math.PI * 2)
        const dist = rnd(0.3, 2.0)
        p.pos.set(
          center.x + Math.cos(a) * dist * rnd(0.1, 1),
          center.y + Math.sin(a) * dist * rnd(0.1, 1),
          rnd(-0.5, 0.5),
        )
        p.vel.set(rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.3, 0.3))
        p.maxLife = burst ? rnd(0.15, 0.4) : rnd(0.1, 0.25)
        p.size = burst ? rnd(0.08, 0.25) : rnd(0.05, 0.15)
        break
      }
      case 'energy': {
        // Dense fast-spinning sphere around hand
        const phi = Math.acos(rnd(-1, 1))
        const theta = rnd(0, Math.PI * 2)
        p.radius = burst ? rnd(0.5, 1.8) : rnd(0.3, 1.2)
        p.orbitAxis.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize()
        p.pos.set(
          center.x + Math.sin(phi) * Math.cos(theta) * p.radius,
          center.y + Math.cos(phi) * p.radius,
          Math.sin(phi) * Math.sin(theta) * p.radius,
        )
        p.vel.set(rnd(-0.1, 0.1), rnd(-0.1, 0.1), rnd(-0.1, 0.1))
        p.maxLife = burst ? rnd(0.8, 1.5) : rnd(0.6, 1.2)
        p.size = burst ? rnd(0.1, 0.3) : rnd(0.06, 0.18)
        break
      }
      case 'spirit': {
        // Slow drifting wisps, loose orbit
        const a2 = rnd(0, Math.PI * 2)
        p.radius = burst ? rnd(0.5, 2.5) : rnd(0.4, 1.8)
        p.orbitAxis.set(rnd(-0.5, 0.5), 1, rnd(-0.5, 0.5)).normalize()
        p.pos.set(
          center.x + Math.cos(a2) * p.radius,
          center.y + rnd(-0.8, 0.8),
          Math.sin(a2) * p.radius * 0.6,
        )
        p.vel.set(rnd(-0.08, 0.08), rnd(-0.1, 0.15), rnd(-0.05, 0.05))
        p.maxLife = burst ? rnd(2.0, 4.0) : rnd(1.5, 3.0)
        p.size = burst ? rnd(0.12, 0.35) : rnd(0.08, 0.22)
        break
      }
    }
  }

  function stepParticle(p: PState, dt: number, center: THREE.Vector3 | null) {
    const speed = dt * 60

    switch (el) {
      case 'fire': {
        // Turbulent upward rise
        p.vel.x += rnd(-0.015, 0.015) * speed
        p.vel.y -= 0.001 * speed // slight upward accel (already positive vy)
        p.vel.multiplyScalar(Math.pow(0.97, speed))
        p.pos.add(new THREE.Vector3().copy(p.vel).multiplyScalar(speed))
        p.life -= (dt / p.maxLife) * 1.2
        break
      }
      case 'water': {
        // Arc then gravity drop
        p.vel.y -= 0.008 * speed
        p.vel.multiplyScalar(Math.pow(0.985, speed))
        p.pos.add(new THREE.Vector3().copy(p.vel).multiplyScalar(speed))
        p.life -= dt / p.maxLife
        break
      }
      case 'air': {
        // Spiral vortex: orbit angle increases, drifts upward
        if (center) {
          p.angle += (0.04 + 0.02 * (1 - p.life)) * speed
          p.radius = Math.max(0.1, p.radius + rnd(-0.005, 0.005) * speed)
          p.pos.set(
            center.x + Math.cos(p.angle) * p.radius,
            p.pos.y + 0.003 * speed,
            Math.sin(p.angle) * p.radius,
          )
        }
        p.life -= dt / p.maxLife
        break
      }
      case 'earth': {
        // Orbit in tilted ring — keep circling hand center
        if (center) {
          // orbital velocity around axis
          const toCenter = new THREE.Vector3().subVectors(center, p.pos)
          const proj = new THREE.Vector3().copy(p.orbitAxis).multiplyScalar(toCenter.dot(p.orbitAxis))
          const radial = new THREE.Vector3().subVectors(toCenter, proj)
          const dist = radial.length()
          const targetR = p.radius
          // centripetal correction
          if (dist > 0.01) {
            const correction = radial.clone().normalize().multiplyScalar((dist - targetR) * 0.04 * speed)
            p.vel.add(correction)
          }
        }
        p.vel.multiplyScalar(Math.pow(0.992, speed))
        p.pos.add(new THREE.Vector3().copy(p.vel).multiplyScalar(speed))
        p.life -= dt / p.maxLife
        break
      }
      case 'lightning': {
        p.vel.multiplyScalar(Math.pow(0.88, speed))
        p.pos.add(new THREE.Vector3().copy(p.vel).multiplyScalar(speed))
        p.life -= dt / p.maxLife
        break
      }
      case 'energy': {
        // Fast orbit around hand
        if (center) {
          p.angle += 0.07 * speed
          const sin = Math.sin(p.angle + p.phase)
          const cos = Math.cos(p.angle + p.phase)
          const ax = p.orbitAxis
          const perp1 = new THREE.Vector3(ax.z, ax.x, ax.y).normalize()
          const perp2 = new THREE.Vector3().crossVectors(ax, perp1).normalize()
          p.pos.set(
            center.x + (perp1.x * cos + perp2.x * sin) * p.radius,
            center.y + (perp1.y * cos + perp2.y * sin) * p.radius,
            (perp1.z * cos + perp2.z * sin) * p.radius,
          )
        }
        p.life -= dt / p.maxLife
        break
      }
      case 'spirit': {
        // Gentle drift + slow orbit
        if (center) {
          p.angle += 0.012 * speed
          const spiralR = p.radius * (0.5 + 0.5 * p.life)
          p.pos.x += (center.x + Math.cos(p.angle) * spiralR - p.pos.x) * 0.015 * speed
          p.pos.z += (Math.sin(p.angle) * spiralR * 0.6 - p.pos.z) * 0.015 * speed
        }
        p.vel.y -= 0.001 * speed
        p.pos.y += p.vel.y * speed
        p.life -= dt / p.maxLife
        break
      }
    }
  }

  const contAccum = useRef(0)
  const CONT_RATE: Record<ElementType, number> = {
    fire: 8, water: 5, air: 10, earth: 3, lightning: 6, energy: 7, spirit: 4,
  }
  const BURST_COUNT: Record<ElementType, number> = {
    fire: 80, water: 55, air: 90, earth: 35, lightning: 50, energy: 60, spirit: 50,
  }

  useFrame(({ clock: _clock }, dt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const center = getCenter()

    // Burst spawn
    if (burstQueued.current && center) {
      burstQueued.current = false
      const n = BURST_COUNT[el]
      let spawned = 0
      for (const p of pool) {
        if (p.life <= 0 && spawned < n) {
          spawnParticle(p, center, true)
          spawned++
        }
      }
    }

    // Continuous spawn
    if (continuous && center) {
      contAccum.current += dt * CONT_RATE[el]
      const toSpawn = Math.floor(contAccum.current)
      contAccum.current -= toSpawn
      let spawned = 0
      for (const p of pool) {
        if (p.life <= 0 && spawned < toSpawn) {
          spawnParticle(p, center, false)
          spawned++
        }
      }
    }

    // Step + render
    let alive = 0
    for (const p of pool) {
      if (p.life <= 0) continue
      stepParticle(p, dt, center)
      if (p.life <= 0) continue

      const alpha = Math.max(0, p.life)
      const sz = p.size * alpha
      dummy.position.copy(p.pos)
      dummy.scale.setScalar(sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(alive, dummy.matrix)
      // Color: blend core → transparent as life decreases
      const c = new THREE.Color(core).lerp(new THREE.Color(mid), 1 - alpha)
      mesh.setColorAt(alive, c)
      alive++
    }

    mesh.count = alive
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  const geo = useMemo(() => new THREE.SphereGeometry(1, 6, 6), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: core,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: ['fire', 'lightning', 'energy', 'spirit'].includes(el)
      ? THREE.AdditiveBlending
      : THREE.NormalBlending,
    vertexColors: true,
  }), [el, core])

  return <instancedMesh ref={meshRef} args={[geo, mat, MAX]} frustumCulled={false} />
}

// ─── exported component ───────────────────────────────────────────────────────

export function ElementEffect({ element, trigger, continuous, handCenterRef }: Props) {
  if (!element) return null

  return (
    <div className="pointer-events-none absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
        gl={{
          alpha: true,
          antialias: false,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
      >
        <ParticleSystem
          key={element}
          el={element}
          trigger={trigger}
          continuous={continuous}
          handCenterRef={handCenterRef}
        />
      </Canvas>
    </div>
  )
}
