import { useEffect, useRef } from 'react'
import type { ElementType } from '../lib/elements'

interface Particle {
  x: number; y: number
  vx: number; vy: number
  gy: number
  drag: number
  decay: number
  life: number; maxLife: number
  size: number
  el: ElementType
  turbulence: boolean
  bolt?: [number, number][]
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

// RGB color stops per element: [bright core, mid, outer edge]
const GRAD: Record<ElementType, [[number,number,number],[number,number,number],[number,number,number]]> = {
  fire:      [[255, 250, 200], [255,  80,   0], [140,  15,   0]],
  water:     [[230, 250, 255], [ 40, 190, 230], [  0,  50, 140]],
  air:       [[255, 255, 255], [210, 245, 255], [140, 215, 230]],
  earth:     [[ 95,  75,  40], [ 55,  80,  25], [ 25,  15,   5]],
  lightning: [[255, 255, 255], [160, 215, 255], [ 60,   0, 200]],
  energy:    [[255, 220, 255], [200,   0, 255], [ 70,   0, 120]],
  spirit:    [[255, 200, 240], [  0, 255, 200], [130,   0, 130]],
}

// These use additive blending — particles accumulate like real light/fire
const ADDITIVE: Set<ElementType> = new Set(['fire', 'lightning', 'energy', 'spirit'])

function makeParticle(el: ElementType, x: number, y: number, burst: boolean, i: number): Particle {
  const base = { el, life: 1, maxLife: 1, turbulence: false }
  switch (el) {
    case 'fire': {
      const a = rnd(-Math.PI * 0.88, -Math.PI * 0.12), s = burst ? rnd(2, 9) : rnd(1, 4.5)
      return { ...base, x: x + rnd(-(burst ? 65 : 16), burst ? 65 : 16), y: y + rnd(-10, 10), vx: Math.cos(a) * s, vy: Math.sin(a) * s, gy: -0.09, drag: 0.97, decay: burst ? rnd(0.011, 0.02) : rnd(0.02, 0.04), size: burst ? rnd(12, 30) : rnd(7, 20), turbulence: true }
    }
    case 'water': {
      const a = burst ? rnd(0, Math.PI * 2) : rnd(-0.8, 0.8) - Math.PI / 2, s = burst ? rnd(2, 7) : rnd(1.5, 3.5)
      return { ...base, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (burst ? 4 : 1.5), gy: 0.16, drag: 0.99, decay: burst ? rnd(0.008, 0.016) : rnd(0.016, 0.028), size: burst ? rnd(8, 18) : rnd(5, 12) }
    }
    case 'air': {
      const a = rnd(0, Math.PI * 2), s = burst ? rnd(5, 16) : rnd(3, 9)
      return { ...base, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gy: 0, drag: 0.94, decay: burst ? rnd(0.03, 0.07) : rnd(0.04, 0.09), size: burst ? rnd(5, 16) : rnd(3, 9) }
    }
    case 'earth': {
      const a = rnd(-Math.PI * 0.9, -Math.PI * 0.1), s = burst ? rnd(2, 9) : rnd(1.5, 5)
      return { ...base, x: x + rnd(-(burst ? 50 : 14), burst ? 50 : 14), y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gy: burst ? 0.36 : 0.28, drag: 0.98, decay: burst ? rnd(0.007, 0.013) : rnd(0.015, 0.026), size: burst ? rnd(10, 26) : rnd(6, 14) }
    }
    case 'lightning': {
      const a = rnd(0, Math.PI * 2), s = burst ? rnd(4, 14) : rnd(3, 10)
      return { ...base, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gy: 0, drag: 0.95, decay: burst ? rnd(0.04, 0.09) : rnd(0.055, 0.12), size: burst ? rnd(5, 14) : rnd(3, 8) }
    }
    case 'energy': {
      const t = (i / (burst ? 70 : 4)) * Math.PI * 6, r2 = burst ? 5 + i * 0.8 : 0
      const a = t + Math.PI / 2, s = burst ? rnd(4, 10) : rnd(2, 6)
      return { ...base, x: x + Math.cos(t) * r2 * 0.2, y: y + Math.sin(t) * r2 * 0.2, vx: Math.cos(a) * s + rnd(-1, 1), vy: Math.sin(a) * s + rnd(-1, 1), gy: 0, drag: 0.97, decay: burst ? rnd(0.014, 0.028) : rnd(0.02, 0.038), size: burst ? rnd(8, 20) : rnd(4, 12) }
    }
    case 'spirit': {
      const a = rnd(0, Math.PI * 2), r2 = burst ? rnd(0, 90) : rnd(0, 28)
      return { ...base, x: x + Math.cos(a) * r2, y: y + Math.sin(a) * r2, vx: rnd(-1.5, 1.5), vy: rnd(-3.5, -0.5), gy: -0.01, drag: 0.99, decay: burst ? rnd(0.005, 0.011) : rnd(0.009, 0.018), size: burst ? rnd(9, 22) : rnd(5, 13) }
    }
  }
}

function spawnBurst(el: ElementType, w: number, h: number): Particle[] {
  const cx = w / 2, cy = h / 2
  if (el === 'lightning') {
    const out: Particle[] = []
    for (let b = 0; b < 5; b++) {
      const a = rnd(0, Math.PI * 2), len = rnd(80, Math.min(w, h) * 0.42)
      const pts: [number, number][] = []
      let x = cx, y = cy
      for (let s = 0; s < 9; s++) { pts.push([x, y]); x += Math.cos(a) * (len / 9) + rnd(-28, 28); y += Math.sin(a) * (len / 9) + rnd(-28, 28) }
      out.push({ x: cx, y: cy, vx: 0, vy: 0, gy: 0, drag: 1, decay: 0.065, life: 1, maxLife: 1, size: rnd(2, 5), el, turbulence: false, bolt: pts })
    }
    for (let i = 0; i < 55; i++) out.push(makeParticle('lightning', cx, cy, true, i))
    return out
  }
  const counts: Record<string, number> = { fire: 90, water: 65, air: 100, earth: 45, energy: 70, spirit: 60 }
  return Array.from({ length: counts[el] ?? 60 }, (_, i) => makeParticle(el, cx, cy, true, i))
}

const CONT_COUNT: Record<ElementType, number> = { fire: 5, water: 3, air: 7, earth: 2, lightning: 3, energy: 4, spirit: 3 }

interface Props {
  element: ElementType | ''
  trigger: number
  continuous: boolean
  handCenterRef: React.MutableRefObject<{ x: number; y: number } | null>
}

export function ElementEffect({ element, trigger, continuous, handCenterRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)
  const elementRef = useRef(element)
  const continuousRef = useRef(continuous)

  useEffect(() => { elementRef.current = element }, [element])
  useEffect(() => { continuousRef.current = continuous }, [continuous])

  useEffect(() => {
    if (!trigger) return
    const el = elementRef.current as ElementType | ''
    if (!el) return
    const canvas = canvasRef.current
    if (!canvas) return
    particlesRef.current.push(...spawnBurst(el as ElementType, canvas.offsetWidth, canvas.offsetHeight))
  }, [trigger])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    function frame() {
      const ctx = canvas!.getContext('2d')
      if (!ctx) { rafRef.current = requestAnimationFrame(frame); return }
      ctx.clearRect(0, 0, canvas!.width, canvas!.height)

      // Continuous emission
      const el = elementRef.current as ElementType | ''
      if (continuousRef.current && el && handCenterRef.current) {
        const hc = handCenterRef.current
        const ox = (1 - hc.x) * canvas!.width
        const oy = hc.y * canvas!.height
        const n = CONT_COUNT[el as ElementType] ?? 4
        for (let i = 0; i < n; i++) particlesRef.current.push(makeParticle(el as ElementType, ox, oy, false, i))
      }

      if (particlesRef.current.length > 800) particlesRef.current = particlesRef.current.slice(-700)
      particlesRef.current = particlesRef.current.filter(p => p.life > 0)

      const normal   = particlesRef.current.filter(p => !ADDITIVE.has(p.el))
      const additive = particlesRef.current.filter(p =>  ADDITIVE.has(p.el))

      ctx.globalCompositeOperation = 'source-over'
      for (const p of normal) { step(p); drawParticle(ctx, p) }

      ctx.globalCompositeOperation = 'lighter'
      for (const p of additive) { step(p); p.bolt ? drawBolt(ctx, p) : drawParticle(ctx, p) }

      ctx.globalCompositeOperation = 'source-over'
      rafRef.current = requestAnimationFrame(frame)
    }

    frame()
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
}

function step(p: Particle) {
  p.life -= p.decay
  if (!p.bolt) {
    p.vx = p.vx * p.drag + (p.turbulence ? rnd(-0.32, 0.32) : 0)
    p.vy = p.vy * p.drag + p.gy
    p.x += p.vx; p.y += p.vy
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  const a = Math.max(0, p.life / p.maxLife)
  // Shrink fire particles as they die; keep others full size until fade
  const r = Math.max(1, p.size * (p.el === 'fire' || p.el === 'earth' ? a : 1))
  const [inner, mid, outer] = GRAD[p.el]

  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.5)
  g.addColorStop(0,    `rgba(${inner},${a})`)
  g.addColorStop(0.38, `rgba(${mid},${ADDITIVE.has(p.el) ? a * 0.55 : a * 0.7})`)
  g.addColorStop(1,    `rgba(${outer},0)`)

  ctx.fillStyle = g
  ctx.beginPath()
  if (p.el === 'earth') {
    // Rough square for rocky look
    const s = r * 1.2
    ctx.rect(p.x - s * 0.5, p.y - s * 0.5, s, s)
  } else {
    ctx.arc(p.x, p.y, r * 1.5, 0, Math.PI * 2)
  }
  ctx.fill()
}

function drawBolt(ctx: CanvasRenderingContext2D, p: Particle) {
  if (!p.bolt) return
  const a = Math.max(0, p.life / p.maxLife)
  const [inner, mid] = GRAD[p.el]

  // Wide glow halo
  ctx.strokeStyle = `rgba(${mid},${a * 0.4})`
  ctx.lineWidth = p.size * 5
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath()
  p.bolt.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
  ctx.stroke()

  // Mid glow
  ctx.strokeStyle = `rgba(${mid},${a * 0.75})`
  ctx.lineWidth = p.size * 2.5
  ctx.beginPath()
  p.bolt.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
  ctx.stroke()

  // Bright core
  ctx.strokeStyle = `rgba(${inner},${a})`
  ctx.lineWidth = p.size * 0.8
  ctx.beginPath()
  p.bolt.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
  ctx.stroke()
}
