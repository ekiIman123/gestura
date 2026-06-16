import { useEffect, useRef } from 'react'
import type { ElementType } from '../lib/elements'
import { ELEMENT_CONFIG } from '../lib/elements'

interface Particle {
  x: number; y: number
  vx: number; vy: number
  gy: number
  drag: number
  decay: number
  life: number; maxLife: number
  size: number
  color: string
  glow: boolean
  bolt?: [number, number][]
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

function spawnBurst(el: ElementType, w: number, h: number): Particle[] {
  const cx = w / 2, cy = h / 2
  const colors = ELEMENT_CONFIG[el].colors

  if (el === 'lightning') {
    const out: Particle[] = []
    for (let b = 0; b < 5; b++) {
      const a = rnd(0, Math.PI * 2)
      const len = rnd(80, Math.min(w, h) * 0.42)
      const pts: [number, number][] = []
      let x = cx, y = cy
      for (let s = 0; s < 8; s++) {
        pts.push([x, y])
        x += Math.cos(a) * (len / 8) + rnd(-28, 28)
        y += Math.sin(a) * (len / 8) + rnd(-28, 28)
      }
      out.push({ x: cx, y: cy, vx: 0, vy: 0, gy: 0, drag: 1, decay: 0.07, life: 1, maxLife: 1, size: rnd(1.5, 3.5), color: pick(colors), glow: true, bolt: pts })
    }
    for (let i = 0; i < 55; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(4, 15)
      out.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gy: 0.06, drag: 0.96, decay: rnd(0.04, 0.1), life: 1, maxLife: 1, size: rnd(1, 3), color: pick(colors), glow: true })
    }
    return out
  }

  type Gen = (i: number) => Particle
  const generators: Record<string, Gen> = {
    fire: () => {
      const a = rnd(-Math.PI * 0.85, -Math.PI * 0.15), s = rnd(2, 8)
      return { x: cx + rnd(-70, 70), y: cy + rnd(-20, 20), vx: Math.cos(a) * s, vy: Math.sin(a) * s, gy: -0.08, drag: 0.97, decay: rnd(0.012, 0.025), life: 1, maxLife: 1, size: rnd(3, 10), color: pick(colors), glow: false }
    },
    water: () => {
      const a = rnd(0, Math.PI * 2), s = rnd(2, 7)
      return { x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, gy: 0.15, drag: 0.99, decay: rnd(0.008, 0.018), life: 1, maxLife: 1, size: rnd(2, 6), color: pick(colors), glow: false }
    },
    air: () => {
      const a = rnd(0, Math.PI * 2), s = rnd(5, 16)
      return { x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gy: 0, drag: 0.95, decay: rnd(0.03, 0.08), life: 1, maxLife: 1, size: rnd(1, 4), color: pick(colors), glow: false }
    },
    earth: () => {
      const a = rnd(-Math.PI * 0.9, -Math.PI * 0.1), s = rnd(2, 9)
      return { x: cx + rnd(-50, 50), y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gy: 0.35, drag: 0.98, decay: rnd(0.008, 0.015), life: 1, maxLife: 1, size: rnd(5, 14), color: pick(colors), glow: false }
    },
    energy: (i) => {
      const t = (i / 70) * Math.PI * 6, r = 5 + i * 0.8
      const sx = cx + Math.cos(t) * r * 0.2, sy = cy + Math.sin(t) * r * 0.2
      const a = t + Math.PI / 2, s = rnd(4, 10)
      return { x: sx, y: sy, vx: Math.cos(a) * s + rnd(-1, 1), vy: Math.sin(a) * s + rnd(-1, 1), gy: 0, drag: 0.97, decay: rnd(0.015, 0.03), life: 1, maxLife: 1, size: rnd(2, 6), color: pick(colors), glow: true }
    },
    spirit: () => {
      const a = rnd(0, Math.PI * 2), r = rnd(0, 90)
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: rnd(-1.5, 1.5), vy: rnd(-3.5, -0.5), gy: -0.01, drag: 0.99, decay: rnd(0.005, 0.012), life: 1, maxLife: 1, size: rnd(2, 7), color: pick(colors), glow: true }
    },
  }

  const counts: Record<string, number> = { fire: 80, water: 60, air: 100, earth: 40, energy: 70, spirit: 60 }
  const gen = generators[el]
  if (!gen) return []
  return Array.from({ length: counts[el] ?? 60 }, (_, i) => gen(i))
}

interface Props {
  element: ElementType | ''
  trigger: number
}

export function ElementEffect({ element, trigger }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)
  const elementRef = useRef(element)
  useEffect(() => { elementRef.current = element }, [element])

  useEffect(() => {
    if (!trigger) return
    const el = elementRef.current
    if (!el) return
    const canvas = canvasRef.current
    if (!canvas) return
    particlesRef.current.push(...spawnBurst(el as ElementType, canvas.offsetWidth, canvas.offsetHeight))
  }, [trigger])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function frame() {
      const ctx = canvas!.getContext('2d')
      if (!ctx) { rafRef.current = requestAnimationFrame(frame); return }
      ctx.clearRect(0, 0, canvas!.width, canvas!.height)

      particlesRef.current = particlesRef.current.filter(p => p.life > 0)

      for (const p of particlesRef.current) {
        p.life -= p.decay
        const alpha = Math.max(0, p.life / p.maxLife)
        ctx.globalAlpha = alpha

        if (p.bolt) {
          ctx.strokeStyle = p.color
          ctx.lineWidth = p.size
          ctx.shadowBlur = 14
          ctx.shadowColor = p.color
          ctx.beginPath()
          p.bolt.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
          ctx.stroke()
          ctx.shadowBlur = 0
        } else {
          p.vx *= p.drag
          p.vy = p.vy * p.drag + p.gy
          p.x += p.vx
          p.y += p.vy
          ctx.fillStyle = p.color
          if (p.glow) { ctx.shadowBlur = 10; ctx.shadowColor = p.color }
          ctx.beginPath()
          ctx.arc(p.x, p.y, Math.max(0.5, p.size * alpha), 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }

      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(frame)
    }

    frame()
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
}
