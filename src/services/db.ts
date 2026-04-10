import Dexie, { type Table } from 'dexie'

export interface Photo {
  id: string
  blob: Blob
  timestamp: number // seconds since recording start
  enhancedBlob?: Blob
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface Slide {
  photoId: string
  timestamp: number
  relatedTranscript: string
  aiCaption: string
}

export interface Meeting {
  id: string
  title: string
  createdAt: string
  status: 'recording' | 'processing' | 'done' | 'error'

  // Audio
  audioBlob?: Blob
  audioDuration?: number
  audioStartTime?: string

  // Photos
  photos: Photo[]

  // Transcript
  transcriptFull?: string
  transcriptSegments?: TranscriptSegment[]

  // Summary
  summaryKeyPoints?: string[]
  summaryActionItems?: string[]
  summaryRaw?: string

  // Slides
  slides?: Slide[]

  // Exports
  pptxBlob?: Blob
}

class RepeaterDB extends Dexie {
  meetings!: Table<Meeting, string>

  constructor() {
    super('RepeaterDB')
    this.version(1).stores({
      meetings: 'id, createdAt, status'
    })
  }
}

export const db = new RepeaterDB()
