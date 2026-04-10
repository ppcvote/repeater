const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY

// Use Groq's LLM (llama-3.3-70b) for summaries — free and fast
async function chatComplete(system: string, user: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`AI API error: ${res.status} ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

export async function generateSummary(transcript: string): Promise<{
  keyPoints: string[]
  actionItems: string[]
  raw: string
}> {
  const system = '你是一個會議記錄助理，擅長整理台灣金融業說明會內容。請用繁體中文回覆。'
  const user = `以下是一場會議的完整逐字稿，請提供：
1. 重點摘要（5-8個條列，每個20-40字）
2. 關鍵數據（有提到的數字、百分比、產品名稱）
3. 待辦事項（如果有的話）

請用以下JSON格式回覆（不要markdown code block）：
{
  "keyPoints": ["重點1", "重點2", ...],
  "actionItems": ["待辦1", "待辦2", ...],
  "raw": "完整摘要文字"
}

逐字稿：
${transcript.slice(0, 12000)}`

  const response = await chatComplete(system, user)

  try {
    const clean = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return {
      keyPoints: [response.slice(0, 200)],
      actionItems: [],
      raw: response,
    }
  }
}

export async function generateSlideCaption(relatedTranscript: string): Promise<string> {
  const system = '你是一個簡報助理。用繁體中文回覆。'
  const user = `這是一場說明會中某個時間點前後說話的內容。請用2-3句話說明這個時間點在講什麼重點。

說話內容：${relatedTranscript.slice(0, 3000)}`

  return await chatComplete(system, user)
}
