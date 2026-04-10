import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, List, Presentation, Download, Clock, Image, RefreshCw, Trash2 } from 'lucide-react'
import { db, type Meeting, type TranscriptSegment } from '../services/db'
import { exportPPTX } from '../services/exportService'
import { generateSummary, generateSlideCaption } from '../services/ai'

type Tab = 'summary' | 'transcript' | 'slides'

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function MeetingResult() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [tab, setTab] = useState<Tab>('summary')
  const [exporting, setExporting] = useState(false)
  const [deletedSegments, setDeletedSegments] = useState<Set<number>>(new Set())
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    if (id) db.meetings.get(id).then(m => m && setMeeting(m))
  }, [id])

  // Delete segment (swipe left or tap X)
  const deleteSegment = (idx: number) => {
    setDeletedSegments(prev => {
      const next = new Set(prev)
      next.add(idx)
      return next
    })
  }

  // Undo delete
  const undoDelete = (idx: number) => {
    setDeletedSegments(prev => {
      const next = new Set(prev)
      next.delete(idx)
      return next
    })
  }

  // Regenerate summary from edited transcript
  const handleRegenerate = async () => {
    if (!meeting?.transcriptSegments) return
    setRegenerating(true)

    try {
      // Build cleaned transcript
      const cleanSegments = meeting.transcriptSegments.filter((_: TranscriptSegment, i: number) => !deletedSegments.has(i))
      const cleanText = cleanSegments.map((s: TranscriptSegment) => s.text).join(' ')

      // Update transcript in DB
      await db.meetings.update(meeting.id, {
        transcriptSegments: cleanSegments,
        transcriptFull: cleanText,
      })

      // Regenerate summary
      const summary = await generateSummary(cleanText)
      await db.meetings.update(meeting.id, {
        summaryKeyPoints: summary.keyPoints,
        summaryActionItems: summary.actionItems,
        summaryRaw: summary.raw,
      })

      // Regenerate slide captions if slides exist
      if (meeting.slides?.length) {
        const updatedSlides = [...meeting.slides]
        for (let i = 0; i < updatedSlides.length; i++) {
          const windowStart = updatedSlides[i].timestamp - 30
          const windowEnd = updatedSlides[i].timestamp + 60
          const related = cleanSegments
            .filter((s: TranscriptSegment) => s.start >= windowStart && s.end <= windowEnd)
            .map((s: TranscriptSegment) => s.text)
            .join('')
          updatedSlides[i].relatedTranscript = related
          if (related.length > 10) {
            updatedSlides[i].aiCaption = await generateSlideCaption(related)
          }
        }
        await db.meetings.update(meeting.id, { slides: updatedSlides })
      }

      // Reload meeting
      const updated = await db.meetings.get(meeting.id)
      if (updated) setMeeting(updated)
      setDeletedSegments(new Set())
      setTab('summary')
    } catch (err) {
      console.error('Regenerate error:', err)
      alert('重新生成失敗，請再試一次')
    }

    setRegenerating(false)
  }

  if (!meeting) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <p className="text-text-dim">載入中...</p>
      </div>
    )
  }

  const handleExportPPTX = async () => {
    setExporting(true)
    try {
      const blob = await exportPPTX(meeting)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${meeting.title}.pptx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export error:', err)
      alert('匯出失敗')
    }
    setExporting(false)
  }

  const handleExportTranscript = () => {
    if (!meeting.transcriptFull) return
    const blob = new Blob([meeting.transcriptFull], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${meeting.title}-逐字稿.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const tabs: { key: Tab; label: string; icon: typeof FileText }[] = [
    { key: 'summary', label: '摘要', icon: List },
    { key: 'transcript', label: '逐字稿', icon: FileText },
    { key: 'slides', label: '簡報', icon: Presentation },
  ]

  return (
    <div className="animate-fadeIn flex flex-col min-h-dvh max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-surface-light">
        <button onClick={() => navigate('/')} className="text-text-dim hover:text-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-sm truncate">{meeting.title}</h1>
          <div className="flex items-center gap-3 text-text-dim text-xs mt-0.5">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {meeting.audioDuration ? formatTime(meeting.audioDuration) : '--:--'}
            </span>
            <span className="flex items-center gap-1">
              <Image className="w-3 h-3" />
              {meeting.photos.length} 張
            </span>
            <span>{new Date(meeting.createdAt).toLocaleDateString('zh-TW')}</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-surface-light">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold transition-colors ${
              tab === t.key ? 'text-gold border-b-2 border-gold' : 'text-text-dim'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'summary' && (
          <div className="space-y-4">
            {meeting.summaryKeyPoints?.length ? (
              <>
                <h3 className="font-bold text-gold text-sm">重點摘要</h3>
                <ul className="space-y-2">
                  {meeting.summaryKeyPoints.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-gold flex-shrink-0">•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-text-dim text-sm">無摘要資料</p>
            )}

            {meeting.summaryActionItems?.length ? (
              <>
                <h3 className="font-bold text-gold text-sm mt-6">待辦事項</h3>
                <ul className="space-y-2">
                  {meeting.summaryActionItems.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-gold flex-shrink-0">☐</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {meeting.summaryRaw && (
              <>
                <h3 className="font-bold text-gold text-sm mt-6">完整摘要</h3>
                <p className="text-sm text-text-dim whitespace-pre-wrap">{meeting.summaryRaw}</p>
              </>
            )}
          </div>
        )}

        {tab === 'transcript' && (
          <div className="space-y-1">
            {meeting.transcriptSegments?.length ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-text-dim">
                    {deletedSegments.size > 0 && (
                      <span className="text-rec">{deletedSegments.size} 段已標記刪除</span>
                    )}
                  </p>
                  <button onClick={handleExportTranscript} className="text-xs text-gold flex items-center gap-1">
                    <Download className="w-3 h-3" /> 儲存全文
                  </button>
                </div>
                {meeting.transcriptSegments.map((seg, i) => {
                  const isPhotoMoment = meeting.photos.some(p => Math.abs(p.timestamp - seg.start) < 5)
                  const isDeleted = deletedSegments.has(i)
                  return (
                    <div
                      key={i}
                      className={`flex gap-2 text-sm py-2 px-2 rounded transition-all ${
                        isDeleted
                          ? 'bg-red-500/10 opacity-40'
                          : isPhotoMoment
                            ? 'bg-gold/10'
                            : 'hover:bg-surface'
                      }`}
                    >
                      <span className="text-text-dim text-xs font-mono flex-shrink-0 w-12 pt-0.5">
                        [{formatTime(seg.start)}]
                      </span>
                      <span className={`flex-1 ${isDeleted ? 'line-through' : ''}`}>{seg.text}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isPhotoMoment && <span className="text-gold text-xs">📷</span>}
                        {isDeleted ? (
                          <button onClick={() => undoDelete(i)} className="text-xs text-blue-400 px-1">復原</button>
                        ) : (
                          <button onClick={() => deleteSegment(i)} className="text-text-dim hover:text-rec p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </>
            ) : meeting.transcriptFull ? (
              <p className="text-sm whitespace-pre-wrap">{meeting.transcriptFull}</p>
            ) : (
              <p className="text-text-dim text-sm">無逐字稿資料</p>
            )}
          </div>
        )}

        {tab === 'slides' && (
          <div className="space-y-4">
            {meeting.slides?.length ? (
              meeting.slides.map((slide, i) => {
                const photo = meeting.photos.find(p => p.id === slide.photoId)
                return (
                  <div key={i} className="bg-surface rounded-xl overflow-hidden">
                    {photo && (
                      <img
                        src={URL.createObjectURL(photo.blob)}
                        className="w-full aspect-video object-cover"
                        alt={`Slide ${i + 1}`}
                      />
                    )}
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-text-dim font-mono">{formatTime(slide.timestamp)}</span>
                        <span className="text-xs text-gold font-bold">Slide {i + 1}</span>
                      </div>
                      {slide.aiCaption && (
                        <p className="text-sm">{slide.aiCaption}</p>
                      )}
                    </div>
                  </div>
                )
              })
            ) : meeting.photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {meeting.photos.map((p, i) => (
                  <img
                    key={p.id}
                    src={URL.createObjectURL(p.blob)}
                    className="w-full aspect-video object-cover rounded-lg"
                    alt={`Photo ${i + 1}`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-text-dim text-sm">沒有拍攝投影片</p>
            )}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="p-4 border-t border-surface-light space-y-2">
        {/* Regenerate button — shown when segments are deleted */}
        {deletedSegments.size > 0 && tab === 'transcript' && (
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="w-full py-3 bg-rec/20 text-rec font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <RefreshCw className={`w-5 h-5 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? '重新生成中...' : `刪除 ${deletedSegments.size} 段並重新生成摘要`}
          </button>
        )}

        <button
          onClick={handleExportPPTX}
          disabled={exporting || !meeting.slides?.length}
          className="w-full py-3 bg-gold text-navy font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Download className="w-5 h-5" />
          {exporting ? '匯出中...' : '匯出 PPTX 簡報'}
        </button>
      </div>
    </div>
  )
}
