import { create } from 'zustand'
import type { ProcessProgress } from '../services/processor'

interface MeetingStore {
  // Recording state
  isRecording: boolean
  recordingStartTime: number | null
  elapsedSeconds: number
  photoCount: number

  // Processing state
  processing: ProcessProgress | null

  // Actions
  startRecording: () => void
  stopRecording: () => void
  tick: () => void
  addPhoto: () => void
  setProcessing: (p: ProcessProgress | null) => void
}

export const useMeetingStore = create<MeetingStore>((set, get) => ({
  isRecording: false,
  recordingStartTime: null,
  elapsedSeconds: 0,
  photoCount: 0,
  processing: null,

  startRecording: () => set({
    isRecording: true,
    recordingStartTime: Date.now(),
    elapsedSeconds: 0,
    photoCount: 0,
  }),

  stopRecording: () => set({
    isRecording: false,
  }),

  tick: () => {
    const start = get().recordingStartTime
    if (start) {
      set({ elapsedSeconds: Math.floor((Date.now() - start) / 1000) })
    }
  },

  addPhoto: () => set(s => ({ photoCount: s.photoCount + 1 })),

  setProcessing: (p) => set({ processing: p }),
}))
