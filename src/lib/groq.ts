const API_KEY = import.meta.env.VITE_GROQ_API_KEY as string

export async function generateResponse(prompt: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 80,
      temperature: 0.9,
      messages: [
        {
          role: 'system',
          content:
            'Kamu adalah AI companion yang menjawab singkat, hangat, dan natural. Maksimal 2 kalimat. Jangan pakai emoji.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}
