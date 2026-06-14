import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Suppress known MediaPipe WASM internal noise
const MP_NOISE = [
  'gl_context',
  'inference_feedback_manager',
  'landmark_projection_calculator',
  'XNNPACK delegate',
  'W06',
]
const _warn = console.warn.bind(console)
const _error = console.error.bind(console)
const isMP = (...args: unknown[]) => MP_NOISE.some(p => String(args[0] ?? '').includes(p))
console.warn  = (...args) => { if (!isMP(...args)) _warn(...args) }
console.error = (...args) => { if (!isMP(...args)) _error(...args) }

createRoot(document.getElementById('root')!).render(<App />)
