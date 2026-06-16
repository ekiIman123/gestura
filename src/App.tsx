import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGesture } from './hooks/useGesture'
import { generateResponse } from './lib/groq'
import { speak } from './lib/tts'
import { GESTURE_EMOJI, GESTURE_LABEL, GESTURE_PROMPTS, HIDDEN_GESTURE_EMOJI } from './lib/gestures'
import { GESTURE_ELEMENT, ELEMENT_CONFIG } from './lib/elements'
import { ElementEffect } from './components/ElementEffect'

type Status = 'idle' | 'thinking' | 'speaking'

const GESTURES = Object.keys(GESTURE_EMOJI)
const ALL_EMOJI = { ...GESTURE_EMOJI, ...HIDDEN_GESTURE_EMOJI }

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [activeGesture, setActiveGesture] = useState('')
  const [response, setResponse] = useState('')
  const [elementTrigger, setElementTrigger] = useState(0)
  const [flash, setFlash] = useState(false)
  const busyRef = useRef(false)
  const sequenceRef = useRef<{ gesture: string; time: number }[]>([])

  const activeElement = GESTURE_ELEMENT[activeGesture] ?? null
  const currentElementCfg = activeElement ? ELEMENT_CONFIG[activeElement] : null

  const triggerResponse = useCallback(async (gesture: string, overrideText?: string) => {
    busyRef.current = true
    setActiveGesture(gesture)
    setStatus(overrideText ? 'speaking' : 'thinking')
    setResponse('')
    setElementTrigger(t => t + 1)

    // Flash screen for lightning
    if (GESTURE_ELEMENT[gesture] === 'lightning') {
      setFlash(true)
      setTimeout(() => setFlash(false), 180)
    }

    try {
      const text = overrideText ?? await generateResponse(GESTURE_PROMPTS[gesture])
      setResponse(text)
      setStatus('speaking')
      await speak(text)
    } catch {
      const fallback = 'Maaf, ada gangguan koneksi.'
      setResponse(fallback)
      setStatus('speaking')
      await speak(fallback)
    } finally {
      setStatus('idle')
      busyRef.current = false
      setTimeout(() => { setResponse(''); setActiveGesture('') }, 5000)
    }
  }, [])

  const handleGesture = useCallback((gesture: string) => {
    if (busyRef.current) return

    // Hidden: 🤙 (Shaka) = play the actual "Hidup Jokowi!" meme audio
    if (gesture === 'Shaka') {
      busyRef.current = true
      setActiveGesture('Shaka')
      setStatus('speaking')
      setResponse('Hidup Jokowi! 🇮🇩')
      const audio = new Audio('/hidup-jokowi.mp3')
      audio.onended = () => {
        setStatus('idle')
        busyRef.current = false
        setTimeout(() => { setResponse(''); setActiveGesture('') }, 3000)
      }
      audio.onerror = () => {
        setStatus('idle')
        busyRef.current = false
        setTimeout(() => { setResponse(''); setActiveGesture('') }, 3000)
      }
      audio.play()
      return
    }

    // Track sequence for hidden easter egg
    const now = Date.now()
    const seq = sequenceRef.current
    seq.push({ gesture, time: now })
    if (seq.length > 2) seq.shift()

    // Secret: 👍 then 👎 within 2.5s = "Hidup Jokowi!"
    if (
      seq.length === 2 &&
      seq[0].gesture === 'Thumb_Up' &&
      seq[1].gesture === 'Thumb_Down' &&
      now - seq[0].time < 2500
    ) {
      sequenceRef.current = []
      triggerResponse('🇮🇩', 'Hidup Jokowi!')
      return
    }

    triggerResponse(gesture)
  }, [triggerResponse])

  const { videoRef, canvasRef, currentGesture, holdProgress, ready, loadingMsg, error } =
    useGesture({ onGesture: handleGesture, enabled: status === 'idle' })

  const isBusy = status !== 'idle'
  const currentElement = GESTURE_ELEMENT[currentGesture] ?? null
  const currentElemCfg = currentElement ? ELEMENT_CONFIG[currentElement] : null

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

      {/* Element particle effect */}
      <ElementEffect element={activeElement ?? ''} trigger={elementTrigger} />

      {/* Lightning screen flash */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key="flash"
            initial={{ opacity: 0.7 }}
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
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5">
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

        <div className="w-24" />
      </div>

      {/* Centre: gesture hold indicator */}
      <AnimatePresence mode="wait">
        {currentGesture && !isBusy && (
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
              {ALL_EMOJI[currentGesture]}
            </motion.span>

            {/* Hold progress ring — colored by element */}
            <div className="relative h-12 w-12">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                <motion.circle
                  cx="20" cy="20" r="17"
                  fill="none"
                  stroke={currentElemCfg ? currentElemCfg.glow : 'rgba(167,139,250,0.9)'}
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

            {currentElemCfg && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: currentElemCfg.glow }}>
                {currentElemCfg.emoji} {currentElemCfg.label}
              </p>
            )}
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/30">
              Tahan sebentar...
            </p>
          </motion.div>
        )}

        {status === 'thinking' && (
          <motion.div
            key="thinking"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-5"
          >
            <span className="text-7xl drop-shadow-2xl">{ALL_EMOJI[activeGesture]}</span>
            <div className="flex items-end gap-1">
              {[0, 1, 2, 3, 4].map(i => (
                <motion.div
                  key={i}
                  className="w-1 rounded-full"
                  style={{ backgroundColor: currentElementCfg?.glow ?? 'rgb(167,139,250)' }}
                  animate={{ height: ['4px', `${12 + i * 4}px`, '4px'] }}
                  transition={{ duration: 0.6, delay: i * 0.1, repeat: Infinity }}
                />
              ))}
            </div>
            {currentElementCfg && (
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: currentElementCfg.glow }}>
                {currentElementCfg.emoji} {currentElementCfg.label}
              </p>
            )}
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">AI sedang berpikir...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Response card — colored border by element */}
      <AnimatePresence>
        {response && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="absolute inset-x-4 mx-auto max-w-md"
            style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div
              className="overflow-hidden rounded-2xl border bg-black/75 shadow-2xl backdrop-blur-xl"
              style={{
                borderColor: currentElementCfg ? currentElementCfg.glow + '55' : 'rgba(255,255,255,0.1)',
                boxShadow: currentElementCfg
                  ? `0 0 40px ${currentElementCfg.glow}30, 0 25px 50px -12px rgba(0,0,0,0.5)`
                  : undefined,
              }}
            >
              <div className="flex items-start gap-3 p-5">
                <span className="shrink-0 text-xl">{ALL_EMOJI[activeGesture]}</span>
                <div className="flex-1">
                  {currentElementCfg && (
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: currentElementCfg.glow }}>
                      {currentElementCfg.emoji} Elemen {currentElementCfg.label}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed text-white/90">{response}</p>
                </div>
              </div>

              {/* Waveform while speaking — colored by element */}
              {status === 'speaking' && (
                <div className="flex h-8 items-center gap-px border-t border-white/5 px-4">
                  {Array.from({ length: 32 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="flex-1 rounded-full"
                      style={{ backgroundColor: (currentElementCfg?.glow ?? '#a78bfa') + 'cc' }}
                      animate={{
                        height: [
                          `${2 + Math.random() * 3}px`,
                          `${6 + Math.random() * 20}px`,
                          `${2 + Math.random() * 3}px`,
                        ],
                      }}
                      transition={{
                        duration: 0.25 + Math.random() * 0.35,
                        repeat: Infinity,
                        delay: i * 0.025,
                      }}
                    />
                  ))}
                  <span className="ml-3 shrink-0 text-[9px] font-semibold uppercase tracking-widest text-white/25">
                    Speaking
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom gesture guide */}
      <div
        className="absolute inset-x-0 z-10 flex justify-center px-4"
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2.5 backdrop-blur-md sm:gap-3 sm:px-6 sm:py-3">
          {GESTURES.map(key => {
            const elCfg = GESTURE_ELEMENT[key] ? ELEMENT_CONFIG[GESTURE_ELEMENT[key]] : null
            const isActive = currentGesture === key || activeGesture === key
            return (
              <motion.div
                key={key}
                title={`${GESTURE_LABEL[key]}${elCfg ? ` · ${elCfg.label}` : ''}`}
                animate={
                  isActive
                    ? { scale: 1.35, opacity: 1, filter: 'grayscale(0)' }
                    : { scale: 1, opacity: 0.35, filter: 'grayscale(0.8)' }
                }
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="cursor-default text-lg sm:text-xl"
                style={isActive && elCfg ? { filter: `drop-shadow(0 0 6px ${elCfg.glow})` } : undefined}
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
