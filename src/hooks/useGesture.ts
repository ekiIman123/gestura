import { useEffect, useRef, useState } from 'react'
import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision'
import type { GestureRecognizerResult } from '@mediapipe/tasks-vision'
import { HAND_CONNECTIONS } from '../lib/gestures'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'
const HOLD_MS = 900

interface UseGestureOptions {
  onGesture: (gesture: string) => void
  enabled: boolean
}

export function useGesture({ onGesture, enabled }: UseGestureOptions) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const rafRef = useRef<number>(0)
  const lastGestureRef = useRef('')
  const holdStartRef = useRef(0)
  const firedRef = useRef(false)
  const enabledRef = useRef(enabled)
  const onGestureRef = useRef(onGesture)

  const [currentGesture, setCurrentGesture] = useState('')
  const [holdProgress, setHoldProgress] = useState(0)
  const [ready, setReady] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Memuat model AI...')
  const [error, setError] = useState('')

  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { onGestureRef.current = onGesture }, [onGesture])

  useEffect(() => {
    let stream: MediaStream | null = null
    let mounted = true

    async function init() {
      try {
        setLoadingMsg('Memuat model AI...')
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        if (!mounted) return
        recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.65,
          minHandPresenceConfidence: 0.65,
          minTrackingConfidence: 0.5,
        })

        if (!mounted) return
        setLoadingMsg('Mengakses kamera...')
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        })

        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        const video = videoRef.current!
        video.srcObject = stream
        try {
          await video.play()
        } catch {
          // interrupted by cleanup — ignore
          return
        }
        if (!mounted) return
        setReady(true)
        loop()
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Gagal menginisialisasi')
      }
    }

    function loop() {
      const video = videoRef.current
      const canvas = canvasRef.current
      const rec = recognizerRef.current
      if (!video || !canvas || !rec || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const now = performance.now()
      const results = rec.recognizeForVideo(video, now)
      drawOverlay(canvas, video, results)

      const mediapipeName = results.gestures?.[0]?.[0]?.categoryName ?? 'None'
      const landmarks = results.landmarks?.[0]
      // Custom shaka (🤙) detection — overrides MediaPipe classification
      const name = (mediapipeName !== 'None' && landmarks && detectShaka(landmarks))
        ? 'Shaka'
        : mediapipeName

      if (!enabledRef.current || name === 'None') {
        if (name === 'None') {
          lastGestureRef.current = ''
          firedRef.current = false
          setCurrentGesture('')
          setHoldProgress(0)
        }
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      if (name !== lastGestureRef.current) {
        lastGestureRef.current = name
        holdStartRef.current = now
        firedRef.current = false
        setCurrentGesture(name)
        setHoldProgress(0)
      } else if (!firedRef.current) {
        const elapsed = now - holdStartRef.current
        const progress = Math.min(elapsed / HOLD_MS, 1)
        setHoldProgress(progress)
        if (elapsed >= HOLD_MS) {
          firedRef.current = true
          setHoldProgress(1)
          onGestureRef.current(name)
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    init()
    return () => {
      mounted = false
      cancelAnimationFrame(rafRef.current)
      stream?.getTracks().forEach(t => t.stop())
      recognizerRef.current?.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { videoRef, canvasRef, currentGesture, holdProgress, ready, loadingMsg, error }
}

type Lm = { x: number; y: number; z: number }

function dist2d(a: Lm, b: Lm): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

// Returns true for 🤙 shaka: thumb + pinky extended, index/middle/ring curled.
// MediaPipe landmarks: 0=wrist, 4=thumb tip, 5=index MCP, 8=index tip,
// 9=middle MCP, 12=middle tip, 13=ring MCP, 16=ring tip, 17=pinky MCP, 20=pinky tip
function detectShaka(lm: Lm[]): boolean {
  if (lm.length < 21) return false
  const palm = dist2d(lm[0], lm[9])   // wrist → middle MCP as scale reference
  if (palm < 0.05) return false        // hand too small / not detected properly

  const thumbOut  = dist2d(lm[4],  lm[5])  > palm * 0.85  // thumb tip far from index MCP
  const indexIn   = dist2d(lm[8],  lm[5])  < palm * 0.65  // index tip near its own MCP
  const middleIn  = dist2d(lm[12], lm[9])  < palm * 0.65
  const ringIn    = dist2d(lm[16], lm[13]) < palm * 0.65
  const pinkyOut  = dist2d(lm[20], lm[17]) > palm * 0.55  // pinky tip far from its MCP

  return thumbOut && indexIn && middleIn && ringIn && pinkyOut
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  results: GestureRecognizerResult,
) {
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const landmarks = results.landmarks?.[0]
  if (!landmarks) return

  ctx.strokeStyle = 'rgba(167, 139, 250, 0.85)'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  HAND_CONNECTIONS.forEach(([a, b]) => {
    ctx.beginPath()
    ctx.moveTo(landmarks[a].x * canvas.width, landmarks[a].y * canvas.height)
    ctx.lineTo(landmarks[b].x * canvas.width, landmarks[b].y * canvas.height)
    ctx.stroke()
  })

  landmarks.forEach((lm, i) => {
    const x = lm.x * canvas.width
    const y = lm.y * canvas.height
    ctx.beginPath()
    ctx.arc(x, y, i === 0 ? 7 : 4, 0, Math.PI * 2)
    ctx.fillStyle = i === 0 ? 'rgba(139, 92, 246, 1)' : 'rgba(255,255,255,0.92)'
    ctx.fill()
    if (i === 0) {
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  })
}
