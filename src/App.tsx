import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGesture } from './hooks/useGesture'
import { GESTURE_EMOJI } from './lib/gestures'
import { ELEMENT_CONFIG } from './lib/elements'
import type { ElementType } from './lib/elements'
import { ElementEffect } from './components/ElementEffect'

const ELEMENTS = Object.keys(ELEMENT_CONFIG) as ElementType[]

// Layered gradient visuals per element — no emoji, pure CSS
const CARD_BG: Record<ElementType, string> = {
  fire:      'radial-gradient(ellipse at 50% 110%, #ffcc00 0%, #ff6b35 28%, #cc2200 58%, #0d0000 100%)',
  water:     'linear-gradient(170deg, #caf0f8 0%, #00b4d8 45%, #023e8a 100%)',
  air:       'radial-gradient(ellipse at 50% 40%, #ffffff 0%, #b2ebf2 35%, #80deea 65%, #006064 100%)',
  earth:     'linear-gradient(155deg, #4caf50 0%, #8d6e63 38%, #4e342e 72%, #1b0000 100%)',
  lightning: 'radial-gradient(ellipse at 50% 50%, #ffffbb 0%, #ffff00 18%, #aa88ff 50%, #0d0020 100%)',
  energy:    'radial-gradient(ellipse at 50% 50%, #ffffff 0%, #ff44ff 25%, #aa00ff 55%, #0d0020 100%)',
  spirit:    'linear-gradient(135deg, #ff44aa 0%, #aa00ff 33%, #00ffcc 66%, #ff6600 100%)',
}

// Animated inner glow overlay per element
const CARD_GLOW: Record<ElementType, string> = {
  fire:      'radial-gradient(ellipse at 50% 90%, rgba(255,220,0,0.95) 0%, rgba(255,80,0,0.5) 45%, transparent 75%)',
  water:     'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(200,240,255,0.2) 50%, transparent 100%)',
  air:       'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9) 0%, rgba(178,235,242,0.4) 50%, transparent 80%)',
  earth:     'radial-gradient(ellipse at 50% 30%, rgba(100,200,80,0.7) 0%, rgba(80,50,30,0.3) 60%, transparent 90%)',
  lightning: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,1) 0%, rgba(255,255,100,0.8) 25%, rgba(170,136,255,0.4) 60%, transparent 80%)',
  energy:    'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9) 0%, rgba(255,100,255,0.7) 35%, rgba(170,0,255,0.3) 65%, transparent 85%)',
  spirit:    'conic-gradient(from 0deg at 50% 50%, rgba(255,68,170,0.8), rgba(170,0,255,0.6), rgba(0,255,204,0.7), rgba(255,100,0,0.6), rgba(255,68,170,0.8))',
}

// How fast the inner glow pulses
const ANIM_DURATION: Record<ElementType, number> = {
  fire: 0.3, water: 1.8, air: 2.2, earth: 2.5, lightning: 0.12, energy: 0.8, spirit: 3,
}

