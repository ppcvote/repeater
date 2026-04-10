import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Mic, X, Check } from 'lucide-react'
import { db, type Photo } from '../services/db'
import { useMeetingStore } from '../store/meetingStore'
import { processMeeting, type ProcessProgress } from '../services/processor'

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h > 0 ? String(h).padStart(2, '0') + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function NewMeeting() {
  const navigate = useNavigate()
  const { isRecording, elapsedSeconds, photoCount, processing, startRecording, stopRecording, tick, addPhoto, setProcessing } = useMeetingStore()

  const [title, setTitle] = useState(`會議 ${new Date().toLocaleDateString('zh-TW')}`)
  const [showConfirmStop, setShowConfirmStop] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const meetingIdRef = useRef<string>('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartRef = useRef<number>(0)

  // Camera setup
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      console.error('Camera error:', err)
    }
  }, [])

  // Start recording
  const handleStart = async () => {
    meetingIdRef.current = crypto.randomUUID()
    audioChunksRef.current = []
    recordingStartRef.current = Date.now()

    // Start microphone recording
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(audioStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.start(1000) // collect data every 1s
      mediaRecorderRef.current = recorder
    } catch (err) {
      console.error('Mic error:', err)
      alert('無法存取麥克風，請檢查權限設定。')
      return
    }

    startRecording()
    await startCamera()

    // Timer
    timerRef.current = setInterval(tick, 1000)

    // Save initial meeting record
    await db.meetings.put({
      id: meetingIdRef.current,
      title,
      createdAt: new Date().toISOString(),
      status: 'recording',
      photos: [],
    })
  }

  // Take photo
  const handlePhoto = () => {
    if (!videoRef.current || !streamRef.current) return

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)

    canvas.toBlob(async (blob) => {
      if (!blob) return

      const timestamp = Math.floor((Date.now() - recordingStartRef.current) / 1000)
      const photo: Photo = {
        id: crypto.randomUUID(),
        blob,
        timestamp,
      }

      setPhotos(prev => [...prev, photo])
      addPhoto()

      // Update meeting in DB
      const meeting = await db.meetings.get(meetingIdRef.current)
      if (meeting) {
        await db.meetings.update(meetingIdRef.current, {
          photos: [...meeting.photos, photo],
        })
      }
    }, 'image/jpeg', 0.85)
  }

  // Stop recording
  const handleStop = async () => {
    setShowConfirmStop(false)

    // Stop timer
    if (timerRef.current) clearInterval(timerRef.current)

    // Stop recorder
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
    }

    // Stop camera
    streamRef.current?.getTracks().forEach(t => t.stop())

    stopRecording()

    // Wait a tick for final data
    await new Promise(r => setTimeout(r, 500))

    // Save audio
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
    const duration = Math.floor((Date.now() - recordingStartRef.current) / 1000)

    await db.meetings.update(meetingIdRef.current, {
      audioBlob,
      audioDuration: duration,
      audioStartTime: new Date(recordingStartRef.current).toISOString(),
      title,
    })

    // Start processing
    const id = meetingIdRef.current
    setProcessing({ step: 'saving', message: '儲存錄音...', percent: 5 })

    try {
      await processMeeting(id, (p: ProcessProgress) => setProcessing(p))
      setTimeout(() => {
        setProcessing(null)
        navigate(`/meeting/${id}`)
      }, 1000)
    } catch {
      // Error state is set by processor
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  // Processing screen
  if (processing) {
    return (
      <div className="animate-fadeIn flex flex-col items-center justify-center min-h-dvh p-6 max-w-lg mx-auto">
        <div className="w-full bg-surface rounded-2xl p-8">
          <h2 className="font-heading text-xl font-bold text-gold mb-6 text-center">處理中</h2>

          {/* Progress bar */}
          <div className="w-full bg-navy rounded-full h-3 mb-4">
            <div
              className="bg-gold h-3 rounded-full transition-all duration-500"
              style={{ width: `${processing.percent}%` }}
            />
          </div>

          <p className="text-center text-sm text-text-dim">{processing.message}</p>
          <p className="text-center text-xs text-text-dim mt-2">{processing.percent}%</p>

          {/* Steps */}
          <div className="mt-6 space-y-2 text-sm">
            {[
              { key: 'saving', label: '儲存錄音' },
              { key: 'transcribing', label: '轉換逐字稿' },
              { key: 'summarizing', label: 'AI 分析摘要' },
              { key: 'aligning', label: '對齊投影片時間軸' },
              { key: 'captions', label: '產生簡報說明' },
              { key: 'done', label: '完成' },
            ].map(s => {
              const steps: string[] = ['saving', 'transcribing', 'summarizing', 'aligning', 'captions', 'done']
              const currentIdx = steps.indexOf(processing.step)
              const thisIdx = steps.indexOf(s.key)
              const isDone = thisIdx < currentIdx || processing.step === 'done'
              const isCurrent = s.key === processing.step

              return (
                <div key={s.key} className={`flex items-center gap-2 ${isCurrent ? 'text-gold' : isDone ? 'text-success' : 'text-text-dim'}`}>
                  <span>{isDone ? '✅' : isCurrent ? '⏳' : '⬜'}</span>
                  <span>{s.label}</span>
                </div>
              )
            })}
          </div>

          {processing.step === 'error' && (
            <button
              onClick={() => { setProcessing(null); navigate('/') }}
              className="mt-6 w-full py-3 bg-red-500/20 text-red-400 rounded-xl"
            >
              返回首頁
            </button>
          )}
        </div>
      </div>
    )
  }

  // Not recording yet
  if (!isRecording) {
    return (
      <div className="animate-fadeIn flex flex-col items-center justify-center min-h-dvh p-6 max-w-lg mx-auto">
        {/* Title input */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="bg-transparent text-center text-lg font-bold text-text border-b border-surface-light pb-2 mb-8 w-full outline-none focus:border-gold transition-colors"
          placeholder="會議標題"
        />

        {/* Start button */}
        <button
          onClick={handleStart}
          className="w-32 h-32 rounded-full bg-surface border-4 border-gold/30 flex items-center justify-center hover:border-gold hover:scale-105 active:scale-95 transition-all"
        >
          <Mic className="w-14 h-14 text-gold" />
        </button>
        <p className="text-text-dim text-sm mt-4">點擊開始錄音</p>

        <button onClick={() => navigate('/')} className="mt-8 text-text-dim text-sm hover:text-text">
          返回
        </button>
      </div>
    )
  }

  // Recording state
  return (
    <div className="flex flex-col h-dvh max-w-lg mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between p-3 bg-navy/80 backdrop-blur-sm z-10">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="bg-transparent text-sm font-bold text-text outline-none flex-1 mr-2"
        />
        <button
          onClick={() => setShowConfirmStop(true)}
          className="px-4 py-1.5 bg-rec/20 text-rec text-sm font-bold rounded-lg"
        >
          結束
        </button>
      </div>

      {/* Camera viewfinder */}
      <div className="relative flex-1 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Photo count */}
        <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1 flex items-center gap-1.5">
          <Camera className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-bold">{photoCount}</span>
        </div>

        {/* Shutter button */}
        <div className="absolute bottom-4 right-4">
          <button
            onClick={handlePhoto}
            className="w-16 h-16 rounded-full bg-white/90 border-4 border-white flex items-center justify-center active:scale-90 transition-transform shadow-lg"
          >
            <Camera className="w-7 h-7 text-navy" />
          </button>
        </div>
      </div>

      {/* Bottom: Timer + Photo strip */}
      <div className="bg-surface p-3">
        {/* Timer */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="w-3 h-3 rounded-full bg-rec animate-blink" />
          <span className="font-mono text-lg font-bold text-text tracking-wider">
            REC {formatTime(elapsedSeconds)}
          </span>
        </div>

        {/* Photo strip */}
        {photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => (
              <div key={p.id} className="relative flex-shrink-0">
                <img
                  src={URL.createObjectURL(p.blob)}
                  className="w-16 h-16 rounded-lg object-cover border border-surface-light"
                  alt={`Photo ${i + 1}`}
                />
                <span className="absolute bottom-0.5 right-0.5 text-[10px] bg-black/60 text-white px-1 rounded">
                  {formatTime(p.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm stop modal */}
      {showConfirmStop && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl p-6 w-full max-w-sm">
            <p className="text-center font-bold mb-1">結束錄音？</p>
            <p className="text-center text-text-dim text-sm mb-6">結束後將開始處理逐字稿和摘要</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmStop(false)}
                className="flex-1 py-3 bg-surface-light rounded-xl flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" /> 繼續錄音
              </button>
              <button
                onClick={handleStop}
                className="flex-1 py-3 bg-gold text-navy font-bold rounded-xl flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> 確定結束
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
