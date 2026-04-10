import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Mic, Image, Clock, Trash2 } from 'lucide-react'
import { db, type Meeting } from '../services/db'

export default function Home() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    db.meetings.orderBy('createdAt').reverse().toArray().then(setMeetings)
  }, [])

  const deleteMeeting = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('確定要刪除這場會議？')) {
      await db.meetings.delete(id)
      setMeetings(m => m.filter(x => x.id !== id))
    }
  }

  const formatDuration = (sec?: number) => {
    if (!sec) return '--:--'
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const statusBadge = (status: Meeting['status']) => {
    switch (status) {
      case 'recording': return <span className="text-rec text-xs font-bold">錄製中</span>
      case 'processing': return <span className="text-gold text-xs font-bold">處理中</span>
      case 'done': return <span className="text-success text-xs font-bold">完成</span>
      case 'error': return <span className="text-red-400 text-xs font-bold">錯誤</span>
    }
  }

  return (
    <div className="animate-fadeIn flex flex-col min-h-dvh p-4 max-w-lg mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pt-2">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gold">Repeater</h1>
          <p className="text-text-dim text-sm">你去聽，Repeater 幫你重播</p>
        </div>
      </div>

      {/* Meeting list */}
      {meetings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-full bg-surface flex items-center justify-center mb-4">
            <Mic className="w-10 h-10 text-text-dim" />
          </div>
          <p className="text-text-dim mb-2">還沒有會議紀錄</p>
          <p className="text-text-dim text-sm">按下面的 + 開始你的第一場</p>
        </div>
      ) : (
        <div className="flex-1 space-y-3">
          {meetings.map(m => (
            <div
              key={m.id}
              onClick={() => m.status === 'done' ? navigate(`/meeting/${m.id}`) : null}
              className={`bg-surface rounded-xl p-4 flex items-center gap-4 ${m.status === 'done' ? 'cursor-pointer hover:bg-surface-light active:scale-[0.98]' : ''} transition-all`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-bold text-sm truncate">{m.title}</p>
                  {statusBadge(m.status)}
                </div>
                <div className="flex items-center gap-3 text-text-dim text-xs">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(m.audioDuration)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Image className="w-3 h-3" />
                    {m.photos.length} 張
                  </span>
                  <span>{new Date(m.createdAt).toLocaleDateString('zh-TW')}</span>
                </div>
              </div>
              <button
                onClick={(e) => deleteMeeting(m.id, e)}
                className="p-2 text-text-dim hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* FAB */}
      <div className="sticky bottom-6 flex justify-center mt-4">
        <button
          onClick={() => navigate('/meeting/new')}
          className="w-16 h-16 rounded-full bg-gold text-navy flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
        >
          <Plus className="w-8 h-8" strokeWidth={3} />
        </button>
      </div>
    </div>
  )
}