function ElementCard({ element, active }: { element: ElementType; active: boolean }) {
  const cfg = ELEMENT_CONFIG[element]
  const size = active ? 52 : 34

  return (
    <motion.div
      layout
      animate={active ? { y: -6, scale: 1 } : { y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      className="flex flex-col items-center gap-1"
    >
      <motion.div
        className="relative overflow-hidden"
        style={{
          width: size, height: size,
          borderRadius: active ? 14 : 10,
          background: CARD_BG[element],
          boxShadow: active ? `0 0 18px ${cfg.glow}88, 0 0 6px ${cfg.glow}44` : 'none',
          border: `1.5px solid ${active ? cfg.glow + 'cc' : 'rgba(255,255,255,0.12)'}`,
        }}
      >
        {/* Animated glow layer */}
        <motion.div
          className="absolute inset-0"
          style={{ background: CARD_GLOW[element] }}
          animate={{ opacity: element === 'lightning' ? [0.2, 1, 0.1, 1, 0.2] : [0.35, 0.9, 0.35] }}
          transition={{
            duration: ANIM_DURATION[element],
            repeat: Infinity,
            ease: element === 'lightning' ? [0, 1, 0, 1] : 'easeInOut',
          }}
        />
        {/* Rotating layer for energy/spirit/air */}
        {(element === 'energy' || element === 'spirit' || element === 'air') && (
          <motion.div
            className="absolute inset-0"
            style={{ background: CARD_GLOW[element], opacity: 0.5 }}
            animate={{ rotate: 360 }}
            transition={{ duration: element === 'air' ? 8 : 4, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </motion.div>

      {active && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-[9px] font-bold uppercase tracking-widest"
          style={{ color: cfg.glow }}
        >
          {cfg.label}
        </motion.p>
      )}
    </motion.div>
  )
}

export default function App() {
  const [activeElement, setActiveElement] = useState<ElementType>('fire')
  const [elementTrigger, setElementTrigger] = useState(0)
  const [flash, setFlash] = useState(false)
  const cooldownRef = useRef(false)

  const elementCfg = ELEMENT_CONFIG[activeElement]

  const handleGesture = useCallback((gesture: string) => {
    if (cooldownRef.current) return

    if (gesture === 'Shaka') {
      new Audio('/hidup-jokowi.mp3').play()
      return
    }

    cooldownRef.current = true
    setElementTrigger(t => t + 1)
    if (activeElement === 'lightning') {
      setFlash(true)
      setTimeout(() => setFlash(false), 180)
    }
    setTimeout(() => { cooldownRef.current = false }, 1800)
  }, [activeElement])

  const handlePinch = useCallback(() => {
    setActiveElement(prev => {
      const idx = ELEMENTS.indexOf(prev)
      return ELEMENTS[(idx + 1) % ELEMENTS.length]
    })
  }, [])

  const { videoRef, canvasRef, currentGesture, holdProgress, ready, loadingMsg, error, handCenterRef, handCentersRef } =
    useGesture({ onGesture: handleGesture, onPinch: handlePinch, enabled: true })

  const isOpenPalm = currentGesture === 'Open_Palm'
  const isHolding = currentGesture && currentGesture !== 'Open_Palm'

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black select-none">

      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)' }} muted playsInline />

      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)' }} />

      <ElementEffect
        element={activeElement}
        trigger={elementTrigger}
        continuous={isOpenPalm}
        handCenterRef={handCenterRef}
        handCentersRef={handCentersRef}
      />

      {/* Lightning flash */}
      <AnimatePresence>
        {flash && (
          <motion.div key="flash" initial={{ opacity: 0.75 }} animate={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-0 z-20 bg-yellow-100" />
        )}
      </AnimatePresence>

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />

      {/* Loading */}
      <AnimatePresence>
        {!ready && !error && (
          <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.6 } }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black">
            <div className="mb-2 text-4xl font-bold tracking-widest text-white/80">GESTURA</div>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
              className="h-8 w-8 rounded-full border-2 border-violet-500/30 border-t-violet-500" />
            <p className="text-xs font-medium uppercase tracking-widest text-white/30">{loadingMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black px-8 text-center">
          <span className="text-5xl">📷</span>
          <p className="font-semibold text-white">Kamera tidak dapat diakses</p>
          <p className="text-sm text-white/50">{error}</p>
        </div>
      )}

      {/* Top bar — no element badge anymore */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2">
          <motion.div animate={ready ? { opacity: [1, 0.3, 1] } : { opacity: 0.4 }}
            transition={{ duration: 2, repeat: Infinity }}
            className={`h-2 w-2 rounded-full ${ready ? 'bg-green-400' : 'bg-yellow-400'}`} />
          <span className="text-[11px] font-medium uppercase tracking-widest text-white/40">
            {ready ? 'Kamera aktif' : 'Memuat'}
          </span>
        </div>
        <span className="text-xs font-bold tracking-[0.3em] text-white/50 uppercase">Gestura</span>
        <div className="w-28" />
      </div>

      {/* Centre: open palm hint / hold ring */}
      <AnimatePresence mode="wait">
        {isOpenPalm && (
          <motion.div key="openpalm"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: elementCfg.glow + 'aa' }}>
              {elementCfg.emoji} {elementCfg.label} mengalir...
            </p>
          </motion.div>
        )}

        {isHolding && (
          <motion.div key={currentGesture}
            initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4">
            <motion.span animate={{ scale: [1, 1.07, 1] }} transition={{ duration: 0.7, repeat: Infinity }}
              className="text-8xl drop-shadow-2xl">
              {GESTURE_EMOJI[currentGesture] ?? '✋'}
            </motion.span>

            <div className="relative h-12 w-12">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                <motion.circle cx="20" cy="20" r="17" fill="none"
                  stroke={elementCfg.glow} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${holdProgress * 106.8} 106.8`} transition={{ duration: 0.05 }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                  {Math.round(holdProgress * 100)}%
                </span>
              </div>
            </div>

            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: elementCfg.glow }}>
              {elementCfg.emoji} {elementCfg.label}
            </p>
            <p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">Tahan sebentar...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom — element status bar (replaces gesture guide) */}
      <div
        className="absolute inset-x-0 z-10 flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <p className="text-[9px] font-medium uppercase tracking-widest text-white/20">
          🤏 cubitan untuk ganti elemen
        </p>

        <div
          className="flex items-end gap-1.5 rounded-2xl border border-white/10 bg-black/55 px-4 py-3 backdrop-blur-md"
          style={{ boxShadow: `0 0 30px ${elementCfg.glow}18` }}
        >
          {ELEMENTS.map(el => (
            <ElementCard key={el} element={el} active={el === activeElement} />
          ))}
        </div>
      </div>

    </div>
  )
}
