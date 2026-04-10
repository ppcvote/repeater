const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const MAX_CHUNK_SIZE = 24 * 1024 * 1024 // 24MB to stay under 25MB limit

export interface WhisperSegment {
  start: number
  end: number
  text: string
}

export interface WhisperResult {
  text: string
  segments: WhisperSegment[]
}

async function transcribeChunk(blob: Blob, offset: number = 0): Promise<WhisperResult> {
  const formData = new FormData()
  formData.append('file', blob, 'audio.webm')
  formData.append('model', 'whisper-large-v3')
  formData.append('language', 'zh')
  formData.append('response_format', 'verbose_json')
  formData.append('timestamp_granularities[]', 'segment')
  // Prompt hints Whisper to output Traditional Chinese (繁體中文)
  formData.append('prompt', '以下是繁體中文的會議錄音逐字稿。請使用繁體中文輸出。')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Whisper API error: ${res.status} ${err}`)
  }

  const data = await res.json()

  // Adjust timestamps by offset for chunked audio
  const segments: WhisperSegment[] = (data.segments || []).map((s: any) => ({
    start: s.start + offset,
    end: s.end + offset,
    text: s.text?.trim() || '',
  }))

  return {
    text: data.text || '',
    segments,
  }
}

export async function transcribeAudio(
  audioBlob: Blob,
  onProgress?: (step: string, pct: number) => void
): Promise<WhisperResult> {
  // If small enough, transcribe in one go
  if (audioBlob.size <= MAX_CHUNK_SIZE) {
    onProgress?.('轉換逐字稿...', 50)
    const result = await transcribeChunk(audioBlob)
    onProgress?.('逐字稿完成', 100)
    return result
  }

  // Split into chunks
  const chunks: Blob[] = []
  let pos = 0
  while (pos < audioBlob.size) {
    chunks.push(audioBlob.slice(pos, pos + MAX_CHUNK_SIZE))
    pos += MAX_CHUNK_SIZE
  }

  const allSegments: WhisperSegment[] = []
  const allTexts: string[] = []

  // Estimate duration per chunk for offset calculation
  const totalDuration = audioBlob.size / (audioBlob.size / 1) // rough estimate
  const chunkDuration = totalDuration / chunks.length

  for (let i = 0; i < chunks.length; i++) {
    const pct = Math.round(((i + 1) / chunks.length) * 100)
    onProgress?.(`轉換逐字稿 (${i + 1}/${chunks.length})...`, pct)

    const offset = i * chunkDuration
    const result = await transcribeChunk(chunks[i], offset)
    allSegments.push(...result.segments)
    allTexts.push(result.text)
  }

  return {
    text: allTexts.join(' '),
    segments: allSegments,
  }
}
