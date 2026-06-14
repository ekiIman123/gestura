const ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL' // Bella — supports multilingual

export async function speak(text: string): Promise<void> {
  if (ELEVENLABS_KEY) {
    return speakElevenLabs(text)
  }
  return speakWebSpeech(text)
}

async function speakElevenLabs(text: string): Promise<void> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })
  if (!res.ok) return speakWebSpeech(text)
  const buffer = await res.arrayBuffer()
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(buffer)
  const source = ctx.createBufferSource()
  source.buffer = decoded
  source.connect(ctx.destination)
  source.start()
  return new Promise(resolve => { source.onended = () => resolve() })
}

function speakWebSpeech(text: string): Promise<void> {
  return new Promise(resolve => {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'id-ID'
    utter.rate = 1.05
    utter.pitch = 1.1
    utter.volume = 1
    utter.onend = () => resolve()
    utter.onerror = () => resolve()
    window.speechSynthesis.speak(utter)
  })
}
