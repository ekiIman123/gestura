import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGesture } from './hooks/useGesture'
import { generateResponse } from './lib/groq'
import { speak } from './lib/tts'
import { GESTURE_EMOJI, GESTURE_LABEL, GESTURE_PROMPTS } from './lib/gestures'

type Status = 'idle' | 'thinking' | 'speaking'

const GESTURES = Object.keys(GESTURE_EMOJI)

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [activeGesture, setActiveGesture] = useState('')
  const [response, setResponse] = useState('')
  const busyRef = useRef(false)

  const handleGesture = useCallback(async (gesture: string) => {
    if (busyRef.current) return
    busyRef.current = true
    setActiveGesture(gesture)
    setStatus('thinking')
    setResponse('')

    try {
      const text = await generateResponse(GESTURE_PROMPTS[gesture])
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

  const { videoRef, canvasRef, currentGesture, holdProgress, ready, loadingMsg, error } =
    useGesture({ onGesture: handleGesture, enabled: status === 'idle' })

  const isBusy = status !== 'idle'

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
              {GESTURE_EMOJI[currentGesture]}
            </motion.span>

            {/* Hold progress ring */}
            <div className="relative h-12 w-12">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                <motion.circle
                  cx="20" cy="20" r="17"
                  fill="none"
                  stroke="rgba(167,139,250,0.9)"
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

            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/30">
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
            <span className="text-7xl drop-shadow-2xl">{GESTURE_EMOJI[activeGesture]}</span>
            <div className="flex items-end gap-1">
              {[0, 1, 2, 3, 4].map(i => (
                <motion.div
                  key={i}
                  className="w-1 rounded-full bg-violet-400"
                  animate={{ height: ['4px', `${12 + i * 4}px`, '4px'] }}
                  transition={{ duration: 0.6, delay: i * 0.1, repeat: Infinity }}
                />
              ))}
            </div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-white/30">AI sedang berpikir...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Response card */}
      <AnimatePresence>
        {response && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="absolute inset-x-4 bottom-24 mx-auto max-w-md"
          >
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/75 shadow-2xl shadow-violet-900/20 backdrop-blur-xl">
              <div className="flex items-start gap-3 p-5">
                <span className="shrink-0 text-xl">{GESTURE_EMOJI[activeGesture]}</span>
                <p className="text-sm leading-relaxed text-white/90">{response}</p>
              </div>

              {/* Waveform while speaking */}
              {status === 'speaking' && (
                <div className="flex h-8 items-center gap-px border-t border-white/5 px-4">
                  {Array.from({ length: 32 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="flex-1 rounded-full bg-violet-400/80"
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
      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/60 px-6 py-3 backdrop-blur-md">
          {GESTURES.map(key => (
            <motion.div
              key={key}
              title={GESTURE_LABEL[key]}
              animate={
                currentGesture === key || activeGesture === key
                  ? { scale: 1.35, opacity: 1, filter: 'grayscale(0)' }
                  : { scale: 1, opacity: 0.35, filter: 'grayscale(0.8)' }
              }
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="text-xl cursor-default"
            >
              {GESTURE_EMOJI[key]}
            </motion.div>
          ))}
        </div>
      </div>

    </div>
  )
}
