import { db, type Meeting, type Slide, type TranscriptSegment } from './db'
import { transcribeAudio } from './whisper'
import { generateSummary, generateSlideCaption } from './ai'

export type ProcessStep = 'saving' | 'transcribing' | 'summarizing' | 'aligning' | 'captions' | 'done' | 'error'

export interface ProcessProgress {
  step: ProcessStep
  message: string
  percent: number
}

export async function processMeeting(
  meetingId: string,
  onProgress: (p: ProcessProgress) => void
): Promise<void> {
  try {
    const meeting = await db.meetings.get(meetingId)
    if (!meeting || !meeting.audioBlob) throw new Error('Meeting or audio not found')

    await db.meetings.update(meetingId, { status: 'processing' })

    // Step 1: Transcribe
    onProgress({ step: 'transcribing', message: '正在轉換逐字稿...', percent: 10 })
    const whisperResult = await transcribeAudio(meeting.audioBlob, (msg, pct) => {
      onProgress({ step: 'transcribing', message: msg, percent: 10 + pct * 0.4 })
    })

    await db.meetings.update(meetingId, {
      transcriptFull: whisperResult.text,
      transcriptSegments: whisperResult.segments,
    })

    // Step 2: Generate summary
    onProgress({ step: 'summarizing', message: '正在生成 AI 摘要...', percent: 55 })
    const summary = await generateSummary(whisperResult.text)

    await db.meetings.update(meetingId, {
      summaryKeyPoints: summary.keyPoints,
      summaryActionItems: summary.actionItems,
      summaryRaw: summary.raw,
    })

    // Step 3: Align photos to transcript
    onProgress({ step: 'aligning', message: '正在對齊投影片時間軸...', percent: 70 })
    const slides: Slide[] = []

    if (meeting.photos.length > 0 && whisperResult.segments.length > 0) {
      for (const photo of meeting.photos) {
        const windowStart = photo.timestamp - 30
        const windowEnd = photo.timestamp + 60
        const related = whisperResult.segments
          .filter((s: TranscriptSegment) => s.start >= windowStart && s.end <= windowEnd)
          .map((s: TranscriptSegment) => s.text)
          .join('')

        slides.push({
          photoId: photo.id,
          timestamp: photo.timestamp,
          relatedTranscript: related,
          aiCaption: '', // will fill next
        })
      }

      // Step 4: Generate captions for each slide
      onProgress({ step: 'captions', message: '正在生成投影片說明...', percent: 75 })
      for (let i = 0; i < slides.length; i++) {
        if (slides[i].relatedTranscript.length > 10) {
          const pct = 75 + (i / slides.length) * 20
          onProgress({ step: 'captions', message: `生成說明 (${i + 1}/${slides.length})...`, percent: pct })
          slides[i].aiCaption = await generateSlideCaption(slides[i].relatedTranscript)
        }
      }

      await db.meetings.update(meetingId, { slides })
    }

    // Done
    await db.meetings.update(meetingId, { status: 'done' })
    onProgress({ step: 'done', message: '處理完成！', percent: 100 })

  } catch (err: any) {
    console.error('Processing error:', err)
    await db.meetings.update(meetingId, { status: 'error' })
    onProgress({ step: 'error', message: `錯誤：${err.message}`, percent: 0 })
    throw err
  }
}
