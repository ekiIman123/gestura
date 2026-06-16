import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGesture } from './hooks/useGesture'
import { GESTURE_EMOJI, GESTURE_LABEL } from './lib/gestures'
import { ELEMENT_CONFIG, GESTURE_ELEMENT } from './lib/elements'
import type { ElementType } from './lib/elements'
import { ElementEffect } from './components/ElementEffect'

const GESTURES = Object.keys(GESTURE_EMOJI)
const ELEMENTS = Object.keys(ELEMENT_CONFIG) as ElementType[]

export default function App() {
  const [activeElement, setActiveElement] = useState<ElementType>('fire')
  const [elementTrigger, setElementTrigger] = useState(0)
  const [flash, setFlash] = useState(false)
  const [pinchLabel, setPinchLabel] = useState(false)
  const cooldownRef = useRef(false)

  const elementCfg = ELEMENT_CONFIG[activeElement]

  const handleGesture = useCallback((gesture: string) => {
    if (cooldownRef.current) return

    // Hidden: 🤙 (Shaka) = Hidup Jokowi! audio
    if (gesture === 'Shaka') {
      const audio = new Audio('/hidup-jokowi.mp3')
      audio.play()
      return
    }

    // Burst + flash for lightning
    cooldownRef.current = true
    setElementTrigger(t => t + 1)
    if (activeElement === 'lightning') {
      setFlash(true)
      setTimeout(() => setFlash(false), 180)
    }
    setTimeout(() => { cooldownRef.current = false }, 1800)
  }, [activeElement])

  const handlePinch = useCallback(() => {
    const idx = ELEMENTS.indexOf(activeElement)
    const next = ELEMENTS[(idx + 1) % ELEMENTS.length]
    setActiveElement(next)
    setPinchLabel(true)
    setTimeout(() => setPinchLabel(false), 1200)
  }, [activeElement])

  const { videoRef, canvasRef, currentGesture, holdProgress, ready, loadingMsg, error, handCenterRef } =
    useGesture({ onGesture: handleGesture, onPinch: handlePinch, enabled: true })

  const isOpenPalm = currentGesture === 'Open_Palm'
  const isHolding = currentGesture && currentGesture !== 'Open_Palm'
  const currentElemCfg = GESTURE_ELEMENT[currentGesture] ? ELEMENT_CONFIG[GESTURE_ELEMENT[currentGesture]] : elementCfg

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black select-none">

      {/* Camera feed (mirrored) */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
        muted
        playsInline
      />

      {/* Skeleton overlay */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Element particle effects */}
      <ElementEffect
        element={activeElement}
        trigger={elementTrigger}
        continuous={isOpenPalm}
        handCenterRef={handCenterRef}
      />

      {/* Lightning screen flash */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key="flash"
            initial={{ opacity: 0.75 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-0 z-20 bg-yellow-100"
          />
        )}
      </AnimatePresence>

      {/* Gradient vignette */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />

      {/* Loading screen */}
      <AnimatePresence>
        {!ready && !error && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black"
          >
            <div className="mb-2 text-4xl font-bold tracking-widest text-white/80">GESTURA</div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
              className="h-8 w-8 rounded-full border-2 border-violet-500/30 border-t-violet-500"
            />
            <p className="text-xs font-medium uppercase tracking-widest text-white/30">{loadingMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error screen */}
      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black px-8 text-center">
          <span className="text-5xl">📷</span>
          <p className="font-semibold text-white">Kamera tidak dapat diakses</p>
          <p className="text-sm text-white/50">{error}</p>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2">
          <motion.div
            animate={ready ? { opacity: [1, 0.3, 1] } : { opacity: 0.4 }}
            transition={{ duration: 2, repeat: Infinity }}
            className={`h-2 w-2 rounded-full ${ready ? 'bg-green-400' : 'bg-yellow-400'}`}
          />
          <span className="text-[11px] font-medium uppercase tracking-widest text-white/40">
            {ready ? 'Kamera aktif' : 'Memuat'}
          </span>
        </div>

        <span className="text-xs font-bold tracking-[0.3em] text-white/50 uppercase">Gestura</span>

        {/* Active element badge */}
        <motion.div
          key={activeElement}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1"
          style={{ borderColor: elementCfg.glow + '55', backgroundColor: elementCfg.glow + '18' }}
        >
          <span className="text-sm">{elementCfg.emoji}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: elementCfg.glow }}>
            {elementCfg.label}
          </span>
        </motion.div>
      </div>

      {/* Pinch label toast */}
      <AnimatePresence>
        {pinchLabel && (
          <motion.div
            key="pinch-label"
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-full px-5 py-2 text-sm font-bold uppercase tracking-widest"
            style={{ background: elementCfg.glow + '33', color: elementCfg.glow, border: `1px solid ${elementCfg.glow}55` }}
          >
            {elementCfg.emoji} Beralih ke {elementCfg.label}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Centre: open palm hint */}
      <AnimatePresence mode="wait">
        {isOpenPalm && (
          <motion.div
            key="openpalm"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: elementCfg.glow + 'aa' }}
            >
              {elementCfg.emoji} {elementCfg.label} mengalir...
            </p>
          </motion.div>
        )}

        {/* Hold ring for non-open-palm gestures */}
        {isHolding && (
          <motion.div
            key={currentGesture}
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4"
          >
            <motion.span
              animate={{ scale: [1, 1.07, 1] }}
              transition={{ duration: 0.7, repeat: Infinity }}
              className="text-8xl drop-shadow-2xl"
            >
              {GESTURE_EMOJI[currentGesture]}
            </motion.span>

            <div className="relative h-12 w-12">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                <motion.circle
                  cx="20" cy="20" r="17"
                  fill="none"
                  stroke={currentElemCfg.glow}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${holdProgress * 106.8} 106.8`}
                  transition={{ duration: 0.05 }}
                />
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
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/30">
              Tahan sebentar...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom: gesture guide + pinch hint */}
      <div
        className="absolute inset-x-0 z-10 flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Pinch hint */}
        <p className="text-[10px] font-medium uppercase tracking-widest text-white/25">
          🤏 cubitan untuk ganti elemen
        </p>

        {/* Gesture bar */}
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2.5 backdrop-blur-md sm:gap-3 sm:px-6 sm:py-3">
          {GESTURES.map(key => {
            const isActive = currentGesture === key
            return (
              <motion.div
                key={key}
                title={GESTURE_LABEL[key]}
                animate={
                  isActive
                    ? { scale: 1.35, opacity: 1, filter: 'grayscale(0)' }
                    : { scale: 1, opacity: 0.35, filter: 'grayscale(0.8)' }
                }
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="cursor-default text-lg sm:text-xl"
                style={isActive ? { filter: `drop-shadow(0 0 6px ${elementCfg.glow})` } : undefined}
              >
                {GESTURE_EMOJI[key]}
              </motion.div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
