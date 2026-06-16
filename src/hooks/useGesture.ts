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
  onPinch: () => void
  enabled: boolean
}

export function useGesture({ onGesture, onPinch, enabled }: UseGestureOptions) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const rafRef = useRef<number>(0)
  const lastGestureRef = useRef('')
  const holdStartRef = useRef(0)
  const firedRef = useRef(false)
  const enabledRef = useRef(enabled)
  const onGestureRef = useRef(onGesture)
  const onPinchRef = useRef(onPinch)
  const pinchFiredRef = useRef(false)

  // hand position refs — updated every frame, no re-renders
  const handCenterRef  = useRef<{ x: number; y: number } | null>(null)
  const handCentersRef = useRef<Array<{ x: number; y: number } | null>>([null, null])

  const [currentGesture, setCurrentGesture] = useState('')
  const [holdProgress, setHoldProgress] = useState(0)
  const [ready, setReady] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Memuat model AI...')
  const [error, setError] = useState('')

  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { onGestureRef.current = onGesture }, [onGesture])
  useEffect(() => { onPinchRef.current = onPinch }, [onPinch])

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
          numHands: 2,
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

      const lm = results.landmarks?.[0]

      // Update all hand centers (no state = no re-render)
      const allLm = results.landmarks ?? []
      handCentersRef.current = [
        allLm[0] ? getHandCenter(allLm[0]) : null,
        allLm[1] ? getHandCenter(allLm[1]) : null,
      ]
      handCenterRef.current = handCentersRef.current[0]

      // Pinch detection — fires onPinch once per pinch gesture (with hold)
      const pinching = !!lm && detectPinch(lm)
      if (pinching) {
        if (!pinchFiredRef.current) {
          // Require a short hold before firing (reuse holdStart for pinch)
          if (lastGestureRef.current !== '__pinch__') {
            lastGestureRef.current = '__pinch__'
            holdStartRef.current = now
          } else if (now - holdStartRef.current >= 500) {
            pinchFiredRef.current = true
            onPinchRef.current()
          }
        }
        // Hide gesture UI while pinching
        if (currentGesture !== '') {
          setCurrentGesture('')
          setHoldProgress(0)
          firedRef.current = false
        }
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      // Reset pinch state when not pinching
      if (lastGestureRef.current === '__pinch__') {
        lastGestureRef.current = ''
        pinchFiredRef.current = false
      } else {
        pinchFiredRef.current = false
      }

      const mediapipeName = results.gestures?.[0]?.[0]?.categoryName ?? 'None'
      // Custom shaka (🤙) detection
      const name = (mediapipeName !== 'None' && lm && detectShaka(lm))
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

      // Open_Palm fires immediately (no hold needed — continuous mode)
      if (name === 'Open_Palm') {
        if (lastGestureRef.current !== 'Open_Palm') {
          lastGestureRef.current = 'Open_Palm'
          firedRef.current = false
          setCurrentGesture('Open_Palm')
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

  return { videoRef, canvasRef, currentGesture, holdProgress, ready, loadingMsg, error, handCenterRef, handCentersRef }
}

type Lm = { x: number; y: number; z: number }

function dist2d(a: Lm, b: Lm): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function getHandCenter(lm: Lm[]): { x: number; y: number } {
  // Average of wrist + 4 MCP joints = palm center
  const pts = [lm[0], lm[5], lm[9], lm[13], lm[17]]
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  }
}

// Pinch: thumb tip (4) close to index tip (8)
function detectPinch(lm: Lm[]): boolean {
  if (lm.length < 21) return false
  const palm = dist2d(lm[0], lm[9])
  return dist2d(lm[4], lm[8]) < palm * 0.38
}

// Shaka 🤙: thumb + pinky extended, index/middle/ring curled
function detectShaka(lm: Lm[]): boolean {
  if (lm.length < 21) return false
  const w = lm[0]
  const thumbExt   = dist2d(lm[4], lm[2]) > dist2d(lm[3], lm[2])
  const indexCurl  = dist2d(lm[8],  w) < dist2d(lm[6],  w)
  const middleCurl = dist2d(lm[12], w) < dist2d(lm[10], w)
  const ringCurl   = dist2d(lm[16], w) < dist2d(lm[14], w)
  const pinkyExt   = dist2d(lm[20], w) > dist2d(lm[18], w)
  return thumbExt && indexCurl && middleCurl && ringCurl && pinkyExt
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

  const allLandmarks = results.landmarks ?? []
  if (!allLandmarks.length) return

  for (const landmarks of allLandmarks) {
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
}
